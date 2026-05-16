import { afterEach, describe, expect, it } from 'vitest'

import { db, type EntryRecord, type DraftStatus, type TipStatus } from '@/lib/db'
import {
  addTagToItem,
  archiveItem,
  createDockItem,
  createDraft,
  discardDraft,
  getEntryByDockItemId,
  listArchivedEntries,
  listArchivedEntriesByProject,
  listArchivedEntriesByTag,
  listArchivedEntriesByType,
  suggestItem,
  updateArchivedEntry,
  updateSelectedProject,
} from '@/lib/repository'
import { isArchived, isDiscarded, isHidden, assertNotIrreversible } from '@/lib/lifecycleGuards'

const USER_A = 'user_lifecycle_guard_a'

async function cleanAll() {
  await db.table('dockItems').clear()
  await db.table('entries').clear()
  await db.table('editorDrafts').clear()
  await db.table('mindNodes').clear()
  await db.table('mindEdges').clear()
  await db.table('tags').clear()
}

function unwrap<T>(value: T | null | undefined): T {
  expect(value).not.toBeNull()
  expect(value).not.toBeUndefined()
  return value as T
}

describe('lifecycleGuards', () => {
  describe('isArchived', () => {
    it('returns true when archivedAt is a Date', () => {
      const entry = { archivedAt: new Date() } as EntryRecord
      expect(isArchived(entry)).toBe(true)
    })

    it('returns false when archivedAt is null', () => {
      const entry = { archivedAt: null as unknown as Date } as EntryRecord
      expect(isArchived(entry)).toBe(false)
    })

    it('returns false when archivedAt is undefined', () => {
      const entry = { archivedAt: undefined as unknown as Date } as EntryRecord
      expect(isArchived(entry)).toBe(false)
    })
  })

  describe('isDiscarded', () => {
    it('returns true when draft status is discarded', () => {
      const draft = { status: 'discarded' as DraftStatus }
      expect(isDiscarded(draft)).toBe(true)
    })

    it('returns true when tip status is discarded', () => {
      const tip = { status: 'discarded' as TipStatus }
      expect(isDiscarded(tip)).toBe(true)
    })

    it('returns false when draft status is active', () => {
      const draft = { status: 'active' as DraftStatus }
      expect(isDiscarded(draft)).toBe(false)
    })
  })

  describe('isHidden', () => {
    it('returns true when mindNode state is archived', () => {
      const node = { state: 'archived' as const, metadata: null }
      expect(isHidden(node)).toBe(true)
    })

    it('returns true when metadata has hiddenAt', () => {
      const node = {
        state: 'anchored' as const,
        metadata: { hiddenAt: '2025-01-01T00:00:00Z' },
      }
      expect(isHidden(node)).toBe(true)
    })

    it('returns false when state is not archived and metadata has no hiddenAt', () => {
      const node = { state: 'anchored' as const, metadata: null }
      expect(isHidden(node)).toBe(false)
    })

    it('returns false when state is not archived and metadata is empty object', () => {
      const node = { state: 'anchored' as const, metadata: {} }
      expect(isHidden(node)).toBe(false)
    })

    it('returns false when metadata has hiddenAt set to null', () => {
      const node = {
        state: 'anchored' as const,
        metadata: { hiddenAt: null },
      }
      expect(isHidden(node)).toBe(false)
    })
  })

  describe('assertNotIrreversible', () => {
    it('does not throw when confirmed is true', () => {
      expect(() => assertNotIrreversible('test_action', true)).not.toThrow()
    })

    it('throws when confirmed is false', () => {
      expect(() => assertNotIrreversible('test_action', false)).toThrow(
        'Irreversible action "test_action" requires explicit confirmation',
      )
    })

    it('throws when confirmed is undefined', () => {
      expect(() => assertNotIrreversible('test_action', undefined as unknown as boolean)).toThrow(
        'Irreversible action "test_action" requires explicit confirmation',
      )
    })
  })
})

