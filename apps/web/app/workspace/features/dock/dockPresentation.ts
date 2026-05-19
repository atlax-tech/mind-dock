'use client'

import { isRecommendationPending } from '@/lib/recommendation-i18n'
import type { RecommendationStatus } from '@atlax/domain'
import type { DockData, DockEntity, DockRecommendation } from './useDockData'

export type DockNavigationMode =
  | 'libraryOverview'
  | 'warRoom'
  | 'knowledgeFlow'
  | 'inbox'
  | 'recommendationQueue'
  | 'healthRisks'
  | 'archiveEvidence'
  | 'customViews'

export type DockPresentationKind =
  | 'project'
  | 'topic'
  | 'document'
  | 'signal'
  | 'draft'
  | 'mindNode'
  | 'recommendation'
  | 'archiveEvidence'

export type DockPrimaryAction =
  | 'open'
  | 'openInEditor'
  | 'openInMind'
  | 'review'
  | 'organize'
  | 'continueEditing'

export type DockWarRoomStage = 'backlog' | 'inProgress' | 'review' | 'done' | 'blocked'

export type DockRiskCategory = 'isolated' | 'duplicates' | 'stagnant' | 'weaklyClassified'

export type DockTimeRange = 'any' | '24h' | '7d' | '30d'

export interface DockPresentationItem {
  id: string
  title: string
  kind: DockPresentationKind
  scopeTitle: string | null
  status: string
  tags: string[]
  updatedAt: Date | null
  primaryAction: DockPrimaryAction
  searchText: string
  navBuckets: DockNavigationMode[]
  isArchiveEvidence: boolean
  isRisk: boolean
  isRecommendationBacked: boolean
  warRoomStage: DockWarRoomStage
  summary: string
  path: string
  relatedObjects: string[]
  riskCategories: DockRiskCategory[]
  relatedRecommendationIds: string[]
  recommendationStatus?: RecommendationStatus | null
  entity?: DockEntity
  recommendation?: DockRecommendation
}

export interface DockSharedFilterState {
  query: string
  itemKinds: DockPresentationKind[]
  statuses: string[]
  tags: string[]
  timeRange: DockTimeRange
  moreFilter: 'all' | 'recommendationBacked' | 'unscoped' | 'risks'
  selectedScope: string | null
  includeArchive: boolean
  healthFilter: DockRiskCategory | 'summary' | null
}

const ARCHIVE_KEYWORDS = ['archive', 'archived', '归档', '证据', 'evidence']

function excerpt(value: string | null | undefined, limit = 120): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim()
  if (!normalized) return '暂无摘要'
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized
}

function normalizeScopeKey(value: string | null | undefined): string | null {
  return value ? value.trim().toLowerCase() : null
}

function makeSearchText(parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .toLowerCase()
}

function hasArchiveKeyword(values: Array<string | null | undefined>): boolean {
  return values.some((value) => {
    const normalized = (value ?? '').toLowerCase()
    return ARCHIVE_KEYWORDS.some((keyword) => normalized.includes(keyword))
  })
}

function getEntityReferenceId(entity: DockEntity): string | null {
  return String(
    entity.entryId ??
      entity.documentId ??
      entity.draftId ??
      entity.tipId ??
      entity.mindNodeId ??
      entity.collectionId ??
      entity.tagId ??
      '',
  ) || null
}

function getRecommendationReferenceId(recommendation: DockRecommendation): string {
  return String(recommendation.subjectId)
}

function getRecommendationSubjectLabel(
  recommendation: DockRecommendation,
  entityByReferenceId: Map<string, DockEntity>,
): string {
  const subject = entityByReferenceId.get(getRecommendationReferenceId(recommendation))
  return subject?.title ?? recommendation.target
}

function getRecommendationScope(
  recommendation: DockRecommendation,
  entityByReferenceId: Map<string, DockEntity>,
): string | null {
  const subject = entityByReferenceId.get(getRecommendationReferenceId(recommendation))
  return subject?.project ?? null
}

function buildRiskMaps(data: DockData) {
  const isolatedNodeIds = new Set(data.healthDetails.isolatedNodes.map((node) => node.id))
  const stagnantDraftIds = new Set(
    data.healthDetails.stagnantItems
      .filter((item): item is typeof data.rawDrafts[number] => 'title' in item)
      .map((item) => item.id),
  )
  const stagnantTipIds = new Set(
    data.healthDetails.stagnantItems
      .filter((item): item is typeof data.rawTips[number] => !('title' in item))
      .map((item) => item.id),
  )
  const duplicateTagNames = new Set(data.healthDetails.duplicateTags.map((tag) => tag.name.toLowerCase()))
  const weakEntryIds = new Set(data.healthDetails.weaklyClassifiedEntries.map((entry) => entry.id))

  return {
    isolatedNodeIds,
    stagnantDraftIds,
    stagnantTipIds,
    duplicateTagNames,
    weakEntryIds,
  }
}

