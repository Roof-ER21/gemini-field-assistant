import { PitchMode, DifficultyLevel } from '../types';

export interface TranscriptMessage {
  role: 'user' | 'agnes';
  text: string;
  timestamp: Date;
  score?: number;
}

export interface SessionData {
  sessionId: string;
  timestamp: Date;
  difficulty: DifficultyLevel;
  mode: PitchMode;
  script: string;
  scriptId?: string;
  scriptName?: string;
  isMiniModule?: boolean;
  transcript: TranscriptMessage[];
  finalScore?: number;
  xpEarned?: number;
  duration?: number; // in seconds
  synced?: boolean; // Whether synced to backend
}

/**
 * Generates a storage key specific to a user
 * @param userId - User ID to scope the storage to
 * @returns User-specific storage key
 */
const getStorageKey = (userId?: string): string => {
  if (!userId) {
    return 'agnes_sessions'; // Legacy key for backward compatibility
  }
  return `agnes_sessions_${userId}`;
};

/**
 * Migrates legacy data to user-specific storage on first login
 * @param userId - User ID to migrate data to
 */
const migrateLegacyData = (userId: string): void => {
  const legacyKey = 'agnes_sessions';
  const userKey = getStorageKey(userId);

  // Check if migration is needed
  const legacyData = localStorage.getItem(legacyKey);
  const userData = localStorage.getItem(userKey);

  // Only migrate if legacy data exists and user data doesn't
  if (legacyData && !userData) {
    console.log(`Migrating legacy session data to user ${userId}`);
    localStorage.setItem(userKey, legacyData);
    // Don't remove legacy data yet - keep for other potential migrations
  }
};

/**
 * Generates a unique session ID based on timestamp and random string
 */
export const generateSessionId = (): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 9);
  return `session_${timestamp}_${randomStr}`;
};

/**
 * Saves a session to localStorage (local-only in this integration)
 * @param sessionData - Session data to save
 * @param userId - Optional user ID to scope the session to (defaults to current user from auth)
 */
export const saveSession = async (sessionData: SessionData, userId?: string): Promise<boolean> => {
  try {
    // Migrate legacy data if needed
    if (userId) {
      migrateLegacyData(userId);
    }

    // Mark as synced since we're not calling a backend here
    const sessionToSave = { ...sessionData, synced: true };

    // Save to localStorage first (offline-first approach)
    const existingSessions = getSessions(userId);
    const updatedSessions = [...existingSessions, sessionToSave];

    // Keep only last 50 sessions to prevent localStorage overflow
    const limitedSessions = updatedSessions.slice(-50);

    const storageKey = getStorageKey(userId);
    localStorage.setItem(storageKey, JSON.stringify(limitedSessions));

    return true;
  } catch (error) {
    console.error('Failed to save session:', error);
    return false;
  }
};

/**
 * Marks a session as synced in localStorage
 */
const markSessionSynced = (sessionId: string, userId?: string): void => {
  try {
    const sessions = getSessions(userId);
    const sessionIndex = sessions.findIndex(s => s.sessionId === sessionId);
    if (sessionIndex !== -1) {
      sessions[sessionIndex].synced = true;
      const storageKey = getStorageKey(userId);
      localStorage.setItem(storageKey, JSON.stringify(sessions));
    }
  } catch (error) {
    console.error('Failed to mark session as synced:', error);
  }
};

/**
 * Syncs all unsynced sessions to the API (disabled in local-only mode)
 */
export const syncPendingSessions = async (userId?: string): Promise<{ synced: number; failed: number }> => {
  return { synced: 0, failed: 0 };
};

/**
 * Retrieves all sessions from localStorage
 * @param userId - Optional user ID to scope the sessions to (defaults to current user from auth)
 */
export const getSessions = (userId?: string): SessionData[] => {
  try {
    // Migrate legacy data if needed
    if (userId) {
      migrateLegacyData(userId);
    }

    const storageKey = getStorageKey(userId);
    const stored = localStorage.getItem(storageKey);
    if (!stored) return [];

    const sessions = JSON.parse(stored);

    // Convert date strings back to Date objects
    return sessions.map((session: any) => ({
      ...session,
      timestamp: new Date(session.timestamp),
      transcript: session.transcript.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }))
    }));
  } catch (error) {
    console.error('Failed to retrieve sessions:', error);
    return [];
  }
};