describe('listArchivedEntries semantic closure', () => {
  afterEach(cleanAll)

  it('archived document restore 后不再被 listArchivedEntries 读出', async () => {
    const id = await createDockItem(USER_A, '归档恢复测试')
    await suggestItem(USER_A, id)
    await archiveItem(USER_A, id)

    const entry = unwrap(await getEntryByDockItemId(USER_A, id))
    const archivedBefore = await listArchivedEntries(USER_A)
    expect(archivedBefore.some(e => e.id === entry.id)).toBe(true)

    await updateArchivedEntry(USER_A, entry.id, { archivedAt: null })

    const archivedAfter = await listArchivedEntries(USER_A)
    expect(archivedAfter.some(e => e.id === entry.id)).toBe(false)
  })

  it('listArchivedEntriesByType 同理只返回 archivedAt != null', async () => {
    const id = await createDockItem(USER_A, '类型过滤测试')
    await suggestItem(USER_A, id)
    await archiveItem(USER_A, id)

    const entry = unwrap(await getEntryByDockItemId(USER_A, id))
    const byTypeBefore = await listArchivedEntriesByType(USER_A, entry.type)
    expect(byTypeBefore.some(e => e.id === entry.id)).toBe(true)

    await updateArchivedEntry(USER_A, entry.id, { archivedAt: null })

    const byTypeAfter = await listArchivedEntriesByType(USER_A, entry.type)
    expect(byTypeAfter.some(e => e.id === entry.id)).toBe(false)
  })

  it('listArchivedEntriesByTag 同理只返回 archivedAt != null', async () => {
    const id = await createDockItem(USER_A, '标签过滤测试')
    await addTagToItem(USER_A, id, '测试标签')
    await suggestItem(USER_A, id)
    await archiveItem(USER_A, id)

    const entry = unwrap(await getEntryByDockItemId(USER_A, id))
    const byTagBefore = await listArchivedEntriesByTag(USER_A, '测试标签')
    expect(byTagBefore.some(e => e.id === entry.id)).toBe(true)

    await updateArchivedEntry(USER_A, entry.id, { archivedAt: null })

    const byTagAfter = await listArchivedEntriesByTag(USER_A, '测试标签')
    expect(byTagAfter.some(e => e.id === entry.id)).toBe(false)
  })

  it('listArchivedEntriesByProject 同理只返回 archivedAt != null', async () => {
    const id = await createDockItem(USER_A, '项目过滤测试')
    await suggestItem(USER_A, id)
    await updateSelectedProject(USER_A, id, '测试项目')
    await archiveItem(USER_A, id)

    const entry = unwrap(await getEntryByDockItemId(USER_A, id))
    const byProjectBefore = await listArchivedEntriesByProject(USER_A, '测试项目')
    expect(byProjectBefore.some(e => e.id === entry.id)).toBe(true)

    await updateArchivedEntry(USER_A, entry.id, { archivedAt: null })

    const byProjectAfter = await listArchivedEntriesByProject(USER_A, '测试项目')
    expect(byProjectAfter.some(e => e.id === entry.id)).toBe(false)
  })
})

describe('Draft delete_all guard', () => {
  afterEach(cleanAll)

  it('discardDraft delete_all 模式无 confirmed 标记时抛错', async () => {
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

    const draft = unwrap(await createDraft(USER_A, '修改标题', '修改内容', entryId as number, 'entry'))

    await expect(
      discardDraft(USER_A, draft.id, 'delete_all'),
    ).rejects.toThrow('Irreversible action "discardDraft:delete_all" requires explicit confirmation')
  })

  it('discardDraft delete_all 模式有 confirmed: true 时不抛错', async () => {
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

    const draft = unwrap(await createDraft(USER_A, '修改标题', '修改内容', entryId as number, 'entry'))

    const result = await discardDraft(USER_A, draft.id, 'delete_all', { confirmed: true })
    expect(result).not.toBeNull()
    expect(unwrap(result).status).toBe('discarded')
  })

  it('discardDraft abandon_changes 模式不需要 confirmed 标记', async () => {
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

    const draft = unwrap(await createDraft(USER_A, '修改标题', '修改内容', entryId as number, 'entry'))

    const result = await discardDraft(USER_A, draft.id, 'abandon_changes')
    expect(result).not.toBeNull()
    expect(unwrap(result).status).toBe('discarded')
  })
})
