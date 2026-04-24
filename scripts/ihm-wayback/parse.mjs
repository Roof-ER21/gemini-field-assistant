#!/usr/bin/env node
// IHM city-page parser — Wayback raw-mirror → structured JSON.
//
// Call `parseIhmCityPage(html, city, st)` with the raw HTML of
// https://web.archive.org/web/2025id_/https://www.interactivehailmaps.com/local-hail-map/{city}-{st}/
// and you get back { summary, events, unique_dates } — every NWS report row
// parsed into date + time + hail_inches + location_phrase.
//
// Hail-size word → inches mapping is the NWS standard (same coding used by
// NOAA Storm Events, so this matches what our verified_hail_events uses).
export const HAIL_SIZE_INCHES = {
  'pea':          0.25,
  'marble':       0.50,
  'dime':         0.75,
  'penny':        0.75,
  'nickel':       0.88,
  'quarter':      1.00,
  'half dollar':  1.25,
  'half-dollar':  1.25,
  'half doller':  1.25,   // seen in IHM text: OCR-ish typos
  'ping pong':    1.50,
  'ping-pong':    1.50,
  'walnut':       1.50,
  'golf ball':    1.75,
  'golfball':     1.75,
  'golf-ball':    1.75,
  'hen egg':      2.00,
  'hen-egg':      2.00,
  'lime':         2.00,
  'tennis ball':  2.50,
  'tennis-ball':  2.50,
  'baseball':     2.75,
  'tea cup':      3.00,
  'tea-cup':      3.00,
  'teacup':       3.00,
  'grapefruit':   4.00,
  'softball':     4.00,
};

const SIZE_WORDS_SORTED = Object.keys(HAIL_SIZE_INCHES).sort((a, b) => b.length - a.length);
const SIZE_REGEX = new RegExp(`\\b(${SIZE_WORDS_SORTED.map((s) => s.replace(/ /g, '[ -]?')).join('|')})[- ]?size[d]?\\s+hail`, 'i');

export function extractHailSizeInches(text) {
  if (!text) return null;
  const m = text.match(SIZE_REGEX);
  if (!m) return null;
  const normalized = m[1].toLowerCase().replace(/[- ]+/g, ' ').trim();
  return HAIL_SIZE_INCHES[normalized] ?? HAIL_SIZE_INCHES[normalized.replace(' ', '-')] ?? null;
}

function stripToText(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
}

function rowsFromHtml(html) {
  const rows = [];
  // <tr>...</tr> non-greedy; drop wayback toolbar rows by requiring a date token inside
  const re = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = m[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    if (!/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s+(AM|PM)/i.test(text)) continue;
    rows.push(text);
  }
  return rows;
}

function parseEventRow(text) {
  // "5/16/2025 5:26 PM EDT the severe thunderstorm warning has been cancelled..."
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}:\d{2})\s+(AM|PM)\s+([A-Z]{2,4})\s+(.*)$/i);
  if (!m) return null;
  const [, mm, dd, yyyy, hm, ampm, tz, body] = m;
  const isoDate = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const hailInches = extractHailSizeInches(body);
  const windMatch = body.match(/(\d{2,3})\s*mph\s*(?:wind\s*)?gusts?/i);
  const windMph = windMatch ? parseInt(windMatch[1], 10) : null;
  // Location phrase: "located over <place>," / "located over <place>, or over <place>"
  const locMatch = body.match(/located (?:over|near) ([^,.]+?)(?:,\s*(?:or|moving|and|are)|\.)/i);
  const locationPhrase = locMatch ? locMatch[1].trim() : null;
  const reportType = /trained (?:weather )?spotter|public|storm chaser|public report|amateur radio|asos|awos|cooperative observer/i.test(body)
    ? (body.match(/\b(trained (?:weather )?spotter|public|storm chaser|amateur radio|asos|awos|cooperative observer)\b/i) || [])[1]?.toLowerCase() ?? null
    : (/radar indicated/i.test(body) ? 'radar indicated' : null);
  return {
    date: isoDate,
    local_time: `${hm} ${ampm.toUpperCase()} ${tz.toUpperCase()}`,
    hail_inches: hailInches,
    wind_mph: windMph,
    location_phrase: locationPhrase,
    report_type: reportType,
    body: body.length > 400 ? body.slice(0, 400) + '…' : body,
  };
}

export function parseIhmCityPage(html, city, st) {
  const cleaned = stripToText(html);
  const plain = cleaned.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const doppler  = plain.match(/Doppler radar has detected hail at or near [^.]+ on (\d+) occasions?(?:, including (\d+) occasions? during the past year)?/i);
  const spotters = plain.match(/had (\d+) reports? of on-the-ground hail/i);
  const warnings = plain.match(/has been under severe weather warnings (\d+) times?/i);
  const topRecent = plain.match(/Top Recent Hail Date for [^.]+ is ([A-Za-z]+, [A-Za-z]+ \d+, \d{4})/i);

  const events = rowsFromHtml(cleaned).map(parseEventRow).filter(Boolean);

  // Aggregate to unique dates with max hail size + any confirming report
  const byDate = new Map();
  for (const ev of events) {
    const prev = byDate.get(ev.date);
    if (!prev) {
      byDate.set(ev.date, {
        date: ev.date,
        max_hail_inches: ev.hail_inches ?? null,
        has_spotter: ev.report_type === 'trained spotter' || ev.report_type === 'trained weather spotter',
        has_radar: ev.report_type === 'radar indicated',
        wind_mph_max: ev.wind_mph ?? null,
        rows: 1,
      });
    } else {
      if ((ev.hail_inches ?? 0) > (prev.max_hail_inches ?? 0)) prev.max_hail_inches = ev.hail_inches;
      if (ev.report_type === 'trained spotter' || ev.report_type === 'trained weather spotter') prev.has_spotter = true;
      if (ev.report_type === 'radar indicated') prev.has_radar = true;
      if ((ev.wind_mph ?? 0) > (prev.wind_mph_max ?? 0)) prev.wind_mph_max = ev.wind_mph;
      prev.rows += 1;
    }
  }
  const uniqueDates = Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));

  return {
    city, st,
    summary: {
      doppler_lifetime:          doppler ? parseInt(doppler[1], 10) : null,
      doppler_past_year:         doppler && doppler[2] ? parseInt(doppler[2], 10) : null,
      spotter_reports_past_12mo: spotters ? parseInt(spotters[1], 10) : null,
      severe_warnings_past_12mo: warnings ? parseInt(warnings[1], 10) : null,
      top_recent_date:           topRecent ? topRecent[1] : null,
    },
    events_count: events.length,
    unique_dates_count: uniqueDates.length,
    unique_dates: uniqueDates,
    // Keep raw events opt-in; callers that just want the diff use unique_dates
    events,
  };
}

// CLI: node parse.mjs <html-path> [city] [st]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , path, city = 'unknown', st = 'xx'] = process.argv;
  if (!path) {
    console.error('usage: node parse.mjs <html-file> [city] [state]');
    process.exit(1);
  }
  const fs = await import('node:fs/promises');
  const html = await fs.readFile(path, 'utf8');
  const parsed = parseIhmCityPage(html, city, st);
  const { events, ...rest } = parsed;
  console.log(JSON.stringify(rest, null, 2));
  console.log(`\n(${events.length} raw events in full parse — omit --brief for full dump)`);
}
