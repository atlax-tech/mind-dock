import type { EmbeddingResult, SummaryResult, ProbeResult } from '@atlax/domain'
import { modelProviderRegistry } from '@/lib/modelProvider'
import {
  upsertEmbeddingVector,
  upsertAlgorithmAuditLog,
  upsertSemanticFeatureSnapshot,
  upsertModelRuntimeStatus,
  getSemanticFeatureSnapshotByTarget,
} from '@/lib/intelligenceRepository'

export type RuntimeEmbeddingResult = EmbeddingResult & { auditLogId: string }
export type RuntimeSummaryResult = SummaryResult & { auditLogId: string }
export type RuntimeProbeResult = ProbeResult & { auditLogId?: string }

function djb2Hash(text: string): number {
  let hash = 5381
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i)
  }
  return hash >>> 0
}

export function computeInputHash(text: string): string {
  const hex = djb2Hash(text).toString(16)
  return `ih_${hex}`
}

export function computeOutputHash(text: string): string {
  const hex = djb2Hash(text).toString(16)
  return `oh_${hex}`
}

function computeVectorHash(data: Float32Array): string {
  let hash = 5381
  for (let i = 0; i < data.length; i++) {
    const buf = new ArrayBuffer(4)
    new Float32Array(buf)[0] = data[i]
    const bytes = new Uint8Array(buf)
    for (let j = 0; j < bytes.length; j++) {
      hash = ((hash << 5) + hash) + bytes[j]
    }
  }
  const hex = (hash >>> 0).toString(16)
  return `vh_${hex}`
}

export function sanitizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.length > 200 ? raw.slice(0, 200) : raw
}

