'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  listArchivedEntries,
  listDrafts,
  listActiveTips,
  listMindNodes,
  listMindEdges,
  listCollections,
  listTags,
  listRecommendationDockQueue,
  findMindNodeByDocumentId,
  type StoredEntry,
  type StoredDraft,
  type StoredTip,
  type StoredMindNode,
  type StoredMindEdge,
  type StoredCollection,
  type StoredTag,
  type RecommendationDockQueueItem,
} from '@/lib/repository'
import { subscribe } from '@/lib/events'

export type DockEntityType = 'document' | 'draft' | 'tip' | 'mindNode' | 'collection' | 'tag'

export interface DockEntity {
  id: string
  type: DockEntityType
  title: string
  subtitle: string
  status: string
  updatedAt: Date | null
  createdAt: Date | null
  sourceLabel: string
  entryId?: number
  draftId?: number
  tipId?: number
  mindNodeId?: string
  collectionId?: string
  tagId?: string
  tags?: string[]
  project?: string | null
  documentId?: number | null
}

export interface DockSpace {
  id: string
  name: string
  type: string
  health: string
  recs: number
  active: boolean
}

export interface DockSignal {
  label: string
  value: string | number
  key: string
}

export interface DockRecommendation {
  id: string
  type: string
  action: string
  target: string
  impact: string
  confidence: string
}

export interface DockData {
  entities: DockEntity[]
  spaces: DockSpace[]
  signals: DockSignal[]
  recommendations: DockRecommendation[]
  rawEntries: StoredEntry[]
  rawDrafts: StoredDraft[]
  rawTips: StoredTip[]
  rawMindNodes: StoredMindNode[]
  rawMindEdges: StoredMindEdge[]
  rawCollections: StoredCollection[]
  rawTags: StoredTag[]
}

const REFRESH_EVENTS = [
  'tip_created', 'tip_converted', 'tip_discarded',
  'draft_created', 'draft_updated', 'draft_deleted',
  'archive_completed',
  'mind_node_created', 'mind_node_updated', 'mind_node_deleted',
  'mind_edge_created', 'mind_edge_updated', 'mind_edge_deleted',
] as const

function entryToEntity(entry: StoredEntry): DockEntity {
  return {
    id: `entry-${entry.id}`,
    type: 'document',
    title: entry.title || 'Untitled',
    subtitle: entry.type || 'note',
    status: 'archived',
    updatedAt: entry.archivedAt ?? entry.createdAt,
    createdAt: entry.createdAt,
    sourceLabel: 'Document',
    entryId: entry.id,
    tags: entry.tags,
    project: entry.project,
    documentId: entry.id,
  }
}

function draftToEntity(draft: StoredDraft): DockEntity {
  return {
    id: `draft-${draft.id}`,
    type: 'draft',
    title: draft.title || 'Untitled Draft',
    subtitle: draft.sourceType === 'entry' ? 'From Entry' : 'New Draft',
    status: draft.status,
    updatedAt: draft.updatedAt,
    createdAt: draft.createdAt,
    sourceLabel: 'Draft',
    draftId: draft.id,
    tags: [],
    project: null,
  }
}

function tipToEntity(tip: StoredTip): DockEntity {
  return {
    id: `tip-${tip.id}`,
    type: 'tip',
    title: tip.content.slice(0, 60) || 'Untitled Tip',
    subtitle: tip.sourceType,
    status: tip.status,
    updatedAt: tip.updatedAt,
    createdAt: tip.createdAt,
    sourceLabel: 'Tip',
    tipId: tip.id,
    tags: [],
    project: null,
  }
}

function mindNodeToEntity(node: StoredMindNode): DockEntity {
  return {
    id: `mind-${node.id}`,
    type: 'mindNode',
    title: node.label || 'Untitled Node',
    subtitle: node.nodeType,
    status: node.state,
    updatedAt: node.updatedAt,
    createdAt: node.createdAt,
    sourceLabel: 'Mind Node',
    mindNodeId: node.id,
    tags: [],
    project: null,
    documentId: node.documentId,
  }
}

function collectionToEntity(col: StoredCollection): DockEntity {
  return {
    id: `col-${col.id}`,
    type: 'collection',
    title: col.name || 'Untitled Collection',
    subtitle: col.collectionType || 'folder',
    status: 'active',
    updatedAt: col.updatedAt,
    createdAt: col.createdAt,
    sourceLabel: 'Collection',
    collectionId: col.id,
    tags: [],
    project: null,
  }
}

function tagToEntity(tag: StoredTag): DockEntity {
  return {
    id: `tag-${tag.id}`,
    type: 'tag',
    title: tag.name || 'Untitled Tag',
    subtitle: 'Tag',
    status: 'active',
    updatedAt: tag.createdAt,
    createdAt: tag.createdAt,
    sourceLabel: 'Tag',
    tagId: tag.id,
    tags: [tag.name],
    project: null,
  }
}

