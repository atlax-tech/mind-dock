'use client'

import React, { useState, useCallback } from 'react'
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
} from 'lucide-react'
import { useDrafts } from './useDrafts'
import { useEditorDraft } from './useEditorDraft'
import type { StoredDraft } from '@/lib/repository'

interface DraftEditorViewProps {
  userId: string
  showSourcePacket: boolean
  showInspector: boolean
  onToggleSourcePacket: () => void
  onToggleInspector: () => void
  onToast?: (msg: string) => void
}

export default function DraftEditorView({
  userId,
  showSourcePacket,
  showInspector,
  onToggleSourcePacket,
  onToggleInspector,
  onToast,
}: DraftEditorViewProps) {
  const {
    drafts,
    loading: draftsLoading,
    createDraft: handleCreateDraft,
    publishDraft: handlePublishDraft,
    discardDraft: handleDiscardDraft,
  } = useDrafts(userId)

  const [activeDraftId, setActiveDraftId] = useState<number | null>(null)
  const [showDraftsList, setShowDraftsList] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [discarding, setDiscarding] = useState<number | null>(null)

  const {
    title,
    content,
    saveStatus,
    loaded,
    handleTitleChange,
    handleContentChange,
    flushSave,
    resetForDraft,
  } = useEditorDraft({
    userId,
    draftId: activeDraftId,
    enabled: activeDraftId != null,
  })

  const onCreateNewDraft = useCallback(async () => {
    const draft = await handleCreateDraft('Untitled', '')
    if (draft) {
      setActiveDraftId(draft.id)
      resetForDraft(draft)
      onToast?.('新草稿已创建')
    }
  }, [handleCreateDraft, resetForDraft, onToast])

  const onSelectDraft = useCallback((draft: StoredDraft) => {
    setActiveDraftId(draft.id)
    resetForDraft(draft)
  }, [resetForDraft])

  const onPublish = useCallback(async () => {
    if (!activeDraftId) return
    setPublishing(true)
    try {
      await flushSave()
      const result = await handlePublishDraft(activeDraftId)
      if (result.draft && result.entryId) {
        setActiveDraftId(null)
        onToast?.(`已发布为正式文档 (ID: ${result.entryId})`)
      } else {
        onToast?.('发布失败')
      }
    } finally {
      setPublishing(false)
    }
  }, [activeDraftId, flushSave, handlePublishDraft, onToast])

  const onDiscard = useCallback(async (draftId: number) => {
    setDiscarding(draftId)
    try {
      const ok = await handleDiscardDraft(draftId)
      if (ok) {
        if (activeDraftId === draftId) {
          setActiveDraftId(null)
        }
        onToast?.('草稿已丢弃')
      }
    } finally {
      setDiscarding(null)
    }
  }, [activeDraftId, handleDiscardDraft, onToast])

  const activeDraft = drafts.find((d) => d.id === activeDraftId)

  const saveStatusLabel = (): string => {
    switch (saveStatus) {
      case 'saving': return 'Saving...'
      case 'saved': return 'Saved'
      case 'failed': return 'Save failed'
      default: return ''
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

  const formatTime = (date: Date) => {
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
    <div className="w-full h-full flex gap-0 animate-in fade-in duration-500 overflow-hidden text-sm">

      {/* 左侧：Drafts 列表 */}
      {showDraftsList && (
        <div className="w-[220px] flex flex-col shrink-0 border-r border-white/[0.07] bg-[#0d1215]">
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
                      ? 'bg-white/[0.06] border-l-[#86d7ff]'
                      : 'border-l-transparent hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-white truncate leading-tight">
                        {draft.title || 'Untitled'}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Clock className="w-2.5 h-2.5 text-[#899298]" />
                        <span className="text-[9px] text-[#899298]">{formatTime(draft.updatedAt)}</span>
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
      {showSourcePacket && activeDraftId != null && (
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
        <div className="h-[40px] bg-[#0d1215] border-b border-white/[0.07] flex items-center px-4 gap-2 shrink-0">
          <button
            onClick={() => setShowDraftsList((v) => !v)}
            className={`p-1.5 rounded hover:bg-white/10 transition-colors ${showDraftsList ? 'text-white' : 'text-[#899298] hover:text-white'}`}
            title="切换草稿列表"
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </button>

          {activeDraftId != null && (
            <>
              <div className="w-px h-4 bg-white/[0.07] mx-1" />
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#86d7ff]/10 text-[#86d7ff] uppercase font-semibold">草稿</span>
              <div className="flex-1" />
              <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                {saveStatusIcon()}
                {saveStatusLabel()}
              </span>
              <div className="w-px h-4 bg-white/[0.07] mx-1" />
              <button
                onClick={onPublish}
                disabled={publishing || !activeDraftId}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#86d7ff]/10 text-[#86d7ff] text-[11px] font-medium hover:bg-[#86d7ff]/20 transition-colors disabled:opacity-40"
                title="发布为正式文档"
              >
                <Send className="w-3 h-3" /> {publishing ? '发布中...' : '发布'}
              </button>
              <button
                onClick={() => activeDraftId && onDiscard(activeDraftId)}
                disabled={!activeDraftId}
                className="p-1.5 rounded hover:bg-white/10 text-[#899298] hover:text-red-400 transition-colors disabled:opacity-40"
                title="丢弃草稿"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {activeDraftId == null && (
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
            <div className="max-w-[650px] w-full mx-auto py-12 px-8">
              <div className="flex items-center gap-2.5 text-[11px] text-[#899298] mb-5">
                <span className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /> {activeDraft ? formatTime(activeDraft.createdAt) : ''}</span>
                <span>•</span>
                <span>{content.length} 字</span>
                <span>•</span>
                <span className="px-1.5 py-0.5 rounded bg-[#86d7ff]/10 text-[#86d7ff] text-[9px] uppercase font-semibold">草稿</span>
              </div>

              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="w-full bg-transparent text-2xl font-bold text-white mb-6 leading-tight tracking-tight outline-none placeholder-slate-600"
                placeholder="Untitled"
              />

              <div className="h-px bg-white/[0.07] mb-8" />

              <textarea
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                className="w-full min-h-[60vh] bg-transparent resize-none outline-none text-base font-light leading-relaxed text-[#e0e3e6] placeholder-slate-600"
                placeholder="开始写作... (支持 Markdown)"
              />
            </div>
          )}
        </div>
      </div>

      {/* 右侧：检查器 (Inspector) - 保持 Golden UI */}
      {showInspector && (
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
    </div>
  )
}
