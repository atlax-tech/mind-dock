'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BubbleMenu } from '@tiptap/react/menus'
import { EditorContent, Extension, Node as TiptapNode, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes, type Editor, type NodeViewProps, useEditor } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Suggestion from '@tiptap/suggestion'
import Link from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import {
  Plus,
  Search,
  Bold,
  Italic,
  Strikethrough,
  Code,
  FileCode,
  Hash,
  Quote,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  GripVertical,
  Eye,
  Link as LinkIcon,
  Highlighter,
  CheckSquare,
  ChevronRight,
  Copy,
  ArrowUp,
  ArrowDown,
  Trash2,
  Palette,
  Type,
  Terminal,
  FileText,
} from 'lucide-react'
import { PasteNormalizer } from './PasteNormalizer'
import {
  createEditorContentPayload,
  createEmptyTiptapDoc,
  type EditorContentPayload,
  type TiptapJSONContent,
} from '@/lib/editorContentAdapter'

export type EditorWidthMode = 'compact' | 'comfortable' | 'wide'

export interface EditorOutlineItem {
  id: string
  title: string
  level: 1 | 2 | 3
  index: number
}

export interface EditorViewBlockSelection {
  viewId: string
  name: string
  viewType: 'Table' | 'List' | 'Board' | 'Graph' | 'Queue'
  dataSource: 'Tasks' | 'Documents' | 'Recommendations' | 'Mind Links' | 'Local Database'
  filters: string
  sort: string
  fields: string[]
  pageSize: number
}

export interface EditorViewBlockRow {
  id: string
  name: string
  status: string
  updated: string
  meta?: string
}

export interface EditorViewBlockData {
  documents: EditorViewBlockRow[]
  recommendations: EditorViewBlockRow[]
  mindLinks: EditorViewBlockRow[]
}

export const EDITOR_WIDTH_CLASSES: Record<EditorWidthMode, string> = {
  compact: 'max-w-[640px]',
  comfortable: 'max-w-[720px]',
  wide: 'max-w-[860px]',
}

export interface TiptapEditorProps {
  value: TiptapJSONContent
  onChange: (payload: EditorContentPayload) => void
  disabled?: boolean
  placeholder?: string
  toolbarPortalTargetId?: string
  widthMode?: EditorWidthMode
  focusMode?: boolean
  onOutlineChange?: (outline: EditorOutlineItem[]) => void
  onViewBlockSelectionChange?: (selection: EditorViewBlockSelection | null) => void
  viewBlockData?: EditorViewBlockData
  enableBubbleMenu?: boolean
  enableBlockHandles?: boolean
}

interface SlashCommandItem {
  title: string
  label: string
  command: (editor: Editor, range: { from: number; to: number }) => void
}

export interface BlockHandleTarget {
  pos: number
  from: number
  to: number
  depth: number
  parentDepth: number
  parentContentStart: number
  index: number
  type: string
  node: ProseMirrorNode
  dom?: HTMLElement
}

type BlockMovePlacement = 'before' | 'after'

const SUPPORTED_BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'listItem',
  'taskItem',
  'callout',
  'viewBlock',
])

