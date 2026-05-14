'use client'

import React, { useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import {
  PenTool,
  Plus,
  FileText,
  Trash2,
  Send,
  Clock,
  PanelLeft,
  PanelRight,
  TerminalSquare,
  SlidersHorizontal,
  Globe,
  Mic,
  Calendar,
  Sparkles,
  Check,
  Loader2,
  AlertCircle,
  Copy,
  RefreshCw,
  Undo2,
  X,
  MoreHorizontal,
  Type,
  Maximize2,
  Columns3,
} from 'lucide-react'
import { useDrafts } from './useDrafts'
import { useEditorDraft } from './useEditorDraft'
import type { StoredDraft, PublishMode, DiscardMode } from '@/lib/repository'
import type { EditorContentPayload } from '@/lib/editorContentAdapter'
import type { EditorOutlineItem, EditorWidthMode } from './TiptapEditor'
import { entriesTable } from '@/lib/db'

const TiptapEditor = dynamic(
  () => import('./TiptapEditor').then((mod) => mod.TiptapEditor),
  { ssr: false }
)

const WIDTH_LABELS: Record<EditorWidthMode, string> = {
  compact: 'Compact',
  comfortable: 'Comfortable',
  wide: 'Wide',
}

const EDITOR_SURFACE_WIDTH: Record<EditorWidthMode, string> = {
  compact: 'max-w-[640px]',
  comfortable: 'max-w-[720px]',
  wide: 'max-w-[860px]',
}

interface DraftEditorViewProps {
  userId: string
  showSourcePacket: boolean
  showInspector: boolean
  onToggleSourcePacket: () => void
  onToggleInspector: () => void
  onToast?: (msg: string) => void
  initialDraftId?: number | null
  initialEntryId?: number | null
  onInitialDraftConsumed?: () => void
  onInitialEntryConsumed?: () => void
  onActiveDraftMetaChange?: (meta: { id: number | null; title: string; status: string }) => void
}

export default function DraftEditorView({
  userId,
  showSourcePacket,
  showInspector,
  onToggleSourcePacket,
  onToggleInspector,
  onToast,
  initialDraftId,
  initialEntryId,
  onInitialDraftConsumed,
  onInitialEntryConsumed,
  onActiveDraftMetaChange,
}: DraftEditorViewProps) {
  const toolbarPortalTargetId = 'editor-dock-toolbar-slot'
  const {
    drafts,
    loading: draftsLoading,
    createDraft: handleCreateDraft,
    publishDraft: handlePublishDraft,
    discardDraft: handleDiscardDraft,
    findActiveBySourceEntry,
    patchDraftLocal,
  } = useDrafts(userId)

  const [activeDraftId, setActiveDraftId] = useState<number | null>(null)
  const [showDraftsList, setShowDraftsList] = useState(true)
  const [showFormatMenu, setShowFormatMenu] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [widthMode, setWidthMode] = useState<EditorWidthMode>('comfortable')
  const [outline, setOutline] = useState<EditorOutlineItem[]>([])
  const [publishing, setPublishing] = useState(false)
  const [discarding, setDiscarding] = useState<number | null>(null)
  const [showPublishChoice, setShowPublishChoice] = useState(false)
  const [showDiscardChoice, setShowDiscardChoice] = useState(false)
  const [discardTargetId, setDiscardTargetId] = useState<number | null>(null)

  const {
    title,
    content,
    contentJson,
    tags,
    project,
    saveStatus,
    loaded,
    handleTitleChange,
    handleContentChange,
    handleTagsChange,
    handleProjectChange,
    flushSave,
    resetForDraft,
  } = useEditorDraft({
    userId,
    draftId: activeDraftId,
    enabled: activeDraftId != null,
  })

  useEffect(() => {
    const savedWidth = window.localStorage.getItem('atlax_editor_width_mode')
    if (savedWidth === 'compact' || savedWidth === 'comfortable' || savedWidth === 'wide') {
      setWidthMode(savedWidth)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('atlax_editor_width_mode', widthMode)
  }, [widthMode])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setFocusMode((v) => !v)
        setShowFormatMenu(false)
        setShowMoreMenu(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleLocalTitleChange = useCallback((newTitle: string) => {
    handleTitleChange(newTitle)
    if (activeDraftId != null) {
      patchDraftLocal(activeDraftId, { title: newTitle })
    }
  }, [activeDraftId, handleTitleChange, patchDraftLocal])

  const handleLocalContentChange = useCallback((payload: EditorContentPayload) => {
    handleContentChange(payload)
    if (activeDraftId != null) {
      patchDraftLocal(activeDraftId, {
        content: payload.content,
        plainText: payload.plainText,
        html: payload.html,
        markdown: payload.markdown,
        contentJson: payload.contentJson,
      })
    }
  }, [activeDraftId, handleContentChange, patchDraftLocal])

  const onCreateNewDraft = useCallback(async () => {
    if (showSourcePacket) onToggleSourcePacket()
    if (showInspector) onToggleInspector()
    const draft = await handleCreateDraft('Untitled', '')
    if (draft) {
      setActiveDraftId(draft.id)
      resetForDraft(draft)
      setShowFormatMenu(false)
      setShowMoreMenu(false)
      onToast?.('新草稿已创建')
    }
  }, [handleCreateDraft, resetForDraft, onToast, showSourcePacket, showInspector, onToggleSourcePacket, onToggleInspector])

  const onSelectDraft = useCallback((draft: StoredDraft) => {
    setActiveDraftId(draft.id)
    resetForDraft(draft)
    setShowFormatMenu(false)
    setShowMoreMenu(false)
  }, [resetForDraft])

  useEffect(() => {
    if (initialDraftId != null && initialDraftId !== activeDraftId) {
      setActiveDraftId(initialDraftId)
      const draft = drafts.find((d) => d.id === initialDraftId)
      if (draft) {
        resetForDraft(draft)
      }
      onInitialDraftConsumed?.()
    }
  }, [initialDraftId, activeDraftId, onInitialDraftConsumed, drafts, resetForDraft])

  useEffect(() => {
    if (initialEntryId == null) return
    let cancelled = false
    ;(async () => {
      const existingDraft = await findActiveBySourceEntry(initialEntryId)
      if (cancelled) return
      if (existingDraft) {
        setActiveDraftId(existingDraft.id)
        resetForDraft(existingDraft)
        onInitialEntryConsumed?.()
        onToast?.('已打开关联此文档的草稿')
        return
      }
      const entry = await entriesTable.get(initialEntryId)
      if (cancelled) return
      if (!entry) {
        onToast?.('无法打开 Editor：文档不存在或已被删除')
        onInitialEntryConsumed?.()
        return
      }
      const draft = await handleCreateDraft(
        entry.title || 'Untitled',
        entry.content || '',
        initialEntryId,
        'entry',
        entry.tags ?? [],
        entry.project ?? null,
        null,
        {
          contentJson: entry.contentJson ?? null,
          plainText: entry.plainText ?? entry.content ?? '',
          html: entry.html,
          markdown: entry.markdown ?? entry.content ?? '',
        },
      )
      if (cancelled) return
      if (!draft) {
        onToast?.('无法打开 Editor：草稿创建失败')
        onInitialEntryConsumed?.()
        return
      }
      setActiveDraftId(draft.id)
      resetForDraft(draft)
      onInitialEntryConsumed?.()
      onToast?.('已从归档文档创建草稿')
    })()
    return () => { cancelled = true }
  }, [initialEntryId, handleCreateDraft, resetForDraft, onToast, findActiveBySourceEntry, onInitialEntryConsumed])

  const executePublish = useCallback(async (draftId: number, publishMode: PublishMode) => {
    setPublishing(true)
    setShowPublishChoice(false)
    try {
      await flushSave()
      const result = await handlePublishDraft(draftId, publishMode)
      if (result.emptyDraft) {
        onToast?.('空草稿不能发布，请先编写内容')
        return
      }
      if (result.nameConflict) {
        onToast?.('同名文档已存在于当前层级，请修改标题后重试')
        return
      }
      if (result.draft && result.entryId) {
        setActiveDraftId(null)
        if (publishMode === 'update_original' && result.draft.sourceEntryId != null) {
          onToast?.(`已更新原文档 (ID: ${result.draft.sourceEntryId})`)
        } else {
          onToast?.(`已发布为新文档 (ID: ${result.entryId})`)
        }
      } else {
        onToast?.('发布失败')
      }
    } finally {
      setPublishing(false)
    }
  }, [flushSave, handlePublishDraft, onToast])

  const onPublish = useCallback(async () => {
    if (!activeDraftId) return
    const activeDraft = drafts.find((d) => d.id === activeDraftId)
    if (activeDraft?.sourceEntryId != null) {
      setShowPublishChoice(true)
      return
    }
    await executePublish(activeDraftId, 'update_original')
  }, [activeDraftId, drafts, executePublish])

  const executeDiscard = useCallback(async (draftId: number, discardMode: DiscardMode) => {
    setDiscarding(draftId)
    setShowDiscardChoice(false)
    try {
      const ok = await handleDiscardDraft(draftId, discardMode)
      if (ok) {
        if (activeDraftId === draftId) {
          setActiveDraftId(null)
        }
        if (discardMode === 'abandon_changes') {
          onToast?.('已放弃更改')
        } else {
          onToast?.('已删除草稿及原文档')
        }
      }
    } finally {
      setDiscarding(null)
    }
  }, [activeDraftId, handleDiscardDraft, onToast])

  const onDiscard = useCallback(async (draftId: number) => {
    const targetDraft = drafts.find((d) => d.id === draftId)
    if (targetDraft?.sourceEntryId != null) {
      setDiscardTargetId(draftId)
      setShowDiscardChoice(true)
      return
    }
    await executeDiscard(draftId, 'abandon_changes')
  }, [drafts, executeDiscard])

  const activeDraft = drafts.find((d) => d.id === activeDraftId)
  const displayTitle = normalizeTitle(loaded ? title : activeDraft?.title)
  const sourceCreatedAt = activeDraft ? formatTime(activeDraft.createdAt) : ''

  useEffect(() => {
    onActiveDraftMetaChange?.({
      id: activeDraftId,
      title: displayTitle,
      status: activeDraftId == null ? 'idle' : 'active',
    })
  }, [activeDraftId, displayTitle, onActiveDraftMetaChange])

  const saveStatusLabel = (): string => {
    switch (saveStatus) {
      case 'saving': return 'Saving...'
      case 'saved': return 'Local · Saved'
      case 'failed': return 'Save failed'
      default: return activeDraftId == null ? '' : 'Unsaved'
    }
  }

  const saveStatusIcon = () => {
    switch (saveStatus) {
      case 'saving': return <Loader2 size={11} className="animate-spin text-slate-400" />
      case 'saved': return <Check size={11} className="text-emerald-400" />
      case 'failed': return <AlertCircle size={11} className="text-red-400" />
      default: return null
    }
  }

  function formatTime(date: Date) {
    const d = new Date(date)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return '刚刚'
    if (diffMin < 60) return `${diffMin}分钟前`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}小时前`
    return d.toLocaleDateString('zh-CN')
  }

  return (
    <div className={`w-full h-full flex gap-0 animate-in fade-in duration-500 overflow-hidden text-sm ${focusMode ? 'bg-[#090d0f]' : ''}`} data-focus-mode={focusMode ? 'true' : 'false'}>

      {/* 左侧：Drafts 列表 */}
      {showDraftsList && !focusMode && (
        <div className="w-[240px] flex flex-col shrink-0 border-r border-white/[0.045] bg-[#0d1215]/80">
          <div className="flex items-center justify-between px-3 py-3 border-b border-white/[0.07]">
            <div className="flex items-center gap-2 text-white font-medium text-xs">
              <PenTool className="w-3.5 h-3.5" /> Drafts
            </div>
            <button
              onClick={onCreateNewDraft}
              className="p-1 rounded-md hover:bg-white/10 text-[#899298] hover:text-white transition-colors"
              title="新建草稿"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
            {draftsLoading ? (
              <div className="px-3 py-6 text-center text-[10px] text-[#899298]">Loading...</div>
            ) : drafts.length === 0 ? (
              <div className="px-3 py-6 text-center text-[10px] text-[#899298]">
                暂无草稿<br />
                <span className="text-[9px]">点击 + 创建新草稿</span>
              </div>
            ) : (
              drafts.map((draft) => (
                <div
                  key={draft.id}
                  onClick={() => onSelectDraft(draft)}
                  className={`group px-3 py-2.5 cursor-pointer transition-colors border-l-2 ${
                    activeDraftId === draft.id
                      ? 'bg-white/[0.04] border-l-[#86d7ff]/70'
                      : 'border-l-transparent hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-white truncate leading-tight">
                        {normalizeTitle(draft.title)}
                      </div>
                      <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-[#899298]/80">
                        {draftExcerpt(draft)}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Clock className="w-2.5 h-2.5 text-[#899298]" />
                        <span className="text-[9px] text-[#899298]">{formatTime(draft.updatedAt)}</span>
                        <span className="text-[9px] text-[#59646b]">·</span>
                        <span className="text-[9px] text-[#899298]">{draftWordCount(draft)} 字</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDiscard(draft.id)
                      }}
                      disabled={discarding === draft.id}
                      className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 text-[#899298] hover:text-red-400 transition-all shrink-0"
                      title="丢弃草稿"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="px-3 py-2 border-t border-white/[0.07]">
            <button
              onClick={onCreateNewDraft}
              className="w-full py-1.5 rounded-lg bg-white/5 border border-white/[0.07] text-[10px] text-[#899298] hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3 h-3" /> 新建草稿
            </button>
          </div>
        </div>
      )}

      {/* 左侧：源数据包 (Source Packet) - 保持 Golden UI */}
      {showSourcePacket && activeDraftId != null && !focusMode && (
        <div className="w-[260px] flex flex-col shrink-0 overflow-y-auto custom-scrollbar pb-10 border-r border-white/[0.07]">
          <div className="flex justify-between items-center mb-2 px-4 pt-4">
            <div className="flex items-center gap-2 text-white font-medium text-sm">
              <TerminalSquare className="w-4 h-4" /> 源数据包
            </div>
            <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[9px] text-[#899298] font-medium tracking-wider">0 个项目</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#899298] text-[11px] mb-5 px-4">
            <Globe className="w-3 h-3" /> 源自 <span className="text-white">Editor Draft</span>
          </div>
          <div className="px-4">
            <div className="p-3.5 flex flex-col gap-2.5 bg-[#1c2023]/40 backdrop-blur-[20px] border-[0.5px] border-white/5 rounded-[16px]">
              <div className="absolute left-0 top-0 w-1 h-full bg-[#9cf4d4]/80"></div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5 text-[#9cf4d4] text-[11px] font-medium">
                  <Mic className="w-3 h-3" /> 草稿来源
                </div>
              </div>
              <p className="text-[#899298] text-[11px] leading-relaxed">
                此草稿由 Editor 直接创建，暂无关联的源数据包。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 中间：编辑器主体 (Main Canvas) */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部工具栏 */}
        <div className={`relative h-[38px] bg-[#0d1215]/85 border-b border-white/[0.05] flex items-center px-4 gap-2 shrink-0 ${focusMode ? 'justify-end bg-transparent border-transparent' : ''}`}>
          {!focusMode && (
            <button
              onClick={() => setShowDraftsList((v) => !v)}
              className={`p-1.5 rounded hover:bg-white/10 transition-colors ${showDraftsList ? 'text-white' : 'text-[#899298] hover:text-white'}`}
              title="切换草稿列表"
            >
              <PanelLeft className="w-3.5 h-3.5" />
            </button>
          )}

          {activeDraftId != null && (
            <>
              {!focusMode && <div className="w-px h-4 bg-white/[0.07] mx-1" />}
              {!focusMode && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#86d7ff]/8 text-[#86d7ff]/80 uppercase font-semibold">草稿</span>}
              <div
                id={toolbarPortalTargetId}
                className={`absolute left-12 top-[42px] z-40 h-8 min-w-[340px] rounded-lg border border-white/[0.08] bg-[#151a1e]/95 px-1 shadow-2xl backdrop-blur-xl transition-all ${
                  showFormatMenu && !focusMode
                    ? 'pointer-events-auto translate-y-0 opacity-100'
                    : 'pointer-events-none -translate-y-1 opacity-0'
                }`}
              />
              <div className="ml-auto flex items-center gap-2 shrink-0">
                <span className="flex items-center gap-1.5 text-[11px] text-[#899298]/75">
                  {saveStatusIcon()}
                  {saveStatusLabel()}
                </span>
                {!focusMode && (
                  <button
                    type="button"
                    onClick={() => setShowFormatMenu((v) => !v)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] transition-colors ${showFormatMenu ? 'bg-white/10 text-white' : 'text-[#899298] hover:bg-white/[0.08] hover:text-white'}`}
                    title="格式工具"
                  >
                    <Type className="w-3.5 h-3.5" /> 格式
                  </button>
                )}
                <button
                  onClick={onPublish}
                  disabled={publishing || !activeDraftId}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#86d7ff]/8 text-[#86d7ff]/85 text-[11px] font-medium hover:bg-[#86d7ff]/16 hover:text-[#86d7ff] transition-colors disabled:opacity-40"
                  title="发布为正式文档"
                >
                  <Send className="w-3 h-3" /> {publishing ? '发布中...' : '发布'}
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowMoreMenu((v) => !v)}
                    className={`p-1.5 rounded-md transition-colors ${showMoreMenu ? 'bg-white/10 text-white' : 'text-[#899298] hover:bg-white/10 hover:text-white'}`}
                    title="更多"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                  {showMoreMenu && (
                    <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-white/10 bg-[#1c2023]/95 p-1.5 shadow-2xl backdrop-blur-xl">
                      <button
                        type="button"
                        onClick={() => { setFocusMode((v) => !v); setShowMoreMenu(false); setShowFormatMenu(false) }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-[#d8dde2] hover:bg-white/[0.07]"
                      >
                        <Maximize2 className="w-3.5 h-3.5 text-[#899298]" /> {focusMode ? '退出 Focus Mode' : 'Focus Mode'}
                      </button>
                      <div className="my-1 h-px bg-white/[0.07]" />
                      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase text-[#899298]">正文宽度</div>
                      {(Object.keys(WIDTH_LABELS) as EditorWidthMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setWidthMode(mode)}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-[12px] hover:bg-white/[0.07] ${widthMode === mode ? 'text-[#86d7ff]' : 'text-[#d8dde2]'}`}
                        >
                          <span className="flex items-center gap-2"><Columns3 className="w-3.5 h-3.5 text-[#899298]" /> {WIDTH_LABELS[mode]}</span>
                          {widthMode === mode && <Check className="w-3 h-3" />}
                        </button>
                      ))}
                      <div className="my-1 h-px bg-white/[0.07]" />
                      <button
                        type="button"
                        onClick={() => { onToggleSourcePacket(); setShowMoreMenu(false) }}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[12px] text-[#d8dde2] hover:bg-white/[0.07]"
                      >
                        <span className="flex items-center gap-2"><PanelLeft className="w-3.5 h-3.5 text-[#899298]" /> 源数据包</span>
                        <span className="text-[10px] text-[#899298]">{showSourcePacket ? '隐藏' : '显示'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { onToggleInspector(); setShowMoreMenu(false) }}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[12px] text-[#d8dde2] hover:bg-white/[0.07]"
                      >
                        <span className="flex items-center gap-2"><PanelRight className="w-3.5 h-3.5 text-[#899298]" /> 检查器</span>
                        <span className="text-[10px] text-[#899298]">{showInspector ? '隐藏' : '显示'}</span>
                      </button>
                      <div className="my-1 h-px bg-white/[0.07]" />
                      <button
                        type="button"
                        onClick={() => { if (activeDraftId) onDiscard(activeDraftId); setShowMoreMenu(false) }}
                        disabled={!activeDraftId}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> 丢弃草稿
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeDraftId == null && !focusMode && (
            <>
              <div className="flex-1" />
              <button
                onClick={onToggleSourcePacket}
                className="p-1.5 rounded hover:bg-white/10 text-[#899298] hover:text-white transition-colors"
                title="源数据包"
              >
                <PanelLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onToggleInspector}
                className="p-1.5 rounded hover:bg-white/10 text-[#899298] hover:text-white transition-colors"
                title="检查器"
              >
                <PanelRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>

        {/* 编辑区域 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {activeDraftId == null ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <PenTool size={32} className="opacity-15 mb-4" />
              <p className="text-sm text-slate-500 mb-4">选择一个草稿开始编辑，或创建新草稿</p>
              <button
                onClick={onCreateNewDraft}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/[0.07] text-[12px] text-white hover:bg-white/10 transition-colors"
              >
                <Plus className="w-4 h-4" /> 新建草稿
              </button>
            </div>
          ) : !loaded ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
            </div>
          ) : (
            <div className={`${EDITOR_SURFACE_WIDTH[widthMode]} relative w-full mx-auto px-8 pb-20 pt-8`}>
              <div className="pointer-events-none absolute inset-x-2 top-0 h-[520px] rounded-[32px] bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.035),rgba(255,255,255,0.012)_42%,transparent_76%)]" />
              <div className="relative">
              <div className="flex items-center gap-2.5 text-[11px] text-[#899298] mb-4">
                <span className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /> {sourceCreatedAt}</span>
                <span>•</span>
                <span>{content.length} 字</span>
                <span>•</span>
                <span className="px-1.5 py-0.5 rounded bg-[#86d7ff]/8 text-[#86d7ff]/80 text-[9px] uppercase font-semibold">草稿</span>
              </div>

              <input
                type="text"
                value={title}
                onChange={(e) => handleLocalTitleChange(e.target.value)}
                className="w-full bg-transparent text-[30px] font-bold text-white mb-3 leading-tight tracking-normal outline-none placeholder:text-[#899298]/35"
                placeholder="Untitled"
              />
              {!title.trim() && !content.trim() && (
                <div className="mb-5 text-[13px] leading-relaxed text-[#899298]/65">
                  <p>Start writing, or press / for blocks.</p>
                  <p className="mt-1 text-[11px] text-[#899298]/45">Markdown shortcuts supported · Local autosave</p>
                </div>
              )}

              <div className="h-px bg-white/[0.06] mb-7" />

              <TiptapEditor
                value={contentJson}
                onChange={handleLocalContentChange}
                placeholder="Start writing, or press / for blocks."
                toolbarPortalTargetId={toolbarPortalTargetId}
                widthMode={widthMode}
                focusMode={focusMode}
                onOutlineChange={setOutline}
                enableBubbleMenu
                enableBlockHandles
              />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 右侧：检查器 (Inspector) - 保持 Golden UI */}
      {showInspector && !focusMode && (
        <div className="w-[260px] flex flex-col shrink-0 overflow-y-auto custom-scrollbar pb-10 border-l border-white/[0.07]">
          <div className="flex items-center gap-2 text-white text-base font-medium mb-6 px-4 pt-4">
            <SlidersHorizontal className="w-4 h-4" /> 检查器
          </div>

          <div className="px-4 mb-8">
            <h3 className="text-[9px] font-semibold text-[#899298] uppercase tracking-wider mb-3">属性</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2.5">
                <span className="text-[#899298]">状态</span>
                <span className="text-white">{activeDraftId ? '编辑中' : '未选择'}</span>
              </div>
              <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2.5">
                <span className="text-[#899298]">类型</span>
                <span className="text-[#86d7ff]">Draft</span>
              </div>
              {activeDraft && (
                <>
                  <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2.5">
                    <span className="text-[#899298]">字数</span>
                    <span className="text-white">{content.length}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2.5">
                    <span className="text-[#899298]">创建</span>
                    <span className="text-white">{new Date(activeDraft.createdAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2.5">
                    <span className="text-[#899298]">更新</span>
                    <span className="text-white">{formatTime(activeDraft.updatedAt)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="px-4 mb-8">
            <h3 className="text-[9px] font-semibold text-[#899298] uppercase tracking-wider mb-3">标签</h3>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#86d7ff]/10 text-[10px] text-[#86d7ff]"
                >
                  {tag}
                  <button
                    onClick={() => handleTagsChange(tags.filter((t) => t !== tag))}
                    className="hover:text-white transition-colors"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
              {tags.length === 0 && (
                <span className="text-[10px] text-[#899298]">暂无标签</span>
              )}
            </div>
            {activeDraftId && (
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="添加标签..."
                  className="flex-1 px-2 py-1 rounded-md bg-white/5 border border-white/[0.07] text-[10px] text-white placeholder-[#899298] outline-none focus:border-[#86d7ff]/30"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const value = (e.target as HTMLInputElement).value.trim()
                      if (value && !tags.includes(value)) {
                        handleTagsChange([...tags, value])
                      }
                      ;(e.target as HTMLInputElement).value = ''
                    }
                  }}
                />
              </div>
            )}
          </div>

          {outline.length > 0 && (
            <div className="px-4 mb-8">
              <h3 className="text-[9px] font-semibold text-[#899298] uppercase tracking-wider mb-3">文档目录</h3>
              <div className="space-y-1">
                {outline.slice(0, 12).map((item) => (
                  <div
                    key={item.id}
                    className="truncate text-[11px] leading-relaxed text-[#899298]"
                    style={{ paddingLeft: `${(item.level - 1) * 10}px` }}
                    title={item.title}
                  >
                    {item.title}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="px-4 mb-8">
            <h3 className="text-[9px] font-semibold text-[#899298] uppercase tracking-wider mb-3">项目</h3>
            {activeDraftId ? (
              <input
                type="text"
                value={project ?? ''}
                placeholder="未指定项目"
                onChange={(e) => handleProjectChange(e.target.value || null)}
                onBlur={() => {}}
                className="w-full px-2 py-1.5 rounded-md bg-white/5 border border-white/[0.07] text-[11px] text-white placeholder-[#899298] outline-none focus:border-[#86d7ff]/30"
              />
            ) : (
              <span className="text-[10px] text-[#899298]">未选择</span>
            )}
          </div>

          <div className="px-4 mb-8">
            <h3 className="text-[9px] font-semibold text-[#899298] uppercase tracking-wider mb-3">集合</h3>
            <div className="px-2 py-1.5 rounded-md bg-white/[0.02] border border-white/[0.05] text-[10px] text-[#899298] opacity-50">
              Planned — 集合功能开发中
            </div>
          </div>

          {activeDraftId && (
            <div className="px-4 mb-8">
              <h3 className="text-[9px] font-semibold text-[#899298] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" /> 操作
              </h3>
              <div className="space-y-2">
                <button
                  onClick={onPublish}
                  disabled={publishing}
                  className="w-full py-2 rounded-lg bg-[#86d7ff]/10 border border-[#86d7ff]/20 text-[11px] text-[#86d7ff] hover:bg-[#86d7ff]/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Send className="w-3 h-3" /> {publishing ? '发布中...' : '发布为正式文档'}
                </button>
                <button
                  onClick={() => onDiscard(activeDraftId)}
                  disabled={discarding === activeDraftId}
                  className="w-full py-2 rounded-lg bg-white/5 border border-white/[0.07] text-[11px] text-[#899298] hover:text-red-400 hover:border-red-400/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Trash2 className="w-3 h-3" /> 丢弃草稿
                </button>
              </div>
            </div>
          )}

          <div className="px-4">
            <h3 className="text-[9px] font-semibold text-[#899298] uppercase tracking-wider mb-3">相关节点</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 cursor-pointer group opacity-40">
                <div className="w-6 h-6 rounded-full bg-[#86d7ff]/10 text-[#86d7ff] flex items-center justify-center">
                  <FileText className="w-3 h-3" />
                </div>
                <span className="text-xs text-[#899298]">发布后自动生成</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPublishChoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-[#0b0f11]/60 backdrop-blur-sm"
            onClick={() => setShowPublishChoice(false)}
          />
          <div className="relative w-[420px] bg-[#1c2023]/90 backdrop-blur-[40px] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
              <h3 className="text-sm font-medium text-white">发布方式</h3>
              <button
                onClick={() => setShowPublishChoice(false)}
                className="p-1 rounded-md hover:bg-white/10 text-[#899298] hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] text-[#899298] mb-4">
                此草稿源自已有文档，请选择发布方式：
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => activeDraftId && executePublish(activeDraftId, 'update_original')}
                  disabled={publishing}
                  className="w-full p-3.5 rounded-xl bg-[#86d7ff]/10 border border-[#86d7ff]/20 hover:bg-[#86d7ff]/20 transition-colors text-left disabled:opacity-40"
                >
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <RefreshCw className="w-4 h-4 text-[#86d7ff]" />
                    <span className="text-[12px] font-medium text-[#86d7ff]">修改原文档</span>
                  </div>
                  <p className="text-[10px] text-[#899298] pl-6">
                    用当前草稿内容覆盖原文档，保留原文档 ID 和关联关系
                  </p>
                </button>
                <button
                  onClick={() => activeDraftId && executePublish(activeDraftId, 'as_new')}
                  disabled={publishing}
                  className="w-full p-3.5 rounded-xl bg-white/5 border border-white/[0.07] hover:bg-white/10 transition-colors text-left disabled:opacity-40"
                >
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <Copy className="w-4 h-4 text-white" />
                    <span className="text-[12px] font-medium text-white">作为新文档存入</span>
                  </div>
                  <p className="text-[10px] text-[#899298] pl-6">
                    创建一个全新的文档，原文档保持不变
                  </p>
                </button>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-white/[0.07]">
              <button
                onClick={() => setShowPublishChoice(false)}
                className="w-full py-2 rounded-lg bg-white/5 text-[11px] text-[#899298] hover:text-white hover:bg-white/10 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {showDiscardChoice && discardTargetId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-[#0b0f11]/60 backdrop-blur-sm"
            onClick={() => setShowDiscardChoice(false)}
          />
          <div className="relative w-[420px] bg-[#1c2023]/90 backdrop-blur-[40px] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
              <h3 className="text-sm font-medium text-white">丢弃方式</h3>
              <button
                onClick={() => setShowDiscardChoice(false)}
                className="p-1 rounded-md hover:bg-white/10 text-[#899298] hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] text-[#899298] mb-4">
                此草稿源自已有文档，请选择丢弃方式：
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => executeDiscard(discardTargetId, 'abandon_changes')}
                  disabled={discarding === discardTargetId}
                  className="w-full p-3.5 rounded-xl bg-[#86d7ff]/10 border border-[#86d7ff]/20 hover:bg-[#86d7ff]/20 transition-colors text-left disabled:opacity-40"
                >
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <Undo2 className="w-4 h-4 text-[#86d7ff]" />
                    <span className="text-[12px] font-medium text-[#86d7ff]">放弃更改</span>
                  </div>
                  <p className="text-[10px] text-[#899298] pl-6">
                    丢弃草稿内容，保留原文档不变
                  </p>
                </button>
                <button
                  onClick={() => executeDiscard(discardTargetId, 'delete_all')}
                  disabled={discarding === discardTargetId}
                  className="w-full p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors text-left disabled:opacity-40"
                >
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <Trash2 className="w-4 h-4 text-red-400" />
                    <span className="text-[12px] font-medium text-red-400">删除草稿及原文档</span>
                  </div>
                  <p className="text-[10px] text-[#899298] pl-6">
                    同时删除草稿和原文档，此操作不可恢复
                  </p>
                </button>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-white/[0.07]">
              <button
                onClick={() => setShowDiscardChoice(false)}
                className="w-full py-2 rounded-lg bg-white/5 text-[11px] text-[#899298] hover:text-white hover:bg-white/10 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function normalizeTitle(value?: string | null): string {
  const title = value?.trim()
  return title || 'Untitled'
}

function draftBodyText(draft: StoredDraft): string {
  return (draft.plainText || draft.content || draft.markdown || '').replace(/\s+/g, ' ').trim()
}

function draftExcerpt(draft: StoredDraft): string {
  const text = draftBodyText(draft)
  if (!text) return 'Start writing, or press / for blocks.'
  return text.length > 58 ? `${text.slice(0, 58)}...` : text
}

function draftWordCount(draft: StoredDraft): number {
  return draftBodyText(draft).length
}
