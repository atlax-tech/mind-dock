import {
  buildEntryFromArchive,
  buildDockItemReset,
  buildEntryAndDockPatches,
  buildProvenanceAsync,
  buildStructureProjection,
  backfillEntryTagRelations,
  backfillProjectCollections,
  canTransition,
  computeTemporalKeys,
  createTag,
  dedupeTagNames,
  extractDocumentTitle,
  generateSuggestions,
  validateCaptureInput,
  makeCollectionId,
  makeEntryRelationId,
  makeEntryTagRelationId,
  makeKnowledgeEventId,
  makeMindEdgeId,
  makeMindNodeId,
  makeRecentDocumentId,
  makeRecommendationId,
  makeRecommendationEventId,
  generateBasicCandidates as buildBasicCandidates,
  scoreBasicCandidatesForRecommendation,
  makeTemporalActivityId,
  makeTagId,
  makeUserBehaviorEventId,
  makeWorkspaceSessionId,
  makeWorkspaceTabId,
  normalizeTagName,
  queryEntriesByDate,
  queryMonthOverview,
  validateChainLinkWithContext,
  validateEntryRelationInput,
  type CalendarDayResult,
  type CalendarMonthOverview,
  type ChainProvenance,
  type Collection,
  type CollectionType,
  type CaptureToDocumentInput,
  type CaptureToDocumentResult,
  type DocumentUpdateInput,
  type EntryRelationType,
  type EntryStatus,
  type KnowledgeEventType,
  type KnowledgeEventTargetType,
  type MindEdgeType,
  type MindNodeType,
  type MindNodeState,
  type RecommendationCreateInput,
  type BasicCandidate,
  type BasicCandidateContext,
  type RecommendationFeedbackInput,
  type RecommendationFeedbackResult,
  type RecommendationShownInput,
  type RecommendationShownResult,
  type RecommendationStatus,
  type RecommendationSubjectType,
  type RecommendationCandidateType,
  type RecommendationEventType,
  type RecommendationEventInput,
  type RecommendationSignalSummary,
  type ScoredRecommendationCandidate,
  type UserBehaviorEventType,
  type UserBehaviorSubjectType,
  type UserBehaviorEventInput,
  feedbackTypeToStatus,
  feedbackTypeToEventType,
  isSupportedCandidateTypeForApply,
  isRecommendationPendingStatus,
  makeRecommendationDedupeKey,
  type RelationDirection,
  type RelationSource,
  type SourceType,
  type StructureProjection,
  type TabType,
  type TagRelationSource,
  type TemporalActivityType,
  type TemporalActivityEntityType,
  type WidgetType,
} from '@atlax/domain'

import type {
  DockItem as DomainDockItem,
  ChatMessage,
  ChatSessionCreateInput,
  ChatSessionUpdateInput,
} from '@atlax/domain/ports'
import { isValidChatSessionInput } from '@atlax/domain/ports'

import {
  db,
  chatSessionsTable,
  collectionsTable,
  entriesTable,
  entryRelationsTable,
  entryTagRelationsTable,
  dockItemsTable,
  knowledgeEventsTable,
  mindNodesTable,
  mindEdgesTable,
  recentDocumentsTable,
  recommendationEventsTable,
  recommendationsTable,
  tagsTable,
  temporalActivitiesTable,
  userBehaviorEventsTable,
  widgetsTable,
  workspaceOpenTabsTable,
  workspaceSessionsTable,
  editorDraftsTable,
  tipsTable,
  type ChatSessionRecord,
  type CollectionRecord,
  type EntryRecord,
  type EntryRelationRecord,
  type EntryTagRelationRecord,
  type DockItemRecord,
  type KnowledgeEventRecord,
  type MindNodeRecord,
  type MindEdgeRecord,
  type RecentDocumentRecord,
  type RecommendationRecord,
  type RecommendationEventRecord,
  type TemporalActivityRecord,
  type UserBehaviorEventRecord,
  type WorkspaceOpenTabRecord,
  type WorkspaceSessionRecord,
  type EditorDraftRecord,
  type TipRecord,
  type TipSourceType,
  type TipStatus,
  type PersistedTip,
  type PersistedDockItem,
  type PersistedEntry,
  type PersistedDocument,
  type PersistedChatSession,
  type PersistedCollection,
  type PersistedEntryRelation,
  type PersistedEntryTagRelation,
  type PersistedKnowledgeEvent,
  type PersistedMindNode,
  type PersistedMindEdge,
  type PersistedRecentDocument,
  type PersistedRecommendation,
  type PersistedRecommendationEvent,
  type PersistedTag,
  type PersistedTemporalActivity,
  type PersistedUserBehaviorEvent,
  type PersistedWidget,
  type PersistedWorkspaceOpenTab,
  type PersistedWorkspaceSession,
  type PersistedEditorDraft,
  type DraftStatus,
  type DraftSourceType,
  type TagRecord,
  type WidgetRecord,
} from './db'

export type DockItem = DomainDockItem
export type { PersistedEntry as StoredEntry }
export type { PersistedDocument as StoredDocument }
export type { PersistedTag as StoredTag }
export type { PersistedWidget as StoredWidget }
export type { PersistedCollection as StoredCollection }
export type { PersistedEntryTagRelation as StoredEntryTagRelation }
export type { PersistedEntryRelation as StoredEntryRelation }
export type { PersistedKnowledgeEvent as StoredKnowledgeEvent }
export type { PersistedTemporalActivity as StoredTemporalActivity }
export type { PersistedMindNode as StoredMindNode }
export type { PersistedMindEdge as StoredMindEdge }
export type { PersistedWorkspaceSession as StoredWorkspaceSession }
export type { PersistedWorkspaceOpenTab as StoredWorkspaceOpenTab }
export type { PersistedRecentDocument as StoredRecentDocument }
export type { PersistedRecommendation as StoredRecommendation }
export type { PersistedRecommendationEvent as StoredRecommendationEvent }
export type { PersistedUserBehaviorEvent as StoredUserBehaviorEvent }
export type { PersistedEditorDraft as StoredDraft }
export type { PersistedTip as StoredTip }
export type { TipSourceType, TipStatus }
export type { DraftStatus }
export type { DraftSourceType }
export type { ChainProvenance }
export type { CalendarDayResult }
export type { CalendarMonthOverview }
export type { StructureProjection }

export type RecommendationDockQueueSortBy = 'rank' | 'confidenceScore' | 'createdAt'
export type RecommendationDockQueueSortDirection = 'asc' | 'desc'

export interface RecommendationDockQueueFilters {
  status?: RecommendationStatus
  candidateType?: RecommendationCandidateType
  subjectType?: RecommendationSubjectType
  subjectId?: number | string
  recommendationType?: string
}

export interface RecommendationDockQueueQuery extends RecommendationDockQueueFilters {
  sortBy?: RecommendationDockQueueSortBy
  sortDirection?: RecommendationDockQueueSortDirection
  limit?: number
  cursor?: string | null
}

export interface RecommendationReasonSummary {
  source: string | null
  reason: string
  context: {
    subjectType: RecommendationSubjectType
    subjectId: number | string
  }
  candidate: {
    candidateType: RecommendationCandidateType
    candidateId: string
  }
}

export interface RecommendationScoreSummary {
  confidenceScore: number
  score: number
  rank: number | null
  scoreReason: string | null
  scoreBreakdown: Record<string, unknown> | null
}

export interface RecommendationDockQueueEvidenceSummary {
  evidenceCount: number
  sources: string[]
  evidenceTypes: string[]
  matchedValues: string[]
  strongestContribution: number | null
}

export interface RecommendationDockQueueItem {
  id: string
  userId: string
  status: RecommendationStatus
  recommendationType: string
  subjectType: RecommendationSubjectType
  subjectId: number | string
  candidateType: RecommendationCandidateType
  candidateId: string
  confidenceScore: number
  createdAt: Date
  updatedAt: Date
  reasonSummary: RecommendationReasonSummary
  scoreSummary: RecommendationScoreSummary
  evidenceSummary: RecommendationDockQueueEvidenceSummary
  isShown: boolean
  hasFeedback: boolean
}

export interface RecommendationDockQueueResult {
  items: RecommendationDockQueueItem[]
  nextCursor: string | null
  total: number
}

export async function resolveRecommendationCandidate(
  userId: string, 
  type: RecommendationCandidateType, 
  id: string
): Promise<{ title: string; type: string } | null> {
  try {
    switch (type) {
      case 'mindNode': {
        const node = await mindNodesTable.get(id);
        return node && node.userId === userId ? { title: node.label, type: node.nodeType } : null;
      }
      case 'entry': {
        const entry = await entriesTable.get(Number(id));
        return entry && entry.userId === userId ? { title: entry.title, type: entry.type } : null;
      }
      case 'document': {
        // Document candidates usually point to entries or dock items that are documents
        const doc = await entriesTable.get(Number(id));
        return doc && doc.userId === userId ? { title: doc.title, type: 'document' } : null;
      }
      case 'dockItem': {
        const item = await dockItemsTable.get(Number(id));
        return item && item.userId === userId ? { title: item.topic || item.rawText?.slice(0, 40) || `Dock Item #${id}`, type: item.sourceType } : null;
      }
      case 'tag': {
        const tag = await tagsTable.get(id);
        return tag && tag.userId === userId ? { title: tag.name, type: 'tag' } : null;
      }
      case 'project': {
        const collection = await collectionsTable.get(id);
        return collection && collection.userId === userId ? { title: collection.name, type: collection.collectionType } : null;
      }
      default:
        return null;
    }
  } catch (err) {
    console.error('Error resolving candidate:', err);
    return null;
  }
}

function toPersistedDockItem(item: DockItemRecord | undefined): PersistedDockItem | null {
  if (!item || typeof item.id !== 'number') {
    return null
  }

  return {
    ...item,
    id: item.id,
    userTags: item.userTags ?? [],
    selectedActions: item.selectedActions ?? [],
    selectedProject: item.selectedProject ?? null,
    sourceId: item.sourceId ?? null,
    parentId: item.parentId ?? null,
  }
}

function toPersistedTag(tag: TagRecord | undefined): PersistedTag | null {
  if (!tag || !tag.id) {
    return null
  }

  return {
    ...tag,
    id: tag.id,
  }
}

function toPersistedEntry(entry: EntryRecord | undefined): PersistedEntry | null {
  if (!entry || typeof entry.id !== 'number') {
    return null
  }

  return {
    ...entry,
    id: entry.id,
  }
}

async function getPersistedDockItem(id: number): Promise<PersistedDockItem | null> {
  const item = await dockItemsTable.get(id)
  return toPersistedDockItem(item)
}

async function getDockItemForUser(userId: string, id: number): Promise<PersistedDockItem | null> {
  const item = await getPersistedDockItem(id)
  if (!item) return null
  if (item.userId !== userId) return null
  return item
}

export async function createDockItem(
  userId: string,
  rawText: string,
  sourceType: SourceType = 'text',
  options?: { sourceId?: number | null; parentId?: number | null; topic?: string | null },
): Promise<number> {
  const sourceId = options?.sourceId ?? null
  const parentId = options?.parentId ?? null

  if (sourceId !== null || parentId !== null) {
    const validation = await validateChainLinkWithContext({
      currentItemId: -1,
      userId,
      sourceId,
      parentId,
      findItemById: (uid, itemId) => getDockItemForUser(uid, itemId),
    })
    if (!validation.valid) {
      throw new Error(`createDockItem: invalid chain links - ${validation.reason}`)
    }
  }

  const id = await dockItemsTable.add({
    userId,
    rawText,
    topic: options?.topic ?? null,
    sourceType,
    status: 'pending',
    suggestions: [],
    userTags: [],
    selectedActions: [],
    selectedProject: null,
    sourceId: options?.sourceId ?? null,
    parentId: options?.parentId ?? null,
    processedAt: null,
    createdAt: new Date(),
  })
  return id as number
}

export async function listDockItems(userId: string): Promise<PersistedDockItem[]> {
  const items = await dockItemsTable.where('userId').equals(userId).reverse().sortBy('createdAt')

  return items.flatMap((item) => {
    const persistedItem = toPersistedDockItem(item)
    return persistedItem ? [persistedItem] : []
  })
}

export async function listItemsByStatus(userId: string, status: EntryStatus): Promise<PersistedDockItem[]> {
  const all = await dockItemsTable.where('userId').equals(userId).toArray()
  const filtered = all.filter((i) => i.status === status)

  return filtered.flatMap((item) => {
    const persistedItem = toPersistedDockItem(item)
    return persistedItem ? [persistedItem] : []
  })
}

export async function countDockItems(userId: string): Promise<number> {
  return dockItemsTable.where('userId').equals(userId).count()
}

export async function listArchivedEntries(userId: string): Promise<PersistedEntry[]> {
  const all = await entriesTable.where('userId').equals(userId).reverse().sortBy('archivedAt')

  return all.flatMap((entry) => {
    const persistedEntry = toPersistedEntry(entry)
    return persistedEntry ? [persistedEntry] : []
  })
}

export async function listArchivedEntriesByType(userId: string, type: string): Promise<PersistedEntry[]> {
  const all = await entriesTable.where('userId').equals(userId).and((e) => e.type === type).reverse().sortBy('archivedAt')
  return all.flatMap((entry) => {
    const persistedEntry = toPersistedEntry(entry)
    return persistedEntry ? [persistedEntry] : []
  })
}

export async function listArchivedEntriesByTag(userId: string, tag: string): Promise<PersistedEntry[]> {
  const normalized = normalizeTagName(tag).toLowerCase()
  const all = await entriesTable.where('userId').equals(userId).and((e) =>
    e.tags.some((t: string) => normalizeTagName(t).toLowerCase() === normalized)
  ).reverse().sortBy('archivedAt')
  return all.flatMap((entry) => {
    const persistedEntry = toPersistedEntry(entry)
    return persistedEntry ? [persistedEntry] : []
  })
}

export async function listArchivedEntriesByProject(userId: string, project: string): Promise<PersistedEntry[]> {
  const all = await entriesTable.where('userId').equals(userId).and((e) => e.project === project).reverse().sortBy('archivedAt')
  return all.flatMap((entry) => {
    const persistedEntry = toPersistedEntry(entry)
    return persistedEntry ? [persistedEntry] : []
  })
}

export async function getWorkspaceStats(userId: string): Promise<{
  totalEntries: number
  pendingCount: number
  suggestedCount: number
  archivedCount: number
  ignoredCount: number
  reopenedCount: number
  tagCount: number
}> {
  const [allDockItems, allEntries, allTags] = await Promise.all([
    dockItemsTable.where('userId').equals(userId).toArray(),
    entriesTable.where('userId').equals(userId).count(),
    tagsTable.where('userId').equals(userId).count(),
  ])

  return {
    totalEntries: allEntries,
    pendingCount: allDockItems.filter((i) => i.status === 'pending').length,
    suggestedCount: allDockItems.filter((i) => i.status === 'suggested').length,
    archivedCount: allDockItems.filter((i) => i.status === 'archived').length,
    ignoredCount: allDockItems.filter((i) => i.status === 'ignored').length,
    reopenedCount: allDockItems.filter((i) => i.status === 'reopened').length,
    tagCount: allTags,
  }
}

export async function getEntryByDockItemId(userId: string, dockItemId: number): Promise<PersistedEntry | null> {
  const entry = await entriesTable.where('userId').equals(userId).and((e) => e.sourceDockItemId === dockItemId).first()
  return toPersistedEntry(entry)
}

export async function suggestItem(userId: string, id: number): Promise<PersistedDockItem | null> {
  const item = await getDockItemForUser(userId, id)
  if (!item) return null
  if (!canTransition(item.status, 'suggested')) return null

  const result = generateSuggestions(item)
  await dockItemsTable.update(id, {
    status: 'suggested',
    suggestions: result.suggestions,
    processedAt: new Date(),
  })

  return getPersistedDockItem(id)
}

export async function archiveItem(userId: string, id: number): Promise<PersistedDockItem | null> {
  const item = await getDockItemForUser(userId, id)
  if (!item) return null
  if (!canTransition(item.status, 'archived')) return null

  const built = buildEntryFromArchive(
    {
      dockItemId: id,
      rawText: item.rawText,
      topic: item.topic,
      suggestions: item.suggestions,
      userTags: item.userTags,
      selectedProject: item.selectedProject,
      selectedActions: item.selectedActions,
      createdAt: item.createdAt,
    },
    0,
  )

  const existing = await getEntryByDockItemId(userId, id)
  if (existing) {
    await entriesTable.update(existing.id, {
      title: built.title,
      content: built.content,
      type: built.type,
      tags: built.tags,
      project: built.project,
      actions: built.actions,
      archivedAt: built.archivedAt,
    })
    await dockItemsTable.update(id, {
      status: 'archived',
      processedAt: new Date(),
    })
    return getPersistedDockItem(id)
  }

  await entriesTable.add({
    userId,
    sourceDockItemId: id,
    title: built.title,
    content: built.content,
    type: built.type,
    tags: built.tags,
    project: built.project,
    actions: built.actions,
    createdAt: built.createdAt,
    archivedAt: built.archivedAt,
  })

  await dockItemsTable.update(id, {
    status: 'archived',
    processedAt: new Date(),
  })

  return getPersistedDockItem(id)
}

