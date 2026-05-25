import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useVault } from '@/modules/vault/VaultProvider';
import { useCapture } from '@/modules/capture/CaptureProvider';
import { useNotifications } from '@/modules/notifications/NotificationProvider';
import { stickyNoteService, type StickyNote } from '@/services/filesystem/sticky-notes';

const NOTE_HEIGHT = 130;
const TOP_OFFSET = 56;

interface StickyNotesState {
  notes: StickyNote[];
  loading: boolean;
  error: string | null;
  addNote: (boundDocumentPath?: string) => void;
  updateNote: (id: string, updates: Partial<StickyNote>) => void;
  deleteNote: (id: string) => void;
  convertToCapture: (id: string) => Promise<'converted' | 'already-captured' | 'empty'>;
}

const StickyNotesContext = createContext<StickyNotesState | null>(null);

export function useStickyNotes(): StickyNotesState {
  const ctx = useContext(StickyNotesContext);
  if (!ctx) throw new Error('useStickyNotes must be used within StickyNotesProvider');
  return ctx;
}

interface StickyNotesProviderProps {
  children: ReactNode;
}

export function StickyNotesProvider({ children }: StickyNotesProviderProps) {
  const { vault } = useVault();
  const { addCapture, updateCapture } = useCapture();
  const { addNotification } = useNotifications();
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // debounce 持久化
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  const persistNotes = useCallback(async (items: StickyNote[]) => {
    if (!vault) return;
    try {
      await stickyNoteService.writeStickyNotes(vault.path, items);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, [vault]);

  const debouncedPersist = useCallback((items: StickyNote[]) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      persistNotes(items);
      debounceTimerRef.current = null;
    }, 500);
  }, [persistNotes]);

  // vault 就绪后加载便笺
  useEffect(() => {
    if (!vault) {
      setNotes([]);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const loaded = await stickyNoteService.readStickyNotes(vault.path);
        setNotes(loaded);
        setError(null);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [vault]);

  const addNote = useCallback((boundDocumentPath?: string) => {
    const now = new Date().toISOString();
    // 初始位置使用哨兵值 -1，由 StickyNotesLayer 基于实际容器尺寸计算
    const count = notesRef.current.length;

    // 无绑定文档时默认创建 pinned/global 便签，确保在所有视图可见
    const isGlobal = !boundDocumentPath;

    const newNote: StickyNote = {
      id: crypto.randomUUID(),
      content: '',
      position: { x: -1, y: TOP_OFFSET + count * NOTE_HEIGHT },
      collapsed: false,
      pinned: isGlobal,
      bound_document_path: boundDocumentPath ?? null,
      captured_content: null,
      captured_entry_id: null,
      created_at: now,
      updated_at: now,
    };

    setNotes(prev => {
      const next = [...prev, newNote];
      debouncedPersist(next);
      return next;
    });
  }, [debouncedPersist]);

  const updateNote = useCallback((id: string, updates: Partial<StickyNote>) => {
    setNotes(prev => {
      const next = prev.map(note =>
        note.id === id
          ? { ...note, ...updates, updated_at: new Date().toISOString() }
          : note
      );
      debouncedPersist(next);
      return next;
    });
  }, [debouncedPersist]);

  const deleteNote = useCallback((id: string) => {
    setNotes(prev => {
      const next = prev.filter(note => note.id !== id);
      debouncedPersist(next);
      return next;
    });
  }, [debouncedPersist]);

  const convertToCapture = useCallback(async (id: string): Promise<'converted' | 'already-captured' | 'empty'> => {
    if (!vault) return 'empty';
    const note = notesRef.current.find(n => n.id === id);
    if (!note) return 'empty';

    // 空便签不允许转换
    if (!note.content.trim()) {
      addNotification('info', '无法转换', '空便签不能转为 Capture');
      return 'empty';
    }

    const currentContent = note.content;

    // 检查内容是否与上次转换相同
    if (note.captured_content !== null && note.captured_content === currentContent) {
      addNotification('info', '已转入 Capture', '该便笺内容已转入 Capture，修改后再转');
      return 'already-captured';
    }

    try {
      // 如果已有 captured_entry_id，更新已有 capture 条目
      if (note.captured_entry_id) {
        await updateCapture(note.captured_entry_id, currentContent);
        addNotification('info', 'Capture 已更新', `便笺内容已更新到 Capture Inbox`);
        updateNote(id, { captured_content: currentContent });
      } else {
        // 首次转换，新建 capture 条目
        const entryId = await addCapture(currentContent, 'sticky-note');
        updateNote(id, { captured_content: currentContent, captured_entry_id: entryId || null });
        addNotification('info', '便笺已转 Capture', `便笺内容已添加到 Capture Inbox`);
      }
      return 'converted';
    } catch (err) {
      addNotification('error', '转换失败', `便笺转 Capture 失败: ${err}`);
      return 'empty';
    }
  }, [vault, addCapture, updateCapture, addNotification, updateNote]);

  return (
    <StickyNotesContext.Provider
      value={{
        notes,
        loading,
        error,
        addNote,
        updateNote,
        deleteNote,
        convertToCapture,
      }}
    >
      {children}
    </StickyNotesContext.Provider>
  );
}
