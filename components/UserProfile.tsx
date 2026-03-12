/**
 * User Profile Component
 * Clean, mobile-friendly profile display and editing
 */

import React, { useState, useEffect } from 'react';
import { authService, AuthUser } from '../services/authService';
import { User, LogOut, Save, X, MapPin, Trash2, Download, AlertTriangle, Shield, FileText, Mail, Calendar, LinkIcon, Unlink } from 'lucide-react';
import { API_BASE_URL } from '../services/config';
import LegalPage from './LegalPage';
import PersonalitySettings from './PersonalitySettings';
import NotificationsPage from './NotificationsPage';
import { NotificationSettings } from './NotificationSettings';

interface UserProfileProps {
  onClose: () => void;
  onLogout: () => void;
  defaultTab?: 'profile' | 'notifications' | 'preferences';
}

const UserProfile: React.FC<UserProfileProps> = ({ onClose, onLogout, defaultTab }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'preferences'>(defaultTab || 'profile');

  const tabs: { id: 'profile' | 'notifications' | 'preferences'; label: string }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'preferences', label: 'Preferences' }
  ];
  const [user, setUser] = useState<AuthUser | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [state, setState] = useState<'VA' | 'MD' | 'PA' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showLegal, setShowLegal] = useState<'privacy' | 'terms' | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
      setName(currentUser.name);
      setState(currentUser.state);

      // Check Google connection status
      fetch(`${API_BASE_URL}/google/status`, {
        headers: { 'x-user-email': currentUser.email }
      })
        .then(r => r.json())
        .then(data => {
          setGoogleConnected(data.connected || false);
          setGoogleEmail(data.google_email || null);
        })
        .catch(() => {});

      // Handle ?google_connected=1 redirect from OAuth callback
      const params = new URLSearchParams(window.location.search);
      if (params.get('google_connected') === '1') {
        setSuccess('Google account connected!');
        setGoogleConnected(true);
        window.history.replaceState({}, '', window.location.pathname);
        setTimeout(() => setSuccess(''), 4000);
      }
      if (params.get('google_error')) {
        setError(`Google connection failed: ${params.get('google_error')}`);
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);

  const handleSave = async () => {
    if (!user) return;
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const updated = await authService.updateUserProfile({ name, state });
      if (updated) {
        const currentUser = authService.getCurrentUser();
        if (currentUser) {
          setUser(currentUser);
          setSuccess('Profile updated!');
          setEditing(false);
          setTimeout(() => setSuccess(''), 3000);
        }
      } else {
        setError('Failed to update profile.');
      }
    } catch (err) {
      setError('An error occurred.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      authService.logout();
      onLogout();
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/users/me/export`, {
        headers: { 'x-user-email': user?.email || '' }
      });

      if (!response.ok) throw new Error('Failed to export data');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `susan-ai-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setSuccess('Data exported!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to export data.');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      setError('Please type DELETE to confirm');
      return;
    }

    setDeleting(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/users/me`, {
        method: 'DELETE',
        headers: { 'x-user-email': user?.email || '' }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete account');
      }

      authService.logout();
      onLogout();
    } catch (err) {
      setError((err as Error).message);
      setDeleting(false);
    }
  };

  if (!user) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    fontSize: '16px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '10px',
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box'
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-tertiary)',
    marginBottom: '6px'
  };

  const buttonStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px',
    fontSize: '15px',
    fontWeight: '600',
    borderRadius: '10px',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'all 0.2s'
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '20px',
        paddingTop: '60px',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          background: 'var(--bg-primary)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          overflow: 'hidden',
          marginBottom: '40px'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <User style={{ width: '24px', height: '24px', color: '#ffffff' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                {user.name || 'Profile'}
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: '2px 0 0 0' }}>
                {user.role === 'sales_rep' ? 'Sales Rep' : user.role}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X style={{ width: '18px', height: '18px' }} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-default, #262626)' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                background: activeTab === tab.id ? 'var(--roof-red, #dc2626)' : 'var(--bg-hover, #171717)',
                color: 'var(--text-primary, #ffffff)',
                transition: 'all 0.2s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div style={{ flex: 1, overflow: 'auto', maxHeight: 'calc(80vh - 120px)' }}>
            <NotificationsPage userEmail={user?.email} />
          </div>
        )}

        {/* Preferences Tab */}
        {activeTab === 'preferences' && (
          <div style={{ flex: 1, overflow: 'auto', maxHeight: 'calc(80vh - 120px)' }}>
            <NotificationSettings userEmail={user?.email || ''} />
          </div>
        )}

        {/* Profile Tab Content */}
        {activeTab === 'profile' && (
        <div style={{ padding: '20px' }}>
          {/* Messages */}
          {error && (
            <div style={{
              padding: '10px 12px',
              marginBottom: '16px',
              borderRadius: '8px',
              background: 'rgba(220, 38, 38, 0.1)',
              border: '1px solid rgba(220, 38, 38, 0.3)',
              fontSize: '13px',
              color: '#f87171'
            }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{
              padding: '10px 12px',
              marginBottom: '16px',
              borderRadius: '8px',
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              fontSize: '13px',
              color: '#4ade80'
            }}>
              {success}
            </div>
          )}

          {/* Email */}
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={user.email}
              disabled
              style={{ ...inputStyle, color: 'var(--text-tertiary)', cursor: 'not-allowed' }}
            />
          </div>

          {/* Name */}
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!editing}
              style={{
                ...inputStyle,
                border: editing ? '2px solid #dc2626' : '1px solid var(--border-subtle)',
                cursor: editing ? 'text' : 'not-allowed'
              }}
            />
          </div>

          {/* State */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>
              <MapPin style={{ width: '14px', height: '14px', display: 'inline', marginRight: '4px', color: '#dc2626' }} />
              State
            </label>
            <select
              value={state || ''}
              onChange={(e) => setState(e.target.value as 'VA' | 'MD' | 'PA' || null)}
              disabled={!editing}
              style={{
                ...inputStyle,
                border: editing ? '2px solid #dc2626' : '1px solid var(--border-subtle)',
                cursor: editing ? 'pointer' : 'not-allowed'
              }}
            >
              <option value="">Select State</option>
              <option value="VA">Virginia</option>
              <option value="MD">Maryland</option>
              <option value="PA">Pennsylvania</option>
            </select>
          </div>

          {/* Edit / Save Button */}
          {editing ? (
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <button
                onClick={() => { setEditing(false); setName(user.name); setState(user.state); }}
                style={{ ...buttonStyle, flex: 1, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ ...buttonStyle, flex: 1, background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)', color: '#ffffff' }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              style={{ ...buttonStyle, background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)', color: '#ffffff', marginBottom: '16px' }}
            >
              <Save style={{ width: '16px', height: '16px' }} />
              Edit Profile
            </button>
          )}

          {/* Susan Personality Preferences */}
          <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
            <PersonalitySettings />
          </div>

          {/* Google Account Connection */}
          <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Mail style={{ width: '14px', height: '14px', color: '#dc2626' }} />
              Google Account
            </h3>
            {googleConnected ? (
              <>
                <p style={{ fontSize: '13px', color: '#4ade80', marginBottom: '4px' }}>
                  Connected as <strong>{googleEmail}</strong>
                </p>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
                  Susan can send emails and manage your calendar.
                </p>
                <button
                  onClick={async () => {
                    setGoogleLoading(true);
                    try {
                      await fetch(`${API_BASE_URL}/google/disconnect`, {
                        method: 'POST',
                        headers: { 'x-user-email': user?.email || '' }
                      });
                      setGoogleConnected(false);
                      setGoogleEmail(null);
                      setSuccess('Google account disconnected.');
                      setTimeout(() => setSuccess(''), 3000);
                    } catch {
                      setError('Failed to disconnect Google.');
                    } finally {
                      setGoogleLoading(false);
                    }
                  }}
                  disabled={googleLoading}
                  style={{ ...buttonStyle, background: 'var(--bg-secondary)', color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)', padding: '10px', fontSize: '13px' }}
                >
                  <Unlink style={{ width: '14px', height: '14px' }} />
                  {googleLoading ? 'Disconnecting...' : 'Disconnect Google'}
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
                  Connect your Google account so Susan can send emails and create calendar events on your behalf.
                </p>
                <button
                  onClick={async () => {
                    setGoogleLoading(true);
                    try {
                      const res = await fetch(`${API_BASE_URL}/google/auth-url`, {
                        headers: { 'x-user-email': user?.email || '' }
                      });
                      const data = await res.json();
                      if (data.url) {
                        window.location.href = data.url;
                      } else {
                        setError('Failed to generate Google auth URL.');
                      }
                    } catch {
                      setError('Failed to connect Google.');
                    } finally {
                      setGoogleLoading(false);
                    }
                  }}
                  disabled={googleLoading}
                  style={{ ...buttonStyle, background: 'linear-gradient(135deg, #4285f4 0%, #1a73e8 100%)', color: '#ffffff', padding: '10px', fontSize: '13px' }}
                >
                  <LinkIcon style={{ width: '14px', height: '14px' }} />
                  {googleLoading ? 'Connecting...' : 'Connect Google Account'}
                </button>
              </>
            )}
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            style={{ ...buttonStyle, background: 'var(--bg-secondary)', color: '#dc2626', border: '1px solid var(--border-subtle)', marginBottom: '24px' }}
          >
            <LogOut style={{ width: '16px', height: '16px' }} />
            Logout
          </button>

          {/* Divider */}
          <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '0 -20px 20px' }} />

          {/* Data Section */}
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Download style={{ width: '14px', height: '14px', color: '#dc2626' }} />
            Your Data
          </h3>
          <button
            onClick={handleExportData}
            disabled={exporting}
            style={{ ...buttonStyle, background: 'var(--bg-secondary)', color: '#dc2626', border: '1px solid var(--border-subtle)', marginBottom: '8px' }}
          >
            <Download style={{ width: '16px', height: '16px' }} />
            {exporting ? 'Exporting...' : 'Export Data'}
          </button>
          <p style={{ fontSize: '12px', color: 'var(--text-disabled)', marginBottom: '20px' }}>
            Download your data (GDPR/CCPA)
          </p>

          {/* Danger Zone */}
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#dc2626', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle style={{ width: '14px', height: '14px' }} />
            Danger Zone
          </h3>

          {showDeleteConfirm ? (
            <div style={{ background: 'var(--bg-secondary)', borderRadius: '10px', padding: '14px', border: '1px solid var(--border-subtle)' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
                Type <strong style={{ color: '#dc2626' }}>DELETE</strong> to confirm:
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE"
                style={{ ...inputStyle, marginBottom: '12px', fontSize: '14px' }}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                  style={{ ...buttonStyle, flex: 1, background: 'var(--bg-card)', color: 'var(--text-primary)', padding: '10px' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  style={{ ...buttonStyle, flex: 1, background: '#dc2626', color: '#ffffff', padding: '10px' }}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{ ...buttonStyle, background: 'var(--bg-secondary)', color: '#dc2626', border: '1px solid var(--border-subtle)' }}
            >
              <Trash2 style={{ width: '16px', height: '16px' }} />
              Delete Account
            </button>
          )}

          {/* Divider */}
          <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '20px -20px' }} />

          {/* Legal */}
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText style={{ width: '14px', height: '14px', color: '#dc2626' }} />
            Legal
          </h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setShowLegal('privacy')}
              style={{ ...buttonStyle, flex: 1, background: 'var(--bg-secondary)', color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)', padding: '10px', fontSize: '13px' }}
            >
              Privacy
            </button>
            <button
              onClick={() => setShowLegal('terms')}
              style={{ ...buttonStyle, flex: 1, background: 'var(--bg-secondary)', color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)', padding: '10px', fontSize: '13px' }}
            >
              Terms
            </button>
          </div>

          {/* Footer Info */}
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <p style={{ fontSize: '11px', color: 'var(--text-disabled)' }}>
              Member since {new Date(user.createdAt || Date.now()).toLocaleDateString()}
            </p>
          </div>
        </div>
        )}
      </div>

      {/* Legal Modal */}
      {showLegal && (
        <LegalPage
          initialTab={showLegal}
          onClose={() => setShowLegal(null)}
        />
      )}
    </div>
  );
};

export default UserProfile;
