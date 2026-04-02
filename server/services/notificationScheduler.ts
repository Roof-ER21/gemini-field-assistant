/**
 * Notification Scheduler
 *
 * Server-side scheduled push notification triggers that run 24/7 on Railway.
 * Called by cronService.ts on fixed schedules.
 *
 * Triggers:
 * - Storm alerts: new storm events → push to reps with overlapping territories
 * - Calendar reminders: events starting soon → push reminder
 * - Task reminders: agent_tasks due soon → push reminder
 * - Morning briefing: daily push with tasks/leads/messages summary
 * - End-of-day summary: daily wrap-up push
 */

import { Pool } from 'pg';
import { PushNotificationService } from './pushNotificationService.js';

/**
 * Scan for new storm events and send push alerts to reps with overlapping territories.
 * Called every 15 minutes.
 */
export async function scanForNewStorms(
  pool: Pool,
  pushService: PushNotificationService
): Promise<{ alertsSent: number; errors: number }> {
  let alertsSent = 0;
  let errors = 0;

  try {
    // Find impact alerts that haven't been pushed yet
    const pendingAlerts = await pool.query(
      `SELECT ia.id, ia.user_id, ia.alert_type, ia.alert_severity,
              ia.storm_distance_miles, ia.hail_size_inches, ia.storm_date,
              se.city, se.state, se.event_type, se.latitude, se.longitude,
              cp.address, cp.customer_name
       FROM impact_alerts ia
       JOIN storm_events se ON se.id = ia.storm_event_id
       LEFT JOIN customer_properties cp ON cp.id = ia.customer_property_id
       WHERE ia.push_sent = FALSE
         AND ia.status = 'pending'
         AND ia.created_at > NOW() - INTERVAL '24 hours'
       ORDER BY ia.alert_severity DESC, ia.created_at ASC
       LIMIT 50`
    );

    if (pendingAlerts.rows.length === 0) return { alertsSent: 0, errors: 0 };

    console.log(`[NotificationScheduler] Found ${pendingAlerts.rows.length} pending storm alerts to push`);

    for (const alert of pendingAlerts.rows) {
      try {
        const hailInfo = alert.hail_size_inches ? ` (${alert.hail_size_inches}" hail)` : '';
        const distInfo = alert.storm_distance_miles
          ? ` — ${Number(alert.storm_distance_miles).toFixed(1)} mi away`
          : '';
        const customerInfo = alert.customer_name
          ? `${alert.customer_name} at ${alert.address || 'unknown address'}`
          : `Property near ${alert.city || 'your territory'}, ${alert.state || ''}`;

        const results = await pushService.sendToUser(
          alert.user_id,
          {
            title: `⚠️ ${alert.alert_severity === 'critical' ? 'CRITICAL' : 'Storm'} Alert — ${alert.city || 'Your Area'}, ${alert.state || ''}`,
            body: `${customerInfo} may be impacted by ${alert.event_type || 'storm'}${hailInfo}${distInfo}`,
            data: {
              type: 'impact_alert',
              alertId: alert.id,
              latitude: String(alert.latitude || ''),
              longitude: String(alert.longitude || ''),
              severity: alert.alert_severity || 'medium'
            }
          },
          'storm_alert'
        );

        const anySent = results.some(r => r.success);
        if (anySent) {
          await pool.query(
            `UPDATE impact_alerts SET push_sent = TRUE, push_sent_at = NOW() WHERE id = $1`,
            [alert.id]
          );
          alertsSent++;
        }
      } catch (err) {
        console.error(`[NotificationScheduler] Error pushing storm alert ${alert.id}:`, (err as Error).message);
        errors++;
      }
    }

    // Also check for new storm_events without impact_alerts — send territory-level alerts
    const newStorms = await pool.query(
      `SELECT se.id, se.city, se.state, se.event_type, se.hail_size_inches,
              se.wind_speed_mph, se.latitude, se.longitude, se.event_date
       FROM storm_events se
       WHERE se.created_at > NOW() - INTERVAL '30 minutes'
         AND se.is_active = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM impact_alerts ia WHERE ia.storm_event_id = se.id AND ia.push_sent = TRUE
         )
       LIMIT 20`
    );

    for (const storm of newStorms.rows) {
      try {
        // Find users whose territories overlap this storm
        const affectedUsers = await pool.query(
          `SELECT DISTINCT u.id AS user_id
           FROM territories t
           JOIN users u ON u.id = t.owner_id
           WHERE $1::numeric BETWEEN t.south_lat AND t.north_lat
             AND $2::numeric BETWEEN t.west_lng AND t.east_lng
             AND t.archived_at IS NULL
           UNION
           SELECT DISTINCT ta.user_id
           FROM territory_assignments ta
           JOIN territories t ON t.id = ta.territory_id
           WHERE $1::numeric BETWEEN t.south_lat AND t.north_lat
             AND $2::numeric BETWEEN t.west_lng AND t.east_lng
             AND t.archived_at IS NULL
             AND (ta.expires_at IS NULL OR ta.expires_at > NOW())`,
          [storm.latitude, storm.longitude]
        );

        if (affectedUsers.rows.length === 0) continue;

        const hailInfo = storm.hail_size_inches ? ` — ${storm.hail_size_inches}" hail` : '';
        const windInfo = storm.wind_speed_mph ? ` — ${storm.wind_speed_mph} mph winds` : '';

        const userIds = affectedUsers.rows.map(r => r.user_id);
        await pushService.sendStormAlert(userIds, {
          latitude: storm.latitude,
          longitude: storm.longitude,
          city: storm.city || 'Unknown',
          state: storm.state || '',
          eventType: storm.event_type || 'storm',
          hailSize: storm.hail_size_inches ? Number(storm.hail_size_inches) : undefined,
          windSpeed: storm.wind_speed_mph ? Number(storm.wind_speed_mph) : undefined
        }, storm.id);

        alertsSent += userIds.length;
      } catch (err) {
        console.error(`[NotificationScheduler] Error pushing territory storm alert:`, (err as Error).message);
        errors++;
      }
    }

    if (alertsSent > 0) {
      console.log(`[NotificationScheduler] Storm scan complete: ${alertsSent} alerts sent, ${errors} errors`);
    }
  } catch (err) {
    console.error('[NotificationScheduler] Storm scan failed:', err);
    errors++;
  }

  return { alertsSent, errors };
}

