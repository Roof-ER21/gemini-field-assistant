/**
 * Storm Alert Service
 *
 * Monitors SPC data for new hail/severe weather in VA/MD/PA territory.
 * Sends push notifications to ALL reps in 3 phases:
 * 1. IMMEDIATE: New hail detected — size, location, time, get moving
 * 2. NEXT DAY: Follow-up with additional details, homeowner count estimates
 * 3. NOAA UPDATE: When full NOAA data arrives, comprehensive update
 */
const SERVICE_STATES = ['VA', 'MD', 'PA'];
export async function detectAndAlertNewStorms(pool, pushService) {
    let newAlerts = 0;
    let followups = 0;
    let errors = 0;
    try {
        // Step 1: Fetch SPC recent reports filtered to our service territory
        const spcEvents = await fetchSPCForStates(SERVICE_STATES);
        if (spcEvents.length === 0)
            return { newAlerts: 0, followups: 0, errors: 0 };
        // Step 2: Check which events are new (not already in storm_alerts)
        for (const event of spcEvents) {
            try {
                // Check if already alerted
                const existing = await pool.query('SELECT id FROM storm_alerts WHERE spc_event_id = $1', [event.id]);
                if (existing.rows.length > 0)
                    continue; // Already tracked
                // Insert new alert
                await pool.query(`INSERT INTO storm_alerts (spc_event_id, event_type, event_date, event_time, magnitude, magnitude_unit, location, county, state, latitude, longitude, narrative)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (spc_event_id) DO NOTHING`, [event.id, event.eventType, event.date, event.time, event.magnitude, event.magnitudeUnit, event.location, event.county, event.state, event.latitude, event.longitude, event.narrative]);
                // Get ALL active rep user IDs
                const users = await pool.query("SELECT id FROM users WHERE role IN ('sales_rep', 'manager', 'admin')");
                const userIds = users.rows.map((u) => u.id);
                if (userIds.length === 0)
                    continue;
                // Build alert message
                const hailInfo = event.eventType === 'hail' && event.magnitude
                    ? `${event.magnitude}" hail`
                    : event.eventType === 'wind' && event.magnitude
                        ? `${event.magnitude} kt wind`
                        : event.eventType;
                const timeInfo = event.time ? ` at ${event.time}` : '';
                // Send push notification to ALL reps
                await pushService.sendStormAlert(userIds, {
                    latitude: event.latitude,
                    longitude: event.longitude,
                    city: event.location,
                    state: event.state,
                    eventType: event.eventType,
                    hailSize: event.eventType === 'hail' ? (event.magnitude ?? undefined) : undefined,
                    windSpeed: event.eventType === 'wind' ? (event.magnitude ?? undefined) : undefined,
                }, event.id);
                // Mark as sent
                await pool.query(`UPDATE storm_alerts SET initial_alert_sent = TRUE, initial_alert_sent_at = NOW(), alert_phase = 'initial_sent' WHERE spc_event_id = $1`, [event.id]);
                // Also create an in-app notification for every user
                for (const userId of userIds) {
                    await pool.query(`INSERT INTO notifications (user_id, type, title, body, data, created_at)
             VALUES ($1, 'storm_alert', $2, $3, $4, NOW())
             ON CONFLICT DO NOTHING`, [
                        userId,
                        `⚠️ ${hailInfo} — ${event.location}, ${event.state}`,
                        `${hailInfo} reported${timeInfo} near ${event.location}, ${event.county}, ${event.state}. ${event.narrative || 'Get to the area ASAP for inspections.'}`,
                        JSON.stringify({ type: 'storm_alert', spc_event_id: event.id, lat: event.latitude, lng: event.longitude, eventType: event.eventType })
                    ]).catch(() => { }); // notifications table may not exist yet
                }
                newAlerts++;
                console.log(`[StormAlert] 🚨 NEW: ${hailInfo} at ${event.location}, ${event.state} → notified ${userIds.length} reps`);
            }
            catch (e) {
                errors++;
                console.error(`[StormAlert] Error processing event ${event.id}:`, e);
            }
        }
        // Step 3: Send follow-ups for yesterday's alerts that haven't had follow-up
        try {
            const pendingFollowups = await pool.query(`SELECT * FROM storm_alerts
         WHERE initial_alert_sent = TRUE
           AND followup_sent = FALSE
           AND event_date < CURRENT_DATE
           AND event_date >= CURRENT_DATE - INTERVAL '2 days'`);
            if (pendingFollowups.rows.length > 0) {
                // Group by date + state for consolidated follow-up
                const groups = new Map();
                for (const alert of pendingFollowups.rows) {
                    const key = `${alert.event_date}-${alert.state}`;
                    if (!groups.has(key))
                        groups.set(key, []);
                    groups.get(key).push(alert);
                }
                const users = await pool.query("SELECT id FROM users WHERE role IN ('sales_rep', 'manager', 'admin')");
                const userIds = users.rows.map((u) => u.id);
                for (const [_key, alerts] of groups) {
                    const hailAlerts = alerts.filter((a) => a.event_type === 'hail');
                    const windAlerts = alerts.filter((a) => a.event_type === 'wind');
                    const state = alerts[0].state;
                    const date = new Date(alerts[0].event_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    const maxHail = hailAlerts.length > 0 ? Math.max(...hailAlerts.map((a) => Number(a.magnitude) || 0)) : 0;
                    const locations = [...new Set(alerts.map((a) => a.location))].slice(0, 3).join(', ');
                    let body = `${date} storm update for ${state}:\n`;
                    if (hailAlerts.length > 0)
                        body += `• ${hailAlerts.length} hail report(s), up to ${maxHail}" — ${locations}\n`;
                    if (windAlerts.length > 0)
                        body += `• ${windAlerts.length} wind report(s)\n`;
                    body += `Time to knock doors and schedule inspections!`;
                    for (const userId of userIds) {
                        await pushService.sendToUser(userId, {
                            title: `📋 Storm Follow-Up — ${state} ${date}`,
                            body,
                            data: { type: 'storm_followup', state, date: alerts[0].event_date }
                        }, 'storm_alert').catch(() => { });
                    }
                    // Mark all as followed up
                    for (const alert of alerts) {
                        await pool.query(`UPDATE storm_alerts SET followup_sent = TRUE, followup_sent_at = NOW(), alert_phase = 'followup_sent' WHERE id = $1`, [alert.id]);
                    }
                    followups++;
                    console.log(`[StormAlert] 📋 Follow-up: ${alerts.length} events in ${state} ${date} → ${userIds.length} reps`);
                }
            }
        }
        catch (e) {
            console.error('[StormAlert] Follow-up error:', e);
            errors++;
        }
    }
    catch (error) {
        console.error('[StormAlert] Detection error:', error);
        errors++;
    }
    return { newAlerts, followups, errors };
}
/**
 * Fetch SPC today + yesterday reports filtered to our service states.
 * Parses the raw SPC CSV feeds for hail and wind events.
 */
async function fetchSPCForStates(states) {
    const events = [];
    const stateSet = new Set(states.map(s => s.toUpperCase()));
    for (const prefix of ['today', 'yesterday']) {
        for (const type of ['hail', 'wind']) {
            try {
                const url = `https://www.spc.noaa.gov/climo/reports/${prefix}_${type}.csv`;
                const response = await fetch(url);
                if (!response.ok)
                    continue;
                const text = await response.text();
                const lines = text.trim().split('\n').slice(1); // Skip header
                const dateObj = prefix === 'today' ? new Date() : new Date(Date.now() - 86400000);
                const dateStr = dateObj.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
                for (const line of lines) {
                    const parts = line.split(',');
                    if (parts.length < 8)
                        continue;
                    const [time, magnitude, location, county, state, lat, lon, ...commentParts] = parts;
                    if (!stateSet.has(state?.trim().toUpperCase()))
                        continue;
                    const parsedLat = parseFloat(lat);
                    const parsedLon = parseFloat(lon);
                    if (isNaN(parsedLat) || isNaN(parsedLon))
                        continue;
                    const mag = parseFloat(magnitude);
                    const hailInches = type === 'hail' ? mag / 100 : null; // SPC reports hail in hundredths of inches
                    const windKts = type === 'wind' ? mag : null;
                    const hh = time.slice(0, 2);
                    const mm = time.slice(2, 4);
                    events.push({
                        id: `spc-${type}-${dateStr}-${time}-${parsedLat}-${parsedLon}`,
                        eventType: type,
                        date: dateStr,
                        time: `${hh}:${mm} UTC`,
                        magnitude: type === 'hail' ? hailInches : windKts,
                        magnitudeUnit: type === 'hail' ? 'inches' : 'kts',
                        location: location?.trim() || '',
                        county: county?.trim() || '',
                        state: state?.trim() || '',
                        latitude: parsedLat,
                        longitude: parsedLon,
                        narrative: commentParts.join(',').replace(/^\(.*?\)\s*/, '').trim() || '',
                    });
                }
            }
            catch (e) {
                console.warn(`[StormAlert] SPC ${prefix}_${type} fetch error:`, e);
            }
        }
    }
    return events;
}
