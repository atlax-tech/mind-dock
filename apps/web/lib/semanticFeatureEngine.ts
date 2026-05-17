import type { SemanticFeatureSnapshot, ModelRuntimeStatus } from '@atlax/domain'
import {
  generateEmbeddingForTarget,
  generateSummaryForTarget,
  sanitizeErrorMessage,
} from '@/lib/localModelRuntimeService'
import {
  getModelRuntimeStatus,
  getSemanticFeatureSnapshotByTarget,
  upsertSemanticFeatureSnapshot,
  getEmbeddingEnabledPref,
  getReasoningEnabledPref,
} from '@/lib/intelligenceRepository'

const PROVIDER_ID = 'ollama-openai-compatible'
const EMBEDDING_MODEL_NAME = 'qwen3-embedding:0.6b'
const REASONING_MODEL_NAME = 'qwen3:1.7b'
const MODEL_VERSION = '1.0'

interface SemanticFeaturePayload {
  targetType: string
  targetId: string
  userId: string
  workspaceId: string
  contentHash: string
  text: string
}

type ComputeStatus =
  | 'complete'
  | 'partial'
  | 'semantic_core_only'
  | 'skipped'
  | 'disabled'
  | 'reasoning_disabled'
  | 'pending_model'
  | 'unprobed'
  | 'degraded'
  | 'failed'

interface ComputeResult {
  status: ComputeStatus
  snapshot?: SemanticFeatureSnapshot
}

function resolveModelName(embeddingEnabled: boolean, _reasoningEnabled: boolean): string {
  if (embeddingEnabled) return EMBEDDING_MODEL_NAME
  return REASONING_MODEL_NAME
}

function buildSnapshotPayload(params: {
  userId: string
  workspaceId: string
  targetType: string
  targetId: string
  contentHash: string
  embeddingDim: number
  embeddingRef: string
  semanticSummary: string
  reason: string
  evidence: string
  confidence: number
  now: string
}): Omit<SemanticFeatureSnapshot, 'id'> {
  return {
    userId: params.userId,
    workspaceId: params.workspaceId,
    targetType: params.targetType,
    targetId: params.targetId,
    contentHash: params.contentHash,
    modelProvider: PROVIDER_ID,
    modelName: resolveModelName(params.embeddingDim > 0, params.semanticSummary.length > 0),
    modelVersion: MODEL_VERSION,
    embeddingDim: params.embeddingDim,
    embeddingRef: params.embeddingRef,
    semanticSummary: params.semanticSummary,
    intent: 'general',
    topics: [],
    source: 'SemanticFeatureEngine',
    reason: params.reason,
    evidence: params.evidence,
    confidence: params.confidence,
    safetyLevel: 'low',
    stale: false,
    staleKey: 0 as const,
    expiredAt: null,
    createdAt: params.now,
    updatedAt: params.now,
  }
}

class SemanticFeatureEngine {
  async computeFeatures(payload: SemanticFeaturePayload): Promise<ComputeResult> {
    if (!payload.targetId || !payload.workspaceId || !payload.contentHash || !payload.text) {
      throw new Error(
        sanitizeErrorMessage(
          'SemanticFeatureEngine: missing required fields (targetId, workspaceId, contentHash, text)',
        ),
      )
    }

    const { userId, workspaceId, targetType, targetId, contentHash, text } = payload

    const runtimeStatus: ModelRuntimeStatus | null = await getModelRuntimeStatus(
      userId,
      PROVIDER_ID,
      workspaceId,
    )

    if (!runtimeStatus) {
      return { status: 'unprobed' }
    }

    const { mode, embeddingStatus, reasoningStatus } = runtimeStatus

    if (mode === 'core' || mode === 'unavailable') {
      return { status: 'pending_model' }
    }

    const userEmbeddingEnabled = await getEmbeddingEnabledPref(userId, workspaceId)
    const userReasoningEnabled = await getReasoningEnabledPref(userId, workspaceId)

    const embeddingEnabled = userEmbeddingEnabled && embeddingStatus === 'available'
    const reasoningEnabled = userReasoningEnabled && reasoningStatus === 'available'

    if (!embeddingEnabled) {
      return { status: 'disabled' }
    }

    if (mode === 'degraded') {
      const reasAvailable = reasoningStatus === 'available'

      if (!reasAvailable) {
        return this.executeFeatures({
          userId,
          workspaceId,
          targetType,
          targetId,
          contentHash,
          text,
          embeddingEnabled: true,
          reasoningEnabled: false,
        })
      }

      return this.executeFeatures({
        userId,
        workspaceId,
        targetType,
        targetId,
        contentHash,
        text,
        embeddingEnabled: true,
        reasoningEnabled: reasoningEnabled && reasAvailable,
      })
    }

    return this.executeFeatures({
      userId,
      workspaceId,
      targetType,
      targetId,
      contentHash,
      text,
      embeddingEnabled: true,
      reasoningEnabled,
    })
  }

