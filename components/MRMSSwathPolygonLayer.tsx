/**
 * MRMS Swath Polygon Layer — Vector hail swath polygons on Leaflet map
 *
 * Renders MRMS MESH data as crisp, clickable vector polygons at up to
 * 10 forensic hail size levels. Replaces the blurry raster PNG overlay
 * with IHM/HailTrace-quality swath visualization.
 *
 * Data source: Same IEM MTArchive MRMS GRIB2 data, processed through
 * d3-contour (marching squares) server-side into GeoJSON polygons.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GeoJSON, Popup, useMap } from 'react-leaflet';
import type { Layer, LeafletMouseEvent } from 'leaflet';
import { getApiBaseUrl } from '../services/config';

interface SwathProperties {
  level: number;
  sizeInches: number;
  sizeMm: number;
  label: string;
  color: string;
  severity: string;
}

interface SwathFeature {
  type: 'Feature';
  properties: SwathProperties;
  geometry: {
    type: 'MultiPolygon';
    coordinates: number[][][][];
  };
}

interface SwathCollection {
  type: 'FeatureCollection';
  features: SwathFeature[];
  metadata: {
    date: string;
    refTime: string;
    maxMeshInches: number;
    hailCells: number;
    bounds: { north: number; south: number; east: number; west: number };
    sourceFiles: string[];
    generatedAt: string;
  };
}

interface MRMSSwathPolygonLayerProps {
  visible: boolean;
  selectedDate?: string | null;
  stormBounds?: { north: number; south: number; east: number; west: number } | null;
  anchorTimestamp?: string | null;
  opacity?: number;
  /**
   * Called when swath data finishes loading. `hasFeatures=true` means we have
   * real vector polygons to show — caller should hide the blurry raster
   * MRMSHailOverlay. `hasFeatures=false` means no hail data was found, so the
   * raster should stay visible as a fallback.
   */
  onDataLoaded?: (hasFeatures: boolean) => void;
}

const apiBaseUrl = getApiBaseUrl();

