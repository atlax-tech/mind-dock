'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { PenTool, Bold, Italic, Strikethrough, Link, Code, Image as ImageIcon, List, ListOrdered, BookOpen, PanelRight, X, Link2, Plus, GripVertical, Heading1, Heading2, Heading3, Quote, Type, FileCode2, CheckSquare, Loader2, Check, AlertCircle } from 'lucide-react'

import type { SaveStatus } from './useAutosave'

interface EditorTabViewProps {
  editingItemId: number | null
  editorTitle: string
  editorContent: string
  onTitleChange: (title: string) => void
  onContentChange: (content: string) => void
  onSave: () => void
  mode: 'classic' | 'block'
  isDraft: boolean
  saveStatus: SaveStatus
  onToast?: (msg: string) => void
}

const SLASH_COMMANDS = [
  { key: 'text', label: 'Text', desc: 'Plain text block', icon: Type, className: 'blk-text', prefix: '' },
  { key: 'h1', label: 'Heading 1', desc: 'Large section heading', icon: Heading1, className: 'blk-h1', prefix: '# ' },
  { key: 'h2', label: 'Heading 2', desc: 'Medium section heading', icon: Heading2, className: 'blk-h2', prefix: '## ' },
  { key: 'h3', label: 'Heading 3', desc: 'Small section heading', icon: Heading3, className: 'blk-h3', prefix: '### ' },
  { key: 'quote', label: 'Quote', desc: 'Capture a quotation', icon: Quote, className: 'blk-quote', prefix: '> ' },
  { key: 'code', label: 'Code Block', desc: 'Code snippet', icon: FileCode2, className: 'blk-code', prefix: '```\n' },
  { key: 'list', label: 'Bullet List', desc: 'Simple list', icon: List, className: 'blk-list', prefix: '- ' },
  { key: 'todo', label: 'To-do List', desc: 'Track tasks', icon: CheckSquare, className: 'blk-text', prefix: '- [ ] ' },
]

