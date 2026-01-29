/**
 * Storm Memory Service
 *
 * Stores and retrieves verified storm lookups from IHM/NOAA data.
 * Enables Susan AI to:
 * - Remember verified storm events by location
 * - Find similar areas that had storms
 * - Learn from claim outcomes (won/lost)
 * - Provide historical context for new lookups
 */
export class StormMemoryService {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    /**
     * Save a verified storm lookup to memory
     */
    async saveStormLookup(params) {
        const { userId, address, city, state, zipCode, latitude, longitude, stormEvents, dataSources } = params;
        const eventCount = stormEvents.length;
        const sources = {
            noaa: dataSources.noaa || false,
            ihm: dataSources.ihm || false
        };
        const result = await this.pool.query(`INSERT INTO storm_lookups (
        user_id, address, city, state, zip_code, latitude, longitude,
        storm_events, event_count, data_sources
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`, [
            userId,
            address,
            city || null,
            state || null,
            zipCode || null,
            latitude,
            longitude,
            JSON.stringify(stormEvents),
            eventCount,
            JSON.stringify(sources)
        ]);
        return this.rowToStormLookup(result.rows[0]);
    }
    /**
     * Find storm lookups within a radius (in miles)
     */
    async findNearbyStorms(latitude, longitude, radiusMiles = 10, userId) {
        const params = [latitude, longitude, radiusMiles];
        let userFilter = '';
        if (userId) {
            userFilter = 'AND user_id = $4';
            params.push(userId);
        }
        const result = await this.pool.query(`SELECT
        *,
        calculate_distance_miles($1, $2, latitude, longitude) as distance_miles
      FROM storm_lookups
      WHERE calculate_distance_miles($1, $2, latitude, longitude) <= $3
      ${userFilter}
      ORDER BY distance_miles ASC`, params);
        return result.rows.map(row => ({
            lookup: this.rowToStormLookup(row),
            distanceMiles: parseFloat(row.distance_miles)
        }));
    }
    /**
     * Get storm lookups by ZIP code
     */
    async getStormsByZipCode(zipCode, userId) {
        const params = [zipCode];
        let userFilter = '';
        if (userId) {
            userFilter = 'AND user_id = $2';
            params.push(userId);
        }
        const result = await this.pool.query(`SELECT * FROM storm_lookups
      WHERE zip_code = $1
      ${userFilter}
      ORDER BY created_at DESC`, params);
        return result.rows.map(this.rowToStormLookup);
    }
    /**
     * Get storm lookups by city and state
     */
    async getStormsByCity(city, state, userId) {
        const params = [city, state];
        let userFilter = '';
        if (userId) {
            userFilter = 'AND user_id = $3';
            params.push(userId);
        }
        const result = await this.pool.query(`SELECT * FROM storm_lookups
      WHERE LOWER(city) = LOWER($1) AND LOWER(state) = LOWER($2)
      ${userFilter}
      ORDER BY created_at DESC`, params);
        return result.rows.map(this.rowToStormLookup);
    }
    /**
     * Record the outcome of a storm lookup (claim won/lost)
     */
    async recordOutcome(lookupId, outcome, outcomeNotes) {
        const result = await this.pool.query(`UPDATE storm_lookups
      SET outcome = $1, outcome_notes = $2, outcome_date = CURRENT_DATE, updated_at = NOW()
      WHERE id = $3
      RETURNING *`, [outcome, outcomeNotes || null, lookupId]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.rowToStormLookup(result.rows[0]);
    }
    /**
     * Get lookup by ID
     */
    async getLookupById(lookupId) {
        const result = await this.pool.query('SELECT * FROM storm_lookups WHERE id = $1', [lookupId]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.rowToStormLookup(result.rows[0]);
    }
    /**
     * Get all lookups for a user
     */
    async getLookupsByUser(userId, limit = 100) {
        const result = await this.pool.query(`SELECT * FROM storm_lookups
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`, [userId, limit]);
        return result.rows.map(this.rowToStormLookup);
    }
    /**
     * Get statistics about storm lookups
     */
    async getStormStats(userId) {
        const userFilter = userId ? 'WHERE user_id = $1' : '';
        const params = userId ? [userId] : [];
        const result = await this.pool.query(`SELECT
        COUNT(*) as total_lookups,
        SUM(event_count) as total_events,
        COUNT(*) FILTER (WHERE outcome = 'claim_won') as won,
        COUNT(*) FILTER (WHERE outcome = 'claim_lost') as lost,
        COUNT(*) FILTER (WHERE outcome = 'pending') as pending,
        COUNT(*) FILTER (WHERE outcome = 'not_pursued') as not_pursued,
        COUNT(*) FILTER (WHERE (data_sources->>'noaa')::boolean = true) as noaa_sources,
        COUNT(*) FILTER (WHERE (data_sources->>'ihm')::boolean = true) as ihm_sources
      FROM storm_lookups
      ${userFilter}`, params);
        const row = result.rows[0];
        return {
            totalLookups: parseInt(row.total_lookups) || 0,
            totalEvents: parseInt(row.total_events) || 0,
            byOutcome: {
                claim_won: parseInt(row.won) || 0,
                claim_lost: parseInt(row.lost) || 0,
                pending: parseInt(row.pending) || 0,
                not_pursued: parseInt(row.not_pursued) || 0
            },
            byDataSource: {
                noaa: parseInt(row.noaa_sources) || 0,
                ihm: parseInt(row.ihm_sources) || 0
            }
        };
    }
    /**
     * Search storm events within lookups by event type or date range
     */
    async searchStormEvents(params) {
        const { userId, eventType, minMagnitude, dateFrom, dateTo } = params;
        let query = 'SELECT * FROM storm_lookups WHERE 1=1';
        const queryParams = [];
        let paramIndex = 1;
        if (userId) {
            query += ` AND user_id = $${paramIndex}`;
            queryParams.push(userId);
            paramIndex++;
        }
        // Filter by event type in JSONB array
        if (eventType) {
            query += ` AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(storm_events) AS event
        WHERE event->>'eventType' = $${paramIndex}
      )`;
            queryParams.push(eventType);
            paramIndex++;
        }
        // Filter by minimum magnitude
        if (minMagnitude !== undefined) {
            query += ` AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(storm_events) AS event
        WHERE (event->>'magnitude')::numeric >= $${paramIndex}
      )`;
            queryParams.push(minMagnitude);
            paramIndex++;
        }
        // Filter by date range
        if (dateFrom) {
            query += ` AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(storm_events) AS event
        WHERE event->>'date' >= $${paramIndex}
      )`;
            queryParams.push(dateFrom);
            paramIndex++;
        }
        if (dateTo) {
            query += ` AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(storm_events) AS event
        WHERE event->>'date' <= $${paramIndex}
      )`;
            queryParams.push(dateTo);
            paramIndex++;
        }
        query += ' ORDER BY created_at DESC';
        const result = await this.pool.query(query, queryParams);
        return result.rows.map(this.rowToStormLookup);
    }
    /**
     * Delete a storm lookup
     */
    async deleteLookup(lookupId, userId) {
        const result = await this.pool.query('DELETE FROM storm_lookups WHERE id = $1 AND user_id = $2', [lookupId, userId]);
        return result.rowCount !== null && result.rowCount > 0;
    }
    /**
     * Convert database row to StormLookup object
     */
    rowToStormLookup(row) {
        return {
            id: row.id,
            userId: row.user_id,
            address: row.address,
            city: row.city || undefined,
            state: row.state || undefined,
            zipCode: row.zip_code || undefined,
            latitude: parseFloat(row.latitude),
            longitude: parseFloat(row.longitude),
            stormEvents: row.storm_events || [],
            eventCount: row.event_count,
            dataSources: row.data_sources || { noaa: false, ihm: false },
            outcome: row.outcome || undefined,
            outcomeNotes: row.outcome_notes || undefined,
            outcomeDate: row.outcome_date || undefined,
            lookupDate: row.lookup_date,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}
/**
 * Create a storm memory service instance
 */
export const createStormMemoryService = (pool) => {
    return new StormMemoryService(pool);
};
