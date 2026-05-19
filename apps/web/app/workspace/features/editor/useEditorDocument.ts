'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getDraft,
  getEntryById,
  updateDraft,
  updateEditorDocument,
  type StoredDocument,
  type StoredDraft,
} from '@/lib/repository'
import { emit } from '@/lib/events'
import {
  createEditorContentPayload,
  createEmptyTiptapDoc,
  resolveInitialTiptapContent,
  type EditorContentPayload,
  type TiptapJSONContent,
} from '@/lib/editorContentAdapter'

export type EditorTarget = { kind: 'draft' | 'document'; id: number } | null
export type EditorSaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

interface UseEditorDocumentParams {
  userId: string
  target: EditorTarget
  debounceMs?: number
}

export function useEditorDocument({
  userId,
  target,
  debounceMs = 1500,
}: UseEditorDocumentParams) {
  const [title, setTitle] = useState('')
  const [contentJson, setContentJson] = useState<TiptapJSONContent>(createEmptyTiptapDoc())
  const [plainText, setPlainText] = useState('')
  const [html, setHtml] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [project, setProject] = useState<string | null>(null)
  const [collectionId, setCollectionId] = useState<string | null>(null)
  const [sourceType, setSourceType] = useState<string>('none')
  const [createdAt, setCreatedAt] = useState<Date | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [saveStatus, setSaveStatus] = useState<EditorSaveStatus>('idle')
  const [loaded, setLoaded] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const projectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef({ title: '', contentKey: JSON.stringify(createEmptyTiptapDoc()) })
  const targetKey = target ? `${target.kind}:${target.id}` : 'none'
  const latestRef = useRef({ userId, target, title, contentJson, plainText, html, markdown, tags, project })
  latestRef.current = { userId, target, title, contentJson, plainText, html, markdown, tags, project }

  const resetEmpty = useCallback(() => {
    setTitle('')
    setContentJson(createEmptyTiptapDoc())
    setPlainText('')
    setHtml('')
    setMarkdown('')
    setTags([])
    setProject(null)
    setCollectionId(null)
    setSourceType('none')
    setCreatedAt(null)
    setUpdatedAt(null)
    setLoaded(false)
    setSaveStatus('idle')
    lastSavedRef.current = { title: '', contentKey: JSON.stringify(createEmptyTiptapDoc()) }
  }, [])

  const resetForRecord = useCallback((record: StoredDraft | StoredDocument, kind: 'draft' | 'document') => {
    const initialContent = resolveInitialTiptapContent(record)
    const payload = createEditorContentPayload(initialContent, record.content)
    setTitle(record.title)
    setContentJson(payload.contentJson)
    setPlainText(payload.plainText)
    setHtml(record.html ?? payload.html)
    setMarkdown(record.markdown ?? payload.markdown)
    setTags(record.tags ?? [])
    setProject(record.project ?? null)
    setCollectionId(kind === 'draft' ? (record as StoredDraft).collectionId ?? null : null)
    setSourceType(kind === 'draft' ? ((record as StoredDraft).sourceType ?? 'draft') : ((record as StoredDocument).type ?? 'document'))
    setCreatedAt(record.createdAt ? new Date(record.createdAt) : null)
    setUpdatedAt(kind === 'draft' ? new Date((record as StoredDraft).updatedAt) : new Date((record as StoredDocument).archivedAt ?? record.createdAt))
    lastSavedRef.current = { title: record.title, contentKey: JSON.stringify(payload.contentJson) }
    setSaveStatus('saved')
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!userId || !target) {
      resetEmpty()
      return
    }

    resetEmpty()
    let cancelled = false
    const load = target.kind === 'draft'
      ? getDraft(userId, target.id)
      : getEntryById(userId, target.id)

    load.then((record) => {
      if (cancelled) return
      if (record) {
        resetForRecord(record, target.kind)
      } else {
        setLoaded(true)
      }
    }).catch(() => {
      if (!cancelled) setLoaded(true)
    })

    return () => { cancelled = true }
  }, [userId, targetKey, resetEmpty, resetForRecord])

  const persist = useCallback(async (
    uid: string,
    nextTarget: NonNullable<EditorTarget>,
    nextTitle: string,
    payload: EditorContentPayload,
    nextTags: string[],
    nextProject: string | null,
  ) => {
    setSaveStatus('saving')
    try {
      if (nextTarget.kind === 'draft') {
        await updateDraft(uid, nextTarget.id, {
          title: nextTitle,
          content: payload.content,
          contentJson: payload.contentJson,
          plainText: payload.plainText,
          html: payload.html,
          markdown: payload.markdown,
          tags: nextTags,
          project: nextProject,
        })
        emit({ type: 'draft_updated', draftId: nextTarget.id })
      } else {
        await updateEditorDocument(uid, nextTarget.id, {
          title: nextTitle,
          content: payload.content,
          contentJson: payload.contentJson,
          plainText: payload.plainText,
          html: payload.html,
          markdown: payload.markdown,
          tags: nextTags,
          project: nextProject,
        })
        emit({ type: 'document_updated', documentId: nextTarget.id } as any)
      }
      lastSavedRef.current = { title: nextTitle, contentKey: JSON.stringify(payload.contentJson) }
      setUpdatedAt(new Date())
      setSaveStatus('saved')
    } catch (err) {
      console.error('[EditorDocument Autosave] Failed:', err)
      setSaveStatus('failed')
    }
  }, [])

  const scheduleSave = useCallback((delay = debounceMs) => {
    if (!target) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      const latest = latestRef.current
      if (!latest.userId || !latest.target) return
      if (latest.target.kind === 'draft') {
        const tBlank = !latest.title.trim() || latest.title === 'Untitled'
        const cBlank = !latest.plainText.trim() && !latest.markdown.trim()
        if (tBlank && cBlank) {
          setSaveStatus('saved')
          return
        }
      }
      const payload = createEditorContentPayload(latest.contentJson, latest.plainText || latest.markdown)
      persist(latest.userId, latest.target, latest.title, payload, latest.tags, latest.project)
    }, delay)
  }, [debounceMs, persist, target])

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle)
    setSaveStatus('idle')
    scheduleSave()
  }, [scheduleSave])

  const handleContentChange = useCallback((payload: EditorContentPayload) => {
    setContentJson(payload.contentJson)
    setPlainText(payload.plainText)
    setHtml(payload.html)
    setMarkdown(payload.markdown)
    setSaveStatus('idle')
    scheduleSave()
  }, [scheduleSave])

  const flushSave = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (projectTimerRef.current) {
      clearTimeout(projectTimerRef.current)
      projectTimerRef.current = null
    }
    const latest = latestRef.current
    if (!latest.userId || !latest.target) return
    if (latest.target.kind === 'draft') {
      const tBlank = !latest.title.trim() || latest.title === 'Untitled'
      const cBlank = !latest.plainText.trim() && !latest.markdown.trim()
      if (tBlank && cBlank) return
    }
    const contentKey = JSON.stringify(latest.contentJson)
    const changed = latest.title !== lastSavedRef.current.title || contentKey !== lastSavedRef.current.contentKey
    if (!changed) return
    const payload = createEditorContentPayload(latest.contentJson, latest.plainText || latest.markdown)
    await persist(latest.userId, latest.target, latest.title, payload, latest.tags, latest.project)
  }, [persist])

  const handleTagsChange = useCallback((newTags: string[]) => {
    setTags(newTags)
    setSaveStatus('idle')
    scheduleSave(250)
  }, [scheduleSave])

  const handleProjectChange = useCallback((newProject: string | null) => {
    setProject(newProject)
    setSaveStatus('idle')
    scheduleSave(250)
  }, [scheduleSave])

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
    sourceType,
    createdAt,
    updatedAt,
    saveStatus,
    loaded,
    handleTitleChange,
    handleContentChange,
    handleTagsChange,
    handleProjectChange,
    flushSave,
    resetForRecord,
  }
}
