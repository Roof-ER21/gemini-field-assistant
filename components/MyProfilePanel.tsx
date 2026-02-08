/**
 * MyProfilePanel - User's QR Profile Management
 * Allows users to view/edit their public profile, generate QR codes, and see analytics
 */

import React, { useState, useEffect } from 'react';
import {
  QrCode,
  User,
  Phone,
  Mail,
  Edit2,
  Save,
  X,
  BarChart3,
  Users,
  TrendingUp,
  Copy,
  ExternalLink,
  RefreshCw,
  Loader
} from 'lucide-react';

interface MyProfilePanelProps {
  userEmail: string;
}

interface EmployeeProfile {
  id: string;
  user_id: string | null;
  name: string;
  title: string | null;
  role_type: string;
  email: string | null;
  phone_number: string | null;
  bio: string | null;
  image_url: string | null;
  slug: string;
  start_year: number | null;
  is_active: boolean;
  is_claimed: boolean;
  referral_count: number;
  created_at: string;
  updated_at: string;
}

interface ProfileStats {
  scansToday: number;
  scansThisWeek: number;
  scansThisMonth: number;
  scansAllTime: number;
  uniqueVisitors: number;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

const MyProfilePanel: React.FC<MyProfilePanelProps> = ({ userEmail }) => {
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Editable form data
  const [formData, setFormData] = useState({
    name: '',
    title: '',
    bio: '',
    phone_number: '',
    start_year: ''
  });

  // Fetch user's profile
  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/api/profiles/me`, {
        headers: {
          'x-user-email': userEmail
        }
      });

      const data = await response.json();

      if (data.success && data.profile) {
        setProfile(data.profile);
        setFormData({
          name: data.profile.name || '',
          title: data.profile.title || '',
          bio: data.profile.bio || '',
          phone_number: data.profile.phone_number || '',
          start_year: data.profile.start_year?.toString() || ''
        });

        // Fetch stats for this profile
        fetchStats(data.profile.slug);
        generateQRCode(data.profile.slug);
      } else {
        setProfile(null);
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  // Fetch profile analytics
  const fetchStats = async (slug: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/qr-analytics/profile/${slug}`, {
        headers: {
          'x-user-email': userEmail
        }
      });

      const data = await response.json();

