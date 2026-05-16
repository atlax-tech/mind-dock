import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/lib/db'
import { subscribe, emit } from '@/lib/events'
import {
  upsertMindNode,
  updateMindNodePosition,
  listMindNodes,
  listMindEdges,
} from '@/lib/repository'
import { buildSimpleMindGraphSnapshot } from '@/app/workspace/features/mind/mindSnapshotBuilder'

const USER = 'test-mind-events'

afterEach(async () => {
  await db.delete()
  await db.open()
})

describe('Mind event bridging', () => {
  it('emits mind_node_updated when position is saved', async () => {
    const listener = vi.fn()
    const unsub = subscribe(listener)

    const node = await upsertMindNode({ userId: USER, nodeType: 'project', label: 'Test' })
    await updateMindNodePosition(USER, node.id, 50, 100)

    emit({ type: 'mind_node_updated', nodeId: node.id })

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mind_node_updated', nodeId: node.id }),
    )

    unsub()
  })

  it('subscriber receives mind events and can trigger refresh', async () => {
    const receivedEvents: string[] = []
    const unsub = subscribe((event) => {
      if (event.type.startsWith('mind_')) {
        receivedEvents.push(event.type)
      }
    })

    emit({ type: 'mind_node_created', nodeId: 'n1' })
    emit({ type: 'mind_edge_created', edgeId: 'e1' })
    emit({ type: 'mind_node_deleted', nodeId: 'n2' })

    expect(receivedEvents).toEqual([
      'mind_node_created',
      'mind_edge_created',
      'mind_node_deleted',
    ])

    unsub()
  })
})

describe('Mind snapshot builder', () => {
  it('returns empty snapshot for no nodes', async () => {
    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    expect(snapshot.nodes).toHaveLength(0)
    expect(snapshot.edges).toHaveLength(0)
    expect(snapshot.rootNodeId).toBeNull()
  })

  it('builds snapshot from real nodes and edges', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic' })

    const { upsertMindEdge } = await import('@/lib/repository')
    await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'parent_child',
    })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    expect(snapshot.nodes).toHaveLength(2)
    expect(snapshot.edges).toHaveLength(1)
    expect(snapshot.rootNodeId).toBe(nodeA.id)
  })

  it('includes position data in snapshot nodes', async () => {
    const node = await upsertMindNode({ userId: USER, nodeType: 'project', label: 'Pos' })
    await updateMindNodePosition(USER, node.id, 42, 84)

    const nodes = await listMindNodes(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, [])

    expect(snapshot.nodes).toHaveLength(1)
    expect(snapshot.nodes[0].positionX).toBe(42)
    expect(snapshot.nodes[0].positionY).toBe(84)
  })
})

describe('convertTipToDraft transaction', () => {
  it('creates draft and updates tip atomically', async () => {
    const { createTip, convertTipToDraft, getTip, listDrafts } = await import('@/lib/repository')

    const tip = await createTip(USER, 'Transactional test')
    expect(tip).toBeTruthy()
    if (!tip) return

    const result = await convertTipToDraft(USER, tip.id)
    expect(result.tip).toBeTruthy()
    expect(result.draft).toBeTruthy()
    if (!result.tip || !result.draft) return

    expect(result.tip.status).toBe('converted')
    expect(result.tip.convertedDraftId).toBe(result.draft.id)
    expect(result.draft.content).toBe('Transactional test')

    const refetchedTip = await getTip(USER, tip.id)
    expect(refetchedTip).toBeTruthy()
    if (!refetchedTip) return
    expect(refetchedTip.status).toBe('converted')

    const drafts = await listDrafts(USER)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].id).toBe(result.draft.id)
  })

  it('rolls back both operations on failure', async () => {
    const { convertTipToDraft, listDrafts, listActiveTips } = await import('@/lib/repository')

    const result = await convertTipToDraft(USER, 99999)
    expect(result.tip).toBeNull()
    expect(result.draft).toBeNull()

    const drafts = await listDrafts(USER)
    expect(drafts).toHaveLength(0)

    const tips = await listActiveTips(USER)
    expect(tips).toHaveLength(0)
  })
})
