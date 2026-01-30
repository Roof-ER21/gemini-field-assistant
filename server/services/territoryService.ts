/**
 * Territory Management Service
 * Handles territory CRUD, assignments, and stats tracking
 */

import { Pool } from 'pg';

export interface Territory {
  id: string;
  name: string;
  description?: string;
  color: string;
  ownerId?: string;
  ownerName?: string;
  isShared: boolean;
  // Bounding box
  northLat?: number;
  southLat?: number;
  eastLng?: number;
  westLng?: number;
  centerLat?: number;
  centerLng?: number;
  stats: {
    totalAddresses: number;
    addressesCanvassed: number;
    totalLeads: number;
    totalAppointments: number;
    totalSales: number;
    revenueGenerated: number;
    coveragePercent: number;
    leadRate: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface TerritoryCheckIn {
  id: string;
  territoryId: string;
  userId: string;
  checkInTime: Date;
  checkOutTime?: Date;
  checkInLat?: number;
  checkInLng?: number;
  doorsKnocked: number;
  contactsMade: number;
  leadsGenerated: number;
  appointmentsSet: number;
  notes?: string;
}

export interface CreateTerritoryInput {
  name: string;
  description?: string;
  color?: string;
  ownerId: string;
  // Bounding box
  northLat?: number;
  southLat?: number;
  eastLng?: number;
  westLng?: number;
  centerLat?: number;
  centerLng?: number;
}

export interface TerritoryActivity {
  territoryId: string;
  userId: string;
  activityType: 'canvass' | 'lead' | 'appointment' | 'sale' | 'check_in' | 'check_out';
  latitude?: number;
  longitude?: number;
  address?: string;
  details?: Record<string, unknown>;
  revenueAmount?: number;
}

export function createTerritoryService(pool: Pool) {
  /**
   * Get all territories for a user (owned or assigned)
   */
  async function getUserTerritories(userId: string): Promise<Territory[]> {
    const result = await pool.query(
      `SELECT
        t.id,
        t.name,
        t.description,
        t.color,
        t.owner_id,
        u.name as owner_name,
        t.is_shared,
        t.north_lat,
        t.south_lat,
        t.east_lng,
        t.west_lng,
        t.center_lat,
        t.center_lng,
        t.total_addresses,
        t.addresses_canvassed,
        t.total_leads,
        t.total_appointments,
        t.total_sales,
        t.revenue_generated,
        t.created_at,
        t.updated_at,
        COALESCE(ta.role, 'owner') as user_role
      FROM territories t
      LEFT JOIN users u ON t.owner_id = u.id
      LEFT JOIN territory_assignments ta ON t.id = ta.territory_id AND ta.user_id = $1
      WHERE t.archived_at IS NULL
      AND (t.owner_id = $1 OR ta.user_id = $1)
      ORDER BY t.name`,
      [userId]
    );

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      color: row.color,
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      isShared: row.is_shared,
      northLat: parseFloat(row.north_lat) || undefined,
      southLat: parseFloat(row.south_lat) || undefined,
      eastLng: parseFloat(row.east_lng) || undefined,
      westLng: parseFloat(row.west_lng) || undefined,
      centerLat: parseFloat(row.center_lat) || undefined,
      centerLng: parseFloat(row.center_lng) || undefined,
      stats: {
        totalAddresses: parseInt(row.total_addresses) || 0,
        addressesCanvassed: parseInt(row.addresses_canvassed) || 0,
        totalLeads: parseInt(row.total_leads) || 0,
        totalAppointments: parseInt(row.total_appointments) || 0,
        totalSales: parseInt(row.total_sales) || 0,
        revenueGenerated: parseFloat(row.revenue_generated) || 0,
        coveragePercent: row.total_addresses > 0
          ? Math.round((row.addresses_canvassed / row.total_addresses) * 100 * 10) / 10
          : 0,
        leadRate: row.addresses_canvassed > 0
          ? Math.round((row.total_leads / row.addresses_canvassed) * 100 * 10) / 10
          : 0,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Get a single territory by ID
   */
  async function getTerritoryById(territoryId: string): Promise<Territory | null> {
    const result = await pool.query(
      `SELECT
        t.id,
        t.name,
        t.description,
        t.color,
        t.owner_id,
        u.name as owner_name,
        t.is_shared,
        t.north_lat,
        t.south_lat,
        t.east_lng,
        t.west_lng,
        t.center_lat,
        t.center_lng,
        t.total_addresses,
        t.addresses_canvassed,
        t.total_leads,
        t.total_appointments,
        t.total_sales,
        t.revenue_generated,
        t.created_at,
        t.updated_at
      FROM territories t
      LEFT JOIN users u ON t.owner_id = u.id
      WHERE t.id = $1 AND t.archived_at IS NULL`,
      [territoryId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      color: row.color,
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      isShared: row.is_shared,
      northLat: parseFloat(row.north_lat) || undefined,
      southLat: parseFloat(row.south_lat) || undefined,
      eastLng: parseFloat(row.east_lng) || undefined,
      westLng: parseFloat(row.west_lng) || undefined,
      centerLat: parseFloat(row.center_lat) || undefined,
      centerLng: parseFloat(row.center_lng) || undefined,
      stats: {
        totalAddresses: parseInt(row.total_addresses) || 0,
        addressesCanvassed: parseInt(row.addresses_canvassed) || 0,
        totalLeads: parseInt(row.total_leads) || 0,
        totalAppointments: parseInt(row.total_appointments) || 0,
        totalSales: parseInt(row.total_sales) || 0,
        revenueGenerated: parseFloat(row.revenue_generated) || 0,
        coveragePercent: row.total_addresses > 0
          ? Math.round((row.addresses_canvassed / row.total_addresses) * 100 * 10) / 10
          : 0,
        leadRate: row.addresses_canvassed > 0
          ? Math.round((row.total_leads / row.addresses_canvassed) * 100 * 10) / 10
          : 0,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Create a new territory
   */
  async function createTerritory(input: CreateTerritoryInput): Promise<Territory> {
    const result = await pool.query(
      `INSERT INTO territories (
        name, description, color, owner_id, north_lat, south_lat, east_lng, west_lng, center_lat, center_lng
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      ) RETURNING id`,
      [
        input.name,
        input.description || null,
        input.color || '#dc2626',
        input.ownerId,
        input.northLat || null,
        input.southLat || null,
        input.eastLng || null,
        input.westLng || null,
        input.centerLat || null,
        input.centerLng || null,
      ]
    );

    const territory = await getTerritoryById(result.rows[0].id);
    return territory!;
  }

  /**
   * Update a territory
   */
  async function updateTerritory(
    territoryId: string,
    updates: Partial<CreateTerritoryInput>
  ): Promise<Territory | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(updates.description);
    }
    if (updates.color !== undefined) {
      fields.push(`color = $${paramCount++}`);
      values.push(updates.color);
    }
    if (updates.northLat !== undefined) {
      fields.push(`north_lat = $${paramCount++}`);
      values.push(updates.northLat);
    }
    if (updates.southLat !== undefined) {
      fields.push(`south_lat = $${paramCount++}`);
      values.push(updates.southLat);
    }
    if (updates.eastLng !== undefined) {
      fields.push(`east_lng = $${paramCount++}`);
      values.push(updates.eastLng);
    }
    if (updates.westLng !== undefined) {
      fields.push(`west_lng = $${paramCount++}`);
      values.push(updates.westLng);
    }
    if (updates.centerLat !== undefined) {
      fields.push(`center_lat = $${paramCount++}`);
      values.push(updates.centerLat);
    }
    if (updates.centerLng !== undefined) {
      fields.push(`center_lng = $${paramCount++}`);
      values.push(updates.centerLng);
    }

    if (fields.length === 0) {
      return getTerritoryById(territoryId);
    }

    fields.push('updated_at = NOW()');
    values.push(territoryId);

    await pool.query(
      `UPDATE territories SET ${fields.join(', ')} WHERE id = $${paramCount}`,
      values
    );

    return getTerritoryById(territoryId);
  }

  /**
   * Delete (archive) a territory
   */
  async function deleteTerritory(territoryId: string): Promise<boolean> {
    const result = await pool.query(
      `UPDATE territories SET archived_at = NOW() WHERE id = $1 AND archived_at IS NULL`,
      [territoryId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Check in to a territory
   */
  async function checkIn(
    territoryId: string,
    userId: string,
    lat?: number,
    lng?: number
  ): Promise<TerritoryCheckIn> {
    // End any existing active check-ins for this user
    await pool.query(
      `UPDATE territory_checkins
       SET check_out_time = NOW()
       WHERE user_id = $1 AND check_out_time IS NULL`,
      [userId]
    );

    const result = await pool.query(
      `INSERT INTO territory_checkins (
        territory_id, user_id, check_in_lat, check_in_lng
      ) VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [territoryId, userId, lat || null, lng || null]
    );

    // Log activity
    await logActivity({
      territoryId,
      userId,
      activityType: 'check_in',
      latitude: lat,
      longitude: lng,
    });

    const row = result.rows[0];
    return {
      id: row.id,
      territoryId: row.territory_id,
      userId: row.user_id,
      checkInTime: row.check_in_time,
      checkOutTime: row.check_out_time,
      checkInLat: parseFloat(row.check_in_lat) || undefined,
      checkInLng: parseFloat(row.check_in_lng) || undefined,
      doorsKnocked: row.doors_knocked,
      contactsMade: row.contacts_made,
      leadsGenerated: row.leads_generated,
      appointmentsSet: row.appointments_set,
      notes: row.notes,
    };
  }

  /**
   * Check out of a territory
   */
  async function checkOut(
    checkInId: string,
    stats: {
      doorsKnocked?: number;
      contactsMade?: number;
      leadsGenerated?: number;
      appointmentsSet?: number;
      notes?: string;
    },
    lat?: number,
    lng?: number
  ): Promise<TerritoryCheckIn | null> {
    const result = await pool.query(
      `UPDATE territory_checkins SET
        check_out_time = NOW(),
        check_out_lat = $2,
        check_out_lng = $3,
        doors_knocked = COALESCE($4, doors_knocked),
        contacts_made = COALESCE($5, contacts_made),
        leads_generated = COALESCE($6, leads_generated),
        appointments_set = COALESCE($7, appointments_set),
        notes = COALESCE($8, notes)
       WHERE id = $1
       RETURNING *`,
      [
        checkInId,
        lat || null,
        lng || null,
        stats.doorsKnocked,
        stats.contactsMade,
        stats.leadsGenerated,
        stats.appointmentsSet,
        stats.notes,
      ]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];

    // Log activity
    await logActivity({
      territoryId: row.territory_id,
      userId: row.user_id,
      activityType: 'check_out',
      latitude: lat,
      longitude: lng,
      details: stats,
    });

    return {
      id: row.id,
      territoryId: row.territory_id,
      userId: row.user_id,
      checkInTime: row.check_in_time,
      checkOutTime: row.check_out_time,
      checkInLat: parseFloat(row.check_in_lat) || undefined,
      checkInLng: parseFloat(row.check_in_lng) || undefined,
      doorsKnocked: row.doors_knocked,
      contactsMade: row.contacts_made,
      leadsGenerated: row.leads_generated,
      appointmentsSet: row.appointments_set,
      notes: row.notes,
    };
  }

  /**
   * Get active check-in for a user
   */
  async function getActiveCheckIn(userId: string): Promise<TerritoryCheckIn | null> {
    const result = await pool.query(
      `SELECT * FROM territory_checkins
       WHERE user_id = $1 AND check_out_time IS NULL
       ORDER BY check_in_time DESC LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      territoryId: row.territory_id,
      userId: row.user_id,
      checkInTime: row.check_in_time,
      checkOutTime: row.check_out_time,
      checkInLat: parseFloat(row.check_in_lat) || undefined,
      checkInLng: parseFloat(row.check_in_lng) || undefined,
      doorsKnocked: row.doors_knocked,
      contactsMade: row.contacts_made,
      leadsGenerated: row.leads_generated,
      appointmentsSet: row.appointments_set,
      notes: row.notes,
    };
  }

  /**
   * Log activity in a territory
   */
  async function logActivity(activity: TerritoryActivity): Promise<void> {
    await pool.query(
      `INSERT INTO territory_activity (
        territory_id, user_id, activity_type, latitude, longitude, address, details, revenue_amount
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        activity.territoryId,
        activity.userId,
        activity.activityType,
        activity.latitude || null,
        activity.longitude || null,
        activity.address || null,
        JSON.stringify(activity.details || {}),
        activity.revenueAmount || null,
      ]
    );
  }

  /**
   * Get territory leaderboard
   */
  async function getLeaderboard(): Promise<Array<{
    territoryId: string;
    territoryName: string;
    color: string;
    ownerName: string;
    stats: {
      totalAddresses: number;
      addressesCanvassed: number;
      totalLeads: number;
      totalAppointments: number;
      totalSales: number;
      revenueGenerated: number;
      coveragePercent: number;
      leadRate: number;
    };
  }>> {
    const result = await pool.query(
      `SELECT * FROM territory_leaderboard`
    );

    return result.rows.map(row => ({
      territoryId: row.territory_id,
      territoryName: row.territory_name,
      color: row.color,
      ownerName: row.owner_name,
      stats: {
        totalAddresses: parseInt(row.total_addresses) || 0,
        addressesCanvassed: parseInt(row.addresses_canvassed) || 0,
        totalLeads: parseInt(row.total_leads) || 0,
        totalAppointments: parseInt(row.total_appointments) || 0,
        totalSales: parseInt(row.total_sales) || 0,
        revenueGenerated: parseFloat(row.revenue_generated) || 0,
        coveragePercent: parseFloat(row.coverage_percent) || 0,
        leadRate: parseFloat(row.lead_rate) || 0,
      },
    }));
  }

  /**
   * Find territory containing a point (bounding box check)
   */
  async function findTerritoryByPoint(lat: number, lng: number): Promise<Territory | null> {
    const result = await pool.query(
      `SELECT t.id FROM territories t
       WHERE $1 BETWEEN t.south_lat AND t.north_lat
       AND $2 BETWEEN t.west_lng AND t.east_lng
       AND t.archived_at IS NULL
       LIMIT 1`,
      [lat, lng]
    );

    if (result.rows.length === 0) return null;
    return getTerritoryById(result.rows[0].id);
  }

  return {
    getUserTerritories,
    getTerritoryById,
    createTerritory,
    updateTerritory,
    deleteTerritory,
    checkIn,
    checkOut,
    getActiveCheckIn,
    logActivity,
    getLeaderboard,
    findTerritoryByPoint,
  };
}
