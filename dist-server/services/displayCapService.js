/**
 * displayCapService — adjuster-credibility display cap for hail values.
 *
 * Background. Raw MRMS / NCEI / NWS LSR data sometimes shows 3"–4" hail
 * "at location" in our markets (DMV). Per the field rep with thousands
 * of roofs under his belt, anything >2.5" gets the report rejected as
 * "garbage" by adjusters. Per Gemini consultation in the 2026-04-27
 * meeting: 4" hail aloft can be 0.5" on the roof by the time it lands.
 *
 * This module sits between the underlying truth (preserved intact in
 * the database) and any adjuster-facing surface that prints a hail
 * size. Raw values stay everywhere internally — only display values are
 * capped.
 *
 * Decision authority. 2026-04-27 storm-app meeting (Ahmed, Reese,
 * Russell, Louie) + same-day afternoon addendum (strict column
 * bucketing, primary-source filter, polygon render quality). The
 * morning handoff locked the cap algorithm; the afternoon surfaced that
 * the cap alone wasn't enough — most "4-inch at location" outliers are
 * source-leak and bucketing-spillage problems upstream of this file.
 *
 * sa21 / Hail Yes drift policy. Both apps implement a display cap, but
 * they are NOT required to be byte-identical (per user direction
 * 2026-04-27 PM). Each app makes the calls that fit its own data and
 * surfaces. This file is the sa21 source of truth.
 *
 * Algorithm rules (locked, post-clarification):
 *
 *   raw < 0.25                       → null (no event detected)
 *   raw 0.25–0.74                    → 0.75 floor (every positive reading
 *                                      rounds up to the rep-acceptable
 *                                      minimum the meeting agreed on)
 *   consensus path overrides:
 *     when ≥2 distinct sources agree on a quarter-snap size S where
 *     0.75 ≤ S < 2.6, return S directly — bypasses raw-based cap entirely
 *   else apply raw cap:
 *     raw 0.75–2.00                  → snap to 0.25
 *     raw 2.01–2.50, verified+atLoc  → snap to 0.25
 *     raw 2.01–2.50, otherwise       → 2.0
 *     raw 2.51+, Sterling+ver+atLoc  → snap to 0.25, hard cap 3.0
 *     raw 2.51+, verified            → 2.5
 *     raw 2.51+, otherwise           → 2.0
 *
 * Why consensus overrides cap. When 2+ primary-tier sources independently
 * report the same 1.5" reading, that's stronger evidence than a single
 * MRMS pixel claiming 4". The capped value (e.g. 2.5) would actually
 * OVER-state what hit the roof in that scenario. Source agreement at
 * moderate sizes is the most adjuster-credible signal we have.
 *
 * Why bucketing matters more than the cap. The 0.25 noise floor and
 * 0.75 minimum aren't the only things protecting against the 381k-row
 * "MRMS pixel inflation" problem in our DB. The actual fix is upstream:
 * strict column bucketing (At Property = dist ≤ 0.5mi only) and
 * primary-source filtering on adjuster surfaces. The cap function is
 * the safety net, not the gatekeeper. See addressImpactService for the
 * bucketing logic and sourceTier.ts for the primary/supplemental split.
 */
/**
 * Apply the display cap to a raw hail size. Returns null when the raw
 * value is below the suppress floor (no real hail event).
 *
 * Always pass the raw value into the database / audit trail; this
 * function's output is for adjuster-facing display only.
 */
export function displayHailInches(rawMaxInches, v) {
    // Sub-trace radar noise: nothing real hit the roof. Don't fabricate a
    // 0.75 reading from a 0.001 MRMS pixel.
    if (!Number.isFinite(rawMaxInches) || rawMaxInches < 0.25)
        return null;
    // Consensus override: when ≥2 distinct sources agree on a quarter-snap
    // size in [0.75, 2.6), trust source agreement over the raw max. This
    // catches the "raw 4" but everyone actually saw 1.5"" case where the
    // cap path would still over-state to 2.5.
    if (v.consensusSize !== null &&
        v.consensusSize !== undefined &&
        v.consensusSize >= 0.75 &&
        v.consensusSize < 2.6) {
        return roundToQuarter(v.consensusSize);
    }
    // Floor — every positive reading rounds up to 0.75. The meeting was
    // unambiguous: "anything under 0.75 isn't worth showing to a rep."
    if (rawMaxInches < 0.75)
        return 0.75;
    // Pass-through band: 0.75–2.00 displays the raw value (snapped).
    if (rawMaxInches <= 2.0)
        return roundToQuarter(rawMaxInches);
    const verifiedAtLoc = v.isVerified && v.isAtLocation;
    // 2.01–2.50: verified+at-location passes through (with quarter snap);
    // anything else clamps to 2.0.
    if (rawMaxInches <= 2.5) {
        return verifiedAtLoc ? roundToQuarter(rawMaxInches) : 2.0;
    }
    // > 2.50: only Sterling-class verified-at-location may exceed 2.5, and
    // even then we hard-cap at 3.0. Everything else gets the
    // verified/unverified ceiling (2.5 or 2.0).
    if (verifiedAtLoc && v.isSterlingClass) {
        return Math.min(roundToQuarter(rawMaxInches), 3.0);
    }
    return v.isVerified ? 2.5 : 2.0;
}
function roundToQuarter(x) {
    return Math.round(x * 4) / 4;
}
/**
 * Compute the consensus size from a list of (sourceLabel, sizeInches)
 * tuples. Returns the highest quarter-snap size in [0.75, 2.6) where ≥2
 * distinct sources reported that size. null when no consensus exists.
 *
 * "Distinct sources" = different source labels (e.g., "ncei-storm-events"
 * vs "iem-lsr"). Two events from the same source aren't a consensus —
 * that's just the same observer pipeline duplicated. Cross-source
 * agreement is what we want.
 */
