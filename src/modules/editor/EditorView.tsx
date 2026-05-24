import { useRef, useEffect } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView as CMEditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, drawSelection, rectangularSelection, highlightSpecialChars } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput, foldKeymap } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { useTheme } from '@/app/theme';

interface EditorViewProps {
  content: string;
  onContentChange: (content: string) => void;
}

export function EditorView({ content, onContentChange }: EditorViewProps) {
  const { isDark } = useTheme();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<CMEditorView | null>(null);
  const isExternalUpdate = useRef(false);
  const onContentChangeRef = useRef(onContentChange);

  // 始终保持 ref 指向最新回调，避免闭包过期
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

  // 外部内容更新时同步到 CodeMirror
  // isExternalUpdate 标志阻止 updateListener 在外部 dispatch 期间触发 onContentChange，
  // 避免切换 tab 时将内容错误地写入 openTabs 状态
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
}
