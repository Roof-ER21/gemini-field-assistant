import { createGunzip } from 'zlib';
import { Readable } from 'stream';
import { parse } from 'csv-parse';
class NOAAStormService {
    baseUrl = 'https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles';
    cache = new Map();
    cacheExpiry = new Map();
    CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
    // Query-level result cache: same lat/lng/radius/years = instant response
    queryCache = new Map();
    QUERY_CACHE_TTL = 60 * 60 * 1000; // 1 hour
    MAX_QUERY_CACHE = 200;
    async getStormEvents(lat, lng, radiusMiles = 10, years = 2) {
        // Check query cache first — same search = instant return
        const qKey = `${lat.toFixed(3)},${lng.toFixed(3)},${radiusMiles},${years}`;
        const cached = this.queryCache.get(qKey);
        if (cached && Date.now() - cached.ts < this.QUERY_CACHE_TTL) {
            return cached.data;
        }
        const events = [];
        const currentYear = new Date().getFullYear();
        // Fetch SPC same-day reports first (real-time, no delay)
        try {
            const spcEvents = await this.fetchSPCToday();
            const nearbySPC = this.filterByLocation(spcEvents, lat, lng, radiusMiles);
            events.push(...nearbySPC);
        }
        catch (error) {
            console.warn('SPC today reports not available:', error);
        }
        // Fetch last N years of historical data from NOAA
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
        const sorted = events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        // Cache the result — prune if cache gets too large
        if (this.queryCache.size >= this.MAX_QUERY_CACHE) {
            const oldest = [...this.queryCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
            for (let i = 0; i < oldest.length / 2; i++)
                this.queryCache.delete(oldest[i][0]);
        }
        this.queryCache.set(qKey, { data: sorted, ts: Date.now() });
        return sorted;
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
    // SPC same-day storm reports — free, federal, real-time
    spcCache = null;
    SPC_CACHE_TTL = 10 * 60 * 1000; // 10 min cache (reports update throughout the day)
    async fetchSPCToday() {
        if (this.spcCache && Date.now() - this.spcCache.ts < this.SPC_CACHE_TTL) {
            return this.spcCache.data;
        }
        const events = [];
        const today = new Date();
        const dateStr = today.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        // Fetch hail and wind reports
        for (const type of ['hail', 'wind']) {
            try {
                const url = `https://www.spc.noaa.gov/climo/reports/today_${type}.csv`;
                const response = await fetch(url);
                if (!response.ok)
                    continue;
                const text = await response.text();
                const lines = text.trim().split('\n').slice(1); // Skip header
                for (const line of lines) {
                    const parts = line.split(',');
                    if (parts.length < 8)
                        continue;
                    const [time, magnitude, location, county, state, lat, lon, ...commentParts] = parts;
                    const parsedLat = parseFloat(lat);
                    const parsedLon = parseFloat(lon);
                    if (isNaN(parsedLat) || isNaN(parsedLon))
                        continue;
                    // Format time from HHMM to readable
                    const hh = time.slice(0, 2);
                    const mm = time.slice(2, 4);
                    const timeFormatted = `${hh}:${mm} UTC`;
                    const mag = parseFloat(magnitude);
                    const hailInches = type === 'hail' ? mag / 100 : null; // SPC reports hail in hundredths of inches
                    const windKts = type === 'wind' ? mag : null;
                    events.push({
                        id: `spc-${type}-${dateStr}-${time}-${parsedLat}-${parsedLon}`,
                        eventType: type === 'hail' ? 'hail' : 'wind',
                        date: dateStr,
                        state: state?.trim() || '',
                        location: `${location?.trim()}, ${county?.trim()}`,
                        latitude: parsedLat,
                        longitude: parsedLon,
                        magnitude: type === 'hail' ? hailInches : windKts,
                        magnitudeUnit: type === 'hail' ? 'inches' : 'kts',
                        source: 'SPC Storm Report',
                        narrative: commentParts.join(',').replace(/^\(.*?\)\s*/, '').trim() || `${type === 'hail' ? (hailInches ? hailInches + '" hail' : 'Hail') : (windKts ? windKts + ' kt wind' : 'Wind')} reported at ${location?.trim()}, ${state?.trim()} at ${timeFormatted}`,
                        episodeId: '',
                        damageProperty: null,
                        damageCrops: null,
                        injuries: 0,
                        deaths: 0,
                        distanceMiles: null,
                        dataSource: 'NOAA Storm Events Database',
                        certified: true,
                    });
                }
            }
            catch (e) {
                console.warn(`SPC ${type} fetch error:`, e);
            }
        }
        this.spcCache = { data: events, ts: Date.now() };
        console.log(`[SPC] Fetched ${events.length} same-day reports`);
        return events;
    }
}
export const noaaStormService = new NOAAStormService();
