import { afterEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  createRecommendation,
  listRecommendationDockQueue,
  markRecommendationDockQueueItemShown,
  recordRecommendationDockQueueItemFeedback,
} from '@/lib/repository'

const USER_A = 'user_lc012_test'

async function cleanAll() {
  await db.table('recommendations').clear()
  await db.table('recommendationEvents').clear()
  await db.table('userBehaviorEvents').clear()
}

describe('LC-012 RecommendationDock UI consumption', () => {
  afterEach(cleanAll)

  describe('listRecommendationDockQueue for dock rendering', () => {
    it('returns items with all fields required for dock rendering', async () => {
      await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_fe',
        confidenceScore: 0.85,
        reasonJson: JSON.stringify({ rank: 1, score: 0.85, reason: '高频标签匹配', evidenceSummary: { evidenceCount: 3, evidenceTypes: ['usage', 'context'], sources: ['recent_docs'] } }),
      })

      const result = await listRecommendationDockQueue(USER_A, { sortBy: 'createdAt', sortDirection: 'desc' })

      expect(result.items).toHaveLength(1)
      const item = result.items[0]

      expect(item.recommendationType).toBeDefined()
      expect(item.candidateType).toBeDefined()
      expect(item.confidenceScore).toBeDefined()
      expect(item.reasonSummary).toBeDefined()
      expect(item.scoreSummary).toBeDefined()
      expect(item.evidenceSummary).toBeDefined()
      expect(item.status).toBeDefined()
      expect(item.isShown).toBe(false)
      expect(item.hasFeedback).toBe(false)
      expect(item.userId).toBe(USER_A)
    })

    it('returns empty result when no recommendations exist', async () => {
      const result = await listRecommendationDockQueue(USER_A)

      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)
      expect(result.nextCursor).toBeNull()
    })

    it('sorts by createdAt desc by default for dock display', async () => {
      await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_a',
        confidenceScore: 0.8,
      })
      await new Promise((r) => setTimeout(r, 10))
      await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 2,
        recommendationType: 'project_suggestion',
        candidateType: 'project',
        candidateId: 'proj_b',
        confidenceScore: 0.7,
      })

      const result = await listRecommendationDockQueue(USER_A, { sortBy: 'createdAt', sortDirection: 'desc' })

      expect(result.items).toHaveLength(2)
      expect(result.items[0].candidateId).toBe('proj_b')
      expect(result.items[1].candidateId).toBe('tag_a')
    })
  })

  describe('markRecommendationDockQueueItemShown', () => {
    it('marks a generated recommendation as shown', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_show',
        confidenceScore: 0.8,
      })

      let queue = await listRecommendationDockQueue(USER_A)
      expect(queue.items[0].isShown).toBe(false)
      expect(queue.items[0].status).toBe('generated')

      await markRecommendationDockQueueItemShown({
        userId: USER_A,
        recommendationId: rec.id,
      })

      queue = await listRecommendationDockQueue(USER_A)
      expect(queue.items[0].isShown).toBe(true)
      expect(queue.items[0].status).toBe('shown')
    })

    it('is idempotent when marking an already shown recommendation', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_idemp',
        confidenceScore: 0.8,
      })

      await markRecommendationDockQueueItemShown({ userId: USER_A, recommendationId: rec.id })
      await markRecommendationDockQueueItemShown({ userId: USER_A, recommendationId: rec.id })

      const queue = await listRecommendationDockQueue(USER_A)
      expect(queue.items[0].isShown).toBe(true)
      expect(queue.items[0].status).toBe('shown')
    })
  })

  describe('recordRecommendationDockQueueItemFeedback', () => {
    it.each([
      { feedbackType: 'accepted' as const, expectedStatus: 'accepted' },
      { feedbackType: 'rejected' as const, expectedStatus: 'rejected' },
      { feedbackType: 'ignored' as const, expectedStatus: 'ignored' },
    ])('records $feedbackType feedback and updates status to $expectedStatus', async ({ feedbackType, expectedStatus }) => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: `tag_${feedbackType}`,
        confidenceScore: 0.8,
      })

      await markRecommendationDockQueueItemShown({ userId: USER_A, recommendationId: rec.id })
      await recordRecommendationDockQueueItemFeedback({
        userId: USER_A,
        recommendationId: rec.id,
        feedbackType,
      })

      const queue = await listRecommendationDockQueue(USER_A)
      expect(queue.items[0].status).toBe(expectedStatus)
      expect(queue.items[0].hasFeedback).toBe(true)
      expect(queue.items[0].isShown).toBe(true)
    })

    it('allows feedback without prior shown step', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_direct',
        confidenceScore: 0.8,
      })

      await recordRecommendationDockQueueItemFeedback({
        userId: USER_A,
        recommendationId: rec.id,
        feedbackType: 'accepted',
      })

      const queue = await listRecommendationDockQueue(USER_A)
      expect(queue.items[0].status).toBe('accepted')
      expect(queue.items[0].hasFeedback).toBe(true)
    })

    it('local state update pattern: feedback results in correct state transition', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'project_suggestion',
        candidateType: 'project',
        candidateId: 'proj_state',
        confidenceScore: 0.9,
      })

      const initial = await listRecommendationDockQueue(USER_A)
      expect(initial.items[0].status).toBe('generated')

      await recordRecommendationDockQueueItemFeedback({
        userId: USER_A,
        recommendationId: rec.id,
        feedbackType: 'accepted',
      })

      const afterFeedback = await listRecommendationDockQueue(USER_A)
      expect(afterFeedback.items[0].status).toBe('accepted')
      expect(afterFeedback.items[0].hasFeedback).toBe(true)

      const fullList = await listRecommendationDockQueue(USER_A, {})
      expect(fullList.items).toHaveLength(1)
    })

    it('keeps userId isolation for feedback actions', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_iso',
        confidenceScore: 0.8,
      })

      await expect(
        recordRecommendationDockQueueItemFeedback({
          userId: 'user_other',
          recommendationId: rec.id,
          feedbackType: 'rejected',
        }),
      ).rejects.toThrow(/does not own recommendation/)
    })
  })

  describe('dock consumption patterns', () => {
    it('provides both pending and resolved items in a single queue', async () => {
      await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_pending',
        confidenceScore: 0.8,
      })

      const resolved = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 2,
        recommendationType: 'project_suggestion',
        candidateType: 'project',
        candidateId: 'proj_done',
        confidenceScore: 0.7,
      })
      await recordRecommendationDockQueueItemFeedback({
        userId: USER_A,
        recommendationId: resolved.id,
        feedbackType: 'accepted',
      })

      const queue = await listRecommendationDockQueue(USER_A, { sortBy: 'createdAt', sortDirection: 'desc' })
      expect(queue.items).toHaveLength(2)

      const pending = queue.items.filter((i) => i.status === 'generated')
      const resolvedItems = queue.items.filter((i) => i.status === 'accepted')
      expect(pending).toHaveLength(1)
      expect(resolvedItems).toHaveLength(1)
    })

    it('re-fetching queue after feedback reflects updated items', async () => {
      const rec1 = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_refresh_1',
        confidenceScore: 0.8,
      })
      const rec2 = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 2,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_refresh_2',
        confidenceScore: 0.7,
      })

      const before = await listRecommendationDockQueue(USER_A, { sortBy: 'createdAt', sortDirection: 'desc' })
      expect(before.items.every((i) => i.status === 'generated')).toBe(true)

      await recordRecommendationDockQueueItemFeedback({
        userId: USER_A,
        recommendationId: rec1.id,
        feedbackType: 'accepted',
      })

      const after = await listRecommendationDockQueue(USER_A, { sortBy: 'createdAt', sortDirection: 'desc' })
      const acceptedItem = after.items.find((i) => i.id === rec1.id)
      const pendingItem = after.items.find((i) => i.id === rec2.id)
      expect(acceptedItem?.status).toBe('accepted')
      expect(pendingItem?.status).toBe('generated')
    })
  })
})
