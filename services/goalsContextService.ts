/**
 * Goals Context Service
 * Provides goal progress and tier information for Susan AI
 */

import { getApiBaseUrl } from './config';
import { authService } from './authService';

export interface GoalProgress {
  monthly: {
    signupGoal: number;
    signupsCurrent: number;
    signupsRemaining: number;
    progressPercent: number;
    status: 'completed' | 'ahead' | 'on-track' | 'behind';
    daysRemaining: number;
  };
  yearly: {
    signupGoal: number;
    signupsCurrent: number;
    signupsRemaining: number;
    progressPercent: number;
    monthlyAverageNeeded: number;
  };
  bonusTier: {
    currentTier: string;
    currentTierNumber: number;
    nextTier: string | null;
    signupsToNextTier: number;
    bonusDisplay: string;
  };
}

/**
 * Keywords that indicate goals/tier-related queries
 */
const GOALS_KEYWORDS = [
  'goal', 'goals', 'target', 'targets',
  'how many', 'how much', 'need to',
  'progress', 'tracking',
  'bonus', 'bonuses', 'tier', 'tiers',
  'rookie', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'elite',
  'next level', 'level up',
  'on track', 'on pace', 'behind', 'ahead'
];

/**
 * Detect if query is goals-related
 */
export function isGoalsQuery(query: string): boolean {
  const normalizedQuery = query.toLowerCase();
  return GOALS_KEYWORDS.some(keyword =>
    normalizedQuery.includes(keyword)
  );
}

/**
 * Fetch bonus tier configuration
 */
export async function fetchBonusTiers(): Promise<Array<{
  tierNumber: number;
  name: string;
  minSignups: number;
  maxSignups: number;
  color: string;
  bonusDisplay: string;
}> | null> {
  try {
    const apiBaseUrl = getApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/leaderboard/bonus-tiers`, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn('[GoalsContext] Failed to fetch bonus tiers:', response.status);
      return null;
    }

    const data = await response.json();
    return data.success ? data.tiers : null;
  } catch (error) {
    console.error('[GoalsContext] Error fetching bonus tiers:', error);
    return null;
  }
}

/**
 * Fetch user's goal progress
 */
export async function fetchGoalProgress(userEmail?: string): Promise<GoalProgress | null> {
  try {
    const apiBaseUrl = getApiBaseUrl();
    const email = userEmail || authService.getCurrentUser()?.email;

    if (!email) {
      console.warn('[GoalsContext] No user email available');
      return null;
    }

    const response = await fetch(`${apiBaseUrl}/rep/goals/progress`, {
      headers: {
        'x-user-email': email,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log('[GoalsContext] User goals not found');
        return null;
      }
      throw new Error(`Goals API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success || !data.progress) {
      return null;
    }

    const p = data.progress;

    // Determine next tier
    const currentTierNum = p.monthly?.bonus_tier || 0;
    const TIER_NAMES = ['Rookie', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Elite'];
    const nextTierNum = currentTierNum < 6 ? currentTierNum + 1 : null;
    const nextTier = nextTierNum !== null ? TIER_NAMES[nextTierNum] : null;

    // Calculate signups to next tier (rough estimate based on typical tier structure)
    const TIER_THRESHOLDS = [0, 6, 11, 15, 20, 25, 30];
    const signupsToNextTier = nextTierNum !== null
      ? Math.max(0, TIER_THRESHOLDS[nextTierNum] - (p.monthly?.signups?.current || 0))
      : 0;

    const BONUS_DISPLAYS = ['', '', '', '$', '$$', '$$$', '$$$$$'];

    return {
      monthly: {
        signupGoal: p.monthly?.signups?.goal || 15,
        signupsCurrent: p.monthly?.signups?.current || 0,
        signupsRemaining: p.monthly?.signups?.remaining || 0,
        progressPercent: p.monthly?.signups?.percentage || 0,
        status: p.monthly?.signups?.status || 'on-track',
        daysRemaining: p.calendar?.daysRemaining || 0
      },
      yearly: {
        signupGoal: p.yearly?.signups?.goal || 180,
        signupsCurrent: p.yearly?.signups?.current || 0,
        signupsRemaining: p.yearly?.signups?.remaining || 0,
        progressPercent: p.yearly?.signups?.percentage || 0,
        monthlyAverageNeeded: p.yearly?.signups?.monthlyAverageNeeded || 0
      },
      bonusTier: {
        currentTier: TIER_NAMES[currentTierNum] || 'Rookie',
        currentTierNumber: currentTierNum,
        nextTier,
        signupsToNextTier,
        bonusDisplay: BONUS_DISPLAYS[currentTierNum] || ''
      }
    };
  } catch (error) {
    console.error('[GoalsContext] Error fetching goal progress:', error);
    return null;
  }
}

