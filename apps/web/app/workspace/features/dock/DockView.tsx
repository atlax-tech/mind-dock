'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Archive,
  BarChart3,
  BookOpen,
  Brain,
  ChevronDown,
  ChevronRight,
  FileText,
  Filter,
  FolderKanban,
  FolderOpen,
  Layers,
  LayoutGrid,
  LineChart,
  ListFilter,
  Network,
  PenTool,
  Plus,
  Search,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react'
import { convertTipToMindNode, upsertMindNode, type StoredMindNode } from '@/lib/repository'
import { emit } from '@/lib/events'
import { executeDockEditorOpen, findRelatedMindNode, useDockData } from './useDockData'
import {
  applyDockSharedFilters,
  buildDockItems,
  buildNavigationCounts,
  getDockKindLabel,
  getDockPrimaryActionLabel,
  getNavigationItems,
  sortDockItems,
  type DockNavigationMode,
  type DockPresentationItem,
  type DockPresentationKind,
  type DockRiskCategory,
} from './dockPresentation'
import { useDockViewModel } from './useDockViewModel'

function formatRelativeTime(date: Date | null): string {
  if (!date) return '—'
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} 小时前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `${diffDay} 天前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function getKindIcon(kind: DockPresentationKind) {
  switch (kind) {
    case 'project':
      return FolderOpen
    case 'topic':
      return Layers
    case 'document':
      return FileText
    case 'signal':
      return Sparkles
    case 'draft':
      return PenTool
    case 'mindNode':
      return Brain
    case 'recommendation':
      return Sparkles
    case 'archiveEvidence':
      return Archive
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'active':
      return '活跃'
    case 'archived':
      return '已归档'
    case 'document':
      return 'Document'
    case 'published':
      return '已发布'
    case 'discarded':
      return '已丢弃'
    case 'drifting':
      return '进行中'
    case 'anchored':
      return '已锚定'
    case 'suggested':
      return '待确认'
    case 'isolated':
      return '孤立'
    case 'dormant':
      return '休眠'
    case 'shown':
      return '已展示'
    case 'generated':
      return '待处理'
    case 'accepted':
      return '已接受'
    case 'rejected':
      return '已拒绝'
    case 'ignored':
      return '已忽略'
    default:
      return status
  }
}

function statusClass(status: string): string {
  switch (status) {
    case 'active':
    case 'anchored':
    case 'accepted':
      return 'border-[#9cf4d4]/20 bg-[#9cf4d4]/10 text-[#9cf4d4]'
    case 'document':
    case 'published':
    case 'shown':
      return 'border-[#86d7ff]/20 bg-[#86d7ff]/10 text-[#86d7ff]'
    case 'drifting':
    case 'generated':
    case 'suggested':
      return 'border-[#f7c87b]/20 bg-[#f7c87b]/10 text-[#f7c87b]'
    case 'isolated':
    case 'conflicted':
    case 'dormant':
    case 'rejected':
    case 'discarded':
      return 'border-[#ffb4ab]/20 bg-[#ffb4ab]/10 text-[#ffb4ab]'
    default:
      return 'border-white/10 bg-white/5 text-[#8d989f]'
  }
}

function maxThreeTags(tags: string[]) {
  if (tags.length <= 3) return tags
  return [...tags.slice(0, 3), `+${tags.length - 3}`]
}

type DialogFilter = 'all' | 'scope' | 'scatter'
type MenuKey = 'types' | 'statuses' | 'tags' | 'time' | 'more' | 'settings' | null

const NAV_ITEMS: Array<{ mode: DockNavigationMode; label: string; subtitle: string; icon: React.ComponentType<{ className?: string }> }> = [
  { mode: 'libraryOverview', label: '全库总览', subtitle: '知识库全局地图', icon: BookOpen },
  { mode: 'warRoom', label: '项目作战室', subtitle: '多项目进程', icon: FolderKanban },
  { mode: 'knowledgeFlow', label: '知识流', subtitle: '捕获到输出', icon: Network },
  { mode: 'inbox', label: '待整理', subtitle: '未结构化内容', icon: Archive },
  { mode: 'recommendationQueue', label: '推荐队列', subtitle: '模型建议', icon: Sparkles },
  { mode: 'healthRisks', label: '健康风险', subtitle: '阻塞与弱连接', icon: Activity },
  { mode: 'archiveEvidence', label: '归档证据', subtitle: '默认不污染视图', icon: Archive },
  { mode: 'customViews', label: '自定义视图', subtitle: '用户保存视图', icon: LayoutGrid },
]

const LIBRARY_TABS = [
  { key: 'map', label: '总览地图', icon: LayoutGrid },
  { key: 'database', label: '数据库', icon: ListFilter },
  { key: 'kanban', label: '看板', icon: FolderKanban },
  { key: 'chart', label: '图表', icon: BarChart3 },
  { key: 'custom', label: '自定义', icon: Settings2 },
] as const

const WAR_ROOM_TABS = [
  { key: 'kanban', label: '看板', icon: FolderKanban },
  { key: 'database', label: '数据库', icon: ListFilter },
  { key: 'chart', label: '图表', icon: LineChart },
  { key: 'custom', label: '自定义', icon: Settings2 },
] as const

export default function DockView({
  userId,
  onOpenEditor,
  onToast,
  onFocusMindNode,
  initialHealthFilter,
}: {
  userId: string
  onOpenEditor?: (documentId: number, sourceType: 'draft' | 'document') => void
  onToast?: (msg: string) => void
  onFocusMindNode?: (nodeId: string) => void
  initialHealthFilter?: string | null
}) {
  const { data: dockData, loading, error } = useDockData(userId)
  const vm = useDockViewModel(userId)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [inspectorExpanded, setInspectorExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState<MenuKey>(null)
  const [openDialog, setOpenDialog] = useState(false)
  const [openQuery, setOpenQuery] = useState('')
  const [titleOnly, setTitleOnly] = useState(false)
  const [dialogFilter, setDialogFilter] = useState<DialogFilter>('all')
  const [dialogSort, setDialogSort] = useState<'recent' | 'title'>('recent')
  const [selectedDialogId, setSelectedDialogId] = useState<string | null>(null)
  const [relatedMindNode, setRelatedMindNode] = useState<StoredMindNode | null>(null)

  function hideInspector() {
    setInspectorExpanded(false)
    setSelectedItemId(null)
  }

  useEffect(() => {
    if (!initialHealthFilter) return
    vm.setNavigationMode('healthRisks')
    vm.setHealthFilter(initialHealthFilter as DockRiskCategory)
  }, [initialHealthFilter, vm])

  const allItems = useMemo(() => buildDockItems(dockData), [dockData])

  const itemsById = useMemo(() => new Map(allItems.map((item) => [item.id, item])), [allItems])

  const itemByReferenceId = useMemo(() => {
    const map = new Map<string, DockPresentationItem>()
    allItems.forEach((item) => {
      const entity = item.entity
      if (!entity) return
      const ref = String(
        entity.entryId ??
          entity.documentId ??
          entity.draftId ??
          entity.tipId ??
          entity.mindNodeId ??
          entity.collectionId ??
          entity.tagId ??
          '',
      )
      if (ref) {
        map.set(ref, item)
      }
    })
    return map
  }, [allItems])

  const scopeCandidates = useMemo(
    () =>
      allItems
        .filter((item) => item.kind === 'project' || item.kind === 'topic')
        .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0)),
    [allItems],
  )

  useEffect(() => {
    if (vm.navigationMode !== 'warRoom') return
    if (vm.filters.selectedScope) return
    if (scopeCandidates.length === 0) return
    vm.updateFilters({ selectedScope: scopeCandidates[0].title })
  }, [scopeCandidates, vm])

  const sharedFilteredItems = useMemo(
    () => applyDockSharedFilters(allItems, vm.filters),
    [allItems, vm.filters],
  )

  const navigationCounts = useMemo(
    () => buildNavigationCounts(sharedFilteredItems, vm.filters.includeArchive),
    [sharedFilteredItems, vm.filters.includeArchive],
  )

  const currentItems = useMemo(
    () => sortDockItems(getNavigationItems(sharedFilteredItems, vm.navigationMode, vm.filters.includeArchive), vm.settings.defaultSort),
    [sharedFilteredItems, vm.navigationMode, vm.filters.includeArchive, vm.settings.defaultSort],
  )

  const warRoomItems = useMemo(
    () => currentItems.filter((item) => item.kind !== 'project' && item.kind !== 'topic'),
    [currentItems],
  )

  const selectedItem = selectedItemId ? itemsById.get(selectedItemId) ?? null : null

  useEffect(() => {
    if (!selectedItem) {
      setInspectorExpanded(false)
      return
    }
    if (!currentItems.some((item) => item.id === selectedItem.id)) {
      setSelectedItemId(null)
      setInspectorExpanded(false)
      return
    }
    setInspectorExpanded(true)
  }, [currentItems, selectedItem])

  useEffect(() => {
    const entity = resolveActionTarget(selectedItem, itemByReferenceId)?.entity
    if (!entity) {
      setRelatedMindNode(null)
      return
    }
    findRelatedMindNode(userId, entity)
      .then((node) => setRelatedMindNode(node))
      .catch(() => setRelatedMindNode(null))
  }, [itemByReferenceId, selectedItem, userId])

  const selectedScopeLabel = vm.filters.selectedScope
  const selectedScope = scopeCandidates.find((item) => item.title === selectedScopeLabel) ?? null
  const selectedRecommendations = useMemo(() => {
    if (!selectedItem) return []
    return selectedItem.relatedRecommendationIds
      .map((id) => dockData.recommendations.find((recommendation) => recommendation.id === id) ?? null)
      .filter((value): value is NonNullable<typeof value> => value !== null)
  }, [dockData.recommendations, selectedItem])

  const availableStatuses = useMemo(
    () => Array.from(new Set(allItems.map((item) => item.status))).sort(),
    [allItems],
  )
  const availableTags = useMemo(
    () => Array.from(new Set(allItems.flatMap((item) => item.tags))).sort((a, b) => a.localeCompare(b)),
    [allItems],
  )

  const dialogResults = useMemo(() => {
    const query = openQuery.trim().toLowerCase()
    return allItems
      .filter((item) => item.kind === 'project' || item.kind === 'topic' || ((item.kind === 'document' || item.kind === 'draft') && !item.scopeTitle))
      .filter((item) => {
        if (dialogFilter === 'scope') return item.kind === 'project' || item.kind === 'topic'
        if (dialogFilter === 'scatter') return item.kind === 'document' || item.kind === 'draft'
        return true
      })
      .filter((item) => {
        if (!query) return true
        const haystack = titleOnly ? item.title.toLowerCase() : `${item.title} ${item.path} ${item.summary}`.toLowerCase()
        return haystack.includes(query)
      })
      .sort((a, b) => {
        if (dialogSort === 'title') return a.title.localeCompare(b.title)
        return (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0)
      })
  }, [allItems, dialogFilter, dialogSort, openQuery, titleOnly])

  useEffect(() => {
    if (dialogResults.length === 0) {
      setSelectedDialogId(null)
      return
    }
    if (!selectedDialogId || !dialogResults.some((item) => item.id === selectedDialogId)) {
      setSelectedDialogId(dialogResults[0].id)
    }
  }, [dialogResults, selectedDialogId])

  const selectedDialogItem = selectedDialogId ? itemsById.get(selectedDialogId) ?? null : null

  const handlePrimaryAction = async (item: DockPresentationItem) => {
    setSelectedItemId(item.id)
    if (item.kind === 'project' || item.kind === 'topic') {
      vm.setNavigationMode('warRoom')
      vm.updateFilters({ selectedScope: item.title })
      return
    }
    if (item.primaryAction === 'continueEditing') {
      await handleOpenEditor(item)
      return
    }
    if (item.primaryAction === 'openInMind') {
      await handleOpenMind(item)
      return
    }
    if (item.primaryAction === 'review' || item.primaryAction === 'organize' || item.primaryAction === 'open') {
      setInspectorExpanded(true)
    }
  }

  const handleOpenDialogItem = (item: DockPresentationItem) => {
    if (item.kind === 'project' || item.kind === 'topic') {
      vm.setNavigationMode('warRoom')
      vm.updateFilters({ selectedScope: item.title })
      setOpenDialog(false)
      return
    }
    vm.setNavigationMode('libraryOverview')
    vm.setLibraryView('database')
    setSelectedItemId(item.id)
    setInspectorExpanded(true)
    setOpenDialog(false)
  }

  async function handleOpenEditor(item = selectedItem) {
    if (!item || !onOpenEditor) return
    const target = resolveActionTarget(item, itemByReferenceId)
    if (!target?.entity) {
      onToast?.('当前对象暂不支持打开 Editor')
      return
    }
    await executeDockEditorOpen(target.entity, userId, onOpenEditor, onToast)
  }

  async function handleOpenMind(item = selectedItem) {
    if (!item) return
    const target = resolveActionTarget(item, itemByReferenceId)
    if (!target?.entity) {
      onToast?.('当前对象暂不支持打开 Mind')
      return
    }
    if (target.entity.type === 'mindNode' && target.entity.mindNodeId) {
      onFocusMindNode?.(target.entity.mindNodeId)
      return
    }
    if (relatedMindNode) {
      onFocusMindNode?.(relatedMindNode.id)
      return
    }
    if (target.entity.type === 'tip' && target.entity.tipId) {
      try {
        const { mindNode } = await convertTipToMindNode(userId, target.entity.tipId)
        if (mindNode) {
          emit({ type: 'mind_node_created', nodeId: mindNode.id })
          onFocusMindNode?.(mindNode.id)
          return
        }
      } catch {
        onToast?.('创建 Mind 节点失败')
        return
      }
    }
    try {
      const node = await upsertMindNode({
        userId,
        nodeType: target.entity.type === 'document' ? 'document' : 'topic',
        label: target.entity.title,
        documentId: target.entity.entryId ?? target.entity.documentId ?? null,
        state: 'drifting',
      })
      emit({ type: 'mind_node_created', nodeId: node.id })
      onFocusMindNode?.(node.id)
    } catch {
      onToast?.('创建 Mind 节点失败')
    }
  }

  const headerTitle =
    vm.navigationMode === 'warRoom'
      ? `Dock / ${selectedScope?.title ?? '项目作战室'}`
      : vm.navigationMode === 'libraryOverview'
        ? 'Dock / 全库总览'
        : `Dock / ${NAV_ITEMS.find((item) => item.mode === vm.navigationMode)?.label ?? 'Dock'}`

  const headerDescription =
    vm.navigationMode === 'libraryOverview'
      ? '这是知识库全局地图，用于查看、搜索并进驻所有项目、主题、文档、信号与推荐。它不等同于项目管理页。'
      : vm.navigationMode === 'warRoom'
        ? '项目推进相关内容只在项目作战室中呈现。当前视图基于现有知识对象前端派生，不伪装成独立任务系统。'
        : NAV_ITEMS.find((item) => item.mode === vm.navigationMode)?.subtitle ?? '知识库视图'

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0b0f11] text-[#e6eaed]">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5">
            <BookOpen className="h-5 w-5 text-[#86d7ff]" />
          </div>
          <span className="text-xs text-[#899298]">加载 Dock 数据...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden bg-[#0b0f11] text-[#e6eaed]">
      <aside className="flex w-[252px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0d1215]">
        <div className="px-4 py-5">
          <div className="text-[26px] font-semibold leading-none">Dock</div>
          <div className="mt-1 text-[12px] text-[#8d989f]">知识库总控台 + 分诊地图</div>
        </div>
        <div className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((navItem) => {
            const Icon = navItem.icon
            const isActive = vm.navigationMode === navItem.mode
            const count = navigationCounts[navItem.mode]
            return (
              <button
                key={navItem.mode}
                onClick={() => {
                  vm.setNavigationMode(navItem.mode)
                  if (navItem.mode !== 'healthRisks') {
                    vm.setHealthFilter(null)
                  }
                }}
                className={`flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors ${
                  isActive
                    ? 'border-[#86d7ff]/30 bg-[#86d7ff]/10 text-white'
                    : 'border-transparent text-[#a3afb7] hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-medium">{navItem.label}</span>
                  <span className="block truncate text-[10px] text-[#8d989f]">{navItem.subtitle}</span>
                </span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${isActive ? 'bg-[#86d7ff]/20 text-[#86d7ff]' : 'bg-white/10 text-[#8d989f]'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
        <div className="p-3">
          <div className="rounded-[12px] border border-white/[0.07] bg-[#111619] p-3">
            <div className="text-[12px] font-medium text-white">Dock 规则</div>
            <div className="mt-2 text-[10px] leading-relaxed text-[#8d989f]">
              全库总览默认展示数据库视图。项目指标条与看板只在项目作战室中出现。
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-white/[0.07] bg-[#0d1215] px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[30px] font-semibold leading-none">{headerTitle}</div>
              <div className="mt-2 max-w-3xl text-[12px] leading-relaxed text-[#8d989f]">{headerDescription}</div>
            </div>
            <div className="flex items-center gap-2">
              {error && (
                <span className="rounded-md border border-[#ffb4ab]/20 bg-[#ffb4ab]/10 px-2 py-1 text-[10px] text-[#ffb4ab]">
                  数据加载异常
                </span>
              )}
              <button
                onClick={() => setOpenDialog(true)}
                className="flex h-[34px] items-center gap-1.5 rounded-[8px] border border-white/[0.08] bg-white/5 px-3 text-[12px] text-[#e6eaed] hover:bg-white/10"
              >
                <Plus className="h-3.5 w-3.5" /> 打开项目或散点文档
              </button>
            </div>
          </div>
        </div>

        {vm.navigationMode === 'warRoom' && (
          <div className="border-b border-white/[0.07] bg-[#0e1316] px-4 py-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#8d989f]">项目作战室 Scope</div>
            <div className="flex items-center gap-2 overflow-x-auto">
              {scopeCandidates.map((scope) => (
                <button
                  key={scope.id}
                  onClick={() => vm.updateFilters({ selectedScope: scope.title })}
                  className={`flex shrink-0 items-center gap-2 rounded-[8px] border px-3 py-2 text-[12px] ${
                    selectedScope?.id === scope.id
                      ? 'border-[#86d7ff]/30 bg-[#86d7ff]/10 text-white'
                      : 'border-white/[0.08] bg-white/[0.03] text-[#c7d0d6] hover:bg-white/[0.05]'
                  }`}
                >
                  {scope.title}
                </button>
              ))}
              <button
                onClick={() => setOpenDialog(true)}
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[8px] border border-white/[0.08] bg-white/[0.03] text-[#8d989f] hover:bg-white/[0.06] hover:text-white"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 text-[11px] text-[#8d989f]">项目作战室 / {WAR_ROOM_TABS.find((item) => item.key === vm.warRoomView)?.label ?? '看板'}</div>
          </div>
        )}

        <div className="border-b border-white/[0.07] bg-[#0e1316] px-4 py-3">
          <div className="flex items-center gap-2">
            {(vm.navigationMode === 'libraryOverview' ? LIBRARY_TABS : vm.navigationMode === 'warRoom' ? WAR_ROOM_TABS : []).map((tab) => {
              const Icon = tab.icon
              const isActive = vm.navigationMode === 'libraryOverview' ? vm.libraryView === tab.key : vm.warRoomView === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    if (vm.navigationMode === 'libraryOverview') {
                      vm.setLibraryView(tab.key as typeof vm.libraryView)
                    } else {
                      vm.setWarRoomView(tab.key as typeof vm.warRoomView)
                    }
                  }}
                  className={`flex h-[34px] items-center gap-1.5 rounded-[8px] border px-3 text-[12px] ${
                    isActive
                      ? 'border-[#86d7ff]/35 bg-[#86d7ff]/10 text-white'
                      : 'border-white/[0.08] bg-white/[0.03] text-[#b8c3ca] hover:bg-white/[0.05] hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[280px] flex-1 max-w-[420px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8d989f]" />
              <input
                value={vm.filters.query}
                onChange={(event) => vm.updateFilters({ query: event.target.value })}
                placeholder="搜索名称、内容、标签、来源等..."
                className="h-[36px] w-full rounded-[8px] border border-white/[0.08] bg-white/[0.03] pl-9 pr-3 text-[12px] text-white outline-none placeholder:text-[#7d8790]"
              />
            </div>
            <MenuButton
              label={`类型${vm.filters.itemKinds.length > 0 ? ` (${vm.filters.itemKinds.length})` : ''}`}
              open={menuOpen === 'types'}
              onToggle={() => setMenuOpen((prev) => (prev === 'types' ? null : 'types'))}
            >
              {(['project', 'topic', 'document', 'signal', 'draft', 'mindNode', 'recommendation', 'archiveEvidence'] as DockPresentationKind[]).map((kind) => (
                <label key={kind} className="flex items-center gap-2 px-1 py-1 text-[11px] text-[#d6dde2]">
                  <input
                    type="checkbox"
                    checked={vm.filters.itemKinds.includes(kind)}
                    onChange={() => vm.toggleItemKind(kind)}
                    className="accent-[#86d7ff]"
                  />
                  {getDockKindLabel(kind)}
                </label>
              ))}
            </MenuButton>
            <MenuButton
              label={`状态${vm.filters.statuses.length > 0 ? ` (${vm.filters.statuses.length})` : ''}`}
              open={menuOpen === 'statuses'}
              onToggle={() => setMenuOpen((prev) => (prev === 'statuses' ? null : 'statuses'))}
            >
              {availableStatuses.map((status) => (
                <label key={status} className="flex items-center gap-2 px-1 py-1 text-[11px] text-[#d6dde2]">
                  <input
                    type="checkbox"
                    checked={vm.filters.statuses.includes(status)}
                    onChange={() => vm.toggleStatus(status)}
                    className="accent-[#86d7ff]"
                  />
                  {statusLabel(status)}
                </label>
              ))}
            </MenuButton>
            <MenuButton
              label={`标签${vm.filters.tags.length > 0 ? ` (${vm.filters.tags.length})` : ''}`}
              open={menuOpen === 'tags'}
              onToggle={() => setMenuOpen((prev) => (prev === 'tags' ? null : 'tags'))}
            >
              {availableTags.length === 0 && <div className="px-1 py-2 text-[11px] text-[#8d989f]">暂无标签</div>}
              {availableTags.map((tag) => (
                <label key={tag} className="flex items-center gap-2 px-1 py-1 text-[11px] text-[#d6dde2]">
                  <input
                    type="checkbox"
                    checked={vm.filters.tags.includes(tag)}
                    onChange={() => vm.toggleTag(tag)}
                    className="accent-[#86d7ff]"
                  />
                  #{tag}
                </label>
              ))}
            </MenuButton>
            <MenuButton
              label={vm.filters.timeRange === 'any' ? '时间' : `时间 · ${vm.filters.timeRange}`}
              open={menuOpen === 'time'}
              onToggle={() => setMenuOpen((prev) => (prev === 'time' ? null : 'time'))}
            >
              {(['any', '24h', '7d', '30d'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => {
                    vm.updateFilters({ timeRange: range })
                    setMenuOpen(null)
                  }}
                  className={`flex w-full items-center justify-between rounded px-1 py-1 text-[11px] ${
                    vm.filters.timeRange === range ? 'bg-[#86d7ff]/10 text-white' : 'text-[#d6dde2] hover:bg-white/[0.05]'
                  }`}
                >
                  <span>{range === 'any' ? '全部时间' : range}</span>
                  {vm.filters.timeRange === range && <ChevronRight className="h-3 w-3 text-[#86d7ff]" />}
                </button>
              ))}
            </MenuButton>
            <MenuButton
              label="更多筛选"
              open={menuOpen === 'more'}
              onToggle={() => setMenuOpen((prev) => (prev === 'more' ? null : 'more'))}
            >
              {[
                { value: 'all', label: '全部' },
                { value: 'recommendationBacked', label: '仅有推荐' },
                { value: 'unscoped', label: '仅散点对象' },
                { value: 'risks', label: '仅风险对象' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    vm.updateFilters({ moreFilter: option.value as typeof vm.filters.moreFilter })
                    setMenuOpen(null)
                  }}
                  className={`flex w-full items-center justify-between rounded px-1 py-1 text-[11px] ${
                    vm.filters.moreFilter === option.value ? 'bg-[#86d7ff]/10 text-white' : 'text-[#d6dde2] hover:bg-white/[0.05]'
                  }`}
                >
                  <span>{option.label}</span>
                  {vm.filters.moreFilter === option.value && <ChevronRight className="h-3 w-3 text-[#86d7ff]" />}
                </button>
              ))}
              <div className="my-2 h-px bg-white/10" />
              <label className="flex items-center gap-2 px-1 py-1 text-[11px] text-[#d6dde2]">
                <input
                  type="checkbox"
                  checked={vm.filters.includeArchive}
                  onChange={() => vm.updateFilters({ includeArchive: !vm.filters.includeArchive })}
                  className="accent-[#86d7ff]"
                />
                全库总览包含归档证据
              </label>
            </MenuButton>
            <button
              onClick={() => {
                vm.resetFilters()
                setMenuOpen(null)
              }}
              className="h-[34px] rounded-[8px] px-3 text-[12px] text-[#8d989f] hover:bg-white/[0.05] hover:text-white"
            >
              重置
            </button>
            <span className="ml-auto text-[12px] text-[#8d989f]">共 {currentItems.length} 项</span>
            <MenuButton
              label="视图设置"
              open={menuOpen === 'settings'}
              onToggle={() => setMenuOpen((prev) => (prev === 'settings' ? null : 'settings'))}
              icon={<Settings2 className="h-3.5 w-3.5" />}
              align="right"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8d989f]">列显示</div>
              {[
                { key: 'space' as const, label: '所属域 / 项目' },
                { key: 'status' as const, label: '状态' },
                { key: 'tags' as const, label: '标签' },
                { key: 'score' as const, label: '最近更新' },
                { key: 'recommendations' as const, label: '推荐动作' },
              ].map((column) => (
                <label key={column.key} className="mt-1 flex items-center gap-2 text-[11px] text-[#d6dde2]">
                  <input
                    type="checkbox"
                    checked={vm.settings.columnVisibility[column.key]}
                    onChange={() =>
                      vm.updateSettings({
                        columnVisibility: {
                          ...vm.settings.columnVisibility,
                          [column.key]: !vm.settings.columnVisibility[column.key],
                        },
                      })
                    }
                    className="accent-[#86d7ff]"
                  />
                  {column.label}
                </label>
              ))}
              <div className="my-2 h-px bg-white/10" />
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8d989f]">密度</div>
              <div className="mt-1 flex gap-2">
                {(['compact', 'standard'] as const).map((density) => (
                  <button
                    key={density}
                    onClick={() => vm.updateSettings({ density })}
                    className={`flex-1 rounded px-2 py-1 text-[11px] ${
                      vm.settings.density === density ? 'bg-[#86d7ff]/10 text-white' : 'bg-white/[0.04] text-[#c7d0d6]'
                    }`}
                  >
                    {density === 'compact' ? '紧凑' : '标准'}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-[#8d989f]">排序</div>
              {[
                { key: 'updatedAt', label: '最近更新' },
                { key: 'type', label: '类型' },
                { key: 'healthScore', label: '风险优先' },
              ].map((sort) => (
                <button
                  key={sort.key}
                  onClick={() => vm.updateSettings({ defaultSort: sort.key as typeof vm.settings.defaultSort })}
                  className={`mt-1 flex w-full items-center justify-between rounded px-1 py-1 text-[11px] ${
                    vm.settings.defaultSort === sort.key ? 'bg-[#86d7ff]/10 text-white' : 'text-[#d6dde2] hover:bg-white/[0.05]'
                  }`}
                >
                  <span>{sort.label}</span>
                  {vm.settings.defaultSort === sort.key && <ChevronRight className="h-3 w-3 text-[#86d7ff]" />}
                </button>
              ))}
            </MenuButton>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <section
            data-testid="dock-main-panel"
            className="flex min-w-0 flex-1 flex-col overflow-hidden"
            onClick={() => {
              if (inspectorExpanded) hideInspector()
            }}
          >
            {vm.navigationMode === 'warRoom' && vm.warRoomView === 'kanban' ? (
              <WarRoomKanban
                items={warRoomItems}
                selectedItemId={selectedItemId}
                onSelect={(item) => {
                  setSelectedItemId(item.id)
                  setInspectorExpanded(true)
                }}
                onOpen={handlePrimaryAction}
              />
            ) : vm.navigationMode === 'libraryOverview' && vm.libraryView !== 'database' ? (
              <PlaceholderView
                icon={LIBRARY_TABS.find((item) => item.key === vm.libraryView)?.icon ?? LayoutGrid}
                title={LIBRARY_TABS.find((item) => item.key === vm.libraryView)?.label ?? '视图'}
                body="本轮保留真实切换与当前筛选上下文。数据库视图为完整实现，其余视图提供轻量派生与空态，不伪装成完整系统。"
                count={currentItems.length}
              />
            ) : vm.navigationMode === 'warRoom' && vm.warRoomView !== 'database' ? (
              <PlaceholderView
                icon={WAR_ROOM_TABS.find((item) => item.key === vm.warRoomView)?.icon ?? FolderKanban}
                title={WAR_ROOM_TABS.find((item) => item.key === vm.warRoomView)?.label ?? '视图'}
                body="项目作战室的数据库与看板以现有知识对象前端派生。图表与自定义视图本轮保留入口与上下文，不伪造完整任务分析系统。"
                count={warRoomItems.length}
              />
            ) : (
              <DockDatabaseTable
                items={currentItems}
                density={vm.settings.density}
                columnVisibility={vm.settings.columnVisibility}
                selectedItemId={selectedItemId}
                onSelect={(item) => {
                  setSelectedItemId(item.id)
                  setInspectorExpanded(true)
                }}
                onOpen={handlePrimaryAction}
              />
            )}
          </section>
          {inspectorExpanded && selectedItem && (
            <aside
              data-testid="dock-inspector-panel"
              className="absolute inset-y-0 right-0 z-20 w-[320px] border-l border-white/[0.07] bg-[#0d1215] shadow-[-24px_0_64px_rgba(0,0,0,0.45)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8d989f]">Inspector</div>
                    <div className="mt-1 text-[12px] text-[#899298]">{getDockKindLabel(selectedItem.kind)}</div>
                  </div>
                  <button
                    aria-label="关闭 Inspector"
                    onClick={hideInspector}
                    className="rounded p-1 text-[#899298] hover:bg-white/[0.06] hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <InspectorSection title={selectedItem.title}>
                    <div className="text-[11px] text-[#8d989f]">
                      {getDockKindLabel(selectedItem.kind)} · {statusLabel(selectedItem.status)} · {selectedItem.scopeTitle ?? '散点'} · {formatRelativeTime(selectedItem.updatedAt)}
                    </div>
                  </InspectorSection>

                  <InspectorSection title="Page 概览">
                    <div className="text-[12px] leading-relaxed text-[#d6dde2]">{selectedItem.summary}</div>
                    <div className="mt-2 text-[11px] text-[#8d989f]">{selectedItem.path}</div>
                  </InspectorSection>

                  <InspectorSection title="文档信息">
                    <InfoRow label="类型" value={getDockKindLabel(selectedItem.kind)} />
                    <InfoRow label="状态" value={statusLabel(selectedItem.status)} />
                    <InfoRow label="所属域 / 项目" value={selectedItem.scopeTitle ?? '—'} />
                    <InfoRow label="更新时间" value={formatRelativeTime(selectedItem.updatedAt)} />
                    <InfoRow label="标签" value={selectedItem.tags.length > 0 ? selectedItem.tags.map((tag) => `#${tag}`).join(' ') : '—'} />
                  </InspectorSection>

                  <InspectorSection title="模型 / 算法推荐">
                    {selectedRecommendations.length > 0 ? (
                      <div className="space-y-2">
                        {selectedRecommendations.slice(0, 3).map((recommendation) => (
                          <div key={recommendation.id} className="rounded-[10px] border border-white/[0.07] bg-white/[0.03] p-3">
                            <div className="text-[12px] font-medium text-white">{recommendation.action}</div>
                            <div className="mt-1 text-[11px] text-[#8d989f]">{recommendation.reasonSummary.reason}</div>
                            <div className="mt-2 text-[10px] text-[#86d7ff]">{statusLabel(recommendation.status)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[10px] border border-dashed border-white/[0.07] bg-white/[0.02] p-3 text-[11px] text-[#8d989f]">
                        当前对象暂无可展示推荐。
                      </div>
                    )}
                  </InspectorSection>

                  <InspectorSection title="快速操作">
                    <div className="space-y-2">
                      <button
                        onClick={() => handleOpenEditor()}
                        disabled={!canOpenEditor(resolveActionTarget(selectedItem, itemByReferenceId))}
                        className="flex h-[32px] w-full items-center justify-center gap-1.5 rounded-[8px] bg-white text-[12px] font-medium text-[#0b0f11] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <PenTool className="h-3.5 w-3.5" /> 在 Editor 中打开
                      </button>
                      <button
                        onClick={() => handleOpenMind()}
                        disabled={!canOpenMind(resolveActionTarget(selectedItem, itemByReferenceId))}
                        className="flex h-[32px] w-full items-center justify-center gap-1.5 rounded-[8px] bg-white/10 text-[12px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Brain className="h-3.5 w-3.5" /> 在 Mind 中查看
                      </button>
                      {!canOpenEditor(resolveActionTarget(selectedItem, itemByReferenceId)) && (
                        <div className="text-[10px] text-[#8d989f]">当前对象暂无可用 Editor 跳转。</div>
                      )}
                    </div>
                  </InspectorSection>
                </div>
              </div>
            </aside>
          )}
        </div>
      </main>

      {openDialog && (
        <DockOpenDialog
          items={dialogResults}
          selectedId={selectedDialogId}
          onSelect={setSelectedDialogId}
          onOpen={handleOpenDialogItem}
          onClose={() => setOpenDialog(false)}
          query={openQuery}
          onQueryChange={setOpenQuery}
          titleOnly={titleOnly}
          onTitleOnlyChange={setTitleOnly}
          filter={dialogFilter}
          onFilterChange={setDialogFilter}
          sortMode={dialogSort}
          onSortModeChange={setDialogSort}
          selectedItem={selectedDialogItem}
        />
      )}
    </div>
  )
}

function resolveActionTarget(
  item: DockPresentationItem | null,
  itemByReferenceId: Map<string, DockPresentationItem>,
): DockPresentationItem | null {
  if (!item) return null
  if (item.entity) return item
  if (item.recommendation) {
    return itemByReferenceId.get(String(item.recommendation.subjectId)) ?? null
  }
  return null
}

function canOpenEditor(item: DockPresentationItem | null): boolean {
  const entity = item?.entity
  if (!entity) return false
  return Boolean(entity.entryId || entity.draftId || entity.tipId || entity.documentId)
}

function canOpenMind(item: DockPresentationItem | null): boolean {
  const entity = item?.entity
  return Boolean(entity)
}

function DockDatabaseTable({
  items,
  density,
  columnVisibility,
  selectedItemId,
  onSelect,
  onOpen,
}: {
  items: DockPresentationItem[]
  density: 'compact' | 'standard'
  columnVisibility: {
    space: boolean
    status: boolean
    tags: boolean
    recommendations: boolean
    score: boolean
  }
  selectedItemId: string | null
  onSelect: (item: DockPresentationItem) => void
  onOpen: (item: DockPresentationItem) => void | Promise<void>
}) {
  const rowHeight = density === 'compact' ? 'h-[40px]' : 'h-[52px]'

  const visibleColumns = [
    { key: 'title', label: '名称', width: 'minmax(220px,2.2fr)' },
    { key: 'type', label: '类型', width: '120px' },
    columnVisibility.space && { key: 'space', label: '所属域 / 项目', width: 'minmax(130px,1.3fr)' },
    columnVisibility.status && { key: 'status', label: '状态', width: '110px' },
    columnVisibility.tags && { key: 'tags', label: '标签', width: 'minmax(150px,1.2fr)' },
    columnVisibility.score && { key: 'updatedAt', label: '最近更新', width: '140px' },
    columnVisibility.recommendations && { key: 'action', label: '推荐动作', width: '130px' },
  ].filter(Boolean) as Array<{ key: string; label: string; width: string }>

  const gridTemplateColumns = visibleColumns.map((col) => col.width).join(' ')

  function renderCell(item: DockPresentationItem, columnKey: string) {
    switch (columnKey) {
      case 'title': {
        const Icon = getKindIcon(item.kind)
        return (
          <div className="flex min-w-0 items-center gap-2 pr-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/[0.07] bg-white/[0.04] text-[#86d7ff]">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium text-white">{item.title}</div>
            </div>
          </div>
        )
      }
      case 'type':
        return <div className="truncate text-[11px] text-[#c7d0d6]">{getDockKindLabel(item.kind)}</div>
      case 'space':
        return <div className="truncate text-[11px] text-[#8d989f]">{item.scopeTitle ?? '—'}</div>
      case 'status':
        return <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusClass(item.status)}`}>{statusLabel(item.status)}</span>
      case 'tags':
        return <div className="truncate text-[11px] text-[#8d989f]">{maxThreeTags(item.tags).map((tag) => `#${tag}`).join(' ') || '—'}</div>
      case 'updatedAt':
        return <div className="text-[11px] text-[#8d989f]">{formatRelativeTime(item.updatedAt)}</div>
      case 'action':
        return (
          <button
            onClick={(event) => {
              event.stopPropagation()
              void onOpen(item)
            }}
            className="rounded-[8px] border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] text-white hover:bg-white/[0.08]"
          >
            {getDockPrimaryActionLabel(item.primaryAction)}
          </button>
        )
      default:
        return null
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="rounded-[14px] border border-dashed border-white/[0.08] bg-white/[0.02] px-6 py-8 text-center">
          <div className="text-[12px] text-white">暂无匹配内容</div>
          <div className="mt-1 text-[11px] text-[#8d989f]">当前导航与筛选组合下没有结果。</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="grid border-b border-white/[0.06] bg-[#0b0f11] px-4 py-2 text-[11px] font-medium text-[#8d989f]"
        style={{ gridTemplateColumns }}
      >
        {visibleColumns.map((col) => (
          <div key={col.key}>{col.label}</div>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        {items.map((item) => (
          <div
            key={item.id}
            onClick={(event) => {
              event.stopPropagation()
              onSelect(item)
            }}
            onDoubleClick={(event) => {
              event.stopPropagation()
              void onOpen(item)
            }}
            className={`grid cursor-pointer items-center border-b border-white/[0.05] px-4 transition-colors ${
              selectedItemId === item.id ? 'bg-[#86d7ff]/10' : 'hover:bg-white/[0.025]'
            } ${rowHeight}`}
            style={{ gridTemplateColumns }}
          >
            {visibleColumns.map((col) => (
              <div key={col.key}>{renderCell(item, col.key)}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function WarRoomKanban({
  items,
  selectedItemId,
  onSelect,
  onOpen,
}: {
  items: DockPresentationItem[]
  selectedItemId: string | null
  onSelect: (item: DockPresentationItem) => void
  onOpen: (item: DockPresentationItem) => void | Promise<void>
}) {
  const groups = {
    backlog: items.filter((item) => item.warRoomStage === 'backlog'),
    inProgress: items.filter((item) => item.warRoomStage === 'inProgress'),
    review: items.filter((item) => item.warRoomStage === 'review'),
    done: items.filter((item) => item.warRoomStage === 'done'),
    blocked: items.filter((item) => item.warRoomStage === 'blocked'),
  }
  const metrics = [
    { label: '任务总数', value: items.length },
    { label: '已完成', value: groups.done.length },
    { label: '进行中', value: groups.inProgress.length },
    { label: '阻塞中', value: groups.blocked.length },
    { label: '风险任务', value: items.filter((item) => item.isRisk).length },
    { label: '预计交付', value: '暂无预测' },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid grid-cols-6 gap-3 border-b border-white/[0.06] px-4 py-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-[12px] border border-white/[0.07] bg-white/[0.03] p-3">
            <div className="text-[10px] uppercase tracking-wider text-[#8d989f]">{metric.label}</div>
            <div className="mt-2 text-[22px] font-semibold text-white">{metric.value}</div>
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-4 gap-3 overflow-x-auto px-4 py-4">
        {[
          { key: 'backlog', label: 'Backlog', items: groups.backlog },
          { key: 'inProgress', label: 'In Progress', items: groups.inProgress },
          { key: 'review', label: 'Review', items: groups.review },
          { key: 'done', label: 'Done', items: groups.done },
        ].map((column) => (
          <div key={column.key} className="flex min-h-0 min-w-[220px] flex-col rounded-[14px] border border-white/[0.07] bg-[#0f1417]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-3">
              <div className="text-[12px] font-medium text-white">{column.label}</div>
              <div className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-[#8d989f]">{column.items.length}</div>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {column.items.length === 0 && <div className="rounded-[10px] border border-dashed border-white/[0.07] bg-white/[0.02] p-3 text-[11px] text-[#8d989f]">暂无项目对象</div>}
              {column.items.map((item) => (
                <div
                  key={item.id}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect(item)
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    void onOpen(item)
                  }}
                  className={`cursor-pointer rounded-[10px] border p-3 transition-colors ${
                    selectedItemId === item.id
                      ? 'border-[#86d7ff]/30 bg-[#86d7ff]/10'
                      : 'border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="text-[12px] font-medium text-white">{item.title}</div>
                  <div className="mt-1 text-[10px] text-[#8d989f]">{getDockKindLabel(item.kind)}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {maxThreeTags(item.tags).map((tag) => (
                      <span key={tag} className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-[#9aa4ac]">
                        #{tag}
                      </span>
                    ))}
                    {item.tags.length === 0 && <span className="text-[10px] text-[#71808a]">无标签</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlaceholderView({
  icon: Icon,
  title,
  body,
  count,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
  count: number
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-xl rounded-[16px] border border-white/[0.07] bg-white/[0.03] p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.04] text-[#86d7ff]">
          <Icon className="h-6 w-6" />
        </div>
        <div className="mt-4 text-[16px] font-semibold text-white">{title}</div>
        <div className="mt-2 text-[12px] leading-relaxed text-[#8d989f]">{body}</div>
        <div className="mt-4 text-[11px] text-[#86d7ff]">当前筛选结果 {count} 项</div>
      </div>
    </div>
  )
}

function DockOpenDialog({
  items,
  selectedId,
  selectedItem,
  onSelect,
  onOpen,
  onClose,
  query,
  onQueryChange,
  titleOnly,
  onTitleOnlyChange,
  filter,
  onFilterChange,
  sortMode,
  onSortModeChange,
}: {
  items: DockPresentationItem[]
  selectedId: string | null
  selectedItem: DockPresentationItem | null
  onSelect: (id: string) => void
  onOpen: (item: DockPresentationItem) => void
  onClose: () => void
  query: string
  onQueryChange: (value: string) => void
  titleOnly: boolean
  onTitleOnlyChange: (value: boolean) => void
  filter: DialogFilter
  onFilterChange: (value: DialogFilter) => void
  sortMode: 'recent' | 'title'
  onSortModeChange: (value: 'recent' | 'title') => void
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#05080a]/65 backdrop-blur-sm">
      <div className="flex h-[76vh] w-[1040px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#11171b]/96 shadow-[0_32px_100px_rgba(0,0,0,0.7)]">
        <div className="border-b border-white/[0.07] px-6 py-4">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">打开项目或散点文档</h2>
              <p className="mt-1 text-[12px] text-[#899298]">项目会切换当前视图；散点文档只作为独立对象打开，不进入项目目录。</p>
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
              className={`rounded-md border px-2.5 py-1.5 hover:bg-white/[0.07] ${titleOnly ? 'border-[#86d7ff]/35 bg-[#86d7ff]/10 text-[#86d7ff]' : 'border-white/[0.07] bg-white/[0.035]'}`}
            >
              Title only
            </button>
            <button className="cursor-not-allowed rounded-md border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-[#899298]">
              Created by <span className="text-white">Me</span>
            </button>
            <button
              onClick={() => onFilterChange(filter === 'all' ? 'scope' : filter === 'scope' ? 'scatter' : 'all')}
              className="rounded-md border border-white/[0.07] bg-white/[0.035] px-2.5 py-1.5 hover:bg-white/[0.07]"
            >
              In <span className="text-white">{filter === 'all' ? 'All' : filter === 'scope' ? 'Projects' : 'Scatter'}</span>
            </button>
            <button
              onClick={() => onFilterChange(filter === 'scatter' ? 'all' : 'scatter')}
              className={`rounded-md border px-2.5 py-1.5 hover:bg-white/[0.07] ${filter === 'scatter' ? 'border-[#86d7ff]/35 bg-[#86d7ff]/10 text-[#86d7ff]' : 'border-white/[0.07] bg-white/[0.035]'}`}
            >
              <Filter className="mr-1 inline h-3 w-3" />
              Filter
            </button>
            <button
              onClick={() => {
                onTitleOnlyChange(false)
                onFilterChange('all')
                onSortModeChange('recent')
              }}
              className="rounded-md border border-white/[0.07] bg-white/[0.035] px-2.5 py-1.5 hover:bg-white/[0.07]"
            >
              More <span className="text-[#899298]">Reset</span>
            </button>
            <button onClick={() => onSortModeChange(sortMode === 'recent' ? 'title' : 'recent')} className="ml-auto rounded-md px-2.5 py-1.5 text-[#899298] hover:bg-white/[0.06]">
              Sort by <span className="text-white">{sortMode === 'recent' ? '最近打开' : '标题 A-Z'}</span>
            </button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[46%_54%]">
          <div className="min-h-0 border-r border-white/[0.07]">
            <div className="flex items-center justify-between px-4 py-3 text-[11px] text-[#899298]">
              <span>结果列表</span>
              <span>{items.length} 个结果</span>
            </div>
            <div className="h-[calc(100%-42px)] overflow-y-auto custom-scrollbar px-2 pb-3">
              {items.map((item) => {
                const Icon = getKindIcon(item.kind)
                return (
                  <button
                    key={item.id}
                    onMouseEnter={() => onSelect(item.id)}
                    onClick={() => onSelect(item.id)}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                      selectedId === item.id ? 'bg-[#86d7ff]/12 text-white' : 'text-[#dce3e8] hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/[0.07] bg-white/[0.04]">
                      <Icon className="h-4 w-4 text-[#86d7ff]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium">{item.title}</div>
                      <div className="mt-0.5 truncate text-[10px] text-[#899298]">{item.path}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] text-[#899298]">{formatRelativeTime(item.updatedAt)}</div>
                      <div className="mt-1 text-[9px] uppercase tracking-wide text-[#86d7ff]">{getDockKindLabel(item.kind)}</div>
                    </div>
                  </button>
                )
              })}
              {items.length === 0 && <div className="px-4 py-8 text-center text-[12px] text-[#899298]">没有匹配结果</div>}
            </div>
          </div>
          <div className="flex min-h-0 flex-col overflow-y-auto custom-scrollbar p-6">
            {selectedItem ? (
              <>
                <div className="mb-5 flex items-start gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.05] text-[#86d7ff]">
                    {React.createElement(getKindIcon(selectedItem.kind), { className: 'h-5 w-5' })}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-xl font-semibold text-white">{selectedItem.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[#899298]">
                      <span>{getDockKindLabel(selectedItem.kind)}</span>
                      <span>·</span>
                      <span>{selectedItem.path}</span>
                    </div>
                  </div>
                </div>
                <PreviewSection label="路径" value={selectedItem.path} />
                <PreviewSection label="类型" value={getDockKindLabel(selectedItem.kind)} />
                <PreviewSection label="摘要" value={selectedItem.summary} />
                <div className="mb-6">
                  <h4 className="mb-2 text-[12px] font-semibold text-white">关键点</h4>
                  <ul className="space-y-1.5 text-[12px] text-[#c4ccd2]">
                    <li>· {selectedItem.kind === 'project' || selectedItem.kind === 'topic' ? '项目会切换到项目作战室并锁定当前 scope' : '散点对象只在 Dock 中独立打开，不进入项目目录。'}</li>
                    <li>· Inspector 会自动切换到当前对象详情。</li>
                    <li>· 需要深度编辑时可从 Inspector 进入 Editor。</li>
                  </ul>
                </div>
                <div className="mb-6">
                  <h4 className="mb-2 text-[12px] font-semibold text-white">相关对象</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedItem.relatedObjects.length > 0 ? (
                      selectedItem.relatedObjects.map((item) => (
                        <div key={item} className="rounded-md border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[11px] text-[#dce3e8]">
                          {item}
                        </div>
                      ))
                    ) : (
                      <div className="text-[11px] text-[#899298]">暂无相关对象</div>
                    )}
                  </div>
                </div>
                <div className="mt-auto flex justify-end gap-2 border-t border-white/[0.07] pt-4">
                  <button onClick={() => onOpen(selectedItem)} className="rounded-lg bg-[#86d7ff]/15 px-4 py-2 text-[12px] font-medium text-[#86d7ff] hover:bg-[#86d7ff]/24">
                    打开
                  </button>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-[12px] text-[#899298]">选择一个结果查看预览</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MenuButton({
  label,
  open,
  onToggle,
  align = 'left',
  icon,
  children,
}: {
  label: string
  open: boolean
  onToggle: () => void
  align?: 'left' | 'right'
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`flex h-[34px] items-center gap-1.5 rounded-[8px] border px-3 text-[12px] ${
          open ? 'border-white/20 bg-white/10 text-white' : 'border-white/[0.08] bg-white/[0.03] text-[#d6dde2] hover:bg-white/[0.05]'
        }`}
      >
        {icon}
        {label}
        <ChevronDown className="h-3.5 w-3.5 text-[#8d989f]" />
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-30 cursor-default" onClick={onToggle} />
          <div className={`absolute top-full z-40 mt-2 w-[220px] rounded-xl border border-white/10 bg-[#1c2023]/95 p-3 shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
            {children}
          </div>
        </>
      )}
    </div>
  )
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#8d989f]">{title}</div>
      {children}
    </section>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/[0.05] py-1.5 text-[11px] last:border-b-0">
      <span className="shrink-0 text-[#8d989f]">{label}</span>
      <span className="text-right text-[#d6dde2]">{value}</span>
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
