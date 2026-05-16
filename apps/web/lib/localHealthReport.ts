import {
  listMindNodes,
  listMindEdges,
  listRecommendations,
} from '@/lib/repository'
import { isArchived, isDiscarded, isHidden } from '@/lib/lifecycleGuards'
import { entriesTable, tipsTable, editorDraftsTable, collectionsTable, tagsTable } from '@/lib/db'
import { DEFAULT_WORKSPACE_ID } from '@atlax/domain'

export const STALE_THRESHOLD_DAYS = 7
export const RECENTLY_UPDATED_DAYS = 7
const ISOLATED_NODE_PENALTY = 5
const STALE_ITEM_PENALTY = 3
const DUPLICATE_TAG_PENALTY = 2
const WEAKLY_CLASSIFIED_PENALTY = 2
const ORPHAN_DOCUMENT_PENALTY = 3

export type LocalHealthLevel = 'healthy' | 'watch' | 'attention' | 'critical'

export interface LocalHealthSummary {
  documentsTotal: number
  activeDocuments: number
  archivedDocuments: number
  recentlyUpdatedDocuments: number
  draftsTotal: number
  staleDrafts: number
  publishedDrafts: number
  discardedDrafts: number
  activeTips: number
  convertedTips: number
  discardedTips: number
  mindNodes: number
  mindEdges: number
  isolatedMindNodes: number
  orphanDocuments: number
  tagCount: number
  projectCount: number
  collectionCount: number
  untaggedEntries: number
  pendingRecommendations: number
  acceptedRecommendations: number
  rejectedRecommendations: number
  ignoredRecommendations: number
}

export interface LocalHealthSignal {
  id: string
  type: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  reason: string
  evidence: string[]
  targetType: 'document' | 'draft' | 'tip' | 'mindNode' | 'tag' | 'collection' | 'recommendation'
  targetIds: (string | number)[]
  status: 'suggestion' | 'planned' | 'readonly'
}

export interface LocalHealthSuggestion {
  id: string
  title: string
  type: string
  action: string
  reason: string
  severity: 'info' | 'warning' | 'critical'
  status: 'readonly'
  navigationTarget?: { tab: string; filter?: string }
}

export interface ProjectDistribution {
  name: string
  entryCount: number
}

export interface CollectionDistribution {
  name: string
  entryCount: number
}

export interface MindGraphPreviewNode {
  id: string
  label: string
  nodeType: string
  isConnected: boolean
}

export interface MindGraphPreviewEdge {
  sourceId: string
  targetId: string
  edgeType: string
}

export interface MindGraphPreview {
  nodes: MindGraphPreviewNode[]
  edges: MindGraphPreviewEdge[]
}

export interface LocalHealthReport {
  generatedAt: string
  userId: string
  source: 'local-indexeddb'
  trustLevel: 'local-report'
  score: number
  level: LocalHealthLevel
  summary: LocalHealthSummary
  signals: LocalHealthSignal[]
  sections: {
    documents: { total: number; active: number; archived: number; recentlyUpdated: number; orphan: number }
    drafts: { total: number; stale: number; published: number; discarded: number }
    tips: { active: number; converted: number; discarded: number }
    mind: { nodes: number; edges: number; isolated: number }
    taxonomy: { tags: number; projects: number; collections: number; untagged: number }
    recommendations: { pending: number; accepted: number; rejected: number; ignored: number }
  }
  projectDistribution: ProjectDistribution[]
  collectionDistribution: CollectionDistribution[]
  mindGraphPreview: MindGraphPreview
  suggestions: LocalHealthSuggestion[]
}

export function isStale(updatedAt: Date | null, createdAt: Date | null, now: number): boolean {
  const threshold = STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000
  const reference = updatedAt ?? createdAt
  if (!reference) return false
  return (now - reference.getTime()) > threshold
}

export function isRecentlyUpdated(updatedAt: Date | null, createdAt: Date | null, now: number): boolean {
  const threshold = RECENTLY_UPDATED_DAYS * 24 * 60 * 60 * 1000
  const reference = updatedAt ?? createdAt
  if (!reference) return false
  return (now - reference.getTime()) <= threshold
}

function computeLevel(score: number): LocalHealthLevel {
  if (score >= 80) return 'healthy'
  if (score >= 60) return 'watch'
  if (score >= 40) return 'attention'
  return 'critical'
}

