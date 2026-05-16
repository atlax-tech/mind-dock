import { afterEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { DEFAULT_WORKSPACE_ID } from '@atlax/domain'
import {
  clearEventLog,
  computeMetrics,
  getEventLog,
  recordEvent,
  type PersistedEvent,
} from '@/lib/events'

const TEST_USER = 'test-user'
const USER_A = 'user_test_a'
const USER_B = 'user_test_b'

function clearAll() {
  clearEventLog(TEST_USER)
  clearEventLog(USER_A)
  clearEventLog(USER_B)
}

describe('event tracking completeness', () => {
  afterEach(() => clearEventLog(TEST_USER))

  it('records capture_created event', () => {
    recordEvent(TEST_USER, { type: 'capture_created', sourceType: 'text', dockItemId: 1 })
    const log = getEventLog(TEST_USER)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ type: 'capture_created', sourceType: 'text', dockItemId: 1 })
  })

  it('records chat_guided_capture_created event', () => {
    recordEvent(TEST_USER, { type: 'chat_guided_capture_created', dockItemId: 2, rawText: 'test' })
    const log = getEventLog(TEST_USER)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ type: 'chat_guided_capture_created', dockItemId: 2 })
  })

  it('records archive_completed event', () => {
    recordEvent(TEST_USER, { type: 'archive_completed', dockItemId: 1, sourceType: 'text' })
    const log = getEventLog(TEST_USER)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ type: 'archive_completed', sourceType: 'text' })
  })

  it('records archive_completed with chat sourceType', () => {
    recordEvent(TEST_USER, { type: 'archive_completed', dockItemId: 2, sourceType: 'chat' })
    const log = getEventLog(TEST_USER)
    expect(log[0]).toMatchObject({ type: 'archive_completed', sourceType: 'chat' })
  })

  it('records mode_switched event', () => {
    recordEvent(TEST_USER, { type: 'mode_switched', from: 'classic', to: 'chat' })
    const log = getEventLog(TEST_USER)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ type: 'mode_switched', from: 'classic', to: 'chat' })
  })

  it('records weekly_review_opened event', () => {
    recordEvent(TEST_USER, { type: 'weekly_review_opened' })
    const log = getEventLog(TEST_USER)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ type: 'weekly_review_opened' })
  })

  it('records browse_revisit event', () => {
    recordEvent(TEST_USER, { type: 'browse_revisit', entryId: 42 })
    const log = getEventLog(TEST_USER)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ type: 'browse_revisit', entryId: 42 })
  })

  it('all events include _ts timestamp', () => {
    recordEvent(TEST_USER, { type: 'capture_created', sourceType: 'text', dockItemId: 1 })
    recordEvent(TEST_USER, { type: 'archive_completed', dockItemId: 1, sourceType: 'text' })
    recordEvent(TEST_USER, { type: 'weekly_review_opened' })

    const log = getEventLog(TEST_USER)
    for (const event of log) {
      expect(event._ts).toBeTypeOf('number')
      expect(event._ts).toBeGreaterThan(0)
    }
  })

  it('all events include userId', () => {
    recordEvent(TEST_USER, { type: 'capture_created', sourceType: 'text', dockItemId: 1 })
    const log = getEventLog(TEST_USER)
    for (const event of log) {
      expect(event.userId).toBe(TEST_USER)
    }
  })
})

