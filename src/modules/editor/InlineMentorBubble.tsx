import { useState, useCallback, useEffect } from 'react';
import { X, Clock, ChevronRight } from 'lucide-react';
import type { MentorSuggestion, MentorAction } from '@/services/mentor/mentor-suggestions';
import { handleSuggestionAction, executeConfirmedAction, parseActions, type SuggestionActionContext } from '@/services/mentor/suggestion-actions';

interface InlineMentorBubbleProps {
  suggestion: MentorSuggestion;
  actionContext: SuggestionActionContext;
  onDismissed: () => void;
  onSnoozed: () => void;
  onAccepted: (actionId: string) => void;
  onOpenDetail: () => void;
}

export function InlineMentorBubble({
  suggestion,
  actionContext,
  onDismissed,
  onSnoozed,
  onAccepted,
  onOpenDetail,
}: InlineMentorBubbleProps) {
  const [isHandling, setIsHandling] = useState(false);
  const [confirmAction, setConfirmAction] = useState<MentorAction | null>(null);

  const actions = parseActions(suggestion).slice(0, 2);

  const handleAction = useCallback(async (kind: string) => {
    if (isHandling) return;
    setIsHandling(true);
    try {
      const result = await handleSuggestionAction(suggestion, kind, actionContext);
      switch (result.type) {
        case 'dismissed':
          onDismissed();
          break;
        case 'snoozed':
          onSnoozed();
          break;
        case 'accepted':
          onAccepted(result.actionId);
          break;
        case 'open_detail':
          onOpenDetail();
          break;
        case 'action_needed':
          setConfirmAction(result.action);
          break;
      }
    } catch (err) {
      console.error('[InlineMentorBubble] action 失败:', err);
    } finally {
      setIsHandling(false);
    }
  }, [suggestion, actionContext, isHandling, onDismissed, onSnoozed, onAccepted, onOpenDetail]);

  const handleConfirmAction = useCallback(async () => {
    if (!confirmAction || isHandling) return;
    setIsHandling(true);
    try {
      await executeConfirmedAction(suggestion, confirmAction, actionContext);
      onAccepted(confirmAction.id);
      setConfirmAction(null);
    } catch (err) {
      console.error('[InlineMentorBubble] confirm action 失败:', err);
    } finally {
      setIsHandling(false);
    }
  }, [confirmAction, suggestion, actionContext, isHandling, onAccepted]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmAction) {
          setConfirmAction(null);
        } else {
          handleAction('dismiss');
        }
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [handleAction, confirmAction]);

  if (confirmAction) {
    return (
      <div className="mentor-inline-bubble">
        <div className="mentor-bubble-confirm">
          <span className="mentor-bubble-confirm-text">
            确认{confirmAction.label}？
          </span>
          <div className="mentor-bubble-confirm-actions">
            <button
              className="mentor-bubble-btn mentor-bubble-btn-primary"
              onClick={handleConfirmAction}
              disabled={isHandling}
            >
              确认
            </button>
            <button
              className="mentor-bubble-btn"
              onClick={() => setConfirmAction(null)}
              disabled={isHandling}
            >
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mentor-inline-bubble">
      <div className="mentor-bubble-content">
        <span className="mentor-bubble-message">
          {suggestion.short_message}
        </span>
        <button
          className="mentor-bubble-close"
          onClick={() => handleAction('dismiss')}
          disabled={isHandling}
          title="忽略"
        >
          <X size={12} />
        </button>
      </div>
      <div className="mentor-bubble-actions">
        {actions.map(action => (
          <button
            key={action.id}
            className="mentor-bubble-btn mentor-bubble-btn-action"
            onClick={() => handleAction(action.kind)}
            disabled={isHandling}
          >
            {action.label}
          </button>
        ))}
        <button
          className="mentor-bubble-btn mentor-bubble-btn-snooze"
          onClick={() => handleAction('snooze')}
          disabled={isHandling}
          title="稍后提醒"
        >
          <Clock size={11} />
        </button>
        <button
          className="mentor-bubble-btn mentor-bubble-btn-detail"
          onClick={() => handleAction('open_detail')}
          disabled={isHandling}
          title="查看详情"
        >
          <ChevronRight size={11} />
        </button>
      </div>
    </div>
  );
}
