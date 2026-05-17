import type {
  EmbeddedModelProvider,
  ReasoningProvider,
  EmbeddingResult,
  SummaryResult,
  ExplanationResult,
  CapabilityStatus,
  CapabilityMode,
  ModelAvailability,
  ProbeResult,
} from '@atlax/domain'
import { createPrivacyFirewall } from '@atlax/domain'
import { sanitizeReasoningContent } from '@/lib/reasoningSanitizer'

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

function validateChatContentShape(responseBody: unknown): { valid: true; content: string } | { valid: false; error: string } {
  if (!responseBody || typeof responseBody !== 'object') {
    return { valid: false, error: 'invalid_chat_response_shape' }
  }
  const choices = (responseBody as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) {
    return { valid: false, error: 'missing_chat_choices' }
  }
  const first = choices[0]
  if (!first || typeof first !== 'object') {
    return { valid: false, error: 'invalid_chat_choice_shape' }
  }
  const message = (first as { message?: unknown }).message
  if (!message || typeof message !== 'object') {
    return { valid: false, error: 'missing_chat_message' }
  }
  const content = (message as { content?: unknown }).content
  if (typeof content !== 'string') {
    return { valid: false, error: 'missing_chat_content' }
  }
  return { valid: true, content }
}

function validateSummaryContent(content: string): { valid: true } | { valid: false; error: string } {
  const trimmed = content.trim()
  if (trimmed.length === 0) {
    return { valid: false, error: 'summary_content_empty' }
  }
  if (trimmed.length > 2000) {
    return { valid: false, error: 'summary_content_too_long' }
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { valid: false, error: 'summary_json_shape_invalid' }
      }
    } catch {
      return { valid: false, error: 'summary_json_malformed' }
    }
  }
  return { valid: true }
}

export class DevEmbeddedModelProvider implements EmbeddedModelProvider {
  readonly providerId = 'dev'
  readonly providerName = 'Dev Embedded Model Mock'
  readonly availability = 'available' as ModelAvailability

