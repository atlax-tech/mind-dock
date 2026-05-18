import { similarityIndex, type SimilarityResult } from './similarityIndex'
import { embeddingVectorsTable } from './db'
import { makeEmbeddingVectorId } from '@atlax/domain'

export interface ComparisonOptions {
  userId: string
  workspaceId: string
  sourceTargetType: string
  sourceTargetId: string
  topK?: number
  threshold?: number
}

export interface ComparisonResultItem {
  targetType: string
  targetId: string
  score: number
  generatedBy: 'core' | 'semantic_core'
  providerId: string
  modelId: string
}

export interface ComparisonReport {
  sourceContentHash: string
  sourceTextLen: number
  coreModeResults: ComparisonResultItem[]
  semanticCoreResults: ComparisonResultItem[]
  overlapRate: number
  rankDifference: number
  scoreDifference: number
  fallbackUsed: boolean
  auditLogId: string
}

class SimilarityComparison {
  async runComparison(options: ComparisonOptions): Promise<ComparisonReport> {
    const { userId, workspaceId, sourceTargetType, sourceTargetId, topK = 10, threshold = 0.5 } = options

    const evId = makeEmbeddingVectorId(userId, workspaceId, sourceTargetType, sourceTargetId)
    const sourceVector = await embeddingVectorsTable.get(evId)
    const sourceContentHash = sourceVector?.contentHash ?? ''
    const sourceTextLen = sourceVector?.textLen ?? -1
    const sourceEmbeddingExists = !!sourceVector && !sourceVector.contentHash?.startsWith('__stale__')

    const semanticCoreResults = await similarityIndex.findSimilar({
      userId,
      workspaceId,
      sourceTargetType,
      sourceTargetId,
      topK,
      threshold,
      mode: 'semantic',
    })

    const coreModeResults = await this.runCoreModeQuery(userId, workspaceId, sourceTargetType, sourceTargetId, topK)

    const overlapRate = this.computeOverlapRate(coreModeResults, semanticCoreResults)
    const rankDifference = this.computeRankDifference(coreModeResults, semanticCoreResults)
    const scoreDifference = this.computeScoreDifference(coreModeResults, semanticCoreResults)

    const fallbackUsed = !sourceEmbeddingExists

    const auditLogId = `comparison_${Date.now()}`

    return {
      sourceContentHash,
      sourceTextLen,
      coreModeResults: coreModeResults.map(r => ({
        targetType: r.targetType,
        targetId: r.targetId,
        score: r.score,
        generatedBy: r.generatedBy,
        providerId: r.providerId,
        modelId: r.modelId,
      })),
      semanticCoreResults: semanticCoreResults.map(r => ({
        targetType: r.targetType,
        targetId: r.targetId,
        score: r.score,
        generatedBy: r.generatedBy,
        providerId: r.providerId,
        modelId: r.modelId,
      })),
      overlapRate,
      rankDifference,
      scoreDifference,
      fallbackUsed,
      auditLogId,
    }
  }

  private async runCoreModeQuery(userId: string, workspaceId: string, sourceTargetType: string, sourceTargetId: string, topK: number): Promise<SimilarityResult[]> {
    return similarityIndex.findSimilar({
      userId,
      workspaceId,
      sourceTargetType,
      sourceTargetId,
      topK,
      threshold: 0,
      mode: 'core',
    })
  }

  private computeOverlapRate(core: SimilarityResult[], semantic: SimilarityResult[]): number {
    if (core.length === 0 && semantic.length === 0) return 1
    const coreIds = new Set(core.map(r => `${r.targetType}:${r.targetId}`))
    const semanticIds = new Set(semantic.map(r => `${r.targetType}:${r.targetId}`))
    const intersection = Array.from(coreIds).filter(id => semanticIds.has(id)).length
    const union = new Set(Array.from(coreIds).concat(Array.from(semanticIds))).size
    return union > 0 ? intersection / union : 0
  }

  private computeRankDifference(core: SimilarityResult[], semantic: SimilarityResult[]): number {
    if (core.length === 0 || semantic.length === 0) return core.length + semantic.length
    const semanticRankMap = new Map<string, number>()
    semantic.forEach((r, i) => semanticRankMap.set(`${r.targetType}:${r.targetId}`, i))
    let totalDiff = 0
    let count = 0
    for (let i = 0; i < core.length; i++) {
      const key = `${core[i].targetType}:${core[i].targetId}`
      const semanticRank = semanticRankMap.get(key)
      if (semanticRank !== undefined) {
        totalDiff += Math.abs(i - semanticRank)
        count++
      }
    }
    return count > 0 ? totalDiff / count : core.length + semantic.length
  }

  private computeScoreDifference(core: SimilarityResult[], semantic: SimilarityResult[]): number {
    const coreScoreMap = new Map<string, number>()
    core.forEach(r => coreScoreMap.set(`${r.targetType}:${r.targetId}`, r.score))
    const semanticScoreMap = new Map<string, number>()
    semantic.forEach(r => semanticScoreMap.set(`${r.targetType}:${r.targetId}`, r.score))
    const allKeys = new Set(Array.from(coreScoreMap.keys()).concat(Array.from(semanticScoreMap.keys())))
    let totalDiff = 0
    for (const key of Array.from(allKeys)) {
      const coreScore = coreScoreMap.get(key) ?? 0
      const semanticScore = semanticScoreMap.get(key) ?? 0
      totalDiff += Math.abs(coreScore - semanticScore)
    }
    return allKeys.size > 0 ? totalDiff / allKeys.size : 0
  }
}

export const similarityComparison = new SimilarityComparison()
