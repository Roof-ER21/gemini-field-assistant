/**
 * stormImpactSource — single source-of-truth resolver for address-level hail
 * impact, used by Susan (and matching the homeowner RoofCheck order).
 *
 * Order: IHM (Interactive Hail Maps / "Hail Recon") PRIMARY → Hail Yes
 * FALLBACK. Hail Yes is now private (LOCKDOWN); Susan's fallback call carries
 * Ahmed's service token (HAILYES_SERVICE_TOKEN) so it still resolves under his
 * account. Both adapters return the identical `AddressImpactReport` shape, so
 * this is a drop-in for either one.
 */
import { ihmConfigured, getAddressHailImpactViaIHM } from './ihmImpactAdapter.js';
import { getAddressHailImpactViaHailYes } from './hailYesImpactAdapter.js';
export async function getAddressHailImpactPreferIHM(lat, lng, monthsBack = 24) {
    if (ihmConfigured()) {
        try {
            return await getAddressHailImpactViaIHM(lat, lng, monthsBack);
        }
        catch (e) {
            console.warn('[StormSource] IHM primary failed, falling back to Hail Yes:', e.message);
        }
    }
    // Fallback: Hail Yes (federally corroborated). Carries the service token so
    // it works while Hail Yes is locked down to Ahmed's account.
    return getAddressHailImpactViaHailYes(lat, lng, monthsBack);
}
