/**
 * City Impact Service — deterministic city-on-date hail lookup.
 *
 * Fixes the failure mode that sunk the test-group iteration:
 *   Rep: "was Germantown hit on 8/29/24?"
 *   Susan: "3.75" in VA, 3.25" in MD, 3.00" in PA" ← state-level dump
 *
 * The raw verified_hail_events table has lat/lng on every row. We can tell
 * Susan exactly how many reports landed within 1/3/5/10 mi of a named
 * city on a named date, with the closest and biggest numbers. Then Susan's
 * LLM prompt gets a structured CITY_IMPACT block with a "use verbatim"
 * instruction, so she can no longer generalize to state.
 *
 * This is a READ-ONLY primitive. No writes, no side effects.
 */
import type pg from 'pg';

export interface CityImpactReport {
  /** What the rep typed, normalized through the geocoder */
  city: string;
  state: string | null;
  /** Resolved from geocoder, used as query center */
  lat: number;
  lng: number;
  /** ISO YYYY-MM-DD — the exact date we queried */
  date: string;
  /** Total verified reports within 10 mi on that date */
  totalWithin10mi: number;
  /** Counts by radius band */
  within1mi: number;
  within3mi: number;
  within5mi: number;
  /** Closest verified hail point (nearest distance with a hail size) */
  closestHail: { miles: number; inches: number; state: string | null } | null;
  /** Biggest verified hail within 10 mi (highest magnitude, break ties by distance) */
  biggestHail: { miles: number; inches: number; state: string | null } | null;
  /** Closest verified damaging-wind report (wind_mph >= 40) */
  closestWind: { miles: number; mph: number; state: string | null } | null;
  /**
   * "HIT" = any verified hail ≥ 0.5" within 5 mi OR any swath (future),
   * "NEAR" = any verified hail within 10 mi,
   * "MISS" = no verified reports within 10 mi.
   */
  verdict: 'HIT' | 'NEAR' | 'MISS';
  /** Data sources that corroborated something within 10mi */
  sources: string[];
}

export async function getCityImpactOnDate(
  pool: pg.Pool,
  lat: number,
  lng: number,
  city: string,
  state: string | null,
  dateIso: string,
): Promise<CityImpactReport> {
  // One query, no loops. 10 mi upper bound; we derive band counts + closest/biggest
  // from the same row set.
  const { rows } = await pool.query(
    `SELECT
       latitude, longitude, state, hail_size_inches, wind_mph,
       source_noaa_ncei, source_iem_lsr, source_ncei_swdi, source_mrms,
       source_nws_alert, source_cocorahs, source_ihm, source_hailtrace,
       source_nexrad_l2,
       (3959 * acos(
         cos(radians($1)) * cos(radians(latitude)) *
         cos(radians(longitude) - radians($2)) +
         sin(radians($1)) * sin(radians(latitude))
       )) AS miles
     FROM verified_hail_events_public_sane
     WHERE event_date = $3::date
       AND (3959 * acos(
             cos(radians($1)) * cos(radians(latitude)) *
             cos(radians(longitude) - radians($2)) +
             sin(radians($1)) * sin(radians(latitude))
           )) <= 10
       AND (hail_size_inches IS NOT NULL OR wind_mph IS NOT NULL)
     ORDER BY miles ASC`,
    [lat, lng, dateIso],
  );

  const bandCount = (miles: number) => rows.filter((r) => Number(r.miles) <= miles).length;
  const totalWithin10mi = rows.length;

  // Closest hail: smallest miles among rows with a hail_size
  let closestHail: CityImpactReport['closestHail'] = null;
  for (const r of rows) {
    const h = r.hail_size_inches != null ? Number(r.hail_size_inches) : null;
    if (h !== null && h > 0) {
      closestHail = { miles: Number(r.miles), inches: h, state: r.state ?? null };
      break;
    }
  }

  // Biggest hail: MAX(hail_size), tiebreak = closest distance
  let biggestHail: CityImpactReport['biggestHail'] = null;
  for (const r of rows) {
    const h = r.hail_size_inches != null ? Number(r.hail_size_inches) : null;
    if (h === null || h <= 0) continue;
    if (!biggestHail || h > biggestHail.inches ||
        (h === biggestHail.inches && Number(r.miles) < biggestHail.miles)) {
      biggestHail = { miles: Number(r.miles), inches: h, state: r.state ?? null };
    }
  }

  // Closest damaging wind (≥ 40 mph)
  let closestWind: CityImpactReport['closestWind'] = null;
  for (const r of rows) {
    const w = r.wind_mph != null ? Number(r.wind_mph) : null;
    if (w !== null && w >= 40) {
      closestWind = { miles: Number(r.miles), mph: w, state: r.state ?? null };
      break;
    }
  }

  // Source rollup across all rows within 10mi
  const sourceSet = new Set<string>();
  for (const r of rows) {
    if (r.source_noaa_ncei)  sourceSet.add('NOAA NCEI');
    if (r.source_ncei_swdi)  sourceSet.add('NEXRAD (NCEI SWDI)');
    if (r.source_nexrad_l2)  sourceSet.add('NEXRAD Level II');
    if (r.source_mrms)       sourceSet.add('MRMS');
    if (r.source_iem_lsr)    sourceSet.add('NWS LSR');
    if (r.source_nws_alert)  sourceSet.add('NWS Alert');
    if (r.source_cocorahs)   sourceSet.add('CoCoRaHS');
    if (r.source_ihm)        sourceSet.add('IHM');
    if (r.source_hailtrace)  sourceSet.add('HailTrace');
  }

  // Verdict
  let verdict: CityImpactReport['verdict'];
  if (closestHail && closestHail.inches >= 0.5 && closestHail.miles <= 5) {
    verdict = 'HIT';
  } else if (totalWithin10mi > 0) {
    verdict = 'NEAR';
  } else {
    verdict = 'MISS';
  }

  return {
    city,
    state,
    lat,
    lng,
    date: dateIso,
    totalWithin10mi,
    within1mi: bandCount(1),
    within3mi: bandCount(3),
    within5mi: bandCount(5),
    closestHail,
    biggestHail,
    closestWind,
    verdict,
    sources: [...sourceSet].sort(),
  };
}