function buildPendingRecommendationMap(entities: DockEntity[], recommendations: DockRecommendation[]) {
  const entityByReferenceId = new Map<string, DockEntity>()
  for (const entity of entities) {
    const refId = getEntityReferenceId(entity)
    if (refId) {
      entityByReferenceId.set(refId, entity)
    }
  }

  const recommendationIdsByReferenceId = new Map<string, string[]>()
  for (const recommendation of recommendations) {
    if (!isRecommendationPending(recommendation.status)) continue
    const refId = getRecommendationReferenceId(recommendation)
    const current = recommendationIdsByReferenceId.get(refId) ?? []
    current.push(recommendation.id)
    recommendationIdsByReferenceId.set(refId, current)
  }

  return { entityByReferenceId, recommendationIdsByReferenceId }
}

function inferArchiveEvidence(kind: DockPresentationKind, title: string, scopeTitle: string | null, tags: string[], status: string): boolean {
  if (kind === 'archiveEvidence') return true
  if (kind === 'document') {
    return hasArchiveKeyword([title, scopeTitle, ...tags])
  }
  if (kind === 'project' || kind === 'topic' || kind === 'mindNode') {
    return status === 'archived' || hasArchiveKeyword([title, scopeTitle, ...tags])
  }
  return false
}

function inferRiskCategories(
  item: {
    kind: DockPresentationKind
    title: string
    status: string
    tags: string[]
    entity?: DockEntity
  },
  riskMaps: ReturnType<typeof buildRiskMaps>,
): DockRiskCategory[] {
  const categories = new Set<DockRiskCategory>()
  const entity = item.entity

  if (entity?.mindNodeId && riskMaps.isolatedNodeIds.has(entity.mindNodeId)) {
    categories.add('isolated')
  }
  if (entity?.draftId && riskMaps.stagnantDraftIds.has(entity.draftId)) {
    categories.add('stagnant')
  }
  if (entity?.tipId && riskMaps.stagnantTipIds.has(entity.tipId)) {
    categories.add('stagnant')
  }
  if (entity?.entryId && riskMaps.weakEntryIds.has(entity.entryId)) {
    categories.add('weaklyClassified')
  }
  if (entity?.tagId && riskMaps.duplicateTagNames.has(item.title.toLowerCase())) {
    categories.add('duplicates')
  }
  if (item.tags.some((tag) => riskMaps.duplicateTagNames.has(tag.toLowerCase()))) {
    categories.add('duplicates')
  }
  if (['isolated', 'conflicted', 'dormant'].includes(item.status)) {
    categories.add('isolated')
  }

  return Array.from(categories)
}

function inferPrimaryAction(kind: DockPresentationKind, recommendationBacked: boolean): DockPrimaryAction {
  switch (kind) {
    case 'project':
    case 'topic':
      return 'open'
    case 'document':
      return recommendationBacked ? 'review' : 'open'
    case 'signal':
      return 'organize'
    case 'draft':
      return 'continueEditing'
    case 'mindNode':
      return 'openInMind'
    case 'recommendation':
      return 'review'
    case 'archiveEvidence':
      return 'open'
  }
}

function deriveWarRoomStage(item: DockPresentationItem, riskScopes: Set<string>, recommendationScopes: Set<string>): DockWarRoomStage {
  if (item.kind === 'recommendation') return 'review'
  if (item.kind === 'project' || item.kind === 'topic') {
    if (riskScopes.has(item.title)) return 'blocked'
    if (recommendationScopes.has(item.title)) return 'review'
    return 'inProgress'
  }
  if (item.riskCategories.length > 0 || ['conflicted', 'isolated', 'dormant'].includes(item.status)) {
    return 'blocked'
  }
  if (item.kind === 'draft') return 'inProgress'
  if (item.kind === 'mindNode') {
    if (['anchored', 'active'].includes(item.status)) return 'done'
    if (['suggested'].includes(item.status)) return 'review'
    return 'inProgress'
  }
  if (item.kind === 'document') {
    return item.isRecommendationBacked ? 'review' : 'done'
  }
  return 'backlog'
}

