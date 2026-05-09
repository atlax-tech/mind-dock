'use client'

import React from 'react'
import { Timer, LayoutGrid, Network, Sparkles, AlertCircle, Maximize2 } from 'lucide-react'
import type { MindGraphSnapshot } from './types'
import type { MindInteractionState } from './useMindGraphInteraction'

interface MindScopeCapsuleProps {
  snapshot: MindGraphSnapshot
  viewScope: MindInteractionState['viewScope']
  onCenter?: () => void
}

export default function MindScopeCapsule({
  snapshot,
  viewScope,
  onCenter,
}: MindScopeCapsuleProps) {
  const [isExpanded, setIsExpanded] = React.useState(true)
  
  const nodeCount = snapshot.nodes.length
  const edgeCount = snapshot.edges.length
  const suggestionCount = snapshot.edges.filter(e => e.edgeType === 'suggested').length
  const isolatedCount = snapshot.nodes.filter(n => !snapshot.edges.some(e => e.sourceNodeId === n.id || e.targetNodeId === n.id)).length

  const getScopeLabel = () => {
    switch (viewScope) {
      case 'focusMap': return 'Focus Map'
      case 'clusterMap': return 'Cluster Map'
      case 'linkReview': return 'Link Review'
      case 'driftInbox': return 'Drift Inbox'
      case 'timelineSnapshot': return 'Timeline Snapshot'
      default: return 'Active View'
    }
  }

  const getScopeIcon = () => {
    switch (viewScope) {
      case 'timelineSnapshot': return <Timer size={16} className="text-[#86d7ff]" />
      case 'clusterMap': return <LayoutGrid size={16} className="text-[#c8a0f0]" />
      case 'linkReview': return <Network size={16} className="text-[#9cf4d4]" />
      case 'driftInbox': return <AlertCircle size={16} className="text-[#ff9c9c]" />
      default: return <Sparkles size={16} className="text-[#86d7ff]" />
    }
  }

  return (
    <div className={`absolute top-6 left-6 flex items-center transition-all duration-300 ease-out z-20 pointer-events-auto select-none overflow-hidden ${isExpanded ? 'p-1 rounded-full' : 'p-0 rounded-2xl'}`}
      style={{ 
        background: 'rgba(15,18,20,0.85)', 
        backdropFilter: 'blur(20px)', 
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 20px 40px -10px rgba(0,0,0,0.6)',
        width: isExpanded ? 'auto' : '48px',
        height: isExpanded ? '44px' : '48px'
      }}
    >
      {/* Toggle Button / Main Icon */}
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center justify-center shrink-0 transition-all duration-300 ${isExpanded ? 'w-10 h-10 rounded-full bg-white/5 border border-white/5 ml-0.5' : 'w-12 h-12 rounded-2xl hover:bg-white/5'}`}
      >
        {getScopeIcon()}
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="flex items-center animate-in fade-in slide-in-from-left-2 duration-300">
          <div className="flex flex-col ml-3 mr-4">
            <span className="text-[8px] font-bold text-[#8d989f] uppercase tracking-[0.2em] leading-none mb-0.5">Scope</span>
            <span className="text-[12px] font-bold text-white leading-none whitespace-nowrap">{getScopeLabel()}</span>
          </div>

          <div className="h-6 w-px bg-white/10 mx-1"></div>

          {/* Stats */}
          <div className="flex items-center gap-1.5 mx-3">
            {[
              { label: 'N', value: nodeCount, title: 'Nodes' },
              { label: 'L', value: edgeCount, title: 'Links' },
              { label: 'S', value: suggestionCount, color: '#c8a0f0', title: 'Suggestions' },
              { label: 'I', value: isolatedCount, color: '#ff9c9c', title: 'Isolated' },
            ].map(stat => (
              <div key={stat.title} className="flex items-center gap-1.5" title={stat.title}>
                <span className="text-[9px] font-bold text-[#4a5568]">{stat.label}</span>
                <span className="text-[11px] font-bold" style={{ color: stat.color || 'white' }}>{stat.value}</span>
              </div>
            ))}
          </div>

          <div className="h-6 w-px bg-white/10 mx-1"></div>

          {/* Actions */}
          <div className="flex items-center gap-1 ml-2 mr-1">
            <button 
              onClick={(e) => { e.stopPropagation(); onCenter?.() }}
              className="h-8 px-3 flex items-center gap-1.5 rounded-full bg-white/5 hover:bg-white/10 text-[10px] font-bold text-[#8d989f] hover:text-white transition-all border border-white/5"
            >
              <Maximize2 size={12} />
              Fit
            </button>
            <button 
              onClick={(e) => e.stopPropagation()}
              className="h-8 px-3 flex items-center gap-1.5 rounded-full bg-[#86d7ff]/10 hover:bg-[#86d7ff]/20 text-[10px] font-bold text-[#86d7ff] transition-all border border-[#86d7ff]/20 shadow-[0_0_15px_rgba(134,215,255,0.1)]"
            >
              Suggest
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
