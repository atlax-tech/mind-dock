'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Columns3,
  Database,
  FileText,
  Filter,
  Folder,
  GitBranch,
  Layers,
  Loader2,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Table2,
  Tags,
  Type,
  X,
} from 'lucide-react'
import {
  createDraft,
  discardDraft,
  listDocuments,
  listDrafts,
  listMindEdges,
  listMindNodes,
  listRecommendationDockQueue,
  publishDraftToDocument,
  recordRecentDocumentOpen,
  updateDraft,
  updateArchivedEntry,
  type RecommendationDockQueueItem,
  type StoredDocument,
  type StoredDraft,
  type StoredMindEdge,
  type StoredMindNode,
} from '@/lib/repository'
import type { EditorContentPayload } from '@/lib/editorContentAdapter'
import type { EditorOutlineItem, EditorViewBlockData, EditorViewBlockSelection, EditorWidthMode } from './TiptapEditor'
import { useEditorDocument, type EditorTarget } from './useEditorDocument'
import { emit } from '@/lib/events'

const TiptapEditor = dynamic(
  () => import('./TiptapEditor').then((mod) => mod.TiptapEditor),
  { ssr: false },
)

const WIDTH_LABELS: Record<EditorWidthMode, string> = {
  compact: 'Compact',
  comfortable: 'Comfortable',
  wide: 'Wide',
}

const EDITOR_SURFACE_WIDTH: Record<EditorWidthMode, string> = {
  compact: 'max-w-[700px]',
  comfortable: 'max-w-[820px]',
  wide: 'max-w-[980px]',
}

type EditorTabKind = 'project' | 'domain' | 'document' | 'draft'
const SCRATCH_TAB_ID_PREFIX = 'scratch:'

function shouldMaterializeDraft(title: string, payload: EditorContentPayload): boolean {
  const titleTrimmed = title.trim()
  if (titleTrimmed && titleTrimmed !== 'Untitled') return true
  if (payload.plainText.trim().length >= 2) return true
  if (payload.markdown.trim().length >= 2) return true
  return false
}

interface EditorWorkspaceTab {
  id: string
  kind: EditorTabKind
  title: string
  path: string
  projectName: string | null
  rootNodeId?: string | null
  target: EditorTarget
  lastOpenedAt: Date
}

interface DomainTreeNode {
  id: string
  title: string
  nodeType: string
  documentId: number | null
  draftId?: number | null
  children: DomainTreeNode[]
}

interface OpenResult {
  id: string
  kind: 'project' | 'domain' | 'document' | 'draft'
  title: string
  path: string
  typeLabel: 'project' | 'topic' | 'scatter document' | 'page'
  updatedAt: Date
  node?: StoredMindNode
  document?: StoredDocument
  draft?: StoredDraft
}

interface DraftEditorViewProps {
  userId: string
  showSourcePacket: boolean
  showInspector: boolean
  onToggleSourcePacket: () => void
  onToggleInspector: () => void
  onToast?: (msg: string) => void
  initialDraftId?: number | null
  initialEntryId?: number | null
  onInitialDraftConsumed?: () => void
  onInitialEntryConsumed?: () => void
  onActiveDraftMetaChange?: (meta: { id: number | null; title: string; status: string }) => void
}

