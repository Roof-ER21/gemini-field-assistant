/**
 * Leaderboard Service
 * Connects to both Gemini and RoofTrack databases to provide combined leaderboard data
 */
import pg from 'pg';
const { Pool } = pg;
// RoofTrack database connection
const rooftrackDbUrl = process.env.ROOFTRACK_DATABASE_URL;
// Debug: Log connection info (hide password)
if (rooftrackDbUrl) {
    const masked = rooftrackDbUrl.replace(/:[^:@]+@/, ':****@');
    console.log('🔗 RoofTrack DB URL configured:', masked);
}
else {
    console.error('❌ ROOFTRACK_DATABASE_URL not set!');
}
const rooftrackPool = new Pool({
    connectionString: rooftrackDbUrl,
    ssl: { rejectUnauthorized: false }
});
// Test RoofTrack connection on startup
rooftrackPool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ RoofTrack database connection error:', err.message);
    }
    else {
        console.log('✅ RoofTrack database connected at', res.rows[0].now);
    }
});
// Bonus tier names
const BONUS_TIER_NAMES = [
    'Rookie', // 0: 0-14 signups
    'Bronze', // 1: 15+ signups
    'Silver', // 2: 20+ signups
    'Gold', // 3: 25+ signups
    'Platinum', // 4: 30+ signups
    'Diamond', // 5: 35+ signups
    'Elite' // 6: 40+ signups
];
export function createLeaderboardService(geminiPool) {
    /**
     * Get all sales reps from RoofTrack database
     */
    async function getRoofTrackSalesReps() {
        try {
            const result = await rooftrackPool.query(`
        SELECT
          id, name, email, team, territory_id,
          monthly_revenue, yearly_revenue, all_time_revenue,
          monthly_signups, yearly_signups,
          goal_progress, current_bonus_tier, is_active
        FROM sales.sales_reps
        WHERE is_active = true
        ORDER BY monthly_signups DESC, monthly_revenue DESC
      `);
            return result.rows;
        }
        catch (error) {
            console.error('Error fetching RoofTrack sales reps:', error);
            return [];
        }
    }
    /**
     * Get player profiles for gamification data
     */
    async function getRoofTrackPlayerProfiles() {
        try {
            const result = await rooftrackPool.query(`
        SELECT
          id, sales_rep_id, player_level,
          total_career_points, season_points, monthly_points,
          current_streak, longest_streak
        FROM sales.player_profiles
      `);
            const profileMap = new Map();
            for (const row of result.rows) {
                profileMap.set(row.sales_rep_id, row);
            }
            return profileMap;
        }
        catch (error) {
            console.error('Error fetching RoofTrack player profiles:', error);
            return new Map();
        }
    }
    /**
     * Get user mappings from Gemini database
     */
    async function getUserMappings() {
        try {
            const result = await geminiPool.query(`
        SELECT gemini_user_id, rooftrack_sales_rep_id
        FROM rooftrack_user_mapping
        WHERE rooftrack_sales_rep_id IS NOT NULL
      `);
            const mappings = new Map();
            for (const row of result.rows) {
                // Map RoofTrack ID -> Gemini ID
                mappings.set(row.rooftrack_sales_rep_id, row.gemini_user_id);
            }
            return mappings;
        }
        catch (error) {
            console.error('Error fetching user mappings:', error);
            return new Map();
        }
    }
    /**
     * Get Gemini canvassing stats for a user
     */
    async function getGeminiCanvassingStats(userId) {
        try {
            const result = await geminiPool.query(`
        SELECT
          COALESCE(SUM(doors_knocked), 0)::int as doors_knocked_30d,
          COALESCE(SUM(leads_generated), 0)::int as leads_generated_30d,
          COALESCE(SUM(appointments_set), 0)::int as appointments_set_30d
        FROM canvassing_sessions
        WHERE user_id = $1
        AND session_date >= CURRENT_DATE - INTERVAL '30 days'
      `, [userId]);
            return result.rows[0] || { doors_knocked_30d: 0, leads_generated_30d: 0, appointments_set_30d: 0 };
        }
        catch (error) {
            console.error('Error fetching Gemini canvassing stats:', error);
            return { doors_knocked_30d: 0, leads_generated_30d: 0, appointments_set_30d: 0 };
        }
    }
    /**
     * Get combined leaderboard merging RoofTrack and Gemini data
     */
    async function getCombinedLeaderboard(sortBy = 'monthly_signups', limit = 50) {
        // Fetch all data in parallel
        const [salesReps, playerProfiles, userMappings] = await Promise.all([
            getRoofTrackSalesReps(),
            getRoofTrackPlayerProfiles(),
            getUserMappings()
        ]);
        // Build combined entries
        const entries = [];
        for (const rep of salesReps) {
            const profile = playerProfiles.get(rep.id);
            const geminiUserId = userMappings.get(rep.id);
            // Get Gemini stats if user is mapped
            let canvassingStats = {
                doors_knocked_30d: 0,
                leads_generated_30d: 0,
                appointments_set_30d: 0
            };
            if (geminiUserId) {
                canvassingStats = await getGeminiCanvassingStats(geminiUserId);
            }
            entries.push({
                rank: 0, // Will be set after sorting
                gemini_user_id: geminiUserId || null,
                rooftrack_sales_rep_id: rep.id,
                name: rep.name,
                email: rep.email,
                team: rep.team,
                monthly_revenue: parseFloat(rep.monthly_revenue) || 0,
                yearly_revenue: parseFloat(rep.yearly_revenue) || 0,
                all_time_revenue: parseFloat(rep.all_time_revenue) || 0,
                monthly_signups: rep.monthly_signups || 0,
                yearly_signups: rep.yearly_signups || 0,
                goal_progress: parseFloat(rep.goal_progress) || 0,
                bonus_tier: rep.current_bonus_tier || 0,
                bonus_tier_name: BONUS_TIER_NAMES[rep.current_bonus_tier || 0],
                player_level: profile?.player_level || 1,
                career_points: profile?.total_career_points || 0,
                current_streak: profile?.current_streak || 0,
                doors_knocked_30d: canvassingStats.doors_knocked_30d,
                leads_generated_30d: canvassingStats.leads_generated_30d,
                appointments_set_30d: canvassingStats.appointments_set_30d
            });
        }
        // Sort by requested field
        entries.sort((a, b) => {
            switch (sortBy) {
                case 'monthly_revenue':
                    return b.monthly_revenue - a.monthly_revenue;
                case 'yearly_revenue':
                    return b.yearly_revenue - a.yearly_revenue;
                case 'doors_knocked':
                    return b.doors_knocked_30d - a.doors_knocked_30d;
                case 'monthly_signups':
                default:
                    return b.monthly_signups - a.monthly_signups;
            }
        });
        // Assign ranks and limit
        return entries.slice(0, limit).map((entry, index) => ({
            ...entry,
            rank: index + 1
        }));
    }
    /**
     * Get leaderboard position for a specific user
     */
    async function getUserLeaderboardPosition(email) {
        const leaderboard = await getCombinedLeaderboard('monthly_signups', 1000);
        const totalUsers = leaderboard.length;
        const userIndex = leaderboard.findIndex(entry => entry.email.toLowerCase() === email.toLowerCase());
        if (userIndex === -1) {
            return { user: null, rank: 0, totalUsers, nearbyCompetitors: [] };
        }
        const user = leaderboard[userIndex];
        const rank = userIndex + 1;
        // Get 2 users above and 2 below
        const startIndex = Math.max(0, userIndex - 2);
        const endIndex = Math.min(leaderboard.length, userIndex + 3);
        const nearbyCompetitors = leaderboard.slice(startIndex, endIndex);
        return { user, rank, totalUsers, nearbyCompetitors };
    }
    /**
     * Get overall leaderboard statistics
     */
    async function getLeaderboardStats() {
        try {
            const result = await rooftrackPool.query(`
        SELECT
          COUNT(*) as total_reps,
          COALESCE(SUM(monthly_revenue::numeric), 0) as total_revenue,
          COALESCE(SUM(monthly_signups), 0) as total_signups,
          COALESCE(AVG(monthly_revenue::numeric), 0) as avg_revenue,
          COALESCE(AVG(monthly_signups), 0) as avg_signups
        FROM sales.sales_reps
        WHERE is_active = true
      `);
            const stats = result.rows[0];
            // Get top performer
            const topResult = await rooftrackPool.query(`
        SELECT name, monthly_signups
        FROM sales.sales_reps
        WHERE is_active = true
        ORDER BY monthly_signups DESC
        LIMIT 1
      `);
            const topPerformer = topResult.rows[0]
                ? { name: topResult.rows[0].name, signups: topResult.rows[0].monthly_signups }
                : null;
            // Get tier distribution
            const tierResult = await rooftrackPool.query(`
        SELECT current_bonus_tier, COUNT(*) as count
        FROM sales.sales_reps
        WHERE is_active = true
        GROUP BY current_bonus_tier
        ORDER BY current_bonus_tier
      `);
            const tierDistribution = {};
            for (const row of tierResult.rows) {
                const tierName = BONUS_TIER_NAMES[row.current_bonus_tier] || 'Unknown';
                tierDistribution[tierName] = parseInt(row.count);
            }
            return {
                totalReps: parseInt(stats.total_reps),
                totalRevenue: parseFloat(stats.total_revenue),
                totalSignups: parseInt(stats.total_signups),
                avgMonthlyRevenue: parseFloat(stats.avg_revenue),
                avgMonthlySignups: parseFloat(stats.avg_signups),
                topPerformer,
                tierDistribution
            };
        }
        catch (error) {
            console.error('Error fetching leaderboard stats:', error);
            return {
                totalReps: 0,
                totalRevenue: 0,
                totalSignups: 0,
                avgMonthlyRevenue: 0,
                avgMonthlySignups: 0,
                topPerformer: null,
                tierDistribution: {}
            };
        }
    }
    /**
     * Sync user mappings - match Gemini users to RoofTrack by email
     */
    async function syncUserMappings() {
        try {
            // Get all Gemini users
            const geminiUsers = await geminiPool.query(`
        SELECT id, email FROM users WHERE is_active = true
      `);
            // Get all RoofTrack sales reps
            const rooftrackReps = await rooftrackPool.query(`
        SELECT id, email FROM sales.sales_reps WHERE is_active = true
      `);
            // Build email -> RoofTrack ID map
            const rooftrackEmailMap = new Map();
            for (const rep of rooftrackReps.rows) {
                rooftrackEmailMap.set(rep.email.toLowerCase(), rep.id);
            }
            let mapped = 0;
            for (const user of geminiUsers.rows) {
                const rooftrackId = rooftrackEmailMap.get(user.email.toLowerCase());
                if (rooftrackId) {
                    // Upsert mapping
                    await geminiPool.query(`
            INSERT INTO rooftrack_user_mapping (gemini_user_id, rooftrack_sales_rep_id, rooftrack_email, last_sync_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (gemini_user_id)
            DO UPDATE SET
              rooftrack_sales_rep_id = $2,
              rooftrack_email = $3,
              last_sync_at = NOW()
          `, [user.id, rooftrackId, user.email.toLowerCase()]);
                    mapped++;
                }
            }
            console.log(`✅ [LEADERBOARD] Synced ${mapped} of ${geminiUsers.rows.length} users`);
            return { mapped, total: geminiUsers.rows.length };
        }
        catch (error) {
            console.error('Error syncing user mappings:', error);
            return { mapped: 0, total: 0 };
        }
    }
    return {
        getRoofTrackSalesReps,
        getRoofTrackPlayerProfiles,
        getCombinedLeaderboard,
        getUserLeaderboardPosition,
        getLeaderboardStats,
        syncUserMappings,
        rooftrackPool // Expose for testing
    };
}
