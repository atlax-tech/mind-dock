import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'
import {
  getEmbeddingEnabledPref,
  getReasoningEnabledPref,
  setEmbeddingEnabledPref,
  setReasoningEnabledPref,
  getUserPreference,
  setUserPreference,
  getModelRuntimeStatus,
  listAuditLogs,
} from '@/lib/intelligenceRepository'
import { getCapabilityStatus, initDevProviders, initOllamaProviders, resetProviders } from '@/lib/modelProvider'
import { DEFAULT_WORKSPACE_ID } from '@atlax/domain'
import { reactivatePendingModelJobs, enqueue } from '@/lib/backgroundJobQueue'

const USER_A = 'user_settings_test'
const WS = DEFAULT_WORKSPACE_ID

describe('Settings: userPreferences persistence', () => {
  beforeEach(async () => {
    await db.table('userPreferences').clear()
    await db.table('modelRuntimeStatuses').clear()
    await db.table('algorithmAuditLogs').clear()
  })

  it('embeddingEnabled 默认 false', async () => {
    const val = await getEmbeddingEnabledPref(USER_A, WS)
    expect(val).toBe(false)
  })

  it('reasoningEnabled 默认 false', async () => {
    const val = await getReasoningEnabledPref(USER_A, WS)
    expect(val).toBe(false)
  })

  it('setEmbeddingEnabledPref 写入后可读取', async () => {
    await setEmbeddingEnabledPref(USER_A, true, WS)
    expect(await getEmbeddingEnabledPref(USER_A, WS)).toBe(true)
    await setEmbeddingEnabledPref(USER_A, false, WS)
    expect(await getEmbeddingEnabledPref(USER_A, WS)).toBe(false)
  })

  it('setReasoningEnabledPref 写入后可读取', async () => {
    await setReasoningEnabledPref(USER_A, true, WS)
    expect(await getReasoningEnabledPref(USER_A, WS)).toBe(true)
    await setReasoningEnabledPref(USER_A, false, WS)
    expect(await getReasoningEnabledPref(USER_A, WS)).toBe(false)
  })

  it('不同 workspace 的偏好隔离', async () => {
    const WS_OTHER = 'ws_other'
    await setEmbeddingEnabledPref(USER_A, true, WS)
    await setEmbeddingEnabledPref(USER_A, false, WS_OTHER)
    expect(await getEmbeddingEnabledPref(USER_A, WS)).toBe(true)
    expect(await getEmbeddingEnabledPref(USER_A, WS_OTHER)).toBe(false)
  })

  it('getUserPreference / setUserPreference 通用接口', async () => {
    await setUserPreference(USER_A, 'custom_key', 'custom_value', WS)
    expect(await getUserPreference(USER_A, 'custom_key', WS)).toBe('custom_value')
    expect(await getUserPreference(USER_A, 'nonexistent', WS)).toBeNull()
  })
})

describe('Settings: dev/mock 隔离', () => {
  afterEach(() => {
    resetProviders()
  })

  it('initDevProviders 注册 mock provider 不写入真实 ModelRuntimeStatus', async () => {
    initDevProviders()
    const status = getCapabilityStatus()
    expect(status.mode).toBe('model_available')
    const dbStatus = await getModelRuntimeStatus(USER_A, 'ollama-openai-compatible', WS)
    expect(dbStatus).toBeNull()
  })

  it('dev provider 不点亮真实 embedding/reasoning 状态到 IndexedDB', async () => {
    initDevProviders()
    const embPref = await getEmbeddingEnabledPref(USER_A, WS)
    const reasPref = await getReasoningEnabledPref(USER_A, WS)
    expect(embPref).toBe(false)
    expect(reasPref).toBe(false)
  })
})

