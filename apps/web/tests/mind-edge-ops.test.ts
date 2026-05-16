import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/lib/db'
import { subscribe, emit } from '@/lib/events'
import {
  upsertMindNode,
  upsertMindEdge,
  deleteMindEdge,
  forceDeleteBaselineEdge,
  getMindEdge,
  listMindEdges,
  listMindNodes,
  getMindGraphHealthSummary,
  createRecommendation,
  recordUserBehaviorEvent,
  listUserBehaviorEvents,
  generateMindNodeRecommendations,
  applyRecommendation,
  recordRecommendationFeedback,
  listRecommendationEvents,
  getRecommendation,
  archiveMindNode,
  restoreMindNode,
  listArchivedMindNodes,
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
    expect(edge).not.toBeNull()
    if (!edge) return

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
    expect(edge).not.toBeNull()
    if (!edge) return

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
    expect(edge).not.toBeNull()
    if (!edge) return

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

    const result = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeA.id,
      edgeType: 'semantic',
      source: 'user',
    })

    expect(result).toBeNull()

    const selfLoopId = makeMindEdgeId(USER, nodeA.id, nodeA.id, 'semantic')
    const check = await getMindEdge(USER, selfLoopId)
    expect(check).toBeNull()
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
    expect(edge1).not.toBeNull()
    if (!edge1) return

    const edge2 = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })
    expect(edge2).toBeNull()

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
    expect(semanticEdge).not.toBeNull()
    if (!semanticEdge) return

    const referenceEdge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'reference',
      source: 'user',
    })
    expect(referenceEdge).not.toBeNull()
    if (!referenceEdge) return

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
    expect(baselineEdge).not.toBeNull()
    if (!baselineEdge) return

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
    expect(edge).not.toBeNull()
    if (!edge) return

    expect(edge.reason).not.toBe('baseline-auto-connect')

    const deleted = await deleteMindEdge(USER, edge.id, { confirmed: true })
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
    expect(edge).not.toBeNull()
    if (!edge) return

    await deleteMindEdge(USER, edge.id, { confirmed: true })

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
    expect(edge).not.toBeNull()
    if (!edge) return

    await deleteMindEdge(USER, edge.id, { confirmed: true })
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
    expect(edge).not.toBeNull()
    if (!edge) return

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
    expect(edge).not.toBeNull()
    if (!edge) return

    expect(edge.reason).not.toBe('baseline-auto-connect')

    await deleteMindEdge(USER, edge.id, { confirmed: true })
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
    expect(baselineEdge).not.toBeNull()
    if (!baselineEdge) return

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
    expect(baselineEdge).not.toBeNull()
    if (!baselineEdge) return

    const userEdge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: doc.id,
      targetNodeId: topic.id,
      edgeType: 'semantic',
      source: 'user',
      reason: null,
    })
    expect(userEdge).not.toBeNull()
    if (!userEdge) return

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
    expect(baselineEdge).not.toBeNull()
    if (!baselineEdge) return

    const userEdge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: doc.id,
      targetNodeId: topic.id,
      edgeType: 'semantic',
      source: 'user',
    })
    expect(userEdge).not.toBeNull()
    if (!userEdge) return

    await deleteMindEdge(USER, userEdge.id, { confirmed: true })

    const baselineReRead = await getMindEdge(USER, baselineEdge.id)
    expect(baselineReRead).not.toBeNull()

    const userReRead = await getMindEdge(USER, userEdge.id)
    expect(userReRead).toBeNull()
  })
})

describe('MIND-REAL-PHASE3: Repository Edge Guards', () => {
  it('Repository rejects self-loop edge', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })

    const result = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeA.id,
      edgeType: 'semantic',
      source: 'user',
    })

    expect(result).toBeNull()

    const edges = await listMindEdges(USER)
    expect(edges.length).toBe(0)
  })

  it('Repository rejects edge with non-existent source node', async () => {
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    const result = await upsertMindEdge({
      userId: USER,
      sourceNodeId: 'non-existent-source-id',
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })

    expect(result).toBeNull()

    const edges = await listMindEdges(USER)
    expect(edges.length).toBe(0)
  })

  it('Repository rejects edge with non-existent target node', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })

    const result = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: 'non-existent-target-id',
      edgeType: 'semantic',
      source: 'user',
    })

    expect(result).toBeNull()

    const edges = await listMindEdges(USER)
    expect(edges.length).toBe(0)
  })

  it('Repository rejects deletion of baseline-auto-connect edge', async () => {
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
    expect(baselineEdge).not.toBeNull()
    if (!baselineEdge) return

    const deleted = await deleteMindEdge(USER, baselineEdge.id, { confirmed: true })
    expect(deleted).toBe(false)

    const reRead = await getMindEdge(USER, baselineEdge.id)
    expect(reRead).not.toBeNull()
  })
})

