/**
 * NOAA NCEI Storm Events Database — historical backfill
 *
 * Source: https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/
 * Format: gzipped CSV per year, "details" files have hail/wind/tornado/event records
 * Coverage: 1950+ (complete for 2015-2026 with ~60-day lag)
 * Auth: none
 *
 * Strategy: One window per (year, state). Fetch year file once, filter by STATE,
 * upsert each row. Idempotent via verifiedEventsService dedup.
 */
import { gunzipSync } from 'zlib';
import { randomUUID } from 'crypto';
import { markWindowStart, markWindowComplete, markWindowFailed, isWindowComplete } from '../backfillOrchestrator.js';
import { slowFetch, downloadBuffer } from './httpHelper.js';
const NCEI_BASE = 'https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/';
const STATE_FULL_NAMES = {
    VA: 'VIRGINIA',
    MD: 'MARYLAND',
    PA: 'PENNSYLVANIA',
    DC: 'DISTRICT OF COLUMBIA',
    WV: 'WEST VIRGINIA',
    DE: 'DELAWARE',
    NJ: 'NEW JERSEY',
    NY: 'NEW YORK',
    OH: 'OHIO',
    NC: 'NORTH CAROLINA',
    KY: 'KENTUCKY',
    TN: 'TENNESSEE',
};
// Event types we care about
const RELEVANT_EVENT_TYPES = new Set([
    'Hail',
    'Thunderstorm Wind',
    'High Wind',
    'Tornado',
    'Marine Hail',
    'Marine Thunderstorm Wind',
    'Marine High Wind',
    'Funnel Cloud',
]);
/**
 * Scrape the NCEI directory listing to find the exact filename for a given year.
 * Filenames include a compilation-date suffix that changes (e.g., c20250416 for the 2024 file).
 */
async function resolveYearFile(year) {
    // Directory listing is small but NCEI can be slow — generous timeout
    const resp = await slowFetch(NCEI_BASE, {
        headers: { 'User-Agent': 'CC21-storm-backfill/1.0 (ahmed@theroofdocs.com)' },
        timeoutMs: 300_000,
        connectTimeoutMs: 90_000,
    });
    if (!resp.ok)
        throw new Error(`NCEI directory listing HTTP ${resp.status}`);
    const html = await resp.text();
    // File pattern: StormEvents_details-ftp_v1.0_dYYYY_cYYYYMMDD.csv.gz
    const pattern = new RegExp(`StormEvents_details-ftp_v1\\.0_d${year}_c\\d{8}\\.csv\\.gz`, 'g');
    const matches = html.match(pattern);
    if (!matches || matches.length === 0)
        return null;
    // If multiple matches (sometimes quarterly updates), take most recent by suffix
    matches.sort();
    return matches[matches.length - 1];
}
async function fetchAndParseYear(year) {
    const filename = await resolveYearFile(year);
    if (!filename) {
        console.warn(`[noaa_ncei] No file found for year ${year}`);
        return [];
    }
    const url = NCEI_BASE + filename;
    console.log(`[noaa_ncei] Fetching ${filename}...`);
    const gzipped = await downloadBuffer(url, {
        headers: { 'User-Agent': 'CC21-storm-backfill/1.0' },
        timeoutMs: 600_000, // 10 min for large year files
    });
    const csvText = gunzipSync(gzipped).toString('utf-8');
    return parseCsv(csvText);
}
// Simple CSV parser (handles quoted fields with commas/newlines)
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
            else if (c === '"') {
                inQuotes = false;
            }
            else {
                field += c;
            }
        }
        else {
            if (c === '"') {
                inQuotes = true;
            }
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
            else {
                field += c;
            }
        }
    }
    if (field || row.length) {
        row.push(field);
        rows.push(row);
    }
    if (rows.length < 2)
        return [];
    const headers = rows[0].map((h) => h.trim());
    return rows.slice(1)
        .filter((r) => r.length === headers.length)
        .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}
/**
 * Parse NCEI date/time (format: "DD-MMM-YY HH:MM:SS" e.g., "15-JUN-24 14:32:00") into ISO.
 * NCEI stores in local timezone of the event; we normalize to ET on insert.
 */