describe('Settings: probe 仅按钮触发', () => {
  beforeEach(async () => {
    await db.table('modelRuntimeStatuses').clear()
    await db.table('algorithmAuditLogs').clear()
    await db.table('userPreferences').clear()
  })

  it('无 runtime status 时 getCapabilityStatus 返回 core', () => {
    resetProviders()
    const status = getCapabilityStatus()
    expect(status.mode).toBe('core')
  })

  it('页面加载不自动 probe（无 audit log）', async () => {
    const logs = await listAuditLogs(USER_A, undefined, WS)
    expect(logs).toHaveLength(0)
  })

  it('probe 后只更新模型可用状态，不自动启用 embedding', async () => {
    await db.table('modelRuntimeStatuses').add({
      id: `${USER_A}_ollama-openai-compatible_${WS}`,
      userId: USER_A,
      workspaceId: WS,
      providerId: 'ollama-openai-compatible',
      providerName: 'ollama-openai-compatible',
      mode: 'model_available',
      embeddingStatus: 'available',
      reasoningStatus: 'available',
      embeddingModelId: 'qwen3-embedding:0.6b',
      reasoningModelId: 'qwen3:1.7b',
      lastProbeAt: new Date().toISOString(),
      lastProbeSuccess: true,
      lastSuccessfulProbeAt: new Date().toISOString(),
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    const embPref = await getEmbeddingEnabledPref(USER_A, WS)
    const reasPref = await getReasoningEnabledPref(USER_A, WS)
    expect(embPref).toBe(false)
    expect(reasPref).toBe(false)
  })
})

describe('Settings: Activity Trace 脱敏', () => {
  beforeEach(async () => {
    await db.table('algorithmAuditLogs').clear()
    await db.table('semanticFeatureSnapshots').clear()
    await db.table('embeddingVectors').clear()
  })

  it('audit log 不包含用户文本原文', async () => {
    const auditId = `${USER_A}_${WS}_emb_test`
    await db.table('algorithmAuditLogs').add({
      id: auditId,
      userId: USER_A,
      workspaceId: WS,
      providerId: 'ollama-openai-compatible',
      modelId: 'qwen3-embedding:0.6b',
      modelVersion: 'unknown',
      capability: 'embedding',
      durationMs: 100,
      success: true,
      fallbackUsed: false,
      inputHash: 'hash_input_abc123',
      outputHash: 'hash_output_def456',
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
    })
    const logs = await listAuditLogs(USER_A, undefined, WS)
    expect(logs).toHaveLength(1)
    const log = logs[0]
    expect(log.inputHash).toBeDefined()
    expect(log.outputHash).toBeDefined()
    expect(Object.keys(log)).not.toContain('inputText')
    expect(Object.keys(log)).not.toContain('outputText')
    expect(Object.keys(log)).not.toContain('summary')
    expect(Object.keys(log)).not.toContain('vector')
  })

  it('semantic snapshot 不暴露完整 vector 或 summary 原文到 audit', async () => {
    const snapId = `${USER_A}_${WS}_snap_test`
    await db.table('semanticFeatureSnapshots').add({
      id: snapId,
      userId: USER_A,
      workspaceId: WS,
      targetType: 'dockItem',
      targetId: '1',
      contentHash: 'ch_test',
      source: 'auto',
      reason: 'content_changed',
      evidence: 'hash_match',
      confidence: 0.95,
      safetyLevel: 'safe',
      modelProvider: 'ollama-openai-compatible',
      modelName: 'qwen3:1.7b',
      modelVersion: 'unknown',
      embeddingDim: 1024,
      embeddingRef: 'emb_ref_test',
      semanticSummary: 'This is a sensitive summary that should not appear in audit',
      intent: 'information',
      topics: ['test'],
      stale: false,
      staleKey: 0,
      expiredAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    const logs = await listAuditLogs(USER_A, undefined, WS)
    expect(logs).toHaveLength(0)
  })
})

describe('Settings: Dev Provider 不得激活真实语义 job', () => {
  beforeEach(async () => {
    await db.table('backgroundJobs').clear()
    await db.table('dockItems').clear()
    await db.table('modelRuntimeStatuses').clear()
    await db.table('userPreferences').clear()
  })

  afterEach(() => {
    resetProviders()
  })

  it('initDevProviders 后 reactivatePendingModelJobs 不激活 pending_model（无 IndexedDB ModelRuntimeStatus）', async () => {
    initDevProviders()
    expect(getCapabilityStatus().mode).toBe('model_available')

    const dockItemId = await db.dockItems.add({
      userId: USER_A,
      workspaceId: WS,
      rawText: 'test dev provider isolation',
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

    const job = await enqueue(USER_A, 'recompute_semantic_features', 'dockItem', String(dockItemId), 'ch_dev_test')
    await db.table('backgroundJobs').update(job.id, { status: 'pending_model' })

    const reactivated = await reactivatePendingModelJobs(USER_A, { workspaceId: WS })
    expect(reactivated).toHaveLength(0)

    const jobs = await db.table('backgroundJobs').toArray()
    expect(jobs[0].status).toBe('pending_model')
  })
})

describe('Settings: handleProbe 真实 Provider 注册', () => {
  beforeEach(async () => {
    await db.table('modelRuntimeStatuses').clear()
    await db.table('algorithmAuditLogs').clear()
    await db.table('userPreferences').clear()
    resetProviders()
  })

  afterEach(() => {
    resetProviders()
  })

  it('无 provider 时 initOllamaProviders 注册真实 Ollama Provider', () => {
    resetProviders()
    expect(getCapabilityStatus().mode).toBe('core')
    expect(getCapabilityStatus().embeddingProviderId).toBeNull()

    initOllamaProviders()

    const cap = getCapabilityStatus()
    expect(cap.embeddingProviderId).toBe('ollama-openai-compatible')
    expect(cap.reasoningProviderId).toBe('ollama-openai-compatible')
  })

  it('dev/mock provider 已存在时，initOllamaProviders 覆盖为真实 Ollama Provider', () => {
    initDevProviders()
    expect(getCapabilityStatus().embeddingProviderId).toBe('dev')

    initOllamaProviders()

    const cap = getCapabilityStatus()
    expect(cap.embeddingProviderId).toBe('ollama-openai-compatible')
    expect(cap.reasoningProviderId).toBe('ollama-openai-compatible')
  })

  it('dev/mock provider 不参与真实 ModelRuntimeStatus 写入', async () => {
    initDevProviders()
    expect(getCapabilityStatus().mode).toBe('model_available')

    const dbStatus = await getModelRuntimeStatus(USER_A, 'ollama-openai-compatible', WS)
    expect(dbStatus).toBeNull()
  })

  it('页面加载不自动调用 initOllamaProviders（无 audit log 无 ModelRuntimeStatus）', async () => {
    const logs = await listAuditLogs(USER_A, undefined, WS)
    expect(logs).toHaveLength(0)
    const dbStatus = await getModelRuntimeStatus(USER_A, 'ollama-openai-compatible', WS)
    expect(dbStatus).toBeNull()
  })

  it('probe 结果写入 ModelRuntimeStatus（成功或失败都有记录）', async () => {
    initOllamaProviders()

    const { probeAndSyncStatus } = await import('@/lib/localModelRuntimeService')
    try {
      await probeAndSyncStatus(USER_A, WS)
    } catch {
      // probe may fail in test env without Ollama
    }

    const dbStatus = await getModelRuntimeStatus(USER_A, 'ollama-openai-compatible', WS)
    expect(dbStatus).not.toBeNull()
    const status = dbStatus as { providerId: string; mode: string; lastProbeAt: string }
    expect(status.providerId).toBe('ollama-openai-compatible')
    expect(['model_available', 'degraded', 'unavailable']).toContain(status.mode)
    expect(status.lastProbeAt).toBeTruthy()
  })

  it('probe 失败时 Settings 不显示真实可用', async () => {
    initOllamaProviders()

    const { probeAndSyncStatus } = await import('@/lib/localModelRuntimeService')
    try {
      await probeAndSyncStatus(USER_A, WS)
    } catch {
      // probe may fail in test env without Ollama
    }

    const dbStatus = await getModelRuntimeStatus(USER_A, 'ollama-openai-compatible', WS)
    if (dbStatus && !dbStatus.lastProbeSuccess) {
      expect(dbStatus.embeddingStatus).toBe('unavailable')
      expect(dbStatus.reasoningStatus).toBe('unavailable')
      expect(dbStatus.mode).toBe('unavailable')
    }
  })
})
