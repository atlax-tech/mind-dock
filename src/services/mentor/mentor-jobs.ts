import { invoke } from '@tauri-apps/api/core';

export type MentorJobType =
  | 'deep_document_review'
  | 'capture_cluster'
  | 'context_pack_refine'
  | 'knowledge_health_light'
  | 'output_plan'
  | 'conflict_check'
  | 'soft_type_conflict_check';

export type MentorJobStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled'
  | 'timeout';

export interface MentorJob {
  id: string;
  vault_id: string;
  job_type: MentorJobType;
  target_ids_json: string;
  priority: 'low' | 'medium' | 'high';
  status: MentorJobStatus;
  input_hash: string;
  provider: string | null;
  model: string | null;
  prompt_type: string | null;
  latency_ms: number | null;
  fallback_status: string | null;
  result_suggestion_ids_json: string;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  cancelled_at: string | null;
}

export interface CreateMentorJobParams {
  vaultPath: string;
  vaultId: string;
  jobType: MentorJobType;
  targetIds: string[];
  priority: 'low' | 'medium' | 'high';
  inputHash: string;
  provider?: string | null;
  model?: string | null;
  promptType?: string | null;
}

export const mentorJobsService = {
  async createJob(params: CreateMentorJobParams): Promise<MentorJob> {
    return invoke<MentorJob>('create_mentor_job', {
      vaultPath: params.vaultPath,
      vaultId: params.vaultId,
      jobType: params.jobType,
      targetIdsJson: JSON.stringify(params.targetIds),
      priority: params.priority,
      inputHash: params.inputHash,
      provider: params.provider ?? null,
      model: params.model ?? null,
      promptType: params.promptType ?? null,
    });
  },

  async listJobs(
    vaultPath: string,
    vaultId: string,
    status?: MentorJobStatus,
    jobType?: MentorJobType,
    limit?: number
  ): Promise<MentorJob[]> {
    return invoke<MentorJob[]>('list_mentor_jobs', {
      vaultPath,
      vaultId,
      status: status ?? null,
      jobType: jobType ?? null,
      limit: limit ?? null,
    });
  },

  async updateJobStatus(
    vaultPath: string,
    jobId: string,
    status: MentorJobStatus,
    resultSuggestionIds?: string[],
    errorMessage?: string,
    latencyMs?: number,
    fallbackStatus?: string
  ): Promise<void> {
    return invoke('update_mentor_job_status', {
      vaultPath,
      jobId,
      status,
      resultSuggestionIdsJson: resultSuggestionIds
        ? JSON.stringify(resultSuggestionIds)
        : null,
      errorMessage: errorMessage ?? null,
      latencyMs: latencyMs ?? null,
      fallbackStatus: fallbackStatus ?? null,
    });
  },
};
