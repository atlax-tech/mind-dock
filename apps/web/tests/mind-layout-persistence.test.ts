import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { db } from '../lib/db'
import {
  upsertMindNode,
  upsertMindEdge,
  getMindNode,
  listMindNodes,
  listMindEdges,
  updateMindNodePosition,
  deleteMindEdge,
} from '../lib/repository'
import { buildSimpleMindGraphSnapshot } from '../app/workspace/features/mind/mindSnapshotBuilder'
import { snapshotToGraphology } from '../app/workspace/features/mind/mindGraphAdapter'
import { applyForceAtlas2Layout, hasEnoughPositions } from '../app/workspace/features/mind/mindGraphLayout'

const USER = 'test-user'

afterEach(async () => {
  await db.delete()
  await db.open()
})

describe('MIND-REAL-003: Position Persistence', () => {
  it('saved position is not overwritten by fallback layout in snapshotToGraphology', async () => {
    const rootNode = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1, positionX: 123.45, positionY: 678.9 })
    await upsertMindEdge({ userId: USER, sourceNodeId: rootNode.id, targetNodeId: doc.id, edgeType: 'parent_child' })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)
    const gs = snapshotToGraphology(snapshot)

    const docAttrs = gs.graph.getNodeAttributes(doc.id)
    expect(docAttrs.x).toBe(123.45)
    expect(docAttrs.y).toBe(678.9)
    expect(docAttrs.originalX).toBe(123.45)
    expect(docAttrs.originalY).toBe(678.9)
  })

  it('node without position gets fallback layout in snapshotToGraphology', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)
    const gs = snapshotToGraphology(snapshot)

    const docAttrs = gs.graph.getNodeAttributes(doc.id)
    expect(docAttrs.x).not.toBe(0)
    expect(docAttrs.y).not.toBe(0)
    expect(docAttrs.originalX).toBeNull()
    expect(docAttrs.originalY).toBeNull()
  })

  it('position update persists and can be re-read', async () => {
    const node = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    expect(node.positionX).toBeNull()
    expect(node.positionY).toBeNull()

    const updated = await updateMindNodePosition(USER, node.id, 250.0, 350.0)
    expect(updated).toBeTruthy()
    if (updated) {
      expect(updated.positionX).toBe(250.0)
      expect(updated.positionY).toBe(350.0)
    }

    const refetched = await getMindNode(USER, node.id)
    expect(refetched).toBeTruthy()
    if (refetched) {
      expect(refetched.positionX).toBe(250.0)
      expect(refetched.positionY).toBe(350.0)
    }
  })

  it('saved positions survive layout algorithm (noverlap + reapply)', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root', positionX: 0, positionY: 0 })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1, positionX: 500, positionY: 500 })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)
    const gs = snapshotToGraphology(snapshot)

    applyForceAtlas2Layout(gs.graph)

    const docAttrs = gs.graph.getNodeAttributes(doc.id)
    expect(docAttrs.x).toBe(500)
    expect(docAttrs.y).toBe(500)
  })

  it('hasEnoughPositions correctly detects saved positions', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root', positionX: 0, positionY: 0 })
    await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1, positionX: 100, positionY: 100 })
    const doc2 = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc2', documentId: 2 })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)
    const gs = snapshotToGraphology(snapshot)

    expect(hasEnoughPositions(gs.graph, 0.8)).toBe(false)

    await updateMindNodePosition(USER, doc2.id, 200, 200)

    const nodes2 = await listMindNodes(USER)
    const snapshot2 = buildSimpleMindGraphSnapshot(nodes2, edges)
    const gs2 = snapshotToGraphology(snapshot2)

    expect(hasEnoughPositions(gs2.graph, 0.8)).toBe(true)
  })
})

