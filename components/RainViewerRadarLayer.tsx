/**
 * RainViewer Live Radar Layer for Leaflet Maps
 *
 * Displays animated live weather radar (past 2hrs + 30min forecast)
 * using the free RainViewer API. No API key required.
 *
 * API docs: https://www.rainviewer.com/api.html
 * Tile URL format: https://tilecache.rainviewer.com{path}/256/{z}/{x}/{y}/{color}/{smooth}_{snow}.png
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TileLayer } from 'react-leaflet';
import { CloudRain, Play, Pause, SkipBack, SkipForward } from 'lucide-react';

interface RainViewerFrame {
  time: number; // Unix timestamp (seconds)
  path: string; // Tile path from API
}

interface RainViewerRadarLayerProps {
  visible: boolean;
  onToggle: () => void;
  opacity?: number;
}

const RAINVIEWER_API = 'https://api.rainviewer.com/public/weather-maps.json';
const TILE_BASE = 'https://tilecache.rainviewer.com';
// Color scheme 2 = universal blue, 1_1 = smooth + snow
const TILE_SUFFIX = '/256/{z}/{x}/{y}/2/1_1.png';
const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes
const SPEEDS = [300, 500, 800, 1200];

const RainViewerRadarLayer: React.FC<RainViewerRadarLayerProps> = ({
  visible,
  onToggle,
  opacity: initialOpacity = 0.55
}) => {
  const [frames, setFrames] = useState<RainViewerFrame[]>([]);
  const [nowcastStart, setNowcastStart] = useState(0); // Index where nowcast frames begin
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1); // Default 500ms
  const [opacity, setOpacity] = useState(initialOpacity);
  const [showControls, setShowControls] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);
  const refreshRef = useRef<number | null>(null);

  // Fetch radar frame data from RainViewer API
  const fetchFrames = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(RAINVIEWER_API);
      if (!res.ok) throw new Error(`RainViewer API: ${res.status}`);
      const data = await res.json();

      const past: RainViewerFrame[] = (data.radar?.past || []).map((f: any) => ({
        time: f.time,
        path: f.path
      }));
      const nowcast: RainViewerFrame[] = (data.radar?.nowcast || []).map((f: any) => ({
        time: f.time,
        path: f.path
      }));

      const allFrames = [...past, ...nowcast];
      if (allFrames.length === 0) {
        setError('No radar data available');
        return;
      }

      setFrames(allFrames);
      setNowcastStart(past.length);
      // Start on the most recent past frame
      setCurrentIndex(Math.max(0, past.length - 1));
    } catch (err) {
      console.error('[RainViewer] Fetch failed:', err);
      setError('Radar data unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount when visible, refresh every 10 min
  useEffect(() => {
    if (!visible) return;
    fetchFrames();
    refreshRef.current = window.setInterval(fetchFrames, REFRESH_INTERVAL);
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [visible, fetchFrames]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || frames.length === 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    intervalRef.current = window.setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % frames.length);
    }, SPEEDS[speedIndex]);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, speedIndex, frames.length]);

  // Format timestamp to Eastern time
  const formatTimestamp = useCallback((unixSeconds: number): string => {
    try {
      return new Date(unixSeconds * 1000).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }) + ' ET';
    } catch {
      return '';
    }
  }, []);

  // Get frame label (LIVE, PAST, FORECAST)
  const getFrameLabel = useCallback((index: number): { text: string; color: string } => {
    if (frames.length === 0) return { text: '', color: '#718096' };

    const now = Math.floor(Date.now() / 1000);
    const frameTime = frames[index]?.time || 0;
    const diff = Math.round((frameTime - now) / 60);

    if (index >= nowcastStart) {
      return { text: `FORECAST +${Math.abs(diff)}m`, color: '#d69e2e' };
    }
    if (Math.abs(diff) <= 5) {
      return { text: 'LIVE', color: '#38a169' };
    }
    return { text: `${diff}m ago`, color: '#718096' };
  }, [frames, nowcastStart]);

  const currentFrame = frames[currentIndex];
  const frameLabel = getFrameLabel(currentIndex);

  return (
    <>
      {/* Toggle button - positioned below NEXRAD */}
      <div
        style={{
          position: 'absolute',
          top: '160px',
          right: '10px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}
      >
        <button
          onClick={onToggle}
          title={visible ? 'Hide Live Radar' : 'Show Live Radar'}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '4px',
            border: '2px solid rgba(0,0,0,0.2)',
            background: visible ? '#2b6cb0' : 'white',
            color: visible ? 'white' : '#333',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 5px rgba(0,0,0,0.3)'
          }}
        >
          <CloudRain className="w-4 h-4" />
        </button>
      </div>

      {/* Control panel */}
      {visible && (
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: 'rgba(26, 32, 44, 0.92)',
            borderRadius: '10px',
            padding: '10px 16px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            minWidth: '320px',
            maxWidth: '90vw',
            backdropFilter: 'blur(8px)'
          }}
        >
          {loading ? (
            <div style={{ color: '#a0aec0', fontSize: '12px', textAlign: 'center', padding: '4px' }}>
              Loading radar data...
            </div>
          ) : error ? (
            <div style={{ color: '#fc8181', fontSize: '12px', textAlign: 'center', padding: '4px' }}>
              {error}
            </div>
          ) : (
            <>
              {/* Top row: label + timestamp */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CloudRain className="w-3 h-3" style={{ color: '#63b3ed' }} />
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#e2e8f0' }}>Live Radar</span>
                  <span style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: frameLabel.color,
                    color: 'white'
                  }}>
                    {frameLabel.text}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: '#a0aec0' }}>
                  {currentFrame ? formatTimestamp(currentFrame.time) : ''}
                </span>
              </div>

              {/* Playback controls + scrubber */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => setCurrentIndex(prev => (prev - 1 + frames.length) % frames.length)}
                  style={{ background: 'none', border: 'none', color: '#e2e8f0', cursor: 'pointer', padding: '2px' }}
                  title="Previous frame"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  style={{
                    background: isPlaying ? '#e53e3e' : '#38a169',
                    border: 'none',
                    color: 'white',
                    cursor: 'pointer',
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" style={{ marginLeft: '2px' }} />}
                </button>
                <button
                  onClick={() => setCurrentIndex(prev => (prev + 1) % frames.length)}
                  style={{ background: 'none', border: 'none', color: '#e2e8f0', cursor: 'pointer', padding: '2px' }}
                  title="Next frame"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>

                {/* Frame scrubber */}
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, frames.length - 1)}
                  value={currentIndex}
                  onChange={(e) => {
                    setCurrentIndex(parseInt(e.target.value));
                    setIsPlaying(false);
                  }}
                  style={{ flex: 1, accentColor: '#63b3ed' }}
                />

                {/* Speed button */}
                <button
                  onClick={() => setSpeedIndex(prev => (prev + 1) % SPEEDS.length)}
                  title={`Speed: ${SPEEDS[speedIndex]}ms`}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '9px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap'
                  }}
                >
                  {speedIndex === 0 ? '2x' : speedIndex === 1 ? '1x' : speedIndex === 2 ? '0.5x' : '0.3x'}
                </button>
              </div>

              {/* Opacity control */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <span style={{ fontSize: '9px', color: '#a0aec0', minWidth: '42px' }}>
                  Opacity {Math.round(opacity * 100)}%
                </span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={opacity * 100}
                  onChange={(e) => setOpacity(parseInt(e.target.value) / 100)}
                  style={{ flex: 1, accentColor: '#63b3ed' }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* The radar tile layer */}
      {visible && currentFrame && (
        <TileLayer
          key={currentFrame.path}
          url={`${TILE_BASE}${currentFrame.path}${TILE_SUFFIX}`}
          opacity={opacity}
          zIndex={501}
          attribution='<a href="https://rainviewer.com">RainViewer</a>'
        />
      )}
    </>
  );
};

export default RainViewerRadarLayer;
