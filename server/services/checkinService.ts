/**
 * Check-In Service
 *
 * Tracks sales rep check-ins and check-outs for territory management.
 * Enables real-time tracking of field activities with location and session statistics.
 */

import { Pool } from 'pg';
import { getPresenceService } from './presenceService.js';
import { createCheckinNotificationService } from './checkinNotificationService.js';

export interface CheckinSession {
  id: string;
  territoryId?: string;
  userId: string;
  checkInTime: string;
  checkOutTime?: string;
  checkInLat?: number;
  checkInLng?: number;
  checkOutLat?: number;
  checkOutLng?: number;
  doorsKnocked: number;
  contactsMade: number;
  leadsGenerated: number;
  appointmentsSet: number;
  notes?: string;
}

export interface CheckinSessionWithUser extends CheckinSession {
  userName: string;
  userEmail: string;
}

export interface CheckinStats {
  doorsKnocked: number;
  contactsMade: number;
  leadsGenerated: number;
  appointmentsSet: number;
}

export class CheckinService {
  constructor(private pool: Pool) {}

  /**
   * Start a new check-in session
   */
  async startCheckin(
    userId: string,
    lat: number,
    lng: number,
    note?: string
  ): Promise<CheckinSession> {
    // Check if user already has an active session
    const existingSession = await this.getUserActiveSession(userId);
    if (existingSession) {
      throw new Error('User already has an active check-in session. Please check out first.');
    }

    // Insert new check-in
    const result = await this.pool.query(
      `INSERT INTO territory_checkins (
        user_id, check_in_lat, check_in_lng, notes, check_in_time
      ) VALUES ($1, $2, $3, $4, NOW())
      RETURNING *`,
      [userId, lat, lng, note || null]
    );

    const session = this.rowToSession(result.rows[0]);

    // Get user details for broadcast and notifications
    try {
      const userResult = await this.pool.query(
        'SELECT name, email FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length > 0) {
        const { name, email } = userResult.rows[0];

        // Broadcast check-in event to all connected clients
        const presence = getPresenceService();
        if (presence) {
          presence.broadcastToAll({
            type: 'checkin_start',
            data: {
              ...session,
              userName: name,
              userEmail: email
            }
          });
        }

        // Send push notifications to team members
        // Only send if we have valid location data
        if (session.checkInLat && session.checkInLng) {
          const notificationService = createCheckinNotificationService(this.pool);
          notificationService.notifyTeamOfCheckin({
            checkinId: session.id,
            userId: session.userId,
            userName: name,
            checkInLat: session.checkInLat,
            checkInLng: session.checkInLng,
            note: note
          }).catch(error => {
            console.error('[CheckinService] Error sending check-in notifications:', error);
            // Don't throw - the check-in was successful even if notifications failed
          });
        }
      }
    } catch (error) {
      console.error('[CheckinService] Error broadcasting check-in start:', error);
      // Don't throw - the check-in was successful even if broadcast failed
    }

    return session;
  }

  /**
   * End a check-in session
   */
  async endCheckin(
    checkinId: string,
    userId: string,
    stats: CheckinStats,
    endLat: number,
    endLng: number,
    note?: string
  ): Promise<CheckinSession> {
    // Verify the session belongs to the user
    const session = await this.pool.query(
      'SELECT * FROM territory_checkins WHERE id = $1 AND user_id = $2',
      [checkinId, userId]
    );

    if (session.rows.length === 0) {
      throw new Error('Check-in session not found or does not belong to user');
    }

    if (session.rows[0].check_out_time) {
      throw new Error('Check-in session already ended');
    }

    // Update the session with check-out data
    const result = await this.pool.query(
      `UPDATE territory_checkins
      SET
        check_out_time = NOW(),
        check_out_lat = $1,
        check_out_lng = $2,
        doors_knocked = $3,
        contacts_made = $4,
        leads_generated = $5,
        appointments_set = $6,
        notes = CASE
          WHEN $7::text IS NOT NULL THEN COALESCE(notes || ' | ', '') || $7::text
          ELSE notes
        END
      WHERE id = $8
      RETURNING *`,
      [
        endLat,
        endLng,
        stats.doorsKnocked,
        stats.contactsMade,
        stats.leadsGenerated,
        stats.appointmentsSet,
        note || null,
        checkinId
      ]
    );

    const updatedSession = this.rowToSession(result.rows[0]);

    // Broadcast check-out event to all connected clients
    try {
      const presence = getPresenceService();
      if (presence) {
        presence.broadcastToAll({
          type: 'checkin_end',
          data: updatedSession
        });
      }
    } catch (error) {
      console.error('[CheckinService] Error broadcasting check-out:', error);
      // Don't throw - the check-out was successful even if broadcast failed
    }

    return updatedSession;
  }