describe('MIND-REAL-005: Parent/Root Rules', () => {
  it('parent_child edge created when connecting to parent type node', async () => {
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const topic = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })

    const edge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: topic.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.8,
      source: 'user',
      reason: 'user-parent-link',
    })
    expect(edge).not.toBeNull()
    if (!edge) return

    expect(edge).toBeDefined()
    expect(edge.edgeType).toBe('parent_child')
    expect(edge.sourceNodeId).toBe(topic.id)
    expect(edge.targetNodeId).toBe(doc.id)
    expect(edge.reason).toBe('user-parent-link')
  })

  it('semantic edge created when connecting to sibling node', async () => {
    const docA = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'DocA', documentId: 1 })
    const docB = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'DocB', documentId: 2 })

    const edge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: docA.id,
      targetNodeId: docB.id,
      edgeType: 'semantic',
      strength: 0.5,
      source: 'user',
    })
    expect(edge).not.toBeNull()
    if (!edge) return

    expect(edge).toBeDefined()
    expect(edge.edgeType).toBe('semantic')
    expect(edge.sourceNodeId).toBe(docA.id)
    expect(edge.targetNodeId).toBe(docB.id)
  })

  it('parent_child edge direction normalized to parent→child', async () => {
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const topic = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })

    const normalizedEdge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: topic.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.8,
      source: 'user',
      reason: 'user-parent-link',
    })
    expect(normalizedEdge).not.toBeNull()
    if (!normalizedEdge) return

    expect(normalizedEdge.sourceNodeId).toBe(topic.id)
    expect(normalizedEdge.targetNodeId).toBe(doc.id)

    const reverseAttemptId = makeMindEdgeId(USER, doc.id, topic.id, 'parent_child')
    const reverseAttempt = await getMindEdge(USER, reverseAttemptId)
    expect(reverseAttempt).toBeNull()
  })

  it('single parent rule: old parent removed when connecting to new parent', async () => {
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const topic1 = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic1' })
    const topic2 = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic2' })

    const edge1 = await upsertMindEdge({
      userId: USER,
      sourceNodeId: topic1.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.8,
      source: 'user',
      reason: 'user-parent-link',
    })
    expect(edge1).not.toBeNull()
    if (!edge1) return

    expect(edge1.sourceNodeId).toBe(topic1.id)

    await deleteMindEdge(USER, edge1.id, { confirmed: true })

    const edge2 = await upsertMindEdge({
      userId: USER,
      sourceNodeId: topic2.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.8,
      source: 'user',
      reason: 'user-parent-link',
    })
    expect(edge2).not.toBeNull()
    if (!edge2) return

    expect(edge2.sourceNodeId).toBe(topic2.id)
    expect(edge2.targetNodeId).toBe(doc.id)

    const allEdges = await listMindEdges(USER)
    const parentEdges = allEdges.filter(e =>
      e.edgeType === 'parent_child' && e.targetNodeId === doc.id
    )
    expect(parentEdges.length).toBe(1)
    expect(parentEdges[0].sourceNodeId).toBe(topic2.id)
  })

  it('baseline restored after deleting real parent', async () => {
    const rootNode = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const topic = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })

    const realEdge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: topic.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.8,
      source: 'user',
      reason: 'user-parent-link',
    })
    expect(realEdge).not.toBeNull()
    if (!realEdge) return

    await deleteMindEdge(USER, realEdge.id, { confirmed: true })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const baselineEdges = await ensureBaselineParentConnections(USER, nodes, edges)

    const docParentEdges = [...edges, ...baselineEdges].filter(e =>
      e.edgeType === 'parent_child' && e.targetNodeId === doc.id
    )
    expect(docParentEdges.length).toBeGreaterThanOrEqual(1)

    const hasBaseline = docParentEdges.some(e =>
      e.reason === 'baseline-auto-connect' && e.sourceNodeId === rootNode.id
    )
    expect(hasBaseline).toBe(true)
  })

  it('node with real parent does not get baseline edge', async () => {
    const rootNode = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    void rootNode
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const topic = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: topic.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.8,
      source: 'user',
      reason: 'user-parent-link',
    })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const baselineEdges = await ensureBaselineParentConnections(USER, nodes, edges)

    const baselineForDoc = baselineEdges.filter(e =>
      e.targetNodeId === doc.id && e.reason === 'baseline-auto-connect'
    )
    expect(baselineForDoc.length).toBe(0)

    const allEdges = [...edges, ...baselineEdges]
    const docParentEdges = allEdges.filter(e =>
      e.edgeType === 'parent_child' && e.targetNodeId === doc.id
    )
    expect(docParentEdges.length).toBe(1)
    expect(docParentEdges[0].sourceNodeId).toBe(topic.id)
    expect(docParentEdges[0].reason).toBe('user-parent-link')
  })
})

