import type { BrainNode } from './types'

export interface BarrelMotionState {
  time: number
  centerX: number
  centerY: number
  rotation: number
}

export const BARREL_CONFIG = {
  rotationSpeed: 0.00003,
  barrelScaleX: 0.006,
  barrelScaleTime: 0.0003,
  barrelDepthMax: 12,
  radiusScaleMin: 0.82,
  opacityScaleMin: 0.65,
}

export const ENTRANCE_CONFIG = {
  duration: 1800,
  centerStartRadius: 0.08,
}

export const SPRING_CONFIG = {
  stiffness: 0.035,
  damping: 0.82,
  neighborPull: 0.008,
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function updateBarrelMotion(
  state: BarrelMotionState,
  deltaTime: number,
): BarrelMotionState {
  return {
    ...state,
    time: state.time + deltaTime,
    rotation: state.rotation + BARREL_CONFIG.rotationSpeed * deltaTime,
  }
}

export function computeBarrelDepth(
  node: BrainNode,
  state: BarrelMotionState,
  canvasWidth: number,
  canvasHeight: number,
): number {
  const cx = state.centerX * canvasWidth
  const cy = state.centerY * canvasHeight
  const angle = state.rotation

  const dx = node.targetX * canvasWidth - cx
  const dy = node.targetY * canvasHeight - cy
  const rotatedX = dx * Math.cos(angle) - dy * Math.sin(angle)

  return Math.sin(rotatedX * BARREL_CONFIG.barrelScaleX + state.time * BARREL_CONFIG.barrelScaleTime) * BARREL_CONFIG.barrelDepthMax
}

export function applyBarrelTransform(
  node: BrainNode,
  barrelDepth: number,
  canvasWidth: number,
  canvasHeight: number,
): { screenX: number; screenY: number; radius: number; opacity: number } {
  const depthFactor = (barrelDepth + BARREL_CONFIG.barrelDepthMax) / (2 * BARREL_CONFIG.barrelDepthMax)
  const radiusScale = BARREL_CONFIG.radiusScaleMin + (1 - BARREL_CONFIG.radiusScaleMin) * depthFactor
  const opacityScale = BARREL_CONFIG.opacityScaleMin + (1 - BARREL_CONFIG.opacityScaleMin) * depthFactor

  return {
    screenX: node.currentX * canvasWidth + barrelDepth * 0.3,
    screenY: node.currentY * canvasHeight,
    radius: node.currentRadius * radiusScale,
    opacity: node.currentOpacity * opacityScale,
  }
}

export function computeEntranceProgress(
  node: BrainNode,
  elapsed: number,
): { progress: number; shouldRender: boolean } {
  const delay = node.entranceDelay || 0
  const duration = ENTRANCE_CONFIG.duration
  const localTime = elapsed - delay

  if (localTime < 0) {
    return { progress: 0, shouldRender: false }
  }

  const progress = clamp(localTime / duration, 0, 1)
  return {
    progress: easeOutCubic(progress),
    shouldRender: true,
  }
}

export function getEntranceStartPosition(
  node: BrainNode,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  const cx = 0.54 * canvasWidth
  const cy = 0.52 * canvasHeight

  const dx = node.targetX * canvasWidth - cx
  const dy = node.targetY * canvasHeight - cy
  const dist = Math.sqrt(dx * dx + dy * dy)

  const startRadius = ENTRANCE_CONFIG.centerStartRadius * Math.min(canvasWidth, canvasHeight)
  if (dist < 0.001) {
    return { x: cx + startRadius, y: cy }
  }
  const ratio = startRadius / dist
  return {
    x: cx + dx * ratio,
    y: cy + dy * ratio,
  }
}

export function computeNodePosition(
  node: BrainNode,
  progress: number,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  const start = getEntranceStartPosition(node, canvasWidth, canvasHeight)
  const targetX = node.targetX * canvasWidth
  const targetY = node.targetY * canvasHeight

  return {
    x: lerp(start.x, targetX, progress),
    y: lerp(start.y, targetY, progress),
  }
}

export function springNode(
  node: BrainNode,
  targetX: number,
  targetY: number,
  stiffness: number,
  damping: number,
): void {
  node.vx += (targetX - node.currentX) * stiffness
  node.vy += (targetY - node.currentY) * stiffness
  node.vx *= damping
  node.vy *= damping
  node.currentX += node.vx
  node.currentY += node.vy
}

export function computeLinkAlpha(
  source: BrainNode,
  target: BrainNode,
  elapsed: number,
  baseAlpha: number,
): number {
  const sProgress = clamp((elapsed - (source.entranceDelay || 0)) / ENTRANCE_CONFIG.duration, 0, 1)
  const tProgress = clamp((elapsed - (target.entranceDelay || 0)) / ENTRANCE_CONFIG.duration, 0, 1)
  const avg = (sProgress + tProgress) / 2
  const fadeIn = Math.max(0, (avg - 0.25) / 0.75)
  return baseAlpha * fadeIn
}

export const COLORS = {
  background: '#141515',
  document: 'rgba(141,150,184,0.86)',
  tag: 'rgba(168,245,173,0.92)',
  orphan: 'rgba(85,96,112,0.35)',
  edgeDoc: 'rgba(48,56,74,0.16)',
  edgeTag: 'rgba(47,63,78,0.24)',
  edgeDense: 'rgba(41,50,65,0.14)',
  hover: 'rgba(124,58,237,0.95)',
  hoverEdge: 'rgba(124,58,237,0.78)',
  hoverNeighbor: 'rgba(124,58,237,0.45)',
  searchHit: 'rgba(214,168,58,0.95)',
}

export function getNodeColor(type: string): string {
  switch (type) {
    case 'document':
      return COLORS.document
    case 'tag':
      return COLORS.tag
    case 'orphan':
      return COLORS.orphan
    default:
      return COLORS.document
  }
}

export function getEdgeColor(edgeId: string, nodes: Map<string, BrainNode>): string {
  const edgeParts = edgeId.split('-')
  if (edgeParts.length < 2) return COLORS.edgeDense
  const src = nodes.get(edgeParts[0])
  const tgt = nodes.get(edgeParts[1])
  if (!src || !tgt) return COLORS.edgeDense

  const hasTag = src.type === 'tag' || tgt.type === 'tag'
  const hasDoc = src.type === 'document' || tgt.type === 'document'

  if (hasTag && hasDoc) return COLORS.edgeTag
  if (hasDoc && !hasTag) return COLORS.edgeDoc
  return COLORS.edgeDense
}