function inferNavBuckets(item: DockPresentationItem): DockNavigationMode[] {
  const buckets = new Set<DockNavigationMode>()
  if (!item.isArchiveEvidence) {
    buckets.add('libraryOverview')
  }
  if (item.kind === 'project' || item.kind === 'topic' || item.scopeTitle) {
    buckets.add('warRoom')
  }
  if (['document', 'signal', 'draft', 'mindNode'].includes(item.kind)) {
    buckets.add('knowledgeFlow')
  }
  if (item.kind === 'signal' || item.kind === 'draft' || (!item.scopeTitle && item.kind === 'document')) {
    buckets.add('inbox')
  }
  if (item.kind === 'recommendation') {
    buckets.add('recommendationQueue')
  }
  if (item.isRisk) {
    buckets.add('healthRisks')
  }
  if (item.isArchiveEvidence) {
    buckets.add('archiveEvidence')
  }
  return Array.from(buckets)
}

function createPresentationItem(
  input: Omit<
    DockPresentationItem,
    'navBuckets' | 'primaryAction' | 'isArchiveEvidence' | 'isRisk' | 'warRoomStage' | 'isRecommendationBacked'
  >,
) {
  const isArchiveEvidence = inferArchiveEvidence(input.kind, input.title, input.scopeTitle, input.tags, input.status)
  const isRisk = input.riskCategories.length > 0
  return {
    ...input,
    primaryAction: inferPrimaryAction(
      input.kind,
      input.relatedRecommendationIds.length > 0 || input.kind === 'recommendation',
    ),
    navBuckets: [],
    isArchiveEvidence,
    isRisk,
    isRecommendationBacked: input.relatedRecommendationIds.length > 0 || input.kind === 'recommendation',
    warRoomStage: 'backlog' as DockWarRoomStage,
  }
}

