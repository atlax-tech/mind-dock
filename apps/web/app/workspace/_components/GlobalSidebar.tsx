'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  ChevronDown,
  ChevronsUpDown,
  PanelLeftClose,
  Search,
  Sparkles,
  Plus,
  FileText,
  MessageSquare,
  Folder,
  Calendar,
  CheckSquare,
  Cloud,
  X,
  Sun,
  Send,
} from 'lucide-react'

interface GlobalSidebarProps {
  userName: string
  onSwitchToEditor: () => void
  onSwitchToDock: () => void
  onSwitchToMind: () => void
  onNewNote: () => void
  onCapture: (text: string) => Promise<void>
  onToast: (msg: string) => void
  onOpenDocument: (documentRef: number | string) => void
  onSwitchToDockWithSearch: (query: string) => void
  onProjectClick: (project: string) => void
  onCreateProjectFolder: (name?: string) => void
  documents: { label: string; dockItemId: number | null }[]
  sidebarData?: {
    projects: { name: string; documents: string[] }[]
    tags: string[]
  }
}

interface WidgetItem {
  type: string
  title: string
  icon: string
  iconColor: string
  content: React.ReactNode
}

export default function GlobalSidebar({ userName, onSwitchToEditor: _onSwitchToEditor, onSwitchToDock: _onSwitchToDock, onSwitchToMind: _onSwitchToMind, onNewNote, onCapture, onToast, onOpenDocument, onSwitchToDockWithSearch, onProjectClick, onCreateProjectFolder, documents, sidebarData }: GlobalSidebarProps) {
  const [isPinned, setIsPinned] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [isSearchExpanded, setIsSearchExpanded] = useState(false)
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [isChatMode, setIsChatMode] = useState(false)
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [widgets, setWidgets] = useState<WidgetItem[]>([])
  const [isWidgetsCollapsed, setIsWidgetsCollapsed] = useState(false)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())

  const sidebarRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const newMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isSearchExpanded && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isSearchExpanded])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isNewMenuOpen && newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setIsNewMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isNewMenuOpen])

  const togglePin = useCallback(() => {
    const next = !isPinned
    setIsPinned(next)
    if (next) {
      setIsVisible(true)
    }
    document.documentElement.style.setProperty('--sidebar-width', next ? '256px' : '0px')
  }, [isPinned])

  const handleMouseEnterTrigger = useCallback(() => {
    if (!isPinned) setIsVisible(true)
  }, [isPinned])

  const handleMouseLeaveSidebar = useCallback(() => {
    if (!isPinned) {
      setIsVisible(false)
      setIsSearchExpanded(false)
      setIsNewMenuOpen(false)
    }
  }, [isPinned])

  const resolveDocument = useCallback((label: string) => {
    const doc = documents.find(d => d.label === label)
    if (doc && doc.dockItemId !== null) {
      onOpenDocument(doc.dockItemId)
    } else {
      onOpenDocument(label)
    }
  }, [documents, onOpenDocument])

  const toggleFolder = useCallback((folderName: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderName)) next.delete(folderName)
      else next.add(folderName)
      return next
    })
  }, [])

  const addWidget = useCallback((type: string) => {
    if (widgets.find(w => w.type === type)) {
      onToast(`A ${type} widget already exists!`)
      return
    }
    let title = '', icon = '', iconColor = '', content: React.ReactNode = null
    if (type === 'calendar') {
      title = 'Calendar'; icon = 'calendar'; iconColor = 'text-rose-400'
      content = (
        <div className="text-xs text-gray-300 mb-2 font-bold px-1 flex justify-between items-center">
          <span>April 2026</span>
          <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-[var(--text-muted)]">Week 17</span>
        </div>
      )
    } else if (type === 'todo') {
      title = 'Tasks'; icon = 'check-square'; iconColor = 'text-emerald-400'
      content = (
        <div className="space-y-2 px-1 mt-1">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer group">
            <input type="checkbox" className="rounded bg-black/50 border-[var(--border-line)] accent-emerald-500" readOnly />
            <span className="group-hover:text-white transition-colors">Refactor Sidebar</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer line-through group">
            <input type="checkbox" checked className="rounded bg-black/50 border-[var(--border-line)] accent-emerald-500" readOnly />
            <span className="group-hover:text-gray-400 transition-colors">Fix TopNav Bug</span>
          </label>
        </div>
      )
    } else if (type === 'weather') {
      title = 'Weather'; icon = 'cloud'; iconColor = 'text-blue-300'
      content = (
        <div className="flex items-center justify-between px-1 mt-1">
          <div>
            <div className="text-xs font-medium text-white mb-0.5">Tokyo, JP</div>
            <div className="text-[10px] text-[var(--text-muted)]">Mostly Sunny</div>
          </div>
          <div className="flex items-center gap-2">
            <Sun size={24} className="text-amber-400" />
            <span className="text-lg font-light text-white">21°</span>
          </div>
        </div>
      )
    }
    setWidgets(prev => [...prev, { type, title, icon, iconColor, content }])
    if (isWidgetsCollapsed) setIsWidgetsCollapsed(false)
  }, [widgets, isWidgetsCollapsed, onToast])

  const removeWidget = useCallback((type: string) => {
    setWidgets(prev => prev.filter(w => w.type !== type))
  }, [])

  const executeSearch = useCallback(() => {
    if (sidebarSearch.trim()) {
      onSwitchToDockWithSearch(sidebarSearch.trim())
      setSidebarSearch('')
      setIsSearchExpanded(false)
    }
  }, [sidebarSearch, onSwitchToDockWithSearch])

  const handleChatSend = useCallback(async () => {
    if (!chatInput.trim()) return
    await onCapture(chatInput.trim())
    setChatInput('')
  }, [chatInput, onCapture])

  const IconMap: Record<string, React.ReactNode> = {
    calendar: <Calendar size={14} className="text-rose-400" />,
    'check-square': <CheckSquare size={14} className="text-emerald-400" />,
    cloud: <Cloud size={14} className="text-blue-300" />,
  }

  return (
    <>
      <div
        ref={triggerRef}
        className="fixed top-0 left-0 w-3 h-full z-[90]"
        onMouseEnter={handleMouseEnterTrigger}
      />

      <aside
        ref={sidebarRef}
        id="global-sidebar"
        className={`fixed top-0 left-0 h-full w-64 bg-[var(--bg-sidebar)] border-r border-[var(--border-line)] z-[100] flex flex-col shadow-[15px_0_40px_rgba(0,0,0,0.4)] overflow-x-hidden transition-transform duration-400 ease-[cubic-bezier(0.23,1,0.32,1)] ${
          isVisible ? 'translate-x-0' : '-translate-x-full'
        }`}
        onMouseLeave={handleMouseLeaveSidebar}
      >
        <div className="p-3 pb-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 hover:bg-white/5 p-1.5 rounded-lg cursor-pointer transition-colors w-full">
            <div className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center overflow-hidden border border-[var(--border-line)] shrink-0">
              <span className="text-[8px] font-bold text-emerald-400">{userName.charAt(0).toUpperCase()}</span>
            </div>
            <span className="text-sm font-medium text-white truncate pointer-events-none">{userName}&apos;s Space</span>
            <ChevronsUpDown size={12} className="text-[var(--text-muted)] ml-auto pointer-events-none" />
          </div>
          <button
            onClick={togglePin}
            className={`p-1.5 rounded hover:bg-white/10 transition-colors shrink-0 ml-1 ${
              isPinned ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-white'
            }`}
            title="Pin Sidebar"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        <div className="px-4 pb-3 border-b border-[var(--border-line)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 flex-1">
            <div
              className={`flex items-center rounded-full overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                isSearchExpanded ? 'bg-black/20 border border-[var(--border-line)] w-[140px]' : 'bg-white/5 border border-transparent hover:border-[var(--border-line)] w-8'
              }`}
              style={{ height: '32px' }}
            >
              <button
                onClick={() => {
                  if (!isSearchExpanded) {
                    setIsSearchExpanded(true)
                    setIsNewMenuOpen(false)
                  } else {
                    executeSearch()
                  }
                }}
                className="w-8 h-8 flex items-center justify-center shrink-0 text-[var(--text-muted)] hover:text-white transition-colors"
                title="Search"
              >
                <Search size={16} />
              </button>
              <input
                ref={searchInputRef}
                type="text"
                value={sidebarSearch}
                onChange={e => setSidebarSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') executeSearch() }}
                placeholder="Search..."
                className={`bg-transparent border-none outline-none text-xs text-white placeholder-gray-500 transition-all duration-300 ${
                  isSearchExpanded ? 'w-full opacity-100 pointer-events-auto pr-2' : 'w-0 opacity-0 pointer-events-none'
                }`}
              />
            </div>
            <button
              onClick={() => { setIsChatMode(true) }}
              className={`w-8 h-8 rounded-full bg-white/5 border border-transparent hover:border-[var(--border-line)] hover:bg-white/10 flex items-center justify-center transition-colors shrink-0 ${
                isChatMode ? 'bg-white/10 text-white' : ''
              }`}
              title="AI Chat"
            >
              <Sparkles size={16} className="text-[var(--accent)]" />
            </button>
          </div>

          <div className="relative shrink-0 ml-auto" ref={newMenuRef}>
            <button
              onClick={() => setIsNewMenuOpen(v => !v)}
              className="w-8 h-8 rounded-full bg-transparent border border-white/20 hover:bg-white/10 flex items-center justify-center text-white transition-colors"
              title="New Item"
            >
              <Plus size={16} />
            </button>
            {isNewMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 glass rounded-xl p-1 shadow-2xl z-[110] origin-top-right">
                <button
                  onClick={() => { onNewNote(); setIsNewMenuOpen(false) }}
                  className="w-full text-left px-2 py-1.5 text-xs text-[var(--text-muted)] hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <FileText size={14} className="text-[var(--node-doc)]" /> Document
                </button>
                <button
                  onClick={() => { setIsChatMode(true); setIsNewMenuOpen(false) }}
                  className="w-full text-left px-2 py-1.5 text-xs text-[var(--text-muted)] hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <MessageSquare size={14} className="text-blue-400" /> New Chat
                </button>
                <button
                  onClick={() => { onCreateProjectFolder(); setIsNewMenuOpen(false) }}
                  className="w-full text-left px-2 py-1.5 text-xs text-[var(--text-muted)] hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Folder size={14} className="text-[var(--node-domain)]" /> Project Folder
                </button>
                <div className="my-1 border-t border-[var(--border-line)]" />
                <div className="px-2 py-1 text-[9px] font-bold text-[var(--text-muted)] tracking-wider">ADD WIDGET</div>
                <button
                  onClick={() => { addWidget('calendar'); setIsNewMenuOpen(false) }}
                  className="w-full text-left px-2 py-1 text-xs text-[var(--text-muted)] hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Calendar size={14} className="text-rose-400" /> Calendar Widget
                </button>
                <button
                  onClick={() => { addWidget('todo'); setIsNewMenuOpen(false) }}
                  className="w-full text-left px-2 py-1 text-xs text-[var(--text-muted)] hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <CheckSquare size={14} className="text-emerald-400" /> Tasks Widget
                </button>
                <button
                  onClick={() => { addWidget('weather'); setIsNewMenuOpen(false) }}
                  className="w-full text-left px-2 py-1 text-xs text-[var(--text-muted)] hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Cloud size={14} className="text-blue-300" /> Weather Widget
                </button>
              </div>
            )}
          </div>
        </div>

        {!isChatMode ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto no-scrollbar px-2 py-2 space-y-0.5">
              <div className="px-2 text-[10px] font-bold text-[var(--text-muted)] tracking-wider mb-2 mt-1">{userName ? `${userName}'s Space` : 'Documents'}</div>

              {(sidebarData?.projects || []).map(project => (
                <div key={project.name} className="tree-folder group">
                  <div
                    className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-gray-300 hover:bg-white/5 rounded-md cursor-pointer transition-colors select-none"
                    onClick={() => { toggleFolder(project.name); onProjectClick(project.name) }}
                  >
                    <ChevronDown
                      size={14}
                      className={`text-[var(--text-muted)] transition-transform duration-300 ${
                        collapsedFolders.has(project.name) ? '-rotate-90' : ''
                      }`}
                    />
                    <Folder size={16} className="text-[var(--node-domain)]" />
                    <span className="truncate">{project.name}</span>
                  </div>
                  {!collapsedFolders.has(project.name) ? (
                    <div className="sidebar-accordion expanded pl-6 space-y-0.5 border-l border-[var(--border-line)] ml-3.5 mt-0.5">
                      {project.documents.map(docName => (
                        <div
                          key={docName}
                          onClick={() => resolveDocument(docName)}
                          className="flex items-center gap-2 px-2 py-1.5 text-sm text-[var(--text-muted)] hover:bg-white/5 hover:text-white rounded-md cursor-pointer transition-colors"
                        >
                          <FileText size={14} className="text-[var(--node-doc)]" />
                          <span className="truncate">{docName}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="sidebar-accordion collapsed pl-6 space-y-0.5 border-l border-[var(--border-line)] ml-3.5 mt-0.5" />
                  )}
                </div>
              ))}

              {(sidebarData?.tags || []).length > 0 && (
                <>
                  <div className="px-4 text-[10px] font-bold text-[var(--text-muted)] tracking-wider mt-4 mb-2">TAGS</div>
                  <div className="space-y-0.5 px-2 flex flex-wrap gap-1">
                    {sidebarData?.tags.map(tag => (
                      <span key={tag} onClick={() => onProjectClick(tag)} className="px-2 py-1 border rounded-md text-xs cursor-pointer hover:text-white transition-colors bg-white/5 border-[var(--border-line)] text-[var(--text-muted)]">#{tag}</span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {widgets.length > 0 && (
              <div className="px-3 pb-3 shrink-0 border-t border-[var(--border-line)] pt-3">
                <div
                  className="flex items-center justify-between text-[10px] font-bold text-[var(--text-muted)] tracking-wider mb-2 px-1 cursor-pointer hover:text-white transition-colors select-none"
                  onClick={() => setIsWidgetsCollapsed(v => !v)}
                >
                  <span className="flex items-center gap-1">
                    <ChevronDown size={12} className={`transition-transform duration-300 ${isWidgetsCollapsed ? '-rotate-90' : ''}`} />
                    WIDGETS
                  </span>
                </div>
                {!isWidgetsCollapsed && (
                  <div className="space-y-2 transition-all duration-300 origin-top overflow-y-auto no-scrollbar max-h-[500px]">
                    {widgets.map(w => (
                      <div key={w.type} className="widget-item bg-black/30 border border-[var(--border-line)] rounded-xl p-3 shadow-inner flex flex-col">
                        <div className="flex justify-between items-center mb-2 border-b border-[var(--border-line)] pb-2">
                          <span className="text-xs font-medium text-white flex items-center gap-1.5">
                            {IconMap[w.icon]}
                            {w.title}
                          </span>
                          <button
                            onClick={() => removeWidget(w.type)}
                            className="text-[var(--text-muted)] hover:text-white transition-colors"
                            title="Remove"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        {w.content}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden bg-[#111]">
            <div className="p-3 border-b border-[var(--border-line)] flex items-center justify-between shrink-0 shadow-sm bg-[var(--bg-sidebar)]">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <Sparkles size={16} className="text-[var(--accent)]" /> Mind Chat
              </div>
              <button
                onClick={() => setIsChatMode(false)}
                className="text-[var(--text-muted)] hover:text-white transition-colors p-1 hover:bg-white/10 rounded"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-4 text-sm no-scrollbar bg-[#111]">
              <div className="bg-white/5 border border-[var(--border-line)] rounded-xl rounded-tl-none p-3 text-gray-300 leading-relaxed shadow-sm">
                Hello! I&apos;m your structural AI assistant. How can I help you organize your knowledge today?
              </div>
            </div>
            <div className="p-3 border-t border-[var(--border-line)] bg-[var(--bg-sidebar)] shrink-0">
              <div className="relative">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleChatSend() }}
                  placeholder="Ask AI..."
                  className="w-full bg-black/40 border border-[var(--border-line)] rounded-lg pl-3 pr-8 py-2 text-xs outline-none focus:border-[var(--accent)] transition-colors text-white shadow-inner"
                />
                <button
                  onClick={handleChatSend}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
