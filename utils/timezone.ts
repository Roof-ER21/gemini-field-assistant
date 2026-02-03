/**
 * Timezone Utilities
 *
 * All storm/hail data is normalized to Eastern timezone (America/New_York)
 * for consistency across IHM, NOAA, and user displays.
 */

const EASTERN_TIMEZONE = 'America/New_York';

/**
 * Convert a date to Eastern timezone in YYYY-MM-DD format
 * @param date - Date string or Date object
 * @returns Date string in YYYY-MM-DD format (Eastern time)
 */
export const toEasternDate = (date: string | Date): string => {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      console.warn('Invalid date provided to toEasternDate:', date);
      return typeof date === 'string' ? date : '';
    }

    // en-CA locale gives YYYY-MM-DD format
    return d.toLocaleDateString('en-CA', { timeZone: EASTERN_TIMEZONE });
  } catch (error) {
    console.error('Error converting date to Eastern:', error);
    return typeof date === 'string' ? date : '';
  }
};

/**
 * Format a date for display in Eastern timezone
 * @param date - Date string or Date object
 * @param format - Display format ('short' or 'long')
 * @returns Formatted date string
 */
export const formatEasternDate = (
  date: string | Date,
  format: 'short' | 'long' = 'short'
): string => {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      console.warn('Invalid date provided to formatEasternDate:', date);
      return typeof date === 'string' ? date : '';
    }

    if (format === 'long') {
      return d.toLocaleDateString('en-US', {
        timeZone: EASTERN_TIMEZONE,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }

    // Short format: "Jan 15, 2024"
    return d.toLocaleDateString('en-US', {
      timeZone: EASTERN_TIMEZONE,
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date to Eastern:', error);
    return typeof date === 'string' ? date : '';
  }
};

/**
 * Format a date with time in Eastern timezone
 * @param date - Date string or Date object
 * @returns Formatted date-time string
 */
export const formatEasternDateTime = (date: string | Date): string => {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      console.warn('Invalid date provided to formatEasternDateTime:', date);
      return typeof date === 'string' ? date : '';
    }

    return d.toLocaleString('en-US', {
      timeZone: EASTERN_TIMEZONE,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch (error) {
    console.error('Error formatting datetime to Eastern:', error);
    return typeof date === 'string' ? date : '';
  }
};

/**
 * Check if the user's browser is in Eastern timezone
 * @returns true if user is in Eastern timezone
 */
export const isEasternTimezone = (): boolean => {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timezone === EASTERN_TIMEZONE || timezone === 'America/Detroit';
  } catch (error) {
    console.error('Error checking timezone:', error);
    return false;
  }
};

/**
 * Get the user's current timezone
 * @returns IANA timezone string (e.g., "America/New_York")
 */
export const getUserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    console.error('Error getting user timezone:', error);
    return 'UTC';
  }
};

/**
 * Calculate days since a date (in Eastern timezone)
 * @param date - Date string or Date object
 * @returns Number of days since the date
 */
export const daysSince = (date: string | Date): number => {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      console.warn('Invalid date provided to daysSince:', date);
      return 0;
    }

    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  } catch (error) {
    console.error('Error calculating days since:', error);
    return 0;
  }
};

/**
 * Check if a date is within the last N days (Eastern timezone)
 * @param date - Date string or Date object
 * @param days - Number of days to check
 * @returns true if date is within the last N days
 */
export const isWithinLastDays = (date: string | Date, days: number): boolean => {
  return daysSince(date) <= days;
};

/**
 * Get a date N days ago (Eastern timezone)
 * @param days - Number of days ago
 * @returns Date object for N days ago
 */
export const daysAgo = (days: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

/**
 * Get a date N months ago (Eastern timezone)
 * @param months - Number of months ago
 * @returns Date object for N months ago
 */
export const monthsAgo = (months: number): Date => {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date;
};

/**
 * Constants
 */
export const TIMEZONE = {
  EASTERN: EASTERN_TIMEZONE,
  get USER(): string {
    return getUserTimezone();
  }
} as const;
