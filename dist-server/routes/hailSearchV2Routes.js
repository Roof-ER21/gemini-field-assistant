/**
 * /api/hail/search-v2 and /api/hail/address-history-v2
 *
 * Shadow endpoints that query the new unified verified_hail_events table.
 * Live in parallel with /api/hail/search (old noaaStormService-backed).
 * Zero impact on existing callers until/unless frontend switches over.
 *
 * Mount in server/index.ts when ready:
 *   import { hailSearchV2Routes } from './routes/hailSearchV2Routes.js';
 *   app.use('/api/hail', hailSearchV2Routes(pool));
 *
 * Feature gate: none (these are additive endpoints — callers opt in by URL).
 */
import { Router } from 'express';
import { VerifiedEventsService } from '../services/verifiedEventsService.js';
// Reuse the existing geocoding helpers. If they're not exported, we hit the
// Census API + Nominatim fallback directly here.
async function geocodeAddress(address) {
    try {
        const censusUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
        const resp = await fetch(censusUrl, {
            signal: AbortSignal.timeout(8000),
            headers: { 'User-Agent': 'CC21-hail-search/1.0' },
        });
        if (resp.ok) {
            const data = await resp.json();
            const match = data?.result?.addressMatches?.[0];
            if (match?.coordinates) {
                return { lat: match.coordinates.y, lng: match.coordinates.x };
            }
        }
    }
    catch { }
    // Nominatim fallback
    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&countrycodes=us&limit=1`;
        const resp = await fetch(url, {
            signal: AbortSignal.timeout(8000),
            headers: { 'User-Agent': 'CC21-hail-search/1.0 (ahmed@theroofdocs.com)' },
        });
        if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data) && data.length > 0) {
                return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
            }
        }
    }
    catch { }
    return null;
}
function sourceListFromRow(row) {
    const out = [];
    if (row.source_noaa_ncei)
        out.push('NOAA NCEI');
    if (row.source_iem_lsr)
        out.push('NWS LSR (IEM)');
    if (row.source_ncei_swdi)
        out.push('NCEI Radar (NX3HAIL)');
    if (row.source_mrms)
        out.push('MRMS');
    if (row.source_nws_alert)
        out.push('NWS Alert');
    if (row.source_iem_vtec)
        out.push('NWS Warning Archive');
    if (row.source_cocorahs)
        out.push('CoCoRaHS Observer');
    if (row.source_mping)
        out.push('mPING');
    if (row.source_synoptic)
        out.push('Synoptic Mesonet');
    if (row.source_spc_wcm)
        out.push('SPC WCM');
    if (row.source_rep_report)
        out.push('Rep Self-Report (verified)');
    if (row.source_customer_report)
        out.push('Customer Report (verified)');
    if (row.source_groupme)
        out.push('GroupMe Auto-Parse');
    if (row.source_hailtrace)
        out.push('HailTrace');
    if (row.source_ihm)
        out.push('IHM');
    return out;
}
export function hailSearchV2Routes(pool) {
    const router = Router();
    const svc = new VerifiedEventsService(pool);
    /**
     * GET /search-v2
     * Query params: address, months (default 24), radiusMiles (default 15),
     *   minHailInches (optional), minWindMph (optional)
     * OR: lat, lng instead of address
     */
    router.get('/search-v2', async (req, res) => {
        try {
            const { address, lat, lng } = req.query;
            const months = Math.max(Number(req.query.months) || 24, 24);
            const radiusMiles = Math.min(Number(req.query.radiusMiles) || 15, 50);
            const minHailInches = req.query.minHailInches != null ? Number(req.query.minHailInches) : undefined;
            const minWindMph = req.query.minWindMph != null ? Number(req.query.minWindMph) : undefined;
            let latitude = null;
            let longitude = null;
            let resolvedAddress = String(address || '');
            if (lat && lng) {
                latitude = Number(lat);
                longitude = Number(lng);
            }
            else if (address) {
                const geo = await geocodeAddress(String(address));
                if (!geo)
                    return res.status(400).json({ error: 'Could not geocode address' });
                latitude = geo.lat;
                longitude = geo.lng;
            }
            else {
                return res.status(400).json({ error: 'address OR (lat,lng) required' });
            }
            const fromDate = new Date();
            fromDate.setMonth(fromDate.getMonth() - months);
            const fromStr = fromDate.toISOString().slice(0, 10);
            const toStr = new Date().toISOString().slice(0, 10);
            const events = await svc.queryByLocation({
                latitude,
                longitude,
                radiusMiles,
                fromDate: fromStr,
                toDate: toStr,
                minHailInches,
                minWindMph,
                usePublicView: true,
            });
            const formatted = events.map((r) => ({
                id: r.id,
                event_date: r.event_date,
                latitude: Number(r.latitude),
                longitude: Number(r.longitude),
                distance_miles: Number(r.distance_miles).toFixed(2),
                state: r.state,
                hail_size_inches: r.hail_size_inches != null ? Number(r.hail_size_inches) : null,
                wind_mph: r.wind_mph,
                tornado_ef_rank: r.tornado_ef_rank,
                verification_count: r.public_verification_count ?? r.verification_count,
                confidence_tier: r.confidence_tier,
                sources: sourceListFromRow(r),
                algorithm_hail_inches: r.algorithm_hail_size_inches != null ? Number(r.algorithm_hail_size_inches) : null,
                verified_hail_inches: r.verified_hail_size_inches != null ? Number(r.verified_hail_size_inches) : null,
            }));
            // Summary stats
            const hailEvents = formatted.filter((e) => e.hail_size_inches != null);
            const windEvents = formatted.filter((e) => e.wind_mph != null);
            res.json({
                success: true,
                address: resolvedAddress,
                location: { lat: latitude, lng: longitude },
                search: { months, radiusMiles },
                totals: {
                    all: formatted.length,
                    hail: hailEvents.length,
                    wind: windEvents.length,
                    actionable_hail: formatted.filter((e) => e.hail_size_inches && e.hail_size_inches >= 0.5).length,
                    severe_wind: formatted.filter((e) => e.wind_mph && e.wind_mph >= 58).length,
                    tornado: formatted.filter((e) => e.tornado_ef_rank != null).length,
                    multi_source_confirmed: formatted.filter((e) => (e.verification_count || 0) >= 2).length,
                },
                events: formatted,
                data_source_note: 'Unified multi-source pipeline (NOAA NCEI + SPC WCM + NCEI SWDI radar + IEM LSR + CoCoRaHS). Deduplicated at ~110m precision.',
            });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    /**
     * GET /address-history-v2?address=...
     * Returns event count by year + most recent impact.
     */
    router.get('/address-history-v2', async (req, res) => {
        try {
            const address = String(req.query.address || '');
            if (!address)
                return res.status(400).json({ error: 'address required' });
            const geo = await geocodeAddress(address);
            if (!geo)
                return res.status(400).json({ error: 'Could not geocode address' });
            const radiusMiles = Math.min(Number(req.query.radiusMiles) || 2, 10);
            const history = await pool.query(`SELECT
           EXTRACT(YEAR FROM event_date)::int AS year,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE hail_size_inches > 0)::int AS hail_events,
           COUNT(*) FILTER (WHERE hail_size_inches >= 0.5)::int AS actionable_hail,
           COUNT(*) FILTER (WHERE wind_mph >= 58)::int AS severe_wind,
           COUNT(*) FILTER (WHERE tornado_ef_rank IS NOT NULL)::int AS tornadoes,
           MAX(hail_size_inches) AS max_hail,
           MAX(wind_mph) AS max_wind
         FROM verified_hail_events_public
         WHERE 3959 * acos(
            cos(radians($1)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(latitude))
         ) <= $3
         GROUP BY year
         ORDER BY year DESC`, [geo.lat, geo.lng, radiusMiles]);
            const latestImpact = await pool.query(`SELECT event_date, hail_size_inches, wind_mph, tornado_ef_rank, confidence_tier,
                source_noaa_ncei, source_cocorahs, source_ncei_swdi, source_iem_lsr, source_spc_wcm,
                public_verification_count AS verification_count
         FROM verified_hail_events_public
         WHERE 3959 * acos(
            cos(radians($1)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(latitude))
         ) <= $3
         ORDER BY event_date DESC
         LIMIT 1`, [geo.lat, geo.lng, radiusMiles]);
            res.json({
                success: true,
                address,
                location: geo,
                radius_miles: radiusMiles,
                yearly_history: history.rows,
                latest_impact: latestImpact.rows[0] || null,
                data_source_note: 'Unified multi-source (NOAA + SPC + SWDI radar + IEM LSR + CoCoRaHS).',
            });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    /**
     * GET /stats
     * Diagnostic: total events, by source, by tier.
     */
    router.get('/stats', async (req, res) => {
        try {
            const [total, bySource, byTier] = await Promise.all([
                pool.query(`SELECT COUNT(*)::int AS c FROM verified_hail_events`),
                pool.query(`SELECT * FROM verified_hail_events_stats_by_source`),
                pool.query(`SELECT * FROM verified_hail_events_stats_by_tier`),
            ]);
            res.json({
                total: total.rows[0].c,
                by_source: bySource.rows,
                by_tier: byTier.rows,
            });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    return router;
}
