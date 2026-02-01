/**
 * Performance Context Service
 * Detects performance queries and injects leaderboard data into Susan's context
 */

import { getApiBaseUrl } from './config';
import { authService } from './authService';

export interface PerformanceUser {
  name: string;
  rank: number;
  totalUsers: number;
  monthlySignups: number;
  monthlyRevenue: number;
  yearlyRevenue: number;
  allTimeRevenue: number;
  bonusTier: string;
  bonusTierNumber: number;
  goalProgress: number;
  currentStreak: number;
  playerLevel: number;
  teamName: string | null;
  territoryName: string | null;
  isTeamLeader: boolean;
  doorsKnocked30d: number;
  leadsGenerated30d: number;
  appointmentsSet30d: number;
}

export interface NearbyCompetitor {
  rank: number;
  name: string;
  monthlySignups: number;
  monthlyRevenue: number;
  bonusTier: string;
}

export interface PerformanceData {
  user: PerformanceUser | null;
  nearbyCompetitors: NearbyCompetitor[];
}

// Keywords that indicate a performance-related query
const PERFORMANCE_KEYWORDS = [
  // Direct rank questions
  'rank', 'ranking', 'ranked', 'position', 'standing', 'standings',
  'leaderboard', 'leader board',

  // Metrics questions
  'signups', 'sign-ups', 'sign ups', 'signup count',
  'revenue', 'sales', 'my numbers', 'my stats', 'statistics',
  'bonus tier', 'bonus', 'tier',
  'level', 'player level', 'points', 'career points',
  'streak', 'goal', 'goals', 'progress',
  'doors knocked', 'leads', 'appointments',

  // Comparative questions
  'how am i doing', "how'm i doing", 'how im doing', 'how i am doing',
  'compare', 'compared to', 'versus', 'vs',
  'ahead', 'behind', 'beating', 'beat',
  'top performer', 'first place', 'number one', '#1', 'number 1',
  'team average', 'team comparison',

  // Improvement questions
  'improve', 'get better', 'move up', 'catch up',
  'need to', 'how many more', 'what do i need',
  'next level', 'level up',

  // Performance assessments
  'performance', 'doing well', 'doing good', 'doing bad', 'doing poorly',
  'month so far', 'this month', 'year to date', 'ytd',
  'my production', 'my output'
];

/**
 * Detect if a query is performance-related
 */
export function isPerformanceQuery(query: string): boolean {
  const normalizedQuery = query.toLowerCase();
  return PERFORMANCE_KEYWORDS.some(keyword =>
    normalizedQuery.includes(keyword)
  );
}

/**
 * Fetch user's performance data from the leaderboard API
 */
