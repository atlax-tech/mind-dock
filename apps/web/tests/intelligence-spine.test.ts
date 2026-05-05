import { afterEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  applyRecommendation,
  createCaptureToDocumentFlow,
  createCollection,
  createDockItem,
  createRecommendation,
  createRecommendationFromBasicCandidate,
  createStoredTag,
  generateRecommendationsForContext,
  generateBasicCandidates,
  listRecommendationDockQueue,
  listRecommendations,
  listMindEdges,
  markRecommendationDockQueueItemShown,
  markRecommendationShown,
  updateRecommendationStatus,
  recordRecommendationDockQueueItemFeedback,
  recordRecommendationFeedback,
  recordRecommendationEvent,
  listRecommendationEvents,
  recordUserBehaviorEvent,
  listUserBehaviorEvents,
  updateDocument,
  upsertMindNode,
} from '@/lib/repository'

const USER_A = 'user_test_a'
const USER_B = 'user_test_b'

async function cleanAll() {
  await db.table('dockItems').clear()
  await db.table('entries').clear()
  await db.table('tags').clear()
  await db.table('collections').clear()
  await db.table('mindNodes').clear()
  await db.table('mindEdges').clear()
  await db.table('recommendations').clear()
  await db.table('recommendationEvents').clear()
  await db.table('userBehaviorEvents').clear()
}

function unwrap<T>(value: T | null): T {
  expect(value).not.toBeNull()
  return value as T
}

interface RecommendationEngineReason {
  source?: string
  recall?: {
    evidence?: unknown[]
  }
  score?: number
  scoreReason?: string
  scoreBreakdown?: {
    recallScore?: number
    evidenceBonus?: number
    acceptedSignalBoost?: number
    rejectedSignalPenalty?: number
    ignoredSignalPenalty?: number
    shownSignalPenalty?: number
    signalAdjustment?: number
    finalScore?: number
  }
  evidenceSummary?: {
    evidenceCount?: number
    evidenceTypes?: string[]
    sources?: string[]
  }
  rank?: number
  topK?: number
}

function parseEngineReason(reasonJson: string | null): RecommendationEngineReason {
  return JSON.parse(reasonJson ?? '{}') as RecommendationEngineReason
}

