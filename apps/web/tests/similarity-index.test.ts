import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

vi.mock('@/lib/intelligenceRepository', () => ({
  upsertSimilarityIndexEntry: vi.fn(),
  getEmbeddingVectorsByWorkspace: vi.fn(),
  getLocalTextFeatureSnapshotByTarget: vi.fn(),
  markSimilarityIndexEntriesStaleBySource: vi.fn(),
  markSimilarityIndexEntriesStaleByTarget: vi.fn(),
  markSimilarityIndexEntriesStaleByModel: vi.fn(),
  markSimilarityIndexEntriesStaleByVector: vi.fn(),
}))

import { db, embeddingVectorsTable, localTextFeatureSnapshotsTable, similarityIndexEntriesTable } from '@/lib/db'
import { DEFAULT_WORKSPACE_ID } from '@atlax/domain'
import { makeEmbeddingVectorId, makeSimilarityIndexEntryId } from '@atlax/domain'
import { similarityIndex, cosineSimilarity } from '@/lib/similarityIndex'
import { similarityComparison } from '@/lib/similarityComparison'
import {
  upsertSimilarityIndexEntry,
  getEmbeddingVectorsByWorkspace,
  getLocalTextFeatureSnapshotByTarget,
  markSimilarityIndexEntriesStaleBySource,
  markSimilarityIndexEntriesStaleByTarget,
  markSimilarityIndexEntriesStaleByModel,
} from '@/lib/intelligenceRepository'

const USER_A = 'user_test_a'
const WS_DEFAULT = DEFAULT_WORKSPACE_ID

function makeVector(targetId: string, values: number[], overrides: Record<string, unknown> = {}) {
  const arr = new Float32Array(values)
  const id = makeEmbeddingVectorId(USER_A, (overrides.workspaceId as string) ?? WS_DEFAULT, (overrides.targetType as string) ?? 'dockItem', targetId)
  return {
    id,
    userId: USER_A,
    workspaceId: (overrides.workspaceId as string) ?? WS_DEFAULT,
    targetType: (overrides.targetType as string) ?? 'dockItem',
    targetId,
    contentHash: (overrides.contentHash as string) ?? `ch_${targetId}`,
    providerId: (overrides.providerId as string) ?? 'ollama-openai-compatible',
    modelId: (overrides.modelId as string) ?? 'qwen3-embedding:0.6b',
    modelVersion: (overrides.modelVersion as string) ?? '1.0',
    dimension: values.length,
    vectorHash: `vh_${targetId}`,
    vectorBlob: arr.buffer as ArrayBuffer,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function makeSnapshot(targetId: string, keywords: string[], overrides: Record<string, unknown> = {}) {
  return {
    id: `${USER_A}_ltfs_${(overrides.workspaceId as string) ?? WS_DEFAULT}_dockItem_${targetId}`,
    userId: USER_A,
    workspaceId: (overrides.workspaceId as string) ?? WS_DEFAULT,
    targetType: 'dockItem',
    targetId,
    contentHash: (overrides.contentHash as string) ?? `ch_${targetId}`,
    language: 'en',
    keywords,
    entities: [],
    compactText: `compact text for ${targetId}`,
    lengthMetrics: { charCount: 100 },
    structureHints: [],
    source: 'test',
    reason: 'test',
    evidence: 'test',
    confidence: 0.9,
    safetyLevel: 'safe',
    stale: false,
    staleKey: 0 as const,
    expiredAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([1, 0, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5)
  })

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([0, 1, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5)
  })

  it('returns -1 for opposite vectors', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([-1, 0, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5)
  })

  it('returns 0 for different length vectors', () => {
    const a = new Float32Array([1, 0])
    const b = new Float32Array([1, 0, 0])
    expect(cosineSimilarity(a, b)).toBe(0)
  })

  it('returns 0 for zero vectors', () => {
    const a = new Float32Array([0, 0, 0])
    const b = new Float32Array([1, 2, 3])
    expect(cosineSimilarity(a, b)).toBe(0)
  })

  it('computes correct similarity for arbitrary vectors', () => {
    const a = new Float32Array([1, 2, 3])
    const b = new Float32Array([4, 5, 6])
    const dot = 1 * 4 + 2 * 5 + 3 * 6
    const normA = Math.sqrt(1 + 4 + 9)
    const normB = Math.sqrt(16 + 25 + 36)
    const expected = dot / (normA * normB)
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 5)
  })
})

