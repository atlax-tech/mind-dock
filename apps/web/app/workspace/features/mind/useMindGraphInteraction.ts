'use client'

import { useState, useCallback, useMemo } from 'react'

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
}

export interface MindInteractionState {
  hoveredNodeId: string | null
  focusedNodeId: string | null
  filterState: MindFilterState
  filterOpen: boolean
  layoutPhase: 'idle' | 'forceatlas2' | 'noverlap' | 'done'
  layoutIterations: number
  layoutMaxIterations: number
  relayoutCounter: number
}

export interface MindInteractionActions {
  setHoveredNode: (nodeId: string | null) => void
  setFocusedNode: (nodeId: string | null) => void
  clearFocus: () => void
  toggleFilterPanel: () => void
  updateFilter: (patch: Partial<MindFilterState>) => void
  resetFilters: () => void
  setLayoutProgress: (phase: MindInteractionState['layoutPhase'], iterations: number, maxIterations: number) => void
  triggerRelayout: () => void
}

export function useMindGraphInteraction(): {
  state: MindInteractionState
  actions: MindInteractionActions
} {
  const [hoveredNodeId, setHoveredNode] = useState<string | null>(null)
  const [focusedNodeId, setFocusedNode] = useState<string | null>(null)
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
      return next
    })
  }, [])

  const resetFilters = useCallback(() => {
    const fs = { ...DEFAULT_FILTER_STATE }
    fs.nodeTypes = new Set(DEFAULT_FILTER_STATE.nodeTypes)
    fs.edgeTypes = new Set(DEFAULT_FILTER_STATE.edgeTypes)
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

  const state: MindInteractionState = useMemo(() => ({
    hoveredNodeId,
    focusedNodeId,
    filterState,
    filterOpen,
    layoutPhase,
    layoutIterations,
    layoutMaxIterations,
    relayoutCounter,
  }), [hoveredNodeId, focusedNodeId, filterState, filterOpen, layoutPhase, layoutIterations, layoutMaxIterations, relayoutCounter])

  const actions: MindInteractionActions = useMemo(() => ({
    setHoveredNode,
    setFocusedNode,
    clearFocus,
    toggleFilterPanel,
    updateFilter,
    resetFilters,
    setLayoutProgress,
    triggerRelayout,
  }), [clearFocus, toggleFilterPanel, updateFilter, resetFilters, setLayoutProgress, triggerRelayout])

  return { state, actions }
}
