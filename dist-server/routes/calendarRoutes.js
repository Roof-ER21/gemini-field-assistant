/**
 * Calendar Routes
 * CRUD for local calendar events + Google Calendar integration.
 */
import { Router } from 'express';
import { listCalendarEvents } from '../services/googleCalendarService.js';
import { getGoogleStatus } from '../services/googleTokenService.js';
export function createCalendarRoutes(pool) {
    const router = Router();
    async function getUserId(req) {
        const email = req.headers['x-user-email'];
        if (!email)
            return null;
        const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        return result.rows[0]?.id || null;
    }
    // GET /status — calendar connection status
    router.get('/status', async (req, res) => {
        try {
            const userId = await getUserId(req);
            if (!userId)
                return res.status(401).json({ error: 'Not authenticated' });
            const googleStatus = await getGoogleStatus(pool, userId);
            const localCount = await pool.query(`SELECT COUNT(*)::int AS count FROM calendar_events WHERE user_id = $1 AND status = 'active'`, [userId]);
            res.json({
                google_connected: googleStatus.connected,
                google_email: googleStatus.google_email,
                local_event_count: localCount.rows[0]?.count || 0,
            });
        }
        catch (err) {
            console.error('[Calendar] Status error:', err);
            res.status(500).json({ error: 'Failed to check calendar status' });
        }
    });
    // GET /events — fetch events for a date range (merges Google + local)
    router.get('/events', async (req, res) => {
        try {
            const userId = await getUserId(req);
            if (!userId)
                return res.status(401).json({ error: 'Not authenticated' });
            const start = req.query.start || new Date().toISOString();
            const end = req.query.end || new Date(Date.now() + 30 * 86400000).toISOString();
            const source = req.query.source || 'all';
            const events = [];
            // Fetch Google Calendar events if connected
            if (source !== 'local') {
                const googleResult = await listCalendarEvents(pool, userId, {
                    timeMin: start,
                    timeMax: end,
                });
                if (googleResult.success && googleResult.events) {
                    events.push(...googleResult.events);
                }
            }
            // Fetch local events
            if (source !== 'google') {
                const localResult = await pool.query(`SELECT * FROM calendar_events
           WHERE user_id = $1 AND status = 'active'
             AND start_time >= $2 AND start_time <= $3
           ORDER BY start_time`, [userId, start, end]);
                for (const row of localResult.rows) {
                    // Skip local events that are synced to Google (avoid duplicates)
                    if (row.google_event_id && events.some(e => e.id === row.google_event_id))
                        continue;
                    events.push({
                        id: row.id,
                        summary: row.summary,
                        description: row.description,
                        location: row.location,
                        start_time: row.start_time,
                        end_time: row.end_time,
                        all_day: row.all_day,
                        event_type: row.event_type,
                        color: row.color,
                        attendees: row.attendees,
                        source: 'local',
                    });
                }
            }
            // Sort merged events by start_time
            events.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
            res.json({ events });
        }
        catch (err) {
            console.error('[Calendar] Events error:', err);
            res.status(500).json({ error: 'Failed to fetch events' });
        }
    });
    // GET /upcoming — simplified list for Susan context
    router.get('/upcoming', async (req, res) => {
        try {
            const userId = await getUserId(req);
            if (!userId)
                return res.status(401).json({ error: 'Not authenticated' });
            const now = new Date().toISOString();
            const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString();
            const events = [];
            // Google events
            const googleResult = await listCalendarEvents(pool, userId, {
                timeMin: now,
                timeMax: weekFromNow,
                maxResults: 15,
            });
            if (googleResult.success && googleResult.events) {
                events.push(...googleResult.events);
            }
            // Local events
            const localResult = await pool.query(`SELECT * FROM calendar_events
         WHERE user_id = $1 AND status = 'active'
           AND start_time >= $2 AND start_time <= $3
         ORDER BY start_time LIMIT 15`, [userId, now, weekFromNow]);
            for (const row of localResult.rows) {
                if (row.google_event_id && events.some(e => e.id === row.google_event_id))
                    continue;
                events.push({
                    id: row.id,
                    summary: row.summary,
                    location: row.location,
                    start_time: row.start_time,
                    end_time: row.end_time,
                    event_type: row.event_type,
                    source: 'local',
                });
            }
            events.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
            res.json({ events: events.slice(0, 15) });
        }
        catch (err) {
            console.error('[Calendar] Upcoming error:', err);
            res.status(500).json({ error: 'Failed to fetch upcoming events' });
        }
    });
    // POST /events — create local event
    router.post('/events', async (req, res) => {
        try {
            const userId = await getUserId(req);
            if (!userId)
                return res.status(401).json({ error: 'Not authenticated' });
            const { summary, description, location, start_time, end_time, all_day, event_type, attendees, color } = req.body;
            if (!summary || !start_time || !end_time) {
                return res.status(400).json({ error: 'summary, start_time, and end_time are required' });
            }
            const result = await pool.query(`INSERT INTO calendar_events (user_id, summary, description, location, start_time, end_time, all_day, event_type, attendees, color)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`, [userId, summary, description || null, location || null, start_time, end_time, all_day || false,
                event_type || 'general', JSON.stringify(attendees || []), color || '#3b82f6']);
            const event = result.rows[0];
            // Push notification confirming event creation
            const pushService = req.app.get('pushNotificationService');
            if (pushService) {
                const startDate = new Date(start_time);
                const timeStr = startDate.toLocaleString('en-US', {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    timeZone: 'America/New_York'
                });
                pushService.sendToUser(userId, {
                    title: `📅 Event Created: ${summary}`,
                    body: `${timeStr}${location ? ` at ${location}` : ''}`,
                    data: { type: 'calendar_reminder', calendarEventId: event.id, eventType: event_type || 'general' }
                }, 'calendar_reminder').catch((e) => console.error('Calendar push error:', e.message));
            }
            res.json({ event: { ...event, source: 'local' } });
        }
        catch (err) {
            console.error('[Calendar] Create error:', err);
            res.status(500).json({ error: 'Failed to create event' });
        }
    });
    // PUT /events/:id — update local event
    router.put('/events/:id', async (req, res) => {
        try {
            const userId = await getUserId(req);
            if (!userId)
                return res.status(401).json({ error: 'Not authenticated' });
            const { summary, description, location, start_time, end_time, all_day, event_type, attendees, color, status } = req.body;
            const result = await pool.query(`UPDATE calendar_events
         SET summary = COALESCE($3, summary),
             description = COALESCE($4, description),
             location = COALESCE($5, location),
             start_time = COALESCE($6, start_time),
             end_time = COALESCE($7, end_time),
             all_day = COALESCE($8, all_day),
             event_type = COALESCE($9, event_type),
             attendees = COALESCE($10, attendees),
             color = COALESCE($11, color),
             status = COALESCE($12, status),
             updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING *`, [req.params.id, userId, summary, description, location, start_time, end_time,
                all_day, event_type, attendees ? JSON.stringify(attendees) : null, color, status]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Event not found' });
            }
            res.json({ event: { ...result.rows[0], source: 'local' } });
        }
        catch (err) {
            console.error('[Calendar] Update error:', err);
            res.status(500).json({ error: 'Failed to update event' });
        }
    });
    // DELETE /events/:id — soft delete local event
    router.delete('/events/:id', async (req, res) => {
        try {
            const userId = await getUserId(req);
            if (!userId)
                return res.status(401).json({ error: 'Not authenticated' });
            const result = await pool.query(`UPDATE calendar_events SET status = 'cancelled', updated_at = NOW()
         WHERE id = $1 AND user_id = $2 RETURNING id`, [req.params.id, userId]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Event not found' });
            }
            res.json({ success: true });
        }
        catch (err) {
            console.error('[Calendar] Delete error:', err);
            res.status(500).json({ error: 'Failed to delete event' });
        }
    });
    return router;
}
