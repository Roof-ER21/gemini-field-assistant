/**
 * LiveMrmsPolygonLayer — renders the ~5-min latency MRMS MESH 60-min max
 * polygons for the current viewport. Auto-refreshes every 2 minutes so the
 * map always reflects the latest radar.
 *
 * This is the "is hail falling RIGHT NOW in my territory?" layer — pairs
 * with territory push alerts for the full now-cast experience.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GeoJSON, Popup, useMap, useMapEvents } from 'react-leaflet';
import type { Layer, LeafletMouseEvent } from 'leaflet';
import { getApiBaseUrl } from '../services/config';

interface SwathProperties {
  level: number;
  sizeInches: number;
  sizeMm: number;
  label: string;
  color: string;
  severity: string;
}

interface SwathFeature {
  type: 'Feature';
  properties: SwathProperties;
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] };
}

interface LiveSwathCollection {
  type: 'FeatureCollection';
  features: SwathFeature[];
  metadata: {
    date: string;
    refTime: string;
    maxMeshInches: number;
    hailCells: number;
    bounds: { north: number; south: number; east: number; west: number };
    sourceFiles: string[];
    generatedAt: string;
  };
  live: true;
  product: 'mesh60' | 'mesh1440';
  refTime: string;
}

interface LiveMrmsPolygonLayerProps {
  visible: boolean;
  product?: 'mesh60' | 'mesh1440';
  opacity?: number;
  /** Auto-refresh cadence. Default 120s (matches upstream cadence). */
  refreshMs?: number;
  onDataLoaded?: (result: {
    hasFeatures: boolean;
    maxInches: number;
    refTime: string;
  }) => void;
}

const apiBaseUrl = getApiBaseUrl();

