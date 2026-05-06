'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { ForceGraphMethods, ForceGraphProps, GraphData, LinkObject, NodeObject } from 'react-force-graph-3d'
import { forceCollide } from 'd3-force-3d'
import { mapRealGraphToVisualBrainGraph } from '../lib/brainAdapter'
import type { BrainEdge, BrainNode, TooltipData } from '../lib/types'
import type { MindGraphSnapshot } from '@/lib/repository'
import type { MindFilterState } from '@/app/workspace/features/mind/useMindGraphInteraction'

const COLORS = {
  background: '#141515',
  document: 'rgba(141,150,184,0.88)',
  documentActive: 'rgba(178,186,218,0.98)',
  tag: 'rgba(168,245,173,0.94)',
  tagActive: 'rgba(202,255,205,0.98)',
  orphan: 'rgba(85,96,112,0.35)',
  orphanActive: 'rgba(112,124,145,0.62)',
  nodeDim: 'rgba(70,76,88,0.16)',
  edgeDoc: 'rgba(48,56,74,0.16)',
  edgeTag: 'rgba(47,63,78,0.24)',
  edgeDense: 'rgba(41,50,65,0.14)',
  edgeActive: 'rgba(145,155,189,0.58)',
  edgeDim: 'rgba(35,42,54,0.055)',
}

interface BrainCanvasProps {
  snapshot?: MindGraphSnapshot | null
  filterState?: MindFilterState
  onOpenEditor?: (documentId: number) => void
  onCountsChange?: (counts: { nodes: number; edges: number }) => void
  onCameraControl?: (ctrl: { zoomIn: () => void; zoomOut: () => void; centerView: () => void }) => void
  onCreateEdge?: (sourceId: string, targetId: string, edgeType: string) => void
  onDeleteEdge?: (sourceId: string, targetId: string) => void
  onNodeClick?: (nodeId: string) => void
}

type GraphNode = NodeObject<BrainNode> & BrainNode
type GraphLink = LinkObject<GraphNode, BrainEdge> & BrainEdge
type ForceGraph3DProps = ForceGraphProps<BrainNode, BrainEdge> & {
  forwardedRef: React.MutableRefObject<ForceGraphMethods<BrainNode, BrainEdge> | undefined>
}
type LinkForce = {
  distance: (accessor: (link: GraphLink) => number) => LinkForce
  strength: (accessor: (link: GraphLink) => number) => LinkForce
}
type ChargeForce = {
  strength: (accessor: (node: GraphNode) => number) => ChargeForce
}

const ForceGraph3D = dynamic<ForceGraph3DProps>(
  () => import('react-force-graph-3d').then(mod => {
    const Graph = mod.default
    function ForceGraph3DWithRef({ forwardedRef, ...props }: ForceGraph3DProps) {
      return <Graph ref={forwardedRef} {...props} />
    }
    ForceGraph3DWithRef.displayName = 'ForceGraph3DWithRef'
    return ForceGraph3DWithRef
  }),
  { ssr: false },
)

function nodeBaseColor(node: BrainNode): string {
  if (node.type === 'tag') return COLORS.tag
  if (node.type === 'orphan') return COLORS.orphan
  return COLORS.document
}

function nodeActiveColor(node: BrainNode): string {
  if (node.type === 'tag') return COLORS.tagActive
  if (node.type === 'orphan') return COLORS.orphanActive
  return COLORS.documentActive
}

function linkBaseColor(link: BrainEdge): string {
  if (link.type === 'tag-link') return COLORS.edgeTag
  if (link.type === 'doc-link') return COLORS.edgeDoc
  return COLORS.edgeDense
}

function linkNodeId(node: string | number | GraphNode | undefined): string | null {
  if (node == null) return null
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  return String(node.id)
}

function makeSeedForce(strength = 0.018) {
  let nodes: GraphNode[] = []
  const force = (alpha: number) => {
    for (const node of nodes) {
      if (node.fx != null || node.fy != null || node.fz != null) continue
      const layerBoost = node.type === 'tag' ? 1.8 : node.layoutLayer === 'core' ? 0.65 : 1
      const k = strength * layerBoost * alpha
      node.vx = (node.vx ?? 0) + ((node.layoutX ?? 0) - (node.x ?? 0)) * k
      node.vy = (node.vy ?? 0) + ((node.layoutY ?? 0) - (node.y ?? 0)) * k
      node.vz = (node.vz ?? 0) + ((node.layoutZ ?? 0) - (node.z ?? 0)) * k
    }
  }
  force.initialize = (nextNodes: GraphNode[]) => {
    nodes = nextNodes
  }
  return force
}

