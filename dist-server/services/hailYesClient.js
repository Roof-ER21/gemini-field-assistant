/**
 * hailYesClient — wrapper around the Hail Yes / Storm Archive public API.
 *
 * Hail Yes is the citation-grade storm record (federally corroborated:
 * NCEI + SWDI + IEM LSR + HailTrace + IHM). It returns tier-classified
 * events with calibrated hail at property + distance bands. Susan now
 * pulls hail data from here so her replies match what reps and adjusters
 * see in the Hail Yes app.
 *
 * Design:
 *   - 5-min in-memory LRU cache (~500 keys) absorbs burst queries
 *   - On API failure, callers receive null and can fall back to local
 *     sa21 data (stale but functional)
 *   - Public API; no auth required as of 2026-05-05
 */
const HAIL_YES_BASE = process.env.HAIL_YES_API_BASE || 'https://hailyes.up.railway.app';
const FETCH_TIMEOUT_MS = 8000;
// ─── Cache ──────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map();
function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry)
        return null;
    if (Date.now() > entry.expires) {
        cache.delete(key);
        return null;
    }
    // LRU touch
    cache.delete(key);
    cache.set(key, entry);
    return entry.value;
}
function cacheSet(key, value) {
    if (cache.size >= CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest)
            cache.delete(oldest);
    }
    cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}
// ─── Fetch helpers ──────────────────────────────────────────────────────────
async function fetchWithTimeout(url, init) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { ...init, signal: ac.signal });
    }
    finally {
        clearTimeout(t);
    }
}
// ─── Public API ─────────────────────────────────────────────────────────────
/**
 * POST /api/impact — get all historical hail events at a location, with
 * tier classification, calibrated at-property reading, and distance bands.
 *
 * Inputs: address OR (lat, lng).
 * Returns: HailYesImpactResponse with hits[] (ordered by tier desc, recency).
 * Returns null on error (caller can fall back to local data).
 */
export async function getImpact(args) {
    if (!args.address && (typeof args.lat !== 'number' || typeof args.lng !== 'number'))
        return null;
    const key = `impact::${args.address || ''}::${args.lat || ''}::${args.lng || ''}`;
    const hit = cacheGet(key);
    if (hit)
        return hit;
    try {
        const body = args.address
            ? { address: args.address }
            : { lat: args.lat, lng: args.lng };
        const resp = await fetchWithTimeout(`${HAIL_YES_BASE}/api/impact`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!resp.ok) {
            console.warn(`[HailYes] /api/impact ${resp.status} for ${args.address || `${args.lat},${args.lng}`}`);
            return null;
        }
        const data = (await resp.json());
        cacheSet(key, data);
        return data;
    }
    catch (e) {
        console.warn('[HailYes] /api/impact err:', e.message);
        return null;
    }
}
/**
 * GET /api/events/by-date/:date — list of state-level events on a given
 * date (YYYY-MM-DD). Used by storm-date queries ("hail on 8/29/24").
 */
export async function getEventsByDate(date) {
    const key = `byDate::${date}`;
    const hit = cacheGet(key);
    if (hit)
        return hit;
    try {
        const resp = await fetchWithTimeout(`${HAIL_YES_BASE}/api/events/by-date/${encodeURIComponent(date)}`, { method: 'GET' });
        if (!resp.ok) {
            console.warn(`[HailYes] /api/events/by-date/${date} ${resp.status}`);
            return null;
        }
        const data = (await resp.json());
        cacheSet(key, data);
        return data;
    }
    catch (e) {
        console.warn('[HailYes] /api/events/by-date err:', e.message);
        return null;
    }
}
// ─── Adapters: shape Hail Yes responses to match Susan's existing types ────
/**
 * For "biggest" / "most recent" hail queries at a location. Returns hits
 * filtered to the last `monthsBack` and sorted appropriately.
 *
 * Critically: includes near-miss and area-impact tiers, NOT just direct-hit.
 * Reps care about claim-worthy hail near the property — the user
 * explicitly noted the "direct hit only" gating was wrong.
 */
