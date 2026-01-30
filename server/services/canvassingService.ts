/**
 * Canvassing Service
 *
 * Tracks door-to-door canvassing status for sales reps.
 * Enables teams to:
 * - Mark addresses as contacted, no answer, lead, etc.
 * - Track return visits and follow-ups
 * - Monitor rep activity and performance
 * - Coordinate canvassing sessions
 */

import { Pool } from 'pg';

export type CanvassingStatus =
  | 'not_contacted'
  | 'contacted'
  | 'no_answer'
  | 'return_visit'
  | 'not_interested'
  | 'interested'
  | 'lead'
  | 'appointment_set'
  | 'sold'
  | 'customer';

export interface CanvassingEntry {
  id: string;
  address: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  status: CanvassingStatus;
  contactedBy?: string;
  contactDate?: string;
  contactMethod?: string;
  homeownerName?: string;
  phoneNumber?: string;
  email?: string;
  notes?: string;
  followUpDate?: string;
  followUpNotes?: string;
  attemptCount: number;
  lastAttemptDate?: string;
  relatedStormEventId?: string;
  territory?: string;
  // Neighborhood Intel fields
  homeownerPhone?: string;
  homeownerEmail?: string;
  propertyNotes?: string;
  bestContactTime?: string;
  propertyType?: string;
  roofType?: string;
  roofAgeYears?: number;
  autoMonitor?: boolean;
  linkedPropertyId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CanvassingSession {
  id: string;
  userId: string;
  sessionDate: string;
  startTime: string;
  endTime?: string;
  targetCity?: string;
  targetState?: string;
  targetZipCode?: string;
  targetTerritory?: string;
  stormEventId?: string;
  doorsKnocked: number;
  contactsMade: number;
  leadsGenerated: number;
  appointmentsSet: number;
  status: 'active' | 'paused' | 'completed';
  notes?: string;
  createdAt: string;
}

export interface CanvassingStats {
  totalDoors: number;
  totalContacts: number;
  totalLeads: number;
  totalAppointments: number;
  conversionRate: number;
  avgDoorsPerSession: number;
}

export class CanvassingService {
  constructor(private pool: Pool) {}

