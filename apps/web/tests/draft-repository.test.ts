import { afterEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  createDraft,
  listDrafts,
  getDraft,
  updateDraft,
  publishDraftToDocument,
  discardDraft,
} from '@/lib/repository'

const USER_A = 'user_draft_test_a'
const USER_B = 'user_draft_test_b'

async function cleanAll() {
  await db.table('editorDrafts').clear()
  await db.table('entries').clear()
}

function unwrap<T>(value: T | null): T {
  expect(value).not.toBeNull()
  return value as T
}

describe('draft repository', () => {
  afterEach(cleanAll)

  describe('createDraft & listDrafts', () => {
    it('creates a draft and lists it', async () => {
      const draft = unwrap(await createDraft(USER_A, '测试标题', '测试内容'))
      expect(draft.title).toBe('测试标题')
      expect(draft.content).toBe('测试内容')
      expect(draft.status).toBe('active')
      expect(draft.draftKey).toBe(draft.id)

      const drafts = await listDrafts(USER_A)
      expect(drafts).toHaveLength(1)
      expect(drafts[0].id).toBe(draft.id)
    })

    it('creates a draft with default empty values', async () => {
      const draft = unwrap(await createDraft(USER_A))
      expect(draft.title).toBe('')
      expect(draft.content).toBe('')
    })

    it('isolates drafts between users', async () => {
      await createDraft(USER_A, 'A的草稿')
      await createDraft(USER_B, 'B的草稿')

      const draftsA = await listDrafts(USER_A)
      const draftsB = await listDrafts(USER_B)
      expect(draftsA).toHaveLength(1)
      expect(draftsB).toHaveLength(1)
      expect(draftsA[0].title).toBe('A的草稿')
    })

    it('only lists active drafts', async () => {
      const d1 = unwrap(await createDraft(USER_A, '活跃草稿'))
      const d2 = unwrap(await createDraft(USER_A, '待发布'))

      await publishDraftToDocument(USER_A, d2.id)

      const drafts = await listDrafts(USER_A)
      expect(drafts).toHaveLength(1)
      expect(drafts[0].id).toBe(d1.id)
    })
  })

  describe('getDraft', () => {
    it('returns draft by id', async () => {
      const created = unwrap(await createDraft(USER_A, '查找测试'))
      const found = unwrap(await getDraft(USER_A, created.id))
      expect(found.title).toBe('查找测试')
    })

    it('returns null for wrong user', async () => {
      const created = unwrap(await createDraft(USER_A, 'A的草稿'))
      const found = await getDraft(USER_B, created.id)
      expect(found).toBeNull()
    })
  })

  describe('updateDraft', () => {
    it('updates title and content', async () => {
      const created = unwrap(await createDraft(USER_A, '旧标题', '旧内容'))
      const updated = unwrap(await updateDraft(USER_A, created.id, { title: '新标题', content: '新内容' }))
      expect(updated.title).toBe('新标题')
      expect(updated.content).toBe('新内容')
    })

    it('updates only title', async () => {
      const created = unwrap(await createDraft(USER_A, '旧标题', '旧内容'))
      const updated = unwrap(await updateDraft(USER_A, created.id, { title: '新标题' }))
      expect(updated.title).toBe('新标题')
      expect(updated.content).toBe('旧内容')
    })
  })

  describe('publishDraftToDocument', () => {
    it('publishes draft and creates entry', async () => {
      const draft = unwrap(await createDraft(USER_A, '发布测试', '发布内容'))
      const result = await publishDraftToDocument(USER_A, draft.id)

      const publishedDraft = unwrap(result.draft)
      expect(publishedDraft.status).toBe('published')

      const entry = unwrap(result.entry)
      expect(entry.title).toBe('发布测试')
      expect(entry.content).toBe('发布内容')
    })

    it('removes published draft from active list', async () => {
      const draft = unwrap(await createDraft(USER_A, '待发布'))
      await publishDraftToDocument(USER_A, draft.id)

      const activeDrafts = await listDrafts(USER_A)
      expect(activeDrafts).toHaveLength(0)
    })

    it('fails for wrong user', async () => {
      const draft = unwrap(await createDraft(USER_A, 'A的草稿'))
      const result = await publishDraftToDocument(USER_B, draft.id)
      expect(result.draft).toBeNull()
      expect(result.entry).toBeNull()
    })
  })

  describe('discardDraft', () => {
    it('discards a draft', async () => {
      const draft = unwrap(await createDraft(USER_A, '待丢弃'))
      const result = unwrap(await discardDraft(USER_A, draft.id))
      expect(result.status).toBe('discarded')
    })

    it('removes discarded draft from active list', async () => {
      const draft = unwrap(await createDraft(USER_A, '待丢弃'))
      await discardDraft(USER_A, draft.id)

      const activeDrafts = await listDrafts(USER_A)
      expect(activeDrafts).toHaveLength(0)
    })

    it('fails for wrong user', async () => {
      const draft = unwrap(await createDraft(USER_A, 'A的草稿'))
      const result = await discardDraft(USER_B, draft.id)
      expect(result).toBeNull()
    })
  })
})
