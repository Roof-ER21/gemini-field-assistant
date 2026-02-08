/**
 * Check-In API Routes
 *
 * Endpoints for managing sales rep check-ins and check-outs.
 * Enables real-time tracking of field activities with location and session stats.
 */
import { Router } from 'express';
import { createCheckinService } from '../services/checkinService.js';
const router = Router();
// Get pool from app
const getPool = (req) => {
    return req.app.get('pool');
};
// Get user ID from email header
const getUserIdFromEmail = async (pool, email) => {
    const result = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    return result.rows[0]?.id || null;
};
/**
 * POST /api/checkin
 * Start a new check-in session
 *
 * Body:
 * {
 *   location_lat: number;
 *   location_lng: number;
 *   notes?: string;
 * }
 *
 * Headers:
 *   x-user-email: string
 */
router.post('/', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({
                success: false,
                error: 'x-user-email header is required'
            });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        const { location_lat, location_lng, notes } = req.body;
        // Validate required fields
        if (location_lat === undefined || location_lng === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Latitude and longitude are required'
            });
        }
        // Validate coordinates
        if (typeof location_lat !== 'number' || typeof location_lng !== 'number') {
            return res.status(400).json({
                success: false,
                error: 'Latitude and longitude must be numbers'
            });
        }
        if (location_lat < -90 || location_lat > 90 || location_lng < -180 || location_lng > 180) {
            return res.status(400).json({
                success: false,
                error: 'Invalid coordinates'
            });
        }
        const checkinService = createCheckinService(pool);
        const session = await checkinService.startCheckin(userId, location_lat, location_lng, notes);
        res.json({
            success: true,
            data: session
        });
    }
    catch (error) {
        console.error('Error starting check-in:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to start check-in'
        });
    }
});
/**
 * POST /api/checkout
 * End a check-in session (finds user's active session automatically)
 *
 * Body:
 * {
 *   doors_knocked: number;
 *   contacts_made: number;
 *   leads_generated: number;
 *   appointments_set: number;
 * }
 *
 * Headers:
 *   x-user-email: string
 */
router.post('/checkout', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({
                success: false,
                error: 'x-user-email header is required'
            });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        // Get user's active session
        const checkinService = createCheckinService(pool);
        const activeSession = await checkinService.getUserActiveSession(userId);
        if (!activeSession) {
            return res.status(404).json({
                success: false,
                error: 'No active check-in session found'
            });
        }
        const { doors_knocked, contacts_made, leads_generated, appointments_set } = req.body;
        // Validate stats
        if (typeof doors_knocked !== 'number' ||
            typeof contacts_made !== 'number' ||
            typeof leads_generated !== 'number' ||
            typeof appointments_set !== 'number') {
            return res.status(400).json({
                success: false,
                error: 'All stats fields must be numbers'
            });
        }
        if (doors_knocked < 0 ||
            contacts_made < 0 ||
            leads_generated < 0 ||
            appointments_set < 0) {
            return res.status(400).json({
                success: false,
                error: 'Stats values cannot be negative'
            });
        }
        // Use check-in location as check-out location
        const session = await checkinService.endCheckin(activeSession.id, userId, {
            doorsKnocked: doors_knocked,
            contactsMade: contacts_made,
            leadsGenerated: leads_generated,
            appointmentsSet: appointments_set
        }, activeSession.checkInLat || 0, activeSession.checkInLng || 0);
        res.json({
            success: true,
            data: session
        });
    }
    catch (error) {
        console.error('Error ending check-in:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to end check-in'
        });
    }
});
/**
 * GET /api/checkins/active
 * Get all active check-ins (company-wide)
 */
router.get('/active', async (req, res) => {
    try {
        const pool = getPool(req);
        const checkinService = createCheckinService(pool);
        const activeCheckins = await checkinService.getActiveCheckins();
        // Transform to match frontend format
        const checkIns = activeCheckins.map(session => ({
            id: session.id,
            user_id: session.userId,
            user_name: session.userName,
            user_email: session.userEmail,
            checkin_time: session.checkInTime,
            checkout_time: session.checkOutTime || null,
            location_lat: session.checkInLat || null,
            location_lng: session.checkInLng || null,
            location_name: null,
            notes: session.notes || null,
            doors_knocked: session.doorsKnocked || null,
            contacts_made: session.contactsMade || null,
            leads_generated: session.leadsGenerated || null,
            appointments_set: session.appointmentsSet || null
        }));
        res.json({
            success: true,
            checkIns
        });
    }
    catch (error) {
        console.error('Error fetching active check-ins:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch active check-ins'
        });
    }
});
/**
 * GET /api/checkin/my-session
 * Get current user's active check-in session (or null)
 *
 * Headers:
 *   x-user-email: string
 */
router.get('/my-session', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({
                success: false,
                error: 'x-user-email header is required'
            });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        const checkinService = createCheckinService(pool);
        const session = await checkinService.getUserActiveSession(userId);
        res.json({
            success: true,
            data: session
        });
    }
    catch (error) {
        console.error('Error fetching user session:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch user session'
        });
    }
});
/**
 * GET /api/checkin/history
 * Get check-in history for current user
 *
 * Query params:
 *   limit?: number (default 50)
 *
 * Headers:
 *   x-user-email: string
 */
router.get('/history', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({
                success: false,
                error: 'x-user-email header is required'
            });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        const limit = parseInt(req.query.limit) || 50;
        const checkinService = createCheckinService(pool);
        const history = await checkinService.getUserCheckinHistory(userId, limit);
        res.json({
            success: true,
            data: history
        });
    }
    catch (error) {
        console.error('Error fetching check-in history:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch check-in history'
        });
    }
});
/**
 * GET /api/checkin/stats
 * Get check-in statistics for current user
 *
 * Query params:
 *   days?: number (default 30)
 *
 * Headers:
 *   x-user-email: string
 */
router.get('/stats', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({
                success: false,
                error: 'x-user-email header is required'
            });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        const days = parseInt(req.query.days) || 30;
        const checkinService = createCheckinService(pool);
        const stats = await checkinService.getUserCheckinStats(userId, days);
        res.json({
            success: true,
            data: stats
        });
    }
    catch (error) {
        console.error('Error fetching check-in stats:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch check-in stats'
        });
    }
});
/**
 * PUT /api/checkin/:id/notes
 * Update notes for a check-in session
 *
 * Body:
 * {
 *   notes: string;
 * }
 *
 * Headers:
 *   x-user-email: string
 */
router.put('/:id/notes', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({
                success: false,
                error: 'x-user-email header is required'
            });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        const { id } = req.params;
        const { notes } = req.body;
        // Validate check-in belongs to user
        const checkResult = await pool.query('SELECT * FROM territory_checkins WHERE id = $1 AND user_id = $2', [id, userId]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Check-in session not found or does not belong to user'
            });
        }
        // Update notes
        const result = await pool.query('UPDATE territory_checkins SET notes = $1 WHERE id = $2 RETURNING *', [notes || null, id]);
        res.json({
            success: true,
            data: result.rows[0]
        });
    }
    catch (error) {
        console.error('Error updating check-in notes:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to update check-in notes'
        });
    }
});
export default router;
