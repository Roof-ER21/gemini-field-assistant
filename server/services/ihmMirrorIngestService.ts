/**
 * IHM City Mirror — ingest + query service.
 *
 * The crawler (scripts/ihm-wayback/crawl.mjs) scrapes every DMV/PA city's
 * public IHM page from the Internet Archive and writes a single JSON artifact
 * to scripts/ihm-wayback/data/ihm-mirror-{timestamp}.json. This service reads
 * the LATEST artifact and upserts rows into `ihm_city_mirror`.
 *
 * It also exposes `diffCityAgainstOurs()` — the money function that answers
 * "when a rep says IHM has more dates for Fairfax than we do, here's the
 * exact per-date diff."
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// scripts/ihm-wayback/data/ lives outside server/, resolve relative to repo root.
function dataDir(): string {
  // server/services → repo root is two levels up
  return path.resolve(__dirname, '..', '..', 'scripts', 'ihm-wayback', 'data');
}

interface UniqueDate {
  date: string;                    // YYYY-MM-DD
  max_hail_inches: number | null;
  has_spotter: boolean;
  has_radar: boolean;
  wind_mph_max: number | null;
  rows: number;
}

interface IhmCitySummary {
  doppler_lifetime: number | null;
  doppler_past_year: number | null;
  spotter_reports_past_12mo: number | null;
  severe_warnings_past_12mo: number | null;
  top_recent_date: string | null;
}

interface IhmCityRecord {
  city: string;
  state: string;
  lat?: number;
  lng?: number;
  status: number;
  url?: string;
  summary: IhmCitySummary | null;
  unique_dates: UniqueDate[];
  unique_dates_count?: number;
  events_count?: number;
}

interface IhmCrawlArtifact {
  crawled_at: string;
  completed_at: string;
  source: string;
  stats: { total: number; ok: number; not_found: number; errored: number };
  cities: IhmCityRecord[];
}

export interface IhmCityDiffRow {
  date: string;
  ihm_hail_inches: number | null;
  ours_max_hail_inches: number | null;
  ours_has_mrms_swath: boolean;
  ours_report_count: number;
  verdict: 'MATCH' | 'IHM_ONLY' | 'OURS_ONLY' | 'SIZE_MISMATCH';
}

export interface IhmCityDiff {
  city: string;
  state: string;
  ihm_dates: number;
  ours_dates: number;
  verdict_counts: { MATCH: number; IHM_ONLY: number; OURS_ONLY: number; SIZE_MISMATCH: number };
  rows: IhmCityDiffRow[];
  last_fetched_at: string | null;
}

async function findLatestArtifact(): Promise<string | null> {
  try {
    const files = await fs.readdir(dataDir());
    const mirrors = files.filter((f) => f.startsWith('ihm-mirror-') && f.endsWith('.json')).sort().reverse();
    return mirrors.length ? path.join(dataDir(), mirrors[0]) : null;
  } catch {
    return null;
  }
}

export async function ingestArtifact(pool: Pool, artifact: IhmCrawlArtifact): Promise<{ ok: boolean; inserted: number; updated: number; skipped: number; artifact: string | null }> {
  return ingestArtifactInternal(pool, artifact, null);
}

export async function ingestLatestCrawl(pool: Pool): Promise<{ ok: boolean; inserted: number; updated: number; skipped: number; artifact: string | null }> {
  const latest = await findLatestArtifact();
  if (!latest) return { ok: false, inserted: 0, updated: 0, skipped: 0, artifact: null };

  const raw = await fs.readFile(latest, 'utf8');
  const artifact: IhmCrawlArtifact = JSON.parse(raw);
  return ingestArtifactInternal(pool, artifact, latest);
}

async function ingestArtifactInternal(pool: Pool, artifact: IhmCrawlArtifact, artifactPath: string | null): Promise<{ ok: boolean; inserted: number; updated: number; skipped: number; artifact: string | null }> {

  let inserted = 0, updated = 0, skipped = 0;
  for (const c of artifact.cities) {
    if (c.status !== 200 || !c.summary) {
      skipped++;
      continue;
    }
    const citySlug = c.city.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const result = await pool.query(
      `INSERT INTO ihm_city_mirror
         (city_slug, city, state, lat, lng,
          doppler_lifetime, doppler_past_year,
          spotter_reports_past_12mo, severe_warnings_past_12mo,
          top_recent_date,
          unique_dates_count, events_count, unique_dates,
          fetched_at, source_url, status)
       VALUES
         ($1, $2, $3, $4, $5,
          $6, $7,
          $8, $9,
          $10,
          $11, $12, $13,
          $14, $15, $16)
       ON CONFLICT (city_slug, state) DO UPDATE SET
         city = EXCLUDED.city,
         lat = EXCLUDED.lat,
         lng = EXCLUDED.lng,
         doppler_lifetime = EXCLUDED.doppler_lifetime,
         doppler_past_year = EXCLUDED.doppler_past_year,
         spotter_reports_past_12mo = EXCLUDED.spotter_reports_past_12mo,
         severe_warnings_past_12mo = EXCLUDED.severe_warnings_past_12mo,
         top_recent_date = EXCLUDED.top_recent_date,
         unique_dates_count = EXCLUDED.unique_dates_count,
         events_count = EXCLUDED.events_count,
         unique_dates = EXCLUDED.unique_dates,
         fetched_at = EXCLUDED.fetched_at,
         source_url = EXCLUDED.source_url,
         status = EXCLUDED.status
       RETURNING (xmax = 0) AS inserted`,
      [
        citySlug, c.city, c.state, c.lat ?? null, c.lng ?? null,
        c.summary.doppler_lifetime, c.summary.doppler_past_year,
        c.summary.spotter_reports_past_12mo, c.summary.severe_warnings_past_12mo,
        c.summary.top_recent_date,
        c.unique_dates_count ?? c.unique_dates.length, c.events_count ?? 0,
        JSON.stringify(c.unique_dates),
        artifact.crawled_at, c.url ?? null, c.status,
      ],
    );
    if (result.rows[0]?.inserted) inserted++;
    else updated++;
  }
  return { ok: true, inserted, updated, skipped, artifact: artifactPath };
}

/**
 * The money function. Given a city + state, pull its IHM mirror AND our own
 * verified_hail_events data for the same city's lat/lng radius, and produce
 * a per-date diff:
 *   - MATCH: both sources report the date, hail sizes within 0.5"
 *   - IHM_ONLY: IHM reports hail, we don't (yet) — these are the dates
 *               reps cite when they claim IHM is "better"
 *   - OURS_ONLY: we have it, IHM doesn't — the reverse trump card
 *   - SIZE_MISMATCH: same date, but hail sizes differ by > 0.5"
 */
