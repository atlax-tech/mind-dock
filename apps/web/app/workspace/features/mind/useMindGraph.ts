'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  listMindNodes,
  listMindEdges,
  updateMindNodePosition,
  upsertMindEdge,
  upsertMindNode,
  deleteMindEdge,
  forceDeleteBaselineEdge,
  getMindEdge,
  recordUserBehaviorEvent,
  type StoredMindNode,
  type StoredMindEdge,
} from '@/lib/repository'
import { subscribe, emit } from '@/lib/events'
import { makeMindEdgeId } from '@atlax/domain'
import { buildSimpleMindGraphSnapshot } from './mindSnapshotBuilder'
import type { MindGraphSnapshot } from './types'

const REFRESH_EVENTS = [
  'mind_node_created',
  'mind_node_updated',
  'mind_node_deleted',
  'mind_edge_created',
  'mind_edge_updated',
  'mind_edge_deleted',
  'tip_created',
  'tip_converted',
  'archive_completed',
] as const

export async function ensureRootNode(userId: string, nodes: StoredMindNode[]): Promise<string | null> {
  const existing = nodes.find(n => n.nodeType === 'root')
  if (existing) return existing.id

  const created = await upsertMindNode({
    userId,
    nodeType: 'root',
    label: 'Root',
    state: 'anchored',
    positionX: 0,
    positionY: 0,
  })
  return created.id
}

export async function ensureBaselineParentConnections(
  userId: string,
  nodes: StoredMindNode[],
  edges: StoredMindEdge[],
): Promise<StoredMindEdge[]> {
  const rootNode = nodes.find(n => n.nodeType === 'root')
  if (!rootNode) return []

  const realParentTargets = new Set<string>()
  edges.forEach(e => {
    if (e.edgeType === 'parent_child' && e.reason !== 'baseline-auto-connect') {
      realParentTargets.add(e.targetNodeId)
    }
  })

  const baselineEdgesToRemove: string[] = []
  const baselineParentTargets = new Set<string>()
  edges.forEach(e => {
    if (e.edgeType === 'parent_child' && e.reason === 'baseline-auto-connect') {
      baselineParentTargets.add(e.targetNodeId)
      if (realParentTargets.has(e.targetNodeId)) {
        baselineEdgesToRemove.push(e.id)
      }
    }
  })

  for (const edgeId of baselineEdgesToRemove) {
    await forceDeleteBaselineEdge(userId, edgeId)
  }

  const effectiveBaselineTargets = new Set<string>(
    Array.from(baselineParentTargets).filter(id => !realParentTargets.has(id))
  )

  const orphanDocNodes = nodes.filter(n =>
    n.nodeType === 'document' && !realParentTargets.has(n.id) && !effectiveBaselineTargets.has(n.id)
  )

  const created: StoredMindEdge[] = []
  for (const orphan of orphanDocNodes) {
    const edge = await upsertMindEdge({
      userId,
      sourceNodeId: rootNode.id,
      targetNodeId: orphan.id,
      edgeType: 'parent_child',
      strength: 0.3,
      source: 'system',
      confidence: 0.5,
      reason: 'baseline-auto-connect',
    })
    if (edge) created.push(edge)
  }
  return created
}

