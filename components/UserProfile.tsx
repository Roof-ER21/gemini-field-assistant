/**
 * User Profile Component
 * Clean, mobile-friendly profile display and editing
 */

import React, { useState, useEffect } from 'react';
import { authService, AuthUser } from '../services/authService';
import { User, LogOut, Save, X, MapPin, Trash2, Download, AlertTriangle, Shield, FileText } from 'lucide-react';
import { API_BASE_URL } from '../services/config';
import LegalPage from './LegalPage';

interface UserProfileProps {
  onClose: () => void;
  onLogout: () => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ onClose, onLogout }) => {
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

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
      setName(currentUser.name);
      setState(currentUser.state);
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
    background: '#171717',
    border: '1px solid #262626',
    borderRadius: '10px',
    color: '#ffffff',
    outline: 'none',
    boxSizing: 'border-box'
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: '#a1a1aa',
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
        background: 'rgba(0, 0, 0, 0.9)',
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
          background: '#0a0a0a',
          borderRadius: '16px',
          border: '1px solid #262626',
          overflow: 'hidden',
          marginBottom: '40px'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px',
            borderBottom: '1px solid #262626',
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
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#ffffff', margin: 0 }}>
                {user.name || 'Profile'}
              </h2>
              <p style={{ fontSize: '13px', color: '#71717a', margin: '2px 0 0 0' }}>
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
              background: '#171717',
              border: '1px solid #262626',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X style={{ width: '18px', height: '18px' }} />
          </button>
        </div>

        {/* Content */}
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
              style={{ ...inputStyle, color: '#71717a', cursor: 'not-allowed' }}
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
                border: editing ? '2px solid #dc2626' : '1px solid #262626',
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
                border: editing ? '2px solid #dc2626' : '1px solid #262626',
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
                style={{ ...buttonStyle, flex: 1, background: '#171717', color: '#ffffff', border: '1px solid #262626' }}
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

          {/* Logout */}
          <button
            onClick={handleLogout}
            style={{ ...buttonStyle, background: '#171717', color: '#dc2626', border: '1px solid #262626', marginBottom: '24px' }}
          >
            <LogOut style={{ width: '16px', height: '16px' }} />
            Logout
          </button>

          {/* Divider */}
          <div style={{ height: '1px', background: '#262626', margin: '0 -20px 20px' }} />

          {/* Data Section */}
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Download style={{ width: '14px', height: '14px', color: '#dc2626' }} />
            Your Data
          </h3>
          <button
            onClick={handleExportData}
            disabled={exporting}
            style={{ ...buttonStyle, background: '#171717', color: '#dc2626', border: '1px solid #262626', marginBottom: '8px' }}
          >
            <Download style={{ width: '16px', height: '16px' }} />
            {exporting ? 'Exporting...' : 'Export Data'}
          </button>
          <p style={{ fontSize: '12px', color: '#52525b', marginBottom: '20px' }}>
            Download your data (GDPR/CCPA)
          </p>

          {/* Danger Zone */}
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#dc2626', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle style={{ width: '14px', height: '14px' }} />
            Danger Zone
          </h3>

          {showDeleteConfirm ? (
            <div style={{ background: '#171717', borderRadius: '10px', padding: '14px', border: '1px solid #262626' }}>
              <p style={{ fontSize: '13px', color: '#a1a1aa', marginBottom: '12px' }}>
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
                  style={{ ...buttonStyle, flex: 1, background: '#262626', color: '#ffffff', padding: '10px' }}
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
              style={{ ...buttonStyle, background: '#171717', color: '#dc2626', border: '1px solid #262626' }}
            >
              <Trash2 style={{ width: '16px', height: '16px' }} />
              Delete Account
            </button>
          )}

          {/* Divider */}
          <div style={{ height: '1px', background: '#262626', margin: '20px -20px' }} />

          {/* Legal */}
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText style={{ width: '14px', height: '14px', color: '#dc2626' }} />
            Legal
          </h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setShowLegal('privacy')}
              style={{ ...buttonStyle, flex: 1, background: '#171717', color: '#a1a1aa', border: '1px solid #262626', padding: '10px', fontSize: '13px' }}
            >
              Privacy
            </button>
            <button
              onClick={() => setShowLegal('terms')}
              style={{ ...buttonStyle, flex: 1, background: '#171717', color: '#a1a1aa', border: '1px solid #262626', padding: '10px', fontSize: '13px' }}
            >
              Terms
            </button>
          </div>

          {/* Footer Info */}
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <p style={{ fontSize: '11px', color: '#52525b' }}>
              Member since {new Date(user.createdAt || Date.now()).toLocaleDateString()}
            </p>
          </div>
        </div>
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
