'use client'

import React, { useEffect, useRef, useCallback } from 'react'
import { SigmaContainer, useLoadGraph, useRegisterEvents, useSigma } from '@react-sigma/core'
import '@react-sigma/core/lib/style.css'
import type { MindGraphSnapshot } from './types'
import type { MindNodeType, MindEdgeType } from '@atlax/domain'
import { snapshotToGraphology, precomputeAdjacency, computeSnapshotSignature, type GraphNodeAttributes, type GraphEdgeAttributes } from './mindGraphAdapter'
import {

  getNodeColor,
  getEdgeStyle,
  shouldShowLabel,
  HOVER_HIGHLIGHT_COLOR,
  HOVER_NEIGHBOR_COLOR,
  DIM_OPACITY,
  DIM_EDGE_OPACITY,
  BG_COLOR,
} from './mindGraphStyle'
import type { MindInteractionState, MindInteractionActions } from './useMindGraphInteraction'

interface TooltipData {
  nodeId: string
  nodeType: string
  label: string
  documentId: number | null
  degreeScore: number
  x: number
  y: number
}

const DOCUMENT_LIKE_TYPES = new Set(['document', 'source', 'fragment'])

interface MindGraphSigmaProps {
  snapshotKey: string
  snapshot: MindGraphSnapshot
  ixState: MindInteractionState
  ixActions: MindInteractionActions
  onOpenEditor: (documentId: number) => void
  onNodeCountChange: (n: number) => void
  onEdgeCountChange: (n: number) => void
  onLayoutRunningChange?: (r: boolean) => void
  onTooltipChange: (t: TooltipData | null) => void
  layoutAppliedRef: React.MutableRefObject<boolean>
  onCameraControl: (ctrl: { zoomIn: () => void; zoomOut: () => void; centerView: () => void }) => void
  onNodeDragEnd?: (nodeId: string, x: number, y: number) => void
  activeModule?: string
}

export default function MindGraphSigma(props: MindGraphSigmaProps) {
  return (
    <SigmaContainer
      style={{ width: '100%', height: '100%', background: BG_COLOR }}
      settings={{
        defaultNodeColor: '#a78bfa',
        defaultEdgeColor: 'rgba(255,255,255,0.1)',
        labelColor: { color: '#E2E8F0' },
        labelFont: 'Inter, sans-serif',
        labelSize: 10,
        labelRenderedSizeThreshold: 5,
        edgeLabelSize: 7,
        edgeLabelFont: 'Inter, sans-serif',
        edgeLabelColor: { color: '#8B8B8B' },
        defaultEdgeType: 'line',
        labelDensity: 0.04,
        labelGridCellSize: 60,
        renderEdgeLabels: false,
        enableEdgeEvents: true,
        zIndex: true,
        minCameraRatio: 0.25,
        maxCameraRatio: 3.33,
      }}
    >
      <canvas id="magnetic-layer" className="absolute inset-0 pointer-events-none z-10" />
      <MindGraphInner {...props} />
    </SigmaContainer>
  )
}

