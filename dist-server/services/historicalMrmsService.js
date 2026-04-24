import sharp from 'sharp';
import zlib from 'zlib';
// Canonical palette lives in hailPalette.ts. We adapt its HAIL_LEVELS into the
// (minInches, maxInches, rgba) shape this service used historically so the
// raster-tile encoder still gets what it expects.
import { HAIL_LEVELS as CANONICAL_HAIL_LEVELS } from './hailPalette.js';
const ARCHIVE_BASE = 'https://mtarchive.geol.iastate.edu';
const PRODUCT_PATH = 'MESH_Max_1440min';
// NOTE: two historical filename prefixes share this product inside that
// directory — MESH_Max_* (2023+) and MRMS_Max_* (2020-01 through ~2022-12).
// The parseArchiveFiles regex below accepts both so backfill covers the
// whole archive window.
const USER_AGENT = 'RoofER-StormMaps/1.0';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const HAIL_COLORS = CANONICAL_HAIL_LEVELS.map((l) => ({ minInches: l.minInches, maxInches: l.maxInches, rgba: l.rgba }));
const cache = new Map();
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function assertValidDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error(`Historical MRMS requires a YYYY-MM-DD date, got "${date}"`);
    }
}
function normalizeRequest(input) {
    assertValidDate(input.date);
    const north = Math.max(input.north, input.south);
    const south = Math.min(input.north, input.south);
    const east = Math.max(input.east, input.west);
    const west = Math.min(input.east, input.west);
    if (![north, south, east, west].every((value) => Number.isFinite(value))) {
        throw new Error('Historical MRMS requires finite north/south/east/west bounds');
    }
    return {
        ...input,
        north,
        south,
        east,
        west,
    };
}
function getCacheKey(request) {
    return JSON.stringify({
        date: request.date,
        anchorTimestamp: request.anchorTimestamp || '',
        north: Number(request.north.toFixed(3)),
        south: Number(request.south.toFixed(3)),
        east: Number(request.east.toFixed(3)),
        west: Number(request.west.toFixed(3)),
    });
}
function buildArchiveDirectory(date) {
    const [year, month, day] = date.split('-');
    return `${ARCHIVE_BASE}/${year}/${month}/${day}/mrms/ncep/${PRODUCT_PATH}/`;
}
function parseArchiveFiles(html, directoryUrl) {
    // Matches either MESH_Max_1440min_00.50_YYYYMMDD-HHMMSS.grib2.gz
    // or MRMS_Max_1440min_00.50_YYYYMMDD-HHMMSS.grib2.gz (pre-2023 filename).
    const pattern = /href="((?:MESH|MRMS)_Max_1440min_00\.50_(\d{8}-\d{6})\.grib2\.gz)"/g;
    const files = new Map();
    for (const match of html.matchAll(pattern)) {
        const name = match[1];
        const compactTimestamp = match[2];
        files.set(name, {
            name,
            compactTimestamp,
            url: `${directoryUrl}${name}`,
        });
    }
    return Array.from(files.values()).sort((a, b) => a.compactTimestamp.localeCompare(b.compactTimestamp));
}
async function listArchiveFiles(date) {
    const directoryUrl = buildArchiveDirectory(date);
    const response = await fetch(directoryUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
        throw new Error(`Historical MRMS archive listing returned ${response.status}`);
    }
    const html = await response.text();
    const files = parseArchiveFiles(html, directoryUrl);
    if (files.length === 0) {
        throw new Error(`Historical MRMS archive has no ${PRODUCT_PATH} files for ${date}`);
    }
    return files;
}
/**
 * Return the single ArchiveFile whose timestamp is closest to (and not after)
 * the given compactTimestamp string, or the last file if none precede it.
 */
function findFileNearTimestamp(files, compactTarget) {
    const match = [...files].reverse().find((file) => file.compactTimestamp <= compactTarget);
    return match || files[files.length - 1];
}
/**
 * Choose up to 3 archive files that span the storm day so the composite
 * captures the full storm path rather than a single snapshot.
 *
 * Strategy (UTC times, which map to afternoon/evening ET when severe storms peak):
 *   - Anchor provided → primary file at/before anchor, plus files ~2 h earlier
 *     and ~2 h later to bracket the storm window.
 *   - No anchor → three evenly spaced files: ~15:00 UTC (early afternoon ET),
 *     ~20:00 UTC (late afternoon ET), and ~23:30 UTC (end of day, maximum
 *     rolling window).  Severe storms in VA/MD/PA peak 19:00–23:00 UTC so
 *     all three snapshots together cover the full track.
 *
 * Duplicate files are deduplicated so short archive listings never return
 * the same file more than once.
 */
