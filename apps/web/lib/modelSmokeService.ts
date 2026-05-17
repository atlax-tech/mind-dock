import type { ProbeResult } from '@atlax/domain'
import { probeAndSyncStatus, generateEmbeddingForTarget, generateSummaryForTarget } from '@/lib/localModelRuntimeService'
import { upsertModelSmokeTestRun } from '@/lib/intelligenceRepository'

export interface SmokeTestResult {
  status: 'pass' | 'fail' | 'blocked'
  probeAvailable: boolean
  embeddingAvailable: boolean
  reasoningAvailable: boolean
  embeddingDimension: number | null
  embeddingVectorHash: string | null
  reasoningOutputHash: string | null
  auditLogIds: string[]
  errorMessage: string | null
}

function djb2Hash(text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i)
  }
  return (hash >>> 0).toString(16)
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
  return (hash >>> 0).toString(16)
}

export async function runSmokeTest(
  userId: string,
  workspaceId: string,
): Promise<SmokeTestResult> {
  const probeResult: ProbeResult & { auditLogId?: string } = await probeAndSyncStatus(userId, workspaceId)
  const auditLogIds: string[] = probeResult.auditLogId ? [probeResult.auditLogId] : []

  if (!probeResult.available) {
    const blockedResult: SmokeTestResult = {
      status: 'blocked',
      probeAvailable: false,
      embeddingAvailable: false,
      reasoningAvailable: false,
      embeddingDimension: null,
      embeddingVectorHash: null,
      reasoningOutputHash: null,
      auditLogIds,
      errorMessage: 'Blocked: Ollama endpoint unavailable',
    }
    await upsertModelSmokeTestRun({
      userId,
      workspaceId,
      probeAvailable: false,
      embeddingAvailable: false,
      reasoningAvailable: false,
      embeddingDimension: null,
      embeddingVectorHash: null,
      reasoningOutputHash: null,
      auditLogIds,
      status: 'blocked',
      errorMessage: 'Blocked: Ollama endpoint unavailable',
      createdAt: new Date().toISOString(),
    }, workspaceId)
    return blockedResult
  }

  let embeddingDimension: number | null = null
  let embeddingVectorHash: string | null = null
  let reasoningOutputHash: string | null = null
  let embeddingSuccess = false
  let reasoningSuccess = false

  if (probeResult.embeddingAvailable) {
    try {
      const embResult = await generateEmbeddingForTarget(
        userId,
        workspaceId,
        'smoke_target',
        'smoke_embedding',
        'Atlax MindDock smoke test embedding input',
        'ch_smoke',
      )
      if (embResult.success && embResult.data) {
        embeddingDimension = embResult.dim ?? embResult.data.length
        embeddingVectorHash = computeVectorHash(embResult.data)
        embeddingSuccess = true
      }
      auditLogIds.push(embResult.auditLogId)
    } catch {
      embeddingSuccess = false
    }
  }

  if (probeResult.reasoningAvailable) {
    try {
      const sumResult = await generateSummaryForTarget(
        userId,
        workspaceId,
        'smoke_target',
        'smoke_summary',
        'Atlax MindDock smoke test summary input',
        'ch_smoke',
      )
      if (sumResult.success && sumResult.summary) {
        reasoningOutputHash = djb2Hash(sumResult.summary)
        reasoningSuccess = true
      }
      auditLogIds.push(sumResult.auditLogId)
    } catch {
      reasoningSuccess = false
    }
  }

  let status: 'pass' | 'fail' | 'blocked'
  if (embeddingSuccess && reasoningSuccess) {
    status = 'pass'
  } else if (embeddingSuccess || reasoningSuccess) {
    status = 'fail'
  } else {
    status = 'blocked'
  }

  const errorMessage: string | null = status === 'blocked'
    ? 'No capabilities available'
    : status === 'fail'
      ? 'Partial capability failure'
      : null

  await upsertModelSmokeTestRun({
    userId,
    workspaceId,
    probeAvailable: probeResult.available,
    embeddingAvailable: probeResult.embeddingAvailable,
    reasoningAvailable: probeResult.reasoningAvailable,
    embeddingDimension,
    embeddingVectorHash,
    reasoningOutputHash,
    auditLogIds,
    status,
    errorMessage,
    createdAt: new Date().toISOString(),
  }, workspaceId)

  return {
    status,
    probeAvailable: probeResult.available,
    embeddingAvailable: probeResult.embeddingAvailable,
    reasoningAvailable: probeResult.reasoningAvailable,
    embeddingDimension,
    embeddingVectorHash,
    reasoningOutputHash,
    auditLogIds,
    errorMessage,
  }
}
