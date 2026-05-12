'use client'

import { useState, useCallback, useMemo } from 'react'

export type TimeField = 'createdAt' | 'updatedAt'
export type TimeQuickPreset = 'day' | 'week' | 'month' | 'year' | 'custom'

export interface MindFilterState {
  search: string
  nodeTypes: Set<string>
  edgeTypes: Set<string>
  showDocuments: boolean
  showTags: boolean
  showSources: boolean
  showSuggested: boolean
  showConfirmed: boolean
  showOrphans: boolean
  minConfidence: number
  minStrength: number
  timeField: TimeField | null
  timeRangeStart: number | null
  timeRangeEnd: number | null
  timeQuickPreset: TimeQuickPreset | null
  timeAnchorDate: string | null
}

export const DEFAULT_FILTER_STATE: MindFilterState = {
  search: '',
  nodeTypes: new Set<string>(['root', 'domain', 'project', 'topic', 'document', 'fragment', 'source', 'tag', 'question', 'insight', 'time']),
  edgeTypes: new Set<string>(['parent_child', 'semantic', 'reference', 'source', 'temporal', 'confirmed', 'suggested', 'conflict']),
  showDocuments: true,
  showTags: true,
  showSources: true,
  showSuggested: true,
  showConfirmed: true,
  showOrphans: true,
  minConfidence: 0,
  minStrength: 0,
  timeField: null,
  timeRangeStart: null,
  timeRangeEnd: null,
  timeQuickPreset: null,
  timeAnchorDate: null,
}

export type MindScopeType = 'global' | 'domain' | 'project' | 'collection' | 'tag' | 'focusedNode'

export interface MindInteractionState {
  hoveredNodeId: string | null
  focusedNodeId: string | null
  selectedNodeId: string | null
  filterState: MindFilterState
  filterOpen: boolean
  layoutPhase: 'idle' | 'forceatlas2' | 'noverlap' | 'done'
  layoutIterations: number
  layoutMaxIterations: number
  relayoutCounter: number
  layoutMode: 'force' | 'radial' | 'orbit'
  scope: MindScopeType
  scopeTargetId: string | null
  chainRootId: string | null
  viewScope: 'focusMap' | 'clusterMap' | 'linkReview' | 'driftInbox' | 'timelineSnapshot'
  connectMode: boolean
  connectSourceId: string | null
  changeParentMode: boolean
  changeParentSourceId: string | null
}

export interface MindInteractionActions {
  setHoveredNode: (nodeId: string | null) => void
  setFocusedNode: (nodeId: string | null) => void
  setSelectedNode: (nodeId: string | null) => void
  clearFocus: () => void
  toggleFilterPanel: () => void
  updateFilter: (patch: Partial<MindFilterState>) => void
  resetFilters: () => void
  setLayoutProgress: (phase: MindInteractionState['layoutPhase'], iterations: number, maxIterations: number) => void
  triggerRelayout: () => void
  setLayoutMode: (mode: 'force' | 'radial' | 'orbit') => void
  setScope: (scope: MindScopeType) => void
  setScopeTarget: (id: string | null) => void
  setChainRoot: (nodeId: string | null) => void
  setViewScope: (viewScope: MindInteractionState['viewScope']) => void
  enterConnectMode: (sourceId: string) => void
  exitConnectMode: () => void
  enterChangeParentMode: (sourceId: string) => void
  exitChangeParentMode: () => void
}