export function filterHits(resp, args = {}) {
    if (!resp || !Array.isArray(resp.hits))
        return [];
    const monthsBack = args.monthsBack ?? 24;
    const minPeak = args.minPeakInches ?? 0.5;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - monthsBack);
    const cutoffISO = cutoff.toISOString().slice(0, 10);
    let hits = resp.hits.filter((h) => {
        if (!h.event_date || h.event_date < cutoffISO)
            return false;
        if ((h.peak_hail_inches || 0) < minPeak)
            return false;
        if (args.minCalibratedInches != null) {
            if ((h.hail_calibrated_at_location ?? 0) < args.minCalibratedInches)
                return false;
        }
        return true;
    });
    if (args.onDates && args.onDates.length > 0) {
        const set = new Set(args.onDates);
        hits = hits.filter((h) => set.has(h.event_date));
    }
    return hits;
}
/** Sort hits by date desc (most recent first). */
export function byMostRecent(hits) {
    return [...hits].sort((a, b) => b.event_date.localeCompare(a.event_date));
}
/** Sort hits by peak hail size desc (biggest first). */
export function byBiggest(hits) {
    return [...hits].sort((a, b) => (b.peak_hail_inches || 0) - (a.peak_hail_inches || 0));
}
/**
 * Rep-friendly description of a hit's impact tier. Reps need to understand
 * that a NEAR MISS is still claim-worthy if their property has damage.
 */
export function describeTier(hit) {
    const tier = hit.impact_tier;
    const peak = hit.peak_hail_inches;
    const calib = hit.hail_calibrated_at_location;
    const edge = hit.edge_distance_miles;
    if (tier === 'direct_hit') {
        return `DIRECT HIT — ${peak.toFixed(2)}" peak${calib != null ? `, ${formatFraction(calib)} calibrated at property` : ''}`;
    }
    if (tier === 'near_miss') {
        const dist = edge != null ? edge.toFixed(1) : '?';
        return `Near miss — ${peak.toFixed(2)}" peak ${dist}mi out${calib != null && calib > 0 ? `, ${formatFraction(calib)} at property` : ''}. Still claim-worthy if the property has damage.`;
    }
    if (tier === 'area_impact') {
        return `Area event — ${peak.toFixed(2)}" peak nearby, document any damage you see on-site.`;
    }
    return `${peak.toFixed(2)}" peak nearby`;
}
/** Build the verify-link line that reps can show adjusters/HOs. */
export function buildVerifyLink(address) {
    if (!address)
        return `→ pull the verified PDF: ${HAIL_YES_BASE}/verify ✅ adjuster-grade proof.`;
    const url = `${HAIL_YES_BASE}/verify?address=${encodeURIComponent(address)}`;
    return `→ pull the verified PDF: ${url} ✅ adjuster-grade proof.`;
}
/** Pretty-print decimal hail to fraction-style ("¼\"", "½\"", "1\"", "1¼\""). */
export function formatFraction(inches) {
    if (inches == null)
        return '—';
    const v = Math.round(inches * 4) / 4;
    if (v === 0)
        return '0"';
    if (v === 0.25)
        return '¼"';
    if (v === 0.5)
        return '½"';
    if (v === 0.75)
        return '¾"';
    if (v === 1)
        return '1"';
    if (v === 1.25)
        return '1¼"';
    if (v === 1.5)
        return '1½"';
    if (v === 1.75)
        return '1¾"';
    if (v === 2)
        return '2"';
    if (v === 2.25)
        return '2¼"';
    if (v === 2.5)
        return '2½"';
    if (v === 2.75)
        return '2¾"';
    if (v === 3)
        return '3"';
    if (v === 3.25)
        return '3¼"';
    if (v === 3.5)
        return '3½"';
    return `${v}"`;
}
// ─── Cache diagnostics ──────────────────────────────────────────────────────
export function cacheStats() {
    return { size: cache.size, max: CACHE_MAX, ttlMs: CACHE_TTL_MS };
}
