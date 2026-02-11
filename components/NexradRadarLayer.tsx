/**
 * NEXRAD Radar Layer for Leaflet Maps
 *
 * Uses Iowa Environmental Mesonet (IEM) WMS-T service to display
 * historical NEXRAD base reflectivity on the map.
 * Free public service, no API key required.
 *
 * Supports:
 * - Toggle radar on/off
 * - Time slider for historical dates
 * - Opacity control
 * - Auto-loads radar for the most recent storm date
 */

import React, { useState, useEffect, useCallback } from 'react';
import { TileLayer, useMap } from 'react-leaflet';
import { Radio, Clock, Minus, Plus } from 'lucide-react';

interface NexradRadarLayerProps {
  /** Whether the radar layer is visible */
  visible: boolean;
  /** Toggle visibility */
  onToggle: () => void;
  /** Optional: date to show radar for (ISO string) */
  stormDate?: string;
  /** Optional: opacity 0-1 */
  opacity?: number;
}

/**
 * WMS tile layer for NEXRAD radar overlay
 */
const NexradTileLayer: React.FC<{ datetime: string; opacity: number }> = ({ datetime, opacity }) => {
  const map = useMap();

  // Round datetime to nearest 5 minutes for WMS-T
  const getWmsTime = (dt: string): string => {
    const date = new Date(dt);
    date.setMinutes(Math.round(date.getMinutes() / 5) * 5, 0, 0);
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  };

  const wmsTime = getWmsTime(datetime);

  return (
    <TileLayer
      url={`https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r-t.cgi?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=nexrad-n0r-wmst&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:4326&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&TIME=${wmsTime}`}
      opacity={opacity}
      attribution='NEXRAD Radar: <a href="https://mesonet.agron.iastate.edu/">IEM</a>'
      maxZoom={19}
      zIndex={500}
    />
  );
};

/**
 * NEXRAD Radar control panel and layer
 */
const NexradRadarLayer: React.FC<NexradRadarLayerProps> = ({
  visible,
  onToggle,
  stormDate,
  opacity: initialOpacity = 0.6
}) => {
  const [opacity, setOpacity] = useState(initialOpacity);
  const [currentTime, setCurrentTime] = useState(stormDate || new Date().toISOString());
  const [timeOffset, setTimeOffset] = useState(0); // minutes offset from storm date
  const [showControls, setShowControls] = useState(false);

  // Update time when storm date changes
  useEffect(() => {
    if (stormDate) {
      setCurrentTime(stormDate);
      setTimeOffset(0);
    }
  }, [stormDate]);

  // Apply time offset
  useEffect(() => {
    const base = new Date(stormDate || new Date().toISOString());
    base.setMinutes(base.getMinutes() + timeOffset);
    setCurrentTime(base.toISOString());
  }, [timeOffset, stormDate]);

  const formatTimeDisplay = useCallback((isoStr: string): string => {
    try {
      return new Date(isoStr).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }) + ' ET';
    } catch {
      return isoStr;
    }
  }, []);

  return (
    <>
      {/* Radar toggle button */}
      <div
        style={{
          position: 'absolute',
          top: '80px',
          right: '10px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
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
            background: visible ? '#c53030' : 'white',
            color: visible ? 'white' : '#333',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 5px rgba(0,0,0,0.3)'
          }}
        >
          <Radio className="w-4 h-4" />
        </button>

        {visible && (
          <button
            onClick={() => setShowControls(!showControls)}
            title="Radar controls"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '4px',
              border: '2px solid rgba(0,0,0,0.2)',
              background: showControls ? '#2d3748' : 'white',
              color: showControls ? 'white' : '#333',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 5px rgba(0,0,0,0.3)'
            }}
          >
            <Clock className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Radar controls panel */}
      {visible && showControls && (
        <div
          style={{
            position: 'absolute',
            top: '80px',
            right: '52px',
            zIndex: 1000,
            background: 'white',
            borderRadius: '8px',
            padding: '12px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            minWidth: '240px'
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: '#1a202c' }}>
            NEXRAD Radar Controls
          </div>

          {/* Current time display */}
          <div style={{ fontSize: '11px', color: '#4a5568', marginBottom: '8px' }}>
            {formatTimeDisplay(currentTime)}
          </div>

          {/* Time slider */}
          <div style={{ marginBottom: '8px' }}>
            <label style={{ fontSize: '10px', color: '#718096' }}>Time Offset</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={() => setTimeOffset(prev => prev - 10)}
                style={{
                  width: '24px', height: '24px', borderRadius: '4px',
                  border: '1px solid #e2e8f0', background: '#f7fafc',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={-120}
                max={120}
                step={5}
                value={timeOffset}
                onChange={(e) => setTimeOffset(parseInt(e.target.value))}
                style={{ flex: 1 }}
              />
              <button
                onClick={() => setTimeOffset(prev => prev + 10)}
                style={{
                  width: '24px', height: '24px', borderRadius: '4px',
                  border: '1px solid #e2e8f0', background: '#f7fafc',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
            <div style={{ fontSize: '10px', color: '#a0aec0', textAlign: 'center' }}>
              {timeOffset === 0 ? 'Storm time' : `${timeOffset > 0 ? '+' : ''}${timeOffset} min`}
            </div>
          </div>

          {/* Opacity slider */}
          <div>
            <label style={{ fontSize: '10px', color: '#718096' }}>Opacity: {Math.round(opacity * 100)}%</label>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={opacity * 100}
              onChange={(e) => setOpacity(parseInt(e.target.value) / 100)}
              style={{ width: '100%' }}
            />
          </div>

          {/* Quick presets */}
          <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
            {[-60, -30, 0, 30, 60].map(offset => (
              <button
                key={offset}
                onClick={() => setTimeOffset(offset)}
                style={{
                  flex: 1,
                  padding: '4px',
                  fontSize: '9px',
                  borderRadius: '4px',
                  border: `1px solid ${timeOffset === offset ? '#c53030' : '#e2e8f0'}`,
                  background: timeOffset === offset ? '#c53030' : '#f7fafc',
                  color: timeOffset === offset ? 'white' : '#4a5568',
                  cursor: 'pointer'
                }}
              >
                {offset === 0 ? 'Now' : `${offset > 0 ? '+' : ''}${offset}m`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The actual radar tile layer */}
      {visible && <NexradTileLayer datetime={currentTime} opacity={opacity} />}
    </>
  );
};

export default NexradRadarLayer;
