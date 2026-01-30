/**
 * usePushNotifications Hook
 *
 * React hook for managing push notifications in the app.
 * Handles permission requests, token registration, and notification listeners.
 *
 * Usage:
 * ```tsx
 * const { isSupported, permission, requestPermission, sendTest } = usePushNotifications(userEmail);
 *
 * // Request permission on button click
 * <button onClick={requestPermission}>Enable Notifications</button>
 *
 * // Check status
 * if (permission === 'granted') { ... }
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import {
  isPushSupported,
  checkPermission,
  requestPermission as requestPushPermission,
  registerForPush,
  setupNotificationListeners,
  handleNotificationData,
  sendTestNotification,
  getNotificationPreferences,
  updateNotificationPreferences,
  NotificationPreferences
} from '../services/pushNotificationApi';

interface UsePushNotificationsResult {
  // Status
  isSupported: boolean;
  isLoading: boolean;
  permission: 'granted' | 'denied' | 'default' | 'unknown';
  deviceToken: string | null;
  error: string | null;

  // Preferences
  preferences: NotificationPreferences | null;

  // Actions
  requestPermission: () => Promise<boolean>;
  sendTest: () => Promise<boolean>;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => Promise<boolean>;
  refreshPreferences: () => Promise<void>;
}

export const usePushNotifications = (userEmail: string | null): UsePushNotificationsResult => {
  const [isSupported, setIsSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'default' | 'unknown'>('unknown');
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);

  // Check support and permission on mount
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Check if push is supported
        const supported = isPushSupported();
        setIsSupported(supported);

        if (!supported) {
          setIsLoading(false);
          return;
        }

        // Check current permission
        const currentPermission = await checkPermission();
        setPermission(currentPermission);

        // If already granted and we have a user, auto-register
        if (currentPermission === 'granted' && userEmail) {
          const token = await registerForPush(userEmail);
          setDeviceToken(token);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [userEmail]);

  // Set up notification listeners when we have permission
  useEffect(() => {
    if (permission !== 'granted' || !userEmail) return;

    const setupListeners = async () => {
      await setupNotificationListeners(
        // On notification received (foreground)
        (notification) => {
          console.log('Notification received in foreground:', notification);
          // Could show a toast/banner here
        },
        // On notification tapped
        (notification) => {
          console.log('Notification tapped:', notification);
          if (notification.data) {
            handleNotificationData(notification.data);
          }
        }
      );
    };

    setupListeners();
  }, [permission, userEmail]);

  // Load preferences when we have a user
  useEffect(() => {
    if (!userEmail) return;

    const loadPreferences = async () => {
      const prefs = await getNotificationPreferences(userEmail);
      setPreferences(prefs);
    };

    loadPreferences();
  }, [userEmail]);

  // Request permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!userEmail) {
      setError('User email required');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await requestPushPermission();
      setPermission(result);

      if (result === 'granted') {
        // Register for push and get token
        const token = await registerForPush(userEmail);
        setDeviceToken(token);
        return true;
      }

      return false;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [userEmail]);

  // Send test notification
  const sendTest = useCallback(async (): Promise<boolean> => {
    if (!userEmail) {
      setError('User email required');
      return false;
    }

    try {
      return await sendTestNotification(userEmail);
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  }, [userEmail]);

  // Update preferences
  const updatePrefs = useCallback(async (prefs: Partial<NotificationPreferences>): Promise<boolean> => {
    if (!userEmail) {
      setError('User email required');
      return false;
    }

    try {
      const success = await updateNotificationPreferences(userEmail, prefs);
      if (success) {
        // Refresh preferences
        const updated = await getNotificationPreferences(userEmail);
        setPreferences(updated);
      }
      return success;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  }, [userEmail]);

  // Refresh preferences
  const refreshPreferences = useCallback(async (): Promise<void> => {
    if (!userEmail) return;
    const prefs = await getNotificationPreferences(userEmail);
    setPreferences(prefs);
  }, [userEmail]);

  return {
    isSupported,
    isLoading,
    permission,
    deviceToken,
    error,
    preferences,
    requestPermission,
    sendTest,
    updatePreferences: updatePrefs,
    refreshPreferences
  };
};

export default usePushNotifications;
