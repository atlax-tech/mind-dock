import Graph from 'graphology'
import type { MindGraphSnapshot } from '@/lib/repository'
import type { MindNodeType, MindEdgeType } from '@atlax/domain'
import { getNodeColor, getNodeBaseSize, getNodeLabelSize, getEdgeStyle } from './mindGraphStyle'

export interface GraphNodeAttributes {
  nodeType: MindNodeType
  label: string
  documentId: number | null
  color: string
  baseSize: number
  size: number
  labelSize: number
  degreeScore: number
  recentActivityScore: number
  confidence: number | null
  reason: string | null
  documentWeightScore: number
  userPinScore: number
  clusterCenterScore: number
  originalX: number | null
  originalY: number | null
  x?: number
  y?: number
  hidden?: boolean
  renderedSize?: number
}

export interface GraphEdgeAttributes {
  edgeType: MindEdgeType
  strength: number
  confidence: number | null
  reason: string | null
  color: string
  baseWidth: number
  size: number
  dashed: boolean
  hidden?: boolean
}

export interface MindGraphState {
  graph: Graph<GraphNodeAttributes, GraphEdgeAttributes>
  rootNodeId: string | null
  nodeCount: number
  edgeCount: number
}

function stableHashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0
  }
  return (h >>> 0) / 0x100000000
}

function seededPosition(id: string, idx: number, totalCount: number): { x: number; y: number } {
  if (totalCount <= 0) return { x: 0, y: 0 }
  const hash = stableHashStr(id)
  const angle = ((idx / totalCount) * Math.PI * 2 + hash * Math.PI) % (Math.PI * 2)
  const radius = 150 + hash * 350
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  }
}

export function snapshotToGraphology(snapshot: MindGraphSnapshot): MindGraphState {
  const graph = new Graph<GraphNodeAttributes, GraphEdgeAttributes>({ multi: false })
  const totalNodes = snapshot.nodes.length

  snapshot.nodes.forEach((n, idx) => {
    const color = getNodeColor(n.nodeType)
    const baseSize = getNodeBaseSize(n.nodeType)
    const labelSize = getNodeLabelSize(n.nodeType)

    const hasPos = n.positionX != null && n.positionY != null
    const seeded = !hasPos ? seededPosition(n.id, idx, Math.max(totalNodes, 1)) : null

    graph.addNode(n.id, {
      nodeType: n.nodeType as MindNodeType,
      label: n.label,
      documentId: n.documentId,
      color,
      baseSize,
      size: baseSize,
      labelSize,
      degreeScore: n.degreeScore,
      recentActivityScore: n.recentActivityScore,
      confidence: null,
      reason: null,
      documentWeightScore: n.documentWeightScore,
      userPinScore: n.userPinScore,
      clusterCenterScore: n.clusterCenterScore,
      originalX: n.positionX ?? null,
      originalY: n.positionY ?? null,
      x: n.positionX ?? seeded?.x ?? 0,
      y: n.positionY ?? seeded?.y ?? 0,
    })
  })

  snapshot.edges.forEach(e => {
    if (!graph.hasNode(e.sourceNodeId) || !graph.hasNode(e.targetNodeId)) return
    if (e.sourceNodeId === e.targetNodeId) return
    if (graph.hasEdge(e.sourceNodeId, e.targetNodeId)) return

    const style = getEdgeStyle(e.edgeType)

    graph.addEdge(e.sourceNodeId, e.targetNodeId, {
      edgeType: e.edgeType as MindEdgeType,
      strength: e.strength,
      confidence: e.confidence,
      reason: e.reason,
      color: style.color,
      baseWidth: style.width,
      size: style.width,
      dashed: style.dashed,
    })
  })

  return {
    graph,
    rootNodeId: snapshot.rootNodeId,
    nodeCount: graph.order,
    edgeCount: graph.size,
  }
}

export function precomputeAdjacency(graph: Graph<GraphNodeAttributes, GraphEdgeAttributes>): {
  neighborMap: Map<string, Set<string>>
  incidentEdgesMap: Map<string, Set<string>>
} {
  const neighborMap = new Map<string, Set<string>>()
  const incidentEdgesMap = new Map<string, Set<string>>()

  graph.forEachNode(nodeId => {
    neighborMap.set(nodeId, new Set<string>())
    incidentEdgesMap.set(nodeId, new Set<string>())
  })

  graph.forEachEdge((edgeId, _attrs, source, target) => {
    const srcNeighbors = neighborMap.get(source)
    const tgtNeighbors = neighborMap.get(target)
    if (srcNeighbors) srcNeighbors.add(target)
    if (tgtNeighbors) tgtNeighbors.add(source)

    const srcEdges = incidentEdgesMap.get(source)
    const tgtEdges = incidentEdgesMap.get(target)
    if (srcEdges) srcEdges.add(edgeId)
    if (tgtEdges) tgtEdges.add(edgeId)
  })

  return { neighborMap, incidentEdgesMap }
}

export function computeSnapshotSignature(snapshot: MindGraphSnapshot): string {
  const nodeIds = snapshot.nodes.map(n => n.id).sort().join(',')
  const edgeSigs = snapshot.edges
    .map(e => `${e.sourceNodeId}->${e.targetNodeId}:${e.edgeType}`)
    .sort()
    .join(',')
  return `${snapshot.generatedAt}|${nodeIds}|${edgeSigs}`
}