export async function ignoreItem(userId: string, id: number): Promise<PersistedDockItem | null> {
  const item = await getDockItemForUser(userId, id)
  if (!item) return null
  if (!canTransition(item.status, 'ignored')) return null

  await dockItemsTable.update(id, {
    status: 'ignored',
    processedAt: new Date(),
  })

  return getPersistedDockItem(id)
}

export async function restoreItem(userId: string, id: number): Promise<PersistedDockItem | null> {
  const item = await getDockItemForUser(userId, id)
  if (!item) return null
  if (!canTransition(item.status, 'pending')) return null

  await dockItemsTable.update(id, {
    status: 'pending',
    suggestions: [],
    processedAt: null,
  })

  return getPersistedDockItem(id)
}

export async function reopenItem(userId: string, id: number): Promise<PersistedDockItem | null> {
  const item = await getDockItemForUser(userId, id)
  if (!item) return null
  if (!canTransition(item.status, 'reopened')) return null

  const archivedEntry = await getEntryByDockItemId(userId, id)

  if (archivedEntry) {
    await dockItemsTable.update(id, {
      status: 'reopened',
      userTags: archivedEntry.tags,
      selectedProject: archivedEntry.project,
      selectedActions: archivedEntry.actions,
      processedAt: item.processedAt,
    })
  } else {
    await dockItemsTable.update(id, {
      status: 'reopened',
      processedAt: null,
    })
  }

  return getPersistedDockItem(id)
}

export async function updateDockItemText(
  userId: string,
  id: number,
  rawText: string,
  topic?: string | null,
): Promise<PersistedDockItem | null> {
  const item = await getDockItemForUser(userId, id)
  if (!item) return null

  if (item.status === 'archived') {
    const updateData: Partial<DockItemRecord> = { rawText }
    if (topic !== undefined) {
      updateData.topic = topic
    }
    await dockItemsTable.update(id, updateData)
    return getPersistedDockItem(id)
  }

  const resetFields = buildDockItemReset({ dockItemId: id, newText: rawText })
  const updateData: Partial<DockItemRecord> = { ...resetFields }
  if (topic !== undefined) {
    updateData.topic = topic
  }

  await dockItemsTable.update(id, updateData)

  return getPersistedDockItem(id)
}

export async function updateItemTags(userId: string, id: number, userTags: string[]): Promise<PersistedDockItem | null> {
  const item = await getDockItemForUser(userId, id)
  if (!item) return null

  await dockItemsTable.update(id, {
    userTags,
  })

  return getPersistedDockItem(id)
}

export async function updateSelectedActions(userId: string, id: number, actions: string[]): Promise<PersistedDockItem | null> {
  const item = await getDockItemForUser(userId, id)
  if (!item) return null

  await dockItemsTable.update(id, {
    selectedActions: actions,
  })

  return getPersistedDockItem(id)
}

export async function updateSelectedProject(userId: string, id: number, project: string | null): Promise<PersistedDockItem | null> {
  const item = await getDockItemForUser(userId, id)
  if (!item) return null

  await dockItemsTable.update(id, {
    selectedProject: project,
  })

  return getPersistedDockItem(id)
}

export async function updateChainLinks(userId: string, id: number, sourceId: number | null, parentId: number | null): Promise<PersistedDockItem | null> {
  const item = await getDockItemForUser(userId, id)
  if (!item) return null

  const validation = await validateChainLinkWithContext({
    currentItemId: id,
    userId,
    sourceId,
    parentId,
    findItemById: (uid, itemId) => getDockItemForUser(uid, itemId),
  })

  if (!validation.valid) {
    return null
  }

  await dockItemsTable.update(id, {
    sourceId,
    parentId,
  })

  return getPersistedDockItem(id)
}

export async function getChainProvenance(userId: string, id: number): Promise<ChainProvenance | null> {
  const item = await getDockItemForUser(userId, id)
  if (!item) return null

  return buildProvenanceAsync(item, async (lookupId) => {
    const found = await dockItemsTable.get(lookupId)
    if (!found || found.userId !== userId) return null
    return found
  })
}

export async function addTagToItem(userId: string, id: number, tagName: string): Promise<PersistedDockItem | null> {
  const item = await getDockItemForUser(userId, id)
  if (!item) return null

  const normalized = normalizeTagName(tagName)
  if (!normalized) return item

  const newTags = dedupeTagNames([...item.userTags, normalized])
  return updateItemTags(userId, id, newTags)
}

export async function removeTagFromItem(userId: string, id: number, tagName: string): Promise<PersistedDockItem | null> {
  const item = await getDockItemForUser(userId, id)
  if (!item) return null

  const normalized = normalizeTagName(tagName)
  const newTags = item.userTags.filter((t) => normalizeTagName(t).toLowerCase() !== normalized.toLowerCase())
  return updateItemTags(userId, id, newTags)
}

export async function listTags(userId: string): Promise<PersistedTag[]> {
  const tags = await tagsTable.where('userId').equals(userId).sortBy('name')

  return tags.flatMap((tag) => {
    const persistedTag = toPersistedTag(tag)
    return persistedTag ? [persistedTag] : []
  })
}

async function findTagByName(userId: string, name: string): Promise<PersistedTag | null> {
  const normalized = normalizeTagName(name).toLowerCase()
  const tag = await tagsTable.where('userId').equals(userId).and((t) => normalizeTagName(t.name).toLowerCase() === normalized).first()
  return toPersistedTag(tag)
}

function makeUserScopedTagId(userId: string, name: string): string {
  return `${userId}_${makeTagId(name)}`
}

export async function createStoredTag(userId: string, name: string): Promise<PersistedTag | null> {
  const tag = createTag(name)
  if (!tag) return null

  const existing = await findTagByName(userId, name)
  if (existing) return existing

  const scopedId = makeUserScopedTagId(userId, name)
  await tagsTable.add({
    id: scopedId,
    userId,
    name: tag.name,
    createdAt: tag.createdAt,
  })

  return toPersistedTag(await tagsTable.get(scopedId))
}

export async function getOrCreateTag(userId: string, name: string): Promise<PersistedTag | null> {
  const existing = await findTagByName(userId, name)
  if (existing) return existing

  return createStoredTag(userId, name)
}

export async function updateArchivedEntry(
  userId: string,
  entryId: number,
  updates: { tags?: string[]; project?: string | null; content?: string; title?: string },
): Promise<PersistedEntry | null> {
  const entry = await entriesTable.get(entryId)
  if (!entry || entry.userId !== userId) return null

  const { entryPatch, dockSyncPatch } = buildEntryAndDockPatches(updates, entry.sourceDockItemId)

  if (entryPatch && Object.keys(entryPatch).length > 0) {
    await entriesTable.update(entryId, entryPatch)
  }

  if (dockSyncPatch) {
    const dockItem = await getPersistedDockItem(dockSyncPatch.sourceDockItemId)
    if (dockItem && dockItem.userId === userId) {
      await dockItemsTable.update(dockSyncPatch.sourceDockItemId, {
        userTags: dockSyncPatch.userTags,
      })
    }
  }

  return toPersistedEntry(await entriesTable.get(entryId))
}

function toPersistedChatSession(session: ChatSessionRecord | undefined): PersistedChatSession | null {
  if (!session || typeof session.id !== 'number') {
    return null
  }

  return {
    ...session,
    id: session.id,
    title: session.title ?? null,
    pinned: session.pinned ?? false,
    messages: session.messages ?? [],
    dockItemId: session.dockItemId ?? null,
  }
}

async function getChatSessionForUser(userId: string, id: number): Promise<PersistedChatSession | null> {
  const session = await chatSessionsTable.get(id)
  if (!session || session.userId !== userId) {
    return null
  }
  return toPersistedChatSession(session)
}

export async function createChatSession(input: ChatSessionCreateInput): Promise<PersistedChatSession | null> {
  if (!isValidChatSessionInput(input)) {
    return null
  }

  const now = new Date()
  const id = await chatSessionsTable.add({
    userId: input.userId,
    title: input.title ?? null,
    topic: input.topic ?? null,
    selectedType: input.selectedType ?? null,
    content: input.content ?? '',
    status: 'active',
    pinned: input.pinned ?? false,
    messages: input.messages ?? [],
    dockItemId: input.dockItemId ?? null,
    createdAt: now,
    updatedAt: now,
  })

  return toPersistedChatSession(await chatSessionsTable.get(id as number))
}

export async function getChatSession(userId: string, id: number): Promise<PersistedChatSession | null> {
  return getChatSessionForUser(userId, id)
}

export async function listChatSessions(userId: string): Promise<PersistedChatSession[]> {
  const sessions = await chatSessionsTable.where('userId').equals(userId).toArray()

  const sorted = sessions.sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  return sorted.flatMap((session) => {
    const persisted = toPersistedChatSession(session)
    return persisted ? [persisted] : []
  })
}

export async function listActiveChatSessions(userId: string): Promise<PersistedChatSession[]> {
  const sessions = await chatSessionsTable
    .where('userId')
    .equals(userId)
    .and((s) => s.status === 'active')
    .toArray()

  const sorted = sessions.sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  return sorted.flatMap((session) => {
    const persisted = toPersistedChatSession(session)
    return persisted ? [persisted] : []
  })
}

export async function updateChatSession(
  userId: string,
  id: number,
  updates: ChatSessionUpdateInput,
): Promise<PersistedChatSession | null> {
  const session = await getChatSessionForUser(userId, id)
  if (!session) return null

  const patch: Partial<ChatSessionRecord> = {
    ...updates,
    updatedAt: new Date(),
  }

  await chatSessionsTable.update(id, patch)

  return toPersistedChatSession(await chatSessionsTable.get(id))
}

export async function pinChatSession(userId: string, id: number): Promise<PersistedChatSession | null> {
  const session = await getChatSessionForUser(userId, id)
  if (!session) return null

  await chatSessionsTable.update(id, {
    pinned: true,
    updatedAt: new Date(),
  })

  return toPersistedChatSession(await chatSessionsTable.get(id))
}

export async function unpinChatSession(userId: string, id: number): Promise<PersistedChatSession | null> {
  const session = await getChatSessionForUser(userId, id)
  if (!session) return null

  await chatSessionsTable.update(id, {
    pinned: false,
    updatedAt: new Date(),
  })

  return toPersistedChatSession(await chatSessionsTable.get(id))
}

export async function deleteChatSession(userId: string, id: number): Promise<boolean> {
  const session = await getChatSessionForUser(userId, id)
  if (!session) return false

  await chatSessionsTable.delete(id)
  return true
}

export async function addChatMessage(
  userId: string,
  id: number,
  message: ChatMessage,
): Promise<PersistedChatSession | null> {
  const session = await getChatSessionForUser(userId, id)
  if (!session) return null

  const updatedMessages = [...session.messages, message]

  await chatSessionsTable.update(id, {
    messages: updatedMessages,
    updatedAt: new Date(),
  })

  return toPersistedChatSession(await chatSessionsTable.get(id))
}

export async function confirmChatSession(
  userId: string,
  id: number,
  content: string,
  topic: string | null,
  type: string | null,
): Promise<{ session: PersistedChatSession | null; dockItemId: number | null }> {
  const session = await getChatSessionForUser(userId, id)
  if (!session) return { session: null, dockItemId: null }

  let boundDockItemId: number | null = session.dockItemId

  if (session.dockItemId !== null) {
    const existingItem = await getDockItemForUser(userId, session.dockItemId)
    if (existingItem) {
      // Update text/topic if changed
      if (existingItem.rawText !== content || existingItem.topic !== topic) {
        await updateDockItemText(userId, session.dockItemId, content, topic)
      }
      // Update tags if type provided
      if (type) {
        await createStoredTag(userId, type)
        await updateItemTags(userId, session.dockItemId, [type])
      }
    } else {
      boundDockItemId = await createDockItem(userId, content, 'chat', { topic })
      if (type) {
        await createStoredTag(userId, type)
        await addTagToItem(userId, boundDockItemId, type)
      }
    }
  } else {
    boundDockItemId = await createDockItem(userId, content, 'chat', { topic })
    if (type) {
      await createStoredTag(userId, type)
      await addTagToItem(userId, boundDockItemId, type)
    }
  }

  await chatSessionsTable.update(id, {
    status: 'confirmed',
    topic,
    selectedType: type,
    content,
    dockItemId: boundDockItemId,
    updatedAt: new Date(),
  })

  return {
    session: toPersistedChatSession(await chatSessionsTable.get(id)),
    dockItemId: boundDockItemId,
  }
}

function toPersistedWidget(widget: WidgetRecord | undefined): PersistedWidget | null {
  if (!widget || typeof widget.id !== 'number') {
    return null
  }

  return {
    ...widget,
    id: widget.id,
    active: widget.active ?? false,
    config: widget.config ?? {},
  }
}

export async function getActiveWidget(userId: string): Promise<PersistedWidget | null> {
  const widget = await widgetsTable
    .where('userId')
    .equals(userId)
    .and((w) => w.active === true)
    .first()
  return toPersistedWidget(widget)
}

export async function activateWidget(userId: string, widgetType: WidgetType): Promise<PersistedWidget> {
  const existing = await widgetsTable
    .where('userId')
    .equals(userId)
    .toArray()

  for (const w of existing) {
    await widgetsTable.update(w.id, { active: false, updatedAt: new Date() })
  }

  const match = existing.find((w) => w.widgetType === widgetType)
  if (match) {
    await widgetsTable.update(match.id, { active: true, updatedAt: new Date() })
    return toPersistedWidget(await widgetsTable.get(match.id)) as PersistedWidget
  }

  const now = new Date()
  const id = await widgetsTable.add({
    userId,
    widgetType,
    active: true,
    config: {},
    createdAt: now,
    updatedAt: now,
  })

  return toPersistedWidget(await widgetsTable.get(id as number)) as PersistedWidget
}

export async function deactivateWidget(userId: string): Promise<PersistedWidget | null> {
  const active = await getActiveWidget(userId)
  if (!active) return null

  await widgetsTable.update(active.id, { active: false, updatedAt: new Date() })
  return toPersistedWidget(await widgetsTable.get(active.id))
}

export async function queryCalendarDay(userId: string, date: string): Promise<CalendarDayResult> {
  const entries = await entriesTable.where('userId').equals(userId).toArray()
  return queryEntriesByDate(entries, userId, date)
}

export async function queryCalendarMonth(userId: string, year: number, month: number): Promise<CalendarMonthOverview> {
  const entries = await entriesTable.where('userId').equals(userId).toArray()
  return queryMonthOverview(entries, userId, year, month)
}

function toPersistedCollection(col: CollectionRecord | undefined): PersistedCollection | null {
  if (!col || !col.id) return null
  return {
    ...col,
    id: col.id,
    description: col.description ?? null,
    icon: col.icon ?? null,
    color: col.color ?? null,
    parentId: col.parentId ?? null,
    sortOrder: col.sortOrder ?? 0,
  }
}

function toPersistedEntryTagRelation(rel: EntryTagRelationRecord | undefined): PersistedEntryTagRelation | null {
  if (!rel || !rel.id) return null
  return { ...rel, id: rel.id }
}

function toPersistedEntryRelation(rel: EntryRelationRecord | undefined): PersistedEntryRelation | null {
  if (!rel || !rel.id) return null
  return { ...rel, id: rel.id, reason: rel.reason ?? null, confidence: rel.confidence ?? null }
}

function toPersistedKnowledgeEvent(evt: KnowledgeEventRecord | undefined): PersistedKnowledgeEvent | null {
  if (!evt || !evt.id) return null
  return { ...evt, id: evt.id, targetId: evt.targetId ?? null, metadata: evt.metadata ?? null }
}

function toPersistedTemporalActivity(act: TemporalActivityRecord | undefined): PersistedTemporalActivity | null {
  if (!act || !act.id) return null
  return {
    ...act,
    id: act.id,
    summary: act.summary ?? null,
    tagIds: act.tagIds ?? [],
    projectIds: act.projectIds ?? [],
    metadata: act.metadata ?? null,
  }
}

export async function listCollections(userId: string): Promise<PersistedCollection[]> {
  const cols = await collectionsTable.where('userId').equals(userId).sortBy('sortOrder')
  return cols.flatMap((c) => { const p = toPersistedCollection(c); return p ? [p] : [] })
}

export async function createCollection(input: {
  userId: string
  name: string
  description?: string | null
  icon?: string | null
  color?: string | null
  parentId?: string | null
  sortOrder?: number
  collectionType?: CollectionType
}): Promise<PersistedCollection> {
  const now = new Date()
  const id = makeCollectionId(input.userId, input.name)
  const record: CollectionRecord = {
    id,
    userId: input.userId,
    name: input.name,
    description: input.description ?? null,
    icon: input.icon ?? null,
    color: input.color ?? null,
    parentId: input.parentId ?? null,
    sortOrder: input.sortOrder ?? 0,
    collectionType: input.collectionType ?? 'folder',
    createdAt: now,
    updatedAt: now,
  }
  await collectionsTable.add(record)
  return toPersistedCollection(await collectionsTable.get(id)) as PersistedCollection
}

