import type {
  EmbeddedModelProvider,
  ReasoningProvider,
  EmbeddingResult,
  SummaryResult,
  ExplanationResult,
  CapabilityStatus,
  CapabilityMode,
  ModelAvailability,
} from '@atlax/domain'
import { createPrivacyFirewall } from '@atlax/domain'

function simpleHash(text: string): number {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

function generateDeterministicEmbedding(text: string, dim: number = 128): Float32Array {
  const data = new Float32Array(dim)
  const hash = simpleHash(text)
  for (let i = 0; i < dim; i++) {
    const seed = hash + i * 31
    data[i] = (Math.sin(seed) * 10000) % 1
    if (data[i] < 0) data[i] += 1
  }
  return data
}

export class DevEmbeddedModelProvider implements EmbeddedModelProvider {
  readonly providerId = 'dev'
  readonly providerName = 'Dev Embedded Model Mock'
  readonly availability = 'available' as ModelAvailability

  async generateEmbedding(text: string, _options?: Record<string, unknown>): Promise<EmbeddingResult> {
    try {
      const data = generateDeterministicEmbedding(text, 128)
      return {
        success: true,
        data,
        dim: 128,
        modelProvider: 'dev',
        modelName: 'dev-embedding-mock',
        modelVersion: '1.0.0',
      }
    } catch (err) {
      return {
        success: false,
        modelProvider: 'dev',
        modelName: 'dev-embedding-mock',
        modelVersion: '1.0.0',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  async generateSummary(text: string, _options?: Record<string, unknown>): Promise<SummaryResult> {
    try {
      const summary = text.length > 80 ? text.slice(0, 80) + '...' : text + ' [dev-summary]'
      return {
        success: true,
        summary,
        modelProvider: 'dev',
        modelName: 'dev-embedding-mock',
        modelVersion: '1.0.0',
      }
    } catch (err) {
      return {
        success: false,
        modelProvider: 'dev',
        modelName: 'dev-embedding-mock',
        modelVersion: '1.0.0',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}

export class DevReasoningProvider implements ReasoningProvider {
  readonly providerId = 'dev'
  readonly providerName = 'Dev Reasoning Mock'
  readonly availability = 'available' as ModelAvailability

  async generateExplanation(text: string, _context?: string, _options?: Record<string, unknown>): Promise<ExplanationResult> {
    try {
      const words = text.split(/\s+/)
      const seen = new Set<string>()
      const topics: string[] = []
      for (const word of words) {
        const lower = word.toLowerCase()
        if (lower.length > 3 && !seen.has(lower)) {
          seen.add(lower)
          topics.push(lower)
          if (topics.length >= 3) break
        }
      }
      return {
        success: true,
        explanation: `[dev-explanation] ${text.slice(0, 60)}`,
        topics,
        intent: 'inform',
        modelProvider: 'dev',
        modelName: 'dev-reasoning-mock',
        modelVersion: '1.0.0',
      }
    } catch (err) {
      return {
        success: false,
        modelProvider: 'dev',
        modelName: 'dev-reasoning-mock',
        modelVersion: '1.0.0',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}

export class ModelProviderRegistry {
  private embeddingProvider: EmbeddedModelProvider | null = null
  private reasoningProvider: ReasoningProvider | null = null
  private _embeddingAvailability: ModelAvailability = 'unavailable'
  private _reasoningAvailability: ModelAvailability = 'unavailable'
  private firewall = createPrivacyFirewall()

  registerEmbeddingProvider(provider: EmbeddedModelProvider): void {
    this.firewall.assertNoBusinessAccess(provider)
    this.embeddingProvider = provider
    this._embeddingAvailability = provider.availability
  }

  registerReasoningProvider(provider: ReasoningProvider): void {
    this.firewall.assertNoBusinessAccess(provider)
    this.reasoningProvider = provider
    this._reasoningAvailability = provider.availability
  }

  getEmbeddingProvider(): EmbeddedModelProvider | null {
    return this.embeddingProvider
  }

  getReasoningProvider(): ReasoningProvider | null {
    return this.reasoningProvider
  }

  async generateEmbedding(text: string, options?: Record<string, unknown>): Promise<EmbeddingResult> {
    if (!this.embeddingProvider) {
      return { success: false, modelProvider: '', modelName: '', modelVersion: '', error: 'No embedding provider registered' }
    }
    try {
      const result = await this.embeddingProvider.generateEmbedding(text, options)
      const validation = this.firewall.validateProviderOutput(result)
      if (!validation.valid) {
        this._embeddingAvailability = 'error'
        return { success: false, modelProvider: this.embeddingProvider.providerId, modelName: this.embeddingProvider.providerName, modelVersion: '', error: `Provider output validation failed: ${validation.reason}` }
      }
      if (!result.success) {
        this._embeddingAvailability = 'error'
      }
      return result
    } catch (err) {
      this._embeddingAvailability = 'error'
      return { success: false, modelProvider: this.embeddingProvider.providerId, modelName: this.embeddingProvider.providerName, modelVersion: '', error: err instanceof Error ? err.message : String(err) }
    }
  }

  async generateSummary(text: string, options?: Record<string, unknown>): Promise<SummaryResult> {
    if (!this.embeddingProvider) {
      return { success: false, modelProvider: '', modelName: '', modelVersion: '', error: 'No embedding provider registered' }
    }
    try {
      const result = await this.embeddingProvider.generateSummary(text, options)
      const validation = this.firewall.validateProviderOutput(result)
      if (!validation.valid) {
        this._embeddingAvailability = 'error'
        return { success: false, modelProvider: this.embeddingProvider.providerId, modelName: this.embeddingProvider.providerName, modelVersion: '', error: `Provider output validation failed: ${validation.reason}` }
      }
      if (!result.success) {
        this._embeddingAvailability = 'error'
      }
      return result
    } catch (err) {
      this._embeddingAvailability = 'error'
      return { success: false, modelProvider: this.embeddingProvider.providerId, modelName: this.embeddingProvider.providerName, modelVersion: '', error: err instanceof Error ? err.message : String(err) }
    }
  }

  async generateExplanation(text: string, context?: string, options?: Record<string, unknown>): Promise<ExplanationResult> {
    if (!this.reasoningProvider) {
      return { success: false, modelProvider: '', modelName: '', modelVersion: '', error: 'No reasoning provider registered' }
    }
    try {
      const result = await this.reasoningProvider.generateExplanation(text, context, options)
      const validation = this.firewall.validateProviderOutput(result)
      if (!validation.valid) {
        this._reasoningAvailability = 'error'
        return { success: false, modelProvider: this.reasoningProvider.providerId, modelName: this.reasoningProvider.providerName, modelVersion: '', error: `Provider output validation failed: ${validation.reason}` }
      }
      if (!result.success) {
        this._reasoningAvailability = 'error'
      }
      return result
    } catch (err) {
      this._reasoningAvailability = 'error'
      return { success: false, modelProvider: this.reasoningProvider.providerId, modelName: this.reasoningProvider.providerName, modelVersion: '', error: err instanceof Error ? err.message : String(err) }
    }
  }

  getCapabilityStatus(): CapabilityStatus {
    const embeddingProviderId = this.embeddingProvider?.providerId ?? null
    const reasoningProviderId = this.reasoningProvider?.providerId ?? null
    let mode: CapabilityMode = 'core'
    if (this._embeddingAvailability === 'available' || this._reasoningAvailability === 'available') {
      mode = 'model_available'
    } else if (this._embeddingAvailability === 'error' || this._reasoningAvailability === 'error') {
      mode = 'degraded'
    }
    return {
      mode,
      embeddingAvailability: this._embeddingAvailability,
      reasoningAvailability: this._reasoningAvailability,
      embeddingProviderId,
      reasoningProviderId,
    }
  }

  reset(): void {
    this.embeddingProvider = null
    this.reasoningProvider = null
    this._embeddingAvailability = 'unavailable'
    this._reasoningAvailability = 'unavailable'
  }
}

export const modelProviderRegistry = new ModelProviderRegistry()

export function getCapabilityStatus(): CapabilityStatus {
  try {
    return modelProviderRegistry.getCapabilityStatus()
  } catch {
    return {
      mode: 'core' as CapabilityMode,
      embeddingAvailability: 'unavailable' as ModelAvailability,
      reasoningAvailability: 'unavailable' as ModelAvailability,
      embeddingProviderId: null,
      reasoningProviderId: null,
    }
  }
}

export function initDevProviders(): void {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'development' && process.env?.NODE_ENV !== 'test') {
    return
  }
  modelProviderRegistry.registerEmbeddingProvider(new DevEmbeddedModelProvider())
  modelProviderRegistry.registerReasoningProvider(new DevReasoningProvider())
}

export function resetProviders(): void {
  modelProviderRegistry.reset()
}

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  initDevProviders()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  w.initDevProviders = initDevProviders
  w.resetProviders = resetProviders
  w.getCapabilityStatus = getCapabilityStatus
  w.modelProviderRegistry = modelProviderRegistry
}
