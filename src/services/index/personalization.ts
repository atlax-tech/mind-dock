import { invoke } from '@tauri-apps/api/core';

/** 个性化信号类型 */
export type SignalActionType =
  | 'search_query'
  | 'opened_result'
  | 'context_pack_item_accepted'
  | 'context_pack_item_rejected'
  | 'prompt_copied'
  | 'summary_tag_accepted'
  | 'summary_tag_rejected';

/** 个性化信号（对应 Rust PersonalizationSignal） */
export interface PersonalizationSignal {
  action_type: SignalActionType;
  document_path: string | null;
  chunk_id: number | null;
  search_query: string | null;
  timestamp: string;
}

export const personalizationService = {
  /** 记录个性化信号 */
  async recordSignal(vaultPath: string, signal: Omit<PersonalizationSignal, 'timestamp'>): Promise<void> {
    return invoke('record_signal', {
      vaultPath,
      signal: {
        ...signal,
        timestamp: new Date().toISOString(),
      },
    });
  },

  /** 读取个性化信号 */
  async readSignals(
    vaultPath: string,
    limit?: number,
    offset?: number,
  ): Promise<PersonalizationSignal[]> {
    return invoke<PersonalizationSignal[]>('read_signals', {
      vaultPath,
      limit: limit ?? null,
      offset: offset ?? null,
    });
  },

  /** 统计个性化信号数量 */
  async countSignals(vaultPath: string): Promise<number> {
    return invoke<number>('count_signals', { vaultPath });
  },
};
