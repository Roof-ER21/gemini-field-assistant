/**
 * Automated-traffic User-Agent markers.
 * KEEP IN SYNC with the backfill pattern in database/migrations/087_qr_scan_bot_filter.sql.
 * No mainstream browser UA contains any of these tokens.
 */
export const BOT_UA_PATTERN = /(bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|discord|slack|embedly|preview|headless|phantom|python-requests|python-urllib|curl|wget|libwww|httpx|axios|node-fetch|go-http|okhttp|scrapy|lighthouse|pingdom|uptime|monitor|semrush|ahrefs|mj12|dotbot|applebot|gptbot|claudebot|perplexity|chatgpt)/i;
/** Crawlers, link-preview fetchers, monitors and scripted clients. */
export function isBotUserAgent(userAgent) {
    const ua = (userAgent || '').trim();
    if (!ua)
        return true; // no UA at all is never a real phone camera
    if (ua === 'Google')
        return true; // Google's bare-string crawler
    return BOT_UA_PATTERN.test(ua);
}
const SOCIAL_HOST = /(instagram|facebook|fb\.com|threads|tiktok|twitter|x\.com|linkedin|snapchat|pinterest|reddit|youtube)/i;
/**
 * Where did this visit actually come from?
 *   qr       — the URL carried the printed-card marker (?src=qr)
 *   social   — referred by a social network (Eric's Instagram funnel)
 *   referral — referred by some other site
 *   direct   — typed, messaged, or an older QR card with no marker
 */
export function classifyScanSource(req) {
    const marker = String(req.query.src || req.query.utm_source || '').toLowerCase();
    if (marker === 'qr' || marker === 'card')
        return 'qr';
    const referrer = String(req.headers['referer'] || '').trim();
    if (!referrer)
        return 'direct';
    if (SOCIAL_HOST.test(referrer))
        return 'social';
    try {
        // Same-origin navigation isn't a new arrival.
        if (new URL(referrer).host === req.get('host'))
            return 'direct';
    }
    catch {
        /* unparseable referrer — fall through */
    }
    return 'referral';
}
/**
 * Repeat visits inside this window count as one visit.
 * Kills refresh/back-button inflation without dropping rows: reporting counts
 * DISTINCT (ip_hash, bucket) rather than COUNT(*).
 */
export const VISIT_DEDUP_MINUTES = 30;
/**
 * SQL expression bucketing scanned_at into VISIT_DEDUP_MINUTES slots.
 * Pair with COUNT(DISTINCT (ip_hash, <bucket>)) to count real visits.
 */
export const VISIT_BUCKET_SQL = `(date_trunc('hour', scanned_at) + floor(extract(minute FROM scanned_at) / ${VISIT_DEDUP_MINUTES}) * interval '${VISIT_DEDUP_MINUTES} minutes')`;