const MARKDOWN_SHORTCUTS: { pattern: RegExp; prefix: string }[] = [
  { pattern: /^# $/, prefix: '# ' },
  { pattern: /^## $/, prefix: '## ' },
  { pattern: /^### $/, prefix: '### ' },
  { pattern: /^> $/, prefix: '> ' },
  { pattern: /^- $/, prefix: '- ' },
  { pattern: /^```$/, prefix: '```\n' },
]

export default function EditorTabView({
  editingItemId,
  editorTitle,
  editorContent,
  onTitleChange,
  onContentChange,
  onSave,
  mode,
  isDraft,
  saveStatus,
  onToast,
}: EditorTabViewProps) {
  const [dirty, setDirty] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showContext, setShowContext] = useState(false)
  const [slashMenuOpen, setSlashMenuOpen] = useState(false)
  const [slashFilter, setSlashFilter] = useState('')
  const [splitRatio, setSplitRatio] = useState(50)
  const [isResizingSplit, setIsResizingSplit] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const slashMenuRef = useRef<HTMLDivElement>(null)
  const splitContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDirty(false)
  }, [editingItemId])

  useEffect(() => {
    if (mode === 'block' && showPreview) {
      setShowPreview(false)
    }
  }, [mode, showPreview])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (slashMenuOpen && slashMenuRef.current && !slashMenuRef.current.contains(e.target as Node)) {
        setSlashMenuOpen(false)
        setSlashFilter('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [slashMenuOpen])

  useEffect(() => {
    if (!isResizingSplit) return
    const handleMouseMove = (e: MouseEvent) => {
      const container = splitContainerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const ratio = ((e.clientX - rect.left) / rect.width) * 100
      setSplitRatio(Math.max(20, Math.min(80, ratio)))
    }
    const handleMouseUp = () => {
      setIsResizingSplit(false)
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingSplit])

  const handleTitleChange = (v: string) => {
    onTitleChange(v)
    setDirty(true)
  }

  const handleContentChange = (v: string) => {
    onContentChange(v)
    setDirty(true)
    if (mode === 'block' && v.endsWith('/')) {
      setSlashMenuOpen(true)
      setSlashFilter('')
    } else if (mode === 'block' && slashMenuOpen) {
      const lastLine = v.split('\n').pop() || ''
      if (lastLine.startsWith('/')) {
        setSlashFilter(lastLine.slice(1).toLowerCase())
      } else {
        setSlashMenuOpen(false)
        setSlashFilter('')
      }
    }
  }

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mode !== 'block') return
    const el = textareaRef.current
    if (!el) return
    const value = el.value
    const cursorPos = el.selectionStart
    const lastNewlineBeforeCursor = value.lastIndexOf('\n', cursorPos - 1)
    const lineStart = lastNewlineBeforeCursor + 1
    const currentLine = value.slice(lineStart, cursorPos)

    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      for (const shortcut of MARKDOWN_SHORTCUTS) {
        if (shortcut.pattern.test(currentLine)) {
          e.preventDefault()
          const cmd = SLASH_COMMANDS.find(c => c.prefix === shortcut.prefix)
          if (cmd) {
            const before = value.slice(0, lineStart)
            const after = value.slice(cursorPos)
            const newContent = before + cmd.prefix + '\n' + after
            onContentChange(newContent)
            setDirty(true)
            requestAnimationFrame(() => {
              el.focus()
              const newCursorPos = lineStart + cmd.prefix.length + 1
              el.setSelectionRange(newCursorPos, newCursorPos)
            })
          }
          return
        }
      }
    }
  }, [mode, onContentChange])

  const handleSave = () => {
    onSave()
    setDirty(false)
  }

  const insertSlashCommand = useCallback((cmd: typeof SLASH_COMMANDS[number]) => {
    const el = textareaRef.current
    if (!el) return
    const value = el.value
    const lastNewline = value.lastIndexOf('\n')
    const lineStart = lastNewline + 1
    const currentLine = value.slice(lineStart)
    const before = value.slice(0, lineStart)
    const after = value.slice(lineStart + currentLine.length)
    const newContent = before + cmd.prefix + after
    onContentChange(newContent)
    setDirty(true)
    setSlashMenuOpen(false)
    setSlashFilter('')
    requestAnimationFrame(() => {
      el.focus()
      const cursorPos = lineStart + cmd.prefix.length
      el.setSelectionRange(cursorPos, cursorPos)
    })
  }, [onContentChange])

  const insertMarkdown = useCallback((prefix: string, suffix: string = '') => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const value = el.value
    const before = value.slice(0, start)
    const selected = value.slice(start, end)
    const after = value.slice(end)
    const replacement = selected ? prefix + selected + suffix : prefix + suffix
    const newValue = before + replacement + after
    onContentChange(newValue)
    setDirty(true)
    requestAnimationFrame(() => {
      el.focus()
      const cursorPos = start + replacement.length
      el.setSelectionRange(cursorPos, cursorPos)
    })
  }, [onContentChange])

  const handleBlockDragStart = useCallback((_idx: number) => {}, [])
  const handleBlockDragEnd = useCallback(() => {}, [])

  const filteredCommands = SLASH_COMMANDS.filter(cmd =>
    cmd.label.toLowerCase().includes(slashFilter) || cmd.desc.toLowerCase().includes(slashFilter)
  )

  if (!editingItemId) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[#1A1A1A]">
        <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <PenTool size={32} className="opacity-15 mb-4" />
            <p className="text-sm text-slate-500">选择一个文档开始编辑</p>
          </div>
        </div>
      </div>
    )
  }

  const canSave = isDraft ? (editorTitle.trim() || editorContent.trim()) : dirty

  const saveStatusLabel = () => {
    switch (saveStatus) {
      case 'saving': return 'Saving...'
      case 'saved': return 'Saved'
      case 'failed': return 'Save failed'
      default: return dirty ? '未保存' : ''
    }
  }

  const saveStatusIcon = () => {
    switch (saveStatus) {
      case 'saving': return <Loader2 size={12} className="animate-spin text-slate-400" />
      case 'saved': return <Check size={12} className="text-emerald-400" />
      case 'failed': return <AlertCircle size={12} className="text-red-400" />
      default: return null
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#1A1A1A]">
      <div className="h-10 bg-[#161616] border-b border-[var(--border-line)] flex items-center px-4 gap-1 shrink-0">
        {mode === 'classic' && (
          <>
            <button onClick={() => insertMarkdown('**', '**')} className="p-1.5 text-slate-500 hover:text-white rounded hover:bg-white/10 transition-colors" title="Bold"><Bold size={14} /></button>
            <button onClick={() => insertMarkdown('*', '*')} className="p-1.5 text-slate-500 hover:text-white rounded hover:bg-white/10 transition-colors" title="Italic"><Italic size={14} /></button>
            <button onClick={() => insertMarkdown('~~', '~~')} className="p-1.5 text-slate-500 hover:text-white rounded hover:bg-white/10 transition-colors" title="Strikethrough"><Strikethrough size={14} /></button>
            <div className="w-px h-4 bg-[var(--border-line)] mx-2" />
            <button onClick={() => insertMarkdown('[', '](url)')} className="p-1.5 text-slate-500 hover:text-white rounded hover:bg-white/10 transition-colors" title="Link"><Link size={14} /></button>
            <button onClick={() => insertMarkdown('`', '`')} className="p-1.5 text-slate-500 hover:text-white rounded hover:bg-white/10 transition-colors" title="Code"><Code size={14} /></button>
            <button onClick={() => { insertMarkdown('![alt](', ')') }} className="p-1.5 text-slate-500 hover:text-white rounded hover:bg-white/10 transition-colors" title="Image"><ImageIcon size={14} /></button>
            <div className="w-px h-4 bg-[var(--border-line)] mx-2" />
            <button onClick={() => insertMarkdown('- ')} className="p-1.5 text-slate-500 hover:text-white rounded hover:bg-white/10 transition-colors" title="Bullet List"><List size={14} /></button>
            <button onClick={() => insertMarkdown('1. ')} className="p-1.5 text-slate-500 hover:text-white rounded hover:bg-white/10 transition-colors" title="Numbered List"><ListOrdered size={14} /></button>
          </>
        )}
        <div className="flex-1" />
        {mode === 'classic' && (
          <button onClick={() => setShowPreview(v => !v)} className={`p-1.5 rounded hover:bg-white/10 transition-colors ${showPreview ? 'text-white' : 'text-slate-500 hover:text-white'}`} title="Toggle Preview"><BookOpen size={14} /></button>
        )}
        <button onClick={() => setShowContext(v => !v)} className={`p-1.5 rounded hover:bg-white/10 transition-colors ${showContext ? 'text-white' : 'text-slate-500 hover:text-white'}`} title="Toggle Context Panel"><PanelRight size={14} /></button>
      </div>
      <div ref={splitContainerRef} className="flex-1 flex flex-row overflow-hidden relative">
        <div className={`flex-1 flex flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden transition-[flex-basis] duration-300`} style={showPreview && mode === 'classic' ? { flexBasis: `${splitRatio}%` } : undefined}>
          {mode === 'classic' ? (
            <div className="w-full max-w-3xl mx-auto py-16 px-10">
              <input type="text" value={editorTitle} onChange={(e) => handleTitleChange(e.target.value)} className="w-full bg-transparent text-3xl font-semibold outline-none text-white placeholder-slate-600 mb-1" placeholder="Untitled" />
              <div className="h-px bg-[var(--border-line)] mb-8" />
              <textarea ref={textareaRef} value={editorContent} onChange={(e) => handleContentChange(e.target.value)} className="w-full min-h-[60vh] bg-transparent resize-none outline-none text-base font-light leading-relaxed text-slate-300 placeholder-slate-600" placeholder="开始写作..." />
              {canSave && (
                <div className="flex items-center gap-3 pt-6 border-t border-[var(--border-line)] mt-8">
                  <button onClick={handleSave} className="px-4 py-1.5 bg-[var(--accent)]/15 text-[var(--accent)] rounded-lg text-xs font-medium hover:bg-[var(--accent)]/25 transition-colors">保存</button>
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    {saveStatusIcon()}
                    {saveStatusLabel()}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full max-w-3xl mx-auto py-16 px-10">
              <div className="flex items-center gap-2 mb-6 font-mono text-xs text-[var(--text-muted)]">
                <span>Drafts</span> <span className="text-slate-600">/</span>
                <span>{editorTitle ? editorTitle.slice(0, 20) : 'Untitled'}</span>
              </div>
              <div className="block-row group" draggable onDragStart={() => handleBlockDragStart(-1)} onDragEnd={handleBlockDragEnd}>
                <div className="block-handle-container">
                  <button className="block-btn" title="Add block"><Plus size={14} /></button>
                  <button className="block-btn drag-handle" title="Drag"><GripVertical size={14} /></button>
                </div>
                <input type="text" value={editorTitle} onChange={(e) => handleTitleChange(e.target.value)} className="w-full bg-transparent text-3xl font-semibold outline-none text-white placeholder-slate-600 px-2 -mx-2" placeholder="Page Title" />
              </div>
              <div className="mt-4 space-y-0.5 relative">
                <div className="block-row group">
                  <div className="block-handle-container">
                    <button className="block-btn" title="Add block"><Plus size={14} /></button>
                    <button className="block-btn drag-handle" title="Drag"><GripVertical size={14} /></button>
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={editorContent}
                    onChange={(e) => handleContentChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full min-h-[200px] bg-transparent resize-none outline-none text-base font-light leading-relaxed text-slate-300 placeholder-slate-600 px-2 -mx-2"
                    placeholder="Type '/' for commands, or # > - for shortcuts"
                  />
                </div>
                {slashMenuOpen && filteredCommands.length > 0 && (
                  <div ref={slashMenuRef} className="context-menu-popup active absolute left-0 top-full mt-1 w-64 glass rounded-xl p-2 shadow-2xl z-[110]">
                    <div className="text-[10px] font-bold text-[var(--text-muted)] tracking-wider px-2 mb-1">BLOCK TYPE</div>
                    {filteredCommands.map(cmd => (
                      <button key={cmd.key} onClick={() => insertSlashCommand(cmd)} className="w-full text-left px-2 py-1.5 text-xs text-[var(--text-muted)] hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-colors">
                        <cmd.icon size={16} className="text-[var(--text-muted)]" />
                        <div>
                          <div className="text-white text-[13px]">{cmd.label}</div>
                          <div className="text-[10px] text-[var(--text-muted)]">{cmd.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {canSave && (
                <div className="flex items-center gap-3 pt-6 border-t border-[var(--border-line)] mt-8">
                  <button onClick={handleSave} className="px-4 py-1.5 bg-[var(--accent)]/15 text-[var(--accent)] rounded-lg text-xs font-medium hover:bg-[var(--accent)]/25 transition-colors">保存</button>
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    {saveStatusIcon()}
                    {saveStatusLabel()}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        {showPreview && mode === 'classic' && (
          <>
            <div
              className={`split-pane-divider ${isResizingSplit ? 'resizing' : ''}`}
              onMouseDown={() => setIsResizingSplit(true)}
            />
            <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden bg-[#111] border-l border-[var(--border-line)] p-10">
              <div className="max-w-2xl mx-auto">
                <h1 className="text-2xl font-semibold text-white mb-6">{editorTitle || 'Untitled'}</h1>
                <div className="markdown-preview prose prose-invert prose-sm max-w-none text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {editorContent}
                </div>
              </div>
            </div>
          </>
        )}
        {showContext && (
          <div className="absolute top-0 right-0 h-full w-72 bg-[#161616] border-l border-[var(--border-line)] shadow-2xl z-20 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-line)]">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Context Links</h4>
              <button onClick={() => setShowContext(false)} className="p-1.5 text-[var(--text-muted)] hover:text-white rounded-md hover:bg-white/10 transition-colors"><X size={14} /></button>
            </div>
            <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden p-4 space-y-3">
              <div onClick={() => onToast?.('Opening UX Guidelines (mock)')} className="bg-white/5 border border-[var(--border-line)] rounded-xl p-4 cursor-pointer hover:border-[var(--accent)]/30 transition-colors">
                <div className="flex items-center gap-2 mb-2"><Link2 size={14} className="text-[var(--accent)]" /><span className="text-sm font-medium text-white">UX Guidelines</span></div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">相关设计规范与交互原则参考文档。</p>
              </div>
              <div onClick={() => onToast?.('Opening Engine Spec (mock)')} className="bg-white/5 border border-[var(--border-line)] rounded-xl p-4 cursor-pointer hover:border-[var(--accent)]/30 transition-colors">
                <div className="flex items-center gap-2 mb-2"><Link2 size={14} className="text-[var(--accent)]" /><span className="text-sm font-medium text-white">Engine Spec</span></div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">核心引擎物理模拟与空间结构说明。</p>
              </div>
              <div onClick={() => onToast?.('Opening API Reference (mock)')} className="bg-white/5 border border-[var(--border-line)] rounded-xl p-4 cursor-pointer hover:border-[var(--accent)]/30 transition-colors">
                <div className="flex items-center gap-2 mb-2"><Link2 size={14} className="text-[var(--accent)]" /><span className="text-sm font-medium text-white">API Reference</span></div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">内部接口定义与调用示例。</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
