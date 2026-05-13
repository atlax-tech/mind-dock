'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import type { MindGraphSnapshot, MindGraphSnapshotEdge } from './types'
import type { MindScopeType, MindFilterState } from './useMindGraphInteraction'
import { NODE_COLOR, BG_COLOR } from './mindGraphStyle'

// --- Canvas Render Node ---
export interface CanvasRenderNode {
  id: string
  label: string
  nodeType: string
  x: number
  y: number
  vx: number
  vy: number
  targetX: number
  targetY: number
  radius: number
  color: string
  alpha: number
  documentId: number | null
  hasSavedPosition: boolean
  createdAt: number | null
  updatedAt: number | null
}

interface Camera { x: number; y: number; zoom: number }

function getProtoRadius(nodeType: string): number {
  switch (nodeType) {
    case 'root': return 10
    case 'domain': case 'project': case 'topic': return 6
    default: return 3
  }
}

function getProtoColor(nodeType: string): string {
  return NODE_COLOR[nodeType] || '#bbf7d0'
}

function isParentType(t: string): boolean {
  return t === 'root' || t === 'domain' || t === 'project' || t === 'topic'
}

// --- Build render nodes from snapshot ---
function buildRenderNodes(snapshot: MindGraphSnapshot, vw: number, vh: number): CanvasRenderNode[] {
  const cx = vw / 2, cy = vh / 2
  return snapshot.nodes.map((n, i) => {
    const angle = (i / Math.max(snapshot.nodes.length, 1)) * Math.PI * 2
    const r = Math.min(vw, vh) * 0.25
    const fallbackX = cx + Math.cos(angle) * r
    const fallbackY = cy + Math.sin(angle) * r
    const hasSavedPos = n.positionX != null && n.positionY != null
    const posX = hasSavedPos ? n.positionX as number : fallbackX
    const posY = hasSavedPos ? n.positionY as number : fallbackY
    return {
      id: n.id,
      label: n.label,
      nodeType: n.nodeType,
      x: posX,
      y: posY,
      vx: 0, vy: 0,
      targetX: hasSavedPos ? posX : fallbackX,
      targetY: hasSavedPos ? posY : fallbackY,
      radius: getProtoRadius(n.nodeType),
      color: getProtoColor(n.nodeType),
      alpha: 1,
      documentId: n.documentId,
      hasSavedPosition: hasSavedPos,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    }
  })
}

// --- Scope filtering ---
function filterByScope(
  nodes: CanvasRenderNode[], edges: MindGraphSnapshotEdge[],
  scope: MindScopeType, scopeTargetId: string | null
): { nodes: CanvasRenderNode[]; edges: MindGraphSnapshotEdge[] } {
  if (scope === 'global') return { nodes, edges }
  if (!scopeTargetId) return { nodes: [], edges: [] }

  if (scope === 'focusedNode') {
    const ids = new Set<string>([scopeTargetId])
    const queue = [scopeTargetId]
    while (queue.length > 0) {
      const cur = queue.shift()
      if (!cur) continue
      edges.forEach(e => {
        if (e.sourceNodeId === cur && !ids.has(e.targetNodeId)) { ids.add(e.targetNodeId); queue.push(e.targetNodeId) }
        if (e.targetNodeId === cur && !ids.has(e.sourceNodeId)) { ids.add(e.sourceNodeId); queue.push(e.sourceNodeId) }
      })
    }
    return {
      nodes: nodes.filter(n => ids.has(n.id)),
      edges: edges.filter(e => ids.has(e.sourceNodeId) && ids.has(e.targetNodeId)),
    }
  }

  const scopeNodeTypeMap: Partial<Record<MindScopeType, string>> = {
    domain: 'domain',
    project: 'project',
    collection: 'topic',
    tag: 'tag',
  }
  const matchType = scopeNodeTypeMap[scope]
  const targetNode = nodes.find(n => n.id === scopeTargetId)
  if (!targetNode) return { nodes: [], edges: [] }

  const ids = new Set<string>([scopeTargetId])
  if (matchType && targetNode.nodeType === matchType) {
    edges.forEach(e => {
      if (e.sourceNodeId === scopeTargetId) ids.add(e.targetNodeId)
      if (e.targetNodeId === scopeTargetId) ids.add(e.sourceNodeId)
    })
  }

  return {
    nodes: nodes.filter(n => ids.has(n.id)),
    edges: edges.filter(e => ids.has(e.sourceNodeId) && ids.has(e.targetNodeId)),
  }
}