export function useMindGraph(userId: string) {
  const [nodes, setNodes] = useState<StoredMindNode[]>([])
  const [edges, setEdges] = useState<StoredMindEdge[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const positionSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())

  const refresh = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const [mindNodes] = await Promise.all([
        listMindNodes(userId),
        listMindEdges(userId),
      ])

      await ensureRootNode(userId, mindNodes)

      const [updatedNodes, updatedEdges] = await Promise.all([
        listMindNodes(userId),
        listMindEdges(userId),
      ])

      await ensureBaselineParentConnections(userId, updatedNodes, updatedEdges)

      const finalEdges = await listMindEdges(userId)

      setNodes(updatedNodes)
      setEdges(finalEdges)
    } catch {
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh, refreshKey])

  useEffect(() => {
    const unsub = subscribe((event) => {
      if (REFRESH_EVENTS.includes(event.type as typeof REFRESH_EVENTS[number])) {
        setRefreshKey((k) => k + 1)
      }
    })
    return unsub
  }, [])

  const snapshot: MindGraphSnapshot = useMemo(() => {
    return buildSimpleMindGraphSnapshot(nodes, edges)
  }, [nodes, edges])

  const isEmpty = nodes.length === 0

  const handleNodeDragEnd = useCallback((nodeId: string, x: number, y: number) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, positionX: x, positionY: y } : n)),
    )

    pendingPositionsRef.current.set(nodeId, { x, y })

    if (positionSaveTimerRef.current) {
      clearTimeout(positionSaveTimerRef.current)
    }

    positionSaveTimerRef.current = setTimeout(async () => {
      const pending = new Map(pendingPositionsRef.current)
      pendingPositionsRef.current.clear()
      positionSaveTimerRef.current = null

      const entries = Array.from(pending.entries())
      for (const [nid, pos] of entries) {
        const result = await updateMindNodePosition(userId, nid, pos.x, pos.y)
        if (result) {
          emit({ type: 'mind_node_updated', nodeId: nid })
        }
      }
    }, 500)
  }, [userId])

  const forceRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  const handleDeleteEdge = useCallback(async (edgeId: string) => {
    const edge = edges.find(e => e.id === edgeId)
    if (!edge) return false
    if (edge.reason === 'baseline-auto-connect') return false

    const wasParentChild = edge.edgeType === 'parent_child'
    const targetNodeId = edge.targetNodeId

    setEdges((prev) => prev.filter((e) => e.id !== edgeId))
    await deleteMindEdge(userId, edgeId)
    emit({ type: 'mind_edge_deleted', edgeId })

    await recordUserBehaviorEvent({
      userId,
      eventType: 'mind_edge_deleted',
      subjectType: 'mindNode',
      subjectId: edgeId,
      metadata: { edgeType: edge.edgeType, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId },
    }).catch(() => {})

    if (wasParentChild) {
      const targetNode = nodes.find(n => n.id === targetNodeId)
      if (targetNode && targetNode.nodeType === 'document') {
        const remainingEdges = edges.filter(e => e.id !== edgeId)
        const hasRealParent = remainingEdges.some(e =>
          e.edgeType === 'parent_child' &&
          e.targetNodeId === targetNodeId &&
          e.reason !== 'baseline-auto-connect'
        )
        if (!hasRealParent) {
          const rootNode = nodes.find(n => n.nodeType === 'root')
          if (rootNode) {
            const baselineEdge = await upsertMindEdge({
              userId,
              sourceNodeId: rootNode.id,
              targetNodeId,
              edgeType: 'parent_child',
              strength: 0.3,
              source: 'system',
              confidence: 0.5,
              reason: 'baseline-auto-connect',
            })
            if (baselineEdge) {
              setEdges(prev => [...prev, baselineEdge])
              emit({ type: 'mind_edge_created', edgeId: baselineEdge.id })
            }
          }
        }
      }
    }

    return true
  }, [userId, edges, nodes])

  const handleCreateEdge = useCallback(async (sourceNodeId: string, targetNodeId: string): Promise<{ success: boolean; error?: string }> => {
    if (sourceNodeId === targetNodeId) {
      return { success: false, error: '不能连接到自身' }
    }

    const sourceNode = nodes.find(n => n.id === sourceNodeId)
    const targetNode = nodes.find(n => n.id === targetNodeId)
    if (!sourceNode || !targetNode) {
      return { success: false, error: '目标节点不存在' }
    }

    const PARENT_TYPES = ['root', 'domain', 'project', 'topic']
    const sourceIsParent = PARENT_TYPES.includes(sourceNode.nodeType)
    const targetIsParent = PARENT_TYPES.includes(targetNode.nodeType)
    const edgeType = (sourceIsParent || targetIsParent) ? 'parent_child' : 'semantic'

    let normalizedSource = sourceNodeId
    let normalizedTarget = targetNodeId
    if (edgeType === 'parent_child') {
      if (targetIsParent && !sourceIsParent) {
        normalizedSource = targetNodeId
        normalizedTarget = sourceNodeId
      }
    }

    const existingId = makeMindEdgeId(userId, normalizedSource, normalizedTarget, edgeType)
    const existingEdge = await getMindEdge(userId, existingId)
    if (existingEdge) {
      return { success: false, error: '连接已存在' }
    }

    const reverseId = makeMindEdgeId(userId, normalizedTarget, normalizedSource, edgeType)
    const reverseEdge = await getMindEdge(userId, reverseId)
    if (reverseEdge) {
      return { success: false, error: '反向连接已存在' }
    }

    if (edgeType === 'parent_child') {
      const childId = normalizedTarget
      const existingParentEdges = edges.filter(e =>
        e.edgeType === 'parent_child' && e.targetNodeId === childId
      )
      for (const oldEdge of existingParentEdges) {
        if (oldEdge.reason === 'baseline-auto-connect') {
          await forceDeleteBaselineEdge(userId, oldEdge.id)
          setEdges(prev => prev.filter(e => e.id !== oldEdge.id))
        } else {
          await deleteMindEdge(userId, oldEdge.id)
          setEdges(prev => prev.filter(e => e.id !== oldEdge.id))
          emit({ type: 'mind_edge_deleted', edgeId: oldEdge.id })
        }
      }
    }

    const strength = edgeType === 'parent_child' ? 0.8 : 0.5
    const reason = edgeType === 'parent_child' ? 'user-parent-link' : null

    const created = await upsertMindEdge({
      userId,
      sourceNodeId: normalizedSource,
      targetNodeId: normalizedTarget,
      edgeType,
      strength,
      source: 'user',
      confidence: null,
      reason,
    })

    if (!created) {
      return { success: false, error: '创建连接失败' }
    }

    setEdges((prev) => [...prev, created])
    emit({ type: 'mind_edge_created', edgeId: created.id })

    await recordUserBehaviorEvent({
      userId,
      eventType: 'mind_edge_created',
      subjectType: 'mindNode',
      subjectId: created.id,
      metadata: { sourceNodeId: normalizedSource, targetNodeId: normalizedTarget, edgeType: created.edgeType },
    }).catch(() => {})

    return { success: true }
  }, [userId, nodes, edges])

  return {
    nodes,
    edges,
    snapshot,
    loading,
    isEmpty,
    refresh: forceRefresh,
    onNodeDragEnd: handleNodeDragEnd,
    onDeleteEdge: handleDeleteEdge,
    onCreateEdge: handleCreateEdge,
  }
}
