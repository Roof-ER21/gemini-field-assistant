import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Phone,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Loader,
  X,
  Users,
} from 'lucide-react';
import { API_BASE_URL } from '../services/config';
import { authService } from '../services/authService';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RepUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  company_name: string | null;
  role?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PHONE = '(703) 239-3738';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authHeaders(overrideEmail?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-user-email': overrideEmail || authService.getCurrentUser()?.email || '',
  };
}

// ─── Inline Phone Editor ──────────────────────────────────────────────────────

interface PhoneCellProps {
  repEmail: string;
  initialPhone: string | null;
  onSaved: (email: string, newPhone: string) => void;
}

const PhoneCell: React.FC<PhoneCellProps> = ({ repEmail, initialPhone, onSaved }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialPhone || '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitSave = async () => {
    if (value === (initialPhone || '')) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/hail/rep-profile`, {
        method: 'PUT',
        headers: authHeaders(repEmail),
        body: JSON.stringify({ phone: value.trim() || null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved(repEmail, value.trim());
      setEditing(false);
    } catch (err: any) {
      setSaveError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitSave();
    if (e.key === 'Escape') {
      setValue(initialPhone || '');
      setEditing(false);
      setSaveError(null);
    }
  };

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <input
          ref={inputRef}
          type="tel"
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={commitSave}
          onKeyDown={handleKeyDown}
          placeholder="(555) 000-0000"
          style={{
            padding: '0.25rem 0.5rem',
            background: 'rgba(255,255,255,0.08)',
            border: `1px solid ${saveError ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.2)'}`,
            borderRadius: '6px',
            color: 'var(--text-primary)',
            fontSize: '0.875rem',
            width: '160px',
            outline: 'none',
          }}
        />
        {saving && (
          <Loader style={{ width: '0.875rem', height: '0.875rem', color: 'var(--text-tertiary)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
        )}
        {saveError && (
          <span style={{ fontSize: '0.6875rem', color: '#ef4444' }}>{saveError}</span>
        )}
      </div>
    );
  }

  const hasPhone = !!initialPhone;

  return (
    <button
      onClick={() => setEditing(true)}
      title="Click to edit phone"
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.375rem',
        color: hasPhone ? 'var(--text-secondary)' : '#ef4444',
        fontSize: '0.875rem',
        textAlign: 'left',
      }}
    >
      {hasPhone ? (
        <>
          <CheckCircle style={{ width: '0.875rem', height: '0.875rem', color: '#10b981', flexShrink: 0 }} />
          {initialPhone}
        </>
      ) : (
        <>
          <AlertCircle style={{ width: '0.875rem', height: '0.875rem', flexShrink: 0 }} />
          <span style={{ fontStyle: 'italic', fontSize: '0.8125rem' }}>Missing — click to add</span>
        </>
      )}
    </button>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const AdminRepPhonePanel: React.FC = () => {
  const [users, setUsers] = useState<RepUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : data.users || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Called by PhoneCell when a save succeeds — update local state immediately
  const handlePhoneSaved = (email: string, newPhone: string) => {
    setUsers(prev =>
      prev.map(u => (u.email === email ? { ...u, phone: newPhone || null } : u))
    );
  };

  // Bulk set default phone for all users missing a phone
  const handleBulkDefault = async () => {
    const missing = users.filter(u => !u.phone);
    if (missing.length === 0) {
      setBulkResult('All reps already have a phone number set.');
      return;
    }

    const confirmed = window.confirm(
      `Set "${DEFAULT_PHONE}" as the phone for ${missing.length} rep(s) with no number?`
    );
    if (!confirmed) return;

    setBulkRunning(true);
    setBulkResult(null);
    let succeeded = 0;
    let failed = 0;

    for (const rep of missing) {
      try {
        const res = await fetch(`${API_BASE_URL}/hail/rep-profile`, {
          method: 'PUT',
          headers: authHeaders(rep.email),
          body: JSON.stringify({ phone: DEFAULT_PHONE }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        succeeded++;
      } catch {
        failed++;
      }
    }

    // Refresh to get canonical server state
    await fetchUsers();
    setBulkRunning(false);
    setBulkResult(
      `Done. Updated ${succeeded} rep(s).${failed > 0 ? ` ${failed} failed.` : ''}`
    );
  };

  // ── Derived stats ──

  const missingCount = users.filter(u => !u.phone).length;
  const presentCount = users.length - missingCount;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Rep Phone Numbers
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
            Click a phone cell to edit inline. Press Enter to save, Esc to cancel.
          </p>
        </div>
        <button
          onClick={fetchUsers}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            padding: '0.5rem',
            cursor: 'pointer',
            color: 'var(--text-tertiary)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <RefreshCw style={{ width: '1rem', height: '1rem' }} />
        </button>
      </div>

      {/* Stats + bulk action row */}
      {!loading && users.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px',
          }}
        >
          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Users style={{ width: '1rem', height: '1rem', color: 'var(--text-tertiary)' }} />
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{users.length}</strong> total reps
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <CheckCircle style={{ width: '1rem', height: '1rem', color: '#10b981' }} />
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                <strong style={{ color: '#10b981' }}>{presentCount}</strong> with phone
              </span>
            </div>
            {missingCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <AlertCircle style={{ width: '1rem', height: '1rem', color: '#ef4444' }} />
                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: '#ef4444' }}>{missingCount}</strong> missing
                </span>
              </div>
            )}
          </div>

          {missingCount > 0 && (
            <button
              onClick={handleBulkDefault}
              disabled={bulkRunning}
              style={{
                padding: '0.5rem 1rem',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: '8px',
                color: 'var(--roof-red, #ef4444)',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: bulkRunning ? 'not-allowed' : 'pointer',
                opacity: bulkRunning ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                whiteSpace: 'nowrap',
              }}
            >
              {bulkRunning ? (
                <Loader style={{ width: '0.875rem', height: '0.875rem', animation: 'spin 1s linear infinite' }} />
              ) : (
                <Phone style={{ width: '0.875rem', height: '0.875rem' }} />
              )}
              Set default {DEFAULT_PHONE} for all missing
            </button>
          )}
        </div>
      )}

      {/* Bulk result toast */}
      {bulkResult && (
        <div
          style={{
            padding: '0.625rem 1rem',
            background: 'rgba(16,185,129,0.1)',
            border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: '8px',
            color: '#10b981',
            fontSize: '0.875rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {bulkResult}
          <button
            onClick={() => setBulkResult(null)}
            style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer' }}
          >
            <X style={{ width: '1rem', height: '1rem' }} />
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '8px',
            color: '#ef4444',
            fontSize: '0.875rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {error}
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
            <X style={{ width: '1rem', height: '1rem' }} />
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          <Loader style={{ width: '1.25rem', height: '1.25rem', animation: 'spin 1s linear infinite' }} />
          Loading users…
        </div>
      ) : users.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <Users style={{ width: '2rem', height: '2rem', marginBottom: '0.75rem', opacity: 0.4 }} />
          <p style={{ margin: 0 }}>No users found.</p>
        </div>
      ) : (
        <div
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          {/* Table header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1.5fr 1.5fr 1fr',
              gap: 0,
              padding: '0.625rem 1rem',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
            }}
          >
            {['Name', 'Email', 'Phone', 'Company'].map(col => (
              <span
                key={col}
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {col}
              </span>
            ))}
          </div>

          {/* Table rows */}
          {users.map((rep, idx) => (
            <div
              key={rep.id || rep.email}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1.5fr 1.5fr 1fr',
                gap: 0,
                padding: '0.75rem 1rem',
                borderBottom: idx < users.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                alignItems: 'center',
                background: !rep.phone ? 'rgba(239,68,68,0.03)' : 'transparent',
                transition: 'background 0.1s',
              }}
            >
              {/* Name */}
              <span
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  paddingRight: '0.5rem',
                }}
              >
                {rep.name || '—'}
              </span>

              {/* Email */}
              <span
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--text-tertiary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  paddingRight: '0.5rem',
                }}
              >
                {rep.email}
              </span>

              {/* Phone — inline editable */}
              <div style={{ paddingRight: '0.5rem' }}>
                <PhoneCell
                  repEmail={rep.email}
                  initialPhone={rep.phone}
                  onSaved={handlePhoneSaved}
                />
              </div>

              {/* Company */}
              <span
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--text-tertiary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {rep.company_name || '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default AdminRepPhonePanel;
