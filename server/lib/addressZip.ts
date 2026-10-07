/** One-line address ZIPs follow the state, never the house number. */
const STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC';
const END = new RegExp(`(?:^|[\\s,])(${STATES})\\.?[\\s,]*(?:(\\d{5})(?:-\\d{4})?)?\\s*(?:,?\\s*(?:USA|US|United States))?\\s*$`, 'i');

export function addressStateZip(address: string | null | undefined): { state: string; zip: string } {
  const match = (address || '').trim().match(END);
  return { state: match?.[1]?.toUpperCase() || '', zip: match?.[2] || '' };
}

/** Separate ZIP fields remain valid; correct a mistakenly posted house number. */
export function leadAddressZip(address: string | null | undefined, given?: string | null): string {
  const parsed = addressStateZip(address).zip;
  const posted = (given || '').trim();
  const house = (address || '').trim().match(/^\d+/)?.[0];
  if (posted === house) return parsed;
  return /^\d{5}(?:-\d{4})?$/.test(posted) ? posted.slice(0, 5) : parsed;
}
