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

const OUT_DIR = '/tmp/pdf-test';

const TARGETS = [
  { address: '7820 Amherst Dr, Manassas, VA 20111', city: 'Manassas', state: 'VA', lat: 38.7868, lng: -77.4795, slug: 'amherst-manassas' },
  { address: '5221 Scenic Dr, Perry Hall, MD 21128', city: 'Perry Hall', state: 'MD', lat: 39.3990, lng: -76.4368, slug: 'scenic-perryhall' },
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
    const { events, noaaEvents, totalInDb } = await adapter.getEventsForProperty(
      target.lat, target.lng, 10, 5, true,
    );
    console.log(`  Found ${totalInDb} raw events → ${events.length} hail, ${noaaEvents.length} total NOAA-format`);

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

    console.log(`  Generating PDF…`);
    const stream = pdfService.generateReport({
      address: target.address,
      city: target.city,
      state: target.state,
      lat: target.lat,
      lng: target.lng,
      radius: 10,
      events,
      noaaEvents,
      historyEvents: events,   // explicitly seed history
      damageScore,
      companyName: 'The Roof Docs',
      companyAddress: '12345 Main St, Chantilly, VA',
      companyPhone: '(703) 555-0100',
      companyWebsite: 'theroofdocs.com',
      filter: 'all',
      includeMap: false,
      includeNexrad: false,
      includeWarnings: false,
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
