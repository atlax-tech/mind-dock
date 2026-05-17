import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

vi.mock('@/lib/intelligenceRepository', () => ({
  getModelRuntimeStatus: vi.fn(),
  getSemanticFeatureSnapshotByTarget: vi.fn(),
  upsertSemanticFeatureSnapshot: vi.fn(),
  getEmbeddingEnabledPref: vi.fn().mockResolvedValue(true),
  getReasoningEnabledPref: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/localModelRuntimeService', () => ({
  generateEmbeddingForTarget: vi.fn(),
  generateSummaryForTarget: vi.fn(),
  sanitizeErrorMessage: (msg: unknown) => String(msg).slice(0, 200),
}))

vi.mock('@/lib/modelProvider', () => ({
  getCapabilityStatus: vi.fn(),
}))

import { db } from '@/lib/db'
import { DEFAULT_WORKSPACE_ID, type SemanticFeatureSnapshot } from '@atlax/domain'
import { semanticFeatureEngine } from '@/lib/semanticFeatureEngine'
import {
  getModelRuntimeStatus,
  getSemanticFeatureSnapshotByTarget,
  upsertSemanticFeatureSnapshot,
  getEmbeddingEnabledPref,
  getReasoningEnabledPref,
} from '@/lib/intelligenceRepository'
import {
  generateEmbeddingForTarget,
  generateSummaryForTarget,
} from '@/lib/localModelRuntimeService'
import { getCapabilityStatus } from '@/lib/modelProvider'

const USER_A = 'user_test_a'
const WS_DEFAULT = DEFAULT_WORKSPACE_ID

