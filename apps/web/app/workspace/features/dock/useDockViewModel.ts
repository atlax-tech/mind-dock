'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDockViewSettings as getRepoDockViewSettings, saveDockViewSettings as saveRepoDockViewSettings } from '@/lib/repository'
import type { DockPresentationItem, DockPresentationKind, DockNavigationMode, DockSharedFilterState } from './dockPresentation'
import { sortDockItems } from './dockPresentation'
import type { DockEntityType } from './useDockData'

export type DockViewMode = 'overview' | 'taskControl' | 'unsorted' | 'spaces' | 'recommendations' | 'health'
export type HealthFilter = 'summary' | 'isolated' | 'duplicates' | 'stagnant' | 'weaklyClassified'
export type DockLibraryView = 'map' | 'database' | 'kanban' | 'chart' | 'custom'
export type DockWarRoomView = 'kanban' | 'database' | 'chart' | 'custom'

export interface DockFilterState {
  types: DockEntityType[]
  statuses: string[]
  spaceId: string | null
  hasRecommendations: boolean | null
  healthFilter: HealthFilter | null
}

export interface DockViewSettings {
  columnVisibility: {
    space: boolean
    status: boolean
    tags: boolean
    recommendations: boolean
    score: boolean
  }
  density: 'compact' | 'standard'
  defaultSort: 'updatedAt' | 'healthScore' | 'type'
}

const DEFAULT_SETTINGS: DockViewSettings = {
  columnVisibility: { space: true, status: true, tags: true, recommendations: true, score: true },
  density: 'standard',
  defaultSort: 'updatedAt',
}

const DEFAULT_LEGACY_FILTER: DockFilterState = {
  types: [],
  statuses: [],
  spaceId: null,
  hasRecommendations: null,
  healthFilter: null,
}

const DEFAULT_FILTERS: DockSharedFilterState = {
  query: '',
  itemKinds: [],
  statuses: [],
  tags: [],
  timeRange: 'any',
  moreFilter: 'all',
  selectedScope: null,
  includeArchive: false,
  healthFilter: null,
}

function normalizeSettings(saved: unknown): DockViewSettings {
  const input = saved as Partial<DockViewSettings> | null
  return {
    columnVisibility: {
      space: input?.columnVisibility?.space ?? DEFAULT_SETTINGS.columnVisibility.space,
      status: input?.columnVisibility?.status ?? DEFAULT_SETTINGS.columnVisibility.status,
      tags: input?.columnVisibility?.tags ?? DEFAULT_SETTINGS.columnVisibility.tags,
      recommendations: input?.columnVisibility?.recommendations ?? DEFAULT_SETTINGS.columnVisibility.recommendations,
      score: input?.columnVisibility?.score ?? DEFAULT_SETTINGS.columnVisibility.score,
    },
    density: input?.density ?? DEFAULT_SETTINGS.density,
    defaultSort: input?.defaultSort ?? DEFAULT_SETTINGS.defaultSort,
  }
}

function legacyModeToNavigation(mode: DockViewMode): DockNavigationMode {
  switch (mode) {
    case 'taskControl':
      return 'warRoom'
    case 'unsorted':
      return 'inbox'
    case 'spaces':
      return 'knowledgeFlow'
    case 'recommendations':
      return 'recommendationQueue'
    case 'health':
      return 'healthRisks'
    case 'overview':
    default:
      return 'libraryOverview'
  }
}

function navigationToLegacyMode(navigationMode: DockNavigationMode): DockViewMode {
  switch (navigationMode) {
    case 'warRoom':
      return 'taskControl'
    case 'inbox':
      return 'unsorted'
    case 'knowledgeFlow':
      return 'spaces'
    case 'recommendationQueue':
      return 'recommendations'
    case 'healthRisks':
      return 'health'
    case 'archiveEvidence':
    case 'customViews':
    case 'libraryOverview':
    default:
      return 'overview'
  }
}

function dockEntityTypeToKind(type: DockEntityType): DockPresentationKind {
  switch (type) {
    case 'document':
      return 'document'
    case 'draft':
      return 'draft'
    case 'tip':
      return 'signal'
    case 'mindNode':
      return 'mindNode'
    case 'collection':
      return 'project'
    case 'tag':
      return 'topic'
  }
}

