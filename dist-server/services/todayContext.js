// The model has no clock. Without this block Susan guessed the weekday and
// answered "PTO this month" with February (anchored on example dates in tool
// descriptions). Every relative date must resolve from the real Eastern date.
const TZ = 'America/New_York';
export function todayContextBlock(now = new Date()) {
    const ymd = now.toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
    const [year, month] = ymd.split('-');
    const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
    const spoken = now.toLocaleDateString('en-US', {
        timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
    const time = now.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
    return `[TODAY]\nToday is ${spoken} (${ymd}), ${time} Eastern Time. ` +
        `"This month" is ${year}-${month} (${year}-${month}-01 to ${year}-${month}-${String(lastDay).padStart(2, '0')}). ` +
        'Resolve every relative date (today, tomorrow, this week, this month, next month, last month) from this date. ' +
        'Never take a date from an example in a tool description or from memory, and when a tool takes a month or date range, pass the one computed from today.';
}
