/**
 * Map Image Service
 *
 * Generates static map images for PDF reports.
 * Primary: Google Static Maps API (if GOOGLE_MAPS_API_KEY is set)
 * Fallback: OpenStreetMap static image via OSM Static Maps service
 */

interface MapImageParams {
  lat: number;
  lng: number;
  zoom?: number;
  width?: number;
  height?: number;
  markers?: Array<{
    lat: number;
    lng: number;
    color?: string;
    label?: string;
  }>;
}

// Cache (24h TTL)
const cache = new Map<string, { data: Buffer; expires: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

function getCacheKey(params: MapImageParams): string {
  return `${params.lat.toFixed(5)}_${params.lng.toFixed(5)}_${params.zoom || 14}_${params.width || 600}_${params.height || 300}`;
}

/**
 * Fetch a static map image for a given location.
 * Tries Google Static Maps first (if API key available), then falls back to OSM.
 */
export async function fetchMapImage(params: MapImageParams): Promise<Buffer | null> {
  const key = getCacheKey(params);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const googleKey = process.env.GOOGLE_MAPS_API_KEY;

  let imageBuffer: Buffer | null = null;

  if (googleKey) {
    imageBuffer = await fetchGoogleStaticMap(params, googleKey);
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
        if (v.expires < now) cache.delete(k);
      }
    }
  }

  return imageBuffer;
}

/**
 * Google Static Maps API
 */
async function fetchGoogleStaticMap(params: MapImageParams, apiKey: string): Promise<Buffer | null> {
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

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(`Google Maps error: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log(`✅ Google map image: ${buffer.length} bytes`);
    return buffer;
  } catch (error) {
    console.error('Google Static Maps fetch failed:', error);
    return null;
  }
}

/**
 * OpenStreetMap static image via Geoapify (free tier: 3000 req/day)
 * Falls back to plain tile compositing if Geoapify is unavailable
 */
async function fetchOSMStaticMap(params: MapImageParams): Promise<Buffer | null> {
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
  } catch (e) {
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
      headers: { 'User-Agent': 'RoofER-StormIntelligence/1.0' }
    });

    if (!response.ok) {
      console.error(`OSM tile error: ${response.status}`);
      return null;
    }

    const buf = Buffer.from(await response.arrayBuffer());
    console.log(`✅ OSM tile image: ${buf.length} bytes`);
    return buf;
  } catch (error) {
    console.error('OSM tile fetch failed:', error);
    return null;
  }
}