function createViewBlockAttrs(
  name: string,
  viewType: EditorViewBlockSelection['viewType'],
  dataSource: EditorViewBlockSelection['dataSource'],
  fields: string[],
): EditorViewBlockSelection {
  return {
    viewId: `view-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    name,
    viewType,
    dataSource,
    filters: dataSource === 'Tasks' ? 'status != Done' : 'current project',
    sort: dataSource === 'Recommendations' ? 'confidence desc' : 'updated desc',
    fields,
    pageSize: 10,
  }
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    title: 'paragraph',
    label: 'Text',
    command: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: 'heading1',
    label: 'H1',
    command: (editor, range) => editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run(),
  },
  {
    title: 'heading2',
    label: 'H2',
    command: (editor, range) => editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run(),
  },
  {
    title: 'heading3',
    label: 'H3',
    command: (editor, range) => editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run(),
  },
  {
    title: 'taskList',
    label: 'Todo',
    command: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: 'bulletList',
    label: 'Bullet',
    command: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'orderedList',
    label: 'Number',
    command: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'blockquote',
    label: 'Quote',
    command: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: 'codeBlock',
    label: 'Code',
    command: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: 'horizontalRule',
    label: 'Divider',
    command: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: 'callout',
    label: 'Callout',
    command: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().insertContent('Note').run(),
  },
  {
    title: 'projectTasksView',
    label: '当前项目任务',
    command: (editor, range) => editor.chain().focus().deleteRange(range).insertContent({
      type: 'viewBlock',
      attrs: createViewBlockAttrs('当前项目任务', 'Table', 'Tasks', ['任务', '状态', '负责人', '优先级', '截止日期']),
    }).run(),
  },
  {
    title: 'relatedDocumentsView',
    label: '相关文档',
    command: (editor, range) => editor.chain().focus().deleteRange(range).insertContent({
      type: 'viewBlock',
      attrs: createViewBlockAttrs('相关文档', 'List', 'Documents', ['文档', '类型', '关联', '更新日期']),
    }).run(),
  },
  {
    title: 'recommendationQueueView',
    label: '推荐处理',
    command: (editor, range) => editor.chain().focus().deleteRange(range).insertContent({
      type: 'viewBlock',
      attrs: createViewBlockAttrs('推荐处理', 'Queue', 'Recommendations', ['动作', '来源', '预计收益', '操作']),
    }).run(),
  },
  {
    title: 'mindGraphPreviewView',
    label: '关系预览',
    command: (editor, range) => editor.chain().focus().deleteRange(range).insertContent({
      type: 'viewBlock',
      attrs: createViewBlockAttrs('关系预览', 'Graph', 'Mind Links', ['节点', '关系', '强度']),
    }).run(),
  },
  {
    title: 'localDatabaseView',
    label: '局部数据库',
    command: (editor, range) => editor.chain().focus().deleteRange(range).insertContent({
      type: 'viewBlock',
      attrs: createViewBlockAttrs('局部数据库', 'Table', 'Local Database', ['名称', '状态', '更新']),
    }).run(),
  },
]

export const Callout = TiptapNode.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }), 0]
  },
  addCommands() {
    return {
      setCallout: () => ({ commands }: any) => {
        return commands.setNode(this.name)
      },
      toggleCallout: () => ({ commands }: any) => {
        return commands.toggleNode(this.name, 'paragraph')
      },
    } as any
  },
})

export const ViewBlock = TiptapNode.create<{
  data: EditorViewBlockData
}>({
  name: 'viewBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addOptions() {
    return {
      data: {
        documents: [],
        recommendations: [],
        mindLinks: [],
      },
    }
  },

  addAttributes() {
    return {
      viewId: { default: '' },
      name: { default: '数据视图' },
      viewType: { default: 'Table' },
      dataSource: { default: 'Documents' },
      filters: { default: 'current project' },
      sort: { default: 'updated desc' },
      fields: {
        default: ['名称', '状态', '更新'],
        parseHTML: element => {
          const raw = element.getAttribute('data-fields')
          if (!raw) return ['名称', '状态', '更新']
          try {
            const parsed = JSON.parse(raw)
            return Array.isArray(parsed) ? parsed : ['名称', '状态', '更新']
          } catch {
            return ['名称', '状态', '更新']
          }
        },
        renderHTML: attributes => ({ 'data-fields': JSON.stringify(attributes.fields ?? []) }),
      },
      pageSize: { default: 10 },
    }
  },

  parseHTML() {
    return [{ tag: 'section[data-type="view-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const fields = Array.isArray(HTMLAttributes.fields) ? HTMLAttributes.fields : ['名称', '状态', '更新']
    const restAttributes = { ...HTMLAttributes }
    delete (restAttributes as Record<string, unknown>).fields
    const source = String(HTMLAttributes.dataSource ?? 'Documents')
    const viewType = String(HTMLAttributes.viewType ?? 'Table')
    const name = String(HTMLAttributes.name ?? '数据视图')
    const helper = source === 'Tasks' || source === 'Local Database'
      ? '真实数据源未接入，当前显示配置壳'
      : `来自 ${source} 的实时预览`
    return [
      'section',
      mergeAttributes(restAttributes, {
        'data-type': 'view-block',
        'data-view-id': HTMLAttributes.viewId,
        'data-view-type': viewType,
        'data-data-source': source,
        contenteditable: 'false',
      }),
      [
        'div',
        { class: 'atlax-view-block-shell' },
        ['div', { class: 'atlax-view-block-toolbar' },
          ['div', { class: 'atlax-view-block-title' }, name],
          ['div', { class: 'atlax-view-block-meta' }, `${viewType} · ${source}`],
        ],
        ['div', { class: 'atlax-view-block-grid' }, ...fields.slice(0, 5).map((field: string) => ['span', {}, String(field)])],
        ['div', { class: 'atlax-view-block-empty' }, helper],
      ],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ViewBlockNodeView)
  },
})

function ViewBlockNodeView(props: NodeViewProps) {
  const selection = normalizeViewBlockAttrs(props.node.attrs)
  const data = (props.extension.options as { data?: EditorViewBlockData }).data ?? { documents: [], recommendations: [], mindLinks: [] }
  const rows = resolveViewBlockRows(selection, data)
  const getNodePos = () => {
    const pos = props.getPos()
    return typeof pos === 'number' ? pos : 0
  }
  const emptyLabel = selection.dataSource === 'Tasks' || selection.dataSource === 'Local Database'
    ? '真实数据源未接入，当前显示配置壳'
    : '暂无匹配数据'

  return (
    <NodeViewWrapper
      as="section"
      data-type="view-block"
      data-view-id={selection.viewId}
      data-view-type={selection.viewType}
      data-data-source={selection.dataSource}
      className={props.selected ? 'ProseMirror-selectednode' : ''}
    >
      <div className="atlax-view-block-shell">
        <div className="atlax-view-block-toolbar">
          <div className="atlax-view-block-title">{selection.name}</div>
          <div className="atlax-view-block-actions">
            <button type="button" onClick={() => props.editor.commands.setNodeSelection(getNodePos())}>配置</button>
            <button type="button" onClick={() => props.editor.chain().focus().insertContentAt(getNodePos() + props.node.nodeSize, { type: 'paragraph' }).run()}>下方继续</button>
          </div>
          <div className="atlax-view-block-meta">{selection.viewType} · {selection.dataSource}</div>
        </div>
        <div className="atlax-view-block-grid">
          {selection.fields.slice(0, 5).map((field) => <span key={field}>{field}</span>)}
        </div>
        {rows.length > 0 ? (
          <div className="atlax-view-block-rows">
            {rows.slice(0, selection.pageSize).map((row) => (
              <button
                key={row.id}
                type="button"
                className="atlax-view-block-row"
                onClick={() => props.editor.commands.setNodeSelection(getNodePos())}
              >
                <span>{row.name}</span>
                <span>{row.status}</span>
                <span>{row.meta ?? row.updated}</span>
                <span>{row.updated}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="atlax-view-block-empty">{emptyLabel}</div>
        )}
      </div>
    </NodeViewWrapper>
  )
}

function resolveViewBlockRows(selection: EditorViewBlockSelection, data: EditorViewBlockData): EditorViewBlockRow[] {
  if (selection.dataSource === 'Documents') return data.documents
  if (selection.dataSource === 'Recommendations') return data.recommendations
  if (selection.dataSource === 'Mind Links') return data.mindLinks
  return []
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,
        items: ({ query }: { query: string }) => {
          const normalized = query.toLowerCase()
          return SLASH_COMMANDS.filter((item) =>
            item.label.toLowerCase().includes(normalized) ||
            item.title.toLowerCase().includes(normalized)
          ).slice(0, 11)
        },
        command: ({ editor, range, props }: { editor: Editor; range: { from: number; to: number }; props: SlashCommandItem }) => {
          props.command(editor, range)
        },
        render: () => {
          let popup: HTMLDivElement | null = null
          let selectedIndex = 0
          let currentProps: {
            items: SlashCommandItem[]
            command: (item: SlashCommandItem) => void
            clientRect?: (() => DOMRect | null) | null
          } | null = null

          const renderItems = () => {
            if (!popup || !currentProps) return
            popup.innerHTML = ''
            currentProps.items.forEach((item, index) => {
              const button = document.createElement('button')
              button.type = 'button'
              button.textContent = item.label
              button.dataset.command = item.title
              button.className = `w-full px-2.5 py-1.5 text-left text-[11px] rounded-md ${index === selectedIndex ? 'bg-[#86d7ff]/15 text-[#86d7ff]' : 'text-[#dce3e8] hover:bg-white/10'}`
              button.onmousedown = (event) => {
                event.preventDefault()
                currentProps?.command(item)
              }
              popup?.appendChild(button)
            })
          }

          const updatePosition = () => {
            if (!popup || !currentProps?.clientRect) return
            const rect = currentProps.clientRect()
            if (!rect) return
            popup.style.left = `${rect.left}px`
            popup.style.top = `${rect.bottom + 8}px`
          }

          return {
            onStart: (props: typeof currentProps) => {
              currentProps = props
              selectedIndex = 0
              popup = document.createElement('div')
              popup.className = 'tiptap-slash-menu fixed z-[80] w-[190px] rounded-lg border border-white/10 bg-[#151a1e]/95 p-1 shadow-2xl backdrop-blur-xl'
              popup.setAttribute('data-testid', 'tiptap-slash-menu')
              document.body.appendChild(popup)
              renderItems()
              updatePosition()
            },
            onUpdate: (props: typeof currentProps) => {
              currentProps = props
              selectedIndex = Math.min(selectedIndex, Math.max(0, (props?.items.length ?? 1) - 1))
              renderItems()
              updatePosition()
            },
            onKeyDown: ({ event }: { event: KeyboardEvent }) => {
              if (!currentProps) return false
              if (event.key === 'ArrowDown') {
                selectedIndex = (selectedIndex + 1) % Math.max(1, currentProps.items.length)
                renderItems()
                return true
              }
              if (event.key === 'ArrowUp') {
                selectedIndex = (selectedIndex - 1 + Math.max(1, currentProps.items.length)) % Math.max(1, currentProps.items.length)
                renderItems()
                return true
              }
              if (event.key === 'Enter') {
                const item = currentProps.items[selectedIndex]
                if (item) currentProps.command(item)
                return true
              }
              if (event.key === 'Escape') return true
              return false
            },
            onExit: () => {
              popup?.remove()
              popup = null
              currentProps = null
            },
          }
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ]
  },
})

export function extractEditorOutline(doc: TiptapJSONContent | null | undefined): EditorOutlineItem[] {
  const content = doc?.content ?? []
  return content.flatMap((block, index) => {
    if (block.type !== 'heading') return []
    const level = typeof block.attrs?.level === 'number' ? block.attrs.level : 2
    if (level < 1 || level > 3) return []
    const title = collectNodeText(block).trim()
    if (!title) return []
    return [{
      id: `heading-${index}-${slugify(title)}`,
      title,
      level: level as 1 | 2 | 3,
      index,
    }]
  })
}

function findSelectedViewBlock(editor: Editor): EditorViewBlockSelection | null {
  const { selection, doc } = editor.state
  let selected: EditorViewBlockSelection | null = null
  doc.nodesBetween(selection.from, selection.to, (node) => {
    if (selected || node.type.name !== 'viewBlock') return false
    selected = normalizeViewBlockAttrs(node.attrs)
    return false
  })
  if (!selected) {
    const nearby = doc.nodeAt(selection.from)
    if (nearby?.type.name === 'viewBlock') selected = normalizeViewBlockAttrs(nearby.attrs)
  }
  return selected
}

function normalizeViewBlockAttrs(attrs: Record<string, unknown>): EditorViewBlockSelection {
  const fields = Array.isArray(attrs.fields) ? attrs.fields.map(String) : ['名称', '状态', '更新']
  return {
    viewId: String(attrs.viewId || ''),
    name: String(attrs.name || '数据视图'),
    viewType: normalizeViewType(attrs.viewType),
    dataSource: normalizeDataSource(attrs.dataSource),
    filters: String(attrs.filters || 'current project'),
    sort: String(attrs.sort || 'updated desc'),
    fields,
    pageSize: Number(attrs.pageSize || 10),
  }
}

function normalizeViewType(value: unknown): EditorViewBlockSelection['viewType'] {
  if (value === 'Table' || value === 'List' || value === 'Board' || value === 'Graph' || value === 'Queue') return value
  return 'Table'
}

function normalizeDataSource(value: unknown): EditorViewBlockSelection['dataSource'] {
  if (value === 'Tasks' || value === 'Documents' || value === 'Recommendations' || value === 'Mind Links' || value === 'Local Database') return value
  return 'Documents'
}

export function resolveBlockHandleTarget(editor: Editor, element: Element | null): BlockHandleTarget | null {
  if (!element) return null
  const root = editor.view.dom
  const dom = findBlockHandleElement(element, root)
  if (!dom) return null

  const rawPos = editor.view.posAtDOM(dom, 0)
  return createBlockHandleTarget(editor.state.doc, rawPos, dom)
}

export function canMoveBlock(source: BlockHandleTarget | null, target: BlockHandleTarget | null): boolean {
  if (!source || !target) return false
  return source.parentDepth === target.parentDepth &&
    source.parentContentStart === target.parentContentStart &&
    source.from !== target.from
}

export function moveBlockInDocument(
  editor: Editor,
  source: BlockHandleTarget,
  target: BlockHandleTarget,
  placement: BlockMovePlacement = 'before',
): boolean {
  if (!canMoveBlock(source, target)) return false
  const insertTarget = placement === 'after' ? target.to : target.from
  let insertAt = insertTarget
  if (insertAt > source.from) insertAt -= source.node.nodeSize
  const tr = editor.state.tr.delete(source.from, source.to).insert(insertAt, source.node.copy(source.node.content))
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

export function duplicateBlockInDocument(editor: Editor, target: BlockHandleTarget): boolean {
  const tr = editor.state.tr.insert(target.to, target.node.copy(target.node.content))
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

export function deleteBlockInDocument(editor: Editor, target: BlockHandleTarget): boolean {
  if (editor.state.doc.childCount <= 1 && target.depth === 1) {
    editor.commands.clearContent()
    return true
  }
  const tr = editor.state.tr.delete(target.from, target.to)
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

function createBlockHandleTarget(doc: ProseMirrorNode, pos: number, dom?: HTMLElement): BlockHandleTarget | null {
  const safePos = Math.max(0, Math.min(pos, doc.content.size))
  const probePos = Math.max(0, Math.min(safePos + 1, doc.content.size))
  const $pos = doc.resolve(probePos)

  for (let depth = $pos.depth; depth >= 1; depth -= 1) {
    const node = $pos.node(depth)
    if (!SUPPORTED_BLOCK_TYPES.has(node.type.name)) continue
    const from = $pos.before(depth)
    const parentDepth = depth - 1
    return {
      pos: from,
      from,
      to: from + node.nodeSize,
      depth,
      parentDepth,
      parentContentStart: parentDepth === 0 ? 0 : $pos.before(parentDepth) + 1,
      index: $pos.index(parentDepth),
      type: node.type.name,
      node,
      dom,
    }
  }

  const node = doc.nodeAt(safePos)
  if (!node || !SUPPORTED_BLOCK_TYPES.has(node.type.name)) return null
  return {
    pos: safePos,
    from: safePos,
    to: safePos + node.nodeSize,
    depth: 1,
    parentDepth: 0,
    parentContentStart: 0,
    index: doc.childBefore(safePos + 1).index,
    type: node.type.name,
    node,
    dom,
  }
}

export function TiptapEditor({
  value,
  onChange,
  disabled,
  placeholder,
  toolbarPortalTargetId,
  widthMode = 'comfortable',
  focusMode = false,
  onOutlineChange,
  onViewBlockSelectionChange,
  viewBlockData,
  enableBubbleMenu = true,
  enableBlockHandles = false,
}: TiptapEditorProps) {
  const [showHtml, setShowHtml] = useState(false)
  const [toolbarTarget, setToolbarTarget] = useState<HTMLElement | null>(null)
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; url: string }>({ open: false, url: '' })
  const latestValue = useRef(value)
  const valueKey = JSON.stringify(value ?? createEmptyTiptapDoc())

  const extensions = useMemo(() => [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: false,
    }),
    Link.configure({
      autolink: true,
      openOnClick: false,
      linkOnPaste: true,
    }),
    Highlight.configure({
      multicolor: false,
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Placeholder.configure({
      placeholder: placeholder ?? 'Start writing, or press / for blocks.',
    }),
    SlashCommand,
    Callout,
    ViewBlock.configure({
      data: viewBlockData ?? { documents: [], recommendations: [], mindLinks: [] },
    }),
    PasteNormalizer,
  ], [placeholder, viewBlockData])

  const editor = useEditor({
    extensions,
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const payload = createEditorContentPayload(editor.getJSON() as TiptapJSONContent, editor.getText())
      latestValue.current = payload.contentJson
      onChange(payload)
    },
    onSelectionUpdate: ({ editor }) => {
      onViewBlockSelectionChange?.(findSelectedViewBlock(editor))
    },
  }, [extensions, disabled])

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [editor, disabled])

  useEffect(() => {
    if (!editor) return
    const incoming = JSON.stringify(value ?? createEmptyTiptapDoc())
    const current = JSON.stringify(editor.getJSON())
    if (incoming !== current) {
      latestValue.current = value
      ;(editor.commands.setContent as unknown as (content: TiptapJSONContent, emitUpdate?: boolean) => boolean)(value, false)
    }
  }, [editor, valueKey, value])

  const payload = useMemo(() => createEditorContentPayload(value), [value])
  const outline = useMemo(() => extractEditorOutline(value), [valueKey, value])

  useEffect(() => {
    onOutlineChange?.(outline)
  }, [onOutlineChange, outline])

  useEffect(() => {
    if (!toolbarPortalTargetId) {
      setToolbarTarget(null)
      return
    }
    setToolbarTarget(document.getElementById(toolbarPortalTargetId))
  }, [toolbarPortalTargetId])

  const openLinkDialog = () => {
    if (!editor) return
    const previousUrl = editor.getAttributes('link').href as string | undefined
    setLinkDialog({ open: true, url: previousUrl ?? '' })
  }

  const closeLinkDialog = () => {
    setLinkDialog({ open: false, url: '' })
  }

  const applyLinkDialog = () => {
    if (!editor) return
    const url = linkDialog.url.trim()
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      closeLinkDialog()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    closeLinkDialog()
  }

  const jumpToHeading = (outlineIndex: number) => {
    const root = document.querySelector('.tiptap-editor .ProseMirror')
    const headings = root?.querySelectorAll('h1, h2, h3')
    const target = headings?.[outlineIndex]
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const toolbar = (
    <div
      className={`tiptap-toolbar flex items-center gap-0.5 overflow-x-auto custom-scrollbar ${
        toolbarPortalTargetId
          ? 'h-full w-full min-w-0 px-1 py-0 bg-transparent border-0 rounded-none'
          : 'px-2 py-1 bg-[#1c2023]/60 border border-white/5 rounded-xl mb-3 flex-wrap'
      }`}
      data-testid="tiptap-toolbar"
    >
      <ToolbarBtn icon={Bold} label="粗体" onClick={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive('bold')} disabled={disabled || !editor} />
      <ToolbarBtn icon={Italic} label="斜体" onClick={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive('italic')} disabled={disabled || !editor} />
      <ToolbarBtn icon={Strikethrough} label="删除线" onClick={() => editor?.chain().focus().toggleStrike().run()} active={editor?.isActive('strike')} disabled={disabled || !editor} />
      <ToolbarBtn icon={LinkIcon} label="链接" onClick={openLinkDialog} active={editor?.isActive('link')} disabled={disabled || !editor} />
      <ToolbarBtn icon={Highlighter} label="高亮" onClick={() => editor?.chain().focus().toggleHighlight().run()} active={editor?.isActive('highlight')} disabled={disabled || !editor} />
      <ToolbarSep />
      <ToolbarBtn icon={Pilcrow} label="正文" onClick={() => editor?.chain().focus().setParagraph().run()} active={editor?.isActive('paragraph')} disabled={disabled || !editor} />
      <ToolbarBtn icon={Hash} label="标题" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} active={editor?.isActive('heading', { level: 2 })} disabled={disabled || !editor} />
      <ToolbarBtn icon={CheckSquare} label="待办" onClick={() => editor?.chain().focus().toggleTaskList().run()} active={editor?.isActive('taskList')} disabled={disabled || !editor} />
      <ToolbarBtn icon={Quote} label="引用" onClick={() => editor?.chain().focus().toggleBlockquote().run()} active={editor?.isActive('blockquote')} disabled={disabled || !editor} />
      <ToolbarBtn icon={Code} label="行内代码" onClick={() => editor?.chain().focus().toggleCode().run()} active={editor?.isActive('code')} disabled={disabled || !editor} />
      <ToolbarBtn icon={FileCode} label="代码块" onClick={() => editor?.chain().focus().toggleCodeBlock().run()} active={editor?.isActive('codeBlock')} disabled={disabled || !editor} />
      <ToolbarSep />
      <ToolbarBtn icon={List} label="无序列表" onClick={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive('bulletList')} disabled={disabled || !editor} />
      <ToolbarBtn icon={ListOrdered} label="有序列表" onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive('orderedList')} disabled={disabled || !editor} />
      <ToolbarBtn icon={Minus} label="分割线" onClick={() => editor?.chain().focus().setHorizontalRule().run()} disabled={disabled || !editor} />
      <ToolbarSep />
      <ToolbarBtn icon={Eye} label="HTML 预览" onClick={() => setShowHtml((v) => !v)} active={showHtml} disabled={!editor} />
    </div>
  )

  return (
    <div
      className={`tiptap-editor ${EDITOR_WIDTH_CLASSES[widthMode]}`}
      data-testid="tiptap-editor"
      data-width-mode={widthMode}
      data-focus-mode={focusMode ? 'true' : 'false'}
    >
      {toolbarPortalTargetId ? (toolbarTarget ? createPortal(toolbar, toolbarTarget) : null) : toolbar}

      {enableBubbleMenu && editor && !disabled && (
        <BubbleMenu
          editor={editor}
          updateDelay={80}
          options={{ placement: 'top', offset: 8 }}
          className="tiptap-bubble-menu flex items-center gap-0.5 rounded-lg border border-white/10 bg-[#151a1e]/95 p-1 shadow-2xl backdrop-blur-xl"
          data-testid="tiptap-bubble-menu"
        >
          <ToolbarBtn icon={Bold} label="粗体" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} />
          <ToolbarBtn icon={Italic} label="斜体" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} />
          <ToolbarBtn icon={Strikethrough} label="删除线" onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} />
          <ToolbarBtn icon={LinkIcon} label="链接" onClick={openLinkDialog} active={editor.isActive('link')} />
          <ToolbarBtn icon={Code} label="行内代码" onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} />
          <ToolbarBtn icon={Highlighter} label="高亮" onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} />
        </BubbleMenu>
      )}

      <div className="relative">
        {editor && !disabled && enableBlockHandles && <BlockHandleController editor={editor} />}
        <EditorContent editor={editor} />
      </div>

      {linkDialog.open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#05080a]/55 backdrop-blur-sm" data-testid="tiptap-link-dialog">
          <div className="w-[420px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[#1c2023]/95 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-white">链接</h3>
                <p className="mt-1 text-[11px] text-[#899298]">输入 URL，留空则移除当前链接。</p>
              </div>
              <button
                type="button"
                onClick={closeLinkDialog}
                className="rounded-md px-2 py-1 text-[12px] text-[#899298] hover:bg-white/10 hover:text-white"
              >
                关闭
              </button>
            </div>
            <input
              autoFocus
              value={linkDialog.url}
              onChange={(event) => setLinkDialog((current) => ({ ...current, url: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyLinkDialog()
                if (event.key === 'Escape') closeLinkDialog()
              }}
              placeholder="https://example.com"
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-[#e0e3e6] outline-none placeholder:text-[#899298]/50 focus:border-[#86d7ff]/45"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeLinkDialog}
                className="rounded-lg bg-white/5 px-3 py-2 text-[12px] text-[#899298] hover:bg-white/10 hover:text-white"
              >
                取消
              </button>
              <button
                type="button"
                onClick={applyLinkDialog}
                className="rounded-lg bg-[#86d7ff]/15 px-3 py-2 text-[12px] font-medium text-[#86d7ff] hover:bg-[#86d7ff]/25"
              >
                应用
              </button>
            </div>
          </div>
        </div>
      )}

      {!focusMode && outline.length > 0 && (
        <EditorOutlineRail outline={outline} onJump={jumpToHeading} />
      )}

      {showHtml && (
        <div className="fixed bottom-5 right-5 z-[75] w-[420px] max-w-[calc(100vw-2rem)] rounded-xl border border-white/[0.1] bg-[#111619]/95 p-3 shadow-2xl backdrop-blur-xl" data-testid="tiptap-html-preview">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase text-[#899298]">HTML Preview</div>
            <button
              type="button"
              onClick={() => setShowHtml(false)}
              className="rounded p-1 text-[#899298] hover:bg-white/10 hover:text-white"
            >
              ×
            </button>
          </div>
          <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[#cfd7dc]">{payload.html}</pre>
        </div>
      )}

      <style jsx global>{`
        .tiptap-editor .ProseMirror {
          min-height: 52vh;
          outline: none;
          color: #e0e3e6;
          font-size: 16px;
          font-weight: 300;
          line-height: 1.82;
          caret-color: #86d7ff;
        }
        .tiptap-editor .ProseMirror p {
          margin: 0 0 0.72rem;
        }
        .tiptap-editor .ProseMirror h1,
        .tiptap-editor .ProseMirror h2,
        .tiptap-editor .ProseMirror h3 {
          color: #fff;
          font-weight: 700;
          line-height: 1.24;
        }
        .tiptap-editor .ProseMirror h1 { margin: 2.2rem 0 0.75rem; font-size: 1.9rem; }
        .tiptap-editor .ProseMirror h2 { margin: 2rem 0 0.62rem; font-size: 1.45rem; }
        .tiptap-editor .ProseMirror h3 { margin: 1.65rem 0 0.5rem; font-size: 1.18rem; }
        .tiptap-editor .ProseMirror blockquote {
          margin: 0 0 1rem;
          border-left: 2px solid rgba(134, 215, 255, 0.36);
          padding-left: 0.85rem;
          color: #c1c9ce;
          background: rgba(255, 255, 255, 0.018);
        }
        .tiptap-editor .ProseMirror ul,
        .tiptap-editor .ProseMirror ol {
          margin: 0 0 0.95rem;
          padding-left: 1.2rem;
        }
        .tiptap-editor .ProseMirror ul { list-style-type: disc; }
        .tiptap-editor .ProseMirror ol { list-style-type: decimal; }
        .tiptap-editor .ProseMirror ul[data-type='taskList'] {
          list-style: none;
          padding-left: 0;
        }
        .tiptap-editor .ProseMirror ul[data-type='taskList'] li {
          display: flex;
          gap: 0.55rem;
        }
        .tiptap-editor .ProseMirror ul[data-type='taskList'] li > label {
          padding-top: 0.08rem;
        }
        .tiptap-editor .ProseMirror li {
          margin: 0.16rem 0;
          padding-left: 0.12rem;
        }
        .tiptap-editor .ProseMirror li::marker {
          color: #cfd7dc;
          font-weight: 500;
        }
        .tiptap-editor .ProseMirror li p {
          margin: 0;
        }
        .tiptap-editor .ProseMirror code {
          border-radius: 0.35rem;
          background: rgba(255, 255, 255, 0.08);
          padding: 0.1rem 0.25rem;
          color: #9cf4d4;
        }
        .tiptap-editor .ProseMirror mark {
          border-radius: 0.25rem;
          background: rgba(251, 191, 36, 0.22);
          color: #fff;
          padding: 0 0.12rem;
        }
        .tiptap-editor .ProseMirror a {
          color: #9edcff;
          text-decoration: underline;
          text-decoration-color: rgba(158, 220, 255, 0.45);
          text-underline-offset: 3px;
        }
        .tiptap-editor .ProseMirror pre {
          margin: 0 0 1rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 0.65rem;
          background: #111619;
          padding: 0.85rem;
          color: #dce3e8;
          overflow-x: auto;
        }
        .tiptap-editor .ProseMirror pre code {
          background: transparent;
          padding: 0;
          color: inherit;
        }
        .tiptap-editor .ProseMirror hr {
          margin: 1.45rem 0;
          border: none;
          border-top: 1px solid rgba(255, 255, 255, 0.12);
        }
        .tiptap-editor .ProseMirror .atlax-block-selected {
          border-radius: 0.45rem;
          background: rgba(134, 215, 255, 0.045);
          box-shadow: -2px 0 0 rgba(134, 215, 255, 0.36);
        }
        .tiptap-editor .is-editor-empty:first-child::before,
        .tiptap-editor .is-empty::before {
          color: rgba(137, 146, 152, 0.52);
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .tiptap-editor .ProseMirror [data-type="callout"] {
          margin: 1.25rem 0;
          padding: 1.1rem 1.25rem;
          border-radius: 0.85rem;
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: #e0e3e6;
          position: relative;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        .tiptap-editor .ProseMirror [data-type="callout"]::before {
          content: '💡';
          position: absolute;
          left: -12px;
          top: -10px;
          font-size: 1.1rem;
          background: #1c2023;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .tiptap-editor .ProseMirror [data-type="view-block"] {
          margin: 1.25rem 0;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 0.5rem;
          background: rgba(13, 18, 21, 0.58);
          overflow: hidden;
        }
        .tiptap-editor .ProseMirror [data-type="view-block"].ProseMirror-selectednode {
          border-color: rgba(134, 215, 255, 0.45);
          box-shadow: 0 0 0 1px rgba(134, 215, 255, 0.18);
        }
        .atlax-view-block-shell {
          color: #dce3e8;
          font-size: 12px;
          line-height: 1.4;
        }
        .atlax-view-block-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          padding: 0.45rem 0.6rem;
          background: rgba(255, 255, 255, 0.025);
        }
        .atlax-view-block-actions {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }
        .atlax-view-block-actions button {
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 0.35rem;
          background: rgba(255, 255, 255, 0.04);
          padding: 0.18rem 0.45rem;
          color: rgba(220, 227, 232, 0.76);
          font-size: 10px;
        }
        .atlax-view-block-actions button:hover {
          border-color: rgba(134, 215, 255, 0.26);
          color: #86d7ff;
        }
        .atlax-view-block-title {
          color: #fff;
          font-weight: 600;
        }
        .atlax-view-block-meta {
          color: rgba(137, 146, 152, 0.9);
          font-size: 10px;
        }
        .atlax-view-block-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          color: rgba(220, 227, 232, 0.82);
          font-size: 10px;
          font-weight: 600;
        }
        .atlax-view-block-grid span {
          border-right: 1px solid rgba(255, 255, 255, 0.06);
          padding: 0.42rem 0.55rem;
        }
        .atlax-view-block-grid span:last-child {
          border-right: 0;
        }
        .atlax-view-block-empty {
          padding: 0.65rem 0.6rem;
          color: rgba(137, 146, 152, 0.82);
          font-size: 11px;
        }
        .atlax-view-block-rows {
          display: flex;
          flex-direction: column;
        }
        .atlax-view-block-row {
          display: grid;
          grid-template-columns: minmax(120px, 1.6fr) minmax(80px, 0.8fr) minmax(96px, 1fr) minmax(80px, 0.8fr);
          align-items: center;
          border: 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.055);
          background: transparent;
          color: rgba(220, 227, 232, 0.84);
          text-align: left;
          font-size: 11px;
        }
        .atlax-view-block-row:hover {
          background: rgba(255, 255, 255, 0.035);
        }
        .atlax-view-block-row span {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          padding: 0.48rem 0.55rem;
        }
      `}</style>
    </div>
  )
}

function BlockHandleController({ editor }: { editor: Editor }) {
  const [hoverTarget, setHoverTarget] = useState<BlockHandleTarget | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<BlockHandleTarget | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dragState, setDragState] = useState<{ source: BlockHandleTarget } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ target: BlockHandleTarget; placement: BlockMovePlacement } | null>(null)
  const [handleStyle, setHandleStyle] = useState<React.CSSProperties>({})
  const [dropStyle, setDropStyle] = useState<React.CSSProperties | null>(null)
  const [copied, setCopied] = useState(false)
  const [insertMenuOpen, setInsertMenuOpen] = useState(false)
  const [insertPlacement, setInsertPlacement] = useState<BlockMovePlacement>('after')
  const handleRef = useRef<HTMLDivElement | null>(null)
  const clickTimerRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const pendingPositionTargetRef = useRef<BlockHandleTarget | null>(null)
  const lastHandleKeyRef = useRef('')
  const selectedDomRef = useRef<HTMLElement | null>(null)
  const clearHoverTimerRef = useRef<number | null>(null)

  const activeTarget = selectedTarget ?? hoverTarget
  const visible = Boolean(activeTarget || menuOpen || insertMenuOpen || dragState)

  const positionHandle = (target: BlockHandleTarget | null) => {
    if (!target?.dom) return
    const rootRect = editor.view.dom.getBoundingClientRect()
    const blockRect = target.dom.getBoundingClientRect()
    const lineCenter = Math.min(Math.max(blockRect.height / 2, 13), 20)
    const nextStyle: React.CSSProperties = {
      position: 'fixed',
      left: rootRect.left - 68,
      top: blockRect.top + lineCenter - 14,
    }
    if (handleRef.current) {
      handleRef.current.style.position = 'fixed'
      handleRef.current.style.left = `${nextStyle.left}px`
      handleRef.current.style.top = `${nextStyle.top}px`
    }
    const key = `${target.from}:${Math.round(Number(nextStyle.left))}:${Math.round(Number(nextStyle.top))}`
    if (key !== lastHandleKeyRef.current) {
      lastHandleKeyRef.current = key
      setHandleStyle(nextStyle)
    }
  }

  const schedulePosition = (target: BlockHandleTarget | null = activeTarget) => {
    pendingPositionTargetRef.current = target
    if (rafRef.current != null) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      positionHandle(pendingPositionTargetRef.current)
    })
  }

  const setCurrentHover = (target: BlockHandleTarget | null) => {
    if (clearHoverTimerRef.current != null) {
      window.clearTimeout(clearHoverTimerRef.current)
      clearHoverTimerRef.current = null
    }
    setHoverTarget((current) => {
      if (current?.from === target?.from && current?.dom === target?.dom) return current
      return target
    })
    if (target) schedulePosition(target)
    if (target) positionHandle(target)
  }

  useEffect(() => {
    schedulePosition()
  })

  useEffect(() => {
    return () => {
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current)
      if (clearHoverTimerRef.current != null) window.clearTimeout(clearHoverTimerRef.current)
    }
  }, [])

  useEffect(() => {
    selectedDomRef.current?.classList.remove('atlax-block-selected')
    selectedDomRef.current = selectedTarget?.dom ?? null
    selectedDomRef.current?.classList.add('atlax-block-selected')
    return () => {
      selectedDomRef.current?.classList.remove('atlax-block-selected')
    }
  }, [selectedTarget])

  useEffect(() => {
    const syncFromSelection = () => {
      const target = resolveBlockHandleTargetFromSelection(editor)
      if (target) {
        setSelectedTarget(null)
        setCurrentHover(target)
      }
    }
    const onPointerMove = (event: PointerEvent) => {
      if (menuOpen || dragState) return
      if (handleRef.current?.contains(event.target as Node)) {
        if (activeTarget) schedulePosition(activeTarget)
        return
      }
      const target = resolveBlockHandleTargetFromPoint(editor, event.clientX, event.clientY, event.target as Element | null)
      if (target) {
        setCurrentHover(target)
      } else if (!selectedTarget) {
        if (clearHoverTimerRef.current == null) {
          clearHoverTimerRef.current = window.setTimeout(() => {
            clearHoverTimerRef.current = null
            setCurrentHover(null)
          }, 450)
        }
      }
    }
    const onScrollOrResize = () => {
      if (menuOpen) {
        setMenuOpen(false)
        setCopied(false)
      }
      schedulePosition()
    }
    const onMouseDown = (event: MouseEvent) => {
      if (handleRef.current && !handleRef.current.contains(event.target as any)) {
        setMenuOpen(false)
        setInsertMenuOpen(false)
        setCopied(false)
        setSelectedTarget(null)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        setInsertMenuOpen(false)
        setCopied(false)
        setSelectedTarget(null)
      }
    }
    document.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    editor.on('selectionUpdate', syncFromSelection)
    editor.on('focus', syncFromSelection)
    syncFromSelection()
    return () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
      editor.off('selectionUpdate', syncFromSelection)
      editor.off('focus', syncFromSelection)
    }
  }, [editor, menuOpen, insertMenuOpen, dragState, activeTarget, selectedTarget])

  useEffect(() => {
    if (!dragState) return

    const onDragOver = (event: DragEvent) => {
      const target = resolveBlockHandleTargetFromPoint(editor, event.clientX, event.clientY, document.elementFromPoint(event.clientX, event.clientY))
      if (!target || !canMoveBlock(dragState.source, target)) {
        setDropTarget(null)
        setDropStyle(null)
        return
      }
      event.preventDefault()
      const rect = target.dom?.getBoundingClientRect()
      if (!rect) return
      const placement: BlockMovePlacement = event.clientY > rect.top + rect.height / 2 ? 'after' : 'before'
      setDropTarget({ target, placement })
      setDropStyle({
        position: 'fixed',
        left: rect.left,
        top: placement === 'after' ? rect.bottom + 4 : rect.top - 4,
        width: rect.width,
      })
    }
    const onDrop = (event: DragEvent) => {
      if (dropTarget && moveBlockInDocument(editor, dragState.source, dropTarget.target, dropTarget.placement)) {
        event.preventDefault()
      }
      setDragState(null)
      setDropTarget(null)
      setDropStyle(null)
      setMenuOpen(false)
      editor.commands.focus()
    }
    const onDragEnd = () => {
      setDragState(null)
      setDropTarget(null)
      setDropStyle(null)
    }

    document.addEventListener('dragover', onDragOver)
    document.addEventListener('drop', onDrop)
    document.addEventListener('dragend', onDragEnd)
    return () => {
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('drop', onDrop)
      document.removeEventListener('dragend', onDragEnd)
    }
  }, [editor, dragState, dropTarget])

  const runWithSelectedBlock = (callback: (target: BlockHandleTarget) => void) => {
    const target = selectedTarget ?? hoverTarget
    if (!target) return
    callback(target)
    schedulePosition(target)
  }

  const focusBlock = (target: BlockHandleTarget) => {
    const from = Math.min(target.from + 1, editor.state.doc.content.size)
    const to = Math.max(from, Math.min(target.to - 1, editor.state.doc.content.size))
    editor.chain().focus().setTextSelection({ from, to }).run()
  }

  const closeMenu = () => {
    setMenuOpen(false)
    setInsertMenuOpen(false)
    setCopied(false)
    editor.commands.focus()
  }

  const handlePlusClick = (target: BlockHandleTarget | null) => {
    if (!target) return
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
      setInsertPlacement('before')
      setSelectedTarget(target)
      setInsertMenuOpen(true)
      setMenuOpen(false)
    } else {
      clickTimerRef.current = window.setTimeout(() => {
        clickTimerRef.current = null
        setInsertPlacement('after')
        setSelectedTarget(target)
        setInsertMenuOpen(true)
        setMenuOpen(false)
      }, 250)
    }
  }

  const turnInto = (type: 'paragraph' | 'h1' | 'h2' | 'h3' | 'quote' | 'code') => {
    runWithSelectedBlock((target) => {
      focusBlock(target)
      if (type === 'paragraph') editor.chain().focus().setParagraph().run()
      if (type === 'h1') editor.chain().focus().setHeading({ level: 1 }).run()
      if (type === 'h2') editor.chain().focus().setHeading({ level: 2 }).run()
      if (type === 'h3') editor.chain().focus().setHeading({ level: 3 }).run()
      if (type === 'quote') editor.chain().focus().toggleBlockquote().run()
      if (type === 'code') editor.chain().focus().toggleCodeBlock().run()
      closeMenu()
    })
  }

  const copyBlockLink = async () => {
    const target = selectedTarget ?? hoverTarget
    if (!target) return
    const base = `${window.location.origin}${window.location.pathname}`
    const url = `${base}#block-${target.from}`
    try {
      await navigator.clipboard?.writeText(url)
      setCopied(true)
    } catch {
      setCopied(true)
    }
    editor.commands.focus()
  }

  return (
    <>
      <div
        ref={handleRef}
        className={`tiptap-block-handle-controller fixed z-[70] transition-opacity duration-100 ${
          visible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        data-testid="tiptap-block-handle-controller"
        style={handleStyle}
        onMouseDown={(event) => event.preventDefault()}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.06] bg-[#12171a]/70 text-[#65727a] shadow-lg backdrop-blur-xl transition-colors hover:border-white/10 hover:bg-[#1c2023]/90 hover:text-[#86d7ff]"
            onClick={() => handlePlusClick(activeTarget)}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            draggable
            aria-label="Block actions"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.06] bg-[#12171a]/70 text-[#65727a] shadow-lg backdrop-blur-xl transition-colors hover:border-white/10 hover:bg-[#1c2023]/90 hover:text-[#86d7ff]"
            onClick={() => {
              const target = activeTarget
              if (!target) return
              setSelectedTarget(target)
              setMenuOpen(true)
              setInsertMenuOpen(false)
              schedulePosition(target)
            }}
            onDragStart={(event) => {
              const target = activeTarget
              if (!target) return
              setSelectedTarget(target)
              setDragState({ source: target })
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', `block-${target.from}`)
            }}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        </div>

        {insertMenuOpen && selectedTarget && (
          <BlockInsertMenu
            editor={editor}
            target={selectedTarget}
            placement={insertPlacement}
            onClose={() => setInsertMenuOpen(false)}
          />
        )}

        {menuOpen && selectedTarget && (
          <div
            className="tiptap-block-action-menu absolute left-9 top-0 w-[230px] rounded-[16px] border border-white/10 bg-[#1c2023]/90 p-1.5 text-sm text-[#dce3e8] shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-[24px]"
            data-testid="tiptap-block-action-menu"
            onMouseDown={(event) => event.preventDefault()}
          >
            <BlockMenuSubmenu label="Turn into" icon={Type}>
              <BlockMenuButton label="Text" onClick={() => turnInto('paragraph')} />
              <BlockMenuButton label="Heading 1" onClick={() => turnInto('h1')} />
              <BlockMenuButton label="Heading 2" onClick={() => turnInto('h2')} />
              <BlockMenuButton label="Heading 3" onClick={() => turnInto('h3')} />
              <BlockMenuButton label="Quote" onClick={() => turnInto('quote')} />
              <BlockMenuButton label="Code" onClick={() => turnInto('code')} />
            </BlockMenuSubmenu>
            <BlockMenuButton
              label="Color"
              icon={Palette}
              onClick={() => runWithSelectedBlock((target) => {
                focusBlock(target)
                editor.chain().focus().toggleHighlight().run()
                closeMenu()
              })}
            />
            <BlockMenuSep />
            <BlockMenuButton label={copied ? 'Copied block link' : 'Copy link to block'} icon={Copy} onClick={copyBlockLink} />
            <BlockMenuButton
              label="Duplicate"
              icon={Copy}
              onClick={() => runWithSelectedBlock((target) => {
                duplicateBlockInDocument(editor, target)
                closeMenu()
              })}
            />
            <BlockMenuButton
              label="Move up"
              icon={ArrowUp}
              onClick={() => runWithSelectedBlock((target) => {
                const sibling = findSiblingBlockTarget(editor, target, -1)
                if (sibling) moveBlockInDocument(editor, target, sibling, 'before')
                closeMenu()
              })}
            />
            <BlockMenuButton
              label="Move down"
              icon={ArrowDown}
              onClick={() => runWithSelectedBlock((target) => {
                const sibling = findSiblingBlockTarget(editor, target, 1)
                if (sibling) moveBlockInDocument(editor, target, sibling, 'after')
                closeMenu()
              })}
            />
            <BlockMenuSep />
            <BlockMenuButton
              label="Delete"
              icon={Trash2}
              danger
              onClick={() => runWithSelectedBlock((target) => {
                deleteBlockInDocument(editor, target)
                setSelectedTarget(null)
                closeMenu()
              })}
            />
          </div>
        )}
      </div>

      {dropStyle && (
        <div
          className="tiptap-block-drop-indicator pointer-events-none z-[69] h-px rounded-full bg-[#86d7ff]/80 shadow-[0_0_16px_rgba(134,215,255,0.45)]"
          data-testid="tiptap-block-drop-indicator"
          style={dropStyle}
        />
      )}
    </>
  )
}

function BlockInsertMenu({
  editor,
  target,
  placement,
  onClose,
}: {
  editor: Editor
  target: BlockHandleTarget
  placement: BlockMovePlacement
  onClose: () => void
}) {
  const [filter, setFilter] = useState('')
  const insertAt = placement === 'after' ? target.to : target.from
  return <InsertMenuContent editor={editor} insertAt={insertAt} filter={filter} setFilter={setFilter} onClose={onClose} className="tiptap-block-insert-menu absolute left-0 top-9 z-[80] w-[260px] rounded-[16px] border border-white/10 bg-[#1c2023]/92 p-1.5 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-[24px]" />
}

function InsertMenuContent({
  editor,
  insertAt,
  filter,
  setFilter,
  onClose,
  className,
}: {
  editor: Editor
  insertAt: number
  filter: string
  setFilter: (value: string) => void
  onClose: () => void
  className: string
}) {
  const items: Array<{
    title: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    group: string
    action?: () => boolean
    disabled?: boolean
  }> = [
    { title: 'Project Tasks', label: '当前项目任务', icon: CheckSquare, group: 'Data views', action: () => editor.chain().focus().insertContentAt(insertAt, { type: 'viewBlock', attrs: createViewBlockAttrs('当前项目任务', 'Table', 'Tasks', ['任务', '状态', '负责人', '优先级', '截止日期']) }).run() },
    { title: 'Related Documents', label: '相关文档', icon: FileText, group: 'Data views', action: () => editor.chain().focus().insertContentAt(insertAt, { type: 'viewBlock', attrs: createViewBlockAttrs('相关文档', 'List', 'Documents', ['文档', '类型', '关联', '更新日期']) }).run() },
    { title: 'Recommendation Queue', label: '推荐处理', icon: Terminal, group: 'Data views', action: () => editor.chain().focus().insertContentAt(insertAt, { type: 'viewBlock', attrs: createViewBlockAttrs('推荐处理', 'Queue', 'Recommendations', ['动作', '来源', '预计收益', '操作']) }).run() },
    { title: 'Mind Graph Preview', label: '关系预览', icon: Search, group: 'Data views', action: () => editor.chain().focus().insertContentAt(insertAt, { type: 'viewBlock', attrs: createViewBlockAttrs('关系预览', 'Graph', 'Mind Links', ['节点', '关系', '强度']) }).run() },
    { title: 'Local Database', label: '局部数据库', icon: FileCode, group: 'Data views', action: () => editor.chain().focus().insertContentAt(insertAt, { type: 'viewBlock', attrs: createViewBlockAttrs('局部数据库', 'Table', 'Local Database', ['名称', '状态', '更新']) }).run() },
    { title: 'Code', label: 'Code', icon: FileCode, group: 'Suggested', action: () => editor.chain().focus().insertContentAt(insertAt, { type: 'codeBlock' }).run() },
    { title: 'Quote', label: 'Quote', icon: Quote, group: 'Suggested', action: () => editor.chain().focus().insertContentAt(insertAt, { type: 'blockquote', content: [{ type: 'paragraph' }] }).run() },
    { title: 'Callout', label: 'Callout', icon: Terminal, group: 'Suggested', action: () => editor.chain().focus().insertContentAt(insertAt, { type: 'callout', content: [{ type: 'paragraph' }] }).run() },
    { title: 'Text', label: 'Text', icon: Pilcrow, group: 'Basic blocks', action: () => editor.chain().focus().insertContentAt(insertAt, { type: 'paragraph' }).run() },
  ]

  const filteredItems = items.filter(item => 
    item.label.toLowerCase().includes(filter.toLowerCase()) ||
    item.title.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div 
      className={className}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 px-2.5 py-2 border-b border-white/5 mb-1.5">
        <Search className="h-3.5 w-3.5 text-[#899298]" />
        <input
          autoFocus
          className="bg-transparent border-none outline-none text-[12px] text-white w-full placeholder:text-[#899298]/50"
          placeholder="Type to filter..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && filteredItems.length > 0) {
               const first = filteredItems[0]
               if (!first.disabled) {
                 first.action?.()
                 onClose()
               }
            }
          }}
        />
      </div>
      
      <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
        {['Data views', 'Suggested', 'Basic blocks'].map(group => {
          const groupItems = filteredItems.filter(i => i.group === group)
          if (groupItems.length === 0) return null
          return (
            <div key={group} className="mb-2 last:mb-0">
              <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase text-[#899298] tracking-wider">{group}</div>
              {groupItems.map(item => (
                <button
                  key={item.title}
                  type="button"
                  disabled={item.disabled}
                  className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors ${
                    item.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/[0.08]'
                  }`}
                  onClick={() => {
                    item.action?.()
                    onClose()
                  }}
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.04] border border-white/[0.06]">
                    <item.icon className="h-3.5 w-3.5 text-[#dce3e8]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-[#dce3e8] font-medium leading-tight">
                      {item.label} {item.disabled && <span className="text-[9px] opacity-60 ml-1">(Later)</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )
        })}
      </div>
      
      <div className="mt-1 border-t border-white/5 pt-1 flex items-center justify-between px-2.5 py-1.5">
         <span className="text-[10px] text-[#899298]">Close menu</span>
         <span className="text-[9px] text-[#59646b] bg-white/5 px-1 rounded uppercase tracking-tighter">esc</span>
      </div>
    </div>
  )
}

