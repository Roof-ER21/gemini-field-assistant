/**
 * Storm Memory API Service
 * Frontend service for interacting with storm memory backend
 * Enables caching and retrieval of verified storm lookups
 */

import { getApiBaseUrl } from './config';
import { authService } from './authService';
import { HailSearchResult } from './hailMapsApi';

export interface StormLookupRecord {
  id: string;
  userId: string;
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  latitude: number;
  longitude: number;
  stormEvents: any[];
  eventCount: number;
  dataSources: {
    noaa: boolean;
    ihm: boolean;
  };
  outcome?: 'claim_won' | 'claim_lost' | 'pending' | 'not_pursued';
  outcomeNotes?: string;
  outcomeDate?: string;
  lookupDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface NearbyStormLookup {
  lookup: StormLookupRecord;
  distanceMiles: number;
}

const apiBaseUrl = getApiBaseUrl();

const getHeaders = () => {
  const email = authService.getCurrentUser()?.email || localStorage.getItem('userEmail') || 'demo@roofer.com';
  return {
    'Content-Type': 'application/json',
    'x-user-email': email
  };
};

export const stormMemoryApi = {
  /**
   * Save a storm lookup after verification
   */
  async saveStormLookup(params: {
    address: string;
    city?: string;
    state?: string;
    zipCode?: string;
    latitude: number;
    longitude: number;
    results: HailSearchResult;
  }): Promise<StormLookupRecord | null> {
    try {
      // Convert HailSearchResult to storm events format
      const stormEvents = [];

      // Add Interactive Hail Maps events
      if (params.results.events) {
        for (const event of params.results.events) {
          stormEvents.push({
            id: event.id,
            eventType: 'hail',
            date: event.date,
            latitude: event.latitude,
            longitude: event.longitude,
            magnitude: event.hailSize,
            magnitudeUnit: 'inches',
            source: event.source,
            dataSource: 'Interactive Hail Maps',
            certified: false
          });
        }
      }

      // Add NOAA events
      if (params.results.noaaEvents) {
        for (const event of params.results.noaaEvents) {
          stormEvents.push({
            id: event.id,
            eventType: event.eventType,
            date: event.date,
            state: event.state,
            location: event.location,
            latitude: event.latitude,
            longitude: event.longitude,
            magnitude: event.magnitude,
            magnitudeUnit: event.magnitudeUnit,
            source: event.source,
            narrative: event.narrative,
            dataSource: 'NOAA Storm Events Database',
            certified: true
          });
        }
      }

      // Add wind events
      if (params.results.windEvents) {
        for (const event of params.results.windEvents) {
          stormEvents.push({
            id: event.id,
            eventType: event.type,
            date: event.date,
            latitude: event.latitude,
            longitude: event.longitude,
            magnitude: event.windSpeed || event.hailSize,
            magnitudeUnit: event.windSpeed ? 'mph' : 'inches',
            source: event.source,
            description: event.description,
            dataSource: event.source
          });
        }
      }

      const response = await fetch(`${apiBaseUrl}/storm-memory/save`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          address: params.address,
          city: params.city,
          state: params.state,
          zipCode: params.zipCode,
          latitude: params.latitude,
          longitude: params.longitude,
          stormEvents,
          dataSources: {
            noaa: (params.results.noaaEvents?.length || 0) > 0,
            ihm: (params.results.events?.length || 0) > 0
          }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[StormMemoryAPI] Save failed:', error);
        return null;
      }

      const data = await response.json();
      console.log(`[StormMemoryAPI] Saved storm lookup for ${params.address} (${stormEvents.length} events)`);
      return data;
    } catch (error) {
      console.error('[StormMemoryAPI] Error saving storm lookup:', error);
      return null;
    }
  },

  /**
   * Find nearby cached storm lookups
   */
  async getNearbyStorms(params: {
    lat: number;
    lng: number;
    radiusMiles?: number;
  }): Promise<NearbyStormLookup[]> {
    try {
      const query = new URLSearchParams({
        lat: params.lat.toString(),
        lng: params.lng.toString(),
        radius: (params.radiusMiles || 10).toString()
      });

      const response = await fetch(`${apiBaseUrl}/storm-memory/nearby?${query}`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return [];
      }

      return await response.json();
    } catch (error) {
      console.error('[StormMemoryAPI] Error getting nearby storms:', error);
      return [];
    }
  },

  /**
   * Get storm lookup by address
   */
  async getStormByAddress(address: string): Promise<StormLookupRecord | null> {
    try {
      const query = new URLSearchParams({ address });
      const response = await fetch(`${apiBaseUrl}/storm-memory/by-address?${query}`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('[StormMemoryAPI] Error getting storm by address:', error);
      return null;
    }
  },

  /**
   * Get memory context for Susan's prompt
   * Returns a formatted string with recent storm lookups
   */
  async getMemoryContext(params: {
    address?: string;
    lat?: number;
    lng?: number;
  }): Promise<string> {
    try {
      let lookups: (StormLookupRecord | NearbyStormLookup)[] = [];

      // Try address-based lookup first
      if (params.address) {
        const lookup = await this.getStormByAddress(params.address);
        if (lookup) {
          lookups = [lookup];
        }
      }

      // Try location-based lookup
      if (lookups.length === 0 && params.lat && params.lng) {
        const nearby = await this.getNearbyStorms({
          lat: params.lat,
          lng: params.lng,
          radiusMiles: 10
        });
        lookups = nearby;
      }

      if (lookups.length === 0) {
        return '';
      }

      // Build context string
      let context = '\n[STORM MEMORY CONTEXT]\nRecent storm lookups you remember:\n';

      for (const item of lookups.slice(0, 3)) {
        const lookup = 'lookup' in item ? item.lookup : item;
        const distance = 'distanceMiles' in item ? ` (${item.distanceMiles.toFixed(1)} mi away)` : '';
        const ageDays = Math.floor(
          (Date.now() - new Date(lookup.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        );

        context += `\n- ${lookup.address}${distance}:\n`;
        context += `  ${lookup.eventCount} storm events found ${ageDays} days ago\n`;

        // Include a few event samples
        const events = lookup.stormEvents || [];
        if (events.length > 0) {
          const sampleEvents = events.slice(0, 3);
          for (const event of sampleEvents) {
            const magnitude = event.magnitude
              ? ` (${event.magnitude} ${event.magnitudeUnit})`
              : '';
            context += `  • ${event.date}: ${event.eventType}${magnitude}\n`;
          }
          if (events.length > 3) {
            context += `  • ... and ${events.length - 3} more events\n`;
          }
        }
      }

      context += '\nUse this memory to provide context and offer to look up more details if relevant.\n';

      return context;
    } catch (error) {
      console.error('[StormMemoryAPI] Error building memory context:', error);
      return '';
    }
  },

  /**
   * Get user's recent storm lookups
   */
  async getRecentLookups(limit: number = 10): Promise<StormLookupRecord[]> {
    try {
      const query = new URLSearchParams({ limit: limit.toString() });
      const response = await fetch(`${apiBaseUrl}/storm-memory/recent?${query}`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return [];
      }

      return await response.json();
    } catch (error) {
      console.error('[StormMemoryAPI] Error getting recent lookups:', error);
      return [];
    }
  },

  /**
   * Update outcome for a storm lookup
   */
  async updateOutcome(params: {
    lookupId: string;
    outcome: 'claim_won' | 'claim_lost' | 'pending' | 'not_pursued';
    notes?: string;
  }): Promise<boolean> {
    try {
      const response = await fetch(`${apiBaseUrl}/storm-memory/${params.lookupId}/outcome`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          outcome: params.outcome,
          outcomeNotes: params.notes
        })
      });

      return response.ok;
    } catch (error) {
      console.error('[StormMemoryAPI] Error updating outcome:', error);
      return false;
    }
  }
};

export default stormMemoryApi;
