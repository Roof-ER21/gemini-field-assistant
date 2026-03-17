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
import { fetchNWSAlerts, extractHailSizeFromText, extractWindSpeedFromText } from './nwsAlertService.js';
// Track which NWS alert IDs we've already processed to avoid duplicates
const processedAlerts = new Set();
const MAX_PROCESSED_CACHE = 500;
export async function watchTerritoriesForStorms(pool) {
    let territoriesChecked = 0;
    let newAlerts = 0;
    let eventsCreated = 0;
    let errors = 0;
    try {
        // Get all active territories
        const territories = await pool.query(`SELECT id, name, owner_id,
              (north_lat + south_lat) / 2 AS center_lat,
              (east_lng + west_lng) / 2 AS center_lng,
              north_lat, south_lat, east_lng, west_lng
       FROM territories
       WHERE archived_at IS NULL
       LIMIT 50`);
        if (territories.rows.length === 0)
            return { territoriesChecked: 0, newAlerts: 0, eventsCreated: 0, errors: 0 };
        // Deduplicate territories that are close together (check center points within ~20 miles)
        const uniquePoints = [];
        for (const t of territories.rows) {
            const existing = uniquePoints.find(p => Math.abs(p.lat - t.center_lat) < 0.3 && Math.abs(p.lng - t.center_lng) < 0.4);
            if (existing) {
                existing.territories.push(t);
            }
            else {
                uniquePoints.push({ lat: t.center_lat, lng: t.center_lng, territories: [t] });
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
                    if (processedAlerts.has(alert.id))
                        continue;
                    processedAlerts.add(alert.id);
                    newAlerts++;
                    // Extract storm details from alert text
                    const hailSize = extractHailSizeFromText(alert.description);
                    const windSpeed = extractWindSpeedFromText(alert.description);
                    const hailInches = hailSize ? parseFloat(hailSize.replace('"', '')) : null;
                    const windMph = windSpeed ? parseInt(windSpeed.replace(' mph', ''), 10) : null;
                    // Determine event type
                    let eventType = 'severe_thunderstorm';
                    if (alert.event.toLowerCase().includes('tornado'))
                        eventType = 'tornado';
                    else if (hailInches && hailInches >= 1.0)
                        eventType = 'hail';
                    else if (windMph && windMph >= 58)
                        eventType = 'wind';
                    // Create storm_event for each territory at this point
                    for (const territory of point.territories) {
                        try {
                            // Check if we already have this event (by NWS alert ID + territory)
                            const existing = await pool.query(`SELECT id FROM storm_events
                 WHERE source_url = $1
                   AND latitude = $2 AND longitude = $3
                 LIMIT 1`, [alert.id, point.lat, point.lng]);
                            if (existing.rows.length > 0)
                                continue;
                            await pool.query(`INSERT INTO storm_events (
                  city, state, latitude, longitude,
                  event_date, event_type,
                  hail_size_inches, hail_size_description,
                  wind_speed_mph,
                  data_source, source_confidence, source_url,
                  source_metadata, discovered_by, notes, is_active
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, TRUE)`, [
                                alert.areaDesc?.split(';')[0]?.trim() || territory.name,
                                '', // state extracted from areaDesc if needed
                                point.lat,
                                point.lng,
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
                            ]);
                            eventsCreated++;
                        }
                        catch (err) {
                            console.error(`[NWSWatcher] Error creating storm event for territory ${territory.name}:`, err.message);
                            errors++;
                        }
                    }
                }
            }
            catch (err) {
                console.error(`[NWSWatcher] Error checking point ${point.lat},${point.lng}:`, err.message);
                errors++;
            }
        }
        // Prune old processed alert IDs
        if (processedAlerts.size > MAX_PROCESSED_CACHE) {
            const entries = Array.from(processedAlerts);
            entries.slice(0, entries.length - MAX_PROCESSED_CACHE / 2).forEach(id => processedAlerts.delete(id));
        }
        if (newAlerts > 0 || eventsCreated > 0) {
            console.log(`[NWSWatcher] Scan complete: ${territoriesChecked} territories, ${newAlerts} new alerts, ${eventsCreated} events created, ${errors} errors`);
        }
    }
    catch (err) {
        console.error('[NWSWatcher] Territory watch failed:', err);
        errors++;
    }
    return { territoriesChecked, newAlerts, eventsCreated, errors };
}
