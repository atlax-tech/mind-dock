import 'fake-indexeddb/auto'
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { DEFAULT_WORKSPACE_ID } from '@atlax/domain'
import {
  createDockItem,
  suggestItem,
  archiveItem,
  createDraft,
  discardDraft,
  upsertMindNode,
  upsertMindEdge,
  createRecommendation,
  updateArchivedEntry,
  createTip,
  discardTip,
  archiveMindNode,
  restoreMindNode,
} from '@/lib/repository'
import {
  getLocalHealthReport,
  isStale,
  isRecentlyUpdated,
  STALE_THRESHOLD_DAYS,
  RECENTLY_UPDATED_DAYS,
} from '@/lib/localHealthReport'

const USER_A = 'user_health_report_a'

async function cleanAll() {
  await db.table('dockItems').clear()
  await db.table('entries').clear()
  await db.table('editorDrafts').clear()
  await db.table('mindNodes').clear()
  await db.table('mindEdges').clear()
  await db.table('tags').clear()
  await db.table('collections').clear()
  await db.table('recommendations').clear()
  await db.table('recommendationEvents').clear()
  await db.table('userBehaviorEvents').clear()
  await db.table('tips').clear()
}

function unwrap<T>(value: T | null | undefined): T {
  expect(value).not.toBeNull()
  expect(value).not.toBeUndefined()
  return value as T
}

describe('Pure functions: isStale', () => {
  it('returns true when updatedAt exceeds threshold', () => {
    const now = Date.now()
    const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000)
    expect(isStale(eightDaysAgo, new Date(now), now)).toBe(true)
  })

  it('returns true when only createdAt exceeds threshold', () => {
    const now = Date.now()
    const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000)
    expect(isStale(null, eightDaysAgo, now)).toBe(true)
  })

  it('returns false when within threshold', () => {
    const now = Date.now()
    const sixDaysAgo = new Date(now - 6 * 24 * 60 * 60 * 1000)
    expect(isStale(sixDaysAgo, null, now)).toBe(false)
  })

  it('returns false when both dates are null', () => {
    expect(isStale(null, null, Date.now())).toBe(false)
  })
})

describe('Pure functions: isRecentlyUpdated', () => {
  it('returns true when updatedAt is within threshold', () => {
    const now = Date.now()
    const sixDaysAgo = new Date(now - 6 * 24 * 60 * 60 * 1000)
    expect(isRecentlyUpdated(sixDaysAgo, null, now)).toBe(true)
  })

  it('returns true when only createdAt is within threshold', () => {
    const now = Date.now()
    const sixDaysAgo = new Date(now - 6 * 24 * 60 * 60 * 1000)
    expect(isRecentlyUpdated(null, sixDaysAgo, now)).toBe(true)
  })

  it('returns false when exceeds threshold', () => {
    const now = Date.now()
    const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000)
    expect(isRecentlyUpdated(eightDaysAgo, null, now)).toBe(false)
  })

  it('returns false when both dates are null', () => {
    expect(isRecentlyUpdated(null, null, Date.now())).toBe(false)
  })
})

describe('Pure functions: constants', () => {
  it('STALE_THRESHOLD_DAYS is 7', () => {
    expect(STALE_THRESHOLD_DAYS).toBe(7)
  })

  it('RECENTLY_UPDATED_DAYS is 7', () => {
    expect(RECENTLY_UPDATED_DAYS).toBe(7)
  })
})

