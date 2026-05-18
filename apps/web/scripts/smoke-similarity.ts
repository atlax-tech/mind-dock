import 'fake-indexeddb/auto'
import { initOllamaProviders, resetProviders } from '../lib/modelProvider'
import { probeAndSyncStatus, generateEmbeddingForTarget } from '../lib/localModelRuntimeService'
import { similarityIndex } from '../lib/similarityIndex'
import { similarityComparison } from '../lib/similarityComparison'
import { computeContentHash } from '../lib/contentHash'
import { upsertLocalTextFeatureSnapshot } from '../lib/intelligenceRepository'
import { embeddingVectorsTable } from '../lib/db'
import { makeEmbeddingVectorId } from '@atlax/domain'

const SMOKE_USER_ID = 'smoke-sim-user'
const SMOKE_WORKSPACE_ID = 'smoke-sim-workspace'
const DEFAULT_LOCAL_MODEL_BASE_URL = 'http://localhost:11434/v1'
const DEFAULT_EMBEDDING_MODEL_ID = 'qwen3-embedding:0.6b'
const DEFAULT_REASONING_MODEL_ID = 'qwen3:1.7b'

const SOURCE_TEXT = 'Machine learning algorithms can automatically improve through experience and data analysis, enabling predictive modeling and pattern recognition.'
const RELATED_TEXT = 'Deep neural networks learn hierarchical representations from training data, allowing computers to recognize complex patterns and make accurate predictions.'
const UNRELATED_TEXT = 'The recipe for traditional sourdough bread requires flour, water, salt, and a naturally fermented starter culture maintained over several days.'

const TARGET_TYPE = 'dockItem'

