import React from 'react';
import {
  UserCheck,
  Camera,
  Video,
  FileText,
  CalendarCheck,
  CheckCircle2,
  Check,
  X,
  RefreshCw,
  Loader,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RepReadiness {
  name: string;
  slug: string;
  hasPhoto: boolean;
  hasVideo: boolean;
  hasBio: boolean;
  hasGoogle: boolean;
  hasLogin: boolean;
  completenessPct: number;
  fullyReady: boolean;
}
interface ReadinessSummary {
  total: number;
  withPhoto: number;
  withVideo: number;
  withBio: number;
  googleConnected: number;
  fullyReady: number;
}
interface ReadinessData { reps: RepReadiness[]; summary: ReadinessSummary; }

interface AdminRepReadinessPanelProps { userEmail: string; }

type SortKey = 'name' | 'photo' | 'video' | 'bio' | 'google' | 'completeness';

// ─── Shared styles (match AdminScanAnalyticsPanel) ────────────────────────────

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '1.25rem',
};
const sectionTitleStyle: React.CSSProperties = {
  margin: '0 0 0.875rem 0', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)',
  display: 'flex', alignItems: 'center', gap: 8,
};
const thBase: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: 12,
  textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: '10px', fontSize: 13, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)',
  verticalAlign: 'middle',
};

// ─── Small components ─────────────────────────────────────────────────────────

function StatCard({ label, value, total, icon, accent }: { label: string; value: number; total?: number; icon: React.ReactNode; accent?: string }) {
  return (
    <div style={{ ...cardStyle, padding: '1rem 1.125rem', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-tertiary)', fontSize: 12, fontWeight: 600 }}>
        {icon}<span>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: accent || 'var(--text-primary)', lineHeight: 1 }}>
        {value}{typeof total === 'number' && <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)' }}>/{total}</span>}
      </div>
    </div>
  );
}

function YesNo({ ok }: { ok: boolean }) {
  return ok
    ? <span title="Yes" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}><Check size={14} strokeWidth={3} /></span>
    : <span title="Missing" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: 'rgba(239,68,68,0.14)', color: '#ef4444' }}><X size={14} strokeWidth={3} /></span>;
}

