import type { JobStatus } from '@atlax/domain'
import type { BackgroundJobRecord } from '@/lib/db'
import { DEFAULT_WORKSPACE_ID } from '@atlax/domain'
import { getCapabilityStatus } from '@/lib/modelProvider'
import { markLocalTextFeatureSnapshotStale, markSemanticFeatureSnapshotStale } from '@/lib/intelligenceRepository'
import { generateEmbeddingForTarget, generateSummaryForTarget } from '@/lib/localModelRuntimeService'
import { runSmokeTest } from '@/lib/modelSmokeService'
import { db } from './db'

function matchesWorkspace(recordWorkspaceId: string | undefined, jobWorkspaceId: string): boolean {
  return (recordWorkspaceId ?? DEFAULT_WORKSPACE_ID) === jobWorkspaceId
}

async function resolveTargetText(
  userId: string,
  workspaceId: string,
  targetType: string,
  targetId: string,
): Promise<string | null> {
  if (targetType === 'tip') {
    const tip = await db.tips.get(Number(targetId))
    if (!tip || tip.userId !== userId || !matchesWorkspace(tip.workspaceId, workspaceId)) return null
    return tip.content ?? null
  }
  if (targetType === 'draft' || targetType === 'document') {
    const draft = await db.editorDrafts.get(Number(targetId))
    if (!draft || draft.userId !== userId || !matchesWorkspace(draft.workspaceId, workspaceId)) return null
    return draft.plainText ?? draft.markdown ?? draft.content ?? null
  }
  if (targetType === 'dockItem') {
    const item = await db.dockItems.get(Number(targetId))
    if (!item || item.userId !== userId || !matchesWorkspace(item.workspaceId, workspaceId)) return null
    return item.rawText ?? null
  }
  return null
}

export async function processJob(job: BackgroundJobRecord): Promise<{ status: JobStatus }> {
  switch (job.jobType) {
    case 'recompute_local_features':
      await markLocalTextFeatureSnapshotStale(job.userId, job.targetType, job.targetId, job.workspaceId)
      return { status: 'complete' }

    case 'recompute_semantic_features':
      try {
        const capability = getCapabilityStatus()
        if (capability.mode === 'model_available') {
          const text = await resolveTargetText(job.userId, job.workspaceId, job.targetType, job.targetId)
          if (!text) return { status: 'skipped' }
          const [embeddingResult, summaryResult] = await Promise.allSettled([
            generateEmbeddingForTarget(job.userId, job.workspaceId, job.targetType, job.targetId, text, job.contentHash),
            generateSummaryForTarget(job.userId, job.workspaceId, job.targetType, job.targetId, text, job.contentHash),
          ])
          const embeddingOk = embeddingResult.status === 'fulfilled' && embeddingResult.value.success
          const summaryOk = summaryResult.status === 'fulfilled' && summaryResult.value.success
          if (!embeddingOk && !summaryOk) return { status: 'failed' }
          return { status: 'complete' }
        }
        if (capability.mode === 'core') {
          return { status: 'pending_model' }
        }
        if (capability.mode === 'degraded') {
          await markSemanticFeatureSnapshotStale(job.userId, job.targetType, job.targetId, job.workspaceId)
          return { status: 'degraded' }
        }
        return { status: 'pending_model' }
      } catch {
        return { status: 'failed' }
      }

    case 'embedding_generate': {
      const capability = getCapabilityStatus()
      if (capability.mode === 'core') return { status: 'pending_model' }
      if (capability.mode === 'degraded') return { status: 'degraded' }
      try {
        const text = await resolveTargetText(job.userId, job.workspaceId, job.targetType, job.targetId)
        if (!text) return { status: 'skipped' }
        const result = await generateEmbeddingForTarget(job.userId, job.workspaceId, job.targetType, job.targetId, text, job.contentHash)
        return result.success ? { status: 'complete' } : { status: 'failed' }
      } catch {
        return { status: 'failed' }
      }
    }

    case 'summary_generate': {
      const capability = getCapabilityStatus()
      if (capability.mode === 'core') return { status: 'pending_model' }
      if (capability.mode === 'degraded') return { status: 'degraded' }
      try {
        const text = await resolveTargetText(job.userId, job.workspaceId, job.targetType, job.targetId)
        if (!text) return { status: 'skipped' }
        const result = await generateSummaryForTarget(job.userId, job.workspaceId, job.targetType, job.targetId, text, job.contentHash)
        return result.success ? { status: 'complete' } : { status: 'failed' }
      } catch {
        return { status: 'failed' }
      }
    }

    case 'model_smoke_test': {
      try {
        const result = await runSmokeTest(job.userId, job.workspaceId)
        return result.status === 'pass' ? { status: 'complete' } : { status: 'failed' }
      } catch {
        return { status: 'failed' }
      }
    }

    case 'refresh_recommendations':
      return { status: 'skipped' }

    default:
      return { status: 'failed' }
  }
}