/**
 * Send reminders for upcoming calendar events (within next 30 minutes).
 * Called every 15 minutes.
 */
export async function sendCalendarReminders(
  pool: Pool,
  pushService: PushNotificationService
): Promise<{ remindersSent: number }> {
  let remindersSent = 0;

  try {
    // Check local calendar_events table for events starting in the next 30 minutes
    const upcoming = await pool.query(
      `SELECT ce.id, ce.user_id, ce.summary, ce.start_time, ce.end_time,
              ce.location, ce.event_type, ce.google_event_id
       FROM calendar_events ce
       WHERE ce.status = 'active'
         AND ce.start_time > NOW()
         AND ce.start_time <= NOW() + INTERVAL '30 minutes'
         AND NOT EXISTS (
           SELECT 1 FROM push_notification_log pnl
           WHERE pnl.user_id = ce.user_id
             AND pnl.notification_type = 'calendar_reminder'
             AND pnl.data->>'calendarEventId' = ce.id::text
             AND pnl.created_at > NOW() - INTERVAL '1 hour'
         )
       ORDER BY ce.start_time ASC
       LIMIT 30`
    );

    for (const event of upcoming.rows) {
      try {
        const startTime = new Date(event.start_time);
        const minutesUntil = Math.round((startTime.getTime() - Date.now()) / 60000);
        const timeStr = startTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'America/New_York'
        });

        const locationStr = event.location ? ` at ${event.location}` : '';

        const results = await pushService.sendToUser(
          event.user_id,
          {
            title: `📅 ${event.summary || 'Event'} in ${minutesUntil} min`,
            body: `Starting at ${timeStr}${locationStr}`,
            data: {
              type: 'calendar_reminder',
              calendarEventId: event.id,
              googleEventId: event.google_event_id || '',
              eventType: event.event_type || 'general'
            }
          },
          'calendar_reminder'
        );

        if (results.some(r => r.success)) remindersSent++;
      } catch (err) {
        console.error(`[NotificationScheduler] Calendar reminder error:`, (err as Error).message);
      }
    }

    if (remindersSent > 0) {
      console.log(`[NotificationScheduler] Sent ${remindersSent} calendar reminders`);
    }
  } catch (err) {
    console.error('[NotificationScheduler] Calendar reminders failed:', err);
  }

  return { remindersSent };
}

