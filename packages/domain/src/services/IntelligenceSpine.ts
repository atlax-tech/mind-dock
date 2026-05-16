export type RecommendationStatus =
  | 'generated'
  | 'shown'
  | 'accepted'
  | 'rejected'
  | 'modified'
  | 'ignored'
  | 'superseded'

export type RecommendationSubjectType = 'dockItem' | 'entry' | 'document' | 'mindNode'

export type RecommendationCandidateType = 'tag' | 'project' | 'mindNode' | 'entry' | 'document' | 'dockItem'

export type BasicCandidateType = 'tag' | 'project' | 'mindNode'

export type BasicCandidateContextType = RecommendationSubjectType

export interface BasicCandidateContext {
  subjectType: BasicCandidateContextType
  subjectId: number | string
  rawText?: string | null
  title?: string | null
  content?: string | null
  tags?: string[]
  project?: string | null
  mindNodeId?: string | null
  mindNodeLabel?: string | null
  mindNodeType?: string | null
  documentId?: number | null
  metadata?: Record<string, unknown> | null
}

export interface BasicCandidateEvidence {
  source: 'capture' | 'document' | 'tag' | 'collection' | 'mindNode' | 'cluster'
  evidenceType:
    | 'assigned_tag'
    | 'text_match'
    | 'project_match'
    | 'collection_match'
    | 'document_node_match'
    | 'cluster_peer'
  contextType: BasicCandidateContextType
  contextId: number | string
  matchedField?: string
  matchedValue?: string
  relatedCount?: number
  confidenceContribution: number
}

export interface BasicCandidateReasonJson {
  source: 'basic_candidate_recall'
  reason: string
  candidateType: BasicCandidateType
  candidateId: string
  confidenceScore: number
  evidence: BasicCandidateEvidence[]
  context: {
    subjectType: BasicCandidateContextType
    subjectId: number | string
  }
}

export interface BasicCandidate {
  candidateType: BasicCandidateType
  candidateId: string
  confidenceScore: number
  evidence: BasicCandidateEvidence[]
  reasonJson: BasicCandidateReasonJson
}

export interface RecommendationSignalSummary {
  candidateType: BasicCandidateType
  candidateId: string
  acceptedCount?: number
  rejectedCount?: number
  ignoredCount?: number
  shownCount?: number
}

export interface RecommendationEvidenceSummary {
  evidenceCount: number
  sources: BasicCandidateEvidence['source'][]
  evidenceTypes: BasicCandidateEvidence['evidenceType'][]
  matchedValues: string[]
  strongestContribution: number
}

export interface RecommendationScoreBreakdown {
  recallScore: number
  evidenceBonus: number
  acceptedSignalBoost: number
  rejectedSignalPenalty: number
  ignoredSignalPenalty: number
  shownSignalPenalty: number
  signalAdjustment: number
  finalScore: number
}

export interface ScoredRecommendationCandidate {
  candidate: BasicCandidate
  rank: number
  score: number
  scoreReason: string
  scoreBreakdown: RecommendationScoreBreakdown
  evidenceSummary: RecommendationEvidenceSummary
}

export interface RecommendationEngineInput {
  candidates: BasicCandidate[]
  signalSummaries?: RecommendationSignalSummary[]
  topK?: number
}

export interface BasicCandidateRecallInput {
  userId: string
  context: BasicCandidateContext
  tags?: Array<{
    id: string
    userId: string
    name: string
  }>
  collections?: Array<{
    id: string
    userId: string
    name: string
    collectionType: string
  }>
  mindNodes?: Array<{
    id: string
    userId: string
    nodeType: string
    label: string
    documentId: number | null
    degreeScore?: number
    recentActivityScore?: number
    documentWeightScore?: number
    userPinScore?: number
    clusterCenterScore?: number
    metadata?: Record<string, unknown> | null
  }>
  documents?: Array<{
    id: number
    userId: string
    tags: string[]
    project: string | null
  }>
}

export interface Recommendation {
  id: string
  userId: string
  subjectType: RecommendationSubjectType
  subjectId: number | string
  recommendationType: string
  candidateType: RecommendationCandidateType
  candidateId: string
  confidenceScore: number
  reasonJson: string | null
  status: RecommendationStatus
  createdAt: Date
  updatedAt: Date
}

export interface RecommendationCreateInput {
  userId: string
  subjectType: RecommendationSubjectType
  subjectId: number | string
  recommendationType: string
  candidateType: RecommendationCandidateType
  candidateId: string
  confidenceScore: number
  reasonJson?: string | null
  status?: RecommendationStatus
}

