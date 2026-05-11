'use client'

import React, { useState, useEffect } from 'react'
import { Zap, Check, X, Clock, Edit3, Loader2, Sparkles } from 'lucide-react'
import { 
  listRecommendationDockQueue, 
  generateRecommendationsForContext, 
  applyRecommendation,
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
        await generateRecommendationsForContext({
          userId,
          subjectType: 'mindNode',
          subjectId: nodeId,
          topK: 3,
          source: 'mind_inspector'
        })
        const res2 = await listRecommendationDockQueue(userId, { 
          subjectType: 'mindNode', 
          subjectId: nodeId, 
          status: 'generated' 
        })
        items = res2.items
      }

      setRecommendations(items)

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

  const handleApply = async (recId: string) => {
    setApplyingId(recId)
    try {
      await applyRecommendation({ userId, recommendationId: recId })
      onToast('已成功建立连接')
      setRecommendations(prev => prev.filter(r => r.id !== recId))
      onRefreshGraph?.()
    } catch (err) {
      console.error('Failed to apply recommendation:', err)
      onToast('建立连接失败')
    } finally {
      setApplyingId(null)
    }
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

  return (
    <div className="flex flex-col animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex flex-col gap-0.5">
          <div className="text-[10px] font-bold text-[#c8a0f0]/70 uppercase tracking-wider">推荐解释</div>
          <h4 className="text-[13px] font-semibold text-white">结构推荐</h4>
        </div>
        <div className="px-1.5 py-0.5 rounded bg-[#c8a0f0]/10 text-[#c8a0f0]/80 text-[9px] font-bold">
          {recommendations.length} Links
        </div>
      </div>

      {/* Summary */}
      <div className="p-3 mb-3 bg-white/[0.02] relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-2 opacity-15 group-hover:opacity-30 transition-opacity">
          <Zap className="w-5 h-5 text-[#facc15]" fill="currentColor" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-1.5 mb-1">
            <h5 className="text-[12px] font-bold text-white">Mind 结构整理方案</h5>
            <div className="w-1 h-1 rounded-full bg-[#facc15] animate-pulse" />
          </div>
          <p className="text-[10px] text-[#8d989f] mb-2">
            未确认关系 {recommendations.length} · 缺少最终归属
          </p>
          <div className="flex gap-1">
            {['Mind', 'Structure', 'Recommendation'].map(tag => (
              <span key={tag} className="px-1.5 py-px rounded bg-white/5 text-[8px] font-medium text-[#6b7280]">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Recommended Links List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-[#8d989f]/60 uppercase tracking-wider">Recommended Links</span>
          <button className="text-[9px] font-bold text-[#86d7ff]/60 hover:text-[#86d7ff] transition-colors">批量审核</button>
        </div>

        {recommendations.map(rec => {
          const resolved = resolvedCandidates[rec.id]
          const confidence = Math.round(rec.confidenceScore * 100)
          
          return (
            <div key={rec.id} className="bg-white/[0.02] p-3 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h6 className="text-[12px] font-bold text-white truncate">{resolved?.title || rec.candidateId}</h6>
                  <div className="text-[9px] text-[#8d989f] mt-0.5">
                    关系类型：<span className="text-[#e0e3e6]">{rec.recommendationType || '语义关联'}</span>
                  </div>
                </div>
                <div className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400/80 text-[9px] font-bold shrink-0">
                  {confidence}%
                </div>
              </div>

              <p className="text-[10px] text-[#8d989f] leading-relaxed line-clamp-2">
                {rec.reasonSummary.reason || '该节点与当前上下文具有高度语义相似度，建议建立结构化关联。'}
              </p>

              <div className="grid grid-cols-4 gap-1.5">
                <button 
                  onClick={() => handleApply(rec.id)}
                  disabled={applyingId === rec.id}
                  className="col-span-1 flex items-center justify-center h-7 rounded bg-[#86d7ff] text-[#0b0f11] hover:bg-[#b3eaff] transition-colors disabled:opacity-50"
                  title="连接"
                >
                  {applyingId === rec.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check size={12} strokeWidth={3} />}
                  <span className="ml-0.5 text-[9px] font-bold">连接</span>
                </button>
                <button className="flex items-center justify-center h-7 rounded bg-white/5 text-[#8d989f] hover:text-white hover:bg-white/10 transition-all" title="修改">
                  <Edit3 size={12} />
                </button>
                <button className="flex items-center justify-center h-7 rounded bg-white/5 text-[#8d989f] hover:text-white hover:bg-white/10 transition-all" title="稍后">
                  <Clock size={12} />
                </button>
                <button className="flex items-center justify-center h-7 rounded bg-white/5 text-[#8d989f] hover:text-[#f87171] hover:bg-[#f87171]/10 transition-all" title="拒绝">
                  <X size={12} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}