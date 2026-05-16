export const NODE_COLOR: Record<string, string> = {
  root: '#c4b5fd',
  domain: '#8b5cf6',
  project: '#8b5cf6',
  topic: '#8b5cf6',
  document: '#bbf7d0',
  draft: '#fbbf24',
  fragment: '#bbf7d0',
  source: '#bbf7d0',
  tag: '#8b5cf6',
  insight: '#bbf7d0',
  question: '#bbf7d0',
  time: '#8b5cf6',
}

export const NODE_BASE_SIZE: Record<string, number> = {
  root: 7.5,
  domain: 6.5,
  project: 6,
  topic: 5.5,
  document: 5,
  draft: 4.5,
  fragment: 4.5,
  source: 4.5,
  tag: 3,
  insight: 5,
  question: 5,
  time: 4.5,
}

export const NODE_LABEL_FONT_SIZE: Record<string, number> = {
  root: 13,
  domain: 10,
  project: 9,
  topic: 9,
  document: 8,
  draft: 7,
  fragment: 7,
  source: 7,
  tag: 7,
  insight: 8,
  question: 8,
  time: 7,
}

export function getNodeColor(nodeType: string): string {
  return NODE_COLOR[nodeType] || '#a78bfa'
}

export function getNodeBaseSize(nodeType: string): number {
  return NODE_BASE_SIZE[nodeType] || 4
}

export function getNodeLabelSize(nodeType: string): number {
  return NODE_LABEL_FONT_SIZE[nodeType] || 7
}

export const TYPE_VISUAL_WEIGHT: Record<string, number> = {
  root: 1.0,
  domain: 0.7,
  project: 0.6,
  topic: 0.5,
  document: 0.35,
  draft: 0.25,
  insight: 0.35,
  question: 0.35,
  source: 0.25,
  fragment: 0.25,
  tag: 0.15,
  time: 0.15,
}

export function computeVisualWeight(
  nodeType: string,
  degreeScore: number,
  clusterCenterScore: number,
  documentWeightScore: number,
  userPinScore: number,
  recentActivityScore: number,
): number {
  const typeW = TYPE_VISUAL_WEIGHT[nodeType] ?? 0.3
  const degreeBoost = Math.min(degreeScore, 1) * 0.2
  const clusterBoost = Math.min(clusterCenterScore, 1) * 0.15
  const docBoost = Math.min(documentWeightScore, 1) * 0.1
  const pinBoost = userPinScore > 0 ? 0.2 : 0
  const activityBoost = Math.min(recentActivityScore, 1) * 0.1
  return Math.min(typeW + degreeBoost + clusterBoost + docBoost + pinBoost + activityBoost, 1.0)
}

export function visualWeightToSize(weight: number, baseSize: number): number {
  if (weight >= 0.65) return baseSize * 1.25
  if (weight >= 0.35) return baseSize * 1.0
  return baseSize * 0.75
}

export function shouldShowLabel(weight: number): boolean {
  return weight >= 0.5
}

export const EDGE_STYLE: Record<string, { color: string; opacity: number; width: number; dashed: boolean }> = {
  parent_child: { color: 'rgba(255,255,255,0.15)', opacity: 1, width: 1.6, dashed: false },
  semantic: { color: 'rgba(167,139,250,0.4)', opacity: 1, width: 0.8, dashed: true },
  reference: { color: 'rgba(167,139,250,0.4)', opacity: 1, width: 0.8, dashed: true },
  source: { color: 'rgba(167,139,250,0.4)', opacity: 1, width: 0.8, dashed: true },
  temporal: { color: 'rgba(167,139,250,0.4)', opacity: 1, width: 0.8, dashed: true },
  confirmed: { color: 'rgba(255,255,255,0.15)', opacity: 1, width: 1.6, dashed: false },
  suggested: { color: 'rgba(167,139,250,0.4)', opacity: 1, width: 0.5, dashed: true },
  conflict: { color: 'rgba(167,139,250,0.4)', opacity: 1, width: 0.8, dashed: true },
}

export function computeEdgeWidth(edgeType: string, strength: number): number {
  const base = getEdgeStyle(edgeType).width
  return base * (0.7 + Math.min(strength, 1) * 0.6)
}

export function getEdgeStyle(edgeType: string) {
  return EDGE_STYLE[edgeType] || EDGE_STYLE.semantic
}

export const HOVER_HIGHLIGHT_COLOR = 'rgba(196,181,253,0.85)'
export const HOVER_NEIGHBOR_COLOR = 'rgba(196,181,253,0.45)'

export const DIM_OPACITY = 0.15
export const DIM_EDGE_OPACITY = 0.03

export const BG_COLOR = '#0a0a0f'

function parseHexColor(color: string): { r: number; g: number; b: number } | null {
  const normalized = color.trim().replace('#', '')
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(normalized)) return null
  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  }
}

function channelToLinear(value: number): number {
  const normalized = value / 255
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(color: { r: number; g: number; b: number }): number {
  return 0.2126 * channelToLinear(color.r) + 0.7152 * channelToLinear(color.g) + 0.0722 * channelToLinear(color.b)
}

function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b))
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b))
  return (lighter + 0.05) / (darker + 0.05)
}

function mixWithWhite(color: { r: number; g: number; b: number }, amount: number): { r: number; g: number; b: number } {
  return {
    r: Math.round(color.r + (255 - color.r) * amount),
    g: Math.round(color.g + (255 - color.g) * amount),
    b: Math.round(color.b + (255 - color.b) * amount),
  }
}

function toRgbCss(color: { r: number; g: number; b: number }): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`
}

export function getReadableTextColor(backgroundColor: string, preferredColor = '#e8edf1'): string {
  const background = parseHexColor(backgroundColor) ?? parseHexColor(BG_COLOR)
  const preferred = parseHexColor(preferredColor)
  const white = parseHexColor('#f8fbff')
  if (!background || !preferred || !white) return '#f8fbff'
  if (contrastRatio(preferred, background) >= 4.5) return preferredColor

  for (const amount of [0.2, 0.35, 0.5, 0.65, 0.8]) {
    const mixed = mixWithWhite(preferred, amount)
    if (contrastRatio(mixed, background) >= 4.5) return toRgbCss(mixed)
  }
  return toRgbCss(white)
}

export function getNodeTypeLabel(nodeType: string): string {
  const labels: Record<string, string> = {
    root: 'World Tree',
    domain: 'Domain',
    project: 'Project',
    topic: 'Topic',
    document: 'Document',
    draft: 'Draft',
    fragment: 'Fragment',
    source: 'Source',
    tag: 'Tag',
    insight: 'Insight',
    question: 'Question',
    time: 'Time',
  }
  return labels[nodeType] || nodeType
}