describe('Empty database', () => {
  afterEach(() => cleanAll())

  it('returns valid report with score 100', async () => {
    const report = await getLocalHealthReport(USER_A)
    expect(report.score).toBe(100)
  })

  it('has healthy level', async () => {
    const report = await getLocalHealthReport(USER_A)
    expect(report.level).toBe('healthy')
  })

  it('has all zero counts', async () => {
    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.documentsTotal).toBe(0)
    expect(report.summary.activeDocuments).toBe(0)
    expect(report.summary.archivedDocuments).toBe(0)
    expect(report.summary.recentlyUpdatedDocuments).toBe(0)
    expect(report.summary.draftsTotal).toBe(0)
    expect(report.summary.staleDrafts).toBe(0)
    expect(report.summary.activeTips).toBe(0)
    expect(report.summary.convertedTips).toBe(0)
    expect(report.summary.discardedTips).toBe(0)
    expect(report.summary.mindNodes).toBe(0)
    expect(report.summary.mindEdges).toBe(0)
    expect(report.summary.isolatedMindNodes).toBe(0)
    expect(report.summary.orphanDocuments).toBe(0)
    expect(report.summary.tagCount).toBe(0)
    expect(report.summary.projectCount).toBe(0)
    expect(report.summary.collectionCount).toBe(0)
    expect(report.summary.untaggedEntries).toBe(0)
    expect(report.summary.pendingRecommendations).toBe(0)
    expect(report.summary.acceptedRecommendations).toBe(0)
    expect(report.summary.rejectedRecommendations).toBe(0)
    expect(report.summary.ignoredRecommendations).toBe(0)
  })

  it('has empty signals', async () => {
    const report = await getLocalHealthReport(USER_A)
    expect(report.signals).toEqual([])
  })

  it('has empty suggestions', async () => {
    const report = await getLocalHealthReport(USER_A)
    expect(report.suggestions).toEqual([])
  })

  it('has correct source and trustLevel', async () => {
    const report = await getLocalHealthReport(USER_A)
    expect(report.source).toBe('local-indexeddb')
    expect(report.trustLevel).toBe('local-report')
  })
})

describe('Documents metrics', () => {
  afterEach(() => cleanAll())

  it('counts documents total correctly', async () => {
    const id1 = await createDockItem(USER_A, 'Doc 1')
    const id2 = await createDockItem(USER_A, 'Doc 2')
    const id3 = await createDockItem(USER_A, 'Doc 3')
    await suggestItem(USER_A, id1)
    await suggestItem(USER_A, id2)
    await suggestItem(USER_A, id3)
    await archiveItem(USER_A, id1)
    await archiveItem(USER_A, id2)
    await archiveItem(USER_A, id3)

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.documentsTotal).toBe(3)
  })

  it('counts archived documents correctly', async () => {
    const id1 = await createDockItem(USER_A, 'Doc 1')
    const id2 = await createDockItem(USER_A, 'Doc 2')
    await suggestItem(USER_A, id1)
    await suggestItem(USER_A, id2)
    await archiveItem(USER_A, id1)
    await archiveItem(USER_A, id2)
    const firstEntry = await db.table('entries').where('userId').equals(USER_A).first()
    expect(firstEntry).toBeDefined()
    const entryId = (firstEntry as Record<string, unknown>).id as number
    await updateArchivedEntry(USER_A, entryId, { archivedAt: new Date() })

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.archivedDocuments).toBe(2)
  })

  it('counts active documents correctly', async () => {
    const id1 = await createDockItem(USER_A, 'Doc 1')
    const id2 = await createDockItem(USER_A, 'Doc 2')
    const id3 = await createDockItem(USER_A, 'Doc 3')
    await suggestItem(USER_A, id1)
    await suggestItem(USER_A, id2)
    await suggestItem(USER_A, id3)
    await archiveItem(USER_A, id1)
    await archiveItem(USER_A, id2)
    await archiveItem(USER_A, id3)

    const entries = await db.table('entries').where('userId').equals(USER_A).toArray()
    await updateArchivedEntry(USER_A, entries[0].id, { archivedAt: null })
    await updateArchivedEntry(USER_A, entries[1].id, { archivedAt: null })

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.documentsTotal).toBe(3)
    expect(report.summary.activeDocuments).toBe(2)
    expect(report.summary.archivedDocuments).toBe(1)
  })

  it('counts recently updated documents correctly', async () => {
    const id1 = await createDockItem(USER_A, 'Doc 1')
    await suggestItem(USER_A, id1)
    await archiveItem(USER_A, id1)

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.recentlyUpdatedDocuments).toBe(1)
  })

  it('counts orphan documents correctly', async () => {
    await db.table('entries').add({
      userId: USER_A,
      sourceDockItemId: 0,
      title: 'Orphan',
      content: 'No tags, no project, no mind node',
      type: 'note',
      tags: [],
      project: null,
      actions: [],
      createdAt: new Date(),
      archivedAt: null,
      workspaceId: DEFAULT_WORKSPACE_ID,
    })

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.orphanDocuments).toBe(1)
  })
})

