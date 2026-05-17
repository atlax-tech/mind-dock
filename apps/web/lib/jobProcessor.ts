import type { JobStatus } from '@atlax/domain'
import type { BackgroundJobRecord } from '@/lib/db'
import { DEFAULT_WORKSPACE_ID } from '@atlax/domain'
import { getCapabilityStatus } from '@/lib/modelProvider'
import { generateEmbeddingForTarget, generateSummaryForTarget } from '@/lib/localModelRuntimeService'
import { runSmokeTest } from '@/lib/modelSmokeService'
import { localTextFeatureEngine } from '@/lib/localTextFeatureEngine'
import { semanticFeatureEngine } from '@/lib/semanticFeatureEngine'
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
  console.log(`[JobProcessor] 开始处理作业 → type: ${job.jobType}, target: ${job.targetType}/${job.targetId}`)
  switch (job.jobType) {
    case 'recompute_local_features': {
      if (!job.targetId || !job.workspaceId || !job.contentHash) {
        console.warn('[JobProcessor] recompute_local_features ← 参数不完整')
        return { status: 'failed' }
      }
      try {
        const text = await resolveTargetText(job.userId, job.workspaceId, job.targetType, job.targetId)
        if (!text) { console.log('[JobProcessor] recompute_local_features ← 无文本内容, skipped'); return { status: 'skipped' } }
        await localTextFeatureEngine.computeFeatures({
          targetType: job.targetType,
          targetId: job.targetId,
          userId: job.userId,
          workspaceId: job.workspaceId,
          contentHash: job.contentHash,
          text,
        })
        console.log('[JobProcessor] recompute_local_features ← 完成')
        return { status: 'complete' }
      } catch (err) {
        console.error('[JobProcessor] recompute_local_features ← 失败:', err instanceof Error ? err.message : String(err))
        return { status: 'failed' }
      }
    }

    case 'recompute_semantic_features': {
      if (!job.targetId || !job.workspaceId || !job.contentHash) {
        console.warn('[JobProcessor] recompute_semantic_features ← 参数不完整')
        return { status: 'failed' }
      }
      try {
        const text = await resolveTargetText(job.userId, job.workspaceId, job.targetType, job.targetId)
        if (!text) { console.log('[JobProcessor] recompute_semantic_features ← 无文本内容, skipped'); return { status: 'skipped' } }
        const result = await semanticFeatureEngine.computeFeatures({
          targetType: job.targetType,
          targetId: job.targetId,
          userId: job.userId,
          workspaceId: job.workspaceId,
          contentHash: job.contentHash,
          text,
        })
        const statusMap: Record<string, JobStatus> = {
          complete: 'complete',
          partial: 'complete',
          semantic_core_only: 'complete',
          skipped: 'skipped',
          disabled: 'skipped',
          reasoning_disabled: 'complete',
          pending_model: 'pending_model',
          unprobed: 'pending_model',
          degraded: 'degraded',
          failed: 'failed',
        }
        const finalStatus = statusMap[result.status] ?? 'failed'
        console.log(`[JobProcessor] recompute_semantic_features ← status: ${result.status} → ${finalStatus}`)
        return { status: finalStatus }
      } catch (err) {
        console.error('[JobProcessor] recompute_semantic_features ← 失败:', err instanceof Error ? err.message : String(err))
        return { status: 'failed' }
      }
    }

    case 'embedding_generate': {
      const capability = getCapabilityStatus()
      if (capability.mode === 'core') { console.log('[JobProcessor] embedding_generate ← mode=core, pending_model'); return { status: 'pending_model' } }
      if (capability.mode === 'degraded') { console.log('[JobProcessor] embedding_generate ← mode=degraded'); return { status: 'degraded' } }
      try {
        const text = await resolveTargetText(job.userId, job.workspaceId, job.targetType, job.targetId)
        if (!text) { console.log('[JobProcessor] embedding_generate ← 无文本内容, skipped'); return { status: 'skipped' } }
        const result = await generateEmbeddingForTarget(job.userId, job.workspaceId, job.targetType, job.targetId, text, job.contentHash)
        console.log(`[JobProcessor] embedding_generate ← ${result.success ? '成功' : '失败'}, dim: ${result.dim ?? 'N/A'}`)
        return result.success ? { status: 'complete' } : { status: 'failed' }
      } catch (err) {
        console.error('[JobProcessor] embedding_generate ← 异常:', err instanceof Error ? err.message : String(err))
        return { status: 'failed' }
      }
    }

    case 'summary_generate': {
      const capability = getCapabilityStatus()
      if (capability.mode === 'core') { console.log('[JobProcessor] summary_generate ← mode=core, pending_model'); return { status: 'pending_model' } }
      if (capability.mode === 'degraded') { console.log('[JobProcessor] summary_generate ← mode=degraded'); return { status: 'degraded' } }
      try {
        const text = await resolveTargetText(job.userId, job.workspaceId, job.targetType, job.targetId)
        if (!text) { console.log('[JobProcessor] summary_generate ← 无文本内容, skipped'); return { status: 'skipped' } }
        const result = await generateSummaryForTarget(job.userId, job.workspaceId, job.targetType, job.targetId, text, job.contentHash)
        console.log(`[JobProcessor] summary_generate ← ${result.success ? '成功' : '失败'}`)
        return result.success ? { status: 'complete' } : { status: 'failed' }
      } catch (err) {
        console.error('[JobProcessor] summary_generate ← 异常:', err instanceof Error ? err.message : String(err))
        return { status: 'failed' }
      }
    }

    case 'model_smoke_test': {
      console.log('[JobProcessor] model_smoke_test → 开始冒烟测试...')
      try {
        const result = await runSmokeTest(job.userId, job.workspaceId)
        console.log(`[JobProcessor] model_smoke_test ← status: ${result.status}`)
        return result.status === 'pass' ? { status: 'complete' } : { status: 'failed' }
      } catch (err) {
        console.error('[JobProcessor] model_smoke_test ← 异常:', err instanceof Error ? err.message : String(err))
        return { status: 'failed' }
      }
    }

    case 'refresh_recommendations':
      console.log('[JobProcessor] refresh_recommendations ← skipped (未实现)')
      return { status: 'skipped' }

    default:
      console.warn(`[JobProcessor] 未知作业类型: ${job.jobType}`)
      return { status: 'failed' }
  }
}