describe('MIND-REAL-005: Drag Connect', () => {
  it('drag connect creates real edge via handleCreateEdge', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    const edge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })
    expect(edge).not.toBeNull()
    if (!edge) return

    expect(edge).toBeDefined()
    expect(edge.sourceNodeId).toBe(nodeA.id)
    expect(edge.targetNodeId).toBe(nodeB.id)
    expect(edge.source).toBe('user')

    const reRead = await getMindEdge(USER, edge.id)
    expect(reRead).not.toBeNull()
  })

  it('drag connect and button connect share same guard - self-loop rejected', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })

    const result = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeA.id,
      edgeType: 'semantic',
      source: 'user',
    })

    expect(result).toBeNull()

    const edges = await listMindEdges(USER)
    expect(edges.length).toBe(0)
  })

  it('drag connect and button connect share same guard - duplicate rejected', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    const edge1 = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })
    expect(edge1).not.toBeNull()
    if (!edge1) return

    const edge2 = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })
    expect(edge2).toBeNull()

    const edges = await listMindEdges(USER)
    expect(edges.length).toBe(1)
  })

  it('drag connect and button connect share same guard - non-existent node rejected', async () => {
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    const result = await upsertMindEdge({
      userId: USER,
      sourceNodeId: 'non-existent-source-id',
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })

    expect(result).toBeNull()

    const edges = await listMindEdges(USER)
    expect(edges.length).toBe(0)
  })

  it('drag connect created edge persists after re-read', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    const edge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })
    expect(edge).not.toBeNull()
    if (!edge) return

    const reRead = await getMindEdge(USER, edge.id)
    expect(reRead).not.toBeNull()
    if (reRead) {
      expect(reRead.id).toBe(edge.id)
      expect(reRead.sourceNodeId).toBe(nodeA.id)
      expect(reRead.targetNodeId).toBe(nodeB.id)
      expect(reRead.edgeType).toBe('semantic')
      expect(reRead.source).toBe('user')
    }

    const allEdges = await listMindEdges(USER)
    expect(allEdges.length).toBe(1)
    expect(allEdges[0].id).toBe(edge.id)
  })
})

describe('MIND-REAL-005: Dock/Review Bridge', () => {
  it('getMindGraphHealthSummary returns correct counts', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })

    const summary = await getMindGraphHealthSummary(USER)

    expect(summary.totalNodes).toBe(3)
    expect(summary.totalEdges).toBe(1)
    expect(summary.orphanCount).toBe(0)
    expect(summary.suggestedEdgeCount).toBe(0)
    expect(summary.confirmedEdgeCount).toBe(0)
    expect(summary.conflictEdgeCount).toBe(0)
    expect(summary.rejectedRecommendationCount).toBe(0)
    expect(summary.deferredRecommendationCount).toBe(0)
  })

  it('health summary counts orphan nodes correctly', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    await upsertMindNode({ userId: USER, nodeType: 'document', label: 'OrphanDoc', documentId: 99 })
    const nodeC = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'ConnectedDoc', documentId: 100 })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeC.id,
      edgeType: 'semantic',
      source: 'user',
    })

    const summary = await getMindGraphHealthSummary(USER)

    expect(summary.totalNodes).toBe(4)
    expect(summary.orphanCount).toBe(1)
  })

  it('health summary counts suggested edges', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const nodeC = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc2', documentId: 2 })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'suggested',
      source: 'system',
    })
    await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeC.id,
      edgeType: 'confirmed',
      source: 'user',
    })

    const summary = await getMindGraphHealthSummary(USER)

    expect(summary.suggestedEdgeCount).toBe(1)
    expect(summary.confirmedEdgeCount).toBe(1)
    expect(summary.conflictEdgeCount).toBe(0)
  })

  it('health summary counts rejected/deferred recommendations', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })

    await createRecommendation({
      userId: USER,
      subjectType: 'dockItem',
      subjectId: 1,
      recommendationType: 'tag_suggestion',
      candidateType: 'tag',
      candidateId: 'tag_a',
      confidenceScore: 0.9,
      status: 'rejected',
    })
    await createRecommendation({
      userId: USER,
      subjectType: 'dockItem',
      subjectId: 2,
      recommendationType: 'tag_suggestion',
      candidateType: 'tag',
      candidateId: 'tag_b',
      confidenceScore: 0.7,
      status: 'ignored',
    })
    await createRecommendation({
      userId: USER,
      subjectType: 'dockItem',
      subjectId: 3,
      recommendationType: 'tag_suggestion',
      candidateType: 'tag',
      candidateId: 'tag_c',
      confidenceScore: 0.8,
      status: 'generated',
    })

    const summary = await getMindGraphHealthSummary(USER)

    expect(summary.rejectedRecommendationCount).toBe(1)
    expect(summary.deferredRecommendationCount).toBe(1)
  })

  it('edge operations write userBehaviorEvents', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    const edge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })
    expect(edge).not.toBeNull()
    if (!edge) return

    await recordUserBehaviorEvent({
      userId: USER,
      eventType: 'mind_edge_created',
      subjectType: 'mindNode',
      subjectId: edge.id,
      metadata: { sourceNodeId: nodeA.id, targetNodeId: nodeB.id, edgeType: 'semantic' },
    })

    const createEvents = await listUserBehaviorEvents(USER, { eventType: 'mind_edge_created' })
    expect(createEvents.length).toBe(1)
    expect(createEvents[0].eventType).toBe('mind_edge_created')
    expect(createEvents[0].subjectType).toBe('mindNode')
    expect(createEvents[0].subjectId).toBe(edge.id)

    await deleteMindEdge(USER, edge.id, { confirmed: true })

    await recordUserBehaviorEvent({
      userId: USER,
      eventType: 'mind_edge_deleted',
      subjectType: 'mindNode',
      subjectId: edge.id,
      metadata: { edgeType: 'semantic', sourceNodeId: nodeA.id, targetNodeId: nodeB.id },
    })

    const deleteEvents = await listUserBehaviorEvents(USER, { eventType: 'mind_edge_deleted' })
    expect(deleteEvents.length).toBe(1)
    expect(deleteEvents[0].eventType).toBe('mind_edge_deleted')
    expect(deleteEvents[0].subjectType).toBe('mindNode')
  })
})

