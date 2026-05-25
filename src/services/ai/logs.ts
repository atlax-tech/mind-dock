import { invoke } from '@tauri-apps/api/core';

export interface AIRuntimeLog {
  id: string;
  provider: string;
  model: string;
  latency_ms: number;
  prompt_type: string;
  request_type: string;
  fallback_status: string;
  success: boolean;
  error_message: string | null;
  timestamp: string;
}

export const aiLogsService = {
  async appendLog(
    vaultPath: string,
    provider: string,
    model: string,
    latencyMs: number,
    promptType: string,
    requestType: string,
    fallbackStatus: string,
    success: boolean,
    errorMessage: string | null
  ): Promise<void> {
    return invoke('append_ai_log', {
      vaultPath,
      provider,
      model,
      latencyMs,
      promptType,
      requestType,
      fallbackStatus,
      success,
      errorMessage,
    });
  },

  async readLogs(vaultPath: string, limit?: number): Promise<AIRuntimeLog[]> {
    return invoke<AIRuntimeLog[]>('read_ai_logs', { vaultPath, limit: limit ?? null });
  },
};
