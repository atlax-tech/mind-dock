'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  listMindNodes,
  listMindEdges,
  updateMindNodePosition,
  upsertMindEdge,
  upsertMindNode,
  deleteMindEdge,
  getMindEdge,
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

  const structuralEdgeTargets = new Set<string>()
  edges.forEach(e => {
    if (e.edgeType === 'parent_child') {
      structuralEdgeTargets.add(e.targetNodeId)
    }
  })

  const orphanDocNodes = nodes.filter(n =>
    n.nodeType === 'document' && !structuralEdgeTargets.has(n.id)
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
    created.push(edge)
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

      const baselineEdges = await ensureBaselineParentConnections(userId, updatedNodes, updatedEdges)

      setNodes(updatedNodes)
      setEdges([...updatedEdges, ...baselineEdges])
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
    if (edge && edge.reason === 'baseline-auto-connect') {
      return false
    }
    setEdges((prev) => prev.filter((e) => e.id !== edgeId))
    await deleteMindEdge(userId, edgeId)
    emit({ type: 'mind_edge_deleted', edgeId })
    return true
  }, [userId, edges])

  const handleCreateEdge = useCallback(async (sourceNodeId: string, targetNodeId: string): Promise<{ success: boolean; error?: string }> => {
    if (sourceNodeId === targetNodeId) {
      return { success: false, error: '不能连接到自身' }
    }

    const sourceExists = nodes.some(n => n.id === sourceNodeId)
    const targetExists = nodes.some(n => n.id === targetNodeId)
    if (!sourceExists || !targetExists) {
      return { success: false, error: '目标节点不存在' }
    }

    const edgeType = 'semantic'
    const existingId = makeMindEdgeId(userId, sourceNodeId, targetNodeId, edgeType)
    const existingEdge = await getMindEdge(userId, existingId)
    if (existingEdge) {
      return { success: false, error: '连接已存在' }
    }

    const reverseId = makeMindEdgeId(userId, targetNodeId, sourceNodeId, edgeType)
    const reverseEdge = await getMindEdge(userId, reverseId)
    if (reverseEdge) {
      return { success: false, error: '反向连接已存在' }
    }

    const created = await upsertMindEdge({
      userId,
      sourceNodeId,
      targetNodeId,
      edgeType,
      strength: 0.5,
      source: 'user',
      confidence: null,
      reason: null,
    })

    setEdges((prev) => [...prev, created])
    emit({ type: 'mind_edge_created', edgeId: created.id })
    return { success: true }
  }, [userId, nodes])

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
