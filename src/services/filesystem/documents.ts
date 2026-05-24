import { invoke } from '@tauri-apps/api/core';

export const documentService = {
  async createDocument(vaultPath: string, filePath: string): Promise<string> {
    return invoke<string>('create_document', { vaultPath, filePath });
  },

  async readDocument(vaultPath: string, filePath: string): Promise<string> {
    return invoke<string>('read_document', { vaultPath, filePath });
  },

  async writeDocument(vaultPath: string, filePath: string, content: string): Promise<void> {
    return invoke('write_document', { vaultPath, filePath, content });
  },

  async renameDocument(vaultPath: string, oldPath: string, newName: string): Promise<string> {
    return invoke<string>('rename_document', { vaultPath, oldPath, newName });
  },

  async deleteDocument(vaultPath: string, filePath: string): Promise<void> {
    return invoke('delete_document', { vaultPath, filePath });
  },
};
