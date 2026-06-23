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
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Summary {
  scansToday: number;
  scansThisWeek: number;
  scansThisMonth: number;
  scansAllTime: number;
  uniqueVisitorsMonth: number;
  profilesScannedMonth: number;
}

interface DailyPoint { date: string; scans: number; uniqueVisitors?: number; }

interface RepDetail {
  stats: { scansToday: number; scansThisWeek: number; scansThisMonth: number; scansAllTime: number; uniqueVisitors: number };
  dailyScans: { date: string; scans: number }[];
}
interface TopProfile { slug: string; name: string; imageUrl: string | null; scanCount: number; uniqueVisitors: number; }
interface RecentScan { id: string; profileSlug: string; profileName: string; scannedAt: string; deviceType: string | null; source: string | null; }
interface DeviceRow { deviceType: string; count: number; }

interface AttributionProfile {
  slug: string;
  name: string;
  roleType: string;
  isActive: boolean;
  isClaimed: boolean;
  imageUrl: string | null;
  hasPhoto: boolean;
  createdByEmail: string | null;
  createdAt: string | null;
  updatedByEmail: string | null;
  updatedAt: string | null;
  videoCount: number;
  reviewCount: number;
  scanCount: number;
}

interface StaffRow {
  email: string;
  profilesCreated: number;
  profilesEdited: number;
  videosAdded: number;
  reviewsAdded: number;
}

interface AdminScanAnalyticsPanelProps {
  userEmail: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return (n ?? 0).toLocaleString('en-US');
}

function shortEmail(email: string | null | undefined): string {
  if (!email) return '—';
  return email.split('@')[0];
}

function etDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: '2-digit',
      ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    });
  } catch {
    return '—';
  }
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

// ─── Shared styles ────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 12,
  padding: '1.25rem',
};

const sectionTitleStyle: React.CSSProperties = {
  margin: '0 0 0.875rem 0',
  fontSize: 15,
  fontWeight: 700,
  color: 'var(--text-primary)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  color: 'var(--text-tertiary)',
  fontWeight: 600,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid var(--border-subtle)',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '9px 10px',
  fontSize: 13,
  color: 'var(--text-primary)',
  borderBottom: '1px solid var(--bg-elevated)',
  verticalAlign: 'middle',
};

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, accent }: { label: string; value: number | string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? 'linear-gradient(135deg, rgba(220,38,38,0.14) 0%, rgba(185,28,28,0.06) 100%)' : 'var(--bg-primary)',
      border: `1px solid ${accent ? 'rgba(220,38,38,0.35)' : 'var(--border-subtle)'}`,
      borderRadius: 12,
      padding: '1rem 1.1rem',
      flex: 1,
      minWidth: 140,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-tertiary)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
    </div>
  );
}

// ─── Daily trend (dependency-free CSS bar chart) ──────────────────────────────

