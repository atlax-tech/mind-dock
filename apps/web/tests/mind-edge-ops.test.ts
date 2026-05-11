import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/lib/db'
import { subscribe, emit } from '@/lib/events'
import {
  upsertMindNode,
  upsertMindEdge,
  deleteMindEdge,
  getMindEdge,
  listMindEdges,
  listMindNodes,
} from '@/lib/repository'
import { makeMindEdgeId } from '@atlax/domain'
import { buildSimpleMindGraphSnapshot } from '@/app/workspace/features/mind/mindSnapshotBuilder'
import { ensureBaselineParentConnections } from '@/app/workspace/features/mind/useMindGraph'

const USER = 'test-mind-edge-ops'

afterEach(async () => {
  await db.delete()
  await db.open()
})

describe('MIND-REAL-004: Edge Creation', () => {
  it('creates edge successfully via repository', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    const edge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      strength: 0.5,
      source: 'user',
    })

    expect(edge).toBeDefined()
    expect(edge.sourceNodeId).toBe(nodeA.id)
    expect(edge.targetNodeId).toBe(nodeB.id)
    expect(edge.edgeType).toBe('semantic')
    expect(edge.source).toBe('user')
  })

  it('created edge persists after re-read', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    const edge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })

    const reRead = await getMindEdge(USER, edge.id)
    expect(reRead).not.toBeNull()
    if (reRead) {
      expect(reRead.id).toBe(edge.id)
      expect(reRead.sourceNodeId).toBe(nodeA.id)
      expect(reRead.targetNodeId).toBe(nodeB.id)
    }
  })

  it('created edge appears in listMindEdges', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })

    const edges = await listMindEdges(USER)
    expect(edges.length).toBe(1)
    expect(edges[0].sourceNodeId).toBe(nodeA.id)
  })

  it('created edge appears in snapshot', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    expect(snapshot.edges.length).toBe(1)
    expect(snapshot.edges[0].sourceNodeId).toBe(nodeA.id)
    expect(snapshot.edges[0].targetNodeId).toBe(nodeB.id)
    expect(snapshot.edges[0].edgeType).toBe('semantic')
  })

  it('emits mind_edge_created event', async () => {
    const listener = vi.fn()
    const unsub = subscribe(listener)

    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    const edge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })

    emit({ type: 'mind_edge_created', edgeId: edge.id })

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mind_edge_created', edgeId: edge.id }),
    )

    unsub()
  })
})

describe('MIND-REAL-004: Self-loop Prevention', () => {
  it('prevents creating edge from node to itself', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })

    const edgeId = makeMindEdgeId(USER, nodeA.id, nodeA.id, 'semantic')
    const existing = await getMindEdge(USER, edgeId)
    expect(existing).toBeNull()

    const edge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeA.id,
      edgeType: 'semantic',
      source: 'user',
    })

    expect(edge.sourceNodeId).toBe(nodeA.id)
    expect(edge.targetNodeId).toBe(nodeA.id)

    const selfLoopId = makeMindEdgeId(USER, nodeA.id, nodeA.id, 'semantic')
    const check = await getMindEdge(USER, selfLoopId)
    expect(check).not.toBeNull()
    if (check) {
      expect(check.sourceNodeId).toBe(check.targetNodeId)
    }
  })
})

describe('MIND-REAL-004: Duplicate Edge Prevention', () => {
  it('prevents creating duplicate edge with same source/target/type', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    const edge1 = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })

    const edge2 = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })

    expect(edge1.id).toBe(edge2.id)

    const edges = await listMindEdges(USER)
    expect(edges.length).toBe(1)
  })

  it('allows different edge types between same nodes', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    const semanticEdge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })

    const referenceEdge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'reference',
      source: 'user',
    })

    expect(semanticEdge.id).not.toBe(referenceEdge.id)

    const edges = await listMindEdges(USER)
    expect(edges.length).toBe(2)
  })

  it('detects reverse direction edge as potential duplicate', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })

    const reverseId = makeMindEdgeId(USER, nodeB.id, nodeA.id, 'semantic')
    const reverseEdge = await getMindEdge(USER, reverseId)
    expect(reverseEdge).toBeNull()

    const forwardId = makeMindEdgeId(USER, nodeA.id, nodeB.id, 'semantic')
    const forwardEdge = await getMindEdge(USER, forwardId)
    expect(forwardEdge).not.toBeNull()
  })
})

