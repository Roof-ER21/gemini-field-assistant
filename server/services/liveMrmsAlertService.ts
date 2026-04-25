/**
 * Live MRMS → Sales Team Alert
 *
 * Every N min (called from sa21-worker cron), checks the latest MRMS MESH
 * scan for hail cells ≥ threshold anywhere in the DMV+PA+WV+DE footprint.
 * When new cells found, posts a single bulleted alert to Sales Team with:
 *   • nearest DMV city per cell
 *   • peak size
 *   • timestamp relative to now
 *   • link to the storm-maps live layer
 *
 * Dedup: bot_storm_alerts_sent table keyed by
 * (ref_time, lat_bucket, lng_bucket, max_inches_bucket). Same storm
 * cell can't fire twice in a 24-h window.
 *
 * Gated on LIVE_MRMS_ALERT_ENABLED env flag (default false) so we can
 * validate in test group first. When ENABLED=test-group, posts to
 * GROUPME_TEST_GROUP_ID's bot instead of Sales Team's bot — lets Ahmed
 * preview before flipping to live.
 */
import type pg from 'pg';
import { DMV_CITIES } from './dmvCities.js';

// Tunables
// Threshold 0.25" — we alert on anything trace-and-up, but with tiered
// messaging so reps learn to trust the bigger numbers:
//   0.25-0.50"  → 👀 HEADS UP (single line, informational)
//   0.50-1.00"  → ⚡ HAIL ALERT (per-city bullets, canvas-ready)
//   1.00"+      → 🚨 SEVERE HAIL (bold emphasis, drop everything)
// Matches what HailTrace / IHM canvassing reps would set their own
// thresholds at. Polygon bands are FLOOR thresholds, so 0.38" MESH falls
// inside a 0.25" band (not 0.50") and fires a HEADS UP, not an ALERT.
export const DEFAULT_MIN_MESH_INCHES = 0.25;

// Tier cut-offs — inches ≥ these thresholds upgrade to the next tier.
const TIER_ALERT_INCHES = 0.50;
const TIER_SEVERE_INCHES = 1.00;

type AlertTier = 'heads_up' | 'alert' | 'severe';

function tierForInches(inches: number): AlertTier {
  if (inches >= TIER_SEVERE_INCHES) return 'severe';
  if (inches >= TIER_ALERT_INCHES) return 'alert';
  return 'heads_up';
}
const DEDUP_LAT_BUCKET = 0.1;                          // ~7 mi
const DEDUP_LNG_BUCKET = 0.1;
const DEDUP_WINDOW_HOURS = 24;
const CITY_MAX_DIST_MI = 15;                           // only report cells within 15mi of a targeted city

// STATE SCOPE — only alert on cells nearest to a city in this set.
// Start with VA/MD/PA (DC implicit because DC centroids live in the DMV
// dict and fall naturally within MD/VA coverage). DE + NJ coming soon.
const ALERT_STATES = new Set<string>(['VA', 'MD', 'PA', 'DC']);

// MRMS fetch bbox — stays wide so a storm spanning NJ/DE borders still
// gets detected. Filtering to ALERT_STATES happens after nearest-city
// match so cells too far from any VA/MD/PA city drop out naturally.
const ALERT_BBOX = {
  north: 42.3,
  south: 36.5,
  east:  -74.5,
  west:  -82.5,
};

const SALES_TEAM_GROUP_ID = '93177620';
const GROUPME_BOT_ID = process.env.GROUPME_BOT_ID || '';
const TEST_BOT_ID = process.env.GROUPME_TEST_BOT_ID || '';
const TEST_GROUP_ID = process.env.GROUPME_TEST_GROUP_ID || '';

interface MrmsPolygon {
  type: 'Feature';
  properties: { sizeInches: number; label: string; severity: string; level: number };
  geometry: { type: 'MultiPolygon' | 'Polygon'; coordinates: any };
}

interface MrmsResp {
  type: 'FeatureCollection';
  features: MrmsPolygon[];
  metadata?: {
    refTime?: string;
    maxMeshInches?: number;
    hailCells?: number;
    bounds?: { north: number; south: number; east: number; west: number };
  };
}

interface Cell {
  lat: number;
  lng: number;
  inches: number;
  nearestCity: { name: string; state: string; dist: number } | null;
}

