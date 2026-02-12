/**
 * Storm Memory API Routes
 *
 * Endpoints for storing and retrieving verified storm lookups.
 * Enables Susan AI to learn from past storm verifications.
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { createStormMemoryService, SaveStormLookupParams } from '../services/stormMemoryService.js';
import { createHailKnowledgeService } from '../services/hailKnowledgeService.js';

const router = Router();

// Get pool from app
const getPool = (req: Request): Pool => {
  return req.app.get('pool');
};

// Get user ID from email header
const getUserIdFromEmail = async (pool: Pool, email: string): Promise<string | null> => {
  const result = await pool.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  return result.rows[0]?.id || null;
};

/**
 * POST /api/storm-memory/save
 * Save a verified storm lookup
 *
 * Body:
 * {
 *   address: string;
 *   city?: string;
 *   state?: string;
 *   zipCode?: string;
 *   latitude: number;
 *   longitude: number;
 *   stormEvents: StormEvent[];
 *   dataSources: { noaa?: boolean; ihm?: boolean };
 * }
 */
router.post('/save', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const {
      address,
      city,
      state,
      zipCode,
      latitude,
      longitude,
      stormEvents,
      dataSources
    } = req.body;

    // Validate required fields
    if (!address || latitude === undefined || longitude === undefined || !stormEvents) {
      return res.status(400).json({
        error: 'address, latitude, longitude, and stormEvents are required'
      });
    }

    if (!Array.isArray(stormEvents)) {
      return res.status(400).json({ error: 'stormEvents must be an array' });
    }

    const service = createStormMemoryService(pool);

    const params: SaveStormLookupParams = {
      userId,
      address,
      city,
      state,
      zipCode,
      latitude,
      longitude,
      stormEvents,
      dataSources: dataSources || {}
    };

    const lookup = await service.saveStormLookup(params);

    console.log(`✅ Saved storm lookup: ${address} (${stormEvents.length} events)`);

    // Index for Susan AI knowledge base
    try {
      const knowledgeService = createHailKnowledgeService(pool);
      await knowledgeService.indexStormLookup(lookup);
      console.log(`✅ Indexed storm lookup for Susan AI: ${lookup.id}`);
    } catch (error) {
      console.error('⚠️ Failed to index storm lookup for Susan AI:', error);
      // Don't fail the request if indexing fails
    }

    res.json({
      success: true,
      lookup
    });
  } catch (error) {
    console.error('❌ Error saving storm lookup:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/storm-memory/nearby
 * Find storm lookups within a radius
 *
 * Query params:
 * - lat: number (required)
 * - lng: number (required)
 * - radius: number (miles, default: 10)
 * - userOnly: boolean (default: false) - only return current user's lookups
 */
router.get('/nearby', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { lat, lng, radius = '10', userOnly = 'false' } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng query parameters are required' });
    }

    const latitude = parseFloat(lat as string);
    const longitude = parseFloat(lng as string);
    const radiusMiles = parseFloat(radius as string);

    if (isNaN(latitude) || isNaN(longitude) || isNaN(radiusMiles)) {
      return res.status(400).json({ error: 'Invalid latitude, longitude, or radius' });
    }

    const service = createStormMemoryService(pool);

    const nearbyStorms = await service.findNearbyStorms(
      latitude,
      longitude,
      radiusMiles,
      userOnly === 'true' ? userId : undefined
    );

    res.json({
      success: true,
      count: nearbyStorms.length,
      radiusMiles,
      results: nearbyStorms
    });
  } catch (error) {
    console.error('❌ Error finding nearby storms:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/storm-memory/by-zip/:zipCode
 * Get storm lookups by ZIP code
 */
router.get('/by-zip/:zipCode', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { zipCode } = req.params;
    const { userOnly = 'false' } = req.query;

    const service = createStormMemoryService(pool);

    const lookups = await service.getStormsByZipCode(
      zipCode,
      userOnly === 'true' ? userId : undefined
    );

    res.json({
      success: true,
      zipCode,
      count: lookups.length,
      lookups
    });
  } catch (error) {
    console.error('❌ Error getting storms by ZIP:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/storm-memory/by-city
 * Get storm lookups by city and state
 *
 * Query params:
 * - city: string (required)
 * - state: string (required)
 * - userOnly: boolean (default: false)
 */
router.get('/by-city', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { city, state, userOnly = 'false' } = req.query;

    if (!city || !state) {
      return res.status(400).json({ error: 'city and state query parameters are required' });
    }

    const service = createStormMemoryService(pool);

    const lookups = await service.getStormsByCity(
      city as string,
      state as string,
      userOnly === 'true' ? userId : undefined
    );

    res.json({
      success: true,
      city,
      state,
      count: lookups.length,
      lookups
    });
  } catch (error) {
    console.error('❌ Error getting storms by city:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/storm-memory/outcome
 * Record the outcome of a storm lookup (claim won/lost)
 *
 * Body:
 * {
 *   lookupId: string;
 *   outcome: 'claim_won' | 'claim_lost' | 'pending' | 'not_pursued';
 *   outcomeNotes?: string;
 * }
 */
router.post('/outcome', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { lookupId, outcome, outcomeNotes } = req.body;

    if (!lookupId || !outcome) {
      return res.status(400).json({ error: 'lookupId and outcome are required' });
    }

    const validOutcomes = ['claim_won', 'claim_lost', 'pending', 'not_pursued'];
    if (!validOutcomes.includes(outcome)) {
      return res.status(400).json({
        error: `outcome must be one of: ${validOutcomes.join(', ')}`
      });
    }

    const service = createStormMemoryService(pool);

    // Verify the lookup belongs to the user
    const lookup = await service.getLookupById(lookupId);
    if (!lookup) {
      return res.status(404).json({ error: 'Storm lookup not found' });
    }

    if (lookup.userId !== userId) {
      return res.status(403).json({ error: 'You can only update your own lookups' });
    }

    const updatedLookup = await service.recordOutcome(lookupId, outcome, outcomeNotes);

    console.log(`✅ Recorded outcome for lookup ${lookupId}: ${outcome}`);

    res.json({
      success: true,
      lookup: updatedLookup
    });
  } catch (error) {
    console.error('❌ Error recording outcome:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/storm-memory/stats
 * Get statistics about storm lookups
 *
 * Query params:
 * - userOnly: boolean (default: false) - storm data is universal
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { userOnly = 'false' } = req.query;

    const service = createStormMemoryService(pool);

    const stats = await service.getStormStats(
      userOnly === 'true' ? userId : undefined
    );

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('❌ Error getting stats:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/storm-memory/search
 * Search storm events by criteria
 *
 * Query params:
 * - eventType?: 'hail' | 'wind' | 'tornado'
 * - minMagnitude?: number
 * - dateFrom?: string (YYYY-MM-DD)
 * - dateTo?: string (YYYY-MM-DD)
 * - userOnly?: boolean (default: false) - storm data is universal
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { eventType, minMagnitude, dateFrom, dateTo, userOnly = 'false' } = req.query;

    const service = createStormMemoryService(pool);

    const lookups = await service.searchStormEvents({
      userId: userOnly === 'true' ? userId : undefined,
      eventType: eventType as any,
      minMagnitude: minMagnitude ? parseFloat(minMagnitude as string) : undefined,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string
    });

    res.json({
      success: true,
      count: lookups.length,
      lookups
    });
  } catch (error) {
    console.error('❌ Error searching storm events:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/storm-memory/:lookupId
 * Get a specific storm lookup by ID
 */
router.get('/:lookupId', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { lookupId } = req.params;

    const service = createStormMemoryService(pool);
    const lookup = await service.getLookupById(lookupId);

    if (!lookup) {
      return res.status(404).json({ error: 'Storm lookup not found' });
    }

    // Storm data is universal - any authenticated user can view any lookup (read-only)
    res.json({
      success: true,
      lookup
    });
  } catch (error) {
    console.error('❌ Error getting lookup:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * DELETE /api/storm-memory/:lookupId
 * Delete a storm lookup
 */
router.delete('/:lookupId', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { lookupId } = req.params;

    const service = createStormMemoryService(pool);
    const deleted = await service.deleteLookup(lookupId, userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Storm lookup not found or access denied' });
    }

    // Also delete from knowledge base
    try {
      const knowledgeService = createHailKnowledgeService(pool);
      await knowledgeService.deleteByStormLookupId(lookupId);
      console.log(`✅ Deleted hail knowledge for lookup: ${lookupId}`);
    } catch (error) {
      console.error('⚠️ Failed to delete hail knowledge:', error);
      // Don't fail the request if knowledge deletion fails
    }

    console.log(`✅ Deleted storm lookup: ${lookupId}`);

    res.json({
      success: true,
      message: 'Storm lookup deleted'
    });
  } catch (error) {
    console.error('❌ Error deleting lookup:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/storm-memory/by-address
 * Get storm lookup by address string
 *
 * Query params:
 * - address: string (required)
 */
router.get('/by-address', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { address } = req.query;

    if (!address) {
      return res.status(400).json({ error: 'address query parameter is required' });
    }

    const service = createStormMemoryService(pool);

    // Search for exact or similar address match across ALL users (storm data is universal)
    const { userOnly = 'false' } = req.query;
    const result = await pool.query(
      userOnly === 'true'
        ? `SELECT * FROM storm_lookups
           WHERE user_id = $1 AND LOWER(address) LIKE LOWER($2)
           ORDER BY created_at DESC LIMIT 1`
        : `SELECT * FROM storm_lookups
           WHERE LOWER(address) LIKE LOWER($1)
           ORDER BY created_at DESC LIMIT 1`,
      userOnly === 'true' ? [userId, `%${address}%`] : [`%${address}%`]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, lookup: null });
    }

    const lookup = service['rowToStormLookup'](result.rows[0]);

    res.json({
      success: true,
      lookup
    });
  } catch (error) {
    console.error('❌ Error getting lookup by address:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/storm-memory/recent
 * Get recent storm lookups for the user
 *
 * Query params:
 * - limit?: number (default: 10)
 * - daysBack?: number (default: 30)
 */
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { limit = '10', daysBack = '30', userOnly = 'false' } = req.query;
    const limitNum = parseInt(limit as string, 10);
    const daysBackNum = parseInt(daysBack as string, 10);

    const service = createStormMemoryService(pool);

    // Storm data is universal by default - all reps benefit from verified lookups
    const result = await pool.query(
      userOnly === 'true'
        ? `SELECT * FROM storm_lookups
           WHERE user_id = $1
             AND created_at > NOW() - INTERVAL '${daysBackNum} days'
           ORDER BY created_at DESC LIMIT $2`
        : `SELECT * FROM storm_lookups
           WHERE created_at > NOW() - INTERVAL '${daysBackNum} days'
           ORDER BY created_at DESC LIMIT $1`,
      userOnly === 'true' ? [userId, limitNum] : [limitNum]
    );

    const lookups = result.rows.map((row: any) => service['rowToStormLookup'](row));

    res.json({
      success: true,
      count: lookups.length,
      lookups
    });
  } catch (error) {
    console.error('❌ Error getting recent lookups:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * PUT /api/storm-memory/:lookupId/outcome
 * Update the outcome of a storm lookup
 *
 * Body:
 * {
 *   outcome: 'claim_won' | 'claim_lost' | 'pending' | 'not_pursued';
 *   outcomeNotes?: string;
 * }
 */
router.put('/:lookupId/outcome', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { lookupId } = req.params;
    const { outcome, outcomeNotes } = req.body;

    if (!outcome) {
      return res.status(400).json({ error: 'outcome is required' });
    }

    const validOutcomes = ['claim_won', 'claim_lost', 'pending', 'not_pursued'];
    if (!validOutcomes.includes(outcome)) {
      return res.status(400).json({
        error: `outcome must be one of: ${validOutcomes.join(', ')}`
      });
    }

    const service = createStormMemoryService(pool);

    // Verify the lookup belongs to the user
    const lookup = await service.getLookupById(lookupId);
    if (!lookup) {
      return res.status(404).json({ error: 'Storm lookup not found' });
    }

    if (lookup.userId !== userId) {
      return res.status(403).json({ error: 'You can only update your own lookups' });
    }

    const updatedLookup = await service.recordOutcome(lookupId, outcome, outcomeNotes);

    console.log(`✅ Updated outcome for lookup ${lookupId}: ${outcome}`);

    res.json({
      success: true,
      lookup: updatedLookup
    });
  } catch (error) {
    console.error('❌ Error updating outcome:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/storm-memory/knowledge/context
 * Get hail knowledge context for Susan AI chat
 *
 * Query params:
 * - query: string (required) - User's chat query
 * - state?: string - User's state (VA, MD, PA)
 * - limit?: number (default: 5)
 */
router.get('/knowledge/context', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { query, state, limit = '5' } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query parameter is required' });
    }

    const knowledgeService = createHailKnowledgeService(pool);

    // Storm knowledge is universal - query across all users
    const context = await knowledgeService.getContextForChat({
      userQuery: query,
      state: state as string | undefined,
      limit: parseInt(limit as string, 10)
    });

    res.json({
      success: true,
      context,
      hasContext: context.length > 0
    });
  } catch (error) {
    console.error('❌ Error getting hail knowledge context:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/storm-memory
 * Get all storm lookups for the current user
 *
 * Query params:
 * - limit?: number (default: 100)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { limit = '100' } = req.query;
    const limitNum = parseInt(limit as string, 10);

    const service = createStormMemoryService(pool);
    const lookups = await service.getLookupsByUser(userId, limitNum);

    res.json({
      success: true,
      count: lookups.length,
      lookups
    });
  } catch (error) {
    console.error('❌ Error getting user lookups:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
