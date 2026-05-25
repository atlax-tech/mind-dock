import { invoke } from '@tauri-apps/api/core';

export interface GitCommit {
  hash: string;
  short_hash: string;
  subject: string;
  author: string;
  timestamp: number;
}

export interface GitDiffEntry {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch_preview: string;
}

export const gitService = {
  async getLog(vaultPath: string, filePath: string, limit?: number): Promise<GitCommit[]> {
    return invoke<GitCommit[]>('git_log', { vaultPath, filePath, limit: limit ?? null });
  },

  async getDiff(vaultPath: string, filePath: string, commitHash?: string): Promise<GitDiffEntry> {
    return invoke<GitDiffEntry>('git_diff', { vaultPath, filePath, commitHash: commitHash ?? null });
  },

  async snapshotDocument(vaultPath: string, filePath: string, message?: string): Promise<GitCommit | null> {
    return invoke<GitCommit | null>('git_snapshot_document', {
      vaultPath,
      filePath,
      message: message ?? null,
    });
  },
};
