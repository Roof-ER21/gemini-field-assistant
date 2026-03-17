import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

interface HeatmapLayerProps {
  points: Array<[number, number, number]>; // [lat, lng, intensity]
  visible: boolean;
  radius?: number;
  blur?: number;
  maxZoom?: number;
  gradient?: Record<number, string>;
}

export default function HeatmapLayer({
  points,
  visible,
  radius = 25,
  blur = 15,
  maxZoom = 13,
  gradient = { 0.2: '#22c55e', 0.4: '#eab308', 0.6: '#f97316', 0.8: '#ef4444', 1.0: '#991b1b' }
}: HeatmapLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (!visible || points.length === 0) return;

    const heat = (L as any).heatLayer(points, {
      radius,
      blur,
      maxZoom,
      gradient,
      minOpacity: 0.3,
      max: 3.0 // normalize against ~3" max hail
    });

    heat.addTo(map);

    return () => {
      map.removeLayer(heat);
    };
  }, [map, points, visible, radius, blur, maxZoom]);

  return null;
}
