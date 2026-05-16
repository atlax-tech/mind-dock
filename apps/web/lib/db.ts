import Dexie, { type EntityTable } from 'dexie'

import type { EntryStatus, SourceType, SuggestionItem } from '@atlax/domain'
import type {
  ChatMessage,
  ChatSessionStatus,
} from '@atlax/domain/ports'
import type {
  CollectionType,
  EntryRelationType,
  RelationDirection,
  RelationSource,
  TagRelationSource,
  KnowledgeEventType,
  KnowledgeEventTargetType,
  TemporalActivityType,
  TemporalActivityEntityType,
} from '@atlax/domain'
import type {
  MindNodeType,
  MindNodeState,
  MindEdgeType,
} from '@atlax/domain'
import type {
  TabType,
} from '@atlax/domain'
import type {
  RecommendationStatus,
  RecommendationSubjectType,
  RecommendationCandidateType,
  RecommendationEventType,
  UserBehaviorEventType,
  UserBehaviorSubjectType,
} from '@atlax/domain'
import { createEditorContentPayload, textToTiptapDoc, type TiptapJSONContent } from './editorContentAdapter'

export interface DockItemRecord {
  id?: number
  userId: string
  workspaceId?: string
  rawText: string
  topic: string | null
  sourceType: SourceType
  status: EntryStatus
  suggestions: SuggestionItem[]
  userTags: string[]
  selectedActions: string[]
  selectedProject: string | null
  sourceId: number | null
  parentId: number | null
  processedAt: Date | null
  createdAt: Date
}

export interface PersistedDockItem extends DockItemRecord {
  id: number
}

export type CaptureRecord = DockItemRecord
export type PersistedCapture = PersistedDockItem

export interface TagRecord {
  id?: string
  userId: string
  workspaceId?: string
  name: string
  createdAt: Date
}

export interface PersistedTag extends TagRecord {
  id: string
}

export interface EntryRecord {
  id?: number
  userId: string
  workspaceId?: string
  sourceDockItemId: number
  title: string
  content: string
  contentJson?: TiptapJSONContent | null
  plainText?: string
  html?: string
  markdown?: string
  type: string
  tags: string[]
  project: string | null
  actions: string[]
  createdAt: Date
  archivedAt: Date
}

export interface PersistedEntry extends EntryRecord {
  id: number
}

export type DocumentRecord = EntryRecord
export type PersistedDocument = PersistedEntry

export interface ChatSessionRecord {
  id?: number
  userId: string
  workspaceId?: string
  title: string | null
  topic: string | null
  selectedType: string | null
  content: string
  status: ChatSessionStatus
  pinned: boolean
  messages: ChatMessage[]
  dockItemId: number | null
  createdAt: Date
  updatedAt: Date
}

export interface PersistedChatSession extends ChatSessionRecord {
  id: number
}

export type WidgetType = 'calendar'