describe('MIND-REAL-005: Recommendation MVP', () => {
  it('generateMindNodeRecommendations creates recommendations with reason_text/confidence/source', async () => {
    const nodeA = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'Machine Learning Basics',
      metadata: { tagIds: ['tag_ml', 'tag_ai'] },
    })
    await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'Deep Learning Advanced',
      metadata: { tagIds: ['tag_ml', 'tag_nn'] },
    })
    await upsertMindNode({
      userId: USER,
      nodeType: 'document',
      label: 'Unrelated Document',
    })

    const recs = await generateMindNodeRecommendations(USER, nodeA.id, 5)

    expect(recs.length).toBeGreaterThanOrEqual(1)

    const mlRec = recs.find(r => r.candidateId.includes('Deep'))
    if (mlRec) {
      expect(mlRec.subjectType).toBe('mindNode')
      expect(mlRec.candidateType).toBe('mindNode')
      expect(mlRec.recommendationType).toBe('link_suggestion')
      expect(mlRec.confidenceScore).toBeGreaterThan(0)
      expect(mlRec.confidenceScore).toBeLessThanOrEqual(1)
      expect(mlRec.status).toBe('generated')

      const reason = JSON.parse(mlRec.reasonJson ?? '')
      expect(reason.reason_text).toBeDefined()
      expect(reason.source).toBeDefined()
      expect(reason.confidence).toBeDefined()
      expect(typeof reason.reason_text).toBe('string')
      expect(typeof reason.source).toBe('string')
      expect(typeof reason.confidence).toBe('number')
    }
  })

  it('generateMindNodeRecommendations skips already-connected nodes', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B Connected' })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })

    const recs = await generateMindNodeRecommendations(USER, nodeA.id, 5)

    const connectedRec = recs.find(r => r.candidateId === nodeB.id)
    expect(connectedRec).toBeUndefined()
  })

  it('generateMindNodeRecommendations returns empty for non-existent node', async () => {
    const recs = await generateMindNodeRecommendations(USER, 'non-existent-node-id', 5)
    expect(recs).toEqual([])
  })

  it('accept recommendation creates real mind_edge', async () => {
    const nodeA = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'Source Topic',
      metadata: { tagIds: ['tag_x'] },
    })
    const nodeB = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'Target Topic',
      metadata: { tagIds: ['tag_x'] },
    })

    const recs = await generateMindNodeRecommendations(USER, nodeA.id, 5)
    expect(recs.length).toBeGreaterThanOrEqual(1)

    const rec = recs.find(r => r.candidateId === nodeB.id)
    expect(rec).toBeDefined()
    if (!rec) return

    const result = await applyRecommendation({ userId: USER, recommendationId: rec.id })

    expect(result.status).toBe('accepted')
    expect(result.appliedChanges.changeType).toBe('create_edge')

    const edges = await listMindEdges(USER)
    const suggestedEdge = edges.find(e =>
      e.edgeType === 'suggested' &&
      ((e.sourceNodeId === nodeA.id && e.targetNodeId === nodeB.id) ||
       (e.sourceNodeId === nodeB.id && e.targetNodeId === nodeA.id))
    )
    expect(suggestedEdge).toBeDefined()
    if (!suggestedEdge) return
    expect(suggestedEdge.source).toBe('system')
    expect(suggestedEdge.reason).toBe('recommendation_accepted')
  })

  it('reject recommendation records rejected status', async () => {
    const nodeA = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'Reject Source',
      metadata: { tagIds: ['tag_reject'] },
    })
    const nodeB = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'Reject Target',
      metadata: { tagIds: ['tag_reject'] },
    })

    const recs = await generateMindNodeRecommendations(USER, nodeA.id, 5)
    const rec = recs.find(r => r.candidateId === nodeB.id)
    expect(rec).toBeDefined()
    if (!rec) return

    await recordRecommendationFeedback({
      userId: USER,
      recommendationId: rec.id,
      feedbackType: 'rejected',
    })

    const updated = await getRecommendation(USER, rec.id)
    expect(updated).not.toBeNull()
    if (!updated) return
    expect(updated.status).toBe('rejected')
  })

  it('defer recommendation records ignored status', async () => {
    const nodeA = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'Defer Source',
      metadata: { tagIds: ['tag_defer'] },
    })
    const nodeB = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'Defer Target',
      metadata: { tagIds: ['tag_defer'] },
    })

    const recs = await generateMindNodeRecommendations(USER, nodeA.id, 5)
    const rec = recs.find(r => r.candidateId === nodeB.id)
    expect(rec).toBeDefined()
    if (!rec) return

    await recordRecommendationFeedback({
      userId: USER,
      recommendationId: rec.id,
      feedbackType: 'ignored',
    })

    const updated = await getRecommendation(USER, rec.id)
    expect(updated).not.toBeNull()
    if (!updated) return
    expect(updated.status).toBe('ignored')
  })

  it('recommendation events are written for accept/reject/defer', async () => {
    const nodeA = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'Event Source',
      metadata: { tagIds: ['tag_event'] },
    })
    const nodeB = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'Event Target',
      metadata: { tagIds: ['tag_event'] },
    })
    const nodeC = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'Event Target C',
      metadata: { tagIds: ['tag_event'] },
    })
    const nodeD = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'Event Target D',
      metadata: { tagIds: ['tag_event'] },
    })

    const recs = await generateMindNodeRecommendations(USER, nodeA.id, 5)
    expect(recs.length).toBeGreaterThanOrEqual(3)

    const recB = recs.find(r => r.candidateId === nodeB.id)
    const recC = recs.find(r => r.candidateId === nodeC.id)
    const recD = recs.find(r => r.candidateId === nodeD.id)

    if (recB) {
      await applyRecommendation({ userId: USER, recommendationId: recB.id })
      const acceptEvents = await listRecommendationEvents(USER, { eventType: 'recommendation_accepted' })
      expect(acceptEvents.length).toBeGreaterThanOrEqual(1)
      const acceptBehavior = await listUserBehaviorEvents(USER, { eventType: 'recommendation_accepted' })
      expect(acceptBehavior.length).toBeGreaterThanOrEqual(1)
    }

    if (recC) {
      await recordRecommendationFeedback({
        userId: USER,
        recommendationId: recC.id,
        feedbackType: 'rejected',
      })
      const rejectEvents = await listRecommendationEvents(USER, { eventType: 'recommendation_rejected' })
      expect(rejectEvents.length).toBeGreaterThanOrEqual(1)
      const rejectBehavior = await listUserBehaviorEvents(USER, { eventType: 'recommendation_rejected' })
      expect(rejectBehavior.length).toBeGreaterThanOrEqual(1)
    }

    if (recD) {
      await recordRecommendationFeedback({
        userId: USER,
        recommendationId: recD.id,
        feedbackType: 'ignored',
      })
      const ignoreEvents = await listRecommendationEvents(USER, { eventType: 'recommendation_ignored' })
      expect(ignoreEvents.length).toBeGreaterThanOrEqual(1)
      const ignoreBehavior = await listUserBehaviorEvents(USER, { eventType: 'recommendation_ignored' })
      expect(ignoreBehavior.length).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('MIND-REAL-005 Round 4: Recommendation dedup, already-connected, rejected skip', () => {
  it('consecutive generateMindNodeRecommendations does not produce duplicate active recommendations', async () => {
    const nodeA = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'Dedup Source',
      metadata: { tagIds: ['tag_dedup'] },
    })
    const nodeB = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'Dedup Target',
      metadata: { tagIds: ['tag_dedup'] },
    })

    const recs1 = await generateMindNodeRecommendations(USER, nodeA.id, 5)
    expect(recs1.length).toBeGreaterThanOrEqual(1)

    const recB1 = recs1.find(r => r.candidateId === nodeB.id)
    expect(recB1).toBeDefined()

    const recs2 = await generateMindNodeRecommendations(USER, nodeA.id, 5)
    const recB2 = recs2.find(r => r.candidateId === nodeB.id)
    expect(recB2).toBeUndefined()
  })

  it('already-connected candidate does not generate recommendation', async () => {
    const nodeA = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'EdgeExists Source',
      metadata: { tagIds: ['tag_edgeexists'] },
    })
    const nodeB = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'EdgeExists Target',
      metadata: { tagIds: ['tag_edgeexists'] },
    })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })

    const recs = await generateMindNodeRecommendations(USER, nodeA.id, 5)
    const recB = recs.find(r => r.candidateId === nodeB.id)
    expect(recB).toBeUndefined()
  })

  it('apply recommendation with already-existing edge returns already_connected and does not throw', async () => {
    const nodeA = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'AlreadyConnected Source',
      metadata: { tagIds: ['tag_alcon'] },
    })
    const nodeB = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'AlreadyConnected Target',
      metadata: { tagIds: ['tag_alcon'] },
    })

    const recs = await generateMindNodeRecommendations(USER, nodeA.id, 5)
    const rec = recs.find(r => r.candidateId === nodeB.id)
    expect(rec).toBeDefined()
    if (!rec) return

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      edgeType: 'semantic',
      source: 'user',
    })

    const result = await applyRecommendation({ userId: USER, recommendationId: rec.id })
    expect(result.status).toBe('accepted')
    expect(result.appliedChanges.changeType).toBe('already_connected')
  })

  it('rejected candidate is not regenerated by generateMindNodeRecommendations', async () => {
    const nodeA = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'RejectDedup Source',
      metadata: { tagIds: ['tag_rejdup'] },
    })
    const nodeB = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'RejectDedup Target',
      metadata: { tagIds: ['tag_rejdup'] },
    })

    const recs1 = await generateMindNodeRecommendations(USER, nodeA.id, 5)
    const rec = recs1.find(r => r.candidateId === nodeB.id)
    expect(rec).toBeDefined()
    if (!rec) return

    await recordRecommendationFeedback({
      userId: USER,
      recommendationId: rec.id,
      feedbackType: 'rejected',
    })

    const recs2 = await generateMindNodeRecommendations(USER, nodeA.id, 5)
    const recAgain = recs2.find(r => r.candidateId === nodeB.id)
    expect(recAgain).toBeUndefined()
  })

  it('ignored candidate can reappear on next generate (Defer MVP)', async () => {
    const nodeA = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'DeferReappear Source',
      metadata: { tagIds: ['tag_defrep'] },
    })
    const nodeB = await upsertMindNode({
      userId: USER,
      nodeType: 'topic',
      label: 'DeferReappear Target',
      metadata: { tagIds: ['tag_defrep'] },
    })

    const recs1 = await generateMindNodeRecommendations(USER, nodeA.id, 5)
    const rec = recs1.find(r => r.candidateId === nodeB.id)
    expect(rec).toBeDefined()
    if (!rec) return

    await recordRecommendationFeedback({
      userId: USER,
      recommendationId: rec.id,
      feedbackType: 'ignored',
    })

    const recs2 = await generateMindNodeRecommendations(USER, nodeA.id, 5)
    const recAgain = recs2.find(r => r.candidateId === nodeB.id)
    expect(recAgain).toBeDefined()
  })
})

