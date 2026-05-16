'use client'

import React, { useState } from 'react'
import { Lightbulb, ArrowRight, Trash2, Clock, Loader2 } from 'lucide-react'
import type { StoredTip } from '@/lib/repository'

interface TipsPanelProps {
  tips: StoredTip[]
  loading: boolean
  onConvertToDraft: (tipId: number) => Promise<{ tip: StoredTip | null; draftId: number | null }>
  onDiscard: (tipId: number) => Promise<boolean>
  onToast?: (msg: string) => void
}

function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - new Date(date).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} 小时前`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay} 天前`
}

function sourceTypeLabel(sourceType: string): string {
  switch (sourceType) {
    case 'quick-capture': return 'QUICK CAPTURE'
    case 'manual': return 'MANUAL'
    case 'text': return 'TEXT'
    default: return sourceType.toUpperCase()
  }
}

export default function TipsPanel({ tips, loading, onConvertToDraft, onDiscard, onToast }: TipsPanelProps) {
  const [converting, setConverting] = useState<number | null>(null)
  const [discarding, setDiscarding] = useState<number | null>(null)

  const handleConvert = async (tipId: number) => {
    setConverting(tipId)
    try {
      const result = await onConvertToDraft(tipId)
      if (result.draftId) {
        onToast?.(`已转为 Draft (ID: ${result.draftId})，可在 Editor 中继续编辑`)
      } else {
        onToast?.('转 Draft 失败')
      }
    } finally {
      setConverting(null)
    }
  }

  const handleDiscard = async (tipId: number) => {
    setDiscarding(tipId)
    try {
      const ok = await onDiscard(tipId)
      if (ok) {
        onToast?.('Tip 已丢弃')
      }
    } finally {
      setDiscarding(null)
    }
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="w-4 h-4 text-[#86d7ff]" />
        <h2 className="text-base font-medium text-white">Tips</h2>
        {!loading && tips.length > 0 && (
          <span className="ml-auto text-[10px] text-[#899298]">{tips.length} 条未整理</span>
        )}
      </div>

      {loading ? (
        <div className="py-8 text-center text-[9px] text-[#899298]">Loading...</div>
      ) : tips.length === 0 ? (
        <div className="py-8 text-center rounded-[16px] border border-dashed border-white/5 bg-white/[0.01]">
          <Lightbulb className="w-6 h-6 text-[#899298]/30 mx-auto mb-2" />
          <p className="text-[11px] text-[#899298]">暂无 Tips</p>
          <p className="text-[10px] text-[#899298]/60 mt-1">在 Quick Capture 中输入想法即可创建</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tips.map((tip) => (
            <div
              key={tip.id}
              className="group flex items-start gap-3 px-4 py-3 rounded-[16px] border border-white/5 bg-[#1c2023]/40 backdrop-blur-[16px] hover:bg-[#1c2023]/60 hover:border-white/10 transition-all duration-200"
            >
              <div className="w-8 h-8 rounded-full bg-[#86d7ff]/10 flex items-center justify-center border border-[#86d7ff]/20 shrink-0 mt-0.5">
                <Lightbulb className="w-3.5 h-3.5 text-[#86d7ff]" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[#e0e3e6] font-light leading-relaxed break-words">
                  {tip.content}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[9px] text-[#899298] font-semibold tracking-wider uppercase">
                    {sourceTypeLabel(tip.sourceType)}
                  </span>
                  <div className="h-2 w-px bg-white/5" />
                  <span className="text-[9px] text-[#899298] flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {formatTimeAgo(tip.createdAt)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={() => handleConvert(tip.id)}
                  disabled={converting === tip.id}
                  className="p-1.5 rounded-lg hover:bg-[#86d7ff]/10 text-[#899298] hover:text-[#86d7ff] transition-colors duration-200 disabled:opacity-50"
                  title="转为 Draft"
                >
                  {converting === tip.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={() => handleDiscard(tip.id)}
                  disabled={discarding === tip.id}
                  className="p-1.5 rounded-lg hover:bg-[#ffb4ab]/10 text-[#899298] hover:text-[#ffb4ab] transition-colors duration-200 disabled:opacity-50"
                  title="丢弃"
                >
                  {discarding === tip.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
