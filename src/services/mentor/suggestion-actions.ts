import type { MentorAction, MentorSuggestion } from './mentor-suggestions';
import { mentorSuggestionsService } from './mentor-suggestions';
import { notifySuggestionDismissed } from './detector-runner';

export interface SuggestionActionContext {
  vaultPath: string;
  documentPath: string;
  onPlatterOpen?: () => void;
}

export type SuggestionActionResult =
  | { type: 'dismissed' }
  | { type: 'snoozed'; until: string }
  | { type: 'accepted'; actionId: string }
  | { type: 'open_detail' }
  | { type: 'action_needed'; action: MentorAction };

export async function handleSuggestionAction(
  suggestion: MentorSuggestion,
  actionKind: string,
  ctx: SuggestionActionContext,
): Promise<SuggestionActionResult> {
  switch (actionKind) {
    case 'dismiss': {
      await mentorSuggestionsService.updateSuggestionStatus(
        ctx.vaultPath, suggestion.id, 'dismissed',
      );
      const signalType = parseSignalType(suggestion);
      notifySuggestionDismissed(ctx.documentPath, signalType);
      return { type: 'dismissed' };
    }

    case 'snooze': {
      const until = new Date(Date.now() + 30 * 60_000).toISOString();
      await mentorSuggestionsService.snoozeSuggestion(
        ctx.vaultPath, suggestion.id, until,
      );
      return { type: 'snoozed', until };
    }

    case 'open_detail': {
      ctx.onPlatterOpen?.();
      return { type: 'open_detail' };
    }

    default: {
      const actions = parseActions(suggestion);
      const action = actions.find(a => a.kind === actionKind);
      if (!action) {
        return { type: 'dismissed' };
      }

      if (action.requiresUserConfirmation) {
        return { type: 'action_needed', action };
      }

      await mentorSuggestionsService.updateSuggestionStatus(
        ctx.vaultPath, suggestion.id, 'accepted',
      );
      return { type: 'accepted', actionId: action.id };
    }
  }
}

export function parseActions(suggestion: MentorSuggestion): MentorAction[] {
  try {
    return JSON.parse(suggestion.actions_json) as MentorAction[];
  } catch {
    return [];
  }
}

export function parseSignalType(suggestion: MentorSuggestion): string {
  try {
    const ids = JSON.parse(suggestion.source_signal_ids_json) as string[];
    return ids[0] ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function executeConfirmedAction(
  suggestion: MentorSuggestion,
  _action: MentorAction,
  ctx: SuggestionActionContext,
): Promise<void> {
  return mentorSuggestionsService.updateSuggestionStatus(
    ctx.vaultPath, suggestion.id, 'accepted',
  );
}
