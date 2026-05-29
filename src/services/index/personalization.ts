import { invoke } from '@tauri-apps/api/core';

/** 个性化信号类型 */
export type SignalActionType =
  | 'search_query'
  | 'opened_result'
  | 'document_opened'
  | 'document_edited'
  | 'context_pack_item_accepted'
  | 'context_pack_item_rejected'
  | 'prompt_copied'
  | 'output_type_used'
  | 'knowledge_type_accepted'
  | 'knowledge_type_rejected'
  | 'summary_tag_accepted'
  | 'summary_tag_rejected';

/** 个性化信号（对应 Rust PersonalizationSignal） */
export interface PersonalizationSignal {
  action_type: SignalActionType;
  document_path: string | null;
  chunk_id: number | null;
  search_query: string | null;
  output_type?: string | null;
  knowledge_type?: string | null;
  timestamp: string;
}

export interface PersonalizationWeights {
  acceptedByDocument: Record<string, number>;
  rejectedByDocument: Record<string, number>;
  recentDocumentBoost: Record<string, number>;
  outputTypeCounts: Record<string, number>;
  knowledgeTypeAccepted: Record<string, number>;
  knowledgeTypeRejected: Record<string, number>;
}

function buildWeights(signals: PersonalizationSignal[]): PersonalizationWeights {
  const weights: PersonalizationWeights = {
    acceptedByDocument: {},
    rejectedByDocument: {},
    recentDocumentBoost: {},
    outputTypeCounts: {},
    knowledgeTypeAccepted: {},
    knowledgeTypeRejected: {},
  };

  for (const signal of signals) {
    const doc = signal.document_path;
    if (doc && signal.action_type === 'context_pack_item_accepted') {
      weights.acceptedByDocument[doc] = (weights.acceptedByDocument[doc] ?? 0) + 1;
    }
    if (doc && signal.action_type === 'context_pack_item_rejected') {
      weights.rejectedByDocument[doc] = (weights.rejectedByDocument[doc] ?? 0) + 1;
    }
    if (doc && (signal.action_type === 'opened_result' || signal.action_type === 'document_opened' || signal.action_type === 'document_edited')) {
      weights.recentDocumentBoost[doc] = (weights.recentDocumentBoost[doc] ?? 0) + (signal.action_type === 'document_edited' ? 1.2 : 0.6);
    }
    if (signal.action_type === 'output_type_used' && signal.output_type) {
      weights.outputTypeCounts[signal.output_type] = (weights.outputTypeCounts[signal.output_type] ?? 0) + 1;
    }
    if ((signal.action_type === 'knowledge_type_accepted' || signal.action_type === 'context_pack_item_accepted') && signal.knowledge_type) {
      weights.knowledgeTypeAccepted[signal.knowledge_type] = (weights.knowledgeTypeAccepted[signal.knowledge_type] ?? 0) + 1;
    }
    if ((signal.action_type === 'knowledge_type_rejected' || signal.action_type === 'context_pack_item_rejected') && signal.knowledge_type) {
      weights.knowledgeTypeRejected[signal.knowledge_type] = (weights.knowledgeTypeRejected[signal.knowledge_type] ?? 0) + 1;
    }
  }

  return weights;
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

  async getWeights(vaultPath: string): Promise<PersonalizationWeights> {
    const signals = await personalizationService.readSignals(vaultPath, 500, 0);
    return buildWeights(signals);
  },

  async getPreferredOutputType(vaultPath: string): Promise<string | null> {
    const weights = await personalizationService.getWeights(vaultPath);
    const sorted = Object.entries(weights.outputTypeCounts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] ?? null;
  },

  async resetSignals(vaultPath: string): Promise<void> {
    return invoke('reset_personalization_signals', { vaultPath });
  },
};
