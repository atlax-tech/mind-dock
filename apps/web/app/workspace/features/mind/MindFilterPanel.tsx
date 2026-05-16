'use client'

import React, { useMemo, useState, useRef, useEffect } from 'react'
import { Search, RotateCcw, Network, LayoutTemplate, Layers, Globe, Box, Tag, Crosshair, ChevronDown, Check, FolderOpen, Clock } from 'lucide-react'
import { DEFAULT_FILTER_STATE } from './useMindGraphInteraction'
import type { MindFilterState, MindInteractionActions, MindScopeType, TimeField, TimeQuickPreset } from './useMindGraphInteraction'
import type { MindGraphSnapshot } from './types'

interface MindFilterPanelProps {
  filterState: MindFilterState
  filterOpen: boolean
  layoutMode: 'force' | 'radial' | 'orbit'
  scope: MindScopeType
  scopeTargetId: string | null
  snapshot: MindGraphSnapshot
  onToggle: () => void
  onUpdateFilter: (patch: Partial<MindFilterState>) => void
  onResetFilters: () => void
  actions: MindInteractionActions
}

interface ScopeOption {
  type: MindScopeType
  targetId: string | null
  label: string
  icon: React.ReactNode
  disabled: boolean
}

function MultiSelectDropdown({
  label,
  items,
  selected,
  onChange,
}: {
  label: string
  items: string[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const activeCount = items.filter(i => selected.has(i)).length

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-[11px] hover:border-white/20 transition-all"
      >
        <span className="flex items-center gap-2">
          <span className="text-[#8d989f]">{label}</span>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-[#86d7ff]/10 text-[#86d7ff] text-[9px] font-bold">{activeCount}</span>
          )}
        </span>
        <ChevronDown size={12} className={`text-[#4a5568] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 py-1.5 rounded-xl bg-[#0f1214] border border-white/10 shadow-xl z-50 max-h-[200px] overflow-y-auto custom-scrollbar">
          {items.map(item => {
            const isActive = selected.has(item)
            return (
              <button
                key={item}
                onClick={() => {
                  const next = new Set(selected)
                  if (isActive) next.delete(item)
                  else next.add(item)
                  onChange(next)
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[10px] hover:bg-white/5 transition-colors"
              >
                <div className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center transition-all ${
                  isActive ? 'bg-[#86d7ff] border-[#86d7ff]' : 'bg-white/5 border-white/10'
                }`}>
                  {isActive && <Check size={8} className="text-black" strokeWidth={3} />}
                </div>
                <span className={isActive ? 'text-white font-medium' : 'text-[#8d989f]'}>{item.charAt(0).toUpperCase() + item.slice(1).replace('_', ' ')}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function parseLocalDateStart(dateStr: string): number {
  const parts = dateStr.split('-').map(Number)
  return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0).getTime()
}

export function parseLocalDateEnd(dateStr: string): number {
  const parts = dateStr.split('-').map(Number)
  return new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999).getTime()
}

export function computePresetRange(
  _field: TimeField,
  preset: TimeQuickPreset,
  anchorDate: string,
): { start: number; end: number } {
  const parts = anchorDate.split('-').map(Number)
  const y = parts[0], m = parts[1], d = parts[2]

  if (preset === 'day') {
    const start = new Date(y, m - 1, d, 0, 0, 0, 0).getTime()
    const end = new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
    return { start, end }
  }

  if (preset === 'week') {
    const anchor = new Date(y, m - 1, d)
    const day = anchor.getDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    const monday = new Date(anchor)
    monday.setDate(anchor.getDate() + mondayOffset)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 0, 0, 0, 0).getTime()
    const end = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate(), 23, 59, 59, 999).getTime()
    return { start, end }
  }

  if (preset === 'month') {
    const start = new Date(y, m - 1, 1, 0, 0, 0, 0).getTime()
    const end = new Date(y, m, 0, 23, 59, 59, 999).getTime()
    return { start, end }
  }

  if (preset === 'year') {
    const start = new Date(y, 0, 1, 0, 0, 0, 0).getTime()
    const end = new Date(y, 11, 31, 23, 59, 59, 999).getTime()
    return { start, end }
  }

  return { start: 0, end: Date.now() }
}

