/**
 * Storm Data Service
 * Handles storm event lookups, claim tracking, and learning analytics
 */

import { Pool } from 'pg';
import type {
  StormEvent,
  CreateStormEventInput,
  StormClaimOutcome,
  CreateClaimOutcomeInput,
  StormAreaPattern,
  StormNearLocation,
  AreaClaimStrategy,
  FindStormsNearRequest,
  GetAreaStrategiesRequest,
  StormSearchRequest,
  StormSearchResponse,
  RecentSuccessfulClaim,
  StormHotspot,
  CreateLookupAnalyticInput,
} from '../types/storm-data.js';

export class StormDataService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  // ========================================================================
  // STORM EVENTS
  // ========================================================================

  /**
   * Create a new storm event
   */
  async createStormEvent(data: CreateStormEventInput): Promise<StormEvent> {
    const query = `
      INSERT INTO storm_events (
        address, street_address, city, state, zip_code, county,
        latitude, longitude,
        event_date, event_type, hail_size_inches, hail_size_description,
        wind_speed_mph, data_source, source_confidence, source_url,
        source_metadata, discovered_by, verified_by, job_id, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21
      )
      RETURNING *
    `;

    const values = [
      data.address,
      data.street_address || null,
      data.city,
      data.state,
      data.zip_code,
      data.county || null,
      data.latitude,
      data.longitude,
      data.event_date,
      data.event_type,
      data.hail_size_inches || null,
      data.hail_size_description || null,
      data.wind_speed_mph || null,
      data.data_source,
      data.source_confidence || 'verified',
      data.source_url || null,
      data.source_metadata ? JSON.stringify(data.source_metadata) : null,
      data.discovered_by || null,
      data.verified_by || null,
      data.job_id || null,
      data.notes || null,
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Find storms near a location
   */
  async findStormsNearLocation(
    params: FindStormsNearRequest
  ): Promise<StormNearLocation[]> {
    const query = `
      SELECT * FROM find_storms_near_location($1, $2, $3, $4)
    `;

    const values = [
      params.latitude,
      params.longitude,
      params.radius_miles || 10,
      params.days_back || 365,
    ];

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  /**
   * Search storms with flexible filters
   */
  async searchStorms(params: StormSearchRequest): Promise<StormSearchResponse> {
    let whereClauses: string[] = ['is_active = TRUE'];
    let queryParams: any[] = [];
    let paramIndex = 1;

    // Location filters
    if (params.state) {
      whereClauses.push(`state = $${paramIndex++}`);
      queryParams.push(params.state);
    }

    if (params.city) {
      whereClauses.push(`city = $${paramIndex++}`);
      queryParams.push(params.city);
    }

    if (params.zip_code) {
      whereClauses.push(`zip_code = $${paramIndex++}`);
      queryParams.push(params.zip_code);
    }

    // Coordinate-based search
    if (params.latitude && params.longitude && params.radius_miles) {
      whereClauses.push(
        `calculate_distance_miles($${paramIndex}, $${paramIndex + 1}, latitude, longitude) <= $${paramIndex + 2}`
      );
      queryParams.push(params.latitude, params.longitude, params.radius_miles);
      paramIndex += 3;
    }

    // Date filters
    if (params.start_date) {
      whereClauses.push(`event_date >= $${paramIndex++}`);
      queryParams.push(params.start_date);
    }

    if (params.end_date) {
      whereClauses.push(`event_date <= $${paramIndex++}`);
      queryParams.push(params.end_date);
    }

    // Event filters
    if (params.event_type) {
      whereClauses.push(`event_type = $${paramIndex++}`);
      queryParams.push(params.event_type);
    }

    if (params.min_hail_size) {
      whereClauses.push(`hail_size_inches >= $${paramIndex++}`);
      queryParams.push(params.min_hail_size);
    }

    const whereClause = whereClauses.join(' AND ');
    const limit = params.limit || 50;
    const offset = params.offset || 0;

    // Get total count
    const countQuery = `
      SELECT COUNT(*) FROM storm_events
      WHERE ${whereClause}
    `;
    const countResult = await this.pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    const dataQuery = `
      SELECT * FROM storm_events
      WHERE ${whereClause}
      ORDER BY event_date DESC, created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const dataResult = await this.pool.query(dataQuery, [
      ...queryParams,
      limit,
      offset,
    ]);

    return {
      storms: dataResult.rows,
      total,
      query: params,
    };
  }

  /**
   * Get storm event by ID
   */
  async getStormEventById(id: string): Promise<StormEvent | null> {
    const query = `SELECT * FROM storm_events WHERE id = $1`;
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Update storm event
   */
  async updateStormEvent(
    id: string,
    data: Partial<CreateStormEventInput>
  ): Promise<StormEvent | null> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build dynamic SET clause
    Object.entries(data).forEach(([key, value]) => {
      setClauses.push(`${key} = $${paramIndex++}`);
      values.push(value);
    });

    if (setClauses.length === 0) {
      return this.getStormEventById(id);
    }

    values.push(id);
    const query = `
      UPDATE storm_events
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  // ========================================================================
  // CLAIM OUTCOMES
  // ========================================================================

  /**
   * Create a claim outcome
   */
  async createClaimOutcome(
    data: CreateClaimOutcomeInput
  ): Promise<StormClaimOutcome> {
    const query = `
      INSERT INTO storm_claim_outcomes (
        storm_event_id, job_id, user_id,
        insurance_company, adjuster_name, claim_number, claim_filed_date,
        claim_status, claim_result, approval_amount, initial_estimate,
        final_settlement, outcome_date,
        key_arguments, supporting_evidence, challenges_faced,
        resolution_method, adjuster_behavior, adjuster_notes,
        response_time_days, required_reinspection,
        initial_denial_reasons, appeal_strategy, appeal_outcome,
        success_factors, lessons_learned
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
      )
      RETURNING *
    `;

    const values = [
      data.storm_event_id || null,
      data.job_id || null,
      data.user_id || null,
      data.insurance_company || null,
      data.adjuster_name || null,
      data.claim_number || null,
      data.claim_filed_date || null,
      data.claim_status,
      data.claim_result || null,
      data.approval_amount || null,
      data.initial_estimate || null,
      data.final_settlement || null,
      data.outcome_date || null,
      data.key_arguments || null,
      data.supporting_evidence || null,
      data.challenges_faced || null,
      data.resolution_method || null,
      data.adjuster_behavior || null,
      data.adjuster_notes || null,
      data.response_time_days || null,
      data.required_reinspection || false,
      data.initial_denial_reasons || null,
      data.appeal_strategy || null,
      data.appeal_outcome || null,
      data.success_factors || null,
      data.lessons_learned || null,
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Get claim outcomes for a storm event
   */
  async getClaimOutcomesByStormId(
    stormEventId: string
  ): Promise<StormClaimOutcome[]> {
    const query = `
      SELECT * FROM storm_claim_outcomes
      WHERE storm_event_id = $1
      ORDER BY created_at DESC
    `;
    const result = await this.pool.query(query, [stormEventId]);
    return result.rows;
  }

  /**
   * Get claim outcomes for a job
   */
  async getClaimOutcomesByJobId(jobId: string): Promise<StormClaimOutcome[]> {
    const query = `
      SELECT * FROM storm_claim_outcomes
      WHERE job_id = $1
      ORDER BY created_at DESC
    `;
    const result = await this.pool.query(query, [jobId]);
    return result.rows;
  }

  /**
   * Update claim outcome
   */
  async updateClaimOutcome(
    id: string,
    data: Partial<CreateClaimOutcomeInput>
  ): Promise<StormClaimOutcome | null> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(data).forEach(([key, value]) => {
      setClauses.push(`${key} = $${paramIndex++}`);
      values.push(value);
    });

    if (setClauses.length === 0) {
      const result = await this.pool.query(
        'SELECT * FROM storm_claim_outcomes WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    }

    values.push(id);
    const query = `
      UPDATE storm_claim_outcomes
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  // ========================================================================
  // AREA STRATEGIES & PATTERNS
  // ========================================================================

  /**
   * Get successful claim strategies for an area
   */
  async getAreaStrategies(
    params: GetAreaStrategiesRequest
  ): Promise<AreaClaimStrategy | null> {
    const query = `
      SELECT * FROM get_area_claim_strategies($1, $2, $3, $4)
    `;

    const values = [
      params.state,
      params.city || null,
      params.zip_code || null,
      params.insurance_company || null,
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  /**
   * Get area patterns
   */
  async getAreaPatterns(
    state: string,
    scopeType?: string,
    scopeValue?: string
  ): Promise<StormAreaPattern[]> {
    let query = `
      SELECT * FROM storm_area_patterns
      WHERE state = $1
    `;
    const values: any[] = [state];

    if (scopeType && scopeValue) {
      query += ` AND scope_type = $2`;
      values.push(scopeType);

      if (scopeType === 'zip_code') {
        query += ` AND zip_code = $3`;
        values.push(scopeValue);
      } else if (scopeType === 'city') {
        query += ` AND city = $3`;
        values.push(scopeValue);
      } else if (scopeType === 'county') {
        query += ` AND county = $3`;
        values.push(scopeValue);
      }
    }

    query += ` ORDER BY success_rate DESC NULLS LAST`;

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  // ========================================================================
  // ANALYTICS & LEARNING
  // ========================================================================

  /**
   * Get recent successful claims
   */
  async getRecentSuccessfulClaims(
    limit: number = 10,
    state?: string
  ): Promise<RecentSuccessfulClaim[]> {
    let query = `SELECT * FROM recent_successful_claims`;
    const values: any[] = [];

    if (state) {
      query += ` WHERE state = $1`;
      values.push(state);
    }

    query += ` LIMIT $${values.length + 1}`;
    values.push(limit);

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  /**
   * Get storm hotspots
   */
  async getStormHotspots(state?: string, limit: number = 20): Promise<StormHotspot[]> {
    let query = `SELECT * FROM storm_hotspots`;
    const values: any[] = [];

    if (state) {
      query += ` WHERE state = $1`;
      values.push(state);
    }

    query += ` LIMIT $${values.length + 1}`;
    values.push(limit);

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  /**
   * Track a storm lookup query
   */
  async trackLookup(data: CreateLookupAnalyticInput): Promise<void> {
    const query = `
      INSERT INTO storm_lookup_analytics (
        user_id, query_type, query_address,
        query_latitude, query_longitude, query_radius_miles,
        results_found, storm_event_ids,
        related_job_id, session_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;

    const values = [
      data.user_id || null,
      data.query_type,
      data.query_address || null,
      data.query_latitude || null,
      data.query_longitude || null,
      data.query_radius_miles || null,
      data.results_found,
      data.storm_event_ids || null,
      data.related_job_id || null,
      data.session_id || null,
    ];

    await this.pool.query(query, values);
  }

  /**
   * Get top arguments for successful claims
   */
  async getTopArguments(
    insuranceCompany?: string,
    state?: string,
    limit: number = 10
  ): Promise<{ argument: string; count: number; success_rate: number }[]> {
    let whereClauses = ["claim_result IN ('won', 'partial_win')"];
    const values: any[] = [];
    let paramIndex = 1;

    if (insuranceCompany) {
      whereClauses.push(`sco.insurance_company = $${paramIndex++}`);
      values.push(insuranceCompany);
    }

    if (state) {
      whereClauses.push(`se.state = $${paramIndex++}`);
      values.push(state);
    }

    values.push(limit);

    const query = `
      SELECT
        unnest(key_arguments) as argument,
        COUNT(*) as count,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE claim_result = 'won') / COUNT(*),
          2
        ) as success_rate
      FROM storm_claim_outcomes sco
      JOIN storm_events se ON sco.storm_event_id = se.id
      WHERE ${whereClauses.join(' AND ')}
        AND key_arguments IS NOT NULL
      GROUP BY argument
      ORDER BY count DESC, success_rate DESC
      LIMIT $${paramIndex}
    `;

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  /**
   * Get top evidence types for successful claims
   */
  async getTopEvidenceTypes(
    insuranceCompany?: string,
    state?: string,
    limit: number = 10
  ): Promise<{ evidence_type: string; count: number; avg_settlement: number }[]> {
    let whereClauses = ["claim_result IN ('won', 'partial_win')"];
    const values: any[] = [];
    let paramIndex = 1;

    if (insuranceCompany) {
      whereClauses.push(`sco.insurance_company = $${paramIndex++}`);
      values.push(insuranceCompany);
    }

    if (state) {
      whereClauses.push(`se.state = $${paramIndex++}`);
      values.push(state);
    }

    values.push(limit);

    const query = `
      SELECT
        unnest(supporting_evidence) as evidence_type,
        COUNT(*) as count,
        ROUND(AVG(final_settlement), 2) as avg_settlement
      FROM storm_claim_outcomes sco
      JOIN storm_events se ON sco.storm_event_id = se.id
      WHERE ${whereClauses.join(' AND ')}
        AND supporting_evidence IS NOT NULL
      GROUP BY evidence_type
      ORDER BY count DESC, avg_settlement DESC
      LIMIT $${paramIndex}
    `;

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  // ========================================================================
  // SUSAN LEARNING QUERIES
  // ========================================================================

  /**
   * Get contextual recommendations for Susan
   * Based on location, insurance company, and claim type
   */
  async getSusanRecommendations(params: {
    latitude?: number;
    longitude?: number;
    zip_code?: string;
    state: string;
    insurance_company?: string;
  }): Promise<{
    nearby_storms: StormNearLocation[];
    area_strategies: AreaClaimStrategy | null;
    top_arguments: string[];
    top_evidence: string[];
    recent_successes: RecentSuccessfulClaim[];
  }> {
    // Find nearby storms
    let nearby_storms: StormNearLocation[] = [];
    if (params.latitude && params.longitude) {
      nearby_storms = await this.findStormsNearLocation({
        latitude: params.latitude,
        longitude: params.longitude,
        radius_miles: 15,
        days_back: 730, // 2 years
      });
    }

    // Get area strategies
    const area_strategies = await this.getAreaStrategies({
      state: params.state,
      zip_code: params.zip_code,
      insurance_company: params.insurance_company,
    });

    // Get top arguments
    const topArgsResult = await this.getTopArguments(
      params.insurance_company,
      params.state,
      5
    );
    const top_arguments = topArgsResult.map((r) => r.argument);

    // Get top evidence types
    const topEvidenceResult = await this.getTopEvidenceTypes(
      params.insurance_company,
      params.state,
      5
    );
    const top_evidence = topEvidenceResult.map((r) => r.evidence_type);

    // Get recent successes
    const recent_successes = await this.getRecentSuccessfulClaims(5, params.state);

    return {
      nearby_storms,
      area_strategies,
      top_arguments,
      top_evidence,
      recent_successes,
    };
  }
}

export default StormDataService;
