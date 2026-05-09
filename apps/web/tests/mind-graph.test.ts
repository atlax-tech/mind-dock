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
} from '../lib/repository'

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
      expect(edge.strength).toBe(0.5)

      const updated = await upsertMindEdge({
        userId: USER,
        sourceNodeId: nodeA.id,
        targetNodeId: nodeB.id,
        edgeType: 'semantic',
        strength: 0.8,
        confidence: 0.9,
      })
      expect(updated.strength).toBe(0.8)
      expect(updated.confidence).toBe(0.9)
      expect(updated.id).toBe(edge.id)
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
