import type { DetectorInput, DetectorResult } from './types';

/**
 * Semantic Type Detector
 *
 * 基于当前段落/选区的 embedding 与 soft type prototypes 比较，
 * 识别 question / decision / principle / action / requirement / risk / review。
 * 必须能在没有固定关键词的情况下触发。
 *
 * L1 主路径：embedding prototype similarity
 * L0 兜底：knowledge type candidates（来自 metadataService，非关键词匹配）
 * 无 L1/L0 时返回 null，不生成伪高置信结果
 */

const TYPE_SIGNAL_MAP: Record<string, string> = {
  question: 'question_detected',
  decision: 'decision_like_text',
  principle: 'principle_like_text',
  action: 'paragraph_idle',
  requirement: 'principle_like_text',
  risk: 'possible_duplicate',
  review: 'missing_conclusion',
};

const TYPE_INTENT_MAP: Record<string, string> = {
  question: 'clarify',
  decision: 'classify',
  principle: 'classify',
  action: 'extract',
  requirement: 'review',
  risk: 'review',
  review: 'review',
};

const TYPE_SHORT_MESSAGE_MAP: Record<string, string> = {
  question: '这段内容像是在提出一个待澄清的问题',
  decision: '这像一个决策判断，需要确认',
  principle: '这段内容像一个产品原则或约束',
  action: '检测到待执行事项，要记录下来吗',
  requirement: '这段内容像一条需求或要求',
  risk: '这里提到了一些潜在风险',
  review: '这段内容建议复查确认',
};

export function detectSemanticType(input: DetectorInput): DetectorResult | null {
  const { currentText, prototypeMatches, knowledgeTypeCandidates } = input;

  if (!currentText || currentText.trim().length < 8) return null;

  // ── L1 主路径：prototype 相似度匹配 ──
  if (prototypeMatches && prototypeMatches.length > 0) {
    const best = prototypeMatches[0];

    if (best.score >= 0.65) {
      const signalType = TYPE_SIGNAL_MAP[best.type] || 'paragraph_idle';
      const intent = TYPE_INTENT_MAP[best.type] || 'review';
      const baseMessage = TYPE_SHORT_MESSAGE_MAP[best.type] || 'AI Mentor 检测到值得注意的内容';

      // 嵌入相似度 → 置信度映射
      const confidence = Math.min(0.90, 0.60 + best.score * 0.35);

      return {
        signalType: signalType as DetectorResult['signalType'],
        targetId: input.documentPath,
        targetType: 'document',
        confidence,
        evidenceIds: [],
        detector: 'embedding',
        reason: `语义匹配到「${best.type}」类型（相似度 ${Math.round(best.score * 100)}%）`,
        level: 'L1',
        suggestedIntent: intent as DetectorResult['suggestedIntent'],
        suggestedShortMessage: baseMessage,
        suggestedActions: [
          {
            id: 'open_platter_detail',
            label: '查看详情',
            kind: 'open_platter_detail',
            payload: { source: 'semantic_type_detector', matchedType: best.type },
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
        prototypeMatches,
      };
    }

    // prototype 命中但低于阈值：降级到 L0 knowledge type 路径
  }

  // ── L0 兜底：knowledge type candidates（来自 metadataService，非关键词）──
  if (knowledgeTypeCandidates && knowledgeTypeCandidates.length > 0) {
    const relevant = knowledgeTypeCandidates.filter(
      c => c.document_path === input.documentPath
    );
    if (relevant.length === 0) return null;

    // 取最高置信候选
    const best = relevant.reduce((a, b) => a.confidence > b.confidence ? a : b);

    if (best.confidence < 0.55) return null;

    // Knowledge type 到 semantic type 的映射
    const ktToSemantic: Record<string, string> = {
      constraint: 'principle',
      decision: 'decision',
      question: 'question',
      task: 'action',
      requirement: 'requirement',
      risk: 'risk',
    };
    const semType = ktToSemantic[best.knowledge_type] || 'review';
    const signalType = TYPE_SIGNAL_MAP[semType] || 'paragraph_idle';
    const baseMessage = TYPE_SHORT_MESSAGE_MAP[semType] || 'AI Mentor 检测到值得注意的内容';
    const confidence = Math.min(0.65, 0.50 + best.confidence * 0.20);

    return {
      signalType: signalType as DetectorResult['signalType'],
      targetId: input.documentPath,
      targetType: 'document',
      confidence,
      evidenceIds: best.chunk_id != null ? [String(best.chunk_id)] : [],
      detector: 'soft_type',
      reason: `Knowledge type 候选「${best.label}」置信度 ${Math.round(best.confidence * 100)}%`,
      level: 'L0',
      suggestedIntent: ktToSemantic[best.knowledge_type] === 'question' ? 'clarify'
        : ktToSemantic[best.knowledge_type] === 'action' ? 'extract'
        : 'classify',
      suggestedShortMessage: baseMessage,
      suggestedActions: [
        {
          id: 'open_platter_detail',
          label: '查看详情',
          kind: 'open_platter_detail',
          payload: { source: 'semantic_type_knowledge_candidate' },
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
      prototypeMatches: input.prototypeMatches,
    };
  }

  return null;
}
