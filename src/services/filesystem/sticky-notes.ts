import { invoke } from '@tauri-apps/api/core';

export interface NotePosition {
  x: number;
  y: number;
}

export interface StickyNote {
  id: string;
  content: string;
  position: NotePosition;
  collapsed: boolean;
  pinned: boolean;
  bound_document_path: string | null;
  captured_content: string | null;
  captured_entry_id: string | null;
  created_at: string;
  updated_at: string;
}

export const stickyNoteService = {
  async readStickyNotes(vaultPath: string): Promise<StickyNote[]> {
    return invoke<StickyNote[]>('read_sticky_notes', { vaultPath });
  },

  async writeStickyNotes(vaultPath: string, notes: StickyNote[]): Promise<void> {
    return invoke('write_sticky_notes', { vaultPath, notes });
  },
};
