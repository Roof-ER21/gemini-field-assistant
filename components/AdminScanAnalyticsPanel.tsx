import React from 'react';
import {
  QrCode,
  Users,
  Eye,
  TrendingUp,
  Smartphone,
  Monitor,
  Tablet,
  HelpCircle,
  Clock,
  RefreshCw,
  Loader,
  UserCheck,
  Video,
  Star,
  Camera,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Filter,
  X,
  Target,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DailyPoint { date: string; scans: number; uniqueVisitors?: number; signups?: number; }
interface DeviceRow { deviceType: string; count: number; }
interface RecentScan { id: string; profileSlug: string; profileName: string; scannedAt: string; deviceType: string | null; source: string | null; }
interface RecentSignup {
  id: string; profileSlug: string; profileName: string;
  homeownerName: string; homeownerEmail: string | null; homeownerPhone: string | null;
  serviceType: string | null; status: string | null; address: string | null; source: string | null; createdAt: string;
}
interface RepRow {
  slug: string; name: string; roleType: string; isActive: boolean; isClaimed: boolean;
  imageUrl: string | null; hasPhoto: boolean;
  createdByEmail: string | null; createdAt: string | null; updatedByEmail: string | null; updatedAt: string | null;
  videoCount: number; reviewCount: number; scanCount: number; uniqueVisitors: number; signupCount: number;
}
interface StaffRow { email: string; profilesCreated: number; profilesEdited: number; videosAdded: number; reviewsAdded: number; }

interface DashboardData {
  range: { from: string; to: string };
  slug: string | null;
  summary: { scans: number; signups: number; uniqueVisitors: number; repsScanned: number; conversionRate: number };
  daily: DailyPoint[];
  devices: DeviceRow[];
  recentScans: RecentScan[];
  recentSignups: RecentSignup[];
  reps: RepRow[];
  staff: StaffRow[];
}

interface RepDetail {
  stats: { scansToday: number; scansThisWeek: number; scansThisMonth: number; scansAllTime: number; uniqueVisitors: number };
  dailyScans: { date: string; scans: number }[];
}

interface AdminScanAnalyticsPanelProps { userEmail: string; }

type SortKey = 'name' | 'scans' | 'signups' | 'conversion' | 'edited';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string { return (n ?? 0).toLocaleString('en-US'); }
function shortEmail(email: string | null | undefined): string { return email ? email.split('@')[0] : '—'; }

function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function etDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/New_York', month: 'short', day: 'numeric', year: '2-digit',
      ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    });
  } catch { return '—'; }
}
function rangeLabel(iso: string): string {
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function deviceIcon(d: string | null): React.ReactNode {
  const t = (d || '').toLowerCase();
  if (t.includes('mobile') || t.includes('phone')) return <Smartphone size={14} />;
  if (t.includes('tablet') || t.includes('ipad')) return <Tablet size={14} />;
  if (t.includes('desktop') || t.includes('mac') || t.includes('windows')) return <Monitor size={14} />;
  return <HelpCircle size={14} />;
}
function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}
function statusColor(status: string | null): { bg: string; fg: string } {
  switch ((status || 'new').toLowerCase()) {
    case 'converted': return { bg: 'rgba(34,197,94,0.15)', fg: '#22c55e' };
    case 'contacted': return { bg: 'rgba(234,179,8,0.15)', fg: '#eab308' };
    case 'closed': return { bg: 'rgba(113,113,122,0.18)', fg: '#a1a1aa' };
    default: return { bg: 'rgba(59,130,246,0.15)', fg: '#60a5fa' }; // new
  }
}

