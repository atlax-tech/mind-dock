'use client'

import type { FC, PointerEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Brain,
  CornerDownLeft,
  FileText,
  History,
  Home,
  Library,
  Network,
  Search,
  Settings,
  User,
  MessageSquare,
  LogOut,
  PenTool,
  CreditCard,
} from 'lucide-react'

import { type LocalUser } from '@/lib/auth'

export type GoldenViewId = 'home' | 'mind' | 'dock' | 'editor'

interface NavItem {
  id: GoldenViewId
  label: string
  icon: typeof Home
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'mind', label: 'Mind', icon: Network },
  { id: 'dock', label: 'Dock', icon: Library },
  { id: 'editor', label: 'Editor', icon: PenTool },
]

interface SearchSuggestion {
  id: string
  label: string
  icon: typeof FileText
  tone: 'document' | 'accent' | 'muted'
  section?: string
}

const SEARCH_SUGGESTIONS: SearchSuggestion[] = [
  { id: 'suggested-1', label: 'Graph Engine Physics', icon: FileText, tone: 'document', section: 'SUGGESTED FROM GRAPH' },
  { id: 'suggested-2', label: 'World Tree Architecture', icon: Network, tone: 'accent' },
  { id: 'recent-1', label: '搜索 "Context Nudge"', icon: History, tone: 'muted', section: 'RECENT ACTIONS' },
]

interface GoldenTopNavProps {
  activeModule: GoldenViewId
  onModuleChange: (module: GoldenViewId) => void
  user: LocalUser
  onLogout?: () => void
  isCollapsed?: boolean
  onCollapseRequest?: () => void
  onExpandRequest?: () => void
  onToast?: (msg: string) => void
  onSearchAction?: (label: string) => void
  searchSuggestions?: SearchSuggestion[]
}

