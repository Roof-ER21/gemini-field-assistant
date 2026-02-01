/**
 * Contest Context Service
 * Provides contest standings and competition data for Susan AI
 */

import { getApiBaseUrl } from './config';
import { authService } from './authService';

export interface ContestStanding {
  contest_id: number;
  contest_name: string;
  contest_type: string;
  metric_type: string;
  prize_description: string | null;
  start_date: string;
  end_date: string;
  is_active: boolean;
  user_rank: number | null;
  user_metric_value: number;
  total_participants: number;
  leader_name: string | null;
  leader_value: number;
}

export interface ContestData {
  active_contests: ContestStanding[];
  past_contests: ContestStanding[];
}

/**
 * Keywords that indicate contest-related queries
 */
const CONTEST_KEYWORDS = [
  'contest', 'contests', 'competition', 'compete',
  'standings', 'standing', 'leaderboard',
  'prize', 'prizes', 'winning', 'winner',
  'leader', 'first place', '#1', 'number 1',
  'rank', 'ranking', 'position',
  'who won', "who's winning", 'whos winning',
  'am i winning', 'can i win'
];

/**
 * Detect if query is contest-related
 */
export function isContestQuery(query: string): boolean {
  const normalizedQuery = query.toLowerCase();
  return CONTEST_KEYWORDS.some(keyword =>
    normalizedQuery.includes(keyword)
  );
}

/**
 * Fetch user's contest data (active and past contests with standings)
 */
export async function fetchContestData(userEmail?: string): Promise<ContestData | null> {
  try {
    const apiBaseUrl = getApiBaseUrl();
    const email = userEmail || authService.getCurrentUser()?.email;

    if (!email) {
      console.warn('[ContestContext] No user email available');
      return null;
    }

    // Fetch active contests
    const activeResponse = await fetch(`${apiBaseUrl}/contests?active=true`, {
      headers: {
        'x-user-email': email,
        'Content-Type': 'application/json'
      }
    });

    if (!activeResponse.ok) {
      console.warn('[ContestContext] Failed to fetch active contests:', activeResponse.status);
      return null;
    }

    const activeData = await activeResponse.json();
    const activeContests = activeData.contests || [];

    // For each active contest, get user's standing
    const activeContestStandings: ContestStanding[] = [];

    for (const contest of activeContests) {
      try {
        const standingResponse = await fetch(
          `${apiBaseUrl}/contests/${contest.id}/my-standing`,
          {
            headers: {
              'x-user-email': email,
              'Content-Type': 'application/json'
            }
          }
        );

        if (standingResponse.ok) {
          const standingData = await standingResponse.json();
          const standing = standingData.standing;

          // Get leader info from full standings
          const fullStandingsResponse = await fetch(
            `${apiBaseUrl}/contests/${contest.id}`,
            {
              headers: {
                'x-user-email': email,
                'Content-Type': 'application/json'
              }
            }
          );

          let leaderName = null;
          let leaderValue = 0;

          if (fullStandingsResponse.ok) {
            const fullData = await fullStandingsResponse.json();
            const leader = fullData.standings?.[0];
            if (leader) {
              leaderName = leader.rep_name;
              leaderValue = Number(leader.metric_value) || 0;
            }
          }

          activeContestStandings.push({
            contest_id: contest.id,
            contest_name: contest.name,
            contest_type: contest.contest_type,
            metric_type: contest.metric_type,
            prize_description: contest.prize_description,
            start_date: contest.start_date,
            end_date: contest.end_date,
            is_active: contest.is_active,
            user_rank: standing?.rank || null,
            user_metric_value: Number(standing?.metric_value) || 0,
            total_participants: standingData.total_participants || 0,
            leader_name: leaderName,
            leader_value: leaderValue
          });
        }
      } catch (error) {
        console.error(`[ContestContext] Error fetching standing for contest ${contest.id}:`, error);
        // Still add contest without user standing
        activeContestStandings.push({
          contest_id: contest.id,
          contest_name: contest.name,
          contest_type: contest.contest_type,
          metric_type: contest.metric_type,
          prize_description: contest.prize_description,
          start_date: contest.start_date,
          end_date: contest.end_date,
          is_active: contest.is_active,
          user_rank: null,
          user_metric_value: 0,
          total_participants: 0,
          leader_name: null,
          leader_value: 0
        });
      }
    }

    return {
      active_contests: activeContestStandings,
      past_contests: []
    };
  } catch (error) {
    console.error('[ContestContext] Error fetching contest data:', error);
    return null;
  }
}

