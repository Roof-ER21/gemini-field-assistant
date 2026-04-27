#!/usr/bin/env node
/**
 * test-verified-pdf.ts — Generate real PDFs using verified_hail_events
 * for test addresses. Proves the PDF update works end-to-end.
 *
 * Run: railway run bash -c 'npx tsx scripts/test-verified-pdf.ts'
 * Output: /tmp/pdf-test/{slug}-verified.pdf
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { VerifiedEventsPdfAdapter } from '../server/services/verifiedEventsPdfAdapter.js';
import { PDFReportServiceV2 } from '../server/services/pdfReportServiceV2.js';
import { fetchMapImage } from '../server/services/mapImageService.js';
import { fetchNexradImage } from '../server/services/nexradService.js';
import { fetchNWSAlerts } from '../server/services/nwsAlertService.js';
import { buildConsilience, type ConsilienceReport } from '../server/services/consilienceService.js';

const OUT_DIR = '/tmp/pdf-test';

const TARGETS: Array<{
  address: string; city: string; state: string; lat: number; lng: number; slug: string;
  dateOfLoss?: string;
  datesOfLoss?: string[];
  fromDate?: string;
  toDate?: string;
}> = [
  // LIFETIME mode (no date filter)
  { address: '7820 Amherst Dr, Manassas, VA 20111', city: 'Manassas', state: 'VA', lat: 38.7868, lng: -77.4795, slug: 'amherst-manassas-LIFETIME' },
  { address: '5221 Scenic Dr, Perry Hall, MD 21128', city: 'Perry Hall', state: 'MD', lat: 39.3990, lng: -76.4368, slug: 'scenic-perryhall-LIFETIME' },
  // SINGLE date
  { address: '5221 Scenic Dr, Perry Hall, MD 21128', city: 'Perry Hall', state: 'MD', lat: 39.3990, lng: -76.4368, slug: 'scenic-perryhall-SINGLE-7-8-2025', dateOfLoss: '2025-07-08' },
  // MULTI date — combines 3 Perry Hall storms into one report
  { address: '5221 Scenic Dr, Perry Hall, MD 21128', city: 'Perry Hall', state: 'MD', lat: 39.3990, lng: -76.4368, slug: 'scenic-perryhall-MULTI', datesOfLoss: ['2025-07-08', '2024-08-06', '2023-07-29'] },
  // RANGE — past 12 months at Amherst
  { address: '7820 Amherst Dr, Manassas, VA 20111', city: 'Manassas', state: 'VA', lat: 38.7868, lng: -77.4795, slug: 'amherst-manassas-RANGE-12mo', fromDate: '2025-04-22', toDate: '2026-04-22' },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!databaseUrl) { console.error('DB URL required'); process.exit(1); }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('railway') || databaseUrl.includes('amazonaws') ? { rejectUnauthorized: false } : false,
  });

  const adapter = new VerifiedEventsPdfAdapter(pool);
  const pdfService = new PDFReportServiceV2();

  for (const target of TARGETS) {
    console.log(`\n[${target.slug}] Fetching events from verified_hail_events…`);
    const { events, historyEvents, noaaEvents, totalInDb } = await adapter.getEventsForProperty(
      target.lat, target.lng, 10, 5, true,
    );
    console.log(`  Found ${totalInDb} raw events → ${events.length} days, ${historyEvents.length} banded obs, ${noaaEvents.length} NOAA`);

    // Compute damage score (simple heuristic from new events)
    const maxHail = events.reduce((m, e) => Math.max(m, e.hailSize || 0), 0);
    const maxWind = noaaEvents
      .filter((e) => e.eventType === 'wind')
      .reduce((m, e) => Math.max(m, e.magnitude || 0), 0);
    const damageScore = {
      overallScore: Math.min(100, Math.round(maxHail * 40 + maxWind * 0.8)),
      hailScore: Math.min(100, Math.round(maxHail * 40)),
      windScore: Math.min(100, Math.round(maxWind * 0.8)),
      riskLevel: maxHail >= 2 ? 'extreme' as const : maxHail >= 1 ? 'high' as const : 'moderate' as const,
      reasoning: `Max hail ${maxHail.toFixed(2)}", max wind ${maxWind} mph across ${events.length} events.`,
      confidence: events.length > 20 ? 'high' as const : 'medium' as const,
    };

    // Build visual assets — map, NEXRAD radar image, active warnings
    console.log(`  Fetching map image…`);
    const mapImage = await fetchMapImage({
      lat: target.lat,
      lng: target.lng,
      zoom: 11,
      width: 640,
      height: 360,
    }).catch((e) => { console.log(`    map failed: ${e.message}`); return null; });

    console.log(`  Fetching NEXRAD radar…`);
    // For dated reports, always pull radar for the target storm date.
    // Otherwise pick the most recent big storm at the property for context.
    const latestBigStorm = events
      .filter((e) => (e.hailSize || 0) >= 1.0 && (e.distanceMiles ?? 99) <= 5)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const nexradDate = target.dateOfLoss
      || latestBigStorm?.date
      || new Date().toISOString().slice(0, 10);
    const nexrad = await fetchNexradImage({
      lat: target.lat,
      lng: target.lng,
      datetime: nexradDate + 'T20:00:00Z',
      width: 640,
      height: 400,
    }).catch((e) => { console.log(`    nexrad failed: ${e.message}`); return null; });

    console.log(`  Fetching NWS alerts…`);
    const now = new Date();
    const startDate = new Date(now);
    startDate.setHours(now.getHours() - 6);
    const alerts = await fetchNWSAlerts({
      lat: target.lat,
      lng: target.lng,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
    }).catch((e) => { console.log(`    alerts failed: ${e.message}`); return []; });

    // Build per-date consilience reports — prefer direct-hit-class dates
    // (sub-mile, ≥ 0.5") first, then fall back to nearest qualifying events.
    // Sort ascending by date so earliest-known direct hit appears first
    // (production /generate-report does the same via swathDirectHits).
    const directHitClass = events
      .filter((e) => (e.hailSize || 0) >= 0.5 && (e.distanceMiles ?? 99) <= 1)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => e.date)
      .filter((v, i, arr) => arr.indexOf(v) === i);
    const fallback = directHitClass.length === 0
      ? events
          .filter((e) => (e.hailSize || 0) >= 0.5 && (e.distanceMiles ?? 99) <= 5)
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((e) => e.date)
          .filter((v, i, arr) => arr.indexOf(v) === i)
      : [];
    const topDates = [...directHitClass, ...fallback].slice(0, 3);
    console.log(`  Building consilience reports for: ${topDates.join(', ') || '(no dates ≥ 0.5")'}…`);
    const consilienceReports: ConsilienceReport[] = (
      await Promise.all(
        topDates.map((d) =>
          buildConsilience(pool, { lat: target.lat, lng: target.lng, dateIso: d }).catch(
            (e) => {
              console.log(`    consilience fetch failed for ${d}: ${e.message}`);
              return null;
            },
          ),
        ),
      )
    ).filter((r): r is ConsilienceReport => r !== null);
    for (const r of consilienceReports) {
      console.log(`    ${r.dateIso}: ${r.consilienceScore}/6 sources (${r.sourcesAgreeing.join(',')})`);
    }

    console.log(`  Generating PDF…${target.dateOfLoss ? ` [dateOfLoss=${target.dateOfLoss}]` : ''}`);
    const stream = pdfService.generateReport({
      address: target.address,
      city: target.city,
      state: target.state,
      lat: target.lat,
      lng: target.lng,
      radius: 10,
      dateOfLoss: target.dateOfLoss,
      datesOfLoss: target.datesOfLoss,
      fromDate: target.fromDate,
      toDate: target.toDate,
      events,
      noaaEvents,
      historyEvents,           // full distance-banded observations
      damageScore,
      companyName: 'The Roof Docs',
      companyAddress: '12345 Main St, Chantilly, VA',
      companyPhone: '(703) 555-0100',
      companyWebsite: 'theroofdocs.com',
      filter: 'all',
      mapImage: mapImage,
      nexradImage: nexrad?.imageBuffer || null,
      nexradTimestamp: nexrad?.timestamp,
      nwsAlerts: alerts,
      includeMap: !!mapImage,
      includeNexrad: !!nexrad?.imageBuffer,
      includeWarnings: alerts.length > 0,
      consilienceReports: consilienceReports.length > 0 ? consilienceReports : undefined,
    });

    const outPath = path.join(OUT_DIR, `${target.slug}-verified.pdf`);
    const outStream = fs.createWriteStream(outPath);
    stream.pipe(outStream);
    await new Promise((resolve, reject) => {
      outStream.on('finish', resolve);
      outStream.on('error', reject);
    });

    const size = fs.statSync(outPath).size;
    console.log(`  ✓ Wrote ${outPath} (${(size / 1024).toFixed(1)} KB)`);
  }

  await pool.end();
  console.log(`\nDone. PDFs in ${OUT_DIR}/`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