export default function MindFilterPanel({
  filterState,
  filterOpen,
  layoutMode,
  scope,
  scopeTargetId,
  snapshot,
  onUpdateFilter,
  onResetFilters,
  actions,
}: MindFilterPanelProps) {
  const scopeOptions = useMemo<ScopeOption[]>(() => {
    const domainNodes = snapshot.nodes.filter(n => n.nodeType === 'domain')
    const projectNodes = snapshot.nodes.filter(n => n.nodeType === 'project')
    const topicNodes = snapshot.nodes.filter(n => n.nodeType === 'topic')
    const tagNodes = snapshot.nodes.filter(n => n.nodeType === 'tag')

    const options: ScopeOption[] = [
      {
        type: 'global',
        targetId: null,
        label: '全局图谱',
        icon: <Globe size={12} />,
        disabled: false,
      },
    ]

    if (domainNodes.length > 0) {
      domainNodes.forEach(n => {
        options.push({
          type: 'domain',
          targetId: n.id,
          label: n.label,
          icon: <Box size={12} />,
          disabled: false,
        })
      })
    } else {
      options.push({
        type: 'domain',
        targetId: null,
        label: '无领域节点',
        icon: <Box size={12} />,
        disabled: true,
      })
    }

    if (projectNodes.length > 0) {
      projectNodes.forEach(n => {
        options.push({
          type: 'project',
          targetId: n.id,
          label: n.label,
          icon: <Box size={12} />,
          disabled: false,
        })
      })
    } else {
      options.push({
        type: 'project',
        targetId: null,
        label: '无项目节点',
        icon: <Box size={12} />,
        disabled: true,
      })
    }

    if (topicNodes.length > 0) {
      topicNodes.forEach(n => {
        options.push({
          type: 'collection',
          targetId: n.id,
          label: n.label,
          icon: <FolderOpen size={12} />,
          disabled: false,
        })
      })
    } else {
      options.push({
        type: 'collection',
        targetId: null,
        label: '无集合节点',
        icon: <FolderOpen size={12} />,
        disabled: true,
      })
    }

    if (tagNodes.length > 0) {
      tagNodes.forEach(n => {
        options.push({
          type: 'tag',
          targetId: n.id,
          label: n.label,
          icon: <Tag size={12} />,
          disabled: false,
        })
      })
    } else {
      options.push({
        type: 'tag',
        targetId: null,
        label: '无标签节点',
        icon: <Tag size={12} />,
        disabled: true,
      })
    }

    options.push({
      type: 'focusedNode',
      targetId: null,
      label: '聚焦节点',
      icon: <Crosshair size={12} />,
      disabled: false,
    })

    return options
  }, [snapshot])

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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-[#86d7ff]" />
          <span className="text-[11px] font-bold text-[#8d989f] tracking-[0.2em] uppercase">搜索与筛选</span>
        </div>
        <button 
          onClick={onResetFilters} 
          className="w-7 h-7 flex items-center justify-center text-[#8d989f] hover:text-white hover:bg-white/5 rounded-full transition-all"
          title="重置筛选"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4a5568]" />
        <input
          type="text"
          value={filterState.search}
          onChange={e => onUpdateFilter({ search: e.target.value })}
          placeholder="搜索节点..."
          className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-[13px] outline-none focus:border-[#86d7ff]/40 focus:ring-1 focus:ring-[#86d7ff]/20 transition-all text-white placeholder:text-[#4a5568]"
        />
      </div>

      <div className="h-px bg-white/5 mb-6" />

      <div className="mb-6 space-y-3">
        <div className="text-[10px] font-bold text-[#4a5568] tracking-widest uppercase px-1">类型筛选</div>
        <MultiSelectDropdown
          label="节点类型"
          items={Array.from(DEFAULT_FILTER_STATE.nodeTypes)}
          selected={filterState.nodeTypes}
          onChange={next => onUpdateFilter({ nodeTypes: next })}
        />
        <MultiSelectDropdown
          label="边类型"
          items={Array.from(DEFAULT_FILTER_STATE.edgeTypes)}
          selected={filterState.edgeTypes}
          onChange={next => onUpdateFilter({ edgeTypes: next })}
        />
      </div>

      <div className="h-px bg-white/5 mb-6" />

      <div className="mb-6">
        <div className="text-[10px] font-bold text-[#4a5568] tracking-widest mb-3 uppercase px-1 flex items-center gap-1.5">
          <LayoutTemplate size={12} />
          布局引擎
        </div>
        <div className="grid grid-cols-3 gap-1.5 bg-black/20 p-1 rounded-xl border border-white/5">
          {([
            { mode: 'force' as const, label: '力导向' },
            { mode: 'radial' as const, label: '径向' },
            { mode: 'orbit' as const, label: '轨道' },
          ]).map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => actions.setLayoutMode(mode)}
              className={`py-2 rounded-lg text-[10px] font-semibold transition-all ${
                layoutMode === mode
                  ? 'bg-white/10 text-white border border-white/20 shadow-[0_2px_10px_rgba(255,255,255,0.05)]'
                  : 'text-[#4a5568] hover:text-[#8d989f] hover:bg-white/5 border border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <div className="text-[10px] font-bold text-[#4a5568] tracking-widest mb-3 uppercase px-1 flex items-center gap-1.5">
          <Network size={12} />
          视图范围
        </div>
        <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto custom-scrollbar">
          {scopeOptions.map((opt, idx) => {
            const isActive = !opt.disabled && scope === opt.type && scopeTargetId === opt.targetId
            return (
              <button
                key={`${opt.type}-${opt.targetId ?? idx}`}
                disabled={opt.disabled}
                onClick={() => {
                  actions.setScope(opt.type)
                  actions.setScopeTarget(opt.targetId)
                  if (opt.type === 'focusedNode' && opt.targetId) {
                    actions.setChainRoot(opt.targetId)
                  } else {
                    actions.setChainRoot(null)
                  }
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[11px] font-medium transition-all border ${
                  opt.disabled
                    ? 'bg-black/20 border-white/5 text-[#4a5568]/40 cursor-not-allowed'
                    : isActive
                      ? 'bg-white/10 border-white/20 text-white shadow-[0_2px_10px_rgba(255,255,255,0.05)]'
                      : 'bg-black/20 border-white/5 text-[#4a5568] hover:text-[#8d989f] hover:bg-white/5'
                }`}
              >
                <span className="flex items-center gap-2">
                  {opt.icon}
                  <span>{opt.label}</span>
                </span>
                {isActive && <div className="w-1.5 h-1.5 rounded-full bg-[#86d7ff]" />}
              </button>
            )
          })}
        </div>
      </div>

      <div className="h-px bg-white/5 mb-6" />

      <div className="mb-6">
        <div className="text-[10px] font-bold text-[#4a5568] tracking-widest mb-3 uppercase px-1">可见性</div>
        <div className="space-y-3 px-1">
          {[
            { label: '显示文档', key: 'showDocuments' },
            { label: '显示标签', key: 'showTags' },
            { label: '显示来源/片段', key: 'showSources' },
            { label: '显示建议边', key: 'showSuggested' },
            { label: '显示确认边', key: 'showConfirmed' },
            { label: '显示孤立节点', key: 'showOrphans' },
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

      <div className="mb-6">
        <div className="text-[10px] font-bold text-[#4a5568] tracking-widest mb-3 uppercase px-1 flex items-center gap-1.5">
          <Clock size={12} />
          时间筛选
        </div>
        <div className="space-y-3 px-1">
          <div className="flex gap-1.5 bg-black/20 p-1 rounded-xl border border-white/5">
            {([
              { value: null as TimeField | null, label: '不启用' },
              { value: 'createdAt' as TimeField, label: '创建时间' },
              { value: 'updatedAt' as TimeField, label: '更新时间' },
            ]).map(opt => (
              <button
                key={opt.label}
                onClick={() => {
                  if (opt.value === null) {
                    onUpdateFilter({ timeField: null, timeRangeStart: null, timeRangeEnd: null, timeQuickPreset: null, timeAnchorDate: null })
                  } else {
                    const patch: Partial<MindFilterState> = { timeField: opt.value }
                    const preset = filterState.timeQuickPreset ?? 'day'
                    patch.timeQuickPreset = preset
                    if (filterState.timeAnchorDate) {
                      const { start, end } = computePresetRange(opt.value, preset, filterState.timeAnchorDate)
                      patch.timeRangeStart = start
                      patch.timeRangeEnd = end
                    }
                    onUpdateFilter(patch)
                  }
                }}
                className={`flex-1 py-2 rounded-lg text-[10px] font-semibold transition-all ${
                  filterState.timeField === opt.value
                    ? 'bg-white/10 text-white border border-white/20 shadow-[0_2px_10px_rgba(255,255,255,0.05)]'
                    : 'text-[#4a5568] hover:text-[#8d989f] hover:bg-white/5 border border-transparent'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {filterState.timeField != null && (
            <>
              <div className="flex gap-1.5 bg-black/20 p-1 rounded-xl border border-white/5">
                {([
                  { value: 'day' as TimeQuickPreset, label: '某一天' },
                  { value: 'week' as TimeQuickPreset, label: '周' },
                  { value: 'month' as TimeQuickPreset, label: '月' },
                  { value: 'year' as TimeQuickPreset, label: '年' },
                  { value: 'custom' as TimeQuickPreset, label: '自定义范围' },
                ]).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      const patch: Partial<MindFilterState> = { timeQuickPreset: opt.value }
                      if (opt.value !== 'custom' && filterState.timeAnchorDate && filterState.timeField) {
                        const { start, end } = computePresetRange(filterState.timeField, opt.value, filterState.timeAnchorDate)
                        patch.timeRangeStart = start
                        patch.timeRangeEnd = end
                      }
                      if (opt.value === 'custom') {
                        patch.timeRangeStart = null
                        patch.timeRangeEnd = null
                      }
                      onUpdateFilter(patch)
                    }}
                    className={`flex-1 py-1.5 rounded-lg text-[9px] font-semibold transition-all ${
                      filterState.timeQuickPreset === opt.value
                        ? 'bg-[#86d7ff]/10 text-[#86d7ff] border border-[#86d7ff]/20'
                        : 'text-[#4a5568] hover:text-[#8d989f] hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {filterState.timeQuickPreset !== 'custom' && (
                <div>
                  <div className="text-[9px] text-[#4a5568] mb-1.5">
                    {filterState.timeQuickPreset === 'day' ? '选择日期' : '选择锚点日期'}
                  </div>
                  <input
                    type="date"
                    value={filterState.timeAnchorDate ?? ''}
                    onChange={e => {
                      const dateStr = e.target.value
                      if (!dateStr) {
                        onUpdateFilter({ timeAnchorDate: null, timeRangeStart: null, timeRangeEnd: null })
                        return
                      }
                      const patch: Partial<MindFilterState> = { timeAnchorDate: dateStr }
                      const preset = filterState.timeQuickPreset ?? 'day'
                      if (preset !== 'custom' && filterState.timeField) {
                        if (!filterState.timeQuickPreset) {
                          patch.timeQuickPreset = preset
                        }
                        const { start, end } = computePresetRange(filterState.timeField, preset, dateStr)
                        patch.timeRangeStart = start
                        patch.timeRangeEnd = end
                      }
                      onUpdateFilter(patch)
                    }}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] outline-none focus:border-[#86d7ff]/40 text-white [color-scheme:dark]"
                  />
                </div>
              )}

              {filterState.timeQuickPreset === 'custom' && (
                <div className="space-y-2">
                  <div>
                    <div className="text-[9px] text-[#4a5568] mb-1.5">开始日期</div>
                    <input
                      type="date"
                      value={filterState.timeAnchorDate ?? ''}
                      onChange={e => {
                        const dateStr = e.target.value
                        if (!dateStr) {
                          onUpdateFilter({ timeAnchorDate: null, timeRangeStart: null })
                          return
                        }
                        const start = parseLocalDateStart(dateStr)
                        const patch: Partial<MindFilterState> = { timeAnchorDate: dateStr, timeRangeStart: start }
                        onUpdateFilter(patch)
                      }}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] outline-none focus:border-[#86d7ff]/40 text-white [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <div className="text-[9px] text-[#4a5568] mb-1.5">结束日期</div>
                    <input
                      type="date"
                      value={filterState.timeRangeEnd != null ? new Date(filterState.timeRangeEnd).toISOString().slice(0, 10) : ''}
                      onChange={e => {
                        const dateStr = e.target.value
                        if (!dateStr) {
                          onUpdateFilter({ timeRangeEnd: null })
                          return
                        }
                        const endMs = parseLocalDateEnd(dateStr)
                        onUpdateFilter({ timeRangeEnd: endMs })
                      }}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] outline-none focus:border-[#86d7ff]/40 text-white [color-scheme:dark]"
                    />
                  </div>
                </div>
              )}

              {filterState.timeRangeStart != null && filterState.timeRangeEnd != null && (
                <div className="text-[9px] text-[#4a5568] px-0.5">
                  范围：{new Date(filterState.timeRangeStart).toLocaleDateString('zh-CN')} — {new Date(filterState.timeRangeEnd).toLocaleDateString('zh-CN')}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="h-px bg-white/5 mb-6" />

      <div className="mb-2">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="text-[10px] font-bold text-[#4a5568] tracking-widest uppercase">最低置信度</div>
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
