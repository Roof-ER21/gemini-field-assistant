/**
 * PersonalitySettings
 * Lets each rep customize how Susan talks to them.
 * Reads/writes via GET/PUT /api/memory/personality.
 */

import React, { useState, useEffect } from 'react';
import { Sparkles, Save, Check } from 'lucide-react';
import { getApiBaseUrl } from '../services/config';
import { authService } from '../services/authService';

interface PersonalityData {
  preferred_name: string;
  tone: string;
  verbosity: string;
  specialties: string;
  greeting_style: string;
}

const TONE_OPTIONS = ['professional', 'casual', 'motivational', 'direct', 'friendly'];
const VERBOSITY_OPTIONS = ['concise', 'balanced', 'detailed'];
const SPECIALTY_OPTIONS = [
  'insurance claims',
  'retail sales',
  'storm chasing',
  'commercial roofing',
  'gutters & siding',
  'solar',
  'door knocking',
  'adjuster meetings',
];

const PersonalitySettings: React.FC = () => {
  const [data, setData] = useState<PersonalityData>({
    preferred_name: '',
    tone: '',
    verbosity: '',
    specialties: '',
    greeting_style: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const email = authService.getCurrentUser()?.email || '';
  const apiBase = getApiBaseUrl();

  useEffect(() => {
    if (!email) return;
    fetch(`${apiBase}/memory/personality`, {
      headers: { 'x-user-email': email },
    })
      .then((r) => (r.ok ? r.json() : {}))
      .then((p: Partial<PersonalityData>) => {
        setData((prev) => ({ ...prev, ...p }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [email, apiBase]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`${apiBase}/memory/personality`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': email,
        },
        body: JSON.stringify(data),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    background: '#171717',
    border: '1px solid #262626',
    borderRadius: '8px',
    color: '#ffffff',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: '#a1a1aa',
    marginBottom: '4px',
  };

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    fontSize: '12px',
    borderRadius: '16px',
    border: active ? '1px solid #a78bfa' : '1px solid #262626',
    background: active ? 'rgba(167,139,250,0.15)' : '#171717',
    color: active ? '#c4b5fd' : '#71717a',
    cursor: 'pointer',
    transition: 'all 0.15s',
  });

  if (loading) {
    return (
      <div style={{ padding: '12px', color: '#71717a', fontSize: '13px' }}>
        Loading preferences...
      </div>
    );
  }

  const selectedSpecialties = data.specialties
    ? data.specialties.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const toggleSpecialty = (spec: string) => {
    const current = new Set(selectedSpecialties);
    if (current.has(spec)) {
      current.delete(spec);
    } else {
      current.add(spec);
    }
    setData({ ...data, specialties: Array.from(current).join(', ') });
  };

  return (
    <div>
      {/* Section Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '16px',
        }}
      >
        <Sparkles style={{ width: '16px', height: '16px', color: '#a78bfa' }} />
        <span style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff' }}>
          Susan Preferences
        </span>
      </div>

      {/* Preferred Name */}
      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>What should Susan call you?</label>
        <input
          type="text"
          placeholder="e.g. Big Mike, Boss, Coach"
          value={data.preferred_name}
          onChange={(e) => setData({ ...data, preferred_name: e.target.value })}
          style={inputStyle}
        />
      </div>

      {/* Tone */}
      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>Tone</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {TONE_OPTIONS.map((t) => (
            <button
              key={t}
              onClick={() => setData({ ...data, tone: data.tone === t ? '' : t })}
              style={chipStyle(data.tone === t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Verbosity */}
      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>Response length</label>
        <div style={{ display: 'flex', gap: '6px' }}>
          {VERBOSITY_OPTIONS.map((v) => (
            <button
              key={v}
              onClick={() => setData({ ...data, verbosity: data.verbosity === v ? '' : v })}
              style={{ ...chipStyle(data.verbosity === v), flex: 1, textAlign: 'center' }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Specialties */}
      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>Your specialties</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {SPECIALTY_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => toggleSpecialty(s)}
              style={chipStyle(selectedSpecialties.includes(s))}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Greeting Style */}
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Custom greeting (optional)</label>
        <input
          type="text"
          placeholder="e.g. Let's close some deals!"
          value={data.greeting_style}
          onChange={(e) => setData({ ...data, greeting_style: e.target.value })}
          style={inputStyle}
        />
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%',
          padding: '12px',
          fontSize: '14px',
          fontWeight: '600',
          borderRadius: '8px',
          border: 'none',
          cursor: saving ? 'wait' : 'pointer',
          background: saved
            ? 'rgba(34,197,94,0.2)'
            : 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
          color: saved ? '#4ade80' : '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          transition: 'all 0.2s',
        }}
      >
        {saved ? (
          <>
            <Check style={{ width: '16px', height: '16px' }} />
            Saved
          </>
        ) : (
          <>
            <Save style={{ width: '16px', height: '16px' }} />
            {saving ? 'Saving...' : 'Save Preferences'}
          </>
        )}
      </button>
    </div>
  );
};

export default PersonalitySettings;
