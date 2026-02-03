/**
 * Impacted Asset Service
 *
 * Monitors customer properties for storm impacts.
 * Enables proactive outreach when past customers are affected by new storms.
 *
 * Features:
 * - Store customer addresses for monitoring
 * - Check storms against customer properties
 * - Generate and send impact alerts
 * - Track follow-up and conversions
 */

import { Pool } from 'pg';
import { twilioService } from './twilioService.js';

export interface CustomerProperty {
  id: string;
  userId: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  address: string;
  streetAddress?: string;
  city: string;
  state: string;
  zipCode: string;
  latitude: number;
  longitude: number;
  propertyType?: string;
  roofType?: string;
  roofAgeYears?: number;
  lastRoofDate?: string;
  relationshipStatus: string;
  originalJobId?: string;
  totalJobs: number;
  lastServiceDate?: string;
  lifetimeValue?: number;
  notifyOnHail: boolean;
  notifyOnWind: boolean;
  notifyOnTornado: boolean;
  notifyThresholdHailSize: number;
  notifyRadiusMiles: number;
  preferredContactMethod: string;
  doNotContact: boolean;
  notes?: string;
  tags?: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ImpactAlert {
  id: string;
  customerPropertyId: string;
  stormEventId?: string;
  userId: string;
  alertType: string;
  alertSeverity: string;
  stormDate: string;
  stormDistanceMiles: number;
  hailSizeInches?: number;
  windSpeedMph?: number;
  status: string;
  contactedAt?: string;
  contactMethod?: string;
  contactNotes?: string;
  outcome?: string;
  convertedJobId?: string;
  conversionDate?: string;
  pushSent: boolean;
  pushSentAt?: string;
  emailSent: boolean;
  emailSentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImpactedProperty {
  propertyId: string;
  userId: string;
  customerName: string;
  address: string;
  distanceMiles: number;
  notifyMethod: string;
}

export class ImpactedAssetService {
  constructor(private pool: Pool) {}

  // ============================================================================
  // CUSTOMER PROPERTIES
  // ============================================================================

  /**
   * Add a customer property to monitor
   */
  async addCustomerProperty(params: {
    userId: string;
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    address: string;
    streetAddress?: string;
    city: string;
    state: string;
    zipCode: string;
    latitude: number;
    longitude: number;
    propertyType?: string;
    roofType?: string;
    roofAgeYears?: number;
    lastRoofDate?: string;
    relationshipStatus?: string;
    originalJobId?: string;
    lifetimeValue?: number;
    notifyOnHail?: boolean;
    notifyOnWind?: boolean;
    notifyOnTornado?: boolean;
    notifyThresholdHailSize?: number;
    notifyRadiusMiles?: number;
    preferredContactMethod?: string;
    notes?: string;
    tags?: string[];
  }): Promise<CustomerProperty> {
    const result = await this.pool.query(
      `INSERT INTO customer_properties (
        user_id, customer_name, customer_phone, customer_email,
        address, street_address, city, state, zip_code, latitude, longitude,
        property_type, roof_type, roof_age_years, last_roof_date,
        relationship_status, original_job_id, lifetime_value,
        notify_on_hail, notify_on_wind, notify_on_tornado,
        notify_threshold_hail_size, notify_radius_miles,
        preferred_contact_method, notes, tags
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
      RETURNING *`,
      [
        params.userId,
        params.customerName,
        params.customerPhone || null,
        params.customerEmail || null,
        params.address,
        params.streetAddress || null,
        params.city,
        params.state,
        params.zipCode,
        params.latitude,
        params.longitude,
        params.propertyType || 'residential',
        params.roofType || null,
        params.roofAgeYears || null,
        params.lastRoofDate || null,
        params.relationshipStatus || 'past_customer',
        params.originalJobId || null,
        params.lifetimeValue || null,
        params.notifyOnHail !== false,
        params.notifyOnWind !== false,
        params.notifyOnTornado !== false,
        params.notifyThresholdHailSize || 1.0,
        params.notifyRadiusMiles || 5.0,
        params.preferredContactMethod || 'phone',
        params.notes || null,
        params.tags || null
      ]
    );

    return this.rowToProperty(result.rows[0]);
  }

  /**
   * Get all customer properties for a user
   */
  async getUserProperties(
    userId: string,
    activeOnly: boolean = true
  ): Promise<CustomerProperty[]> {
    const query = activeOnly
      ? 'SELECT * FROM customer_properties WHERE user_id = $1 AND is_active = TRUE ORDER BY created_at DESC'
      : 'SELECT * FROM customer_properties WHERE user_id = $1 ORDER BY created_at DESC';

    const result = await this.pool.query(query, [userId]);
    return result.rows.map(this.rowToProperty);
  }

  /**
   * Get customer property by ID
   */
  async getPropertyById(propertyId: string): Promise<CustomerProperty | null> {
    const result = await this.pool.query(
      'SELECT * FROM customer_properties WHERE id = $1',
      [propertyId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToProperty(result.rows[0]);
  }

  /**
   * Update a customer property
   */
  async updateProperty(
    propertyId: string,
    updates: Partial<CustomerProperty>
  ): Promise<CustomerProperty | null> {
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build dynamic update query
    const fieldMap: Record<string, string> = {
      customerName: 'customer_name',
      customerPhone: 'customer_phone',
      customerEmail: 'customer_email',
      address: 'address',
      city: 'city',
      state: 'state',
      zipCode: 'zip_code',
      latitude: 'latitude',
      longitude: 'longitude',
      propertyType: 'property_type',
      roofType: 'roof_type',
      roofAgeYears: 'roof_age_years',
      relationshipStatus: 'relationship_status',
      notifyOnHail: 'notify_on_hail',
      notifyOnWind: 'notify_on_wind',
      notifyOnTornado: 'notify_on_tornado',
      notifyThresholdHailSize: 'notify_threshold_hail_size',
      notifyRadiusMiles: 'notify_radius_miles',
      preferredContactMethod: 'preferred_contact_method',
      doNotContact: 'do_not_contact',
      notes: 'notes',
      tags: 'tags',
      isActive: 'is_active'
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (key in updates) {
        updateFields.push(`${dbField} = $${paramIndex}`);
        values.push((updates as any)[key]);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      return this.getPropertyById(propertyId);
    }

    values.push(propertyId);
    const result = await this.pool.query(
      `UPDATE customer_properties
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToProperty(result.rows[0]);
  }

  /**
   * Delete (deactivate) a customer property
   */
  async deleteProperty(propertyId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE customer_properties
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1 AND user_id = $2`,
      [propertyId, userId]
    );

    return result.rowCount !== null && result.rowCount > 0;
  }

  // ============================================================================
  // STORM IMPACT CHECKING
  // ============================================================================

  /**
   * Check if a storm impacts any customer properties
   */
  async checkStormImpact(
    latitude: number,
    longitude: number,
    eventType: string,
    hailSize?: number,
    windSpeed?: number
  ): Promise<ImpactedProperty[]> {
    const result = await this.pool.query(
      `SELECT * FROM check_storm_impact($1, $2, $3, $4, $5)`,
      [latitude, longitude, eventType, hailSize || null, windSpeed || null]
    );

    return result.rows.map(row => ({
      propertyId: row.property_id,
      userId: row.user_id,
      customerName: row.customer_name,
      address: row.address,
      distanceMiles: parseFloat(row.distance_miles),
      notifyMethod: row.notify_method
    }));
  }

  /**
   * Create impact alerts for affected properties
   * Also sends SMS notifications if user has SMS enabled and phone number
   */
  async createImpactAlerts(params: {
    stormLatitude: number;
    stormLongitude: number;
    stormEventId?: string;
    eventType: string;
    stormDate: string;
    hailSize?: number;
    windSpeed?: number;
  }): Promise<ImpactAlert[]> {
    // Get all impacted properties
    const impacted = await this.checkStormImpact(
      params.stormLatitude,
      params.stormLongitude,
      params.eventType,
      params.hailSize,
      params.windSpeed
    );

    const alerts: ImpactAlert[] = [];

    for (const property of impacted) {
      // Calculate severity
      const severityResult = await this.pool.query(
        `SELECT calculate_alert_severity($1, $2, $3, $4) as severity`,
        [params.eventType, property.distanceMiles, params.hailSize || null, params.windSpeed || null]
      );
      const severity = severityResult.rows[0].severity;

      // Create alert
      const alertResult = await this.pool.query(
        `INSERT INTO impact_alerts (
          customer_property_id, storm_event_id, user_id,
          alert_type, alert_severity, storm_date, storm_distance_miles,
          hail_size_inches, wind_speed_mph
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          property.propertyId,
          params.stormEventId || null,
          property.userId,
          params.eventType,
          severity,
          params.stormDate,
          property.distanceMiles,
          params.hailSize || null,
          params.windSpeed || null
        ]
      );

      const alert = this.rowToAlert(alertResult.rows[0]);
      alerts.push(alert);

      // Send SMS notification if enabled
      await this.sendSMSNotification(alert.id, property.userId, property.propertyId, {
        propertyAddress: property.address,
        eventType: params.eventType,
        hailSize: params.hailSize,
        windSpeed: params.windSpeed,
        stormDate: params.stormDate
      });
    }

    return alerts;
  }

  /**
   * Send SMS notification for impact alert
   * Checks if user has SMS enabled and phone number configured
   */
  private async sendSMSNotification(
    alertId: string,
    userId: string,
    propertyId: string,
    details: {
      propertyAddress: string;
      eventType: string;
      hailSize?: number;
      windSpeed?: number;
      stormDate: string;
    }
  ): Promise<void> {
    try {
      // Check if user has SMS enabled and has a phone number
      const userResult = await this.pool.query(
        `SELECT phone_number, sms_alerts_enabled
         FROM users
         WHERE id = $1`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        return; // User not found
      }

      const user = userResult.rows[0];
      if (!user.sms_alerts_enabled || !user.phone_number) {
        console.log(`[SMS] User ${userId} does not have SMS enabled or no phone number`);
        return; // SMS not enabled or no phone number
      }

      // Send SMS via Twilio
      const result = await twilioService.sendStormAlert({
        phoneNumber: user.phone_number,
        propertyAddress: details.propertyAddress,
        propertyId,
        eventType: details.eventType,
        hailSize: details.hailSize,
        windSpeed: details.windSpeed,
        date: details.stormDate,
        userId,
        impactAlertId: alertId
      });

      // Update impact alert with SMS status
      if (result.success) {
        await this.pool.query(
          `UPDATE impact_alerts
           SET sms_sent = TRUE,
               sms_sent_at = NOW(),
               sms_message_sid = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [result.messageSid, alertId]
        );
        console.log(`[SMS] Alert sent successfully for impact alert ${alertId}`);
      } else {
        console.error(`[SMS] Failed to send alert for impact alert ${alertId}:`, result.error);
      }
    } catch (error) {
      console.error('[SMS] Error sending notification:', error);
      // Don't throw - SMS is optional, don't fail alert creation
    }
  }

  // ============================================================================
  // IMPACT ALERTS
  // ============================================================================

  /**
   * Get pending alerts for a user
   */
  async getPendingAlerts(userId: string): Promise<
    Array<{
      alert: ImpactAlert;
      property: CustomerProperty;
    }>
  > {
    const result = await this.pool.query(
      `SELECT
        ia.*,
        cp.customer_name, cp.customer_phone, cp.customer_email,
        cp.address as property_address, cp.city, cp.state
      FROM impact_alerts ia
      JOIN customer_properties cp ON ia.customer_property_id = cp.id
      WHERE ia.user_id = $1
      AND ia.status IN ('pending', 'sent', 'viewed')
      ORDER BY ia.created_at DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      alert: this.rowToAlert(row),
      property: {
        id: row.customer_property_id,
        userId: row.user_id,
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        customerEmail: row.customer_email,
        address: row.property_address,
        city: row.city,
        state: row.state
      } as CustomerProperty
    }));
  }

  /**
   * Update alert status
   */
  async updateAlertStatus(
    alertId: string,
    status: string,
    outcome?: string,
    contactNotes?: string
  ): Promise<ImpactAlert | null> {
    const result = await this.pool.query(
      `UPDATE impact_alerts
      SET
        status = $1,
        outcome = COALESCE($2, outcome),
        contact_notes = COALESCE($3, contact_notes),
        contacted_at = CASE WHEN $1 IN ('contacted', 'converted') THEN NOW() ELSE contacted_at END,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *`,
      [status, outcome || null, contactNotes || null, alertId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToAlert(result.rows[0]);
  }

  /**
   * Mark alert as converted (created a job)
   */
  async convertAlert(alertId: string, jobId: string): Promise<ImpactAlert | null> {
    const result = await this.pool.query(
      `UPDATE impact_alerts
      SET
        status = 'converted',
        outcome = 'converted',
        converted_job_id = $1,
        conversion_date = CURRENT_DATE,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *`,
      [jobId, alertId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToAlert(result.rows[0]);
  }

  /**
   * Mark push notification as sent
   */
  async markPushSent(alertId: string, deviceToken: string): Promise<void> {
    await this.pool.query(
      `UPDATE impact_alerts
      SET push_sent = TRUE, push_sent_at = NOW(), push_device_token = $1, updated_at = NOW()
      WHERE id = $2`,
      [deviceToken, alertId]
    );
  }

  /**
   * Mark email as sent
   */
  async markEmailSent(alertId: string): Promise<void> {
    await this.pool.query(
      `UPDATE impact_alerts
      SET email_sent = TRUE, email_sent_at = NOW(), updated_at = NOW()
      WHERE id = $1`,
      [alertId]
    );
  }

  /**
   * Mark SMS as sent
   */
  async markSMSSent(alertId: string, messageSid?: string): Promise<void> {
    await this.pool.query(
      `UPDATE impact_alerts
      SET sms_sent = TRUE, sms_sent_at = NOW(), sms_message_sid = $1, updated_at = NOW()
      WHERE id = $2`,
      [messageSid || null, alertId]
    );
  }

  /**
   * Log SMS notification
   */
  async logSMSNotification(params: {
    userId: string;
    phoneNumber: string;
    messageBody: string;
    impactAlertId?: string;
    messageSid?: string;
  }): Promise<string> {
    const result = await this.pool.query(
      `SELECT log_sms_notification($1, $2, $3, $4, $5) as notification_id`,
      [
        params.userId,
        params.phoneNumber,
        params.messageBody,
        params.impactAlertId || null,
        params.messageSid || null
      ]
    );

    return result.rows[0].notification_id;
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get impact statistics for a user
   */
  async getUserImpactStats(
    userId: string,
    daysBack: number = 90
  ): Promise<{
    totalProperties: number;
    totalAlerts: number;
    alertsPending: number;
    alertsConverted: number;
    conversionRate: number;
    totalConversionValue: number;
  }> {
    const result = await this.pool.query(
      `SELECT * FROM get_impact_stats($1, $2)`,
      [userId, daysBack]
    );

    const row = result.rows[0];

    return {
      totalProperties: parseInt(row.total_properties) || 0,
      totalAlerts: parseInt(row.total_alerts) || 0,
      alertsPending: parseInt(row.alerts_pending) || 0,
      alertsConverted: parseInt(row.alerts_converted) || 0,
      conversionRate: parseFloat(row.conversion_rate) || 0,
      totalConversionValue: parseFloat(row.total_conversion_value) || 0
    };
  }

  // ============================================================================
  // STORM MONITORING
  // ============================================================================

  /**
   * Run storm monitoring check and create alerts
   * This should be called by a cron job or when new storms are detected
   */
  async runStormMonitoring(
    stormData: {
      latitude: number;
      longitude: number;
      eventType: string;
      stormDate: string;
      hailSize?: number;
      windSpeed?: number;
      stormEventId?: string;
    }[]
  ): Promise<{
    propertiesChecked: number;
    alertsGenerated: number;
    runId: string;
  }> {
    // Log monitoring run start
    const runResult = await this.pool.query(
      `INSERT INTO storm_monitoring_runs (run_type, start_time)
      VALUES ('scheduled', NOW())
      RETURNING id`
    );
    const runId = runResult.rows[0].id;

    let totalAlerts = 0;
    const propertiesChecked = new Set<string>();

    try {
      for (const storm of stormData) {
        const alerts = await this.createImpactAlerts({
          stormLatitude: storm.latitude,
          stormLongitude: storm.longitude,
          stormEventId: storm.stormEventId,
          eventType: storm.eventType,
          stormDate: storm.stormDate,
          hailSize: storm.hailSize,
          windSpeed: storm.windSpeed
        });

        totalAlerts += alerts.length;
        alerts.forEach(a => propertiesChecked.add(a.customerPropertyId));
      }

      // Update monitoring run
      await this.pool.query(
        `UPDATE storm_monitoring_runs
        SET end_time = NOW(), properties_checked = $1, alerts_generated = $2
        WHERE id = $3`,
        [propertiesChecked.size, totalAlerts, runId]
      );
    } catch (error: any) {
      // Log error
      await this.pool.query(
        `UPDATE storm_monitoring_runs
        SET end_time = NOW(), errors = $1
        WHERE id = $2`,
        [JSON.stringify({ message: error.message }), runId]
      );
      throw error;
    }

    return {
      propertiesChecked: propertiesChecked.size,
      alertsGenerated: totalAlerts,
      runId
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private rowToProperty(row: any): CustomerProperty {
    return {
      id: row.id,
      userId: row.user_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone || undefined,
      customerEmail: row.customer_email || undefined,
      address: row.address,
      streetAddress: row.street_address || undefined,
      city: row.city,
      state: row.state,
      zipCode: row.zip_code,
      latitude: parseFloat(row.latitude),
      longitude: parseFloat(row.longitude),
      propertyType: row.property_type || undefined,
      roofType: row.roof_type || undefined,
      roofAgeYears: row.roof_age_years || undefined,
      lastRoofDate: row.last_roof_date || undefined,
      relationshipStatus: row.relationship_status,
      originalJobId: row.original_job_id || undefined,
      totalJobs: row.total_jobs || 1,
      lastServiceDate: row.last_service_date || undefined,
      lifetimeValue: row.lifetime_value ? parseFloat(row.lifetime_value) : undefined,
      notifyOnHail: row.notify_on_hail,
      notifyOnWind: row.notify_on_wind,
      notifyOnTornado: row.notify_on_tornado,
      notifyThresholdHailSize: parseFloat(row.notify_threshold_hail_size),
      notifyRadiusMiles: parseFloat(row.notify_radius_miles),
      preferredContactMethod: row.preferred_contact_method,
      doNotContact: row.do_not_contact,
      notes: row.notes || undefined,
      tags: row.tags || undefined,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private rowToAlert(row: any): ImpactAlert {
    return {
      id: row.id,
      customerPropertyId: row.customer_property_id,
      stormEventId: row.storm_event_id || undefined,
      userId: row.user_id,
      alertType: row.alert_type,
      alertSeverity: row.alert_severity,
      stormDate: row.storm_date,
      stormDistanceMiles: parseFloat(row.storm_distance_miles),
      hailSizeInches: row.hail_size_inches ? parseFloat(row.hail_size_inches) : undefined,
      windSpeedMph: row.wind_speed_mph || undefined,
      status: row.status,
      contactedAt: row.contacted_at || undefined,
      contactMethod: row.contact_method || undefined,
      contactNotes: row.contact_notes || undefined,
      outcome: row.outcome || undefined,
      convertedJobId: row.converted_job_id || undefined,
      conversionDate: row.conversion_date || undefined,
      pushSent: row.push_sent || false,
      pushSentAt: row.push_sent_at || undefined,
      emailSent: row.email_sent || false,
      emailSentAt: row.email_sent_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

/**
 * Create an impacted asset service instance
 */
export const createImpactedAssetService = (pool: Pool): ImpactedAssetService => {
  return new ImpactedAssetService(pool);
};
