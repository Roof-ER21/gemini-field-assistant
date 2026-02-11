/**
 * NWS (National Weather Service) Alert Service
 *
 * Fetches severe weather warnings from the NWS API for a given location and date range.
 * Free public API, no key required.
 * https://api.weather.gov/
 */
// Simple cache (1h TTL)
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
/**
 * Get the NWS grid point for a lat/lng
 */
async function getGridPoint(lat, lng) {
    try {
        const url = `https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'RoofER-StormIntelligence/1.0 (contact@roofer21.com)',
                'Accept': 'application/geo+json'
            }
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
    }
    catch (error) {
        console.error('NWS grid point lookup failed:', error);
        return null;
    }
}
/**
 * Fetch NWS alerts for a given location and date range.
 * Note: The NWS API only returns active/recent alerts. For historical alerts,
 * we query by zone and filter by date.
 */
export async function fetchNWSAlerts(params) {
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
                'User-Agent': 'RoofER-StormIntelligence/1.0 (contact@roofer21.com)',
                'Accept': 'application/geo+json'
            }
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
        const alerts = features.map((feature) => {
            const props = feature.properties;
            return {
                id: feature.id || props.id,
                headline: props.headline || '',
                description: props.description || '',
                severity: props.severity || 'Unknown',
                certainty: props.certainty || 'Unknown',
                event: props.event || 'Unknown Event',
                onset: props.onset || props.effective || '',
                expires: props.expires || props.ends || '',
                senderName: props.senderName || 'NWS',
                areaDesc: props.areaDesc || ''
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
        const filtered = alerts.filter(a => stormEvents.some(se => a.event.toLowerCase().includes(se.toLowerCase().replace(' warning', '').replace(' watch', '')))
            || a.severity === 'Severe'
            || a.severity === 'Extreme');
        // Cache
        cache.set(cacheKey, { data: filtered, expires: Date.now() + CACHE_TTL });
        console.log(`✅ Found ${filtered.length} relevant NWS alerts (of ${alerts.length} total)`);
        return filtered;
    }
    catch (error) {
        console.error('Failed to fetch NWS alerts:', error);
        return [];
    }
}
/**
 * Fetch NWS alerts specifically for storm damage reporting.
 * Focuses on severe thunderstorm and tornado warnings.
 */
export async function fetchStormWarnings(lat, lng, stormDate) {
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
