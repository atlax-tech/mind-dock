import { invoke } from '@tauri-apps/api/core';

export interface OnboardingStatus {
  status: 'pending' | 'completed' | 'skipped';
  completed_at: string | null;
  skipped_at: string | null;
}

export const onboardingService = {
  async readStatus(vaultPath: string): Promise<OnboardingStatus> {
    return invoke<OnboardingStatus>('read_onboarding_status', { vaultPath });
  },

  async writeStatus(vaultPath: string, status: string): Promise<void> {
    return invoke('write_onboarding_status', { vaultPath, status });
  },

  async resetStatus(vaultPath: string): Promise<void> {
    return invoke('write_onboarding_status', { vaultPath, status: 'pending' });
  },
};
