/**
 * Hail Knowledge Service
 *
 * Converts saved hail reports into searchable knowledge for Susan AI.
 * When users save hail reports from the Storm Map, this service indexes them
 * so Susan can answer questions like:
 * - "What hail events happened in Richmond last year?"
 * - "Show me areas with severe hail in PA"
 * - "When was the last major storm in the DMV?"
 */

import { Pool } from 'pg';
import { StormLookup, StormEvent } from './stormMemoryService.js';

export interface HailKnowledgeDocument {
  id: string;
  userId: string;
  title: string;
  content: string;
  location: string;
  state: string | null;
  city: string | null;
  zipCode: string | null;
  dateRange: {
    earliest: string;
    latest: string;
  };
  eventSummary: {
    total: number;
    hail: number;
    wind: number;
    tornado: number;
    maxHailSize: number | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface HailKnowledgeSearchParams {
  userId?: string;
  state?: string;
  city?: string;
  zipCode?: string;
  location?: string;
  dateFrom?: string;
  dateTo?: string;
  minHailSize?: number;
  limit?: number;
}

export class HailKnowledgeService {
  constructor(private pool: Pool) {}

  /**
   * Index a storm lookup as knowledge for Susan
   * Called when user saves a hail report
   */
  async indexStormLookup(lookup: StormLookup): Promise<HailKnowledgeDocument> {
    // Generate searchable content from storm events
    const content = this.generateKnowledgeContent(lookup);

    // Calculate date range and event summary
    const dateRange = this.calculateDateRange(lookup.stormEvents);
    const eventSummary = this.calculateEventSummary(lookup.stormEvents);

    const result = await this.pool.query(
      `INSERT INTO hail_knowledge (
        user_id, storm_lookup_id, title, content, location, state, city, zip_code,
        date_range_start, date_range_end, total_events, hail_events, wind_events,
        tornado_events, max_hail_size, data_sources
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (storm_lookup_id) DO UPDATE SET
        content = EXCLUDED.content,
        date_range_start = EXCLUDED.date_range_start,
        date_range_end = EXCLUDED.date_range_end,
        total_events = EXCLUDED.total_events,
        hail_events = EXCLUDED.hail_events,
        wind_events = EXCLUDED.wind_events,
        tornado_events = EXCLUDED.tornado_events,
        max_hail_size = EXCLUDED.max_hail_size,
        updated_at = NOW()
      RETURNING *`,
      [
        lookup.userId,
        lookup.id,
        this.generateTitle(lookup),
        content,
        lookup.address,
        lookup.state || null,
        lookup.city || null,
        lookup.zipCode || null,
        dateRange.earliest || null,
        dateRange.latest || null,
        eventSummary.total,
        eventSummary.hail,
        eventSummary.wind,
        eventSummary.tornado,
        eventSummary.maxHailSize,
        JSON.stringify(lookup.dataSources)
      ]
    );

    return this.rowToDocument(result.rows[0]);
  }

  /**
   * Search hail knowledge for Susan's context
   */
  async searchKnowledge(params: HailKnowledgeSearchParams): Promise<HailKnowledgeDocument[]> {
    let query = `
      SELECT * FROM hail_knowledge
      WHERE 1=1
    `;
    const queryParams: any[] = [];
    let paramIndex = 1;

    // Filter by user
    if (params.userId) {
      query += ` AND user_id = $${paramIndex}`;
      queryParams.push(params.userId);
      paramIndex++;
    }

    // Filter by state
    if (params.state) {
      query += ` AND LOWER(state) = LOWER($${paramIndex})`;
      queryParams.push(params.state);
      paramIndex++;
    }

    // Filter by city
    if (params.city) {
      query += ` AND LOWER(city) LIKE LOWER($${paramIndex})`;
      queryParams.push(`%${params.city}%`);
      paramIndex++;
    }

    // Filter by ZIP code
    if (params.zipCode) {
      query += ` AND zip_code = $${paramIndex}`;
      queryParams.push(params.zipCode);
      paramIndex++;
    }

    // Filter by location (fuzzy match on address, city, state, ZIP)
    if (params.location) {
      query += ` AND (
        LOWER(location) LIKE LOWER($${paramIndex}) OR
        LOWER(city) LIKE LOWER($${paramIndex}) OR
        LOWER(state) LIKE LOWER($${paramIndex}) OR
        zip_code LIKE $${paramIndex}
      )`;
      queryParams.push(`%${params.location}%`);
      paramIndex++;
    }

    // Filter by date range
    if (params.dateFrom) {
      query += ` AND date_range_end >= $${paramIndex}`;
      queryParams.push(params.dateFrom);
      paramIndex++;
    }

    if (params.dateTo) {
      query += ` AND date_range_start <= $${paramIndex}`;
      queryParams.push(params.dateTo);
      paramIndex++;
    }

    // Filter by hail size
    if (params.minHailSize !== undefined) {
      query += ` AND max_hail_size >= $${paramIndex}`;
      queryParams.push(params.minHailSize);
      paramIndex++;
    }

    // Order by most recent and limit
    query += ` ORDER BY updated_at DESC LIMIT $${paramIndex}`;
    queryParams.push(params.limit || 20);

    const result = await this.pool.query(query, queryParams);
    return result.rows.map(this.rowToDocument);
  }

  /**
   * Get hail knowledge context for Susan's chat
   * Returns formatted text suitable for AI context
   */
  async getContextForChat(params: {
    userId: string;
    userQuery: string;
    state?: string;
    limit?: number;
  }): Promise<string> {
    // Extract location info from query
    const locationInfo = this.extractLocationFromQuery(params.userQuery);

    // Search for relevant knowledge
    const searchParams: HailKnowledgeSearchParams = {
      userId: params.userId,
      state: params.state || locationInfo.state,
      city: locationInfo.city,
      zipCode: locationInfo.zipCode,
      location: locationInfo.general,
      limit: params.limit || 5
    };

    const documents = await this.searchKnowledge(searchParams);

    if (documents.length === 0) {
      return '';
    }

    // Format as context for Susan
    const contextParts = [
      '**Recent Storm Reports (Saved by User):**',
      ''
    ];

    for (const doc of documents) {
      contextParts.push(`### ${doc.title}`);
      contextParts.push(`Location: ${doc.location}`);
      if (doc.state) contextParts.push(`State: ${doc.state}`);
      contextParts.push(`Events: ${doc.eventSummary.total} total (${doc.eventSummary.hail} hail, ${doc.eventSummary.wind} wind, ${doc.eventSummary.tornado} tornado)`);
      if (doc.eventSummary.maxHailSize) {
        contextParts.push(`Max Hail Size: ${doc.eventSummary.maxHailSize}" inches`);
      }
      contextParts.push(`Date Range: ${doc.dateRange.earliest} to ${doc.dateRange.latest}`);
      contextParts.push('');
      // Include key events from content
      const eventLines = doc.content.split('\n').filter(line => line.includes('•')).slice(0, 3);
      contextParts.push(...eventLines);
      contextParts.push('---');
      contextParts.push('');
    }

    return contextParts.join('\n');
  }

  /**
   * Generate searchable knowledge content from storm lookup
   */
  private generateKnowledgeContent(lookup: StormLookup): string {
    const parts: string[] = [];

    // Location summary
    parts.push(`Storm events for ${lookup.address}`);
    if (lookup.city && lookup.state) {
      parts.push(`Located in ${lookup.city}, ${lookup.state}${lookup.zipCode ? ' ' + lookup.zipCode : ''}`);
    }
    parts.push('');

    // Data sources
    const sources: string[] = [];
    if (lookup.dataSources.noaa) sources.push('NOAA');
    if (lookup.dataSources.ihm) sources.push('Interactive Hail Maps');
    parts.push(`Data verified from: ${sources.join(', ')}`);
    parts.push('');

    // Event details
    parts.push('**Storm Events:**');

    // Sort events by date (most recent first)
    const sortedEvents = [...lookup.stormEvents].sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    for (const event of sortedEvents) {
      const eventParts: string[] = [];

      // Date and type
      eventParts.push(`• ${event.date} - ${event.eventType.toUpperCase()}`);

      // Location details
      if (event.location || event.state) {
        eventParts.push(`  Location: ${event.location || event.state || 'Unknown'}`);
      }

      // Event magnitude
      if (event.eventType === 'hail' && event.magnitude) {
        eventParts.push(`  Hail Size: ${event.magnitude} ${event.magnitudeUnit}`);
      } else if (event.eventType === 'wind' && event.magnitude) {
        eventParts.push(`  Wind Speed: ${event.magnitude} ${event.magnitudeUnit}`);
      }

      // Data source
      eventParts.push(`  Source: ${event.source}`);

      // Narrative if available
      if (event.narrative) {
        eventParts.push(`  Details: ${event.narrative.substring(0, 200)}`);
      }

      parts.push(eventParts.join('\n'));
    }

    // Outcome if recorded
    if (lookup.outcome) {
      parts.push('');
      parts.push(`**Claim Outcome:** ${lookup.outcome.replace(/_/g, ' ').toUpperCase()}`);
      if (lookup.outcomeNotes) {
        parts.push(`Notes: ${lookup.outcomeNotes}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Generate a concise title for the knowledge document
   */
  private generateTitle(lookup: StormLookup): string {
    const location = lookup.city && lookup.state
      ? `${lookup.city}, ${lookup.state}`
      : lookup.state || lookup.zipCode || lookup.address;

    const eventCount = lookup.stormEvents.length;
    return `${eventCount} Storm Event${eventCount !== 1 ? 's' : ''} - ${location}`;
  }

  /**
   * Calculate date range from storm events
   */
  private calculateDateRange(events: StormEvent[]): { earliest: string; latest: string } {
    if (events.length === 0) {
      const now = new Date().toISOString().split('T')[0];
      return { earliest: now, latest: now };
    }

    const dates = events.map(e => e.date).filter(d => d).sort();
    return {
      earliest: dates[0],
      latest: dates[dates.length - 1]
    };
  }

  /**
   * Calculate event summary statistics
   */
  private calculateEventSummary(events: StormEvent[]): {
    total: number;
    hail: number;
    wind: number;
    tornado: number;
    maxHailSize: number | null;
  } {
    const summary = {
      total: events.length,
      hail: 0,
      wind: 0,
      tornado: 0,
      maxHailSize: null as number | null
    };

    for (const event of events) {
      if (event.eventType === 'hail') {
        summary.hail++;
        if (event.magnitude && (summary.maxHailSize === null || event.magnitude > summary.maxHailSize)) {
          summary.maxHailSize = event.magnitude;
        }
      } else if (event.eventType === 'wind') {
        summary.wind++;
      } else if (event.eventType === 'tornado') {
        summary.tornado++;
      }
    }

    return summary;
  }

  /**
   * Extract location information from user query
   */
  private extractLocationFromQuery(query: string): {
    state: string | null;
    city: string | null;
    zipCode: string | null;
    general: string | null;
  } {
    const result = {
      state: null as string | null,
      city: null as string | null,
      zipCode: null as string | null,
      general: null as string | null
    };

    const lowerQuery = query.toLowerCase();

    // Extract state (VA, MD, PA, Virginia, Maryland, Pennsylvania)
    const stateMap: Record<string, string> = {
      'virginia': 'VA',
      'va': 'VA',
      'maryland': 'MD',
      'md': 'MD',
      'pennsylvania': 'PA',
      'pa': 'PA'
    };

    for (const [key, value] of Object.entries(stateMap)) {
      if (lowerQuery.includes(key)) {
        result.state = value;
        break;
      }
    }

    // Extract ZIP code (5 digits)
    const zipMatch = query.match(/\b\d{5}\b/);
    if (zipMatch) {
      result.zipCode = zipMatch[0];
    }

    // Extract potential city names (common cities in VA, MD, PA)
    const cities = [
      'richmond', 'norfolk', 'virginia beach', 'chesapeake', 'arlington',
      'baltimore', 'frederick', 'rockville', 'gaithersburg', 'silver spring',
      'philadelphia', 'pittsburgh', 'harrisburg', 'allentown', 'erie',
      'washington', 'dc', 'd.c.'
    ];

    for (const city of cities) {
      if (lowerQuery.includes(city)) {
        result.city = city;
        break;
      }
    }

    // General location extraction (any word after "in", "near", "around")
    const locationMatch = query.match(/\b(?:in|near|around)\s+([a-z\s]+?)(?:\s|,|$)/i);
    if (locationMatch) {
      result.general = locationMatch[1].trim();
    }

    return result;
  }

  /**
   * Convert database row to HailKnowledgeDocument
   */
  private rowToDocument(row: any): HailKnowledgeDocument {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      content: row.content,
      location: row.location,
      state: row.state,
      city: row.city,
      zipCode: row.zip_code,
      dateRange: {
        earliest: row.date_range_start,
        latest: row.date_range_end
      },
      eventSummary: {
        total: row.total_events,
        hail: row.hail_events,
        wind: row.wind_events,
        tornado: row.tornado_events,
        maxHailSize: row.max_hail_size
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Delete hail knowledge when storm lookup is deleted
   */
  async deleteByStormLookupId(lookupId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM hail_knowledge WHERE storm_lookup_id = $1',
      [lookupId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Get knowledge document by ID
   */
  async getById(id: string): Promise<HailKnowledgeDocument | null> {
    const result = await this.pool.query(
      'SELECT * FROM hail_knowledge WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToDocument(result.rows[0]);
  }
}

/**
 * Create hail knowledge service instance
 */
export const createHailKnowledgeService = (pool: Pool): HailKnowledgeService => {
  return new HailKnowledgeService(pool);
};
