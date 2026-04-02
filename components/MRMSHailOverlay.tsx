import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ImageOverlay, useMap } from 'react-leaflet';
import { LatLngBounds } from 'leaflet';
import { Layers } from 'lucide-react';
import { getApiBaseUrl } from '../services/config';
import type { BoundingBox } from './stormMapHelpers';

const CONUS_BOUNDS = new LatLngBounds(
  [20, -130],
  [55, -60],
);

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type MRMSProduct = 'mesh60' | 'mesh1440';

interface HistoricalMrmsMetadata {
  ref_time?: string;
  generated_at?: string;
  has_hail?: boolean;
  max_mesh_inches?: number;
  hail_pixels?: number;
  bounds?: BoundingBox;
}

interface MRMSHailOverlayProps {
  visible: boolean;
  product: MRMSProduct;
  opacity?: number;
  onToggle: () => void;
  selectedDate?: string | null;
  historicalBounds?: BoundingBox | null;
  anchorTimestamp?: string | null;
}

// Color-to-hail-size mapping with RGB ranges (accounts for PNG compression artifacts)
const HAIL_LEGEND: Array<{ label: string; color: string; sizeRange: string; minInches: number; maxInches: number }> = [
  { label: 'Trace to Pea',           color: '#90EE90', sizeRange: '< 0.25"',         minInches: 0.05, maxInches: 0.25 },
  { label: 'Pea to Penny',           color: '#00FF00', sizeRange: '0.25" - 0.75"',  minInches: 0.25, maxInches: 0.75 },
  { label: 'Penny to Quarter',       color: '#FFFF00', sizeRange: '0.75" - 1.00"',  minInches: 0.75, maxInches: 1.00 },
  { label: 'Quarter to Ping Pong',   color: '#FFA500', sizeRange: '1.00" - 1.50"',  minInches: 1.00, maxInches: 1.50 },
  { label: 'Ping Pong to Golf Ball', color: '#FF6600', sizeRange: '1.50" - 1.75"',  minInches: 1.50, maxInches: 1.75 },
  { label: 'Golf Ball to Tennis Ball',color: '#FF0000', sizeRange: '1.75" - 2.50"', minInches: 1.75, maxInches: 2.50 },
  { label: 'Tennis Ball to Softball', color: '#8B0000', sizeRange: '2.50" - 4.00"', minInches: 2.50, maxInches: 4.00 },
  { label: 'Softball+',              color: '#800080', sizeRange: '4.00"+',          minInches: 4.00, maxInches: 6.00 },
];

// Parse hex color to RGB
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Pre-compute reference RGB values
const LEGEND_RGB = HAIL_LEGEND.map(entry => ({
  ...entry,
  rgb: hexToRgb(entry.color),
}));

// Find closest legend entry by RGB distance
function matchPixelToHail(r: number, g: number, b: number, a: number): typeof HAIL_LEGEND[0] | null {
  if (a < 30) return null; // Transparent = no hail
  let best = LEGEND_RGB[0];
  let bestDist = Infinity;
  for (const entry of LEGEND_RGB) {
    const dr = r - entry.rgb[0];
    const dg = g - entry.rgb[1];
    const db = b - entry.rgb[2];
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }
  // Only match if reasonably close (distance < 15000 allows for compression artifacts)
  return bestDist < 15000 ? best : null;
}

function formatTimestamp(timestamp?: string): string | null {
  if (!timestamp) {
    return null;
  }

  try {
    return new Date(timestamp).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }) + ' ET';
  } catch {
    return timestamp;
  }
}

function toLatLngBounds(bounds?: BoundingBox | null): LatLngBounds {
  if (!bounds) {
    return CONUS_BOUNDS;
  }

  return new LatLngBounds(
    [bounds.south, bounds.west],
    [bounds.north, bounds.east],
  );
}

function buildHistoricalQuery(date: string, bounds: BoundingBox, anchorTimestamp?: string | null): URLSearchParams {
  const query = new URLSearchParams({
    date,
    north: bounds.north.toString(),
    south: bounds.south.toString(),
    east: bounds.east.toString(),
    west: bounds.west.toString(),
  });

  if (anchorTimestamp) {
    query.set('anchorTimestamp', anchorTimestamp);
  }

  return query;
}

