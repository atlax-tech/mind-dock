import type { StoredMindNode, StoredMindEdge } from '@/lib/repository'
import type { MindGraphSnapshot, MindGraphSnapshotNode, MindGraphSnapshotEdge } from './types'

export function buildSimpleMindGraphSnapshot(
  nodes: StoredMindNode[],
  edges: StoredMindEdge[],
): MindGraphSnapshot {
  const snapshotNodes: MindGraphSnapshotNode[] = nodes.map(n => ({
    id: n.id,
    nodeType: n.nodeType,
    label: n.label,
    documentId: n.documentId,
    state: n.state,
    degreeScore: n.degreeScore || 0,
    recentActivityScore: n.recentActivityScore || 0,
    documentWeightScore: n.documentWeightScore || 0,
    userPinScore: n.userPinScore || 0,
    clusterCenterScore: n.clusterCenterScore || 0,
    positionX: n.positionX ?? null,
    positionY: n.positionY ?? null,
    metadata: n.metadata as Record<string, unknown> | null,
  }))

  const snapshotEdges: MindGraphSnapshotEdge[] = edges.map(e => ({
    id: e.id,
    sourceNodeId: e.sourceNodeId,
    targetNodeId: e.targetNodeId,
    edgeType: e.edgeType,
    strength: e.strength || 0.5,
    source: 'system',
    confidence: 0.5,
    reason: null,
  }))

  const rootNodeId = nodes.find(n => n.nodeType === 'root')?.id || null

  return {
    nodes: snapshotNodes,
    edges: snapshotEdges,
    rootNodeId,
    generatedAt: Date.now(),
  }
}
