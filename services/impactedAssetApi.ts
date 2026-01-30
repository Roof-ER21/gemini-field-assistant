/**
 * Impacted Asset API Service
 * Frontend service for monitoring customer properties and storm impacts
 * Enables proactive outreach when storms affect tracked properties
 */

import { getApiBaseUrl } from './config';
import { authService } from './authService';

export interface CustomerProperty {
  id: string;
  userId: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  latitude: number;
  longitude: number;
  notifyOnHail: boolean;
  notifyOnWind: boolean;
  notifyOnTornado: boolean;
  notifyRadiusMiles: number;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type AlertType = 'hail' | 'wind' | 'tornado';
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AlertStatus = 'pending' | 'contacted' | 'no_answer' | 'not_interested' | 'appointment_set' | 'converted' | 'dismissed';

export interface ImpactAlert {
  id: string;
  customerPropertyId: string;
  property?: CustomerProperty;
  alertType: AlertType;
  alertSeverity: AlertSeverity;
  stormDate: string;
  stormDistanceMiles: number;
  hailSizeInches?: number;
  windSpeedMph?: number;
  tornadoRating?: string;
  stormDetails?: any;
  status: AlertStatus;
  contactedAt?: string;
  outcome?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImpactedAssetStats {
  totalProperties: number;
  activeProperties: number;
  pendingAlerts: number;
  contactedAlerts: number;
  conversions: number;
  conversionRate: number;
  alertsByType: Record<AlertType, number>;
  alertsBySeverity: Record<AlertSeverity, number>;
  recentAlerts: ImpactAlert[];
}

const apiBaseUrl = getApiBaseUrl();
const impactedBase = `${apiBaseUrl}/assets`;

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

const getHeaders = () => {
  const email = authService.getCurrentUser()?.email || localStorage.getItem('userEmail') || 'demo@roofer.com';
  return {
    'Content-Type': 'application/json',
    'x-user-email': email
  };
};

export const impactedAssetApi = {
  /**
   * Add a customer property to monitor
   */
  async addProperty(params: {
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    latitude?: number;
    longitude?: number;
    notifyOnHail?: boolean;
    notifyOnWind?: boolean;
    notifyOnTornado?: boolean;
    notifyRadiusMiles?: number;
    notes?: string;
  }): Promise<CustomerProperty | null> {
    try {
      const response = await fetch(`${impactedBase}/properties`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          ...params,
          notifyOnHail: params.notifyOnHail ?? true,
          notifyOnWind: params.notifyOnWind ?? true,
          notifyOnTornado: params.notifyOnTornado ?? true,
          notifyRadiusMiles: params.notifyRadiusMiles ?? 10
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[ImpactedAssetAPI] Add property failed:', error);
        return null;
      }

      const data = await response.json();
      console.log(`[ImpactedAssetAPI] Added property: ${params.address}`);
      return (data?.property || data) as CustomerProperty;
    } catch (error) {
      console.error('[ImpactedAssetAPI] Error adding property:', error);
      return null;
    }
  },

  /**
   * Get all monitored properties
   */
  async getProperties(params?: {
    activeOnly?: boolean;
    city?: string;
    state?: string;
  }): Promise<CustomerProperty[]> {
    try {
      const query = new URLSearchParams();
      if (params?.activeOnly) query.append('activeOnly', 'true');
      if (params?.city) query.append('city', params.city);
      if (params?.state) query.append('state', params.state);

      const response = await fetch(`${impactedBase}/properties?${query}`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return unwrapArray<CustomerProperty>(data, 'properties');
    } catch (error) {
      console.error('[ImpactedAssetAPI] Error getting properties:', error);
      return [];
    }
  },

  /**
   * Update a monitored property
   */
  async updateProperty(propertyId: string, updates: Partial<CustomerProperty>): Promise<boolean> {
    try {
      const response = await fetch(`${impactedBase}/properties/${propertyId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[ImpactedAssetAPI] Update property failed:', error);
        return false;
      }

      console.log('[ImpactedAssetAPI] Updated property:', propertyId);
      return true;
    } catch (error) {
      console.error('[ImpactedAssetAPI] Error updating property:', error);
      return false;
    }
  },

  /**
   * Delete a monitored property
   */
  async deleteProperty(propertyId: string): Promise<boolean> {
    try {
      const response = await fetch(`${impactedBase}/properties/${propertyId}`, {
        method: 'DELETE',
        headers: getHeaders()
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[ImpactedAssetAPI] Delete property failed:', error);
        return false;
      }

      console.log('[ImpactedAssetAPI] Deleted property:', propertyId);
      return true;
    } catch (error) {
      console.error('[ImpactedAssetAPI] Error deleting property:', error);
      return false;
    }
  },

  /**
   * Get impact alerts
   */
  async getAlerts(params?: {
    status?: AlertStatus;
    severity?: AlertSeverity;
    limit?: number;
  }): Promise<ImpactAlert[]> {
    try {
      const query = new URLSearchParams();
      if (params?.status) query.append('status', params.status);
      if (params?.severity) query.append('severity', params.severity);
      if (params?.limit) query.append('limit', params.limit.toString());

      const response = await fetch(`${impactedBase}/alerts?${query}`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return unwrapArray<ImpactAlert>(data, 'alerts');
    } catch (error) {
      console.error('[ImpactedAssetAPI] Error getting alerts:', error);
      return [];
    }
  },

  /**
   * Update an alert status
   */
  async updateAlert(alertId: string, updates: {
    status?: AlertStatus;
    outcome?: string;
    notes?: string;
  }): Promise<boolean> {
    try {
      const response = await fetch(`${impactedBase}/alerts/${alertId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[ImpactedAssetAPI] Update alert failed:', error);
        return false;
      }

      console.log('[ImpactedAssetAPI] Updated alert:', alertId);
      return true;
    } catch (error) {
      console.error('[ImpactedAssetAPI] Error updating alert:', error);
      return false;
    }
  },

  /**
   * Mark alert as contacted
   */
  async markAlertContacted(alertId: string, notes?: string): Promise<boolean> {
    return this.updateAlert(alertId, {
      status: 'contacted',
      notes
    });
  },

  /**
   * Convert alert to sale
   */
  async convertAlert(alertId: string, outcome: string, notes?: string): Promise<boolean> {
    return this.updateAlert(alertId, {
      status: 'converted',
      outcome,
      notes
    });
  },

  /**
   * Dismiss an alert
   */
  async dismissAlert(alertId: string, notes?: string): Promise<boolean> {
    return this.updateAlert(alertId, {
      status: 'dismissed',
      notes
    });
  },

  /**
   * Get statistics
   */
  async getStats(daysBack: number = 30): Promise<ImpactedAssetStats | null> {
    try {
      const query = new URLSearchParams({ daysBack: daysBack.toString() });
      const response = await fetch(`${impactedBase}/stats?${query}`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return unwrapObject<ImpactedAssetStats>(data, 'stats');
    } catch (error) {
      console.error('[ImpactedAssetAPI] Error getting stats:', error);
      return null;
    }
  },

  /**
   * Trigger manual check for impacts
   * Useful for testing or forcing immediate check
   */
  async triggerImpactCheck(propertyId?: string): Promise<boolean> {
    try {
      const response = await fetch(`${impactedBase}/check-storm`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ propertyId })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[ImpactedAssetAPI] Trigger check failed:', error);
        return false;
      }

      console.log('[ImpactedAssetAPI] Triggered impact check');
      return true;
    } catch (error) {
      console.error('[ImpactedAssetAPI] Error triggering check:', error);
      return false;
    }
  },

  /**
   * Get pending alerts count
   */
  async getPendingCount(): Promise<number> {
    try {
      const alerts = await impactedAssetApi.getAlerts({ status: 'pending', limit: 50 });
      return Array.isArray(alerts) ? alerts.length : 0;
    } catch (error) {
      console.error('[ImpactedAssetAPI] Error getting pending count:', error);
      return 0;
    }
  }
};

export default impactedAssetApi;