/**
 * Retrieves a specific session by ID
 * @param sessionId - Session ID to retrieve
 * @param userId - Optional user ID to scope the search to
 */
export const getSessionById = (sessionId: string, userId?: string): SessionData | null => {
  const sessions = getSessions(userId);
  return sessions.find(s => s.sessionId === sessionId) || null;
};

/**
 * Updates an existing session (useful for adding final score after completion)
 * @param sessionId - Session ID to update
 * @param updates - Partial session data to update
 * @param userId - Optional user ID to scope the update to
 */
export const updateSession = async (sessionId: string, updates: Partial<SessionData>, userId?: string): Promise<boolean> => {
  try {
    const sessions = getSessions(userId);
    const sessionIndex = sessions.findIndex(s => s.sessionId === sessionId);

    if (sessionIndex === -1) return false;

    sessions[sessionIndex] = {
      ...sessions[sessionIndex],
      ...updates,
      synced: true
    };

    const storageKey = getStorageKey(userId);
    localStorage.setItem(storageKey, JSON.stringify(sessions));

    return true;
  } catch (error) {
    console.error('Failed to update session:', error);
    return false;
  }
};

/**
 * Deletes a specific session
 * @param sessionId - Session ID to delete
 * @param userId - Optional user ID to scope the deletion to
 */
export const deleteSession = (sessionId: string, userId?: string): boolean => {
  try {
    const sessions = getSessions(userId);
    const filteredSessions = sessions.filter(s => s.sessionId !== sessionId);
    const storageKey = getStorageKey(userId);
    localStorage.setItem(storageKey, JSON.stringify(filteredSessions));
    return true;
  } catch (error) {
    console.error('Failed to delete session:', error);
    return false;
  }
};

/**
 * Clears all sessions from localStorage
 * @param userId - Optional user ID to scope the clear to
 */
export const clearAllSessions = (userId?: string): boolean => {
  try {
    const storageKey = getStorageKey(userId);
    localStorage.removeItem(storageKey);
    return true;
  } catch (error) {
    console.error('Failed to clear sessions:', error);
    return false;
  }
};

/**
 * Gets session statistics
 * @param userId - Optional user ID to scope statistics to
 */
export const getSessionStats = (userId?: string): {
  totalSessions: number;
  averageScore: number;
  bestScore: number;
  sessionsPerDifficulty: Record<DifficultyLevel, number>;
} => {
  const sessions = getSessions(userId);

  const sessionsWithScores = sessions.filter(s => s.finalScore !== undefined);
  const totalSessions = sessions.length;

  const averageScore = sessionsWithScores.length > 0
    ? sessionsWithScores.reduce((sum, s) => sum + (s.finalScore || 0), 0) / sessionsWithScores.length
    : 0;

  const bestScore = sessionsWithScores.length > 0
    ? Math.max(...sessionsWithScores.map(s => s.finalScore || 0))
    : 0;

  const sessionsPerDifficulty = {
    [DifficultyLevel.BEGINNER]: sessions.filter(s => s.difficulty === DifficultyLevel.BEGINNER).length,
    [DifficultyLevel.ROOKIE]: sessions.filter(s => s.difficulty === DifficultyLevel.ROOKIE).length,
    [DifficultyLevel.PRO]: sessions.filter(s => s.difficulty === DifficultyLevel.PRO).length,
    [DifficultyLevel.ELITE]: sessions.filter(s => s.difficulty === DifficultyLevel.ELITE).length,
    [DifficultyLevel.NIGHTMARE]: sessions.filter(s => s.difficulty === DifficultyLevel.NIGHTMARE).length,
  };

  return {
    totalSessions,
    averageScore: Math.round(averageScore),
    bestScore,
    sessionsPerDifficulty
  };
};

/**
 * Exports sessions as JSON for backup
 * @param userId - Optional user ID to scope export to
 */
export const exportSessions = (userId?: string): string => {
  const sessions = getSessions(userId);
  return JSON.stringify(sessions, null, 2);
};

/**
 * Imports sessions from JSON backup
 * @param jsonData - JSON string containing sessions
 * @param userId - Optional user ID to scope import to
 */