export async function updateCollection(
  userId: string,
  collectionId: string,
  updates: Partial<Pick<Collection, 'name' | 'description' | 'icon' | 'color' | 'parentId' | 'sortOrder' | 'collectionType'>>,
): Promise<PersistedCollection | null> {
  const col = await collectionsTable.get(collectionId)
  if (!col || col.userId !== userId) return null

  await collectionsTable.update(collectionId, { ...updates, updatedAt: new Date() })
  return toPersistedCollection(await collectionsTable.get(collectionId))
}

export async function listEntryTagRelations(userId: string): Promise<PersistedEntryTagRelation[]> {
  const rels = await entryTagRelationsTable.where('userId').equals(userId).toArray()
  return rels.flatMap((r) => { const p = toPersistedEntryTagRelation(r); return p ? [p] : [] })
}

export async function addEntryTagRelation(input: {
  userId: string
  entryId: number
  tagId: string
  source?: TagRelationSource
  confidence?: number | null
}): Promise<PersistedEntryTagRelation> {
  const id = makeEntryTagRelationId(input.userId, input.entryId, input.tagId)
  const now = new Date()
  const record: EntryTagRelationRecord = {
    id,
    userId: input.userId,
    entryId: input.entryId,
    tagId: input.tagId,
    source: input.source ?? 'user',
    confidence: input.confidence ?? null,
    createdAt: now,
  }
  await entryTagRelationsTable.put(record)
  return toPersistedEntryTagRelation(await entryTagRelationsTable.get(id)) as PersistedEntryTagRelation
}

export async function removeEntryTagRelation(userId: string, entryId: number, tagId: string): Promise<boolean> {
  const id = makeEntryTagRelationId(userId, entryId, tagId)
  const existing = await entryTagRelationsTable.get(id)
  if (!existing || existing.userId !== userId) return false
  await entryTagRelationsTable.delete(id)
  return true
}

export async function listEntryRelations(userId: string): Promise<PersistedEntryRelation[]> {
  const rels = await entryRelationsTable.where('userId').equals(userId).toArray()
  return rels.flatMap((r) => { const p = toPersistedEntryRelation(r); return p ? [p] : [] })
}

export async function createEntryRelation(input: {
  userId: string
  sourceEntryId: number
  targetEntryId: number
  relationType: EntryRelationType
  direction?: RelationDirection
  source?: RelationSource
  confidence?: number | null
  reason?: string | null
}): Promise<PersistedEntryRelation | null> {
  const validation = await validateEntryRelationInput({
    userId: input.userId,
    sourceEntryId: input.sourceEntryId,
    targetEntryId: input.targetEntryId,
    findEntryById: async (uid, entryId) => {
      const entry = await entriesTable.get(entryId)
      if (!entry || entry.userId !== uid) return null
      return entry
    },
  })
  if (!validation.valid) return null

  const id = makeEntryRelationId(input.userId, input.sourceEntryId, input.targetEntryId, input.relationType)
  const now = new Date()
  const record: EntryRelationRecord = {
    id,
    userId: input.userId,
    sourceEntryId: input.sourceEntryId,
    targetEntryId: input.targetEntryId,
    relationType: input.relationType,
    direction: input.direction ?? 'undirected',
    source: input.source ?? 'user',
    confidence: input.confidence ?? null,
    reason: input.reason ?? null,
    createdAt: now,
    updatedAt: now,
  }
  await entryRelationsTable.put(record)

  await recordKnowledgeEvent({
    userId: input.userId,
    eventType: 'relation_created',
    targetType: 'relation',
    targetId: id,
    metadata: { sourceEntryId: input.sourceEntryId, targetEntryId: input.targetEntryId, relationType: input.relationType },
  })

  await recordTemporalActivity({
    userId: input.userId,
    type: 'relation_created',
    entityType: 'relation',
    entityId: id,
    title: `${input.relationType}: ${input.sourceEntryId} → ${input.targetEntryId}`,
    metadata: { sourceEntryId: input.sourceEntryId, targetEntryId: input.targetEntryId, relationType: input.relationType },
  })

  return toPersistedEntryRelation(await entryRelationsTable.get(id))
}

export async function deleteEntryRelation(userId: string, relationId: string): Promise<boolean> {
  const existing = await entryRelationsTable.get(relationId)
  if (!existing || existing.userId !== userId) return false

  await recordKnowledgeEvent({
    userId,
    eventType: 'relation_deleted',
    targetType: 'relation',
    targetId: relationId,
    metadata: { sourceEntryId: existing.sourceEntryId, targetEntryId: existing.targetEntryId, relationType: existing.relationType },
  })

  await recordTemporalActivity({
    userId,
    type: 'relation_deleted',
    entityType: 'relation',
    entityId: relationId,
    title: `删除关系: ${existing.relationType}: ${existing.sourceEntryId} → ${existing.targetEntryId}`,
    metadata: { sourceEntryId: existing.sourceEntryId, targetEntryId: existing.targetEntryId, relationType: existing.relationType },
  })

  await entryRelationsTable.delete(relationId)
  return true
}

export async function listKnowledgeEvents(userId: string): Promise<PersistedKnowledgeEvent[]> {
  const evts = await knowledgeEventsTable.where('userId').equals(userId).reverse().sortBy('createdAt')
  return evts.flatMap((e) => { const p = toPersistedKnowledgeEvent(e); return p ? [p] : [] })
}

export async function recordKnowledgeEvent(input: {
  userId: string
  eventType: KnowledgeEventType
  targetType: KnowledgeEventTargetType
  targetId?: string | null
  metadata?: Record<string, unknown> | null
}): Promise<PersistedKnowledgeEvent> {
  const now = new Date()
  const id = makeKnowledgeEventId(input.userId, input.eventType, now.getTime())
  const record: KnowledgeEventRecord = {
    id,
    userId: input.userId,
    eventType: input.eventType,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? null,
    createdAt: now,
  }
  await knowledgeEventsTable.add(record)
  return toPersistedKnowledgeEvent(await knowledgeEventsTable.get(id)) as PersistedKnowledgeEvent
}

export async function listTemporalActivities(userId: string): Promise<PersistedTemporalActivity[]> {
  const acts = await temporalActivitiesTable.where('userId').equals(userId).reverse().sortBy('occurredAt')
  return acts.flatMap((a) => { const p = toPersistedTemporalActivity(a); return p ? [p] : [] })
}

export async function recordTemporalActivity(input: {
  userId: string
  type: TemporalActivityType
  entityType: TemporalActivityEntityType
  entityId: string
  occurredAt?: Date
  title: string
  summary?: string | null
  tagIds?: string[]
  projectIds?: string[]
  metadata?: Record<string, unknown> | null
}): Promise<PersistedTemporalActivity> {
  const occurredAt = input.occurredAt ?? new Date()
  const keys = computeTemporalKeys(occurredAt)
  const id = makeTemporalActivityId(input.userId, input.type, input.entityId, occurredAt.getTime())
  const record: TemporalActivityRecord = {
    id,
    userId: input.userId,
    type: input.type,
    entityType: input.entityType,
    entityId: input.entityId,
    occurredAt,
    dayKey: keys.dayKey,
    weekKey: keys.weekKey,
    monthKey: keys.monthKey,
    title: input.title,
    summary: input.summary ?? null,
    tagIds: input.tagIds ?? [],
    projectIds: input.projectIds ?? [],
    metadata: input.metadata ?? null,
  }
  await temporalActivitiesTable.add(record)

  await recordKnowledgeEvent({
    userId: input.userId,
    eventType: 'temporal_activity_created',
    targetType: 'entry',
    targetId: input.entityId,
    metadata: { activityType: input.type, dayKey: keys.dayKey },
  })

  return toPersistedTemporalActivity(await temporalActivitiesTable.get(id)) as PersistedTemporalActivity
}

