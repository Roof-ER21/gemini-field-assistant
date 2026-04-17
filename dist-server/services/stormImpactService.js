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
import { getHistoricalMrmsSwathPolygons } from './historicalMrmsService.js';
// ---------------------------------------------------------------------------
// Ray-casting point-in-polygon (no external geo library needed)
// ---------------------------------------------------------------------------
/**
 * Classic ray-casting point-in-polygon for GeoJSON coordinates.
 * Ring is a closed loop of [lng, lat] pairs (first === last).
 */
function pointInRing(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];
        const intersect = yi > lat !== yj > lat &&
            lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
        if (intersect)
            inside = !inside;
    }
    return inside;
}
/**
 * A GeoJSON Polygon's first ring is the outer boundary; subsequent rings
 * are holes. A point is "in" the polygon if it's in the outer ring and
 * not in any hole.
 */
function pointInPolygon(lng, lat, rings) {
    if (rings.length === 0)
        return false;
    if (!pointInRing(lng, lat, rings[0]))
        return false;
    for (let i = 1; i < rings.length; i++) {
        if (pointInRing(lng, lat, rings[i]))
            return false;
    }
    return true;
}
/** MultiPolygon containment = point is in at least one of its polygons. */
function pointInFeature(lng, lat, feature) {
    for (const polygon of feature.geometry.coordinates) {
        if (pointInPolygon(lng, lat, polygon))
            return true;
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
function pointsBoundingBox(points) {
    if (points.length === 0) {
        return { north: 50, south: 20, east: -60, west: -130 };
    }
    let north = -90, south = 90, east = -180, west = 180;
    for (const p of points) {
        if (p.lat > north)
            north = p.lat;
        if (p.lat < south)
            south = p.lat;
        if (p.lng > east)
            east = p.lng;
        if (p.lng < west)
            west = p.lng;
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
export async function computeStormImpact(params, pool) {
    const { date, anchorTimestamp, points } = params;
    const bounds = params.bounds || pointsBoundingBox(points);
    const collection = await getHistoricalMrmsSwathPolygons({
        date,
        north: bounds.north,
        south: bounds.south,
        east: bounds.east,
        west: bounds.west,
        anchorTimestamp: anchorTimestamp ?? null,
    }, pool);
    // Sort features by threshold DESC so we find the highest-severity band a point is in first.
    const featuresDesc = [...collection.features].sort((a, b) => b.properties.sizeInches - a.properties.sizeInches);
    const results = points.map((pt) => {
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
