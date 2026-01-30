import { weatherService } from './weatherService.js';
import { noaaStormService } from './noaaStormService.js';
class HailMapsService {
    apiKey;
    apiSecret;
    baseUrl;
    constructor() {
        this.apiKey = process.env.IHM_API_KEY || '';
        this.apiSecret = process.env.IHM_API_SECRET || '';
        this.baseUrl = process.env.IHM_BASE_URL || 'https://maps.interactivehailmaps.com';
        if (!this.apiKey || !this.apiSecret) {
            console.warn('⚠️ IHM_API_KEY or IHM_API_SECRET not configured');
        }
    }
    isConfigured() {
        return Boolean(this.apiKey && this.apiSecret);
    }
    buildAuthHeader() {
        const credentials = `${this.apiKey}:${this.apiSecret}`;
        return `Basic ${Buffer.from(credentials).toString('base64')}`;
    }
    async request(path, init) {
        const url = `${this.baseUrl}${path}`;
        const res = await fetch(url, {
            ...init,
            headers: {
                Authorization: this.buildAuthHeader(),
                Accept: 'application/json',
                ...(init?.headers || {})
            }
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`IHM API error ${res.status}: ${body || res.statusText}`);
        }
        return res.json();
    }
    normalizeEvents(payload, defaultCoords) {
        // IHM returns ImpactDates array
        const items = payload.ImpactDates || payload.events || payload.results || payload.data || payload.storms || [];
        if (!Array.isArray(items))
            return [];
        return items.map((event, index) => {
            // IHM uses SizeAtLocation, SizeWithin1Mile, SizeWithin3Mile, SizeWithin10Mile
            // Pick the closest non-null size
            const hailSize = event.SizeAtLocation ??
                event.SizeWithin1Mile ??
                event.SizeWithin3Mile ??
                event.SizeWithin10Mile ??
                event.hailSize ??
                event.hail_size ??
                event.size ??
                null;
            // IHM uses FileDate for storm date - normalize to Eastern timezone for consistency
            const rawDate = event.FileDate || event.date || event.event_date || event.storm_date || '';
            const date = this.normalizeToEastern(rawDate);
            const windSpeed = event.windSpeed ?? event.wind_speed ?? event.WindSpeed ?? null;
            const severity = this.inferSeverity(Number(hailSize));
            // Use event coordinates if available, otherwise fall back to default (address location)
            const latitude = Number(event.latitude || event.lat || event.Lat || defaultCoords?.lat || 0);
            const longitude = Number(event.longitude || event.lng || event.Long || defaultCoords?.lng || 0);
            return {
                id: String(event.id || event.event_id || `ihm-${date}-${index}`),
                date: String(date),
                latitude,
                longitude,
                hailSize: hailSize !== null ? Number(hailSize) : null,
                windSpeed: windSpeed !== null ? Number(windSpeed) : null,
                severity: severity,
                source: 'Interactive Hail Maps',
                raw: event
            };
        });
    }
    inferSeverity(hailSize) {
        if (!hailSize || Number.isNaN(hailSize))
            return 'minor';
        if (hailSize >= 2)
            return 'severe';
        if (hailSize >= 1)
            return 'moderate';
        return 'minor';
    }
    /**
     * Normalize date to Eastern timezone (America/New_York) for consistency
     * This ensures IHM and NOAA dates match when displaying the same storm
     */
    normalizeToEastern(dateStr) {
        if (!dateStr)
            return '';
        try {
            // IHM dates may be in format "MM/DD/YYYY", "YYYY-MM-DD", or ISO format
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
                // Convert to Eastern timezone - en-CA locale gives YYYY-MM-DD format
                return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
            }
            return dateStr;
        }
        catch {
            return dateStr;
        }
    }
    parseMarkerId(payload) {
        if (!payload)
            return null;
        return (payload.AddressMarker_id ||
            payload.AddressMarker_Id ||
            payload.addressMarkerId ||
            payload.markerId ||
            payload.marker_id ||
            payload.id ||
            payload.address_id ||
            payload.data?.AddressMarker_id ||
            payload.data?.AddressMarker_Id ||
            payload.data?.markerId ||
            payload.data?.marker_id ||
            null);
    }
    async geocodeAddress(params) {
        try {
            const query = encodeURIComponent(`${params.street}, ${params.city}, ${params.state} ${params.zip}`);
            const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`;
            const res = await fetch(geocodeUrl, {
                headers: {
                    'User-Agent': 'GeminiFieldAssistant/1.0'
                }
            });
            if (!res.ok)
                return null;
            const data = await res.json();
            if (data && data.length > 0) {
                return {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon)
                };
            }
            return null;
        }
        catch (error) {
            console.error('Geocoding error:', error);
            return null;
        }
    }
    async createAddressMonitor(params) {
        const response = await this.request('/ExternalApi/AddressMonitoringImport2g', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                street: params.street.trim(),
                city: params.city.trim(),
                state: params.state.trim().toUpperCase(),
                zip: params.zip.trim()
            })
        });
        const markerId = this.parseMarkerId(response);
        if (!markerId) {
            throw new Error('IHM API response missing markerId');
        }
        // Extract coordinates from IHM response if available
        let lat = response?.Lat || response?.latitude || response?.lat || response?.data?.Lat;
        let lng = response?.Long || response?.longitude || response?.lng || response?.data?.Long;
        // Fallback to geocoding if IHM doesn't provide coordinates
        if (!lat || !lng) {
            const geocoded = await this.geocodeAddress(params);
            if (geocoded) {
                lat = geocoded.lat;
                lng = geocoded.lng;
            }
        }
        return { markerId, lat, lng, raw: response };
    }
    async searchByMarkerId(markerId, months = 24, coords) {
        const params = new URLSearchParams({
            AddressMarker_id: markerId,
            Months: String(months)
        });
        const years = Math.ceil(months / 12);
        const [data, windEvents, noaaEvents] = await Promise.all([
            this.request(`/ExternalApi/ImpactDatesForAddressMarker?${params.toString()}`),
            coords && weatherService.isConfigured()
                ? weatherService.getStormEvents(coords.lat, coords.lng, months)
                : Promise.resolve([]),
            coords
                ? noaaStormService.getStormEvents(coords.lat, coords.lng, 10, years)
                : Promise.resolve([])
        ]);
        const events = this.normalizeEvents(data, coords);
        return {
            events,
            windEvents: windEvents.filter(e => e.type === 'wind' || e.type === 'tornado'),
            noaaEvents,
            totalCount: events.length + noaaEvents.length,
            searchArea: {
                center: { lat: coords?.lat || events[0]?.latitude || 0, lng: coords?.lng || events[0]?.longitude || 0 },
                radiusMiles: 0
            },
            raw: data
        };
    }
    async searchByAddress(params, months = 24) {
        const monitor = await this.createAddressMonitor(params);
        const coords = monitor.lat && monitor.lng ? { lat: monitor.lat, lng: monitor.lng } : undefined;
        // searchByMarkerId now handles wind data fetching
        return this.searchByMarkerId(monitor.markerId, months, coords);
    }
    async searchByCoordinates(lat, lng, months = 24, radiusMiles = 0) {
        const params = new URLSearchParams({
            Lat: String(lat),
            Long: String(lng),
            Months: String(months)
        });
        if (radiusMiles > 0)
            params.set('Radius', String(radiusMiles));
        const years = Math.ceil(months / 12);
        const noaaRadius = Math.max(radiusMiles, 10); // Default to 10 miles for NOAA
        const [data, windEvents, noaaEvents] = await Promise.all([
            this.request(`/ExternalApi/ImpactDatesForLatLong?${params.toString()}`),
            weatherService.isConfigured()
                ? weatherService.getStormEvents(lat, lng, months)
                : Promise.resolve([]),
            noaaStormService.getStormEvents(lat, lng, noaaRadius, years)
        ]);
        const events = this.normalizeEvents(data, { lat, lng });
        return {
            events,
            windEvents: windEvents.filter(e => e.type === 'wind' || e.type === 'tornado'),
            noaaEvents,
            totalCount: events.length + noaaEvents.length,
            searchArea: {
                center: { lat, lng },
                radiusMiles
            },
            raw: data
        };
    }
}
export const hailMapsService = new HailMapsService();