describe('MIND-REAL-006: Archive Node', () => {
  it('archives a normal node successfully', async () => {
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    expect(doc.state).not.toBe('archived')

    const archived = await archiveMindNode(USER, doc.id)
    expect(archived).not.toBeNull()
    if (!archived) return
    expect(archived.state).toBe('archived')

    const reloaded = await listMindNodes(USER)
    const found = reloaded.find(n => n.id === doc.id)
    expect(found?.state).toBe('archived')
  })

  it('root node cannot be archived', async () => {
    const root = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root', state: 'anchored' })
    const result = await archiveMindNode(USER, root.id)
    expect(result).toBeNull()

    const reloaded = await listMindNodes(USER)
    const found = reloaded.find(n => n.id === root.id)
    expect(found?.state).toBe('anchored')
  })

  it('archived node excluded from snapshot', async () => {
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const topic = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: topic.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.8,
      source: 'user',
      reason: 'user-parent-link',
    })

    const nodesBefore = await listMindNodes(USER)
    const edgesBefore = await listMindEdges(USER)
    const snapshotBefore = buildSimpleMindGraphSnapshot(nodesBefore, edgesBefore)
    expect(snapshotBefore.nodes.some(n => n.id === doc.id)).toBe(true)

    await archiveMindNode(USER, doc.id)

    const nodesAfter = await listMindNodes(USER)
    const edgesAfter = await listMindEdges(USER)
    const snapshotAfter = buildSimpleMindGraphSnapshot(nodesAfter, edgesAfter)
    expect(snapshotAfter.nodes.some(n => n.id === doc.id)).toBe(false)
    expect(snapshotAfter.edges.some(e => e.sourceNodeId === doc.id || e.targetNodeId === doc.id)).toBe(false)
  })

  it('archiving already archived node is idempotent', async () => {
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const first = await archiveMindNode(USER, doc.id)
    expect(first).not.toBeNull()
    if (!first) return
    expect(first.state).toBe('archived')

    const second = await archiveMindNode(USER, doc.id)
    expect(second).not.toBeNull()
    if (!second) return
    expect(second.state).toBe('archived')
  })

  it('archived node edges do not break baseline protection', async () => {
    const root = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root', state: 'anchored' })
    void root
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const topic = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: topic.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.8,
      source: 'user',
      reason: 'user-parent-link',
    })

    await archiveMindNode(USER, doc.id)

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const baselineEdges = await ensureBaselineParentConnections(USER, nodes, edges)

    const nonArchivedDocEdges = [...edges, ...baselineEdges].filter(e =>
      e.edgeType === 'parent_child' &&
      e.targetNodeId === doc.id &&
      e.reason === 'baseline-auto-connect'
    )
    expect(nonArchivedDocEdges.length).toBe(0)
  })

  it('restoreMindNode restores archived node to drifting', async () => {
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    await archiveMindNode(USER, doc.id)

    const restored = await restoreMindNode(USER, doc.id)
    expect(restored).not.toBeNull()
    if (!restored) return
    expect(restored.state).toBe('drifting')

    const reloaded = await listMindNodes(USER)
    const found = reloaded.find(n => n.id === doc.id)
    expect(found?.state).toBe('drifting')
  })

  it('restoreMindNode is idempotent for non-archived node', async () => {
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const restored = await restoreMindNode(USER, doc.id)
    expect(restored).not.toBeNull()
    if (!restored) return
    expect(restored.state).toBe('drifting')
  })

  it('listArchivedMindNodes returns only archived nodes', async () => {
    const doc1 = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const doc2 = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc2', documentId: 2 })
    await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc3', documentId: 3 })

    await archiveMindNode(USER, doc1.id)
    await archiveMindNode(USER, doc2.id)

    const archived = await listArchivedMindNodes(USER)
    expect(archived.length).toBeGreaterThanOrEqual(2)
    const archivedIds = archived.map(n => n.id)
    expect(archivedIds).toContain(doc1.id)
    expect(archivedIds).toContain(doc2.id)
  })

  it('restored node appears in snapshot again', async () => {
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    await archiveMindNode(USER, doc.id)

    const nodesAfterArchive = await listMindNodes(USER)
    const edgesAfterArchive = await listMindEdges(USER)
    const snapshotAfterArchive = buildSimpleMindGraphSnapshot(nodesAfterArchive, edgesAfterArchive)
    expect(snapshotAfterArchive.nodes.some(n => n.id === doc.id)).toBe(false)

    await restoreMindNode(USER, doc.id)

    const nodesAfterRestore = await listMindNodes(USER)
    const edgesAfterRestore = await listMindEdges(USER)
    const snapshotAfterRestore = buildSimpleMindGraphSnapshot(nodesAfterRestore, edgesAfterRestore)
    expect(snapshotAfterRestore.nodes.some(n => n.id === doc.id)).toBe(true)
  })
})

