/**
 * sourceTier — primary vs supplemental classifier for hail data sources.
 *
 * Background. The 2026-04-27 PM addendum surfaced that adjusters reject
 * reports built on third-party / civilian / unverified sources, and the
 * "4-inch outliers" the team kept hitting were almost always coming from
 * non-NEXRAD radars or single Hailtrace spotters bleeding into headline
 * cells. Russ + Reese + Ahmed agreed: only NOAA / NWS / NEXRAD federal
 * data drives adjuster-facing display. Everything else stays ingested
 * for transparency but never moves the headline.
 *
 * sa21 primary tier (broader than the addendum's literal three because
 * IEM and SWDI just redistribute the same NWS/NOAA data on different
 * paths — filtering them out would discard government-verified ground
 * truth on a technicality):
 *   - NEXRAD MRMS                 (source_mrms)
 *   - NWS Local Storm Reports     (source_nws_alert)
 *   - NCEI Storm Events Database  (source_noaa_ncei)
 *   - NCEI Severe Weather Data Inventory (source_ncei_swdi)
 *   - IEM LSR mirror              (source_iem_lsr)
 *   - IEM VTEC alerts mirror      (source_iem_vtec)
 *   - SPC Watch/Warning/MCD       (source_spc_wcm)
 *
 * Supplemental (still ingested, listed in the Sources detail section,
 * never drives the headline display value):
 *   - mPING crowdsourced
 *   - CoCoRaHS citizen science
 *   - Synoptic Data (private aggregator)
 *   - Hailtrace
 *   - Internal: rep_report, customer_report, groupme
 *
 * This file is sa21's source of truth for the tiering. Hail Yes
 * maintains its own list (per the 2026-04-27 PM decoupling). If a new
 * source is added to the ingestion pipeline, classify it here.
 *
 * Scope rule (carried from the morning handoff). The tier filter
 * applies to ADJUSTER-FACING surfaces only. Internal canvass surfaces —
 * live MRMS alerts, territory hail map, rep storm-impact summaries
 * delivered internally — see all sources unfiltered.
 */
const PRIMARY_SOURCE_KEYS = new Set([
    'mrms',
    'nexrad-mrms',
    'source_mrms',
    'nws-lsr',
    'nws-alert',
    'nws-alerts',
    'source_nws_alert',
    'ncei-storm-events',
    'noaa-ncei',
    'noaa-storm-events',
    'source_noaa_ncei',
    'ncei-swdi',
    'source_ncei_swdi',
    'iem-lsr',
    'source_iem_lsr',
    'iem-vtec',
    'source_iem_vtec',
    'spc',
    'spc-wcm',
    'source_spc_wcm',
]);
const SUPPLEMENTAL_SOURCE_KEYS = new Set([
    'mping',
    'source_mping',
    'cocorahs',
    'source_cocorahs',
    'synoptic',
    'source_synoptic',
    'hailtrace',
    'hailtrace-import',
    'hailtrace-validation',
    'rep-report',
    'source_rep_report',
    'customer-report',
    'source_customer_report',
    'groupme',
    'source_groupme',
]);
/**
 * Classify a source label into primary or supplemental tier. Unknown
 * sources default to supplemental — better to under-display than to
 * accidentally surface unverified data on an adjuster report.
 *
 * Source labels are normalized: lowercased, underscores and spaces
 * collapsed to hyphens. So `NCEI_Storm_Events`, `NCEI Storm Events`,
 * and `ncei-storm-events` all classify the same.
 */
export function classifySource(source) {
    const normalized = normalizeSourceKey(source);
    if (PRIMARY_SOURCE_KEYS.has(normalized))
        return 'primary';
    if (SUPPLEMENTAL_SOURCE_KEYS.has(normalized))
        return 'supplemental';
    return 'supplemental';
}
export function isPrimary(source) {
    return classifySource(source) === 'primary';
}
export function isSupplemental(source) {
    return classifySource(source) === 'supplemental';
}
/**
 * Government-observer subset of the primary tier — NWS LSR + NCEI
 * Storm Events + IEM LSR (which is just NWS LSR redistributed).
 *
 * MRMS is primary for display but algorithmic, not human-observed, so
 * it does NOT satisfy the "verified" definition's government-observer
 * requirement. The cap algorithm uses this distinction: ≥3 primary +
 * ≥1 government-observer to trip isVerified=true.
 */
const GOVERNMENT_OBSERVER_KEYS = new Set([
    'nws-lsr',
    'nws-alert',
    'nws-alerts',
    'source_nws_alert',
    'ncei-storm-events',
    'noaa-ncei',
    'noaa-storm-events',
    'source_noaa_ncei',
    'ncei-swdi',
    'source_ncei_swdi',
    'iem-lsr',
    'source_iem_lsr',
]);
export function isGovernmentObserver(source) {
    return GOVERNMENT_OBSERVER_KEYS.has(normalizeSourceKey(source));
}
function normalizeSourceKey(s) {
    return s.toLowerCase().replace(/[\s_]+/g, '-').trim();
}
/**
 * Filter a list of source-bearing items to only the primary tier.
 * Used at the boundary between data fetch and adjuster-facing
 * aggregation: full list flows through ingestion, primary-only flows
 * into displayHailInches() and the headline cells.
 */
export function filterToPrimary(items) {
    return items.filter((it) => isPrimary(it.source));
}
