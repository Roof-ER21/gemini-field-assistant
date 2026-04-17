/**
 * Live MRMS Service — "what's happening on radar in the last 24h?"
 *
 * Pulls the most recent MESH_Max_1440min (24h rolling max) file from the
 * IEM MTArchive. Data source is the same as the historical pipeline, so
 * the existing GRIB-in-PNG decoder works without a new dependency.
 *
 * Upstream cadence: IEM publishes a new 1440min snapshot every 30 minutes,
 * which means end-to-end latency is ~30 min. That's 3-4× faster than the
 * prior "historical only" flow and good enough for same-shift rep work.
 *
 * Ideal future upgrade: parse NCEP's native grib2 (2-min cadence) — blocked
 * by the fact that `decodeMrmsGrib2` here actually reads a PNG-in-GRIB2
 * payload that only IEM produces. A real GRIB2 parser (template 5.3 / 5.41)
 * is a separate 2-3h project.
 */
import zlib from 'zlib';
import { decodeMrmsGrib2, buildCompositeGrid, } from './historicalMrmsService.js';
import { meshGridToPolygons } from './meshVectorService.js';
const IEM_BASE = 'https://mtarchive.geol.iastate.edu';
const LIVE_CACHE_TTL_MS = 2 * 60 * 1000; // 2 min cache (upstream updates every 30 min)
// Keep a short list of tried-but-failed file URLs so a transient 404 on the
// newest file (race: directory listing before file fully uploaded) doesn't
// wedge the service.
const STALE_URL_COOLDOWN_MS = 60 * 1000;
const recentlyFailed = new Map();
let liveGridCache = null;
function todayUtcParts() {
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    return { year, month, day, compact: `${year}${month}${day}` };
}
async function listTodaysFiles() {
    const { year, month, day, compact } = todayUtcParts();
    const directoryUrl = `${IEM_BASE}/${year}/${month}/${day}/mrms/ncep/MESH_Max_1440min/`;
    const res = await fetch(directoryUrl, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'susan21-storm-map/1.0' },
    });
    if (!res.ok) {
        throw new Error(`IEM directory listing ${res.status} at ${directoryUrl}`);
    }
    const html = await res.text();
    const pattern = new RegExp(`href="(MESH_Max_1440min_00\\.50_${compact}-\\d{6}\\.grib2\\.gz)"`, 'g');
    const files = [];
    let match;
    while ((match = pattern.exec(html)) !== null) {
        files.push(`${directoryUrl}${match[1]}`);
    }
    if (files.length === 0) {
        // Before 00:30 UTC the day's directory may be empty — fall back to yesterday.
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const yy = String(yesterday.getUTCFullYear());
        const ym = String(yesterday.getUTCMonth() + 1).padStart(2, '0');
        const yd = String(yesterday.getUTCDate()).padStart(2, '0');
        const ycompact = `${yy}${ym}${yd}`;
        const fallbackUrl = `${IEM_BASE}/${yy}/${ym}/${yd}/mrms/ncep/MESH_Max_1440min/`;
        const r2 = await fetch(fallbackUrl, {
            signal: AbortSignal.timeout(15000),
            headers: { 'User-Agent': 'susan21-storm-map/1.0' },
        });
        if (r2.ok) {
            const html2 = await r2.text();
            const p2 = new RegExp(`href="(MESH_Max_1440min_00\\.50_${ycompact}-\\d{6}\\.grib2\\.gz)"`, 'g');
            let m2;
            while ((m2 = p2.exec(html2)) !== null) {
                files.push(`${fallbackUrl}${m2[1]}`);
            }
        }
    }
    files.sort(); // lexicographic sort on filename = chronological
    return files;
}
/**
 * Fetch + decode the most recent live MRMS 1440min grid from IEM.
 * Shared 2-minute cache across all callers.
 */
export async function fetchLiveMrmsGrid() {
    if (liveGridCache && Date.now() - liveGridCache.fetchedAt < LIVE_CACHE_TTL_MS) {
        return liveGridCache;
    }
    const now = Date.now();
    // Purge cooldown entries older than STALE_URL_COOLDOWN_MS.
    for (const [url, ts] of recentlyFailed.entries()) {
        if (now - ts > STALE_URL_COOLDOWN_MS)
            recentlyFailed.delete(url);
    }
    const files = await listTodaysFiles();
    if (files.length === 0) {
        throw new Error('IEM MTArchive has no MESH_Max_1440min files for today or yesterday');
    }
    // Try newest → older until one decodes cleanly. Most attempts succeed on
    // the first try, but we fall back if the freshest file is still uploading.
    let lastErr = null;
    for (let i = files.length - 1; i >= Math.max(0, files.length - 3); i--) {
        const url = files[i];
        if (recentlyFailed.has(url))
            continue;
        try {
            const res = await fetch(url, {
                signal: AbortSignal.timeout(30000),
                headers: { 'User-Agent': 'susan21-storm-map/1.0' },
            });
            if (!res.ok)
                throw new Error(`IEM returned ${res.status}`);
            const compressed = Buffer.from(await res.arrayBuffer());
            const raw = zlib.gunzipSync(compressed);
            const decoded = decodeMrmsGrib2(raw);
            const composite = buildCompositeGrid([decoded], [url]);
            // Extract timestamp from filename (YYYYMMDD-HHMMSS).
            const tsMatch = url.match(/_(\d{8})-(\d{6})\.grib2\.gz$/);
            const refTime = tsMatch
                ? `${tsMatch[1].slice(0, 4)}-${tsMatch[1].slice(4, 6)}-${tsMatch[1].slice(6, 8)}T${tsMatch[2].slice(0, 2)}:${tsMatch[2].slice(2, 4)}:${tsMatch[2].slice(4, 6)}Z`
                : new Date().toISOString();
            liveGridCache = {
                decoded: composite,
                fetchedAt: Date.now(),
                sourceUrl: url,
                refTime,
            };
            return liveGridCache;
        }
        catch (err) {
            recentlyFailed.set(url, Date.now());
            lastErr = err;
            console.warn(`[LiveMRMS] failed ${url}: ${err.message}, trying older file`);
        }
    }
    throw new Error(`Live MRMS fetch failed after ${Math.min(3, files.length)} attempts: ${lastErr?.message || 'unknown error'}`);
}
/**
 * Get live MRMS hail swath polygons for the requested geographic bounds.
 * Output format matches the historical endpoint so the same frontend
 * rendering code works for both.
 *
 * NB: `product` is accepted for forward compatibility but currently only
 * the 24h composite (mesh1440) is available via IEM live.
 */
export async function getLiveMrmsSwathPolygons(params) {
    const entry = await fetchLiveMrmsGrid();
    const composite = entry.decoded;
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
        refTime: entry.refTime,
    }, today);
    return {
        ...result,
        live: true,
        product: params.product || 'mesh1440',
        refTime: entry.refTime,
    };
}
/**
 * Whole-CONUS live grid — useful for future territory monitors.
 * Do NOT call per-request on the hot path.
 */
export async function getLiveConusGrid() {
    const entry = await fetchLiveMrmsGrid();
    return entry.decoded;
}
