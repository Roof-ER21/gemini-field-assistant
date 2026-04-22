/**
 * IEM Local Storm Reports backfill
 *
 * Source: https://mesonet.agron.iastate.edu/cgi-bin/request/gis/lsr.py
 * Why: Fills NCEI's ~60-day publication lag with real-time ground reports.
 * Format: CSV (or GeoJSON/shapefile)
 * Coverage: 2000+ (complete 2015-2026)
 * Auth: none
 */
import { randomUUID } from 'crypto';
import { markWindowStart, markWindowComplete, markWindowFailed } from '../backfillOrchestrator.js';
import { slowFetch } from './httpHelper.js';
// Parse CSV helper (same shape as NCEI parser)
function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i + 1];
        if (inQuotes) {
            if (c === '"' && next === '"') {
                field += '"';
                i++;
            }
            else if (c === '"')
                inQuotes = false;
            else
                field += c;
        }
        else {
            if (c === '"')
                inQuotes = true;
            else if (c === ',') {
                row.push(field);
                field = '';
            }
            else if (c === '\r') { /* skip */ }
            else if (c === '\n') {
                row.push(field);
                field = '';
                rows.push(row);
                row = [];
            }
            else
                field += c;
        }
    }
    if (field || row.length) {
        row.push(field);
        rows.push(row);
    }
    if (rows.length < 2)
        return [];
    const headers = rows[0].map((h) => h.trim());
    return rows.slice(1).filter((r) => r.length === headers.length).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}