function haversineMi(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 3959;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(la2 - la1);
  const dLng = toRad(lo2 - lo1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function centroidOfFeature(f: MrmsPolygon): { lat: number; lng: number } | null {
  try {
    const c = f.geometry.coordinates as any;
    // Take first polygon's first ring's first point — cheap approximation
    // (sufficient for nearest-city dedup bucket; we're not drawing anything).
    let ring: number[][];
    if (f.geometry.type === 'MultiPolygon') ring = c[0][0];
    else ring = c[0];
    let sumLat = 0, sumLng = 0;
    for (const pt of ring) {
      sumLng += pt[0];
      sumLat += pt[1];
    }
    return { lat: sumLat / ring.length, lng: sumLng / ring.length };
  } catch {
    return null;
  }
}

function nearestCity(lat: number, lng: number): { name: string; state: string; dist: number } | null {
  let best: { name: string; state: string; dist: number } | null = null;
  for (const key of Object.keys(DMV_CITIES)) {
    const c = DMV_CITIES[key];
    // State scope check — only consider cities in VA/MD/PA/DC for now.
    // DE + NJ will be added by broadening ALERT_STATES (no other code change).
    if (!ALERT_STATES.has(c.state)) continue;
    const d = haversineMi(lat, lng, c.lat, c.lng);
    if (!best || d < best.dist) best = { name: c.name, state: c.state, dist: d };
  }
  if (!best || best.dist > CITY_MAX_DIST_MI) return null;
  return best;
}

async function fetchLiveMrms(): Promise<MrmsResp | null> {
  const nodeUrl = process.env.NODE_APP_URL || 'https://sa21.up.railway.app';
  const q = new URLSearchParams({
    north: String(ALERT_BBOX.north),
    south: String(ALERT_BBOX.south),
    east:  String(ALERT_BBOX.east),
    west:  String(ALERT_BBOX.west),
  });
  try {
    const r = await fetch(`${nodeUrl}/api/hail/mrms-now-polygons?${q}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return null;
    return (await r.json()) as MrmsResp;
  } catch (e) {
    console.warn('[LiveMrmsAlert] fetch err:', (e as Error).message);
    return null;
  }
}

async function ensureSchema(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_storm_alerts_sent (
      id                BIGSERIAL PRIMARY KEY,
      ref_time          TIMESTAMPTZ NOT NULL,
      lat_bucket        NUMERIC(6, 2) NOT NULL,
      lng_bucket        NUMERIC(7, 2) NOT NULL,
      max_inches_bucket NUMERIC(4, 2) NOT NULL,
      group_id          TEXT,
      city              TEXT,
      state             CHAR(2),
      posted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      dedup_key         TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_storm_alerts_sent_dedup
      ON bot_storm_alerts_sent (dedup_key);
    CREATE INDEX IF NOT EXISTS idx_bot_storm_alerts_sent_posted
      ON bot_storm_alerts_sent (posted_at DESC);
  `);
}

async function postToGroupMe(botId: string, text: string): Promise<boolean> {
  try {
    const r = await fetch('https://api.groupme.com/v3/bots/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: botId, text }),
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export interface LiveAlertResult {
  ran: boolean;
  reason?: string;
  cells_detected: number;
  cells_above_threshold: number;
  new_cells: number;
  cells_suppressed_duplicate: number;
  posted: boolean;
  post_group_id?: string;
  cells?: Cell[];
  ref_time?: string;
}

/**
 * One call; returns detailed result. Safe to run from cron AND from an
 * admin HTTP endpoint (for manual testing).
 */
export async function runLiveMrmsAlertCheck(
  pool: pg.Pool,
  opts: {
    minMeshInches?: number;
    dryRun?: boolean;
    forceTestGroup?: boolean;
  } = {},
): Promise<LiveAlertResult> {
  const flagVal = process.env.LIVE_MRMS_ALERT_ENABLED;
  const enabled = flagVal === 'true' || flagVal === 'test-group' || flagVal === 'approval-gate';
  const testMode = opts.forceTestGroup === true || flagVal === 'test-group';
  // approval-gate: post to TEST group as proposal; await human ✅/❌ in test group;
  // forwarder lives in susanGroupMeBotRoutes.ts handler.
  const approvalGate = flagVal === 'approval-gate' && !opts.forceTestGroup;
  if (!enabled && !opts.dryRun && !opts.forceTestGroup) {
    return { ran: false, reason: 'LIVE_MRMS_ALERT_ENABLED not set', cells_detected: 0, cells_above_threshold: 0, new_cells: 0, cells_suppressed_duplicate: 0, posted: false };
  }

  const minInches = opts.minMeshInches ?? DEFAULT_MIN_MESH_INCHES;
  await ensureSchema(pool);

  const resp = await fetchLiveMrms();
  if (!resp) return { ran: true, reason: 'fetch_failed', cells_detected: 0, cells_above_threshold: 0, new_cells: 0, cells_suppressed_duplicate: 0, posted: false };

  const refTime = resp.metadata?.refTime ?? new Date().toISOString();
  const features = resp.features || [];

  // Extract claim-tier cells with nearest city IN ALERT_STATES.
  // Cells with no VA/MD/PA/DC city within 15mi are dropped (keeps us from
  // posting about WV/NJ/DE cells until those states are enabled).
  const cells: Cell[] = [];
  for (const f of features) {
    const inches = Number(f.properties?.sizeInches || 0);
    if (inches < minInches) continue;
    const c = centroidOfFeature(f);
    if (!c) continue;
    const nearest = nearestCity(c.lat, c.lng);
    if (!nearest) continue; // out of scope (no VA/MD/PA/DC city within 15mi)
    cells.push({ lat: c.lat, lng: c.lng, inches, nearestCity: nearest });
  }

  // Collapse to unique (city, inches bucket) pairs — the UI shows contour-banded
  // polygons so a single storm emits several nested features. One alert per city.
  const dedupedMap = new Map<string, Cell>();
  for (const c of cells) {
    const cityKey = c.nearestCity ? `${c.nearestCity.name}-${c.nearestCity.state}` : `lat${c.lat.toFixed(1)}:lng${c.lng.toFixed(1)}`;
    const existing = dedupedMap.get(cityKey);
    if (!existing || c.inches > existing.inches) dedupedMap.set(cityKey, c);
  }
  const perCity = Array.from(dedupedMap.values()).sort((a, b) => b.inches - a.inches);

  // Persistent dedup: for each cell, check bot_storm_alerts_sent
  const newCells: Cell[] = [];
  let suppressed = 0;
  for (const c of perCity) {
    const latBucket = Math.round(c.lat / DEDUP_LAT_BUCKET) * DEDUP_LAT_BUCKET;
    const lngBucket = Math.round(c.lng / DEDUP_LNG_BUCKET) * DEDUP_LNG_BUCKET;
    const inchesBucket = Math.floor(c.inches * 4) / 4; // 0.25" steps
    const dedupKey = `${refTime}|${latBucket.toFixed(2)}|${lngBucket.toFixed(2)}|${inchesBucket.toFixed(2)}`;
    const { rows } = await pool.query(
      `SELECT 1 FROM bot_storm_alerts_sent
         WHERE dedup_key = $1
            OR (lat_bucket = $2 AND lng_bucket = $3 AND max_inches_bucket = $4
                AND posted_at > NOW() - INTERVAL '${DEDUP_WINDOW_HOURS} hours')`,
      [dedupKey, latBucket.toFixed(2), lngBucket.toFixed(2), inchesBucket.toFixed(2)],
    );
    if (rows.length > 0) { suppressed++; continue; }
    newCells.push(c);
  }

  if (newCells.length === 0) {
    return {
      ran: true, reason: 'no_new_cells',
      cells_detected: features.length,
      cells_above_threshold: perCity.length,
      new_cells: 0,
      cells_suppressed_duplicate: suppressed,
      posted: false,
      cells: perCity,
      ref_time: refTime,
    };
  }

  // Build tiered message — tier is determined by the PEAK cell's size,
  // so one storm with mixed-size cells still gets a single coherent post
  // at the appropriate urgency level.
  const refDate = new Date(refTime);
  const minsAgo = Math.round((Date.now() - refDate.getTime()) / 60_000);
  // Wall-clock in Eastern alongside "min ago" so reviewers see the absolute
  // time without doing UTC math on their phone.
  const refClockET = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(refDate);
  const timeLabel = minsAgo < 60
    ? `${minsAgo} min ago · ${refClockET} ET`
    : `${Math.round(minsAgo / 60)}h ago · ${refClockET} ET`;
  const peakInches = newCells[0].inches.toFixed(2);
  const peakTier = tierForInches(newCells[0].inches);

  const lines: string[] = [];
  if (peakTier === 'severe') {
    lines.push(`🚨 SEVERE HAIL — peak ${peakInches}" (${timeLabel}). Drop everything.`);
  } else if (peakTier === 'alert') {
    lines.push(`⚡ HAIL ALERT — ${newCells.length} cell${newCells.length > 1 ? 's' : ''} in VA/MD/PA, peak ${peakInches}" (${timeLabel})`);
  } else {
    // heads_up — keep it short; reps don't need a bulleted list for trace cells
    const leadCity = newCells[0].nearestCity;
    const cityLabel = leadCity ? `${leadCity.name}, ${leadCity.state}` : 'DMV area';
    const suffix = newCells.length > 1 ? ` (+${newCells.length - 1} more)` : '';
    lines.push(`👀 HEADS UP — radar hail near ${cityLabel}: ${peakInches}" (${timeLabel})${suffix}`);
    lines.push('');
    lines.push('Map: sa21.up.railway.app → Storm Maps → LIVE');
  }

  // Per-city bullets only for ALERT + SEVERE (skip for heads_up — keeps it one line)
  if (peakTier !== 'heads_up') {
    for (const c of newCells.slice(0, 8)) {
      const cityLabel = c.nearestCity
        ? `${c.nearestCity.name}, ${c.nearestCity.state} (${c.nearestCity.dist.toFixed(0)}mi)`
        : `${c.lat.toFixed(2)},${c.lng.toFixed(2)}`;
      const sizePrefix = tierForInches(c.inches) === 'severe' ? '🚨 ' : '';
      lines.push(`• ${sizePrefix}${cityLabel}: ${c.inches.toFixed(2)}"`);
    }
    if (newCells.length > 8) lines.push(`  …+${newCells.length - 8} more cells`);
    lines.push('');
    lines.push('Map: sa21.up.railway.app → Storm Maps → toggle LIVE');
  }
  const text = lines.join('\n');

  // Pick bot + group. approval-gate posts the PROPOSAL to test group, but
  // remembers the Sales-Team destination so the approver's "yes" forwards
  // it to the right place.
  const targetBotId = (testMode || approvalGate) ? TEST_BOT_ID : GROUPME_BOT_ID;
  const targetGroupId = (testMode || approvalGate) ? TEST_GROUP_ID : SALES_TEAM_GROUP_ID;
  const forwardBotId = approvalGate ? GROUPME_BOT_ID : targetBotId;
  const forwardGroupId = approvalGate ? SALES_TEAM_GROUP_ID : targetGroupId;

  if (opts.dryRun) {
    return {
      ran: true, reason: 'dry_run',
      cells_detected: features.length,
      cells_above_threshold: perCity.length,
      new_cells: newCells.length,
      cells_suppressed_duplicate: suppressed,
      posted: false,
      post_group_id: targetGroupId,
      cells: newCells,
      ref_time: refTime,
    };
  }
  if (!targetBotId) {
    return {
      ran: true, reason: 'no_bot_id_configured',
      cells_detected: features.length,
      cells_above_threshold: perCity.length,
      new_cells: newCells.length,
      cells_suppressed_duplicate: suppressed,
      posted: false,
      cells: newCells,
      ref_time: refTime,
    };
  }

  // approval-gate: stash the original alert as a pending row + post the
  // wrapped proposal to test group. Forward happens in the Susan webhook
  // when a reviewer ✅/❌s.
  let textToPost = text;
  if (approvalGate) {
    try {
      const { createPendingAlert } = await import('./pendingAlertsService.js');
      const created = await createPendingAlert(pool, {
        source: 'mrms',
        targetGroupId: forwardGroupId,
        targetBotId: forwardBotId,
        messageText: text,
        metadata: { peakInches, newCells: newCells.length, refTime, tier: peakTier },
      });
      textToPost = created.proposalText;
      console.log(`[LiveMrmsAlert] approval-gate pending=${created.alertId} await test-group review`);
    } catch (e) {
      console.error('[LiveMrmsAlert] approval-gate persist failed, falling back to direct test-group post:', (e as Error).message);
    }
  }

  const posted = await postToGroupMe(targetBotId, textToPost);

  // Persist sent cells (even if post failed, we don't retry in same window)
  for (const c of newCells) {
    const latBucket = Math.round(c.lat / DEDUP_LAT_BUCKET) * DEDUP_LAT_BUCKET;
    const lngBucket = Math.round(c.lng / DEDUP_LNG_BUCKET) * DEDUP_LNG_BUCKET;
    const inchesBucket = Math.floor(c.inches * 4) / 4;
    const dedupKey = `${refTime}|${latBucket.toFixed(2)}|${lngBucket.toFixed(2)}|${inchesBucket.toFixed(2)}`;
    try {
      await pool.query(
        `INSERT INTO bot_storm_alerts_sent
           (ref_time, lat_bucket, lng_bucket, max_inches_bucket, group_id, city, state, dedup_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (dedup_key) DO NOTHING`,
        [
          refTime,
          latBucket.toFixed(2),
          lngBucket.toFixed(2),
          inchesBucket.toFixed(2),
          targetGroupId,
          c.nearestCity?.name ?? null,
          c.nearestCity?.state ?? null,
          dedupKey,
        ],
      );
    } catch (e) {
      console.warn('[LiveMrmsAlert] persist err:', (e as Error).message);
    }
  }

  const targetLabel = approvalGate ? 'approval-gate' : (testMode ? 'test-group' : 'sales-team');
  console.log(`[LiveMrmsAlert] posted=${posted} new=${newCells.length} suppressed=${suppressed} target=${targetLabel} peak=${peakInches}"`);
  return {
    ran: true,
    cells_detected: features.length,
    cells_above_threshold: perCity.length,
    new_cells: newCells.length,
    cells_suppressed_duplicate: suppressed,
    posted,
    post_group_id: targetGroupId,
    cells: newCells,
    ref_time: refTime,
  };
}
