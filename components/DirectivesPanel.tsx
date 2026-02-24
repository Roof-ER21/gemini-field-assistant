/**
 * DirectivesPanel
 * Admin UI for creating and managing manager directives
 * that Susan follows for all reps.
 */

import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, AlertTriangle, CheckCircle } from 'lucide-react';
import { getApiBaseUrl } from '../services/config';
import { authService } from '../services/authService';

interface Directive {
  id: string;
  title: string;
  content: string;
  priority: 'normal' | 'high' | 'critical';
  is_active: boolean;
  target_audience: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

const PRIORITY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  critical: { bg: 'rgba(220,38,38,0.12)', border: 'rgba(220,38,38,0.4)', text: '#f87171' },
  high: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)', text: '#fbbf24' },
  normal: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.4)', text: '#60a5fa' },
};

const DirectivesPanel: React.FC = () => {
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<'normal' | 'high' | 'critical'>('normal');
  const [saving, setSaving] = useState(false);

  const email = authService.getCurrentUser()?.email || '';
  const apiBase = getApiBaseUrl();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user-email': email,
  };

  const fetchDirectives = async () => {
    try {
      const res = await fetch(`${apiBase}/directives?active=false`, { headers });
      if (res.ok) setDirectives(await res.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDirectives();
  }, []);

  const resetForm = () => {
    setTitle('');
    setContent('');
    setPriority('normal');
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `${apiBase}/directives/${editingId}` : `${apiBase}/directives`;
      await fetch(url, { method, headers, body: JSON.stringify({ title, content, priority }) });
      resetForm();
      await fetchDirectives();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string, currentActive: boolean) => {
    await fetch(`${apiBase}/directives/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ is_active: !currentActive }),
    });
    await fetchDirectives();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this directive?')) return;
    await fetch(`${apiBase}/directives/${id}`, { method: 'DELETE', headers });
    await fetchDirectives();
  };

  const startEdit = (d: Directive) => {
    setTitle(d.title);
    setContent(d.content);
    setPriority(d.priority);
    setEditingId(d.id);
    setShowForm(true);
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

  if (loading) {
    return <div style={{ color: '#71717a', padding: '20px' }}>Loading directives...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 style={{ margin: 0, color: '#fff', fontSize: '18px', fontWeight: 700 }}>Manager Directives</h3>
          <p style={{ margin: '4px 0 0', color: '#71717a', fontSize: '13px' }}>
            Instructions that Susan follows for every rep
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          style={{
            padding: '10px 18px',
            fontSize: '14px',
            fontWeight: 600,
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Plus style={{ width: '16px', height: '16px' }} />
          New Directive
        </button>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div style={{
          background: '#0a0a0a',
          border: '1px solid #262626',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '20px',
        }}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', marginBottom: '4px' }}>
              Title
            </label>
            <input
              type="text"
              placeholder="e.g. Push GAF HDZ shingles on every job"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', marginBottom: '4px' }}>
              Instructions for Susan
            </label>
            <textarea
              placeholder="When discussing shingle options, always recommend GAF HDZ first and explain the lifetime warranty advantage..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', marginBottom: '6px' }}>
              Priority
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['normal', 'high', 'critical'] as const).map((p) => {
                const colors = PRIORITY_COLORS[p];
                return (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      fontSize: '13px',
                      borderRadius: '8px',
                      border: priority === p ? `1px solid ${colors.border}` : '1px solid #262626',
                      background: priority === p ? colors.bg : 'transparent',
                      color: priority === p ? colors.text : '#71717a',
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      fontWeight: priority === p ? 600 : 400,
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={resetForm}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #262626',
                background: 'transparent',
                color: '#a1a1aa',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !title.trim() || !content.trim()}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                color: '#fff',
                cursor: saving ? 'wait' : 'pointer',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Directive Cards */}
      {directives.length === 0 ? (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          color: '#52525b',
          fontSize: '14px',
          background: '#0a0a0a',
          borderRadius: '12px',
          border: '1px solid #262626',
        }}>
          No directives yet. Create one to guide Susan for all reps.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {directives.map((d) => {
            const colors = PRIORITY_COLORS[d.priority] || PRIORITY_COLORS.normal;
            return (
              <div
                key={d.id}
                style={{
                  background: '#0a0a0a',
                  border: `1px solid ${d.is_active ? colors.border : '#262626'}`,
                  borderRadius: '12px',
                  padding: '16px',
                  opacity: d.is_active ? 1 : 0.5,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      {d.priority === 'critical' ? (
                        <AlertTriangle style={{ width: '14px', height: '14px', color: colors.text }} />
                      ) : (
                        <CheckCircle style={{ width: '14px', height: '14px', color: colors.text }} />
                      )}
                      <span style={{ fontWeight: 600, color: '#fff', fontSize: '15px' }}>{d.title}</span>
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: colors.bg,
                        color: colors.text,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                      }}>
                        {d.priority}
                      </span>
                    </div>
                    <p style={{ margin: 0, color: '#a1a1aa', fontSize: '13px', lineHeight: '1.5' }}>
                      {d.content}
                    </p>
                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#52525b' }}>
                      By {d.created_by_name} &middot; {new Date(d.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button
                      onClick={() => handleToggle(d.id, d.is_active)}
                      title={d.is_active ? 'Deactivate' : 'Activate'}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        border: '1px solid #262626',
                        background: 'transparent',
                        color: d.is_active ? '#22c55e' : '#71717a',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {d.is_active ? (
                        <ToggleRight style={{ width: '16px', height: '16px' }} />
                      ) : (
                        <ToggleLeft style={{ width: '16px', height: '16px' }} />
                      )}
                    </button>
                    <button
                      onClick={() => startEdit(d)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        border: '1px solid #262626',
                        background: 'transparent',
                        color: '#a1a1aa',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Edit2 style={{ width: '14px', height: '14px' }} />
                    </button>
                    <button
                      onClick={() => handleDelete(d.id)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        border: '1px solid #262626',
                        background: 'transparent',
                        color: '#dc2626',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Trash2 style={{ width: '14px', height: '14px' }} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DirectivesPanel;
