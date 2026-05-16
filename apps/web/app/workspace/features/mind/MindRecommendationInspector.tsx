'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Check, X, Clock, Loader2, Sparkles } from 'lucide-react'
import { 
  listRecommendationDockQueue, 
  generateMindNodeRecommendations,
  applyRecommendation,
  recordRecommendationFeedback,
  resolveRecommendationCandidate,
  type RecommendationDockQueueItem
} from '@/lib/repository'

interface MindRecommendationInspectorProps {
  userId: string
  nodeId: string
  onToast: (msg: string) => void
  onRefreshGraph?: () => void
}

interface ResolvedCandidate {
  title: string
  type: string
}

export default function MindRecommendationInspector({
  userId,
  nodeId,
  onToast,
  onRefreshGraph,
}: MindRecommendationInspectorProps) {
  const [recommendations, setRecommendations] = useState<RecommendationDockQueueItem[]>([])
  const [resolvedCandidates, setResolvedCandidates] = useState<Record<string, ResolvedCandidate>>({})
  const [loading, setLoading] = useState(true)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchLoading, setBatchLoading] = useState(false)

  const fetchRecommendations = async () => {
    setLoading(true)
    try {
      const res = await listRecommendationDockQueue(userId, { 
        subjectType: 'mindNode', 
        subjectId: nodeId, 
        status: 'generated' 
      })
      
      let items = res.items

      if (items.length === 0) {
        await generateMindNodeRecommendations(userId, nodeId, 5)
        const res2 = await listRecommendationDockQueue(userId, { 
          subjectType: 'mindNode', 
          subjectId: nodeId, 
          status: 'generated' 
        })
        items = res2.items
      }

      setRecommendations(items)
      setSelectedIds(new Set())

      const resolved: Record<string, ResolvedCandidate> = {}
      for (const item of items) {
        const info = await resolveRecommendationCandidate(userId, item.candidateType, item.candidateId)
        if (info) {
          resolved[item.id] = info
        }
      }
      setResolvedCandidates(resolved)
    } catch (err) {
      console.error('Failed to fetch recommendations:', err)
      onToast('无法加载推荐内容')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (nodeId) {
      fetchRecommendations()
    }
  }, [nodeId, userId])

  const removeItem = useCallback((recId: string) => {
    setRecommendations(prev => prev.filter(r => r.id !== recId))
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.delete(recId)
      return next
    })
  }, [])

  const handleApply = async (recId: string) => {
    setApplyingId(recId)
    try {
      const result = await applyRecommendation({ userId, recommendationId: recId })
      if (result.appliedChanges.changeType === 'already_connected') {
        onToast('连接已存在，推荐已处理')
      } else {
        onToast('已成功建立连接')
      }
      removeItem(recId)
      onRefreshGraph?.()
    } catch (err) {
      console.error('Failed to apply recommendation:', err)
      onToast('建立连接失败')
    } finally {
      setApplyingId(null)
    }
  }

  const handleReject = async (recId: string) => {
    setApplyingId(recId)
    try {
      await recordRecommendationFeedback({
        userId,
        recommendationId: recId,
        feedbackType: 'rejected',
      })
      removeItem(recId)
      onToast('已拒绝推荐')
    } catch (err) {
      console.error('Failed to reject recommendation:', err)
      onToast('操作失败')
    } finally {
      setApplyingId(null)
    }
  }

  const handleDefer = async (recId: string) => {
    setApplyingId(recId)
    try {
      await recordRecommendationFeedback({
        userId,
        recommendationId: recId,
        feedbackType: 'ignored',
      })
      removeItem(recId)
      onToast('已推迟推荐')
    } catch (err) {
      console.error('Failed to defer recommendation:', err)
      onToast('操作失败')
    } finally {
      setApplyingId(null)
    }
  }

  const toggleSelect = useCallback((recId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(recId)) next.delete(recId)
      else next.add(recId)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === recommendations.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(recommendations.map(r => r.id)))
    }
  }, [selectedIds.size, recommendations])

  const handleBatchApply = async () => {
    setBatchLoading(true)
    let successCount = 0
    let failCount = 0
    const ids = Array.from(selectedIds)
    for (const recId of ids) {
      try {
        const result = await applyRecommendation({ userId, recommendationId: recId })
        if (result.appliedChanges.changeType === 'already_connected' || result.appliedChanges.changeType === 'create_edge') {
          successCount++
          removeItem(recId)
        }
      } catch {
        failCount++
      }
    }
    if (failCount > 0) {
      onToast(`批量连接完成：成功 ${successCount}，失败 ${failCount}`)
    } else {
      onToast(`已批量连接 ${successCount} 条推荐`)
    }
    onRefreshGraph?.()
    setBatchLoading(false)
  }

  const handleBatchReject = async () => {
    setBatchLoading(true)
    let successCount = 0
    let failCount = 0
    const ids = Array.from(selectedIds)
    for (const recId of ids) {
      try {
        await recordRecommendationFeedback({ userId, recommendationId: recId, feedbackType: 'rejected' })
        successCount++
        removeItem(recId)
      } catch {
        failCount++
      }
    }
    if (failCount > 0) {
      onToast(`批量拒绝完成：成功 ${successCount}，失败 ${failCount}`)
    } else {
      onToast(`已批量拒绝 ${successCount} 条推荐`)
    }
    setBatchLoading(false)
  }

  const handleBatchDefer = async () => {
    setBatchLoading(true)
    let successCount = 0
    let failCount = 0
    const ids = Array.from(selectedIds)
    for (const recId of ids) {
      try {
        await recordRecommendationFeedback({ userId, recommendationId: recId, feedbackType: 'ignored' })
        successCount++
        removeItem(recId)
      } catch {
        failCount++
      }
    }
    if (failCount > 0) {
      onToast(`批量推迟完成：成功 ${successCount}，失败 ${failCount}`)
    } else {
      onToast(`已批量推迟 ${successCount} 条推荐`)
    }
    setBatchLoading(false)
  }

  if (loading) {
    return (
      <div className="py-8 flex flex-col items-center justify-center gap-2 opacity-40">
        <Loader2 className="w-4 h-4 animate-spin text-[#86d7ff]" />
        <span className="text-[9px] uppercase tracking-widest font-semibold text-[#8d989f]">分析中...</span>
      </div>
    )
  }

  if (recommendations.length === 0) {
    return (
      <div className="py-5 text-center">
        <Sparkles className="w-4 h-4 text-[#8d989f]/40 mx-auto mb-1.5" />
        <span className="text-[11px] text-[#6b7280]">暂无结构推荐</span>
      </div>
    )
  }

  const allSelected = selectedIds.size === recommendations.length

  return (
    <div className="flex flex-col animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSelectAll}
            className={`w-4 h-4 rounded-[4px] border flex items-center justify-center transition-all ${
              allSelected ? 'bg-[#86d7ff] border-[#86d7ff]' : 'bg-white/5 border-white/10 hover:border-white/20'
            }`}
          >
            {allSelected && (
              <svg className="w-2.5 h-2.5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
          <span className="text-[10px] font-bold text-[#8d989f]/60 uppercase tracking-wider">
            结构推荐
          </span>
        </div>
        <div className="px-1.5 py-0.5 rounded bg-[#c8a0f0]/10 text-[#c8a0f0]/80 text-[9px] font-bold">
          {recommendations.length} 条
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-1.5 mb-3 p-2 rounded-lg bg-white/[0.03] border border-white/5">
          <span className="text-[10px] text-[#8d989f] mr-1">已选 {selectedIds.size} 项</span>
          <button
            onClick={handleBatchApply}
            disabled={batchLoading}
            className="h-6 px-2.5 flex items-center gap-1 rounded bg-[#86d7ff]/10 hover:bg-[#86d7ff]/20 text-[9px] font-bold text-[#86d7ff] transition-all disabled:opacity-50"
          >
            {batchLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check size={10} />}
            批量连接
          </button>
          <button
            onClick={handleBatchDefer}
            disabled={batchLoading}
            className="h-6 px-2.5 flex items-center gap-1 rounded bg-white/5 hover:bg-white/10 text-[9px] font-bold text-[#8d989f] transition-all disabled:opacity-50"
          >
            {batchLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock size={10} />}
            批量稍后
          </button>
          <button
            onClick={handleBatchReject}
            disabled={batchLoading}
            className="h-6 px-2.5 flex items-center gap-1 rounded bg-white/5 hover:bg-[#f87171]/10 text-[9px] font-bold text-[#8d989f] hover:text-[#f87171] transition-all disabled:opacity-50"
          >
            {batchLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <X size={10} />}
            批量拒绝
          </button>
        </div>
      )}

      <div className="space-y-2">
        {recommendations.map(rec => {
          const resolved = resolvedCandidates[rec.id]
          const confidence = Math.round(rec.confidenceScore * 100)
          const isSelected = selectedIds.has(rec.id)
          
          return (
            <div key={rec.id} className={`bg-white/[0.02] p-3 space-y-2.5 rounded-lg border transition-colors ${isSelected ? 'border-[#86d7ff]/20' : 'border-transparent'}`}>
              <div className="flex items-start gap-2">
                <button
                  onClick={() => toggleSelect(rec.id)}
                  className={`mt-0.5 w-3.5 h-3.5 rounded-[3px] border shrink-0 flex items-center justify-center transition-all ${
                    isSelected ? 'bg-[#86d7ff] border-[#86d7ff]' : 'bg-white/5 border-white/10 hover:border-white/20'
                  }`}
                >
                  {isSelected && (
                    <svg className="w-2 h-2 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h6 className="text-[12px] font-bold text-white truncate">{resolved?.title || rec.candidateId}</h6>
                    <div className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400/80 text-[9px] font-bold shrink-0">
                      {confidence}%
                    </div>
                  </div>
                  <div className="text-[9px] text-[#8d989f] mt-0.5">
                    {rec.reasonSummary.reason || '语义关联'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 pl-5.5">
                <button 
                  onClick={() => handleApply(rec.id)}
                  disabled={applyingId === rec.id}
                  className="flex items-center justify-center h-7 rounded bg-[#86d7ff] text-[#0b0f11] hover:bg-[#b3eaff] transition-colors disabled:opacity-50"
                  title="连接"
                >
                  {applyingId === rec.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check size={12} strokeWidth={3} />}
                  <span className="ml-0.5 text-[9px] font-bold">连接</span>
                </button>
                <button 
                  className="flex items-center justify-center h-7 rounded bg-white/5 text-[#8d989f] hover:text-white hover:bg-white/10 transition-all"
                  title="稍后"
                  onClick={() => handleDefer(rec.id)}
                  disabled={applyingId === rec.id}
                >
                  <Clock size={12} />
                  <span className="ml-0.5 text-[9px] font-bold">稍后</span>
                </button>
                <button 
                  className="flex items-center justify-center h-7 rounded bg-white/5 text-[#8d989f] hover:text-[#f87171] hover:bg-[#f87171]/10 transition-all"
                  title="拒绝"
                  onClick={() => handleReject(rec.id)}
                  disabled={applyingId === rec.id}
                >
                  <X size={12} />
                  <span className="ml-0.5 text-[9px] font-bold">拒绝</span>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
