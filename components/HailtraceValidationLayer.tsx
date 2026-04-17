/**
 * HailtraceValidationLayer — overlays HailTrace meteorologist-graded hail
 * points on top of our MRMS vector polygons and color-codes each point by
 * whether the two data sources agree.
 *
 * For reps this is a trust signal: a map full of green dots means our
 * automated pipeline matches $600/yr human-verified data. A red dot is a
 * "look at this one more carefully" flag.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CircleMarker, Popup } from 'react-leaflet';
import { getApiBaseUrl } from '../services/config';

interface HailtraceValidation {
  eventId: string;
  lat: number;
  lng: number;
  hailtraceSizeInches: number;
  mrmsSizeInches: number | null;
  mrmsLabel: string | null;
  mrmsColor: string | null;
  difference: number | null;
  agreement: 'match' | 'close' | 'diverge' | 'mrms_miss' | 'hailtrace_only';
  hasMeteorologist: boolean;
  windSpeed: number | null;
  windStarLevel: number | null;
}

interface ValidationResponse {
  date: string;
  bounds: { north: number; south: number; east: number; west: number };
  totals: {
    hailtracePoints: number;
    mrmsFeatures: number;
    match: number;
    close: number;
    diverge: number;
    mrmsMiss: number;
    hailtraceOnly: number;
  };
  avgDifference: number | null;
  maxDifference: number | null;
  mrmsPeakInches: number;
  hailtracePeakInches: number;
  points: HailtraceValidation[];
}

interface HailtraceValidationLayerProps {
  visible: boolean;
  selectedDate: string | null;
  stormBounds: { north: number; south: number; east: number; west: number } | null;
  anchorTimestamp?: string | null;
  /** Callback on data load so parent can show a summary badge. */
  onDataLoaded?: (summary: ValidationResponse | null) => void;
}

const apiBaseUrl = getApiBaseUrl();

// Agreement → color. Match = green, close = yellow, diverge = red, mrms_miss = orange.
const AGREEMENT_STYLE: Record<HailtraceValidation['agreement'], { color: string; label: string }> = {
  match: { color: '#22c55e', label: 'Match (≤¼")' },
  close: { color: '#eab308', label: 'Close (≤½")' },
  diverge: { color: '#dc2626', label: 'Diverge (>½")' },
  mrms_miss: { color: '#f97316', label: 'MRMS miss' },
  hailtrace_only: { color: '#a855f7', label: 'HailTrace only' },
};

export default function HailtraceValidationLayer({
  visible,
  selectedDate,
  stormBounds,
  anchorTimestamp,
  onDataLoaded,
}: HailtraceValidationLayerProps) {
  const [data, setData] = useState<ValidationResponse | null>(null);
  const lastFetchKeyRef = useRef<string>('');
  const onDataLoadedRef = useRef(onDataLoaded);

  useEffect(() => {
    onDataLoadedRef.current = onDataLoaded;
  }, [onDataLoaded]);

  const fetchData = useCallback(async () => {
    if (!visible || !selectedDate || !stormBounds) {
      setData(null);
      onDataLoadedRef.current?.(null);
      return;
    }

    const key = `${selectedDate}|${JSON.stringify(stormBounds)}|${anchorTimestamp || ''}`;
    if (key === lastFetchKeyRef.current) return;
    lastFetchKeyRef.current = key;

    try {
      const params = new URLSearchParams({
        date: selectedDate,
        north: String(stormBounds.north),
        south: String(stormBounds.south),
        east: String(stormBounds.east),
        west: String(stormBounds.west),
        ...(anchorTimestamp ? { anchorTimestamp } : {}),
      });
      const res = await fetch(
        `${apiBaseUrl}/api/hail/hailtrace-validation?${params}`,
        { signal: AbortSignal.timeout(45000) },
      );
      if (!res.ok) throw new Error(`HT validation ${res.status}`);
      const json: ValidationResponse = await res.json();
      setData(json);
      onDataLoadedRef.current?.(json);
    } catch (err) {
      console.error('[HailtraceValidation] fetch failed:', err);
      setData(null);
      onDataLoadedRef.current?.(null);
    }
  }, [visible, selectedDate, stormBounds, anchorTimestamp]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!visible || !data || data.points.length === 0) return null;

  return (
    <>
      {data.points.map((p) => {
        const style = AGREEMENT_STYLE[p.agreement];
        return (
          <CircleMarker
            key={p.eventId}
            center={[p.lat, p.lng]}
            radius={7}
            pathOptions={{
              color: '#ffffff',
              fillColor: style.color,
              fillOpacity: 0.92,
              weight: 2,
            }}
          >
            <Popup>
              <div style={{ minWidth: 200, fontFamily: 'system-ui, sans-serif' }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 700,
                  marginBottom: 6,
                  color: style.color,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <span style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: style.color,
                  }} />
                  {style.label}
                </div>
                <div style={{ fontSize: 11, color: '#555', lineHeight: 1.55 }}>
                  <div>
                    <strong>HailTrace:</strong> {p.hailtraceSizeInches.toFixed(2)}"{' '}
                    {p.hasMeteorologist
                      ? <span style={{ color: '#16a34a' }}>(meteorologist)</span>
                      : <span style={{ color: '#6b7280' }}>(algorithm only)</span>}
                  </div>
                  <div>
                    <strong>MRMS radar:</strong>{' '}
                    {p.mrmsSizeInches !== null
                      ? `≥ ${p.mrmsLabel}`
                      : <span style={{ color: '#6b7280' }}>no polygon at point</span>}
                  </div>
                  {p.difference !== null && (
                    <div>
                      <strong>Difference:</strong> {p.difference.toFixed(2)}"
                    </div>
                  )}
                  {p.windSpeed !== null && (
                    <div>
                      <strong>Wind:</strong> {p.windSpeed} mph
                      {p.windStarLevel !== null && ` (${p.windStarLevel}/5 ★)`}
                    </div>
                  )}
                </div>
                {p.agreement === 'diverge' && (
                  <div style={{
                    marginTop: 6,
                    padding: '4px 8px',
                    fontSize: 10,
                    backgroundColor: '#fef2f2',
                    borderRadius: 4,
                    color: '#b91c1c',
                  }}>
                    ⚠ Worth double-checking — sources disagree by more than ½"
                  </div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}
