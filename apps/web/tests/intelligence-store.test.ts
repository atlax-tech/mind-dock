import { afterEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { DEFAULT_WORKSPACE_ID } from '@atlax/domain'
import {
  makeSearchIndexRecordId,
} from '@atlax/domain'
import {
  upsertLocalTextFeatureSnapshot,
  getLocalTextFeatureSnapshotByTarget,
  markLocalTextFeatureSnapshotStale,
  markLocalTextFeatureSnapshotExpired,
  upsertSemanticFeatureSnapshot,
  getSemanticFeatureSnapshotByTarget,
  markSemanticFeatureSnapshotStale,
  markSemanticFeatureSnapshotExpired,
  upsertPreferenceMemory,
  listPreferenceMemories,
  upsertHealthSignal,
  listHealthSignals,
  upsertGrowthSignal,
  listGrowthSignals,
  createMaintenanceAction,
  updateMaintenanceAction,
  listMaintenanceActions,
  upsertReviewSnapshot,
  getReviewSnapshot,
  upsertDailyBriefSnapshot,
  getDailyBriefSnapshot,
  upsertSearchIndexRecord,
  searchIndexRecords,
  markSearchIndexRecordStale,
  markSearchIndexRecordExpired,
  getIntelligenceSummaryForTarget,
  listPendingMaintenanceActions,
  getReviewIntelligenceViewModel,
  getDailyBriefIntelligenceViewModel,
  getSearchIndexViewModel,
} from '@/lib/intelligenceRepository'

const USER_A = 'user_test_a'
const WS_DEFAULT = DEFAULT_WORKSPACE_ID
const WS_OTHER = 'workspace_other'

async function cleanAll() {
  await db.table('localTextFeatureSnapshots').clear()
  await db.table('semanticFeatureSnapshots').clear()
  await db.table('preferenceMemories').clear()
  await db.table('healthSignals').clear()
  await db.table('growthSignals').clear()
  await db.table('maintenanceActions').clear()
  await db.table('reviewSnapshots').clear()
  await db.table('dailyBriefSnapshots').clear()
  await db.table('searchIndexRecords').clear()
}

function nowISO() {
  return new Date().toISOString()
}

function makeLocalTextRecord(userId: string, workspaceId: string, targetType: string, targetId: string) {
  return {
    userId,
    workspaceId,
    targetType,
    targetId,
    contentHash: 'hash123',
    language: 'en',
    keywords: ['test'],
    entities: ['entity1'],
    compactText: 'test summary',
    lengthMetrics: { charCount: 100 },
    structureHints: ['paragraph'],
    source: 'local',
    reason: 'test',
    evidence: 'none',
    confidence: 0.9,
    safetyLevel: 'safe',
    stale: false,
    staleKey: 0 as const,
    expiredAt: null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  }
}

function makeSemanticRecord(userId: string, workspaceId: string, targetType: string, targetId: string) {
  return {
    userId,
    workspaceId,
    targetType,
    targetId,
    contentHash: 'hash123',
    modelProvider: 'test',
    modelName: 'test-model',
    modelVersion: '1.0',
    embeddingDim: 768,
    embeddingRef: 'ref://test',
    semanticSummary: 'test semantic summary',
    intent: 'inform',
    topics: ['topic1'],
    source: 'local',
    reason: 'test',
    evidence: 'none',
    confidence: 0.8,
    safetyLevel: 'safe',
    stale: false,
    staleKey: 0 as const,
    expiredAt: null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  }
}

function makePreferenceRecord(userId: string, workspaceId: string, candidateType: string, candidateId: string) {
  return {
    userId,
    workspaceId,
    candidateType,
    candidateId,
    shownCount: 1,
    acceptedCount: 0,
    rejectedCount: 0,
    ignoredCount: 0,
    modifiedCount: 0,
    positiveWeight: 0.5,
    negativeWeight: 0.0,
    lastFeedbackAt: null,
    source: 'test',
    reason: 'test',
    evidence: 'none',
    confidence: 0.7,
    safetyLevel: 'safe',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  }
}

function makeHealthSignalRecord(userId: string, workspaceId: string, signalType: string, targetType: string, targetId: string) {
  return {
    userId,
    workspaceId,
    signalType,
    targetType,
    targetId,
    severity: 'warning',
    status: 'active',
    reason: 'test signal',
    evidence: 'none',
    confidence: 0.8,
    safetyLevel: 'safe',
    source: 'detector',
    detectedAt: nowISO(),
    resolvedAt: null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  }
}

function makeGrowthSignalRecord(userId: string, workspaceId: string, signalType: string, targetType: string, targetId: string) {
  return {
    userId,
    workspaceId,
    signalType,
    targetType,
    targetId,
    opportunityType: 'expand',
    status: 'active',
    reason: 'test growth',
    evidence: 'none',
    confidence: 0.7,
    safetyLevel: 'safe',
    source: 'detector',
    detectedAt: nowISO(),
    dismissedAt: null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  }
}

function makeMaintenanceActionRecord(userId: string, workspaceId: string, actionType: string, targetType: string, targetId: string) {
  return {
    userId,
    workspaceId,
    actionType,
    targetType,
    targetId,
    status: 'pending',
    reversible: true,
    proposedPatch: null,
    sourceSignalId: null,
    reason: 'test action',
    evidence: 'none',
    confidence: 0.9,
    safetyLevel: 'safe',
    source: 'test',
    createdAt: nowISO(),
    updatedAt: nowISO(),
    executedAt: null,
    revertedAt: null,
  }
}

function makeReviewRecord(userId: string, workspaceId: string, scope: string, reviewDate: string) {
  return {
    userId,
    workspaceId,
    scope,
    reviewDate,
    healthSummary: null,
    growthSummary: null,
    recommendationSummary: null,
    maintenanceSummary: null,
    generatedAt: nowISO(),
    source: 'test',
    reason: 'test',
    evidence: 'none',
    confidence: 0.9,
    safetyLevel: 'safe',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  }
}

function makeDailyBriefRecord(userId: string, workspaceId: string, briefDate: string, scope: string) {
  return {
    userId,
    workspaceId,
    briefDate,
    scope,
    yesterdayProgress: null,
    todayRecommendations: null,
    knowledgeHealth: null,
    quickNoteStatus: null,
    draftStatus: null,
    mindSummary: null,
    generatedAt: nowISO(),
    source: 'test',
    reason: 'test',
    evidence: 'none',
    confidence: 0.9,
    safetyLevel: 'safe',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  }
}

function makeSearchIndexRecord(userId: string, workspaceId: string, targetType: string, targetId: string) {
  return {
    userId,
    workspaceId,
    targetType,
    targetId,
    title: 'Test Document',
    excerpt: 'A test excerpt',
    keywordTokens: ['test', 'document'],
    semanticRef: null,
    contentHash: 'hash123',
    stale: false,
    staleKey: 0 as const,
    expiredAt: null,
    source: 'local',
    reason: 'test',
    evidence: 'none',
    confidence: 0.9,
    safetyLevel: 'safe',
    updatedAt: nowISO(),
    createdAt: nowISO(),
  }
}

describe('Intelligence Store Schema', () => {
  afterEach(cleanAll)

  it('should have all 9 intelligence tables defined', () => {
    const tableNames = db.tables.map(t => t.name)
    expect(tableNames).toContain('localTextFeatureSnapshots')
    expect(tableNames).toContain('semanticFeatureSnapshots')
    expect(tableNames).toContain('preferenceMemories')
    expect(tableNames).toContain('healthSignals')
    expect(tableNames).toContain('growthSignals')
    expect(tableNames).toContain('maintenanceActions')
    expect(tableNames).toContain('reviewSnapshots')
    expect(tableNames).toContain('dailyBriefSnapshots')
    expect(tableNames).toContain('searchIndexRecords')
  })

  it('should have correct indexes on localTextFeatureSnapshots', () => {
    const table = db.table('localTextFeatureSnapshots')
    const indexNames = table.schema.indexes.map(i => JSON.stringify(i.keyPath))
    expect(indexNames).toContain(JSON.stringify(['userId', 'workspaceId']))
    expect(indexNames).toContain(JSON.stringify(['userId', 'workspaceId', 'targetType', 'targetId']))
    expect(indexNames).toContain(JSON.stringify(['userId', 'workspaceId', 'targetType', 'targetId', 'contentHash']))
    expect(indexNames).toContain(JSON.stringify(['userId', 'workspaceId', 'staleKey']))
    expect(indexNames).toContain(JSON.stringify(['userId', 'workspaceId', 'expiredAt']))
  })

  it('should not lose existing table data after v27 migration', async () => {
    const dockItemId = await db.table('dockItems').add({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      rawText: 'test migration data',
      topic: null,
      sourceType: 'text',
      status: 'pending',
      suggestions: [],
      userTags: [],
      selectedActions: [],
      selectedProject: null,
      sourceId: null,
      parentId: null,
      processedAt: null,
      createdAt: new Date(),
    })
    const item = await db.table('dockItems').get(dockItemId)
    expect(item).toBeDefined()
    expect(item.rawText).toBe('test migration data')
    await db.table('dockItems').delete(dockItemId)
  })
})

describe('Intelligence Store Repository CRUD', () => {
  afterEach(cleanAll)

  it('should upsert and get LocalTextFeatureSnapshot', async () => {
    const record = makeLocalTextRecord(USER_A, WS_DEFAULT, 'dockItem', '1')
    await upsertLocalTextFeatureSnapshot(record, WS_DEFAULT)
    const result = await getLocalTextFeatureSnapshotByTarget(USER_A, 'dockItem', '1', WS_DEFAULT)
    expect(result).not.toBeNull()
    expect(result?.userId).toBe(USER_A)
    expect(result?.targetType).toBe('dockItem')
    expect(result?.targetId).toBe('1')
    expect(result?.contentHash).toBe('hash123')
  })

  it('should upsert and get SemanticFeatureSnapshot', async () => {
    const record = makeSemanticRecord(USER_A, WS_DEFAULT, 'dockItem', '1')
    await upsertSemanticFeatureSnapshot(record, WS_DEFAULT)
    const result = await getSemanticFeatureSnapshotByTarget(USER_A, 'dockItem', '1', WS_DEFAULT)
    expect(result).not.toBeNull()
    expect(result?.embeddingRef).toBe('ref://test')
  })

  it('should upsert and list PreferenceMemory', async () => {
    const record = makePreferenceRecord(USER_A, WS_DEFAULT, 'tag', 'tag1')
    await upsertPreferenceMemory(record, WS_DEFAULT)
    const results = await listPreferenceMemories(USER_A, WS_DEFAULT)
    expect(results).toHaveLength(1)
    expect(results[0].candidateType).toBe('tag')
  })

  it('should upsert and list HealthSignal', async () => {
    const record = makeHealthSignalRecord(USER_A, WS_DEFAULT, 'stale', 'dockItem', '1')
    await upsertHealthSignal(record, WS_DEFAULT)
    const results = await listHealthSignals(USER_A, WS_DEFAULT)
    expect(results).toHaveLength(1)
    expect(results[0].signalType).toBe('stale')
  })

  it('should upsert and list GrowthSignal', async () => {
    const record = makeGrowthSignalRecord(USER_A, WS_DEFAULT, 'opportunity', 'dockItem', '1')
    await upsertGrowthSignal(record, WS_DEFAULT)
    const results = await listGrowthSignals(USER_A, WS_DEFAULT)
    expect(results).toHaveLength(1)
    expect(results[0].opportunityType).toBe('expand')
  })

  it('should create, update, and list MaintenanceAction', async () => {
    const record = makeMaintenanceActionRecord(USER_A, WS_DEFAULT, 'archive', 'dockItem', '1')
    await createMaintenanceAction(record, WS_DEFAULT)
    let results = await listMaintenanceActions(USER_A, WS_DEFAULT)
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('pending')

    await updateMaintenanceAction(USER_A, results[0].id, { status: 'executed' }, WS_DEFAULT)
    results = await listMaintenanceActions(USER_A, WS_DEFAULT)
    expect(results[0].status).toBe('executed')
  })

  it('should upsert and get ReviewSnapshot', async () => {
    const record = makeReviewRecord(USER_A, WS_DEFAULT, 'weekly', '2024-01-01')
    await upsertReviewSnapshot(record, WS_DEFAULT)
    const result = await getReviewSnapshot(USER_A, 'weekly', '2024-01-01', WS_DEFAULT)
    expect(result).not.toBeNull()
    expect(result?.scope).toBe('weekly')
  })

  it('should upsert and get DailyBriefSnapshot', async () => {
    const record = makeDailyBriefRecord(USER_A, WS_DEFAULT, '2024-01-01', 'daily')
    await upsertDailyBriefSnapshot(record, WS_DEFAULT)
    const result = await getDailyBriefSnapshot(USER_A, '2024-01-01', WS_DEFAULT)
    expect(result).not.toBeNull()
    expect(result?.briefDate).toBe('2024-01-01')
  })

  it('should upsert and search SearchIndexRecord', async () => {
    const record = makeSearchIndexRecord(USER_A, WS_DEFAULT, 'dockItem', '1')
    await upsertSearchIndexRecord(record, WS_DEFAULT)
    const results = await searchIndexRecords(USER_A, 'test', WS_DEFAULT)
    expect(results.length).toBeGreaterThanOrEqual(1)
  })
})

describe('Intelligence Store Stale/Expired', () => {
  afterEach(cleanAll)

  it('should mark LocalTextFeatureSnapshot stale', async () => {
    const record = makeLocalTextRecord(USER_A, WS_DEFAULT, 'dockItem', '1')
    await upsertLocalTextFeatureSnapshot(record, WS_DEFAULT)
    await markLocalTextFeatureSnapshotStale(USER_A, 'dockItem', '1', WS_DEFAULT)
    const result = await getLocalTextFeatureSnapshotByTarget(USER_A, 'dockItem', '1', WS_DEFAULT)
    expect(result).not.toBeNull()
    expect(result?.stale).toBe(true)
  })

  it('should mark LocalTextFeatureSnapshot expired', async () => {
    const record = makeLocalTextRecord(USER_A, WS_DEFAULT, 'dockItem', '1')
    await upsertLocalTextFeatureSnapshot(record, WS_DEFAULT)
    await markLocalTextFeatureSnapshotExpired(USER_A, 'dockItem', '1', WS_DEFAULT)
    const result = await getLocalTextFeatureSnapshotByTarget(USER_A, 'dockItem', '1', WS_DEFAULT)
    expect(result).not.toBeNull()
    expect(result?.expiredAt).not.toBeNull()
  })

  it('should mark SemanticFeatureSnapshot stale and expired', async () => {
    const record = makeSemanticRecord(USER_A, WS_DEFAULT, 'dockItem', '1')
    await upsertSemanticFeatureSnapshot(record, WS_DEFAULT)
    await markSemanticFeatureSnapshotStale(USER_A, 'dockItem', '1', WS_DEFAULT)
    await markSemanticFeatureSnapshotExpired(USER_A, 'dockItem', '1', WS_DEFAULT)
    const result = await getSemanticFeatureSnapshotByTarget(USER_A, 'dockItem', '1', WS_DEFAULT)
    expect(result).not.toBeNull()
    expect(result?.stale).toBe(true)
    expect(result?.expiredAt).not.toBeNull()
  })

  it('should mark SearchIndexRecord stale and expired', async () => {
    const record = makeSearchIndexRecord(USER_A, WS_DEFAULT, 'dockItem', '1')
    await upsertSearchIndexRecord(record, WS_DEFAULT)
    await markSearchIndexRecordStale(USER_A, 'dockItem', '1', WS_DEFAULT)
    await markSearchIndexRecordExpired(USER_A, 'dockItem', '1', WS_DEFAULT)
    const id = makeSearchIndexRecordId(USER_A, WS_DEFAULT, 'dockItem', '1')
    const result = await db.table('searchIndexRecords').get(id)
    expect(result.stale).toBe(true)
    expect(result.expiredAt).not.toBeNull()
  })
})

describe('Intelligence Store Upsert Dedup', () => {
  afterEach(cleanAll)

  it('should not create duplicate LocalTextFeatureSnapshot on repeated upsert', async () => {
    const record = makeLocalTextRecord(USER_A, WS_DEFAULT, 'dockItem', '1')
    await upsertLocalTextFeatureSnapshot(record, WS_DEFAULT)
    await upsertLocalTextFeatureSnapshot({ ...record, compactText: 'updated' }, WS_DEFAULT)
    const all = await db.table('localTextFeatureSnapshots').toArray()
    expect(all).toHaveLength(1)
    expect(all[0].compactText).toBe('updated')
  })

  it('should not create duplicate SemanticFeatureSnapshot on repeated upsert', async () => {
    const record = makeSemanticRecord(USER_A, WS_DEFAULT, 'dockItem', '1')
    await upsertSemanticFeatureSnapshot(record, WS_DEFAULT)
    await upsertSemanticFeatureSnapshot({ ...record, semanticSummary: 'updated' }, WS_DEFAULT)
    const all = await db.table('semanticFeatureSnapshots').toArray()
    expect(all).toHaveLength(1)
    expect(all[0].semanticSummary).toBe('updated')
  })

  it('should not create duplicate ReviewSnapshot on repeated upsert', async () => {
    const record = makeReviewRecord(USER_A, WS_DEFAULT, 'weekly', '2024-01-01')
    await upsertReviewSnapshot(record, WS_DEFAULT)
    await upsertReviewSnapshot({ ...record, reason: 'updated' }, WS_DEFAULT)
    const all = await db.table('reviewSnapshots').toArray()
    expect(all).toHaveLength(1)
    expect(all[0].reason).toBe('updated')
  })

  it('should allow multiple HealthSignals for same target', async () => {
    const record1 = makeHealthSignalRecord(USER_A, WS_DEFAULT, 'stale', 'dockItem', '1')
    const record2 = makeHealthSignalRecord(USER_A, WS_DEFAULT, 'orphan', 'dockItem', '1')
    await upsertHealthSignal(record1, WS_DEFAULT)
    await upsertHealthSignal(record2, WS_DEFAULT)
    const results = await listHealthSignals(USER_A, WS_DEFAULT)
    expect(results).toHaveLength(2)
  })
})

describe('Intelligence Store Workspace Isolation', () => {
  afterEach(cleanAll)

  it('should isolate LocalTextFeatureSnapshot by workspace', async () => {
    const recordA = makeLocalTextRecord(USER_A, WS_DEFAULT, 'dockItem', '1')
    const recordB = makeLocalTextRecord(USER_A, WS_OTHER, 'dockItem', '1')
    await upsertLocalTextFeatureSnapshot(recordA, WS_DEFAULT)
    await upsertLocalTextFeatureSnapshot(recordB, WS_OTHER)

    const resultA = await getLocalTextFeatureSnapshotByTarget(USER_A, 'dockItem', '1', WS_DEFAULT)
    const resultB = await getLocalTextFeatureSnapshotByTarget(USER_A, 'dockItem', '1', WS_OTHER)

    expect(resultA).not.toBeNull()
    expect(resultB).not.toBeNull()
    expect(resultA?.workspaceId).toBe(WS_DEFAULT)
    expect(resultB?.workspaceId).toBe(WS_OTHER)
    expect(resultA?.id).not.toBe(resultB?.id)
  })

  it('should isolate HealthSignal by workspace', async () => {
    const recordA = makeHealthSignalRecord(USER_A, WS_DEFAULT, 'stale', 'dockItem', '1')
    const recordB = makeHealthSignalRecord(USER_A, WS_OTHER, 'stale', 'dockItem', '1')
    await upsertHealthSignal(recordA, WS_DEFAULT)
    await upsertHealthSignal(recordB, WS_OTHER)

    const resultsA = await listHealthSignals(USER_A, WS_DEFAULT)
    const resultsB = await listHealthSignals(USER_A, WS_OTHER)

    expect(resultsA).toHaveLength(1)
    expect(resultsB).toHaveLength(1)
    expect(resultsA[0].workspaceId).toBe(WS_DEFAULT)
    expect(resultsB[0].workspaceId).toBe(WS_OTHER)
  })

  it('should isolate ReviewSnapshot by workspace', async () => {
    const recordA = makeReviewRecord(USER_A, WS_DEFAULT, 'weekly', '2024-01-01')
    const recordB = makeReviewRecord(USER_A, WS_OTHER, 'weekly', '2024-01-01')
    await upsertReviewSnapshot(recordA, WS_DEFAULT)
    await upsertReviewSnapshot(recordB, WS_OTHER)

    const resultA = await getReviewSnapshot(USER_A, 'weekly', '2024-01-01', WS_DEFAULT)
    const resultB = await getReviewSnapshot(USER_A, 'weekly', '2024-01-01', WS_OTHER)

    expect(resultA).not.toBeNull()
    expect(resultB).not.toBeNull()
    expect(resultA?.workspaceId).toBe(WS_DEFAULT)
    expect(resultB?.workspaceId).toBe(WS_OTHER)
  })

  it('should isolate DailyBriefSnapshot by workspace', async () => {
    const recordA = makeDailyBriefRecord(USER_A, WS_DEFAULT, '2024-01-01', 'daily')
    const recordB = makeDailyBriefRecord(USER_A, WS_OTHER, '2024-01-01', 'daily')
    await upsertDailyBriefSnapshot(recordA, WS_DEFAULT)
    await upsertDailyBriefSnapshot(recordB, WS_OTHER)

    const resultA = await getDailyBriefSnapshot(USER_A, '2024-01-01', WS_DEFAULT)
    const resultB = await getDailyBriefSnapshot(USER_A, '2024-01-01', WS_OTHER)

    expect(resultA).not.toBeNull()
    expect(resultB).not.toBeNull()
    expect(resultA?.workspaceId).toBe(WS_DEFAULT)
    expect(resultB?.workspaceId).toBe(WS_OTHER)
  })

  it('should isolate stale/expired queries by workspace using staleKey index', async () => {
    const recordA = makeLocalTextRecord(USER_A, WS_DEFAULT, 'dockItem', '1')
    const recordB = makeLocalTextRecord(USER_A, WS_OTHER, 'dockItem', '2')
    await upsertLocalTextFeatureSnapshot(recordA, WS_DEFAULT)
    await upsertLocalTextFeatureSnapshot(recordB, WS_OTHER)

    await markLocalTextFeatureSnapshotStale(USER_A, 'dockItem', '1', WS_DEFAULT)

    const staleInDefault = await db.table('localTextFeatureSnapshots')
      .where('[userId+workspaceId+staleKey]').equals([USER_A, WS_DEFAULT, 1]).toArray()
    const staleInOther = await db.table('localTextFeatureSnapshots')
      .where('[userId+workspaceId+staleKey]').equals([USER_A, WS_OTHER, 1]).toArray()

    expect(staleInDefault).toHaveLength(1)
    expect(staleInOther).toHaveLength(0)
  })
})

describe('Intelligence Store Selectors', () => {
  afterEach(cleanAll)

  it('should return stable fallback when no data for getIntelligenceSummaryForTarget', async () => {
    const vm = await getIntelligenceSummaryForTarget(USER_A, 'dockItem', '999')
    expect(vm.targetType).toBe('dockItem')
    expect(vm.targetId).toBe('999')
    expect(vm.localTextFeature).toBeNull()
    expect(vm.semanticFeature).toBeNull()
  })

  it('should return aggregated data for getIntelligenceSummaryForTarget', async () => {
    const ltRecord = makeLocalTextRecord(USER_A, WS_DEFAULT, 'dockItem', '1')
    const sfRecord = makeSemanticRecord(USER_A, WS_DEFAULT, 'dockItem', '1')
    await upsertLocalTextFeatureSnapshot(ltRecord, WS_DEFAULT)
    await upsertSemanticFeatureSnapshot(sfRecord, WS_DEFAULT)

    const vm = await getIntelligenceSummaryForTarget(USER_A, 'dockItem', '1')
    expect(vm.localTextFeature).not.toBeNull()
    expect(vm.semanticFeature).not.toBeNull()
  })

  it('should return empty array for listPendingMaintenanceActions when no data', async () => {
    const results = await listPendingMaintenanceActions(USER_A)
    expect(results).toEqual([])
  })

  it('should return pending maintenance actions', async () => {
    const record = makeMaintenanceActionRecord(USER_A, WS_DEFAULT, 'archive', 'dockItem', '1')
    await createMaintenanceAction(record, WS_DEFAULT)
    const results = await listPendingMaintenanceActions(USER_A)
    expect(results).toHaveLength(1)
  })

  it('should return stable fallback for getReviewIntelligenceViewModel', async () => {
    const vm = await getReviewIntelligenceViewModel(USER_A, 'weekly')
    expect(vm.review).toBeNull()
    expect(vm.healthSignals).toEqual([])
    expect(vm.growthSignals).toEqual([])
    expect(vm.maintenanceActions).toEqual([])
  })

  it('should return stable fallback for getDailyBriefIntelligenceViewModel', async () => {
    const vm = await getDailyBriefIntelligenceViewModel(USER_A, '2024-01-01')
    expect(vm.brief).toBeNull()
  })

  it('should return stable fallback for getSearchIndexViewModel', async () => {
    const vm = await getSearchIndexViewModel(USER_A, 'nonexistent')
    expect(vm.results).toEqual([])
    expect(vm.total).toBe(0)
  })
})

describe('Intelligence Store Multi-Instance ID Collision Safety', () => {
  afterEach(cleanAll)

  it('should create two HealthSignals with same target even when Date.now is mocked to same value', async () => {
    const originalDateNow = Date.now
    Date.now = () => 1000

    try {
      const record1 = makeHealthSignalRecord(USER_A, WS_DEFAULT, 'stale', 'dockItem', '1')
      const record2 = makeHealthSignalRecord(USER_A, WS_DEFAULT, 'orphan', 'dockItem', '1')
      await upsertHealthSignal(record1, WS_DEFAULT)
      await upsertHealthSignal(record2, WS_DEFAULT)
      const results = await listHealthSignals(USER_A, WS_DEFAULT)
      expect(results).toHaveLength(2)
    } finally {
      Date.now = originalDateNow
    }
  })

  it('should create two GrowthSignals with same target even when Date.now is mocked to same value', async () => {
    const originalDateNow = Date.now
    Date.now = () => 1000

    try {
      const record1 = makeGrowthSignalRecord(USER_A, WS_DEFAULT, 'opportunity', 'dockItem', '1')
      const record2 = makeGrowthSignalRecord(USER_A, WS_DEFAULT, 'trend', 'dockItem', '1')
      await upsertGrowthSignal(record1, WS_DEFAULT)
      await upsertGrowthSignal(record2, WS_DEFAULT)
      const results = await listGrowthSignals(USER_A, WS_DEFAULT)
      expect(results).toHaveLength(2)
    } finally {
      Date.now = originalDateNow
    }
  })

  it('should create two MaintenanceActions with same target even when Date.now is mocked to same value', async () => {
    const originalDateNow = Date.now
    Date.now = () => 1000

    try {
      const record1 = makeMaintenanceActionRecord(USER_A, WS_DEFAULT, 'archive', 'dockItem', '1')
      const record2 = makeMaintenanceActionRecord(USER_A, WS_DEFAULT, 'merge', 'dockItem', '1')
      await createMaintenanceAction(record1, WS_DEFAULT)
      await createMaintenanceAction(record2, WS_DEFAULT)
      const results = await listMaintenanceActions(USER_A, WS_DEFAULT)
      expect(results).toHaveLength(2)
    } finally {
      Date.now = originalDateNow
    }
  })
})
