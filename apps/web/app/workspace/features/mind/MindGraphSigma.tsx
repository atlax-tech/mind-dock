'use client'

import React, { useEffect, useRef, useCallback } from 'react'
import { SigmaContainer, useLoadGraph, useRegisterEvents, useSigma } from '@react-sigma/core'
import '@react-sigma/core/lib/style.css'
import type { MindGraphSnapshot } from './types'
import type { MindNodeType, MindEdgeType } from '@atlax/domain'
import { snapshotToGraphology, precomputeAdjacency, computeSnapshotSignature, type GraphNodeAttributes, type GraphEdgeAttributes } from './mindGraphAdapter'
import { applyForceAtlas2Layout, type LayoutProgress } from './mindGraphLayout'
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
  onLayoutRunningChange: (r: boolean) => void
  onTooltipChange: (t: TooltipData | null) => void
  layoutAppliedRef: React.MutableRefObject<boolean>
  onCameraControl: (ctrl: { zoomIn: () => void; zoomOut: () => void; centerView: () => void }) => void
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
        minCameraRatio: 0.05,
        maxCameraRatio: 10,
      }}
    >
      <MindGraphInner {...props} />
    </SigmaContainer>
  )
}

function MindGraphInner({
  snapshotKey, snapshot, ixState, ixActions,
  onOpenEditor, onNodeCountChange, onEdgeCountChange,
  onLayoutRunningChange, onTooltipChange, layoutAppliedRef, onCameraControl,
  activeModule,
}: MindGraphSigmaProps) {
  const loadGraph = useLoadGraph()
  const registerEvents = useRegisterEvents()
  const sigma = useSigma()
  const graphRef = useRef<import('graphology').default<GraphNodeAttributes, GraphEdgeAttributes> | null>(null)
  const adjacencyRef = useRef<{ neighborMap: Map<string, Set<string>>; incidentEdgesMap: Map<string, Set<string>> } | null>(null)
  const prevSnapshotKeyRef = useRef<string>('')
  const hoverStateRef = useRef<{ hoveredNodeId: string | null; focusedNodeId: string | null }>({ hoveredNodeId: null, focusedNodeId: null })

  const fitGraph = useCallback((animated: boolean = true) => {
    const graph = graphRef.current
    if (!graph || graph.order === 0) return

    const cam = sigma.getCamera()
    if (animated) {
      cam.animatedReset({ duration: 600 })
    } else {
      cam.setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 })
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

    let timer: NodeJS.Timeout | null = null

    if (!layoutAppliedRef.current) {
      onLayoutRunningChange(true)
      const runLayout = () => {
        if (!graphRef.current) return

        applyForceAtlas2Layout(gs.graph, (progress: LayoutProgress) => {
          ixActions.setLayoutProgress(progress.phase, progress.iterations, progress.maxIterations)
        })

        layoutAppliedRef.current = true
        onLayoutRunningChange(false)
        ixActions.setLayoutProgress('done', 0, 0)

        sigma.refresh()
        requestAnimationFrame(() => fitGraph(true))
      }
      timer = setTimeout(runLayout, 150)
    } else {
      sigma.refresh()
      requestAnimationFrame(() => fitGraph(false))
    }

    return () => {
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotKey])

  // Relayout effect
  useEffect(() => {
    if (ixState.relayoutCounter <= 0) return
    const graph = graphRef.current
    if (!graph) return
    onLayoutRunningChange(true)
    graph.forEachNode((nodeId) => {
      graph.setNodeAttribute(nodeId, 'originalX', null)
      graph.setNodeAttribute(nodeId, 'originalY', null)
    })
    layoutAppliedRef.current = false
    const runLayout = () => {
      applyForceAtlas2Layout(graph, (progress: LayoutProgress) => {
        ixActions.setLayoutProgress(progress.phase, progress.iterations, progress.maxIterations)
      })
      layoutAppliedRef.current = true
      onLayoutRunningChange(false)
      ixActions.setLayoutProgress('done', 0, 0)
      sigma.refresh()
      requestAnimationFrame(() => fitGraph(true))
    }
    const timer = setTimeout(runLayout, 50)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ixState.relayoutCounter])

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

    registerEvents({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      enterNode: handleEnterNode as any,
      leaveNode: handleLeaveNode as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clickNode: handleClickNode as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      doubleClickNode: handleDoubleClickNode as any,
      clickStage: handleClickStage as any,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigma, ixActions, ixState.focusedNodeId, onOpenEditor, onTooltipChange])


  return null
}
