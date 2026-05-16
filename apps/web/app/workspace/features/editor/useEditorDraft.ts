'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { updateDraft, getDraft, type StoredDraft } from '@/lib/repository'
import { emit } from '@/lib/events'
import {
  createEditorContentPayload,
  createEmptyTiptapDoc,
  resolveInitialTiptapContent,
  type EditorContentPayload,
  type TiptapJSONContent,
} from '@/lib/editorContentAdapter'

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
  const [contentJson, setContentJson] = useState<TiptapJSONContent>(createEmptyTiptapDoc())
  const [plainText, setPlainText] = useState('')
  const [html, setHtml] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [project, setProject] = useState<string | null>(null)
  const [collectionId, setCollectionId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<EditorSaveStatus>('idle')
  const [loaded, setLoaded] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const projectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef({ title: '', contentKey: JSON.stringify(createEmptyTiptapDoc()) })
  const latestRef = useRef({ userId, draftId, title, contentJson, plainText, html, markdown, project, enabled })
  latestRef.current = { userId, draftId, title, contentJson, plainText, html, markdown, project, enabled }

  useEffect(() => {
    if (!userId || draftId == null) {
      setTitle('')
      setContentJson(createEmptyTiptapDoc())
      setPlainText('')
      setHtml('')
      setMarkdown('')
      setTags([])
      setProject(null)
      setCollectionId(null)
      setLoaded(false)
      setSaveStatus('idle')
      lastSavedRef.current = { title: '', contentKey: JSON.stringify(createEmptyTiptapDoc()) }
      return
    }

    setTitle('')
    setContentJson(createEmptyTiptapDoc())
    setPlainText('')
    setHtml('')
    setMarkdown('')
    setTags([])
    setProject(null)
    setCollectionId(null)
    setLoaded(false)
    setSaveStatus('idle')
    lastSavedRef.current = { title: '', contentKey: JSON.stringify(createEmptyTiptapDoc()) }

    let cancelled = false
    getDraft(userId, draftId).then((draft) => {
      if (cancelled) return
      if (draft) {
        const initialContent = resolveInitialTiptapContent(draft)
        const payload = createEditorContentPayload(initialContent, draft.content)
        setTitle(draft.title)
        setContentJson(payload.contentJson)
        setPlainText(payload.plainText)
        setHtml(draft.html ?? payload.html)
        setMarkdown(draft.markdown ?? payload.markdown)
        setTags(draft.tags ?? [])
        setProject(draft.project ?? null)
        setCollectionId(draft.collectionId ?? null)
        lastSavedRef.current = { title: draft.title, contentKey: JSON.stringify(payload.contentJson) }
        setSaveStatus('saved')
      }
      setLoaded(true)
    }).catch(() => {
      if (cancelled) return
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
    payload: EditorContentPayload,
  ) => {
    setSaveStatus('saving')
    try {
      await updateDraft(uid, did, {
        title: t,
        content: payload.content,
        contentJson: payload.contentJson,
        plainText: payload.plainText,
        html: payload.html,
        markdown: payload.markdown,
      })
      lastSavedRef.current = { title: t, contentKey: JSON.stringify(payload.contentJson) }
      setSaveStatus('saved')
      emit({ type: 'draft_updated', draftId: did })
    } catch (err) {
      console.error('[EditorDraft Autosave] Failed:', err)
      setSaveStatus('failed')
    }
  }, [])

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle)
    setSaveStatus('idle')
  }, [])

  const handleContentChange = useCallback((payload: EditorContentPayload) => {
    setContentJson(payload.contentJson)
    setPlainText(payload.plainText)
    setHtml(payload.html)
    setMarkdown(payload.markdown)
    setSaveStatus('idle')
  }, [])

  useEffect(() => {
    if (!enabled || !userId || draftId == null) return

    const contentKey = JSON.stringify(contentJson)
    if (
      title === lastSavedRef.current.title &&
      contentKey === lastSavedRef.current.contentKey
    ) return

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null
      const { userId: uid, draftId: did, title: t, contentJson: json, plainText: text, html: nextHtml, markdown: nextMarkdown } = latestRef.current
      if (!uid || did == null) return
      performSave(uid, did, t, {
        contentJson: json,
        plainText: text,
        html: nextHtml,
        markdown: nextMarkdown,
        content: text || nextMarkdown,
      })
    }, debounceMs)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [enabled, userId, draftId, title, contentJson, debounceMs, performSave])

  const flushSave = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const hasPendingProjectSave = projectTimerRef.current !== null
    const pendingProjectValue = latestRef.current.project
    if (projectTimerRef.current) {
      clearTimeout(projectTimerRef.current)
      projectTimerRef.current = null
    }
    const { userId: uid, draftId: did, title: t, contentJson: json, plainText: text, html: nextHtml, markdown: nextMarkdown, enabled: en } = latestRef.current
    if (!en || !uid || did == null) return
    const contentChanged = t !== lastSavedRef.current.title || JSON.stringify(json) !== lastSavedRef.current.contentKey
    const saves: Promise<void>[] = []
    if (contentChanged) {
      saves.push(performSave(uid, did, t, {
        contentJson: json,
        plainText: text,
        html: nextHtml,
        markdown: nextMarkdown,
        content: text || nextMarkdown,
      }))
    }
    if (hasPendingProjectSave) {
      saves.push(updateDraft(uid, did, { project: pendingProjectValue }).then(() => {
        emit({ type: 'draft_updated', draftId: did })
      }).catch((err) => {
        console.error('[EditorDraft Project Flush] Failed:', err)
      }))
    }
    if (saves.length > 0) {
      await Promise.all(saves)
    }
  }, [performSave])

  const handleTagsChange = useCallback((newTags: string[]) => {
    setTags(newTags)
    if (enabled && userId && draftId != null) {
      updateDraft(userId, draftId, { tags: newTags }).then(() => {
        emit({ type: 'draft_updated', draftId })
      }).catch((err) => {
        console.error('[EditorDraft Tags Save] Failed:', err)
      })
    }
  }, [enabled, userId, draftId])

  const handleProjectChange = useCallback((newProject: string | null) => {
    setProject(newProject)
    if (!enabled || !userId || draftId == null) return
    if (projectTimerRef.current) {
      clearTimeout(projectTimerRef.current)
    }
    projectTimerRef.current = setTimeout(() => {
      projectTimerRef.current = null
      if (!userId || draftId == null) return
      updateDraft(userId, draftId, { project: newProject }).then(() => {
        emit({ type: 'draft_updated', draftId })
      }).catch((err) => {
        console.error('[EditorDraft Project Save] Failed:', err)
      })
    }, debounceMs)
  }, [enabled, userId, draftId, debounceMs])

  const handleCollectionChange = useCallback((newCollectionId: string | null) => {
    setCollectionId(newCollectionId)
    if (enabled && userId && draftId != null) {
      updateDraft(userId, draftId, { collectionId: newCollectionId }).then(() => {
        emit({ type: 'draft_updated', draftId })
      }).catch((err) => {
        console.error('[EditorDraft Collection Save] Failed:', err)
      })
    }
  }, [enabled, userId, draftId])

  const resetForDraft = useCallback((draft: StoredDraft) => {
    const initialContent = resolveInitialTiptapContent(draft)
    const payload = createEditorContentPayload(initialContent, draft.content)
    setTitle(draft.title)
    setContentJson(payload.contentJson)
    setPlainText(payload.plainText)
    setHtml(draft.html ?? payload.html)
    setMarkdown(draft.markdown ?? payload.markdown)
    setTags(draft.tags ?? [])
    setProject(draft.project ?? null)
    setCollectionId(draft.collectionId ?? null)
    lastSavedRef.current = { title: draft.title, contentKey: JSON.stringify(payload.contentJson) }
    setSaveStatus('saved')
    setLoaded(true)
  }, [])

  return {
    title,
    content: plainText || markdown,
    contentJson,
    plainText,
    html,
    markdown,
    tags,
    project,
    collectionId,
    saveStatus,
    loaded,
    handleTitleChange,
    handleContentChange,
    handleTagsChange,
    handleProjectChange,
    handleCollectionChange,
    flushSave,
    resetForDraft,
  }
}
