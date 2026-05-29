export type MentorEventType =
  // P4.5 新增事件类型
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
  | 'mentor_suggestion_actioned'
  // 保留旧事件类型（兼容）
  | 'first_open'
  | 'new_document_intent'
  | 'guided_capture_requested'
  | 'ai_suggestion_created'
  | 'ai_runtime_status_changed'
  | 'onboarding_completed'
  | 'onboarding_skipped';

export interface MentorEvent {
  type: MentorEventType;
  payload?: Record<string, unknown>;
  timestamp: string;
}

type EventListener = (event: MentorEvent) => void;
type PersistHandler = (event: MentorEvent, vaultPath: string, vaultId: string) => void;

class MentorEventBusImpl {
  private listeners: Map<MentorEventType, Set<EventListener>> = new Map();
  private persistHandler: PersistHandler | null = null;

  /** 注册持久化处理器（fire-and-forget，不阻塞 emit） */
  setPersistHandler(handler: PersistHandler | null): void {
    this.persistHandler = handler;
  }

  emit(
    type: MentorEventType,
    payload?: Record<string, unknown>,
    persist?: { vaultPath: string; vaultId: string },
  ): void {
    const event: MentorEvent = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    // 内存广播（同步，轻量）
    const typeListeners = this.listeners.get(type);
    if (typeListeners) {
      typeListeners.forEach(listener => {
        try {
          listener(event);
        } catch (err) {
          console.error(`MentorEvent listener error for ${type}:`, err);
        }
      });
    }

    // SQLite 持久化（fire-and-forget，不阻塞 emit）
    if (persist && this.persistHandler) {
      try {
        this.persistHandler(event, persist.vaultPath, persist.vaultId);
      } catch (err) {
        console.error(`MentorEvent persist error for ${type}:`, err);
      }
    }
  }

  on(type: MentorEventType, listener: EventListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
    return () => {
      this.listeners.get(type)?.delete(listener);
    };
  }

  off(type: MentorEventType, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }
}

export const mentorEventBus = new MentorEventBusImpl();
