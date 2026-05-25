export type MentorEventType =
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

class MentorEventBusImpl {
  private listeners: Map<MentorEventType, Set<EventListener>> = new Map();

  emit(type: MentorEventType, payload?: Record<string, unknown>): void {
    const event: MentorEvent = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
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
  }

  on(type: MentorEventType, listener: EventListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
    // 返回取消订阅函数
    return () => {
      this.listeners.get(type)?.delete(listener);
    };
  }

  off(type: MentorEventType, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }
}

// 单例
export const mentorEventBus = new MentorEventBusImpl();
