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
      const response = await fetch(`${apiBaseUrl}/impacted-assets/property`, {
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
      return data;
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

      const response = await fetch(`${apiBaseUrl}/impacted-assets/properties?${query}`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return [];
      }

      return await response.json();
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
      const response = await fetch(`${apiBaseUrl}/impacted-assets/property/${propertyId}`, {
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
      const response = await fetch(`${apiBaseUrl}/impacted-assets/property/${propertyId}`, {
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

      const response = await fetch(`${apiBaseUrl}/impacted-assets/alerts?${query}`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return [];
      }

      return await response.json();
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
      const response = await fetch(`${apiBaseUrl}/impacted-assets/alert/${alertId}`, {
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
      const query = new URLSearchParams({ days: daysBack.toString() });
      const response = await fetch(`${apiBaseUrl}/impacted-assets/stats?${query}`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
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
      const response = await fetch(`${apiBaseUrl}/impacted-assets/check`, {
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
      const response = await fetch(`${apiBaseUrl}/impacted-assets/alerts/count?status=pending`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return 0;
      }

      const data = await response.json();
      return data.count || 0;
    } catch (error) {
      console.error('[ImpactedAssetAPI] Error getting pending count:', error);
      return 0;
    }
  }
};

export default impactedAssetApi;
