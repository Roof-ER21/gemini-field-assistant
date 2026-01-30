/**
 * Canvassing API Routes
 *
 * Endpoints for tracking door-to-door canvassing status, sessions, and stats.
 * Enables field reps to mark addresses, track follow-ups, and monitor performance.
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { createCanvassingService, CanvassingStatus } from '../services/canvassingService.js';

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
 * POST /api/canvassing/mark
 * Mark an address with a canvassing status
 *
 * Body:
 * {
 *   address: string;
 *   status: CanvassingStatus;
 *   streetAddress?: string;
 *   city?: string;
 *   state?: string;
 *   zipCode?: string;
 *   latitude?: number;
 *   longitude?: number;
 *   contactMethod?: string;
 *   homeownerName?: string;
 *   phoneNumber?: string;
 *   email?: string;
 *   notes?: string;
 *   followUpDate?: string;
 *   followUpNotes?: string;
 *   relatedStormEventId?: string;
 *   territory?: string;
 *   sessionId?: string;
 * }
 */
router.post('/mark', async (req: Request, res: Response) => {
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

    const { address, status } = req.body;

    // Validate required fields
    if (!address || !status) {
      return res.status(400).json({ error: 'address and status are required' });
    }

    const validStatuses: CanvassingStatus[] = [
      'not_contacted',
      'contacted',
      'no_answer',
      'return_visit',
      'not_interested',
      'interested',
      'lead',
      'appointment_set',
      'sold'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `status must be one of: ${validStatuses.join(', ')}`
      });
    }

    const service = createCanvassingService(pool);

    const entry = await service.markAddress({
      userId,
      address,
      status,
      ...req.body
    });

    console.log(`✅ Marked address: ${address} as ${status}`);

    res.json({
      success: true,
      entry
    });
  } catch (error) {
    console.error('❌ Error marking address:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/canvassing/area
 * Get canvassing entries for an area
 *
 * Query params:
 * - city?: string
 * - state?: string
 * - zipCode?: string
 * - territory?: string
 * - status?: CanvassingStatus
 * - userOnly?: boolean (default: false)
 * - limit?: number (default: 500)
 */
router.get('/area', async (req: Request, res: Response) => {
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
      city,
      state,
      zipCode,
      territory,
      status,
      userOnly = 'false',
      limit = '500'
    } = req.query;

    const service = createCanvassingService(pool);

    const entries = await service.getAreaCanvassing({
      city: city as string,
      state: state as string,
      zipCode: zipCode as string,
      territory: territory as string,
      status: status as CanvassingStatus,
      userId: userOnly === 'true' ? userId : undefined,
      limit: parseInt(limit as string)
    });

    res.json({
      success: true,
      count: entries.length,
      entries
    });
  } catch (error) {
    console.error('❌ Error getting area canvassing:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/canvassing/nearby
 * Get canvassing entries near coordinates
 *
 * Query params:
 * - lat: number (required)
 * - lng: number (required)
 * - radius: number (miles, default: 1)
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

    const { lat, lng, radius = '1' } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng query parameters are required' });
    }

    const latitude = parseFloat(lat as string);
    const longitude = parseFloat(lng as string);
    const radiusMiles = parseFloat(radius as string);

    if (isNaN(latitude) || isNaN(longitude) || isNaN(radiusMiles)) {
      return res.status(400).json({ error: 'Invalid latitude, longitude, or radius' });
    }

    const service = createCanvassingService(pool);

    const entries = await service.getNearbyCanvassing(latitude, longitude, radiusMiles);

    res.json({
      success: true,
      count: entries.length,
      radiusMiles,
      entries
    });
  } catch (error) {
    console.error('❌ Error getting nearby canvassing:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/canvassing/follow-ups
 * Get addresses needing follow-up
 *
 * Query params:
 * - userOnly?: boolean (default: true)
 * - territory?: string
 */
router.get('/follow-ups', async (req: Request, res: Response) => {
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

    const { userOnly = 'true', territory } = req.query;

    const service = createCanvassingService(pool);

    const followUps = await service.getFollowUpList(
      userOnly === 'true' ? userId : undefined,
      territory as string
    );

    res.json({
      success: true,
      count: followUps.length,
      followUps
    });
  } catch (error) {
    console.error('❌ Error getting follow-ups:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/canvassing/sessions
 * Start a canvassing session
 *
 * Body:
 * {
 *   targetCity?: string;
 *   targetState?: string;
 *   targetZipCode?: string;
 *   targetTerritory?: string;
 *   stormEventId?: string;
 *   notes?: string;
 * }
 */
router.post('/sessions', async (req: Request, res: Response) => {
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

    const service = createCanvassingService(pool);

    const session = await service.startSession({
      userId,
      ...req.body
    });

    console.log(`✅ Started canvassing session: ${session.id}`);

    res.json({
      success: true,
      session
    });
  } catch (error) {
    console.error('❌ Error starting session:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * PUT /api/canvassing/sessions/:id/end
 * End a canvassing session
 */
router.put('/sessions/:id/end', async (req: Request, res: Response) => {
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

    const { id } = req.params;

    const service = createCanvassingService(pool);

    const session = await service.endSession(id);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    console.log(`✅ Ended canvassing session: ${id}`);

    res.json({
      success: true,
      session
    });
  } catch (error) {
    console.error('❌ Error ending session:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/canvassing/sessions
 * Get session history for the user
 *
 * Query params:
 * - limit?: number (default: 50)
 */
router.get('/sessions', async (req: Request, res: Response) => {
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

    const { limit = '50' } = req.query;

    const service = createCanvassingService(pool);

    const sessions = await service.getSessionHistory(userId, parseInt(limit as string));

    res.json({
      success: true,
      count: sessions.length,
      sessions
    });
  } catch (error) {
    console.error('❌ Error getting session history:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/canvassing/stats
 * Get user canvassing statistics
 *
 * Query params:
 * - daysBack?: number (default: 30)
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

    const { daysBack = '30' } = req.query;

    const service = createCanvassingService(pool);

    const stats = await service.getUserStats(userId, parseInt(daysBack as string));

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
 * GET /api/canvassing/team-stats
 * Get team canvassing statistics
 *
 * Query params:
 * - daysBack?: number (default: 30)
 */
router.get('/team-stats', async (req: Request, res: Response) => {
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

    const { daysBack = '30' } = req.query;

    const service = createCanvassingService(pool);

    const stats = await service.getTeamStats(parseInt(daysBack as string));

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('❌ Error getting team stats:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/canvassing/heatmap
 * Get heatmap data for canvassing success by area
 */
router.get('/heatmap', async (req: Request, res: Response) => {
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

    const service = createCanvassingService(pool);

    const heatmapData = await service.getHeatmapData();

    res.json({
      success: true,
      count: heatmapData.length,
      heatmap: heatmapData
    });
  } catch (error) {
    console.error('❌ Error getting heatmap:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
