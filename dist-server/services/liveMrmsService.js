/**
 * Live MRMS Service — "what's happening on radar right now?"
 *
 * Pulls the most recent MRMS MESH 60-minute maximum GRIB2 directly from
 * NOAA NCEP (updated every 2 minutes). This is the ~5-minute-latency
 * complement to the historical IEM MTArchive pipeline (1-2 hour delay).
 *
 * Use case: the weekend is active and reps need to know *now* that hail
 * is falling on their territory, not 90 minutes after the storm moved
 * through. Polygons from this service are what feed the "LIVE" toggle on
 * the Territory map and the push alerts.
 *
 * Data source: https://mrms.ncep.noaa.gov/2D/MESH_Max_60min/MRMS_MESH_Max_60min.latest.grib2.gz
 * Refresh cadence: 2 minutes upstream. We cache decoded grids for 90s.
 */
import zlib from 'zlib';
import { decodeMrmsGrib2, buildCompositeGrid, } from './historicalMrmsService.js';
import { meshGridToPolygons } from './meshVectorService.js';
const LIVE_MRMS_60_MIN_URL = 'https://mrms.ncep.noaa.gov/2D/MESH_Max_60min/MRMS_MESH_Max_60min.latest.grib2.gz';
const LIVE_MRMS_1440_MIN_URL = 'https://mrms.ncep.noaa.gov/2D/MESH_Max_1440min/MRMS_MESH_Max_1440min.latest.grib2.gz';
const LIVE_CACHE_TTL_MS = 90 * 1000; // 90 seconds (fresh but not hammering NCEP)
const liveGridCache = new Map();
function urlForProduct(product) {
    return product === 'mesh1440' ? LIVE_MRMS_1440_MIN_URL : LIVE_MRMS_60_MIN_URL;
}
/**
 * Fetch + decode the most recent live MRMS grid.
 * Cache is keyed per product; short TTL since data updates every 2 minutes.
 */
export async function fetchLiveMrmsGrid(product = 'mesh60') {
    const cached = liveGridCache.get(product);
    if (cached && Date.now() - cached.fetchedAt < LIVE_CACHE_TTL_MS) {
        return cached;
    }
    const url = urlForProduct(product);
    const res = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        headers: { 'User-Agent': 'susan21-storm-map/1.0 (+https://sa21.up.railway.app)' },
    });
    if (!res.ok) {
        throw new Error(`Live MRMS fetch failed: ${url} returned ${res.status}`);
    }
    const lastModified = res.headers.get('last-modified');
    const compressed = Buffer.from(await res.arrayBuffer());
    const raw = zlib.gunzipSync(compressed);
    const decoded = decodeMrmsGrib2(raw);
    // Wrap the single decoded grid in a composite so we get a pre-computed
    // Float32Array `mmGrid` (convenience for downstream polygon/point ops).
    const composite = buildCompositeGrid([decoded], [url]);
    const entry = {
        decoded: composite,
        fetchedAt: Date.now(),
        sourceUrl: url,
        lastModified,
    };
    liveGridCache.set(product, entry);
    return entry;
}
/**
 * Get live MRMS hail swath polygons for the requested geographic bounds.
 * Output format matches the historical endpoint so the same frontend
 * rendering code works for both.
 */
export async function getLiveMrmsSwathPolygons(params) {
    const product = params.product || 'mesh60';
    const entry = await fetchLiveMrmsGrid(product);
    const composite = entry.decoded;
    // Reuse gridBoundsToIndices logic inline (same math as historicalMrmsService).
    const latStep = (composite.north - composite.south) / (composite.height - 1);
    const lonStep = (composite.east - composite.west) / (composite.width - 1);
    const padCells = 50;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const rowStart = clamp(Math.floor((composite.north - params.north) / latStep) - padCells, 0, composite.height - 1);
    const rowEnd = clamp(Math.ceil((composite.north - params.south) / latStep) + padCells, 0, composite.height - 1);
    const colStart = clamp(Math.floor((params.west - composite.west) / lonStep) - padCells, 0, composite.width - 1);
    const colEnd = clamp(Math.ceil((params.east - composite.west) / lonStep) + padCells, 0, composite.width - 1);
    const cropWidth = colEnd - colStart + 1;
    const cropHeight = rowEnd - rowStart + 1;
    const croppedGrid = new Float32Array(cropWidth * cropHeight);
    for (let row = rowStart; row <= rowEnd; row++) {
        for (let col = colStart; col <= colEnd; col++) {
            croppedGrid[(row - rowStart) * cropWidth + (col - colStart)] =
                composite.mmGrid[row * composite.width + col];
        }
    }
    const refTime = entry.lastModified || new Date().toISOString();
    const today = new Date().toISOString().slice(0, 10);
    const result = meshGridToPolygons({
        mmGrid: croppedGrid,
        width: cropWidth,
        height: cropHeight,
        north: composite.north - rowStart * latStep,
        south: composite.north - rowEnd * latStep,
        east: composite.west + colEnd * lonStep,
        west: composite.west + colStart * lonStep,
        sourceFiles: [entry.sourceUrl],
        refTime,
    }, today);
    return {
        ...result,
        live: true,
        product,
        refTime,
    };
}
/**
 * Whole-CONUS live grid — useful for territory monitors that scan all reps'
 * territories in one decode pass. Do NOT call on every request — this is
 * an expensive ~5MB Float32Array. Cache the returned reference.
 */
export async function getLiveConusGrid(product = 'mesh60') {
    const entry = await fetchLiveMrmsGrid(product);
    return entry.decoded;
}
