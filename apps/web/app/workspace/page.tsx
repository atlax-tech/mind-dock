'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Sparkles, Loader2, MoreHorizontal, LayoutList, FileCode2, Pencil, FolderOutput, Download, Trash2, Check, Package, Archive, FileText, LayoutGrid, List, Columns, Search, Folder, Plus, PenTool, Circle, RotateCcw, Lightbulb, ChevronRight, X, EyeOff, Network } from 'lucide-react'

import { getCurrentUser, registerUser, logoutUser, type LocalUser } from '@/lib/auth'
import GoldenTopNav from './_components/GoldenTopNav'
import {
  addTagToItem,
  archiveItem,
  createDockItem,
  deleteEditorDraft,
  generateRecommendationsForContext,
  getOrCreateTag,
  listDockItems,
  listMindNodes,
  listMindEdges,
  listRecommendationDockQueue,
  loadAllEditorDrafts,
  markRecommendationDockQueueItemShown,
  openWorkspaceTab,
  closeWorkspaceTab,
  activateWorkspaceTab,
  pinWorkspaceTab,
  restoreWorkspaceTabs,
  recordRecentDocumentOpen,
  recordRecommendationDockQueueItemFeedback,
  reopenItem,
  suggestItem,
  updateDockItemText,
  upsertMindNode,
  upsertMindEdge,
  applyRecommendation,
  type DockItem,
  type StoredMindNode,
  type StoredMindEdge,
  type StoredWorkspaceOpenTab,
  type RecommendationDockQueueItem,
} from '@/lib/repository'
import { buildSimpleMindGraphSnapshot } from './features/mind/mindSnapshotBuilder'
import type { MindGraphSnapshot } from './features/mind/types'
import {
  describeRecommendationAction,
  describeRecommendationReason,
  describeApplyPreview,
  describeApplyResult,
  formatConfidenceLevel,
  isSupportedCandidateType,
  isRecommendationResolved,
  CANDIDATE_TYPE_LABELS,
  STATUS_LABELS as REC_STATUS_LABELS,
} from '@/lib/recommendation-i18n'
import type { EntryStatus } from '@/lib/types'
import { recordEvent } from '@/lib/events'
import type { HomeViewHandle } from './features/home/HomeView'

import WorkspaceTabs, { type Tab } from './features/shared/WorkspaceTabs'
import HomeView from './features/home/HomeView'
import EditorTabView from './features/editor/EditorTabView'
import { useAutosave } from './features/editor/useAutosave'
import MindCanvasStage from './features/mind/MindCanvasStage'
import { makeWorkspaceTabId } from '@atlax/domain'
import { toDockTreeViewModel, type DockTreeNode } from './features/dock/dockTreeAdapter'
import GlobalSidebar from './_components/GlobalSidebar'
import FloatingChatPanel from './_components/FloatingChatPanel'
import QuickNote from './_components/QuickNote'

type ActiveModule = 'home' | 'mind' | 'dock' | 'editor'

const PERSISTED_TAB_TYPES = new Set(['home', 'mind', 'dock', 'editor'])

function fromPersistedTab(p: StoredWorkspaceOpenTab): Tab | null {
  if (!PERSISTED_TAB_TYPES.has(p.tabType)) return null
  if (p.documentId != null && p.documentId < 0) return null
  const tabType = p.tabType as Tab['type']
  const frontendId = tabType === 'editor' && p.documentId != null
    ? `tab-editor-${p.documentId}`
    : `tab-${tabType}`
  return {
    id: frontendId,
    type: tabType,
    title: p.title,
    documentId: p.documentId ?? undefined,
    isPinned: p.isPinned,
  }
}

