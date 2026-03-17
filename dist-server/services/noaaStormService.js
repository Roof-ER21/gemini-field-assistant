import { createGunzip } from 'zlib';
import { Readable } from 'stream';
import { parse } from 'csv-parse';
class NOAAStormService {
    baseUrl = 'https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles';
    cache = new Map();
    cacheExpiry = new Map();
    CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
    async getStormEvents(lat, lng, radiusMiles = 10, years = 2) {
        const events = [];
        const currentYear = new Date().getFullYear();
        // Fetch last N years of data
        for (let year = currentYear; year >= currentYear - years; year--) {
            try {
                const yearEvents = await this.fetchYearData(year);
                const nearby = this.filterByLocation(yearEvents, lat, lng, radiusMiles);
                events.push(...nearby);
            }
            catch (error) {
                console.warn(`NOAA data for ${year} not available:`, error);
            }
        }
        return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    async fetchYearData(year) {
        const cacheKey = `noaa-${year}`;
        const cached = this.cache.get(cacheKey);
        const expiry = this.cacheExpiry.get(cacheKey);
        if (cached && expiry && Date.now() < expiry) {
            console.log(`✅ Using cached NOAA data for ${year} (${cached.length} events)`);
            return cached;
        }
        // Find the latest file for this year
        const indexUrl = `${this.baseUrl}/`;
        console.log(`📡 Fetching NOAA file index for ${year}...`);
        const indexRes = await fetch(indexUrl);
        const indexHtml = await indexRes.text();
        // Parse file listing to find latest file for year
        const filePattern = new RegExp(`StormEvents_details-ftp_v1\\.0_d${year}_c\\d+\\.csv\\.gz`, 'g');
        const matches = indexHtml.match(filePattern);
        if (!matches || matches.length === 0) {
            console.warn(`⚠️ No NOAA storm data file found for year ${year}`);
            return [];
        }
        // Get the most recent file (last in list)
        const latestFile = matches[matches.length - 1];
        const fileUrl = `${this.baseUrl}/${latestFile}`;
        console.log(`📥 Fetching NOAA data: ${fileUrl}`);
        const res = await fetch(fileUrl);
        if (!res.ok) {
            throw new Error(`Failed to fetch NOAA data: ${res.status}`);
        }
        const buffer = await res.arrayBuffer();
        const events = await this.parseGzippedCSV(Buffer.from(buffer));
        console.log(`✅ Parsed ${events.length} NOAA events for ${year}`);
        this.cache.set(cacheKey, events);
        this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL);
        return events;
    }
    async parseGzippedCSV(buffer) {
        return new Promise((resolve, reject) => {
            const events = [];
            const gunzip = createGunzip();
            const readable = Readable.from(buffer);
            const parser = parse({
                columns: true,
                skip_empty_lines: true,
                relax_column_count: true
            });
            parser.on('data', (row) => {
                const eventType = this.classifyEventType(row.EVENT_TYPE);
                if (!eventType)
                    return;
                const lat = parseFloat(row.BEGIN_LAT);
                const lng = parseFloat(row.BEGIN_LON);
                if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0)
                    return;
                events.push({
                    id: `noaa-${row.EVENT_ID || row.EPISODE_ID}-${events.length}`,
                    eventType,
                    date: this.parseDate(row.BEGIN_DATE_TIME),
                    state: row.STATE || '',
                    location: row.CZ_NAME || '',
                    latitude: lat,
                    longitude: lng,
                    magnitude: row.MAGNITUDE ? parseFloat(row.MAGNITUDE) : null,
                    magnitudeUnit: eventType === 'hail' ? 'inches' : 'knots',
                    source: row.SOURCE || 'NWS',
                    narrative: row.EVENT_NARRATIVE || row.EPISODE_NARRATIVE || '',
                    episodeId: row.EPISODE_ID || '',
                    damageProperty: this.parseDamageValue(row.DAMAGE_PROPERTY),
                    damageCrops: this.parseDamageValue(row.DAMAGE_CROPS),
                    injuries: parseInt(row.INJURIES_DIRECT || '0', 10) + parseInt(row.INJURIES_INDIRECT || '0', 10),
                    deaths: parseInt(row.DEATHS_DIRECT || '0', 10) + parseInt(row.DEATHS_INDIRECT || '0', 10),
                    distanceMiles: null,
                    dataSource: 'NOAA Storm Events Database',
                    certified: true
                });
            });
            parser.on('end', () => resolve(events));
            parser.on('error', reject);
            gunzip.on('error', reject);
            readable.on('error', reject);
            readable.pipe(gunzip).pipe(parser);
        });
    }
    /** Parse NOAA damage shorthand: "25K" → "$25,000", "1.50M" → "$1,500,000", "0.00K" → null */
    parseDamageValue(raw) {
        if (!raw || raw === '0' || raw === '0.00K' || raw === '0K')
            return null;
        const match = (raw || '').trim().match(/^([\d.]+)([KMB]?)$/i);
        if (!match)
            return raw || null;
        const num = parseFloat(match[1]);
        if (num === 0)
            return null;
        const multiplier = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[match[2].toUpperCase()] || 1;
        const total = num * multiplier;
        return `$${total.toLocaleString('en-US')}`;
    }
    classifyEventType(type) {
        const t = (type || '').toLowerCase();
        if (t.includes('hail'))
            return 'hail';
        if (t.includes('thunder') && t.includes('wind'))
            return 'wind';
        if (t.includes('tornado'))
            return 'tornado';
        return null;
    }
    parseDate(dateStr) {
        // Format: "01-JAN-24 12:00:00" or similar
        // NOAA data is typically in UTC, we need to convert to Eastern for consistency
        try {
            // For date-only strings (YYYY-MM-DD), append noon to avoid UTC midnight
            // shifting back one day when converted to Eastern timezone
            const normalized = /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim()) ? dateStr.trim() + 'T12:00:00' : dateStr;
            const d = new Date(normalized);
            if (!isNaN(d.getTime())) {
                // Convert to Eastern timezone (America/New_York handles DST automatically)
                return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // en-CA gives YYYY-MM-DD format
            }
            return dateStr;
        }
        catch {
            return dateStr;
        }
    }
    filterByLocation(events, lat, lng, radiusMiles) {
        return events
            .map(event => {
            const distance = this.haversineDistance(lat, lng, event.latitude, event.longitude);
            return { ...event, distanceMiles: Math.round(distance * 100) / 100 };
        })
            .filter(event => event.distanceMiles <= radiusMiles)
            .sort((a, b) => (a.distanceMiles || 0) - (b.distanceMiles || 0));
    }
    haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 3959; // Earth's radius in miles
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRad(deg) {
        return deg * (Math.PI / 180);
    }
}
export const noaaStormService = new NOAAStormService();
