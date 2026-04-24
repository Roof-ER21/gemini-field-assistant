#!/usr/bin/env node
// IHM DMV/PA crawl via Wayback Machine.
//
// Walks every city in dmvCities.ts, pulls its Wayback mirror of the
// /local-hail-map/{city}-{st}/ page, parses the event log, writes a single
// JSON artifact to scripts/ihm-wayback/data/.
//
// Usage:
//   node scripts/ihm-wayback/crawl.mjs
//   node scripts/ihm-wayback/crawl.mjs --limit=10     (first 10 cities only)
//   node scripts/ihm-wayback/crawl.mjs --state=PA     (filter to one state)
//   node scripts/ihm-wayback/crawl.mjs --delay=3000   (ms between fetches)
import { parseIhmCityPage } from './parse.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const WB_BASE = 'https://web.archive.org/web/2025id_/https://www.interactivehailmaps.com/local-hail-map';
const FETCH_TIMEOUT_MS = 20_000;

function parseArgs() {
  const args = { limit: Infinity, state: null, delay: 2000 };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--limit=')) args.limit = parseInt(a.slice(8), 10);
    else if (a.startsWith('--state=')) args.state = a.slice(8).toUpperCase();
    else if (a.startsWith('--delay=')) args.delay = parseInt(a.slice(8), 10);
  }
  return args;
}

function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

async function fetchCityHtml(city, st) {
  const url = `${WB_BASE}/${slugify(city)}-${st.toLowerCase()}/`;
  const ctl = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: ctl });
  if (!r.ok) return { ok: false, status: r.status, url };
  const html = await r.text();
  return { ok: true, status: 200, url, html, bytes: html.length };
}

async function loadDmvCities() {
  // Compile the TS source once (simple regex dump — dmvCities.ts is a flat
  // dict with `{ name, state, lat, lng }` entries, no imports to resolve).
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(join(__dirname, '..', '..', 'server/services/dmvCities.ts'), 'utf8');
  const cities = [];
  const re = /'([a-z0-9\s'-]+?)':\s*\{\s*name:\s*'([^']+)',\s*state:\s*'([A-Z]{2})',\s*lat:\s*(-?\d+\.\d+),\s*lng:\s*(-?\d+\.\d+)\s*\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    cities.push({ key: m[1], name: m[2], state: m[3], lat: parseFloat(m[4]), lng: parseFloat(m[5]) });
  }
  return cities;
}

(async () => {
  const args = parseArgs();
  const cities = await loadDmvCities();
  const filtered = (args.state ? cities.filter((c) => c.state === args.state) : cities).slice(0, args.limit);

  console.log(`[IHM-Crawl] ${filtered.length} cities queued (${args.state ?? 'all states'}, delay=${args.delay}ms)`);
  const outDir = join(__dirname, 'data');
  await mkdir(outDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const results = [];
  let ok = 0, notFound = 0, errored = 0;

  for (let i = 0; i < filtered.length; i++) {
    const c = filtered[i];
    const t0 = Date.now();
    try {
      const fetched = await fetchCityHtml(c.name, c.state);
      if (!fetched.ok) {
        if (fetched.status === 404) notFound++;
        else errored++;
        results.push({
          city: c.name, state: c.state, lat: c.lat, lng: c.lng,
          status: fetched.status, url: fetched.url,
          summary: null, unique_dates: [], events_count: 0,
        });
        console.log(`[${String(i + 1).padStart(3)}/${filtered.length}] ${c.name}, ${c.state} — HTTP ${fetched.status} (${Date.now() - t0}ms)`);
      } else {
        const parsed = parseIhmCityPage(fetched.html, slugify(c.name), c.state);
        // Strip the raw events (bulky) — we keep the aggregated unique_dates which
        // is what the diff endpoint needs; if we want raw events later, rerun with
        // per-city storage.
        const { events, ...lean } = parsed;
        results.push({
          city: c.name, state: c.state, lat: c.lat, lng: c.lng,
          status: 200, url: fetched.url, bytes: fetched.bytes,
          ...lean,
        });
        ok++;
        const s = parsed.summary;
        console.log(
          `[${String(i + 1).padStart(3)}/${filtered.length}] ${c.name}, ${c.state}` +
          ` — ${parsed.unique_dates_count} unique dates,` +
          ` ${parsed.events_count} rows,` +
          ` IHM: ${s.doppler_lifetime ?? '?'}/${s.doppler_past_year ?? '?'}` +
          ` (${Date.now() - t0}ms)`
        );
      }
    } catch (e) {
      errored++;
      results.push({
        city: c.name, state: c.state, lat: c.lat, lng: c.lng,
        status: 0, error: String(e).slice(0, 200),
        summary: null, unique_dates: [], events_count: 0,
      });
      console.log(`[${String(i + 1).padStart(3)}/${filtered.length}] ${c.name}, ${c.state} — ERROR: ${String(e).slice(0, 120)}`);
    }
    if (i < filtered.length - 1) await sleep(args.delay);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = join(outDir, `ihm-mirror-${stamp}.json`);
  await writeFile(outPath, JSON.stringify({
    crawled_at: startedAt,
    completed_at: new Date().toISOString(),
    source: 'web.archive.org/web/2025id_',
    stats: { total: filtered.length, ok, not_found: notFound, errored },
    cities: results,
  }, null, 2));

  console.log(
    `\n[IHM-Crawl] DONE — ${ok} ok, ${notFound} not-found, ${errored} errors → ${outPath}`
  );
  // Extra: what's the total of IHM's claimed lifetime counts across the fleet?
  const lifetimeSum = results.reduce((s, r) => s + (r.summary?.doppler_lifetime ?? 0), 0);
  const datesSum = results.reduce((s, r) => s + (r.unique_dates_count ?? 0), 0);
  console.log(`[IHM-Crawl] IHM claims ${lifetimeSum} lifetime Doppler detections across fleet`);
  console.log(`[IHM-Crawl] We parsed ${datesSum} unique dates across fleet`);
})();
