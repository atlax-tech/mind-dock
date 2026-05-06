'use client'

import React from 'react'
import { Network } from 'lucide-react'
import type { StoredMindNode, StoredMindEdge } from '@/lib/repository'
import type { MindGraphSnapshot } from './types'
import MindGraphView from './MindGraphView'

interface MindCanvasStageProps {
  nodes: StoredMindNode[]
  edges: StoredMindEdge[]
  snapshot?: MindGraphSnapshot | null
  onOpenEditor: (id: number) => void
  onOpenInDock?: (dockItemId: number) => void
  onToast: (msg: string) => void
  activeModule?: string
}

export default function MindCanvasStage({
  nodes: _storedNodes,
  edges: _storedEdges,
  snapshot,
  onOpenEditor,
  onToast,
  activeModule,
}: MindCanvasStageProps) {
  if (snapshot) {
    return (
      <MindGraphView
        snapshot={snapshot}
        onOpenEditor={onOpenEditor}
        onToast={onToast}
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
