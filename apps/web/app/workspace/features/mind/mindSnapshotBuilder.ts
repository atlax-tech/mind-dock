import type { StoredMindNode, StoredMindEdge } from '@/lib/repository'
import type { MindGraphSnapshot, MindGraphSnapshotNode, MindGraphSnapshotEdge } from './types'

export function buildSimpleMindGraphSnapshot(
  nodes: StoredMindNode[],
  edges: StoredMindEdge[],
): MindGraphSnapshot {
  const filteredNodes = nodes.filter(n => {
    const src = (n.metadata as Record<string, unknown> | null)?.sourceType
    if (src === 'draft') return false
    if (n.state === 'archived') return false
    return true
  })

  const snapshotNodes: MindGraphSnapshotNode[] = filteredNodes.map(n => ({
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
    createdAt: n.createdAt ? new Date(n.createdAt).getTime() : null,
    updatedAt: n.updatedAt ? new Date(n.updatedAt).getTime() : null,
  }))

  const snapshotEdges: MindGraphSnapshotEdge[] = edges
    .filter(e => {
      const srcId = e.sourceNodeId
      const tgtId = e.targetNodeId
      return filteredNodes.some(n => n.id === srcId) && filteredNodes.some(n => n.id === tgtId)
    })
    .map(e => ({
    id: e.id,
    sourceNodeId: e.sourceNodeId,
    targetNodeId: e.targetNodeId,
    edgeType: e.edgeType,
    strength: e.strength || 0.5,
    source: e.source || 'system',
    confidence: e.confidence ?? null,
    reason: e.reason ?? null,
  }))

  const rootNodeId = filteredNodes.find(n => n.nodeType === 'root')?.id || null

  return {
    nodes: snapshotNodes,
    edges: snapshotEdges,
    rootNodeId,
    generatedAt: Date.now(),
  }
}
