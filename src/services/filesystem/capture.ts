import { invoke } from '@tauri-apps/api/core';

export interface CaptureEntry {
  id: string;
  content: string;
  timestamp: string;
  source: string;
}

export const captureService = {
  async appendCapture(vaultPath: string, content: string, source: string): Promise<void> {
    return invoke('append_capture', { vaultPath, content, source });
  },

  async readCaptures(vaultPath: string): Promise<CaptureEntry[]> {
    return invoke<CaptureEntry[]>('read_captures', { vaultPath });
  },

  async writeCaptures(vaultPath: string, entries: CaptureEntry[]): Promise<void> {
    return invoke('write_captures', { vaultPath, entries });
  },
};
