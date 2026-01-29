import React, { useEffect, useMemo, useState } from 'react';
import { Cloud, AlertTriangle, Calendar, Wind, Mail, FileText, Download, Printer, Database, Tornado } from 'lucide-react';
import { hailMapsApi, HailEvent, HailSearchResult } from '../services/hailMapsApi';

interface HailHistoryPanelProps {
  onOpenChat?: () => void;
}

interface DisplayEvent {
  id: string;
  date: string;
  type: 'hail' | 'wind' | 'tornado';
  magnitude: number | null;
  unit: string;
  severity: 'minor' | 'moderate' | 'severe';
  source: string;
  dataSource: 'IHM' | 'NOAA' | 'Visual Crossing';
  certified: boolean;
  narrative?: string;
  location?: string;
}

const formatDate = (value: string) => {
  if (!value) return 'Unknown date';
  // Parse as local date to avoid timezone shift
  // Input format is typically "YYYY-MM-DD" or "MM/DD/YYYY"
  const parts = value.includes('-')
    ? value.split('T')[0].split('-')
    : value.split('/');

  if (parts.length >= 3) {
    // Handle YYYY-MM-DD format
    if (value.includes('-') && parts[0].length === 4) {
      const [year, month, day] = parts.map(Number);
      return new Date(year, month - 1, day).toLocaleDateString();
    }
    // Handle MM/DD/YYYY format
    const [month, day, year] = parts.map(Number);
    return new Date(year, month - 1, day).toLocaleDateString();
  }

  return value;
};

const inferSeverity = (eventType: string, magnitude: number | null): 'minor' | 'moderate' | 'severe' => {
  if (eventType === 'tornado') return 'severe';
  if (eventType === 'wind' && magnitude) {
    if (magnitude >= 75) return 'severe';
    if (magnitude >= 58) return 'moderate';
    return 'minor';
  }
  if (eventType === 'hail' && magnitude) {
    if (magnitude >= 2) return 'severe';
    if (magnitude >= 1) return 'moderate';
    return 'minor';
  }
  return 'moderate';
};

const mergeAllEvents = (results: HailSearchResult): DisplayEvent[] => {
  const events: DisplayEvent[] = [];

  // IHM events
  results.events?.forEach(e => {
    events.push({
      id: e.id,
      date: e.date,
      type: 'hail',
      magnitude: e.hailSize,
      unit: 'inches',
      severity: e.severity,
      source: e.source || 'IHM',
      dataSource: 'IHM',
      certified: false
    });
  });

  // NOAA events
  results.noaaEvents?.forEach(e => {
    events.push({
      id: e.id,
      date: e.date,
      type: e.eventType,
      magnitude: e.magnitude,
      unit: e.magnitudeUnit,
      severity: inferSeverity(e.eventType, e.magnitude),
      source: e.source,
      dataSource: 'NOAA',
      certified: true,
      narrative: e.narrative,
      location: e.location
    });
  });

  // Sort: IHM first, then NOAA, then by date descending within each group
  return events.sort((a, b) => {
    // IHM always comes first
    if (a.dataSource === 'IHM' && b.dataSource !== 'IHM') return -1;
    if (b.dataSource === 'IHM' && a.dataSource !== 'IHM') return 1;
    // Within same source, sort by date descending
    const dateA = a.date.includes('-')
      ? a.date.split('T')[0].split('-').map(Number)
      : a.date.split('/').map(Number);
    const dateB = b.date.includes('-')
      ? b.date.split('T')[0].split('-').map(Number)
      : b.date.split('/').map(Number);
    // Compare as YYYYMMDD integers
    const numA = a.date.includes('-')
      ? dateA[0] * 10000 + dateA[1] * 100 + dateA[2]
      : dateA[2] * 10000 + dateA[0] * 100 + dateA[1];
    const numB = b.date.includes('-')
      ? dateB[0] * 10000 + dateB[1] * 100 + dateB[2]
      : dateB[2] * 10000 + dateB[0] * 100 + dateB[1];
    return numB - numA;
  });
};

const buildHailSummary = (address: string, months: number, events: HailEvent[]) => {
  const lines = events.map(event => {
    const hailSize = event.hailSize !== null ? `${event.hailSize}"` : 'unknown size';
    const wind = event.windSpeed ? `, wind ${event.windSpeed} mph` : '';
    return `- ${formatDate(event.date)}: hail ${hailSize}${wind} (${event.severity})`;
  });
  return [
    `Hail History for ${address} (last ${months} months):`,
    ...lines
  ].join('\n');
};