function parseNceiDate(dateStr) {
    if (!dateStr)
        return null;
    const months = {
        JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
        JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
    };
    const m = dateStr.match(/(\d{1,2})-([A-Z]{3})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})/);
    if (!m) {
        // Fallback: try YYYY-MM-DD parse
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d.toISOString();
    }
    const day = parseInt(m[1], 10);
    const mon = months[m[2]];
    const yr = parseInt(m[3], 10) + 2000;
    const hr = parseInt(m[4], 10);
    const min = parseInt(m[5], 10);
    const sec = parseInt(m[6], 10);
    const d = new Date(Date.UTC(yr, mon, day, hr, min, sec));
    return d.toISOString();
}
/**
 * Convert NCEI hail magnitude (MAGNITUDE field) to inches.
 * NCEI stores hail size in inches directly. Wind is in knots.
 */
function extractMeasurements(row) {
    const eventType = (row.EVENT_TYPE || '').trim();
    const magnitude = parseFloat(row.MAGNITUDE || '') || null;
    const magType = (row.MAGNITUDE_TYPE || '').trim();
    let hailSizeInches = null;
    let windMph = null;
    let tornadoEfRank = null;
    if (eventType === 'Hail' || eventType === 'Marine Hail') {
        hailSizeInches = magnitude;
    }
    else if (eventType.includes('Wind') || eventType.includes('Thunderstorm')) {
        // MAGNITUDE_TYPE: "MG" = measured gust, "EG" = estimated gust, "MS" = measured sustained, "ES" = estimated sustained
        // NCEI stores wind in knots; convert to mph (× 1.15078)
        if (magnitude != null)
            windMph = Math.round(magnitude * 1.15078);
    }
    else if (eventType === 'Tornado') {
        // TOR_F_SCALE field has values like "EF1", "EF2", etc.
        const ts = (row.TOR_F_SCALE || '').trim();
        const emf = ts.match(/EF([0-5])/);
        if (emf)
            tornadoEfRank = parseInt(emf[1], 10);
        // Also try old F-scale
        const fmf = ts.match(/^F([0-5])$/);
        if (!emf && fmf)
            tornadoEfRank = parseInt(fmf[1], 10);
    }
    return { hailSizeInches, windMph, tornadoEfRank };
}
/**
 * Extract lat/lng from NCEI row. Fields: BEGIN_LAT, BEGIN_LON (and END_LAT, END_LON).
 */
