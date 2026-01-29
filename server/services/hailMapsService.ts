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
  totalCount: number;
  searchArea: {
    center: { lat: number; lng: number };
    radiusMiles: number;
  };
  raw?: any;
}

type HailHistoryResponse = {
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

  private normalizeEvents(payload: HailHistoryResponse): HailEvent[] {
    const items = payload.events || payload.results || payload.data || payload.storms || [];
    if (!Array.isArray(items)) return [];

    return items.map((event: any, index: number) => {
      const hailSize =
        event.hailSize ??
        event.hail_size ??
        event.hail_size_inches ??
        event.size ??
        event.hail_size_in ??
        null;

      const windSpeed = event.windSpeed ?? event.wind_speed ?? event.wind_speed_mph ?? null;
      const severity = event.severity || this.inferSeverity(Number(hailSize));

      return {
        id: String(event.id || event.event_id || event.hail_id || `${Date.now()}-${index}`),
        date: String(event.date || event.event_date || event.storm_date || event.occurred_at || ''),
        latitude: Number(event.latitude || event.lat || event.center_lat || 0),
        longitude: Number(event.longitude || event.lng || event.center_lng || 0),
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

  async createAddressMonitor(params: { street: string; city: string; state: string; zip: string }): Promise<{ markerId: string; raw: any }> {
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

    return { markerId, raw: response };
  }

  async searchByMarkerId(markerId: string, months = 24): Promise<HailSearchResult> {
    const params = new URLSearchParams({
      AddressMarker_id: markerId,
      Months: String(months)
    });
    const data = await this.request<HailHistoryResponse>(`/ExternalApi/ImpactDatesForAddressMarker?${params.toString()}`);
    const events = this.normalizeEvents(data);

    return {
      events,
      totalCount: events.length,
      searchArea: {
        center: { lat: events[0]?.latitude || 0, lng: events[0]?.longitude || 0 },
        radiusMiles: 0
      },
      raw: data
    };
  }

  async searchByAddress(params: { street: string; city: string; state: string; zip: string }, months = 24): Promise<HailSearchResult> {
    const monitor = await this.createAddressMonitor(params);
    return this.searchByMarkerId(monitor.markerId, months);
  }

  async searchByCoordinates(lat: number, lng: number, months = 24, radiusMiles = 0): Promise<HailSearchResult> {
    const params = new URLSearchParams({
      Lat: String(lat),
      Long: String(lng),
      Months: String(months)
    });
    if (radiusMiles > 0) params.set('Radius', String(radiusMiles));

    const data = await this.request<HailHistoryResponse>(`/ExternalApi/ImpactDatesForLatLong?${params.toString()}`);
    const events = this.normalizeEvents(data);

    return {
      events,
      totalCount: events.length,
      searchArea: {
        center: { lat, lng },
        radiusMiles
      },
      raw: data
    };
  }
}

export const hailMapsService = new HailMapsService();
