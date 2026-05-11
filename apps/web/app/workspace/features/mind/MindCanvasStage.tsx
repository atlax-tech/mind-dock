'use client'

import React from 'react'
import { Network } from 'lucide-react'
import type { StoredMindNode, StoredMindEdge } from '@/lib/repository'
import type { MindGraphSnapshot } from './types'
import MindGraphView from './MindGraphView'
import { useMindGraphInteraction } from './useMindGraphInteraction'

interface MindCanvasStageProps {
  nodes: StoredMindNode[]
  edges: StoredMindEdge[]
  snapshot?: MindGraphSnapshot | null
  interaction: ReturnType<typeof useMindGraphInteraction>
  loading?: boolean
  onOpenEditor: (id: number, sourceType: 'draft' | 'document') => void
  onSelectNode?: (id: string | null) => void
  onOpenInDock?: (dockItemId: number) => void
  onToast: (msg: string) => void
  onNodeDragEnd?: (nodeId: string, x: number, y: number) => void
  onDeleteEdge?: (edgeId: string) => void
  onCreateEdge?: (sourceNodeId: string, targetNodeId: string) => Promise<{ success: boolean; error?: string }>
  activeModule?: string
}

export default function MindCanvasStage({
  nodes: _storedNodes,
  edges: _storedEdges,
  snapshot,
  interaction,
  loading,
  onOpenEditor,
  onSelectNode,
  onToast,
  onNodeDragEnd,
  onDeleteEdge,
  onCreateEdge,
  activeModule,
}: MindCanvasStageProps) {
  if (loading) {
    return (
      <div className="absolute inset-0 z-0 flex items-center justify-center" style={{ background: '#0a0a0f' }}>
        <div className="flex flex-col items-center gap-3">
          <Network size={24} className="text-[var(--accent)] animate-pulse" />
          <span className="text-xs text-slate-400">Loading Mind Graph…</span>
        </div>
      </div>
    )
  }

  if (snapshot && snapshot.nodes.length === 0) {
    return (
      <div className="absolute inset-0 z-0 flex items-center justify-center" style={{ background: '#0a0a0f' }}>
        <div className="flex flex-col items-center gap-4 max-w-[320px] text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center">
            <Network className="w-6 h-6 text-slate-500" />
          </div>
          <div>
            <h3 className="text-base font-medium text-white mb-1.5">暂无思维节点</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              发布文档或整理内容后，思维图谱将自动呈现节点与关联。你可以在 Dock 中归档内容，它们会逐渐出现在这里。
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (snapshot) {
    return (
      <MindGraphView
        snapshot={snapshot}
        interaction={interaction}
        onOpenEditor={onOpenEditor}
        onSelectNode={onSelectNode}
        onToast={onToast}
        onNodeDragEnd={onNodeDragEnd}
        onDeleteEdge={onDeleteEdge}
        onCreateEdge={onCreateEdge}
        activeModule={activeModule}
      />
    )
  }

  return (
    <div className="absolute inset-0 z-0 flex items-center justify-center" style={{ background: '#0a0a0f' }}>
      <div className="flex flex-col items-center gap-3">
        <Network size={24} className="text-[var(--accent)] animate-pulse" />
        <span className="text-xs text-slate-400">Loading Mind Graph…</span>
      </div>
    </div>
  )
}
