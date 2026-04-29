import React from 'react';
import { BarChart3, QrCode, FileText, Share2, TrendingUp, Users } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

type Bucket = { today: number; week: number; month: number; all: number };
type RepRow = {
  slug: string;
  name: string;
  scans: number;
  fills: number;
  shares: number;
  conversion_pct: number | null;
};
type DayRow = { date: string; scans: number; fills: number; shares: number };
type TallyRow = { source?: string; channel?: string; cnt: number };

interface Overview {
  success: boolean;
  windowDays: number;
  scans: Bucket;
  fills: Bucket;
  shares: Bucket;
  conversion: { week: number | null; month: number | null; allTime: number | null };
  byRep: RepRow[];
  daily: DayRow[];
  bySource: TallyRow[];
  byHow: TallyRow[];
}

export default function AdminLeadAnalyticsPanel({ userEmail }: { userEmail: string }) {
  const [data, setData] = React.useState<Overview | null>(null);
  const [windowDays, setWindowDays] = React.useState(30);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/api/lead-analytics/overview?days=${windowDays}`, {
      headers: { 'x-user-email': userEmail },
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.success) {
          setData(d);
          setError(null);
        } else {
          setError(d.error || 'Failed to load');
        }
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [userEmail, windowDays]);

  if (loading && !data) return <div style={{ padding: 24, color: 'var(--text-tertiary)' }}>Loading analytics…</div>;
  if (error) return <div style={{ padding: 24, color: '#dc2626' }}>Error: {error}</div>;
  if (!data) return null;

  const maxDaily = Math.max(1, ...data.daily.map((d) => d.scans + d.fills + d.shares));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '0 4px 40px' }}>
      {/* Window selector */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <BarChart3 size={20} color="#dc2626" />
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Lead Analytics</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {[7, 30, 90].map((n) => (
            <button
              key={n}
              onClick={() => setWindowDays(n)}
              style={{
                background: windowDays === n ? '#dc2626' : 'transparent',
                color: windowDays === n ? 'white' : 'var(--text-tertiary)',
                border: '1px solid ' + (windowDays === n ? '#dc2626' : 'var(--border-subtle)'),
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              {n}d
            </button>
          ))}
        </div>
      </div>

      {/* Top-line stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <StatCard
          title="QR Scans"
          icon={<QrCode size={16} />}
          accent="#3b82f6"
          today={data.scans.today}
          week={data.scans.week}
          month={data.scans.month}
          all={data.scans.all}
        />
        <StatCard
          title="Form Fills"
          icon={<FileText size={16} />}
          accent="#10b981"
          today={data.fills.today}
          week={data.fills.week}
          month={data.fills.month}
          all={data.fills.all}
        />
        <StatCard
          title="Shares"
          icon={<Share2 size={16} />}
          accent="#f59e0b"
          today={data.shares.today}
          week={data.shares.week}
          month={data.shares.month}
          all={data.shares.all}
        />
        <ConversionCard conversion={data.conversion} />
      </div>

      {/* Daily time-series chart (simple bar) */}
      <div style={cardStyle()}>
        <div style={cardHeader()}>
          <TrendingUp size={16} color="#dc2626" />
          <span>Daily activity — last {windowDays} days</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 140, padding: '12px 0', overflow: 'hidden' }}>
          {data.daily.map((d) => {
            const total = d.scans + d.fills + d.shares;
            const h = (total / maxDaily) * 120;
            return (
              <div
                key={d.date}
                title={`${d.date}\nScans: ${d.scans}\nFills: ${d.fills}\nShares: ${d.shares}`}
                style={{
                  flex: 1,
                  height: Math.max(2, h),
                  background: 'linear-gradient(to top, #f59e0b 0 ' + ((d.shares/Math.max(1,total))*100) + '%, #10b981 ' + ((d.shares/Math.max(1,total))*100) + '% ' + ((d.shares+d.fills)/Math.max(1,total)*100) + '%, #3b82f6 ' + ((d.shares+d.fills)/Math.max(1,total)*100) + '% 100%)',
                  borderRadius: 2,
                  minWidth: 4,
                }}
              />
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-tertiary)', justifyContent: 'center', paddingTop: 8 }}>
          <Legend color="#3b82f6" label="Scans" />
          <Legend color="#10b981" label="Fills" />
          <Legend color="#f59e0b" label="Shares" />
        </div>
      </div>

      {/* Side-by-side: by source + by how */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={cardStyle()}>
          <div style={cardHeader()}>Lead source ({windowDays}d)</div>
          {data.bySource.length === 0 ? (
            <div style={emptyStyle()}>No leads in window</div>
          ) : (
            <ul style={listStyle()}>
              {data.bySource.map((r) => (
                <li key={r.source} style={listRow()}>
                  <span style={{ textTransform: 'capitalize' }}>{r.source}</span>
                  <span style={{ fontWeight: 600 }}>{r.cnt}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div style={cardStyle()}>
          <div style={cardHeader()}>How did they hear ({windowDays}d)</div>
          {data.byHow.length === 0 ? (
            <div style={emptyStyle()}>No "How did you hear" data yet</div>
          ) : (
            <ul style={listStyle()}>
              {data.byHow.map((r) => (
                <li key={r.channel} style={listRow()}>
                  <span>{r.channel}</span>
                  <span style={{ fontWeight: 600 }}>{r.cnt}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Per-rep table */}
      <div style={cardStyle()}>
        <div style={cardHeader()}>
          <Users size={16} color="#dc2626" />
          <span>Per-rep breakdown ({windowDays}d) — sorted by scans + fills</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                <th style={thStyle()}>Rep</th>
                <th style={thStyleR()}>Scans</th>
                <th style={thStyleR()}>Fills</th>
                <th style={thStyleR()}>Shares</th>
                <th style={thStyleR()}>Conv %</th>
              </tr>
            </thead>
            <tbody>
              {data.byRep.map((r) => (
                <tr key={r.slug} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td style={tdStyle()}>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>/{r.slug}</div>
                  </td>
                  <td style={tdStyleR()}>{r.scans}</td>
                  <td style={tdStyleR()}>{r.fills}</td>
                  <td style={tdStyleR()}>{r.shares}</td>
                  <td style={{ ...tdStyleR(), color: r.conversion_pct === null ? 'var(--text-tertiary)' : r.conversion_pct >= 5 ? '#10b981' : 'var(--text-primary)' }}>
                    {r.conversion_pct === null ? '—' : `${r.conversion_pct}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, icon, accent, today, week, month, all }: { title: string; icon: React.ReactNode; accent: string; today: number; week: number; month: number; all: number }) {
  return (
    <div style={cardStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: accent, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
        {icon} {title}
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1, marginBottom: 4 }}>{week.toLocaleString()}</div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12 }}>last 7 days</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: 12 }}>
        <Mini label="Today" value={today} />
        <Mini label="30d" value={month} />
        <Mini label="All" value={all} />
      </div>
    </div>
  );
}

