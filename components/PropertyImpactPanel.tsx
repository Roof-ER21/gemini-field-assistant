/**
 * PropertyImpactPanel — "Which of my homes got hit?"
 *
 * Appears when a storm date is selected on the TerritoryHailMap. Calls
 * /api/hail/rep-storm-impact to find the rep's customer_properties that
 * fell inside any MRMS hail-size band for that storm, sorted largest
 * hail first. Click a property → center the map on it.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { getApiBaseUrl } from '../services/config';

interface PropertyImpact {
  id: string;
  customerName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  lat: number;
  lng: number;
  phone?: string | null;
  email?: string | null;
  notifyThresholdHailSize: number;
  doNotContact: boolean;
  lastServiceDate?: string | null;
  maxHailInches: number | null;
  hailLabel: string | null;
  hailColor: string | null;
  hailSeverity: string | null;
  level: number | null;
  directHit: boolean;
  crossesNotifyThreshold: boolean;
}

interface BandSummary {
  sizeInches: number;
  label: string;
  color: string;
  count: number;
}

interface RepStormImpactResponse {
  date: string;
  anchorTimestamp: string | null;
  metadata: {
    stormMaxInches: number;
    stormHailCells: number;
    stormFeatureCount: number;
    pointsChecked: number;
    directHits: number;
  };
  properties: PropertyImpact[];
  byBand: BandSummary[];
}

interface PropertyImpactPanelProps {
  selectedDate: string | null;
  anchorTimestamp?: string | null;
  userEmail?: string | null;
  onPropertyClick?: (property: PropertyImpact) => void;
}

async function createShareableLink(args: {
  propertyId: string;
  stormDate: string;
  anchorTimestamp?: string | null;
  userEmail: string;
}): Promise<{ url: string; expiresInDays: number }> {
  const res = await fetch(`${apiBaseUrl}/hail/claim-packet-share`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': args.userEmail,
    },
    body: JSON.stringify({
      propertyId: args.propertyId,
      stormDate: args.stormDate,
      anchorTimestamp: args.anchorTimestamp || null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || 'Share link creation failed');
  }
  return res.json();
}

async function downloadClaimPacket(args: {
  propertyId: string;
  stormDate: string;
  anchorTimestamp?: string | null;
  userEmail: string;
  customerName: string;
}) {
  const res = await fetch(`${apiBaseUrl}/hail/claim-packet`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': args.userEmail,
    },
    body: JSON.stringify({
      propertyId: args.propertyId,
      stormDate: args.stormDate,
      anchorTimestamp: args.anchorTimestamp || null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || 'Claim packet failed');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = args.customerName.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40);
  a.download = `ClaimPacket_${safeName}_${args.stormDate}.pdf`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

const apiBaseUrl = getApiBaseUrl();

export default function PropertyImpactPanel({
  selectedDate,
  anchorTimestamp,
  userEmail,
  onPropertyClick,
}: PropertyImpactPanelProps) {
  const [data, setData] = useState<RepStormImpactResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showMissed, setShowMissed] = useState(false);

  useEffect(() => {
    if (!selectedDate || !userEmail) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ date: selectedDate });
    if (anchorTimestamp) params.set('anchorTimestamp', anchorTimestamp);

    fetch(`${apiBaseUrl}/hail/rep-storm-impact?${params}`, {
      headers: { 'x-user-email': userEmail },
      signal: AbortSignal.timeout(60000),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then((json: RepStormImpactResponse) => {
        if (cancelled) return;
        setData(json);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[PropertyImpact] fetch failed:', err);
        setError((err as Error).message);
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedDate, anchorTimestamp, userEmail]);

  const hits = useMemo(
    () => data?.properties.filter((p) => p.directHit) || [],
    [data],
  );
  const misses = useMemo(
    () => data?.properties.filter((p) => !p.directHit) || [],
    [data],
  );
  const total = data?.properties.length || 0;

  if (!selectedDate) return null;
  if (!userEmail) {
    return (
      <PanelShell title="Properties in Storm" collapsed={false} onToggle={() => {}}>
        <div style={styles.placeholder}>Sign in to see your customer properties.</div>
      </PanelShell>
    );
  }

  return (
    <PanelShell
      title={`Your Homes (${selectedDate})`}
      collapsed={collapsed}
      onToggle={() => setCollapsed((v) => !v)}
      accentColor={data?.byBand[0]?.color}
    >
      {loading && (
        <div style={styles.placeholder}>Scanning {selectedDate} swath polygons…</div>
      )}
      {error && (
        <div style={{ ...styles.placeholder, color: '#fca5a5' }}>
          Couldn't load property impact: {error}
        </div>
      )}
      {!loading && !error && data && (
        <>
          <SummaryRow
            directHits={hits.length}
            total={total}
            stormMax={data.metadata.stormMaxInches}
          />

          {data.byBand.length > 0 && (
            <div style={styles.bandGrid}>
              {data.byBand.map((b) => (
                <div key={b.sizeInches} style={styles.bandChip}>
                  <span
                    style={{ ...styles.bandSwatch, background: b.color }}
                    aria-hidden="true"
                  />
                  <span style={styles.bandLabel}>{b.label}+</span>
                  <span style={styles.bandCount}>{b.count}</span>
                </div>
              ))}
            </div>
          )}

          {hits.length === 0 && (
            <div style={styles.placeholder}>
              {total === 0
                ? "You don't have any customer properties on file yet."
                : 'None of your properties were inside this storm.'}
            </div>
          )}

          {hits.length > 0 && (
            <div style={styles.list}>
              {hits.map((p) => (
                <PropertyRow
                  key={p.id}
                  property={p}
                  onClick={onPropertyClick}
                  selectedDate={selectedDate ?? undefined}
                  anchorTimestamp={anchorTimestamp}
                  userEmail={userEmail}
                />
              ))}
            </div>
          )}

          {misses.length > 0 && (
            <>
              <button
                onClick={() => setShowMissed((v) => !v)}
                style={styles.showMissedBtn}
              >
                {showMissed ? '▼' : '▶'} {misses.length} not in storm
              </button>
              {showMissed && (
                <div style={styles.list}>
                  {misses.map((p) => (
                    <PropertyRow
                      key={p.id}
                      property={p}
                      onClick={onPropertyClick}
                      muted
                      selectedDate={selectedDate ?? undefined}
                      anchorTimestamp={anchorTimestamp}
                      userEmail={userEmail}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PanelShell({
  title,
  collapsed,
  onToggle,
  accentColor,
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  accentColor?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.panel}>
      <button onClick={onToggle} style={{ ...styles.header, borderLeftColor: accentColor || '#64748b' }}>
        <span style={styles.title}>{title}</span>
        <span style={styles.caret}>{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && <div style={styles.body}>{children}</div>}
    </div>
  );
}

function SummaryRow({
  directHits,
  total,
  stormMax,
}: { directHits: number; total: number; stormMax: number }) {
  const color =
    directHits === 0 ? '#64748b' :
    directHits < Math.max(1, total * 0.1) ? '#f59e0b' :
    '#ef4444';

  return (
    <div style={styles.summary}>
      <span style={{ ...styles.summaryNumber, color }}>{directHits}</span>
      <span style={styles.summaryLabel}>
        of <strong>{total}</strong> homes hit
      </span>
      <span style={styles.summaryPeak}>peak {stormMax.toFixed(2)}"</span>
    </div>
  );
}

function PropertyRow({
  property,
  onClick,
  muted,
  selectedDate,
  anchorTimestamp,
  userEmail,
}: {
  property: PropertyImpact;
  onClick?: (p: PropertyImpact) => void;
  muted?: boolean;
  selectedDate?: string;
  anchorTimestamp?: string | null;
  userEmail?: string | null;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const isHit = property.directHit;
  const severity = property.hailSeverity || '';
  const isHigh = property.maxHailInches !== null && property.maxHailInches >= 1.5;
  const canDownloadPacket = isHit && selectedDate && userEmail;

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedDate || !userEmail) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadClaimPacket({
        propertyId: property.id,
        stormDate: selectedDate,
        anchorTimestamp,
        userEmail,
        customerName: property.customerName,
      });
    } catch (err) {
      setDownloadError((err as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  const handleShareLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedDate || !userEmail) return;
    setSharing(true);
    setShareMessage(null);
    try {
      const { url, expiresInDays } = await createShareableLink({
        propertyId: property.id,
        stormDate: selectedDate,
        anchorTimestamp,
        userEmail,
      });
      await navigator.clipboard.writeText(url);
      setShareMessage(`Link copied (${expiresInDays}d expiry)`);
      setTimeout(() => setShareMessage(null), 4000);
    } catch (err) {
      setShareMessage(`Error: ${(err as Error).message}`);
      setTimeout(() => setShareMessage(null), 6000);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div
      style={{
        ...styles.row,
        opacity: muted ? 0.55 : 1,
        borderLeftColor: isHit ? property.hailColor || '#ef4444' : '#334155',
        cursor: 'default',
      }}
    >
      <button
        onClick={() => onClick?.(property)}
        style={{ ...styles.rowMain, background: 'none', border: 'none', color: 'inherit', textAlign: 'left', padding: 0, cursor: 'pointer' }}
      >
        <div style={styles.rowName}>{property.customerName}</div>
        <div style={styles.rowAddress}>
          {property.address}, {property.city} {property.zipCode}
        </div>
        {isHit && isHigh && (
          <div style={styles.insuranceNote}>
            ⚠ Above common insurance claim threshold
          </div>
        )}
        {property.doNotContact && (
          <div style={styles.dncTag}>DO NOT CONTACT</div>
        )}
        {downloadError && (
          <div style={{ ...styles.dncTag, color: '#f87171', fontSize: 9 }}>
            Packet error: {downloadError}
          </div>
        )}
        {canDownloadPacket && (
          <div style={styles.packetRow}>
            <button
              onClick={handleDownload}
              disabled={downloading}
              style={styles.packetBtn}
            >
              {downloading ? 'Generating…' : '📄 PDF'}
            </button>
            <button
              onClick={handleShareLink}
              disabled={sharing}
              style={styles.shareBtn}
              title="Copy a 30-day shareable link — adjuster can open the PDF without logging in"
            >
              {sharing ? '…' : '🔗 Adjuster Link'}
            </button>
            {shareMessage && (
              <span style={styles.shareMessage}>{shareMessage}</span>
            )}
          </div>
        )}
      </button>
      <div style={{ ...styles.rowBadge, background: isHit ? (property.hailColor || '#ef4444') : '#1e293b' }}>
        {isHit ? (
          <>
            <div style={styles.rowBadgeSize}>{property.hailLabel}</div>
            <div style={styles.rowBadgeSev}>{severity.replace('_', ' ')}</div>
          </>
        ) : (
          <div style={styles.rowBadgeMiss}>—</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: '100%',
    background: 'rgba(10,10,15,0.92)',
    backdropFilter: 'blur(6px)',
    borderRadius: 12,
    color: '#f1f5f9',
    boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
    overflow: 'hidden',
  },
  header: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    background: 'transparent',
    border: 'none',
    borderLeft: '3px solid #64748b',
    color: '#f1f5f9',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
    textAlign: 'left',
  },
  title: { letterSpacing: 0.3 },
  caret: { fontSize: 11, color: '#94a3b8' },
  body: { padding: '8px 12px 12px' },
  placeholder: {
    fontSize: 12,
    color: '#94a3b8',
    padding: '8px 0',
    textAlign: 'center',
  },
  summary: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 10,
    paddingBottom: 10,
    borderBottom: '1px solid rgba(148,163,184,0.15)',
  },
  summaryNumber: { fontSize: 28, fontWeight: 700, lineHeight: 1 },
  summaryLabel: { fontSize: 12, color: '#cbd5e1' },
  summaryPeak: { marginLeft: 'auto', fontSize: 11, color: '#94a3b8' },
  bandGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  bandChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    borderRadius: 999,
    background: 'rgba(30,41,59,0.8)',
    fontSize: 11,
  },
  bandSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
    display: 'inline-block',
  },
  bandLabel: { fontFamily: 'ui-monospace, monospace' },
  bandCount: { color: '#e2e8f0', fontWeight: 600 },
  list: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' },
  row: {
    display: 'flex',
    gap: 8,
    padding: '8px 10px',
    background: 'rgba(15,23,42,0.7)',
    border: 'none',
    borderLeft: '3px solid #334155',
    borderRadius: 6,
    color: '#e2e8f0',
    textAlign: 'left',
    cursor: 'pointer',
    width: '100%',
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowAddress: { fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowBadge: {
    minWidth: 60,
    padding: '4px 6px',
    borderRadius: 6,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#0f172a',
    fontWeight: 700,
  },
  rowBadgeSize: { fontSize: 13, fontFamily: 'ui-monospace, monospace' },
  rowBadgeSev: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.7 },
  rowBadgeMiss: { color: '#64748b', fontSize: 14 },
  insuranceNote: {
    marginTop: 2,
    fontSize: 10,
    color: '#fbbf24',
  },
  dncTag: {
    marginTop: 2,
    fontSize: 9,
    color: '#f87171',
    fontWeight: 700,
    letterSpacing: 0.5,
  },
  showMissedBtn: {
    marginTop: 8,
    width: '100%',
    padding: '6px 8px',
    fontSize: 11,
    background: 'transparent',
    border: '1px solid rgba(148,163,184,0.2)',
    borderRadius: 6,
    color: '#94a3b8',
    cursor: 'pointer',
    textAlign: 'left',
  },
  packetRow: {
    display: 'flex',
    gap: 6,
    marginTop: 6,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  packetBtn: {
    padding: '4px 8px',
    fontSize: 10,
    fontWeight: 600,
    background: 'rgba(37,99,235,0.85)',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    cursor: 'pointer',
  },
  shareBtn: {
    padding: '4px 8px',
    fontSize: 10,
    fontWeight: 600,
    background: 'rgba(22,163,74,0.85)',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    cursor: 'pointer',
  },
  shareMessage: {
    fontSize: 10,
    color: '#10b981',
    fontWeight: 600,
  },
};
