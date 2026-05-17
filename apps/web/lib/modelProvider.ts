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
    console.warn('[Dev:MOCK] probe() ← 返回硬编码结果 (非真实模型!)')
    return { available: true, embeddingAvailable: true, reasoningAvailable: false }
  }

  async generateEmbedding(text: string, _options?: Record<string, unknown>): Promise<EmbeddingResult> {
    console.warn('[Dev:MOCK] generateEmbedding() ← 使用确定性伪向量 (非真实模型!)')
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
    console.warn('[Dev:MOCK] generateSummary() ← 返回截断伪摘要 (非真实模型!)')
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
    console.warn('[Dev:MOCK] generateExplanation() ← 词频伪造解释 (非真实模型!)')
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
  console.warn('[Dev:MOCK] initDevProviders() ⚠️ 注册 Mock Provider! 所有模型调用将返回伪数据!')
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
    console.log('[Ollama:REAL] probe() → 正在探测本地模型端点...', { baseUrl: this.baseUrl, embeddingModelId: this.embeddingModelId, reasoningModelId: this.reasoningModelId })
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) {
        console.warn('[Ollama:REAL] probe() ← 端点返回 HTTP', response.status)
        this._availability = 'error'
        return { available: false, embeddingAvailable: false, reasoningAvailable: false, error: `HTTP ${response.status}` }
      }
      const json = await response.json()
      const modelIds: string[] = (json.data || []).map((m: { id: string }) => m.id)
      const embeddingAvailable = modelIds.includes(this.embeddingModelId)
      const reasoningAvailable = modelIds.includes(this.reasoningModelId)
      const available = embeddingAvailable || reasoningAvailable
      this._availability = available ? 'available' : 'unavailable'
      console.log('[Ollama:REAL] probe() ← 模型列表:', modelIds, { embeddingAvailable, reasoningAvailable, available })
      return { available, embeddingAvailable, reasoningAvailable, models: modelIds }
    } catch (err) {
      console.error('[Ollama:REAL] probe() ← 连接失败:', err instanceof Error ? err.message : String(err))
      this._availability = 'unavailable'
      return { available: false, embeddingAvailable: false, reasoningAvailable: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async generateEmbedding(text: string, _options?: Record<string, unknown>): Promise<EmbeddingResult> {
    console.log('[Ollama:REAL] generateEmbedding() → 正在调用 Embedding API...', { textLen: text.length, model: this.embeddingModelId })
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
        console.warn('[Ollama:REAL] generateEmbedding() ← HTTP', response.status)
        return { success: false, modelProvider: this.providerId, modelName: this.embeddingModelId, modelVersion: 'unknown', error: `HTTP ${response.status}` }
      }
      const json = await response.json()
      const embeddingArray = json.data?.[0]?.embedding
      if (!Array.isArray(embeddingArray)) {
        console.warn('[Ollama:REAL] generateEmbedding() ← 响应中无 embedding')
        return { success: false, modelProvider: this.providerId, modelName: this.embeddingModelId, modelVersion: 'unknown', error: 'No embedding in response' }
      }
      const data = new Float32Array(embeddingArray)
      const dim = data.length
      console.log('[Ollama:REAL] generateEmbedding() ← 成功获取向量, dim:', dim)
      return {
        success: true,
        data,
        dim,
        modelProvider: this.providerId,
        modelName: this.embeddingModelId,
        modelVersion: json.model || 'unknown',
      }
    } catch (err) {
      console.error('[Ollama:REAL] generateEmbedding() ← 失败:', err instanceof Error ? err.message : String(err))
      return { success: false, modelProvider: this.providerId, modelName: this.embeddingModelId, modelVersion: 'unknown', error: err instanceof Error ? err.message : String(err) }
    }
  }

  async generateSummary(text: string, _options?: Record<string, unknown>): Promise<SummaryResult> {
    console.log('[Ollama:REAL] generateSummary() → 正在调用 Reasoning API...', { textLen: text.length, model: this.reasoningModelId })
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
        console.warn('[Ollama:REAL] generateSummary() ← HTTP', response.status)
        return { success: false, modelProvider: this.providerId, modelName: this.reasoningModelId, modelVersion: 'unknown', error: `HTTP ${response.status}` }
      }
      const json = await response.json()
      const contentShape = validateChatContentShape(json)
      if (!contentShape.valid) {
        console.warn('[Ollama:REAL] generateSummary() ← 响应格式异常:', contentShape.error)
        return { success: false, modelProvider: this.providerId, modelName: this.reasoningModelId, modelVersion: 'unknown', error: contentShape.error }
      }
      const sanitized = sanitizeReasoningContent(contentShape.content)
      if (!sanitized) {
        console.warn('[Ollama:REAL] generateSummary() ← 清理后内容为空')
        return { success: false, modelProvider: this.providerId, modelName: this.reasoningModelId, modelVersion: 'unknown', error: 'sanitized_content_empty' }
      }
      const summaryShape = validateSummaryContent(sanitized)
      if (!summaryShape.valid) {
        console.warn('[Ollama:REAL] generateSummary() ← 摘要验证失败:', summaryShape.error)
        return { success: false, modelProvider: this.providerId, modelName: this.reasoningModelId, modelVersion: 'unknown', error: summaryShape.error }
      }
      console.log('[Ollama:REAL] generateSummary() ← 成功, len:', sanitized.length)
      return {
        success: true,
        summary: sanitized,
        modelProvider: this.providerId,
        modelName: this.reasoningModelId,
        modelVersion: json.model || 'unknown',
      }
    } catch (err) {
      console.error('[Ollama:REAL] generateSummary() ← 失败:', err instanceof Error ? err.message : String(err))
      return { success: false, modelProvider: this.providerId, modelName: this.reasoningModelId, modelVersion: 'unknown', error: err instanceof Error ? err.message : String(err) }
    }
  }

  async generateExplanation(text: string, _context?: string, _options?: Record<string, unknown>): Promise<ExplanationResult> {
    console.log('[Ollama:REAL] generateExplanation() → 正在调用 Reasoning API...', { textLen: text.length, model: this.reasoningModelId })
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
        console.warn('[Ollama:REAL] generateExplanation() ← HTTP', response.status)
        return { success: false, modelProvider: this.providerId, modelName: this.reasoningModelId, modelVersion: 'unknown', error: `HTTP ${response.status}` }
      }
      const json = await response.json()
      const contentShape = validateChatContentShape(json)
      if (!contentShape.valid) {
        console.warn('[Ollama:REAL] generateExplanation() ← 响应格式异常:', contentShape.error)
        return { success: false, modelProvider: this.providerId, modelName: this.reasoningModelId, modelVersion: 'unknown', error: contentShape.error }
      }
      const sanitized = sanitizeReasoningContent(contentShape.content)
      if (!sanitized) {
        console.warn('[Ollama:REAL] generateExplanation() ← 清理后内容为空')
        return { success: false, modelProvider: this.providerId, modelName: this.reasoningModelId, modelVersion: 'unknown', error: 'sanitized_content_empty' }
      }
      console.log('[Ollama:REAL] generateExplanation() ← 成功, len:', sanitized.length)
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
      console.error('[Ollama:REAL] generateExplanation() ← 失败:', err instanceof Error ? err.message : String(err))
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
  console.log('[Ollama:REAL] initOllamaProviders() ✅ 已注册真实 Ollama Provider', {
    providerId: provider.providerId,
    providerName: provider.providerName,
    baseUrl: options?.baseUrl || DEFAULT_LOCAL_MODEL_BASE_URL,
    embeddingModelId: options?.embeddingModelId || DEFAULT_EMBEDDING_MODEL_ID,
    reasoningModelId: options?.reasoningModelId || DEFAULT_REASONING_MODEL_ID,
  })
}