function ConversionCard({ conversion }: { conversion: { week: number | null; month: number | null; allTime: number | null } }) {
  const pct = (n: number | null) => (n === null ? '—' : `${n}%`);
  return (
    <div style={cardStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a855f7', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
        <TrendingUp size={16} /> Scan → Fill conversion
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1, marginBottom: 4 }}>{pct(conversion.week)}</div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12 }}>last 7 days</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
        <Mini label="30d" value={pct(conversion.month) as any} />
        <Mini label="All-time" value={pct(conversion.allTime) as any} />
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div style={{ color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ display: 'inline-block', width: 8, height: 8, background: color, borderRadius: 2 }} />
      {label}
    </span>
  );
}

const cardStyle = (): React.CSSProperties => ({
  background: 'var(--bg-primary)',
  border: '1px solid var(--bg-elevated)',
  borderRadius: 10,
  padding: 16,
});
const cardHeader = (): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-primary)',
  marginBottom: 12,
});
const emptyStyle = (): React.CSSProperties => ({
  padding: '12px 0',
  color: 'var(--text-tertiary)',
  fontSize: 13,
});
const listStyle = (): React.CSSProperties => ({
  listStyle: 'none',
  padding: 0,
  margin: 0,
});
const listRow = (): React.CSSProperties => ({
  display: 'flex',
  justifyContent: 'space-between',
  padding: '6px 0',
  fontSize: 13,
  color: 'var(--text-primary)',
  borderTop: '1px solid var(--border-subtle)',
});
const thStyle = (): React.CSSProperties => ({
  textAlign: 'left',
  padding: '8px 10px',
  color: 'var(--text-tertiary)',
  fontWeight: 500,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
});
const thStyleR = (): React.CSSProperties => ({ ...thStyle(), textAlign: 'right' });
const tdStyle = (): React.CSSProperties => ({
  padding: '8px 10px',
  color: 'var(--text-primary)',
});
const tdStyleR = (): React.CSSProperties => ({ ...tdStyle(), textAlign: 'right' });