export const importSessions = (jsonData: string, userId?: string): boolean => {
  try {
    const sessions = JSON.parse(jsonData);
    const storageKey = getStorageKey(userId);
    localStorage.setItem(storageKey, JSON.stringify(sessions));
    return true;
  } catch (error) {
    console.error('Failed to import sessions:', error);
    return false;
  }
};

// =====================================================
// STREAK TRACKING SYSTEM
// =====================================================

/**
 * Generates a streak storage key specific to a user
 */
const getStreakKey = (userId?: string): string => {
  if (!userId) {
    return 'agnes_streak'; // Legacy key for backward compatibility
  }
  return `agnes_streak_${userId}`;
};

/**
 * Migrates legacy streak data to user-specific storage on first login
 */
const migrateLegacyStreakData = (userId: string): void => {
  const legacyKey = 'agnes_streak';
  const userKey = getStreakKey(userId);

  // Check if migration is needed
  const legacyData = localStorage.getItem(legacyKey);
  const userData = localStorage.getItem(userKey);

  // Only migrate if legacy data exists and user data doesn't
  if (legacyData && !userData) {
    console.log(`Migrating legacy streak data to user ${userId}`);
    localStorage.setItem(userKey, legacyData);
  }
};

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastPracticeDate: string; // ISO date string (YYYY-MM-DD)
  practiceDates: string[]; // Array of ISO date strings
  milestones: {
    sevenDays: boolean;
    thirtyDays: boolean;
    hundredDays: boolean;
  };
}

/**
 * Gets current streak data
 * @param userId - Optional user ID to scope streak to
 */
export const getStreak = (userId?: string): StreakData => {
  try {
    // Migrate legacy data if needed
    if (userId) {
      migrateLegacyStreakData(userId);
    }

    const streakKey = getStreakKey(userId);
    const stored = localStorage.getItem(streakKey);
    if (!stored) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        lastPracticeDate: '',
        practiceDates: [],
        milestones: {
          sevenDays: false,
          thirtyDays: false,
          hundredDays: false
        }
      };
    }
    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to get streak:', error);
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastPracticeDate: '',
      practiceDates: [],
      milestones: {
        sevenDays: false,
        thirtyDays: false,
        hundredDays: false
      }
    };
  }
};

/**
 * Converts Date to YYYY-MM-DD format
 */
const toDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Calculates days between two dates
 */
const daysBetween = (date1: string, date2: string): number => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Updates streak after a session
 * Returns: { newMilestone: number | null, streakBroken: boolean }
 * @param userId - Optional user ID to scope streak update to
 */
export const updateStreak = (userId?: string): { newMilestone: number | null; streakBroken: boolean } => {
  try {
    const today = toDateString(new Date());
    const streak = getStreak(userId);

    // If already practiced today, no changes needed
    if (streak.lastPracticeDate === today) {
      return { newMilestone: null, streakBroken: false };
    }

    let newStreak = streak.currentStreak;
    let streakBroken = false;

    if (streak.lastPracticeDate === '') {
      // First ever practice
      newStreak = 1;
    } else {
      const daysSinceLastPractice = daysBetween(streak.lastPracticeDate, today);

      if (daysSinceLastPractice === 1) {
        // Consecutive day - increment streak
        newStreak = streak.currentStreak + 1;
      } else if (daysSinceLastPractice > 1) {
        // Streak broken - reset to 1
        newStreak = 1;
        streakBroken = streak.currentStreak > 0;
      }
    }

    // Update longest streak
    const longestStreak = Math.max(newStreak, streak.longestStreak);

    // Check for new milestones
    let newMilestone: number | null = null;
    const milestones = { ...streak.milestones };

    if (newStreak >= 7 && !milestones.sevenDays) {
      milestones.sevenDays = true;
      newMilestone = 7;
    } else if (newStreak >= 30 && !milestones.thirtyDays) {
      milestones.thirtyDays = true;
      newMilestone = 30;
    } else if (newStreak >= 100 && !milestones.hundredDays) {
      milestones.hundredDays = true;
      newMilestone = 100;
    }

    // Add today to practice dates
    const practiceDates = [...streak.practiceDates];
    if (!practiceDates.includes(today)) {
      practiceDates.push(today);
    }

    // Save updated streak
    const updatedStreak: StreakData = {
      currentStreak: newStreak,
      longestStreak,
      lastPracticeDate: today,
      practiceDates,
      milestones
    };

    const streakKey = getStreakKey(userId);
    localStorage.setItem(streakKey, JSON.stringify(updatedStreak));

    return { newMilestone, streakBroken };
  } catch (error) {
    console.error('Failed to update streak:', error);
    return { newMilestone: null, streakBroken: false };
  }
};

