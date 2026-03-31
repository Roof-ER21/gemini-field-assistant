import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  FileText,
  X,
  Save,
  ChevronDown,
  Loader,
} from 'lucide-react';
import { API_BASE_URL } from '../services/config';
import { authService } from '../services/authService';

// ─── Types ───────────────────────────────────────────────────────────────────

type DocCategory =
  | 'Sales Scripts'
  | 'Email Templates'
  | 'Insurance Arguments'
  | 'Customer Resources'
  | 'Agreements'
  | 'State Regulations'
  | 'Licenses & Certifications'
  | 'Q&A'
  | 'General';

type DocState = '' | 'VA' | 'MD' | 'PA';

interface KnowledgeDoc {
  id: string;
  name: string;
  category: DocCategory | string;
  state: string | null;
  content: string;
  created_at: string;
}

interface DocFormState {
  name: string;
  category: DocCategory | string;
  state: DocState;
  content: string;
}

const CATEGORIES: DocCategory[] = [
  'Sales Scripts',
  'Email Templates',
  'Insurance Arguments',
  'Customer Resources',
  'Agreements',
  'State Regulations',
  'Licenses & Certifications',
  'Q&A',
  'General',
];

const STATES: DocState[] = ['', 'VA', 'MD', 'PA'];

const BLANK_FORM: DocFormState = {
  name: '',
  category: 'General',
  state: '',
  content: '',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-user-email': authService.getCurrentUser()?.email || '',
  };
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StateBadge({ state }: { state: string | null }) {
  if (!state) return null;
  const colors: Record<string, string> = {
    VA: '#3b82f6',
    MD: '#8b5cf6',
    PA: '#f59e0b',
  };
  const color = colors[state] || '#6b7280';
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '0.6875rem',
        fontWeight: 600,
        background: color + '22',
        color,
        flexShrink: 0,
      }}
    >
      {state}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '0.6875rem',
        fontWeight: 500,
        background: 'rgba(239,68,68,0.12)',
        color: 'var(--roof-red, #ef4444)',
        flexShrink: 0,
      }}
    >
      {category}
    </span>
  );
}

// ─── Inline Doc Form ─────────────────────────────────────────────────────────

