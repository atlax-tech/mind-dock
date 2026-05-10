import { afterEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  createDraft,
  listDrafts,
  getDraft,
  updateDraft,
  publishDraftToDocument,
  discardDraft,
  findActiveDraftBySourceEntryId,
  findMindNodeByDocumentId,
  findMindNodeBySourceType,
  upsertMindNode,
  checkDocumentNameConflict,
  upsertMindEdge,
} from '@/lib/repository'

const USER_A = 'user_draft_test_a'
const USER_B = 'user_draft_test_b'

async function cleanAll() {
  await db.table('editorDrafts').clear()
  await db.table('entries').clear()
  await db.table('mindNodes').clear()
  await db.table('mindEdges').clear()
}

function unwrap<T>(value: T | null): T {
  expect(value).not.toBeNull()
  return value as T
}

describe('draft repository', () => {
  afterEach(cleanAll)

  describe('createDraft & listDrafts', () => {
    it('creates a draft and lists it', async () => {
      const draft = unwrap(await createDraft(USER_A, '测试标题', '测试内容'))
      expect(draft.title).toBe('测试标题')
      expect(draft.content).toBe('测试内容')
      expect(draft.status).toBe('active')
      expect(draft.draftKey).toBe(draft.id)

      const drafts = await listDrafts(USER_A)
      expect(drafts).toHaveLength(1)
      expect(drafts[0].id).toBe(draft.id)
    })

    it('creates a draft with default empty values', async () => {
      const draft = unwrap(await createDraft(USER_A))
      expect(draft.title).toBe('')
      expect(draft.content).toBe('')
    })

    it('creates a draft with sourceEntryId and sourceType', async () => {
      const draft = unwrap(await createDraft(USER_A, '来源草稿', '内容', 42, 'entry'))
      expect(draft.sourceEntryId).toBe(42)
      expect(draft.sourceType).toBe('entry')
    })

    it('creates a draft without sourceEntryId by default', async () => {
      const draft = unwrap(await createDraft(USER_A, '普通草稿'))
      expect(draft.sourceEntryId).toBeNull()
      expect(draft.sourceType).toBeNull()
    })

    it('isolates drafts between users', async () => {
      await createDraft(USER_A, 'A的草稿')
      await createDraft(USER_B, 'B的草稿')

      const draftsA = await listDrafts(USER_A)
      const draftsB = await listDrafts(USER_B)
      expect(draftsA).toHaveLength(1)
      expect(draftsB).toHaveLength(1)
      expect(draftsA[0].title).toBe('A的草稿')
    })

    it('only lists active drafts', async () => {
      const d1 = unwrap(await createDraft(USER_A, '活跃草稿'))
      const d2 = unwrap(await createDraft(USER_A, '待发布'))

      await publishDraftToDocument(USER_A, d2.id)

      const drafts = await listDrafts(USER_A)
      expect(drafts).toHaveLength(1)
      expect(drafts[0].id).toBe(d1.id)
    })
  })

  describe('getDraft', () => {
    it('returns draft by id', async () => {
      const created = unwrap(await createDraft(USER_A, '查找测试'))
      const found = unwrap(await getDraft(USER_A, created.id))
      expect(found.title).toBe('查找测试')
    })

    it('returns null for wrong user', async () => {
      const created = unwrap(await createDraft(USER_A, 'A的草稿'))
      const found = await getDraft(USER_B, created.id)
      expect(found).toBeNull()
    })
  })

  describe('updateDraft', () => {
    it('updates title and content', async () => {
      const created = unwrap(await createDraft(USER_A, '旧标题', '旧内容'))
      const updated = unwrap(await updateDraft(USER_A, created.id, { title: '新标题', content: '新内容' }))
      expect(updated.title).toBe('新标题')
      expect(updated.content).toBe('新内容')
    })

    it('updates only title', async () => {
      const created = unwrap(await createDraft(USER_A, '旧标题', '旧内容'))
      const updated = unwrap(await updateDraft(USER_A, created.id, { title: '新标题' }))
      expect(updated.title).toBe('新标题')
      expect(updated.content).toBe('旧内容')
    })
  })

  describe('findActiveDraftBySourceEntryId', () => {
    it('finds active draft by sourceEntryId', async () => {
      const draft = unwrap(await createDraft(USER_A, '来源草稿', '内容', 10, 'entry'))
      const found = await findActiveDraftBySourceEntryId(USER_A, 10)
      expect(found).not.toBeNull()
      expect(unwrap(found).id).toBe(draft.id)
    })

    it('returns null when no active draft matches', async () => {
      await createDraft(USER_A, '普通草稿')
      const found = await findActiveDraftBySourceEntryId(USER_A, 999)
      expect(found).toBeNull()
    })

    it('returns null when draft is published', async () => {
      const draft = unwrap(await createDraft(USER_A, '来源草稿', '内容', 20, 'entry'))
      await publishDraftToDocument(USER_A, draft.id)
      const found = await findActiveDraftBySourceEntryId(USER_A, 20)
      expect(found).toBeNull()
    })

    it('isolates by userId', async () => {
      await createDraft(USER_A, 'A来源草稿', '内容', 30, 'entry')
      const found = await findActiveDraftBySourceEntryId(USER_B, 30)
      expect(found).toBeNull()
    })
  })

  describe('publishDraftToDocument', () => {
    it('publishes draft and creates entry', async () => {
      const draft = unwrap(await createDraft(USER_A, '发布测试', '发布内容'))
      const result = await publishDraftToDocument(USER_A, draft.id)

      const publishedDraft = unwrap(result.draft)
      expect(publishedDraft.status).toBe('published')

      const entry = unwrap(result.entry)
      expect(entry.title).toBe('发布测试')
      expect(entry.content).toBe('发布内容')
    })

    it('removes published draft from active list', async () => {
      const draft = unwrap(await createDraft(USER_A, '待发布'))
      await publishDraftToDocument(USER_A, draft.id)

      const activeDrafts = await listDrafts(USER_A)
      expect(activeDrafts).toHaveLength(0)
    })

    it('fails for wrong user', async () => {
      const draft = unwrap(await createDraft(USER_A, 'A的草稿'))
      const result = await publishDraftToDocument(USER_B, draft.id)
      expect(result.draft).toBeNull()
      expect(result.entry).toBeNull()
    })

    it('write-back to original entry when draft has sourceEntryId', async () => {
      const entryId = await db.table('entries').add({
        userId: USER_A,
        sourceDockItemId: 0,
        title: '原始文档',
        content: '原始内容',
        type: 'note',
        tags: [],
        project: null,
        actions: [],
        createdAt: new Date(),
        archivedAt: new Date(),
      })

      const draft = unwrap(await createDraft(USER_A, '修改后标题', '修改后内容', entryId as number, 'entry'))
      const result = await publishDraftToDocument(USER_A, draft.id)

      const entry = unwrap(result.entry)
      expect(entry.id).toBe(entryId as number)
      expect(entry.title).toBe('修改后标题')
      expect(entry.content).toBe('修改后内容')
    })

    it('creates new entry when sourceEntryId entry does not exist', async () => {
      const draft = unwrap(await createDraft(USER_A, '来源丢失', '内容', 99999, 'entry'))
      const result = await publishDraftToDocument(USER_A, draft.id)

      const entry = unwrap(result.entry)
      expect(entry.title).toBe('来源丢失')
      expect(entry.sourceDockItemId).toBe(99999)
    })

    it('creates new entry when sourceEntryId belongs to different user', async () => {
      const entryId = await db.table('entries').add({
        userId: USER_B,
        sourceDockItemId: 0,
        title: 'B的文档',
        content: 'B的内容',
        type: 'note',
        tags: [],
        project: null,
        actions: [],
        createdAt: new Date(),
        archivedAt: new Date(),
      })

      const draft = unwrap(await createDraft(USER_A, 'A的修改', 'A的内容', entryId as number, 'entry'))
      const result = await publishDraftToDocument(USER_A, draft.id)

      const entry = unwrap(result.entry)
      expect(entry.id).not.toBe(entryId as number)
      expect(entry.title).toBe('A的修改')
    })

    it('preserves sourceEntryId in draft record after publish', async () => {
      const draft = unwrap(await createDraft(USER_A, '来源草稿', '内容', 42, 'entry'))
      const result = await publishDraftToDocument(USER_A, draft.id)

      const publishedDraft = unwrap(result.draft)
      expect(publishedDraft.sourceEntryId).toBe(42)
      expect(publishedDraft.sourceType).toBe('entry')
    })

    it('updates existing entry MindNode when publishing entry-origin draft', async () => {
      const entryId = await db.table('entries').add({
        userId: USER_A,
        sourceDockItemId: 0,
        title: '原始文档',
        content: '原始内容',
        type: 'note',
        tags: [],
        project: null,
        actions: [],
        createdAt: new Date(),
        archivedAt: new Date(),
      })

      await upsertMindNode({
        userId: USER_A,
        nodeType: 'document',
        label: '原始文档',
        documentId: entryId as number,
        state: 'anchored',
        metadata: { sourceType: 'document', entryId },
      })

      const draft = unwrap(await createDraft(USER_A, '修改后标题', '修改后内容', entryId as number, 'entry'))
      await publishDraftToDocument(USER_A, draft.id)

      const entryNode = await findMindNodeByDocumentId(USER_A, entryId as number)
      expect(entryNode).not.toBeNull()
      expect(unwrap(entryNode).label).toBe('修改后标题')
      expect(unwrap(entryNode).metadata).toEqual({ sourceType: 'document', entryId })
    })

    it('deletes draft MindNode when publishing entry-origin draft', async () => {
      const entryId = await db.table('entries').add({
        userId: USER_A,
        sourceDockItemId: 0,
        title: '原始文档',
        content: '原始内容',
        type: 'note',
        tags: [],
        project: null,
        actions: [],
        createdAt: new Date(),
        archivedAt: new Date(),
      })

      const draft = unwrap(await createDraft(USER_A, '修改后标题', '修改后内容', entryId as number, 'entry'))

      await upsertMindNode({
        userId: USER_A,
        nodeType: 'document',
        label: '草稿节点',
        documentId: draft.id,
        state: 'anchored',
        metadata: { sourceType: 'draft', draftId: draft.id },
      })

      await publishDraftToDocument(USER_A, draft.id)

      const draftNode = await findMindNodeByDocumentId(USER_A, draft.id)
      expect(draftNode).toBeNull()
    })

    it('creates new entry when publishMode is as_new', async () => {
      const entryId = await db.table('entries').add({
        userId: USER_A,
        sourceDockItemId: 0,
        title: '原始文档',
        content: '原始内容',
        type: 'note',
        tags: [],
        project: null,
        actions: [],
        createdAt: new Date(),
        archivedAt: new Date(),
      })

      const draft = unwrap(await createDraft(USER_A, '新文档标题', '新文档内容', entryId as number, 'entry'))
      const result = await publishDraftToDocument(USER_A, draft.id, 'as_new')

      const newEntry = unwrap(result.entry)
      expect(newEntry.id).not.toBe(entryId as number)
      expect(newEntry.title).toBe('新文档标题')
      expect(newEntry.content).toBe('新文档内容')

      const originalEntry = await db.table('entries').get(entryId as number)
      expect(originalEntry).not.toBeNull()
      expect((originalEntry as Record<string, unknown>).title).toBe('原始文档')
      expect((originalEntry as Record<string, unknown>).content).toBe('原始内容')
    })

    it('creates new MindNode when publishMode is as_new', async () => {
      const entryId = await db.table('entries').add({
        userId: USER_A,
        sourceDockItemId: 0,
        title: '原始文档',
        content: '原始内容',
        type: 'note',
        tags: [],
        project: null,
        actions: [],
        createdAt: new Date(),
        archivedAt: new Date(),
      })

      await upsertMindNode({
        userId: USER_A,
        nodeType: 'document',
        label: '原始文档',
        documentId: entryId as number,
        state: 'anchored',
        metadata: { sourceType: 'document', entryId },
      })

      const draft = unwrap(await createDraft(USER_A, '新文档标题', '新文档内容', entryId as number, 'entry'))
      const result = await publishDraftToDocument(USER_A, draft.id, 'as_new')

      const originalNode = await findMindNodeByDocumentId(USER_A, entryId as number)
      expect(originalNode).not.toBeNull()
      expect(unwrap(originalNode).label).toBe('原始文档')

      const newNode = await findMindNodeByDocumentId(USER_A, unwrap(result.entry).id)
      expect(newNode).not.toBeNull()
      expect(unwrap(newNode).label).toBe('新文档标题')
    })

    it('update_original mode updates original entry (default)', async () => {
      const entryId = await db.table('entries').add({
        userId: USER_A,
        sourceDockItemId: 0,
        title: '原始文档',
        content: '原始内容',
        type: 'note',
        tags: [],
        project: null,
        actions: [],
        createdAt: new Date(),
        archivedAt: new Date(),
      })

      const draft = unwrap(await createDraft(USER_A, '修改后标题', '修改后内容', entryId as number, 'entry'))
      const result = await publishDraftToDocument(USER_A, draft.id, 'update_original')

      const entry = unwrap(result.entry)
      expect(entry.id).toBe(entryId as number)
      expect(entry.title).toBe('修改后标题')
      expect(entry.content).toBe('修改后内容')
    })
  })

  describe('discardDraft', () => {
    it('discards a draft', async () => {
      const draft = unwrap(await createDraft(USER_A, '待丢弃'))
      const result = unwrap(await discardDraft(USER_A, draft.id))
      expect(result.status).toBe('discarded')
    })

    it('removes discarded draft from active list', async () => {
      const draft = unwrap(await createDraft(USER_A, '待丢弃'))
      await discardDraft(USER_A, draft.id)

      const activeDrafts = await listDrafts(USER_A)
      expect(activeDrafts).toHaveLength(0)
    })

    it('fails for wrong user', async () => {
      const draft = unwrap(await createDraft(USER_A, 'A的草稿'))
      const result = await discardDraft(USER_B, draft.id)
      expect(result).toBeNull()
    })

    it('deletes draft MindNode when discarding standalone draft', async () => {
      const draft = unwrap(await createDraft(USER_A, '待丢弃'))

      await upsertMindNode({
        userId: USER_A,
        nodeType: 'document',
        label: '待丢弃',
        documentId: draft.id,
        state: 'anchored',
        metadata: { sourceType: 'draft', draftId: draft.id },
      })

      const nodeBefore = await findMindNodeByDocumentId(USER_A, draft.id)
      expect(nodeBefore).not.toBeNull()

      await discardDraft(USER_A, draft.id)

      const nodeAfter = await findMindNodeByDocumentId(USER_A, draft.id)
      expect(nodeAfter).toBeNull()
    })

    it('does not delete entry MindNode when discarding entry-origin draft', async () => {
      const entryId = await db.table('entries').add({
        userId: USER_A,
        sourceDockItemId: 0,
        title: '原始文档',
        content: '原始内容',
        type: 'note',
        tags: [],
        project: null,
        actions: [],
        createdAt: new Date(),
        archivedAt: new Date(),
      })

      await upsertMindNode({
        userId: USER_A,
        nodeType: 'document',
        label: '原始文档',
        documentId: entryId as number,
        state: 'anchored',
        metadata: { sourceType: 'document', entryId },
      })

      const draft = unwrap(await createDraft(USER_A, '修改后标题', '修改后内容', entryId as number, 'entry'))
      await discardDraft(USER_A, draft.id)

      const entryNode = await findMindNodeByDocumentId(USER_A, entryId as number)
      expect(entryNode).not.toBeNull()
      expect(unwrap(entryNode).label).toBe('原始文档')
    })

    it('delete_all mode deletes original entry and its MindNode', async () => {
      const entryId = await db.table('entries').add({
        userId: USER_A,
        sourceDockItemId: 0,
        title: '原始文档',
        content: '原始内容',
        type: 'note',
        tags: [],
        project: null,
        actions: [],
        createdAt: new Date(),
        archivedAt: new Date(),
      })

      await upsertMindNode({
        userId: USER_A,
        nodeType: 'document',
        label: '原始文档',
        documentId: entryId as number,
        state: 'anchored',
        metadata: { sourceType: 'document', entryId },
      })

      const draft = unwrap(await createDraft(USER_A, '修改后标题', '修改后内容', entryId as number, 'entry'))
      await discardDraft(USER_A, draft.id, 'delete_all')

      const entryNode = await findMindNodeByDocumentId(USER_A, entryId as number)
      expect(entryNode).toBeNull()

      const deletedEntry = await db.table('entries').get(entryId as number)
      expect(deletedEntry).toBeUndefined()
    })

    it('abandon_changes mode preserves original entry (default)', async () => {
      const entryId = await db.table('entries').add({
        userId: USER_A,
        sourceDockItemId: 0,
        title: '原始文档',
        content: '原始内容',
        type: 'note',
        tags: [],
        project: null,
        actions: [],
        createdAt: new Date(),
        archivedAt: new Date(),
      })

      await upsertMindNode({
        userId: USER_A,
        nodeType: 'document',
        label: '原始文档',
        documentId: entryId as number,
        state: 'anchored',
        metadata: { sourceType: 'document', entryId },
      })

      const draft = unwrap(await createDraft(USER_A, '修改后标题', '修改后内容', entryId as number, 'entry'))
      await discardDraft(USER_A, draft.id, 'abandon_changes')

      const entryNode = await findMindNodeByDocumentId(USER_A, entryId as number)
      expect(entryNode).not.toBeNull()
      expect(unwrap(entryNode).label).toBe('原始文档')

      const preservedEntry = await db.table('entries').get(entryId as number)
      expect(preservedEntry).not.toBeUndefined()
    })

    it('delete_all mode does not affect entries of other users', async () => {
      const entryId = await db.table('entries').add({
        userId: USER_B,
        sourceDockItemId: 0,
        title: 'B的文档',
        content: 'B的内容',
        type: 'note',
        tags: [],
        project: null,
        actions: [],
        createdAt: new Date(),
        archivedAt: new Date(),
      })

      const draft = unwrap(await createDraft(USER_A, 'A的修改', 'A的内容', entryId as number, 'entry'))
      await discardDraft(USER_A, draft.id, 'delete_all')

      const bEntry = await db.table('entries').get(entryId as number)
      expect(bEntry).not.toBeUndefined()
    })
  })

  describe('Document name conflict detection', () => {
    it('detects conflict when same-named document exists under same parent', async () => {
      const parentNode = await upsertMindNode({
        userId: USER_A,
        nodeType: 'project',
        label: 'Test Project',
        state: 'anchored',
      })
      const existingDoc = await upsertMindNode({
        userId: USER_A,
        nodeType: 'document',
        label: 'My Doc',
        documentId: 100,
        state: 'anchored',
      })
      await upsertMindEdge({
        userId: USER_A,
        sourceNodeId: parentNode.id,
        targetNodeId: existingDoc.id,
        edgeType: 'parent_child',
        strength: 1,
        source: 'user',
      })

      const conflict = await checkDocumentNameConflict(USER_A, 'My Doc')
      expect(conflict.hasConflict).toBe(true)
      expect(conflict.conflictingParentIds).toContain(parentNode.id)
    })

    it('root level same-named document is a conflict', async () => {
      await upsertMindNode({
        userId: USER_A,
        nodeType: 'document',
        label: 'My Doc',
        documentId: 100,
        state: 'drifting',
      })

      const conflict = await checkDocumentNameConflict(USER_A, 'My Doc')
      expect(conflict.hasConflict).toBe(true)
      expect(conflict.hasRootLevelConflict).toBe(true)
    })

    it('no conflict when no same-named document exists', async () => {
      const conflict = await checkDocumentNameConflict(USER_A, 'Unique Doc Name')
      expect(conflict.hasConflict).toBe(false)
    })

    it('as_new publish returns nameConflict when same name under same parent', async () => {
      const entryId = await db.table('entries').add({
        userId: USER_A,
        sourceDockItemId: 0,
        title: 'My Doc',
        content: '原始内容',
        type: 'note',
        tags: [],
        project: null,
        actions: [],
        createdAt: new Date(),
        archivedAt: new Date(),
      })

      const parentNode = await upsertMindNode({
        userId: USER_A,
        nodeType: 'project',
        label: 'Test Project',
        state: 'anchored',
      })
      const existingDoc = await upsertMindNode({
        userId: USER_A,
        nodeType: 'document',
        label: 'My Doc',
        documentId: entryId as number,
        state: 'anchored',
      })
      await upsertMindEdge({
        userId: USER_A,
        sourceNodeId: parentNode.id,
        targetNodeId: existingDoc.id,
        edgeType: 'parent_child',
        strength: 1,
        source: 'user',
      })

      const draft = unwrap(await createDraft(USER_A, 'My Doc', '新内容', entryId as number, 'entry'))
      const result = await publishDraftToDocument(USER_A, draft.id, 'as_new')

      expect(result.nameConflict).toBeDefined()
      expect(result.nameConflict?.hasConflict).toBe(true)
      expect(result.draft).toBeNull()
      expect(result.entry).toBeNull()
    })

    it('as_new publish returns conflict when root level same name', async () => {
      const entryId = await db.table('entries').add({
        userId: USER_A,
        sourceDockItemId: 0,
        title: 'My Doc',
        content: '原始内容',
        type: 'note',
        tags: [],
        project: null,
        actions: [],
        createdAt: new Date(),
        archivedAt: new Date(),
      })

      await upsertMindNode({
        userId: USER_A,
        nodeType: 'document',
        label: 'My Doc',
        documentId: entryId as number,
        state: 'drifting',
      })

      const draft = unwrap(await createDraft(USER_A, 'My Doc', '新内容', entryId as number, 'entry'))
      const result = await publishDraftToDocument(USER_A, draft.id, 'as_new')

      expect(result.nameConflict).toBeDefined()
      expect(result.nameConflict?.hasConflict).toBe(true)
      expect(result.draft).toBeNull()
      expect(result.entry).toBeNull()
    })
  })

  describe('MindNode ID collision safety (draftId vs entryId)', () => {
    it('publish entry-origin draft does not delete entry MindNode when draftId equals another entryId', async () => {
      const entryA = await db.table('entries').add({
        userId: USER_A,
        sourceDockItemId: 0,
        title: 'Entry A',
        content: 'Content A',
        type: 'note',
        tags: [],
        project: null,
        actions: [],
        createdAt: new Date(),
        archivedAt: new Date(),
      })

      const entryB = await db.table('entries').add({
        userId: USER_A,
        sourceDockItemId: 0,
        title: 'Entry B',
        content: 'Content B',
        type: 'note',
        tags: [],
        project: null,
        actions: [],
        createdAt: new Date(),
        archivedAt: new Date(),
      })

      const entryBNode = await upsertMindNode({
        userId: USER_A,
        nodeType: 'document',
        label: 'Entry B',
        documentId: entryB as number,
        state: 'anchored',
        metadata: { sourceType: 'document', entryId: entryB as number },
      })

      const parentNode = await upsertMindNode({
        userId: USER_A,
        nodeType: 'project',
        label: 'Parent Project',
        state: 'anchored',
      })
      await upsertMindEdge({
        userId: USER_A,
        sourceNodeId: parentNode.id,
        targetNodeId: entryBNode.id,
        edgeType: 'parent_child',
        strength: 1,
        source: 'user',
      })

      const draft = unwrap(await createDraft(USER_A, 'Modified A', 'New content', entryA as number, 'entry'))

      await upsertMindNode({
        userId: USER_A,
        nodeType: 'document',
        label: 'Modified A',
        documentId: draft.id,
        state: 'drifting',
        metadata: { sourceType: 'draft', draftId: draft.id },
      })

      await publishDraftToDocument(USER_A, draft.id, 'update_original')

      const entryBNodeAfter = await findMindNodeBySourceType(USER_A, entryB as number, 'document')
      expect(entryBNodeAfter).not.toBeNull()
      expect(unwrap(entryBNodeAfter).id).toBe(entryBNode.id)
      expect(unwrap(entryBNodeAfter).label).toBe('Entry B')

      const draftNodeAfter = await findMindNodeBySourceType(USER_A, draft.id, 'draft')
      expect(draftNodeAfter).toBeNull()

      const edges = await db.table('mindEdges').where('userId').equals(USER_A).toArray()
      const parentEdge = edges.find(e => e.targetNodeId === entryBNode.id && e.edgeType === 'parent_child')
      expect(parentEdge).toBeDefined()
    })

    it('discard standalone draft does not delete entry MindNode with same numeric ID', async () => {
      const entryId = await db.table('entries').add({
        userId: USER_A,
        sourceDockItemId: 0,
        title: 'Real Entry',
        content: 'Real Content',
        type: 'note',
        tags: [],
        project: null,
        actions: [],
        createdAt: new Date(),
        archivedAt: new Date(),
      })

      const entryNode = await upsertMindNode({
        userId: USER_A,
        nodeType: 'document',
        label: 'Real Entry',
        documentId: entryId as number,
        state: 'anchored',
        metadata: { sourceType: 'document', entryId: entryId as number },
      })

      const draft = unwrap(await createDraft(USER_A, 'Draft Title', 'Draft Content'))

      await upsertMindNode({
        userId: USER_A,
        nodeType: 'document',
        label: 'Draft Title',
        documentId: draft.id,
        state: 'drifting',
        metadata: { sourceType: 'draft', draftId: draft.id },
      })

      await discardDraft(USER_A, draft.id)

      const entryNodeAfter = await findMindNodeBySourceType(USER_A, entryId as number, 'document')
      expect(entryNodeAfter).not.toBeNull()
      expect(unwrap(entryNodeAfter).id).toBe(entryNode.id)
      expect(unwrap(entryNodeAfter).label).toBe('Real Entry')

      const draftNodeAfter = await findMindNodeBySourceType(USER_A, draft.id, 'draft')
      expect(draftNodeAfter).toBeNull()
    })

    it('findMindNodeBySourceType distinguishes draft vs document with same documentId', async () => {
      const docId = 999

      await upsertMindNode({
        userId: USER_A,
        nodeType: 'document',
        label: 'Draft Node',
        documentId: docId,
        state: 'drifting',
        metadata: { sourceType: 'draft', draftId: docId },
      })

      await upsertMindNode({
        userId: USER_A,
        nodeType: 'document',
        label: 'Document Node',
        documentId: docId,
        state: 'anchored',
        metadata: { sourceType: 'document', entryId: docId },
      })

      const draftNode = await findMindNodeBySourceType(USER_A, docId, 'draft')
      expect(draftNode).not.toBeNull()
      expect(unwrap(draftNode).label).toBe('Draft Node')

      const docNode = await findMindNodeBySourceType(USER_A, docId, 'document')
      expect(docNode).not.toBeNull()
      expect(unwrap(docNode).label).toBe('Document Node')

      expect(unwrap(draftNode).id).not.toBe(unwrap(docNode).id)
    })
  })
})
