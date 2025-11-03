/**
 * User Profile Component
 * Simple profile display and editing for S21 Field AI
 * Accessible from Settings
 */

import React, { useState, useEffect } from 'react';
import { authService, AuthUser } from '../services/authService';
import { databaseService } from '../services/databaseService';
import { User, LogOut, Save, X, MapPin } from 'lucide-react';

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
      const updated = await authService.updateUserProfile({
        name,
        state
      });

      if (updated) {
        const currentUser = authService.getCurrentUser();
        if (currentUser) {
          setUser(currentUser);
          setSuccess('Profile updated successfully!');
          setEditing(false);

          // Clear success message after 3 seconds
          setTimeout(() => setSuccess(''), 3000);
        }
      } else {
        setError('Failed to update profile. Please try again.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
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

  if (!user) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-4 z-50"
      style={{ background: 'rgba(0, 0, 0, 0.7)' }}
    >
      <div
        className="w-full max-w-md rounded-lg shadow-xl"
        style={{
          background: 'var(--bg-elevated)',
          border: '2px solid var(--roof-red)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-6 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: 'var(--roof-red)' }}
            >
              <User className="w-6 h-6" style={{ color: 'var(--text-primary)' }} />
            </div>
            <div>
              <h2
                className="text-xl font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                User Profile
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                {user.role === 'sales_rep' ? 'Sales Representative' : user.role}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-all"
            style={{
              background: 'var(--bg-hover)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)'
            }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Email (Read-only) */}
          <div className="mb-6">
            <label
              className="block mb-2 text-sm font-semibold"
              style={{ color: 'var(--text-secondary)' }}
            >
              Email Address
            </label>
            <input
              type="email"
              value={user.email}
              disabled
              className="w-full px-4 py-3 rounded-lg text-base"
              style={{
                background: 'var(--bg-hover)',
                border: '2px solid var(--border-subtle)',
                color: 'var(--text-tertiary)',
                cursor: 'not-allowed',
                minHeight: '50px'
              }}
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--text-disabled)' }}>
              Email cannot be changed
            </p>
          </div>

          {/* Name */}
          <div className="mb-6">
            <label
              htmlFor="name"
              className="block mb-2 text-sm font-semibold"
              style={{ color: 'var(--text-secondary)' }}
            >
              Your Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!editing}
              className="w-full px-4 py-3 rounded-lg text-base"
              style={{
                background: editing ? 'var(--bg-hover)' : 'var(--bg-secondary)',
                border: `2px solid ${editing ? 'var(--roof-red)' : 'var(--border-subtle)'}`,
                color: 'var(--text-primary)',
                cursor: editing ? 'text' : 'not-allowed',
                minHeight: '50px'
              }}
            />
          </div>

          {/* State Selector */}
          <div className="mb-6">
            <label
              htmlFor="state"
              className="block mb-2 text-sm font-semibold flex items-center gap-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              <MapPin className="w-4 h-4" />
              Primary State
            </label>
            <select
              id="state"
              value={state || ''}
              onChange={(e) => setState(e.target.value as 'VA' | 'MD' | 'PA' || null)}
              disabled={!editing}
              className="w-full px-4 py-3 rounded-lg text-base"
              style={{
                background: editing ? 'var(--bg-hover)' : 'var(--bg-secondary)',
                border: `2px solid ${editing ? 'var(--roof-red)' : 'var(--border-subtle)'}`,
                color: 'var(--text-primary)',
                cursor: editing ? 'pointer' : 'not-allowed',
                minHeight: '50px'
              }}
            >
              <option value="">Select State</option>
              <option value="VA">Virginia (VA)</option>
              <option value="MD">Maryland (MD)</option>
              <option value="PA">Pennsylvania (PA)</option>
            </select>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-disabled)' }}>
              Your primary operating state for regulations and codes
            </p>
          </div>

          {/* Success/Error Messages */}
          {success && (
            <div
              className="mb-4 p-3 rounded-lg text-sm"
              style={{
                background: 'rgba(74, 222, 128, 0.1)',
                border: '1px solid var(--success)',
                color: 'var(--success)'
              }}
            >
              {success}
            </div>
          )}

          {error && (
            <div
              className="mb-4 p-3 rounded-lg text-sm"
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid var(--error)',
                color: 'var(--error)'
              }}
            >
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            {editing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-3 rounded-lg font-semibold text-base transition-all flex items-center justify-center gap-2"
                  style={{
                    background: saving ? 'var(--roof-red-darker)' : 'var(--roof-red)',
                    color: 'var(--text-primary)',
                    border: 'none',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    minHeight: '50px',
                    opacity: saving ? 0.7 : 1
                  }}
                >
                  <Save className="w-5 h-5" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setName(user.name);
                    setState(user.state);
                    setError('');
                    setSuccess('');
                  }}
                  disabled={saving}
                  className="px-6 py-3 rounded-lg font-semibold text-base transition-all"
                  style={{
                    background: 'var(--bg-hover)',
                    color: 'var(--text-primary)',
                    border: '2px solid var(--border-default)',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    minHeight: '50px'
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="flex-1 py-3 rounded-lg font-semibold text-base transition-all"
                  style={{
                    background: 'var(--roof-red)',
                    color: 'var(--text-primary)',
                    border: 'none',
                    cursor: 'pointer',
                    minHeight: '50px'
                  }}
                >
                  Edit Profile
                </button>
                <button
                  onClick={handleLogout}
                  className="px-6 py-3 rounded-lg font-semibold text-base transition-all flex items-center justify-center gap-2"
                  style={{
                    background: 'var(--bg-hover)',
                    color: 'var(--error)',
                    border: '2px solid var(--error)',
                    cursor: 'pointer',
                    minHeight: '50px'
                  }}
                >
                  <LogOut className="w-5 h-5" />
                  Logout
                </button>
              </>
            )}
          </div>
        </div>

        {/* Footer Info */}
        <div
          className="p-4 border-t text-xs text-center"
          style={{
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-disabled)'
          }}
        >
          <p>Member since: {new Date(user.created_at).toLocaleDateString()}</p>
          <p className="mt-1">
            Last login: {new Date(user.last_login_at).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