export async function getLocalHealthReport(userId: string): Promise<LocalHealthReport> {
  const now = Date.now()

  const [rawEntries, rawTips, rawDrafts, mindNodes, mindEdges, collections, tags, recommendations] = await Promise.all([
    entriesTable.where('[userId+workspaceId]').equals([userId, DEFAULT_WORKSPACE_ID]).toArray(),
    tipsTable.where('[userId+workspaceId]').equals([userId, DEFAULT_WORKSPACE_ID]).toArray(),
    editorDraftsTable.where('[userId+workspaceId]').equals([userId, DEFAULT_WORKSPACE_ID]).toArray(),
    listMindNodes(userId),
    listMindEdges(userId),
    collectionsTable.where('[userId+workspaceId]').equals([userId, DEFAULT_WORKSPACE_ID]).sortBy('sortOrder'),
    tagsTable.where('[userId+workspaceId]').equals([userId, DEFAULT_WORKSPACE_ID]).sortBy('name'),
    listRecommendations(userId),
  ])

  const documentsTotal = rawEntries.length
  const archivedDocuments = rawEntries.filter(e => isArchived(e)).length
  const activeDocuments = documentsTotal - archivedDocuments
  const recentlyUpdatedDocuments = rawEntries.filter(e => isRecentlyUpdated(e.archivedAt ?? null, e.createdAt, now)).length

  const documentIdsWithMindNode = new Set<number>()
  mindNodes.forEach(n => { if (n.documentId != null) documentIdsWithMindNode.add(n.documentId) })
  const orphanDocuments = rawEntries.filter(e =>
    (!e.tags || e.tags.length === 0) && !e.project && (e.id != null && !documentIdsWithMindNode.has(e.id))
  ).length

  const activeDrafts = rawDrafts.filter(d => d.status === 'active')
  const draftsTotal = activeDrafts.length
  const staleDrafts = activeDrafts.filter(d => isStale(d.updatedAt, d.createdAt, now)).length
  const publishedDrafts = rawDrafts.filter(d => d.status === 'published').length
  const discardedDrafts = rawDrafts.filter(d => d.status === 'discarded').length

  const activeTips = rawTips.filter(t => t.status === 'active').length
  const convertedTips = rawTips.filter(t => t.status === 'converted').length
  const discardedTips = rawTips.filter(t => isDiscarded({ status: t.status })).length

  const visibleMindNodes = mindNodes.filter(n => !isHidden(n))
  const visibleNodeIds = new Set(visibleMindNodes.map(n => n.id))
  const visibleEdges = mindEdges.filter(e => visibleNodeIds.has(e.sourceNodeId) && visibleNodeIds.has(e.targetNodeId))
  const connectedNodeIds = new Set<string>()
  visibleEdges.forEach(e => {
    connectedNodeIds.add(e.sourceNodeId)
    connectedNodeIds.add(e.targetNodeId)
  })
  const isolatedMindNodes = visibleMindNodes.filter(n =>
    !connectedNodeIds.has(n.id) && n.nodeType !== 'root'
  ).length

  const tagCount = tags.length
  const projectNames = new Set<string>()
  rawEntries.forEach(e => { if (e.project) projectNames.add(e.project) })
  const projectCount = projectNames.size
  const collectionCount = collections.length
  const untaggedEntries = rawEntries.filter(e => !e.tags || e.tags.length === 0).length

  const seenTagNames = new Map<string, typeof tags[0]>()
  const duplicateTags: typeof tags[0][] = []
  tags.forEach(t => {
    const key = t.name.toLowerCase()
    if (seenTagNames.has(key)) duplicateTags.push(t)
    else seenTagNames.set(key, t)
  })

  const weaklyClassified = rawEntries.filter(e => !e.project || (!e.tags || e.tags.length === 0))

  const pendingStatuses = ['generated', 'shown'] as const
  const acceptedStatuses = ['accepted', 'applied'] as const
  const pendingRecommendations = recommendations.filter(r => pendingStatuses.includes(r.status as typeof pendingStatuses[number])).length
  const acceptedRecommendations = recommendations.filter(r => acceptedStatuses.includes(r.status as typeof acceptedStatuses[number])).length
  const rejectedRecommendations = recommendations.filter(r => r.status === 'rejected').length
  const ignoredRecommendations = recommendations.filter(r => r.status === 'ignored').length

  const summary: LocalHealthSummary = {
    documentsTotal,
    activeDocuments,
    archivedDocuments,
    recentlyUpdatedDocuments,
    draftsTotal,
    staleDrafts,
    publishedDrafts,
    discardedDrafts,
    activeTips,
    convertedTips,
    discardedTips,
    mindNodes: visibleMindNodes.length,
    mindEdges: visibleEdges.length,
    isolatedMindNodes,
    orphanDocuments,
    tagCount,
    projectCount,
    collectionCount,
    untaggedEntries,
    pendingRecommendations,
    acceptedRecommendations,
    rejectedRecommendations,
    ignoredRecommendations,
  }

  const signals: LocalHealthSignal[] = []
  let signalIdx = 0

  if (isolatedMindNodes > 0) {
    signals.push({
      id: `signal-isolated-${signalIdx++}`,
      type: 'isolated_mind_nodes',
      severity: 'warning',
      title: `${isolatedMindNodes} 个孤立思维节点`,
      reason: '这些节点没有与其他节点建立连接，可能在知识图谱中处于孤立状态',
      evidence: [`${isolatedMindNodes} 个可见节点无连接边`],
      targetType: 'mindNode',
      targetIds: [],
      status: 'readonly',
    })
  }

  if (staleDrafts > 0) {
    signals.push({
      id: `signal-stale-drafts-${signalIdx++}`,
      type: 'stale_drafts',
      severity: 'warning',
      title: `${staleDrafts} 篇停滞草稿`,
      reason: `这些草稿超过 ${STALE_THRESHOLD_DAYS} 天未更新`,
      evidence: [`${staleDrafts} 篇活跃草稿超过 ${STALE_THRESHOLD_DAYS} 天未更新`],
      targetType: 'draft',
      targetIds: [],
      status: 'readonly',
    })
  }

  const staleTips = rawTips.filter(t => t.status === 'active' && isStale(t.updatedAt, t.createdAt, now))
  if (staleTips.length > 0) {
    signals.push({
      id: `signal-stale-tips-${signalIdx++}`,
      type: 'stale_tips',
      severity: 'info',
      title: `${staleTips.length} 条停滞闪念`,
      reason: `这些闪念超过 ${STALE_THRESHOLD_DAYS} 天未处理`,
      evidence: [`${staleTips.length} 条活跃闪念超过 ${STALE_THRESHOLD_DAYS} 天未处理`],
      targetType: 'tip',
      targetIds: [],
      status: 'readonly',
    })
  }

  if (duplicateTags.length > 0) {
    signals.push({
      id: `signal-duplicate-tags-${signalIdx++}`,
      type: 'duplicate_tags',
      severity: 'info',
      title: `${duplicateTags.length} 个重复标签`,
      reason: '存在大小写不同但名称相同的标签，建议合并',
      evidence: duplicateTags.map(t => t.name),
      targetType: 'tag',
      targetIds: duplicateTags.map(t => t.id),
      status: 'readonly',
    })
  }

  if (weaklyClassified.length > 0) {
    signals.push({
      id: `signal-weakly-classified-${signalIdx++}`,
      type: 'weakly_classified',
      severity: 'info',
      title: `${weaklyClassified.length} 篇弱归类文档`,
      reason: '这些文档缺少项目归属或标签分类',
      evidence: [`${weaklyClassified.length} 篇文档无项目或无标签`],
      targetType: 'document',
      targetIds: [],
      status: 'readonly',
    })
  }

  if (orphanDocuments > 0) {
    signals.push({
      id: `signal-orphan-documents-${signalIdx++}`,
      type: 'orphan_documents',
      severity: 'warning',
      title: `${orphanDocuments} 篇孤立文档`,
      reason: '这些文档没有标签、没有项目归属、也没有关联思维节点',
      evidence: [`${orphanDocuments} 篇文档完全无归类无关联`],
      targetType: 'document',
      targetIds: [],
      status: 'readonly',
    })
  }

  let score = 100
  score -= isolatedMindNodes * ISOLATED_NODE_PENALTY
  score -= (staleDrafts + staleTips.length) * STALE_ITEM_PENALTY
  score -= duplicateTags.length * DUPLICATE_TAG_PENALTY
  score -= weaklyClassified.length * WEAKLY_CLASSIFIED_PENALTY
  score -= orphanDocuments * ORPHAN_DOCUMENT_PENALTY
  score = Math.max(0, Math.min(100, score))

  const suggestions: LocalHealthSuggestion[] = []
  let sugIdx = 0

  if (orphanDocuments > 0) {
    suggestions.push({
      id: `sug-orphan-${sugIdx++}`,
      title: `${orphanDocuments} 篇孤立文档需要归类`,
      type: 'orphan_documents',
      action: '归类',
      reason: '为孤立文档添加标签或项目归属，或在 Mind 中建立关联节点',
      severity: 'warning',
      status: 'readonly',
      navigationTarget: { tab: 'dock', filter: 'weaklyClassified' },
    })
  }

  if (duplicateTags.length > 0) {
    suggestions.push({
      id: `sug-dup-tags-${sugIdx++}`,
      title: `${duplicateTags.length} 组重复标签建议合并`,
      type: 'duplicate_tags',
      action: '合并',
      reason: '合并大小写不同的同名标签，保持标签体系整洁',
      severity: 'info',
      status: 'readonly',
      navigationTarget: { tab: 'dock', filter: 'duplicates' },
    })
  }

  if (staleDrafts > 0) {
    suggestions.push({
      id: `sug-stale-drafts-${sugIdx++}`,
      title: `${staleDrafts} 篇停滞草稿需要处理`,
      type: 'stale_drafts',
      action: '处理',
      reason: `发布或丢弃超过 ${STALE_THRESHOLD_DAYS} 天未更新的草稿`,
      severity: 'warning',
      status: 'readonly',
      navigationTarget: { tab: 'editor' },
    })
  }

  if (isolatedMindNodes > 0) {
    suggestions.push({
      id: `sug-isolated-${sugIdx++}`,
      title: `${isolatedMindNodes} 个孤立节点需要连接`,
      type: 'isolated_mind_nodes',
      action: '连接',
      reason: '为孤立思维节点建立与其他节点的关联',
      severity: 'warning',
      status: 'readonly',
      navigationTarget: { tab: 'mind' },
    })
  }

  if (weaklyClassified.length > 0) {
    suggestions.push({
      id: `sug-weakly-classified-${sugIdx++}`,
      title: `${weaklyClassified.length} 篇弱归类文档需要补充分类`,
      type: 'weakly_classified',
      action: '分类',
      reason: '这些文档缺少项目归属或标签分类，建议补充完善',
      severity: 'info',
      status: 'readonly',
      navigationTarget: { tab: 'dock', filter: 'weaklyClassified' },
    })
  }

  const projectEntryMap = new Map<string, number>()
  rawEntries.forEach(e => { if (e.project) projectEntryMap.set(e.project, (projectEntryMap.get(e.project) ?? 0) + 1) })
  const projectDistribution: ProjectDistribution[] = Array.from(projectEntryMap.entries())
    .map(([name, entryCount]) => ({ name, entryCount }))
    .sort((a, b) => b.entryCount - a.entryCount)

  const collectionEntryMap = new Map<string, number>()
  collections.forEach(c => {
    let entryCount: number
    if (c.collectionType === 'project') {
      entryCount = rawEntries.filter(e => e.project === c.name).length
    } else {
      entryCount = rawEntries.filter(e => e.tags && e.tags.includes(c.name)).length
    }
    collectionEntryMap.set(c.name, entryCount)
  })
  const collectionDistribution: CollectionDistribution[] = Array.from(collectionEntryMap.entries())
    .map(([name, entryCount]) => ({ name, entryCount }))
    .sort((a, b) => b.entryCount - a.entryCount)

  const mindGraphPreview: MindGraphPreview = {
    nodes: visibleMindNodes.map(n => ({
      id: n.id,
      label: n.label,
      nodeType: n.nodeType,
      isConnected: connectedNodeIds.has(n.id),
    })),
    edges: visibleEdges.map(e => ({
      sourceId: e.sourceNodeId,
      targetId: e.targetNodeId,
      edgeType: e.edgeType,
    })),
  }

  return {
    generatedAt: new Date().toISOString(),
    userId,
    source: 'local-indexeddb',
    trustLevel: 'local-report',
    score,
    level: computeLevel(score),
    summary,
    signals,
    sections: {
      documents: { total: documentsTotal, active: activeDocuments, archived: archivedDocuments, recentlyUpdated: recentlyUpdatedDocuments, orphan: orphanDocuments },
      drafts: { total: draftsTotal, stale: staleDrafts, published: publishedDrafts, discarded: discardedDrafts },
      tips: { active: activeTips, converted: convertedTips, discarded: discardedTips },
      mind: { nodes: visibleMindNodes.length, edges: visibleEdges.length, isolated: isolatedMindNodes },
      taxonomy: { tags: tagCount, projects: projectCount, collections: collectionCount, untagged: untaggedEntries },
      recommendations: { pending: pendingRecommendations, accepted: acceptedRecommendations, rejected: rejectedRecommendations, ignored: ignoredRecommendations },
    },
    projectDistribution,
    collectionDistribution,
    mindGraphPreview,
    suggestions,
  }
}
