'use client'

import { useRef, useCallback, useState, useMemo, useEffect } from 'react'
import { Plus, Minus, Crosshair, ChevronRight, ChevronDown, Brain, Filter, Check } from 'lucide-react'
import type { MindGraphSnapshot } from './types'
import type { MindScopeType } from './useMindGraphInteraction'
import { BG_COLOR } from './mindGraphStyle'
import { useMindGraphInteraction } from './useMindGraphInteraction'
import { useMindCanvasRenderer } from './useMindCanvasRenderer'
import MindFilterPanel from './MindFilterPanel'
import MindScopeCapsule from './MindScopeCapsule'
import MindNodeActionBar from './MindNodeActionBar'
import MindNodeHoverCard from './MindNodeHoverCard'

const HOVER_LEAVE_DELAY = 150

const SCOPE_LABEL_MAP: Record<MindScopeType, string> = {
  global: '全局',
  domain: '领域',
  project: '项目',
  collection: '集合',
  tag: '标签',
  focusedNode: '聚焦节点',
}

interface MindGraphViewProps {
  snapshot: MindGraphSnapshot
  interaction: ReturnType<typeof useMindGraphInteraction>
  onOpenEditor: (documentId: number, sourceType: 'draft' | 'document') => void
  onSelectNode?: (nodeId: string | null) => void
  onToast: (msg: string) => void
  onNodeDragEnd?: (nodeId: string, x: number, y: number) => void
  onDeleteEdge?: (edgeId: string) => void
  onCreateEdge?: (sourceNodeId: string, targetNodeId: string) => Promise<{ success: boolean; error?: string }>
  onArchiveNode?: (nodeId: string) => Promise<{ success: boolean; error?: string }>
  onRestoreNode?: (nodeId: string) => Promise<{ success: boolean; error?: string }>
  onChangeParent?: (childNodeId: string, newParentNodeId: string) => Promise<{ success: boolean; error?: string }>
  onSuggest?: () => void
  activeModule?: string
  hiddenNodes?: { id: string; label: string; nodeType: string }[]
}

