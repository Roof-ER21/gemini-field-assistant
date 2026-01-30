/**
 * Territory Management Routes
 * API endpoints for managing sales territories
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { createTerritoryService } from '../services/territoryService.js';

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

const router = Router();

/**
 * Auto-seed default territories if none exist
 */
async function seedDefaultTerritories(pool: Pool): Promise<void> {
  // First ensure unique constraint on name exists
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'territories_name_unique'
      ) THEN
        ALTER TABLE territories ADD CONSTRAINT territories_name_unique UNIQUE (name);
      END IF;
    END $$;
  `);

  // Check if default territories exist
  const check = await pool.query(
    "SELECT COUNT(*) FROM territories WHERE name IN ('DMV', 'PA', 'RA') AND archived_at IS NULL"
  );

  if (parseInt(check.rows[0].count) >= 3) {
    return; // Already seeded
  }

  console.log('🌱 Seeding default territories: DMV, PA, RA...');

  const territories = [
    {
      name: 'DMV',
      description: 'Northern Virginia & Maryland metro area',
      color: '#3b82f6',
      north_lat: 39.5, south_lat: 38.5,
      east_lng: -76.5, west_lng: -77.5,
      center_lat: 39.0, center_lng: -77.0
    },
    {
      name: 'PA',
      description: 'Pennsylvania state coverage',
      color: '#22c55e',
      north_lat: 42.3, south_lat: 39.7,
      east_lng: -74.7, west_lng: -80.5,
      center_lat: 41.0, center_lng: -77.5
    },
    {
      name: 'RA',
      description: 'Richmond, Virginia metro area',
      color: '#f59e0b',
      north_lat: 37.8, south_lat: 37.3,
      east_lng: -77.2, west_lng: -77.7,
      center_lat: 37.55, center_lng: -77.45
    }
  ];

  for (const t of territories) {
    await pool.query(
      `INSERT INTO territories (id, name, description, color, north_lat, south_lat, east_lng, west_lng, center_lat, center_lng, is_shared, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW(), NOW())
       ON CONFLICT (name) DO NOTHING`,
      [t.name, t.description, t.color, t.north_lat, t.south_lat, t.east_lng, t.west_lng, t.center_lat, t.center_lng]
    );
  }

  console.log('✅ Default territories seeded');
}

/**
 * GET /api/territories
 * Get all territories for the authenticated user
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

    // Auto-seed default territories if needed
    await seedDefaultTerritories(pool);

    const service = createTerritoryService(pool);
    const territories = await service.getUserTerritories(userId);

    res.json({
      success: true,
      territories,
    });
  } catch (error) {
    console.error('❌ Error getting territories:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/territories/leaderboard
 * Get territory performance leaderboard
 * NOTE: Must be before /:id to avoid being caught by parameterized route
 */
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const service = createTerritoryService(pool);
    const leaderboard = await service.getLeaderboard();
    res.json({ success: true, leaderboard });
  } catch (error) {
    console.error('❌ Error getting leaderboard:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/territories/find
 * Find territory containing a point
 * NOTE: Must be before /:id to avoid being caught by parameterized route
 */
router.get('/find', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng query parameters are required' });
    }
    const service = createTerritoryService(pool);
    const territory = await service.findTerritoryByPoint(
      parseFloat(lat as string),
      parseFloat(lng as string)
    );
    res.json({ success: true, territory });
  } catch (error) {
    console.error('❌ Error finding territory:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/territories/active-checkin
 * Get the user's active check-in
 * NOTE: Must be before /:id to avoid being caught by parameterized route
 */
router.get('/active-checkin', async (req: Request, res: Response) => {
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
    const service = createTerritoryService(pool);
    const checkIn = await service.getActiveCheckIn(userId);
    res.json({ success: true, checkIn });
  } catch (error) {
    console.error('❌ Error getting active check-in:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/territories/:id
 * Get a specific territory
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;

    const service = createTerritoryService(pool);
    const territory = await service.getTerritoryById(id);

    if (!territory) {
      return res.status(404).json({ error: 'Territory not found' });
    }

    res.json({
      success: true,
      territory,
    });
  } catch (error) {
    console.error('❌ Error getting territory:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/territories
 * Create a new territory
 */
router.post('/', async (req: Request, res: Response) => {
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

    const { name, description, color, northLat, southLat, eastLng, westLng, centerLat, centerLng } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Territory name is required' });
    }

    const service = createTerritoryService(pool);
    const territory = await service.createTerritory({
      name,
      description,
      color,
      ownerId: userId,
      northLat,
      southLat,
      eastLng,
      westLng,
      centerLat,
      centerLng,
    });

    res.status(201).json({
      success: true,
      territory,
    });
  } catch (error) {
    console.error('❌ Error creating territory:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * PUT /api/territories/:id
 * Update a territory
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const updates = req.body;

    const service = createTerritoryService(pool);
    const territory = await service.updateTerritory(id, updates);

    if (!territory) {
      return res.status(404).json({ error: 'Territory not found' });
    }

    res.json({
      success: true,
      territory,
    });
  } catch (error) {
    console.error('❌ Error updating territory:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * DELETE /api/territories/:id
 * Delete (archive) a territory
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;

    const service = createTerritoryService(pool);
    const deleted = await service.deleteTerritory(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Territory not found' });
    }

    res.json({
      success: true,
      message: 'Territory archived',
    });
  } catch (error) {
    console.error('❌ Error deleting territory:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/territories/:id/check-in
 * Check in to a territory
 */
router.post('/:id/check-in', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const userEmail = req.headers['x-user-email'] as string;
    const { id } = req.params;
    const { lat, lng } = req.body;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const service = createTerritoryService(pool);
    const checkIn = await service.checkIn(id, userId, lat, lng);

    res.status(201).json({
      success: true,
      checkIn,
    });
  } catch (error) {
    console.error('❌ Error checking in:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/territories/check-out/:checkInId
 * Check out of a territory
 */
router.post('/check-out/:checkInId', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { checkInId } = req.params;
    const { lat, lng, doorsKnocked, contactsMade, leadsGenerated, appointmentsSet, notes } = req.body;

    const service = createTerritoryService(pool);
    const checkOut = await service.checkOut(
      checkInId,
      { doorsKnocked, contactsMade, leadsGenerated, appointmentsSet, notes },
      lat,
      lng
    );

    if (!checkOut) {
      return res.status(404).json({ error: 'Check-in not found' });
    }

    res.json({
      success: true,
      checkOut,
    });
  } catch (error) {
    console.error('❌ Error checking out:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
