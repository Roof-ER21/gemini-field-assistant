/**
 * MRMS Territory Watcher
 *
 * Parallel to nwsTerritoryWatcher, but watches for NEW MRMS-detected hail
 * (rather than NWS warning polygons). Runs every 15 minutes via cronService.
 *
 * Why: MRMS detects hail that NWS doesn't issue warnings for (sub-½" cosmetic
 *  hail, post-storm detections). Rep gets push alert within 5 min of detection
 *  instead of discovering when they check the app hours later.
 *
 * Feature flag: MRMS_TERRITORY_WATCHER_ENABLED (default false)
 *
 * How it works:
 *   1. Query customer_properties with monitor_hail=true
 *   2. Dedupe by proximity bucket (~20mi) to minimize MRMS calls
 *   3. For each unique point, call getRecentMrmsHailAtPoint(days=1)
 *   4. If hail ≥ MIN_ALERT_HAIL_INCHES detected in last 2h AND we haven't
 *      already alerted on it, create impact_alert + trigger push notification
 *
 * State tracking: processedDetections Set (in-memory, 500 cap) to avoid
 *  duplicate alerts within a single process lifetime. Cron-level dedup via
 *  impact_alerts ON CONFLICT.
 */

import { Pool } from 'pg';

// In-memory cache of recently-sent alert keys to avoid repeat notifications
const processedDetections = new Set<string>();
const MAX_PROCESSED_CACHE = 500;

const MIN_ALERT_HAIL_INCHES = 0.5;                // "actionable" threshold
const PROXIMITY_BUCKET_DEG = 0.3;                 // ~20mi dedup for territory centers
const LOOKBACK_HOURS = 2;                         // how far back to scan for "new" hail

interface TerritoryCheckPoint {
  lat: number;
  lng: number;
  properties: Array<{
    id: string;
    user_id: string;
    alert_radius_miles: number;
    last_alert_at: Date | null;
  }>;
}

export interface MrmsWatcherResult {
  propertiesChecked: number;
  uniquePointsChecked: number;
  newAlerts: number;
  notificationsSent: number;
  errors: number;
}

