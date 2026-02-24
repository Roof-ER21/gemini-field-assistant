import React, { useState, useEffect, useCallback } from 'react';
import {
  Network,
  ThumbsUp,
  ThumbsDown,
  Send,
  Filter,
  CheckCircle,
  XCircle,
  ArrowUpCircle,
  Clock,
  Shield,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { authService } from '../services/authService';
import { getApiBaseUrl } from '../services/config';

interface IntelMessage {
  id: string;
  author_user_id: string;
  author_name: string;
  author_email: string;
  intel_type: string;
  content: string;
  state: string | null;
  insurer: string | null;
  status: string;
  upvotes: number;
  downvotes: number;
  promoted_to_global_learning_id: string | null;
  created_at: string;
}

const INTEL_TYPES = [
  { value: 'insurer_tactic', label: 'Insurer Tactic', color: '#ef4444' },
  { value: 'adjuster_behavior', label: 'Adjuster Behavior', color: '#f59e0b' },
  { value: 'state_tip', label: 'State Tip', color: '#3b82f6' },
  { value: 'supplement_win', label: 'Supplement Win', color: '#10b981' },
  { value: 'claim_process', label: 'Claim Process', color: '#8b5cf6' },
  { value: 'general', label: 'General', color: '#6b7280' },
];

const AgentNetworkPanel: React.FC = () => {
  const [messages, setMessages] = useState<IntelMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('');
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitType, setSubmitType] = useState('general');
  const [submitContent, setSubmitContent] = useState('');
  const [submitState, setSubmitState] = useState('');
  const [submitInsurer, setSubmitInsurer] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const apiBase = getApiBaseUrl();
  const user = authService.getCurrentUser();
  const email = user?.email || '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(email ? { 'x-user-email': email } : {}),
  };

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.set('intel_type', filterType);
      const res = await fetch(`${apiBase}/agent-network?${params}`, { headers });
      if (res.ok) setMessages(await res.json());
    } catch (err) {
      console.error('[AgentNetwork] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  const handleVote = async (id: string, vote_type: 'up' | 'down') => {
    try {
      await fetch(`${apiBase}/agent-network/${id}/vote`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ vote_type }),
      });
      fetchFeed();
    } catch (err) {
      console.error('[AgentNetwork] Vote error:', err);
    }
  };

  const handleSubmit = async () => {
    if (!submitContent.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/agent-network`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          intel_type: submitType,
          content: submitContent,
          state: submitState || undefined,
          insurer: submitInsurer || undefined,
        }),
      });
      if (res.ok) {
        setSubmitContent('');
        setSubmitState('');
        setSubmitInsurer('');
        setShowSubmit(false);
        fetchFeed();
      }
    } catch (err) {
      console.error('[AgentNetwork] Submit error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const getTypeInfo = (type: string) =>
    INTEL_TYPES.find(t => t.value === type) || INTEL_TYPES[5];

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Network style={{ width: '1.5rem', height: '1.5rem', color: '#dc2626' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#ffffff', margin: 0 }}>Agent Intel Feed</h2>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => fetchFeed()}
            style={{
              padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', color: '#9ca3af', cursor: 'pointer'
            }}
          >
            <RefreshCw style={{ width: '1rem', height: '1rem' }} />
          </button>
          <button
            onClick={() => setShowSubmit(!showSubmit)}
            style={{
              padding: '0.5rem 1rem', background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
              border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600', fontSize: '0.875rem'
            }}
          >
            <Send style={{ width: '0.875rem', height: '0.875rem' }} />
            Share Intel
          </button>
        </div>
      </div>

      {/* Submit Form */}
      {showSubmit && (
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px', padding: '1.25rem', marginBottom: '1.25rem'
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            {INTEL_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setSubmitType(t.value)}
                style={{
                  padding: '0.375rem 0.75rem', border: 'none', borderRadius: '999px', cursor: 'pointer',
                  fontSize: '0.75rem', fontWeight: '600',
                  background: submitType === t.value ? t.color : 'rgba(255,255,255,0.05)',
                  color: submitType === t.value ? '#fff' : '#9ca3af'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={submitContent}
            onChange={e => setSubmitContent(e.target.value)}
            placeholder="Share what you learned in the field..."
            rows={3}
            style={{
              width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', padding: '0.75rem', color: '#ffffff', fontSize: '0.875rem',
              resize: 'vertical', outline: 'none', boxSizing: 'border-box'
            }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <input
              value={submitState}
              onChange={e => setSubmitState(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="State (e.g. TX)"
              style={{
                flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#ffffff', fontSize: '0.8125rem', outline: 'none'
              }}
            />
            <input
              value={submitInsurer}
              onChange={e => setSubmitInsurer(e.target.value)}
              placeholder="Insurer (optional)"
              style={{
                flex: 2, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#ffffff', fontSize: '0.8125rem', outline: 'none'
              }}
            />
            <button
              onClick={handleSubmit}
              disabled={submitting || !submitContent.trim()}
              style={{
                padding: '0.5rem 1.25rem', background: submitting ? '#555' : 'linear-gradient(135deg, #dc2626, #b91c1c)',
                border: 'none', borderRadius: '8px', color: '#fff', cursor: submitting ? 'default' : 'pointer',
                fontWeight: '600', fontSize: '0.8125rem'
              }}
            >
              {submitting ? 'Sending...' : 'Submit'}
            </button>
          </div>
        </div>
      )}

      {/* Filter Chips */}
      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button
          onClick={() => setFilterType('')}
          style={{
            padding: '0.25rem 0.625rem', border: 'none', borderRadius: '999px', cursor: 'pointer',
            fontSize: '0.75rem', fontWeight: '500',
            background: !filterType ? '#dc2626' : 'rgba(255,255,255,0.05)',
            color: !filterType ? '#fff' : '#9ca3af'
          }}
        >
          All
        </button>
        {INTEL_TYPES.map(t => (
          <button
            key={t.value}
            onClick={() => setFilterType(t.value)}
            style={{
              padding: '0.25rem 0.625rem', border: 'none', borderRadius: '999px', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: '500',
              background: filterType === t.value ? t.color : 'rgba(255,255,255,0.05)',
              color: filterType === t.value ? '#fff' : '#9ca3af'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading intel...</div>
      ) : messages.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          <Network style={{ width: '3rem', height: '3rem', margin: '0 auto 1rem', opacity: 0.3 }} />
          <p style={{ margin: 0 }}>No approved intel yet. Be the first to share!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {messages.map(msg => {
            const typeInfo = getTypeInfo(msg.intel_type);
            return (
              <div
                key={msg.id}
                style={{
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px', padding: '1rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                      padding: '0.125rem 0.5rem', borderRadius: '999px', fontSize: '0.6875rem',
                      fontWeight: '600', background: `${typeInfo.color}22`, color: typeInfo.color
                    }}>
                      {typeInfo.label}
                    </span>
                    {msg.state && (
                      <span style={{ fontSize: '0.6875rem', color: '#6b7280' }}>{msg.state}</span>
                    )}
                    {msg.insurer && (
                      <span style={{ fontSize: '0.6875rem', color: '#6b7280' }}>• {msg.insurer}</span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.6875rem', color: '#4b5563' }}>{timeAgo(msg.created_at)}</span>
                </div>

                <p style={{ margin: '0 0 0.75rem', color: '#e5e7eb', fontSize: '0.875rem', lineHeight: '1.5' }}>
                  {msg.content}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {msg.author_name || msg.author_email?.split('@')[0]}
                  </span>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    {msg.promoted_to_global_learning_id && (
                      <span style={{ fontSize: '0.6875rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <ArrowUpCircle style={{ width: '0.75rem', height: '0.75rem' }} />
                        Promoted
                      </span>
                    )}
                    <button
                      onClick={() => handleVote(msg.id, 'up')}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280',
                        display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', padding: '0.25rem'
                      }}
                    >
                      <ThumbsUp style={{ width: '0.875rem', height: '0.875rem' }} />
                      {msg.upvotes > 0 && msg.upvotes}
                    </button>
                    <button
                      onClick={() => handleVote(msg.id, 'down')}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280',
                        display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', padding: '0.25rem'
                      }}
                    >
                      <ThumbsDown style={{ width: '0.875rem', height: '0.875rem' }} />
                      {msg.downvotes > 0 && msg.downvotes}
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

export default AgentNetworkPanel;
