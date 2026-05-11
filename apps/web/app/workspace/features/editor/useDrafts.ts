'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  createDraft,
  listDrafts,
  getDraft,
  updateDraft,
  publishDraftToDocument,
  discardDraft,
  findActiveDraftBySourceEntryId,
  type StoredDraft,
  type DraftSourceType,
  type PublishMode,
  type DiscardMode,
} from '@/lib/repository'
import { emit } from '@/lib/events'
import { makeMindNodeId } from '@atlax/domain'

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

  const handleCreate = useCallback(async (
    title?: string,
    content?: string,
    sourceEntryId?: number | null,
    sourceType?: DraftSourceType | null,
  ): Promise<StoredDraft | null> => {
    if (!userId) return null
    const draft = await createDraft(userId, title, content, sourceEntryId, sourceType)
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

  const handlePublish = useCallback(async (draftId: number, publishMode: PublishMode = 'update_original'): Promise<{ draft: StoredDraft | null; entryId: number | null; nameConflict?: { hasConflict: boolean; conflictingParentIds: string[] }; emptyDraft?: boolean }> => {
    if (!userId) return { draft: null, entryId: null }
    const result = await publishDraftToDocument(userId, draftId, publishMode)
    if (result.emptyDraft) {
      return { draft: null, entryId: null, emptyDraft: true }
    }
    if (result.nameConflict) {
      return { draft: null, entryId: null, nameConflict: result.nameConflict }
    }
    if (result.draft) {
      setDrafts((prev) => prev.filter((d) => d.id !== draftId))
      emit({ type: 'draft_updated', draftId })
      emit({ type: 'archive_completed', dockItemId: 0, sourceType: 'text' })
      if (result.draft.sourceEntryId != null && publishMode === 'update_original') {
        emit({ type: 'mind_node_updated', nodeId: `entry-${result.draft.sourceEntryId}` })
      } else {
        const nodeId = makeMindNodeId(userId, 'document', result.draft.title || 'Untitled', result.entry?.id)
        emit({ type: 'mind_node_created', nodeId })
      }
    }
    return {
      draft: result.draft,
      entryId: result.entry?.id ?? null,
    }
  }, [userId])

  const handleDiscard = useCallback(async (draftId: number, discardMode: DiscardMode = 'abandon_changes'): Promise<boolean> => {
    if (!userId) return false
    const draft = await discardDraft(userId, draftId, discardMode)
    if (draft) {
      setDrafts((prev) => prev.filter((d) => d.id !== draftId))
      emit({ type: 'draft_deleted', draftId })
      if (!draft.sourceEntryId) {
        emit({ type: 'mind_node_deleted', nodeId: `draft-${draftId}` })
      }
      if (draft.sourceEntryId != null && discardMode === 'delete_all') {
        emit({ type: 'mind_node_deleted', nodeId: `entry-${draft.sourceEntryId}` })
      }
      return true
    }
    return false
  }, [userId])

  const handleGet = useCallback(async (draftId: number): Promise<StoredDraft | null> => {
    if (!userId) return null
    return getDraft(userId, draftId)
  }, [userId])

  const handleFindActiveBySourceEntry = useCallback(async (entryId: number): Promise<StoredDraft | null> => {
    if (!userId) return null
    return findActiveDraftBySourceEntryId(userId, entryId)
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
    findActiveBySourceEntry: handleFindActiveBySourceEntry,
    refresh: forceRefresh,
  }
}
