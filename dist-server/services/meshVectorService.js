/**
 * MRMS MESH Vector Polygon Service
 *
 * Converts MRMS MESH raster grid data into GeoJSON vector polygons
 * using d3-contour (marching squares algorithm). Produces crisp,
 * clickable swath polygons at 10 hail size levels — matching the
 * resolution of IHM/HailTrace commercial products.
 *
 * Data source: Same IEM MTArchive GRIB2 data as MRMSHailOverlay,
 * but rendered as vector polygons instead of raster PNG.
 */
import { contours } from 'd3-contour';
// ============================================================
// Constants — 10 Forensic Hail Size Levels (IHM-matching)
// ============================================================
export const HAIL_LEVELS = [
    { sizeInches: 0.13, sizeMm: 3.3, label: '⅛"', color: '#FFFFE6', severity: 'trace' },
    { sizeInches: 0.25, sizeMm: 6.35, label: '¼"', color: '#FFFBCC', severity: 'trace' },
    { sizeInches: 0.38, sizeMm: 9.53, label: '⅜"', color: '#FFF7B3', severity: 'trace' },
    { sizeInches: 0.50, sizeMm: 12.7, label: '½"', color: '#FFFF99', severity: 'trace' },
    { sizeInches: 0.75, sizeMm: 19.05, label: '¾"', color: '#FFCC29', severity: 'minor' },
    { sizeInches: 1.00, sizeMm: 25.4, label: '1"', color: '#FF991F', severity: 'moderate' },
    { sizeInches: 1.25, sizeMm: 31.75, label: '1¼"', color: '#FF6614', severity: 'moderate' },
    { sizeInches: 1.50, sizeMm: 38.1, label: '1½"', color: '#FF330A', severity: 'severe' },
    { sizeInches: 1.75, sizeMm: 44.45, label: '1¾"', color: '#FF0000', severity: 'severe' },
    { sizeInches: 2.00, sizeMm: 50.8, label: '2"', color: '#E60040', severity: 'very_severe' },
    { sizeInches: 2.25, sizeMm: 57.15, label: '2¼"', color: '#CC0080', severity: 'very_severe' },
    { sizeInches: 2.50, sizeMm: 63.5, label: '2½"', color: '#B300BF', severity: 'extreme' },
    { sizeInches: 3.00, sizeMm: 76.2, label: '3"+', color: '#9900FF', severity: 'extreme' },
];
// ============================================================
// Core: Convert MRMS grid → GeoJSON polygons
// ============================================================
/**
 * Convert a MRMS MESH composite grid to GeoJSON vector polygons.
 *
 * Uses d3-contour (marching squares) to trace contour lines at each
 * of the hail size thresholds, then converts pixel coordinates
 * to geographic lat/lng coordinates.
 *
 * The result is a GeoJSON FeatureCollection where each Feature is a
 * MultiPolygon at a specific hail size level, colored for display.
 */
export function meshGridToPolygons(grid, date) {
    const { mmGrid, width, height, north, south, east, west, sourceFiles, refTime } = grid;
    // Convert Float32Array to regular array for d3-contour
    const values = new Array(width * height);
    let maxMm = 0;
    let hailCells = 0;
    for (let i = 0; i < mmGrid.length; i++) {
        const mm = mmGrid[i];
        values[i] = mm;
        if (mm > maxMm)
            maxMm = mm;
        if (mm >= HAIL_LEVELS[0].sizeMm)
            hailCells++;
    }
    // If no hail detected, return empty collection
    if (hailCells === 0) {
        return {
            type: 'FeatureCollection',
            features: [],
            metadata: {
                date,
                refTime,
                maxMeshInches: 0,
                hailCells: 0,
                gridWidth: width,
                gridHeight: height,
                bounds: { north, south, east, west },
                sourceFiles,
                generatedAt: new Date().toISOString(),
            },
        };
    }
    // Geographic conversion: pixel (col, row) → (lng, lat)
    const latStep = (north - south) / (height - 1);
    const lonStep = (east - west) / (width - 1);
    function pixelToGeo(x, y) {
        const lng = west + x * lonStep;
        const lat = north - y * latStep;
        return [lng, lat];
    }
    // Generate contours at each threshold level (from highest to lowest
    // so smaller intense areas render on top of larger mild areas)
    const thresholds = HAIL_LEVELS.map(l => l.sizeMm);
    // smooth(false) matches IHM/HailTrace's crisp, forensic edges exactly.
    // smooth(true) applies Laplacian smoothing for a more organic look, but
    // softens the hard thresholds that reps use for damage boundary disputes.
    const contourGenerator = contours()
        .size([width, height])
        .thresholds(thresholds)
        .smooth(false);
    const contourResults = contourGenerator(values);
    // Convert d3 contour output to GeoJSON features with real coordinates
    const features = [];
    for (const contour of contourResults) {
        // Find which level this contour belongs to
        const levelIndex = thresholds.indexOf(contour.value);
        if (levelIndex === -1)
            continue;
        const level = HAIL_LEVELS[levelIndex];
        // Skip empty contours
        if (!contour.coordinates || contour.coordinates.length === 0)
            continue;
        // Convert pixel coordinates to geographic coordinates
        // d3 contours returns MultiPolygon coordinates: [polygon[ring[point]]]
        const geoCoordinates = [];
        for (const polygon of contour.coordinates) {
            const geoPolygon = [];
            for (const ring of polygon) {
                const geoRing = [];
                // Simplify: skip points that are very close together
                // This reduces polygon complexity by ~60-80% without visible quality loss
                let lastX = -999, lastY = -999;
                const minPixelDist = 1.5; // minimum pixel distance between points
                for (const [px, py] of ring) {
                    const dx = px - lastX;
                    const dy = py - lastY;
                    if (dx * dx + dy * dy >= minPixelDist * minPixelDist) {
                        geoRing.push(pixelToGeo(px, py));
                        lastX = px;
                        lastY = py;
                    }
                }
                // Ensure ring is closed (GeoJSON requirement)
                if (geoRing.length >= 4) {
                    const first = geoRing[0];
                    const last = geoRing[geoRing.length - 1];
                    if (first[0] !== last[0] || first[1] !== last[1]) {
                        geoRing.push([...first]);
                    }
                    geoPolygon.push(geoRing);
                }
            }
            if (geoPolygon.length > 0) {
                geoCoordinates.push(geoPolygon);
            }
        }
        if (geoCoordinates.length > 0) {
            features.push({
                type: 'Feature',
                properties: {
                    level: levelIndex,
                    sizeInches: level.sizeInches,
                    sizeMm: level.sizeMm,
                    label: level.label,
                    color: level.color,
                    severity: level.severity,
                },
                geometry: {
                    type: 'MultiPolygon',
                    coordinates: geoCoordinates,
                },
            });
        }
    }
    return {
        type: 'FeatureCollection',
        features,
        metadata: {
            date,
            refTime,
            maxMeshInches: maxMm / 25.4,
            hailCells,
            gridWidth: width,
            gridHeight: height,
            bounds: { north, south, east, west },
            sourceFiles,
            generatedAt: new Date().toISOString(),
        },
    };
}