describe('Drafts metrics', () => {
  afterEach(() => cleanAll())

  it('counts active drafts correctly', async () => {
    await createDraft(USER_A, 'Draft 1')
    await createDraft(USER_A, 'Draft 2')
    await createDraft(USER_A, 'Draft 3')

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.draftsTotal).toBe(3)
  })

  it('counts stale drafts correctly', async () => {
    const draft = await createDraft(USER_A, 'Old draft')
    if (draft) {
      await db.table('editorDrafts').update(draft.id, {
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      })
    }

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.staleDrafts).toBe(1)
  })

  it('does not count discarded drafts in draftsTotal', async () => {
    const draft = unwrap(await createDraft(USER_A, 'To discard'))
    await discardDraft(USER_A, draft.id)

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.draftsTotal).toBe(0)
  })
})

describe('Tips metrics', () => {
  afterEach(() => cleanAll())

  it('counts active tips correctly', async () => {
    await createTip(USER_A, 'Tip 1')
    await createTip(USER_A, 'Tip 2')
    await createTip(USER_A, 'Tip 3')

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.activeTips).toBe(3)
  })

  it('counts converted tips correctly', async () => {
    const tip = unwrap(await createTip(USER_A, 'To convert'))
    await db.table('tips').update(tip.id, { status: 'converted' })

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.convertedTips).toBe(1)
  })

  it('counts discarded tips correctly', async () => {
    const tip = unwrap(await createTip(USER_A, 'To discard'))
    await discardTip(USER_A, tip.id)

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.discardedTips).toBe(1)
  })
})

describe('Mind graph metrics', () => {
  afterEach(() => cleanAll())

  it('counts mind nodes and edges correctly', async () => {
    const nodeA = await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Topic B' })
    await upsertMindEdge({
      userId: USER_A,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.mindNodes).toBe(2)
    expect(report.summary.mindEdges).toBe(1)
  })

  it('counts isolated mind nodes correctly', async () => {
    await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Isolated' })

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.isolatedMindNodes).toBe(1)
  })

  it('excludes hidden mind nodes from isolated count', async () => {
    await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Hidden', state: 'archived' })

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.isolatedMindNodes).toBe(0)
    expect(report.summary.mindNodes).toBe(0)
  })
})

describe('Lifecycle semantics', () => {
  afterEach(() => cleanAll())

  it('archived entries are counted in archivedDocuments not activeDocuments', async () => {
    const id1 = await createDockItem(USER_A, 'Doc 1')
    await suggestItem(USER_A, id1)
    await archiveItem(USER_A, id1)

    const entries = await db.table('entries').where('userId').equals(USER_A).toArray()
    expect(entries.length).toBe(1)
    await updateArchivedEntry(USER_A, entries[0].id, { archivedAt: new Date() })

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.archivedDocuments).toBe(1)
    expect(report.summary.activeDocuments).toBe(0)
  })

  it('discarded drafts are not counted in draftsTotal or staleDrafts', async () => {
    const draft = unwrap(await createDraft(USER_A, 'Old draft'))
    await db.table('editorDrafts').update(draft.id, {
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    })
    await discardDraft(USER_A, draft.id)

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.draftsTotal).toBe(0)
    expect(report.summary.staleDrafts).toBe(0)
  })

  it('discarded tips are counted in discardedTips not activeTips', async () => {
    const tip = unwrap(await createTip(USER_A, 'To discard'))
    await discardTip(USER_A, tip.id)

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.discardedTips).toBe(1)
    expect(report.summary.activeTips).toBe(0)
  })

  it('hidden mind nodes are excluded from mindNodes count', async () => {
    await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Visible' })
    await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Hidden', state: 'archived' })

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.mindNodes).toBe(1)
  })
})

