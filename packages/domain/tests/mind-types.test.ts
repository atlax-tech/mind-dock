import { describe, expect, it } from 'vitest'

import { makeMindNodeId, makeMindEdgeId } from '../src/mind/types'
import type { MindNode, MindEdge, MindNodeType, MindNodeState, MindEdgeType } from '../src/mind/types'

describe('Mind Types', () => {
  describe('MindNodeType', () => {
    it('covers all defined node types', () => {
      const types: MindNodeType[] = [
        'root', 'domain', 'project', 'topic', 'document',
        'fragment', 'source', 'tag', 'question', 'insight', 'time',
      ]
      expect(types).toHaveLength(11)
    })
  })

  describe('MindNodeState', () => {
    it('covers all defined node states', () => {
      const states: MindNodeState[] = [
        'drifting', 'suggested', 'anchored', 'archived',
        'dormant', 'active', 'conflicted', 'isolated',
      ]
      expect(states).toHaveLength(8)
    })
  })

  describe('MindEdgeType', () => {
    it('covers all defined edge types', () => {
      const types: MindEdgeType[] = [
        'parent_child', 'semantic', 'reference', 'source',
        'temporal', 'confirmed', 'suggested', 'conflict',
      ]
      expect(types).toHaveLength(8)
    })
  })

  describe('makeMindNodeId', () => {
    it('generates deterministic ID from userId, nodeType, label', () => {
      const id1 = makeMindNodeId('user1', 'project', 'My Project')
      const id2 = makeMindNodeId('user1', 'project', 'My Project')
      expect(id1).toBe(id2)
    })

    it('different userId produces different ID', () => {
      const id1 = makeMindNodeId('user1', 'project', 'My Project')
      const id2 = makeMindNodeId('user2', 'project', 'My Project')
      expect(id1).not.toBe(id2)
    })

    it('normalizes label whitespace and case', () => {
      const id1 = makeMindNodeId('user1', 'project', 'My Project')
      const id2 = makeMindNodeId('user1', 'project', '  my   project  ')
      expect(id1).toBe(id2)
    })

    it('truncates long labels', () => {
      const longLabel = 'a'.repeat(100)
      const id = makeMindNodeId('user1', 'project', longLabel)
      expect(id.length).toBeLessThan(longLabel.length + 50)
    })

    it('includes documentId in ID for document nodeType when provided', () => {
      const idWithoutDoc = makeMindNodeId('user1', 'document', 'My Doc')
      const idWithDoc = makeMindNodeId('user1', 'document', 'My Doc', 42)
      expect(idWithDoc).toContain('_42')
      expect(idWithDoc).not.toBe(idWithoutDoc)
    })

    it('does not include documentId for non-document nodeType', () => {
      const idWithoutDoc = makeMindNodeId('user1', 'project', 'My Project')
      const idWithDoc = makeMindNodeId('user1', 'project', 'My Project', 42)
      expect(idWithoutDoc).toBe(idWithDoc)
    })

    it('different documentId produces different ID for same label', () => {
      const id1 = makeMindNodeId('user1', 'document', 'My Doc', 1)
      const id2 = makeMindNodeId('user1', 'document', 'My Doc', 2)
      expect(id1).not.toBe(id2)
    })
  })

  describe('makeMindEdgeId', () => {
    it('generates deterministic ID from userId, source, target, edgeType', () => {
      const id1 = makeMindEdgeId('user1', 'nodeA', 'nodeB', 'semantic')
      const id2 = makeMindEdgeId('user1', 'nodeA', 'nodeB', 'semantic')
      expect(id1).toBe(id2)
    })

    it('different edgeType produces different ID', () => {
      const id1 = makeMindEdgeId('user1', 'nodeA', 'nodeB', 'semantic')
      const id2 = makeMindEdgeId('user1', 'nodeA', 'nodeB', 'parent_child')
      expect(id1).not.toBe(id2)
    })
  })

  describe('MindNode interface', () => {
    it('can construct a valid MindNode', () => {
      const node: MindNode = {
        id: makeMindNodeId('user1', 'project', 'Test'),
        userId: 'user1',
        nodeType: 'project',
        label: 'Test',
        state: 'anchored',
        documentId: null,
        degreeScore: 0.5,
        recentActivityScore: 0.3,
        documentWeightScore: 0.2,
        userPinScore: 0,
        clusterCenterScore: 0.1,
        positionX: 100,
        positionY: 200,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      expect(node.nodeType).toBe('project')
      expect(node.state).toBe('anchored')
    })
  })

  describe('MindEdge interface', () => {
    it('can construct a valid MindEdge', () => {
      const edge: MindEdge = {
        id: makeMindEdgeId('user1', 'nodeA', 'nodeB', 'semantic'),
        userId: 'user1',
        sourceNodeId: 'nodeA',
        targetNodeId: 'nodeB',
        edgeType: 'semantic',
        strength: 0.8,
        source: 'system',
        confidence: 0.9,
        reason: 'semantic similarity',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      expect(edge.edgeType).toBe('semantic')
      expect(edge.strength).toBe(0.8)
    })
  })
})