export default function DraftEditorView({
  userId,
  showInspector,
  onToggleInspector,
  onToast,
  initialDraftId,
  initialEntryId,
  onInitialDraftConsumed,
  onInitialEntryConsumed,
  onActiveDraftMetaChange,
}: DraftEditorViewProps) {
  const toolbarPortalTargetId = 'editor-dock-toolbar-slot'
  const [documents, setDocuments] = useState<StoredDocument[]>([])
  const [drafts, setDrafts] = useState<StoredDraft[]>([])
  const [mindNodes, setMindNodes] = useState<StoredMindNode[]>([])
  const [mindEdges, setMindEdges] = useState<StoredMindEdge[]>([])
  const [recommendations, setRecommendations] = useState<RecommendationDockQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tabs, setTabs] = useState<EditorWorkspaceTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [showDomainTree, setShowDomainTree] = useState(true)
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set())
  const [showOpenDialog, setShowOpenDialog] = useState(false)
  const [openQuery, setOpenQuery] = useState('')
  const [selectedOpenIndex, setSelectedOpenIndex] = useState(0)
  const [openTypeFilter, setOpenTypeFilter] = useState<'all' | 'project' | 'document'>('all')
  const [titleOnlyFilter, setTitleOnlyFilter] = useState(false)
  const [sortMode, setSortMode] = useState<'recent' | 'title'>('recent')
  const [widthMode, setWidthMode] = useState<EditorWidthMode>('comfortable')
  const [outline, setOutline] = useState<EditorOutlineItem[]>([])
  const [selectedViewBlock, setSelectedViewBlock] = useState<EditorViewBlockSelection | null>(null)
  const [publishing, setPublishing] = useState(false)
  const materializingRef = useRef(false)
  const pendingScratchRef = useRef<{
    title: string
    contentJson: EditorContentPayload['contentJson']
    plainText: string
    html: string
    markdown: string
    tags: string[]
    project: string | null
  } | null>(null)

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) ?? null, [activeTabId, tabs])
  const activeTarget = activeTab?.target ?? null
  const activeProjectName = activeTab?.projectName ?? null

  const editorDoc = useEditorDocument({
    userId,
    target: activeTarget,
  })

  const refreshWorkspaceData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const [nextDocuments, nextDrafts, nextNodes, nextEdges, recQueue] = await Promise.all([
        listDocuments(userId),
        listDrafts(userId),
        listMindNodes(userId),
        listMindEdges(userId),
        listRecommendationDockQueue(userId, { status: 'generated', limit: 8 }).catch(() => ({ items: [] as RecommendationDockQueueItem[], total: 0, nextCursor: null })),
      ])
      setDocuments(nextDocuments)
      setDrafts(nextDrafts)
      setMindNodes(nextNodes)
      setMindEdges(nextEdges)
      setRecommendations(recQueue.items)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    refreshWorkspaceData()
  }, [refreshWorkspaceData])

  useEffect(() => {
    const savedWidth = window.localStorage.getItem('atlax_editor_width_mode')
    if (savedWidth === 'compact' || savedWidth === 'comfortable' || savedWidth === 'wide') setWidthMode(savedWidth)
  }, [])

  useEffect(() => {
    window.localStorage.setItem('atlax_editor_width_mode', widthMode)
  }, [widthMode])

  const projectOptions = useMemo(() => {
    return buildProjectOptions(documents, mindNodes)
  }, [documents, mindNodes])

  const openTab = useCallback((tab: EditorWorkspaceTab) => {
    setTabs((prev) => {
      const existing = prev.find((item) => item.id === tab.id)
      if (existing) {
        return prev.map((item) => item.id === tab.id ? { ...item, ...tab, lastOpenedAt: new Date() } : item)
      }
      return [...prev, tab]
    })
    setActiveTabId(tab.id)
    if (tab.projectName) {
      const expandedId = tab.rootNodeId ?? tab.projectName
      setExpandedNodeIds((current) => new Set([...Array.from(current), expandedId]))
    }
  }, [])

  const openDocumentTab = useCallback((document: StoredDocument, options?: { activateOnly?: boolean }) => {
    const tab: EditorWorkspaceTab = {
      id: `document:${document.id}`,
      kind: 'document',
      title: normalizeTitle(document.title),
      path: document.project ? `${document.project} / ${normalizeTitle(document.title)}` : normalizeTitle(document.title),
      projectName: document.project ?? null,
      target: { kind: 'document', id: document.id },
      lastOpenedAt: new Date(),
    }
    openTab(tab)
    if (!options?.activateOnly) {
      recordRecentDocumentOpen({ userId, documentId: document.id, title: normalizeTitle(document.title) }).catch(() => {})
    }
  }, [openTab, userId])

  const openDraftTab = useCallback((draft: StoredDraft) => {
    openTab({
      id: `draft:${draft.id}`,
      kind: 'draft',
      title: normalizeTitle(draft.title),
      path: draft.project ? `${draft.project} / Page / ${normalizeTitle(draft.title)}` : `Scatter / ${normalizeTitle(draft.title)}`,
      projectName: draft.project ?? null,
      target: { kind: 'draft', id: draft.id },
      lastOpenedAt: new Date(),
    })
  }, [openTab])

  const openProjectTab = useCallback((projectName: string, rootNodeId?: string | null) => {
    const projectDocs = documents
      .filter((doc) => doc.project === projectName)
      .sort((a, b) => new Date(b.archivedAt ?? b.createdAt).getTime() - new Date(a.archivedAt ?? a.createdAt).getTime())
    const defaultDoc = projectDocs.find((doc) => /overview|总览|概览/i.test(doc.title)) ?? projectDocs[0] ?? null
    openTab({
      id: `project:${rootNodeId ?? projectName}`,
      kind: 'project',
      title: projectName,
      path: `${projectName} / ${defaultDoc ? normalizeTitle(defaultDoc.title) : 'Overview'}`,
      projectName,
      rootNodeId,
      target: defaultDoc ? { kind: 'document', id: defaultDoc.id } : null,
      lastOpenedAt: new Date(),
    })
  }, [documents, openTab])

  useEffect(() => {
    if (loading || tabs.length > 0) return
    if (projectOptions.length > 0) {
      openProjectTab(projectOptions[0].title, projectOptions[0].rootNodeId)
      return
    }
    if (documents.length > 0) {
      openDocumentTab(documents[0], { activateOnly: true })
    }
  }, [documents, loading, openDocumentTab, openProjectTab, projectOptions, tabs.length])

  useEffect(() => {
    if (initialEntryId == null) return
    const doc = documents.find((item) => item.id === initialEntryId)
    if (doc) {
      openDocumentTab(doc)
      onInitialEntryConsumed?.()
      onToast?.('已在 Editor 中打开正式文档')
    }
  }, [documents, initialEntryId, onInitialEntryConsumed, onToast, openDocumentTab])

  useEffect(() => {
    if (initialDraftId == null) return
    const draft = drafts.find((item) => item.id === initialDraftId)
    if (draft) {
      openDraftTab(draft)
      onInitialDraftConsumed?.()
    }
  }, [drafts, initialDraftId, onInitialDraftConsumed, openDraftTab])

  useEffect(() => {
    onActiveDraftMetaChange?.({
      id: activeTarget?.kind === 'draft' ? activeTarget.id : null,
      title: editorDoc.title || activeTab?.title || 'Untitled',
      status: activeTarget?.kind === 'draft' ? 'active' : activeTarget?.kind === 'document' ? 'document' : 'idle',
    })
  }, [activeTab?.title, activeTarget, editorDoc.title, onActiveDraftMetaChange])

  const domainTree = useMemo(() => {
    if (!activeProjectName) return null
    return buildDomainTree(activeProjectName, documents, drafts, mindNodes, mindEdges)
  }, [activeProjectName, documents, drafts, mindEdges, mindNodes])

  const viewBlockData = useMemo<EditorViewBlockData>(() => {
    const projectDocuments = activeProjectName
      ? documents.filter((doc) => doc.project === activeProjectName)
      : documents
    return {
      documents: projectDocuments.slice(0, 12).map((doc) => ({
        id: `document:${doc.id}`,
        name: normalizeTitle(doc.title),
        status: doc.type || 'document',
        meta: doc.project ?? 'Scatter',
        updated: formatTime(doc.archivedAt ?? doc.createdAt),
      })),
      recommendations: recommendations.slice(0, 12).map((item) => ({
        id: item.id,
        name: item.recommendationType,
        status: item.status,
        meta: `${Math.round(item.confidenceScore * 100)}%`,
        updated: formatTime(item.updatedAt),
      })),
      mindLinks: mindEdges.slice(0, 12).map((edge) => ({
        id: edge.id,
        name: `${resolveMindNodeLabel(mindNodes, edge.sourceNodeId)} -> ${resolveMindNodeLabel(mindNodes, edge.targetNodeId)}`,
        status: edge.edgeType,
        meta: edge.source,
        updated: formatTime(edge.updatedAt),
      })),
    }
  }, [activeProjectName, documents, mindEdges, mindNodes, recommendations])

  const flattenedTree = useMemo(() => {
    if (!domainTree) return []
    return flattenTree(domainTree, expandedNodeIds)
  }, [domainTree, expandedNodeIds])

  const openResults = useMemo(() => {
    const projectResults: OpenResult[] = projectOptions.map((project) => ({
      id: `project:${project.rootNodeId ?? project.title}`,
      kind: project.kind,
      title: project.title,
      path: project.path,
      typeLabel: project.kind === 'domain' ? 'topic' : 'project',
      updatedAt: project.updatedAt,
      node: project.node,
    }))
    const docResults: OpenResult[] = documents.map((document) => ({
      id: `document:${document.id}`,
      kind: 'document',
      title: normalizeTitle(document.title),
      path: document.project ? `~/${document.project}` : '~/Scatter',
      typeLabel: 'scatter document',
      updatedAt: new Date(document.archivedAt ?? document.createdAt),
      document,
    }))
    const draftResults: OpenResult[] = drafts.map((draft) => ({
      id: `draft:${draft.id}`,
      kind: 'draft',
      title: normalizeTitle(draft.title),
      path: draft.project ? `~/${draft.project}` : '~/Scatter',
      typeLabel: 'page',
      updatedAt: new Date(draft.updatedAt),
      draft,
    }))
    const all = [...projectResults, ...docResults, ...draftResults]
    const query = openQuery.trim().toLowerCase()
    return all
      .filter((item) => openTypeFilter === 'all' || (openTypeFilter === 'project' ? item.kind !== 'document' && item.kind !== 'draft' : item.kind === 'document' || item.kind === 'draft'))
      .filter((item) => {
        if (!query) return true
        if (titleOnlyFilter) return item.title.toLowerCase().includes(query)
        return item.title.toLowerCase().includes(query) || item.path.toLowerCase().includes(query)
      })
      .sort((a, b) => sortMode === 'title' ? a.title.localeCompare(b.title) : b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 40)
  }, [documents, drafts, openQuery, openTypeFilter, projectOptions, sortMode, titleOnlyFilter])

  const selectedOpenResult = openResults[Math.min(selectedOpenIndex, Math.max(0, openResults.length - 1))] ?? null

  const handleOpenResult = useCallback((result: OpenResult) => {
    if (result.kind === 'project' || result.kind === 'domain') {
      openProjectTab(result.title, result.node?.id ?? null)
    } else if (result.kind === 'draft' && result.draft) {
      openDraftTab(result.draft)
    } else if (result.document) {
      openDocumentTab(result.document)
    }
    setShowOpenDialog(false)
  }, [openDocumentTab, openDraftTab, openProjectTab])

  useEffect(() => {
    if (!showOpenDialog) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowOpenDialog(false)
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedOpenIndex((index) => Math.min(index + 1, Math.max(0, openResults.length - 1)))
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedOpenIndex((index) => Math.max(0, index - 1))
      }
      if (event.key === 'Enter' && selectedOpenResult) {
        event.preventDefault()
        handleOpenResult(selectedOpenResult)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleOpenResult, openResults.length, selectedOpenResult, showOpenDialog])

  const handleTreeNodeOpen = useCallback((node: DomainTreeNode) => {
    if (node.children.length > 0 || node.nodeType !== 'document') {
      setExpandedNodeIds((current) => {
        const next = new Set(current)
        if (next.has(node.id)) next.delete(node.id)
        else next.add(node.id)
        return next
      })
    }
    if (node.documentId != null) {
      const doc = documents.find((item) => item.id === node.documentId)
      if (doc) openDocumentTab(doc)
    }
    if (node.draftId != null) {
      const draft = drafts.find((item) => item.id === node.draftId)
      if (draft) openDraftTab(draft)
    }
  }, [documents, drafts, openDocumentTab, openDraftTab])

  const closeTab = useCallback((tabId: string) => {
    const closingTab = tabs.find((tab) => tab.id === tabId)
    if (closingTab?.kind === 'draft' && closingTab.target?.kind === 'draft') {
      const draftId = closingTab.target.id
      const draft = drafts.find((d) => d.id === draftId)
      const titleBlank = !draft?.title?.trim() || draft.title === 'Untitled'
      const contentBlank = !draft?.content?.trim() && !draft?.plainText?.trim() && !draft?.markdown?.trim()
      if (titleBlank && contentBlank) {
        discardDraft(userId, draftId, 'abandon_changes').catch(() => {})
        setDrafts((prevDrafts) => prevDrafts.filter((d) => d.id !== draftId))
      }
    }
    setTabs((prev) => {
      const next = prev.filter((tab) => tab.id !== tabId)
      return next
    })
    if (activeTabId === tabId) {
      const remaining = tabs.filter((tab) => tab.id !== tabId)
      setActiveTabId(remaining[remaining.length - 1]?.id ?? null)
    }
  }, [activeTabId, drafts, tabs, userId])

  const handleCreateDraft = useCallback(async () => {
    const scratchId = `${SCRATCH_TAB_ID_PREFIX}${Date.now()}`
    openTab({
      id: scratchId,
      kind: 'draft',
      title: 'Untitled',
      path: 'Scatter / Untitled',
      projectName: null,
      target: { kind: 'scratch', id: scratchId },
      lastOpenedAt: new Date(),
    })
    setShowOpenDialog(false)
    onToast?.('已新建散点 Page')
  }, [onToast, openTab])

  const handleCreateProjectDraft = useCallback(async () => {
    const projectName = activeProjectName
    if (!projectName) {
      await handleCreateDraft()
      return
    }
    const scratchId = `${SCRATCH_TAB_ID_PREFIX}${Date.now()}`
    setExpandedNodeIds((current) => {
      const next = new Set(current)
      if (domainTree) next.add(domainTree.id)
      next.add(projectName)
      return next
    })
    openTab({
      id: scratchId,
      kind: 'draft',
      title: 'Untitled',
      path: `${projectName} / Page / Untitled`,
      projectName,
      rootNodeId: domainTree?.id ?? null,
      target: { kind: 'scratch', id: scratchId },
      lastOpenedAt: new Date(),
    })
    setShowOpenDialog(false)
    onToast?.('已在当前 Domain 新增 Page')
  }, [activeProjectName, domainTree, handleCreateDraft, onToast, openTab])

  const handlePublish = useCallback(async () => {
    if (!activeTarget) return
    if (activeTarget.kind === 'scratch') {
      onToast?.('空白 Page 尚未创建，请先输入内容。')
      return
    }
    await editorDoc.flushSave()
    if (activeTarget.kind === 'document') {
      onToast?.('文档已保存')
      return
    }
    setPublishing(true)
    try {
      const result = await publishDraftToDocument(userId, activeTarget.id, 'update_original')
      if (result.emptyDraft) {
        onToast?.('空 Draft 不能发布，请先编写内容')
        return
      }
      if (result.nameConflict) {
        onToast?.('同名文档已存在于当前层级，请修改标题后重试')
        return
      }
      if (result.entry) {
        await refreshWorkspaceData()
        setDrafts((prev) => prev.filter((draft) => draft.id !== activeTarget.id))
        setTabs((prev) => prev.filter((tab) => tab.id !== `draft:${activeTarget.id}`))
        openDocumentTab(result.entry)
        onToast?.(`已发布为正式文档 (ID: ${result.entry.id})`)
      } else {
        onToast?.('发布失败')
      }
    } finally {
      setPublishing(false)
    }
  }, [activeTarget, editorDoc, onToast, openDocumentTab, refreshWorkspaceData, userId])

  const handleArchiveActive = useCallback(async () => {
    if (!activeTarget || !activeTabId) return
    if (activeTarget.kind === 'scratch') {
      closeTab(activeTabId)
      onToast?.('临时 Page 已关闭')
      return
    }
    if (activeTarget.kind === 'draft') {
      await discardDraft(userId, activeTarget.id, 'abandon_changes')
      setDrafts((prev) => prev.filter((draft) => draft.id !== activeTarget.id))
      closeTab(activeTabId)
      onToast?.('Page 已移出 Editor')
      return
    }
    await updateArchivedEntry(userId, activeTarget.id, { archivedAt: new Date() })
    setDocuments((prev) => prev.filter((doc) => doc.id !== activeTarget.id))
    closeTab(activeTabId)
    onToast?.('文档已归档')
  }, [activeTabId, activeTarget, closeTab, onToast, userId])

  const handleLocalTitleChange = useCallback((nextTitle: string) => {
    if (activeTarget?.kind === 'scratch') {
      pendingScratchRef.current = {
        title: nextTitle,
        contentJson: editorDoc.contentJson,
        plainText: editorDoc.plainText,
        html: editorDoc.html,
        markdown: editorDoc.markdown,
        tags: editorDoc.tags,
        project: activeTab?.projectName ?? null,
      }
    }
    if (!materializingRef.current && activeTarget?.kind === 'scratch' && activeTab && shouldMaterializeDraft(nextTitle, {
      content: editorDoc.content,
      contentJson: editorDoc.contentJson,
      plainText: editorDoc.plainText,
      html: editorDoc.html,
      markdown: editorDoc.markdown,
    })) {
      createDraft(userId, nextTitle, editorDoc.content, undefined, undefined, editorDoc.tags, activeTab.projectName ?? null, null, {
        contentJson: editorDoc.contentJson,
        plainText: editorDoc.plainText,
        html: editorDoc.html,
        markdown: editorDoc.markdown,
      }).then((draft) => {
        if (!draft) return
        const latest = pendingScratchRef.current
        Promise.resolve(
          latest
            ? updateDraft(userId, draft.id, {
              title: latest.title,
              content: latest.plainText || latest.markdown,
              contentJson: latest.contentJson,
              plainText: latest.plainText,
              html: latest.html,
              markdown: latest.markdown,
              tags: latest.tags,
              project: latest.project,
            })
            : draft
        ).then((updated) => {
          const finalDraft = (updated as StoredDraft) ?? draft
          setDrafts((prev) => [finalDraft, ...prev])
          setTabs((prev) => prev.map((tab) => tab.id === activeTab.id ? {
            ...tab,
            id: `draft:${finalDraft.id}`,
            title: normalizeTitle(finalDraft.title),
            path: finalDraft.project ? `${finalDraft.project} / Page / ${normalizeTitle(finalDraft.title)}` : `Scatter / ${normalizeTitle(finalDraft.title)}`,
            target: { kind: 'draft', id: finalDraft.id },
          } : tab))
          setActiveTabId(`draft:${finalDraft.id}`)
          emit({ type: 'draft_created', draftId: finalDraft.id })
          pendingScratchRef.current = null
        }).catch(() => {})
      }).catch(() => {}).finally(() => { materializingRef.current = false })
      materializingRef.current = true
    }
    editorDoc.handleTitleChange(nextTitle)
    if (!activeTab) return
    setTabs((prev) => prev.map((tab) => tab.id === activeTab.id ? { ...tab, title: normalizeTitle(nextTitle) } : tab))
    if (activeTarget?.kind === 'draft') {
      setDrafts((prev) => prev.map((draft) => draft.id === activeTarget.id ? { ...draft, title: nextTitle, updatedAt: new Date() } : draft))
    }
    if (activeTarget?.kind === 'document') {
      setDocuments((prev) => prev.map((doc) => doc.id === activeTarget.id ? { ...doc, title: nextTitle, archivedAt: new Date() } : doc))
      setMindNodes((prev) => prev.map((node) => node.documentId === activeTarget.id ? { ...node, label: nextTitle, updatedAt: new Date() } : node))
    }
  }, [activeTab, activeTarget, editorDoc, userId])

  const handleLocalContentChange = useCallback((payload: EditorContentPayload) => {
    if (activeTarget?.kind === 'scratch') {
      pendingScratchRef.current = {
        title: editorDoc.title,
        contentJson: payload.contentJson,
        plainText: payload.plainText,
        html: payload.html,
        markdown: payload.markdown,
        tags: editorDoc.tags,
        project: activeTab?.projectName ?? null,
      }
    }
    if (!materializingRef.current && activeTarget?.kind === 'scratch' && activeTab && shouldMaterializeDraft(editorDoc.title, payload)) {
      createDraft(userId, editorDoc.title, payload.content, undefined, undefined, editorDoc.tags, activeTab.projectName ?? null, null, {
        contentJson: payload.contentJson,
        plainText: payload.plainText,
        html: payload.html,
        markdown: payload.markdown,
      }).then((draft) => {
        if (!draft) return
        const latest = pendingScratchRef.current
        Promise.resolve(
          latest
            ? updateDraft(userId, draft.id, {
              title: latest.title,
              content: latest.plainText || latest.markdown,
              contentJson: latest.contentJson,
              plainText: latest.plainText,
              html: latest.html,
              markdown: latest.markdown,
              tags: latest.tags,
              project: latest.project,
            })
            : draft
        ).then((updated) => {
          const finalDraft = (updated as StoredDraft) ?? draft
          setDrafts((prev) => [finalDraft, ...prev])
          setTabs((prev) => prev.map((tab) => tab.id === activeTab.id ? {
            ...tab,
            id: `draft:${finalDraft.id}`,
            title: normalizeTitle(finalDraft.title),
            path: finalDraft.project ? `${finalDraft.project} / Page / ${normalizeTitle(finalDraft.title)}` : `Scatter / ${normalizeTitle(finalDraft.title)}`,
            target: { kind: 'draft', id: finalDraft.id },
          } : tab))
          setActiveTabId(`draft:${finalDraft.id}`)
          emit({ type: 'draft_created', draftId: finalDraft.id })
          pendingScratchRef.current = null
        }).catch(() => {})
      }).catch(() => {}).finally(() => { materializingRef.current = false })
      materializingRef.current = true
    }
    editorDoc.handleContentChange(payload)
  }, [activeTab, activeTarget?.kind, editorDoc, userId])

  const handleProjectChange = useCallback((project: string | null) => {
    editorDoc.handleProjectChange(project)
    if (!activeTarget) return
    if (activeTarget.kind === 'draft') {
      setDrafts((prev) => prev.map((draft) => draft.id === activeTarget.id ? { ...draft, project, updatedAt: new Date() } : draft))
    } else {
      setDocuments((prev) => prev.map((doc) => doc.id === activeTarget.id ? { ...doc, project, archivedAt: new Date() } : doc))
    }
    setTabs((prev) => prev.map((tab) => tab.id === activeTabId ? {
      ...tab,
      projectName: project,
      path: project ? `${project} / ${tab.kind === 'draft' ? 'Draft / ' : ''}${tab.title}` : tab.title,
    } : tab))
    if (project) {
      setExpandedNodeIds((current) => new Set([...Array.from(current), project]))
    }
  }, [activeTabId, activeTarget, editorDoc])

  const saveStatusLabel = () => {
    switch (editorDoc.saveStatus) {
      case 'saving': return 'Saving...'
      case 'saved': return activeTarget?.kind === 'document' ? 'Document · Saved' : 'Page · Saved'
      case 'failed': return 'Save failed'
      default: return activeTarget ? 'Unsaved' : ''
    }
  }

  const saveStatusIcon = () => {
    switch (editorDoc.saveStatus) {
      case 'saving': return <Loader2 size={11} className="animate-spin text-slate-400" />
      case 'saved': return <Check size={11} className="text-emerald-400" />
      case 'failed': return <AlertCircle size={11} className="text-red-400" />
      default: return null
    }
  }

  const isScatterDocument = activeTab?.kind === 'document' && !activeTab.projectName

  return (
    <div className="w-full h-full flex flex-col overflow-hidden text-sm animate-in fade-in duration-300">
      <div className="h-[42px] shrink-0 border-b border-white/[0.06] bg-[#0d1215]/85 flex items-center">
        <div className="flex h-full min-w-0 flex-1 items-center overflow-x-auto custom-scrollbar">
          {tabs.map((tab) => {
            const active = tab.id === activeTabId
            const Icon = tab.kind === 'project' || tab.kind === 'domain' ? Folder : tab.kind === 'draft' ? Type : FileText
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTabId(tab.id)}
                className={`group flex h-full min-w-[150px] max-w-[240px] items-center gap-2 border-r border-white/[0.055] px-3 text-left transition-colors ${
                  active ? 'bg-white/[0.045] text-white shadow-[inset_0_-1px_0_#86d7ff]' : 'text-[#899298] hover:bg-white/[0.03] hover:text-white'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-[#86d7ff]' : 'text-[#899298]'}`} />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{tab.path}</span>
                <span
                  onClick={(event) => { event.stopPropagation(); closeTab(tab.id) }}
                  className="rounded p-0.5 opacity-0 transition-opacity hover:bg-white/10 group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </span>
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => { setSelectedOpenIndex(0); setShowOpenDialog(true) }}
            className="flex h-full w-11 shrink-0 items-center justify-center border-r border-white/[0.055] text-[#899298] hover:bg-white/[0.04] hover:text-white"
            title="打开项目或散点文档"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex h-full items-center gap-1 px-2">
          <button
            onClick={onToggleInspector}
            className={`rounded-md p-1.5 ${showInspector ? 'bg-white/[0.08] text-white' : 'text-[#899298] hover:bg-white/[0.07] hover:text-white'}`}
            title="检查器"
          >
            <PanelRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {showDomainTree && (
          <aside className="w-[260px] shrink-0 border-r border-white/[0.06] bg-[#0b1013]/78 flex flex-col">
            <div className="flex h-10 items-center justify-between border-b border-white/[0.06] px-3">
              <div className="flex min-w-0 items-center gap-2 text-[12px] font-medium text-white">
                <Layers className="h-3.5 w-3.5 text-[#86d7ff]" />
                <span className="truncate">{activeProjectName ?? 'Domain 目录'}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCreateProjectDraft}
                  className="rounded p-1 text-[#899298] hover:bg-white/[0.07] hover:text-[#86d7ff]"
                  title="在当前结构中新建空白页面"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setShowDomainTree(false)}
                  className="rounded p-1 text-[#899298] hover:bg-white/[0.07] hover:text-white"
                  title="隐藏左侧目录"
                >
                  <PanelLeft className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar py-1">
              {loading ? (
                <div className="px-3 py-6 text-center text-[10px] text-[#899298]">Loading...</div>
              ) : isScatterDocument ? (
                <div className="px-4 py-6 text-[11px] leading-relaxed text-[#899298]">
                  散点文档只进入顶部 tab，不进入左侧目录。
                </div>
              ) : flattenedTree.length === 0 ? (
                <div className="px-4 py-6 text-[11px] leading-relaxed text-[#899298]">
                  当前项目暂无层级结构。保存正式文档并设置项目后会出现在这里。
                </div>
              ) : (
                flattenedTree.map(({ node, depth }) => {
                  const expanded = expandedNodeIds.has(node.id)
                  const active = (node.documentId != null && activeTarget?.kind === 'document' && activeTarget.id === node.documentId) ||
                    (node.draftId != null && activeTarget?.kind === 'draft' && activeTarget.id === node.draftId)
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => handleTreeNodeOpen(node)}
                      className={`flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[12px] transition-colors ${
                        active ? 'bg-[#86d7ff]/10 text-[#dff5ff]' : 'text-[#b8c0c5] hover:bg-white/[0.045] hover:text-white'
                      }`}
                      style={{ paddingLeft: `${8 + depth * 14}px` }}
                    >
                      {node.children.length > 0 ? (
                        expanded ? <ChevronDown className="h-3 w-3 text-[#899298]" /> : <ChevronRight className="h-3 w-3 text-[#899298]" />
                      ) : (
                        <span className="h-3 w-3" />
                      )}
                      {node.nodeType === 'document' || node.nodeType === 'draft' ? <FileText className="h-3.5 w-3.5 text-[#9edcff]" /> : <Folder className="h-3.5 w-3.5 text-[#899298]" />}
                      <span className="truncate">{node.title}</span>
                      {node.nodeType === 'draft' && <span className="ml-auto rounded bg-[#9cf4d4]/10 px-1 text-[8px] uppercase text-[#9cf4d4]">Page</span>}
                    </button>
                  )
                })
              )}
            </div>
          </aside>
        )}

        <main className="min-w-0 flex-1 flex flex-col overflow-hidden">
          <div className="h-[38px] shrink-0 border-b border-white/[0.05] bg-[#0d1215]/65 flex items-center gap-2 px-3">
            {!showDomainTree && (
              <button
                onClick={() => setShowDomainTree(true)}
                className="rounded p-1.5 text-[#899298] hover:bg-white/[0.07] hover:text-white"
                title="显示左侧目录"
              >
                <PanelLeft className="h-3.5 w-3.5" />
              </button>
            )}
            <div className="min-w-0 flex-1 truncate text-[11px] uppercase tracking-wide text-[#899298]">
              {activeTab?.path ?? 'Editor 工作台'}
            </div>
            <div
              id={toolbarPortalTargetId}
              className="h-7 min-w-[380px] rounded-md border border-white/[0.08] bg-[#151a1e]/85 px-1"
            />
            <span className="flex items-center gap-1.5 text-[11px] text-[#899298]/75">
              {saveStatusIcon()}
              {saveStatusLabel()}
            </span>
            <div className="relative">
              <button
                type="button"
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[#899298] hover:bg-white/[0.07] hover:text-white"
                onClick={() => setWidthMode(widthMode === 'comfortable' ? 'wide' : widthMode === 'wide' ? 'compact' : 'comfortable')}
                title="正文宽度"
              >
                <Columns3 className="h-3.5 w-3.5" />
                {WIDTH_LABELS[widthMode]}
              </button>
            </div>
            <button
              onClick={handlePublish}
              disabled={!activeTarget || publishing || activeTarget.kind === 'scratch'}
              className="flex items-center gap-1.5 rounded-md bg-[#86d7ff]/10 px-3 py-1 text-[11px] font-medium text-[#86d7ff] transition-colors hover:bg-[#86d7ff]/18 disabled:opacity-40"
              title={activeTarget?.kind === 'scratch' ? '临时 Page 不可发布' : undefined}
            >
              <Send className="h-3 w-3" />
              {activeTarget?.kind === 'scratch' ? '临时 Page' : activeTarget?.kind === 'draft' ? (publishing ? '发布中...' : '发布') : '保存'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {!activeTarget ? (
              <div className="flex h-full flex-col items-center justify-center text-[#899298]">
                <FileText className="mb-4 h-9 w-9 opacity-20" />
                <p className="mb-4 text-sm">打开一个项目、正式文档或 Draft 开始编辑。</p>
                <button
                  onClick={() => setShowOpenDialog(true)}
                  className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-[12px] text-white hover:bg-white/[0.08]"
                >
                  <Plus className="h-4 w-4" /> 打开项目或散点文档
                </button>
              </div>
            ) : !editorDoc.loaded ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-[#899298]" />
              </div>
            ) : (
              <div className={`${EDITOR_SURFACE_WIDTH[widthMode]} relative mx-auto w-full px-8 pb-20 pt-7`}>
                <div className="mb-4 flex items-center gap-2 text-[11px] text-[#899298]">
                  <Calendar className="h-3 w-3" />
                  <span>{editorDoc.createdAt ? formatTime(editorDoc.createdAt) : '—'}</span>
                  <span>·</span>
                  <span>{editorDoc.content.length} 字</span>
                  <span>·</span>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${activeTarget.kind === 'draft' ? 'bg-[#9cf4d4]/10 text-[#9cf4d4]' : 'bg-[#86d7ff]/10 text-[#86d7ff]'}`}>
                    {activeTarget.kind === 'draft' ? 'Page' : 'Document'}
                  </span>
                </div>
                <input
                  type="text"
                  value={editorDoc.title}
                  onChange={(event) => handleLocalTitleChange(event.target.value)}
                  className="mb-3 w-full bg-transparent text-[30px] font-bold leading-tight tracking-normal text-white outline-none placeholder:text-[#899298]/35"
                  placeholder="Untitled"
                />
                <div className="mb-6 h-px bg-white/[0.06]" />
                <TiptapEditor
                  value={editorDoc.contentJson}
                  onChange={handleLocalContentChange}
                  placeholder="Start writing, or press / for blocks."
                  toolbarPortalTargetId={toolbarPortalTargetId}
                  widthMode={widthMode}
                  focusMode={showInspector}
                  onOutlineChange={setOutline}
                  onViewBlockSelectionChange={setSelectedViewBlock}
                  viewBlockData={viewBlockData}
                  enableBubbleMenu
                  enableBlockHandles
                />
              </div>
            )}
          </div>
        </main>

        {showInspector && (
          <aside className="w-[300px] shrink-0 border-l border-white/[0.07] bg-[#0d1215]/82 flex flex-col overflow-y-auto custom-scrollbar">
            <div className="flex h-10 items-center justify-between border-b border-white/[0.06] px-4">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <SlidersHorizontal className="h-4 w-4" /> Inspector
              </div>
              <button onClick={onToggleInspector} className="rounded p-1 text-[#899298] hover:bg-white/[0.07] hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {selectedViewBlock ? (
              <ViewBlockInspector selection={selectedViewBlock} />
            ) : (
              <DocumentInspector
                activeTab={activeTab}
                target={activeTarget}
                editorDoc={editorDoc}
                outline={outline}
                recommendations={recommendations}
                onTagsChange={editorDoc.handleTagsChange}
                onProjectChange={handleProjectChange}
                onPublish={handlePublish}
                onArchive={handleArchiveActive}
                publishing={publishing}
              />
            )}
          </aside>
        )}
      </div>

      {showOpenDialog && (
        <OpenDialog
          query={openQuery}
          onQueryChange={(value) => { setOpenQuery(value); setSelectedOpenIndex(0) }}
          results={openResults}
          selectedIndex={selectedOpenIndex}
          selected={selectedOpenResult}
          onSelectIndex={setSelectedOpenIndex}
          onOpen={handleOpenResult}
          onClose={() => setShowOpenDialog(false)}
          typeFilter={openTypeFilter}
          onTypeFilterChange={setOpenTypeFilter}
          titleOnly={titleOnlyFilter}
          onTitleOnlyChange={setTitleOnlyFilter}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          activeProjectName={activeProjectName}
          onCreateProjectPage={handleCreateProjectDraft}
          onCreateScatterPage={handleCreateDraft}
        />
      )}
    </div>
  )
}

function DocumentInspector({
  activeTab,
  target,
  editorDoc,
  outline,
  recommendations,
  onTagsChange,
  onProjectChange,
  onPublish,
  onArchive,
  publishing,
}: {
  activeTab: EditorWorkspaceTab | null
  target: EditorTarget
  editorDoc: ReturnType<typeof useEditorDocument>
  outline: EditorOutlineItem[]
  recommendations: RecommendationDockQueueItem[]
  onTagsChange: (tags: string[]) => void
  onProjectChange: (project: string | null) => void
  onPublish: () => void
  onArchive: () => void
  publishing: boolean
}) {
  const isScratch = target?.kind === 'scratch'
  return (
    <div className="px-4 py-4">
      {target && !isScratch && (
        <section className="mb-7">
          <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[#899298]">文稿操作</h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onPublish}
              disabled={publishing}
              className="rounded-md border border-[#86d7ff]/20 bg-[#86d7ff]/10 px-3 py-2 text-[11px] font-medium text-[#86d7ff] hover:bg-[#86d7ff]/18 disabled:opacity-50"
            >
              {target.kind === 'draft' ? (publishing ? '发布中...' : '发布为文档') : '保存文档'}
            </button>
            <button
              onClick={onArchive}
              className="rounded-md border border-[#ffb4ab]/20 bg-[#ffb4ab]/10 px-3 py-2 text-[11px] font-medium text-[#ffb4ab] hover:bg-[#ffb4ab]/18"
            >
              {target.kind === 'draft' ? '移出工作台' : '归档文档'}
            </button>
          </div>
        </section>
      )}
      {isScratch && (
        <section className="mb-7 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-[#b8c0c5]">
          输入内容后自动创建 Page
        </section>
      )}
      <section className="mb-7">
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[#899298]">文档属性</h3>
        <div className="space-y-2 text-[12px]">
          <InspectorRow label="状态" value={target ? '编辑中' : '未选择'} />
          <InspectorRow label="类型" value={target?.kind === 'scratch' ? '临时 Page' : target?.kind === 'draft' ? 'Draft' : target?.kind === 'document' ? 'Document' : '—'} />
          <InspectorRow label="路径" value={activeTab?.path ?? '—'} />
          <InspectorRow label="字数" value={String(editorDoc.content.length)} />
          <InspectorRow label="更新" value={editorDoc.updatedAt ? formatTime(editorDoc.updatedAt) : '—'} />
        </div>
      </section>

      <section className="mb-7">
        <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#899298]">
          <Tags className="h-3 w-3" /> 标签
        </h3>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {editorDoc.tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 rounded bg-[#86d7ff]/10 px-2 py-0.5 text-[10px] text-[#86d7ff]">
              {tag}
              <button onClick={() => onTagsChange(editorDoc.tags.filter((item) => item !== tag))}>
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          {editorDoc.tags.length === 0 && <span className="text-[10px] text-[#899298]">暂无标签</span>}
        </div>
        {target && (
          <input
            className="w-full rounded-md border border-white/[0.07] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white outline-none placeholder:text-[#899298]/60 focus:border-[#86d7ff]/35"
            placeholder="添加标签..."
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              if (event.nativeEvent.isComposing || event.keyCode === 229) return
              const value = event.currentTarget.value.trim()
              if (value && !editorDoc.tags.includes(value)) onTagsChange([...editorDoc.tags, value])
              event.currentTarget.value = ''
            }}
          />
        )}
      </section>

      <section className="mb-7">
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[#899298]">项目 / Domain</h3>
        <input
          value={editorDoc.project ?? ''}
          onChange={(event) => onProjectChange(event.target.value || null)}
          className="w-full rounded-md border border-white/[0.07] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white outline-none placeholder:text-[#899298]/60 focus:border-[#86d7ff]/35"
          placeholder="未指定项目"
        />
      </section>

      {outline.length > 0 && (
        <section className="mb-7">
          <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[#899298]">文档目录</h3>
          <div className="space-y-1">
            {outline.slice(0, 14).map((item) => (
              <div key={item.id} className="truncate text-[11px] leading-relaxed text-[#899298]" style={{ paddingLeft: `${(item.level - 1) * 10}px` }}>
                {item.title}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[#899298]">推荐处理</h3>
        <div className="space-y-2">
          {recommendations.length === 0 ? (
            <div className="rounded-md border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[11px] text-[#899298]">暂无待处理推荐</div>
          ) : recommendations.slice(0, 3).map((item) => (
            <div key={item.id} className="rounded-md border border-white/[0.06] bg-white/[0.025] px-3 py-2">
              <div className="truncate text-[11px] font-medium text-white">{item.recommendationType}</div>
              <div className="mt-1 text-[10px] text-[#899298]">置信度 {Math.round(item.confidenceScore * 100)}%</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function ViewBlockInspector({ selection }: { selection: EditorViewBlockSelection }) {
  return (
    <div className="px-4 py-4">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.05] text-[#86d7ff]">
          {selection.viewType === 'Graph' ? <GitBranch className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">{selection.name}</h3>
          <p className="mt-0.5 text-[11px] text-[#899298]">当前视图块</p>
        </div>
      </div>
      <section className="mb-6 space-y-2">
        <InspectorRow label="View type" value={selection.viewType} />
        <InspectorRow label="数据源" value={selection.dataSource} />
        <InspectorRow label="过滤条件" value={selection.filters} />
        <InspectorRow label="排序条件" value={selection.sort} />
        <InspectorRow label="分页设置" value={`${selection.pageSize} / page`} />
      </section>
      <section className="mb-6">
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[#899298]">显示字段</h3>
        <div className="space-y-1.5">
          {selection.fields.map((field) => (
            <div key={field} className="flex items-center justify-between rounded-md border border-white/[0.06] bg-white/[0.025] px-2 py-1.5 text-[11px] text-[#dce3e8]">
              <span>{field}</span>
              <span className="text-[#899298]">显示</span>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[#899298]">样式配置</h3>
        <div className="rounded-md border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[11px] text-[#899298]">
          沿用当前 Editor 紧凑表格样式。
        </div>
      </section>
    </div>
  )
}

function InspectorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] pb-2">
      <span className="shrink-0 text-[#899298]">{label}</span>
      <span className="min-w-0 truncate text-right text-white" title={value}>{value}</span>
    </div>
  )
}

function OpenDialog({
  query,
  onQueryChange,
  results,
  selectedIndex,
  selected,
  onSelectIndex,
  onOpen,
  onClose,
  typeFilter,
  onTypeFilterChange,
  titleOnly,
  onTitleOnlyChange,
  sortMode,
  onSortModeChange,
  activeProjectName,
  onCreateProjectPage,
  onCreateScatterPage,
}: {
  query: string
  onQueryChange: (value: string) => void
  results: OpenResult[]
  selectedIndex: number
  selected: OpenResult | null
  onSelectIndex: (index: number) => void
  onOpen: (result: OpenResult) => void
  onClose: () => void
  typeFilter: 'all' | 'project' | 'document'
  onTypeFilterChange: (value: 'all' | 'project' | 'document') => void
  titleOnly: boolean
  onTitleOnlyChange: (value: boolean) => void
  sortMode: 'recent' | 'title'
  onSortModeChange: (value: 'recent' | 'title') => void
  activeProjectName: string | null
  onCreateProjectPage: () => void
  onCreateScatterPage: () => void
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#05080a]/65 backdrop-blur-sm">
      <div className="flex h-[76vh] w-[1040px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#11171b]/96 shadow-[0_32px_100px_rgba(0,0,0,0.7)]">
        <div className="border-b border-white/[0.07] px-6 py-4">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">打开项目或散点文档</h2>
              <p className="mt-1 text-[12px] text-[#899298]">项目会切换左侧结构；散点文档只进入顶部面包屑，不进入左侧目录。</p>
            </div>
            <button onClick={onClose} className="rounded-md p-1.5 text-[#899298] hover:bg-white/[0.07] hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-[#86d7ff]/45 bg-black/20 px-3 py-2">
            <Search className="h-4 w-4 text-[#899298]" />
            <input
              autoFocus
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索项目或散点文档..."
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[#899298]/60"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#c4ccd2]">
            <button
              onClick={() => onTitleOnlyChange(!titleOnly)}
              className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 hover:bg-white/[0.07] ${titleOnly ? 'border-[#86d7ff]/35 bg-[#86d7ff]/10 text-[#86d7ff]' : 'border-white/[0.07] bg-white/[0.035]'}`}
            >
              Title only
            </button>
            <button className="flex cursor-not-allowed items-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-[#899298]" title="本地单用户模式，创建者筛选暂无更多候选">
              Created by <span className="text-white">Me</span>
            </button>
            <button
              onClick={() => onTypeFilterChange(typeFilter === 'all' ? 'project' : typeFilter === 'project' ? 'document' : 'all')}
              className="flex items-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.035] px-2.5 py-1.5 hover:bg-white/[0.07]"
            >
              In <span className="text-white">{typeFilter === 'all' ? 'All' : typeFilter === 'project' ? 'Projects' : 'Documents'}</span>
            </button>
            <button
              onClick={() => onTypeFilterChange(typeFilter === 'document' ? 'all' : 'document')}
              className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 hover:bg-white/[0.07] ${typeFilter === 'document' ? 'border-[#86d7ff]/35 bg-[#86d7ff]/10 text-[#86d7ff]' : 'border-white/[0.07] bg-white/[0.035]'}`}
            >
              <Filter className="h-3 w-3" />
              Filter
            </button>
            <button
              onClick={() => {
                onTitleOnlyChange(false)
                onTypeFilterChange('all')
                onSortModeChange('recent')
              }}
              className="flex items-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.035] px-2.5 py-1.5 hover:bg-white/[0.07]"
            >
              More <span className="text-[#899298]">Reset</span>
            </button>
            <button
              onClick={() => onSortModeChange(sortMode === 'recent' ? 'title' : 'recent')}
              className="ml-auto rounded-md px-2.5 py-1.5 text-[#899298] hover:bg-white/[0.06]"
            >
              Sort by&nbsp;<span className="text-white">{sortMode === 'recent' ? '最近打开' : '标题 A-Z'}</span>
            </button>
          </div>
        </div>
        <div className="border-b border-white/[0.07] px-6 py-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onCreateProjectPage}
              className="flex items-center gap-3 rounded-md border border-white/[0.07] bg-white/[0.035] px-3 py-2 text-left hover:border-[#86d7ff]/30 hover:bg-[#86d7ff]/8"
            >
              <Plus className="h-4 w-4 text-[#86d7ff]" />
              <span className="min-w-0">
                <span className="block text-[12px] font-medium text-white">新建当前项目 Page</span>
                <span className="block truncate text-[10px] text-[#899298]">{activeProjectName ? `保存到 ${activeProjectName}` : '当前没有项目时会新建散点 Page'}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={onCreateScatterPage}
              className="flex items-center gap-3 rounded-md border border-white/[0.07] bg-white/[0.035] px-3 py-2 text-left hover:border-[#86d7ff]/30 hover:bg-[#86d7ff]/8"
            >
              <FileText className="h-4 w-4 text-[#86d7ff]" />
              <span>
                <span className="block text-[12px] font-medium text-white">新建散点 Page</span>
                <span className="block text-[10px] text-[#899298]">只进入顶部 tab，不进入左侧目录</span>
              </span>
            </button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[46%_54%]">
          <div className="min-h-0 border-r border-white/[0.07]">
            <div className="flex items-center justify-between px-4 py-3 text-[11px] text-[#899298]">
              <span>最近和候选</span>
              <span>{results.length} 个结果</span>
            </div>
            <div className="h-[calc(100%-42px)] overflow-y-auto custom-scrollbar px-2 pb-3">
              {results.map((result, index) => {
                const selectedRow = index === selectedIndex
                const Icon = result.kind === 'document' ? FileText : Folder
                return (
                  <button
                    key={result.id}
                    onMouseEnter={() => onSelectIndex(index)}
                    onClick={() => onOpen(result)}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                      selectedRow ? 'bg-[#86d7ff]/12 text-white' : 'text-[#dce3e8] hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/[0.07] bg-white/[0.04]">
                      <Icon className="h-4 w-4 text-[#86d7ff]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium">{result.title}</div>
                      <div className="mt-0.5 truncate text-[10px] text-[#899298]">{result.path}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] text-[#899298]">{formatTime(result.updatedAt)}</div>
                      <div className="mt-1 text-[9px] uppercase tracking-wide text-[#86d7ff]">{result.typeLabel}</div>
                    </div>
                  </button>
                )
              })}
              {results.length === 0 && <div className="px-4 py-8 text-center text-[12px] text-[#899298]">没有匹配结果</div>}
            </div>
          </div>
          <div className="min-h-0 overflow-y-auto custom-scrollbar p-6">
            {selected ? (
              <div>
                <div className="mb-5 flex items-start gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.05] text-[#86d7ff]">
                    {selected.kind === 'document' ? <FileText className="h-5 w-5" /> : <Database className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-xl font-semibold text-white">{selected.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[#899298]">
                      <span>{selected.typeLabel}</span>
                      <span>·</span>
                      <span>{selected.path}</span>
                    </div>
                  </div>
                  <button className="rounded-md p-1.5 text-[#899298] hover:bg-white/[0.07] hover:text-white">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
                <PreviewSection label="创建 / 更新" value={`${formatTime(selected.document?.createdAt ?? selected.updatedAt)} / ${formatTime(selected.updatedAt)}`} />
                <PreviewSection label="标签" value={selected.document?.tags?.length ? selected.document.tags.join(' · ') : '暂无标签'} />
                <PreviewSection label="摘要" value={selected.document ? excerpt(selected.document.plainText || selected.document.content || selected.document.markdown || '') : '项目上下文会打开对应 Domain 树，并加载 Overview 或最近文档。'} />
                <div className="mb-6">
                  <h4 className="mb-2 text-[12px] font-semibold text-white">关键点</h4>
                  <ul className="space-y-1.5 text-[12px] text-[#c4ccd2]">
                    <li>· {selected.kind === 'document' ? '作为顶部文档 tab 打开' : '作为项目 tab 打开并同步左侧结构'}</li>
                    <li>· {selected.kind === 'document' && !selected.document?.project ? '散点文档不会进入左侧目录' : '可在当前 Editor 工作台中继续编辑'}</li>
                    <li>· 最近打开记录会用于后续排序</li>
                  </ul>
                </div>
                <div className="mb-6">
                  <h4 className="mb-2 text-[12px] font-semibold text-white">相关内容</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {(selected.document?.tags ?? ['Documents', 'Mind Links', 'Recommendations']).slice(0, 3).map((item) => (
                      <div key={item} className="rounded-md border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[11px] text-[#dce3e8]">{item}</div>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2 border-t border-white/[0.07] pt-4">
                  <button onClick={() => onOpen(selected)} className="rounded-lg bg-[#86d7ff]/15 px-4 py-2 text-[12px] font-medium text-[#86d7ff] hover:bg-[#86d7ff]/24">
                    打开
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-[12px] text-[#899298]">选择一个结果查看预览</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewSection({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-5">
      <h4 className="mb-2 text-[12px] font-semibold text-white">{label}</h4>
      <p className="text-[12px] leading-relaxed text-[#c4ccd2]">{value || '—'}</p>
    </div>
  )
}

function buildProjectOptions(documents: StoredDocument[], nodes: StoredMindNode[]) {
  const byName = new Map<string, { title: string; rootNodeId: string | null; kind: 'project' | 'domain'; path: string; updatedAt: Date; node?: StoredMindNode }>()
  nodes
    .filter((node) => node.nodeType === 'project' || node.nodeType === 'domain' || node.nodeType === 'topic')
    .forEach((node) => {
      byName.set(node.label, {
        title: node.label,
        rootNodeId: node.id,
        kind: node.nodeType === 'domain' ? 'domain' : 'project',
        path: `~/${node.nodeType}/${node.label}`,
        updatedAt: new Date(node.updatedAt),
        node,
      })
    })
  documents.forEach((doc) => {
    if (!doc.project || byName.has(doc.project)) return
    byName.set(doc.project, {
      title: doc.project,
      rootNodeId: null,
      kind: 'project',
      path: `~/Projects/${doc.project}`,
      updatedAt: new Date(doc.archivedAt ?? doc.createdAt),
    })
  })
  return Array.from(byName.values()).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
}

function buildDomainTree(projectName: string, documents: StoredDocument[], drafts: StoredDraft[], nodes: StoredMindNode[], edges: StoredMindEdge[]): DomainTreeNode {
  const rootNode = nodes.find((node) => node.label === projectName && (node.nodeType === 'project' || node.nodeType === 'domain' || node.nodeType === 'topic'))
  const childrenByParent = new Map<string, StoredMindEdge[]>()
  edges.filter((edge) => edge.edgeType === 'parent_child').forEach((edge) => {
    const children = childrenByParent.get(edge.sourceNodeId) ?? []
    children.push(edge)
    childrenByParent.set(edge.sourceNodeId, children)
  })
  const nodeById = new Map(nodes.map((node) => [node.id, node]))

  const buildFromNode = (node: StoredMindNode, seen = new Set<string>()): DomainTreeNode => {
    if (seen.has(node.id)) {
      return { id: node.id, title: node.label, nodeType: node.nodeType, documentId: node.documentId, draftId: null, children: [] }
    }
    const nextSeen = new Set(seen)
    nextSeen.add(node.id)
    const children = (childrenByParent.get(node.id) ?? [])
      .map((edge) => nodeById.get(edge.targetNodeId))
      .filter((child): child is StoredMindNode => Boolean(child))
      .filter((child) => child.nodeType === 'project' || child.nodeType === 'domain' || child.nodeType === 'topic' || child.nodeType === 'document')
      .map((child) => buildFromNode(child, nextSeen))
    return { id: node.id, title: node.label, nodeType: node.nodeType, documentId: node.documentId, draftId: null, children }
  }

  const root = rootNode
    ? buildFromNode(rootNode)
    : { id: `project:${projectName}`, title: projectName, nodeType: 'project', documentId: null, draftId: null, children: [] }

  const knownDocIds = new Set<number>()
  collectDocumentIds(root, knownDocIds)
  // Fallback: when Mind parent_child edges are incomplete, project-tagged documents still appear in the Editor tree.
  const fallbackDocs = documents
    .filter((doc) => doc.project === projectName && !knownDocIds.has(doc.id))
    .sort((a, b) => new Date(b.archivedAt ?? b.createdAt).getTime() - new Date(a.archivedAt ?? a.createdAt).getTime())
    .map((doc) => ({
      id: `fallback-doc:${doc.id}`,
      title: normalizeTitle(doc.title),
      nodeType: 'document',
      documentId: doc.id,
      draftId: null,
      children: [],
    }))
  const projectDrafts = drafts
    .filter((draft) => draft.project === projectName && draft.status !== 'published')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((draft) => ({
      id: `draft:${draft.id}`,
      title: normalizeTitle(draft.title),
      nodeType: 'draft',
      documentId: null,
      draftId: draft.id,
      children: [],
    }))
  return { ...root, children: [...root.children, ...projectDrafts, ...fallbackDocs] }
}

function collectDocumentIds(node: DomainTreeNode, result: Set<number>) {
  if (node.documentId != null) result.add(node.documentId)
  node.children.forEach((child) => collectDocumentIds(child, result))
}

function flattenTree(root: DomainTreeNode, expanded: Set<string>): Array<{ node: DomainTreeNode; depth: number }> {
  const result: Array<{ node: DomainTreeNode; depth: number }> = [{ node: root, depth: 0 }]
  const visit = (node: DomainTreeNode, depth: number) => {
    if (!expanded.has(node.id)) return
    node.children.forEach((child) => {
      result.push({ node: child, depth })
      visit(child, depth + 1)
    })
  }
  visit(root, 1)
  return result
}

function normalizeTitle(value?: string | null): string {
  const title = value?.trim()
  return title || 'Untitled'
}

function formatTime(value: Date | string | number): string {
  const date = new Date(value)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} 小时前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `${diffDay} 天前`
  return date.toLocaleDateString('zh-CN')
}

function excerpt(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return '暂无摘要'
  return normalized.length > 180 ? `${normalized.slice(0, 180)}...` : normalized
}

function resolveMindNodeLabel(nodes: StoredMindNode[], nodeId: string): string {
  return nodes.find((node) => node.id === nodeId)?.label ?? nodeId
}
