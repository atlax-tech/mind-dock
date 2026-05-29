import type { DetectorInput, DetectorResult } from './types';

/**
 * Question Intent Detector
 *
 * 识别"用户正在提出待澄清问题"的语义意图。
 *
 * L1 主路径：embedding prototype 匹配 'question' 类型（来自 prototypeMatches）
 * L0 弱信号：问号 `?/？` + 疑问短语 → 只能加分到 0.55，生成 inbox/silent 建议
 * 关键词不能是唯一入口；L1 可以独立触发。
 */

const QUESTION_PHRASES = [
  '为什么', '是否', '怎么', '怎么办',
  '有没有可能', '我该不该', '能不能', '应不应该',
  '可不可以', '好不好', '需不需要', '会不会',
  '是不是', '应该如何', '要不要', '值得吗',
];

export function detectQuestionIntent(input: DetectorInput): DetectorResult | null {
  const text = input.currentText.trim();
  if (!text || text.length < 6) return null;

  const hasQuestionMark = /[?？]/.test(text);
  const matchedPhrase = QUESTION_PHRASES.find(phrase => text.includes(phrase));

  // ── L1 主路径：prototype 匹配 ──
  const protoMatch = input.prototypeMatches?.find(m => m.type === 'question');
  if (protoMatch && protoMatch.score >= 0.62) {
    const confidence = Math.min(0.88, 0.62 + protoMatch.score * 0.30);

    // L0 弱信号加分
    let l0Bonus = 0;
    if (hasQuestionMark) l0Bonus += 0.03;
    if (matchedPhrase) l0Bonus += 0.04;

    return {
      signalType: 'question_detected',
      targetId: input.documentPath,
      targetType: 'document',
      confidence: Math.min(0.90, confidence + l0Bonus),
      evidenceIds: [],
      detector: 'embedding',
      reason: `语义匹配到 question 类型（相似度 ${Math.round(protoMatch.score * 100)}%）${matchedPhrase ? `，匹配疑问短语「${matchedPhrase}」` : ''}`,
      level: 'L1',
      suggestedIntent: 'clarify',
      suggestedShortMessage: '这里似乎在提出一个待澄清的问题',
      suggestedActions: [
        {
          id: 'create_review_item',
          label: '加入复查',
          kind: 'create_review_item',
          payload: { source: 'question_intent' },
          requiresUserConfirmation: false,
        },
        {
          id: 'dismiss',
          label: '忽略',
          kind: 'dismiss',
          payload: {},
          requiresUserConfirmation: false,
        },
      ],
    };
  }

  // ── L0 弱信号兜底：有问号或疑问短语，但无 L1 确认 ──
  if (hasQuestionMark || matchedPhrase) {
    const confidence = hasQuestionMark && matchedPhrase ? 0.55 : 0.45;

    return {
      signalType: 'question_detected',
      targetId: input.documentPath,
      targetType: 'document',
      confidence,
      evidenceIds: [],
      detector: 'rule',
      reason: [
        hasQuestionMark ? '检测到问号' : '',
        matchedPhrase ? `匹配疑问短语「${matchedPhrase}」` : '',
        '（L0 弱信号，无语义确认）',
      ].filter(Boolean).join('，'),
      level: 'L0',
      suggestedIntent: 'clarify',
      suggestedShortMessage: '这里可能有一个待澄清的问题',
      suggestedActions: [
        {
          id: 'create_review_item',
          label: '加入复查',
          kind: 'create_review_item',
          payload: { source: 'question_l0' },
          requiresUserConfirmation: false,
        },
        {
          id: 'dismiss',
          label: '忽略',
          kind: 'dismiss',
          payload: {},
          requiresUserConfirmation: false,
        },
      ],
    };
  }

  return null;
}