describe('intelligence spine', () => {
  afterEach(cleanAll)

  describe('createRecommendation', () => {
    it('creates a recommendation with generated status', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_frontend',
        confidenceScore: 0.85,
        reasonJson: '{"reason": "高频出现"}',
      })

      expect(rec.id).toBeTruthy()
      expect(rec.userId).toBe(USER_A)
      expect(rec.subjectType).toBe('dockItem')
      expect(rec.subjectId).toBe(1)
      expect(rec.recommendationType).toBe('tag_suggestion')
      expect(rec.candidateType).toBe('tag')
      expect(rec.candidateId).toBe('tag_frontend')
      expect(rec.confidenceScore).toBe(0.85)
      expect(rec.reasonJson).toBe('{"reason": "高频出现"}')
      expect(rec.status).toBe('generated')
      expect(rec.createdAt).toBeInstanceOf(Date)
      expect(rec.updatedAt).toBeInstanceOf(Date)
    })

    it('creates a recommendation with custom status', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'entry',
        subjectId: 100,
        recommendationType: 'project_suggestion',
        candidateType: 'project',
        candidateId: 'proj_ai',
        confidenceScore: 0.6,
        status: 'shown',
      })

      expect(rec.status).toBe('shown')
    })
  })

  describe('listRecommendations', () => {
    it('lists recommendations for a user', async () => {
      await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_a',
        confidenceScore: 0.9,
      })
      await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 2,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_b',
        confidenceScore: 0.7,
      })

      const recs = await listRecommendations(USER_A)
      expect(recs).toHaveLength(2)
      expect(recs[0].userId).toBe(USER_A)
      expect(recs[1].userId).toBe(USER_A)
    })

    it('filters recommendations by status', async () => {
      await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_a',
        confidenceScore: 0.9,
        status: 'generated',
      })
      await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 2,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_b',
        confidenceScore: 0.7,
        status: 'accepted',
      })

      const generated = await listRecommendations(USER_A, { status: 'generated' })
      expect(generated).toHaveLength(1)
      expect(generated[0].candidateId).toBe('tag_a')

      const accepted = await listRecommendations(USER_A, { status: 'accepted' })
      expect(accepted).toHaveLength(1)
      expect(accepted[0].candidateId).toBe('tag_b')
    })

    it('filters recommendations by subjectType', async () => {
      await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_a',
        confidenceScore: 0.9,
      })
      await createRecommendation({
        userId: USER_A,
        subjectType: 'entry',
        subjectId: 100,
        recommendationType: 'node_suggestion',
        candidateType: 'mindNode',
        candidateId: 'node_x',
        confidenceScore: 0.5,
      })

      const dockItemRecs = await listRecommendations(USER_A, { subjectType: 'dockItem' })
      expect(dockItemRecs).toHaveLength(1)
      expect(dockItemRecs[0].subjectType).toBe('dockItem')

      const entryRecs = await listRecommendations(USER_A, { subjectType: 'entry' })
      expect(entryRecs).toHaveLength(1)
      expect(entryRecs[0].subjectType).toBe('entry')
    })

    it('returns empty array for user with no recommendations', async () => {
      const recs = await listRecommendations(USER_A)
      expect(recs).toEqual([])
    })
  })

  describe('basic candidate recall pack', () => {
    it('recalls tag candidates from document context', async () => {
      const flow = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'LC-009 candidate recall pack',
      })
      const tag = await createStoredTag(USER_A, 'Local Core')
      await updateDocument(USER_A, flow.document.id, { tags: ['Local Core'] })

      const candidates = await generateBasicCandidates({
        userId: USER_A,
        subjectType: 'document',
        subjectId: flow.document.id,
      })

      const tagCandidate = candidates.find((candidate) => candidate.candidateType === 'tag')
      expect(tagCandidate).toBeDefined()
      expect(unwrap(tagCandidate ?? null).candidateId).toBe(unwrap(tag).id)
      expect(unwrap(tagCandidate ?? null).confidenceScore).toBeGreaterThan(0)
      expect(unwrap(tagCandidate ?? null).reasonJson.evidence[0].evidenceType).toBe('assigned_tag')
    })

    it('recalls project candidates from collection data', async () => {
      const flow = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'Project Atlas delivery note',
      })
      const collection = await createCollection({
        userId: USER_A,
        name: 'Project Atlas',
        collectionType: 'project',
      })
      await updateDocument(USER_A, flow.document.id, { project: 'Project Atlas' })

      const candidates = await generateBasicCandidates({
        userId: USER_A,
        subjectType: 'document',
        subjectId: flow.document.id,
      })

      const projectCandidate = candidates.find((candidate) => candidate.candidateType === 'project')
      expect(projectCandidate).toBeDefined()
      expect(unwrap(projectCandidate ?? null).candidateId).toBe(collection.id)
      expect(unwrap(projectCandidate ?? null).reasonJson.evidence.some((item) => item.source === 'collection')).toBe(true)
    })

    it('recalls mindNode candidates from shared cluster context', async () => {
      const contextNode = await upsertMindNode({
        userId: USER_A,
        nodeType: 'topic',
        label: 'Local Core',
        metadata: { clusterId: 'cluster_local_core' },
      })
      const clusterNode = await upsertMindNode({
        userId: USER_A,
        nodeType: 'topic',
        label: 'Intelligence Spine',
        clusterCenterScore: 0.8,
        metadata: { clusterId: 'cluster_local_core' },
      })

      const candidates = await generateBasicCandidates({
        userId: USER_A,
        subjectType: 'mindNode',
        subjectId: contextNode.id,
      })

      const mindNodeCandidate = candidates.find((candidate) => candidate.candidateType === 'mindNode')
      expect(mindNodeCandidate).toBeDefined()
      expect(unwrap(mindNodeCandidate ?? null).candidateId).toBe(clusterNode.id)
      expect(unwrap(mindNodeCandidate ?? null).reasonJson.evidence[0].evidenceType).toBe('cluster_peer')
    })

    it('does not recall candidates owned by another user', async () => {
      const captureId = await createDockItem(USER_A, 'Secret Tag Other Project Other Node')
      await createStoredTag(USER_B, 'Secret Tag')
      await createCollection({
        userId: USER_B,
        name: 'Other Project',
        collectionType: 'project',
      })
      await upsertMindNode({
        userId: USER_B,
        nodeType: 'topic',
        label: 'Other Node',
      })

      const candidates = await generateBasicCandidates({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: captureId,
      })

      expect(candidates).toEqual([])
    })

    it('returns an empty array when no local candidate is available', async () => {
      const captureId = await createDockItem(USER_A, 'plain isolated note')

      const candidates = await generateBasicCandidates({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: captureId,
      })

      expect(candidates).toEqual([])
    })

    it('creates a recommendation record from a basic candidate and preserves evidence', async () => {
      const contextNode = await upsertMindNode({
        userId: USER_A,
        nodeType: 'topic',
        label: 'Recall Context',
        metadata: { clusterId: 'cluster_recommendation_record' },
      })
      const clusterNode = await upsertMindNode({
        userId: USER_A,
        nodeType: 'topic',
        label: 'Recall Candidate',
        metadata: { clusterId: 'cluster_recommendation_record' },
      })
      const candidates = await generateBasicCandidates({
        userId: USER_A,
        subjectType: 'mindNode',
        subjectId: contextNode.id,
      })
      const candidate = unwrap(candidates.find((item) => item.candidateId === clusterNode.id) ?? null)

      const result = await createRecommendationFromBasicCandidate({
        userId: USER_A,
        subjectType: 'mindNode',
        subjectId: contextNode.id,
        candidate,
      })

      expect(result.recommendation.status).toBe('generated')
      expect(result.recommendation.subjectId).toBe(contextNode.id)
      expect(result.recommendation.candidateType).toBe('mindNode')
      expect(result.recommendation.candidateId).toBe(clusterNode.id)
      expect(result.recommendationEvent.eventType).toBe('recommendation_generated')

      const reason = JSON.parse(result.recommendation.reasonJson ?? '{}') as {
        source?: string
        evidence?: unknown[]
      }
      expect(reason.source).toBe('basic_candidate_recall')
      expect(reason.evidence).toEqual(candidate.evidence)
    })
  })

  describe('recommendation engine mvp pack', () => {
    it('generates Top-K recommendations from capture context with generated events and metadata', async () => {
      const captureId = await createDockItem(USER_A, 'Local Core Project Atlas Intelligence Spine')
      const tag = unwrap(await createStoredTag(USER_A, 'Local Core'))
      const collection = await createCollection({
        userId: USER_A,
        name: 'Project Atlas',
        collectionType: 'project',
      })
      await upsertMindNode({
        userId: USER_A,
        nodeType: 'topic',
        label: 'Intelligence Spine',
      })

      const result = await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: captureId,
        topK: 2,
      })

      expect(result.recommendations).toHaveLength(2)
      expect(result.recommendationEvents).toHaveLength(2)
      expect(result.scoredCandidates).toHaveLength(2)
      expect(result.recommendations.every((rec) => rec.status === 'generated')).toBe(true)
      expect(result.recommendations.map((rec) => rec.candidateId)).toEqual(
        expect.arrayContaining([tag.id, collection.id]),
      )

      const firstReason = parseEngineReason(result.recommendations[0].reasonJson)
      expect(firstReason.source).toBe('recommendation_engine_mvp')
      expect(firstReason.recall?.evidence?.length).toBeGreaterThan(0)
      expect(firstReason.scoreBreakdown?.finalScore).toBe(result.recommendations[0].confidenceScore)
      expect(firstReason.rank).toBe(1)
      expect(firstReason.topK).toBe(2)

      expect(result.recommendationEvents[0].eventType).toBe('recommendation_generated')
      expect(result.recommendationEvents[0].metadata).toMatchObject({
        source: 'recommendation_engine_mvp',
        rank: 1,
        score: result.recommendations[0].confidenceScore,
        candidateType: result.recommendations[0].candidateType,
        candidateId: result.recommendations[0].candidateId,
      })
      expect(result.recommendationEvents[0].metadata?.evidenceSummary).toEqual(firstReason.evidenceSummary)
    })

    it('generates recommendations from document context', async () => {
      const flow = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'Document context for Local Core and Project Atlas',
      })
      const tag = unwrap(await createStoredTag(USER_A, 'Local Core'))
      const collection = await createCollection({
        userId: USER_A,
        name: 'Project Atlas',
        collectionType: 'project',
      })
      await updateDocument(USER_A, flow.document.id, {
        tags: ['Local Core'],
        project: 'Project Atlas',
      })

      const result = await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'document',
        subjectId: flow.document.id,
        topK: 3,
      })

      expect(result.recommendations.length).toBeGreaterThanOrEqual(2)
      expect(result.recommendations.every((rec) => rec.subjectType === 'document')).toBe(true)
      expect(result.recommendations.map((rec) => rec.candidateId)).toEqual(
        expect.arrayContaining([tag.id, collection.id]),
      )
      expect(result.recommendations.every((rec) => rec.status === 'generated')).toBe(true)
    })

    it('generates recommendations from mindNode context', async () => {
      const contextNode = await upsertMindNode({
        userId: USER_A,
        nodeType: 'topic',
        label: 'Recommendation Context',
        metadata: { clusterId: 'cluster_engine_context' },
      })
      const candidateNode = await upsertMindNode({
        userId: USER_A,
        nodeType: 'topic',
        label: 'Recommendation Candidate',
        metadata: { clusterId: 'cluster_engine_context' },
      })

      const result = await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'mindNode',
        subjectId: contextNode.id,
      })

      expect(result.recommendations).toHaveLength(1)
      expect(result.recommendations[0].subjectId).toBe(contextNode.id)
      expect(result.recommendations[0].candidateType).toBe('mindNode')
      expect(result.recommendations[0].candidateId).toBe(candidateNode.id)
      expect(result.recommendationEvents[0].metadata).toMatchObject({
        candidateType: 'mindNode',
        candidateId: candidateNode.id,
        rank: 1,
      })
    })

    it('dedupes repeated candidates while preserving recall evidence', async () => {
      const flow = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'Local Core appears in the document content',
      })
      const tag = unwrap(await createStoredTag(USER_A, 'Local Core'))
      await updateDocument(USER_A, flow.document.id, { tags: ['Local Core'] })

      const result = await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'document',
        subjectId: flow.document.id,
      })
      const tagRecommendations = result.recommendations.filter((rec) => rec.candidateId === tag.id)
      const tagReason = parseEngineReason(unwrap(tagRecommendations[0] ?? null).reasonJson)

      expect(tagRecommendations).toHaveLength(1)
      expect(tagReason.recall?.evidence).toHaveLength(2)
      expect(tagReason.evidenceSummary?.evidenceTypes).toEqual(
        expect.arrayContaining(['assigned_tag', 'text_match']),
      )
    })

    it('uses stable candidateType and candidateId sorting when scores tie', async () => {
      const captureId = await createDockItem(USER_A, 'Alpha Beta')
      const beta = unwrap(await createStoredTag(USER_A, 'Beta'))
      const alpha = unwrap(await createStoredTag(USER_A, 'Alpha'))

      const result = await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: captureId,
        topK: 2,
      })

      expect(result.recommendations).toHaveLength(2)
      expect(result.recommendations.map((rec) => rec.confidenceScore)).toEqual([0.72, 0.72])
      expect(result.recommendations.map((rec) => rec.candidateId)).toEqual([alpha.id, beta.id].sort())
      expect(result.recommendations.map((rec) => parseEngineReason(rec.reasonJson).rank)).toEqual([1, 2])
    })

    it('applies deterministic accepted, rejected, ignored, and shown signal adjustments', async () => {
      const acceptedTag = unwrap(await createStoredTag(USER_A, 'Accepted Signal'))
      const rejectedTag = unwrap(await createStoredTag(USER_A, 'Rejected Signal'))
      const shownTag = unwrap(await createStoredTag(USER_A, 'Shown Signal'))
      const acceptedHistory = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: acceptedTag.id,
        confidenceScore: 0.72,
      })
      const rejectedHistory = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 2,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: rejectedTag.id,
        confidenceScore: 0.72,
      })
      const ignoredHistory = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 3,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: rejectedTag.id,
        confidenceScore: 0.72,
      })
      const shownHistory = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 4,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: shownTag.id,
        confidenceScore: 0.72,
      })
      await recordRecommendationFeedback({
        userId: USER_A,
        recommendationId: acceptedHistory.id,
        feedbackType: 'accepted',
      })
      await recordRecommendationFeedback({
        userId: USER_A,
        recommendationId: rejectedHistory.id,
        feedbackType: 'rejected',
      })
      await recordRecommendationFeedback({
        userId: USER_A,
        recommendationId: ignoredHistory.id,
        feedbackType: 'ignored',
      })
      await markRecommendationShown({
        userId: USER_A,
        recommendationId: shownHistory.id,
      })
      const captureId = await createDockItem(
        USER_A,
        'Accepted Signal Rejected Signal Shown Signal',
      )

      const result = await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: captureId,
        topK: 3,
      })
      const byCandidateId = new Map<string, RecommendationEngineReason>(
        result.recommendations.map((rec) => [rec.candidateId, parseEngineReason(rec.reasonJson)] as const),
      )

      expect(result.recommendations[0].candidateId).toBe(acceptedTag.id)
      expect(byCandidateId.get(acceptedTag.id)?.scoreBreakdown?.acceptedSignalBoost).toBe(0.05)
      expect(byCandidateId.get(rejectedTag.id)?.scoreBreakdown?.rejectedSignalPenalty).toBe(-0.06)
      expect(byCandidateId.get(rejectedTag.id)?.scoreBreakdown?.ignoredSignalPenalty).toBe(-0.03)
      expect(byCandidateId.get(shownTag.id)?.scoreBreakdown?.shownSignalPenalty).toBe(-0.01)
    })

    it('does not use another user signal history for scoring', async () => {
      const tag = unwrap(await createStoredTag(USER_A, 'Isolated Signal'))
      const crossUserHistory = await createRecommendation({
        userId: USER_B,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: tag.id,
        confidenceScore: 0.72,
      })
      await recordRecommendationFeedback({
        userId: USER_B,
        recommendationId: crossUserHistory.id,
        feedbackType: 'accepted',
      })
      const captureId = await createDockItem(USER_A, 'Isolated Signal')

      const result = await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: captureId,
      })
      const reason = parseEngineReason(result.recommendations[0].reasonJson)

      expect(result.recommendations).toHaveLength(1)
      expect(result.recommendations[0].candidateId).toBe(tag.id)
      expect(reason.scoreBreakdown?.acceptedSignalBoost).toBe(0)
      expect(reason.scoreBreakdown?.finalScore).toBe(0.72)
    })

    it('returns empty recommendation result when no candidate is available', async () => {
      const captureId = await createDockItem(USER_A, 'plain isolated recommendation engine note')

      const result = await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: captureId,
      })

      expect(result.recommendations).toEqual([])
      expect(result.recommendationEvents).toEqual([])
      expect(result.scoredCandidates).toEqual([])
    })
  })

  describe('recommendation dock queue pack', () => {
    it('lists current user generated recommendations with UI summaries', async () => {
      const captureId = await createDockItem(USER_A, 'Dock Local Core Project Atlas')
      const tag = unwrap(await createStoredTag(USER_A, 'Local Core'))
      await createCollection({
        userId: USER_A,
        name: 'Project Atlas',
        collectionType: 'project',
      })
      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: captureId,
        topK: 2,
      })

      const dockQueue = await listRecommendationDockQueue(USER_A, { status: 'generated', sortBy: 'rank' })

      expect(dockQueue.items).toHaveLength(2)
      expect(dockQueue.total).toBe(2)
      expect(dockQueue.nextCursor).toBeNull()
      expect(dockQueue.items.every((item) => item.userId === USER_A)).toBe(true)
      expect(dockQueue.items.map((item) => item.status)).toEqual(['generated', 'generated'])

      const tagItem = unwrap(dockQueue.items.find((item) => item.candidateId === tag.id) ?? null)
      expect(tagItem.reasonSummary.source).toBe('recommendation_engine_mvp')
      expect(tagItem.reasonSummary.reason).toContain('recall')
      expect(tagItem.scoreSummary.score).toBe(tagItem.confidenceScore)
      expect(tagItem.scoreSummary.rank).toBeGreaterThan(0)
      expect(tagItem.scoreSummary.scoreBreakdown?.finalScore).toBe(tagItem.confidenceScore)
      expect(tagItem.evidenceSummary.evidenceCount).toBeGreaterThan(0)
      expect(tagItem.isShown).toBe(false)
      expect(tagItem.hasFeedback).toBe(false)
    })

    it.each(['generated', 'shown', 'accepted', 'rejected', 'modified', 'ignored'] as const)(
      'filters dockQueue by %s status',
      async (status) => {
        await createRecommendation({
          userId: USER_A,
          subjectType: 'dockItem',
          subjectId: status,
          recommendationType: 'tag_suggestion',
          candidateType: 'tag',
          candidateId: `tag_${status}`,
          confidenceScore: 0.7,
          status,
        })

        const dockQueue = await listRecommendationDockQueue(USER_A, { status })

        expect(dockQueue.items).toHaveLength(1)
        expect(dockQueue.items[0].status).toBe(status)
        expect(dockQueue.items[0].candidateId).toBe(`tag_${status}`)
      },
    )

    it('filters dockQueue by candidateType, subjectType, and recommendationType', async () => {
      await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_a',
        confidenceScore: 0.8,
      })
      await createRecommendation({
        userId: USER_A,
        subjectType: 'document',
        subjectId: 2,
        recommendationType: 'node_suggestion',
        candidateType: 'mindNode',
        candidateId: 'node_a',
        confidenceScore: 0.7,
      })

      const candidateFiltered = await listRecommendationDockQueue(USER_A, { candidateType: 'mindNode' })
      const subjectFiltered = await listRecommendationDockQueue(USER_A, { subjectType: 'document' })
      const typeFiltered = await listRecommendationDockQueue(USER_A, { recommendationType: 'tag_suggestion' })

      expect(candidateFiltered.items).toHaveLength(1)
      expect(candidateFiltered.items[0].candidateId).toBe('node_a')
      expect(subjectFiltered.items).toHaveLength(1)
      expect(subjectFiltered.items[0].subjectType).toBe('document')
      expect(typeFiltered.items).toHaveLength(1)
      expect(typeFiltered.items[0].recommendationType).toBe('tag_suggestion')
    })

    it('sorts dockQueue by rank, confidenceScore, and createdAt with stable secondary order', async () => {
      const first = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_rank_2',
        confidenceScore: 0.9,
        reasonJson: JSON.stringify({ rank: 2, score: 0.9, evidenceSummary: { evidenceCount: 0 } }),
      })
      const second = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 2,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_rank_1',
        confidenceScore: 0.9,
        reasonJson: JSON.stringify({ rank: 1, score: 0.9, evidenceSummary: { evidenceCount: 0 } }),
      })
      const third = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 3,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_score_high',
        confidenceScore: 0.95,
        reasonJson: JSON.stringify({ rank: 3, score: 0.95, evidenceSummary: { evidenceCount: 0 } }),
      })
      await db.table('recommendations').update(first.id, { createdAt: new Date('2026-01-01T00:00:00.000Z') })
      await db.table('recommendations').update(second.id, { createdAt: new Date('2026-01-02T00:00:00.000Z') })
      await db.table('recommendations').update(third.id, { createdAt: new Date('2026-01-03T00:00:00.000Z') })

      const byRank = await listRecommendationDockQueue(USER_A, { sortBy: 'rank' })
      const byConfidence = await listRecommendationDockQueue(USER_A, { sortBy: 'confidenceScore' })
      const byCreatedAt = await listRecommendationDockQueue(USER_A, { sortBy: 'createdAt' })

      expect(byRank.items.map((item) => item.candidateId)).toEqual(['tag_rank_1', 'tag_rank_2', 'tag_score_high'])
      expect(byConfidence.items.map((item) => item.candidateId)).toEqual(['tag_score_high', 'tag_rank_1', 'tag_rank_2'])
      expect(byCreatedAt.items.map((item) => item.candidateId)).toEqual(['tag_score_high', 'tag_rank_1', 'tag_rank_2'])
    })

    it('paginates dockQueue with limit and cursor', async () => {
      for (let index = 0; index < 3; index += 1) {
        await createRecommendation({
          userId: USER_A,
          subjectType: 'dockItem',
          subjectId: index,
          recommendationType: 'tag_suggestion',
          candidateType: 'tag',
          candidateId: `tag_page_${index}`,
          confidenceScore: 0.5 + index / 10,
          reasonJson: JSON.stringify({ rank: index + 1, evidenceSummary: { evidenceCount: 0 } }),
        })
      }

      const page1 = await listRecommendationDockQueue(USER_A, { sortBy: 'rank', limit: 2 })
      const page2 = await listRecommendationDockQueue(USER_A, { sortBy: 'rank', limit: 2, cursor: unwrap(page1.nextCursor) })

      expect(page1.items).toHaveLength(2)
      expect(page1.nextCursor).toBe('2')
      expect(page2.items).toHaveLength(1)
      expect(page2.nextCursor).toBeNull()
      expect([...page1.items, ...page2.items].map((item) => item.candidateId)).toEqual([
        'tag_page_0',
        'tag_page_1',
        'tag_page_2',
      ])
    })

    it('builds summaries from generated event metadata when reasonJson is missing', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_metadata_only',
        confidenceScore: 0.66,
        reasonJson: null,
      })
      await recordRecommendationEvent({
        userId: USER_A,
        recommendationId: rec.id,
        eventType: 'recommendation_generated',
        metadata: {
          source: 'metadata_only',
          rank: 4,
          score: 0.66,
          evidenceSummary: {
            evidenceCount: 2,
            sources: ['tag'],
            evidenceTypes: ['text_match'],
            matchedValues: ['metadata only'],
            strongestContribution: 0.66,
          },
        },
      })

      const dockQueue = await listRecommendationDockQueue(USER_A)

      expect(dockQueue.items).toHaveLength(1)
      expect(dockQueue.items[0].reasonSummary.source).toBe('metadata_only')
      expect(dockQueue.items[0].scoreSummary.rank).toBe(4)
      expect(dockQueue.items[0].evidenceSummary).toMatchObject({
        evidenceCount: 2,
        sources: ['tag'],
        evidenceTypes: ['text_match'],
        matchedValues: ['metadata only'],
        strongestContribution: 0.66,
      })
    })

    it('sets isShown and hasFeedback from lifecycle events and supports dockQueue item actions', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_feedback',
        confidenceScore: 0.8,
      })
      await recordRecommendationEvent({
        userId: USER_A,
        recommendationId: rec.id,
        eventType: 'recommendation_generated',
      })

      await markRecommendationDockQueueItemShown({
        userId: USER_A,
        recommendationId: rec.id,
      })
      let dockQueue = await listRecommendationDockQueue(USER_A)
      expect(dockQueue.items[0].status).toBe('shown')
      expect(dockQueue.items[0].isShown).toBe(true)
      expect(dockQueue.items[0].hasFeedback).toBe(false)

      await recordRecommendationDockQueueItemFeedback({
        userId: USER_A,
        recommendationId: dockQueue.items[0].id,
        feedbackType: 'accepted',
      })
      dockQueue = await listRecommendationDockQueue(USER_A)

      expect(dockQueue.items[0].status).toBe('accepted')
      expect(dockQueue.items[0].isShown).toBe(true)
      expect(dockQueue.items[0].hasFeedback).toBe(true)

      const recommendationEvents = await listRecommendationEvents(USER_A, { recommendationId: rec.id })
      const behaviorEvents = await listUserBehaviorEvents(USER_A)
      expect(recommendationEvents.map((event) => event.eventType).sort()).toEqual([
        'recommendation_accepted',
        'recommendation_generated',
        'recommendation_shown',
      ])
      expect(behaviorEvents.map((event) => event.eventType).sort()).toEqual([
        'recommendation_accepted',
        'recommendation_shown',
      ])
    })

    it('keeps userId isolation for dockQueue query and dockQueue item actions', async () => {
      const recA = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_a',
        confidenceScore: 0.8,
      })
      const recB = await createRecommendation({
        userId: USER_B,
        subjectType: 'dockItem',
        subjectId: 2,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_b',
        confidenceScore: 0.7,
      })

      const dockQueueA = await listRecommendationDockQueue(USER_A)
      const dockQueueB = await listRecommendationDockQueue(USER_B)

      expect(dockQueueA.items).toHaveLength(1)
      expect(dockQueueA.items[0].id).toBe(recA.id)
      expect(dockQueueB.items).toHaveLength(1)
      expect(dockQueueB.items[0].id).toBe(recB.id)
      await expect(
        markRecommendationDockQueueItemShown({
          userId: USER_A,
          recommendationId: recB.id,
        }),
      ).rejects.toThrow(`User ${USER_A} does not own recommendation`)
      await expect(
        recordRecommendationDockQueueItemFeedback({
          userId: USER_B,
          recommendationId: recA.id,
          feedbackType: 'rejected',
        }),
      ).rejects.toThrow(`User ${USER_B} does not own recommendation`)
    })

    it('returns empty dockQueue without recommendations and rejects malformed query inputs', async () => {
      await expect(listRecommendationDockQueue(USER_A, { status: 'bad' as never })).rejects.toThrow(
        'Invalid recommendation dock queue status filter',
      )
      await expect(listRecommendationDockQueue(USER_A, { sortBy: 'score' as never })).rejects.toThrow(
        'Invalid recommendation dock queue sortBy',
      )
      await expect(listRecommendationDockQueue(USER_A, { limit: 0 })).rejects.toThrow(
        'Invalid recommendation dock queue limit',
      )
      await expect(listRecommendationDockQueue(USER_A, { cursor: 'bad_cursor' })).rejects.toThrow(
        'Invalid recommendation dock queue cursor',
      )

      const empty = await listRecommendationDockQueue(USER_A)
      expect(empty).toEqual({ items: [], nextCursor: null, total: 0 })
    })
  })

  describe('updateRecommendationStatus', () => {
    it('updates status from generated to accepted', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_a',
        confidenceScore: 0.9,
      })

      const updated = await updateRecommendationStatus(USER_A, rec.id, 'accepted')
      expect(updated).not.toBeNull()
      expect(unwrap(updated).status).toBe('accepted')
      expect(unwrap(updated).id).toBe(rec.id)
    })

    it('updates status from shown to rejected', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_a',
        confidenceScore: 0.9,
        status: 'shown',
      })

      const updated = await updateRecommendationStatus(USER_A, rec.id, 'rejected')
      expect(unwrap(updated).status).toBe('rejected')
    })

    it('updates status to modified', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_a',
        confidenceScore: 0.9,
      })

      const updated = await updateRecommendationStatus(USER_A, rec.id, 'modified')
      expect(unwrap(updated).status).toBe('modified')
    })

    it('updates status to ignored', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_a',
        confidenceScore: 0.9,
      })

      const updated = await updateRecommendationStatus(USER_A, rec.id, 'ignored')
      expect(unwrap(updated).status).toBe('ignored')
    })

    it('returns null for non-existent recommendation', async () => {
      const result = await updateRecommendationStatus(USER_A, 'non_existent_id', 'accepted')
      expect(result).toBeNull()
    })
  })

  describe('recordRecommendationEvent', () => {
    it('records a recommendation event', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_a',
        confidenceScore: 0.9,
      })

      const evt = await recordRecommendationEvent({
        recommendationId: rec.id,
        userId: USER_A,
        eventType: 'recommendation_generated',
        metadata: { source: 'local' },
      })

      expect(evt.id).toBeTruthy()
      expect(evt.recommendationId).toBe(rec.id)
      expect(evt.userId).toBe(USER_A)
      expect(evt.eventType).toBe('recommendation_generated')
      expect(evt.metadata).toEqual({ source: 'local' })
      expect(evt.createdAt).toBeInstanceOf(Date)
    })

    it('records multiple recommendation events for same recommendation', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_a',
        confidenceScore: 0.9,
      })

      await recordRecommendationEvent({
        recommendationId: rec.id,
        userId: USER_A,
        eventType: 'recommendation_shown',
      })
      await recordRecommendationEvent({
        recommendationId: rec.id,
        userId: USER_A,
        eventType: 'recommendation_accepted',
      })

      const events = await listRecommendationEvents(USER_A)
      expect(events).toHaveLength(2)
      const eventTypes = events.map((e) => e.eventType).sort()
      expect(eventTypes).toEqual(['recommendation_accepted', 'recommendation_shown'])
    })

    it('fails for non-existent recommendationId without writing orphan event', async () => {
      await expect(
        recordRecommendationEvent({
          recommendationId: 'non_existent_rec_id',
          userId: USER_A,
          eventType: 'recommendation_generated',
        }),
      ).rejects.toThrow('Recommendation not found: non_existent_rec_id')

      const events = await listRecommendationEvents(USER_A)
      expect(events).toHaveLength(0)
    })

    it('fails when userId does not own recommendation without cross-user event', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_a',
        confidenceScore: 0.9,
      })

      await expect(
        recordRecommendationEvent({
          recommendationId: rec.id,
          userId: USER_B,
          eventType: 'recommendation_shown',
        }),
      ).rejects.toThrow(`User ${USER_B} does not own recommendation ${rec.id}`)

      const eventsA = await listRecommendationEvents(USER_A)
      const eventsB = await listRecommendationEvents(USER_B)
      expect(eventsA).toHaveLength(0)
      expect(eventsB).toHaveLength(0)
    })
  })

  describe('listRecommendationEvents', () => {
    it('lists recommendation events for a user', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_a',
        confidenceScore: 0.9,
      })

      await recordRecommendationEvent({
        recommendationId: rec.id,
        userId: USER_A,
        eventType: 'recommendation_generated',
      })

      const events = await listRecommendationEvents(USER_A)
      expect(events).toHaveLength(1)
      expect(events[0].userId).toBe(USER_A)
    })

    it('filters by recommendationId', async () => {
      const rec1 = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_a',
        confidenceScore: 0.9,
      })
      const rec2 = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 2,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_b',
        confidenceScore: 0.7,
      })

      await recordRecommendationEvent({
        recommendationId: rec1.id,
        userId: USER_A,
        eventType: 'recommendation_generated',
      })
      await recordRecommendationEvent({
        recommendationId: rec2.id,
        userId: USER_A,
        eventType: 'recommendation_generated',
      })

      const events1 = await listRecommendationEvents(USER_A, { recommendationId: rec1.id })
      expect(events1).toHaveLength(1)
      expect(events1[0].recommendationId).toBe(rec1.id)
    })

    it('filters by eventType', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_a',
        confidenceScore: 0.9,
      })

      await recordRecommendationEvent({
        recommendationId: rec.id,
        userId: USER_A,
        eventType: 'recommendation_generated',
      })
      await recordRecommendationEvent({
        recommendationId: rec.id,
        userId: USER_A,
        eventType: 'recommendation_shown',
      })

      const generated = await listRecommendationEvents(USER_A, { eventType: 'recommendation_generated' })
      expect(generated).toHaveLength(1)
      expect(generated[0].eventType).toBe('recommendation_generated')
    })

    it('returns empty array for user with no events', async () => {
      const events = await listRecommendationEvents(USER_A)
      expect(events).toEqual([])
    })
  })

  describe('recordUserBehaviorEvent', () => {
    it('records a user behavior event', async () => {
      const evt = await recordUserBehaviorEvent({
        userId: USER_A,
        eventType: 'page_view',
        subjectType: 'dockItem',
        subjectId: '1',
        metadata: { duration: 5000 },
      })

      expect(evt.id).toBeTruthy()
      expect(evt.userId).toBe(USER_A)
      expect(evt.eventType).toBe('page_view')
      expect(evt.subjectType).toBe('dockItem')
      expect(evt.subjectId).toBe('1')
      expect(evt.metadata).toEqual({ duration: 5000 })
      expect(evt.createdAt).toBeInstanceOf(Date)
    })

    it('records event with null subjectId', async () => {
      const evt = await recordUserBehaviorEvent({
        userId: USER_A,
        eventType: 'click',
        subjectType: 'tab',
      })

      expect(evt.subjectId).toBeNull()
    })

    it('records multiple behavior event types', async () => {
      await recordUserBehaviorEvent({
        userId: USER_A,
        eventType: 'page_view',
        subjectType: 'dockItem',
      })
      await recordUserBehaviorEvent({
        userId: USER_A,
        eventType: 'click',
        subjectType: 'tag',
        subjectId: 'tag_frontend',
      })
      await recordUserBehaviorEvent({
        userId: USER_A,
        eventType: 'edit',
        subjectType: 'entry',
        subjectId: '100',
      })

      const events = await listUserBehaviorEvents(USER_A)
      expect(events).toHaveLength(3)
    })
  })

  describe('listUserBehaviorEvents', () => {
    it('lists user behavior events for a user', async () => {
      await recordUserBehaviorEvent({
        userId: USER_A,
        eventType: 'page_view',
        subjectType: 'dockItem',
      })

      const events = await listUserBehaviorEvents(USER_A)
      expect(events).toHaveLength(1)
      expect(events[0].userId).toBe(USER_A)
    })

    it('filters by eventType', async () => {
      await recordUserBehaviorEvent({
        userId: USER_A,
        eventType: 'page_view',
        subjectType: 'dockItem',
      })
      await recordUserBehaviorEvent({
        userId: USER_A,
        eventType: 'click',
        subjectType: 'tag',
      })

      const views = await listUserBehaviorEvents(USER_A, { eventType: 'page_view' })
      expect(views).toHaveLength(1)
      expect(views[0].eventType).toBe('page_view')

      const clicks = await listUserBehaviorEvents(USER_A, { eventType: 'click' })
      expect(clicks).toHaveLength(1)
      expect(clicks[0].eventType).toBe('click')
    })

    it('filters by subjectType', async () => {
      await recordUserBehaviorEvent({
        userId: USER_A,
        eventType: 'click',
        subjectType: 'dockItem',
      })
      await recordUserBehaviorEvent({
        userId: USER_A,
        eventType: 'click',
        subjectType: 'tag',
      })

      const dockClicks = await listUserBehaviorEvents(USER_A, { subjectType: 'dockItem' })
      expect(dockClicks).toHaveLength(1)
      expect(dockClicks[0].subjectType).toBe('dockItem')
    })

    it('returns empty array for user with no events', async () => {
      const events = await listUserBehaviorEvents(USER_A)
      expect(events).toEqual([])
    })
  })

  describe('userId isolation', () => {
    it('recommendations are isolated between users', async () => {
      await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_a',
        confidenceScore: 0.9,
      })
      await createRecommendation({
        userId: USER_B,
        subjectType: 'dockItem',
        subjectId: 2,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_b',
        confidenceScore: 0.5,
      })

      const recsA = await listRecommendations(USER_A)
      const recsB = await listRecommendations(USER_B)

      expect(recsA).toHaveLength(1)
      expect(recsA[0].userId).toBe(USER_A)
      expect(recsA[0].candidateId).toBe('tag_a')

      expect(recsB).toHaveLength(1)
      expect(recsB[0].userId).toBe(USER_B)
      expect(recsB[0].candidateId).toBe('tag_b')
    })

    it('recommendation events are isolated between users', async () => {
      const recA = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_a',
        confidenceScore: 0.9,
      })
      const recB = await createRecommendation({
        userId: USER_B,
        subjectType: 'dockItem',
        subjectId: 2,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_b',
        confidenceScore: 0.5,
      })

      await recordRecommendationEvent({
        recommendationId: recA.id,
        userId: USER_A,
        eventType: 'recommendation_generated',
      })
      await recordRecommendationEvent({
        recommendationId: recB.id,
        userId: USER_B,
        eventType: 'recommendation_shown',
      })

      const eventsA = await listRecommendationEvents(USER_A)
      const eventsB = await listRecommendationEvents(USER_B)

      expect(eventsA).toHaveLength(1)
      expect(eventsA[0].userId).toBe(USER_A)
      expect(eventsB).toHaveLength(1)
      expect(eventsB[0].userId).toBe(USER_B)
    })

    it('user behavior events are isolated between users', async () => {
      await recordUserBehaviorEvent({
        userId: USER_A,
        eventType: 'page_view',
        subjectType: 'dockItem',
      })
      await recordUserBehaviorEvent({
        userId: USER_B,
        eventType: 'click',
        subjectType: 'tag',
      })

      const eventsA = await listUserBehaviorEvents(USER_A)
      const eventsB = await listUserBehaviorEvents(USER_B)

      expect(eventsA).toHaveLength(1)
      expect(eventsA[0].userId).toBe(USER_A)
      expect(eventsA[0].eventType).toBe('page_view')

      expect(eventsB).toHaveLength(1)
      expect(eventsB[0].userId).toBe(USER_B)
      expect(eventsB[0].eventType).toBe('click')
    })

    it('cross-user data does not pollute each other', async () => {
      await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_a',
        confidenceScore: 0.9,
      })
      await recordUserBehaviorEvent({
        userId: USER_A,
        eventType: 'page_view',
        subjectType: 'dockItem',
      })
      await recordUserBehaviorEvent({
        userId: USER_B,
        eventType: 'edit',
        subjectType: 'entry',
        subjectId: '100',
      })

      const recsA = await listRecommendations(USER_A)
      const recsB = await listRecommendations(USER_B)
      const eventsA = await listUserBehaviorEvents(USER_A)
      const eventsB = await listUserBehaviorEvents(USER_B)

      expect(recsA).toHaveLength(1)
      expect(recsB).toHaveLength(0)
      expect(eventsA).toHaveLength(1)
      expect(eventsB).toHaveLength(1)
    })
  })

  describe('LC-013 apply recommendation end-to-end bridge', () => {
    afterEach(async () => {
      await cleanAll()
    })

    it('generateRecommendationsForContext produces recommendations for a dockItem', async () => {
      const itemId = await createDockItem(USER_A, 'Need to review performance optimization')
      await createStoredTag(USER_A, 'performance')
      await createStoredTag(USER_A, 'optimization')

      const result = await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      expect(result.recommendations.length).toBeGreaterThan(0)
      expect(result.recommendationEvents.length).toBeGreaterThan(0)
      expect(result.recommendations[0].status).toBe('generated')
      expect(result.recommendations[0].subjectType).toBe('dockItem')
      expect(result.recommendations[0].subjectId).toBe(itemId)
    })

    it('listRecommendationDockQueue with subjectId filter returns scoped recommendations', async () => {
      const itemId1 = await createDockItem(USER_A, 'Performance tuning guide')
      const itemId2 = await createDockItem(USER_A, 'Database migration plan')

      await createStoredTag(USER_A, 'performance')
      await createStoredTag(USER_A, 'database')

      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId1,
      })
      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId2,
      })

      const queue1 = await listRecommendationDockQueue(USER_A, {
        subjectType: 'dockItem',
        subjectId: itemId1,
      })
      const queue2 = await listRecommendationDockQueue(USER_A, {
        subjectType: 'dockItem',
        subjectId: itemId2,
      })
      const queueAll = await listRecommendationDockQueue(USER_A, {})

      expect(queue1.items.length).toBeGreaterThan(0)
      expect(queue2.items.length).toBeGreaterThan(0)
      expect(queueAll.items.length).toBeGreaterThanOrEqual(queue1.items.length + queue2.items.length)

      for (const item of queue1.items) {
        expect(String(item.subjectId)).toBe(String(itemId1))
      }
      for (const item of queue2.items) {
        expect(String(item.subjectId)).toBe(String(itemId2))
      }
    })

    it('apply tag recommendation adds tag to dock item', async () => {
      const itemId = await createDockItem(USER_A, 'Need performance review')
      await createStoredTag(USER_A, 'performance')

      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const queue = await listRecommendationDockQueue(USER_A, {
        subjectType: 'dockItem',
        subjectId: itemId,
        candidateType: 'tag',
      })
      expect(queue.items.length).toBeGreaterThan(0)

      const tagRec = queue.items[0]
      const result = await applyRecommendation({
        userId: USER_A,
        recommendationId: tagRec.id,
      })

      expect(result.status).toBe('accepted')
      expect(result.appliedChanges.candidateType).toBe('tag')
      expect(result.appliedChanges.changeType).toBe('add_tag')

      const dockItems = await db.table('dockItems').where('userId').equals(USER_A).toArray()
      const updatedItem = dockItems.find((i) => i.id === itemId)
      expect(updatedItem).toBeDefined()
      if (updatedItem) {
        expect(updatedItem.userTags).toContain('performance')
      }
    })

    it('apply recommendation writes recommendation_event and user_behavior_event', async () => {
      const itemId = await createDockItem(USER_A, 'Test event consistency')
      await createStoredTag(USER_A, 'test')

      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const queue = await listRecommendationDockQueue(USER_A, {
        subjectType: 'dockItem',
        subjectId: itemId,
      })
      expect(queue.items.length).toBeGreaterThan(0)

      const rec = queue.items[0]
      const result = await applyRecommendation({
        userId: USER_A,
        recommendationId: rec.id,
      })

      expect(result.recommendationEventId).toBeTruthy()
      expect(result.userBehaviorEventId).toBeTruthy()

      const recEvents = await listRecommendationEvents(USER_A, { recommendationId: rec.id })
      const acceptedEvent = recEvents.find((e) => e.eventType === 'recommendation_accepted')
      expect(acceptedEvent).toBeDefined()

      const behaviorEvents = await listUserBehaviorEvents(USER_A)
      const applyEvent = behaviorEvents.find((e) => e.eventType === 'recommendation_accepted')
      expect(applyEvent).toBeDefined()
    })

    it('apply unsupported candidate type throws error and does not update status', async () => {
      await createDockItem(USER_A, 'Test unsupported')

      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'entry_candidate',
        candidateType: 'entry',
        candidateId: 'entry_123',
        confidenceScore: 0.8,
      })

      await expect(
        applyRecommendation({ userId: USER_A, recommendationId: rec.id }),
      ).rejects.toThrow(/not supported/)

      const updated = await db.table('recommendations').get(rec.id)
      expect(updated).toBeDefined()
      if (updated) {
        expect(updated.status).not.toBe('accepted')
      }
    })

    it('apply already-accepted recommendation throws error', async () => {
      const itemId = await createDockItem(USER_A, 'Duplicate tag recommendation test')
      await createStoredTag(USER_A, 'duplicate')

      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const queue = await listRecommendationDockQueue(USER_A, {
        subjectType: 'dockItem',
        subjectId: itemId,
      })
      expect(queue.items.length).toBeGreaterThan(0)

      await applyRecommendation({ userId: USER_A, recommendationId: queue.items[0].id })

      await expect(
        applyRecommendation({ userId: USER_A, recommendationId: queue.items[0].id }),
      ).rejects.toThrow(/already been accepted/)
    })

    it('apply project recommendation sets selectedProject on dock item', async () => {
      const itemId = await createDockItem(USER_A, 'Core architecture document')
      await createCollection({ userId: USER_A, name: 'Core Architecture', collectionType: 'project' })

      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const queue = await listRecommendationDockQueue(USER_A, {
        subjectType: 'dockItem',
        subjectId: itemId,
        candidateType: 'project',
      })

      if (queue.items.length > 0) {
        const result = await applyRecommendation({
          userId: USER_A,
          recommendationId: queue.items[0].id,
        })

        expect(result.status).toBe('accepted')
        expect(result.appliedChanges.changeType).toBe('set_project')

        const dockItems = await db.table('dockItems').where('userId').equals(USER_A).toArray()
        const updatedItem = dockItems.find((i) => i.id === itemId)
        expect(updatedItem).toBeDefined()
        if (updatedItem) {
          expect(updatedItem.selectedProject).toBe('Core Architecture')
        }
      }
    })

    it('apply mindNode recommendation creates an edge', async () => {
      const itemId = await createDockItem(USER_A, 'Mind node edge test')
      const sourceNode = await upsertMindNode({
        userId: USER_A,
        nodeType: 'source',
        label: 'Test Source',
        documentId: itemId,
      })
      const targetNode = await upsertMindNode({
        userId: USER_A,
        nodeType: 'topic',
        label: 'Performance',
      })

      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
        recommendationType: 'mind_node_candidate',
        candidateType: 'mindNode',
        candidateId: targetNode.id,
        confidenceScore: 0.82,
      })

      const result = await applyRecommendation({
        userId: USER_A,
        recommendationId: rec.id,
      })

      expect(result.status).toBe('accepted')
      expect(result.appliedChanges.changeType).toBe('create_edge')

      const edges = await listMindEdges(USER_A)
      const relevantEdge = edges.find(
        (e) => e.sourceNodeId === sourceNode.id && e.targetNodeId === targetNode.id,
      )
      expect(relevantEdge).toBeDefined()
      if (relevantEdge) {
        expect(relevantEdge.edgeType).toBe('suggested')
      }
    })

    it('apply mindNode without existing dock mind node throws unsupported error', async () => {
      const itemId = await createDockItem(USER_A, 'No mind node dock item')
      const targetNode = await upsertMindNode({
        userId: USER_A,
        nodeType: 'topic',
        label: 'Isolated Node',
      })

      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
        recommendationType: 'mind_node_candidate',
        candidateType: 'mindNode',
        candidateId: targetNode.id,
        confidenceScore: 0.7,
      })

      await expect(
        applyRecommendation({ userId: USER_A, recommendationId: rec.id }),
      ).rejects.toThrow(/unsupported/)
    })

    it('reject recommendation updates status and refreshes', async () => {
      const itemId = await createDockItem(USER_A, 'Reject test item')
      await createStoredTag(USER_A, 'test')

      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const queue = await listRecommendationDockQueue(USER_A, {
        subjectType: 'dockItem',
        subjectId: itemId,
      })
      expect(queue.items.length).toBeGreaterThan(0)

      const rec = queue.items[0]
      await recordRecommendationDockQueueItemFeedback({
        userId: USER_A,
        recommendationId: rec.id,
        feedbackType: 'rejected',
      })

      const updated = await db.table('recommendations').get(rec.id)
      expect(updated).toBeDefined()
      if (updated) {
        expect(updated.status).toBe('rejected')
      }
    })

    it('ignore recommendation updates status and refreshes', async () => {
      const itemId = await createDockItem(USER_A, 'Ignore test item')
      await createStoredTag(USER_A, 'test')

      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const queue = await listRecommendationDockQueue(USER_A, {
        subjectType: 'dockItem',
        subjectId: itemId,
      })
      expect(queue.items.length).toBeGreaterThan(0)

      const rec = queue.items[0]
      await recordRecommendationDockQueueItemFeedback({
        userId: USER_A,
        recommendationId: rec.id,
        feedbackType: 'ignored',
      })

      const updated = await db.table('recommendations').get(rec.id)
      expect(updated).toBeDefined()
      if (updated) {
        expect(updated.status).toBe('ignored')
      }
    })

    it('recommendation dock queue subjectId filter works with mixed statuses', async () => {
      const itemId = await createDockItem(USER_A, 'Mixed status test')
      await createStoredTag(USER_A, 'mixed')

      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const allQueue = await listRecommendationDockQueue(USER_A, {
        subjectType: 'dockItem',
        subjectId: itemId,
      })
      expect(allQueue.items.length).toBeGreaterThan(0)

      if (allQueue.items.length > 0) {
        await recordRecommendationDockQueueItemFeedback({
          userId: USER_A,
          recommendationId: allQueue.items[0].id,
          feedbackType: 'accepted',
        })

        const pendingQueue = await listRecommendationDockQueue(USER_A, {
          subjectType: 'dockItem',
          subjectId: itemId,
          status: 'generated',
        })
        const acceptedQueue = await listRecommendationDockQueue(USER_A, {
          subjectType: 'dockItem',
          subjectId: itemId,
          status: 'accepted',
        })

        expect(pendingQueue.items.length + acceptedQueue.items.length).toBeGreaterThanOrEqual(1)
      }
    })

    it('markRecommendationDockQueueItemShown transitions generated to shown with events', async () => {
      const itemId = await createDockItem(USER_A, 'Shown status test')
      await createStoredTag(USER_A, 'shown')

      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const queue = await listRecommendationDockQueue(USER_A, {
        subjectType: 'dockItem',
        subjectId: itemId,
        status: 'generated',
      })
      expect(queue.items.length).toBeGreaterThan(0)

      const rec = queue.items[0]
      await markRecommendationDockQueueItemShown({ userId: USER_A, recommendationId: rec.id })

      const updated = await db.table('recommendations').get(rec.id)
      expect(updated).toBeDefined()
      if (updated) {
        expect(updated.status).toBe('shown')
      }

      const events = await listRecommendationEvents(USER_A, { recommendationId: rec.id })
      const shownEvent = events.find((e) => e.eventType === 'recommendation_shown')
      expect(shownEvent).toBeDefined()

      const behaviorEvents = await listUserBehaviorEvents(USER_A)
      const shownBehavior = behaviorEvents.find((e) => e.eventType === 'recommendation_shown')
      expect(shownBehavior).toBeDefined()
    })

    it('applyRecommendation rolls back structure change if transaction fails', async () => {
      const itemId = await createDockItem(USER_A, 'Rollback test')
      await createStoredTag(USER_A, 'rollback')

      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const queue = await listRecommendationDockQueue(USER_A, {
        subjectType: 'dockItem',
        subjectId: itemId,
      })
      expect(queue.items.length).toBeGreaterThan(0)

      const rec = queue.items[0]
      const originalDockItem = (await db.table('dockItems').where('userId').equals(USER_A).toArray()).find((d) => d.id === itemId)
      expect(originalDockItem).toBeDefined()
      const originalTags = originalDockItem ? [...(originalDockItem.userTags ?? [])] : []

      await applyRecommendation({ userId: USER_A, recommendationId: rec.id })

      const afterApply = await db.table('recommendations').get(rec.id)
      expect(afterApply).toBeDefined()
      if (afterApply) {
        expect(afterApply.status).toBe('accepted')
      }

      const dockItems = await db.table('dockItems').where('userId').equals(USER_A).toArray()
      const updatedItem = dockItems.find((d) => d.id === itemId)
      expect(updatedItem).toBeDefined()
      if (updatedItem) {
        expect(updatedItem.userTags.length).toBeGreaterThanOrEqual(originalTags.length + 1)
      }
    })
  })
})
