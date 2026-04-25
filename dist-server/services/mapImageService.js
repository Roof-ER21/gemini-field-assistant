/**
 * Map Image Service
 *
 * Generates static map images for PDF reports.
 * Primary: Google Static Maps API (if GOOGLE_MAPS_API_KEY is set)
 * Fallback: OpenStreetMap static image via OSM Static Maps service
 */
// Cache (24h TTL)
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;
function getCacheKey(params) {
    return `${params.lat.toFixed(5)}_${params.lng.toFixed(5)}_${params.zoom || 14}_${params.width || 600}_${params.height || 300}`;
}
/**
 * Fetch a static map image for a given location.
 * Tries Google Static Maps first (if API key available), then falls back to OSM.
 */
export async function fetchMapImage(params) {
    const key = getCacheKey(params);
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) {
        return cached.data;
    }
    const googleKey = process.env.GOOGLE_MAPS_API_KEY;
    // VITE_-prefixed env is set on Railway for the client build but is also
    // readable server-side. Mapbox Static Images uses the same token as the
    // tile API. 50K free/mo on the standard plan — plenty for PDF generation.
    const mapboxToken = process.env.MAPBOX_TOKEN || process.env.VITE_MAPBOX_TOKEN;
    let imageBuffer = null;
    if (googleKey) {
        imageBuffer = await fetchGoogleStaticMap(params, googleKey);
    }
    if (!imageBuffer && mapboxToken) {
        imageBuffer = await fetchMapboxStaticMap(params, mapboxToken);
    }
    if (!imageBuffer) {
        imageBuffer = await fetchOSMStaticMap(params);
    }
    if (imageBuffer) {
        cache.set(key, { data: imageBuffer, expires: Date.now() + CACHE_TTL });
        // Clean old cache
        if (cache.size > 50) {
            const now = Date.now();
            for (const [k, v] of cache) {
                if (v.expires < now)
                    cache.delete(k);
            }
        }
    }
    return imageBuffer;
}
/**
 * Google Static Maps API
 */
async function fetchGoogleStaticMap(params, apiKey) {
    const { lat, lng, zoom = 14, width = 600, height = 300, markers = [] } = params;
    try {
        const url = new URL('https://maps.googleapis.com/maps/api/staticmap');
        url.searchParams.set('center', `${lat},${lng}`);
        url.searchParams.set('zoom', zoom.toString());
        url.searchParams.set('size', `${width}x${height}`);
        url.searchParams.set('maptype', 'hybrid');
        url.searchParams.set('key', apiKey);
        // Add property marker
        url.searchParams.append('markers', `color:red|label:P|${lat},${lng}`);
        // Add additional markers
        markers.forEach(m => {
            url.searchParams.append('markers', `color:${m.color || 'blue'}|label:${m.label || ''}|${m.lat},${m.lng}`);
        });
        console.log(`🗺️ Fetching Google Static Map for ${lat.toFixed(4)},${lng.toFixed(4)}`);
        const response = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
        if (!response.ok) {
            console.error(`Google Maps error: ${response.status}`);
            return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        console.log(`✅ Google map image: ${buffer.length} bytes`);
        return buffer;
    }
    catch (error) {
        console.error('Google Static Maps fetch failed:', error);
        return null;
    }
}
/**
 * OpenStreetMap static image via Geoapify (free tier: 3000 req/day)
 * Falls back to plain tile compositing if Geoapify is unavailable
 */
/**
 * Mapbox Static Images API — used as fallback when GOOGLE_MAPS_API_KEY is
 * unset. Reuses the same token the live web map uses (VITE_MAPBOX_TOKEN).
 * Output: styled satellite-streets map with a red pin on the subject property.
 * Same shape as Google Static Maps — caller doesn't need to know the source.
 */
async function fetchMapboxStaticMap(params, token) {
    const { lat, lng, zoom = 14, width = 600, height = 300, markers = [] } = params;
    try {
        // Pin overlays — comma-separated list of `pin-s-{label}+{color}({lng},{lat})`.
        // Property pin first, then any extra markers.
        const overlays = [`pin-s-p+ff0000(${lng},${lat})`];
        for (const m of markers) {
            const color = (m.color || 'blue').replace('#', '');
            const label = (m.label || 'm').slice(0, 1).toLowerCase();
            overlays.push(`pin-s-${label}+${color}(${m.lng},${m.lat})`);
        }
        const overlayPath = overlays.join(',');
        const url = `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/` +
            `${overlayPath}/${lng},${lat},${zoom}/${width}x${height}@2x?access_token=${token}`;
        console.log(`🗺️ Fetching Mapbox Static Map for ${lat.toFixed(4)},${lng.toFixed(4)} (zoom=${zoom})`);
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) {
            console.error(`Mapbox static error: ${response.status} ${await response.text().catch(() => '')}`);
            return null;
        }
        const buf = Buffer.from(await response.arrayBuffer());
        console.log(`✅ Mapbox static map: ${buf.length} bytes`);
        return buf;
    }
    catch (e) {
        console.error('Mapbox static fetch failed:', e);
        return null;
    }
}
async function fetchOSMStaticMap(params) {
    const { lat, lng, zoom = 14, width = 600, height = 300 } = params;
    // Try Geoapify first (free, no key required for basic static maps)
    try {
        const geoapifyKey = process.env.GEOAPIFY_API_KEY;
        if (geoapifyKey) {
            const url = `https://maps.geoapify.com/v1/staticmap?` +
                `style=osm-bright&width=${width}&height=${height}&center=lonlat:${lng},${lat}&zoom=${zoom}` +
                `&marker=lonlat:${lng},${lat};color:%23ff0000;size:large` +
                `&apiKey=${geoapifyKey}`;
            const response = await fetch(url);
            if (response.ok) {
                const buf = Buffer.from(await response.arrayBuffer());
                console.log(`✅ Geoapify map image: ${buf.length} bytes`);
                return buf;
            }
        }
    }
    catch (e) {
        console.warn('Geoapify fetch failed:', e);
    }
    // Fallback: use OSM tile server to get a single center tile
    try {
        // Convert lat/lng/zoom to tile coordinates
        const n = Math.pow(2, zoom);
        const x = Math.floor(((lng + 180) / 360) * n);
        const latRad = (lat * Math.PI) / 180;
        const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
        const tileUrl = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
        console.log(`🗺️ Fetching OSM tile for ${lat.toFixed(4)},${lng.toFixed(4)}`);
        const response = await fetch(tileUrl, {
            headers: { 'User-Agent': 'RoofER-StormIntelligence/1.0' },
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) {
            console.error(`OSM tile error: ${response.status}`);
            return null;
        }
        const buf = Buffer.from(await response.arrayBuffer());
        console.log(`✅ OSM tile image: ${buf.length} bytes`);
        return buf;
    }
    catch (error) {
        console.error('OSM tile fetch failed:', error);
        return null;
    }
}
