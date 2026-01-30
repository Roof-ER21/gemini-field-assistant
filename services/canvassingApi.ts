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

      return await response.json();
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

      return await response.json();
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

      return await response.json();
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

      return await response.json();
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
      const response = await fetch(`${apiBaseUrl}/canvassing/stats/user?${query}`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
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
      const response = await fetch(`${apiBaseUrl}/canvassing/stats/team?${query}`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
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

      return await response.json();
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

      const response = await fetch(`${apiBaseUrl}/canvassing/intel/neighborhood?${query}`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
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
      const response = await fetch(`${apiBaseUrl}/canvassing/intel/team`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('[CanvassingAPI] Error getting team intel stats:', error);
      return null;
    }
  }
};

export default canvassingApi;
