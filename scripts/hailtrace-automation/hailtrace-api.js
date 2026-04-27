/**
 * HailTrace Direct API Client — v2 (2026-04-24)
 *
 * Harvests full weatherReports (with GeoJSON coordinates) from HailTrace's
 * GraphQL API so downstream pipelines can do point-in-polygon validation
 * against our MRMS swaths.
 *
 * Changes vs v1:
 *   - Uses FilterWeatherEvents only to enumerate event dates, then batches
 *     GetWeatherEventsByDates to pull each event's geoJSON + weatherReports.
 *   - Output shape includes reports[] per event (each with lat/lng, magnitude,
 *     reportType, source, comments, dateTime).
 *   - Flattens to a per-report events[] array in the output JSON so the
 *     existing hailtrace_events table (schema = one row per point) can import
 *     it unchanged.
 *
 * Usage:
 *   HAILTRACE_EMAIL=...
 *   HAILTRACE_PASSWORD=...
 *   node hailtrace-api.js [--start YYYY-MM-DD] [--end YYYY-MM-DD]
 *                         [--types HAIL,WIND,TORNADO] [--limit 500]
 *                         [--output file.json] [--debug]
 *
 * Exit status: 0 on success, 1 on error.
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const GRAPHQL_ENDPOINT = 'https://app-graphql.hailtrace.com/graphql';

const WEATHER_TYPES_MAP = {
  HAIL: ['ALGORITHM_HAIL_SIZE', 'METEOROLOGIST_HAIL_SIZE'],
  WIND: ['METEOROLOGIST_WIND_SPEED'],
  TORNADO: ['METEOROLOGIST_TORNADO'],
  ALL: [
    'ALGORITHM_HAIL_SIZE',
    'METEOROLOGIST_HAIL_SIZE',
    'METEOROLOGIST_WIND_SPEED',
    'METEOROLOGIST_TORNADO',
  ],
};

function getCredentials() {
  const email = process.env.HAILTRACE_EMAIL;
  const password = process.env.HAILTRACE_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Missing credentials. Set HAILTRACE_EMAIL and HAILTRACE_PASSWORD.',
    );
  }
  return { email, password };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    startDate: null,
    endDate: null,
    typesKey: 'ALL',
    limit: 500,
    output: null,
    debug: false,
    skipReports: false,
    pageSize: 100,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case '--start': opts.startDate = args[++i]; break;
      case '--end':   opts.endDate = args[++i]; break;
      case '--types': opts.typesKey = args[++i].toUpperCase(); break;
      case '--limit': opts.limit = parseInt(args[++i], 10); break;
      case '--page-size': opts.pageSize = parseInt(args[++i], 10); break;
      case '--output':
      case '-o':      opts.output = args[++i]; break;
      case '--debug': opts.debug = true; break;
      case '--skip-reports': opts.skipReports = true; break;
      case '--help':
      case '-h':
        console.log(`
HailTrace API Client v2

Usage: node hailtrace-api.js [options]

Options:
  --start <YYYY-MM-DD>    Start date (default: 1 year ago)
  --end <YYYY-MM-DD>      End date   (default: today)
  --types <HAIL|WIND|TORNADO|ALL>   Weather-types filter (default: ALL)
  --limit <N>             Max events to fetch (default: 500)
  --page-size <N>         FilterWeatherEvents page size (default: 100)
  --output, -o <file>     Output JSON file path (default: auto)
  --skip-reports          Don't fetch per-event weatherReports (list only)
  --debug                 Verbose logging
  --help, -h              This help

Env:
  HAILTRACE_EMAIL / HAILTRACE_PASSWORD  (required)
  HAILTRACE_OUTPUT_DIR                  (default: ./hailtrace-exports)
`);
        process.exit(0);
    }
  }

  if (!opts.startDate) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    opts.startDate = d.toISOString().split('T')[0];
  }
  if (!opts.endDate) {
    opts.endDate = new Date().toISOString().split('T')[0];
  }
  if (!WEATHER_TYPES_MAP[opts.typesKey]) {
    throw new Error(`Unknown --types value: ${opts.typesKey}`);
  }
  return opts;
}

class HailTraceAPI {
  constructor(debug = false) {
    this.debug = debug;
    this.token = null;
    this.userInfo = null;
  }

  async graphql(query, variables = {}, requiresAuth = true) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/graphql-response+json, application/json',
      'Origin': 'https://app.hailtrace.com',
      'Referer': 'https://app.hailtrace.com/',
    };
    if (requiresAuth && this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();

    if (json.errors && this.debug) {
      console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2));
    }
    return json;
  }

  async login() {
    const { email, password } = getCredentials();
    console.log(`🔐 Logging in as ${email}...`);

    const query = `
      mutation Authenticate($input: AuthenticationInput!) {
        authenticate(input: $input) {
          message
          session { token }
        }
      }
    `;
    const vars = {
      input: { email, password, type: 'BASIC', deviceType: 'WEB' },
    };
    const r = await this.graphql(query, vars, false);

    const tok = r?.data?.authenticate?.session?.token;
    if (!tok) {
      throw new Error('Login failed: ' + JSON.stringify(r?.errors || r));
    }
    this.token = tok;
    console.log('✅ Login successful');

    await this.getUserInfo();
  }

  async getUserInfo() {
    const query = `
      query SessionUser {
        sessionUser {
          _id firstName lastName email enabledWeatherTypes
          company { _id name }
        }
      }
    `;
    const r = await this.graphql(query);
    if (r?.data?.sessionUser) {
      this.userInfo = r.data.sessionUser;
      console.log(
        `👤 ${this.userInfo.firstName} ${this.userInfo.lastName}` +
          ` @ ${this.userInfo.company?.name}`,
      );
      console.log(`   Enabled types: ${this.userInfo.enabledWeatherTypes?.join(', ')}`);
    }
  }

  /**
   * Page through FilterWeatherEvents to get a list of event dates + IDs.
   * Results come back in eventDate DESC order, so we can stop paginating once
   * we cross `startDate`. Server-side date filtering via `filters[]` didn't
   * work for this account (returned 0), so we filter client-side.
   */
  async listEvents({ startDate, endDate, pageSize = 100, limit = 1000 }) {
    const query = `
      query FilterWeatherEvents($input: FilterWeatherEventsInput) {
        filterWeatherEvents(input: $input) {
          results {
            id
            eventDate
            types
            maxAlgorithmHailSize
            maxAlgorithmDamageProbability
            maxMeteorologistHailSize
            maxMeteorologistWindSpeedMPH
            maxMeteorologistTornadoEFRank
            maxMeteorologistWindStarLevel
            maxMeteorologistHailStarLevel
          }
          page
          limit
          total
        }
      }
    `;

    const kept = [];
    let page = 0;
    let scanned = 0;
    let pastStart = false;

    while (kept.length < limit && !pastStart) {
      const vars = { input: { page, limit: pageSize, filters: [] } };
      const r = await this.graphql(query, vars);
      const bucket = r?.data?.filterWeatherEvents;
      if (!bucket?.results?.length) {
        if (this.debug) console.error('No filterWeatherEvents bucket:', r);
        break;
      }

      for (const ev of bucket.results) {
        scanned++;
        const d = ev.eventDate;
        if (!d) continue;
        if (d > endDate) continue;     // newer than our window
        if (d < startDate) {
          pastStart = true;
          break;
        }
        kept.push(ev);
        if (kept.length >= limit) break;
      }

      console.log(
        `   📄 page ${page}: scanned ${scanned}/${bucket.total}, kept ${kept.length}`,
      );
      if (bucket.results.length < pageSize) break;
      if (scanned >= bucket.total) break;
      page++;
      await new Promise(r => setTimeout(r, 250));
    }
    return kept;
  }

  /**
   * GetWeatherEventsByDates — batched full-detail fetch with geoJSON +
   * weatherReports[]. We batch 5 dates per call to keep payload reasonable.
   */
  async getFullEvents(eventSummaries, typesKey = 'ALL') {
    const types = WEATHER_TYPES_MAP[typesKey];
    const query = `
      query GetWeatherEventsByDates($input: [GetWeatherEventsByDatesInput!]!) {
        getWeatherEventsByDates(input: $input) {
          id
          eventDate
          types
          maxAlgorithmHailSize
          maxAlgorithmDamageProbability
          maxMeteorologistHailSize
          maxMeteorologistWindSpeedMPH
          maxMeteorologistTornadoEFRank
          maxMeteorologistWindStarLevel
          maxMeteorologistHailStarLevel
          geoJSON
          weatherReports {
            _id
            date
            reportType
            dateTime
            magnitude
            magnitudeUnit
            source
            comments
            geometry { type coordinates }
          }
        }
      }
    `;

    const BATCH = 5;
    const fullMap = new Map();

    for (let i = 0; i < eventSummaries.length; i += BATCH) {
      const slice = eventSummaries.slice(i, i + BATCH);
      const vars = {
        input: slice.map(e => ({ eventDate: e.eventDate, types })),
      };
      const r = await this.graphql(query, vars);
      const arr = r?.data?.getWeatherEventsByDates || [];
      for (const full of arr) {
        if (full?.eventDate) fullMap.set(full.eventDate, full);
      }
      console.log(
        `   🔬 detail batch ${i / BATCH + 1}/${Math.ceil(eventSummaries.length / BATCH)}: +${arr.length} (reports: ${arr.reduce((s, e) => s + (e?.weatherReports?.length || 0), 0)})`,
      );
      await new Promise(r => setTimeout(r, 400));
    }
    return fullMap;
  }
}

