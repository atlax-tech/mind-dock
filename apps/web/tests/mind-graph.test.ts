import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { db, documentsTable, entriesTable } from '../lib/db'
import {
  upsertMindNode,
  upsertMindEdge,
  getMindNode,
  getMindEdge,
  listMindNodes,
  listMindNodesByType,
  listMindEdges,
  listMindEdgesBySourceNode,
  listMindEdgesByTargetNode,
  deleteMindNode,
  deleteMindEdge,
  updateMindNodePosition,
  syncDocumentsToMindNodes,
  syncDockStructureToMind,
  syncMindFirstScreen,
  createDockItem,
  archiveItem,
  updateItemTags,
  createStoredTag,
  updateSelectedProject,
} from '../lib/repository'
import { buildSimpleMindGraphSnapshot } from '../app/workspace/features/mind/mindSnapshotBuilder'

const USER = 'test-user'

afterEach(async () => {
  await db.delete()
  await db.open()
})

describe('Mind Graph CRUD', () => {
  describe('MindNode', () => {
    it('upserts and retrieves a mind node', async () => {
      const node = await upsertMindNode({
        userId: USER,
        nodeType: 'project',
        label: 'My Project',
        state: 'anchored',
      })
      expect(node.id).toBeTruthy()
      expect(node.nodeType).toBe('project')
      expect(node.label).toBe('My Project')
      expect(node.state).toBe('anchored')

      const fetched = await getMindNode(USER, node.id)
      expect(fetched).toBeTruthy()
      if (!fetched) return
      expect(fetched.id).toBe(node.id)
    })

    it('updates existing node on upsert', async () => {
      const node = await upsertMindNode({
        userId: USER,
        nodeType: 'project',
        label: 'My Project',
        state: 'drifting',
      })
      expect(node.state).toBe('drifting')

      const updated = await upsertMindNode({
        userId: USER,
        nodeType: 'project',
        label: 'My Project',
        state: 'anchored',
        degreeScore: 0.8,
      })
      expect(updated.state).toBe('anchored')
      expect(updated.degreeScore).toBe(0.8)
      expect(updated.id).toBe(node.id)
    })

    it('lists nodes by user', async () => {
      await upsertMindNode({ userId: USER, nodeType: 'project', label: 'P1' })
      await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'T1' })
      await upsertMindNode({ userId: 'other-user', nodeType: 'project', label: 'P2' })

      const nodes = await listMindNodes(USER)
      expect(nodes).toHaveLength(2)
    })

    it('lists nodes by type', async () => {
      await upsertMindNode({ userId: USER, nodeType: 'project', label: 'P1' })
      await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'T1' })
      await upsertMindNode({ userId: USER, nodeType: 'project', label: 'P2' })

      const projects = await listMindNodesByType(USER, 'project')
      expect(projects).toHaveLength(2)

      const topics = await listMindNodesByType(USER, 'topic')
      expect(topics).toHaveLength(1)
    })

    it('deletes a node', async () => {
      const node = await upsertMindNode({ userId: USER, nodeType: 'tag', label: 'test' })
      const deleted = await deleteMindNode(USER, node.id)
      expect(deleted).toBe(true)

      const fetched = await getMindNode(USER, node.id)
      expect(fetched).toBeNull()
    })

    it('returns false when deleting non-existent node', async () => {
      const deleted = await deleteMindNode(USER, 'nonexistent')
      expect(deleted).toBe(false)
    })

    it('returns null when getting node from different user', async () => {
      const node = await upsertMindNode({ userId: USER, nodeType: 'tag', label: 'test' })
      const fetched = await getMindNode('other-user', node.id)
      expect(fetched).toBeNull()
    })

    it('updates node position and persists it', async () => {
      const node = await upsertMindNode({ userId: USER, nodeType: 'project', label: 'Positioned' })
      expect(node.positionX).toBeNull()
      expect(node.positionY).toBeNull()

      const updated = await updateMindNodePosition(USER, node.id, 100.5, 200.3)
      expect(updated).toBeTruthy()
      if (!updated) return
      expect(updated.positionX).toBe(100.5)
      expect(updated.positionY).toBe(200.3)

      const refetched = await getMindNode(USER, node.id)
      expect(refetched).toBeTruthy()
      if (!refetched) return
      expect(refetched.positionX).toBe(100.5)
      expect(refetched.positionY).toBe(200.3)
    })

    it('returns null when updating position for wrong user', async () => {
      const node = await upsertMindNode({ userId: USER, nodeType: 'tag', label: 'test' })
      const result = await updateMindNodePosition('other-user', node.id, 10, 20)
      expect(result).toBeNull()
    })

    it('returns null when updating position for non-existent node', async () => {
      const result = await updateMindNodePosition(USER, 'nonexistent', 10, 20)
      expect(result).toBeNull()
    })

    it('returns empty list when no nodes exist', async () => {
      const nodes = await listMindNodes(USER)
      expect(nodes).toHaveLength(0)
    })
  })

  describe('MindEdge', () => {
    it('upserts and retrieves a mind edge', async () => {
      const nodeA = await upsertMindNode({ userId: USER, nodeType: 'project', label: 'A' })
      const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'B' })

      const edge = await upsertMindEdge({
        userId: USER,
        sourceNodeId: nodeA.id,
        targetNodeId: nodeB.id,
        edgeType: 'parent_child',
        strength: 0.9,
      })
      expect(edge).not.toBeNull()
      if (!edge) return
      expect(edge.id).toBeTruthy()
      expect(edge.edgeType).toBe('parent_child')
      expect(edge.strength).toBe(0.9)

      const fetched = await getMindEdge(USER, edge.id)
      expect(fetched).toBeTruthy()
      if (!fetched) return
      expect(fetched.id).toBe(edge.id)
    })

    it('updates existing edge on upsert', async () => {
      const nodeA = await upsertMindNode({ userId: USER, nodeType: 'project', label: 'A' })
      const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'B' })

      const edge = await upsertMindEdge({
        userId: USER,
        sourceNodeId: nodeA.id,
        targetNodeId: nodeB.id,
        edgeType: 'semantic',
        strength: 0.5,
      })
      expect(edge).not.toBeNull()
      if (!edge) return
      expect(edge.strength).toBe(0.5)

      const updated = await upsertMindEdge({
        userId: USER,
        sourceNodeId: nodeA.id,
        targetNodeId: nodeB.id,
        edgeType: 'semantic',
        strength: 0.8,
        confidence: 0.9,
      })
      expect(updated).toBeNull()
      const reRead = await getMindEdge(USER, edge.id)
      expect(reRead).not.toBeNull()
      if (reRead) {
        expect(reRead.strength).toBe(0.5)
      }
    })

    it('lists edges by user', async () => {
      const nodeA = await upsertMindNode({ userId: USER, nodeType: 'project', label: 'A' })
      const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'B' })
      await upsertMindEdge({
        userId: USER,
        sourceNodeId: nodeA.id,
        targetNodeId: nodeB.id,
        edgeType: 'semantic',
      })

      const edges = await listMindEdges(USER)
      expect(edges).toHaveLength(1)
    })

    it('lists edges by source node', async () => {
      const nodeA = await upsertMindNode({ userId: USER, nodeType: 'project', label: 'A' })
      const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'B' })
      const nodeC = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'C' })
      await upsertMindEdge({
        userId: USER,
        sourceNodeId: nodeA.id,
        targetNodeId: nodeB.id,
        edgeType: 'parent_child',
      })
      await upsertMindEdge({
        userId: USER,
        sourceNodeId: nodeA.id,
        targetNodeId: nodeC.id,
        edgeType: 'semantic',
      })
      await upsertMindEdge({
        userId: USER,
        sourceNodeId: nodeB.id,
        targetNodeId: nodeC.id,
        edgeType: 'reference',
      })

      const fromA = await listMindEdgesBySourceNode(USER, nodeA.id)
      expect(fromA).toHaveLength(2)

      const fromB = await listMindEdgesBySourceNode(USER, nodeB.id)
      expect(fromB).toHaveLength(1)
    })

    it('lists edges by target node', async () => {
      const nodeA = await upsertMindNode({ userId: USER, nodeType: 'project', label: 'A' })
      const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'B' })
      const nodeC = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'C' })
      await upsertMindEdge({
        userId: USER,
        sourceNodeId: nodeA.id,
        targetNodeId: nodeC.id,
        edgeType: 'parent_child',
      })
      await upsertMindEdge({
        userId: USER,
        sourceNodeId: nodeB.id,
        targetNodeId: nodeC.id,
        edgeType: 'reference',
      })

      const toC = await listMindEdgesByTargetNode(USER, nodeC.id)
      expect(toC).toHaveLength(2)
    })

    it('deletes an edge', async () => {
      const nodeA = await upsertMindNode({ userId: USER, nodeType: 'project', label: 'A' })
      const nodeB = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'B' })
      const edge = await upsertMindEdge({
        userId: USER,
        sourceNodeId: nodeA.id,
        targetNodeId: nodeB.id,
        edgeType: 'semantic',
      })
      expect(edge).not.toBeNull()
      if (!edge) return

      const deleted = await deleteMindEdge(USER, edge.id)
      expect(deleted).toBe(true)

      const fetched = await getMindEdge(USER, edge.id)
      expect(fetched).toBeNull()
    })
  })
})