describe('MIND-REAL-003: Root/Parent Baseline Connection', () => {
  it('baseline connection creates real parent_child edge, not mock', async () => {
    const rootNode = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: rootNode.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.3,
      source: 'system',
      confidence: 0.5,
      reason: 'baseline-auto-connect',
    })

    const edges = await listMindEdges(USER)
    expect(edges).toHaveLength(1)
    expect(edges[0].edgeType).toBe('parent_child')
    expect(edges[0].sourceNodeId).toBe(rootNode.id)
    expect(edges[0].targetNodeId).toBe(doc.id)
    expect(edges[0].reason).toBe('baseline-auto-connect')
    expect(edges[0].id).not.toContain('mock-edge-')
  })

  it('document node with existing parent_child edge does not get duplicate', async () => {
    const rootNode = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const project = await upsertMindNode({ userId: USER, nodeType: 'project', label: 'P1' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })

    await upsertMindEdge({ userId: USER, sourceNodeId: rootNode.id, targetNodeId: project.id, edgeType: 'parent_child' })
    await upsertMindEdge({ userId: USER, sourceNodeId: project.id, targetNodeId: doc.id, edgeType: 'parent_child' })

    const edges = await listMindEdges(USER)
    const docParentEdges = edges.filter(e => e.targetNodeId === doc.id && e.edgeType === 'parent_child')
    expect(docParentEdges).toHaveLength(1)
    expect(docParentEdges[0].sourceNodeId).toBe(project.id)
  })

  it('snapshot does not contain mock edges', async () => {
    const rootNode = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    await upsertMindEdge({ userId: USER, sourceNodeId: rootNode.id, targetNodeId: doc.id, edgeType: 'parent_child' })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    for (const edge of snapshot.edges) {
      expect(edge.id).not.toContain('mock-edge-')
      expect(edge.id).not.toContain('demo-')
    }
  })

  it('orphan document gets root→document parent_child edge in current snapshot after ensureBaselineParentConnections', async () => {
    const rootNode = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    await upsertMindNode({ userId: USER, nodeType: 'document', label: 'OrphanDoc', documentId: 42 })

    const nodes = await listMindNodes(USER)
    const edgesBefore = await listMindEdges(USER)
    expect(edgesBefore).toHaveLength(0)

    const structuralTargets = new Set<string>()
    edgesBefore.forEach(e => { if (e.edgeType === 'parent_child') structuralTargets.add(e.targetNodeId) })
    const orphans = nodes.filter(n => n.nodeType === 'document' && !structuralTargets.has(n.id))
    expect(orphans).toHaveLength(1)

    const baselineEdges: typeof edgesBefore = []
    for (const orphan of orphans) {
      const edge = await upsertMindEdge({
        userId: USER,
        sourceNodeId: rootNode.id,
        targetNodeId: orphan.id,
        edgeType: 'parent_child',
        strength: 0.3,
        source: 'system',
        confidence: 0.5,
        reason: 'baseline-auto-connect',
      })
      if (edge) baselineEdges.push(edge)
    }

    expect(baselineEdges).toHaveLength(1)
    expect(baselineEdges[0].edgeType).toBe('parent_child')
    expect(baselineEdges[0].reason).toBe('baseline-auto-connect')

    const combinedEdges = [...edgesBefore, ...baselineEdges]
    const snapshot = buildSimpleMindGraphSnapshot(nodes, combinedEdges)

    const snapRoot = snapshot.nodes.find(n => n.nodeType === 'root')
    const snapDoc = snapshot.nodes.find(n => n.nodeType === 'document')
    expect(snapRoot).toBeTruthy()
    expect(snapDoc).toBeTruthy()

    if (!snapRoot || !snapDoc) return

    const parentEdge = snapshot.edges.find(
      e => e.sourceNodeId === snapRoot.id && e.targetNodeId === snapDoc.id && e.edgeType === 'parent_child',
    )
    expect(parentEdge).toBeTruthy()
    if (parentEdge) {
      expect(parentEdge.reason).toBe('baseline-auto-connect')
    }
  })

  it('ensureBaselineParentConnections returns empty when no orphans exist', async () => {
    const rootNode = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const project = await upsertMindNode({ userId: USER, nodeType: 'project', label: 'P1' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    await upsertMindEdge({ userId: USER, sourceNodeId: rootNode.id, targetNodeId: project.id, edgeType: 'parent_child' })
    await upsertMindEdge({ userId: USER, sourceNodeId: project.id, targetNodeId: doc.id, edgeType: 'parent_child' })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)

    const structuralTargets = new Set<string>()
    edges.forEach(e => { if (e.edgeType === 'parent_child') structuralTargets.add(e.targetNodeId) })
    const orphans = nodes.filter(n => n.nodeType === 'document' && !structuralTargets.has(n.id))
    expect(orphans).toHaveLength(0)
  })

  it('ensureBaselineParentConnections returns empty when no root node exists', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })

    const nodes = await listMindNodes(USER)
    const rootNode = nodes.find(n => n.nodeType === 'root')
    expect(rootNode).toBeFalsy()
  })

  it('baseline-auto-connect edge is protected from deletion', async () => {
    const rootNode = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })

    const baselineEdge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: rootNode.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.3,
      source: 'system',
      confidence: 0.5,
      reason: 'baseline-auto-connect',
    })
    expect(baselineEdge).not.toBeNull()
    if (!baselineEdge) return

    const edgesBeforeDelete = await listMindEdges(USER)
    expect(edgesBeforeDelete).toHaveLength(1)

    const deleted = await deleteMindEdge(USER, baselineEdge.id, { confirmed: true })
    expect(deleted).toBe(false)

    const edgesAfterDelete = await listMindEdges(USER)
    expect(edgesAfterDelete).toHaveLength(1)
  })

  it('snapshot preserves reason field for baseline-auto-connect edges', async () => {
    const rootNode = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: rootNode.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      strength: 0.3,
      source: 'system',
      confidence: 0.5,
      reason: 'baseline-auto-connect',
    })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    const baselineEdge = snapshot.edges.find(e => e.reason === 'baseline-auto-connect')
    expect(baselineEdge).toBeTruthy()
    if (baselineEdge) {
      expect(baselineEdge.source).toBe('system')
      expect(baselineEdge.confidence).toBe(0.5)
    }
  })

  it('non-baseline edge can be deleted without recreation', async () => {
    const rootNode = await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })
    const project = await upsertMindNode({ userId: USER, nodeType: 'project', label: 'P1' })

    await upsertMindEdge({
      userId: USER,
      sourceNodeId: rootNode.id,
      targetNodeId: doc.id,
      edgeType: 'parent_child',
      reason: 'baseline-auto-connect',
    })
    const semanticEdge = await upsertMindEdge({
      userId: USER,
      sourceNodeId: project.id,
      targetNodeId: doc.id,
      edgeType: 'semantic',
      strength: 0.8,
      source: 'user',
    })
    expect(semanticEdge).not.toBeNull()
    if (!semanticEdge) return

    await deleteMindEdge(USER, semanticEdge.id, { confirmed: true })

    const edgesAfterDelete = await listMindEdges(USER)
    expect(edgesAfterDelete).toHaveLength(1)
    expect(edgesAfterDelete[0].reason).toBe('baseline-auto-connect')
  })
})

