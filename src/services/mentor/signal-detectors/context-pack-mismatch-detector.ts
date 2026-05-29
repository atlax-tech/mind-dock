import type { DetectorInput, DetectorResult } from './types';

/**
 * Context Pack Mismatch Detector
 *
 * 基于 Context Pack items 的 knowledge type 分布、来源 metadata、
 * output type、用户 intent 判断来源与输出目标是否不匹配。
 *
 * 不调用 AI，仅基于 knowledge type 分布做轻判断。
 */

const TYPE_COMPATIBILITY: Record<string, { match: string[]; mismatch: string[] }> = {
  prd: {
    match: ['requirement', 'decision'],
    mismatch: ['task', 'constraint'],
  },
  spec: {
    match: ['constraint', 'requirement'],
    mismatch: ['decision'],
  },
  dev_agent_prompt: {
    match: ['task', 'constraint', 'requirement'],
    mismatch: ['decision'],
  },
  checklist: {
    match: ['task', 'requirement'],
    mismatch: ['decision'],
  },
};

const OUTPUT_LABELS: Record<string, string> = {
  prd: 'PRD',
  spec: 'SPEC',
  dev_agent_prompt: 'Dev Agent Prompt',
  checklist: 'Checklist',
};

export interface MismatchContext {
  packName: string;
  packId: string;
  outputType: string;
  /** Pack items 的 knowledge type 分布 */
  sourceKnowledgeTypes: string[];
  /** 来源文档数量 */
  sourceDocumentCount: number;
}

export function detectContextPackMismatch(
  _input: DetectorInput,
  mismatchContext?: MismatchContext,
): DetectorResult | null {
  if (!mismatchContext) return null;

  const { outputType, sourceKnowledgeTypes, packId } = mismatchContext;

  const compat = TYPE_COMPATIBILITY[outputType];
  if (!compat) return null;

  if (sourceKnowledgeTypes.length === 0) return null;

  const matchCount = sourceKnowledgeTypes.filter(t => compat.match.includes(t)).length;
  const mismatchCount = sourceKnowledgeTypes.filter(t => compat.mismatch.includes(t)).length;
  const total = sourceKnowledgeTypes.length;

  // 大部分匹配，不触发
  if (mismatchCount === 0 && matchCount > 0) return null;

  const mismatchRatio = mismatchCount / total;
  if (mismatchRatio < 0.4) return null;

  const confidence = 0.55 + mismatchRatio * 0.30;

  return {
    signalType: 'context_pack_mismatch',
    targetId: packId,
    targetType: 'context_pack',
    confidence: Math.min(0.85, confidence),
    evidenceIds: [],
    detector: 'soft_type',
    reason: `Context Pack 来源 knowledge type [${sourceKnowledgeTypes.join(', ')}] 与输出类型 ${outputType} 不匹配（mismatch ${Math.round(mismatchRatio * 100)}%，共 ${total} 条来源文档）`,
    level: 'L0',
    // 进入 inbox，不 inline
    suggestedIntent: 'review',
    suggestedShortMessage: `这个上下文更适合${OUTPUT_LABELS[outputType] || outputType}输出`,
    suggestedActions: [
      {
        id: 'optimize_for_type',
        label: `按${OUTPUT_LABELS[outputType] || outputType}优化`,
        kind: 'start_background_job',
        payload: { jobType: 'context_pack_refine', outputType },
        requiresUserConfirmation: false,
      },
      {
        id: 'dismiss',
        label: '保持原样',
        kind: 'dismiss',
        payload: {},
        requiresUserConfirmation: false,
      },
    ],
  };
}