export function buildDockItems(data: DockData): DockPresentationItem[] {
  const riskMaps = buildRiskMaps(data)
  const { entityByReferenceId, recommendationIdsByReferenceId } = buildPendingRecommendationMap(data.entities, data.recommendations)
  const documentsById = new Map(data.rawEntries.map((entry) => [entry.id, entry]))
  const projectKeys = new Set<string>()
  const topicKeys = new Set<string>()
  const items: DockPresentationItem[] = []

  for (const collection of data.rawCollections) {
    const kind: DockPresentationKind =
      collection.collectionType === 'project'
        ? 'project'
        : collection.collectionType === 'archive'
          ? 'archiveEvidence'
          : 'topic'
    const dedupeKey = `${kind}:${collection.name.toLowerCase()}`
    if ((kind === 'project' && projectKeys.has(dedupeKey)) || (kind === 'topic' && topicKeys.has(dedupeKey))) {
      continue
    }
    if (kind === 'project') projectKeys.add(dedupeKey)
    if (kind === 'topic') topicKeys.add(dedupeKey)
    const entity = data.entities.find((item) => item.collectionId === collection.id)
    const referenceId = entity ? getEntityReferenceId(entity) : null
    const relatedRecommendationIds = referenceId ? recommendationIdsByReferenceId.get(referenceId) ?? [] : []
    const item = createPresentationItem({
      id: `collection-${collection.id}`,
      title: collection.name,
      kind,
      scopeTitle: kind === 'project' ? collection.name : null,
      status: kind === 'archiveEvidence' ? 'archived' : 'active',
      tags: [],
      updatedAt: collection.updatedAt,
      searchText: makeSearchText([collection.name, collection.description, collection.collectionType]),
      summary: excerpt(collection.description),
      path: kind === 'project' ? `Dock / ${collection.name}` : `Dock / Topic / ${collection.name}`,
      relatedObjects: [],
      riskCategories: inferRiskCategories(
        { kind, title: collection.name, status: kind === 'archiveEvidence' ? 'archived' : 'active', tags: [], entity },
        riskMaps,
      ),
      relatedRecommendationIds,
      entity,
    })
    items.push(item)
  }

  for (const node of data.rawMindNodes) {
    const entity = data.entities.find((item) => item.mindNodeId === node.id)
    const document = node.documentId != null ? documentsById.get(node.documentId) ?? null : null
    const scopeTitle = document?.project ?? null
    if (node.nodeType === 'project') {
      const dedupeKey = `project:${node.label.toLowerCase()}`
      if (projectKeys.has(dedupeKey)) continue
      projectKeys.add(dedupeKey)
      const referenceId = entity ? getEntityReferenceId(entity) : null
      const relatedRecommendationIds = referenceId ? recommendationIdsByReferenceId.get(referenceId) ?? [] : []
      items.push(
        createPresentationItem({
          id: `mind-project-${node.id}`,
          title: node.label,
          kind: 'project',
          scopeTitle: node.label,
          status: node.state,
          tags: [],
          updatedAt: node.updatedAt,
          searchText: makeSearchText([node.label, node.nodeType, node.state]),
          summary: document ? excerpt(document.plainText ?? document.content ?? document.markdown) : '项目视图入口',
          path: `Dock / ${node.label}`,
          relatedObjects: [],
          riskCategories: inferRiskCategories({ kind: 'project', title: node.label, status: node.state, tags: [], entity }, riskMaps),
          relatedRecommendationIds,
          entity,
        }),
      )
      continue
    }
    if (['domain', 'topic', 'tag', 'question', 'insight'].includes(node.nodeType)) {
      const dedupeKey = `topic:${node.label.toLowerCase()}`
      if (topicKeys.has(dedupeKey)) continue
      topicKeys.add(dedupeKey)
      const referenceId = entity ? getEntityReferenceId(entity) : null
      const relatedRecommendationIds = referenceId ? recommendationIdsByReferenceId.get(referenceId) ?? [] : []
      items.push(
        createPresentationItem({
          id: `mind-topic-${node.id}`,
          title: node.label,
          kind: 'topic',
          scopeTitle,
          status: node.state,
          tags: [],
          updatedAt: node.updatedAt,
          searchText: makeSearchText([node.label, node.nodeType, node.state, scopeTitle]),
          summary: document ? excerpt(document.plainText ?? document.content ?? document.markdown) : '主题节点',
          path: scopeTitle ? `Dock / ${scopeTitle} / ${node.label}` : `Dock / Topic / ${node.label}`,
          relatedObjects: document ? [document.title] : [],
          riskCategories: inferRiskCategories({ kind: 'topic', title: node.label, status: node.state, tags: [], entity }, riskMaps),
          relatedRecommendationIds,
          entity,
        }),
      )
      continue
    }
    const referenceId = entity ? getEntityReferenceId(entity) : null
    const relatedRecommendationIds = referenceId ? recommendationIdsByReferenceId.get(referenceId) ?? [] : []
    items.push(
      createPresentationItem({
        id: `mind-node-${node.id}`,
        title: node.label,
        kind: 'mindNode',
        scopeTitle,
        status: node.state,
        tags: [],
        updatedAt: node.updatedAt,
        searchText: makeSearchText([node.label, node.nodeType, node.state, scopeTitle]),
        summary: document ? excerpt(document.plainText ?? document.content ?? document.markdown) : '知识图谱节点',
        path: scopeTitle ? `Dock / ${scopeTitle} / Mind` : 'Dock / Mind',
        relatedObjects: document ? [document.title] : [],
        riskCategories: inferRiskCategories({ kind: 'mindNode', title: node.label, status: node.state, tags: [], entity }, riskMaps),
        relatedRecommendationIds,
        entity,
      }),
    )
  }

  for (const entry of data.rawEntries) {
    const entity = data.entities.find((item) => item.entryId === entry.id)
    const referenceId = entity ? getEntityReferenceId(entity) : String(entry.id)
    const relatedRecommendationIds = referenceId ? recommendationIdsByReferenceId.get(referenceId) ?? [] : []
    items.push(
      createPresentationItem({
        id: `document-${entry.id}`,
        title: entry.title,
        kind: 'document',
        scopeTitle: entry.project,
        status: 'document',
        tags: entry.tags,
        updatedAt: entry.archivedAt ?? entry.createdAt,
        searchText: makeSearchText([entry.title, entry.project, entry.type, entry.plainText, entry.content, ...entry.tags]),
        summary: excerpt(entry.plainText ?? entry.content ?? entry.markdown),
        path: entry.project ? `Dock / ${entry.project} / ${entry.title}` : `Dock / Scatter / ${entry.title}`,
        relatedObjects: entry.tags.slice(0, 3),
        riskCategories: inferRiskCategories({ kind: 'document', title: entry.title, status: 'document', tags: entry.tags, entity }, riskMaps),
        relatedRecommendationIds,
        entity,
      }),
    )
  }

  for (const draft of data.rawDrafts.filter((item) => item.status === 'active')) {
    const entity = data.entities.find((item) => item.draftId === draft.id)
    const referenceId = entity ? getEntityReferenceId(entity) : String(draft.id)
    const relatedRecommendationIds = referenceId ? recommendationIdsByReferenceId.get(referenceId) ?? [] : []
    items.push(
      createPresentationItem({
        id: `draft-${draft.id}`,
        title: draft.title,
        kind: 'draft',
        scopeTitle: draft.project,
        status: draft.status,
        tags: draft.tags ?? [],
        updatedAt: draft.updatedAt,
        searchText: makeSearchText([draft.title, draft.project, draft.plainText, draft.content, ...(draft.tags ?? [])]),
        summary: excerpt(draft.plainText ?? draft.content ?? draft.markdown),
        path: draft.project ? `Dock / ${draft.project} / Draft / ${draft.title}` : `Dock / Scatter / ${draft.title}`,
        relatedObjects: (draft.tags ?? []).slice(0, 3),
        riskCategories: inferRiskCategories({ kind: 'draft', title: draft.title, status: draft.status, tags: draft.tags ?? [], entity }, riskMaps),
        relatedRecommendationIds,
        entity,
      }),
    )
  }

  for (const tip of data.rawTips) {
    const entity = data.entities.find((item) => item.tipId === tip.id)
    const referenceId = entity ? getEntityReferenceId(entity) : String(tip.id)
    const relatedRecommendationIds = referenceId ? recommendationIdsByReferenceId.get(referenceId) ?? [] : []
    items.push(
      createPresentationItem({
        id: `signal-${tip.id}`,
        title: excerpt(tip.content, 42),
        kind: 'signal',
        scopeTitle: null,
        status: tip.status,
        tags: [],
        updatedAt: tip.updatedAt,
        searchText: makeSearchText([tip.content, tip.sourceType, tip.status]),
        summary: excerpt(tip.content),
        path: 'Dock / 知识流 / Signal',
        relatedObjects: [],
        riskCategories: inferRiskCategories({ kind: 'signal', title: tip.content, status: tip.status, tags: [], entity }, riskMaps),
        relatedRecommendationIds,
        entity,
      }),
    )
  }

  for (const recommendation of data.recommendations) {
    const relatedRecommendationIds = [recommendation.id]
    const subjectLabel = getRecommendationSubjectLabel(recommendation, entityByReferenceId)
    const scopeTitle = getRecommendationScope(recommendation, entityByReferenceId)
    items.push(
      createPresentationItem({
        id: `recommendation-${recommendation.id}`,
        title: recommendation.action,
        kind: 'recommendation',
        scopeTitle,
        status: recommendation.status,
        tags: [],
        updatedAt: recommendation.scoreSummary?.score ? new Date() : null,
        searchText: makeSearchText([recommendation.action, recommendation.target, recommendation.reasonSummary.reason, subjectLabel, scopeTitle]),
        summary: `${recommendation.reasonSummary.reason} · ${recommendation.impact}`,
        path: scopeTitle ? `Dock / ${scopeTitle} / Recommendation` : 'Dock / 推荐队列',
        relatedObjects: [subjectLabel, recommendation.target].filter(Boolean),
        riskCategories: [],
        relatedRecommendationIds,
        recommendationStatus: recommendation.status,
        recommendation,
      }),
    )
  }

  const riskScopes = new Set(
    items
      .filter((item) => item.isRisk)
      .flatMap((item) => [item.scopeTitle, item.kind === 'project' || item.kind === 'topic' ? item.title : null])
      .filter((value): value is string => Boolean(value)),
  )
  const recommendationScopes = new Set(
    items
      .filter((item) => item.isRecommendationBacked || item.kind === 'recommendation')
      .flatMap((item) => [item.scopeTitle])
      .filter((value): value is string => Boolean(value)),
  )

  return items.map((item) => {
    const scopeRisk = item.kind === 'project' || item.kind === 'topic' ? riskScopes.has(item.title) : false
    const scopeRecommendation = item.kind === 'project' || item.kind === 'topic' ? recommendationScopes.has(item.title) : false
    const next = {
      ...item,
      isRisk: item.isRisk || scopeRisk,
      isRecommendationBacked: item.relatedRecommendationIds.length > 0 || scopeRecommendation,
    }
    return {
      ...next,
      navBuckets: inferNavBuckets(next),
      warRoomStage: deriveWarRoomStage(next, riskScopes, recommendationScopes),
    }
  })
}

