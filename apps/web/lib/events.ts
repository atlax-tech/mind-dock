import { appEventsTable } from './db'
import { DEFAULT_WORKSPACE_ID } from '@atlax/domain'

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

function deterministicHash(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0
  }
  return h >>> 0
}

function makeAppEventId(userId: string, eventType: string, ts: number, payload?: Record<string, unknown>): string {
  const payloadStr = payload ? JSON.stringify(payload) : ''
  const hash = deterministicHash(`${userId}|${eventType}|${ts}|${payloadStr}`)
  return `${userId}_${eventType}_${ts}_${hash.toString(36)}`
}

const listeners: EventListener[] = []

const memoryCache = new Map<string, PersistedEvent[]>()
const hydratedUsers = new Set<string>()

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

export function recordEvent(userId: string, event: AppEvent): void {
  emit(event)
  if (!userId) return

  const persisted: PersistedEvent = { ...event, _ts: Date.now(), userId }

  const cache = memoryCache.get(userId) || []
  cache.push(persisted)
  if (cache.length > 500) cache.splice(0, cache.length - 500)
  memoryCache.set(userId, cache)

  const payload = { ...event } as Record<string, unknown>
  appEventsTable.add({
    id: makeAppEventId(userId, event.type, persisted._ts, payload),
    userId,
    workspaceId: DEFAULT_WORKSPACE_ID,
    eventType: event.type,
    payload,
    _ts: persisted._ts,
  }).catch(err => { if (typeof console !== 'undefined') console.warn('[events] appEvents write failed:', err?.message) })
}

export function getEventLog(userId: string): PersistedEvent[] {
  if (!userId) return []

  const cached = memoryCache.get(userId)
  if (cached) return cached

  if (!hydratedUsers.has(userId)) {
    hydratedUsers.add(userId)
    hydrateFromIndexedDB(userId)
  }

  return memoryCache.get(userId) || []
}

async function hydrateFromIndexedDB(userId: string): Promise<void> {
  try {
    await migrateFromLocalStorage(userId)

    const records = await appEventsTable
      .where('[userId+workspaceId]')
      .equals([userId, DEFAULT_WORKSPACE_ID])
      .sortBy('_ts')

    const events: PersistedEvent[] = records.map(r => ({
      ...((r.payload || {}) as AppEvent),
      _ts: r._ts,
      userId: r.userId,
    }))

    const existing = memoryCache.get(userId) || []
    const existingTsSet = new Set(existing.map(e => e._ts))
    const newEvents = events.filter(e => !existingTsSet.has(e._ts))
    const merged = [...existing, ...newEvents].sort((a, b) => a._ts - b._ts)
    const trimmed = merged.slice(-500)
    memoryCache.set(userId, trimmed)
  } catch {}
}

export function clearEventLog(userId: string): void {
  memoryCache.delete(userId)
  hydratedUsers.delete(userId)

  appEventsTable
    .where('[userId+workspaceId]')
    .equals([userId, DEFAULT_WORKSPACE_ID])
    .delete()
    .catch(() => {})
}

const MIGRATION_KEY_PREFIX = 'atlax_event_log_migrated_'

async function migrateFromLocalStorage(userId: string): Promise<void> {
  if (typeof window === 'undefined') return

  const migrationKey = `${MIGRATION_KEY_PREFIX}${userId}`

  try {
    const migrated = localStorage.getItem(migrationKey)
    if (migrated) return
  } catch {
    return
  }

  const oldKey = `atlax_event_log_${userId}`
  let raw: string | null = null
  try {
    raw = localStorage.getItem(oldKey)
  } catch {
    return
  }

  if (!raw) {
    try { localStorage.setItem(migrationKey, '1') } catch {}
    return
  }

  try {
    const oldEvents = JSON.parse(raw) as PersistedEvent[]
    if (Array.isArray(oldEvents) && oldEvents.length > 0) {
      const records = oldEvents.map(e => {
        const payload = { ...e } as Record<string, unknown>
        return {
          id: makeAppEventId(e.userId, e.type, e._ts, payload),
          userId: e.userId,
          workspaceId: DEFAULT_WORKSPACE_ID,
          eventType: e.type,
          payload,
          _ts: e._ts,
        }
      })
      await appEventsTable.bulkPut(records)
    }

    localStorage.setItem(migrationKey, '1')
    localStorage.removeItem(oldKey)
  } catch {}
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