export default function MindGraphView({
  snapshot: originalSnapshot,
  interaction,
  onOpenEditor: _onOpenEditor,
  onSelectNode: _onSelectNode,
  onToast: _onToast,
  onNodeDragEnd,
  onDeleteEdge,
  onCreateEdge,
  onArchiveNode,
  onRestoreNode,
  onChangeParent,
  onSuggest,
  activeModule: _activeModule,
  hiddenNodes,
}: MindGraphViewProps) {
  const { state: ixState, actions: ixActions } = interaction

  const snapshot = originalSnapshot

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hoverLeaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hoverCardActive, setHoverCardActive] = useState(false)
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false)
  const scopeMenuRef = useRef<HTMLDivElement>(null)

  const scopeOptions = useMemo(() => {
    const domainNodes = snapshot.nodes.filter(n => n.nodeType === 'domain')
    const projectNodes = snapshot.nodes.filter(n => n.nodeType === 'project')
    const topicNodes = snapshot.nodes.filter(n => n.nodeType === 'topic')
    const tagNodes = snapshot.nodes.filter(n => n.nodeType === 'tag')
    const options: { type: MindScopeType; targetId: string | null; label: string }[] = [
      { type: 'global', targetId: null, label: '全局图谱' },
    ]
    domainNodes.forEach(n => options.push({ type: 'domain', targetId: n.id, label: n.label }))
    projectNodes.forEach(n => options.push({ type: 'project', targetId: n.id, label: n.label }))
    if (topicNodes.length > 0) {
      topicNodes.forEach(n => options.push({ type: 'collection', targetId: n.id, label: n.label }))
    }
    tagNodes.forEach(n => options.push({ type: 'tag', targetId: n.id, label: n.label }))
    options.push({ type: 'focusedNode', targetId: null, label: '聚焦节点' })
    return options
  }, [snapshot.nodes])

  const handleHoverNode = useCallback((nodeId: string | null) => {
    if (hoverLeaveTimeoutRef.current) {
      clearTimeout(hoverLeaveTimeoutRef.current)
      hoverLeaveTimeoutRef.current = null
    }
    if (nodeId) {
      ixActions.setHoveredNode(nodeId)
    } else {
      hoverLeaveTimeoutRef.current = setTimeout(() => {
        if (!hoverCardActive) {
          ixActions.setHoveredNode(null)
        }
        hoverLeaveTimeoutRef.current = null
      }, HOVER_LEAVE_DELAY)
    }
  }, [ixActions, hoverCardActive])

  const handleHoverCardEnter = useCallback(() => {
    if (hoverLeaveTimeoutRef.current) {
      clearTimeout(hoverLeaveTimeoutRef.current)
      hoverLeaveTimeoutRef.current = null
    }
    setHoverCardActive(true)
  }, [])

  const handleHoverCardLeave = useCallback(() => {
    setHoverCardActive(false)
    ixActions.setHoveredNode(null)
  }, [ixActions])

  useEffect(() => {
    if (!scopeMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (scopeMenuRef.current && !scopeMenuRef.current.contains(e.target as Node)) setScopeMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [scopeMenuOpen])

  useEffect(() => {
    if (ixState.filterOpen && ixState.connectMode) {
      ixActions.exitConnectMode()
    }
    if (ixState.filterOpen && ixState.changeParentMode) {
      ixActions.exitChangeParentMode()
    }
  }, [ixState.filterOpen, ixState.connectMode, ixState.changeParentMode, ixActions])

  const handleSelectNode = useCallback((nodeId: string | null) => {
    if (ixState.connectMode && nodeId && ixState.connectSourceId && onCreateEdge) {
      onCreateEdge(ixState.connectSourceId, nodeId).then((result) => {
        if (result.success) {
          _onToast('链接创建成功')
        } else {
          _onToast(result.error || '创建链接失败')
        }
      })
      ixActions.exitConnectMode()
      return
    }

    if (ixState.changeParentMode && nodeId && ixState.changeParentSourceId && onChangeParent) {
      onChangeParent(ixState.changeParentSourceId, nodeId).then((result) => {
        if (result.success) {
          _onToast('父节点迁移成功')
        } else {
          _onToast(result.error || '父节点迁移失败')
        }
      })
      ixActions.exitChangeParentMode()
      return
    }

    ixActions.setSelectedNode(nodeId)
    _onSelectNode?.(nodeId)
    
    if (nodeId) {
      ixActions.setFocusedNode(nodeId)
      if (ixState.scope === 'focusedNode') {
        const node = snapshot.nodes.find(n => n.id === nodeId)
        if (node && ['root', 'domain', 'project', 'topic'].includes(node.nodeType)) {
          ixActions.setChainRoot(nodeId)
        }
      }
    } else {
      ixActions.clearFocus()
    }
  }, [ixActions, ixState.connectMode, ixState.connectSourceId, ixState.changeParentMode, ixState.changeParentSourceId, ixState.scope, snapshot.nodes, onCreateEdge, onChangeParent, _onSelectNode, _onToast])

  const renderer = useMindCanvasRenderer(
    canvasRef,
    containerRef,
    snapshot,
    ixState.layoutMode,
    ixState.scope,
    ixState.scopeTargetId,
    ixState.filterState,
    ixState.selectedNodeId,
    ixState.hoveredNodeId,
    handleSelectNode,
    handleHoverNode,
    onNodeDragEnd,
    onCreateEdge,
    ixState.viewScope,
  )

  const filteredCounts = useMemo(() => {
    const nodeCount = renderer.nodeCount
    const edgeCount = renderer.edgeCount
    const suggestionCount = renderer.suggestionCount
    const isolatedCount = renderer.isolatedCount
    return { nodeCount, edgeCount, suggestionCount, isolatedCount }
  }, [renderer.nodeCount, renderer.edgeCount, renderer.suggestionCount, renderer.isolatedCount])

  const showActionBar = !ixState.filterOpen
  const showZoomControls = !ixState.filterOpen

  return (
    <div className="absolute inset-0 z-0 flex flex-col" style={{ background: BG_COLOR }}>
      <div className="h-[52px] border-b border-white/[0.07] px-5 flex items-center justify-between shrink-0 bg-[#0b0f11]/80 backdrop-blur-md z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[13px] font-medium text-white/90" ref={scopeMenuRef}>
            {(() => {
              const scopeLabel = SCOPE_LABEL_MAP[ixState.scope]
              const targetNode = ixState.scopeTargetId
                ? snapshot.nodes.find(n => n.id === ixState.scopeTargetId)
                : null
              const targetLabel = targetNode?.label ?? (ixState.scope !== 'global' ? '空' : undefined)

              return (
                <>
                  <span className="text-[#8d989f]">{scopeLabel}</span>
                  {targetLabel != null && (
                    <>
                      <ChevronRight className="w-3.5 h-3.5 text-white/10" />
                      <div className="flex items-center gap-2 bg-white/5 px-2 py-1 rounded-md border border-white/5 cursor-pointer hover:bg-white/10 transition-colors"
                        onClick={() => setScopeMenuOpen(prev => !prev)}
                      >
                        <Brain className="w-3.5 h-3.5 text-[#86d7ff]" />
                        <span>{targetLabel}</span>
                        <ChevronDown className={`w-3 h-3 text-[#8d989f] transition-transform ${scopeMenuOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </>
                  )}
                  {ixState.scope === 'global' && (
                    <div className="flex items-center gap-2 bg-white/5 px-2 py-1 rounded-md border border-white/5 cursor-pointer hover:bg-white/10 transition-colors"
                      onClick={() => setScopeMenuOpen(prev => !prev)}
                    >
                      <Brain className="w-3.5 h-3.5 text-[#86d7ff]" />
                      <span>全部节点</span>
                      <ChevronDown className={`w-3 h-3 text-[#8d989f] transition-transform ${scopeMenuOpen ? 'rotate-180' : ''}`} />
                    </div>
                  )}
                  {scopeMenuOpen && (
                    <div className="absolute top-full left-0 mt-1 py-1.5 rounded-xl bg-[#0f1214] border border-white/10 shadow-xl z-50 min-w-[200px] max-h-[60vh] overflow-y-auto custom-scrollbar">
                      {scopeOptions.map(opt => {
                        const isActive = ixState.scope === opt.type && ixState.scopeTargetId === opt.targetId
                        return (
                          <button
                            key={`${opt.type}-${opt.targetId ?? 'none'}`}
                            onClick={() => {
                              ixActions.setScope(opt.type)
                              ixActions.setScopeTarget(opt.targetId)
                              if (opt.type === 'focusedNode' && opt.targetId) {
                                ixActions.setChainRoot(opt.targetId)
                              } else {
                                ixActions.setChainRoot(null)
                              }
                              setScopeMenuOpen(false)
                            }}
                            className="w-full flex items-center justify-between px-3 py-2 text-[11px] hover:bg-white/5 transition-colors"
                          >
                            <span className={isActive ? 'text-[#86d7ff] font-bold' : 'text-[#8d989f]'}>{opt.label}</span>
                            {isActive && <Check size={12} className="text-[#86d7ff]" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </>
              )
            })()}
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
            <span>筛选</span>
          </button>

          <div className="absolute top-[40px] right-0 z-30">
            <MindFilterPanel
              filterState={ixState.filterState}
              filterOpen={ixState.filterOpen}
              layoutMode={ixState.layoutMode}
              scope={ixState.scope}
              scopeTargetId={ixState.scopeTargetId}
              snapshot={snapshot}
              onToggle={ixActions.toggleFilterPanel}
              onUpdateFilter={ixActions.updateFilter}
              onResetFilters={ixActions.resetFilters}
              actions={ixActions}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <div
          ref={containerRef}
          className="absolute inset-0 overflow-hidden select-none"
          onPointerDown={renderer.handlePointerDown}
          onPointerMove={renderer.handlePointerMove}
          onPointerUp={renderer.handlePointerUp}
          onPointerLeave={renderer.handlePointerUp}
          style={{ cursor: 'default', touchAction: 'none' }}
        >
          <canvas ref={canvasRef} className="absolute inset-0" />
        </div>

        <MindScopeCapsule 
          filteredCounts={filteredCounts}
          viewScope={ixState.viewScope}
          hiddenNodes={hiddenNodes}
          onCenter={renderer.centerView}
          onSuggest={onSuggest}
          onRestoreNode={(nodeId) => {
            if (onRestoreNode) {
              onRestoreNode(nodeId).then((result) => {
                if (result.success) {
                  _onToast('节点已恢复到图谱')
                } else {
                  _onToast(result.error || '恢复失败')
                }
              })
            }
          }}
        />

        {showActionBar && (
          <MindNodeActionBar 
            selectedNodeId={ixState.selectedNodeId}
            selectedNodeIsRoot={ixState.selectedNodeId ? snapshot.nodes.find(n => n.id === ixState.selectedNodeId)?.nodeType === 'root' : false}
            connectMode={ixState.connectMode}
            changeParentMode={ixState.changeParentMode}
            onConnect={() => {
              if (ixState.selectedNodeId) {
                ixActions.enterConnectMode(ixState.selectedNodeId)
              }
            }}
            onMoveParent={() => {
              if (ixState.selectedNodeId) {
                ixActions.enterChangeParentMode(ixState.selectedNodeId)
              }
            }}
            onOpen={() => {
              if (ixState.selectedNodeId) {
                const node = snapshot.nodes.find(n => n.id === ixState.selectedNodeId)
                if (node?.documentId != null) {
                  const sourceType = (node.metadata?.sourceType as 'draft' | 'document') ?? 'document'
                  _onOpenEditor(node.documentId, sourceType)
                } else {
                  _onToast('此节点暂无关联文档')
                }
              }
            }}
            onArchive={() => {
              if (ixState.selectedNodeId && onArchiveNode) {
                onArchiveNode(ixState.selectedNodeId).then((result) => {
                  if (result.success) {
                    _onToast('节点已从图谱隐藏')
                    ixActions.setSelectedNode(null)
                  } else {
                    _onToast(result.error || '隐藏失败')
                  }
                })
              }
            }}
            onClose={() => {
              if (ixState.connectMode) {
                ixActions.exitConnectMode()
              } else if (ixState.changeParentMode) {
                ixActions.exitChangeParentMode()
              } else {
                handleSelectNode(null)
              }
            }}
            onCancelConnect={() => ixActions.exitConnectMode()}
            onCancelChangeParent={() => ixActions.exitChangeParentMode()}
          />
        )}

        {ixState.hoveredNodeId && renderer.hoverScreenPos && onDeleteEdge && (
          <MindNodeHoverCard
            nodeId={ixState.hoveredNodeId}
            snapshot={snapshot}
            screenPos={renderer.hoverScreenPos}
            onUnlinkEdge={onDeleteEdge}
            onMouseEnter={handleHoverCardEnter}
            onMouseLeave={handleHoverCardLeave}
          />
        )}

        {showZoomControls && (
          <div className="absolute bottom-6 right-6 rounded-full p-1.5 flex flex-col gap-1 shadow-2xl z-20 pointer-events-auto"
            style={{ background: 'rgba(15,15,20,0.95)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <button onClick={renderer.zoomIn} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors" title="放大"><Plus size={16} /></button>
            <div className="w-full h-px bg-white/10" />
            <button onClick={renderer.zoomOut} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors" title="缩小"><Minus size={16} /></button>
            <div className="w-full h-px bg-white/10" />
            <button onClick={renderer.centerView} className="p-2 hover:bg-white/10 rounded-full text-white transition-colors" title="居中视图"><Crosshair size={16} /></button>
          </div>
        )}
      </div>
    </div>
  )
}
