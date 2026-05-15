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
  convertTipToDraft,
  applyRecommendation,
  recordRecommendationFeedback,
  discardDraft,
  discardTip,
  type StoredEntry,
  type StoredDraft,
  type StoredTip,
  type StoredMindNode,
  type StoredMindEdge,
  type StoredCollection,
  type StoredTag,
  type RecommendationDockQueueItem,
} from '@/lib/repository'
import { subscribe, emit } from '@/lib/events'
import { isStale } from '@/lib/localHealthReport'
import { isHidden } from '@/lib/lifecycleGuards'
import { isRecommendationPending } from '@/lib/recommendation-i18n'
import type { RecommendationStatus, RecommendationCandidateType, RecommendationSubjectType } from '@atlax/domain'

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
  status: RecommendationStatus
  candidateType: RecommendationCandidateType
  candidateId: string
  subjectType: RecommendationSubjectType
  subjectId: number | string
  confidenceScore: number
  isShown: boolean
  hasFeedback: boolean
  reasonSummary: { reason: string }
  scoreSummary: { score: number; scoreReason?: string | null }
  evidenceSummary: { evidenceCount: number; evidenceTypes: string[]; matchedValues: string[] }
}

export interface DockHealthDetails {
  isolatedNodes: StoredMindNode[]
  stagnantItems: Array<StoredDraft | StoredTip>
  duplicateTags: StoredTag[]
  weaklyClassifiedEntries: StoredEntry[]
  connectedRatio: number
  totalNodes: number
  connectedNodes: number
}

export interface DockData {
  entities: DockEntity[]
  spaces: DockSpace[]
  signals: DockSignal[]
  recommendations: DockRecommendation[]
  healthDetails: DockHealthDetails
  rawEntries: StoredEntry[]
  rawDrafts: StoredDraft[]
  rawTips: StoredTip[]
  rawMindNodes: StoredMindNode[]
  rawMindEdges: StoredMindEdge[]
  rawCollections: StoredCollection[]
  rawTags: StoredTag[]
  rawRecommendations: RecommendationDockQueueItem[]
}

const REFRESH_EVENTS = [
  'tip_created', 'tip_converted', 'tip_discarded',
  'draft_created', 'draft_updated', 'draft_deleted',
  'archive_completed',
  'document_archived', 'document_restored',
  'mind_node_created', 'mind_node_updated', 'mind_node_deleted',
  'mind_edge_created', 'mind_edge_updated', 'mind_edge_deleted',
  'recommendation_applied', 'recommendation_rejected', 'recommendation_ignored',
  'collection_updated', 'tag_updated',
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

function computeSpaces(collections: StoredCollection[], entries: StoredEntry[]): DockSpace[] {
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

  return []
}

export function computeHealthDetails(
  entries: StoredEntry[],
  drafts: StoredDraft[],
  tips: StoredTip[],
  mindNodes: StoredMindNode[],
  mindEdges: StoredMindEdge[],
  tags: StoredTag[],
): DockHealthDetails {
  const visibleNodes = mindNodes.filter(n => !isHidden(n))
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id))
  const visibleEdges = mindEdges.filter(e => visibleNodeIds.has(e.sourceNodeId) && visibleNodeIds.has(e.targetNodeId))
  const connectedNodeIds = new Set<string>()
  visibleEdges.forEach(e => {
    connectedNodeIds.add(e.sourceNodeId)
    connectedNodeIds.add(e.targetNodeId)
  })

  const isolatedNodes = visibleNodes.filter(n =>
    !connectedNodeIds.has(n.id) && n.nodeType !== 'root'
  )

  const now = Date.now()
  const stagnantItems: Array<StoredDraft | StoredTip> = [
    ...drafts.filter(d => d.status === 'active' && isStale(d.updatedAt, d.createdAt, now)),
    ...tips.filter(t => t.status === 'active' && isStale(t.updatedAt, t.createdAt, now)),
  ]

  const seenNames = new Map<string, StoredTag>()
  const duplicateTags: StoredTag[] = []
  tags.forEach(t => {
    const key = t.name.toLowerCase()
    if (seenNames.has(key)) {
      duplicateTags.push(t)
    } else {
      seenNames.set(key, t)
    }
  })

  const weaklyClassifiedEntries = entries.filter(e => !e.project || (e.tags && e.tags.length === 0))

  const totalNodes = visibleNodes.length
  const connectedNodes = visibleNodes.filter(n => connectedNodeIds.has(n.id)).length
  const connectedRatio = totalNodes > 0 ? connectedNodes / totalNodes : 0

  return {
    isolatedNodes,
    stagnantItems,
    duplicateTags,
    weaklyClassifiedEntries,
    connectedRatio,
    totalNodes,
    connectedNodes,
  }
}

