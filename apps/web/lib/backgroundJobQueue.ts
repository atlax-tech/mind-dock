import { DEFAULT_WORKSPACE_ID, makeBackgroundJobId } from '@atlax/domain'
import type { JobType, JobStatus } from '@atlax/domain'
import { backgroundJobsTable } from '@/lib/db'
import type { BackgroundJobRecord } from '@/lib/db'
import { processJob } from './jobProcessor'

function nowISO(): string {
  return new Date().toISOString()
}

export async function enqueue(
  userId: string,
  jobType: JobType,
  targetType: string,
  targetId: string,
  contentHash: string,
  options?: { workspaceId?: string; priority?: number; maxAttempts?: number },
): Promise<BackgroundJobRecord> {
  const workspaceId = options?.workspaceId ?? DEFAULT_WORKSPACE_ID
  const id = makeBackgroundJobId(userId, workspaceId, jobType, targetType, targetId, contentHash)
  const now = nowISO()
  const record: BackgroundJobRecord = {
    id,
    userId,
    workspaceId,
    jobType,
    targetType,
    targetId,
    status: 'pending',
    contentHash,
    priority: options?.priority ?? 10,
    attempts: 0,
    maxAttempts: options?.maxAttempts ?? 3,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    nextRunAt: null,
    completedAt: null,
  }
  await backgroundJobsTable.put(record)
  return record
}

export async function dequeue(
  userId: string,
  options?: { workspaceId?: string },
): Promise<BackgroundJobRecord | null> {
  const workspaceId = options?.workspaceId ?? DEFAULT_WORKSPACE_ID
  const now = nowISO()

  const allPending = await backgroundJobsTable
    .where('[userId+workspaceId+status]')
    .equals([userId, workspaceId, 'pending'])
    .toArray()

  const eligible = allPending
    .filter((job) => job.nextRunAt === null || job.nextRunAt <= now)
    .sort((a, b) => a.priority - b.priority)

  const job = eligible[0]
  if (!job || !job.id) return null

  await backgroundJobsTable.update(job.id, {
    status: 'running',
    attempts: job.attempts + 1,
    updatedAt: nowISO(),
  })

  const updated = await backgroundJobsTable.get(job.id)
  return updated ?? null
}

export async function retry(jobId: string): Promise<BackgroundJobRecord | null> {
  const job = await backgroundJobsTable.get(jobId)
  if (!job) return null
  if (job.attempts >= job.maxAttempts) return null

  const delay = Math.pow(2, job.attempts) * 1000
  const nextRunAt = new Date(Date.now() + delay).toISOString()
  await backgroundJobsTable.update(jobId, {
    status: 'pending',
    nextRunAt,
    updatedAt: nowISO(),
  })

  return await backgroundJobsTable.get(jobId) ?? null
}

export async function fail(jobId: string, error: string): Promise<BackgroundJobRecord | null> {
  const job = await backgroundJobsTable.get(jobId)
  if (!job) return null

  await backgroundJobsTable.update(jobId, {
    status: 'failed',
    lastError: error,
    updatedAt: nowISO(),
  })

  return await backgroundJobsTable.get(jobId) ?? null
}

export async function complete(jobId: string): Promise<BackgroundJobRecord | null> {
  const job = await backgroundJobsTable.get(jobId)
  if (!job) return null

  await backgroundJobsTable.update(jobId, {
    status: 'complete',
    completedAt: nowISO(),
    updatedAt: nowISO(),
  })

  return await backgroundJobsTable.get(jobId) ?? null
}

export async function getJobStatus(jobId: string): Promise<BackgroundJobRecord | null> {
  const job = await backgroundJobsTable.get(jobId)
  return job ?? null
}

export async function listOpenJobs(
  userId: string,
  options?: { workspaceId?: string },
): Promise<BackgroundJobRecord[]> {
  const workspaceId = options?.workspaceId ?? DEFAULT_WORKSPACE_ID
  const all = await backgroundJobsTable
    .where('[userId+workspaceId+status]')
    .equals([userId, workspaceId, 'pending'])
    .toArray()

  const pendingModel = await backgroundJobsTable
    .where('[userId+workspaceId+status]')
    .equals([userId, workspaceId, 'pending_model'])
    .toArray()

  return [...all, ...pendingModel].sort((a, b) => a.priority - b.priority)
}

