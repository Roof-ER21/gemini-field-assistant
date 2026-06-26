// @ts-nocheck
/**
 * Interactive Hail Maps (IHM / Hail Recon) → AddressImpactReport adapter for the
 * homeowner RoofCheck tool. A thin layer over the existing, production hailMapsService
 * (which owns IHM auth + response parsing), so creds + endpoints stay in ONE place:
 *   IHM_API_KEY + IHM_API_SECRET (+ optional IHM_BASE_URL) — already set in Railway.
 *
 * Tiering (mirrors Hail Yes's directHit / nearMiss / areaImpact, using IHM's bands):
 *   SizeAtLocation  > 0  → directHit   (hail at the property)
 *   SizeWithin1Mile > 0  → nearMiss    (~1 mi)
 *   SizeWithin3Mile > 0  → nearMiss    (~3 mi)
 *   SizeWithin10Mile> 0  → areaImpact  (context only)
 */
import { hailMapsService } from './hailMapsService.js';
export function ihmConfigured() {
    return hailMapsService.isConfigured();
}
function pos(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
}
function tierOf(raw) {
    const r = raw || {};
    const atLoc = pos(r.SizeAtLocation);
    if (atLoc)
        return { tier: 'direct', inches: atLoc };
    const w1 = pos(r.SizeWithin1Mile);
    if (w1)
        return { tier: 'near', inches: w1, nearestMiles: 1 };
    const w3 = pos(r.SizeWithin3Mile);
    if (w3)
        return { tier: 'near', inches: w3, nearestMiles: 3 };
    const w10 = pos(r.SizeWithin10Mile);
    if (w10)
        return { tier: 'area', inches: w10, nearestMiles: 10 };
    return { tier: null, inches: null };
}
function sizeLabel(inches) {
    if (!inches || inches <= 0)
        return null;
    return `${Math.round(inches * 4) / 4}″`;
}
function severityOf(inches) {
    if (!inches)
        return 'trace';
    if (inches >= 2)
        return 'severe';
    if (inches >= 1)
        return 'moderate';
    return 'minor';
}
const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
/** Drop-in for getAddressHailImpactViaHailYes — IHM-sourced AddressImpactReport. */
export async function getAddressHailImpactViaIHM(lat, lng, monthsBack = 24) {
    const events = await hailMapsService.impactEventsByCoordinates(lat, lng, monthsBack);
    const directHits = [];
    const nearMiss = [];
    const areaImpact = [];
    for (const e of events) {
        const { tier, inches, nearestMiles } = tierOf(e.raw);
        if (!tier || !e.date)
            continue;
        const t = {
            date: String(e.date).slice(0, 10),
            maxHailInches: inches,
            sizeLabel: sizeLabel(inches),
            severity: severityOf(inches),
            confirmingReportCount: 0,
            noaaConfirmed: false,
            sources: ['ihm'],
            state: null,
            ...(nearestMiles ? { nearestMiles } : {}),
        };
        (tier === 'direct' ? directHits : tier === 'near' ? nearMiss : areaImpact).push(t);
    }
    directHits.sort(byDateDesc);
    nearMiss.sort(byDateDesc);
    areaImpact.sort(byDateDesc);
    return {
        lat, lng, monthsBack,
        directHits, nearMiss, areaImpact,
        summary: {
            directHitCount: directHits.length,
            nearMissCount: nearMiss.length,
            areaImpactCount: areaImpact.length,
            datesExamined: events.length,
        },
        cacheStats: { swathCacheHits: 0, swathColdFetches: 0, swathSkippedDueToCap: 0 },
    };
}
/** Admin probe — raw IHM sample + the mapped tiers, to verify the source/mapping live. */
export async function ihmProbe(lat, lng, months = 24) {
    const events = await hailMapsService.impactEventsByCoordinates(lat, lng, months);
    const report = await getAddressHailImpactViaIHM(lat, lng, months);
    return {
        rawEventCount: events.length,
        sampleRaw: events.slice(0, 3).map((e) => e.raw),
        mappedSummary: report.summary,
        directHits: report.directHits.slice(0, 6),
        nearMiss: report.nearMiss.slice(0, 6),
    };
}
