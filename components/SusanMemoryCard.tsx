/**
 * SusanMemoryCard — "What Susan knows about me"
 * Shows the rep the memories Susan has learned about them and lets them
 * remove anything wrong or stale. Transparency = trust.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Brain, Trash2, RefreshCw } from 'lucide-react';
import memoryService, { UserMemory } from '../services/memoryService';

const CATEGORY_LABELS: Record<string, string> = {
  preferred_name: 'What she calls you',
  state: 'Where you work',
  insurer: 'Insurers you deal with',
  company: 'Company',
  expertise: 'Your experience',
  style: 'How you like answers',
  communication: 'Communication style',
  workflow: 'Your workflow',
  job: 'Jobs mentioned',
  agent_personality: 'Susan personality settings',
  email_success: 'Email patterns learned',
  storm_verification: 'Storm lookups remembered',
  conversation_outcome: 'Conversation outcomes',
};

// Categories whose raw values are JSON blobs — show a friendly one-liner instead
const summarizeValue = (m: UserMemory): string => {
  if (m.category === 'email_success' || m.category === 'storm_verification' || m.category === 'conversation_outcome') {
    try {
      const data = JSON.parse(m.value);
      if (m.category === 'storm_verification') {
        return `${data.address || 'Address'} — ${data.events?.length ?? 0} storm events`;
      }
      if (m.category === 'email_success') {
        return `${data.situation || 'Email'}${data.state ? ` (${data.state})` : ''}${data.outcome ? ` — ${data.outcome}` : ''}`;
      }
      return data.summary || data.situation || m.value.slice(0, 80);
    } catch {
      return m.value.slice(0, 80);
    }
  }
  return m.value;
};

const SusanMemoryCard: React.FC = () => {
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await memoryService.getAllUserMemories(200);
      // Highest-confidence first, hide near-zero-confidence noise
      setMemories(all.filter(m => m.confidence >= 0.3).sort((a, b) => b.confidence - a.confidence));
    } catch (e) {
      console.warn('[SusanMemoryCard] load failed:', e);
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleForget = async (m: UserMemory) => {
    if (deleting) return;
    setDeleting(m.id);
    try {
      await memoryService.deleteMemory(m.id);
      setMemories(prev => prev.filter(x => x.id !== m.id));
    } catch (e) {
      console.error('[SusanMemoryCard] delete failed:', e);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-default)',
      borderRadius: '12px',
      padding: '1.25rem',
      marginTop: '1.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Brain size={18} style={{ color: '#dc2626' }} />
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            What Susan knows about you
          </h3>
        </div>
        <button
          onClick={load}
          title="Refresh"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '4px' }}
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
        Susan learns from your chats to personalize her help. Remove anything that's wrong — she won't bring it back unless you mention it again.
      </p>

      {loading ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', padding: '0.75rem 0' }}>Loading…</div>
      ) : memories.length === 0 ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', padding: '0.75rem 0' }}>
          Nothing yet — Susan learns as you chat. Mention your state, insurers, or how you like answers and she'll remember.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' }}>
          {memories.map(m => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                padding: '8px 12px',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.7rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                  {CATEGORY_LABELS[m.category] || m.category.replace(/_/g, ' ')}
                </div>
                <div style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {summarizeValue(m)}
                </div>
              </div>
              <button
                onClick={() => handleForget(m)}
                disabled={deleting === m.id}
                title="Make Susan forget this"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: deleting === m.id ? 'wait' : 'pointer',
                  color: 'var(--text-tertiary)',
                  padding: '6px',
                  flexShrink: 0,
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SusanMemoryCard;
