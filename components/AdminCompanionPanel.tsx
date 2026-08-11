/**
 * Admin Companion Triage Panel
 *
 * The triage view for rep companion reports (the "something's wrong" button).
 * Lists reports by status, opens the full capture envelope — message, request
 * ids, network trail, console buffer, breadcrumbs — and drives the
 * new → seen → fixed lifecycle. Opening a new report auto-marks it seen.
 *
 * Server routes: GET/PATCH /api/companion/reports (canManageQR-gated).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Loader, ArrowLeft, Copy, CheckCircle, Flag } from 'lucide-react';
import { API_BASE_URL } from '../services/config';
import { getAdminHeaders } from '../services/adminAuth';

// ─── Types ───────────────────────────────────────────────────────────────────

type ReportStatus = 'new' | 'seen' | 'fixed';

interface ReportSummary {
  id: string;
  created_at: string;
  app: string;
  route: string;
  user_email: string | null;
  message: string;
  status: ReportStatus;
  request_ids: string[];
  console_entries: number;
  network_entries: number;
  has_screenshot: boolean;
}

interface ReportDetail extends ReportSummary {
  console: Array<{ level: string; message: string; ts: number }>;
  network: Array<{ method: string; url: string; status: number; durationMs: number; requestId: string | null; ts: number }>;
  breadcrumbs: Array<{ kind: string; detail: string; ts: number }>;
  user_agent: string;
  server_request_id: string | null;
  screenshot: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ACCENT = '#6366f1'; // companion indigo — matches the rep-side button

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      timeZone: 'America/New_York',
    });
  } catch { return iso; }
}

function fmtClock(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', second: '2-digit',
      timeZone: 'America/New_York',
    });
  } catch { return String(ts); }
}

const STATUS_COLORS: Record<ReportStatus, { bg: string; fg: string }> = {
  new: { bg: 'rgba(99,102,241,0.15)', fg: ACCENT },
  seen: { bg: 'rgba(245,158,11,0.15)', fg: '#f59e0b' },
  fixed: { bg: 'rgba(16,185,129,0.15)', fg: '#10b981' },
};

function StatusPill({ status }: { status: ReportStatus }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.new;
  return (
    <span style={{
      padding: '2px 10px', borderRadius: 999, fontSize: '0.6875rem', fontWeight: 700,
      background: c.bg, color: c.fg, textTransform: 'uppercase', letterSpacing: '0.03em',
    }}>{status}</span>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
      }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
        borderRadius: 6, border: '1px solid var(--border-subtle, #333)',
        background: 'transparent', color: copied ? '#10b981' : 'var(--text-secondary, #999)',
        fontSize: '0.6875rem', cursor: 'pointer',
      }}
      title="Copy"
    >
      {copied ? <CheckCircle style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
      {label || (copied ? 'Copied' : 'Copy')}
    </button>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

const AdminCompanionPanel: React.FC = () => {
  const [filter, setFilter] = useState<ReportStatus | 'all'>('new');
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = filter === 'all' ? '' : `?status=${filter}`;
      const res = await fetch(`${API_BASE_URL}/companion/reports${qs}`, { headers: getAdminHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReports(data.reports || []);
    } catch (e) {
      setError(`Could not load reports (${e instanceof Error ? e.message : e})`);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const setStatus = async (id: string, status: ReportStatus) => {
    try {
      await fetch(`${API_BASE_URL}/companion/reports/${id}`, {
        method: 'PATCH', headers: getAdminHeaders(), body: JSON.stringify({ status }),
      });
      setReports(prev => prev.map(r => (r.id === id ? { ...r, status } : r)));
      setDetail(prev => (prev && prev.id === id ? { ...prev, status } : prev));
    } catch { /* keep UI state; next refresh reconciles */ }
  };

  const open = async (summary: ReportSummary) => {
    try {
      const res = await fetch(`${API_BASE_URL}/companion/reports/${summary.id}`, { headers: getAdminHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDetail(data.report);
      if (summary.status === 'new') void setStatus(summary.id, 'seen');
    } catch (e) {
      setError(`Could not open report (${e instanceof Error ? e.message : e})`);
    }
  };

  // ── Detail view ──
  if (detail) {
    const failedCalls = detail.network.filter(n => n.status === 0 || n.status >= 400);
    return (
      <div style={{ padding: '1rem', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <button onClick={() => setDetail(null)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            borderRadius: 8, border: '1px solid var(--border-subtle, #333)',
            background: 'transparent', color: 'var(--text-primary, #eee)', cursor: 'pointer', fontSize: '0.8125rem',
          }}>
            <ArrowLeft style={{ width: 14, height: 14 }} /> Back
          </button>
          <StatusPill status={detail.status} />
          {detail.status !== 'fixed' ? (
            <button onClick={() => void setStatus(detail.id, 'fixed')} style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', background: '#10b981',
              color: '#fff', fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer',
            }}>Mark fixed</button>
          ) : (
            <button onClick={() => void setStatus(detail.id, 'seen')} style={{
              padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border-subtle, #333)',
              background: 'transparent', color: 'var(--text-secondary, #999)', fontSize: '0.8125rem', cursor: 'pointer',
            }}>Reopen</button>
          )}
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #999)' }}>
            {detail.id.slice(0, 8)} · {fmtTime(detail.created_at)} · {detail.user_email || 'anonymous'} · {detail.app}{detail.route}
          </span>
        </div>

        {detail.message && (
          <div style={{
            padding: '12px 14px', borderRadius: 10, marginBottom: 14,
            background: 'rgba(99,102,241,0.08)', borderLeft: `3px solid ${ACCENT}`,
            color: 'var(--text-primary, #eee)', fontSize: '0.875rem',
          }}>
            “{detail.message}”
          </div>
        )}

        {/* Request IDs — the correlation keys */}
        <Section title={`Request IDs (${detail.request_ids.length})`}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {detail.request_ids.map(rid => (
              <span key={rid} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
                borderRadius: 6, background: 'var(--bg-secondary, #1a1a1a)',
                fontFamily: 'monospace', fontSize: '0.6875rem', color: 'var(--text-secondary, #bbb)',
              }}>
                {rid.slice(0, 13)}… <CopyButton text={rid} label="" />
              </span>
            ))}
          </div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--text-secondary, #888)', marginTop: 6 }}>
            Search these as <code>request_id</code> in GlitchTip or <code>rid=</code> in server logs.
          </div>
        </Section>

        {/* Network — failures first */}
        <Section title={`Network (${detail.network.length}${failedCalls.length ? ` · ${failedCalls.length} failed` : ''})`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ color: 'var(--text-secondary, #888)', textAlign: 'left' }}>
                  <th style={{ padding: '4px 8px' }}>Time</th>
                  <th style={{ padding: '4px 8px' }}>Method</th>
                  <th style={{ padding: '4px 8px' }}>Status</th>
                  <th style={{ padding: '4px 8px' }}>ms</th>
                  <th style={{ padding: '4px 8px' }}>URL</th>
                  <th style={{ padding: '4px 8px' }}>Request ID</th>
                </tr>
              </thead>
              <tbody>
                {detail.network.map((n, i) => {
                  const bad = n.status === 0 || n.status >= 400;
                  return (
                    <tr key={i} style={{
                      borderTop: '1px solid var(--border-subtle, #2a2a2a)',
                      background: bad ? 'rgba(239,68,68,0.08)' : undefined,
                      color: bad ? '#f87171' : 'var(--text-primary, #ddd)',
                    }}>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>{fmtClock(n.ts)}</td>
                      <td style={{ padding: '4px 8px', fontWeight: 700 }}>{n.method}</td>
                      <td style={{ padding: '4px 8px' }}>{n.status === 0 ? 'ERR' : n.status}</td>
                      <td style={{ padding: '4px 8px' }}>{n.durationMs}</td>
                      <td style={{ padding: '4px 8px', fontFamily: 'monospace', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={n.url}>{n.url}</td>
                      <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{n.requestId ? n.requestId.slice(0, 8) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Console */}
        <Section title={`Console (${detail.console.length})`}>
          <div style={{
            maxHeight: 320, overflowY: 'auto', borderRadius: 8,
            background: 'var(--bg-secondary, #131313)', padding: '8px 10px',
            fontFamily: 'monospace', fontSize: '0.6875rem', lineHeight: 1.6,
          }}>
            {detail.console.map((c, i) => (
              <div key={i} style={{
                color: c.level === 'error' ? '#f87171' : c.level === 'warn' ? '#fbbf24' : 'var(--text-secondary, #aaa)',
              }}>
                <span style={{ opacity: 0.55 }}>{fmtClock(c.ts)}</span> [{c.level}] {c.message}
              </div>
            ))}
            {detail.console.length === 0 && <div style={{ opacity: 0.6 }}>No console entries captured.</div>}
          </div>
        </Section>

        {/* Breadcrumbs */}
        <Section title={`Steps (${detail.breadcrumbs.length})`}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #aaa)', lineHeight: 1.8 }}>
            {detail.breadcrumbs.map((b, i) => (
              <div key={i}>
                <span style={{ opacity: 0.55 }}>{fmtClock(b.ts)}</span>{' '}
                <span style={{ color: ACCENT, fontWeight: 600 }}>{b.kind}</span> {b.detail}
              </div>
            ))}
            {detail.breadcrumbs.length === 0 && <div style={{ opacity: 0.6 }}>No steps captured.</div>}
          </div>
        </Section>

        {detail.screenshot && (
          <Section title="Screenshot">
            <img src={detail.screenshot} alt="Rep screenshot" style={{ maxWidth: '100%', borderRadius: 8 }} />
          </Section>
        )}

        <div style={{ fontSize: '0.6875rem', color: 'var(--text-secondary, #777)', marginTop: 8 }}>
          {detail.user_agent}
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div style={{ padding: '1rem', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <Flag style={{ width: 16, height: 16, color: ACCENT }} />
        <span style={{ fontWeight: 700, color: 'var(--text-primary, #eee)', fontSize: '0.9375rem' }}>
          Rep Reports
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #888)' }}>
          from the “Something's wrong?” button
        </span>
        <div style={{ flex: 1 }} />
        {(['new', 'seen', 'fixed', 'all'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: '4px 12px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600,
            border: `1px solid ${filter === s ? ACCENT : 'var(--border-subtle, #333)'}`,
            background: filter === s ? 'rgba(99,102,241,0.15)' : 'transparent',
            color: filter === s ? ACCENT : 'var(--text-secondary, #999)', cursor: 'pointer',
          }}>{s}</button>
        ))}
        <button onClick={() => void load()} title="Refresh" style={{
          padding: 6, borderRadius: 8, border: '1px solid var(--border-subtle, #333)',
          background: 'transparent', color: 'var(--text-secondary, #999)', cursor: 'pointer',
          display: 'inline-flex',
        }}>
          {loading ? <Loader style={{ width: 14, height: 14 }} className="animate-spin" /> : <RefreshCw style={{ width: 14, height: 14 }} />}
        </button>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#f87171', fontSize: '0.8125rem', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {reports.length === 0 && !loading && !error && (
        <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary, #888)', fontSize: '0.875rem' }}>
          No {filter === 'all' ? '' : `${filter} `}reports. Quiet is good.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {reports.map(r => (
          <div key={r.id} onClick={() => void open(r)} style={{
            padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
            border: '1px solid var(--border-subtle, #2a2a2a)',
            background: 'var(--bg-secondary, #161616)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <StatusPill status={r.status} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #999)' }}>{fmtTime(r.created_at)}</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary, #ddd)' }}>{r.user_email || 'anonymous'}</span>
              <span style={{ fontSize: '0.6875rem', fontFamily: 'monospace', color: 'var(--text-secondary, #888)' }}>{r.app}{r.route}</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-secondary, #888)' }}>
                {r.network_entries} net · {r.console_entries} log{r.has_screenshot ? ' · 📷' : ''}
              </span>
            </div>
            {r.message && (
              <div style={{ marginTop: 6, fontSize: '0.8125rem', color: 'var(--text-primary, #ccc)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                “{r.message}”
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.05em', color: 'var(--text-secondary, #999)', marginBottom: 6,
      }}>{title}</div>
      {children}
    </div>
  );
}

export default AdminCompanionPanel;
