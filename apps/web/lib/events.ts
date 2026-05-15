export type AppEvent =
  | { type: 'mode_switched'; from: AppMode; to: AppMode }
  | { type: 'capture_created'; sourceType: SourceType; dockItemId: number }
  | { type: 'chat_guided_capture_created'; dockItemId: number; rawText: string }
  | { type: 'archive_completed'; dockItemId: number; sourceType: SourceType }
  | { type: 'weekly_review_opened' }
  | { type: 'browse_revisit'; entryId: number }
  | { type: 'tip_created'; tipId: number }
  | { type: 'tip_converted'; tipId: number; draftId: number }
  | { type: 'tip_discarded'; tipId: number }
  | { type: 'draft_created'; draftId: number }
  | { type: 'draft_updated'; draftId: number }
  | { type: 'draft_deleted'; draftId: number }
  | { type: 'mind_node_created'; nodeId: string }
  | { type: 'mind_node_updated'; nodeId: string }
  | { type: 'mind_node_deleted'; nodeId: string }
  | { type: 'mind_edge_created'; edgeId: string }
  | { type: 'mind_edge_updated'; edgeId: string }
  | { type: 'mind_edge_deleted'; edgeId: string }
  | { type: 'recommendation_applied'; recommendationId: string }
  | { type: 'recommendation_rejected'; recommendationId: string }
  | { type: 'recommendation_ignored'; recommendationId: string }
  | { type: 'document_archived'; entryId: number }
  | { type: 'document_restored'; entryId: number }
  | { type: 'collection_updated'; collectionId: string }
  | { type: 'tag_updated'; tagId: string }

export type AppMode = 'classic' | 'chat'

export type SourceType = 'text' | 'voice' | 'import' | 'chat'

export type PersistedEvent = AppEvent & { _ts: number; userId: string }

export type EventListener = (event: AppEvent) => void

const listeners: EventListener[] = []

let memoryLog: PersistedEvent[] | null = null

function getMemoryLog(userId: string): PersistedEvent[] {
  if (memoryLog === null) {
    memoryLog = []
  }
  return memoryLog.filter(e => e.userId === userId)
}

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

export function subscribe(listener: EventListener): () => void {
  listeners.push(listener)
  return () => {
    const idx = listeners.indexOf(listener)
    if (idx >= 0) listeners.splice(idx, 1)
  }
}

export function emit(event: AppEvent): void {
  for (const listener of listeners) {
    listener(event)
  }
}

function getEventLogKey(userId: string) {
  return `atlax_event_log_${userId}`
}

function loadEventLog(userId: string): PersistedEvent[] {
  if (hasLocalStorage()) {
    try {
      const raw = localStorage.getItem(getEventLogKey(userId))
      if (raw) return JSON.parse(raw) as PersistedEvent[]
    } catch {
      // fall through to memory
    }
  }
  return getMemoryLog(userId)
}

function saveEventLog(userId: string, events: PersistedEvent[]): void {
  const trimmed = events.slice(-500)
  if (hasLocalStorage()) {
    try {
      localStorage.setItem(getEventLogKey(userId), JSON.stringify(trimmed))
      return
    } catch {
      // fall through to memory
    }
  }
  const otherEvents = (memoryLog || []).filter(e => e.userId !== userId)
  memoryLog = [...otherEvents, ...trimmed]
}

export function recordEvent(userId: string, event: AppEvent): void {
  emit(event)
  if (!userId) return
  const log = loadEventLog(userId)
  const persisted: PersistedEvent = { ...event, _ts: Date.now(), userId }
  log.push(persisted)
  saveEventLog(userId, log)
}

export function getEventLog(userId: string): PersistedEvent[] {
  if (!userId) return []
  return loadEventLog(userId)
}

export function clearEventLog(userId: string): void {
  if (memoryLog !== null) {
    memoryLog = memoryLog.filter(e => e.userId !== userId)
  }
  if (hasLocalStorage()) {
    try {
      localStorage.removeItem(getEventLogKey(userId))
    } catch {
      // ignore
    }
  }
}

export interface MetricsResult {
  dau: number
  dailyCapturesPerUser: number
  chatArchiveRate: number
  retention7d: number
  weeklyReviewOpenRate: number
  generatedAt: number
}

export function computeMetrics(events: PersistedEvent[]): MetricsResult {
  const now = Date.now()
  const oneDayMs = 24 * 60 * 60 * 1000
  const sevenDaysMs = 7 * oneDayMs
  const todayStart = now - (now % oneDayMs)

  const captureEvents = events.filter((e) => e.type === 'capture_created' || e.type === 'chat_guided_capture_created')
  const archiveEvents = events.filter((e) => e.type === 'archive_completed')
  const reviewEvents = events.filter((e) => e.type === 'weekly_review_opened')

  const todayCaptures = captureEvents.filter((e) => e._ts >= todayStart)
  const dau = todayCaptures.length > 0 ? 1 : 0

  const dailyCapturesPerUser = dau > 0 ? todayCaptures.length / dau : 0

  const chatCaptures = captureEvents.filter((e) =>
    e.type === 'chat_guided_capture_created' || (e.type === 'capture_created' && e.sourceType === 'chat')
  )
  const uniqueChatCaptureIds = new Set(chatCaptures.map((e) =>
    e.type === 'chat_guided_capture_created' ? e.dockItemId : e.dockItemId
  ))
  const chatArchives = archiveEvents.filter((e) => e.sourceType === 'chat')
  const uniqueChatArchivedIds = new Set(chatArchives.map((e) => e.dockItemId))
  const chatArchivedFromCaptures = Array.from(uniqueChatArchivedIds).filter((id) => uniqueChatCaptureIds.has(id))
  const chatArchiveRate = uniqueChatCaptureIds.size > 0 ? chatArchivedFromCaptures.length / uniqueChatCaptureIds.size : 0

  const sorted = [...events].sort((a, b) => a._ts - b._ts)
  const firstCapture = sorted.find((e) => e.type === 'capture_created' || e.type === 'chat_guided_capture_created')
  const cohortTs = firstCapture ? firstCapture._ts : now
  const isNewUser = (now - cohortTs) < sevenDaysMs
  let retention7d = 0
  if (isNewUser) {
    retention7d = 1
  } else if (firstCapture) {
    const d7Ts = cohortTs + sevenDaysMs
    retention7d = sorted.some((e) => e._ts >= d7Ts && e._ts < d7Ts + oneDayMs) ? 1 : 0
  }

  const sevenDaysAgo = now - sevenDaysMs
  const recentEvents = events.filter((e) => e._ts >= sevenDaysAgo)
  const weeklyReviewOpenRate = recentEvents.length > 0 ? reviewEvents.filter((e) => e._ts >= sevenDaysAgo).length / 7 : 0

  return {
    dau,
    dailyCapturesPerUser: Math.round(dailyCapturesPerUser * 100) / 100,
    chatArchiveRate: Math.round(chatArchiveRate * 100) / 100,
    retention7d,
    weeklyReviewOpenRate: Math.round(weeklyReviewOpenRate * 100) / 100,
    generatedAt: now,
  }
}
