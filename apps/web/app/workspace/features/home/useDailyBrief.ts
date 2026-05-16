'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  listDrafts,
  listActiveTips,
  listArchivedEntries,
  listMindNodes,
  listMindEdges,
  listCollections,
  listTags,
  type StoredDraft,
  type StoredTip,
  type StoredEntry,
  type StoredMindNode,
  type StoredMindEdge,
  type StoredCollection,
  type StoredTag,
} from '@/lib/repository'
import { subscribe } from '@/lib/events'

const REFRESH_EVENTS = ['tip_created', 'tip_converted', 'tip_discarded', 'draft_created', 'draft_updated', 'draft_deleted', 'archive_completed', 'mind_node_created', 'mind_node_updated', 'mind_node_deleted', 'mind_edge_created', 'mind_edge_updated', 'mind_edge_deleted'] as const

export interface DailyBriefData {
  activeDraftCount: number
  activeTipCount: number
  documentCount: number
  mindNodeCount: number
  mindEdgeCount: number
  tagCount: number
  collectionCount: number
  todayCreatedCount: number
  recentDrafts: StoredDraft[]
  recentTips: StoredTip[]
  recentDocuments: StoredEntry[]
  recentMindNodes: StoredMindNode[]
  recentMindEdges: StoredMindEdge[]
  collections: StoredCollection[]
  tags: StoredTag[]
  briefHints: BriefHint[]
}

export interface BriefHint {
  type: 'tip_pressure' | 'draft_pressure' | 'document_empty' | 'mind_empty' | 'collection_active' | 'tag_suggestion'
  label: string
  detail: string
  priority: 'high' | 'medium' | 'low'
  targetId?: number | string
}

export function useDailyBrief(userId: string) {
  const [data, setData] = useState<DailyBriefData>({
    activeDraftCount: 0,
    activeTipCount: 0,
    documentCount: 0,
    mindNodeCount: 0,
    mindEdgeCount: 0,
    tagCount: 0,
    collectionCount: 0,
    todayCreatedCount: 0,
    recentDrafts: [],
    recentTips: [],
    recentDocuments: [],
    recentMindNodes: [],
    recentMindEdges: [],
    collections: [],
    tags: [],
    briefHints: [],
  })
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(async () => {
    if (!userId) return
    try {
      const [drafts, tips, documents, mindNodes, mindEdges, collections, tags] = await Promise.all([
        listDrafts(userId),
        listActiveTips(userId),
        listArchivedEntries(userId),
        listMindNodes(userId),
        listMindEdges(userId),
        listCollections(userId),
        listTags(userId),
      ])

      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

      const todayCreated = [...drafts, ...tips, ...documents].filter((item) => {
        const created = item.createdAt
        return created && created >= todayStart
      }).length

      const briefHints: BriefHint[] = []

      if (tips.length >= 5) {
        briefHints.push({
          type: 'tip_pressure',
          label: '整理 Quick Notes',
          detail: `有 ${tips.length} 条 Tips 待整理`,
          priority: 'high',
          targetId: tips[0]?.id,
        })
      } else if (tips.length > 0) {
        briefHints.push({
          type: 'tip_pressure',
          label: 'Quick Notes',
          detail: `有 ${tips.length} 条 Tips 待整理`,
          priority: 'medium',
          targetId: tips[0]?.id,
        })
      }

      if (drafts.length >= 3) {
        briefHints.push({
          type: 'draft_pressure',
          label: '继续编辑草稿',
          detail: `有 ${drafts.length} 份未完成草稿需要决策`,
          priority: 'high',
          targetId: drafts[0]?.id,
        })
      } else if (drafts.length > 0) {
        briefHints.push({
          type: 'draft_pressure',
          label: '草稿箱',
          detail: `有 ${drafts.length} 份草稿进行中`,
          priority: 'medium',
          targetId: drafts[0]?.id,
        })
      }

      if (documents.length === 0) {
        briefHints.push({
          type: 'document_empty',
          label: '开始创作',
          detail: '暂无已归档文档，尝试将 Draft 发布或从 Tip 转化',
          priority: 'low',
        })
      }

      if (mindNodes.length === 0) {
        briefHints.push({
          type: 'mind_empty',
          label: '构建思维图谱',
          detail: '思维图谱为空，归档文档后节点将自动出现',
          priority: 'low',
        })
      }

      const projectCollections = collections.filter((c) => c.collectionType === 'project')
      if (projectCollections.length > 0) {
        briefHints.push({
          type: 'collection_active',
          label: '项目追踪',
          detail: `已有 ${projectCollections.length} 个项目集合`,
          priority: 'low',
        })
      }

      if (tags.length === 0 && documents.length > 0) {
        briefHints.push({
          type: 'tag_suggestion',
          label: '添加标签',
          detail: '文档缺少标签，添加标签有助于搜索和关联',
          priority: 'medium',
        })
      }

      setData({
        activeDraftCount: drafts.length,
        activeTipCount: tips.length,
        documentCount: documents.length,
        mindNodeCount: mindNodes.length,
        mindEdgeCount: mindEdges.length,
        tagCount: tags.length,
        collectionCount: collections.length,
        todayCreatedCount: todayCreated,
        recentDrafts: drafts.slice(0, 5),
        recentTips: tips.slice(0, 5),
        recentDocuments: documents.slice(0, 5),
        recentMindNodes: mindNodes.slice(0, 10),
        recentMindEdges: mindEdges.slice(0, 10),
        collections,
        tags,
        briefHints,
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
