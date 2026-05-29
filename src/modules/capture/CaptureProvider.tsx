import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useVault } from '@/modules/vault/VaultProvider';
import { mentorEventBus } from '@/modules/ai/MentorEventBus';
import { captureService, type CaptureEntry } from '@/services/filesystem/capture';

interface CaptureState {
  captures: CaptureEntry[];
  loading: boolean;
  error: string | null;
  addCapture: (content: string, source: string) => Promise<string>; // 返回新建条目 ID
  deleteCapture: (id: string) => Promise<void>;
  updateCapture: (id: string, content: string) => Promise<void>;
  loadCaptures: () => Promise<void>;
}

const CaptureContext = createContext<CaptureState | null>(null);

export function useCapture(): CaptureState {
  const ctx = useContext(CaptureContext);
  if (!ctx) throw new Error('useCapture must be used within CaptureProvider');
  return ctx;
}

export function CaptureProvider({ children }: { children: ReactNode }) {
  const { vault } = useVault();
  const [captures, setCaptures] = useState<CaptureEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capturesRef = useRef<CaptureEntry[]>(captures);
  capturesRef.current = captures;

  const persistAndReload = useCallback(async (entries: CaptureEntry[]) => {
    if (!vault) return;
    try {
      await captureService.writeCaptures(vault.path, entries);
      setCaptures(entries);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, [vault]);

  const loadCaptures = useCallback(async () => {
    if (!vault) return;
    try {
      setLoading(true);
      setError(null);
      const entries = await captureService.readCaptures(vault.path);
      setCaptures(entries);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [vault]);

  // vault 加载后自动加载 captures
  useEffect(() => {
    if (vault) {
      loadCaptures();
    } else {
      setCaptures([]);
    }
  }, [vault, loadCaptures]);

  const addCapture = useCallback(async (content: string, source: string): Promise<string> => {
    if (!vault) return '';
    try {
      setError(null);
      const entry = await captureService.appendCapture(vault.path, content, source);
      setCaptures(prev => [...prev, entry]);
      mentorEventBus.emit('capture_created', {
        targetId: entry.id,
        targetType: 'capture',
        captureId: entry.id,
        source,
        contentLength: content.length,
      }, { vaultPath: vault.path, vaultId: vault.path });
      return entry.id;
    } catch (err) {
      setError(String(err));
      throw err;
    }
  }, [vault]);

  const deleteCapture = useCallback(async (id: string) => {
    const updated = captures.filter(c => c.id !== id);
    await persistAndReload(updated);
  }, [captures, persistAndReload]);

  const updateCapture = useCallback(async (id: string, content: string) => {
    const updated = captures.map(c =>
      c.id === id ? { ...c, content } : c
    );
    await persistAndReload(updated);
  }, [captures, persistAndReload]);

  return (
    <CaptureContext.Provider
      value={{
        captures,
        loading,
        error,
        addCapture,
        deleteCapture,
        updateCapture,
        loadCaptures,
      }}
    >
      {children}
    </CaptureContext.Provider>
  );
}
