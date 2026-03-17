import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { X, RotateCw, Home, Maximize2, Minimize2 } from 'lucide-react';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

interface PropertyView3DProps {
  lat: number;
  lng: number;
  address?: string;
  onClose: () => void;
}

export default function PropertyView3D({ lat, lng, address, onClose }: PropertyView3DProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [bearing, setBearing] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!mapContainer.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [lng, lat],
      zoom: 18,
      pitch: 60,
      bearing: -20,
      antialias: true
    });

    const m = map.current;

    m.on('style.load', () => {
      // Add 3D building layer
      const layers = m.getStyle().layers;
      const labelLayerId = layers?.find(
        (layer) => layer.type === 'symbol' && (layer.layout as any)?.['text-field']
      )?.id;

      m.addLayer(
        {
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': '#ddd',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.7
          }
        },
        labelLayerId
      );

      // Add property marker
      new mapboxgl.Marker({ color: '#dc2626' })
        .setLngLat([lng, lat])
        .setPopup(new mapboxgl.Popup().setHTML(
          `<div style="font-family:sans-serif;padding:4px">
            <strong style="color:#dc2626">Property</strong><br/>
            <span style="font-size:12px">${address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}</span>
          </div>`
        ))
        .addTo(m);
    });

    // Navigation controls
    m.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Track bearing for compass display
    m.on('rotate', () => {
      setBearing(Math.round(m.getBearing()));
    });

    return () => {
      m.remove();
    };
  }, [lat, lng, address]);

  const rotateView = () => {
    if (!map.current) return;
    const currentBearing = map.current.getBearing();
    map.current.easeTo({ bearing: currentBearing + 90, duration: 1000 });
  };

  const resetView = () => {
    if (!map.current) return;
    map.current.easeTo({
      center: [lng, lat],
      zoom: 18,
      pitch: 60,
      bearing: -20,
      duration: 1000
    });
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div style={{
      position: 'fixed',
      top: isFullscreen ? 0 : '10%',
      left: isFullscreen ? 0 : '10%',
      right: isFullscreen ? 0 : '10%',
      bottom: isFullscreen ? 0 : '10%',
      zIndex: 10000,
      borderRadius: isFullscreen ? 0 : '12px',
      overflow: 'hidden',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      border: isFullscreen ? 'none' : '2px solid rgba(255,255,255,0.1)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header bar */}
      <div style={{
        background: 'rgba(15, 15, 30, 0.95)',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        zIndex: 2
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Home className="w-5 h-5" style={{ color: '#dc2626' }} />
          <div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: '14px' }}>
              3D Property View
            </div>
            <div style={{ color: '#aaa', fontSize: '11px' }}>
              {address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ color: '#888', fontSize: '11px', marginRight: '8px' }}>
            Bearing: {bearing}°
          </div>

          <button
            onClick={rotateView}
            title="Rotate 90°"
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px',
              padding: '6px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: 'white',
              fontSize: '11px'
            }}
          >
            <RotateCw className="w-3 h-3" />
            Rotate
          </button>

          <button
            onClick={resetView}
            title="Reset view"
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px',
              padding: '6px 10px',
              cursor: 'pointer',
              color: 'white',
              fontSize: '11px'
            }}
          >
            Reset
          </button>

          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px',
              padding: '6px',
              cursor: 'pointer',
              color: 'white'
            }}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={onClose}
            title="Close 3D view"
            style={{
              background: '#dc2626',
              border: 'none',
              borderRadius: '6px',
              padding: '6px',
              cursor: 'pointer',
              color: 'white'
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Map */}
      <div ref={mapContainer} style={{ flex: 1 }} />

      {/* Footer hint */}
      <div style={{
        background: 'rgba(15, 15, 30, 0.9)',
        padding: '6px 16px',
        color: '#888',
        fontSize: '10px',
        textAlign: 'center',
        borderTop: '1px solid rgba(255,255,255,0.1)'
      }}>
        Drag to pan | Scroll to zoom | Right-drag to rotate &amp; tilt | Ctrl+drag to pitch
      </div>
    </div>
  );
}