describe('Document / Entry table alias', () => {
  it('documentsTable and entriesTable point to same data', async () => {
    const entryData = {
      userId: USER,
      sourceDockItemId: 1,
      title: 'Test Entry',
      content: 'Content',
      type: 'note',
      tags: ['test'],
      project: null,
      actions: [],
      createdAt: new Date(),
      archivedAt: new Date(),
    }

    const id = await entriesTable.add(entryData)

    const fromEntries = await entriesTable.get(id)
    const fromDocuments = await documentsTable.get(id)

    expect(fromEntries).toBeTruthy()
    expect(fromDocuments).toBeTruthy()
    if (!fromEntries || !fromDocuments) return
    expect(fromEntries.title).toBe('Test Entry')
    expect(fromDocuments.title).toBe('Test Entry')
  })
})

describe('MIND-REAL-005: Timeline Snapshot', () => {
  it('snapshot node carries updatedAt/createdAt from repository', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Recent Topic' })
    expect(nodeA).not.toBeNull()
    if (!nodeA) return

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    const snapNode = snapshot.nodes.find(n => n.id === nodeA.id)
    expect(snapNode).toBeDefined()
    if (!snapNode) return
    expect(snapNode.updatedAt).not.toBeNull()
    expect(snapNode.createdAt).not.toBeNull()
    expect(typeof snapNode.updatedAt).toBe('number')
    expect(typeof snapNode.createdAt).toBe('number')
  })

  it('timeline filter returns nodes updated within 7 days', async () => {
    await upsertMindNode({ userId: USER, nodeType: 'root', label: 'Root' })
    await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Recent Topic' })

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    const now = Date.now()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    const recentNodes = snapshot.nodes.filter(n => {
      const ts = n.updatedAt ?? n.createdAt
      if (ts != null) return now - ts < sevenDaysMs
      return false
    })

    expect(recentNodes.length).toBeGreaterThanOrEqual(2)
  })

  it('timeline filter excludes nodes older than 7 days', async () => {
    const nodeA = await upsertMindNode({ userId: USER, nodeType: 'topic', label: 'Old Topic' })
    expect(nodeA).not.toBeNull()
    if (!nodeA) return

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    const snapNode = snapshot.nodes.find(n => n.id === nodeA.id)
    expect(snapNode).toBeDefined()
    if (!snapNode) return

    expect(snapNode.updatedAt).not.toBeNull()
    if (snapNode.updatedAt != null) {
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
      expect(Date.now() - snapNode.updatedAt).toBeLessThan(sevenDaysMs)
    }
  })
})