function BlockMenuButton({
  label,
  icon: Icon,
  danger,
  onClick,
}: {
  label: string
  icon?: React.ComponentType<{ className?: string }>
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[12px] transition-colors ${
        danger ? 'text-[#ff9a9a] hover:bg-[#ff6b6b]/10' : 'text-[#dce3e8] hover:bg-white/[0.07] hover:text-white'
      }`}
      onClick={onClick}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

function BlockMenuSubmenu({
  label,
  icon: Icon,
  children,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="group/submenu relative">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[12px] text-[#dce3e8] transition-colors hover:bg-white/[0.07] hover:text-white"
      >
        <Icon className="h-3.5 w-3.5" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronRight className="h-3.5 w-3.5 text-[#899298]" />
      </button>
      <div className="pointer-events-none absolute left-[calc(100%-0.25rem)] top-0 w-[170px] rounded-[14px] border border-white/10 bg-[#1c2023]/95 p-1.5 opacity-0 shadow-[0_20px_70px_rgba(0,0,0,0.55)] backdrop-blur-[24px] transition-opacity group-hover/submenu:pointer-events-auto group-hover/submenu:opacity-100">
        {children}
      </div>
    </div>
  )
}

function BlockMenuSep() {
  return <div className="my-1 h-px bg-white/[0.07]" />
}

function EditorOutlineRail({
  outline,
  onJump,
}: {
  outline: EditorOutlineItem[]
  onJump: (outlineIndex: number) => void
}) {
  return (
    <div className="editor-outline-rail fixed right-8 top-1/2 z-30 hidden -translate-y-1/2 items-center md:flex" data-testid="editor-outline-rail">
      <div className="group relative flex min-h-[220px] w-12 items-center justify-center">
        <div className="flex flex-col items-end gap-2 opacity-45 transition-opacity group-hover:opacity-0">
          {outline.map((item, outlineIndex) => (
            <button
              key={item.id}
              type="button"
              aria-label={item.title}
              onClick={() => onJump(outlineIndex)}
              className={`h-[3px] rounded-full bg-white/45 transition-colors hover:bg-white ${item.level === 1 ? 'w-8' : item.level === 2 ? 'w-6' : 'w-4'}`}
            />
          ))}
        </div>
        <div className="pointer-events-none absolute right-0 max-h-[58vh] w-[260px] translate-x-2 overflow-y-auto rounded-2xl border border-white/10 bg-[#1c2023]/92 p-4 opacity-0 shadow-2xl backdrop-blur-2xl transition-all group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100">
          <div className="mb-3 text-[10px] font-semibold uppercase text-[#899298]">Outline</div>
          <div className="space-y-1">
            {outline.map((item, outlineIndex) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onJump(outlineIndex)}
                className="block w-full truncate rounded-md px-2 py-1.5 text-left text-[12px] text-[#cfd7dc] hover:bg-white/[0.08] hover:text-white"
                style={{ paddingLeft: `${8 + (item.level - 1) * 12}px` }}
                title={item.title}
              >
                {item.title}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ToolbarBtn({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active ? 'bg-[#86d7ff]/15 text-[#86d7ff]' : 'text-[#899298] hover:bg-white/10 hover:text-white'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}

function ToolbarSep() {
  return <div className="mx-1 h-4 w-px bg-white/[0.07]" />
}

function resolveBlockHandleTargetFromPoint(
  editor: Editor,
  clientX: number,
  clientY: number,
  eventTarget: Element | null,
): BlockHandleTarget | null {
  const root = editor.view.dom
  const rootRect = root.getBoundingClientRect()
  const inEditor = clientX >= rootRect.left - 56 &&
    clientX <= rootRect.right &&
    clientY >= rootRect.top &&
    clientY <= rootRect.bottom
  if (!inEditor) return null

  const targetFromEvent = root.contains(eventTarget) ? resolveBlockHandleTarget(editor, eventTarget) : null
  if (targetFromEvent) return targetFromEvent

  if (clientX < rootRect.left && clientX >= rootRect.left - 56) {
    const gutterProbe = document.elementFromPoint(rootRect.left + 4, clientY)
    return resolveBlockHandleTarget(editor, gutterProbe)
  }

  return null
}

function resolveBlockHandleTargetFromSelection(editor: Editor): BlockHandleTarget | null {
  const { selection, doc } = editor.state
  const $from = selection.$from
  for (let depth = $from.depth; depth >= 1; depth -= 1) {
    const node = $from.node(depth)
    if (!SUPPORTED_BLOCK_TYPES.has(node.type.name)) continue
    const from = $from.before(depth)
    const dom = editor.view.nodeDOM(from)
    return createBlockHandleTarget(doc, from, dom instanceof HTMLElement ? dom : undefined)
  }
  const first = doc.childCount > 0 ? doc.child(0) : null
  if (first && SUPPORTED_BLOCK_TYPES.has(first.type.name)) {
    const dom = editor.view.nodeDOM(0)
    return createBlockHandleTarget(doc, 0, dom instanceof HTMLElement ? dom : undefined)
  }
  return null
}

function findBlockHandleElement(element: Element, root: HTMLElement): HTMLElement | null {
  const prioritySelectors = [
    '[data-type="view-block"]',
    'li[data-type="taskItem"]',
    'li',
    '[data-type="callout"]',
    'blockquote',
    'pre',
    'hr',
    'h1',
    'h2',
    'h3',
    'p',
  ]
  for (const selector of prioritySelectors) {
    const candidate = element.closest(selector)
    if (candidate instanceof HTMLElement && candidate !== root && root.contains(candidate)) {
      return candidate
    }
  }
  return null
}

function findSiblingBlockTarget(editor: Editor, target: BlockHandleTarget, direction: -1 | 1): BlockHandleTarget | null {
  const $pos = editor.state.doc.resolve(Math.min(target.from + 1, editor.state.doc.content.size))
  const parent = $pos.node(target.parentDepth)
  const siblingIndex = target.index + direction
  if (siblingIndex < 0 || siblingIndex >= parent.childCount) return null

  let siblingFrom = target.parentContentStart
  for (let index = 0; index < siblingIndex; index += 1) {
    siblingFrom += parent.child(index).nodeSize
  }
  return createBlockHandleTarget(editor.state.doc, siblingFrom)
}

function collectNodeText(node: TiptapJSONContent): string {
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(collectNodeText).join('')
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'untitled'
}
