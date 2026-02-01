/**
 * Leaderboard Service
 * Provides leaderboard data from local database (synced from Google Sheets)
 */

import type { Pool } from 'pg';

// Flag to indicate whether the leaderboard is ready
// Set to true once Google Sheets integration is complete
const LEADERBOARD_READY = true;

export interface SalesRep {
  id: number;
  name: string;
  email: string | null;
  team: string | null;
  team_id: number | null;
  team_name: string | null;
  territory_id: number | null;
  territory_name: string | null;
  is_team_leader: boolean;
  monthly_revenue: string | number;
  yearly_revenue: string | number;
  all_time_revenue: string | number;
  monthly_signups: string | number;
  yearly_signups: string | number;
  goal_progress: string | number;
  current_bonus_tier: number | null;
  is_active: boolean;
}

export interface PlayerProfile {
  id: number;
  sales_rep_id: number;
  player_level: number;
  total_career_points: number;
  season_points: number;
  monthly_points: number;
  current_streak: number;
  longest_streak: number;
}

export interface GeminiCanvassingStats {
  doors_knocked_30d: number;
  leads_generated_30d: number;
  appointments_set_30d: number;
}

export interface CombinedLeaderboardEntry {
  rank: number;
  gemini_user_id: string | null;
  rooftrack_sales_rep_id: string;
  name: string;
  email: string;
  team: string | null;
  team_id: number | null;
  team_name: string | null;
  territory_id: number | null;
  territory_name: string | null;
  is_team_leader: boolean;
  // Sales rep data
  monthly_revenue: number;
  yearly_revenue: number;
  all_time_revenue: number;
  monthly_signups: number;
  yearly_signups: number;
  goal_progress: number;
  bonus_tier: number;
  bonus_tier_name: string;
  player_level: number;
  career_points: number;
  current_streak: number;
  // Gemini data (if mapped)
  doors_knocked_30d: number;
  leads_generated_30d: number;
  appointments_set_30d: number;
}

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

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function createLeaderboardService(geminiPool: Pool) {
  type SortBy =
    | 'monthly_revenue'
    | 'yearly_revenue'
    | 'monthly_signups'
    | 'doors_knocked'
    | 'all_time_revenue';

  interface TimeSeriesMetricRow {
    sales_rep_id: number;
    signups: string | number | null;
    estimates: string | number | null;
    revenue: string | number | null;
  }

  async function getYearlyMetrics(year: number): Promise<Map<string, TimeSeriesMetricRow>> {
    try {
      const result = await geminiPool.query(
        `SELECT sales_rep_id, signups, estimates, revenue
         FROM sales_rep_yearly_metrics
         WHERE year = $1`,
        [year]
      );
      const map = new Map<string, TimeSeriesMetricRow>();
      for (const row of result.rows) {
        map.set(String(row.sales_rep_id), row);
      }
      return map;
    } catch (error) {
      console.warn('[LEADERBOARD] Yearly metrics unavailable:', (error as Error).message);
      return new Map();
    }
  }

  async function getMonthlyMetrics(year: number, month: number): Promise<Map<string, TimeSeriesMetricRow>> {
    try {
      const result = await geminiPool.query(
        `SELECT sales_rep_id, signups, estimates, revenue
         FROM sales_rep_monthly_metrics
         WHERE year = $1 AND month = $2`,
        [year, month]
      );
      const map = new Map<string, TimeSeriesMetricRow>();
      for (const row of result.rows) {
        map.set(String(row.sales_rep_id), row);
      }
      return map;
    } catch (error) {
      console.warn('[LEADERBOARD] Monthly metrics unavailable:', (error as Error).message);
      return new Map();
    }
  }

  function pickRevenue(metric?: TimeSeriesMetricRow | null): number {
    if (!metric) return 0;
    const revenue = toNumber(metric.revenue);
    if (revenue > 0) return revenue;
    return toNumber(metric.estimates);
  }

  /**
   * Check if leaderboard is ready
   */
  function isReady(): boolean {
    return LEADERBOARD_READY;
  }

  /**
   * Get all sales reps from database with team/territory info
   */
  async function getSalesReps(filters?: { teamId?: number; territoryId?: number }): Promise<SalesRep[]> {
    if (!isReady()) {
      return [];
    }

    try {
      let query = `
        SELECT
          s.id, s.name, s.email, s.team,
          s.team_id, t.name as team_name,
          s.territory_id, tt.name as territory_name,
          CASE WHEN t.leader_id = s.id THEN true ELSE false END as is_team_leader,
          s.monthly_revenue, s.yearly_revenue, s.all_time_revenue,
          s.monthly_signups, s.yearly_signups,
          s.goal_progress, s.current_bonus_tier, s.is_active
        FROM sales_reps s
        LEFT JOIN teams t ON s.team_id = t.id
        LEFT JOIN team_territories tt ON s.territory_id = tt.id
        WHERE s.is_active = true
      `;

      const params: any[] = [];
      if (filters?.teamId) {
        params.push(filters.teamId);
        query += ` AND s.team_id = $${params.length}`;
      }
      if (filters?.territoryId) {
        params.push(filters.territoryId);
        query += ` AND s.territory_id = $${params.length}`;
      }

      query += ' ORDER BY s.monthly_signups DESC, s.monthly_revenue DESC';

      const result = await geminiPool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('[LEADERBOARD] Error fetching sales reps:', error);
      return [];
    }
  }

  /**
   * Get player profiles for gamification data
   */
  async function getPlayerProfiles(): Promise<Map<string, PlayerProfile>> {
    try {
      const result = await geminiPool.query(
        `SELECT
          id,
          sales_rep_id,
          COALESCE(player_level, 1) as player_level,
          COALESCE(total_career_points, 0) as total_career_points,
          COALESCE(season_points, 0) as season_points,
          COALESCE(monthly_points, 0) as monthly_points,
          COALESCE(current_streak, 0) as current_streak,
          COALESCE(longest_streak, 0) as longest_streak
         FROM player_profiles`
      );

      const profileMap = new Map<string, PlayerProfile>();
      for (const row of result.rows) {
        profileMap.set(String(row.sales_rep_id), row);
      }
      return profileMap;
    } catch (error) {
      console.warn('[LEADERBOARD] Could not fetch player profile data:', (error as Error).message);
      return new Map();
    }
  }

  /**
   * Map sales reps to Gemini users
   * Priority: 1) Manual mappings in user_sales_rep_mapping table
   *           2) Automatic email matching
   */
  async function getUserMappings(): Promise<Map<string, string>> {
    try {
      const mappings = new Map<string, string>();

      // First: Get manual mappings (higher priority)
      try {
        const manualResult = await geminiPool.query(
          `SELECT sales_rep_id, user_id as gemini_user_id
           FROM user_sales_rep_mapping`
        );
        for (const row of manualResult.rows) {
          mappings.set(String(row.sales_rep_id), row.gemini_user_id);
        }
      } catch {
        // Table may not exist yet, continue with email matching
      }

      // Second: Get email-based mappings for reps not in manual mappings
      const emailResult = await geminiPool.query(
        `SELECT
          s.id as sales_rep_id,
          u.id as gemini_user_id
         FROM sales_reps s
         JOIN users u ON LOWER(u.email) = LOWER(s.email)
         WHERE s.is_active = true`
      );

      for (const row of emailResult.rows) {
        // Only add if not already in manual mappings
        if (!mappings.has(String(row.sales_rep_id))) {
          mappings.set(String(row.sales_rep_id), row.gemini_user_id);
        }
      }

      return mappings;
    } catch (error) {
      console.error('[LEADERBOARD] Error fetching user mappings:', error);
      return new Map();
    }
  }

  /**
   * Get Gemini canvassing stats for a user
   */
  async function getGeminiCanvassingStats(userId: string): Promise<GeminiCanvassingStats> {
    try {
      const result = await geminiPool.query(
        `SELECT
          COALESCE(SUM(doors_knocked), 0)::int as doors_knocked_30d,
          COALESCE(SUM(leads_generated), 0)::int as leads_generated_30d,
          COALESCE(SUM(appointments_set), 0)::int as appointments_set_30d
         FROM canvassing_sessions
         WHERE user_id = $1
           AND session_date >= CURRENT_DATE - INTERVAL '30 days'`,
        [userId]
      );

      return result.rows[0] || {
        doors_knocked_30d: 0,
        leads_generated_30d: 0,
        appointments_set_30d: 0
      };
    } catch (error) {
      console.error('[LEADERBOARD] Error fetching canvassing stats:', error);
      return { doors_knocked_30d: 0, leads_generated_30d: 0, appointments_set_30d: 0 };
    }
  }

  /**
   * Get combined leaderboard merging sales + Gemini data
   */
  async function getCombinedLeaderboard(
    sortBy: SortBy = 'monthly_signups',
    limit: number = 50,
    filters?: { year?: number; month?: number; teamId?: number; territoryId?: number }
  ): Promise<CombinedLeaderboardEntry[]> {
    const filterYear = filters?.year;
    const filterMonth = filters?.month;

    const [salesReps, playerProfiles, userMappings] = await Promise.all([
      getSalesReps({ teamId: filters?.teamId, territoryId: filters?.territoryId }),
      getPlayerProfiles(),
      getUserMappings()
    ]);

    let yearlyMetrics = new Map<string, TimeSeriesMetricRow>();
    let monthlyMetrics = new Map<string, TimeSeriesMetricRow>();

    if (filterYear) {
      yearlyMetrics = await getYearlyMetrics(filterYear);
      if (filterMonth) {
        monthlyMetrics = await getMonthlyMetrics(filterYear, filterMonth);
      }
    }

    const entries: CombinedLeaderboardEntry[] = [];

    for (const rep of salesReps) {
      const repId = String(rep.id);
      const profile = playerProfiles.get(repId);
      const geminiUserId = userMappings.get(repId);
      const yearMetric = filterYear ? yearlyMetrics.get(repId) : null;
      const monthMetric = filterYear && filterMonth ? monthlyMetrics.get(repId) : null;

      let canvassingStats: GeminiCanvassingStats = {
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
        team_id: rep.team_id || null,
        team_name: rep.team_name || null,
        territory_id: rep.territory_id || null,
        territory_name: rep.territory_name || null,
        is_team_leader: rep.is_team_leader || false,
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
      let comparison = 0;

      // Primary sort by requested field
      switch (sortBy) {
        case 'monthly_revenue':
          comparison = b.monthly_revenue - a.monthly_revenue;
          break;
        case 'yearly_revenue':
          comparison = b.yearly_revenue - a.yearly_revenue;
          break;
        case 'all_time_revenue':
          comparison = b.all_time_revenue - a.all_time_revenue;
          break;
        case 'doors_knocked':
          comparison = b.doors_knocked_30d - a.doors_knocked_30d;
          break;
        case 'monthly_signups':
        default:
          comparison = b.monthly_signups - a.monthly_signups;
          break;
      }

      // Tiebreaker 1: all_time_revenue (career performance)
      if (comparison === 0) {
        comparison = b.all_time_revenue - a.all_time_revenue;
      }

      // Tiebreaker 2: yearly_revenue
      if (comparison === 0) {
        comparison = b.yearly_revenue - a.yearly_revenue;
      }

      // Tiebreaker 3: alphabetical by name for consistency
      if (comparison === 0) {
        comparison = a.name.localeCompare(b.name);
      }

      return comparison;
    });

    return entries.slice(0, limit).map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));
  }

  /**
   * Get leaderboard position for a specific user
   */
  async function getUserLeaderboardPosition(
    email: string,
    sortBy: SortBy = 'monthly_signups',
    filters?: { year?: number; month?: number; teamId?: number; territoryId?: number }
  ): Promise<{
    user: CombinedLeaderboardEntry | null;
    rank: number;
    totalUsers: number;
    nearbyCompetitors: CombinedLeaderboardEntry[];
  }> {
    const leaderboard = await getCombinedLeaderboard(sortBy, 1000, filters);
    const totalUsers = leaderboard.length;

    const userIndex = leaderboard.findIndex(entry =>
      entry.email && entry.email.toLowerCase() === email.toLowerCase()
    );

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
  async function getLeaderboardStats(
    filters?: { year?: number; month?: number; teamId?: number; territoryId?: number },
    sortBy: SortBy = 'monthly_signups'
  ): Promise<{
    totalReps: number;
    totalRevenue: number;
    totalSignups: number;
    avgMonthlyRevenue: number;
    avgMonthlySignups: number;
    topPerformer: CombinedLeaderboardEntry | null;
    tierDistribution: Record<string, number>;
  }> {
    try {
      const filterYear = filters?.year;
      const filterMonth = filters?.month;
      const filterTeamId = filters?.teamId;
      const filterTerritoryId = filters?.territoryId;

      const buildWhereClause = (params: any[]): string => {
        const conditions = ['s.is_active = true'];
        if (filterTeamId) {
          params.push(filterTeamId);
          conditions.push(`s.team_id = $${params.length}`);
        }
        if (filterTerritoryId) {
          params.push(filterTerritoryId);
          conditions.push(`s.territory_id = $${params.length}`);
        }
        return conditions.join(' AND ');
      };

      let result;
      if (filterYear && filterMonth) {
        const params = [filterYear, filterMonth];
        const whereClause = buildWhereClause(params);
        result = await geminiPool.query(
          `SELECT
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
           WHERE ${whereClause}`,
          params
        );
      } else if (filterYear) {
        const params = [filterYear];
        const whereClause = buildWhereClause(params);
        result = await geminiPool.query(
          `SELECT
            COUNT(s.id) as total_reps,
            COALESCE(SUM(COALESCE(y.revenue::numeric, y.estimates::numeric, 0)), 0) as total_revenue,
            COALESCE(SUM(COALESCE(y.signups::numeric, 0)), 0) as total_signups,
            COALESCE(AVG(COALESCE(y.revenue::numeric, y.estimates::numeric, 0)), 0) as avg_revenue,
            COALESCE(AVG(COALESCE(y.signups::numeric, 0)), 0) as avg_signups
           FROM sales_reps s
           LEFT JOIN sales_rep_yearly_metrics y
             ON y.sales_rep_id = s.id
            AND y.year = $1
           WHERE ${whereClause}`,
          params
        );
      } else {
        const params: any[] = [];
        const whereClause = buildWhereClause(params);
        result = await geminiPool.query(
          `SELECT
            COUNT(*) as total_reps,
            COALESCE(SUM(monthly_revenue::numeric), 0) as total_revenue,
            COALESCE(SUM(monthly_signups), 0) as total_signups,
            COALESCE(AVG(monthly_revenue::numeric), 0) as avg_revenue,
            COALESCE(AVG(monthly_signups), 0) as avg_signups
           FROM sales_reps s
           WHERE ${whereClause}`,
          params
        );
      }

      const stats = result.rows[0];

      // Get top performer based on the current sort criteria
      const leaderboard = await getCombinedLeaderboard(sortBy, 1, filters);
      const topPerformer = leaderboard.length > 0 ? leaderboard[0] : null;

      const tierParams: any[] = [];
      const tierWhereClause = buildWhereClause(tierParams);
      const tierResult = await geminiPool.query(
        `SELECT current_bonus_tier, COUNT(*) as count
         FROM sales_reps s
         WHERE ${tierWhereClause}
         GROUP BY current_bonus_tier
         ORDER BY current_bonus_tier`,
        tierParams
      );

      const tierDistribution: Record<string, number> = {};
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
    } catch (error) {
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

export type LeaderboardService = ReturnType<typeof createLeaderboardService>;