function CompletenessBar({ pct, ready }: { pct: number; ready: boolean }) {
  const color = ready ? '#22c55e' : pct >= 50 ? '#eab308' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
      <div style={{ flex: 1, height: 7, borderRadius: 999, background: 'var(--bg-primary)', overflow: 'hidden', minWidth: 64 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 34, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function AdminRepReadinessPanel({ userEmail }: AdminRepReadinessPanelProps) {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<ReadinessData | null>(null);
  const [sortKey, setSortKey] = React.useState<SortKey>('completeness');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');
  const [onlyIncomplete, setOnlyIncomplete] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/qr-analytics/rep-readiness`, { headers: { 'x-user-email': userEmail } });
      if (!res.ok) {
        if (res.status === 403) throw new Error('You need admin or marketing access to view rep readiness.');
        throw new Error(`Request failed (${res.status})`);
      }
      const d = await res.json();
      setData({ reps: d.reps || [], summary: d.summary });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load rep readiness');
    } finally { setLoading(false); }
  }, [userEmail]);

  React.useEffect(() => { load(); }, [load]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  }

  const reps = data?.reps ?? [];
  const summary = data?.summary;
  const missingVideo = summary ? summary.total - summary.withVideo : 0;

  const sortedReps = React.useMemo(() => {
    const flagVal = (r: RepReadiness, k: SortKey): number | string => {
      switch (k) {
        case 'name': return r.name.toLowerCase();
        case 'photo': return r.hasPhoto ? 1 : 0;
        case 'video': return r.hasVideo ? 1 : 0;
        case 'bio': return r.hasBio ? 1 : 0;
        case 'google': return r.hasGoogle ? 1 : 0;
        case 'completeness': return r.completenessPct;
      }
    };
    const arr = reps.filter(r => (onlyIncomplete ? !r.fullyReady : true));
    arr.sort((a, b) => {
      const va = flagVal(a, sortKey), vb = flagVal(b, sortKey);
      let cmp = 0;
      if (typeof va === 'string' && typeof vb === 'string') cmp = va.localeCompare(vb);
      else cmp = (va as number) - (vb as number);
      if (cmp === 0) cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [reps, sortKey, sortDir, onlyIncomplete]);

  const SortHeader = ({ k, label, center }: { k: SortKey; label: string; center?: boolean }) => (
    <th
      style={{ ...thBase, cursor: 'pointer', textAlign: center ? 'center' : 'left', userSelect: 'none' }}
      onClick={() => toggleSort(k)}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: center ? 'center' : 'flex-start' }}>
        {label}
        {sortKey === k && (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </span>
    </th>
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', color: 'var(--text-tertiary)', gap: 10 }}>
        <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Loading rep readiness…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '2.5rem', textAlign: 'center' }}>
        <AlertTriangle size={28} color="#ef4444" />
        <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{error}</div>
        <button onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserCheck size={20} color="#dc2626" /> Rep Readiness
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-tertiary)' }}>
            Which active reps are launch-ready — and what each one is still missing.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setOnlyIncomplete(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
              border: `1px solid ${onlyIncomplete ? 'rgba(239,68,68,0.4)' : 'var(--border-subtle)'}`,
              background: onlyIncomplete ? 'rgba(239,68,68,0.12)' : 'var(--bg-secondary)',
              color: onlyIncomplete ? '#ef4444' : 'var(--text-tertiary)', fontWeight: 600,
            }}
          >
            <AlertTriangle size={14} /> {onlyIncomplete ? 'Showing incomplete' : 'Only incomplete'}
          </button>
          <button onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 13 }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <StatCard label="Fully ready" value={summary?.fullyReady ?? 0} total={summary?.total ?? 0} icon={<CheckCircle2 size={13} color="#22c55e" />} accent="#22c55e" />
        <StatCard label="Google connected" value={summary?.googleConnected ?? 0} total={summary?.total ?? 0} icon={<CalendarCheck size={13} color="#dc2626" />} />
        <StatCard label="With photo" value={summary?.withPhoto ?? 0} total={summary?.total ?? 0} icon={<Camera size={13} color="#dc2626" />} />
        <StatCard label="With video" value={summary?.withVideo ?? 0} total={summary?.total ?? 0} icon={<Video size={13} color="#dc2626" />} />
        <StatCard label="With bio" value={summary?.withBio ?? 0} total={summary?.total ?? 0} icon={<FileText size={13} color="#dc2626" />} />
        <StatCard label="Missing video" value={missingVideo} icon={<AlertTriangle size={13} color="#eab308" />} accent={missingVideo > 0 ? '#eab308' : 'var(--text-primary)'} />
      </div>

      {/* Table */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>
          <UserCheck size={16} color="#dc2626" /> Rep Checklist
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-tertiary)' }}>· {sortedReps.length} rep{sortedReps.length === 1 ? '' : 's'}</span>
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr>
                <SortHeader k="name" label="Rep" />
                <SortHeader k="photo" label="Photo" center />
                <SortHeader k="video" label="Video" center />
                <SortHeader k="bio" label="Bio" center />
                <SortHeader k="google" label="Google" center />
                <SortHeader k="completeness" label="Completeness" />
              </tr>
            </thead>
            <tbody>
              {sortedReps.length === 0 ? (
                <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-tertiary)', padding: '1.5rem' }}>No reps to show.</td></tr>
              ) : sortedReps.map(r => (
                <tr
                  key={r.slug}
                  style={{ background: r.fullyReady ? 'transparent' : 'rgba(239,68,68,0.05)' }}
                >
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {!r.fullyReady && <span title="Incomplete" style={{ width: 6, height: 6, borderRadius: 999, background: '#ef4444', flexShrink: 0 }} />}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          /{r.slug}{!r.hasLogin && <span style={{ marginLeft: 6, color: '#eab308' }}>· no login</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}><YesNo ok={r.hasPhoto} /></td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}><YesNo ok={r.hasVideo} /></td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}><YesNo ok={r.hasBio} /></td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}><YesNo ok={r.hasGoogle} /></td>
                  <td style={tdStyle}><CompletenessBar pct={r.completenessPct} ready={r.fullyReady} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ margin: '0.875rem 0 0', fontSize: 11, color: 'var(--text-tertiary)' }}>
          Completeness = photo + video + bio + Google (4 items). “Google” needs the rep to have claimed a login and connected Google Calendar.
        </p>
      </div>
    </div>
  );
}
