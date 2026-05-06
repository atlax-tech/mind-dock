import {
  forceSimulation,
  forceManyBody,
  forceCollide,
  forceLink,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from 'd3-force'
import type { BrainNode, BrainEdge } from './types'

interface ForceNode extends SimulationNodeDatum {
  id: string
  type: string
}

export interface WarmupConfig {
  ticks: number
  alphaDecay: number
  velocityDecay: number
  manyBodyStrengthDoc: number
  manyBodyStrengthTag: number
  manyBodyStrengthOrphan: number
  collideRadiusDoc: number
  collideRadiusTag: number
  collideRadiusOrphan: number
  forceXStrengthDoc: number
  forceXStrengthTag: number
  forceYStrengthDoc: number
  forceYStrengthTag: number
  linkDistanceTag: number
  linkDistanceDoc: number
  linkStrengthTag: number
  linkStrengthDoc: number
}

const DEFAULT_WARMUP_CONFIG: WarmupConfig = {
  ticks: 300,
  alphaDecay: 0.02,
  velocityDecay: 0.42,
  manyBodyStrengthDoc: -22,
  manyBodyStrengthTag: -4,
  manyBodyStrengthOrphan: -8,
  collideRadiusDoc: 8,
  collideRadiusTag: 4,
  collideRadiusOrphan: 4,
  forceXStrengthDoc: 0.04,
  forceXStrengthTag: 0.12,
  forceYStrengthDoc: 0.04,
  forceYStrengthTag: 0.12,
  linkDistanceTag: 18,
  linkDistanceDoc: 130,
  linkStrengthTag: 0.12,
  linkStrengthDoc: 0.018,
}

export function runForceWarmup(
  nodes: Map<string, BrainNode>,
  edges: Map<string, BrainEdge>,
  canvasWidth: number,
  canvasHeight: number,
  config: Partial<WarmupConfig> = {},
): void {
  const cfg = { ...DEFAULT_WARMUP_CONFIG, ...config }

  const forceNodes: ForceNode[] = []
  const nodeMap = new Map<string, ForceNode>()

  nodes.forEach((node) => {
    const fn: ForceNode = {
      id: node.id,
      x: node.targetX * canvasWidth,
      y: node.targetY * canvasHeight,
      type: node.type,
    }
    forceNodes.push(fn)
    nodeMap.set(node.id, fn)
  })

  const forceLinks: Array<{ source: string; target: string; type: string }> = []
  edges.forEach((e) => {
    const srcType = nodes.get(e.source)?.type
    const tgtType = nodes.get(e.target)?.type
    let type = 'weak-link'
    if ((srcType === 'tag' || tgtType === 'tag') && (srcType === 'document' || tgtType === 'document')) {
      type = 'tag-link'
    } else if (srcType === 'document' && tgtType === 'document') {
      type = 'doc-link'
    }
    forceLinks.push({ source: e.source, target: e.target, type })
  })

  const sim = forceSimulation<ForceNode>(forceNodes)
    .alpha(1)
    .alphaDecay(cfg.alphaDecay)
    .velocityDecay(cfg.velocityDecay)
    .force(
      'link',
      forceLink<ForceNode, { source: string; target: string; type: string }>(forceLinks)
        .id((d: ForceNode) => d.id)
        .distance((d: { type: string }) => {
          return d.type === 'tag-link' ? cfg.linkDistanceTag : cfg.linkDistanceDoc
        })
        .strength((d: { type: string }) => {
          return d.type === 'tag-link' ? cfg.linkStrengthTag : cfg.linkStrengthDoc
        }),
    )
    .force(
      'charge',
      forceManyBody<ForceNode>().strength((d: ForceNode) => {
        if (d.type === 'document') return cfg.manyBodyStrengthDoc
        if (d.type === 'tag') return cfg.manyBodyStrengthTag
        return cfg.manyBodyStrengthOrphan
      }),
    )
    .force(
      'collide',
      forceCollide<ForceNode>().radius((d: ForceNode) => {
        const node = nodes.get(d.id)
        if (!node) return 4
        if (node.type === 'document') return node.baseRadius + cfg.collideRadiusDoc
        return node.baseRadius + cfg.collideRadiusTag
      }),
    )
    .force(
      'x',
      forceX<ForceNode>((d: ForceNode) => {
        const n = nodes.get(d.id)
        return n ? n.targetX * canvasWidth : canvasWidth / 2
      }).strength((d: ForceNode) => {
        if (d.type === 'document') return cfg.forceXStrengthDoc
        return cfg.forceXStrengthTag
      }),
    )
    .force(
      'y',
      forceY<ForceNode>((d: ForceNode) => {
        const n = nodes.get(d.id)
        return n ? n.targetY * canvasHeight : canvasHeight / 2
      }).strength((d: ForceNode) => {
        if (d.type === 'document') return cfg.forceYStrengthDoc
        return cfg.forceYStrengthTag
      }),
    )
    .stop()

  for (let i = 0; i < cfg.ticks; i++) {
    sim.tick()
  }

  for (const fn of forceNodes) {
    const node = nodes.get(fn.id)
    if (node) {
      const fx = fn.x ?? node.targetX * canvasWidth
      const fy = fn.y ?? node.targetY * canvasHeight
      node.targetX = Math.max(0.01, Math.min(0.99, fx / canvasWidth))
      node.targetY = Math.max(0.01, Math.min(0.99, fy / canvasHeight))
      node.currentX = node.targetX
      node.currentY = node.targetY
    }
  }
}
