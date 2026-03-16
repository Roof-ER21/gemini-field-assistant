/**
 * NEXRAD Radar Image Service
 *
 * Fetches historical NEXRAD radar imagery from Iowa Environmental Mesonet (IEM) WMS-T.
 * Composites radar data over a dark basemap for professional appearance.
 * Free public service, no API key required.
 * Returns PNG buffers suitable for embedding in PDFKit reports.
 */

import sharp from 'sharp';

interface NexradImageParams {
  lat: number;
  lng: number;
  datetime: string; // ISO date string of the storm event
  width?: number;
  height?: number;
  zoomMiles?: number; // Approximate radius in miles to show
}

interface NexradResult {
  imageBuffer: Buffer;
  timestamp: string;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

// Simple in-memory cache (24h TTL)
const cache = new Map<string, { data: NexradResult; expires: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCacheKey(params: NexradImageParams): string {
  const dt = new Date(params.datetime);
  // Round to nearest 5 minutes for cache hits
  dt.setMinutes(Math.round(dt.getMinutes() / 5) * 5, 0, 0);
  return `${params.lat.toFixed(3)}_${params.lng.toFixed(3)}_${dt.toISOString()}_${params.width || 600}_${params.height || 400}`;
}

/**
 * Convert miles to approximate degrees at a given latitude
 */
function milesToDegrees(miles: number, lat: number): { dLat: number; dLng: number } {
  const dLat = miles / 69.0;
  const dLng = miles / (69.0 * Math.cos((lat * Math.PI) / 180));
  return { dLat, dLng };
}

/**
 * Fetch a NEXRAD radar image for a given location and time.
 * Uses IEM WMS-T service: https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r-t.cgi
 */
export async function fetchNexradImage(params: NexradImageParams): Promise<NexradResult | null> {
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
    const bbox: [number, number, number, number] = [
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

    // Fetch dark basemap + NEXRAD radar layer in parallel
    const [radarResponse, basemapBuffer] = await Promise.all([
      fetch(wmsUrl.toString(), {
        headers: { 'User-Agent': 'RoofER-StormIntelligence/1.0' },
        signal: AbortSignal.timeout(15000)
      }),
      fetchDarkBasemap(bbox, width, height)
    ]);

    if (!radarResponse.ok) {
      console.error(`NEXRAD WMS error: ${radarResponse.status} ${radarResponse.statusText}`);
      return null;
    }

    const radarArrayBuffer = await radarResponse.arrayBuffer();
    const radarBuffer = Buffer.from(radarArrayBuffer);

    // Validate we got an actual image (not an error XML)
    if (radarBuffer.length < 500) {
      console.warn('NEXRAD image too small, may be empty or error response');
    }

    // Composite: dark basemap + radar overlay
    let imageBuffer: Buffer;
    if (basemapBuffer && radarBuffer.length >= 500) {
      try {
        imageBuffer = await sharp(basemapBuffer)
          .resize(width, height)
          .composite([{
            input: await sharp(radarBuffer).resize(width, height).png().toBuffer(),
            blend: 'over'
          }])
          .png()
          .toBuffer();
        console.log(`✅ Composited NEXRAD over basemap: ${imageBuffer.length} bytes`);
      } catch (compErr) {
        console.warn('Composite failed, using radar only:', compErr);
        imageBuffer = radarBuffer;
      }
    } else if (basemapBuffer && radarBuffer.length < 500) {
      // No radar data for this time — use basemap with a dark tint
      imageBuffer = basemapBuffer;
    } else {
      imageBuffer = radarBuffer;
    }

    const result: NexradResult = {
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
        if (v.expires < now) cache.delete(k);
      }
    }

    console.log(`✅ NEXRAD image fetched: ${imageBuffer.length} bytes`);
    return result;
  } catch (error) {
    console.error('Failed to fetch NEXRAD image:', error);
    return null;
  }
}

/**
 * Fetch a dark-themed basemap for the given bounding box.
 * Uses CartoDB dark_all tiles (free, no key required).
 * Composites a 3x3 tile grid for the approximate bbox area.
 */
async function fetchDarkBasemap(
  bbox: [number, number, number, number],
  width: number,
  height: number
): Promise<Buffer | null> {
  try {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    const spanLng = maxLng - minLng;

    // Calculate zoom level from bbox span
    const zoom = Math.max(5, Math.min(12, Math.floor(Math.log2(360 / spanLng))));

    // Convert center to tile coords
    const n = Math.pow(2, zoom);
    const centerTileX = ((centerLng + 180) / 360) * n;
    const latRad = (centerLat * Math.PI) / 180;
    const centerTileY = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;

    // Fetch a 3x3 grid of tiles around center
    const tileSize = 256;
    const gridSize = 3;
    const startX = Math.floor(centerTileX) - 1;
    const startY = Math.floor(centerTileY) - 1;

    const tilePromises: Promise<{ x: number; y: number; buffer: Buffer | null }>[] = [];

    for (let dy = 0; dy < gridSize; dy++) {
      for (let dx = 0; dx < gridSize; dx++) {
        const tx = startX + dx;
        const ty = startY + dy;
        tilePromises.push(
          fetch(`https://basemaps.cartocdn.com/dark_all/${zoom}/${tx}/${ty}.png`, {
            headers: { 'User-Agent': 'RoofER-StormIntelligence/1.0' },
            signal: AbortSignal.timeout(10000)
          })
            .then(async (res) => ({
              x: dx, y: dy,
              buffer: res.ok ? Buffer.from(await res.arrayBuffer()) : null
            }))
            .catch(() => ({ x: dx, y: dy, buffer: null }))
        );
      }
    }

    const tiles = await Promise.all(tilePromises);

    // Composite tiles into a single image
    const compositeWidth = gridSize * tileSize;
    const compositeHeight = gridSize * tileSize;

    const composites = tiles
      .filter(t => t.buffer)
      .map(t => ({
        input: t.buffer!,
        left: t.x * tileSize,
        top: t.y * tileSize
      }));

    if (composites.length === 0) return null;

    const basemap = await sharp({
      create: {
        width: compositeWidth,
        height: compositeHeight,
        channels: 4,
        background: { r: 30, g: 30, b: 30, alpha: 1 }
      }
    })
      .composite(composites)
      .resize(width, height, { fit: 'cover' })
      .png()
      .toBuffer();

    console.log(`✅ Dark basemap: ${basemap.length} bytes (zoom ${zoom}, ${composites.length} tiles)`);
    return basemap;
  } catch (error) {
    console.warn('Dark basemap fetch failed:', error);
    return null;
  }
}

/**
 * Fetch multiple NEXRAD frames for animation (time-lapse around a storm event)
 */
export async function fetchNexradTimelapse(
  lat: number,
  lng: number,
  datetime: string,
  frameCount: number = 6,
  intervalMinutes: number = 10
): Promise<NexradResult[]> {
  const dt = new Date(datetime);
  const halfSpan = Math.floor(frameCount / 2);
  const frames: NexradResult[] = [];

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
