'use client'

import React, { useRef, useState, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Plus, Minus, Crosshair, Network, Loader2, X } from 'lucide-react'
import type { MindGraphSnapshot } from './types'
import { BG_COLOR } from './mindGraphStyle'
import { useMindGraphInteraction } from './useMindGraphInteraction'
import { computeSnapshotSignature } from './mindGraphAdapter'
import MindFilterPanel from './MindFilterPanel'

const MindGraphSigma = dynamic(() => import('./MindGraphSigma'), { ssr: false })

interface MindGraphViewProps {
  snapshot: MindGraphSnapshot
  onOpenEditor: (documentId: number) => void
  onToast: (msg: string) => void
}

export default function MindGraphView({
  snapshot,
  onOpenEditor,
  onToast: _onToast,
}: MindGraphViewProps) {
  const interaction = useMindGraphInteraction()
  const { state: ixState, actions: ixActions } = interaction
  const [nodeCount, setNodeCount] = useState(0)
  const [edgeCount, setEdgeCount] = useState(0)
  const [layoutRunning, setLayoutRunning] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const cameraControlRef = useRef<{ zoomIn: () => void; zoomOut: () => void; centerView: () => void } | null>(null)
  const layoutAppliedRef = useRef(false)

  const snapshotKey = useMemo(() => computeSnapshotSignature(snapshot), [snapshot])

  const handleZoomIn = useCallback(() => { cameraControlRef.current?.zoomIn() }, [])
  const handleZoomOut = useCallback(() => { cameraControlRef.current?.zoomOut() }, [])
  const handleCenterView = useCallback(() => { ixActions.clearFocus(); cameraControlRef.current?.centerView() }, [ixActions])
  const handleCameraControl = useCallback((ctrl: { zoomIn: () => void; zoomOut: () => void; centerView: () => void }) => {
    cameraControlRef.current = ctrl
  }, [])
  const handleCloseDetail = useCallback(() => {
    setSelectedNodeId(null)
  }, [])
  const handleTooltipChange = useCallback((_t: { nodeId: string; nodeType: string; label: string; documentId: number | null; degreeScore: number; x: number; y: number } | null) => {}, [])

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null
    return snapshot.nodes.find(n => n.id === selectedNodeId) ?? null
  }, [selectedNodeId, snapshot.nodes])

  const selectedNodeEdges = useMemo(() => {
    if (!selectedNodeId) return []
    return snapshot.edges.filter(e => e.sourceNodeId === selectedNodeId || e.targetNodeId === selectedNodeId)
  }, [selectedNodeId, snapshot.edges])

  const selectedNodeNeighbors = useMemo(() => {
    if (!selectedNodeId) return []
    const neighborIds = new Set<string>()
    selectedNodeEdges.forEach(e => {
      if (e.sourceNodeId === selectedNodeId) neighborIds.add(e.targetNodeId)
      else neighborIds.add(e.sourceNodeId)
    })
    return snapshot.nodes.filter(n => neighborIds.has(n.id))
  }, [selectedNodeId, selectedNodeEdges, snapshot.nodes])


  const { layoutPhase } = ixState

  return (
    <div className="absolute inset-0 z-0" style={{ background: BG_COLOR }}>
      <MindGraphSigma
        snapshotKey={snapshotKey}
        snapshot={snapshot}
        ixState={ixState}
        ixActions={ixActions}
        onOpenEditor={onOpenEditor}
        onNodeCountChange={setNodeCount}
        onEdgeCountChange={setEdgeCount}
        onLayoutRunningChange={setLayoutRunning}
        onTooltipChange={handleTooltipChange}
        layoutAppliedRef={layoutAppliedRef}
        onCameraControl={handleCameraControl}
      />

      <MindFilterPanel
        filterState={ixState.filterState}
        filterOpen={ixState.filterOpen}
        onToggle={ixActions.toggleFilterPanel}
        onUpdateFilter={ixActions.updateFilter}
        onResetFilters={ixActions.resetFilters}
        actions={ixActions}
      />

      <div className="absolute bottom-24 right-10 rounded-full p-1.5 flex flex-col gap-1 shadow-2xl z-20 pointer-events-auto"
        style={{ background: 'rgba(15,15,20,0.95)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <button onClick={handleZoomIn} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors" title="Zoom In"><Plus size={16} /></button>
        <div className="w-full h-px bg-white/10" />
        <button onClick={handleZoomOut} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors" title="Zoom Out"><Minus size={16} /></button>
        <div className="w-full h-px bg-white/10" />
        <button onClick={handleCenterView} className="p-2 hover:bg-white/10 rounded-full text-white transition-colors" title="Center View"><Crosshair size={16} /></button>
      </div>

      <div className="absolute bottom-4 left-4 rounded-xl px-4 py-2.5 shadow-2xl z-20 pointer-events-auto flex items-center gap-3"
        style={{ background: 'rgba(15,15,20,0.95)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <Network size={14} className="text-[var(--accent)]" />
        <span className="text-xs text-white font-medium">Mind</span>
        <div className="w-px h-4 bg-white/10" />
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-slate-400"><span className="text-white font-mono">{nodeCount}</span> nodes</span>
          <span className="text-slate-400"><span className="text-white font-mono">{edgeCount}</span> edges</span>
        </div>
        {layoutRunning && (
          <>
            <div className="w-px h-4 bg-white/10" />
            <Loader2 size={12} className="animate-spin text-[var(--accent)]" />
            <span className="text-[10px] text-slate-400">
              {layoutPhase === 'forceatlas2' ? 'ForceAtlas2' : layoutPhase === 'noverlap' ? 'Noverlap' : 'Layouting'}...
            </span>
          </>
        )}
      </div>

      {selectedNode && (
        <div className="absolute top-4 right-4 rounded-xl p-4 shadow-2xl z-30 pointer-events-auto w-64"
          style={{ background: 'rgba(15,15,20,0.96)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-300 uppercase tracking-wider">{selectedNode.nodeType}</span>
            <button onClick={handleCloseDetail} className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors">
              <X size={14} />
            </button>
          </div>
          <div className="text-sm text-white font-medium mb-3 truncate">
            {selectedNode.label}
          </div>
          {selectedNode.documentId != null && (
            <div className="text-[10px] text-slate-500 mb-2">
              Document ID: <span className="text-slate-300 font-mono">{selectedNode.documentId}</span>
            </div>
          )}
          <div className="text-[10px] text-slate-500 mb-3">
            Degree: <span className="text-slate-300 font-mono">{selectedNodeEdges.length}</span>
          </div>

          {selectedNodeNeighbors.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] text-slate-500 mb-1.5 uppercase tracking-wider">Neighbors</div>
              <div className="flex flex-wrap gap-1">
                {selectedNodeNeighbors.map(n => (
                  <span key={n.id} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-300 truncate max-w-[200px]">
                    {n.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {selectedNodeEdges.length > 0 && (
            <div>
              <div className="text-[10px] text-slate-500 mb-1.5 uppercase tracking-wider">Edges</div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {selectedNodeEdges.map(edge => {
                  const isSource = edge.sourceNodeId === selectedNodeId
                  const otherId = isSource ? edge.targetNodeId : edge.sourceNodeId
                  const otherNode = snapshot.nodes.find(n => n.id === otherId)
                  return (
                    <div key={edge.id} className="flex items-center justify-between text-[10px] py-1 px-1.5 rounded bg-white/5">
                      <span className="text-slate-300 truncate max-w-[140px]">
                        {otherNode?.label ?? otherId}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
