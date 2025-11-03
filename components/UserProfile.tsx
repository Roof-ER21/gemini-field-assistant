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
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{
        background: 'rgba(0, 0, 0, 0.75)',
        zIndex: 10000,
        animation: 'fadeIn 0.2s ease-in-out'
      }}
    >
      <div
        className="w-full max-w-md"
        style={{
          background: 'linear-gradient(135deg, #1a1f2e 0%, #0f1419 100%)',
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(239, 68, 68, 0.3)',
          animation: 'slideUp 0.3s ease-out',
          maxHeight: '90vh',
          overflowY: 'auto',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Decorative top gradient */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '120px',
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.05) 100%)',
          pointerEvents: 'none',
          zIndex: 0
        }} />

        {/* Decorative circle accent */}
        <div style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '160px',
          height: '160px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(239, 68, 68, 0.2) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0
        }} />
        {/* Header */}
        <div
          className="flex items-center justify-between p-6"
          style={{
            position: 'relative',
            zIndex: 1,
            borderBottom: '1px solid rgba(239, 68, 68, 0.2)'
          }}
        >
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                boxShadow: '0 8px 24px rgba(239, 68, 68, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.2)',
                border: '3px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              <User className="w-7 h-7" style={{ color: '#ffffff', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }} />
            </div>
            <div>
              <h2
                className="text-xl font-bold"
                style={{
                  color: '#ffffff',
                  letterSpacing: '-0.02em',
                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
                }}
              >
                {user.name || 'User Profile'}
              </h2>
              <p className="text-sm" style={{
                color: 'rgba(255, 255, 255, 0.7)',
                marginTop: '2px',
                fontWeight: 500
              }}>
                {user.role === 'sales_rep' ? 'Sales Representative' : user.role}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 rounded-full transition-all"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#ffffff',
              backdropFilter: 'blur(10px)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
              e.currentTarget.style.transform = 'rotate(90deg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'rotate(0deg)';
            }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6" style={{ position: 'relative', zIndex: 1 }}>
          {/* Email (Read-only) */}
          <div className="mb-5">
            <label
              className="block mb-2.5 text-sm font-semibold"
              style={{
                color: 'rgba(255, 255, 255, 0.9)',
                letterSpacing: '-0.01em'
              }}
            >
              Email Address
            </label>
            <input
              type="email"
              value={user.email}
              disabled
              className="w-full px-4 py-3.5 text-base"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '14px',
                color: 'rgba(255, 255, 255, 0.6)',
                cursor: 'not-allowed',
                minHeight: '52px',
                transition: 'all 0.2s'
              }}
            />
            <p className="mt-2 text-xs" style={{
              color: 'rgba(255, 255, 255, 0.5)',
              fontStyle: 'italic'
            }}>
              Email cannot be changed
            </p>
          </div>

          {/* Name */}
          <div className="mb-5">
            <label
              htmlFor="name"
              className="block mb-2.5 text-sm font-semibold"
              style={{
                color: 'rgba(255, 255, 255, 0.9)',
                letterSpacing: '-0.01em'
              }}
            >
              Your Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!editing}
              className="w-full px-4 py-3.5 text-base"
              style={{
                background: editing ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                border: editing ? '2px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '14px',
                color: '#ffffff',
                cursor: editing ? 'text' : 'not-allowed',
                minHeight: '52px',
                transition: 'all 0.2s',
                boxShadow: editing ? '0 0 0 4px rgba(239, 68, 68, 0.1)' : 'none'
              }}
            />
          </div>

          {/* State Selector */}
          <div className="mb-5">
            <label
              htmlFor="state"
              className="block mb-2.5 text-sm font-semibold flex items-center gap-2"
              style={{
                color: 'rgba(255, 255, 255, 0.9)',
                letterSpacing: '-0.01em'
              }}
            >
              <MapPin className="w-4 h-4" style={{ color: '#ef4444' }} />
              Primary State
            </label>
            <select
              id="state"
              value={state || ''}
              onChange={(e) => setState(e.target.value as 'VA' | 'MD' | 'PA' || null)}
              disabled={!editing}
              className="w-full px-4 py-3.5 text-base"
              style={{
                background: editing ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                border: editing ? '2px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '14px',
                color: '#ffffff',
                cursor: editing ? 'pointer' : 'not-allowed',
                minHeight: '52px',
                transition: 'all 0.2s',
                boxShadow: editing ? '0 0 0 4px rgba(239, 68, 68, 0.1)' : 'none'
              }}
            >
              <option value="">Select State</option>
              <option value="VA">Virginia (VA)</option>
              <option value="MD">Maryland (MD)</option>
              <option value="PA">Pennsylvania (PA)</option>
            </select>
            <p className="mt-2 text-xs" style={{
              color: 'rgba(255, 255, 255, 0.5)',
              fontStyle: 'italic'
            }}>
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
          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            {editing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-3.5 font-semibold text-base transition-all flex items-center justify-center gap-2"
                  style={{
                    background: saving ? 'rgba(239, 68, 68, 0.6)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '14px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    minHeight: '52px',
                    opacity: saving ? 0.7 : 1,
                    boxShadow: saving ? 'none' : '0 4px 16px rgba(239, 68, 68, 0.4)',
                    transform: saving ? 'scale(0.98)' : 'scale(1)'
                  }}
                  onMouseEnter={(e) => {
                    if (!saving) e.currentTarget.style.transform = 'scale(1.02)';
                  }}
                  onMouseLeave={(e) => {
                    if (!saving) e.currentTarget.style.transform = 'scale(1)';
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
                  className="w-full sm:w-auto px-6 py-3.5 font-semibold text-base transition-all"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '14px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    minHeight: '52px'
                  }}
                  onMouseEnter={(e) => {
                    if (!saving) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    if (!saving) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="flex-1 py-3.5 font-semibold text-base transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '14px',
                    cursor: 'pointer',
                    minHeight: '52px',
                    boxShadow: '0 4px 16px rgba(239, 68, 68, 0.4)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  Edit Profile
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full sm:w-auto px-6 py-3.5 font-semibold text-base transition-all flex items-center justify-center gap-2"
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.5)',
                    borderRadius: '14px',
                    cursor: 'pointer',
                    minHeight: '52px',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                    e.currentTarget.style.borderColor = '#ef4444';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
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
          className="p-5 text-xs text-center"
          style={{
            position: 'relative',
            zIndex: 1,
            borderTop: '1px solid rgba(239, 68, 68, 0.2)',
            color: 'rgba(255, 255, 255, 0.5)',
            background: 'rgba(0, 0, 0, 0.2)'
          }}
        >
          <p style={{ marginBottom: '6px', fontWeight: 500 }}>
            Member since: {new Date(user.created_at).toLocaleDateString()}
          </p>
          <p style={{ fontWeight: 500 }}>
            Last login: {new Date(user.last_login_at).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
