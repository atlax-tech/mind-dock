import { invoke } from '@tauri-apps/api/core';

export interface AISuggestion {
  id: string;
  suggestion_type: string;
  source_provider: string;
  source_model: string;
  content: string;
  status: 'pending' | 'accepted' | 'rejected' | 'edited';
  edited_content: string | null;
  related_object_id: string | null;
  related_object_type: string | null;
  created_at: string;
}

export const aiSuggestionsService = {
  async appendSuggestion(
    vaultPath: string,
    suggestionType: string,
    sourceProvider: string,
    sourceModel: string,
    content: string,
    relatedObjectId: string | null,
    relatedObjectType: string | null
  ): Promise<void> {
    return invoke('append_ai_suggestion', {
      vaultPath,
      suggestionType,
      sourceProvider,
      sourceModel,
      content,
      relatedObjectId,
      relatedObjectType,
    });
  },

  async readSuggestions(vaultPath: string, limit?: number): Promise<AISuggestion[]> {
    return invoke<AISuggestion[]>('read_ai_suggestions', { vaultPath, limit: limit ?? null });
  },

  async updateSuggestionStatus(
    vaultPath: string,
    suggestionId: string,
    status: string,
    editedContent: string | null
  ): Promise<void> {
    return invoke('update_ai_suggestion_status', { vaultPath, suggestionId, status, editedContent });
  },
};
