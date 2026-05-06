'use client'

import React from 'react'
import { Search, SlidersHorizontal, RotateCcw, RefreshCw } from 'lucide-react'
import type { MindFilterState, MindInteractionActions } from './useMindGraphInteraction'
import type { MindNodeType, MindEdgeType } from '@atlax/domain'

interface MindFilterPanelProps {
  filterState: MindFilterState
  filterOpen: boolean
  onToggle: () => void
  onUpdateFilter: (patch: Partial<MindFilterState>) => void
  onResetFilters: () => void
  actions: MindInteractionActions
}

const NODE_TYPE_OPTIONS: { value: MindNodeType; label: string }[] = [
  { value: 'root', label: 'Root' },
  { value: 'domain', label: 'Domain' },
  { value: 'project', label: 'Project' },
  { value: 'topic', label: 'Topic' },
  { value: 'document', label: 'Document' },
  { value: 'fragment', label: 'Fragment' },
  { value: 'source', label: 'Source' },
  { value: 'tag', label: 'Tag' },
  { value: 'insight', label: 'Insight' },
  { value: 'question', label: 'Question' },
  { value: 'time', label: 'Time' },
]

const EDGE_TYPE_OPTIONS: { value: MindEdgeType; label: string }[] = [
  { value: 'parent_child', label: 'Parent-Child' },
  { value: 'semantic', label: 'Semantic' },
  { value: 'reference', label: 'Reference' },
  { value: 'source', label: 'Source' },
  { value: 'temporal', label: 'Temporal' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'suggested', label: 'Suggested' },
  { value: 'conflict', label: 'Conflict' },
]

export default function MindFilterPanel({
  filterState,
  filterOpen,
  onToggle,
  onUpdateFilter,
  onResetFilters,
  actions,
}: MindFilterPanelProps) {
  const toggleNodeType = (nodeType: MindNodeType) => {
    const next = new Set(filterState.nodeTypes)
    if (next.has(nodeType)) {
      next.delete(nodeType)
    } else {
      next.add(nodeType)
    }
    onUpdateFilter({ nodeTypes: next })
  }

  const toggleEdgeType = (edgeType: MindEdgeType) => {
    const next = new Set(filterState.edgeTypes)
    if (next.has(edgeType)) {
      next.delete(edgeType)
    } else {
      next.add(edgeType)
    }
    onUpdateFilter({ edgeTypes: next })
  }

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col items-end pointer-events-auto">
      <button
        onClick={onToggle}
        className="px-4 py-2 rounded-xl flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-white transition-colors shadow-lg"
        style={{ background: 'rgba(20,20,25,0.9)', backdropFilter: 'blur(16px)', border: '1px solid var(--border-line)' }}
      >
        <SlidersHorizontal size={16} />
        Filters
      </button>

      {filterOpen && (
        <div className="absolute top-12 right-0 w-72 rounded-2xl p-4 shadow-2xl z-30 flex flex-col max-h-[80vh] overflow-y-auto no-scrollbar"
          style={{ background: 'rgba(20,20,25,0.95)', backdropFilter: 'blur(16px)', border: '1px solid var(--border-line)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-wider">SEARCH & FILTER</span>
            <button
              onClick={onResetFilters}
              className="p-1 text-[var(--text-muted)] hover:text-white transition-colors rounded"
              title="Reset Filters"
            >
              <RotateCcw size={12} />
            </button>
          </div>

          <div className="relative mb-3 shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" size={14} />
            <input
              type="text"
              value={filterState.search}
              onChange={e => onUpdateFilter({ search: e.target.value })}
              placeholder="Search nodes..."
              className="w-full bg-black/20 border border-[var(--border-line)] rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none focus:border-[var(--accent)] transition-colors text-white placeholder:text-gray-500"
            />
          </div>

          <div className="text-[10px] font-bold text-[var(--text-muted)] mb-2 tracking-wider border-t border-[var(--border-line)] pt-3">NODE TYPES</div>
          <div className="flex flex-wrap gap-1 mb-3">
            {NODE_TYPE_OPTIONS.map(opt => {
              const active = filterState.nodeTypes.has(opt.value)
              return (
                <button
                  key={opt.value}
                  onClick={() => toggleNodeType(opt.value)}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                    active
                      ? 'bg-[var(--accent)]/20 border-[var(--accent)]/30 text-white'
                      : 'bg-white/5 border-[var(--border-line)] text-[var(--text-muted)] hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>

          <div className="text-[10px] font-bold text-[var(--text-muted)] mb-2 tracking-wider border-t border-[var(--border-line)] pt-3">EDGE TYPES</div>
          <div className="flex flex-wrap gap-1 mb-3">
            {EDGE_TYPE_OPTIONS.map(opt => {
              const active = filterState.edgeTypes.has(opt.value)
              return (
                <button
                  key={opt.value}
                  onClick={() => toggleEdgeType(opt.value)}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                    active
                      ? 'bg-[var(--accent)]/20 border-[var(--accent)]/30 text-white'
                      : 'bg-white/5 border-[var(--border-line)] text-[var(--text-muted)] hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>

          <div className="text-[10px] font-bold text-[var(--text-muted)] mb-2 tracking-wider border-t border-[var(--border-line)] pt-3">VISIBILITY</div>
          <div className="space-y-1.5 mb-3">
            <label className="flex items-center gap-2 text-xs text-white cursor-pointer hover:bg-white/5 p-1 rounded -ml-1">
              <input
                type="checkbox"
                checked={filterState.showOrphans}
                onChange={e => onUpdateFilter({ showOrphans: e.target.checked })}
                className="accent-[var(--accent)] rounded w-3.5 h-3.5"
              />
              Show Orphan Nodes
            </label>
          </div>


          <div className="text-[10px] font-bold text-[var(--text-muted)] mb-2 tracking-wider border-t border-[var(--border-line)] pt-3">ACTIONS</div>
          <button
            onClick={() => actions.triggerRelayout()}
            className="w-full py-2 bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/20 rounded-lg text-xs transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw size={12} />
            Re-layout
          </button>
        </div>
      )}
    </div>
  )
}
