import { invoke } from '@tauri-apps/api/core';

/** 触发器结果（对应 Rust TriggerResult） */
export interface TriggerResult {
  trigger_type: string;       // "semantic_repeat" | "new_topic" | "context_drift" | "review"
  theme: string | null;
  reason: string;
  repeat_count: number | null;
  last_seen: string | null;
  status: string;             // "suggestion" | "threshold_exceeded"
  threshold: number | null;
}

/** 触发器状态条目（对应 Rust TriggerStateEntry） */
export interface TriggerStateEntry {
  document_path: string;
  trigger_type: string;
  repeat_count: number;
  last_seen: string;
  last_content_hash: string | null;
  hash_change_count: number;
  last_word_count: number;
  dismissed: boolean;
}

export const mentorTriggersService = {
  /** 运行所有触发器检查 */
  async checkTriggers(
    vaultPath: string,
    documentPath: string,
    chunkId?: number,
  ): Promise<TriggerResult[]> {
    return invoke<TriggerResult[]>('check_triggers', {
      vaultPath,
      documentPath,
      chunkId: chunkId ?? null,
    });
  },

  /** 获取触发器状态 */
  async getTriggerState(vaultPath: string): Promise<TriggerStateEntry[]> {
    return invoke<TriggerStateEntry[]>('get_trigger_state', { vaultPath });
  },

  /** 更新触发器状态（如忽略触发器） */
  async updateTriggerState(
    vaultPath: string,
    documentPath: string,
    triggerType: string,
    dismissed?: boolean,
  ): Promise<void> {
    return invoke('update_trigger_state', {
      vaultPath,
      documentPath,
      triggerType,
      dismissed: dismissed ?? null,
    });
  },
};
