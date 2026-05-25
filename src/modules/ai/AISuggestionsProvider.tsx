import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useVault } from '@/modules/vault/VaultProvider';
import { useAIRuntime } from '@/modules/ai/AIRuntimeProvider';
import { aiSuggestionsService, type AISuggestion } from '@/services/ai/suggestions';
import { mentorEventBus } from '@/modules/ai/MentorEventBus';

interface AISuggestionsState {
  suggestions: AISuggestion[];
  loading: boolean;
  error: string | null;
  createSuggestion: (type: string, content: string, relatedObjectId?: string, relatedObjectType?: string) => Promise<AISuggestion | null>;
  updateSuggestionStatus: (id: string, status: 'accepted' | 'rejected' | 'edited', editedContent?: string) => Promise<void>;
  loadSuggestions: () => Promise<void>;
}

const AISuggestionsContext = createContext<AISuggestionsState | null>(null);

export function useAISuggestions(): AISuggestionsState {
  const ctx = useContext(AISuggestionsContext);
  if (!ctx) throw new Error('useAISuggestions must be used within AISuggestionsProvider');
  return ctx;
}

export function AISuggestionsProvider({ children }: { children: ReactNode }) {
  const { vault } = useVault();
  const { config } = useAIRuntime();
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSuggestions = useCallback(async () => {
    if (!vault) return;
    try {
      setLoading(true);
      setError(null);
      const entries = await aiSuggestionsService.readSuggestions(vault.path);
      setSuggestions(entries);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [vault]);

  useEffect(() => {
    if (vault) {
      loadSuggestions();
    } else {
      setSuggestions([]);
    }
  }, [vault, loadSuggestions]);

  const createSuggestion = useCallback(async (
    type: string,
    content: string,
    relatedObjectId?: string,
    relatedObjectType?: string
  ): Promise<AISuggestion | null> => {
    if (!vault) return null;
    try {
      setError(null);
      const provider = config.endpoint ? 'ollama' : 'unknown';
      const model = config.default_model || 'unknown';
      await aiSuggestionsService.appendSuggestion(
        vault.path, type, provider, model, content,
        relatedObjectId || null, relatedObjectType || null
      );
      const entries = await aiSuggestionsService.readSuggestions(vault.path);
      setSuggestions(entries);
      const latest = entries.length > 0 ? entries[entries.length - 1] : null;
      mentorEventBus.emit('ai_suggestion_created', { type, content });
      return latest;
    } catch (err) {
      setError(String(err));
      return null;
    }
  }, [vault, config]);

  const updateSuggestionStatus = useCallback(async (
    id: string,
    status: 'accepted' | 'rejected' | 'edited',
    editedContent?: string
  ) => {
    if (!vault) return;
    try {
      setError(null);
      await aiSuggestionsService.updateSuggestionStatus(
        vault.path, id, status, editedContent || null
      );
      await loadSuggestions();
    } catch (err) {
      setError(String(err));
    }
  }, [vault, loadSuggestions]);

  return (
    <AISuggestionsContext.Provider
      value={{
        suggestions,
        loading,
        error,
        createSuggestion,
        updateSuggestionStatus,
        loadSuggestions,
      }}
    >
      {children}
    </AISuggestionsContext.Provider>
  );
}