function computeSignals(
  tips: StoredTip[],
  entries: StoredEntry[],
  drafts: StoredDraft[],
  mindNodes: StoredMindNode[],
  mindEdges: StoredMindEdge[],
  tags: StoredTag[],
  pendingRecCount: number,
): DockSignal[] {
  const visibleNodes = mindNodes.filter(n => !isHidden(n))
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id))
  const visibleEdges = mindEdges.filter(e => visibleNodeIds.has(e.sourceNodeId) && visibleNodeIds.has(e.targetNodeId))
  const connectedNodeIds = new Set<string>()
  visibleEdges.forEach(e => {
    connectedNodeIds.add(e.sourceNodeId)
    connectedNodeIds.add(e.targetNodeId)
  })
  const isolatedNodes = visibleNodes.filter(n => !connectedNodeIds.has(n.id) && n.nodeType !== 'root')
  const tagNames = new Set(tags.map(t => t.name.toLowerCase()))
  const duplicateTagCount = tags.length - tagNames.size
  const now = Date.now()
  const stagnantCount = [
    ...drafts.filter(d => d.status === 'active'),
    ...tips.filter(t => t.status === 'active'),
  ].filter(item => isStale(item.updatedAt, item.createdAt, now)).length
  const weaklyClassifiedCount = entries.filter(e => !e.project || (!e.tags || e.tags.length === 0)).length
  const totalNodes = visibleNodes.length
  const connectedCount = visibleNodes.filter(n => connectedNodeIds.has(n.id)).length
  const healthPct = totalNodes > 0 ? Math.round((connectedCount / totalNodes) * 100) : 0

  return [
    { label: '待整理', value: tips.length, key: 'unsorted' },
    { label: '待确认建议', value: pendingRecCount, key: 'pendingRecs' },
    { label: '孤立节点', value: isolatedNodes.length, key: 'isolated' },
    { label: '重复主题', value: duplicateTagCount, key: 'duplicates' },
    { label: '停滞内容', value: stagnantCount, key: 'stagnant' },
    { label: '弱归类', value: weaklyClassifiedCount, key: 'weaklyClassified' },
    { label: '结构健康', value: `${healthPct}%`, key: 'health' },
  ]
}

function makeDeterministicRecKey(r: RecommendationDockQueueItem, index: number): string {
  if (r.id) return r.id
  const parts = [
    r.recommendationType || 'rec',
    r.subjectType || 'unk',
    String(r.subjectId),
    r.candidateType || 'unk',
    r.candidateId || 'unk',
    r.createdAt ? String(r.createdAt.getTime()) : String(index),
    String(index),
  ]
  return parts.join('-')
}

function computeRecommendations(recs: RecommendationDockQueueItem[]): DockRecommendation[] {
  if (!recs || recs.length === 0) return []
  return recs.slice(0, 8).map((r, idx) => ({
    id: makeDeterministicRecKey(r, idx),
    type: r.recommendationType || 'Link',
    action: r.reasonSummary?.reason || r.recommendationType || 'Recommendation',
    target: r.subjectType || '—',
    impact: r.scoreSummary ? `score: ${Math.round((r.confidenceScore ?? 0) * 100)}%` : '—',
    confidence: `${Math.round((r.confidenceScore ?? 0) * 100)}%`,
    status: r.status,
    candidateType: r.candidateType,
    candidateId: r.candidateId,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    confidenceScore: r.confidenceScore,
    isShown: r.isShown,
    hasFeedback: r.hasFeedback,
    reasonSummary: r.reasonSummary,
    scoreSummary: r.scoreSummary,
    evidenceSummary: r.evidenceSummary,
  }))
}

export type EditorOpenTarget =
  | { type: 'document'; id: number }
  | { type: 'draft'; id: number }
  | { type: 'unsupported'; reason: string }

export function resolveDockEditorOpenTarget(entity: DockEntity): EditorOpenTarget {
  switch (entity.type) {
    case 'document':
      if (entity.entryId) return { type: 'document', id: entity.entryId }
      return { type: 'unsupported', reason: '该文档缺少 entryId，无法打开 Editor' }
    case 'draft':
      if (entity.draftId) return { type: 'draft', id: entity.draftId }
      return { type: 'unsupported', reason: '该草稿缺少 draftId，无法打开 Editor' }
    case 'tip':
      if (entity.tipId) return { type: 'draft', id: -entity.tipId }
      return { type: 'unsupported', reason: '该 Tip 缺少 tipId，无法转换' }
    case 'mindNode':
      if (entity.documentId != null) return { type: 'document', id: entity.documentId }
      return { type: 'unsupported', reason: '该 Mind 节点未关联文档，无法打开 Editor' }
    default:
      return { type: 'unsupported', reason: `${entity.type} 类型暂不支持打开 Editor` }
  }
}

export async function executeDockEditorOpen(
  entity: DockEntity,
  userId: string,
  onOpenEditor: (id: number, sourceType: 'draft' | 'document') => void,
  onToast?: (msg: string) => void,
): Promise<boolean> {
  const target = resolveDockEditorOpenTarget(entity)
  switch (target.type) {
    case 'document':
      onOpenEditor(target.id, 'document')
      return true
    case 'draft':
      if (target.id < 0) {
        const tipId = -target.id
        try {
          const result = await convertTipToDraft(userId, tipId)
          if (result.draft) {
            emit({ type: 'tip_converted', tipId, draftId: result.draft.id })
            onOpenEditor(result.draft.id, 'draft')
            return true
          }
          onToast?.('Tip 转换失败：未生成 Draft')
          return false
        } catch (e) {
          onToast?.(`Tip 转换失败: ${e instanceof Error ? e.message : '未知错误'}`)
          return false
        }
      }
      onOpenEditor(target.id, 'draft')
      return true
    case 'unsupported':
      onToast?.(target.reason)
      return false
  }
}

