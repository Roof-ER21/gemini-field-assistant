/**
 * Leaderboard API Routes
 * Provides endpoints for sales leaderboard with Google Sheets data
 */
import { Router } from 'express';
import { createLeaderboardService } from '../services/leaderboardService.js';
import { createSheetsService } from '../services/sheetsService.js';
import { syncTeamsFromNeon, getTeams, getTerritories, getTeamMembers } from '../services/teamSyncService.js';
const CRON_TIMEZONE = 'America/New_York';
function getTimezoneOffsetMinutes(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: 'shortOffset',
        hour: '2-digit'
    });
    const tzName = formatter
        .formatToParts(date)
        .find(part => part.type === 'timeZoneName')?.value;
    if (!tzName)
        return 0;
    const match = tzName.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
    if (!match)
        return 0;
    const hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    return hours * 60 + (hours >= 0 ? minutes : -minutes);
}
function makeDateInTimeZone(year, month, day, hour, minute, timeZone) {
    const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
    const offsetMinutes = getTimezoneOffsetMinutes(new Date(utcGuess), timeZone);
    return new Date(utcGuess - offsetMinutes * 60 * 1000);
}
function getNextSyncTime(timeZone) {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
    const parts = formatter.formatToParts(now).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});
    const year = parseInt(parts.year, 10);
    const month = parseInt(parts.month, 10);
    const day = parseInt(parts.day, 10);
    const hour = parseInt(parts.hour, 10);
    const minute = parseInt(parts.minute, 10);
    let targetHour = 8;
    let dayOffset = 0;
    if (hour > 20 || (hour === 20 && minute > 0)) {
        targetHour = 8;
        dayOffset = 1;
    }
    else if (hour > 8 || (hour === 8 && minute > 0)) {
        targetHour = 20;
    }
    const baseDate = new Date(Date.UTC(year, month - 1, day));
    baseDate.setUTCDate(baseDate.getUTCDate() + dayOffset);
    const targetDate = makeDateInTimeZone(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, baseDate.getUTCDate(), targetHour, 0, timeZone);
    const localLabel = `${baseDate.getUTCFullYear()}-${String(baseDate.getUTCMonth() + 1).padStart(2, '0')}-${String(baseDate.getUTCDate()).padStart(2, '0')} ${String(targetHour).padStart(2, '0')}:00 ${timeZone}`;
    return {
        iso: targetDate.toISOString(),
        local: localLabel
    };
}
export function createLeaderboardRoutes(pool) {
    const router = Router();
    const leaderboardService = createLeaderboardService(pool);
    async function isAdminUser(email) {
        if (!email)
            return false;
        try {
            const result = await pool.query('SELECT role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
            if (result.rows[0]?.role === 'admin') {
                return true;
            }
        }
        catch (error) {
            console.error('❌ Leaderboard admin check failed:', error);
        }
        const fallbackAdmin = process.env.EMAIL_ADMIN_ADDRESS;
        return !!(fallbackAdmin && fallbackAdmin.toLowerCase() === email.toLowerCase());
    }
    /**
     * GET /api/leaderboard
     * Get combined leaderboard with sales + Gemini data
     * Query params: sortBy, limit, year, month, teamId, territoryId
     */
    router.get('/', async (req, res) => {
        try {
            const sortBy = req.query.sortBy || 'monthly_signups';
            const limit = parseInt(req.query.limit) || 50;
            const yearParam = req.query.year;
            const monthParam = req.query.month;
            const teamIdParam = req.query.teamId;
            const territoryIdParam = req.query.territoryId;
            const parsedYear = yearParam ? parseInt(yearParam, 10) : undefined;
            const parsedMonth = monthParam ? parseInt(monthParam, 10) : undefined;
            const year = parsedYear && parsedYear > 2000 ? parsedYear : undefined;
            const month = year && parsedMonth && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : undefined;
            const teamId = teamIdParam ? parseInt(teamIdParam, 10) : undefined;
            const territoryId = territoryIdParam ? parseInt(territoryIdParam, 10) : undefined;
            const normalizedSort = sortBy === 'doors_knocked_30d' ? 'doors_knocked' : sortBy;
            const validSortFields = ['monthly_revenue', 'yearly_revenue', 'monthly_signups', 'doors_knocked', 'all_time_revenue'];
            const sortField = validSortFields.includes(normalizedSort) ? normalizedSort : 'monthly_signups';
            const filters = {};
            if (year) {
                filters.year = year;
                if (month)
                    filters.month = month;
            }
            if (teamId && !isNaN(teamId))
                filters.teamId = teamId;
            if (territoryId && !isNaN(territoryId))
                filters.territoryId = territoryId;
            const leaderboard = await leaderboardService.getCombinedLeaderboard(sortField, Math.min(limit, 100), Object.keys(filters).length > 0 ? filters : undefined);
            if (leaderboard.length === 0) {
                return res.json({
                    success: true,
                    comingSoon: true,
                    count: 0,
                    sortBy: sortField,
                    year: year || null,
                    month: month || null,
                    teamId: teamId || null,
                    territoryId: territoryId || null,
                    entries: [],
                    message: 'Leaderboard data coming soon - Google Sheets sync in progress'
                });
            }
            res.json({
                success: true,
                count: leaderboard.length,
                sortBy: sortField,
                year: year || null,
                month: month || null,
                teamId: teamId || null,
                territoryId: territoryId || null,
                entries: leaderboard
            });
        }
        catch (error) {
            console.error('❌ Leaderboard fetch error:', error);
            res.json({
                success: false,
                comingSoon: true,
                count: 0,
                entries: [],
                error: 'Leaderboard temporarily unavailable'
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
            const sortBy = req.query.sortBy || 'monthly_signups';
            const yearParam = req.query.year;
            const monthParam = req.query.month;
            const teamIdParam = req.query.teamId;
            const territoryIdParam = req.query.territoryId;
            const parsedYear = yearParam ? parseInt(yearParam, 10) : undefined;
            const parsedMonth = monthParam ? parseInt(monthParam, 10) : undefined;
            const year = parsedYear && parsedYear > 2000 ? parsedYear : undefined;
            const month = year && parsedMonth && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : undefined;
            const teamId = teamIdParam ? parseInt(teamIdParam, 10) : undefined;
            const territoryId = territoryIdParam ? parseInt(territoryIdParam, 10) : undefined;
            if (!userEmail) {
                return res.status(401).json({
                    success: false,
                    error: 'User email required'
                });
            }
            const normalizedSort = sortBy === 'doors_knocked_30d' ? 'doors_knocked' : sortBy;
            const validSortFields = ['monthly_revenue', 'yearly_revenue', 'monthly_signups', 'doors_knocked', 'all_time_revenue'];
            const sortField = validSortFields.includes(normalizedSort) ? normalizedSort : 'monthly_signups';
            const filters = {};
            if (year) {
                filters.year = year;
                if (month)
                    filters.month = month;
            }
            if (teamId && !isNaN(teamId))
                filters.teamId = teamId;
            if (territoryId && !isNaN(territoryId))
                filters.territoryId = territoryId;
            const position = await leaderboardService.getUserLeaderboardPosition(userEmail, sortField, Object.keys(filters).length > 0 ? filters : undefined);
            if (!position.user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found in leaderboard',
                    hint: 'User may not be synced from Google Sheets or not active'
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
            const yearParam = _req.query.year;
            const monthParam = _req.query.month;
            const teamIdParam = _req.query.teamId;
            const territoryIdParam = _req.query.territoryId;
            const parsedYear = yearParam ? parseInt(yearParam, 10) : undefined;
            const parsedMonth = monthParam ? parseInt(monthParam, 10) : undefined;
            const year = parsedYear && parsedYear > 2000 ? parsedYear : undefined;
            const month = year && parsedMonth && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : undefined;
            const teamId = teamIdParam ? parseInt(teamIdParam, 10) : undefined;
            const territoryId = territoryIdParam ? parseInt(territoryIdParam, 10) : undefined;
            const filters = {};
            if (year) {
                filters.year = year;
                if (month)
                    filters.month = month;
            }
            if (teamId && !isNaN(teamId))
                filters.teamId = teamId;
            if (territoryId && !isNaN(territoryId))
                filters.territoryId = territoryId;
            const stats = await leaderboardService.getLeaderboardStats(Object.keys(filters).length > 0 ? filters : undefined);
            res.json({
                success: true,
                year: year || null,
                month: month || null,
                ...stats
            });
        }
        catch (error) {
            console.error('❌ Leaderboard stats error:', error);
            res.json({
                success: false,
                totalReps: 0,
                totalRevenue: 0,
                totalSignups: 0,
                avgMonthlyRevenue: 0,
                avgMonthlySignups: 0,
                topPerformer: null,
                tierDistribution: {}
            });
        }
    });
    /**
     * POST /api/leaderboard/sync
     * Manually trigger Google Sheets sync (admin only)
     */
    router.post('/sync', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            if (!userEmail || !(await isAdminUser(userEmail))) {
                return res.status(403).json({
                    success: false,
                    error: 'Admin access required'
                });
            }
            if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
                return res.status(400).json({
                    success: false,
                    error: 'Google Sheets credentials not configured'
                });
            }
            const sheetsService = createSheetsService(pool);
            const result = await sheetsService.performFullSync();
            res.json({
                success: result.success,
                message: result.message,
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
     * GET /api/leaderboard/sync-status
     * Check last sync status and next scheduled run
     */
    router.get('/sync-status', async (_req, res) => {
        try {
            const userEmail = _req.headers['x-user-email'];
            if (!userEmail || !(await isAdminUser(userEmail))) {
                return res.status(403).json({
                    success: false,
                    error: 'Admin access required'
                });
            }
            const lastSyncResult = await pool.query(`SELECT
          sync_type,
          records_synced,
          records_created,
          records_updated,
          records_deleted,
          error_message,
          started_at,
          completed_at
         FROM sheets_sync_log
         ORDER BY completed_at DESC NULLS LAST
         LIMIT 1`);
            const countResult = await pool.query(`SELECT COUNT(*) as total
         FROM sales_reps
         WHERE is_active = true`);
            const lastSync = lastSyncResult.rows[0] || null;
            const nextSync = getNextSyncTime(CRON_TIMEZONE);
            res.json({
                success: true,
                lastSync: lastSync?.completed_at || lastSync?.started_at || null,
                lastSyncStatus: lastSync?.error_message ? 'error' : lastSync ? 'success' : 'never',
                lastSyncError: lastSync?.error_message || null,
                lastSyncDetails: lastSync
                    ? {
                        type: lastSync.sync_type,
                        recordsSynced: lastSync.records_synced || 0,
                        recordsCreated: lastSync.records_created || 0,
                        recordsUpdated: lastSync.records_updated || 0,
                        recordsDeleted: lastSync.records_deleted || 0
                    }
                    : null,
                nextSync: nextSync.iso,
                nextSyncLocal: nextSync.local,
                timezone: CRON_TIMEZONE,
                recordCount: parseInt(countResult.rows[0]?.total || '0', 10)
            });
        }
        catch (error) {
            console.error('❌ Leaderboard sync status error:', error);
            res.json({
                success: false,
                error: error.message,
                nextSync: null,
                recordCount: 0
            });
        }
    });
    /**
     * GET /api/leaderboard/teams
     * Get all teams with their leaders
     */
    router.get('/teams', async (_req, res) => {
        try {
            const teams = await getTeams();
            res.json({
                success: true,
                count: teams.length,
                teams
            });
        }
        catch (error) {
            console.error('❌ Teams fetch error:', error);
            res.json({
                success: false,
                count: 0,
                teams: [],
                error: error.message
            });
        }
    });
    /**
     * GET /api/leaderboard/territories
     * Get all territories
     */
    router.get('/territories', async (_req, res) => {
        try {
            const territories = await getTerritories();
            res.json({
                success: true,
                count: territories.length,
                territories
            });
        }
        catch (error) {
            console.error('❌ Territories fetch error:', error);
            res.json({
                success: false,
                count: 0,
                territories: [],
                error: error.message
            });
        }
    });
    /**
     * GET /api/leaderboard/teams/:id/members
     * Get members of a specific team
     */
    router.get('/teams/:id/members', async (req, res) => {
        try {
            const teamId = parseInt(req.params.id, 10);
            if (isNaN(teamId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid team ID'
                });
            }
            const members = await getTeamMembers(teamId);
            res.json({
                success: true,
                teamId,
                count: members.length,
                members
            });
        }
        catch (error) {
            console.error('❌ Team members fetch error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    /**
     * POST /api/leaderboard/sync-teams
     * Sync teams and territories from Neon database (admin only)
     */
    router.post('/sync-teams', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            if (!userEmail || !(await isAdminUser(userEmail))) {
                return res.status(403).json({
                    success: false,
                    error: 'Admin access required'
                });
            }
            const result = await syncTeamsFromNeon();
            res.json({
                success: result.success,
                message: result.success ? 'Team sync completed' : 'Team sync failed',
                teams: result.teamsSync,
                territories: result.territoriesSync,
                salesReps: result.repsSync,
                errors: result.errors
            });
        }
        catch (error) {
            console.error('❌ Team sync error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    return router;
}
export default createLeaderboardRoutes;