function computeSpaces(collections: StoredCollection[], entries: StoredEntry[], drafts: StoredDraft[], mindNodes: StoredMindNode[]): DockSpace[] {
  if (collections.length > 0) {
    return collections.map((col, idx) => {
      const entryCount = entries.filter(e => e.project === col.name).length
      return {
        id: col.id,
        name: col.name,
        type: col.collectionType || 'Project',
        health: entryCount > 0 ? `${Math.min(95, 70 + entryCount * 5)}%` : '—',
        recs: 0,
        active: idx === 0,
      }
    })
  }

  const projects = new Set<string>()
  entries.forEach(e => { if (e.project) projects.add(e.project) })
  drafts.forEach(d => { if (d.title) projects.add(d.title.split(' ')[0]) })
  mindNodes.filter(n => n.nodeType === 'project').forEach(n => projects.add(n.label))

  if (projects.size > 0) {
    return Array.from(projects).map((name, idx) => ({
      id: `project-${idx}`,
      name,
      type: 'Project',
      health: '—',
      recs: 0,
      active: idx === 0,
    }))
  }

  return [{ id: 'default', name: 'Dock', type: 'General', health: '—', recs: 0, active: true }]
}

function computeSignals(
  tips: StoredTip[],
  entries: StoredEntry[],
  drafts: StoredDraft[],
  mindNodes: StoredMindNode[],
  mindEdges: StoredMindEdge[],
  tags: StoredTag[],
): DockSignal[] {
  const connectedNodeIds = new Set<string>()
  mindEdges.forEach(e => {
    connectedNodeIds.add(e.sourceNodeId)
    connectedNodeIds.add(e.targetNodeId)
  })
  const isolatedNodes = mindNodes.filter(n => !connectedNodeIds.has(n.id) || n.state === 'drifting' || n.state === 'isolated')
  const tagNames = new Set(tags.map(t => t.name.toLowerCase()))
  const duplicateTagCount = tags.length - tagNames.size
  const now = Date.now()
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  const stagnantCount = [...drafts, ...tips].filter(item => {
    const updated = item.updatedAt ?? item.createdAt
    return updated && (now - updated.getTime()) > sevenDaysMs
  }).length
  const totalNodes = mindNodes.length
  const connectedCount = mindNodes.filter(n => connectedNodeIds.has(n.id)).length
  const healthPct = totalNodes > 0 ? Math.round((connectedCount / totalNodes) * 100) : 0

  return [
    { label: '待整理', value: tips.length, key: 'unsorted' },
    { label: '待确认建议', value: 0, key: 'pendingRecs' },
    { label: '孤立节点', value: isolatedNodes.length, key: 'isolated' },
    { label: '重复主题', value: duplicateTagCount, key: 'duplicates' },
    { label: '停滞内容', value: stagnantCount, key: 'stagnant' },
    { label: '结构健康', value: `${healthPct}%`, key: 'health' },
  ]
}

function computeRecommendations(recs: RecommendationDockQueueItem[]): DockRecommendation[] {
  if (!recs || recs.length === 0) return []
  return recs.slice(0, 4).map(r => ({
    id: r.id || `rec-${Math.random()}`,
    type: r.recommendationType || 'Link',
    action: r.reasonSummary?.reason || r.recommendationType || 'Recommendation',
    target: r.subjectType || '—',
    impact: r.scoreSummary ? `score: ${Math.round((r.confidenceScore ?? 0) * 100)}%` : '—',
    confidence: `${Math.round((r.confidenceScore ?? 0) * 100)}%`,
  }))
}

export function useDockData(userId: string) {
  const [data, setData] = useState<DockData>({
    entities: [],
    spaces: [],
    signals: [],
    recommendations: [],
    rawEntries: [],
    rawDrafts: [],
    rawTips: [],
    rawMindNodes: [],
    rawMindEdges: [],
    rawCollections: [],
    rawTags: [],
  })
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(async () => {
    if (!userId) return
    try {
      const [entries, drafts, tips, mindNodes, mindEdges, collections, tags] = await Promise.all([
        listArchivedEntries(userId),
        listDrafts(userId),
        listActiveTips(userId),
        listMindNodes(userId),
        listMindEdges(userId),
        listCollections(userId),
        listTags(userId),
      ])

      let recommendations: DockRecommendation[] = []
      try {
        const recResult = await listRecommendationDockQueue(userId, { limit: 4 })
        recommendations = computeRecommendations(recResult.items)
      } catch {
        // recommendation queue not available, leave empty
      }

      const entities: DockEntity[] = [
        ...entries.map(entryToEntity),
        ...drafts.filter(d => d.status === 'active').map(draftToEntity),
        ...tips.map(tipToEntity),
        ...mindNodes.filter(n => n.nodeType === 'document' || n.nodeType === 'topic').map(mindNodeToEntity),
        ...collections.map(collectionToEntity),
        ...tags.map(tagToEntity),
      ]

      const spaces = computeSpaces(collections, entries, drafts, mindNodes)
      const signals = computeSignals(tips, entries, drafts, mindNodes, mindEdges, tags)

      setData({
        entities,
        spaces,
        signals,
        recommendations,
        rawEntries: entries,
        rawDrafts: drafts,
        rawTips: tips,
        rawMindNodes: mindNodes,
        rawMindEdges: mindEdges,
        rawCollections: collections,
        rawTags: tags,
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

export async function findRelatedMindNode(userId: string, entity: DockEntity): Promise<StoredMindNode | null> {
  if (entity.documentId != null) {
    return findMindNodeByDocumentId(userId, entity.documentId)
  }
  return null
}
