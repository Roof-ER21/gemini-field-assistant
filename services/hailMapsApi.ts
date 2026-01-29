import { getApiBaseUrl } from './config';
import { authService } from './authService';

export interface HailEvent {
  id: string;
  date: string;
  latitude: number;
  longitude: number;
  hailSize: number | null;
  windSpeed?: number | null;
  severity: 'minor' | 'moderate' | 'severe';
  source: string;
}

export interface NOAAStormEvent {
  id: string;
  eventType: 'hail' | 'wind' | 'tornado';
  date: string;
  state: string;
  location: string;
  latitude: number;
  longitude: number;
  magnitude: number | null;
  magnitudeUnit: string;
  source: string;
  narrative: string;
  dataSource: 'NOAA Storm Events Database';
  certified: true;
}

export interface WeatherEvent {
  id: string;
  date: string;
  type: 'hail' | 'wind' | 'tornado' | 'other';
  latitude: number;
  longitude: number;
  hailSize?: number | null;
  windSpeed?: number | null;
  description?: string;
  severity: 'minor' | 'moderate' | 'severe';
  source: string;
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
}

const apiBaseUrl = getApiBaseUrl();

const getHeaders = () => {
  const email = authService.getCurrentUser()?.email || localStorage.getItem('userEmail') || 'demo@roofer.com';
  return {
    'Content-Type': 'application/json',
    'x-user-email': email
  };
};

export const hailMapsApi = {
  async searchByAddress(params: { street: string; city: string; state: string; zip: string }, months = 24): Promise<HailSearchResult> {
    const query = new URLSearchParams({
      street: params.street,
      city: params.city,
      state: params.state,
      zip: params.zip,
      months: months.toString()
    });
    const response = await fetch(`${apiBaseUrl}/hail/search?${query}`, {
      headers: getHeaders()
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Hail history search failed');
    }
    return response.json();
  },

  async searchByCoordinates(lat: number, lng: number, months = 24, radius = 0): Promise<HailSearchResult> {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lng: lng.toString(),
      months: months.toString(),
      radius: radius.toString()
    });
    const response = await fetch(`${apiBaseUrl}/hail/search?${params}`, {
      headers: getHeaders()
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Hail history search failed');
    }
    return response.json();
  },

  async getStatus(): Promise<{ configured: boolean; provider: string }> {
    const response = await fetch(`${apiBaseUrl}/hail/status`, {
      headers: getHeaders()
    });
    return response.json();
  }
};
