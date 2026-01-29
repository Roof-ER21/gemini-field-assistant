class WeatherService {
    apiKey;
    baseUrl = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';
    constructor() {
        this.apiKey = process.env.VISUAL_CROSSING_API_KEY || '';
        if (!this.apiKey) {
            console.warn('⚠️ VISUAL_CROSSING_API_KEY not configured - wind data will not be available');
        }
    }
    isConfigured() {
        return Boolean(this.apiKey);
    }
    async getStormEvents(lat, lng, months = 24) {
        if (!this.apiKey) {
            console.log('Visual Crossing API key not configured, skipping wind data');
            return [];
        }
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const url = `${this.baseUrl}/${lat},${lng}/${startDate}/${endDate}?unitGroup=us&key=${this.apiKey}&include=events`;
        try {
            const res = await fetch(url);
            if (!res.ok) {
                console.warn(`Visual Crossing API error: ${res.status} ${res.statusText}`);
                return [];
            }
            const data = await res.json();
            return this.parseEvents(data, lat, lng);
        }
        catch (error) {
            console.error('Visual Crossing fetch error:', error);
            return [];
        }
    }
    parseEvents(data, defaultLat, defaultLng) {
        const events = [];
        // Events can be in days array or top-level events array
        const days = data.days || [];
        for (const day of days) {
            // Check for explicit storm events
            if (day.events && Array.isArray(day.events)) {
                for (const event of day.events) {
                    const eventType = this.classifyEvent(event);
                    if (eventType !== 'other') {
                        events.push({
                            id: `vc-${day.datetime}-${events.length}`,
                            date: day.datetime || event.datetime,
                            type: eventType,
                            latitude: event.latitude || defaultLat,
                            longitude: event.longitude || defaultLng,
                            hailSize: event.hailsize || null,
                            windSpeed: event.windspeed || event.windgust || day.windgust || null,
                            description: event.description || event.type,
                            severity: this.inferSeverity(event, day),
                            source: 'Visual Crossing',
                            raw: event
                        });
                    }
                }
            }
            // Also check for high wind days even without explicit events
            // Severe thunderstorm criteria: 58+ mph winds
            if (day.windgust && day.windgust >= 50) {
                // Check if we already have a wind event for this day
                const hasWindEvent = events.some(e => e.date === day.datetime && e.type === 'wind');
                if (!hasWindEvent) {
                    events.push({
                        id: `vc-wind-${day.datetime}`,
                        date: day.datetime,
                        type: 'wind',
                        latitude: defaultLat,
                        longitude: defaultLng,
                        windSpeed: day.windgust,
                        description: `High wind gusts: ${day.windgust} mph`,
                        severity: day.windgust >= 75 ? 'severe' : day.windgust >= 58 ? 'moderate' : 'minor',
                        source: 'Visual Crossing',
                        raw: { windgust: day.windgust, conditions: day.conditions }
                    });
                }
            }
        }
        return events;
    }
    classifyEvent(event) {
        const type = (event.type || event.description || '').toLowerCase();
        if (type.includes('hail'))
            return 'hail';
        if (type.includes('tornado'))
            return 'tornado';
        if (type.includes('wind') || type.includes('gust') || type.includes('thunderstorm'))
            return 'wind';
        return 'other';
    }
    inferSeverity(event, day) {
        // Check hail size first
        if (event.hailsize >= 2)
            return 'severe';
        if (event.hailsize >= 1)
            return 'moderate';
        // Check wind speeds
        const windSpeed = event.windspeed || event.windgust || day.windgust || 0;
        if (windSpeed >= 75)
            return 'severe'; // Severe thunderstorm
        if (windSpeed >= 58)
            return 'moderate'; // Severe criteria threshold
        // Default
        return 'minor';
    }
}
export const weatherService = new WeatherService();