export type RecommendationEventType =
  | 'recommendation_generated'
  | 'recommendation_shown'
  | 'recommendation_accepted'
  | 'recommendation_rejected'
  | 'recommendation_modified'
  | 'recommendation_ignored'
  | 'recommendation_superseded'

export interface RecommendationEvent {
  id: string
  recommendationId: string
  userId: string
  eventType: RecommendationEventType
  metadata: Record<string, unknown> | null
  createdAt: Date
}

export interface RecommendationEventInput {
  recommendationId: string
  userId: string
  eventType: RecommendationEventType
  metadata?: Record<string, unknown> | null
}

export type UserBehaviorEventType =
  | 'page_view'
  | 'search'
  | 'click'
  | 'scroll'
  | 'focus'
  | 'hover'
  | 'navigate'
  | 'edit'
  | 'create'
  | 'delete'
  | 'archive'
  | 'reopen'
  | 'mind_edge_created'
  | 'mind_edge_deleted'
  | RecommendationEventType

export type UserBehaviorSubjectType = 'dockItem' | 'entry' | 'document' | 'mindNode' | 'tag' | 'project' | 'recommendation' | 'widget' | 'tab'

export interface UserBehaviorEvent {
  id: string
  userId: string
  eventType: UserBehaviorEventType
  subjectType: UserBehaviorSubjectType
  subjectId: string | null
  metadata: Record<string, unknown> | null
  createdAt: Date
}

export interface UserBehaviorEventInput {
  userId: string
  eventType: UserBehaviorEventType
  subjectType: UserBehaviorSubjectType
  subjectId?: string | null
  metadata?: Record<string, unknown> | null
}

export function makeRecommendationId(userId: string, timestamp: number): string {
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${userId}_rec_${timestamp}_${suffix}`
}

export function makeRecommendationEventId(userId: string, recommendationId: string, timestamp: number): string {
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${userId}_recevt_${recommendationId}_${timestamp}_${suffix}`
}

export type RecommendationFeedbackType = 'accepted' | 'rejected' | 'modified' | 'ignored'

export const SUPPORTED_CANDIDATE_TYPES_FOR_APPLY: RecommendationCandidateType[] = ['tag', 'project', 'mindNode']

export function isSupportedCandidateTypeForApply(candidateType: RecommendationCandidateType): boolean {
  return SUPPORTED_CANDIDATE_TYPES_FOR_APPLY.includes(candidateType)
}

export function isRecommendationTerminalStatus(status: RecommendationStatus): boolean {
  return status === 'accepted' || status === 'rejected' || status === 'ignored' || status === 'superseded'
}

export function isRecommendationPendingStatus(status: RecommendationStatus): boolean {
  return status === 'generated' || status === 'shown'
}

export function makeRecommendationDedupeKey(
  subjectType: RecommendationSubjectType,
  subjectId: number | string,
  candidateType: RecommendationCandidateType,
  candidateId: string,
): string {
  return `${subjectType}:${subjectId}:${candidateType}:${candidateId}`
}

export interface RecommendationFeedbackInput {
  recommendationId: string
  userId: string
  feedbackType: RecommendationFeedbackType
  feedbackPayload?: Record<string, unknown> | null
}

export interface RecommendationFeedbackResult {
  recommendation: {
    id: string
    status: RecommendationStatus
    updatedAt: Date
  }
  feedbackEvent: {
    id: string
    eventType: RecommendationEventType
    recommendationId: string
  }
}

export interface RecommendationShownInput {
  recommendationId: string
  userId: string
}

export interface RecommendationShownResult {
  recommendation: {
    id: string
    status: RecommendationStatus
    updatedAt: Date
  }
  shownEvent: {
    id: string
    eventType: RecommendationEventType
    recommendationId: string
  }
}

export function feedbackTypeToStatus(feedbackType: RecommendationFeedbackType): RecommendationStatus {
  return feedbackType
}

export function feedbackTypeToEventType(feedbackType: RecommendationFeedbackType): RecommendationEventType {
  switch (feedbackType) {
    case 'accepted':
      return 'recommendation_accepted'
    case 'rejected':
      return 'recommendation_rejected'
    case 'modified':
      return 'recommendation_modified'
    case 'ignored':
      return 'recommendation_ignored'
  }
}

