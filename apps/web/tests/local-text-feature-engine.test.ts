import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'
import { DEFAULT_WORKSPACE_ID } from '@atlax/domain'
import { localTextFeatureEngine } from '@/lib/localTextFeatureEngine'

const USER_A = 'user_test_a'
const WS_DEFAULT = DEFAULT_WORKSPACE_ID

async function cleanAll() {
  await db.table('localTextFeatureSnapshots').clear()
}

function makePayload(overrides: Partial<{
  targetType: string
  targetId: string
  userId: string
  workspaceId: string
  contentHash: string
  text: string
}> = {}) {
  return {
    targetType: 'dockItem',
    targetId: '1',
    userId: USER_A,
    workspaceId: WS_DEFAULT,
    contentHash: 'ch_test_snapshot',
    text: '这是一段测试文本，用于验证本地文本特征引擎的功能。',
    ...overrides,
  }
}

describe('localTextFeatureEngine.computeFeatures()', () => {
  beforeEach(cleanAll)
  afterEach(cleanAll)

  describe('Snapshot Generation', () => {
    it('generates correct snapshot for Chinese text', async () => {
      const text = '人工智能正在改变我们的生活方式。机器学习算法可以从海量数据中发现模式，深度学习模型能够理解自然语言。'
      const payload = makePayload({ text, contentHash: 'ch_zh_001' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      expect(snapshot.language).toBe('zh')
      expect(snapshot.lengthMetrics.charCount).toBe(text.length)
      expect(snapshot.lengthMetrics.wordCount).toBeGreaterThan(0)
      expect(snapshot.keywords.length).toBeGreaterThan(0)
      expect(snapshot.keywords.every((k: string) => typeof k === 'string')).toBe(true)

      expect(snapshot.structureHints).toEqual(
        expect.arrayContaining(['paragraphCount:1']),
      )

      expect(snapshot.userId).toBe(USER_A)
      expect(snapshot.workspaceId).toBe(WS_DEFAULT)
      expect(snapshot.targetType).toBe('dockItem')
      expect(snapshot.targetId).toBe('1')
      expect(snapshot.contentHash).toBe('ch_zh_001')
      expect(snapshot.source).toBe('LocalTextFeatureEngine')
      expect(snapshot.reason).toBe('computed')
      expect(snapshot.evidence).toBe('rule-based')
      expect(snapshot.confidence).toBe(0.7)
      expect(snapshot.safetyLevel).toBe('low')
      expect(snapshot.stale).toBe(false)
      expect(snapshot.staleKey).toBe(0)
      expect(snapshot.expiredAt).toBeNull()
    })

    it('detects entities in Chinese text with email, URL, and date', async () => {
      const text = '请联系 test@example.com 或访问 https://example.com/page 查看 2024-03-15 的报告。'
      const payload = makePayload({ text, contentHash: 'ch_entities' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      expect(snapshot.entities).toEqual(
        expect.arrayContaining(['email:test@example.com', 'url:https://example.com/page', 'date:2024-03-15']),
      )
    })
  })

  describe('Language Detection', () => {
    it('detects English text as language=en', async () => {
      const text = 'Artificial intelligence is transforming the way we live and work. Machine learning algorithms discover patterns from vast amounts of data.'
      const payload = makePayload({ text, contentHash: 'ch_en_001' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      expect(snapshot.language).toBe('en')
    })

    it('detects Chinese text as language=zh', async () => {
      const text = '人工智能正在改变世界。'
      const payload = makePayload({ text, contentHash: 'ch_zh_002' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      expect(snapshot.language).toBe('zh')
    })

    it('returns language=unknown for empty text', async () => {
      const payload = makePayload({ text: '   ', contentHash: 'ch_empty' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      expect(snapshot.language).toBe('unknown')
      expect(snapshot.lengthMetrics.charCount).toBe(3)
      expect(snapshot.lengthMetrics.wordCount).toBe(0)
    })

    it('returns language=unknown for text with only numbers and symbols', async () => {
      const payload = makePayload({ text: '12345 !@#$% 67890', contentHash: 'ch_symbols' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      expect(snapshot.language).toBe('unknown')
    })
  })

  describe('Idempotency', () => {
    it('returns existing snapshot when same contentHash exists and not stale', async () => {
      const text = '这是一段用于测试幂等性的文本内容。'
      const payload = makePayload({ text, contentHash: 'ch_idempotent' })

      const first = await localTextFeatureEngine.computeFeatures(payload)
      const second = await localTextFeatureEngine.computeFeatures(payload)

      expect(first.id).toBe(second.id)
      expect(first.contentHash).toBe(second.contentHash)
      expect(first.keywords).toEqual(second.keywords)

      const all = await db.table('localTextFeatureSnapshots').toArray()
      expect(all).toHaveLength(1)
    })

    it('recomputes when existing snapshot is stale even with same contentHash', async () => {
      const text = '幂等性测试的文本内容。'
      const payload = makePayload({ text, contentHash: 'ch_stale_test' })

      const first = await localTextFeatureEngine.computeFeatures(payload)

      await db.table('localTextFeatureSnapshots').update(first.id, {
        stale: true,
        staleKey: 1 as const,
      })

      const second = await localTextFeatureEngine.computeFeatures(payload)

      expect(second.stale).toBe(false)
      expect(second.staleKey).toBe(0)
    })
  })

  describe('Payload Validation', () => {
    it('throws Error when targetId is missing', async () => {
      const payload = makePayload({ targetId: '' })

      await expect(
        localTextFeatureEngine.computeFeatures(payload),
      ).rejects.toThrow('targetId is required')
    })

    it('throws Error when workspaceId is missing', async () => {
      const payload = makePayload({ workspaceId: '' })

      await expect(
        localTextFeatureEngine.computeFeatures(payload),
      ).rejects.toThrow('workspaceId is required')
    })

    it('throws Error when contentHash is missing', async () => {
      const payload = makePayload({ contentHash: '' })

      await expect(
        localTextFeatureEngine.computeFeatures(payload),
      ).rejects.toThrow('contentHash is required')
    })

    it('throws Error when text is missing', async () => {
      const payload = makePayload({ text: '' })

      await expect(
        localTextFeatureEngine.computeFeatures(payload),
      ).rejects.toThrow('text is required')
    })
  })

  describe('Compact Text', () => {
    it('compactText is empty string, not the full original text', async () => {
      const text = '这是一段较长的测试文本内容，用于验证 compactText 不会存储原文全文。'
      const payload = makePayload({ text, contentHash: 'ch_compact' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      expect(snapshot.compactText).not.toBe(text)
      expect(snapshot.compactText).toBe('')
    })
  })

  describe('Target Isolation', () => {
    it('only reads snapshot for the specified target, not cross-target', async () => {
      const targetA = makePayload({ targetId: 'target-a', text: '目标A的文本内容。', contentHash: 'ch_a' })
      const targetB = makePayload({ targetId: 'target-b', text: '目标B的文本内容。', contentHash: 'ch_b' })

      const snapshotA = await localTextFeatureEngine.computeFeatures(targetA)
      const snapshotB = await localTextFeatureEngine.computeFeatures(targetB)

      expect(snapshotA.targetId).toBe('target-a')
      expect(snapshotB.targetId).toBe('target-b')
      expect(snapshotA.id).not.toBe(snapshotB.id)
      expect(snapshotA.contentHash).toBe('ch_a')
      expect(snapshotB.contentHash).toBe('ch_b')

      const all = await db.table('localTextFeatureSnapshots').toArray()
      expect(all).toHaveLength(2)
    })
  })

  describe('Structure Hints Detection', () => {
    it('detects hasTitle when text contains # Title', async () => {
      const text = '# 项目规划\n\n这是项目规划的详细内容。'
      const payload = makePayload({ text, contentHash: 'ch_title' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      expect(snapshot.structureHints).toContain('hasTitle')
    })

    it('detects hasList when text contains dash list items', async () => {
      const text = '- 第一项\n- 第二项\n- 第三项'
      const payload = makePayload({ text, contentHash: 'ch_list_dash' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      expect(snapshot.structureHints).toContain('hasList')
    })

    it('detects hasList when text contains numbered list items', async () => {
      const text = '1. 第一步\n2. 第二步\n3. 第三步'
      const payload = makePayload({ text, contentHash: 'ch_list_numbered' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      expect(snapshot.structureHints).toContain('hasList')
    })

    it('detects hasCodeBlock when text contains fenced code block', async () => {
      const text = '下面是一段代码：\n```\nconst x = 1;\nconsole.log(x);\n```'
      const payload = makePayload({ text, contentHash: 'ch_code' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      expect(snapshot.structureHints).toContain('hasCodeBlock')
    })

    it('reports correct paragraphCount', async () => {
      const text = '第一段内容。\n\n第二段内容。\n\n第三段内容。'
      const payload = makePayload({ text, contentHash: 'ch_paragraphs' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      expect(snapshot.structureHints).toContain('paragraphCount:3')
    })
  })

  describe('Keyword Filtering', () => {
    it('returns at most 10 keywords', async () => {
      const text = '人工智能 机器学习 深度学习 神经网络 自然语言 计算机视觉 强化学习 迁移学习 联邦学习 对比学习 自监督学习 知识图谱 推荐系统'
      const payload = makePayload({ text, contentHash: 'ch_kw_limit' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      expect(snapshot.keywords.length).toBeLessThanOrEqual(10)
    })

    it('filters out Chinese stop words', async () => {
      const text = '我是一个人在学习人工智能技术的'
      const payload = makePayload({ text, contentHash: 'ch_stop_zh' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      const stopWords = ['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一个']
      for (const kw of snapshot.keywords) {
        expect(stopWords).not.toContain(kw)
      }
    })

    it('filters out English stop words', async () => {
      const text = 'the machine learning algorithm is for the data processing system'
      const payload = makePayload({ text, contentHash: 'ch_stop_en' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      const stopWords = ['the', 'for', 'and', 'not', 'but']
      for (const kw of snapshot.keywords) {
        expect(stopWords).not.toContain(kw)
      }
    })

    it('filters out words with length <= 2', async () => {
      const text = 'ab cd ef ghi jkl mno pqr stu vwx yz learning intelligence'
      const payload = makePayload({ text, contentHash: 'ch_short_words' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      for (const kw of snapshot.keywords) {
        expect(kw.length).toBeGreaterThan(2)
      }
      const hasLongWords = snapshot.keywords.some(
        (k: string) => k === 'learning' || k === 'intelligence',
      )
      expect(hasLongWords).toBe(true)
    })
  })

  describe('Entity Detection', () => {
    it('extracts email entities with email: prefix', async () => {
      const text = '联系方式：admin@example.com 和 support@company.co.uk'
      const payload = makePayload({ text, contentHash: 'ch_entity_email' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      expect(snapshot.entities).toEqual(
        expect.arrayContaining(['email:admin@example.com', 'email:support@company.co.uk']),
      )
    })

    it('extracts URL entities with url: prefix', async () => {
      const text = '参考链接：https://example.com/docs 和 http://test.org/api'
      const payload = makePayload({ text, contentHash: 'ch_entity_url' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      expect(snapshot.entities).toEqual(
        expect.arrayContaining(['url:https://example.com/docs', 'url:http://test.org/api']),
      )
    })

    it('extracts date entities with date: prefix', async () => {
      const text = '会议日期：2024-01-15 至 2024-06-30'
      const payload = makePayload({ text, contentHash: 'ch_entity_date' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      expect(snapshot.entities).toEqual(
        expect.arrayContaining(['date:2024-01-15', 'date:2024-06-30']),
      )
    })

    it('extracts number entities with number: prefix', async () => {
      const text = '订单编号：202405180001 和 9876543210'
      const payload = makePayload({ text, contentHash: 'ch_entity_number' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      expect(snapshot.entities).toEqual(
        expect.arrayContaining(['number:202405180001', 'number:9876543210']),
      )
    })

    it('extracts acronym entities with acronym: prefix', async () => {
      const text = '我们使用 API 和 SDK 来集成 AI 和 NLP 技术。'
      const payload = makePayload({ text, contentHash: 'ch_entity_acronym' })

      const snapshot = await localTextFeatureEngine.computeFeatures(payload)

      expect(snapshot.entities).toEqual(
        expect.arrayContaining(['acronym:API', 'acronym:SDK', 'acronym:NLP']),
      )
    })
  })
})