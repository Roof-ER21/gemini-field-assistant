import React, { useState, useCallback } from 'react';
import { ImageOverlay } from 'react-leaflet';
import { LatLngBounds } from 'leaflet';
import { getApiBaseUrl } from '../services/config';
import { Cloud, X, Loader2 } from 'lucide-react';

interface HistoricalNexradOverlayProps {
  visible: boolean;
  onToggle: () => void;
  stormDates: string[]; // Available storm dates from current search results
  mapCenter: { lat: number; lng: number };
}

interface RadarData {
  imageBase64: string;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  timestamp: string;
}

export default function HistoricalNexradOverlay({
  visible,
  onToggle,
  stormDates,
  mapCenter
}: HistoricalNexradOverlayProps) {
  const [radarData, setRadarData] = useState<RadarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [opacity, setOpacity] = useState(0.6);

  const fetchRadar = useCallback(async (datetime: string) => {
    if (!datetime || !mapCenter.lat || !mapCenter.lng) return;

    setLoading(true);
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(
        `${apiBase}/hail/nexrad-meta?lat=${mapCenter.lat}&lng=${mapCenter.lng}&datetime=${encodeURIComponent(datetime)}&zoom=50`
      );
      const data = await res.json();

      if (data.available) {
        setRadarData({
          imageBase64: data.imageBase64,
          bbox: data.bbox,
          timestamp: data.timestamp
        });
      } else {
        setRadarData(null);
      }
    } catch (err) {
      console.error('NEXRAD fetch error:', err);
      setRadarData(null);
    } finally {
      setLoading(false);
    }
  }, [mapCenter]);

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    // Normalize date string for the API — add noon if date-only
    const datetime = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T17:00:00Z` : date;
    fetchRadar(datetime);
  };

  const formatDate = (dateStr: string) => {
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr + 'T12:00:00' : dateStr;
    return new Date(normalized).toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  // Deduplicate dates (just calendar day)
  const uniqueDates = [...new Set(stormDates.map(d => d.split('T')[0]))].sort().reverse();

  if (!visible) return null;

  return (
    <>
      {/* Radar image overlay on map */}
      {radarData && (
        <ImageOverlay
          url={radarData.imageBase64}
          bounds={new LatLngBounds(
            [radarData.bbox[1], radarData.bbox[0]], // SW: [minLat, minLng]
            [radarData.bbox[3], radarData.bbox[2]]  // NE: [maxLat, maxLng]
          )}
          opacity={opacity}
          zIndex={400}
        />
      )}

      {/* Control panel (positioned on map) */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '60px',
        zIndex: 1000,
        background: 'rgba(15, 15, 30, 0.92)',
        backdropFilter: 'blur(8px)',
        borderRadius: '10px',
        padding: '12px 14px',
        color: 'white',
        fontSize: '12px',
        minWidth: '220px',
        maxWidth: '280px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '13px' }}>
            <Cloud className="w-4 h-4" style={{ color: '#60a5fa' }} />
            Historical Radar
          </div>
          <button onClick={onToggle} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: '2px' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {uniqueDates.length === 0 ? (
          <div style={{ color: '#888', fontSize: '11px' }}>Search for storms first to load radar</div>
        ) : (
          <>
            <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '6px' }}>Select storm date:</div>
            <div style={{ maxHeight: '120px', overflow: 'auto', marginBottom: '8px' }}>
              {uniqueDates.slice(0, 10).map(date => (
                <button
                  key={date}
                  onClick={() => handleDateSelect(date)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '5px 8px',
                    marginBottom: '2px',
                    borderRadius: '4px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: selectedDate === date ? 700 : 400,
                    background: selectedDate === date ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.05)',
                    color: selectedDate === date ? '#60a5fa' : '#ccc',
                    transition: 'all 0.15s'
                  }}
                >
                  {formatDate(date)}
                </button>
              ))}
            </div>
          </>
        )}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#60a5fa', fontSize: '11px' }}>
            <Loader2 className="w-3 h-3" style={{ animation: 'spin 1s linear infinite' }} />
            Loading radar...
          </div>
        )}

        {radarData && !loading && (
          <div>
            <div style={{ fontSize: '10px', color: '#888', marginBottom: '6px' }}>
              NEXRAD WSR-88D | {formatDate(radarData.timestamp)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', color: '#888' }}>Opacity</span>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                style={{ flex: 1, height: '4px', accentColor: '#60a5fa' }}
              />
              <span style={{ fontSize: '10px', color: '#aaa', minWidth: '28px' }}>{Math.round(opacity * 100)}%</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
