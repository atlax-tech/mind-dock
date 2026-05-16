import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { db } from '../lib/db'
import {
  upsertMindNode,
  upsertMindEdge,
  listMindNodes,
  listMindEdges,
} from '../lib/repository'
import { buildSimpleMindGraphSnapshot } from '../app/workspace/features/mind/mindSnapshotBuilder'

const USER = 'test-user'

afterEach(async () => {
  await db.delete()
  await db.open()
})

describe('buildSimpleMindGraphSnapshot', () => {
  it('returns empty edges when no real edges exist', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    await upsertMindNode({ userId: USER, nodeType: 'project', label: 'P1' })
    await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'T1' })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)

    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    expect(snapshot.nodes).toHaveLength(3)
    expect(snapshot.edges).toHaveLength(0)
  })

  it('preserves real edges in snapshot', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'project', label: 'P1' })
    await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'parent_child',
      strength: 0.9,
    })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)

    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    expect(snapshot.nodes).toHaveLength(2)
    expect(snapshot.edges).toHaveLength(1)
    expect(snapshot.edges[0].sourceNodeId).toBe(nodeA.id)
    expect(snapshot.edges[0].targetNodeId).toBe(nodeB.id)
    expect(snapshot.edges[0].edgeType).toBe('parent_child')
    expect(snapshot.edges[0].strength).toBe(0.9)
  })

  it('does not generate mock edges even with root + multiple non-root nodes', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    await upsertMindNode({ userId: USER, nodeType: 'project', label: 'P1' })
    await upsertMindNode({ userId: USER, nodeType: 'project', label: 'P2' })
    await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'T1' })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)

    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    expect(snapshot.nodes).toHaveLength(4)
    expect(snapshot.edges).toHaveLength(0)
    for (const edge of snapshot.edges) {
      expect(edge.id).not.toContain('mock-edge-')
    }
  })

  it('preserves documentId on snapshot nodes', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 42 })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)

    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    expect(snapshot.nodes).toHaveLength(1)
    expect(snapshot.nodes[0].documentId).toBe(42)
  })

  it('preserves null documentId on non-document nodes', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic1' })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)

    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    expect(snapshot.nodes).toHaveLength(1)
    expect(snapshot.nodes[0].documentId).toBeNull()
  })
})

describe('onOpenEditor bridge', () => {
  it('onOpenEditor callback receives documentId from snapshot node', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 99 })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    const docNode = snapshot.nodes.find(n => n.documentId != null)
    expect(docNode).toBeTruthy()
    if (!docNode) return
    expect(docNode.documentId).toBe(99)

    let receivedId: number | null = null
    let receivedSourceType: string | null = null
    const onOpenEditor = (id: number, sourceType: 'draft' | 'document') => {
      receivedId = id
      receivedSourceType = sourceType
    }
    const sourceType = (docNode.metadata?.sourceType as 'draft' | 'document') ?? 'draft'
    onOpenEditor(docNode.documentId as number, sourceType)

    expect(receivedId).toBe(99)
    expect(receivedSourceType).toBe('draft')
  })

  it('onOpenEditor receives sourceType=document for entry-originated nodes', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 42, metadata: { sourceType: 'document', entryId: 42 } })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    const docNode = snapshot.nodes.find(n => n.documentId != null)
    expect(docNode).toBeTruthy()
    if (!docNode) return
    expect(docNode.documentId).toBe(42)

    let receivedId: number | null = null
    let receivedSourceType: string | null = null
    const onOpenEditor = (id: number, sourceType: 'draft' | 'document') => {
      receivedId = id
      receivedSourceType = sourceType
    }
    const sourceType = (docNode.metadata?.sourceType as 'draft' | 'document') ?? 'draft'
    onOpenEditor(docNode.documentId as number, sourceType)

    expect(receivedId).toBe(42)
    expect(receivedSourceType).toBe('document')
  })

  it('non-document nodes have null documentId and should not trigger onOpenEditor', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic1' })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    const topicNode = snapshot.nodes.find(n => n.nodeType === 'topic')
    expect(topicNode).toBeTruthy()
    if (!topicNode) return
    expect(topicNode.documentId).toBeNull()
  })
})
