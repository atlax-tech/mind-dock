import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

vi.mock('@/lib/localModelRuntimeService', () => ({
  generateEmbeddingForTarget: vi.fn(),
}))

vi.mock('@/lib/intelligenceRepository', () => ({
  markSimilarityIndexEntriesStaleByVector: vi.fn(),
  upsertModelRuntimeStatus: vi.fn(),
}))

import { db, embeddingVectorsTable, algorithmAuditLogsTable, modelRuntimeStatusesTable, semanticFeatureSnapshotsTable } from '@/lib/db'
import { DEFAULT_WORKSPACE_ID } from '@atlax/domain'
import { makeEmbeddingVectorId } from '@atlax/domain'
import { embeddingService } from '@/lib/embeddingService'
import { generateEmbeddingForTarget } from '@/lib/localModelRuntimeService'
import { markSimilarityIndexEntriesStaleByVector } from '@/lib/intelligenceRepository'

const USER_A = 'user_test_a'
const WS_DEFAULT = DEFAULT_WORKSPACE_ID

function makeRuntimeStatus(overrides: Record<string, unknown> = {}) {
  return {
    id: `${USER_A}_mrs_${WS_DEFAULT}_ollama-openai-compatible`,
    userId: USER_A,
    workspaceId: WS_DEFAULT,
    providerId: 'ollama-openai-compatible',
    providerName: 'test',
    mode: 'model_available',
    embeddingStatus: 'available',
    reasoningStatus: 'available',
    embeddingModelId: 'qwen3-embedding:0.6b',
    embeddingModelVersion: '1.0',
    embeddingDimension: 128,
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

function seedEmbeddingVector(overrides: Record<string, unknown> = {}) {
  const targetType = (overrides.targetType as string) ?? 'dockItem'
  const targetId = (overrides.targetId as string) ?? '1'
  const id = makeEmbeddingVectorId(USER_A, WS_DEFAULT, targetType, targetId)
  const vector = new Float32Array(128)
  return embeddingVectorsTable.put({
    id,
    userId: USER_A,
    workspaceId: WS_DEFAULT,
    targetType,
    targetId,
    contentHash: 'ch_test123',
    providerId: 'ollama-openai-compatible',
    modelId: 'qwen3-embedding:0.6b',
    modelVersion: '1.0',
    dimension: 128,
    vectorHash: 'vh_test',
    vectorBlob: vector.buffer as ArrayBuffer,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  })
}

const TEST_PAYLOAD = {
  targetType: 'dockItem',
  targetId: '1',
  userId: USER_A,
  workspaceId: WS_DEFAULT,
  contentHash: 'ch_test123',
  text: 'test content for embedding service',
}

describe('embeddingService', () => {
  beforeEach(async () => {
    await db.table('embeddingVectors').clear()
    await db.table('algorithmAuditLogs').clear()
    await db.table('modelRuntimeStatuses').clear()
    await db.table('semanticFeatureSnapshots').clear()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await db.table('embeddingVectors').clear()
    await db.table('algorithmAuditLogs').clear()
    await db.table('modelRuntimeStatuses').clear()
    await db.table('semanticFeatureSnapshots').clear()
  })

  it('contentHash dirty check skips duplicate computation', async () => {
    await modelRuntimeStatusesTable.put(makeRuntimeStatus())
    await seedEmbeddingVector({
      contentHash: 'ch_test123',
      modelId: 'qwen3-embedding:0.6b',
    })

    const result = await embeddingService.generateEmbedding(TEST_PAYLOAD)

    expect(result.status).toBe('skipped')
    expect(result.fallbackUsed).toBe(false)
    expect(generateEmbeddingForTarget).not.toHaveBeenCalled()
  })

  it('modelId change marks dirty and regenerates', async () => {
    await modelRuntimeStatusesTable.put(makeRuntimeStatus({
      embeddingModelId: 'new-model:v2',
    }))
    await seedEmbeddingVector({
      contentHash: 'ch_test123',
      modelId: 'old-model:v1',
    })

    vi.mocked(generateEmbeddingForTarget).mockImplementation(async () => {
      const vector = new Float32Array(128)
      await embeddingVectorsTable.put({
        id: makeEmbeddingVectorId(USER_A, WS_DEFAULT, 'dockItem', '1'),
        userId: USER_A,
        workspaceId: WS_DEFAULT,
        targetType: 'dockItem',
        targetId: '1',
        contentHash: 'ch_test123',
        providerId: 'ollama-openai-compatible',
        modelId: 'new-model:v2',
        modelVersion: '2.0',
        dimension: 128,
        vectorHash: 'vh_new',
        vectorBlob: vector.buffer as ArrayBuffer,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      return {
        success: true,
        data: vector,
        dim: 128,
        modelProvider: 'ollama-openai-compatible',
        modelName: 'new-model:v2',
        modelVersion: '2.0',
        auditLogId: 'audit-emb-new',
      }
    })

    const result = await embeddingService.generateEmbedding(TEST_PAYLOAD)

    expect(markSimilarityIndexEntriesStaleByVector).toHaveBeenCalledWith(
      USER_A, 'dockItem', '1', WS_DEFAULT,
    )
    expect(generateEmbeddingForTarget).toHaveBeenCalled()
    expect(result.status).toBe('success')
    expect(result.modelId).toBe('new-model:v2')
  })

  it('delegates to localModelRuntimeService', async () => {
    await modelRuntimeStatusesTable.put(makeRuntimeStatus())

    vi.mocked(generateEmbeddingForTarget).mockImplementation(async () => {
      const vector = new Float32Array(128)
      await embeddingVectorsTable.put({
        id: makeEmbeddingVectorId(USER_A, WS_DEFAULT, 'dockItem', '1'),
        userId: USER_A,
        workspaceId: WS_DEFAULT,
        targetType: 'dockItem',
        targetId: '1',
        contentHash: 'ch_test123',
        providerId: 'ollama-openai-compatible',
        modelId: 'qwen3-embedding:0.6b',
        modelVersion: '1.0',
        dimension: 128,
        vectorHash: 'vh_test',
        vectorBlob: vector.buffer as ArrayBuffer,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      return {
        success: true,
        data: vector,
        dim: 128,
        modelProvider: 'ollama-openai-compatible',
        modelName: 'qwen3-embedding:0.6b',
        modelVersion: '1.0',
        auditLogId: 'audit-emb-1',
      }
    })

    await embeddingService.generateEmbedding(TEST_PAYLOAD)

    expect(generateEmbeddingForTarget).toHaveBeenCalledWith(
      USER_A,
      WS_DEFAULT,
      'dockItem',
      '1',
      TEST_PAYLOAD.text,
      TEST_PAYLOAD.contentHash,
    )
  })

  it('fallback when model unavailable — core mode', async () => {
    await modelRuntimeStatusesTable.put(makeRuntimeStatus({
      mode: 'core',
      embeddingStatus: 'unavailable',
    }))

    const result = await embeddingService.generateEmbedding(TEST_PAYLOAD)

    expect(result.status).toBe('fallback')
    expect(result.fallbackUsed).toBe(true)
    expect(generateEmbeddingForTarget).not.toHaveBeenCalled()
  })

  it('fallback when model unavailable — no runtime status', async () => {
    const result = await embeddingService.generateEmbedding(TEST_PAYLOAD)

    expect(result.status).toBe('fallback')
    expect(result.fallbackUsed).toBe(true)
    expect(result.runtimeMode).toBe('unavailable')
    expect(generateEmbeddingForTarget).not.toHaveBeenCalled()
  })

  it('fallback does NOT write EmbeddingVector — only AlgorithmAuditLog', async () => {
    await modelRuntimeStatusesTable.put(makeRuntimeStatus({
      mode: 'core',
      embeddingStatus: 'unavailable',
    }))

    await embeddingService.generateEmbedding(TEST_PAYLOAD)

    const vectors = await embeddingVectorsTable.toArray()
    expect(vectors.length).toBe(0)

    const logs = await algorithmAuditLogsTable.toArray()
    expect(logs.length).toBe(1)
    expect(logs[0].capability).toBe('embedding_generate')
    expect(logs[0].fallbackUsed).toBe(true)
  })

  it('fallback providerId/modelId/modelVersion are rule_fallback', async () => {
    await modelRuntimeStatusesTable.put(makeRuntimeStatus({
      mode: 'core',
      embeddingStatus: 'unavailable',
    }))

    const result = await embeddingService.generateEmbedding(TEST_PAYLOAD)

    expect(result.providerId).toBe('rule_fallback')
    expect(result.modelId).toBe('rule_fallback')
    expect(result.modelVersion).toBe('rule_fallback')

    const logs = await algorithmAuditLogsTable.toArray()
    expect(logs[0].providerId).toBe('rule_fallback')
    expect(logs[0].modelId).toBe('rule_fallback')
    expect(logs[0].modelVersion).toBe('rule_fallback')
  })

  it('success writes EmbeddingVector', async () => {
    await modelRuntimeStatusesTable.put(makeRuntimeStatus())

    vi.mocked(generateEmbeddingForTarget).mockImplementation(async () => {
      const vector = new Float32Array(128)
      await embeddingVectorsTable.put({
        id: makeEmbeddingVectorId(USER_A, WS_DEFAULT, 'dockItem', '1'),
        userId: USER_A,
        workspaceId: WS_DEFAULT,
        targetType: 'dockItem',
        targetId: '1',
        contentHash: 'ch_test123',
        providerId: 'ollama-openai-compatible',
        modelId: 'qwen3-embedding:0.6b',
        modelVersion: '1.0',
        dimension: 128,
        vectorHash: 'vh_test',
        vectorBlob: vector.buffer as ArrayBuffer,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      return {
        success: true,
        data: vector,
        dim: 128,
        modelProvider: 'ollama-openai-compatible',
        modelName: 'qwen3-embedding:0.6b',
        modelVersion: '1.0',
        auditLogId: 'audit-emb-1',
      }
    })

    const result = await embeddingService.generateEmbedding(TEST_PAYLOAD)

    expect(result.status).toBe('success')
    expect(result.embeddingVector).not.toBeNull()

    const evId = makeEmbeddingVectorId(USER_A, WS_DEFAULT, 'dockItem', '1')
    const stored = await embeddingVectorsTable.get(evId)
    expect(stored).toBeDefined()
    expect(stored?.modelId).toBe('qwen3-embedding:0.6b')
  })

  it('metadata complete on success', async () => {
    await modelRuntimeStatusesTable.put(makeRuntimeStatus())

    vi.mocked(generateEmbeddingForTarget).mockImplementation(async () => {
      const vector = new Float32Array(256)
      await embeddingVectorsTable.put({
        id: makeEmbeddingVectorId(USER_A, WS_DEFAULT, 'dockItem', '1'),
        userId: USER_A,
        workspaceId: WS_DEFAULT,
        targetType: 'dockItem',
        targetId: '1',
        contentHash: 'ch_test123',
        providerId: 'ollama-openai-compatible',
        modelId: 'qwen3-embedding:0.6b',
        modelVersion: '1.0',
        dimension: 256,
        vectorHash: 'vh_test_256',
        vectorBlob: vector.buffer as ArrayBuffer,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      return {
        success: true,
        data: vector,
        dim: 256,
        modelProvider: 'ollama-openai-compatible',
        modelName: 'qwen3-embedding:0.6b',
        modelVersion: '1.0',
        auditLogId: 'audit-emb-256',
      }
    })

    const result = await embeddingService.generateEmbedding(TEST_PAYLOAD)

    expect(result.status).toBe('success')
    expect(result.providerId).toBe('ollama-openai-compatible')
    expect(result.modelId).toBe('qwen3-embedding:0.6b')
    expect(result.modelVersion).toBe('1.0')
    expect(result.runtimeMode).toBe('model_available')
    expect(result.dimension).toBe(256)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.fallbackUsed).toBe(false)
    expect(result.errorMessage).toBeNull()
    expect(result.auditLogId).toBeTruthy()
  })

  it('does not directly call provider — only calls localModelRuntimeService', async () => {
    await modelRuntimeStatusesTable.put(makeRuntimeStatus())

    vi.mocked(generateEmbeddingForTarget).mockImplementation(async () => {
      const vector = new Float32Array(128)
      await embeddingVectorsTable.put({
        id: makeEmbeddingVectorId(USER_A, WS_DEFAULT, 'dockItem', '1'),
        userId: USER_A,
        workspaceId: WS_DEFAULT,
        targetType: 'dockItem',
        targetId: '1',
        contentHash: 'ch_test123',
        providerId: 'ollama-openai-compatible',
        modelId: 'qwen3-embedding:0.6b',
        modelVersion: '1.0',
        dimension: 128,
        vectorHash: 'vh_test',
        vectorBlob: vector.buffer as ArrayBuffer,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      return {
        success: true,
        data: vector,
        dim: 128,
        modelProvider: 'ollama-openai-compatible',
        modelName: 'qwen3-embedding:0.6b',
        modelVersion: '1.0',
        auditLogId: 'audit-emb-1',
      }
    })

    await embeddingService.generateEmbedding(TEST_PAYLOAD)

    expect(generateEmbeddingForTarget).toHaveBeenCalledTimes(1)
    expect(generateEmbeddingForTarget).toHaveBeenCalledWith(
      USER_A,
      WS_DEFAULT,
      'dockItem',
      '1',
      TEST_PAYLOAD.text,
      TEST_PAYLOAD.contentHash,
    )
  })

  it('modelVersion change (via modelId upgrade) marks dirty and regenerates', async () => {
    await modelRuntimeStatusesTable.put(makeRuntimeStatus({
      embeddingModelId: 'qwen3-embedding:0.6b-v2',
    }))
    await seedEmbeddingVector({
      contentHash: 'ch_test123',
      modelId: 'qwen3-embedding:0.6b',
      modelVersion: '1.0',
    })

    vi.mocked(generateEmbeddingForTarget).mockImplementation(async () => {
      const vector = new Float32Array(128)
      await embeddingVectorsTable.put({
        id: makeEmbeddingVectorId(USER_A, WS_DEFAULT, 'dockItem', '1'),
        userId: USER_A,
        workspaceId: WS_DEFAULT,
        targetType: 'dockItem',
        targetId: '1',
        contentHash: 'ch_test123',
        providerId: 'ollama-openai-compatible',
        modelId: 'qwen3-embedding:0.6b-v2',
        modelVersion: '2.0',
        dimension: 128,
        vectorHash: 'vh_new_version',
        vectorBlob: vector.buffer as ArrayBuffer,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      return {
        success: true,
        data: vector,
        dim: 128,
        modelProvider: 'ollama-openai-compatible',
        modelName: 'qwen3-embedding:0.6b-v2',
        modelVersion: '2.0',
        auditLogId: 'audit-emb-version',
      }
    })

    const result = await embeddingService.generateEmbedding(TEST_PAYLOAD)

    expect(markSimilarityIndexEntriesStaleByVector).toHaveBeenCalledWith(
      USER_A, 'dockItem', '1', WS_DEFAULT,
    )
    expect(generateEmbeddingForTarget).toHaveBeenCalled()
    expect(result.status).toBe('success')
    expect(result.modelId).toBe('qwen3-embedding:0.6b-v2')
    expect(result.modelVersion).toBe('2.0')
  })

  it('dimension change (via modelId upgrade) marks dirty and regenerates', async () => {
    await modelRuntimeStatusesTable.put(makeRuntimeStatus({
      embeddingModelId: 'qwen3-embedding:1.0b',
    }))
    await seedEmbeddingVector({
      contentHash: 'ch_test123',
      modelId: 'qwen3-embedding:0.6b',
      modelVersion: '1.0',
      dimension: 128,
    })

    vi.mocked(generateEmbeddingForTarget).mockImplementation(async () => {
      const vector = new Float32Array(256)
      await embeddingVectorsTable.put({
        id: makeEmbeddingVectorId(USER_A, WS_DEFAULT, 'dockItem', '1'),
        userId: USER_A,
        workspaceId: WS_DEFAULT,
        targetType: 'dockItem',
        targetId: '1',
        contentHash: 'ch_test123',
        providerId: 'ollama-openai-compatible',
        modelId: 'qwen3-embedding:1.0b',
        modelVersion: '1.0',
        dimension: 256,
        vectorHash: 'vh_new_dim',
        vectorBlob: vector.buffer as ArrayBuffer,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      return {
        success: true,
        data: vector,
        dim: 256,
        modelProvider: 'ollama-openai-compatible',
        modelName: 'qwen3-embedding:1.0b',
        modelVersion: '1.0',
        auditLogId: 'audit-emb-dim',
      }
    })

    const result = await embeddingService.generateEmbedding(TEST_PAYLOAD)

    expect(markSimilarityIndexEntriesStaleByVector).toHaveBeenCalledWith(
      USER_A, 'dockItem', '1', WS_DEFAULT,
    )
    expect(generateEmbeddingForTarget).toHaveBeenCalled()
    expect(result.status).toBe('success')
    expect(result.dimension).toBe(256)
  })

  it('fallback does not write SemanticFeatureSnapshot', async () => {
    await modelRuntimeStatusesTable.put(makeRuntimeStatus({
      mode: 'core',
      embeddingStatus: 'unavailable',
    }))

    await embeddingService.generateEmbedding(TEST_PAYLOAD)

    const snapshots = await semanticFeatureSnapshotsTable.toArray()
    expect(snapshots.length).toBe(0)
  })

  it('missing payload fields throw sanitized error', async () => {
    await expect(
      embeddingService.generateEmbedding({ ...TEST_PAYLOAD, targetId: '' }),
    ).rejects.toThrow()

    await expect(
      embeddingService.generateEmbedding({ ...TEST_PAYLOAD, workspaceId: '' }),
    ).rejects.toThrow()

    await expect(
      embeddingService.generateEmbedding({ ...TEST_PAYLOAD, contentHash: '' }),
    ).rejects.toThrow()

    await expect(
      embeddingService.generateEmbedding({ ...TEST_PAYLOAD, text: '' }),
    ).rejects.toThrow()
  })

  it('does not hardcode dimension — dimension comes from provider result', async () => {
    await modelRuntimeStatusesTable.put(makeRuntimeStatus())

    vi.mocked(generateEmbeddingForTarget).mockImplementation(async () => {
      const vector = new Float32Array(512)
      await embeddingVectorsTable.put({
        id: makeEmbeddingVectorId(USER_A, WS_DEFAULT, 'dockItem', '1'),
        userId: USER_A,
        workspaceId: WS_DEFAULT,
        targetType: 'dockItem',
        targetId: '1',
        contentHash: 'ch_test123',
        providerId: 'ollama-openai-compatible',
        modelId: 'qwen3-embedding:0.6b',
        modelVersion: '1.0',
        dimension: 512,
        vectorHash: 'vh_test_512',
        vectorBlob: vector.buffer as ArrayBuffer,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      return {
        success: true,
        data: vector,
        dim: 512,
        modelProvider: 'ollama-openai-compatible',
        modelName: 'qwen3-embedding:0.6b',
        modelVersion: '1.0',
        auditLogId: 'audit-emb-512',
      }
    })

    const result = await embeddingService.generateEmbedding(TEST_PAYLOAD)

    expect(result.dimension).toBe(512)
    expect(result.embeddingVector?.dimension).toBe(512)
  })

  it('modelVersion change in runtime status marks dirty and regenerates', async () => {
    await modelRuntimeStatusesTable.put(makeRuntimeStatus({
      embeddingModelVersion: '2.0',
    }))
    await seedEmbeddingVector({
      contentHash: 'ch_test123',
      modelId: 'qwen3-embedding:0.6b',
      modelVersion: '1.0',
    })

    vi.mocked(generateEmbeddingForTarget).mockImplementation(async () => {
      const vector = new Float32Array(128)
      await embeddingVectorsTable.put({
        id: makeEmbeddingVectorId(USER_A, WS_DEFAULT, 'dockItem', '1'),
        userId: USER_A,
        workspaceId: WS_DEFAULT,
        targetType: 'dockItem',
        targetId: '1',
        contentHash: 'ch_test123',
        providerId: 'ollama-openai-compatible',
        modelId: 'qwen3-embedding:0.6b',
        modelVersion: '2.0',
        dimension: 128,
        vectorHash: 'vh_v2',
        vectorBlob: vector.buffer as ArrayBuffer,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      return {
        success: true,
        data: vector,
        dim: 128,
        modelProvider: 'ollama-openai-compatible',
        modelName: 'qwen3-embedding:0.6b',
        modelVersion: '2.0',
        auditLogId: 'audit-emb-v2',
      }
    })

    const result = await embeddingService.generateEmbedding(TEST_PAYLOAD)

    expect(markSimilarityIndexEntriesStaleByVector).toHaveBeenCalledWith(
      USER_A, 'dockItem', '1', WS_DEFAULT,
    )
    expect(generateEmbeddingForTarget).toHaveBeenCalled()
    expect(result.status).toBe('success')
    expect(result.modelVersion).toBe('2.0')
  })

  it('dimension change in runtime status marks dirty and regenerates', async () => {
    await modelRuntimeStatusesTable.put(makeRuntimeStatus({
      embeddingDimension: 256,
    }))
    await seedEmbeddingVector({
      contentHash: 'ch_test123',
      modelId: 'qwen3-embedding:0.6b',
      modelVersion: '1.0',
      dimension: 128,
    })

    vi.mocked(generateEmbeddingForTarget).mockImplementation(async () => {
      const vector = new Float32Array(256)
      await embeddingVectorsTable.put({
        id: makeEmbeddingVectorId(USER_A, WS_DEFAULT, 'dockItem', '1'),
        userId: USER_A,
        workspaceId: WS_DEFAULT,
        targetType: 'dockItem',
        targetId: '1',
        contentHash: 'ch_test123',
        providerId: 'ollama-openai-compatible',
        modelId: 'qwen3-embedding:0.6b',
        modelVersion: '1.0',
        dimension: 256,
        vectorHash: 'vh_256',
        vectorBlob: vector.buffer as ArrayBuffer,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      return {
        success: true,
        data: vector,
        dim: 256,
        modelProvider: 'ollama-openai-compatible',
        modelName: 'qwen3-embedding:0.6b',
        modelVersion: '1.0',
        auditLogId: 'audit-emb-256',
      }
    })

    const result = await embeddingService.generateEmbedding(TEST_PAYLOAD)

    expect(markSimilarityIndexEntriesStaleByVector).toHaveBeenCalledWith(
      USER_A, 'dockItem', '1', WS_DEFAULT,
    )
    expect(generateEmbeddingForTarget).toHaveBeenCalled()
    expect(result.status).toBe('success')
    expect(result.dimension).toBe(256)
  })

  it('skips when modelVersion and dimension match runtime status', async () => {
    await modelRuntimeStatusesTable.put(makeRuntimeStatus({
      embeddingModelVersion: '1.0',
      embeddingDimension: 128,
    }))
    await seedEmbeddingVector({
      contentHash: 'ch_test123',
      modelId: 'qwen3-embedding:0.6b',
      modelVersion: '1.0',
      dimension: 128,
    })

    const result = await embeddingService.generateEmbedding(TEST_PAYLOAD)

    expect(result.status).toBe('skipped')
    expect(generateEmbeddingForTarget).not.toHaveBeenCalled()
  })

  it('provider unavailable fallback does not block and does not write fake vector', async () => {
    await modelRuntimeStatusesTable.put(makeRuntimeStatus({
      mode: 'core',
      embeddingStatus: 'unavailable',
    }))

    const result = await embeddingService.generateEmbedding(TEST_PAYLOAD)

    expect(result.status).toBe('fallback')
    expect(result.fallbackUsed).toBe(true)
    expect(result.embeddingVector).toBeNull()
    expect(result.providerId).toBe('rule_fallback')
    expect(result.modelId).toBe('rule_fallback')

    const vectors = await embeddingVectorsTable.toArray()
    expect(vectors.length).toBe(0)
  })
})
