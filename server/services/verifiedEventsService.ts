/**
 * verifiedEventsService — unified upsert layer for verified_hail_events
 *
 * All source ingesters route writes through this service. It enforces:
 *   - Deterministic dedup via (event_date, lat_bucket, lng_bucket) unique constraint
 *   - Source priority for size/wind override (NOAA > CoCoRaHS > rep > MRMS > NCEI SWDI > NWS)
 *   - Dual-track field maintenance (algorithm_* vs verified_*)
 *   - source_details JSONB audit trail merging
 *   - ET timezone normalization on event_date
 */

import { Pool, PoolClient } from 'pg';

export type SourceName =
  | 'noaa_ncei'
  | 'iem_lsr'
  | 'ncei_swdi'
  | 'mrms'
  | 'nws_alert'
  | 'iem_vtec'
  | 'cocorahs'
  | 'mping'
  | 'synoptic'
  | 'spc_wcm'
  | 'rep_report'
  | 'customer_report'
  | 'groupme'
  | 'hailtrace'
  | 'ihm';

export type SourceTrack = 'algorithm' | 'verified';

// Map each source to its track + priority (1 = highest)
const SOURCE_CONFIG: Record<SourceName, { track: SourceTrack; priority: number }> = {
  noaa_ncei:       { track: 'verified',  priority: 1 }, // Gold standard NWS-reviewed
  cocorahs:        { track: 'verified',  priority: 2 }, // Observer-measured
  iem_lsr:         { track: 'verified',  priority: 3 }, // Raw NWS LSRs (human-reported)
  spc_wcm:         { track: 'verified',  priority: 3 }, // Same federal source as NCEI, cleaner schema
  rep_report:      { track: 'verified',  priority: 4 }, // Roof-ER field rep (admin-verified)
  customer_report: { track: 'verified',  priority: 5 }, // Public homeowner submission
  hailtrace:       { track: 'verified',  priority: 6 }, // Meteorologist-reviewed (paid source)
  mping:           { track: 'verified',  priority: 7 }, // Crowdsourced (less rigor)
  groupme:         { track: 'verified',  priority: 8 }, // Auto-parsed chat
  synoptic:        { track: 'algorithm', priority: 5 }, // Instrument gust readings
  mrms:            { track: 'algorithm', priority: 6 }, // Radar-derived, multi-sensor
  ncei_swdi:       { track: 'algorithm', priority: 6 }, // NEXRAD hail signatures
  ihm:             { track: 'algorithm', priority: 7 }, // Third-party radar-derived
  nws_alert:       { track: 'algorithm', priority: 8 }, // Alert polygon — no size/wind data
  iem_vtec:        { track: 'algorithm', priority: 8 }, // Historical warning polygons
};

export interface UpsertParams {
  eventDate: string;                // YYYY-MM-DD in ET, OR ISO timestamp (will be ET-normalized)
  latitude: number;
  longitude: number;
  state?: string | null;            // 2-letter code, optional but recommended
  hailSizeInches?: number | null;
  windMph?: number | null;
  tornadoEfRank?: number | null;
  source: SourceName;
  sourcePayload: Record<string, any>;   // Raw data snapshot for audit trail
  // Rep/customer-specific fields
  repReportPhotoUrls?: string[];
  repReportSubmittedByUserId?: string;
  repReportPreApproved?: boolean;   // If true, event counts immediately (admin-bypass)
}

export interface UpsertResult {
  id: string;
  wasInserted: boolean;             // true = new row; false = updated existing
  verificationCount: number;
  confidenceTier: string;
  hailSizeInches: number | null;
  windMph: number | null;
}

/**
 * Normalize a date string to YYYY-MM-DD in America/New_York.
 * Matches the dedup convention used across the codebase.
 */
