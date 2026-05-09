'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  listMindNodes,
  listMindEdges,
  updateMindNodePosition,
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
      const [mindNodes, mindEdges] = await Promise.all([
        listMindNodes(userId),
        listMindEdges(userId),
      ])
      setNodes(mindNodes)
      setEdges(mindEdges)
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

  return {
    nodes,
    edges,
    snapshot,
    loading,
    isEmpty,
    refresh: forceRefresh,
    onNodeDragEnd: handleNodeDragEnd,
  }
}