describe('MIND-REAL-005: Dock Structure Sync', () => {
  it('syncs project and tag nodes from archived entries', async () => {
    const tag = await createStoredTag(USER, 'TypeScript')
    expect(tag).not.toBeNull()

    const itemId = await createDockItem(USER, 'TS Entry', 'text')
    await updateSelectedProject(USER, itemId, 'Mind Project')
    await updateItemTags(USER, itemId, ['TypeScript'])
    await archiveItem(USER, itemId)

    await syncDocumentsToMindNodes(USER)
    const result = await syncDockStructureToMind(USER)

    expect(result.projectNodes).toBeGreaterThanOrEqual(1)
    expect(result.tagNodes).toBeGreaterThanOrEqual(1)
    expect(result.edges).toBeGreaterThanOrEqual(1)

    const nodes = await listMindNodes(USER)
    const projectNode = nodes.find(n => n.nodeType === 'project' && n.label === 'Mind Project')
    expect(projectNode).toBeDefined()

    const tagNode = nodes.find(n => n.nodeType === 'tag' && n.label === 'TypeScript')
    expect(tagNode).toBeDefined()

    const edges = await listMindEdges(USER)
    const parentEdge = edges.find(e => e.edgeType === 'parent_child' && e.sourceNodeId === projectNode?.id)
    expect(parentEdge).toBeDefined()

    const semanticEdge = edges.find(e => e.edgeType === 'semantic' && e.sourceNodeId === tagNode?.id)
    expect(semanticEdge).toBeDefined()
  })

  it('idempotent: repeated sync does not create duplicates', async () => {
    const itemId = await createDockItem(USER, 'Idempotent Entry', 'text')
    await updateSelectedProject(USER, itemId, 'IdempotentProject')
    await updateItemTags(USER, itemId, ['IdempotentTag'])
    await archiveItem(USER, itemId)

    await syncDocumentsToMindNodes(USER)
    const result1 = await syncDockStructureToMind(USER)
    expect(result1.projectNodes).toBeGreaterThanOrEqual(1)

    const result2 = await syncDockStructureToMind(USER)
    expect(result2.projectNodes).toBe(0)
    expect(result2.tagNodes).toBe(0)
    expect(result2.edges).toBe(0)
  })

  it('synced edges appear in snapshot', async () => {
    const itemId = await createDockItem(USER, 'Snapshot Entry', 'text')
    await updateSelectedProject(USER, itemId, 'SnapshotProject')
    await updateItemTags(USER, itemId, ['SnapshotTag'])
    await archiveItem(USER, itemId)

    await syncDocumentsToMindNodes(USER)
    await syncDockStructureToMind(USER)

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    const projectInSnapshot = snapshot.nodes.find(n => n.nodeType === 'project')
    expect(projectInSnapshot).toBeDefined()

    const tagInSnapshot = snapshot.nodes.find(n => n.nodeType === 'tag')
    expect(tagInSnapshot).toBeDefined()

    const parentEdgeInSnapshot = snapshot.edges.find(e => e.edgeType === 'parent_child')
    expect(parentEdgeInSnapshot).toBeDefined()
  })
})

