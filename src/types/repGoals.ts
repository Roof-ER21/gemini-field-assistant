/**
 * TypeScript types for Rep Goals System
 */

export type GoalType = 'signups' | 'revenue';

export type GoalStatus = 'achieved' | 'on_track' | 'behind' | 'critical';

export interface RepGoal {
  id: number;
  sales_rep_id: number;
  month: number; // 1-12
  year: number;
  goal_amount: string; // Decimal as string
  goal_type: GoalType;
  current_progress: string; // Decimal as string
  progress_percentage: string; // Decimal as string (0-999.99)
  bonus_eligible: boolean;
  bonus_triggered: boolean;
  bonus_triggered_at: string | null; // ISO timestamp
  deadline_met: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

export interface RepGoalWithDetails extends RepGoal {
  rep_name: string;
  rep_email: string;
  rep_team: string | null;
  monthly_signups: string; // Decimal as string
  monthly_revenue: string; // Decimal as string
}

export interface BonusHistory {
  id: number;
  rep_goal_id: number;
  sales_rep_id: number;
  month: number;
  year: number;
  goal_amount: string;
  final_progress: string;
  progress_percentage: string;
  bonus_tier: number | null;
  triggered_at: string; // ISO timestamp
  triggered_by: string;
  notes: string | null;
}

export interface GoalProgress {
  sales_rep_id: number;
  rep_name: string;
  rep_email: string;
  team: string | null;
  current_signups: string;
  current_revenue: string;
  goal_id: number | null;
  goal_amount: string | null;
  goal_type: GoalType | null;
  current_progress: string | null;
  progress_percentage: string | null;
  bonus_eligible: boolean | null;
  bonus_triggered: boolean | null;
  deadline_met: boolean | null;
  status: GoalStatus | null;
}

export interface GoalProgressSummary {
  achieved: number;
  onTrack: number;
  behind: number;
  critical: number;
  noGoal: number;
}

export interface RepInfo {
  id: number;
  name: string;
  email: string;
  team: string | null;
  monthlySignups: string;
  monthlyRevenue: string;
}

export interface GoalTrend {
  month: number;
  year: number;
  goal_amount: string;
  current_progress: string;
  progress_percentage: string;
  bonus_triggered: boolean;
  goal_type: GoalType;
}

export interface GoalStatistics {
  totalGoals: number;
  achieved: number;
  bonuses: number;
  averageProgress: number;
  currentStreak: number;
}

// API Request types
export interface CreateGoalRequest {
  salesRepId: number;
  month: number;
  year: number;
  goalAmount: number;
  goalType: GoalType;
  notes?: string;
}

export interface UpdateGoalRequest {
  goalAmount?: number;
  bonusEligible?: boolean;
  notes?: string;
}

export interface TriggerBonusRequest {
  goalId: number;
  bonusTier?: number;
  notes?: string;
}

// API Response types
export interface ListGoalsResponse {
  goals: RepGoalWithDetails[];
  total: number;
}

export interface CreateGoalResponse {
  goal: RepGoal;
  message: string;
}

export interface GetRepGoalsResponse {
  rep: RepInfo & {
    monthly_revenue: string;
    all_time_revenue?: string;
  };
  goals: RepGoal[];
  currentGoal: RepGoal | null;
  bonusHistory: BonusHistory[];
  total: number;
}

export interface UpdateGoalResponse {
  goal: RepGoal;
}

export interface DeleteGoalResponse {
  success: boolean;
  message: string;
  deletedGoal: Partial<RepGoal>;
}

export interface GoalProgressResponse {
  month: number;
  year: number;
  progress: GoalProgress[];
  total: number;
  summary: GoalProgressSummary;
}

export interface TriggerBonusResponse {
  success: boolean;
  message: string;
  goal: {
    id: number;
    salesRepId: number;
    month: number;
    year: number;
    progressPercentage: string;
  };
}

export interface RepGoalsListResponse {
  goals: RepGoal[];
  currentGoal: RepGoal | null;
  total: number;
}

export interface RepProgressResponse {
  rep: RepInfo;
  currentGoal: RepGoal | null;
  trend: GoalTrend[];
  statistics: GoalStatistics;
}

// Helper functions
export const formatGoalAmount = (amount: string | number, type: GoalType): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (type === 'revenue') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  }
  return num.toFixed(1);
};

export const formatProgressPercentage = (percentage: string | number): string => {
  const num = typeof percentage === 'string' ? parseFloat(percentage) : percentage;
  return `${num.toFixed(1)}%`;
};

export const getStatusColor = (status: GoalStatus | null): string => {
  switch (status) {
    case 'achieved':
      return 'green';
    case 'on_track':
      return 'blue';
    case 'behind':
      return 'yellow';
    case 'critical':
      return 'red';
    default:
      return 'gray';
  }
};

export const getStatusLabel = (status: GoalStatus | null): string => {
  switch (status) {
    case 'achieved':
      return 'Achieved ✓';
    case 'on_track':
      return 'On Track';
    case 'behind':
      return 'Behind';
    case 'critical':
      return 'Critical';
    default:
      return 'No Goal';
  }
};

export const isDeadlinePassed = (month: number, year: number): boolean => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const currentDay = now.getDate();

  if (year !== currentYear || month !== currentMonth) {
    return false; // Not current month
  }

  return currentDay > 6; // Deadline is 6th of month
};

export const getMonthName = (month: number): string => {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month - 1] || '';
};

export const formatMonthYear = (month: number, year: number): string => {
  return `${getMonthName(month)} ${year}`;
};

export const calculateDaysRemaining = (month: number, year: number): number => {
  const lastDay = new Date(year, month, 0).getDate();
  const today = new Date();

  if (today.getFullYear() !== year || (today.getMonth() + 1) !== month) {
    return 0;
  }

  return lastDay - today.getDate();
};

export const isCurrentMonth = (month: number, year: number): boolean => {
  const now = new Date();
  return now.getMonth() + 1 === month && now.getFullYear() === year;
};

export const sortGoalsByDate = (goals: RepGoal[], descending = true): RepGoal[] => {
  return [...goals].sort((a, b) => {
    if (a.year !== b.year) {
      return descending ? b.year - a.year : a.year - b.year;
    }
    if (a.month !== b.month) {
      return descending ? b.month - a.month : a.month - b.month;
    }
    return 0;
  });
};

export const filterGoalsByYear = (goals: RepGoal[], year: number): RepGoal[] => {
  return goals.filter(g => g.year === year);
};

export const filterGoalsByType = (goals: RepGoal[], type: GoalType): RepGoal[] => {
  return goals.filter(g => g.goal_type === type);
};

export const getYearlyGoals = (goals: RepGoal[], year: number, type: GoalType = 'signups'): RepGoal[] => {
  return goals.filter(g => g.year === year && g.goal_type === type);
};

export const calculateYearlyAchievementRate = (goals: RepGoal[]): number => {
  if (goals.length === 0) return 0;
  const achieved = goals.filter(g => parseFloat(g.progress_percentage) >= 100).length;
  return (achieved / goals.length) * 100;
};
