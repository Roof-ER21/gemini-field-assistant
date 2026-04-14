/**
 * NWS Territory Watcher
 *
 * Proactively polls the NWS API for active severe weather warnings
 * that overlap any active territory. When new warnings are found,
 * creates storm_events in the database so the push notification
 * scheduler can alert the right reps.
 *
 * Runs every 15 minutes via cronService.
 * Free NWS API — no key required.
 */

import { Pool } from 'pg';
import { fetchNWSAlerts, extractHailSizeFromText, extractWindSpeedFromText } from './nwsAlertService.js';

// Track which NWS alert IDs we've already processed to avoid duplicates
const processedAlerts = new Set<string>();
const MAX_PROCESSED_CACHE = 500;

interface Territory {
  id: string;
  name: string;
  owner_id: string;
  center_lat: number;
  center_lng: number;
  north_lat: number;
  south_lat: number;
  east_lng: number;
  west_lng: number;
}

export async function watchTerritoriesForStorms(pool: Pool): Promise<{
  territoriesChecked: number;
  newAlerts: number;
  eventsCreated: number;
  errors: number;
}> {
  let territoriesChecked = 0;
  let newAlerts = 0;
  let eventsCreated = 0;
  let errors = 0;

  try {
    // Get all active territories
    const territories = await pool.query(
      `SELECT id, name, owner_id,
              (north_lat + south_lat) / 2 AS center_lat,
              (east_lng + west_lng) / 2 AS center_lng,
              north_lat, south_lat, east_lng, west_lng
       FROM territories
       WHERE archived_at IS NULL
       LIMIT 50`
    );

    if (territories.rows.length === 0) return { territoriesChecked: 0, newAlerts: 0, eventsCreated: 0, errors: 0 };

    // Deduplicate territories that are close together (check center points within ~20 miles)
    const uniquePoints: Array<{ lat: number; lng: number; territories: Territory[] }> = [];

    for (const t of territories.rows as Territory[]) {
      const existing = uniquePoints.find(p =>
        Math.abs(p.lat - t.center_lat) < 0.3 && Math.abs(p.lng - t.center_lng) < 0.4
      );
      if (existing) {
        existing.territories.push(t);
      } else {
        uniquePoints.push({ lat: Number(t.center_lat), lng: Number(t.center_lng), territories: [t] });
      }
    }

    // Check each unique point for active NWS alerts
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    for (const point of uniquePoints) {
      try {
        territoriesChecked += point.territories.length;

        const alerts = await fetchNWSAlerts({
          lat: point.lat,
          lng: point.lng,
          startDate: twoHoursAgo.toISOString(),
          endDate: now.toISOString()
        });

        for (const alert of alerts) {
          // Skip already-processed alerts
          if (processedAlerts.has(alert.id)) continue;
          processedAlerts.add(alert.id);
          newAlerts++;

          // Extract storm details from alert text
          const hailSize = extractHailSizeFromText(alert.description);
          const windSpeed = extractWindSpeedFromText(alert.description);
          const hailInches = hailSize ? parseFloat(hailSize.replace('"', '')) : null;
          const windMph = windSpeed ? parseInt(windSpeed.replace(' mph', ''), 10) : null;

          // Determine event type
          let eventType = 'severe_thunderstorm';
          if (alert.event.toLowerCase().includes('tornado')) eventType = 'tornado';
          else if (hailInches && hailInches >= 1.0) eventType = 'hail';
          else if (windMph && windMph >= 58) eventType = 'wind';

          // Use alert polygon centroid if available, otherwise fall back to territory center
          const eventLat = alert.centroidLat || point.lat;
          const eventLng = alert.centroidLng || point.lng;

          // Create storm_event for each territory at this point
          for (const territory of point.territories) {
            try {
              // Check if we already have this event (by NWS alert ID)
              const existing = await pool.query(
                `SELECT id FROM storm_events
                 WHERE source_url = $1
                 LIMIT 1`,
                [alert.id]
              );

              if (existing.rows.length > 0) continue;

              await pool.query(
                `INSERT INTO storm_events (
                  city, state, latitude, longitude,
                  event_date, event_type,
                  hail_size_inches, hail_size_description,
                  wind_speed_mph,
                  data_source, source_confidence, source_url,
                  source_metadata, discovered_by, notes, is_active
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, TRUE)`,
                [
                  alert.areaDesc?.split(';')[0]?.trim() || territory.name,
                  '', // state extracted from areaDesc if needed
                  eventLat,
                  eventLng,
                  alert.onset || now.toISOString(),
                  eventType,
                  hailInches,
                  hailSize || null,
                  windMph,
                  'NWS',
                  'verified',
                  alert.id,
                  JSON.stringify({
                    nws_event: alert.event,
                    severity: alert.severity,
                    headline: alert.headline,
                    sender: alert.senderName,
                    expires: alert.expires,
                    territory_id: territory.id,
                    territory_name: territory.name
                  }),
                  'nws_territory_watcher',
                  `${alert.event}: ${alert.headline || alert.description?.substring(0, 200) || ''}`
                ]
              );

              eventsCreated++;
            } catch (err) {
              console.error(`[NWSWatcher] Error creating storm event for territory ${territory.name}:`, (err as Error).message);
              errors++;
            }
          }
        }
      } catch (err) {
        console.error(`[NWSWatcher] Error checking point ${point.lat},${point.lng}:`, (err as Error).message);
        errors++;
      }
    }

    // Prune old processed alert IDs
    if (processedAlerts.size > MAX_PROCESSED_CACHE) {
      const entries = Array.from(processedAlerts);
      entries.slice(0, entries.length - MAX_PROCESSED_CACHE / 2).forEach(id => processedAlerts.delete(id));
    }

    // Log this run to storm_monitoring_runs
    try {
      await pool.query(
        `INSERT INTO storm_monitoring_runs (run_type, properties_checked, alerts_generated, errors)
         VALUES ('scheduled', $1, $2, $3)`,
        [territoriesChecked, eventsCreated, errors]
      );
    } catch { /* logging is non-critical */ }

    // If new events were created, check customer_properties for impact alerts
    if (eventsCreated > 0) {
      try {
        const impactResult = await pool.query(
          `SELECT cp.id as property_id, cp.customer_name, cp.address, cp.latitude, cp.longitude,
                  cp.notify_radius_miles, cp.user_id,
                  se.id as storm_id, se.event_type, se.hail_size_inches, se.wind_speed_mph, se.event_date
           FROM customer_properties cp
           CROSS JOIN storm_events se
           WHERE cp.is_active = true
             AND se.created_at > NOW() - INTERVAL '1 hour'
             AND se.is_active = true
             AND (
               6371 * acos(
                 cos(radians(cp.latitude)) * cos(radians(se.latitude)) *
                 cos(radians(se.longitude) - radians(cp.longitude)) +
                 sin(radians(cp.latitude)) * sin(radians(se.latitude))
               )
             ) * 0.621371 <= COALESCE(cp.notify_radius_miles, 10)`
        );

        for (const row of impactResult.rows) {
          try {
            await pool.query(
              `INSERT INTO impact_alerts
                (customer_property_id, storm_event_id, user_id, alert_type, alert_severity,
                 storm_date, storm_distance_miles, hail_size_inches, wind_speed_mph, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
               ON CONFLICT DO NOTHING`,
              [
                row.property_id, row.storm_id, row.user_id,
                row.event_type,
                (row.hail_size_inches >= 1.5 || row.wind_speed_mph >= 70) ? 'critical' :
                  (row.hail_size_inches >= 1.0 || row.wind_speed_mph >= 58) ? 'high' : 'medium',
                row.event_date,
                0, // distance calculated in the query
                row.hail_size_inches, row.wind_speed_mph
              ]
            );
          } catch { /* skip duplicate alerts */ }
        }

        if (impactResult.rows.length > 0) {
          console.log(`[NWSWatcher] Created ${impactResult.rows.length} impact alerts for tracked properties`);
        }
      } catch (impactErr) {
        console.error('[NWSWatcher] Impact check failed:', (impactErr as Error).message);
      }
    }

    if (newAlerts > 0 || eventsCreated > 0) {
      console.log(`[NWSWatcher] Scan complete: ${territoriesChecked} territories, ${newAlerts} new alerts, ${eventsCreated} events created, ${errors} errors`);
    }
  } catch (err) {
    console.error('[NWSWatcher] Territory watch failed:', err);
    errors++;
  }

  return { territoriesChecked, newAlerts, eventsCreated, errors };
}