export function useMindGraphInteraction(): {
  state: MindInteractionState
  actions: MindInteractionActions
} {
  const [hoveredNodeId, setHoveredNode] = useState<string | null>(null)
  const [focusedNodeId, setFocusedNode] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNode] = useState<string | null>(null)
  const [filterState, setFilterState] = useState<MindFilterState>(() => {
    const fs = { ...DEFAULT_FILTER_STATE }
    fs.nodeTypes = new Set(DEFAULT_FILTER_STATE.nodeTypes)
    fs.edgeTypes = new Set(DEFAULT_FILTER_STATE.edgeTypes)
    return fs
  })
  const [filterOpen, setFilterOpen] = useState(false)
  const [layoutPhase, setLayoutPhase] = useState<MindInteractionState['layoutPhase']>('idle')
  const [layoutIterations, setLayoutIterations] = useState(0)
  const [layoutMaxIterations, setLayoutMaxIterations] = useState(0)
  const [relayoutCounter, setRelayoutCounter] = useState(0)
  const [layoutMode, setLayoutMode] = useState<'force' | 'radial' | 'orbit'>('force')
  const [scope, setScope] = useState<MindScopeType>('global')
  const [scopeTargetId, setScopeTarget] = useState<string | null>(null)
  const [chainRootId, setChainRoot] = useState<string | null>(null)
  const [viewScope, setViewScope] = useState<MindInteractionState['viewScope']>('focusMap')
  const [connectMode, setConnectMode] = useState(false)
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null)
  const [changeParentMode, setChangeParentMode] = useState(false)
  const [changeParentSourceId, setChangeParentSourceId] = useState<string | null>(null)

  const clearFocus = useCallback(() => {
    setFocusedNode(null)
  }, [])

  const toggleFilterPanel = useCallback(() => {
    setFilterOpen(v => !v)
  }, [])

  const updateFilter = useCallback((patch: Partial<MindFilterState>) => {
    setFilterState(prev => {
      const next = { ...prev }
      if (patch.nodeTypes) next.nodeTypes = new Set(patch.nodeTypes)
      else next.nodeTypes = new Set(prev.nodeTypes)
      if (patch.edgeTypes) next.edgeTypes = new Set(patch.edgeTypes)
      else next.edgeTypes = new Set(prev.edgeTypes)
      if (patch.search !== undefined) next.search = patch.search
      if (patch.showDocuments !== undefined) next.showDocuments = patch.showDocuments
      if (patch.showTags !== undefined) next.showTags = patch.showTags
      if (patch.showSources !== undefined) next.showSources = patch.showSources
      if (patch.showSuggested !== undefined) next.showSuggested = patch.showSuggested
      if (patch.showConfirmed !== undefined) next.showConfirmed = patch.showConfirmed
      if (patch.showOrphans !== undefined) next.showOrphans = patch.showOrphans
      if (patch.minConfidence !== undefined) next.minConfidence = patch.minConfidence
      if (patch.minStrength !== undefined) next.minStrength = patch.minStrength
      if (patch.timeField !== undefined) next.timeField = patch.timeField
      if (patch.timeRangeStart !== undefined) next.timeRangeStart = patch.timeRangeStart
      if (patch.timeRangeEnd !== undefined) next.timeRangeEnd = patch.timeRangeEnd
      if (patch.timeQuickPreset !== undefined) next.timeQuickPreset = patch.timeQuickPreset
      if (patch.timeAnchorDate !== undefined) next.timeAnchorDate = patch.timeAnchorDate
      return next
    })
  }, [])

  const resetFilters = useCallback(() => {
    const fs = { ...DEFAULT_FILTER_STATE }
    fs.nodeTypes = new Set(DEFAULT_FILTER_STATE.nodeTypes)
    fs.edgeTypes = new Set(DEFAULT_FILTER_STATE.edgeTypes)
    fs.timeField = null
    fs.timeRangeStart = null
    fs.timeRangeEnd = null
    fs.timeQuickPreset = null
    fs.timeAnchorDate = null
    setFilterState(fs)
  }, [])

  const setLayoutProgress = useCallback((phase: MindInteractionState['layoutPhase'], iterations: number, maxIterations: number) => {
    setLayoutPhase(phase)
    setLayoutIterations(iterations)
    setLayoutMaxIterations(maxIterations)
  }, [])

  const triggerRelayout = useCallback(() => {
    setRelayoutCounter(c => c + 1)
  }, [])

  const handleSetLayoutMode = useCallback((mode: 'force' | 'radial' | 'orbit') => {
    setLayoutMode(mode)
  }, [])

  const enterConnectMode = useCallback((sourceId: string) => {
    setConnectMode(true)
    setConnectSourceId(sourceId)
  }, [])

  const exitConnectMode = useCallback(() => {
    setConnectMode(false)
    setConnectSourceId(null)
  }, [])

  const enterChangeParentMode = useCallback((sourceId: string) => {
    setChangeParentMode(true)
    setChangeParentSourceId(sourceId)
  }, [])

  const exitChangeParentMode = useCallback(() => {
    setChangeParentMode(false)
    setChangeParentSourceId(null)
  }, [])

  const state: MindInteractionState = useMemo(() => ({
    hoveredNodeId,
    focusedNodeId,
    selectedNodeId,
    filterState,
    filterOpen,
    layoutPhase,
    layoutIterations,
    layoutMaxIterations,
    relayoutCounter,
    layoutMode,
    scope,
    scopeTargetId,
    chainRootId,
    viewScope,
    connectMode,
    connectSourceId,
    changeParentMode,
    changeParentSourceId,
  }), [hoveredNodeId, focusedNodeId, selectedNodeId, filterState, filterOpen, layoutPhase, layoutIterations, layoutMaxIterations, relayoutCounter, layoutMode, scope, scopeTargetId, chainRootId, viewScope, connectMode, connectSourceId, changeParentMode, changeParentSourceId])

  const actions: MindInteractionActions = useMemo(() => ({
    setHoveredNode,
    setFocusedNode,
    setSelectedNode,
    clearFocus,
    toggleFilterPanel,
    updateFilter,
    resetFilters,
    setLayoutProgress,
    triggerRelayout,
    setLayoutMode: handleSetLayoutMode,
    setScope,
    setScopeTarget,
    setChainRoot,
    setViewScope,
    enterConnectMode,
    exitConnectMode,
    enterChangeParentMode,
    exitChangeParentMode,
  }), [clearFocus, toggleFilterPanel, updateFilter, resetFilters, setLayoutProgress, triggerRelayout, handleSetLayoutMode, enterConnectMode, exitConnectMode, enterChangeParentMode, exitChangeParentMode])

  return { state, actions }
}
