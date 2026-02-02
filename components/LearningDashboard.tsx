import React, { useEffect, useState } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, CheckCircle, XCircle } from 'lucide-react';
import { databaseService } from '../services/databaseService';
import { getApiBaseUrl } from '../services/config';
import { authService } from '../services/authService';
import { memoryService, UserMemory } from '../services/memoryService';

const windows = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 }
];

const normalizeTag = (tag: string) => tag.toLowerCase().replace(/\s+/g, ' ').trim();

const clusterTags = (tags: Array<{ tag: string; count: number }>) => {
  const clusters = new Map<string, { label: string; total: number; items: Array<{ tag: string; count: number }> }>();
  tags.forEach((t) => {
    const normalized = normalizeTag(t.tag || '');
    if (!normalized) return;
    const base = normalized.split(/[:\-–—]/)[0].trim() || normalized;
    const key = base.length < 3 ? normalized : base;
    const existing = clusters.get(key) || { label: key, total: 0, items: [] };
    existing.total += t.count || 0;
    existing.items.push(t);
    clusters.set(key, existing);
  });
  return Array.from(clusters.values()).sort((a, b) => b.total - a.total);
};

const buildMergeOptions = (approved: any[], pending: any[]) => {
  const merged = new Map<string, any>();
  [...approved, ...pending].forEach((item) => {
    if (!item?.id) return;
    merged.set(item.id, item);
  });
  return Array.from(merged.values());
};

