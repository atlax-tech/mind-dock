'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Lightbulb, Loader2, Check, X, EyeOff, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import {
  listRecommendationDockQueue,
  markRecommendationDockQueueItemShown,
  recordRecommendationDockQueueItemFeedback,
  type RecommendationDockQueueItem,
} from '@/lib/repository'

interface RecommendationDockProps {
  userId: string
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  generated: { label: '待查看', color: 'text-yellow-400' },
  shown: { label: '已查看', color: 'text-blue-400' },
  accepted: { label: '已接受', color: 'text-emerald-400' },
  rejected: { label: '已拒绝', color: 'text-red-400' },
  modified: { label: '已调整', color: 'text-purple-400' },
  ignored: { label: '已忽略', color: 'text-gray-500' },
}

const FEEDBACK_BUTTONS: { type: 'accepted' | 'rejected' | 'ignored'; label: string; icon: React.ReactNode; activeClass: string }[] = [
  { type: 'accepted', label: '接受', icon: <Check size={14} />, activeClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { type: 'rejected', label: '拒绝', icon: <X size={14} />, activeClass: 'text-red-400 bg-red-500/10 border-red-500/20' },
  { type: 'ignored', label: '忽略', icon: <EyeOff size={14} />, activeClass: 'text-gray-400 bg-gray-500/10 border-gray-500/20' },
]

function formatConfidence(score: number): string {
  return `${Math.round(score * 100)}%`
}

export default function RecommendationDock({ userId }: RecommendationDockProps) {
  const [items, setItems] = useState<RecommendationDockQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const shownMarkedRef = useRef<Set<string>>(new Set())

  const loadQueue = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const result = await listRecommendationDockQueue(userId, { sortBy: 'createdAt', sortDirection: 'desc' })
      setItems(result.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载推荐失败')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadQueue()
  }, [loadQueue])

  useEffect(() => {
    if (items.length === 0) return
    items.forEach((item) => {
      if (!item.isShown && !shownMarkedRef.current.has(item.id)) {
        shownMarkedRef.current.add(item.id)
        markRecommendationDockQueueItemShown({
          userId,
          recommendationId: item.id,
        }).catch((err) => {
          console.error('[RecommendationDock] Failed to mark shown:', err)
        })
      }
    })
  }, [items, userId])

  const handleFeedback = useCallback(async (itemId: string, feedbackType: 'accepted' | 'rejected' | 'ignored') => {
    if (actionLoading) return
    setActionLoading(itemId)
    try {
      await recordRecommendationDockQueueItemFeedback({
        userId,
        recommendationId: itemId,
        feedbackType,
      })
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? { ...i, status: feedbackType, hasFeedback: true, isShown: true }
            : i,
        ),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : '反馈操作失败')
    } finally {
      setActionLoading(null)
    }
  }, [userId, actionLoading])

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  if (loading) {
    return (
      <div className="mt-24 w-full max-w-4xl">
        <div className="flex items-center justify-between mb-8 px-2">
          <span className="text-[11px] font-bold tracking-[0.25em] text-[var(--text-muted)] uppercase">Recommendations</span>
        </div>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-slate-500" size={20} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-24 w-full max-w-4xl">
        <div className="flex items-center justify-between mb-8 px-2">
          <span className="text-[11px] font-bold tracking-[0.25em] text-[var(--text-muted)] uppercase">Recommendations</span>
        </div>
        <div className="py-16 text-center rounded-[32px] border border-dashed border-red-500/10 bg-red-500/[0.02]">
          <p className="text-[12px] text-red-400 font-light tracking-wide">{error}</p>
          <button
            onClick={loadQueue}
            className="mt-4 text-xs text-red-400/70 hover:text-red-400 transition-colors"
          >
            点击重试
          </button>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="mt-24 w-full max-w-4xl">
        <div className="flex items-center justify-between mb-8 px-2">
          <span className="text-[11px] font-bold tracking-[0.25em] text-[var(--text-muted)] uppercase">Recommendations</span>
          <span className="text-[9px] text-slate-600 font-mono">0</span>
        </div>
        <div className="py-16 text-center rounded-[32px] border border-dashed border-white/[0.08] bg-white/[0.01]">
          <Lightbulb size={28} className="text-slate-600 mx-auto mb-4 opacity-50" />
          <p className="text-[12px] text-slate-600 font-light tracking-wide">暂无推荐。系统将在标记建议后生成智能推荐。</p>
        </div>
      </div>
    )
  }

  const pendingItems = items.filter((i) => i.status === 'generated' || i.status === 'shown')

  return (
    <div className="mt-24 w-full max-w-4xl">
      <div className="flex items-center justify-between mb-8 px-2">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold tracking-[0.25em] text-[var(--text-muted)] uppercase">Recommendations</span>
          <span className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-[9px] text-slate-500 font-mono">
            {items.length}
          </span>
          {pendingItems.length > 0 && (
            <span className="text-[10px] text-[var(--accent)] font-light">
              {pendingItems.length} 条待处理
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const isExpanded = expandedId === item.id
          const isBusy = actionLoading === item.id
          const statusConfig = STATUS_LABELS[item.status] ?? STATUS_LABELS.generated
          const isResolved = item.status === 'accepted' || item.status === 'rejected' || item.status === 'ignored'

          return (
            <div
              key={item.id}
              className={`rounded-2xl border bg-white/[0.02] backdrop-blur-2xl transition-all duration-300 ${
                isResolved
                  ? 'border-white/[0.03] opacity-60'
                  : 'border-white/[0.06] hover:border-white/[0.12]'
              }`}
            >
              <div
                onClick={() => toggleExpand(item.id)}
                className="flex items-center gap-4 px-5 py-4 cursor-pointer"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${
                  isResolved
                    ? 'bg-white/[0.02] border-white/[0.04]'
                    : 'bg-[var(--accent)]/10 border-[var(--accent)]/20'
                }`}>
                  {isResolved ? (
                    <Lightbulb size={14} className="text-slate-500" />
                  ) : (
                    <Sparkles size={14} className="text-[var(--accent)]" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[13px] text-white/80 font-light truncate">
                      {item.recommendationType.replace(/_/g, ' ')}
                    </span>
                    <span className={`text-[9px] font-medium ${statusConfig.color}`}>
                      {statusConfig.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-500 font-mono uppercase">
                      {item.candidateType}
                    </span>
                    <div className="h-2 w-px bg-white/5" />
                    <span className="text-[10px] text-slate-500">
                      {item.reasonSummary.reason}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className={`text-sm font-medium ${isResolved ? 'text-slate-600' : 'text-[var(--accent)]'}`}>
                      {formatConfidence(item.confidenceScore)}
                    </div>
                    {item.scoreSummary.rank != null && (
                      <div className="text-[9px] text-slate-600">Rank #{item.scoreSummary.rank}</div>
                    )}
                  </div>
                  {isExpanded ? (
                    <ChevronUp size={14} className="text-slate-500" />
                  ) : (
                    <ChevronDown size={14} className="text-slate-500" />
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="px-5 pb-5 border-t border-white/[0.04]">
                  <div className="pt-4 space-y-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-slate-500 font-semibold tracking-wider uppercase">Score Summary</span>
                      <div className="text-[11px] text-slate-400 bg-white/[0.02] border border-white/[0.04] rounded-lg px-3 py-2">
                        Score: {item.scoreSummary.score} · Confidence: {item.confidenceScore}
                        {item.scoreSummary.scoreReason && (
                          <span className="block mt-1 text-slate-500">{item.scoreSummary.scoreReason}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-slate-500 font-semibold tracking-wider uppercase">Evidence</span>
                      <div className="text-[11px] text-slate-400 bg-white/[0.02] border border-white/[0.04] rounded-lg px-3 py-2">
                        <span>{item.evidenceSummary.evidenceCount} 条证据</span>
                        {item.evidenceSummary.evidenceTypes.length > 0 && (
                          <span className="ml-2 text-slate-500">
                            ({item.evidenceSummary.evidenceTypes.join(', ')})
                          </span>
                        )}
                        {item.evidenceSummary.matchedValues.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {item.evidenceSummary.matchedValues.map((v, idx) => (
                              <span key={idx} className="px-1.5 py-0.5 bg-white/[0.03] border border-white/[0.04] rounded text-[10px] text-slate-500">
                                {v}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-slate-500 font-semibold tracking-wider uppercase">Status</span>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                          item.status === 'generated'
                            ? 'bg-yellow-500/5 text-yellow-400 border-yellow-500/10'
                            : item.status === 'shown'
                            ? 'bg-blue-500/5 text-blue-400 border-blue-500/10'
                            : item.status === 'accepted'
                            ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/10'
                            : item.status === 'rejected'
                            ? 'bg-red-500/5 text-red-400 border-red-500/10'
                            : 'bg-gray-500/5 text-gray-400 border-gray-500/10'
                        }`}>
                          {statusConfig.label}
                        </span>
                        {item.isShown && (
                          <span className="text-[9px] text-slate-600">已曝光</span>
                        )}
                        {item.hasFeedback && (
                          <span className="text-[9px] text-slate-600">已反馈</span>
                        )}
                      </div>
                    </div>

                    {!isResolved && (
                      <div className="flex gap-2 pt-3 border-t border-white/[0.04]">
                        {FEEDBACK_BUTTONS.map((btn) => (
                          <button
                            key={btn.type}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleFeedback(item.id, btn.type)
                            }}
                            disabled={isBusy}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                              isBusy
                                ? 'opacity-30 cursor-not-allowed'
                                : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white hover:border-white/[0.15] hover:bg-white/[0.05]'
                            }`}
                          >
                            {isBusy ? <Loader2 size={12} className="animate-spin" /> : btn.icon}
                            {isBusy ? '处理中' : btn.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