function chooseArchiveFiles(files, anchorTimestamp) {
    if (files.length === 1) {
        return files;
    }
    if (anchorTimestamp) {
        const parsedAnchor = new Date(anchorTimestamp);
        if (!Number.isNaN(parsedAnchor.getTime())) {
            const anchorMs = parsedAnchor.getTime();
            const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
            const makeCompact = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
            const primary = findFileNearTimestamp(files, makeCompact(anchorMs));
            const earlier = findFileNearTimestamp(files, makeCompact(anchorMs - TWO_HOURS_MS));
            const later = findFileNearTimestamp(files, makeCompact(anchorMs + TWO_HOURS_MS));
            const seen = new Set();
            const result = [];
            for (const f of [earlier, primary, later]) {
                if (!seen.has(f.name)) {
                    seen.add(f.name);
                    result.push(f);
                }
            }
            return result;
        }
    }
    // No (or unparseable) anchor: pick files near 15:00, 20:00, and 23:30 UTC.
    // The compactTimestamp format is YYYYMMDD-HHMMSS; use the date portion of
    // the first available file so the targets stay on the correct calendar day.
    const datePart = files[0].compactTimestamp.slice(0, 8);
    const targets = [`${datePart}-150000`, `${datePart}-200000`, `${datePart}-233000`];
    const seen = new Set();
    const result = [];
    for (const target of targets) {
        const f = findFileNearTimestamp(files, target);
        if (!seen.has(f.name)) {
            seen.add(f.name);
            result.push(f);
        }
    }
    // Always include the last file (maximum rolling window for the day).
    const last = files[files.length - 1];
    if (!seen.has(last.name)) {
        seen.add(last.name);
        result.push(last);
    }
    return result;
}
function readSectionLength(buffer, offset) {
    return buffer.readUInt32BE(offset);
}
function decodeGrayscale16Png(payload) {
    if (payload.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
        throw new Error('Historical MRMS PNG payload is invalid');
    }
    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let interlace = 0;
    const idatChunks = [];
    while (offset < payload.length) {
        const length = payload.readUInt32BE(offset);
        const type = payload.toString('ascii', offset + 4, offset + 8);
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        const chunk = payload.subarray(dataStart, dataEnd);
        offset = dataEnd + 4;
        if (type === 'IHDR') {
            width = chunk.readUInt32BE(0);
            height = chunk.readUInt32BE(4);
            bitDepth = chunk[8];
            colorType = chunk[9];
            interlace = chunk[12];
        }
        else if (type === 'IDAT') {
            idatChunks.push(chunk);
        }
        else if (type === 'IEND') {
            break;
        }
    }
    if (bitDepth !== 16 || colorType !== 0 || interlace !== 0) {
        throw new Error(`Historical MRMS PNG uses unsupported format bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}`);
    }
    const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
    const stride = width * 2;
    const expectedLength = (stride + 1) * height;
    if (inflated.length !== expectedLength) {
        throw new Error(`Historical MRMS PNG inflated length mismatch ${inflated.length} !== ${expectedLength}`);
    }
    const currentRow = Buffer.alloc(stride);
    const previousRow = Buffer.alloc(stride);
    const output = Buffer.alloc(width * height * 2);
    const paeth = (left, up, upLeft) => {
        const predictor = left + up - upLeft;
        const leftDistance = Math.abs(predictor - left);
        const upDistance = Math.abs(predictor - up);
        const upLeftDistance = Math.abs(predictor - upLeft);
        if (leftDistance <= upDistance && leftDistance <= upLeftDistance)
            return left;
        if (upDistance <= upLeftDistance)
            return up;
        return upLeft;
    };
    let inputOffset = 0;
    let outputOffset = 0;
    for (let row = 0; row < height; row += 1) {
        const filter = inflated[inputOffset];
        inputOffset += 1;
        if (filter === 0) {
            inflated.copy(currentRow, 0, inputOffset, inputOffset + stride);
        }
        else if (filter === 1) {
            for (let index = 0; index < stride; index += 1) {
                const left = index >= 2 ? currentRow[index - 2] : 0;
                currentRow[index] = (inflated[inputOffset + index] + left) & 0xff;
            }
        }
        else if (filter === 2) {
            for (let index = 0; index < stride; index += 1) {
                currentRow[index] = (inflated[inputOffset + index] + previousRow[index]) & 0xff;
            }
        }
        else if (filter === 3) {
            for (let index = 0; index < stride; index += 1) {
                const left = index >= 2 ? currentRow[index - 2] : 0;
                const up = previousRow[index];
                currentRow[index] = (inflated[inputOffset + index] + ((left + up) >> 1)) & 0xff;
            }
        }
        else if (filter === 4) {
            for (let index = 0; index < stride; index += 1) {
                const left = index >= 2 ? currentRow[index - 2] : 0;
                const up = previousRow[index];
                const upLeft = index >= 2 ? previousRow[index - 2] : 0;
                currentRow[index] = (inflated[inputOffset + index] + paeth(left, up, upLeft)) & 0xff;
            }
        }
        else {
            throw new Error(`Historical MRMS PNG uses unsupported filter ${filter}`);
        }
        currentRow.copy(output, outputOffset, 0, stride);
        currentRow.copy(previousRow, 0, 0, stride);
        inputOffset += stride;
        outputOffset += stride;
    }
    return { width, height, data: output };
}
export function decodeMrmsGrib2(raw) {
    if (raw.subarray(0, 4).toString('ascii') !== 'GRIB') {
        throw new Error('Historical MRMS payload is not GRIB2');
    }
    let offset = 16;
    const section1Length = readSectionLength(raw, offset);
    const year = raw.readUInt16BE(offset + 12);
    const month = raw[offset + 14];
    const day = raw[offset + 15];
    const hour = raw[offset + 16];
    const minute = raw[offset + 17];
    const second = raw[offset + 18];
    const refTime = new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString();
    offset += section1Length;
    if (raw[offset + 4] === 2) {
        offset += readSectionLength(raw, offset);
    }
    const section3Length = readSectionLength(raw, offset);
    const width = raw.readUInt32BE(offset + 30);
    const height = raw.readUInt32BE(offset + 34);
    let lat1 = raw.readUInt32BE(offset + 46) / 1e6;
    let lon1 = raw.readUInt32BE(offset + 50) / 1e6;
    let lat2 = raw.readUInt32BE(offset + 55) / 1e6;
    let lon2 = raw.readUInt32BE(offset + 59) / 1e6;
    if (lon1 > 180)
        lon1 -= 360;
    if (lon2 > 180)
        lon2 -= 360;
    offset += section3Length;
    offset += readSectionLength(raw, offset);
    const section5Length = readSectionLength(raw, offset);
    const refValue = raw.readFloatBE(offset + 11);
    const binaryScale = raw.readInt16BE(offset + 15);
    const decimalScale = raw.readInt16BE(offset + 17);
    offset += section5Length;
    const section6Length = readSectionLength(raw, offset);
    const bitmapIndicator = raw[offset + 5];
    if (bitmapIndicator !== 255) {
        throw new Error(`Historical MRMS bitmap indicator ${bitmapIndicator} is unsupported`);
    }
    offset += section6Length;
    const section7Length = readSectionLength(raw, offset);
    const payload = raw.subarray(offset + 5, offset + section7Length);
    const png = decodeGrayscale16Png(payload);
    if (png.width !== width || png.height !== height) {
        throw new Error(`Historical MRMS PNG dimensions ${png.width}x${png.height} do not match GRIB grid ${width}x${height}`);
    }
    return {
        refTime,
        refValue,
        binaryScale,
        decimalScale,
        width,
        height,
        north: Math.max(lat1, lat2),
        south: Math.min(lat1, lat2),
        east: Math.max(lon1, lon2),
        west: Math.min(lon1, lon2),
        data: png.data,
    };
}
function getColorForInches(inches) {
    for (const stop of HAIL_COLORS) {
        if (inches >= stop.minInches && inches < stop.maxInches) {
            return stop.rgba;
        }
    }
    return null;
}
function getValueMillimeters(decoded, rawValue) {
    return ((decoded.refValue + rawValue * 2 ** decoded.binaryScale) /
        10 ** decoded.decimalScale);
}
/**
 * Merge multiple decoded GRIB2 grids into a single composite by taking the
 * MAX physical value (mm) at each grid cell.  All input grids must share the
 * same geographic extent and dimensions — IEM's MRMS archive guarantees this
 * for the same product/date.
 *
 * Returns a CompositeDecodedMrmsGrib whose `mmGrid` contains one float per
 * cell (row-major, same ordering as the GRIB PNG rows).
 */
