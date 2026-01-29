import React, { useEffect, useState } from 'react';
import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { databaseService } from '../services/databaseService';

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

const LearningDashboard: React.FC = () => {
  const [windowDays, setWindowDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<any | null>(null);

  const fetchSummary = async (days = windowDays) => {
    try {
      setLoading(true);
      setError(null);
      const data = await databaseService.getChatLearningSummary(days);
      setSummary(data);
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

  return (
    <div className="roof-er-content-area">
      <div className="roof-er-content-scroll" style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h1 className="roof-er-page-title" style={{ marginBottom: '0.35rem' }}>Susan Learning Dashboard</h1>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
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
          </div>
        )}
      </div>
    </div>
  );
};

export default LearningDashboard;
