export const SEED = 20260106

export type BrainNodeType = 'document' | 'tag' | 'orphan'
export type BrainEdgeType = 'doc-link' | 'tag-link' | 'dense-link'
export type BrainLayer = 'core' | 'branch' | 'outer' | 'orphan'

export interface BrainNode {
  id: string
  type: BrainNodeType
  label: string
  documentId?: number | null
  rawType?: string
  cluster: string
  degree?: number
  importance: number
  parentId: string | null
  layoutLayer?: BrainLayer
  layoutX?: number
  layoutY?: number
  layoutZ?: number
  targetX: number
  targetY: number
  z: number
  phase: number
  amplitude: number
  speed: number
  currentX: number
  currentY: number
  currentZ: number
  x?: number
  y?: number
  vx: number
  vy: number
  vz?: number
  fx?: number
  fy?: number
  fz?: number
  baseRadius: number
  currentRadius: number
  currentOpacity: number
  targetOpacity: number
  entranceDelay: number
  neighbors: Set<string>
  incidentEdges: Set<string>
}

export interface BrainEdge {
  id: string
  source: string
  target: string
  type?: BrainEdgeType
  rawType?: string
  strength?: number
  confidence?: number | null
  currentOpacity: number
  targetOpacity: number
}

export interface ClusterAnchor {
  name: string
  x: number
  y: number
  weight: number
}

export interface TooltipData {
  id: string
  type: string
  label: string
  x: number
  y: number
}
