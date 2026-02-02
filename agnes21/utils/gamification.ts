import { DifficultyLevel } from '../types';
import { SessionData, StreakData } from './sessionStorage';

// =====================================================
// MANAGER MODE SYSTEM
// =====================================================

const MANAGER_CODE = 'roofer2024';
const MANAGER_MODE_KEY = 'agnes_manager_mode';

/**
 * Check if manager mode is active
 */
export const isManagerMode = (): boolean => {
  return localStorage.getItem(MANAGER_MODE_KEY) === 'true';
};

/**
 * Activate manager mode with access code
 */
export const activateManagerMode = (code: string): boolean => {
  if (code === MANAGER_CODE) {
    localStorage.setItem(MANAGER_MODE_KEY, 'true');
    return true;
  }
  return false;
};

/**
 * Deactivate manager mode
 */
export const deactivateManagerMode = (): void => {
  localStorage.removeItem(MANAGER_MODE_KEY);
};

// =====================================================
// XP AND LEVELS SYSTEM
// =====================================================

export interface UserProgress {
  userId?: string;
  totalXP: number;
  currentLevel: number;
  xpToNextLevel: number;
  unlockedDifficulties: DifficultyLevel[];
}

/**
 * Generates a progress storage key specific to a user
 */
const getProgressKey = (userId?: string): string => {
  if (!userId) {
    return 'agnes_progress'; // Legacy key for backward compatibility
  }
  return `agnes_progress_${userId}`;
};

/**
 * Migrates legacy progress data to user-specific storage on first login
 */
const migrateLegacyProgressData = (userId: string): void => {
  const legacyKey = 'agnes_progress';
  const userKey = getProgressKey(userId);

  // Check if migration is needed
  const legacyData = localStorage.getItem(legacyKey);
  const userData = localStorage.getItem(userKey);

  // Only migrate if legacy data exists and user data doesn't
  if (legacyData && !userData) {
    console.log(`Migrating legacy progress data to user ${userId}`);
    localStorage.setItem(userKey, legacyData);
  }
};

/**
 * Calculates the total XP required to reach a specific level
 * Formula: XP = 50 * level^2
 */
export const getXPForLevel = (level: number): number => {
  if (level <= 1) return 0;
  return 50 * Math.pow(level, 2);
};

/**
 * Calculates what level corresponds to a given total XP
 */
export const getLevelForXP = (totalXP: number): number => {
  if (totalXP <= 0) return 1;

  // Binary search for efficiency
  let level = 1;
  while (getXPForLevel(level + 1) <= totalXP) {
    level++;
  }
  return level;
};

/**
 * Gets difficulties unlocked at a specific level
 * NOTE: All difficulties are now unlocked for all users
 */
export const getUnlockedDifficulties = (level: number): DifficultyLevel[] => {
  // All difficulties unlocked for everyone
  return [
    DifficultyLevel.BEGINNER,
    DifficultyLevel.ROOKIE,
    DifficultyLevel.PRO,
    DifficultyLevel.VETERAN,
    DifficultyLevel.ELITE
  ];
};

/**
 * Checks if a difficulty is unlocked at the current level
 * NOTE: All difficulties are now unlocked for all users
 */
export const isDifficultyUnlocked = (difficulty: DifficultyLevel, level: number): boolean => {
  // All difficulties unlocked for everyone
  return true;
};

/**
 * Gets the level requirement for a difficulty
 * NOTE: All difficulties now available at level 1
 */
export const getLevelRequiredForDifficulty = (difficulty: DifficultyLevel): number => {
  // All difficulties available from level 1
  return 1;
};

/**
 * Gets current user progress
 */
export const getUserProgress = (userId?: string): UserProgress => {
  try {
    // Migrate legacy data if needed
    if (userId) {
      migrateLegacyProgressData(userId);
    }

    const progressKey = getProgressKey(userId);
    const stored = localStorage.getItem(progressKey);

    if (!stored) {
      return {
        userId,
        totalXP: 0,
        currentLevel: 1,
        xpToNextLevel: getXPForLevel(2),
        unlockedDifficulties: [DifficultyLevel.BEGINNER]
      };
    }

    const progress = JSON.parse(stored);
    const currentLevel = getLevelForXP(progress.totalXP);
    const xpToNextLevel = getXPForLevel(currentLevel + 1) - progress.totalXP;

    return {
      userId: progress.userId || userId,
      totalXP: progress.totalXP || 0,
      currentLevel,
      xpToNextLevel,
      unlockedDifficulties: getUnlockedDifficulties(currentLevel)
    };
  } catch (error) {
    console.error('Failed to get user progress:', error);
    return {
      userId,
      totalXP: 0,
      currentLevel: 1,
      xpToNextLevel: getXPForLevel(2),
      unlockedDifficulties: [DifficultyLevel.BEGINNER]
    };
  }
};

/**
 * Gets the difficulty multiplier for XP calculation
 */
