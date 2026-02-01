/**
 * Check-In Service
 *
 * Tracks sales rep check-ins and check-outs for territory management.
 * Enables real-time tracking of field activities with location and session statistics.
 */
export class CheckinService {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    /**
     * Start a new check-in session
     */
    async startCheckin(userId, lat, lng, note) {
        // Check if user already has an active session
        const existingSession = await this.getUserActiveSession(userId);
        if (existingSession) {
            throw new Error('User already has an active check-in session. Please check out first.');
        }
        // Insert new check-in
        const result = await this.pool.query(`INSERT INTO territory_checkins (
        user_id, check_in_lat, check_in_lng, notes, check_in_time
      ) VALUES ($1, $2, $3, $4, NOW())
      RETURNING *`, [userId, lat, lng, note || null]);
        return this.rowToSession(result.rows[0]);
    }
    /**
     * End a check-in session
     */
    async endCheckin(checkinId, userId, stats, endLat, endLng, note) {
        // Verify the session belongs to the user
        const session = await this.pool.query('SELECT * FROM territory_checkins WHERE id = $1 AND user_id = $2', [checkinId, userId]);
        if (session.rows.length === 0) {
            throw new Error('Check-in session not found or does not belong to user');
        }
        if (session.rows[0].check_out_time) {
            throw new Error('Check-in session already ended');
        }
        // Update the session with check-out data
        const result = await this.pool.query(`UPDATE territory_checkins
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
      RETURNING *`, [
            endLat,
            endLng,
            stats.doorsKnocked,
            stats.contactsMade,
            stats.leadsGenerated,
            stats.appointmentsSet,
            note || null,
            checkinId
        ]);
        return this.rowToSession(result.rows[0]);
    }
    /**
     * Get all active check-ins (company-wide)
     */
    async getActiveCheckins() {
        const result = await this.pool.query(`SELECT
        tc.*,
        u.name as user_name,
        u.email as user_email
      FROM territory_checkins tc
      JOIN users u ON tc.user_id = u.id
      WHERE tc.check_out_time IS NULL
      ORDER BY tc.check_in_time DESC`);
        return result.rows.map(row => ({
            ...this.rowToSession(row),
            userName: row.user_name,
            userEmail: row.user_email
        }));
    }
    /**
     * Get a user's active check-in session (if any)
     */
    async getUserActiveSession(userId) {
        const result = await this.pool.query(`SELECT * FROM territory_checkins
      WHERE user_id = $1 AND check_out_time IS NULL
      ORDER BY check_in_time DESC
      LIMIT 1`, [userId]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.rowToSession(result.rows[0]);
    }
    /**
     * Get check-in history for a user
     */
    async getUserCheckinHistory(userId, limit = 50) {
        const result = await this.pool.query(`SELECT * FROM territory_checkins
      WHERE user_id = $1
      ORDER BY check_in_time DESC
      LIMIT $2`, [userId, limit]);
        return result.rows.map(this.rowToSession);
    }
    /**
     * Get check-in statistics for a user
     */
    async getUserCheckinStats(userId, daysBack = 30) {
        const result = await this.pool.query(`SELECT
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
      AND check_out_time IS NOT NULL`, [userId, daysBack]);
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
    rowToSession(row) {
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
export const createCheckinService = (pool) => {
    return new CheckinService(pool);
};
