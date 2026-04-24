#!/usr/bin/env node
// IHM city-page probe via Wayback Machine raw-mirror (`id_` modifier).
// Pulls 5 DMV cities, extracts structured coverage counts + top recent date.
import { setTimeout as sleep } from 'node:timers/promises';

const CITIES = [
  ['fairfax',   'va'],
  ['richmond',  'va'],
  ['baltimore', 'md'],
  ['pittsburgh','pa'],
  ['wilmington','de'],
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const WB_BASE = 'https://web.archive.org/web/2025id_/https://www.interactivehailmaps.com/local-hail-map';

function parseIhmCityPage(html, city, st) {
  // Kill scripts/styles, strip tags, collapse whitespace
  const txt = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Known IHM phrase templates
  const doppler = txt.match(/Doppler radar has detected hail at or near [^.]+ on (\d+) occasions?(?:, including (\d+) occasions? during the past year)?/i);
  const spotters = txt.match(/had (\d+) reports? of on-the-ground hail/i);
  const warnings = txt.match(/has been under severe weather warnings (\d+) times?/i);
  const topRecent = txt.match(/Top Recent Hail Date for [^.]+ is ([A-Za-z]+, [A-Za-z]+ \d+, \d{4})/i);

  return {
    city, st,
    doppler_lifetime: doppler ? parseInt(doppler[1], 10) : null,
    doppler_past_year: doppler && doppler[2] ? parseInt(doppler[2], 10) : null,
    spotter_reports_past_12mo: spotters ? parseInt(spotters[1], 10) : null,
    severe_warnings_past_12mo: warnings ? parseInt(warnings[1], 10) : null,
    top_recent_date: topRecent ? topRecent[1] : null,
    // Rough sanity: count how many date-ish tokens appear in the event log
    dated_events_visible: (txt.match(/\d+\/\d+\/\d{4}/g) || []).length,
    text_bytes: txt.length,
  };
}

(async () => {
  for (const [city, st] of CITIES) {
    const url = `${WB_BASE}/${city}-${st}/`;
    const t0 = Date.now();
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      const html = await r.text();
      const dt = Date.now() - t0;
      if (!r.ok) {
        console.log(`[${city}-${st}] HTTP ${r.status} (${dt}ms)`);
      } else {
        const data = parseIhmCityPage(html, city, st);
        console.log(`[${city}-${st}] ${dt}ms`, JSON.stringify(data));
      }
    } catch (e) {
      console.log(`[${city}-${st}] error: ${e.message}`);
    }
    await sleep(2000); // be polite to Wayback
  }
})();
