import { afterEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'
import { DEFAULT_WORKSPACE_ID } from '@atlax/domain'
import { computeContentHash, isContentDirty } from '@/lib/contentHash'
import {
  enqueue,
  dequeue,
  retry,
  fail,
  processNext,
  processBatch,
  listOpenJobs,
  listPendingModelJobs,
  reactivatePendingModelJobs,
} from '@/lib/backgroundJobQueue'
import { onContentChanged } from '@/lib/contentChangeService'
import { resetProviders, initDevProviders, getCapabilityStatus } from '@/lib/modelProvider'
import { upsertLocalTextFeatureSnapshot, upsertSemanticFeatureSnapshot, upsertModelRuntimeStatus, getEmbeddingVectorByTarget, setEmbeddingEnabledPref, setReasoningEnabledPref, getModelRuntimeStatus } from '@/lib/intelligenceRepository'
import * as localModelRuntimeService from '@/lib/localModelRuntimeService'
import { processJob } from '@/lib/jobProcessor'
import { localTextFeatureEngine } from '@/lib/localTextFeatureEngine'
import { semanticFeatureEngine } from '@/lib/semanticFeatureEngine'

const USER_A = 'user_test_a'
const WS_DEFAULT = DEFAULT_WORKSPACE_ID
const WS_OTHER = 'workspace_other'

async function cleanAll() {
  await db.table('backgroundJobs').clear()
  await db.table('localTextFeatureSnapshots').clear()
  await db.table('semanticFeatureSnapshots').clear()
  await db.table('userPreferences').clear()
  await db.table('modelRuntimeStatuses').clear()
  await db.table('dockItems').clear()
  await db.table('embeddingVectors').clear()
  await db.table('algorithmAuditLogs').clear()
}

function nowISO() {
  return new Date().toISOString()
}

function makeModelRuntimeStatus(userId: string, workspaceId: string, overrides?: Partial<{ mode: 'model_available' | 'degraded' | 'unavailable' | 'core'; embeddingStatus: 'available' | 'unavailable'; reasoningStatus: 'available' | 'unavailable' }>) {
  return {
    userId,
    workspaceId,
    providerId: 'ollama-openai-compatible',
    providerName: 'ollama-openai-compatible',
    mode: overrides?.mode ?? 'model_available' as const,
    embeddingStatus: overrides?.embeddingStatus ?? 'available' as const,
    reasoningStatus: overrides?.reasoningStatus ?? 'available' as const,
    embeddingModelId: 'qwen3-embedding:0.6b',
    reasoningModelId: 'qwen3:1.7b',
    lastProbeAt: nowISO(),
    lastProbeSuccess: true,
    lastSuccessfulProbeAt: nowISO(),
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  }
}

function makeLocalTextRecord(userId: string, workspaceId: string, targetType: string, targetId: string, contentHash: string) {
  return {
    userId,
    workspaceId,
    targetType,
    targetId,
    contentHash,
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

describe('contentHash', () => {
  it('computeContentHash returns deterministic hash with ch_ prefix', () => {
    const hash = computeContentHash('hello world')
    expect(hash).toMatch(/^ch_[0-9a-f]+$/)
  })

  it('computeContentHash same input returns same output', () => {
    const hash1 = computeContentHash('hello world')
    const hash2 = computeContentHash('hello world')
    expect(hash1).toBe(hash2)
  })

  it('computeContentHash different input returns different output', () => {
    const hash1 = computeContentHash('hello world')
    const hash2 = computeContentHash('goodbye world')
    expect(hash1).not.toBe(hash2)
  })

  it('isContentDirty returns true when no snapshot exists', async () => {
    const dirty = await isContentDirty(USER_A, 'dockItem', '1', 'ch_abc123')
    expect(dirty).toBe(true)
  })

  it('isContentDirty returns false when same contentHash exists', async () => {
    const contentHash = 'ch_abc123'
    const record = makeLocalTextRecord(USER_A, WS_DEFAULT, 'dockItem', '1', contentHash)
    await upsertLocalTextFeatureSnapshot(record, WS_DEFAULT)
    const dirty = await isContentDirty(USER_A, 'dockItem', '1', contentHash, WS_DEFAULT)
    expect(dirty).toBe(false)
  })

  it('isContentDirty returns true when different contentHash exists', async () => {
    const record = makeLocalTextRecord(USER_A, WS_DEFAULT, 'dockItem', '1', 'ch_old')
    await upsertLocalTextFeatureSnapshot(record, WS_DEFAULT)
    const dirty = await isContentDirty(USER_A, 'dockItem', '1', 'ch_new', WS_DEFAULT)
    expect(dirty).toBe(true)
  })
})

describe('enqueue', () => {
  afterEach(cleanAll)

  it('enqueue creates a pending job with correct defaults', async () => {
    const job = await enqueue(USER_A, 'recompute_local_features', 'dockItem', '1', 'ch_abc')
    expect(job.userId).toBe(USER_A)
    expect(job.workspaceId).toBe(WS_DEFAULT)
    expect(job.jobType).toBe('recompute_local_features')
    expect(job.targetType).toBe('dockItem')
    expect(job.targetId).toBe('1')
    expect(job.contentHash).toBe('ch_abc')
    expect(job.status).toBe('pending')
    expect(job.priority).toBe(10)
    expect(job.attempts).toBe(0)
    expect(job.maxAttempts).toBe(3)
    expect(job.lastError).toBeNull()
    expect(job.nextRunAt).toBeNull()
    expect(job.completedAt).toBeNull()
  })

  it('enqueue with same contentHash returns existing job (no duplicate)', async () => {
    const job1 = await enqueue(USER_A, 'recompute_local_features', 'dockItem', '1', 'ch_abc')
    const job2 = await enqueue(USER_A, 'recompute_local_features', 'dockItem', '1', 'ch_abc')
    expect(job1.id).toBe(job2.id)
    const all = await db.table('backgroundJobs').toArray()
    expect(all).toHaveLength(1)
  })

  it('enqueue with different contentHash creates new job', async () => {
    const job1 = await enqueue(USER_A, 'recompute_local_features', 'dockItem', '1', 'ch_abc')
    const job2 = await enqueue(USER_A, 'recompute_local_features', 'dockItem', '1', 'ch_def')
    expect(job1.id).not.toBe(job2.id)
    const all = await db.table('backgroundJobs').toArray()
    expect(all).toHaveLength(2)
  })
})

describe('dequeue', () => {
  afterEach(cleanAll)

  it('dequeue returns null when no pending jobs', async () => {
    const job = await dequeue(USER_A)
    expect(job).toBeNull()
  })

  it('dequeue returns pending job and marks as running', async () => {
    await enqueue(USER_A, 'recompute_local_features', 'dockItem', '1', 'ch_abc')
    const job = await dequeue(USER_A)
    expect(job).not.toBeNull()
    expect((job as { status: string }).status).toBe('running')
    expect((job as { attempts: number }).attempts).toBe(1)
  })

  it('dequeue does NOT return pending_model jobs', async () => {
    const job = await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', '1', 'ch_abc')
    await db.table('backgroundJobs').update((job as { id: string }).id, { status: 'pending_model' })
    const dequeued = await dequeue(USER_A)
    expect(dequeued).toBeNull()
  })
})

describe('processNext / processBatch', () => {
  afterEach(async () => {
    await cleanAll()
    await db.table('dockItems').clear()
    await db.table('modelRuntimeStatuses').clear()
    await db.table('userPreferences').clear()
    vi.restoreAllMocks()
    resetProviders()
  })

  it('processNext processes recompute_local_features and marks complete', async () => {
    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      rawText: 'test content for local features',
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
    await enqueue(USER_A, 'recompute_local_features', 'dockItem', String(dockItemId), 'ch_abc')
    const result = await processNext(USER_A)
    expect(result).not.toBeNull()
    expect((result as { job: { status: string } }).job.status).toBe('complete')
    expect((result as { result: { status: string } }).result.status).toBe('complete')
    expect((result as { job: { completedAt: string | null } }).job.completedAt).not.toBeNull()
  })

  it('processBatch respects limit', async () => {
    const dockItemIds: number[] = []
    for (let i = 0; i < 3; i++) {
      const id = await db.dockItems.add({
        userId: USER_A,
        workspaceId: WS_DEFAULT,
        rawText: `test content ${i}`,
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
      dockItemIds.push(id as number)
    }
    await enqueue(USER_A, 'recompute_local_features', 'dockItem', String(dockItemIds[0]), 'ch_abc1')
    await enqueue(USER_A, 'recompute_local_features', 'dockItem', String(dockItemIds[1]), 'ch_abc2')
    await enqueue(USER_A, 'recompute_local_features', 'dockItem', String(dockItemIds[2]), 'ch_abc3')
    const results = await processBatch(USER_A, { limit: 2 })
    expect(results).toHaveLength(2)
    expect(results.every(r => r.job.status === 'complete')).toBe(true)
  })

  it('processBatch returns empty array when no jobs', async () => {
    const results = await processBatch(USER_A)
    expect(results).toEqual([])
  })

  it('processJob returns failed when job payload missing contentHash, no full-scan fallback', async () => {
    const job = await enqueue(USER_A, 'recompute_local_features', 'dockItem', '1', 'ch_abc')
    await db.table('backgroundJobs').update(job.id, { contentHash: null as unknown as string })
    const updatedJob = await db.table('backgroundJobs').get(job.id as string)
    if (!updatedJob) throw new Error('job not found')
    const result = await processJob(updatedJob)
    expect(result.status).toBe('failed')
  })

  it('processJob returns skipped when contentHash unchanged for recompute_semantic_features', async () => {
    await setEmbeddingEnabledPref(USER_A, true, WS_DEFAULT)
    await setReasoningEnabledPref(USER_A, true, WS_DEFAULT)

    const contentHash = 'ch_skip_semantic'

    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      rawText: 'test content for semantic skip',
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

    await upsertModelRuntimeStatus(makeModelRuntimeStatus(USER_A, WS_DEFAULT), WS_DEFAULT)

    await upsertSemanticFeatureSnapshot({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      targetType: 'dockItem',
      targetId: String(dockItemId),
      contentHash,
      modelProvider: 'ollama-openai-compatible',
      modelName: 'qwen3-embedding:0.6b',
      modelVersion: '1.0',
      embeddingDim: 1024,
      embeddingRef: 'ev://dockItem/' + dockItemId,
      semanticSummary: 'test summary',
      intent: 'general',
      topics: [],
      source: 'SemanticFeatureEngine',
      reason: 'test',
      evidence: 'none',
      confidence: 0.8,
      safetyLevel: 'safe',
      stale: false,
      staleKey: 0 as const,
      expiredAt: null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    }, WS_DEFAULT)

    const job = await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', String(dockItemId), contentHash)
    const result = await processJob(job)
    expect(result.status).toBe('skipped')
  })

  it('recompute_local_features calls localTextFeatureEngine.computeFeatures', async () => {
    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      rawText: 'test content for local features',
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

    const contentHash = 'ch_local_engine'
    const spy = vi.spyOn(localTextFeatureEngine, 'computeFeatures').mockResolvedValue({
      id: '1',
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      targetType: 'dockItem',
      targetId: String(dockItemId),
      contentHash,
      language: 'en',
      keywords: ['test'],
      entities: [],
      compactText: '',
      lengthMetrics: { charCount: 10 },
      structureHints: [],
      source: 'local',
      reason: 'test',
      evidence: 'none',
      confidence: 0.7,
      safetyLevel: 'low',
      stale: false,
      staleKey: 0 as const,
      expiredAt: null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    })

    const job = await enqueue(USER_A, 'recompute_local_features', 'dockItem', String(dockItemId), contentHash)
    const result = await processJob(job)
    expect(result.status).toBe('complete')
    expect(spy).toHaveBeenCalled()
  })

  it('recompute_semantic_features calls semanticFeatureEngine.computeFeatures', async () => {
    await setEmbeddingEnabledPref(USER_A, true, WS_DEFAULT)
    await setReasoningEnabledPref(USER_A, true, WS_DEFAULT)
    await upsertModelRuntimeStatus(makeModelRuntimeStatus(USER_A, WS_DEFAULT), WS_DEFAULT)

    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      rawText: 'test content for semantic features',
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

    const contentHash = 'ch_semantic_engine'
    const spy = vi.spyOn(semanticFeatureEngine, 'computeFeatures').mockResolvedValue({
      status: 'complete',
      snapshot: {
        id: 'snap_1',
        userId: USER_A,
        workspaceId: WS_DEFAULT,
        targetType: 'dockItem',
        targetId: String(dockItemId),
        contentHash,
        modelProvider: 'ollama-openai-compatible',
        modelName: 'qwen3-embedding:0.6b',
        modelVersion: '1.0',
        embeddingDim: 1024,
        embeddingRef: 'ev://dockItem/' + dockItemId,
        semanticSummary: 'test summary',
        intent: 'general',
        topics: [],
        source: 'SemanticFeatureEngine',
        reason: 'test',
        evidence: 'none',
        confidence: 0.8,
        safetyLevel: 'safe',
        stale: false,
        staleKey: 0 as const,
        expiredAt: null,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      },
    })

    const job = await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', String(dockItemId), contentHash)
    await processJob(job)
    expect(spy).toHaveBeenCalled()
  })
})

describe('retry / fail', () => {
  afterEach(cleanAll)

  it('retry sets status to pending with exponential backoff', async () => {
    const beforeRetry = Date.now()
    const job = await enqueue(USER_A, 'recompute_local_features', 'dockItem', '1', 'ch_abc')
    await db.table('backgroundJobs').update((job as { id: string }).id, { status: 'running', attempts: 1 })
    const retried = await retry((job as { id: string }).id)
    expect(retried).not.toBeNull()
    expect((retried as { status: string }).status).toBe('pending')
    expect((retried as { nextRunAt: string | null }).nextRunAt).not.toBeNull()
    const nextRunAt = new Date((retried as { nextRunAt: string }).nextRunAt).getTime()
    const expectedMin = beforeRetry + Math.pow(2, 1) * 1000 - 1000
    const expectedMax = beforeRetry + Math.pow(2, 1) * 1000 + 1000
    expect(nextRunAt).toBeGreaterThanOrEqual(expectedMin)
    expect(nextRunAt).toBeLessThanOrEqual(expectedMax)
  })

  it('fail marks job as failed with lastError', async () => {
    const job = await enqueue(USER_A, 'recompute_local_features', 'dockItem', '1', 'ch_abc')
    await db.table('backgroundJobs').update((job as { id: string }).id, { status: 'running' })
    const failed = await fail((job as { id: string }).id, 'something went wrong')
    expect(failed).not.toBeNull()
    expect((failed as { status: string }).status).toBe('failed')
    expect((failed as { lastError: string | null }).lastError).toBe('something went wrong')
  })
})

describe('pending_model lifecycle', () => {
  afterEach(async () => {
    await cleanAll()
    resetProviders()
  })

  it('Core Mode semantic job enters pending_model, attempts NOT increased', async () => {
    resetProviders()
    expect(getCapabilityStatus().mode).toBe('core')
    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      rawText: 'test content for pending model',
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
    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', String(dockItemId), 'ch_abc')
    const result = await processNext(USER_A)
    expect(result).not.toBeNull()
    expect((result as { job: { status: string } }).job.status).toBe('pending_model')
    expect((result as { result: { status: string } }).result.status).toBe('pending_model')
    expect((result as { job: { attempts: number } }).job.attempts).toBe(0)
  })

  it('Core Mode pending_model not processed by processBatch', async () => {
    resetProviders()
    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      rawText: 'test content for pending model batch',
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
    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', String(dockItemId), 'ch_abc')
    await processNext(USER_A)
    const results = await processBatch(USER_A)
    expect(results).toEqual([])
  })

  it('reactivatePendingModelJobs restores pending_model to pending when model available', async () => {
    resetProviders()
    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      rawText: 'test content for reactivation',
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
    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', String(dockItemId), 'ch_abc')
    await processNext(USER_A)
    await upsertModelRuntimeStatus(makeModelRuntimeStatus(USER_A, WS_DEFAULT), WS_DEFAULT)
    await setEmbeddingEnabledPref(USER_A, true, WS_DEFAULT)
    const reactivated = await reactivatePendingModelJobs(USER_A)
    expect(reactivated).toHaveLength(1)
    expect(reactivated[0].status).toBe('pending')
    expect(reactivated[0].nextRunAt).toBeNull()
  })

  it('Restored semantic job can be processed to complete', async () => {
    resetProviders()
    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      workspaceId: DEFAULT_WORKSPACE_ID,
      rawText: 'Test dock item content for semantic processing',
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
    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', String(dockItemId), 'ch_abc')
    await processNext(USER_A)
    await setEmbeddingEnabledPref(USER_A, true, WS_DEFAULT)
    await setReasoningEnabledPref(USER_A, true, WS_DEFAULT)
    await upsertModelRuntimeStatus(makeModelRuntimeStatus(USER_A, WS_DEFAULT), WS_DEFAULT)
    await reactivatePendingModelJobs(USER_A)

    vi.spyOn(localModelRuntimeService, 'generateEmbeddingForTarget').mockResolvedValue({
      success: true,
      data: new Float32Array(128),
      dim: 128,
      modelProvider: 'test',
      modelName: 'test-embedding',
      modelVersion: '1.0.0',
      auditLogId: 'audit-test-id',
    })
    vi.spyOn(localModelRuntimeService, 'generateSummaryForTarget').mockResolvedValue({
      success: true,
      summary: 'test summary content',
      modelProvider: 'test',
      modelName: 'test-reasoning',
      modelVersion: '1.0.0',
      auditLogId: 'audit-test-id-2',
    })

    const result = await processNext(USER_A)
    expect(result).not.toBeNull()
    expect((result as { job: { status: string } }).job.status).toBe('complete')
    expect((result as { result: { status: string } }).result.status).toBe('complete')

    vi.restoreAllMocks()
  })

  it('reactivatePendingModelJobs does NOT increase attempts', async () => {
    resetProviders()
    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      rawText: 'test content for attempts check',
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
    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', String(dockItemId), 'ch_abc')
    await processNext(USER_A)
    const beforeJob = await db.table('backgroundJobs').toArray()
    const attemptsBefore = beforeJob[0].attempts
    await upsertModelRuntimeStatus(makeModelRuntimeStatus(USER_A, WS_DEFAULT), WS_DEFAULT)
    await setEmbeddingEnabledPref(USER_A, true, WS_DEFAULT)
    await reactivatePendingModelJobs(USER_A)
    const afterJob = await db.table('backgroundJobs').toArray()
    expect(afterJob[0].attempts).toBe(attemptsBefore)
  })

  it('reactivatePendingModelJobs workspace isolation', async () => {
    resetProviders()
    const dockItemIdDefault = await db.dockItems.add({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      rawText: 'test content ws default',
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
    const dockItemIdOther = await db.dockItems.add({
      userId: USER_A,
      workspaceId: WS_OTHER,
      rawText: 'test content ws other',
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
    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', String(dockItemIdDefault), 'ch_abc', { workspaceId: WS_DEFAULT })
    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', String(dockItemIdOther), 'ch_def', { workspaceId: WS_OTHER })
    await processNext(USER_A, { workspaceId: WS_DEFAULT })
    await processNext(USER_A, { workspaceId: WS_OTHER })
    await upsertModelRuntimeStatus(makeModelRuntimeStatus(USER_A, WS_DEFAULT), WS_DEFAULT)
    await upsertModelRuntimeStatus(makeModelRuntimeStatus(USER_A, WS_OTHER), WS_OTHER)
    await setEmbeddingEnabledPref(USER_A, true, WS_DEFAULT)
    await setReasoningEnabledPref(USER_A, true, WS_DEFAULT)
    await setEmbeddingEnabledPref(USER_A, true, WS_OTHER)
    await setReasoningEnabledPref(USER_A, true, WS_OTHER)
    const reactivatedDefault = await reactivatePendingModelJobs(USER_A, { workspaceId: WS_DEFAULT })
    const reactivatedOther = await reactivatePendingModelJobs(USER_A, { workspaceId: WS_OTHER })
    expect(reactivatedDefault).toHaveLength(1)
    expect(reactivatedOther).toHaveLength(1)
    expect(reactivatedDefault[0].workspaceId).toBe(WS_DEFAULT)
    expect(reactivatedOther[0].workspaceId).toBe(WS_OTHER)
  })
})

describe('listOpenJobs / listPendingModelJobs', () => {
  afterEach(cleanAll)

  it('listOpenJobs returns both pending and pending_model jobs', async () => {
    await enqueue(USER_A, 'recompute_local_features', 'dockItem', '1', 'ch_abc')
    const semanticJob = await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', '2', 'ch_def')
    await db.table('backgroundJobs').update((semanticJob as { id: string }).id, { status: 'pending_model' })
    const openJobs = await listOpenJobs(USER_A)
    expect(openJobs).toHaveLength(2)
    const statuses = openJobs.map(j => j.status).sort()
    expect(statuses).toContain('pending')
    expect(statuses).toContain('pending_model')
  })

  it('listPendingModelJobs returns only pending_model jobs', async () => {
    await enqueue(USER_A, 'recompute_local_features', 'dockItem', '1', 'ch_abc')
    const semanticJob = await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', '2', 'ch_def')
    await db.table('backgroundJobs').update((semanticJob as { id: string }).id, { status: 'pending_model' })
    const pendingModelJobs = await listPendingModelJobs(USER_A)
    expect(pendingModelJobs).toHaveLength(1)
    expect(pendingModelJobs[0].status).toBe('pending_model')
  })
})

describe('Workspace isolation', () => {
  afterEach(cleanAll)

  it('Jobs in different workspaces are isolated', async () => {
    await enqueue(USER_A, 'recompute_local_features', 'dockItem', '1', 'ch_abc', { workspaceId: WS_DEFAULT })
    await enqueue(USER_A, 'recompute_local_features', 'dockItem', '1', 'ch_abc', { workspaceId: WS_OTHER })
    const all = await db.table('backgroundJobs').toArray()
    expect(all).toHaveLength(2)
    const wsDefaultJobs = all.filter(j => j.workspaceId === WS_DEFAULT)
    const wsOtherJobs = all.filter(j => j.workspaceId === WS_OTHER)
    expect(wsDefaultJobs).toHaveLength(1)
    expect(wsOtherJobs).toHaveLength(1)
    const dequeuedDefault = await dequeue(USER_A, { workspaceId: WS_DEFAULT })
    expect(dequeuedDefault).not.toBeNull()
    expect((dequeuedDefault as { workspaceId: string }).workspaceId).toBe(WS_DEFAULT)
    const dequeuedOther = await dequeue(USER_A, { workspaceId: WS_OTHER })
    expect(dequeuedOther).not.toBeNull()
    expect((dequeuedOther as { workspaceId: string }).workspaceId).toBe(WS_OTHER)
  })
})

describe('ContentChangeService', () => {
  afterEach(cleanAll)

  it('onContentChanged with deleted changeType does not enqueue', async () => {
    const result = await onContentChanged(USER_A, {
      sourceType: 'dockItem' as any,
      sourceId: '1',
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      contentHash: 'ch_abc',
      changeType: 'deleted',
      occurredAt: nowISO(),
    })
    expect(result.enqueued).toBe(false)
    expect(result.reason).toBe('content_deleted')
    const all = await db.table('backgroundJobs').toArray()
    expect(all).toHaveLength(0)
  })

  it('onContentChanged with unchanged content does not enqueue', async () => {
    const contentHash = 'ch_abc'
    const record = makeLocalTextRecord(USER_A, WS_DEFAULT, 'dockItem', '1', contentHash)
    await upsertLocalTextFeatureSnapshot(record, WS_DEFAULT)
    const result = await onContentChanged(USER_A, {
      sourceType: 'dockItem' as any,
      sourceId: '1',
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      contentHash,
      changeType: 'updated',
      occurredAt: nowISO(),
    })
    expect(result.enqueued).toBe(false)
    expect(result.reason).toBe('content_unchanged')
    const all = await db.table('backgroundJobs').toArray()
    expect(all).toHaveLength(0)
  })

  it('onContentChanged with changed content enqueues local + semantic jobs', async () => {
    const result = await onContentChanged(USER_A, {
      sourceType: 'dockItem' as any,
      sourceId: '1',
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      contentHash: 'ch_abc',
      changeType: 'updated',
      occurredAt: nowISO(),
    })
    expect(result.enqueued).toBe(true)
    expect(result.jobs).toHaveLength(2)
    const jobTypes = (result as { jobs: Array<{ jobType: string }> }).jobs.map(j => j.jobType).sort()
    expect(jobTypes).toContain('recompute_local_features')
    expect(jobTypes).toContain('recompute_semantic_features')
    const all = await db.table('backgroundJobs').toArray()
    expect(all).toHaveLength(2)
  })
})

describe('Batch limit', () => {
  afterEach(cleanAll)

  it('Large number of jobs not processed all at once', async () => {
    for (let i = 0; i < 20; i++) {
      await enqueue(USER_A, 'recompute_local_features', 'dockItem', String(i), `ch_${i}`)
    }
    const results = await processBatch(USER_A, { limit: 5 })
    expect(results).toHaveLength(5)
    const remaining = await db.table('backgroundJobs')
      .where('[userId+workspaceId+status]')
      .equals([USER_A, WS_DEFAULT, 'pending'])
      .toArray()
    expect(remaining.length).toBe(15)
  })
})

describe('jobProcessor workspace isolation', () => {
  afterEach(async () => {
    await cleanAll()
    await db.table('dockItems').clear()
    await db.table('tips').clear()
    await db.table('editorDrafts').clear()
    await db.table('embeddingVectors').clear()
    await db.table('algorithmAuditLogs').clear()
    vi.restoreAllMocks()
    resetProviders()
  })

  it('dockItem: job in WS_OTHER does not read default workspace dockItem with same id', async () => {
    await upsertModelRuntimeStatus(makeModelRuntimeStatus(USER_A, WS_OTHER), WS_OTHER)
    await setEmbeddingEnabledPref(USER_A, true, WS_OTHER)

    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      rawText: 'default workspace secret content',
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

    const spy = vi.spyOn(localModelRuntimeService, 'generateEmbeddingForTarget')
    await enqueue(USER_A, 'embedding_generate', 'dockItem', String(dockItemId), 'ch_test', { workspaceId: WS_OTHER })
    const result = await processNext(USER_A, { workspaceId: WS_OTHER })
    expect(result).not.toBeNull()
    expect((result as { result: { status: string } }).result.status).toBe('skipped')
    expect(spy).not.toHaveBeenCalled()
  })

  it('dockItem: job in same workspace reads content and calls model', async () => {
    await upsertModelRuntimeStatus(makeModelRuntimeStatus(USER_A, WS_OTHER), WS_OTHER)
    await setEmbeddingEnabledPref(USER_A, true, WS_OTHER)

    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      workspaceId: WS_OTHER,
      rawText: 'other workspace content',
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

    const spy = vi.spyOn(localModelRuntimeService, 'generateEmbeddingForTarget').mockResolvedValue({
      success: true,
      data: new Float32Array(128),
      dim: 128,
      modelProvider: 'dev',
      modelName: 'dev-embedding-mock',
      modelVersion: '1.0.0',
      auditLogId: 'audit-test-id',
    })

    await enqueue(USER_A, 'embedding_generate', 'dockItem', String(dockItemId), 'ch_test', { workspaceId: WS_OTHER })
    const result = await processNext(USER_A, { workspaceId: WS_OTHER })
    expect(result).not.toBeNull()
    expect((result as { result: { status: string } }).result.status).toBe('complete')
    expect(spy).toHaveBeenCalledWith(USER_A, WS_OTHER, 'dockItem', String(dockItemId), 'other workspace content', 'ch_test')
  })

  it('tip: job in WS_OTHER does not read default workspace tip with same id', async () => {
    await upsertModelRuntimeStatus(makeModelRuntimeStatus(USER_A, WS_OTHER), WS_OTHER)
    await setEmbeddingEnabledPref(USER_A, true, WS_OTHER)

    const tipId = await db.tips.add({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      content: 'default workspace tip secret',
      sourceType: 'text',
      status: 'active',
      convertedDraftId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const spy = vi.spyOn(localModelRuntimeService, 'generateEmbeddingForTarget')
    await enqueue(USER_A, 'embedding_generate', 'tip', String(tipId), 'ch_test', { workspaceId: WS_OTHER })
    const result = await processNext(USER_A, { workspaceId: WS_OTHER })
    expect(result).not.toBeNull()
    expect((result as { result: { status: string } }).result.status).toBe('skipped')
    expect(spy).not.toHaveBeenCalled()
  })

  it('draft: job in WS_OTHER does not read default workspace draft with same id', async () => {
    await upsertModelRuntimeStatus(makeModelRuntimeStatus(USER_A, WS_OTHER), WS_OTHER)
    await setEmbeddingEnabledPref(USER_A, true, WS_OTHER)

    const draftId = await db.editorDrafts.add({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      draftKey: 1,
      title: 'Test Draft',
      content: 'default workspace draft secret',
      plainText: 'default workspace draft secret',
      status: 'active',
      tags: [],
      project: null,
      collectionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const spy = vi.spyOn(localModelRuntimeService, 'generateEmbeddingForTarget')
    await enqueue(USER_A, 'embedding_generate', 'draft', String(draftId), 'ch_test', { workspaceId: WS_OTHER })
    const result = await processNext(USER_A, { workspaceId: WS_OTHER })
    expect(result).not.toBeNull()
    expect((result as { result: { status: string } }).result.status).toBe('skipped')
    expect(spy).not.toHaveBeenCalled()
  })

  it('recompute_semantic_features: cross-workspace target returns skipped without writing EmbeddingVector', async () => {
    await upsertModelRuntimeStatus(makeModelRuntimeStatus(USER_A, WS_OTHER), WS_OTHER)
    await setEmbeddingEnabledPref(USER_A, true, WS_OTHER)
    await setReasoningEnabledPref(USER_A, true, WS_OTHER)

    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      rawText: 'default workspace content should not leak',
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

    const embSpy = vi.spyOn(localModelRuntimeService, 'generateEmbeddingForTarget')
    const sumSpy = vi.spyOn(localModelRuntimeService, 'generateSummaryForTarget')

    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', String(dockItemId), 'ch_test', { workspaceId: WS_OTHER })
    const result = await processNext(USER_A, { workspaceId: WS_OTHER })
    expect(result).not.toBeNull()
    expect((result as { result: { status: string } }).result.status).toBe('skipped')
    expect(embSpy).not.toHaveBeenCalled()
    expect(sumSpy).not.toHaveBeenCalled()

    const vector = await getEmbeddingVectorByTarget(USER_A, 'dockItem', String(dockItemId), WS_OTHER)
    expect(vector).toBeNull()
  })

  it('dockItem with undefined workspaceId matches DEFAULT_WORKSPACE_ID', async () => {
    await upsertModelRuntimeStatus(makeModelRuntimeStatus(USER_A, WS_DEFAULT), WS_DEFAULT)
    await setEmbeddingEnabledPref(USER_A, true, WS_DEFAULT)

    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      rawText: 'legacy dock item without workspaceId',
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

    const spy = vi.spyOn(localModelRuntimeService, 'generateEmbeddingForTarget').mockResolvedValue({
      success: true,
      data: new Float32Array(128),
      dim: 128,
      modelProvider: 'dev',
      modelName: 'dev-embedding-mock',
      modelVersion: '1.0.0',
      auditLogId: 'audit-test-id',
    })

    await enqueue(USER_A, 'embedding_generate', 'dockItem', String(dockItemId), 'ch_test', { workspaceId: WS_DEFAULT })
    const result = await processNext(USER_A, { workspaceId: WS_DEFAULT })
    expect(result).not.toBeNull()
    expect((result as { result: { status: string } }).result.status).toBe('complete')
    expect(spy).toHaveBeenCalledWith(USER_A, WS_DEFAULT, 'dockItem', String(dockItemId), 'legacy dock item without workspaceId', 'ch_test')
  })

  it('dockItem with undefined workspaceId does NOT match WS_OTHER', async () => {
    await upsertModelRuntimeStatus(makeModelRuntimeStatus(USER_A, WS_OTHER), WS_OTHER)
    await setEmbeddingEnabledPref(USER_A, true, WS_OTHER)

    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      rawText: 'legacy dock item without workspaceId',
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

    const spy = vi.spyOn(localModelRuntimeService, 'generateEmbeddingForTarget')
    await enqueue(USER_A, 'embedding_generate', 'dockItem', String(dockItemId), 'ch_test', { workspaceId: WS_OTHER })
    const result = await processNext(USER_A, { workspaceId: WS_OTHER })
    expect(result).not.toBeNull()
    expect((result as { result: { status: string } }).result.status).toBe('skipped')
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('reactivatePendingModelJobs: IndexedDB-only (no initDevProviders)', () => {
  afterEach(async () => {
    await cleanAll()
    resetProviders()
  })

  it('reactivatePendingModelJobs 不依赖 initDevProviders，仅靠 IndexedDB ModelRuntimeStatus + embeddingEnabled=true 激活', async () => {
    resetProviders()
    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      rawText: 'test content for IDB-only reactivation',
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
    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', String(dockItemId), 'ch_abc')
    await processNext(USER_A)

    expect(getCapabilityStatus().mode).toBe('core')

    await upsertModelRuntimeStatus(makeModelRuntimeStatus(USER_A, WS_DEFAULT), WS_DEFAULT)
    await setEmbeddingEnabledPref(USER_A, true, WS_DEFAULT)

    const reactivated = await reactivatePendingModelJobs(USER_A)
    expect(reactivated).toHaveLength(1)
    expect(reactivated[0].status).toBe('pending')
  })

  it('embeddingEnabled=false 时 pending_model 不被激活', async () => {
    resetProviders()
    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      rawText: 'test content for disabled reactivation',
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
    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', String(dockItemId), 'ch_abc')
    await processNext(USER_A)

    await upsertModelRuntimeStatus(makeModelRuntimeStatus(USER_A, WS_DEFAULT), WS_DEFAULT)

    const reactivated = await reactivatePendingModelJobs(USER_A)
    expect(reactivated).toHaveLength(0)

    const jobs = await db.table('backgroundJobs').toArray()
    expect(jobs[0].status).toBe('pending_model')
  })

  it('embeddingEnabled=false 时 pending_model 不被转成 skipped，保持 pending_model', async () => {
    resetProviders()
    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      rawText: 'test content for pending_model preservation',
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
    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', String(dockItemId), 'ch_abc')
    await processNext(USER_A)

    await upsertModelRuntimeStatus(makeModelRuntimeStatus(USER_A, WS_DEFAULT), WS_DEFAULT)

    const batchResults = await processBatch(USER_A, { limit: 5 })
    expect(batchResults).toHaveLength(0)

    const jobs = await db.table('backgroundJobs').toArray()
    expect(jobs[0].status).toBe('pending_model')
  })

  it('启用 Embedding 后 pending_model 能恢复为 pending 并被消费', async () => {
    resetProviders()
    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      rawText: 'test content for enable-then-consume',
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
    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', String(dockItemId), 'ch_abc')
    await processNext(USER_A)

    await upsertModelRuntimeStatus(makeModelRuntimeStatus(USER_A, WS_DEFAULT), WS_DEFAULT)
    await setEmbeddingEnabledPref(USER_A, true, WS_DEFAULT)
    await setReasoningEnabledPref(USER_A, true, WS_DEFAULT)

    const reactivated = await reactivatePendingModelJobs(USER_A)
    expect(reactivated).toHaveLength(1)
    expect(reactivated[0].status).toBe('pending')

    vi.spyOn(localModelRuntimeService, 'generateEmbeddingForTarget').mockResolvedValue({
      success: true,
      data: new Float32Array(128),
      dim: 128,
      modelProvider: 'test',
      modelName: 'test-embedding',
      modelVersion: '1.0.0',
      auditLogId: 'audit-test-id',
    })
    vi.spyOn(localModelRuntimeService, 'generateSummaryForTarget').mockResolvedValue({
      success: true,
      summary: 'test summary content',
      modelProvider: 'test',
      modelName: 'test-reasoning',
      modelVersion: '1.0.0',
      auditLogId: 'audit-test-id-2',
    })

    const result = await processNext(USER_A)
    expect(result).not.toBeNull()
    expect((result as { result: { status: string } }).result.status).toBe('complete')

    vi.restoreAllMocks()
  })

  it('Dev Provider 不得让真实语义 job complete', async () => {
    resetProviders()
    initDevProviders()
    expect(getCapabilityStatus().mode).toBe('model_available')

    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      rawText: 'test content for dev provider isolation',
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

    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', String(dockItemId), 'ch_abc')
    await processNext(USER_A)

    const dbStatus = await getModelRuntimeStatus(USER_A, 'ollama-openai-compatible', WS_DEFAULT)
    expect(dbStatus).toBeNull()

    const reactivated = await reactivatePendingModelJobs(USER_A)
    expect(reactivated).toHaveLength(0)

    const jobs = await db.table('backgroundJobs').toArray()
    expect(jobs[0].status).toBe('pending_model')
  })

  it('无 ModelRuntimeStatus 时 reactivatePendingModelJobs 返回空', async () => {
    resetProviders()
    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      rawText: 'test content for no runtime status',
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
    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', String(dockItemId), 'ch_abc')
    await processNext(USER_A)

    const reactivated = await reactivatePendingModelJobs(USER_A)
    expect(reactivated).toHaveLength(0)
  })
})
