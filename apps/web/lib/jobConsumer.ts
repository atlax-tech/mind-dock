import { processBatch, reactivatePendingModelJobs } from './backgroundJobQueue'
import { getModelRuntimeStatus } from './intelligenceRepository'

const DEFAULT_POLL_INTERVAL_MS = 5000
const DEFAULT_BATCH_LIMIT = 5
const PROVIDER_ID = 'ollama-openai-compatible'

export class JobConsumer {
  private timerId: ReturnType<typeof setInterval> | null = null
  private running = false
  private readonly userId: string
  private readonly workspaceId: string
  private readonly pollIntervalMs: number
  private readonly batchLimit: number

  constructor(options: {
    userId: string
    workspaceId?: string
    pollIntervalMs?: number
    batchLimit?: number
  }) {
    this.userId = options.userId
    this.workspaceId = options.workspaceId ?? 'default'
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
    this.batchLimit = options.batchLimit ?? DEFAULT_BATCH_LIMIT
  }

  start(): void {
    if (this.timerId !== null) return
    this.running = true
    this.timerId = setInterval(() => {
      this.tick().catch(() => {})
    }, this.pollIntervalMs)
    this.tick().catch(() => {})
  }

  stop(): void {
    this.running = false
    if (this.timerId !== null) {
      clearInterval(this.timerId)
      this.timerId = null
    }
  }

  isRunning(): boolean {
    return this.running
  }

  private async tick(): Promise<void> {
    if (!this.running) return

    try {
      const runtimeStatus = await getModelRuntimeStatus(
        this.userId,
        PROVIDER_ID,
        this.workspaceId,
      )

      if (runtimeStatus && runtimeStatus.mode === 'model_available') {
        await reactivatePendingModelJobs(this.userId, { workspaceId: this.workspaceId })
      }

      await processBatch(this.userId, {
        workspaceId: this.workspaceId,
        limit: this.batchLimit,
      })
    } catch (err) {
      console.error('[JobConsumer] tick error:', err instanceof Error ? err.message : String(err))
    }
  }
}

let activeConsumer: JobConsumer | null = null

export function startJobConsumer(
  userId: string,
  options?: { workspaceId?: string; pollIntervalMs?: number },
): JobConsumer {
  if (activeConsumer) {
    activeConsumer.stop()
  }
  activeConsumer = new JobConsumer({
    userId,
    workspaceId: options?.workspaceId,
    pollIntervalMs: options?.pollIntervalMs,
  })
  activeConsumer.start()
  return activeConsumer
}

export function stopJobConsumer(): void {
  if (activeConsumer) {
    activeConsumer.stop()
    activeConsumer = null
  }
}

export function getActiveJobConsumer(): JobConsumer | null {
  return activeConsumer
}
