import React, { useEffect, useMemo, useState } from 'react';
import { Cloud, AlertTriangle, Calendar, Wind, Mail } from 'lucide-react';
import { hailMapsApi, HailEvent, HailSearchResult } from '../services/hailMapsApi';

interface HailHistoryPanelProps {
  onOpenChat?: () => void;
}

const formatDate = (value: string) => {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
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
    <div style={{ padding: '1rem', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(12,12,12,0.5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
        <Cloud style={{ width: '18px', height: '18px', color: 'var(--roof-red)' }} />
        <div style={{ fontWeight: 600 }}>Hail History</div>
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
        <div style={{ marginTop: '0.75rem', color: '#fecaca', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {results && (
        <div style={{ marginTop: '0.9rem' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.6rem' }}>
            Found {results.totalCount} hail events
          </div>

          {results.events.length === 0 ? (
            <div style={{ padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.12)', color: '#bbf7d0' }}>
              No hail events reported for this address in the selected period.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.6rem' }}>
              {results.events.map(event => (
                <div key={event.id} style={{ padding: '0.65rem 0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(12,12,12,0.45)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '999px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        ...severityStyle(event.severity)
                      }}>
                        {event.severity.toUpperCase()}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        <Calendar style={{ width: '14px', height: '14px' }} />
                        {formatDate(event.date)}
                      </div>
                    </div>
                    <AlertTriangle style={{ width: '16px', height: '16px', color: 'var(--text-tertiary)' }} />
                  </div>
                  <div style={{ marginTop: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    Hail size: {event.hailSize !== null ? `${event.hailSize}"` : 'unknown'}
                    {event.windSpeed ? (
                      <span style={{ marginLeft: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Wind style={{ width: '12px', height: '12px' }} />
                        {event.windSpeed} mph
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleGenerateEmail}
            disabled={!hailSummary}
            style={{
              marginTop: '0.85rem',
              padding: '0.6rem 0.9rem',
              borderRadius: '10px',
              border: '1px solid rgba(59,130,246,0.5)',
              background: 'rgba(59,130,246,0.12)',
              color: '#bfdbfe',
              cursor: hailSummary ? 'pointer' : 'not-allowed',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontWeight: 600
            }}
          >
            <Mail style={{ width: '16px', height: '16px' }} />
            Generate Adjuster Email
          </button>
        </div>
      )}
    </div>
  );
};

export default HailHistoryPanel;
