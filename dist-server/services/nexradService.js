/**
 * NEXRAD Radar Image Service
 *
 * Fetches historical NEXRAD radar imagery from Iowa Environmental Mesonet (IEM) WMS-T.
 * Free public service, no API key required.
 * Returns PNG buffers suitable for embedding in PDFKit reports.
 */
// Simple in-memory cache (24h TTL)
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
function getCacheKey(params) {
    const dt = new Date(params.datetime);
    // Round to nearest 5 minutes for cache hits
    dt.setMinutes(Math.round(dt.getMinutes() / 5) * 5, 0, 0);
    return `${params.lat.toFixed(3)}_${params.lng.toFixed(3)}_${dt.toISOString()}_${params.width || 600}_${params.height || 400}`;
}
/**
 * Convert miles to approximate degrees at a given latitude
 */
function milesToDegrees(miles, lat) {
    const dLat = miles / 69.0;
    const dLng = miles / (69.0 * Math.cos((lat * Math.PI) / 180));
    return { dLat, dLng };
}
/**
 * Fetch a NEXRAD radar image for a given location and time.
 * Uses IEM WMS-T service: https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r-t.cgi
 */
export async function fetchNexradImage(params) {
    const { lat, lng, datetime, width = 600, height = 400, zoomMiles = 50 } = params;
    // Check cache
    const key = getCacheKey(params);
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) {
        return cached.data;
    }
    try {
        const dt = new Date(datetime);
        // Round to nearest 5 minutes (NEXRAD scan interval)
        dt.setMinutes(Math.round(dt.getMinutes() / 5) * 5, 0, 0);
        const timeStr = dt.toISOString().replace(/\.\d{3}Z$/, 'Z');
        // Calculate bounding box
        const { dLat, dLng } = milesToDegrees(zoomMiles, lat);
        const bbox = [
            lng - dLng,
            lat - dLat,
            lng + dLng,
            lat + dLat
        ];
        // WMS GetMap request for NEXRAD base reflectivity
        const wmsUrl = new URL('https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r-t.cgi');
        wmsUrl.searchParams.set('SERVICE', 'WMS');
        wmsUrl.searchParams.set('VERSION', '1.1.1');
        wmsUrl.searchParams.set('REQUEST', 'GetMap');
        wmsUrl.searchParams.set('LAYERS', 'nexrad-n0r-wmst');
        wmsUrl.searchParams.set('FORMAT', 'image/png');
        wmsUrl.searchParams.set('TRANSPARENT', 'true');
        wmsUrl.searchParams.set('SRS', 'EPSG:4326');
        wmsUrl.searchParams.set('BBOX', bbox.join(','));
        wmsUrl.searchParams.set('WIDTH', width.toString());
        wmsUrl.searchParams.set('HEIGHT', height.toString());
        wmsUrl.searchParams.set('TIME', timeStr);
        console.log(`🛰️ Fetching NEXRAD radar for ${lat.toFixed(3)},${lng.toFixed(3)} at ${timeStr}`);
        const response = await fetch(wmsUrl.toString(), {
            headers: { 'User-Agent': 'RoofER-StormIntelligence/1.0' }
        });
        if (!response.ok) {
            console.error(`NEXRAD WMS error: ${response.status} ${response.statusText}`);
            return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);
        // Validate we got an actual image (not an error XML)
        if (imageBuffer.length < 500) {
            console.warn('NEXRAD image too small, may be empty or error response');
        }
        const result = {
            imageBuffer,
            timestamp: timeStr,
            bbox
        };
        // Cache the result
        cache.set(key, { data: result, expires: Date.now() + CACHE_TTL });
        // Clean old cache entries periodically
        if (cache.size > 100) {
            const now = Date.now();
            for (const [k, v] of cache) {
                if (v.expires < now)
                    cache.delete(k);
            }
        }
        console.log(`✅ NEXRAD image fetched: ${imageBuffer.length} bytes`);
        return result;
    }
    catch (error) {
        console.error('Failed to fetch NEXRAD image:', error);
        return null;
    }
}
/**
 * Fetch multiple NEXRAD frames for animation (time-lapse around a storm event)
 */
export async function fetchNexradTimelapse(lat, lng, datetime, frameCount = 6, intervalMinutes = 10) {
    const dt = new Date(datetime);
    const halfSpan = Math.floor(frameCount / 2);
    const frames = [];
    for (let i = -halfSpan; i < frameCount - halfSpan; i++) {
        const frameTime = new Date(dt.getTime() + i * intervalMinutes * 60 * 1000);
        const result = await fetchNexradImage({
            lat,
            lng,
            datetime: frameTime.toISOString(),
            width: 400,
            height: 300,
            zoomMiles: 40
        });
        if (result) {
            frames.push(result);
        }
    }
    return frames;
}