/**
 * Transform one full event (+ its weatherReports) into a per-report array
 * shaped for the existing hailtrace_events DB table.
 *
 * Each report becomes one entry with its own id / latitude / longitude /
 * magnitude-as-hailSize-or-windSpeed. The parent event's geoJSON + max sizes
 * are copied into `raw_data.parentEvent` so nothing is lost.
 */
function explodeReports(fullEvent) {
  const out = [];
  const parentTypes = Array.isArray(fullEvent.types) ? fullEvent.types : [];
  const hasMeteoHail = parentTypes.includes('METEOROLOGIST_HAIL_SIZE');
  // Keep per-report raw_data LIGHT — geoJSON polygons can be 30-100kB each
  // and would be duplicated across every row of the event (500-1500 rows).
  // Full event geoJSON is preserved once at the top of the export under
  // `parentEvents[]`.
  const parentEvent = {
    id: fullEvent.id,
    eventDate: fullEvent.eventDate,
    types: parentTypes,
    maxAlgorithmHailSize: fullEvent.maxAlgorithmHailSize ?? null,
    maxMeteorologistHailSize: fullEvent.maxMeteorologistHailSize ?? null,
    maxMeteorologistWindSpeedMPH: fullEvent.maxMeteorologistWindSpeedMPH ?? null,
    maxMeteorologistTornadoEFRank: fullEvent.maxMeteorologistTornadoEFRank ?? null,
    maxMeteorologistWindStarLevel: fullEvent.maxMeteorologistWindStarLevel ?? null,
    maxMeteorologistHailStarLevel: fullEvent.maxMeteorologistHailStarLevel ?? null,
  };

  for (const r of fullEvent.weatherReports || []) {
    if (!r || !r._id) continue;

    // GeoJSON Point: coordinates = [lng, lat]
    let lat = null, lng = null;
    const coords = r.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      lng = Number(coords[0]);
      lat = Number(coords[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        lat = lng = null;
      }
    }

    // HailTrace uses these literal enum values (confirmed via live probe
    // 2026-04-24): 'HailSize' (INCHES), 'WindSpeed' (MPH), 'Tornado' (EF-rank).
    // We accept HAIL/WIND/TORNADO aliases too for forward-compat.
    const rt = (r.reportType || '').toString();
    const isHail = rt === 'HailSize' || rt === 'HAIL';
    const isWind = rt === 'WindSpeed' || rt === 'WIND';
    const magnitude = r.magnitude != null ? Number(r.magnitude) : null;
    const hailSize = isHail && Number.isFinite(magnitude) ? magnitude : null;
    const windSpeed = isWind && Number.isFinite(magnitude) ? Math.round(magnitude) : null;

    out.push({
      // `id` is the stable per-report key. Prefix so HailTrace _id collisions
      // with other data sources are impossible.
      id: `ht-${r._id}`,
      date: (r.date || r.dateTime || fullEvent.eventDate || '').split('T')[0],
      types: parentTypes,
      reportType: r.reportType,
      // For validation we want the meteorologist flag to propagate:
      hailSize,
      hailSizeAlgorithm: null,
      // If the PARENT event was METEOROLOGIST_HAIL_SIZE graded, credit the point.
      hailSizeMeteo: isHail && hasMeteoHail ? hailSize : null,
      windSpeed,
      windStarLevel: isWind ? parentEvent.maxMeteorologistWindStarLevel : null,
      latitude: lat,
      longitude: lng,
      magnitude,
      magnitudeUnit: r.magnitudeUnit ?? null,
      source: r.source ?? null,
      comments: r.comments ?? null,
      dateTime: r.dateTime ?? null,
      parentEventId: fullEvent.id,
      _raw: {
        parentEvent,
        report: r,
      },
    });
  }

  return out;
}