interface DocFormProps {
  initial: DocFormState;
  onSave: (form: DocFormState) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

const DocForm: React.FC<DocFormProps> = ({ initial, onSave, onCancel, saving }) => {
  const [form, setForm] = useState<DocFormState>(initial);

  const set = (key: keyof DocFormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm(prev => ({ ...prev, [key]: e.target.value }));

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '0.875rem',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--text-tertiary)',
    marginBottom: '0.375rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        {/* Name */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Name</label>
          <input
            type="text"
            value={form.name}
            onChange={set('name')}
            placeholder="Document name…"
            style={inputStyle}
          />
        </div>

        {/* Category */}
        <div>
          <label style={labelStyle}>Category</label>
          <div style={{ position: 'relative' }}>
            <select value={form.category} onChange={set('category')} style={{ ...inputStyle, appearance: 'none', paddingRight: '2rem', cursor: 'pointer' }}>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown
              style={{ position: 'absolute', right: '0.625rem', top: '50%', transform: 'translateY(-50%)', width: '1rem', height: '1rem', color: 'var(--text-tertiary)', pointerEvents: 'none' }}
            />
          </div>
        </div>

        {/* State */}
        <div>
          <label style={labelStyle}>State (optional)</label>
          <div style={{ position: 'relative' }}>
            <select value={form.state} onChange={set('state')} style={{ ...inputStyle, appearance: 'none', paddingRight: '2rem', cursor: 'pointer' }}>
              <option value="">All States</option>
              {(['VA', 'MD', 'PA'] as const).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <ChevronDown
              style={{ position: 'absolute', right: '0.625rem', top: '50%', transform: 'translateY(-50%)', width: '1rem', height: '1rem', color: 'var(--text-tertiary)', pointerEvents: 'none' }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div>
        <label style={labelStyle}>Content</label>
        <textarea
          value={form.content}
          onChange={set('content')}
          placeholder="Document content…"
          rows={8}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.5', fontFamily: 'inherit' }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '0.5rem 1rem',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: 'var(--text-secondary)',
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
          }}
        >
          <X style={{ width: '0.875rem', height: '0.875rem' }} />
          Cancel
        </button>
        <button
          onClick={() => onSave(form)}
          disabled={saving || !form.name.trim() || !form.content.trim()}
          style={{
            padding: '0.5rem 1rem',
            background: 'var(--roof-red, #ef4444)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving || !form.name.trim() || !form.content.trim() ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
          }}
        >
          {saving ? (
            <Loader style={{ width: '0.875rem', height: '0.875rem', animation: 'spin 1s linear infinite' }} />
          ) : (
            <Save style={{ width: '0.875rem', height: '0.875rem' }} />
          )}
          Save
        </button>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const AdminKnowledgePanel: React.FC = () => {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  // Form state
  const [addOpen, setAddOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<KnowledgeDoc | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch ──

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (categoryFilter !== 'All') params.set('category', categoryFilter);
      const res = await fetch(
        `${API_BASE_URL}/admin/knowledge-docs?${params.toString()}`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDocs(Array.isArray(data) ? data : data.docs || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // ── Save (add or edit) ──

  const handleSave = async (form: DocFormState) => {
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        category: form.category,
        state: form.state || null,
        content: form.content.trim(),
      };

      if (editDoc) {
        const res = await fetch(`${API_BASE_URL}/admin/knowledge-docs/${editDoc.id}`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        const res = await fetch(`${API_BASE_URL}/admin/knowledge-docs`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }

      setAddOpen(false);
      setEditDoc(null);
      fetchDocs();
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/knowledge-docs/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConfirmDeleteId(null);
      fetchDocs();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const controlRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'center',
    flexWrap: 'wrap',
  };

  const searchWrapStyle: React.CSSProperties = {
    position: 'relative',
    flex: '1 1 200px',
    minWidth: 0,
  };

  const selectWrapStyle: React.CSSProperties = {
    position: 'relative',
    flexShrink: 0,
  };

  const sharedSelectStyle: React.CSSProperties = {
    padding: '0.5rem 2rem 0.5rem 0.75rem',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '0.875rem',
    appearance: 'none',
    cursor: 'pointer',
    outline: 'none',
  };

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Knowledge Documents
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
            Manage knowledge_documents table entries
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={fetchDocs}
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
          <button
            onClick={() => { setAddOpen(true); setEditDoc(null); }}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--roof-red, #ef4444)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
            }}
          >
            <Plus style={{ width: '1rem', height: '1rem' }} />
            Add Document
          </button>
        </div>
      </div>

      {/* Controls */}
      <div style={controlRowStyle}>
        {/* Search */}
        <div style={searchWrapStyle}>
          <Search
            style={{
              position: 'absolute',
              left: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '1rem',
              height: '1rem',
              color: 'var(--text-tertiary)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name…"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem 0.5rem 2.25rem',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Category filter */}
        <div style={selectWrapStyle}>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={sharedSelectStyle}
          >
            <option value="All">All Categories</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <ChevronDown
            style={{
              position: 'absolute',
              right: '0.625rem',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '1rem',
              height: '1rem',
              color: 'var(--text-tertiary)',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>

      {/* Add form */}
      {addOpen && !editDoc && (
        <DocForm
          initial={BLANK_FORM}
          onSave={handleSave}
          onCancel={() => setAddOpen(false)}
          saving={saving}
        />
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

      {/* Doc list */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <Loader style={{ width: '1.25rem', height: '1.25rem', animation: 'spin 1s linear infinite' }} />
          Loading documents…
        </div>
      ) : docs.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <FileText style={{ width: '2rem', height: '2rem', marginBottom: '0.75rem', opacity: 0.4 }} />
          <p style={{ margin: 0 }}>No documents found.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {docs.map(doc => {
            const isEditing = editDoc?.id === doc.id;
            const isConfirmDelete = confirmDeleteId === doc.id;

            return (
              <div key={doc.id}>
                {isEditing ? (
                  <DocForm
                    initial={{
                      name: doc.name,
                      category: doc.category as DocCategory,
                      state: (doc.state || '') as DocState,
                      content: doc.content || '',
                    }}
                    onSave={handleSave}
                    onCancel={() => setEditDoc(null)}
                    saving={saving}
                  />
                ) : (
                  <div
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '12px',
                      padding: '1rem',
                    }}
                  >
                    {/* Top row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ flex: 1, fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text-primary)', minWidth: 0 }}>
                        {doc.name}
                      </span>
                      <CategoryBadge category={doc.category} />
                      <StateBadge state={doc.state} />
                    </div>

                    {/* Preview */}
                    <p
                      style={{
                        margin: '0 0 0.75rem',
                        fontSize: '0.8125rem',
                        color: 'var(--text-secondary)',
                        lineHeight: '1.5',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      } as React.CSSProperties}
                    >
                      {(doc.content || '').slice(0, 100)}{(doc.content || '').length > 100 ? '…' : ''}
                    </p>

                    {/* Footer row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                        Added {formatDate(doc.created_at)}
                      </span>

                      {isConfirmDelete ? (
                        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', color: '#f59e0b' }}>Delete this doc?</span>
                          <button
                            onClick={() => handleDelete(doc.id)}
                            disabled={deleting}
                            style={{
                              padding: '0.25rem 0.625rem',
                              background: '#ef4444',
                              border: 'none',
                              borderRadius: '6px',
                              color: '#fff',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {deleting ? '…' : 'Yes, delete'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            style={{
                              padding: '0.25rem 0.625rem',
                              background: 'rgba(255,255,255,0.07)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: '6px',
                              color: 'var(--text-secondary)',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                          <button
                            onClick={() => { setEditDoc(doc); setAddOpen(false); }}
                            style={{
                              padding: '0.25rem 0.625rem',
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: '6px',
                              color: 'var(--text-secondary)',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <Edit2 style={{ width: '0.75rem', height: '0.75rem' }} />
                            Edit
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(doc.id)}
                            style={{
                              padding: '0.25rem 0.625rem',
                              background: 'rgba(239,68,68,0.1)',
                              border: '1px solid rgba(239,68,68,0.2)',
                              borderRadius: '6px',
                              color: '#ef4444',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <Trash2 style={{ width: '0.75rem', height: '0.75rem' }} />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Spin keyframe via <style> injection (no CSS Modules available) */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default AdminKnowledgePanel;
