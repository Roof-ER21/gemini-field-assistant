import { hailMapsService } from './hailMapsService.js';
import { noaaStormService } from './noaaStormService.js';
class HotZoneService {
    // Grid size in degrees (approximately 5 miles at mid-latitudes)
    GRID_SIZE = 0.075;
    // Weight factors for intensity calculation
    WEIGHT_RECENCY = 0.4;
    WEIGHT_SEVERITY = 0.35;
    WEIGHT_FREQUENCY = 0.25;
    /**
     * Generate hot zones for a given territory or bounding box
     */
    async getHotZones(params) {
        console.log('🔥 Generating hot zones with params:', params);
        let bounds;
        let centerLat;
        let centerLng;
        // Determine search bounds
        if (params.north && params.south && params.east && params.west) {
            bounds = {
                north: params.north,
                south: params.south,
                east: params.east,
                west: params.west
            };
            centerLat = (params.north + params.south) / 2;
            centerLng = (params.east + params.west) / 2;
        }
        else if (params.centerLat && params.centerLng) {
            // Calculate bounds from center + radius (default 50 miles)
            const radiusMiles = params.radiusMiles || 50;
            const latDelta = radiusMiles / 69; // 1 degree latitude ≈ 69 miles
            const lngDelta = radiusMiles / (69 * Math.cos(params.centerLat * Math.PI / 180));
            bounds = {
                north: params.centerLat + latDelta,
                south: params.centerLat - latDelta,
                east: params.centerLng + lngDelta,
                west: params.centerLng - lngDelta
            };
            centerLat = params.centerLat;
            centerLng = params.centerLng;
        }
        else {
            throw new Error('Must provide either bounds or center coordinates');
        }
        // Fetch storm data for the area
        const { ihmEvents, noaaEvents } = await this.fetchStormData(centerLat, centerLng, params.radiusMiles || 50);
        console.log(`📊 Fetched ${ihmEvents.length} IHM events and ${noaaEvents.length} NOAA events`);
        // Filter events within bounds and recent timeframe (last 90 days prioritized)
        const allEvents = [...ihmEvents, ...noaaEvents];
        const filteredEvents = this.filterEventsByBounds(allEvents, bounds);
        const recentEvents = this.filterRecentEvents(filteredEvents, 90);
        console.log(`🔍 Filtered to ${filteredEvents.length} events in bounds (${recentEvents.length} recent)`);
        // Cluster events into geographic cells
        const cells = this.clusterIntoGridCells(filteredEvents);
        console.log(`🗺️ Clustered into ${cells.length} geographic cells`);
        // Calculate intensity for each cell and create hot zones
        const hotZones = cells
            .map(cell => this.createHotZone(cell, recentEvents))
            .filter(zone => zone.intensity > 20) // Only include zones with meaningful activity
            .sort((a, b) => b.intensity - a.intensity)
            .slice(0, 10); // Top 10 hot zones
        console.log(`✅ Generated ${hotZones.length} hot zones`);
        return hotZones;
    }
    /**
     * Fetch storm data from IHM and NOAA
     */
    async fetchStormData(lat, lng, radiusMiles) {
        const months = 24; // Last 2 years
        const years = 2;
        let ihmEvents = [];
        let noaaEvents = [];
        // Fetch IHM data if configured
        if (hailMapsService.isConfigured()) {
            try {
                const ihmData = await hailMapsService.searchByCoordinates(lat, lng, months, radiusMiles);
                ihmEvents = ihmData.events || [];
            }
            catch (error) {
                console.error('Failed to fetch IHM data for hot zones:', error);
            }
        }
        // Always fetch NOAA data
        try {
            noaaEvents = await noaaStormService.getStormEvents(lat, lng, radiusMiles, years);
            // Filter to only hail events for hot zones
            noaaEvents = noaaEvents.filter(e => e.eventType === 'hail');
        }
        catch (error) {
            console.error('Failed to fetch NOAA data for hot zones:', error);
        }
        return { ihmEvents, noaaEvents };
    }
    /**
     * Filter events within geographic bounds
     */
    filterEventsByBounds(events, bounds) {
        return events.filter(event => {
            return (event.latitude >= bounds.south &&
                event.latitude <= bounds.north &&
                event.longitude >= bounds.west &&
                event.longitude <= bounds.east);
        });
    }
    /**
     * Filter events from the last N days
     */
    filterRecentEvents(events, days) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        return events.filter(event => {
            const eventDate = new Date(event.date);
            return eventDate >= cutoffDate;
        });
    }
    /**
     * Cluster events into geographic grid cells
     */
    clusterIntoGridCells(events) {
        const cellMap = new Map();
        events.forEach(event => {
            // Round coordinates to grid cell
            const cellLat = Math.round(event.latitude / this.GRID_SIZE) * this.GRID_SIZE;
            const cellLng = Math.round(event.longitude / this.GRID_SIZE) * this.GRID_SIZE;
            const cellKey = `${cellLat.toFixed(3)},${cellLng.toFixed(3)}`;
            if (!cellMap.has(cellKey)) {
                cellMap.set(cellKey, {
                    lat: cellLat,
                    lng: cellLng,
                    events: []
                });
            }
            cellMap.get(cellKey).events.push(event);
        });
        return Array.from(cellMap.values());
    }
    /**
     * Create a hot zone from a geographic cell
     */
    createHotZone(cell, recentEvents) {
        const cellRecentEvents = cell.events.filter(e => recentEvents.some(re => this.eventsMatch(e, re)));
        // Calculate hail sizes
        const hailSizes = cell.events
            .map(e => this.getHailSize(e))
            .filter((size) => size !== null);
        const avgHailSize = hailSizes.length > 0
            ? hailSizes.reduce((a, b) => a + b, 0) / hailSizes.length
            : null;
        const maxHailSize = hailSizes.length > 0
            ? Math.max(...hailSizes)
            : null;
        // Get most recent event date
        const sortedByDate = [...cell.events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const lastEventDate = sortedByDate[0]?.date || '';
        // Calculate intensity score (0-100)
        const intensity = this.calculateIntensity(cell.events.length, cellRecentEvents.length, avgHailSize, maxHailSize, lastEventDate);
        // Generate recommendation
        const recommendation = this.generateRecommendation(intensity, cell.events.length, maxHailSize);
        return {
            id: `hotzone-${cell.lat.toFixed(3)}-${cell.lng.toFixed(3)}`,
            centerLat: cell.lat,
            centerLng: cell.lng,
            intensity: Math.round(intensity),
            eventCount: cell.events.length,
            avgHailSize,
            maxHailSize,
            lastEventDate,
            recommendation,
            events: cell.events,
            radius: this.GRID_SIZE * 69 // Convert degrees to miles
        };
    }
    /**
     * Calculate intensity score (0-100)
     */
    calculateIntensity(totalEvents, recentEvents, avgHailSize, maxHailSize, lastEventDate) {
        // Recency score (0-100)
        const daysSinceLastEvent = this.getDaysSince(lastEventDate);
        const recencyScore = Math.max(0, 100 - (daysSinceLastEvent / 90) * 100);
        // Severity score (0-100) based on hail size
        let severityScore = 0;
        if (maxHailSize !== null) {
            if (maxHailSize >= 2.0)
                severityScore = 100;
            else if (maxHailSize >= 1.5)
                severityScore = 80;
            else if (maxHailSize >= 1.0)
                severityScore = 60;
            else if (maxHailSize >= 0.75)
                severityScore = 40;
            else
                severityScore = 20;
        }
        // Frequency score (0-100) - normalize to expected range
        const frequencyScore = Math.min(100, (totalEvents / 10) * 100);
        // Weighted average
        const intensity = recencyScore * this.WEIGHT_RECENCY +
            severityScore * this.WEIGHT_SEVERITY +
            frequencyScore * this.WEIGHT_FREQUENCY;
        return Math.min(100, Math.max(0, intensity));
    }
    /**
     * Generate canvassing recommendation text
     */
    generateRecommendation(intensity, eventCount, maxHailSize) {
        if (intensity >= 80) {
            return `🔥 HOT ZONE - High priority area with ${eventCount} events. Recent severe damage likely.`;
        }
        else if (intensity >= 60) {
            return `⚡ Strong Area - ${eventCount} events with significant hail activity. Good canvassing opportunity.`;
        }
        else if (intensity >= 40) {
            return `✓ Moderate Activity - ${eventCount} events. Worth investigating for potential leads.`;
        }
        else {
            return `Low Activity - ${eventCount} events. Lower priority for canvassing.`;
        }
    }
    /**
     * Get hail size from event
     */
    getHailSize(event) {
        if ('hailSize' in event) {
            return event.hailSize;
        }
        else if ('magnitude' in event && event.eventType === 'hail') {
            return event.magnitude;
        }
        return null;
    }
    /**
     * Check if two events match (same ID or very close in time/location)
     */
    eventsMatch(e1, e2) {
        return e1.id === e2.id;
    }
    /**
     * Get days since an event date
     */
    getDaysSince(dateStr) {
        const eventDate = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - eventDate.getTime();
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }
}
export const hotZoneService = new HotZoneService();
