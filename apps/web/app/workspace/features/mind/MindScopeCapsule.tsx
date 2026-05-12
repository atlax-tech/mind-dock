'use client'

import React from 'react'
import { Timer, LayoutGrid, Network, Sparkles, AlertCircle, Maximize2 } from 'lucide-react'

interface FilteredCounts {
  nodeCount: number
  edgeCount: number
  suggestionCount: number
  isolatedCount: number
}

interface MindScopeCapsuleProps {
  filteredCounts: FilteredCounts
  viewScope: 'focusMap' | 'clusterMap' | 'linkReview' | 'driftInbox' | 'timelineSnapshot'
  onCenter?: () => void
  onSuggest?: () => void
}

export default function MindScopeCapsule({
  filteredCounts,
  viewScope,
  onCenter,
  onSuggest,
}: MindScopeCapsuleProps) {
  const [isExpanded, setIsExpanded] = React.useState(true)

  const getScopeIcon = () => {
    switch (viewScope) {
      case 'timelineSnapshot': return <Timer size={16} className="text-[#86d7ff]" />
      case 'clusterMap': return <LayoutGrid size={16} className="text-[#c8a0f0]" />
      case 'linkReview': return <Network size={16} className="text-[#9cf4d4]" />
      case 'driftInbox': return <AlertCircle size={16} className="text-[#ff9c9c]" />
      default: return <Sparkles size={16} className="text-[#86d7ff]" />
    }
  }

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="absolute left-3 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-2xl z-10 pointer-events-auto select-none hover:bg-white/[0.06] active:scale-95"
        style={{
          background: 'rgba(15,18,20,0.85)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 20px 40px -10px rgba(0,0,0,0.6)',
        }}
      >
        {getScopeIcon()}
      </button>
    )
  }

  return (
    <div
      className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col items-center z-10 pointer-events-auto select-none rounded-2xl py-2 px-1.5 gap-2 animate-in fade-in slide-in-from-left-3 duration-700 ease-out"
      style={{
        background: 'rgba(15,18,20,0.85)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 20px 40px -10px rgba(0,0,0,0.6)',
        width: '56px',
      }}
    >
      <button
        onClick={() => setIsExpanded(false)}
        className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 border border-white/5 shrink-0 hover:bg-white/10 active:scale-95 transition-colors"
      >
        {getScopeIcon()}
      </button>

      <div className="w-8 h-px bg-white/10" />

      <div className="flex flex-col items-center gap-1">
        {[
          { label: 'N', value: filteredCounts.nodeCount, title: '节点' },
          { label: 'L', value: filteredCounts.edgeCount, title: '链接' },
          { label: 'S', value: filteredCounts.suggestionCount, color: '#c8a0f0', title: '建议' },
          { label: 'I', value: filteredCounts.isolatedCount, color: '#ff9c9c', title: '孤立' },
        ].map(stat => (
          <div key={stat.title} className="flex items-center gap-1" title={stat.title}>
            <span className="text-[9px] font-bold text-[#4a5568]">{stat.label}</span>
            <span className="text-[11px] font-bold" style={{ color: stat.color || 'white' }}>{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="w-8 h-px bg-white/10" />

      <button
        onClick={(e) => { e.stopPropagation(); onCenter?.() }}
        className="w-full h-7 flex items-center justify-center gap-1 rounded-lg bg-white/5 hover:bg-white/10 text-[9px] font-bold text-[#8d989f] hover:text-white transition-colors border border-white/5 active:scale-95"
      >
        <Maximize2 size={10} />
        Fit
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onSuggest?.() }}
        className="w-full h-7 flex items-center justify-center gap-1 rounded-lg bg-[#86d7ff]/10 hover:bg-[#86d7ff]/20 text-[9px] font-bold text-[#86d7ff] transition-colors border border-[#86d7ff]/20 active:scale-95"
      >
        推荐
      </button>
    </div>
  )
}