/**
 * Send reminders for agent tasks that are due soon.
 * Called every 15 minutes.
 */
export async function sendTaskReminders(
  pool: Pool,
  pushService: PushNotificationService
): Promise<{ remindersSent: number }> {
  let remindersSent = 0;

  try {
    const dueTasks = await pool.query(
      `SELECT at.id, at.user_id, at.title, at.description, at.due_at,
              at.priority, at.task_type, at.job_number
       FROM agent_tasks at
       WHERE at.status = 'pending'
         AND at.due_at <= NOW() + INTERVAL '15 minutes'
         AND at.due_at > NOW() - INTERVAL '1 hour'
         AND NOT EXISTS (
           SELECT 1 FROM push_notification_log pnl
           WHERE pnl.user_id = at.user_id
             AND pnl.notification_type = 'task_reminder'
             AND pnl.data->>'taskId' = at.id::text
             AND pnl.created_at > NOW() - INTERVAL '2 hours'
         )
       ORDER BY at.due_at ASC
       LIMIT 20`
    );

    for (const task of dueTasks.rows) {
      try {
        const dueTime = new Date(task.due_at);
        const timeStr = dueTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'America/New_York'
        });
        const jobInfo = task.job_number ? ` (Job #${task.job_number})` : '';
        const priorityEmoji = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';

        const results = await pushService.sendToUser(
          task.user_id,
          {
            title: `${priorityEmoji} Task Due: ${task.title}`,
            body: `Due at ${timeStr}${jobInfo}. ${task.description ? task.description.substring(0, 80) : ''}`,
            data: {
              type: 'task_reminder',
              taskId: task.id,
              taskType: task.task_type || 'followup',
              priority: task.priority || 'medium'
            }
          },
          'task_reminder'
        );

        if (results.some(r => r.success)) remindersSent++;
      } catch (err) {
        console.error(`[NotificationScheduler] Task reminder error:`, (err as Error).message);
      }
    }

    if (remindersSent > 0) {
      console.log(`[NotificationScheduler] Sent ${remindersSent} task reminders`);
    }
  } catch (err) {
    console.error('[NotificationScheduler] Task reminders failed:', err);
  }

  return { remindersSent };
}

/**
 * Send morning briefing push notification.
 * Called daily at 7 AM ET.
 */
