/**
 * Storm API Service
 *
 * Typed frontend API for all storm/hail endpoints.
 * Handles communication with backend storm intelligence services.
 */

import { config } from './config';

// ========== TYPES & INTERFACES ==========

export interface SearchParams {
  address?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  months?: number;
}

export interface AdvancedSearchParams extends SearchParams {
  includeWind?: boolean;
  includeNOAA?: boolean;
  minHailSize?: number;
  maxDistance?: number;
}

export interface HailEvent {
  id: string;
  date: string;
  latitude: number;
  longitude: number;
  hailSize: number | null;
  windSpeed?: number | null;
  severity: 'minor' | 'moderate' | 'severe';
  source: string;
  distanceMiles?: number;
  raw?: any;
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
  distanceMiles?: number;
}

export interface WeatherEvent {
  id: string;
  type: 'wind' | 'tornado' | 'hail';
  date: string;
  latitude: number;
  longitude: number;
  magnitude: number;
  description: string;
  source: string;
}

export interface SearchResult {
  events: HailEvent[];
  windEvents?: WeatherEvent[];
  noaaEvents?: NOAAStormEvent[];
  totalCount: number;
  searchArea: {
    center: { lat: number; lng: number };
    radiusMiles: number;
  };
  address?: string;
  coordinates?: { lat: number; lng: number };
  raw?: any;
}

export interface DamageScoreParams {
  lat?: number;
  lng?: number;
  address?: string;
  events?: HailEvent[];
  noaaEvents?: NOAAStormEvent[];
}

export interface DamageScoreFactors {
  eventCount: number;
  maxHailSize: number;
  recentActivity: number;
  cumulativeExposure: number;
  severityDistribution: {
    severe: number;
    moderate: number;
    minor: number;
  };
  recencyScore: number;
}

export interface DamageScoreResult {
  score: number;
  riskLevel: 'Low' | 'Moderate' | 'High' | 'Critical';
  factors: DamageScoreFactors;
  summary: string;
  color: string;
}

export interface HotZoneParams {
  territoryId?: string;
  north?: number;
  south?: number;
  east?: number;
  west?: number;
  centerLat?: number;
  centerLng?: number;
  radiusMiles?: number;
}

export interface HotZone {
  id: string;
  centerLat: number;
  centerLng: number;
  intensity: number;
  eventCount: number;
  avgHailSize: number | null;
  maxHailSize: number | null;
  lastEventDate: string;
  recommendation: string;
  events: Array<HailEvent | NOAAStormEvent>;
  radius: number;
}

export type ReportFilter = 'all' | 'hail-only' | 'hail-wind' | 'ihm-only' | 'noaa-only';

export interface ReportParams {
  address: string;
  lat: number;
  lng: number;
  radius: number;
  events: HailEvent[];
  noaaEvents: NOAAStormEvent[];
  damageScore: DamageScoreResult;
  repName?: string;
  repPhone?: string;
  repEmail?: string;
  companyName?: string;
  filter?: ReportFilter;
}

export interface ImportResult {
  success: boolean;
  message: string;
  eventsImported?: number;
  errors?: string[];
}

export interface HailTraceStatus {
  hasData: boolean;
  eventCount: number;
  dateRange?: {
    earliest: string;
    latest: string;
  };
  coverage?: {
    states: string[];
    counties: number;
  };
}

export interface ServiceStatus {
  ihm: {
    configured: boolean;
    status: 'healthy' | 'error' | 'unavailable';
  };
  noaa: {
    status: 'healthy' | 'error';
    cacheSize: number;
  };
  weatherApi: {
    configured: boolean;
    status: 'healthy' | 'error' | 'unavailable';
  };
  hailTrace: {
    hasData: boolean;
    eventCount: number;
  };
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: any;
}

// ========== API CLIENT ==========

class StormApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.apiUrl || 'http://localhost:3000';
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const error: ApiError = await response.json().catch(() => ({
          error: 'API Error',
          message: response.statusText,
          statusCode: response.status,
        }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error(`Storm API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  /**
   * Search for hail events by address or coordinates
   */
  async searchHail(params: SearchParams): Promise<SearchResult> {
    const queryParams = new URLSearchParams();

    if (params.address) {
      queryParams.set('address', params.address);
    } else if (params.street && params.city && params.state && params.zip) {
      queryParams.set('street', params.street);
      queryParams.set('city', params.city);
      queryParams.set('state', params.state);
      queryParams.set('zip', params.zip);
    } else if (params.lat && params.lng) {
      queryParams.set('lat', params.lat.toString());
      queryParams.set('lng', params.lng.toString());
    } else {
      throw new Error('Must provide address or coordinates');
    }

    if (params.radius) queryParams.set('radius', params.radius.toString());
    if (params.months) queryParams.set('months', params.months.toString());

    return this.request<SearchResult>(
      `/api/hail/search?${queryParams.toString()}`
    );
  }

  /**
   * Advanced search with filters
   */
  async searchAdvanced(params: AdvancedSearchParams): Promise<SearchResult> {
    const queryParams = new URLSearchParams();

    if (params.address) {
      queryParams.set('address', params.address);
    } else if (params.lat && params.lng) {
      queryParams.set('lat', params.lat.toString());
      queryParams.set('lng', params.lng.toString());
    } else {
      throw new Error('Must provide address or coordinates');
    }

    if (params.radius) queryParams.set('radius', params.radius.toString());
    if (params.months) queryParams.set('months', params.months.toString());
    if (params.includeWind !== undefined)
      queryParams.set('includeWind', params.includeWind.toString());
    if (params.includeNOAA !== undefined)
      queryParams.set('includeNOAA', params.includeNOAA.toString());
    if (params.minHailSize)
      queryParams.set('minHailSize', params.minHailSize.toString());
    if (params.maxDistance)
      queryParams.set('maxDistance', params.maxDistance.toString());

    return this.request<SearchResult>(
      `/api/hail/search/advanced?${queryParams.toString()}`
    );
  }

  /**
   * Calculate damage score for a location
   */
  async getDamageScore(params: DamageScoreParams): Promise<DamageScoreResult> {
    return this.request<DamageScoreResult>('/api/hail/damage-score', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Get hot zones for canvassing
   */
  async getHotZones(params: HotZoneParams): Promise<HotZone[]> {
    return this.request<HotZone[]>('/api/hail/hot-zones', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Generate PDF report
   * Returns a Blob that can be downloaded
   */
  async generateReport(params: ReportParams): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/api/hail/report/pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: response.statusText,
      }));
      throw new Error(error.message || 'Failed to generate report');
    }

    return response.blob();
  }

  /**
   * Download generated report
   */
  async downloadReport(params: ReportParams, filename?: string): Promise<void> {
    const blob = await this.generateReport(params);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      filename ||
      `storm-report-${new Date().toISOString().split('T')[0]}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  /**
   * Import HailTrace CSV file
   */
  async importHailTrace(file: File): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseUrl}/api/hailtrace/import`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: response.statusText,
      }));
      throw new Error(error.message || 'Failed to import HailTrace data');
    }

    return response.json();
  }

  /**
   * Get HailTrace import status
   */
  async getHailTraceStatus(): Promise<HailTraceStatus> {
    return this.request<HailTraceStatus>('/api/hailtrace/status');
  }

  /**
   * Get overall service status
   */
  async getStatus(): Promise<ServiceStatus> {
    return this.request<ServiceStatus>('/api/hail/status');
  }

  /**
   * Search HailTrace database directly
   */
  async searchHailTrace(params: SearchParams): Promise<SearchResult> {
    const queryParams = new URLSearchParams();

    if (params.lat && params.lng) {
      queryParams.set('lat', params.lat.toString());
      queryParams.set('lng', params.lng.toString());
    } else {
      throw new Error('HailTrace search requires lat/lng coordinates');
    }

    if (params.radius) queryParams.set('radius', params.radius.toString());
    if (params.months) queryParams.set('months', params.months.toString());

    return this.request<SearchResult>(
      `/api/hailtrace/search?${queryParams.toString()}`
    );
  }

  /**
   * Get storm events near a property
   */
  async getPropertyStorms(
    propertyId: string,
    radiusMiles: number = 10
  ): Promise<SearchResult> {
    return this.request<SearchResult>(
      `/api/hail/property/${propertyId}/storms?radius=${radiusMiles}`
    );
  }

  /**
   * Batch search multiple addresses
   */
  async batchSearch(
    addresses: Array<{
      id: string;
      address: string;
      radius?: number;
      months?: number;
    }>
  ): Promise<
    Array<{
      id: string;
      result: SearchResult;
      error?: string;
    }>
  > {
    return this.request('/api/hail/batch-search', {
      method: 'POST',
      body: JSON.stringify({ addresses }),
    });
  }

  /**
   * Get NOAA events only
   */
  async getNOAAEvents(
    lat: number,
    lng: number,
    radiusMiles: number = 10,
    years: number = 2
  ): Promise<NOAAStormEvent[]> {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lng: lng.toString(),
      radius: radiusMiles.toString(),
      years: years.toString(),
    });

    return this.request<NOAAStormEvent[]>(
      `/api/hail/noaa/events?${params.toString()}`
    );
  }

  /**
   * Geocode an address to coordinates
   */
  async geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
    const params = new URLSearchParams({ address });
    return this.request<{ lat: number; lng: number }>(
      `/api/hail/geocode?${params.toString()}`
    );
  }
}

// ========== EXPORT SINGLETON ==========

export const stormApi = new StormApiClient();

// ========== UTILITY FUNCTIONS ==========

/**
 * Calculate distance between two points (Haversine formula)
 */
export const calculateDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 3959; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Add distance to events based on search center
 */
export const addDistanceToEvents = <T extends { latitude: number; longitude: number }>(
  events: T[],
  centerLat: number,
  centerLng: number
): Array<T & { distanceMiles: number }> => {
  return events.map((event) => ({
    ...event,
    distanceMiles: calculateDistance(
      centerLat,
      centerLng,
      event.latitude,
      event.longitude
    ),
  }));
};

/**
 * Filter events by distance
 */
export const filterByDistance = <T extends { latitude: number; longitude: number }>(
  events: T[],
  centerLat: number,
  centerLng: number,
  maxDistanceMiles: number
): T[] => {
  return events.filter((event) => {
    const distance = calculateDistance(
      centerLat,
      centerLng,
      event.latitude,
      event.longitude
    );
    return distance <= maxDistanceMiles;
  });
};

/**
 * Get color based on damage score
 */
export const getScoreColor = (score: number): string => {
  if (score >= 76) return '#dc2626'; // Critical (Red)
  if (score >= 51) return '#f97316'; // High (Orange)
  if (score >= 26) return '#eab308'; // Moderate (Yellow)
  return '#22c55e'; // Low (Green)
};

/**
 * Get severity badge color
 */
export const getSeverityColor = (
  severity: 'minor' | 'moderate' | 'severe'
): string => {
  switch (severity) {
    case 'severe':
      return '#dc2626';
    case 'moderate':
      return '#f97316';
    case 'minor':
      return '#22c55e';
    default:
      return '#64748b';
  }
};

/**
 * Format hail size for display
 */
export const formatHailSize = (size: number | null): string => {
  if (size === null || size === 0) return 'Unknown';
  return `${size.toFixed(2)}"`;
};

/**
 * Format wind speed for display
 */
export const formatWindSpeed = (speed: number | null): string => {
  if (speed === null || speed === 0) return 'Unknown';
  return `${Math.round(speed)} mph`;
};

/**
 * Get event type display name
 */
export const getEventTypeName = (
  type: 'hail' | 'wind' | 'tornado'
): string => {
  return type.charAt(0).toUpperCase() + type.slice(1);
};