export async function diffCityAgainstOurs(
  pool: Pool,
  city: string,
  state: string,
  radiusMiles = 10,
): Promise<IhmCityDiff | null> {
  // Load IHM mirror
  const ihm = await pool.query<{
    city: string; state: string; lat: number | null; lng: number | null;
    unique_dates: UniqueDate[]; fetched_at: Date;
  }>(
    `SELECT city, state, lat, lng, unique_dates, fetched_at
     FROM ihm_city_mirror
     WHERE LOWER(city) = LOWER($1) AND state = UPPER($2)
     LIMIT 1`,
    [city, state],
  );
  if (!ihm.rows.length) return null;
  const { lat, lng, unique_dates, fetched_at } = ihm.rows[0];
  if (lat == null || lng == null) {
    return {
      city: ihm.rows[0].city, state: ihm.rows[0].state,
      ihm_dates: unique_dates.length, ours_dates: 0,
      verdict_counts: { MATCH: 0, IHM_ONLY: unique_dates.length, OURS_ONLY: 0, SIZE_MISMATCH: 0 },
      rows: unique_dates.map((d) => ({
        date: d.date, ihm_hail_inches: d.max_hail_inches,
        ours_max_hail_inches: null, ours_has_mrms_swath: false, ours_report_count: 0,
        verdict: 'IHM_ONLY',
      })),
      last_fetched_at: fetched_at.toISOString(),
    };
  }

  // Load our side: all dates with any hail report within N miles of the city
  // Haversine in SQL — matches the pattern used by hailAtAddress.
  const ours = await pool.query<{
    event_date: string; max_hail: number | null; report_count: number; has_mrms: boolean;
  }>(
    `SELECT event_date::text AS event_date,
            MAX(hail_size_inches)::numeric AS max_hail,
            COUNT(*)::int AS report_count,
            BOOL_OR(source_mrms) AS has_mrms
       FROM verified_hail_events_public_sane
      WHERE hail_size_inches IS NOT NULL
        AND 3959 * 2 * ASIN(SQRT(
          POWER(SIN(RADIANS((latitude  - $1) / 2)), 2) +
          COS(RADIANS($1)) * COS(RADIANS(latitude)) *
          POWER(SIN(RADIANS((longitude - $2) / 2)), 2)
        )) <= $3
      GROUP BY event_date
      ORDER BY event_date DESC`,
    [lat, lng, radiusMiles],
  );

  const oursByDate = new Map<string, { max_hail: number | null; report_count: number; has_mrms: boolean }>();
  for (const r of ours.rows) {
    oursByDate.set(String(r.event_date), {
      max_hail: r.max_hail == null ? null : Number(r.max_hail),
      report_count: r.report_count,
      has_mrms: Boolean(r.has_mrms),
    });
  }

  const ihmByDate = new Map<string, UniqueDate>();
  for (const d of unique_dates) ihmByDate.set(d.date, d);

  const allDates = new Set<string>([...ihmByDate.keys(), ...oursByDate.keys()]);
  const rows: IhmCityDiffRow[] = [];
  const counts = { MATCH: 0, IHM_ONLY: 0, OURS_ONLY: 0, SIZE_MISMATCH: 0 };

  for (const date of allDates) {
    const ihmRow = ihmByDate.get(date);
    const ourRow = oursByDate.get(date);

    let verdict: IhmCityDiffRow['verdict'];
    if (ihmRow && ourRow) {
      const ihmH = ihmRow.max_hail_inches ?? 0;
      const ourH = ourRow.max_hail ?? 0;
      verdict = Math.abs(ihmH - ourH) > 0.5 ? 'SIZE_MISMATCH' : 'MATCH';
    } else if (ihmRow) {
      verdict = 'IHM_ONLY';
    } else {
      verdict = 'OURS_ONLY';
    }
    counts[verdict]++;

    rows.push({
      date,
      ihm_hail_inches: ihmRow?.max_hail_inches ?? null,
      ours_max_hail_inches: ourRow?.max_hail ?? null,
      ours_has_mrms_swath: ourRow?.has_mrms ?? false,
      ours_report_count: ourRow?.report_count ?? 0,
      verdict,
    });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));

  return {
    city: ihm.rows[0].city, state: ihm.rows[0].state,
    ihm_dates: ihmByDate.size,
    ours_dates: oursByDate.size,
    verdict_counts: counts,
    rows,
    last_fetched_at: fetched_at.toISOString(),
  };
}
