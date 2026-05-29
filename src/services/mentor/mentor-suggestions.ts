import { invoke } from '@tauri-apps/api/core';

export type MentorSuggestionIntent =
  | 'clarify'
  | 'classify'
  | 'connect'
  | 'extract'
  | 'summarize'
  | 'review'
  | 'output'
  | 'archive'
  | 'resolve_conflict';

export type MentorSuggestionSurface = 'inline' | 'platter' | 'inbox' | 'silent';

export type MentorSuggestionStatus =
  | 'pending'
  | 'accepted'
  | 'dismissed'
  | 'snoozed'
  | 'expired'
  | 'executed';

export interface MentorAction {
  id: string;
  label: string;
  kind:
    | 'save_soft_type'
    | 'create_document'
    | 'append_to_document'
    | 'generate_context_pack'
    | 'open_platter_detail'
    | 'create_review_item'
    | 'start_background_job'
    | 'dismiss';
  payload: Record<string, unknown>;
  requiresUserConfirmation: boolean;
}

export interface MentorSuggestion {
  id: string;
  vault_id: string;
  source_event_id: string | null;
  source_signal_ids_json: string;
  source_job_id: string | null;
  target_id: string;
  target_type: string;
  intent: MentorSuggestionIntent;
  priority: 'low' | 'medium' | 'high';
  surface: MentorSuggestionSurface;
  message: string;
  short_message: string;
  evidence_ids_json: string;
  actions_json: string;
  status: MentorSuggestionStatus;
  confidence: number;
  model_trace_id: string | null;
  expires_at: string | null;
  last_shown_at: string | null;
  snoozed_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMentorSuggestionParams {
  vaultPath: string;
  vaultId: string;
  sourceEventId?: string | null;
  sourceSignalIds: string[];
  sourceJobId?: string | null;
  targetId: string;
  targetType: string;
  intent: MentorSuggestionIntent;
  priority: 'low' | 'medium' | 'high';
  surface: MentorSuggestionSurface;
  message: string;
  shortMessage: string;
  evidenceIds: string[];
  actions: MentorAction[];
  status: MentorSuggestionStatus;
  confidence: number;
  modelTraceId?: string | null;
  expiresAt?: string | null;
}

export const mentorSuggestionsService = {
  async createSuggestion(
    params: CreateMentorSuggestionParams
  ): Promise<MentorSuggestion> {
    return invoke<MentorSuggestion>('create_mentor_suggestion', {
      vaultPath: params.vaultPath,
      vaultId: params.vaultId,
      sourceEventId: params.sourceEventId ?? null,
      sourceSignalIdsJson: JSON.stringify(params.sourceSignalIds),
      sourceJobId: params.sourceJobId ?? null,
      targetId: params.targetId,
      targetType: params.targetType,
      intent: params.intent,
      priority: params.priority,
      surface: params.surface,
      message: params.message,
      shortMessage: params.shortMessage,
      evidenceIdsJson: JSON.stringify(params.evidenceIds),
      actionsJson: JSON.stringify(params.actions),
      status: params.status,
      confidence: params.confidence,
      modelTraceId: params.modelTraceId ?? null,
      expiresAt: params.expiresAt ?? null,
    });
  },

  async listSuggestions(
    vaultPath: string,
    vaultId: string,
    status?: MentorSuggestionStatus,
    surface?: MentorSuggestionSurface,
    targetId?: string,
    intent?: MentorSuggestionIntent,
    limit?: number
  ): Promise<MentorSuggestion[]> {
    return invoke<MentorSuggestion[]>('list_mentor_suggestions', {
      vaultPath,
      vaultId,
      status: status ?? null,
      surface: surface ?? null,
      targetId: targetId ?? null,
      intent: intent ?? null,
      limit: limit ?? null,
    });
  },

  async getSuggestion(
    vaultPath: string,
    suggestionId: string
  ): Promise<MentorSuggestion | null> {
    return invoke<MentorSuggestion | null>('get_mentor_suggestion', {
      vaultPath,
      suggestionId,
    });
  },

  async updateSuggestionStatus(
    vaultPath: string,
    suggestionId: string,
    status: MentorSuggestionStatus
  ): Promise<void> {
    return invoke('update_mentor_suggestion_status', {
      vaultPath,
      suggestionId,
      status,
    });
  },

  async updateSuggestionLastShown(
    vaultPath: string,
    suggestionId: string
  ): Promise<void> {
    return invoke('update_mentor_suggestion_last_shown', {
      vaultPath,
      suggestionId,
    });
  },

  async snoozeSuggestion(
    vaultPath: string,
    suggestionId: string,
    snoozedUntil: string
  ): Promise<void> {
    return invoke('snooze_mentor_suggestion', {
      vaultPath,
      suggestionId,
      snoozedUntil,
    });
  },

  async deleteSuggestion(
    vaultPath: string,
    suggestionId: string
  ): Promise<void> {
    return invoke('delete_mentor_suggestion', {
      vaultPath,
      suggestionId,
    });
  },

  async cleanupSuggestions(
    vaultPath: string,
    vaultId: string,
    olderThanDays?: number,
    statuses?: MentorSuggestionStatus[]
  ): Promise<number> {
    return invoke<number>('cleanup_mentor_suggestions', {
      vaultPath,
      vaultId,
      olderThanDays: olderThanDays ?? null,
      statusesJson: statuses ? JSON.stringify(statuses) : null,
    });
  },

  async importLegacySuggestions(
    vaultPath: string,
    vaultId: string
  ): Promise<number> {
    return invoke<number>('import_legacy_ai_suggestions', {
      vaultPath,
      vaultId,
    });
  },
};
