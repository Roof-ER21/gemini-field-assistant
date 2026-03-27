import React, { useMemo, useEffect, useRef, useState } from 'react';
import { WMSTileLayer, useMap } from 'react-leaflet';
import { LatLngBounds } from 'leaflet';
import { Radio } from 'lucide-react';
import type { BoundingBox } from './stormMapHelpers';

interface StormLocation {
  lat: number;
  lng: number;
}

interface NexradRadarLayerProps {
  visible: boolean;
  onToggle: () => void;
  stormDate?: string | null;
  stormLocation?: StormLocation;
  stormBounds?: BoundingBox | null;
  historicalTimestamps?: string[];
  opacity?: number;
}

function roundToFiveMinuteIso(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  parsed.setMinutes(Math.round(parsed.getMinutes() / 5) * 5, 0, 0);
  return parsed.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function toLatLngBounds(bounds?: BoundingBox | null, fallbackLocation?: StormLocation): LatLngBounds | undefined {
  if (bounds) {
    return new LatLngBounds(
      [bounds.south, bounds.west],
      [bounds.north, bounds.east],
    );
  }

  if (fallbackLocation) {
    return new LatLngBounds(
      [fallbackLocation.lat - 1.2, fallbackLocation.lng - 1.2],
      [fallbackLocation.lat + 1.2, fallbackLocation.lng + 1.2],
    );
  }

  return undefined;
}

function formatEasternTimestamp(timestamp: string): string {
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

const MapFitController: React.FC<{
  visible: boolean;
  stormBounds?: BoundingBox | null;
  stormLocation?: StormLocation;
}> = ({ visible, stormBounds, stormLocation }) => {
  const map = useMap();
  const lastFitKeyRef = useRef('');

  useEffect(() => {
    if (!visible) {
      return;
    }

    const fitBounds = toLatLngBounds(stormBounds, stormLocation);
    if (!fitBounds) {
      return;
    }

    const key = fitBounds.toBBoxString();
    if (lastFitKeyRef.current === key) {
      return;
    }

    map.fitBounds(fitBounds, {
      padding: [32, 32],
      maxZoom: 10,
      animate: true,
    });
    lastFitKeyRef.current = key;
  }, [map, stormBounds, stormLocation, visible]);

  return null;
};

const RadarTiles: React.FC<{
  timestamps: string[];
  opacity: number;
  bounds?: BoundingBox | null;
  stormLocation?: StormLocation;
}> = ({ timestamps, opacity, bounds, stormLocation }) => {
  const tileBounds = useMemo(() => toLatLngBounds(bounds, stormLocation), [bounds, stormLocation]);
  const effectiveTimes = useMemo(
    () => timestamps.map(roundToFiveMinuteIso),
    [timestamps],
  );
  const perFrameOpacity =
    effectiveTimes.length <= 1
      ? opacity
      : Math.max(0.18, Math.min(0.32, opacity / Math.min(effectiveTimes.length, 3)));

  return (
    <>
      {effectiveTimes.map((timestamp) => (
        <WMSTileLayer
          key={timestamp}
          url="https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r-t.cgi"
          layers="nexrad-n0r-wmst"
          format="image/png"
          transparent={true}
          opacity={perFrameOpacity}
          attribution='NEXRAD Radar: <a href="https://mesonet.agron.iastate.edu/">IEM</a>'
          maxZoom={19}
          zIndex={500}
          bounds={tileBounds}
          // @ts-expect-error WMS-T time parameter is supported by the endpoint.
          time={timestamp}
        />
      ))}
    </>
  );
};

const NexradRadarLayer: React.FC<NexradRadarLayerProps> = ({
  visible,
  onToggle,
  stormDate = null,
  stormLocation,
  stormBounds = null,
  historicalTimestamps = [],
  opacity: initialOpacity = 0.72,
}) => {
  const [opacity, setOpacity] = useState(initialOpacity);

  const timestamps = useMemo(() => {
    if (stormDate && historicalTimestamps.length > 0) {
      return historicalTimestamps;
    }
    return [new Date().toISOString()];
  }, [historicalTimestamps, stormDate]);

  const statusLabel = stormDate
    ? `Historical composite for ${stormDate}`
    : `Live radar ${formatEasternTimestamp(timestamps[0])}`;

  return (
    <>
      <MapFitController
        visible={visible}
        stormBounds={stormBounds}
        stormLocation={stormLocation}
      />

      <div
        style={{
          position: 'absolute',
          top: '80px',
          right: '10px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <button
          onClick={onToggle}
          title={visible ? 'Hide NEXRAD Radar' : 'Show NEXRAD Radar'}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '4px',
            border: '2px solid rgba(0,0,0,0.2)',
            background: visible ? '#16a34a' : 'white',
            color: visible ? 'white' : '#333',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 5px rgba(0,0,0,0.3)',
          }}
        >
          <Radio className="w-4 h-4" />
        </button>
      </div>

      {visible && (
        <div
          style={{
            position: 'absolute',
            top: '80px',
            right: '52px',
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(8px)',
            borderRadius: '10px',
            padding: '12px 14px',
            color: 'white',
            fontSize: '12px',
            minWidth: '240px',
            maxWidth: '320px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>
            <Radio className="w-4 h-4" style={{ color: '#4ade80' }} />
            {stormDate ? 'Historical NEXRAD' : 'Live NEXRAD'}
          </div>
          <div style={{ fontSize: '11px', color: '#cbd5e1', marginBottom: '8px', lineHeight: 1.45 }}>
            {statusLabel}
          </div>
          {stormDate && historicalTimestamps.length > 0 ? (
            <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '8px' }}>
              Compositing {historicalTimestamps.length} archived storm-time frame{historicalTimestamps.length === 1 ? '' : 's'}.
            </div>
          ) : null}
          <div>
            <label style={{ fontSize: '10px', color: '#94a3b8' }}>
              Opacity: {Math.round(opacity * 100)}%
            </label>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={opacity * 100}
              onChange={(event) => setOpacity(Number(event.target.value) / 100)}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      )}

      {visible && (
        <RadarTiles
          timestamps={timestamps}
          opacity={opacity}
          bounds={stormBounds}
          stormLocation={stormLocation}
        />
      )}
    </>
  );
};

export default NexradRadarLayer;