export function applyDockSharedFilters(items: DockPresentationItem[], filters: DockSharedFilterState): DockPresentationItem[] {
  const query = filters.query.trim().toLowerCase()
  const now = Date.now()
  const maxAgeMs =
    filters.timeRange === '24h'
      ? 24 * 60 * 60 * 1000
      : filters.timeRange === '7d'
        ? 7 * 24 * 60 * 60 * 1000
        : filters.timeRange === '30d'
          ? 30 * 24 * 60 * 60 * 1000
          : null

  return items.filter((item) => {
    if (query && !item.searchText.includes(query)) return false
    if (filters.itemKinds.length > 0 && !filters.itemKinds.includes(item.kind)) return false
    if (filters.statuses.length > 0 && !filters.statuses.includes(item.status)) return false
    if (filters.tags.length > 0 && !filters.tags.some((tag) => item.tags.includes(tag))) return false
    if (filters.moreFilter === 'recommendationBacked' && !item.isRecommendationBacked) return false
    if (filters.moreFilter === 'unscoped' && item.scopeTitle) return false
    if (filters.moreFilter === 'risks' && !item.isRisk) return false
    if (filters.selectedScope) {
      const selectedScopeKey = normalizeScopeKey(filters.selectedScope)
      const itemScopeKey = normalizeScopeKey(item.scopeTitle)
      const itemTitleKey = normalizeScopeKey(item.title)
      if (itemScopeKey !== selectedScopeKey && itemTitleKey !== selectedScopeKey) {
        return false
      }
    }
    if (filters.healthFilter && filters.healthFilter !== 'summary' && !item.riskCategories.includes(filters.healthFilter)) {
      return false
    }
    if (maxAgeMs != null) {
      const updatedAt = item.updatedAt?.getTime() ?? 0
      if (updatedAt < now - maxAgeMs) return false
    }
    return true
  })
}

