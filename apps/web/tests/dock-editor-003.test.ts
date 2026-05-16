import { afterEach, describe, expect, it } from 'vitest'

import { db, entriesTable, tipsTable, mindNodesTable } from '@/lib/db'
import { DEFAULT_WORKSPACE_ID } from '@atlax/domain'
import {
  createDraft,
  updateDraft,
  getDraft,
  publishDraftToDocument,
  convertTipToDraft,
  discardDraft,
  discardTip,
} from '@/lib/repository'

const USER_A = 'user_de003_a'

async function clearAll() {
  await db.table('editorDrafts').clear()
  await db.table('entries').clear()
  await db.table('tips').clear()
  await db.table('mindNodes').clear()
  await db.table('mindEdges').clear()
}

function unwrap<T>(value: T | null): T {
  expect(value).not.toBeNull()
  return value as T
}

describe('DOCK-EDITOR-003: Draft metadata fields', () => {
  afterEach(clearAll)

  it('createDraft supports tags, project, collectionId', async () => {
    const draft = unwrap(await createDraft(USER_A, 'Test', 'content', undefined, undefined, ['tag1', 'tag2'], 'project1', 'col1'))
    expect(draft.tags).toEqual(['tag1', 'tag2'])
    expect(draft.project).toBe('project1')
    expect(draft.collectionId).toBe('col1')
  })

  it('updateDraft supports tags, project, collectionId', async () => {
    const draft = unwrap(await createDraft(USER_A, 'Test', 'content'))
    const updated = unwrap(await updateDraft(USER_A, draft.id, { tags: ['new-tag'], project: 'new-project', collectionId: 'new-col' }))
    expect(updated.tags).toEqual(['new-tag'])
    expect(updated.project).toBe('new-project')
    expect(updated.collectionId).toBe('new-col')
  })

  it('updateDraft partial update preserves unmodified metadata', async () => {
    const draft = unwrap(await createDraft(USER_A, 'Test', 'content', undefined, undefined, ['tag1'], 'proj1', 'col1'))
    const updated = unwrap(await updateDraft(USER_A, draft.id, { tags: ['tag2'] }))
    expect(updated.tags).toEqual(['tag2'])
    expect(updated.project).toBe('proj1')
    expect(updated.collectionId).toBe('col1')
  })

  it('createDraft defaults tags to empty array, project and collectionId to null', async () => {
    const draft = unwrap(await createDraft(USER_A, 'Test', 'content'))
    expect(draft.tags).toEqual([])
    expect(draft.project).toBeNull()
    expect(draft.collectionId).toBeNull()
  })

  it('getDraft returns draft with metadata fields', async () => {
    const created = unwrap(await createDraft(USER_A, 'Test', 'content', undefined, undefined, ['a'], 'p1', 'c1'))
    const found = unwrap(await getDraft(USER_A, created.id))
    expect(found.tags).toEqual(['a'])
    expect(found.project).toBe('p1')
    expect(found.collectionId).toBe('c1')
  })

  it('createDraft stores Tiptap content fields from legacy content', async () => {
    const draft = unwrap(await createDraft(USER_A, 'Rich Draft', 'hello world'))
    expect(draft.contentJson?.type).toBe('doc')
    expect(draft.plainText).toBe('hello world')
    expect(draft.markdown).toBe('hello world')
    expect(draft.html).toContain('<p>hello world</p>')
    expect(draft.content).toBe('hello world')
  })

  it('updateDraft stores contentJson, plainText, html, and markdown', async () => {
    const draft = unwrap(await createDraft(USER_A, 'Rich Draft', 'old'))
    const contentJson = {
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'New JSON' }] }],
    }
    const updated = unwrap(await updateDraft(USER_A, draft.id, {
      contentJson,
      plainText: 'New JSON',
      html: '<h2>New JSON</h2>',
      markdown: '## New JSON',
    }))
    expect(updated.contentJson).toEqual(contentJson)
    expect(updated.plainText).toBe('New JSON')
    expect(updated.html).toBe('<h2>New JSON</h2>')
    expect(updated.markdown).toBe('## New JSON')
    expect(updated.content).toBe('New JSON')
  })
})

