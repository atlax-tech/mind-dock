import 'fake-indexeddb/auto'
import { initOllamaProviders, resetProviders } from '../lib/modelProvider'
import { runSmokeTest } from '../lib/modelSmokeService'

const SMOKE_USER_ID = 'smoke-user'
const SMOKE_WORKSPACE_ID = 'smoke-workspace'
const DEFAULT_LOCAL_MODEL_BASE_URL = 'http://localhost:11434/v1'
const DEFAULT_EMBEDDING_MODEL_ID = 'qwen3-embedding:0.6b'
const DEFAULT_REASONING_MODEL_ID = 'qwen3:1.7b'

async function main(): Promise<void> {
  console.log('=== Atlax MindDock Model Smoke Test ===')
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

  const result = await runSmokeTest(SMOKE_USER_ID, SMOKE_WORKSPACE_ID)

  console.log('--- Probe ---')
  console.log(`Available: ${result.probeAvailable}`)
  console.log()

  console.log('--- Embedding ---')
  console.log(`Available: ${result.embeddingAvailable}`)
  if (result.embeddingAvailable) {
    console.log(`Dimension: ${result.embeddingDimension}`)
    console.log(`VectorHash: ${result.embeddingVectorHash}`)
  }
  console.log()

  console.log('--- Reasoning ---')
  console.log(`Available: ${result.reasoningAvailable}`)
  if (result.reasoningAvailable) {
    console.log(`OutputHash: ${result.reasoningOutputHash}`)
  }
  console.log()

  console.log('--- Result ---')
  console.log(`Status: ${result.status}`)
  if (result.errorMessage) {
    console.log(`Error: ${result.errorMessage}`)
  }
  console.log(`AuditLogIds: ${result.auditLogIds.length} entries`)

  if (result.status === 'blocked') {
    console.log()
    console.log('Blocked: Ollama endpoint unavailable')
    process.exit(1)
  }

  if (result.status === 'fail') {
    console.log()
    console.log('Smoke test partially failed')
    process.exit(1)
  }

  console.log()
  console.log('Smoke test passed!')
  process.exit(0)
}

main().catch((err) => {
  console.error('Smoke test crashed:', err instanceof Error ? err.message : String(err))
  process.exit(2)
})
