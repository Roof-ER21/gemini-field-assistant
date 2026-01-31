/**
 * Leaderboard API Routes
 * Provides endpoints for sales leaderboard with RoofTrack data
 */
import { Router } from 'express';
import { createLeaderboardService } from '../services/leaderboardService.js';
export function createLeaderboardRoutes(pool) {
    const router = Router();
    const leaderboardService = createLeaderboardService(pool);
    /**
     * GET /api/leaderboard
     * Get combined leaderboard with RoofTrack + Gemini data
     */
    router.get('/', async (req, res) => {
        try {
            const sortBy = req.query.sortBy || 'monthly_signups';
            const limit = parseInt(req.query.limit) || 50;
            // Validate sortBy
            const validSortFields = ['monthly_revenue', 'yearly_revenue', 'monthly_signups', 'doors_knocked'];
            const sortField = validSortFields.includes(sortBy) ? sortBy : 'monthly_signups';
            const leaderboard = await leaderboardService.getCombinedLeaderboard(sortField, Math.min(limit, 100) // Cap at 100
            );
            res.json({
                success: true,
                count: leaderboard.length,
                sortBy: sortField,
                entries: leaderboard
            });
        }
        catch (error) {
            console.error('❌ Leaderboard fetch error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    /**
     * GET /api/leaderboard/me
     * Get current user's leaderboard position
     */
    router.get('/me', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            if (!userEmail) {
                return res.status(401).json({
                    success: false,
                    error: 'User email required'
                });
            }
            const position = await leaderboardService.getUserLeaderboardPosition(userEmail);
            if (!position.user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found in leaderboard',
                    hint: 'User may not be mapped to RoofTrack or not active'
                });
            }
            res.json({
                success: true,
                ...position
            });
        }
        catch (error) {
            console.error('❌ Leaderboard position error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    /**
     * GET /api/leaderboard/stats
     * Get overall leaderboard statistics
     */
    router.get('/stats', async (_req, res) => {
        try {
            const stats = await leaderboardService.getLeaderboardStats();
            res.json({
                success: true,
                ...stats
            });
        }
        catch (error) {
            console.error('❌ Leaderboard stats error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    /**
     * POST /api/leaderboard/sync
     * Manually trigger user mapping sync (admin only)
     */
    router.post('/sync', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            // Basic admin check (should be enhanced with proper auth)
            if (!userEmail || !userEmail.includes('admin') && !userEmail.includes('ahmed')) {
                return res.status(403).json({
                    success: false,
                    error: 'Admin access required'
                });
            }
            const result = await leaderboardService.syncUserMappings();
            res.json({
                success: true,
                message: `Synced ${result.mapped} of ${result.total} users`,
                ...result
            });
        }
        catch (error) {
            console.error('❌ Leaderboard sync error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    /**
     * GET /api/leaderboard/rooftrack-status
     * Check RoofTrack database connection status
     */
    router.get('/rooftrack-status', async (_req, res) => {
        try {
            // Check if env var is set
            const dbUrl = process.env.ROOFTRACK_DATABASE_URL;
            const isConfigured = !!dbUrl;
            const maskedUrl = dbUrl ? dbUrl.replace(/:[^:@]+@/, ':****@') : 'NOT SET';
            if (!isConfigured) {
                return res.json({
                    success: false,
                    connected: false,
                    configured: false,
                    error: 'ROOFTRACK_DATABASE_URL environment variable not set',
                    hint: 'Add ROOFTRACK_DATABASE_URL to Railway environment variables'
                });
            }
            const result = await leaderboardService.rooftrackPool.query('SELECT NOW() as time, COUNT(*) as reps FROM sales_reps WHERE is_active = true');
            res.json({
                success: true,
                connected: true,
                configured: true,
                maskedUrl,
                serverTime: result.rows[0].time,
                activeReps: parseInt(result.rows[0].reps)
            });
        }
        catch (error) {
            const dbUrl = process.env.ROOFTRACK_DATABASE_URL;
            const maskedUrl = dbUrl ? dbUrl.replace(/:[^:@]+@/, ':****@') : 'NOT SET';
            console.error('❌ RoofTrack status check error:', error);
            res.json({
                success: false,
                connected: false,
                configured: !!dbUrl,
                maskedUrl,
                error: error.message
            });
        }
    });
    return router;
}
export default createLeaderboardRoutes;