export async function listPendingModelJobs(
  userId: string,
  options?: { workspaceId?: string },
): Promise<BackgroundJobRecord[]> {
  const workspaceId = options?.workspaceId ?? DEFAULT_WORKSPACE_ID
  const jobs = await backgroundJobsTable
    .where('[userId+workspaceId+status]')
    .equals([userId, workspaceId, 'pending_model'])
    .toArray()

  return jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function reactivatePendingModelJobs(
  userId: string,
  options?: { workspaceId?: string; limit?: number },
): Promise<BackgroundJobRecord[]> {
  const workspaceId = options?.workspaceId ?? DEFAULT_WORKSPACE_ID
  const limit = options?.limit ?? 10

  const { getCapabilityStatus } = await import('@/lib/modelProvider')
  const capability = getCapabilityStatus()
  if (capability.mode !== 'model_available') return []

  const jobs = await backgroundJobsTable
    .where('[userId+workspaceId+status]')
    .equals([userId, workspaceId, 'pending_model'])
    .limit(limit)
    .toArray()

  const now = nowISO()
  for (const job of jobs) {
    if (job.id) {
      await backgroundJobsTable.update(job.id, {
        status: 'pending',
        updatedAt: now,
        nextRunAt: null,
      })
    }
  }

  const reactivated: BackgroundJobRecord[] = []
  for (const job of jobs) {
    if (job.id) {
      const updated = await backgroundJobsTable.get(job.id)
      if (updated) reactivated.push(updated)
    }
  }

  return reactivated
}

export async function processNext(
  userId: string,
  options?: { workspaceId?: string },
): Promise<{ job: BackgroundJobRecord; result: { status: JobStatus } } | null> {
  const workspaceId = options?.workspaceId ?? DEFAULT_WORKSPACE_ID
  const now = nowISO()

  const allPending = await backgroundJobsTable
    .where('[userId+workspaceId+status]')
    .equals([userId, workspaceId, 'pending'])
    .toArray()

  const eligible = allPending
    .filter((j) => j.nextRunAt === null || j.nextRunAt <= now)
    .sort((a, b) => a.priority - b.priority)

  const rawJob = eligible[0]
  if (!rawJob || !rawJob.id) return null

  const originalAttempts = rawJob.attempts

  await backgroundJobsTable.update(rawJob.id, {
    status: 'running',
    attempts: rawJob.attempts + 1,
    updatedAt: nowISO(),
  })

  const job = await backgroundJobsTable.get(rawJob.id)
  if (!job || !job.id) return null

  const result = await processJob(job)

  switch (result.status) {
    case 'complete':
      await complete(job.id)
      break
    case 'pending_model':
      await backgroundJobsTable.update(job.id, {
        status: 'pending_model',
        attempts: originalAttempts,
        updatedAt: nowISO(),
      })
      break
    case 'degraded':
      await backgroundJobsTable.update(job.id, {
        status: 'degraded',
        updatedAt: nowISO(),
      })
      break
    case 'skipped':
      await backgroundJobsTable.update(job.id, {
        status: 'skipped',
        updatedAt: nowISO(),
        completedAt: nowISO(),
      })
      break
    case 'failed': {
      const current = await backgroundJobsTable.get(job.id)
      if (current && current.attempts < current.maxAttempts) {
        await retry(job.id)
      } else {
        await fail(job.id, 'Max attempts exceeded')
      }
      break
    }
  }

  const finalJob = await backgroundJobsTable.get(job.id)
  if (!finalJob) return null
  return { job: finalJob, result }
}

export async function processBatch(
  userId: string,
  options?: { workspaceId?: string; limit?: number },
): Promise<Array<{ job: BackgroundJobRecord; result: { status: JobStatus } }>> {
  const limit = options?.limit ?? 5
  const results: Array<{ job: BackgroundJobRecord; result: { status: JobStatus } }> = []

  for (let i = 0; i < limit; i++) {
    const result = await processNext(userId, options)
    if (result) {
      results.push(result)
    } else {
      break
    }
  }

  return results
}
