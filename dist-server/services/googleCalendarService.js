/**
 * Google Calendar Service
 * Create events and check availability via the rep's connected Google Calendar.
 */
import { google } from 'googleapis';
import { getValidOAuth2Client } from './googleTokenService.js';
export async function createCalendarEvent(pool, userId, params) {
    const auth = await getValidOAuth2Client(pool, userId);
    if (!auth) {
        return { success: false, error: 'Google account not connected. Connect in Profile settings.' };
    }
    const calendar = google.calendar({ version: 'v3', auth });
    const tz = params.timeZone || 'America/New_York';
    // Default end time = start + 1 hour
    let endTime = params.endTime;
    if (!endTime) {
        const start = new Date(params.startTime);
        start.setHours(start.getHours() + 1);
        endTime = start.toISOString();
    }
    try {
        const event = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: {
                summary: params.summary,
                description: params.description,
                location: params.location,
                start: {
                    dateTime: params.startTime,
                    timeZone: tz,
                },
                end: {
                    dateTime: endTime,
                    timeZone: tz,
                },
                attendees: params.attendeeEmails?.map(email => ({ email })),
            },
        });
        console.log(`[GoogleCalendar] Created event=${event.data.id} for user=${userId}`);
        return {
            success: true,
            eventId: event.data.id || undefined,
            htmlLink: event.data.htmlLink || undefined,
        };
    }
    catch (err) {
        console.error('[GoogleCalendar] Create event error:', err);
        return { success: false, error: err.message };
    }
}
export async function listCalendarEvents(pool, userId, params) {
    const auth = await getValidOAuth2Client(pool, userId);
    if (!auth) {
        return { success: false, error: 'Google account not connected.' };
    }
    const calendar = google.calendar({ version: 'v3', auth });
    const tz = params.timeZone || 'America/New_York';
    try {
        const res = await calendar.events.list({
            calendarId: 'primary',
            timeMin: params.timeMin,
            timeMax: params.timeMax,
            timeZone: tz,
            maxResults: params.maxResults || 100,
            singleEvents: true,
            orderBy: 'startTime',
        });
        const events = (res.data.items || []).map(e => ({
            id: e.id || '',
            summary: e.summary || '(No title)',
            description: e.description || undefined,
            location: e.location || undefined,
            start_time: e.start?.dateTime || e.start?.date || '',
            end_time: e.end?.dateTime || e.end?.date || '',
            all_day: !e.start?.dateTime,
            html_link: e.htmlLink || undefined,
            attendees: e.attendees?.map(a => ({ email: a.email || '', name: a.displayName || undefined })),
            source: 'google',
        }));
        return { success: true, events };
    }
    catch (err) {
        console.error('[GoogleCalendar] List events error:', err);
        return { success: false, error: err.message };
    }
}
export async function checkAvailability(pool, userId, params) {
    const auth = await getValidOAuth2Client(pool, userId);
    if (!auth) {
        return { success: false, busy: false, error: 'Google account not connected. Connect in Profile settings.' };
    }
    const calendar = google.calendar({ version: 'v3', auth });
    const tz = params.timeZone || 'America/New_York';
    try {
        const freebusy = await calendar.freebusy.query({
            requestBody: {
                timeMin: params.startTime,
                timeMax: params.endTime,
                timeZone: tz,
                items: [{ id: 'primary' }],
            },
        });
        const busySlots = freebusy.data.calendars?.primary?.busy || [];
        return {
            success: true,
            busy: busySlots.length > 0,
            busySlots: busySlots.map(s => ({
                start: s.start || '',
                end: s.end || '',
            })),
        };
    }
    catch (err) {
        console.error('[GoogleCalendar] Freebusy error:', err);
        return { success: false, busy: false, error: err.message };
    }
}
