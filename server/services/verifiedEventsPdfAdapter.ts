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

    const events: HailEvent[] = [];
    const noaaEvents: NOAAEvent[] = [];

    for (const row of result.rows) {
      const sources = buildSourceList(row);
      const eventDateIso = typeof row.event_date === 'string'
        ? row.event_date
        : new Date(row.event_date).toISOString().slice(0, 10);

      // Map hail events into the HailEvent format consumed by the PDF's historical table
      if (row.hail_size_inches != null && Number(row.hail_size_inches) > 0) {
        events.push({
          id: row.id,
          date: eventDateIso,
          latitude: row.latitude,
          longitude: row.longitude,
          hailSize: Number(row.hail_size_inches),
          severity: severityFor(Number(row.hail_size_inches)),
          source: sources,
          distanceMiles: Number(row.distance_miles),
          comments: `Hail ${Number(row.hail_size_inches).toFixed(2)}" — ${sources}`,
        });
      }

      // Map wind and tornado events into the NOAAEvent format
      if (row.wind_mph != null && Number(row.wind_mph) > 0) {
        noaaEvents.push({
          id: row.id + '_wind',
          date: eventDateIso,
          latitude: row.latitude,
          longitude: row.longitude,
          magnitude: Number(row.wind_mph),
          eventType: 'wind',
          location: `${row.state ?? 'Event'} (${sources})`,
          distanceMiles: Number(row.distance_miles),
          comments: `Wind ${row.wind_mph} mph — ${sources}`,
        });
      }

      if (row.tornado_ef_rank != null) {
        noaaEvents.push({
          id: row.id + '_torn',
          date: eventDateIso,
          latitude: row.latitude,
          longitude: row.longitude,
          magnitude: Number(row.tornado_ef_rank),
          eventType: 'tornado',
          location: `${row.state ?? 'Event'} EF${row.tornado_ef_rank} (${sources})`,
          distanceMiles: Number(row.distance_miles),
          comments: `Tornado EF${row.tornado_ef_rank} — ${sources}`,
        });
      }

      // ALSO add hail events into noaaEvents so the "noaa section" in the PDF shows them
      if (row.hail_size_inches != null && Number(row.hail_size_inches) > 0) {
        noaaEvents.push({
          id: row.id + '_hail',
          date: eventDateIso,
          latitude: row.latitude,
          longitude: row.longitude,
          magnitude: Number(row.hail_size_inches),
          eventType: 'hail',
          location: `${row.state ?? 'Event'} (${sources})`,
          distanceMiles: Number(row.distance_miles),
          comments: `Hail ${Number(row.hail_size_inches).toFixed(2)}" — ${sources}`,
        });
      }
    }

    return {
      events,
      noaaEvents,
      totalInDb: result.rows.length,
    };
  }
}
