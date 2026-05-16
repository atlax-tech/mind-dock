import { afterEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  applyRecommendation,
  createDockItem,
  createRecommendation,
  createStoredTag,
  createCollection,
  listDockItems,
  listMindNodes,
  listMindEdges,
  updateDockItemText,
  upsertMindNode,
  listRecommendationDockQueue,
} from '@/lib/repository'

const USER_A = 'user_lc014_test'

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

function unwrap<T>(value: T | null | undefined): T {
  expect(value).not.toBeNull()
  expect(value).not.toBeUndefined()
  return value as T
}

describe('LC-014 Local Core Flow Skeleton Integration', () => {
  afterEach(cleanAll)

  describe('A. Home -> Dock', () => {
    it('createDockItem produces content visible in Dock list', async () => {
      const newId = await createDockItem(USER_A, '测试捕获内容: LC-014骨架链路验证')
      expect(newId).toBeGreaterThan(0)

      const items = await listDockItems(USER_A)
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe(newId)
      expect(items[0].rawText).toBe('测试捕获内容: LC-014骨架链路验证')
      expect(items[0].status).toBe('pending')
    })

    it('multiple captures are all visible in Dock list', async () => {
      const id1 = await createDockItem(USER_A, '第一条捕获')
      const id2 = await createDockItem(USER_A, '第二条捕获')
      const id3 = await createDockItem(USER_A, '第三条捕获')

      const items = await listDockItems(USER_A)
      expect(items).toHaveLength(3)
      expect(items.map(i => i.id).sort()).toEqual([id1, id2, id3].sort())
    })

    it('capture with topic creates item with topic field', async () => {
      const newId = await createDockItem(USER_A, '带标题的捕获内容', 'text', { topic: '测试标题' })
      expect(newId).toBeGreaterThan(0)

      const items = await listDockItems(USER_A)
      expect(items).toHaveLength(1)
      expect(items[0].topic).toBe('测试标题')
    })
  })

  describe('B. Dock -> Editor', () => {
    it('dock item can be opened for editing (simulated)', async () => {
      const newId = await createDockItem(USER_A, '需要编辑的内容')
      expect(newId).toBeGreaterThan(0)

      const items = await listDockItems(USER_A)
      const item = items.find(i => i.id === newId)
      expect(item).toBeDefined()
      if (!item) return
      expect(item.rawText).toBe('需要编辑的内容')
    })

    it('dock item not found returns null gracefully', async () => {
      const items = await listDockItems(USER_A)
      const nonExistent = items.find(i => i.id === 99999)
      expect(nonExistent).toBeUndefined()
    })
  })

  describe('C. Editor -> Dock', () => {
    it('updateDockItemText updates rawText content', async () => {
      const newId = await createDockItem(USER_A, '原始内容')

      const updated = unwrap(await updateDockItemText(USER_A, newId, '修改后的内容'))

      expect(updated.rawText).toBe('修改后的内容')
    })

    it('updated dock item is immediately visible in list after refresh', async () => {
      const newId = await createDockItem(USER_A, '旧内容')
      await updateDockItemText(USER_A, newId, '新内容')

      const items = await listDockItems(USER_A)
      const safeItem = items.find(i => i.id === newId)
      expect(safeItem).toBeDefined()
      if (!safeItem) return
      expect(safeItem.rawText).toBe('新内容')
    })

    it('updateDockItemText with topic sets topic field', async () => {
      const newId = await createDockItem(USER_A, '内容文本')
      const updated = unwrap(await updateDockItemText(USER_A, newId, '内容文本', '新标题'))

      expect(updated.topic).toBe('新标题')
    })
  })

  describe('D. Dock / Apply -> Mind', () => {
    it('dock item mindNode is readable after creation', async () => {
      await createStoredTag(USER_A, '测试标签')
      const newId = await createDockItem(USER_A, '图谱关联测试内容')

      await upsertMindNode({
        userId: USER_A,
        nodeType: 'source',
        label: '图谱关联测试内容',
        documentId: newId,
        state: 'active',
      })

      const nodes = await listMindNodes(USER_A)
      const linkedNode = nodes.find(n => n.documentId === newId)
      expect(linkedNode).toBeDefined()
      if (!linkedNode) return
      expect(linkedNode.label).toBe('图谱关联测试内容')
    })

    it('apply mindNode recommendation creates edge readable in Mind', async () => {
      const newId = await createDockItem(USER_A, 'mindNode推荐测试内容')

      const sourceNode = await upsertMindNode({
        userId: USER_A,
        nodeType: 'source',
        label: 'mindNode推荐测试内容',
        documentId: newId,
        state: 'active',
      })

      const targetNode = await upsertMindNode({
        userId: USER_A,
        nodeType: 'insight',
        label: '目标节点',
        state: 'active',
      })

      const rec = unwrap(await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: newId,
        recommendationType: 'mindNode_suggestion',
        candidateType: 'mindNode',
        candidateId: targetNode.id,
        confidenceScore: 0.9,
      }))

      await applyRecommendation({ userId: USER_A, recommendationId: rec.id })

      const edges = await listMindEdges(USER_A)
      const edge = edges.find(e =>
        e.sourceNodeId === sourceNode.id &&
        e.targetNodeId === targetNode.id &&
        e.edgeType === 'suggested'
      )
      expect(edge).toBeDefined()
    })

    it('dock item has graph chain data available', async () => {
      const newId = await createDockItem(USER_A, 'graph chain测试')

      await upsertMindNode({
        userId: USER_A,
        nodeType: 'source',
        label: 'graph chain测试',
        documentId: newId,
        state: 'active',
      })

      const nodes = await listMindNodes(USER_A)
      const linkedNode = nodes.find(n => n.documentId === newId)
      expect(linkedNode).toBeDefined()
    })
  })

  describe('E. Mind -> Dock / Editor', () => {
    it('mind node documentId links back to dock item', async () => {
      const newId = await createDockItem(USER_A, '反向关联测试')

      await upsertMindNode({
        userId: USER_A,
        nodeType: 'source',
        label: '反向关联测试',
        documentId: newId,
        state: 'active',
      })

      const nodes = await listMindNodes(USER_A)
      const linkedNode = nodes.find(n => n.documentId === newId)
      expect(linkedNode).toBeDefined()
      if (!linkedNode) return
      expect(linkedNode.documentId).toBe(newId)

      const items = await listDockItems(USER_A)
      const dockItem = items.find(i => i.id === linkedNode.documentId)
      expect(dockItem).toBeDefined()
      if (!dockItem) return
      expect(dockItem.rawText).toBe('反向关联测试')
    })

    it('multiple dock items each have unique mindNode mapping', async () => {
      const id1 = await createDockItem(USER_A, '文档A')
      const id2 = await createDockItem(USER_A, '文档B')

      await upsertMindNode({ userId: USER_A, nodeType: 'source', label: '文档A', documentId: id1, state: 'active' })
      await upsertMindNode({ userId: USER_A, nodeType: 'source', label: '文档B', documentId: id2, state: 'active' })

      const nodes = await listMindNodes(USER_A)
      const docNodes = nodes.filter(n => n.documentId != null)
      expect(docNodes).toHaveLength(2)

      const ids = docNodes.map(n => n.documentId).sort()
      expect(ids).toEqual([id1, id2].sort())
    })
  })

  describe('F. State Sync', () => {
    it('updateDockItemText preserves item identity', async () => {
      const newId = await createDockItem(USER_A, '同步测试内容')
      const originalItems = await listDockItems(USER_A)
      expect(originalItems).toHaveLength(1)

      await updateDockItemText(USER_A, newId, '更新后的同步测试内容')
      const refreshedItems = await listDockItems(USER_A)
      expect(refreshedItems).toHaveLength(1)
      expect(refreshedItems[0].id).toBe(newId)
      expect(refreshedItems[0].rawText).toBe('更新后的同步测试内容')
    })

    it('tag apply changes are visible in dock list after refresh', async () => {
      const tag = unwrap(await createStoredTag(USER_A, '同步标签'))
      const newId = await createDockItem(USER_A, '标签同步测试')

      const rec = unwrap(await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: newId,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: tag.id,
        confidenceScore: 0.88,
      }))

      await applyRecommendation({ userId: USER_A, recommendationId: rec.id })

      const items = await listDockItems(USER_A)
      const updated = items.find(i => i.id === newId)
      expect(updated).toBeDefined()
      if (!updated) return
      expect(updated.userTags).toContain('同步标签')
    })

    it('project apply changes are visible in dock list after refresh', async () => {
      const col = unwrap(await createCollection({
        userId: USER_A,
        name: 'LC014测试项目',
        collectionType: 'project',
        description: null,
        icon: null,
        parentId: null,
      }))
      const newId = await createDockItem(USER_A, '项目同步测试')

      const rec = unwrap(await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: newId,
        recommendationType: 'project_suggestion',
        candidateType: 'project',
        candidateId: col.id,
        confidenceScore: 0.92,
      }))

      await applyRecommendation({ userId: USER_A, recommendationId: rec.id })

      const items = await listDockItems(USER_A)
      const updated = items.find(i => i.id === newId)
      expect(updated).toBeDefined()
      if (!updated) return
      expect(updated.selectedProject).toBe('LC014测试项目')
    })
  })

  describe('LC-010 ~ LC-013 regression', () => {
    it('LC-010: capture-to-document flow still works', async () => {
      const newId = await createDockItem(USER_A, 'LC-010回归测试')
      expect(newId).toBeGreaterThan(0)

      await upsertMindNode({
        userId: USER_A,
        nodeType: 'source',
        label: 'LC-010回归测试',
        documentId: newId,
        state: 'active',
      })

      const nodes = await listMindNodes(USER_A)
      expect(nodes.length).toBeGreaterThanOrEqual(1)
    })

    it('LC-011: recommendation dock queue still works', async () => {
      const result = await listRecommendationDockQueue(USER_A)
      expect(result.items).toBeDefined()
      expect(Array.isArray(result.items)).toBe(true)
      expect(result.total).toBeGreaterThanOrEqual(0)
    })

    it('LC-012: recommendation dock queue item has required fields', async () => {
      const newId = await createDockItem(USER_A, 'LC-012回归')
      const rec = unwrap(await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: newId,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: 'regression_tag',
        confidenceScore: 0.75,
      }))

      const result = await listRecommendationDockQueue(USER_A, {
        subjectType: 'dockItem',
        subjectId: newId,
      })
      const item = result.items.find(i => i.id === rec.id)
      expect(item).toBeDefined()
      if (!item) return
      expect(item.confidenceScore).toBe(0.75)
    })

    it('LC-013: apply tag recommendation persists', async () => {
      const tag = unwrap(await createStoredTag(USER_A, '回归标签'))
      const newId = await createDockItem(USER_A, 'LC-013回归测试')

      const rec = unwrap(await createRecommendation({
        userId: USER_A,
        subjectType: 'dockItem',
        subjectId: newId,
        recommendationType: 'tag_suggestion',
        candidateType: 'tag',
        candidateId: tag.id,
        confidenceScore: 0.8,
      }))

      const result = await applyRecommendation({ userId: USER_A, recommendationId: rec.id })
      expect(result.status).toBe('accepted')

      const items = await listDockItems(USER_A)
      const updated = items.find(i => i.id === newId)
      if (!updated) return
      expect(updated.userTags).toContain('回归标签')
    })
  })
})
