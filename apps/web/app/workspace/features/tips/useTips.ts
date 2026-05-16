'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  createTip,
  listActiveTips,
  getTip,
  convertTipToDraft,
  discardTip,
  type StoredTip,
  type TipSourceType,
} from '@/lib/repository'

export function useTips(userId: string) {
  const [tips, setTips] = useState<StoredTip[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(async () => {
    if (!userId) return
    try {
      const list = await listActiveTips(userId)
      setTips(list)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh, refreshKey])

  const handleCreate = useCallback(async (content: string, sourceType?: TipSourceType): Promise<StoredTip | null> => {
    if (!userId) return null
    const tip = await createTip(userId, content, sourceType)
    if (tip) {
      setTips((prev) => [tip, ...prev])
    }
    return tip
  }, [userId])

  const handleGet = useCallback(async (tipId: number): Promise<StoredTip | null> => {
    if (!userId) return null
    return getTip(userId, tipId)
  }, [userId])

  const handleConvertToDraft = useCallback(async (tipId: number): Promise<{ tip: StoredTip | null; draftId: number | null }> => {
    if (!userId) return { tip: null, draftId: null }
    const result = await convertTipToDraft(userId, tipId)
    if (result.tip) {
      setTips((prev) => prev.filter((t) => t.id !== tipId))
    }
    return {
      tip: result.tip,
      draftId: result.draft?.id ?? null,
    }
  }, [userId])

  const handleDiscard = useCallback(async (tipId: number): Promise<boolean> => {
    if (!userId) return false
    const tip = await discardTip(userId, tipId)
    if (tip) {
      setTips((prev) => prev.filter((t) => t.id !== tipId))
      return true
    }
    return false
  }, [userId])

  const forceRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  return {
    tips,
    loading,
    createTip: handleCreate,
    getTip: handleGet,
    convertTipToDraft: handleConvertToDraft,
    discardTip: handleDiscard,
    refresh: forceRefresh,
  }
}
