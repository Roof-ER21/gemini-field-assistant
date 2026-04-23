import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  ThumbsUp,
  Loader,
  X,
} from 'lucide-react';
import { API_BASE_URL } from '../services/config';
import { authService } from '../services/authService';
import { getAdminHeaders } from '../services/adminAuth';

// ─── Types ───────────────────────────────────────────────────────────────────

type LearningStatus = 'pending' | 'approved' | 'rejected';

interface GlobalLearning {
  id: string;
  content: string;
  state: string | null;
  insurer_name: string | null;
  helpful_count: number;
  total_count: number;
  created_at: string;
  status: LearningStatus;
  source_feedback?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  return getAdminHeaders();
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/New_York',
    });
  } catch {
    return iso;
  }
}

function HelpfulRatio({ helpful, total }: { helpful: number; total: number }) {
  const pct = total > 0 ? Math.round((helpful / total) * 100) : 0;
  const color = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#6b7280';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '0.6875rem',
        fontWeight: 600,
        background: color + '22',
        color,
      }}
    >
      <ThumbsUp style={{ width: '0.625rem', height: '0.625rem' }} />
      {helpful}/{total} ({pct}%)
    </span>
  );
}

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
      }}
    >
      {state}
    </span>
  );
}

function InsurerBadge({ name }: { name: string | null }) {
  if (!name) return null;
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '0.6875rem',
        fontWeight: 500,
        background: 'rgba(99,102,241,0.15)',
        color: '#818cf8',
      }}
    >
      {name}
    </span>
  );
}

// ─── Learning Card ────────────────────────────────────────────────────────────

interface LearningCardProps {
  item: GlobalLearning;
  onApprove?: (id: string) => Promise<void>;
  onReject?: (id: string) => Promise<void>;
  actioning: string | null;
}

