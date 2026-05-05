'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import {
  Search,
  SlidersHorizontal,
  Plus,
  Minus,
  Crosshair,
  X,
  FileText,
  Network,
  FolderTree,
  Hash,
  PenTool,
  Link2,
  Unlink,
  Globe,
  Lightbulb,
  HelpCircle,
  Clock,
  LayoutList,
} from 'lucide-react'
import type { StoredMindNode, StoredMindEdge } from '@/lib/repository'
import {
  toMindGraphViewModel,
  toRepositoryEdgeType,
  type MindGraphViewModel,
  type FilterState,
  type CanvasEdgeType,
} from './graphAdapter'
import type { MindEdgeType } from '@atlax/domain'

interface MindCanvasStageProps {
  nodes: StoredMindNode[]
  edges: StoredMindEdge[]
  onOpenEditor: (id: number) => void
  onOpenInDock?: (dockItemId: number) => void
  onToast: (msg: string) => void
  activeModule?: string
  onCreateEdge?: (sourceId: string, targetId: string, edgeType: MindEdgeType) => void
  onDeleteEdge?: (sourceId: string, targetId: string) => void
}

type LayoutMode = 'radial' | 'force' | 'orbit'

interface GraphStats {
  domainCount: number
  documentCount: number
  domainOptions: { id: string; title: string }[]
}

interface GNode {
  id: string
  x: number
  y: number
  tx: number
  ty: number
  vx: number
  vy: number
  radius: number
  color: string
  type: string
  title: string
  documentId: number | null
}

interface GEdge {
  id: string
  source: GNode
  target: GNode
  type: CanvasEdgeType
  synthetic?: boolean
}

const NODE_COLORS: Record<string, string> = {
  root: '#c4b5fd',
  domain: '#8b5cf6',
  project: '#8b5cf6',
  document: '#bbf7d0',
  source: '#34d399',
  tag: '#f472b6',
  insight: '#fbbf24',
  question: '#60a5fa',
  time: '#fb923c',
  topic: '#8b5cf6',
  fragment: '#6ee7b7',
}

const NODE_RADII: Record<string, number> = {
  root: 10,
  domain: 6,
  project: 6,
  document: 3,
  source: 3,
  tag: 3,
  insight: 3,
  question: 3,
  time: 3,
  topic: 6,
  fragment: 3,
}

const NODE_STROKE_COLORS: Record<string, string> = {
  root: 'rgba(196, 181, 253, 0.6)',
  domain: 'rgba(139, 92, 246, 0.3)',
  project: 'rgba(139, 92, 246, 0.3)',
  document: 'rgba(187, 247, 208, 0.3)',
  source: 'rgba(52, 211, 153, 0.3)',
  tag: 'rgba(244, 114, 182, 0.3)',
  insight: 'rgba(251, 191, 36, 0.3)',
  question: 'rgba(96, 165, 250, 0.3)',
  time: 'rgba(251, 146, 60, 0.3)',
  topic: 'rgba(139, 92, 246, 0.3)',
  fragment: 'rgba(110, 231, 183, 0.3)',
}

function stableHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0
  }
  return (h >>> 0) / 0x100000000
}

const DOCUMENT_LIKE_TYPES = new Set(['document', 'source', 'fragment'])

function isNodeVisible(node: GNode, filter: FilterState, orphanNodeIds?: Set<string>): boolean {
  if (DOCUMENT_LIKE_TYPES.has(node.type) && !filter.showDocuments) return false
  if (node.type === 'tag' && !filter.showTags) return false
  if (!filter.showOrphans && orphanNodeIds && orphanNodeIds.has(node.id)) return false
  return true
}

function isEdgeVisible(edge: GEdge, filter: FilterState, orphanNodeIds?: Set<string>): boolean {
  if (edge.type === 'tree' && !filter.showStructuralLinks) return false
  if (edge.type === 'net' && !filter.showNetworkLinks) return false
  const srcVisible = isNodeVisible(edge.source, filter, orphanNodeIds)
  const tgtVisible = isNodeVisible(edge.target, filter, orphanNodeIds)
  if (!srcVisible || !tgtVisible) return false
  return true
}

function isNodeDimmed(
  node: GNode,
  filter: FilterState,
  focusNodeId: string | null,
  connectedNodeIds: Set<string>,
  domainChildIds: Set<string>,
): boolean {
  if (focusNodeId && !connectedNodeIds.has(node.id)) return true
  const searchLower = filter.filterSearch.trim().toLowerCase()
  if (searchLower && !node.title.toLowerCase().includes(searchLower)) return true
  const tagLower = filter.filterTags.trim().toLowerCase()
  if (tagLower && !node.title.toLowerCase().includes(tagLower) && !node.type.toLowerCase().includes(tagLower)) return true
  if (filter.selectedDomainId !== 'all' && domainChildIds.size > 0 && !domainChildIds.has(node.id) && node.type !== 'root') return true
  return false
}

const DOMAIN_TYPES = new Set(['domain', 'project', 'topic'])

