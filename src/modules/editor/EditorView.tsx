import { useRef, useEffect, forwardRef, useImperativeHandle, useMemo, useState } from 'react';
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
import { mentorEventBus } from '@/modules/ai/MentorEventBus';
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
  vaultPath?: string;
  vaultId?: string;
}

interface EditorTocEntry {
  level: number;
  text: string;
  line: number;
}

interface EditorTocScaleProps {
  content: string;
  onEntryClick?: (entry: EditorTocEntry) => void;
}

function parseEditorToc(content: string): EditorTocEntry[] {
  return content
    .split('\n')
    .map((line, index) => {
      const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.trim());
      if (!match) return null;
      return {
        level: match[1].length,
        text: match[2].trim(),
        line: index + 1,
      };
    })
    .filter((entry): entry is EditorTocEntry => Boolean(entry));
}

function getScaleHeight(lineCount: number, headingCount: number): number {
  const lineBasedHeight = Math.sqrt(Math.max(lineCount, 1)) * 18;
  const headingBasedHeight = headingCount * 18;
  return Math.round(Math.min(360, Math.max(120, Math.min(lineBasedHeight, headingBasedHeight))));
}

function getDotSize(level: number): number {
  if (level <= 1) return 10;
  if (level === 2) return 8;
  if (level === 3) return 6;
  return 4;
}

function getScaleDots(toc: EditorTocEntry[], scaleHeight: number) {
  const maxDots = Math.max(6, Math.floor(scaleHeight / 14));
  const source = toc.length <= maxDots
    ? toc
    : toc.filter((_, index) => {
        if (index === 0 || index === toc.length - 1) return true;
        const stride = Math.ceil(toc.length / maxDots);
        return index % stride === 0;
      }).slice(0, maxDots);

  return source.map((entry, index) => ({
    entry,
    top: source.length <= 1 ? 50 : 4 + (index / (source.length - 1)) * 92,
  }));
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

export const EditorView = forwardRef<EditorViewHandle, EditorViewProps>(function EditorView({ content, onContentChange, onSelectionAction, reasoningAvailable = false, vaultPath, vaultId }, ref) {
  const { isDark } = useTheme();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<CMEditorView | null>(null);
  const isExternalUpdate = useRef(false);
  const onContentChangeRef = useRef(onContentChange);
  const onSelectionActionRef = useRef(onSelectionAction);
  const reasoningAvailableRef = useRef(reasoningAvailable);
  const vaultPathRef = useRef(vaultPath);
  const vaultIdRef = useRef(vaultId);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  onSelectionActionRef.current = onSelectionAction;
  reasoningAvailableRef.current = reasoningAvailable;
  vaultPathRef.current = vaultPath;
  vaultIdRef.current = vaultId;

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

    const IDLE_THRESHOLD_MS = 5000;

    const updateListener = CMEditorView.updateListener.of((update) => {
      if (update.docChanged && !isExternalUpdate.current) {
        onContentChangeRef.current(update.state.doc.toString());

        // document_idle debounce：每次文档变更重置计时器
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current);
        }
        if (vaultPathRef.current && vaultIdRef.current) {
          idleTimerRef.current = setTimeout(() => {
            if (!vaultPathRef.current || !vaultIdRef.current) return;
            mentorEventBus.emit('document_idle', {
              targetId: vaultIdRef.current,
              targetType: 'document',
              documentPath: vaultIdRef.current,
              idleDurationMs: IDLE_THRESHOLD_MS,
            }, { vaultPath: vaultPathRef.current, vaultId: vaultIdRef.current });
          }, IDLE_THRESHOLD_MS);
        }
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
          editorContextMenu({
            items: [
              { label: '加入上下文包', action: (_view, sel) => onSelectionActionRef.current?.('addToPack', sel) },
              { label: () => reasoningAvailableRef.current ? '从此生成...' : '从此生成...（需连接 AI）', action: (_view, sel) => onSelectionActionRef.current?.('generateFrom', sel) },
              { label: () => reasoningAvailableRef.current ? '解释选区' : '解释选区（需连接 AI）', action: (_view, sel) => onSelectionActionRef.current?.('explain', sel) },
              { label: () => reasoningAvailableRef.current ? '快速问答' : '快速问答（需连接 AI）', action: (_view, sel) => onSelectionActionRef.current?.('quickAsk', sel) },
              { separator: true },
              { label: '查找相关内容', action: (_view, sel) => onSelectionActionRef.current?.('findRelated', sel) },
              { label: () => reasoningAvailableRef.current ? '总结选区' : '总结选区（需连接 AI）', action: (_view, sel) => onSelectionActionRef.current?.('summarize', sel) },
            ],
            onSelectionCreated: (sel) => {
              if (vaultPathRef.current && vaultIdRef.current) {
                mentorEventBus.emit('selection_created', {
                  targetId: vaultIdRef.current,
                  targetType: 'selection',
                  documentPath: vaultIdRef.current,
                  selectionLength: sel.text.length,
                }, { vaultPath: vaultPathRef.current, vaultId: vaultIdRef.current });
              }
            },
          })
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
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
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

export function EditorTocScale({ content, onEntryClick }: EditorTocScaleProps) {
  const [isHovered, setIsHovered] = useState(false);
  const toc = useMemo(() => parseEditorToc(content), [content]);
  const lineCount = useMemo(() => Math.max(1, content.split('\n').length), [content]);
  const scaleHeight = useMemo(() => getScaleHeight(lineCount, toc.length), [lineCount, toc.length]);
  const scaleDots = useMemo(() => getScaleDots(toc, scaleHeight), [toc, scaleHeight]);

  if (toc.length === 0) return null;

  return (
    <div
      className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex items-center justify-end pr-1"
      style={{ height: scaleHeight }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isHovered && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[320px] max-w-[min(320px,calc(100vw-96px))] max-h-[min(540px,calc(100vh-160px))] overflow-y-auto rounded-[8px] border border-[#d8d8cf]/75 dark:border-white/10 bg-[#fcfcf9]/94 dark:bg-[#171717]/90 shadow-2xl shadow-black/15 dark:shadow-black/40 backdrop-blur-xl p-3">
          <div className="space-y-0.5">
            {toc.map((entry, index) => (
              <button
                key={`${entry.line}-${index}`}
                onClick={() => onEntryClick?.(entry)}
                className="w-full min-w-0 rounded px-2 py-1.5 text-left text-[12px] leading-snug text-[#6f6f68] dark:text-[#b5b5b5] transition-colors hover:bg-[#eeeee8] dark:hover:bg-white/[0.07] hover:text-[#2c2c2a] dark:hover:text-[#e3e3e3]"
                style={{ paddingLeft: 8 + Math.min(entry.level - 1, 4) * 16 }}
              >
                <span className="block truncate">{entry.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`relative h-full w-6 transition-opacity ${isHovered ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        {scaleDots.map(({ entry, top }, index) => {
          const size = getDotSize(entry.level);
          return (
            <button
              key={`${entry.line}-${index}`}
              title={entry.text}
              onClick={() => onEntryClick?.(entry)}
              className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-stone-500/42 dark:bg-white/38 ring-1 ring-white/40 dark:ring-white/12 transition-opacity hover:opacity-85"
              style={{
                top: `${top}%`,
                width: size,
                height: size,
                opacity: 0.52,
              }}
              aria-label={`跳转到 ${entry.text}`}
            />
          );
        })}
      </div>
    </div>
  );
}