describe('metrics computation', () => {
  afterEach(() => clearEventLog(TEST_USER))

  function makeEvent(type: string, extra: Record<string, unknown> = {}, tsOffset = 0): PersistedEvent {
    return { type, ...extra, _ts: Date.now() - tsOffset, userId: TEST_USER } as PersistedEvent
  }

  it('DAU is 1 when capture events exist today', () => {
    const events = [
      makeEvent('capture_created', { sourceType: 'text', dockItemId: 1 }),
    ]
    const metrics = computeMetrics(events)
    expect(metrics.dau).toBe(1)
  })

  it('DAU is 0 when no capture events today', () => {
    const events: PersistedEvent[] = []
    const metrics = computeMetrics(events)
    expect(metrics.dau).toBe(0)
  })

  it('dailyCapturesPerUser counts today captures', () => {
    const events = [
      makeEvent('capture_created', { sourceType: 'text', dockItemId: 1 }),
      makeEvent('capture_created', { sourceType: 'text', dockItemId: 2 }),
      makeEvent('chat_guided_capture_created', { dockItemId: 3, rawText: 'test' }),
    ]
    const metrics = computeMetrics(events)
    expect(metrics.dailyCapturesPerUser).toBe(3)
  })

  it('chatArchiveRate computes chat captures vs chat archives', () => {
    const events = [
      makeEvent('capture_created', { sourceType: 'chat', dockItemId: 1 }),
      makeEvent('capture_created', { sourceType: 'chat', dockItemId: 2 }),
      makeEvent('archive_completed', { dockItemId: 1, sourceType: 'chat' }),
    ]
    const metrics = computeMetrics(events)
    expect(metrics.chatArchiveRate).toBe(0.5)
  })

  it('chatArchiveRate is 0 when no chat captures', () => {
    const events = [
      makeEvent('capture_created', { sourceType: 'text', dockItemId: 1 }),
    ]
    const metrics = computeMetrics(events)
    expect(metrics.chatArchiveRate).toBe(0)
  })

  it('retention7d is 1 for new users', () => {
    const events = [
      makeEvent('capture_created', { sourceType: 'text', dockItemId: 1 }),
    ]
    const metrics = computeMetrics(events)
    expect(metrics.retention7d).toBe(1)
  })

  it('weeklyReviewOpenRate counts review events per day', () => {
    const events = [
      makeEvent('capture_created', { sourceType: 'text', dockItemId: 1 }),
      makeEvent('weekly_review_opened'),
      makeEvent('weekly_review_opened'),
    ]
    const metrics = computeMetrics(events)
    expect(metrics.weeklyReviewOpenRate).toBeGreaterThan(0)
  })

  it('metrics result includes generatedAt timestamp', () => {
    const metrics = computeMetrics([])
    expect(metrics.generatedAt).toBeTypeOf('number')
    expect(metrics.generatedAt).toBeGreaterThan(0)
  })

  it('chatArchiveRate deduplicates by dockItemId (reopen + re-archive)', () => {
    const events = [
      makeEvent('capture_created', { sourceType: 'chat', dockItemId: 1 }),
      makeEvent('archive_completed', { dockItemId: 1, sourceType: 'chat' }),
      makeEvent('archive_completed', { dockItemId: 1, sourceType: 'chat' }),
    ]
    const metrics = computeMetrics(events)
    expect(metrics.chatArchiveRate).toBe(1)
  })

  it('chatArchiveRate never exceeds 1', () => {
    const events = [
      makeEvent('capture_created', { sourceType: 'chat', dockItemId: 1 }),
      makeEvent('capture_created', { sourceType: 'chat', dockItemId: 2 }),
      makeEvent('archive_completed', { dockItemId: 1, sourceType: 'chat' }),
      makeEvent('archive_completed', { dockItemId: 1, sourceType: 'chat' }),
      makeEvent('archive_completed', { dockItemId: 1, sourceType: 'chat' }),
    ]
    const metrics = computeMetrics(events)
    expect(metrics.chatArchiveRate).toBeLessThanOrEqual(1)
  })

  it('retention7d works with out-of-order events', () => {
    const now = Date.now()
    const oneDayMs = 24 * 60 * 60 * 1000
    const sevenDaysMs = 7 * oneDayMs
    const events = [
      { type: 'capture_created', sourceType: 'text', dockItemId: 1, _ts: now - sevenDaysMs - oneDayMs } as PersistedEvent,
      { type: 'capture_created', sourceType: 'text', dockItemId: 2, _ts: now - sevenDaysMs - 2 * oneDayMs } as PersistedEvent,
      { type: 'capture_created', sourceType: 'text', dockItemId: 3, _ts: now - sevenDaysMs - 3 * oneDayMs } as PersistedEvent,
    ]
    const metrics = computeMetrics(events)
    expect(metrics.retention7d).toBe(0)
  })

  it('retention7d is 1 when D7 activity exists for old user', () => {
    const now = Date.now()
    const oneDayMs = 24 * 60 * 60 * 1000
    const sevenDaysMs = 7 * oneDayMs
    const cohortTs = now - sevenDaysMs - 5 * oneDayMs
    const events = [
      { type: 'capture_created', sourceType: 'text', dockItemId: 1, _ts: cohortTs } as PersistedEvent,
      { type: 'capture_created', sourceType: 'text', dockItemId: 2, _ts: cohortTs + sevenDaysMs } as PersistedEvent,
    ]
    const metrics = computeMetrics(events)
    expect(metrics.retention7d).toBe(1)
  })

  it('retention7d is 0 for old user active recently but not at D7', () => {
    const now = Date.now()
    const oneDayMs = 24 * 60 * 60 * 1000
    const cohortTs = now - 30 * oneDayMs
    const events = [
      { type: 'capture_created', sourceType: 'text', dockItemId: 1, _ts: cohortTs } as PersistedEvent,
      { type: 'capture_created', sourceType: 'text', dockItemId: 2, _ts: now - oneDayMs } as PersistedEvent,
    ]
    const metrics = computeMetrics(events)
    expect(metrics.retention7d).toBe(0)
  })
})

