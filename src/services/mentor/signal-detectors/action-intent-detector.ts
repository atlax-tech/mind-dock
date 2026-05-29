import type { DetectorInput, DetectorResult } from './types';

/**
 * Action Intent Detector
 *
 * 识别待办、验收、修复、实现、检查、复查等行动意图。
 *
 * L1 主路径：embedding prototype 匹配 'action' 类型
 * L0 strong hint：TODO/下一步/验收 只能加分，不能是唯一触发条件
 */

const ACTION_HINTS = [
  'TODO', '下一步', '需要', '验收', '测试', '修复',
  '部署', '发布', '检查', '确认', '添加', '删除',
  '重构', '优化', '实现', '完成', '验证', '更新',
];

const STRONG_ACTION_PATTERNS = [/TODO[:\s]/i, /下一步[：:]/, /验收[：:]/];

export function detectActionIntent(input: DetectorInput): DetectorResult | null {
  const text = input.currentText.trim();
  if (!text || text.length < 8) return null;

  // ── L0 hints（仅用于加分或弱信号）──
  const matchedHints = ACTION_HINTS.filter(kw => {
    if (kw.length <= 5) {
      return new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text);
    }
    return text.includes(kw);
  });
  const hasStrongPattern = STRONG_ACTION_PATTERNS.some(p => p.test(text));
  const hasL0Hint = matchedHints.length > 0 || hasStrongPattern;

  // ── L1 主路径：prototype 匹配 ──
  const actionMatch = input.prototypeMatches?.find(m => m.type === 'action');
  if (actionMatch && actionMatch.score >= 0.65) {
    let confidence = 0.62 + actionMatch.score * 0.30;
    // L0 加分
    if (hasStrongPattern) confidence += 0.05;
    if (matchedHints.length >= 2) confidence += 0.03;

    return {
      signalType: 'paragraph_idle',
      targetId: input.documentPath,
      targetType: 'document',
      confidence: Math.min(0.90, confidence),
      evidenceIds: [],
      detector: 'embedding',
      reason: `语义匹配到 action 类型（相似度 ${Math.round(actionMatch.score * 100)}%）${hasL0Hint ? `，L0 行动词加分` : ''}`,
      level: 'L1',
      suggestedIntent: 'extract',
      suggestedShortMessage: '检测到待执行事项，要记录下来吗',
      suggestedActions: [
        {
          id: 'create_review_item',
          label: '创建复查项',
          kind: 'create_review_item',
          payload: { source: 'action_intent' },
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

  // ── L0 兜底：有行动提示词但无 L1 确认 → 低置信 ──
  if (hasL0Hint) {
    const confidence = Math.min(0.55, 0.38 + matchedHints.length * 0.03 + (hasStrongPattern ? 0.06 : 0));

    return {
      signalType: 'paragraph_idle',
      targetId: input.documentPath,
      targetType: 'document',
      confidence,
      evidenceIds: [],
      detector: 'rule',
      reason: `L0 行动词「${matchedHints.slice(0, 3).join('、')}」（无语义确认，低置信）`,
      level: 'L0',
      suggestedIntent: 'extract',
      suggestedShortMessage: '检测到行动意图（待语义确认）',
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
