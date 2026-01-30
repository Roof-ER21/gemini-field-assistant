import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Rectangle, CircleMarker, Popup, useMap } from 'react-leaflet';
import { LatLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getApiBaseUrl } from '../services/config';
import { Cloud, Calendar, MapPin, AlertTriangle, Filter, RefreshCw } from 'lucide-react';

interface Territory {
  id: string;
  name: string;
  description: string;
  color: string;
  north_lat: number;
  south_lat: number;
  east_lng: number;
  west_lng: number;
  center_lat: number;
  center_lng: number;
}

interface HailEvent {
  id: string;
  date: string;
  latitude: number;
  longitude: number;
  hailSize: number | null;
  severity: 'minor' | 'moderate' | 'severe';
  source: string;
}

interface NOAAEvent {
  id: string;
  date: string;
  latitude: number;
  longitude: number;
  magnitude: number | null;
  eventType: 'hail' | 'wind' | 'tornado';
  location: string;
}

// Component to handle map bounds changes
function MapController({ selectedTerritory }: { selectedTerritory: Territory | null }) {
  const map = useMap();

  useEffect(() => {
    if (selectedTerritory) {
      const bounds = new LatLngBounds(
        [selectedTerritory.south_lat, selectedTerritory.west_lng],
        [selectedTerritory.north_lat, selectedTerritory.east_lng]
      );
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [selectedTerritory, map]);

  return null;
}

export default function TerritoryHailMap() {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [selectedTerritory, setSelectedTerritory] = useState<Territory | null>(null);
  const [hailEvents, setHailEvents] = useState<HailEvent[]>([]);
  const [noaaEvents, setNoaaEvents] = useState<NOAAEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [months, setMonths] = useState(24);
  const [error, setError] = useState<string | null>(null);

  // Fetch territories on mount
  useEffect(() => {
    fetchTerritories();
  }, []);

  const fetchTerritories = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/territories`);
      if (res.ok) {
        const data = await res.json();
        setTerritories(data.territories || []);
      }
    } catch (err) {
      console.error('Failed to fetch territories:', err);
    }
  };

  const fetchHailData = useCallback(async (territory: Territory) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${getApiBaseUrl()}/hail/search?lat=${territory.center_lat}&lng=${territory.center_lng}&months=${months}&radius=50`
      );
      if (res.ok) {
        const data = await res.json();
        setHailEvents(data.events || []);
        setNoaaEvents(data.noaaEvents || []);
      } else {
        setError('Failed to load hail data');
      }
    } catch (err) {
      console.error('Failed to fetch hail data:', err);
      setError('Network error loading hail data');
    } finally {
      setLoading(false);
    }
  }, [months]);

  const handleTerritoryClick = (territory: Territory) => {
    setSelectedTerritory(territory);
    fetchHailData(territory);
  };

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'severe': return '#ef4444'; // red
      case 'moderate': return '#f97316'; // orange
      case 'minor': return '#eab308'; // yellow
      default: return '#6b7280'; // gray
    }
  };

  const getEventTypeColor = (type: string): string => {
    switch (type) {
      case 'hail': return '#3b82f6'; // blue
      case 'wind': return '#8b5cf6'; // purple
      case 'tornado': return '#ef4444'; // red
      default: return '#6b7280';
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Default center: Mid-Atlantic region
  const defaultCenter: [number, number] = [39.5, -77.5];
  const defaultZoom = 6;

  return (
    <div className="roof-er-content-area" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="roof-er-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-default)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Cloud className="w-6 h-6" style={{ color: 'var(--roof-red)' }} />
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Storm Map
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
              Territory hail history from IHM & NOAA
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{
        padding: '12px 20px',
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        {/* Territory Selector */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {territories.map(t => (
            <button
              key={t.id}
              onClick={() => handleTerritoryClick(t)}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: selectedTerritory?.id === t.id ? `2px solid ${t.color}` : '1px solid var(--border-default)',
                background: selectedTerritory?.id === t.id ? t.color : 'var(--bg-primary)',
                color: selectedTerritory?.id === t.id ? 'white' : 'var(--text-primary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {t.name}
            </button>
          ))}
        </div>

        {/* Month Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          <Filter className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          <select
            value={months}
            onChange={(e) => {
              setMonths(Number(e.target.value));
              if (selectedTerritory) {
                fetchHailData(selectedTerritory);
              }
            }}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '13px'
            }}
          >
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
            <option value={24}>Last 24 months</option>
            <option value={36}>Last 36 months</option>
          </select>
        </div>
      </div>

      {/* Map Container */}
      <div style={{ flex: 1, position: 'relative' }}>
        {loading && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1000,
            background: 'var(--bg-elevated)',
            padding: '16px 24px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }}>
            <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'var(--roof-red)' }} />
            <span style={{ color: 'var(--text-primary)' }}>Loading storm data...</span>
          </div>
        )}

        {error && (
          <div style={{
            position: 'absolute',
            top: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: '#7f1d1d',
            padding: '12px 20px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertTriangle className="w-4 h-4" style={{ color: '#fca5a5' }} />
            <span style={{ color: '#fca5a5', fontSize: '13px' }}>{error}</span>
          </div>
        )}

        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapController selectedTerritory={selectedTerritory} />

          {/* Territory Rectangles */}
          {territories.map(t => (
            <Rectangle
              key={t.id}
              bounds={[
                [t.south_lat, t.west_lng],
                [t.north_lat, t.east_lng]
              ]}
              pathOptions={{
                color: t.color,
                weight: selectedTerritory?.id === t.id ? 3 : 2,
                fillOpacity: selectedTerritory?.id === t.id ? 0.2 : 0.1,
                dashArray: selectedTerritory?.id === t.id ? undefined : '5, 5'
              }}
              eventHandlers={{
                click: () => handleTerritoryClick(t)
              }}
            >
              <Popup>
                <div style={{ minWidth: '150px' }}>
                  <strong style={{ fontSize: '14px' }}>{t.name}</strong>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#666' }}>
                    {t.description}
                  </p>
                  <button
                    onClick={() => handleTerritoryClick(t)}
                    style={{
                      marginTop: '8px',
                      padding: '6px 12px',
                      background: t.color,
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      width: '100%'
                    }}
                  >
                    View Storm History
                  </button>
                </div>
              </Popup>
            </Rectangle>
          ))}

          {/* IHM Hail Event Markers */}
          {hailEvents.map((event, idx) => (
            <CircleMarker
              key={`ihm-${event.id || idx}`}
              center={[event.latitude, event.longitude]}
              radius={8 + (event.hailSize || 0) * 3}
              pathOptions={{
                color: getSeverityColor(event.severity),
                fillColor: getSeverityColor(event.severity),
                fillOpacity: 0.7,
                weight: 2
              }}
            >
              <Popup>
                <div style={{ minWidth: '160px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Calendar className="w-4 h-4" style={{ color: '#666' }} />
                    <strong>{formatDate(event.date)}</strong>
                  </div>
                  <div style={{ fontSize: '13px', color: '#333' }}>
                    <p style={{ margin: '4px 0' }}>
                      <span style={{ fontWeight: 600 }}>Hail Size:</span> {event.hailSize ? `${event.hailSize}"` : 'Unknown'}
                    </p>
                    <p style={{ margin: '4px 0' }}>
                      <span style={{ fontWeight: 600 }}>Severity:</span>{' '}
                      <span style={{
                        color: getSeverityColor(event.severity),
                        fontWeight: 600,
                        textTransform: 'capitalize'
                      }}>
                        {event.severity}
                      </span>
                    </p>
                    <p style={{ margin: '4px 0', fontSize: '11px', color: '#666' }}>
                      Source: {event.source}
                    </p>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {/* NOAA Event Markers */}
          {noaaEvents.map((event, idx) => (
            <CircleMarker
              key={`noaa-${event.id || idx}`}
              center={[event.latitude, event.longitude]}
              radius={6}
              pathOptions={{
                color: getEventTypeColor(event.eventType),
                fillColor: getEventTypeColor(event.eventType),
                fillOpacity: 0.6,
                weight: 2
              }}
            >
              <Popup>
                <div style={{ minWidth: '160px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Calendar className="w-4 h-4" style={{ color: '#666' }} />
                    <strong>{formatDate(event.date)}</strong>
                  </div>
                  <div style={{ fontSize: '13px', color: '#333' }}>
                    <p style={{ margin: '4px 0' }}>
                      <span style={{ fontWeight: 600 }}>Type:</span>{' '}
                      <span style={{ textTransform: 'capitalize' }}>{event.eventType}</span>
                    </p>
                    {event.magnitude && (
                      <p style={{ margin: '4px 0' }}>
                        <span style={{ fontWeight: 600 }}>Magnitude:</span> {event.magnitude}
                        {event.eventType === 'hail' ? '"' : ' knots'}
                      </p>
                    )}
                    <p style={{ margin: '4px 0', fontSize: '11px', color: '#666' }}>
                      {event.location}
                    </p>
                    <p style={{ margin: '4px 0', fontSize: '11px', color: '#0066cc' }}>
                      Source: NOAA (Official)
                    </p>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {/* Legend */}
      <div style={{
        padding: '12px 20px',
        background: 'var(--bg-elevated)',
        borderTop: '1px solid var(--border-default)',
        display: 'flex',
        gap: '20px',
        flexWrap: 'wrap',
        fontSize: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>IHM Severity:</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }}></span>
            Severe
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f97316' }}></span>
            Moderate
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#eab308' }}></span>
            Minor
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>NOAA:</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6' }}></span>
            Hail
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#8b5cf6' }}></span>
            Wind
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }}></span>
            Tornado
          </span>
        </div>
        {selectedTerritory && (
          <div style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }}>
            <MapPin className="w-4 h-4" style={{ display: 'inline', marginRight: '4px' }} />
            {hailEvents.length} IHM events, {noaaEvents.length} NOAA events
          </div>
        )}
      </div>
    </div>
  );
}
