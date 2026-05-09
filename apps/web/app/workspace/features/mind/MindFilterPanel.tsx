'use client'

import React from 'react'
import { Search, RotateCcw, Network, LayoutTemplate, Layers } from 'lucide-react'
import { DEFAULT_FILTER_STATE } from './useMindGraphInteraction'
import type { MindFilterState, MindInteractionActions } from './useMindGraphInteraction'

interface MindFilterPanelProps {
  filterState: MindFilterState
  filterOpen: boolean
  layoutMode: 'force' | 'radial' | 'orbit'
  scope: 'global' | 'currentChain'
  onToggle: () => void
  onUpdateFilter: (patch: Partial<MindFilterState>) => void
  onResetFilters: () => void
  actions: MindInteractionActions
}

export default function MindFilterPanel({
  filterState,
  filterOpen,
  layoutMode,
  scope,
  onUpdateFilter,
  onResetFilters,
  actions,
}: MindFilterPanelProps) {
  if (!filterOpen) return null

  return (
    <div className="absolute top-2 right-0 w-[320px] rounded-[24px] p-5 shadow-2xl z-30 flex flex-col animate-in slide-in-from-top-2 duration-200 max-h-[85vh] overflow-y-auto custom-scrollbar"
      style={{ 
        background: 'rgba(15,18,20,0.98)', 
        backdropFilter: 'blur(30px)', 
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 20px 60px -10px rgba(0,0,0,0.7)'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-[#86d7ff]" />
          <span className="text-[11px] font-bold text-[#8d989f] tracking-[0.2em] uppercase">SEARCH & FILTER</span>
        </div>
        <button 
          onClick={onResetFilters} 
          className="w-7 h-7 flex items-center justify-center text-[#8d989f] hover:text-white hover:bg-white/5 rounded-full transition-all"
          title="Reset Filters"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Search Input */}
      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4a5568]" />
        <input
          type="text"
          value={filterState.search}
          onChange={e => onUpdateFilter({ search: e.target.value })}
          placeholder="Search nodes..."
          className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-[13px] outline-none focus:border-[#86d7ff]/40 focus:ring-1 focus:ring-[#86d7ff]/20 transition-all text-white placeholder:text-[#4a5568]"
        />
      </div>

      <div className="h-px bg-white/5 mb-6" />

      {/* Node Types Section */}
      <div className="mb-6">
        <div className="text-[10px] font-bold text-[#4a5568] tracking-widest mb-3 uppercase px-1">NODE TYPES</div>
        <div className="flex flex-wrap gap-1.5">
          {Array.from(DEFAULT_FILTER_STATE.nodeTypes).map(type => {
            const isActive = filterState.nodeTypes.has(type)
            return (
              <button
                key={type}
                onClick={() => {
                  const next = new Set(filterState.nodeTypes)
                  if (isActive) next.delete(type)
                  else next.add(type)
                  onUpdateFilter({ nodeTypes: next })
                }}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border transition-all ${
                  isActive 
                    ? 'bg-white/10 border-white/40 text-white' 
                    : 'bg-transparent border-white/10 text-[#4a5568] hover:border-white/20 hover:text-[#8d989f]'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}
              </button>
            )
          })}
        </div>
      </div>

      {/* Edge Types Section */}
      <div className="mb-6">
        <div className="text-[10px] font-bold text-[#4a5568] tracking-widest mb-3 uppercase px-1">EDGE TYPES</div>
        <div className="flex flex-wrap gap-1.5">
          {Array.from(DEFAULT_FILTER_STATE.edgeTypes).map(type => {
            const isActive = filterState.edgeTypes.has(type)
            return (
              <button
                key={type}
                onClick={() => {
                  const next = new Set(filterState.edgeTypes)
                  if (isActive) next.delete(type)
                  else next.add(type)
                  onUpdateFilter({ edgeTypes: next })
                }}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border transition-all ${
                  isActive 
                    ? 'bg-white/10 border-white/40 text-white' 
                    : 'bg-transparent border-white/10 text-[#4a5568] hover:border-white/20 hover:text-[#8d989f]'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}
              </button>
            )
          })}
        </div>
      </div>

      <div className="h-px bg-white/5 mb-6" />

      {/* Layout Selection */}
      <div className="mb-6">
        <div className="text-[10px] font-bold text-[#4a5568] tracking-widest mb-3 uppercase px-1 flex items-center gap-1.5">
          <LayoutTemplate size={12} />
          LAYOUT ENGINE
        </div>
        <div className="grid grid-cols-3 gap-1.5 bg-black/20 p-1 rounded-xl border border-white/5">
          {(['force', 'radial', 'orbit'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => actions.setLayoutMode(mode)}
              className={`py-2 rounded-lg text-[10px] font-semibold transition-all ${
                layoutMode === mode
                  ? 'bg-white/10 text-white border border-white/20 shadow-[0_2px_10px_rgba(255,255,255,0.05)]'
                  : 'text-[#4a5568] hover:text-[#8d989f] hover:bg-white/5 border border-transparent'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Scope Selection */}
      <div className="mb-6">
        <div className="text-[10px] font-bold text-[#4a5568] tracking-widest mb-3 uppercase px-1 flex items-center gap-1.5">
          <Network size={12} />
          VIEW SCOPE
        </div>
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => { actions.setScope('global'); actions.setChainRoot(null) }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[11px] font-medium transition-all border ${
              scope === 'global'
                ? 'bg-white/10 border-white/20 text-white shadow-[0_2px_10px_rgba(255,255,255,0.05)]'
                : 'bg-black/20 border-white/5 text-[#4a5568] hover:text-[#8d989f] hover:bg-white/5'
            }`}
          >
            <span>Global Knowledge Graph</span>
            {scope === 'global' && <div className="w-1.5 h-1.5 rounded-full bg-[#86d7ff]" />}
          </button>
          <button
            onClick={() => actions.setScope('currentChain')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[11px] font-medium transition-all border ${
              scope === 'currentChain'
                ? 'bg-white/10 border-white/20 text-white shadow-[0_2px_10px_rgba(255,255,255,0.05)]'
                : 'bg-black/20 border-white/5 text-[#4a5568] hover:text-[#8d989f] hover:bg-white/5'
            }`}
          >
            <span>Focused Chain Only</span>
            {scope === 'currentChain' && <div className="w-1.5 h-1.5 rounded-full bg-[#86d7ff]" />}
          </button>
        </div>
      </div>

      <div className="h-px bg-white/5 mb-6" />

      {/* Visibility Section */}
      <div className="mb-6">
        <div className="text-[10px] font-bold text-[#4a5568] tracking-widest mb-3 uppercase px-1">VISIBILITY</div>
        <div className="space-y-3 px-1">
          {[
            { label: 'Show Documents', key: 'showDocuments' },
            { label: 'Show Tags', key: 'showTags' },
            { label: 'Show Sources/Fragments', key: 'showSources' },
            { label: 'Show Suggested Edges', key: 'showSuggested' },
            { label: 'Show Confirmed Edges', key: 'showConfirmed' },
            { label: 'Show Orphan Nodes', key: 'showOrphans' },
          ].map(item => (
            <label key={item.key} className="flex items-center gap-3 group cursor-pointer">
              <div className="relative flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={(filterState as any)[item.key]}
                  onChange={e => onUpdateFilter({ [item.key]: e.target.checked })}
                  className="peer appearance-none w-4.5 h-4.5 rounded-[5px] bg-white/5 border border-white/10 checked:bg-[#86d7ff] checked:border-[#86d7ff] transition-all cursor-pointer"
                />
                <div className="absolute opacity-0 peer-checked:opacity-100 text-black pointer-events-none transition-opacity">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                </div>
              </div>
              <span className="text-[12px] text-[#8d989f] group-hover:text-white transition-colors">{item.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="h-px bg-white/5 mb-6" />

      {/* Confidence Slider Placeholder */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="text-[10px] font-bold text-[#4a5568] tracking-widest uppercase">MIN CONFIDENCE</div>
          <span className="text-[10px] font-mono text-[#86d7ff]">{(filterState.minConfidence * 100).toFixed(0)}%</span>
        </div>
        <input 
          type="range" 
          min="0" max="1" step="0.01" 
          value={filterState.minConfidence}
          onChange={e => onUpdateFilter({ minConfidence: parseFloat(e.target.value) })}
          className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-[#86d7ff] hover:accent-[#86d7ff]/80 transition-all"
        />
      </div>
    </div>
  )
}
