import type { PersistedEmbeddingVector, AlgorithmAuditLogRecord, PersistedModelRuntimeStatus } from './db'
import { embeddingVectorsTable, algorithmAuditLogsTable, modelRuntimeStatusesTable } from './db'
import { generateEmbeddingForTarget } from './localModelRuntimeService'
import { markSimilarityIndexEntriesStaleByVector, upsertModelRuntimeStatus } from './intelligenceRepository'
import { makeEmbeddingVectorId, makeAlgorithmAuditLogId } from '@atlax/domain'
import { computeContentHash } from './contentHash'

export interface EmbeddingServicePayload {
  targetType: string
  targetId: string
  userId: string
  workspaceId: string
  contentHash: string
  text: string
}

export interface EmbeddingServiceResult {
  status: 'success' | 'fallback' | 'failed' | 'skipped'
  embeddingVector: PersistedEmbeddingVector | null
  providerId: string
  modelId: string
  modelVersion: string
  runtimeMode: string
  inputHash: string
  outputHash: string
  dimension: number
  durationMs: number
  fallbackUsed: boolean
  errorMessage: string | null
  auditLogId: string
}

class EmbeddingService {
  async generateEmbedding(payload: EmbeddingServicePayload): Promise<EmbeddingServiceResult> {
    const { targetType, targetId, userId, workspaceId, contentHash, text } = payload

    if (!targetId || !workspaceId || !contentHash || !text) {
      throw new Error('[EmbeddingService] missing required fields: targetId, workspaceId, contentHash, text')
    }

    const inputHash = computeContentHash(text)
    const evId = makeEmbeddingVectorId(userId, workspaceId, targetType, targetId)
    const existing = await embeddingVectorsTable.get(evId)

    const statuses = await modelRuntimeStatusesTable
      .where('[userId+workspaceId]')
      .equals([userId, workspaceId])
      .toArray()
    const runtimeStatus = (statuses[0] as unknown as PersistedModelRuntimeStatus) ?? null
    const runtimeMode = runtimeStatus?.mode ?? 'unavailable'
    const currentModelId = runtimeStatus?.embeddingModelId ?? ''
    const currentProviderId = runtimeStatus?.providerId ?? ''
    const currentModelVersion = runtimeStatus?.embeddingModelVersion ?? ''
    const currentDimension = runtimeStatus?.embeddingDimension ?? 0

    if (existing && !existing.contentHash?.startsWith('__stale__')) {
      const modelIdUnchanged = existing.modelId === currentModelId
      const modelVersionUnchanged = !currentModelVersion || existing.modelVersion === currentModelVersion
      const dimensionUnchanged = !currentDimension || existing.dimension === currentDimension
      const contentUnchanged = existing.contentHash === contentHash

      if (contentUnchanged && modelIdUnchanged && modelVersionUnchanged && dimensionUnchanged) {
        return {
          status: 'skipped',
          embeddingVector: existing as unknown as PersistedEmbeddingVector,
          providerId: existing.providerId,
          modelId: existing.modelId,
          modelVersion: existing.modelVersion,
          runtimeMode,
          inputHash,
          outputHash: existing.vectorHash,
          dimension: existing.dimension,
          durationMs: 0,
          fallbackUsed: false,
          errorMessage: null,
          auditLogId: '',
        }
      }

      const needsStale = !contentUnchanged || !modelIdUnchanged || !modelVersionUnchanged || !dimensionUnchanged
      if (needsStale) {
        await embeddingVectorsTable.update(evId, { contentHash: `__stale__${contentHash}` })
        await markSimilarityIndexEntriesStaleByVector(userId, targetType, targetId, workspaceId)
      }
    }

    const modelUnavailable = !runtimeStatus || runtimeMode === 'core' || runtimeMode === 'unavailable' || runtimeStatus.embeddingStatus !== 'available'

    if (modelUnavailable) {
      const timestamp = Date.now()
      const auditLogId = makeAlgorithmAuditLogId(userId, workspaceId, 'embedding_generate', timestamp)
      const auditLog: AlgorithmAuditLogRecord = {
        id: auditLogId,
        userId,
        workspaceId,
        providerId: 'rule_fallback',
        modelId: 'rule_fallback',
        modelVersion: 'rule_fallback',
        capability: 'embedding_generate',
        durationMs: 0,
        success: false,
        fallbackUsed: true,
        inputHash,
        outputHash: '',
        errorCode: 'provider_unavailable',
        errorMessage: 'embedding provider unavailable, falling back to core mode',
        createdAt: new Date().toISOString(),
      }
      await algorithmAuditLogsTable.put(auditLog)

      return {
        status: 'fallback',
        embeddingVector: null,
        providerId: 'rule_fallback',
        modelId: 'rule_fallback',
        modelVersion: 'rule_fallback',
        runtimeMode,
        inputHash,
        outputHash: '',
        dimension: 0,
        durationMs: 0,
        fallbackUsed: true,
        errorMessage: 'embedding provider unavailable',
        auditLogId,
      }
    }

    const startTime = performance.now()
    try {
      await generateEmbeddingForTarget(userId, workspaceId, targetType, targetId, text, contentHash)
      const durationMs = Math.round(performance.now() - startTime)

      const generated = await embeddingVectorsTable.get(evId)
      if (!generated) {
        const timestamp = Date.now()
        const auditLogId = makeAlgorithmAuditLogId(userId, workspaceId, 'embedding_generate', timestamp)
        const auditLog: AlgorithmAuditLogRecord = {
          id: auditLogId,
          userId,
          workspaceId,
          providerId: currentProviderId,
          modelId: currentModelId,
          modelVersion: '',
          capability: 'embedding_generate',
          durationMs,
          success: false,
          fallbackUsed: false,
          inputHash,
          outputHash: '',
          errorCode: 'vector_not_found',
          errorMessage: 'embedding vector not found after generation',
          createdAt: new Date().toISOString(),
        }
        await algorithmAuditLogsTable.put(auditLog)

        return {
          status: 'failed',
          embeddingVector: null,
          providerId: currentProviderId,
          modelId: currentModelId,
          modelVersion: '',
          runtimeMode,
          inputHash,
          outputHash: '',
          dimension: 0,
          durationMs,
          fallbackUsed: false,
          errorMessage: 'embedding vector not found after generation',
          auditLogId,
        }
      }

      if (generated.modelVersion !== currentModelVersion || generated.dimension !== currentDimension) {
        await upsertModelRuntimeStatus({
          userId,
          workspaceId,
          providerId: currentProviderId,
          providerName: runtimeStatus?.providerName ?? '',
          mode: runtimeMode as 'core' | 'model_available' | 'degraded' | 'unavailable',
          embeddingStatus: runtimeStatus?.embeddingStatus as 'available' | 'unavailable' | 'error' ?? 'available',
          reasoningStatus: runtimeStatus?.reasoningStatus as 'available' | 'unavailable' | 'error' ?? 'available',
          embeddingModelId: currentModelId,
          embeddingModelVersion: generated.modelVersion,
          embeddingDimension: generated.dimension,
          reasoningModelId: runtimeStatus?.reasoningModelId ?? '',
          lastProbeAt: runtimeStatus?.lastProbeAt ?? new Date().toISOString(),
          lastProbeSuccess: runtimeStatus?.lastProbeSuccess ?? true,
          lastSuccessfulProbeAt: runtimeStatus?.lastSuccessfulProbeAt ?? new Date().toISOString(),
          lastErrorCode: runtimeStatus?.lastErrorCode ?? null,
          lastErrorMessage: runtimeStatus?.lastErrorMessage ?? null,
          createdAt: runtimeStatus?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, workspaceId)
      }

      const outputHash = generated.vectorHash
      const timestamp = Date.now()
      const auditLogId = makeAlgorithmAuditLogId(userId, workspaceId, 'embedding_generate', timestamp)
      const auditLog: AlgorithmAuditLogRecord = {
        id: auditLogId,
        userId,
        workspaceId,
        providerId: generated.providerId,
        modelId: generated.modelId,
        modelVersion: generated.modelVersion,
        capability: 'embedding_generate',
        durationMs,
        success: true,
        fallbackUsed: false,
        inputHash,
        outputHash,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
      }
      await algorithmAuditLogsTable.put(auditLog)

      return {
        status: 'success',
        embeddingVector: generated as unknown as PersistedEmbeddingVector,
        providerId: generated.providerId,
        modelId: generated.modelId,
        modelVersion: generated.modelVersion,
        runtimeMode,
        inputHash,
        outputHash,
        dimension: generated.dimension,
        durationMs,
        fallbackUsed: false,
        errorMessage: null,
        auditLogId,
      }
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime)
      const errorMessage = error instanceof Error ? error.message : 'unknown error'
      const timestamp = Date.now()
      const auditLogId = makeAlgorithmAuditLogId(userId, workspaceId, 'embedding_generate', timestamp)
      const auditLog: AlgorithmAuditLogRecord = {
        id: auditLogId,
        userId,
        workspaceId,
        providerId: 'rule_fallback',
        modelId: 'rule_fallback',
        modelVersion: 'rule_fallback',
        capability: 'embedding_generate',
        durationMs,
        success: false,
        fallbackUsed: true,
        inputHash,
        outputHash: '',
        errorCode: 'generation_failed',
        errorMessage,
        createdAt: new Date().toISOString(),
      }
      await algorithmAuditLogsTable.put(auditLog)

      return {
        status: 'fallback',
        embeddingVector: null,
        providerId: 'rule_fallback',
        modelId: 'rule_fallback',
        modelVersion: 'rule_fallback',
        runtimeMode,
        inputHash,
        outputHash: '',
        dimension: 0,
        durationMs,
        fallbackUsed: true,
        errorMessage,
        auditLogId,
      }
    }
  }
}

export const embeddingService = new EmbeddingService()