/**
 * Gets calendar data for the last 30 days
 * Returns array of { date: string, practiced: boolean }
 * @param days - Number of days to retrieve
 * @param userId - Optional user ID to scope calendar to
 */
export const getStreakCalendar = (days: number = 30, userId?: string): Array<{ date: string; practiced: boolean; dayOfWeek: string }> => {
  const streak = getStreak(userId);
  const calendar: Array<{ date: string; practiced: boolean; dayOfWeek: string }> = [];
  const today = new Date();

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateString = toDateString(date);
    const dayOfWeek = dayNames[date.getDay()];

    calendar.push({
      date: dateString,
      practiced: streak.practiceDates.includes(dateString),
      dayOfWeek
    });
  }

  return calendar;
};

/**
 * Resets the streak (useful for testing or user request)
 * @param userId - Optional user ID to scope reset to
 */
export const resetStreak = (userId?: string): boolean => {
  try {
    const streakKey = getStreakKey(userId);
    localStorage.removeItem(streakKey);
    return true;
  } catch (error) {
    console.error('Failed to reset streak:', error);
    return false;
  }
};

// =====================================================
// ACHIEVEMENT SYSTEM
// =====================================================

/**
 * Generates an achievements storage key specific to a user
 */
const getAchievementsKey = (userId?: string): string => {
  if (!userId) {
    return 'agnes_achievements'; // Legacy key for backward compatibility
  }
  return `agnes_achievements_${userId}`;
};

/**
 * Migrates legacy achievements data to user-specific storage on first login
 */
const migrateLegacyAchievementsData = (userId: string): void => {
  const legacyKey = 'agnes_achievements';
  const userKey = getAchievementsKey(userId);

  // Check if migration is needed
  const legacyData = localStorage.getItem(legacyKey);
  const userData = localStorage.getItem(userKey);

  // Only migrate if legacy data exists and user data doesn't
  if (legacyData && !userData) {
    console.log(`Migrating legacy achievements data to user ${userId}`);
    localStorage.setItem(userKey, legacyData);
  }
};

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  condition: (stats: any) => boolean;
  unlockedAt?: Date;
}

export interface AchievementProgress {
  unlockedAchievements: string[]; // achievement IDs
  lastChecked: Date;
}