describe('Recommendation metrics', () => {
  afterEach(() => cleanAll())

  it('counts pending recommendations correctly', async () => {
    await createRecommendation({
      userId: USER_A,
      subjectType: 'mindNode',
      subjectId: 'node-1',
      recommendationType: 'Link',
      candidateType: 'tag',
      candidateId: 'tag-1',
      confidenceScore: 0.8,
      status: 'generated',
    })
    await createRecommendation({
      userId: USER_A,
      subjectType: 'mindNode',
      subjectId: 'node-2',
      recommendationType: 'Link',
      candidateType: 'tag',
      candidateId: 'tag-2',
      confidenceScore: 0.7,
      status: 'shown',
    })

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.pendingRecommendations).toBe(2)
  })

  it('counts accepted recommendations correctly', async () => {
    await createRecommendation({
      userId: USER_A,
      subjectType: 'mindNode',
      subjectId: 'node-1',
      recommendationType: 'Link',
      candidateType: 'tag',
      candidateId: 'tag-1',
      confidenceScore: 0.8,
      status: 'accepted',
    })

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.acceptedRecommendations).toBe(1)
  })

  it('counts rejected recommendations correctly', async () => {
    await createRecommendation({
      userId: USER_A,
      subjectType: 'mindNode',
      subjectId: 'node-1',
      recommendationType: 'Link',
      candidateType: 'tag',
      candidateId: 'tag-1',
      confidenceScore: 0.8,
      status: 'rejected',
    })

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.rejectedRecommendations).toBe(1)
  })

  it('counts ignored recommendations correctly', async () => {
    await createRecommendation({
      userId: USER_A,
      subjectType: 'mindNode',
      subjectId: 'node-1',
      recommendationType: 'Link',
      candidateType: 'tag',
      candidateId: 'tag-1',
      confidenceScore: 0.8,
      status: 'ignored',
    })

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.ignoredRecommendations).toBe(1)
  })
})

describe('Score and level calculation', () => {
  afterEach(() => cleanAll())

  it('empty database has score 100 and level healthy', async () => {
    const report = await getLocalHealthReport(USER_A)
    expect(report.score).toBe(100)
    expect(report.level).toBe('healthy')
  })

  it('isolated nodes reduce score', async () => {
    await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Isolated 1' })
    await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Isolated 2' })

    const report = await getLocalHealthReport(USER_A)
    expect(report.score).toBeLessThan(100)
  })

  it('stale items reduce score', async () => {
    const draft = unwrap(await createDraft(USER_A, 'Stale draft'))
    await db.table('editorDrafts').update(draft.id, {
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    })

    const report = await getLocalHealthReport(USER_A)
    expect(report.score).toBeLessThan(100)
  })

  it('score never goes below 0', async () => {
    for (let i = 0; i < 30; i++) {
      await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: `Isolated ${i}` })
    }
    for (let i = 0; i < 30; i++) {
      const draft = unwrap(await createDraft(USER_A, `Stale ${i}`))
      await db.table('editorDrafts').update(draft.id, {
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      })
    }

    const report = await getLocalHealthReport(USER_A)
    expect(report.score).toBeGreaterThanOrEqual(0)
  })

  it('level is watch when score is between 60 and 79', async () => {
    for (let i = 0; i < 5; i++) {
      await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: `Isolated ${i}` })
    }

    const report = await getLocalHealthReport(USER_A)
    if (report.score >= 60 && report.score < 80) {
      expect(report.level).toBe('watch')
    }
  })

  it('level is attention when score is between 40 and 59', async () => {
    for (let i = 0; i < 10; i++) {
      await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: `Isolated ${i}` })
    }

    const report = await getLocalHealthReport(USER_A)
    if (report.score >= 40 && report.score < 60) {
      expect(report.level).toBe('attention')
    }
  })

  it('level is critical when score is below 40', async () => {
    for (let i = 0; i < 20; i++) {
      await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: `Isolated ${i}` })
    }
    for (let i = 0; i < 10; i++) {
      const draft = unwrap(await createDraft(USER_A, `Stale ${i}`))
      await db.table('editorDrafts').update(draft.id, {
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      })
    }

    const report = await getLocalHealthReport(USER_A)
    if (report.score < 40) {
      expect(report.level).toBe('critical')
    }
  })
})

