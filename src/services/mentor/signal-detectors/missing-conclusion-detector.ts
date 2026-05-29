import type { DetectorInput, DetectorResult } from './types';

/**
 * Missing Conclusion Detector
 *
 * 基于文档结构、heading、frontmatter、最近编辑状态、summary/tags
 * 判断是否缺少结论/下一步。
 *
 * 不得只靠全文是否包含"结论/下一步"字样。
 * 判断依据：
 * - 文档字数是否超过阈值
 * - 文档是否没有 H2+ 的"结论/下一步/总结/决策/行动"section
 * - frontmatter 是否有 status/type（已标记为 final/decision 可降低置信度）
 * - 用户停顿是否足够久
 * - 文档是否有 summary/tags（有摘要说明已整理过）
 */

const CONCLUSION_SECTION_PATTERNS = [
  /^#{2,4}\s*(结论|总结|下一步|决策|行动|产出|输出)/,
  /^#{2,4}\s*(Conclusion|Decision|Action|Next\s*Steps|Output)/i,
];

const MIN_WORD_COUNT = 300;
const MIN_IDLE_MS = 5000;

/**
 * 检查文档是否有结论/下一步 section（基于 heading 结构）
 */
function hasConclusionSection(chunks: DetectorInput['documentChunks']): boolean {
  if (!chunks || chunks.length === 0) return false;
  return chunks.some(chunk => {
    if (!chunk.heading_path) return false;
    return CONCLUSION_SECTION_PATTERNS.some(pattern => pattern.test(chunk.heading_path!));
  });
}

export function detectMissingConclusion(input: DetectorInput): DetectorResult | null {
  // 文档字数不足
  if (input.documentWordCount < MIN_WORD_COUNT) return null;

  // 基于 heading 结构检查（非纯关键词匹配）
  const hasHeadingConclusion = hasConclusionSection(input.documentChunks);

  // frontmatter 中标记为 final/decision/done 状态
  const frontmatterStatus = input.frontmatter
    ? (input.frontmatter['status'] as string) || (input.frontmatter['type'] as string) || ''
    : '';
  const isFinalized = /final|decision|done|complete|resolved/i.test(frontmatterStatus);

  // 已有摘要说明文档已整理
  const hasSummary = !!(input.documentSummary && input.documentSummary.length > 10);

  // 有标签中已含结论性标签
  const hasConclusionTag = input.documentTags
    ? /结论|决策|已完成|final|done/i.test(input.documentTags)
    : false;

  // 不触发的情况
  if (hasHeadingConclusion || isFinalized || hasConclusionTag) return null;
  if (hasSummary && input.documentWordCount < 800) return null; // 短文档有摘要 → 足够

  // 停顿检查
  const idleMs = input.idleDurationMs ?? 0;
  if (idleMs < MIN_IDLE_MS) return null;

  // 计算置信度（基于文档状态，非关键词）
  let confidence = 0.62;
  if (input.documentWordCount > 1000) confidence += 0.06;
  if (input.documentWordCount > 3000) confidence += 0.05;
  if (idleMs > 10000) confidence += 0.04;
  if (!hasSummary) confidence += 0.05; // 无摘要更可能缺结论
  if (input.documentChunks && input.documentChunks.length > 5) confidence += 0.04;

  return {
    signalType: 'missing_conclusion',
    targetId: input.documentPath,
    targetType: 'document',
    confidence: Math.min(0.86, confidence),
    evidenceIds: [],
    detector: 'editor_state',
    reason: [
      `文档 ${input.documentWordCount} 字`,
      hasHeadingConclusion ? '已有结论 heading' : '无结论/下一步 heading',
      isFinalized ? 'frontmatter 已标记为 final' : '',
      hasSummary ? '已有摘要' : '缺少摘要',
      `已停顿 ${Math.round(idleMs / 1000)}s`,
    ].filter(Boolean).join('，'),
    level: 'L0',
    suggestedIntent: 'summarize',
    suggestedShortMessage: '这篇文档还缺一个结论',
    suggestedActions: [
      {
        id: 'suggest_conclusions',
        label: '补 3 个方向',
        kind: 'start_background_job',
        payload: { jobType: 'deep_document_review', action: 'suggest_conclusions' },
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
