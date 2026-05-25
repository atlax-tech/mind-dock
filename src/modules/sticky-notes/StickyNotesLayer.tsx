import { useState, useCallback, useRef, useEffect } from 'react';
import { StickyNote } from './StickyNote';
import type { StickyNote as StickyNoteType } from '@/services/filesystem/sticky-notes';

const NOTE_WIDTH = 200;
const NOTE_HEIGHT = 130;
const PADDING = 12;
const TOP_OFFSET = 56;

interface StickyNotesLayerProps {
  notes: StickyNoteType[];
  activeDocumentPath: string;
  error: string | null;
  onUpdate: (id: string, updates: Partial<StickyNoteType>) => void;
  onDelete: (id: string) => void;
  onConvertToCapture: (id: string) => Promise<'converted' | 'already-captured' | 'empty'>;
}

export function StickyNotesLayer({ notes, activeDocumentPath, error, onUpdate, onDelete, onConvertToCapture }: StickyNotesLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevWidthRef = useRef<number>(0);

  // z-index 管理：记录点击顺序
  const [zOrder, setZOrder] = useState<string[]>([]);

  const handleBringToFront = useCallback((id: string) => {
    setZOrder(prev => {
      const filtered = prev.filter(z => z !== id);
      return [...filtered, id];
    });
  }, []);

  // 过滤：pinned 全局展示，未 pinned 仅绑定文档可见，无绑定文档的非 pinned 便签在无 active document 时也可见
  const visibleNotes = notes.filter(note => {
    if (note.pinned) return true;
    if (note.bound_document_path !== null && note.bound_document_path === activeDocumentPath) return true;
    // 无绑定文档且非 pinned 的便签（理论上不应存在，但作为安全兜底）
    if (note.bound_document_path === null && !activeDocumentPath) return true;
    return false;
  });

  const getZIndex = (noteId: string) => {
    const idx = zOrder.indexOf(noteId);
    return idx >= 0 ? idx + 10 : 1;
  };

  // 计算哨兵位置 x=-1 的便笺初始位置：右侧从上往下排列，超出高度向左扩展新列
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const containerWidth = el.clientWidth;
    const containerHeight = el.clientHeight;
    if (containerWidth <= 0 || containerHeight <= 0) return;

    const maxRows = Math.max(1, Math.floor((containerHeight - TOP_OFFSET) / (NOTE_HEIGHT + PADDING)));

    for (const note of notes) {
      if (note.position.x === -1) {
        // 找到当前已放置便笺的最大列号和行号
        const placedNotes = notes.filter(n => n.position.x !== -1 && n.position.y >= TOP_OFFSET);
        // 计算右侧最右列的位置
        const rightEdge = containerWidth - NOTE_WIDTH - PADDING;
        // 计算当前有多少便笺需要放置（包括哨兵的）
        const sentinelNotes = notes.filter(n => n.position.x === -1);
        const sentinelIndex = sentinelNotes.indexOf(note);

        // 所有便笺总数（已放置 + 哨兵），用于计算网格位置
        const totalIndex = placedNotes.length + sentinelIndex;
        const col = Math.floor(totalIndex / maxRows);
        const row = totalIndex % maxRows;

        const x = rightEdge - col * (NOTE_WIDTH + PADDING);
        const y = TOP_OFFSET + row * (NOTE_HEIGHT + PADDING);

        onUpdate(note.id, { position: { x: Math.max(PADDING, x), y } });
      }
    }
  }, [notes, onUpdate]);

  // 容器尺寸变化时，按比例调整便笺位置
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        const oldWidth = prevWidthRef.current;

        if (oldWidth > 0 && newWidth > 0 && Math.abs(newWidth - oldWidth) > 2) {
          const ratio = newWidth / oldWidth;
          for (const note of notes) {
            if (note.position.x === -1) continue; // 跳过哨兵
            const newX = Math.round(note.position.x * ratio);
            const maxX = newWidth - NOTE_WIDTH - PADDING;
            const clampedX = Math.max(PADDING, Math.min(newX, maxX));
            if (clampedX !== note.position.x) {
              onUpdate(note.id, { position: { x: clampedX, y: note.position.y } });
            }
          }
        }
        prevWidthRef.current = newWidth;
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [notes, onUpdate]);

  // 记录初始宽度
  useEffect(() => {
    if (containerRef.current) {
      prevWidthRef.current = containerRef.current.clientWidth;
    }
  }, []);

  if (visibleNotes.length === 0 && !error) return null;

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden">
      {error && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 pointer-events-auto bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs px-3 py-1.5 rounded shadow-sm">
          便笺保存失败: {error}
        </div>
      )}
      {visibleNotes.map((note, index) => (
        <div key={note.id} className="pointer-events-auto" style={{ zIndex: getZIndex(note.id) }}>
          <StickyNote
            note={note}
            noteIndex={index}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onConvertToCapture={onConvertToCapture}
            onBringToFront={handleBringToFront}
          />
        </div>
      ))}
    </div>
  );
}
