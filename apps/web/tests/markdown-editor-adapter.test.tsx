// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

import {
  createEditorContentPayload,
  jsonToHtml,
  jsonToMarkdown,
  jsonToPlainText,
  resolveInitialTiptapContent,
  textToTiptapDoc,
  type TiptapJSONContent,
} from '@/lib/editorContentAdapter'
import {
  EDITOR_WIDTH_CLASSES,
  canMoveBlock,
  extractEditorOutline,
  SLASH_COMMANDS,
} from '@/app/workspace/features/editor/TiptapEditor'
import { getReadableTextColor } from '@/app/workspace/features/mind/mindGraphStyle'

describe('Tiptap editor content adapter', () => {
  it('hydrates legacy text into Tiptap JSON paragraphs', () => {
    const doc = textToTiptapDoc('hello\nworld')
    expect(doc.type).toBe('doc')
    expect(doc.content).toHaveLength(2)
    expect(doc.content?.[0].content?.[0].text).toBe('hello')
    expect(doc.content?.[1].content?.[0].text).toBe('world')
  })

  it('resolves stored contentJson before legacy text', () => {
    const contentJson: TiptapJSONContent = {
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'JSON Title' }] }],
    }
    const resolved = resolveInitialTiptapContent({ content: 'legacy', contentJson })
    expect(resolved).toBe(contentJson)
  })

  it('creates the four persisted content fields from Tiptap JSON', () => {
    const doc: TiptapJSONContent = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body', marks: [{ type: 'bold' }] }] },
      ],
    }
    const payload = createEditorContentPayload(doc)
    expect(payload.contentJson).toBe(doc)
    expect(payload.plainText).toContain('Title')
    expect(payload.plainText).toContain('Body')
    expect(payload.html).toContain('<h2>Title</h2>')
    expect(payload.html).toContain('<strong>Body</strong>')
    expect(payload.markdown).toContain('## Title')
    expect(payload.markdown).toContain('**Body**')
    expect(payload.content).toContain('Title')
  })

  it('serializes lists, quotes, code blocks, and horizontal rules', () => {
    const doc: TiptapJSONContent = {
      type: 'doc',
      content: [
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quote' }] }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] }] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1' }] },
        { type: 'horizontalRule' },
      ],
    }
    expect(jsonToPlainText(doc)).toContain('quote')
    expect(jsonToMarkdown(doc)).toContain('> quote')
    expect(jsonToMarkdown(doc)).toContain('- item')
    expect(jsonToHtml(doc)).toContain('<blockquote>')
    expect(jsonToHtml(doc)).toContain('<ul>')
    expect(jsonToHtml(doc)).toContain('<pre><code>')
    expect(jsonToHtml(doc)).toContain('<hr>')
  })

  it('serializes task items, links, and highlights', () => {
    const doc: TiptapJSONContent = {
      type: 'doc',
      content: [
        {
          type: 'taskList',
          content: [
            { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
            { type: 'text', text: ' mark', marks: [{ type: 'highlight' }] },
          ],
        },
      ],
    }
    expect(jsonToMarkdown(doc)).toContain('- [x] done')
    expect(jsonToMarkdown(doc)).toContain('[link](https://example.com)')
    expect(jsonToMarkdown(doc)).toContain('== mark==')
    expect(jsonToHtml(doc)).toContain('data-type="taskList"')
    expect(jsonToHtml(doc)).toContain('<a href="https://example.com">link</a>')
    expect(jsonToHtml(doc)).toContain('<mark> mark</mark>')
  })
})

describe('Tiptap editor foundation behavior', () => {
  it('defines slash commands for the required Notion-like block menu', () => {
    expect(SLASH_COMMANDS.map((item) => item.title)).toEqual([
      'paragraph',
      'heading1',
      'heading2',
      'heading3',
      'taskList',
      'bulletList',
      'orderedList',
      'blockquote',
      'codeBlock',
      'horizontalRule',
      'table',
      'callout',
      'projectTasksView',
      'relatedDocumentsView',
      'recommendationQueueView',
      'mindGraphPreviewView',
      'localDatabaseView',
    ])
  })

  it('extracts a lightweight outline from h1-h3 blocks', () => {
    const doc: TiptapJSONContent = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Phase Quality' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'body' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '检查范围' }] },
      ],
    }
    expect(extractEditorOutline(doc).map((item) => ({ title: item.title, level: item.level, index: item.index }))).toEqual([
      { title: 'Phase Quality', level: 1, index: 0 },
      { title: '检查范围', level: 3, index: 2 },
    ])
  })

  it('defines stable editor width modes', () => {
    expect(EDITOR_WIDTH_CLASSES).toEqual({
      compact: 'max-w-[640px]',
      comfortable: 'max-w-[720px]',
      wide: 'max-w-[860px]',
    })
  })

  it('allows block handle moves only within the same parent scope', () => {
    const baseTarget = {
      pos: 0,
      from: 0,
      to: 6,
      depth: 1,
      parentDepth: 0,
      parentContentStart: 0,
      index: 0,
      type: 'paragraph',
      node: {} as never,
    }
    expect(canMoveBlock(baseTarget, { ...baseTarget, pos: 6, from: 6, to: 12, index: 1 })).toBe(true)
    expect(canMoveBlock(baseTarget, { ...baseTarget, pos: 12, from: 12, to: 18, parentDepth: 1, index: 2 })).toBe(false)
    expect(canMoveBlock(baseTarget, { ...baseTarget })).toBe(false)
  })
})

