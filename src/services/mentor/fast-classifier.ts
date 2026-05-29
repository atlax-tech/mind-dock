import type { DetectorResult } from './signal-detectors/types';
import type { MentorSuggestionSurface } from '@/services/mentor/mentor-suggestions';
import type { KnowledgeTypeCandidate } from '@/services/index/metadata';
import type { PersonalizationWeights } from '@/services/index/personalization';
import type { ChunkResult } from '@/services/index/chunking';

/**
 * Fast Classifier
 *
 * 不调用 reasoning，不使用 chat()。
 * 以 embedding + prototype similarity 为主判断来源，
 * 规则/关键词只作为 L0 弱加分。
 *
 * 评分公式：
 *   score = embeddingPrototypeScore * 0.40
 *         + semanticContextScore  * 0.20
 *         + ruleHintScore         * 0.10
 *         + currentContextScore   * 0.15
 *         + historicalConfirmationScore * 0.10
 *         + recencyScore          * 0.05
 *
 * 阈值：
 *   < 0.60  → 只记录 signal，不生成 suggestion
 *   0.60-0.78 → surface = 'inbox'
 *   >= 0.78 → 允许 delivery policy 选择 'inline'
 *   >= 0.78 仍不等于一定弹 bubble；Step 4 决定最终 surface
 */

export interface ClassifierContext {
  documentPath: string;
  documentWordCount: number;
  userIsTyping: boolean;
  knowledgeTypeCandidates?: KnowledgeTypeCandidate[];
  personalizationWeights?: PersonalizationWeights;
  documentChunks?: ChunkResult[];
}

export interface ClassifierResult {
  score: number;
  breakdown: {
    embeddingPrototypeScore: number;
    semanticContextScore: number;
    ruleHintScore: number;
    currentContextScore: number;
    historicalConfirmationScore: number;
    recencyScore: number;
  };
  surface: MentorSuggestionSurface;
  allowInline: boolean;
  detectorResult: DetectorResult;
}

export function classifyDetectorResult(
  result: DetectorResult,
  context: ClassifierContext,
): ClassifierResult {
  // 1. Embedding + prototype 相似度（主判断来源）
  const embeddingPrototypeScore = computeEmbeddingPrototypeScore(result);

  // 2. 语义上下文分
  const semanticContextScore = computeSemanticContextScore(result, context);

  // 3. 规则提示分（L0 弱信号）
  const ruleHintScore = computeRuleHintScore(result, context);

  // 4. 当前文档上下文
  const currentContextScore = computeCurrentContextScore(result, context);

  // 5. 历史确认分
  const historicalConfirmationScore = computeHistoricalConfirmationScore(context);

  // 6. 新鲜度
  const recencyScore = computeRecencyScore(context);

  const score =
    embeddingPrototypeScore * 0.40 +
    semanticContextScore * 0.20 +
    ruleHintScore * 0.10 +
    currentContextScore * 0.15 +
    historicalConfirmationScore * 0.10 +
    recencyScore * 0.05;

  let clampedScore = Math.min(0.99, Math.max(0.10, score));

  // L1 语义确认不应被总分公式过度稀释，否则 delivery policy 永远拿不到 inline 候选。
  if (result.level === 'L1' && result.detector === 'embedding' && result.confidence >= 0.78) {
    clampedScore = Math.max(clampedScore, result.confidence);
  } else if (result.level === 'L1' && result.detector === 'embedding' && result.confidence >= 0.68) {
    clampedScore = Math.max(clampedScore, 0.68);
  }

  const strongLocalRule = isStrongLocalRuleResult(result);
  if (strongLocalRule) {
    clampedScore = Math.max(clampedScore, 0.68);
  }

  let surface: MentorSuggestionSurface;
  let allowInline: boolean;

  if (clampedScore < 0.45) {
    surface = 'silent';
    allowInline = false;
  } else if (clampedScore < 0.68) {
    surface = 'inbox';
    allowInline = false;
  } else {
    surface = 'inbox';
    allowInline = true;
  }

  // L0 纯规则结果：有 knowledge type candidates 支持时允许 inline
  if (result.level === 'L0' && result.detector === 'rule') {
    if (!strongLocalRule && !(result.prototypeMatches && result.prototypeMatches.length > 0)) {
      allowInline = false;
      if (surface !== 'silent') surface = 'inbox';
    }
  }

  // review / resolve_conflict 不进 inline
  if (result.suggestedIntent === 'review' || result.suggestedIntent === 'resolve_conflict') {
    surface = 'inbox';
    allowInline = false;
  }

  return {
    score: clampedScore,
    breakdown: {
      embeddingPrototypeScore,
      semanticContextScore,
      ruleHintScore,
      currentContextScore,
      historicalConfirmationScore,
      recencyScore,
    },
    surface,
    allowInline,
    detectorResult: result,
  };
}

