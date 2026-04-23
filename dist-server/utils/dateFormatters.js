/**
 * Eastern-Time date formatters.
 *
 * Everything a rep, adjuster, or homeowner reads is in America/New_York.
 * Use these helpers instead of bare toLocaleString() to avoid UTC leaking
 * into PDFs, email, Susan replies, or notifications from the Railway
 * container (which runs in UTC).
 *
 * UTC ISO timestamps (e.g. /api/health) still go out as-is — those are for
 * machines, not humans.
 */
export const ET_TZ = 'America/New_York';
/**
 * "Apr 23, 2026, 3:45 PM ET"
 */
export function formatETDateTime(input, opts = {}) {
    try {
        const d = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input;
        if (isNaN(d.getTime()))
            return String(input);
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
    }
    catch {
        return String(input);
    }
}
/**
 * "Apr 23, 2026"
 */
export function formatETDate(input, opts = {}) {
    try {
        const d = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input;
        if (isNaN(d.getTime()))
            return String(input);
        return d.toLocaleDateString('en-US', {
            timeZone: ET_TZ,
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            ...opts,
        });
    }
    catch {
        return String(input);
    }
}
/**
 * "3:45 PM ET"
 */
export function formatETTime(input, opts = {}) {
    try {
        const d = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input;
        if (isNaN(d.getTime()))
            return String(input);
        const s = d.toLocaleTimeString('en-US', {
            timeZone: ET_TZ,
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            ...opts,
        });
        return `${s} ET`;
    }
    catch {
        return String(input);
    }
}
/**
 * YYYY-MM-DD in ET — the "storm day" form used across verified_hail_events.
 */
export function toETISODate(input) {
    try {
        const d = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input;
        if (isNaN(d.getTime()))
            return String(input);
        return d.toLocaleDateString('en-CA', { timeZone: ET_TZ });
    }
    catch {
        return String(input);
    }
}
