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
        outFields: 'OBJECTID,Max_MESH_Value_in_the_Hailswath,Hailswath_Length,Max_width_of_swath,Start_Date_Time,End_Date_Time',
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
          // Only include features with a valid MESH value — wind-only events
          // either have no MESH field or a zero/null value. The field name
          // explicitly says "Hailswath", so any feature here is already
          // hail-related, but we enforce meshMm > 0 to exclude wind reports
          // that may occasionally appear with a null MESH attribute.
          const meshMm = f.properties?.Max_MESH_Value_in_the_Hailswath;
          return meshMm != null && meshMm > 0;
        })
        .map((f: any) => {
          const props = f.properties;
          const meshMm = props.Max_MESH_Value_in_the_Hailswath || 0;
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
          const startEpoch = props.Start_Date_Time ? Number(props.Start_Date_Time) : null;
          const endEpoch = props.End_Date_Time ? Number(props.End_Date_Time) : null;

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
            id: props.OBJECTID,
            maxMesh: meshMm,
            maxMeshInches: meshInches,
            length: props.Hailswath_Length || 0,
            maxWidth: props.Max_width_of_swath || 0,
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
    return swaths.filter(s => s.startDate === selectedDate);
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
                      month: 'short', day: 'numeric', year: 'numeric'
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