  private async executeFeatures(params: {
    userId: string
    workspaceId: string
    targetType: string
    targetId: string
    contentHash: string
    text: string
    embeddingEnabled: boolean
    reasoningEnabled: boolean
  }): Promise<ComputeResult> {
    const {
      userId,
      workspaceId,
      targetType,
      targetId,
      contentHash,
      text,
      embeddingEnabled,
      reasoningEnabled,
    } = params

    console.log(`[SemanticEngine] executeFeatures → target: ${targetType}/${targetId}, textLen: ${text.length}, embedding: ${embeddingEnabled}, reasoning: ${reasoningEnabled}`)

    const existing = await getSemanticFeatureSnapshotByTarget(
      userId,
      targetType,
      targetId,
      workspaceId,
    )

    if (existing && !existing.stale && existing.contentHash === contentHash) {
      const expectedModelNames: string[] = []
      if (embeddingEnabled) expectedModelNames.push(EMBEDDING_MODEL_NAME)
      if (reasoningEnabled) expectedModelNames.push(REASONING_MODEL_NAME)
      if (expectedModelNames.some((name) => existing.modelName === name)) {
        console.log('[SemanticEngine] executeFeatures ← 已存在且未过期, skipped')
        return { status: 'skipped', snapshot: existing }
      }
    }

    let embeddingResult: { success: boolean; dim?: number; error?: string } | null = null
    let summaryResult: { success: boolean; summary?: string; error?: string } | null = null

    if (embeddingEnabled) {
      console.log('[SemanticEngine] 开始生成 Embedding...')
      try {
        const embResult = await generateEmbeddingForTarget(
          userId,
          workspaceId,
          targetType,
          targetId,
          text,
          contentHash,
        )
        embeddingResult = {
          success: embResult.success,
          dim: embResult.dim,
          error: embResult.error ? sanitizeErrorMessage(embResult.error) : undefined,
        }
        console.log(`[SemanticEngine] Embedding ← ${embResult.success ? '成功' : '失败'}`)
      } catch (err) {
        embeddingResult = { success: false, error: sanitizeErrorMessage(err) }
        console.error('[SemanticEngine] Embedding ← 异常:', err instanceof Error ? err.message : String(err))
      }
    }

    if (reasoningEnabled) {
      console.log('[SemanticEngine] 开始生成 Summary...')
      try {
        const sumResult = await generateSummaryForTarget(
          userId,
          workspaceId,
          targetType,
          targetId,
          text,
          contentHash,
        )
        summaryResult = {
          success: sumResult.success,
          summary: sumResult.summary,
          error: sumResult.error ? sanitizeErrorMessage(sumResult.error) : undefined,
        }
        console.log(`[SemanticEngine] Summary ← ${sumResult.success ? '成功' : '失败'}`)
      } catch (err) {
        summaryResult = { success: false, error: sanitizeErrorMessage(err) }
        console.error('[SemanticEngine] Summary ← 异常:', err instanceof Error ? err.message : String(err))
      }
    }

    const now = new Date().toISOString()

    const embOk = embeddingResult?.success === true
    const sumOk = summaryResult?.success === true
    const embAttempted = embeddingEnabled
    const sumAttempted = reasoningEnabled

    let status: ComputeStatus
    let reason: string
    let evidence: string
    let confidence: number

    if (embOk && sumOk) {
      status = 'complete'
      reason = 'embedding_and_summary_succeeded'
      evidence = 'semantic_features_generated'
      confidence = 0.8
    } else if (embOk && !sumAttempted) {
      status = 'semantic_core_only'
      reason = 'embedding_succeeded_reasoning_disabled'
      evidence = 'semantic_core_only'
      confidence = 0.8
    } else if (embOk && sumAttempted && !sumOk) {
      status = 'partial'
      reason = sanitizeErrorMessage(
        `embedding_succeeded_summary_failed: ${summaryResult?.error ?? 'unknown'}`,
      )
      evidence = 'partial_semantic_features'
      confidence = 0.8
    } else if (sumOk && !embAttempted) {
      status = 'partial'
      reason = 'summary_succeeded_embedding_disabled'
      evidence = 'partial_semantic_features'
      confidence = 0.8
    } else if (!embAttempted && !sumAttempted) {
      status = 'disabled'
      reason = 'no_capabilities_enabled'
      evidence = 'features_disabled'
      confidence = 0
    } else if (embAttempted && !embOk && sumAttempted && !sumOk) {
      status = 'failed'
      reason = sanitizeErrorMessage(
        `embedding_failed: ${embeddingResult?.error ?? 'unknown'}; summary_failed: ${summaryResult?.error ?? 'unknown'}`,
      )
      evidence = 'all_features_failed'
      confidence = 0
    } else if (embAttempted && !embOk && !sumAttempted) {
      status = 'failed'
      reason = sanitizeErrorMessage(
        `embedding_failed: ${embeddingResult?.error ?? 'unknown'}`,
      )
      evidence = 'embedding_failed'
      confidence = 0
    } else if (!embAttempted && sumAttempted && !sumOk) {
      status = 'failed'
      reason = sanitizeErrorMessage(
        `summary_failed: ${summaryResult?.error ?? 'unknown'}`,
      )
      evidence = 'summary_failed'
      confidence = 0
    } else {
      status = 'failed'
      reason = 'unknown_state'
      evidence = 'unknown'
      confidence = 0
    }

    const snapshotPayload = buildSnapshotPayload({
      userId,
      workspaceId,
      targetType,
      targetId,
      contentHash,
      embeddingDim: embeddingResult?.dim ?? 0,
      embeddingRef: embOk ? `ev://${targetType}/${targetId}` : '',
      semanticSummary: summaryResult?.summary ?? '',
      reason,
      evidence,
      confidence,
      now,
    })

    await upsertSemanticFeatureSnapshot(snapshotPayload, workspaceId)

    const written = await getSemanticFeatureSnapshotByTarget(
      userId,
      targetType,
      targetId,
      workspaceId,
    )

    return { status, snapshot: written ?? undefined }
  }
}

export const semanticFeatureEngine = new SemanticFeatureEngine()