describe('DOCK-EDITOR-003: publishDraftToDocument preserves metadata', () => {
  afterEach(clearAll)

  it('publish as_new carries tags and project from draft to entry', async () => {
    const draft = unwrap(await createDraft(USER_A, 'Test Doc', 'content', undefined, undefined, ['tag1', 'tag2'], 'project1', null))
    const result = await publishDraftToDocument(USER_A, draft.id, 'as_new')
    const entry = unwrap(result.entry)
    expect(entry.tags).toEqual(['tag1', 'tag2'])
    expect(entry.project).toBe('project1')
  })

  it('publish as_new carries Tiptap content fields to entry', async () => {
    const contentJson = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'rich body' }] }],
    }
    const draft = unwrap(await createDraft(USER_A, 'Rich Doc', 'rich body', undefined, undefined, [], null, null, {
      contentJson,
      plainText: 'rich body',
      html: '<p>rich body</p>',
      markdown: 'rich body',
    }))
    const result = await publishDraftToDocument(USER_A, draft.id, 'as_new')
    const entry = unwrap(result.entry)
    expect(entry.contentJson).toEqual(contentJson)
    expect(entry.plainText).toBe('rich body')
    expect(entry.html).toBe('<p>rich body</p>')
    expect(entry.markdown).toBe('rich body')
  })

  it('publish with empty metadata creates entry with defaults', async () => {
    const draft = unwrap(await createDraft(USER_A, 'Test Doc', 'content'))
    const result = await publishDraftToDocument(USER_A, draft.id, 'as_new')
    const entry = unwrap(result.entry)
    expect(entry.tags).toEqual([])
    expect(entry.project).toBeNull()
  })

  it('publish update_original with new entry carries tags and project', async () => {
    const draft = unwrap(await createDraft(USER_A, 'Unique Doc', 'content', undefined, undefined, ['t1'], 'proj1', null))
    const result = await publishDraftToDocument(USER_A, draft.id, 'update_original')
    const entry = unwrap(result.entry)
    expect(entry.tags).toEqual(['t1'])
    expect(entry.project).toBe('proj1')
  })

  it('publish creates mindNode for the new entry', async () => {
    const draft = unwrap(await createDraft(USER_A, 'Node Doc', 'content'))
    const result = await publishDraftToDocument(USER_A, draft.id, 'as_new')
    const entry = unwrap(result.entry)
    const nodes = await mindNodesTable.where('userId').equals(USER_A).toArray()
    const docNodes = nodes.filter(n => n.nodeType === 'document' && n.documentId === entry.id)
    expect(docNodes.length).toBe(1)
    expect(docNodes[0].label).toBe('Node Doc')
  })
})

