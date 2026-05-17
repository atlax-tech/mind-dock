import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { generateEmbeddingForTarget, generateSummaryForTarget, probeAndSyncStatus } from '@/lib/localModelRuntimeService'
import { modelProviderRegistry, resetProviders, OllamaOpenAICompatibleProvider } from '@/lib/modelProvider'
import { listAuditLogs, getEmbeddingVectorByTarget, getModelRuntimeStatus } from '@/lib/intelligenceRepository'
import { DEFAULT_WORKSPACE_ID } from '@atlax/domain'

const TEST_USER = 'test-user-runtime'
const TEST_WS = DEFAULT_WORKSPACE_ID

describe('LocalModelRuntimeService', () => {
  beforeEach(() => {
    resetProviders()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    resetProviders()
  })

  describe('generateEmbeddingForTarget', () => {
    it('writes audit log without leaking original text', async () => {
      const provider = new OllamaOpenAICompatibleProvider()
      modelProviderRegistry.registerEmbeddingProvider(provider)

      const mockEmbedding = new Array(128).fill(0.1)
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding }],
          model: 'qwen3-embedding:0.6b',
        }),
      } as Response)

      await generateEmbeddingForTarget(TEST_USER, TEST_WS, 'document', 'doc-audit-1', 'sensitive user content here', 'ch_test')

      const auditLogs = await listAuditLogs(TEST_USER, 'embedding', TEST_WS)
      expect(auditLogs.length).toBeGreaterThan(0)
      const log = auditLogs[0]
      expect(log.inputHash).toMatch(/^ih_/)
      expect(log.outputHash).toMatch(/^vh_/)
      expect(JSON.stringify(log)).not.toContain('sensitive user content here')
    })

    it('writes embedding vector metadata', async () => {
      const provider = new OllamaOpenAICompatibleProvider()
      modelProviderRegistry.registerEmbeddingProvider(provider)

      const mockEmbedding = new Array(128).fill(0.1)
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding }],
          model: 'qwen3-embedding:0.6b',
        }),
      } as Response)

      await generateEmbeddingForTarget(TEST_USER, TEST_WS, 'document', 'doc-vec-1', 'test content', 'ch_test')

      const vector = await getEmbeddingVectorByTarget(TEST_USER, 'document', 'doc-vec-1', TEST_WS)
      expect(vector).not.toBeNull()
      if (!vector) throw new Error('unreachable')
      expect(vector.dimension).toBe(128)
      expect(vector.vectorHash).toMatch(/^vh_/)
      expect(vector.providerId).toBe('ollama-openai-compatible')
    })

    it('does not store message.reasoning in audit', async () => {
      const provider = new OllamaOpenAICompatibleProvider()
      modelProviderRegistry.registerEmbeddingProvider(provider)

      const mockEmbedding = new Array(128).fill(0.1)
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding }],
          model: 'qwen3-embedding:0.6b',
        }),
      } as Response)

      await generateEmbeddingForTarget(TEST_USER, TEST_WS, 'document', 'doc-reasoning-1', 'test', 'ch_test')

      const auditLogs = await listAuditLogs(TEST_USER, 'embedding', TEST_WS)
      for (const log of auditLogs) {
        expect(JSON.stringify(log)).not.toContain('reasoning')
      }
    })

    it('audit outputHash varies with different embedding vectors', async () => {
      const uniqueUser = 'test-emb-hash-unique'
      const provider = new OllamaOpenAICompatibleProvider()
      modelProviderRegistry.registerEmbeddingProvider(provider)

      const mockEmbedding1 = new Array(128).fill(0.1)
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding1 }],
          model: 'qwen3-embedding:0.6b',
        }),
      } as Response)

      await generateEmbeddingForTarget(uniqueUser, TEST_WS, 'document', 'doc-hash-1', 'text1', 'ch_test1')

      const mockEmbedding2 = new Array(128).fill(0.9)
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding2 }],
          model: 'qwen3-embedding:0.6b',
        }),
      } as Response)

      await generateEmbeddingForTarget(uniqueUser, TEST_WS, 'document', 'doc-hash-2', 'text2', 'ch_test2')

      const auditLogs = await listAuditLogs(uniqueUser, 'embedding', TEST_WS)
      expect(auditLogs.length).toBeGreaterThanOrEqual(2)
      const outputs = auditLogs.slice(0, 2).map(l => l.outputHash)
      expect(outputs[0]).toMatch(/^vh_/)
      expect(outputs[1]).toMatch(/^vh_/)
      expect(outputs[0]).not.toBe(outputs[1])
    })
  })

  describe('generateSummaryForTarget', () => {
    it('writes audit log on success', async () => {
      const provider = new OllamaOpenAICompatibleProvider()
      modelProviderRegistry.registerEmbeddingProvider(provider)
      modelProviderRegistry.registerReasoningProvider(provider)

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'A brief summary' } }],
          model: 'qwen3:1.7b',
        }),
      } as Response)

      await generateSummaryForTarget(TEST_USER, TEST_WS, 'document', 'doc-sum-1', 'test content', 'ch_test')

      const auditLogs = await listAuditLogs(TEST_USER, 'summary', TEST_WS)
      expect(auditLogs.length).toBeGreaterThan(0)
    })

    it('does not store full reasoning content', async () => {
      const provider = new OllamaOpenAICompatibleProvider()
      modelProviderRegistry.registerEmbeddingProvider(provider)
      modelProviderRegistry.registerReasoningProvider(provider)

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Summary output' } }],
          model: 'qwen3:1.7b',
        }),
      } as Response)

      await generateSummaryForTarget(TEST_USER, TEST_WS, 'document', 'doc-sum-2', 'sensitive input', 'ch_test')

      const auditLogs = await listAuditLogs(TEST_USER, 'summary', TEST_WS)
      for (const log of auditLogs) {
        expect(JSON.stringify(log)).not.toContain('sensitive input')
      }
    })

    it('audit outputHash varies with different summary outputs', async () => {
      const uniqueUser = 'test-sum-hash-unique'
      const provider = new OllamaOpenAICompatibleProvider()
      modelProviderRegistry.registerEmbeddingProvider(provider)
      modelProviderRegistry.registerReasoningProvider(provider)

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'First summary output' } }],
          model: 'qwen3:1.7b',
        }),
      } as Response)

      await generateSummaryForTarget(uniqueUser, TEST_WS, 'document', 'doc-sumhash-1', 'text1', 'ch_test1')

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Completely different summary' } }],
          model: 'qwen3:1.7b',
        }),
      } as Response)

      await generateSummaryForTarget(uniqueUser, TEST_WS, 'document', 'doc-sumhash-2', 'text2', 'ch_test2')

      const auditLogs = await listAuditLogs(uniqueUser, 'summary', TEST_WS)
      expect(auditLogs.length).toBeGreaterThanOrEqual(2)
      const outputs = auditLogs.slice(0, 2).map(l => l.outputHash)
      expect(outputs[0]).toMatch(/^oh_/)
      expect(outputs[1]).toMatch(/^oh_/)
      expect(outputs[0]).not.toBe(outputs[1])
    })
  })

  describe('probeAndSyncStatus', () => {
    it('writes ModelRuntimeStatus with correct mode', async () => {
      const provider = new OllamaOpenAICompatibleProvider()
      modelProviderRegistry.registerEmbeddingProvider(provider)
      modelProviderRegistry.registerReasoningProvider(provider)

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'qwen3-embedding:0.6b' }, { id: 'qwen3:1.7b' }],
        }),
      } as Response)

      await probeAndSyncStatus(TEST_USER, TEST_WS)

      const s = await getModelRuntimeStatus(TEST_USER, 'ollama-openai-compatible', TEST_WS)
      expect(s).not.toBeNull()
      if (!s) throw new Error('unreachable')
      expect(s.mode).toBe('model_available')
      expect(s.embeddingStatus).toBe('available')
      expect(s.reasoningStatus).toBe('available')
    })

    it('writes degraded when only embedding available', async () => {
      const provider = new OllamaOpenAICompatibleProvider()
      modelProviderRegistry.registerEmbeddingProvider(provider)
      modelProviderRegistry.registerReasoningProvider(provider)

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'qwen3-embedding:0.6b' }],
        }),
      } as Response)

      await probeAndSyncStatus(TEST_USER, TEST_WS)

      const s = await getModelRuntimeStatus(TEST_USER, 'ollama-openai-compatible', TEST_WS)
      expect(s).not.toBeNull()
      if (!s) throw new Error('unreachable')
      expect(s.mode).toBe('degraded')
      expect(s.embeddingStatus).toBe('available')
      expect(s.reasoningStatus).toBe('unavailable')
    })

    it('writes unavailable when endpoint unreachable', async () => {
      const provider = new OllamaOpenAICompatibleProvider()
      modelProviderRegistry.registerEmbeddingProvider(provider)
      modelProviderRegistry.registerReasoningProvider(provider)

      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection refused'))

      await probeAndSyncStatus(TEST_USER, TEST_WS)

      const s = await getModelRuntimeStatus(TEST_USER, 'ollama-openai-compatible', TEST_WS)
      expect(s).not.toBeNull()
      if (!s) throw new Error('unreachable')
      expect(s.mode).toBe('unavailable')
    })

    it('records real model IDs in ModelRuntimeStatus', async () => {
      const provider = new OllamaOpenAICompatibleProvider()
      modelProviderRegistry.registerEmbeddingProvider(provider)
      modelProviderRegistry.registerReasoningProvider(provider)

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'qwen3-embedding:0.6b' }, { id: 'qwen3:1.7b' }],
        }),
      } as Response)

      await probeAndSyncStatus(TEST_USER, TEST_WS)

      const s = await getModelRuntimeStatus(TEST_USER, 'ollama-openai-compatible', TEST_WS)
      expect(s).not.toBeNull()
      if (!s) throw new Error('unreachable')
      expect(s.embeddingModelId).toBe('qwen3-embedding:0.6b')
      expect(s.reasoningModelId).toBe('qwen3:1.7b')
    })

    it('syncs registry capability status after probe', async () => {
      const provider = new OllamaOpenAICompatibleProvider()
      modelProviderRegistry.registerEmbeddingProvider(provider)
      modelProviderRegistry.registerReasoningProvider(provider)

      expect(modelProviderRegistry.getCapabilityStatus().mode).toBe('core')

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'qwen3-embedding:0.6b' }, { id: 'qwen3:1.7b' }],
        }),
      } as Response)

      await probeAndSyncStatus(TEST_USER, TEST_WS)

      const capStatus = modelProviderRegistry.getCapabilityStatus()
      expect(capStatus.mode).toBe('model_available')
      expect(capStatus.embeddingAvailability).toBe('available')
      expect(capStatus.reasoningAvailability).toBe('available')
    })
  })
})
