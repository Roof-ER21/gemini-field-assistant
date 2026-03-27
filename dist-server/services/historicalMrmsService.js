import sharp from 'sharp';
import zlib from 'zlib';
const ARCHIVE_BASE = 'https://mtarchive.geol.iastate.edu';
const PRODUCT_PATH = 'MESH_Max_1440min';
const PRODUCT_PREFIX = 'MESH_Max_1440min_00.50_';
const USER_AGENT = 'RoofER-StormMaps/1.0';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const HAIL_COLORS = [
    { minInches: 0.25, maxInches: 0.75, rgba: [0, 255, 0, 170] },
    { minInches: 0.75, maxInches: 1.0, rgba: [255, 255, 0, 182] },
    { minInches: 1.0, maxInches: 1.5, rgba: [255, 165, 0, 194] },
    { minInches: 1.5, maxInches: 1.75, rgba: [255, 102, 0, 208] },
    { minInches: 1.75, maxInches: 2.5, rgba: [255, 0, 0, 220] },
    { minInches: 2.5, maxInches: 4.5, rgba: [139, 0, 0, 232] },
    { minInches: 4.5, maxInches: Infinity, rgba: [128, 0, 128, 244] },
];
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
    const pattern = new RegExp(`href="(${PRODUCT_PREFIX}(\\d{8}-\\d{6})\\.grib2\\.gz)"`, 'g');
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
function chooseArchiveFile(files, anchorTimestamp) {
    if (!anchorTimestamp) {
        return files[files.length - 1];
    }
    const parsedAnchor = new Date(anchorTimestamp);
    if (Number.isNaN(parsedAnchor.getTime())) {
        return files[files.length - 1];
    }
    const compactAnchor = parsedAnchor.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
    const match = [...files].reverse().find((file) => file.compactTimestamp <= compactAnchor);
    return match || files[files.length - 1];
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
function decodeMrmsGrib2(raw) {
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
function gridBoundsToIndices(decoded, requestedBounds) {
    const latStep = (decoded.north - decoded.south) / (decoded.height - 1);
    const lonStep = (decoded.east - decoded.west) / (decoded.width - 1);
    const padCells = 12;
    const rowStart = clamp(Math.floor((decoded.north - requestedBounds.north) / latStep) - padCells, 0, decoded.height - 1);
    const rowEnd = clamp(Math.ceil((decoded.north - requestedBounds.south) / latStep) + padCells, 0, decoded.height - 1);
    const colStart = clamp(Math.floor((requestedBounds.west - decoded.west) / lonStep) - padCells, 0, decoded.width - 1);
    const colEnd = clamp(Math.ceil((requestedBounds.east - decoded.west) / lonStep) + padCells, 0, decoded.width - 1);
    return { rowStart, rowEnd, colStart, colEnd };
}
async function renderOverlay(decoded, requestedBounds, file) {
    const { rowStart, rowEnd, colStart, colEnd } = gridBoundsToIndices(decoded, requestedBounds);
    const subsetWidth = colEnd - colStart + 1;
    const subsetHeight = rowEnd - rowStart + 1;
    let hailPixels = 0;
    let maxMm = 0;
    let hailRowMin = Number.POSITIVE_INFINITY;
    let hailRowMax = Number.NEGATIVE_INFINITY;
    let hailColMin = Number.POSITIVE_INFINITY;
    let hailColMax = Number.NEGATIVE_INFINITY;
    for (let row = rowStart; row <= rowEnd; row += 1) {
        for (let col = colStart; col <= colEnd; col += 1) {
            const offset = (row * decoded.width + col) * 2;
            const rawValue = decoded.data.readUInt16BE(offset);
            const mm = getValueMillimeters(decoded, rawValue);
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
    const latStep = (decoded.north - decoded.south) / (decoded.height - 1);
    const lonStep = (decoded.east - decoded.west) / (decoded.width - 1);
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
                ref_time: decoded.refTime,
                generated_at: generatedAt,
                archive_file: file.name,
                archive_url: file.url,
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
            const offset = (row * decoded.width + col) * 2;
            const rawValue = decoded.data.readUInt16BE(offset);
            const mm = getValueMillimeters(decoded, rawValue);
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
            ref_time: decoded.refTime,
            generated_at: generatedAt,
            archive_file: file.name,
            archive_url: file.url,
            has_hail: true,
            max_mesh_mm: Number(maxMm.toFixed(1)),
            max_mesh_inches: Number((maxMm / 25.4).toFixed(2)),
            hail_pixels: hailPixels,
            bounds: {
                north: Number((decoded.north - hailRowMin * latStep).toFixed(4)),
                south: Number((decoded.north - (hailRowMax + 1) * latStep).toFixed(4)),
                west: Number((decoded.west + hailColMin * lonStep).toFixed(4)),
                east: Number((decoded.west + (hailColMax + 1) * lonStep).toFixed(4)),
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
    const file = chooseArchiveFile(files, request.anchorTimestamp);
    const compressedBuffer = await downloadArchiveFile(file);
    const rawBuffer = zlib.gunzipSync(compressedBuffer);
    const decoded = decodeMrmsGrib2(rawBuffer);
    const result = await renderOverlay(decoded, request, file);
    cache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        result,
    });
    if (cache.size > 100) {
        const now = Date.now();
        for (const [key, entry] of cache.entries()) {
            if (entry.expiresAt <= now) {
                cache.delete(key);
            }
        }
    }
    return result;
}
