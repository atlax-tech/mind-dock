import { StateField, StateEffect } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet, WidgetType, keymap } from '@codemirror/view';
import type { MentorSuggestion } from '@/services/mentor/mentor-suggestions';
import { createRoot, type Root } from 'react-dom/client';
import { InlineMentorBubble } from './InlineMentorBubble';
import type { SuggestionActionContext } from '@/services/mentor/suggestion-actions';
import React from 'react';

export const showMentorBubble = StateEffect.define<MentorSuggestion | null>();
export const dismissMentorBubble = StateEffect.define<void>();

interface MentorBubbleState {
  suggestion: MentorSuggestion | null;
  visible: boolean;
}

let currentRoot: Root | null = null;

type MentorBubbleCallbacks = {
  onDismissed: () => void;
  onSnoozed: () => void;
  onAccepted: (actionId: string) => void;
  onOpenDetail: () => void;
};

export interface MentorInlineExtensionConfig {
  actionContext: SuggestionActionContext | null;
  callbacks: MentorBubbleCallbacks | null;
}

/**
 * 使用 MutableRefObject 模式传递 config，
 * 确保 buildDecorations 每次调用时读取最新值，
 * 而非编辑器创建时的快照。
 */
export interface MentorInlineExtensionConfigRef {
  current: MentorInlineExtensionConfig;
}

class MentorBubbleWidget extends WidgetType {
  constructor(
    readonly suggestion: MentorSuggestion,
    readonly configRef: MentorInlineExtensionConfigRef,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'mentor-bubble-host';

    const root = createRoot(container);
    currentRoot = root;

    const config = this.configRef.current;
    const actionContext = config.actionContext;
    const callbacks = config.callbacks;

    root.render(
      React.createElement(InlineMentorBubble, {
        suggestion: this.suggestion,
        actionContext: actionContext!,
        onDismissed: () => callbacks?.onDismissed(),
        onSnoozed: () => callbacks?.onSnoozed(),
        onAccepted: (actionId: string) => callbacks?.onAccepted(actionId),
        onOpenDetail: () => callbacks?.onOpenDetail(),
      })
    );

    return container;
  }

  destroy() {
    const rootToUnmount = currentRoot;
    currentRoot = null;
    if (rootToUnmount) {
      setTimeout(() => {
        try { rootToUnmount.unmount(); } catch { /* already unmounted */ }
      }, 0);
    }
  }

  ignoreEvent(): boolean {
    return false;
  }
}

const mentorBubbleField = StateField.define<MentorBubbleState>({
  create: () => ({ suggestion: null, visible: false }),
  update: (value, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(showMentorBubble)) {
        const suggestion = effect.value;
        if (suggestion === null) {
          return { suggestion: null, visible: false };
        }
        return { suggestion, visible: true };
      }
      if (effect.is(dismissMentorBubble)) {
        return { suggestion: null, visible: false };
      }
    }
    if (value.visible && tr.docChanged) {
      return { suggestion: null, visible: false };
    }
    return value;
  },
});

function buildDecorations(
  bubbleState: MentorBubbleState,
  editorState: import('@codemirror/state').EditorState,
  configRef: MentorInlineExtensionConfigRef,
): DecorationSet {
  const config = configRef.current;
  if (!bubbleState.visible || !bubbleState.suggestion || !config.actionContext || !config.callbacks) {
    return Decoration.none;
  }

  const pos = editorState.selection.main.head;
  const line = editorState.doc.lineAt(pos);
  const widgetPos = line.to;

  const widget = Decoration.widget({
    widget: new MentorBubbleWidget(bubbleState.suggestion, configRef),
    side: 1,
    block: true,
  });

  return Decoration.set([widget.range(widgetPos)]);
}

function makeMentorDecorationField(configRef: MentorInlineExtensionConfigRef) {
  return StateField.define<DecorationSet>({
    create: (state) => buildDecorations(state.field(mentorBubbleField), state, configRef),
    update: (value, tr) => {
      const bubbleState = tr.state.field(mentorBubbleField);
      if (!tr.docChanged && !tr.selection && !tr.effects.some(e => e.is(showMentorBubble) || e.is(dismissMentorBubble))) {
        return value.map(tr.changes);
      }
      return buildDecorations(bubbleState, tr.state, configRef);
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

export function mentorInlineExtension(configRef: MentorInlineExtensionConfigRef) {
  return [
    mentorBubbleField,
    makeMentorDecorationField(configRef),
    keymap.of([
      {
        key: 'Escape',
        run: (view) => {
          const state = view.state.field(mentorBubbleField);
          if (state.visible) {
            view.dispatch({ effects: dismissMentorBubble.of(undefined) });
            return true;
          }
          return false;
        },
      },
    ]),
  ];
}

export function showMentorSuggestion(view: EditorView, suggestion: MentorSuggestion): void {
  view.dispatch({
    effects: showMentorBubble.of(suggestion),
  });
}

export function hideMentorSuggestion(view: EditorView): void {
  view.dispatch({
    effects: dismissMentorBubble.of(undefined),
  });
}

export { mentorBubbleField };