const LearningDashboard: React.FC = () => {
  const [windowDays, setWindowDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [globalLearnings, setGlobalLearnings] = useState<any[]>([]);
  const [pendingCandidates, setPendingCandidates] = useState<any[]>([]);
  const [followups, setFollowups] = useState<any[]>([]);
  const [outcomeNotes, setOutcomeNotes] = useState<Record<string, string>>({});
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [editingContent, setEditingContent] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});
  const isAdmin = authService.getCurrentUser()?.role === 'admin';
  const mergeOptions = buildMergeOptions(globalLearnings, pendingCandidates);
  const hasMergeTargets = (id: string) => mergeOptions.some((g: any) => g.id && g.id !== id);

  const fetchSummary = async (days = windowDays) => {
    try {
      setLoading(true);
      setError(null);
      const data = await databaseService.getChatLearningSummary(days);
      setSummary(data);
      const followupData = await databaseService.getFeedbackFollowups('pending');
      setFollowups(followupData);

      const apiBaseUrl = getApiBaseUrl();
      const selectedState = localStorage.getItem('selectedState') || '';
      const params = new URLSearchParams();
      if (selectedState) params.set('state', selectedState);
      params.set('limit', '8');
      const email = authService.getCurrentUser()?.email || '';
      const isAdmin = authService.getCurrentUser()?.role === 'admin';
      if (isAdmin) {
        const adminApproved = await fetch(`${apiBaseUrl}/admin/learning?status=approved`, {
          headers: {
            ...(email ? { 'x-user-email': email } : {})
          }
        });
        if (adminApproved.ok) {
          const payload = await adminApproved.json();
          setGlobalLearnings(payload.candidates || []);
        }
      } else {
        const globalRes = await fetch(`${apiBaseUrl}/learning/global?${params.toString()}`, {
          headers: {
            ...(email ? { 'x-user-email': email } : {})
          }
        });
        if (globalRes.ok) {
          const payload = await globalRes.json();
          setGlobalLearnings(payload.learnings || []);
        }
      }

      if (isAdmin) {
        const adminRes = await fetch(`${apiBaseUrl}/admin/learning?status=ready`, {
          headers: {
            ...(email ? { 'x-user-email': email } : {})
          }
        });
        if (adminRes.ok) {
          const payload = await adminRes.json();
          setPendingCandidates(payload.candidates || []);
        } else {
          setPendingCandidates([]);
        }
      } else {
        setPendingCandidates([]);
      }

      setMemoryLoading(true);
      const memoryList = await memoryService.getAllUserMemories(40);
      setMemories(memoryList);
      setMemoryLoading(false);
    } catch (err) {
      setError((err as Error).message || 'Failed to load learning data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary(windowDays);
  }, [windowDays]);

  const positiveTotal = (summary?.positive_tags || []).reduce((sum: number, t: any) => sum + (t.count || 0), 0);
  const negativeTotal = (summary?.negative_tags || []).reduce((sum: number, t: any) => sum + (t.count || 0), 0);
  const totals = summary?.totals || {};
  const weekly = summary?.weekly || {};
  const positiveClusters = clusterTags(summary?.positive_tags || []);
  const negativeClusters = clusterTags(summary?.negative_tags || []);
  const weeklyDelta = (weekly.total_last7 || 0) - (weekly.total_prev7 || 0);
  const weeklyTrend = weeklyDelta === 0 ? 'flat' : weeklyDelta > 0 ? 'up' : 'down';

  const handleOutcomeSubmit = async (feedbackId: string, status: string) => {
    const notes = outcomeNotes[feedbackId];
    const ok = await databaseService.submitFeedbackOutcome(feedbackId, status, notes);
    if (ok) {
      setFollowups(prev => prev.filter(f => f.feedback_id !== feedbackId));
    }
  };

  const handleAdminDecision = async (id: string, decision: 'approve' | 'reject') => {
    const apiBaseUrl = getApiBaseUrl();
    const email = authService.getCurrentUser()?.email || '';
    await fetch(`${apiBaseUrl}/admin/learning/${id}/${decision}`, {
      method: 'POST',
      headers: {
        ...(email ? { 'x-user-email': email } : {})
      }
    });
    setPendingCandidates(prev => prev.filter(c => c.id !== id));
    fetchSummary(windowDays);
  };

  const handleLearningUpdate = async (id: string, content: string) => {
    const apiBaseUrl = getApiBaseUrl();
    const email = authService.getCurrentUser()?.email || '';
    const res = await fetch(`${apiBaseUrl}/admin/learning/${id}/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(email ? { 'x-user-email': email } : {})
      },
      body: JSON.stringify({ content })
    });
    if (res.ok) {
      const payload = await res.json();
      setGlobalLearnings(prev => prev.map(l => (l.id === id ? payload.learning : l)));
      setPendingCandidates(prev => prev.map(l => (l.id === id ? payload.learning : l)));
      setEditingId(null);
      fetchSummary(windowDays);
    }
  };

  const handleLearningDisable = async (id: string) => {
    const apiBaseUrl = getApiBaseUrl();
    const email = authService.getCurrentUser()?.email || '';
    await fetch(`${apiBaseUrl}/admin/learning/${id}/disable`, {
      method: 'POST',
      headers: {
        ...(email ? { 'x-user-email': email } : {})
      }
    });
    setGlobalLearnings(prev => prev.filter(l => l.id !== id));
  };

  const handleLearningMerge = async (sourceId: string, targetId: string) => {
    const apiBaseUrl = getApiBaseUrl();
    const email = authService.getCurrentUser()?.email || '';
    await fetch(`${apiBaseUrl}/admin/learning/merge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(email ? { 'x-user-email': email } : {})
      },
      body: JSON.stringify({ source_id: sourceId, target_id: targetId })
    });
    setPendingCandidates(prev => prev.filter(c => c.id !== sourceId));
    fetchSummary(windowDays);
  };

  const handleMemoryFeedback = async (memoryId: string, feedback: 'helpful' | 'incorrect' | 'irrelevant') => {
    await memoryService.updateMemoryFeedback(memoryId, feedback);
    const updated = await memoryService.getAllUserMemories(40);
    setMemories(updated);
  };

  const handleMemoryDelete = async (memoryId: string) => {
    await memoryService.deleteMemory(memoryId);
    setMemories(prev => prev.filter(m => m.id !== memoryId));
  };

  return (
    <div className="roof-er-content-area">
      <div className="roof-er-content-scroll" style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h1 className="roof-er-page-title" style={{ marginBottom: '0.35rem' }}>Susan 21 Learning Dashboard</h1>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              What the team says is working — and what needs improvement.
            </div>
          </div>
          <button
            onClick={() => fetchSummary(windowDays)}
            className="roof-er-header-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          {windows.map((w) => (
            <button
              key={w.value}
              onClick={() => setWindowDays(w.value)}
              style={{
                padding: '0.5rem 0.9rem',
                borderRadius: '999px',
                border: windowDays === w.value ? '1px solid rgba(220,38,38,0.7)' : '1px solid rgba(255,255,255,0.1)',
                background: windowDays === w.value ? 'rgba(220,38,38,0.2)' : 'rgba(20,20,20,0.5)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              {w.label}
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Loading learning insights...</div>
        )}
        {error && (
          <div style={{ color: 'var(--error)', fontSize: '0.95rem' }}>{error}</div>
        )}
        {!loading && !error && !summary && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>No feedback yet.</div>
        )}

        {summary && (
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '1rem' }}>
              <div style={{ background: 'rgba(16,16,16,0.6)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                  <TrendingUp className="w-4 h-4" style={{ color: '#22c55e' }} />
                  <span style={{ fontWeight: 600 }}>Working</span>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{positiveTotal || 0}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>total positive tags</div>
              </div>
              <div style={{ background: 'rgba(16,16,16,0.6)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                  <TrendingDown className="w-4 h-4" style={{ color: '#f87171' }} />
                  <span style={{ fontWeight: 600 }}>Needs Work</span>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{negativeTotal || 0}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>total negative tags</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '1rem' }}>
              <div style={{ background: 'rgba(16,16,16,0.6)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Weekly Insight</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                  {weekly.total_last7 || 0} feedback
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  {weeklyTrend === 'up' ? '▲' : weeklyTrend === 'down' ? '▼' : '•'} {Math.abs(weeklyDelta)} vs prior 7 days
                </div>
              </div>
              <div style={{ background: 'rgba(16,16,16,0.6)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Window Totals</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                  {totals.total_window || 0} entries
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  {totals.positive_window || 0} 👍 • {totals.negative_window || 0} 👎
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1rem' }}>
              <div style={{ background: 'rgba(16,16,16,0.6)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Top “Working” Tags</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {(summary.positive_tags || []).slice(0, 8).map((t: any) => (
                    <span
                      key={`pos-${t.tag}`}
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '999px',
                        border: '1px solid rgba(34,197,94,0.35)',
                        background: 'rgba(34,197,94,0.12)',
                        color: '#bbf7d0'
                      }}
                    >
                      {t.tag} · {t.count}
                    </span>
                  ))}
                  {(summary.positive_tags || []).length === 0 && (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No tags yet</span>
                  )}
                </div>
              </div>

              <div style={{ background: 'rgba(16,16,16,0.6)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Top “Needs Work” Tags</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {(summary.negative_tags || []).slice(0, 8).map((t: any) => (
                    <span
                      key={`neg-${t.tag}`}
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '999px',
                        border: '1px solid rgba(248,113,113,0.35)',
                        background: 'rgba(248,113,113,0.12)',
                        color: '#fecaca'
                      }}
                    >
                      {t.tag} · {t.count}
                    </span>
                  ))}
                  {(summary.negative_tags || []).length === 0 && (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No tags yet</span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1rem' }}>
              <div style={{ background: 'rgba(16,16,16,0.6)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Working Tag Clusters</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {positiveClusters.slice(0, 6).map((cluster) => (
                    <div key={`pos-cluster-${cluster.label}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      <span>{cluster.label}</span>
                      <span>{cluster.total}</span>
                    </div>
                  ))}
                  {positiveClusters.length === 0 && (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No clusters yet</span>
                  )}
                </div>
              </div>

              <div style={{ background: 'rgba(16,16,16,0.6)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Needs Work Clusters</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {negativeClusters.slice(0, 6).map((cluster) => (
                    <div key={`neg-cluster-${cluster.label}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      <span>{cluster.label}</span>
                      <span>{cluster.total}</span>
                    </div>
                  ))}
                  {negativeClusters.length === 0 && (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No clusters yet</span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1rem' }}>
              <div style={{ background: 'rgba(16,16,16,0.6)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Recent Wins</div>
                <div style={{ display: 'grid', gap: '0.6rem' }}>
                  {(summary.recent_wins || []).slice(0, 6).map((w: any, idx: number) => (
                    <div key={`win-${idx}`} style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      {w.comment}
                    </div>
                  ))}
                  {(summary.recent_wins || []).length === 0 && (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No wins yet</span>
                  )}
                </div>
              </div>

              <div style={{ background: 'rgba(16,16,16,0.6)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Recent Issues</div>
                <div style={{ display: 'grid', gap: '0.6rem' }}>
                  {(summary.recent_issues || []).slice(0, 6).map((w: any, idx: number) => (
                    <div key={`issue-${idx}`} style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      {w.comment}
                    </div>
                  ))}
                  {(summary.recent_issues || []).length === 0 && (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No issues yet</span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1rem' }}>
              <div style={{ background: 'rgba(16,16,16,0.6)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Your Memory</div>
                {memoryLoading && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading memories...</div>
                )}
                {!memoryLoading && memories.length === 0 && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No saved memories yet</div>
                )}
                {!memoryLoading && memories.length > 0 && (
                  <div style={{ display: 'grid', gap: '0.6rem' }}>
                    {memories.map((memory) => (
                      <div key={memory.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.6rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                          {memory.category} · {memory.memory_type} · {Math.round((memory.confidence || 0) * 100)}%
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{memory.value}</div>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => handleMemoryFeedback(memory.id, 'helpful')}
                            style={{
                              padding: '0.2rem 0.6rem',
                              borderRadius: '999px',
                              border: '1px solid rgba(34,197,94,0.5)',
                              background: 'rgba(34,197,94,0.12)',
                              color: '#bbf7d0',
                              fontSize: '0.7rem',
                              cursor: 'pointer'
                            }}
                          >
                            Helpful
                          </button>
                          <button
                            onClick={() => handleMemoryFeedback(memory.id, 'incorrect')}
                            style={{
                              padding: '0.2rem 0.6rem',
                              borderRadius: '999px',
                              border: '1px solid rgba(248,113,113,0.5)',
                              background: 'rgba(248,113,113,0.12)',
                              color: '#fecaca',
                              fontSize: '0.7rem',
                              cursor: 'pointer'
                            }}
                          >
                            Incorrect
                          </button>
                          <button
                            onClick={() => handleMemoryFeedback(memory.id, 'irrelevant')}
                            style={{
                              padding: '0.2rem 0.6rem',
                              borderRadius: '999px',
                              border: '1px solid rgba(148,163,184,0.5)',
                              background: 'rgba(148,163,184,0.12)',
                              color: 'var(--text-secondary)',
                              fontSize: '0.7rem',
                              cursor: 'pointer'
                            }}
                          >
                            Irrelevant
                          </button>
                          <button
                            onClick={() => handleMemoryDelete(memory.id)}
                            style={{
                              padding: '0.2rem 0.6rem',
                              borderRadius: '999px',
                              border: '1px solid rgba(248,113,113,0.5)',
                              background: 'rgba(248,113,113,0.08)',
                              color: '#fecaca',
                              fontSize: '0.7rem',
                              cursor: 'pointer'
                            }}
                          >
                            Forget
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ background: 'rgba(16,16,16,0.6)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Global Learnings (Approved)</div>
                <div style={{ display: 'grid', gap: '0.6rem' }}>
                  {globalLearnings.length === 0 && (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No approved learnings yet</span>
                  )}
                  {globalLearnings.map((l: any) => (
                    <div key={l.id} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {editingId === l.id ? (
                        <textarea
                          value={editingContent[l.id] ?? l.content}
                          onChange={(e) => setEditingContent(prev => ({ ...prev, [l.id]: e.target.value }))}
                          style={{
                            width: '100%',
                            minHeight: '70px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255,255,255,0.12)',
                            background: 'rgba(12,12,12,0.55)',
                            color: 'var(--text-primary)',
                            padding: '0.5rem',
                            fontSize: '0.8rem'
                          }}
                        />
                      ) : (
                        <div>{l.content}</div>
                      )}
                      {l.helpful_count ? <span style={{ marginLeft: '0.4rem', color: 'var(--text-tertiary)' }}>· {l.helpful_count} wins</span> : null}
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                          {editingId === l.id ? (
                            <>
                              <button
                                onClick={() => handleLearningUpdate(l.id, editingContent[l.id] ?? l.content)}
                                style={{
                                  padding: '0.25rem 0.6rem',
                                  borderRadius: '8px',
                                  border: '1px solid rgba(34,197,94,0.6)',
                                  background: 'rgba(34,197,94,0.15)',
                                  color: '#bbf7d0',
                                  cursor: 'pointer',
                                  fontSize: '0.7rem'
                                }}
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                style={{
                                  padding: '0.25rem 0.6rem',
                                  borderRadius: '8px',
                                  border: '1px solid rgba(148,163,184,0.5)',
                                  background: 'rgba(148,163,184,0.1)',
                                  color: 'var(--text-secondary)',
                                  cursor: 'pointer',
                                  fontSize: '0.7rem'
                                }}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setEditingId(l.id);
                                  setEditingContent(prev => ({ ...prev, [l.id]: l.content }));
                                }}
                                style={{
                                  padding: '0.25rem 0.6rem',
                                  borderRadius: '8px',
                                  border: '1px solid rgba(148,163,184,0.5)',
                                  background: 'rgba(148,163,184,0.1)',
                                  color: 'var(--text-secondary)',
                                  cursor: 'pointer',
                                  fontSize: '0.7rem'
                                }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleLearningDisable(l.id)}
                                style={{
                                  padding: '0.25rem 0.6rem',
                                  borderRadius: '8px',
                                  border: '1px solid rgba(248,113,113,0.6)',
                                  background: 'rgba(248,113,113,0.15)',
                                  color: '#fecaca',
                                  cursor: 'pointer',
                                  fontSize: '0.7rem'
                                }}
                              >
                                Disable
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: 'rgba(16,16,16,0.6)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Outcome Follow-ups</div>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {followups.length === 0 && (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No follow-ups due</span>
                  )}
                  {followups.map((f: any) => (
                    <div key={f.feedback_id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.65rem' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>
                        Due {new Date(f.due_at).toLocaleDateString()}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        {f.comment || f.response_excerpt || 'Follow-up on Susan response'}
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                        {['full_approved', 'partial', 'denied', 'no_response'].map((status) => (
                          <button
                            key={`${f.feedback_id}-${status}`}
                            onClick={() => handleOutcomeSubmit(f.feedback_id, status)}
                            style={{
                              padding: '0.25rem 0.6rem',
                              borderRadius: '999px',
                              border: '1px solid rgba(255,255,255,0.12)',
                              background: 'rgba(12,12,12,0.5)',
                              color: 'var(--text-primary)',
                              fontSize: '0.7rem',
                              cursor: 'pointer'
                            }}
                          >
                            {status.replace('_', ' ')}
                          </button>
                        ))}
                      </div>
                      <input
                        value={outcomeNotes[f.feedback_id] || ''}
                        onChange={(e) => setOutcomeNotes(prev => ({ ...prev, [f.feedback_id]: e.target.value }))}
                        placeholder="Optional notes"
                        style={{
                          width: '100%',
                          padding: '0.4rem 0.6rem',
                          borderRadius: '8px',
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: 'rgba(12,12,12,0.45)',
                          color: 'var(--text-primary)',
                          fontSize: '0.75rem'
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {isAdmin && (
              <div style={{ background: 'rgba(16,16,16,0.6)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Admin: Ready for Approval</div>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {pendingCandidates.length === 0 && (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No candidates ready yet</span>
                  )}
                  {pendingCandidates.map((c: any) => (
                    <div key={c.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.65rem' }}>
                      {editingId === c.id ? (
                        <textarea
                          value={editingContent[c.id] ?? c.content}
                          onChange={(e) => setEditingContent(prev => ({ ...prev, [c.id]: e.target.value }))}
                          style={{
                            width: '100%',
                            minHeight: '70px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255,255,255,0.12)',
                            background: 'rgba(12,12,12,0.55)',
                            color: 'var(--text-primary)',
                            padding: '0.5rem',
                            fontSize: '0.8rem',
                            marginBottom: '0.4rem'
                          }}
                        />
                      ) : (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{c.content}</div>
                      )}
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>
                        {c.scope_state ? `State: ${c.scope_state} · ` : ''}{c.scope_insurer ? `Insurer: ${c.scope_insurer} · ` : ''}{c.scope_adjuster ? `Adjuster: ${c.scope_adjuster}` : ''}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handleAdminDecision(c.id, 'approve')}
                          style={{
                            padding: '0.35rem 0.7rem',
                            borderRadius: '8px',
                            border: '1px solid rgba(34,197,94,0.6)',
                            background: 'rgba(34,197,94,0.15)',
                            color: '#bbf7d0',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            fontSize: '0.75rem'
                          }}
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Approve
                        </button>
                        <button
                          onClick={() => handleAdminDecision(c.id, 'reject')}
                          style={{
                            padding: '0.35rem 0.7rem',
                            borderRadius: '8px',
                            border: '1px solid rgba(248,113,113,0.6)',
                            background: 'rgba(248,113,113,0.15)',
                            color: '#fecaca',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            fontSize: '0.75rem'
                          }}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Reject
                        </button>
                        {editingId === c.id ? (
                          <>
                            <button
                              onClick={() => handleLearningUpdate(c.id, editingContent[c.id] ?? c.content)}
                              style={{
                                padding: '0.35rem 0.7rem',
                                borderRadius: '8px',
                                border: '1px solid rgba(34,197,94,0.6)',
                                background: 'rgba(34,197,94,0.15)',
                                color: '#bbf7d0',
                                cursor: 'pointer',
                                fontSize: '0.75rem'
                              }}
                            >
                              Save edit
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              style={{
                                padding: '0.35rem 0.7rem',
                                borderRadius: '8px',
                                border: '1px solid rgba(148,163,184,0.5)',
                                background: 'rgba(148,163,184,0.1)',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                fontSize: '0.75rem'
                              }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingId(c.id);
                              setEditingContent(prev => ({ ...prev, [c.id]: c.content }));
                            }}
                            style={{
                              padding: '0.35rem 0.7rem',
                              borderRadius: '8px',
                              border: '1px solid rgba(148,163,184,0.5)',
                              background: 'rgba(148,163,184,0.1)',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              fontSize: '0.75rem'
                            }}
                          >
                            Edit
                          </button>
                        )}
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <select
                            value={mergeTargets[c.id] || ''}
                            onChange={(e) => setMergeTargets(prev => ({ ...prev, [c.id]: e.target.value }))}
                            disabled={!hasMergeTargets(c.id)}
                            style={{
                              padding: '0.3rem 0.5rem',
                              borderRadius: '8px',
                              border: '1px solid rgba(255,255,255,0.12)',
                              background: hasMergeTargets(c.id) ? 'rgba(12,12,12,0.6)' : 'rgba(12,12,12,0.35)',
                              color: hasMergeTargets(c.id) ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                              fontSize: '0.7rem'
                            }}
                          >
                            <option value="">Merge into...</option>
                            {mergeOptions
                              .filter((g: any) => g.id !== c.id)
                              .map((g: any) => (
                                <option key={`merge-${c.id}-${g.id}`} value={g.id}>
                                  {(g.content || g.id).slice(0, 40)}
                                </option>
                              ))}
                          </select>
                          <button
                            onClick={() => {
                              const targetId = mergeTargets[c.id];
                              if (targetId) handleLearningMerge(c.id, targetId);
                            }}
                            disabled={!mergeTargets[c.id]}
                            style={{
                              padding: '0.35rem 0.7rem',
                              borderRadius: '8px',
                              border: '1px solid rgba(59,130,246,0.6)',
                              background: mergeTargets[c.id] ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.05)',
                              color: mergeTargets[c.id] ? '#bfdbfe' : 'var(--text-tertiary)',
                              cursor: mergeTargets[c.id] ? 'pointer' : 'not-allowed',
                              fontSize: '0.75rem'
                            }}
                          >
                            Merge
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LearningDashboard;