function isStrongLocalRuleResult(result: DetectorResult): boolean {
  if (result.level !== 'L0' || result.detector !== 'rule') return false;
  if (!['clarify', 'classify', 'extract'].includes(result.suggestedIntent)) return false;
  if (!['question_detected', 'decision_like_text', 'principle_like_text', 'paragraph_idle'].includes(result.signalType)) return false;
  return result.confidence >= 0.45;
}

/** embedding / prototype similarity 得分：L1 主判断来源 */
function computeEmbeddingPrototypeScore(result: DetectorResult): number {
  if (result.level === 'L1' && result.detector === 'embedding') {
    return result.confidence; // L1 路径的置信度本身就是基于 embedding 的
  }
  // L0 结果 embedding 分低
  return 0.35;
}

/** 语义上下文得分：基于 knowledge type candidates */
function computeSemanticContextScore(
  _result: DetectorResult,
  context: ClassifierContext,
): number {
  const candidates = context.knowledgeTypeCandidates ?? [];
  if (candidates.length === 0) return 0.50;

  const relevant = candidates.filter(c => c.document_path === context.documentPath);
  if (relevant.length === 0) return 0.50;

  const avgConf = relevant.reduce((sum, c) => sum + c.confidence, 0) / relevant.length;
  return 0.45 + avgConf * 0.35;
}

/** 规则提示分：L0 弱信号，只加分不扣分 */
function computeRuleHintScore(
  result: DetectorResult,
  _context: ClassifierContext,
): number {
  if (result.detector === 'rule') {
    return Math.min(0.55, result.confidence * 0.80);
  }
  if (result.detector === 'editor_state') {
    return Math.min(0.60, result.confidence * 0.90);
  }
  return 0.45;
}

function computeCurrentContextScore(
  _result: DetectorResult,
  context: ClassifierContext,
): number {
  let score = 0.50;
  if (context.documentWordCount > 100 && context.documentWordCount < 10000) {
    score += 0.08;
  }
  if (context.documentWordCount > 2000) {
    score += 0.10;
  }
  if (!context.userIsTyping) {
    score += 0.12;
  }
  if (context.documentChunks && context.documentChunks.length > 3) {
    score += 0.06;
  }
  return Math.min(0.90, score);
}

function computeHistoricalConfirmationScore(context: ClassifierContext): number {
  const weights = context.personalizationWeights;
  if (!weights) return 0.50;
  const docAccept = weights.acceptedByDocument[context.documentPath] ?? 0;
  const docReject = weights.rejectedByDocument[context.documentPath] ?? 0;
  if (docAccept === 0 && docReject === 0) return 0.50;
  const total = docAccept + docReject;
  const acceptRatio = docAccept / total;
  if (acceptRatio >= 0.7) return 0.72;
  if (acceptRatio >= 0.5) return 0.62;
  return 0.42;
}

function computeRecencyScore(context: ClassifierContext): number {
  const weights = context.personalizationWeights;
  if (!weights) return 0.50;
  const recentBoost = weights.recentDocumentBoost[context.documentPath] ?? 0;
  if (recentBoost >= 5) return 0.78;
  if (recentBoost >= 3) return 0.66;
  if (recentBoost >= 1) return 0.58;
  return 0.50;
}

export function classifyAll(
  results: DetectorResult[],
  context: ClassifierContext,
): ClassifierResult[] {
  return results
    .map(r => classifyDetectorResult(r, context))
    .filter(r => r.score >= 0.45)
    .sort((a, b) => b.score - a.score);
}
