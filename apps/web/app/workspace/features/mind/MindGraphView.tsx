'use client'

import React, { useRef, useCallback } from 'react'
import { Plus, Minus, Crosshair, ChevronRight, ChevronDown, Brain, Filter } from 'lucide-react'
import type { MindGraphSnapshot } from './types'
import { BG_COLOR } from './mindGraphStyle'
import { useMindGraphInteraction } from './useMindGraphInteraction'
import { useMindCanvasRenderer } from './useMindCanvasRenderer'
import MindFilterPanel from './MindFilterPanel'
import MindScopeCapsule from './MindScopeCapsule'
import MindNodeActionBar from './MindNodeActionBar'

interface MindGraphViewProps {
  snapshot: MindGraphSnapshot
  interaction: ReturnType<typeof useMindGraphInteraction>
  onOpenEditor: (documentId: number) => void
  onSelectNode?: (nodeId: string | null) => void
  onToast: (msg: string) => void
  onNodeDragEnd?: (nodeId: string, x: number, y: number) => void
  activeModule?: string
}

export default function MindGraphView({
  snapshot: originalSnapshot,
  interaction,
  onOpenEditor: _onOpenEditor,
  onSelectNode: _onSelectNode,
  onToast: _onToast,
  onNodeDragEnd,
}: MindGraphViewProps) {
  const { state: ixState, actions: ixActions } = interaction

  // Enriched snapshot for demo/visibility if edges are empty
  const snapshot = React.useMemo(() => {
    if (originalSnapshot.edges.length > 0 || originalSnapshot.nodes.length < 2) return originalSnapshot
    
    // Auto-link some nodes for demo purposes if no links exist
    const root = originalSnapshot.nodes.find(n => n.nodeType === 'root')
    const others = originalSnapshot.nodes.filter(n => n.nodeType !== 'root')
    
    if (!root || others.length < 2) return originalSnapshot
    
    const mockEdges = others.map((n, i) => ({
      id: `mock-edge-${i}`,
      sourceNodeId: root.id,
      targetNodeId: n.id,
      edgeType: i % 2 === 0 ? 'confirmed' : 'suggested',
      strength: 0.8,
      source: 'system',
      confidence: 1,
      reason: 'Auto-linked for demo'
    }))
    
    return { ...originalSnapshot, edges: mockEdges }
  }, [originalSnapshot])

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const handleSelectNode = useCallback((nodeId: string | null) => {
    ixActions.setSelectedNode(nodeId)
    _onSelectNode?.(nodeId)
    
    if (nodeId) {
      ixActions.setFocusedNode(nodeId)
      if (ixState.scope === 'currentChain') {
        const node = snapshot.nodes.find(n => n.id === nodeId)
        if (node && ['root', 'domain', 'project', 'topic'].includes(node.nodeType)) {
          ixActions.setChainRoot(nodeId)
        }
      }
    } else {
      ixActions.clearFocus()
    }
  }, [ixActions, ixState.scope, snapshot.nodes])

  const renderer = useMindCanvasRenderer(
    canvasRef,
    containerRef,
    snapshot,
    ixState.layoutMode,
    ixState.scope,
    ixState.chainRootId,
    ixState.selectedNodeId,
    ixState.hoveredNodeId,
    handleSelectNode,
    ixActions.setHoveredNode,
    onNodeDragEnd,
  )

  return (
    <div className="absolute inset-0 z-0 flex flex-col" style={{ background: BG_COLOR }}>
      {/* Top Bar: Domain 切换 + 面包屑 */}
      <div className="h-[52px] border-b border-white/[0.07] px-5 flex items-center justify-between shrink-0 bg-[#0b0f11]/80 backdrop-blur-md z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[13px] font-medium text-white/90">
            <span className="text-[#8d989f]">Domain</span>
            <ChevronRight className="w-3.5 h-3.5 text-white/10" />
            <div className="flex items-center gap-2 bg-white/5 px-2 py-1 rounded-md border border-white/5 cursor-pointer hover:bg-white/10 transition-colors">
              <Brain className="w-3.5 h-3.5 text-[#86d7ff]" />
              <span>核心业务逻辑</span>
              <ChevronDown className="w-3 h-3 text-[#8d989f]" />
            </div>
          </div>
          
          <div className="h-4 w-px bg-white/10 mx-1"></div>
          
          <div className="flex items-center gap-2 text-[13px] font-medium text-[#8d989f]">
            <span>Project</span>
            <ChevronRight className="w-3.5 h-3.5 text-white/10" />
            <span className="text-white/60">Atlax 架构设计</span>
          </div>
        </div>

        <div className="flex items-center gap-3 relative">
          <button 
            onClick={ixActions.toggleFilterPanel}
            className={`flex items-center gap-2 px-3 h-[32px] rounded-lg text-[12px] font-medium transition-all ${
              ixState.filterOpen 
                ? 'bg-[#86d7ff]/20 text-[#86d7ff] border border-[#86d7ff]/30 shadow-[0_0_15px_rgba(134,215,255,0.2)]' 
                : 'bg-white/5 text-[#8d989f] border border-white/10 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Filter size={14} />
            <span>Filters</span>
          </button>

          {/* Filters dropdown - positioned absolutely relative to this actions container */}
          <div className="absolute top-[40px] right-0 z-30">
            <MindFilterPanel
              filterState={ixState.filterState}
              filterOpen={ixState.filterOpen}
              layoutMode={ixState.layoutMode}
              scope={ixState.scope}
              onToggle={ixActions.toggleFilterPanel}
              onUpdateFilter={ixActions.updateFilter}
              onResetFilters={ixActions.resetFilters}
              actions={ixActions}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {/* Canvas container */}
        <div
          ref={containerRef}
          className="absolute inset-0 overflow-hidden select-none"
          onPointerDown={renderer.handlePointerDown}
          onPointerMove={renderer.handlePointerMove}
          onPointerUp={renderer.handlePointerUp}
          onPointerLeave={renderer.handlePointerUp}
          onWheel={renderer.handleWheel}
          style={{ cursor: 'default', touchAction: 'none' }}
        >
          <canvas ref={canvasRef} className="absolute inset-0" />
        </div>

        {/* Floating Overlays */}
        <MindScopeCapsule 
          snapshot={snapshot} 
          viewScope={ixState.viewScope} 
          onCenter={renderer.centerView}
        />

        <MindNodeActionBar 
          selectedNodeId={ixState.selectedNodeId}
          onConnect={() => _onToast('Connecting...')}
          onMove={() => _onToast('Moving to cluster...')}
          onOpen={() => _onToast('Opening in Dock...')}
          onArchive={() => _onToast('Archiving...')}
          onClose={() => handleSelectNode(null)}
        />

        {/* Zoom controls - bottom right */}
        <div className="absolute bottom-6 right-6 rounded-full p-1.5 flex flex-col gap-1 shadow-2xl z-20 pointer-events-auto"
          style={{ background: 'rgba(15,15,20,0.95)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <button onClick={renderer.zoomIn} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors" title="Zoom In"><Plus size={16} /></button>
          <div className="w-full h-px bg-white/10" />
          <button onClick={renderer.zoomOut} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors" title="Zoom Out"><Minus size={16} /></button>
          <div className="w-full h-px bg-white/10" />
          <button onClick={renderer.centerView} className="p-2 hover:bg-white/10 rounded-full text-white transition-colors" title="Center View"><Crosshair size={16} /></button>
        </div>
      </div>
    </div>
  )
}

