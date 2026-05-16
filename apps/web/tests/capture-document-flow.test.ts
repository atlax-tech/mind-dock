import { afterEach, describe, expect, it, vi } from 'vitest'

import { db, recommendationEventsTable, recommendationsTable, userBehaviorEventsTable } from '@/lib/db'
import {
  createCaptureToDocumentFlow,
  getDocumentByCaptureId,
  getMindNode,
  listRecommendations,
  listRecommendationEvents,
  listUserBehaviorEvents,
  markRecommendationShown,
  recordRecommendationFeedback,
} from '@/lib/repository'

const USER_A = 'user_test_a'
const USER_B = 'user_test_b'

async function cleanAll() {
  vi.restoreAllMocks()
  await db.table('dockItems').clear()
  await db.table('entries').clear()
  await db.table('mindNodes').clear()
  await db.table('recommendations').clear()
  await db.table('recommendationEvents').clear()
  await db.table('userBehaviorEvents').clear()
}

function unwrap<T>(value: T | null): T {
  expect(value).not.toBeNull()
  return value as T
}

describe('capture → document → mindNode flow', () => {
  afterEach(cleanAll)

  describe('createCaptureToDocumentFlow', () => {
    it('creates capture, document, and mindNode from raw text', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: '今天学习了 TypeScript 泛型\n很有收获',
      })

      expect(result.capture.id).toBeGreaterThan(0)
      expect(result.capture.rawText).toBe('今天学习了 TypeScript 泛型\n很有收获')
      expect(result.capture.status).toBe('archived')
      expect(result.capture.processedAt).toBeInstanceOf(Date)
      expect(result.capture.createdAt).toBeInstanceOf(Date)

      expect(result.document.id).toBeGreaterThan(0)
      expect(result.document.title).toBe('今天学习了 TypeScript 泛型')
      expect(result.document.content).toBe('今天学习了 TypeScript 泛型\n很有收获')
      expect(result.document.sourceCaptureId).toBe(result.capture.id)
      expect(result.document.type).toBe('note')
      expect(result.document.createdAt).toBeInstanceOf(Date)

      expect(result.mindNode.id).toBeTruthy()
      expect(result.mindNode.label).toBe('今天学习了 TypeScript 泛型')
      expect(result.mindNode.nodeType).toBe('document')
      expect(result.mindNode.documentId).toBe(result.document.id)
      expect(result.mindNode.state).toBe('drifting')

      expect(result.recommendation.id).toBeTruthy()
      expect(result.recommendation.recommendationType).toBe('landing')
      expect(result.recommendation.status).toBe('generated')
      expect(result.recommendation.subjectType).toBe('dockItem')
      expect(result.recommendation.subjectId).toBe(result.capture.id)
      expect(result.recommendation.candidateType).toBe('mindNode')
      expect(result.recommendation.candidateId).toBe(result.mindNode.id)

      expect(result.recommendationEvent.id).toBeTruthy()
      expect(result.recommendationEvent.eventType).toBe('recommendation_generated')
    })

    it('creates capture with custom topic', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: '一些杂乱的笔记内容\n今天天气不错',
        topic: '杂记',
      })

      expect(result.document.title).toBe('一些杂乱的笔记内容')
    })

    it('creates capture with custom sourceType', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: '语音转录的摘要内容',
        sourceType: 'voice',
      })

      expect(result.capture.rawText).toBe('语音转录的摘要内容')
      expect(result.document.title).toBe('语音转录的摘要内容')
    })

    it('extracts title from multiline text', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: '第一行是标题\n第二行是正文\n第三行也是正文',
      })

      expect(result.document.title).toBe('第一行是标题')
      expect(result.document.content).toBe('第一行是标题\n第二行是正文\n第三行也是正文')
    })

    it('truncates long title to 60 characters', async () => {
      const longLine = '这是一段非常长的文本用于测试标题截断功能是否正常工作需要超过六十个字符才行'.repeat(2)
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: longLine,
      })

      expect(result.document.title.length).toBeLessThanOrEqual(60)
      expect(result.document.title.endsWith('...')).toBe(true)
    })

    it('rejects empty rawText string', async () => {
      await expect(
        createCaptureToDocumentFlow({
          userId: USER_A,
          rawText: '',
        }),
      ).rejects.toThrow('rawText must not be empty')
    })

    it('rejects whitespace-only rawText', async () => {
      await expect(
        createCaptureToDocumentFlow({
          userId: USER_A,
          rawText: '   \t \n  ',
        }),
      ).rejects.toThrow('rawText must not be empty')
    })

    it('rejects empty userId', async () => {
      await expect(
        createCaptureToDocumentFlow({
          userId: '',
          rawText: 'some text',
        }),
      ).rejects.toThrow('userId must not be empty')
    })
  })

  describe('userId isolation', () => {
    it('isolates captures between users', async () => {
      await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: '用户A的笔记',
      })
      await createCaptureToDocumentFlow({
        userId: USER_B,
        rawText: '用户B的笔记',
      })

      const docsA = await db.table('entries').where('userId').equals(USER_A).toArray()
      const docsB = await db.table('entries').where('userId').equals(USER_B).toArray()

      expect(docsA).toHaveLength(1)
      expect(docsB).toHaveLength(1)
      expect(docsA[0].title).toBe('用户A的笔记')
      expect(docsB[0].title).toBe('用户B的笔记')
    })

    it('prevents cross-user document access', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: '用户A的内容',
      })

      const doc = await getDocumentByCaptureId(USER_B, result.capture.id)
      expect(doc).toBeNull()
    })

    it('isolates mindNodes between users', async () => {
      const resultA = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: '用户A的思维节点',
      })
      const resultB = await createCaptureToDocumentFlow({
        userId: USER_B,
        rawText: '用户B的思维节点',
      })

      const nodeA = await getMindNode(USER_A, resultA.mindNode.id)
      const nodeB = await getMindNode(USER_B, resultB.mindNode.id)
      const crossA = await getMindNode(USER_B, resultA.mindNode.id)
      const crossB = await getMindNode(USER_A, resultB.mindNode.id)

      expect(unwrap(nodeA).label).toBe('用户A的思维节点')
      expect(unwrap(nodeB).label).toBe('用户B的思维节点')
      expect(crossA).toBeNull()
      expect(crossB).toBeNull()
    })

    it('cross-user cannot access other user entries', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: '私有笔记内容',
      })

      const crossEntry = await db.table('entries').where('userId').equals(USER_B).and((e) => e.id === result.document.id).first()
      expect(crossEntry).toBeUndefined()
    })
  })

  describe('document ↔ mindNode stable association', () => {
    it('mindNode.documentId matches document.id', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: '验证关联关系',
      })

      expect(result.mindNode.documentId).toBe(result.document.id)
    })

    it('same capture creates unique mindNode with correct documentId', async () => {
      const result1 = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: '第一篇文档',
      })
      const result2 = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: '第二篇文档',
      })

      expect(result1.mindNode.documentId).toBe(result1.document.id)
      expect(result2.mindNode.documentId).toBe(result2.document.id)
      expect(result1.mindNode.id).not.toBe(result2.mindNode.id)
      expect(result1.document.id).not.toBe(result2.document.id)
    })

    it('document can be retrieved by capture id', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: '通过 captureId 查询文档',
      })

      const doc = await getDocumentByCaptureId(USER_A, result.capture.id)
      expect(unwrap(doc).id).toBe(result.document.id)
      expect(unwrap(doc).title).toBe(result.document.title)
    })

    it('mindNode can be fetched and matches document', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: '通过 mindNode 查询文档',
      })

      const node = await getMindNode(USER_A, result.mindNode.id)
      expect(unwrap(node).documentId).toBe(result.document.id)
      expect(unwrap(node).label).toBe(result.document.title)
    })
  })

  describe('capture status consistency (LC-003)', () => {
    it('capture status is archived after successful flow', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: '状态一致性测试',
      })

      const dockItem = await db.table('dockItems').get(result.capture.id)
      expect(unwrap(dockItem).status).toBe('archived')
    })

    it('capture processedAt is set after successful flow', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'processedAt 验证',
      })

      const dockItem = await db.table('dockItems').get(result.capture.id)
      expect(unwrap(dockItem).processedAt).toBeInstanceOf(Date)
      expect(unwrap(dockItem).processedAt).not.toBeNull()
    })

    it('document.sourceDockItemId still points to capture', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: '验证 sourceDockItemId 稳定性',
      })

      const entry = await db.table('entries').get(result.document.id)
      expect(unwrap(entry).sourceDockItemId).toBe(result.capture.id)
    })

    it('mindNode.documentId still points to document', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: '验证 documentId 稳定性',
      })

      const node = await db.table('mindNodes').get(result.mindNode.id)
      expect(unwrap(node).documentId).toBe(result.document.id)
    })

    it('capture no longer appears in pending list after flow', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: '不应出现在 pending 列表',
      })

      const pendingItems = await db.table('dockItems')
        .where('userId').equals(USER_A)
        .and((i: { status: string }) => i.status === 'pending')
        .toArray()

      const found = pendingItems.find((i: { id: number }) => i.id === result.capture.id)
      expect(found).toBeUndefined()
    })
  })

  describe('recommendation landing flow (LC-004)', () => {
    it('creates landing recommendation on successful flow', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'recommendation 生成测试',
      })

      expect(result.recommendation.id).toBeTruthy()
      expect(result.recommendation.recommendationType).toBe('landing')
      expect(result.recommendation.status).toBe('generated')
    })

    it('creates recommendation_event generated on successful flow', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'event 生成测试',
      })

      expect(result.recommendationEvent.id).toBeTruthy()
      expect(result.recommendationEvent.eventType).toBe('recommendation_generated')
    })

    it('recommendation.subject points to capture', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'subject 指向验证',
      })

      expect(result.recommendation.subjectType).toBe('dockItem')
      expect(result.recommendation.subjectId).toBe(result.capture.id)
    })

    it('recommendation.candidate points to mindNode', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'candidate 指向验证',
      })

      expect(result.recommendation.candidateType).toBe('mindNode')
      expect(result.recommendation.candidateId).toBe(result.mindNode.id)
    })

    it('recommendation_event associates with recommendation', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'event 关联验证',
      })

      const events = await listRecommendationEvents(USER_A, {
        recommendationId: result.recommendation.id,
      })
      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('recommendation_generated')
      expect(events[0].recommendationId).toBe(result.recommendation.id)
    })

    it('userId isolation: user A cannot query user B recommendation', async () => {
      const resultA = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: '用户A的推荐',
      })
      await createCaptureToDocumentFlow({
        userId: USER_B,
        rawText: '用户B的推荐',
      })

      const recsA = await listRecommendations(USER_A)
      const recsB = await listRecommendations(USER_B)

      expect(recsA).toHaveLength(1)
      expect(recsB).toHaveLength(1)
      expect(recsA[0].id).toBe(resultA.recommendation.id)

      const crossRecs = await listRecommendations(USER_B, { subjectType: 'dockItem' })
      const foundCross = crossRecs.find((r) => r.id === resultA.recommendation.id)
      expect(foundCross).toBeUndefined()
    })

    it('userId isolation: user A cannot query user B recommendation_event', async () => {
      const resultA = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: '用户A的事件',
      })
      await createCaptureToDocumentFlow({
        userId: USER_B,
        rawText: '用户B的事件',
      })

      const eventsA = await listRecommendationEvents(USER_A, {
        recommendationId: resultA.recommendation.id,
      })
      expect(eventsA).toHaveLength(1)

      const eventsB = await listRecommendationEvents(USER_B, {
        recommendationId: resultA.recommendation.id,
      })
      expect(eventsB).toHaveLength(0)
    })

    it('empty content rejection does not generate recommendation', async () => {
      await expect(
        createCaptureToDocumentFlow({
          userId: USER_A,
          rawText: '',
        }),
      ).rejects.toThrow('rawText must not be empty')

      const recs = await listRecommendations(USER_A)
      expect(recs).toHaveLength(0)
    })

    it('empty content rejection does not generate recommendation_event', async () => {
      await expect(
        createCaptureToDocumentFlow({
          userId: USER_A,
          rawText: '   ',
        }),
      ).rejects.toThrow('rawText must not be empty')

      const events = await listRecommendationEvents(USER_A)
      expect(events).toHaveLength(0)
    })

    it('LC-003 status rules not regressed: capture.status = archived', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'LC-003 状态规则不回退',
      })

      const dockItem = await db.table('dockItems').get(result.capture.id)
      expect(unwrap(dockItem).status).toBe('archived')
    })

    it('LC-003 status rules not regressed: processedAt is set', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'processedAt 验证 LC-004',
      })

      const dockItem = await db.table('dockItems').get(result.capture.id)
      expect(unwrap(dockItem).processedAt).toBeInstanceOf(Date)
      expect(unwrap(dockItem).processedAt).not.toBeNull()
    })

    it('LC-002 association rules not regressed: Document.sourceDockItemId', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'LC-002 sourceDockItemId 不回退',
      })

      const entry = await db.table('entries').get(result.document.id)
      expect(unwrap(entry).sourceDockItemId).toBe(result.capture.id)
    })

    it('LC-002 association rules not regressed: MindNode.documentId', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'LC-002 documentId 不回退',
      })

      const node = await db.table('mindNodes').get(result.mindNode.id)
      expect(unwrap(node).documentId).toBe(result.document.id)
    })

    it('recommendation record has reasonJson with flow metadata', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'reasonJson 验证',
      })

      const recs = await listRecommendations(USER_A)
      expect(recs).toHaveLength(1)
      const reasonJson = unwrap(recs[0].reasonJson)
      const parsed = JSON.parse(reasonJson)
      expect(parsed.source).toBe('capture_to_document_flow')
      expect(parsed.reason).toBe('created from successful capture landing flow')
      expect(parsed.documentId).toBe(result.document.id)
      expect(parsed.mindNodeId).toBe(result.mindNode.id)
    })

    it('recommendation_event has metadata with flow context', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'event metadata 验证',
      })

      const events = await listRecommendationEvents(USER_A, {
        recommendationId: result.recommendation.id,
      })
      expect(events).toHaveLength(1)
      expect(events[0].metadata).not.toBeNull()
      const meta = events[0].metadata as Record<string, unknown>
      expect(meta.source).toBe('capture_to_document_flow')
      expect(meta.documentId).toBe(result.document.id)
      expect(meta.mindNodeId).toBe(result.mindNode.id)
    })
  })

  describe('recommendation feedback flow (LC-005)', () => {
    it('records accepted feedback: status update + event append', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'accepted feedback 测试',
      })

      const feedback = await recordRecommendationFeedback({
        recommendationId: result.recommendation.id,
        userId: USER_A,
        feedbackType: 'accepted',
      })

      expect(feedback.recommendation.status).toBe('accepted')
      expect(feedback.feedbackEvent.eventType).toBe('recommendation_accepted')
      expect(feedback.feedbackEvent.recommendationId).toBe(result.recommendation.id)

      const events = await listRecommendationEvents(USER_A, {
        recommendationId: result.recommendation.id,
      })
      expect(events).toHaveLength(2)
      const feedbackEvent = events.find((e) => e.eventType === 'recommendation_accepted')
      expect(feedbackEvent).toBeDefined()
      expect(unwrap(feedbackEvent ?? null).recommendationId).toBe(result.recommendation.id)
    })

    it.each(['accepted', 'rejected', 'modified', 'ignored'] as const)(
      'records %s feedback as a user behavior signal',
      async (feedbackType) => {
        const result = await createCaptureToDocumentFlow({
          userId: USER_A,
          rawText: `${feedbackType} behavior signal 测试`,
        })
        const feedbackPayload = feedbackType === 'modified'
          ? { originalCandidateId: result.recommendation.candidateId, modifiedCandidateId: 'node_modified' }
          : undefined

        await recordRecommendationFeedback({
          recommendationId: result.recommendation.id,
          userId: USER_A,
          feedbackType,
          feedbackPayload,
        })

        const behaviorEvents = await listUserBehaviorEvents(USER_A, {
          eventType: `recommendation_${feedbackType}`,
        })
        expect(behaviorEvents).toHaveLength(1)
        expect(behaviorEvents[0].subjectType).toBe(result.recommendation.subjectType)
        expect(behaviorEvents[0].subjectId).toBe(String(result.recommendation.subjectId))

        const meta = behaviorEvents[0].metadata as Record<string, unknown>
        expect(meta.recommendationId).toBe(result.recommendation.id)
        expect(meta.recommendationType).toBe(result.recommendation.recommendationType)
        expect(meta.subjectType).toBe(result.recommendation.subjectType)
        expect(meta.subjectId).toBe(result.recommendation.subjectId)
        expect(meta.candidateType).toBe(result.recommendation.candidateType)
        expect(meta.candidateId).toBe(result.recommendation.candidateId)
        expect(meta.source).toBe('recommendation_feedback')
        expect(meta.feedbackType).toBe(feedbackType)
        if (feedbackType === 'modified') {
          expect(meta.feedbackPayload).toEqual(feedbackPayload)
        }
      },
    )

    it('records rejected feedback', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'rejected feedback 测试',
      })

      const feedback = await recordRecommendationFeedback({
        recommendationId: result.recommendation.id,
        userId: USER_A,
        feedbackType: 'rejected',
      })

      expect(feedback.recommendation.status).toBe('rejected')
      expect(feedback.feedbackEvent.eventType).toBe('recommendation_rejected')

      const events = await listRecommendationEvents(USER_A, {
        recommendationId: result.recommendation.id,
      })
      const feedbackEvent = events.find((e) => e.eventType === 'recommendation_rejected')
      expect(feedbackEvent).toBeDefined()
    })

    it('records modified feedback with modification context saved', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'modified feedback 测试',
      })

      const feedbackPayload = {
        originalTag: '学习',
        modifiedTag: 'TypeScript 学习',
        reason: '更精确的分类',
      }

      const feedback = await recordRecommendationFeedback({
        recommendationId: result.recommendation.id,
        userId: USER_A,
        feedbackType: 'modified',
        feedbackPayload,
      })

      expect(feedback.recommendation.status).toBe('modified')
      expect(feedback.feedbackEvent.eventType).toBe('recommendation_modified')

      const events = await listRecommendationEvents(USER_A, {
        recommendationId: result.recommendation.id,
      })
      const feedbackEvent = events.find((e) => e.eventType === 'recommendation_modified')
      expect(feedbackEvent).toBeDefined()
      const meta = unwrap(feedbackEvent ?? null).metadata as Record<string, unknown>
      expect(meta.feedbackType).toBe('modified')
      expect(meta.source).toBe('recommendation_feedback')
      expect(meta.feedbackPayload).toEqual(feedbackPayload)
    })

    it('records ignored feedback', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'ignored feedback 测试',
      })

      const feedback = await recordRecommendationFeedback({
        recommendationId: result.recommendation.id,
        userId: USER_A,
        feedbackType: 'ignored',
      })

      expect(feedback.recommendation.status).toBe('ignored')
      expect(feedback.feedbackEvent.eventType).toBe('recommendation_ignored')

      const events = await listRecommendationEvents(USER_A, {
        recommendationId: result.recommendation.id,
      })
      const feedbackEvent = events.find((e) => e.eventType === 'recommendation_ignored')
      expect(feedbackEvent).toBeDefined()
    })

    it('userId isolation: user A cannot feedback user B recommendation', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'userId isolation 测试',
      })

      await expect(
        recordRecommendationFeedback({
          recommendationId: result.recommendation.id,
          userId: USER_B,
          feedbackType: 'accepted',
        }),
      ).rejects.toThrow(`User ${USER_B} does not own recommendation`)

      const recs = await listRecommendations(USER_A)
      expect(recs[0].status).toBe('generated')
    })

    it('fails for non-existent recommendationId', async () => {
      await expect(
        recordRecommendationFeedback({
          recommendationId: 'non_existent_rec_id',
          userId: USER_A,
          feedbackType: 'accepted',
        }),
      ).rejects.toThrow('Recommendation not found: non_existent_rec_id')
    })

    it('regression: createCaptureToDocumentFlow still generates landing recommendation + event', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'LC-004 regression 测试',
      })

      expect(result.recommendation.id).toBeTruthy()
      expect(result.recommendation.recommendationType).toBe('landing')
      expect(result.recommendation.status).toBe('generated')
      expect(result.recommendationEvent.eventType).toBe('recommendation_generated')

      const events = await listRecommendationEvents(USER_A, {
        recommendationId: result.recommendation.id,
      })
      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('recommendation_generated')
    })

    it('regression: empty content rejection does not generate recommendation', async () => {
      await expect(
        createCaptureToDocumentFlow({
          userId: USER_A,
          rawText: '',
        }),
      ).rejects.toThrow('rawText must not be empty')

      const recs = await listRecommendations(USER_A)
      expect(recs).toHaveLength(0)

      const events = await listRecommendationEvents(USER_A)
      expect(events).toHaveLength(0)
    })
  })

  describe('recommendation shown flow (LC-006)', () => {
    it('marks recommendation as shown: status update + event append', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'shown event 测试',
      })

      const shown = await markRecommendationShown({
        recommendationId: result.recommendation.id,
        userId: USER_A,
      })

      expect(shown.recommendation.status).toBe('shown')
      expect(shown.shownEvent.eventType).toBe('recommendation_shown')
      expect(shown.shownEvent.recommendationId).toBe(result.recommendation.id)

      const events = await listRecommendationEvents(USER_A, {
        recommendationId: result.recommendation.id,
      })
      expect(events).toHaveLength(2)
      const shownEvent = events.find((e) => e.eventType === 'recommendation_shown')
      expect(shownEvent).toBeDefined()
      expect(unwrap(shownEvent ?? null).recommendationId).toBe(result.recommendation.id)
      expect(unwrap(shownEvent ?? null).userId).toBe(USER_A)
    })

    it('records recommendation_shown as a user behavior signal', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'shown behavior signal 测试',
      })

      await markRecommendationShown({
        recommendationId: result.recommendation.id,
        userId: USER_A,
      })

      const behaviorEvents = await listUserBehaviorEvents(USER_A, {
        eventType: 'recommendation_shown',
      })
      expect(behaviorEvents).toHaveLength(1)
      expect(behaviorEvents[0].subjectType).toBe(result.recommendation.subjectType)
      expect(behaviorEvents[0].subjectId).toBe(String(result.recommendation.subjectId))

      const meta = behaviorEvents[0].metadata as Record<string, unknown>
      expect(meta.recommendationId).toBe(result.recommendation.id)
      expect(meta.recommendationType).toBe(result.recommendation.recommendationType)
      expect(meta.subjectType).toBe(result.recommendation.subjectType)
      expect(meta.subjectId).toBe(result.recommendation.subjectId)
      expect(meta.candidateType).toBe(result.recommendation.candidateType)
      expect(meta.candidateId).toBe(result.recommendation.candidateId)
      expect(meta.source).toBe('recommendation_shown')
    })

    it('shown event preserves userId', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'userId preserved 测试',
      })

      await markRecommendationShown({
        recommendationId: result.recommendation.id,
        userId: USER_A,
      })

      const events = await listRecommendationEvents(USER_A, {
        recommendationId: result.recommendation.id,
      })
      const shownEvent = events.find((e) => e.eventType === 'recommendation_shown')
      expect(unwrap(shownEvent ?? null).userId).toBe(USER_A)
    })

    it('userId isolation: user B cannot mark user A recommendation as shown', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'userId isolation shown 测试',
      })

      await expect(
        markRecommendationShown({
          recommendationId: result.recommendation.id,
          userId: USER_B,
        }),
      ).rejects.toThrow(`User ${USER_B} does not own recommendation`)

      const recs = await listRecommendations(USER_A)
      expect(recs[0].status).toBe('generated')
    })

    it('fails for non-existent recommendationId', async () => {
      await expect(
        markRecommendationShown({
          recommendationId: 'non_existent_rec_id',
          userId: USER_A,
        }),
      ).rejects.toThrow('Recommendation not found: non_existent_rec_id')
    })

    it('shown recommendation can still be accepted via feedback', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'shown → accepted 测试',
      })

      await markRecommendationShown({
        recommendationId: result.recommendation.id,
        userId: USER_A,
      })

      const feedback = await recordRecommendationFeedback({
        recommendationId: result.recommendation.id,
        userId: USER_A,
        feedbackType: 'accepted',
      })

      expect(feedback.recommendation.status).toBe('accepted')
      expect(feedback.feedbackEvent.eventType).toBe('recommendation_accepted')

      const events = await listRecommendationEvents(USER_A, {
        recommendationId: result.recommendation.id,
      })
      expect(events).toHaveLength(3)
    })

    it('shown recommendation can still be rejected via feedback', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'shown → rejected 测试',
      })

      await markRecommendationShown({
        recommendationId: result.recommendation.id,
        userId: USER_A,
      })

      const feedback = await recordRecommendationFeedback({
        recommendationId: result.recommendation.id,
        userId: USER_A,
        feedbackType: 'rejected',
      })

      expect(feedback.recommendation.status).toBe('rejected')
      expect(feedback.feedbackEvent.eventType).toBe('recommendation_rejected')
    })

    it('shown recommendation can still be modified via feedback', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'shown → modified 测试',
      })

      await markRecommendationShown({
        recommendationId: result.recommendation.id,
        userId: USER_A,
      })

      const feedback = await recordRecommendationFeedback({
        recommendationId: result.recommendation.id,
        userId: USER_A,
        feedbackType: 'modified',
      })

      expect(feedback.recommendation.status).toBe('modified')
      expect(feedback.feedbackEvent.eventType).toBe('recommendation_modified')
    })

    it('shown recommendation can still be ignored via feedback', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'shown → ignored 测试',
      })

      await markRecommendationShown({
        recommendationId: result.recommendation.id,
        userId: USER_A,
      })

      const feedback = await recordRecommendationFeedback({
        recommendationId: result.recommendation.id,
        userId: USER_A,
        feedbackType: 'ignored',
      })

      expect(feedback.recommendation.status).toBe('ignored')
      expect(feedback.feedbackEvent.eventType).toBe('recommendation_ignored')
    })

    it('regression: LC-004 createCaptureToDocumentFlow still generates landing recommendation', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'LC-004 regression shown 测试',
      })

      expect(result.recommendation.id).toBeTruthy()
      expect(result.recommendation.recommendationType).toBe('landing')
      expect(result.recommendation.status).toBe('generated')
      expect(result.recommendationEvent.eventType).toBe('recommendation_generated')
    })

    it('regression: LC-005 recordRecommendationFeedback still works', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'LC-005 regression shown 测试',
      })

      const feedback = await recordRecommendationFeedback({
        recommendationId: result.recommendation.id,
        userId: USER_A,
        feedbackType: 'accepted',
      })

      expect(feedback.recommendation.status).toBe('accepted')
      expect(feedback.feedbackEvent.eventType).toBe('recommendation_accepted')

      const events = await listRecommendationEvents(USER_A, {
        recommendationId: result.recommendation.id,
      })
      expect(events).toHaveLength(2)
    })

    it('regression: empty content rejection does not generate recommendation', async () => {
      await expect(
        createCaptureToDocumentFlow({
          userId: USER_A,
          rawText: '',
        }),
      ).rejects.toThrow('rawText must not be empty')

      const recs = await listRecommendations(USER_A)
      expect(recs).toHaveLength(0)

      const events = await listRecommendationEvents(USER_A)
      expect(events).toHaveLength(0)
    })
  })

  describe('recommendation event consistency (LC-007)', () => {
    it('rolls back generated recommendation when generated event write fails', async () => {
      vi.spyOn(recommendationEventsTable, 'add').mockRejectedValueOnce(new Error('event write failed'))

      await expect(
        createCaptureToDocumentFlow({
          userId: USER_A,
          rawText: 'generated consistency rollback 测试',
        }),
      ).rejects.toThrow('event write failed')

      const recs = await listRecommendations(USER_A)
      expect(recs).toHaveLength(0)

      const events = await listRecommendationEvents(USER_A)
      expect(events).toHaveLength(0)
    })

    it('does not append shown event when shown status update fails', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'shown status failure consistency 测试',
      })
      vi.spyOn(recommendationsTable, 'update').mockRejectedValueOnce(new Error('status update failed'))
      const eventAdd = vi.spyOn(recommendationEventsTable, 'add')

      await expect(
        markRecommendationShown({
          recommendationId: result.recommendation.id,
          userId: USER_A,
        }),
      ).rejects.toThrow('status update failed')

      expect(eventAdd).not.toHaveBeenCalled()

      const recs = await listRecommendations(USER_A)
      expect(recs[0].status).toBe('generated')

      const events = await listRecommendationEvents(USER_A, {
        recommendationId: result.recommendation.id,
      })
      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('recommendation_generated')
    })

    it('rolls back shown status update when shown event write fails', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'shown event failure consistency 测试',
      })
      vi.spyOn(recommendationEventsTable, 'add').mockRejectedValueOnce(new Error('shown event write failed'))

      await expect(
        markRecommendationShown({
          recommendationId: result.recommendation.id,
          userId: USER_A,
        }),
      ).rejects.toThrow('shown event write failed')

      const recs = await listRecommendations(USER_A)
      expect(recs[0].status).toBe('generated')

      const events = await listRecommendationEvents(USER_A, {
        recommendationId: result.recommendation.id,
      })
      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('recommendation_generated')
    })

    it('rolls back shown status and recommendation_event when behavior signal write fails', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'shown behavior failure consistency 测试',
      })
      vi.spyOn(userBehaviorEventsTable, 'add').mockRejectedValueOnce(new Error('behavior event write failed'))

      await expect(
        markRecommendationShown({
          recommendationId: result.recommendation.id,
          userId: USER_A,
        }),
      ).rejects.toThrow('behavior event write failed')

      const recs = await listRecommendations(USER_A)
      expect(recs[0].status).toBe('generated')

      const recommendationEvents = await listRecommendationEvents(USER_A, {
        recommendationId: result.recommendation.id,
      })
      expect(recommendationEvents).toHaveLength(1)
      expect(recommendationEvents[0].eventType).toBe('recommendation_generated')

      const behaviorEvents = await listUserBehaviorEvents(USER_A)
      expect(behaviorEvents).toHaveLength(0)
    })

    it.each(['accepted', 'rejected', 'modified', 'ignored'] as const)(
      'rolls back %s feedback status update when feedback event write fails',
      async (feedbackType) => {
        const result = await createCaptureToDocumentFlow({
          userId: USER_A,
          rawText: `${feedbackType} feedback event failure consistency 测试`,
        })
        vi.spyOn(recommendationEventsTable, 'add').mockRejectedValueOnce(new Error('feedback event write failed'))

        await expect(
          recordRecommendationFeedback({
            recommendationId: result.recommendation.id,
            userId: USER_A,
            feedbackType,
          }),
        ).rejects.toThrow('feedback event write failed')

        const recs = await listRecommendations(USER_A)
        expect(recs[0].status).toBe('generated')

        const events = await listRecommendationEvents(USER_A, {
          recommendationId: result.recommendation.id,
        })
        expect(events).toHaveLength(1)
        expect(events[0].eventType).toBe('recommendation_generated')
      },
    )

    it('does not append feedback event when feedback status update fails', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'feedback status failure consistency 测试',
      })
      vi.spyOn(recommendationsTable, 'update').mockRejectedValueOnce(new Error('feedback status update failed'))
      const eventAdd = vi.spyOn(recommendationEventsTable, 'add')

      await expect(
        recordRecommendationFeedback({
          recommendationId: result.recommendation.id,
          userId: USER_A,
          feedbackType: 'accepted',
        }),
      ).rejects.toThrow('feedback status update failed')

      expect(eventAdd).not.toHaveBeenCalled()

      const recs = await listRecommendations(USER_A)
      expect(recs[0].status).toBe('generated')

      const events = await listRecommendationEvents(USER_A, {
        recommendationId: result.recommendation.id,
      })
      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('recommendation_generated')
    })

    it('rolls back feedback status and recommendation_event when behavior signal write fails', async () => {
      const result = await createCaptureToDocumentFlow({
        userId: USER_A,
        rawText: 'feedback behavior failure consistency 测试',
      })
      vi.spyOn(userBehaviorEventsTable, 'add').mockRejectedValueOnce(new Error('behavior event write failed'))

      await expect(
        recordRecommendationFeedback({
          recommendationId: result.recommendation.id,
          userId: USER_A,
          feedbackType: 'accepted',
        }),
      ).rejects.toThrow('behavior event write failed')

      const recs = await listRecommendations(USER_A)
      expect(recs[0].status).toBe('generated')

      const recommendationEvents = await listRecommendationEvents(USER_A, {
        recommendationId: result.recommendation.id,
      })
      expect(recommendationEvents).toHaveLength(1)
      expect(recommendationEvents[0].eventType).toBe('recommendation_generated')

      const behaviorEvents = await listUserBehaviorEvents(USER_A)
      expect(behaviorEvents).toHaveLength(0)
    })

    it('regression: empty content rejection still does not generate recommendation or event', async () => {
      await expect(
        createCaptureToDocumentFlow({
          userId: USER_A,
          rawText: '   \n\t',
        }),
      ).rejects.toThrow('rawText must not be empty')

      const recs = await listRecommendations(USER_A)
      expect(recs).toHaveLength(0)

      const events = await listRecommendationEvents(USER_A)
      expect(events).toHaveLength(0)
    })
  })
})