describe('event userId isolation', () => {
  afterEach(clearAll)

  it('user A cannot see user B events via getEventLog', () => {
    recordEvent(USER_A, { type: 'capture_created', sourceType: 'text', dockItemId: 1 })
    recordEvent(USER_B, { type: 'capture_created', sourceType: 'text', dockItemId: 2 })

    const logA = getEventLog(USER_A)
    const logB = getEventLog(USER_B)

    expect(logA).toHaveLength(1)
    expect(logB).toHaveLength(1)
    expect(logA[0].userId).toBe(USER_A)
    expect(logB[0].userId).toBe(USER_B)
    expect((logA[0] as { dockItemId: number }).dockItemId).toBe(1)
    expect((logB[0] as { dockItemId: number }).dockItemId).toBe(2)
  })

  it('clearing user A log does not affect user B', () => {
    recordEvent(USER_A, { type: 'capture_created', sourceType: 'text', dockItemId: 1 })
    recordEvent(USER_B, { type: 'capture_created', sourceType: 'text', dockItemId: 2 })

    clearEventLog(USER_A)

    expect(getEventLog(USER_A)).toHaveLength(0)
    expect(getEventLog(USER_B)).toHaveLength(1)
  })

  it('metrics computed from getEventLog are isolated per user', () => {
    recordEvent(USER_A, { type: 'capture_created', sourceType: 'text', dockItemId: 1 })
    recordEvent(USER_A, { type: 'capture_created', sourceType: 'text', dockItemId: 2 })
    recordEvent(USER_B, { type: 'capture_created', sourceType: 'text', dockItemId: 3 })

    const metricsA = computeMetrics(getEventLog(USER_A))
    const metricsB = computeMetrics(getEventLog(USER_B))

    expect(metricsA.dailyCapturesPerUser).toBe(2)
    expect(metricsB.dailyCapturesPerUser).toBe(1)
  })

  it('multiple event types are isolated per user', () => {
    recordEvent(USER_A, { type: 'capture_created', sourceType: 'text', dockItemId: 1 })
    recordEvent(USER_A, { type: 'archive_completed', dockItemId: 1, sourceType: 'text' })
    recordEvent(USER_B, { type: 'weekly_review_opened' })

    const logA = getEventLog(USER_A)
    const logB = getEventLog(USER_B)

    expect(logA).toHaveLength(2)
    expect(logB).toHaveLength(1)
    expect(logB[0].type).toBe('weekly_review_opened')
  })
})

