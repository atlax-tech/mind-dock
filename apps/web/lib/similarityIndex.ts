import type { PersistedEmbeddingVector, SimilarityIndexEntryRecord } from './db'
import { embeddingVectorsTable, localTextFeatureSnapshotsTable } from './db'
import {
  upsertSimilarityIndexEntry,
  getEmbeddingVectorsByWorkspace,
  getLocalTextFeatureSnapshotByTarget,
} from './intelligenceRepository'

export interface FindSimilarOptions {
  userId: string
  workspaceId: string
  sourceTargetType: string
  sourceTargetId: string
  topK?: number
  threshold?: number
  targetTypes?: string[]
  mode?: 'auto' | 'core' | 'semantic'
}

export interface SimilarityResult {
  targetType: string
  targetId: string
  score: number
  generatedBy: 'core' | 'semantic_core'
  providerId: string
  modelId: string
  modelVersion: string
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  if (denom === 0) return 0
  return dot / denom
}

export function normalizeScore(rawScore: number): number {
  return (rawScore + 1) / 2
}

class SimilarityIndex {
  async findSimilar(options: FindSimilarOptions): Promise<SimilarityResult[]> {
    const {
      userId,
      workspaceId,
      sourceTargetType,
      sourceTargetId,
      topK = 10,
      threshold = 0.5,
      targetTypes,
      mode = 'auto',
    } = options

    if (mode === 'core') {
      return this.findSimilarCore(userId, workspaceId, sourceTargetType, sourceTargetId, topK, targetTypes)
    }

    if (mode === 'semantic') {
      const sourceVector = await this.getEmbeddingVector(userId, workspaceId, sourceTargetType, sourceTargetId)
      if (!sourceVector) return []
      return this.findSimilarSemantic(userId, workspaceId, sourceTargetType, sourceTargetId, sourceVector, topK, threshold, targetTypes)
    }

    const sourceVector = await this.getEmbeddingVector(userId, workspaceId, sourceTargetType, sourceTargetId)

    if (sourceVector) {
      return this.findSimilarSemantic(userId, workspaceId, sourceTargetType, sourceTargetId, sourceVector, topK, threshold, targetTypes)
    }

    return this.findSimilarCore(userId, workspaceId, sourceTargetType, sourceTargetId, topK, targetTypes)
  }

  private async getEmbeddingVector(userId: string, workspaceId: string, targetType: string, targetId: string): Promise<PersistedEmbeddingVector | undefined> {
    const { makeEmbeddingVectorId } = await import('@atlax/domain')
    const id = makeEmbeddingVectorId(userId, workspaceId, targetType, targetId)
    const record = await embeddingVectorsTable.get(id)
    if (!record) return undefined
    if (record.contentHash?.startsWith('__stale__')) return undefined
    return record as PersistedEmbeddingVector | undefined
  }

  private async findSimilarSemantic(
    userId: string,
    workspaceId: string,
    sourceTargetType: string,
    sourceTargetId: string,
    sourceVector: PersistedEmbeddingVector,
    topK: number,
    threshold: number,
    targetTypes?: string[],
  ): Promise<SimilarityResult[]> {
    const sourceArr = new Float32Array(sourceVector.vectorBlob)
    const allVectors = await getEmbeddingVectorsByWorkspace(userId, workspaceId)

    const candidates: Array<{ vector: PersistedEmbeddingVector; score: number }> = []

    for (const v of allVectors) {
      if (v.id === sourceVector.id) continue
      if (targetTypes && !targetTypes.includes(v.targetType)) continue
      if (v.contentHash?.startsWith('__stale__')) continue

      const targetArr = new Float32Array(v.vectorBlob)
      const rawScore = cosineSimilarity(sourceArr, targetArr)
      const score = normalizeScore(rawScore)

      if (score >= threshold) {
        candidates.push({ vector: v, score })
      }
    }

    candidates.sort((a, b) => b.score - a.score)
    const topCandidates = candidates.slice(0, topK)

    const results: SimilarityResult[] = []
    const now = new Date().toISOString()

    for (const { vector, score } of topCandidates) {
      const entry: SimilarityIndexEntryRecord = {
        userId,
        workspaceId,
        sourceTargetType,
        sourceTargetId,
        targetTargetType: vector.targetType,
        targetTargetId: vector.targetId,
        score,
        generatedBy: 'semantic_core',
        providerId: vector.providerId,
        modelId: vector.modelId,
        modelVersion: vector.modelVersion,
        sourceContentHash: sourceVector.contentHash,
        targetContentHash: vector.contentHash,
        stale: false,
        staleKey: 0,
        createdAt: now,
        updatedAt: now,
      }
      await upsertSimilarityIndexEntry(entry, workspaceId)

      results.push({
        targetType: vector.targetType,
        targetId: vector.targetId,
        score,
        generatedBy: 'semantic_core',
        providerId: vector.providerId,
        modelId: vector.modelId,
        modelVersion: vector.modelVersion,
      })
    }

    return results
  }

  private async findSimilarCore(
    userId: string,
    workspaceId: string,
    sourceTargetType: string,
    sourceTargetId: string,
    topK: number,
    targetTypes?: string[],
  ): Promise<SimilarityResult[]> {
    const sourceSnapshot = await getLocalTextFeatureSnapshotByTarget(userId, sourceTargetType, sourceTargetId, workspaceId)
    if (!sourceSnapshot || sourceSnapshot.keywords.length === 0) {
      return []
    }

    const sourceKeywords = new Set(sourceSnapshot.keywords.map(k => k.toLowerCase()))
    const allSnapshots = await localTextFeatureSnapshotsTable
      .where('[userId+workspaceId]')
      .equals([userId, workspaceId])
      .toArray()

    const candidates: Array<{ targetType: string; targetId: string; score: number; contentHash: string }> = []

    for (const snap of allSnapshots) {
      if (snap.targetType === sourceTargetType && snap.targetId === sourceTargetId) continue
      if (targetTypes && !targetTypes.includes(snap.targetType)) continue

      const targetKeywords: string[] = snap.keywords.map((k: string) => k.toLowerCase())
      const overlap = targetKeywords.filter((k: string) => sourceKeywords.has(k)).length
      const union = new Set<string>(Array.from(sourceKeywords).concat(targetKeywords)).size
      const score = union > 0 ? overlap / union : 0

      if (score > 0) {
        candidates.push({ targetType: snap.targetType, targetId: snap.targetId, score, contentHash: snap.contentHash })
      }
    }

    candidates.sort((a, b) => b.score - a.score)
    const topCandidates = candidates.slice(0, topK)

    const results: SimilarityResult[] = []
    const now = new Date().toISOString()

    for (const { targetType, targetId, score, contentHash } of topCandidates) {
      const entry: SimilarityIndexEntryRecord = {
        userId,
        workspaceId,
        sourceTargetType,
        sourceTargetId,
        targetTargetType: targetType,
        targetTargetId: targetId,
        score,
        generatedBy: 'core',
        providerId: 'rule_fallback',
        modelId: 'rule_fallback',
        modelVersion: 'rule_fallback',
        sourceContentHash: sourceSnapshot.contentHash,
        targetContentHash: contentHash,
        stale: false,
        staleKey: 0,
        createdAt: now,
        updatedAt: now,
      }
      await upsertSimilarityIndexEntry(entry, workspaceId)

      results.push({
        targetType,
        targetId,
        score,
        generatedBy: 'core',
        providerId: 'rule_fallback',
        modelId: 'rule_fallback',
        modelVersion: 'rule_fallback',
      })
    }

    return results
  }
}

export const similarityIndex = new SimilarityIndex()
