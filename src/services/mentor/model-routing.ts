/**
 * Model Routing
 *
 * 定义 L0/L1/L2/L3 四级模型资源调配策略。
 *
 * L0：本地结构/标点/格式规则，目标 < 20ms，只加分或降噪
 * L1：embedding + prototype similarity，目标 50-300ms，主判断来源
 * L2：轻量分类模型，可选异步 300-1500ms，L1 灰区时调用
 * L3：reasoning，只能创建 background MentorJob
 *
 * 前台 detector 不得同步调用 reasoning。
 * L2 调用异步、可取消、可跳过，失败时保留 L1 结果。
 */

export type ModelLevel = 'L0' | 'L1' | 'L2' | 'L3';

export interface ModelRoute {
  /** 可用的最高模型级别 */
  availableLevel: ModelLevel;
  /** embedding 是否可用 */
  embeddingAvailable: boolean;
  /** 轻量模型是否可用 */
  lightModelAvailable: boolean;
  /** reasoning 是否可用 */
  reasoningAvailable: boolean;
}

export interface L1Capability {
  /** 是否可用 */
  available: boolean;
  /** 当前章节/选区的 embedding */
  textEmbedding?: number[];
  /** prototype 相似度匹配结果 */
  prototypeMatches?: { type: string; score: number }[];
  /** knowledge type candidates */
  knowledgeTypeCandidates?: { type: string; confidence: number }[];
}

export interface L2Capability {
  /** 是否可用 */
  available: boolean;
  /** 是否应该调用（L1 灰区 + 停顿足够久 + 模型可用） */
  shouldInvoke: boolean;
  /** 调用状态 */
  invokeStatus: 'idle' | 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
}

/**
 * 根据当前能力判断应使用的最高模型级别
 */
export function determineModelRoute(params: {
  embeddingAvailable: boolean;
  lightModelAvailable: boolean;
  reasoningAvailable: boolean;
}): ModelRoute {
  return {
    availableLevel: params.reasoningAvailable ? 'L3'
      : params.lightModelAvailable ? 'L2'
      : params.embeddingAvailable ? 'L1'
      : 'L0',
    embeddingAvailable: params.embeddingAvailable,
    lightModelAvailable: params.lightModelAvailable,
    reasoningAvailable: params.reasoningAvailable,
  };
}

/**
 * 判断是否应调用 L2 轻量模型
 *
 * 条件：
 * 1. L1 置信度处于灰区（0.50 - 0.68）
 * 2. 用户停顿足够久（>= 8s）
 * 3. 轻量模型可用
 * 4. 当前没有正在运行的 L2 调用
 */
export function shouldInvokeL2(params: {
  l1Confidence: number;
  idleDurationMs: number;
  lightModelAvailable: boolean;
  l2Running: boolean;
}): boolean {
  if (!params.lightModelAvailable) return false;
  if (params.l2Running) return false;
  if (params.l1Confidence < 0.50 || params.l1Confidence > 0.68) return false;
  if (params.idleDurationMs < 8000) return false;
  return true;
}

/**
 * 判断是否应创建 L3 reasoning background job
 *
 * 条件（满足任一）：
 * 1. 多个高置信类型冲突
 * 2. 用户主动点击深度分析
 * 3. Context Pack 需要大幅改写
 * 4. confidence 处于灰区且 L2 不可用
 */
export function shouldInvokeL3(params: {
  conflictingTypes: boolean;
  userRequested: boolean;
  contextPackRefine: boolean;
  l1Confidence: number;
  l2Available: boolean;
  reasoningAvailable: boolean;
}): boolean {
  if (!params.reasoningAvailable) return false;
  if (params.userRequested) return true;
  if (params.conflictingTypes) return true;
  if (params.contextPackRefine) return true;
  if (params.l1Confidence >= 0.50 && params.l1Confidence <= 0.68 && !params.l2Available) return true;
  return false;
}
