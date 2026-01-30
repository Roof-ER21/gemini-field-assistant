/**
 * Canvassing API Service
 * Frontend service for interacting with canvassing backend
 * Enables tracking door-to-door sales activities
 */

import { getApiBaseUrl } from './config';
import { authService } from './authService';

export type CanvassingStatus =
  | 'not_contacted'
  | 'contacted'
  | 'no_answer'
  | 'return_visit'
  | 'not_interested'
  | 'interested'
  | 'lead'
  | 'appointment_set'
  | 'sold';

export interface CanvassingEntry {
  id: string;
  userId: string;
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  status: CanvassingStatus;
  contactedBy?: string;
  contactDate?: string;
  homeownerName?: string;
  phoneNumber?: string;
  email?: string;
  notes?: string;
  followUpDate?: string;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  // Extended homeowner fields
  propertyNotes?: string;
  bestContactTime?: string;
  propertyType?: 'residential' | 'commercial' | 'multi-family';
  roofType?: string;
  roofAgeYears?: number;
  autoMonitor?: boolean;
}

export interface CanvassingSession {
  id: string;
  userId: string;
  startTime: string;
  endTime?: string;
  doorsKnocked: number;
  contacts: number;
  leads: number;
  appointments: number;
  startLatitude?: number;
  startLongitude?: number;
  endLatitude?: number;
  endLongitude?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CanvassingStats {
  totalDoors: number;
  totalContacts: number;
  totalLeads: number;
  totalAppointments: number;
  totalSales: number;
  contactRate: number;
  leadRate: number;
  conversionRate: number;
  followUpsNeeded: number;
  statusBreakdown: Record<CanvassingStatus, number>;
}

export interface TeamCanvassingStats extends CanvassingStats {
  topPerformers: Array<{
    userId: string;
    name: string;
    email: string;
    doorsKnocked: number;
    leads: number;
    sales: number;
  }>;
  recentActivity: CanvassingEntry[];
}

export interface NeighborhoodIntel {
  totalProperties: number;
  canvassedProperties: number;
  interestedProperties: number;
  leadsCount: number;
  averageRoofAge?: number;
  commonRoofTypes: Array<{
    type: string;
    count: number;
  }>;
  recentActivity: CanvassingEntry[];
  hotspots: Array<{
    address: string;
    latitude: number;
    longitude: number;
    status: CanvassingStatus;
  }>;
}

export interface TeamIntelStats {
  totalTeamMembers: number;
  activeToday: number;
  topPerformers: Array<{
    userId: string;
    name: string;
    doorsKnocked: number;
    leads: number;
  }>;
  recentLeads: CanvassingEntry[];
}

export interface HeatmapPoint {
  latitude: number;
  longitude: number;
  status: CanvassingStatus;
  weight: number;
}

const apiBaseUrl = getApiBaseUrl();

const getHeaders = () => {
  const email = authService.getCurrentUser()?.email || localStorage.getItem('userEmail') || 'demo@roofer.com';
  return {
    'Content-Type': 'application/json',
    'x-user-email': email
  };
};

const unwrapArray = <T>(data: any, key: string): T[] => {
  if (Array.isArray(data)) return data as T[];
  if (data && Array.isArray(data[key])) return data[key] as T[];
  return [];
};

const unwrapObject = <T>(data: any, key: string): T | null => {
  if (!data) return null;
  if (data[key]) return data[key] as T;
  return data as T;
};

const buildNeighborhoodIntel = (entries: any[]): NeighborhoodIntel => {
  const totalProperties = entries.length;
  const canvassedProperties = entries.filter(entry => entry?.status && entry.status !== 'not_contacted').length;
  const interestedStatuses = new Set(['interested', 'lead', 'appointment_set', 'sold']);
  const interestedProperties = entries.filter(entry => interestedStatuses.has(entry?.status)).length;
  const leadsCount = entries.filter(entry => entry?.status === 'lead').length;

  const roofAges = entries
    .map(entry => Number(entry?.roofAgeYears ?? entry?.roof_age_years))
    .filter(value => Number.isFinite(value) && value > 0);
  const averageRoofAge = roofAges.length > 0
    ? Math.round((roofAges.reduce((sum, value) => sum + value, 0) / roofAges.length) * 10) / 10
    : undefined;

  const roofTypeCounts = new Map<string, number>();
  entries.forEach(entry => {
    const roofType = (entry?.roofType ?? entry?.roof_type ?? '').toString().trim();
    if (!roofType) return;
    roofTypeCounts.set(roofType, (roofTypeCounts.get(roofType) || 0) + 1);
  });

  const commonRoofTypes = Array.from(roofTypeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }));

  const hotspots = entries
    .filter(entry => entry?.address)
    .slice(0, 10)
    .map(entry => ({
      address: entry.address as string,
      latitude: Number(entry?.latitude ?? entry?.lat ?? 0),
      longitude: Number(entry?.longitude ?? entry?.lng ?? 0),
      status: (entry?.status || 'contacted') as CanvassingStatus
    }));

  return {
    totalProperties,
    canvassedProperties,
    interestedProperties,
    leadsCount,
    averageRoofAge,
    commonRoofTypes,
    recentActivity: entries as CanvassingEntry[],
    hotspots
  };
};

