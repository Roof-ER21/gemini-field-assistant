import { createGunzip } from 'zlib';
import { Readable } from 'stream';
import { parse } from 'csv-parse';

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
}

class NOAAStormService {
  private baseUrl = 'https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles';
  private cache: Map<string, NOAAStormEvent[]> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  async getStormEvents(
    lat: number,
    lng: number,
    radiusMiles: number = 10,
    years: number = 2
  ): Promise<NOAAStormEvent[]> {
    const events: NOAAStormEvent[] = [];
    const currentYear = new Date().getFullYear();

    // Fetch last N years of data
    for (let year = currentYear; year >= currentYear - years; year--) {
      try {
        const yearEvents = await this.fetchYearData(year);
        const nearby = this.filterByLocation(yearEvents, lat, lng, radiusMiles);
        events.push(...nearby);
      } catch (error) {
        console.warn(`NOAA data for ${year} not available:`, error);
      }
    }

    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  private async fetchYearData(year: number): Promise<NOAAStormEvent[]> {
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

  private async parseGzippedCSV(buffer: Buffer): Promise<NOAAStormEvent[]> {
    return new Promise((resolve, reject) => {
      const events: NOAAStormEvent[] = [];
      const gunzip = createGunzip();
      const readable = Readable.from(buffer);

      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true
      });

      parser.on('data', (row: any) => {
        const eventType = this.classifyEventType(row.EVENT_TYPE);
        if (!eventType) return;

        const lat = parseFloat(row.BEGIN_LAT);
        const lng = parseFloat(row.BEGIN_LON);
        if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;

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
          dataSource: 'NOAA Storm Events Database',
          certified: true
        });
      });

      parser.on('end', () => resolve(events));
      parser.on('error', reject);

      readable.pipe(gunzip).pipe(parser);
    });
  }

  private classifyEventType(type: string): NOAAStormEvent['eventType'] | null {
    const t = (type || '').toLowerCase();
    if (t.includes('hail')) return 'hail';
    if (t.includes('thunder') && t.includes('wind')) return 'wind';
    if (t.includes('tornado')) return 'tornado';
    return null;
  }

  private parseDate(dateStr: string): string {
    // Format: "01-JAN-24 12:00:00" or similar
    // NOAA data is typically in UTC, we need to convert to Eastern for consistency
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        // Convert to Eastern timezone (America/New_York handles DST automatically)
        return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // en-CA gives YYYY-MM-DD format
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  }

  private filterByLocation(
    events: NOAAStormEvent[],
    lat: number,
    lng: number,
    radiusMiles: number
  ): NOAAStormEvent[] {
    return events.filter(event => {
      const distance = this.haversineDistance(lat, lng, event.latitude, event.longitude);
      return distance <= radiusMiles;
    });
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}

export const noaaStormService = new NOAAStormService();