/**
 * Get tier explanation
 */
function getTierExplanation(currentTier: string, nextTier: string | null, signupsNeeded: number): string {
  if (!nextTier) {
    return `You're at ${currentTier} tier - the highest level! Keep crushing it!`;
  }

  if (signupsNeeded === 0) {
    return `You've already hit ${nextTier} tier!`;
  }

  if (signupsNeeded === 1) {
    return `Just 1 more signup to reach ${nextTier} tier!`;
  }

  return `${signupsNeeded} more signups to reach ${nextTier} tier`;
}

/**
 * Get pace assessment
 */
function getPaceAssessment(status: string, progressPercent: number, daysRemaining: number, daysInMonth: number = 30): string {
  const daysElapsed = daysInMonth - daysRemaining;
  const expectedProgress = (daysElapsed / daysInMonth) * 100;
  const delta = progressPercent - expectedProgress;

  switch (status) {
    case 'completed':
      return 'Goal already completed! 🎉';
    case 'ahead':
      return `${delta.toFixed(0)}% ahead of pace - crushing it!`;
    case 'on-track':
      return 'Right on pace to hit goal';
    case 'behind':
      return `${Math.abs(delta).toFixed(0)}% behind pace - need to pick up momentum`;
    default:
      return 'Tracking toward goal';
  }
}

/**
 * Build goals context block for Susan's prompt
 */
export async function buildGoalsContext(query: string, userEmail?: string): Promise<string | null> {
  // Only fetch if this is a goals-related query
  if (!isGoalsQuery(query)) {
    return null;
  }

  console.log('[GoalsContext] Goals query detected, fetching data...');

  const data = await fetchGoalProgress(userEmail);

  if (!data) {
    return `

[GOALS DATA - UNAVAILABLE]
Unable to retrieve goal progress for this user. They may not be synced with the tracking system yet.
GUIDANCE: Let them know their goals data isn't available, suggest checking with their manager or using the Goals tab directly.
`;
  }

  const { monthly, yearly, bonusTier } = data;
  const tierExplanation = getTierExplanation(bonusTier.currentTier, bonusTier.nextTier, bonusTier.signupsToNextTier);
  const paceAssessment = getPaceAssessment(monthly.status, monthly.progressPercent, monthly.daysRemaining);

  // Build tier progression visual
  const tierProgression = `
Rookie (0-5) → Bronze (6-10) → Silver (11-14) → Gold (15-19) → Platinum (20-24) → Diamond (25-29) → Elite (30+)
Current: ${bonusTier.currentTier} (${monthly.signupsCurrent} signups)${bonusTier.nextTier ? ` → Next: ${bonusTier.nextTier}` : ''}
`;

  return `

[GOALS & PROGRESS DATA]

MONTHLY GOAL (This Month):
- Signup Goal: ${monthly.signupGoal}
- Current Signups: ${monthly.signupsCurrent}
- Signups Remaining: ${monthly.signupsRemaining}
- Progress: ${monthly.progressPercent.toFixed(1)}%
- Status: ${monthly.status.toUpperCase()}
- Days Remaining: ${monthly.daysRemaining}
- Pace: ${paceAssessment}

YEARLY GOAL (${new Date().getFullYear()}):
- Yearly Signup Goal: ${yearly.signupGoal}
- Year-to-Date Signups: ${yearly.signupsCurrent}
- Signups Remaining: ${yearly.signupsRemaining}
- Progress: ${yearly.progressPercent.toFixed(1)}%
- Monthly Average Needed: ${yearly.monthlyAverageNeeded} signups/month

BONUS TIER:
- Current Tier: ${bonusTier.currentTier} (Level ${bonusTier.currentTierNumber}/6)${bonusTier.bonusDisplay ? ` [${bonusTier.bonusDisplay}]` : ''}
- ${tierExplanation}

TIER STRUCTURE:
${tierProgression}

COACHING GUIDANCE:
- If they ask "what's my goal?": Tell them monthly (${monthly.signupGoal}) and yearly (${yearly.signupGoal}) targets
- If they ask "am I on track?": Reference the pace assessment above - ${paceAssessment}
- If they ask "what tier am I?": Explain ${bonusTier.currentTier} tier and what it means
- If they ask "how to get next tier?": ${tierExplanation}
- If they ask "how many more signups?": ${monthly.signupsRemaining} to hit monthly goal, ${bonusTier.signupsToNextTier} to next tier
- Connect goals to daily actions: "That's about ${(monthly.signupsRemaining / monthly.daysRemaining).toFixed(1)} signups per day"
- Be encouraging about progress, celebrate milestones
- If behind pace, focus on actionable next steps rather than dwelling on gap
`;
}

export default {
  isGoalsQuery,
  fetchGoalProgress,
  fetchBonusTiers,
  buildGoalsContext
};