export function applyFilterState(
  nodes: CanvasRenderNode[], edges: MindGraphSnapshotEdge[],
  filterState: MindFilterState
): { nodes: CanvasRenderNode[]; edges: MindGraphSnapshotEdge[] } {
  let filteredNodes = nodes.filter(n => {
    if (!filterState.nodeTypes.has(n.nodeType)) return false
    if (!filterState.showDocuments && n.nodeType === 'document') return false
    if (!filterState.showTags && n.nodeType === 'tag') return false
    if (!filterState.showSources && (n.nodeType === 'source' || n.nodeType === 'fragment')) return false
    if (filterState.search) {
      const q = filterState.search.toLowerCase()
      if (!n.label.toLowerCase().includes(q)) return false
    }
    return true
  })

  if (filterState.timeField != null) {
    const field = filterState.timeField
    const start = filterState.timeRangeStart
    const end = filterState.timeRangeEnd
    filteredNodes = filteredNodes.filter(n => {
      const ts = field === 'createdAt' ? n.createdAt : n.updatedAt
      if (ts == null) return false
      if (start != null && ts < start) return false
      if (end != null && ts > end) return false
      return true
    })
  }

  const nodeIds = new Set(filteredNodes.map(n => n.id))
  const filteredEdges = edges.filter(e => {
    if (!nodeIds.has(e.sourceNodeId) || !nodeIds.has(e.targetNodeId)) return false
    if (!filterState.edgeTypes.has(e.edgeType)) return false
    if (!filterState.showSuggested && e.edgeType === 'suggested') return false
    if (!filterState.showConfirmed && e.edgeType === 'confirmed') return false
    if (filterState.minConfidence > 0 && e.confidence != null && e.confidence < filterState.minConfidence) return false
    return true
  })

  if (!filterState.showOrphans) {
    const connectedIds = new Set<string>()
    filteredEdges.forEach(e => { connectedIds.add(e.sourceNodeId); connectedIds.add(e.targetNodeId) })
    return {
      nodes: filteredNodes.filter(n => connectedIds.has(n.id)),
      edges: filteredEdges,
    }
  }

  return { nodes: filteredNodes, edges: filteredEdges }
}

type ViewScopeType = 'focusMap' | 'clusterMap' | 'linkReview' | 'driftDock' | 'timelineSnapshot'

function filterByViewScope(
  nodes: CanvasRenderNode[], edges: MindGraphSnapshotEdge[],
  viewScope: ViewScopeType
): { nodes: CanvasRenderNode[]; edges: MindGraphSnapshotEdge[] } {
  if (viewScope === 'focusMap') return { nodes, edges }

  if (viewScope === 'clusterMap') {
    const parentTypes = new Set(['root', 'domain', 'project', 'topic'])
    const parentNodeIds = new Set(nodes.filter(n => parentTypes.has(n.nodeType)).map(n => n.id))
    const clusterNodeIds = new Set(parentNodeIds)
    edges.forEach(e => {
      if (parentNodeIds.has(e.sourceNodeId)) clusterNodeIds.add(e.targetNodeId)
      if (parentNodeIds.has(e.targetNodeId)) clusterNodeIds.add(e.sourceNodeId)
    })
    return {
      nodes: nodes.filter(n => clusterNodeIds.has(n.id)),
      edges: edges.filter(e => clusterNodeIds.has(e.sourceNodeId) && clusterNodeIds.has(e.targetNodeId)),
    }
  }

  if (viewScope === 'linkReview') {
    const suggestedEdges = edges.filter(e => e.edgeType === 'suggested')
    const nodeIds = new Set<string>()
    suggestedEdges.forEach(e => { nodeIds.add(e.sourceNodeId); nodeIds.add(e.targetNodeId) })
    return {
      nodes: nodes.filter(n => nodeIds.has(n.id)),
      edges: suggestedEdges,
    }
  }

  if (viewScope === 'driftDock') {
    const connectedIds = new Set<string>()
    edges.forEach(e => { connectedIds.add(e.sourceNodeId); connectedIds.add(e.targetNodeId) })
    const driftNodes = nodes.filter(n => !connectedIds.has(n.id) || n.nodeType === 'document')
    const driftNodeIds = new Set(driftNodes.map(n => n.id))
    return {
      nodes: driftNodes,
      edges: edges.filter(e => driftNodeIds.has(e.sourceNodeId) && driftNodeIds.has(e.targetNodeId)),
    }
  }

  if (viewScope === 'timelineSnapshot') {
    const now = Date.now()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    const recentNodeIds = new Set(
      nodes.filter(n => {
        if (n.updatedAt != null) return now - n.updatedAt < sevenDaysMs
        return false
      }).map(n => n.id)
    )
    return {
      nodes: nodes.filter(n => recentNodeIds.has(n.id)),
      edges: edges.filter(e => recentNodeIds.has(e.sourceNodeId) && recentNodeIds.has(e.targetNodeId)),
    }
  }

  return { nodes, edges }
}