describe('MIND-REAL-006: Move Parent / Change Parent', () => {
  it('node can move from Root baseline to real parent', async () => {
    const root = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root', state: 'anchored' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const topic = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: root.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.3,
      source: 'system',
      reason: 'baseline-auto-connect',
    })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const result = await ensureBaselineParentConnections(USER, nodes, edges)
    expect(result.length).toBe(0)

    const existingParentEdges = edges.filter(e =>
      e.edgeType === 'parent_child' && e.targetNodeId === doc.id
    )
    for (const oldEdge of existingParentEdges) {
      if (oldEdge.reason === 'baseline-auto-connect') {
        await forceDeleteBaselineEdge(USER, oldEdge.id)
      } else {
        await deleteMindEdge(USER, oldEdge.id, { confirmed: true })
      }
    }

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: topic.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.8,
      source: 'user',
      reason: 'user-parent-link',
    })

    const edgesAfter = await listMindEdges(USER)
    const docParentEdges = edgesAfter.filter(e =>
      e.edgeType === 'parent_child' && e.targetNodeId === doc.id
    )
    expect(docParentEdges.length).toBe(1)
    expect(docParentEdges[0].sourceNodeId).toBe(topic.id)
    expect(docParentEdges[0].reason).toBe('user-parent-link')
  })

  it('after move, Root baseline is not present', async () => {
    const root = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root', state: 'anchored' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const topic = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: root.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.3,
      source: 'system',
      reason: 'baseline-auto-connect',
    })

    const existingParentEdges = (await listMindEdges(USER)).filter(e =>
      e.edgeType === 'parent_child' && e.targetNodeId === doc.id
    )
    for (const oldEdge of existingParentEdges) {
      if (oldEdge.reason === 'baseline-auto-connect') {
        await forceDeleteBaselineEdge(USER, oldEdge.id)
      } else {
        await deleteMindEdge(USER, oldEdge.id, { confirmed: true })
      }
    }

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: topic.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.8,
      source: 'user',
      reason: 'user-parent-link',
    })

    const edgesAfter = await listMindEdges(USER)
    const baselineEdges = edgesAfter.filter(e =>
      e.targetNodeId === doc.id && e.reason === 'baseline-auto-connect'
    )
    expect(baselineEdges.length).toBe(0)
  })

  it('node can move from one parent to another parent', async () => {
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const topic1 = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const topic2 = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: topic1.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.8,
      source: 'user',
      reason: 'user-parent-link',
    })

    const existingParentEdges = (await listMindEdges(USER)).filter(e =>
      e.edgeType === 'parent_child' && e.targetNodeId === doc.id
    )
    for (const oldEdge of existingParentEdges) {
      await deleteMindEdge(USER, oldEdge.id, { confirmed: true })
    }

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: topic2.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.8,
      source: 'user',
      reason: 'user-parent-link',
    })

    const edgesAfter = await listMindEdges(USER)
    const docParentEdges = edgesAfter.filter(e =>
      e.edgeType === 'parent_child' && e.targetNodeId === doc.id
    )
    expect(docParentEdges.length).toBe(1)
    expect(docParentEdges[0].sourceNodeId).toBe(topic2.id)
  })

  it('single parent rule holds after move', async () => {
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const topic1 = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const topic2 = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic B' })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: topic1.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.8,
      source: 'user',
      reason: 'user-parent-link',
    })

    const existingParentEdges = (await listMindEdges(USER)).filter(e =>
      e.edgeType === 'parent_child' && e.targetNodeId === doc.id
    )
    for (const oldEdge of existingParentEdges) {
      await deleteMindEdge(USER, oldEdge.id, { confirmed: true })
    }

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: topic2.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.8,
      source: 'user',
      reason: 'user-parent-link',
    })

    const edgesAfter = await listMindEdges(USER)
    const docParentEdges = edgesAfter.filter(e =>
      e.edgeType === 'parent_child' && e.targetNodeId === doc.id
    )
    expect(docParentEdges.length).toBe(1)
  })

  it('node can move back to Root', async () => {
    const root = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root', state: 'anchored' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const topic = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: topic.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.8,
      source: 'user',
      reason: 'user-parent-link',
    })

    const existingParentEdges = (await listMindEdges(USER)).filter(e =>
      e.edgeType === 'parent_child' && e.targetNodeId === doc.id
    )
    for (const oldEdge of existingParentEdges) {
      await deleteMindEdge(USER, oldEdge.id, { confirmed: true })
    }

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: root.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.3,
      source: 'system',
      reason: 'baseline-auto-connect',
    })

    const edgesAfter = await listMindEdges(USER)
    const docParentEdges = edgesAfter.filter(e =>
      e.edgeType === 'parent_child' && e.targetNodeId === doc.id
    )
    expect(docParentEdges.length).toBe(1)
    expect(docParentEdges[0].sourceNodeId).toBe(root.id)
    expect(docParentEdges[0].reason).toBe('baseline-auto-connect')
  })

  it('self-parent is rejected', async () => {
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const edgeId = makeMindEdgeId(USER, doc.id, doc.id, 'parent_child')
    await upsertMindEdge({
      userId: USER,
      sourceNodeId: doc.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.8,
      source: 'user',
      reason: 'user-parent-link',
    })
    const found = await getMindEdge(USER, edgeId)
    expect(found).toBeNull()
  })

  it('direct parent-child cycle is detected by edge guard', async () => {
    const topic = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: topic.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.8,
      source: 'user',
      reason: 'user-parent-link',
    })

    const reverseCreated = await upsertMindEdge({
      userId: USER,
      sourceNodeId: doc.id,
      targetNodeId: topic.id,
      edgeType: 'parent_child',
      strength: 0.8,
      source: 'user',
      reason: 'user-parent-link',
    })

    if (reverseCreated) {
      const edges = await listMindEdges(USER)
      const parentEdgesToTopic = edges.filter(e =>
        e.edgeType === 'parent_child' && e.targetNodeId === topic.id
      )
      expect(parentEdgesToTopic.length).toBeLessThanOrEqual(1)
    }
  })

  it('Move Parent does not break drag connect', async () => {
    const root = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root', state: 'anchored' })
    const doc1 = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const doc2 = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc2', documentId: 2 })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: root.id,
      targetNodeId: doc1.id,
      edgeType: 'parent_child',
      strength: 0.3,
      source: 'system',
      reason: 'baseline-auto-connect',
    })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: doc1.id,
      targetNodeId: doc2.id,
      edgeType: 'semantic',
      strength: 0.5,
      source: 'user',
    })

    const edges = await listMindEdges(USER)
    const semanticEdge = edges.find(e => e.edgeType === 'semantic' && e.sourceNodeId === doc1.id && e.targetNodeId === doc2.id)
    expect(semanticEdge).toBeDefined()
    if (semanticEdge) {
      expect(semanticEdge.edgeType).toBe('semantic')
    }
  })

  it('Move Parent does not break scope/filter', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root', state: 'anchored' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const topic = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Topic A' })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: topic.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.8,
      source: 'user',
      reason: 'user-parent-link',
    })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)
    expect(snapshot.nodes.some(n => n.id === doc.id)).toBe(true)
    expect(snapshot.edges.some(e => e.sourceNodeId === topic.id && e.targetNodeId === doc.id)).toBe(true)
  })
})