describe('Signals and suggestions', () => {
  afterEach(() => cleanAll())

  it('generates isolated node signal when there are isolated nodes', async () => {
    await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Isolated' })

    const report = await getLocalHealthReport(USER_A)
    const signal = report.signals.find(s => s.type === 'isolated_mind_nodes')
    expect(signal).toBeDefined()
    if (signal) expect(signal.severity).toBe('warning')
  })

  it('generates stale draft signal when there are stale drafts', async () => {
    const draft = unwrap(await createDraft(USER_A, 'Stale draft'))
    await db.table('editorDrafts').update(draft.id, {
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    })

    const report = await getLocalHealthReport(USER_A)
    const signal = report.signals.find(s => s.type === 'stale_drafts')
    expect(signal).toBeDefined()
    if (signal) expect(signal.severity).toBe('warning')
  })

  it('generates duplicate tag signal when there are duplicate tags', async () => {
    await db.table('tags').add({ id: `${USER_A}_tag_react_1`, userId: USER_A, name: 'React', createdAt: new Date(), updatedAt: new Date(), workspaceId: DEFAULT_WORKSPACE_ID })
    await db.table('tags').add({ id: `${USER_A}_tag_react_2`, userId: USER_A, name: 'react', createdAt: new Date(), updatedAt: new Date(), workspaceId: DEFAULT_WORKSPACE_ID })

    const report = await getLocalHealthReport(USER_A)
    const signal = report.signals.find(s => s.type === 'duplicate_tags')
    expect(signal).toBeDefined()
    if (signal) expect(signal.severity).toBe('info')
  })

  it('generates orphan document signal when there are orphan documents', async () => {
    await db.table('entries').add({
      userId: USER_A,
      sourceDockItemId: 0,
      title: 'Orphan',
      content: 'No tags, no project, no mind node',
      type: 'note',
      tags: [],
      project: null,
      actions: [],
      createdAt: new Date(),
      archivedAt: null,
      workspaceId: DEFAULT_WORKSPACE_ID,
    })

    const report = await getLocalHealthReport(USER_A)
    const signal = report.signals.find(s => s.type === 'orphan_documents')
    expect(signal).toBeDefined()
    if (signal) expect(signal.severity).toBe('warning')
  })

  it('all suggestions have readonly status', async () => {
    await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Isolated' })
    const draft = unwrap(await createDraft(USER_A, 'Stale draft'))
    await db.table('editorDrafts').update(draft.id, {
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    })

    const report = await getLocalHealthReport(USER_A)
    for (const suggestion of report.suggestions) {
      expect(suggestion.status).toBe('readonly')
    }
  })

  it('all signals have readonly status', async () => {
    await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Isolated' })

    const report = await getLocalHealthReport(USER_A)
    for (const signal of report.signals) {
      expect(signal.status).toBe('readonly')
    }
  })
})

