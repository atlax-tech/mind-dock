'use client'

import React, { useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { ArrowRight, FilePlus2, FileText, Import, Network, Plus } from 'lucide-react'
import { listDockItems, type DockItem } from '@/lib/repository'
import RecommendationDock from '../../_components/RecommendationDock'

export interface HomeViewHandle {
  focusCaptureInput: () => void
}

interface HomeViewProps {
  userId: string
  userName: string
  onOpenEditor: (itemId: number) => void
  onNewNote: () => void
  onSwitchToDock: () => void
  onSwitchToMind: () => void
  onCapture: (text: string) => Promise<void>
  nodeCount: number
  recRefreshKey?: number
  onApplyRecommendation?: (recommendationId: string) => Promise<string | void>
  onToast?: (msg: string) => void
}

const HomeView = forwardRef<HomeViewHandle, HomeViewProps>(function HomeView({ userId, userName: _userName, onOpenEditor, onNewNote, onSwitchToDock, onSwitchToMind, onCapture, nodeCount, recRefreshKey, onApplyRecommendation, onToast }, ref) {
  const captureInputRef = useRef<HTMLInputElement>(null)
  const [recentItems, setRecentItems] = useState<DockItem[]>([])
  const [hoveredCard, setHoveredCard] = useState<string | null>(null)
  const [captureText, setCaptureText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useImperativeHandle(ref, () => ({
    focusCaptureInput: () => {
      captureInputRef.current?.focus()
    }
  }))

  const loadRecent = useCallback(async () => {
    if (!userId) return
    try {
      const items = await listDockItems(userId)
      setRecentItems(items.slice(0, 8))
    } catch {
      // silently fail
    }
  }, [userId])

  useEffect(() => {
    loadRecent()
  }, [loadRecent])

  const submitCapture = async () => {
    if (!captureText.trim() || submitting) return
    setSubmitting(true)
    try {
      await onCapture(captureText.trim())
      setCaptureText('')
      await loadRecent()
    } finally {
      setSubmitting(false)
    }
  }

  const entryCards = [
    { id: 'new-document', icon: <FilePlus2 size={22} />, title: 'New Document', desc: 'Structured markdown workspace', iconColor: 'text-indigo-400', onClick: onNewNote },
    { id: 'process-dock', icon: <Import size={22} />, title: 'Process Dock', desc: 'Organize unlinked fragments', iconColor: 'text-emerald-400', onClick: onSwitchToDock },
    { id: 'graph-explorer', icon: <Network size={22} />, title: 'Graph Explorer', desc: 'Navigate your knowledge base', iconColor: 'text-blue-400', onClick: onSwitchToMind },
  ]

  return (
    <div className="h-full overflow-y-auto pb-24 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden relative">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col items-center relative z-10">
        <section className="flex w-full flex-col items-center py-12">
          <div className="mb-14 text-center">
            <h1 className="mb-6 text-5xl font-semibold tracking-tight text-white md:text-6xl bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
              Knowledge, Structured.
            </h1>
            <div className="flex items-center justify-center gap-4 mt-8">
              <div className="h-px w-10 bg-white/10" />
              <p className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.2em] uppercase">
                {nodeCount.toLocaleString()} Nodes active
              </p>
              <div className="h-px w-10 bg-white/10" />
            </div>
          </div>

          {/* Star Input - Main Capture */}
          <div className="mb-20 flex w-full max-w-2xl items-center glass rounded-2xl p-2 pl-6 shadow-[0_20px_50px_rgba(0,0,0,0.3)] transition-all duration-500 focus-within:border-[var(--accent)]/30 focus-within:bg-white/[0.05] focus-within:ring-1 focus-within:ring-[var(--accent)]/10">
            <input
              ref={captureInputRef}
              type="text"
              value={captureText}
              onChange={(e) => setCaptureText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submitCapture() }}
              placeholder="Capture an idea... (Press Enter to Dock)"
              className="w-full bg-transparent py-4 text-lg font-light text-white outline-none placeholder:text-[#444] placeholder:font-light"
            />
            <button
              onClick={submitCapture}
              disabled={!captureText.trim() || submitting}
              className="ml-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 transition-all hover:bg-[var(--accent)]/20 disabled:cursor-not-allowed disabled:opacity-20"
              title="Capture"
            >
              {submitting ? <Plus size={20} className="animate-spin" /> : <ArrowRight size={20} />}
            </button>
          </div>

          {/* Feature Grid */}
          <div className="grid w-full max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
            {entryCards.map((card) => (
              <button
                key={card.id}
                onClick={card.onClick}
                onMouseEnter={() => setHoveredCard(card.id)}
                onMouseLeave={() => setHoveredCard(null)}
                className={`group flex flex-col items-center rounded-2xl border bg-white/[0.02] p-6 text-center shadow-xl backdrop-blur-2xl transition-all duration-500 ${
                  hoveredCard && hoveredCard !== card.id
                    ? 'scale-[0.97] border-white/[0.02] opacity-40 grayscale-[0.5]'
                    : 'border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.04] hover:shadow-[#a78bfa]/5'
                }`}
              >
                <div className={`mb-6 flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 ${card.iconColor}`}>
                  {card.icon}
                </div>
                <p className="mb-2 text-base font-medium text-white group-hover:text-[var(--accent)] transition-colors">{card.title}</p>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed font-light">{card.desc}</p>
              </button>
            ))}
          </div>

          <div className="mt-24 w-full max-w-4xl">
            <div className="flex items-center justify-between mb-8 px-2">
              <span className="text-[11px] font-bold tracking-[0.25em] text-[var(--text-muted)] uppercase">Recent Intelligence</span>
            </div>

            {recentItems.length === 0 ? (
              <div className="py-16 text-center rounded-[32px] border border-dashed border-white/[0.08] bg-white/[0.01]">
                <p className="text-[12px] text-slate-600 font-light tracking-wide">No recently processed fragments detected.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recentItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onOpenEditor(item.id)}
                    className="flex items-center gap-5 px-6 py-5 rounded-[24px] border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.1] transition-all group text-left shadow-lg"
                  >
                    <div className="w-12 h-12 rounded-full bg-white/[0.03] flex items-center justify-center border border-white/[0.06] group-hover:bg-white/[0.08] transition-all">
                      <FileText size={18} className="text-slate-500 group-hover:text-white transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] text-white/80 font-light truncate group-hover:text-white transition-colors mb-1">
                        {item.topic || item.rawText.slice(0, 60)}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-slate-600 uppercase tracking-widest font-mono">
                          {item.status === 'archived' ? 'Finalized' : item.status === 'suggested' ? 'Structured' : 'Raw Fragment'}
                        </span>
                        <div className="h-2 w-px bg-white/5" />
                        <span className="text-[9px] text-slate-700 font-mono">ID: {item.id}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <RecommendationDock userId={userId} refreshKey={recRefreshKey} onApplyRecommendation={onApplyRecommendation} onToast={onToast} />
        </section>
      </div>
    </div>
  )
})

export default HomeView
