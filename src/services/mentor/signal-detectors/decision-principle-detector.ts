import type { DetectorInput, DetectorResult } from './types';

/**
 * Decision / Principle Detector
 *
 * 识别决策、约束、原则、边界类表达。
 *
 * L1 主路径：embedding prototype 匹配 'decision' / 'principle' 类型
 * L0 strong hint：必须/禁止/原则 等词只能加分，不能是唯一入口
 * 语义相近表达必须通过 embedding prototype 或 knowledge type candidate 覆盖。
 */

const DECISION_HINTS = ['决定', '以后', '必须', '禁止', '不要', '原则', '边界', '不做', '只做'];

export function detectDecisionPrinciple(input: DetectorInput): DetectorResult | null {
  const text = input.currentText.trim();
  if (!text || text.length < 8) return null;

  // ── L0 hints（仅用于加分，不独立触发）──
  const matchedHints = DECISION_HINTS.filter(kw => text.includes(kw));
  const hasL0Hint = matchedHints.length > 0;

  // ── L1 主路径：prototype 匹配 ──
  const decisionMatch = input.prototypeMatches?.find(m => m.type === 'decision');
  const principleMatch = input.prototypeMatches?.find(m => m.type === 'principle');

  const bestProtoMatch = [decisionMatch, principleMatch]
    .filter((m): m is NonNullable<typeof m> => m != null)
    .sort((a, b) => b.score - a.score)[0];

  if (bestProtoMatch && bestProtoMatch.score >= 0.65) {
    const isPrinciple = bestProtoMatch.type === 'principle';
    const signalType = isPrinciple ? 'principle_like_text' : 'decision_like_text';
    const baseConfidence = 0.60 + bestProtoMatch.score * 0.35;

    // L0 hints 加分
    let l0Bonus = 0;
    if (hasL0Hint) l0Bonus += Math.min(0.08, matchedHints.length * 0.02);

    return {
      signalType: signalType as DetectorResult['signalType'],
      targetId: input.documentPath,
      targetType: 'document',
      confidence: Math.min(0.92, baseConfidence + l0Bonus),
      evidenceIds: [],
      detector: 'embedding',
      reason: `语义匹配到「${bestProtoMatch.type}」类型（相似度 ${Math.round(bestProtoMatch.score * 100)}%）${hasL0Hint ? `，L0 关键词「${matchedHints.join('、')}」加分` : ''}`,
      level: 'L1',
      suggestedIntent: 'classify',
      suggestedShortMessage: isPrinciple
        ? '这段内容像一个产品原则或约束'
        : '这段内容像一个决策判断',
      suggestedActions: [
        {
          id: 'save_soft_type',
          label: isPrinciple ? '保存为 Principle' : '保存为 Decision',
          kind: 'save_soft_type',
          payload: { softType: isPrinciple ? 'principle' : 'decision' },
          requiresUserConfirmation: true,
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

  // ── L0 兜底：有提示词但无 L1 确认 → 低置信 inbox/silent ──
  if (hasL0Hint) {
    const isPrinciple = ['原则', '边界', '不做', '只做'].some(kw => text.includes(kw));
    const signalType = isPrinciple ? 'principle_like_text' : 'decision_like_text';
    // L0 置信度封顶 0.55，确保不伪装成高置信
    const confidence = Math.min(0.55, 0.38 + matchedHints.length * 0.04);

    return {
      signalType: signalType as DetectorResult['signalType'],
      targetId: input.documentPath,
      targetType: 'document',
      confidence,
      evidenceIds: [],
      detector: 'rule',
      reason: `L0 关键词「${matchedHints.join('、')}」（无语义确认，低置信）`,
      level: 'L0',
      suggestedIntent: 'classify',
      suggestedShortMessage: isPrinciple
        ? '检测到约束类表达（待语义确认）'
        : '检测到决策类表达（待语义确认）',
      suggestedActions: [
        {
          id: 'start_background_job',
          label: '语义确认',
          kind: 'start_background_job',
          payload: { jobType: 'deep_document_review' },
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
