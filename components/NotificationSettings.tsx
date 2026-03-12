/**
 * Notification Settings Component
 *
 * Allows users to:
 * - Enable/disable push notifications
 * - Configure notification preferences
 * - Set quiet hours
 * - Send test notifications
 * - Set up SMS text alerts
 */

import React, { useState, useEffect } from 'react';
import { Bell, BellOff, CloudLightning, Users, MapPin, Clock, TestTube, Check, X, Loader2, Smartphone, MessageSquare } from 'lucide-react';
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

  // SMS phone number state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(true);

  const API_URL = import.meta.env.VITE_API_URL || '';

  // Load phone number on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/push/phone`, {
          headers: { 'x-user-email': userEmail }
        });
        if (res.ok) {
          const data = await res.json();
          setPhoneNumber(data.phone_number || '');
          setSmsEnabled(data.sms_enabled || false);
        }
      } catch {}
      setPhoneLoading(false);
    })();
  }, [userEmail]);

  const handleSavePhone = async () => {
    setPhoneSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/push/phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-email': userEmail },
        body: JSON.stringify({ phone_number: phoneNumber, sms_enabled: smsEnabled })
      });
      if (res.ok) {
        setPhoneSaved(true);
        setTimeout(() => setPhoneSaved(false), 3000);
      }
    } catch {}
    setPhoneSaving(false);
  };

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
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '12px',
        padding: '24px',
        border: '1px solid var(--border-default)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--warning)' }}>
          <BellOff style={{ width: '24px', height: '24px' }} />
          <div>
            <h3 style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: '15px' }}>
              Push Notifications Not Supported
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Your device or browser doesn't support push notifications.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '12px',
      border: '1px solid var(--border-default)',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.05))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Bell style={{ width: '18px', height: '18px', color: 'var(--roof-blue)' }} />
          </div>
          <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Notification Settings
          </h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X style={{ width: '18px', height: '18px' }} />
          </button>
        )}
      </div>

      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Permission Status */}
        {permission !== 'granted' ? (
          <div style={{
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: '10px',
            padding: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <Bell style={{ width: '20px', height: '20px', color: 'var(--roof-blue)', marginTop: '2px', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>
                  Enable Push Notifications
                </h3>
                <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Get alerts when storms hit your territory, team mentions you, or customer properties are impacted.
                </p>
                <button
                  onClick={handleRequestPermission}
                  disabled={isLoading}
                  style={{
                    marginTop: '12px',
                    padding: '8px 18px',
                    background: permission === 'denied' ? 'var(--bg-elevated)' : 'var(--roof-blue)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: isLoading ? 'default' : 'pointer',
                    fontSize: '13px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    opacity: isLoading ? 0.5 : 1
                  }}
                >
                  {isLoading ? (
                    <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <Bell style={{ width: '16px', height: '16px' }} />
                  )}
                  {permission === 'denied' ? 'Notifications Blocked' : 'Enable Notifications'}
                </button>
                {permission === 'denied' && (
                  <p style={{ margin: '8px 0 0', fontSize: '11px', color: 'var(--warning)' }}>
                    Notifications are blocked. Please enable them in your device settings.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Enabled Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--success)' }}>
              <Check style={{ width: '18px', height: '18px' }} />
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Push notifications enabled</span>
              {deviceToken && (
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                  Registered
                </span>
              )}
            </div>

            {/* Notification Types */}
            {preferences && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Notification Types
                </h3>

                <ToggleItem
                  icon={<CloudLightning style={{ width: '16px', height: '16px' }} />}
                  label="Storm Alerts"
                  description="Get notified when storms hit your territory"
                  enabled={preferences.stormAlertsEnabled}
                  onChange={(v) => handleTogglePreference('stormAlertsEnabled', v)}
                  disabled={saving}
                />

                <ToggleItem
                  icon={<MapPin style={{ width: '16px', height: '16px' }} />}
                  label="Impact Alerts"
                  description="Alerts when customer properties are affected"
                  enabled={preferences.impactAlertsEnabled}
                  onChange={(v) => handleTogglePreference('impactAlertsEnabled', v)}
                  disabled={saving}
                />

                <ToggleItem
                  icon={<Users style={{ width: '16px', height: '16px' }} />}
                  label="Team Mentions"
                  description="When someone mentions you in team feed"
                  enabled={preferences.teamMentionAlerts}
                  onChange={(v) => handleTogglePreference('teamMentionAlerts', v)}
                  disabled={saving}
                />

                <ToggleItem
                  icon={<Users style={{ width: '16px', height: '16px' }} />}
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
              <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <ToggleItem
                  icon={<Clock style={{ width: '16px', height: '16px' }} />}
                  label="Quiet Hours"
                  description="Pause notifications during specific hours"
                  enabled={preferences.quietHoursEnabled}
                  onChange={(v) => handleTogglePreference('quietHoursEnabled', v)}
                  disabled={saving}
                />

                {preferences.quietHoursEnabled && (
                  <div style={{ marginLeft: '40px', display: 'flex', alignItems: 'center', gap: '16px', padding: '8px 0' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px' }}>From</label>
                      <input
                        type="time"
                        value={preferences.quietHoursStart || '22:00'}
                        onChange={(e) => handleTogglePreference('quietHoursStart', e.target.value as any)}
                        style={{
                          padding: '6px 10px',
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border-default)',
                          borderRadius: '8px',
                          color: 'var(--text-primary)',
                          fontSize: '13px'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px' }}>To</label>
                      <input
                        type="time"
                        value={preferences.quietHoursEnd || '07:00'}
                        onChange={(e) => handleTogglePreference('quietHoursEnd', e.target.value as any)}
                        style={{
                          padding: '6px 10px',
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border-default)',
                          borderRadius: '8px',
                          color: 'var(--text-primary)',
                          fontSize: '13px'
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Test Notification */}
            <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '20px' }}>
              <button
                onClick={handleSendTest}
                disabled={testLoading}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-elevated)',
                  color: testSent ? 'var(--success)' : 'var(--text-primary)',
                  cursor: testLoading ? 'default' : 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: testLoading ? 0.5 : 1,
                  transition: 'all 0.2s'
                }}
              >
                {testLoading ? (
                  <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                ) : testSent ? (
                  <Check style={{ width: '16px', height: '16px' }} />
                ) : (
                  <TestTube style={{ width: '16px', height: '16px' }} />
                )}
                {testSent ? 'Test Sent!' : 'Send Test Notification'}
              </button>
            </div>
          </>
        )}

        {/* SMS Fallback Section */}
        <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(74, 222, 128, 0.15), rgba(74, 222, 128, 0.05))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <MessageSquare style={{ width: '18px', height: '18px', color: 'var(--success)' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                SMS Text Alerts
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Get notifications via text message — works even without push enabled
              </p>
            </div>
          </div>

          {phoneLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px', marginLeft: '48px' }}>
              <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Loading...
            </div>
          ) : (
            <div style={{ marginLeft: '48px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Smartphone style={{ width: '16px', height: '16px', color: 'var(--text-tertiary)', flexShrink: 0 }} />
                <input
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 14px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '13px'
                  }}
                />
              </div>

              <ToggleItem
                icon={<MessageSquare style={{ width: '16px', height: '16px' }} />}
                label="Enable SMS Alerts"
                description="Receive storm, team, and event alerts via text"
                enabled={smsEnabled}
                onChange={(v) => setSmsEnabled(v)}
                disabled={!phoneNumber}
              />

              <button
                onClick={handleSavePhone}
                disabled={phoneSaving}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: phoneSaved ? 'var(--success)' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                  color: 'white',
                  cursor: phoneSaving ? 'default' : 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: phoneSaving ? 0.5 : 1,
                  transition: 'all 0.2s',
                  alignSelf: 'flex-start'
                }}
              >
                {phoneSaving ? (
                  <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                ) : phoneSaved ? (
                  <Check style={{ width: '16px', height: '16px' }} />
                ) : (
                  <Smartphone style={{ width: '16px', height: '16px' }} />
                )}
                {phoneSaved ? 'Saved!' : 'Save Phone Number'}
              </button>
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div style={{
            padding: '12px 14px',
            borderRadius: '10px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: 'var(--error)',
            fontSize: '13px'
          }}>
            {error}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
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
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 12px',
      borderRadius: '8px',
      background: enabled ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
      transition: 'background 0.2s'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ color: enabled ? 'var(--roof-blue)' : 'var(--text-tertiary)', display: 'flex' }}>{icon}</span>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>{description}</div>
        </div>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        disabled={disabled}
        style={{
          position: 'relative',
          width: '44px',
          height: '24px',
          borderRadius: '12px',
          border: 'none',
          background: enabled ? 'var(--roof-red)' : 'var(--bg-hover)',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.4 : 1,
          transition: 'background 0.2s',
          flexShrink: 0
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '3px',
            left: enabled ? '23px' : '3px',
            width: '18px',
            height: '18px',
            background: 'white',
            borderRadius: '50%',
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px var(--bg-hover)'
          }}
        />
      </button>
    </div>
  );
};

export default NotificationSettings;
