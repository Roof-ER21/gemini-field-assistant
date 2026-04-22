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

import { Pool } from 'pg';

interface HailEvent {
  id: string;
  date: string;
  latitude: number;
  longitude: number;
  hailSize: number | null;
  severity: 'minor' | 'moderate' | 'severe';
  source: string;
  distanceMiles?: number;
  comments?: string;
}

interface NOAAEvent {
  id: string;
  date: string;
  latitude: number;
  longitude: number;
  magnitude: number | null;
  eventType: 'hail' | 'wind' | 'tornado';
  location: string;
  distanceMiles?: number;
  comments?: string;
}

function severityFor(hailInches: number | null): 'minor' | 'moderate' | 'severe' {
  const s = hailInches ?? 0;
  if (s >= 1.75) return 'severe';
  if (s >= 1.0) return 'moderate';
  return 'minor';
}

function buildSourceList(row: any): string {
  const parts: string[] = [];
  if (row.source_noaa_ncei) parts.push('NOAA');
  if (row.source_spc_wcm) parts.push('SPC');
  if (row.source_ncei_swdi) parts.push('NCEI-SWDI');
  if (row.source_iem_lsr) parts.push('NWS-LSR');
  if (row.source_cocorahs) parts.push('CoCoRaHS');
  if (row.source_rep_report) parts.push('Rep Report');
  if (row.source_customer_report) parts.push('Customer Report');
  if (row.source_hailtrace) parts.push('HailTrace');
  if (row.source_ihm) parts.push('IHM');
  return parts.length > 0 ? parts.join(' + ') : 'verified';
}

export class VerifiedEventsPdfAdapter {
  constructor(private pool: Pool) {}

  /**
   * Get hail + wind/tornado events for a property, already formatted for PDF input.
   *
   * @param lat           Property latitude
   * @param lng           Property longitude
   * @param radiusMiles   Search radius (default 10)
   * @param yearsBack     Look back N years (default 5)
   * @param publicOnly    Use verified_hail_events_public view (excludes unverified rep reports)
   */
  async getEventsForProperty(
    lat: number,
    lng: number,
    radiusMiles: number = 10,
    yearsBack: number = 5,
    publicOnly: boolean = true,
  ): Promise<{ events: HailEvent[]; noaaEvents: NOAAEvent[]; totalInDb: number }> {
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
        ${haversine} AS distance_miles
      FROM ${table}
      WHERE ${haversine} <= $3
        AND event_date >= $4::date
        AND (hail_size_inches IS NOT NULL OR wind_mph IS NOT NULL OR tornado_ef_rank IS NOT NULL)
      ORDER BY event_date DESC
      LIMIT 2000
    `;

    const result = await this.pool.query(query, [lat, lng, radiusMiles, fromStr]);

    // BOTH arrays get consolidated so the PDF never shows 20 near-identical
    // radar cells for one storm. Consolidation keys on (date, distance_band) for
    // events and (date, type, distance_band) for noaaEvents.
    //
    // Distance bands for both: 0-1mi, 1-3mi, 3-5mi, 5-10mi.
    const distBand = (d: number): string =>
      d <= 1 ? '0-1mi' : d <= 3 ? '1-3mi' : d <= 5 ? '3-5mi' : '5-10mi';

    // Consolidated hail events for Historical Storm Activity + Verified Hail Observations
    const eventsAgg = new Map<string, HailEvent>();

    // Consolidated NOAA events for Verified Ground Observations (Wind + Tornado)
    const noaaAgg = new Map<string, {
      id: string;
      eventDateIso: string;
      latitude: number;
      longitude: number;
      magnitude: number;
      eventType: 'hail' | 'wind' | 'tornado';
      location: string;
      distanceMiles: number;
      sources: string;
    }>();

    for (const row of result.rows) {
      const sources = buildSourceList(row);
      const eventDateIso = typeof row.event_date === 'string'
        ? row.event_date
        : new Date(row.event_date).toISOString().slice(0, 10);

      // Consolidate hail into `events` — 1 record per (date, distance_band)
      // keeping max hail size. Result: ~4 rows max per storm date instead of 20+.
      if (row.hail_size_inches != null && Number(row.hail_size_inches) > 0) {
        const hailSize = Number(row.hail_size_inches);
        const dist = Number(row.distance_miles);
        const band = distBand(dist);
        const key = `${eventDateIso}::${band}`;
        const existing = eventsAgg.get(key);
        if (!existing || hailSize > (existing.hailSize ?? 0)) {
          eventsAgg.set(key, {
            id: row.id,
            date: eventDateIso,
            latitude: row.latitude,
            longitude: row.longitude,
            hailSize,
            severity: severityFor(hailSize),
            source: sources,
            distanceMiles: dist,
            comments: `Max ${hailSize.toFixed(2)}" hail in ${band} band — ${sources}`,
          });
        }
      }
    }

    const events: HailEvent[] = Array.from(eventsAgg.values());

    // Re-process for NOAA section (wind + tornado only; hail handled above)
    for (const row of result.rows) {
      const sources = buildSourceList(row);
      const eventDateIso = typeof row.event_date === 'string'
        ? row.event_date
        : new Date(row.event_date).toISOString().slice(0, 10);

      const addOrMax = (
        type: 'hail' | 'wind' | 'tornado',
        mag: number,
        idSuffix: string,
        distance: number,
      ) => {
        if (mag == null || mag <= 0) return;
        const band = distBand(distance);
        const key = `${eventDateIso}::${type}::${band}`;
        const existing = noaaAgg.get(key);
        if (!existing || mag > existing.magnitude) {
          noaaAgg.set(key, {
            id: row.id + idSuffix,
            eventDateIso,
            latitude: row.latitude,
            longitude: row.longitude,
            magnitude: mag,
            eventType: type,
            location: `${row.state ?? 'Event'} (${band})`,
            distanceMiles: distance,
            sources,
          });
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
    const noaaEvents: NOAAEvent[] = Array.from(noaaAgg.values()).map((a) => ({
      id: a.id,
      date: a.eventDateIso,
      latitude: a.latitude,
      longitude: a.longitude,
      magnitude: a.magnitude,
      eventType: a.eventType,
      location: a.location,
      distanceMiles: a.distanceMiles,
      comments:
        a.eventType === 'hail'
          ? `${a.magnitude.toFixed(2)}" max hail (${a.location}) — ${a.sources}`
          : a.eventType === 'wind'
            ? `${a.magnitude} mph max wind (${a.location}) — ${a.sources}`
            : `Tornado EF${a.magnitude} (${a.location}) — ${a.sources}`,
    }));

    // Sort: most recent first, then largest magnitude first
    noaaEvents.sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return (b.magnitude || 0) - (a.magnitude || 0);
    });

    return {
      events,
      noaaEvents,
      totalInDb: result.rows.length,
    };
  }
}
