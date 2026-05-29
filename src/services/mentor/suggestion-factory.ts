import type { ClassifierResult } from './fast-classifier';
import type { CreateMentorSuggestionParams, MentorAction, MentorSuggestionIntent } from './mentor-suggestions';

/**
 * Suggestion Factory
 *
 * 将 ClassifierResult 转换为 CreateMentorSuggestionParams。
 * 强制约束：
 * - shortMessage 12-28 个中文字
 * - inline 最多 2 个 action
 * - 所有写入 review/soft type/document 的 action 必须 requiresUserConfirmation=true
 */

export interface SuggestionFactoryInput {
  classifierResult: ClassifierResult;
  vaultPath: string;
  vaultId: string;
  sourceEventId?: string;
  sourceSignalIds: string[];
}

/** action kind 分类：是否涉及写入 */
const WRITE_ACTIONS = new Set([
  'save_soft_type',
  'create_document',
  'append_to_document',
  'generate_context_pack',
  'create_review_item',
]);

function normalizeShortMessage(raw: string): string {
  const cleaned = raw.replace(/[「」""''『』]/g, '').trim();
  const chineseChars = cleaned.replace(/[^一-鿿]/g, '');
  const cnLen = chineseChars.length;

  if (cnLen < 12) {
    return cleaned.length >= 12 ? cleaned : `AI Mentor：${cleaned}`;
  }
  if (cnLen > 28) {
    return chineseChars.slice(0, 25) + '...';
  }
  return cleaned;
}

function normalizeActions(actions: MentorAction[]): MentorAction[] {
  // 去重 + ≤ 2 个 + 写入类强制确认
  const seen = new Set<string>();
  const result: MentorAction[] = [];
  for (const a of actions) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    result.push({
      ...a,
      requiresUserConfirmation: WRITE_ACTIONS.has(a.kind) ? true : a.requiresUserConfirmation,
    });
  }
  return result.slice(0, 2);
}

function mapIntent(signalType: string): MentorSuggestionIntent {
  const map: Record<string, MentorSuggestionIntent> = {
    question_detected: 'clarify',
    decision_like_text: 'classify',
    principle_like_text: 'classify',
    missing_conclusion: 'summarize',
    context_pack_mismatch: 'review',
    paragraph_idle: 'extract',
    possible_duplicate: 'review',
    orphan_document: 'archive',
  };
  return map[signalType] ?? 'review';
}

export function buildSuggestionParams(input: SuggestionFactoryInput): CreateMentorSuggestionParams {
  const { classifierResult, vaultPath, vaultId, sourceEventId, sourceSignalIds } = input;
  const { detectorResult, surface, score } = classifierResult;

  const intent = detectorResult.suggestedIntent || mapIntent(detectorResult.signalType);
  const shortMessage = normalizeShortMessage(detectorResult.suggestedShortMessage);
  const actions = normalizeActions(detectorResult.suggestedActions);

  const message = [
    detectorResult.reason,
    `级别：${detectorResult.level}，置信度：${Math.round(score * 100)}%`,
  ].join('。');

  if (classifierResult.score < 0.45) {
    return {
      vaultPath, vaultId,
      sourceEventId: sourceEventId ?? null,
      sourceSignalIds,
      sourceJobId: null,
      targetId: detectorResult.targetId,
      targetType: detectorResult.targetType,
      intent: 'review',
      priority: 'low',
      surface: 'silent',
      message: '',
      shortMessage: '',
      evidenceIds: [],
      actions: [],
      status: 'pending',
      confidence: classifierResult.score,
    };
  }

  return {
    vaultPath, vaultId,
    sourceEventId: sourceEventId ?? null,
    sourceSignalIds,
    sourceJobId: null,
    targetId: detectorResult.targetId,
    targetType: detectorResult.targetType,
    intent,
    priority: score >= 0.78 ? 'high' : score >= 0.68 ? 'medium' : 'low',
    surface,
    message,
    shortMessage,
    evidenceIds: detectorResult.evidenceIds,
    actions,
    status: 'pending',
    confidence: score,
  };
}

export function generateSuggestionId(): string {
  return `ms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
