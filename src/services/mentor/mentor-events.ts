import { invoke } from '@tauri-apps/api/core';

export interface MentorEvent {
  id: string;
  vault_id: string;
  event_type: string;
  target_id: string | null;
  target_type: string | null;
  payload_json: string;
  created_at: string;
}

export type MentorEventType =
  | 'app_started'
  | 'document_opened'
  | 'document_saved'
  | 'document_idle'
  | 'selection_created'
  | 'capture_created'
  | 'capture_converted'
  | 'search_repeated'
  | 'context_pack_generated'
  | 'context_pack_exported'
  | 'mentor_suggestion_created'
  | 'mentor_suggestion_actioned';

export const mentorEventsService = {
  async createEvent(
    vaultPath: string,
    vaultId: string,
    eventType: string, // 接受任意 string，Rust 端存为 TEXT，支持 MentorEventBus 扩展
    targetId?: string | null,
    targetType?: string | null,
    payload?: Record<string, unknown>
  ): Promise<MentorEvent> {
    return invoke<MentorEvent>('create_mentor_event', {
      vaultPath,
      vaultId,
      eventType,
      targetId: targetId ?? null,
      targetType: targetType ?? null,
      payloadJson: JSON.stringify(payload ?? {}),
    });
  },

  async listEvents(
    vaultPath: string,
    vaultId: string,
    eventType?: string,
    targetId?: string,
    limit?: number
  ): Promise<MentorEvent[]> {
    return invoke<MentorEvent[]>('list_mentor_events', {
      vaultPath,
      vaultId,
      eventType: eventType ?? null,
      targetId: targetId ?? null,
      limit: limit ?? null,
    });
  },
};
