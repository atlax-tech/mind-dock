import type { MindGraphSnapshot, MindGraphSnapshotEdge, MindGraphSnapshotNode } from '@/lib/repository'
import type { MindFilterState } from '@/app/workspace/features/mind/useMindGraphInteraction'
import type { BrainEdge, BrainEdgeType, BrainLayer, BrainNode, BrainNodeType } from './types'

function stableHashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0
  }
  return (h >>> 0) / 0x100000000
}

function seededRandom(id: string, salt = ''): number {
  return stableHashStr(`${id}:${salt}`)
}

function randomBySeed(id: string, min: number, max: number, salt = ''): number {
  return min + seededRandom(id, salt) * (max - min)
}

function isTagLike(nodeType: string): boolean {
  return nodeType === 'tag'
}

function isRootLike(nodeType: string): boolean {
  return nodeType === 'root'
}

function isDocumentLike(nodeType: string): boolean {
  return (
    nodeType === 'document' ||
    nodeType === 'source' ||
    nodeType === 'fragment' ||
    nodeType === 'project' ||
    nodeType === 'domain' ||
    nodeType === 'topic' ||
    nodeType === 'question' ||
    nodeType === 'insight' ||
    nodeType === 'time'
  )
}

function isArtificialRootAnchor(edge: MindGraphSnapshotEdge, rawById: Map<string, MindGraphSnapshotNode>): boolean {
  const src = rawById.get(edge.sourceNodeId)
  const tgt = rawById.get(edge.targetNodeId)
  if (!src || !tgt) return false
  if (!isRootLike(src.nodeType) && !isRootLike(tgt.nodeType)) return false
  return edge.reason === 'orphan anchor' || (edge.source === 'system' && edge.strength <= 0.12 && (edge.confidence ?? 0) <= 0.12)
}

function spherePoint(id: string, radius: number, salt: string): { x: number; y: number; z: number } {
  const u = seededRandom(id, `${salt}:u`)
  const v = seededRandom(id, `${salt}:v`)
  const theta = 2 * Math.PI * u
  const phi = Math.acos(2 * v - 1)
  return {
    x: Math.sin(phi) * Math.cos(theta) * radius,
    y: Math.sin(phi) * Math.sin(theta) * radius,
    z: Math.cos(phi) * radius,
  }
}

function edgeVisualType(srcType?: BrainNodeType, tgtType?: BrainNodeType): BrainEdgeType {
  const hasTag = srcType === 'tag' || tgtType === 'tag'
  const hasDoc = srcType === 'document' || tgtType === 'document'
  if (hasTag && hasDoc) return 'tag-link'
  if (srcType === 'document' && tgtType === 'document') return 'doc-link'
  return 'dense-link'
}

export interface VisualBrainGraph {
  nodes: Map<string, BrainNode>
  edges: Map<string, BrainEdge>
  docCount: number
  tagCount: number
  orphanCount: number
  skippedRootEdges: number
}