// IEM LSR TYPE codes we care about
const HAIL_TYPES = new Set(['H']);
const WIND_TYPES = new Set(['W', 'G', 'M', 'C']); // Thunderstorm Wind, High Wind, Marine TSW, Marine High Wind
const TORNADO_TYPES = new Set(['T']);
export const iemLsrBackfill = {
    name: 'iem_lsr',
    async run({ pool, verifiedSvc, states, fromDate, toDate, dryRun, onProgress }) {
        const startedAt = new Date().toISOString();
        const runId = randomUUID();
        const result = {
            source: 'iem_lsr',
            success: true,
            rowsInput: 0, rowsInserted: 0, rowsUpdated: 0, rowsSkipped: 0,
            errors: [],
            startedAt, finishedAt: '', durationSec: 0,
        };
        // IEM endpoint is fine with year-at-a-time windows; use month for safer chunk sizes
        const start = new Date(fromDate + 'T00:00:00Z');
        const end = new Date(toDate + 'T00:00:00Z');
        const windows = [];
        const cursor = new Date(start);
        while (cursor < end) {
            const nextMonth = new Date(cursor);
            nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
            const sts = cursor.toISOString().slice(0, 10);
            const ets = (nextMonth < end ? nextMonth : end).toISOString().slice(0, 10);
            windows.push({
                sts: sts + 'T00:00Z',
                ets: ets + 'T00:00Z',
                label: `IEM-LSR:${sts}:${ets}:${states.join(',')}`,
            });
            cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        }
        for (const w of windows) {
            await markWindowStart(pool, 'iem_lsr', runId, w.label);
            try {
                const statesParam = states.join(',');
                const url = `https://mesonet.agron.iastate.edu/cgi-bin/request/gis/lsr.py?sts=${encodeURIComponent(w.sts)}&ets=${encodeURIComponent(w.ets)}&states=${statesParam}&fmt=csv`;
                onProgress?.({
                    source: 'iem_lsr', phase: 'fetching',
                    rowsInput: 0, rowsInserted: 0, rowsUpdated: 0, rowsSkipped: 0, errors: 0,
                    currentWindow: w.label,
                });
                const resp = await slowFetch(url, {
                    headers: { 'User-Agent': 'CC21-storm-backfill/1.0' },
                    timeoutMs: 300_000,
                });
                if (!resp.ok)
                    throw new Error(`IEM LSR HTTP ${resp.status}`);
                const text = await resp.text();
                const rows = parseCsv(text);
                // Filter to severe weather types
                const relevant = rows.filter((r) => {
                    const t = (r.TYPECODE || r.typecode || '').toUpperCase();
                    return HAIL_TYPES.has(t) || WIND_TYPES.has(t) || TORNADO_TYPES.has(t);
                });
                result.rowsInput += relevant.length;
                console.log(`[iem_lsr] ${w.label}: ${relevant.length} relevant of ${rows.length} total`);
                if (dryRun) {
                    await markWindowComplete(pool, 'iem_lsr', runId, w.label, {
                        rowsInput: relevant.length, rowsInserted: 0, rowsUpdated: 0, rowsSkipped: relevant.length, errorCount: 0,
                    });
                    continue;
                }
                const batch = [];
                for (const r of relevant) {
                    const lat = parseFloat(r.LAT || r.lat || '');
                    const lng = parseFloat(r.LON || r.lon || '');
                    if (isNaN(lat) || isNaN(lng))
                        continue;
                    const t = (r.TYPECODE || r.typecode || '').toUpperCase();
                    const mag = parseFloat(r.MAGNITUDE || r.magnitude || '');
                    const state = (r.STATE || r.state || '').toUpperCase().slice(0, 2);
                    let hail = null;
                    let wind = null;
                    let tornadoEf = null;
                    if (HAIL_TYPES.has(t) && !isNaN(mag))
                        hail = mag;
                    else if (WIND_TYPES.has(t) && !isNaN(mag))
                        wind = Math.round(mag); // LSR wind already in mph
                    else if (TORNADO_TYPES.has(t)) {
                        const remark = (r.REMARK || r.remark || '').toUpperCase();
                        const m = remark.match(/EF([0-5])/);
                        tornadoEf = m ? parseInt(m[1], 10) : null;
                    }
                    if (hail == null && wind == null && tornadoEf == null)
                        continue;
                    // IEM VALID format: YYYYMMDDHHMM (compact)
                    const validTime = r.VALID || r.valid;
                    if (!validTime)
                        continue;
                    let iso;
                    if (/^\d{12}$/.test(validTime)) {
                        // Parse YYYYMMDDHHMM → ISO
                        iso = `${validTime.slice(0, 4)}-${validTime.slice(4, 6)}-${validTime.slice(6, 8)}T${validTime.slice(8, 10)}:${validTime.slice(10, 12)}:00Z`;
                    }
                    else {
                        // Fallback: try standard parsers
                        const d = new Date(validTime);
                        if (isNaN(d.getTime()))
                            continue;
                        iso = d.toISOString();
                    }
                    batch.push({
                        eventDate: iso,
                        latitude: lat,
                        longitude: lng,
                        state,
                        hailSizeInches: hail,
                        windMph: wind,
                        tornadoEfRank: tornadoEf,
                        source: 'iem_lsr',
                        sourcePayload: {
                            typecode: t,
                            typetext: r.TYPETEXT || r.typetext,
                            source: r.SOURCE || r.source,
                            city: r.CITY || r.city,
                            county: r.COUNTY || r.county,
                            state,
                            remark: (r.REMARK || r.remark || '').slice(0, 500),
                            wfo: r.WFO || r.wfo,
                            valid: validTime,
                            magnitude: r.MAGNITUDE || r.magnitude,
                        },
                    });
                }
                const CHUNK = 500;
                let wInserted = 0, wUpdated = 0, wErrors = 0;
                for (let i = 0; i < batch.length; i += CHUNK) {
                    const slice = batch.slice(i, i + CHUNK);
                    const res = await verifiedSvc.upsertBatch(slice);
                    wInserted += res.inserted;
                    wUpdated += res.updated;
                    wErrors += res.errors.length;
                    result.errors.push(...res.errors.map((e) => ({ reason: e.error, sample: e.params })));
                }
                result.rowsInserted += wInserted;
                result.rowsUpdated += wUpdated;
                await markWindowComplete(pool, 'iem_lsr', runId, w.label, {
                    rowsInput: relevant.length, rowsInserted: wInserted, rowsUpdated: wUpdated,
                    rowsSkipped: 0, errorCount: wErrors,
                });
            }
            catch (err) {
                await markWindowFailed(pool, 'iem_lsr', runId, w.label, err.message);
                result.errors.push({ reason: `${w.label} failed: ${err.message}` });
                console.error(`[iem_lsr] ${w.label} failed:`, err.message);
            }
        }
        const finishedAt = new Date().toISOString();
        result.finishedAt = finishedAt;
        result.durationSec = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000);
        result.success = result.errors.length === 0;
        return result;
    },
};