describe('Dock / Mind alignment with Health Bridge', () => {
  afterEach(() => cleanAll())

  it('getMindGraphHealthSummary excludes hidden nodes from totalNodes and orphanCount', async () => {
    const { getMindGraphHealthSummary } = await import('@/lib/repository')
    await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Visible' })
    await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Hidden', state: 'archived' })

    const summary = await getMindGraphHealthSummary(USER_A)
    expect(summary.totalNodes).toBe(1)
    expect(summary.orphanCount).toBe(1)
  })

  it('hidden nodes do not cause Review/Dock/Mind isolated count conflict', async () => {
    await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Visible' })
    await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Hidden', state: 'archived' })

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.isolatedMindNodes).toBe(1)
    expect(report.summary.mindNodes).toBe(1)
  })

  it('root nodes are not counted as isolated in Health Bridge', async () => {
    await upsertMindNode({ userId: USER_A, nodeType: 'root', label: 'Root' })

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.isolatedMindNodes).toBe(0)
    expect(report.summary.mindNodes).toBe(1)
  })

  it('stale count only includes active drafts and tips, not discarded/published', async () => {
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    const activeDraft = unwrap(await createDraft(USER_A, 'Active stale'))
    await db.table('editorDrafts').update(activeDraft.id, { createdAt: oldDate, updatedAt: oldDate })
    const discardedDraft = unwrap(await createDraft(USER_A, 'Discarded stale'))
    await db.table('editorDrafts').update(discardedDraft.id, { status: 'discarded', createdAt: oldDate, updatedAt: oldDate })

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.staleDrafts).toBe(1)
    expect(report.summary.draftsTotal).toBe(1)
    expect(report.summary.discardedDrafts).toBe(1)
  })

  it('published and discarded draft counts are accurate', async () => {
    await createDraft(USER_A, 'Active 1')
    const pub = unwrap(await createDraft(USER_A, 'Published 1'))
    await db.table('editorDrafts').update(pub.id, { status: 'published' })
    const disc = unwrap(await createDraft(USER_A, 'Discarded 1'))
    await db.table('editorDrafts').update(disc.id, { status: 'discarded' })

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.draftsTotal).toBe(1)
    expect(report.summary.publishedDrafts).toBe(1)
    expect(report.summary.discardedDrafts).toBe(1)
    expect(report.sections.drafts.published).toBe(1)
    expect(report.sections.drafts.discarded).toBe(1)
  })
})

describe('Collection distribution', () => {
  afterEach(() => cleanAll())

  it('returns empty array for empty database', async () => {
    const report = await getLocalHealthReport(USER_A)
    expect(report.collectionDistribution).toEqual([])
  })

  it('computes collection distribution based on entries', async () => {
    await db.table('collections').add({ id: 'col_1', userId: USER_A, name: 'Research', collectionType: 'tag', createdAt: new Date(), updatedAt: new Date(), workspaceId: DEFAULT_WORKSPACE_ID })
    await db.table('entries').add({
      userId: USER_A, sourceDockItemId: 0, title: 'Doc1', content: 'c', type: 'note',
      tags: ['Research'], project: null, actions: [], createdAt: new Date(), archivedAt: null, workspaceId: DEFAULT_WORKSPACE_ID,
    })
    await db.table('entries').add({
      userId: USER_A, sourceDockItemId: 0, title: 'Doc2', content: 'c', type: 'note',
      tags: ['Research'], project: null, actions: [], createdAt: new Date(), archivedAt: null, workspaceId: DEFAULT_WORKSPACE_ID,
    })

    const report = await getLocalHealthReport(USER_A)
    expect(report.collectionDistribution.length).toBe(1)
    expect(report.collectionDistribution[0].name).toBe('Research')
    expect(report.collectionDistribution[0].entryCount).toBe(2)
  })
})

describe('Mind graph preview', () => {
  afterEach(() => cleanAll())

  it('returns empty nodes and edges for empty database', async () => {
    const report = await getLocalHealthReport(USER_A)
    expect(report.mindGraphPreview.nodes).toEqual([])
    expect(report.mindGraphPreview.edges).toEqual([])
  })

  it('includes real nodes and edges from mind graph', async () => {
    const n1 = await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Node A' })
    const n2 = await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Node B' })
    await upsertMindEdge({ userId: USER_A, sourceNodeId: n1.id, targetNodeId: n2.id, edgeType: 'confirmed' })

    const report = await getLocalHealthReport(USER_A)
    expect(report.mindGraphPreview.nodes.length).toBe(2)
    expect(report.mindGraphPreview.edges.length).toBe(1)
    expect(report.mindGraphPreview.nodes[0].label).toBe('Node A')
    expect(report.mindGraphPreview.edges[0].edgeType).toBe('confirmed')
  })

  it('excludes hidden nodes from preview', async () => {
    await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Visible' })
    await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Hidden', state: 'archived' })

    const report = await getLocalHealthReport(USER_A)
    expect(report.mindGraphPreview.nodes.length).toBe(1)
    expect(report.mindGraphPreview.nodes[0].label).toBe('Visible')
  })

  it('marks isolated nodes as not connected', async () => {
    await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Isolated' })
    const n1 = await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Connected A' })
    const n2 = await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Connected B' })
    await upsertMindEdge({ userId: USER_A, sourceNodeId: n1.id, targetNodeId: n2.id, edgeType: 'confirmed' })

    const report = await getLocalHealthReport(USER_A)
    const isolated = report.mindGraphPreview.nodes.find(n => n.label === 'Isolated')
    expect(isolated?.isConnected).toBe(false)
    const connectedA = report.mindGraphPreview.nodes.find(n => n.label === 'Connected A')
    expect(connectedA?.isConnected).toBe(true)
  })
})

