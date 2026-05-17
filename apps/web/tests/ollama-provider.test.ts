import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  OllamaOpenAICompatibleProvider,
  DEFAULT_LOCAL_MODEL_BASE_URL,
  DEFAULT_EMBEDDING_MODEL_ID,
  DEFAULT_REASONING_MODEL_ID,
  resetProviders,
  modelProviderRegistry,
  initOllamaProviders,
  DevEmbeddedModelProvider,
} from '@/lib/modelProvider'
import { createPrivacyFirewall } from '@atlax/domain'

describe('OllamaOpenAICompatibleProvider', () => {
  let provider: OllamaOpenAICompatibleProvider

  beforeEach(() => {
    provider = new OllamaOpenAICompatibleProvider()
    resetProviders()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    resetProviders()
  })

  describe('Provider Identity', () => {
    it('has correct providerId', () => {
      expect(provider.providerId).toBe('ollama-openai-compatible')
    })

    it('has correct providerName', () => {
      expect(provider.providerName).toBe('Ollama Local Qwen')
    })

    it('does not trigger network requests on construction', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      new OllamaOpenAICompatibleProvider()
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('does not contain business database access properties', () => {
      const firewall = createPrivacyFirewall()
      expect(() => firewall.assertNoBusinessAccess(provider)).not.toThrow()
    })
  })

  describe('Default Constants', () => {
    it('has correct default base URL', () => {
      expect(DEFAULT_LOCAL_MODEL_BASE_URL).toBe('http://localhost:11434/v1')
    })

    it('has correct default embedding model ID', () => {
      expect(DEFAULT_EMBEDDING_MODEL_ID).toBe('qwen3-embedding:0.6b')
    })

    it('has correct default reasoning model ID', () => {
      expect(DEFAULT_REASONING_MODEL_ID).toBe('qwen3:1.7b')
    })
  })

  describe('probe()', () => {
    it('returns available when models are present', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: 'qwen3-embedding:0.6b' },
            { id: 'qwen3:1.7b' },
          ],
        }),
      } as Response)

      const result = await provider.probe()
      expect(result.available).toBe(true)
      expect(result.embeddingAvailable).toBe(true)
      expect(result.reasoningAvailable).toBe(true)
      expect(result.models).toContain('qwen3-embedding:0.6b')
    })

    it('returns unavailable when endpoint is unreachable', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection refused'))

      const result = await provider.probe()
      expect(result.available).toBe(false)
      expect(result.embeddingAvailable).toBe(false)
      expect(result.reasoningAvailable).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('returns partial when models are missing', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'qwen3-embedding:0.6b' }],
        }),
      } as Response)

      const result = await provider.probe()
      expect(result.available).toBe(true)
      expect(result.embeddingAvailable).toBe(true)
      expect(result.reasoningAvailable).toBe(false)
    })

    it('handles HTTP error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response)

      const result = await provider.probe()
      expect(result.available).toBe(false)
      expect(result.error).toContain('HTTP 500')
    })

    it('handles malformed JSON', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new SyntaxError('Unexpected token') },
      } as unknown as Response)

      const result = await provider.probe()
      expect(result.available).toBe(false)
    })
  })

  describe('generateEmbedding()', () => {
    it('returns embedding result on success', async () => {
      const mockEmbedding = new Array(1024).fill(0.1)
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding }],
          model: 'qwen3-embedding:0.6b',
        }),
      } as Response)

      const result = await provider.generateEmbedding('test input')
      expect(result.success).toBe(true)
      expect(result.dim).toBe(1024)
      expect(result.data).toBeInstanceOf(Float32Array)
      expect(result.modelProvider).toBe('ollama-openai-compatible')
      expect(result.modelName).toBe('qwen3-embedding:0.6b')
    })

    it('returns failure on HTTP error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response)

      const result = await provider.generateEmbedding('test input')
      expect(result.success).toBe(false)
      expect(result.error).toContain('HTTP 500')
    })

    it('returns failure on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'))

      const result = await provider.generateEmbedding('test input')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Network error')
    })

    it('returns failure on malformed response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response)

      const result = await provider.generateEmbedding('test input')
      expect(result.success).toBe(false)
      expect(result.error).toContain('No embedding')
    })
  })

  describe('generateSummary()', () => {
    it('returns summary on success', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'This is a summary.' } }],
          model: 'qwen3:1.7b',
        }),
      } as Response)

      const result = await provider.generateSummary('test input')
      expect(result.success).toBe(true)
      expect(result.summary).toBe('This is a summary.')
      expect(result.modelProvider).toBe('ollama-openai-compatible')
    })

    it('ignores message.reasoning field completely', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Summary text', reasoning: 'This should be completely ignored and not read' } }],
          model: 'qwen3:1.7b',
        }),
      } as Response)

      const result = await provider.generateSummary('test input')
      expect(result.success).toBe(true)
      expect(result.summary).toBe('Summary text')
    })

    it('strips think tags from content', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '<think reasoning chain here</think The actual summary' } }],
          model: 'qwen3:1.7b',
        }),
      } as Response)

      const result = await provider.generateSummary('test input')
      expect(result.success).toBe(true)
      expect(result.summary).not.toContain('<think')
      expect(result.summary).toContain('The actual summary')
    })

    it('returns failure when sanitized content is empty', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '<think only reasoning here </think ' } }],
          model: 'qwen3:1.7b',
        }),
      } as Response)

      const result = await provider.generateSummary('test input')
      expect(result.success).toBe(false)
      expect(result.error).toContain('sanitized_content_empty')
    })

    it('returns failure on HTTP error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 503,
      } as Response)

      const result = await provider.generateSummary('test input')
      expect(result.success).toBe(false)
    })
  })

  describe('generateExplanation()', () => {
    it('returns explanation on success', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'This document discusses AI topics.' } }],
          model: 'qwen3:1.7b',
        }),
      } as Response)

      const result = await provider.generateExplanation('test input')
      expect(result.success).toBe(true)
      expect(result.explanation).toBeDefined()
      expect(result.modelProvider).toBe('ollama-openai-compatible')
    })
  })

  describe('Provider Registration', () => {
    it('registers as both embedding and reasoning provider', () => {
      initOllamaProviders()
      const status = modelProviderRegistry.getCapabilityStatus()
      expect(status.embeddingProviderId).toBe('ollama-openai-compatible')
      expect(status.reasoningProviderId).toBe('ollama-openai-compatible')
    })

    it('is not marked as dev mock provider', () => {
      expect(provider.providerId).not.toBe('dev')
      expect(provider.providerName).not.toContain('Mock')
    })

    it('mock provider is not marked as real provider', () => {
      const devProvider = new DevEmbeddedModelProvider()
      expect(devProvider.providerId).toBe('dev')
      expect(devProvider.providerId).not.toBe('ollama-openai-compatible')
    })
  })

  describe('Registry probe sync', () => {
    it('syncAvailabilityFromProbe updates registry capability status', () => {
      initOllamaProviders()
      expect(modelProviderRegistry.getCapabilityStatus().mode).toBe('core')

      modelProviderRegistry.syncAvailabilityFromProbe({
        available: true,
        embeddingAvailable: true,
        reasoningAvailable: true,
      })

      const status = modelProviderRegistry.getCapabilityStatus()
      expect(status.mode).toBe('model_available')
      expect(status.embeddingAvailability).toBe('available')
      expect(status.reasoningAvailability).toBe('available')
    })

    it('syncAvailabilityFromProbe reflects degraded when only embedding available', () => {
      initOllamaProviders()

      modelProviderRegistry.syncAvailabilityFromProbe({
        available: true,
        embeddingAvailable: true,
        reasoningAvailable: false,
      })

      const status = modelProviderRegistry.getCapabilityStatus()
      expect(status.embeddingAvailability).toBe('available')
      expect(status.reasoningAvailability).toBe('unavailable')
    })

    it('syncAvailabilityFromProbe reflects unavailable when probe fails', () => {
      initOllamaProviders()

      modelProviderRegistry.syncAvailabilityFromProbe({
        available: false,
        embeddingAvailable: false,
        reasoningAvailable: false,
      })

      const status = modelProviderRegistry.getCapabilityStatus()
      expect(status.embeddingAvailability).toBe('unavailable')
      expect(status.reasoningAvailability).toBe('unavailable')
    })
  })
})