export async function executeRecommendationApply(
  userId: string,
  recommendationId: string,
  onToast?: (msg: string) => void,
): Promise<{ success: boolean; detail?: string }> {
  try {
    const result = await applyRecommendation({ userId, recommendationId })
    emit({ type: 'recommendation_applied', recommendationId })
    if (result.appliedChanges?.changeType === 'already_accepted') {
      return { success: true, detail: '该建议已被应用' }
    }
    const detail = result.appliedChanges?.changeDetail || '建议已应用'
    return { success: true, detail }
  } catch (e) {
    const msg = e instanceof Error ? e.message : '未知错误'
    onToast?.(`建议应用失败: ${msg}`)
    return { success: false, detail: msg }
  }
}

export async function executeRecommendationReject(
  userId: string,
  recommendationId: string,
  onToast?: (msg: string) => void,
): Promise<boolean> {
  try {
    await recordRecommendationFeedback({ userId, recommendationId, feedbackType: 'rejected' })
    emit({ type: 'recommendation_rejected', recommendationId })
    return true
  } catch (e) {
    onToast?.(`拒绝失败: ${e instanceof Error ? e.message : '未知错误'}`)
    return false
  }
}

export async function executeRecommendationIgnore(
  userId: string,
  recommendationId: string,
  onToast?: (msg: string) => void,
): Promise<boolean> {
  try {
    await recordRecommendationFeedback({ userId, recommendationId, feedbackType: 'ignored' })
    emit({ type: 'recommendation_ignored', recommendationId })
    return true
  } catch (e) {
    onToast?.(`忽略失败: ${e instanceof Error ? e.message : '未知错误'}`)
    return false
  }
}

export function useDockData(userId: string) {
  const [data, setData] = useState<DockData>({
    entities: [],
    spaces: [],
    signals: [],
    recommendations: [],
    healthDetails: {
      isolatedNodes: [],
      stagnantItems: [],
      duplicateTags: [],
      weaklyClassifiedEntries: [],
      connectedRatio: 0,
      totalNodes: 0,
      connectedNodes: 0,
    },
    rawEntries: [],
    rawDrafts: [],
    rawTips: [],
    rawMindNodes: [],
    rawMindEdges: [],
    rawCollections: [],
    rawTags: [],
    rawRecommendations: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(async () => {
    if (!userId) return
    try {
      setError(null)
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
      let rawRecommendations: RecommendationDockQueueItem[] = []
      let pendingRecCount = 0
      try {
        const recResult = await listRecommendationDockQueue(userId, { limit: 20 })
        rawRecommendations = recResult.items
        recommendations = computeRecommendations(recResult.items)
        pendingRecCount = recResult.items.filter(i => isRecommendationPending(i.status)).length
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

      const spaces = computeSpaces(collections, entries)
      const signals = computeSignals(tips, entries, drafts, mindNodes, mindEdges, tags, pendingRecCount)
      const healthDetails = computeHealthDetails(entries, drafts, tips, mindNodes, mindEdges, tags)

      setData({
        entities,
        spaces,
        signals,
        recommendations,
        healthDetails,
        rawEntries: entries,
        rawDrafts: drafts,
        rawTips: tips,
        rawMindNodes: mindNodes,
        rawMindEdges: mindEdges,
        rawCollections: collections,
        rawTags: tags,
        rawRecommendations,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dock 数据加载失败')
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

  return { data, loading, error, refresh: forceRefresh }
}

export async function findRelatedMindNode(userId: string, entity: DockEntity): Promise<StoredMindNode | null> {
  if (entity.documentId != null) {
    return findMindNodeByDocumentId(userId, entity.documentId)
  }
  return null
}

export async function executeDockDiscardDraft(
  userId: string,
  draftId: number,
  onToast?: (msg: string) => void,
): Promise<boolean> {
  try {
    const result = await discardDraft(userId, draftId)
    if (result) {
      emit({ type: 'draft_deleted', draftId })
      return true
    }
    onToast?.('Draft 丢弃失败：未找到该 Draft 或无权操作')
    return false
  } catch (e) {
    onToast?.(`Draft 丢弃失败: ${e instanceof Error ? e.message : '未知错误'}`)
    return false
  }
}

export async function executeDockDiscardTip(
  userId: string,
  tipId: number,
  onToast?: (msg: string) => void,
): Promise<boolean> {
  try {
    const result = await discardTip(userId, tipId)
    if (result) {
      emit({ type: 'tip_discarded', tipId })
      return true
    }
    onToast?.('Tip 丢弃失败：未找到该 Tip 或无权操作')
    return false
  } catch (e) {
    onToast?.(`Tip 丢弃失败: ${e instanceof Error ? e.message : '未知错误'}`)
    return false
  }
}
