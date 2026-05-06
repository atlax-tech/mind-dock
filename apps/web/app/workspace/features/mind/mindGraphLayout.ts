import Graph from 'graphology'
// import forceAtlas2 from 'graphology-layout-forceatlas2'
import noverlap from 'graphology-layout-noverlap'
import type { GraphNodeAttributes } from './mindGraphAdapter'

const FA2_SETTINGS = {
  iterations: 80,
  settings: {
    // Light gravity
    gravity: 0.05,
    scalingRatio: 2.0,
    strongGravityMode: false,
    slowDown: 5,
    barnesHutOptimize: true,
    barnesHutTheta: 0.8,
    // CRITICAL: Reduce edge pull so nodes stay in their assigned clusters rather than being yanked to the center
    edgeWeightInfluence: 0.1,
    outboundAttractionDistribution: true, 
    linLogMode: true, 
    adjustSizes: true,
  },
}

const NOVERLAP_SETTINGS = {
  maxIterations: 80,
  settings: {
    ratio: 1.0,
    margin: 5,
  },
}

export interface LayoutProgress {
  phase: 'idle' | 'forceatlas2' | 'noverlap' | 'done'
  iterations: number
  maxIterations: number
}

export function hasEnoughPositions(graph: Graph<GraphNodeAttributes>, threshold: number = 0.8): boolean {
  let count = 0
  graph.forEachNode((_nodeId, attrs) => {
    if (attrs.originalX != null && attrs.originalY != null) count++
  })
  return graph.order > 0 && count >= graph.order * threshold
}

function applySavedPositions(graph: Graph<GraphNodeAttributes>): void {
  graph.forEachNode((nodeId, attrs) => {
    if (attrs.originalX != null && attrs.originalY != null) {
      graph.setNodeAttribute(nodeId, 'x', attrs.originalX)
      graph.setNodeAttribute(nodeId, 'y', attrs.originalY)
    }
  })
}

export function applyForceAtlas2Layout(
  graph: Graph<GraphNodeAttributes>,
  onProgress?: (progress: LayoutProgress) => void,
): void {
  if (graph.order === 0) {
    onProgress?.({ phase: 'done', iterations: 0, maxIterations: 0 })
    return
  }

  // Always apply saved positions as starting point if available, but DO NOT skip FA2
  applySavedPositions(graph)

  onProgress?.({ phase: 'forceatlas2', iterations: 0, maxIterations: 0 })
  // MG-FIX-02: Disable ForceAtlas2 completely to prevent physics explosions.
  // FA2's global gravity and spring forces conflict with the rigid multi-cluster initial placement,
  // causing nodes to shoot to infinity. We now rely purely on the seeded multi-cluster positions + noverlap.
  // forceAtlas2.assign(graph, { iterations: FA2_SETTINGS.iterations, settings: { ...FA2_SETTINGS.settings } })
  onProgress?.({ phase: 'forceatlas2', iterations: 0, maxIterations: 0 })

  if (graph.order > 1) {
    onProgress?.({ phase: 'noverlap', iterations: 0, maxIterations: NOVERLAP_SETTINGS.maxIterations })
    noverlap.assign(graph, {
      maxIterations: NOVERLAP_SETTINGS.maxIterations,
      settings: { ...NOVERLAP_SETTINGS.settings },
    })
    onProgress?.({ phase: 'noverlap', iterations: NOVERLAP_SETTINGS.maxIterations, maxIterations: NOVERLAP_SETTINGS.maxIterations })
  }

  onProgress?.({ phase: 'done', iterations: FA2_SETTINGS.iterations, maxIterations: FA2_SETTINGS.iterations })
}

export interface GraphBounds {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export function computeVisibleBounds(graph: Graph<GraphNodeAttributes>): GraphBounds {
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity
  graph.forEachNode((_nodeId, attrs) => {
    if (attrs.hidden) return
    const x = (attrs.x ?? 0) as number
    const y = (attrs.y ?? 0) as number
    if (x < xMin) xMin = x
    if (x > xMax) xMax = x
    if (y < yMin) yMin = y
    if (y > yMax) yMax = y
  })
  if (!isFinite(xMin)) return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 }
  return { xMin, xMax, yMin, yMax }
}

export function extractNodePositions(graph: Graph<GraphNodeAttributes>): Array<{
  nodeId: string
  positionX: number
  positionY: number
}> {
  const updates: Array<{ nodeId: string; positionX: number; positionY: number }> = []
  graph.forEachNode((nodeId) => {
    const x = graph.getNodeAttribute(nodeId, 'x') as number
    const y = graph.getNodeAttribute(nodeId, 'y') as number
    if (Number.isFinite(x) && Number.isFinite(y)) {
      updates.push({
        nodeId,
        positionX: Math.round(x * 100) / 100,
        positionY: Math.round(y * 100) / 100,
      })
    }
  })
  return updates
}
