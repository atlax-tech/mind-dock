import type { MindNodeType, MindEdgeType, MindNodeState } from '@atlax/domain'

export interface MindGraphSnapshotNode {
  id: string
  nodeType: MindNodeType
  label: string
  documentId: number | null
  state: MindNodeState
  degreeScore: number
  recentActivityScore: number
  documentWeightScore: number
  userPinScore: number
  clusterCenterScore: number
  positionX: number | null
  positionY: number | null
  metadata: Record<string, unknown> | null
}

export interface MindGraphSnapshotEdge {
  id: string
  sourceNodeId: string
  targetNodeId: string
  edgeType: MindEdgeType
  strength: number
  source: 'user' | 'system' | 'import'
  confidence: number | null
  reason: string | null
}

export interface MindGraphSnapshot {
  nodes: MindGraphSnapshotNode[]
  edges: MindGraphSnapshotEdge[]
  rootNodeId: string | null
  generatedAt: number
}