export const canvassingApi = {
  /**
   * Mark an address with canvassing status
   */
  async markAddress(params: {
    address: string;
    city?: string;
    state?: string;
    zipCode?: string;
    latitude?: number;
    longitude?: number;
    status: CanvassingStatus;
    homeownerName?: string;
    phoneNumber?: string;
    email?: string;
    notes?: string;
    followUpDate?: string;
    propertyNotes?: string;
    bestContactTime?: string;
    propertyType?: 'residential' | 'commercial' | 'multi-family';
    roofType?: string;
    roofAgeYears?: number;
    autoMonitor?: boolean;
  }): Promise<CanvassingEntry | null> {
    try {
      const response = await fetch(`${apiBaseUrl}/canvassing/mark`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(params)
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[CanvassingAPI] Mark address failed:', error);
        return null;
      }

      const data = await response.json();
      console.log(`[CanvassingAPI] Marked ${params.address} as ${params.status}`);
      return data;
    } catch (error) {
      console.error('[CanvassingAPI] Error marking address:', error);
      return null;
    }
  },

  /**
   * Get canvassing entries for a specific area
   */
  async getAreaCanvassing(params: {
    city?: string;
    state?: string;
    zipCode?: string;
  }): Promise<CanvassingEntry[]> {
    try {
      const query = new URLSearchParams();
      if (params.city) query.append('city', params.city);
      if (params.state) query.append('state', params.state);
      if (params.zipCode) query.append('zipCode', params.zipCode);

      const response = await fetch(`${apiBaseUrl}/canvassing/area?${query}`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return unwrapArray<CanvassingEntry>(data, 'entries');
    } catch (error) {
      console.error('[CanvassingAPI] Error getting area canvassing:', error);
      return [];
    }
  },

  /**
   * Get nearby canvassing entries
   */
  async getNearbyCanvassing(params: {
    lat: number;
    lng: number;
    radiusMiles?: number;
  }): Promise<CanvassingEntry[]> {
    try {
      const query = new URLSearchParams({
        lat: params.lat.toString(),
        lng: params.lng.toString(),
        radius: (params.radiusMiles || 1).toString()
      });

      const response = await fetch(`${apiBaseUrl}/canvassing/nearby?${query}`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return unwrapArray<CanvassingEntry>(data, 'entries');
    } catch (error) {
      console.error('[CanvassingAPI] Error getting nearby canvassing:', error);
      return [];
    }
  },

  /**
   * Get addresses that need follow-up
   */
  async getFollowUps(): Promise<CanvassingEntry[]> {
    try {
      const response = await fetch(`${apiBaseUrl}/canvassing/follow-ups`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return unwrapArray<CanvassingEntry>(data, 'followUps');
    } catch (error) {
      console.error('[CanvassingAPI] Error getting follow-ups:', error);
      return [];
    }
  },

  /**
   * Start a canvassing session
   */
  async startSession(params: {
    latitude?: number;
    longitude?: number;
    notes?: string;
  }): Promise<CanvassingSession | null> {
    try {
      const response = await fetch(`${apiBaseUrl}/canvassing/session/start`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(params)
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[CanvassingAPI] Start session failed:', error);
        return null;
      }

      const data = await response.json();
      console.log('[CanvassingAPI] Started canvassing session:', data.id);
      return data;
    } catch (error) {
      console.error('[CanvassingAPI] Error starting session:', error);
      return null;
    }
  },

  /**
   * End a canvassing session
   */
  async endSession(sessionId: string, params?: {
    latitude?: number;
    longitude?: number;
    notes?: string;
  }): Promise<CanvassingSession | null> {
    try {
      const response = await fetch(`${apiBaseUrl}/canvassing/session/${sessionId}/end`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(params || {})
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[CanvassingAPI] End session failed:', error);
        return null;
      }

      const data = await response.json();
      console.log('[CanvassingAPI] Ended canvassing session:', sessionId);
      return data;
    } catch (error) {
      console.error('[CanvassingAPI] Error ending session:', error);
      return null;
    }
  },

  /**
   * Get session history
   */
  async getSessionHistory(limit: number = 10): Promise<CanvassingSession[]> {
    try {
      const query = new URLSearchParams({ limit: limit.toString() });
      const response = await fetch(`${apiBaseUrl}/canvassing/sessions?${query}`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return unwrapArray<CanvassingSession>(data, 'sessions');
    } catch (error) {
      console.error('[CanvassingAPI] Error getting session history:', error);
      return [];
    }
  },

  /**
   * Get user's canvassing stats
   */
  async getUserStats(daysBack: number = 30): Promise<CanvassingStats | null> {
    try {
      const query = new URLSearchParams({ days: daysBack.toString() });
      const response = await fetch(`${apiBaseUrl}/canvassing/stats?${query}`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return unwrapObject<CanvassingStats>(data, 'stats');
    } catch (error) {
      console.error('[CanvassingAPI] Error getting user stats:', error);
      return null;
    }
  },

  /**
   * Get team canvassing stats
   */
  async getTeamStats(daysBack: number = 30): Promise<TeamCanvassingStats | null> {
    try {
      const query = new URLSearchParams({ days: daysBack.toString() });
      const response = await fetch(`${apiBaseUrl}/canvassing/team-stats?${query}`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return unwrapObject<TeamCanvassingStats>(data, 'stats');
    } catch (error) {
      console.error('[CanvassingAPI] Error getting team stats:', error);
      return null;
    }
  },

  /**
   * Get heatmap data for visualization
   */
  async getHeatmapData(params: {
    city?: string;
    state?: string;
    zipCode?: string;
  }): Promise<HeatmapPoint[]> {
    try {
      const query = new URLSearchParams();
      if (params.city) query.append('city', params.city);
      if (params.state) query.append('state', params.state);
      if (params.zipCode) query.append('zipCode', params.zipCode);

      const response = await fetch(`${apiBaseUrl}/canvassing/heatmap?${query}`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return unwrapArray<HeatmapPoint>(data, 'heatmap');
    } catch (error) {
      console.error('[CanvassingAPI] Error getting heatmap data:', error);
      return [];
    }
  },

  /**
   * Update an existing canvassing entry
   */
  async updateEntry(entryId: string, updates: Partial<CanvassingEntry>): Promise<boolean> {
    try {
      const response = await fetch(`${apiBaseUrl}/canvassing/${entryId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[CanvassingAPI] Update entry failed:', error);
        return false;
      }

      console.log('[CanvassingAPI] Updated entry:', entryId);
      return true;
    } catch (error) {
      console.error('[CanvassingAPI] Error updating entry:', error);
      return false;
    }
  },

  /**
   * Get neighborhood intelligence data
   */
  async getNeighborhoodIntel(lat: number, lng: number, radiusMiles: number = 0.5): Promise<NeighborhoodIntel | null> {
    try {
      const query = new URLSearchParams({
        lat: lat.toString(),
        lng: lng.toString(),
        radius: radiusMiles.toString()
      });

      const response = await fetch(`${apiBaseUrl}/canvassing/intel?${query}`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const entries = unwrapArray<any>(data, 'intel');
      return buildNeighborhoodIntel(entries);
    } catch (error) {
      console.error('[CanvassingAPI] Error getting neighborhood intel:', error);
      return null;
    }
  },

  /**
   * Get team intelligence stats
   */
  async getTeamIntelStats(): Promise<TeamIntelStats | null> {
    try {
      const response = await fetch(`${apiBaseUrl}/canvassing/intel/stats`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const stats = unwrapObject<any>(data, 'stats');
      if (!stats) return null;
      if (stats.totalTeamMembers !== undefined) {
        return stats as TeamIntelStats;
      }
      return {
        totalTeamMembers: 0,
        activeToday: 0,
        topPerformers: [],
        recentLeads: []
      };
    } catch (error) {
      console.error('[CanvassingAPI] Error getting team intel stats:', error);
      return null;
    }
  }
};

export default canvassingApi;