  /**
   * Mark an address with a canvassing status
   */
  async markAddress(params: {
    address: string;
    status: CanvassingStatus;
    userId: string;
    streetAddress?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    latitude?: number;
    longitude?: number;
    contactMethod?: string;
    homeownerName?: string;
    phoneNumber?: string;
    email?: string;
    notes?: string;
    followUpDate?: string;
    followUpNotes?: string;
    relatedStormEventId?: string;
    territory?: string;
    sessionId?: string;
    // Neighborhood Intel fields
    homeownerPhone?: string;
    homeownerEmail?: string;
    propertyNotes?: string;
    bestContactTime?: string;
    propertyType?: string;
    roofType?: string;
    roofAgeYears?: number;
    autoMonitor?: boolean;
    linkedPropertyId?: string;
  }): Promise<CanvassingEntry> {
    const {
      address,
      status,
      userId,
      streetAddress,
      city,
      state,
      zipCode,
      latitude,
      longitude,
      contactMethod,
      homeownerName,
      phoneNumber,
      email,
      notes,
      followUpDate,
      followUpNotes,
      relatedStormEventId,
      territory,
      sessionId,
      // Neighborhood Intel fields
      homeownerPhone,
      homeownerEmail,
      propertyNotes,
      bestContactTime,
      propertyType,
      roofType,
      roofAgeYears,
      autoMonitor,
      linkedPropertyId
    } = params;

    // Upsert the canvassing status
    const result = await this.pool.query(
      `INSERT INTO canvassing_status (
        address, status, contacted_by, contact_date, contact_method,
        street_address, city, state, zip_code, latitude, longitude,
        homeowner_name, phone_number, email, notes,
        follow_up_date, follow_up_notes, related_storm_event_id, territory,
        homeowner_phone, homeowner_email, property_notes, best_contact_time,
        property_type, roof_type, roof_age_years, auto_monitor, linked_property_id
      ) VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
      ON CONFLICT (address, team_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        contacted_by = EXCLUDED.contacted_by,
        contact_date = NOW(),
        contact_method = EXCLUDED.contact_method,
        homeowner_name = COALESCE(EXCLUDED.homeowner_name, canvassing_status.homeowner_name),
        phone_number = COALESCE(EXCLUDED.phone_number, canvassing_status.phone_number),
        email = COALESCE(EXCLUDED.email, canvassing_status.email),
        notes = COALESCE(EXCLUDED.notes, canvassing_status.notes),
        follow_up_date = COALESCE(EXCLUDED.follow_up_date, canvassing_status.follow_up_date),
        follow_up_notes = COALESCE(EXCLUDED.follow_up_notes, canvassing_status.follow_up_notes),
        homeowner_phone = COALESCE(EXCLUDED.homeowner_phone, canvassing_status.homeowner_phone),
        homeowner_email = COALESCE(EXCLUDED.homeowner_email, canvassing_status.homeowner_email),
        property_notes = COALESCE(EXCLUDED.property_notes, canvassing_status.property_notes),
        best_contact_time = COALESCE(EXCLUDED.best_contact_time, canvassing_status.best_contact_time),
        property_type = COALESCE(EXCLUDED.property_type, canvassing_status.property_type),
        roof_type = COALESCE(EXCLUDED.roof_type, canvassing_status.roof_type),
        roof_age_years = COALESCE(EXCLUDED.roof_age_years, canvassing_status.roof_age_years),
        auto_monitor = COALESCE(EXCLUDED.auto_monitor, canvassing_status.auto_monitor),
        linked_property_id = COALESCE(EXCLUDED.linked_property_id, canvassing_status.linked_property_id),
        updated_at = NOW()
      RETURNING *`,
      [
        address,
        status,
        userId,
        contactMethod || 'door_knock',
        streetAddress || null,
        city || null,
        state || null,
        zipCode || null,
        latitude || null,
        longitude || null,
        homeownerName || null,
        phoneNumber || null,
        email || null,
        notes || null,
        followUpDate || null,
        followUpNotes || null,
        relatedStormEventId || null,
        territory || null,
        // Neighborhood Intel fields
        homeownerPhone || null,
        homeownerEmail || null,
        propertyNotes || null,
        bestContactTime || null,
        propertyType || null,
        roofType || null,
        roofAgeYears || null,
        autoMonitor !== undefined ? autoMonitor : true,
        linkedPropertyId || null
      ]
    );

    const entry = this.rowToEntry(result.rows[0]);

    // Log the activity
    await this.logActivity({
      canvassingStatusId: entry.id,
      sessionId,
      userId,
      actionType: 'status_change',
      newStatus: status,
      latitude,
      longitude,
      notes
    });

    return entry;
  }