const MRMSHailOverlay: React.FC<MRMSHailOverlayProps> = ({
  visible,
  product,
  opacity = 0.62,
  onToggle,
  selectedDate = null,
  historicalBounds = null,
  anchorTimestamp = null,
}) => {
  const apiBase = getApiBaseUrl();
  const map = useMap();
  const refreshTimerRef = useRef<number | null>(null);
  const [cacheBust, setCacheBust] = useState(() => Date.now());
  const [imageError, setImageError] = useState(false);
  const [historicalMeta, setHistoricalMeta] = useState<HistoricalMrmsMetadata | null>(null);
  const [loadingHistorical, setLoadingHistorical] = useState(false);

  // Hover tooltip state
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; label: string; size: string; color: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgLoadedRef = useRef(false);

  const isHistoricalMode = Boolean(selectedDate && historicalBounds);

  const liveImageUrl = useMemo(
    () => `${apiBase.replace(/\/$/, '')}/mrms/${product}.png?t=${cacheBust}`,
    [apiBase, cacheBust, product],
  );

  const historicalQuery = useMemo(() => {
    if (!selectedDate || !historicalBounds) {
      return null;
    }

    return buildHistoricalQuery(selectedDate, historicalBounds, anchorTimestamp);
  }, [anchorTimestamp, historicalBounds, selectedDate]);

  const historicalImageUrl = useMemo(() => {
    if (!historicalQuery) {
      return null;
    }

    return `${apiBase}/hail/mrms-historical-image?${historicalQuery.toString()}&t=${cacheBust}`;
  }, [apiBase, cacheBust, historicalQuery]);

  const overlayBounds = useMemo(() => {
    if (isHistoricalMode) {
      return toLatLngBounds(historicalMeta?.bounds || historicalBounds);
    }
    return CONUS_BOUNDS;
  }, [historicalBounds, historicalMeta?.bounds, isHistoricalMode]);

  const overlayUrl = isHistoricalMode ? historicalImageUrl : liveImageUrl;

  const refreshOverlay = useCallback(() => {
    setCacheBust(Date.now());
    setImageError(false);
    imgLoadedRef.current = false;
  }, []);

  // Load MRMS image into offscreen canvas for pixel reading
  useEffect(() => {
    if (!visible || !overlayUrl) {
      imgLoadedRef.current = false;
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        canvasRef.current = canvas;
        imgRef.current = img;
        imgLoadedRef.current = true;
      }
    };
    img.onerror = () => {
      imgLoadedRef.current = false;
    };
    img.src = overlayUrl;
  }, [visible, overlayUrl]);

  // Map mousemove handler for hail size tooltip
  useEffect(() => {
    if (!visible || !map) return;

    const onMouseMove = (e: any) => {
      if (!imgLoadedRef.current || !canvasRef.current) {
        if (hoverInfo) setHoverInfo(null);
        return;
      }

      const latlng = e.latlng;
      const bounds = overlayBounds;

      // Check if cursor is within overlay bounds
      if (!bounds.contains(latlng)) {
        if (hoverInfo) setHoverInfo(null);
        return;
      }

      // Map lat/lng to pixel coordinates on the canvas
      const canvas = canvasRef.current;
      const xPct = (latlng.lng - bounds.getWest()) / (bounds.getEast() - bounds.getWest());
      const yPct = (bounds.getNorth() - latlng.lat) / (bounds.getNorth() - bounds.getSouth());

      const px = Math.floor(xPct * canvas.width);
      const py = Math.floor(yPct * canvas.height);

      if (px < 0 || px >= canvas.width || py < 0 || py >= canvas.height) {
        if (hoverInfo) setHoverInfo(null);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const pixel = ctx.getImageData(px, py, 1, 1).data;
      const match = matchPixelToHail(pixel[0], pixel[1], pixel[2], pixel[3]);

      if (match) {
        const containerPoint = map.latLngToContainerPoint(latlng);
        setHoverInfo({
          x: containerPoint.x,
          y: containerPoint.y,
          label: match.label,
          size: match.sizeRange,
          color: match.color,
        });
      } else {
        if (hoverInfo) setHoverInfo(null);
      }
    };

    const onMouseOut = () => setHoverInfo(null);

    map.on('mousemove', onMouseMove);
    map.on('mouseout', onMouseOut);

    return () => {
      map.off('mousemove', onMouseMove);
      map.off('mouseout', onMouseOut);
    };
  }, [visible, map, overlayBounds, hoverInfo]);

  useEffect(() => {
    if (!visible || !isHistoricalMode || !historicalQuery) {
      setHistoricalMeta(null);
      setLoadingHistorical(false);
      return;
    }

    const controller = new AbortController();

    const loadHistoricalMetadata = async () => {
      setLoadingHistorical(true);
      try {
        const response = await fetch(
          `${apiBase}/hail/mrms-historical-meta?${historicalQuery.toString()}`,
          {
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]),
          },
        );

        if (!response.ok) {
          throw new Error(`Historical MRMS metadata returned ${response.status}`);
        }

        const data: HistoricalMrmsMetadata = await response.json();
        if (!controller.signal.aborted) {
          setHistoricalMeta(data);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Historical MRMS metadata fetch failed:', error);
          setHistoricalMeta(null);
          setImageError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingHistorical(false);
        }
      }
    };

    void loadHistoricalMetadata();

    return () => {
      controller.abort();
    };
  }, [apiBase, historicalQuery, isHistoricalMode, visible]);

  useEffect(() => {
    if (!visible) {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      setHoverInfo(null);
      return;
    }

    refreshOverlay();

    if (!isHistoricalMode) {
      refreshTimerRef.current = window.setInterval(refreshOverlay, REFRESH_INTERVAL_MS);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [isHistoricalMode, refreshOverlay, visible]);

  const infoMessage = isHistoricalMode
    ? historicalMeta?.has_hail === false
      ? 'No archived MRMS hail raster was found inside the selected storm bounds.'
      : historicalMeta?.ref_time
        ? `Archived MRMS ${formatTimestamp(historicalMeta.ref_time)}`
        : 'Historical hail footprint for the selected storm date.'
    : `Live ${product === 'mesh60' ? '60-minute' : '24-hour'} MRMS hail overlay`;

  return (
    <>
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
          title={visible ? 'Hide MRMS Hail Overlay' : 'Show MRMS Hail Overlay'}
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

      {/* Hover tooltip — shows hail size when cursor is over the swath */}
      {visible && hoverInfo && (
        <div
          style={{
            position: 'absolute',
            left: hoverInfo.x + 16,
            top: hoverInfo.y - 20,
            zIndex: 1001,
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(8px)',
            borderRadius: '8px',
            padding: '8px 12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            color: 'white',
            fontSize: '12px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            border: `2px solid ${hoverInfo.color}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '3px',
                background: hoverInfo.color,
                flexShrink: 0,
              }}
            />
            <div>
              <div style={{ fontWeight: 700, fontSize: '13px' }}>{hoverInfo.size}</div>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>{hoverInfo.label}</div>
            </div>
          </div>
        </div>
      )}

      {visible && (
        <div
          style={{
            position: 'absolute',
            bottom: '32px',
            left: '10px',
            zIndex: 1000,
            background: 'rgba(26, 32, 44, 0.9)',
            backdropFilter: 'blur(6px)',
            borderRadius: '8px',
            padding: '8px 10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
            color: 'white',
            fontSize: '10px',
            maxWidth: '260px',
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
            {isHistoricalMode ? 'Historical MRMS Hail' : `MRMS MESH ${product === 'mesh60' ? '60m' : '24h'}`}
          </div>
          <div style={{ marginBottom: '6px', color: '#d1d5db', lineHeight: 1.45 }}>
            {loadingHistorical ? 'Loading archived MRMS hail raster...' : infoMessage}
          </div>
          {historicalMeta?.max_mesh_inches ? (
            <div style={{ marginBottom: '6px', color: '#fde68a' }}>
              Max {historicalMeta.max_mesh_inches.toFixed(2)}" hail
            </div>
          ) : null}
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

      {visible && overlayUrl && !(isHistoricalMode && historicalMeta?.has_hail === false) && (
        <ImageOverlay
          key={`mrms-image-${isHistoricalMode ? 'historical' : product}-${cacheBust}`}
          url={overlayUrl}
          bounds={overlayBounds}
          opacity={opacity}
          zIndex={502}
          eventHandlers={{
            error: () => setImageError(true),
            load: () => setImageError(false),
          }}
        />
      )}
    </>
  );
};

export default MRMSHailOverlay;
