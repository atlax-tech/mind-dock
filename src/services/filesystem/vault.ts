import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { VaultInfo, DocEntry } from '@/types/vault';

export interface VaultValidationResult {
  valid: boolean;
  error: string | null;
}

export const vaultService = {
  async createVault(path: string): Promise<VaultInfo> {
    return invoke<VaultInfo>('create_vault', { path });
  },

  async selectVault(path: string): Promise<VaultInfo> {
    return invoke<VaultInfo>('select_vault', { path });
  },

  async getLastVaultPath(): Promise<string | null> {
    return invoke<string | null>('get_last_vault_path');
  },

  async setLastVaultPath(path: string): Promise<void> {
    return invoke('set_last_vault_path', { path });
  },

  async scanVaultFiles(vaultPath: string): Promise<DocEntry[]> {
    return invoke<DocEntry[]>('scan_vault_files', { vaultPath });
  },

  async validateVault(path: string): Promise<VaultValidationResult> {
    return invoke<VaultValidationResult>('validate_vault', { path });
  },

  async pickDirectory(): Promise<string | null> {
    const selected = await open({
      directory: true,
      multiple: false,
      title: '选择 Vault 目录',
    });
    return selected as string | null;
  },
};