describe('Restore lifecycle: hiddenAt cleanup', () => {
  afterEach(() => cleanAll())

  it('restored node is no longer hidden', async () => {
    const node = await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'To Archive' })
    await archiveMindNode(USER_A, node.id)

    const reportAfterArchive = await getLocalHealthReport(USER_A)
    expect(reportAfterArchive.summary.mindNodes).toBe(0)

    await restoreMindNode(USER_A, node.id)

    const reportAfterRestore = await getLocalHealthReport(USER_A)
    expect(reportAfterRestore.summary.mindNodes).toBe(1)
    expect(reportAfterRestore.summary.isolatedMindNodes).toBe(1)
  })

  it('isHidden returns false after restore', async () => {
    const { isHidden } = await import('@/lib/lifecycleGuards')
    const node = await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'To Archive' })
    await archiveMindNode(USER_A, node.id)

    const archivedNode = await db.table('mindNodes').get(node.id)
    expect(isHidden(archivedNode as Parameters<typeof isHidden>[0])).toBe(true)

    await restoreMindNode(USER_A, node.id)

    const restoredNode = await db.table('mindNodes').get(node.id)
    expect(isHidden(restoredNode as Parameters<typeof isHidden>[0])).toBe(false)
  })
})

describe('Edge endpoint visibility filtering', () => {
  afterEach(() => cleanAll())

  it('visible node connected only to hidden node is still isolated', async () => {
    const visibleNode = await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Visible' })
    const hiddenNode = await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Hidden', state: 'archived' })
    await upsertMindEdge({ userId: USER_A, sourceNodeId: visibleNode.id, targetNodeId: hiddenNode.id, edgeType: 'confirmed' })

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.mindNodes).toBe(1)
    expect(report.summary.isolatedMindNodes).toBe(1)
    expect(report.summary.mindEdges).toBe(0)
  })

  it('edge between two visible nodes counts as connected', async () => {
    const n1 = await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'A' })
    const n2 = await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'B' })
    await upsertMindEdge({ userId: USER_A, sourceNodeId: n1.id, targetNodeId: n2.id, edgeType: 'confirmed' })

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.isolatedMindNodes).toBe(0)
    expect(report.summary.mindEdges).toBe(1)
  })

  it('edge to missing target node is excluded', async () => {
    const n1 = await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'A' })
    await upsertMindEdge({ userId: USER_A, sourceNodeId: n1.id, targetNodeId: 'nonexistent-node-id', edgeType: 'confirmed' })

    const report = await getLocalHealthReport(USER_A)
    expect(report.summary.isolatedMindNodes).toBe(1)
    expect(report.summary.mindEdges).toBe(0)
  })

  it('getMindGraphHealthSummary also filters edges by visible endpoints', async () => {
    const { getMindGraphHealthSummary } = await import('@/lib/repository')
    const visibleNode = await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Visible' })
    const hiddenNode = await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Hidden', state: 'archived' })
    await upsertMindEdge({ userId: USER_A, sourceNodeId: visibleNode.id, targetNodeId: hiddenNode.id, edgeType: 'confirmed' })

    const summary = await getMindGraphHealthSummary(USER_A)
    expect(summary.totalNodes).toBe(1)
    expect(summary.totalEdges).toBe(0)
    expect(summary.orphanCount).toBe(1)
  })
})

