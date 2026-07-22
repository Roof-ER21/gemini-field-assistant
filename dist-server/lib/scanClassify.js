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
 * Social apps open links in an embedded browser that sends NO referrer, so
 * referrer-matching alone misses them badly — in production it caught 19 rows
 * where the User-Agent identified 382. These tokens are the reliable signal.
 */
const IN_APP_BROWSER = /(FBAN|FBAV|FB_IAB|FBIOS|FBDV|Instagram|Snapchat|TikTok|musical_ly|Line\/|Twitter|LinkedInApp|Pinterest)/i;
/** Opened from inside a social app's embedded browser. */
export function isInAppBrowser(userAgent) {
    return IN_APP_BROWSER.test(String(userAgent || ''));
}
/**
 * Where did this visit actually come from?
 *   qr          — the URL carried the printed-card marker (?src=qr). Certain.
 *   card_likely — phone, no referrer, not inside a social app. That's the
 *                 signature a camera-app QR scan leaves, and it's how cards
 *                 printed before 2026-07-22 (which have no marker) stay
 *                 attributable. Texted/AirDropped links look the same, so this
 *                 is "card or direct share", not proof.
 *   social      — a social referrer OR a social in-app browser.
 *   referral    — referred by some other site.
 *   direct      — desktop with no referrer: typed, pasted, or internal.
 */
export function classifyScanSource(req, isMobile) {
    const marker = String(req.query.src || req.query.utm_source || '').toLowerCase();
    if (marker === 'qr' || marker === 'card')
        return 'qr';
    const userAgent = String(req.headers['user-agent'] || '');
    if (isInAppBrowser(userAgent))
        return 'social';
    const referrer = String(req.headers['referer'] || '').trim();
    if (referrer) {
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
    const mobile = isMobile ?? /mobile|android|iphone|ipad/i.test(userAgent);
    return mobile ? 'card_likely' : 'direct';
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
