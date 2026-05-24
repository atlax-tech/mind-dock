import { invoke } from '@tauri-apps/api/core';

export interface Notification {
  id: string;
  notification_type: string;
  title: string;
  content: string;
  timestamp: string;
  read: boolean;
}

export const notificationService = {
  async readNotifications(vaultPath: string): Promise<Notification[]> {
    return invoke<Notification[]>('read_notifications', { vaultPath });
  },

  async writeNotifications(vaultPath: string, notifications: Notification[]): Promise<void> {
    return invoke('write_notifications', { vaultPath, notifications });
  },
};