export async function getStructureProjection(userId: string): Promise<StructureProjection> {
  const [entries, tags, collections, tagRels, entryRels] = await Promise.all([
    entriesTable.where('userId').equals(userId).toArray(),
    tagsTable.where('userId').equals(userId).toArray(),
    collectionsTable.where('userId').equals(userId).toArray(),
    entryTagRelationsTable.where('userId').equals(userId).toArray(),
    entryRelationsTable.where('userId').equals(userId).toArray(),
  ])

  return buildStructureProjection({
    entries,
    tags,
    collections: collections.map((c) => ({
      id: c.id as string,
      userId: c.userId,
      name: c.name,
      description: c.description ?? null,
      icon: c.icon ?? null,
      color: c.color ?? null,
      parentId: c.parentId ?? null,
      sortOrder: c.sortOrder ?? 0,
      collectionType: c.collectionType,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    entryTagRelations: tagRels.map((r) => ({
      id: r.id as string,
      userId: r.userId,
      entryId: r.entryId,
      tagId: r.tagId,
      source: r.source,
      confidence: r.confidence ?? null,
      createdAt: r.createdAt,
    })),
    entryRelations: entryRels.map((r) => ({
      id: r.id as string,
      userId: r.userId,
      sourceEntryId: r.sourceEntryId,
      targetEntryId: r.targetEntryId,
      relationType: r.relationType,
      direction: r.direction,
      source: r.source,
      confidence: r.confidence ?? null,
      reason: r.reason ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    userId,
  })
}

export async function backfillStructureData(userId: string): Promise<{
  tagRelationsCreated: number
  collectionsCreated: number
}> {
  const [entries, tags, existingTagRels, existingCollections] = await Promise.all([
    entriesTable.where('userId').equals(userId).toArray(),
    tagsTable.where('userId').equals(userId).toArray(),
    entryTagRelationsTable.where('userId').equals(userId).toArray(),
    collectionsTable.where('userId').equals(userId).toArray(),
  ])

  const now = new Date()

  const newTagRels = backfillEntryTagRelations({
    entries,
    tags,
    existingRelations: existingTagRels.map((r) => ({
      id: r.id as string,
      userId: r.userId,
      entryId: r.entryId,
      tagId: r.tagId,
      source: r.source,
      confidence: r.confidence ?? null,
      createdAt: r.createdAt,
    })),
    userId,
    makeId: makeEntryTagRelationId,
    now,
  })

  for (const rel of newTagRels) {
    await entryTagRelationsTable.put(rel)
  }

  const newCollections = backfillProjectCollections({
    entries,
    existingCollections: existingCollections.map((c) => ({
      id: c.id as string,
      userId: c.userId,
      name: c.name,
      description: c.description ?? null,
      icon: c.icon ?? null,
      color: c.color ?? null,
      parentId: c.parentId ?? null,
      sortOrder: c.sortOrder ?? 0,
      collectionType: c.collectionType,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    userId,
    makeCollectionId,
    now,
  })

  for (const col of newCollections) {
    await collectionsTable.put(col)
  }

  return {
    tagRelationsCreated: newTagRels.length,
    collectionsCreated: newCollections.length,
  }
}

export async function listDocuments(userId: string): Promise<PersistedDocument[]> {
  return listArchivedEntries(userId)
}

export async function listDocumentsByType(userId: string, type: string): Promise<PersistedDocument[]> {
  return listArchivedEntriesByType(userId, type)
}

export async function listDocumentsByTag(userId: string, tag: string): Promise<PersistedDocument[]> {
  return listArchivedEntriesByTag(userId, tag)
}

export async function listDocumentsByProject(userId: string, project: string): Promise<PersistedDocument[]> {
  return listArchivedEntriesByProject(userId, project)
}

export async function getDocumentByCaptureId(userId: string, captureId: number): Promise<PersistedDocument | null> {
  return getEntryByDockItemId(userId, captureId)
}

export async function updateDocument(
  userId: string,
  documentId: number,
  updates: DocumentUpdateInput,
): Promise<PersistedDocument | null> {
  return updateArchivedEntry(userId, documentId, updates)
}

export async function createCaptureToDocumentFlow(
  input: CaptureToDocumentInput,
): Promise<CaptureToDocumentResult> {
  const validationError = validateCaptureInput(input)
  if (validationError !== null) {
    throw new Error(validationError)
  }

  const sourceType = input.sourceType ?? 'text'
  const title = extractDocumentTitle(input.rawText)

  const captureId = await createDockItem(input.userId, input.rawText, sourceType, { topic: input.topic ?? null })

  const docId = await entriesTable.add({
    userId: input.userId,
    sourceDockItemId: captureId,
    title,
    content: input.rawText,
    type: 'note',
    tags: [],
    project: null,
    actions: [],
    createdAt: new Date(),
    archivedAt: new Date(),
  }) as number

  const mindNode = await upsertMindNode({
    userId: input.userId,
    nodeType: 'document',
    label: title,
    documentId: docId,
    state: 'drifting',
    metadata: { sourceType: 'document', entryId: docId },
  })

  await dockItemsTable.update(captureId, {
    status: 'archived',
    processedAt: new Date(),
  })

  const { rec, recEvent } = await db.transaction(
    'rw',
    recommendationsTable,
    recommendationEventsTable,
    async () => {
      const createdRecommendation = await createRecommendation({
        userId: input.userId,
        subjectType: 'dockItem',
        subjectId: captureId,
        recommendationType: 'landing',
        candidateType: 'mindNode',
        candidateId: mindNode.id,
        confidenceScore: 1.0,
        reasonJson: JSON.stringify({
          source: 'capture_to_document_flow',
          reason: 'created from successful capture landing flow',
          documentId: docId,
          mindNodeId: mindNode.id,
        }),
        status: 'generated',
      })

      const createdEvent = await recordRecommendationEvent({
        recommendationId: createdRecommendation.id,
        userId: input.userId,
        eventType: 'recommendation_generated',
        metadata: {
          source: 'capture_to_document_flow',
          documentId: docId,
          mindNodeId: mindNode.id,
        },
      })

      return { rec: createdRecommendation, recEvent: createdEvent }
    },
  )

  const capture = await getPersistedDockItem(captureId)
  if (!capture) {
    throw new Error('Failed to retrieve created capture')
  }

  const entry = await toPersistedEntry(await entriesTable.get(docId))
  if (!entry) {
    throw new Error('Failed to retrieve created document')
  }

  return {
    capture: {
      id: capture.id,
      rawText: capture.rawText,
      status: capture.status,
      processedAt: capture.processedAt,
      createdAt: capture.createdAt,
    },
    document: {
      id: entry.id,
      title: entry.title,
      content: entry.content,
      sourceCaptureId: entry.sourceDockItemId,
      type: entry.type,
      createdAt: entry.createdAt,
    },
    mindNode: {
      id: mindNode.id,
      label: mindNode.label,
      nodeType: mindNode.nodeType,
      documentId: mindNode.documentId as number,
      state: mindNode.state,
    },
    recommendation: {
      id: rec.id,
      recommendationType: rec.recommendationType,
      status: rec.status,
      subjectType: rec.subjectType,
      subjectId: rec.subjectId as number,
      candidateType: rec.candidateType,
      candidateId: rec.candidateId,
    },
    recommendationEvent: {
      id: recEvent.id,
      eventType: recEvent.eventType,
    },
  }
}

function toPersistedMindNode(node: MindNodeRecord | undefined): PersistedMindNode | null {
  if (!node || !node.id) return null
  return {
    ...node,
    id: node.id,
    documentId: node.documentId ?? null,
    degreeScore: node.degreeScore ?? 0,
    recentActivityScore: node.recentActivityScore ?? 0,
    documentWeightScore: node.documentWeightScore ?? 0,
    userPinScore: node.userPinScore ?? 0,
    clusterCenterScore: node.clusterCenterScore ?? 0,
    positionX: node.positionX ?? null,
    positionY: node.positionY ?? null,
    metadata: node.metadata ?? null,
  }
}

function toPersistedMindEdge(edge: MindEdgeRecord | undefined): PersistedMindEdge | null {
  if (!edge || !edge.id) return null
  return {
    ...edge,
    id: edge.id,
    confidence: edge.confidence ?? null,
    reason: edge.reason ?? null,
  }
}

export async function listMindNodes(userId: string): Promise<PersistedMindNode[]> {
  const nodes = await mindNodesTable.where('userId').equals(userId).toArray()
  return nodes.flatMap((n) => { const p = toPersistedMindNode(n); return p ? [p] : [] })
}

export async function listMindNodesByType(userId: string, nodeType: MindNodeType): Promise<PersistedMindNode[]> {
  const nodes = await mindNodesTable.where('userId').equals(userId).and((n) => n.nodeType === nodeType).toArray()
  return nodes.flatMap((n) => { const p = toPersistedMindNode(n); return p ? [p] : [] })
}

export async function getMindNode(userId: string, id: string): Promise<PersistedMindNode | null> {
  const node = await mindNodesTable.get(id)
  if (!node || node.userId !== userId) return null
  return toPersistedMindNode(node)
}

export async function upsertMindNode(input: {
  userId: string
  nodeType: MindNodeType
  label: string
  state?: MindNodeState
  documentId?: number | null
  degreeScore?: number
  recentActivityScore?: number
  documentWeightScore?: number
  userPinScore?: number
  clusterCenterScore?: number
  positionX?: number | null
  positionY?: number | null
  metadata?: Record<string, unknown> | null
}): Promise<PersistedMindNode> {
  const now = new Date()
  const id = makeMindNodeId(input.userId, input.nodeType, input.label, input.documentId)
  const existing = await mindNodesTable.get(id)

  const record: MindNodeRecord = {
    id,
    userId: input.userId,
    nodeType: input.nodeType,
    label: input.label,
    state: input.state ?? existing?.state ?? 'drifting',
    documentId: input.documentId ?? existing?.documentId ?? null,
    degreeScore: input.degreeScore ?? existing?.degreeScore ?? 0,
    recentActivityScore: input.recentActivityScore ?? existing?.recentActivityScore ?? 0,
    documentWeightScore: input.documentWeightScore ?? existing?.documentWeightScore ?? 0,
    userPinScore: input.userPinScore ?? existing?.userPinScore ?? 0,
    clusterCenterScore: input.clusterCenterScore ?? existing?.clusterCenterScore ?? 0,
    positionX: input.positionX ?? existing?.positionX ?? null,
    positionY: input.positionY ?? existing?.positionY ?? null,
    metadata: input.metadata ?? existing?.metadata ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  await mindNodesTable.put(record)
  return toPersistedMindNode(await mindNodesTable.get(id)) as PersistedMindNode
}

export async function updateMindNodePosition(
  userId: string,
  id: string,
  positionX: number,
  positionY: number,
): Promise<PersistedMindNode | null> {
  const existing = await mindNodesTable.get(id)
  if (!existing || existing.userId !== userId) return null
  await mindNodesTable.update(id, {
    positionX,
    positionY,
    updatedAt: new Date(),
  })
  return toPersistedMindNode(await mindNodesTable.get(id))
}

export async function deleteMindNode(userId: string, id: string): Promise<boolean> {
  const existing = await mindNodesTable.get(id)
  if (!existing || existing.userId !== userId) return false
  await mindNodesTable.delete(id)
  return true
}

export async function archiveMindNode(userId: string, id: string): Promise<PersistedMindNode | null> {
  const existing = await mindNodesTable.get(id)
  if (!existing || existing.userId !== userId) return null
  if (existing.nodeType === 'root') return null
  if (existing.state === 'archived') return toPersistedMindNode(existing)
  const now = new Date()
  await mindNodesTable.update(id, {
    state: 'archived' as MindNodeState,
    updatedAt: now,
    metadata: { ...(existing.metadata as Record<string, unknown> | null), hiddenAt: now.toISOString() },
  })
  return toPersistedMindNode(await mindNodesTable.get(id))
}

export async function restoreMindNode(userId: string, id: string): Promise<PersistedMindNode | null> {
  const existing = await mindNodesTable.get(id)
  if (!existing || existing.userId !== userId) return null
  if (existing.state !== 'archived') return toPersistedMindNode(existing)
  await mindNodesTable.update(id, {
    state: 'drifting' as MindNodeState,
    updatedAt: new Date(),
  })
  return toPersistedMindNode(await mindNodesTable.get(id))
}

export async function listArchivedMindNodes(userId: string): Promise<PersistedMindNode[]> {
  const nodes = await mindNodesTable
    .where('[userId+state]')
    .equals([userId, 'archived'])
    .toArray()
  return nodes.map(n => toPersistedMindNode(n)).filter((n): n is PersistedMindNode => n !== null)
}

export async function findMindNodeByDocumentId(
  userId: string,
  documentId: number,
): Promise<PersistedMindNode | null> {
  const nodes = await mindNodesTable.where('userId').equals(userId).toArray()
  const found = nodes.find(n => n.documentId === documentId)
  return found ? toPersistedMindNode(found) as PersistedMindNode : null
}

export async function findMindNodeBySourceType(
  userId: string,
  documentId: number,
  sourceType: 'draft' | 'document',
): Promise<PersistedMindNode | null> {
  const nodes = await mindNodesTable.where('userId').equals(userId).toArray()
  const found = nodes.find(n =>
    n.documentId === documentId &&
    n.metadata != null &&
    (n.metadata as Record<string, unknown>).sourceType === sourceType
  )
  return found ? toPersistedMindNode(found) as PersistedMindNode : null
}

export async function listMindEdges(userId: string): Promise<PersistedMindEdge[]> {
  const edges = await mindEdgesTable.where('userId').equals(userId).toArray()
  return edges.flatMap((e) => { const p = toPersistedMindEdge(e); return p ? [p] : [] })
}

export async function listMindEdgesBySourceNode(userId: string, sourceNodeId: string): Promise<PersistedMindEdge[]> {
  const edges = await mindEdgesTable.where('userId').equals(userId).and((e) => e.sourceNodeId === sourceNodeId).toArray()
  return edges.flatMap((e) => { const p = toPersistedMindEdge(e); return p ? [p] : [] })
}

export async function listMindEdgesByTargetNode(userId: string, targetNodeId: string): Promise<PersistedMindEdge[]> {
  const edges = await mindEdgesTable.where('userId').equals(userId).and((e) => e.targetNodeId === targetNodeId).toArray()
  return edges.flatMap((e) => { const p = toPersistedMindEdge(e); return p ? [p] : [] })
}

export async function checkDocumentNameConflict(
  userId: string,
  label: string,
  parentEdgeType: MindEdgeType = 'parent_child',
): Promise<{ hasConflict: boolean; conflictingParentIds: string[]; hasRootLevelConflict: boolean }> {
  const normalized = label.trim().toLowerCase()
  const allNodes = await mindNodesTable.where('userId').equals(userId).toArray()
  const allEdges = await mindEdgesTable.where('userId').equals(userId).toArray()
  const documentNodes = allNodes.filter(n => n.nodeType === 'document')
  const sameNameNodes = documentNodes.filter(n => n.label.trim().toLowerCase() === normalized)
  if (sameNameNodes.length === 0) return { hasConflict: false, conflictingParentIds: [], hasRootLevelConflict: false }
  const parentEdges = allEdges.filter(e => e.edgeType === parentEdgeType)
  const conflictingParentIds: string[] = []
  let hasRootLevelConflict = false
  for (const sameNameNode of sameNameNodes) {
    const parentEdge = parentEdges.find(e => e.targetNodeId === sameNameNode.id)
    if (parentEdge) {
      conflictingParentIds.push(parentEdge.sourceNodeId)
    } else {
      hasRootLevelConflict = true
    }
  }
  const hasConflict = conflictingParentIds.length > 0 || hasRootLevelConflict
  return { hasConflict, conflictingParentIds, hasRootLevelConflict }
}

export async function getMindEdge(userId: string, id: string): Promise<PersistedMindEdge | null> {
  const edge = await mindEdgesTable.get(id)
  if (!edge || edge.userId !== userId) return null
  return toPersistedMindEdge(edge)
}

async function findMindEdgeBetweenNodes(
  userId: string,
  nodeA: string,
  nodeB: string,
): Promise<PersistedMindEdge | null> {
  const edges = await mindEdgesTable
    .where('userId')
    .equals(userId)
    .and(e =>
      (e.sourceNodeId === nodeA && e.targetNodeId === nodeB) ||
      (e.sourceNodeId === nodeB && e.targetNodeId === nodeA),
    )
    .limit(1)
    .toArray()
  if (edges.length === 0) return null
  return toPersistedMindEdge(edges[0])
}

export async function upsertMindEdge(input: {
  userId: string
  sourceNodeId: string
  targetNodeId: string
  edgeType: MindEdgeType
  strength?: number
  source?: 'user' | 'system' | 'import'
  confidence?: number | null
  reason?: string | null
}): Promise<PersistedMindEdge | null> {
  if (input.sourceNodeId === input.targetNodeId) return null

  const [sourceNode, targetNode] = await Promise.all([
    mindNodesTable.get(input.sourceNodeId),
    mindNodesTable.get(input.targetNodeId),
  ])
  if (!sourceNode || sourceNode.userId !== input.userId) return null
  if (!targetNode || targetNode.userId !== input.userId) return null

  const now = new Date()
  const id = makeMindEdgeId(input.userId, input.sourceNodeId, input.targetNodeId, input.edgeType)
  const existing = await mindEdgesTable.get(id)
  if (existing) return null

  const record: MindEdgeRecord = {
    id,
    userId: input.userId,
    sourceNodeId: input.sourceNodeId,
    targetNodeId: input.targetNodeId,
    edgeType: input.edgeType,
    strength: input.strength ?? 0.5,
    source: input.source ?? 'system',
    confidence: input.confidence ?? null,
    reason: input.reason ?? null,
    createdAt: now,
    updatedAt: now,
  }
  await mindEdgesTable.put(record)
  return toPersistedMindEdge(await mindEdgesTable.get(id)) as PersistedMindEdge
}

export async function deleteMindEdge(userId: string, id: string): Promise<boolean> {
  const existing = await mindEdgesTable.get(id)
  if (!existing || existing.userId !== userId) return false
  if (existing.reason === 'baseline-auto-connect') return false
  await mindEdgesTable.delete(id)
  return true
}

export async function forceDeleteBaselineEdge(userId: string, id: string): Promise<boolean> {
  const existing = await mindEdgesTable.get(id)
  if (!existing || existing.userId !== userId) return false
  if (existing.reason !== 'baseline-auto-connect') return false
  await mindEdgesTable.delete(id)
  return true
}

function toPersistedWorkspaceSession(record: WorkspaceSessionRecord | undefined): PersistedWorkspaceSession | null {
  if (!record || !record.id) return null
  return { ...record, id: record.id }
}

function toPersistedWorkspaceOpenTab(record: WorkspaceOpenTabRecord | undefined): PersistedWorkspaceOpenTab | null {
  if (!record || !record.id) return null
  return { ...record, id: record.id }
}

function toPersistedRecentDocument(record: RecentDocumentRecord | undefined): PersistedRecentDocument | null {
  if (!record || !record.id) return null
  return { ...record, id: record.id }
}

export async function getWorkspaceSession(userId: string): Promise<PersistedWorkspaceSession> {
  const id = makeWorkspaceSessionId(userId)
  let session = await workspaceSessionsTable.get(id)
  if (!session || session.userId !== userId) {
    const now = new Date()
    const record: WorkspaceSessionRecord = {
      id,
      userId,
      activeTabId: null,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    }
    await workspaceSessionsTable.put(record)
    session = record
  }
  return toPersistedWorkspaceSession(session) as PersistedWorkspaceSession
}

export async function openWorkspaceTab(input: {
  userId: string
  tabType: TabType
  title: string
  path: string
  documentId?: number | null
}): Promise<PersistedWorkspaceOpenTab> {
  const session = await getWorkspaceSession(input.userId)
  const now = new Date()

  if (input.tabType === 'editor' && input.documentId != null) {
    const existing = await workspaceOpenTabsTable
      .where('userId')
      .equals(input.userId)
      .and((t) => t.tabType === 'editor' && t.documentId === input.documentId)
      .first()
    if (existing) {
      return activateWorkspaceTab(input.userId, existing.id)
    }
  }

  const userTabs = await workspaceOpenTabsTable
    .where('userId')
    .equals(input.userId)
    .toArray()
  const maxSort = userTabs.reduce((max, t) => Math.max(max, t.sortOrder ?? 0), 0)

  await workspaceOpenTabsTable
    .where('userId')
    .equals(input.userId)
    .and((t) => t.isActive)
    .modify({ isActive: false, updatedAt: now })

  const tabId = makeWorkspaceTabId(input.userId, input.tabType, input.documentId)
  const record: WorkspaceOpenTabRecord = {
    id: tabId,
    userId: input.userId,
    sessionId: session.id,
    tabType: input.tabType,
    title: input.title,
    path: input.path,
    documentId: input.documentId ?? null,
    isPinned: false,
    isActive: true,
    sortOrder: maxSort + 1,
    openedAt: now,
    updatedAt: now,
  }
  await workspaceOpenTabsTable.put(record)

  await workspaceSessionsTable.update(session.id, {
    activeTabId: tabId,
    lastActivityAt: now,
    updatedAt: now,
  })

  return toPersistedWorkspaceOpenTab(await workspaceOpenTabsTable.get(tabId)) as PersistedWorkspaceOpenTab
}

export async function closeWorkspaceTab(userId: string, tabId: string): Promise<boolean> {
  const tab = await workspaceOpenTabsTable.get(tabId)
  if (!tab || tab.userId !== userId) return false

  await workspaceOpenTabsTable.delete(tabId)

  if (tab.isActive) {
    const remaining = await workspaceOpenTabsTable
      .where('userId')
      .equals(userId)
      .sortBy('sortOrder')
    const newActive = remaining[remaining.length - 1]
    if (newActive) {
      await workspaceOpenTabsTable.update(newActive.id, { isActive: true, updatedAt: new Date() })
      await workspaceSessionsTable.update(makeWorkspaceSessionId(userId), {
        activeTabId: newActive.id,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
    } else {
      await workspaceSessionsTable.update(makeWorkspaceSessionId(userId), {
        activeTabId: null,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
    }
  }

  return true
}

export async function activateWorkspaceTab(userId: string, tabId: string): Promise<PersistedWorkspaceOpenTab> {
  const now = new Date()
  await workspaceOpenTabsTable
    .where('userId')
    .equals(userId)
    .and((t) => t.isActive)
    .modify({ isActive: false, updatedAt: now })

  await workspaceOpenTabsTable.update(tabId, { isActive: true, updatedAt: now })

  await workspaceSessionsTable.update(makeWorkspaceSessionId(userId), {
    activeTabId: tabId,
    lastActivityAt: now,
    updatedAt: now,
  })

  const tab = await workspaceOpenTabsTable.get(tabId)
  return toPersistedWorkspaceOpenTab(tab) as PersistedWorkspaceOpenTab
}

export async function pinWorkspaceTab(userId: string, tabId: string, pinned?: boolean): Promise<PersistedWorkspaceOpenTab | null> {
  const tab = await workspaceOpenTabsTable.get(tabId)
  if (!tab || tab.userId !== userId) return null

  const newPinned = pinned ?? !tab.isPinned
  await workspaceOpenTabsTable.update(tabId, { isPinned: newPinned, updatedAt: new Date() })

  return toPersistedWorkspaceOpenTab(await workspaceOpenTabsTable.get(tabId))
}

export async function restoreWorkspaceTabs(userId: string): Promise<PersistedWorkspaceOpenTab[]> {
  const tabs = await workspaceOpenTabsTable
    .where('userId')
    .equals(userId)
    .sortBy('sortOrder')
  return tabs.flatMap((t) => { const p = toPersistedWorkspaceOpenTab(t); return p ? [p] : [] })
}

export async function listRecentDocuments(userId: string, limit: number = 20): Promise<PersistedRecentDocument[]> {
  const docs = await recentDocumentsTable
    .where('userId')
    .equals(userId)
    .reverse()
    .sortBy('lastOpenedAt')
  return docs.slice(0, limit).flatMap((d) => { const p = toPersistedRecentDocument(d); return p ? [p] : [] })
}

export async function recordRecentDocumentOpen(input: {
  userId: string
  documentId: number
  title: string
}): Promise<PersistedRecentDocument> {
  const now = new Date()
  const id = makeRecentDocumentId(input.userId, input.documentId)
  const existing = await recentDocumentsTable.get(id)

  const record: RecentDocumentRecord = {
    id,
    userId: input.userId,
    documentId: input.documentId,
    title: input.title,
    openCount: (existing?.openCount ?? 0) + 1,
    lastOpenedAt: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  await recentDocumentsTable.put(record)
  return toPersistedRecentDocument(await recentDocumentsTable.get(id)) as PersistedRecentDocument
}

function toPersistedEditorDraft(draft: EditorDraftRecord | undefined): PersistedEditorDraft | null {
  if (!draft || typeof draft.id !== 'number') return null
  return { ...draft, id: draft.id, status: draft.status ?? 'active' }
}

async function addDraftRecord(
  userId: string,
  title: string,
  content: string,
  sourceEntryId?: number | null,
  sourceType?: DraftSourceType | null,
): Promise<number> {
  const now = new Date()
  const id = await editorDraftsTable.add({
    userId,
    draftKey: 0,
    title,
    content,
    status: 'active',
    sourceEntryId: sourceEntryId ?? null,
    sourceType: sourceType ?? null,
    createdAt: now,
    updatedAt: now,
  })
  await editorDraftsTable.update(id as number, { draftKey: id as number })
  return id as number
}

export async function createDraft(
  userId: string,
  title: string = '',
  content: string = '',
  sourceEntryId?: number | null,
  sourceType?: DraftSourceType | null,
): Promise<PersistedEditorDraft | null> {
  const id = await addDraftRecord(userId, title, content, sourceEntryId, sourceType)
  const saved = await editorDraftsTable.get(id)
  return toPersistedEditorDraft(saved)
}

export async function listDrafts(userId: string): Promise<PersistedEditorDraft[]> {
  const drafts = await editorDraftsTable
    .where('userId')
    .equals(userId)
    .reverse()
    .sortBy('updatedAt')
  return drafts.flatMap((d) => {
    if (d.status && d.status !== 'active') return []
    const p = toPersistedEditorDraft(d)
    return p ? [p] : []
  })
}

export async function findActiveDraftBySourceEntryId(
  userId: string,
  entryId: number,
): Promise<PersistedEditorDraft | null> {
  const drafts = await editorDraftsTable
    .where('[userId+sourceEntryId]')
    .equals([userId, entryId])
    .toArray()
  const active = drafts.find((d) => d.status === 'active')
  return active ? toPersistedEditorDraft(active) : null
}

export async function getDraft(userId: string, draftId: number): Promise<PersistedEditorDraft | null> {
  const draft = await editorDraftsTable.get(draftId)
  if (!draft || draft.userId !== userId) return null
  return toPersistedEditorDraft(draft)
}

export async function updateDraft(
  userId: string,
  draftId: number,
  updates: { title?: string; content?: string },
): Promise<PersistedEditorDraft | null> {
  const draft = await editorDraftsTable.get(draftId)
  if (!draft || draft.userId !== userId) return null
  const patch: Partial<EditorDraftRecord> = { updatedAt: new Date() }
  if (updates.title !== undefined) patch.title = updates.title
  if (updates.content !== undefined) patch.content = updates.content
  await editorDraftsTable.update(draftId, patch)
  return toPersistedEditorDraft(await editorDraftsTable.get(draftId))
}

export type PublishMode = 'update_original' | 'as_new'

export interface PublishResult {
  draft: PersistedEditorDraft | null
  entry: PersistedEntry | null
  nameConflict?: { hasConflict: boolean; conflictingParentIds: string[] }
  emptyDraft?: boolean
}

export async function publishDraftToDocument(
  userId: string,
  draftId: number,
  publishMode: PublishMode = 'update_original',
): Promise<PublishResult> {
  const draft = await editorDraftsTable.get(draftId)
  if (!draft || draft.userId !== userId || (draft.status && draft.status !== 'active')) {
    return { draft: null, entry: null }
  }

  const title = (draft.title || '').trim()
  const content = (draft.content || '').trim()
  const isDefaultTitle = !title || title.toLowerCase() === 'untitled'
  const isEmptyContent = !content

  if (isDefaultTitle && isEmptyContent) {
    return { draft: null, entry: null, emptyDraft: true }
  }

  const effectiveTitle = title || 'Untitled'

  const isCreatingNew = draft.sourceEntryId == null || publishMode === 'as_new'
  if (isCreatingNew) {
    const conflict = await checkDocumentNameConflict(userId, effectiveTitle)
    if (conflict.hasConflict) {
      return { draft: null, entry: null, nameConflict: conflict }
    }
  }

  const now = new Date()
  let entry: PersistedEntry | null = null

  if (draft.sourceEntryId != null && publishMode === 'update_original') {
    const existing = await entriesTable.get(draft.sourceEntryId)
    if (existing && existing.userId === userId) {
      await entriesTable.update(draft.sourceEntryId, {
        title: effectiveTitle,
        content: draft.content,
        archivedAt: now,
      })
      entry = toPersistedEntry(await entriesTable.get(draft.sourceEntryId))
    }
  }

  if (!entry) {
    const entryId = await entriesTable.add({
      userId,
      sourceDockItemId: draft.sourceEntryId ?? 0,
      title: effectiveTitle,
      content: draft.content,
      type: 'note',
      tags: [],
      project: null,
      actions: [],
      createdAt: now,
      archivedAt: now,
    })
    entry = toPersistedEntry(await entriesTable.get(entryId as number))
  }

  await editorDraftsTable.update(draftId, {
    status: 'published',
    updatedAt: now,
  })

  const entryId = entry?.id
  if (entryId == null) {
    return { draft: toPersistedEditorDraft(await editorDraftsTable.get(draftId)), entry: null }
  }

  const draftNode = await findMindNodeBySourceType(userId, draftId, 'draft')
  if (draftNode) {
    await mindNodesTable.delete(draftNode.id)
  }

  if (draft.sourceEntryId != null && publishMode === 'update_original') {
    const entryNode = await findMindNodeBySourceType(userId, draft.sourceEntryId, 'document')
    if (entryNode) {
      await mindNodesTable.update(entryNode.id, {
        label: effectiveTitle,
        documentId: entryId,
        metadata: { sourceType: 'document', entryId },
        updatedAt: now,
      })
    } else {
      await upsertMindNode({
        userId,
        nodeType: 'document',
        label: effectiveTitle,
        documentId: entryId,
        state: 'drifting',
        metadata: { sourceType: 'document', entryId },
      })
    }
  } else {
    await upsertMindNode({
      userId,
      nodeType: 'document',
      label: effectiveTitle,
      documentId: entryId,
      state: 'drifting',
      metadata: { sourceType: 'document', entryId },
    })
  }

  return {
    draft: toPersistedEditorDraft(await editorDraftsTable.get(draftId)),
    entry,
  }
}

export type DiscardMode = 'abandon_changes' | 'delete_all'

export async function discardDraft(
  userId: string,
  draftId: number,
  discardMode: DiscardMode = 'abandon_changes',
): Promise<PersistedEditorDraft | null> {
  const draft = await editorDraftsTable.get(draftId)
  if (!draft || draft.userId !== userId) return null
  await editorDraftsTable.update(draftId, {
    status: 'discarded',
    updatedAt: new Date(),
  })
  if (!draft.sourceEntryId) {
    const draftNode = await findMindNodeBySourceType(userId, draftId, 'draft')
    if (draftNode) {
      await mindNodesTable.delete(draftNode.id)
    }
  }
  if (draft.sourceEntryId != null && discardMode === 'delete_all') {
    const entryNode = await findMindNodeBySourceType(userId, draft.sourceEntryId, 'document')
    if (entryNode) {
      await mindNodesTable.delete(entryNode.id)
    }
    const existing = await entriesTable.get(draft.sourceEntryId)
    if (existing && existing.userId === userId) {
      await entriesTable.delete(draft.sourceEntryId)
    }
  }
  return toPersistedEditorDraft(await editorDraftsTable.get(draftId))
}

export async function saveEditorDraft(
  userId: string,
  draftKey: number,
  title: string,
  content: string,
): Promise<PersistedEditorDraft | null> {
  const now = new Date()
  const existing = await editorDraftsTable
    .where('[userId+draftKey]')
    .equals([userId, draftKey])
    .first()

  if (existing) {
    await editorDraftsTable.update(existing.id, {
      title,
      content,
      updatedAt: now,
    })
    return toPersistedEditorDraft(await editorDraftsTable.get(existing.id))
  }

  const id = await editorDraftsTable.add({
    userId,
    draftKey,
    title,
    content,
    status: 'active',
    sourceEntryId: null,
    sourceType: null,
    createdAt: now,
    updatedAt: now,
  })
  return toPersistedEditorDraft(await editorDraftsTable.get(id as number))
}

export async function loadEditorDraft(
  userId: string,
  draftKey: number,
): Promise<PersistedEditorDraft | null> {
  const draft = await editorDraftsTable
    .where('[userId+draftKey]')
    .equals([userId, draftKey])
    .first()
  return toPersistedEditorDraft(draft)
}

export async function loadAllEditorDrafts(userId: string): Promise<PersistedEditorDraft[]> {
  const drafts = await editorDraftsTable
    .where('userId')
    .equals(userId)
    .sortBy('updatedAt')
  return drafts.flatMap((d) => {
    const p = toPersistedEditorDraft(d)
    return p ? [p] : []
  })
}

export async function deleteEditorDraft(userId: string, draftKey: number): Promise<boolean> {
  const draft = await editorDraftsTable
    .where('[userId+draftKey]')
    .equals([userId, draftKey])
    .first()
  if (!draft || draft.userId !== userId) return false
  await editorDraftsTable.delete(draft.id)
  return true
}

function toPersistedRecommendation(rec: RecommendationRecord | undefined): PersistedRecommendation | null {
  if (!rec || !rec.id) return null
  return {
    ...rec,
    id: rec.id,
    reasonJson: rec.reasonJson ?? null,
  }
}

function toPersistedRecommendationEvent(evt: RecommendationEventRecord | undefined): PersistedRecommendationEvent | null {
  if (!evt || !evt.id) return null
  return { ...evt, id: evt.id, metadata: evt.metadata ?? null }
}

function toPersistedUserBehaviorEvent(evt: UserBehaviorEventRecord | undefined): PersistedUserBehaviorEvent | null {
  if (!evt || !evt.id) return null
  return {
    ...evt,
    id: evt.id,
    subjectId: evt.subjectId ?? null,
    metadata: evt.metadata ?? null,
  }
}

export async function createRecommendation(input: RecommendationCreateInput): Promise<PersistedRecommendation> {
  const now = new Date()
  const id = makeRecommendationId(input.userId, now.getTime())
  const record: RecommendationRecord = {
    id,
    userId: input.userId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    recommendationType: input.recommendationType,
    candidateType: input.candidateType,
    candidateId: input.candidateId,
    confidenceScore: input.confidenceScore,
    reasonJson: input.reasonJson ?? null,
    status: input.status ?? 'generated',
    createdAt: now,
    updatedAt: now,
  }
  await recommendationsTable.add(record)
  return toPersistedRecommendation(await recommendationsTable.get(id)) as PersistedRecommendation
}

export async function listRecommendations(
  userId: string,
  filters?: { status?: RecommendationStatus; subjectType?: string },
): Promise<PersistedRecommendation[]> {
  let collection = recommendationsTable.where('userId').equals(userId)

  if (filters?.status) {
    collection = collection.and((r) => r.status === filters.status)
  }
  if (filters?.subjectType) {
    collection = collection.and((r) => r.subjectType === filters.subjectType)
  }

  const recs = await collection.reverse().sortBy('createdAt')
  return recs.flatMap((r) => { const p = toPersistedRecommendation(r); return p ? [p] : [] })
}

export async function listRecommendationDockQueue(
  userId: string,
  query: RecommendationDockQueueQuery = {},
): Promise<RecommendationDockQueueResult> {
  validateRecommendationDockQueueQuery(query)

  const limit = query.limit ?? 20
  const offset = parseRecommendationDockQueueCursor(query.cursor)
  const sortBy = query.sortBy ?? 'createdAt'
  const sortDirection = query.sortDirection ?? defaultRecommendationDockQueueSortDirection(sortBy)
  const [recommendations, events] = await Promise.all([
    recommendationsTable.where('userId').equals(userId).toArray(),
    recommendationEventsTable.where('userId').equals(userId).toArray(),
  ])
  const eventsByRecommendation = groupRecommendationEventsByRecommendationId(events)
  const filteredRecommendations = recommendations.filter((recommendation) =>
    matchesRecommendationDockQueueFilters(recommendation, query),
  )
  const items = filteredRecommendations
    .flatMap((recommendation) => {
      const persisted = toPersistedRecommendation(recommendation)
      return persisted ? [buildRecommendationDockQueueItem(persisted, eventsByRecommendation.get(persisted.id) ?? [])] : []
    })
    .sort((left, right) => compareRecommendationDockQueueItems(left, right, sortBy, sortDirection))
  const pagedItems = items.slice(offset, offset + limit)
  const nextOffset = offset + pagedItems.length

  return {
    items: pagedItems,
    nextCursor: nextOffset < items.length ? String(nextOffset) : null,
    total: items.length,
  }
}

export async function markRecommendationDockQueueItemShown(input: RecommendationShownInput): Promise<RecommendationShownResult> {
  return markRecommendationShown(input)
}

export async function recordRecommendationDockQueueItemFeedback(
  input: RecommendationFeedbackInput,
): Promise<RecommendationFeedbackResult> {
  return recordRecommendationFeedback(input)
}

export interface ApplyRecommendationInput {
  userId: string
  recommendationId: string
}

export interface ApplyRecommendationResult {
  recommendationId: string
  status: RecommendationStatus
  appliedChanges: {
    candidateType: RecommendationCandidateType
    candidateId: string
    changeType: string
    changeDetail: string
  }
  recommendationEventId: string
  userBehaviorEventId: string
}

export async function applyRecommendation(
  input: ApplyRecommendationInput,
): Promise<ApplyRecommendationResult> {
  const recommendation = await recommendationsTable.get(input.recommendationId)
  if (!recommendation) {
    throw new Error(`Recommendation not found: ${input.recommendationId}`)
  }
  if (recommendation.userId !== input.userId) {
    throw new Error(`User ${input.userId} does not own recommendation ${input.recommendationId}`)
  }
  if (!isSupportedCandidateTypeForApply(recommendation.candidateType)) {
    throw new Error(
      `Cannot apply recommendation: candidateType "${recommendation.candidateType}" is not supported for automatic apply. ` +
      `Supported types: tag, project, mindNode.`,
    )
  }
  if (recommendation.status === 'rejected' || recommendation.status === 'superseded') {
    throw new Error(
      `Cannot apply recommendation in "${recommendation.status}" status. ` +
      `Rejected or superseded recommendations cannot be accepted.`,
    )
  }

  const subjectId = recommendation.subjectType === 'mindNode'
    ? String(recommendation.subjectId)
    : typeof recommendation.subjectId === 'string'
      ? Number.parseInt(recommendation.subjectId, 10)
      : recommendation.subjectId
  if (typeof subjectId === 'number' && Number.isNaN(subjectId)) {
    throw new Error(`Invalid subjectId for recommendation: ${recommendation.subjectId}`)
  }
  
  return db.transaction(
    'rw',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [recommendationsTable, recommendationEventsTable, userBehaviorEventsTable, dockItemsTable, tagsTable, collectionsTable, mindNodesTable, mindEdgesTable] as any,
    async () => {
      const currentRec = await recommendationsTable.get(input.recommendationId)
      if (currentRec && currentRec.status === 'accepted') {
        const acceptedEvent = await recommendationEventsTable
          .where('recommendationId')
          .equals(input.recommendationId)
          .and((e) => e.eventType === 'recommendation_accepted')
          .first()
        const appliedChanges = acceptedEvent?.metadata?.appliedChanges as ApplyRecommendationResult['appliedChanges'] | undefined
        return {
          recommendationId: input.recommendationId,
          status: 'accepted' as RecommendationStatus,
          appliedChanges: appliedChanges ?? {
            candidateType: currentRec.candidateType,
            candidateId: currentRec.candidateId,
            changeType: 'already_accepted',
            changeDetail: 'Recommendation was already accepted',
          },
          recommendationEventId: acceptedEvent?.id ?? '',
          userBehaviorEventId: '',
        }
      }

      const changeResult = await executeApplyChangeInTxn(currentRec ?? recommendation, subjectId)

      await recommendationsTable.update(input.recommendationId, {
        status: 'accepted',
        updatedAt: new Date(),
      })

      const metadata = {
        source: 'recommendation_apply',
        feedbackType: 'accepted',
        appliedChanges: changeResult,
      }

      const recEvent = await recordRecommendationEvent({
        recommendationId: input.recommendationId,
        userId: input.userId,
        eventType: 'recommendation_accepted',
        metadata,
      })

      const behaviorMetadata = buildRecommendationBehaviorMetadata(currentRec ?? recommendation, metadata)
      const behaviorEvent = await recordUserBehaviorEvent({
        userId: input.userId,
        eventType: 'recommendation_accepted',
        subjectType: (currentRec ?? recommendation).subjectType,
        subjectId: String((currentRec ?? recommendation).subjectId),
        metadata: behaviorMetadata,
      })

      return {
        recommendationId: input.recommendationId,
        status: 'accepted' as RecommendationStatus,
        appliedChanges: changeResult,
        recommendationEventId: recEvent.id,
        userBehaviorEventId: behaviorEvent.id,
      }
    },
  )
}

async function executeApplyChangeInTxn(
  recommendation: RecommendationRecord,
  subjectId: number | string,
): Promise<{
  candidateType: RecommendationCandidateType
  candidateId: string
  changeType: string
  changeDetail: string
}> {
  const { candidateType, candidateId, userId, subjectType } = recommendation

  if (candidateType === 'tag') {
    const tag = await tagsTable.get(candidateId)
    if (!tag || tag.userId !== userId) {
      throw new Error(`Tag not found for candidate: ${candidateId}`)
    }
    const dockItem = await getDockItemForUser(userId, subjectId as number)
    if (!dockItem) {
      throw new Error(`Dock item not found: ${subjectId}`)
    }
    const normalized = normalizeTagName(tag.name)
    if (!normalized) {
      throw new Error(`Invalid tag name: ${tag.name}`)
    }
    const newTags = dedupeTagNames([...dockItem.userTags, normalized])
    await dockItemsTable.update(dockItem.id, { userTags: newTags })
    return {
      candidateType: 'tag',
      candidateId,
      changeType: 'add_tag',
      changeDetail: `Added tag "${tag.name}" to dock item #${subjectId}`,
    }
  }

  if (candidateType === 'project') {
    const collection = await collectionsTable.get(candidateId)
    if (!collection || collection.userId !== userId) {
      throw new Error(`Collection not found for candidate: ${candidateId}`)
    }
    const dockItem = await getDockItemForUser(userId, subjectId as number)
    if (!dockItem) {
      throw new Error(`Dock item not found: ${subjectId}`)
    }
    const previousProject = dockItem.selectedProject
    const isReplacing = previousProject !== null && previousProject !== collection.name
    await dockItemsTable.update(dockItem.id, { selectedProject: collection.name })
    return {
      candidateType: 'project',
      candidateId,
      changeType: isReplacing ? 'replace_project' : 'set_project',
      changeDetail: isReplacing
        ? `Replaced project "${previousProject}" with "${collection.name}" on dock item #${subjectId}`
        : `Set project "${collection.name}" on dock item #${subjectId}`,
    }
  }

  if (candidateType === 'mindNode') {
    const targetNode = await mindNodesTable.get(candidateId)
    if (!targetNode || targetNode.userId !== userId) {
      throw new Error(`Mind node not found for candidate: ${candidateId}`)
    }

    if (subjectType === 'mindNode') {
      const sourceNode = await mindNodesTable.get(String(subjectId))
      if (!sourceNode || sourceNode.userId !== userId) {
        throw new Error(`Source mind node not found: ${subjectId}`)
      }
      const existingEdge = await findMindEdgeBetweenNodes(userId, sourceNode.id, targetNode.id)
      if (existingEdge) {
        return {
          candidateType: 'mindNode',
          candidateId,
          changeType: 'already_connected',
          changeDetail: `Edge already exists between "${sourceNode.label}" and "${targetNode.label}"`,
        }
      }
      const edge = await upsertMindEdge({
        userId,
        sourceNodeId: sourceNode.id,
        targetNodeId: targetNode.id,
        edgeType: 'suggested',
        source: 'system',
        confidence: recommendation.confidenceScore,
        reason: 'recommendation_accepted',
      })
      if (!edge) {
        return {
          candidateType: 'mindNode',
          candidateId,
          changeType: 'already_connected',
          changeDetail: `Edge already exists between "${sourceNode.label}" and "${targetNode.label}"`,
        }
      }
      return {
        candidateType: 'mindNode',
        candidateId,
        changeType: 'create_edge',
        changeDetail: `Created edge from "${sourceNode.label}" to "${targetNode.label}"`,
      }
    }

    const numericSubjectId = subjectId as number
    const dockItem = await getDockItemForUser(userId, numericSubjectId)
    if (!dockItem) {
      throw new Error(`Dock item not found: ${subjectId}`)
    }
    const dockMindNodes = await mindNodesTable
      .where('userId')
      .equals(userId)
      .and((n) => n.documentId === numericSubjectId)
      .toArray()
    let sourceNode = dockMindNodes[0]
    let createdSource = false
    if (!sourceNode) {
      sourceNode = await upsertMindNode({
        userId,
        nodeType: 'document',
        label: dockItem.topic || dockItem.rawText?.slice(0, 40) || `Dock Item #${numericSubjectId}`,
        documentId: numericSubjectId,
        state: 'drifting',
      })
      createdSource = true
    }
    const edgeId = makeMindEdgeId(userId, sourceNode.id, targetNode.id, 'suggested')
    const existingEdge = await mindEdgesTable.get(edgeId)
    const now = new Date()
    await mindEdgesTable.put({
      id: edgeId,
      userId,
      sourceNodeId: sourceNode.id,
      targetNodeId: targetNode.id,
      edgeType: 'suggested',
      strength: 0.5,
      source: 'system',
      confidence: null,
      reason: null,
      createdAt: existingEdge?.createdAt ?? now,
      updatedAt: now,
    })
    return {
      candidateType: 'mindNode',
      candidateId,
      changeType: 'create_edge',
      changeDetail: createdSource
        ? `Created mind node "${sourceNode.label}" and linked to "${targetNode.label}"`
        : `Created edge from "${sourceNode.label}" to "${targetNode.label}"`,
    }
  }

  throw new Error(
    `Apply for candidateType "${candidateType}" is not supported. ` +
    `Supported types: tag, project, mindNode.`,
  )
}

const RECOMMENDATION_DOCK_QUEUE_STATUSES: RecommendationStatus[] = [
  'generated',
  'shown',
  'accepted',
  'rejected',
  'modified',
  'ignored',
  'superseded',
]
const RECOMMENDATION_DOCK_QUEUE_CANDIDATE_TYPES: RecommendationCandidateType[] = [
  'tag',
  'project',
  'mindNode',
  'entry',
  'document',
]
const RECOMMENDATION_DOCK_QUEUE_SUBJECT_TYPES: RecommendationSubjectType[] = [
  'dockItem',
  'entry',
  'document',
  'mindNode',
]
const RECOMMENDATION_DOCK_QUEUE_SORT_FIELDS: RecommendationDockQueueSortBy[] = [
  'rank',
  'confidenceScore',
  'createdAt',
]
const RECOMMENDATION_DOCK_QUEUE_SORT_DIRECTIONS: RecommendationDockQueueSortDirection[] = ['asc', 'desc']
const RECOMMENDATION_FEEDBACK_EVENT_TYPES: RecommendationEventType[] = [
  'recommendation_accepted',
  'recommendation_rejected',
  'recommendation_modified',
  'recommendation_ignored',
  'recommendation_superseded',
]

function validateRecommendationDockQueueQuery(query: RecommendationDockQueueQuery): void {
  if (query.status && !RECOMMENDATION_DOCK_QUEUE_STATUSES.includes(query.status)) {
    throw new Error(`Invalid recommendation dock queue status filter: ${String(query.status)}`)
  }
  if (query.candidateType && !RECOMMENDATION_DOCK_QUEUE_CANDIDATE_TYPES.includes(query.candidateType)) {
    throw new Error(`Invalid recommendation dock queue candidateType filter: ${String(query.candidateType)}`)
  }
  if (query.subjectType && !RECOMMENDATION_DOCK_QUEUE_SUBJECT_TYPES.includes(query.subjectType)) {
    throw new Error(`Invalid recommendation dock queue subjectType filter: ${String(query.subjectType)}`)
  }
  if (query.recommendationType !== undefined && typeof query.recommendationType !== 'string') {
    throw new Error(`Invalid recommendation dock queue recommendationType filter: ${String(query.recommendationType)}`)
  }
  if (query.sortBy && !RECOMMENDATION_DOCK_QUEUE_SORT_FIELDS.includes(query.sortBy)) {
    throw new Error(`Invalid recommendation dock queue sortBy: ${String(query.sortBy)}`)
  }
  if (query.sortDirection && !RECOMMENDATION_DOCK_QUEUE_SORT_DIRECTIONS.includes(query.sortDirection)) {
    throw new Error(`Invalid recommendation dock queue sortDirection: ${String(query.sortDirection)}`)
  }
  if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit <= 0)) {
    throw new Error(`Invalid recommendation dock queue limit: ${String(query.limit)}`)
  }
  parseRecommendationDockQueueCursor(query.cursor)
}

function parseRecommendationDockQueueCursor(cursor?: string | null): number {
  if (cursor === undefined || cursor === null || cursor === '') return 0
  const offset = Number.parseInt(cursor, 10)
  if (!Number.isInteger(offset) || offset < 0 || String(offset) !== cursor) {
    throw new Error(`Invalid recommendation dock queue cursor: ${cursor}`)
  }
  return offset
}

function defaultRecommendationDockQueueSortDirection(sortBy: RecommendationDockQueueSortBy): RecommendationDockQueueSortDirection {
  return sortBy === 'rank' ? 'asc' : 'desc'
}

function matchesRecommendationDockQueueFilters(
  recommendation: RecommendationRecord,
  filters: RecommendationDockQueueFilters,
): boolean {
  return (!filters.status || recommendation.status === filters.status) &&
    (!filters.candidateType || recommendation.candidateType === filters.candidateType) &&
    (!filters.subjectType || recommendation.subjectType === filters.subjectType) &&
    (!filters.subjectId || String(recommendation.subjectId) === String(filters.subjectId)) &&
    (!filters.recommendationType || recommendation.recommendationType === filters.recommendationType)
}

function groupRecommendationEventsByRecommendationId(
  events: RecommendationEventRecord[],
): Map<string, PersistedRecommendationEvent[]> {
  const grouped = new Map<string, PersistedRecommendationEvent[]>()

  for (const event of events) {
    const persisted = toPersistedRecommendationEvent(event)
    if (!persisted) continue
    const current = grouped.get(persisted.recommendationId) ?? []
    current.push(persisted)
    grouped.set(persisted.recommendationId, current)
  }

  Array.from(grouped.values()).forEach((groupedEvents: PersistedRecommendationEvent[]) => {
    groupedEvents.sort((left, right) =>
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.id.localeCompare(right.id),
    )
  })

  return grouped
}

function buildRecommendationDockQueueItem(
  recommendation: PersistedRecommendation,
  events: PersistedRecommendationEvent[],
): RecommendationDockQueueItem {
  const reason = parseRecommendationReasonJson(recommendation.reasonJson)
  const generatedEvent = events.find((event) => event.eventType === 'recommendation_generated')
  const generatedMetadata = generatedEvent?.metadata ?? null
  const feedbackEvent = events.find((event) => RECOMMENDATION_FEEDBACK_EVENT_TYPES.includes(event.eventType))
  const isShown = recommendation.status === 'shown' || events.some((event) => event.eventType === 'recommendation_shown')
  const hasFeedback = isRecommendationFeedbackStatus(recommendation.status) || Boolean(feedbackEvent)
  const scoreSummary = buildRecommendationDockQueueScoreSummary(recommendation, reason, generatedMetadata)

  return {
    id: recommendation.id,
    userId: recommendation.userId,
    status: recommendation.status,
    recommendationType: recommendation.recommendationType,
    subjectType: recommendation.subjectType,
    subjectId: recommendation.subjectId,
    candidateType: recommendation.candidateType,
    candidateId: recommendation.candidateId,
    confidenceScore: recommendation.confidenceScore,
    createdAt: recommendation.createdAt,
    updatedAt: recommendation.updatedAt,
    reasonSummary: buildRecommendationDockQueueReasonSummary(recommendation, reason, generatedMetadata),
    scoreSummary,
    evidenceSummary: buildRecommendationDockQueueEvidenceSummary(reason, generatedMetadata),
    isShown,
    hasFeedback,
  }
}

function buildRecommendationDockQueueReasonSummary(
  recommendation: PersistedRecommendation,
  reason: Record<string, unknown> | null,
  generatedMetadata: Record<string, unknown> | null,
): RecommendationReasonSummary {
  return {
    source: readString(reason?.source) ?? readString(generatedMetadata?.source),
    reason: readString(reason?.scoreReason) ??
      readString(reason?.reason) ??
      `${recommendation.recommendationType} recommendation for ${recommendation.candidateType}`,
    context: {
      subjectType: recommendation.subjectType,
      subjectId: recommendation.subjectId,
    },
    candidate: {
      candidateType: recommendation.candidateType,
      candidateId: recommendation.candidateId,
    },
  }
}

function buildRecommendationDockQueueScoreSummary(
  recommendation: PersistedRecommendation,
  reason: Record<string, unknown> | null,
  generatedMetadata: Record<string, unknown> | null,
): RecommendationScoreSummary {
  const rank = readNumber(reason?.rank) ?? readNumber(generatedMetadata?.rank)
  const scoreBreakdown = readRecord(reason?.scoreBreakdown)

  return {
    confidenceScore: recommendation.confidenceScore,
    score: readNumber(reason?.score) ?? readNumber(generatedMetadata?.score) ?? recommendation.confidenceScore,
    rank: rank === null ? null : rank,
    scoreReason: readString(reason?.scoreReason),
    scoreBreakdown,
  }
}

function buildRecommendationDockQueueEvidenceSummary(
  reason: Record<string, unknown> | null,
  generatedMetadata: Record<string, unknown> | null,
): RecommendationDockQueueEvidenceSummary {
  const explicitSummary = readEvidenceSummary(reason?.evidenceSummary) ??
    readEvidenceSummary(generatedMetadata?.evidenceSummary)
  if (explicitSummary) return explicitSummary

  const recall = readRecord(reason?.recall)
  const evidence = readUnknownArray(recall?.evidence) ?? readUnknownArray(reason?.evidence) ?? []
  const sources = uniqueSortedStrings(evidence.map((item) => readString(readRecord(item)?.source)).filter(isString))
  const evidenceTypes = uniqueSortedStrings(
    evidence.map((item) => readString(readRecord(item)?.evidenceType)).filter(isString),
  )
  const matchedValues = uniqueSortedStrings(
    evidence.map((item) => readString(readRecord(item)?.matchedValue)).filter(isString),
  ).slice(0, 5)
  const strongestContribution = Math.max(
    0,
    ...evidence.map((item) => readNumber(readRecord(item)?.confidenceContribution) ?? 0),
  )

  return {
    evidenceCount: evidence.length,
    sources,
    evidenceTypes,
    matchedValues,
    strongestContribution: evidence.length > 0 ? strongestContribution : null,
  }
}

function readEvidenceSummary(value: unknown): RecommendationDockQueueEvidenceSummary | null {
  const summary = readRecord(value)
  if (!summary) return null

  return {
    evidenceCount: readNumber(summary.evidenceCount) ?? 0,
    sources: readStringArray(summary.sources),
    evidenceTypes: readStringArray(summary.evidenceTypes),
    matchedValues: readStringArray(summary.matchedValues),
    strongestContribution: readNumber(summary.strongestContribution),
  }
}

function parseRecommendationReasonJson(reasonJson: string | null): Record<string, unknown> | null {
  if (!reasonJson) return null
  try {
    const parsed = JSON.parse(reasonJson)
    return readRecord(parsed)
  } catch {
    return null
  }
}

function isRecommendationFeedbackStatus(status: RecommendationStatus): boolean {
  return status === 'accepted' || status === 'rejected' || status === 'modified' || status === 'ignored' || status === 'superseded'
}

function compareRecommendationDockQueueItems(
  left: RecommendationDockQueueItem,
  right: RecommendationDockQueueItem,
  sortBy: RecommendationDockQueueSortBy,
  sortDirection: RecommendationDockQueueSortDirection,
): number {
  const multiplier = sortDirection === 'asc' ? 1 : -1
  const compared = compareRecommendationDockQueuePrimarySort(left, right, sortBy) * multiplier
  if (compared !== 0) return compared

  return compareNullableNumbers(left.scoreSummary.rank, right.scoreSummary.rank, true) ||
    right.confidenceScore - left.confidenceScore ||
    right.createdAt.getTime() - left.createdAt.getTime() ||
    left.id.localeCompare(right.id)
}

function compareRecommendationDockQueuePrimarySort(
  left: RecommendationDockQueueItem,
  right: RecommendationDockQueueItem,
  sortBy: RecommendationDockQueueSortBy,
): number {
  if (sortBy === 'rank') {
    return compareNullableNumbers(left.scoreSummary.rank, right.scoreSummary.rank, true)
  }
  if (sortBy === 'confidenceScore') {
    return left.confidenceScore - right.confidenceScore
  }
  return left.createdAt.getTime() - right.createdAt.getTime()
}

function compareNullableNumbers(left: number | null, right: number | null, missingLast: boolean): number {
  if (left === null && right === null) return 0
  if (left === null) return missingLast ? 1 : -1
  if (right === null) return missingLast ? -1 : 1
  return left - right
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readUnknownArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? uniqueSortedStrings(value.filter(isString)) : []
}

function uniqueSortedStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort()
}

export async function generateBasicCandidates(input: {
  userId: string
  subjectType: BasicCandidateContext['subjectType']
  subjectId: number | string
}): Promise<BasicCandidate[]> {
  const context = await getBasicCandidateContext(input.userId, input.subjectType, input.subjectId)
  if (!context) return []

  const [tags, collections, mindNodes, documents] = await Promise.all([
    tagsTable.where('userId').equals(input.userId).toArray(),
    collectionsTable.where('userId').equals(input.userId).toArray(),
    mindNodesTable.where('userId').equals(input.userId).toArray(),
    entriesTable.where('userId').equals(input.userId).toArray(),
  ])

  return buildBasicCandidates({
    userId: input.userId,
    context,
    tags: tags.map((tag) => ({
      id: tag.id as string,
      userId: tag.userId,
      name: tag.name,
    })),
    collections: collections.map((collection) => ({
      id: collection.id as string,
      userId: collection.userId,
      name: collection.name,
      collectionType: collection.collectionType,
    })),
    mindNodes: mindNodes.map((node) => ({
      id: node.id as string,
      userId: node.userId,
      nodeType: node.nodeType,
      label: node.label,
      documentId: node.documentId ?? null,
      degreeScore: node.degreeScore ?? 0,
      recentActivityScore: node.recentActivityScore ?? 0,
      documentWeightScore: node.documentWeightScore ?? 0,
      userPinScore: node.userPinScore ?? 0,
      clusterCenterScore: node.clusterCenterScore ?? 0,
      metadata: node.metadata ?? null,
    })),
    documents: documents.map((document) => ({
      id: document.id as number,
      userId: document.userId,
      tags: document.tags,
      project: document.project ?? null,
    })),
  })
}

export async function createRecommendationFromBasicCandidate(input: {
  userId: string
  subjectType: BasicCandidateContext['subjectType']
  subjectId: number | string
  candidate: BasicCandidate
  recommendationType?: string
}): Promise<{
  recommendation: PersistedRecommendation
  recommendationEvent: PersistedRecommendationEvent
}> {
  const { recommendation, recommendationEvent } = await db.transaction(
    'rw',
    recommendationsTable,
    recommendationEventsTable,
    async () => {
      const createdRecommendation = await createRecommendation({
        userId: input.userId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        recommendationType: input.recommendationType ?? `basic_${input.candidate.candidateType}_candidate`,
        candidateType: input.candidate.candidateType,
        candidateId: input.candidate.candidateId,
        confidenceScore: input.candidate.confidenceScore,
        reasonJson: JSON.stringify(input.candidate.reasonJson),
        status: 'generated',
      })

      const createdEvent = await recordRecommendationEvent({
        recommendationId: createdRecommendation.id,
        userId: input.userId,
        eventType: 'recommendation_generated',
        metadata: {
          source: 'basic_candidate_recall',
          candidateType: input.candidate.candidateType,
          candidateId: input.candidate.candidateId,
          confidenceScore: input.candidate.confidenceScore,
          evidence: input.candidate.evidence,
          context: input.candidate.reasonJson.context,
        },
      })

      return {
        recommendation: createdRecommendation,
        recommendationEvent: createdEvent,
      }
    },
  )

  return { recommendation, recommendationEvent }
}

export async function generateRecommendationsForContext(input: {
  userId: string
  subjectType: BasicCandidateContext['subjectType']
  subjectId: number | string
  topK?: number
  source?: string
  recommendationType?: string
}): Promise<{
  recommendations: PersistedRecommendation[]
  recommendationEvents: PersistedRecommendationEvent[]
  scoredCandidates: ScoredRecommendationCandidate[]
}> {
  const candidates = await generateBasicCandidates({
    userId: input.userId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
  })
  if (candidates.length === 0) {
    return {
      recommendations: [],
      recommendationEvents: [],
      scoredCandidates: [],
    }
  }

  const signalSummaries = await buildRecommendationSignalSummaries(input.userId)
  const scoredCandidates = scoreBasicCandidatesForRecommendation({
    candidates,
    signalSummaries,
    topK: input.topK,
  })
  if (scoredCandidates.length === 0) {
    return {
      recommendations: [],
      recommendationEvents: [],
      scoredCandidates,
    }
  }

  const source = input.source ?? 'recommendation_engine_mvp'
  const { recommendations, recommendationEvents } = await db.transaction(
    'rw',
    recommendationsTable,
    recommendationEventsTable,
    async () => {
      const existingPending = await recommendationsTable
        .where('userId')
        .equals(input.userId)
        .and((rec) =>
          isRecommendationPendingStatus(rec.status) &&
          rec.subjectType === input.subjectType &&
          String(rec.subjectId) === String(input.subjectId),
        )
        .toArray()

      for (const pending of existingPending) {
        await recommendationsTable.update(pending.id, {
          status: 'superseded',
          updatedAt: new Date(),
        })
        await recordRecommendationEvent({
          recommendationId: pending.id,
          userId: input.userId,
          eventType: 'recommendation_superseded',
          metadata: {
            source: 'recommendation_regeneration',
            reason: 'Superseded by new generation round',
            subjectType: input.subjectType,
            subjectId: input.subjectId,
          },
        })
      }

      const batchRecommendations: PersistedRecommendation[] = []
      const batchEvents: PersistedRecommendationEvent[] = []
      const seenDedupeKeys = new Set<string>()

      for (const scoredCandidate of scoredCandidates) {
        const candidate = scoredCandidate.candidate
        const dedupeKey = makeRecommendationDedupeKey(
          input.subjectType,
          input.subjectId,
          candidate.candidateType,
          candidate.candidateId,
        )
        if (seenDedupeKeys.has(dedupeKey)) continue
        seenDedupeKeys.add(dedupeKey)

        const existingActive = await recommendationsTable
          .where('userId')
          .equals(input.userId)
          .and((rec) =>
            isRecommendationPendingStatus(rec.status) &&
            rec.subjectType === input.subjectType &&
            String(rec.subjectId) === String(input.subjectId) &&
            rec.candidateType === candidate.candidateType &&
            rec.candidateId === candidate.candidateId,
          )
          .count()

        if (existingActive > 0) continue

        const recommendation = await createRecommendation({
          userId: input.userId,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          recommendationType: input.recommendationType ?? `engine_${candidate.candidateType}_candidate`,
          candidateType: candidate.candidateType,
          candidateId: candidate.candidateId,
          confidenceScore: scoredCandidate.score,
          reasonJson: JSON.stringify(buildRecommendationEngineReasonJson({
            scoredCandidate,
            source,
            topK: input.topK,
          })),
          status: 'generated',
        })

        const recommendationEvent = await recordRecommendationEvent({
          recommendationId: recommendation.id,
          userId: input.userId,
          eventType: 'recommendation_generated',
          metadata: buildRecommendationGeneratedMetadata(scoredCandidate, source),
        })

        batchRecommendations.push(recommendation)
        batchEvents.push(recommendationEvent)
      }

      return {
        recommendations: batchRecommendations,
        recommendationEvents: batchEvents,
      }
    },
  )

  return {
    recommendations,
    recommendationEvents,
    scoredCandidates,
  }
}

function buildRecommendationEngineReasonJson(input: {
  scoredCandidate: ScoredRecommendationCandidate
  source: string
  topK?: number
}): Record<string, unknown> {
  const { candidate, rank, score, scoreReason, scoreBreakdown, evidenceSummary } = input.scoredCandidate

  return {
    source: input.source,
    reason: 'deterministic local recommendation engine scoring',
    candidate: {
      candidateType: candidate.candidateType,
      candidateId: candidate.candidateId,
      recallConfidenceScore: candidate.confidenceScore,
    },
    context: candidate.reasonJson.context,
    recall: {
      source: candidate.reasonJson.source,
      reason: candidate.reasonJson.reason,
      confidenceScore: candidate.reasonJson.confidenceScore,
      evidence: candidate.evidence,
    },
    score,
    scoreReason,
    scoreBreakdown,
    evidenceSummary,
    rank,
    topK: input.topK ?? 5,
  }
}

function buildRecommendationGeneratedMetadata(
  scoredCandidate: ScoredRecommendationCandidate,
  source: string,
): Record<string, unknown> {
  return {
    source,
    rank: scoredCandidate.rank,
    score: scoredCandidate.score,
    candidateType: scoredCandidate.candidate.candidateType,
    candidateId: scoredCandidate.candidate.candidateId,
    evidenceSummary: scoredCandidate.evidenceSummary,
    context: scoredCandidate.candidate.reasonJson.context,
  }
}

async function buildRecommendationSignalSummaries(userId: string): Promise<RecommendationSignalSummary[]> {
  const events = await userBehaviorEventsTable.where('userId').equals(userId).and((event) => {
    switch (event.eventType) {
      case 'recommendation_accepted':
      case 'recommendation_rejected':
      case 'recommendation_ignored':
      case 'recommendation_shown':
        return true
      default:
        return false
    }
  }).toArray()
  const summaries = new Map<string, Required<RecommendationSignalSummary>>()

  for (const event of events) {
    const signalTarget = readRecommendationSignalTarget(event.metadata ?? null)
    if (!signalTarget) continue

    const key = `${signalTarget.candidateType}:${signalTarget.candidateId}`
    const existing = summaries.get(key) ?? {
      candidateType: signalTarget.candidateType,
      candidateId: signalTarget.candidateId,
      acceptedCount: 0,
      rejectedCount: 0,
      ignoredCount: 0,
      shownCount: 0,
    }

    switch (event.eventType) {
      case 'recommendation_accepted':
        existing.acceptedCount += 1
        break
      case 'recommendation_rejected':
        existing.rejectedCount += 1
        break
      case 'recommendation_ignored':
        existing.ignoredCount += 1
        break
      case 'recommendation_shown':
        existing.shownCount += 1
        break
      default:
        break
    }

    summaries.set(key, existing)
  }

  return Array.from(summaries.values())
}

function readRecommendationSignalTarget(
  metadata: Record<string, unknown> | null,
): Pick<RecommendationSignalSummary, 'candidateType' | 'candidateId'> | null {
  const candidateType = metadata?.candidateType
  const candidateId = metadata?.candidateId
  if (!isBasicCandidateType(candidateType) || typeof candidateId !== 'string' || !candidateId.trim()) {
    return null
  }

  return {
    candidateType,
    candidateId,
  }
}

function isBasicCandidateType(value: unknown): value is BasicCandidate['candidateType'] {
  return value === 'tag' || value === 'project' || value === 'mindNode'
}

async function getBasicCandidateContext(
  userId: string,
  subjectType: BasicCandidateContext['subjectType'],
  subjectId: number | string,
): Promise<BasicCandidateContext | null> {
  if (subjectType === 'dockItem') {
    const captureId = toNumericSubjectId(subjectId)
    if (captureId === null) return null

    const capture = await getDockItemForUser(userId, captureId)
    if (!capture) return null

    return {
      subjectType,
      subjectId: capture.id,
      rawText: capture.rawText,
      title: capture.topic,
      tags: capture.userTags,
      project: capture.selectedProject,
    }
  }

  if (subjectType === 'entry' || subjectType === 'document') {
    const documentId = toNumericSubjectId(subjectId)
    if (documentId === null) return null

    const document = await entriesTable.get(documentId)
    if (!document || document.userId !== userId) return null

    return {
      subjectType,
      subjectId: document.id as number,
      title: document.title,
      content: document.content,
      tags: document.tags,
      project: document.project,
      documentId: document.id as number,
    }
  }

  const node = await getMindNode(userId, String(subjectId))
  if (!node) return null

  return {
    subjectType,
    subjectId: node.id,
    mindNodeId: node.id,
    mindNodeLabel: node.label,
    mindNodeType: node.nodeType,
    documentId: node.documentId,
    metadata: node.metadata,
  }
}

function toNumericSubjectId(subjectId: number | string): number | null {
  if (typeof subjectId === 'number') return subjectId
  const parsed = Number.parseInt(subjectId, 10)
  return Number.isNaN(parsed) ? null : parsed
}

export async function getRecommendation(userId: string, recommendationId: string): Promise<PersistedRecommendation | null> {
  const rec = await recommendationsTable.get(recommendationId)
  if (!rec || rec.userId !== userId) return null
  return toPersistedRecommendation(rec)
}

export async function updateRecommendationStatus(
  userId: string,
  recommendationId: string,
  status: RecommendationStatus,
): Promise<PersistedRecommendation | null> {
  const rec = await recommendationsTable.get(recommendationId)
  if (!rec || rec.userId !== userId) return null

  await recommendationsTable.update(recommendationId, {
    status,
    updatedAt: new Date(),
  })

  return toPersistedRecommendation(await recommendationsTable.get(recommendationId))
}

export async function recordRecommendationFeedback(
  input: RecommendationFeedbackInput,
): Promise<RecommendationFeedbackResult> {
  const status = feedbackTypeToStatus(input.feedbackType)
  const eventType = feedbackTypeToEventType(input.feedbackType)
  const metadata: Record<string, unknown> = {
    source: 'recommendation_feedback',
    feedbackType: input.feedbackType,
  }
  if (input.feedbackPayload) {
    metadata.feedbackPayload = input.feedbackPayload
  }

  const preCheck = await recommendationsTable.get(input.recommendationId)
  if (!preCheck) {
    throw new Error(`Recommendation not found: ${input.recommendationId}`)
  }
  if (preCheck.userId !== input.userId) {
    throw new Error(`User ${input.userId} does not own recommendation ${input.recommendationId}`)
  }
  if (preCheck.status === 'accepted' && input.feedbackType !== 'accepted') {
    throw new Error(`Cannot ${input.feedbackType} an already accepted recommendation`)
  }
  if (preCheck.status === 'accepted' && input.feedbackType === 'accepted') {
    return {
      recommendation: {
        id: preCheck.id,
        status: preCheck.status as RecommendationStatus,
        updatedAt: preCheck.updatedAt,
      },
      feedbackEvent: {
        id: '',
        eventType: 'recommendation_accepted' as RecommendationEventType,
        recommendationId: preCheck.id,
      },
    }
  }
  if ((preCheck.status === 'rejected' || preCheck.status === 'superseded') && input.feedbackType === 'accepted') {
    throw new Error(
      `Cannot accept a ${preCheck.status} recommendation. ` +
      `Rejected or superseded recommendations cannot be re-accepted in the same generation round.`,
    )
  }
  if (preCheck.status === 'ignored' && input.feedbackType === 'accepted') {
    throw new Error(
      `Cannot accept an ignored recommendation. ` +
      `Ignored means this round was skipped; generate new recommendations instead.`,
    )
  }
  if (input.feedbackType === 'accepted' && !isSupportedCandidateTypeForApply(preCheck.candidateType)) {
    throw new Error(
      `Cannot accept recommendation: candidateType "${preCheck.candidateType}" is not supported for automatic apply. ` +
      `Only tag, project, and mindNode recommendations can be accepted.`,
    )
  }

  const { persisted, recEvent } = await db.transaction(
    'rw',
    recommendationsTable,
    recommendationEventsTable,
    userBehaviorEventsTable,
    async () => {
      const recommendation = await getRecommendationRecordForLifecycleWrite(input.userId, input.recommendationId)

      await recommendationsTable.update(input.recommendationId, {
        status,
        updatedAt: new Date(),
      })

      const createdEvent = await recordRecommendationEvent({
        recommendationId: input.recommendationId,
        userId: input.userId,
        eventType,
        metadata,
      })

      await recordUserBehaviorEvent({
        userId: input.userId,
        eventType,
        subjectType: recommendation.subjectType,
        subjectId: String(recommendation.subjectId),
        metadata: buildRecommendationBehaviorMetadata(recommendation, metadata),
      })

      const updated = await recommendationsTable.get(input.recommendationId)
      const updatedRecommendation = toPersistedRecommendation(updated)
      if (!updatedRecommendation) {
        throw new Error('Failed to retrieve updated recommendation')
      }

      return { persisted: updatedRecommendation, recEvent: createdEvent }
    },
  )

  return {
    recommendation: {
      id: persisted.id,
      status: persisted.status,
      updatedAt: persisted.updatedAt,
    },
    feedbackEvent: {
      id: recEvent.id,
      eventType: recEvent.eventType,
      recommendationId: recEvent.recommendationId,
    },
  }
}

export async function markRecommendationShown(
  input: RecommendationShownInput,
): Promise<RecommendationShownResult> {
  const { persisted, recEvent } = await db.transaction(
    'rw',
    recommendationsTable,
    recommendationEventsTable,
    userBehaviorEventsTable,
    async () => {
      const recommendation = await getRecommendationRecordForLifecycleWrite(input.userId, input.recommendationId)

      await recommendationsTable.update(input.recommendationId, {
        status: 'shown',
        updatedAt: new Date(),
      })

      const createdEvent = await recordRecommendationEvent({
        recommendationId: input.recommendationId,
        userId: input.userId,
        eventType: 'recommendation_shown',
        metadata: {
          source: 'recommendation_shown',
        },
      })

      await recordUserBehaviorEvent({
        userId: input.userId,
        eventType: 'recommendation_shown',
        subjectType: recommendation.subjectType,
        subjectId: String(recommendation.subjectId),
        metadata: buildRecommendationBehaviorMetadata(recommendation, {
          source: 'recommendation_shown',
        }),
      })

      const updated = await recommendationsTable.get(input.recommendationId)
      const updatedRecommendation = toPersistedRecommendation(updated)
      if (!updatedRecommendation) {
        throw new Error('Failed to retrieve updated recommendation')
      }

      return { persisted: updatedRecommendation, recEvent: createdEvent }
    },
  )

  return {
    recommendation: {
      id: persisted.id,
      status: persisted.status,
      updatedAt: persisted.updatedAt,
    },
    shownEvent: {
      id: recEvent.id,
      eventType: recEvent.eventType,
      recommendationId: recEvent.recommendationId,
    },
  }
}

async function getRecommendationRecordForLifecycleWrite(
  userId: string,
  recommendationId: string,
): Promise<RecommendationRecord> {
  const rec = await recommendationsTable.get(recommendationId)
  if (!rec) {
    throw new Error(`Recommendation not found: ${recommendationId}`)
  }
  if (rec.userId !== userId) {
    throw new Error(`User ${userId} does not own recommendation ${recommendationId}`)
  }
  return rec
}

export async function recordRecommendationEvent(input: RecommendationEventInput): Promise<PersistedRecommendationEvent> {
  await getRecommendationRecordForLifecycleWrite(input.userId, input.recommendationId)

  const now = new Date()
  const id = makeRecommendationEventId(input.userId, input.recommendationId, now.getTime())
  const record: RecommendationEventRecord = {
    id,
    recommendationId: input.recommendationId,
    userId: input.userId,
    eventType: input.eventType,
    metadata: input.metadata ?? null,
    createdAt: now,
  }
  await recommendationEventsTable.add(record)
  return toPersistedRecommendationEvent(await recommendationEventsTable.get(id)) as PersistedRecommendationEvent
}

function buildRecommendationBehaviorMetadata(
  recommendation: RecommendationRecord,
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return {
    recommendationId: recommendation.id,
    recommendationType: recommendation.recommendationType,
    subjectType: recommendation.subjectType,
    subjectId: recommendation.subjectId,
    candidateType: recommendation.candidateType,
    candidateId: recommendation.candidateId,
    ...metadata,
  }
}

export async function listRecommendationEvents(
  userId: string,
  filters?: { recommendationId?: string; eventType?: RecommendationEventType },
): Promise<PersistedRecommendationEvent[]> {
  let collection = recommendationEventsTable.where('userId').equals(userId)

  if (filters?.recommendationId) {
    collection = collection.and((e) => e.recommendationId === filters.recommendationId)
  }
  if (filters?.eventType) {
    collection = collection.and((e) => e.eventType === filters.eventType)
  }

  const events = await collection.reverse().sortBy('createdAt')
  return events.flatMap((e) => { const p = toPersistedRecommendationEvent(e); return p ? [p] : [] })
}

export async function recordUserBehaviorEvent(input: UserBehaviorEventInput): Promise<PersistedUserBehaviorEvent> {
  const now = new Date()
  const id = makeUserBehaviorEventId(input.userId, input.eventType, now.getTime())
  const record: UserBehaviorEventRecord = {
    id,
    userId: input.userId,
    eventType: input.eventType,
    subjectType: input.subjectType,
    subjectId: input.subjectId ?? null,
    metadata: input.metadata ?? null,
    createdAt: now,
  }
  await userBehaviorEventsTable.add(record)
  return toPersistedUserBehaviorEvent(await userBehaviorEventsTable.get(id)) as PersistedUserBehaviorEvent
}

export async function listUserBehaviorEvents(
  userId: string,
  filters?: { eventType?: UserBehaviorEventType; subjectType?: UserBehaviorSubjectType },
): Promise<PersistedUserBehaviorEvent[]> {
  let collection = userBehaviorEventsTable.where('userId').equals(userId)

  if (filters?.eventType) {
    collection = collection.and((e) => e.eventType === filters.eventType)
  }
  if (filters?.subjectType) {
    collection = collection.and((e) => e.subjectType === filters.subjectType)
  }

  const events = await collection.reverse().sortBy('createdAt')
  return events.flatMap((e) => { const p = toPersistedUserBehaviorEvent(e); return p ? [p] : [] })
}

function toPersistedTip(tip: TipRecord | undefined): PersistedTip | null {
  if (!tip || typeof tip.id !== 'number') return null
  return { ...tip, id: tip.id }
}

export async function createTip(
  userId: string,
  content: string,
  sourceType: TipSourceType = 'quick-capture',
): Promise<PersistedTip | null> {
  const trimmed = content.trim()
  if (!trimmed) throw new Error('content must not be empty')
  if (!userId) throw new Error('userId must not be empty')

  const now = new Date()
  const id = await tipsTable.add({
    userId,
    content: trimmed,
    sourceType,
    status: 'active',
    convertedDraftId: null,
    createdAt: now,
    updatedAt: now,
  })
  return toPersistedTip(await tipsTable.get(id as number))
}

export async function listActiveTips(userId: string): Promise<PersistedTip[]> {
  const tips = await tipsTable
    .where('userId')
    .equals(userId)
    .reverse()
    .sortBy('createdAt')
  return tips.flatMap((t) => {
    if (t.status !== 'active') return []
    const p = toPersistedTip(t)
    return p ? [p] : []
  })
}

export async function getTip(userId: string, tipId: number): Promise<PersistedTip | null> {
  const tip = await tipsTable.get(tipId)
  if (!tip || tip.userId !== userId) return null
  return toPersistedTip(tip)
}

export async function convertTipToDraft(
  userId: string,
  tipId: number,
): Promise<{ tip: PersistedTip | null; draft: PersistedEditorDraft | null }> {
  try {
    const result = await db.transaction('rw', [tipsTable, editorDraftsTable], async () => {
      const tip = await tipsTable.get(tipId)
      if (!tip || tip.userId !== userId || tip.status !== 'active') {
        return { tip: null, draft: null }
      }

      const draftId = await addDraftRecord(userId, tip.content.slice(0, 60), tip.content)

      await tipsTable.update(tipId, {
        status: 'converted',
        convertedDraftId: draftId,
        updatedAt: new Date(),
      })

      const updatedTip = toPersistedTip(await tipsTable.get(tipId))
      const persistedDraft = toPersistedEditorDraft(await editorDraftsTable.get(draftId))
      return { tip: updatedTip, draft: persistedDraft }
    })
    return result
  } catch {
    return { tip: null, draft: null }
  }
}

export async function discardTip(
  userId: string,
  tipId: number,
): Promise<PersistedTip | null> {
  const tip = await tipsTable.get(tipId)
  if (!tip || tip.userId !== userId || tip.status !== 'active') {
    return null
  }

  await tipsTable.update(tipId, {
    status: 'discarded',
    updatedAt: new Date(),
  })

  return toPersistedTip(await tipsTable.get(tipId))
}

export async function convertTipToMindNode(
  userId: string,
  tipId: number,
): Promise<{ tip: PersistedTip | null; mindNode: PersistedMindNode | null }> {
  try {
    const result = await db.transaction('rw', [tipsTable, mindNodesTable], async () => {
      const tip = await tipsTable.get(tipId)
      if (!tip || tip.userId !== userId || tip.status !== 'active') {
        return { tip: null, mindNode: null }
      }

      const label = tip.content.slice(0, 80)
      const now = new Date()
      const mindNodeId = makeMindNodeId(userId, 'fragment', label)

      await mindNodesTable.put({
        id: mindNodeId,
        userId,
        nodeType: 'fragment',
        label,
        state: 'drifting',
        documentId: null,
        degreeScore: 0,
        recentActivityScore: 0,
        documentWeightScore: 0,
        userPinScore: 0,
        clusterCenterScore: 0,
        positionX: null,
        positionY: null,
        metadata: { sourceTipId: tipId, sourceType: tip.sourceType },
        createdAt: now,
        updatedAt: now,
      })

      await tipsTable.update(tipId, {
        status: 'linked',
        updatedAt: new Date(),
      })

      const updatedTip = toPersistedTip(await tipsTable.get(tipId))
      const persistedMindNode = toPersistedMindNode(await mindNodesTable.get(mindNodeId))
      return { tip: updatedTip, mindNode: persistedMindNode }
    })
    return result
  } catch {
    return { tip: null, mindNode: null }
  }
}

export async function syncDocumentsToMindNodes(
  userId: string,
): Promise<number> {
  try {
    const [documents, existingMindNodes] = await Promise.all([
      listArchivedEntries(userId),
      listMindNodes(userId),
    ])

    const existingDocIds = new Set(
      existingMindNodes
        .filter(n => n.documentId !== null)
        .map(n => n.documentId)
    )

    let createdCount = 0

    for (const doc of documents) {
      if (existingDocIds.has(doc.id)) continue

      await upsertMindNode({
        userId,
        nodeType: 'document',
        label: doc.title || doc.content?.slice(0, 60) || 'Untitled Document',
        state: 'anchored',
        documentId: doc.id,
        metadata: { sourceType: 'document', entryId: doc.id },
      })
      createdCount++
    }

    return createdCount
  } catch {
    return 0
  }
}

export async function syncDockStructureToMind(
  userId: string,
): Promise<{ projectNodes: number; tagNodes: number; edges: number }> {
  const result = { projectNodes: 0, tagNodes: 0, edges: 0 }

  const [entries, tags, existingNodes] = await Promise.all([
    listArchivedEntries(userId),
    listTags(userId),
    listMindNodes(userId),
  ])

  const existingByLabel = new Map<string, PersistedMindNode>()
  existingNodes.forEach(n => existingByLabel.set(n.label, n))

  const existingDocNodes = existingNodes.filter(n => n.nodeType === 'document' && n.documentId !== null)
  const docNodeByEntryId = new Map<number, PersistedMindNode>()
  existingDocNodes.forEach(n => {
    if (n.documentId != null) docNodeByEntryId.set(n.documentId, n)
  })

  const uniqueProjects: string[] = []
  entries.forEach(e => { if (e.project && !uniqueProjects.includes(e.project)) uniqueProjects.push(e.project) })

  const uniqueTagNames: string[] = []
  tags.forEach(t => { if (!uniqueTagNames.includes(t.name)) uniqueTagNames.push(t.name) })
  entries.forEach(e => e.tags.forEach(t => { if (!uniqueTagNames.includes(t)) uniqueTagNames.push(t) }))

  for (const projectName of uniqueProjects) {
    const existing = existingByLabel.get(projectName)
    if (existing) continue
    const node = await upsertMindNode({
      userId,
      nodeType: 'project',
      label: projectName,
      state: 'anchored',
      metadata: { sourceType: 'dock_project', projectName },
    })
    if (node) {
      result.projectNodes++
      existingByLabel.set(projectName, node)
    }
  }

  for (const tagName of uniqueTagNames) {
    const existing = existingByLabel.get(tagName)
    if (existing) continue
    const node = await upsertMindNode({
      userId,
      nodeType: 'tag',
      label: tagName,
      state: 'anchored',
      metadata: { sourceType: 'dock_tag', tagName },
    })
    if (node) {
      result.tagNodes++
      existingByLabel.set(tagName, node)
    }
  }

  const existingEdges = await listMindEdges(userId)

  for (const entry of entries) {
    const docNode = docNodeByEntryId.get(entry.id)
    if (!docNode) continue

    if (entry.project) {
      const projectNode = existingByLabel.get(entry.project)
      if (projectNode) {
        const already = existingEdges.some(e =>
          e.sourceNodeId === projectNode.id && e.targetNodeId === docNode.id && e.edgeType === 'parent_child'
        )
        if (!already) {
          const edge = await upsertMindEdge({
            userId,
            sourceNodeId: projectNode.id,
            targetNodeId: docNode.id,
            edgeType: 'parent_child',
            strength: 0.8,
            source: 'system',
            confidence: 0.9,
            reason: 'dock-project-sync',
          })
          if (edge) result.edges++
        }
      }
    }

    for (const tagName of entry.tags) {
      const tagNode = existingByLabel.get(tagName)
      if (tagNode) {
        const already = existingEdges.some(e =>
          e.sourceNodeId === tagNode.id && e.targetNodeId === docNode.id && e.edgeType === 'semantic'
        )
        if (!already) {
          const edge = await upsertMindEdge({
            userId,
            sourceNodeId: tagNode.id,
            targetNodeId: docNode.id,
            edgeType: 'semantic',
            strength: 0.6,
            source: 'system',
            confidence: 0.7,
            reason: 'dock-tag-sync',
          })
          if (edge) result.edges++
        }
      }
    }
  }

  return result
}

export interface MindFirstScreenSyncResult {
  documentNodesCreated: number
  projectNodesCreated: number
  tagNodesCreated: number
  edgesCreated: number
}

export async function syncMindFirstScreen(
  userId: string,
): Promise<MindFirstScreenSyncResult> {
  const documentNodesCreated = await syncDocumentsToMindNodes(userId)

  const { projectNodes: projectNodesCreated, tagNodes: tagNodesCreated, edges: edgesCreated } = await syncDockStructureToMind(userId)

  return { documentNodesCreated, projectNodesCreated, tagNodesCreated, edgesCreated }
}

export interface MindGraphHealthSummary {
  totalNodes: number
  totalEdges: number
  orphanCount: number
  suggestedEdgeCount: number
  confirmedEdgeCount: number
  conflictEdgeCount: number
  rejectedRecommendationCount: number
  deferredRecommendationCount: number
}

export async function getMindGraphHealthSummary(userId: string): Promise<MindGraphHealthSummary> {
  const nodes = await listMindNodes(userId)
  const edges = await listMindEdges(userId)

  const connectedNodeIds = new Set<string>()
  edges.forEach(e => {
    connectedNodeIds.add(e.sourceNodeId)
    connectedNodeIds.add(e.targetNodeId)
  })
  const orphanCount = nodes.filter(n => !connectedNodeIds.has(n.id) && n.nodeType !== 'root').length

  const suggestedEdgeCount = edges.filter(e => e.edgeType === 'suggested').length
  const confirmedEdgeCount = edges.filter(e => e.edgeType === 'confirmed').length
  const conflictEdgeCount = edges.filter(e => e.edgeType === 'conflict').length

  const recommendations = await recommendationsTable
    .where('userId').equals(userId)
    .toArray()
  const rejectedRecommendationCount = recommendations.filter(r => r.status === 'rejected').length
  const deferredRecommendationCount = recommendations.filter(r => r.status === 'ignored').length

  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    orphanCount,
    suggestedEdgeCount,
    confirmedEdgeCount,
    conflictEdgeCount,
    rejectedRecommendationCount,
    deferredRecommendationCount,
  }
}

export async function generateMindNodeRecommendations(
  userId: string,
  nodeId: string,
  topK: number = 5,
): Promise<PersistedRecommendation[]> {
  const targetNode = await mindNodesTable.get(nodeId)
  if (!targetNode || targetNode.userId !== userId) return []

  const allNodes = await listMindNodes(userId)
  const allEdges = await listMindEdges(userId)

  const connectedIds = new Set<string>()
  allEdges.forEach((e) => {
    if (e.sourceNodeId === nodeId) connectedIds.add(e.targetNodeId)
    if (e.targetNodeId === nodeId) connectedIds.add(e.sourceNodeId)
  })
  connectedIds.add(nodeId)

  const existingRecs = await recommendationsTable
    .where('userId')
    .equals(userId)
    .and(r =>
      r.subjectType === 'mindNode' &&
      String(r.subjectId) === nodeId &&
      r.candidateType === 'mindNode',
    )
    .toArray()

  const skipCandidateIds = new Set<string>()
  for (const rec of existingRecs) {
    if (
      rec.status === 'generated' ||
      rec.status === 'shown' ||
      rec.status === 'accepted'
    ) {
      skipCandidateIds.add(rec.candidateId)
    }
    if (rec.status === 'rejected') {
      skipCandidateIds.add(rec.candidateId)
    }
  }

  const candidates: Array<{ nodeId: string; score: number; reason: string; source: string }> = []

  const targetTags: string[] = Array.isArray((targetNode.metadata as Record<string, unknown>)?.tagIds)
    ? ((targetNode.metadata as Record<string, unknown>).tagIds as string[])
    : []

  const targetNeighbors = new Set<string>()
  allEdges.forEach((e) => {
    if (e.sourceNodeId === nodeId) targetNeighbors.add(e.targetNodeId)
    if (e.targetNodeId === nodeId) targetNeighbors.add(e.sourceNodeId)
  })

  for (const node of allNodes) {
    if (connectedIds.has(node.id)) continue
    if (skipCandidateIds.has(node.id)) continue

    let score = 0
    let reason = ''
    let source = ''

    const nodeTags: string[] = Array.isArray((node.metadata as Record<string, unknown>)?.tagIds)
      ? ((node.metadata as Record<string, unknown>).tagIds as string[])
      : []
    const tagOverlap = targetTags.filter((t) => nodeTags.includes(t)).length
    if (tagOverlap > 0) {
      score += 0.3 + Math.min(tagOverlap * 0.15, 0.55)
      reason = `${tagOverlap} 个共同标签`
      source = 'tag_overlap'
    }

    const targetWords = targetNode.label.toLowerCase().split(/\s+/).filter((w: string) => w.length > 1)
    const nodeWords = node.label.toLowerCase().split(/\s+/).filter((w: string) => w.length > 1)
    const wordOverlap = targetWords.filter((w: string) => nodeWords.includes(w)).length
    if (wordOverlap > 0) {
      const titleScore = 0.2 + Math.min(wordOverlap * 0.15, 0.5)
      if (titleScore > score) {
        score = titleScore
        reason = `${wordOverlap} 个标题关键词匹配`
        source = 'title_keyword'
      } else {
        score += titleScore * 0.3
      }
    }

    if (node.nodeType === targetNode.nodeType && node.nodeType !== 'root') {
      score += 0.15
      if (!reason) {
        reason = `相同节点类型: ${node.nodeType}`
        source = 'node_type'
      }
    }

    const nodeNeighbors = new Set<string>()
    allEdges.forEach((e) => {
      if (e.sourceNodeId === node.id) nodeNeighbors.add(e.targetNodeId)
      if (e.targetNodeId === node.id) nodeNeighbors.add(e.sourceNodeId)
    })
    const sharedNeighbors = Array.from(targetNeighbors).filter((id: string) => nodeNeighbors.has(id)).length
    if (sharedNeighbors > 0) {
      score += 0.2 + Math.min(sharedNeighbors * 0.1, 0.4)
      if (!reason || source === 'node_type') {
        reason = `${sharedNeighbors} 个共同邻居`
        source = 'neighbor_overlap'
      }
    }

    if (score > 0.2) {
      candidates.push({ nodeId: node.id, score: Math.min(score, 0.95), reason, source })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  const topCandidates = candidates.slice(0, topK)

  const results: PersistedRecommendation[] = []
  for (const candidate of topCandidates) {
    const created = await createRecommendation({
      userId,
      subjectType: 'mindNode',
      subjectId: nodeId,
      recommendationType: 'link_suggestion',
      candidateType: 'mindNode',
      candidateId: candidate.nodeId,
      confidenceScore: candidate.score,
      reasonJson: JSON.stringify({
        reason_text: candidate.reason,
        source: candidate.source,
        confidence: candidate.score,
      }),
      status: 'generated',
    })
    results.push(created)
  }

  return results
}