/**
 * Render a CityImpactReport as a block Susan can paste into the LLM prompt.
 * The exact numbers come from this deterministic block — the LLM is told
 * to use them verbatim (see PERSONALITY update).
 */
export function renderCityImpactBlock(r: CityImpactReport): string {
  const loc = r.state ? `${r.city}, ${r.state}` : r.city;
  const header = `CITY_IMPACT for "${loc}" on ${r.date}:`;
  if (r.verdict === 'MISS') {
    return [
      header,
      `  VERDICT: MISS — no verified hail or damaging wind within 10 mi on that date.`,
      `  Do NOT say the city was hit. If pressed, point at Storm Maps for the user to verify themselves.`,
    ].join('\n');
  }
  const lines: string[] = [header];
  lines.push(`  VERDICT: ${r.verdict}`);
  lines.push(`  REPORTS WITHIN 10 MI: ${r.totalWithin10mi} total, ${r.within5mi} within 5mi, ${r.within3mi} within 3mi, ${r.within1mi} within 1mi`);
  if (r.biggestHail) {
    lines.push(
      `  BIGGEST HAIL: ${r.biggestHail.inches.toFixed(2)}" at ${r.biggestHail.miles.toFixed(1)} mi from ${loc} (${r.biggestHail.state || '?'})`,
    );
  }
  if (r.closestHail) {
    lines.push(
      `  CLOSEST HAIL: ${r.closestHail.inches.toFixed(2)}" at ${r.closestHail.miles.toFixed(1)} mi from ${loc} (${r.closestHail.state || '?'})`,
    );
  }
  if (r.closestWind) {
    lines.push(
      `  CLOSEST WIND: ${Math.round(r.closestWind.mph)} mph at ${r.closestWind.miles.toFixed(1)} mi from ${loc}`,
    );
  }
  lines.push(`  SOURCES: ${r.sources.join(', ') || '(none)'}`);
  lines.push('');
  lines.push('  REPLY RULES:');
  lines.push('    • Use the numbers above VERBATIM. Do NOT say "hail in VA" or "hail in MD" — say the distance.');
  lines.push('    • If CLOSEST HAIL > 5 mi, say "no verified hail within 5mi of [city] — closest was X\\" at Y mi".');
  lines.push('    • If VERDICT=NEAR (not HIT), frame it as area impact, not direct hit.');
  lines.push('    • Never generalize to state-level. Rep asked about a city; answer for that city.');
  return lines.join('\n');
}