describe('similarityIndex', () => {
  beforeEach(async () => {
    await db.table('embeddingVectors').clear()
    await db.table('localTextFeatureSnapshots').clear()
    await db.table('similarityIndexEntries').clear()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await db.table('embeddingVectors').clear()
    await db.table('localTextFeatureSnapshots').clear()
    await db.table('similarityIndexEntries').clear()
  })

  it('findSimilar returns topK results', async () => {
    const sourceVec = makeVector('src', [1, 0, 0])
    const vecA = makeVector('a', [0.9, 0.1, 0])
    const vecB = makeVector('b', [0.8, 0.2, 0])
    const vecC = makeVector('c', [0.1, 0.9, 0])

    await embeddingVectorsTable.put(sourceVec)
    vi.mocked(getEmbeddingVectorsByWorkspace).mockResolvedValue([sourceVec, vecA, vecB, vecC] as any)

    const results = await similarityIndex.findSimilar({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      topK: 2,
      threshold: 0,
    })

    expect(results.length).toBe(2)
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score)
  })

  it('findSimilar threshold filtering', async () => {
    const sourceVec = makeVector('src', [1, 0, 0])
    const vecA = makeVector('a', [0.95, 0.05, 0])
    const vecC = makeVector('c', [0.1, 0.9, 0])

    await embeddingVectorsTable.put(sourceVec)
    vi.mocked(getEmbeddingVectorsByWorkspace).mockResolvedValue([sourceVec, vecA, vecC] as any)

    const results = await similarityIndex.findSimilar({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      topK: 10,
      threshold: 0.9,
    })

    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0.9)
    }
  })

  it('workspaceId isolation — vectors from other workspace not returned', async () => {
    const sourceVec = makeVector('src', [1, 0, 0])
    const vecSame = makeVector('same', [0.9, 0.1, 0])

    await embeddingVectorsTable.put(sourceVec)
    vi.mocked(getEmbeddingVectorsByWorkspace).mockResolvedValue([sourceVec, vecSame] as any)

    const results = await similarityIndex.findSimilar({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      topK: 10,
      threshold: 0,
    })

    const ids = results.map(r => r.targetId)
    expect(ids).not.toContain('other')
    expect(ids).toContain('same')
  })

  it('contentHash dirty check marks stale', async () => {
    const entry = {
      id: makeSimilarityIndexEntryId(USER_A, WS_DEFAULT, 'dockItem', 'src', 'dockItem', 'a'),
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      targetTargetType: 'dockItem',
      targetTargetId: 'a',
      score: 0.9,
      generatedBy: 'semantic_core' as const,
      providerId: 'ollama-openai-compatible',
      modelId: 'qwen3-embedding:0.6b',
      modelVersion: '1.0',
      sourceContentHash: 'ch_old',
      targetContentHash: 'ch_a',
      stale: false,
      staleKey: 0 as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await similarityIndexEntriesTable.put({ ...entry, workspaceId: WS_DEFAULT })

    const sourceVec = makeVector('src', [1, 0, 0], { contentHash: 'ch_new' })
    const vecA = makeVector('a', [0.9, 0.1, 0])
    await embeddingVectorsTable.put(sourceVec)

    vi.mocked(getEmbeddingVectorsByWorkspace).mockResolvedValue([sourceVec, vecA] as any)

    await similarityIndex.findSimilar({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      topK: 10,
      threshold: 0,
    })

    expect(upsertSimilarityIndexEntry).toHaveBeenCalled()
    const callArgs = vi.mocked(upsertSimilarityIndexEntry).mock.calls[0][0]
    expect(callArgs.sourceContentHash).toBe('ch_new')
  })

  it('stale invalidation — source object change', async () => {
    await similarityIndexEntriesTable.put({
      id: makeSimilarityIndexEntryId(USER_A, WS_DEFAULT, 'dockItem', 'src', 'dockItem', 'a'),
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      targetTargetType: 'dockItem',
      targetTargetId: 'a',
      score: 0.9,
      generatedBy: 'semantic_core',
      providerId: 'ollama-openai-compatible',
      modelId: 'qwen3-embedding:0.6b',
      modelVersion: '1.0',
      sourceContentHash: 'ch_src',
      targetContentHash: 'ch_a',
      stale: false,
      staleKey: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    await markSimilarityIndexEntriesStaleBySource(USER_A, 'dockItem', 'src', WS_DEFAULT)

    expect(markSimilarityIndexEntriesStaleBySource).toHaveBeenCalledWith(
      USER_A, 'dockItem', 'src', WS_DEFAULT,
    )
  })

  it('stale invalidation — target object change', async () => {
    await similarityIndexEntriesTable.put({
      id: makeSimilarityIndexEntryId(USER_A, WS_DEFAULT, 'dockItem', 'src', 'dockItem', 'a'),
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      targetTargetType: 'dockItem',
      targetTargetId: 'a',
      score: 0.9,
      generatedBy: 'semantic_core',
      providerId: 'ollama-openai-compatible',
      modelId: 'qwen3-embedding:0.6b',
      modelVersion: '1.0',
      sourceContentHash: 'ch_src',
      targetContentHash: 'ch_a',
      stale: false,
      staleKey: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    await markSimilarityIndexEntriesStaleByTarget(USER_A, 'dockItem', 'a', WS_DEFAULT)

    expect(markSimilarityIndexEntriesStaleByTarget).toHaveBeenCalledWith(
      USER_A, 'dockItem', 'a', WS_DEFAULT,
    )
  })

  it('modelId/modelVersion/dimension change marks stale', async () => {
    await markSimilarityIndexEntriesStaleByModel(USER_A, 'old-model:v1', WS_DEFAULT)

    expect(markSimilarityIndexEntriesStaleByModel).toHaveBeenCalledWith(
      USER_A, 'old-model:v1', WS_DEFAULT,
    )
  })

  it('generatedBy=semantic_core only for real embedding', async () => {
    const sourceVec = makeVector('src', [1, 0, 0])
    const vecA = makeVector('a', [0.9, 0.1, 0])

    await embeddingVectorsTable.put(sourceVec)
    vi.mocked(getEmbeddingVectorsByWorkspace).mockResolvedValue([sourceVec, vecA] as any)

    const results = await similarityIndex.findSimilar({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      topK: 10,
      threshold: 0,
    })

    for (const r of results) {
      expect(r.generatedBy).toBe('semantic_core')
    }
  })

  it('generatedBy=core for Core Mode fallback', async () => {
    const sourceSnapshot = makeSnapshot('src', ['machine', 'learning', 'AI'])
    const targetSnapshot = makeSnapshot('a', ['machine', 'learning', 'deep'])

    vi.mocked(getLocalTextFeatureSnapshotByTarget).mockResolvedValue(sourceSnapshot as any)
    await localTextFeatureSnapshotsTable.put(targetSnapshot)

    const results = await similarityIndex.findSimilar({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      topK: 10,
      threshold: 0,
    })

    for (const r of results) {
      expect(r.generatedBy).toBe('core')
      expect(r.providerId).toBe('rule_fallback')
      expect(r.modelId).toBe('rule_fallback')
    }
  })

  it('Core Mode fallback query — keyword overlap matching', async () => {
    const sourceSnapshot = makeSnapshot('src', ['machine', 'learning', 'AI'])
    const snapA = makeSnapshot('a', ['machine', 'learning', 'deep'])
    const snapB = makeSnapshot('b', ['cooking', 'recipes', 'food'])

    vi.mocked(getLocalTextFeatureSnapshotByTarget).mockResolvedValue(sourceSnapshot as any)
    await localTextFeatureSnapshotsTable.put(snapA)
    await localTextFeatureSnapshotsTable.put(snapB)

    const results = await similarityIndex.findSimilar({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      topK: 10,
      threshold: 0,
    })

    const ids = results.map(r => r.targetId)
    expect(ids).toContain('a')
    expect(ids).not.toContain('b')
  })

  it('results persisted to similarityIndexEntries', async () => {
    const sourceVec = makeVector('src', [1, 0, 0])
    const vecA = makeVector('a', [0.9, 0.1, 0])

    await embeddingVectorsTable.put(sourceVec)
    vi.mocked(getEmbeddingVectorsByWorkspace).mockResolvedValue([sourceVec, vecA] as any)

    await similarityIndex.findSimilar({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      topK: 10,
      threshold: 0,
    })

    expect(upsertSimilarityIndexEntry).toHaveBeenCalled()
    const callArgs = vi.mocked(upsertSimilarityIndexEntry).mock.calls[0][0]
    expect(callArgs.sourceTargetId).toBe('src')
    expect(callArgs.targetTargetId).toBe('a')
    expect(callArgs.generatedBy).toBe('semantic_core')
    expect(callArgs.stale).toBe(false)
  })

  it('source without EmbeddingVector returns empty — no crash', async () => {
    const sourceSnapshot = makeSnapshot('src', [])

    vi.mocked(getLocalTextFeatureSnapshotByTarget).mockResolvedValue(sourceSnapshot as any)

    const results = await similarityIndex.findSimilar({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      topK: 10,
      threshold: 0,
    })

    expect(results).toEqual([])
  })

  it('comparison report generation', async () => {
    const sourceVec = makeVector('src', [1, 0, 0])
    const vecA = makeVector('a', [0.9, 0.1, 0])

    await embeddingVectorsTable.put(sourceVec)
    vi.mocked(getEmbeddingVectorsByWorkspace).mockResolvedValue([sourceVec, vecA] as any)

    const sourceSnapshot = makeSnapshot('src', ['machine', 'learning'])
    vi.mocked(getLocalTextFeatureSnapshotByTarget).mockResolvedValue(sourceSnapshot as any)
    await localTextFeatureSnapshotsTable.put(makeSnapshot('a', ['machine', 'learning']))

    const report = await similarityComparison.runComparison({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      topK: 10,
      threshold: 0,
    })

    expect(report).toBeDefined()
    expect(report.sourceContentHash).toBeDefined()
    expect(report.coreModeResults).toBeDefined()
    expect(report.semanticCoreResults).toBeDefined()
    expect(typeof report.overlapRate).toBe('number')
    expect(typeof report.rankDifference).toBe('number')
    expect(typeof report.scoreDifference).toBe('number')
    expect(typeof report.fallbackUsed).toBe('boolean')
    expect(report.auditLogId).toBeTruthy()
  })

  it('comparison shows diff summary even when identical — overlapRate=1', async () => {
    const sourceVec = makeVector('src', [1, 0, 0])
    const vecA = makeVector('a', [0.9, 0.1, 0])

    await embeddingVectorsTable.put(sourceVec)
    vi.mocked(getEmbeddingVectorsByWorkspace).mockResolvedValue([sourceVec, vecA] as any)

    const sourceSnapshot = makeSnapshot('src', ['machine', 'learning'])
    vi.mocked(getLocalTextFeatureSnapshotByTarget).mockResolvedValue(sourceSnapshot as any)
    await localTextFeatureSnapshotsTable.put(makeSnapshot('a', ['machine', 'learning']))

    const report = await similarityComparison.runComparison({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      topK: 10,
      threshold: 0,
    })

    expect(report.overlapRate).toBeGreaterThanOrEqual(0)
    expect(report.overlapRate).toBeLessThanOrEqual(1)
    expect(report.rankDifference).toBeGreaterThanOrEqual(0)
    expect(report.scoreDifference).toBeGreaterThanOrEqual(0)
  })

  it('mode=core forces keyword path even when embedding exists', async () => {
    const sourceVec = makeVector('src', [1, 0, 0])
    const vecA = makeVector('a', [0.9, 0.1, 0])

    await embeddingVectorsTable.put(sourceVec)
    await embeddingVectorsTable.put(vecA)

    const sourceSnapshot = makeSnapshot('src', ['machine', 'learning'])
    vi.mocked(getLocalTextFeatureSnapshotByTarget).mockResolvedValue(sourceSnapshot as any)
    await localTextFeatureSnapshotsTable.put(makeSnapshot('a', ['machine', 'learning']))

    const results = await similarityIndex.findSimilar({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      topK: 10,
      threshold: 0,
      mode: 'core',
    })

    for (const r of results) {
      expect(r.generatedBy).toBe('core')
      expect(r.providerId).toBe('rule_fallback')
      expect(r.modelId).toBe('rule_fallback')
    }
  })

  it('mode=semantic returns empty when no embedding exists', async () => {
    const sourceSnapshot = makeSnapshot('src', ['machine', 'learning'])
    vi.mocked(getLocalTextFeatureSnapshotByTarget).mockResolvedValue(sourceSnapshot as any)

    const results = await similarityIndex.findSimilar({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      topK: 10,
      threshold: 0,
      mode: 'semantic',
    })

    expect(results).toEqual([])
  })

  it('mode=semantic returns semantic_core results when embedding exists', async () => {
    const sourceVec = makeVector('src', [1, 0, 0])
    const vecA = makeVector('a', [0.9, 0.1, 0])

    await embeddingVectorsTable.put(sourceVec)
    vi.mocked(getEmbeddingVectorsByWorkspace).mockResolvedValue([sourceVec, vecA] as any)

    const results = await similarityIndex.findSimilar({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      topK: 10,
      threshold: 0,
      mode: 'semantic',
    })

    for (const r of results) {
      expect(r.generatedBy).toBe('semantic_core')
    }
  })

  it('comparison forces core vs semantic separation', async () => {
    const sourceVec = makeVector('src', [1, 0, 0])
    const vecA = makeVector('a', [0.9, 0.1, 0])

    await embeddingVectorsTable.put(sourceVec)
    vi.mocked(getEmbeddingVectorsByWorkspace).mockResolvedValue([sourceVec, vecA] as any)

    const sourceSnapshot = makeSnapshot('src', ['machine', 'learning'])
    vi.mocked(getLocalTextFeatureSnapshotByTarget).mockResolvedValue(sourceSnapshot as any)
    await localTextFeatureSnapshotsTable.put(makeSnapshot('a', ['machine', 'learning']))

    const report = await similarityComparison.runComparison({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      topK: 10,
      threshold: 0,
    })

    for (const r of report.coreModeResults) {
      expect(r.generatedBy).toBe('core')
    }
    for (const r of report.semanticCoreResults) {
      expect(r.generatedBy).toBe('semantic_core')
    }
  })

  it('stale vector is not consumed by SimilarityIndex', async () => {
    const sourceVec = makeVector('src', [1, 0, 0], { contentHash: '__stale__ch_src' })
    const vecA = makeVector('a', [0.9, 0.1, 0])

    await embeddingVectorsTable.put(sourceVec)
    vi.mocked(getEmbeddingVectorsByWorkspace).mockResolvedValue([vecA] as any)

    const results = await similarityIndex.findSimilar({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      topK: 10,
      threshold: 0,
      mode: 'semantic',
    })

    expect(results).toEqual([])
  })

  it('stale candidate vector is excluded from semantic results', async () => {
    const sourceVec = makeVector('src', [1, 0, 0])
    const vecA = makeVector('a', [0.9, 0.1, 0], { contentHash: '__stale__ch_a' })
    const vecB = makeVector('b', [0.8, 0.2, 0])

    await embeddingVectorsTable.put(sourceVec)
    vi.mocked(getEmbeddingVectorsByWorkspace).mockResolvedValue([sourceVec, vecA, vecB] as any)

    const results = await similarityIndex.findSimilar({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      topK: 10,
      threshold: 0,
      mode: 'semantic',
    })

    const ids = results.map(r => r.targetId)
    expect(ids).not.toContain('a')
    expect(ids).toContain('b')
  })

  it('comparison: fallbackUsed=false when source embedding exists but no semantic candidates', async () => {
    const sourceVec = makeVector('src', [1, 0, 0])
    await embeddingVectorsTable.put(sourceVec)
    vi.mocked(getEmbeddingVectorsByWorkspace).mockResolvedValue([sourceVec] as any)

    const sourceSnapshot = makeSnapshot('src', ['machine', 'learning'])
    vi.mocked(getLocalTextFeatureSnapshotByTarget).mockResolvedValue(sourceSnapshot as any)

    const report = await similarityComparison.runComparison({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      topK: 10,
      threshold: 0.9,
    })

    expect(report.fallbackUsed).toBe(false)
    expect(report.semanticCoreResults).toEqual([])
  })

  it('comparison: fallbackUsed=true when source embedding does not exist', async () => {
    const sourceSnapshot = makeSnapshot('src', ['machine', 'learning'])
    vi.mocked(getLocalTextFeatureSnapshotByTarget).mockResolvedValue(sourceSnapshot as any)

    const report = await similarityComparison.runComparison({
      userId: USER_A,
      workspaceId: WS_DEFAULT,
      sourceTargetType: 'dockItem',
      sourceTargetId: 'src',
      topK: 10,
      threshold: 0,
    })

    expect(report.fallbackUsed).toBe(true)
  })
})