export default function BrainCanvas({
  snapshot,
  filterState,
  onOpenEditor,
  onCountsChange,
  onCameraControl,
  onCreateEdge: _onCreateEdge,
  onDeleteEdge: _onDeleteEdge,
  onNodeClick,
}: BrainCanvasProps) {
  const fgRef = useRef<ForceGraphMethods<BrainNode, BrainEdge> | undefined>()
  const containerRef = useRef<HTMLDivElement>(null)
  const clickRef = useRef<{ id: string; at: number } | null>(null)
  const mousePosRef = useRef({ x: 0, y: 0 })
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)

  const visualGraph = useMemo(() => {
    if (!snapshot) return null
    return mapRealGraphToVisualBrainGraph(snapshot, filterState)
  }, [snapshot, filterState])

  const graphData = useMemo<GraphData<GraphNode, GraphLink>>(() => {
    if (!visualGraph) return { nodes: [], links: [] }
    return {
      nodes: Array.from(visualGraph.nodes.values()) as GraphNode[],
      links: Array.from(visualGraph.edges.values()).map(edge => ({
        ...edge,
        source: edge.source,
        target: edge.target,
      })) as GraphLink[],
    }
  }, [visualGraph])

  const hoveredNode = useMemo(() => {
    if (!hoveredNodeId || !visualGraph) return null
    return visualGraph.nodes.get(hoveredNodeId) ?? null
  }, [hoveredNodeId, visualGraph])

  const activeNodeIds = useMemo(() => {
    if (!hoveredNode) return null
    const ids = new Set<string>([hoveredNode.id])
    hoveredNode.neighbors.forEach(id => ids.add(id))
    return ids
  }, [hoveredNode])

  const activeEdgeIds = useMemo(() => {
    if (!hoveredNode) return null
    return new Set<string>(hoveredNode.incidentEdges)
  }, [hoveredNode])

  useEffect(() => {
    onCountsChange?.({ nodes: graphData.nodes.length, edges: graphData.links.length })
  }, [graphData.links.length, graphData.nodes.length, onCountsChange])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const resize = () => {
      const rect = container.getBoundingClientRect()
      setDimensions({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) })
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const centerView = useCallback(() => {
    const fg = fgRef.current
    if (!fg) return
    fg.zoomToFit(650, 72)
  }, [])

  const zoomCamera = useCallback((factor: number) => {
    const fg = fgRef.current
    if (!fg) return
    const camera = fg.camera() as { position: { x: number; y: number; z: number } }
    const { x, y, z } = camera.position
    fg.cameraPosition({ x: x * factor, y: y * factor, z: z * factor }, { x: 0, y: 0, z: 0 }, 280)
  }, [])

  useEffect(() => {
    onCameraControl?.({
      zoomIn: () => zoomCamera(0.82),
      zoomOut: () => zoomCamera(1.22),
      centerView,
    })
  }, [centerView, onCameraControl, zoomCamera])

  useEffect(() => {
    const fg = fgRef.current
    if (!fg || graphData.nodes.length === 0) return

    const linkForce = fg.d3Force('link') as unknown as LinkForce | undefined
    linkForce
      ?.distance((link: GraphLink) => {
        if (link.type === 'tag-link') return 18
        if (link.type === 'doc-link') return 60 + Math.max(0, 1 - Math.min(1, link.strength ?? 0.5)) * 70
        return 82
      })
      .strength((link: GraphLink) => {
        if (link.type === 'tag-link') return 0.24
        if (link.type === 'doc-link') return 0.055
        return 0.035
      })

    const chargeForce = fg.d3Force('charge') as unknown as ChargeForce | undefined
    chargeForce?.strength((node: GraphNode) => {
      if (node.type === 'document') return -60 - Math.min(30, (node.degree ?? 0) * 2.2)
      if (node.type === 'tag') return -12 - Math.min(12, node.degree ?? 0)
      return -24
    })

    fg.d3Force(
      'collide',
      forceCollide<GraphNode>((node) => {
        if (node.type === 'document') return node.baseRadius + 4
        if (node.type === 'tag') return node.baseRadius + 2
        return node.baseRadius + 2.4
      }).strength(0.86).iterations(2) as unknown as Parameters<typeof fg.d3Force>[1],
    )
    fg.d3Force('seed-shell', makeSeedForce(0.016) as unknown as Parameters<typeof fg.d3Force>[1])
    fg.d3ReheatSimulation()

    const controls = fg.controls() as {
      enableDamping?: boolean
      dampingFactor?: number
      autoRotate?: boolean
      autoRotateSpeed?: number
      minDistance?: number
      maxDistance?: number
      update?: () => void
      onPointerUp?: (event: PointerEvent) => void
      __patchedPointerUp?: boolean
    }
    if (controls.onPointerUp && !controls.__patchedPointerUp) {
      const orig = controls.onPointerUp
      controls.onPointerUp = function (this: typeof controls, event: PointerEvent) {
        if (event && typeof event.pointerType === 'string') {
          orig.call(this, event)
        }
      }
      controls.__patchedPointerUp = true
    }
    controls.enableDamping = true
    controls.dampingFactor = 0.075
    controls.autoRotate = true
    controls.autoRotateSpeed = draggingNodeId ? 0 : 0.045
    controls.minDistance = 90
    controls.maxDistance = 900
    controls.update?.()

    fg.cameraPosition({ x: 0, y: -36, z: 430 }, { x: 0, y: 0, z: 0 }, 0)
    window.setTimeout(() => fg.zoomToFit(900, 84), 180)
  }, [draggingNodeId, graphData])

  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    const controls = fg.controls() as { autoRotate?: boolean; autoRotateSpeed?: number; update?: () => void }
    controls.autoRotate = !draggingNodeId
    controls.autoRotateSpeed = draggingNodeId ? 0 : 0.045
    controls.update?.()
  }, [draggingNodeId])

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const pos = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    mousePosRef.current = pos
    setTooltip(prev => prev ? { ...prev, x: pos.x, y: pos.y } : prev)
  }, [])

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    const nextId = node?.id ? String(node.id) : null
    setHoveredNodeId(nextId)
    if (!node) {
      setTooltip(null)
      return
    }
    setTooltip({
      id: String(node.id),
      type: node.type,
      label: node.label,
      x: mousePosRef.current.x,
      y: mousePosRef.current.y,
    })
  }, [])

  const handleNodeClick = useCallback((node: GraphNode) => {
    const nodeId = String(node.id)
    const now = performance.now()
    const previous = clickRef.current
    clickRef.current = { id: nodeId, at: now }
    setSelectedNodeId(nodeId)
    onNodeClick?.(nodeId)

    if (previous?.id === nodeId && now - previous.at < 320 && node.documentId != null) {
      onOpenEditor?.(node.documentId)
    }
  }, [onNodeClick, onOpenEditor])

  const handleNodeDrag = useCallback((node: GraphNode) => {
    setDraggingNodeId(String(node.id))
    node.fx = node.x ?? 0
    node.fy = node.y ?? 0
    node.fz = node.z ?? 0
    fgRef.current?.d3ReheatSimulation()
  }, [])

  const handleNodeDragEnd = useCallback((node: GraphNode) => {
    node.fx = undefined
    node.fy = undefined
    node.fz = undefined
    setDraggingNodeId(null)
    fgRef.current?.d3ReheatSimulation()
  }, [])

  const nodeColor = useCallback((node: GraphNode) => {
    if (activeNodeIds) {
      if (!activeNodeIds.has(node.id)) return COLORS.nodeDim
      return nodeActiveColor(node)
    }
    if (node.id === selectedNodeId) return nodeActiveColor(node)
    return nodeBaseColor(node)
  }, [activeNodeIds, selectedNodeId])

  const linkColor = useCallback((link: GraphLink) => {
    if (activeEdgeIds) return activeEdgeIds.has(link.id) ? COLORS.edgeActive : COLORS.edgeDim
    return linkBaseColor(link)
  }, [activeEdgeIds])

  const linkWidth = useCallback((link: GraphLink) => {
    if (activeEdgeIds?.has(link.id)) return 1.35
    if (activeEdgeIds) return 0.12
    if (link.type === 'tag-link') return 0.44
    if (link.type === 'doc-link') return 0.38
    return 0.28
  }, [activeEdgeIds])

  const nodeValue = useCallback((node: GraphNode) => {
    const radius = activeNodeIds?.has(node.id) ? node.baseRadius * 1.18 : node.baseRadius
    return Math.pow(radius, 3)
  }, [activeNodeIds])

  const nodeLabel = useCallback((node: GraphNode) => `${node.type.toUpperCase()} · ${node.label}`, [])
  const linkLabel = useCallback((link: GraphLink) => {
    const sourceId = linkNodeId(link.source)
    const targetId = linkNodeId(link.target)
    return `${link.type} · ${sourceId ?? ''} → ${targetId ?? ''}`
  }, [])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ background: COLORS.background }}
      onMouseMove={handleMouseMove}
    >
      {dimensions.width > 0 && dimensions.height > 0 && (
        <ForceGraph3D
          forwardedRef={fgRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor={COLORS.background}
          showNavInfo={false}
          controlType="orbit"
          forceEngine="d3"
          numDimensions={3}
          warmupTicks={72}
          cooldownTicks={Infinity}
          cooldownTime={Infinity}
          d3AlphaDecay={0.018}
          d3VelocityDecay={0.34}
          nodeId="id"
          linkSource="source"
          linkTarget="target"
          nodeRelSize={1}
          nodeVal={nodeValue}
          nodeResolution={10}
          nodeColor={nodeColor}
          nodeOpacity={1}
          nodeLabel={nodeLabel}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkOpacity={1}
          linkResolution={2}
          linkLabel={linkLabel}
          enableNodeDrag
          enableNavigationControls
          enablePointerInteraction
          showPointerCursor
          onNodeHover={handleNodeHover}
          onNodeClick={handleNodeClick}
          onNodeDrag={handleNodeDrag}
          onNodeDragEnd={handleNodeDragEnd}
          onBackgroundClick={() => setSelectedNodeId(null)}
        />
      )}

      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: tooltip.x + 16,
            top: tooltip.y - 12,
            transform: 'translate(0, -100%)',
          }}
        >
          <div
            className="rounded-lg px-3 py-2 shadow-2xl border border-white/10 max-w-xs"
            style={{ background: 'rgba(15,15,20,0.96)', backdropFilter: 'blur(16px)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-slate-300 uppercase tracking-wider">
                {tooltip.type}
              </span>
            </div>
            <div className="text-sm text-white font-medium truncate max-w-[240px]">
              {tooltip.label}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
