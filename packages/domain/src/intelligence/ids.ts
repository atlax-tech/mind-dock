export function makeLocalTextFeatureSnapshotId(userId: string, workspaceId: string, targetType: string, targetId: string): string {
  return `${userId}_ltfs_${workspaceId}_${targetType}_${targetId}`
}

export function makeSemanticFeatureSnapshotId(userId: string, workspaceId: string, targetType: string, targetId: string): string {
  return `${userId}_sfs_${workspaceId}_${targetType}_${targetId}`
}

export function makeSearchIndexRecordId(userId: string, workspaceId: string, targetType: string, targetId: string): string {
  return `${userId}_sir_${workspaceId}_${targetType}_${targetId}`
}

export function makePreferenceMemoryId(userId: string, workspaceId: string, candidateType: string, candidateId: string): string {
  return `${userId}_pm_${workspaceId}_${candidateType}_${candidateId}`
}

export function makeReviewSnapshotId(userId: string, workspaceId: string, scope: string, reviewDate: string): string {
  return `${userId}_rvs_${workspaceId}_${scope}_${reviewDate}`
}

export function makeDailyBriefSnapshotId(userId: string, workspaceId: string, scope: string, briefDate: string): string {
  return `${userId}_dbs_${workspaceId}_${scope}_${briefDate}`
}

export function makeHealthSignalId(userId: string, workspaceId: string, signalType: string, targetType: string, targetId: string, timestamp: number): string {
  return `${userId}_hs_${workspaceId}_${signalType}_${targetType}_${targetId}_${timestamp}`
}

export function makeGrowthSignalId(userId: string, workspaceId: string, signalType: string, targetType: string, targetId: string, timestamp: number): string {
  return `${userId}_gs_${workspaceId}_${signalType}_${targetType}_${targetId}_${timestamp}`
}

export function makeMaintenanceActionId(userId: string, workspaceId: string, actionType: string, targetType: string, targetId: string, timestamp: number): string {
  return `${userId}_ma_${workspaceId}_${actionType}_${targetType}_${targetId}_${timestamp}`
}

export function makeBackgroundJobId(userId: string, workspaceId: string, jobType: string, targetType: string, targetId: string, contentHash: string): string {
  return `${userId}_job_${jobType}_${workspaceId}_${targetType}_${targetId}_${contentHash}`
}
