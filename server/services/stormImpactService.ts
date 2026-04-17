/**
 * Storm Impact Service
 *
 * Given a storm date + a list of points (lat/lng), returns the maximum
 * MRMS-estimated hail size at each point by walking the vector swath
 * polygons from highest band to lowest.
 *
 * The polygons nest (2"+ is inside 1.5"+ is inside 1"+), so the highest
 * band that contains a point is its max estimated hail size.
 */

import type { Pool } from 'pg';
import { getHistoricalMrmsSwathPolygons } from './historicalMrmsService.js';
import type { SwathPolygonCollection, SwathPolygonFeature } from './meshVectorService.js';

export interface StormImpactPoint {
  id: string;
  lat: number;
  lng: number;
}

export interface StormImpactResult {
  id: string;
  /** Highest hail band containing this point, or null if the point was not inside any band. */
  maxHailInches: number | null;
  level: number | null;
  color: string | null;
  label: string | null;
  severity: string | null;
  /** True if the point falls inside at least the trace ≥½" band. */
  directHit: boolean;
}

export interface StormImpactResponse {
  date: string;
  anchorTimestamp: string | null;
  metadata: {
    stormMaxInches: number;
    stormHailCells: number;
    stormFeatureCount: number;
    pointsChecked: number;
    directHits: number;
  };
  results: StormImpactResult[];
}

// ---------------------------------------------------------------------------
// Ray-casting point-in-polygon (no external geo library needed)
// ---------------------------------------------------------------------------

/**
 * Classic ray-casting point-in-polygon for GeoJSON coordinates.
 * Ring is a closed loop of [lng, lat] pairs (first === last).
 */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * A GeoJSON Polygon's first ring is the outer boundary; subsequent rings
 * are holes. A point is "in" the polygon if it's in the outer ring and
 * not in any hole.
 */
function pointInPolygon(lng: number, lat: number, rings: number[][][]): boolean {
  if (rings.length === 0) return false;
  if (!pointInRing(lng, lat, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lng, lat, rings[i])) return false;
  }
  return true;
}

/** MultiPolygon containment = point is in at least one of its polygons. */
function pointInFeature(lng: number, lat: number, feature: SwathPolygonFeature): boolean {
  for (const polygon of feature.geometry.coordinates) {
    if (pointInPolygon(lng, lat, polygon)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Bounding box around a list of points, padded by ~50km so swath polygons
 * touching the fringes of the query area still get fetched.
 */
function pointsBoundingBox(points: StormImpactPoint[]): {
  north: number;
  south: number;
  east: number;
  west: number;
} {
  if (points.length === 0) {
    return { north: 50, south: 20, east: -60, west: -130 };
  }
  let north = -90, south = 90, east = -180, west = 180;
  for (const p of points) {
    if (p.lat > north) north = p.lat;
    if (p.lat < south) south = p.lat;
    if (p.lng > east) east = p.lng;
    if (p.lng < west) west = p.lng;
  }
  // ~0.5° pad covers ~35 miles around the point cluster; matches PDF overlay padding.
  const pad = 0.5;
  return { north: north + pad, south: south - pad, east: east + pad, west: west - pad };
}

/**
 * For each point, determine the maximum radar-estimated hail size at that
 * location for the given storm date. Walks features from highest band down
 * so we short-circuit on the highest-severity match.
 */
export async function computeStormImpact(
  params: {
    date: string;
    anchorTimestamp?: string | null;
    points: StormImpactPoint[];
    /** Optional explicit bounds; defaults to bounding box of the points. */
    bounds?: { north: number; south: number; east: number; west: number };
  },
  pool?: Pool,
): Promise<StormImpactResponse> {
  const { date, anchorTimestamp, points } = params;
  const bounds = params.bounds || pointsBoundingBox(points);

  const collection: SwathPolygonCollection = await getHistoricalMrmsSwathPolygons(
    {
      date,
      north: bounds.north,
      south: bounds.south,
      east: bounds.east,
      west: bounds.west,
      anchorTimestamp: anchorTimestamp ?? null,
    },
    pool,
  );

  // Sort features by threshold DESC so we find the highest-severity band a point is in first.
  const featuresDesc = [...collection.features].sort(
    (a, b) => b.properties.sizeInches - a.properties.sizeInches,
  );

  const results: StormImpactResult[] = points.map((pt) => {
    for (const feature of featuresDesc) {
      if (pointInFeature(pt.lng, pt.lat, feature)) {
        const p = feature.properties;
        return {
          id: pt.id,
          maxHailInches: p.sizeInches,
          level: p.level,
          color: p.color,
          label: p.label,
          severity: p.severity,
          directHit: true,
        };
      }
    }
    return {
      id: pt.id,
      maxHailInches: null,
      level: null,
      color: null,
      label: null,
      severity: null,
      directHit: false,
    };
  });

  const directHits = results.filter((r) => r.directHit).length;

  return {
    date,
    anchorTimestamp: anchorTimestamp ?? null,
    metadata: {
      stormMaxInches: collection.metadata.maxMeshInches,
      stormHailCells: collection.metadata.hailCells,
      stormFeatureCount: collection.features.length,
      pointsChecked: points.length,
      directHits,
    },
    results,
  };
}
