/**
 * verificationService — populate VerificationContext for a property+date.
 *
 * sa21 (gemini-field-assistant) port of the storm-maps display-cap
 * verification path. Algorithm parity with /Users/a21/Desktop/storm-maps/
 * server/storm/verificationService.ts — only the database adapter differs:
 * sa21 uses node-postgres Pool, storm-maps uses postgres.js template tags.
 *
 * "Verified" per the 2026-04-27 meeting:
 *   - ≥3 ground spotter reports for the storm date within ≤0.5 mi
 *   - ≥1 of those reports from a government-backed source
 *     (NWS LSR ⇒ source_iem_lsr, OR NCEI Storm Events ⇒ source_ncei_storm_events)
 *
 * "At-location":
 *   - ≥1 ground report within ≤0.5 mi of the property point
 *
 * "Sterling-class":
 *   - delegated to displayCapService.isSterlingClassStorm
 *
 * Bulk-friendly: a single SQL round-trip can resolve verification for an
 * arbitrary list of dates so callers (PDF gen, per-date-impact endpoint)
 * don't fan out one query per date.
 */

import type { Pool } from 'pg';
import {
  computeConsensusSize,
  isSterlingClassStorm,
  type VerificationContext,
} from './displayCapService.js';

const AT_LOCATION_MI = 0.5;
// Lat/lng prefilter window for the SQL — wider than 0.5 mi to be safe,
// then the haversine count drops anything outside the true 0.5 mi circle.
const AT_LOCATION_LAT_PAD = 0.012; // ~0.83 mi
const AT_LOCATION_LNG_PAD = 0.015; // ~0.83 mi at this latitude

interface CountRow {
  event_date: string | Date;
  ground_reports_within_half_mi: number;
  gov_reports_within_half_mi: number;
}

interface SizedRow {
  event_date: string;
  source: string;
  size_inches: number;
}

/**
 * Resolve VerificationContext for one date+location.
 */
export async function buildVerification(
  pool: Pool,
  opts: { lat: number; lng: number; date: string },
): Promise<VerificationContext> {
  const map = await buildVerificationBulk(pool, {
    lat: opts.lat,
    lng: opts.lng,
    dates: [opts.date],
  });
  return (
    map.get(opts.date) ?? {
      isVerified: false,
      isAtLocation: false,
      isSterlingClass: isSterlingClassStorm(opts.date, opts.lat, opts.lng),
    }
  );
}

/**
 * Bulk variant — one SQL query for an arbitrary list of dates.
 *
 * Compares event_date::text against a text[] parameter (rather than
 * binding a date[] directly) — postgres.js had trouble with that path
 * and node-postgres handles text[] more cleanly anyway.
 */
export async function buildVerificationBulk(
  pool: Pool,
  opts: { lat: number; lng: number; dates: string[] },
): Promise<Map<string, VerificationContext>> {
  const out = new Map<string, VerificationContext>();
  if (opts.dates.length === 0) return out;

  const dateStrs = opts.dates.map((d) => String(d).slice(0, 10));

  // Seed defaults so callers always get a context for every requested date.
  for (const d of dateStrs) {
    out.set(d, {
      isVerified: false,
      isAtLocation: false,
      isSterlingClass: isSterlingClassStorm(d, opts.lat, opts.lng),
    });
  }

  try {
    const haversine = `3959 * acos(LEAST(1.0,
      cos(radians($1)) * cos(radians(lat)) *
      cos(radians(lng) - radians($2)) +
      sin(radians($1)) * sin(radians(lat))
    ))`;

    const countSql = `
      SELECT
        event_date,
        COUNT(*) FILTER (WHERE ${haversine} <= $3)::int AS ground_reports_within_half_mi,
        COUNT(*) FILTER (
          WHERE ${haversine} <= $3
          AND (source_ncei_storm_events OR source_iem_lsr)
        )::int AS gov_reports_within_half_mi
        FROM verified_hail_events
       WHERE event_date::text = ANY($4)
         AND lat BETWEEN $5 AND $6
         AND lng BETWEEN $7 AND $8
         AND COALESCE(hail_size_inches, magnitude, 0) >= 0.25
         AND (
           source_ncei_storm_events
           OR source_iem_lsr
           OR source_ncei_swdi
           OR source_mping
           OR source_spc_hail
         )
       GROUP BY event_date
    `;

    const sizedSql = `
      SELECT
        event_date::text AS event_date,
        (CASE
           WHEN source_ncei_storm_events THEN 'ncei-storm-events'
           WHEN source_iem_lsr THEN 'iem-lsr'
           WHEN source_ncei_swdi THEN 'ncei-swdi'
           WHEN source_mping THEN 'mping'
           WHEN source_spc_hail THEN 'spc'
           ELSE 'other'
         END) AS source,
        COALESCE(hail_size_inches, magnitude, 0)::float AS size_inches
        FROM verified_hail_events
       WHERE event_date::text = ANY($4)
         AND lat BETWEEN $5 AND $6
         AND lng BETWEEN $7 AND $8
         AND COALESCE(hail_size_inches, magnitude, 0) >= 0.25
         AND (
           source_ncei_storm_events
           OR source_iem_lsr
           OR source_ncei_swdi
           OR source_mping
           OR source_spc_hail
         )
         AND ${haversine} <= $3
    `;

    const params = [
      opts.lat,
      opts.lng,
      AT_LOCATION_MI,
      dateStrs,
      opts.lat - AT_LOCATION_LAT_PAD,
      opts.lat + AT_LOCATION_LAT_PAD,
      opts.lng - AT_LOCATION_LNG_PAD,
      opts.lng + AT_LOCATION_LNG_PAD,
    ];

    const [countRes, sizedRes] = await Promise.all([
      pool.query<CountRow>(countSql, params),
      pool.query<SizedRow>(sizedSql, params),
    ]);

    const reportsByDate = new Map<string, SizedRow[]>();
    for (const r of sizedRes.rows) {
      const dateStr = r.event_date.slice(0, 10);
      const arr = reportsByDate.get(dateStr) ?? [];
      arr.push(r);
      reportsByDate.set(dateStr, arr);
    }

    for (const r of countRes.rows) {
      const dateStr =
        r.event_date instanceof Date
          ? r.event_date.toISOString().slice(0, 10)
          : String(r.event_date).slice(0, 10);
      const ground = Number(r.ground_reports_within_half_mi) || 0;
      const gov = Number(r.gov_reports_within_half_mi) || 0;
      const reports = reportsByDate.get(dateStr) ?? [];
      const consensusSize = computeConsensusSize(
        reports.map((rr) => ({ source: rr.source, sizeInches: rr.size_inches })),
      );
      out.set(dateStr, {
        isVerified: ground >= 3 && gov >= 1,
        isAtLocation: ground >= 1,
        isSterlingClass: isSterlingClassStorm(dateStr, opts.lat, opts.lng),
        consensusSize,
      });
    }
  } catch (err) {
    console.warn(
      '[verificationService] bulk query failed:',
      (err as Error).message,
    );
  }
  return out;
}