export function itemMatchesNavigation(item: DockPresentationItem, navigationMode: DockNavigationMode, includeArchive = false): boolean {
  if (navigationMode === 'libraryOverview') {
    return includeArchive ? item.navBuckets.includes('libraryOverview') || item.isArchiveEvidence : item.navBuckets.includes('libraryOverview')
  }
  if (navigationMode === 'customViews') return false
  return item.navBuckets.includes(navigationMode)
}

export function getNavigationItems(
  items: DockPresentationItem[],
  navigationMode: DockNavigationMode,
  includeArchive = false,
): DockPresentationItem[] {
  return items.filter((item) => itemMatchesNavigation(item, navigationMode, includeArchive))
}

export function buildNavigationCounts(
  items: DockPresentationItem[],
  includeArchive = false,
): Record<DockNavigationMode, number> {
  return {
    libraryOverview: getNavigationItems(items, 'libraryOverview', includeArchive).length,
    warRoom: getNavigationItems(items, 'warRoom', includeArchive).length,
    knowledgeFlow: getNavigationItems(items, 'knowledgeFlow', includeArchive).length,
    inbox: getNavigationItems(items, 'inbox', includeArchive).length,
    recommendationQueue: getNavigationItems(items, 'recommendationQueue', includeArchive).length,
    healthRisks: getNavigationItems(items, 'healthRisks', includeArchive).length,
    archiveEvidence: getNavigationItems(items, 'archiveEvidence', includeArchive).length,
    customViews: 0,
  }
}

export function sortDockItems(
  items: DockPresentationItem[],
  sortMode: 'updatedAt' | 'healthScore' | 'type',
): DockPresentationItem[] {
  const sorted = [...items]
  if (sortMode === 'type') {
    sorted.sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title))
    return sorted
  }
  if (sortMode === 'healthScore') {
    sorted.sort((a, b) => Number(b.isRisk) - Number(a.isRisk) || (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
    return sorted
  }
  sorted.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
  return sorted
}

export function getDockKindLabel(kind: DockPresentationKind): string {
  switch (kind) {
    case 'project':
      return 'Project'
    case 'topic':
      return 'Topic'
    case 'document':
      return 'Document'
    case 'signal':
      return 'Signal'
    case 'draft':
      return 'Draft'
    case 'mindNode':
      return 'Mind Node'
    case 'recommendation':
      return 'Recommendation'
    case 'archiveEvidence':
      return 'Archive Evidence'
  }
}

export function getDockPrimaryActionLabel(action: DockPrimaryAction): string {
  switch (action) {
    case 'open':
      return '打开'
    case 'openInEditor':
      return '在 Editor 中打开'
    case 'openInMind':
      return '在 Mind 中查看'
    case 'review':
      return '查看建议'
    case 'organize':
      return '整理'
    case 'continueEditing':
      return '继续编辑'
  }
}
