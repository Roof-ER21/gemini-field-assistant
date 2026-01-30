/**
 * Notification Settings Component
 *
 * Allows users to:
 * - Enable/disable push notifications
 * - Configure notification preferences
 * - Set quiet hours
 * - Send test notifications
 */

import React, { useState } from 'react';
import { Bell, BellOff, CloudLightning, Users, MapPin, Clock, TestTube, Check, X, Loader2 } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';

interface NotificationSettingsProps {
  userEmail: string;
  onClose?: () => void;
}

export const NotificationSettings: React.FC<NotificationSettingsProps> = ({ userEmail, onClose }) => {
  const {
    isSupported,
    isLoading,
    permission,
    deviceToken,
    error,
    preferences,
    requestPermission,
    sendTest,
    updatePreferences
  } = usePushNotifications(userEmail);

  const [testSent, setTestSent] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleRequestPermission = async () => {
    const success = await requestPermission();
    if (success) {
      console.log('Push notifications enabled!');
    }
  };

  const handleSendTest = async () => {
    setTestLoading(true);
    const success = await sendTest();
    setTestLoading(false);
    if (success) {
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3000);
    }
  };

  const handleTogglePreference = async (key: string, value: boolean) => {
    setSaving(true);
    await updatePreferences({ [key]: value });
    setSaving(false);
  };

  if (!isSupported) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center gap-3 text-yellow-400">
          <BellOff className="w-6 h-6" />
          <div>
            <h3 className="font-semibold">Push Notifications Not Supported</h3>
            <p className="text-sm text-gray-400 mt-1">
              Your device or browser doesn't support push notifications.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Notification Settings</h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="p-4 space-y-6">
        {/* Permission Status */}
        {permission !== 'granted' ? (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Bell className="w-5 h-5 text-blue-400 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-medium text-white">Enable Push Notifications</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Get alerts when storms hit your territory, team mentions you, or customer properties are impacted.
                </p>
                <button
                  onClick={handleRequestPermission}
                  disabled={isLoading}
                  className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Bell className="w-4 h-4" />
                  )}
                  {permission === 'denied' ? 'Notifications Blocked' : 'Enable Notifications'}
                </button>
                {permission === 'denied' && (
                  <p className="text-xs text-yellow-400 mt-2">
                    Notifications are blocked. Please enable them in your device settings.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Enabled Status */}
            <div className="flex items-center gap-3 text-green-400">
              <Check className="w-5 h-5" />
              <span className="text-sm">Push notifications enabled</span>
              {deviceToken && (
                <span className="text-xs text-gray-500 ml-auto">
                  Token: ...{deviceToken.slice(-8)}
                </span>
              )}
            </div>

            {/* Notification Types */}
            {preferences && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-300">Notification Types</h3>

                {/* Storm Alerts */}
                <ToggleItem
                  icon={<CloudLightning className="w-4 h-4" />}
                  label="Storm Alerts"
                  description="Get notified when storms hit your territory"
                  enabled={preferences.stormAlertsEnabled}
                  onChange={(v) => handleTogglePreference('stormAlertsEnabled', v)}
                  disabled={saving}
                />

                {/* Impact Alerts */}
                <ToggleItem
                  icon={<MapPin className="w-4 h-4" />}
                  label="Impact Alerts"
                  description="Alerts when customer properties are affected"
                  enabled={preferences.impactAlertsEnabled}
                  onChange={(v) => handleTogglePreference('impactAlertsEnabled', v)}
                  disabled={saving}
                />

                {/* Team Mentions */}
                <ToggleItem
                  icon={<Users className="w-4 h-4" />}
                  label="Team Mentions"
                  description="When someone mentions you in team feed"
                  enabled={preferences.teamMentionAlerts}
                  onChange={(v) => handleTogglePreference('teamMentionAlerts', v)}
                  disabled={saving}
                />

                {/* Team Messages */}
                <ToggleItem
                  icon={<Users className="w-4 h-4" />}
                  label="Team Messages"
                  description="New messages in team feed"
                  enabled={preferences.teamMessageAlerts}
                  onChange={(v) => handleTogglePreference('teamMessageAlerts', v)}
                  disabled={saving}
                />
              </div>
            )}

            {/* Quiet Hours */}
            {preferences && (
              <div className="space-y-3 pt-4 border-t border-gray-700">
                <ToggleItem
                  icon={<Clock className="w-4 h-4" />}
                  label="Quiet Hours"
                  description="Pause notifications during specific hours"
                  enabled={preferences.quietHoursEnabled}
                  onChange={(v) => handleTogglePreference('quietHoursEnabled', v)}
                  disabled={saving}
                />

                {preferences.quietHoursEnabled && (
                  <div className="ml-8 flex items-center gap-4 text-sm">
                    <div>
                      <label className="text-gray-400 text-xs">From</label>
                      <input
                        type="time"
                        value={preferences.quietHoursStart || '22:00'}
                        onChange={(e) => handleTogglePreference('quietHoursStart', e.target.value as any)}
                        className="block mt-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-gray-400 text-xs">To</label>
                      <input
                        type="time"
                        value={preferences.quietHoursEnd || '07:00'}
                        onChange={(e) => handleTogglePreference('quietHoursEnd', e.target.value as any)}
                        className="block mt-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Test Notification */}
            <div className="pt-4 border-t border-gray-700">
              <button
                onClick={handleSendTest}
                disabled={testLoading}
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {testLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : testSent ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <TestTube className="w-4 h-4" />
                )}
                {testSent ? 'Test Sent!' : 'Send Test Notification'}
              </button>
            </div>
          </>
        )}

        {/* Error Display */}
        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

// Toggle Item Component
interface ToggleItemProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

const ToggleItem: React.FC<ToggleItemProps> = ({
  icon,
  label,
  description,
  enabled,
  onChange,
  disabled
}) => {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <span className="text-gray-400">{icon}</span>
        <div>
          <div className="text-sm font-medium text-white">{label}</div>
          <div className="text-xs text-gray-400">{description}</div>
        </div>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        disabled={disabled}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          enabled ? 'bg-blue-600' : 'bg-gray-600'
        } ${disabled ? 'opacity-50' : ''}`}
      >
        <span
          className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
            enabled ? 'left-6' : 'left-1'
          }`}
        />
      </button>
    </div>
  );
};

export default NotificationSettings;