export function buildCompositeGrid(grids, sourceFiles) {
    if (grids.length === 0) {
        throw new Error('Historical MRMS composite requires at least one decoded grid');
    }
    const base = grids[0];
    const totalCells = base.width * base.height;
    const mmGrid = new Float32Array(totalCells);
    // Initialise from first grid.
    for (let i = 0; i < totalCells; i += 1) {
        const rawValue = base.data.readUInt16BE(i * 2);
        mmGrid[i] = getValueMillimeters(base, rawValue);
    }
    // Merge remaining grids by taking cell-wise maximum.
    for (let g = 1; g < grids.length; g += 1) {
        const grid = grids[g];
        if (grid.width !== base.width || grid.height !== base.height) {
            // Grid dimensions changed between files — skip rather than corrupt.
            console.warn(`Historical MRMS composite: grid ${g} dimensions ${grid.width}x${grid.height} ` +
                `differ from base ${base.width}x${base.height} — skipping`);
            continue;
        }
        for (let i = 0; i < totalCells; i += 1) {
            const rawValue = grid.data.readUInt16BE(i * 2);
            const mm = getValueMillimeters(grid, rawValue);
            if (mm > mmGrid[i]) {
                mmGrid[i] = mm;
            }
        }
    }
    return {
        refTime: base.refTime,
        refValue: base.refValue,
        binaryScale: base.binaryScale,
        decimalScale: base.decimalScale,
        width: base.width,
        height: base.height,
        north: base.north,
        south: base.south,
        east: base.east,
        west: base.west,
        mmGrid,
        sourceFiles,
    };
}
function gridBoundsToIndices(decoded, requestedBounds) {
    const latStep = (decoded.north - decoded.south) / (decoded.height - 1);
    const lonStep = (decoded.east - decoded.west) / (decoded.width - 1);
    // 50 cells ≈ 50 km padding on each side (MRMS grid is ~1 km/cell).
    // A padding of 12 clipped storm paths that extended beyond the tight event
    // bounding box.  50 km gives enough margin to capture the full swath even
    // when the SPC event points only mark a portion of the track.
    const padCells = 50;
    const rowStart = clamp(Math.floor((decoded.north - requestedBounds.north) / latStep) - padCells, 0, decoded.height - 1);
    const rowEnd = clamp(Math.ceil((decoded.north - requestedBounds.south) / latStep) + padCells, 0, decoded.height - 1);
    const colStart = clamp(Math.floor((requestedBounds.west - decoded.west) / lonStep) - padCells, 0, decoded.width - 1);
    const colEnd = clamp(Math.ceil((requestedBounds.east - decoded.west) / lonStep) + padCells, 0, decoded.width - 1);
    return { rowStart, rowEnd, colStart, colEnd };
}
async function renderOverlay(composite, requestedBounds, primaryFile) {
    const { rowStart, rowEnd, colStart, colEnd } = gridBoundsToIndices(composite, requestedBounds);
    let hailPixels = 0;
    let maxMm = 0;
    let hailRowMin = Number.POSITIVE_INFINITY;
    let hailRowMax = Number.NEGATIVE_INFINITY;
    let hailColMin = Number.POSITIVE_INFINITY;
    let hailColMax = Number.NEGATIVE_INFINITY;
    for (let row = rowStart; row <= rowEnd; row += 1) {
        for (let col = colStart; col <= colEnd; col += 1) {
            const mm = composite.mmGrid[row * composite.width + col];
            const inches = mm / 25.4;
            if (!getColorForInches(inches)) {
                continue;
            }
            hailPixels += 1;
            if (mm > maxMm) {
                maxMm = mm;
            }
            if (row < hailRowMin)
                hailRowMin = row;
            if (row > hailRowMax)
                hailRowMax = row;
            if (col < hailColMin)
                hailColMin = col;
            if (col > hailColMax)
                hailColMax = col;
        }
    }
    const latStep = (composite.north - composite.south) / (composite.height - 1);
    const lonStep = (composite.east - composite.west) / (composite.width - 1);
    const generatedAt = new Date().toISOString();
    if (hailPixels === 0) {
        const imageBuffer = await sharp({
            create: {
                width: 1,
                height: 1,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            },
        }).png().toBuffer();
        return {
            imageBuffer,
            metadata: {
                product: 'mesh1440',
                source: 'IEM MTArchive',
                ref_time: composite.refTime,
                generated_at: generatedAt,
                archive_file: primaryFile.name,
                archive_url: primaryFile.url,
                composite_files: composite.sourceFiles,
                has_hail: false,
                max_mesh_mm: 0,
                max_mesh_inches: 0,
                hail_pixels: 0,
                bounds: {
                    north: requestedBounds.north,
                    south: requestedBounds.south,
                    east: requestedBounds.east,
                    west: requestedBounds.west,
                },
                requested_bounds: {
                    north: requestedBounds.north,
                    south: requestedBounds.south,
                    east: requestedBounds.east,
                    west: requestedBounds.west,
                },
                image_size: {
                    width: 1,
                    height: 1,
                },
            },
        };
    }
    const trimPad = 2;
    hailRowMin = clamp(hailRowMin - trimPad, rowStart, rowEnd);
    hailRowMax = clamp(hailRowMax + trimPad, rowStart, rowEnd);
    hailColMin = clamp(hailColMin - trimPad, colStart, colEnd);
    hailColMax = clamp(hailColMax + trimPad, colStart, colEnd);
    const width = hailColMax - hailColMin + 1;
    const height = hailRowMax - hailRowMin + 1;
    const rgba = Buffer.alloc(width * height * 4);
    let outputIndex = 0;
    for (let row = hailRowMin; row <= hailRowMax; row += 1) {
        for (let col = hailColMin; col <= hailColMax; col += 1) {
            const mm = composite.mmGrid[row * composite.width + col];
            const inches = mm / 25.4;
            const color = getColorForInches(inches);
            if (color) {
                rgba[outputIndex] = color[0];
                rgba[outputIndex + 1] = color[1];
                rgba[outputIndex + 2] = color[2];
                rgba[outputIndex + 3] = color[3];
            }
            outputIndex += 4;
        }
    }
    const imageBuffer = await sharp(rgba, {
        raw: {
            width,
            height,
            channels: 4,
        },
    })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
    return {
        imageBuffer,
        metadata: {
            product: 'mesh1440',
            source: 'IEM MTArchive',
            ref_time: composite.refTime,
            generated_at: generatedAt,
            archive_file: primaryFile.name,
            archive_url: primaryFile.url,
            composite_files: composite.sourceFiles,
            has_hail: true,
            max_mesh_mm: Number(maxMm.toFixed(1)),
            max_mesh_inches: Number((maxMm / 25.4).toFixed(2)),
            hail_pixels: hailPixels,
            bounds: {
                north: Number((composite.north - hailRowMin * latStep).toFixed(4)),
                south: Number((composite.north - (hailRowMax + 1) * latStep).toFixed(4)),
                west: Number((composite.west + hailColMin * lonStep).toFixed(4)),
                east: Number((composite.west + (hailColMax + 1) * lonStep).toFixed(4)),
            },
            requested_bounds: {
                north: requestedBounds.north,
                south: requestedBounds.south,
                east: requestedBounds.east,
                west: requestedBounds.west,
            },
            image_size: {
                width,
                height,
            },
        },
    };
}
async function downloadArchiveFile(file) {
    const response = await fetch(file.url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
        throw new Error(`Historical MRMS archive file returned ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
}
export async function getHistoricalMrmsOverlay(input) {
    const request = normalizeRequest(input);
    const cacheKey = getCacheKey(request);
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.result;
    }
    const files = await listArchiveFiles(request.date);
    const selectedFiles = chooseArchiveFiles(files, request.anchorTimestamp);
    // Serial download+decode — same reasoning as the vector path below.
    // Parallel downloads were keeping N raw Buffers alive concurrently
    // (~100-200 MB each for 1440-min MESH), and V8's external-memory GC
    // is sticky enough that backfill runs piled up 10+ GB before the
    // container bounced. Serial keeps peak to ~1 file worth of raw.
    const decodedGrids = [];
    const decodedFileNames = [];
    let primaryFile = selectedFiles[selectedFiles.length - 1];
    for (const file of selectedFiles) {
        try {
            const compressed = await downloadArchiveFile(file);
            const raw = zlib.gunzipSync(compressed);
            // `compressed` now unreachable, GC can reclaim it (~5-10 MB).
            const decoded = decodeMrmsGrib2(raw);
            // `raw` now unreachable, GC can reclaim it (~100-200 MB).
            decodedGrids.push(decoded);
            decodedFileNames.push(file.name);
            primaryFile = file;
        }
        catch (err) {
            console.warn(`Historical MRMS: ${file.name} failed: ${err}`);
        }
    }
    if (decodedGrids.length === 0) {
        throw new Error('Historical MRMS: all selected archive files failed to download or decode');
    }
    const composite = buildCompositeGrid(decodedGrids, decodedFileNames);
    // Drop per-file grid refs — composite owns the merged data now.
    decodedGrids.length = 0;
    decodedFileNames.length = 0;
    const result = await renderOverlay(composite, request, primaryFile);
    cache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        result,
    });
    // Hard LRU eviction — Map iteration order is insertion order, so the
    // first key is the oldest. Evict until we're under the cap regardless
    // of expiry. The previous "evict expired only" code allowed unbounded
    // growth inside one long-running request loop (the getAddressHailImpact
    // 467-date walk that OOM'd Susan 21 at 2026-04-24 01:38 UTC, peaking
    // at 13.5GB RSS).
    while (cache.size > 100) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined)
            break;
        cache.delete(oldest);
    }
    return result;
}
// ─── MRMS Point Query (radar-derived hail at specific lat/lng) ──────────────
/** Separate cache for composite grids used in point queries (keyed by date only). */
const compositeGridCache = new Map();
/**
 * Load the daily MRMS MESH composite grid for a given date.
 *
 * Internal helpers (listArchiveFiles / chooseArchiveFiles / downloadArchiveFile)
 * are not exported, so this is the single bridge for tools that need grid-level
 * access — specifically the MRMS backfill runner, which scans cells to emit
 * discrete hail records into verified_hail_events.
 *
 * Returns null when:
 *   - the archive has no MRMS files for the date (older than IEM's archive
 *     window, or a quiet day with no product generated), or
 *   - all downloaded files fail to decode (rare; usually transient IEM hiccup).
 *
 * Caching: shared with getMrmsHailAtPoint, so a backfill day that's already
 * been loaded for a property lookup is free on the second access.
 */
export async function loadMrmsDailyComposite(date) {
    try {
        assertValidDate(date);
        const cKey = `mrms-pt-${date}`;
        const cached = compositeGridCache.get(cKey);
        if (cached && cached.expiresAt > Date.now())
            return cached.composite;
        const files = await listArchiveFiles(date);
        const selectedFiles = chooseArchiveFiles(files);
        const downloadResults = await Promise.allSettled(selectedFiles.map((file) => downloadArchiveFile(file).then((compressed) => ({
            file,
            raw: zlib.gunzipSync(compressed),
        }))));
        const decodedGrids = [];
        const decodedFileNames = [];
        for (const outcome of downloadResults) {
            if (outcome.status === 'fulfilled') {
                try {
                    decodedGrids.push(decodeMrmsGrib2(outcome.value.raw));
                    decodedFileNames.push(outcome.value.file.name);
                }
                catch { /* ignore per-file decode error; others may succeed */ }
            }
        }
        if (decodedGrids.length === 0)
            return null;
        const composite = buildCompositeGrid(decodedGrids, decodedFileNames);
        compositeGridCache.set(cKey, { expiresAt: Date.now() + CACHE_TTL_MS, composite });
        // Prune old cache entries opportunistically (don't let this grow unbounded
        // during a long-running backfill).
        // Hard LRU — Float32Array composite grids are ~60MB each, previously
        // grew unbounded in a long 467-date query.
        // Cap at 10 (was 30). Each composite is a ~100MB Float32Array; 10
        // entries = ~1GB worst case, which is all we can afford to pin in
        // memory on the web container. Nights of backfill runs will cold-fetch
        // dates that aren't in the 10-slot window, but that's 3s of latency
        // per date vs 10GB+ of memory creep.
        while (compositeGridCache.size > 10) {
            const oldest = compositeGridCache.keys().next().value;
            if (oldest === undefined)
                break;
            compositeGridCache.delete(oldest);
        }
        return composite;
    }
    catch {
        return null;
    }
}
/**
 * Query MRMS radar grid for hail sizes at distance bands from a property.
 *
 * This is the radar equivalent of IHM's "At Location / Within 1mi / 3mi / 10mi"
 * columns. Instead of relying on ground spotter reports, it reads the actual
 * NEXRAD-derived MESH (Maximum Estimated Size of Hail) grid values.
 *
 * Returns null if MRMS archive is unavailable for the given date (common for
 * dates >1-2 years old or days without significant weather).
 */
export async function getMrmsHailAtPoint(date, lat, lng) {
    try {
        assertValidDate(date);
        const cKey = `mrms-pt-${date}`;
        let composite;
        const cached = compositeGridCache.get(cKey);
        if (cached && cached.expiresAt > Date.now()) {
            composite = cached.composite;
        }
        else {
            const files = await listArchiveFiles(date);
            const selectedFiles = chooseArchiveFiles(files);
            const downloadResults = await Promise.allSettled(selectedFiles.map((file) => downloadArchiveFile(file).then((compressed) => ({
                file,
                raw: zlib.gunzipSync(compressed),
            }))));
            const decodedGrids = [];
            const decodedFileNames = [];
            for (const outcome of downloadResults) {
                if (outcome.status === 'fulfilled') {
                    try {
                        decodedGrids.push(decodeMrmsGrib2(outcome.value.raw));
                        decodedFileNames.push(outcome.value.file.name);
                    }
                    catch (err) {
                        console.warn(`[MRMS Point] Decode error: ${err}`);
                    }
                }
            }
            if (decodedGrids.length === 0)
                return null;
            composite = buildCompositeGrid(decodedGrids, decodedFileNames);
            compositeGridCache.set(cKey, { expiresAt: Date.now() + CACHE_TTL_MS, composite });
            // Prune old entries
            if (compositeGridCache.size > 30) {
                const now = Date.now();
                for (const [k, v] of compositeGridCache.entries()) {
                    if (v.expiresAt <= now)
                        compositeGridCache.delete(k);
                }
            }
        }
        // Convert lat/lng to grid row/col
        const latStep = (composite.north - composite.south) / (composite.height - 1);
        const lonStep = (composite.east - composite.west) / (composite.width - 1);
        const centerRow = Math.round((composite.north - lat) / latStep);
        const centerCol = Math.round((lng - composite.west) / lonStep);
        if (centerRow < 0 || centerRow >= composite.height ||
            centerCol < 0 || centerCol >= composite.width) {
            return null; // Point outside MRMS CONUS grid
        }
        // Distance bands in grid cells.
        // MRMS grid ≈ 0.01° ≈ 1.1km ≈ 0.68mi per cell.
        // radius 0 cells → the single cell the home sits in (~1km² ≈ 0.4mi²).
        //                  This is the HONEST "At Location" — tightened from r=1
        //                  (which sampled ~0.68mi / 9 cells and misled adjusters).
        // radius 2 cells → ~1.36mi  (covers "Within 1mi")
        // radius 5 cells → ~3.4mi   (covers "Within 3mi")
        // radius 16 cells → ~10.9mi (covers "Within 10mi")
        const bands = [
            { key: 'atLocation', radius: 0 },
            { key: 'within1mi', radius: 2 },
            { key: 'within3mi', radius: 5 },
            { key: 'within10mi', radius: 16 },
        ];
        const result = {
            atLocation: null,
            within1mi: null,
            within3mi: null,
            within10mi: null,
        };
        for (const band of bands) {
            let maxMm = 0;
            const r = band.radius;
            for (let dr = -r; dr <= r; dr++) {
                for (let dc = -r; dc <= r; dc++) {
                    if (dr * dr + dc * dc > r * r)
                        continue; // Circle, not square
                    const row = centerRow + dr;
                    const col = centerCol + dc;
                    if (row < 0 || row >= composite.height || col < 0 || col >= composite.width)
                        continue;
                    const mm = composite.mmGrid[row * composite.width + col];
                    if (mm > maxMm)
                        maxMm = mm;
                }
            }
            const inches = maxMm / 25.4;
            // Floor at 0.13" (⅛"). Sub-½" hail isn't insurance-actionable but reps still
            // want to see it on the map (canvassing context, leading-edge of a storm).
            if (inches < 0.13) {
                result[band.key] = null;
            }
            else if (inches < 0.50) {
                result[band.key] = Math.round(inches * 8) / 8; // nearest ⅛" for sub-½"
            }
            else {
                result[band.key] = Math.round(inches * 4) / 4; // nearest ¼" for ≥½"
            }
        }
        return result;
    }
    catch (e) {
        // MRMS archive doesn't exist for this date — normal for older dates or quiet days
        return null;
    }
}
/**
 * Probe MRMS for hail at a point over the last N days. Fills the gap where
 * NOAA Storm Events DB lags 3-14 days behind live weather — reps need to see
 * yesterday's and today's storms *today*, not next week.
 *
 * Runs all day-lookups in parallel. Returns only days where MRMS detected
 * hail at any band (atLocation through within10mi). Safe to call from
 * request paths: bounded to <= days * (1 GRIB download ≈ 2-5s), and
 * compositeGridCache amortizes repeated calls on the same day.
 */
export async function getRecentMrmsHailAtPoint(lat, lng, days = 3) {
    const dayStrings = [];
    const today = new Date();
    for (let i = 0; i < days; i++) {
        const d = new Date(today);
        d.setUTCDate(d.getUTCDate() - i);
        dayStrings.push(d.toISOString().slice(0, 10));
    }
    const results = await Promise.all(dayStrings.map(async (date) => {
        try {
            const r = await getMrmsHailAtPoint(date, lat, lng);
            if (!r)
                return null;
            const values = [r.atLocation, r.within1mi, r.within3mi, r.within10mi].filter((v) => v !== null);
            if (values.length === 0)
                return null;
            const maxInches = Math.max(...values);
            return { date, ...r, maxInches };
        }
        catch {
            return null;
        }
    }));
    return results.filter((d) => d !== null);
}
// ─── MRMS Composite Grid Export (for vector polygon pipeline) ─────────────
import { meshGridToPolygons } from './meshVectorService.js';
/** Cache for pre-computed swath polygon GeoJSON (keyed by date + bounds). */
const swathPolyCache = new Map();
/** Round bounds to 2dp so near-identical viewport requests share the cache. */
function roundBounds(r) {
    return {
        north: Number(r.north.toFixed(2)),
        south: Number(r.south.toFixed(2)),
        east: Number(r.east.toFixed(2)),
        west: Number(r.west.toFixed(2)),
        anchorTimestamp: r.anchorTimestamp || '',
    };
}
/**
 * Try to load a previously-computed swath polygon collection from the durable
 * Postgres cache (mrms_swath_cache). Returns null if no live entry exists.
 * Silently degrades on DB errors — the GRIB pipeline will run instead.
 */
async function loadSwathFromDb(pool, date, bounds) {
    try {
        const { rows } = await pool.query(`SELECT geojson FROM mrms_swath_cache
         WHERE storm_date = $1
           AND north = $2 AND south = $3 AND east = $4 AND west = $5
           AND anchor_timestamp = $6
           AND expires_at > NOW()
         LIMIT 1`, [date, bounds.north, bounds.south, bounds.east, bounds.west, bounds.anchorTimestamp]);
        if (rows.length === 0)
            return null;
        return rows[0].geojson;
    }
    catch (err) {
        console.warn('[MRMS Vector] DB cache read failed:', err.message);
        return null;
    }
}
/**
 * Persist a freshly computed swath polygon collection. Upsert by
 * (date, bounds, anchor) so re-computed results replace stale entries.
 * Silently degrades on DB errors — the in-memory cache still works.
 */
async function saveSwathToDb(pool, date, bounds, result) {
    try {
        await pool.query(`INSERT INTO mrms_swath_cache
         (storm_date, north, south, east, west, anchor_timestamp,
          geojson, max_mesh_inches, hail_cells, feature_count, source_files, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW() + INTERVAL '6 hours')
       ON CONFLICT (storm_date, north, south, east, west, anchor_timestamp)
       DO UPDATE SET
         geojson = EXCLUDED.geojson,
         max_mesh_inches = EXCLUDED.max_mesh_inches,
         hail_cells = EXCLUDED.hail_cells,
         feature_count = EXCLUDED.feature_count,
         source_files = EXCLUDED.source_files,
         expires_at = EXCLUDED.expires_at,
         created_at = NOW()`, [
            date,
            bounds.north,
            bounds.south,
            bounds.east,
            bounds.west,
            bounds.anchorTimestamp,
            JSON.stringify(result),
            result.metadata.maxMeshInches,
            result.metadata.hailCells,
            result.features.length,
            result.metadata.sourceFiles,
        ]);
    }
    catch (err) {
        console.warn('[MRMS Vector] DB cache write failed:', err.message);
    }
}
/** Periodic cleanup — deletes expired swath cache rows. */
export async function cleanExpiredSwathCache(pool) {
    try {
        const { rowCount } = await pool.query(`DELETE FROM mrms_swath_cache WHERE expires_at <= NOW()`);
        return rowCount ?? 0;
    }
    catch (err) {
        console.warn('[MRMS Vector] DB cache cleanup failed:', err.message);
        return 0;
    }
}
/**
 * Get MRMS hail swath as vector GeoJSON polygons for a given date and bounds.
 *
 * This is the key upgrade over the raster PNG overlay — produces crisp, clickable
 * vector polygons at 10 forensic hail size levels. Same data, better rendering.
 *
 * Cache hierarchy: in-memory (~1ms) → Postgres (~20-50ms) → GRIB decode (~2-5s).
 * Pass `pool` to enable the durable Postgres layer; omit for memory-only cache.
 */
export async function getHistoricalMrmsSwathPolygons(input, pool) {
    const request = normalizeRequest(input);
    const polyKey = `swath-poly-${request.date}-${request.anchorTimestamp || ''}-${request.north.toFixed(2)},${request.south.toFixed(2)},${request.east.toFixed(2)},${request.west.toFixed(2)}`;
    const cached = swathPolyCache.get(polyKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.result;
    }
    // Try the durable DB cache before hitting GRIB archives.
    if (pool) {
        const roundedBounds = roundBounds(request);
        const dbHit = await loadSwathFromDb(pool, request.date, roundedBounds);
        if (dbHit) {
            swathPolyCache.set(polyKey, { expiresAt: Date.now() + CACHE_TTL_MS, result: dbHit });
            return dbHit;
        }
    }
    // Reuse composite grid cache if available (from point query or image render)
    const cKey = `mrms-pt-${request.date}`;
    let composite;
    const cachedGrid = compositeGridCache.get(cKey);
    if (cachedGrid && cachedGrid.expiresAt > Date.now()) {
        composite = cachedGrid.composite;
    }
    else {
        const files = await listArchiveFiles(request.date);
        const selectedFiles = chooseArchiveFiles(files, request.anchorTimestamp);
        // Serial download+decode, NOT Promise.allSettled. Each file's raw and
        // decompressed Buffers are ~100-200 MB for the 1440-min MESH product;
        // allSettled kept all N files' raw Buffers alive in the function's
        // scope until they all finished, peaking ~400-800 MB per iteration.
        // V8's external-memory GC is sticky and didn't reclaim between backfill
        // calls, causing the 14 GB RSS creep. Serial mode keeps peak at ~1 file.
        const decodedGrids = [];
        const decodedFileNames = [];
        for (const file of selectedFiles) {
            try {
                const compressed = await downloadArchiveFile(file);
                const raw = zlib.gunzipSync(compressed);
                // `compressed` Buffer is now unreachable — GC can reclaim ~5-10 MB.
                const decoded = decodeMrmsGrib2(raw);
                // `raw` Buffer is now unreachable — GC can reclaim ~100-200 MB.
                decodedGrids.push(decoded);
                decodedFileNames.push(file.name);
            }
            catch (err) {
                console.warn(`[MRMS Vector] ${file.name} download/decode error: ${err}`);
            }
        }
        if (decodedGrids.length === 0) {
            throw new Error('MRMS Vector: all archive files failed to download or decode');
        }
        composite = buildCompositeGrid(decodedGrids, decodedFileNames);
        // Drop refs to per-file grids as soon as composite is built — they
        // aren't needed again, and holding them until function return
        // doubles the external-memory footprint during the downstream
        // polygon build step.
        decodedGrids.length = 0;
        decodedFileNames.length = 0;
        compositeGridCache.set(cKey, { expiresAt: Date.now() + CACHE_TTL_MS, composite });
    }
    // Crop the grid to the requested bounds (+ padding) for faster contouring
    const { rowStart, rowEnd, colStart, colEnd } = gridBoundsToIndices(composite, request);
    const cropWidth = colEnd - colStart + 1;
    const cropHeight = rowEnd - rowStart + 1;
    const croppedGrid = new Float32Array(cropWidth * cropHeight);
    for (let row = rowStart; row <= rowEnd; row++) {
        for (let col = colStart; col <= colEnd; col++) {
            croppedGrid[(row - rowStart) * cropWidth + (col - colStart)] =
                composite.mmGrid[row * composite.width + col];
        }
    }
    const latStep = (composite.north - composite.south) / (composite.height - 1);
    const lonStep = (composite.east - composite.west) / (composite.width - 1);
    const gridInput = {
        mmGrid: croppedGrid,
        width: cropWidth,
        height: cropHeight,
        north: composite.north - rowStart * latStep,
        south: composite.north - rowEnd * latStep,
        east: composite.west + colEnd * lonStep,
        west: composite.west + colStart * lonStep,
        sourceFiles: composite.sourceFiles,
        refTime: composite.refTime,
    };
    const result = meshGridToPolygons(gridInput, request.date);
    // For today and yesterday, use a short TTL on empty results — the 1440-min
    // product refreshes every 30 min and new hail can appear any tick. Caching
    // "0 features" for 6h would hide in-progress storms from reps.
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const isRecent = request.date === today || request.date === yesterday;
    const isEmpty = result.features.length === 0;
    const ttlMs = isRecent && isEmpty ? 5 * 60 * 1000 : CACHE_TTL_MS;
    // Cache in memory
    swathPolyCache.set(polyKey, { expiresAt: Date.now() + ttlMs, result });
    // Persist to DB so the result survives a server restart. Skip DB persist
    // for empty-recent results — they'd outlive in-memory TTL and re-poison.
    if (pool && !(isRecent && isEmpty)) {
        const roundedBounds = roundBounds(request);
        // Fire-and-forget: we already have the result, don't block the response.
        void saveSwathToDb(pool, request.date, roundedBounds, result);
    }
    // Hard LRU eviction. Cap at 20 (was 50). Polygon objects are small
    // (~200KB each) so even the old cap wasn't the primary leak, but
    // tightening helps bound worst-case RSS during long backfill runs.
    while (swathPolyCache.size > 20) {
        const oldest = swathPolyCache.keys().next().value;
        if (oldest === undefined)
            break;
        swathPolyCache.delete(oldest);
    }
    return result;
}