// Define all available achievements
export const ALL_ACHIEVEMENTS: Achievement[] = [
  // Beginner Achievements
  {
    id: 'first_session',
    name: 'First Steps',
    description: 'Complete your first training session',
    icon: '🎯',
    rarity: 'common',
    condition: (stats) => stats.totalSessions >= 1
  },
  {
    id: 'five_sessions',
    name: 'Getting Started',
    description: 'Complete 5 training sessions',
    icon: '🔥',
    rarity: 'common',
    condition: (stats) => stats.totalSessions >= 5
  },
  {
    id: 'ten_sessions',
    name: 'Committed',
    description: 'Complete 10 training sessions',
    icon: '💪',
    rarity: 'rare',
    condition: (stats) => stats.totalSessions >= 10
  },

  // Score-based Achievements
  {
    id: 'first_80',
    name: 'Solid Performance',
    description: 'Score 80 or higher in a session',
    icon: '⭐',
    rarity: 'common',
    condition: (stats) => stats.bestScore >= 80
  },
  {
    id: 'first_90',
    name: 'Excellence',
    description: 'Score 90 or higher in a session',
    icon: '🌟',
    rarity: 'rare',
    condition: (stats) => stats.bestScore >= 90
  },
  {
    id: 'perfect_100',
    name: 'Perfection',
    description: 'Achieve a perfect score of 100',
    icon: '💯',
    rarity: 'legendary',
    condition: (stats) => stats.bestScore >= 100
  },

  // Streak Achievements
  {
    id: 'streak_3',
    name: 'Warming Up',
    description: 'Maintain a 3-day practice streak',
    icon: '🔥',
    rarity: 'common',
    condition: (stats) => stats.currentStreak >= 3
  },
  {
    id: 'streak_7',
    name: 'Week Warrior',
    description: 'Maintain a 7-day practice streak',
    icon: '⚡',
    rarity: 'rare',
    condition: (stats) => stats.currentStreak >= 7
  },
  {
    id: 'streak_30',
    name: 'Monthly Master',
    description: 'Maintain a 30-day practice streak',
    icon: '👑',
    rarity: 'epic',
    condition: (stats) => stats.currentStreak >= 30
  },
  {
    id: 'streak_100',
    name: 'Unstoppable',
    description: 'Maintain a 100-day practice streak',
    icon: '🏆',
    rarity: 'legendary',
    condition: (stats) => stats.currentStreak >= 100
  },

  // Difficulty Achievements
  {
    id: 'beginner_complete',
    name: 'Learning the Ropes',
    description: 'Complete 5 Beginner sessions',
    icon: '🌱',
    rarity: 'common',
    condition: (stats) => stats.sessionsPerDifficulty?.BEGINNER >= 5
  },
  {
    id: 'rookie_graduate',
    name: 'Rookie Graduate',
    description: 'Complete 10 Rookie sessions',
    icon: '🎓',
    rarity: 'common',
    condition: (stats) => stats.sessionsPerDifficulty?.ROOKIE >= 10
  },
  {
    id: 'pro_level',
    name: 'Professional',
    description: 'Complete 10 PRO sessions',
    icon: '💼',
    rarity: 'rare',
    condition: (stats) => stats.sessionsPerDifficulty?.PRO >= 10
  },
  {
    id: 'elite_status',
    name: 'Elite Status',
    description: 'Complete 10 Elite sessions',
    icon: '💎',
    rarity: 'epic',
    condition: (stats) => stats.sessionsPerDifficulty?.ELITE >= 10
  },
  {
    id: 'nightmare_survivor',
    name: 'Nightmare Survivor',
    description: 'Complete 5 Nightmare sessions',
    icon: '🔥',
    rarity: 'legendary',
    condition: (stats) => stats.sessionsPerDifficulty?.NIGHTMARE >= 5
  },

  // Improvement Achievements
  {
    id: 'improver',
    name: 'On the Rise',
    description: 'Improve your average score by 10+ points',
    icon: '📈',
    rarity: 'rare',
    condition: (stats) => {
      // Check if average has improved (requires historical data)
      return stats.scoreImprovement >= 10;
    }
  },

  // Volume Achievements
  {
    id: 'fifty_sessions',
    name: 'Dedicated Trainer',
    description: 'Complete 50 training sessions',
    icon: '🎖️',
    rarity: 'epic',
    condition: (stats) => stats.totalSessions >= 50
  },
  {
    id: 'hundred_sessions',
    name: 'Century Club',
    description: 'Complete 100 training sessions',
    icon: '🏅',
    rarity: 'legendary',
    condition: (stats) => stats.totalSessions >= 100
  },

  // Consistency Achievement
  {
    id: 'consistent_performer',
    name: 'Consistent Performer',
    description: 'Maintain an average score of 80+ over 10 sessions',
    icon: '🎯',
    rarity: 'epic',
    condition: (stats) => stats.averageScore >= 80 && stats.totalSessions >= 10
  }
];

/**
 * Gets current achievement progress
 * @param userId - Optional user ID to scope achievements to
 */
export const getAchievementProgress = (userId?: string): AchievementProgress => {
  try {
    // Migrate legacy data if needed
    if (userId) {
      migrateLegacyAchievementsData(userId);
    }

    const achievementsKey = getAchievementsKey(userId);
    const stored = localStorage.getItem(achievementsKey);
    if (!stored) {
      return {
        unlockedAchievements: [],
        lastChecked: new Date()
      };
    }
    const progress = JSON.parse(stored);
    return {
      ...progress,
      lastChecked: new Date(progress.lastChecked)
    };
  } catch (error) {
    console.error('Failed to get achievement progress:', error);
    return {
      unlockedAchievements: [],
      lastChecked: new Date()
    };
  }
};

/**
 * Checks for newly unlocked achievements
 * Returns array of newly unlocked achievement IDs
 * @param userId - Optional user ID to scope achievement check to
 */
