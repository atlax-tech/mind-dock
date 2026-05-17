import type { LocalTextFeatureSnapshot } from '@atlax/domain'
import {
  upsertLocalTextFeatureSnapshot,
  getLocalTextFeatureSnapshotByTarget,
} from './intelligenceRepository'

interface LocalTextFeaturePayload {
  targetType: string
  targetId: string
  userId: string
  workspaceId: string
  contentHash: string
  text: string
  title?: string
  sourceType?: string
}

const CHINESE_STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人',
  '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去',
  '你', '会', '着', '没有', '看', '好', '自己', '这',
])

const ENGLISH_STOP_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it',
  'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this',
  'but', 'his', 'by', 'from', 'they',
])

function sanitizeError(message: string): Error {
  return new Error(message.slice(0, 200))
}

function nowISO(): string {
  return new Date().toISOString()
}

function detectLanguage(text: string): string {
  let chineseChars = 0
  let englishChars = 0
  let totalAlpha = 0

  for (const ch of text) {
    if (/[\u4e00-\u9fff]/.test(ch)) {
      chineseChars++
      totalAlpha++
    } else if (/[a-zA-Z]/.test(ch)) {
      englishChars++
      totalAlpha++
    }
  }

  if (totalAlpha === 0) return 'unknown'

  const chineseRatio = chineseChars / totalAlpha
  const englishRatio = englishChars / totalAlpha

  if (chineseRatio >= 0.3) return 'zh'
  if (englishRatio >= 0.5) return 'en'
  return 'unknown'
}

function computeLengthMetrics(text: string): Record<string, number> {
  const charCount = text.length

  const englishWordCount = text.split(/\s+/).filter(w => w.length > 0).length

  let chineseCharCount = 0
  for (const ch of text) {
    if (/[\u4e00-\u9fff]/.test(ch)) {
      chineseCharCount++
    }
  }

  const wordCount = chineseCharCount > 0
    ? englishWordCount + chineseCharCount
    : englishWordCount

  return { charCount, wordCount }
}

function extractKeywords(text: string, _language: string): string[] {
  const tokens = text.toLowerCase().split(/[\s,.;:!?、，。；：！？\n\r\t()（）【】《》""''""\[\]{}]+/).filter(t => t.length > 0)

  const tf: Record<string, number> = {}
  for (const token of tokens) {
    const cleaned = token.replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
    if (!cleaned) continue

    if (CHINESE_STOP_WORDS.has(cleaned) || ENGLISH_STOP_WORDS.has(cleaned)) continue

    if (cleaned.length <= 2) continue

    tf[cleaned] = (tf[cleaned] || 0) + 1
  }

  return Object.entries(tf)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word)
}

function extractEntities(text: string): string[] {
  const entities: string[] = []

  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  let match: RegExpExecArray | null
  while ((match = emailRegex.exec(text)) !== null) {
    entities.push(`email:${match[0]}`)
  }

  const urlRegex = /https?:\/\/[^\s)]+/g
  while ((match = urlRegex.exec(text)) !== null) {
    entities.push(`url:${match[0]}`)
  }

  const dateRegex = /\b\d{4}-\d{2}-\d{2}\b/g
  while ((match = dateRegex.exec(text)) !== null) {
    entities.push(`date:${match[0]}`)
  }

  const numberRegex = /\b\d{4,}\b/g
  while ((match = numberRegex.exec(text)) !== null) {
    entities.push(`number:${match[0]}`)
  }

  const acronymRegex = /\b[A-Z]{3,}\b/g
  while ((match = acronymRegex.exec(text)) !== null) {
    entities.push(`acronym:${match[0]}`)
  }

  return entities
}

function extractStructureHints(text: string): string[] {
  const hints: string[] = []
  const lines = text.split('\n')

  const hasTitle = lines.some(line => /^#{1,6}\s/.test(line))
  if (hasTitle) hints.push('hasTitle')

  const hasList = lines.some(line => /^(\s*[-*]\s|\s*\d+\.\s)/.test(line))
  if (hasList) hints.push('hasList')

  const hasCodeBlock = /```[\s\S]*?```/.test(text)
  if (hasCodeBlock) hints.push('hasCodeBlock')

  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0)
  hints.push(`paragraphCount:${paragraphs.length}`)

  return hints
}

async function computeFeatures(payload: LocalTextFeaturePayload): Promise<LocalTextFeatureSnapshot> {
  const { targetType, targetId, userId, workspaceId, contentHash, text } = payload

  if (!targetId) throw sanitizeError('targetId is required')
  if (!workspaceId) throw sanitizeError('workspaceId is required')
  if (!contentHash) throw sanitizeError('contentHash is required')
  if (!text) throw sanitizeError('text is required')

  const existing = await getLocalTextFeatureSnapshotByTarget(userId, targetType, targetId, workspaceId)
  if (existing && !existing.stale && existing.contentHash === contentHash) {
    return existing
  }

  const language = detectLanguage(text)
  const lengthMetrics = computeLengthMetrics(text)
  const keywords = extractKeywords(text, language)
  const entities = extractEntities(text)
  const structureHints = extractStructureHints(text)

  const now = nowISO()
  const snapshot: Omit<LocalTextFeatureSnapshot, 'id'> = {
    userId,
    workspaceId,
    targetType,
    targetId,
    contentHash,
    language,
    keywords,
    entities,
    compactText: '',
    lengthMetrics,
    structureHints,
    source: 'LocalTextFeatureEngine',
    reason: 'computed',
    evidence: 'rule-based',
    confidence: 0.7,
    safetyLevel: 'low',
    stale: false,
    staleKey: 0,
    expiredAt: null,
    createdAt: now,
    updatedAt: now,
  }

  await upsertLocalTextFeatureSnapshot(snapshot, workspaceId)

  const result = await getLocalTextFeatureSnapshotByTarget(userId, targetType, targetId, workspaceId)
  if (!result) {
    throw new Error('LocalTextFeatureEngine: failed to read back snapshot')
  }
  return result
}

export const localTextFeatureEngine = {
  computeFeatures,
}