import { VerifiedEventsService } from './verifiedEventsService.js';
const MPING_URL = 'https://mping.ou.edu/mping/api/v2/reports';
// Hail-producing mPING categories. mPING has very granular options like
// "Pea (0.25 in)", "Marble (0.5 in)", "Penny (0.75 in)" etc.
const HAIL_CATEGORY_PREFIX = 'Hail';
// Map mPING description strings to hail sizes in inches.
const HAIL_SIZE_MAP = {
    'Pea (0.25 in)': 0.25,
    'Half-inch (0.5 in)': 0.5,
    'Dime (0.75 in)': 0.75,
    'Penny (0.75 in)': 0.75,
    'Nickel (0.88 in)': 0.88,
    'Marble (0.5 in)': 0.5,
    'Quarter (1.0 in)': 1.0,
    'Half Dollar (1.25 in)': 1.25,
    'Walnut/Ping Pong Ball (1.5 in)': 1.5,
    'Golf Ball (1.75 in)': 1.75,
    'Hen Egg (2.0 in)': 2.0,
    'Tennis Ball (2.5 in)': 2.5,
    'Baseball (2.75 in)': 2.75,
    'Teacup (3.0 in)': 3.0,
    'Grapefruit (4.0 in)': 4.0,
    'Softball (4.5 in)': 4.5,
};
function parseHailSize(desc) {
    if (!desc)
        return null;
    if (HAIL_SIZE_MAP[desc] !== undefined)
        return HAIL_SIZE_MAP[desc];
    // Fallback: extract first (N.NN in) pattern
    const m = String(desc).match(/\(([\d.]+)\s*in\)/);
    if (m) {
        const n = parseFloat(m[1]);
        if (!isNaN(n) && n > 0 && n < 8)
            return n;
    }
    return null;
}
export class MpingLiveService {
    svc;
    enabled;
    token;
    bbox;
    constructor(pool) {
        this.svc = new VerifiedEventsService(pool);
        this.enabled =
            process.env.MPING_LIVE_ENABLED === 'true' &&
                !!process.env.MPING_API_TOKEN;
        this.token = process.env.MPING_API_TOKEN || '';
        // DMV+ bbox — pad generously so state-corner cells don't fall off
        this.bbox = {
            minLat: 36.5,
            maxLat: 40.8,
            minLng: -82.5,
            maxLng: -74.5,
        };
    }
    async fetchWindow(fromIso, toIso) {
        const params = new URLSearchParams({
            category: HAIL_CATEGORY_PREFIX,
            obtime_gte: fromIso,
            obtime_lte: toIso,
            min_lat: String(this.bbox.minLat),
            max_lat: String(this.bbox.maxLat),
            min_lng: String(this.bbox.minLng),
            max_lng: String(this.bbox.maxLng),
            page_size: '500',
        });
        const url = `${MPING_URL}?${params}`;
        const resp = await fetch(url, {
            headers: {
                Authorization: `Token ${this.token}`,
                Accept: 'application/json',
                'User-Agent': 'CC21-storm-live/1.0 (contact: ahmed.mahmoud@theroofdocs.com)',
            },
        });
        if (!resp.ok) {
            console.warn(`[mping-live] HTTP ${resp.status} for ${fromIso}..${toIso}`);
            return [];
        }
        const data = await resp.json();
        // mPING API returns either an array or a paginated {results: []} shape
        return Array.isArray(data) ? data : Array.isArray(data.results) ? data.results : [];
    }
    reportsToBatch(reports) {
        const batch = [];
        for (const r of reports) {
            let lat;
            let lng;
            if (r.geom && Array.isArray(r.geom.coordinates)) {
                lng = Number(r.geom.coordinates[0]);
                lat = Number(r.geom.coordinates[1]);
            }
            else if (r.latitude !== undefined && r.longitude !== undefined) {
                lat = Number(r.latitude);
                lng = Number(r.longitude);
            }
            if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng))
                continue;
            if (!r.obtime)
                continue;
            const hail = parseHailSize(r.description);
            if (hail == null)
                continue;
            batch.push({
                eventDate: r.obtime,
                latitude: lat,
                longitude: lng,
                state: '', // mPING doesn't reliably tag state; backfill via lat/lng if needed
                hailSizeInches: hail,
                source: 'mping',
                sourcePayload: {
                    mping_id: r.id,
                    category: r.category,
                    description: r.description,
                    description_id: r.description_id,
                    obtime: r.obtime,
                    ingested_via: 'live',
                },
            });
        }
        return batch;
    }
    /**
     * Recent window — catches last N hours of new hail reports.
     */
    async ingestRecent(hoursBack = 12) {
        if (!this.enabled) {
            if (!process.env.MPING_API_TOKEN) {
                console.log('[mping-live] MPING_API_TOKEN not set — skipping');
            }
            else {
                console.log('[mping-live] MPING_LIVE_ENABLED=false — skipping');
            }
            return { fetched: 0, inserted: 0, updated: 0, errors: 0 };
        }
        const end = new Date();
        const start = new Date(end.getTime() - hoursBack * 3600 * 1000);
        const reports = await this.fetchWindow(start.toISOString(), end.toISOString());
        const batch = this.reportsToBatch(reports);
        if (batch.length === 0) {
            return { fetched: reports.length, inserted: 0, updated: 0, errors: 0 };
        }
        const res = await this.svc.upsertBatch(batch);
        if (res.inserted > 0 || res.updated > 0) {
            console.log(`[mping-live] last ${hoursBack}h — fetched=${reports.length} +${res.inserted} new +${res.updated} upd`);
        }
        return {
            fetched: reports.length,
            inserted: res.inserted,
            updated: res.updated,
            errors: res.errors.length,
        };
    }
    /**
     * Historical backfill — walks 7-day windows (API page_size=500 is enough
     * for DMV hail volume even in active months).
     */
    async ingestHistorical(monthsBack, opts = {}) {
        if (!this.enabled && !opts.forceEnabled) {
            console.log('[mping-live] ingestHistorical — disabled (set MPING_LIVE_ENABLED + MPING_API_TOKEN, or forceEnabled=true)');
            return { fetched: 0, inserted: 0, updated: 0, errors: 0, chunks: 0 };
        }
        if (!this.token) {
            console.log('[mping-live] MPING_API_TOKEN required, bailing');
            return { fetched: 0, inserted: 0, updated: 0, errors: 1, chunks: 0 };
        }
        const chunkDays = opts.chunkDays ?? 7;
        const totalDays = Math.ceil(monthsBack * 30.5);
        const now = new Date();
        let fetched = 0, inserted = 0, updated = 0, errors = 0, chunks = 0;
        console.log(`[mping-live] historical — ${totalDays} days, ${chunkDays}d chunks, DMV bbox`);
        for (let offset = 0; offset < totalDays; offset += chunkDays) {
            const end = new Date(now.getTime() - offset * 86400 * 1000);
            const start = new Date(end.getTime() - chunkDays * 86400 * 1000);
            try {
                const reports = await this.fetchWindow(start.toISOString(), end.toISOString());
                fetched += reports.length;
                const batch = this.reportsToBatch(reports);
                if (batch.length > 0) {
                    const res = await this.svc.upsertBatch(batch);
                    inserted += res.inserted;
                    updated += res.updated;
                    errors += res.errors.length;
                }
                chunks++;
                if (chunks % 5 === 0) {
                    console.log(`[mping-live] progress — chunk ${chunks}, +${inserted} new, +${updated} upd`);
                }
            }
            catch (err) {
                errors++;
                console.warn(`[mping-live] chunk err: ${err.message}`);
            }
            await new Promise((r) => setTimeout(r, 500));
        }
        console.log(`[mping-live] done — ${chunks} chunks, +${inserted} new, +${updated} upd`);
        return { fetched, inserted, updated, errors, chunks };
    }
}
