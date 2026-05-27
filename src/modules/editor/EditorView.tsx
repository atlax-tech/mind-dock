import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView as CMEditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, drawSelection, rectangularSelection, highlightSpecialChars } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput, foldKeymap } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { useTheme } from '@/app/theme';
import { editorContextMenu } from './editorContextMenu';

export interface EditorViewHandle {
  scrollToLine(lineNumber: number): void;
  scrollToHeading(headingText: string): void;
}

interface EditorViewProps {
  content: string;
  onContentChange: (content: string) => void;
  onSelectionAction?: (action: string, selection: { from: number; to: number; text: string }) => void;
}

export const EditorView = forwardRef<EditorViewHandle, EditorViewProps>(function EditorView({ content, onContentChange, onSelectionAction }, ref) {
  const { isDark } = useTheme();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<CMEditorView | null>(null);
  const isExternalUpdate = useRef(false);
  const onContentChangeRef = useRef(onContentChange);
  const onSelectionActionRef = useRef(onSelectionAction);
  onSelectionActionRef.current = onSelectionAction;

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
        syntaxHighlighting(defaultHighlightStyle),
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
          '.cm-content': { fontFamily: 'ui-monospace, monospace', padding: '1rem' },
          '.cm-gutters': { border: 'none', background: 'transparent' },
          '.cm-activeLineGutter': { background: 'transparent' },
          '.cm-activeLine': { background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' },
          '.cm-cursor': { borderLeftColor: isDark ? '#a3e635' : '#059669' },
          '&.cm-focused .cm-cursor': { borderLeftColor: isDark ? '#a3e635' : '#059669' },
          '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
            backgroundColor: isDark ? 'rgba(163,230,53,0.15)' : 'rgba(5,150,105,0.1)',
          },
        }),
        ...(onSelectionActionRef.current ? [
          editorContextMenu([
            { label: '加入上下文包', action: (_view, sel) => onSelectionActionRef.current?.('addToPack', sel) },
            { label: '从此生成...', action: (_view, sel) => onSelectionActionRef.current?.('generateFrom', sel) },
            { label: '解释选区', action: (_view, sel) => onSelectionActionRef.current?.('explain', sel) },
            { separator: true },
            { label: '查找相关内容', action: (_view, sel) => onSelectionActionRef.current?.('findRelated', sel) },
            { label: '总结选区', action: (_view, sel) => onSelectionActionRef.current?.('summarize', sel) },
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
  }, []); // 只创建一次

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