const STATUS_LABELS: Record<EntryStatus, { label: string; color: string; bg: string }> = {
  pending: { label: '待处理', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/20' },
  suggested: { label: '已建议', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20' },
  archived: { label: '已归档', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20' },
  ignored: { label: '已忽略', color: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-500/10 border-gray-500/20' },
  reopened: { label: '重新整理', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20' },
}

export default function WorkspacePage() {
  const [user, setUser] = useState<LocalUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [activeModule, setActiveModule] = useState<ActiveModule>('home')

  const [items, setItems] = useState<DockItem[]>([])
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tabs, setTabs] = useState<Tab[]>([
    { id: 'tab-home', type: 'home', title: 'Home', isPinned: true },
  ])
  const [activeTabId, setActiveTabId] = useState<string>('tab-home')
  const [tabsRestored, setTabsRestored] = useState(false)

  const [editorContent, setEditorContent] = useState('')
  const [editorTitle, setEditorTitle] = useState('')
  const [editingItemId, setEditingItemId] = useState<number | null>(null)

  const [editorMode, setEditorMode] = useState<'classic' | 'block'>('block')
  const [editorNavExpanded, setEditorNavExpanded] = useState(false)

  const draftCounterRef = React.useRef(0)
  const [drafts, setDrafts] = useState<Record<number, { title: string; content: string }>>({})
  const [draftsRestored, setDraftsRestored] = useState(false)

  const flushSaveRef = useRef<() => Promise<void>>(() => Promise.resolve())

  const homeViewRef = useRef<HomeViewHandle>(null)
  const [recRefreshKey, setRecRefreshKey] = useState(0)

  const [registerName, setRegisterName] = useState('')

  const [mindNodes, setMindNodes] = useState<StoredMindNode[]>([])
  const [mindEdges, setMindEdges] = useState<StoredMindEdge[]>([])
  const [mindSnapshot, setMindSnapshot] = useState<MindGraphSnapshot | null>(null)
  const [mindRefreshKey, setMindRefreshKey] = useState(0)

  const [sharedProjectFilter, setSharedProjectFilter] = useState<string | null>(null)
  const [sharedTagFilter, setSharedTagFilter] = useState<string | null>(null)
  const [sharedDockSearch, setSharedDockSearch] = useState('')
  const [mockFolderNodes, setMockFolderNodes] = useState<DockTreeNode[]>([])
  const mockFolderIdCounter = useRef(-1000)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [suggestingId, setSuggestingId] = useState<number | null>(null)
  const [itemRecommendations, setItemRecommendations] = useState<RecommendationDockQueueItem[]>([])
  const [recommendationsLoading, setRecommendationsLoading] = useState(false)
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null)
  const [applyLoading, setApplyLoading] = useState<string | null>(null)
  const shownMarkedRef = useRef<Set<string>>(new Set())

  const workspaceMapping = useMemo(() => {
    const labelToDockItem = new Map<string, DockItem>()
    const dockIdToLabel = new Map<number, string>()
    const labelToMindNode = new Map<string, StoredMindNode>()
    const dockIdToMindNode = new Map<number, StoredMindNode>()
    const mindNodeToDockId = new Map<string, number>()

    items.forEach(item => {
      const label = (item.topic || item.rawText.slice(0, 50)).trim().toLowerCase()
      labelToDockItem.set(label, item)
      dockIdToLabel.set(item.id, label)
    })

    mindNodes.forEach(node => {
      const label = node.label.trim().toLowerCase()
      labelToMindNode.set(label, node)
      if (node.documentId != null) {
        dockIdToMindNode.set(node.documentId, node)
        mindNodeToDockId.set(node.id, node.documentId)
      }
    })

    const findDockItemByMindNode = (nodeId: string): DockItem | null => {
      const node = mindNodes.find(n => n.id === nodeId)
      if (!node) return null
      if (node.documentId != null) {
        const item = items.find(i => i.id === node.documentId)
        if (item) return item
      }
      const label = node.label.trim().toLowerCase()
      const match = labelToDockItem.get(label)
      return match || null
    }

    const findMindNodeByDockItem = (dockItemId: number): StoredMindNode | null => {
      const direct = dockIdToMindNode.get(dockItemId)
      if (direct) return direct
      const label = dockIdToLabel.get(dockItemId)
      if (label) return labelToMindNode.get(label) || null
      return null
    }

    const getGraphChainForDockItem = (dockItemId: number): string[] => {
      const node = findMindNodeByDockItem(dockItemId)
      if (!node) return ['World Tree']
      const chain: string[] = [node.label]
      let currentId: string | null = node.id
      const visited = new Set<string>()
      while (currentId) {
        if (visited.has(currentId)) break
        visited.add(currentId)
        const parentEdge = mindEdges.find(e => e.targetNodeId === currentId && e.edgeType === 'parent_child')
        if (!parentEdge) break
        const parentNode = mindNodes.find(n => n.id === parentEdge.sourceNodeId)
        if (!parentNode) break
        chain.unshift(parentNode.label)
        currentId = parentNode.id
      }
      if (chain[0] !== 'World Tree') chain.unshift('World Tree')
      return chain
    }

    const findDockItemByLabel = (label: string): DockItem | null => {
      return labelToDockItem.get(label.trim().toLowerCase()) || null
    }

    return { findDockItemByMindNode, findMindNodeByDockItem, getGraphChainForDockItem, findDockItemByLabel, mindNodeToDockId }
  }, [items, mindNodes, mindEdges])

  const [toastMessage, setToastMessage] = useState('')
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastMessage(''), 2500)
  }, [])

  const userId = user?.id || ''

  useEffect(() => {
    const current = getCurrentUser()
    setUser(current)
    setAuthChecked(true)
  }, [])

  const loadData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const dockItems = await listDockItems(userId)
      setItems(dockItems)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [userId])

  const ensureWorldTreeRoot = useCallback(async () => {
    if (!userId) return
    try {
      const nodes = await listMindNodes(userId)
      const hasRoot = nodes.some(n => n.nodeType === 'root')
      if (!hasRoot) {
        await upsertMindNode({ userId, nodeType: 'root', label: 'World Tree', state: 'active' })
      }
    } catch (err) {
      console.error('[MindData] Failed to ensure World Tree root:', err)
    }
  }, [userId])

  const loadMindData = useCallback(async () => {
    if (!userId) return
    try {
      await ensureWorldTreeRoot()
      const [nodes, edges] = await Promise.all([
        listMindNodes(userId),
        listMindEdges(userId),
      ])
      setMindNodes(nodes)
      setMindEdges(edges)
      const snapshot = buildSimpleMindGraphSnapshot(nodes, edges)
      setMindSnapshot(snapshot)
    } catch (err) {
      console.error('[MindData] Failed to load mind data:', err)
    }
  }, [userId, ensureWorldTreeRoot])

  useEffect(() => {
    if (userId) {
      loadData()
      loadMindData()
    }
  }, [userId, loadData, loadMindData, mindRefreshKey])

  useEffect(() => {
    if (!userId || tabsRestored) return
    let cancelled = false
    restoreWorkspaceTabs(userId)
      .then(persistedTabs => {
        if (cancelled) return
        const restoredTabs = persistedTabs
          .map(fromPersistedTab)
          .filter((t): t is Tab => t !== null)
        if (restoredTabs.length > 0) {
          const hasHomeTab = restoredTabs.some(t => t.type === 'home')
          if (!hasHomeTab) {
            restoredTabs.unshift({ id: 'tab-home', type: 'home', title: 'Home', isPinned: true })
          }
          const activePersisted = persistedTabs.find(t => t.isActive)
          setTabs(restoredTabs)
          if (activePersisted) {
            const frontendTab = fromPersistedTab(activePersisted)
            if (frontendTab) {
              setActiveTabId(frontendTab.id)
              if (frontendTab.type === 'home') setActiveModule('home')
              else if (frontendTab.type === 'mind') setActiveModule('mind')
              else if (frontendTab.type === 'dock') setActiveModule('dock')
              else if (frontendTab.type === 'editor') {
                setActiveModule('editor')
                if (frontendTab.documentId && frontendTab.documentId > 0) {
                  setEditingItemId(frontendTab.documentId)
                }
              }
            } else {
              setActiveTabId(restoredTabs[0].id)
            }
          } else {
            setActiveTabId(restoredTabs[0].id)
          }
        }
        setTabsRestored(true)
      })
      .catch(err => {
        console.error('[WorkspaceTabs] Failed to restore tabs, using defaults:', err)
        setTabsRestored(true)
      })
    return () => { cancelled = true }
  }, [userId, tabsRestored])

  useEffect(() => {
    if (!tabsRestored || items.length === 0) return
    const activeTab = tabs.find(t => t.id === activeTabId)
    if (!activeTab || activeTab.type !== 'editor' || !activeTab.documentId || activeTab.documentId < 0) return
    if (editingItemId === activeTab.documentId) return
    const item = items.find(i => i.id === activeTab.documentId)
    if (item) {
      setEditingItemId(item.id)
      setEditorTitle(item.topic || item.rawText.slice(0, 50))
      setEditorContent(item.rawText)
    }
  }, [tabsRestored, items, tabs, activeTabId, editingItemId])

  useEffect(() => {
    if (!userId || draftsRestored) return
    let cancelled = false
    loadAllEditorDrafts(userId)
      .then(persistedDrafts => {
        if (cancelled) return
        if (persistedDrafts.length === 0) {
          setDraftsRestored(true)
          return
        }
        const restoredDrafts: Record<number, { title: string; content: string }> = {}
        const newTabs: Tab[] = []
        let minDraftKey = -1
        persistedDrafts.forEach(d => {
          restoredDrafts[d.draftKey] = { title: d.title, content: d.content }
          if (d.draftKey < minDraftKey) minDraftKey = d.draftKey
          const tabId = `tab-editor-draft-${d.draftKey}`
          newTabs.push({
            id: tabId,
            type: 'editor',
            title: d.title || 'Untitled',
            documentId: d.draftKey,
            isPinned: false,
          })
        })
        draftCounterRef.current = minDraftKey - 1
        setDrafts(prev => ({ ...prev, ...restoredDrafts }))
        setTabs(prev => {
          const existingDraftTabIds = new Set(
            prev.filter(t => t.documentId != null && t.documentId < 0).map(t => t.id)
          )
          const tabsToAdd = newTabs.filter(t => !existingDraftTabIds.has(t.id))
          return [...prev, ...tabsToAdd]
        })
        setDraftsRestored(true)
      })
      .catch(err => {
        console.error('[EditorDrafts] Failed to restore drafts:', err)
        setDraftsRestored(true)
      })
    return () => { cancelled = true }
  }, [userId, draftsRestored])

  const refreshAll = useCallback(() => {
    loadData()
    setMindRefreshKey((k) => k + 1)
  }, [loadData])

  const handleLogout = useCallback(() => {
    logoutUser()
    setUser(null)
  }, [])

  const createSourceNodeWithRoot = useCallback(async (label: string, dockItemId: number) => {
    if (!userId) return
    await ensureWorldTreeRoot()
    const sourceNode = await upsertMindNode({
      userId,
      nodeType: 'source',
      label: label.slice(0, 80),
      documentId: dockItemId,
      state: 'active',
    })
    const allNodes = await listMindNodes(userId)
    const rootNode = allNodes.find(n => n.nodeType === 'root')
    if (rootNode) {
      await upsertMindEdge({ userId, sourceNodeId: rootNode.id, targetNodeId: sourceNode.id, edgeType: 'parent_child', strength: 0.5, source: 'system' })
    }
  }, [userId, ensureWorldTreeRoot])

  const handleCapture = useCallback(async (text: string) => {
    if (!text.trim() || !userId) return
    try {
      const newId = await createDockItem(userId, text.trim())
      await createSourceNodeWithRoot(text.trim(), newId)
      refreshAll()
      showToast(`已捕获到 Dock (#${newId})`)
      recordEvent(userId, { type: 'capture_created', sourceType: 'text', dockItemId: newId })
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败')
    }
  }, [userId, refreshAll, createSourceNodeWithRoot, showToast])

  const handleQuickNoteSave = useCallback(async (text: string, title: string) => {
    if (!text.trim() || !userId) return
    try {
      const newId = await createDockItem(userId, text.trim(), 'text', { topic: title })
      await createSourceNodeWithRoot(text.trim(), newId)
      refreshAll()
      showToast(`Quick Note 已保存到 Dock (#${newId})`)
      recordEvent(userId, { type: 'capture_created', sourceType: 'text', dockItemId: newId })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Quick Note 保存失败')
    }
  }, [userId, refreshAll, createSourceNodeWithRoot, showToast])

  const loadItemRecommendations = useCallback(async (itemId: number) => {
    if (!userId) return
    setRecommendationsLoading(true)
    setRecommendationsError(null)
    try {
      const result = await listRecommendationDockQueue(userId, {
        subjectType: 'dockItem',
        subjectId: itemId,
        sortBy: 'createdAt',
        sortDirection: 'desc',
      })
      setItemRecommendations(result.items)
      const unmarked = result.items.filter(
        (item) => item.status === 'generated' && !item.isShown && !shownMarkedRef.current.has(item.id),
      )
      for (const item of unmarked) {
        try {
          await markRecommendationDockQueueItemShown({ userId, recommendationId: item.id })
          shownMarkedRef.current.add(item.id)
        } catch { /* non-critical */ }
      }
    } catch (e) {
      setRecommendationsError(e instanceof Error ? e.message : '加载推荐失败')
    } finally {
      setRecommendationsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (selectedItemId !== null) {
      shownMarkedRef.current.clear()
      loadItemRecommendations(selectedItemId)
    } else {
      setItemRecommendations([])
      setRecommendationsError(null)
    }
  }, [selectedItemId, loadItemRecommendations])

  const handleApplyRecommendation = useCallback(async (recommendationId: string): Promise<string | void> => {
    if (!userId) return
    setApplyLoading(recommendationId)
    try {
      const result = await applyRecommendation({ userId, recommendationId })
      refreshAll()
      setRecRefreshKey(k => k + 1)
      if (selectedItemId !== null) {
        await loadItemRecommendations(selectedItemId)
      }
      if (result.appliedChanges) {
        return describeApplyResult(result.appliedChanges.candidateType, result.appliedChanges.candidateId, result.appliedChanges.changeDetail)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '应用推荐失败')
      throw e
    } finally {
      setApplyLoading(null)
    }
  }, [userId, refreshAll, selectedItemId, loadItemRecommendations])

  const handleFeedbackRecommendation = useCallback(async (recommendationId: string, feedbackType: 'accepted' | 'rejected' | 'ignored') => {
    if (!userId) return
    try {
      await recordRecommendationDockQueueItemFeedback({
        userId,
        recommendationId,
        feedbackType,
      })
      if (selectedItemId !== null) {
        await loadItemRecommendations(selectedItemId)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '反馈操作失败')
    }
  }, [userId, selectedItemId, loadItemRecommendations])

  const handleSuggest = useCallback(async (itemId: number) => {
    if (!userId) return
    setSuggestingId(itemId)
    try {
      await suggestItem(userId, itemId)
      refreshAll()
      await generateRecommendationsForContext({
        userId,
        subjectType: 'dockItem',
        subjectId: itemId,
      })
      await loadItemRecommendations(itemId)
      setRecRefreshKey(k => k + 1)
    } catch (e) {
      setRecommendationsError(e instanceof Error ? e.message : '建议生成失败')
      setItemRecommendations([])
    } finally {
      setSuggestingId(null)
    }
  }, [userId, refreshAll, loadItemRecommendations])

  const handleArchive = useCallback(async (itemId: number) => {
    if (!userId) return
    try {
      await archiveItem(userId, itemId)
      refreshAll()
      setSelectedItemId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '归档失败')
    }
  }, [userId, refreshAll])

  const handleDeleteRequest = useCallback(() => {
    if (editingItemId == null || editingItemId < 0) {
      showToast('Draft cannot be deleted from here')
      return
    }
    setShowDeleteConfirm(true)
  }, [editingItemId, showToast])

  const handleReopen = useCallback(async (itemId: number) => {
    if (!userId) return
    try {
      await reopenItem(userId, itemId)
      refreshAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : '重新打开失败')
    }
  }, [userId, refreshAll])

  const handleAddTag = useCallback(async (itemId: number, tagName: string) => {
    if (!userId) throw new Error('未登录，无法添加标签')
    const trimmed = tagName.trim()
    if (!trimmed) throw new Error('标签名不能为空')
    try {
      const updated = await addTagToItem(userId, itemId, trimmed)
      if (!updated) throw new Error(`添加标签失败：Dock item #${itemId} 不存在`)
      await getOrCreateTag(userId, trimmed)
      refreshAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加标签失败')
      throw e
    }
  }, [userId, refreshAll])

  const openEditorTab = useCallback((itemId: number) => {
    const item = items.find(i => i.id === itemId)
    if (!item) {
      showToast(`Dock item #${itemId} not found`)
      console.error(`[Workspace] Cannot open Editor: Dock item #${itemId} not found`)
      return
    }
    const tabId = `tab-editor-${itemId}`
    const existing = tabs.find(t => t.id === tabId)
    if (existing) {
      setActiveTabId(tabId)
      if (userId) {
        activateWorkspaceTab(userId, makeWorkspaceTabId(userId, 'editor', itemId)).catch(err =>
          console.error('[WorkspaceTabs] Failed to persist activate tab:', err)
        )
      }
    } else {
      const newTab: Tab = {
        id: tabId,
        type: 'editor',
        title: item.topic || item.rawText.slice(0, 30),
        documentId: itemId,
        isPinned: false,
      }
      setTabs(prev => [...prev, newTab])
      setActiveTabId(tabId)
      if (userId) {
        openWorkspaceTab({
          userId,
          tabType: 'editor',
          title: item.topic || item.rawText.slice(0, 30),
          path: `/workspace/editor/${itemId}`,
          documentId: itemId,
        }).catch(err =>
          console.error('[WorkspaceTabs] Failed to persist open tab:', err)
        )
        recordRecentDocumentOpen({
          userId,
          documentId: itemId,
          title: item.topic || item.rawText.slice(0, 30),
        }).catch(err =>
          console.error('[WorkspaceTabs] Failed to record recent document:', err)
        )
      }
    }
    setEditingItemId(itemId)
    setEditorTitle(item.topic || item.rawText.slice(0, 50))
    setEditorContent(item.rawText)
    setActiveModule('editor')
  }, [items, tabs, userId, showToast])

  const createDraftTab = useCallback(() => {
    draftCounterRef.current -= 1
    const draftId = draftCounterRef.current
    const tabId = `tab-editor-draft-${draftId}`
    const newTab: Tab = {
      id: tabId,
      type: 'editor',
      title: 'Untitled',
      documentId: draftId,
      isPinned: false,
    }
    setDrafts(prev => ({ ...prev, [draftId]: { title: '', content: '' } }))
    setTabs(prev => [...prev, newTab])
    setActiveTabId(tabId)
    setEditingItemId(draftId)
    setEditorTitle('')
    setEditorContent('')
    setActiveModule('editor')
  }, [])

  const handleNewNote = useCallback(() => {
    createDraftTab()
  }, [createDraftTab])

  const handleSaveEditor = useCallback(async () => {
    if (!userId) return
    const isDraft = editingItemId !== null && editingItemId < 0
    if (isDraft) {
      const draft = drafts[editingItemId]
      const title = (draft?.title ?? '').trim() || (draft?.content ?? '').trim().slice(0, 50) || 'Untitled'
      const content = (draft?.content ?? '').trim()
      if (!title && !content) {
        setError('标题和正文都为空，无法保存')
        return
      }
      try {
        const newId = await createDockItem(userId, content || title)
        await createSourceNodeWithRoot(title, newId)
        refreshAll()
        const oldTabId = `tab-editor-draft-${editingItemId}`
        const newTabId = `tab-editor-${newId}`
        setTabs(prev => prev.map(t => t.id === oldTabId ? { ...t, id: newTabId, documentId: newId, title: title.slice(0, 30) } : t))
        setActiveTabId(newTabId)
        setEditingItemId(newId)
        setEditorTitle(title)
        setEditorContent(content)
        setDrafts(prev => {
          const next = { ...prev }
          delete next[editingItemId]
          return next
        })
        deleteEditorDraft(userId, editingItemId).catch(err =>
          console.error('[Autosave] Failed to delete saved draft from IndexedDB:', err)
        )
        openWorkspaceTab({
          userId,
          tabType: 'editor',
          title: title.slice(0, 30),
          path: `/workspace/editor/${newId}`,
          documentId: newId,
        }).catch(err =>
          console.error('[WorkspaceTabs] Failed to persist saved draft tab:', err)
        )
        recordRecentDocumentOpen({
          userId,
          documentId: newId,
          title: title.slice(0, 30),
        }).catch(err =>
          console.error('[WorkspaceTabs] Failed to record recent document:', err)
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : '保存失败')
      }
    } else if (editingItemId && editingItemId > 0) {
      try {
        const originalItem = items.find(i => i.id === editingItemId)
        const topic = originalItem?.topic ? (editorTitle.trim() || undefined) : undefined
        await updateDockItemText(userId, editingItemId, editorContent, topic)
        refreshAll()
      } catch (e) {
        setError(e instanceof Error ? e.message : '保存失败')
      }
    }
  }, [editingItemId, userId, drafts, editorContent, editorTitle, items, refreshAll, createSourceNodeWithRoot])

  const handleActivateTab = useCallback((tabId: string) => {
    if (activeTabId !== tabId && activeTabId.startsWith('tab-editor-') && editingItemId != null) {
      flushSaveRef.current()
    }
    setActiveTabId(tabId)
    const tab = tabs.find(t => t.id === tabId)
    if (tab) {
      if (userId && !(tab.documentId != null && tab.documentId < 0)) {
        activateWorkspaceTab(userId, makeWorkspaceTabId(userId, tab.type, tab.documentId)).catch(err =>
          console.error('[WorkspaceTabs] Failed to persist activate tab:', err)
        )
      }
      if (tab.type === 'home') setActiveModule('home')
      else if (tab.type === 'mind') setActiveModule('mind')
      else if (tab.type === 'dock') setActiveModule('dock')
      else if (tab.type === 'editor' && tab.documentId) {
        setActiveModule('editor')
        const isDraft = tab.documentId < 0
        if (isDraft) {
          setEditingItemId(tab.documentId)
          const draft = drafts[tab.documentId]
          setEditorTitle(draft?.title ?? '')
          setEditorContent(draft?.content ?? '')
        } else {
          const item = items.find(i => i.id === tab.documentId)
          if (item) {
            setEditingItemId(tab.documentId)
            setEditorTitle(item.topic || item.rawText.slice(0, 50))
            setEditorContent(item.rawText)
          }
        }
      }
    }
  }, [tabs, items, drafts, userId, activeTabId, editingItemId])

  const handleCloseTab = useCallback((tabId: string) => {
    if (tabId === activeTabId && activeTabId.startsWith('tab-editor-') && editingItemId != null) {
      flushSaveRef.current()
    }
    const closingTab = tabs.find(t => t.id === tabId)
    const isDraft = closingTab?.documentId != null && closingTab.documentId < 0
    if (userId && closingTab && !isDraft) {
      closeWorkspaceTab(userId, makeWorkspaceTabId(userId, closingTab.type, closingTab.documentId)).catch(err =>
        console.error('[WorkspaceTabs] Failed to persist close tab:', err)
      )
    }
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId)
      const next = prev.filter(t => t.id !== tabId)
      const closingDocId = closingTab?.documentId
      if (closingDocId && closingDocId < 0) {
        setDrafts(draftsPrev => {
          const d = { ...draftsPrev }
          delete d[closingDocId]
          return d
        })
        if (userId) {
          deleteEditorDraft(userId, closingDocId).catch(err =>
            console.error('[Autosave] Failed to delete closed draft from IndexedDB:', err)
          )
        }
      }
      if (activeTabId === tabId) {
        const newActive = next[Math.min(idx, next.length - 1)]?.id || 'tab-home'
        setActiveTabId(newActive)
        const newTab = next.find(t => t.id === newActive)
        if (newTab?.type === 'home') {
          setActiveModule('home')
          setEditingItemId(null)
        } else if (newTab?.type === 'mind') {
          setActiveModule('mind')
          setEditingItemId(null)
        } else if (newTab?.type === 'dock') {
          setActiveModule('dock')
          setEditingItemId(null)
        } else if (newTab?.type === 'editor') {
          setActiveModule('editor')
          const docId = newTab.documentId ?? null
          setEditingItemId(docId)
          if (docId && docId > 0) {
            const item = items.find(i => i.id === docId)
            if (item) {
              setEditorTitle(item.topic || item.rawText.slice(0, 50))
              setEditorContent(item.rawText)
            }
          } else if (docId && docId < 0) {
            const draft = drafts[docId]
            setEditorTitle(draft?.title ?? '')
            setEditorContent(draft?.content ?? '')
          }
        } else {
          setActiveModule('home')
          setEditingItemId(null)
        }
      } else {
        // 关闭非 active tab，editingItemId 保持不变
      }
      return next
    })
  }, [activeTabId, editingItemId, items, drafts, tabs, userId])

  const handleDeleteConfirm = useCallback(async () => {
    setShowDeleteConfirm(false)
    if (!userId || editingItemId == null || editingItemId < 0) return
    const itemIdToDelete = editingItemId
    setEditingItemId(null)
    try {
      const result = await archiveItem(userId, itemIdToDelete)
      if (!result) {
        setEditingItemId(itemIdToDelete)
        showToast('Delete failed: item not found or cannot be deleted')
        return
      }
      refreshAll()
      const tabId = `tab-editor-${itemIdToDelete}`
      handleCloseTab(tabId)
      showToast('Item deleted')
    } catch (e) {
      setEditingItemId(itemIdToDelete)
      setError(e instanceof Error ? e.message : '删除失败')
      showToast('Delete failed')
    }
  }, [userId, editingItemId, refreshAll, handleCloseTab, showToast])

  const handleNewTab = useCallback(() => {
    handleNewNote()
  }, [handleNewNote])

  const handlePinTab = useCallback((tabId: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, isPinned: !t.isPinned } : t))
    const tab = tabs.find(t => t.id === tabId)
    if (userId && tab && !(tab.documentId != null && tab.documentId < 0)) {
      pinWorkspaceTab(userId, makeWorkspaceTabId(userId, tab.type, tab.documentId)).catch(err =>
        console.error('[WorkspaceTabs] Failed to persist pin tab:', err)
      )
    }
  }, [tabs, userId])

  const handleModuleChange = useCallback((mod: ActiveModule) => {
    if (activeModule === 'editor' && editingItemId != null) {
      flushSaveRef.current()
    }
    setActiveModule(mod)
    if (mod !== 'editor') {
      setEditorNavExpanded(false)
    }
    if (mod === 'editor') {
      const editorTabs = tabs.filter(t => t.type === 'editor')
      if (editorTabs.length > 0) {
        const currentActive = tabs.find(t => t.id === activeTabId)
        let targetId = editorTabs[0].id
        if (currentActive && currentActive.type === 'editor') {
          targetId = currentActive.id
        } else {
          targetId = editorTabs[editorTabs.length - 1].id
        }
        handleActivateTab(targetId)
      } else {
        handleNewNote()
      }
      return
    }

    const tabId = `tab-${mod}`
    const existing = tabs.find(t => t.id === tabId)
    if (existing) {
      setActiveTabId(tabId)
      if (userId) {
        activateWorkspaceTab(userId, makeWorkspaceTabId(userId, mod)).catch(err =>
          console.error('[WorkspaceTabs] Failed to persist activate tab:', err)
        )
      }
    } else {
      const newTab: Tab = { id: tabId, type: mod, title: mod.charAt(0).toUpperCase() + mod.slice(1), isPinned: false }
      setTabs(prev => [...prev, newTab])
      setActiveTabId(tabId)
      if (userId) {
        openWorkspaceTab({
          userId,
          tabType: mod,
          title: mod.charAt(0).toUpperCase() + mod.slice(1),
          path: `/workspace/${mod}`,
        }).catch(err =>
          console.error('[WorkspaceTabs] Failed to persist open tab:', err)
        )
      }
    }
    setEditingItemId(null)
  }, [tabs, activeTabId, activeModule, editingItemId, handleActivateTab, handleNewNote, userId])

  const handleFocusCaptureInput = useCallback(() => {
    handleModuleChange('home')
    requestAnimationFrame(() => {
      homeViewRef.current?.focusCaptureInput()
    })
  }, [handleModuleChange])

  const handleSetEditorMode = useCallback((mode: 'classic' | 'block') => {
    setEditorMode(mode)
  }, [])

  const sidebarDocuments = useMemo(() => {
    return items.slice(0, 20).map(item => ({
      label: item.topic || item.rawText.slice(0, 50),
      dockItemId: item.id,
    }))
  }, [items])

  const sidebarData = useMemo(() => {
    const projectMap = new Map<string, string[]>()
    items.forEach(item => {
      const project = item.selectedProject || 'Dock'
      const existing = projectMap.get(project)
      if (existing) {
        existing.push(item.topic || item.rawText.slice(0, 50))
      } else {
        projectMap.set(project, [item.topic || item.rawText.slice(0, 50)])
      }
    })
    const projects = Array.from(projectMap.entries()).slice(0, 5).map(([name, documents]) => ({
      name,
      documents: documents.slice(0, 5),
    }))
    const allTags = new Set<string>()
    items.forEach(item => item.userTags?.forEach(tag => allTags.add(tag)))
    return {
      projects,
      tags: Array.from(allTags).slice(0, 10),
    }
  }, [items])

  const searchSuggestions = useMemo(() => {
    const suggestions: { id: string; label: string; icon: typeof FileText; tone: 'document' | 'accent' | 'muted'; section?: string }[] = []
    items.slice(0, 5).forEach(item => {
      suggestions.push({
        id: `doc-${item.id}`,
        label: item.topic || item.rawText.slice(0, 40),
        icon: FileText,
        tone: 'document' as const,
        section: suggestions.length === 0 ? 'RECENT DOCUMENTS' : undefined,
      })
    })
    if (mindNodes.length > 0) {
      mindNodes.slice(0, 3).forEach(node => {
        suggestions.push({
          id: `mind-${node.id}`,
          label: node.label,
          icon: Network,
          tone: 'accent' as const,
          section: suggestions.filter(s => s.section).length === 1 ? 'KNOWLEDGE GRAPH' : undefined,
        })
      })
    }
    return suggestions
  }, [items, mindNodes])

  const handleSwitchToMind = useCallback(() => {
    handleModuleChange('mind')
  }, [handleModuleChange])

  const _isEditorActive = activeTabId.startsWith('tab-editor-') && editingItemId != null
  const _activeEditorTab = tabs.find(t => t.id === activeTabId)
  const _isActiveDraft = _activeEditorTab?.documentId != null && _activeEditorTab.documentId < 0

  const { saveStatus, flushSave } = useAutosave({
    userId,
    editingItemId,
    editorTitle,
    editorContent,
    isDraft: _isActiveDraft,
    enabled: _isEditorActive && draftsRestored,
  })
  flushSaveRef.current = flushSave

  useEffect(() => {
    const handleBeforeUnload = () => {
      flushSaveRef.current()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushSaveRef.current()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (!selectedItemId) return
    const h = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-detail-panel]') || target.closest('[data-ignore-click-outside]')) return
      setSelectedItemId(null)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [selectedItemId, setSelectedItemId])

  if (!authChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#030508]">
        <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-emerald-500 animate-spin" />
      </div>
    )
  }

  if (!user) {
    const handleRegister = () => {
      if (!registerName.trim()) return
      const newUser = registerUser(registerName.trim())
      setUser(newUser)
    }
    return (
      <div className="dark">
      <div className="flex h-screen w-full bg-[#111111] text-slate-200 font-sans items-center justify-center">
          <div className="absolute inset-0">
            <div className="absolute top-[20%] left-[15%] w-[300px] h-[300px] bg-indigo-500/[0.04] rounded-full blur-[100px]" />
            <div className="absolute bottom-[20%] right-[20%] w-[400px] h-[400px] bg-cyan-500/[0.03] rounded-full blur-[120px]" />
          </div>
          <div className="relative z-10 w-full max-w-sm px-6">
            <div className="bg-[#0A0D14]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8">
              <div className="flex items-center space-x-3 mb-8">
                <div className="relative w-8 h-8 flex items-center justify-center">
                  <div className="absolute inset-0 bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-400 rounded-[10px] opacity-90" />
                  <div className="w-2 h-2 bg-white rounded-full z-10" />
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] font-bold tracking-[0.3em] text-slate-400 uppercase">ATLAX</span>
                  <div className="h-3 w-px bg-white/10" />
                  <span className="text-[11px] tracking-wide text-slate-500 font-mono">MindDock</span>
                </div>
              </div>
              <h2 className="text-lg font-medium text-white mb-2">Welcome</h2>
              <p className="text-sm text-slate-500 mb-6">输入你的名字开始使用</p>
              <input
                type="text"
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleRegister() }}
                placeholder="你的名字"
                className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-sm text-white outline-none focus:border-emerald-500/30 placeholder-slate-600 mb-4"
                autoFocus
              />
              <button
                onClick={handleRegister}
                disabled={!registerName.trim()}
                className="w-full py-3 bg-emerald-500/20 text-emerald-400 rounded-xl text-sm font-medium hover:bg-emerald-500/30 transition-colors disabled:opacity-30"
              >
                进入工作区
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const selectedItem = items.find(i => i.id === selectedItemId) ?? null
  const isEditorActive = activeTabId.startsWith('tab-editor-') && editingItemId != null
  const nodeCount = mindNodes.length

  const activeEditorTab = tabs.find(t => t.id === activeTabId)
  const isActiveDraft = activeEditorTab?.documentId != null && activeEditorTab.documentId < 0

  return (
    <div className="dark">
      <div className="relative flex h-screen w-full flex-col overflow-hidden bg-[var(--bg-base)] font-sans text-[var(--text-main)] selection:bg-[var(--accent)] selection:text-white">
        <div className="ambient-glow" />

        <div id="canvas-container" className={`canvas-container ${activeModule === 'editor' ? 'canvas-dimmed' : 'canvas-nebula'}`}>
          <NebulaBackground activeModule={activeModule} mindNodes={mindNodes} mindEdges={mindEdges} />
        </div>

        <GoldenTopNav
          activeModule={activeModule}
          onModuleChange={handleModuleChange}
          user={user}
          onLogout={handleLogout}
          isCollapsed={isEditorActive && activeModule === 'editor' && !editorNavExpanded}
          onCollapseRequest={() => setEditorNavExpanded(false)}
          onExpandRequest={() => setEditorNavExpanded(true)}
          onToast={showToast}
          searchSuggestions={searchSuggestions}
          onSearchAction={(label: string) => {
            const match = workspaceMapping.findDockItemByLabel(label)
            if (match) {
              openEditorTab(match.id)
            } else if (label.toLowerCase().includes('graph') || label.toLowerCase().includes('world tree')) {
              handleModuleChange('mind')
              showToast(`Navigated to Mind view for "${label}"`)
            } else {
              handleModuleChange('dock')
              setSharedDockSearch(label)
              showToast(`Searching Dock for "${label}"`)
            }
          }}
        />

        <GlobalSidebar
          userName={user.name}
          onSwitchToEditor={() => handleModuleChange('editor')}
          onSwitchToDock={() => handleModuleChange('dock')}
          onSwitchToMind={handleSwitchToMind}
          onNewNote={handleNewNote}
          onCapture={handleCapture}
          onToast={showToast}
          documents={sidebarDocuments}
          sidebarData={sidebarData}
          onOpenDocument={(documentRef: number | string) => {
            if (typeof documentRef === 'number') {
              const item = items.find(i => i.id === documentRef)
              if (item) {
                openEditorTab(documentRef)
                return
              }
            }
            const label = typeof documentRef === 'string' ? documentRef : String(documentRef)
            const match = workspaceMapping.findDockItemByLabel(label)
            if (match) {
              openEditorTab(match.id)
            } else {
              showToast(`Document "${label}" not found in Dock`)
            }
          }}
          onSwitchToDockWithSearch={(query: string) => {
            setSharedDockSearch(query)
            setSharedProjectFilter(null)
            setSharedTagFilter(null)
            handleModuleChange('dock')
            showToast(`Search in Dock: "${query}"`)
          }}
          onProjectClick={(project: string) => {
            setSharedProjectFilter(project)
            setSharedTagFilter(null)
            showToast(`Filtered by project: ${project}`)
          }}
          onCreateProjectFolder={() => {
            const newId = mockFolderIdCounter.current--
            const newNode: DockTreeNode = {
              id: newId,
              type: 'project',
              name: `New Project ${Math.abs(newId)}`,
              title: `New Project ${Math.abs(newId)}`,
              children: [],
              parentId: null,
              depth: 0,
              documentId: null,
              contentType: 'mock',
              tags: [],
              preview: '',
              metadata: { mock: true },
            }
            setMockFolderNodes(prev => [...prev, newNode])
            showToast(`Created local project "New Project ${Math.abs(newId)}" (mock, not persisted)`)
          }}
        />

        <FloatingChatPanel
          onToast={showToast}
          activeModule={activeModule}
          userId={userId}
        />

        <QuickNote
          onToast={showToast}
          onSave={handleQuickNoteSave}
        />

        <main id="main-container" className="relative z-10 flex-1 overflow-hidden" style={{ marginLeft: 'var(--sidebar-width, 0px)', width: 'calc(100% - var(--sidebar-width, 0px))', transition: 'margin-left 0.4s cubic-bezier(0.23,1,0.32,1), width 0.4s cubic-bezier(0.23,1,0.32,1)' }}>
          <div id="view-editor" className={`view-section ${activeModule === 'editor' && isEditorActive ? 'active' : ''} flex flex-col`} onPointerDown={() => { if (editorNavExpanded) setEditorNavExpanded(false) }}>
            <div className="w-full h-full flex flex-col overflow-hidden">
              <div className="h-14 bg-[var(--bg-sidebar)] border-b border-[var(--border-line)] flex items-end pl-16 pr-3 pb-0 shrink-0 relative">
                <WorkspaceTabs
                  tabs={tabs.filter(t => t.type === 'editor')}
                  activeTabId={activeTabId}
                  onActivateTab={handleActivateTab}
                  onCloseTab={handleCloseTab}
                  onNewTab={handleNewTab}
                  onPinTab={handlePinTab}
                  onToast={showToast}
                />
                <EditorOptionsMenu
                  mode={editorMode}
                  onSetMode={handleSetEditorMode}
                  onToast={showToast}
                  onDelete={handleDeleteRequest}
                />
              </div>
              <EditorTabView
                editingItemId={editingItemId}
                editorTitle={editorTitle}
                editorContent={editorContent}
                onTitleChange={(title) => {
                  setEditorTitle(title)
                  if (editingItemId != null && editingItemId < 0) {
                    setDrafts(prev => ({ ...prev, [editingItemId]: { ...prev[editingItemId], title } }))
                  }
                }}
                onContentChange={(content) => {
                  setEditorContent(content)
                  if (editingItemId != null && editingItemId < 0) {
                    setDrafts(prev => ({ ...prev, [editingItemId]: { ...prev[editingItemId], content } }))
                  }
                }}
                onSave={handleSaveEditor}
                mode={editorMode}
                isDraft={isActiveDraft}
                saveStatus={saveStatus}
                onToast={showToast}
              />
            </div>
          </div>

          <div id="view-home" className={`view-section ${activeModule === 'home' ? 'active' : ''} overflow-y-auto no-scrollbar pt-20 pb-4 px-6`}>
            <div className="w-full max-w-5xl mx-auto">
              <HomeView
                ref={homeViewRef}
                userId={userId}
                userName={user.name}
                onOpenEditor={openEditorTab}
                onNewNote={handleNewNote}
                onSwitchToDock={() => handleModuleChange('dock')}
                onSwitchToMind={() => handleModuleChange('mind')}
                onCapture={handleCapture}
                nodeCount={nodeCount}
                recRefreshKey={recRefreshKey}
                onApplyRecommendation={handleApplyRecommendation}
                onToast={showToast}
              />
            </div>
          </div>

          <div id="view-mind" className={`view-section ${activeModule === 'mind' ? 'active' : ''}`}>
            <MindCanvasStage
              nodes={mindNodes}
              edges={mindEdges}
              snapshot={mindSnapshot}
              onOpenEditor={(nodeId: number) => {
                const item = items.find(i => i.id === nodeId)
                if (item) {
                  openEditorTab(nodeId)
                } else {
                  const dockItem = workspaceMapping.findDockItemByMindNode(String(nodeId))
                  if (dockItem) {
                    openEditorTab(dockItem.id)
                  } else {
                    showToast('This node has no linked document (unlinked)')
                  }
                }
              }}
              onToast={showToast}
              activeModule={activeModule}
              onOpenInDock={(dockItemId: number) => {
                setSelectedItemId(dockItemId)
                handleModuleChange('dock')
                showToast(`已定位到 Dock item #${dockItemId}`)
              }}
            />
          </div>

          <div id="view-dock" className={`view-section ${activeModule === 'dock' ? 'active' : ''} overflow-y-auto no-scrollbar pt-20 pb-4 px-6`}>
            <DockFinderView
              items={items}
              selectedItemId={selectedItemId}
              loading={loading}
              error={error}
              onSelectItem={setSelectedItemId}
              onArchive={handleArchive}
              onSuggest={handleSuggest}
              onOpenEditor={openEditorTab}
              onReopen={handleReopen}
              onOpenRecorder={handleFocusCaptureInput}
              selectedItem={selectedItem}
              onToast={showToast}
              onSwitchToMind={handleSwitchToMind}
              onAddTag={handleAddTag}
              graphChainForItem={(id: number) => workspaceMapping.getGraphChainForDockItem(id)}
              findMindNodeForItem={(id: number) => workspaceMapping.findMindNodeByDockItem(id)}
              initialProjectFilter={sharedProjectFilter}
              initialTagFilter={sharedTagFilter}
              initialDockSearch={sharedDockSearch}
              onProjectFilterChange={setSharedProjectFilter}
              onTagFilterChange={setSharedTagFilter}
              onDockSearchChange={setSharedDockSearch}
              externalMockNodes={mockFolderNodes}
              suggestingId={suggestingId}
              recommendationsLoading={recommendationsLoading}
              recommendationsError={recommendationsError}
              itemRecommendations={itemRecommendations}
              applyLoading={applyLoading}
              onApplyRecommendation={handleApplyRecommendation}
              onFeedbackRecommendation={handleFeedbackRecommendation}
            />
          </div>
        </main>

        {toastMessage && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] pointer-events-none">
            <div className="glass rounded-xl px-5 py-2.5 text-sm text-white shadow-2xl dropdown-transition">
              {toastMessage}
            </div>
          </div>
        )}

        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
            <div className="relative z-10 w-full max-w-sm mx-4 bg-[#161616]/95 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 shadow-2xl">
              <h3 className="text-base font-medium text-white mb-2">Delete this item?</h3>
              <p className="text-sm text-slate-400 mb-6">This item will be moved to archived status. You can find it later by filtering archived items.</p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="px-4 py-2 text-sm text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

