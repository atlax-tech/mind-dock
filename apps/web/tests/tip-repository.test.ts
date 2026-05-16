import { afterEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  createTip,
  listActiveTips,
  getTip,
  convertTipToDraft,
  discardTip,
  listDrafts,
} from '@/lib/repository'

const USER_A = 'user_tip_test_a'
const USER_B = 'user_tip_test_b'

async function cleanAll() {
  await db.table('tips').clear()
  await db.table('editorDrafts').clear()
}

function unwrap<T>(value: T | null): T {
  expect(value).not.toBeNull()
  return value as T
}

describe('tip repository', () => {
  afterEach(cleanAll)

  describe('createTip & listActiveTips', () => {
    it('creates a tip and lists it', async () => {
      const tip = unwrap(await createTip(USER_A, '测试想法'))
      expect(tip.content).toBe('测试想法')
      expect(tip.sourceType).toBe('quick-capture')
      expect(tip.status).toBe('active')
      expect(tip.convertedDraftId).toBeNull()

      const tips = await listActiveTips(USER_A)
      expect(tips).toHaveLength(1)
      expect(tips[0].id).toBe(tip.id)
    })

    it('creates a tip with custom sourceType', async () => {
      const tip = unwrap(await createTip(USER_A, '手动输入', 'manual'))
      expect(tip.sourceType).toBe('manual')
    })

    it('trims content whitespace', async () => {
      const tip = unwrap(await createTip(USER_A, '  前后空格  '))
      expect(tip.content).toBe('前后空格')
    })

    it('rejects empty content', async () => {
      await expect(createTip(USER_A, '')).rejects.toThrow('content must not be empty')
      await expect(createTip(USER_A, '   ')).rejects.toThrow('content must not be empty')
    })

    it('rejects empty userId', async () => {
      await expect(createTip('', '内容')).rejects.toThrow('userId must not be empty')
    })

    it('isolates tips between users', async () => {
      await createTip(USER_A, 'A的想法')
      await createTip(USER_B, 'B的想法')

      const tipsA = await listActiveTips(USER_A)
      const tipsB = await listActiveTips(USER_B)
      expect(tipsA).toHaveLength(1)
      expect(tipsB).toHaveLength(1)
      expect(tipsA[0].content).toBe('A的想法')
    })

    it('only lists active tips', async () => {
      const t1 = unwrap(await createTip(USER_A, '活跃Tip'))
      const t2 = unwrap(await createTip(USER_A, '待丢弃'))

      await discardTip(USER_A, t2.id)

      const tips = await listActiveTips(USER_A)
      expect(tips).toHaveLength(1)
      expect(tips[0].id).toBe(t1.id)
    })

    it('lists tips in reverse chronological order', async () => {
      await createTip(USER_A, '第一条')
      await createTip(USER_A, '第二条')
      await createTip(USER_A, '第三条')

      const tips = await listActiveTips(USER_A)
      expect(tips).toHaveLength(3)
      expect(tips[0].content).toBe('第三条')
      expect(tips[2].content).toBe('第一条')
    })
  })

  describe('getTip', () => {
    it('returns tip by id', async () => {
      const created = unwrap(await createTip(USER_A, '查找测试'))
      const found = unwrap(await getTip(USER_A, created.id))
      expect(found.content).toBe('查找测试')
    })

    it('returns null for wrong user', async () => {
      const created = unwrap(await createTip(USER_A, 'A的想法'))
      const found = await getTip(USER_B, created.id)
      expect(found).toBeNull()
    })

    it('returns null for non-existent id', async () => {
      const found = await getTip(USER_A, 99999)
      expect(found).toBeNull()
    })
  })

  describe('convertTipToDraft', () => {
    it('converts tip to draft and updates tip status', async () => {
      const tip = unwrap(await createTip(USER_A, '待转换的想法'))
      const result = await convertTipToDraft(USER_A, tip.id)

      const convertedTip = unwrap(result.tip)
      expect(convertedTip.status).toBe('converted')
      expect(convertedTip.convertedDraftId).toBe(result.draft?.id)

      const draft = unwrap(result.draft)
      expect(draft.content).toBe('待转换的想法')
      expect(draft.title).toBe('待转换的想法'.slice(0, 60))
    })

    it('creates a draft visible in listDrafts', async () => {
      const tip = unwrap(await createTip(USER_A, '可编辑的想法'))
      const result = await convertTipToDraft(USER_A, tip.id)

      const drafts = await listDrafts(USER_A)
      expect(drafts).toHaveLength(1)
      expect(drafts[0].id).toBe(result.draft?.id)
    })

    it('removes converted tip from active list', async () => {
      const tip = unwrap(await createTip(USER_A, '转换后消失'))
      await convertTipToDraft(USER_A, tip.id)

      const tips = await listActiveTips(USER_A)
      expect(tips).toHaveLength(0)
    })

    it('fails for wrong user', async () => {
      const tip = unwrap(await createTip(USER_A, 'A的想法'))
      const result = await convertTipToDraft(USER_B, tip.id)
      expect(result.tip).toBeNull()
      expect(result.draft).toBeNull()
    })

    it('fails for already converted tip', async () => {
      const tip = unwrap(await createTip(USER_A, '已转换'))
      await convertTipToDraft(USER_A, tip.id)
      const result = await convertTipToDraft(USER_A, tip.id)
      expect(result.tip).toBeNull()
      expect(result.draft).toBeNull()
    })
  })

  describe('discardTip', () => {
    it('discards a tip', async () => {
      const tip = unwrap(await createTip(USER_A, '待丢弃'))
      const result = unwrap(await discardTip(USER_A, tip.id))
      expect(result.status).toBe('discarded')
    })

    it('removes discarded tip from active list', async () => {
      const tip = unwrap(await createTip(USER_A, '丢弃后消失'))
      await discardTip(USER_A, tip.id)

      const tips = await listActiveTips(USER_A)
      expect(tips).toHaveLength(0)
    })

    it('fails for wrong user', async () => {
      const tip = unwrap(await createTip(USER_A, 'A的想法'))
      const result = await discardTip(USER_B, tip.id)
      expect(result).toBeNull()
    })

    it('fails for already discarded tip', async () => {
      const tip = unwrap(await createTip(USER_A, '已丢弃'))
      await discardTip(USER_A, tip.id)
      const result = await discardTip(USER_A, tip.id)
      expect(result).toBeNull()
    })
  })
})