const getDifficultyMultiplier = (difficulty: DifficultyLevel): number => {
  switch (difficulty) {
    case DifficultyLevel.BEGINNER:
      return 1.0;
    case DifficultyLevel.ROOKIE:
      return 1.25;
    case DifficultyLevel.PRO:
      return 1.5;
    case DifficultyLevel.VETERAN:
      return 1.75;
    case DifficultyLevel.ELITE:
      return 2.0;
    default:
      return 1.0;
  }
};

/**
 * Calculates XP earned for a session
 */
export const calculateSessionXP = (sessionData: SessionData, streakData: StreakData): number => {
  const baseXP = 50;
  const score = sessionData.finalScore || 0;
  const difficulty = sessionData.difficulty;
  const currentStreak = streakData.currentStreak;

  // Score bonus: +1 XP per point above 70 (max +30 for score 100)
  const scoreBonus = Math.max(0, Math.min(30, score - 70));

  // Perfect score bonus: +50 XP
  const perfectBonus = score >= 100 ? 50 : 0;

  // Streak bonus: +10 XP per day in current streak
  const streakBonus = currentStreak * 10;

  // Calculate total before multiplier
  const totalBeforeMultiplier = baseXP + scoreBonus + perfectBonus + streakBonus;

  // Apply difficulty multiplier
  const difficultyMultiplier = getDifficultyMultiplier(difficulty);
  const totalXP = Math.round(totalBeforeMultiplier * difficultyMultiplier);

  console.log('XP Calculation:', {
    baseXP,
    scoreBonus,
    perfectBonus,
    streakBonus,
    difficultyMultiplier,
    totalXP
  });

  return totalXP;
};

/**
 * Awards XP to the user and returns level-up information
 */
export const awardXP = (
  xp: number,
  userId?: string
): {
  leveledUp: boolean;
  newLevel: number;
  previousLevel: number;
  totalXP: number;
  newUnlocks: string[];
} => {
  try {
    const progress = getUserProgress(userId);
    const previousLevel = progress.currentLevel;
    const newTotalXP = progress.totalXP + xp;
    const newLevel = getLevelForXP(newTotalXP);
    const leveledUp = newLevel > previousLevel;

    // Check for new unlocks
    const newUnlocks: string[] = [];
    if (leveledUp) {
      const previousUnlocked = getUnlockedDifficulties(previousLevel);
      const newUnlocked = getUnlockedDifficulties(newLevel);

      newUnlocked.forEach(difficulty => {
        if (!previousUnlocked.includes(difficulty)) {
          newUnlocks.push(`${difficulty} Difficulty Unlocked!`);
        }
      });
    }

    // Save updated progress
    const updatedProgress = {
      userId,
      totalXP: newTotalXP
    };

    const progressKey = getProgressKey(userId);
    localStorage.setItem(progressKey, JSON.stringify(updatedProgress));

    console.log('XP Awarded:', {
      xpGained: xp,
      totalXP: newTotalXP,
      previousLevel,
      newLevel,
      leveledUp,
      newUnlocks
    });

    return {
      leveledUp,
      newLevel,
      previousLevel,
      totalXP: newTotalXP,
      newUnlocks
    };
  } catch (error) {
    console.error('Failed to award XP:', error);
    return {
      leveledUp: false,
      newLevel: 1,
      previousLevel: 1,
      totalXP: 0,
      newUnlocks: []
    };
  }
};

/**
 * Resets progress (for testing)
 */
export const resetProgress = (userId?: string): boolean => {
  try {
    const progressKey = getProgressKey(userId);
    localStorage.removeItem(progressKey);
    console.log('Progress reset successfully');
    return true;
  } catch (error) {
    console.error('Failed to reset progress:', error);
    return false;
  }
};

/**
 * Gets XP breakdown for display purposes
 */
export const getXPBreakdown = (sessionData: SessionData, streakData: StreakData): {
  baseXP: number;
  scoreBonus: number;
  perfectBonus: number;
  streakBonus: number;
  difficultyMultiplier: number;
  totalXP: number;
} => {
  const baseXP = 50;
  const score = sessionData.finalScore || 0;
  const difficulty = sessionData.difficulty;
  const currentStreak = streakData.currentStreak;

  const scoreBonus = Math.max(0, Math.min(30, score - 70));
  const perfectBonus = score >= 100 ? 50 : 0;
  const streakBonus = currentStreak * 10;
  const difficultyMultiplier = getDifficultyMultiplier(difficulty);

  const totalBeforeMultiplier = baseXP + scoreBonus + perfectBonus + streakBonus;
  const totalXP = Math.round(totalBeforeMultiplier * difficultyMultiplier);

  return {
    baseXP,
    scoreBonus,
    perfectBonus,
    streakBonus,
    difficultyMultiplier,
    totalXP
  };
};

/**
 * Gets progress percentage for current level
 */
export const getLevelProgressPercentage = (userId?: string): number => {
  const progress = getUserProgress(userId);
  const currentLevelXP = getXPForLevel(progress.currentLevel);
  const nextLevelXP = getXPForLevel(progress.currentLevel + 1);
  const xpInCurrentLevel = progress.totalXP - currentLevelXP;
  const xpNeededForLevel = nextLevelXP - currentLevelXP;

  return Math.round((xpInCurrentLevel / xpNeededForLevel) * 100);
};
