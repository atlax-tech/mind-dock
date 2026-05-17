import type { ContentChangedEvent } from '@atlax/domain'
import type { BackgroundJobRecord } from '@/lib/db'
import { isContentDirty } from '@/lib/contentHash'
import { enqueue } from '@/lib/backgroundJobQueue'

export async function onContentChanged(
  userId: string,
  event: ContentChangedEvent,
): Promise<{ enqueued: boolean; reason?: string; jobs?: BackgroundJobRecord[] }> {
  console.log(`[ContentChange] 内容变更 → sourceType: ${event.sourceType}, sourceId: ${event.sourceId}, changeType: ${event.changeType}`)

  if (event.changeType === 'deleted') {
    console.log('[ContentChange] ← 内容已删除, 跳过')
    return { enqueued: false, reason: 'content_deleted' }
  }

  const dirty = await isContentDirty(
    userId,
    event.sourceType,
    event.sourceId,
    event.contentHash,
    event.workspaceId,
  )

  if (!dirty) {
    console.log('[ContentChange] ← 内容未变更, 跳过')
    return { enqueued: false, reason: 'content_unchanged' }
  }

  const localJob = await enqueue(
    userId,
    'recompute_local_features',
    event.sourceType,
    event.sourceId,
    event.contentHash,
    { workspaceId: event.workspaceId },
  )

  const semanticJob = await enqueue(
    userId,
    'recompute_semantic_features',
    event.sourceType,
    event.sourceId,
    event.contentHash,
    { workspaceId: event.workspaceId },
  )

  console.log(`[ContentChange] ← 已入列 2 个作业 (local: ${localJob.id}, semantic: ${semanticJob.id})`)
  return { enqueued: true, jobs: [localJob, semanticJob] }
}