export const checkAchievements = (userId?: string): string[] => {
  try {
    const progress = getAchievementProgress(userId);
    const sessions = getSessions(userId);
    const stats = {
      ...getSessionStats(userId),
      currentStreak: getStreak(userId).currentStreak,
      scoreImprovement: calculateImprovement(sessions)
    };

    const newlyUnlocked: string[] = [];

    ALL_ACHIEVEMENTS.forEach(achievement => {
      // Skip if already unlocked
      if (progress.unlockedAchievements.includes(achievement.id)) {
        return;
      }

      // Check if condition is met
      if (achievement.condition(stats)) {
        newlyUnlocked.push(achievement.id);
        progress.unlockedAchievements.push(achievement.id);
      }
    });

    // Save updated progress
    if (newlyUnlocked.length > 0) {
      progress.lastChecked = new Date();
      const achievementsKey = getAchievementsKey(userId);
      localStorage.setItem(achievementsKey, JSON.stringify(progress));
    }

    return newlyUnlocked;
  } catch (error) {
    console.error('Failed to check achievements:', error);
    return [];
  }
};

/**
 * Gets all unlocked achievements with details
 * @param userId - Optional user ID to scope achievements to
 */
export const getUnlockedAchievements = (userId?: string): Achievement[] => {
  const progress = getAchievementProgress(userId);
  return ALL_ACHIEVEMENTS.filter(a => progress.unlockedAchievements.includes(a.id));
};

/**
 * Gets achievement by ID
 */
export const getAchievementById = (id: string): Achievement | undefined => {
  return ALL_ACHIEVEMENTS.find(a => a.id === id);
};

/**
 * Gets achievement completion percentage
 * @param userId - Optional user ID to scope completion to
 */
export const getAchievementCompletion = (userId?: string): number => {
  const progress = getAchievementProgress(userId);
  return Math.round((progress.unlockedAchievements.length / ALL_ACHIEVEMENTS.length) * 100);
};

/**
 * Resets achievements (for testing)
 * @param userId - Optional user ID to scope reset to
 */
export const resetAchievements = (userId?: string): boolean => {
  try {
    const achievementsKey = getAchievementsKey(userId);
    localStorage.removeItem(achievementsKey);
    return true;
  } catch (error) {
    console.error('Failed to reset achievements:', error);
    return false;
  }
};

// =====================================================
// MANAGER ANALYTICS SYSTEM
// =====================================================

export interface ManagerAnalytics {
  totalSessions: number;
  averageScore: number;
  totalTrainingHours: number;
  activeUsers: number;

  sessionsByDifficulty: Record<DifficultyLevel, number>;
  sessionsByMode: Record<PitchMode, number>;

  scoresByDate: Array<{ date: string; averageScore: number; count: number }>;
  sessionsOverTime: Array<{ date: string; count: number }>;

  topPerformers: Array<{ userId: string; averageScore: number; sessionCount: number }>;
  mostImproved: Array<{ userId: string; improvement: number; sessionCount: number }>;
  mostActive: Array<{ userId: string; sessionCount: number; totalHours: number }>;

  completionRateByDifficulty: Record<DifficultyLevel, { completed: number; total: number; rate: number }>;

  peakTrainingHours: Array<{ hour: number; count: number }>;
  peakTrainingDays: Array<{ day: string; count: number }>;
}

/**
 * Gets comprehensive manager analytics for a date range
 * @param startDate - Optional start date filter
 * @param endDate - Optional end date filter
 * @param userId - Optional user ID to scope analytics to
 */
