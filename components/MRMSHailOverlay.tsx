/**
 * MRMS MESH Hail Swath Overlay for Leaflet Maps
 *
 * Displays MRMS (Multi-Radar Multi-Sensor) MESH (Maximum Expected Size of Hail)
 * data as a map overlay, sourced from a self-hosted MRMS tile server.
 *
 * Supports two rendering modes:
 *   Mode 1 (primary): ImageOverlay — loads a single colorized PNG covering CONUS.
 *     Best for low-resource tile servers. Auto-refreshes every 5 minutes.
 *   Mode 2 (fallback): TileLayer — standard XYZ tiles for upgraded tile servers.
 *
 * Products:
 *   mesh60   — Max hail size over the past 60 minutes
 *   mesh1440 — Max hail size over the past 24 hours (1440 min)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ImageOverlay, TileLayer } from 'react-leaflet';
import { LatLngBounds } from 'leaflet';
import { Layers, RefreshCw, Settings } from 'lucide-react';

// CONUS bounding box for the full-extent PNG image
const CONUS_BOUNDS = new LatLngBounds(
  [20, -130], // SW corner
  [55, -60]   // NE corner
);

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Default tile server — swap to production URL when deployed
// Uses Railway backend proxy (/api/mrms/) to avoid mixed-content blocking
const DEFAULT_TILE_SERVER = '';

type MRMSProduct = 'mesh60' | 'mesh1440';
type RenderMode = 'image' | 'tile';

interface MRMSHailOverlayProps {
  /** Whether the overlay is currently shown on the map */
  visible: boolean;
  /** Which MESH product to display */
  product: MRMSProduct;
  /** Overlay opacity 0–1 */
  opacity?: number;
  /** Toggle visibility from parent */
  onToggle: () => void;
  /** Optional override for the tile server base URL */
  tileServerUrl?: string;
}

// Legend entries: label + background color for the swatch
const HAIL_LEGEND: Array<{ label: string; color: string }> = [
  { label: '< 0.5"',  color: '#4ade80' }, // light green
  { label: '0.5–1"',  color: '#16a34a' }, // green
  { label: '1–1.5"',  color: '#facc15' }, // yellow
  { label: '1.5–2"',  color: '#f97316' }, // orange
  { label: '2–3"',    color: '#ea580c' }, // dark orange
  { label: '3"+',     color: '#dc2626' }, // red
];

const MRMSHailOverlay: React.FC<MRMSHailOverlayProps> = ({
  visible,
  product,
  opacity: initialOpacity = 0.65,
  onToggle,
  tileServerUrl = DEFAULT_TILE_SERVER,
}) => {
  const [opacity, setOpacity] = useState(initialOpacity);
  const [showControls, setShowControls] = useState(false);
  const [renderMode] = useState<RenderMode>('image');
  const [cacheBust, setCacheBust] = useState(() => Date.now());
  const [imageError, setImageError] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);

  // Build the full-image URL via Railway proxy with cache-busting
  const imageUrl = tileServerUrl
    ? `${tileServerUrl}/overlays/${product}.png?t=${cacheBust}`
    : `/api/mrms/${product}.png?t=${cacheBust}`;

  // Build the XYZ tile URL template for tile mode
  const tileUrl = tileServerUrl
    ? `${tileServerUrl}/tiles/${product}/{z}/{x}/{y}.png`
    : `/api/mrms/tiles/${product}/{z}/{x}/{y}.png`;

  const triggerRefresh = useCallback(() => {
    setCacheBust(Date.now());
    setImageError(false);
  }, []);

  // Auto-refresh every 5 minutes while visible
  useEffect(() => {
    if (!visible) {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      return;
    }

    // Immediate refresh when becoming visible
    triggerRefresh();

    refreshTimerRef.current = window.setInterval(triggerRefresh, REFRESH_INTERVAL_MS);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [visible, product, triggerRefresh]);

  // When product changes, refresh immediately
  useEffect(() => {
    if (visible) {
      triggerRefresh();
    }
  }, [product, visible, triggerRefresh]);

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Toggle button — positioned below RainViewer (top: 160px + 80px gap) */}
      {/* ------------------------------------------------------------------ */}
      <div
        style={{
          position: 'absolute',
          top: '240px',
          right: '10px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <button
          onClick={onToggle}
          title={visible ? 'Hide MRMS Hail Swath' : 'Show MRMS Hail Swath'}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '4px',
            border: '2px solid rgba(0,0,0,0.2)',
            background: visible ? '#7c3aed' : 'white',
            color: visible ? 'white' : '#333',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 5px rgba(0,0,0,0.3)',
          }}
        >
          <Layers className="w-4 h-4" />
        </button>

      </div>

      {/* Controls panel removed — just toggle on/off */}
      {false && (
        <div style={{ display: 'none' }}>
          <button
            onClick={triggerRefresh}
            style={{
              gap: '4px',
            }}
          >
            <RefreshCw className="w-3 h-3" />
            Refresh now
          </button>

          {/* Server status */}
          {imageError && (
            <div
              style={{
                marginTop: '8px',
                padding: '6px 8px',
                borderRadius: '4px',
                background: '#fff5f5',
                border: '1px solid #fed7d7',
                fontSize: '10px',
                color: '#c53030',
              }}
            >
              Tile server not reachable. Data will appear automatically when the server is online.
            </div>
          )}

          {/* Render mode badge */}
          <div
            style={{
              marginTop: '8px',
              fontSize: '9px',
              color: '#a0aec0',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Mode: {renderMode === 'image' ? 'Image overlay' : 'Tile layer'}</span>
            <span>Auto-refresh: 5 min</span>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Legend — shown in the bottom-left corner when overlay is active     */}
      {/* ------------------------------------------------------------------ */}
      {visible && !imageError && (
        <div
          style={{
            position: 'absolute',
            bottom: '32px',
            left: '10px',
            zIndex: 1000,
            background: 'rgba(26, 32, 44, 0.88)',
            backdropFilter: 'blur(6px)',
            borderRadius: '8px',
            padding: '8px 10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
            color: 'white',
            fontSize: '10px',
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: '11px',
              marginBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <Layers className="w-3 h-3" style={{ color: '#c084fc' }} />
            MRMS MESH — {product === 'mesh60' ? '60-min' : '24-hr'} Hail
          </div>
          {HAIL_LEGEND.map(({ label, color }) => (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '3px',
              }}
            >
              <div
                style={{
                  width: '14px',
                  height: '10px',
                  borderRadius: '2px',
                  background: color,
                  flexShrink: 0,
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
              />
              <span style={{ color: '#e2e8f0' }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Map overlay — rendered inside MapContainer context                  */}
      {/* ------------------------------------------------------------------ */}
      {visible && renderMode === 'image' && (
        <ImageOverlay
          key={`mrms-image-${product}-${cacheBust}`}
          url={imageUrl}
          bounds={CONUS_BOUNDS}
          opacity={opacity}
          zIndex={502}
          // Gracefully handle 404/server-down: hide the legend
          eventHandlers={{
            error: () => setImageError(true),
            load: () => setImageError(false),
          }}
        />
      )}

      {visible && renderMode === 'tile' && (
        <TileLayer
          key={`mrms-tiles-${product}-${cacheBust}`}
          url={tileUrl}
          opacity={opacity}
          zIndex={502}
          attribution='MRMS MESH: NOAA/NSSL'
        />
      )}
    </>
  );
};

export default MRMSHailOverlay;
