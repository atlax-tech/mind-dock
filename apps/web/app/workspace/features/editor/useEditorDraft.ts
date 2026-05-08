'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { updateDraft, getDraft, type StoredDraft } from '@/lib/repository'

export type EditorSaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

interface UseEditorDraftParams {
  userId: string
  draftId: number | null
  enabled: boolean
  debounceMs?: number
}

export function useEditorDraft({
  userId,
  draftId,
  enabled,
  debounceMs = 1500,
}: UseEditorDraftParams) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saveStatus, setSaveStatus] = useState<EditorSaveStatus>('idle')
  const [loaded, setLoaded] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef({ title: '', content: '' })
  const latestRef = useRef({ userId, draftId, title, content, enabled })
  latestRef.current = { userId, draftId, title, content, enabled }

  useEffect(() => {
    if (!userId || draftId == null) {
      setTitle('')
      setContent('')
      setLoaded(false)
      setSaveStatus('idle')
      lastSavedRef.current = { title: '', content: '' }
      return
    }

    let cancelled = false
    getDraft(userId, draftId).then((draft) => {
      if (cancelled) return
      if (draft) {
        setTitle(draft.title)
        setContent(draft.content)
        lastSavedRef.current = { title: draft.title, content: draft.content }
      }
      setLoaded(true)
    })

    return () => {
      cancelled = true
    }
  }, [userId, draftId])

  const performSave = useCallback(async (
    uid: string,
    did: number,
    t: string,
    c: string,
  ) => {
    setSaveStatus('saving')
    try {
      await updateDraft(uid, did, { title: t, content: c })
      lastSavedRef.current = { title: t, content: c }
      setSaveStatus('saved')
    } catch (err) {
      console.error('[EditorDraft Autosave] Failed:', err)
      setSaveStatus('failed')
    }
  }, [])

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle)
  }, [])

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent)
  }, [])

  useEffect(() => {
    if (!enabled || !userId || draftId == null) return

    if (
      title === lastSavedRef.current.title &&
      content === lastSavedRef.current.content
    ) return

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null
      const { userId: uid, draftId: did, title: t, content: c } = latestRef.current
      if (!uid || did == null) return
      performSave(uid, did, t, c)
    }, debounceMs)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [enabled, userId, draftId, title, content, debounceMs, performSave])

  const flushSave = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const { userId: uid, draftId: did, title: t, content: c, enabled: en } = latestRef.current
    if (!en || !uid || did == null) return
    if (t === lastSavedRef.current.title && c === lastSavedRef.current.content) return
    await performSave(uid, did, t, c)
  }, [performSave])

  const resetForDraft = useCallback((draft: StoredDraft) => {
    setTitle(draft.title)
    setContent(draft.content)
    lastSavedRef.current = { title: draft.title, content: draft.content }
    setSaveStatus('idle')
    setLoaded(true)
  }, [])

  return {
    title,
    content,
    saveStatus,
    loaded,
    handleTitleChange,
    handleContentChange,
    flushSave,
    resetForDraft,
  }
}