describe('appEvents IndexedDB persistence', () => {
  afterEach(async () => {
    clearEventLog(TEST_USER)
    await db.table('appEvents').where('userId').equals(TEST_USER).delete()
  })

  it('recordEvent persists to appEventsTable with id', async () => {
    recordEvent(TEST_USER, { type: 'capture_created', sourceType: 'text', dockItemId: 1 })

    await new Promise(r => setTimeout(r, 100))

    const records = await db.table('appEvents')
      .where('[userId+workspaceId]')
      .equals([TEST_USER, DEFAULT_WORKSPACE_ID])
      .toArray()

    expect(records.length).toBeGreaterThanOrEqual(1)
    const last = records[records.length - 1]
    expect(last.id).toBeTruthy()
    expect(last.eventType).toBe('capture_created')
    expect(last.workspaceId).toBe(DEFAULT_WORKSPACE_ID)
  })

  it('persisted record includes workspaceId: DEFAULT_WORKSPACE_ID', async () => {
    recordEvent(TEST_USER, { type: 'weekly_review_opened' })

    await new Promise(r => setTimeout(r, 100))

    const records = await db.table('appEvents')
      .where('[userId+workspaceId]')
      .equals([TEST_USER, DEFAULT_WORKSPACE_ID])
      .toArray()

    expect(records.length).toBeGreaterThanOrEqual(1)
    for (const r of records) {
      expect(r.workspaceId).toBe(DEFAULT_WORKSPACE_ID)
    }
  })

  it('clearEventLog clears both memory cache and IndexedDB records', async () => {
    recordEvent(TEST_USER, { type: 'capture_created', sourceType: 'text', dockItemId: 1 })

    await new Promise(r => setTimeout(r, 100))

    clearEventLog(TEST_USER)

    expect(getEventLog(TEST_USER)).toHaveLength(0)

    await new Promise(r => setTimeout(r, 100))

    const records = await db.table('appEvents')
      .where('[userId+workspaceId]')
      .equals([TEST_USER, DEFAULT_WORKSPACE_ID])
      .toArray()

    expect(records).toHaveLength(0)
  })

  it('migrateFromLocalStorage writes records with id and removes old key', async () => {
    const oldKey = `atlax_event_log_${TEST_USER}`
    const migrationKey = `atlax_event_log_migrated_${TEST_USER}`

    const store: Record<string, string> = {}
    const fakeLocalStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value },
      removeItem: (key: string) => { delete store[key] },
      get length() { return Object.keys(store).length },
      clear() { for (const k of Object.keys(store)) delete store[k] },
      key(_index: number) { return null },
    }

    const origWindow = globalThis.window
    const origLocalStorage = globalThis.localStorage
    Object.defineProperty(globalThis, 'window', { value: {}, writable: true, configurable: true })
    Object.defineProperty(globalThis, 'localStorage', { value: fakeLocalStorage, writable: true, configurable: true })

    try {
      delete store[migrationKey]
      const oldEvents = [
        { type: 'capture_created', sourceType: 'text', dockItemId: 99, _ts: Date.now() - 1000, userId: TEST_USER },
      ]
      store[oldKey] = JSON.stringify(oldEvents)

      clearEventLog(TEST_USER)
      await db.table('appEvents').where('userId').equals(TEST_USER).delete()

      getEventLog(TEST_USER)

      await new Promise(r => setTimeout(r, 300))

      const records = await db.table('appEvents')
        .where('[userId+workspaceId]')
        .equals([TEST_USER, DEFAULT_WORKSPACE_ID])
        .toArray()

      expect(records.length).toBeGreaterThanOrEqual(1)
      const migrated = records.find(r => r.eventType === 'capture_created')
      expect(migrated).toBeDefined()
      if (migrated) {
        expect(migrated.id).toBeTruthy()
        expect(migrated.workspaceId).toBe(DEFAULT_WORKSPACE_ID)
      }

      expect(store[oldKey]).toBeUndefined()
      expect(store[migrationKey]).toBe('1')
    } finally {
      Object.defineProperty(globalThis, 'window', { value: origWindow, writable: true, configurable: true })
      Object.defineProperty(globalThis, 'localStorage', { value: origLocalStorage, writable: true, configurable: true })
    }
  })
})