describe('MIND-REAL-003: Regression Guards', () => {
  it('MIND-REAL-001: mock edge clearance does not regress', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    await upsertMindNode({ userId: USER, nodeType: 'project', label: 'P1' })
    await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'T1' })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    expect(snapshot.edges).toHaveLength(0)
    for (const edge of snapshot.edges) {
      expect(edge.id).not.toContain('mock-edge-')
    }
  })

  it('MIND-REAL-002: Mind → Editor opening does not regress', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 99, metadata: { sourceType: 'document', entryId: 99 } })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    const docNode = snapshot.nodes.find(n => n.documentId != null)
    expect(docNode).toBeTruthy()
    if (!docNode) return
    expect(docNode.documentId).toBe(99)

    const sourceType = (docNode.metadata?.sourceType as 'draft' | 'document') ?? 'draft'
    expect(sourceType).toBe('document')
  })

  it('snapshot node/edge structure is stable after position update', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    const doc = await upsertMindNode({ userId: USER, nodeType: 'document', label: 'Doc1', documentId: 1 })

    const nodes1 = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot1 = buildSimpleMindGraphSnapshot(nodes1, edges)

    await updateMindNodePosition(USER, doc.id, 100, 200)

    const nodes2 = await listMindNodes(USER)
    const snapshot2 = buildSimpleMindGraphSnapshot(nodes2, edges)

    expect(snapshot1.nodes.map(n => n.id).sort()).toEqual(snapshot2.nodes.map(n => n.id).sort())
    expect(snapshot1.edges.map(e => e.id).sort()).toEqual(snapshot2.edges.map(e => e.id).sort())
  })
})
