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

export interface HailSearchResult {
  events: HailEvent[];
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
  async searchByAddress(address: string, months = 24): Promise<HailSearchResult> {
    const params = new URLSearchParams({
      address,
      months: months.toString()
    });
    const response = await fetch(`${apiBaseUrl}/hail/search?${params}`, {
      headers: getHeaders()
    });
    if (!response.ok) throw new Error('Hail history search failed');
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
    if (!response.ok) throw new Error('Hail history search failed');
    return response.json();
  },

  async getStatus(): Promise<{ configured: boolean; provider: string }> {
    const response = await fetch(`${apiBaseUrl}/hail/status`, {
      headers: getHeaders()
    });
    return response.json();
  }
};