/**
 * Calculate days remaining until contest ends
 */
function getDaysRemaining(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Get metric display name
 */
function getMetricDisplay(metricType: string): string {
  switch (metricType) {
    case 'signups':
      return 'Signups';
    case 'revenue':
      return 'Revenue';
    case 'both':
      return 'Signups & Revenue';
    default:
      return metricType;
  }
}

/**
 * Build contest context block for Susan's prompt
 */
export async function buildContestContext(query: string, userEmail?: string): Promise<string | null> {
  // Only fetch if this is a contest-related query
  if (!isContestQuery(query)) {
    return null;
  }

  console.log('[ContestContext] Contest query detected, fetching data...');

  const data = await fetchContestData(userEmail);

  if (!data || data.active_contests.length === 0) {
    return `

[CONTEST CONTEXT - NO ACTIVE CONTESTS]
There are currently no active contests running.
GUIDANCE: Let them know there are no contests right now. Encourage them to keep performing well for when the next contest starts!
`;
  }

  const { active_contests } = data;
  let context = '\n\n[CONTEST CONTEXT]\n';
  context += `Active Contests: ${active_contests.length}\n`;

  for (const contest of active_contests) {
    const daysLeft = getDaysRemaining(contest.end_date);
    const metricDisplay = getMetricDisplay(contest.metric_type);

    context += `\n${contest.contest_name}:\n`;
    context += `- Type: ${contest.contest_type.replace(/_/g, ' ')}\n`;
    context += `- Metric: ${metricDisplay}\n`;

    if (contest.prize_description) {
      context += `- Prize: ${contest.prize_description}\n`;
    }

    if (contest.user_rank !== null) {
      context += `- Your Standing: #${contest.user_rank} of ${contest.total_participants}\n`;
      context += `- Your ${metricDisplay}: ${contest.user_metric_value}\n`;
    } else {
      context += `- Your Standing: Not yet ranked (need qualifying activity)\n`;
    }

    context += `- Ends: ${new Date(contest.end_date).toLocaleDateString()} (${daysLeft} day${daysLeft !== 1 ? 's' : ''} left)\n`;

    if (contest.leader_name) {
      context += `- Current Leader: ${contest.leader_name} with ${contest.leader_value}\n`;

      if (contest.user_rank !== null && contest.user_rank > 1) {
        const gap = contest.leader_value - contest.user_metric_value;
        context += `- Gap to Leader: ${gap} ${metricDisplay.toLowerCase()}\n`;
      }
    }
  }

  context += `\nCOACHING GUIDANCE:\n`;
  context += `- If they ask about contests: Provide details from the data above\n`;
  context += `- If they ask about their standing: Reference their rank and total participants\n`;
  context += `- If they ask "can I win?": Calculate the gap and assess if it's achievable in the time remaining\n`;
  context += `- If they ask "who's winning?": Reference the current leader\n`;
  context += `- If they ask about prizes: Reference the prize_description\n`;
  context += `- Be encouraging! Even if they're not in first, celebrate their participation and progress\n`;
  context += `- Connect contest performance to daily activities (doors knocked, appointments)\n`;
  context += `- If multiple contests, help them prioritize based on which they have best chance to win\n`;

  return context;
}

export default {
  isContestQuery,
  fetchContestData,
  buildContestContext
};
