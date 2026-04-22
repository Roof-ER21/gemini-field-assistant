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

const OUT_DIR = '/tmp/pdf-test';

const TARGETS: Array<{
  address: string; city: string; state: string; lat: number; lng: number; slug: string; dateOfLoss?: string;
}> = [
  { address: '7820 Amherst Dr, Manassas, VA 20111', city: 'Manassas', state: 'VA', lat: 38.7868, lng: -77.4795, slug: 'amherst-manassas' },
  { address: '5221 Scenic Dr, Perry Hall, MD 21128', city: 'Perry Hall', state: 'MD', lat: 39.3990, lng: -76.4368, slug: 'scenic-perryhall' },
  // Dated reports — one specific storm each
  { address: '5221 Scenic Dr, Perry Hall, MD 21128', city: 'Perry Hall', state: 'MD', lat: 39.3990, lng: -76.4368, slug: 'scenic-perryhall-DATED-7-8-2025', dateOfLoss: '2025-07-08' },
  { address: '7820 Amherst Dr, Manassas, VA 20111', city: 'Manassas', state: 'VA', lat: 38.7868, lng: -77.4795, slug: 'amherst-manassas-DATED-5-16-2022', dateOfLoss: '2022-05-16' },
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
    // Find most recent actionable storm date for this property and pull radar for it
    const latestBigStorm = events
      .filter((e) => (e.hailSize || 0) >= 1.0 && (e.distanceMiles ?? 99) <= 5)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const nexradDate = latestBigStorm?.date || new Date().toISOString().slice(0, 10);
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

    console.log(`  Generating PDF…${target.dateOfLoss ? ` [dateOfLoss=${target.dateOfLoss}]` : ''}`);
    const stream = pdfService.generateReport({
      address: target.address,
      city: target.city,
      state: target.state,
      lat: target.lat,
      lng: target.lng,
      radius: 10,
      dateOfLoss: target.dateOfLoss,
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
