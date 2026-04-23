/**
 * Eastern-Time date formatters for the UI.
 *
 * Reps travel — don't let the browser's local tz flip a storm date by one
 * day while they're in TX or FL. Every date/time a human reads on our map,
 * dashboards, or chat is pinned to America/New_York.
 */

export const ET_TZ = 'America/New_York';

/** "Apr 23, 2026, 3:45 PM ET" */
export function formatETDateTime(
  input: string | number | Date,
  opts: Intl.DateTimeFormatOptions = {},
): string {
  try {
    const d = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input;
    if (isNaN(d.getTime())) return String(input);
    const s = d.toLocaleString('en-US', {
      timeZone: ET_TZ,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      ...opts,
    });
    return `${s} ET`;
  } catch {
    return String(input);
  }
}

/** "Apr 23, 2026" */
export function formatETDate(
  input: string | number | Date,
  opts: Intl.DateTimeFormatOptions = {},
): string {
  try {
    const d = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input;
    if (isNaN(d.getTime())) return String(input);
    return d.toLocaleDateString('en-US', {
      timeZone: ET_TZ,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      ...opts,
    });
  } catch {
    return String(input);
  }
}

/** "3:45 PM ET" */
export function formatETTime(
  input: string | number | Date,
  opts: Intl.DateTimeFormatOptions = {},
): string {
  try {
    const d = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input;
    if (isNaN(d.getTime())) return String(input);
    const s = d.toLocaleTimeString('en-US', {
      timeZone: ET_TZ,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      ...opts,
    });
    return `${s} ET`;
  } catch {
    return String(input);
  }
}
