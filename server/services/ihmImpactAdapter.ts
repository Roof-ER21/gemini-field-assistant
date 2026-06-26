// @ts-nocheck
/**
 * Interactive Hail Maps (IHM / Hail Recon) adapter — homeowner-facing hail history,
 * an alternative source to Hail Yes for the RoofCheck tool.
 *
 * AUTH: IHM uses HTTP Basic Auth (collection-level), so creds come from env and are
 * NEVER hardcoded, committed, or logged. Set ONE of these in Railway (not in chat/git):
 *   IHM_API_USER + IHM_API_PASS     (standard user:pass), or
 *   IHM_BASIC_AUTH                  ("user:pass", or a pre-encoded base64, or "Basic <b64>")
 *
 * ENDPOINT (by lat/lng) — what RoofCheck needs:
 *   GET https://maps.interactivehailmaps.com/ExternalApi/ImpactDatesForLatLong?Lat&Long&Months
 *   → hail impact dates for that location. (Also: ImpactDatesForAddressMarker?AddressMarker_id&Months)
 *
 * NOTE: IHM's published docs ship NO response sample, so the mapping to AddressImpactReport
 * is finalized only after inspecting a real response (admin endpoint GET /admin/ihm-raw).
 * Until then getAddressHailImpactViaIHM() throws, so it can never silently feed wrong/empty
 * hail data into the live homeowner tool — RoofCheck stays on Hail Yes.
 */
const IHM_BASE = 'https://maps.interactivehailmaps.com/ExternalApi';

export function ihmConfigured(): boolean {
  return !!((process.env.IHM_API_USER && process.env.IHM_API_PASS) || process.env.IHM_BASIC_AUTH);
}

function ihmAuthHeader(): string {
  const raw = (process.env.IHM_BASIC_AUTH || '').trim();
  if (raw) {
    if (raw.startsWith('Basic ')) return raw;                       // already a header value
    if (raw.includes(':')) return 'Basic ' + Buffer.from(raw).toString('base64'); // user:pass
    return 'Basic ' + raw;                                          // assume pre-encoded base64
  }
  const user = process.env.IHM_API_USER || '';
  const pass = process.env.IHM_API_PASS || '';
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

/** Raw IHM call (lat/lng) → { ok, status, body }. For the mapper + the admin debug endpoint. */
export async function ihmImpactDatesForLatLong(lat: number, lng: number, months = 24): Promise<{ ok: boolean; status: number; body: any }> {
  if (!ihmConfigured()) throw new Error('IHM not configured — set IHM_API_USER/IHM_API_PASS (or IHM_BASIC_AUTH) in Railway');
  const url = `${IHM_BASE}/ImpactDatesForLatLong?Lat=${encodeURIComponent(lat)}&Long=${encodeURIComponent(lng)}&Months=${encodeURIComponent(months)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { Authorization: ihmAuthHeader(), Accept: 'application/json' }, signal: ctrl.signal });
    const text = await r.text();
    let body: any = text;
    try { body = JSON.parse(text); } catch { /* leave as text */ }
    return { ok: r.ok, status: r.status, body };
  } finally { clearTimeout(timer); }
}

/**
 * Drop-in replacement for getAddressHailImpactViaHailYes — returns an AddressImpactReport.
 * FINALIZE this once a real ImpactDatesForLatLong response is inspected via /admin/ihm-raw.
 * Throws until then so the caller's fallback keeps RoofCheck on Hail Yes.
 */
export async function getAddressHailImpactViaIHM(_lat: number, _lng: number, _monthsBack = 24) {
  throw new Error('IHM→AddressImpactReport mapping not finalized — inspect /admin/ihm-raw first');
}