export function computeConsensusSize(reports) {
    // source -> set of quarter-snapped sizes that source reported in [0.75, 2.6)
    const sizesBySource = new Map();
    for (const r of reports) {
        if (!Number.isFinite(r.sizeInches))
            continue;
        if (r.sizeInches < 0.75 || r.sizeInches >= 2.6)
            continue;
        const snapped = roundToQuarter(r.sizeInches);
        if (snapped < 0.75 || snapped >= 2.6)
            continue;
        if (!sizesBySource.has(r.source)) {
            sizesBySource.set(r.source, new Set());
        }
        sizesBySource.get(r.source).add(snapped);
    }
    // Count how many distinct sources reported each size
    const sourceCountForSize = new Map();
    for (const sizes of sizesBySource.values()) {
        for (const s of sizes) {
            sourceCountForSize.set(s, (sourceCountForSize.get(s) ?? 0) + 1);
        }
    }
    // Pick the highest size with ≥2 source agreement. Higher consensus is
    // more rep-favorable — among sizes adjusters will accept (under 2.6),
    // we want to show the worst observed.
    let best = null;
    for (const [size, count] of sourceCountForSize) {
        if (count >= 2 && (best === null || size > best))
            best = size;
    }
    return best;
}
export const STERLING_CLASS_STORMS = [
    {
        date: '2024-08-29',
        label: 'Sterling VA hail outbreak',
        centerLat: 39.0067,
        centerLng: -77.4291,
        // 20 mi covers the actual swath extent that day (Sterling →
        // Vienna/Tysons → Reston → Ashburn → Leesburg → industrial Loudoun).
        // Per-date-impact data shows polygon edges 1.45 mi from Vienna and
        // 1.68 mi from Leesburg's Barksdale Dr. The meeting kept testing
        // 17032 Silver Charm Place in Leesburg (~16 mi from this center) —
        // 15 mi would have cut it off. Doesn't bleed into Frederick MD or
        // Baltimore.
        radiusMi: 20,
    },
];
/**
 * Test whether a given (date, lat, lng) falls inside any Sterling-class
 * storm region. Distance is great-circle (haversine) in miles.
 */
export function isSterlingClassStorm(date, lat, lng) {
    for (const s of STERLING_CLASS_STORMS) {
        if (s.date !== date)
            continue;
        const d = haversineMiles(lat, lng, s.centerLat, s.centerLng);
        if (d <= s.radiusMi)
            return true;
    }
    return false;
}
function haversineMiles(lat1, lng1, lat2, lng2) {
    const R = 3958.8;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
/**
 * Lightweight source classifier for the cap helpers below. Recognizes the
 * display-style labels that flow through the PDF event pipeline ("NOAA",
 * "NWS", "NEXRAD", etc.) AND the snake_case keys ("source_noaa_ncei").
 * The full source-tier table lives in sourceTier.ts; this function is the
 * narrow subset the cap algorithm needs.
 */
function tokensInSource(source) {
    return source
        .toLowerCase()
        .split(/[\s,;|/_-]+/)
        .map((t) => t.trim())
        .filter(Boolean);
}
function sourceIsPrimary(source) {
    const tokens = tokensInSource(source);
    return tokens.some((t) => t === 'noaa' ||
        t === 'ncei' ||
        t === 'nws' ||
        t === 'nexrad' ||
        t === 'mrms' ||
        t === 'spc' ||
        t === 'iem');
}
function sourceIsGovernmentObserver(source) {
    const tokens = tokensInSource(source);
    return tokens.some((t) => t === 'nws' ||
        t === 'noaa' ||
        t === 'ncei' ||
        t === 'iem');
}
/**
 * Build a VerificationContext for a single band on a single storm date,
 * given the reports that fall in that band.
 *
 * The cap algorithm runs per-band per-date (the addendum requirement —
 * "each column gets its own verification context"). A 4" reading at
 * 0.6mi shouldn't pull the at-property band's verification — it's a
 * 1-3mi-band report.
 *
 * @param bandReports     reports in this band on this date (already
 *                        distance-filtered by the caller)
 * @param isAtPropertyBand true when this is the 0–0.5mi at-property band;
 *                        only this band can satisfy `isAtLocation`
 * @param stormDate       YYYY-MM-DD of the storm
 * @param queryLat/queryLng query point (for Sterling-class lookup)
 */
export function buildBandVerification(bandReports, isAtPropertyBand, stormDate, queryLat, queryLng) {
    const primary = bandReports.filter((r) => sourceIsPrimary(r.source));
    const govObservers = primary.filter((r) => sourceIsGovernmentObserver(r.source));
    const isVerified = primary.length >= 3 && govObservers.length >= 1;
    const isAtLocation = isAtPropertyBand && primary.length > 0;
    const isSterlingClass = isSterlingClassStorm(stormDate.length > 10 ? stormDate.slice(0, 10) : stormDate, queryLat, queryLng);
    const consensusSize = computeConsensusSize(primary.map((r) => ({ source: r.source, sizeInches: r.sizeInches })));
    return { isVerified, isAtLocation, isSterlingClass, consensusSize };
}
