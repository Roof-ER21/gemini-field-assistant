import { weatherService, WeatherEvent } from './weatherService.js';
import { noaaStormService, NOAAStormEvent } from './noaaStormService.js';

export interface HailEvent {
  id: string;
  date: string;
  latitude: number;
  longitude: number;
  hailSize: number | null;
  windSpeed?: number | null;
  severity: 'minor' | 'moderate' | 'severe';
  source: string;
  raw?: any;
}

type RequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export interface HailSearchParams {
  address?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  months?: number;
  markerId?: string;
}

export interface HailSearchResult {
  events: HailEvent[];
  windEvents?: WeatherEvent[];
  noaaEvents?: NOAAStormEvent[];
  totalCount: number;
  searchArea: {
    center: { lat: number; lng: number };
    radiusMiles: number;
  };
  raw?: any;
}

type HailHistoryResponse = {
  Success?: boolean;
  ImpactDates?: any[];
  events?: any[];
  results?: any[];
  data?: any[];
  storms?: any[];
};

class HailMapsService {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.IHM_API_KEY || '';
    this.apiSecret = process.env.IHM_API_SECRET || '';
    this.baseUrl = process.env.IHM_BASE_URL || 'https://maps.interactivehailmaps.com';

    if (!this.apiKey || !this.apiSecret) {
      console.warn('⚠️ IHM_API_KEY or IHM_API_SECRET not configured');
    }
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiSecret);
  }

  private buildAuthHeader(): string {
    const credentials = `${this.apiKey}:${this.apiSecret}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
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

    return res.json() as Promise<T>;
  }

  private normalizeEvents(payload: HailHistoryResponse, defaultCoords?: { lat: number; lng: number }): HailEvent[] {
    // IHM returns ImpactDates array
    const items = payload.ImpactDates || payload.events || payload.results || payload.data || payload.storms || [];
    if (!Array.isArray(items)) return [];

    return items.map((event: any, index: number) => {
      // IHM uses SizeAtLocation, SizeWithin1Mile, SizeWithin3Mile, SizeWithin10Mile
      // Pick the closest non-null size
      const hailSize =
        event.SizeAtLocation ??
        event.SizeWithin1Mile ??
        event.SizeWithin3Mile ??
        event.SizeWithin10Mile ??
        event.hailSize ??
        event.hail_size ??
        event.size ??
        null;

      // IHM uses FileDate for storm date
      const date = event.FileDate || event.date || event.event_date || event.storm_date || '';

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
        severity: severity as HailEvent['severity'],
        source: 'Interactive Hail Maps',
        raw: event
      };
    });
  }

  private inferSeverity(hailSize: number): HailEvent['severity'] {
    if (!hailSize || Number.isNaN(hailSize)) return 'minor';
    if (hailSize >= 2) return 'severe';
    if (hailSize >= 1) return 'moderate';
    return 'minor';
  }

  private parseMarkerId(payload: any): string | null {
    if (!payload) return null;
    return (
      payload.AddressMarker_id ||
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
      null
    );
  }

  private async geocodeAddress(params: { street: string; city: string; state: string; zip: string }): Promise<{ lat: number; lng: number } | null> {
    try {
      const query = encodeURIComponent(`${params.street}, ${params.city}, ${params.state} ${params.zip}`);
      const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`;

      const res = await fetch(geocodeUrl, {
        headers: {
          'User-Agent': 'GeminiFieldAssistant/1.0'
        }
      });

      if (!res.ok) return null;

      const data = await res.json();
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon)
        };
      }
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  async createAddressMonitor(params: { street: string; city: string; state: string; zip: string }): Promise<{ markerId: string; lat?: number; lng?: number; raw: any }> {
    const response = await this.request<any>('/ExternalApi/AddressMonitoringImport2g', {
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

  async searchByMarkerId(markerId: string, months = 24, coords?: { lat: number; lng: number }): Promise<HailSearchResult> {
    const params = new URLSearchParams({
      AddressMarker_id: markerId,
      Months: String(months)
    });

    const years = Math.ceil(months / 12);

    const [data, windEvents, noaaEvents] = await Promise.all([
      this.request<HailHistoryResponse>(`/ExternalApi/ImpactDatesForAddressMarker?${params.toString()}`),
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

  async searchByAddress(params: { street: string; city: string; state: string; zip: string }, months = 24): Promise<HailSearchResult> {
    const monitor = await this.createAddressMonitor(params);
    const coords = monitor.lat && monitor.lng ? { lat: monitor.lat, lng: monitor.lng } : undefined;

    // searchByMarkerId now handles wind data fetching
    return this.searchByMarkerId(monitor.markerId, months, coords);
  }

  async searchByCoordinates(lat: number, lng: number, months = 24, radiusMiles = 0): Promise<HailSearchResult> {
    const params = new URLSearchParams({
      Lat: String(lat),
      Long: String(lng),
      Months: String(months)
    });
    if (radiusMiles > 0) params.set('Radius', String(radiusMiles));

    const years = Math.ceil(months / 12);
    const noaaRadius = Math.max(radiusMiles, 10); // Default to 10 miles for NOAA

    const [data, windEvents, noaaEvents] = await Promise.all([
      this.request<HailHistoryResponse>(`/ExternalApi/ImpactDatesForLatLong?${params.toString()}`),
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
