export type CapabilityMode = 'core' | 'model_available' | 'degraded'

export type ModelAvailability = 'available' | 'unavailable' | 'initializing' | 'error'

export interface EmbeddingResult {
  success: boolean
  data?: Float32Array
  dim?: number
  modelProvider: string
  modelName: string
  modelVersion: string
  error?: string
}

export interface SummaryResult {
  success: boolean
  summary?: string
  modelProvider: string
  modelName: string
  modelVersion: string
  error?: string
}

export interface ExplanationResult {
  success: boolean
  explanation?: string
  topics?: string[]
  intent?: string
  modelProvider: string
  modelName: string
  modelVersion: string
  error?: string
}

export interface EmbeddedModelProvider {
  readonly providerId: string
  readonly providerName: string
  readonly availability: ModelAvailability
  generateEmbedding(text: string, options?: Record<string, unknown>): Promise<EmbeddingResult>
  generateSummary(text: string, options?: Record<string, unknown>): Promise<SummaryResult>
}

export interface ReasoningProvider {
  readonly providerId: string
  readonly providerName: string
  readonly availability: ModelAvailability
  generateExplanation(text: string, context?: string, options?: Record<string, unknown>): Promise<ExplanationResult>
}

export interface CapabilityStatus {
  mode: CapabilityMode
  embeddingAvailability: ModelAvailability
  reasoningAvailability: ModelAvailability
  embeddingProviderId: string | null
  reasoningProviderId: string | null
}
