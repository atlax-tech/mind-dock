import { db } from './db'
import { DEFAULT_WORKSPACE_ID } from '@atlax/domain'
import type {
  LocalTextFeatureSnapshot,
  SemanticFeatureSnapshot,
  PreferenceMemory,
  HealthSignal,
  GrowthSignal,
  MaintenanceAction,
  ReviewSnapshot,
  DailyBriefSnapshot,
  SearchIndexRecord,
  EmbeddingVector,
  AlgorithmAuditLog,
  ModelSmokeTestRun,
  ModelRuntimeStatus,
} from '@atlax/domain'
import {
  makeLocalTextFeatureSnapshotId,
  makeSemanticFeatureSnapshotId,
  makeSearchIndexRecordId,
  makePreferenceMemoryId,
  makeReviewSnapshotId,
  makeDailyBriefSnapshotId,
  makeEmbeddingVectorId,
  makeAlgorithmAuditLogId,
  makeModelSmokeTestRunId,
  makeModelRuntimeStatusId,
} from '@atlax/domain'

function collisionSafeSuffix(): string {
  return Math.random().toString(36).slice(2, 10)
}

export interface IntelligenceSummaryViewModel {
  targetType: string
  targetId: string
  localTextFeature: LocalTextFeatureSnapshot | null
  semanticFeature: SemanticFeatureSnapshot | null
}

export interface ReviewIntelligenceViewModel {
  scope: string
  reviewDate: string
  review: ReviewSnapshot | null
  healthSignals: HealthSignal[]
  growthSignals: GrowthSignal[]
  maintenanceActions: MaintenanceAction[]
}

export interface DailyBriefIntelligenceViewModel {
  briefDate: string
  brief: DailyBriefSnapshot | null
}

export interface SearchIndexViewModel {
  query: string
  results: SearchIndexRecord[]
  total: number
}

export async function upsertLocalTextFeatureSnapshot(
  record: Omit<LocalTextFeatureSnapshot, 'id'>,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const id = makeLocalTextFeatureSnapshotId(record.userId, workspaceId, record.targetType, record.targetId)
  await db.localTextFeatureSnapshots.put({ ...record, id, workspaceId, staleKey: record.stale ? 1 : 0 as 0 | 1 })
}