function EditorOptionsMenu({ mode, onSetMode, onToast, onDelete }: { mode: 'classic' | 'block'; onSetMode: (mode: 'classic' | 'block') => void; onToast?: (msg: string) => void; onDelete?: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative flex items-end pb-2 ml-auto">
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 text-slate-500 hover:text-white transition-colors rounded-md hover:bg-white/10"
        title="More Options"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[110]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-56 bg-[#161616]/95 backdrop-blur-xl border border-white/[0.06] rounded-xl p-1 z-[120] shadow-2xl">
            <div className="px-2 py-1 text-[9px] font-bold text-slate-500 tracking-wider">VIEW OPTIONS</div>
            <button
              onClick={() => { onSetMode('block'); setOpen(false) }}
              className="w-full text-left px-2 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2"><LayoutList size={14} /> Block Edit</span>
              {mode === 'block' && <Check size={14} className="text-white" />}
            </button>
            <button
              onClick={() => { onSetMode('classic'); setOpen(false) }}
              className="w-full text-left px-2 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2"><FileCode2 size={14} /> Classic Edit</span>
              {mode === 'classic' && <Check size={14} className="text-white" />}
            </button>
            <div className="my-1 border-t border-white/[0.06]" />
            <div className="px-2 py-1 text-[9px] font-bold text-slate-500 tracking-wider">ACTIONS</div>
            <button onClick={() => { onToast?.('Rename coming soon'); setOpen(false) }} className="w-full text-left px-2 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors">
              <Pencil size={14} /> Rename
            </button>
            <button onClick={() => { onToast?.('Move to... coming soon'); setOpen(false) }} className="w-full text-left px-2 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors">
              <FolderOutput size={14} /> Move to...
            </button>
            <button onClick={() => { onToast?.('Export as PDF coming soon'); setOpen(false) }} className="w-full text-left px-2 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors">
              <Download size={14} /> Export as PDF
            </button>
            <div className="my-1 border-t border-white/[0.06]" />
            <button onClick={() => { onDelete?.(); setOpen(false) }} className="w-full text-left px-2 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors">
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function DockFinderView({ items, selectedItemId, loading, error, onSelectItem, onSuggest, onOpenEditor, onOpenRecorder, selectedItem, onToast, onSwitchToMind, onAddTag, graphChainForItem, findMindNodeForItem, initialProjectFilter, initialTagFilter, initialDockSearch, onProjectFilterChange, onTagFilterChange, onDockSearchChange, externalMockNodes, suggestingId, recommendationsLoading, recommendationsError, itemRecommendations, applyLoading, onApplyRecommendation, onFeedbackRecommendation }: {
  items: DockItem[]
  selectedItemId: number | null
  loading: boolean
  error: string | null
  onSelectItem: (id: number | null) => void
  onArchive: (id: number) => void
  onSuggest: (id: number) => void
  onOpenEditor: (id: number) => void
  onReopen: (id: number) => void
  onOpenRecorder: () => void
  selectedItem: DockItem | null
  onToast: (msg: string) => void
  onSwitchToMind: () => void
  onAddTag: (id: number, tagName: string) => Promise<void>
  graphChainForItem: (id: number) => string[]
  findMindNodeForItem: (id: number) => StoredMindNode | null
  initialProjectFilter: string | null
  initialTagFilter: string | null
  initialDockSearch: string
  onProjectFilterChange: (project: string | null) => void
  onTagFilterChange: (tag: string | null) => void
  onDockSearchChange: (query: string) => void
  externalMockNodes: DockTreeNode[]
  suggestingId: number | null
  recommendationsLoading: boolean
  recommendationsError: string | null
  itemRecommendations: RecommendationDockQueueItem[]
  applyLoading: string | null
  onApplyRecommendation: (recommendationId: string) => Promise<string | void>
  onFeedbackRecommendation: (recommendationId: string, feedbackType: 'accepted' | 'rejected' | 'ignored') => Promise<void>
}) {
  const [filterStatus, setFilterStatus] = useState<EntryStatus | null>(null)
  const [dockSearch, setDockSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'columns'>('columns')
  const [selectedProject, setSelectedProject] = useState<string | null>(initialProjectFilter)
  const [selectedTag, setSelectedTag] = useState<string | null>(initialTagFilter)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [addTagInput, setAddTagInput] = useState('')
  const [showAddTag, setShowAddTag] = useState(false)
  const [addingTag, setAddingTag] = useState(false)
  const [columnStack, setColumnStack] = useState<DockTreeNode[]>([])
  const [selectedColumnNode, setSelectedColumnNode] = useState<DockTreeNode | null>(null)
  const [mockTreeNodes, setMockTreeNodes] = useState<DockTreeNode[]>([])
  const mockIdCounter = useRef(-1)
  const moreRef = useRef<HTMLDivElement>(null)

  const dockTreeViewModel = useMemo(() => toDockTreeViewModel(items.filter(i => i.status !== 'archived')), [items])

  // TODO(backend-boundary): Dock hierarchy create is mock-only. No backend persistence.
  // Real project/folder CRUD needs backend schema + BFF API.
  // Frontend interaction must remain verifiable even without backend.
  const handleCreateMockFolder = useCallback(() => {
    const newId = mockIdCounter.current--
    let parentNode: DockTreeNode | null = null
    let parentName: string = 'Root'

    if (selectedColumnNode && (selectedColumnNode.type === 'project' || selectedColumnNode.type === 'folder')) {
      parentNode = selectedColumnNode
      parentName = selectedColumnNode.name
    } else if (columnStack.length > 0) {
      const lastCol = columnStack[columnStack.length - 1]
      if (lastCol.type === 'project' || lastCol.type === 'folder') {
        parentNode = lastCol
        parentName = lastCol.name
      }
    } else if (selectedProject) {
      parentNode = dockTreeViewModel.roots.find(r => r.name === selectedProject) || null
      parentName = selectedProject
    }

    const isUnderParent = parentNode !== null
    const parentRef = parentNode as DockTreeNode | undefined
    const newNode: DockTreeNode = {
      id: newId,
      type: isUnderParent ? 'folder' : 'project',
      name: isUnderParent ? `New Folder ${Math.abs(newId)}` : `New Project ${Math.abs(newId)}`,
      title: isUnderParent ? `New Folder ${Math.abs(newId)}` : `New Project ${Math.abs(newId)}`,
      children: [],
      parentId: parentRef?.id ?? null,
      depth: parentRef ? (parentRef.depth + 1) : 0,
      documentId: null,
      contentType: 'mock',
      tags: [],
      preview: '',
      metadata: { mock: true, parentId: parentRef?.id ?? null },
    }

    setMockTreeNodes(prev => [...prev, newNode])

    if (isUnderParent && parentRef) {
      setSelectedColumnNode(newNode)
      if (!columnStack.some(n => n.id === parentRef.id)) {
        setColumnStack(prev => [...prev, parentRef])
      }
    }

    onToast(`Created local ${isUnderParent ? 'folder' : 'project'} under "${parentName}" (mock, not persisted)`)
  }, [selectedColumnNode, columnStack, selectedProject, dockTreeViewModel.roots, onToast])

  // TODO(backend-boundary): mergedRoots merges adapter tree + local mock nodes.
  // This is NOT production persistence — mock nodes are session-only.
  const mergedRoots = useMemo(() => {
    function deepCloneNode(node: DockTreeNode): DockTreeNode {
      return {
        ...node,
        children: node.children.map(deepCloneNode),
      }
    }
    const roots = dockTreeViewModel.roots.map(deepCloneNode)
    const nodeById = new Map<number, DockTreeNode>()
    function indexTree(nodes: DockTreeNode[]) {
      nodes.forEach(n => {
        nodeById.set(n.id, n)
        if (n.children.length > 0) indexTree(n.children)
      })
    }
    indexTree(roots)
    const allMockNodes = [...mockTreeNodes, ...externalMockNodes]
    const projectMocks = allMockNodes.filter(n => n.type === 'project')
    const folderMocks = allMockNodes.filter(n => n.type !== 'project')
    projectMocks.forEach(mockNode => {
      const cloned: DockTreeNode = { ...mockNode, children: mockNode.children.map(deepCloneNode) }
      roots.push(cloned)
      nodeById.set(cloned.id, cloned)
      indexTree(cloned.children)
    })
    folderMocks.forEach(mockNode => {
      const parentId = mockNode.metadata?.parentId as number | null | undefined
      const parentProject = mockNode.metadata?.parentProject as string | undefined
      let parent: DockTreeNode | undefined
      if (parentId != null) {
        parent = nodeById.get(parentId)
      }
      if (!parent && parentProject) {
        parent = roots.find(r => r.name === parentProject)
      }
      if (parent) {
        const childNode: DockTreeNode = { ...mockNode, parentId: parent.id, children: mockNode.children.map(deepCloneNode) }
        parent.children.push(childNode)
        nodeById.set(childNode.id, childNode)
      } else {
        const orphanNode: DockTreeNode = { ...mockNode, type: 'project', children: mockNode.children.map(deepCloneNode), metadata: { ...mockNode.metadata, orphan: true } }
        roots.push(orphanNode)
        nodeById.set(orphanNode.id, orphanNode)
      }
    })
    return roots
  }, [dockTreeViewModel.roots, mockTreeNodes, externalMockNodes])

  const filteredRoots = useMemo(() => {
    if (!selectedProject) return mergedRoots
    const match = mergedRoots.find(r => r.name === selectedProject)
    return match ? [match] : []
  }, [selectedProject, mergedRoots])

  useEffect(() => {
    if (selectedProject) {
      const projectRoot = mergedRoots.find(r => r.name === selectedProject)
      if (projectRoot) {
        setColumnStack([])
        setSelectedColumnNode(null)
      } else {
        onToast(`Project "${selectedProject}" not found in Dock tree`)
      }
    } else {
      setColumnStack([])
      setSelectedColumnNode(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, mergedRoots])

  useEffect(() => {
    if (initialProjectFilter !== selectedProject) setSelectedProject(initialProjectFilter)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProjectFilter])
  useEffect(() => {
    if (initialTagFilter !== selectedTag) setSelectedTag(initialTagFilter)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTagFilter])
  useEffect(() => {
    if (initialDockSearch && initialDockSearch !== dockSearch) setDockSearch(initialDockSearch)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDockSearch])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (moreMenuOpen && moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreMenuOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [moreMenuOpen])

  const counts: Record<EntryStatus, number> = { pending: 0, suggested: 0, archived: 0, ignored: 0, reopened: 0 }
  items.forEach(i => { counts[i.status] = (counts[i.status] || 0) + 1 })

  let filteredItems = filterStatus ? items.filter(i => i.status === filterStatus) : items.filter(i => i.status !== 'archived')
  if (selectedProject) {
    const projectRoot = mergedRoots.find(r => r.name === selectedProject)
    if (projectRoot) {
      const descendantIds = new Set<number>()
      const collectIds = (node: DockTreeNode) => {
        if (node.documentId != null) descendantIds.add(node.documentId)
        node.children.forEach(collectIds)
      }
      projectRoot.children.forEach(collectIds)
      filteredItems = filteredItems.filter(i => descendantIds.has(i.id) || (i.selectedProject && i.selectedProject === selectedProject))
    }
  }
  if (selectedTag) {
    filteredItems = filteredItems.filter(i => {
      const text = (i.topic || i.rawText).toLowerCase()
      return text.includes(selectedTag.toLowerCase())
    })
  }
  const searchFiltered = dockSearch ? filteredItems.filter(i => (i.topic || i.rawText).toLowerCase().includes(dockSearch.toLowerCase())) : filteredItems

  const visibleSelected = selectedItemId != null && searchFiltered.some(i => i.id === selectedItemId)
  const effectiveSelectedItem = visibleSelected ? selectedItem : null

  const handleSelectFilter = (st: EntryStatus | null) => {
    setFilterStatus(st)
    setSelectedProject(null)
    setSelectedTag(null)
    if (st != null && selectedItemId != null) {
      const item = items.find(i => i.id === selectedItemId)
      if (item && item.status !== st) onSelectItem(null)
    }
  }

  const handleProjectClick = (proj: string) => {
    if (selectedProject === proj) {
      setSelectedProject(null)
      onProjectFilterChange(null)
      onToast(`Project filter cleared`)
    } else {
      setSelectedProject(proj)
      setSelectedTag(null)
      setFilterStatus(null)
      onProjectFilterChange(proj)
      onTagFilterChange(null)
      onToast(`Filtered by project: ${proj}`)
    }
  }

  const handleTagClick = (tag: string) => {
    if (selectedTag === tag) {
      setSelectedTag(null)
      onTagFilterChange(null)
      onToast(`Tag filter cleared`)
    } else {
      setSelectedTag(tag)
      setSelectedProject(null)
      setFilterStatus(null)
      onTagFilterChange(tag)
      onProjectFilterChange(null)
      onToast(`Filtered by tag: #${tag}`)
    }
  }

  const handleAddTag = async () => {
    const trimmed = addTagInput.trim()
    if (!trimmed || !effectiveSelectedItem) return

    const isDuplicate = effectiveSelectedItem.userTags?.some(
      (t) => t.toLowerCase() === trimmed.toLowerCase()
    )
    if (isDuplicate) {
      onToast(`Tag "#${trimmed}" already exists`)
      setAddTagInput('')
      setShowAddTag(false)
      return
    }

    setAddingTag(true)
    try {
      await onAddTag(effectiveSelectedItem.id, trimmed)
      onToast(`Tag "#${trimmed}" added`)
      setAddTagInput('')
      setShowAddTag(false)
    } catch {
      onToast('Failed to add tag')
    } finally {
      setAddingTag(false)
    }
  }

  const formatDate = (d: Date | string | null) => {
    if (!d) return '-'
    const date = typeof d === 'string' ? new Date(d) : d
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  const statusIcon = (status: EntryStatus) => {
    switch (status) {
      case 'pending': return <Circle size={12} className="text-yellow-500/70" />
      case 'suggested': return <Lightbulb size={12} className="text-blue-400/70" />
      case 'archived': return <Archive size={12} className="text-emerald-400/70" />
      case 'reopened': return <RotateCcw size={12} className="text-orange-400/70" />
      default: return <Circle size={12} className="text-slate-500/70" />
    }
  }

  const itemContent = (item: DockItem, isActive: boolean) => {
    const title = item.topic || item.rawText.slice(0, 50)
    return (
      <>
        <FileText size={16} className={`shrink-0 ${isActive ? 'text-[#111]' : 'text-[var(--text-muted)] group-hover:text-white'}`} />
        <span className="truncate pointer-events-none">{title}</span>
        {item.status !== 'pending' && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ml-2 ${isActive ? 'bg-[#111]/10 text-[#111]/70' : 'bg-white/5 text-[var(--text-muted)]'}`}>
            {STATUS_LABELS[item.status]?.label}
          </span>
        )}
      </>
    )
  }

  return (
    <div className="glass w-full h-full rounded-2xl flex flex-col overflow-hidden shadow-2xl border border-[var(--border-line)]">
      <div className="h-14 border-b border-[var(--border-line)] flex items-center justify-between px-4 shrink-0 bg-[#161616]">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-white tracking-tight ml-2">Dock</h2>
          <div className="w-px h-5 bg-[var(--border-line)]" />
          <div className="flex items-center bg-black/40 rounded-lg p-1 border border-[var(--border-line)]">
            <button onClick={() => setViewMode('grid')} className={`p-1 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white/10 text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-white'}`} title="Grid View"><LayoutGrid size={16} /></button>
            <button onClick={() => setViewMode('list')} className={`p-1 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white/10 text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-white'}`} title="List View"><List size={16} /></button>
            <button onClick={() => setViewMode('columns')} className={`p-1 rounded-md transition-colors ${viewMode === 'columns' ? 'bg-white/10 text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-white'}`} title="Column View"><Columns size={16} /></button>
          </div>
          <button onClick={handleCreateMockFolder} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-[var(--border-line)] rounded-lg text-xs text-[var(--text-muted)] hover:text-white transition-colors" title="New Folder">
            <Folder size={14} /> <span>+ Folder</span>
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" value={dockSearch} onChange={e => { setDockSearch(e.target.value); onDockSearchChange(e.target.value) }} placeholder="Filter inside dock..." className="bg-black/40 border border-[var(--border-line)] rounded-lg pl-9 pr-4 py-1.5 text-sm outline-none focus:border-[var(--accent)] transition-colors w-48 text-white placeholder:text-gray-500 shadow-inner" />
          </div>
          <div className="relative" ref={moreRef}>
            <button onClick={() => setMoreMenuOpen(v => !v)} className="p-1.5 text-[var(--text-muted)] hover:text-white transition-colors rounded-md hover:bg-white/10" title="More Options"><MoreHorizontal size={16} /></button>
            {moreMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 glass rounded-xl p-1 shadow-2xl z-[110]">
                <button onClick={() => { onOpenRecorder(); setMoreMenuOpen(false) }} className="w-full text-left px-2 py-1.5 text-xs text-[var(--text-muted)] hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors"><Sparkles size={14} className="text-[var(--accent)]" /> New Capture</button>
                <button onClick={() => { onToast('Sort by date (mock)'); setMoreMenuOpen(false) }} className="w-full text-left px-2 py-1.5 text-xs text-[var(--text-muted)] hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors"><ChevronRight size={14} /> Sort by Date</button>
                <button onClick={() => { onToast('Export as Markdown (mock)'); setMoreMenuOpen(false) }} className="w-full text-left px-2 py-1.5 text-xs text-[var(--text-muted)] hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors"><Download size={14} /> Export</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden bg-[#111]">
        <div className="w-48 bg-[#161616] border-r border-[var(--border-line)] flex flex-col py-3 overflow-y-auto shrink-0 no-scrollbar">
          <div className="px-4 text-[10px] font-bold text-[var(--text-muted)] tracking-wider mb-2">SHORTCUTS</div>
          <div className="space-y-0.5 px-2">
            <div onClick={() => handleSelectFilter(null)} className={`finder-item ${filterStatus === null && !selectedProject && !selectedTag ? 'active' : ''}`}>
              <span className="flex items-center gap-2"><Package size={16} /> Dock</span>
            </div>
            <div onClick={() => handleSelectFilter('archived')} className={`finder-item ${filterStatus === 'archived' ? 'active' : ''}`}>
              <span className="flex items-center gap-2"><Archive size={16} /> Archive</span>
            </div>
          </div>

          <div className="px-4 text-[10px] font-bold text-[var(--text-muted)] tracking-wider mt-6 mb-2">PROJECTS</div>
          <div className="space-y-0.5 px-2">
            <div onClick={() => handleProjectClick('Core Architecture')} className={`finder-item ${selectedProject === 'Core Architecture' ? 'active' : ''}`}>
              <span className="flex items-center gap-2"><Folder size={16} className="text-[var(--node-domain)]" /> Core Architecture</span>
            </div>
            <div onClick={() => handleProjectClick('Personal Growth')} className={`finder-item ${selectedProject === 'Personal Growth' ? 'active' : ''}`}>
              <span className="flex items-center gap-2"><Folder size={16} className="text-blue-400" /> Personal Growth</span>
            </div>
          </div>

          <div className="px-4 text-[10px] font-bold text-[var(--text-muted)] tracking-wider mt-6 mb-2">TAGS</div>
          <div className="space-y-0.5 px-2 flex flex-wrap gap-1">
            {['physics', 'algo', 'book', '技术', '产品', '学习'].map(tag => (
              <span key={tag} onClick={() => handleTagClick(tag)} className={`px-2 py-1 border rounded-md text-xs cursor-pointer hover:text-white transition-colors ${selectedTag === tag ? 'bg-[var(--accent)] text-[#111] border-[var(--accent)]' : 'bg-white/5 border-[var(--border-line)] text-[var(--text-muted)]'}`}>#{tag}</span>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden" onClick={(e) => {
          if (e.currentTarget === e.target) onSelectItem(null)
        }}>
          {viewMode === 'columns' && (
            <div className="flex-1 flex overflow-x-auto overflow-y-hidden no-scrollbar">
              <ColumnListView
                columnStack={columnStack}
                setColumnStack={setColumnStack}
                selectedColumnNode={selectedColumnNode}
                setSelectedColumnNode={setSelectedColumnNode}
                filteredRoots={filteredRoots}
                loading={loading}
                error={error}
                filteredItems={searchFiltered}
                onSelectItem={onSelectItem}
                selectedItemId={selectedItemId}
                itemContent={itemContent}
              />
            </div>
          )}

          {viewMode === 'grid' && (
            <div className="flex-1 overflow-y-auto no-scrollbar p-4">
              <div className="text-[10px] text-[var(--text-muted)] font-medium tracking-wide mb-3">
                {selectedProject ? selectedProject : selectedTag ? `#${selectedTag}` : filterStatus ? STATUS_LABELS[filterStatus].label : '所有条目'}
                <span className="mx-2">/</span>{searchFiltered.length} 项
              </div>
              {searchFiltered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                  <Package size={24} className="opacity-30 mb-3" /><p className="text-sm">暂无条目</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {searchFiltered.map((item) => {
                    const isActive = selectedItemId === item.id
                    return (
                      <div key={item.id} onClick={() => onSelectItem(isActive ? null : item.id)}
                        className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-lg ${isActive ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 shadow-lg' : 'bg-white/5 border-[var(--border-line)] hover:bg-white/10 hover:border-white/20'}`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {statusIcon(item.status)}
                          <span className="text-[9px] text-[var(--text-muted)] uppercase">{item.sourceType}</span>
                        </div>
                        <h4 className={`text-sm font-medium mb-1 line-clamp-2 ${isActive ? 'text-white' : 'text-gray-200'}`}>{item.topic || item.rawText.slice(0, 60)}</h4>
                        <p className="text-[11px] text-[var(--text-muted)] line-clamp-2">{item.rawText.slice(0, 100)}</p>
                        {item.userTags && item.userTags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {item.userTags.map(tag => (
                              <span key={tag} className="px-1.5 py-0.5 bg-white/5 border border-[var(--border-line)] rounded text-[9px] text-[var(--text-muted)]">#{tag}</span>
                            ))}
                          </div>
                        )}
                        <div className="mt-3 text-[10px] text-[var(--text-muted)] flex items-center justify-between">
                          <span>{STATUS_LABELS[item.status]?.label}</span>
                          <span>{formatDate(item.createdAt)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {viewMode === 'list' && (
            <div className="flex-1 overflow-y-auto no-scrollbar">
              <div className="sticky top-0 h-9 flex items-center px-4 border-b border-[var(--border-line)] bg-[#111] shrink-0 text-[10px] text-[var(--text-muted)] font-medium tracking-wide">
                <span className="w-8"></span>
                <span className="flex-1">TITLE</span>
                <span className="w-16 text-center">STATUS</span>
                <span className="w-12 text-center">TYPE</span>
                <span className="w-20 text-center hidden md:block">TAGS</span>
                <span className="w-20 text-right">DATE</span>
              </div>
              {searchFiltered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                  <Package size={24} className="opacity-30 mb-3" /><p className="text-sm">暂无条目</p>
                </div>
              ) : (searchFiltered.map((item) => {
                const isActive = selectedItemId === item.id
                return (
                  <div key={item.id} onClick={() => onSelectItem(isActive ? null : item.id)}
                    className={`flex items-center px-4 py-2 cursor-pointer transition-colors border-b border-[var(--border-line)]/50 ${isActive ? 'bg-[var(--accent)]/15 text-white' : 'hover:bg-white/5 text-gray-300'}`}
                  >
                    <span className="w-8">{statusIcon(item.status)}</span>
                    <span className="flex-1 text-sm truncate">{item.topic || item.rawText.slice(0, 60)}</span>
                    <span className="w-16 text-center text-xs text-[var(--text-muted)]">{STATUS_LABELS[item.status]?.label}</span>
                    <span className="w-12 text-center text-xs text-[var(--text-muted)]">{item.sourceType}</span>
                    <span className="w-20 text-center hidden md:block text-[10px] text-[var(--text-muted)]">
                      {item.userTags && item.userTags.length > 0 ? item.userTags.slice(0, 2).map(t => `#${t}`).join(' ') : '-'}
                    </span>
                    <span className="w-20 text-right text-xs text-[var(--text-muted)]">{formatDate(item.createdAt)}</span>
                  </div>
                )
              }))}
            </div>
          )}
        </div>

        {effectiveSelectedItem && (
          <div data-detail-panel className="w-80 bg-[#161616] border-l border-[var(--border-line)] flex flex-col shrink-0 overflow-y-auto no-scrollbar shadow-xl relative">
            <button
              onClick={() => onSelectItem(null)}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-white/10 transition-colors z-10"
              title="关闭详情面板"
            >
              <X size={14} />
            </button>
            <div className="flex-1 overflow-y-auto no-scrollbar p-6 flex flex-col items-center">
              <div className="w-24 h-24 rounded-2xl bg-white/5 border border-[var(--border-line)] flex items-center justify-center mb-6 mt-4 shadow-inner">
                <FileText size={40} className="text-[var(--node-doc)]" />
              </div>
              <h3 className="text-xl font-bold text-white text-center w-full break-words mb-1">
                {effectiveSelectedItem.topic || effectiveSelectedItem.rawText.slice(0, 40)}
              </h3>
              <p className="text-xs text-[var(--text-muted)] mb-8">Document · Markdown</p>
              <div className="w-full space-y-4 text-xs">
                <div className="flex flex-col gap-1 border-b border-[var(--border-line)] pb-4">
                  <span className="text-[var(--text-muted)] font-semibold tracking-wider text-[10px]">TAGS</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {effectiveSelectedItem.userTags && effectiveSelectedItem.userTags.length > 0 ? (
                      effectiveSelectedItem.userTags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-black/40 border border-[var(--border-line)] rounded-md text-[10px] text-[var(--text-muted)]">#{tag}</span>
                      ))
                    ) : (
                      <span className="text-[10px] text-[var(--text-muted)]/50 italic">No tags</span>
                    )}
                    {showAddTag ? (
                      <div className="flex items-center gap-1">
                        <input type="text" value={addTagInput} onChange={e => setAddTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !addingTag) handleAddTag() }} placeholder="tag name" disabled={addingTag} className="w-16 bg-black/40 border border-[var(--border-line)] rounded px-1.5 py-0.5 text-[10px] outline-none text-white disabled:opacity-50" autoFocus />
                        <button onClick={handleAddTag} disabled={addingTag || !addTagInput.trim()} className="text-[var(--accent)] text-[10px] disabled:opacity-50">{addingTag ? '...' : 'Add'}</button>
                        <button onClick={() => { setShowAddTag(false); setAddTagInput('') }} disabled={addingTag} className="text-[var(--text-muted)] text-[10px] disabled:opacity-50">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setShowAddTag(true)} className="w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-[var(--text-muted)] hover:text-white transition-colors" title="Add Tag"><Plus size={12} /></button>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-muted)] font-semibold tracking-wider text-[10px]">CREATED</span>
                  <span className="text-gray-300">{formatDate(effectiveSelectedItem.createdAt)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-muted)] font-semibold tracking-wider text-[10px]">MODIFIED</span>
                  <span className="text-gray-300">{formatDate(effectiveSelectedItem.processedAt)}</span>
                </div>
                <div className="flex flex-col gap-1.5 border-t border-[var(--border-line)] pt-4 mt-4">
                  <span className="text-[var(--text-muted)] font-semibold tracking-wider text-[10px]">GRAPH CHAIN</span>
                  <div className="text-[10px] text-blue-400 bg-blue-400/10 border border-blue-400/20 px-2 py-1.5 rounded-lg leading-relaxed">
                    {graphChainForItem(effectiveSelectedItem.id).join(' > ')}
                  </div>
                  <button
                    onClick={() => {
                      onSwitchToMind()
                      onToast(`导航到图谱视图: ${effectiveSelectedItem.topic || effectiveSelectedItem.rawText.slice(0, 30)}`)
                    }}
                    className="mt-1 w-full py-1.5 text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Network size={12} /> View in Graph
                  </button>
                </div>

                <div className="flex flex-col gap-1.5 border-t border-[var(--border-line)] pt-4">
                  <span className="text-[var(--text-muted)] font-semibold tracking-wider text-[10px]">
                    RECOMMENDATIONS
                    {itemRecommendations.length > 0 && (
                      <span className="ml-2 text-[var(--accent)]">{itemRecommendations.length}</span>
                    )}
                  </span>
                  {recommendationsLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 size={14} className="animate-spin text-slate-500" />
                    </div>
                  ) : recommendationsError ? (
                    <div className="text-[10px] text-red-400 py-2">{recommendationsError}</div>
                  ) : itemRecommendations.length === 0 ? (
                    <div className="text-[10px] text-[var(--text-muted)]/50 italic py-2">
                      暂无推荐。点击下方&ldquo;生成建议&rdquo;后系统将为此条目生成智能推荐。
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto no-scrollbar">
                      {itemRecommendations.map((rec) => {
                        const isResolved = isRecommendationResolved(rec.status)
                        const isApplying = applyLoading === rec.id
                        const isUnsupported = !isSupportedCandidateType(rec.candidateType)
                        const actionText = describeRecommendationAction(rec.candidateType, rec.candidateId)
                        const reasonText = describeRecommendationReason(rec.candidateType, rec.reasonSummary, rec.evidenceSummary)
                        const previewText = describeApplyPreview(rec.candidateType, rec.candidateId)
                        const confidenceLevel = formatConfidenceLevel(rec.confidenceScore)
                        const typeLabel = CANDIDATE_TYPE_LABELS[rec.candidateType] ?? rec.candidateType
                        const recStatusConfig = REC_STATUS_LABELS[rec.status as keyof typeof REC_STATUS_LABELS]
                        return (
                          <div key={rec.id} className={`p-2 rounded-lg border text-[10px] ${isResolved ? 'bg-white/[0.01] border-white/[0.03] opacity-60' : 'bg-white/[0.02] border-white/[0.06]'}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-white/70 font-medium truncate max-w-[180px]">
                                {actionText}
                              </span>
                              <span className={`shrink-0 ${recStatusConfig?.color ?? 'text-yellow-400'}`}>
                                {recStatusConfig?.label ?? rec.status}
                              </span>
                            </div>
                            <div className="text-[var(--text-muted)] mb-1 truncate">{reasonText}</div>
                            <div className="text-[var(--text-muted)]/60 mb-1.5 truncate text-[9px]">{previewText}</div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-[var(--accent)]">{Math.round(rec.confidenceScore * 100)}%</span>
                                <span className="text-[var(--text-muted)]/60 text-[9px]">可信度: {confidenceLevel}</span>
                                <span className="text-[var(--text-muted)]/40 text-[9px]">{typeLabel}</span>
                              </div>
                              {!isResolved && (
                                <div className="flex gap-1">
                                  {isUnsupported ? (
                                    <>
                                      <span className="text-yellow-400/80 text-[9px]">暂不支持自动应用</span>
                                      <button
                                        onClick={() => onFeedbackRecommendation(rec.id, 'ignored')}
                                        disabled={isApplying}
                                        className="px-2 py-0.5 rounded bg-gray-500/10 border border-gray-500/20 text-gray-400 hover:bg-gray-500/20 disabled:opacity-50 transition-colors"
                                      >
                                        <EyeOff size={10} />
                                      </button>
                                      <button
                                        onClick={() => onFeedbackRecommendation(rec.id, 'rejected')}
                                        disabled={isApplying}
                                        className="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors text-[9px]"
                                      >
                                        不再推荐
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => onApplyRecommendation(rec.id).then((summary) => { if (summary) onToast?.(summary) }).catch((e) => { onToast?.(`建议应用失败: ${e instanceof Error ? e.message : '未知错误'}`) })}
                                        disabled={isApplying}
                                        className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors flex items-center gap-1"
                                      >
                                        {isApplying ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                                        {isApplying ? '应用' : '接受'}
                                      </button>
                                      <button
                                        onClick={() => onFeedbackRecommendation(rec.id, 'rejected')}
                                        disabled={isApplying}
                                        className="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                                      >
                                        <X size={10} />
                                      </button>
                                      <button
                                        onClick={() => onFeedbackRecommendation(rec.id, 'ignored')}
                                        disabled={isApplying}
                                        className="px-2 py-0.5 rounded bg-gray-500/10 border border-gray-500/20 text-gray-400 hover:bg-gray-500/20 disabled:opacity-50 transition-colors"
                                      >
                                        <EyeOff size={10} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-[var(--border-line)] bg-black/20 flex flex-col gap-2 shrink-0">
              <button onClick={() => onOpenEditor(effectiveSelectedItem.id)} className="w-full py-2 bg-[var(--accent)] text-[#111] hover:bg-[#b097ff] font-medium text-sm rounded-lg transition-colors flex items-center justify-center gap-2">
                <PenTool size={16} /> Edit Content
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const mindNode = findMindNodeForItem(effectiveSelectedItem.id)
                    if (mindNode) {
                      onSwitchToMind()
                      onToast(`Mind: focused on "${mindNode.label}"`)
                    } else {
                      onToast('No Mind node linked to this document')
                    }
                  }}
                  className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white font-medium text-sm rounded-lg transition-colors flex items-center justify-center gap-2 border border-[var(--border-line)]"
                >
                  <Lightbulb size={16} className="text-amber-400" /> View in Graph
                </button>
                <button
                  onClick={() => onSuggest(effectiveSelectedItem.id)}
                  disabled={suggestingId === effectiveSelectedItem.id}
                  className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white font-medium text-sm rounded-lg transition-colors flex items-center justify-center gap-2 border border-[var(--border-line)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {suggestingId === effectiveSelectedItem.id ? (
                    <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
                  ) : (
                    <Sparkles size={16} className="text-[var(--accent)]" />
                  )}
                  {suggestingId === effectiveSelectedItem.id ? '生成中...' : '生成建议'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ColumnListView({ columnStack, setColumnStack, selectedColumnNode, setSelectedColumnNode, filteredRoots, loading, error, filteredItems, onSelectItem, selectedItemId, itemContent: _itemContent }: {
  columnStack: DockTreeNode[]
  setColumnStack: React.Dispatch<React.SetStateAction<DockTreeNode[]>>
  selectedColumnNode: DockTreeNode | null
  setSelectedColumnNode: React.Dispatch<React.SetStateAction<DockTreeNode | null>>
  filteredRoots: DockTreeNode[]
  loading: boolean
  error: string | null
  filteredItems: DockItem[]
  onSelectItem: (id: number | null) => void
  selectedItemId: number | null
  itemContent: (item: DockItem, isActive: boolean) => React.ReactNode
}) {
  const breadcrumbs = columnStack.map((node, idx) => ({
    label: node.name,
    type: node.type,
    action: () => setColumnStack(prev => prev.slice(0, idx + 1)),
  }))

  const handleNodeClick = (node: DockTreeNode) => {
    if (node.type === 'project' || node.type === 'folder') {
      setSelectedColumnNode(node)
      if (node.children.length > 0) {
        setColumnStack(prev => {
          const lastIdx = prev.findIndex(n => n.id === node.id)
          if (lastIdx >= 0) return prev.slice(0, lastIdx + 1)
          return [...prev, node]
        })
      }
    } else {
      if (node.documentId != null) {
        if (selectedItemId === node.documentId) {
          onSelectItem(null)
        } else {
          onSelectItem(node.documentId)
        }
        setSelectedColumnNode(node)
      }
    }
  }

  const handleRootClick = () => {
    setColumnStack([])
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="animate-spin text-slate-500" size={20} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  const filteredFileIds = new Set(filteredItems.map(i => i.id))

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-8 flex items-center px-4 border-b border-[var(--border-line)] shrink-0 gap-1 text-[10px] text-[var(--text-muted)] overflow-x-auto no-scrollbar">
        <button onClick={handleRootClick} className="hover:text-white transition-colors shrink-0 font-medium">
          All
        </button>
        {breadcrumbs.map((bc, idx) => (
          <span key={idx} className="flex items-center gap-1 shrink-0">
            <ChevronRight size={10} />
            <button onClick={bc.action} className="hover:text-white transition-colors truncate max-w-[120px]">
              {bc.label}
            </button>
          </span>
        ))}
      </div>
      <div className="flex-1 flex overflow-x-auto overflow-y-hidden no-scrollbar">
        <div className="finder-column overflow-y-auto no-scrollbar py-1 border-r border-[var(--border-line)] shrink-0 w-56">
          <div className="h-7 flex items-center px-3 text-[9px] text-[var(--text-muted)] font-medium tracking-wide uppercase">
            Roots
            <span className="ml-auto">{filteredRoots.length} items</span>
          </div>
          {filteredRoots.length === 0 ? (
            <div className="px-3 py-4 text-[10px] text-[var(--text-muted)]">Empty</div>
          ) : (
            filteredRoots.map(node => {
              const isActive = selectedColumnNode?.id === node.id
              return (
                <div
                  key={node.id}
                  onClick={() => handleNodeClick(node)}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors text-sm ${isActive ? 'bg-[var(--accent)]/15 text-white' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
                >
                  {node.type === 'project' ? <Folder size={14} className="text-[var(--node-domain)] shrink-0" />
                    : node.type === 'folder' ? <Folder size={14} className="text-blue-400 shrink-0" />
                    : <FileText size={14} className="text-[var(--node-doc)] shrink-0" />}
                  <span className="truncate text-xs">{node.name}</span>
                  {node.type !== 'file' && node.children.length > 0 && (
                    <ChevronRight size={12} className="ml-auto text-[var(--text-muted)] shrink-0" />
                  )}
                </div>
              )
            })
          )}
        </div>
        {columnStack.map((colNode, _colIdx) => (
          <div key={colNode.id} className="finder-column overflow-y-auto no-scrollbar py-1 border-r border-[var(--border-line)] shrink-0 w-56">
            <div className="h-7 flex items-center px-3 text-[9px] text-[var(--text-muted)] font-medium tracking-wide uppercase">
              {colNode.type}
              <span className="ml-auto">{colNode.children.length} items</span>
            </div>
            {colNode.children.length === 0 ? (
              <div className="px-3 py-4 text-[10px] text-[var(--text-muted)]">Empty</div>
            ) : (
              colNode.children.map(child => {
                const isActive = selectedColumnNode?.id === child.id
                const filtered = child.type === 'file' && child.documentId != null && !filteredFileIds.has(child.documentId)
                return (
                  <div
                    key={child.id}
                    onClick={() => handleNodeClick(child)}
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors text-sm ${isActive ? 'bg-[var(--accent)]/15 text-white' : filtered ? 'text-[var(--text-muted)]/30' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
                  >
                    {child.type === 'project' ? <Folder size={14} className="text-[var(--node-domain)] shrink-0" />
                      : child.type === 'folder' ? <Folder size={14} className="text-blue-400 shrink-0" />
                      : <FileText size={14} className="text-[var(--node-doc)] shrink-0" />}
                    <span className="truncate text-xs">{child.name}</span>
                    {child.type !== 'file' && child.children.length > 0 && (
                      <ChevronRight size={12} className="ml-auto text-[var(--text-muted)] shrink-0" />
                    )}
                  </div>
                )
              })
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// NOTE: NebulaBackground is a PASSIVE derived background for Home/Dock views.
// It is NOT the same engine as MindCanvasStage — it uses a simplified layout
// and separate canvas. A shared engine unification is planned for a future round.
// Decision: Round 35 chose Option B (degraded) — see dev log for rationale.
// This is explicitly NOT "same engine" — it's a visual approximation.
function NebulaBackground({ activeModule, mindNodes, mindEdges }: { activeModule: string; mindNodes: StoredMindNode[]; mindEdges: StoredMindEdge[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const dataRef = useRef<{ nodes: { id: string; x: number; y: number; r: number; type: string; label: string }[]; edges: { sourceId: string; targetId: string; edgeType: string }[] }>({ nodes: [], edges: [] })

  useEffect(() => {
    const rootNodes = mindNodes.filter(n => n.nodeType === 'root')
    const domainNodes = mindNodes.filter(n => n.nodeType === 'domain' || n.nodeType === 'project')
    const leafNodes = mindNodes.filter(n => n.nodeType !== 'root' && n.nodeType !== 'domain' && n.nodeType !== 'project')

    const bgNodes: { id: string; x: number; y: number; r: number; type: string; label: string }[] = []
    const cx = 0
    const cy = 0

    if (rootNodes.length > 0) {
      bgNodes.push({ id: rootNodes[0].id, x: cx, y: cy, r: 5, type: 'root', label: rootNodes[0].label })
    } else if (domainNodes.length > 0) {
      bgNodes.push({ id: '__wt_root__', x: cx, y: cy, r: 5, type: 'root', label: 'World Tree' })
    }

    domainNodes.forEach((n, i) => {
      const angle = (i / Math.max(domainNodes.length, 1)) * Math.PI * 2
      const dist = 120 + (n.degreeScore || 3) * 10
      bgNodes.push({ id: n.id, x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist, r: 3, type: n.nodeType, label: n.label })
    })

    leafNodes.slice(0, 50).forEach((n, i) => {
      const domainIdx = i % Math.max(domainNodes.length, 1)
      const domain = domainNodes[domainIdx]
      const parent = domain ? bgNodes.find(bn => bn.id === domain.id) : bgNodes[0]
      const bx = parent ? parent.x : cx
      const by = parent ? parent.y : cy
      const angle = (i / Math.max(leafNodes.length, 1)) * Math.PI * 2 * 3
      const dist = 35 + (i % 5) * 14
      bgNodes.push({ id: n.id, x: bx + Math.cos(angle) * dist, y: by + Math.sin(angle) * dist, r: 1.5, type: n.nodeType, label: n.label })
    })

    const nodeIdSet = new Set(bgNodes.map(n => n.id))
    const bgEdges = mindEdges.filter(e => nodeIdSet.has(e.sourceNodeId) && nodeIdSet.has(e.targetNodeId)).map(e => ({ sourceId: e.sourceNodeId, targetId: e.targetNodeId, edgeType: e.edgeType }))

    dataRef.current = { nodes: bgNodes, edges: bgEdges }
  }, [mindNodes, mindEdges])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      const data = dataRef.current
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.scale(dpr, dpr)

      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      const t = Date.now() * 0.0003

      for (let ring = 1; ring <= 3; ring++) {
        const r = ring * 130
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(167,139,250,${0.02 / ring})`
        ctx.lineWidth = 0.5
        ctx.setLineDash([3, 8])
        ctx.stroke()
        ctx.setLineDash([])
      }

      const nodeMap = new Map(data.nodes.map(n => [n.id, n]))

      data.edges.forEach(e => {
        const src = nodeMap.get(e.sourceId)
        const tgt = nodeMap.get(e.targetId)
        if (!src || !tgt) return
        const sx = cx + src.x
        const sy = cy + src.y
        const tx = cx + tgt.x
        const ty = cy + tgt.y
        const isStructural = e.edgeType === 'parent_child'
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(tx, ty)
        ctx.strokeStyle = isStructural ? 'rgba(167,139,250,0.06)' : 'rgba(110,231,183,0.03)'
        ctx.lineWidth = isStructural ? 0.8 : 0.4
        ctx.stroke()
      })

      data.nodes.forEach(n => {
        const nx = cx + n.x + Math.sin(t + n.x * 0.01) * 2
        const ny = cy + n.y + Math.cos(t + n.y * 0.01) * 2
        const color = n.type === 'root' ? 'rgba(196,181,253,' : n.type === 'domain' || n.type === 'project' ? 'rgba(139,92,246,' : n.type === 'document' ? 'rgba(110,231,183,' : 'rgba(167,139,250,'
        const glowR = n.r * 3
        const gradient = ctx.createRadialGradient(nx, ny, 0, nx, ny, glowR)
        gradient.addColorStop(0, color + '0.3)')
        gradient.addColorStop(1, color + '0)')
        ctx.beginPath()
        ctx.arc(nx, ny, glowR, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()

        ctx.beginPath()
        ctx.arc(nx, ny, n.r, 0, Math.PI * 2)
        ctx.fillStyle = color + '0.5)'
        ctx.fill()
      })

      ctx.restore()
      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [activeModule])

  const opacity = activeModule === 'editor' ? 0 : activeModule === 'mind' ? 0 : 0.7

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity, transition: 'opacity 0.6s ease' }}
    />
  )
}
