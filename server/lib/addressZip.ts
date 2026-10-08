/** One-line address ZIPs follow the state, never the house number. */
const STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC';
const END = new RegExp(`(?:^|[\\s,])(${STATES})\\.?[\\s,]*(?:(\\d{5})(?:-\\d{4})?)?\\s*(?:,?\\s*(?:USA|US|United States))?\\s*$`, 'i');

export function addressStateZip(address: unknown): { state: string; zip: string } {
  const match = String(address ?? '').trim().match(END);
  return { state: match?.[1]?.toUpperCase() || '', zip: match?.[2] || '' };
}

/** Separate ZIP fields remain valid; correct a mistakenly posted house number. */
/** A ZIP posted as a number (a phone agent's collected value) is read as its digits, never thrown on. */
export function leadAddressZip(address: unknown, given?: unknown): string {
  const parsed = addressStateZip(address).zip;
  const posted = String(given ?? '').trim();
  const house = String(address ?? '').trim().match(/^\d+/)?.[0];
  if (posted === house) return parsed;
  return /^\d{5}(?:-\d{4})?$/.test(posted) ? posted.slice(0, 5) : parsed;
}

const TAIL_STATE = /\b(VA|MD|PA|DC|WV|DE|Virginia|Maryland|Pennsylvania|District\s+of\s+Columbia|West\s+Virginia|Delaware)\b/i;
const TAIL_STATE_CODES: Record<string, string> = {
  va: 'VA', md: 'MD', pa: 'PA', dc: 'DC', wv: 'WV', de: 'DE',
  virginia: 'VA', maryland: 'MD', pennsylvania: 'PA',
  'district of columbia': 'DC', 'west virginia': 'WV', delaware: 'DE',
};

/**
 * The state and ZIP in the words after a street (the GroupMe bot's
 * addresses, 2026-10-07). With a state named, the ZIP is the five digits
 * right after it, words after the ZIP allowed; with none, the first five
 * digits there. It was the first five digits anywhere in those words, so
 * "4521 Oak Ln Fairfax VA got hit, 12345 Elm too" read 12345. `cutoff` is
 * where the city ends: at the state, else at the ZIP. Null when neither is
 * there (not an address the bot can look up).
 */
export function streetTailStateZip(tail: string): { state?: string; zip?: string; cutoff: number } | null {
  const sm = tail.match(TAIL_STATE);
  if (sm) {
    const after = tail.slice((sm.index ?? 0) + sm[0].length);
    const zip = after.match(/^[.\s,]*(\d{5})(?:-\d{4})?\b/)?.[1];
    const name = sm[1].toLowerCase().replace(/\s+/g, ' ');
    return { state: TAIL_STATE_CODES[name] || sm[1].toUpperCase(), zip, cutoff: sm.index ?? 1000 };
  }
  const zm = tail.match(/\b(\d{5})(?:-\d{4})?\b/);
  return zm ? { zip: zm[1], cutoff: zm.index ?? 1000 } : null;
}
