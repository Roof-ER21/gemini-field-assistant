/**
 * HailContourLayer — Generates smooth hail swath contours from ground report data.
 * Ported from storm-maps HistoricalHailContourLayer (Google Maps → Leaflet).
 *
 * Algorithm:
 * 1. Clusters nearby hail events by proximity
 * 2. Builds capsule/stadium shapes along storm travel paths (begin→end coords)
 * 3. Creates convex hull polygon around all shapes in a cluster
 * 4. Renders as semi-transparent colored polygons on the map
 */

import { useMemo } from 'react';
import { Polygon } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';

interface StormEvent {
  id: string;
  eventType: string;
  beginLat: number;
  beginLon: number;
  endLat: number;
  endLon: number;
  magnitude: number;
}

interface HailContourLayerProps {
  visible: boolean;
  events: StormEvent[];
}

interface ProjectedPoint {
  x: number;
  y: number;
}

interface ClusterEvent extends StormEvent {
  radiusMiles: number;
}

// Hail size → impact radius in miles (matches IHM/HailTrace)
// Minimum 3mi ensures visible polygons even for single-point events
function getRadiusMiles(magnitudeInches: number): number {
  const mag = Number(magnitudeInches) || 0;
  if (mag >= 3) return 8;
  if (mag >= 2.5) return 6;
  if (mag >= 2) return 5;
  if (mag >= 1.5) return 4;
  if (mag >= 1) return 3.5;
  return 3;
}

// Hail size → color (matches existing HAIL_SIZE_CLASSES)
function getHailColor(magnitudeInches: number): string {
  if (magnitudeInches >= 4.5) return '#800080';  // purple — softball+
  if (magnitudeInches >= 2.5) return '#8B0000';  // dark red — baseball+
  if (magnitudeInches >= 1.75) return '#FF0000'; // red — golf ball+
  if (magnitudeInches >= 1.5) return '#FF6600';  // dark orange
  if (magnitudeInches >= 1.0) return '#FF9900';  // orange — quarter+
  if (magnitudeInches >= 0.75) return '#FFFF00'; // yellow
  if (magnitudeInches >= 0.25) return '#00FF00'; // green
  return '#90EE90'; // light green — trace
}

function getDistanceMiles(a: StormEvent, b: StormEvent): number {
  const meanLat = ((a.beginLat + b.beginLat) / 2) * (Math.PI / 180);
  const milesPerLat = 69;
  const milesPerLng = 69 * Math.cos(meanLat);
  const dx = (a.beginLon - b.beginLon) * milesPerLng;
  const dy = (a.beginLat - b.beginLat) * milesPerLat;
  return Math.hypot(dx, dy);
}