export function makeUserBehaviorEventId(userId: string, eventType: UserBehaviorEventType, timestamp: number): string {
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${userId}_ube_${eventType}_${timestamp}_${suffix}`
}

export function generateBasicCandidates(input: BasicCandidateRecallInput): BasicCandidate[] {
  const contextText = buildContextText(input.context)
  const contextTags = new Set((input.context.tags ?? []).map(normalizeRecallText).filter(Boolean))
  const contextProject = normalizeRecallText(input.context.project ?? '')
  const contextClusterId = readClusterId(input.context.metadata)
  const candidates = new Map<string, Omit<BasicCandidate, 'reasonJson'>>()

  for (const tag of (input.tags ?? []).filter((item) => item.userId === input.userId)) {
    const tagName = normalizeRecallText(tag.name)
    if (!tagName) continue

    const relatedCount = (input.documents ?? []).filter((doc) =>
      doc.userId === input.userId &&
      doc.tags.some((name) => normalizeRecallText(name) === tagName),
    ).length

    if (contextTags.has(tagName)) {
      addBasicCandidateEvidence(candidates, 'tag', tag.id, 0.86, {
        source: input.context.subjectType === 'dockItem' ? 'capture' : 'document',
        evidenceType: 'assigned_tag',
        contextType: input.context.subjectType,
        contextId: input.context.subjectId,
        matchedField: 'tags',
        matchedValue: tag.name,
        relatedCount,
        confidenceContribution: 0.86,
      })
    }

    if (contextText.includes(tagName)) {
      addBasicCandidateEvidence(candidates, 'tag', tag.id, 0.72, {
        source: 'tag',
        evidenceType: 'text_match',
        contextType: input.context.subjectType,
        contextId: input.context.subjectId,
        matchedField: 'text',
        matchedValue: tag.name,
        relatedCount,
        confidenceContribution: 0.72,
      })
    }
  }

  for (const collection of (input.collections ?? []).filter((item) => item.userId === input.userId)) {
    const collectionName = normalizeRecallText(collection.name)
    if (!collectionName) continue

    const relatedCount = (input.documents ?? []).filter((doc) =>
      doc.userId === input.userId &&
      normalizeRecallText(doc.project ?? '') === collectionName,
    ).length

    if (contextProject && contextProject === collectionName) {
      addBasicCandidateEvidence(candidates, 'project', collection.id, 0.86, {
        source: 'collection',
        evidenceType: 'project_match',
        contextType: input.context.subjectType,
        contextId: input.context.subjectId,
        matchedField: 'project',
        matchedValue: collection.name,
        relatedCount,
        confidenceContribution: 0.86,
      })
    }

    if (contextText.includes(collectionName)) {
      addBasicCandidateEvidence(candidates, 'project', collection.id, collection.collectionType === 'project' ? 0.74 : 0.68, {
        source: 'collection',
        evidenceType: 'collection_match',
        contextType: input.context.subjectType,
        contextId: input.context.subjectId,
        matchedField: 'text',
        matchedValue: collection.name,
        relatedCount,
        confidenceContribution: collection.collectionType === 'project' ? 0.74 : 0.68,
      })
    }
  }

  for (const node of (input.mindNodes ?? []).filter((item) => item.userId === input.userId)) {
    const nodeLabel = normalizeRecallText(node.label)
    if (!nodeLabel || node.id === input.context.mindNodeId) continue

    if (input.context.documentId !== null && input.context.documentId !== undefined && node.documentId === input.context.documentId) {
      addBasicCandidateEvidence(candidates, 'mindNode', node.id, 0.82, {
        source: 'mindNode',
        evidenceType: 'document_node_match',
        contextType: input.context.subjectType,
        contextId: input.context.subjectId,
        matchedField: 'documentId',
        matchedValue: String(node.documentId),
        confidenceContribution: 0.82,
      })
    }

    if (contextText.includes(nodeLabel)) {
      addBasicCandidateEvidence(candidates, 'mindNode', node.id, 0.7, {
        source: 'mindNode',
        evidenceType: 'text_match',
        contextType: input.context.subjectType,
        contextId: input.context.subjectId,
        matchedField: 'text',
        matchedValue: node.label,
        confidenceContribution: 0.7,
      })
    }

    const nodeClusterId = readClusterId(node.metadata)
    if (contextClusterId && nodeClusterId && contextClusterId === nodeClusterId) {
      const clusterScore = Math.min(Math.max(node.clusterCenterScore ?? 0, 0), 1)
      addBasicCandidateEvidence(candidates, 'mindNode', node.id, 0.62 + clusterScore * 0.08, {
        source: 'cluster',
        evidenceType: 'cluster_peer',
        contextType: input.context.subjectType,
        contextId: input.context.subjectId,
        matchedField: 'clusterId',
        matchedValue: contextClusterId,
        confidenceContribution: 0.62 + clusterScore * 0.08,
      })
    }
  }

  return Array.from(candidates.values()).map((candidate) => {
    const confidenceScore = clampConfidence(candidate.confidenceScore)
    return {
      ...candidate,
      confidenceScore,
      reasonJson: {
        source: 'basic_candidate_recall',
        reason: 'minimal local candidate recall evidence',
        candidateType: candidate.candidateType,
        candidateId: candidate.candidateId,
        confidenceScore,
        evidence: candidate.evidence,
        context: {
          subjectType: input.context.subjectType,
          subjectId: input.context.subjectId,
        },
      },
    }
  })
}

const DEFAULT_RECOMMENDATION_TOP_K = 5

export function scoreBasicCandidatesForRecommendation(input: RecommendationEngineInput): ScoredRecommendationCandidate[] {
  const topK = normalizeTopK(input.topK)
  if (topK === 0 || input.candidates.length === 0) return []

  const signalByCandidate = new Map(
    (input.signalSummaries ?? []).map((summary) => [
      makeCandidateKey(summary.candidateType, summary.candidateId),
      summary,
    ]),
  )

  return dedupeBasicCandidates(input.candidates)
    .map((candidate) => scoreBasicCandidate(candidate, signalByCandidate))
    .sort((left, right) =>
      right.score - left.score ||
      left.candidate.candidateType.localeCompare(right.candidate.candidateType) ||
      left.candidate.candidateId.localeCompare(right.candidate.candidateId),
    )
    .slice(0, topK)
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    }))
}

function scoreBasicCandidate(
  candidate: BasicCandidate,
  signalByCandidate: Map<string, RecommendationSignalSummary>,
): ScoredRecommendationCandidate {
  const signals = signalByCandidate.get(makeCandidateKey(candidate.candidateType, candidate.candidateId))
  const recallScore = clampRecommendationScore(candidate.confidenceScore)
  const evidenceBonus = roundScore(Math.min(0.06, Math.max(0, candidate.evidence.length - 1) * 0.02))
  const acceptedSignalBoost = roundScore(Math.min(0.15, (signals?.acceptedCount ?? 0) * 0.05))
  const rejectedSignalPenalty = roundScore(-Math.min(0.15, (signals?.rejectedCount ?? 0) * 0.06))
  const ignoredSignalPenalty = roundScore(-Math.min(0.09, (signals?.ignoredCount ?? 0) * 0.03))
  const shownSignalPenalty = roundScore(-Math.min(0.06, (signals?.shownCount ?? 0) * 0.01))
  const signalAdjustment = roundScore(
    acceptedSignalBoost + rejectedSignalPenalty + ignoredSignalPenalty + shownSignalPenalty,
  )
  const finalScore = clampRecommendationScore(recallScore + evidenceBonus + signalAdjustment)
  const evidenceSummary = summarizeCandidateEvidence(candidate.evidence)
  const scoreBreakdown: RecommendationScoreBreakdown = {
    recallScore,
    evidenceBonus,
    acceptedSignalBoost,
    rejectedSignalPenalty,
    ignoredSignalPenalty,
    shownSignalPenalty,
    signalAdjustment,
    finalScore,
  }

  return {
    candidate,
    rank: 0,
    score: finalScore,
    scoreReason: buildScoreReason(scoreBreakdown, evidenceSummary),
    scoreBreakdown,
    evidenceSummary,
  }
}

function dedupeBasicCandidates(candidates: BasicCandidate[]): BasicCandidate[] {
  const deduped = new Map<string, BasicCandidate>()

  for (const candidate of candidates) {
    const key = makeCandidateKey(candidate.candidateType, candidate.candidateId)
    const existing = deduped.get(key)
    if (!existing) {
      deduped.set(key, candidate)
      continue
    }

    const mergedEvidence = mergeCandidateEvidence(existing.evidence, candidate.evidence)
    const strongestCandidate = candidate.confidenceScore > existing.confidenceScore ? candidate : existing
    const confidenceScore = clampRecommendationScore(Math.max(existing.confidenceScore, candidate.confidenceScore))

    deduped.set(key, {
      ...strongestCandidate,
      confidenceScore,
      evidence: mergedEvidence,
      reasonJson: {
        ...strongestCandidate.reasonJson,
        confidenceScore,
        evidence: mergedEvidence,
      },
    })
  }

  return Array.from(deduped.values())
}

function mergeCandidateEvidence(
  existing: BasicCandidateEvidence[],
  incoming: BasicCandidateEvidence[],
): BasicCandidateEvidence[] {
  const seen = new Set<string>()
  const merged: BasicCandidateEvidence[] = []

  for (const evidence of [...existing, ...incoming]) {
    const key = [
      evidence.source,
      evidence.evidenceType,
      evidence.contextType,
      String(evidence.contextId),
      evidence.matchedField ?? '',
      evidence.matchedValue ?? '',
    ].join(':')
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(evidence)
  }

  return merged
}

function summarizeCandidateEvidence(evidence: BasicCandidateEvidence[]): RecommendationEvidenceSummary {
  const matchedValues = evidence
    .map((item) => item.matchedValue)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

  return {
    evidenceCount: evidence.length,
    sources: uniqueSorted(evidence.map((item) => item.source)),
    evidenceTypes: uniqueSorted(evidence.map((item) => item.evidenceType)),
    matchedValues: uniqueSorted(matchedValues).slice(0, 5),
    strongestContribution: roundScore(Math.max(0, ...evidence.map((item) => item.confidenceContribution))),
  }
}

function buildScoreReason(
  breakdown: RecommendationScoreBreakdown,
  evidenceSummary: RecommendationEvidenceSummary,
): string {
  const signalParts = [
    breakdown.acceptedSignalBoost > 0 ? `accepted +${breakdown.acceptedSignalBoost}` : null,
    breakdown.rejectedSignalPenalty < 0 ? `rejected ${breakdown.rejectedSignalPenalty}` : null,
    breakdown.ignoredSignalPenalty < 0 ? `ignored ${breakdown.ignoredSignalPenalty}` : null,
    breakdown.shownSignalPenalty < 0 ? `shown ${breakdown.shownSignalPenalty}` : null,
  ].filter((part): part is string => part !== null)

  return [
    `recall ${breakdown.recallScore}`,
    `evidence ${evidenceSummary.evidenceCount} item(s) +${breakdown.evidenceBonus}`,
    signalParts.length > 0 ? `signals ${signalParts.join(', ')}` : 'signals neutral',
    `final ${breakdown.finalScore}`,
  ].join('; ')
}

function normalizeTopK(topK?: number): number {
  if (topK === undefined) return DEFAULT_RECOMMENDATION_TOP_K
  if (!Number.isFinite(topK)) return DEFAULT_RECOMMENDATION_TOP_K
  return Math.max(0, Math.floor(topK))
}

function makeCandidateKey(candidateType: BasicCandidateType, candidateId: string): string {
  return `${candidateType}:${candidateId}`
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values)).sort()
}

function addBasicCandidateEvidence(
  candidates: Map<string, Omit<BasicCandidate, 'reasonJson'>>,
  candidateType: BasicCandidateType,
  candidateId: string,
  confidenceScore: number,
  evidence: BasicCandidateEvidence,
): void {
  const key = `${candidateType}:${candidateId}`
  const existing = candidates.get(key)
  if (!existing) {
    candidates.set(key, {
      candidateType,
      candidateId,
      confidenceScore,
      evidence: [evidence],
    })
    return
  }

  existing.confidenceScore = Math.max(existing.confidenceScore, confidenceScore)
  existing.evidence.push(evidence)
}

function buildContextText(context: BasicCandidateContext): string {
  return [
    context.rawText,
    context.title,
    context.content,
    context.project,
    context.mindNodeLabel,
    ...(context.tags ?? []),
  ]
    .map((value) => normalizeRecallText(value ?? ''))
    .filter(Boolean)
    .join(' ')
}

function normalizeRecallText(value: string): string {
  return value.trim().toLowerCase()
}

function readClusterId(metadata?: Record<string, unknown> | null): string | null {
  const value = metadata?.clusterId
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function clampRecommendationScore(score: number): number {
  return Math.max(0, Math.min(1, roundScore(score)))
}

function roundScore(score: number): number {
  return Number(score.toFixed(4))
}

function clampConfidence(score: number): number {
  return Math.max(0, Math.min(1, Number(score.toFixed(2))))
}
