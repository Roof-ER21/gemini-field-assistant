/**
 * Push Notification API Service (Frontend)
 *
 * Handles push notification registration, permissions, and token management
 * for iOS/Android via Capacitor and web browsers.
 */

import { Capacitor } from '@capacitor/core';

// API base URL
const API_URL = import.meta.env.VITE_API_URL || '';

interface PushToken {
  id: string;
  userId: string;
  deviceToken: string;
  deviceType: 'ios' | 'android' | 'web';
  deviceName?: string;
  isActive: boolean;
  notificationsEnabled: boolean;
  createdAt: string;
}

export interface NotificationPreferences {
  allNotificationsEnabled: boolean;
  stormAlertsEnabled: boolean;
  impactAlertsEnabled: boolean;
  teamMentionAlerts: boolean;
  teamMessageAlerts: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone: string;
}

interface PushNotificationData {
  type: string;
  [key: string]: string;
}

// Store registered listeners
let notificationListeners: Array<(notification: any) => void> = [];

/**
 * Check if push notifications are supported
 */
export const isPushSupported = (): boolean => {
  const platform = Capacitor.getPlatform();

  // Native platforms always support push (if plugin is installed)
  if (platform === 'ios' || platform === 'android') {
    return true;
  }

  // Web supports push if browser supports it
  if (platform === 'web') {
    return 'Notification' in window && 'serviceWorker' in navigator;
  }

  return false;
};

/**
 * Get current device type
 */
export const getDeviceType = (): 'ios' | 'android' | 'web' => {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios') return 'ios';
  if (platform === 'android') return 'android';
  return 'web';
};

/**
 * Request notification permission
 */
export const requestPermission = async (): Promise<'granted' | 'denied' | 'default'> => {
  try {
    const platform = Capacitor.getPlatform();

    if (platform === 'ios' || platform === 'android') {
      // Use Capacitor Push Notifications plugin
      const { PushNotifications } = await import('@capacitor/push-notifications');

      const result = await PushNotifications.requestPermissions();

      if (result.receive === 'granted') {
        return 'granted';
      } else if (result.receive === 'denied') {
        return 'denied';
      }
      return 'default';
    } else {
      // Web notifications
      const result = await Notification.requestPermission();
      return result;
    }
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return 'denied';
  }
};

/**
 * Check current permission status
 */
export const checkPermission = async (): Promise<'granted' | 'denied' | 'default'> => {
  try {
    const platform = Capacitor.getPlatform();

    if (platform === 'ios' || platform === 'android') {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const result = await PushNotifications.checkPermissions();

      if (result.receive === 'granted') return 'granted';
      if (result.receive === 'denied') return 'denied';
      return 'default';
    } else {
      return Notification.permission;
    }
  } catch (error) {
    console.error('Error checking permission:', error);
    return 'default';
  }
};

/**
 * Register for push notifications and get device token
 */
export const registerForPush = async (userEmail: string): Promise<string | null> => {
  try {
    const platform = Capacitor.getPlatform();

    if (platform === 'ios' || platform === 'android') {
      const { PushNotifications } = await import('@capacitor/push-notifications');

      // Register with APNs/FCM
      await PushNotifications.register();

      // Wait for registration to complete
      return new Promise((resolve) => {
        // Listen for registration success
        PushNotifications.addListener('registration', async (token) => {
          console.log('Push registration success, token:', token.value);

          // Send token to our backend
          const savedToken = await saveTokenToBackend(
            userEmail,
            token.value,
            getDeviceType()
          );

          resolve(savedToken ? token.value : null);
        });

        // Listen for registration errors
        PushNotifications.addListener('registrationError', (error) => {
          console.error('Push registration failed:', error);
          resolve(null);
        });
      });
    } else {
      // Web push - would need a service worker and VAPID keys
      console.log('Web push notifications not yet implemented');
      return null;
    }
  } catch (error) {
    console.error('Error registering for push:', error);
    return null;
  }
};

/**
 * Save token to backend
 */
const saveTokenToBackend = async (
  userEmail: string,
  deviceToken: string,
  deviceType: 'ios' | 'android' | 'web'
): Promise<PushToken | null> => {
  try {
    const response = await fetch(`${API_URL}/api/push/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-email': userEmail
      },
      body: JSON.stringify({
        deviceToken,
        deviceType,
        deviceName: getDeviceName()
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to register token: ${response.statusText}`);
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error('Error saving token to backend:', error);
    return null;
  }
};

/**
 * Get device name
 */
const getDeviceName = (): string => {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios') return 'iOS Device';
  if (platform === 'android') return 'Android Device';
  return navigator.userAgent.includes('Mobile') ? 'Mobile Browser' : 'Desktop Browser';
};

/**
 * Remove token from backend (on logout)
 */
export const unregisterPush = async (userEmail: string, deviceToken: string): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/api/push/token`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-user-email': userEmail
      },
      body: JSON.stringify({ deviceToken })
    });

    return response.ok;
  } catch (error) {
    console.error('Error unregistering push:', error);
    return false;
  }
};

/**
 * Set up notification listeners
 */
export const setupNotificationListeners = async (
  onNotificationReceived: (notification: any) => void,
  onNotificationTapped: (notification: any) => void
): Promise<void> => {
  try {
    const platform = Capacitor.getPlatform();

    if (platform === 'ios' || platform === 'android') {
      const { PushNotifications } = await import('@capacitor/push-notifications');

      // Notification received while app is in foreground
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push notification received:', notification);
        onNotificationReceived(notification);
      });

      // User tapped on notification
      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('Push notification action:', action);
        onNotificationTapped(action.notification);
      });
    }
  } catch (error) {
    console.error('Error setting up notification listeners:', error);
  }
};

/**
 * Get notification preferences
 */
export const getNotificationPreferences = async (userEmail: string): Promise<NotificationPreferences | null> => {
  try {
    const response = await fetch(`${API_URL}/api/push/preferences`, {
      headers: {
        'x-user-email': userEmail
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get preferences: ${response.statusText}`);
    }

    const data = await response.json();
    return data.preferences;
  } catch (error) {
    console.error('Error getting notification preferences:', error);
    return null;
  }
};

/**
 * Update notification preferences
 */
export const updateNotificationPreferences = async (
  userEmail: string,
  preferences: Partial<NotificationPreferences>
): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/api/push/preferences`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-email': userEmail
      },
      body: JSON.stringify(preferences)
    });

    return response.ok;
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    return false;
  }
};

/**
 * Send a test notification
 */
export const sendTestNotification = async (userEmail: string): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/api/push/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-email': userEmail
      },
      body: JSON.stringify({
        title: 'Test Notification',
        body: 'Push notifications are working!'
      })
    });

    return response.ok;
  } catch (error) {
    console.error('Error sending test notification:', error);
    return false;
  }
};

/**
 * Handle notification data based on type
 */
export const handleNotificationData = (data: PushNotificationData): void => {
  switch (data.type) {
    case 'storm_alert':
      // Navigate to storm/map view
      window.location.hash = `#maps?lat=${data.latitude}&lng=${data.longitude}`;
      break;
    case 'impact_alert':
      // Navigate to impacted assets
      window.location.hash = '#impacted-assets';
      break;
    case 'team_mention':
      // Navigate to team feed
      if (data.postId) {
        window.location.hash = `#live?post=${data.postId}`;
      } else {
        window.location.hash = '#live';
      }
      break;
    case 'territory_alert':
      // Navigate to territories
      window.location.hash = '#territories';
      break;
    default:
      console.log('Unknown notification type:', data.type);
  }
};
