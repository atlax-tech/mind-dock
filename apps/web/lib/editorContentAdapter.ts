export interface TiptapJSONContent {
  type?: string
  attrs?: Record<string, unknown>
  content?: TiptapJSONContent[]
  text?: string
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

export interface EditorContentPayload {
  contentJson: TiptapJSONContent
  plainText: string
  html: string
  markdown: string
  content: string
}

export interface StoredEditorContentFields {
  content?: string | null
  contentJson?: TiptapJSONContent | Record<string, unknown> | null
  plainText?: string | null
  html?: string | null
  markdown?: string | null
}

export function createEmptyTiptapDoc(): TiptapJSONContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  }
}

export function isTiptapDoc(value: unknown): value is TiptapJSONContent {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as TiptapJSONContent).type === 'doc' &&
    Array.isArray((value as TiptapJSONContent).content)
  )
}

export function textToTiptapDoc(text?: string | null): TiptapJSONContent {
  const source = text ?? ''
  if (!source.trim()) return createEmptyTiptapDoc()

  const lines = source.replace(/\r\n/g, '\n').split('\n')
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : undefined,
    })),
  }
}

export function resolveInitialTiptapContent(fields: StoredEditorContentFields): TiptapJSONContent {
  if (isTiptapDoc(fields.contentJson)) return fields.contentJson
  return textToTiptapDoc(fields.markdown ?? fields.plainText ?? fields.content ?? '')
}

export function createEditorContentPayload(
  contentJson: TiptapJSONContent | Record<string, unknown> | null | undefined,
  fallbackText: string = '',
): EditorContentPayload {
  const doc = isTiptapDoc(contentJson) ? contentJson : textToTiptapDoc(fallbackText)
  const plainText = jsonToPlainText(doc).trim()
  const markdown = jsonToMarkdown(doc).trim()
  return {
    contentJson: doc,
    plainText,
    html: jsonToHtml(doc),
    markdown,
    content: plainText || markdown,
  }
}

export function normalizeStoredEditorContent(fields: StoredEditorContentFields): EditorContentPayload {
  const doc = resolveInitialTiptapContent(fields)
  const payload = createEditorContentPayload(doc, fields.content ?? '')
  return {
    ...payload,
    plainText: fields.plainText ?? payload.plainText,
    html: fields.html ?? payload.html,
    markdown: fields.markdown ?? payload.markdown,
    content: fields.content ?? payload.content,
  }
}

export function jsonToPlainText(node: TiptapJSONContent | null | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  const children = node.content?.map(jsonToPlainText).join('') ?? ''
  if (['paragraph', 'heading', 'blockquote', 'codeBlock', 'listItem', 'taskItem'].includes(node.type ?? '')) {
    return `${children}\n`
  }
  return children
}

export function jsonToMarkdown(node: TiptapJSONContent | null | undefined, depth: number = 0): string {
  if (!node) return ''
  if (node.type === 'text') return applyMarkdownMarks(node.text ?? '', node.marks)
  if (node.type === 'hardBreak') return '\n'

  const children = node.content ?? []
  switch (node.type) {
    case 'doc':
      return children.map((child) => jsonToMarkdown(child, depth)).join('\n').trim()
    case 'paragraph':
      return children.map((child) => jsonToMarkdown(child, depth)).join('')
    case 'heading': {
      const level = clampHeadingLevel(node.attrs?.level)
      return `${'#'.repeat(level)} ${children.map((child) => jsonToMarkdown(child, depth)).join('')}`
    }
    case 'blockquote':
      return children.map((child) => jsonToMarkdown(child, depth)).join('\n').split('\n').map((line) => `> ${line}`).join('\n')
    case 'codeBlock':
      return `\`\`\`\n${children.map((child) => child.text ?? '').join('')}\n\`\`\``
    case 'bulletList':
      return children.map((child) => jsonToMarkdown(child, depth + 1)).join('\n')
    case 'orderedList':
      return children.map((child, index) => `${index + 1}. ${listItemMarkdown(child, depth + 1)}`).join('\n')
    case 'taskList':
      return children.map((child) => jsonToMarkdown(child, depth + 1)).join('\n')
    case 'taskItem': {
      const checked = node.attrs?.checked === true ? 'x' : ' '
      return `${'  '.repeat(Math.max(0, depth - 1))}- [${checked}] ${children.map((child) => jsonToMarkdown(child, depth)).join(' ').trim()}`
    }
    case 'listItem':
      return `${'  '.repeat(Math.max(0, depth - 1))}- ${children.map((child) => jsonToMarkdown(child, depth)).join(' ').trim()}`
    case 'horizontalRule':
      return '---'
    default:
      return children.map((child) => jsonToMarkdown(child, depth)).join('')
  }
}

export function jsonToHtml(node: TiptapJSONContent | null | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return applyHtmlMarks(escapeHtml(node.text ?? ''), node.marks)
  if (node.type === 'hardBreak') return '<br>'

  const children = node.content?.map(jsonToHtml).join('') ?? ''
  switch (node.type) {
    case 'doc':
      return children
    case 'paragraph':
      return `<p>${children}</p>`
    case 'heading': {
      const level = clampHeadingLevel(node.attrs?.level)
      return `<h${level}>${children}</h${level}>`
    }
    case 'blockquote':
      return `<blockquote>${children}</blockquote>`
    case 'codeBlock':
      return `<pre><code>${children}</code></pre>`
    case 'bulletList':
      return `<ul>${children}</ul>`
    case 'orderedList':
      return `<ol>${children}</ol>`
    case 'taskList':
      return `<ul data-type="taskList">${children}</ul>`
    case 'taskItem': {
      const checked = node.attrs?.checked === true ? ' checked' : ''
      return `<li data-type="taskItem"><input type="checkbox"${checked} disabled>${children}</li>`
    }
    case 'listItem':
      return `<li>${children}</li>`
    case 'horizontalRule':
      return '<hr>'
    default:
      return children
  }
}

function listItemMarkdown(node: TiptapJSONContent, depth: number): string {
  const children = node.content ?? []
  return children.map((child) => jsonToMarkdown(child, depth)).join(' ').trim()
}

function clampHeadingLevel(value: unknown): number {
  const level = typeof value === 'number' ? value : 2
  return Math.min(6, Math.max(1, level))
}

function applyMarkdownMarks(text: string, marks?: Array<{ type: string; attrs?: Record<string, unknown> }>): string {
  if (!marks || marks.length === 0) return text
  return marks.reduce((acc, mark) => {
    switch (mark.type) {
      case 'bold': return `**${acc}**`
      case 'italic': return `*${acc}*`
      case 'strike': return `~~${acc}~~`
      case 'code': return `\`${acc}\``
      case 'link': {
        const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : ''
        return href ? `[${acc}](${href})` : acc
      }
      case 'highlight': return `==${acc}==`
      default: return acc
    }
  }, text)
}

function applyHtmlMarks(html: string, marks?: Array<{ type: string; attrs?: Record<string, unknown> }>): string {
  if (!marks || marks.length === 0) return html
  return marks.reduce((acc, mark) => {
    switch (mark.type) {
      case 'bold': return `<strong>${acc}</strong>`
      case 'italic': return `<em>${acc}</em>`
      case 'strike': return `<s>${acc}</s>`
      case 'code': return `<code>${acc}</code>`
      case 'link': {
        const href = typeof mark.attrs?.href === 'string' ? escapeHtml(mark.attrs.href) : ''
        return href ? `<a href="${href}">${acc}</a>` : acc
      }
      case 'highlight': return `<mark>${acc}</mark>`
      default: return acc
    }
  }, html)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