export async function getLocalTextFeatureSnapshotByTarget(
  userId: string,
  targetType: string,
  targetId: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<LocalTextFeatureSnapshot | null> {
  const results = await db.localTextFeatureSnapshots
    .where('[userId+workspaceId+targetType+targetId]')
    .equals([userId, workspaceId, targetType, targetId])
    .toArray()
  return (results[0] as unknown as LocalTextFeatureSnapshot) ?? null
}

export async function listLocalTextFeatureSnapshotsByTarget(
  userId: string,
  targetType: string,
  targetId: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<LocalTextFeatureSnapshot[]> {
  const results = await db.localTextFeatureSnapshots
    .where('[userId+workspaceId+targetType+targetId]')
    .equals([userId, workspaceId, targetType, targetId])
    .toArray()
  return results as unknown as LocalTextFeatureSnapshot[]
}

export async function markLocalTextFeatureSnapshotStale(
  userId: string,
  targetType: string,
  targetId: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const results = await db.localTextFeatureSnapshots
    .where('[userId+workspaceId+targetType+targetId]')
    .equals([userId, workspaceId, targetType, targetId])
    .toArray()
  for (const record of results) {
    if (record.id) await db.localTextFeatureSnapshots.update(record.id, { stale: true, staleKey: 1 as const, updatedAt: new Date().toISOString() })
  }
}

export async function markLocalTextFeatureSnapshotExpired(
  userId: string,
  targetType: string,
  targetId: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const results = await db.localTextFeatureSnapshots
    .where('[userId+workspaceId+targetType+targetId]')
    .equals([userId, workspaceId, targetType, targetId])
    .toArray()
  for (const record of results) {
    if (record.id) await db.localTextFeatureSnapshots.update(record.id, { expiredAt: new Date().toISOString(), staleKey: 1 as const, updatedAt: new Date().toISOString() })
  }
}

export async function upsertSemanticFeatureSnapshot(
  record: Omit<SemanticFeatureSnapshot, 'id'>,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const id = makeSemanticFeatureSnapshotId(record.userId, workspaceId, record.targetType, record.targetId)
  await db.semanticFeatureSnapshots.put({ ...record, id, workspaceId, staleKey: record.stale ? 1 : 0 as 0 | 1 })
}

export async function getSemanticFeatureSnapshotByTarget(
  userId: string,
  targetType: string,
  targetId: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<SemanticFeatureSnapshot | null> {
  const results = await db.semanticFeatureSnapshots
    .where('[userId+workspaceId+targetType+targetId]')
    .equals([userId, workspaceId, targetType, targetId])
    .toArray()
  return (results[0] as unknown as SemanticFeatureSnapshot) ?? null
}

export async function listSemanticFeatureSnapshotsByTarget(
  userId: string,
  targetType: string,
  targetId: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<SemanticFeatureSnapshot[]> {
  const results = await db.semanticFeatureSnapshots
    .where('[userId+workspaceId+targetType+targetId]')
    .equals([userId, workspaceId, targetType, targetId])
    .toArray()
  return results as unknown as SemanticFeatureSnapshot[]
}

export async function markSemanticFeatureSnapshotStale(
  userId: string,
  targetType: string,
  targetId: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const results = await db.semanticFeatureSnapshots
    .where('[userId+workspaceId+targetType+targetId]')
    .equals([userId, workspaceId, targetType, targetId])
    .toArray()
  for (const record of results) {
    if (record.id) await db.semanticFeatureSnapshots.update(record.id, { stale: true, staleKey: 1 as const, updatedAt: new Date().toISOString() })
  }
}

export async function markSemanticFeatureSnapshotExpired(
  userId: string,
  targetType: string,
  targetId: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const results = await db.semanticFeatureSnapshots
    .where('[userId+workspaceId+targetType+targetId]')
    .equals([userId, workspaceId, targetType, targetId])
    .toArray()
  for (const record of results) {
    if (record.id) await db.semanticFeatureSnapshots.update(record.id, { expiredAt: new Date().toISOString(), staleKey: 1 as const, updatedAt: new Date().toISOString() })
  }
}

export async function upsertPreferenceMemory(
  record: Omit<PreferenceMemory, 'id'>,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const id = makePreferenceMemoryId(record.userId, workspaceId, record.candidateType, record.candidateId)
  await db.preferenceMemories.put({ ...record, id, workspaceId })
}

export async function listPreferenceMemories(
  userId: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<PreferenceMemory[]> {
  const results = await db.preferenceMemories
    .where('[userId+workspaceId]')
    .equals([userId, workspaceId])
    .toArray()
  return results as unknown as PreferenceMemory[]
}

export async function upsertHealthSignal(
  record: Omit<HealthSignal, 'id'>,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const id = `${record.userId}_hs_${workspaceId}_${record.signalType}_${record.targetType}_${record.targetId}_${Date.now()}_${collisionSafeSuffix()}`
  await db.healthSignals.add({ ...record, id, workspaceId })
}

export async function listHealthSignals(
  userId: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<HealthSignal[]> {
  const results = await db.healthSignals
    .where('[userId+workspaceId]')
    .equals([userId, workspaceId])
    .toArray()
  return results as unknown as HealthSignal[]
}

export async function upsertGrowthSignal(
  record: Omit<GrowthSignal, 'id'>,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const id = `${record.userId}_gs_${workspaceId}_${record.signalType}_${record.targetType}_${record.targetId}_${Date.now()}_${collisionSafeSuffix()}`
  await db.growthSignals.add({ ...record, id, workspaceId })
}

export async function listGrowthSignals(
  userId: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<GrowthSignal[]> {
  const results = await db.growthSignals
    .where('[userId+workspaceId]')
    .equals([userId, workspaceId])
    .toArray()
  return results as unknown as GrowthSignal[]
}

export async function createMaintenanceAction(
  record: Omit<MaintenanceAction, 'id'>,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const id = `${record.userId}_ma_${workspaceId}_${record.actionType}_${record.targetType}_${record.targetId}_${Date.now()}_${collisionSafeSuffix()}`
  await db.maintenanceActions.add({ ...record, id, workspaceId })
}

export async function updateMaintenanceAction(
  userId: string,
  id: string,
  updates: Partial<MaintenanceAction>,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const existing = await db.maintenanceActions.get(id)
  if (!existing || existing.userId !== userId || existing.workspaceId !== workspaceId) return
  await db.maintenanceActions.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function listMaintenanceActions(
  userId: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<MaintenanceAction[]> {
  const results = await db.maintenanceActions
    .where('[userId+workspaceId]')
    .equals([userId, workspaceId])
    .toArray()
  return results as unknown as MaintenanceAction[]
}

export async function upsertReviewSnapshot(
  record: Omit<ReviewSnapshot, 'id'>,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const id = makeReviewSnapshotId(record.userId, workspaceId, record.scope, record.reviewDate)
  await db.reviewSnapshots.put({ ...record, id, workspaceId })
}

export async function getReviewSnapshot(
  userId: string,
  scope: string,
  reviewDate: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<ReviewSnapshot | null> {
  const results = await db.reviewSnapshots
    .where('[userId+workspaceId+scope+reviewDate]')
    .equals([userId, workspaceId, scope, reviewDate])
    .toArray()
  return (results[0] as unknown as ReviewSnapshot) ?? null
}

export async function upsertDailyBriefSnapshot(
  record: Omit<DailyBriefSnapshot, 'id'>,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const id = makeDailyBriefSnapshotId(record.userId, workspaceId, record.scope, record.briefDate)
  await db.dailyBriefSnapshots.put({ ...record, id, workspaceId })
}

export async function getDailyBriefSnapshot(
  userId: string,
  briefDate: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<DailyBriefSnapshot | null> {
  const results = await db.dailyBriefSnapshots
    .where('[userId+workspaceId+briefDate]')
    .equals([userId, workspaceId, briefDate])
    .toArray()
  return (results[0] as unknown as DailyBriefSnapshot) ?? null
}

export async function upsertSearchIndexRecord(
  record: Omit<SearchIndexRecord, 'id'>,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const id = makeSearchIndexRecordId(record.userId, workspaceId, record.targetType, record.targetId)
  await db.searchIndexRecords.put({ ...record, id, workspaceId, staleKey: record.stale ? 1 : 0 as 0 | 1 })
}

export async function searchIndexRecords(
  userId: string,
  query: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<SearchIndexRecord[]> {
  const all = await db.searchIndexRecords
    .where('[userId+workspaceId]')
    .equals([userId, workspaceId])
    .toArray()
  const lowerQuery = query.toLowerCase()
  return all.filter(
    (r) =>
      !r.stale &&
      !r.expiredAt &&
      r.keywordTokens.some((t) => t.toLowerCase().includes(lowerQuery)),
  ) as unknown as SearchIndexRecord[]
}

export async function markSearchIndexRecordStale(
  userId: string,
  targetType: string,
  targetId: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const results = await db.searchIndexRecords
    .where('[userId+workspaceId+targetType+targetId]')
    .equals([userId, workspaceId, targetType, targetId])
    .toArray()
  for (const record of results) {
    if (record.id) await db.searchIndexRecords.update(record.id, { stale: true, staleKey: 1 as const, updatedAt: new Date().toISOString() })
  }
}

export async function markSearchIndexRecordExpired(
  userId: string,
  targetType: string,
  targetId: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const results = await db.searchIndexRecords
    .where('[userId+workspaceId+targetType+targetId]')
    .equals([userId, workspaceId, targetType, targetId])
    .toArray()
  for (const record of results) {
    if (record.id) await db.searchIndexRecords.update(record.id, { expiredAt: new Date().toISOString(), staleKey: 1 as const, updatedAt: new Date().toISOString() })
  }
}

export async function getIntelligenceSummaryForTarget(
  userId: string,
  targetType: string,
  targetId: string,
  options?: { workspaceId?: string },
): Promise<IntelligenceSummaryViewModel> {
  const workspaceId = options?.workspaceId ?? DEFAULT_WORKSPACE_ID
  const [localTextFeature, semanticFeature] = await Promise.all([
    getLocalTextFeatureSnapshotByTarget(userId, targetType, targetId, workspaceId),
    getSemanticFeatureSnapshotByTarget(userId, targetType, targetId, workspaceId),
  ])
  return { targetType, targetId, localTextFeature, semanticFeature }
}

export async function listPendingMaintenanceActions(
  userId: string,
  options?: { workspaceId?: string },
): Promise<MaintenanceAction[]> {
  const workspaceId = options?.workspaceId ?? DEFAULT_WORKSPACE_ID
  const all = await listMaintenanceActions(userId, workspaceId)
  return all.filter((a) => a.status === 'pending')
}

export async function getReviewIntelligenceViewModel(
  userId: string,
  scope: string,
  options?: { workspaceId?: string },
): Promise<ReviewIntelligenceViewModel> {
  const workspaceId = options?.workspaceId ?? DEFAULT_WORKSPACE_ID
  const reviewDate = new Date().toISOString().slice(0, 10)
  const [review, healthSignals, growthSignals, maintenanceActions] = await Promise.all([
    getReviewSnapshot(userId, scope, reviewDate, workspaceId),
    listHealthSignals(userId, workspaceId),
    listGrowthSignals(userId, workspaceId),
    listMaintenanceActions(userId, workspaceId),
  ])
  return { scope, reviewDate, review, healthSignals, growthSignals, maintenanceActions }
}

export async function getDailyBriefIntelligenceViewModel(
  userId: string,
  date: string,
  options?: { workspaceId?: string },
): Promise<DailyBriefIntelligenceViewModel> {
  const workspaceId = options?.workspaceId ?? DEFAULT_WORKSPACE_ID
  const brief = await getDailyBriefSnapshot(userId, date, workspaceId)
  return { briefDate: date, brief }
}

export async function getSearchIndexViewModel(
  userId: string,
  query: string,
  options?: { workspaceId?: string },
): Promise<SearchIndexViewModel> {
  const workspaceId = options?.workspaceId ?? DEFAULT_WORKSPACE_ID
  const results = await searchIndexRecords(userId, query, workspaceId)
  return { query, results, total: results.length }
}

export async function upsertEmbeddingVector(
  record: Omit<EmbeddingVector, 'id'>,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const id = makeEmbeddingVectorId(record.userId, workspaceId, record.targetType, record.targetId)
  await db.embeddingVectors.put({ ...record, id, workspaceId })
}

export async function getEmbeddingVectorByTarget(
  userId: string,
  targetType: string,
  targetId: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<EmbeddingVector | null> {
  const results = await db.embeddingVectors
    .where('[userId+workspaceId+targetType+targetId]')
    .equals([userId, workspaceId, targetType, targetId])
    .toArray()
  return (results[0] as unknown as EmbeddingVector) ?? null
}

export async function upsertAlgorithmAuditLog(
  record: Omit<AlgorithmAuditLog, 'id'>,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<string> {
  const id = makeAlgorithmAuditLogId(record.userId, workspaceId, record.capability, Date.now())
  await db.algorithmAuditLogs.put({ ...record, id, workspaceId })
  return id
}

export async function listAuditLogs(
  userId: string,
  capability?: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<AlgorithmAuditLog[]> {
  const results = await db.algorithmAuditLogs
    .where('[userId+workspaceId]')
    .equals([userId, workspaceId])
    .toArray()
  if (capability) {
    return results.filter(r => r.capability === capability) as unknown as AlgorithmAuditLog[]
  }
  return results as unknown as AlgorithmAuditLog[]
}

export async function upsertModelSmokeTestRun(
  record: Omit<ModelSmokeTestRun, 'id'>,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<string> {
  const id = makeModelSmokeTestRunId(record.userId, workspaceId, Date.now())
  await db.modelSmokeTestRuns.put({ ...record, id, workspaceId })
  return id
}

export async function upsertModelRuntimeStatus(
  record: Omit<ModelRuntimeStatus, 'id'>,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const id = makeModelRuntimeStatusId(record.userId, workspaceId, record.providerId)
  await db.modelRuntimeStatuses.put({ ...record, id, workspaceId })
}

export async function getModelRuntimeStatus(
  userId: string,
  providerId: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<ModelRuntimeStatus | null> {
  const results = await db.modelRuntimeStatuses
    .where('[userId+workspaceId+providerId]')
    .equals([userId, workspaceId, providerId])
    .toArray()
  return (results[0] as unknown as ModelRuntimeStatus) ?? null
}
