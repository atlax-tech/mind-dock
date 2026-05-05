import { afterEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  applyRecommendation,
  createCollection,
  createDockItem,
  createRecommendation,
  createStoredTag,
  generateRecommendationsForContext,
  listRecommendationDockQueue,
  recordRecommendationFeedback,
  listRecommendationEvents,
  upsertMindNode,
} from '@/lib/repository'
import {
  describeRecommendationAction,
  describeRecommendationReason,
  describeApplyResult,
  describeApplyPreview,
  formatConfidenceLevel,
  isSupportedCandidateType,
  isRecommendationResolved,
  isRecommendationPending,
  CANDIDATE_TYPE_LABELS,
  STATUS_LABELS,
} from '@/lib/recommendation-i18n'

const USER_A = 'user_lc015_test'

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

describe('LC-015 Recommendation Loop Guardrail & Closeout Pack', () => {
  afterEach(cleanAll)

  describe('A. 推荐卡片最小产品化 - 用户语言映射', () => {
    it('recommendationType/candidateType 映射为用户语言，不展示 raw algorithm language', () => {
      expect(describeRecommendationAction('tag', 'tag_123')).toContain('建议添加标签')
      expect(describeRecommendationAction('project', 'proj_456')).toContain('建议加入项目')
      expect(describeRecommendationAction('mindNode', 'node_789')).toContain('建议建立关联')
      expect(describeRecommendationAction('entry', 'entry_001')).toContain('建议关联条目')
      expect(describeRecommendationAction('document', 'doc_002')).toContain('建议关联文档')
    })

    it('推荐原因映射为用户语言', () => {
      const reason = describeRecommendationReason('tag', { reason: 'raw algorithm reason' })
      expect(reason).not.toContain('recall')
      expect(reason).not.toContain('signals')
      expect(reason).not.toContain('final')
      expect(reason).not.toContain('rank')
    })

    it('推荐原因基于 evidence 映射', () => {
      const reason = describeRecommendationReason(
        'tag',
        { reason: 'raw' },
        { evidenceCount: 2, matchedValues: ['react', 'frontend'] },
      )
      expect(reason).toContain('内容匹配')
    })

    it('apply preview 映射为用户语言', () => {
      expect(describeApplyPreview('tag', 'tag_123')).toContain('添加标签')
      expect(describeApplyPreview('project', 'proj_456')).toContain('替换当前项目')
      expect(describeApplyPreview('mindNode', 'node_789')).toContain('知识图谱')
      expect(describeApplyPreview('entry', 'entry_001')).toContain('暂不支持自动应用')
      expect(describeApplyPreview('document', 'doc_002')).toContain('暂不支持自动应用')
    })

    it('apply result 映射为用户语言', () => {
      expect(describeApplyResult('tag', 'tag_123')).toContain('已添加标签')
      expect(describeApplyResult('project', 'proj_456')).toContain('已加入项目')
      expect(describeApplyResult('mindNode', 'node_789')).toContain('已建立关联')
    })

    it('apply result 优先使用 changeDetail', () => {
      expect(describeApplyResult('tag', 'tag_123', '自定义变更描述')).toBe('自定义变更描述')
    })

    it('confidence level 映射', () => {
      expect(formatConfidenceLevel(0.9)).toBe('较高')
      expect(formatConfidenceLevel(0.8)).toBe('较高')
      expect(formatConfidenceLevel(0.6)).toBe('一般')
      expect(formatConfidenceLevel(0.5)).toBe('一般')
      expect(formatConfidenceLevel(0.3)).toBe('较低')
    })

    it('candidateType 标签映射', () => {
      expect(CANDIDATE_TYPE_LABELS.tag).toBe('标签')
      expect(CANDIDATE_TYPE_LABELS.project).toBe('项目')
      expect(CANDIDATE_TYPE_LABELS.mindNode).toBe('知识节点')
      expect(CANDIDATE_TYPE_LABELS.entry).toBe('条目')
      expect(CANDIDATE_TYPE_LABELS.document).toBe('文档')
    })

    it('status 标签映射包含 superseded', () => {
      expect(STATUS_LABELS.superseded).toBeDefined()
      expect(STATUS_LABELS.superseded.label).toBe('已过期')
    })

    it('isSupportedCandidateType 区分 supported 和 unsupported', () => {
      expect(isSupportedCandidateType('tag')).toBe(true)
      expect(isSupportedCandidateType('project')).toBe(true)
      expect(isSupportedCandidateType('mindNode')).toBe(true)
      expect(isSupportedCandidateType('entry')).toBe(false)
      expect(isSupportedCandidateType('document')).toBe(false)
    })

    it('isRecommendationResolved 包含 superseded', () => {
      expect(isRecommendationResolved('accepted')).toBe(true)
      expect(isRecommendationResolved('rejected')).toBe(true)
      expect(isRecommendationResolved('ignored')).toBe(true)
      expect(isRecommendationResolved('superseded')).toBe(true)
      expect(isRecommendationResolved('generated')).toBe(false)
      expect(isRecommendationResolved('shown')).toBe(false)
    })

    it('isRecommendationPending 只包含 generated 和 shown', () => {
      expect(isRecommendationPending('generated')).toBe(true)
      expect(isRecommendationPending('shown')).toBe(true)
      expect(isRecommendationPending('accepted')).toBe(false)
      expect(isRecommendationPending('rejected')).toBe(false)
      expect(isRecommendationPending('ignored')).toBe(false)
      expect(isRecommendationPending('superseded')).toBe(false)
    })
  })

  describe('B. Apply 可见结果', () => {
    it('accept/apply 后返回 applied result summary', async () => {
      const itemId = await createDockItem(USER_A, 'Apply result test frontend')
      await createStoredTag(USER_A, 'frontend')

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

      const tagRec = queue.items.find((i) => i.candidateType === 'tag')
      if (tagRec) {
        const result = await applyRecommendation({ userId: USER_A, recommendationId: tagRec.id })
        expect(result.appliedChanges).toBeDefined()
        expect(result.appliedChanges.changeType).toBe('add_tag')
        expect(result.appliedChanges.changeDetail).toBeTruthy()
      }
    })

    it('tag apply 后 tags relation 不重复创建', async () => {
      const itemId = await createDockItem(USER_A, 'Dedup tag test frontend')
      await createStoredTag(USER_A, 'dedup')

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

      if (queue.items.length > 0) {
        await applyRecommendation({ userId: USER_A, recommendationId: queue.items[0].id })

        const dockItems = await db.table('dockItems').where('userId').equals(USER_A).toArray()
        const item = dockItems.find((d) => d.id === itemId)
        if (item) {
          const tagCount = item.userTags.filter((t: string) => t.toLowerCase() === 'dedup').length
          expect(tagCount).toBeLessThanOrEqual(1)
        }
      }
    })

    it('mindNode/link apply 后 relation/edge 不重复创建', async () => {
      const itemId = await createDockItem(USER_A, 'MindNode dedup test')
      await createStoredTag(USER_A, 'mindnode')

      await upsertMindNode({
        userId: USER_A,
        nodeType: 'document',
        label: 'Source Node',
        documentId: itemId,
      })
      const targetNode = await upsertMindNode({
        userId: USER_A,
        nodeType: 'topic',
        label: 'Target Topic',
      })

      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
        recommendationType: 'mindNode_suggestion',
        candidateType: 'mindNode',
        candidateId: targetNode.id,
        confidenceScore: 0.8,
      })

      await applyRecommendation({ userId: USER_A, recommendationId: rec.id })
      await applyRecommendation({ userId: USER_A, recommendationId: rec.id })

      const edges = await db.table('mindEdges')
        .where('userId')
        .equals(USER_A)
        .and((e: { sourceNodeId: string; targetNodeId: string; edgeType: string }) =>
          e.edgeType === 'suggested' && e.targetNodeId === targetNode.id,
        )
        .toArray()
      expect(edges.length).toBe(1)
    })

    it('project apply 检测替换并返回 replace_project changeType', async () => {
      const itemId = await createDockItem(USER_A, 'Project replace test')
      await db.table('dockItems').update(itemId, { selectedProject: 'Old Project' })
      await createCollection({ userId: USER_A, name: 'New Project', collectionType: 'project' })

      const collection = await db.table('collections').where('userId').equals(USER_A).first()
      if (!collection) return

      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
        recommendationType: 'project_suggestion',
        candidateType: 'project',
        candidateId: collection.id as string,
        confidenceScore: 0.8,
      })

      const result = await applyRecommendation({ userId: USER_A, recommendationId: rec.id })
      expect(result.appliedChanges.changeType).toBe('replace_project')
      expect(result.appliedChanges.changeDetail).toContain('Replaced')
    })
  })

  describe('C. Unsupported 行为', () => {
    it('unsupported recommendation 不允许 accepted', async () => {
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
      ).rejects.toThrow(/not supported for automatic apply/)

      const updated = await db.table('recommendations').get(rec.id)
      expect(updated).toBeDefined()
      if (updated) {
        expect(updated.status).not.toBe('accepted')
      }
    })

    it('unsupported recommendation 不能通过 recordRecommendationFeedback accepted', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'entry_candidate',
        candidateType: 'entry',
        candidateId: 'entry_456',
        confidenceScore: 0.8,
      })

      await expect(
        recordRecommendationFeedback({
          userId: USER_A,
          recommendationId: rec.id,
          feedbackType: 'accepted',
        }),
      ).rejects.toThrow()
    })
  })

  describe('D. 状态机 guardrail', () => {
    it('accepted recommendation 重复 apply 幂等', async () => {
      const itemId = await createDockItem(USER_A, 'Idempotent apply test frontend')
      await createStoredTag(USER_A, 'idempotent')

      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const queue = await listRecommendationDockQueue(USER_A, {
        subjectType: 'dockItem',
        subjectId: itemId,
      })
      if (queue.items.length === 0) return

      const first = await applyRecommendation({ userId: USER_A, recommendationId: queue.items[0].id })
      expect(first.status).toBe('accepted')
      expect(first.appliedChanges).toBeDefined()

      const second = await applyRecommendation({ userId: USER_A, recommendationId: queue.items[0].id })
      expect(second.status).toBe('accepted')
      expect(second.appliedChanges).toBeDefined()
    })

    it('rejected recommendation 不能被当前轮重新 accepted', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_rejected',
        confidenceScore: 0.8,
      })

      await recordRecommendationFeedback({
        userId: USER_A,
        recommendationId: rec.id,
        feedbackType: 'rejected',
      })

      await expect(
        applyRecommendation({ userId: USER_A, recommendationId: rec.id }),
      ).rejects.toThrow(/Rejected or superseded/)

      await expect(
        recordRecommendationFeedback({
          userId: USER_A,
          recommendationId: rec.id,
          feedbackType: 'accepted',
        }),
      ).rejects.toThrow(/Cannot accept a rejected/)
    })

    it('ignored 与 rejected 事件语义区分', async () => {
      const recIgnored = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_ignored_semantic',
        confidenceScore: 0.8,
      })
      const recRejected = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 2,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_rejected_semantic',
        confidenceScore: 0.7,
      })

      await recordRecommendationFeedback({
        userId: USER_A,
        recommendationId: recIgnored.id,
        feedbackType: 'ignored',
      })
      await recordRecommendationFeedback({
        userId: USER_A,
        recommendationId: recRejected.id,
        feedbackType: 'rejected',
      })

      const ignoredEvents = await listRecommendationEvents(USER_A, { recommendationId: recIgnored.id })
      const rejectedEvents = await listRecommendationEvents(USER_A, { recommendationId: recRejected.id })

      const ignoredEvent = ignoredEvents.find((e) => e.eventType === 'recommendation_ignored')
      const rejectedEvent = rejectedEvents.find((e) => e.eventType === 'recommendation_rejected')

      expect(ignoredEvent).toBeDefined()
      expect(rejectedEvent).toBeDefined()
      expect(ignoredEvent?.eventType).not.toBe(rejectedEvent?.eventType)

      const ignoredRec = await db.table('recommendations').get(recIgnored.id)
      const rejectedRec = await db.table('recommendations').get(recRejected.id)
      expect(ignoredRec?.status).toBe('ignored')
      expect(rejectedRec?.status).toBe('rejected')
    })

    it('ignored recommendation 不能直接 accepted', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_ignored_no_accept',
        confidenceScore: 0.8,
      })

      await recordRecommendationFeedback({
        userId: USER_A,
        recommendationId: rec.id,
        feedbackType: 'ignored',
      })

      await expect(
        recordRecommendationFeedback({
          userId: USER_A,
          recommendationId: rec.id,
          feedbackType: 'accepted',
        }),
      ).rejects.toThrow(/Cannot accept an ignored/)
    })

    it('重新生成建议后旧 generated/shown 不继续出现在 pending 主列表', async () => {
      const itemId = await createDockItem(USER_A, 'Superseded test frontend')
      await createStoredTag(USER_A, 'superseded')

      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const firstQueue = await listRecommendationDockQueue(USER_A, {
        subjectType: 'dockItem',
        subjectId: itemId,
      })
      const firstPendingCount = firstQueue.items.filter((i) => i.status === 'generated' || i.status === 'shown').length
      expect(firstPendingCount).toBeGreaterThan(0)

      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const secondQueue = await listRecommendationDockQueue(USER_A, {
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const supersededItems = secondQueue.items.filter((i) => i.status === 'superseded')
      expect(supersededItems.length).toBeGreaterThan(0)

      const pendingItems = secondQueue.items.filter((i) => i.status === 'generated' || i.status === 'shown')
      for (const item of supersededItems) {
        expect(pendingItems.find((p) => p.id === item.id)).toBeUndefined()
      }
    })

    it('同一 subject + type + candidate 不产生多个 active pending recommendations', async () => {
      const itemId = await createDockItem(USER_A, 'Uniqueness test frontend')
      await createStoredTag(USER_A, 'unique')

      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
      })
      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const queue = await listRecommendationDockQueue(USER_A, {
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const pendingItems = queue.items.filter((i) => i.status === 'generated' || i.status === 'shown')
      const candidateKeys = pendingItems.map((i) => `${i.candidateType}:${i.candidateId}`)
      const uniqueKeys = new Set(candidateKeys)
      expect(candidateKeys.length).toBe(uniqueKeys.size)
    })

    it('accepted/rejected 历史不被新生成覆盖', async () => {
      const itemId = await createDockItem(USER_A, 'History preserve test frontend')
      await createStoredTag(USER_A, 'history')

      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const firstQueue = await listRecommendationDockQueue(USER_A, {
        subjectType: 'dockItem',
        subjectId: itemId,
      })
      if (firstQueue.items.length === 0) return

      await recordRecommendationFeedback({
        userId: USER_A,
        recommendationId: firstQueue.items[0].id,
        feedbackType: 'rejected',
      })

      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const rejectedItem = await db.table('recommendations').get(firstQueue.items[0].id)
      expect(rejectedItem?.status).toBe('rejected')
    })

    it('superseded recommendation 写入 recommendation_superseded 事件', async () => {
      const itemId = await createDockItem(USER_A, 'Superseded event test')
      await createStoredTag(USER_A, 'superseded_event')

      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const firstQueue = await listRecommendationDockQueue(USER_A, {
        subjectType: 'dockItem',
        subjectId: itemId,
      })
      if (firstQueue.items.length === 0) return

      const oldRecId = firstQueue.items[0].id

      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const events = await listRecommendationEvents(USER_A, { recommendationId: oldRecId })
      const supersededEvent = events.find((e) => e.eventType === 'recommendation_superseded')
      expect(supersededEvent).toBeDefined()
    })
  })

  describe('E. 多建议冲突最小处理', () => {
    it('tag 建议可叠加且幂等', async () => {
      const itemId = await createDockItem(USER_A, 'Tag stackable test frontend')
      await createStoredTag(USER_A, 'stackable')

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

      if (queue.items.length > 0) {
        const result = await applyRecommendation({ userId: USER_A, recommendationId: queue.items[0].id })
        expect(result.status).toBe('accepted')

        const idempotent = await applyRecommendation({ userId: USER_A, recommendationId: queue.items[0].id })
        expect(idempotent.status).toBe('accepted')
        expect(idempotent.appliedChanges).toBeDefined()
      }
    })

    it('reject 一条建议不删除已接受的其他建议结果', async () => {
      const itemId = await createDockItem(USER_A, 'Reject isolation test frontend react')
      await createStoredTag(USER_A, 'react')
      await createCollection({ userId: USER_A, name: 'React Project', collectionType: 'project' })

      await generateRecommendationsForContext({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const queue = await listRecommendationDockQueue(USER_A, {
        subjectType: 'dockItem',
        subjectId: itemId,
      })

      const tagRec = queue.items.find((i) => i.candidateType === 'tag')
      const projectRec = queue.items.find((i) => i.candidateType === 'project')

      if (tagRec) {
        await applyRecommendation({ userId: USER_A, recommendationId: tagRec.id })
      }
      if (projectRec) {
        await recordRecommendationFeedback({
          userId: USER_A,
          recommendationId: projectRec.id,
          feedbackType: 'rejected',
        })
      }

      if (tagRec) {
        const acceptedRec = await db.table('recommendations').get(tagRec.id)
        expect(acceptedRec?.status).toBe('accepted')
      }
    })

    it('ignore 一条建议不污染 reject 信号', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_ignore_no_pollute',
        confidenceScore: 0.8,
      })

      await recordRecommendationFeedback({
        userId: USER_A,
        recommendationId: rec.id,
        feedbackType: 'ignored',
      })

      const events = await listRecommendationEvents(USER_A, { recommendationId: rec.id })
      const ignoredEvent = events.find((e) => e.eventType === 'recommendation_ignored')
      const rejectedEvent = events.find((e) => e.eventType === 'recommendation_rejected')

      expect(ignoredEvent).toBeDefined()
      expect(rejectedEvent).toBeUndefined()
    })
  })

  describe('F. Apply 失败不写 accepted feedback', () => {
    it('applyRecommendation 失败不更新 status 为 accepted', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 99999,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_nonexistent',
        confidenceScore: 0.8,
      })

      await expect(
        applyRecommendation({ userId: USER_A, recommendationId: rec.id }),
      ).rejects.toThrow()

      const updated = await db.table('recommendations').get(rec.id)
      expect(updated).toBeDefined()
      if (updated) {
        expect(updated.status).not.toBe('accepted')
      }
    })

    it('applyRecommendation 失败后 recordRecommendationFeedback accepted 仍然被状态机阻止', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 99999,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_apply_fail_guard',
        confidenceScore: 0.8,
      })

      await expect(
        applyRecommendation({ userId: USER_A, recommendationId: rec.id }),
      ).rejects.toThrow()

      const afterFailedApply = await db.table('recommendations').get(rec.id)
      expect(afterFailedApply?.status).toBe('generated')

      await recordRecommendationFeedback({
        userId: USER_A,
        recommendationId: rec.id,
        feedbackType: 'rejected',
      })

      const afterReject = await db.table('recommendations').get(rec.id)
      expect(afterReject?.status).toBe('rejected')

      await expect(
        recordRecommendationFeedback({
          userId: USER_A,
          recommendationId: rec.id,
          feedbackType: 'accepted',
        }),
      ).rejects.toThrow(/Cannot accept a rejected/)
    })

    it('applyRecommendation 失败不写入 accepted 事件', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 99999,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_no_accepted_event',
        confidenceScore: 0.8,
      })

      try {
        await applyRecommendation({ userId: USER_A, recommendationId: rec.id })
      } catch {
        // expected to fail
      }

      const events = await listRecommendationEvents(USER_A, { recommendationId: rec.id })
      const acceptedEvent = events.find((e) => e.eventType === 'recommendation_accepted')
      expect(acceptedEvent).toBeUndefined()
    })

    it('unsupported 类型 apply 失败后 rejected feedback 正常写入', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 1,
        recommendationType: 'entry_candidate',
        candidateType: 'entry',
        candidateId: 'entry_rejected_after_unsupported',
        confidenceScore: 0.8,
      })

      await expect(
        applyRecommendation({ userId: USER_A, recommendationId: rec.id }),
      ).rejects.toThrow(/not supported/)

      await recordRecommendationFeedback({
        userId: USER_A,
        recommendationId: rec.id,
        feedbackType: 'rejected',
      })

      const updated = await db.table('recommendations').get(rec.id)
      expect(updated?.status).toBe('rejected')

      const events = await listRecommendationEvents(USER_A, { recommendationId: rec.id })
      const rejectedEvent = events.find((e) => e.eventType === 'recommendation_rejected')
      expect(rejectedEvent).toBeDefined()
    })
  })

  describe('G. Apply 成功返回 summary 被消费', () => {
    it('applyRecommendation 成功返回 appliedChanges summary string', async () => {
      const itemId = await createDockItem(USER_A, 'Summary consumption test frontend')
      await createStoredTag(USER_A, 'summary_test')

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

      if (queue.items.length > 0) {
        const result = await applyRecommendation({ userId: USER_A, recommendationId: queue.items[0].id })
        expect(result.status).toBe('accepted')
        expect(result.appliedChanges).toBeDefined()
        expect(result.appliedChanges.changeDetail).toBeTruthy()
        expect(typeof result.appliedChanges.changeDetail).toBe('string')
      }
    })

    it('handleApplyRecommendation 模拟：成功时返回 summary string', async () => {
      const itemId = await createDockItem(USER_A, 'Handler summary test frontend')
      await createStoredTag(USER_A, 'handler_summary')

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

      if (queue.items.length > 0) {
        const recId = queue.items[0].id
        const result = await applyRecommendation({ userId: USER_A, recommendationId: recId })
        const summary = result.appliedChanges
          ? describeApplyResult(result.appliedChanges.candidateType, result.appliedChanges.candidateId, result.appliedChanges.changeDetail)
          : undefined
        expect(summary).toBeDefined()
        expect(typeof summary).toBe('string')
        expect((summary as string).length).toBeGreaterThan(0)
      }
    })

    it('handleApplyRecommendation 模拟：失败时 throw 不返回 summary', async () => {
      const rec = await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: 99999,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'tag_fail_no_summary',
        confidenceScore: 0.8,
      })

      await expect(
        applyRecommendation({ userId: USER_A, recommendationId: rec.id }),
      ).rejects.toThrow()

      const afterFailedApply = await db.table('recommendations').get(rec.id)
      expect(afterFailedApply?.status).not.toBe('accepted')
    })

    it('scoped Dock 模拟：onApplyRecommendation then/catch 消费 summary', async () => {
      const itemId = await createDockItem(USER_A, 'Scoped summary test frontend')
      await createStoredTag(USER_A, 'scoped_summary')

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

      if (queue.items.length > 0) {
        const recId = queue.items[0].id
        let toastMessage: string | undefined

        const onApplyRecommendation = async (id: string): Promise<string | void> => {
          try {
            const result = await applyRecommendation({ userId: USER_A, recommendationId: id })
            if (result.appliedChanges) {
              return describeApplyResult(result.appliedChanges.candidateType, result.appliedChanges.candidateId, result.appliedChanges.changeDetail)
            }
          } catch {
            throw new Error('apply failed')
          }
        }

        await onApplyRecommendation(recId).then((summary) => {
          if (summary) toastMessage = summary
        }).catch(() => {
          toastMessage = '建议应用失败'
        })

        expect(toastMessage).toBeDefined()
        expect(toastMessage).not.toBe('建议应用失败')
        expect((toastMessage as string).length).toBeGreaterThan(0)
      }
    })
  })
})