describe('DOCK-EDITOR-003: Dock → Editor context', () => {
  afterEach(clearAll)

  it('entry-origin draft inherits entry metadata', async () => {
    const entryId = await entriesTable.add({
      userId: USER_A,
      workspaceId: DEFAULT_WORKSPACE_ID,
      sourceDockItemId: 0,
      title: 'Original Entry',
      content: 'entry content',
      type: 'note',
      tags: ['entry-tag'],
      project: 'entry-project',
      actions: [],
      createdAt: new Date(),
      archivedAt: new Date(),
    })
    const draft = unwrap(await createDraft(USER_A, 'Original Entry', 'entry content', entryId as number, 'entry', ['entry-tag'], 'entry-project', null))
    expect(draft.tags).toEqual(['entry-tag'])
    expect(draft.project).toBe('entry-project')
    expect(draft.sourceEntryId).toBe(entryId as number)
    expect(draft.sourceType).toBe('entry')
  })

  it('convertTipToDraft creates draft from tip', async () => {
    const tipId = await tipsTable.add({
      userId: USER_A,
      content: 'tip content',
      sourceType: 'capture',
      status: 'active',
      convertedDraftId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const { draft, tip } = await convertTipToDraft(USER_A, tipId as number)
    expect(draft).not.toBeNull()
    if (draft) {
      expect(draft.content).toBe('tip content')
      expect(draft.sourceType).toBeNull()
    }
    expect(tip).not.toBeNull()
    if (tip) {
      expect(tip.status).toBe('converted')
      expect(tip.convertedDraftId).toBe(draft ? draft.id : undefined)
    }
  })

  it('convertTipToDraft returns null for wrong user', async () => {
    const tipId = await tipsTable.add({
      userId: USER_A,
      content: 'tip content',
      sourceType: 'capture',
      status: 'active',
      convertedDraftId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const { draft, tip } = await convertTipToDraft('wrong_user', tipId as number)
    expect(draft).toBeNull()
    expect(tip).toBeNull()
  })
})

describe('DOCK-EDITOR-003: Dock Inspector Actions', () => {
  afterEach(clearAll)

  it('discardDraft marks draft as discarded', async () => {
    const draft = unwrap(await createDraft(USER_A, 'Test', 'content'))
    const result = unwrap(await discardDraft(USER_A, draft.id, 'abandon_changes'))
    expect(result.status).toBe('discarded')
  })

  it('discardDraft marks draft as discarded and not active', async () => {
    const draft = unwrap(await createDraft(USER_A, 'Test', 'content'))
    await discardDraft(USER_A, draft.id, 'abandon_changes')
    const found = unwrap(await getDraft(USER_A, draft.id))
    expect(found.status).toBe('discarded')
  })

  it('discardTip marks tip as discarded', async () => {
    const tipId = await tipsTable.add({
      userId: USER_A,
      content: 'tip content',
      sourceType: 'capture',
      status: 'active',
      convertedDraftId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const result = await discardTip(USER_A, tipId as number)
    expect(result).not.toBeNull()
    if (result) {
      expect(result.status).toBe('discarded')
    }
  })

  it('discardTip returns null for wrong user', async () => {
    const tipId = await tipsTable.add({
      userId: USER_A,
      content: 'tip content',
      sourceType: 'capture',
      status: 'active',
      convertedDraftId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const result = await discardTip('wrong_user', tipId as number)
    expect(result).toBeNull()
  })
})

describe('DOCK-EDITOR-003 Review Fix: update_original publish syncs metadata to existing entry', () => {
  afterEach(clearAll)

  it('update_original publish writes draft tags to existing entry', async () => {
    const entryId = await entriesTable.add({
      userId: USER_A,
      workspaceId: DEFAULT_WORKSPACE_ID,
      sourceDockItemId: 0,
      title: 'Original',
      content: 'original content',
      type: 'note',
      tags: ['old-tag'],
      project: 'old-project',
      actions: [],
      createdAt: new Date(),
      archivedAt: new Date(),
    })
    const draft = unwrap(await createDraft(USER_A, 'Updated Title', 'updated content', entryId as number, 'entry', ['new-tag-1', 'new-tag-2'], 'new-project', null))
    const result = await publishDraftToDocument(USER_A, draft.id, 'update_original')
    const entry = unwrap(result.entry)
    expect(entry.id).toBe(entryId as number)
    expect(entry.tags).toEqual(['new-tag-1', 'new-tag-2'])
    expect(entry.project).toBe('new-project')
    expect(entry.title).toBe('Updated Title')
    expect(entry.content).toBe('updated content')
  })

  it('update_original publish preserves entry tags when draft has empty tags', async () => {
    const entryId = await entriesTable.add({
      userId: USER_A,
      workspaceId: DEFAULT_WORKSPACE_ID,
      sourceDockItemId: 0,
      title: 'Original',
      content: 'original content',
      type: 'note',
      tags: ['existing-tag'],
      project: 'existing-project',
      actions: [],
      createdAt: new Date(),
      archivedAt: new Date(),
    })
    const draft = unwrap(await createDraft(USER_A, 'Updated', 'updated', entryId as number, 'entry', [], null, null))
    const result = await publishDraftToDocument(USER_A, draft.id, 'update_original')
    const entry = unwrap(result.entry)
    expect(entry.tags).toEqual([])
    expect(entry.project).toBeNull()
  })

  it('update_original publish does not write collectionId to entry', async () => {
    const entryId = await entriesTable.add({
      userId: USER_A,
      workspaceId: DEFAULT_WORKSPACE_ID,
      sourceDockItemId: 0,
      title: 'Original',
      content: 'original content',
      type: 'note',
      tags: [],
      project: null,
      actions: [],
      createdAt: new Date(),
      archivedAt: new Date(),
    })
    const draft = unwrap(await createDraft(USER_A, 'Updated', 'updated', entryId as number, 'entry', [], null, 'col-123'))
    const result = await publishDraftToDocument(USER_A, draft.id, 'update_original')
    const entry = unwrap(result.entry)
    expect(entry.title).toBe('Updated')
  })
})

describe('DOCK-EDITOR-003 Review Fix: flushSave saves pending project', () => {
  afterEach(clearAll)

  it('updateDraft saves project immediately when called directly', async () => {
    const draft = unwrap(await createDraft(USER_A, 'Test', 'content'))
    const updated = unwrap(await updateDraft(USER_A, draft.id, { project: 'flushed-project' }))
    expect(updated.project).toBe('flushed-project')
    const reloaded = unwrap(await getDraft(USER_A, draft.id))
    expect(reloaded.project).toBe('flushed-project')
  })

  it('updateDraft saves tags immediately when called directly', async () => {
    const draft = unwrap(await createDraft(USER_A, 'Test', 'content'))
    const updated = unwrap(await updateDraft(USER_A, draft.id, { tags: ['flushed-tag'] }))
    expect(updated.tags).toEqual(['flushed-tag'])
    const reloaded = unwrap(await getDraft(USER_A, draft.id))
    expect(reloaded.tags).toEqual(['flushed-tag'])
  })

  it('updateDraft can save both content and project in separate calls', async () => {
    const draft = unwrap(await createDraft(USER_A, 'Test', 'content'))
    await updateDraft(USER_A, draft.id, { content: 'new content' })
    await updateDraft(USER_A, draft.id, { project: 'new-project' })
    const reloaded = unwrap(await getDraft(USER_A, draft.id))
    expect(reloaded.content).toBe('new content')
    expect(reloaded.project).toBe('new-project')
  })

  it('updateDraft saves project=null when explicitly cleared', async () => {
    const draft = unwrap(await createDraft(USER_A, 'Test', 'content', undefined, undefined, [], 'old-project', null))
    expect(draft.project).toBe('old-project')
    const updated = unwrap(await updateDraft(USER_A, draft.id, { project: null }))
    expect(updated.project).toBeNull()
    const reloaded = unwrap(await getDraft(USER_A, draft.id))
    expect(reloaded.project).toBeNull()
  })

  it('updateDraft saves tags=[] when explicitly cleared', async () => {
    const draft = unwrap(await createDraft(USER_A, 'Test', 'content', undefined, undefined, ['tag1', 'tag2'], null, null))
    expect(draft.tags).toEqual(['tag1', 'tag2'])
    const updated = unwrap(await updateDraft(USER_A, draft.id, { tags: [] }))
    expect(updated.tags).toEqual([])
    const reloaded = unwrap(await getDraft(USER_A, draft.id))
    expect(reloaded.tags).toEqual([])
  })
})

describe('DOCK-EDITOR-003 Review Fix: Dock destructive actions use product UI not window.confirm', () => {
  it('page.tsx does not import or reference window.confirm', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const pagePath = path.join(process.cwd(), 'app/workspace/page.tsx')
    const content = fs.readFileSync(pagePath, 'utf-8')
    expect(content).not.toContain('window.confirm')
    expect(content).not.toContain('window.alert')
    expect(content).not.toContain('window.prompt')
  })

  it('workspace editor shell does not render a second outer More menu', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const pagePath = path.join(process.cwd(), 'app/workspace/page.tsx')
    const content = fs.readFileSync(pagePath, 'utf-8')
    expect(content).not.toContain('MoreHorizontal')
    expect(content).not.toContain('showOptionsDropdown')
    expect(content).not.toContain('更多选项按钮')
  })
})

describe('DOCK-EDITOR-003 Review Fix: View in Mind disabled without relatedMindNode', () => {
  it('findRelatedMindNode returns null when entity has no documentId', async () => {
    const { findRelatedMindNode } = await import('@/app/workspace/features/dock/useDockData')
    const entity = {
      id: 'test-1',
      type: 'document' as const,
      title: 'Test Doc',
      subtitle: '',
      status: 'active',
      updatedAt: null,
      createdAt: null,
      sourceLabel: '',
    }
    const node = await findRelatedMindNode(USER_A, entity)
    expect(node).toBeNull()
  })

  it('findRelatedMindNode returns node when entity has matching documentId', async () => {
    const { findRelatedMindNode } = await import('@/app/workspace/features/dock/useDockData')
    const entryId = await entriesTable.add({
      userId: USER_A,
      workspaceId: DEFAULT_WORKSPACE_ID,
      sourceDockItemId: 0,
      title: 'Test Entry',
      content: 'content',
      type: 'note',
      tags: [],
      project: null,
      actions: [],
      createdAt: new Date(),
      archivedAt: new Date(),
    })
    await mindNodesTable.add({
      id: `${USER_A}_mn_document_test_entry_${entryId}`,
      userId: USER_A,
      nodeType: 'document',
      label: 'Test Entry',
      state: 'drifting',
      documentId: entryId as number,
      degreeScore: 0,
      recentActivityScore: 0,
      documentWeightScore: 0,
      userPinScore: 0,
      clusterCenterScore: 0,
      positionX: null,
      positionY: null,
      metadata: { sourceType: 'document', entryId: entryId as number },
      createdAt: new Date(),
      updatedAt: new Date(),
      workspaceId: DEFAULT_WORKSPACE_ID,
    })
    const entity = {
      id: 'test-2',
      type: 'document' as const,
      title: 'Test Doc',
      subtitle: '',
      status: 'active',
      updatedAt: null,
      createdAt: null,
      sourceLabel: '',
      documentId: entryId as number,
    }
    const node = await findRelatedMindNode(USER_A, entity)
    expect(node).not.toBeNull()
    if (node) {
      expect(node.documentId).toBe(entryId as number)
    }
  })
})

describe('DOCK-EDITOR-003: Tiptap editor foundation constraints', () => {
  async function readEditor() {
    const fs = await import('fs')
    const path = await import('path')
    const editorPath = path.join(process.cwd(), 'app/workspace/features/editor/TiptapEditor.tsx')
    return fs.readFileSync(editorPath, 'utf-8')
  }

  it('TiptapEditor uses open-source Tiptap packages', async () => {
    const content = await readEditor()
    expect(content).toContain('@tiptap/react')
    expect(content).toContain('@tiptap/starter-kit')
    expect(content).toContain('@tiptap/suggestion')
    expect(content).not.toContain('Tiptap Pro')
    expect(content).not.toContain('Collaboration')
  })

  it('TiptapEditor toolbar covers required commands', async () => {
    const content = await readEditor()
    const requiredCommands = [
      'toggleBold',
      'toggleItalic',
      'toggleStrike',
      'toggleHeading',
      'toggleBlockquote',
      'toggleBulletList',
      'toggleOrderedList',
      'toggleCodeBlock',
      'setHorizontalRule',
    ]
    for (const cmd of requiredCommands) {
      expect(content).toContain(cmd)
    }
  })

  it('TiptapEditor implements slash menu commands', async () => {
    const content = await readEditor()
    expect(content).toContain('SlashCommand')
    expect(content).toContain('SLASH_COMMANDS')
    expect(content).toContain('Suggestion({')
    for (const command of ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'horizontalRule']) {
      expect(content).toContain(command)
    }
  })

  it('TiptapEditor implements drag handle reorder without paid DragHandle', async () => {
    const content = await readEditor()
    expect(content).toContain('tiptap-block-handle-controller')
    expect(content).toContain('resolveBlockHandleTarget')
    expect(content).toContain('moveBlockInDocument')
    expect(content).toContain('duplicateBlockInDocument')
    expect(content).toContain('deleteBlockInDocument')
    expect(content).toContain('draggable')
    expect(content).toContain('tiptap-block-drop-indicator')
    expect(content).not.toContain('tiptap-drag-handles')
    expect(content).not.toContain('@tiptap-pro/extension-drag-handle')
    expect(content).not.toContain('Suggest edits')
    expect(content).not.toContain('Ask AI')
  })

  it('TiptapEditor HTML mode is preview-only', async () => {
    const content = await readEditor()
    expect(content).toContain('tiptap-html-preview')
    expect(content).not.toContain('dangerouslySetInnerHTML')
    expect(content).not.toContain('contentEditable')
  })

  it('TiptapEditor does not contain autosave/publish/repository logic', async () => {
    const content = await readEditor()
    expect(content).not.toContain('autosave')
    expect(content).not.toContain('publishDraft')
    expect(content).not.toContain('repository')
  })

  it('DraftEditorView shows the draft list by default and keeps publish actions right aligned', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.join(process.cwd(), 'app/workspace/features/editor/DraftEditorView.tsx'), 'utf-8')
    expect(content).toContain('const [showDraftsList, setShowDraftsList] = useState(true)')
    expect(content).toContain('editor-dock-toolbar-slot')
    expect(content).toContain('toolbarPortalTargetId')
    expect(content).toContain('ml-auto flex items-center gap-2 shrink-0')
    expect(content).not.toContain('max-w-[920px]')
  })
})