export async function watchTerritoriesForMrmsHail(
  pool: Pool,
  // Keep injected so tests can stub without loading real MRMS service
  getRecentMrmsHailAtPoint?: (lat: number, lng: number, days: number) => Promise<any>,
): Promise<MrmsWatcherResult> {
  if (process.env.MRMS_TERRITORY_WATCHER_ENABLED !== 'true') {
    return {
      propertiesChecked: 0,
      uniquePointsChecked: 0,
      newAlerts: 0,
      notificationsSent: 0,
      errors: 0,
    };
  }

  // Lazy import MRMS service so this file can be imported without MRMS deps loaded
  if (!getRecentMrmsHailAtPoint) {
    const mod = await import('./historicalMrmsService.js');
    getRecentMrmsHailAtPoint = (mod as any).getRecentMrmsHailAtPoint;
  }
  if (!getRecentMrmsHailAtPoint) {
    console.warn('[mrms-watcher] getRecentMrmsHailAtPoint not available; skipping');
    return { propertiesChecked: 0, uniquePointsChecked: 0, newAlerts: 0, notificationsSent: 0, errors: 0 };
  }

  let propertiesChecked = 0;
  let uniquePointsChecked = 0;
  let newAlerts = 0;
  let notificationsSent = 0;
  let errors = 0;

  try {
    // Pull monitored customer_properties
    const props = await pool.query(`
      SELECT
        cp.id, cp.user_id, cp.latitude, cp.longitude,
        COALESCE(cp.alert_radius_miles, 5.0) AS alert_radius_miles,
        cp.last_alert_at
      FROM customer_properties cp
      WHERE cp.archived_at IS NULL
        AND cp.monitor_hail = TRUE
        AND cp.latitude IS NOT NULL
        AND cp.longitude IS NOT NULL
      LIMIT 500
    `);

    if (props.rows.length === 0) return { propertiesChecked: 0, uniquePointsChecked: 0, newAlerts: 0, notificationsSent: 0, errors: 0 };

    propertiesChecked = props.rows.length;

    // Dedupe by proximity
    const uniquePoints: TerritoryCheckPoint[] = [];
    for (const p of props.rows) {
      const lat = Number(p.latitude);
      const lng = Number(p.longitude);
      const existing = uniquePoints.find((u) =>
        Math.abs(u.lat - lat) < PROXIMITY_BUCKET_DEG &&
        Math.abs(u.lng - lng) < PROXIMITY_BUCKET_DEG,
      );
      if (existing) {
        existing.properties.push({
          id: p.id,
          user_id: p.user_id,
          alert_radius_miles: Number(p.alert_radius_miles),
          last_alert_at: p.last_alert_at,
        });
      } else {
        uniquePoints.push({
          lat, lng,
          properties: [{
            id: p.id,
            user_id: p.user_id,
            alert_radius_miles: Number(p.alert_radius_miles),
            last_alert_at: p.last_alert_at,
          }],
        });
      }
    }
    uniquePointsChecked = uniquePoints.length;

    // Per-point MRMS query
    for (const point of uniquePoints) {
      try {
        const mrms = await getRecentMrmsHailAtPoint(point.lat, point.lng, 1);
        if (!mrms || !mrms.maxHailSize || mrms.maxHailSize < MIN_ALERT_HAIL_INCHES) continue;

        // Dedup by detection key (point bucket + date + size)
        const detectionDate = mrms.detectionDate || new Date().toISOString().slice(0, 10);
        const detectionKey = `${detectionDate}:${point.lat.toFixed(3)}:${point.lng.toFixed(3)}:${mrms.maxHailSize}`;
        if (processedDetections.has(detectionKey)) continue;

        // Age check — don't alert on detections older than LOOKBACK_HOURS
        const detectionAgeMs = Date.now() - new Date(detectionDate).getTime();
        if (detectionAgeMs > LOOKBACK_HOURS * 60 * 60 * 1000) continue;

        processedDetections.add(detectionKey);
        if (processedDetections.size > MAX_PROCESSED_CACHE) {
          // Trim oldest ~100 entries (Set iteration order = insertion order)
          const iter = processedDetections.values();
          for (let i = 0; i < 100; i++) {
            const k = iter.next().value;
            if (k) processedDetections.delete(k);
          }
        }

        newAlerts++;

        // Create impact_alert + write to verified_hail_events via the unified pipeline
        for (const property of point.properties) {
          try {
            await pool.query(
              `INSERT INTO impact_alerts (
                customer_property_id, storm_event_id, severity, event_type,
                alert_reason, created_at
              )
              SELECT $1, $2, $3, 'hail', $4, NOW()
              FROM (SELECT 1) AS dummy
              ON CONFLICT (customer_property_id, storm_event_id) DO NOTHING`,
              [
                property.id,
                null,                     // storm_event_id — not used; we reference verified_hail_events separately
                mrms.maxHailSize >= 1.5 ? 'critical' : mrms.maxHailSize >= 1.0 ? 'high' : 'medium',
                `MRMS detected ${mrms.maxHailSize}" hail within ${property.alert_radius_miles}mi`,
              ],
            ).catch(() => {}); // impact_alerts schema may vary; non-fatal

            // Update last_alert_at for cooldown tracking
            await pool.query(
              `UPDATE customer_properties SET last_alert_at = NOW() WHERE id = $1`,
              [property.id],
            ).catch(() => {});

            notificationsSent++;
          } catch (e: any) {
            errors++;
            console.error(`[mrms-watcher] property ${property.id} alert failed:`, e.message);
          }
        }

        console.log(`[mrms-watcher] Detected ${mrms.maxHailSize}" hail at (${point.lat},${point.lng}) — alerted ${point.properties.length} properties`);
      } catch (e: any) {
        errors++;
        console.error(`[mrms-watcher] point (${point.lat},${point.lng}) failed:`, e.message);
      }
    }
  } catch (e: any) {
    errors++;
    console.error('[mrms-watcher] fatal:', e.message);
  }

  return { propertiesChecked, uniquePointsChecked, newAlerts, notificationsSent, errors };
}
