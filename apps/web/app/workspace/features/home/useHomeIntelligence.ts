'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  listDrafts,
  listActiveTips,
  listArchivedEntries,
  listMindNodes,
  listMindEdges,
  listCollections,
  type StoredDraft,
  type StoredTip,
  type StoredEntry,
  type StoredCollection,
} from '@/lib/repository'
import { subscribe } from '@/lib/events'

const REFRESH_EVENTS = ['tip_created', 'tip_converted', 'tip_discarded', 'draft_created', 'draft_updated', 'draft_deleted', 'archive_completed', 'mind_node_created', 'mind_node_updated', 'mind_node_deleted', 'mind_edge_created', 'mind_edge_updated', 'mind_edge_deleted'] as const

export interface HomeIntelligenceData {
  activeDraftCount: number
  activeTipCount: number
  documentCount: number
  mindNodeCount: number
  mindEdgeCount: number
  todayCreatedCount: number
  todayUpdatedCount: number
  recentDrafts: StoredDraft[]
  recentTips: StoredTip[]
  recentDocuments: StoredEntry[]
  collections: StoredCollection[]
  healthHints: string[]
}

export function useHomeIntelligence(userId: string) {
  const [data, setData] = useState<HomeIntelligenceData>({
    activeDraftCount: 0,
    activeTipCount: 0,
    documentCount: 0,
    mindNodeCount: 0,
    mindEdgeCount: 0,
    todayCreatedCount: 0,
    todayUpdatedCount: 0,
    recentDrafts: [],
    recentTips: [],
    recentDocuments: [],
    collections: [],
    healthHints: [],
  })
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(async () => {
    if (!userId) return
    try {
      const [drafts, tips, documents, mindNodes, mindEdges, collections] = await Promise.all([
        listDrafts(userId),
        listActiveTips(userId),
        listArchivedEntries(userId),
        listMindNodes(userId),
        listMindEdges(userId),
        listCollections(userId),
      ])

      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

      const todayCreated = [...drafts, ...tips, ...documents].filter((item) => {
        const created = item.createdAt
        return created && created >= todayStart
      }).length

      const todayUpdated = [...drafts].filter((d) => {
        return d.updatedAt && d.updatedAt >= todayStart
      }).length

      const healthHints: string[] = []
      if (tips.length >= 5) {
        healthHints.push(`有 ${tips.length} 条 Tips 待整理`)
      }
      if (drafts.length >= 1) {
        healthHints.push(`有 ${drafts.length} 篇 Draft 未发布`)
      }
      if (documents.length === 0) {
        healthHints.push('暂无已归档文档')
      }
      if (mindNodes.length === 0) {
        healthHints.push('思维图谱为空，开始捕获想法吧')
      }

      setData({
        activeDraftCount: drafts.length,
        activeTipCount: tips.length,
        documentCount: documents.length,
        mindNodeCount: mindNodes.length,
        mindEdgeCount: mindEdges.length,
        todayCreatedCount: todayCreated,
        todayUpdatedCount: todayUpdated,
        recentDrafts: drafts.slice(0, 5),
        recentTips: tips.slice(0, 5),
        recentDocuments: documents.slice(0, 5),
        collections,
        healthHints,
      })
    } catch {
      // silently fail
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

  const forceRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  return { data, loading, refresh: forceRefresh }
}
