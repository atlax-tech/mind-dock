'use client'

import { useState, useEffect, useCallback } from 'react'
import { type DockEntityType } from './useDockData'
import { getDockViewSettings as getRepoDockViewSettings, saveDockViewSettings as saveRepoDockViewSettings } from '@/lib/repository'

export type DockViewMode = 'overview' | 'taskControl' | 'unsorted' | 'spaces' | 'recommendations' | 'health'

export type HealthFilter = 'summary' | 'isolated' | 'duplicates' | 'stagnant' | 'weaklyClassified'

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

const DEFAULT_FILTER: DockFilterState = {
  types: [],
  statuses: [],
  spaceId: null,
  hasRecommendations: null,
  healthFilter: null,
}

export function useDockViewModel(userId: string) {
  const [dockMode, setDockMode] = useState<DockViewMode>('overview')
  const [filter, setFilter] = useState<DockFilterState>(DEFAULT_FILTER)
  const [settings, setSettings] = useState<DockViewSettings>(DEFAULT_SETTINGS)
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    getRepoDockViewSettings(userId).then(saved => {
      if (cancelled) return
      if (saved) {
        setSettings({
          columnVisibility: saved.columnVisibility ?? DEFAULT_SETTINGS.columnVisibility,
          density: saved.density ?? DEFAULT_SETTINGS.density,
          defaultSort: saved.defaultSort ?? DEFAULT_SETTINGS.defaultSort,
        })
      }
      setSettingsLoaded(true)
    }).catch(() => setSettingsLoaded(true))
    return () => { cancelled = true }
  }, [userId])

  const updateSettings = useCallback(async (partial: Partial<DockViewSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial }
      if (partial.columnVisibility) {
        next.columnVisibility = { ...prev.columnVisibility, ...partial.columnVisibility }
      }
      saveRepoDockViewSettings(userId, next).catch(() => {})
      return next
    })
  }, [userId])

  const switchMode = useCallback((mode: DockViewMode, healthFilter?: HealthFilter) => {
    setDockMode(mode)
    if (mode === 'health' && healthFilter) {
      setFilter(prev => ({ ...prev, healthFilter }))
    } else if (mode !== 'health') {
      setFilter(prev => ({ ...prev, healthFilter: null }))
    }
  }, [])

  const resetFilter = useCallback(() => {
    setFilter(DEFAULT_FILTER)
  }, [])

  const toggleTypeFilter = useCallback((type: DockEntityType) => {
    setFilter(prev => {
      const types = prev.types.includes(type)
        ? prev.types.filter(t => t !== type)
        : [...prev.types, type]
      return { ...prev, types }
    })
  }, [])

  const toggleStatusFilter = useCallback((status: string) => {
    setFilter(prev => {
      const statuses = prev.statuses.includes(status)
        ? prev.statuses.filter(s => s !== status)
        : [...prev.statuses, status]
      return { ...prev, statuses }
    })
  }, [])

  const setSpaceFilter = useCallback((spaceId: string | null) => {
    setFilter(prev => ({ ...prev, spaceId }))
  }, [])

  const setHasRecommendationsFilter = useCallback((value: boolean | null) => {
    setFilter(prev => ({ ...prev, hasRecommendations: value }))
  }, [])

  const setHealthFilter = useCallback((hf: HealthFilter | null) => {
    setFilter(prev => ({ ...prev, healthFilter: hf }))
  }, [])

  const applyFilters = useCallback(<T extends { type: string; status: string; project?: string | null; tags?: string[] }>(entities: T[], recommendationsMap?: Map<string, number>): T[] => {
    let result = entities
    if (filter.types.length > 0) {
      result = result.filter(e => filter.types.includes(e.type as DockEntityType))
    }
    if (filter.statuses.length > 0) {
      result = result.filter(e => filter.statuses.includes(e.status))
    }
    if (filter.hasRecommendations === true && recommendationsMap) {
      result = result.filter(e => {
        const key = String((e as Record<string, unknown>).entryId ?? (e as Record<string, unknown>).draftId ?? (e as Record<string, unknown>).tipId ?? (e as Record<string, unknown>).mindNodeId ?? (e as Record<string, unknown>).collectionId ?? (e as Record<string, unknown>).tagId)
        return (recommendationsMap.get(key) ?? 0) > 0
      })
    }
    return result
  }, [filter])

  const sortEntities = useCallback(<T extends { updatedAt: Date | null; type: string }>(entities: T[]): T[] => {
    const sorted = [...entities]
    switch (settings.defaultSort) {
      case 'updatedAt':
        sorted.sort((a, b) => {
          const aTime = a.updatedAt?.getTime() ?? 0
          const bTime = b.updatedAt?.getTime() ?? 0
          return bTime - aTime
        })
        break
      case 'type':
        sorted.sort((a, b) => a.type.localeCompare(b.type))
        break
      case 'healthScore':
        sorted.sort((a, b) => {
          const aTime = a.updatedAt?.getTime() ?? 0
          const bTime = b.updatedAt?.getTime() ?? 0
          return bTime - aTime
        })
        break
    }
    return sorted
  }, [settings.defaultSort])

  return {
    dockMode,
    setDockMode: switchMode,
    filter,
    resetFilter,
    toggleTypeFilter,
    toggleStatusFilter,
    setSpaceFilter,
    setHasRecommendationsFilter,
    setHealthFilter,
    settings,
    updateSettings,
    settingsLoaded,
    applyFilters,
    sortEntities,
  }
}