// ─── Shared styles ────────────────────────────────────────────────────────────

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
  padding: '9px 10px', fontSize: 13, color: 'var(--text-primary)', borderBottom: '1px solid var(--bg-elevated)', verticalAlign: 'middle',
};
const refreshBtnStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-primary)',
  cursor: 'pointer', padding: '8px 12px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 38,
};
const dateInputStyle: React.CSSProperties = {
  height: 36, background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 8,
  color: 'var(--text-primary)', padding: '0 10px', fontSize: 13, outline: 'none',
};

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, accent, suffix }: { label: string; value: number | string; icon: React.ReactNode; accent?: boolean; suffix?: string }) {
  return (
    <div style={{
      background: accent ? 'linear-gradient(135deg, rgba(220,38,38,0.14) 0%, rgba(185,28,28,0.06) 100%)' : 'var(--bg-primary)',
      border: `1px solid ${accent ? 'rgba(220,38,38,0.35)' : 'var(--border-subtle)'}`,
      borderRadius: 12, padding: '1rem 1.1rem', flex: 1, minWidth: 130, display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-tertiary)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {icon}{label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{value}{suffix && <span style={{ fontSize: 15, color: 'var(--text-tertiary)' }}>{suffix}</span>}</div>
    </div>
  );
}

// ─── Daily trend (scans bars + signup markers) ────────────────────────────────

function DailyTrend({ data, showSignups }: { data: DailyPoint[]; showSignups?: boolean }) {
  if (!data.length) {
    return <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '1.5rem 0', textAlign: 'center' }}>No activity in this window.</div>;
  }
  const max = Math.max(...data.map(d => d.scans), 1);
  const peak = data.reduce((a, b) => (b.scans > a.scans ? b : a), data[0]);
  const totalSignups = data.reduce((s, d) => s + (d.signups || 0), 0);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: data.length > 45 ? 2 : 4, height: 160, padding: '8px 0', overflowX: 'auto' }}>
        {data.map((d) => {
          const h = Math.max((d.scans / max) * 100, d.scans > 0 ? 4 : 1);
          const hasSignup = showSignups && (d.signups || 0) > 0;
          return (
            <div key={d.date} style={{ flex: '1 0 auto', minWidth: data.length > 45 ? 5 : 8, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', position: 'relative' }}
              title={`${etDate(d.date)} — ${d.scans} scan${d.scans === 1 ? '' : 's'}${d.uniqueVisitors != null ? `, ${d.uniqueVisitors} unique` : ''}${d.signups ? `, ${d.signups} signup${d.signups === 1 ? '' : 's'}` : ''}`}>
              {hasSignup && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', marginBottom: 2, boxShadow: '0 0 4px rgba(34,197,94,0.8)' }} />}
              <div style={{ width: '100%', height: `${h}%`, background: d.scans > 0 ? 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)' : 'var(--bg-elevated)', borderRadius: '3px 3px 0 0' }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6, flexWrap: 'wrap', gap: 6 }}>
        <span>{etDate(data[0].date)}</span>
        <span>Peak <b style={{ color: 'var(--text-primary)' }}>{peak.scans}</b> · {etDate(peak.date)}{showSignups && totalSignups > 0 && <> · <span style={{ color: '#22c55e' }}>● {totalSignups} signups</span></>}</span>
        <span>{etDate(data[data.length - 1].date)}</span>
      </div>
    </div>
  );
}

// ─── Horizontal bar (top reps / device) ───────────────────────────────────────

function BarRow({ label, sub, value, max, icon }: { label: React.ReactNode; sub?: string; value: number; max: number; icon?: React.ReactNode }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <div style={{ width: 150, minWidth: 150, display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden' }}>
        {icon}<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <div style={{ flex: 1, background: 'var(--bg-elevated)', borderRadius: 6, height: 22, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #b91c1c 0%, #ef4444 100%)', borderRadius: 6, minWidth: value > 0 ? 3 : 0 }} />
      </div>
      <div style={{ width: 92, minWidth: 92, textAlign: 'right', fontSize: 13 }}>
        <b style={{ color: 'var(--text-primary)' }}>{fmt(value)}</b>{sub && <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}> {sub}</span>}
      </div>
    </div>
  );
}

// ─── Per-rep scan history (drill-down) ────────────────────────────────────────

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '8px 14px', minWidth: 92 }}>
      <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(value)}</div>
    </div>
  );
}

function RepScanDetail({ detail, name }: { detail: RepDetail; name: string }) {
  const s = detail.stats;
  const total = s?.scansAllTime ?? 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <MiniStat label="Today" value={s?.scansToday ?? 0} />
        <MiniStat label="This Week" value={s?.scansThisWeek ?? 0} />
        <MiniStat label="This Month" value={s?.scansThisMonth ?? 0} />
        <MiniStat label="All Time" value={total} />
        <MiniStat label="Unique (30d)" value={s?.uniqueVisitors ?? 0} />
      </div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <TrendingUp size={13} color="#dc2626" /> {name} — daily scans (last 30 days, all-time)
        </div>
        {total === 0 ? <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '0.5rem 0' }}>No scans recorded for this rep yet.</div> : <DailyTrend data={detail.dailyScans} />}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function AdminScanAnalyticsPanel({ userEmail }: AdminScanAnalyticsPanelProps) {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<DashboardData | null>(null);

  // Filters
  const [from, setFrom] = React.useState(() => addDaysISO(todayLocalISO(), -29));
  const [to, setTo] = React.useState(() => todayLocalISO());
  const [slug, setSlug] = React.useState<string | null>(null);
  // Full rep list for the filter dropdown (only refreshed on the unfiltered view)
  const [allReps, setAllReps] = React.useState<{ slug: string; name: string }[]>([]);

  // Rep table sort
  const [sortKey, setSortKey] = React.useState<SortKey>('scans');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');

  // Drill-down
  const [expandedSlug, setExpandedSlug] = React.useState<string | null>(null);
  const [repDetails, setRepDetails] = React.useState<Record<string, RepDetail>>({});
  const [detailError, setDetailError] = React.useState<Record<string, boolean>>({});
  const [loadingDetail, setLoadingDetail] = React.useState<string | null>(null);

  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 820);
    check(); window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const fetchJSON = React.useCallback(async (url: string) => {
    const res = await fetch(`${API_BASE}${url}`, { headers: { 'x-user-email': userEmail } });
    if (!res.ok) {
      if (res.status === 403) throw new Error('You need admin or marketing access to view scan analytics.');
      throw new Error(`Request failed (${res.status})`);
    }
    return res.json();
  }, [userEmail]);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({ from, to });
      if (slug) qs.set('slug', slug);
      const d: DashboardData = await fetchJSON(`/api/qr-analytics/dashboard?${qs.toString()}`);
      setData(d);
      // Cache the full rep list only when viewing all reps, so the dropdown keeps every option.
      if (!slug) setAllReps(d.reps.map(r => ({ slug: r.slug, name: r.name })));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally { setLoading(false); }
  }, [fetchJSON, from, to, slug]);

  React.useEffect(() => { load(); }, [load]);

  const loadRepDetail = React.useCallback(async (s: string) => {
    setLoadingDetail(s); setDetailError(prev => ({ ...prev, [s]: false }));
    try {
      const d = await fetchJSON(`/api/qr-analytics/profile/${encodeURIComponent(s)}`);
      setRepDetails(prev => ({ ...prev, [s]: { stats: d.stats, dailyScans: d.dailyScans || [] } }));
    } catch { setDetailError(prev => ({ ...prev, [s]: true })); }
    finally { setLoadingDetail(null); }
  }, [fetchJSON]);

  const toggleRep = React.useCallback((s: string) => {
    if (expandedSlug === s) { setExpandedSlug(null); return; }
    setExpandedSlug(s);
    if (!repDetails[s] && loadingDetail !== s) loadRepDetail(s);
  }, [expandedSlug, repDetails, loadingDetail, loadRepDetail]);

  function applyPreset(days: number | 'all') {
    const t = todayLocalISO();
    setTo(t);
    setFrom(days === 'all' ? '2020-01-01' : addDaysISO(t, -(days - 1)));
  }
  const activePreset = (d: number): boolean => to === todayLocalISO() && from === addDaysISO(to, -(d - 1));
  const allActive = from === '2020-01-01' && to === todayLocalISO();

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  }

  const summary = data?.summary;
  const reps = data?.reps ?? [];
  const devices = data?.devices ?? [];
  const totalDevice = devices.reduce((s, d) => s + d.count, 0);
  const maxDevice = Math.max(...devices.map(d => d.count), 1);

  // Top reps derived from the rep scorecard (already range-aware)
  const topReps = [...reps].filter(r => r.scanCount > 0).sort((a, b) => b.scanCount - a.scanCount).slice(0, 10);
  const maxTop = Math.max(...topReps.map(r => r.scanCount), 1);

  const sortedReps = React.useMemo(() => {
    const conv = (r: RepRow) => (r.scanCount > 0 ? r.signupCount / r.scanCount : 0);
    const arr = [...reps];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'scans': cmp = a.scanCount - b.scanCount; break;
        case 'signups': cmp = a.signupCount - b.signupCount; break;
        case 'conversion': cmp = conv(a) - conv(b); break;
        case 'edited': cmp = (Date.parse(a.updatedAt || a.createdAt || '0') || 0) - (Date.parse(b.updatedAt || b.createdAt || '0') || 0); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [reps, sortKey, sortDir]);

  const selectedRepName = slug ? (allReps.find(r => r.slug === slug)?.name || slug) : null;

  if (loading && !data) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '4rem', color: 'var(--text-tertiary)' }}><Loader size={20} className="spin" /> Loading scan analytics…</div>;
  }
  if (error) {
    return (
      <div style={{ ...cardStyle, margin: '1.5rem', borderColor: '#7f1d1d', textAlign: 'center' }}>
        <div style={{ color: '#fca5a5', fontSize: 14, marginBottom: 12 }}>{error}</div>
        <button onClick={load} style={refreshBtnStyle}><RefreshCw size={14} /> Retry</button>
      </div>
    );
  }

  const SortHead = ({ k, label, align = 'left' }: { k: SortKey; label: string; align?: 'left' | 'right' | 'center' }) => (
    <th style={{ ...thBase, textAlign: align, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(k)} title="Click to sort">
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {label}
        {sortKey === k ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronDown size={12} style={{ opacity: 0.25 }} />}
      </span>
    </th>
  );

  return (
    <div style={{ padding: isMobile ? '1rem' : '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <QrCode size={20} color="#dc2626" /> QR Scan Analytics
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-tertiary)' }}>
            Scans, signups, top reps, and who set up each page — {rangeLabel(data!.range.from)} → {rangeLabel(data!.range.to)}
            {selectedRepName && <> · <b style={{ color: '#dc2626' }}>{selectedRepName}</b> only</>}
          </p>
        </div>
        <button onClick={load} style={refreshBtnStyle} title="Refresh">{loading ? <Loader size={14} className="spin" /> : <RefreshCw size={14} />} Refresh</button>
      </div>

      {/* Filter bar */}
      <div style={{ ...cardStyle, padding: '1rem 1.25rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 600 }}><Filter size={14} /> Filter</span>

        {/* Presets */}
        <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: 8, padding: 3, gap: 2 }}>
          {([['Today', 1], ['7d', 7], ['30d', 30], ['90d', 90]] as const).map(([lbl, d]) => (
            <button key={lbl} onClick={() => applyPreset(d)} style={presetBtn(activePreset(d))}>{lbl}</button>
          ))}
          <button onClick={() => applyPreset('all')} style={presetBtn(allActive)}>All</button>
        </div>

        {/* Custom range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} style={dateInputStyle} />
          <span style={{ color: 'var(--text-tertiary)' }}>→</span>
          <input type="date" value={to} min={from} max={todayLocalISO()} onChange={e => setTo(e.target.value)} style={dateInputStyle} />
        </div>

        {/* Rep filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={14} color="var(--text-tertiary)" />
          <select value={slug ?? ''} onChange={e => setSlug(e.target.value || null)} style={{ ...dateInputStyle, cursor: 'pointer', maxWidth: 200 }}>
            <option value="">All reps</option>
            {[...allReps].sort((a, b) => a.name.localeCompare(b.name)).map(r => (
              <option key={r.slug} value={r.slug}>{r.name}</option>
            ))}
          </select>
        </div>

        {(slug || !activePreset(30)) && (
          <button onClick={() => { setSlug(null); applyPreset(30); }} style={{ ...refreshBtnStyle, minHeight: 36, color: 'var(--text-tertiary)' }}><X size={13} /> Reset</button>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <StatCard label="Scans" value={fmt(summary?.scans ?? 0)} icon={<QrCode size={13} />} accent />
        <StatCard label="Signups" value={fmt(summary?.signups ?? 0)} icon={<ClipboardList size={13} />} accent />
        <StatCard label="Conversion" value={summary?.conversionRate ?? 0} suffix="%" icon={<Target size={13} />} />
        <StatCard label="Unique Visitors" value={fmt(summary?.uniqueVisitors ?? 0)} icon={<Users size={13} />} />
        <StatCard label="Reps Scanned" value={fmt(summary?.repsScanned ?? 0)} icon={<Eye size={13} />} />
      </div>

      {/* Daily trend */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}><TrendingUp size={16} color="#dc2626" /> Daily Activity <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-tertiary)' }}>· bars = scans, <span style={{ color: '#22c55e' }}>● = signup days</span></span></h3>
        <DailyTrend data={data!.daily} showSignups />
      </div>

      {/* Top reps + devices */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: '1.5rem' }}>
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}><TrendingUp size={16} color="#dc2626" /> Top Reps by Scans</h3>
          {topReps.length === 0 ? <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '1rem 0' }}>No scans in this window.</div> : topReps.map(p => (
            <BarRow key={p.slug} label={p.name} sub={`· ${p.signupCount} signup${p.signupCount === 1 ? '' : 's'}`} value={p.scanCount} max={maxTop}
              icon={p.imageUrl ? <img src={p.imageUrl} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                : <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>{getInitials(p.name)}</div>} />
          ))}
        </div>
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}><Smartphone size={16} color="#dc2626" /> Device Breakdown</h3>
          {devices.length === 0 ? <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '1rem 0' }}>No scans in this window.</div> : devices.map(d => (
            <BarRow key={d.deviceType} label={<span style={{ textTransform: 'capitalize' }}>{d.deviceType}</span>} sub={totalDevice > 0 ? `· ${Math.round((d.count / totalDevice) * 100)}%` : ''} value={d.count} max={maxDevice} icon={deviceIcon(d.deviceType)} />
          ))}
        </div>
      </div>

      {/* Rep scorecard — sortable, with signups + setup attribution */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}><UserCheck size={16} color="#dc2626" /> Rep Scorecard — Scans, Signups & Who Set It Up</h3>
        <p style={{ margin: '-4px 0 12px', fontSize: 12.5, color: 'var(--text-tertiary)' }}>
          Click a column to sort · click a rep to see their full scan history. Scans & signups reflect the selected date range.
        </p>

        {data!.staff.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {data!.staff.map(s => (
              <div key={s.email} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '8px 12px', fontSize: 12.5 }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 3 }}>{shortEmail(s.email)}</div>
                <div style={{ color: 'var(--text-tertiary)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span title="Pages created"><UserCheck size={11} style={{ verticalAlign: -1 }} /> {s.profilesCreated} made</span>
                  <span title="Pages edited">✎ {s.profilesEdited} edited</span>
                  <span title="Videos added"><Video size={11} style={{ verticalAlign: -1 }} /> {s.videosAdded}</span>
                  <span title="Reviews added"><Star size={11} style={{ verticalAlign: -1 }} /> {s.reviewsAdded}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 720 : undefined }}>
            <thead>
              <tr>
                <SortHead k="name" label="Rep Page" />
                <th style={thBase}>Created By</th>
                <th style={thBase}>Last Edited By</th>
                <th style={{ ...thBase, textAlign: 'center' }}>Content</th>
                <SortHead k="signups" label="Signups" align="right" />
                <SortHead k="conversion" label="Conv." align="right" />
                <SortHead k="scans" label="Scans" align="right" />
              </tr>
            </thead>
            <tbody>
              {sortedReps.length === 0 ? (
                <tr><td style={{ ...tdStyle, color: 'var(--text-tertiary)', textAlign: 'center' }} colSpan={7}>No rep pages match this filter.</td></tr>
              ) : sortedReps.map(p => {
                const expanded = expandedSlug === p.slug;
                const conv = p.scanCount > 0 ? Math.round((p.signupCount / p.scanCount) * 1000) / 10 : 0;
                return (
                  <React.Fragment key={p.slug}>
                    <tr onClick={() => toggleRep(p.slug)} style={{ cursor: 'pointer', background: expanded ? 'var(--bg-primary)' : 'transparent' }} title="Click to see this rep's past scans">
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: 'var(--text-tertiary)', display: 'flex' }}>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
                          {p.imageUrl ? <img src={p.imageUrl} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
                            : <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{getInitials(p.name)}</div>}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>{p.name}{!p.isActive && <span style={{ fontSize: 10, color: '#fca5a5', border: '1px solid #7f1d1d', borderRadius: 4, padding: '0 4px' }}>inactive</span>}</div>
                            <a href={`/profile/${p.slug}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: 'var(--text-tertiary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>/{p.slug} <ExternalLink size={9} /></a>
                          </div>
                        </div>
                      </td>
                      <td style={tdStyle}><div style={{ fontWeight: 500 }}>{shortEmail(p.createdByEmail)}</div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{etDate(p.createdAt)}</div></td>
                      <td style={tdStyle}><div style={{ fontWeight: 500 }}>{shortEmail(p.updatedByEmail)}</div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{etDate(p.updatedAt)}</div></td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: 10, color: 'var(--text-tertiary)', fontSize: 12 }}>
                          <span title="Photo" style={{ color: p.hasPhoto ? '#22c55e' : 'var(--text-tertiary)' }}><Camera size={12} style={{ verticalAlign: -1 }} /></span>
                          <span title="Videos"><Video size={12} style={{ verticalAlign: -1 }} /> {p.videoCount}</span>
                          <span title="Reviews"><Star size={12} style={{ verticalAlign: -1 }} /> {p.reviewCount}</span>
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: p.signupCount > 0 ? '#22c55e' : 'var(--text-tertiary)' }}>{fmt(p.signupCount)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-tertiary)' }}>{conv}%</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{fmt(p.scanCount)}</td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={7} style={{ background: 'var(--bg-primary)', padding: '4px 16px 16px', borderBottom: '1px solid var(--bg-elevated)' }}>
                          {loadingDetail === p.slug && !repDetails[p.slug] ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-tertiary)', fontSize: 13, padding: '0.5rem 0' }}><Loader size={14} className="spin" /> Loading {p.name}'s scan history…</div>
                          ) : detailError[p.slug] ? (
                            <div style={{ color: '#fca5a5', fontSize: 13, padding: '0.5rem 0' }}>Couldn't load scan history. <button onClick={(e) => { e.stopPropagation(); loadRepDetail(p.slug); }} style={{ ...refreshBtnStyle, padding: '4px 8px', minHeight: 0 }}>Retry</button></div>
                          ) : repDetails[p.slug] ? <RepScanDetail detail={repDetails[p.slug]} name={p.name} /> : null}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent signups + recent scans */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.5rem' }}>
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}><ClipboardList size={16} color="#22c55e" /> Recent Signups <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-tertiary)' }}>· filled out the form</span></h3>
          {data!.recentSignups.length === 0 ? (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '1rem 0' }}>No signups in this window. (Try a wider date range.)</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {data!.recentSignups.map(l => {
                const sc = statusColor(l.status);
                return (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--bg-elevated)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
                        {l.homeownerName || 'Unknown'}
                        {l.serviceType && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> · {l.serviceType}</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                        for <b style={{ color: 'var(--text-secondary)' }}>{l.profileName}</b>
                        {l.homeownerPhone && <> · {l.homeownerPhone}</>}
                        {l.address && <> · {l.address}</>}
                      </div>
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', background: sc.bg, color: sc.fg, borderRadius: 4, padding: '2px 6px' }}>{l.status || 'new'}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{etDate(l.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}><Clock size={16} color="#dc2626" /> Recent Scans</h3>
          {data!.recentScans.length === 0 ? <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '1rem 0' }}>No scans in this window.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {data!.recentScans.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--bg-elevated)' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>{deviceIcon(s.deviceType)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>{s.profileName}</span>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}> · /{s.profileSlug}</span>
                  </div>
                  {s.source && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '1px 5px' }}>{s.source}</span>}
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{etDate(s.scannedAt, true)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } .spin { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}

function presetBtn(active: boolean): React.CSSProperties {
  return {
    border: 'none', cursor: 'pointer', borderRadius: 6, padding: '6px 11px', fontSize: 13, fontWeight: 600,
    background: active ? '#dc2626' : 'transparent', color: active ? '#fff' : 'var(--text-tertiary)',
  };
}
