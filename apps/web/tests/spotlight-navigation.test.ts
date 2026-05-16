import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

import { db } from '@/lib/db'
import {
  createDraft,
  listDrafts,
  createTip,
  listActiveTips,
  createDockItem,
  suggestItem,
  archiveItem,
  listArchivedEntries,
  upsertMindNode,
  listMindNodes,
} from '@/lib/repository'
import { isArchived, isDiscarded, isHidden, assertNotIrreversible } from '@/lib/lifecycleGuards'
import { getLocalHealthReport } from '@/lib/localHealthReport'
import {
  searchDrafts,
  searchDocuments,
  searchTips,
  searchMindNodes,
  searchSettingsCommands,
} from '@/app/workspace/features/home/useSpotlightSearch'

const USER_A = 'user_spotlight_nav_test'

async function cleanAll() {
  await db.table('dockItems').clear()
  await db.table('entries').clear()
  await db.table('tags').clear()
  await db.table('entryTagRelations').clear()
  await db.table('collections').clear()
  await db.table('editorDrafts').clear()
  await db.table('tips').clear()
  await db.table('mindNodes').clear()
  await db.table('mindEdges').clear()
}

describe('Spotlight Search & Navigation Wiring', () => {
  afterEach(cleanAll)

  describe('Spotlight Search - No Hardcoded Fake Results', () => {
    it('returns empty when no drafts exist', async () => {
      const drafts = await listDrafts(USER_A)
      const results = searchDrafts(drafts, '任意关键词')
      expect(results).toHaveLength(0)
    })

    it('returns empty when no tips exist', async () => {
      const tips = await listActiveTips(USER_A)
      const results = searchTips(tips, '任意关键词')
      expect(results).toHaveLength(0)
    })

    it('returns empty when no archived entries exist', async () => {
      const entries = await listArchivedEntries(USER_A)
      const results = searchDocuments(entries, '任意关键词')
      expect(results).toHaveLength(0)
    })

    it('returns empty when no mind nodes exist', async () => {
      const nodes = await listMindNodes(USER_A)
      const results = searchMindNodes(nodes, '任意关键词')
      expect(results).toHaveLength(0)
    })

    it('search matching returns nothing for empty database', async () => {
      const drafts = await listDrafts(USER_A)
      const tips = await listActiveTips(USER_A)
      const entries = await listArchivedEntries(USER_A)
      const nodes = await listMindNodes(USER_A)

      expect(searchDrafts(drafts, '不存在的关键词')).toHaveLength(0)
      expect(searchTips(tips, '不存在的关键词')).toHaveLength(0)
      expect(searchDocuments(entries, '不存在的关键词')).toHaveLength(0)
      expect(searchMindNodes(nodes, '不存在的关键词')).toHaveLength(0)
    })
  })

  describe('Spotlight Search - Can Search Real Draft/Document/Tip/Mind Node', () => {
    it('finds a draft by title', async () => {
      await createDraft(USER_A, '测试草稿标题', '这是草稿内容')
      const drafts = await listDrafts(USER_A)
      const results = searchDrafts(drafts, '草稿标题')
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('测试草稿标题')
    })

    it('finds a tip by content', async () => {
      await createTip(USER_A, '测试闪念内容')
      const tips = await listActiveTips(USER_A)
      const results = searchTips(tips, '闪念')
      expect(results).toHaveLength(1)
      expect(results[0].title).toContain('闪念')
    })

    it('finds an archived document by title', async () => {
      const itemId = await createDockItem(USER_A, '测试文档标题')
      await suggestItem(USER_A, itemId)
      await archiveItem(USER_A, itemId)
      const entries = await listArchivedEntries(USER_A)
      const results = searchDocuments(entries, '文档标题')
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('finds a mind node by label', async () => {
      await upsertMindNode({
        userId: USER_A,
        nodeType: 'topic',
        label: '测试思维节点',
        state: 'anchored',
      })
      const nodes = await listMindNodes(USER_A)
      const results = searchMindNodes(nodes, '思维节点')
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('测试思维节点')
    })
  })

  describe('Search Result Target Mapping', () => {
    it('draft results have targetTab=editor and targetId=draft.id', async () => {
      await createDraft(USER_A, '映射测试草稿', '内容')
      const drafts = await listDrafts(USER_A)
      const results = searchDrafts(drafts, '映射测试草稿')
      expect(results).toHaveLength(1)
      expect(results[0].targetTab).toBe('editor')
      expect(results[0].targetId).toBe(drafts[0].id)
      expect(results[0].type).toBe('draft')
    })

    it('document results have targetTab=editor and targetId=entry.id', async () => {
      const itemId = await createDockItem(USER_A, '映射测试文档')
      await suggestItem(USER_A, itemId)
      await archiveItem(USER_A, itemId)
      const entries = await listArchivedEntries(USER_A)
      const results = searchDocuments(entries, '映射测试文档')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].targetTab).toBe('editor')
      expect(results[0].targetId).toBe(results[0].id)
      expect(results[0].type).toBe('document')
    })

    it('tip results have targetTab=dock', async () => {
      await createTip(USER_A, '映射测试闪念')
      const tips = await listActiveTips(USER_A)
      const results = searchTips(tips, '映射测试闪念')
      expect(results).toHaveLength(1)
      expect(results[0].targetTab).toBe('dock')
      expect(results[0].type).toBe('tip')
    })

    it('mind node results have targetTab=mind and targetId=node.id', async () => {
      await upsertMindNode({
        userId: USER_A,
        nodeType: 'topic',
        label: '映射测试节点',
        state: 'anchored',
      })
      const nodes = await listMindNodes(USER_A)
      const results = searchMindNodes(nodes, '映射测试节点')
      expect(results).toHaveLength(1)
      expect(results[0].targetTab).toBe('mind')
      expect(results[0].targetId).toBe(nodes[0].id)
      expect(results[0].type).toBe('mind_node')
    })

    it('settings command results have targetTab=settings', () => {
      const results = searchSettingsCommands('设置')
      expect(results.length).toBeGreaterThanOrEqual(1)
      results.forEach(r => {
        expect(r.targetTab).toBe('settings')
        expect(r.type).toBe('settings_command')
      })
    })

    it('searching cloud does not return Cloud/sync Spotlight command results', () => {
      const results = searchSettingsCommands('cloud')
      expect(results).toHaveLength(0)
    })

    it('searching 同步 does not return Cloud/sync Spotlight command results', () => {
      const results = searchSettingsCommands('同步')
      expect(results).toHaveLength(0)
    })
  })

  describe('Settings - No Fake Sync/Connection/Path Semantics', () => {
    const pagePath = join(process.cwd(), 'app/workspace/page.tsx')
    const pageContent = readFileSync(pagePath, 'utf-8')

    it('vault path is NOT a hardcoded fake local path', () => {
      expect(pageContent).not.toContain('/Users/Admin/Documents/MindDock_Vault')
    })

    it('vault path value contains Browser or Local Storage', () => {
      expect(pageContent).toContain('Browser Local Storage Mode')
    })

    it('does not contain fake connected sync text', () => {
      expect(pageContent).not.toContain('已连接并实时同步中')
      expect(pageContent).not.toContain('断开连接')
    })

    it('Cloud/WebDAV/S3 are not in current roadmap, no fake cloud entry', () => {
      expect(pageContent).not.toContain('已连接并实时同步中')
      expect(pageContent).not.toContain('WebDAV')
      expect(pageContent).not.toContain('S3')
      expect(pageContent).toContain('不属于当前路线')
    })
  })

  describe('Home/Daily Brief Navigation Intent', () => {
    const pagePath = join(process.cwd(), 'app/workspace/page.tsx')
    const pageContent = readFileSync(pagePath, 'utf-8')

    it('HomeViewProps includes navigation callbacks', () => {
      expect(pageContent).toContain('onOpenDraft?')
      expect(pageContent).toContain('onOpenEntry?')
      expect(pageContent).toContain('onOpenDock?')
      expect(pageContent).toContain('onOpenReview?')
      expect(pageContent).toContain('onOpenBriefing?')
    })

    it('DailyBriefingView includes navigation callbacks', () => {
      const briefingSection = pageContent.substring(
        pageContent.indexOf('DailyBriefingView'),
        pageContent.indexOf('DailyBriefingView') + 500,
      )
      expect(briefingSection).toContain('onOpenDraft')
      expect(briefingSection).toContain('onOpenEntry')
      expect(briefingSection).toContain('onOpenDock')
      expect(briefingSection).toContain('onOpenMind')
      expect(briefingSection).toContain('onOpenReview')
    })

    it('WorkspacePage passes callbacks to HomeView', () => {
      const homeViewUsage = pageContent.substring(
        pageContent.indexOf('<HomeView'),
        pageContent.indexOf('<HomeView') + 1500,
      )
      expect(homeViewUsage).toContain('onOpenDraft')
      expect(homeViewUsage).toContain('onOpenEntry')
      expect(homeViewUsage).toContain('onOpenDock')
      expect(homeViewUsage).toContain('onOpenReview')
      expect(homeViewUsage).toContain('onOpenBriefing')
    })

    it('WorkspacePage passes callbacks to DailyBriefingView', () => {
      const briefingUsage = pageContent.substring(
        pageContent.indexOf('<DailyBriefingView'),
        pageContent.indexOf('<DailyBriefingView') + 800,
      )
      expect(briefingUsage).toContain('onOpenDraft')
      expect(briefingUsage).toContain('onOpenEntry')
      expect(briefingUsage).toContain('onOpenDock')
      expect(briefingUsage).toContain('onOpenMind')
      expect(briefingUsage).toContain('onOpenReview')
    })
  })

  describe('Lifecycle Guards Not Broken', () => {
    it('isArchived returns true for entry with archivedAt', () => {
      expect(isArchived({ archivedAt: new Date() } as any)).toBe(true)
    })

    it('isArchived returns false for entry with archivedAt null', () => {
      expect(isArchived({ archivedAt: null } as any)).toBe(false)
    })

    it('isDiscarded returns true for discarded status', () => {
      expect(isDiscarded({ status: 'discarded' })).toBe(true)
    })

    it('isDiscarded returns false for active status', () => {
      expect(isDiscarded({ status: 'active' })).toBe(false)
    })

    it('isHidden returns true for archived state', () => {
      expect(isHidden({ state: 'archived', metadata: null })).toBe(true)
    })

    it('isHidden returns false for active state with empty metadata', () => {
      expect(isHidden({ state: 'active', metadata: {} })).toBe(false)
    })

    it('isHidden returns true for active state with hiddenAt metadata', () => {
      expect(isHidden({ state: 'active', metadata: { hiddenAt: new Date() } })).toBe(true)
    })

    it('assertNotIrreversible throws for unconfirmed action', () => {
      expect(() => assertNotIrreversible('delete_all', false)).toThrow()
    })
  })

  describe('Health Bridge Not Broken', () => {
    it('getLocalHealthReport returns valid report structure', async () => {
      const report = await getLocalHealthReport(USER_A)
      expect(report).toBeDefined()
      expect(report.userId).toBe(USER_A)
      expect(report.source).toBe('local-indexeddb')
      expect(report.trustLevel).toBe('local-report')
      expect(typeof report.score).toBe('number')
      expect(report.score).toBeGreaterThanOrEqual(0)
      expect(report.score).toBeLessThanOrEqual(100)
      expect(['healthy', 'watch', 'attention', 'critical']).toContain(report.level)
      expect(report.summary).toBeDefined()
      expect(report.signals).toBeDefined()
      expect(Array.isArray(report.signals)).toBe(true)
      expect(report.sections).toBeDefined()
      expect(report.sections.documents).toBeDefined()
      expect(report.sections.drafts).toBeDefined()
      expect(report.sections.tips).toBeDefined()
      expect(report.sections.mind).toBeDefined()
      expect(report.sections.taxonomy).toBeDefined()
      expect(report.sections.recommendations).toBeDefined()
    })
  })
})
