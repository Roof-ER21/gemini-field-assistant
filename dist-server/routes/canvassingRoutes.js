/**
 * Canvassing API Routes
 *
 * Endpoints for tracking door-to-door canvassing status, sessions, and stats.
 * Enables field reps to mark addresses, track follow-ups, and monitor performance.
 */
import { Router } from 'express';
import { createCanvassingService } from '../services/canvassingService.js';
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
 *   // Neighborhood Intel fields
 *   homeownerPhone?: string;
 *   homeownerEmail?: string;
 *   propertyNotes?: string;
 *   bestContactTime?: string;
 *   propertyType?: string;
 *   roofType?: string;
 *   roofAgeYears?: number;
 *   autoMonitor?: boolean;
 *   linkedPropertyId?: string;
 * }
 */
router.post('/mark', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
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
        const validStatuses = [
            'not_contacted',
            'contacted',
            'no_answer',
            'return_visit',
            'not_interested',
            'interested',
            'lead',
            'appointment_set',
            'sold',
            'customer'
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
    }
    catch (error) {
        console.error('❌ Error marking address:', error);
        res.status(500).json({ error: error.message });
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
router.get('/area', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { city, state, zipCode, territory, status, userOnly = 'false', limit = '500' } = req.query;
        const service = createCanvassingService(pool);
        const entries = await service.getAreaCanvassing({
            city: city,
            state: state,
            zipCode: zipCode,
            territory: territory,
            status: status,
            userId: userOnly === 'true' ? userId : undefined,
            limit: parseInt(limit)
        });
        res.json({
            success: true,
            count: entries.length,
            entries
        });
    }
    catch (error) {
        console.error('❌ Error getting area canvassing:', error);
        res.status(500).json({ error: error.message });
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
router.get('/nearby', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
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
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);
        const radiusMiles = parseFloat(radius);
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
    }
    catch (error) {
        console.error('❌ Error getting nearby canvassing:', error);
        res.status(500).json({ error: error.message });
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
router.get('/follow-ups', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { userOnly = 'true', territory } = req.query;
        const service = createCanvassingService(pool);
        const followUps = await service.getFollowUpList(userOnly === 'true' ? userId : undefined, territory);
        res.json({
            success: true,
            count: followUps.length,
            followUps
        });
    }
    catch (error) {
        console.error('❌ Error getting follow-ups:', error);
        res.status(500).json({ error: error.message });
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
router.post('/sessions', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
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
    }
    catch (error) {
        console.error('❌ Error starting session:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * PUT /api/canvassing/sessions/:id/end
 * End a canvassing session
 */
router.put('/sessions/:id/end', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
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
    }
    catch (error) {
        console.error('❌ Error ending session:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/canvassing/sessions
 * Get session history for the user
 *
 * Query params:
 * - limit?: number (default: 50)
 */
router.get('/sessions', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { limit = '50' } = req.query;
        const service = createCanvassingService(pool);
        const sessions = await service.getSessionHistory(userId, parseInt(limit));
        res.json({
            success: true,
            count: sessions.length,
            sessions
        });
    }
    catch (error) {
        console.error('❌ Error getting session history:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/canvassing/stats
 * Get user canvassing statistics
 *
 * Query params:
 * - daysBack?: number (default: 30)
 */
router.get('/stats', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { daysBack = '30' } = req.query;
        const service = createCanvassingService(pool);
        const stats = await service.getUserStats(userId, parseInt(daysBack));
        res.json({
            success: true,
            stats
        });
    }
    catch (error) {
        console.error('❌ Error getting stats:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/canvassing/team-stats
 * Get team canvassing statistics
 *
 * Query params:
 * - daysBack?: number (default: 30)
 */
router.get('/team-stats', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { daysBack = '30' } = req.query;
        const service = createCanvassingService(pool);
        const stats = await service.getTeamStats(parseInt(daysBack));
        res.json({
            success: true,
            stats
        });
    }
    catch (error) {
        console.error('❌ Error getting team stats:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/canvassing/heatmap
 * Get heatmap data for canvassing success by area
 */
router.get('/heatmap', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
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
    }
    catch (error) {
        console.error('❌ Error getting heatmap:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/canvassing/intel
 * Get neighborhood intelligence for an area
 *
 * Query params:
 * - lat: number (required)
 * - lng: number (required)
 * - radius: number (miles, default: 0.5)
 */
router.get('/intel', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { lat, lng, radius = '0.5' } = req.query;
        if (!lat || !lng) {
            return res.status(400).json({ error: 'lat and lng query parameters are required' });
        }
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);
        const radiusMiles = parseFloat(radius);
        if (isNaN(latitude) || isNaN(longitude) || isNaN(radiusMiles)) {
            return res.status(400).json({ error: 'Invalid latitude, longitude, or radius' });
        }
        const service = createCanvassingService(pool);
        const intel = await service.getNeighborhoodIntel(latitude, longitude, radiusMiles);
        res.json({
            success: true,
            count: intel.length,
            radiusMiles,
            intel
        });
    }
    catch (error) {
        console.error('❌ Error getting neighborhood intel:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/canvassing/intel/stats
 * Get team-wide neighborhood intel statistics
 */
router.get('/intel/stats', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const service = createCanvassingService(pool);
        const stats = await service.getTeamIntelStats();
        res.json({
            success: true,
            stats
        });
    }
    catch (error) {
        console.error('❌ Error getting intel stats:', error);
        res.status(500).json({ error: error.message });
    }
});
export default router;