// --- Layout target computation ---
function computeTargets(
  mode: 'force' | 'radial' | 'orbit',
  nodes: CanvasRenderNode[], edges: MindGraphSnapshotEdge[],
  vw: number, vh: number, padding: number
) {
  const cx = vw / 2, cy = vh / 2
  const availR = Math.min(vw, vh) / 2 - padding

  if (mode === 'radial') {
    const baseReq = 280
    const scale = Math.min(1, availR / baseReq)
    const domR = 200 * scale, docR = 80 * scale
    const roots = nodes.filter(n => n.nodeType === 'root')
    const domains = nodes.filter(n => n.nodeType === 'domain' || n.nodeType === 'project' || n.nodeType === 'topic')
    const leaves = nodes.filter(n => !isParentType(n.nodeType) && n.nodeType !== 'root')

    roots.forEach(n => { n.targetX = cx; n.targetY = cy })
    domains.forEach((n, i) => {
      const th = (i / Math.max(domains.length, 1)) * Math.PI * 2 - Math.PI / 2
      n.targetX = cx + domR * Math.cos(th)
      n.targetY = cy + domR * Math.sin(th)
    })
    leaves.forEach((n, i) => {
      const pe = edges.find(e => (e.targetNodeId === n.id || e.sourceNodeId === n.id) && domains.some(d => d.id === (e.targetNodeId === n.id ? e.sourceNodeId : e.targetNodeId)))
      if (pe) {
        const pid = pe.sourceNodeId === n.id ? pe.targetNodeId : pe.sourceNodeId
        const parent = domains.find(d => d.id === pid) || nodes.find(nn => nn.id === pid)
        if (parent) {
          const sibs = leaves.filter(l => edges.some(e2 => (e2.sourceNodeId === pid && e2.targetNodeId === l.id) || (e2.targetNodeId === pid && e2.sourceNodeId === l.id)))
          const si = sibs.indexOf(n)
          const sa = Math.atan2(parent.targetY - cy, parent.targetX - cx) + ((si - sibs.length / 2) * 0.4)
          n.targetX = parent.targetX + docR * Math.cos(sa)
          n.targetY = parent.targetY + docR * Math.sin(sa)
          return
        }
      }
      const th = (i / Math.max(leaves.length, 1)) * Math.PI * 2
      n.targetX = cx + (domR + docR) * Math.cos(th)
      n.targetY = cy + (domR + docR) * Math.sin(th)
    })
  } else if (mode === 'orbit') {
    const maxR = availR
    const groups: CanvasRenderNode[][] = []
    const rootN = nodes.filter(n => n.nodeType === 'root')
    const domN = nodes.filter(n => n.nodeType === 'domain' || n.nodeType === 'project')
    const docN = nodes.filter(n => n.nodeType === 'document')
    const rest = nodes.filter(n => !rootN.includes(n) && !domN.includes(n) && !docN.includes(n))
    if (rootN.length) groups.push(rootN)
    if (domN.length) groups.push(domN)
    if (docN.length) groups.push(docN)
    if (rest.length) groups.push(rest)

    const baseSpacing = 50
    const totalR = 150 + (groups.length - 1) * baseSpacing
    const orbitScale = totalR > maxR ? maxR / totalR : 1

    groups.forEach((g, gi) => {
      if (gi === 0 && g[0]?.nodeType === 'root') {
        g.forEach(n => { n.targetX = cx; n.targetY = cy })
        return
      }
      const R = (150 + gi * baseSpacing) * orbitScale
      g.forEach((n, ni) => {
        const th = (ni / Math.max(g.length, 1)) * Math.PI * 2 + gi * 0.5
        n.targetX = cx + R * Math.cos(th)
        n.targetY = cy + R * Math.sin(th)
      })
    })
  }
  // force: targets = current positions (physics drives movement)
  if (mode === 'force') {
    nodes.forEach(n => { n.targetX = n.x; n.targetY = n.y })
  }

  // Clamp all targets to safe bounds
  nodes.forEach(n => {
    n.targetX = Math.max(padding, Math.min(vw - padding, n.targetX))
    n.targetY = Math.max(padding, Math.min(vh - padding, n.targetY))
  })

  nodes.forEach(n => {
    if (n.hasSavedPosition) {
      n.targetX = n.x
      n.targetY = n.y
    }
  })
}