  /**
   * Get canvassing status for an address
   */
  async getAddressStatus(address: string): Promise<CanvassingEntry | null> {
    const result = await this.pool.query(
      'SELECT * FROM canvassing_status WHERE address = $1',
      [address]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToEntry(result.rows[0]);
  }

  /**
   * Get all canvassing entries in an area
   */
  async getAreaCanvassing(params: {
    city?: string;
    state?: string;
    zipCode?: string;
    territory?: string;
    status?: CanvassingStatus;
    userId?: string;
    limit?: number;
  }): Promise<CanvassingEntry[]> {
    const { city, state, zipCode, territory, status, userId, limit = 500 } = params;

    let query = 'SELECT * FROM canvassing_status WHERE 1=1';
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (city) {
      query += ` AND LOWER(city) = LOWER($${paramIndex})`;
      queryParams.push(city);
      paramIndex++;
    }

    if (state) {
      query += ` AND LOWER(state) = LOWER($${paramIndex})`;
      queryParams.push(state);
      paramIndex++;
    }

    if (zipCode) {
      query += ` AND zip_code = $${paramIndex}`;
      queryParams.push(zipCode);
      paramIndex++;
    }

    if (territory) {
      query += ` AND territory = $${paramIndex}`;
      queryParams.push(territory);
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      queryParams.push(status);
      paramIndex++;
    }

    if (userId) {
      query += ` AND contacted_by = $${paramIndex}`;
      queryParams.push(userId);
      paramIndex++;
    }

    query += ` ORDER BY updated_at DESC LIMIT $${paramIndex}`;
    queryParams.push(limit);

    const result = await this.pool.query(query, queryParams);
    return result.rows.map(this.rowToEntry);
  }

  /**
   * Get addresses within radius of coordinates
   */
  async getNearbyCanvassing(
    latitude: number,
    longitude: number,
    radiusMiles: number = 1
  ): Promise<CanvassingEntry[]> {
    const result = await this.pool.query(
      `SELECT
        *,
        calculate_distance_miles($1, $2, latitude, longitude) as distance_miles
      FROM canvassing_status
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL
      AND calculate_distance_miles($1, $2, latitude, longitude) <= $3
      ORDER BY distance_miles ASC`,
      [latitude, longitude, radiusMiles]
    );

    return result.rows.map(this.rowToEntry);
  }

  /**
   * Get addresses needing follow-up
   */
  async getFollowUpList(userId?: string, territory?: string): Promise<CanvassingEntry[]> {
    let query = `
      SELECT * FROM canvassing_status
      WHERE follow_up_date <= CURRENT_DATE
      AND status IN ('return_visit', 'interested', 'lead')
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (userId) {
      query += ` AND contacted_by = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (territory) {
      query += ` AND territory = $${paramIndex}`;
      params.push(territory);
    }

    query += ' ORDER BY follow_up_date ASC';

    const result = await this.pool.query(query, params);
    return result.rows.map(this.rowToEntry);
  }

  // ============================================================================
  // CANVASSING SESSIONS
  // ============================================================================

  /**
   * Start a canvassing session
   */
  async startSession(params: {
    userId: string;
    targetCity?: string;
    targetState?: string;
    targetZipCode?: string;
    targetTerritory?: string;
    stormEventId?: string;
    notes?: string;
  }): Promise<CanvassingSession> {
    const result = await this.pool.query(
      `INSERT INTO canvassing_sessions (
        user_id, target_city, target_state, target_zip_code,
        target_territory, storm_event_id, notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
      RETURNING *`,
      [
        params.userId,
        params.targetCity || null,
        params.targetState || null,
        params.targetZipCode || null,
        params.targetTerritory || null,
        params.stormEventId || null,
        params.notes || null
      ]
    );

    return this.rowToSession(result.rows[0]);
  }

  /**
   * End a canvassing session
   */
  async endSession(sessionId: string): Promise<CanvassingSession | null> {
    const result = await this.pool.query(
      `UPDATE canvassing_sessions
      SET status = 'completed', end_time = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToSession(result.rows[0]);
  }

  /**
   * Get active session for a user
   */
  async getActiveSession(userId: string): Promise<CanvassingSession | null> {
    const result = await this.pool.query(
      `SELECT * FROM canvassing_sessions
      WHERE user_id = $1 AND status = 'active'
      ORDER BY start_time DESC
      LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToSession(result.rows[0]);
  }

  /**
   * Get session history for a user
   */
  async getSessionHistory(
    userId: string,
    limit: number = 50
  ): Promise<CanvassingSession[]> {
    const result = await this.pool.query(
      `SELECT * FROM canvassing_sessions
      WHERE user_id = $1
      ORDER BY session_date DESC, start_time DESC
      LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map(this.rowToSession);
  }

  // ============================================================================
  // ACTIVITY LOGGING
  // ============================================================================

  /**
   * Log a canvassing activity
   */
  private async logActivity(params: {
    canvassingStatusId?: string;
    sessionId?: string;
    userId: string;
    actionType: string;
    previousStatus?: string;
    newStatus?: string;
    latitude?: number;
    longitude?: number;
    notes?: string;
  }): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO canvassing_activity_log (
          canvassing_status_id, session_id, user_id, action_type,
          previous_status, new_status, latitude, longitude, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          params.canvassingStatusId || null,
          params.sessionId || null,
          params.userId,
          params.actionType,
          params.previousStatus || null,
          params.newStatus || null,
          params.latitude || null,
          params.longitude || null,
          params.notes || null
        ]
      );
    } catch (error) {
      console.error('Error logging canvassing activity:', error);
    }
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get canvassing stats for a user
   */
  async getUserStats(userId: string, daysBack: number = 30): Promise<CanvassingStats> {
    const result = await this.pool.query(
      `SELECT * FROM get_user_canvassing_stats($1, $2)`,
      [userId, daysBack]
    );

    const row = result.rows[0];

    return {
      totalDoors: parseInt(row.total_doors) || 0,
      totalContacts: parseInt(row.total_contacts) || 0,
      totalLeads: parseInt(row.total_leads) || 0,
      totalAppointments: parseInt(row.total_appointments) || 0,
      conversionRate: parseFloat(row.conversion_rate) || 0,
      avgDoorsPerSession: parseFloat(row.avg_doors_per_session) || 0
    };
  }

  /**
   * Get team canvassing stats
   */
  async getTeamStats(daysBack: number = 30): Promise<{
    byUser: Array<{ userId: string; userName: string; stats: CanvassingStats }>;
    total: CanvassingStats;
  }> {
    const result = await this.pool.query(
      `SELECT
        cs.user_id,
        u.name as user_name,
        SUM(cs.doors_knocked) as total_doors,
        SUM(cs.contacts_made) as total_contacts,
        SUM(cs.leads_generated) as total_leads,
        SUM(cs.appointments_set) as total_appointments
      FROM canvassing_sessions cs
      JOIN users u ON cs.user_id = u.id
      WHERE cs.session_date >= CURRENT_DATE - $1
      GROUP BY cs.user_id, u.name
      ORDER BY total_leads DESC`,
      [daysBack]
    );

    const byUser = result.rows.map(row => ({
      userId: row.user_id,
      userName: row.user_name,
      stats: {
        totalDoors: parseInt(row.total_doors) || 0,
        totalContacts: parseInt(row.total_contacts) || 0,
        totalLeads: parseInt(row.total_leads) || 0,
        totalAppointments: parseInt(row.total_appointments) || 0,
        conversionRate:
          row.total_doors > 0
            ? (parseFloat(row.total_leads) / parseFloat(row.total_doors)) * 100
            : 0,
        avgDoorsPerSession: 0 // Would need additional query
      }
    }));

    // Calculate totals
    const total = byUser.reduce(
      (acc, user) => ({
        totalDoors: acc.totalDoors + user.stats.totalDoors,
        totalContacts: acc.totalContacts + user.stats.totalContacts,
        totalLeads: acc.totalLeads + user.stats.totalLeads,
        totalAppointments: acc.totalAppointments + user.stats.totalAppointments,
        conversionRate: 0,
        avgDoorsPerSession: 0
      }),
      {
        totalDoors: 0,
        totalContacts: 0,
        totalLeads: 0,
        totalAppointments: 0,
        conversionRate: 0,
        avgDoorsPerSession: 0
      }
    );

    total.conversionRate =
      total.totalDoors > 0 ? (total.totalLeads / total.totalDoors) * 100 : 0;

    return { byUser, total };
  }

  /**
   * Get heatmap data for canvassing success by area
   */
  async getHeatmapData(): Promise<
    Array<{
      state: string;
      city: string;
      zipCode: string;
      totalAddresses: number;
      leads: number;
      appointments: number;
      sales: number;
      successRate: number;
    }>
  > {
    const result = await this.pool.query('SELECT * FROM canvassing_heatmap');

    return result.rows.map(row => ({
      state: row.state,
      city: row.city,
      zipCode: row.zip_code,
      totalAddresses: parseInt(row.total_addresses),
      leads: parseInt(row.leads),
      appointments: parseInt(row.appointments),
      sales: parseInt(row.sales),
      successRate: parseFloat(row.success_rate)
    }));
  }

  // ============================================================================
  // NEIGHBORHOOD INTEL
  // ============================================================================

  /**
   * Get neighborhood intelligence for an area
   */
  async getNeighborhoodIntel(
    latitude: number,
    longitude: number,
    radiusMiles: number = 0.5
  ): Promise<Array<{
    address: string;
    status: string;
    homeownerName?: string;
    homeownerPhone?: string;
    homeownerEmail?: string;
    propertyNotes?: string;
    bestContactTime?: string;
    propertyType?: string;
    roofType?: string;
    roofAgeYears?: number;
    contactedBy?: string;
    contactDate?: string;
    distanceMiles: number;
  }>> {
    const result = await this.pool.query(
      `SELECT * FROM get_neighborhood_intel($1, $2, $3)`,
      [latitude, longitude, radiusMiles]
    );

    return result.rows.map(row => ({
      address: row.address,
      status: row.status,
      homeownerName: row.homeowner_name || undefined,
      homeownerPhone: row.homeowner_phone || undefined,
      homeownerEmail: row.homeowner_email || undefined,
      propertyNotes: row.property_notes || undefined,
      bestContactTime: row.best_contact_time || undefined,
      propertyType: row.property_type || undefined,
      roofType: row.roof_type || undefined,
      roofAgeYears: row.roof_age_years || undefined,
      contactedBy: row.contacted_by || undefined,
      contactDate: row.contact_date || undefined,
      distanceMiles: parseFloat(row.distance_miles)
    }));
  }

  /**
   * Get team-wide neighborhood intel statistics
   */
  async getTeamIntelStats(): Promise<{
    totalTrackedProperties: number;
    propertiesWithIntel: number;
    avgRoofAge: number;
    commonRoofTypes: Array<{ roofType: string; count: number }>;
    statusBreakdown: Array<{ status: string; count: number }>;
  }> {
    const statsResult = await this.pool.query(`
      SELECT
        COUNT(*) as total_tracked,
        COUNT(CASE WHEN homeowner_name IS NOT NULL THEN 1 END) as with_intel,
        ROUND(AVG(roof_age_years), 1) as avg_roof_age
      FROM canvassing_status
      WHERE status NOT IN ('not_contacted', 'no_answer')
    `);

    const roofTypesResult = await this.pool.query(`
      SELECT roof_type, COUNT(*) as count
      FROM canvassing_status
      WHERE roof_type IS NOT NULL
      GROUP BY roof_type
      ORDER BY count DESC
      LIMIT 10
    `);

    const statusResult = await this.pool.query(`
      SELECT status, COUNT(*) as count
      FROM canvassing_status
      GROUP BY status
      ORDER BY count DESC
    `);

    const stats = statsResult.rows[0];

    return {
      totalTrackedProperties: parseInt(stats.total_tracked) || 0,
      propertiesWithIntel: parseInt(stats.with_intel) || 0,
      avgRoofAge: parseFloat(stats.avg_roof_age) || 0,
      commonRoofTypes: roofTypesResult.rows.map(row => ({
        roofType: row.roof_type,
        count: parseInt(row.count)
      })),
      statusBreakdown: statusResult.rows.map(row => ({
        status: row.status,
        count: parseInt(row.count)
      }))
    };
  }

  // ============================================================================
  // BULK OPERATIONS
  // ============================================================================

  /**
   * Bulk update canvassing statuses
   */
  async bulkUpdateStatus(
    ids: string[],
    status: CanvassingStatus,
    userId: string
  ): Promise<number> {
    const result = await this.pool.query(
      `UPDATE canvassing_status
      SET status = $1, contacted_by = $2, contact_date = NOW(), updated_at = NOW()
      WHERE id = ANY($3)`,
      [status, userId, ids]
    );

    return result.rowCount || 0;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private rowToEntry(row: any): CanvassingEntry {
    return {
      id: row.id,
      address: row.address,
      streetAddress: row.street_address || undefined,
      city: row.city || undefined,
      state: row.state || undefined,
      zipCode: row.zip_code || undefined,
      latitude: row.latitude ? parseFloat(row.latitude) : undefined,
      longitude: row.longitude ? parseFloat(row.longitude) : undefined,
      status: row.status,
      contactedBy: row.contacted_by || undefined,
      contactDate: row.contact_date || undefined,
      contactMethod: row.contact_method || undefined,
      homeownerName: row.homeowner_name || undefined,
      phoneNumber: row.phone_number || undefined,
      email: row.email || undefined,
      notes: row.notes || undefined,
      followUpDate: row.follow_up_date || undefined,
      followUpNotes: row.follow_up_notes || undefined,
      attemptCount: row.attempt_count || 1,
      lastAttemptDate: row.last_attempt_date || undefined,
      relatedStormEventId: row.related_storm_event_id || undefined,
      territory: row.territory || undefined,
      // Neighborhood Intel fields
      homeownerPhone: row.homeowner_phone || undefined,
      homeownerEmail: row.homeowner_email || undefined,
      propertyNotes: row.property_notes || undefined,
      bestContactTime: row.best_contact_time || undefined,
      propertyType: row.property_type || undefined,
      roofType: row.roof_type || undefined,
      roofAgeYears: row.roof_age_years || undefined,
      autoMonitor: row.auto_monitor !== undefined ? row.auto_monitor : undefined,
      linkedPropertyId: row.linked_property_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private rowToSession(row: any): CanvassingSession {
    return {
      id: row.id,
      userId: row.user_id,
      sessionDate: row.session_date,
      startTime: row.start_time,
      endTime: row.end_time || undefined,
      targetCity: row.target_city || undefined,
      targetState: row.target_state || undefined,
      targetZipCode: row.target_zip_code || undefined,
      targetTerritory: row.target_territory || undefined,
      stormEventId: row.storm_event_id || undefined,
      doorsKnocked: row.doors_knocked || 0,
      contactsMade: row.contacts_made || 0,
      leadsGenerated: row.leads_generated || 0,
      appointmentsSet: row.appointments_set || 0,
      status: row.status,
      notes: row.notes || undefined,
      createdAt: row.created_at
    };
  }
}

/**
 * Create a canvassing service instance
 */
export const createCanvassingService = (pool: Pool): CanvassingService => {
  return new CanvassingService(pool);
};
