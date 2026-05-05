/**
 * Adapter — calls Hail Yes /api/impact and maps the response to the
 * existing `AddressImpactReport` shape that susanGroupMeBotRoutes
 * already consumes. Drop-in replacement for `getAddressHailImpact` from
 * addressImpactService.
 *
 * Susan now reads citation-grade hail data from the Hail Yes app instead
 * of sa21's local mirror. Hail Yes is multi-source corroborated (NCEI +
 * SWDI + IEM LSR + HailTrace + IHM) and returns tier-classified events
 * with calibrated at-property readings.
 */
import { getImpact, filterHits, byMostRecent } from './hailYesClient.js';
function tierFromHit(hit) {
    const calibrated = hit.hail_calibrated_at_location ?? null;
    const peak = hit.peak_hail_inches ?? null;
    // Use calibrated-at-property if available; otherwise peak as a floor
    const maxHailInches = calibrated != null && calibrated > 0 ? calibrated : peak;
    const sizeLabel = hit.hail_at_property?.label ?? null;
    const severity = hit.hail_at_property?.severity ?? null;
    const sources = [];
    const s = hit.sources || {};
    if (s.ncei)
        sources.push('ncei');
    if (s.swdi)
        sources.push('swdi');
    if (s.iem)
        sources.push('iem');
    if (s.hailtrace)
        sources.push('hailtrace');
    if (s.ihm)
        sources.push('ihm');
    return {
        date: hit.event_date,
        maxHailInches,
        sizeLabel,
        severity,
        nearestMiles: hit.edge_distance_miles ?? undefined,
        confirmingReportCount: (hit.ground_reports_nearby || []).length,
        noaaConfirmed: !!s.ncei || !!s.swdi,
        sources,
        state: hit.state,
        // Hail Yes already does the swath/ground-upgrade reconciliation upstream;
        // we don't have explicit evidenceType but direct_hit implies polygon-or-upgrade.
        evidenceType: hit.impact_tier === 'direct_hit' ? 'mrms_polygon' : undefined,
    };
}
export async function getAddressHailImpactViaHailYes(lat, lng, monthsBack = 24) {
    const start = Date.now();
    const resp = await getImpact({ lat, lng });
    const empty = {
        lat,
        lng,
        monthsBack,
        directHits: [],
        nearMiss: [],
        areaImpact: [],
        summary: { directHitCount: 0, nearMissCount: 0, areaImpactCount: 0, datesExamined: 0 },
        cacheStats: { swathCacheHits: 0, swathColdFetches: 0, swathSkippedDueToCap: 0 },
    };
    if (!resp)
        return empty;
    const filtered = filterHits(resp, { monthsBack, minPeakInches: 0.5 });
    const sorted = byMostRecent(filtered);
    const directHits = [];
    const nearMiss = [];
    const areaImpact = [];
    for (const hit of sorted) {
        const tier = tierFromHit(hit);
        if (hit.impact_tier === 'direct_hit')
            directHits.push(tier);
        else if (hit.impact_tier === 'near_miss')
            nearMiss.push(tier);
        else
            areaImpact.push(tier);
    }
    console.log(`[HailYesAdapter] ${lat.toFixed(3)},${lng.toFixed(3)} → ${directHits.length} DH / ${nearMiss.length} NM / ${areaImpact.length} AI in ${Date.now() - start}ms`);
    return {
        lat,
        lng,
        monthsBack,
        directHits,
        nearMiss,
        areaImpact,
        summary: {
            directHitCount: directHits.length,
            nearMissCount: nearMiss.length,
            areaImpactCount: areaImpact.length,
            datesExamined: sorted.length,
        },
        cacheStats: { swathCacheHits: 0, swathColdFetches: 0, swathSkippedDueToCap: 0 },
    };
}
/**
 * For city queries — returns hits at city centroid, ordered by recency.
 * Used by hailAtCityRecent / hailAtCityOnDates replacement.
 */
export async function getCityHailViaHailYes(cityCentroidLat, cityCentroidLng, monthsBack = 24, onDates) {
    const resp = await getImpact({ lat: cityCentroidLat, lng: cityCentroidLng });
    const filtered = filterHits(resp, { monthsBack, minPeakInches: 0.5, onDates });
    return byMostRecent(filtered);
}
