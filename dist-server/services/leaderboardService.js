/**
 * Leaderboard Service
 * Provides leaderboard data from local database (synced from Google Sheets)
 */
// Flag to indicate whether the leaderboard is ready
// Set to true once Google Sheets integration is complete
const LEADERBOARD_READY = true;
// Bonus tier names
const BONUS_TIER_NAMES = [
    'Rookie',
    'Bronze',
    'Silver',
    'Gold',
    'Platinum',
    'Diamond',
    'Elite'
];
function toNumber(value) {
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}
export function createLeaderboardService(geminiPool) {
    async function getYearlyMetrics(year) {
        try {
            const result = await geminiPool.query(`SELECT sales_rep_id, signups, estimates, revenue
         FROM sales_rep_yearly_metrics
         WHERE year = $1`, [year]);
            const map = new Map();
            for (const row of result.rows) {
                map.set(String(row.sales_rep_id), row);
            }
            return map;
        }
        catch (error) {
            console.warn('[LEADERBOARD] Yearly metrics unavailable:', error.message);
            return new Map();
        }
    }
    async function getMonthlyMetrics(year, month) {
        try {
            const result = await geminiPool.query(`SELECT sales_rep_id, signups, estimates, revenue
         FROM sales_rep_monthly_metrics
         WHERE year = $1 AND month = $2`, [year, month]);
            const map = new Map();
            for (const row of result.rows) {
                map.set(String(row.sales_rep_id), row);
            }
            return map;
        }
        catch (error) {
            console.warn('[LEADERBOARD] Monthly metrics unavailable:', error.message);
            return new Map();
        }
    }
    function pickRevenue(metric) {
        if (!metric)
            return 0;
        const revenue = toNumber(metric.revenue);
        if (revenue > 0)
            return revenue;
        return toNumber(metric.estimates);
    }
    /**
     * Check if leaderboard is ready
     */
    function isReady() {
        return LEADERBOARD_READY;
    }
    /**
     * Get all sales reps from database
     */
    async function getSalesReps() {
        if (!isReady()) {
            return [];
        }
        try {
            const result = await geminiPool.query(`SELECT
          id, name, email, team,
          monthly_revenue, yearly_revenue, all_time_revenue,
          monthly_signups, yearly_signups,
          goal_progress, current_bonus_tier, is_active
         FROM sales_reps
         WHERE is_active = true
         ORDER BY monthly_signups DESC, monthly_revenue DESC`);
            return result.rows;
        }
        catch (error) {
            console.error('[LEADERBOARD] Error fetching sales reps:', error);
            return [];
        }
    }
    /**
     * Get player profiles for gamification data
     */
    async function getPlayerProfiles() {
        try {
            const result = await geminiPool.query(`SELECT
          id,
          sales_rep_id,
          COALESCE(player_level, 1) as player_level,
          COALESCE(total_career_points, 0) as total_career_points,
          COALESCE(season_points, 0) as season_points,
          COALESCE(monthly_points, 0) as monthly_points,
          COALESCE(current_streak, 0) as current_streak,
          COALESCE(longest_streak, 0) as longest_streak
         FROM player_profiles`);
            const profileMap = new Map();
            for (const row of result.rows) {
                profileMap.set(String(row.sales_rep_id), row);
            }
            return profileMap;
        }
        catch (error) {
            console.warn('[LEADERBOARD] Could not fetch player profile data:', error.message);
            return new Map();
        }
    }
    /**
     * Map sales reps to Gemini users
     * Priority: 1) Manual mappings in user_sales_rep_mapping table
     *           2) Automatic email matching
     */
    async function getUserMappings() {
        try {
            const mappings = new Map();
            // First: Get manual mappings (higher priority)
            try {
                const manualResult = await geminiPool.query(`SELECT sales_rep_id, user_id as gemini_user_id
           FROM user_sales_rep_mapping`);
                for (const row of manualResult.rows) {
                    mappings.set(String(row.sales_rep_id), row.gemini_user_id);
                }
            }
            catch {
                // Table may not exist yet, continue with email matching
            }
            // Second: Get email-based mappings for reps not in manual mappings
            const emailResult = await geminiPool.query(`SELECT
          s.id as sales_rep_id,
          u.id as gemini_user_id
         FROM sales_reps s
         JOIN users u ON LOWER(u.email) = LOWER(s.email)
         WHERE s.is_active = true`);
            for (const row of emailResult.rows) {
                // Only add if not already in manual mappings
                if (!mappings.has(String(row.sales_rep_id))) {
                    mappings.set(String(row.sales_rep_id), row.gemini_user_id);
                }
            }
            return mappings;
        }
        catch (error) {
            console.error('[LEADERBOARD] Error fetching user mappings:', error);
            return new Map();
        }
    }
    /**
     * Get Gemini canvassing stats for a user
     */
    async function getGeminiCanvassingStats(userId) {
        try {
            const result = await geminiPool.query(`SELECT
          COALESCE(SUM(doors_knocked), 0)::int as doors_knocked_30d,
          COALESCE(SUM(leads_generated), 0)::int as leads_generated_30d,
          COALESCE(SUM(appointments_set), 0)::int as appointments_set_30d
         FROM canvassing_sessions
         WHERE user_id = $1
           AND session_date >= CURRENT_DATE - INTERVAL '30 days'`, [userId]);
            return result.rows[0] || {
                doors_knocked_30d: 0,
                leads_generated_30d: 0,
                appointments_set_30d: 0
            };
        }
        catch (error) {
            console.error('[LEADERBOARD] Error fetching canvassing stats:', error);
            return { doors_knocked_30d: 0, leads_generated_30d: 0, appointments_set_30d: 0 };
        }
    }
    /**
     * Get combined leaderboard merging sales + Gemini data
     */
    async function getCombinedLeaderboard(sortBy = 'monthly_signups', limit = 50, filters) {
        const filterYear = filters?.year;
        const filterMonth = filters?.month;
        const [salesReps, playerProfiles, userMappings] = await Promise.all([
            getSalesReps(),
            getPlayerProfiles(),
            getUserMappings()
        ]);
        let yearlyMetrics = new Map();
        let monthlyMetrics = new Map();
        if (filterYear) {
            yearlyMetrics = await getYearlyMetrics(filterYear);
            if (filterMonth) {
                monthlyMetrics = await getMonthlyMetrics(filterYear, filterMonth);
            }
        }
        const entries = [];
        for (const rep of salesReps) {
            const repId = String(rep.id);
            const profile = playerProfiles.get(repId);
            const geminiUserId = userMappings.get(repId);
            const yearMetric = filterYear ? yearlyMetrics.get(repId) : null;
            const monthMetric = filterYear && filterMonth ? monthlyMetrics.get(repId) : null;
            let canvassingStats = {
                doors_knocked_30d: 0,
                leads_generated_30d: 0,
                appointments_set_30d: 0
            };
            if (geminiUserId) {
                canvassingStats = await getGeminiCanvassingStats(geminiUserId);
            }
            const bonusTier = rep.current_bonus_tier ?? 0;
            const monthlySignups = filterYear
                ? (filterMonth ? toNumber(monthMetric?.signups) : toNumber(yearMetric?.signups))
                : toNumber(rep.monthly_signups);
            const monthlyRevenue = filterYear
                ? (filterMonth ? pickRevenue(monthMetric) : pickRevenue(yearMetric))
                : toNumber(rep.monthly_revenue);
            const yearlySignups = filterYear ? toNumber(yearMetric?.signups) : toNumber(rep.yearly_signups);
            const yearlyRevenue = filterYear ? pickRevenue(yearMetric) : toNumber(rep.yearly_revenue);
            entries.push({
                rank: 0,
                gemini_user_id: geminiUserId || null,
                rooftrack_sales_rep_id: repId,
                name: rep.name,
                email: rep.email || '',
                team: rep.team,
                monthly_revenue: monthlyRevenue,
                yearly_revenue: yearlyRevenue,
                all_time_revenue: toNumber(rep.all_time_revenue),
                monthly_signups: monthlySignups,
                yearly_signups: yearlySignups,
                goal_progress: toNumber(rep.goal_progress),
                bonus_tier: bonusTier,
                bonus_tier_name: BONUS_TIER_NAMES[bonusTier] || 'Rookie',
                player_level: profile?.player_level || 1,
                career_points: profile?.total_career_points || 0,
                current_streak: profile?.current_streak || 0,
                doors_knocked_30d: canvassingStats.doors_knocked_30d,
                leads_generated_30d: canvassingStats.leads_generated_30d,
                appointments_set_30d: canvassingStats.appointments_set_30d
            });
        }
        entries.sort((a, b) => {
            switch (sortBy) {
                case 'monthly_revenue':
                    return b.monthly_revenue - a.monthly_revenue;
                case 'yearly_revenue':
                    return b.yearly_revenue - a.yearly_revenue;
                case 'all_time_revenue':
                    return b.all_time_revenue - a.all_time_revenue;
                case 'doors_knocked':
                    return b.doors_knocked_30d - a.doors_knocked_30d;
                case 'monthly_signups':
                default:
                    return b.monthly_signups - a.monthly_signups;
            }
        });
        return entries.slice(0, limit).map((entry, index) => ({
            ...entry,
            rank: index + 1
        }));
    }
    /**
     * Get leaderboard position for a specific user
     */
    async function getUserLeaderboardPosition(email, sortBy = 'monthly_signups', filters) {
        const leaderboard = await getCombinedLeaderboard(sortBy, 1000, filters);
        const totalUsers = leaderboard.length;
        const userIndex = leaderboard.findIndex(entry => entry.email && entry.email.toLowerCase() === email.toLowerCase());
        if (userIndex === -1) {
            return { user: null, rank: 0, totalUsers, nearbyCompetitors: [] };
        }
        const user = leaderboard[userIndex];
        const rank = userIndex + 1;
        const startIndex = Math.max(0, userIndex - 2);
        const endIndex = Math.min(leaderboard.length, userIndex + 3);
        const nearbyCompetitors = leaderboard.slice(startIndex, endIndex);
        return { user, rank, totalUsers, nearbyCompetitors };
    }
    /**
     * Get overall leaderboard statistics
     */
    async function getLeaderboardStats(filters) {
        try {
            const filterYear = filters?.year;
            const filterMonth = filters?.month;
            let result;
            if (filterYear && filterMonth) {
                result = await geminiPool.query(`SELECT
            COUNT(s.id) as total_reps,
            COALESCE(SUM(COALESCE(m.revenue::numeric, m.estimates::numeric, 0)), 0) as total_revenue,
            COALESCE(SUM(COALESCE(m.signups::numeric, 0)), 0) as total_signups,
            COALESCE(AVG(COALESCE(m.revenue::numeric, m.estimates::numeric, 0)), 0) as avg_revenue,
            COALESCE(AVG(COALESCE(m.signups::numeric, 0)), 0) as avg_signups
           FROM sales_reps s
           LEFT JOIN sales_rep_monthly_metrics m
             ON m.sales_rep_id = s.id
            AND m.year = $1
            AND m.month = $2
           WHERE s.is_active = true`, [filterYear, filterMonth]);
            }
            else if (filterYear) {
                result = await geminiPool.query(`SELECT
            COUNT(s.id) as total_reps,
            COALESCE(SUM(COALESCE(y.revenue::numeric, y.estimates::numeric, 0)), 0) as total_revenue,
            COALESCE(SUM(COALESCE(y.signups::numeric, 0)), 0) as total_signups,
            COALESCE(AVG(COALESCE(y.revenue::numeric, y.estimates::numeric, 0)), 0) as avg_revenue,
            COALESCE(AVG(COALESCE(y.signups::numeric, 0)), 0) as avg_signups
           FROM sales_reps s
           LEFT JOIN sales_rep_yearly_metrics y
             ON y.sales_rep_id = s.id
            AND y.year = $1
           WHERE s.is_active = true`, [filterYear]);
            }
            else {
                result = await geminiPool.query(`SELECT
            COUNT(*) as total_reps,
            COALESCE(SUM(monthly_revenue::numeric), 0) as total_revenue,
            COALESCE(SUM(monthly_signups), 0) as total_signups,
            COALESCE(AVG(monthly_revenue::numeric), 0) as avg_revenue,
            COALESCE(AVG(monthly_signups), 0) as avg_signups
           FROM sales_reps
           WHERE is_active = true`);
            }
            const stats = result.rows[0];
            let topResult;
            if (filterYear && filterMonth) {
                topResult = await geminiPool.query(`SELECT s.name, COALESCE(m.signups, 0) as monthly_signups
           FROM sales_reps s
           LEFT JOIN sales_rep_monthly_metrics m
             ON m.sales_rep_id = s.id
            AND m.year = $1
            AND m.month = $2
           WHERE s.is_active = true
           ORDER BY COALESCE(m.signups, 0) DESC
           LIMIT 1`, [filterYear, filterMonth]);
            }
            else if (filterYear) {
                topResult = await geminiPool.query(`SELECT s.name, COALESCE(y.signups, 0) as monthly_signups
           FROM sales_reps s
           LEFT JOIN sales_rep_yearly_metrics y
             ON y.sales_rep_id = s.id
            AND y.year = $1
           WHERE s.is_active = true
           ORDER BY COALESCE(y.signups, 0) DESC
           LIMIT 1`, [filterYear]);
            }
            else {
                topResult = await geminiPool.query(`SELECT name, monthly_signups
           FROM sales_reps
           WHERE is_active = true
           ORDER BY monthly_signups DESC
           LIMIT 1`);
            }
            const topPerformer = topResult.rows[0]
                ? { name: topResult.rows[0].name, signups: toNumber(topResult.rows[0].monthly_signups) }
                : null;
            const tierResult = await geminiPool.query(`SELECT current_bonus_tier, COUNT(*) as count
         FROM sales_reps
         WHERE is_active = true
         GROUP BY current_bonus_tier
         ORDER BY current_bonus_tier`);
            const tierDistribution = {};
            for (const row of tierResult.rows) {
                const tierName = BONUS_TIER_NAMES[row.current_bonus_tier] || 'Unknown';
                tierDistribution[tierName] = parseInt(row.count, 10);
            }
            return {
                totalReps: parseInt(stats.total_reps, 10),
                totalRevenue: parseFloat(stats.total_revenue),
                totalSignups: parseInt(stats.total_signups, 10),
                avgMonthlyRevenue: parseFloat(stats.avg_revenue),
                avgMonthlySignups: parseFloat(stats.avg_signups),
                topPerformer,
                tierDistribution
            };
        }
        catch (error) {
            console.error('[LEADERBOARD] Error fetching leaderboard stats:', error);
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
    return {
        getSalesReps,
        getPlayerProfiles,
        getCombinedLeaderboard,
        getUserLeaderboardPosition,
        getLeaderboardStats
    };
}
