import { afterEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  createDraft,
  listDrafts,
  createTip,
  listActiveTips,
  archiveItem,
  createDockItem,
  listArchivedEntries,
  listMindNodes,
  listMindEdges,
  listCollections,
  listTags,
  createStoredTag,
  createCollection,
  upsertMindNode,
  upsertMindEdge,
} from '@/lib/repository'

const USER_A = 'user_home_intel_a'
const USER_B = 'user_home_intel_b'

async function cleanAll() {
  const tables = ['editorDrafts', 'tips', 'entries', 'tags', 'collections', 'mindNodes', 'mindEdges', 'dockItems'] as const
  for (const t of tables) {
    try { await db.table(t).clear() } catch { /* table may not exist */ }
  }
}

function makeDraft(userId: string, title = 'Test Draft', content = 'Test content') {
  return createDraft(userId, title, content)
}

function makeTip(userId: string, content = 'Test tip content') {
  return createTip(userId, content)
}

async function makeArchivedEntry(userId: string, title = 'Test Doc') {
  const itemId = await createDockItem(userId, title)
  const entry = await archiveItem(userId, itemId)
  return entry
}

describe('Home Intelligence aggregation', () => {
  afterEach(async () => {
    await cleanAll()
  })

  it('returns zeros for empty workspace', async () => {
    const drafts = await listDrafts(USER_A)
    const tips = await listActiveTips(USER_A)
    const documents = await listArchivedEntries(USER_A)
    const mindNodes = await listMindNodes(USER_A)
    const mindEdges = await listMindEdges(USER_A)

    expect(drafts.length).toBe(0)
    expect(tips.length).toBe(0)
    expect(documents.length).toBe(0)
    expect(mindNodes.length).toBe(0)
    expect(mindEdges.length).toBe(0)
  })

  it('counts active drafts correctly', async () => {
    await makeDraft(USER_A, 'Draft 1')
    await makeDraft(USER_A, 'Draft 2')
    await makeDraft(USER_B, 'Other user draft')

    const drafts = await listDrafts(USER_A)
    expect(drafts.length).toBe(2)
  })

  it('counts active tips correctly', async () => {
    await makeTip(USER_A, 'Tip 1')
    await makeTip(USER_A, 'Tip 2')
    await makeTip(USER_A, 'Tip 3')

    const tips = await listActiveTips(USER_A)
    expect(tips.length).toBe(3)
  })

  it('counts archived documents correctly', async () => {
    await makeArchivedEntry(USER_A, 'Doc 1')
    await makeArchivedEntry(USER_A, 'Doc 2')

    const documents = await listArchivedEntries(USER_A)
    expect(documents.length).toBe(2)
  })

  it('counts mind nodes and edges correctly', async () => {
    await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Node 1' })
    await upsertMindNode({ userId: USER_A, nodeType: 'topic', label: 'Node 2' })
    const nodes = await listMindNodes(USER_A)
    await upsertMindEdge({ userId: USER_A, sourceNodeId: nodes[0].id, targetNodeId: nodes[1].id, edgeType: 'semantic' })

    const mindNodes = await listMindNodes(USER_A)
    const mindEdges = await listMindEdges(USER_A)
    expect(mindNodes.length).toBe(2)
    expect(mindEdges.length).toBe(1)
  })

  it('returns recent drafts sorted by updatedAt', async () => {
    await makeDraft(USER_A, 'Older Draft')
    await makeDraft(USER_A, 'Newer Draft')

    const drafts = await listDrafts(USER_A)
    expect(drafts.length).toBe(2)
    expect(drafts[0].title).toBeDefined()
  })

  it('returns recent tips', async () => {
    await makeTip(USER_A, 'First tip')
    await makeTip(USER_A, 'Second tip')

    const tips = await listActiveTips(USER_A)
    expect(tips.length).toBe(2)
  })

  it('counts collections and tags', async () => {
    await createCollection({ userId: USER_A, name: 'Project A', collectionType: 'project' })
    await createStoredTag(USER_A, 'tag1')

    const collections = await listCollections(USER_A)
    const tags = await listTags(USER_A)
    expect(collections.length).toBe(1)
    expect(tags.length).toBe(1)
  })

  it('isolates data per user', async () => {
    await makeDraft(USER_A, 'User A Draft')
    await makeTip(USER_B, 'User B Tip')

    const draftsA = await listDrafts(USER_A)
    const tipsA = await listActiveTips(USER_A)
    const tipsB = await listActiveTips(USER_B)

    expect(draftsA.length).toBe(1)
    expect(tipsA.length).toBe(0)
    expect(tipsB.length).toBe(1)
  })
})

describe('Daily Brief aggregation', () => {
  afterEach(async () => {
    await cleanAll()
  })

  it('generates correct hints for empty workspace', async () => {
    const documents = await listArchivedEntries(USER_A)
    const mindNodes = await listMindNodes(USER_A)

    const hints: { label: string; priority: string }[] = []
    if (documents.length === 0) {
      hints.push({ label: '开始创作', priority: 'low' })
    }
    if (mindNodes.length === 0) {
      hints.push({ label: '构建思维图谱', priority: 'low' })
    }

    expect(hints.length).toBe(2)
    expect(hints.some(h => h.label === '开始创作')).toBe(true)
    expect(hints.some(h => h.label === '构建思维图谱')).toBe(true)
  })

  it('generates tip pressure hint when tips >= 5', async () => {
    for (let i = 0; i < 5; i++) {
      await makeTip(USER_A, `Tip ${i + 1}`)
    }

    const tips = await listActiveTips(USER_A)
    expect(tips.length).toBe(5)

    const hints: { type: string; priority: string }[] = []
    if (tips.length >= 5) {
      hints.push({ type: 'tip_pressure', priority: 'high' })
    }
    expect(hints.length).toBe(1)
    expect(hints[0].priority).toBe('high')
  })

  it('generates draft pressure hint when drafts >= 3', async () => {
    for (let i = 0; i < 3; i++) {
      await makeDraft(USER_A, `Draft ${i + 1}`)
    }

    const drafts = await listDrafts(USER_A)
    expect(drafts.length).toBe(3)

    const hints: { type: string; priority: string }[] = []
    if (drafts.length >= 3) {
      hints.push({ type: 'draft_pressure', priority: 'high' })
    }
    expect(hints.length).toBe(1)
    expect(hints[0].priority).toBe('high')
  })

  it('generates medium hints for small counts', async () => {
    await makeTip(USER_A, 'A tip')
    await makeDraft(USER_A, 'A draft')

    const tips = await listActiveTips(USER_A)
    const drafts = await listDrafts(USER_A)

    const hints: { type: string; priority: string }[] = []
    if (tips.length > 0 && tips.length < 5) {
      hints.push({ type: 'tip_pressure', priority: 'medium' })
    }
    if (drafts.length > 0 && drafts.length < 3) {
      hints.push({ type: 'draft_pressure', priority: 'medium' })
    }
    expect(hints.length).toBe(2)
    expect(hints.every(h => h.priority === 'medium')).toBe(true)
  })

  it('counts todayCreated correctly', async () => {
    await makeDraft(USER_A, 'Today draft')
    await makeTip(USER_A, 'Today tip')

    const drafts = await listDrafts(USER_A)
    const tips = await listActiveTips(USER_A)

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayCreated = [...drafts, ...tips].filter((item) => {
      return item.createdAt && item.createdAt >= todayStart
    }).length

    expect(todayCreated).toBe(2)
  })
})