const HailHistoryPanel: React.FC<HailHistoryPanelProps> = ({ onOpenChat }) => {
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [zip, setZip] = useState('');
  const [months, setMonths] = useState(24);
  const [results, setResults] = useState<HailSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    hailMapsApi.getStatus()
      .then(status => {
        setConfigured(status.configured);
        setStatusMessage(null);
      })
      .catch(() => {
        setConfigured(null);
        setStatusMessage('Hail Maps status endpoint unavailable. You can still try a search.');
      });
  }, []);

  const handleSearch = async () => {
    if (!street.trim() || !city.trim() || !stateCode.trim() || !zip.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const data = await hailMapsApi.searchByAddress(
        {
          street: street.trim(),
          city: city.trim(),
          state: stateCode.trim(),
          zip: zip.trim()
        },
        months
      );
      setResults(data);
    } catch (err) {
      setError((err as Error).message || 'Failed to fetch hail history');
    } finally {
      setLoading(false);
    }
  };

  const fullAddress = useMemo(() => {
    if (!street || !city || !stateCode || !zip) return '';
    return `${street.trim()}, ${city.trim()}, ${stateCode.trim()} ${zip.trim()}`;
  }, [street, city, stateCode, zip]);

  const hailSummary = useMemo(() => {
    if (!results?.events?.length || !fullAddress) return '';
    return buildHailSummary(fullAddress, months, results.events);
  }, [fullAddress, months, results]);

  const generateReport = () => {
    if (!results || !fullAddress) return '';

    const allEvents = mergeAllEvents(results);
    const reportDate = new Date().toLocaleDateString();

    let report = `
WEATHER HISTORY REPORT
Generated: ${reportDate}
Property: ${fullAddress}
Period: Last ${months} months

═══════════════════════════════════════════════════════════════

SUMMARY
Total Events Found: ${allEvents.length}
- Hail Events: ${allEvents.filter(e => e.type === 'hail').length}
- Wind Events: ${allEvents.filter(e => e.type === 'wind').length}
- Tornado Events: ${allEvents.filter(e => e.type === 'tornado').length}

═══════════════════════════════════════════════════════════════

CERTIFIED NOAA DATA (Official US Government Source)
Source: NOAA National Weather Service Storm Events Database
Verification: https://www.ncei.noaa.gov/stormevents/

${allEvents.filter(e => e.dataSource === 'NOAA').map(e => `
Date: ${formatDate(e.date)}
Type: ${e.type.toUpperCase()}
Magnitude: ${e.magnitude ?? 'N/A'} ${e.unit}
Severity: ${e.severity.toUpperCase()}
Reported By: ${e.source}
${e.location ? `Location: ${e.location}` : ''}
${e.narrative ? `Details: ${e.narrative}` : ''}
---`).join('\n')}

═══════════════════════════════════════════════════════════════

INTERACTIVE HAIL MAPS DATA
Source: Interactive Hail Maps (Enterprise)

${allEvents.filter(e => e.dataSource === 'IHM').map(e => `
Date: ${formatDate(e.date)}
Hail Size: ${e.magnitude ?? 'N/A'}"
Severity: ${e.severity.toUpperCase()}
---`).join('\n')}

═══════════════════════════════════════════════════════════════

This report contains data from official government sources (NOAA)
and commercial weather services (Interactive Hail Maps).

NOAA data is certified and legally defensible for insurance claims.
`;

    return report;
  };

  const handleDownloadReport = () => {
    const report = generateReport();
    if (!report) return;

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weather-report-${fullAddress.replace(/[^a-z0-9]/gi, '-')}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrintReport = () => {
    const report = generateReport();
    if (!report) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Weather History Report - ${fullAddress}</title>
          <style>
            body { font-family: 'Courier New', monospace; padding: 20px; white-space: pre-wrap; }
            @media print { body { font-size: 11px; } }
          </style>
        </head>
        <body>${report}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleGenerateEmail = () => {
    if (!hailSummary) return;
    localStorage.setItem('susan_hail_context', hailSummary);
    localStorage.setItem('chat_quick_hail', JSON.stringify({
      address: fullAddress,
      months,
      summary: hailSummary
    }));
    onOpenChat?.();
  };

  const severityStyle = (severity: string) => {
    if (severity === 'severe') return { color: '#fecaca', background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.4)' };
    if (severity === 'moderate') return { color: '#fed7aa', background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.4)' };
    return { color: '#fde68a', background: 'rgba(253,224,71,0.15)', border: '1px solid rgba(253,224,71,0.35)' };
  };

  return (
    <div style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid rgba(220,38,38,0.4)', background: 'linear-gradient(135deg, rgba(36,10,10,0.85) 0%, rgba(12,12,12,0.6) 100%)', boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.85rem' }}>
        <Cloud style={{ width: '18px', height: '18px', color: 'var(--roof-red)' }} />
        <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Hail History</div>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
          Enterprise IHM
        </span>
      </div>

      {configured === false && (
        <div style={{ marginBottom: '0.75rem', padding: '0.65rem 0.75rem', borderRadius: '10px', border: '1px solid rgba(251,191,36,0.35)', background: 'rgba(251,191,36,0.1)' }}>
          <div style={{ color: '#fde68a', fontWeight: 600, fontSize: '0.85rem' }}>Hail Maps not configured</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            Set IHM_API_KEY and IHM_API_SECRET in Railway to enable hail history.
          </div>
        </div>
      )}

      {statusMessage && (
        <div style={{ marginBottom: '0.75rem', padding: '0.65rem 0.75rem', borderRadius: '10px', border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(148,163,184,0.1)' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{statusMessage}</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          placeholder="Street address"
          style={{
            flex: 1,
            minWidth: '220px',
            padding: '0.6rem 0.75rem',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)'
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City"
          style={{
            minWidth: '160px',
            padding: '0.6rem 0.75rem',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)'
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <input
          value={stateCode}
          onChange={(e) => setStateCode(e.target.value.toUpperCase())}
          placeholder="State"
          maxLength={2}
          style={{
            minWidth: '80px',
            padding: '0.6rem 0.75rem',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            textTransform: 'uppercase'
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <input
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          placeholder="ZIP"
          style={{
            minWidth: '90px',
            padding: '0.6rem 0.75rem',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)'
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <select
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          style={{
            padding: '0.6rem 0.75rem',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)'
          }}
        >
          <option value={12}>12 months</option>
          <option value={24}>24 months</option>
          <option value={36}>36 months</option>
        </select>
        <button
          onClick={handleSearch}
          disabled={loading || !street.trim() || !city.trim() || !stateCode.trim() || !zip.trim()}
          style={{
            padding: '0.6rem 0.9rem',
            borderRadius: '8px',
            border: 'none',
            background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
            color: 'white',
            cursor: loading || !street.trim() || !city.trim() || !stateCode.trim() || !zip.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !street.trim() || !city.trim() || !stateCode.trim() || !zip.trim() ? 0.6 : 1
          }}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {error && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.65rem 0.75rem',
            borderRadius: '10px',
            border: '1px solid rgba(248,113,113,0.45)',
            background: 'rgba(248,113,113,0.12)',
            color: '#fecaca',
            fontSize: '0.85rem'
          }}
        >
          {error.includes('API route not found')
            ? 'Hail history API not reachable. Please redeploy the latest backend build.'
            : error}
        </div>
      )}

      {results && (
        <div style={{ marginTop: '0.9rem' }}>
          {/* Summary counts by source */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 600 }}>Total: {mergeAllEvents(results).length}</span>
            </div>
            {results.noaaEvents && results.noaaEvents.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(34,197,94,0.15)', color: '#86efac' }}>
                <Database style={{ width: '12px', height: '12px' }} />
                NOAA Certified: {results.noaaEvents.length}
              </div>
            )}
            {results.events && results.events.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(59,130,246,0.15)', color: '#93c5fd' }}>
                IHM: {results.events.length}
              </div>
            )}
          </div>

          {mergeAllEvents(results).length === 0 ? (
            <div style={{ padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.12)', color: '#bbf7d0' }}>
              No weather events reported for this address in the selected period.
            </div>
          ) : (
            <>
              {/* Event list with source badges */}
              <div style={{ display: 'grid', gap: '0.6rem', maxHeight: '400px', overflowY: 'auto' }}>
                {mergeAllEvents(results).map(event => (
                  <div key={event.id} style={{
                    padding: '0.65rem 0.75rem',
                    borderRadius: '10px',
                    border: event.certified ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.08)',
                    background: event.certified ? 'rgba(34,197,94,0.08)' : 'rgba(12,12,12,0.45)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {/* Event type icon */}
                        {event.type === 'tornado' ? (
                          <Tornado style={{ width: '14px', height: '14px', color: '#f87171' }} />
                        ) : event.type === 'wind' ? (
                          <Wind style={{ width: '14px', height: '14px', color: '#60a5fa' }} />
                        ) : (
                          <Cloud style={{ width: '14px', height: '14px', color: '#fbbf24' }} />
                        )}

                        {/* Severity badge */}
                        <span style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '999px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          ...severityStyle(event.severity)
                        }}>
                          {event.severity.toUpperCase()}
                        </span>

                        {/* Date */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                          <Calendar style={{ width: '14px', height: '14px' }} />
                          {formatDate(event.date)}
                        </div>

                        {/* Data source badge */}
                        <span style={{
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px',
                          fontSize: '0.65rem',
                          fontWeight: 500,
                          background: event.dataSource === 'NOAA' ? 'rgba(34,197,94,0.2)' : 'rgba(59,130,246,0.2)',
                          color: event.dataSource === 'NOAA' ? '#86efac' : '#93c5fd',
                          border: event.dataSource === 'NOAA' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(59,130,246,0.3)'
                        }}>
                          {event.dataSource === 'NOAA' ? '✓ NOAA Certified' : 'IHM'}
                        </span>
                      </div>
                    </div>

                    {/* Event details */}
                    <div style={{ marginTop: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      {event.type === 'hail' && `Hail size: ${event.magnitude !== null ? `${event.magnitude}"` : 'unknown'}`}
                      {event.type === 'wind' && `Wind: ${event.magnitude !== null ? `${event.magnitude} ${event.unit}` : 'unknown'}`}
                      {event.type === 'tornado' && 'Tornado reported'}
                      {event.source && <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>• {event.source}</span>}
                    </div>

                    {/* Narrative for NOAA events */}
                    {event.narrative && (
                      <div style={{ marginTop: '0.3rem', fontSize: '0.75rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                        {event.narrative.slice(0, 150)}{event.narrative.length > 150 ? '...' : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
                <button
                  onClick={handleGenerateEmail}
                  disabled={mergeAllEvents(results).length === 0}
                  style={{
                    padding: '0.6rem 0.9rem',
                    borderRadius: '10px',
                    border: '1px solid rgba(59,130,246,0.5)',
                    background: 'rgba(59,130,246,0.12)',
                    color: '#bfdbfe',
                    cursor: mergeAllEvents(results).length === 0 ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontWeight: 600,
                    opacity: mergeAllEvents(results).length === 0 ? 0.5 : 1
                  }}
                >
                  <Mail style={{ width: '16px', height: '16px' }} />
                  Generate Adjuster Email
                </button>

                <button
                  onClick={handleDownloadReport}
                  disabled={mergeAllEvents(results).length === 0}
                  style={{
                    padding: '0.6rem 0.9rem',
                    borderRadius: '10px',
                    border: '1px solid rgba(34,197,94,0.5)',
                    background: 'rgba(34,197,94,0.12)',
                    color: '#bbf7d0',
                    cursor: mergeAllEvents(results).length === 0 ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontWeight: 600,
                    opacity: mergeAllEvents(results).length === 0 ? 0.5 : 1
                  }}
                >
                  <Download style={{ width: '16px', height: '16px' }} />
                  Download Report
                </button>

                <button
                  onClick={handlePrintReport}
                  disabled={mergeAllEvents(results).length === 0}
                  style={{
                    padding: '0.6rem 0.9rem',
                    borderRadius: '10px',
                    border: '1px solid rgba(148,163,184,0.5)',
                    background: 'rgba(148,163,184,0.12)',
                    color: '#cbd5e1',
                    cursor: mergeAllEvents(results).length === 0 ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontWeight: 600,
                    opacity: mergeAllEvents(results).length === 0 ? 0.5 : 1
                  }}
                >
                  <Printer style={{ width: '16px', height: '16px' }} />
                  Print Report
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default HailHistoryPanel;