// Cluster nearby events into groups (events within threshold miles of any cluster member)
function clusterEvents(events: StormEvent[]): ClusterEvent[][] {
  const clusters: ClusterEvent[][] = [];
  const visited = new Set<string>();

  for (const event of events) {
    if (visited.has(event.id)) continue;

    const seed: ClusterEvent = { ...event, magnitude: Number(event.magnitude) || 0, radiusMiles: getRadiusMiles(event.magnitude) };
    const cluster: ClusterEvent[] = [seed];
    visited.add(event.id);

    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const candidate of events) {
        if (visited.has(candidate.id)) continue;
        const candidateRadius = getRadiusMiles(candidate.magnitude);
        const threshold = Math.max(10, candidateRadius * 2.5);
        if (cluster.some((member) => getDistanceMiles(member, candidate) <= threshold)) {
          cluster.push({ ...candidate, radiusMiles: candidateRadius });
          visited.add(candidate.id);
          expanded = true;
        }
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

function toProjectedPoint(lat: number, lng: number, refLat: number, refLng: number): ProjectedPoint {
  const milesPerLat = 69;
  const milesPerLng = 69 * Math.cos((refLat * Math.PI) / 180);
  return { x: (lng - refLng) * milesPerLng, y: (lat - refLat) * milesPerLat };
}

function toLatLng(point: ProjectedPoint, refLat: number, refLng: number): [number, number] {
  const milesPerLat = 69;
  const milesPerLng = 69 * Math.cos((refLat * Math.PI) / 180);
  return [refLat + point.y / milesPerLat, refLng + point.x / milesPerLng];
}

// Build capsule (stadium shape) along storm travel path, or circle if no travel
function sampleEventFootprint(event: ClusterEvent, refLat: number, refLng: number): ProjectedPoint[] {
  const begin = toProjectedPoint(event.beginLat, event.beginLon, refLat, refLng);

  const hasEnd =
    Number.isFinite(event.endLat) && Number.isFinite(event.endLon) &&
    (Math.abs(event.endLat - event.beginLat) > 0.001 || Math.abs(event.endLon - event.beginLon) > 0.001);

  if (!hasEnd) {
    // No travel path — circle
    const ring: ProjectedPoint[] = [];
    const steps = 20;
    for (let i = 0; i < steps; i++) {
      const angle = (Math.PI * 2 * i) / steps;
      ring.push({ x: begin.x + Math.cos(angle) * event.radiusMiles, y: begin.y + Math.sin(angle) * event.radiusMiles });
    }
    return ring;
  }

  // Stadium shape along begin→end path
  const end = toProjectedPoint(event.endLat, event.endLon, refLat, refLng);
  const dx = end.x - begin.x;
  const dy = end.y - begin.y;
  const pathAngle = Math.atan2(dy, dx);
  const halfWidth = event.radiusMiles;
  const points: ProjectedPoint[] = [];
  const arcSteps = 10;

  // Semicircle around begin (facing away from end)
  for (let i = 0; i <= arcSteps; i++) {
    const a = pathAngle + Math.PI / 2 + (Math.PI * i) / arcSteps;
    points.push({ x: begin.x + Math.cos(a) * halfWidth, y: begin.y + Math.sin(a) * halfWidth });
  }

  // Semicircle around end (facing away from begin)
  for (let i = 0; i <= arcSteps; i++) {
    const a = pathAngle - Math.PI / 2 + (Math.PI * i) / arcSteps;
    points.push({ x: end.x + Math.cos(a) * halfWidth, y: end.y + Math.sin(a) * halfWidth });
  }

  return points;
}

function cross(o: ProjectedPoint, a: ProjectedPoint, b: ProjectedPoint): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function buildConvexHull(points: ProjectedPoint[]): ProjectedPoint[] {
  if (points.length <= 1) return points;

  const sorted = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);

  const lower: ProjectedPoint[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }

  const upper: ProjectedPoint[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

export default function HailContourLayer({ visible, events }: HailContourLayerProps) {
  const contours = useMemo(() => {
    if (!visible) return [];

    const hailEvents = events.filter(
      (e) => e.eventType === 'Hail' && Number.isFinite(e.beginLat) && Number.isFinite(e.beginLon),
    );

    console.log(`[HailContour] visible=${visible}, total=${events.length}, hail=${hailEvents.length}, mags=${hailEvents.slice(0,3).map(e => `${e.magnitude}(${typeof e.magnitude})`)}`);

    if (hailEvents.length === 0) return [];

    const result: Array<{ path: LatLngExpression[]; color: string; magnitude: number }> = [];

    for (const cluster of clusterEvents(hailEvents)) {
      if (cluster.length === 0) continue;

      const refLat = cluster.reduce((s, e) => s + e.beginLat, 0) / cluster.length;
      const refLng = cluster.reduce((s, e) => s + e.beginLon, 0) / cluster.length;

      const sampledPoints = cluster.flatMap((e) => sampleEventFootprint(e, refLat, refLng));
      const hull = buildConvexHull(sampledPoints);

      if (hull.length < 3) continue;

      const maxMag = Math.max(...cluster.map((e) => e.magnitude));
      const color = getHailColor(maxMag);
      const path = hull.map((p) => toLatLng(p, refLat, refLng) as LatLngExpression);

      result.push({ path, color, magnitude: maxMag });
    }

    console.log(`[HailContour] Built ${result.length} contour polygons`);
    return result;
  }, [visible, events]);

  console.log(`[HailContour] Rendering: visible=${visible}, contours=${contours.length}`);
  if (!visible || contours.length === 0) return null;

  return (
    <>
      {contours.map((contour, i) => (
        <Polygon
          key={`contour-${i}`}
          positions={contour.path}
          pathOptions={{
            color: contour.color,
            fillColor: contour.color,
            fillOpacity: 0.25,
            weight: 2.5,
            opacity: 0.85,
          }}
        />
      ))}
    </>
  );
}