describe('Collection distribution by type', () => {
  afterEach(() => cleanAll())

  it('project collection counts entries by entry.project', async () => {
    await db.table('collections').add({ id: 'col_proj', userId: USER_A, name: 'MindDock', collectionType: 'project', createdAt: new Date(), updatedAt: new Date(), workspaceId: DEFAULT_WORKSPACE_ID })
    await db.table('entries').add({
      userId: USER_A, sourceDockItemId: 0, title: 'Doc1', content: 'c', type: 'note',
      tags: [], project: 'MindDock', actions: [], createdAt: new Date(), archivedAt: null, workspaceId: DEFAULT_WORKSPACE_ID,
    })
    await db.table('entries').add({
      userId: USER_A, sourceDockItemId: 0, title: 'Doc2', content: 'c', type: 'note',
      tags: [], project: 'MindDock', actions: [], createdAt: new Date(), archivedAt: null, workspaceId: DEFAULT_WORKSPACE_ID,
    })
    await db.table('entries').add({
      userId: USER_A, sourceDockItemId: 0, title: 'Doc3', content: 'c', type: 'note',
      tags: [], project: 'Other', actions: [], createdAt: new Date(), archivedAt: null, workspaceId: DEFAULT_WORKSPACE_ID,
    })

    const report = await getLocalHealthReport(USER_A)
    const projCol = report.collectionDistribution.find(c => c.name === 'MindDock')
    expect(projCol).toBeDefined()
    expect(projCol?.entryCount).toBe(2)
  })

  it('tag collection counts entries by entry.tags', async () => {
    await db.table('collections').add({ id: 'col_tag', userId: USER_A, name: 'Research', collectionType: 'tag', createdAt: new Date(), updatedAt: new Date(), workspaceId: DEFAULT_WORKSPACE_ID })
    await db.table('entries').add({
      userId: USER_A, sourceDockItemId: 0, title: 'Doc1', content: 'c', type: 'note',
      tags: ['Research'], project: null, actions: [], createdAt: new Date(), archivedAt: null, workspaceId: DEFAULT_WORKSPACE_ID,
    })
    await db.table('entries').add({
      userId: USER_A, sourceDockItemId: 0, title: 'Doc2', content: 'c', type: 'note',
      tags: ['Research', 'Other'], project: null, actions: [], createdAt: new Date(), archivedAt: null, workspaceId: DEFAULT_WORKSPACE_ID,
    })

    const report = await getLocalHealthReport(USER_A)
    const tagCol = report.collectionDistribution.find(c => c.name === 'Research')
    expect(tagCol).toBeDefined()
    expect(tagCol?.entryCount).toBe(2)
  })

  it('project collection with no matching entries has count 0', async () => {
    await db.table('collections').add({ id: 'col_empty', userId: USER_A, name: 'EmptyProject', collectionType: 'project', createdAt: new Date(), updatedAt: new Date(), workspaceId: DEFAULT_WORKSPACE_ID })

    const report = await getLocalHealthReport(USER_A)
    const emptyCol = report.collectionDistribution.find(c => c.name === 'EmptyProject')
    expect(emptyCol).toBeDefined()
    expect(emptyCol?.entryCount).toBe(0)
  })
})

describe('Mind View driftDock alignment with Health Bridge', () => {
  afterEach(() => cleanAll())

  it('viewScopeCounts driftDock uses same isolated rule as Health Bridge', async () => {
    const src = fs.readFileSync(path.resolve(import.meta.dirname, '../app/workspace/page.tsx'), 'utf-8')
    const viewScopeSection = src.substring(src.indexOf('viewScopeCounts'))
    expect(viewScopeSection).toMatch(/driftDock.*!connectedNodeIds\.has\(n\.id\).*nodeType\s*!==\s*['"]root['"]/)
    expect(viewScopeSection).not.toMatch(/driftDock.*state\s*===\s*['"]drifting['"]/)
    expect(viewScopeSection).not.toMatch(/driftDock.*state\s*===\s*['"]isolated['"]/)
  })
})
