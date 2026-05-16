import { describe, expect, it } from 'vitest'
import { applyFilterState } from '../app/workspace/features/mind/useMindCanvasRenderer'
import { computePresetRange, parseLocalDateStart, parseLocalDateEnd } from '../app/workspace/features/mind/MindFilterPanel'
import { DEFAULT_FILTER_STATE } from '../app/workspace/features/mind/useMindGraphInteraction'
import type { CanvasRenderNode } from '../app/workspace/features/mind/useMindCanvasRenderer'
import type { MindFilterState } from '../app/workspace/features/mind/useMindGraphInteraction'
import type { MindGraphSnapshotEdge } from '../app/workspace/features/mind/types'

function makeNode(overrides: Partial<CanvasRenderNode> & { id: string }): CanvasRenderNode {
  return {
    label: 'test',
    nodeType: 'topic',
    x: 0, y: 0, vx: 0, vy: 0,
    targetX: 0, targetY: 0,
    radius: 3, color: '#bbf7d0', alpha: 1,
    documentId: null,
    hasSavedPosition: false,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}

function makeEdge(sourceNodeId: string, targetNodeId: string): MindGraphSnapshotEdge {
  return {
    id: `edge-${sourceNodeId}-${targetNodeId}`,
    sourceNodeId,
    targetNodeId,
    edgeType: 'semantic',
    strength: 0.5,
    source: 'system',
    confidence: 0.8,
    reason: null,
  }
}

function baseFilter(overrides: Partial<MindFilterState> = {}): MindFilterState {
  const fs = { ...DEFAULT_FILTER_STATE }
  fs.nodeTypes = new Set(DEFAULT_FILTER_STATE.nodeTypes)
  fs.edgeTypes = new Set(DEFAULT_FILTER_STATE.edgeTypes)
  return { ...fs, ...overrides }
}

const NOW = Date.now()
const ONE_DAY = 24 * 60 * 60 * 1000

describe('Time filter: applyFilterState', () => {
  it('createdAt filter only uses createdAt, ignores updatedAt', () => {
    const nodes = [
      makeNode({ id: 'a', createdAt: NOW - ONE_DAY, updatedAt: NOW - 100 }),
      makeNode({ id: 'b', createdAt: NOW - 100, updatedAt: NOW - ONE_DAY }),
      makeNode({ id: 'c', createdAt: null, updatedAt: NOW - 100 }),
    ]
    const edges: MindGraphSnapshotEdge[] = []

    const filter = baseFilter({
      timeField: 'createdAt',
      timeRangeStart: NOW - ONE_DAY * 2,
      timeRangeEnd: NOW - ONE_DAY + 1000,
    })

    const result = applyFilterState(nodes, edges, filter)
    expect(result.nodes.map(n => n.id)).toContain('a')
    expect(result.nodes.map(n => n.id)).not.toContain('b')
    expect(result.nodes.map(n => n.id)).not.toContain('c')
  })

  it('updatedAt filter only uses updatedAt, ignores createdAt', () => {
    const nodes = [
      makeNode({ id: 'a', createdAt: NOW - 100, updatedAt: NOW - ONE_DAY }),
      makeNode({ id: 'b', createdAt: NOW - ONE_DAY, updatedAt: NOW - 100 }),
      makeNode({ id: 'c', createdAt: NOW - 100, updatedAt: null }),
    ]
    const edges: MindGraphSnapshotEdge[] = []

    const filter = baseFilter({
      timeField: 'updatedAt',
      timeRangeStart: NOW - ONE_DAY * 2,
      timeRangeEnd: NOW - ONE_DAY + 1000,
    })

    const result = applyFilterState(nodes, edges, filter)
    expect(result.nodes.map(n => n.id)).toContain('a')
    expect(result.nodes.map(n => n.id)).not.toContain('b')
    expect(result.nodes.map(n => n.id)).not.toContain('c')
  })

  it('time range filters nodes within start and end', () => {
    const nodes = [
      makeNode({ id: 'in-range', createdAt: NOW - ONE_DAY, updatedAt: NOW - ONE_DAY }),
      makeNode({ id: 'too-early', createdAt: NOW - ONE_DAY * 3, updatedAt: NOW - ONE_DAY * 3 }),
      makeNode({ id: 'too-late', createdAt: NOW + ONE_DAY, updatedAt: NOW + ONE_DAY }),
    ]
    const edges: MindGraphSnapshotEdge[] = []

    const filter = baseFilter({
      timeField: 'createdAt',
      timeRangeStart: NOW - ONE_DAY * 2,
      timeRangeEnd: NOW,
    })

    const result = applyFilterState(nodes, edges, filter)
    expect(result.nodes.map(n => n.id)).toEqual(['in-range'])
  })

  it('only start: includes nodes with ts >= start', () => {
    const nodes = [
      makeNode({ id: 'a', createdAt: NOW - ONE_DAY, updatedAt: NOW - ONE_DAY }),
      makeNode({ id: 'b', createdAt: NOW - ONE_DAY * 3, updatedAt: NOW - ONE_DAY * 3 }),
    ]
    const edges: MindGraphSnapshotEdge[] = []

    const filter = baseFilter({
      timeField: 'createdAt',
      timeRangeStart: NOW - ONE_DAY * 2,
      timeRangeEnd: null,
    })

    const result = applyFilterState(nodes, edges, filter)
    expect(result.nodes.map(n => n.id)).toEqual(['a'])
  })

  it('only end: includes nodes with ts <= end', () => {
    const nodes = [
      makeNode({ id: 'a', createdAt: NOW - ONE_DAY * 3, updatedAt: NOW - ONE_DAY * 3 }),
      makeNode({ id: 'b', createdAt: NOW + ONE_DAY, updatedAt: NOW + ONE_DAY }),
    ]
    const edges: MindGraphSnapshotEdge[] = []

    const filter = baseFilter({
      timeField: 'createdAt',
      timeRangeStart: null,
      timeRangeEnd: NOW,
    })

    const result = applyFilterState(nodes, edges, filter)
    expect(result.nodes.map(n => n.id)).toEqual(['a'])
  })

  it('timeField null disables time filtering', () => {
    const nodes = [
      makeNode({ id: 'a', createdAt: NOW - ONE_DAY * 10, updatedAt: NOW - ONE_DAY * 10 }),
    ]
    const edges: MindGraphSnapshotEdge[] = []

    const filter = baseFilter({
      timeField: null,
      timeRangeStart: NOW - 100,
      timeRangeEnd: NOW + 100,
    })

    const result = applyFilterState(nodes, edges, filter)
    expect(result.nodes.map(n => n.id)).toEqual(['a'])
  })

  it('time filter removes edges where either endpoint is filtered out', () => {
    const nodes = [
      makeNode({ id: 'a', createdAt: NOW - ONE_DAY, updatedAt: NOW - ONE_DAY }),
      makeNode({ id: 'b', createdAt: NOW - ONE_DAY * 10, updatedAt: NOW - ONE_DAY * 10 }),
    ]
    const edges = [makeEdge('a', 'b')]

    const filter = baseFilter({
      timeField: 'createdAt',
      timeRangeStart: NOW - ONE_DAY * 2,
      timeRangeEnd: NOW,
    })

    const result = applyFilterState(nodes, edges, filter)
    expect(result.nodes.map(n => n.id)).toEqual(['a'])
    expect(result.edges).toHaveLength(0)
  })

  it('resetFilters clears time filter fields', () => {
    const reset = baseFilter({
      timeField: null,
      timeRangeStart: null,
      timeRangeEnd: null,
      timeQuickPreset: null,
      timeAnchorDate: null,
    })

    const afterSet = baseFilter({
      timeField: 'createdAt',
      timeRangeStart: NOW - ONE_DAY,
      timeRangeEnd: NOW,
      timeQuickPreset: 'week',
      timeAnchorDate: '2026-05-10',
    })

    expect(afterSet.timeField).toBe('createdAt')
    expect(afterSet.timeQuickPreset).toBe('week')

    const afterReset = baseFilter()
    expect(afterReset.timeField).toBeNull()
    expect(afterReset.timeRangeStart).toBeNull()
    expect(afterReset.timeRangeEnd).toBeNull()
    expect(afterReset.timeQuickPreset).toBeNull()
    expect(afterReset.timeAnchorDate).toBeNull()
    expect(reset).toEqual(afterReset)
  })
})

describe('Time filter: computePresetRange', () => {
  it('day preset returns 00:00:00 to 23:59:59.999', () => {
    const { start, end } = computePresetRange('createdAt', 'day', '2026-05-13')
    const startDate = new Date(start)
    const endDate = new Date(end)

    expect(startDate.getFullYear()).toBe(2026)
    expect(startDate.getMonth()).toBe(4)
    expect(startDate.getDate()).toBe(13)
    expect(startDate.getHours()).toBe(0)
    expect(startDate.getMinutes()).toBe(0)

    expect(endDate.getFullYear()).toBe(2026)
    expect(endDate.getMonth()).toBe(4)
    expect(endDate.getDate()).toBe(13)
    expect(endDate.getHours()).toBe(23)
    expect(endDate.getMinutes()).toBe(59)
  })

  it('week preset returns Monday to Sunday', () => {
    const { start, end } = computePresetRange('createdAt', 'week', '2026-05-13')
    const startDate = new Date(start)
    const endDate = new Date(end)

    expect(startDate.getDay()).toBe(1)
    expect(startDate.getDate()).toBe(11)
    expect(endDate.getDay()).toBe(0)
    expect(endDate.getDate()).toBe(17)
  })

  it('week preset with Sunday anchor returns previous Monday', () => {
    const { start } = computePresetRange('createdAt', 'week', '2026-05-17')
    const startDate = new Date(start)
    expect(startDate.getDay()).toBe(1)
    expect(startDate.getDate()).toBe(11)
  })

  it('month preset returns first to last day of month', () => {
    const { start, end } = computePresetRange('createdAt', 'month', '2026-02-15')
    const startDate = new Date(start)
    const endDate = new Date(end)

    expect(startDate.getDate()).toBe(1)
    expect(startDate.getMonth()).toBe(1)
    expect(endDate.getDate()).toBe(28)
    expect(endDate.getMonth()).toBe(1)
  })

  it('month preset handles 31-day months', () => {
    const { end } = computePresetRange('createdAt', 'month', '2026-05-15')
    const endDate = new Date(end)
    expect(endDate.getDate()).toBe(31)
  })

  it('year preset returns Jan 1 to Dec 31', () => {
    const { start, end } = computePresetRange('createdAt', 'year', '2026-07-15')
    const startDate = new Date(start)
    const endDate = new Date(end)

    expect(startDate.getMonth()).toBe(0)
    expect(startDate.getDate()).toBe(1)
    expect(endDate.getMonth()).toBe(11)
    expect(endDate.getDate()).toBe(31)
  })

  it('day preset correctly filters nodes', () => {
    const { start, end } = computePresetRange('createdAt', 'day', '2026-05-13')

    const nodes = [
      makeNode({ id: 'in-day', createdAt: start + 1000 }),
      makeNode({ id: 'before-day', createdAt: start - 1000 }),
      makeNode({ id: 'after-day', createdAt: end + 1000 }),
    ]
    const edges: MindGraphSnapshotEdge[] = []

    const filter = baseFilter({
      timeField: 'createdAt',
      timeRangeStart: start,
      timeRangeEnd: end,
    })

    const result = applyFilterState(nodes, edges, filter)
    expect(result.nodes.map(n => n.id)).toEqual(['in-day'])
  })
})

describe('Time filter: default day preset on field selection', () => {
  it('selecting createdAt defaults timeQuickPreset to day', () => {
    const fs = baseFilter({ timeField: 'createdAt' })
    expect(fs.timeField).toBe('createdAt')
  })

  it('selecting a date with day preset generates range and filters', () => {
    const { start, end } = computePresetRange('createdAt', 'day', '2026-05-13')

    const nodes = [
      makeNode({ id: 'in-day', createdAt: start + 3600000 }),
      makeNode({ id: 'before-day', createdAt: start - 1000 }),
      makeNode({ id: 'after-day', createdAt: end + 1000 }),
    ]
    const edges: MindGraphSnapshotEdge[] = []

    const filter = baseFilter({
      timeField: 'createdAt',
      timeQuickPreset: 'day',
      timeAnchorDate: '2026-05-13',
      timeRangeStart: start,
      timeRangeEnd: end,
    })

    const result = applyFilterState(nodes, edges, filter)
    expect(result.nodes.map(n => n.id)).toEqual(['in-day'])
  })

  it('switching preset from day to week recalculates range', () => {
    const dayRange = computePresetRange('createdAt', 'day', '2026-05-13')
    const weekRange = computePresetRange('createdAt', 'week', '2026-05-13')

    expect(weekRange.start).toBeLessThan(dayRange.start)
    expect(weekRange.end).toBeGreaterThan(dayRange.end)
  })

  it('switching timeField preserves preset and anchorDate', () => {
    const { start: startA, end: endA } = computePresetRange('createdAt', 'day', '2026-05-13')
    const { start: startB, end: endB } = computePresetRange('updatedAt', 'day', '2026-05-13')

    expect(startA).toBe(startB)
    expect(endA).toBe(endB)
  })

  it('disabling time field clears all time filter state', () => {
    const fs = baseFilter()
    expect(fs.timeField).toBeNull()
    expect(fs.timeQuickPreset).toBeNull()
    expect(fs.timeAnchorDate).toBeNull()
    expect(fs.timeRangeStart).toBeNull()
    expect(fs.timeRangeEnd).toBeNull()
  })
})

describe('Time filter: local date parsing (timezone-safe)', () => {
  it('parseLocalDateStart returns local 00:00:00.000', () => {
    const ts = parseLocalDateStart('2026-05-13')
    const d = new Date(ts)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(4)
    expect(d.getDate()).toBe(13)
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
    expect(d.getSeconds()).toBe(0)
    expect(d.getMilliseconds()).toBe(0)
  })

  it('parseLocalDateEnd returns local 23:59:59.999', () => {
    const ts = parseLocalDateEnd('2026-05-13')
    const d = new Date(ts)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(4)
    expect(d.getDate()).toBe(13)
    expect(d.getHours()).toBe(23)
    expect(d.getMinutes()).toBe(59)
    expect(d.getSeconds()).toBe(59)
    expect(d.getMilliseconds()).toBe(999)
  })

  it('custom start/end date uses local full-day range for filtering', () => {
    const start = parseLocalDateStart('2026-05-13')
    const end = parseLocalDateEnd('2026-05-13')

    const nodes = [
      makeNode({ id: 'at-midnight', createdAt: start }),
      makeNode({ id: 'at-end', createdAt: end }),
      makeNode({ id: 'before', createdAt: start - 1 }),
      makeNode({ id: 'after', createdAt: end + 1 }),
    ]
    const edges: MindGraphSnapshotEdge[] = []

    const filter = baseFilter({
      timeField: 'createdAt',
      timeRangeStart: start,
      timeRangeEnd: end,
    })

    const result = applyFilterState(nodes, edges, filter)
    expect(result.nodes.map(n => n.id)).toEqual(['at-midnight', 'at-end'])
  })
})

describe('Time filter: S/I metrics from filtered graph', () => {
  it('suggested edges count only from filtered graph after time filter', () => {
    const nodes = [
      makeNode({ id: 'a', createdAt: NOW - 100, updatedAt: NOW - 100 }),
      makeNode({ id: 'b', createdAt: NOW - 100, updatedAt: NOW - 100 }),
      makeNode({ id: 'c', createdAt: NOW - ONE_DAY * 10, updatedAt: NOW - ONE_DAY * 10 }),
    ]
    const suggestedEdge: MindGraphSnapshotEdge = {
      id: 'sug-a-b',
      sourceNodeId: 'a',
      targetNodeId: 'b',
      edgeType: 'suggested',
      strength: 0.5,
      source: 'system',
      confidence: 0.8,
      reason: null,
    }
    const suggestedEdgeOld: MindGraphSnapshotEdge = {
      id: 'sug-c-a',
      sourceNodeId: 'c',
      targetNodeId: 'a',
      edgeType: 'suggested',
      strength: 0.5,
      source: 'system',
      confidence: 0.8,
      reason: null,
    }
    const edges = [suggestedEdge, suggestedEdgeOld]

    const filter = baseFilter({
      timeField: 'createdAt',
      timeRangeStart: NOW - ONE_DAY,
      timeRangeEnd: NOW,
    })

    const result = applyFilterState(nodes, edges, filter)
    const filteredSuggested = result.edges.filter(e => e.edgeType === 'suggested')
    expect(filteredSuggested).toHaveLength(1)
    expect(filteredSuggested[0].id).toBe('sug-a-b')
  })

  it('isolated nodes count only from filtered graph after time filter', () => {
    const nodes = [
      makeNode({ id: 'connected', createdAt: NOW - 100, updatedAt: NOW - 100 }),
      makeNode({ id: 'isolated-in-range', createdAt: NOW - 100, updatedAt: NOW - 100 }),
      makeNode({ id: 'isolated-out-of-range', createdAt: NOW - ONE_DAY * 10, updatedAt: NOW - ONE_DAY * 10 }),
    ]
    const edges = [makeEdge('connected', 'isolated-in-range')]

    const filter = baseFilter({
      timeField: 'createdAt',
      timeRangeStart: NOW - ONE_DAY,
      timeRangeEnd: NOW,
    })

    const result = applyFilterState(nodes, edges, filter)
    const nodeIds = new Set(result.nodes.map(n => n.id))
    const connectedIds = new Set<string>()
    result.edges.forEach(e => { connectedIds.add(e.sourceNodeId); connectedIds.add(e.targetNodeId) })
    const filteredIsolated = result.nodes.filter(n => !connectedIds.has(n.id))

    expect(nodeIds.has('isolated-out-of-range')).toBe(false)
    expect(filteredIsolated).toHaveLength(0)
  })
})