function MindGraphInner({
  snapshotKey, snapshot, ixState, ixActions,
  onOpenEditor, onNodeCountChange, onEdgeCountChange,
  onLayoutRunningChange: _onLayoutRunningChange, onTooltipChange, layoutAppliedRef, onCameraControl,
  onNodeDragEnd, activeModule,
}: MindGraphSigmaProps) {
  const loadGraph = useLoadGraph()
  const registerEvents = useRegisterEvents()
  const sigma = useSigma()
  const graphRef = useRef<import('graphology').default<GraphNodeAttributes, GraphEdgeAttributes> | null>(null)
  const adjacencyRef = useRef<{ neighborMap: Map<string, Set<string>>; incidentEdgesMap: Map<string, Set<string>> } | null>(null)
  const prevSnapshotKeyRef = useRef<string>('')
  const hoverStateRef = useRef<{ hoveredNodeId: string | null; focusedNodeId: string | null }>({ hoveredNodeId: null, focusedNodeId: null })

  const layoutModeRef = useRef(ixState.layoutMode)
  layoutModeRef.current = ixState.layoutMode

  const physicsRef = useRef({
    velocities: new Map<string, { vx: number; vy: number }>(),
    targets: new Map<string, { x: number; y: number }>(),
    grabbedNode: null as string | null,
    dragPos: { x: 0, y: 0 },
    animationFrameId: 0,
    lastMode: '',
  })

  const fitGraph = useCallback((animated: boolean = true) => {
    const graph = graphRef.current
    if (!graph || graph.order === 0) return

    const container = sigma.getContainer()
    const rect = container.getBoundingClientRect()
    let targetRatio = 1
    if (rect.width < 800) targetRatio = 1 / 0.8

    const cx = rect.width / 2
    const cy = rect.height / 2

    const cam = sigma.getCamera()
    if (animated) {
      cam.animate({ x: cx, y: cy, ratio: targetRatio, angle: 0 }, { duration: 600 })
    } else {
      cam.setState({ x: cx, y: cy, ratio: targetRatio, angle: 0 })
    }
  }, [sigma])

  const doZoomIn = useCallback(() => {
    const state = sigma.getCamera().getState()
    sigma.getCamera().animate({ ...state, ratio: state.ratio / 1.4 }, { duration: 250 })
  }, [sigma])

  const doZoomOut = useCallback(() => {
    const state = sigma.getCamera().getState()
    sigma.getCamera().animate({ ...state, ratio: state.ratio * 1.4 }, { duration: 250 })
  }, [sigma])

  useEffect(() => {
    onCameraControl({ zoomIn: doZoomIn, zoomOut: doZoomOut, centerView: () => fitGraph(true) })
  }, [onCameraControl, doZoomIn, doZoomOut, fitGraph])

  const prevActiveRef = useRef<string>('')
  useEffect(() => {
    if (activeModule === 'mind' && prevActiveRef.current !== 'mind') {
      const timer = setTimeout(() => {
        sigma.resize()
        sigma.refresh()
        fitGraph(true)
      }, 120)
      prevActiveRef.current = activeModule ?? ''
      return () => clearTimeout(timer)
    }
    prevActiveRef.current = activeModule ?? ''
  }, [activeModule, sigma, fitGraph])

  // Graph load / refresh lifecycle
  useEffect(() => {
    const sig = computeSnapshotSignature(snapshot)
    const isNewSnapshot = prevSnapshotKeyRef.current !== sig
    prevSnapshotKeyRef.current = sig

    if (isNewSnapshot) {
      layoutAppliedRef.current = false
      ixActions.setHoveredNode(null)
      ixActions.clearFocus()
      onTooltipChange(null)
    }

    const gs = snapshotToGraphology(snapshot)

    try {
      loadGraph(gs.graph)
    } catch (e) {
      console.warn('MindGraphSigma: loadGraph failed', e)
    }

    graphRef.current = gs.graph
    adjacencyRef.current = precomputeAdjacency(gs.graph)
    onNodeCountChange(gs.nodeCount)
    onEdgeCountChange(gs.edgeCount)

    sigma.refresh()
    requestAnimationFrame(() => fitGraph(false))

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotKey])

  // Custom Physics Loop
  useEffect(() => {
    const tick = (time: number) => {
      const phys = physicsRef.current
      const graph = graphRef.current
      if (!graph || graph.order === 0) {
        phys.animationFrameId = requestAnimationFrame(tick)
        return
      }
      
      const container = sigma.getContainer()
      const rect = container.getBoundingClientRect()
      const cx = rect.width / 2
      const cy = rect.height / 2
      
      const mode = layoutModeRef.current
      const nodes = graph.nodes()

      if (mode !== phys.lastMode) {
        phys.lastMode = mode
        phys.targets.clear()
        if (mode === 'radial') {
          const domains = nodes.filter(n => ['domain', 'root'].includes(graph.getNodeAttribute(n, 'nodeType') as string))
          const others = nodes.filter(n => !['domain', 'root'].includes(graph.getNodeAttribute(n, 'nodeType') as string))
          domains.forEach((n, i) => {
            const theta = (i / domains.length) * 2 * Math.PI
            phys.targets.set(n, { x: cx + 200 * Math.cos(theta), y: cy + 200 * Math.sin(theta) })
          })
          others.forEach((n, i) => {
            const theta = (i / Math.max(1, others.length)) * 2 * Math.PI
            phys.targets.set(n, { x: cx + 280 * Math.cos(theta), y: cy + 280 * Math.sin(theta) })
          })
        } else if (mode === 'orbit') {
          const orbits = 4
          const nodesPerOrbit = Math.ceil(nodes.length / orbits)
          nodes.forEach((n, i) => {
            const orbitIdx = Math.floor(i / nodesPerOrbit)
            const idxInOrbit = i % nodesPerOrbit
            const R_i = 150 + (orbitIdx * 50)
            const theta = (idxInOrbit / Math.max(1, nodesPerOrbit)) * 2 * Math.PI + (orbitIdx * 0.5)
            phys.targets.set(n, { x: cx + R_i * Math.cos(theta), y: cy + R_i * Math.sin(theta) })
          })
        }
      }

      const positions = new Map<string, {x: number, y: number}>()
      nodes.forEach(n => positions.set(n, { x: graph.getNodeAttribute(n, 'x') as number, y: graph.getNodeAttribute(n, 'y') as number }))

      if (mode === 'force') {
        // N^2 Repulsion + Gravity
        nodes.forEach(n => {
          if (n === phys.grabbedNode) return
          let vx = phys.velocities.get(n)?.vx || 0
          let vy = phys.velocities.get(n)?.vy || 0
          let fx = 0, fy = 0
          
          nodes.forEach(n2 => {
            if (n === n2) return
            const p1 = positions.get(n) || { x: 0, y: 0 }
            const p2 = positions.get(n2) || { x: 0, y: 0 }
            let dx = p1.x - p2.x
            let dy = p1.y - p2.y
            let dSq = dx*dx + dy*dy
            if (dSq === 0) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dSq = dx*dx + dy*dy; }
            if (dSq < 100000) {
              const d = Math.sqrt(dSq)
              const force = 60 / dSq
              fx += (dx / d) * force
              fy += (dy / d) * force
            }
          })
          
          const p = positions.get(n) || { x: 0, y: 0 }
          const dxC = cx - p.x
          const dyC = cy - p.y
          const dC = Math.hypot(dxC, dyC)
          if (dC > 0) {
            fx += (dxC / dC) * 0.05
            fy += (dyC / dC) * 0.05
          }
          
          vx += fx
          vy += fy
          phys.velocities.set(n, { vx, vy })
        })

        // Edge Attraction
        graph.forEachEdge((edge, attrs, source, target) => {
          if (source === phys.grabbedNode && target === phys.grabbedNode) return
          const p1 = positions.get(source) || { x: 0, y: 0 }
          const p2 = positions.get(target) || { x: 0, y: 0 }
          const dx = p2.x - p1.x
          const dy = p2.y - p1.y
          const d = Math.hypot(dx, dy)
          if (d > 0) {
            const f = (d - 60) * 0.003
            const fx = (dx / d) * f
            const fy = (dy / d) * f
            
            if (source !== phys.grabbedNode) {
              const v = phys.velocities.get(source) || { vx: 0, vy: 0 }
              v.vx += fx; v.vy += fy
            }
            if (target !== phys.grabbedNode) {
              const v = phys.velocities.get(target) || { vx: 0, vy: 0 }
              v.vx -= fx; v.vy -= fy
            }
          }
        })

        // Integration
        nodes.forEach(n => {
          if (n === phys.grabbedNode) {
            graph.setNodeAttribute(n, 'x', phys.dragPos.x)
            graph.setNodeAttribute(n, 'y', phys.dragPos.y)
            return
          }
          const v = phys.velocities.get(n) || { vx: 0, vy: 0 }
          v.vx *= 0.8
          v.vy *= 0.8
          const p = positions.get(n) || { x: 0, y: 0 }
          graph.setNodeAttribute(n, 'x', p.x + v.vx)
          graph.setNodeAttribute(n, 'y', p.y + v.vy)
        })
      } else {
        // Lerp to targets for Radial and Orbit
        nodes.forEach(n => {
          if (n === phys.grabbedNode) {
            graph.setNodeAttribute(n, 'x', phys.dragPos.x)
            graph.setNodeAttribute(n, 'y', phys.dragPos.y)
            return
          }
          const p = positions.get(n) || { x: 0, y: 0 }
          const target = phys.targets.get(n) || p
          graph.setNodeAttribute(n, 'x', p.x + (target.x - p.x) * 0.1)
          graph.setNodeAttribute(n, 'y', p.y + (target.y - p.y) * 0.1)
        })
      }

      // Magnetic Snap Overlay
      const magneticCanvas = document.getElementById('magnetic-layer') as HTMLCanvasElement
      if (magneticCanvas) {
        if (magneticCanvas.width !== rect.width || magneticCanvas.height !== rect.height) {
           magneticCanvas.width = rect.width
           magneticCanvas.height = rect.height
        }
        const ctx = magneticCanvas.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, rect.width, rect.height)
          if (phys.grabbedNode) {
             const grabbedNode = phys.grabbedNode
             const p1 = { x: graph.getNodeAttribute(grabbedNode, 'x') as number, y: graph.getNodeAttribute(grabbedNode, 'y') as number }
             let closestNode: string | null = null
             let minD = Infinity
             
             graph.forEachNode(n => {
               if (n === grabbedNode) return
               const p2 = { x: graph.getNodeAttribute(n, 'x') as number, y: graph.getNodeAttribute(n, 'y') as number }
               const d = Math.hypot(p2.x - p1.x, p2.y - p1.y)
               if (d < 60 && d < minD) {
                 minD = d
                 closestNode = n
               }
             })
             
             if (closestNode) {
                const p2 = { x: graph.getNodeAttribute(closestNode, 'x') as number, y: graph.getNodeAttribute(closestNode, 'y') as number }
                const v1 = sigma.graphToViewport(p1)
                const v2 = sigma.graphToViewport(p2)
                
                ctx.beginPath()
                ctx.moveTo(v1.x, v1.y)
                ctx.lineTo(v2.x, v2.y)
                ctx.strokeStyle = 'rgba(255,255,255,0.8)'
                ctx.lineWidth = 2
                ctx.setLineDash([5, 5])
                ctx.lineDashOffset = -time / 20
                ctx.stroke()
                
                ctx.beginPath()
                ctx.arc(v2.x, v2.y, 25 + Math.sin(time / 150) * 5, 0, Math.PI * 2)
                ctx.fillStyle = 'rgba(255,255,255,0.2)'
                ctx.fill()
             }
          }
        }
      }

      sigma.refresh()
      phys.animationFrameId = requestAnimationFrame(tick)
    }

    const frameId = requestAnimationFrame(tick)
    physicsRef.current.animationFrameId = frameId
    return () => cancelAnimationFrame(frameId)
  }, [sigma])

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      const phys = physicsRef.current
      if (phys.grabbedNode) {
        const rect = sigma.getContainer().getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        phys.dragPos = sigma.viewportToGraph({ x, y })
      }
    }
    
    const handleGlobalMouseUp = () => {
      const phys = physicsRef.current
      if (phys.grabbedNode) {
        phys.grabbedNode = null
        sigma.getCamera().enable()
      }
    }

    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [sigma])

  // Relayout effect
  useEffect(() => {
    if (ixState.relayoutCounter <= 0) return
    const graph = graphRef.current
    if (!graph) return
    
    // Add some random energy to nodes to re-trigger force layout
    if (ixState.layoutMode === 'force') {
      const phys = physicsRef.current
      graph.forEachNode(n => {
        phys.velocities.set(n, {
          vx: (Math.random() - 0.5) * 50,
          vy: (Math.random() - 0.5) * 50,
        })
      })
    }
  }, [ixState.relayoutCounter, ixState.layoutMode])


  // Reducer-based appearance application
  const applyAppearance = useCallback(() => {
    const graph = graphRef.current
    if (!graph) return
    const adj = adjacencyRef.current
    if (!adj) return

    const { hoveredNodeId, focusedNodeId, filterState } = ixState
    hoverStateRef.current = { hoveredNodeId, focusedNodeId }
    const searchLower = filterState.search.trim().toLowerCase()

    const highlighted = new Set<string>()
    const highlightedEdges = new Set<string>()

    if (hoveredNodeId && graph.hasNode(hoveredNodeId)) {
      highlighted.add(hoveredNodeId)
      adj.neighborMap.get(hoveredNodeId)?.forEach(n => highlighted.add(n))
      adj.incidentEdgesMap.get(hoveredNodeId)?.forEach(e => highlightedEdges.add(e))
    }
    if (focusedNodeId && graph.hasNode(focusedNodeId)) {
      highlighted.add(focusedNodeId)
      adj.neighborMap.get(focusedNodeId)?.forEach(n => highlighted.add(n))
      adj.incidentEdgesMap.get(focusedNodeId)?.forEach(e => highlightedEdges.add(e))
    }

    const hasHighlight = highlighted.size > 0

    const orphanIds = new Set<string>()
    if (!filterState.showOrphans && adj) {
      graph.forEachNode((nid) => {
        const deg = adj.neighborMap.get(nid)
        if (!deg || deg.size === 0) orphanIds.add(nid)
      })
    }

    graph.forEachNode((nodeId, attrs) => {
      const nt = attrs.nodeType as string

      let visible = filterState.nodeTypes.has(nt as MindNodeType)
      if (nt === 'tag' && !filterState.showTags) visible = false
      if (DOCUMENT_LIKE_TYPES.has(nt) && !filterState.showDocuments) visible = false
      if ((nt === 'source' || nt === 'fragment') && !filterState.showSources) visible = false
      if (orphanIds.has(nodeId)) visible = false
      if (searchLower && !attrs.originalLabel.toLowerCase().includes(searchLower)) visible = false

      if (!visible) {
        graph.setNodeAttribute(nodeId, 'hidden', true)
        return
      }
      graph.setNodeAttribute(nodeId, 'hidden', false)

      if (hasHighlight) {
        if (highlighted.has(nodeId)) {
          const isCenter = hoveredNodeId === nodeId || focusedNodeId === nodeId
          graph.setNodeAttribute(nodeId, 'color', isCenter ? HOVER_HIGHLIGHT_COLOR : HOVER_NEIGHBOR_COLOR)
          graph.setNodeAttribute(nodeId, 'size', attrs.baseSize * (isCenter ? 1.6 : 1.3))
          graph.setNodeAttribute(nodeId, 'label', attrs.originalLabel)
        } else {
          graph.setNodeAttribute(nodeId, 'color', `rgba(255,255,255,${DIM_OPACITY})`)
          graph.setNodeAttribute(nodeId, 'size', attrs.baseSize * 0.7)
          graph.setNodeAttribute(nodeId, 'label', '')
        }
      } else {
        graph.setNodeAttribute(nodeId, 'color', getNodeColor(nt))
        graph.setNodeAttribute(nodeId, 'size', attrs.baseSize)
        graph.setNodeAttribute(nodeId, 'label', shouldShowLabel(attrs.visualWeight) ? attrs.originalLabel : '')
      }
    })

    graph.forEachEdge((edgeId, attrs, source, target) => {
      const et = attrs.edgeType as string
      let visible = filterState.edgeTypes.has(et as MindEdgeType)

      if (et === 'suggested' && !filterState.showSuggested) visible = false
      if (et === 'confirmed' && !filterState.showConfirmed) visible = false
      if (attrs.confidence != null && attrs.confidence < filterState.minConfidence) visible = false
      if (attrs.strength < filterState.minStrength) visible = false
      if (!!graph.getNodeAttribute(source, 'hidden') || !!graph.getNodeAttribute(target, 'hidden')) visible = false

      if (!visible) {
        graph.setEdgeAttribute(edgeId, 'hidden', true)
        return
      }
      graph.setEdgeAttribute(edgeId, 'hidden', false)

      if (hasHighlight) {
        if (highlightedEdges.has(edgeId)) {
          graph.setEdgeAttribute(edgeId, 'color', HOVER_HIGHLIGHT_COLOR)
          graph.setEdgeAttribute(edgeId, 'size', Math.max(attrs.baseWidth * 2.5, 2))
        } else {
          graph.setEdgeAttribute(edgeId, 'color', `rgba(255,255,255,${DIM_EDGE_OPACITY})`)
          graph.setEdgeAttribute(edgeId, 'size', 0.2)
        }
      } else {
        const style = getEdgeStyle(et)
        graph.setEdgeAttribute(edgeId, 'color', style.color)
        graph.setEdgeAttribute(edgeId, 'size', attrs.baseWidth)
      }
    })

    sigma.refresh()
  }, [ixState, sigma])

  useEffect(() => {
    requestAnimationFrame(() => applyAppearance())
  }, [applyAppearance])

  // Event handlers
  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return

    const handleEnterNode = (event: { node: string; event: { original: MouseEvent | TouchEvent } }) => {
      const nodeId = event.node
      const attrs = graph.getNodeAttributes(nodeId)
      ixActions.setHoveredNode(nodeId)
      const orig = event.event.original
      const screenX = 'clientX' in orig ? orig.clientX : (orig as TouchEvent).touches[0]?.clientX ?? 0
      const screenY = 'clientY' in orig ? orig.clientY : (orig as TouchEvent).touches[0]?.clientY ?? 0
      onTooltipChange({ nodeId, nodeType: attrs.nodeType, label: attrs.originalLabel, documentId: attrs.documentId, degreeScore: attrs.degreeScore, x: screenX, y: screenY })
    }
    const handleLeaveNode = () => { ixActions.setHoveredNode(null); onTooltipChange(null) }

    const handleClickNode = (event: { node: string }) => {
      const nodeId = event.node
      if (ixState.focusedNodeId === nodeId) {
        ixActions.clearFocus()
        return
      }
      ixActions.setFocusedNode(nodeId)
    }

    const handleDoubleClickNode = (event: { node: string }) => {
      const attrs = graph.getNodeAttributes(event.node)
      if (attrs.documentId != null) onOpenEditor(attrs.documentId)
    }

    const handleClickStage = () => {
      ixActions.clearFocus()
    }

    const handleDownNode = (event: { node: string; event: { original: MouseEvent | TouchEvent } }) => {
      const phys = physicsRef.current
      phys.grabbedNode = event.node
      const orig = event.event.original
      const rect = sigma.getContainer().getBoundingClientRect()
      const clientX = 'clientX' in orig ? orig.clientX : (orig as TouchEvent).touches[0]?.clientX ?? 0
      const clientY = 'clientY' in orig ? orig.clientY : (orig as TouchEvent).touches[0]?.clientY ?? 0
      const x = clientX - rect.left
      const y = clientY - rect.top
      phys.dragPos = sigma.viewportToGraph({ x, y })
      sigma.getCamera().disable()
    }

    const handleUpNode = (event: { node: string }) => {
      const phys = physicsRef.current
      phys.grabbedNode = null
      sigma.getCamera().enable()
      if (!onNodeDragEnd) return
      const nodeId = event.node
      if (!graph.hasNode(nodeId)) return
      const attrs = graph.getNodeAttributes(nodeId)
      const x = attrs.x
      const y = attrs.y
      if (x != null && y != null) {
        onNodeDragEnd(nodeId, x, y)
      }
    }

    registerEvents({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      enterNode: handleEnterNode as any,
      leaveNode: handleLeaveNode as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clickNode: handleClickNode as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      doubleClickNode: handleDoubleClickNode as any,
      clickStage: handleClickStage as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      upNode: handleUpNode as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      downNode: handleDownNode as any,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigma, ixActions, ixState.focusedNodeId, onOpenEditor, onTooltipChange, onNodeDragEnd])


  return null
}
