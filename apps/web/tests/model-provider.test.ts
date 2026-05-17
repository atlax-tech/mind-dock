import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  DevEmbeddedModelProvider,
  DevReasoningProvider,
  ModelProviderRegistry,
  getCapabilityStatus,
  initDevProviders,
  resetProviders,
} from '@/lib/modelProvider'
import { createPrivacyFirewall } from '@atlax/domain'
import type { EmbeddedModelProvider, ReasoningProvider, ModelAvailability } from '@atlax/domain'

describe('Model Provider System', () => {
  beforeEach(() => {
    resetProviders()
  })

  afterEach(() => {
    resetProviders()
  })

  describe('Core Mode', () => {
    it('returns core mode when no provider is registered', () => {
      const status = getCapabilityStatus()
      expect(status.mode).toBe('core')
      expect(status.embeddingAvailability).toBe('unavailable')
      expect(status.reasoningAvailability).toBe('unavailable')
      expect(status.embeddingProviderId).toBeNull()
      expect(status.reasoningProviderId).toBeNull()
    })

    it('returns success:false from registry safe methods when no provider registered', async () => {
      const registry = new ModelProviderRegistry()
      const embResult = await registry.generateEmbedding('test')
      expect(embResult.success).toBe(false)
      expect(embResult.error).toBe('No embedding provider registered')

      const sumResult = await registry.generateSummary('test')
      expect(sumResult.success).toBe(false)
      expect(sumResult.error).toBe('No embedding provider registered')

      const explResult = await registry.generateExplanation('test')
      expect(explResult.success).toBe(false)
      expect(explResult.error).toBe('No reasoning provider registered')
    })
  })

  describe('DevEmbeddedModelProvider', () => {
    it('generates deterministic embedding', async () => {
      const provider = new DevEmbeddedModelProvider()
      const result1 = await provider.generateEmbedding('hello world')
      const result2 = await provider.generateEmbedding('hello world')
      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)
      expect(result1.dim).toBe(128)
      expect(result1.modelProvider).toBe('dev')
      expect(result1.modelName).toBe('dev-embedding-mock')
      expect(result1.modelVersion).toBe('1.0.0')
      expect(Array.from(result1.data as Float32Array)).toEqual(Array.from(result2.data as Float32Array))
    })

    it('generates different embeddings for different inputs', async () => {
      const provider = new DevEmbeddedModelProvider()
      const result1 = await provider.generateEmbedding('hello')
      const result2 = await provider.generateEmbedding('world')
      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)
      expect(Array.from(result1.data as Float32Array)).not.toEqual(Array.from(result2.data as Float32Array))
    })

    it('generates deterministic summary', async () => {
      const provider = new DevEmbeddedModelProvider()
      const result = await provider.generateSummary('This is a test text for summary generation')
      expect(result.success).toBe(true)
      expect(result.summary).toBeDefined()
      expect(result.modelProvider).toBe('dev')
      expect(result.modelName).toBe('dev-embedding-mock')
    })

    it('truncates long text in summary', async () => {
      const provider = new DevEmbeddedModelProvider()
      const longText = 'a'.repeat(100)
      const result = await provider.generateSummary(longText)
      expect(result.success).toBe(true)
      expect((result.summary as string).length).toBeLessThanOrEqual(83)
    })
  })

  describe('DevReasoningProvider', () => {
    it('generates deterministic explanation', async () => {
      const provider = new DevReasoningProvider()
      const result = await provider.generateExplanation('machine learning algorithms process data')
      expect(result.success).toBe(true)
      expect(result.explanation).toBeDefined()
      expect(result.intent).toBe('inform')
      expect(result.modelProvider).toBe('dev')
      expect(result.modelName).toBe('dev-reasoning-mock')
      expect(result.modelVersion).toBe('1.0.0')
    })

    it('extracts topics from text', async () => {
      const provider = new DevReasoningProvider()
      const result = await provider.generateExplanation('machine learning algorithms process data efficiently')
      expect(result.success).toBe(true)
      expect(result.topics).toBeDefined()
      expect((result.topics as string[]).length).toBeGreaterThan(0)
      expect((result.topics as string[]).length).toBeLessThanOrEqual(3)
    })
  })

  describe('Provider Registration', () => {
    it('returns model_available mode after dev providers are registered', () => {
      initDevProviders()
      const status = getCapabilityStatus()
      expect(status.mode).toBe('model_available')
      expect(status.embeddingAvailability).toBe('available')
      expect(status.reasoningAvailability).toBe('available')
      expect(status.embeddingProviderId).toBe('dev')
      expect(status.reasoningProviderId).toBe('dev')
    })
  })

  describe('Registry Safe Methods', () => {
    it('calls provider through registry safe methods with validation', async () => {
      const registry = new ModelProviderRegistry()
      registry.registerEmbeddingProvider(new DevEmbeddedModelProvider())
      registry.registerReasoningProvider(new DevReasoningProvider())

      const embResult = await registry.generateEmbedding('test')
      expect(embResult.success).toBe(true)

      const sumResult = await registry.generateSummary('test')
      expect(sumResult.success).toBe(true)

      const explResult = await registry.generateExplanation('test')
      expect(explResult.success).toBe(true)
    })
  })

  describe('Provider Failure Fallback', () => {
    it('catches provider exceptions and returns success:false', async () => {
      const registry = new ModelProviderRegistry()
      const failingProvider: EmbeddedModelProvider = {
        providerId: 'failing',
        providerName: 'Failing Provider',
        availability: 'available' as ModelAvailability,
        probe: async () => ({ available: false, embeddingAvailable: false, reasoningAvailable: false }),
        generateEmbedding: async () => { throw new Error('Provider crashed') },
        generateSummary: async () => { throw new Error('Provider crashed') },
      }
      registry.registerEmbeddingProvider(failingProvider)

      const result = await registry.generateEmbedding('test')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Provider crashed')
    })

    it('marks availability as error when provider throws', async () => {
      const registry = new ModelProviderRegistry()
      const failingProvider: EmbeddedModelProvider = {
        providerId: 'failing',
        providerName: 'Failing Provider',
        availability: 'available' as ModelAvailability,
        probe: async () => ({ available: false, embeddingAvailable: false, reasoningAvailable: false }),
        generateEmbedding: async () => { throw new Error('crash') },
        generateSummary: async () => { throw new Error('crash') },
      }
      registry.registerEmbeddingProvider(failingProvider)

      await registry.generateEmbedding('test')
      const status = registry.getCapabilityStatus()
      expect(status.embeddingAvailability).toBe('error')
      expect(status.mode).toBe('degraded')
    })

    it('marks availability as error when provider returns success:false', async () => {
      const registry = new ModelProviderRegistry()
      const failingProvider: EmbeddedModelProvider = {
        providerId: 'failing',
        providerName: 'Failing Provider',
        availability: 'available' as ModelAvailability,
        probe: async () => ({ available: false, embeddingAvailable: false, reasoningAvailable: false }),
        generateEmbedding: async () => ({ success: false, modelProvider: 'failing', modelName: 'fail', modelVersion: '1.0', error: 'model error' }),
        generateSummary: async () => ({ success: false, modelProvider: 'failing', modelName: 'fail', modelVersion: '1.0', error: 'model error' }),
      }
      registry.registerEmbeddingProvider(failingProvider)

      const result = await registry.generateEmbedding('test')
      expect(result.success).toBe(false)
      const status = registry.getCapabilityStatus()
      expect(status.embeddingAvailability).toBe('error')
    })

    it('returns degraded when embedding available but reasoning error', async () => {
      const registry = new ModelProviderRegistry()
      registry.registerEmbeddingProvider(new DevEmbeddedModelProvider())
      const failingReasoning: ReasoningProvider = {
        providerId: 'failing',
        providerName: 'Failing Reasoning',
        availability: 'available' as ModelAvailability,
        generateExplanation: async () => { throw new Error('crash') },
      }
      registry.registerReasoningProvider(failingReasoning)

      await registry.generateExplanation('test')
      const status = registry.getCapabilityStatus()
      expect(status.embeddingAvailability).toBe('available')
      expect(status.reasoningAvailability).toBe('error')
      expect(status.mode).toBe('degraded')
    })

    it('returns degraded when reasoning available but embedding error', async () => {
      const registry = new ModelProviderRegistry()
      const failingEmbedding: EmbeddedModelProvider = {
        providerId: 'failing',
        providerName: 'Failing Embedding',
        availability: 'available' as ModelAvailability,
        probe: async () => ({ available: false, embeddingAvailable: false, reasoningAvailable: false }),
        generateEmbedding: async () => { throw new Error('crash') },
        generateSummary: async () => { throw new Error('crash') },
      }
      registry.registerEmbeddingProvider(failingEmbedding)
      registry.registerReasoningProvider(new DevReasoningProvider())

      await registry.generateEmbedding('test')
      const status = registry.getCapabilityStatus()
      expect(status.embeddingAvailability).toBe('error')
      expect(status.reasoningAvailability).toBe('available')
      expect(status.mode).toBe('degraded')
    })
  })

  describe('PrivacyFirewall', () => {
    it('validates allowed embedding result', () => {
      const firewall = createPrivacyFirewall()
      const validEmbedding = { success: true, data: new Float32Array(128), dim: 128, modelProvider: 'test', modelName: 'test', modelVersion: '1.0' }
      expect(firewall.validateProviderOutput(validEmbedding).valid).toBe(true)
    })

    it('validates allowed summary result', () => {
      const firewall = createPrivacyFirewall()
      const validSummary = { success: true, summary: 'test summary', modelProvider: 'test', modelName: 'test', modelVersion: '1.0' }
      expect(firewall.validateProviderOutput(validSummary).valid).toBe(true)
    })

    it('validates allowed explanation result', () => {
      const firewall = createPrivacyFirewall()
      const validExplanation = { success: true, explanation: 'test explanation', modelProvider: 'test', modelName: 'test', modelVersion: '1.0' }
      expect(firewall.validateProviderOutput(validExplanation).valid).toBe(true)
    })

    it('validates allowed error result', () => {
      const firewall = createPrivacyFirewall()
      const validError = { success: false, modelProvider: 'test', modelName: 'test', modelVersion: '1.0', error: 'something failed' }
      expect(firewall.validateProviderOutput(validError).valid).toBe(true)
    })

    it('validates allowed error result without error field', () => {
      const firewall = createPrivacyFirewall()
      const validError = { success: false, modelProvider: 'test', modelName: 'test', modelVersion: '1.0' }
      expect(firewall.validateProviderOutput(validError).valid).toBe(true)
    })

    it('rejects result missing modelName', () => {
      const firewall = createPrivacyFirewall()
      const incomplete = { success: true, modelProvider: 'test', modelVersion: '1.0', summary: 'test' }
      expect(firewall.validateProviderOutput(incomplete).valid).toBe(false)
    })

    it('rejects result missing modelVersion', () => {
      const firewall = createPrivacyFirewall()
      const incomplete = { success: true, modelProvider: 'test', modelName: 'test', summary: 'test' }
      expect(firewall.validateProviderOutput(incomplete).valid).toBe(false)
    })

    it('rejects success result with no valid payload', () => {
      const firewall = createPrivacyFirewall()
      const noPayload = { success: true, modelProvider: 'test', modelName: 'test', modelVersion: '1.0' }
      expect(firewall.validateProviderOutput(noPayload).valid).toBe(false)
    })

    it('rejects non-allowed result types', () => {
      const firewall = createPrivacyFirewall()
      expect(firewall.validateProviderOutput({ foo: 'bar' }).valid).toBe(false)
      expect(firewall.validateProviderOutput(null).valid).toBe(false)
      expect(firewall.validateProviderOutput('string').valid).toBe(false)
      expect(firewall.validateProviderOutput(42).valid).toBe(false)
    })

    it('rejects provider with business database access', () => {
      const firewall = createPrivacyFirewall()
      const maliciousProvider = {
        providerId: 'evil',
        providerName: 'Evil',
        availability: 'available' as ModelAvailability,
        db: {},
        generateEmbedding: async () => ({ success: true, data: new Float32Array(128), dim: 128, modelProvider: 'evil', modelName: 'evil', modelVersion: '1.0' }),
        generateSummary: async () => ({ success: true, summary: 'evil', modelProvider: 'evil', modelName: 'evil', modelVersion: '1.0' }),
      }
      expect(() => firewall.assertNoBusinessAccess(maliciousProvider)).toThrow(/Privacy violation/)
    })

    it('allows provider without business database access', () => {
      const firewall = createPrivacyFirewall()
      const cleanProvider = new DevEmbeddedModelProvider()
      expect(() => firewall.assertNoBusinessAccess(cleanProvider)).not.toThrow()
    })
  })

  describe('initDevProviders Environment Boundary', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('does not register providers in production environment', () => {
      vi.stubEnv('NODE_ENV', 'production')
      resetProviders()
      initDevProviders()
      const status = getCapabilityStatus()
      expect(status.mode).toBe('core')
    })

    it('registers providers in development environment', () => {
      vi.stubEnv('NODE_ENV', 'development')
      resetProviders()
      initDevProviders()
      const status = getCapabilityStatus()
      expect(status.mode).toBe('model_available')
    })

    it('registers providers in test environment', () => {
      vi.stubEnv('NODE_ENV', 'test')
      resetProviders()
      initDevProviders()
      const status = getCapabilityStatus()
      expect(status.mode).toBe('model_available')
    })
  })

  describe('getCapabilityStatus Safety', () => {
    it('never throws and always returns a valid status', () => {
      const status = getCapabilityStatus()
      expect(status).toBeDefined()
      expect(status.mode).toBeDefined()
      expect(['core', 'model_available', 'degraded']).toContain(status.mode)
    })
  })
})