export async function fetchPerformanceData(userEmail?: string): Promise<PerformanceData | null> {
  try {
    const apiBaseUrl = getApiBaseUrl();
    const email = userEmail || authService.getCurrentUser()?.email;

    if (!email) {
      console.warn('[PerformanceContext] No user email available');
      return null;
    }

    const response = await fetch(`${apiBaseUrl}/api/leaderboard/me`, {
      headers: {
        'x-user-email': email,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log('[PerformanceContext] User not found in leaderboard');
        return null;
      }
      throw new Error(`Leaderboard API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success || !data.user) {
      return null;
    }

    return {
      user: {
        name: data.user.name,
        rank: data.rank,
        totalUsers: data.totalUsers,
        monthlySignups: Number(data.user.monthly_signups) || 0,
        monthlyRevenue: Number(data.user.monthly_revenue) || 0,
        yearlyRevenue: Number(data.user.yearly_revenue) || 0,
        allTimeRevenue: Number(data.user.all_time_revenue) || 0,
        bonusTier: data.user.bonus_tier_name || 'Rookie',
        bonusTierNumber: Number(data.user.bonus_tier) || 0,
        goalProgress: Number(data.user.goal_progress) || 0,
        currentStreak: Number(data.user.current_streak) || 0,
        playerLevel: Number(data.user.player_level) || 1,
        teamName: data.user.team_name || null,
        territoryName: data.user.territory_name || null,
        isTeamLeader: data.user.is_team_leader || false,
        doorsKnocked30d: Number(data.user.doors_knocked_30d) || 0,
        leadsGenerated30d: Number(data.user.leads_generated_30d) || 0,
        appointmentsSet30d: Number(data.user.appointments_set_30d) || 0
      },
      nearbyCompetitors: (data.nearbyCompetitors || []).map((c: any) => ({
        rank: c.rank,
        name: c.name,
        monthlySignups: Number(c.monthly_signups) || 0,
        monthlyRevenue: Number(c.monthly_revenue) || 0,
        bonusTier: c.bonus_tier_name || 'Rookie'
      }))
    };
  } catch (error) {
    console.error('[PerformanceContext] Error fetching performance data:', error);
    return null;
  }
}

/**
 * Calculate percentile ranking
 */
function getPercentile(rank: number, total: number): string {
  if (total === 0) return 'N/A';
  const percentile = Math.round(((total - rank + 1) / total) * 100);
  if (percentile >= 90) return 'top 10%';
  if (percentile >= 75) return 'top 25%';
  if (percentile >= 50) return 'top 50%';
  return `top ${100 - percentile}%`;
}

/**
 * Get tier progression info
 */
function getTierProgression(currentTier: number): string {
  const tiers = ['Rookie', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Elite'];
  if (currentTier >= 6) return 'You are at Elite - the highest tier!';
  const nextTier = tiers[currentTier + 1];
  return `Next tier: ${nextTier}`;
}

/**
 * Build performance context block for Susan's prompt
 */
export async function buildPerformanceContext(query: string, userEmail?: string): Promise<string | null> {
  // Only fetch if this is a performance-related query
  if (!isPerformanceQuery(query)) {
    return null;
  }

  console.log('[PerformanceContext] Performance query detected, fetching data...');
  const data = await fetchPerformanceData(userEmail);

  if (!data || !data.user) {
    return `

[PERFORMANCE DATA - UNAVAILABLE]
Unable to retrieve leaderboard position for this user. They may not be synced with the sales tracking system yet.
GUIDANCE: Let them know their performance data isn't available, suggest checking the Leaderboard tab directly, or contacting their manager if they believe this is an error.
`;
  }

  const { user, nearbyCompetitors } = data;
  const percentile = getPercentile(user.rank, user.totalUsers);
  const tierInfo = getTierProgression(user.bonusTierNumber);

  // Build competitor context
  let competitorBlock = '';
  if (nearbyCompetitors.length > 0) {
    const above = nearbyCompetitors.filter(c => c.rank < user.rank);
    const below = nearbyCompetitors.filter(c => c.rank > user.rank);

    if (above.length > 0) {
      const closest = above[above.length - 1]; // Closest person above
      const gap = closest.monthlySignups - user.monthlySignups;
      if (gap > 0) {
        competitorBlock += `\nTo move up: ${gap} more signup${gap !== 1 ? 's' : ''} to pass ${closest.name} (#${closest.rank})`;
      } else {
        competitorBlock += `\nTied with ${closest.name} (#${closest.rank}) - one more signup pulls you ahead!`;
      }
    }

    if (below.length > 0) {
      const closest = below[0]; // Closest person below
      const buffer = user.monthlySignups - closest.monthlySignups;
      if (buffer > 0) {
        competitorBlock += `\nBuffer: ${buffer} signup${buffer !== 1 ? 's' : ''} ahead of ${closest.name} (#${closest.rank})`;
      }
    }
  }

  // Build team context
  let teamBlock = '';
  if (user.teamName) {
    teamBlock = `\nTeam: ${user.teamName}${user.isTeamLeader ? ' (Team Leader)' : ''}`;
  }
  if (user.territoryName) {
    teamBlock += `\nTerritory: ${user.territoryName}`;
  }

  // Build activity context
  let activityBlock = '';
  if (user.doorsKnocked30d > 0 || user.leadsGenerated30d > 0 || user.appointmentsSet30d > 0) {
    activityBlock = `\n\n30-Day Field Activity:
- Doors Knocked: ${user.doorsKnocked30d}
- Leads Generated: ${user.leadsGenerated30d}
- Appointments Set: ${user.appointmentsSet30d}`;
  }

  // Build the context block
  return `

[PERFORMANCE DATA - ${user.name}]
Current Rank: #${user.rank} of ${user.totalUsers} active reps (${percentile})
Monthly Signups: ${user.monthlySignups}
Monthly Revenue: $${user.monthlyRevenue.toLocaleString()}
Yearly Revenue: $${user.yearlyRevenue.toLocaleString()}
All-Time Revenue: $${user.allTimeRevenue.toLocaleString()}
Bonus Tier: ${user.bonusTier} (Level ${user.bonusTierNumber}/6)
${tierInfo}
Player Level: ${user.playerLevel}
Goal Progress: ${user.goalProgress.toFixed(0)}%
Current Streak: ${user.currentStreak} day${user.currentStreak !== 1 ? 's' : ''}${teamBlock}${competitorBlock}${activityBlock}

COACHING GUIDANCE:
- If they ask "how am I doing?": Give honest assessment based on rank/metrics. Celebrate being in ${percentile}. ${user.rank <= 10 ? 'They are a top performer!' : user.rank <= 20 ? 'Solid performance, encourage pushing for top 10.' : 'Room for growth - focus on daily consistency.'}
- If they ask about rank: Explain #${user.rank} of ${user.totalUsers} means ${percentile} of the team.
- If they ask about improving: ${competitorBlock ? 'Reference the gap to the next rank.' : 'Focus on consistent daily activity.'}
- If they ask who's #1: ${nearbyCompetitors.find(c => c.rank === 1) ? `#1 is ${nearbyCompetitors.find(c => c.rank === 1)?.name}` : 'Suggest checking the Leaderboard tab for full rankings.'}
- Always be encouraging but realistic with the numbers.
- Connect performance to daily activities (doors knocked, appointments set).
`;
}

export default {
  isPerformanceQuery,
  fetchPerformanceData,
  buildPerformanceContext
};
