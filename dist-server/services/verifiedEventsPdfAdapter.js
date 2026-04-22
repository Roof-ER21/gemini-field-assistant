/**
 * verifiedEventsPdfAdapter — queries verified_hail_events for a property
 * and maps results into the HailEvent[] / NOAAEvent[] format that
 * pdfReportServiceV2 already consumes.
 *
 * No changes to the PDF service required — this is just a data feeder.
 *
 * Usage:
 *   const adapter = new VerifiedEventsPdfAdapter(pool);
 *   const { events, noaaEvents } = await adapter.getEventsForProperty(lat, lng, 10);
 *   pdfService.generateReport({ ..., events, noaaEvents, ... });
 */
/**
 * Infer NWS Forecast Office from a radar site (WSR_ID). Only maps the ones
 * relevant to our VA/MD/PA/neighbors coverage.
 */
function wfoFromRadarSite(wsrId) {
    if (!wsrId)
        return undefined;
    const site = wsrId.toUpperCase().trim();
    const map = {
        KLWX: 'LWX', // Sterling VA — Baltimore/Washington WFO
        KAKQ: 'AKQ', // Wakefield VA — Wakefield WFO
        KFCX: 'RNK', // Blacksburg VA — Blacksburg/Roanoke WFO
        KMHX: 'MHX', // Morehead City NC
        KDIX: 'PHI', // Philadelphia/Mt Holly NJ WFO
        KCCX: 'CTP', // State College PA
        KPBZ: 'PBZ', // Pittsburgh PA
        KDOX: 'LWX', // Dover DE (covered by LWX or PHI depending on area)
        KRLX: 'RLX', // Charleston WV
        KBGM: 'BGM', // Binghamton NY
        KCLE: 'CLE', // Cleveland OH
    };
    return map[site];
}
function extractSourceIds(row) {
    const sd = row.source_details || {};
    const noaaEventId = sd.noaa_ncei?.event_id ? String(sd.noaa_ncei.event_id) : undefined;
    const spcOmId = sd.spc_wcm?.om_id ? String(sd.spc_wcm.om_id) : undefined;
    const radarSite = sd.ncei_swdi?.wsr_id ? String(sd.ncei_swdi.wsr_id) : undefined;
    const cocorahsStation = sd.cocorahs?.station_number ? String(sd.cocorahs.station_number) : undefined;
    // WFO: prefer IEM LSR's wfo field, fall back to radar-site mapping
    const nwsForecastOffice = (sd.iem_lsr?.wfo && String(sd.iem_lsr.wfo))
        || wfoFromRadarSite(radarSite);
    return { noaaEventId, spcOmId, radarSite, nwsForecastOffice, cocorahsStation };
}
function severityFor(hailInches) {
    const s = hailInches ?? 0;
    if (s >= 1.75)
        return 'severe';
    if (s >= 1.0)
        return 'moderate';
    return 'minor';
}
function buildSourceList(row) {
    const parts = [];
    if (row.source_noaa_ncei)
        parts.push('NOAA');
    if (row.source_spc_wcm)
        parts.push('SPC');
    if (row.source_ncei_swdi)
        parts.push('NCEI-SWDI');
    if (row.source_iem_lsr)
        parts.push('NWS-LSR');
    if (row.source_cocorahs)
        parts.push('CoCoRaHS');
    if (row.source_rep_report)
        parts.push('Rep Report');
    if (row.source_customer_report)
        parts.push('Customer Report');
    if (row.source_hailtrace)
        parts.push('HailTrace');
    if (row.source_ihm)
        parts.push('IHM');
    return parts.length > 0 ? parts.join(' + ') : 'verified';
}
export class VerifiedEventsPdfAdapter {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    /**
     * Get hail + wind/tornado events for a property, already formatted for PDF input.
     *
     * @param lat           Property latitude
     * @param lng           Property longitude
     * @param radiusMiles   Search radius (default 10)
     * @param yearsBack     Look back N years (default 5)
     * @param publicOnly    Use verified_hail_events_public view (excludes unverified rep reports)
     */
    async getEventsForProperty(lat, lng, radiusMiles = 10, yearsBack = 5, publicOnly = true) {
        const fromDate = new Date();
        fromDate.setFullYear(fromDate.getFullYear() - yearsBack);
        const fromStr = fromDate.toISOString().slice(0, 10);
        const table = publicOnly ? 'verified_hail_events_public' : 'verified_hail_events';
        const haversine = `3959 * acos(
      cos(radians($1)) * cos(radians(latitude)) *
      cos(radians(longitude) - radians($2)) +
      sin(radians($1)) * sin(radians(latitude))
    )`;
        const query = `
      SELECT
        id, event_date,
        latitude::float AS latitude, longitude::float AS longitude,
        hail_size_inches, wind_mph, tornado_ef_rank, state,
        source_noaa_ncei, source_spc_wcm, source_ncei_swdi, source_iem_lsr,
        source_cocorahs, source_rep_report, source_customer_report, source_hailtrace, source_ihm,
        source_details,
        ${haversine} AS distance_miles
      FROM ${table}
      WHERE ${haversine} <= $3
        AND event_date >= $4::date
        AND (hail_size_inches IS NOT NULL OR wind_mph IS NOT NULL OR tornado_ef_rank IS NOT NULL)
      ORDER BY event_date DESC
      LIMIT 2000
    `;
        const result = await this.pool.query(query, [lat, lng, radiusMiles, fromStr]);
        // One row per (date, primary source) so adjusters see NOAA, NEXRAD,
        // SPC, CoCoRaHS as independent confirming sources when each exists for
        // a date — not just the single max observation.
        //
        // Why: NOAA hail ground-reports are ~100x rarer than radar hail signatures
        // in verified_hail_events, and they rarely share a dedup bucket with
        // radar detections (different geocoding granularity). So "max per date"
        // almost always picks SWDI and loses NOAA attribution.
        //
        // Feeds:
        //  1. `eventsPerDateBySrc` — max hail per (date, primary source) for Documented Hail Events
        //  2. `allHailEvents`      — every radar pixel/report for Historical Storm Activity
        const allHailEvents = [];
        const eventsPerDateBySrc = new Map();
        // Pick the "primary" source of a DB row — the most prestigious flag set.
        // Order matters: NOAA ground-verified > SPC > radar > observer.
        const primarySourceOf = (row) => {
            if (row.source_noaa_ncei)
                return 'NOAA';
            if (row.source_spc_wcm)
                return 'SPC';
            if (row.source_iem_lsr)
                return 'NWS';
            if (row.source_cocorahs)
                return 'CoCoRaHS';
            if (row.source_ncei_swdi)
                return 'NEXRAD';
            if (row.source_hailtrace)
                return 'HailTrace';
            if (row.source_rep_report)
                return 'Rep';
            if (row.source_customer_report)
                return 'Customer';
            return 'other';
        };
        // Consolidated NOAA events for Verified Ground Observations (Wind + Tornado)
        const noaaAgg = new Map();
        for (const row of result.rows) {
            const sources = buildSourceList(row);
            const eventDateIso = typeof row.event_date === 'string'
                ? row.event_date
                : new Date(row.event_date).toISOString().slice(0, 10);
            if (row.hail_size_inches != null && Number(row.hail_size_inches) > 0) {
                const hailSize = Number(row.hail_size_inches);
                const dist = Number(row.distance_miles);
                const ids = extractSourceIds(row);
                const e = {
                    id: row.id,
                    date: eventDateIso,
                    latitude: row.latitude,
                    longitude: row.longitude,
                    hailSize,
                    severity: severityFor(hailSize),
                    source: sources,
                    distanceMiles: dist,
                    comments: `${hailSize.toFixed(2)}" hail at ${dist.toFixed(1)}mi — ${sources}`,
                    ...ids,
                };
                allHailEvents.push(e);
                // Key by (date, primary_source) so each source contributes its best row per date
                const primary = primarySourceOf(row);
                const key = `${eventDateIso}::${primary}`;
                const existing = eventsPerDateBySrc.get(key);
                if (!existing || hailSize > (existing.hailSize ?? 0)) {
                    eventsPerDateBySrc.set(key, e);
                }
            }
        }
        // events = one row per (date, primary source) for the Documented Hail Events table
        // historyEvents = every radar pixel for the Historical Storm Activity table's distance banding
        const events = Array.from(eventsPerDateBySrc.values()).sort((a, b) => {
            // Sort: most recent date first, then biggest hail first within a date
            const dcmp = b.date.localeCompare(a.date);
            if (dcmp !== 0)
                return dcmp;
            return (b.hailSize ?? 0) - (a.hailSize ?? 0);
        });
        const historyEvents = allHailEvents;
        // One row per (date, event_type) — max magnitude of the day,
        // with the CLOSEST occurrence's distance for adjuster reference.
        for (const row of result.rows) {
            const sources = buildSourceList(row);
            const eventDateIso = typeof row.event_date === 'string'
                ? row.event_date
                : new Date(row.event_date).toISOString().slice(0, 10);
            const ids = extractSourceIds(row);
            const addOrMax = (type, mag, idSuffix, distance) => {
                if (mag == null || mag <= 0)
                    return;
                const key = `${eventDateIso}::${type}`;
                const existing = noaaAgg.get(key);
                if (!existing || mag > existing.magnitude) {
                    noaaAgg.set(key, {
                        id: row.id + idSuffix,
                        eventDateIso,
                        latitude: row.latitude,
                        longitude: row.longitude,
                        magnitude: mag,
                        eventType: type,
                        location: row.state ?? 'Event',
                        distanceMiles: existing && existing.distanceMiles < distance ? existing.distanceMiles : distance,
                        sources,
                        ...ids,
                    });
                }
                else if (existing && distance < existing.distanceMiles) {
                    existing.distanceMiles = distance;
                }
            };
            if (row.wind_mph != null) {
                addOrMax('wind', Number(row.wind_mph), '_wind', Number(row.distance_miles));
            }
            if (row.tornado_ef_rank != null) {
                addOrMax('tornado', Number(row.tornado_ef_rank), '_torn', Number(row.distance_miles));
            }
        }
        // Flatten consolidated NOAA aggregations into the expected shape
        const noaaEvents = Array.from(noaaAgg.values()).map((a) => ({
            id: a.id,
            date: a.eventDateIso,
            latitude: a.latitude,
            longitude: a.longitude,
            magnitude: a.magnitude,
            eventType: a.eventType,
            location: a.location,
            distanceMiles: a.distanceMiles,
            comments: a.eventType === 'hail'
                ? `${a.magnitude.toFixed(2)}" max hail (${a.location}) — ${a.sources}`
                : a.eventType === 'wind'
                    ? `${a.magnitude} mph max wind (${a.location}) — ${a.sources}`
                    : `Tornado EF${a.magnitude} (${a.location}) — ${a.sources}`,
            noaaEventId: a.noaaEventId,
            spcOmId: a.spcOmId,
            radarSite: a.radarSite,
            nwsForecastOffice: a.nwsForecastOffice,
            cocorahsStation: a.cocorahsStation,
        }));
        // Sort: most recent first, then largest magnitude first
        noaaEvents.sort((a, b) => {
            const dateCmp = b.date.localeCompare(a.date);
            if (dateCmp !== 0)
                return dateCmp;
            return (b.magnitude || 0) - (a.magnitude || 0);
        });
        return {
            events,
            historyEvents,
            noaaEvents,
            totalInDb: result.rows.length,
        };
    }
}