export async function sendMorningBriefing(
  pool: Pool,
  pushService: PushNotificationService
): Promise<{ sent: number }> {
  let sent = 0;

  try {
    // Get all active users
    const users = await pool.query(
      `SELECT u.id, u.name, u.email
       FROM users u
       WHERE u.is_active = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM push_notification_log pnl
           WHERE pnl.user_id = u.id
             AND pnl.notification_type = 'morning_briefing'
             AND pnl.created_at > NOW() - INTERVAL '20 hours'
         )`
    );

    const today = new Date().toISOString().split('T')[0];

    for (const user of users.rows) {
      try {
        // Gather stats for this user
        const [taskCount, unreadCount, todayEvents] = await Promise.all([
          pool.query(
            `SELECT COUNT(*)::integer as count FROM agent_tasks
             WHERE user_id = $1 AND status = 'pending' AND due_at::date <= $2::date`,
            [user.id, today]
          ),
          pool.query(
            `SELECT COALESCE(SUM(
              (SELECT COUNT(*) FROM team_messages m
               WHERE m.conversation_id = cp.conversation_id
                 AND m.created_at > cp.last_read_at
                 AND m.sender_id != $1)
            ), 0)::integer as count
            FROM conversation_participants cp WHERE cp.user_id = $1`,
            [user.id]
          ),
          pool.query(
            `SELECT COUNT(*)::integer as count FROM calendar_events
             WHERE user_id = $1 AND status = 'active'
               AND start_time::date = $2::date`,
            [user.id, today]
          )
        ]);

        const tasks = taskCount.rows[0]?.count || 0;
        const messages = unreadCount.rows[0]?.count || 0;
        const events = todayEvents.rows[0]?.count || 0;

        const parts: string[] = [];
        if (tasks > 0) parts.push(`${tasks} task${tasks > 1 ? 's' : ''} due`);
        if (events > 0) parts.push(`${events} event${events > 1 ? 's' : ''}`);
        if (messages > 0) parts.push(`${messages} unread message${messages > 1 ? 's' : ''}`);

        const body = parts.length > 0
          ? `Today: ${parts.join(', ')}. Let's get after it!`
          : `No pending tasks. Great day to hit the field!`;

        const firstName = (user.name || 'Team').split(' ')[0];

        const results = await pushService.sendToUser(
          user.id,
          {
            title: `☀️ Good morning, ${firstName}!`,
            body,
            data: { type: 'morning_briefing' }
          },
          'morning_briefing'
        );

        if (results.some(r => r.success)) sent++;
      } catch (err) {
        console.error(`[NotificationScheduler] Morning briefing error for ${user.id}:`, (err as Error).message);
      }
    }

    if (sent > 0) {
      console.log(`[NotificationScheduler] Morning briefing sent to ${sent} users`);
    }
  } catch (err) {
    console.error('[NotificationScheduler] Morning briefing failed:', err);
  }

  return { sent };
}

/**
 * Send end-of-day summary push notification.
 * Called daily at 6 PM ET.
 */
export async function sendEndOfDaySummary(
  pool: Pool,
  pushService: PushNotificationService
): Promise<{ sent: number }> {
  let sent = 0;

  try {
    const users = await pool.query(
      `SELECT u.id, u.name
       FROM users u
       WHERE u.is_active = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM push_notification_log pnl
           WHERE pnl.user_id = u.id
             AND pnl.notification_type = 'eod_summary'
             AND pnl.created_at > NOW() - INTERVAL '20 hours'
         )`
    );

    const today = new Date().toISOString().split('T')[0];

    for (const user of users.rows) {
      try {
        // Count today's completed tasks
        const [completed, chatSessions] = await Promise.all([
          pool.query(
            `SELECT COUNT(*)::integer as count FROM agent_tasks
             WHERE user_id = $1 AND status = 'done' AND completed_at::date = $2::date`,
            [user.id, today]
          ),
          pool.query(
            `SELECT COUNT(*)::integer as count FROM user_activity_log
             WHERE user_id = $1 AND activity_type = 'chat' AND DATE(created_at) = $2::date`,
            [user.id, today]
          )
        ]);

        const completedTasks = completed.rows[0]?.count || 0;
        const chats = chatSessions.rows[0]?.count || 0;

        const parts: string[] = [];
        if (completedTasks > 0) parts.push(`${completedTasks} task${completedTasks > 1 ? 's' : ''} completed`);
        if (chats > 0) parts.push(`${chats} Susan chat${chats > 1 ? 's' : ''}`);

        const body = parts.length > 0
          ? `Today: ${parts.join(', ')}. Nice work! 💪`
          : `Quiet day. Tomorrow's a new opportunity!`;

        const firstName = (user.name || 'Team').split(' ')[0];

        const results = await pushService.sendToUser(
          user.id,
          {
            title: `🌙 Day wrap-up, ${firstName}`,
            body,
            data: { type: 'eod_summary' }
          },
          'eod_summary'
        );

        if (results.some(r => r.success)) sent++;
      } catch (err) {
        console.error(`[NotificationScheduler] EOD summary error for ${user.id}:`, (err as Error).message);
      }
    }

    if (sent > 0) {
      console.log(`[NotificationScheduler] End-of-day summary sent to ${sent} users`);
    }
  } catch (err) {
    console.error('[NotificationScheduler] EOD summary failed:', err);
  }

  return { sent };
}