describe('Tiptap editor source constraints', () => {
  function readEditor() {
    return fs.readFileSync(path.join(process.cwd(), 'app/workspace/features/editor/TiptapEditor.tsx'), 'utf-8')
  }

  it('uses Tiptap packages instead of the removed textarea Markdown adapter', () => {
    const content = readEditor()
    expect(content).toContain('@tiptap/react')
    expect(content).toContain('@tiptap/starter-kit')
    expect(content).toContain('@tiptap/suggestion')
    expect(content).toContain('@tiptap/extension-link')
    expect(content).toContain('@tiptap/extension-highlight')
    expect(content).toContain('@tiptap/extension-task-list')
    expect(content).not.toContain('@uiw/react-md-editor')
    expect(content).not.toContain('<textarea')
  })

  it('toolbar invokes Tiptap commands for required formatting', () => {
    const content = readEditor()
    for (const command of [
      'toggleBold',
      'toggleItalic',
      'toggleStrike',
      'toggleHeading',
      'toggleBlockquote',
      'toggleBulletList',
      'toggleOrderedList',
      'toggleCodeBlock',
      'setHorizontalRule',
      'toggleHighlight',
      'setLink',
      'toggleTaskList',
    ]) {
      expect(content).toContain(command)
    }
  })

  it('renders a Bubble Menu and right-edge outline rail', () => {
    const content = readEditor()
    expect(content).toContain('BubbleMenu')
    expect(content).toContain('tiptap-bubble-menu')
    expect(content).toContain('editor-outline-rail')
    expect(content).toContain('onOutlineChange')
  })

  it('uses product UI for link editing instead of browser dialogs', () => {
    const content = readEditor()
    expect(content).toContain('tiptap-link-dialog')
    expect(content).not.toContain('window.prompt')
    expect(content).not.toContain('window.alert')
    expect(content).not.toContain('window.confirm')
  })

  it('HTML mode is preview-only and does not save arbitrary HTML source edits', () => {
    const content = readEditor()
    expect(content).toContain('tiptap-html-preview')
    expect(content).toContain('<pre')
    expect(content).not.toContain('contentEditable')
    expect(content).not.toContain('dangerouslySetInnerHTML')
  })

  it('moves the formatting toolbar into the editor dock slot when requested', () => {
    const content = readEditor()
    expect(content).toContain('toolbarPortalTargetId')
    expect(content).toContain('createPortal')
    expect(content).toContain('tiptap-toolbar')
  })

  it('uses a single floating block handle controller instead of a static handle column', () => {
    const content = readEditor()
    expect(content).toContain('tiptap-block-handle-controller')
    expect(content).toContain('tiptap-block-action-menu')
    expect(content).toContain('tiptap-block-drop-indicator')
    expect(content).toContain('requestAnimationFrame')
    expect(content).toContain('getBoundingClientRect')
    expect(content).toContain('resolveBlockHandleTarget')
    expect(content).toContain('moveBlockInDocument')
    expect(content).toContain('duplicateBlockInDocument')
    expect(content).toContain('deleteBlockInDocument')
    expect(content).toContain('enableBlockHandles = false')
    expect(content).not.toContain('blocks.map')
    expect(content).not.toContain('tiptap-drag-handles')
    expect(content).not.toContain('reorderTopLevelBlock')
    expect(content).not.toContain('Comment')
    expect(content).not.toContain('Suggest edits')
    expect(content).not.toContain('Ask AI')
  })

  it('restores visible list markers inside the dark Tiptap surface', () => {
    const content = readEditor()
    expect(content).toContain('list-style-type: disc')
    expect(content).toContain('list-style-type: decimal')
    expect(content).toContain('li::marker')
  })
})

describe('visual contrast helpers', () => {
  it('keeps generated visualization labels readable on the dark canvas', () => {
    expect(getReadableTextColor('#0a0a0f', '#334155')).not.toBe('#334155')
    expect(getReadableTextColor('#0a0a0f', '#E2E8F0')).toBe('#E2E8F0')
  })
})
