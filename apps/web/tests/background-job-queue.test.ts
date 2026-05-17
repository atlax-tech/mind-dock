import { afterEach, describe, expect, it } from 'vitest'
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
import { upsertLocalTextFeatureSnapshot } from '@/lib/intelligenceRepository'

const USER_A = 'user_test_a'
const WS_DEFAULT = DEFAULT_WORKSPACE_ID
const WS_OTHER = 'workspace_other'

async function cleanAll() {
  await db.table('backgroundJobs').clear()
  await db.table('localTextFeatureSnapshots').clear()
  await db.table('semanticFeatureSnapshots').clear()
}

function nowISO() {
  return new Date().toISOString()
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
  afterEach(cleanAll)

  it('processNext processes recompute_local_features and marks complete', async () => {
    await enqueue(USER_A, 'recompute_local_features', 'dockItem', '1', 'ch_abc')
    const result = await processNext(USER_A)
    expect(result).not.toBeNull()
    expect((result as { job: { status: string } }).job.status).toBe('complete')
    expect((result as { result: { status: string } }).result.status).toBe('complete')
    expect((result as { job: { completedAt: string | null } }).job.completedAt).not.toBeNull()
  })

  it('processBatch respects limit', async () => {
    await enqueue(USER_A, 'recompute_local_features', 'dockItem', '1', 'ch_abc1')
    await enqueue(USER_A, 'recompute_local_features', 'dockItem', '2', 'ch_abc2')
    await enqueue(USER_A, 'recompute_local_features', 'dockItem', '3', 'ch_abc3')
    const results = await processBatch(USER_A, { limit: 2 })
    expect(results).toHaveLength(2)
    expect(results.every(r => r.job.status === 'complete')).toBe(true)
  })

  it('processBatch returns empty array when no jobs', async () => {
    const results = await processBatch(USER_A)
    expect(results).toEqual([])
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
    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', '1', 'ch_abc')
    const result = await processNext(USER_A)
    expect(result).not.toBeNull()
    expect((result as { job: { status: string } }).job.status).toBe('pending_model')
    expect((result as { result: { status: string } }).result.status).toBe('pending_model')
    expect((result as { job: { attempts: number } }).job.attempts).toBe(0)
  })

  it('Core Mode pending_model not processed by processBatch', async () => {
    resetProviders()
    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', '1', 'ch_abc')
    await processNext(USER_A)
    const results = await processBatch(USER_A)
    expect(results).toEqual([])
  })

  it('reactivatePendingModelJobs restores pending_model to pending when model available', async () => {
    resetProviders()
    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', '1', 'ch_abc')
    await processNext(USER_A)
    initDevProviders()
    expect(getCapabilityStatus().mode).toBe('model_available')
    const reactivated = await reactivatePendingModelJobs(USER_A)
    expect(reactivated).toHaveLength(1)
    expect(reactivated[0].status).toBe('pending')
    expect(reactivated[0].nextRunAt).toBeNull()
  })

  it('Restored semantic job can be processed to complete', async () => {
    resetProviders()
    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', '1', 'ch_abc')
    await processNext(USER_A)
    initDevProviders()
    await reactivatePendingModelJobs(USER_A)
    const result = await processNext(USER_A)
    expect(result).not.toBeNull()
    expect((result as { job: { status: string } }).job.status).toBe('complete')
    expect((result as { result: { status: string } }).result.status).toBe('complete')
  })

  it('reactivatePendingModelJobs does NOT increase attempts', async () => {
    resetProviders()
    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', '1', 'ch_abc')
    await processNext(USER_A)
    const beforeJob = await db.table('backgroundJobs').toArray()
    const attemptsBefore = beforeJob[0].attempts
    initDevProviders()
    await reactivatePendingModelJobs(USER_A)
    const afterJob = await db.table('backgroundJobs').toArray()
    expect(afterJob[0].attempts).toBe(attemptsBefore)
  })

  it('reactivatePendingModelJobs workspace isolation', async () => {
    resetProviders()
    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', '1', 'ch_abc', { workspaceId: WS_DEFAULT })
    await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', '2', 'ch_def', { workspaceId: WS_OTHER })
    await processNext(USER_A, { workspaceId: WS_DEFAULT })
    await processNext(USER_A, { workspaceId: WS_OTHER })
    initDevProviders()
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