function buildWorldTree(vm: MindGraphViewModel, layoutMode: LayoutMode): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = []
  const nodeMap = new Map<string, GNode>()

  const rootNodeDef = vm.rootNodeId ? vm.nodes.find(n => n.id === vm.rootNodeId) : null
  const domainNodeDefs = vm.domainNodes
  const leafNodeDefs = vm.nodes.filter(n => n.nodeType !== 'root' && !DOMAIN_TYPES.has(n.nodeType))

  let rootNode: GNode | undefined

  if (!rootNodeDef) {
    rootNode = {
      id: '__world_tree_root__', x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0,
      radius: NODE_RADII.root, color: NODE_COLORS.root, type: 'root', title: 'World Tree', documentId: null,
    }
    nodes.push(rootNode)
    nodeMap.set(rootNode.id, rootNode)
  } else {
    const gnode: GNode = {
      id: rootNodeDef.id, x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0,
      radius: NODE_RADII.root, color: NODE_COLORS[rootNodeDef.nodeType] || NODE_COLORS.root,
      type: 'root', title: rootNodeDef.label || 'World Tree', documentId: rootNodeDef.documentId,
    }
    nodes.push(gnode)
    nodeMap.set(gnode.id, gnode)
    rootNode = gnode
  }

  if (!rootNode) return { nodes, edges: [] }
  const root = rootNode

  const virtualDomainNames = ['System Design', 'Frontend', 'Backend', 'AI/ML', 'DevOps', 'Product', 'Research', 'Growth']

  let domainGNodes: GNode[] = []

  if (domainNodeDefs.length === 0 && leafNodeDefs.length > 0) {
    const docsPerDomain = Math.max(4, Math.ceil(leafNodeDefs.length / 8))
    for (let i = 0; i < leafNodeDefs.length; i += docsPerDomain) {
      const groupIdx = Math.floor(i / docsPerDomain)
      const vdomain: GNode = {
        id: `__vdomain_${groupIdx}__`,
        x: 0, y: 0,
        tx: 0, ty: 0, vx: 0, vy: 0,
        radius: NODE_RADII.domain,
        color: NODE_COLORS.domain,
        type: 'domain',
        title: virtualDomainNames[groupIdx % virtualDomainNames.length],
        documentId: null,
      }
      nodes.push(vdomain)
      nodeMap.set(vdomain.id, vdomain)
    }
    domainGNodes = nodes.filter(n => n.type === 'domain')
  } else {
    domainNodeDefs.forEach(n => {
      const domain: GNode = {
        id: n.id,
        x: 0, y: 0,
        tx: 0, ty: 0, vx: 0, vy: 0,
        radius: NODE_RADII[n.nodeType] || NODE_RADII.domain,
        color: NODE_COLORS[n.nodeType] || NODE_COLORS.domain,
        type: 'domain',
        title: n.label || 'Domain',
        documentId: n.documentId,
      }
      nodes.push(domain)
      nodeMap.set(domain.id, domain)
    })
    domainGNodes = nodes.filter(n => n.type === 'domain')
  }

  leafNodeDefs.forEach((n, i) => {
    const doc: GNode = {
      id: n.id,
      x: 0, y: 0,
      tx: 0, ty: 0, vx: 0, vy: 0,
      radius: NODE_RADII[n.nodeType] || NODE_RADII.document,
      color: NODE_COLORS[n.nodeType] || NODE_COLORS.document,
      type: n.nodeType,
      title: n.label || `Note ${i + 1}`,
      documentId: n.documentId,
    }
    nodes.push(doc)
    nodeMap.set(doc.id, doc)
  })

  const edges: GEdge[] = []

  domainGNodes.forEach(dn => {
    const tgt = nodeMap.get(dn.id)
    if (tgt) edges.push({ id: `e_${root.id}_${tgt.id}`, source: root, target: tgt, type: 'tree', synthetic: true })
  })

  leafNodeDefs.forEach(n => {
    const treeParent = vm.edges.find(e => e.edgeType === 'tree' && e.targetNodeId === n.id)
    let parentId: string | undefined
    let isSynthetic = true
    if (treeParent) {
      parentId = treeParent.sourceNodeId
      isSynthetic = false
    } else {
      const idx = leafNodeDefs.indexOf(n)
      parentId = domainGNodes[idx % Math.max(domainGNodes.length, 1)]?.id
    }
    if (!parentId) parentId = root.id
    const src = nodeMap.get(parentId)
    const tgt = nodeMap.get(n.id)
    if (src && tgt) edges.push({ id: `e_${src.id}_${tgt.id}`, source: src, target: tgt, type: 'tree', synthetic: isSynthetic })
  })

  const treeEdgeIds = new Set(edges.map(e => e.id))
  vm.edges.filter(e => e.edgeType === 'net').forEach(e => {
    const src = nodeMap.get(e.sourceNodeId)
    const tgt = nodeMap.get(e.targetNodeId)
    if (src && tgt) {
      const eid = `e_${src.id}_${tgt.id}`
      const eidRev = `e_${tgt.id}_${src.id}`
      if (!treeEdgeIds.has(eid) && !treeEdgeIds.has(eidRev)) {
        edges.push({ id: eid, source: src, target: tgt, type: 'net' })
        treeEdgeIds.add(eid)
      }
    }
  })

  calculateTargetPositions(nodes, edges, layoutMode)

  nodes.forEach(n => {
    if (n.type === 'root') return
    const jitter = (stableHash(n.id + '_jx') - 0.5) * 20
    const jitterY = (stableHash(n.id + '_jy') - 0.5) * 20
    n.x = n.tx + jitter
    n.y = n.ty + jitterY
  })

  return { nodes, edges }
}

function mergeWorldTreeGraph(prev: { nodes: GNode[]; edges: GEdge[] }, next: { nodes: GNode[]; edges: GEdge[] }): { nodes: GNode[]; edges: GEdge[] } {
  const nodeMap = new Map<string, GNode>()
  prev.nodes.forEach(n => nodeMap.set(n.id, n))

  const mergedNodes: GNode[] = []
  next.nodes.forEach(n => {
    const old = nodeMap.get(n.id)
    if (old) {
      mergedNodes.push({ ...n, x: old.x, y: old.y, vx: old.vx, vy: old.vy, tx: n.tx, ty: n.ty })
    } else {
      const jitter = (stableHash(n.id + '_jx') - 0.5) * 20
      const jitterY = (stableHash(n.id + '_jy') - 0.5) * 20
      mergedNodes.push({ ...n, x: n.tx + jitter, y: n.ty + jitterY })
    }
  })

  const edgeMap = new Map<string, GEdge>()
  prev.edges.forEach(e => edgeMap.set(e.id, e))

  const mergedEdges: GEdge[] = []
  const newNodeMap = new Map<string, GNode>()
  mergedNodes.forEach(n => newNodeMap.set(n.id, n))

  next.edges.forEach(e => {
    const src = newNodeMap.get(e.source.id)
    const tgt = newNodeMap.get(e.target.id)
    if (src && tgt) {
      const old = edgeMap.get(e.id)
      mergedEdges.push(old ? { ...old, source: src, target: tgt } : { ...e, source: src, target: tgt })
    }
  })

  return { nodes: mergedNodes, edges: mergedEdges }
}

