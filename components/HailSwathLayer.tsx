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

// MESH mm thresholds for severity colors
function getMeshSeverity(meshMm: number): HailSwath['severity'] {
  if (meshMm >= 75) return 'extreme';   // 3"+ hail
  if (meshMm >= 50) return 'severe';     // 2"+ hail
  if (meshMm >= 25) return 'moderate';   // 1"+ hail
  return 'minor';
}

function getSeverityColor(severity: HailSwath['severity']): string {
  switch (severity) {
    case 'extreme': return '#dc2626';  // red
    case 'severe': return '#ea580c';   // dark orange
    case 'moderate': return '#d97706'; // amber
    case 'minor': return '#65a30d';    // green
  }
}

function getSeverityWeight(severity: HailSwath['severity']): number {
  switch (severity) {
    case 'extreme': return 8;
    case 'severe': return 6;
    case 'moderate': return 4;
    case 'minor': return 3;
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
        .filter((f: any) => f.geometry && f.geometry.coordinates)
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

          return {
            id: props.OBJECTID,
            maxMesh: meshMm,
            maxMeshInches: meshInches,
            length: props.Hailswath_Length || 0,
            maxWidth: props.Max_width_of_swath || 0,
            startDate: props.Start_Date_Time ? new Date(props.Start_Date_Time).toISOString() : '',
            endDate: props.End_Date_Time ? new Date(props.End_Date_Time).toISOString() : '',
            coordinates: coords,
            severity: getMeshSeverity(meshMm)
          };
        })
        .filter((s: HailSwath) => s.coordinates.length >= 2);

      console.log(`✅ Loaded ${parsed.length} MESH hail swaths from NHP`);
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

  // Filter by selected date if provided
  const filteredSwaths = useMemo(() => {
    if (!selectedDate) return swaths;
    return swaths.filter(s => {
      if (!s.startDate) return false;
      return s.startDate.split('T')[0] === selectedDate;
    });
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
        const color = getSeverityColor(swath.severity);
        // Base width 12-24px depending on severity, looks like filled swath
        const baseWeight = swath.severity === 'extreme' ? 24 : swath.severity === 'severe' ? 18 : swath.severity === 'moderate' ? 14 : 10;

        return (
          <React.Fragment key={swath.id}>
            {/* Outer glow/border for depth */}
            <Polyline
              positions={swath.coordinates}
              pathOptions={{
                color: color,
                weight: baseWeight + 4,
                opacity: 0.15,
                lineCap: 'round',
                lineJoin: 'round'
              }}
              interactive={false}
            />
            {/* Main swath body */}
            <Polyline
              positions={swath.coordinates}
              pathOptions={{
                color: color,
                weight: baseWeight,
                opacity: 0.5,
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
                    <div><strong>Date:</strong> {new Date(swath.startDate).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric'
                    })}</div>
                  )}
                </div>
                <div style={{ fontSize: '9px', color: '#888', marginTop: '6px' }}>
                  Source: National Hail Project MRMS MESH
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