async function main() {
  const opts = parseArgs();
  const api = new HailTraceAPI(opts.debug);

  try {
    await api.login();

    console.log(
      `\n📊 Step 1/2 — listing events ${opts.startDate} → ${opts.endDate}` +
        ` (types=${opts.typesKey}, limit=${opts.limit})`,
    );
    const summaries = await api.listEvents({
      startDate: opts.startDate,
      endDate: opts.endDate,
      pageSize: opts.pageSize,
      limit: opts.limit,
    });
    console.log(`   found ${summaries.length} events`);

    if (summaries.length === 0) {
      console.log('No events found for criteria — exiting.');
      return;
    }

    let fullMap = new Map();
    let perReport = [];
    if (!opts.skipReports) {
      console.log(
        `\n🔬 Step 2/2 — pulling geoJSON + weatherReports for ${summaries.length} events (batched 5)`,
      );
      fullMap = await api.getFullEvents(summaries, opts.typesKey);

      for (const s of summaries) {
        const full = fullMap.get(s.eventDate);
        if (!full) continue;
        perReport.push(...explodeReports(full));
      }
      console.log(
        `\n✅ Flattened to ${perReport.length} individual weather reports` +
          ` (avg ${(perReport.length / summaries.length).toFixed(1)} reports/event)`,
      );
    }

    // Summary
    const byType = perReport.reduce((m, r) => {
      m[r.reportType] = (m[r.reportType] || 0) + 1;
      return m;
    }, {});
    const withCoords = perReport.filter(r => r.latitude != null).length;
    console.log('\n📋 Summary:');
    console.log('  report types:', JSON.stringify(byType));
    console.log(`  reports with coords: ${withCoords}/${perReport.length}`);
    const maxHail = perReport.reduce((m, r) => r.hailSize > m ? r.hailSize : m, 0);
    const maxWind = perReport.reduce((m, r) => r.windSpeed > m ? r.windSpeed : m, 0);
    console.log(`  max hail: ${maxHail}"  max wind: ${maxWind} mph`);

    // Output
    const outputData = {
      query: {
        startDate: opts.startDate,
        endDate: opts.endDate,
        typesKey: opts.typesKey,
        limit: opts.limit,
      },
      user: {
        name: `${api.userInfo?.firstName || ''} ${api.userInfo?.lastName || ''}`.trim(),
        company: api.userInfo?.company?.name,
        enabledTypes: api.userInfo?.enabledWeatherTypes,
      },
      summary: {
        totalEvents: summaries.length,
        fullDetailFetched: fullMap.size,
        totalReports: perReport.length,
        reportsWithCoords: withCoords,
        byReportType: byType,
        maxHailInches: maxHail,
        maxWindMph: maxWind,
      },
      // `events[]` uses the per-report flat shape expected by the existing
      // hailtrace_events table (one row per point). Parent event geoJSON + max
      // sizes are preserved under `_raw.parentEvent`.
      events: perReport,
      // Also keep the full per-event view under `parentEvents[]` for anything
      // that wants the geoJSON polygon overlay later.
      parentEvents: [...fullMap.values()],
      extractedAt: new Date().toISOString(),
    };

    const outputDir = process.env.HAILTRACE_OUTPUT_DIR ||
      path.join(path.dirname(new URL(import.meta.url).pathname), 'hailtrace-exports');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const filename = opts.output ||
      `hailtrace-${opts.startDate}_${opts.endDate}-${Date.now()}.json`;
    const filepath = path.isAbsolute(filename)
      ? filename
      : path.join(outputDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(outputData, null, 2));
    console.log(`\n💾 Saved: ${filepath}`);
    console.log('\nNext step: node import-to-db.mjs ' + filepath);
  } catch (err) {
    console.error('❌', err.message);
    if (opts.debug) console.error(err.stack);
    process.exit(1);
  }
}

main();