function calculateTargetPositions(nodes: GNode[], edges: GEdge[], layoutMode: LayoutMode) {
  const root = nodes.find(n => n.type === 'root')
  if (root) { root.tx = 0; root.ty = 0 }
  const domains = nodes.filter(n => n.type === 'domain')

  const childrenMap = new Map<string, GNode[]>()
  edges.filter(e => e.type === 'tree').forEach(e => {
    const list = childrenMap.get(e.source.id) || []
    list.push(e.target)
    childrenMap.set(e.source.id, list)
  })

  const rootDirectChildren = (root ? (childrenMap.get(root.id) || []) : []).filter(n => n.type !== 'domain')
  const rcAngleStep = (Math.PI * 2) / Math.max(rootDirectChildren.length, 1)
  rootDirectChildren.forEach((c, i) => {
    const cAngle = i * rcAngleStep
    c.tx = Math.cos(cAngle) * 120
    c.ty = Math.sin(cAngle) * 120
  })

  if (layoutMode === 'radial') {
    const dAngleStep = (Math.PI * 2) / Math.max(domains.length, 1)
    domains.forEach((d, i) => {
      const dAngle = i * dAngleStep
      d.tx = Math.cos(dAngle) * 200
      d.ty = Math.sin(dAngle) * 200
      const children = childrenMap.get(d.id) || []
      const cAngleStep = (Math.PI * 2) / Math.max(1, children.length)
      children.forEach((c, j) => {
        const cAngle = j * cAngleStep
        c.tx = d.tx + Math.cos(cAngle) * 80
        c.ty = d.ty + Math.sin(cAngle) * 80
      })
    })
  } else if (layoutMode === 'orbit') {
    domains.forEach((d, i) => {
      const hash = stableHash(d.id)
      const radius = 150 + i * 50
      const theta = hash * Math.PI * 2
      d.tx = Math.cos(theta) * radius
      d.ty = Math.sin(theta) * radius
    })
    domains.forEach((d) => {
      const children = childrenMap.get(d.id) || []
      children.forEach((c, j) => {
        const hash = stableHash(c.id)
        const childRadius = 40 + hash * 30
        const childTheta = (j / Math.max(children.length, 1)) * Math.PI * 2 + hash * 0.5
        c.tx = d.tx + Math.cos(childTheta) * childRadius
        c.ty = d.ty + Math.sin(childTheta) * childRadius
      })
    })
  } else if (layoutMode === 'force') {
    const dAngleStep = (Math.PI * 2) / Math.max(domains.length, 1)
    domains.forEach((d, i) => {
      const dAngle = i * dAngleStep
      d.tx = Math.cos(dAngle) * 150
      d.ty = Math.sin(dAngle) * 150
    })
    domains.forEach((d) => {
      const children = childrenMap.get(d.id) || []
      children.forEach((c, j) => {
        const hash = stableHash(c.id)
        const childRadius = 40 + hash * 30
        const childTheta = (j / Math.max(children.length, 1)) * Math.PI * 2
        c.tx = d.tx + Math.cos(childTheta) * childRadius
        c.ty = d.ty + Math.sin(childTheta) * childRadius
      })
    })
  }
}