export default function LiveMrmsPolygonLayer({
  visible,
  product = 'mesh60',
  opacity = 0.6,
  refreshMs = 120000,
  onDataLoaded,
}: LiveMrmsPolygonLayerProps) {
  const map = useMap();
  const [data, setData] = useState<LiveSwathCollection | null>(null);
  const [loading, setLoading] = useState(false);
  const [clickInfo, setClickInfo] = useState<{ lat: number; lng: number; props: SwathProperties } | null>(null);
  const [viewportKey, setViewportKey] = useState(0);
  const lastFetchedBoundsRef = useRef<string>('');

  useMapEvents({
    moveend: () => setViewportKey((k) => k + 1),
    zoomend: () => setViewportKey((k) => k + 1),
  });

  const fetchPolygons = useCallback(async () => {
    if (!map) return;
    const mapBounds = map.getBounds();
    const boundsKey = [
      mapBounds.getNorth().toFixed(2),
      mapBounds.getSouth().toFixed(2),
      mapBounds.getEast().toFixed(2),
      mapBounds.getWest().toFixed(2),
    ].join(',');
    lastFetchedBoundsRef.current = boundsKey;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        north: String(mapBounds.getNorth()),
        south: String(mapBounds.getSouth()),
        east: String(mapBounds.getEast()),
        west: String(mapBounds.getWest()),
        product,
      });
      const res = await fetch(`${apiBaseUrl}/hail/mrms-now-polygons?${params}`, {
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const json: LiveSwathCollection = await res.json();

      // Stale-check: if viewport changed during fetch, the layer's next cycle
      // will refresh anyway — bail to avoid rendering stale bounds.
      if (lastFetchedBoundsRef.current !== boundsKey) return;

      setData(json);
      onDataLoaded?.({
        hasFeatures: json.features.length > 0,
        maxInches: json.metadata.maxMeshInches,
        refTime: json.refTime,
      });
    } catch (err) {
      console.error('[LiveMRMS] Fetch failed:', err);
      onDataLoaded?.({ hasFeatures: false, maxInches: 0, refTime: '' });
    } finally {
      setLoading(false);
    }
  }, [map, product, onDataLoaded]);

  // Fetch on visibility change, product change, viewport change.
  useEffect(() => {
    if (!visible || !map) {
      setData(null);
      return;
    }
    fetchPolygons();
  }, [visible, product, viewportKey, map, fetchPolygons]);

  // Auto-refresh loop.
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      void fetchPolygons();
    }, refreshMs);
    return () => clearInterval(id);
  }, [visible, refreshMs, fetchPolygons]);

  if (!visible || !data || data.features.length === 0) {
    return (
      <>
        {visible && loading && (
          <div style={styles.loadingBadge}>📡 Checking live radar…</div>
        )}
        {visible && data && data.features.length === 0 && (
          <div style={styles.noHailBadge}>
            📡 No active hail on radar (last {product === 'mesh60' ? '60 min' : '24 h'})
          </div>
        )}
      </>
    );
  }

  const styleFeature = (feature: any) => {
    const props = feature.properties as SwathProperties;
    return {
      fillColor: props.color,
      fillOpacity: opacity,
      color: props.color,
      weight: 1,
      opacity: Math.min(1, opacity + 0.2),
    };
  };

  const onEachFeature = (feature: any, layer: Layer) => {
    const props = feature.properties as SwathProperties;
    layer.on('click', (e: LeafletMouseEvent) => {
      setClickInfo({ lat: e.latlng.lat, lng: e.latlng.lng, props });
    });
  };

  return (
    <>
      {data.features.map((feature, index) => (
        <GeoJSON
          key={`live-${product}-${index}-${data.refTime}`}
          data={feature as any}
          style={() => styleFeature(feature)}
          onEachFeature={onEachFeature}
        />
      ))}
      {clickInfo && (
        <Popup
          position={[clickInfo.lat, clickInfo.lng]}
          eventHandlers={{ remove: () => setClickInfo(null) }}
        >
          <div style={{ minWidth: 180, fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: clickInfo.props.color, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 10, height: 10, borderRadius: 2,
                backgroundColor: clickInfo.props.color,
                display: 'inline-block',
              }} />
              Live {clickInfo.props.label} Hail
            </div>
            <div style={{ fontSize: 11, color: '#555', lineHeight: 1.5 }}>
              <div><strong>Detected:</strong> within last {product === 'mesh60' ? '60 min' : '24 h'}</div>
              <div><strong>Severity:</strong> {clickInfo.props.severity.replace('_', ' ')}</div>
              <div><strong>Radar ref:</strong> {formatRefTime(data.refTime)}</div>
            </div>
          </div>
        </Popup>
      )}
      <div style={styles.liveBadge}>
        <span style={styles.liveDot} />
        LIVE • max {data.metadata.maxMeshInches.toFixed(2)}" • {formatRefTime(data.refTime)}
      </div>
    </>
  );
}

function formatRefTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = Date.now();
  const ageMin = Math.max(0, Math.round((now - d.getTime()) / 60000));
  if (ageMin === 0) return 'just now';
  if (ageMin === 1) return '1 min ago';
  if (ageMin < 60) return `${ageMin} min ago`;
  return `${Math.round(ageMin / 60)}h ago`;
}

const styles: Record<string, React.CSSProperties> = {
  liveBadge: {
    position: 'absolute',
    bottom: 18,
    left: 18,
    zIndex: 1000,
    padding: '6px 10px',
    borderRadius: 999,
    background: 'rgba(220,38,38,0.92)',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#fff',
    boxShadow: '0 0 0 4px rgba(255,255,255,0.35)',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  loadingBadge: {
    position: 'absolute',
    top: 60,
    left: 18,
    zIndex: 1000,
    padding: '6px 10px',
    borderRadius: 6,
    background: 'rgba(0,0,0,0.8)',
    color: '#fff',
    fontSize: 11,
  },
  noHailBadge: {
    position: 'absolute',
    bottom: 18,
    left: 18,
    zIndex: 1000,
    padding: '6px 10px',
    borderRadius: 999,
    background: 'rgba(30,41,59,0.9)',
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: 500,
  },
};