  /**
   * Get all active check-ins (company-wide)
   */
  async getActiveCheckins(): Promise<CheckinSessionWithUser[]> {
    const result = await this.pool.query(
      `SELECT
        tc.*,
        u.name as user_name,
        u.email as user_email
      FROM territory_checkins tc
      JOIN users u ON tc.user_id = u.id
      WHERE tc.check_out_time IS NULL
      ORDER BY tc.check_in_time DESC`
    );

    return result.rows.map(row => ({
      ...this.rowToSession(row),
      userName: row.user_name,
      userEmail: row.user_email
    }));
  }

  /**
   * Get a user's active check-in session (if any)
   */
  async getUserActiveSession(userId: string): Promise<CheckinSession | null> {
    const result = await this.pool.query(
      `SELECT * FROM territory_checkins
      WHERE user_id = $1 AND check_out_time IS NULL
      ORDER BY check_in_time DESC
      LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToSession(result.rows[0]);
  }

  /**
   * Get check-in history for a user
   */
  async getUserCheckinHistory(
    userId: string,
    limit: number = 50
  ): Promise<CheckinSession[]> {
    const result = await this.pool.query(
      `SELECT * FROM territory_checkins
      WHERE user_id = $1
      ORDER BY check_in_time DESC
      LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map(this.rowToSession);
  }

  /**
   * Get check-in statistics for a user
   */
  async getUserCheckinStats(userId: string, daysBack: number = 30): Promise<{
    totalSessions: number;
    totalDoors: number;
    totalContacts: number;
    totalLeads: number;
    totalAppointments: number;
    avgDoorsPerSession: number;
    avgDuration: number; // in minutes
  }> {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) as total_sessions,
        COALESCE(SUM(doors_knocked), 0) as total_doors,
        COALESCE(SUM(contacts_made), 0) as total_contacts,
        COALESCE(SUM(leads_generated), 0) as total_leads,
        COALESCE(SUM(appointments_set), 0) as total_appointments,
        COALESCE(
          AVG(doors_knocked) FILTER (WHERE doors_knocked > 0),
          0
        ) as avg_doors,
        COALESCE(
          AVG(EXTRACT(EPOCH FROM (check_out_time - check_in_time)) / 60)
          FILTER (WHERE check_out_time IS NOT NULL),
          0
        ) as avg_duration_minutes
      FROM territory_checkins
      WHERE user_id = $1
      AND check_in_time >= NOW() - ($2 * INTERVAL '1 day')
      AND check_out_time IS NOT NULL`,
      [userId, daysBack]
    );

    const row = result.rows[0];
    return {
      totalSessions: parseInt(row.total_sessions) || 0,
      totalDoors: parseInt(row.total_doors) || 0,
      totalContacts: parseInt(row.total_contacts) || 0,
      totalLeads: parseInt(row.total_leads) || 0,
      totalAppointments: parseInt(row.total_appointments) || 0,
      avgDoorsPerSession: parseFloat(row.avg_doors) || 0,
      avgDuration: parseFloat(row.avg_duration_minutes) || 0
    };
  }

  /**
   * Convert database row to CheckinSession object
   */
  private rowToSession(row: any): CheckinSession {
    return {
      id: row.id,
      territoryId: row.territory_id || undefined,
      userId: row.user_id,
      checkInTime: row.check_in_time,
      checkOutTime: row.check_out_time || undefined,
      checkInLat: row.check_in_lat ? parseFloat(row.check_in_lat) : undefined,
      checkInLng: row.check_in_lng ? parseFloat(row.check_in_lng) : undefined,
      checkOutLat: row.check_out_lat ? parseFloat(row.check_out_lat) : undefined,
      checkOutLng: row.check_out_lng ? parseFloat(row.check_out_lng) : undefined,
      doorsKnocked: row.doors_knocked || 0,
      contactsMade: row.contacts_made || 0,
      leadsGenerated: row.leads_generated || 0,
      appointmentsSet: row.appointments_set || 0,
      notes: row.notes || undefined
    };
  }
}

/**
 * Create a check-in service instance
 */
export const createCheckinService = (pool: Pool): CheckinService => {
  return new CheckinService(pool);
};
