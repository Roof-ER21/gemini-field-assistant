import React from 'react';
import {
  Award,
  RefreshCw,
  Loader,
  Phone,
  Mail,
  MapPin,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Download,
  QrCode,
  ExternalLink,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Nomination {
  id: string;
  reference: string;
  veteranName: string;
  branch: string;
  veteranAddress: string;
  veteranPhone: string | null;
  veteranEmail: string | null;
  story: string;
  nominatorName: string;
  nominatorPhone: string;
  nominatorEmail: string | null;
  repSlug: string | null;
  repName: string | null;
  source: string | null;
  emailStatus: string | null;
  receivedAt: string;
}

interface VeteransData {
  summary: { total: number; today: number; week: number; emailFailed: number; latest: string | null };
  bySource: { source: string; count: number }[];
  byRep: { slug: string; name: string; count: number }[];
  nominations: Nomination[];
}

// ─── Styles (kept in step with AdminScanAnalyticsPanel) ──────────────────────

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
  padding: '9px 10px', fontSize: 13, color: 'var(--text-primary)', borderBottom: '1px solid var(--bg-elevated)', verticalAlign: 'top',
};
const refreshBtnStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-primary)',
  cursor: 'pointer', padding: '8px 12px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 38,
};

function StatCard({ label, value, hint, accent }: { label: string; value: number | string; hint?: string; accent?: string }) {
  return (
    <div style={{ ...cardStyle, padding: '1rem 1.125rem', flex: '1 1 150px', minWidth: 150 }}>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent || 'var(--text-primary)', lineHeight: 1.2, marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

// "card_likely" and friends come straight from the campaign's src param; make
// them readable without hiding an unexpected value behind a generic label.
const SOURCE_LABELS: Record<string, string> = {
  qr: 'QR card',
  'rep-page': 'Rep page',
  inspection: 'Inspection page',
  direct: 'Direct / unknown',
};
const sourceLabel = (s: string) => SOURCE_LABELS[s] || s;

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch { return iso; }
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export default function AdminVeteransPanel({ userEmail }: { userEmail: string }) {
  const [data, setData] = React.useState<VeteransData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 820);
    check(); window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/veterans/nominations`, { headers: { 'x-user-email': userEmail } });
      if (!res.ok) {
        if (res.status === 403) throw new Error('You need admin or marketing access to view nominations.');
        throw new Error(`Request failed (${res.status})`);
      }
      const d = await res.json();
      setData(d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load nominations');
    } finally { setLoading(false); }
  }, [userEmail]);

  React.useEffect(() => { load(); }, [load]);

  const exportCsv = React.useCallback(() => {
    if (!data) return;
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Reference', 'Received', 'Veteran', 'Branch', 'Address', 'Veteran phone', 'Veteran email',
      'Nominated by', 'Nominator phone', 'Nominator email', 'Rep', 'Source', 'Story'];
    const lines = data.nominations.map(n => [
      n.reference, n.receivedAt, n.veteranName, n.branch, n.veteranAddress, n.veteranPhone, n.veteranEmail,
      n.nominatorName, n.nominatorPhone, n.nominatorEmail, n.repName || n.repSlug, n.source || 'direct', n.story,
    ].map(cell).join(','));
    const blob = new Blob([[header.map(cell).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `veteran-nominations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  if (loading && !data) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '4rem', color: 'var(--text-tertiary)' }}><Loader size={20} className="spin" /> Loading nominations…</div>;
  }
  if (error) {
    return (
      <div style={{ ...cardStyle, margin: '1.5rem', borderColor: '#7f1d1d', textAlign: 'center' }}>
        <div style={{ color: '#fca5a5', fontSize: 14, marginBottom: 12 }}>{error}</div>
        <button onClick={load} style={refreshBtnStyle}><RefreshCw size={14} /> Retry</button>
      </div>
    );
  }
  if (!data) return null;

  const { summary, bySource, byRep, nominations } = data;

  return (
    <div style={{ padding: isMobile ? '1rem' : '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Award size={20} color="#dc2626" /> Veterans Day Giveaway
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-tertiary)' }}>
            Every nomination that came through the campaign, who sent it in, and which rep gets credit.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportCsv} style={refreshBtnStyle} title="Download as CSV" disabled={!nominations.length}>
            <Download size={14} /> Export
          </button>
          <button onClick={load} style={refreshBtnStyle} title="Refresh">
            {loading ? <Loader size={14} className="spin" /> : <RefreshCw size={14} />} Refresh
          </button>
        </div>
      </div>

      {/* The link the QR codes point at — the one thing people ask for and
          can never find. Kept on screen so it can be copied from here. */}
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <QrCode size={18} color="#dc2626" style={{ flexShrink: 0 }} />
        <div style={{ flex: '1 1 260px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Campaign link (what the QR codes open)</div>
          <code style={{ fontSize: 14, color: 'var(--text-primary)' }}>get.theroofdocs.com/vets</code>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Add <code>?rep=firstname-lastname</code> to credit a specific rep.
          </div>
        </div>
        <a href="/vets" target="_blank" rel="noopener noreferrer" style={{ ...refreshBtnStyle, textDecoration: 'none' }}>
          <ExternalLink size={14} /> Open
        </a>
      </div>

      {/* Counts */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard label="Nominations" value={summary.total} accent="#dc2626" />
        <StatCard label="Today" value={summary.today} />
        <StatCard label="This week" value={summary.week} />
        <StatCard
          label="Last one in"
          value={summary.latest ? fmtDate(summary.latest) : '—'}
          hint={summary.total ? undefined : 'Nothing yet'}
        />
      </div>

      {summary.emailFailed > 0 && (
        <div style={{ ...cardStyle, borderColor: '#7f1d1d', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={18} color="#fca5a5" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: '#fca5a5' }}>
            <b>{summary.emailFailed}</b> {summary.emailFailed === 1 ? 'nomination' : 'nominations'} never made it out as a team email.
            They are all listed below — nothing was lost, but nobody was alerted by email.
          </div>
        </div>
      )}

      {/* Where they came from / who gets credit */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.5rem' }}>
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}><MapPin size={15} color="#dc2626" /> How they arrived</h3>
          {bySource.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No nominations yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={thBase}>Source</th><th style={{ ...thBase, textAlign: 'right' }}>Count</th></tr></thead>
              <tbody>
                {bySource.map(r => (
                  <tr key={r.source}>
                    <td style={tdStyle}>{sourceLabel(r.source)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}><Award size={15} color="#dc2626" /> Credited to a rep</h3>
          {byRep.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              No rep-attributed nominations yet. A nomination is credited when it arrives through a rep's page or a QR link carrying <code>?rep=</code>.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={thBase}>Rep</th><th style={{ ...thBase, textAlign: 'right' }}>Count</th></tr></thead>
              <tbody>
                {byRep.map(r => (
                  <tr key={r.slug}>
                    <td style={tdStyle}>{r.name}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* The nominations themselves */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>Nominations</h3>
        {nominations.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            Nothing has come in yet. Anything submitted on the campaign page lands here within seconds.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ ...thBase, width: 28 }} />
                  <th style={thBase}>Veteran</th>
                  <th style={thBase}>Branch</th>
                  <th style={thBase}>Nominated by</th>
                  <th style={thBase}>Rep</th>
                  <th style={thBase}>Source</th>
                  <th style={thBase}>Received</th>
                </tr>
              </thead>
              <tbody>
                {nominations.map(n => {
                  const open = expanded === n.id;
                  return (
                    <React.Fragment key={n.id}>
                      <tr
                        onClick={() => setExpanded(open ? null : n.id)}
                        style={{ cursor: 'pointer' }}
                        title="Click for the full story and contact details"
                      >
                        <td style={tdStyle}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>
                          {n.veteranName}
                          {n.emailStatus === 'failed' && (
                            <AlertTriangle size={12} color="#fca5a5" style={{ marginLeft: 6, verticalAlign: 'middle' }} />
                          )}
                        </td>
                        <td style={tdStyle}>{n.branch}</td>
                        <td style={tdStyle}>{n.nominatorName}</td>
                        <td style={tdStyle}>{n.repName || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                        <td style={tdStyle}>{sourceLabel(n.source || 'direct')}</td>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtDate(n.receivedAt)}</td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={7} style={{ ...tdStyle, background: 'var(--bg-elevated)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem', marginBottom: 12 }}>
                              <div>
                                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 4 }}>VETERAN</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}><MapPin size={13} color="#dc2626" /> {n.veteranAddress}</div>
                                {n.veteranPhone && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}><Phone size={13} color="#dc2626" /> <a href={`tel:${n.veteranPhone}`} style={{ color: 'var(--text-primary)' }}>{n.veteranPhone}</a></div>}
                                {n.veteranEmail && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Mail size={13} color="#dc2626" /> <a href={`mailto:${n.veteranEmail}`} style={{ color: 'var(--text-primary)' }}>{n.veteranEmail}</a></div>}
                              </div>
                              <div>
                                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 4 }}>NOMINATED BY</div>
                                <div style={{ marginBottom: 3 }}>{n.nominatorName}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}><Phone size={13} color="#dc2626" /> <a href={`tel:${n.nominatorPhone}`} style={{ color: 'var(--text-primary)' }}>{n.nominatorPhone}</a></div>
                                {n.nominatorEmail && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Mail size={13} color="#dc2626" /> <a href={`mailto:${n.nominatorEmail}`} style={{ color: 'var(--text-primary)' }}>{n.nominatorEmail}</a></div>}
                              </div>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 4 }}>THEIR STORY</div>
                            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{n.story}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 10 }}>
                              Reference {n.reference}
                              {n.emailStatus === 'failed' && ' · team email failed to send'}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