      if (data.success) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  // Generate QR code data URL
  const generateQRCode = async (slug: string) => {
    try {
      // Use a simple QR code service or generate locally
      const profileUrl = `${window.location.origin}/profile/${slug}`;
      // For now, use a placeholder - in production, use qrcode npm package
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(profileUrl)}`;
      setQrCodeUrl(qrApiUrl);
    } catch (err) {
      console.error('Failed to generate QR code:', err);
    }
  };

  // Save profile changes
  const handleSave = async () => {
    if (!profile) return;

    try {
      setSaving(true);
      setError(null);

      const response = await fetch(`${API_BASE}/api/profiles/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': userEmail
        },
        body: JSON.stringify({
          name: formData.name,
          title: formData.title || null,
          bio: formData.bio || null,
          phone_number: formData.phone_number || null,
          start_year: formData.start_year ? parseInt(formData.start_year) : null
        })
      });

      const data = await response.json();

      if (data.success) {
        setProfile(data.profile);
        setEditing(false);
      } else {
        setError(data.error || 'Failed to save changes');
      }
    } catch (err) {
      console.error('Failed to save profile:', err);
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Copy profile URL to clipboard
  const copyProfileUrl = () => {
    if (!profile) return;
    const url = `${window.location.origin}/profile/${profile.slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    fetchProfile();
  }, [userEmail]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#a1a1aa'
      }}>
        <Loader style={{ width: '2rem', height: '2rem', animation: 'spin 1s linear infinite' }} />
        <span style={{ marginLeft: '0.75rem' }}>Loading profile...</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{
        padding: '2rem',
        maxWidth: '600px',
        margin: '0 auto',
        textAlign: 'center'
      }}>
        <div style={{
          background: '#0a0a0a',
          borderRadius: '12px',
          border: '1px solid #262626',
          padding: '3rem'
        }}>
          <QrCode style={{ width: '4rem', height: '4rem', color: '#dc2626', margin: '0 auto 1.5rem' }} />
          <h2 style={{ color: '#ffffff', margin: '0 0 1rem 0' }}>No Profile Yet</h2>
          <p style={{ color: '#a1a1aa', margin: '0 0 1.5rem 0' }}>
            You don't have a QR profile linked to your account yet.
            Contact your admin to create one for you.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <QrCode style={{ width: '1.5rem', height: '1.5rem', color: '#dc2626' }} />
          <h1 style={{ margin: 0, color: '#ffffff', fontSize: '1.5rem', fontWeight: '600' }}>
            My QR Profile
          </h1>
        </div>
        <button
          onClick={() => fetchProfile()}
          style={{
            padding: '0.5rem 1rem',
            background: 'transparent',
            border: '1px solid #262626',
            borderRadius: '8px',
            color: '#a1a1aa',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <RefreshCw style={{ width: '1rem', height: '1rem' }} />
          Refresh
        </button>
      </div>

      {error && (
        <div style={{
          padding: '1rem',
          background: '#450a0a',
          border: '1px solid #dc2626',
          borderRadius: '8px',
          color: '#fca5a5',
          marginBottom: '1.5rem'
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
        {/* Left Column - Profile Info */}
        <div style={{
          background: '#0a0a0a',
          borderRadius: '12px',
          border: '1px solid #262626',
          padding: '1.5rem'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem'
          }}>
            <h2 style={{ margin: 0, color: '#ffffff', fontSize: '1.125rem' }}>Profile Information</h2>
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#dc2626',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <Edit2 style={{ width: '1rem', height: '1rem' }} />
                Edit
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setEditing(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'transparent',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#a1a1aa',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <X style={{ width: '1rem', height: '1rem' }} />
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    padding: '0.5rem 1rem',
                    background: saving ? '#262626' : '#dc2626',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#ffffff',
                    cursor: saving ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {saving ? (
                    <Loader style={{ width: '1rem', height: '1rem', animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <Save style={{ width: '1rem', height: '1rem' }} />
                  )}
                  Save
                </button>
              </div>
            )}
          </div>

          {/* Profile Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                <User style={{ width: '0.875rem', height: '0.875rem', display: 'inline', marginRight: '0.5rem' }} />
                Name
              </label>
              {editing ? (
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '1rem'
                  }}
                />
              ) : (
                <div style={{ color: '#ffffff', fontSize: '1rem' }}>{profile.name}</div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                Title
              </label>
              {editing ? (
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Senior Sales Representative"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '1rem'
                  }}
                />
              ) : (
                <div style={{ color: '#ffffff', fontSize: '1rem' }}>{profile.title || '—'}</div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                <Phone style={{ width: '0.875rem', height: '0.875rem', display: 'inline', marginRight: '0.5rem' }} />
                Phone Number
              </label>
              {editing ? (
                <input
                  type="tel"
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  placeholder="(555) 123-4567"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '1rem'
                  }}
                />
              ) : (
                <div style={{ color: '#ffffff', fontSize: '1rem' }}>{profile.phone_number || '—'}</div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                <Mail style={{ width: '0.875rem', height: '0.875rem', display: 'inline', marginRight: '0.5rem' }} />
                Email
              </label>
              <div style={{ color: '#ffffff', fontSize: '1rem' }}>{profile.email || '—'}</div>
            </div>

            <div>
              <label style={{ display: 'block', color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                Bio
              </label>
              {editing ? (
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  placeholder="Tell homeowners about yourself..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '1rem',
                    resize: 'vertical'
                  }}
                />
              ) : (
                <div style={{ color: '#ffffff', fontSize: '1rem', whiteSpace: 'pre-wrap' }}>
                  {profile.bio || '—'}
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                Started Year
              </label>
              {editing ? (
                <input
                  type="number"
                  value={formData.start_year}
                  onChange={(e) => setFormData({ ...formData, start_year: e.target.value })}
                  placeholder="2020"
                  min="1990"
                  max={new Date().getFullYear()}
                  style={{
                    width: '120px',
                    padding: '0.75rem',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '1rem'
                  }}
                />
              ) : (
                <div style={{ color: '#ffffff', fontSize: '1rem' }}>{profile.start_year || '—'}</div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - QR Code & Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* QR Code Card */}
          <div style={{
            background: '#0a0a0a',
            borderRadius: '12px',
            border: '1px solid #262626',
            padding: '1.5rem',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#ffffff', fontSize: '1rem' }}>Your QR Code</h3>

            {qrCodeUrl ? (
              <div style={{
                background: '#ffffff',
                padding: '1rem',
                borderRadius: '8px',
                display: 'inline-block',
                marginBottom: '1rem'
              }}>
                <img src={qrCodeUrl} alt="QR Code" style={{ width: '150px', height: '150px' }} />
              </div>
            ) : (
              <div style={{
                width: '150px',
                height: '150px',
                background: '#171717',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem'
              }}>
                <QrCode style={{ width: '3rem', height: '3rem', color: '#262626' }} />
              </div>
            )}

            <div style={{
              fontSize: '0.875rem',
              color: '#a1a1aa',
              marginBottom: '1rem',
              wordBreak: 'break-all'
            }}>
              /profile/{profile.slug}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <button
                onClick={copyProfileUrl}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#171717',
                  border: '1px solid #262626',
                  borderRadius: '8px',
                  color: copied ? '#4ade80' : '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem'
                }}
              >
                <Copy style={{ width: '0.875rem', height: '0.875rem' }} />
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
              <a
                href={`/profile/${profile.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '0.5rem 1rem',
                  background: '#171717',
                  border: '1px solid #262626',
                  borderRadius: '8px',
                  color: '#ffffff',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem'
                }}
              >
                <ExternalLink style={{ width: '0.875rem', height: '0.875rem' }} />
                View
              </a>
            </div>
          </div>

          {/* Stats Card */}
          <div style={{
            background: '#0a0a0a',
            borderRadius: '12px',
            border: '1px solid #262626',
            padding: '1.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <BarChart3 style={{ width: '1rem', height: '1rem', color: '#dc2626' }} />
              <h3 style={{ margin: 0, color: '#ffffff', fontSize: '1rem' }}>QR Scan Analytics</h3>
            </div>

            {stats ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{
                  background: '#171717',
                  padding: '1rem',
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: '600', color: '#ffffff' }}>
                    {stats.scansToday}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>Today</div>
                </div>
                <div style={{
                  background: '#171717',
                  padding: '1rem',
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: '600', color: '#ffffff' }}>
                    {stats.scansThisWeek}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>This Week</div>
                </div>
                <div style={{
                  background: '#171717',
                  padding: '1rem',
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: '600', color: '#ffffff' }}>
                    {stats.scansThisMonth}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>This Month</div>
                </div>
                <div style={{
                  background: '#171717',
                  padding: '1rem',
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: '600', color: '#ffffff' }}>
                    {stats.uniqueVisitors}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>Unique Visitors</div>
                </div>
              </div>
            ) : (
              <div style={{ color: '#a1a1aa', fontSize: '0.875rem', textAlign: 'center', padding: '1rem' }}>
                No scan data yet
              </div>
            )}
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}} />
    </div>
  );
};

export default MyProfilePanel;