async function main(): Promise<void> {
  console.log('=== Atlax MindDock Similarity Smoke Test ===')
  console.log(`Time: ${new Date().toISOString()}`)
  console.log(`User: ${SMOKE_USER_ID}`)
  console.log(`Workspace: ${SMOKE_WORKSPACE_ID}`)
  console.log()

  resetProviders()
  initOllamaProviders({
    baseUrl: process.env.LOCAL_MODEL_BASE_URL ?? DEFAULT_LOCAL_MODEL_BASE_URL,
    apiKey: process.env.LOCAL_MODEL_API_KEY ?? 'ollama',
    embeddingModelId: process.env.EMBEDDING_MODEL_ID ?? DEFAULT_EMBEDDING_MODEL_ID,
    reasoningModelId: process.env.REASONING_MODEL_ID ?? DEFAULT_REASONING_MODEL_ID,
    allowOutsideDev: true,
  })

  console.log('--- Step 1: Probe ---')
  const probeResult = await probeAndSyncStatus(SMOKE_USER_ID, SMOKE_WORKSPACE_ID)
  if (!probeResult.available || !probeResult.embeddingAvailable) {
    console.log('BLOCKED: Embedding provider unavailable. Cannot run similarity smoke test.')
    console.log(`  probe available: ${probeResult.available}`)
    console.log(`  embedding available: ${probeResult.embeddingAvailable}`)
    process.exit(1)
  }
  console.log('Probe OK: embedding provider available')
  console.log()

  console.log('--- Step 2: Generate 3 real embeddings ---')
  const sourceContentHash = computeContentHash(SOURCE_TEXT)
  const relatedContentHash = computeContentHash(RELATED_TEXT)
  const unrelatedContentHash = computeContentHash(UNRELATED_TEXT)

  const sourceTargetId = 'smoke_source'
  const relatedTargetId = 'smoke_related'
  const unrelatedTargetId = 'smoke_unrelated'

  const sourceEmbStart = Date.now()
  const sourceEmbResult = await generateEmbeddingForTarget(
    SMOKE_USER_ID, SMOKE_WORKSPACE_ID, TARGET_TYPE, sourceTargetId,
    SOURCE_TEXT, sourceContentHash,
  )
  const sourceEmbDurationMs = Date.now() - sourceEmbStart

  if (!sourceEmbResult.success) {
    console.log('FAIL: Source embedding generation failed')
    console.log(`  error: ${sourceEmbResult.error}`)
    process.exit(1)
  }

  const relatedEmbResult = await generateEmbeddingForTarget(
    SMOKE_USER_ID, SMOKE_WORKSPACE_ID, TARGET_TYPE, relatedTargetId,
    RELATED_TEXT, relatedContentHash,
  )
  if (!relatedEmbResult.success) {
    console.log('FAIL: Related embedding generation failed')
    process.exit(1)
  }

  const unrelatedEmbResult = await generateEmbeddingForTarget(
    SMOKE_USER_ID, SMOKE_WORKSPACE_ID, TARGET_TYPE, unrelatedTargetId,
    UNRELATED_TEXT, unrelatedContentHash,
  )
  if (!unrelatedEmbResult.success) {
    console.log('FAIL: Unrelated embedding generation failed')
    process.exit(1)
  }

  console.log('All 3 embeddings generated successfully')
  console.log()

  console.log('--- Step 3: Verify EmbeddingVector persisted ---')
  const sourceEvId = makeEmbeddingVectorId(SMOKE_USER_ID, SMOKE_WORKSPACE_ID, TARGET_TYPE, sourceTargetId)
  const sourceEv = await embeddingVectorsTable.get(sourceEvId)
  if (!sourceEv) {
    console.log('FAIL: Source EmbeddingVector not found in IndexedDB')
    process.exit(1)
  }
  console.log(`Source EmbeddingVector: id=${sourceEv.id}, providerId=${sourceEv.providerId}, modelId=${sourceEv.modelId}, modelVersion=${sourceEv.modelVersion}, dimension=${sourceEv.dimension}, vectorHash=${sourceEv.vectorHash}`)
  console.log()

  console.log('--- Step 4: SimilarityIndex.findSimilar({ mode: "semantic" }) ---')
  const semanticResults = await similarityIndex.findSimilar({
    userId: SMOKE_USER_ID,
    workspaceId: SMOKE_WORKSPACE_ID,
    sourceTargetType: TARGET_TYPE,
    sourceTargetId: sourceTargetId,
    topK: 10,
    threshold: 0,
    mode: 'semantic',
  })

  if (semanticResults.length === 0) {
    console.log('FAIL: Semantic search returned no results')
    process.exit(1)
  }

  console.log(`Semantic topK results: ${semanticResults.length}`)
  for (const r of semanticResults) {
    console.log(`  targetId=${r.targetId}, score=${r.score.toFixed(6)}, generatedBy=${r.generatedBy}, providerId=${r.providerId}, modelId=${r.modelId}, modelVersion=${r.modelVersion}`)
  }
  console.log()

  const hasSemanticCore = semanticResults.some(r => r.generatedBy === 'semantic_core')
  if (!hasSemanticCore) {
    console.log('FAIL: No semantic_core results found — model vectors not consumed by SimilarityIndex')
    process.exit(1)
  }

  console.log('--- Step 5: Seed LocalTextFeatureSnapshots for Core Mode ---')
  const now = new Date().toISOString()
  await upsertLocalTextFeatureSnapshot({
    userId: SMOKE_USER_ID,
    workspaceId: SMOKE_WORKSPACE_ID,
    targetType: TARGET_TYPE,
    targetId: sourceTargetId,
    contentHash: sourceContentHash,
    language: 'en',
    keywords: ['machine', 'learning', 'algorithms', 'predictive', 'modeling', 'pattern', 'recognition'],
    entities: ['machine learning'],
    compactText: SOURCE_TEXT.slice(0, 80),
    lengthMetrics: { chars: SOURCE_TEXT.length, words: SOURCE_TEXT.split(/\s+/).length },
    structureHints: [],
    source: 'smoke_similarity',
    reason: 'smoke_test',
    evidence: 'seeded',
    confidence: 1.0,
    safetyLevel: 'safe',
    stale: false,
    staleKey: 0,
    expiredAt: null,
    createdAt: now,
    updatedAt: now,
  }, SMOKE_WORKSPACE_ID)

  await upsertLocalTextFeatureSnapshot({
    userId: SMOKE_USER_ID,
    workspaceId: SMOKE_WORKSPACE_ID,
    targetType: TARGET_TYPE,
    targetId: relatedTargetId,
    contentHash: relatedContentHash,
    language: 'en',
    keywords: ['deep', 'neural', 'networks', 'training', 'data', 'patterns', 'predictions'],
    entities: ['neural networks'],
    compactText: RELATED_TEXT.slice(0, 80),
    lengthMetrics: { chars: RELATED_TEXT.length, words: RELATED_TEXT.split(/\s+/).length },
    structureHints: [],
    source: 'smoke_similarity',
    reason: 'smoke_test',
    evidence: 'seeded',
    confidence: 1.0,
    safetyLevel: 'safe',
    stale: false,
    staleKey: 0,
    expiredAt: null,
    createdAt: now,
    updatedAt: now,
  }, SMOKE_WORKSPACE_ID)

  await upsertLocalTextFeatureSnapshot({
    userId: SMOKE_USER_ID,
    workspaceId: SMOKE_WORKSPACE_ID,
    targetType: TARGET_TYPE,
    targetId: unrelatedTargetId,
    contentHash: unrelatedContentHash,
    language: 'en',
    keywords: ['recipe', 'sourdough', 'bread', 'flour', 'water', 'salt', 'starter'],
    entities: ['sourdough'],
    compactText: UNRELATED_TEXT.slice(0, 80),
    lengthMetrics: { chars: UNRELATED_TEXT.length, words: UNRELATED_TEXT.split(/\s+/).length },
    structureHints: [],
    source: 'smoke_similarity',
    reason: 'smoke_test',
    evidence: 'seeded',
    confidence: 1.0,
    safetyLevel: 'safe',
    stale: false,
    staleKey: 0,
    expiredAt: null,
    createdAt: now,
    updatedAt: now,
  }, SMOKE_WORKSPACE_ID)
  console.log('3 LocalTextFeatureSnapshots seeded')
  console.log()

  console.log('--- Step 6: Core vs Semantic Comparison ---')
  const comparison = await similarityComparison.runComparison({
    userId: SMOKE_USER_ID,
    workspaceId: SMOKE_WORKSPACE_ID,
    sourceTargetType: TARGET_TYPE,
    sourceTargetId: sourceTargetId,
    topK: 10,
    threshold: 0,
  })

  if (comparison.fallbackUsed) {
    console.log('FAIL: fallbackUsed=true — Semantic Core not available, cannot accept as pass')
    process.exit(1)
  }

  console.log('Core Mode results:')
  for (const r of comparison.coreModeResults) {
    console.log(`  targetId=${r.targetId}, score=${r.score.toFixed(6)}, generatedBy=${r.generatedBy}`)
  }
  console.log('Semantic Core results:')
  for (const r of comparison.semanticCoreResults) {
    console.log(`  targetId=${r.targetId}, score=${r.score.toFixed(6)}, generatedBy=${r.generatedBy}`)
  }
  console.log(`overlapRate=${comparison.overlapRate.toFixed(4)}, rankDifference=${comparison.rankDifference.toFixed(4)}, scoreDifference=${comparison.scoreDifference.toFixed(4)}`)
  console.log(`fallbackUsed=${comparison.fallbackUsed}`)
  console.log()

  console.log('=== Acceptance Gate Summary ===')
  console.log(`providerId: ${sourceEv.providerId}`)
  console.log(`modelId: ${sourceEv.modelId}`)
  console.log(`modelVersion: ${sourceEv.modelVersion}`)
  console.log(`dimension: ${sourceEv.dimension}`)
  console.log(`durationMs: ${sourceEmbDurationMs}`)
  console.log(`fallbackUsed: false`)
  console.log(`sourceTargetId: ${sourceTargetId}`)
  console.log(`semantic_core topK count: ${semanticResults.filter(r => r.generatedBy === 'semantic_core').length}`)
  for (const r of semanticResults.filter(r => r.generatedBy === 'semantic_core')) {
    console.log(`  -> targetId=${r.targetId}, score=${r.score.toFixed(6)}, providerId=${r.providerId}, modelId=${r.modelId}`)
  }
  console.log(`auditLogId: ${sourceEmbResult.auditLogId}`)
  console.log()

  const relatedScore = semanticResults.find(r => r.targetId === relatedTargetId)?.score ?? 0
  const unrelatedScore = semanticResults.find(r => r.targetId === unrelatedTargetId)?.score ?? 0
  if (relatedScore <= unrelatedScore) {
    console.log(`WARN: related score (${relatedScore.toFixed(6)}) <= unrelated score (${unrelatedScore.toFixed(6)}) — semantic ranking unexpected but not blocked`)
  } else {
    console.log(`Semantic ranking OK: related (${relatedScore.toFixed(6)}) > unrelated (${unrelatedScore.toFixed(6)})`)
  }

  console.log()
  console.log('Similarity smoke test PASSED!')
  process.exit(0)
}

main().catch((err) => {
  console.error('Similarity smoke test crashed:', err instanceof Error ? err.message : String(err))
  process.exit(2)
})