export async function generateEmbeddingForTarget(
  userId: string,
  workspaceId: string,
  targetType: string,
  targetId: string,
  text: string,
  contentHash: string,
): Promise<RuntimeEmbeddingResult> {
  console.log(`[RuntimeService] generateEmbeddingForTarget → target: ${targetType}/${targetId}, textLen: ${text.length}`)
  const start = Date.now()
  const result = await modelProviderRegistry.generateEmbedding(text)
  const durationMs = Date.now() - start

  console.log(`[RuntimeService] generateEmbeddingForTarget ← provider: ${result.modelProvider}, success: ${result.success}, dim: ${result.dim ?? 'N/A'}, durationMs: ${durationMs}`)

  const auditLogId = await upsertAlgorithmAuditLog({
    userId,
    workspaceId,
    providerId: result.modelProvider,
    modelId: result.modelName,
    modelVersion: result.modelVersion,
    capability: 'embedding',
    durationMs,
    success: result.success,
    fallbackUsed: false,
    inputHash: computeInputHash(text),
    outputHash: result.success && result.data ? computeVectorHash(result.data) : computeOutputHash(result.error ?? 'unknown_error'),
    errorCode: result.success ? null : 'embedding_failed',
    errorMessage: result.success ? null : sanitizeErrorMessage(result.error),
    createdAt: new Date().toISOString(),
  }, workspaceId)

  if (result.success && result.data) {
    const vectorHash = computeVectorHash(result.data)

    await upsertEmbeddingVector({
      userId,
      workspaceId,
      targetType,
      targetId,
      contentHash,
      providerId: result.modelProvider,
      modelId: result.modelName,
      modelVersion: result.modelVersion,
      dimension: result.dim ?? result.data.length,
      vectorHash,
      vectorBlob: result.data.buffer as ArrayBuffer,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, workspaceId)

    const existing = await getSemanticFeatureSnapshotByTarget(userId, targetType, targetId, workspaceId)
    const now = new Date().toISOString()

    if (existing) {
      await upsertSemanticFeatureSnapshot({
        ...existing,
        contentHash,
        embeddingDim: result.dim ?? result.data.length,
        embeddingRef: `ev://${targetType}/${targetId}`,
        modelProvider: result.modelProvider,
        modelName: result.modelName,
        modelVersion: result.modelVersion,
        updatedAt: now,
      }, workspaceId)
    } else {
      await upsertSemanticFeatureSnapshot({
        userId,
        workspaceId,
        targetType,
        targetId,
        contentHash,
        modelProvider: result.modelProvider,
        modelName: result.modelName,
        modelVersion: result.modelVersion,
        embeddingDim: result.dim ?? result.data.length,
        embeddingRef: `ev://${targetType}/${targetId}`,
        semanticSummary: '',
        intent: '',
        topics: [],
        source: 'local_model_runtime_service',
        reason: 'model_call',
        evidence: 'embedding_or_summary_generated',
        confidence: 0.8,
        safetyLevel: 'safe',
        stale: false,
        staleKey: 0,
        expiredAt: null,
        createdAt: now,
        updatedAt: now,
      }, workspaceId)
    }
  }

  return { ...result, auditLogId }
}

export async function generateSummaryForTarget(
  userId: string,
  workspaceId: string,
  targetType: string,
  targetId: string,
  text: string,
  contentHash: string,
): Promise<RuntimeSummaryResult> {
  console.log(`[RuntimeService] generateSummaryForTarget → target: ${targetType}/${targetId}, textLen: ${text.length}`)
  const start = Date.now()
  const result = await modelProviderRegistry.generateSummary(text)
  const durationMs = Date.now() - start

  console.log(`[RuntimeService] generateSummaryForTarget ← provider: ${result.modelProvider}, success: ${result.success}, summaryLen: ${result.summary?.length ?? 0}, durationMs: ${durationMs}`)

  const auditLogId = await upsertAlgorithmAuditLog({
    userId,
    workspaceId,
    providerId: result.modelProvider,
    modelId: result.modelName,
    modelVersion: result.modelVersion,
    capability: 'summary',
    durationMs,
    success: result.success,
    fallbackUsed: false,
    inputHash: computeInputHash(text),
    outputHash: result.success && result.summary ? computeOutputHash(result.summary) : computeOutputHash(result.error ?? 'unknown_error'),
    errorCode: result.success ? null : 'summary_failed',
    errorMessage: result.success ? null : sanitizeErrorMessage(result.error),
    createdAt: new Date().toISOString(),
  }, workspaceId)

  if (result.success && result.summary) {
    const existing = await getSemanticFeatureSnapshotByTarget(userId, targetType, targetId, workspaceId)
    const now = new Date().toISOString()

    if (existing) {
      await upsertSemanticFeatureSnapshot({
        ...existing,
        contentHash,
        semanticSummary: result.summary,
        modelProvider: result.modelProvider,
        modelName: result.modelName,
        modelVersion: result.modelVersion,
        updatedAt: now,
      }, workspaceId)
    } else {
      await upsertSemanticFeatureSnapshot({
        userId,
        workspaceId,
        targetType,
        targetId,
        contentHash,
        modelProvider: result.modelProvider,
        modelName: result.modelName,
        modelVersion: result.modelVersion,
        embeddingDim: 0,
        embeddingRef: '',
        semanticSummary: result.summary,
        intent: '',
        topics: [],
        source: 'local_model_runtime_service',
        reason: 'model_call',
        evidence: 'embedding_or_summary_generated',
        confidence: 0.8,
        safetyLevel: 'safe',
        stale: false,
        staleKey: 0,
        expiredAt: null,
        createdAt: now,
        updatedAt: now,
      }, workspaceId)
    }
  }

  return { ...result, auditLogId }
}

export async function probeAndSyncStatus(
  userId: string,
  workspaceId: string,
): Promise<RuntimeProbeResult> {
  const embeddingProvider = modelProviderRegistry.getEmbeddingProvider()
  const reasoningProvider = modelProviderRegistry.getReasoningProvider()

  console.log('[probeAndSyncStatus] 开始探测 → embeddingProvider:', embeddingProvider?.providerId || '(无)', 'reasoningProvider:', reasoningProvider?.providerId || '(无)')

  let probeResult: ProbeResult = {
    available: false,
    embeddingAvailable: false,
    reasoningAvailable: false,
  }

  let providerId = ''
  let providerName = ''
  let durationMs = 0

  if (embeddingProvider && typeof embeddingProvider.probe === 'function') {
    console.log('[probeAndSyncStatus] 调用 embeddingProvider.probe()...')
    const start = Date.now()
    try {
      probeResult = await embeddingProvider.probe()
    } catch {
      probeResult = { available: false, embeddingAvailable: false, reasoningAvailable: false, error: 'probe_failed' }
    }
    durationMs = Date.now() - start
    providerId = embeddingProvider.providerId
    providerName = embeddingProvider.providerName
  }

  if (reasoningProvider && !providerId) {
    providerId = reasoningProvider.providerId
    providerName = reasoningProvider.providerName
  }

  console.log('[probeAndSyncStatus] probe 结果:', { available: probeResult.available, embeddingAvailable: probeResult.embeddingAvailable, reasoningAvailable: probeResult.reasoningAvailable, error: probeResult.error, durationMs, providerId })

  const auditLogId = await upsertAlgorithmAuditLog({
    userId,
    workspaceId,
    providerId,
    modelId: '',
    modelVersion: '',
    capability: 'probe',
    durationMs,
    success: probeResult.available,
    fallbackUsed: false,
    inputHash: computeInputHash('probe'),
    outputHash: computeOutputHash(probeResult.available ? 'probe_ok' : 'probe_failed'),
    errorCode: probeResult.available ? null : (probeResult.error ?? 'probe_failed'),
    errorMessage: probeResult.available ? null : sanitizeErrorMessage(probeResult.error),
    createdAt: new Date().toISOString(),
  }, workspaceId)

  modelProviderRegistry.syncAvailabilityFromProbe(probeResult)

  let mode: 'core' | 'model_available' | 'degraded' | 'unavailable'
  const embAvail = probeResult.embeddingAvailable
  const reasAvail = probeResult.reasoningAvailable

  if (!probeResult.available) {
    mode = 'unavailable'
  } else if (embAvail && reasAvail) {
    mode = 'model_available'
  } else if (embAvail || reasAvail) {
    mode = 'degraded'
  } else {
    mode = 'unavailable'
  }

  const embeddingStatus: 'available' | 'unavailable' | 'error' = embAvail ? 'available' : 'unavailable'
  const reasoningStatus: 'available' | 'unavailable' | 'error' = reasAvail ? 'available' : 'unavailable'

  const now = new Date().toISOString()

  await upsertModelRuntimeStatus({
    userId,
    workspaceId,
    providerId,
    providerName,
    mode,
    embeddingStatus,
    reasoningStatus,
    embeddingModelId: (embeddingProvider as { embeddingModelId?: string })?.embeddingModelId ?? '',
    reasoningModelId: (reasoningProvider as { reasoningModelId?: string })?.reasoningModelId ?? '',
    lastProbeAt: now,
    lastProbeSuccess: probeResult.available,
    lastSuccessfulProbeAt: probeResult.available ? now : null,
    lastErrorCode: probeResult.available ? null : (probeResult.error ?? 'probe_failed'),
    lastErrorMessage: probeResult.available ? null : sanitizeErrorMessage(probeResult.error),
    createdAt: now,
    updatedAt: now,
  }, workspaceId)

  console.log('[probeAndSyncStatus] 状态已持久化 → mode:', mode, 'embedding:', embeddingStatus, 'reasoning:', reasoningStatus)

  return { ...probeResult, auditLogId }
}