if (typeof window !== 'undefined') {
  const w = window as any
  w.__verifyProviders = () => {
    const cap = getCapabilityStatus()
    console.group('🔍 Provider 验证 (Provider Verification)')
    console.log('Embedding Provider ID:', cap.embeddingProviderId || '(无)')
    console.log('Reasoning Provider ID:', cap.reasoningProviderId || '(无)')
    console.log('Embedding 可用性:', cap.embeddingAvailability)
    console.log('Reasoning 可用性:', cap.reasoningAvailability)
    console.log('运行模式:', cap.mode)
    const embProvider = modelProviderRegistry.getEmbeddingProvider()
    if (embProvider) {
      console.log('当前 Embedding Provider 名称:', embProvider.providerName)
      if (embProvider.providerId === 'dev' || embProvider.providerId.startsWith('mock')) {
        console.warn('⚠️ 警告: 当前使用 Mock/Dev Provider，所有模型输出均为伪数据!')
      } else {
        console.log('✅ 当前使用真实 Provider:', embProvider.providerId)
      }
    } else {
      console.warn('⚠️ 未注册任何 Embedding Provider!')
    }
    const reasProvider = modelProviderRegistry.getReasoningProvider()
    if (reasProvider) {
      console.log('当前 Reasoning Provider 名称:', reasProvider.providerName)
      if (reasProvider.providerId === 'dev' || reasProvider.providerId.startsWith('mock')) {
        console.warn('⚠️ 警告: 当前使用 Mock/Dev Provider，所有模型输出均为伪数据!')
      } else {
        console.log('✅ 当前使用真实 Provider:', reasProvider.providerId)
      }
    } else {
      console.warn('⚠️ 未注册任何 Reasoning Provider!')
    }
    console.groupEnd()
    return { cap, embProvider, reasProvider }
  }
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
