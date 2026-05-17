import type { JobStatus } from '@atlax/domain'
import type { BackgroundJobRecord } from '@/lib/db'
import { getCapabilityStatus } from '@/lib/modelProvider'
import { markLocalTextFeatureSnapshotStale, markSemanticFeatureSnapshotStale } from '@/lib/intelligenceRepository'

export async function processJob(job: BackgroundJobRecord): Promise<{ status: JobStatus }> {
  switch (job.jobType) {
    case 'recompute_local_features':
      await markLocalTextFeatureSnapshotStale(job.userId, job.targetType, job.targetId, job.workspaceId)
      return { status: 'complete' }

    case 'recompute_semantic_features':
      try {
        const capability = getCapabilityStatus()
        if (capability.mode === 'model_available') {
          await markSemanticFeatureSnapshotStale(job.userId, job.targetType, job.targetId, job.workspaceId)
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

    case 'refresh_recommendations':
      return { status: 'skipped' }

    default:
      return { status: 'failed' }
  }
}