function dockKindToEntityType(kind: DockPresentationKind): DockEntityType | null {
  switch (kind) {
    case 'document':
      return 'document'
    case 'draft':
      return 'draft'
    case 'signal':
      return 'tip'
    case 'mindNode':
      return 'mindNode'
    case 'project':
    case 'archiveEvidence':
      return 'collection'
    case 'topic':
      return 'tag'
    case 'recommendation':
      return null
  }
}

function healthFilterToMoreFilter(filter: HealthFilter | null): DockSharedFilterState['moreFilter'] {
  return filter && filter !== 'summary' ? 'risks' : 'all'
}

export function useDockViewModel(userId: string) {
  const [navigationMode, setNavigationMode] = useState<DockNavigationMode>('libraryOverview')
  const [libraryView, setLibraryView] = useState<DockLibraryView>('database')
  const [warRoomView, setWarRoomView] = useState<DockWarRoomView>('kanban')
  const [filters, setFilters] = useState<DockSharedFilterState>(DEFAULT_FILTERS)
  const [legacyFilter, setLegacyFilter] = useState<DockFilterState>(DEFAULT_LEGACY_FILTER)
  const [settings, setSettings] = useState<DockViewSettings>(DEFAULT_SETTINGS)
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    getRepoDockViewSettings(userId)
      .then((saved) => {
        if (cancelled) return
        setSettings(normalizeSettings(saved))
        setSettingsLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setSettingsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const updateSettings = useCallback(
    async (partial: Partial<DockViewSettings>) => {
      setSettings((prev) => {
        const next = {
          ...prev,
          ...partial,
          columnVisibility: partial.columnVisibility
            ? { ...prev.columnVisibility, ...partial.columnVisibility }
            : prev.columnVisibility,
        }
        saveRepoDockViewSettings(userId, next).catch(() => {})
        return next
      })
    },
    [userId],
  )

  const updateFilters = useCallback((partial: Partial<DockSharedFilterState>) => {
    setFilters((prev) => ({ ...prev, ...partial }))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setLegacyFilter(DEFAULT_LEGACY_FILTER)
  }, [])

  const toggleItemKind = useCallback((kind: DockPresentationKind) => {
    setFilters((prev) => {
      const itemKinds = prev.itemKinds.includes(kind)
        ? prev.itemKinds.filter((value) => value !== kind)
        : [...prev.itemKinds, kind]
      return { ...prev, itemKinds }
    })
  }, [])

  const toggleStatus = useCallback((status: string) => {
    setFilters((prev) => {
      const statuses = prev.statuses.includes(status)
        ? prev.statuses.filter((value) => value !== status)
        : [...prev.statuses, status]
      return { ...prev, statuses }
    })
  }, [])

  const toggleTag = useCallback((tag: string) => {
    setFilters((prev) => {
      const tags = prev.tags.includes(tag) ? prev.tags.filter((value) => value !== tag) : [...prev.tags, tag]
      return { ...prev, tags }
    })
  }, [])

  const switchMode = useCallback((mode: DockViewMode, healthFilter?: HealthFilter) => {
    const nextNavigation = legacyModeToNavigation(mode)
    setNavigationMode(nextNavigation)
    if (mode === 'health') {
      setFilters((prev) => ({
        ...prev,
        moreFilter: healthFilterToMoreFilter(healthFilter ?? 'summary'),
        healthFilter: healthFilter ?? 'summary',
      }))
      setLegacyFilter((prev) => ({ ...prev, healthFilter: healthFilter ?? 'summary' }))
      return
    }
    setFilters((prev) => ({ ...prev, healthFilter: null, moreFilter: prev.moreFilter === 'risks' ? 'all' : prev.moreFilter }))
    setLegacyFilter((prev) => ({ ...prev, healthFilter: null }))
  }, [])

  const toggleTypeFilter = useCallback((type: DockEntityType) => {
    setLegacyFilter((prev) => {
      const types = prev.types.includes(type) ? prev.types.filter((value) => value !== type) : [...prev.types, type]
      return { ...prev, types }
    })
    toggleItemKind(dockEntityTypeToKind(type))
  }, [toggleItemKind])

  const toggleStatusFilter = useCallback((status: string) => {
    setLegacyFilter((prev) => {
      const statuses = prev.statuses.includes(status)
        ? prev.statuses.filter((value) => value !== status)
        : [...prev.statuses, status]
      return { ...prev, statuses }
    })
    toggleStatus(status)
  }, [toggleStatus])

  const setSpaceFilter = useCallback((spaceId: string | null) => {
    setLegacyFilter((prev) => ({ ...prev, spaceId }))
    setFilters((prev) => ({ ...prev, selectedScope: spaceId }))
  }, [])

  const setHasRecommendationsFilter = useCallback((value: boolean | null) => {
    setLegacyFilter((prev) => ({ ...prev, hasRecommendations: value }))
    setFilters((prev) => ({
      ...prev,
      moreFilter: value === true ? 'recommendationBacked' : prev.moreFilter === 'recommendationBacked' ? 'all' : prev.moreFilter,
    }))
  }, [])

  const setHealthFilter = useCallback((filter: HealthFilter | null) => {
    setLegacyFilter((prev) => ({ ...prev, healthFilter: filter }))
    setFilters((prev) => ({
      ...prev,
      moreFilter: healthFilterToMoreFilter(filter),
      healthFilter: filter,
    }))
  }, [])

  const legacyMode = useMemo(() => navigationToLegacyMode(navigationMode), [navigationMode])

  const applyFilters = useCallback(
    <T extends { type: string; status: string; updatedAt?: Date | null; tags?: string[] }>(items: T[], recommendationsMap?: Map<string, number>): T[] => {
      let result = items
      if (legacyFilter.types.length > 0) {
        result = result.filter((item) => legacyFilter.types.includes(item.type as DockEntityType))
      }
      if (legacyFilter.statuses.length > 0) {
        result = result.filter((item) => legacyFilter.statuses.includes(item.status))
      }
      if (legacyFilter.hasRecommendations === true && recommendationsMap) {
        result = result.filter((item) => {
          const record = item as Record<string, unknown>
          const key = String(
            record.entryId ??
              record.draftId ??
              record.tipId ??
              record.mindNodeId ??
              record.collectionId ??
              record.tagId ??
              '',
          )
          return (recommendationsMap.get(key) ?? 0) > 0
        })
      }
      return result
    },
    [legacyFilter],
  )

  const sortItems = useCallback(
    (items: DockPresentationItem[]) => sortDockItems(items, settings.defaultSort),
    [settings.defaultSort],
  )

  const sortEntities = useCallback(
    <T extends { updatedAt: Date | null; type: string }>(items: T[]): T[] => {
      const sorted = [...items]
      if (settings.defaultSort === 'type') {
        sorted.sort((a, b) => a.type.localeCompare(b.type))
        return sorted
      }
      if (settings.defaultSort === 'healthScore') {
        sorted.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
        return sorted
      }
      sorted.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
      return sorted
    },
    [settings.defaultSort],
  )

  const selectedKindsAsEntityTypes = useMemo(
    () =>
      filters.itemKinds
        .map((kind) => dockKindToEntityType(kind))
        .filter((value): value is DockEntityType => value !== null),
    [filters.itemKinds],
  )

  return {
    navigationMode,
    setNavigationMode,
    libraryView,
    setLibraryView,
    warRoomView,
    setWarRoomView,
    filters,
    updateFilters,
    resetFilters,
    toggleItemKind,
    toggleStatus,
    toggleTag,
    settings,
    updateSettings,
    settingsLoaded,
    sortItems,

    dockMode: legacyMode,
    setDockMode: switchMode,
    filter: {
      ...legacyFilter,
      types: selectedKindsAsEntityTypes.length > 0 ? selectedKindsAsEntityTypes : legacyFilter.types,
      statuses: filters.statuses.length > 0 ? filters.statuses : legacyFilter.statuses,
      spaceId: filters.selectedScope,
      hasRecommendations:
        filters.moreFilter === 'recommendationBacked'
          ? true
          : legacyFilter.hasRecommendations,
      healthFilter: (filters.healthFilter as HealthFilter | null) ?? legacyFilter.healthFilter,
    },
    resetFilter: resetFilters,
    toggleTypeFilter,
    toggleStatusFilter,
    setSpaceFilter,
    setHasRecommendationsFilter,
    setHealthFilter,
    applyFilters,
    sortEntities,
  }
}
