import type { ContentChangedEvent } from '@atlax/domain'
import type { BackgroundJobRecord } from '@/lib/db'
import { isContentDirty } from '@/lib/contentHash'
import { enqueue } from '@/lib/backgroundJobQueue'

export async function onContentChanged(
  userId: string,
  event: ContentChangedEvent,
): Promise<{ enqueued: boolean; reason?: string; jobs?: BackgroundJobRecord[] }> {
  if (event.changeType === 'deleted') {
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

  return { enqueued: true, jobs: [localJob, semanticJob] }
}
