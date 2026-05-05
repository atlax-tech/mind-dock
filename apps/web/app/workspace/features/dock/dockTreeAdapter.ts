import type { DockItem } from '@/lib/repository'

// TODO(backend-boundary): Current Dock hierarchy is entirely frontend adapter + local mock.
// Real project/folder persistence requires backend schema/BFF support.
// Mock nodes (metadata.mock === true) are session-only and will NOT survive page refresh.
// Do NOT treat this as production-grade persistence.

export interface DockTreeNode {
  id: number
  type: 'project' | 'folder' | 'file'
  name: string
  title: string
  children: DockTreeNode[]
  parentId: number | null
  depth: number
  documentId?: number | null
  contentType?: string
  tags?: string[]
  preview?: string
  metadata?: Record<string, unknown>
}

export interface DockTreeViewModel {
  roots: DockTreeNode[]
  allNodes: Map<number, DockTreeNode>
}

const FOLDER_KEYWORDS = ['notes', '笔记', 'reading', '阅读', 'research', '调研', 'meeting', '会议', 'concept', '构想', 'design', '设计', 'spec', 'test', '测试', 'report', '报告', 'strategy', '策略', 'plan', '计划']

function inferDockNodeType(item: DockItem): DockTreeNode['type'] {
  const title = (item.topic || '').toLowerCase().trim()
  if (!title) return 'file'
  const words = title.split(/[\s\-_.,;:!?()（）【】""'']+/)
  const lastWord = words[words.length - 1] || ''
  if (FOLDER_KEYWORDS.some(k => lastWord === k || title === k)) return 'folder'
  return 'file'
}

function inferProjectGroup(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('system') || lower.includes('rebuild') || lower.includes('architecture') || lower.includes('frontend') || lower.includes('backend') || lower.includes('devops') || lower.includes('docker') || lower.includes('vercel') || lower.includes('github') || lower.includes('deploy') || lower.includes('cache') || lower.includes('performance') || lower.includes('container') || lower.includes('webworker') || lower.includes('service') || lower.includes('indexeddb') || lower.includes('virtual') || lower.includes('crdt') || lower.includes('react') || lower.includes('tailwind') || lower.includes('zustand') || lower.includes('jotai') || lower.includes('unit') || lower.includes('import')) return 'System Rebuild'
  if (lower.includes('algorithm') || lower.includes('graph') || lower.includes('physics') || lower.includes('rag') || lower.includes('embedding') || lower.includes('vector') || lower.includes('semantic') || lower.includes('search') || lower.includes('re-rank') || lower.includes('fine-tun') || lower.includes('multi-modal') || lower.includes('chunk') || lower.includes('llm') || lower.includes('agent') || lower.includes('prompt') || lower.includes('nl') || lower.includes('query') || lower.includes('audio') || lower.includes('web audio')) return 'Graph Algorithm'
  if (lower.includes('growth') || lower.includes('user') || lower.includes('persona') || lower.includes('journey') || lower.includes('usability') || lower.includes('nps') || lower.includes('competitive') || lower.includes('go-to-market') || lower.includes('revenue') || lower.includes('partnership') || lower.includes('content marketing') || lower.includes('community') || lower.includes('pricing') || lower.includes('investor') || lower.includes('mvp') || lower.includes('onboarding') || lower.includes('client') || lower.includes('demo') || lower.includes('feature request')) return 'Growth'
  if (lower.includes('design') || lower.includes('token') || lower.includes('component') || lower.includes('color') || lower.includes('typography') || lower.includes('motion') || lower.includes('accessibility') || lower.includes('dark mode') || lower.includes('responsive') || lower.includes('keyboard') || lower.includes('drag') || lower.includes('emoji') || lower.includes('tag editor') || lower.includes('typewriter') || lower.includes('markdown') || lower.includes('dock') || lower.includes('card') || lower.includes('chat') || lower.includes('batch') || lower.includes('voice') || lower.includes('bidirectional') || lower.includes('daily review') || lower.includes('smart group') || lower.includes('local-first') || lower.includes('data export') || lower.includes('knowledge map') || lower.includes('related') || lower.includes('browser import') || lower.includes('custom rules') || lower.includes('wechat')) return 'Product Design'
  if (lower.includes('reading') || lower.includes('笔记') || lower.includes('book') || lower.includes('thinking') || lower.includes('hackers') || lower.includes('psychology') || lower.includes('edge computing') || lower.includes('open source') || lower.includes('ai meetup') || lower.includes('code review')) return 'Reading & Research'
  if (lower.includes('meeting') || lower.includes('会议') || lower.includes('review') || lower.includes('discussion') || lower.includes('alignment') || lower.includes('priority')) return 'Meetings'
  return 'Dock'
}

