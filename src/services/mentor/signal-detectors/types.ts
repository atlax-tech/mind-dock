import type { MentorSignalType } from '@/services/mentor/mentor-signals';
import type { MentorSuggestionIntent, MentorAction } from '@/services/mentor/mentor-suggestions';
import type { KnowledgeTypeCandidate } from '@/services/index/metadata';
import type { PersonalizationWeights } from '@/services/index/personalization';
import type { ChunkResult } from '@/services/index/chunking';

/** 检测器输入：只包含必要上下文，不包含整库全文 */
export interface DetectorInput {
  /** 当前段落或选区文本（≤2000 字） */
  currentText: string;
  /** 当前文档路径 */
  documentPath: string;
  /** 文档字数 */
  documentWordCount: number;
  /** 文档是否有结论/下一步/Decision/Action 标识（基于结构判断，非纯关键词） */
  hasConclusion: boolean;
  /** 用户停顿时间（ms） */
  idleDurationMs?: number;
  /** soft type / knowledge type 候选（来自 metadataService） */
  knowledgeTypeCandidates?: KnowledgeTypeCandidate[];
  /** 个性化权重（来自 personalizationService） */
  personalizationWeights?: PersonalizationWeights;
  /** 当前文档 chunks（用于结构分析） */
  documentChunks?: ChunkResult[];
  /** 文档前端元数据 */
  frontmatter?: Record<string, unknown> | null;
  /** 文档摘要 */
  documentSummary?: string | null;
  /** 文档标签 */
  documentTags?: string | null;

  // ── L1 embedding 相关 ──
  /** 当前段落/选区的 embedding 向量（由外部 AI Runtime 生成） */
  textEmbedding?: number[];
  /** prototype 相似度匹配结果 */
  prototypeMatches?: { type: string; score: number }[];
  /** 当前文档关联 chunk 的 embedding 列表 */
  chunkEmbeddings?: { chunkId: number; embedding: number[] }[];
}

/** 检测器输出：一个低成本信号检测结果 */
export interface DetectorResult {
  /** 信号类型 */
  signalType: MentorSignalType;
  /** 目标 ID（文档路径等） */
  targetId: string;
  /** 目标类型 */
  targetType: string;
  /** 检测器自身置信度 0-1 */
  confidence: number;
  /** 证据 ID 列表（chunk ids） */
  evidenceIds: string[];
  /** 检测器类型 */
  detector: 'rule' | 'embedding' | 'fts' | 'editor_state' | 'soft_type';
  /** 判定理由（中文，供调试） */
  reason: string;
  /** 检测级别：L0 仅规则 / L1 含语义 */
  level: 'L0' | 'L1';
  /** 建议的 intent */
  suggestedIntent: MentorSuggestionIntent;
  /** 建议的短消息（12-28 个中文字） */
  suggestedShortMessage: string;
  /** 建议的 actions（最多 2 个） */
  suggestedActions: MentorAction[];
  /** prototype 匹配结果（如果有） */
  prototypeMatches?: { type: string; score: number }[];
}

/** 检测器函数签名 */
export type SignalDetector = (input: DetectorInput) => DetectorResult | null;