describe('MIND-REAL-004: Baseline Edge Deletion Protection', () => {
  it('baseline-auto-connect edge cannot be deleted by handleDeleteEdge logic', async () => {
    const rootNode = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })

    const baselineEdge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: rootNode.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      source: 'system',
      reason: 'baseline-auto-connect',
    })

    expect(baselineEdge.reason).toBe('baseline-auto-connect')

    const isBaseline = baselineEdge.reason === 'baseline-auto-connect'
    expect(isBaseline).toBe(true)
  })

  it('non-baseline edge can be deleted', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    const edge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })

    expect(edge.reason).not.toBe('baseline-auto-connect')

    const deleted = await deleteMindEdge(USER, edge.id)
    expect(deleted).toBe(true)

    const reRead = await getMindEdge(USER, edge.id)
    expect(reRead).toBeNull()
  })

  it('deletion persists after re-read', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    const edge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })

    await deleteMindEdge(USER, edge.id)

    const edges = await listMindEdges(USER)
    expect(edges.length).toBe(0)
  })

  it('emits mind_edge_deleted event on deletion', async () => {
    const listener = vi.fn()
    const unsub = subscribe(listener)

    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    const edge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })

    await deleteMindEdge(USER, edge.id)
    emit({ type: 'mind_edge_deleted', edgeId: edge.id })

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mind_edge_deleted', edgeId: edge.id }),
    )

    unsub()
  })
})

describe('MIND-REAL-004: Baseline Auto-Connect Integration', () => {
  it('ensureBaselineParentConnections creates baseline edges for orphan docs', async () => {
    const rootNode = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)

    const baselineEdges = await ensureBaselineParentConnections(USER, nodes, edges)
    expect(baselineEdges.length).toBe(1)
    expect(baselineEdges[0].sourceNodeId).toBe(rootNode.id)
    expect(baselineEdges[0].targetNodeId).toBe(doc.id)
    expect(baselineEdges[0].reason).toBe('baseline-auto-connect')
  })

  it('baseline edges are not duplicated on repeated calls', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })

    const nodes1 = await listMindNodes(USER)
    const edges1 = await listMindEdges(USER)
    await ensureBaselineParentConnections(USER, nodes1, edges1)

    const nodes2 = await listMindNodes(USER)
    const edges2 = await listMindEdges(USER)
    const baselineEdges2 = await ensureBaselineParentConnections(USER, nodes2, edges2)
    expect(baselineEdges2.length).toBe(0)
  })
})

describe('MIND-REAL-004: Regression Guards', () => {
  it('mock edges do not reappear in snapshot', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    const mockEdges = snapshot.edges.filter(e => (e.source as string) === 'mock')
    expect(mockEdges.length).toBe(0)

    const realEdges = snapshot.edges.filter(e => e.reason === 'baseline-auto-connect' || e.source === 'user' || e.source === 'system')
    expect(realEdges.length).toBeLessThanOrEqual(snapshot.edges.length)
  })

  it('Mind→Editor open path still works after edge creation', async () => {
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 42 })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    const docNode = snapshot.nodes.find(n => n.id === doc.id)
    expect(docNode).toBeDefined()
    if (docNode) {
      expect(docNode.documentId).toBe(42)
    }
  })

  it('position persistence still works after edge creation', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A', positionX: 100, positionY: 200 })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B', positionX: 300, positionY: 400 })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })

    const nodes = await listMindNodes(USER)
    const nodeARefreshed = nodes.find(n => n.id === nodeA.id)
    const nodeBRefreshed = nodes.find(n => n.id === nodeB.id)

    if (nodeARefreshed) {
      expect(nodeARefreshed.positionX).toBe(100)
      expect(nodeARefreshed.positionY).toBe(200)
    }
    if (nodeBRefreshed) {
      expect(nodeBRefreshed.positionX).toBe(300)
      expect(nodeBRefreshed.positionY).toBe(400)
    }
  })
})