export function toDockTreeViewModel(items: DockItem[]): DockTreeViewModel {
  const allNodes = new Map<number, DockTreeNode>()
  const projectGroups = new Map<string, DockTreeNode>()

  let nextVirtualId = -1
  function getVirtualId(): number { return nextVirtualId-- }

  const roots: DockTreeNode[] = []

  function ensureProjectGroup(groupName: string): DockTreeNode {
    const existing = projectGroups.get(groupName)
    if (existing) return existing

    const virtualId = getVirtualId()
    const projectNode: DockTreeNode = {
      id: virtualId,
      type: 'project',
      name: groupName,
      title: groupName,
      children: [],
      parentId: null,
      depth: 0,
      metadata: { virtual: true },
    }
    allNodes.set(virtualId, projectNode)
    roots.push(projectNode)
    projectGroups.set(groupName, projectNode)
    return projectNode
  }

  function resolveProjectForItem(item: DockItem): DockTreeNode {
    if (item.selectedProject) {
      return ensureProjectGroup(item.selectedProject)
    }
    const groupName = inferProjectGroup(item.topic || item.rawText || '')
    return ensureProjectGroup(groupName)
  }

  const folderMap = new Map<string, DockTreeNode>()
  const folderItems = items.filter(item => inferDockNodeType(item) === 'folder')
  const fileItems = items.filter(item => inferDockNodeType(item) === 'file')

  folderItems.forEach(item => {
    const parentProject = resolveProjectForItem(item)
    const title = item.topic || (item.rawText || '').slice(0, 50) || `Folder ${item.id}`
    const description = (item.rawText || '').slice(0, 100)
    const folderNode: DockTreeNode = {
      id: item.id,
      type: 'folder',
      name: title,
      title,
      children: [],
      parentId: parentProject.id,
      depth: 1,
      documentId: item.id,
      contentType: item.sourceType,
      tags: item.userTags,
      preview: description,
      metadata: { status: item.status, createdAt: item.createdAt },
    }
    allNodes.set(item.id, folderNode)
    parentProject.children.push(folderNode)
    const folderKey = (item.topic || '').toLowerCase()
    if (folderKey) folderMap.set(folderKey, folderNode)
  })

  fileItems.forEach(item => {
    const parentProject = resolveProjectForItem(item)
    const title = item.topic || (item.rawText || '').slice(0, 50) || `File ${item.id}`
    const titleLower = title.toLowerCase()
    const description = (item.rawText || '').slice(0, 300)

    let parentFolder: DockTreeNode | null = null
    const folderEntries = Array.from(folderMap.keys())
    for (let fi = 0; fi < folderEntries.length; fi++) {
      const folderKey = folderEntries[fi]
      const folderNode = folderMap.get(folderKey)
      if (!folderNode) continue
      if (titleLower.includes(folderKey) || folderKey.split(' ').some((k: string) => k.length > 3 && titleLower.includes(k))) {
        if (folderNode.parentId === parentProject.id) {
          parentFolder = folderNode
          break
        }
      }
    }

    const fileNode: DockTreeNode = {
      id: item.id,
      type: 'file',
      name: title,
      title,
      children: [],
      parentId: parentFolder ? parentFolder.id : parentProject.id,
      depth: parentFolder ? 2 : 1,
      documentId: item.id,
      contentType: item.sourceType,
      tags: item.userTags,
      preview: description,
      metadata: {
        dockItemId: item.id,
        status: item.status,
        createdAt: item.createdAt,
        processedAt: item.processedAt,
      },
    }
    allNodes.set(item.id, fileNode)
    if (parentFolder) {
      parentFolder.children.push(fileNode)
    } else {
      parentProject.children.push(fileNode)
    }
  })

  return { roots, allNodes }
}
