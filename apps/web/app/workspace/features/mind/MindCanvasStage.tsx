'use client'

import React, { useRef, useEffect } from 'react'
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

const NODE_COLORS: Record<string, string> = {
  root: '#c4b5fd', domain: '#8b5cf6', project: '#8b5cf6', topic: '#a78bfa',
  document: '#6ee7b7', fragment: '#34d399', source: '#10b981', tag: '#f472b6',
  insight: '#fbbf24', question: '#60a5fa', time: '#fb923c',
}

const USE_GRAPH_VIEW = true

export default function MindCanvasStage({
  nodes: storedNodes,
  edges: storedEdges,
  snapshot,
  onOpenEditor,
  onToast,
}: MindCanvasStageProps) {
  if (USE_GRAPH_VIEW && snapshot) {
    return (
      <MindGraphView
        snapshot={snapshot}
        onOpenEditor={onOpenEditor}
        onToast={onToast}
      />
    )
  }

  return (
    <LegacyCanvasFallback storedNodes={storedNodes} storedEdges={storedEdges} />
  )
}

function LegacyCanvasFallback({
  storedNodes,
  storedEdges,
}: {
  storedNodes: StoredMindNode[]
  storedEdges: StoredMindEdge[]
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = '100%'
      canvas.style.height = '100%'
    }
    resize()
    window.addEventListener('resize', resize)

    const graphNodes = storedNodes.map(n => ({
      id: n.id, label: n.label, nodeType: n.nodeType, documentId: n.documentId,
      x: (n.positionX || 0) * 1.5 + window.innerWidth / dpr / 2,
      y: (n.positionY || 0) * 1.5 + window.innerHeight / dpr / 2,
      r: n.nodeType === 'root' ? 8 : n.nodeType === 'domain' || n.nodeType === 'project' ? 5 : 3,
    }))

    const nodeMap = new Map(graphNodes.map(n => [n.id, n]))
    const graphEdges = storedEdges
      .filter(e => nodeMap.has(e.sourceNodeId) && nodeMap.has(e.targetNodeId))
      .map(e => {
        const src = nodeMap.get(e.sourceNodeId)
        const tgt = nodeMap.get(e.targetNodeId)
        if (!src || !tgt) return null
        return { source: src, target: tgt, edgeType: e.edgeType }
      }).filter(Boolean) as { source: { x: number; y: number }; target: { x: number; y: number }; edgeType: string }[]

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.scale(dpr, dpr)

      graphEdges.forEach(e => {
        ctx.beginPath()
        ctx.moveTo(e.source.x, e.source.y)
        ctx.lineTo(e.target.x, e.target.y)
        ctx.strokeStyle = e.edgeType === 'parent_child' ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.08)'
        ctx.lineWidth = 0.8
        ctx.stroke()
      })

      graphNodes.forEach(n => {
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r * 3, 0, Math.PI * 2)
        const c = NODE_COLORS[n.nodeType] || '#a78bfa'
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 3)
        g.addColorStop(0, c + '40')
        g.addColorStop(1, c + '00')
        ctx.fillStyle = g; ctx.fill()

        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fillStyle = c + '80'; ctx.fill()
      })

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [storedNodes, storedEdges])

  return (
    <div className="absolute inset-0 z-0 pointer-events-auto">
      <canvas ref={canvasRef} className="w-full h-full" style={{ background: '#0a0a0f' }} />
      <div className="absolute top-4 left-4 rounded-xl px-4 py-2.5 shadow-2xl z-20 pointer-events-auto flex items-center gap-3"
        style={{ background: 'rgba(15,15,20,0.95)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <Network size={14} className="text-[var(--accent)]" />
        <span className="text-xs text-white font-medium">Mind Graph (Fallback)</span>
        <span className="text-[10px] text-slate-400">{storedNodes.length} nodes</span>
      </div>
    </div>
  )
}
