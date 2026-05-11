'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  listMindNodes,
  listMindEdges,
  updateMindNodePosition,
  upsertMindEdge,
  upsertMindNode,
  deleteMindEdge,
  type StoredMindNode,
  type StoredMindEdge,
} from '@/lib/repository'
import { subscribe, emit } from '@/lib/events'
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
    setEdges((prev) => prev.filter((e) => e.id !== edgeId))
    await deleteMindEdge(userId, edgeId)
    emit({ type: 'mind_edge_deleted', edgeId })
  }, [userId])

  return {
    nodes,
    edges,
    snapshot,
    loading,
    isEmpty,
    refresh: forceRefresh,
    onNodeDragEnd: handleNodeDragEnd,
    onDeleteEdge: handleDeleteEdge,
  }
}