export function normalizeEventDateET(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) throw new Error(`Invalid date: ${input}`);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export class VerifiedEventsService {
  constructor(private pool: Pool) {}

  /**
   * Upsert a single event from one source. Idempotent.
   * Same (date, lat_bucket, lng_bucket) → 1 row; source flag flips; source_details merges.
   */
  async upsert(params: UpsertParams, client?: PoolClient): Promise<UpsertResult> {
    const executor = client || this.pool;
    const config = SOURCE_CONFIG[params.source];
    if (!config) throw new Error(`Unknown source: ${params.source}`);

    const eventDate = normalizeEventDateET(params.eventDate);

    // Validate lat/lng
    if (params.latitude < 18 || params.latitude > 72) {
      throw new Error(`Latitude out of bounds: ${params.latitude}`);
    }
    if (params.longitude < -180 || params.longitude > -66) {
      throw new Error(`Longitude out of bounds: ${params.longitude}`);
    }

    const sourceFlagCol = `source_${params.source}`;

    // Determine which track-specific columns to set
    const trackSizeCol = config.track === 'algorithm'
      ? 'algorithm_hail_size_inches'
      : 'verified_hail_size_inches';
    const trackWindCol = config.track === 'algorithm'
      ? 'algorithm_wind_mph'
      : 'verified_wind_mph';

    // Build source_details payload: { [sourceName]: payload, _ingested_at: ts }
    const sourceDetailsUpdate = {
      [params.source]: {
        ...params.sourcePayload,
        _ingested_at: new Date().toISOString(),
      },
    };

    // Rep/customer-specific moderation fields
    const isRepLike = params.source === 'rep_report' || params.source === 'customer_report';
    const repModerationFlag = isRepLike
      ? (params.repReportPreApproved === true ? true : false)
      : null;

    // Main upsert — ON CONFLICT uses the unique index on (event_date, lat_bucket, lng_bucket).
    // Size/wind use priority-aware MAX: if existing row has a higher-priority source filled,
    // we don't downgrade; otherwise we take GREATEST.
    const query = `
      INSERT INTO verified_hail_events (
        event_date, latitude, longitude, state,
        ${trackSizeCol}, ${trackWindCol},
        hail_size_inches, wind_mph, tornado_ef_rank,
        ${sourceFlagCol},
        source_details,
        rep_report_verified_by_admin,
        rep_report_submitted_by_user_id,
        rep_report_photo_urls,
        rep_report_submitted_at
      )
      VALUES (
        $1::date, $2, $3, $4,
        $5, $6,
        $5, $6, $7,
        TRUE,
        $8::jsonb,
        $9,
        $10,
        $11,
        CASE WHEN $12 THEN NOW() ELSE NULL END
      )
      ON CONFLICT (event_date, lat_bucket, lng_bucket) DO UPDATE SET
        ${sourceFlagCol} = TRUE,

        -- Update state if missing (new source has it, existing doesn't)
        state = COALESCE(verified_hail_events.state, EXCLUDED.state),

        -- Track-specific columns: take MAX within that track
        ${trackSizeCol} = GREATEST(
          COALESCE(verified_hail_events.${trackSizeCol}, 0),
          COALESCE(EXCLUDED.${trackSizeCol}, 0)
        ),
        ${trackWindCol} = GREATEST(
          COALESCE(verified_hail_events.${trackWindCol}, 0),
          COALESCE(EXCLUDED.${trackWindCol}, 0)
        ),

        -- Reported maxima: NOAA priority override, else GREATEST
        hail_size_inches = CASE
          WHEN verified_hail_events.source_noaa_ncei AND $13::int > 1
            THEN verified_hail_events.hail_size_inches
          ELSE GREATEST(
            COALESCE(verified_hail_events.hail_size_inches, 0),
            COALESCE(EXCLUDED.hail_size_inches, 0)
          )
        END,
        wind_mph = CASE
          WHEN verified_hail_events.source_noaa_ncei AND $13::int > 1
            THEN verified_hail_events.wind_mph
          ELSE GREATEST(
            COALESCE(verified_hail_events.wind_mph, 0),
            COALESCE(EXCLUDED.wind_mph, 0)
          )
        END,
        tornado_ef_rank = GREATEST(
          COALESCE(verified_hail_events.tornado_ef_rank, -99),
          COALESCE(EXCLUDED.tornado_ef_rank, -99)
        ),

        -- Merge audit trail JSONB (later keys overwrite earlier for same source, which is what we want)
        source_details = verified_hail_events.source_details || $8::jsonb,

        -- Rep moderation fields only updated when this IS a rep/customer source
        rep_report_verified_by_admin = CASE
          WHEN $14 THEN $9  -- isRepLike → apply new value
          ELSE verified_hail_events.rep_report_verified_by_admin
        END,
        rep_report_submitted_by_user_id = CASE
          WHEN $14 AND $10 IS NOT NULL THEN $10
          ELSE verified_hail_events.rep_report_submitted_by_user_id
        END,
        rep_report_photo_urls = CASE
          WHEN $14 AND $11 IS NOT NULL THEN
            COALESCE(verified_hail_events.rep_report_photo_urls, ARRAY[]::text[]) || $11
          ELSE verified_hail_events.rep_report_photo_urls
        END,
        rep_report_submitted_at = CASE
          WHEN $14 AND $12 THEN NOW()
          ELSE verified_hail_events.rep_report_submitted_at
        END,

        last_updated_at = NOW()
      RETURNING
        id, verification_count, confidence_tier,
        hail_size_inches, wind_mph,
        (xmax = 0) AS was_inserted;
    `;

    const values = [
      eventDate,                                          // $1
      params.latitude,                                    // $2
      params.longitude,                                   // $3
      params.state ?? null,                               // $4
      params.hailSizeInches ?? null,                      // $5
      params.windMph ?? null,                             // $6
      params.tornadoEfRank ?? null,                       // $7
      JSON.stringify(sourceDetailsUpdate),                // $8
      repModerationFlag,                                  // $9
      params.repReportSubmittedByUserId ?? null,          // $10
      params.repReportPhotoUrls ?? null,                  // $11
      isRepLike,                                          // $12 submitted_at trigger
      config.priority,                                    // $13 priority for override
      isRepLike,                                          // $14 rep-moderation gate
    ];

    const result = await executor.query(query, values);
    const row = result.rows[0];

    return {
      id: row.id,
      wasInserted: row.was_inserted,
      verificationCount: row.verification_count,
      confidenceTier: row.confidence_tier,
      hailSizeInches: row.hail_size_inches,
      windMph: row.wind_mph,
    };
  }

  /**
   * Bulk upsert within a transaction. Used by backfill orchestrators for throughput.
   * Returns aggregate stats; individual errors are collected but don't abort the batch.
   */
  async upsertBatch(batch: UpsertParams[]): Promise<{
    inserted: number;
    updated: number;
    errors: Array<{ index: number; error: string; params: UpsertParams }>;
  }> {
    const client = await this.pool.connect();
    const errors: Array<{ index: number; error: string; params: UpsertParams }> = [];
    let inserted = 0;
    let updated = 0;

    try {
      await client.query('BEGIN');

      for (let i = 0; i < batch.length; i++) {
        try {
          const result = await this.upsert(batch[i], client);
          if (result.wasInserted) inserted++;
          else updated++;
        } catch (err: any) {
          errors.push({
            index: i,
            error: err.message,
            params: batch[i],
          });
          // Continue batch on individual error (not using savepoint to keep throughput high)
        }
      }

      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    return { inserted, updated, errors };
  }

  /**
   * Query events near a location (for /hail/search integration).
   */
  async queryByLocation(params: {
    latitude: number;
    longitude: number;
    radiusMiles?: number;
    fromDate?: string;
    toDate?: string;
    minHailInches?: number;
    minWindMph?: number;
    usePublicView?: boolean;  // default true — hides unverified rep reports
  }): Promise<any[]> {
    const radius = params.radiusMiles ?? 15;
    const fromDate = params.fromDate ?? '2015-01-01';
    const toDate = params.toDate ?? new Date().toISOString().split('T')[0];
    const usePublic = params.usePublicView !== false;
    const table = usePublic ? 'verified_hail_events_public' : 'verified_hail_events';

    const query = `
      SELECT *,
        (3959 * acos(
          cos(radians($1)) * cos(radians(latitude)) *
          cos(radians(longitude) - radians($2)) +
          sin(radians($1)) * sin(radians(latitude))
        )) AS distance_miles
      FROM ${table}
      WHERE event_date BETWEEN $3::date AND $4::date
        AND (3959 * acos(
          cos(radians($1)) * cos(radians(latitude)) *
          cos(radians(longitude) - radians($2)) +
          sin(radians($1)) * sin(radians(latitude))
        )) <= $5
        ${params.minHailInches != null ? `AND hail_size_inches >= ${Number(params.minHailInches)}` : ''}
        ${params.minWindMph != null ? `AND wind_mph >= ${Number(params.minWindMph)}` : ''}
      ORDER BY event_date DESC, distance_miles ASC
      LIMIT 500;
    `;

    const result = await this.pool.query(query, [
      params.latitude,
      params.longitude,
      fromDate,
      toDate,
      radius,
    ]);

    return result.rows;
  }

  /**
   * Stats snapshot for monitoring dashboards.
   */
  async getStats(): Promise<{
    total: number;
    bySource: Record<string, number>;
    byTier: Record<string, number>;
    byState: Array<{ state: string; year: number; event_count: number }>;
  }> {
    const [total, bySource, byTier, byState] = await Promise.all([
      this.pool.query('SELECT COUNT(*)::int AS c FROM verified_hail_events'),
      this.pool.query('SELECT * FROM verified_hail_events_stats_by_source'),
      this.pool.query('SELECT * FROM verified_hail_events_stats_by_tier'),
      this.pool.query('SELECT * FROM verified_hail_events_stats_by_state_year LIMIT 100'),
    ]);

    return {
      total: total.rows[0].c,
      bySource: Object.fromEntries(bySource.rows.map((r) => [r.source, Number(r.event_count) || 0])),
      byTier: Object.fromEntries(byTier.rows.map((r) => [r.confidence_tier, Number(r.event_count)])),
      byState: byState.rows,
    };
  }
}

export function createVerifiedEventsService(pool: Pool) {
  return new VerifiedEventsService(pool);
}