export default function MindCanvasStage({ nodes: storedNodes, edges: storedEdges, onOpenEditor, onOpenInDock, onToast, onCreateEdge, onDeleteEdge }: MindCanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)

  const graphRef = useRef<{ nodes: GNode[]; edges: GEdge[] }>({ nodes: [], edges: [] })
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 })
  const dragRef = useRef<{
    type: 'pan' | 'node' | null
    node: GNode | null
    startX: number
    startY: number
    pointerDownTime: number
    pointerDownPos: { x: number; y: number }
  }>({ type: null, node: null, startX: 0, startY: 0, pointerDownTime: 0, pointerDownPos: { x: 0, y: 0 } })
  const potentialLinkTargetRef = useRef<GNode | null>(null)
  const focusedNodeRef = useRef<GNode | null>(null)
  const hasCenteredRef = useRef(false)

  const [layoutMode, setLayoutMode] = useState<LayoutMode>('radial')
  const [focusedNode, setFocusedNode] = useState<GNode | null>(null)
  const [hudCollapsed, setHudCollapsed] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [showDocuments, setShowDocuments] = useState(true)
  const [showTags, setShowTags] = useState(true)
  const [showOrphans, setShowOrphans] = useState(true)
  const [showStructuralLinks, setShowStructuralLinks] = useState(true)
  const [showNetworkLinks, setShowNetworkLinks] = useState(true)
  const [filterSearch, setFilterSearch] = useState('')
  const [filterTags, setFilterTags] = useState('')
  const [selectedDomainId, setSelectedDomainId] = useState('all')
  const [mindToast, setMindToast] = useState('')
  const [graphStats, setGraphStats] = useState<GraphStats>({
    domainCount: 0,
    documentCount: 0,
    domainOptions: [],
  })

  const filterStateRef = useRef<FilterState>({
    showDocuments: true,
    showTags: true,
    showOrphans: true,
    showStructuralLinks: true,
    showNetworkLinks: true,
    filterSearch: '',
    filterTags: '',
    selectedDomainId: 'all',
  })
  filterStateRef.current = {
    showDocuments,
    showTags,
    showOrphans,
    showStructuralLinks,
    showNetworkLinks,
    filterSearch,
    filterTags,
    selectedDomainId,
  }

  const layoutModeRef = useRef<LayoutMode>('radial')
  layoutModeRef.current = layoutMode

  const showMindToast = useCallback((msg: string) => {
    setMindToast(msg)
    setTimeout(() => setMindToast(''), 2000)
  }, [])

  const centerCamera = useCallback(() => {
    cameraRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 1 }
  }, [])

  const initGraph = useCallback(() => {
    const vm = toMindGraphViewModel(storedNodes, storedEdges)
    const fresh = buildWorldTree(vm, layoutModeRef.current)
    const merged = mergeWorldTreeGraph(graphRef.current, fresh)
    graphRef.current = merged
    calculateTargetPositions(merged.nodes, merged.edges, layoutModeRef.current)
    if (!hasCenteredRef.current && merged.nodes.length > 0) {
      centerCamera()
      hasCenteredRef.current = true
    }
    setGraphStats({
      domainCount: merged.nodes.filter(n => DOMAIN_TYPES.has(n.type)).length,
      documentCount: merged.nodes.filter(n => DOCUMENT_LIKE_TYPES.has(n.type)).length,
      domainOptions: merged.nodes.filter(n => DOMAIN_TYPES.has(n.type)).map(n => ({ id: n.id, title: n.title })),
    })
  }, [storedNodes, storedEdges, centerCamera])

  const applyPhysics = useCallback(() => {
    const g = graphRef.current
    const mode = layoutModeRef.current
    const draggedNode = dragRef.current.node

    if (mode === 'radial' || mode === 'orbit') {
      g.nodes.forEach(n => {
        if (n === draggedNode) return
        n.x += (n.tx - n.x) * 0.1
        n.y += (n.ty - n.y) * 0.1
        n.vx = 0
        n.vy = 0
      })
    } else {
      const root = g.nodes.find(n => n.type === 'root')
      if (root) { root.x = 0; root.y = 0; root.vx = 0; root.vy = 0 }

      for (let i = 0; i < g.nodes.length; i++) {
        for (let j = i + 1; j < g.nodes.length; j++) {
          const dx = g.nodes[i].x - g.nodes[j].x
          const dy = g.nodes[i].y - g.nodes[j].y
          const distSq = dx * dx + dy * dy
          if (distSq < 25000 && distSq > 0) {
            const force = 60 / distSq
            g.nodes[i].vx += dx * force
            g.nodes[i].vy += dy * force
            g.nodes[j].vx -= dx * force
            g.nodes[j].vy -= dy * force
          }
        }
      }

      g.edges.forEach(edge => {
        const s = edge.source, t = edge.target
        const dx = t.x - s.x, dy = t.y - s.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 0) {
          const targetDist = (s.type === 'root' || t.type === 'root') ? 150 : 50
          const force = (dist - targetDist) * 0.003
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          if (s.type !== 'root') { s.vx += fx; s.vy += fy }
          if (t.type !== 'root') { t.vx -= fx; t.vy -= fy }
        }
      })

      g.nodes.forEach(n => {
        if (n === draggedNode || n.type === 'root') return
        n.vx *= 0.8
        n.vy *= 0.8
        n.x += n.vx
        n.y += n.vy
        const maxDist = 600
        const dist = Math.sqrt(n.x * n.x + n.y * n.y)
        if (dist > maxDist) {
          const scale = maxDist / dist
          n.x *= scale
          n.y *= scale
          n.vx *= 0.5
          n.vy *= 0.5
        }
      })
    }
  }, [])

  const drawOrbitalRings = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.beginPath()
    ctx.arc(0, 0, 200, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)'
    ctx.lineWidth = 1
    ctx.stroke()
    if (layoutModeRef.current === 'orbit') {
      const domains = graphRef.current.nodes.filter(n => n.type === 'domain')
      domains.forEach((_, i) => {
        ctx.beginPath()
        ctx.arc(0, 0, 150 + i * 50, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)'
        ctx.stroke()
      })
    }
  }, [])

  const animateMind = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.width
    const h = canvas.height
    const cam = cameraRef.current
    const g = graphRef.current
    const draggedNode = dragRef.current.node
    const potentialTarget = potentialLinkTargetRef.current
    const focused = focusedNodeRef.current
    const filter = filterStateRef.current

    applyPhysics()

    ctx.clearRect(0, 0, w, h)
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.translate(cam.x, cam.y)
    ctx.scale(cam.zoom, cam.zoom)

    drawOrbitalRings(ctx)

    const connectedNodeIds = new Set<string>()
    const connectedEdges = new Set<GEdge>()
    if (focused) {
      connectedNodeIds.add(focused.id)
      g.edges.forEach(edge => {
        if (edge.source === focused || edge.target === focused) {
          connectedEdges.add(edge)
          connectedNodeIds.add(edge.source.id)
          connectedNodeIds.add(edge.target.id)
        }
      })
    }

    const domainChildIds = new Set<string>()
    if (filter.selectedDomainId !== 'all') {
      domainChildIds.add(filter.selectedDomainId)
      g.edges.filter(e => e.type === 'tree' && e.source.id === filter.selectedDomainId).forEach(e => domainChildIds.add(e.target.id))
      g.edges.filter(e => e.type === 'tree' && e.target.id === filter.selectedDomainId).forEach(e => domainChildIds.add(e.source.id))
    }

    const orphanNodeIds = new Set<string>()
    if (!filter.showOrphans) {
      const connectedIds = new Set<string>()
      g.edges.filter(e => !e.synthetic).forEach(e => { connectedIds.add(e.source.id); connectedIds.add(e.target.id) })
      g.nodes.forEach(n => { if (!connectedIds.has(n.id)) orphanNodeIds.add(n.id) })
    }

    ctx.lineWidth = 1 / cam.zoom
    g.edges.forEach(edge => {
      if (!isEdgeVisible(edge, filter, orphanNodeIds)) return

      const s = edge.source, t = edge.target
      const sDimmed = isNodeDimmed(s, filter, focused?.id ?? null, connectedNodeIds, domainChildIds)
      const tDimmed = isNodeDimmed(t, filter, focused?.id ?? null, connectedNodeIds, domainChildIds)
      const isFaded = sDimmed || tDimmed

      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(t.x, t.y)
      if (isFaded) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)'
      } else if (edge.type === 'tree') {
        ctx.strokeStyle = 'rgba(167, 139, 250, 0.15)'
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
      }
      if (edge.type === 'net') ctx.setLineDash([4 / cam.zoom, 4 / cam.zoom])
      ctx.stroke()
      ctx.setLineDash([])
    })

    if (draggedNode && potentialTarget) {
      ctx.beginPath()
      ctx.moveTo(draggedNode.x, draggedNode.y)
      ctx.lineTo(potentialTarget.x, potentialTarget.y)
      ctx.setLineDash([4 / cam.zoom, 4 / cam.zoom])
      ctx.strokeStyle = '#a78bfa'
      ctx.lineWidth = 1.5 / cam.zoom
      ctx.stroke()
      ctx.setLineDash([])
    }

    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.font = `${10 / cam.zoom}px Inter, sans-serif`

    g.nodes.forEach(node => {
      if (!isNodeVisible(node, filter, orphanNodeIds)) return

      const dimmed = isNodeDimmed(node, filter, focused?.id ?? null, connectedNodeIds, domainChildIds)

      ctx.globalAlpha = dimmed ? 0.15 : 1

      ctx.beginPath()
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
      ctx.fillStyle = node.color
      ctx.fill()

      if (!dimmed) {
        if (node.type === 'root') {
          ctx.lineWidth = 3 / cam.zoom
          ctx.strokeStyle = 'rgba(196, 181, 253, 0.6)'
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(node.x, node.y, node.radius + 4 / cam.zoom, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(196, 181, 253, 0.2)'
          ctx.lineWidth = 2.5 / cam.zoom
          ctx.stroke()
        } else {
          ctx.lineWidth = 1 / cam.zoom
          ctx.strokeStyle = NODE_STROKE_COLORS[node.type] || 'rgba(167, 139, 250, 0.3)'
          ctx.stroke()
        }
      }

      if (node === potentialTarget) {
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius + 4 / cam.zoom, 0, Math.PI * 2)
        ctx.strokeStyle = 'white'
        ctx.lineWidth = 1.5 / cam.zoom
        ctx.stroke()
      }

      if (!dimmed && (NODE_RADII[node.type] >= 6 || cam.zoom > 1.5 || focused === node)) {
        ctx.fillStyle = DOCUMENT_LIKE_TYPES.has(node.type) ? '#8B8B8B' : '#E2E8F0'
        ctx.font = `${(node.type === 'root' ? 11 : 10) / cam.zoom}px Inter, sans-serif`
        ctx.fillText(node.title, node.x, node.y + node.radius + 6 / cam.zoom)
      }

      ctx.globalAlpha = 1.0
    })

    ctx.restore()
    animFrameRef.current = requestAnimationFrame(animateMind)
  }, [applyPhysics, drawOrbitalRings])

  useEffect(() => {
    initGraph()

    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
    }
    window.addEventListener('resize', resize)
    resize()

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    animFrameRef.current = requestAnimationFrame(animateMind)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [initGraph, animateMind])

  useEffect(() => {
    if (storedNodes.length === 0) return
    const g = graphRef.current
    if (g.nodes.length === 0) return
    setGraphStats(prev => {
      const domainOpts = g.nodes.filter(n => DOMAIN_TYPES.has(n.type)).map(n => ({ id: n.id, title: n.title }))
      if (prev.domainOptions.length === domainOpts.length && prev.domainOptions.every((d, i) => d.id === domainOpts[i]?.id)) return prev
      return {
        domainCount: domainOpts.length,
        documentCount: g.nodes.filter(n => DOCUMENT_LIKE_TYPES.has(n.type)).length,
        domainOptions: domainOpts,
      }
    })
  }, [storedNodes, storedEdges])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const cam = cameraRef.current
      const zoomIntensity = 0.002
      const zoomFactor = Math.exp(e.deltaY * -zoomIntensity)
      cam.x = e.clientX - (e.clientX - cam.x) * zoomFactor
      cam.y = e.clientY - (e.clientY - cam.y) * zoomFactor
      cam.zoom *= zoomFactor
      cam.zoom = Math.max(0.3, Math.min(cam.zoom, 4))
    }

    const handlePointerDown = (e: PointerEvent) => {
      const cam = cameraRef.current
      const worldX = (e.clientX - cam.x) / cam.zoom
      const worldY = (e.clientY - cam.y) / cam.zoom
      const g = graphRef.current
      const filter = filterStateRef.current
      const hit = [...g.nodes].reverse().find(n => {
        if (!isNodeVisible(n, filter, undefined)) return false
        return Math.hypot(n.x - worldX, n.y - worldY) < n.radius + 15 / cam.zoom
      })

      if (hit) {
        dragRef.current = { type: 'node', node: hit, startX: e.clientX, startY: e.clientY, pointerDownTime: Date.now(), pointerDownPos: { x: e.clientX, y: e.clientY } }
        canvas.style.cursor = 'grabbing'
      } else {
        dragRef.current = { type: 'pan', node: null, startX: e.clientX, startY: e.clientY, pointerDownTime: Date.now(), pointerDownPos: { x: e.clientX, y: e.clientY } }
        canvas.style.cursor = 'move'
      }
      try { canvas.setPointerCapture(e.pointerId) } catch {}
    }

    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragRef.current
      const cam = cameraRef.current
      const g = graphRef.current
      const filter = filterStateRef.current

      if (drag.type === 'node' && drag.node) {
        const draggedNode = drag.node
        const dx = (e.clientX - drag.startX) / cam.zoom
        const dy = (e.clientY - drag.startY) / cam.zoom
        draggedNode.x += dx
        draggedNode.y += dy
        draggedNode.vx = dx
        draggedNode.vy = dy
        if (layoutModeRef.current !== 'force') { draggedNode.tx = draggedNode.x; draggedNode.ty = draggedNode.y }

        potentialLinkTargetRef.current = null
        let minD = 60 / cam.zoom
        g.nodes.forEach(n => {
          if (n === draggedNode) return
          if (!isNodeVisible(n, filter, undefined)) return
          const d = Math.hypot(n.x - draggedNode.x, n.y - draggedNode.y)
          if (d < minD && n.type !== 'root') { minD = d; potentialLinkTargetRef.current = n }
        })

        drag.startX = e.clientX
        drag.startY = e.clientY
      } else if (drag.type === 'pan') {
        cam.x += e.clientX - drag.startX
        cam.y += e.clientY - drag.startY
        drag.startX = e.clientX
        drag.startY = e.clientY
      } else {
        const worldX = (e.clientX - cam.x) / cam.zoom
        const worldY = (e.clientY - cam.y) / cam.zoom
        const hovered = g.nodes.find(n => {
          if (!isNodeVisible(n, filter, undefined)) return false
          return Math.hypot(n.x - worldX, n.y - worldY) < n.radius + 15 / cam.zoom
        })
        canvas.style.cursor = hovered ? 'pointer' : 'default'
      }
    }

    const handlePointerUp = (e: PointerEvent) => {
      try { canvas.releasePointerCapture(e.pointerId) } catch {}
      canvas.style.cursor = 'default'
      const drag = dragRef.current
      const dist = Math.hypot(e.clientX - drag.pointerDownPos.x, e.clientY - drag.pointerDownPos.y)
      const isClick = dist < 5 && (Date.now() - drag.pointerDownTime) < 300

      if (isClick) {
        if (drag.node) {
          focusedNodeRef.current = drag.node
          setFocusedNode(drag.node)
        } else {
          focusedNodeRef.current = null
          setFocusedNode(null)
        }
      } else if (drag.node && potentialLinkTargetRef.current) {
        const src = drag.node
        const tgt = potentialLinkTargetRef.current
        const g = graphRef.current
        const exists = g.edges.some(edge => (edge.source === src && edge.target === tgt) || (edge.target === src && edge.source === tgt))
        if (!exists) {
          g.edges.push({ id: `e_${src.id}_${tgt.id}`, source: src, target: tgt, type: 'net' })
          showMindToast(`Linked to ${tgt.title}`)
          if (onCreateEdge) onCreateEdge(src.id, tgt.id, toRepositoryEdgeType('net'))
          if (focusedNodeRef.current === src || focusedNodeRef.current === tgt) {
            setFocusedNode(focusedNodeRef.current)
          }
        }
      }

      dragRef.current = { type: null, node: null, startX: 0, startY: 0, pointerDownTime: 0, pointerDownPos: { x: 0, y: 0 } }
      potentialLinkTargetRef.current = null
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', handlePointerUp)

    return () => {
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
    }
  }, [showMindToast, onCreateEdge])

  const switchLayout = useCallback((mode: LayoutMode) => {
    setLayoutMode(mode)
    const g = graphRef.current
    calculateTargetPositions(g.nodes, g.edges, mode)
    g.nodes.forEach(n => {
      if (n.type === 'root') return
      const dx = n.x - n.tx
      const dy = n.y - n.ty
      const distSq = dx * dx + dy * dy
      if (distSq > 500 * 500) {
        const jitter = (stableHash(n.id + '_jx') - 0.5) * 20
        const jitterY = (stableHash(n.id + '_jy') - 0.5) * 20
        n.x = n.tx + jitter
        n.y = n.ty + jitterY
        n.vx = 0
        n.vy = 0
      }
    })
    showMindToast(`Layout: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`)
  }, [showMindToast])

  const handleZoomIn = useCallback(() => {
    cameraRef.current.zoom = Math.min(cameraRef.current.zoom * 1.3, 4)
  }, [])

  const handleZoomOut = useCallback(() => {
    cameraRef.current.zoom = Math.max(cameraRef.current.zoom / 1.3, 0.2)
  }, [])

  const handleCenterView = useCallback(() => {
    centerCamera()
    focusedNodeRef.current = null
    setFocusedNode(null)
  }, [centerCamera])

  const handleUnlink = useCallback((edgeId: string) => {
    const g = graphRef.current
    const edge = g.edges.find(e => e.id === edgeId)
    if (edge) {
      g.edges = g.edges.filter(e => e.id !== edgeId)
      showMindToast(`Unlinked`)
      if (onDeleteEdge) onDeleteEdge(edge.source.id, edge.target.id)
      if (focusedNodeRef.current) setFocusedNode({ ...focusedNodeRef.current })
    }
  }, [showMindToast, onDeleteEdge])

  const { domainCount, documentCount, domainOptions } = graphStats

  const orphanNodeIds = new Set<string>()
  if (!filterStateRef.current.showOrphans) {
    const connectedIds = new Set<string>()
    graphRef.current.edges.filter(e => !e.synthetic).forEach(e => { connectedIds.add(e.source.id); connectedIds.add(e.target.id) })
    graphRef.current.nodes.forEach(n => { if (!connectedIds.has(n.id)) orphanNodeIds.add(n.id) })
  }

  const connectedEdges = focusedNode
    ? graphRef.current.edges.filter(e => {
        if (e.source !== focusedNode && e.target !== focusedNode) return false
        if (!isEdgeVisible(e, filterStateRef.current, orphanNodeIds)) return false
        return true
      })
    : []

  const nodeTypeIcon = (type: string) => {
    switch (type) {
      case 'root': return <Globe size={16} className="text-[var(--accent)]" />
      case 'domain': return <FolderTree size={16} className="text-[var(--node-domain)]" />
      case 'document': return <FileText size={16} className="text-[var(--node-doc)]" />
      case 'tag': return <Hash size={16} className="text-pink-400" />
      case 'insight': return <Lightbulb size={16} className="text-yellow-400" />
      case 'question': return <HelpCircle size={16} className="text-blue-400" />
      case 'time': return <Clock size={16} className="text-orange-400" />
      default: return <Network size={16} className="text-white" />
    }
  }

  const nodeTypeLabel = (type: string) => {
    if (type === 'root') return 'World Tree'
    if (type === 'domain' || type === 'project' || type === 'topic') return 'Domain / Project'
    if (type === 'document') return 'Document'
    if (type === 'source') return 'Source'
    if (type === 'fragment') return 'Fragment'
    if (type === 'tag') return 'Tag'
    if (type === 'insight') return 'Insight'
    if (type === 'question') return 'Question'
    if (type === 'time') return 'Time'
    return type.charAt(0).toUpperCase() + type.slice(1)
  }

  const NODE_BADGE_STYLES: Record<string, React.CSSProperties> = {
    root: { color: '#c4b5fd', border: '1px solid rgba(196, 181, 253, 0.2)', backgroundColor: 'rgba(196, 181, 253, 0.1)' },
    domain: { color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.2)', backgroundColor: 'rgba(139, 92, 246, 0.1)' },
    project: { color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.2)', backgroundColor: 'rgba(139, 92, 246, 0.1)' },
    topic: { color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.2)', backgroundColor: 'rgba(139, 92, 246, 0.1)' },
    document: { color: '#bbf7d0', border: '1px solid rgba(187, 247, 208, 0.2)', backgroundColor: 'rgba(187, 247, 208, 0.1)' },
    source: { color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.2)', backgroundColor: 'rgba(52, 211, 153, 0.1)' },
    fragment: { color: '#6ee7b7', border: '1px solid rgba(110, 231, 183, 0.2)', backgroundColor: 'rgba(110, 231, 183, 0.1)' },
    tag: { color: '#f472b6', border: '1px solid rgba(244, 114, 182, 0.2)', backgroundColor: 'rgba(244, 114, 182, 0.1)' },
    insight: { color: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.2)', backgroundColor: 'rgba(251, 191, 36, 0.1)' },
    question: { color: '#60a5fa', border: '1px solid rgba(96, 165, 250, 0.2)', backgroundColor: 'rgba(96, 165, 250, 0.1)' },
    time: { color: '#fb923c', border: '1px solid rgba(251, 146, 60, 0.2)', backgroundColor: 'rgba(251, 146, 60, 0.1)' },
  }

  const nodeTypeBadgeStyle = (type: string): React.CSSProperties =>
    NODE_BADGE_STYLES[type] || { color: '#bbf7d0', border: '1px solid rgba(187, 247, 208, 0.2)', backgroundColor: 'rgba(187, 247, 208, 0.1)' }

  return (
    <div className="absolute inset-0 z-0 pointer-events-auto">
      <canvas ref={canvasRef} className="w-full h-full touch-none" />

      {mindToast && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex items-center gap-2 bg-[var(--accent)] text-[#111] px-4 py-2 rounded-full font-medium text-sm shadow-lg">
          <Link2 size={16} /><span>{mindToast}</span>
        </div>
      )}

      <div className={`absolute top-6 ${focusedNode ? 'left-6' : 'right-6'} z-20 flex flex-col ${focusedNode ? 'items-start' : 'items-end'} pointer-events-auto transition-all duration-300`}>
        <button onClick={() => setFiltersOpen(v => !v)} className="glass px-4 py-2 rounded-xl flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-white transition-colors shadow-lg">
          <SlidersHorizontal size={16} /> Filters
        </button>
        {filtersOpen && (
          <div className="absolute top-12 right-0 w-64 glass rounded-2xl p-4 shadow-2xl z-30 flex flex-col">
            <div className="text-[10px] font-bold text-[var(--text-muted)] mb-2 tracking-wider">SEARCH &amp; FILTER</div>
            <div className="relative mb-2 shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" size={14} />
              <input type="text" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Search documents..." className="w-full bg-black/20 border border-[var(--border-line)] rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none focus:border-[var(--accent)] transition-colors text-white placeholder:text-gray-500" />
            </div>
            <div className="relative mb-4 shrink-0">
              <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" size={14} />
              <input type="text" value={filterTags} onChange={e => setFilterTags(e.target.value)} placeholder="Filter by tags (e.g. #idea)..." className="w-full bg-black/20 border border-[var(--border-line)] rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none focus:border-[var(--accent)] transition-colors text-white placeholder:text-gray-500" />
            </div>
            <div className="mb-4 shrink-0">
              <div className="text-[10px] font-bold text-[var(--text-muted)] mb-2 tracking-wider">DOMAIN / ORGANIZATION</div>
              <select value={selectedDomainId} onChange={e => { setSelectedDomainId(e.target.value); showMindToast(`Domain: ${e.target.value === 'all' ? 'All' : domainOptions.find(d => d.id === e.target.value)?.title || e.target.value}`) }} className="w-full bg-black/20 border border-[var(--border-line)] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)] transition-colors text-white custom-select">
                <option value="all">All Domains</option>
                {domainOptions.map(d => (
                  <option key={d.id} value={d.id}>{d.title}</option>
                ))}
              </select>
            </div>
            <div className="text-[10px] font-bold text-[var(--text-muted)] mb-3 tracking-wider border-t border-[var(--border-line)] pt-3">VISIBILITY</div>
            <label className="flex items-center gap-2 mb-2 text-xs text-white cursor-pointer hover:bg-white/5 p-1.5 rounded -ml-1.5"><input type="checkbox" checked={showDocuments} onChange={e => setShowDocuments(e.target.checked)} className="accent-[var(--accent)] rounded w-3.5 h-3.5 pointer-events-none" /> Show Documents</label>
            <label className="flex items-center gap-2 mb-2 text-xs text-white cursor-pointer hover:bg-white/5 p-1.5 rounded -ml-1.5"><input type="checkbox" checked={showTags} onChange={e => setShowTags(e.target.checked)} className="accent-[var(--accent)] rounded w-3.5 h-3.5 pointer-events-none" /> Show Tags</label>
            <label className="flex items-center gap-2 mb-4 text-xs text-white cursor-pointer hover:bg-white/5 p-1.5 rounded -ml-1.5"><input type="checkbox" checked={showOrphans} onChange={e => setShowOrphans(e.target.checked)} className="accent-[var(--accent)] rounded w-3.5 h-3.5 pointer-events-none" /> Show Orphans</label>
            <div className="text-[10px] font-bold text-[var(--text-muted)] mb-3 tracking-wider border-t border-[var(--border-line)] pt-3">RELATIONSHIPS</div>
            <label className="flex items-center gap-2 mb-2 text-xs text-white cursor-pointer hover:bg-white/5 p-1.5 rounded -ml-1.5"><input type="checkbox" checked={showStructuralLinks} onChange={e => setShowStructuralLinks(e.target.checked)} className="accent-[var(--accent)] rounded w-3.5 h-3.5 pointer-events-none" /> Structural Links</label>
            <label className="flex items-center gap-2 mb-2 text-xs text-white cursor-pointer hover:bg-white/5 p-1.5 rounded -ml-1.5"><input type="checkbox" checked={showNetworkLinks} onChange={e => setShowNetworkLinks(e.target.checked)} className="accent-[var(--accent)] rounded w-3.5 h-3.5 pointer-events-none" /> Network Links</label>
          </div>
        )}
      </div>

      <div id="mind-hud" className={`absolute bottom-10 left-10 glass rounded-2xl shadow-2xl z-20 flex flex-col pointer-events-auto transition-all duration-400 ease-[cubic-bezier(0.23,1,0.32,1)] ${hudCollapsed ? 'w-11 max-h-11 p-3 rounded-full' : 'w-72 p-5 max-h-[400px]'}`} style={{ overflow: 'hidden' }}>
        <div id="mind-hud-header" className={`flex items-center gap-2 font-medium text-white cursor-pointer ${hudCollapsed ? 'justify-center mb-0' : 'mb-4'}`} onClick={() => setHudCollapsed(v => !v)} title="Click to expand/collapse">
          <div className="w-5 h-5 flex items-center justify-center shrink-0"><Network className="w-4 h-4 text-[var(--accent)] pointer-events-none" size={16} /></div>
          <h3 id="mind-hud-title" className={`text-white whitespace-nowrap transition-opacity pointer-events-none ${hudCollapsed ? 'opacity-0 w-0 hidden' : ''}`}>Graph View</h3>
        </div>
        {!hudCollapsed && (
          <div id="mind-hud-content" className="transition-opacity duration-300">
            <div className="space-y-3 mb-5 border-b border-[var(--border-line)] pb-5">
              <div className="flex justify-between items-center text-sm"><span className="text-[var(--text-muted)]">World Tree</span><span className="font-mono text-white text-xs px-2 py-0.5 bg-white/10 rounded">Root</span></div>
              <div className="flex justify-between items-center text-sm"><span className="text-[var(--text-muted)]">Active Domains</span><span className="font-mono text-[var(--accent)]">{domainCount || 0}</span></div>
              <div className="flex justify-between items-center text-sm"><span className="text-[var(--text-muted)]">Documents</span><span className="font-mono text-[var(--node-doc)]">{documentCount || 0}</span></div>
            </div>
            <div className="text-xs text-[var(--text-muted)] mb-2 font-medium">LAYOUT ALGORITHM</div>
            <div className="flex gap-2">
              <button onClick={() => switchLayout('radial')} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors border ${layoutMode === 'radial' ? 'view-btn-active' : 'bg-white/5 hover:bg-white/10 text-[var(--text-muted)] hover:text-white border-transparent'}`}>Radial</button>
              <button onClick={() => switchLayout('force')} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors border ${layoutMode === 'force' ? 'view-btn-active' : 'bg-white/5 hover:bg-white/10 text-[var(--text-muted)] hover:text-white border-transparent'}`}>Force</button>
              <button onClick={() => switchLayout('orbit')} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors border ${layoutMode === 'orbit' ? 'view-btn-active' : 'bg-white/5 hover:bg-white/10 text-[var(--text-muted)] hover:text-white border-transparent'}`}>Orbit</button>
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-24 right-10 glass rounded-full p-1.5 flex flex-col gap-1 shadow-2xl z-20 pointer-events-auto">
        <button onClick={handleZoomIn} className="p-2 hover:bg-white/10 rounded-full text-[var(--text-muted)] transition-colors" title="Zoom In"><Plus size={16} /></button>
        <div className="w-full h-px bg-[var(--border-line)]" />
        <button onClick={handleZoomOut} className="p-2 hover:bg-white/10 rounded-full text-[var(--text-muted)] transition-colors" title="Zoom Out"><Minus size={16} /></button>
        <div className="w-full h-px bg-[var(--border-line)]" />
        <button onClick={handleCenterView} className="p-2 hover:bg-white/10 rounded-full text-[var(--text-main)] transition-colors" title="Center View"><Crosshair size={16} /></button>
      </div>

      {focusedNode && (
        <div id="node-detail-panel" className="absolute top-20 right-6 w-80 glass rounded-2xl p-0 shadow-2xl z-20 flex flex-col max-h-[70vh] pointer-events-auto node-panel-transition">
          <div className="p-5 border-b border-[var(--border-line)]">
            <div className="flex justify-between items-start mb-3">
              <div id="node-panel-icon" className="w-8 h-8 rounded-lg bg-white/5 border border-[var(--border-line)] flex items-center justify-center">{nodeTypeIcon(focusedNode.type)}</div>
              <button onClick={() => { focusedNodeRef.current = null; setFocusedNode(null) }} className="text-[var(--text-muted)] hover:text-white p-1 rounded hover:bg-white/10 transition-colors"><X size={16} /></button>
            </div>
            <h2 className="text-lg font-bold text-white mb-2">{focusedNode.title}</h2>
            <div className="flex gap-2 font-mono text-xs">
              <span id="node-panel-type" className="px-2 py-0.5 rounded" style={nodeTypeBadgeStyle(focusedNode.type)}>
                {nodeTypeLabel(focusedNode.type)}
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-5 no-scrollbar">
            <h4 className="text-xs font-semibold text-[var(--text-muted)] mb-3">CONNECTED NODES</h4>
            <div id="node-connections-list" className="space-y-2">
              {connectedEdges.length > 0 ? connectedEdges.map(edge => {
                const otherNode = edge.source === focusedNode ? edge.target : edge.source
                const isParent = edge.target === focusedNode && edge.type === 'tree'
                return (
                  <div key={edge.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-[var(--border-line)] group">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: otherNode.color }} />
                      <span className="text-sm text-gray-200 truncate">{otherNode.title}</span>
                      {isParent && <span className="text-[10px] text-gray-500 bg-black/30 px-1 rounded">Parent</span>}
                    </div>
                    <button onClick={() => handleUnlink(edge.id)} className="text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-400/10 p-1.5 rounded transition-all" title="Unlink"><Unlink size={14} /></button>
                  </div>
                )
              }) : <p className="text-xs text-gray-500 text-center py-2">No connections.</p>}
            </div>
          </div>
          <div className="p-5 border-t border-[var(--border-line)] bg-white/[0.02] flex flex-col gap-2">
            <button onClick={() => { if (focusedNode.documentId) onOpenEditor(focusedNode.documentId); else onToast('This node has no linked document') }} className="w-full py-2 bg-white/10 hover:bg-white/20 border border-[var(--border-line)] rounded-lg text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"><PenTool size={16} /> Open in Editor</button>
            {onOpenInDock && focusedNode.documentId && (
              <button onClick={() => {
                if (focusedNode.documentId != null) onOpenInDock(focusedNode.documentId)
              }} className="w-full py-2 bg-white/5 hover:bg-white/10 border border-[var(--border-line)] rounded-lg text-[var(--text-muted)] hover:text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"><LayoutList size={16} /> Open in Dock</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