export interface WidgetRecord {
  id?: number
  userId: string
  widgetType: WidgetType
  active: boolean
  config: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface PersistedWidget extends WidgetRecord {
  id: number
}

export interface CollectionRecord {
  id?: string
  userId: string
  workspaceId?: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  parentId: string | null
  sortOrder: number
  collectionType: CollectionType
  createdAt: Date
  updatedAt: Date
}

export interface PersistedCollection extends CollectionRecord {
  id: string
}

export interface EntryTagRelationRecord {
  id?: string
  userId: string
  workspaceId?: string
  entryId: number
  tagId: string
  source: TagRelationSource
  confidence: number | null
  createdAt: Date
}

export interface PersistedEntryTagRelation extends EntryTagRelationRecord {
  id: string
}

export interface EntryRelationRecord {
  id?: string
  userId: string
  workspaceId?: string
  sourceEntryId: number
  targetEntryId: number
  relationType: EntryRelationType
  direction: RelationDirection
  source: RelationSource
  confidence: number | null
  reason: string | null
  createdAt: Date
  updatedAt: Date
}

export interface PersistedEntryRelation extends EntryRelationRecord {
  id: string
}

export interface KnowledgeEventRecord {
  id?: string
  userId: string
  workspaceId?: string
  eventType: KnowledgeEventType
  targetType: KnowledgeEventTargetType
  targetId: string | null
  metadata: Record<string, unknown> | null
  createdAt: Date
}

export interface PersistedKnowledgeEvent extends KnowledgeEventRecord {
  id: string
}

export interface TemporalActivityRecord {
  id?: string
  userId: string
  workspaceId?: string
  type: TemporalActivityType
  entityType: TemporalActivityEntityType
  entityId: string
  occurredAt: Date
  dayKey: string
  weekKey: string
  monthKey: string
  title: string
  summary: string | null
  tagIds: string[]
  projectIds: string[]
  metadata: Record<string, unknown> | null
}

export interface PersistedTemporalActivity extends TemporalActivityRecord {
  id: string
}

export interface MindNodeRecord {
  id?: string
  userId: string
  workspaceId?: string
  nodeType: MindNodeType
  label: string
  state: MindNodeState
  documentId: number | null
  degreeScore: number
  recentActivityScore: number
  documentWeightScore: number
  userPinScore: number
  clusterCenterScore: number
  positionX: number | null
  positionY: number | null
  metadata: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}

export interface PersistedMindNode extends MindNodeRecord {
  id: string
}

export interface MindEdgeRecord {
  id?: string
  userId: string
  workspaceId?: string
  sourceNodeId: string
  targetNodeId: string
  edgeType: MindEdgeType
  strength: number
  source: 'user' | 'system' | 'import'
  confidence: number | null
  reason: string | null
  createdAt: Date
  updatedAt: Date
}

export interface PersistedMindEdge extends MindEdgeRecord {
  id: string
}

export interface WorkspaceSessionRecord {
  id?: string
  userId: string
  activeTabId: string | null
  lastActivityAt: Date
  createdAt: Date
  updatedAt: Date
}

export interface PersistedWorkspaceSession extends WorkspaceSessionRecord {
  id: string
}

export interface WorkspaceOpenTabRecord {
  id?: string
  userId: string
  sessionId: string
  tabType: TabType
  title: string
  path: string
  documentId: number | null
  isPinned: boolean
  isActive: boolean
  sortOrder: number
  openedAt: Date
  updatedAt: Date
}

export interface PersistedWorkspaceOpenTab extends WorkspaceOpenTabRecord {
  id: string
}

export interface RecentDocumentRecord {
  id?: string
  userId: string
  documentId: number
  title: string
  openCount: number
  lastOpenedAt: Date
  createdAt: Date
  updatedAt: Date
}

export interface PersistedRecentDocument extends RecentDocumentRecord {
  id: string
}

export type TipSourceType = 'text' | 'manual' | 'quick-capture'
export type TipStatus = 'active' | 'converted' | 'discarded' | 'linked'

export interface TipRecord {
  id?: number
  userId: string
  workspaceId?: string
  content: string
  sourceType: TipSourceType
  status: TipStatus
  convertedDraftId: number | null
  createdAt: Date
  updatedAt: Date
}

export interface PersistedTip extends TipRecord {
  id: number
}

export type DraftStatus = 'active' | 'published' | 'discarded'

export type DraftSourceType = 'entry' | 'document'

export interface EditorDraftRecord {
  id?: number
  userId: string
  workspaceId?: string
  draftKey: number
  title: string
  content: string
  contentJson?: TiptapJSONContent | null
  plainText?: string
  html?: string
  markdown?: string
  status: DraftStatus
  sourceEntryId?: number | null
  sourceType?: DraftSourceType | null
  tags: string[]
  project: string | null
  collectionId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface PersistedEditorDraft extends EditorDraftRecord {
  id: number
}

export interface RecommendationRecord {
  id?: string
  userId: string
  workspaceId?: string
  subjectType: RecommendationSubjectType
  subjectId: number | string
  recommendationType: string
  candidateType: RecommendationCandidateType
  candidateId: string
  confidenceScore: number
  reasonJson: string | null
  status: RecommendationStatus
  createdAt: Date
  updatedAt: Date
}

export interface PersistedRecommendation extends RecommendationRecord {
  id: string
}

export interface RecommendationEventRecord {
  id?: string
  recommendationId: string
  userId: string
  workspaceId?: string
  eventType: RecommendationEventType
  metadata: Record<string, unknown> | null
  createdAt: Date
}

export interface PersistedRecommendationEvent extends RecommendationEventRecord {
  id: string
}

export interface UserBehaviorEventRecord {
  id?: string
  userId: string
  workspaceId?: string
  eventType: UserBehaviorEventType
  subjectType: UserBehaviorSubjectType
  subjectId: string | null
  metadata: Record<string, unknown> | null
  createdAt: Date
}

export interface PersistedUserBehaviorEvent extends UserBehaviorEventRecord {
  id: string
}

export interface DockViewSettingsRecord {
  id?: string
  userId: string
  workspaceId?: string
  columnVisibility: {
    space: boolean
    status: boolean
    tags: boolean
    recommendations: boolean
    score: boolean
  }
  density: 'compact' | 'standard'
  defaultSort: 'updatedAt' | 'healthScore' | 'type'
  updatedAt: Date
}

export interface PersistedDockViewSettings extends DockViewSettingsRecord {
  id: string
}

/** @migration-only - Only used in Dexie upgrade migrations. New code must NOT reference this constant. */
const FALLBACK_USER_ID = '_legacy'

export function runV8Upgrade(tx: {
  table: (name: string) => {
    toCollection: () => {
      modify: (fn: (r: Record<string, unknown>) => void) => void
    }
  }
}): void {
  tx.table('dockItems').toCollection().modify((item: Record<string, unknown>) => {
    if (!item.userId) item.userId = FALLBACK_USER_ID
    if (!item.sourceType) item.sourceType = 'text'
    if (!item.status) item.status = 'pending'
    if (!Array.isArray(item.suggestions)) item.suggestions = []
    if (!Array.isArray(item.userTags)) item.userTags = []
    if (!Array.isArray(item.selectedActions)) item.selectedActions = []
    if (item.selectedProject === undefined) item.selectedProject = null
    if (item.sourceId === undefined) item.sourceId = null
    if (item.parentId === undefined) item.parentId = null
  })
  tx.table('entries').toCollection().modify((entry: Record<string, unknown>) => {
    if (!entry.userId) entry.userId = FALLBACK_USER_ID
    if (!entry.sourceDockItemId && entry.sourceDockItemId !== 0) {
      entry.sourceDockItemId = 0
    }
  })
  tx.table('tags').toCollection().modify((tag: Record<string, unknown>) => {
    if (!tag.userId) tag.userId = FALLBACK_USER_ID
  })
}

export interface AppEventRecord {
  id?: string
  userId: string
  workspaceId: string
  eventType: string
  payload: Record<string, unknown> | null
  _ts: number
}

export interface PersistedAppEvent extends AppEventRecord {
  id: string
}

export interface LocalTextFeatureSnapshotRecord {
  id?: string
  userId: string
  workspaceId: string
  targetType: string
  targetId: string
  contentHash: string
  language: string
  keywords: string[]
  entities: string[]
  compactText: string
  lengthMetrics: Record<string, number>
  structureHints: string[]
  source: string
  reason: string
  evidence: string
  confidence: number
  safetyLevel: string
  stale: boolean
  staleKey: 0 | 1
  expiredAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PersistedLocalTextFeatureSnapshot extends LocalTextFeatureSnapshotRecord {
  id: string
}

export interface SemanticFeatureSnapshotRecord {
  id?: string
  userId: string
  workspaceId: string
  targetType: string
  targetId: string
  contentHash: string
  modelProvider: string
  modelName: string
  modelVersion: string
  embeddingDim: number
  embeddingRef: string
  semanticSummary: string
  intent: string
  topics: string[]
  source: string
  reason: string
  evidence: string
  confidence: number
  safetyLevel: string
  stale: boolean
  staleKey: 0 | 1
  expiredAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PersistedSemanticFeatureSnapshot extends SemanticFeatureSnapshotRecord {
  id: string
}

export interface PreferenceMemoryRecord {
  id?: string
  userId: string
  workspaceId: string
  candidateType: string
  candidateId: string
  shownCount: number
  acceptedCount: number
  rejectedCount: number
  ignoredCount: number
  modifiedCount: number
  positiveWeight: number
  negativeWeight: number
  lastFeedbackAt: string | null
  source: string
  reason: string
  evidence: string
  confidence: number
  safetyLevel: string
  createdAt: string
  updatedAt: string
}

export interface PersistedPreferenceMemory extends PreferenceMemoryRecord {
  id: string
}

export interface HealthSignalRecord {
  id?: string
  userId: string
  workspaceId: string
  signalType: string
  targetType: string
  targetId: string
  severity: string
  status: string
  reason: string
  evidence: string
  confidence: number
  safetyLevel: string
  source: string
  detectedAt: string
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PersistedHealthSignal extends HealthSignalRecord {
  id: string
}

export interface GrowthSignalRecord {
  id?: string
  userId: string
  workspaceId: string
  signalType: string
  targetType: string
  targetId: string
  opportunityType: string
  status: string
  reason: string
  evidence: string
  confidence: number
  safetyLevel: string
  source: string
  detectedAt: string
  dismissedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PersistedGrowthSignal extends GrowthSignalRecord {
  id: string
}

export interface MaintenanceActionRecord {
  id?: string
  userId: string
  workspaceId: string
  actionType: string
  targetType: string
  targetId: string
  status: string
  reversible: boolean
  proposedPatch: Record<string, unknown> | null
  sourceSignalId: string | null
  reason: string
  evidence: string
  confidence: number
  safetyLevel: string
  createdAt: string
  updatedAt: string
  executedAt: string | null
  revertedAt: string | null
}

export interface PersistedMaintenanceAction extends MaintenanceActionRecord {
  id: string
}

export interface ReviewSnapshotRecord {
  id?: string
  userId: string
  workspaceId: string
  scope: string
  reviewDate: string
  healthSummary: Record<string, unknown> | null
  growthSummary: Record<string, unknown> | null
  recommendationSummary: Record<string, unknown> | null
  maintenanceSummary: Record<string, unknown> | null
  generatedAt: string
  source: string
  reason: string
  evidence: string
  confidence: number
  safetyLevel: string
  createdAt: string
  updatedAt: string
}

export interface PersistedReviewSnapshot extends ReviewSnapshotRecord {
  id: string
}

export interface DailyBriefSnapshotRecord {
  id?: string
  userId: string
  workspaceId: string
  briefDate: string
  scope: string
  yesterdayProgress: Record<string, unknown> | null
  todayRecommendations: Record<string, unknown> | null
  knowledgeHealth: Record<string, unknown> | null
  quickNoteStatus: Record<string, unknown> | null
  draftStatus: Record<string, unknown> | null
  mindSummary: Record<string, unknown> | null
  generatedAt: string
  source: string
  reason: string
  evidence: string
  confidence: number
  safetyLevel: string
  createdAt: string
  updatedAt: string
}

export interface PersistedDailyBriefSnapshot extends DailyBriefSnapshotRecord {
  id: string
}

export interface SearchIndexRecordRecord {
  id?: string
  userId: string
  workspaceId: string
  targetType: string
  targetId: string
  title: string
  excerpt: string
  keywordTokens: string[]
  semanticRef: string | null
  contentHash: string
  stale: boolean
  staleKey: 0 | 1
  expiredAt: string | null
  source: string
  reason: string
  evidence: string
  confidence: number
  safetyLevel: string
  updatedAt: string
  createdAt: string
}

export interface PersistedSearchIndexRecord extends SearchIndexRecordRecord {
  id: string
}

const db = new Dexie('AtlaxDB') as Dexie & {
  dockItems: EntityTable<DockItemRecord, 'id'>
  tags: EntityTable<TagRecord, 'id'>
  entries: EntityTable<EntryRecord, 'id'>
  chatSessions: EntityTable<ChatSessionRecord, 'id'>
  widgets: EntityTable<WidgetRecord, 'id'>
  collections: EntityTable<CollectionRecord, 'id'>
  entryTagRelations: EntityTable<EntryTagRelationRecord, 'id'>
  entryRelations: EntityTable<EntryRelationRecord, 'id'>
  knowledgeEvents: EntityTable<KnowledgeEventRecord, 'id'>
  temporalActivities: EntityTable<TemporalActivityRecord, 'id'>
  mindNodes: EntityTable<MindNodeRecord, 'id'>
  mindEdges: EntityTable<MindEdgeRecord, 'id'>
  workspaceSessions: EntityTable<WorkspaceSessionRecord, 'id'>
  workspaceOpenTabs: EntityTable<WorkspaceOpenTabRecord, 'id'>
  recentDocuments: EntityTable<RecentDocumentRecord, 'id'>
  editorDrafts: EntityTable<EditorDraftRecord, 'id'>
  tips: EntityTable<TipRecord, 'id'>
  recommendations: EntityTable<RecommendationRecord, 'id'>
  recommendationEvents: EntityTable<RecommendationEventRecord, 'id'>
  userBehaviorEvents: EntityTable<UserBehaviorEventRecord, 'id'>
  dockViewSettings: EntityTable<DockViewSettingsRecord, 'id'>
  appEvents: EntityTable<AppEventRecord, 'id'>
  localTextFeatureSnapshots: EntityTable<LocalTextFeatureSnapshotRecord, 'id'>
  semanticFeatureSnapshots: EntityTable<SemanticFeatureSnapshotRecord, 'id'>
  preferenceMemories: EntityTable<PreferenceMemoryRecord, 'id'>
  healthSignals: EntityTable<HealthSignalRecord, 'id'>
  growthSignals: EntityTable<GrowthSignalRecord, 'id'>
  maintenanceActions: EntityTable<MaintenanceActionRecord, 'id'>
  reviewSnapshots: EntityTable<ReviewSnapshotRecord, 'id'>
  dailyBriefSnapshots: EntityTable<DailyBriefSnapshotRecord, 'id'>
  searchIndexRecords: EntityTable<SearchIndexRecordRecord, 'id'>
}

db.version(1).stores({
  dockItems: '++id, rawText, sourceType, createdAt',
})

db.version(2).stores({
  dockItems: '++id, rawText, sourceType, status, createdAt',
}).upgrade((tx) => {
  tx.table('dockItems').toCollection().modify((item: Record<string, unknown>) => {
    item.status = item.status ?? 'pending'
    item.suggestions = item.suggestions ?? []
    item.processedAt = item.processedAt ?? null
  })
})

db.version(3).stores({
  dockItems: '++id, rawText, sourceType, status, createdAt',
  tags: 'id, name',
}).upgrade((tx) => {
  tx.table('dockItems').toCollection().modify((item: Record<string, unknown>) => {
    item.userTags = item.userTags ?? []
  })
})

db.version(4).stores({
  dockItems: '++id, rawText, sourceType, status, createdAt',
  tags: 'id, name',
  entries: '++id, sourceDockItemId, type, archivedAt',
})

db.version(5).stores({
  dockItems: '++id, userId, rawText, sourceType, status, createdAt',
  tags: 'id, userId, name',
  entries: '++id, userId, sourceDockItemId, type, archivedAt',
}).upgrade((tx) => {
  tx.table('dockItems').toCollection().modify((item: Record<string, unknown>) => {
    item.userId = item.userId ?? FALLBACK_USER_ID
  })
  tx.table('tags').toCollection().modify((tag: Record<string, unknown>) => {
    tag.userId = tag.userId ?? FALLBACK_USER_ID
  })
  tx.table('entries').toCollection().modify((entry: Record<string, unknown>) => {
    entry.userId = entry.userId ?? FALLBACK_USER_ID
  })
})

db.version(6).stores({
  dockItems: '++id, userId, rawText, sourceType, status, createdAt',
  tags: 'id, userId, name, [userId+name]',
  entries: '++id, userId, sourceDockItemId, type, archivedAt',
}).upgrade((tx) => {
  tx.table('tags').toCollection().modify((tag: Record<string, unknown>) => {
    const oldId = tag.id as string
    if (oldId && !oldId.startsWith(FALLBACK_USER_ID + '_')) {
      tag.id = `${tag.userId ?? FALLBACK_USER_ID}_${oldId}`
    }
  })
})

db.version(7).stores({
  dockItems: '++id, userId, rawText, sourceType, status, createdAt',
  tags: 'id, userId, name, [userId+name]',
  entries: '++id, userId, sourceDockItemId, type, archivedAt',
})

db.version(8).stores({
  dockItems: '++id, userId, rawText, sourceType, status, createdAt',
  tags: 'id, userId, name, [userId+name]',
  entries: '++id, userId, sourceDockItemId, type, archivedAt',
}).upgrade(runV8Upgrade)

db.version(9).stores({
  dockItems: '++id, userId, rawText, sourceType, status, createdAt',
  tags: 'id, userId, name, [userId+name]',
  entries: '++id, userId, sourceDockItemId, type, archivedAt',
  chatSessions: '++id, userId, status, pinned, createdAt, updatedAt',
}).upgrade((tx) => {
  tx.table('chatSessions').toCollection().modify((session: Record<string, unknown>) => {
    if (session.pinned === undefined) session.pinned = false
    if (session.title === undefined) session.title = null
  })
})

db.version(11).stores({
  dockItems: '++id, userId, rawText, topic, sourceType, status, createdAt',
  tags: 'id, userId, name, [userId+name]',
  entries: '++id, userId, sourceDockItemId, type, archivedAt',
  chatSessions: '++id, userId, status, pinned, dockItemId, createdAt, updatedAt',
}).upgrade((tx) => {
  tx.table('dockItems').toCollection().modify((item: Record<string, unknown>) => {
    if (item.topic === undefined) item.topic = null
  })
})

db.version(12).stores({
  dockItems: '++id, userId, rawText, topic, sourceType, status, createdAt',
  tags: 'id, userId, name, [userId+name]',
  entries: '++id, userId, sourceDockItemId, type, archivedAt',
  chatSessions: '++id, userId, status, pinned, dockItemId, createdAt, updatedAt',
  widgets: '++id, userId, widgetType, active, createdAt, updatedAt',
})

db.version(13).stores({
  dockItems: '++id, userId, rawText, topic, sourceType, status, createdAt',
  tags: 'id, userId, name, [userId+name]',
  entries: '++id, userId, sourceDockItemId, type, archivedAt',
  chatSessions: '++id, userId, status, pinned, dockItemId, createdAt, updatedAt',
  widgets: '++id, userId, widgetType, active, createdAt, updatedAt',
  collections: 'id, userId, collectionType, parentId, createdAt, updatedAt',
  entryTagRelations: 'id, userId, entryId, tagId, [userId+entryId], [userId+tagId], createdAt',
  entryRelations: 'id, userId, sourceEntryId, targetEntryId, relationType, [userId+sourceEntryId], [userId+targetEntryId], createdAt',
  knowledgeEvents: 'id, userId, eventType, targetType, createdAt',
  temporalActivities: 'id, userId, type, occurredAt, dayKey, weekKey, monthKey, [userId+dayKey], [userId+monthKey], createdAt',
})

db.version(14).stores({
  dockItems: '++id, userId, rawText, topic, sourceType, status, createdAt',
  tags: 'id, userId, name, [userId+name]',
  entries: '++id, userId, sourceDockItemId, type, archivedAt',
  chatSessions: '++id, userId, status, pinned, dockItemId, createdAt, updatedAt',
  widgets: '++id, userId, widgetType, active, createdAt, updatedAt',
  collections: 'id, userId, collectionType, parentId, createdAt, updatedAt',
  entryTagRelations: 'id, userId, entryId, tagId, [userId+entryId], [userId+tagId], createdAt',
  entryRelations: 'id, userId, sourceEntryId, targetEntryId, relationType, [userId+sourceEntryId], [userId+targetEntryId], createdAt',
  knowledgeEvents: 'id, userId, eventType, targetType, createdAt',
  temporalActivities: 'id, userId, type, occurredAt, dayKey, weekKey, monthKey, [userId+dayKey], [userId+monthKey], createdAt',
  mindNodes: 'id, userId, nodeType, state, label, [userId+nodeType], [userId+state], createdAt, updatedAt',
  mindEdges: 'id, userId, sourceNodeId, targetNodeId, edgeType, [userId+sourceNodeId], [userId+targetNodeId], [userId+edgeType], createdAt, updatedAt',
})

db.version(15).stores({
  dockItems: '++id, userId, rawText, topic, sourceType, status, createdAt',
  tags: 'id, userId, name, [userId+name]',
  entries: '++id, userId, sourceDockItemId, type, archivedAt',
  chatSessions: '++id, userId, status, pinned, dockItemId, createdAt, updatedAt',
  widgets: '++id, userId, widgetType, active, createdAt, updatedAt',
  collections: 'id, userId, collectionType, parentId, createdAt, updatedAt',
  entryTagRelations: 'id, userId, entryId, tagId, [userId+entryId], [userId+tagId], createdAt',
  entryRelations: 'id, userId, sourceEntryId, targetEntryId, relationType, [userId+sourceEntryId], [userId+targetEntryId], createdAt',
  knowledgeEvents: 'id, userId, eventType, targetType, createdAt',
  temporalActivities: 'id, userId, type, occurredAt, dayKey, weekKey, monthKey, [userId+dayKey], [userId+monthKey], createdAt',
  mindNodes: 'id, userId, nodeType, state, label, [userId+nodeType], [userId+state], createdAt, updatedAt',
  mindEdges: 'id, userId, sourceNodeId, targetNodeId, edgeType, [userId+sourceNodeId], [userId+targetNodeId], [userId+edgeType], createdAt, updatedAt',
  workspaceSessions: 'id, userId, createdAt, updatedAt',
  workspaceOpenTabs: 'id, userId, sessionId, tabType, documentId, isPinned, isActive, sortOrder, [userId+sessionId], [userId+tabType], [userId+documentId], openedAt, updatedAt',
  recentDocuments: 'id, userId, documentId, [userId+documentId], lastOpenedAt, openCount, createdAt, updatedAt',
})

db.version(16).stores({
  dockItems: '++id, userId, rawText, topic, sourceType, status, createdAt',
  tags: 'id, userId, name, [userId+name]',
  entries: '++id, userId, sourceDockItemId, type, archivedAt',
  chatSessions: '++id, userId, status, pinned, dockItemId, createdAt, updatedAt',
  widgets: '++id, userId, widgetType, active, createdAt, updatedAt',
  collections: 'id, userId, collectionType, parentId, createdAt, updatedAt',
  entryTagRelations: 'id, userId, entryId, tagId, [userId+entryId], [userId+tagId], createdAt',
  entryRelations: 'id, userId, sourceEntryId, targetEntryId, relationType, [userId+sourceEntryId], [userId+targetEntryId], createdAt',
  knowledgeEvents: 'id, userId, eventType, targetType, createdAt',
  temporalActivities: 'id, userId, type, occurredAt, dayKey, weekKey, monthKey, [userId+dayKey], [userId+monthKey], createdAt',
  mindNodes: 'id, userId, nodeType, state, label, [userId+nodeType], [userId+state], createdAt, updatedAt',
  mindEdges: 'id, userId, sourceNodeId, targetNodeId, edgeType, [userId+sourceNodeId], [userId+targetNodeId], [userId+edgeType], createdAt, updatedAt',
  workspaceSessions: 'id, userId, createdAt, updatedAt',
  workspaceOpenTabs: 'id, userId, sessionId, tabType, documentId, isPinned, isActive, sortOrder, [userId+sessionId], [userId+tabType], [userId+documentId], openedAt, updatedAt',
  recentDocuments: 'id, userId, documentId, [userId+documentId], lastOpenedAt, openCount, createdAt, updatedAt',
  editorDrafts: '++id, userId, draftKey, [userId+draftKey], updatedAt',
})

db.version(17).stores({
  dockItems: '++id, userId, rawText, topic, sourceType, status, createdAt',
  tags: 'id, userId, name, [userId+name]',
  entries: '++id, userId, sourceDockItemId, type, archivedAt',
  chatSessions: '++id, userId, status, pinned, dockItemId, createdAt, updatedAt',
  widgets: '++id, userId, widgetType, active, createdAt, updatedAt',
  collections: 'id, userId, collectionType, parentId, createdAt, updatedAt',
  entryTagRelations: 'id, userId, entryId, tagId, [userId+entryId], [userId+tagId], createdAt',
  entryRelations: 'id, userId, sourceEntryId, targetEntryId, relationType, [userId+sourceEntryId], [userId+targetEntryId], createdAt',
  knowledgeEvents: 'id, userId, eventType, targetType, createdAt',
  temporalActivities: 'id, userId, type, occurredAt, dayKey, weekKey, monthKey, [userId+dayKey], [userId+monthKey], createdAt',
  mindNodes: 'id, userId, nodeType, state, label, [userId+nodeType], [userId+state], createdAt, updatedAt',
  mindEdges: 'id, userId, sourceNodeId, targetNodeId, edgeType, [userId+sourceNodeId], [userId+targetNodeId], [userId+edgeType], createdAt, updatedAt',
  workspaceSessions: 'id, userId, createdAt, updatedAt',
  workspaceOpenTabs: 'id, userId, sessionId, tabType, documentId, isPinned, isActive, sortOrder, [userId+sessionId], [userId+tabType], [userId+documentId], openedAt, updatedAt',
  recentDocuments: 'id, userId, documentId, [userId+documentId], lastOpenedAt, openCount, createdAt, updatedAt',
  editorDrafts: '++id, userId, draftKey, [userId+draftKey], updatedAt',
  recommendations: 'id, userId, subjectType, status, [userId+status], [userId+subjectType], createdAt, updatedAt',
  recommendationEvents: 'id, userId, recommendationId, eventType, [userId+recommendationId], [userId+eventType], createdAt',
  userBehaviorEvents: 'id, userId, eventType, targetType, [userId+eventType], [userId+targetType], createdAt',
})

db.version(18).stores({
  dockItems: '++id, userId, rawText, topic, sourceType, status, createdAt',
  tags: 'id, userId, name, [userId+name]',
  entries: '++id, userId, sourceDockItemId, type, archivedAt',
  chatSessions: '++id, userId, status, pinned, dockItemId, createdAt, updatedAt',
  widgets: '++id, userId, widgetType, active, createdAt, updatedAt',
  collections: 'id, userId, collectionType, parentId, createdAt, updatedAt',
  entryTagRelations: 'id, userId, entryId, tagId, [userId+entryId], [userId+tagId], createdAt',
  entryRelations: 'id, userId, sourceEntryId, targetEntryId, relationType, [userId+sourceEntryId], [userId+targetEntryId], createdAt',
  knowledgeEvents: 'id, userId, eventType, targetType, createdAt',
  temporalActivities: 'id, userId, type, occurredAt, dayKey, weekKey, monthKey, [userId+dayKey], [userId+monthKey], createdAt',
  mindNodes: 'id, userId, nodeType, state, label, [userId+nodeType], [userId+state], createdAt, updatedAt',
  mindEdges: 'id, userId, sourceNodeId, targetNodeId, edgeType, [userId+sourceNodeId], [userId+targetNodeId], [userId+edgeType], createdAt, updatedAt',
  workspaceSessions: 'id, userId, createdAt, updatedAt',
  workspaceOpenTabs: 'id, userId, sessionId, tabType, documentId, isPinned, isActive, sortOrder, [userId+sessionId], [userId+tabType], [userId+documentId], openedAt, updatedAt',
  recentDocuments: 'id, userId, documentId, [userId+documentId], lastOpenedAt, openCount, createdAt, updatedAt',
  editorDrafts: '++id, userId, draftKey, [userId+draftKey], updatedAt',
  recommendations: 'id, userId, subjectType, status, [userId+status], [userId+subjectType], createdAt, updatedAt',
  recommendationEvents: 'id, userId, recommendationId, eventType, [userId+recommendationId], [userId+eventType], createdAt',
  userBehaviorEvents: 'id, userId, eventType, subjectType, [userId+eventType], [userId+subjectType], createdAt',
}).upgrade((tx) => {
  tx.table('userBehaviorEvents').toCollection().modify((event: Record<string, unknown>) => {
    if (!event.subjectType) event.subjectType = event.targetType ?? 'recommendation'
    if (event.subjectId === undefined) event.subjectId = event.targetId ?? null
    delete event.targetType
    delete event.targetId
    delete event.fromContext
    delete event.toContext
  })
})

db.version(19).stores({
  dockItems: '++id, userId, rawText, topic, sourceType, status, createdAt',
  tags: 'id, userId, name, [userId+name]',
  entries: '++id, userId, sourceDockItemId, type, archivedAt',
  chatSessions: '++id, userId, status, pinned, dockItemId, createdAt, updatedAt',
  widgets: '++id, userId, widgetType, active, createdAt, updatedAt',
  collections: 'id, userId, collectionType, parentId, createdAt, updatedAt',
  entryTagRelations: 'id, userId, entryId, tagId, [userId+entryId], [userId+tagId], createdAt',
  entryRelations: 'id, userId, sourceEntryId, targetEntryId, relationType, [userId+sourceEntryId], [userId+targetEntryId], createdAt',
  knowledgeEvents: 'id, userId, eventType, targetType, createdAt',
  temporalActivities: 'id, userId, type, occurredAt, dayKey, weekKey, monthKey, [userId+dayKey], [userId+monthKey], createdAt',
  mindNodes: 'id, userId, nodeType, state, label, [userId+nodeType], [userId+state], createdAt, updatedAt',
  mindEdges: 'id, userId, sourceNodeId, targetNodeId, edgeType, [userId+sourceNodeId], [userId+targetNodeId], [userId+edgeType], createdAt, updatedAt',
  workspaceSessions: 'id, userId, createdAt, updatedAt',
  workspaceOpenTabs: 'id, userId, sessionId, tabType, documentId, isPinned, isActive, sortOrder, [userId+sessionId], [userId+tabType], [userId+documentId], openedAt, updatedAt',
  recentDocuments: 'id, userId, documentId, [userId+documentId], lastOpenedAt, openCount, createdAt, updatedAt',
  editorDrafts: '++id, userId, draftKey, status, [userId+status], [userId+draftKey], updatedAt',
  recommendations: 'id, userId, subjectType, status, [userId+status], [userId+subjectType], createdAt, updatedAt',
  recommendationEvents: 'id, userId, recommendationId, eventType, [userId+recommendationId], [userId+eventType], createdAt',
  userBehaviorEvents: 'id, userId, eventType, subjectType, [userId+eventType], [userId+subjectType], createdAt',
}).upgrade((tx) => {
  tx.table('editorDrafts').toCollection().modify((draft: Record<string, unknown>) => {
    if (!draft.status) draft.status = 'active'
  })
})

db.version(20).stores({
  dockItems: '++id, userId, rawText, topic, sourceType, status, createdAt',
  tags: 'id, userId, name, [userId+name]',
  entries: '++id, userId, sourceDockItemId, type, archivedAt',
  chatSessions: '++id, userId, status, pinned, dockItemId, createdAt, updatedAt',
  widgets: '++id, userId, widgetType, active, createdAt, updatedAt',
  collections: 'id, userId, collectionType, parentId, createdAt, updatedAt',
  entryTagRelations: 'id, userId, entryId, tagId, [userId+entryId], [userId+tagId], createdAt',
  entryRelations: 'id, userId, sourceEntryId, targetEntryId, relationType, [userId+sourceEntryId], [userId+targetEntryId], createdAt',
  knowledgeEvents: 'id, userId, eventType, targetType, createdAt',
  temporalActivities: 'id, userId, type, occurredAt, dayKey, weekKey, monthKey, [userId+dayKey], [userId+monthKey], createdAt',
  mindNodes: 'id, userId, nodeType, state, label, [userId+nodeType], [userId+state], createdAt, updatedAt',
  mindEdges: 'id, userId, sourceNodeId, targetNodeId, edgeType, [userId+sourceNodeId], [userId+targetNodeId], [userId+edgeType], createdAt, updatedAt',
  workspaceSessions: 'id, userId, createdAt, updatedAt',
  workspaceOpenTabs: 'id, userId, sessionId, tabType, documentId, isPinned, isActive, sortOrder, [userId+sessionId], [userId+tabType], [userId+documentId], openedAt, updatedAt',
  recentDocuments: 'id, userId, documentId, [userId+documentId], lastOpenedAt, openCount, createdAt, updatedAt',
  editorDrafts: '++id, userId, draftKey, status, [userId+status], [userId+draftKey], updatedAt',
  tips: '++id, userId, sourceType, status, [userId+status], createdAt, updatedAt',
  recommendations: 'id, userId, subjectType, status, [userId+status], [userId+subjectType], createdAt, updatedAt',
  recommendationEvents: 'id, userId, recommendationId, eventType, [userId+recommendationId], [userId+eventType], createdAt',
  userBehaviorEvents: 'id, userId, eventType, subjectType, [userId+eventType], [userId+subjectType], createdAt',
})

db.version(21).stores({
  dockItems: '++id, userId, rawText, topic, sourceType, status, createdAt',
  tags: 'id, userId, name, [userId+name]',
  entries: '++id, userId, sourceDockItemId, type, archivedAt',
  chatSessions: '++id, userId, status, pinned, dockItemId, createdAt, updatedAt',
  widgets: '++id, userId, widgetType, active, createdAt, updatedAt',
  collections: 'id, userId, collectionType, parentId, createdAt, updatedAt',
  entryTagRelations: 'id, userId, entryId, tagId, [userId+entryId], [userId+tagId], createdAt',
  entryRelations: 'id, userId, sourceEntryId, targetEntryId, relationType, [userId+sourceEntryId], [userId+targetEntryId], createdAt',
  knowledgeEvents: 'id, userId, eventType, targetType, createdAt',
  temporalActivities: 'id, userId, type, occurredAt, dayKey, weekKey, monthKey, [userId+dayKey], [userId+monthKey], createdAt',
  mindNodes: 'id, userId, nodeType, state, label, [userId+nodeType], [userId+state], createdAt, updatedAt',
  mindEdges: 'id, userId, sourceNodeId, targetNodeId, edgeType, [userId+sourceNodeId], [userId+targetNodeId], [userId+edgeType], createdAt, updatedAt',
  workspaceSessions: 'id, userId, createdAt, updatedAt',
  workspaceOpenTabs: 'id, userId, sessionId, tabType, documentId, isPinned, isActive, sortOrder, [userId+sessionId], [userId+tabType], [userId+documentId], openedAt, updatedAt',
  recentDocuments: 'id, userId, documentId, [userId+documentId], lastOpenedAt, openCount, createdAt, updatedAt',
  editorDrafts: '++id, userId, draftKey, status, sourceEntryId, [userId+status], [userId+draftKey], [userId+sourceEntryId], updatedAt',
  tips: '++id, userId, sourceType, status, [userId+status], createdAt, updatedAt',
  recommendations: 'id, userId, subjectType, status, [userId+status], [userId+subjectType], createdAt, updatedAt',
  recommendationEvents: 'id, userId, recommendationId, eventType, [userId+recommendationId], [userId+eventType], createdAt',
  userBehaviorEvents: 'id, userId, eventType, subjectType, [userId+eventType], [userId+subjectType], createdAt',
}).upgrade((tx) => {
  tx.table('editorDrafts').toCollection().modify((draft: Record<string, unknown>) => {
    if (draft.sourceEntryId === undefined) draft.sourceEntryId = null
    if (draft.sourceType === undefined) draft.sourceType = null
  })
})

db.version(22).stores({
  dockItems: '++id, userId, rawText, topic, sourceType, status, createdAt',
  tags: 'id, userId, name, [userId+name]',
  entries: '++id, userId, sourceDockItemId, type, archivedAt',
  chatSessions: '++id, userId, status, pinned, dockItemId, createdAt, updatedAt',
  widgets: '++id, userId, widgetType, active, createdAt, updatedAt',
  collections: 'id, userId, collectionType, parentId, createdAt, updatedAt',
  entryTagRelations: 'id, userId, entryId, tagId, [userId+entryId], [userId+tagId], createdAt',
  entryRelations: 'id, userId, sourceEntryId, targetEntryId, relationType, [userId+sourceEntryId], [userId+targetEntryId], createdAt',
  knowledgeEvents: 'id, userId, eventType, targetType, createdAt',
  temporalActivities: 'id, userId, type, occurredAt, dayKey, weekKey, monthKey, [userId+dayKey], [userId+monthKey], createdAt',
  mindNodes: 'id, userId, nodeType, state, label, [userId+nodeType], [userId+state], createdAt, updatedAt',
  mindEdges: 'id, userId, sourceNodeId, targetNodeId, edgeType, [userId+sourceNodeId], [userId+targetNodeId], [userId+edgeType], createdAt, updatedAt',
  workspaceSessions: 'id, userId, createdAt, updatedAt',
  workspaceOpenTabs: 'id, userId, sessionId, tabType, documentId, isPinned, isActive, sortOrder, [userId+sessionId], [userId+tabType], [userId+documentId], openedAt, updatedAt',
  recentDocuments: 'id, userId, documentId, [userId+documentId], lastOpenedAt, openCount, createdAt, updatedAt',
  editorDrafts: '++id, userId, draftKey, status, sourceEntryId, [userId+status], [userId+draftKey], [userId+sourceEntryId], updatedAt',
  tips: '++id, userId, sourceType, status, [userId+status], createdAt, updatedAt',
  recommendations: 'id, userId, subjectType, status, [userId+status], [userId+subjectType], createdAt, updatedAt',
  recommendationEvents: 'id, userId, recommendationId, eventType, [userId+recommendationId], [userId+eventType], createdAt',
  userBehaviorEvents: 'id, userId, eventType, subjectType, [userId+eventType], [userId+subjectType], createdAt',
}).upgrade(async (tx) => {
  const nodesTable = tx.table('mindNodes')
  const edgesTable = tx.table('mindEdges')
  const allNodes = await nodesTable.toArray()
  const idMapping: Record<string, string> = {}

  for (const node of allNodes) {
    if (node.nodeType === 'document' && node.documentId != null) {
      const normalized = (node.label as string).trim().toLowerCase().replace(/\s+/g, '_').slice(0, 40)
      const newId = `${node.userId}_mn_document_${normalized}_${node.documentId}`
      if (newId !== node.id) {
        idMapping[node.id] = newId
      }
    }
  }

  for (const [oldId, newId] of Object.entries(idMapping)) {
    const node = await nodesTable.get(oldId)
    if (node) {
      node.id = newId
      await nodesTable.put(node)
      await nodesTable.delete(oldId)
    }
  }

  const allEdges = await edgesTable.toArray()
  for (const edge of allEdges) {
    let modified = false
    const newSourceId = idMapping[edge.sourceNodeId]
    const newTargetId = idMapping[edge.targetNodeId]
    if (newSourceId) {
      edge.sourceNodeId = newSourceId
      modified = true
    }
    if (newTargetId) {
      edge.targetNodeId = newTargetId
      modified = true
    }
    if (modified) {
      const oldEdgeId = edge.id as string
      edge.id = `${edge.userId}_me_${edge.sourceNodeId}_${edge.targetNodeId}_${edge.edgeType}`
      await edgesTable.put(edge)
      await edgesTable.delete(oldEdgeId)
    }
  }
})

db.version(23).stores({
  dockItems: '++id, userId, rawText, topic, sourceType, status, createdAt',
  tags: 'id, userId, name, [userId+name]',
  entries: '++id, userId, sourceDockItemId, type, archivedAt',
  chatSessions: '++id, userId, status, pinned, dockItemId, createdAt, updatedAt',
  widgets: '++id, userId, widgetType, active, createdAt, updatedAt',
  collections: 'id, userId, collectionType, parentId, createdAt, updatedAt',
  entryTagRelations: 'id, userId, entryId, tagId, [userId+entryId], [userId+tagId], createdAt',
  entryRelations: 'id, userId, sourceEntryId, targetEntryId, relationType, [userId+sourceEntryId], [userId+targetEntryId], createdAt',
  knowledgeEvents: 'id, userId, eventType, targetType, createdAt',
  temporalActivities: 'id, userId, type, occurredAt, dayKey, weekKey, monthKey, [userId+dayKey], [userId+monthKey], createdAt',
  mindNodes: 'id, userId, nodeType, state, label, [userId+nodeType], [userId+state], createdAt, updatedAt',
  mindEdges: 'id, userId, sourceNodeId, targetNodeId, edgeType, [userId+sourceNodeId], [userId+targetNodeId], [userId+edgeType], createdAt, updatedAt',
  workspaceSessions: 'id, userId, createdAt, updatedAt',
  workspaceOpenTabs: 'id, userId, sessionId, tabType, documentId, isPinned, isActive, sortOrder, [userId+sessionId], [userId+tabType], [userId+documentId], openedAt, updatedAt',
  recentDocuments: 'id, userId, documentId, [userId+documentId], lastOpenedAt, openCount, createdAt, updatedAt',
  editorDrafts: '++id, userId, draftKey, status, sourceEntryId, sourceType, [userId+status], [userId+draftKey], [userId+sourceEntryId], createdAt, updatedAt',
  tips: '++id, userId, sourceType, status, [userId+status], createdAt, updatedAt',
  recommendations: 'id, userId, subjectType, status, [userId+status], [userId+subjectType], createdAt, updatedAt',
  recommendationEvents: 'id, userId, recommendationId, eventType, [userId+recommendationId], [userId+eventType], createdAt',
  userBehaviorEvents: 'id, userId, eventType, subjectType, [userId+eventType], [userId+subjectType], createdAt',
}).upgrade(tx => {
  return tx.table('editorDrafts').toCollection().modify(draft => {
    if (!draft.tags) draft.tags = []
    if (draft.project === undefined) draft.project = null
    if (draft.collectionId === undefined) draft.collectionId = null
  })
})

db.version(24).stores({
  dockItems: '++id, userId, rawText, topic, sourceType, status, createdAt',
  tags: 'id, userId, name, [userId+name]',
  entries: '++id, userId, sourceDockItemId, type, archivedAt',
  chatSessions: '++id, userId, status, pinned, dockItemId, createdAt, updatedAt',
  widgets: '++id, userId, widgetType, active, createdAt, updatedAt',
  collections: 'id, userId, collectionType, parentId, createdAt, updatedAt',
  entryTagRelations: 'id, userId, entryId, tagId, [userId+entryId], [userId+tagId], createdAt',
  entryRelations: 'id, userId, sourceEntryId, targetEntryId, relationType, [userId+sourceEntryId], [userId+targetEntryId], createdAt',
  knowledgeEvents: 'id, userId, eventType, targetType, createdAt',
  temporalActivities: 'id, userId, type, occurredAt, dayKey, weekKey, monthKey, [userId+dayKey], [userId+monthKey], createdAt',
  mindNodes: 'id, userId, nodeType, state, label, [userId+nodeType], [userId+state], createdAt, updatedAt',
  mindEdges: 'id, userId, sourceNodeId, targetNodeId, edgeType, [userId+sourceNodeId], [userId+targetNodeId], [userId+edgeType], createdAt, updatedAt',
  workspaceSessions: 'id, userId, createdAt, updatedAt',
  workspaceOpenTabs: 'id, userId, sessionId, tabType, documentId, isPinned, isActive, sortOrder, [userId+sessionId], [userId+tabType], [userId+documentId], openedAt, updatedAt',
  recentDocuments: 'id, userId, documentId, [userId+documentId], lastOpenedAt, openCount, createdAt, updatedAt',
  editorDrafts: '++id, userId, draftKey, status, sourceEntryId, sourceType, [userId+status], [userId+draftKey], [userId+sourceEntryId], createdAt, updatedAt',
  tips: '++id, userId, sourceType, status, [userId+status], createdAt, updatedAt',
  recommendations: 'id, userId, subjectType, status, [userId+status], [userId+subjectType], createdAt, updatedAt',
  recommendationEvents: 'id, userId, recommendationId, eventType, [userId+recommendationId], [userId+eventType], createdAt',
  userBehaviorEvents: 'id, userId, eventType, subjectType, [userId+eventType], [userId+subjectType], createdAt',
}).upgrade(tx => {
  const migrate = (record: Record<string, unknown>) => {
    const content = typeof record.content === 'string' ? record.content : ''
    const payload = createEditorContentPayload(textToTiptapDoc(content), content)
    if (record.contentJson === undefined) record.contentJson = payload.contentJson
    if (record.plainText === undefined) record.plainText = payload.plainText
    if (record.html === undefined) record.html = payload.html
    if (record.markdown === undefined) record.markdown = payload.markdown
  }
  tx.table('entries').toCollection().modify(migrate)
  tx.table('editorDrafts').toCollection().modify(migrate)
})

db.version(25).stores({
  dockItems: '++id, userId, rawText, topic, sourceType, status, createdAt',
  tags: 'id, userId, name, [userId+name]',
  entries: '++id, userId, sourceDockItemId, type, archivedAt',
  chatSessions: '++id, userId, status, pinned, dockItemId, createdAt, updatedAt',
  widgets: '++id, userId, widgetType, active, createdAt, updatedAt',
  collections: 'id, userId, collectionType, parentId, createdAt, updatedAt',
  entryTagRelations: 'id, userId, entryId, tagId, [userId+entryId], [userId+tagId], createdAt',
  entryRelations: 'id, userId, sourceEntryId, targetEntryId, relationType, [userId+sourceEntryId], [userId+targetEntryId], createdAt',
  knowledgeEvents: 'id, userId, eventType, targetType, createdAt',
  temporalActivities: 'id, userId, type, occurredAt, dayKey, weekKey, monthKey, [userId+dayKey], [userId+monthKey], createdAt',
  mindNodes: 'id, userId, nodeType, state, label, [userId+nodeType], [userId+state], createdAt, updatedAt',
  mindEdges: 'id, userId, sourceNodeId, targetNodeId, edgeType, [userId+sourceNodeId], [userId+targetNodeId], [userId+edgeType], createdAt, updatedAt',
  workspaceSessions: 'id, userId, createdAt, updatedAt',
  workspaceOpenTabs: 'id, userId, sessionId, tabType, documentId, isPinned, isActive, sortOrder, [userId+sessionId], [userId+tabType], [userId+documentId], openedAt, updatedAt',
  recentDocuments: 'id, userId, documentId, [userId+documentId], lastOpenedAt, openCount, createdAt, updatedAt',
  editorDrafts: '++id, userId, draftKey, status, sourceEntryId, sourceType, [userId+status], [userId+draftKey], [userId+sourceEntryId], createdAt, updatedAt',
  tips: '++id, userId, sourceType, status, [userId+status], createdAt, updatedAt',
  recommendations: 'id, userId, subjectType, status, [userId+status], [userId+subjectType], createdAt, updatedAt',
  recommendationEvents: 'id, userId, recommendationId, eventType, [userId+recommendationId], [userId+eventType], createdAt',
  userBehaviorEvents: 'id, userId, eventType, subjectType, [userId+eventType], [userId+subjectType], createdAt',
  dockViewSettings: 'id, userId, [userId]',
})

// v26: workspaceId migration — workspaceSessions, workspaceOpenTabs, recentDocuments
// are UI/session state and do NOT need workspaceId (they are scoped per-user, not per-workspace).
db.version(26).stores({
  dockItems: '++id, userId, workspaceId, rawText, topic, sourceType, status, createdAt, [userId+workspaceId]',
  tags: 'id, userId, workspaceId, name, [userId+name], [userId+workspaceId]',
  entries: '++id, userId, workspaceId, sourceDockItemId, type, archivedAt, [userId+workspaceId]',
  chatSessions: '++id, userId, workspaceId, status, pinned, dockItemId, createdAt, updatedAt, [userId+workspaceId]',
  widgets: '++id, userId, workspaceId, widgetType, active, createdAt, updatedAt, [userId+workspaceId]',
  collections: 'id, userId, workspaceId, collectionType, parentId, createdAt, updatedAt, [userId+workspaceId]',
  entryTagRelations: 'id, userId, workspaceId, entryId, tagId, [userId+entryId], [userId+tagId], createdAt, [userId+workspaceId]',
  entryRelations: 'id, userId, workspaceId, sourceEntryId, targetEntryId, relationType, [userId+sourceEntryId], [userId+targetEntryId], createdAt, [userId+workspaceId]',
  knowledgeEvents: 'id, userId, workspaceId, eventType, targetType, createdAt, [userId+workspaceId]',
  temporalActivities: 'id, userId, workspaceId, type, occurredAt, dayKey, weekKey, monthKey, [userId+dayKey], [userId+monthKey], createdAt, [userId+workspaceId]',
  mindNodes: 'id, userId, workspaceId, nodeType, state, label, [userId+nodeType], [userId+state], createdAt, updatedAt, [userId+workspaceId]',
  mindEdges: 'id, userId, workspaceId, sourceNodeId, targetNodeId, edgeType, [userId+sourceNodeId], [userId+targetNodeId], [userId+edgeType], createdAt, updatedAt, [userId+workspaceId]',
  workspaceSessions: 'id, userId, createdAt, updatedAt',
  workspaceOpenTabs: 'id, userId, sessionId, tabType, documentId, isPinned, isActive, sortOrder, [userId+sessionId], [userId+tabType], [userId+documentId], openedAt, updatedAt',
  recentDocuments: 'id, userId, documentId, [userId+documentId], lastOpenedAt, openCount, createdAt, updatedAt',
  editorDrafts: '++id, userId, workspaceId, draftKey, status, sourceEntryId, sourceType, [userId+status], [userId+draftKey], [userId+sourceEntryId], createdAt, updatedAt, [userId+workspaceId]',
  tips: '++id, userId, workspaceId, sourceType, status, [userId+status], createdAt, updatedAt, [userId+workspaceId]',
  recommendations: 'id, userId, workspaceId, subjectType, status, [userId+status], [userId+subjectType], createdAt, updatedAt, [userId+workspaceId]',
  recommendationEvents: 'id, userId, workspaceId, recommendationId, eventType, [userId+recommendationId], [userId+eventType], createdAt, [userId+workspaceId]',
  userBehaviorEvents: 'id, userId, workspaceId, eventType, subjectType, [userId+eventType], [userId+subjectType], createdAt, [userId+workspaceId]',
  dockViewSettings: 'id, userId, workspaceId, [userId], [userId+workspaceId]',
  appEvents: 'id, userId, workspaceId, eventType, [userId+workspaceId], [userId+workspaceId+_ts], _ts',
}).upgrade(tx => {
  const coreTables = [
    'dockItems', 'entries', 'tags', 'chatSessions', 'widgets', 'collections',
    'entryTagRelations', 'entryRelations', 'knowledgeEvents', 'temporalActivities',
    'mindNodes', 'mindEdges', 'editorDrafts', 'tips', 'recommendations',
    'recommendationEvents', 'userBehaviorEvents', 'dockViewSettings',
  ] as const
  for (const tableName of coreTables) {
    tx.table(tableName).toCollection().modify((record: Record<string, unknown>) => {
      if (!record.workspaceId) record.workspaceId = 'default'
    })
  }
})

db.version(27).stores({
  localTextFeatureSnapshots: 'id, userId, workspaceId, [userId+workspaceId], [userId+workspaceId+targetType+targetId], [userId+workspaceId+targetType+targetId+contentHash], [userId+workspaceId+stale], [userId+workspaceId+expiredAt]',
  semanticFeatureSnapshots: 'id, userId, workspaceId, [userId+workspaceId], [userId+workspaceId+targetType+targetId], [userId+workspaceId+targetType+targetId+contentHash], [userId+workspaceId+stale], [userId+workspaceId+expiredAt]',
  preferenceMemories: 'id, userId, workspaceId, [userId+workspaceId], [userId+workspaceId+candidateType+candidateId]',
  healthSignals: 'id, userId, workspaceId, [userId+workspaceId], [userId+workspaceId+targetType+targetId], [userId+workspaceId+status]',
  growthSignals: 'id, userId, workspaceId, [userId+workspaceId], [userId+workspaceId+targetType+targetId], [userId+workspaceId+status]',
  maintenanceActions: 'id, userId, workspaceId, [userId+workspaceId], [userId+workspaceId+targetType+targetId], [userId+workspaceId+status]',
  reviewSnapshots: 'id, userId, workspaceId, [userId+workspaceId], [userId+workspaceId+scope+reviewDate]',
  dailyBriefSnapshots: 'id, userId, workspaceId, [userId+workspaceId], [userId+workspaceId+briefDate]',
  searchIndexRecords: 'id, userId, workspaceId, [userId+workspaceId], [userId+workspaceId+targetType+targetId], [userId+workspaceId+targetType+targetId+contentHash], [userId+workspaceId+stale], [userId+workspaceId+expiredAt]',
})

db.version(28).stores({
  localTextFeatureSnapshots: 'id, userId, workspaceId, [userId+workspaceId], [userId+workspaceId+targetType+targetId], [userId+workspaceId+targetType+targetId+contentHash], [userId+workspaceId+staleKey], [userId+workspaceId+expiredAt]',
  semanticFeatureSnapshots: 'id, userId, workspaceId, [userId+workspaceId], [userId+workspaceId+targetType+targetId], [userId+workspaceId+targetType+targetId+contentHash], [userId+workspaceId+staleKey], [userId+workspaceId+expiredAt]',
  preferenceMemories: 'id, userId, workspaceId, [userId+workspaceId], [userId+workspaceId+candidateType+candidateId]',
  healthSignals: 'id, userId, workspaceId, [userId+workspaceId], [userId+workspaceId+targetType+targetId], [userId+workspaceId+status]',
  growthSignals: 'id, userId, workspaceId, [userId+workspaceId], [userId+workspaceId+targetType+targetId], [userId+workspaceId+status]',
  maintenanceActions: 'id, userId, workspaceId, [userId+workspaceId], [userId+workspaceId+targetType+targetId], [userId+workspaceId+status]',
  reviewSnapshots: 'id, userId, workspaceId, [userId+workspaceId], [userId+workspaceId+scope+reviewDate]',
  dailyBriefSnapshots: 'id, userId, workspaceId, [userId+workspaceId], [userId+workspaceId+briefDate]',
  searchIndexRecords: 'id, userId, workspaceId, [userId+workspaceId], [userId+workspaceId+targetType+targetId], [userId+workspaceId+targetType+targetId+contentHash], [userId+workspaceId+staleKey], [userId+workspaceId+expiredAt]',
}).upgrade(tx => {
  const tables = ['localTextFeatureSnapshots', 'semanticFeatureSnapshots', 'searchIndexRecords']
  return Promise.all(tables.map(tableName => {
    const table = tx.table(tableName)
    return table.toCollection().modify(record => {
      if (record.staleKey === undefined) {
        record.staleKey = record.stale ? 1 : 0
      }
    })
  }))
})

export { db }
export const dockItemsTable = db.table('dockItems')
export const capturesTable = dockItemsTable
export const tagsTable = db.table('tags')
export const entriesTable = db.table('entries')
export const documentsTable = entriesTable
export const chatSessionsTable = db.table('chatSessions')
export const widgetsTable = db.table('widgets')
export const collectionsTable = db.table('collections')
export const entryTagRelationsTable = db.table('entryTagRelations')
export const entryRelationsTable = db.table('entryRelations')
export const knowledgeEventsTable = db.table('knowledgeEvents')
export const temporalActivitiesTable = db.table('temporalActivities')
export const mindNodesTable = db.table('mindNodes')
export const mindEdgesTable = db.table('mindEdges')
export const workspaceSessionsTable = db.table('workspaceSessions')
export const workspaceOpenTabsTable = db.table('workspaceOpenTabs')
export const recentDocumentsTable = db.table('recentDocuments')
export const editorDraftsTable = db.table('editorDrafts')
export const tipsTable = db.table('tips')
export const recommendationsTable = db.table('recommendations')
export const recommendationEventsTable = db.table('recommendationEvents')
export const userBehaviorEventsTable = db.table('userBehaviorEvents')
export const dockViewSettingsTable = db.table('dockViewSettings')
export const appEventsTable = db.table('appEvents')
export const localTextFeatureSnapshotsTable = db.table('localTextFeatureSnapshots')
export const semanticFeatureSnapshotsTable = db.table('semanticFeatureSnapshots')
export const preferenceMemoriesTable = db.table('preferenceMemories')
export const healthSignalsTable = db.table('healthSignals')
export const growthSignalsTable = db.table('growthSignals')
export const maintenanceActionsTable = db.table('maintenanceActions')
export const reviewSnapshotsTable = db.table('reviewSnapshots')
export const dailyBriefSnapshotsTable = db.table('dailyBriefSnapshots')
export const searchIndexRecordsTable = db.table('searchIndexRecords')
