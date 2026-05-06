import Graph from 'graphology'
import type { MindGraphSnapshot } from './types'
import type { MindNodeType, MindEdgeType } from '@atlax/domain'
import { getNodeColor, getNodeBaseSize, getNodeLabelSize, getEdgeStyle, computeVisualWeight, visualWeightToSize, shouldShowLabel, computeEdgeWidth } from './mindGraphStyle'

export interface GraphNodeAttributes {
  nodeType: MindNodeType
  label: string
  originalLabel: string
  documentId: number | null
  color: string
  baseSize: number
  size: number
  labelSize: number
  visualWeight: number
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

// Scale down centers massively. ForceAtlas2 expects initial positions to be tight.
// Large initial distances cause massive spring forces leading to physics explosions (nodes flying to infinity).
const CLUSTER_CENTERS = [
  { x: 0, y: 0 },         // 0: Root
  { x: 400, y: 400 },   // 1: Top-Right
  { x: -400, y: 400 },  // 2: Top-Left
  { x: 400, y: -400 },  // 3: Bottom-Right
  { x: -400, y: -400 }, // 4: Bottom-Left
  { x: 600, y: 0 },      // 5: Far Right
  { x: -600, y: 0 },     // 6: Far Left
  { x: 0, y: 600 },      // 7: Far Top
  { x: 0, y: -600 },     // 8: Far Bottom
]

function getClusterIndex(nodeType: string, id: string): number {
  if (nodeType === 'root') return 0
  
  // Base index from type
  let baseIdx = 1
  if (['document', 'source', 'fragment'].includes(nodeType)) baseIdx = 1
  else if (['concept', 'entity', 'person', 'organization', 'location'].includes(nodeType)) baseIdx = 2
  else if (['tag', 'category'].includes(nodeType)) baseIdx = 3
  else baseIdx = 4

  const hash = stableHashStr(id)
  // Combine type and hash to ensure at least 2 clusters even for same type
  // We use 8 outer centers. Shift baseIdx based on hash bits
  const offset = Math.floor(hash * 4) // 0-3
  let finalIdx = baseIdx + offset
  if (finalIdx > 8) finalIdx = 1 + (finalIdx % 8)
  
  return finalIdx
}

function seededPosition(id: string, nodeType: string, idx: number, totalCount: number): { x: number; y: number } {
  if (totalCount <= 0) return { x: 0, y: 0 }
  
  const clusterIdx = getClusterIndex(nodeType, id)
  const center = CLUSTER_CENTERS[clusterIdx] || CLUSTER_CENTERS[0]
  
  const hash = stableHashStr(id)
  // Random angle and moderate radius within cluster
  const angle = (hash * Math.PI * 2)
  const radius = 50 + (idx % 10) * 10 + hash * 100
  
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  }
}

export function snapshotToGraphology(snapshot: MindGraphSnapshot): MindGraphState {
  const graph = new Graph<GraphNodeAttributes, GraphEdgeAttributes>({ multi: false })
  const totalNodes = snapshot.nodes.length

  // MG-FIX-02: Force re-calculate by ignoring saved positions for now
  // to break free from the old ROOT sunburst layout
  const FORCE_RECALCULATE = true

  snapshot.nodes.forEach((n, idx) => {
    const color = getNodeColor(n.nodeType)
    const typeBaseSize = getNodeBaseSize(n.nodeType)
    const labelSize = getNodeLabelSize(n.nodeType)

    const visualWeight = computeVisualWeight(
      n.nodeType,
      n.degreeScore,
      n.clusterCenterScore,
      n.documentWeightScore,
      n.userPinScore,
      n.recentActivityScore,
    )
    const baseSize = visualWeightToSize(visualWeight, typeBaseSize)
    const showLabel = shouldShowLabel(visualWeight)

    const hasPos = !FORCE_RECALCULATE && n.positionX != null && n.positionY != null
    const seeded = !hasPos ? seededPosition(n.id, n.nodeType, idx, Math.max(totalNodes, 1)) : null

    graph.addNode(n.id, {
      nodeType: n.nodeType as MindNodeType,
      label: showLabel ? n.label : '',
      originalLabel: n.label,
      documentId: n.documentId,
      color,
      baseSize,
      size: baseSize,
      labelSize,
      visualWeight,
      degreeScore: n.degreeScore,
      recentActivityScore: n.recentActivityScore,
      confidence: null,
      reason: null,
      documentWeightScore: n.documentWeightScore,
      userPinScore: n.userPinScore,
      clusterCenterScore: n.clusterCenterScore,
      originalX: hasPos ? n.positionX : null,
      originalY: hasPos ? n.positionY : null,
      x: (hasPos ? n.positionX : seeded?.x) ?? 0,
      y: (hasPos ? n.positionY : seeded?.y) ?? 0,
    })
  })

  snapshot.edges.forEach(e => {
    if (!graph.hasNode(e.sourceNodeId) || !graph.hasNode(e.targetNodeId)) return
    if (e.sourceNodeId === e.targetNodeId) return
    if (graph.hasEdge(e.sourceNodeId, e.targetNodeId)) return

    const style = getEdgeStyle(e.edgeType)
    const baseWidth = computeEdgeWidth(e.edgeType, e.strength)

    graph.addEdge(e.sourceNodeId, e.targetNodeId, {
      edgeType: e.edgeType as MindEdgeType,
      strength: e.strength,
      confidence: e.confidence,
      reason: e.reason,
      color: style.color,
      baseWidth,
      size: baseWidth,
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