// --- Main Hook ---
export function useMindCanvasRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  snapshot: MindGraphSnapshot,
  layoutMode: 'force' | 'radial' | 'orbit',
  scope: MindScopeType,
  scopeTargetId: string | null,
  filterState: MindFilterState,
  selectedNodeId: string | null,
  hoveredNodeId: string | null,
  onSelectNode: (id: string | null) => void,
  onHoverNode: (id: string | null) => void,
  onNodeDragEnd?: (nodeId: string, x: number, y: number) => void,
  onCreateEdge?: (sourceNodeId: string, targetNodeId: string) => Promise<{ success: boolean; error?: string }>,
  viewScope?: ViewScopeType,
) {
  const nodesRef = useRef<CanvasRenderNode[]>([])
  const edgesRef = useRef<MindGraphSnapshotEdge[]>([])
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 })
  const sizeRef = useRef({ w: 800, h: 600 })
  const animRef = useRef<number>(0)
  const isPanningRef = useRef(false)
  const dragNodeRef = useRef<string | null>(null)
  const lastPtrRef = useRef({ x: 0, y: 0 })
  const snapTargetRef = useRef<string | null>(null)
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null)
  const hasDraggedRef = useRef(false)
  const selectedRef = useRef(selectedNodeId)
  const hoveredRef = useRef(hoveredNodeId)
  const layoutRef = useRef(layoutMode)
  const prevLayoutRef = useRef(layoutMode)
  const initDoneRef = useRef(false)
  const focusAlphasRef = useRef<Map<string, number>>(new Map())
  const onCreateEdgeRef = useRef(onCreateEdge)
  onCreateEdgeRef.current = onCreateEdge

  const [camera, setCameraState] = useState<Camera>({ x: 0, y: 0, zoom: 1 })
  const [hoverScreenPos, setHoverScreenPos] = useState<{ x: number; y: number } | null>(null)
  const PADDING = 32

  selectedRef.current = selectedNodeId
  hoveredRef.current = hoveredNodeId
  layoutRef.current = layoutMode

  // --- Initialize / update nodes from snapshot ---
  useEffect(() => {
    const c = containerRef.current
    if (!c) return
    const rect = c.getBoundingClientRect()
    const vw = rect.width || 800, vh = rect.height || 600
    sizeRef.current = { w: vw, h: vh }

    const scoped = filterByScope(
      buildRenderNodes(snapshot, vw, vh),
      snapshot.edges, scope, scopeTargetId
    )
    const viewScoped = filterByViewScope(scoped.nodes, scoped.edges, viewScope ?? 'focusMap')
    const filtered = applyFilterState(viewScoped.nodes, viewScoped.edges, filterState)
    nodesRef.current = filtered.nodes
    edgesRef.current = filtered.edges
    initDoneRef.current = false

    const initZoom = vw < 800 ? 0.8 : 1
    cameraRef.current = { x: 0, y: 0, zoom: initZoom }
    setCameraState({ x: 0, y: 0, zoom: initZoom })

    computeTargets(layoutRef.current, nodesRef.current, edgesRef.current, vw, vh, PADDING)
  }, [snapshot, scope, scopeTargetId, filterState, viewScope, containerRef])

  // --- Layout mode change ---
  useEffect(() => {
    if (layoutRef.current !== prevLayoutRef.current) {
      prevLayoutRef.current = layoutRef.current
      nodesRef.current.forEach(n => { n.hasSavedPosition = false })
      const { w, h } = sizeRef.current
      computeTargets(layoutRef.current, nodesRef.current, edgesRef.current, w, h, PADDING)
    }
  }, [layoutMode])

  // --- ResizeObserver ---
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height } = e.contentRect
        sizeRef.current = { w: width, h: height }
        computeTargets(layoutRef.current, nodesRef.current, edgesRef.current, width, height, PADDING)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef])

  // --- Animation Loop ---
  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    if (!ctx) return

    const tick = () => {
      const { w, h } = sizeRef.current
      const dpr = window.devicePixelRatio || 1
      if (cvs.width !== w * dpr || cvs.height !== h * dpr) {
        cvs.width = w * dpr; cvs.height = h * dpr
        cvs.style.width = w + 'px'; cvs.style.height = h + 'px'
      }

      const cam = cameraRef.current
      const nodes = nodesRef.current
      const edges = edgesRef.current
      const mode = layoutRef.current
      const selId = selectedRef.current
      const hoverId = hoveredRef.current
      const activeId = hoverId || selId

      // --- Physics ---
      const dragged = dragNodeRef.current
      if (mode === 'force') {
        for (let i = 0; i < nodes.length; i++) {
          const ni = nodes[i]
          if (ni.id === dragged) { ni.vx = 0; ni.vy = 0; continue }
          for (let j = i + 1; j < nodes.length; j++) {
            const nj = nodes[j]
            const dx = ni.x - nj.x, dy = ni.y - nj.y
            const dSq = dx * dx + dy * dy
            if (dSq < 25000 && dSq > 0) {
              const f = 60 / dSq
              ni.vx += dx * f; ni.vy += dy * f
              if (nj.id !== dragged) { nj.vx -= dx * f; nj.vy -= dy * f }
            }
          }
        }
        edges.forEach(e => {
          const src = nodes.find(n => n.id === e.sourceNodeId)
          const tgt = nodes.find(n => n.id === e.targetNodeId)
          if (!src || !tgt) return
          const dx = tgt.x - src.x, dy = tgt.y - src.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const L = src.nodeType === 'root' ? 150 : 50
          const f = (dist - L) * 0.003
          if (src.id !== dragged) { src.vx += (dx / dist) * f; src.vy += (dy / dist) * f }
          if (tgt.id !== dragged) { tgt.vx -= (dx / dist) * f; tgt.vy -= (dy / dist) * f }
        })
        // gravity toward center
        const cx = w / 2, cy = h / 2
        nodes.forEach(n => {
          if (n.id === dragged || n.nodeType === 'root') return
          n.vx += (cx - n.x) * 0.0005; n.vy += (cy - n.y) * 0.0005
          n.vx *= 0.8; n.vy *= 0.8
          n.x += n.vx; n.y += n.vy
        })
        // root stays at center
        const root = nodes.find(n => n.nodeType === 'root')
        if (root && root.id !== dragged) { root.x += (cx - root.x) * 0.05; root.y += (cy - root.y) * 0.05 }
      } else {
        // radial/orbit: lerp to target
        nodes.forEach(n => {
          if (n.id === dragged) return
          n.x += (n.targetX - n.x) * 0.1
          n.y += (n.targetY - n.y) * 0.1
        })
      }

      // Bounds enforcement
      nodes.forEach(n => {
        if (n.x < PADDING) { n.x = PADDING; n.vx *= -0.15 }
        if (n.x > w - PADDING) { n.x = w - PADDING; n.vx *= -0.15 }
        if (n.y < PADDING) { n.y = PADDING; n.vy *= -0.15 }
        if (n.y > h - PADDING) { n.y = h - PADDING; n.vy *= -0.15 }
      })

      // --- Focus alpha interpolation ---
      const neighborIds = new Set<string>()
      if (activeId) {
        edges.forEach(e => {
          if (e.sourceNodeId === activeId) neighborIds.add(e.targetNodeId)
          if (e.targetNodeId === activeId) neighborIds.add(e.sourceNodeId)
        })
      }
      nodes.forEach(n => {
        let targetAlpha = 1
        if (activeId) {
          if (n.id === activeId) targetAlpha = 1
          else if (neighborIds.has(n.id)) targetAlpha = 0.95
          else targetAlpha = 0.1
        }
        const cur = focusAlphasRef.current.get(n.id) ?? 1
        const next = cur + (targetAlpha - cur) * 0.12
        focusAlphasRef.current.set(n.id, next)
        n.alpha = next
      })

      // --- Draw ---
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = BG_COLOR
      ctx.fillRect(0, 0, w, h)

      ctx.save()
      ctx.translate(cam.x + w / 2, cam.y + h / 2)
      ctx.scale(cam.zoom, cam.zoom)
      ctx.translate(-w / 2, -h / 2)

      // Center guide ring
      const ringR = Math.min(w, h) * 0.3
      ctx.beginPath(); ctx.arc(w / 2, h / 2, ringR, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1; ctx.stroke()

      // Edges
      const edgeLW = 1 / cam.zoom
      edges.forEach(e => {
        const src = nodes.find(n => n.id === e.sourceNodeId)
        const tgt = nodes.find(n => n.id === e.targetNodeId)
        if (!src || !tgt) return
        
        let edgeAlpha = 0.08
        let edgeColor = '255,255,255'
        
        if (e.edgeType === 'suggested') edgeColor = '200,160,240' // Purple-ish
        if (e.edgeType === 'confirmed') edgeColor = '134,215,255' // Blue-ish
        
        if (activeId) {
          if (e.sourceNodeId === activeId || e.targetNodeId === activeId) {
            edgeAlpha = 0.7
            if (hoverId) edgeAlpha = 0.9
          } else {
            edgeAlpha = 0.02
          }
        }
        
        ctx.beginPath(); ctx.moveTo(src.x, src.y); ctx.lineTo(tgt.x, tgt.y)
        ctx.strokeStyle = `rgba(${edgeColor},${edgeAlpha})`
        ctx.lineWidth = (activeId && (e.sourceNodeId === activeId || e.targetNodeId === activeId)) ? edgeLW * 2 : edgeLW
        ctx.stroke()
      })

      // Magnetic snap preview
      const snap = snapTargetRef.current
      if (snap && dragged) {
        const srcN = nodes.find(n => n.id === dragged)
        const tgtN = nodes.find(n => n.id === snap)
        if (srcN && tgtN) {
          ctx.beginPath(); ctx.moveTo(srcN.x, srcN.y); ctx.lineTo(tgtN.x, tgtN.y)
          ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5 / cam.zoom
          ctx.setLineDash([5 / cam.zoom, 5 / cam.zoom]); ctx.stroke(); ctx.setLineDash([])
          // target halo
          ctx.beginPath(); ctx.arc(tgtN.x, tgtN.y, tgtN.radius + 12, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill()
          ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1 / cam.zoom; ctx.stroke()
        }
      }

      // Nodes
      const fontSize = 10 / cam.zoom
      ctx.font = `${fontSize}px Inter, sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'

      nodes.forEach(n => {
        ctx.globalAlpha = n.alpha
        ctx.beginPath(); ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
        ctx.fillStyle = n.color; ctx.fill()

        if (n.nodeType === 'draft') {
          ctx.beginPath(); ctx.arc(n.x, n.y, n.radius + 1.5 / cam.zoom, 0, Math.PI * 2)
          ctx.setLineDash([3 / cam.zoom, 3 / cam.zoom])
          ctx.strokeStyle = 'rgba(251,191,36,0.5)'; ctx.lineWidth = 0.8 / cam.zoom; ctx.stroke()
          ctx.setLineDash([])
        }

        // selected ring
        if (n.id === selId) {
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2 / cam.zoom; ctx.stroke()
        }

        // Label: parent types always, document/leaf only at high zoom with LOD fade
        const isPar = isParentType(n.nodeType)
        let labelAlpha = 0
        if (isPar) {
          labelAlpha = n.alpha
        } else {
          if (cam.zoom > 1.7) labelAlpha = n.alpha
          else if (cam.zoom > 1.3) labelAlpha = ((cam.zoom - 1.3) / 0.4) * n.alpha
        }
        if (labelAlpha > 0.01) {
          ctx.globalAlpha = labelAlpha
          ctx.fillStyle = '#E2E8F0'
          const lbl = n.label.length > 18 ? n.label.slice(0, 18) + '…' : n.label
          ctx.fillText(lbl, n.x, n.y + n.radius + 6 / cam.zoom)
        }
        ctx.globalAlpha = 1
      })

      ctx.restore()
      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [canvasRef, snapshot])

  // --- Pointer Handlers ---
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const cam = cameraRef.current
    const { w, h } = sizeRef.current
    const wx = (sx - cam.x - w / 2) / cam.zoom + w / 2
    const wy = (sy - cam.y - h / 2) / cam.zoom + h / 2
    return { x: wx, y: wy }
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top
    const world = screenToWorld(sx, sy)

    let hitId: string | null = null, hitDist = Infinity
    nodesRef.current.forEach(n => {
      const d = Math.hypot(n.x - world.x, n.y - world.y)
      const hr = n.radius + 15 / cameraRef.current.zoom
      if (d < hr && d < hitDist) { hitDist = d; hitId = n.id }
    })

    pointerDownPosRef.current = { x: sx, y: sy }
    hasDraggedRef.current = false

    if (hitId) {
      dragNodeRef.current = hitId
      lastPtrRef.current = { x: sx, y: sy }
      return
    }

    isPanningRef.current = true
    lastPtrRef.current = { x: sx, y: sy }
    onSelectNode(null)
  }, [containerRef, screenToWorld, onSelectNode])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top
    const dx = sx - lastPtrRef.current.x, dy = sy - lastPtrRef.current.y

    if (pointerDownPosRef.current && !hasDraggedRef.current) {
      const pdx = sx - pointerDownPosRef.current.x
      const pdy = sy - pointerDownPosRef.current.y
      if (Math.hypot(pdx, pdy) > 5) {
        hasDraggedRef.current = true
      }
    }

    if (isPanningRef.current) {
      cameraRef.current.x += dx; cameraRef.current.y += dy
      setCameraState({ ...cameraRef.current })
    } else if (dragNodeRef.current && hasDraggedRef.current) {
      const world = screenToWorld(sx, sy)
      const { w, h } = sizeRef.current
      const cx = Math.max(PADDING, Math.min(w - PADDING, world.x))
      const cy = Math.max(PADDING, Math.min(h - PADDING, world.y))
      const node = nodesRef.current.find(n => n.id === dragNodeRef.current)
      if (node) { node.x = cx; node.y = cy; node.vx = 0; node.vy = 0 }

      const cam = cameraRef.current
      let closestId: string | null = null, closestDist = 60
      nodesRef.current.forEach(n => {
        if (n.id === dragNodeRef.current) return
        const nsx = (n.x - w / 2) * cam.zoom + cam.x + w / 2
        const nsy = (n.y - h / 2) * cam.zoom + cam.y + h / 2
        const d = Math.hypot(sx - nsx, sy - nsy)
        if (d < closestDist) { closestDist = d; closestId = n.id }
      })
      snapTargetRef.current = closestId
    } else if (!dragNodeRef.current) {
      const world = screenToWorld(sx, sy)
      let hoverId: string | null = null, hitDist = Infinity
      nodesRef.current.forEach(n => {
        const d = Math.hypot(n.x - world.x, n.y - world.y)
        const hr = n.radius + 10 / cameraRef.current.zoom
        if (d < hr && d < hitDist) { hitDist = d; hoverId = n.id }
      })
      if (hoverId !== hoveredRef.current) {
        onHoverNode(hoverId)
        if (hoverId) {
          const hNode = nodesRef.current.find(n => n.id === hoverId)
          if (hNode) {
            const cam = cameraRef.current
            const { w, h } = sizeRef.current
            const hsx = (hNode.x - w / 2) * cam.zoom + cam.x + w / 2
            const hsy = (hNode.y - h / 2) * cam.zoom + cam.y + h / 2
            setHoverScreenPos({ x: hsx, y: hsy })
          }
        } else {
          setHoverScreenPos(null)
        }
      }
    }
    lastPtrRef.current = { x: sx, y: sy }
  }, [containerRef, screenToWorld, onHoverNode])

  const handlePointerUp = useCallback(async () => {
    if (dragNodeRef.current) {
      if (hasDraggedRef.current) {
        const draggedId = dragNodeRef.current
        const snapId = snapTargetRef.current

        if (snapId && onCreateEdgeRef.current) {
          await onCreateEdgeRef.current(draggedId, snapId)
        }

        if (onNodeDragEnd) {
          const node = nodesRef.current.find(n => n.id === draggedId)
          if (node) {
            const { w, h } = sizeRef.current
            const fx = Math.max(PADDING, Math.min(w - PADDING, node.x))
            const fy = Math.max(PADDING, Math.min(h - PADDING, node.y))
            node.hasSavedPosition = true
            node.targetX = fx
            node.targetY = fy
            onNodeDragEnd(node.id, fx, fy)
          }
        }
      } else {
        onSelectNode(dragNodeRef.current)
      }
    }
    isPanningRef.current = false
    dragNodeRef.current = null
    snapTargetRef.current = null
    pointerDownPosRef.current = null
    hasDraggedRef.current = false
  }, [onNodeDragEnd, onSelectNode])

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const { w, h } = sizeRef.current
    const cam = cameraRef.current
    const factor = Math.exp(e.deltaY * -0.002)
    const newZoom = Math.max(0.3, Math.min(4.0, cam.zoom * factor))
    const scale = newZoom / cam.zoom
    const cx = mx - w / 2, cy = my - h / 2
    const nx = cx - (cx - cam.x) * scale
    const ny = cy - (cy - cam.y) * scale
    cameraRef.current = { x: nx, y: ny, zoom: newZoom }
    setCameraState({ x: nx, y: ny, zoom: newZoom })
  }, [containerRef])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => { el.removeEventListener('wheel', handleWheel) }
  }, [handleWheel, containerRef])

  // --- Zoom controls ---
  const zoomIn = useCallback(() => {
    const cam = cameraRef.current
    const nz = Math.min(4.0, cam.zoom * 1.3)
    cameraRef.current = { ...cam, zoom: nz }
    setCameraState({ ...cam, zoom: nz })
  }, [])

  const zoomOut = useCallback(() => {
    const cam = cameraRef.current
    const nz = Math.max(0.3, cam.zoom / 1.3)
    cameraRef.current = { ...cam, zoom: nz }
    setCameraState({ ...cam, zoom: nz })
  }, [])

  const centerView = useCallback(() => {
    cameraRef.current = { x: 0, y: 0, zoom: 1 }
    setCameraState({ x: 0, y: 0, zoom: 1 })
  }, [])

  const filteredNodes = nodesRef.current
  const filteredEdges = edgesRef.current
  const suggestionCount = filteredEdges.filter(e => e.edgeType === 'suggested').length
  const connectedIds = new Set<string>()
  filteredEdges.forEach(e => { connectedIds.add(e.sourceNodeId); connectedIds.add(e.targetNodeId) })
  const isolatedCount = filteredNodes.filter(n => !connectedIds.has(n.id)).length

  return {
    camera,
    hoverScreenPos,
    handlePointerDown, handlePointerMove, handlePointerUp,
    zoomIn, zoomOut, centerView,
    nodeCount: filteredNodes.length,
    edgeCount: filteredEdges.length,
    suggestionCount,
    isolatedCount,
  }
}
