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
import { getHailColor } from './hailPalette';

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

// Hail size → color. getHailColor imported at top; sourced from the canonical
// palette so contour fills, vector-swath polygons, raster tiles, and legend
// all agree on bin boundaries and colors.

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

// Deterministic noise seeded by event coordinates — produces organic-looking variation
// without randomness so the same event always renders the same shape.
function seededNoise(seed: number, index: number): number {
  const x = Math.sin(seed * 127.1 + index * 311.7) * 43758.5453;
  return x - Math.floor(x); // 0..1
}

function organicRadius(baseRadius: number, angle: number, seed: number): number {
  // Layer 3 sine waves at different frequencies for natural variation (±25%)
  const n1 = Math.sin(angle * 2.3 + seed * 1.7) * 0.12;
  const n2 = Math.sin(angle * 4.1 + seed * 3.2) * 0.08;
  const n3 = Math.sin(angle * 7.9 + seed * 0.3) * 0.05;
  return baseRadius * (1.0 + n1 + n2 + n3);
}

// Build organic capsule along storm travel path, or organic blob if no travel
function sampleEventFootprint(event: ClusterEvent, refLat: number, refLng: number): ProjectedPoint[] {
  const begin = toProjectedPoint(event.beginLat, event.beginLon, refLat, refLng);
  // Seed from coordinates for deterministic but varied shapes per event
  const seed = Math.abs(event.beginLat * 1000 + event.beginLon * 777);

  const hasEnd =
    Number.isFinite(event.endLat) && Number.isFinite(event.endLon) &&
    (Math.abs(event.endLat - event.beginLat) > 0.001 || Math.abs(event.endLon - event.beginLon) > 0.001);

  // Determine an elongation direction: use storm track if available, otherwise derive from seed
  const elongAngle = hasEnd
    ? Math.atan2(event.endLat - event.beginLat, event.endLon - event.beginLon)
    : (seededNoise(seed, 0) * Math.PI * 2);
  // Storms are typically elongated 1.2–1.6x along travel axis
  const elongation = 1.2 + seededNoise(seed, 1) * 0.4;

  if (!hasEnd) {
    // No travel path — organic blob (not a perfect circle)
    const ring: ProjectedPoint[] = [];
    const steps = 28; // more points for smoother organic shape
    for (let i = 0; i < steps; i++) {
      const angle = (Math.PI * 2 * i) / steps;
      const r = organicRadius(event.radiusMiles, angle, seed);
      // Apply elongation along the derived storm axis
      const cosA = Math.cos(angle - elongAngle);
      const sinA = Math.sin(angle - elongAngle);
      const rElongated = r * Math.sqrt((elongation * cosA) ** 2 + sinA ** 2) / Math.sqrt(cosA ** 2 + sinA ** 2);
      ring.push({ x: begin.x + Math.cos(angle) * rElongated, y: begin.y + Math.sin(angle) * rElongated });
    }
    return ring;
  }

  // Stadium shape along begin→end path with organic edges
  const end = toProjectedPoint(event.endLat, event.endLon, refLat, refLng);
  const dx = end.x - begin.x;
  const dy = end.y - begin.y;
  const pathAngle = Math.atan2(dy, dx);
  const halfWidth = event.radiusMiles;
  const points: ProjectedPoint[] = [];
  const arcSteps = 14; // more points for organic arcs

  // Semicircle around begin (facing away from end) with organic variation
  for (let i = 0; i <= arcSteps; i++) {
    const a = pathAngle + Math.PI / 2 + (Math.PI * i) / arcSteps;
    const r = organicRadius(halfWidth, a, seed);
    points.push({ x: begin.x + Math.cos(a) * r, y: begin.y + Math.sin(a) * r });
  }

  // Semicircle around end (facing away from begin) with organic variation
  for (let i = 0; i <= arcSteps; i++) {
    const a = pathAngle - Math.PI / 2 + (Math.PI * i) / arcSteps;
    const r = organicRadius(halfWidth, a, seed + 100);
    points.push({ x: end.x + Math.cos(a) * r, y: end.y + Math.sin(a) * r });
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
  const hull = [...lower, ...upper];

  // Smooth hull with Chaikin subdivision for organic curves (2 passes)
  return chaikinSmooth(chaikinSmooth(hull));
}

// Chaikin's corner-cutting: replaces each edge with 2 points at 25%/75%,
// producing smooth curves that converge toward a B-spline.
function chaikinSmooth(points: ProjectedPoint[]): ProjectedPoint[] {
  if (points.length < 3) return points;
  const result: ProjectedPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    result.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
    result.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  return result;
}

export default function HailContourLayer({ visible, events }: HailContourLayerProps) {
  const contours = useMemo(() => {
    if (!visible) return [];

    const hailEvents = events
      .map(e => ({
        ...e,
        beginLat: Number(e.beginLat),
        beginLon: Number(e.beginLon),
        endLat: Number(e.endLat) || Number(e.beginLat),
        endLon: Number(e.endLon) || Number(e.beginLon),
        magnitude: Number(e.magnitude) || 0,
      }))
      .filter((e) => {
        const isHail = e.eventType?.toLowerCase().includes('hail');
        const hasCoords = Number.isFinite(e.beginLat) && Number.isFinite(e.beginLon) && e.beginLat !== 0;
        return isHail && hasCoords;
      });


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

    return result;
  }, [visible, events]);
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
            fillOpacity: 0.4,
            weight: 0,
            opacity: 0,
          }}
        />
      ))}
    </>
  );
}
