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
      // 1. Fetch existing pending recommendations
      const res = await listRecommendationDockQueue(userId, { 
        subjectType: 'mindNode', 
        subjectId: nodeId, 
        status: 'generated' 
      })
      
      let items = res.items

      // 2. If none, try to generate new ones
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

      // 3. Resolve candidate details
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
      // Refresh list
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
      <div className="py-10 flex flex-col items-center justify-center gap-3 opacity-50">
        <Loader2 className="w-5 h-5 animate-spin text-[#86d7ff]" />
        <span className="text-[10px] uppercase tracking-widest font-semibold text-[#8d989f]">Neural Analysis...</span>
      </div>
    )
  }

  if (recommendations.length === 0) {
    return (
      <div className="py-8 px-5 text-center bg-white/[0.02] rounded-xl border border-dashed border-white/10 mx-5">
        <Sparkles className="w-5 h-5 text-[#8d989f] mx-auto mb-2 opacity-50" />
        <p className="text-[11px] text-[#8d989f]">暂无结构推荐，保持当前连接即可。</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="px-5 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="text-[10px] font-bold text-[#c8a0f0] uppercase tracking-widest">Recommendation Inspector</div>
          <h4 className="text-[16px] font-semibold text-white">结构推荐解释</h4>
        </div>
        <div className="px-2 py-1 rounded-full bg-[#c8a0f0]/10 border border-[#c8a0f0]/20 text-[#c8a0f0] text-[10px] font-bold">
          {recommendations.length} Links
        </div>
      </div>

      {/* Summary Card */}
      <div className="mx-5 p-4 rounded-2xl bg-gradient-to-br from-[#1a1f24] to-[#0d1215] border border-white/10 shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
          <Zap className="w-8 h-8 text-[#facc15]" fill="currentColor" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <h5 className="text-[14px] font-bold text-white">Mind 结构整理方案</h5>
            <div className="w-1.5 h-1.5 rounded-full bg-[#facc15] animate-pulse" />
          </div>
          <p className="text-[11px] text-[#8d989f] mb-4">
            Suggested · 未确认关系 {recommendations.length} · 缺少最终归属
          </p>
          <div className="flex gap-1.5">
            {['Mind', 'Structure', 'Recommendation'].map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] font-medium text-[#8d989f]">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Recommended Links List */}
      <div className="px-5 space-y-4">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-bold text-[#8d989f] uppercase tracking-widest">Recommended Links</span>
          <button className="text-[10px] font-bold text-[#86d7ff] hover:underline transition-all">批量审核</button>
        </div>

        {recommendations.map(rec => {
          const resolved = resolvedCandidates[rec.id]
          const confidence = Math.round(rec.confidenceScore * 100)
          
          return (
            <div key={rec.id} className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-white/10 transition-all space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h6 className="text-[13px] font-bold text-white truncate">{resolved?.title || rec.candidateId}</h6>
                  <div className="text-[10px] text-[#8d989f] mt-0.5">
                    关系类型：<span className="text-[#e2e8f0]">{rec.recommendationType || '语义关联'}</span>
                  </div>
                </div>
                <div className="px-2 py-1 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] font-bold">
                  {confidence}%
                </div>
              </div>

              <p className="text-[11px] text-[#8d989f] leading-relaxed line-clamp-2">
                {rec.reasonSummary.reason || '该节点与当前上下文具有高度语义相似度，建议建立结构化关联。'}
              </p>

              <div className="grid grid-cols-4 gap-2">
                <button 
                  onClick={() => handleApply(rec.id)}
                  disabled={applyingId === rec.id}
                  className="col-span-1 flex items-center justify-center h-8 rounded-lg bg-[#86d7ff] text-[#0b0f11] hover:bg-[#b3eaff] transition-colors disabled:opacity-50"
                  title="连接"
                >
                  {applyingId === rec.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check size={14} strokeWidth={3} />}
                  <span className="ml-1 text-[10px] font-bold">连接</span>
                </button>
                <button className="flex items-center justify-center h-8 rounded-lg bg-white/5 text-[#8d989f] hover:text-white hover:bg-white/10 transition-all" title="修改">
                  <Edit3 size={14} />
                </button>
                <button className="flex items-center justify-center h-8 rounded-lg bg-white/5 text-[#8d989f] hover:text-white hover:bg-white/10 transition-all" title="稍后">
                  <Clock size={14} />
                </button>
                <button className="flex items-center justify-center h-8 rounded-lg bg-white/5 text-[#8d989f] hover:text-[#f87171] hover:bg-[#f87171]/10 transition-all" title="拒绝">
                  <X size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