export const getManagerAnalytics = (startDate?: Date, endDate?: Date, userId?: string): ManagerAnalytics => {
  try {
    let sessions = getSessions(userId);

    // Filter by date range if provided
    if (startDate || endDate) {
      sessions = sessions.filter(session => {
        const sessionDate = new Date(session.timestamp);
        if (startDate && sessionDate < startDate) return false;
        if (endDate && sessionDate > endDate) return false;
        return true;
      });
    }

    // Calculate total sessions and average score
    const totalSessions = sessions.length;
    const sessionsWithScores = sessions.filter(s => s.finalScore !== undefined);
    const averageScore = sessionsWithScores.length > 0
      ? Math.round(sessionsWithScores.reduce((sum, s) => sum + (s.finalScore || 0), 0) / sessionsWithScores.length)
      : 0;

    // Calculate total training hours
    const totalTrainingSeconds = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    const totalTrainingHours = Math.round((totalTrainingSeconds / 3600) * 10) / 10; // Round to 1 decimal

    // For demo, we'll assume single user. In production, track user IDs
    const activeUsers = sessions.length > 0 ? 1 : 0;

    // Sessions by difficulty
    const sessionsByDifficulty = {
      [DifficultyLevel.BEGINNER]: sessions.filter(s => s.difficulty === DifficultyLevel.BEGINNER).length,
      [DifficultyLevel.ROOKIE]: sessions.filter(s => s.difficulty === DifficultyLevel.ROOKIE).length,
      [DifficultyLevel.PRO]: sessions.filter(s => s.difficulty === DifficultyLevel.PRO).length,
      [DifficultyLevel.ELITE]: sessions.filter(s => s.difficulty === DifficultyLevel.ELITE).length,
      [DifficultyLevel.NIGHTMARE]: sessions.filter(s => s.difficulty === DifficultyLevel.NIGHTMARE).length,
    };

    // Sessions by mode
    const sessionsByMode = {
      [PitchMode.COACH]: sessions.filter(s => s.mode === PitchMode.COACH).length,
      [PitchMode.ROLEPLAY]: sessions.filter(s => s.mode === PitchMode.ROLEPLAY).length,
    };

    // Scores by date (last 30 days)
    const scoresByDate = getScoresByDate(sessions, 30);

    // Sessions over time (last 30 days)
    const sessionsOverTime = getSessionsOverTime(sessions, 30);

    // For single-user demo, create placeholder data
    const topPerformers = [
      { userId: 'current-user', averageScore, sessionCount: totalSessions }
    ];

    const mostImproved = [
      { userId: 'current-user', improvement: calculateImprovement(sessions), sessionCount: totalSessions }
    ];

    const mostActive = [
      { userId: 'current-user', sessionCount: totalSessions, totalHours: totalTrainingHours }
    ];

    // Completion rate by difficulty
    const completionRateByDifficulty = {
      [DifficultyLevel.BEGINNER]: {
        completed: sessionsByDifficulty[DifficultyLevel.BEGINNER],
        total: sessionsByDifficulty[DifficultyLevel.BEGINNER],
        rate: 100
      },
      [DifficultyLevel.ROOKIE]: {
        completed: sessionsByDifficulty[DifficultyLevel.ROOKIE],
        total: sessionsByDifficulty[DifficultyLevel.ROOKIE],
        rate: 100
      },
      [DifficultyLevel.PRO]: {
        completed: sessionsByDifficulty[DifficultyLevel.PRO],
        total: sessionsByDifficulty[DifficultyLevel.PRO],
        rate: 100
      },
      [DifficultyLevel.ELITE]: {
        completed: sessionsByDifficulty[DifficultyLevel.ELITE],
        total: sessionsByDifficulty[DifficultyLevel.ELITE],
        rate: 100
      },
      [DifficultyLevel.NIGHTMARE]: {
        completed: sessionsByDifficulty[DifficultyLevel.NIGHTMARE],
        total: sessionsByDifficulty[DifficultyLevel.NIGHTMARE],
        rate: 100
      }
    };

    // Peak training hours
    const peakTrainingHours = getPeakTrainingHours(sessions);

    // Peak training days
    const peakTrainingDays = getPeakTrainingDays(sessions);

    return {
      totalSessions,
      averageScore,
      totalTrainingHours,
      activeUsers,
      sessionsByDifficulty,
      sessionsByMode,
      scoresByDate,
      sessionsOverTime,
      topPerformers,
      mostImproved,
      mostActive,
      completionRateByDifficulty,
      peakTrainingHours,
      peakTrainingDays
    };
  } catch (error) {
    console.error('Failed to get manager analytics:', error);
    // Return empty analytics
    return {
      totalSessions: 0,
      averageScore: 0,
      totalTrainingHours: 0,
      activeUsers: 0,
      sessionsByDifficulty: {
        [DifficultyLevel.BEGINNER]: 0,
        [DifficultyLevel.ROOKIE]: 0,
        [DifficultyLevel.PRO]: 0,
        [DifficultyLevel.ELITE]: 0,
        [DifficultyLevel.NIGHTMARE]: 0
      },
      sessionsByMode: {
        [PitchMode.COACH]: 0,
        [PitchMode.ROLEPLAY]: 0
      },
      scoresByDate: [],
      sessionsOverTime: [],
      topPerformers: [],
      mostImproved: [],
      mostActive: [],
      completionRateByDifficulty: {
        [DifficultyLevel.BEGINNER]: { completed: 0, total: 0, rate: 0 },
        [DifficultyLevel.ROOKIE]: { completed: 0, total: 0, rate: 0 },
        [DifficultyLevel.PRO]: { completed: 0, total: 0, rate: 0 },
        [DifficultyLevel.ELITE]: { completed: 0, total: 0, rate: 0 },
        [DifficultyLevel.NIGHTMARE]: { completed: 0, total: 0, rate: 0 }
      },
      peakTrainingHours: [],
      peakTrainingDays: []
    };
  }
};

