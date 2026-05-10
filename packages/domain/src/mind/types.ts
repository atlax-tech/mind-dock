export type MindNodeType =
  | 'root'
  | 'domain'
  | 'project'
  | 'topic'
  | 'document'
  | 'fragment'
  | 'source'
  | 'tag'
  | 'question'
  | 'insight'
  | 'time'

export type MindNodeState =
  | 'drifting'
  | 'suggested'
  | 'anchored'
  | 'archived'
  | 'dormant'
  | 'active'
  | 'conflicted'
  | 'isolated'

export interface MindNode {
  id: string
  userId: string
  nodeType: MindNodeType
  label: string
  state: MindNodeState
  documentId: number | null
  degreeScore: number
  recentActivityScore: number
  documentWeightScore: number
  userPinScore: number
  clusterCenterScore: number
  positionX: number | null
  positionY: number | null
  metadata: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}

export type MindEdgeType =
  | 'parent_child'
  | 'semantic'
  | 'reference'
  | 'source'
  | 'temporal'
  | 'confirmed'
  | 'suggested'
  | 'conflict'

export interface MindEdge {
  id: string
  userId: string
  sourceNodeId: string
  targetNodeId: string
  edgeType: MindEdgeType
  strength: number
  source: 'user' | 'system' | 'import'
  confidence: number | null
  reason: string | null
  createdAt: Date
  updatedAt: Date
}

export function makeMindNodeId(userId: string, nodeType: MindNodeType, label: string, documentId?: number | null): string {
  const normalized = label.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 40)
  if (nodeType === 'document' && documentId != null) {
    return `${userId}_mn_${nodeType}_${normalized}_${documentId}`
  }
  return `${userId}_mn_${nodeType}_${normalized}`
}

export function makeMindEdgeId(
  userId: string,
  sourceNodeId: string,
  targetNodeId: string,
  edgeType: MindEdgeType,
): string {
  return `${userId}_me_${sourceNodeId}_${targetNodeId}_${edgeType}`
}