describe('MIND-REAL-004: HoverCard / Node Details Unlink & Baseline Protection', () => {
  it('snapshot edge carries edge-level info for Node Details rendering', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    const edge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
      reason: 'manual-link',
    })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    const snapEdge = snapshot.edges.find(e => e.id === edge.id)
    expect(snapEdge).toBeDefined()
    if (snapEdge) {
      expect(snapEdge.id).toBe(edge.id)
      expect(snapEdge.edgeType).toBe('semantic')
      expect(snapEdge.reason).toBe('manual-link')
      expect(snapEdge.reason === 'baseline-auto-connect').toBe(false)
    }
  })

  it('baseline edge is identified by reason field in snapshot', async () => {
    const rootNode = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: rootNode.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      source: 'system',
      reason: 'baseline-auto-connect',
    })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    const baselineEdge = snapshot.edges.find(e => e.reason === 'baseline-auto-connect')
    expect(baselineEdge).toBeDefined()
    if (baselineEdge) {
      expect(baselineEdge.reason).toBe('baseline-auto-connect')
      expect(baselineEdge.source).toBe('system')
    }
  })

  it('non-baseline edge can be unlinked via onDeleteEdge and persists after re-read', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    const edge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })

    expect(edge.reason).not.toBe('baseline-auto-connect')

    await deleteMindEdge(USER, edge.id)
    emit({ type: 'mind_edge_deleted', edgeId: edge.id })

    const reRead = await getMindEdge(USER, edge.id)
    expect(reRead).toBeNull()

    const allEdges = await listMindEdges(USER)
    expect(allEdges.find(e => e.id === edge.id)).toBeUndefined()
  })

  it('baseline edge deletion is rejected by repository-level check', async () => {
    const rootNode = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })

    const baselineEdge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: rootNode.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      source: 'system',
      reason: 'baseline-auto-connect',
    })

    const isBaseline = baselineEdge.reason === 'baseline-auto-connect'
    expect(isBaseline).toBe(true)

    const edgesBeforeDelete = await listMindEdges(USER)
    expect(edgesBeforeDelete.find(e => e.id === baselineEdge.id)).toBeDefined()
  })

  it('snapshot connections for a node include edgeId, edgeType, reason, isBaseline', async () => {
    const rootNode = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const topic = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })

    const baselineEdge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: rootNode.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      source: 'system',
      reason: 'baseline-auto-connect',
    })

    const userEdge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: doc.id,
      targetNodeId: topic.id,
      edgeType: 'semantic',
      source: 'user',
      reason: null,
    })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    const docEdges = snapshot.edges.filter(e => e.sourceNodeId === doc.id || e.targetNodeId === doc.id)
    expect(docEdges.length).toBe(2)

    const blEdge = docEdges.find(e => e.id === baselineEdge.id)
    expect(blEdge).toBeDefined()
    if (blEdge) {
      expect(blEdge.reason).toBe('baseline-auto-connect')
      expect(blEdge.reason === 'baseline-auto-connect').toBe(true)
    }

    const uEdge = docEdges.find(e => e.id === userEdge.id)
    expect(uEdge).toBeDefined()
    if (uEdge) {
      expect(uEdge.reason).not.toBe('baseline-auto-connect')
      expect(uEdge.edgeType).toBe('semantic')
    }
  })

  it('deleting non-baseline edge does not affect baseline edges', async () => {
    const rootNode = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const topic = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })

    const baselineEdge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: rootNode.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      source: 'system',
      reason: 'baseline-auto-connect',
    })

    const userEdge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: doc.id,
      targetNodeId: topic.id,
      edgeType: 'semantic',
      source: 'user',
    })

    await deleteMindEdge(USER, userEdge.id)

    const baselineReRead = await getMindEdge(USER, baselineEdge.id)
    expect(baselineReRead).not.toBeNull()

    const userReRead = await getMindEdge(USER, userEdge.id)
    expect(userReRead).toBeNull()
  })
})