/**
 * Helper: Get scores grouped by date
 */
const getScoresByDate = (sessions: SessionData[], days: number): Array<{ date: string; averageScore: number; count: number }> => {
  const dateMap = new Map<string, { scores: number[]; count: number }>();

  // Create date range
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateStr = toDateString(date);
    dateMap.set(dateStr, { scores: [], count: 0 });
  }

  // Fill with session data
  sessions.forEach(session => {
    const dateStr = toDateString(new Date(session.timestamp));
    const entry = dateMap.get(dateStr);
    if (entry && session.finalScore !== undefined) {
      entry.scores.push(session.finalScore);
      entry.count++;
    }
  });

  // Convert to array
  return Array.from(dateMap.entries()).map(([date, data]) => ({
    date,
    averageScore: data.scores.length > 0
      ? Math.round(data.scores.reduce((sum, s) => sum + s, 0) / data.scores.length)
      : 0,
    count: data.count
  }));
};

/**
 * Helper: Get session counts over time
 */
const getSessionsOverTime = (sessions: SessionData[], days: number): Array<{ date: string; count: number }> => {
  const dateMap = new Map<string, number>();

  // Create date range
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateStr = toDateString(date);
    dateMap.set(dateStr, 0);
  }

  // Fill with session data
  sessions.forEach(session => {
    const dateStr = toDateString(new Date(session.timestamp));
    const count = dateMap.get(dateStr);
    if (count !== undefined) {
      dateMap.set(dateStr, count + 1);
    }
  });

  // Convert to array
  return Array.from(dateMap.entries()).map(([date, count]) => ({ date, count }));
};

/**
 * Helper: Calculate score improvement
 */
const calculateImprovement = (sessions: SessionData[]): number => {
  const sessionsWithScores = sessions
    .filter(s => s.finalScore !== undefined)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (sessionsWithScores.length < 2) return 0;

  // Compare first 3 sessions average vs last 3 sessions average
  const firstThree = sessionsWithScores.slice(0, Math.min(3, sessionsWithScores.length));
  const lastThree = sessionsWithScores.slice(-Math.min(3, sessionsWithScores.length));

  const firstAvg = firstThree.reduce((sum, s) => sum + (s.finalScore || 0), 0) / firstThree.length;
  const lastAvg = lastThree.reduce((sum, s) => sum + (s.finalScore || 0), 0) / lastThree.length;

  return Math.round(lastAvg - firstAvg);
};

/**
 * Helper: Get peak training hours
 */
const getPeakTrainingHours = (sessions: SessionData[]): Array<{ hour: number; count: number }> => {
  const hourMap = new Map<number, number>();

  // Initialize all hours
  for (let i = 0; i < 24; i++) {
    hourMap.set(i, 0);
  }

  // Fill with session data
  sessions.forEach(session => {
    const hour = new Date(session.timestamp).getHours();
    hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
  });

  // Convert to array and sort by count
  return Array.from(hourMap.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => b.count - a.count);
};

/**
 * Helper: Get peak training days
 */
const getPeakTrainingDays = (sessions: SessionData[]): Array<{ day: string; count: number }> => {
  const dayMap = new Map<string, number>();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Initialize all days
  dayNames.forEach(day => dayMap.set(day, 0));

  // Fill with session data
  sessions.forEach(session => {
    const dayIndex = new Date(session.timestamp).getDay();
    const dayName = dayNames[dayIndex];
    dayMap.set(dayName, (dayMap.get(dayName) || 0) + 1);
  });

  // Convert to array and sort by count
  return Array.from(dayMap.entries())
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => b.count - a.count);
};
