import { Editor, Extension } from '@tiptap/react'
import { Plugin } from '@tiptap/pm/state'

/**
 * Tiptap extension for Paste Normalization
 */
export const PasteNormalizer = Extension.create({
  name: 'pasteNormalizer',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            return handleEditorPaste(event, this.editor as Editor)
          },
        },
      }),
    ]
  },
})

/**
 * Clean HTML content from clipboard
 * Removes dangerous tags and external styles while preserving semantic structure
 */
export function normalizeHtmlPaste(html: string): string {
  if (typeof window === 'undefined') return html

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  
  const allowedTags = new Set([
    'H1', 'H2', 'H3', 'P', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'HR', 'STRONG', 'EM', 'A', 'BR', 'B', 'I'
  ])
  const dangerousTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'META', 'LINK'])

  const clean = (node: Node) => {
    let child = node.firstChild
    while (child) {
      const next = child.nextSibling
      
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement
        const tagName = el.tagName.toUpperCase()
        
        if (dangerousTags.has(tagName)) {
          node.removeChild(child)
        } else if (!allowedTags.has(tagName)) {
          // Unwrap: move children out and remove el
          while (el.firstChild) {
            el.parentNode?.insertBefore(el.firstChild, el)
          }
          node.removeChild(child)
        } else {
          // Strip all attributes except href for anchors
          const attributes = Array.from(el.attributes)
          for (const attr of attributes) {
            if (tagName === 'A' && attr.name.toLowerCase() === 'href') {
              continue
            }
            el.removeAttribute(attr.name)
          }
          // Recurse into children
          clean(child)
        }
      }
      child = next
    }
  }

  clean(doc.body)
  return doc.body.innerHTML
}

/**
 * Heuristic check if text looks like Markdown
 */
export function looksLikeMarkdown(text: string): boolean {
  const patterns = [
    /^#\s/m,            // H1
    /^##\s/m,           // H2
    /^###\s/m,          // H3
    /^\s*[-*+]\s/m,     // Bullet list
    /^\s*\d+\.\s/m,     // Ordered list
    /^>\s/m,            // Blockquote
    /^```/m,            // Code block
    /^---\s*$/m,        // HR
    /^\*\*\*[ \t]*$/m   // HR
  ]
  return patterns.some(p => p.test(text))
}

/**
 * Lightweight Markdown to HTML converter for paste
 */
export function parseMarkdownPaste(text: string): string {
  const lines = text.split(/\r?\n/)
  let html = ''
  let inList = false
  let listType = '' // 'ul' or 'ol'
  let inCode = false

  const closeList = () => {
    if (inList) {
      html += `</${listType}>`
      inList = false
    }
  }

  lines.forEach(line => {
    const trimmed = line.trim()
    
    // Code block
    if (trimmed.startsWith('```')) {
      if (inCode) {
        html += '</code></pre>'
        inCode = false
      } else {
        closeList()
        html += '<pre><code>'
        inCode = true
      }
      return
    }
    
    if (inCode) {
      html += escapeHtml(line) + '\n'
      return
    }

    // HR
    if (/^---$|^\*\*\*$/.test(trimmed)) {
      closeList()
      html += '<hr />'
      return
    }

    // Headings
    if (line.startsWith('# ')) {
      closeList()
      html += `<h1>${escapeHtml(line.slice(2))}</h1>`
      return
    }
    if (line.startsWith('## ')) {
      closeList()
      html += `<h2>${escapeHtml(line.slice(3))}</h2>`
      return
    }
    if (line.startsWith('### ')) {
      closeList()
      html += `<h3>${escapeHtml(line.slice(4))}</h3>`
      return
    }

    // Blockquote
    if (line.startsWith('> ')) {
      closeList()
      html += `<blockquote>${escapeHtml(line.slice(2))}</blockquote>`
      return
    }

    // Lists
    const bulletMatch = line.match(/^\s*[-*+]\s+(.*)/)
    const orderedMatch = line.match(/^\s*\d+\.\s+(.*)/)

    if (bulletMatch) {
      if (!inList || listType !== 'ul') {
        closeList()
        html += '<ul>'
        inList = true
        listType = 'ul'
      }
      html += `<li>${escapeHtml(bulletMatch[1])}</li>`
      return
    }
    if (orderedMatch) {
      if (!inList || listType !== 'ol') {
        closeList()
        html += '<ol>'
        inList = true
        listType = 'ol'
      }
      html += `<li>${escapeHtml(orderedMatch[1])}</li>`
      return
    }

    // Regular line
    if (trimmed === '') {
      closeList()
    } else {
      closeList()
      html += `<p>${escapeHtml(trimmed)}</p>`
    }
  })

  closeList()
  if (inCode) html += '</code></pre>'

  return html
}

/**
 * Split plain text into paragraph blocks
 */
export function splitPlainTextToBlocks(text: string): string {
  // Split by double newlines
  const paragraphs = text.split(/\r?\n\r?\n/).filter(p => p.trim())
  
  if (paragraphs.length > 1) {
    return paragraphs.map(p => `<p>${escapeHtml(p.trim())}</p>`).join('')
  }
  
  // Single block case: check if it's multiple short lines
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length > 1) {
    const avgLen = lines.reduce((sum, l) => sum + l.length, 0) / lines.length
    if (avgLen < 80) {
      return lines.map(l => `<p>${escapeHtml(l.trim())}</p>`).join('')
    }
  }
  
  return `<p>${escapeHtml(text.trim())}</p>`
}

/**
 * Main entry point for editor paste handling
 */
export function handleEditorPaste(event: ClipboardEvent, editor: Editor): boolean {
  const clipboardData = event.clipboardData
  if (!clipboardData) return false

  const html = clipboardData.getData('text/html')
  const text = clipboardData.getData('text/plain')

  let contentToInsert: string = ''

  if (text && looksLikeMarkdown(text)) {
    // Some editors put Markdown into text/plain and a styled plain paragraph into text/html.
    // Prefer the Markdown source so headings/lists become real Tiptap nodes on paste.
    contentToInsert = parseMarkdownPaste(text)
  } else if (html) {
    contentToInsert = normalizeHtmlPaste(html)
  } else if (text) {
    contentToInsert = splitPlainTextToBlocks(text)
  }

  if (!contentToInsert) return false

  try {
    const { state } = editor
    const { selection } = state
    const { $from } = selection
    
    // Check if we are in an empty paragraph to replace it
    const isEmptyParagraph = $from.parent.type.name === 'paragraph' && 
                           $from.parent.content.size === 0 &&
                           $from.depth === 1 // Root level block

    editor.setEditable(true) // Ensure it's editable
    
    if (isEmptyParagraph) {
      // Replace the entire empty block
      editor.chain()
        .focus()
        .insertContentAt({ from: $from.before(), to: $from.after() }, contentToInsert)
        .run()
    } else {
      // Normal insert at cursor (replaces selection if any)
      editor.chain()
        .focus()
        .insertContent(contentToInsert)
        .run()
    }

    return true
  } catch (error) {
    console.error('Paste normalization failed:', error)
    return false // Fallback to default TipTap behavior
  }
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, m => map[m] || m)
}
