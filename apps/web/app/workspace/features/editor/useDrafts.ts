'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  createDraft,
  listDrafts,
  getDraft,
  updateDraft,
  publishDraftToDocument,
  discardDraft,
  type StoredDraft,
} from '@/lib/repository'
import { emit } from '@/lib/events'

export function useDrafts(userId: string) {
  const [drafts, setDrafts] = useState<StoredDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(async () => {
    if (!userId) return
    try {
      const list = await listDrafts(userId)
      setDrafts(list)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh, refreshKey])

  const handleCreate = useCallback(async (title?: string, content?: string): Promise<StoredDraft | null> => {
    if (!userId) return null
    const draft = await createDraft(userId, title, content)
    if (draft) {
      setDrafts((prev) => [draft, ...prev])
      emit({ type: 'draft_created', draftId: draft.id })
    }
    return draft
  }, [userId])

  const handleUpdate = useCallback(async (draftId: number, updates: { title?: string; content?: string }): Promise<StoredDraft | null> => {
    if (!userId) return null
    const draft = await updateDraft(userId, draftId, updates)
    if (draft) {
      setDrafts((prev) => prev.map((d) => (d.id === draftId ? draft : d)))
      emit({ type: 'draft_updated', draftId })
    }
    return draft
  }, [userId])

  const handlePublish = useCallback(async (draftId: number): Promise<{ draft: StoredDraft | null; entryId: number | null }> => {
    if (!userId) return { draft: null, entryId: null }
    const result = await publishDraftToDocument(userId, draftId)
    if (result.draft) {
      setDrafts((prev) => prev.filter((d) => d.id !== draftId))
      emit({ type: 'draft_updated', draftId })
      emit({ type: 'archive_completed', dockItemId: 0, sourceType: 'text' })
    }
    return {
      draft: result.draft,
      entryId: result.entry?.id ?? null,
    }
  }, [userId])

  const handleDiscard = useCallback(async (draftId: number): Promise<boolean> => {
    if (!userId) return false
    const draft = await discardDraft(userId, draftId)
    if (draft) {
      setDrafts((prev) => prev.filter((d) => d.id !== draftId))
      emit({ type: 'draft_deleted', draftId })
      return true
    }
    return false
  }, [userId])

  const handleGet = useCallback(async (draftId: number): Promise<StoredDraft | null> => {
    if (!userId) return null
    return getDraft(userId, draftId)
  }, [userId])

  const forceRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  return {
    drafts,
    loading,
    createDraft: handleCreate,
    updateDraft: handleUpdate,
    publishDraft: handlePublish,
    discardDraft: handleDiscard,
    getDraft: handleGet,
    refresh: forceRefresh,
  }
}
