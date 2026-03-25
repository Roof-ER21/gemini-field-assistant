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
 * - Auto-zooms map to storm location when activated
 * - Bounds-restricted WMS tiles to avoid loading the whole USA
 */

import React, { useState, useEffect, useCallback } from 'react';
import { WMSTileLayer, useMap } from 'react-leaflet';
import { LatLngBounds } from 'leaflet';
import { Radio, Clock, Calendar } from 'lucide-react';

interface StormLocation {
  lat: number;
  lng: number;
}

interface NexradRadarLayerProps {
  /** Whether the radar layer is visible */
  visible: boolean;
  /** Toggle visibility */
  onToggle: () => void;
  /** Optional: date to show radar for (ISO string) */
  stormDate?: string;
  /** Optional: lat/lng of the storm — used to auto-zoom and restrict WMS tile area */
  stormLocation?: StormLocation;
  /** Optional: opacity 0-1 */
  opacity?: number;
}

// Half-width in degrees for the WMS bounds box around the storm location.
// ~1.5° ≈ 100 miles at mid-latitudes; large enough to show radar context
// while keeping tile requests focused on the area of interest.
const BOUNDS_HALF_DEG = 1.5;

/**
 * Sits inside the MapContainer context and flies the map to the storm
 * location whenever the radar is activated or the location changes.
 */
const MapFlyController: React.FC<{
  visible: boolean;
  stormLocation: StormLocation | undefined;
}> = ({ visible, stormLocation }) => {
  const map = useMap();

  useEffect(() => {
    if (!visible || !stormLocation) return;
    const { lat, lng } = stormLocation;
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

    // Only fly if the current zoom is wide (< 9). If the user is already
    // zoomed into the area, don't disturb their view.
    const currentZoom = map.getZoom();
    const targetZoom = Math.max(currentZoom, 9);
    map.flyTo([lat, lng], targetZoom, { duration: 1.2, easeLinearity: 0.25 });
  }, [visible, stormLocation, map]);

  return null;
};

/**
 * WMS tile layer for NEXRAD radar overlay.
 * When a stormLocation is provided the tiles are bounded to a box around
 * that location so Leaflet only requests radar tiles for that region.
 */
const NexradTileLayer: React.FC<{
  datetime: string;
  opacity: number;
  stormLocation?: StormLocation;
}> = ({ datetime, opacity, stormLocation }) => {
  // Round datetime to nearest 5 minutes for WMS-T
  const getWmsTime = (dt: string): string => {
    const date = new Date(dt);
    date.setMinutes(Math.round(date.getMinutes() / 5) * 5, 0, 0);
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  };

  const wmsTime = getWmsTime(datetime);

  // Build a LatLngBounds box around the storm location if one is available.
  // This is passed to WMSTileLayer so Leaflet will only request tiles that
  // intersect that bounding box, avoiding full-USA tile loads.
  const tileBounds: LatLngBounds | undefined = stormLocation
    ? new LatLngBounds(
        [stormLocation.lat - BOUNDS_HALF_DEG, stormLocation.lng - BOUNDS_HALF_DEG],
        [stormLocation.lat + BOUNDS_HALF_DEG, stormLocation.lng + BOUNDS_HALF_DEG]
      )
    : undefined;

  return (
    <WMSTileLayer
      url="https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r-t.cgi"
      layers="nexrad-n0r-wmst"
      format="image/png"
      transparent={true}
      opacity={opacity}
      attribution='NEXRAD Radar: <a href="https://mesonet.agron.iastate.edu/">IEM</a>'
      maxZoom={19}
      zIndex={500}
      bounds={tileBounds}
      // @ts-ignore - WMS-T time parameter
      time={wmsTime}
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
  stormLocation,
  opacity: initialOpacity = 0.6
}) => {
  const [opacity, setOpacity] = useState(initialOpacity);
  const [showControls, setShowControls] = useState(false);
  // Manual date/time entry
  const [manualDate, setManualDate] = useState('');
  const [manualTime, setManualTime] = useState('12:00');
  const [useManualDate, setUseManualDate] = useState(false);

  // Compute the effective radar datetime
  const currentTime = useManualDate && manualDate
    ? new Date(`${manualDate}T${manualTime || '12:00'}:00`).toISOString()
    : stormDate || new Date().toISOString();

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
      {/* Auto-zoom map to storm location when radar activates */}
      <MapFlyController visible={visible} stormLocation={stormLocation} />

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

          {/* Storm location indicator */}
          {stormLocation && (
            <div style={{
              fontSize: '10px',
              color: '#2f855a',
              background: '#f0fff4',
              border: '1px solid #9ae6b4',
              borderRadius: '4px',
              padding: '4px 8px',
              marginBottom: '8px'
            }}>
              Radar focused: {stormLocation.lat.toFixed(3)}, {stormLocation.lng.toFixed(3)}
            </div>
          )}

          {/* Date picker */}
          <div style={{ marginBottom: '8px', padding: '8px', background: '#f7fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <label style={{ fontSize: '10px', color: '#718096', display: 'block', marginBottom: '4px' }}>
              <Calendar className="w-3 h-3" style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
              Look up date
            </label>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input
                type="date"
                value={manualDate}
                onChange={(e) => {
                  setManualDate(e.target.value);
                  if (e.target.value) {
                    setUseManualDate(true);
                  }
                }}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  borderRadius: '4px',
                  border: '1px solid #e2e8f0',
                  fontSize: '11px',
                  color: '#1a202c',
                  background: 'white'
                }}
              />
              <input
                type="time"
                value={manualTime}
                onChange={(e) => {
                  setManualTime(e.target.value);
                  if (manualDate) {
                    setUseManualDate(true);
                  }
                }}
                style={{
                  width: '80px',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  border: '1px solid #e2e8f0',
                  fontSize: '11px',
                  color: '#1a202c',
                  background: 'white'
                }}
              />
            </div>
            {useManualDate && (
              <button
                onClick={() => { setUseManualDate(false); setManualDate(''); }}
                style={{
                  marginTop: '4px',
                  padding: '2px 8px',
                  fontSize: '9px',
                  color: '#c53030',
                  background: 'none',
                  border: '1px solid #c53030',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              >
                Clear — back to storm events
              </button>
            )}
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

        </div>
      )}

      {/* The actual radar tile layer */}
      {visible && (
        <NexradTileLayer
          datetime={currentTime}
          opacity={opacity}
          stormLocation={stormLocation}
        />
      )}
    </>
  );
};

export default NexradRadarLayer;