const MRMSSwathPolygonLayer: React.FC<MRMSSwathPolygonLayerProps> = ({
  visible,
  selectedDate,
  stormBounds,
  anchorTimestamp,
  opacity = 0.55,
  onDataLoaded,
}) => {
  const map = useMap();
  const [data, setData] = useState<SwathCollection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clickInfo, setClickInfo] = useState<{ lat: number; lng: number; props: SwathProperties } | null>(null);
  const lastFetchKey = useRef<string>('');

  const shouldShow = visible && !!selectedDate && !!stormBounds;

  const fetchPolygons = useCallback(async () => {
    if (!selectedDate || !stormBounds) return;

    const fetchKey = `${selectedDate}-${anchorTimestamp || ''}-${JSON.stringify(stormBounds)}`;
    if (fetchKey === lastFetchKey.current) return;
    lastFetchKey.current = fetchKey;

    setLoading(true);
    setError(null);
    setClickInfo(null);

    try {
      const params = new URLSearchParams({
        date: selectedDate,
        north: String(stormBounds.north),
        south: String(stormBounds.south),
        east: String(stormBounds.east),
        west: String(stormBounds.west),
        ...(anchorTimestamp ? { anchorTimestamp } : {}),
      });

      const res = await fetch(`${apiBaseUrl}/hail/mrms-swath-polygons?${params}`, {
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const json: SwathCollection = await res.json();
      setData(json);
      onDataLoaded?.(json.features.length > 0);
    } catch (err) {
      console.error('Failed to fetch swath polygons:', err);
      setError((err as Error).message);
      setData(null);
      onDataLoaded?.(false);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, stormBounds, anchorTimestamp, onDataLoaded]);

  useEffect(() => {
    if (shouldShow) {
      fetchPolygons();
    } else {
      setData(null);
      lastFetchKey.current = '';
      onDataLoaded?.(false);
    }
  }, [shouldShow, fetchPolygons, onDataLoaded]);

  if (!shouldShow || !data || data.features.length === 0) {
    return null;
  }

  // Style each polygon based on its hail level
  const styleFeature = (feature: any) => {
    const props = feature.properties as SwathProperties;
    return {
      fillColor: props.color,
      fillOpacity: opacity,
      color: props.color,
      weight: 0.8,
      opacity: opacity + 0.15,
    };
  };

  // Handle click on polygon — show hail info popup
  const onEachFeature = (feature: any, layer: Layer) => {
    const props = feature.properties as SwathProperties;

    layer.on('click', (e: LeafletMouseEvent) => {
      setClickInfo({
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        props,
      });
    });

    layer.on('mouseover', (e: LeafletMouseEvent) => {
      (layer as any).setStyle({
        fillOpacity: Math.min(opacity + 0.2, 0.85),
        weight: 2,
      });
    });

    layer.on('mouseout', () => {
      (layer as any).setStyle(styleFeature({ properties: props }));
    });
  };

  // Severity label for popup
  const severityLabel = (severity: string): string => {
    switch (severity) {
      case 'trace': return 'Trace';
      case 'minor': return 'Minor';
      case 'moderate': return 'Moderate';
      case 'severe': return 'Severe';
      case 'very_severe': return 'Very Severe';
      case 'extreme': return 'Extreme';
      default: return severity;
    }
  };

  return (
    <>
      {/* Render each level as a separate GeoJSON layer for proper z-ordering.
          Lower levels (larger area, lighter color) render first,
          higher levels (smaller area, darker color) render on top. */}
      {data.features.map((feature, index) => (
        <GeoJSON
          key={`swath-${selectedDate}-${feature.properties.level}-${index}`}
          data={feature as any}
          style={() => styleFeature(feature)}
          onEachFeature={onEachFeature}
        />
      ))}

      {/* Click popup showing hail info */}
      {clickInfo && (
        <Popup
          position={[clickInfo.lat, clickInfo.lng]}
          eventHandlers={{
            remove: () => setClickInfo(null),
          }}
        >
          <div style={{ minWidth: 180, fontFamily: 'system-ui, sans-serif' }}>
            <div style={{
              fontSize: '14px',
              fontWeight: 700,
              marginBottom: 6,
              color: clickInfo.props.color,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <span style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                backgroundColor: clickInfo.props.color,
                display: 'inline-block',
                border: '1px solid rgba(0,0,0,0.2)',
              }} />
              {clickInfo.props.label} Hail
            </div>
            <div style={{ fontSize: '12px', color: '#555', lineHeight: 1.6 }}>
              <div><strong>Size:</strong> {clickInfo.props.sizeInches}" ({clickInfo.props.sizeMm.toFixed(0)}mm)</div>
              <div><strong>Severity:</strong> {severityLabel(clickInfo.props.severity)}</div>
              <div><strong>Date:</strong> {selectedDate}</div>
              <div><strong>Source:</strong> MRMS MESH Radar</div>
            </div>
            {clickInfo.props.sizeInches >= 1.0 && (
              <div style={{
                marginTop: 6,
                padding: '4px 8px',
                fontSize: '11px',
                backgroundColor: '#fff3cd',
                borderRadius: 4,
                color: '#856404',
              }}>
                {clickInfo.props.sizeInches >= 1.75
                  ? '⚠ Above insurance claim threshold in most states'
                  : '⚠ May qualify for insurance claim — verify on site'}
              </div>
            )}
          </div>
        </Popup>
      )}

      {/* Loading indicator */}
      {loading && (
        <div style={{
          position: 'absolute',
          top: 60,
          right: 60,
          zIndex: 1000,
          background: 'rgba(0,0,0,0.75)',
          color: 'white',
          padding: '6px 12px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
        }}>
          Loading swath polygons...
        </div>
      )}
    </>
  );
};

export default MRMSSwathPolygonLayer;
