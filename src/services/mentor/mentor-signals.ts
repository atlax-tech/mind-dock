import { invoke } from '@tauri-apps/api/core';

export interface MentorSignal {
  id: string;
  event_id: string;
  vault_id: string;
  signal_type: string;
  target_id: string;
  target_type: string;
  confidence: number;
  evidence_ids_json: string;
  detector: 'rule' | 'embedding' | 'fts' | 'editor_state' | 'soft_type';
  created_at: string;
}

export type MentorSignalType =
  | 'paragraph_idle'
  | 'question_detected'
  | 'decision_like_text'
  | 'principle_like_text'
  | 'missing_conclusion'
  | 'similar_captures_found'
  | 'context_pack_mismatch'
  | 'repeated_search_intent'
  | 'possible_duplicate'
  | 'orphan_document';

export const mentorSignalsService = {
  async createSignal(
    vaultPath: string,
    eventId: string,
    vaultId: string,
    signalType: MentorSignalType,
    targetId: string,
    targetType: string,
    confidence: number,
    evidenceIds: string[],
    detector: MentorSignal['detector']
  ): Promise<MentorSignal> {
    return invoke<MentorSignal>('create_mentor_signal', {
      vaultPath,
      eventId,
      vaultId,
      signalType,
      targetId,
      targetType,
      confidence,
      evidenceIdsJson: JSON.stringify(evidenceIds),
      detector,
    });
  },

  async listSignals(
    vaultPath: string,
    vaultId: string,
    signalType?: string,
    targetId?: string,
    limit?: number
  ): Promise<MentorSignal[]> {
    return invoke<MentorSignal[]>('list_mentor_signals', {
      vaultPath,
      vaultId,
      signalType: signalType ?? null,
      targetId: targetId ?? null,
      limit: limit ?? null,
    });
  },
};