function makeRuntimeStatus(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mrs_test',
    userId: USER_A,
    workspaceId: WS_DEFAULT,
    providerId: 'ollama-openai-compatible' as const,
    providerName: 'test',
    mode: 'model_available' as const,
    embeddingStatus: 'available' as const,
    reasoningStatus: 'available' as const,
    embeddingModelId: 'qwen3-embedding:0.6b',
    reasoningModelId: 'qwen3:1.7b',
    lastProbeAt: new Date().toISOString(),
    lastProbeSuccess: true,
    lastSuccessfulProbeAt: new Date().toISOString(),
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeEmbeddingSuccess(dim = 128) {
  return {
    success: true,
    data: new Float32Array(dim),
    dim,
    modelProvider: 'ollama-openai-compatible',
    modelName: 'qwen3-embedding:0.6b',
    modelVersion: '1.0',
    auditLogId: 'audit-emb-1',
  }
}

function makeSummarySuccess(summary = 'test semantic summary') {
  return {
    success: true,
    summary,
    modelProvider: 'ollama-openai-compatible',
    modelName: 'qwen3:1.7b',
    modelVersion: '1.0',
    auditLogId: 'audit-sum-1',
  }
}

const TEST_PAYLOAD = {
  targetType: 'dockItem',
  targetId: '1',
  userId: USER_A,
  workspaceId: WS_DEFAULT,
  contentHash: 'ch_test123',
  text: 'test content for semantic feature computation',
}

describe('semanticFeatureEngine', () => {
  beforeEach(async () => {
    await db.table('semanticFeatureSnapshots').clear()
    await db.table('modelRuntimeStatuses').clear()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await db.table('semanticFeatureSnapshots').clear()
    await db.table('modelRuntimeStatuses').clear()
  })

  it('在 mocked service 下写 SemanticFeatureSnapshot', async () => {
    vi.mocked(getModelRuntimeStatus).mockResolvedValue(makeRuntimeStatus())
    vi.mocked(generateEmbeddingForTarget).mockResolvedValue(makeEmbeddingSuccess())
    vi.mocked(generateSummaryForTarget).mockResolvedValue(makeSummarySuccess())

    let writtenSnapshot: SemanticFeatureSnapshot | null = null
    vi.mocked(upsertSemanticFeatureSnapshot).mockImplementation(
      (snapshot: unknown) => {
        writtenSnapshot = snapshot as SemanticFeatureSnapshot
        return Promise.resolve()
      },
    )
    vi.mocked(getSemanticFeatureSnapshotByTarget).mockImplementation(() =>
      Promise.resolve(writtenSnapshot),
    )

    const result = await semanticFeatureEngine.computeFeatures(TEST_PAYLOAD)
    const snap = result.snapshot as SemanticFeatureSnapshot

    expect(result.status).toBe('complete')
    expect(result.snapshot).not.toBeNull()
    expect(result.snapshot).toBeDefined()
    expect(snap.contentHash).toBe(TEST_PAYLOAD.contentHash)
    expect(snap.embeddingDim).toBe(128)
    expect(snap.semanticSummary).toBeTruthy()
    expect(writtenSnapshot).not.toBeNull()
  })

  it('provider unavailable / ModelRuntimeStatus 不存在', async () => {
    vi.mocked(getModelRuntimeStatus).mockResolvedValue(null)

    const result = await semanticFeatureEngine.computeFeatures(TEST_PAYLOAD)

    expect(result.status).toBe('unprobed')
    expect(result.snapshot).toBeUndefined()
    expect(generateEmbeddingForTarget).not.toHaveBeenCalled()
    expect(generateSummaryForTarget).not.toHaveBeenCalled()
  })

  it('embedding 模型不可用时返回 disabled', async () => {
    vi.mocked(getModelRuntimeStatus).mockResolvedValue(
      makeRuntimeStatus({
        embeddingStatus: 'unavailable',
        reasoningStatus: 'available',
      }),
    )
    vi.mocked(getEmbeddingEnabledPref).mockResolvedValue(true)
    vi.mocked(getReasoningEnabledPref).mockResolvedValue(true)

    const result = await semanticFeatureEngine.computeFeatures(TEST_PAYLOAD)

    expect(result.status).toBe('disabled')
    expect(generateEmbeddingForTarget).not.toHaveBeenCalled()
    expect(generateSummaryForTarget).not.toHaveBeenCalled()
  })

  it('用户未启用 embedding 但 reasoning 可用时返回 disabled', async () => {
    vi.mocked(getModelRuntimeStatus).mockResolvedValue(makeRuntimeStatus())
    vi.mocked(getEmbeddingEnabledPref).mockResolvedValue(false)
    vi.mocked(getReasoningEnabledPref).mockResolvedValue(true)

    const result = await semanticFeatureEngine.computeFeatures(TEST_PAYLOAD)

    expect(result.status).toBe('disabled')
    expect(generateEmbeddingForTarget).not.toHaveBeenCalled()
    expect(generateSummaryForTarget).not.toHaveBeenCalled()
  })

  it('reasoning disabled 时只执行 embedding', async () => {
    vi.mocked(getModelRuntimeStatus).mockResolvedValue(
      makeRuntimeStatus({
        embeddingStatus: 'available',
        reasoningStatus: 'unavailable',
      }),
    )
    vi.mocked(getEmbeddingEnabledPref).mockResolvedValue(true)
    vi.mocked(getReasoningEnabledPref).mockResolvedValue(true)
    vi.mocked(generateEmbeddingForTarget).mockResolvedValue(makeEmbeddingSuccess())

    let writtenSnapshot: SemanticFeatureSnapshot | null = null
    vi.mocked(upsertSemanticFeatureSnapshot).mockImplementation(
      (snapshot: unknown) => {
        writtenSnapshot = snapshot as SemanticFeatureSnapshot
        return Promise.resolve()
      },
    )
    vi.mocked(getSemanticFeatureSnapshotByTarget).mockImplementation(() =>
      Promise.resolve(writtenSnapshot),
    )

    const result = await semanticFeatureEngine.computeFeatures(TEST_PAYLOAD)
    const snap = result.snapshot as SemanticFeatureSnapshot

    expect(result.status).toBe('semantic_core_only')
    expect(generateEmbeddingForTarget).toHaveBeenCalledTimes(1)
    expect(generateSummaryForTarget).not.toHaveBeenCalled()
    expect(snap.embeddingDim).toBe(128)
    expect(snap.semanticSummary).toBeFalsy()
  })

  it('embedding enabled + reasoning disabled → semantic_core_only', async () => {
    vi.mocked(getModelRuntimeStatus).mockResolvedValue(
      makeRuntimeStatus({
        embeddingStatus: 'available',
        reasoningStatus: 'unavailable',
      }),
    )
    vi.mocked(getEmbeddingEnabledPref).mockResolvedValue(true)
    vi.mocked(getReasoningEnabledPref).mockResolvedValue(true)
    vi.mocked(generateEmbeddingForTarget).mockResolvedValue(makeEmbeddingSuccess())

    let writtenSnapshot: SemanticFeatureSnapshot | null = null
    vi.mocked(upsertSemanticFeatureSnapshot).mockImplementation(
      (snapshot: unknown) => {
        writtenSnapshot = snapshot as SemanticFeatureSnapshot
        return Promise.resolve()
      },
    )
    vi.mocked(getSemanticFeatureSnapshotByTarget).mockImplementation(() =>
      Promise.resolve(writtenSnapshot),
    )

    const result = await semanticFeatureEngine.computeFeatures(TEST_PAYLOAD)
    const snap = result.snapshot as SemanticFeatureSnapshot

    expect(result.status).toBe('semantic_core_only')
    expect(generateEmbeddingForTarget).toHaveBeenCalledTimes(1)
    expect(generateSummaryForTarget).not.toHaveBeenCalled()
    expect(snap.reason).toBe('embedding_succeeded_reasoning_disabled')
  })

  it('embedding 成功 + summary 失败时 partial success', async () => {
    vi.mocked(getModelRuntimeStatus).mockResolvedValue(makeRuntimeStatus())
    vi.mocked(generateEmbeddingForTarget).mockResolvedValue(makeEmbeddingSuccess())
    vi.mocked(generateSummaryForTarget).mockRejectedValue(
      new Error('summary generation failed'),
    )

    let writtenSnapshot: SemanticFeatureSnapshot | null = null
    vi.mocked(upsertSemanticFeatureSnapshot).mockImplementation(
      (snapshot: unknown) => {
        writtenSnapshot = snapshot as SemanticFeatureSnapshot
        return Promise.resolve()
      },
    )
    vi.mocked(getSemanticFeatureSnapshotByTarget).mockImplementation(() =>
      Promise.resolve(writtenSnapshot),
    )

    const result = await semanticFeatureEngine.computeFeatures(TEST_PAYLOAD)
    const snap = result.snapshot as SemanticFeatureSnapshot

    expect(result.status).toBe('partial')
    expect(generateEmbeddingForTarget).toHaveBeenCalledTimes(1)
    expect(generateSummaryForTarget).toHaveBeenCalledTimes(1)
    expect(snap.embeddingDim).toBe(128)
    expect(snap.reason).toContain('embedding_succeeded_summary_failed')
  })

  it('不记录 reasoning', async () => {
    vi.mocked(getModelRuntimeStatus).mockResolvedValue(makeRuntimeStatus())
    vi.mocked(generateEmbeddingForTarget).mockResolvedValue(makeEmbeddingSuccess())
    vi.mocked(generateSummaryForTarget).mockResolvedValue(makeSummarySuccess())

    let writtenSnapshot: SemanticFeatureSnapshot | null = null
    vi.mocked(upsertSemanticFeatureSnapshot).mockImplementation(
      (snapshot: unknown) => {
        writtenSnapshot = snapshot as SemanticFeatureSnapshot
        return Promise.resolve()
      },
    )
    vi.mocked(getSemanticFeatureSnapshotByTarget).mockImplementation(() =>
      Promise.resolve(writtenSnapshot),
    )

    const result = await semanticFeatureEngine.computeFeatures(TEST_PAYLOAD)
    const snap = result.snapshot as SemanticFeatureSnapshot

    expect(result.status).toBe('complete')
    expect(result.snapshot).not.toBeNull()
    expect(snap).not.toHaveProperty('reasoning')
    expect(snap).toHaveProperty('semanticSummary')
    expect(snap).toHaveProperty('intent')
    expect(snap).toHaveProperty('topics')
  })

  it('contentHash 幂等跳过', async () => {
    vi.mocked(getModelRuntimeStatus).mockResolvedValue(makeRuntimeStatus())
    vi.mocked(generateEmbeddingForTarget).mockResolvedValue(makeEmbeddingSuccess())
    vi.mocked(generateSummaryForTarget).mockResolvedValue(makeSummarySuccess())

    let storedSnapshot: SemanticFeatureSnapshot | null = null

    vi.mocked(upsertSemanticFeatureSnapshot).mockImplementation(
      (snapshot: unknown) => {
        storedSnapshot = snapshot as SemanticFeatureSnapshot
        return Promise.resolve()
      },
    )
    vi.mocked(getSemanticFeatureSnapshotByTarget).mockImplementation(() =>
      Promise.resolve(storedSnapshot),
    )

    const result1 = await semanticFeatureEngine.computeFeatures(TEST_PAYLOAD)
    expect(result1.status).toBe('complete')
    expect(result1.snapshot).not.toBeNull()
    expect(storedSnapshot).not.toBeNull()

    vi.clearAllMocks()

    vi.mocked(getModelRuntimeStatus).mockResolvedValue(makeRuntimeStatus())
    vi.mocked(getSemanticFeatureSnapshotByTarget).mockImplementation(() =>
      Promise.resolve(storedSnapshot),
    )

    const result2 = await semanticFeatureEngine.computeFeatures(TEST_PAYLOAD)

    expect(result2.status).toBe('skipped')
    expect(result2.snapshot).not.toBeNull()
    expect(generateEmbeddingForTarget).not.toHaveBeenCalled()
    expect(generateSummaryForTarget).not.toHaveBeenCalled()
    expect(upsertSemanticFeatureSnapshot).not.toHaveBeenCalled()
  })

  it('不使用 getCapabilityStatus()', async () => {
    vi.mocked(getModelRuntimeStatus).mockResolvedValue(makeRuntimeStatus())
    vi.mocked(generateEmbeddingForTarget).mockResolvedValue(makeEmbeddingSuccess())
    vi.mocked(generateSummaryForTarget).mockResolvedValue(makeSummarySuccess())

    let writtenSnapshot: SemanticFeatureSnapshot | null = null
    vi.mocked(upsertSemanticFeatureSnapshot).mockImplementation(
      (snapshot: unknown) => {
        writtenSnapshot = snapshot as SemanticFeatureSnapshot
        return Promise.resolve()
      },
    )
    vi.mocked(getSemanticFeatureSnapshotByTarget).mockImplementation(() =>
      Promise.resolve(writtenSnapshot),
    )

    await semanticFeatureEngine.computeFeatures(TEST_PAYLOAD)

    expect(getCapabilityStatus).not.toHaveBeenCalled()
    expect(getModelRuntimeStatus).toHaveBeenCalled()
  })

  it('不直接调用 provider', async () => {
    vi.mocked(getModelRuntimeStatus).mockResolvedValue(makeRuntimeStatus())
    vi.mocked(generateEmbeddingForTarget).mockResolvedValue(makeEmbeddingSuccess())
    vi.mocked(generateSummaryForTarget).mockResolvedValue(makeSummarySuccess())

    let writtenSnapshot: SemanticFeatureSnapshot | null = null
    vi.mocked(upsertSemanticFeatureSnapshot).mockImplementation(
      (snapshot: unknown) => {
        writtenSnapshot = snapshot as SemanticFeatureSnapshot
        return Promise.resolve()
      },
    )
    vi.mocked(getSemanticFeatureSnapshotByTarget).mockImplementation(() =>
      Promise.resolve(writtenSnapshot),
    )

    await semanticFeatureEngine.computeFeatures(TEST_PAYLOAD)

    expect(generateEmbeddingForTarget).toHaveBeenCalledWith(
      USER_A,
      WS_DEFAULT,
      'dockItem',
      '1',
      TEST_PAYLOAD.text,
      TEST_PAYLOAD.contentHash,
    )
    expect(generateSummaryForTarget).toHaveBeenCalledWith(
      USER_A,
      WS_DEFAULT,
      'dockItem',
      '1',
      TEST_PAYLOAD.text,
      TEST_PAYLOAD.contentHash,
    )
  })

  it('用户未启用 embedding 和 reasoning 时返回 disabled', async () => {
    vi.mocked(getModelRuntimeStatus).mockResolvedValue(makeRuntimeStatus())
    vi.mocked(getEmbeddingEnabledPref).mockResolvedValue(false)
    vi.mocked(getReasoningEnabledPref).mockResolvedValue(false)

    const result = await semanticFeatureEngine.computeFeatures(TEST_PAYLOAD)

    expect(result.status).toBe('disabled')
    expect(generateEmbeddingForTarget).not.toHaveBeenCalled()
    expect(generateSummaryForTarget).not.toHaveBeenCalled()
  })

  it('用户启用 embedding 但模型不可用时返回 disabled', async () => {
    vi.mocked(getModelRuntimeStatus).mockResolvedValue(
      makeRuntimeStatus({
        embeddingStatus: 'unavailable',
        reasoningStatus: 'unavailable',
      }),
    )
    vi.mocked(getEmbeddingEnabledPref).mockResolvedValue(true)
    vi.mocked(getReasoningEnabledPref).mockResolvedValue(true)

    const result = await semanticFeatureEngine.computeFeatures(TEST_PAYLOAD)

    expect(result.status).toBe('disabled')
    expect(generateEmbeddingForTarget).not.toHaveBeenCalled()
    expect(generateSummaryForTarget).not.toHaveBeenCalled()
  })
})
