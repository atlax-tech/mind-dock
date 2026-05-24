import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { notificationService, type Notification } from '@/services/filesystem/notifications';

interface NotificationState {
  notifications: Notification[];
  loading: boolean;
  error: string | null;
  addNotification: (type: string, title: string, content: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  clearAll: () => void;
  loadNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationState | null>(null);

export function useNotifications(): NotificationState {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}

interface NotificationProviderProps {
  vaultPath: string;
  children: ReactNode;
}

export function NotificationProvider({ vaultPath, children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 持久化通知到 vault
  const persistNotifications = useCallback(async (items: Notification[]) => {
    try {
      await notificationService.writeNotifications(vaultPath, items);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, [vaultPath]);

  // 加载通知
  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const items = await notificationService.readNotifications(vaultPath);
      setNotifications(items);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [vaultPath]);

  // vault 就绪后加载通知
  useEffect(() => {
    if (vaultPath) {
      loadNotifications();
    }
  }, [vaultPath, loadNotifications]);

  const addNotification = useCallback((type: string, title: string, content: string) => {
    const newNotification: Notification = {
      id: crypto.randomUUID(),
      notification_type: type,
      title,
      content,
      timestamp: new Date().toISOString(),
      read: false,
    };
    setNotifications(prev => {
      const next = [newNotification, ...prev];
      persistNotifications(next);
      return next;
    });
  }, [persistNotifications]);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => {
      const next = prev.map(n => n.id === id ? { ...n, read: true } : n);
      persistNotifications(next);
      return next;
    });
  }, [persistNotifications]);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, read: true }));
      persistNotifications(next);
      return next;
    });
  }, [persistNotifications]);

  const clearNotification = useCallback((id: string) => {
    setNotifications(prev => {
      const next = prev.filter(n => n.id !== id);
      persistNotifications(next);
      return next;
    });
  }, [persistNotifications]);

  const clearAll = useCallback(() => {
    setNotifications([]);
    persistNotifications([]);
  }, [persistNotifications]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        loading,
        error,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearNotification,
        clearAll,
        loadNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