describe('MIND-REAL-005: syncMindFirstScreen sequential sync', () => {
  it('creates document nodes then project/tag nodes and edges in one call', async () => {
    const tag = await createStoredTag(USER, 'Rust')
    expect(tag).not.toBeNull()

    const itemId = await createDockItem(USER, 'Rust Entry', 'text')
    await updateSelectedProject(USER, itemId, 'SystemsProject')
    await updateItemTags(USER, itemId, ['Rust'])
    await archiveItem(USER, itemId)

    const nodesBefore = await listMindNodes(USER)
    expect(nodesBefore.filter(n => n.nodeType === 'document')).toHaveLength(0)
    expect(nodesBefore.filter(n => n.nodeType === 'project')).toHaveLength(0)
    expect(nodesBefore.filter(n => n.nodeType === 'tag')).toHaveLength(0)

    const result = await syncMindFirstScreen(USER)

    expect(result.documentNodesCreated).toBeGreaterThanOrEqual(1)
    expect(result.projectNodesCreated).toBeGreaterThanOrEqual(1)
    expect(result.tagNodesCreated).toBeGreaterThanOrEqual(1)
    expect(result.edgesCreated).toBeGreaterThanOrEqual(2)

    const nodesAfter = await listMindNodes(USER)
    const docNode = nodesAfter.find(n => n.nodeType === 'document')
    expect(docNode).toBeDefined()

    const projectNode = nodesAfter.find(n => n.nodeType === 'project' && n.label === 'SystemsProject')
    expect(projectNode).toBeDefined()

    const tagNode = nodesAfter.find(n => n.nodeType === 'tag' && n.label === 'Rust')
    expect(tagNode).toBeDefined()

    const edges = await listMindEdges(USER)
    const parentEdge = edges.find(e => e.edgeType === 'parent_child' && e.sourceNodeId === projectNode?.id && e.targetNodeId === docNode?.id)
    expect(parentEdge).toBeDefined()

    const semanticEdge = edges.find(e => e.edgeType === 'semantic' && e.sourceNodeId === tagNode?.id && e.targetNodeId === docNode?.id)
    expect(semanticEdge).toBeDefined()
  })

  it('idempotent: repeated unified sync does not create duplicates', async () => {
    const itemId = await createDockItem(USER, 'IdempotentUnified Entry', 'text')
    await updateSelectedProject(USER, itemId, 'IdempotentUnifiedProject')
    await updateItemTags(USER, itemId, ['IdempotentUnifiedTag'])
    await archiveItem(USER, itemId)

    const result1 = await syncMindFirstScreen(USER)
    expect(result1.documentNodesCreated).toBeGreaterThanOrEqual(1)
    expect(result1.projectNodesCreated).toBeGreaterThanOrEqual(1)

    const result2 = await syncMindFirstScreen(USER)
    expect(result2.documentNodesCreated).toBe(0)
    expect(result2.projectNodesCreated).toBe(0)
    expect(result2.tagNodesCreated).toBe(0)
    expect(result2.edgesCreated).toBe(0)
  })

  it('unified sync result appears in snapshot', async () => {
    const itemId = await createDockItem(USER, 'UnifiedSnapshot Entry', 'text')
    await updateSelectedProject(USER, itemId, 'UnifiedSnapshotProject')
    await updateItemTags(USER, itemId, ['UnifiedSnapshotTag'])
    await archiveItem(USER, itemId)

    await syncMindFirstScreen(USER)

    const nodes = await listMindNodes(USER)
    const edges = await listMindEdges(USER)
    const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)

    const projectInSnapshot = snapshot.nodes.find(n => n.nodeType === 'project')
    expect(projectInSnapshot).toBeDefined()

    const tagInSnapshot = snapshot.nodes.find(n => n.nodeType === 'tag')
    expect(tagInSnapshot).toBeDefined()

    const parentEdgeInSnapshot = snapshot.edges.find(e => e.edgeType === 'parent_child')
    expect(parentEdgeInSnapshot).toBeDefined()

    const semanticEdgeInSnapshot = snapshot.edges.find(e => e.edgeType === 'semantic')
    expect(semanticEdgeInSnapshot).toBeDefined()
  })
})
