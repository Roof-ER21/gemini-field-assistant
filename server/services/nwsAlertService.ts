/**
 * NWS (National Weather Service) Alert Service
 *
 * Fetches severe weather warnings from the NWS API for a given location and date range.
 * Free public API, no key required.
 * https://api.weather.gov/
 */

export interface NWSAlert {
  id: string;
  headline: string;
  description: string;
  severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
  certainty: string;
  event: string; // e.g. "Severe Thunderstorm Warning", "Tornado Warning"
  onset: string; // ISO datetime
  expires: string; // ISO datetime
  senderName: string;
  areaDesc: string;
  hailSize: string | null; // Parsed from description text, e.g. "1.75""
  windSpeed: string | null; // Parsed from description text, e.g. "60 mph"
  centroidLat: number | null; // Centroid of alert polygon
  centroidLng: number | null;
}

/** Extract hail size from NWS warning text. Returns e.g. '1.75"' or null. */
export function extractHailSizeFromText(text: string): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const inchMatch = lower.match(/(\d+\.?\d*)\s*inch/);
  if (inchMatch) return `${inchMatch[1]}"`;
  const namedSizes: Record<string, string> = {
    'softball': '4.50', 'baseball': '2.75', 'tennis ball': '2.50',
    'golf ball': '1.75', 'ping pong': '1.50', 'half dollar': '1.25',
    'quarter': '1.00', 'nickel': '0.88', 'dime': '0.75',
  };
  for (const [name, size] of Object.entries(namedSizes)) {
    if (lower.includes(name)) return `${size}"`;
  }
  return null;
}

/** Extract wind speed from NWS warning text. Returns e.g. '60 mph' or null. */
export function extractWindSpeedFromText(text: string): string | null {
  if (!text) return null;
  const mphMatch = text.match(/(\d+)\s*(?:to\s*\d+\s*)?mph/i);
  if (mphMatch) return `${mphMatch[1]} mph`;
  const windMatch = text.match(/winds?\s+(?:up\s+to\s+)?(\d+)/i);
  if (windMatch) return `${windMatch[1]} mph`;
  return null;
}

interface AlertSearchParams {
  lat: number;
  lng: number;
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  eventTypes?: string[]; // Filter by event type
}

// Simple cache (1h TTL)
const cache = new Map<string, { data: NWSAlert[]; expires: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Get the NWS grid point for a lat/lng
 */
async function getGridPoint(lat: number, lng: number): Promise<{ gridId: string; gridX: number; gridY: number } | null> {
  try {
    const url = `https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RoofER-StormIntelligence/1.0 (marketing@theroofdocs.com)',
        'Accept': 'application/geo+json'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      console.error(`NWS points API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return {
      gridId: data.properties?.gridId,
      gridX: data.properties?.gridX,
      gridY: data.properties?.gridY
    };
  } catch (error) {
    console.error('NWS grid point lookup failed:', error);
    return null;
  }
}

/**
 * Fetch NWS alerts for a given location and date range.
 * Note: The NWS API only returns active/recent alerts. For historical alerts,
 * we query by zone and filter by date.
 */
export async function fetchNWSAlerts(params: AlertSearchParams): Promise<NWSAlert[]> {
  const { lat, lng, startDate, endDate, eventTypes } = params;

  const cacheKey = `${lat.toFixed(3)}_${lng.toFixed(3)}_${startDate}_${endDate}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  try {
    // Get the NWS zone for this location
    const gridPoint = await getGridPoint(lat, lng);
    if (!gridPoint) {
      console.warn('Could not determine NWS zone for location');
      return [];
    }

    // Fetch alerts for the zone
    // NWS API supports start/end query params for historical range
    const url = new URL('https://api.weather.gov/alerts');
    url.searchParams.set('point', `${lat.toFixed(4)},${lng.toFixed(4)}`);
    url.searchParams.set('start', new Date(startDate).toISOString());
    url.searchParams.set('end', new Date(endDate).toISOString());
    url.searchParams.set('status', 'actual');
    url.searchParams.set('message_type', 'alert');

    // Filter to severe weather types relevant to storm damage
    if (eventTypes && eventTypes.length > 0) {
      url.searchParams.set('event', eventTypes.join(','));
    }

    console.log(`⚠️ Fetching NWS alerts for ${lat.toFixed(3)},${lng.toFixed(3)} (${startDate} to ${endDate})`);

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'RoofER-StormIntelligence/1.0 (marketing@theroofdocs.com)',
        'Accept': 'application/geo+json'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      // NWS sometimes returns 404 for areas with no alerts
      if (response.status === 404) {
        console.log('No NWS alerts found for this area/timeframe');
        return [];
      }
      console.error(`NWS alerts API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    const features = data.features || [];

    const alerts: NWSAlert[] = features.map((feature: any) => {
      const props = feature.properties;
      const desc = props.description || '';
      // Calculate centroid from polygon geometry if available
      let centroidLat: number | null = null;
      let centroidLng: number | null = null;
      if (feature.geometry?.coordinates) {
        const coords: number[][] = feature.geometry.coordinates[0] || [];
        if (coords.length > 0) {
          centroidLat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length;
          centroidLng = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length;
        }
      }
      return {
        id: feature.id || props.id,
        headline: props.headline || '',
        description: desc,
        severity: props.severity || 'Unknown',
        certainty: props.certainty || 'Unknown',
        event: props.event || 'Unknown Event',
        onset: props.onset || props.effective || '',
        expires: props.expires || props.ends || '',
        senderName: props.senderName || 'NWS',
        areaDesc: props.areaDesc || '',
        hailSize: extractHailSizeFromText(desc),
        windSpeed: extractWindSpeedFromText(desc),
        centroidLat,
        centroidLng
      };
    });

    // Filter to storm-damage relevant events
    const stormEvents = [
      'Severe Thunderstorm Warning',
      'Severe Thunderstorm Watch',
      'Tornado Warning',
      'Tornado Watch',
      'Special Weather Statement',
      'Severe Weather Statement'
    ];

    const filtered = alerts.filter(a =>
      stormEvents.some(se => a.event.toLowerCase().includes(se.toLowerCase().replace(' warning', '').replace(' watch', '')))
      || a.severity === 'Severe'
      || a.severity === 'Extreme'
    );

    // Cache
    cache.set(cacheKey, { data: filtered, expires: Date.now() + CACHE_TTL });

    console.log(`✅ Found ${filtered.length} relevant NWS alerts (of ${alerts.length} total)`);
    return filtered;
  } catch (error) {
    console.error('Failed to fetch NWS alerts:', error);
    return [];
  }
}

/**
 * Fetch NWS alerts specifically for storm damage reporting.
 * Focuses on severe thunderstorm and tornado warnings.
 */
export async function fetchStormWarnings(lat: number, lng: number, stormDate: string): Promise<NWSAlert[]> {
  // Search a window around the storm date (1 day before to 1 day after)
  const dt = new Date(stormDate);
  const startDate = new Date(dt.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const endDate = new Date(dt.getTime() + 24 * 60 * 60 * 1000).toISOString();

  return fetchNWSAlerts({
    lat,
    lng,
    startDate,
    endDate,
    eventTypes: [
      'Severe Thunderstorm Warning',
      'Tornado Warning',
      'Severe Thunderstorm Watch',
      'Tornado Watch'
    ]
  });
}
