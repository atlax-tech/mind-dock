import { afterEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { DEFAULT_WORKSPACE_ID } from '@atlax/domain'
import {
  addTagToItem,
  archiveItem,
  countDockItems,
  createDockItem,
  createStoredTag,
  getChainProvenance,
  getEntryByDockItemId,
  getWorkspaceStats,
  ignoreItem,
  listArchivedEntriesByProject,
  listArchivedEntriesByTag,
  listArchivedEntriesByType,
  listDockItems,
  listItemsByStatus,
  listTags,
  removeTagFromItem,
  reopenItem,
  restoreItem,
  resolveRecommendationCandidate,
  suggestItem,
  updateArchivedEntry,
  updateChainLinks,
  updateDockItemText,
  updateSelectedActions,
  updateSelectedProject,
} from '@/lib/repository'

const USER_A = 'user_test_a'
const USER_B = 'user_test_b'

async function cleanAll() {
  await db.table('dockItems').clear()
  await db.table('entries').clear()
  await db.table('tags').clear()
}

function unwrap<T>(value: T | null): T {
  expect(value).not.toBeNull()
  return value as T
}

describe('repository', () => {
  afterEach(cleanAll)

  describe('createDockItem & listDockItems', () => {
    it('creates and lists items for a user', async () => {
      await createDockItem(USER_A, '测试内容A')
      await createDockItem(USER_A, '测试内容B')

      const items = await listDockItems(USER_A)
      expect(items).toHaveLength(2)
      expect(items[0].rawText).toBe('测试内容B')
      expect(items[0].status).toBe('pending')
      expect(items[0].userId).toBe(USER_A)
    })

    it('isolates items between users', async () => {
      await createDockItem(USER_A, '用户A的内容')
      await createDockItem(USER_B, '用户B的内容')

      const itemsA = await listDockItems(USER_A)
      const itemsB = await listDockItems(USER_B)

      expect(itemsA).toHaveLength(1)
      expect(itemsA[0].rawText).toBe('用户A的内容')
      expect(itemsB).toHaveLength(1)
      expect(itemsB[0].rawText).toBe('用户B的内容')
    })
  })

  describe('countDockItems', () => {
    it('counts items for a specific user', async () => {
      await createDockItem(USER_A, '内容1')
      await createDockItem(USER_A, '内容2')
      await createDockItem(USER_B, '内容3')

      expect(await countDockItems(USER_A)).toBe(2)
      expect(await countDockItems(USER_B)).toBe(1)
    })
  })

  describe('state flow', () => {
    it('pending -> suggested -> archived', async () => {
      const id = await createDockItem(USER_A, '会议记录')

      const suggested = unwrap(await suggestItem(USER_A, id))
      expect(suggested.status).toBe('suggested')
      expect(suggested.suggestions.length).toBeGreaterThan(0)

      const archived = unwrap(await archiveItem(USER_A, id))
      expect(archived.status).toBe('archived')
    })

    it('pending -> ignored -> restore -> suggested -> archived', async () => {
      const id = await createDockItem(USER_A, '待办任务')

      expect(unwrap(await ignoreItem(USER_A, id)).status).toBe('ignored')

      const restored = unwrap(await restoreItem(USER_A, id))
      expect(restored.status).toBe('pending')
      expect(restored.suggestions).toEqual([])

      await suggestItem(USER_A, id)
      expect(unwrap(await archiveItem(USER_A, id)).status).toBe('archived')
    })

    it('archived -> reopen -> suggest -> re-archive', async () => {
      const id = await createDockItem(USER_A, '测试内容')
      await suggestItem(USER_A, id)
      await archiveItem(USER_A, id)

      const reopened = unwrap(await reopenItem(USER_A, id))
      expect(reopened.status).toBe('reopened')

      await suggestItem(USER_A, id)
      expect(unwrap(await archiveItem(USER_A, id)).status).toBe('archived')
    })

    it('supports import sourceType', async () => {
      await createDockItem(USER_A, '导入的内容', 'import')
      const item = await listDockItems(USER_A)
      expect(item[0].sourceType).toBe('import')
    })

    it('reopened state flow', async () => {
      const id = await createDockItem(USER_A, '内容')
      await suggestItem(USER_A, id)
      await archiveItem(USER_A, id)

      const reopened = unwrap(await reopenItem(USER_A, id))
      expect(reopened.status).toBe('reopened')

      await suggestItem(USER_A, id)
      const ignored = unwrap(await ignoreItem(USER_A, id))
      expect(ignored.status).toBe('ignored')
    })

    it('blocks invalid transitions', async () => {
      const id = await createDockItem(USER_A, '内容')
      await suggestItem(USER_A, id)
      await archiveItem(USER_A, id)
      expect(await archiveItem(USER_A, id)).toBeNull()
    })

    it('blocks cross-user operations', async () => {
      const id = await createDockItem(USER_A, '内容')
      expect(await suggestItem(USER_B, id)).toBeNull()
    })

    it('blocks cross-user archive', async () => {
      const id = await createDockItem(USER_A, '内容')
      await suggestItem(USER_A, id)
      expect(await archiveItem(USER_B, id)).toBeNull()
    })

    it('blocks cross-user reopen', async () => {
      const id = await createDockItem(USER_A, '内容')
      await suggestItem(USER_A, id)
      await archiveItem(USER_A, id)
      expect(await reopenItem(USER_B, id)).toBeNull()
    })

    it('blocks cross-user ignore', async () => {
      const id = await createDockItem(USER_A, '内容')
      expect(await ignoreItem(USER_B, id)).toBeNull()
    })

    it('blocks cross-user restore', async () => {
      const id = await createDockItem(USER_A, '内容')
      await ignoreItem(USER_A, id)
      expect(await restoreItem(USER_B, id)).toBeNull()
    })

    it('blocks cross-user tag operations', async () => {
      const id = await createDockItem(USER_A, '内容')
      expect(await addTagToItem(USER_B, id, '技术')).toBeNull()
      expect(await removeTagFromItem(USER_B, id, '技术')).toBeNull()
    })

    it('blocks cross-user selectedProject/selectedActions update', async () => {
      const id = await createDockItem(USER_A, '内容')
      expect(await updateSelectedProject(USER_B, id, 'Project')).toBeNull()
      expect(await updateSelectedActions(USER_B, id, ['action1'])).toBeNull()
    })

    it('blocks cross-user entry access', async () => {
      const id = await createDockItem(USER_A, '内容')
      await suggestItem(USER_A, id)
      await archiveItem(USER_A, id)
      expect(await getEntryByDockItemId(USER_B, id)).toBeNull()
    })
  })

  describe('listItemsByStatus', () => {
    it('filters by status', async () => {
      const id1 = await createDockItem(USER_A, '内容1')
      const id2 = await createDockItem(USER_A, '内容2')
      await createDockItem(USER_A, '内容3')

      await suggestItem(USER_A, id1)
      await ignoreItem(USER_A, id2)

      const pending = await listItemsByStatus(USER_A, 'pending')
      const suggested = await listItemsByStatus(USER_A, 'suggested')
      const ignored = await listItemsByStatus(USER_A, 'ignored')

      expect(pending).toHaveLength(1)
      expect(suggested).toHaveLength(1)
      expect(ignored).toHaveLength(1)
    })
  })

  describe('updateDockItemText', () => {
    it('resets status to pending and clears suggestions', async () => {
      const id = await createDockItem(USER_A, '原始内容')
      const suggested = unwrap(await suggestItem(USER_A, id))
      expect(suggested.status).toBe('suggested')
      expect(suggested.suggestions.length).toBeGreaterThan(0)

      const updated = unwrap(await updateDockItemText(USER_A, id, '修改后的内容'))
      expect(updated.rawText).toBe('修改后的内容')
      expect(updated.status).toBe('pending')
      expect(updated.suggestions).toEqual([])
      expect(updated.processedAt).toBeNull()
    })

    it('allows re-suggest after edit', async () => {
      const id = await createDockItem(USER_A, '原始内容')
      await suggestItem(USER_A, id)
      await updateDockItemText(USER_A, id, '全新内容')

      const reSuggested = unwrap(await suggestItem(USER_A, id))
      expect(reSuggested.status).toBe('suggested')
      expect(reSuggested.suggestions.length).toBeGreaterThan(0)
    })

    it('returns null for nonexistent item', async () => {
      expect(await updateDockItemText(USER_A, 99999, '内容')).toBeNull()
    })

    it('blocks cross-user text update', async () => {
      const id = await createDockItem(USER_A, '内容')
      expect(await updateDockItemText(USER_B, id, '恶意修改')).toBeNull()
    })
  })

  describe('suggestItem re-generation (suggested -> suggested)', () => {
    it('regenerates suggestions on reopened -> suggested path', async () => {
      const id = await createDockItem(USER_A, '产品需求评审')
      const first = unwrap(await suggestItem(USER_A, id))
      expect(first.status).toBe('suggested')
      expect(first.suggestions.length).toBeGreaterThan(0)

      await archiveItem(USER_A, id)
      await reopenItem(USER_A, id)

      const second = unwrap(await suggestItem(USER_A, id))
      expect(second.status).toBe('suggested')
      expect(second.suggestions.length).toBeGreaterThan(0)
    })

    it('reopened item preserves suggestions from archive cycle', async () => {
      const id = await createDockItem(USER_A, '测试内容')
      await suggestItem(USER_A, id)
      await archiveItem(USER_A, id)

      const reopened = unwrap(await reopenItem(USER_A, id))
      expect(reopened.suggestions.length).toBeGreaterThan(0)
      expect(reopened.processedAt).not.toBeNull()
    })

    it('edit -> suggest produces valid suggestions on same item', async () => {
      const id = await createDockItem(USER_A, '第一次输入')
      await suggestItem(USER_A, id)
      await updateDockItemText(USER_A, id, '第二次输入')

      const afterEdit = unwrap(await suggestItem(USER_A, id))
      expect(afterEdit.status).toBe('suggested')
      expect(afterEdit.rawText).toBe('第二次输入')
      expect(afterEdit.suggestions.length).toBeGreaterThan(0)
    })
  })

  describe('archive write-back', () => {
    it('creates entry on archive', async () => {
      const id = await createDockItem(USER_A, '下周产品评审会议')
      await suggestItem(USER_A, id)
      await archiveItem(USER_A, id)

      const entry = unwrap(await getEntryByDockItemId(USER_A, id))
      expect(entry.sourceDockItemId).toBe(id)
      expect(entry.content).toBe('下周产品评审会议')
      expect(entry.type).toBe('meeting')
    })

    it('updates entry on re-archive', async () => {
      const id = await createDockItem(USER_A, '测试会议')
      await suggestItem(USER_A, id)
      await archiveItem(USER_A, id)

      const firstEntry = unwrap(await getEntryByDockItemId(USER_A, id))

      await reopenItem(USER_A, id)
      await suggestItem(USER_A, id)
      await archiveItem(USER_A, id)

      const secondEntry = unwrap(await getEntryByDockItemId(USER_A, id))
      expect(secondEntry.id).toBe(firstEntry.id)
    })
  })

  describe('tag operations', () => {
    it('adds and removes tags', async () => {
      const id = await createDockItem(USER_A, '内容')

      const withTag = unwrap(await addTagToItem(USER_A, id, '技术'))
      expect(withTag.userTags).toEqual(['技术'])

      const withAnother = unwrap(await addTagToItem(USER_A, id, '产品'))
      expect(withAnother.userTags).toEqual(['技术', '产品'])

      const removed = unwrap(await removeTagFromItem(USER_A, id, '技术'))
      expect(removed.userTags).toEqual(['产品'])
    })

    it('deduplicates tags', async () => {
      const id = await createDockItem(USER_A, '内容')
      await addTagToItem(USER_A, id, '技术')
      const duped = unwrap(await addTagToItem(USER_A, id, '技术'))
      expect(duped.userTags).toEqual(['技术'])
    })
  })

  describe('listArchivedEntries filtering', () => {
    it('filters by type', async () => {
      const id1 = await createDockItem(USER_A, '产品评审会议')
      const id2 = await createDockItem(USER_A, '读到了一篇关于技术的文章')
      await suggestItem(USER_A, id1)
      await archiveItem(USER_A, id1)
      await suggestItem(USER_A, id2)
      await archiveItem(USER_A, id2)

      const meetings = await listArchivedEntriesByType(USER_A, 'meeting')
      expect(meetings).toHaveLength(1)
    })

    it('filters by tag', async () => {
      const id = await createDockItem(USER_A, '技术架构设计文档')
      await suggestItem(USER_A, id)
      await archiveItem(USER_A, id)

      const byTag = await listArchivedEntriesByTag(USER_A, '技术')
      expect(byTag.length).toBeGreaterThanOrEqual(1)
    })

    it('filters by project', async () => {
      const id = await createDockItem(USER_A, '项目需求分析')
      await suggestItem(USER_A, id)
      await archiveItem(USER_A, id)

      const byProject = await listArchivedEntriesByProject(USER_A, '关联项目')
      expect(byProject.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('updateArchivedEntry', () => {
    it('updates tags on archived entry', async () => {
      const id = await createDockItem(USER_A, '测试内容')
      await suggestItem(USER_A, id)
      await archiveItem(USER_A, id)

      const entry = unwrap(await getEntryByDockItemId(USER_A, id))
      const updated = unwrap(await updateArchivedEntry(USER_A, entry.id, {
        tags: ['新标签1', '新标签2'],
      }))
      expect(updated.tags).toEqual(['新标签1', '新标签2'])
    })

    it('updates project on archived entry', async () => {
      const id = await createDockItem(USER_A, '测试内容')
      await suggestItem(USER_A, id)
      await archiveItem(USER_A, id)

      const entry = unwrap(await getEntryByDockItemId(USER_A, id))
      const updated = unwrap(await updateArchivedEntry(USER_A, entry.id, {
        project: 'NewProject',
      }))
      expect(updated.project).toBe('NewProject')
    })

    it('updates content on archived entry', async () => {
      const id = await createDockItem(USER_A, '原始内容')
      await suggestItem(USER_A, id)
      await archiveItem(USER_A, id)

      const entry = unwrap(await getEntryByDockItemId(USER_A, id))
      const updated = unwrap(await updateArchivedEntry(USER_A, entry.id, {
        content: '修改后的内容',
      }))
      expect(updated.content).toBe('修改后的内容')
    })

    it('blocks cross-user updates', async () => {
      const id = await createDockItem(USER_A, '测试')
      await suggestItem(USER_A, id)
      await archiveItem(USER_A, id)

      const entry = unwrap(await getEntryByDockItemId(USER_A, id))
      expect(await updateArchivedEntry(USER_B, entry.id, {
        content: '恶意修改',
      })).toBeNull()
    })
  })

  describe('getWorkspaceStats', () => {
    it('returns correct stats', async () => {
      await createDockItem(USER_A, '待处理1')
      const id2 = await createDockItem(USER_A, '已建议')
      await suggestItem(USER_A, id2)
      const id3 = await createDockItem(USER_A, '已忽略')
      await ignoreItem(USER_A, id3)
      const id4 = await createDockItem(USER_A, '已归档')
      await suggestItem(USER_A, id4)
      await archiveItem(USER_A, id4)
      await createStoredTag(USER_A, '标签1')

      const stats = await getWorkspaceStats(USER_A)
      expect(stats.pendingCount).toBe(1)
      expect(stats.suggestedCount).toBe(1)
      expect(stats.archivedCount).toBe(1)
      expect(stats.ignoredCount).toBe(1)
      expect(stats.reopenedCount).toBe(0)
      expect(stats.totalEntries).toBe(1)
      expect(stats.tagCount).toBe(1)
    })

    it('counts reopened items', async () => {
      const id = await createDockItem(USER_A, '内容')
      await suggestItem(USER_A, id)
      await archiveItem(USER_A, id)
      await reopenItem(USER_A, id)

      const stats = await getWorkspaceStats(USER_A)
      expect(stats.reopenedCount).toBe(1)
      expect(stats.archivedCount).toBe(0)
    })
  })

  describe('tag storage', () => {
    it('creates and lists tags', async () => {
      await createStoredTag(USER_A, '技术')
      await createStoredTag(USER_A, '产品')

      const tags = await listTags(USER_A)
      expect(tags).toHaveLength(2)
      expect(tags.map((t) => t.name).sort()).toEqual(['产品', '技术'])
    })

    it('deduplicates tags by name', async () => {
      await createStoredTag(USER_A, '技术')
      await createStoredTag(USER_A, '技术')

      const tags = await listTags(USER_A)
      expect(tags).toHaveLength(1)
    })

    it('isolates tags between users', async () => {
      await createStoredTag(USER_A, '技术')
      await createStoredTag(USER_B, '产品')

      expect(await listTags(USER_A)).toHaveLength(1)
      expect(await listTags(USER_B)).toHaveLength(1)
    })
  })

  describe('selectedProject and selectedActions in archive', () => {
    it('writes selectedProject into entry on archive', async () => {
      const id = await createDockItem(USER_A, '项目需求分析')
      await suggestItem(USER_A, id)

      await updateSelectedProject(USER_A, id, 'MindDock')

      await archiveItem(USER_A, id)

      const entry = unwrap(await getEntryByDockItemId(USER_A, id))
      expect(entry.project).toBe('MindDock')
    })

    it('writes selectedActions into entry on archive', async () => {
      const id = await createDockItem(USER_A, '技术方案设计')
      await suggestItem(USER_A, id)

      await updateSelectedActions(USER_A, id, ['需要拆分', '需要评审'])

      await archiveItem(USER_A, id)

      const entry = unwrap(await getEntryByDockItemId(USER_A, id))
      expect(entry.actions).toEqual(['需要拆分', '需要评审'])
    })

    it('selectedProject takes priority over suggestion inferred project', async () => {
      const id = await createDockItem(USER_A, '项目需求分析')
      await suggestItem(USER_A, id)

      const suggestedItem = unwrap(await suggestItem(USER_A, id))
      const suggestedProject = suggestedItem.suggestions.find((s) => s.type === 'project')
      const inferredProject = suggestedProject?.label ?? null

      await updateSelectedProject(USER_A, id, 'MyCustomProject')

      await archiveItem(USER_A, id)

      const entry = unwrap(await getEntryByDockItemId(USER_A, id))
      expect(entry.project).toBe('MyCustomProject')
      if (inferredProject) {
        expect(entry.project).not.toBe(inferredProject)
      }
    })

    it('selectedActions take priority over suggestion inferred actions', async () => {
      const id = await createDockItem(USER_A, '技术方案设计')
      await suggestItem(USER_A, id)

      await updateSelectedActions(USER_A, id, ['自定义动作'])

      await archiveItem(USER_A, id)

      const entry = unwrap(await getEntryByDockItemId(USER_A, id))
      expect(entry.actions).toEqual(['自定义动作'])
    })

    it('falls back to suggestion inferred project when no selectedProject', async () => {
      const id = await createDockItem(USER_A, '项目需求分析')
      await suggestItem(USER_A, id)

      await archiveItem(USER_A, id)

      const entry = unwrap(await getEntryByDockItemId(USER_A, id))
      expect(entry.project).toBeDefined()
    })

    it('falls back to suggestion inferred actions when no selectedActions', async () => {
      const id = await createDockItem(USER_A, '技术方案设计')
      await suggestItem(USER_A, id)

      await archiveItem(USER_A, id)

      const entry = unwrap(await getEntryByDockItemId(USER_A, id))
      expect(entry.actions).toBeDefined()
      expect(entry.actions.length).toBeGreaterThanOrEqual(0)
    })

    it('archived entry with selectedProject is findable by listArchivedEntriesByProject', async () => {
      const id = await createDockItem(USER_A, '项目需求分析')
      await suggestItem(USER_A, id)

      await updateSelectedProject(USER_A, id, 'MindDock')

      await archiveItem(USER_A, id)

      const byProject = await listArchivedEntriesByProject(USER_A, 'MindDock')
      expect(byProject).toHaveLength(1)
      expect(byProject[0].project).toBe('MindDock')
    })

    it('preserves selectedProject/selectedActions on re-archive', async () => {
      const id = await createDockItem(USER_A, '测试内容')
      await suggestItem(USER_A, id)
      await updateSelectedProject(USER_A, id, 'ProjectA')
      await updateSelectedActions(USER_A, id, ['action1'])
      await archiveItem(USER_A, id)

      await reopenItem(USER_A, id)
      await suggestItem(USER_A, id)
      await archiveItem(USER_A, id)

      const entry = unwrap(await getEntryByDockItemId(USER_A, id))
      expect(entry.project).toBe('ProjectA')
      expect(entry.actions).toEqual(['action1'])
    })
  })

  describe('createDockItem chain link validation', () => {
    it('creates item with valid sourceId and parentId', async () => {
      const sourceId = await createDockItem(USER_A, '源记录')
      const parentId = await createDockItem(USER_A, '父记录')
      const derivedId = await createDockItem(USER_A, '派生记录', 'text', { sourceId, parentId })

      const items = await listDockItems(USER_A)
      const derived = items.find((i) => i.id === derivedId)
      expect(derived).toBeDefined()
      if (derived) {
        expect(derived.sourceId).toBe(sourceId)
        expect(derived.parentId).toBe(parentId)
      }
    })

    it('rejects cross-user sourceId and does not create item', async () => {
      const otherItemId = await createDockItem(USER_B, 'User B 记录')
      const countBefore = await countDockItems(USER_A)

      await expect(
        createDockItem(USER_A, '非法记录', 'text', { sourceId: otherItemId }),
      ).rejects.toThrow('invalid chain links')

      expect(await countDockItems(USER_A)).toBe(countBefore)
    })

    it('rejects cross-user parentId and does not create item', async () => {
      const otherItemId = await createDockItem(USER_B, 'User B 记录')
      const countBefore = await countDockItems(USER_A)

      await expect(
        createDockItem(USER_A, '非法记录', 'text', { parentId: otherItemId }),
      ).rejects.toThrow('invalid chain links')

      expect(await countDockItems(USER_A)).toBe(countBefore)
    })

    it('rejects nonexistent sourceId and does not create item', async () => {
      const countBefore = await countDockItems(USER_A)

      await expect(
        createDockItem(USER_A, '非法记录', 'text', { sourceId: 99999 }),
      ).rejects.toThrow('invalid chain links')

      expect(await countDockItems(USER_A)).toBe(countBefore)
    })

    it('rejects nonexistent parentId and does not create item', async () => {
      const countBefore = await countDockItems(USER_A)

      await expect(
        createDockItem(USER_A, '非法记录', 'text', { parentId: 99999 }),
      ).rejects.toThrow('invalid chain links')

      expect(await countDockItems(USER_A)).toBe(countBefore)
    })

    it('creates item without chain links when options omitted', async () => {
      const id = await createDockItem(USER_A, '普通记录')
      expect(id).toBeDefined()
      expect(typeof id).toBe('number')

      const items = await listDockItems(USER_A)
      const item = items.find((i) => i.id === id)
      expect(item?.sourceId).toBeNull()
      expect(item?.parentId).toBeNull()
    })

    it('creates item when both sourceId and parentId are null', async () => {
      const id = await createDockItem(USER_A, '显式空链路', 'text', { sourceId: null, parentId: null })
      expect(id).toBeDefined()

      const items = await listDockItems(USER_A)
      const item = items.find((i) => i.id === id)
      expect(item?.sourceId).toBeNull()
      expect(item?.parentId).toBeNull()
    })
  })

  describe('chain links (sourceId/parentId)', () => {
    it('sets sourceId for reorganize relation', async () => {
      const sourceId = await createDockItem(USER_A, '原始记录')
      const derivedId = await createDockItem(USER_A, '重新整理的记录')

      const updated = unwrap(await updateChainLinks(USER_A, derivedId, sourceId, null))
      expect(updated.sourceId).toBe(sourceId)
      expect(updated.parentId).toBeNull()
    })

    it('sets sourceId=parentId for continue_edit relation', async () => {
      const sourceId = await createDockItem(USER_A, '原始记录')
      const derivedId = await createDockItem(USER_A, '继续编辑的记录')

      const updated = unwrap(await updateChainLinks(USER_A, derivedId, sourceId, sourceId))
      expect(updated.sourceId).toBe(sourceId)
      expect(updated.parentId).toBe(sourceId)
    })

    it('sets parentId for derive relation', async () => {
      const parentId = await createDockItem(USER_A, '父记录')
      const derivedId = await createDockItem(USER_A, '派生记录')

      const updated = unwrap(await updateChainLinks(USER_A, derivedId, null, parentId))
      expect(updated.sourceId).toBeNull()
      expect(updated.parentId).toBe(parentId)
    })

    it('clears chain links by setting both to null', async () => {
      const sourceId = await createDockItem(USER_A, '原始记录')
      const derivedId = await createDockItem(USER_A, '派生记录')

      await updateChainLinks(USER_A, derivedId, sourceId, null)
      const cleared = unwrap(await updateChainLinks(USER_A, derivedId, null, null))
      expect(cleared.sourceId).toBeNull()
      expect(cleared.parentId).toBeNull()
    })

    it('blocks cross-user chain link update (target item)', async () => {
      const sourceId = await createDockItem(USER_A, 'User A 记录')
      const derivedId = await createDockItem(USER_A, 'User A 派生')

      const result = await updateChainLinks(USER_B, derivedId, sourceId, null)
      expect(result).toBeNull()
    })

    it('blocks sourceId pointing to other user item', async () => {
      const otherUserItemId = await createDockItem(USER_B, 'User B 记录')
      const myItemId = await createDockItem(USER_A, 'User A 记录')

      const result = await updateChainLinks(USER_A, myItemId, otherUserItemId, null)
      expect(result).toBeNull()

      const original = unwrap(await listDockItems(USER_A)).find((i) => i.id === myItemId)
      expect(original?.sourceId).toBeNull()
    })

    it('blocks parentId pointing to other user item', async () => {
      const otherUserItemId = await createDockItem(USER_B, 'User B 记录')
      const myItemId = await createDockItem(USER_A, 'User A 记录')

      const result = await updateChainLinks(USER_A, myItemId, null, otherUserItemId)
      expect(result).toBeNull()

      const original = unwrap(await listDockItems(USER_A)).find((i) => i.id === myItemId)
      expect(original?.parentId).toBeNull()
    })

    it('blocks sourceId pointing to nonexistent id', async () => {
      const myItemId = await createDockItem(USER_A, 'User A 记录')

      const result = await updateChainLinks(USER_A, myItemId, 99999, null)
      expect(result).toBeNull()
    })

    it('blocks parentId pointing to nonexistent id', async () => {
      const myItemId = await createDockItem(USER_A, 'User A 记录')

      const result = await updateChainLinks(USER_A, myItemId, null, 99999)
      expect(result).toBeNull()
    })

    it('blocks sourceId equal to self id', async () => {
      const myItemId = await createDockItem(USER_A, 'User A 记录')

      const result = await updateChainLinks(USER_A, myItemId, myItemId, null)
      expect(result).toBeNull()
    })

    it('blocks parentId equal to self id', async () => {
      const myItemId = await createDockItem(USER_A, 'User A 记录')

      const result = await updateChainLinks(USER_A, myItemId, null, myItemId)
      expect(result).toBeNull()
    })

    it('allows valid same-user source and parent', async () => {
      const sourceId = await createDockItem(USER_A, 'Source')
      const parentId = await createDockItem(USER_A, 'Parent')
      const myItemId = await createDockItem(USER_A, 'Derived')

      const updated = unwrap(await updateChainLinks(USER_A, myItemId, sourceId, parentId))
      expect(updated.sourceId).toBe(sourceId)
      expect(updated.parentId).toBe(parentId)
    })

    it('preserves chain links through suggest/archive cycle', async () => {
      const sourceId = await createDockItem(USER_A, '原始记录')
      const derivedId = await createDockItem(USER_A, '派生记录')

      await updateChainLinks(USER_A, derivedId, sourceId, null)
      await suggestItem(USER_A, derivedId)
      await archiveItem(USER_A, derivedId)

      const items = await listDockItems(USER_A)
      const archived = items.find((i) => i.id === derivedId)
      expect(archived?.sourceId).toBe(sourceId)
    })
  })

  describe('getChainProvenance', () => {
    it('returns provenance for item with sourceId (reorganize)', async () => {
      const sourceId = await createDockItem(USER_A, '原始会议记录\n详细内容')
      const derivedId = await createDockItem(USER_A, '重新整理的记录')
      await updateChainLinks(USER_A, derivedId, sourceId, null)

      const provenance = await getChainProvenance(USER_A, derivedId)

      expect(provenance).not.toBeNull()
      if (!provenance) return
      expect(provenance.itemId).toBe(derivedId)
      expect(provenance.sourceId).toBe(sourceId)
      expect(provenance.parentId).toBeNull()
      expect(provenance.relationType).toBe('reorganize')
      expect(provenance.sourceTitle).toBe('原始会议记录')
      expect(provenance.parentTitle).toBeNull()
    })

    it('returns provenance for item with sourceId=parentId (continue_edit)', async () => {
      const sourceId = await createDockItem(USER_A, '编辑中的文档\n第二行')
      const derivedId = await createDockItem(USER_A, '继续编辑的文档')
      await updateChainLinks(USER_A, derivedId, sourceId, sourceId)

      const provenance = await getChainProvenance(USER_A, derivedId)

      expect(provenance).not.toBeNull()
      if (!provenance) return
      expect(provenance.relationType).toBe('continue_edit')
      expect(provenance.sourceTitle).toBe('编辑中的文档')
      expect(provenance.parentTitle).toBe('编辑中的文档')
    })

    it('returns provenance for item with different sourceId and parentId (derive)', async () => {
      const sourceId = await createDockItem(USER_A, '源记录标题')
      const parentId = await createDockItem(USER_A, '父记录标题')
      const derivedId = await createDockItem(USER_A, '派生记录')
      await updateChainLinks(USER_A, derivedId, sourceId, parentId)

      const provenance = await getChainProvenance(USER_A, derivedId)

      expect(provenance).not.toBeNull()
      if (!provenance) return
      expect(provenance.relationType).toBe('derive')
      expect(provenance.sourceTitle).toBe('源记录标题')
      expect(provenance.parentTitle).toBe('父记录标题')
    })

    it('returns provenance for root item with no chain links', async () => {
      const id = await createDockItem(USER_A, '独立记录')

      const provenance = await getChainProvenance(USER_A, id)

      expect(provenance).not.toBeNull()
      if (!provenance) return
      expect(provenance.sourceId).toBeNull()
      expect(provenance.parentId).toBeNull()
      expect(provenance.sourceTitle).toBeNull()
      expect(provenance.parentTitle).toBeNull()
    })

    it('returns null for nonexistent item', async () => {
      const provenance = await getChainProvenance(USER_A, 99999)
      expect(provenance).toBeNull()
    })

    it('returns null for item belonging to different user', async () => {
      const id = await createDockItem(USER_A, '用户A的记录')

      const provenance = await getChainProvenance(USER_B, id)
      expect(provenance).toBeNull()
    })

    it('does not expose source title from different user', async () => {
      await createDockItem(USER_A, '用户A的源记录')
      const derivedId = await createDockItem(USER_B, '用户B的派生记录')

      await updateChainLinks(USER_B, derivedId, null, null)

      const provenance = await getChainProvenance(USER_B, derivedId)
      expect(provenance).not.toBeNull()
      if (provenance) {
        expect(provenance.sourceTitle).toBeNull()
      }
    })

    it('truncates long source title to 60 chars', async () => {
      const longTitle = '这'.repeat(100)
      const sourceId = await createDockItem(USER_A, longTitle)
      const derivedId = await createDockItem(USER_A, '派生记录')
      await updateChainLinks(USER_A, derivedId, sourceId, null)

      const provenance = await getChainProvenance(USER_A, derivedId)

      expect(provenance).not.toBeNull()
      if (provenance?.sourceTitle) {
        expect(provenance.sourceTitle.length).toBeLessThanOrEqual(60)
      }
    })
  })

  describe('resolveRecommendationCandidate workspace isolation', () => {
    const OTHER_WORKSPACE = 'other-workspace'

    afterEach(cleanAll)

    it('rejects entry from other workspace', async () => {
      const entryId = await db.table('entries').add({
        userId: USER_A,
        workspaceId: OTHER_WORKSPACE,
        sourceDockItemId: 0,
        title: 'Other WS Entry',
        content: 'content',
        type: 'note',
        tags: [],
        project: null,
        actions: [],
        createdAt: new Date(),
        archivedAt: new Date(),
      })

      const result = await resolveRecommendationCandidate(USER_A, 'entry', String(entryId))
      expect(result).toBeNull()
    })

    it('rejects document from other workspace', async () => {
      const entryId = await db.table('entries').add({
        userId: USER_A,
        workspaceId: OTHER_WORKSPACE,
        sourceDockItemId: 0,
        title: 'Other WS Document',
        content: 'content',
        type: 'note',
        tags: [],
        project: null,
        actions: [],
        createdAt: new Date(),
        archivedAt: new Date(),
      })

      const result = await resolveRecommendationCandidate(USER_A, 'document', String(entryId))
      expect(result).toBeNull()
    })

    it('rejects dockItem from other workspace', async () => {
      const itemId = await db.table('dockItems').add({
        userId: USER_A,
        workspaceId: OTHER_WORKSPACE,
        rawText: 'Other WS DockItem',
        topic: null,
        sourceType: 'text',
        status: 'pending',
        suggestions: [],
        userTags: [],
        selectedActions: [],
        selectedProject: null,
        sourceId: null,
        parentId: null,
        processedAt: null,
        createdAt: new Date(),
      })

      const result = await resolveRecommendationCandidate(USER_A, 'dockItem', String(itemId))
      expect(result).toBeNull()
    })

    it('rejects tag from other workspace', async () => {
      await db.table('tags').add({
        id: 'other-ws-tag',
        userId: USER_A,
        workspaceId: OTHER_WORKSPACE,
        name: 'Other WS Tag',
        color: '#000',
        createdAt: new Date(),
      })

      const result = await resolveRecommendationCandidate(USER_A, 'tag', 'other-ws-tag')
      expect(result).toBeNull()
    })

    it('rejects project/collection from other workspace', async () => {
      await db.table('collections').add({
        id: 'other-ws-project',
        userId: USER_A,
        workspaceId: OTHER_WORKSPACE,
        name: 'Other WS Project',
        collectionType: 'project',
        createdAt: new Date(),
      })

      const result = await resolveRecommendationCandidate(USER_A, 'project', 'other-ws-project')
      expect(result).toBeNull()
    })

    it('rejects mindNode from other workspace', async () => {
      await db.table('mindNodes').add({
        id: 'other-ws-node',
        userId: USER_A,
        workspaceId: OTHER_WORKSPACE,
        nodeType: 'document',
        label: 'Other WS Node',
        state: 'anchored',
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const result = await resolveRecommendationCandidate(USER_A, 'mindNode', 'other-ws-node')
      expect(result).toBeNull()
    })

    it('accepts entry from default workspace', async () => {
      const entryId = await db.table('entries').add({
        userId: USER_A,
        workspaceId: DEFAULT_WORKSPACE_ID,
        sourceDockItemId: 0,
        title: 'Default WS Entry',
        content: 'content',
        type: 'note',
        tags: [],
        project: null,
        actions: [],
        createdAt: new Date(),
        archivedAt: new Date(),
      })

      const result = await resolveRecommendationCandidate(USER_A, 'entry', String(entryId))
      expect(result).not.toBeNull()
      if (result) {
        expect(result.title).toBe('Default WS Entry')
      }
    })
  })

  describe('createDockItem cross-workspace chain link isolation', () => {
    const OTHER_WORKSPACE = 'other-workspace'

    afterEach(cleanAll)

    it('rejects sourceId pointing to other workspace DockItem', async () => {
      const otherItemId = await db.table('dockItems').add({
        userId: USER_A,
        workspaceId: OTHER_WORKSPACE,
        rawText: 'Other WS DockItem',
        topic: null,
        sourceType: 'text',
        status: 'pending',
        suggestions: [],
        userTags: [],
        selectedActions: [],
        selectedProject: null,
        sourceId: null,
        parentId: null,
        processedAt: null,
        createdAt: new Date(),
      })

      await expect(
        createDockItem(USER_A, '非法链接', 'text', { sourceId: otherItemId as number }),
      ).rejects.toThrow()
    })

    it('rejects parentId pointing to other workspace DockItem', async () => {
      const otherItemId = await db.table('dockItems').add({
        userId: USER_A,
        workspaceId: OTHER_WORKSPACE,
        rawText: 'Other WS DockItem',
        topic: null,
        sourceType: 'text',
        status: 'pending',
        suggestions: [],
        userTags: [],
        selectedActions: [],
        selectedProject: null,
        sourceId: null,
        parentId: null,
        processedAt: null,
        createdAt: new Date(),
      })

      await expect(
        createDockItem(USER_A, '非法链接', 'text', { parentId: otherItemId as number }),
      ).rejects.toThrow()
    })
  })
})