const LearningCard: React.FC<LearningCardProps> = ({ item, onApprove, onReject, actioning }) => {
  const isPending = item.status === 'pending';
  const isActioning = actioning === item.id;

  const leftBorderColor =
    item.status === 'approved'
      ? '#10b981'
      : item.status === 'rejected'
      ? '#ef4444'
      : 'transparent';

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderLeft: `3px solid ${leftBorderColor}`,
        borderRadius: '12px',
        padding: '1rem',
      }}
    >
      {/* Badge row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.625rem', alignItems: 'center' }}>
        <StateBadge state={item.state} />
        <InsurerBadge name={item.insurer_name} />
        <HelpfulRatio helpful={item.helpful_count} total={item.total_count} />
        <span style={{ marginLeft: 'auto', fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
          {formatDate(item.created_at)}
        </span>
      </div>

      {/* Content */}
      <p
        style={{
          margin: '0 0 0.625rem',
          fontSize: '0.875rem',
          color: 'var(--text-secondary)',
          lineHeight: '1.6',
        }}
      >
        {item.content}
      </p>

      {/* Source feedback excerpt */}
      {item.source_feedback && (
        <blockquote
          style={{
            margin: '0 0 0.75rem',
            padding: '0.5rem 0.75rem',
            borderLeft: '2px solid rgba(255,255,255,0.1)',
            color: 'var(--text-tertiary)',
            fontSize: '0.75rem',
            fontStyle: 'italic',
            lineHeight: '1.5',
          }}
        >
          &ldquo;
          {item.source_feedback.length > 160
            ? item.source_feedback.slice(0, 160) + '…'
            : item.source_feedback}
          &rdquo;
        </blockquote>
      )}

      {/* Action buttons — only for pending items */}
      {isPending && onApprove && onReject && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => onApprove(item.id)}
            disabled={isActioning}
            style={{
              padding: '0.375rem 0.75rem',
              background: '#10b981',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: isActioning ? 'not-allowed' : 'pointer',
              opacity: isActioning ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            {isActioning ? (
              <Loader style={{ width: '0.75rem', height: '0.75rem', animation: 'spin 1s linear infinite' }} />
            ) : (
              <CheckCircle style={{ width: '0.75rem', height: '0.75rem' }} />
            )}
            Approve
          </button>
          <button
            onClick={() => onReject(item.id)}
            disabled={isActioning}
            style={{
              padding: '0.375rem 0.75rem',
              background: '#ef4444',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: isActioning ? 'not-allowed' : 'pointer',
              opacity: isActioning ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            {isActioning ? (
              <Loader style={{ width: '0.75rem', height: '0.75rem', animation: 'spin 1s linear infinite' }} />
            ) : (
              <XCircle style={{ width: '0.75rem', height: '0.75rem' }} />
            )}
            Reject
          </button>
        </div>
      )}

      {/* Status stamp for approved/rejected */}
      {!isPending && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.6875rem',
            fontWeight: 600,
            color: item.status === 'approved' ? '#10b981' : '#ef4444',
          }}
        >
          {item.status === 'approved' ? (
            <CheckCircle style={{ width: '0.75rem', height: '0.75rem' }} />
          ) : (
            <XCircle style={{ width: '0.75rem', height: '0.75rem' }} />
          )}
          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const AdminLearningsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LearningStatus>('pending');
  const [learnings, setLearnings] = useState<GlobalLearning[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const fetchLearnings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/learnings?status=${activeTab}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLearnings(Array.isArray(data) ? data : data.learnings || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load learnings');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchLearnings();
  }, [fetchLearnings]);

  const handleApprove = async (id: string) => {
    setActioning(id);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/learnings/${id}/approve`, {
        method: 'PUT',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Remove from current list (it's been moved to approved)
      setLearnings(prev => prev.filter(l => l.id !== id));
    } catch (err: any) {
      alert(`Approve failed: ${err.message}`);
    } finally {
      setActioning(null);
    }
  };

  const handleReject = async (id: string) => {
    setActioning(id);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/learnings/${id}/reject`, {
        method: 'PUT',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLearnings(prev => prev.filter(l => l.id !== id));
    } catch (err: any) {
      alert(`Reject failed: ${err.message}`);
    } finally {
      setActioning(null);
    }
  };

  // ── Tab config ──

  const TABS: { key: LearningStatus; label: string; dotColor: string }[] = [
    { key: 'pending', label: 'Pending', dotColor: '#f59e0b' },
    { key: 'approved', label: 'Approved', dotColor: '#10b981' },
    { key: 'rejected', label: 'Rejected', dotColor: '#ef4444' },
  ];

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Global Learnings
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
            Approve or reject AI-generated field learnings
          </p>
        </div>
        <button
          onClick={fetchLearnings}
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

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: '0.25rem',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: '10px',
          padding: '0.25rem',
        }}
      >
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: '0.5rem 0.75rem',
              background: activeTab === tab.key ? 'rgba(255,255,255,0.08)' : 'transparent',
              border: 'none',
              borderRadius: '8px',
              color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-tertiary)',
              fontSize: '0.875rem',
              fontWeight: activeTab === tab.key ? 600 : 400,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.375rem',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: tab.dotColor,
                flexShrink: 0,
              }}
            />
            {tab.label}
            {activeTab === tab.key && !loading && (
              <span
                style={{
                  padding: '0 5px',
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '999px',
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  minWidth: '1.25rem',
                  textAlign: 'center',
                }}
              >
                {learnings.length}
              </span>
            )}
          </button>
        ))}
      </div>

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

      {/* List */}
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
          Loading {activeTab} learnings…
        </div>
      ) : learnings.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <p style={{ margin: 0 }}>
            No {activeTab} learnings.
            {activeTab === 'pending' && " You're all caught up!"}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {learnings.map(item => (
            <LearningCard
              key={item.id}
              item={item}
              onApprove={activeTab === 'pending' ? handleApprove : undefined}
              onReject={activeTab === 'pending' ? handleReject : undefined}
              actioning={actioning}
            />
          ))}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default AdminLearningsPanel;
