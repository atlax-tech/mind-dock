import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView as CMEditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, drawSelection, rectangularSelection, highlightSpecialChars } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle, bracketMatching, foldGutter, indentOnInput, foldKeymap } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { tags } from '@lezer/highlight';
import { useTheme } from '@/app/theme';
import { editorContextMenu, type EditorSelectionPayload } from './editorContextMenu';

export interface EditorViewHandle {
  scrollToLine(lineNumber: number): void;
  scrollToHeading(headingText: string): void;
}

interface EditorViewProps {
  content: string;
  onContentChange: (content: string) => void;
  onSelectionAction?: (action: string, selection: EditorSelectionPayload) => void;
  reasoningAvailable?: boolean;
}

const editorHighlightStyle = (isDark: boolean) => HighlightStyle.define([
  { tag: tags.heading, color: isDark ? '#f5f5f4' : '#292524', fontWeight: '700' },
  { tag: tags.link, color: isDark ? '#5eead4' : '#047857', textDecoration: 'underline' },
  { tag: tags.url, color: isDark ? '#67e8f9' : '#0369a1' },
  { tag: tags.emphasis, color: isDark ? '#c4b5fd' : '#6d28d9', fontStyle: 'italic' },
  { tag: tags.strong, color: isDark ? '#f8fafc' : '#1c1917', fontWeight: '700' },
  { tag: tags.keyword, color: isDark ? '#fbbf24' : '#b45309' },
  { tag: tags.atom, color: isDark ? '#86efac' : '#15803d' },
  { tag: tags.bool, color: isDark ? '#86efac' : '#15803d' },
  { tag: tags.number, color: isDark ? '#f0abfc' : '#a21caf' },
  { tag: tags.string, color: isDark ? '#a7f3d0' : '#047857' },
  { tag: tags.quote, color: isDark ? '#cbd5e1' : '#57534e', fontStyle: 'italic' },
  { tag: tags.monospace, color: isDark ? '#e5e7eb' : '#292524' },
  { tag: tags.meta, color: isDark ? '#a3a3a3' : '#78716c' },
  { tag: tags.comment, color: isDark ? '#a3a3a3' : '#78716c' },
]);

export const EditorView = forwardRef<EditorViewHandle, EditorViewProps>(function EditorView({ content, onContentChange, onSelectionAction, reasoningAvailable = false }, ref) {
  const { isDark } = useTheme();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<CMEditorView | null>(null);
  const isExternalUpdate = useRef(false);
  const onContentChangeRef = useRef(onContentChange);
  const onSelectionActionRef = useRef(onSelectionAction);
  const reasoningAvailableRef = useRef(reasoningAvailable);
  onSelectionActionRef.current = onSelectionAction;
  reasoningAvailableRef.current = reasoningAvailable;

  useImperativeHandle(ref, () => ({
    scrollToLine(lineNumber: number) {
      const view = viewRef.current;
      if (!view) return;
      const line = Math.max(1, Math.min(lineNumber, view.state.doc.lines));
      const pos = view.state.doc.line(line).from;
      view.dispatch({
        selection: { anchor: pos },
        effects: CMEditorView.scrollIntoView(pos, { y: 'center' }),
      });
      view.focus();
    },

    scrollToHeading(headingText: string) {
      const view = viewRef.current;
      if (!view) return;
      const doc = view.state.doc;
      for (let i = 1; i <= doc.lines; i++) {
        const lineText = doc.line(i).text;
        if (lineText.trim().startsWith('#') && lineText.replace(/^#+\s*/, '').trim() === headingText.trim()) {
          const pos = doc.line(i).from;
          view.dispatch({
            selection: { anchor: pos },
            effects: CMEditorView.scrollIntoView(pos, { y: 'center' }),
          });
          view.focus();
          return;
        }
      }
    },
  }), []);

  onContentChangeRef.current = onContentChange;

  useEffect(() => {
    if (!editorRef.current) return;

    const updateListener = CMEditorView.updateListener.of((update) => {
      if (update.docChanged && !isExternalUpdate.current) {
        onContentChangeRef.current(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(editorHighlightStyle(isDark)),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          ...lintKeymap,
          indentWithTab,
        ]),
        updateListener,
        CMEditorView.theme({
          '&': { height: '100%', fontSize: '13px' },
          '.cm-content': {
            fontFamily: 'ui-monospace, monospace',
            padding: '1rem',
            caretColor: isDark ? '#a3e635' : '#059669',
            color: isDark ? '#e7e5e4' : '#2c2c2a',
          },
          '.cm-content ::selection': {
            backgroundColor: isDark ? 'rgba(20,184,166,0.48)' : 'rgba(5,150,105,0.18)',
            color: isDark ? '#ffffff' : '#111827',
          },
          '.cm-gutters': { border: 'none', background: 'transparent', color: isDark ? '#737373' : '#8a8a84' },
          '.cm-activeLineGutter': { background: 'transparent' },
          '.cm-activeLine': { background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' },
          '.cm-cursor': { borderLeftColor: isDark ? '#a3e635' : '#059669' },
          '&.cm-focused .cm-cursor': { borderLeftColor: isDark ? '#a3e635' : '#059669' },
          '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
            backgroundColor: isDark ? 'rgba(20,184,166,0.48)' : 'rgba(5,150,105,0.18)',
          },
          '.cm-selectionMatch': { backgroundColor: isDark ? 'rgba(251,191,36,0.22)' : 'rgba(245,158,11,0.18)' },
        }),
        ...(onSelectionActionRef.current ? [
          editorContextMenu([
            { label: '加入上下文包', action: (_view, sel) => onSelectionActionRef.current?.('addToPack', sel) },
            { label: () => reasoningAvailableRef.current ? '从此生成...' : '从此生成...（需连接 AI）', action: (_view, sel) => onSelectionActionRef.current?.('generateFrom', sel) },
            { label: () => reasoningAvailableRef.current ? '解释选区' : '解释选区（需连接 AI）', action: (_view, sel) => onSelectionActionRef.current?.('explain', sel) },
            { label: () => reasoningAvailableRef.current ? '快速问答' : '快速问答（需连接 AI）', action: (_view, sel) => onSelectionActionRef.current?.('quickAsk', sel) },
            { separator: true },
            { label: '查找相关内容', action: (_view, sel) => onSelectionActionRef.current?.('findRelated', sel) },
            { label: () => reasoningAvailableRef.current ? '总结选区' : '总结选区（需连接 AI）', action: (_view, sel) => onSelectionActionRef.current?.('summarize', sel) },
          ])
        ] : []),
        CMEditorView.lineWrapping,
      ],
    });

    const view = new CMEditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [isDark]); // 主题切换时重建编辑器样式

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentContent = view.state.doc.toString();
    if (currentContent !== content) {
      isExternalUpdate.current = true;
      view.dispatch({
        changes: { from: 0, to: currentContent.length, insert: content },
      });
      isExternalUpdate.current = false;
    }
  }, [content]);

  return (
    <div className="flex-1 flex flex-col min-w-0" ref={editorRef} />
  );
});