function extractLocation(row) {
    const lat = parseFloat(row.BEGIN_LAT || '');
    const lng = parseFloat(row.BEGIN_LON || '');
    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
        // Fallback to end coords
        const elat = parseFloat(row.END_LAT || '');
        const elng = parseFloat(row.END_LON || '');
        if (isNaN(elat) || isNaN(elng) || elat === 0 || elng === 0)
            return null;
        return { lat: elat, lng: elng };
    }
    return { lat, lng };
}
// ════════════════════════════════════════════════════════════════════════════
// BACKFILL RUNNER
// ════════════════════════════════════════════════════════════════════════════
export const noaaNceiBackfill = {
    name: 'noaa_ncei',
    async run({ pool, verifiedSvc, states, fromDate, toDate, dryRun, onProgress }) {
        const startedAt = new Date().toISOString();
        const runId = randomUUID();
        // Parse YYYY from ISO date string directly to avoid timezone off-by-one
        const startYear = parseInt(fromDate.slice(0, 4), 10);
        const endYear = parseInt(toDate.slice(0, 4), 10);
        const result = {
            source: 'noaa_ncei',
            success: true,
            rowsInput: 0,
            rowsInserted: 0,
            rowsUpdated: 0,
            rowsSkipped: 0,
            errors: [],
            startedAt,
            finishedAt: '',
            durationSec: 0,
        };
        const stateFullNames = new Set(states.map((s) => STATE_FULL_NAMES[s]).filter(Boolean));
        const stateAbbrevByFullName = Object.fromEntries(Object.entries(STATE_FULL_NAMES).map(([k, v]) => [v, k]));
        for (let year = startYear; year <= endYear; year++) {
            const windowKey = `NCEI:${year}:${states.sort().join(',')}`;
            // Skip if already complete in this run
            if (!dryRun && await isWindowComplete(pool, 'noaa_ncei', runId, windowKey)) {
                console.log(`[noaa_ncei] Skip (already complete): ${windowKey}`);
                continue;
            }
            await markWindowStart(pool, 'noaa_ncei', runId, windowKey);
            onProgress?.({
                source: 'noaa_ncei',
                phase: 'fetching',
                rowsInput: 0, rowsInserted: 0, rowsUpdated: 0, rowsSkipped: 0, errors: 0,
                currentWindow: windowKey,
            });
            try {
                const allRows = await fetchAndParseYear(year);
                // Filter to our states + relevant event types
                const relevant = allRows.filter((r) => stateFullNames.has((r.STATE || '').toUpperCase().trim()) &&
                    RELEVANT_EVENT_TYPES.has((r.EVENT_TYPE || '').trim()));
                result.rowsInput += relevant.length;
                console.log(`[noaa_ncei] ${year}: ${relevant.length} relevant rows from ${allRows.length} total`);
                if (dryRun) {
                    await markWindowComplete(pool, 'noaa_ncei', runId, windowKey, {
                        rowsInput: relevant.length, rowsInserted: 0, rowsUpdated: 0, rowsSkipped: relevant.length, errorCount: 0,
                    });
                    continue;
                }
                // Batch upsert
                const batch = [];
                for (const row of relevant) {
                    const loc = extractLocation(row);
                    if (!loc)
                        continue;
                    const { hailSizeInches, windMph, tornadoEfRank } = extractMeasurements(row);
                    if (hailSizeInches == null && windMph == null && tornadoEfRank == null)
                        continue;
                    const startDate = parseNceiDate(row.BEGIN_DATE_TIME);
                    if (!startDate)
                        continue;
                    const state = stateAbbrevByFullName[(row.STATE || '').toUpperCase().trim()] || null;
                    batch.push({
                        eventDate: startDate,
                        latitude: loc.lat,
                        longitude: loc.lng,
                        state,
                        hailSizeInches,
                        windMph,
                        tornadoEfRank,
                        source: 'noaa_ncei',
                        sourcePayload: {
                            event_id: row.EVENT_ID,
                            event_type: row.EVENT_TYPE,
                            cz_name: row.CZ_NAME,
                            cz_type: row.CZ_TYPE,
                            begin_datetime: row.BEGIN_DATE_TIME,
                            end_datetime: row.END_DATE_TIME,
                            magnitude: row.MAGNITUDE,
                            magnitude_type: row.MAGNITUDE_TYPE,
                            tor_f_scale: row.TOR_F_SCALE,
                            narrative_event: (row.EVENT_NARRATIVE || '').slice(0, 1000),
                            narrative_episode: (row.EPISODE_NARRATIVE || '').slice(0, 1000),
                            injuries_direct: row.INJURIES_DIRECT,
                            deaths_direct: row.DEATHS_DIRECT,
                            damage_property: row.DAMAGE_PROPERTY,
                            damage_crops: row.DAMAGE_CROPS,
                            source: row.SOURCE,
                        },
                    });
                }
                // Upsert in chunks of 500 for memory safety
                const CHUNK = 500;
                for (let i = 0; i < batch.length; i += CHUNK) {
                    const slice = batch.slice(i, i + CHUNK);
                    const r = await verifiedSvc.upsertBatch(slice);
                    result.rowsInserted += r.inserted;
                    result.rowsUpdated += r.updated;
                    result.errors.push(...r.errors.map((e) => ({ reason: e.error, sample: e.params })));
                }
                await markWindowComplete(pool, 'noaa_ncei', runId, windowKey, {
                    rowsInput: relevant.length,
                    rowsInserted: result.rowsInserted,
                    rowsUpdated: result.rowsUpdated,
                    rowsSkipped: 0,
                    errorCount: result.errors.length,
                });
                onProgress?.({
                    source: 'noaa_ncei',
                    phase: 'done',
                    rowsInput: relevant.length,
                    rowsInserted: result.rowsInserted,
                    rowsUpdated: result.rowsUpdated,
                    rowsSkipped: 0,
                    errors: result.errors.length,
                    currentWindow: windowKey,
                });
            }
            catch (err) {
                await markWindowFailed(pool, 'noaa_ncei', runId, windowKey, err.message);
                result.errors.push({ reason: `Year ${year} failed: ${err.message}` });
                console.error(`[noaa_ncei] Year ${year} failed:`, err.message);
            }
        }
        const finishedAt = new Date().toISOString();
        result.finishedAt = finishedAt;
        result.durationSec = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000);
        result.success = result.errors.length === 0;
        return result;
    },
};