  async probe(): Promise<ProbeResult> {
    return { available: true, embeddingAvailable: true, reasoningAvailable: false }
  }

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
    if (this._embeddingAvailability === 'error' || this._reasoningAvailability === 'error') {
      mode = 'degraded'
    } else if (this._embeddingAvailability === 'available' || this._reasoningAvailability === 'available') {
      mode = 'model_available'
    }
    return {
      mode,
      embeddingAvailability: this._embeddingAvailability,
      reasoningAvailability: this._reasoningAvailability,
      embeddingProviderId,
      reasoningProviderId,
    }
  }

  syncAvailabilityFromProbe(probeResult: ProbeResult): void {
    if (this.embeddingProvider) {
      this._embeddingAvailability = probeResult.embeddingAvailable ? 'available' : 'unavailable'
    }
    if (this.reasoningProvider) {
      this._reasoningAvailability = probeResult.reasoningAvailable ? 'available' : 'unavailable'
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

export const DEFAULT_LOCAL_MODEL_BASE_URL = 'http://localhost:11434/v1'
export const DEFAULT_EMBEDDING_MODEL_ID = 'qwen3-embedding:0.6b'
export const DEFAULT_REASONING_MODEL_ID = 'qwen3:1.7b'

export class OllamaOpenAICompatibleProvider implements EmbeddedModelProvider, ReasoningProvider {
  readonly providerId = 'ollama-openai-compatible'
  readonly providerName = 'Ollama Local Qwen'
  private _availability: ModelAvailability = 'unavailable'

  constructor(
    private readonly baseUrl: string = DEFAULT_LOCAL_MODEL_BASE_URL,
    private readonly apiKey: string = 'ollama',
    private readonly embeddingModelId: string = DEFAULT_EMBEDDING_MODEL_ID,
    private readonly reasoningModelId: string = DEFAULT_REASONING_MODEL_ID,
  ) {}

  get availability(): ModelAvailability {
    return this._availability
  }

  private computeVectorHash(data: Float32Array): string {
    let hash = 5381
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) + hash) + Math.floor(data[i] * 10000)
    }
    return `vh_${(hash >>> 0).toString(16)}`
  }

  private computeHash(text: string): string {
    let hash = 5381
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) + hash) + text.charCodeAt(i)
    }
    return (hash >>> 0).toString(16)
  }

  async probe(): Promise<ProbeResult> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) {
        this._availability = 'error'
        return { available: false, embeddingAvailable: false, reasoningAvailable: false, error: `HTTP ${response.status}` }
      }
      const json = await response.json()
      const modelIds: string[] = (json.data || []).map((m: { id: string }) => m.id)
      const embeddingAvailable = modelIds.includes(this.embeddingModelId)
      const reasoningAvailable = modelIds.includes(this.reasoningModelId)
      const available = embeddingAvailable || reasoningAvailable
      this._availability = available ? 'available' : 'unavailable'
      return { available, embeddingAvailable, reasoningAvailable, models: modelIds }
    } catch (err) {
      this._availability = 'unavailable'
      return { available: false, embeddingAvailable: false, reasoningAvailable: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async generateEmbedding(text: string, _options?: Record<string, unknown>): Promise<EmbeddingResult> {
    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.embeddingModelId, input: text }),
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok) {
        return { success: false, modelProvider: this.providerId, modelName: this.embeddingModelId, modelVersion: 'unknown', error: `HTTP ${response.status}` }
      }
      const json = await response.json()
      const embeddingArray = json.data?.[0]?.embedding
      if (!Array.isArray(embeddingArray)) {
        return { success: false, modelProvider: this.providerId, modelName: this.embeddingModelId, modelVersion: 'unknown', error: 'No embedding in response' }
      }
      const data = new Float32Array(embeddingArray)
      const dim = data.length
      return {
        success: true,
        data,
        dim,
        modelProvider: this.providerId,
        modelName: this.embeddingModelId,
        modelVersion: json.model || 'unknown',
      }
    } catch (err) {
      return { success: false, modelProvider: this.providerId, modelName: this.embeddingModelId, modelVersion: 'unknown', error: err instanceof Error ? err.message : String(err) }
    }
  }

  async generateSummary(text: string, _options?: Record<string, unknown>): Promise<SummaryResult> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.reasoningModelId,
          messages: [{ role: 'user', content: `请用1-2句话总结以下内容：\n\n${text}` }],
          stream: false,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(60000),
      })
      if (!response.ok) {
        return { success: false, modelProvider: this.providerId, modelName: this.reasoningModelId, modelVersion: 'unknown', error: `HTTP ${response.status}` }
      }
      const json = await response.json()
      const contentShape = validateChatContentShape(json)
      if (!contentShape.valid) {
        return { success: false, modelProvider: this.providerId, modelName: this.reasoningModelId, modelVersion: 'unknown', error: contentShape.error }
      }
      const sanitized = sanitizeReasoningContent(contentShape.content)
      if (!sanitized) {
        return { success: false, modelProvider: this.providerId, modelName: this.reasoningModelId, modelVersion: 'unknown', error: 'sanitized_content_empty' }
      }
      const summaryShape = validateSummaryContent(sanitized)
      if (!summaryShape.valid) {
        return { success: false, modelProvider: this.providerId, modelName: this.reasoningModelId, modelVersion: 'unknown', error: summaryShape.error }
      }
      return {
        success: true,
        summary: sanitized,
        modelProvider: this.providerId,
        modelName: this.reasoningModelId,
        modelVersion: json.model || 'unknown',
      }
    } catch (err) {
      return { success: false, modelProvider: this.providerId, modelName: this.reasoningModelId, modelVersion: 'unknown', error: err instanceof Error ? err.message : String(err) }
    }
  }

  async generateExplanation(text: string, _context?: string, _options?: Record<string, unknown>): Promise<ExplanationResult> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.reasoningModelId,
          messages: [{ role: 'user', content: `分析以下内容，给出简短解释、3个关键主题和意图分类：\n\n${text}` }],
          stream: false,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(60000),
      })
      if (!response.ok) {
        return { success: false, modelProvider: this.providerId, modelName: this.reasoningModelId, modelVersion: 'unknown', error: `HTTP ${response.status}` }
      }
      const json = await response.json()
      const contentShape = validateChatContentShape(json)
      if (!contentShape.valid) {
        return { success: false, modelProvider: this.providerId, modelName: this.reasoningModelId, modelVersion: 'unknown', error: contentShape.error }
      }
      const sanitized = sanitizeReasoningContent(contentShape.content)
      if (!sanitized) {
        return { success: false, modelProvider: this.providerId, modelName: this.reasoningModelId, modelVersion: 'unknown', error: 'sanitized_content_empty' }
      }
      return {
        success: true,
        explanation: sanitized.slice(0, 500),
        topics: [],
        intent: 'inform',
        modelProvider: this.providerId,
        modelName: this.reasoningModelId,
        modelVersion: json.model || 'unknown',
      }
    } catch (err) {
      return { success: false, modelProvider: this.providerId, modelName: this.reasoningModelId, modelVersion: 'unknown', error: err instanceof Error ? err.message : String(err) }
    }
  }
}

export function initOllamaProviders(
  options?: {
    baseUrl?: string
    apiKey?: string
    embeddingModelId?: string
    reasoningModelId?: string
    allowOutsideDev?: boolean
  },
): void {
  if (!options?.allowOutsideDev && typeof process !== 'undefined' && process.env?.NODE_ENV !== 'development' && process.env?.NODE_ENV !== 'test') {
    return
  }
  const provider = new OllamaOpenAICompatibleProvider(
    options?.baseUrl,
    options?.apiKey,
    options?.embeddingModelId,
    options?.reasoningModelId,
  )
  modelProviderRegistry.registerEmbeddingProvider(provider)
  modelProviderRegistry.registerReasoningProvider(provider)
}

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  w.initDevProviders = initDevProviders
  w.initOllamaProviders = initOllamaProviders
  w.resetProviders = resetProviders
  w.getCapabilityStatus = getCapabilityStatus
  w.modelProviderRegistry = modelProviderRegistry
}
