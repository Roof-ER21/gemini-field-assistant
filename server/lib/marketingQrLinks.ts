/**
 * Marketing QR links — tracked redirects for printed marketing pieces that
 * point OFF-SITE (review pages, socials, …) instead of at a rep profile.
 *
 * Rep cards get scan tracking for free because their QR lands on
 * /profile/:slug, which logs a qr_scans row before rendering. An off-site
 * destination like Yelp can't do that, so those QR codes encode
 * /go/:slug?src=qr instead: the route logs the scan exactly like a profile
 * visit (same bot filter, same source classification, same qr_scans table,
 * profile_id NULL) and then 302s to the real destination. The scans surface
 * in the existing QR analytics keyed by this slug.
 *
 * Allowlist, not a query param — /go/ must never become an open redirect.
 */

export interface MarketingQrLink {
  /** Display name used by the analytics endpoints in place of a rep name. */
  name: string;
  /** Where the scanner ends up. */
  url: string;
}

export const MARKETING_QR_LINKS: Record<string, MarketingQrLink> = {
  'yelp-review': {
    name: 'Yelp Review Flyer',
    url: 'https://www.yelp.com/writeareview/biz/roofer-vienna-3',
  },
};

/** Friendly label for a marketing QR slug, or null if it isn't one. */
export function getMarketingQrName(slug?: string | null): string | null {
  return slug ? MARKETING_QR_LINKS[slug]?.name ?? null : null;
}
