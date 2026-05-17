export interface IntelligenceAuditFields {
  source: string
  reason: string
  evidence: string
  confidence: number
  safetyLevel: string
  createdAt: string
  updatedAt: string
}

export interface LocalTextFeatureSnapshot extends IntelligenceAuditFields {
  id: string
  userId: string
  workspaceId: string
  targetType: string
  targetId: string
  contentHash: string
  language: string
  keywords: string[]
  entities: string[]
  compactText: string
  lengthMetrics: Record<string, number>
  structureHints: string[]
  stale: boolean
  staleKey: 0 | 1
  expiredAt: string | null
}

export interface SemanticFeatureSnapshot extends IntelligenceAuditFields {
  id: string
  userId: string
  workspaceId: string
  targetType: string
  targetId: string
  contentHash: string
  modelProvider: string
  modelName: string
  modelVersion: string
  embeddingDim: number
  embeddingRef: string
  semanticSummary: string
  intent: string
  topics: string[]
  stale: boolean
  staleKey: 0 | 1
  expiredAt: string | null
}

export interface PreferenceMemory extends IntelligenceAuditFields {
  id: string
  userId: string
  workspaceId: string
  candidateType: string
  candidateId: string
  shownCount: number
  acceptedCount: number
  rejectedCount: number
  ignoredCount: number
  modifiedCount: number
  positiveWeight: number
  negativeWeight: number
  lastFeedbackAt: string | null
}

export interface HealthSignal extends IntelligenceAuditFields {
  id: string
  userId: string
  workspaceId: string
  signalType: string
  targetType: string
  targetId: string
  severity: string
  status: string
  detectedAt: string
  resolvedAt: string | null
}

export interface GrowthSignal extends IntelligenceAuditFields {
  id: string
  userId: string
  workspaceId: string
  signalType: string
  targetType: string
  targetId: string
  opportunityType: string
  status: string
  detectedAt: string
  dismissedAt: string | null
}

export interface MaintenanceAction extends IntelligenceAuditFields {
  id: string
  userId: string
  workspaceId: string
  actionType: string
  targetType: string
  targetId: string
  status: string
  reversible: boolean
  proposedPatch: Record<string, unknown> | null
  sourceSignalId: string | null
  executedAt: string | null
  revertedAt: string | null
}

export interface ReviewSnapshot extends IntelligenceAuditFields {
  id: string
  userId: string
  workspaceId: string
  scope: string
  reviewDate: string
  healthSummary: Record<string, unknown> | null
  growthSummary: Record<string, unknown> | null
  recommendationSummary: Record<string, unknown> | null
  maintenanceSummary: Record<string, unknown> | null
  generatedAt: string
}

export interface DailyBriefSnapshot extends IntelligenceAuditFields {
  id: string
  userId: string
  workspaceId: string
  briefDate: string
  scope: string
  yesterdayProgress: Record<string, unknown> | null
  todayRecommendations: Record<string, unknown> | null
  knowledgeHealth: Record<string, unknown> | null
  quickNoteStatus: Record<string, unknown> | null
  draftStatus: Record<string, unknown> | null
  mindSummary: Record<string, unknown> | null
  generatedAt: string
}

export interface SearchIndexRecord extends IntelligenceAuditFields {
  id: string
  userId: string
  workspaceId: string
  targetType: string
  targetId: string
  title: string
  excerpt: string
  keywordTokens: string[]
  semanticRef: string | null
  contentHash: string
  stale: boolean
  staleKey: 0 | 1
  expiredAt: string | null
}

export interface EmbeddingVector {
  id: string
  userId: string
  workspaceId: string
  targetType: string
  targetId: string
  contentHash: string
  providerId: string
  modelId: string
  modelVersion: string
  dimension: number
  vectorHash: string
  vectorBlob: ArrayBuffer
  createdAt: string
  updatedAt: string
}

export interface AlgorithmAuditLog {
  id: string
  userId: string
  workspaceId: string
  providerId: string
  modelId: string
  modelVersion: string
  capability: string
  durationMs: number
  success: boolean
  fallbackUsed: boolean
  inputHash: string
  outputHash: string
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
}

export interface ModelSmokeTestRun {
  id: string
  userId: string
  workspaceId: string
  probeAvailable: boolean
  embeddingAvailable: boolean
  reasoningAvailable: boolean
  embeddingDimension: number | null
  embeddingVectorHash: string | null
  reasoningOutputHash: string | null
  auditLogIds: string[]
  status: 'pass' | 'fail' | 'blocked'
  errorMessage: string | null
  createdAt: string
}

export interface ModelRuntimeStatus {
  id: string
  userId: string
  workspaceId: string
  providerId: string
  providerName: string
  mode: 'core' | 'model_available' | 'degraded' | 'unavailable'
  embeddingStatus: 'available' | 'unavailable' | 'error'
  reasoningStatus: 'available' | 'unavailable' | 'error'
  embeddingModelId: string
  reasoningModelId: string
  lastProbeAt: string
  lastProbeSuccess: boolean
  lastSuccessfulProbeAt: string | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  createdAt: string
  updatedAt: string
}

export type JobType = 'recompute_local_features' | 'recompute_semantic_features' | 'refresh_recommendations' | 'embedding_generate' | 'summary_generate' | 'model_smoke_test'
export type JobStatus = 'pending' | 'running' | 'complete' | 'failed' | 'skipped' | 'degraded' | 'pending_model'

export interface BackgroundJob {
  id: string
  userId: string
  workspaceId: string
  jobType: JobType
  targetType: string
  targetId: string
  status: JobStatus
  contentHash: string
  priority: number
  attempts: number
  maxAttempts: number
  lastError: string | null
  createdAt: string
  updatedAt: string
  nextRunAt: string | null
  completedAt: string | null
}