function DailyTrend({ data }: { data: DailyPoint[] }) {
  if (!data.length) {
    return <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '1.5rem 0', textAlign: 'center' }}>No scans recorded in this window yet.</div>;
  }
  const max = Math.max(...data.map(d => d.scans), 1);
  const peak = data.reduce((a, b) => (b.scans > a.scans ? b : a), data[0]);

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: data.length > 45 ? 2 : 4,
        height: 160,
        padding: '8px 0',
        overflowX: 'auto',
      }}>
        {data.map((d) => {
          const h = Math.max((d.scans / max) * 100, d.scans > 0 ? 4 : 1);
          return (
            <div
              key={d.date}
              title={`${etDate(d.date)} — ${d.scans} scan${d.scans === 1 ? '' : 's'}${d.uniqueVisitors != null ? `, ${d.uniqueVisitors} unique` : ''}`}
              style={{
                flex: '1 0 auto',
                minWidth: data.length > 45 ? 5 : 8,
                height: `${h}%`,
                background: d.scans > 0
                  ? 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)'
                  : 'var(--bg-elevated)',
                borderRadius: '3px 3px 0 0',
                transition: 'height 0.2s ease',
              }}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
        <span>{etDate(data[0].date)}</span>
        <span>Peak: <b style={{ color: 'var(--text-primary)' }}>{peak.scans}</b> on {etDate(peak.date)}</span>
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
        {icon}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <div style={{ flex: 1, background: 'var(--bg-elevated)', borderRadius: 6, height: 22, position: 'relative', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #b91c1c 0%, #ef4444 100%)', borderRadius: 6, minWidth: value > 0 ? 3 : 0, transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ width: 90, minWidth: 90, textAlign: 'right', fontSize: 13 }}>
        <b style={{ color: 'var(--text-primary)' }}>{fmt(value)}</b>
        {sub && <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}> {sub}</span>}
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
          <TrendingUp size={13} color="#dc2626" /> {name} — daily scans (last 30 days)
        </div>
        {total === 0
          ? <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '0.5rem 0' }}>No scans recorded for this rep yet.</div>
          : <DailyTrend data={detail.dailyScans} />}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function AdminScanAnalyticsPanel({ userEmail }: AdminScanAnalyticsPanelProps) {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [range, setRange] = React.useState<7 | 30 | 90>(30);

  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [daily, setDaily] = React.useState<DailyPoint[]>([]);
  const [topProfiles, setTopProfiles] = React.useState<TopProfile[]>([]);
  const [devices, setDevices] = React.useState<DeviceRow[]>([]);
  const [recent, setRecent] = React.useState<RecentScan[]>([]);
  const [attribution, setAttribution] = React.useState<AttributionProfile[]>([]);
  const [staff, setStaff] = React.useState<StaffRow[]>([]);

  // Per-rep scan-history drill-down (click a row → load that rep's full history)
  const [expandedSlug, setExpandedSlug] = React.useState<string | null>(null);
  const [repDetails, setRepDetails] = React.useState<Record<string, RepDetail>>({});
  const [detailError, setDetailError] = React.useState<Record<string, boolean>>({});
  const [loadingDetail, setLoadingDetail] = React.useState<string | null>(null);

  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 760);
    check();
    window.addEventListener('resize', check);
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
    setLoading(true);
    setError(null);
    try {
      const [s, d, t, dev, r, attr] = await Promise.all([
        fetchJSON('/api/qr-analytics/summary'),
        fetchJSON(`/api/qr-analytics/daily?days=${range}`),
        fetchJSON(`/api/qr-analytics/top-profiles?days=${range}&limit=10`),
        fetchJSON(`/api/qr-analytics/by-device?days=${range}`),
        fetchJSON('/api/qr-analytics/recent?limit=25'),
        fetchJSON('/api/qr-analytics/attribution'),
      ]);
      setSummary(s);
      setDaily(d.data || []);
      setTopProfiles(t.profiles || []);
      setDevices(dev.breakdown || []);
      setRecent(r.scans || []);
      setAttribution(attr.profiles || []);
      setStaff(attr.staff || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [fetchJSON, range]);

  React.useEffect(() => { load(); }, [load]);

  const loadRepDetail = React.useCallback(async (slug: string) => {
    setLoadingDetail(slug);
    setDetailError(prev => ({ ...prev, [slug]: false }));
    try {
      const d = await fetchJSON(`/api/qr-analytics/profile/${encodeURIComponent(slug)}`);
      setRepDetails(prev => ({ ...prev, [slug]: { stats: d.stats, dailyScans: d.dailyScans || [] } }));
    } catch {
      setDetailError(prev => ({ ...prev, [slug]: true }));
    } finally {
      setLoadingDetail(null);
    }
  }, [fetchJSON]);

  const toggleRep = React.useCallback((slug: string) => {
    if (expandedSlug === slug) { setExpandedSlug(null); return; }
    setExpandedSlug(slug);
    if (!repDetails[slug] && loadingDetail !== slug) loadRepDetail(slug);
  }, [expandedSlug, repDetails, loadingDetail, loadRepDetail]);

  const maxTop = Math.max(...topProfiles.map(p => p.scanCount), 1);
  const totalDevice = devices.reduce((sum, d) => sum + d.count, 0);
  const maxDevice = Math.max(...devices.map(d => d.count), 1);

  if (loading && !summary) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '4rem', color: 'var(--text-tertiary)' }}>
        <Loader size={20} className="spin" /> Loading scan analytics…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...cardStyle, margin: '1.5rem', borderColor: '#7f1d1d', textAlign: 'center' }}>
        <div style={{ color: '#fca5a5', fontSize: 14, marginBottom: 12 }}>{error}</div>
        <button onClick={load} style={refreshBtnStyle}><RefreshCw size={14} /> Retry</button>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? '1rem' : '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <QrCode size={20} color="#dc2626" /> QR Scan Analytics
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-tertiary)' }}>
            Every QR scan, top reps, devices, and who set up each rep's page — all in one place.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: 8, padding: 3, gap: 2 }}>
            {([7, 30, 90] as const).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  border: 'none', cursor: 'pointer', borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 600,
                  background: range === r ? '#dc2626' : 'transparent',
                  color: range === r ? '#fff' : 'var(--text-tertiary)',
                }}
              >
                {r}d
              </button>
            ))}
          </div>
          <button onClick={load} style={refreshBtnStyle} title="Refresh">
            {loading ? <Loader size={14} className="spin" /> : <RefreshCw size={14} />}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <StatCard label="Scans Today" value={fmt(summary?.scansToday ?? 0)} icon={<QrCode size={13} />} accent />
        <StatCard label="This Week" value={fmt(summary?.scansThisWeek ?? 0)} icon={<TrendingUp size={13} />} />
        <StatCard label="This Month" value={fmt(summary?.scansThisMonth ?? 0)} icon={<TrendingUp size={13} />} />
        <StatCard label="All Time" value={fmt(summary?.scansAllTime ?? 0)} icon={<QrCode size={13} />} />
        <StatCard label="Unique Visitors (30d)" value={fmt(summary?.uniqueVisitorsMonth ?? 0)} icon={<Users size={13} />} />
        <StatCard label="Reps Scanned (30d)" value={fmt(summary?.profilesScannedMonth ?? 0)} icon={<Eye size={13} />} />
      </div>

      {/* Daily trend */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}><TrendingUp size={16} color="#dc2626" /> Daily Scans · last {range} days</h3>
        <DailyTrend data={daily} />
      </div>

      {/* Top reps + devices side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: '1.5rem' }}>
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}><TrendingUp size={16} color="#dc2626" /> Top Reps by Scans</h3>
          {topProfiles.length === 0 ? (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '1rem 0' }}>No scans in this window.</div>
          ) : (
            topProfiles.map(p => (
              <BarRow
                key={p.slug}
                label={p.name}
                sub={`· ${p.uniqueVisitors} uniq`}
                value={p.scanCount}
                max={maxTop}
                icon={p.imageUrl
                  ? <img src={p.imageUrl} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                  : <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>{getInitials(p.name)}</div>}
              />
            ))
          )}
        </div>

        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}><Smartphone size={16} color="#dc2626" /> Device Breakdown</h3>
          {devices.length === 0 ? (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '1rem 0' }}>No scans in this window.</div>
          ) : (
            devices.map(d => (
              <BarRow
                key={d.deviceType}
                label={<span style={{ textTransform: 'capitalize' }}>{d.deviceType}</span>}
                sub={totalDevice > 0 ? `· ${Math.round((d.count / totalDevice) * 100)}%` : ''}
                value={d.count}
                max={maxDevice}
                icon={deviceIcon(d.deviceType)}
              />
            ))
          )}
        </div>
      </div>

      {/* Setup attribution — "who filled out what for who" */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}><UserCheck size={16} color="#dc2626" /> Who Set Up What — Rep Page Attribution</h3>
        <p style={{ margin: '-4px 0 12px', fontSize: 12.5, color: 'var(--text-tertiary)' }}>
          Who created and last edited each rep's page, how much content it has, and how many scans it's pulled.
        </p>

        {/* Staff rollup chips */}
        {staff.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {staff.map(s => (
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

        {/* Per-rep table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 640 : undefined }}>
            <thead>
              <tr>
                <th style={thStyle}>Rep Page</th>
                <th style={thStyle}>Created By</th>
                <th style={thStyle}>Last Edited By</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Content</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Scans</th>
              </tr>
            </thead>
            <tbody>
              {attribution.length === 0 ? (
                <tr><td style={{ ...tdStyle, color: 'var(--text-tertiary)', textAlign: 'center' }} colSpan={5}>No rep pages yet.</td></tr>
              ) : (
                attribution.map(p => {
                  const expanded = expandedSlug === p.slug;
                  return (
                  <React.Fragment key={p.slug}>
                  <tr
                    onClick={() => toggleRep(p.slug)}
                    style={{ cursor: 'pointer', background: expanded ? 'var(--bg-primary)' : 'transparent' }}
                    title="Click to see this rep's past scans"
                  >
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--text-tertiary)', display: 'flex' }}>
                          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </span>
                        {p.imageUrl
                          ? <img src={p.imageUrl} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
                          : <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{getInitials(p.name)}</div>}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                            {p.name}
                            {!p.isActive && <span style={{ fontSize: 10, color: '#fca5a5', border: '1px solid #7f1d1d', borderRadius: 4, padding: '0 4px' }}>inactive</span>}
                          </div>
                          <a href={`/profile/${p.slug}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: 'var(--text-tertiary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                            /{p.slug} <ExternalLink size={9} />
                          </a>
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>{shortEmail(p.createdByEmail)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{etDate(p.createdAt)}</div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>{shortEmail(p.updatedByEmail)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{etDate(p.updatedAt)}</div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: 10, color: 'var(--text-tertiary)', fontSize: 12 }}>
                        <span title="Photo" style={{ color: p.hasPhoto ? '#22c55e' : 'var(--text-tertiary)' }}><Camera size={12} style={{ verticalAlign: -1 }} /></span>
                        <span title="Videos"><Video size={12} style={{ verticalAlign: -1 }} /> {p.videoCount}</span>
                        <span title="Reviews"><Star size={12} style={{ verticalAlign: -1 }} /> {p.reviewCount}</span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{fmt(p.scanCount)}</td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={5} style={{ background: 'var(--bg-primary)', padding: '4px 16px 16px', borderBottom: '1px solid var(--bg-elevated)' }}>
                        {loadingDetail === p.slug && !repDetails[p.slug] ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-tertiary)', fontSize: 13, padding: '0.5rem 0' }}>
                            <Loader size={14} className="spin" /> Loading {p.name}'s scan history…
                          </div>
                        ) : detailError[p.slug] ? (
                          <div style={{ color: '#fca5a5', fontSize: 13, padding: '0.5rem 0' }}>
                            Couldn't load scan history. <button onClick={(e) => { e.stopPropagation(); loadRepDetail(p.slug); }} style={{ ...refreshBtnStyle, padding: '4px 8px', minHeight: 0 }}>Retry</button>
                          </div>
                        ) : repDetails[p.slug] ? (
                          <RepScanDetail detail={repDetails[p.slug]} name={p.name} />
                        ) : null}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent scans feed */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}><Clock size={16} color="#dc2626" /> Recent Scans</h3>
        {recent.length === 0 ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '1rem 0' }}>No scans yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recent.map(s => (
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } .spin { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}

const refreshBtnStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  cursor: 'pointer',
  padding: '8px 12px',
  fontSize: 13,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 38,
};