const GoldenTopNav: FC<GoldenTopNavProps> = ({
  activeModule,
  onModuleChange,
  user,
  onLogout,
  isCollapsed: isCollapsedProp,
  onCollapseRequest: _onCollapseRequest,
  onExpandRequest,
  onToast,
  onSearchAction,
  searchSuggestions: externalSearchSuggestions,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState<boolean | null>(null)
  const isCollapsed = internalCollapsed !== null ? internalCollapsed : (isCollapsedProp ?? false)
  const effectiveSearchSuggestions = externalSearchSuggestions && externalSearchSuggestions.length > 0 ? externalSearchSuggestions : SEARCH_SUGGESTIONS

  useEffect(() => {
    if (isCollapsedProp) {
      setInternalCollapsed(true)
    } else if (activeModule !== 'editor') {
      setInternalCollapsed(null)
    }
  }, [isCollapsedProp, activeModule])
  const [isSearchMode, setIsSearchMode] = useState(false)
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const [navPosition, setNavPosition] = useState({ left: 50, top: 24, isPercentLeft: true })
  const [dragState, setDragState] = useState<{
    pointerId: number
    startX: number
    startY: number
    initialLeft: number
    initialTop: number
    moved: boolean
  } | null>(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const justDraggedRef = useRef(false)
  const justExpandedRef = useRef(false)

  useEffect(() => {
    const sidebarWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width') || '0', 10)
    if (isCollapsed) {
      setNavPosition({ left: sidebarWidth + 16, top: 4, isPercentLeft: false })
    } else {
      if (sidebarWidth > 0) {
        setNavPosition({ left: sidebarWidth + (window.innerWidth - sidebarWidth) / 2, top: 24, isPercentLeft: false })
      } else {
        setNavPosition({ left: 50, top: 24, isPercentLeft: true })
      }
    }
  }, [isCollapsed])

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const sidebarWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width') || '0', 10)
      if (isCollapsed) {
        setNavPosition(prev => prev.isPercentLeft ? prev : { ...prev, left: sidebarWidth + 16 })
      } else {
        if (sidebarWidth > 0) {
          setNavPosition({ left: sidebarWidth + (window.innerWidth - sidebarWidth) / 2, top: 24, isPercentLeft: false })
        } else {
          setNavPosition({ left: 50, top: 24, isPercentLeft: true })
        }
      }
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    return () => observer.disconnect()
  }, [isCollapsed])

  useEffect(() => {
    if (!isCollapsed) {
      const sidebarWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width') || '0', 10)
      if (sidebarWidth > 0) {
        setNavPosition({ left: sidebarWidth + (window.innerWidth - sidebarWidth) / 2, top: 24, isPercentLeft: false })
      } else {
        setNavPosition({ left: 50, top: 24, isPercentLeft: true })
      }
    }
  }, [activeModule, isCollapsed])

  const navRef = useRef<HTMLElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const searchSuggestionsRef = useRef<HTMLDivElement | null>(null)
  const accountDropdownRef = useRef<HTMLDivElement | null>(null)
  const accountBtnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (isSearchMode) {
      searchInputRef.current?.focus()
    }
  }, [isSearchMode])

  useEffect(() => {
    if (isAccountOpen && accountBtnRef.current) {
      const rect = accountBtnRef.current.getBoundingClientRect()
      const dropdownWidth = 224
      const top = rect.bottom + 8
      const left = Math.max(8, Math.min(rect.right - dropdownWidth, window.innerWidth - dropdownWidth - 8))
      setDropdownPos({ top, left })
    }
  }, [isAccountOpen])

  const closeFloatingMenus = useCallback(() => {
    setIsSearchMode(false)
    setIsAccountOpen(false)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (isSearchMode) {
        const navEl = navRef.current
        const suggestionsEl = searchSuggestionsRef.current
        if (navEl && !navEl.contains(target) && (!suggestionsEl || !suggestionsEl.contains(target))) {
          setIsSearchMode(false)
        }
      }
      if (isAccountOpen) {
        const navEl = navRef.current
        const dropdownEl = accountDropdownRef.current
        const btnEl = accountBtnRef.current
        if (navEl && !navEl.contains(target) && (!dropdownEl || !dropdownEl.contains(target)) && btnEl && !btnEl.contains(target)) {
          setIsAccountOpen(false)
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isSearchMode, isAccountOpen])

  const navStyle = useMemo(() => {
    const left = navPosition.isPercentLeft ? `${navPosition.left}%` : `${navPosition.left}px`
    const transform = isCollapsed ? 'translateX(0)' : 'translateX(-50%)'
    return {
      top: `${navPosition.top}px`,
      left,
      transform,
      height: '48px',
      whiteSpace: 'nowrap' as const,
    }
  }, [navPosition, isCollapsed])

  const handleLogoPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!isCollapsed) return
    const rect = navRef.current?.getBoundingClientRect()
    if (!rect) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragState({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialLeft: rect.left,
      initialTop: rect.top,
      moved: false,
    })
  }

  const handleLogoPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return
    const dx = event.clientX - dragState.startX
    const dy = event.clientY - dragState.startY
    const moved = dragState.moved || Math.abs(dx) + Math.abs(dy) > 4
    if (!moved) return
    setDragState({ ...dragState, moved })
    setNavPosition({
      left: Math.max(16, dragState.initialLeft + dx),
      top: Math.max(16, dragState.initialTop + dy),
      isPercentLeft: false,
    })
  }

  const handleLogoPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (dragState.moved) {
      justDraggedRef.current = true
      setTimeout(() => { justDraggedRef.current = false }, 100)
    } else {
      if (isSearchMode) {
        setIsSearchMode(false)
      } else if (isCollapsedProp) {
        setInternalCollapsed(false)
        onExpandRequest?.()
        justExpandedRef.current = true
        setTimeout(() => { justExpandedRef.current = false }, 300)
      } else {
        onModuleChange('home')
      }
    }
    setDragState(null)
  }

  const handleLogoClick = () => {
    if (justDraggedRef.current) return
    if (justExpandedRef.current) return
    if (isCollapsed) return
    if (isSearchMode) {
      setIsSearchMode(false)
    } else {
      onModuleChange('home')
    }
  }

  return (
    <>
      <header
        ref={navRef}
        id="top-nav"
        className={`fixed z-50 glass rounded-full flex items-center overflow-hidden shadow-xl px-1 nav-transition ${
          dragState?.moved ? '!transition-none' : ''
        } ${isSearchMode ? 'w-[min(760px,calc(100vw-48px))]' : isCollapsed ? 'w-12' : 'w-[max-content]'}`}
        style={navStyle}
      >
        <button
          id="nav-logo-btn"
          type="button"
          onPointerDown={handleLogoPointerDown}
          onPointerMove={handleLogoPointerMove}
          onPointerUp={handleLogoPointerUp}
          onClick={handleLogoClick}
          className={`pointer-events-auto relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border-line)] bg-slate-800 text-slate-200 transition-transform hover:bg-slate-700 ${
            isCollapsed ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
          }`}
          style={{ touchAction: isCollapsed ? 'none' : 'auto' }}
          title={isCollapsed ? 'Drag to move / Click to expand' : 'Return Home'}
        >
          <Brain className="h-5 w-5 pointer-events-none text-slate-200" />
        </button>

        <div
          id="nav-content"
          className={`relative ml-2 flex h-full flex-1 items-center pr-1 transition-opacity ${
            isCollapsed ? 'pointer-events-none opacity-0 duration-150' : 'pointer-events-auto opacity-100 delay-150 duration-300'
          }`}
        >
          <div
            id="nav-links"
            className={`flex shrink-0 origin-left items-center gap-1 overflow-hidden transition-[max-width,opacity] duration-[400ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${
              isSearchMode ? 'max-w-0 opacity-0 pointer-events-none' : 'max-w-[500px] opacity-100'
            }`}
          >
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const isActive = activeModule === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    closeFloatingMenus()
                    onModuleChange(item.id)
                  }}
                  className={`group relative rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    isActive ? 'text-white' : 'text-[var(--text-muted)] hover:text-white'
                  }`}
                >
                  <span className="pointer-events-none relative z-10 flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                  <div
                    className={`pointer-events-none absolute inset-0 rounded-full bg-white/10 transition-all duration-300 ${
                      isActive ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
                    }`}
                  />
                </button>
              )
            })}
            <div className="mx-2 h-5 w-px shrink-0 bg-[var(--border-line)]" />
          </div>

          <div
            id="nav-actions"
            className={`flex items-center gap-1 transition-[max-width,opacity] duration-[400ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${
              isSearchMode ? 'flex-1' : ''
            }`}
          >
            <div
              id="nav-search-container"
              className={`flex h-8 items-center overflow-hidden rounded-full transition-[max-width,opacity,background-color,padding,flex-grow] duration-[400ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${
                isSearchMode ? 'max-w-[1000px] flex-1 bg-white/5 pr-1' : 'max-w-8'
              }`}
            >
              <button
                id="nav-search-btn"
                type="button"
                onClick={() => {
                  setIsSearchMode(true)
                  setIsAccountOpen(false)
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-white/10 hover:text-white"
              >
                <Search className="h-4 w-4 pointer-events-none" />
              </button>
              <input
                ref={searchInputRef}
                id="nav-search-input"
                type="text"
                className={`w-full border-none bg-transparent px-2 text-sm text-white outline-none transition-opacity duration-300 ${
                  isSearchMode ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                }`}
                placeholder="Search everything... (Mac Spotlight Style)"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setIsSearchMode(false)
                }}
              />
              <button
                id="nav-search-send"
                type="button"
                onClick={() => setIsSearchMode(false)}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--accent)] text-[#111] transition-opacity duration-300 hover:bg-purple-400 ${
                  isSearchMode ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                }`}
              >
                <CornerDownLeft className="h-3 w-3 pointer-events-none" />
              </button>
            </div>

            <div
              id="nav-account-container"
              className={`ml-1 flex shrink-0 overflow-hidden transition-[max-width,opacity,margin] duration-[400ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${
                isSearchMode ? 'ml-0 max-w-0 opacity-0 pointer-events-none' : 'max-w-10 opacity-100'
              }`}
            >
              <button
                ref={accountBtnRef}
                id="nav-account-btn"
                type="button"
                onClick={() => {
                  setIsAccountOpen((value) => !value)
                  setIsSearchMode(false)
                }}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-[var(--border-line)] bg-slate-800 transition-colors hover:border-[var(--text-muted)]"
              >
                <span className="text-[10px] font-bold text-emerald-400">{user.name.charAt(0).toUpperCase()}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Search Suggestions */}
      <div
        ref={searchSuggestionsRef}
        id="search-suggestions"
        className={`fixed z-40 w-[min(600px,calc(100vw-48px))] glass rounded-2xl p-2 shadow-2xl dropdown-transition ${
          isSearchMode ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
        }`}
        style={{
          top: `${navPosition.top + 60}px`,
          left: navPosition.isPercentLeft ? '50%' : `${navPosition.left}px`,
          transform: navPosition.isPercentLeft ? 'translateX(-50%)' : undefined
        }}
      >
        {effectiveSearchSuggestions.map((suggestion, idx) => {
          const Icon = suggestion.icon
          const toneClasses = {
            document: 'text-[var(--node-doc)]',
            accent: 'text-[var(--accent)]',
            muted: 'text-[var(--text-muted)]',
          }
          const showSectionDivider = idx > 0 && suggestion.section && SEARCH_SUGGESTIONS[idx - 1].section !== suggestion.section
          return (
            <div key={suggestion.id}>
              {showSectionDivider && (
                <div className="my-1 border-t border-[var(--border-line)]" />
              )}
              {suggestion.section && (!SEARCH_SUGGESTIONS[idx - 1]?.section || SEARCH_SUGGESTIONS[idx - 1].section !== suggestion.section) && (
                <div className="px-3 py-2 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase">{suggestion.section}</div>
              )}
              <button onClick={() => { setIsSearchMode(false); if (onSearchAction) { onSearchAction(suggestion.label) } else { onToast?.(`Search: ${suggestion.label}`) } }} className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/10">
                <Icon className={`h-4 w-4 pointer-events-none ${toneClasses[suggestion.tone]}`} />
                {suggestion.label}
              </button>
            </div>
          )
        })}
      </div>

      {/* Account Dropdown */}
      <div
        ref={accountDropdownRef}
        id="account-dropdown"
        className={`fixed z-[100] flex w-56 flex-col glass rounded-2xl p-2 shadow-2xl dropdown-transition ${
          isAccountOpen ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
        }`}
        style={{
          top: `${dropdownPos.top}px`,
          left: `${dropdownPos.left}px`,
        }}
      >
        <div className="mb-1 border-b border-[var(--border-line)] px-3 py-3">
          <p className="text-sm font-medium text-white">{user.name}</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Pro Plan</p>
        </div>
        <button onClick={() => onToast?.('Account management coming soon')} className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/10">
          <User className="h-4 w-4 text-slate-400" />
          Account Mgmt
        </button>
        <button onClick={() => onToast?.('Subscription management coming soon')} className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/10">
          <CreditCard className="h-4 w-4 text-slate-400" />
          Subscription
        </button>
        <button onClick={() => onToast?.('Settings page coming soon')} className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/10">
          <Settings className="h-4 w-4 text-slate-400" />
          Settings
        </button>
        <button onClick={() => onToast?.('Feedback form coming soon')} className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-[var(--text-muted)] transition-colors hover:text-white hover:bg-white/10">
          <MessageSquare className="h-4 w-4" />
          Feedback
        </button>
        <div className="h-px bg-[var(--border-line)] my-1" />
        <button
          onClick={onLogout}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-rose-400 transition-colors hover:bg-rose-500/10"
        >
          <LogOut className="h-4 w-4" />
          Log Out
        </button>
      </div>
    </>
  )
}

export default GoldenTopNav
