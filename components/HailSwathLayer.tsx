/**
 * Hail Swath Layer — Real MRMS MESH data from National Hail Project
 *
 * Fetches actual hail swath polylines from NHP's free ArcGIS FeatureServer
 * and renders them as colored paths on the map with severity gradients.
 *
 * Data source: National Hail Project (Western University)
 * https://nhp-open-data-site-westernu.hub.arcgis.com/
 *
 * No API key required. Free public data.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Polyline, Popup, useMap } from 'react-leaflet';
import { getHailSizeClass } from './stormMapHelpers';

interface HailSwath {
  id: number;
  maxMesh: number; // mm
  maxMeshInches: number;
  length: number;
  maxWidth: number;
  startDate: string;
  endDate: string;
  coordinates: [number, number][]; // [lat, lng]
  severity: 'minor' | 'moderate' | 'severe' | 'extreme';
}

interface HailSwathLayerProps {
  visible: boolean;
  selectedDate?: string | null; // ISO date string to filter by
  onSwathClick?: (swath: HailSwath) => void;
}

function getMeshSeverity(meshMm: number): HailSwath['severity'] {
  if (meshMm >= 75) return 'extreme';   // 3"+ hail
  if (meshMm >= 50) return 'severe';     // 2"+ hail
  if (meshMm >= 25) return 'moderate';   // 1"+ hail
  return 'minor';
}

function getSwathColor(meshInches: number): string {
  return getHailSizeClass(meshInches)?.color || '#f97316';
}

function getSwathWeight(selectedDate: string | null | undefined, severity: HailSwath['severity']): number {
  if (selectedDate) {
    switch (severity) {
      case 'extreme':
        return 6;
      case 'severe':
        return 5;
      case 'moderate':
        return 4;
      case 'minor':
        return 3.5;
    }
  }

  switch (severity) {
    case 'extreme':
      return 5;
    case 'severe':
      return 4;
    case 'moderate':
      return 3.5;
    case 'minor':
      return 3;
  }
}

function isSameOrAdjacentDate(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const aDate = new Date(`${a}T12:00:00Z`);
  const bDate = new Date(`${b}T12:00:00Z`);
  if (Number.isNaN(aDate.getTime()) || Number.isNaN(bDate.getTime())) {
    return false;
  }
  const diffDays = Math.abs(aDate.getTime() - bDate.getTime()) / (24 * 60 * 60 * 1000);
  return diffDays <= 1;
}

const NHP_FEATURE_SERVER = 'https://services.arcgis.com/rGKxabTU9mcXMw7k/arcgis/rest/services/HailSwathMESH_Lines_view/FeatureServer/0/query';

const HailSwathLayer: React.FC<HailSwathLayerProps> = ({
  visible,
  selectedDate,
  onSwathClick
}) => {
  const map = useMap();
  const [swaths, setSwaths] = useState<HailSwath[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastBounds, setLastBounds] = useState<string>('');

  // Fetch swaths for the current map bounds
  const fetchSwaths = useCallback(async () => {
    if (!visible) return;

    const bounds = map.getBounds();
    const boundsKey = `${bounds.getSouth().toFixed(2)},${bounds.getWest().toFixed(2)},${bounds.getNorth().toFixed(2)},${bounds.getEast().toFixed(2)}`;

    // Don't refetch if bounds haven't changed significantly
    if (boundsKey === lastBounds) return;
    setLastBounds(boundsKey);

    setLoading(true);
    try {
      // Build ArcGIS REST API query
      const params = new URLSearchParams({
        where: '1=1',
        outFields: 'FID,Start_Date,End_DateTi,MaxWidth__,MaxWidth_4,HailLength,Shape__Length',
        geometry: JSON.stringify({
          xmin: bounds.getWest(),
          ymin: bounds.getSouth(),
          xmax: bounds.getEast(),
          ymax: bounds.getNorth(),
          spatialReference: { wkid: 4326 }
        }),
        geometryType: 'esriGeometryEnvelope',
        spatialRel: 'esriSpatialRelIntersects',
        inSR: '4326',
        outSR: '4326',
        f: 'geojson',
        resultRecordCount: '500'
      });

      const res = await fetch(`${NHP_FEATURE_SERVER}?${params}`, {
        signal: AbortSignal.timeout(15000)
      });

      if (!res.ok) {
        console.warn('NHP FeatureServer error:', res.status);
        return;
      }

      const data = await res.json();

      if (!data.features || data.features.length === 0) {
        setSwaths([]);
        return;
      }

      const parsed: HailSwath[] = data.features
        .filter((f: any) => {
          if (!f.geometry || !f.geometry.coordinates) return false;
          const meshMm = Number(f.properties?.MaxWidth_4 || 0);
          return meshMm != null && meshMm > 0;
        })
        .map((f: any) => {
          const props = f.properties;
          const meshMm = Number(props.MaxWidth_4 || 0);
          const meshInches = meshMm / 25.4;

          // Convert GeoJSON coordinates [lng, lat] to Leaflet [lat, lng]
          let coords: [number, number][] = [];
          if (f.geometry.type === 'MultiLineString') {
            coords = f.geometry.coordinates.flatMap((line: number[][]) =>
              line.map((c: number[]) => [c[1], c[0]] as [number, number])
            );
          } else if (f.geometry.type === 'LineString') {
            coords = f.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number]);
          }

          // Convert epoch ms timestamp to a local YYYY-MM-DD date string.
          // Using toISOString() would give UTC midnight which shifts the date
          // by -1 day in US timezones.  We store the raw epoch value and
          // derive the date string on comparison instead, so we keep both.
          const startEpoch = props.Start_Date ? Number(props.Start_Date) : null;
          const endEpoch = props.End_DateTi ? Number(props.End_DateTi) : null;

          // Local date string: format as YYYY-MM-DD in the local (browser) TZ
          const toLocalDateStr = (epoch: number | null): string => {
            if (!epoch) return '';
            const d = new Date(epoch);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
          };

          return {
            id: props.FID ?? f.id,
            maxMesh: meshMm,
            maxMeshInches: meshInches,
            length: Number(props.Shape__Length || props.HailLength || 0),
            maxWidth: Number(props.MaxWidth_4 || props.MaxWidth__ || 0),
            startDate: toLocalDateStr(startEpoch),
            endDate: toLocalDateStr(endEpoch),
            coordinates: coords,
            severity: getMeshSeverity(meshMm)
          };
        })
        .filter((s: HailSwath) => s.coordinates.length >= 2);

      setSwaths(parsed);
    } catch (err) {
      console.error('Failed to fetch hail swaths:', err);
    } finally {
      setLoading(false);
    }
  }, [visible, map, lastBounds]);

  // Fetch on visibility change and map move
  useEffect(() => {
    if (!visible) return;

    fetchSwaths();

    const onMoveEnd = () => fetchSwaths();
    map.on('moveend', onMoveEnd);

    return () => {
      map.off('moveend', onMoveEnd);
    };
  }, [visible, fetchSwaths, map]);

  // Filter by selected date if provided.
  // startDate is now stored as a plain YYYY-MM-DD local-timezone string so we
  // can compare directly without any split or UTC conversion.
  const filteredSwaths = useMemo(() => {
    if (!selectedDate) return swaths;
    return swaths.filter((s) =>
      isSameOrAdjacentDate(s.startDate, selectedDate) || isSameOrAdjacentDate(s.endDate, selectedDate),
    );
  }, [swaths, selectedDate]);

  if (!visible) return null;

  return (
    <>
      {loading && swaths.length === 0 && (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '6px 14px',
          borderRadius: '20px',
          fontSize: '11px',
          fontWeight: 600
        }}>
          Loading MESH hail swaths...
        </div>
      )}

      {!loading && visible && filteredSwaths.length === 0 && (
        <div style={{
          position: 'absolute',
          top: '46px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'rgba(15,23,42,0.88)',
          color: '#e2e8f0',
          padding: '6px 14px',
          borderRadius: '20px',
          fontSize: '11px',
          fontWeight: 600
        }}>
          {selectedDate
            ? 'No swath track matched this storm date in the current view.'
            : 'No swath tracks found in the current map view.'}
        </div>
      )}

      {filteredSwaths.map(swath => {
        const color = getSwathColor(swath.maxMeshInches);
        const weight = getSwathWeight(selectedDate, swath.severity);
        const opacity = selectedDate ? 0.96 : 0.82;

        return (
          <React.Fragment key={swath.id}>
            <Polyline
              positions={swath.coordinates}
              pathOptions={{
                color: color,
                weight,
                opacity,
                lineCap: 'round',
                lineJoin: 'round'
              }}
              eventHandlers={{
                click: () => onSwathClick?.(swath)
              }}
            >
            <Popup maxWidth={280} maxHeight={200} autoPan={true} autoPanPadding={[40, 40]}>
              <div style={{ padding: '6px', fontFamily: 'system-ui' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>
                  MESH Hail Swath
                </div>
                <div style={{ fontSize: '12px', lineHeight: 1.6 }}>
                  <div>
                    <strong>Max Hail:</strong>{' '}
                    <span style={{ color, fontWeight: 700 }}>
                      {swath.maxMeshInches.toFixed(1)}" ({swath.maxMesh.toFixed(0)}mm)
                    </span>
                  </div>
                  <div><strong>Severity:</strong> <span style={{ color, textTransform: 'uppercase', fontWeight: 600, fontSize: '11px' }}>{swath.severity}</span></div>
                  {swath.length > 0 && <div><strong>Length:</strong> {(swath.length / 1000).toFixed(1)} km</div>}
                  {swath.maxWidth > 0 && <div><strong>Max Width:</strong> {(swath.maxWidth / 1000).toFixed(1)} km</div>}
                  {swath.startDate && (
                    <div><strong>Date:</strong> {new Date(swath.startDate + 'T12:00:00').toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York'
                    })}</div>
                  )}
                </div>
                <div style={{ fontSize: '9px', color: '#888', marginTop: '6px' }}>
                  Source: National Hail Project track geometry. This is rendered as a storm track, not a fabricated filled footprint.
                </div>
              </div>
            </Popup>
          </Polyline>
          </React.Fragment>
        );
      })}
    </>
  );
};

export default HailSwathLayer;