export function mapRealGraphToVisualBrainGraph(
  snapshot: MindGraphSnapshot,
  filterState?: MindFilterState,
): VisualBrainGraph {
  const rawById = new Map(snapshot.nodes.map(node => [node.id, node]))
  const usableEdges = snapshot.edges.filter(edge => {
    const src = rawById.get(edge.sourceNodeId)
    const tgt = rawById.get(edge.targetNodeId)
    if (!src || !tgt) return false
    if (isRootLike(src.nodeType) || isRootLike(tgt.nodeType)) return false
    return !isArtificialRootAnchor(edge, rawById)
  })
  const skippedRootEdges = snapshot.edges.length - usableEdges.length

  const degree = new Map<string, number>()
  usableEdges.forEach(edge => {
    degree.set(edge.sourceNodeId, (degree.get(edge.sourceNodeId) ?? 0) + 1)
    degree.set(edge.targetNodeId, (degree.get(edge.targetNodeId) ?? 0) + 1)
  })

  const visibleNodeIds = new Set<string>()
  const rawNodes = snapshot.nodes.filter(node => {
    if (isRootLike(node.nodeType)) return false

    let visible = true
    if (filterState) {
      visible = filterState.nodeTypes.has(node.nodeType)
      if (isDocumentLike(node.nodeType) && !filterState.showDocuments) visible = false
      if (isTagLike(node.nodeType) && !filterState.showTags) visible = false
      if ((node.nodeType === 'source' || node.nodeType === 'fragment') && !filterState.showSources) visible = false
      if (!filterState.showOrphans && (degree.get(node.id) ?? 0) === 0) visible = false
      if (filterState.search.trim() && !node.label.toLowerCase().includes(filterState.search.trim().toLowerCase())) visible = false
    }

    if (visible) visibleNodeIds.add(node.id)
    return visible
  })

  const docs: Array<{ node: MindGraphSnapshotNode; deg: number }> = []
  const tags: Array<{ node: MindGraphSnapshotNode; deg: number }> = []
  const orphans: Array<{ node: MindGraphSnapshotNode; deg: number }> = []

  rawNodes.forEach(node => {
    const deg = degree.get(node.id) ?? 0
    if (deg === 0) {
      orphans.push({ node, deg })
    } else if (isTagLike(node.nodeType)) {
      tags.push({ node, deg })
    } else {
      docs.push({ node, deg })
    }
  })

  docs.sort((a, b) => {
    if (b.deg !== a.deg) return b.deg - a.deg
    return b.node.clusterCenterScore - a.node.clusterCenterScore
  })

  const totalDocs = docs.length
  const coreEnd = Math.max(1, Math.floor(totalDocs * 0.45))
  const branchEnd = Math.max(coreEnd, Math.floor(totalDocs * 0.85))
  const docLayers = new Map<string, BrainLayer>()
  docs.forEach((doc, idx) => {
    if (idx < coreEnd) docLayers.set(doc.node.id, 'core')
    else if (idx < branchEnd) docLayers.set(doc.node.id, 'branch')
    else docLayers.set(doc.node.id, 'outer')
  })

  const tagAllDocs = new Map<string, string[]>()
  usableEdges.forEach(edge => {
    const src = rawById.get(edge.sourceNodeId)
    const tgt = rawById.get(edge.targetNodeId)
    if (!src || !tgt) return

    if (!isTagLike(src.nodeType) && isTagLike(tgt.nodeType)) {
      const arr = tagAllDocs.get(edge.targetNodeId) ?? []
      arr.push(edge.sourceNodeId)
      tagAllDocs.set(edge.targetNodeId, arr)
    }
    if (isTagLike(src.nodeType) && !isTagLike(tgt.nodeType)) {
      const arr = tagAllDocs.get(edge.sourceNodeId) ?? []
      arr.push(edge.targetNodeId)
      tagAllDocs.set(edge.sourceNodeId, arr)
    }
  })

  const tagParentDoc = new Map<string, string>()
  tagAllDocs.forEach((docIds, tagId) => {
    const best = docIds
      .filter(id => visibleNodeIds.has(id))
      .sort((a, b) => {
        const da = degree.get(a) ?? 0
        const db = degree.get(b) ?? 0
        if (db !== da) return db - da
        return seededRandom(b, 'tag-parent') - seededRandom(a, 'tag-parent')
      })[0]
    if (best) tagParentDoc.set(tagId, best)
  })

  const layoutTargets = new Map<string, { x: number; y: number; z: number }>()
  docs.forEach(doc => {
    const layer = docLayers.get(doc.node.id) ?? 'outer'
    const radius =
      layer === 'core'
        ? randomBySeed(doc.node.id, 26, 82, 'layout-radius')
        : layer === 'branch'
          ? randomBySeed(doc.node.id, 112, 198, 'layout-radius')
          : randomBySeed(doc.node.id, 215, 330, 'layout-radius')
    const point = spherePoint(doc.node.id, radius, `doc-${layer}`)
    layoutTargets.set(doc.node.id, point)
  })

  const tagsByParent = new Map<string, string[]>()
  tags.forEach(tag => {
    const parentId = tagParentDoc.get(tag.node.id)
    if (!parentId) return
    const arr = tagsByParent.get(parentId) ?? []
    arr.push(tag.node.id)
    tagsByParent.set(parentId, arr)
  })

  tags.forEach(tag => {
    const parentId = tagParentDoc.get(tag.node.id)
    const parent = parentId ? layoutTargets.get(parentId) : null
    if (parent && parentId) {
      const siblings = tagsByParent.get(parentId) ?? []
      const idx = Math.max(0, siblings.indexOf(tag.node.id))
      const radius = randomBySeed(tag.node.id, 12, 28, 'tag-radius')
      const angle = siblings.length <= 1 ? seededRandom(tag.node.id, 'tag-angle') * Math.PI * 2 : (idx / siblings.length) * Math.PI * 2
      const z = randomBySeed(tag.node.id, -8, 8, 'tag-z')
      layoutTargets.set(tag.node.id, {
        x: parent.x + Math.cos(angle) * radius,
        y: parent.y + Math.sin(angle) * radius,
        z: parent.z + z,
      })
    } else {
      layoutTargets.set(tag.node.id, spherePoint(tag.node.id, randomBySeed(tag.node.id, 145, 270, 'loose-tag'), 'loose-tag'))
    }
  })

  orphans.forEach(orphan => {
    layoutTargets.set(orphan.node.id, spherePoint(orphan.node.id, randomBySeed(orphan.node.id, 230, 360, 'orphan'), 'orphan'))
  })

  const nodes = new Map<string, BrainNode>()
  const makeBrainNode = (
    raw: MindGraphSnapshotNode,
    type: BrainNodeType,
    deg: number,
    parentId: string | null,
    layer: BrainLayer,
  ): BrainNode => {
    const target = layoutTargets.get(raw.id) ?? spherePoint(raw.id, 90, 'fallback')
    const jitter = spherePoint(raw.id, randomBySeed(raw.id, 4, 18, 'intro-jitter'), 'intro')
    const baseRadius =
      type === 'document'
        ? 3.4 + Math.min(3.4, Math.sqrt(Math.max(1, deg)) * 0.58)
        : type === 'tag'
          ? 1.6 + seededRandom(raw.id, 'radius') * 0.85
          : 1.8 + seededRandom(raw.id, 'radius') * 0.6
    const importance = type === 'document'
      ? Math.min(1, Math.max(0.08, deg / Math.max(8, totalDocs) + raw.documentWeightScore + raw.clusterCenterScore * 0.08))
      : 0.1
    const introX = target.x * 0.12 + jitter.x
    const introY = target.y * 0.12 + jitter.y
    const introZ = target.z * 0.12 + jitter.z

    return {
      id: raw.id,
      type,
      label: raw.label,
      documentId: raw.documentId,
      rawType: raw.nodeType,
      cluster: raw.nodeType,
      degree: deg,
      importance,
      parentId,
      layoutLayer: layer,
      layoutX: target.x,
      layoutY: target.y,
      layoutZ: target.z,
      targetX: target.x,
      targetY: target.y,
      z: target.z,
      phase: seededRandom(raw.id, 'phase') * Math.PI * 2,
      amplitude: type === 'tag' ? 0.18 : 0.34,
      speed: type === 'tag' ? 0.65 : 0.42,
      currentX: introX,
      currentY: introY,
      currentZ: introZ,
      x: introX,
      y: introY,
      vx: 0,
      vy: 0,
      baseRadius,
      currentRadius: baseRadius,
      currentOpacity: 1,
      targetOpacity: 1,
      entranceDelay: 0,
      neighbors: new Set(),
      incidentEdges: new Set(),
    } as BrainNode
  }

  docs.forEach(doc => {
    nodes.set(doc.node.id, makeBrainNode(doc.node, 'document', doc.deg, null, docLayers.get(doc.node.id) ?? 'outer'))
  })
  tags.forEach(tag => {
    nodes.set(tag.node.id, makeBrainNode(tag.node, 'tag', tag.deg, tagParentDoc.get(tag.node.id) ?? null, 'branch'))
  })
  orphans.forEach(orphan => {
    nodes.set(orphan.node.id, makeBrainNode(orphan.node, 'orphan', orphan.deg, null, 'orphan'))
  })

  const edges = new Map<string, BrainEdge>()
  usableEdges.forEach(edge => {
    if (!visibleNodeIds.has(edge.sourceNodeId) || !visibleNodeIds.has(edge.targetNodeId)) return
    if (!nodes.has(edge.sourceNodeId) || !nodes.has(edge.targetNodeId)) return
    if (filterState) {
      if (!filterState.edgeTypes.has(edge.edgeType)) return
      if (edge.edgeType === 'suggested' && !filterState.showSuggested) return
      if (edge.edgeType === 'confirmed' && !filterState.showConfirmed) return
      if (edge.confidence != null && edge.confidence < filterState.minConfidence) return
      if (edge.strength < filterState.minStrength) return
    }

    const src = nodes.get(edge.sourceNodeId)
    const tgt = nodes.get(edge.targetNodeId)
    const id = edge.id || `${edge.sourceNodeId}-${edge.targetNodeId}-${edge.edgeType}`
    edges.set(id, {
      id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      type: edgeVisualType(src?.type, tgt?.type),
      rawType: edge.edgeType,
      strength: edge.strength,
      confidence: edge.confidence,
      currentOpacity: 1,
      targetOpacity: 1,
    })

    src?.neighbors.add(edge.targetNodeId)
    src?.incidentEdges.add(id)
    tgt?.neighbors.add(edge.sourceNodeId)
    tgt?.incidentEdges.add(id)
  })

  return {
    nodes,
    edges,
    docCount: docs.length,
    tagCount: tags.length,
    orphanCount: orphans.length,
    skippedRootEdges,
  }
}
