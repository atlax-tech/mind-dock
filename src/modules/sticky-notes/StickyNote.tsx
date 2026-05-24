import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Minus, ArrowRightFromLine, Pin, Check } from 'lucide-react';
import type { StickyNote as StickyNoteType } from '@/services/filesystem/sticky-notes';

interface StickyNoteProps {
  note: StickyNoteType;
  noteIndex: number;
  onUpdate: (id: string, updates: Partial<StickyNoteType>) => void;
  onDelete: (id: string) => void;
  onConvertToCapture: (id: string) => Promise<'converted' | 'already-captured' | 'empty'>;
  onBringToFront: (id: string) => void;
}

export function StickyNote({ note, noteIndex, onUpdate, onDelete, onConvertToCapture, onBringToFront }: StickyNoteProps) {
  const [position, setPosition] = useState(note.position);
  const [content, setContent] = useState(note.content);
  const [collapsed, setCollapsed] = useState(note.collapsed);
  const [captureFeedback, setCaptureFeedback] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; noteX: number; noteY: number } | null>(null);
  const contentDirtyRef = useRef(false);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 同步外部 note 变化（如从 provider 加载）
  useEffect(() => {
    if (!dragRef.current) {
      setPosition(note.position);
    }
  }, [note.position]);

  useEffect(() => {
    setCollapsed(note.collapsed);
  }, [note.collapsed]);

  // 拖动逻辑
  const handleTitleMouseDown = useCallback((e: React.MouseEvent) => {
    // 忽略按钮点击
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    onBringToFront(note.id);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      noteX: position.x,
      noteY: position.y,
    };
  }, [note.id, position.x, position.y, onBringToFront]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const newX = dragRef.current.noteX + dx;
      const newY = dragRef.current.noteY + dy;
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      // 拖动结束后同步到父组件
      onUpdate(note.id, { position });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [note.id, position, onUpdate]);

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    contentDirtyRef.current = true;
  }, []);

  const handleContentBlur = useCallback(() => {
    if (contentDirtyRef.current) {
      onUpdate(note.id, { content });
      contentDirtyRef.current = false;
    }
  }, [note.id, content, onUpdate]);

  const handleTogglePin = useCallback(() => {
    onUpdate(note.id, { pinned: !note.pinned });
  }, [note.id, note.pinned, onUpdate]);

  const handleToggleCollapse = useCallback(() => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    onUpdate(note.id, { collapsed: newCollapsed });
  }, [note.id, collapsed, onUpdate]);

  const handleDelete = useCallback(() => {
    onDelete(note.id);
  }, [note.id, onDelete]);

  // 内容是否已转入 capture（未修改）
  const isAlreadyCaptured = note.captured_content !== null && note.captured_content === note.content;
  const isEmpty = !note.content.trim();

  const handleConvertToCapture = useCallback(async () => {
    if (isEmpty) return;
    const result = await onConvertToCapture(note.id);
    // 清除之前的计时器
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    if (result === 'converted') {
      setCaptureFeedback('已转入 Capture');
    } else {
      setCaptureFeedback('已转入，修改后可再转');
    }
    // 3秒后自动清除反馈
    feedbackTimerRef.current = setTimeout(() => {
      setCaptureFeedback(null);
      feedbackTimerRef.current = null;
    }, 3000);
  }, [note.id, onConvertToCapture]);

  const title = note.bound_document_path
    ? note.bound_document_path.split('/').pop()?.replace(/\.md$/, '') || `便笺 ${noteIndex + 1}`
    : `便笺 ${noteIndex + 1}`;

  return (
    <div
      className="absolute"
      style={{
        left: position.x,
        top: position.y,
        width: 200,
        zIndex: 1,
      }}
      onMouseDown={() => onBringToFront(note.id)}
    >
      <div className={`bg-[#fef9c3] border rounded shadow-sm overflow-hidden ${note.pinned ? 'border-amber-400' : 'border-[#e5d78e]'}`}>
        {/* Title bar - draggable */}
        <div
          className="flex items-center justify-between px-2 py-1 bg-[#fde68a] border-b border-[#e5d78e] cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleTitleMouseDown}
        >
          <span className="flex items-center gap-1 text-[10px] font-medium text-[#78600a] truncate max-w-[100px]">
            {title}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleTogglePin}
              className={`p-0.5 rounded ${note.pinned ? 'text-amber-700' : 'text-[#a08c30] hover:text-amber-700'}`}
              title={note.pinned ? '取消置顶' : '置顶全局展示'}
            >
              <Pin size={10} />
            </button>
            <button
              onClick={handleConvertToCapture}
              disabled={isEmpty}
              className={`p-0.5 rounded ${isEmpty ? 'text-[#d4c98a] cursor-not-allowed' : isAlreadyCaptured ? 'text-emerald-700' : 'text-[#a08c30] hover:text-amber-700'}`}
              title={isEmpty ? '空便签不能转换' : isAlreadyCaptured ? '已转入 Capture，修改后可再转' : '转为 Capture'}
            >
              {isAlreadyCaptured ? <Check size={10} /> : <ArrowRightFromLine size={10} />}
            </button>
            <button
              onClick={handleToggleCollapse}
              className="p-0.5 text-[#a08c30] hover:text-stone-600 rounded"
              title={collapsed ? '展开' : '折叠'}
            >
              <Minus size={10} />
            </button>
            <button
              onClick={handleDelete}
              className="p-0.5 text-[#a08c30] hover:text-red-600 rounded"
              title="删除"
            >
              <X size={10} />
            </button>
          </div>
        </div>

        {/* Content area */}
        {!collapsed && (
          <div className="relative">
            <textarea
              value={content}
              onChange={handleContentChange}
              onBlur={handleContentBlur}
              className="w-full h-24 px-2 py-1.5 text-[11px] leading-relaxed text-[#5c4b0a] bg-transparent resize-none outline-none placeholder:text-[#c4b56a]"
              placeholder="写点什么..."
              spellCheck={false}
            />
            {/* 内联转换反馈 */}
            {captureFeedback && (
              <div className="absolute bottom-0 left-0 right-0 bg-emerald-50 dark:bg-emerald-900/30 border-t border-emerald-200 dark:border-emerald-800 px-2 py-1 text-[9px] text-emerald-700 dark:text-emerald-300 text-center">
                {captureFeedback}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
