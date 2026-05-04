/**
 * Shared team roster lookup — used by both susanGroupMeBotRoutes (existing
 * teammate-guard) and susanIntentRouter (new override). Same source of truth.
 *
 * Pulls Sales Team roster from GroupMe API. Cached for 1 hour.
 */
import { readFileSync } from 'fs';
import { homedir } from 'os';

const SALES_GROUP_ID = process.env.GROUPME_SUSAN_GROUP_ID || '93177620';
const TEAM_ROSTER_TTL_MS = 60 * 60 * 1000;

export type TeamRoster = {
  fullNames: Set<string>;
  firstNames: Set<string>;
  ambiguousFirstNames: Set<string>;
  tokens: Set<string>;
  lastFetch: number;
};

let cache: TeamRoster | null = null;

export async function getTeamRoster(): Promise<TeamRoster | null> {
  if (cache && Date.now() - cache.lastFetch < TEAM_ROSTER_TTL_MS) return cache;
  const token = process.env.GROUPME_TOKEN || (() => {
    try { return readFileSync(`${homedir()}/.groupme-token`, 'utf-8').trim(); }
    catch { return ''; }
  })();
  if (!token) return cache;
  try {
    const r = await fetch(`https://api.groupme.com/v3/groups/${SALES_GROUP_ID}?token=${token}`);
    if (!r.ok) return cache;
    const data: any = await r.json();
    const members: any[] = data?.response?.members || [];
    const fullNames = new Set<string>();
    const firstCount = new Map<string, number>();
    const tokens = new Set<string>();
    for (const m of members) {
      const nick = String(m.nickname || '').trim().toLowerCase();
      if (!nick) continue;
      const cleaned = nick.replace(/[^\p{L}\s'\-]/gu, ' ').replace(/\s+/g, ' ').trim();
      if (cleaned.length < 2) continue;
      fullNames.add(cleaned);
      const parts = cleaned.split(/\s+/);
      if (parts[0]) {
        firstCount.set(parts[0], (firstCount.get(parts[0]) || 0) + 1);
        tokens.add(parts[0]);
      }
      if (parts.length > 1) tokens.add(parts[parts.length - 1]);
    }
    const firstNames = new Set<string>();
    const ambiguousFirstNames = new Set<string>();
    for (const [first, n] of firstCount) {
      if (n === 1) firstNames.add(first);
      else ambiguousFirstNames.add(first);
    }
    cache = { fullNames, firstNames, ambiguousFirstNames, tokens, lastFetch: Date.now() };
    return cache;
  } catch {
    return cache;
  }
}

export function isTeammate(candidate: string, roster: TeamRoster): boolean {
  if (!candidate || !roster) return false;
  const lc = candidate.toLowerCase().replace(/[^\p{L}\s'\-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!lc) return false;
  if (roster.fullNames.has(lc)) return true;
  for (const fn of roster.fullNames) {
    if (fn === lc) return true;
    const parts = lc.split(/\s+/);
    if (parts.length >= 2) {
      const first = parts[0];
      const last = parts[parts.length - 1];
      if (fn.startsWith(first + ' ') && fn.endsWith(' ' + last)) return true;
    }
  }
  if (roster.firstNames.has(lc)) return true;
  // Ambiguous first names ALSO redirect — better to redirect a real adjuster
  // share-name with a teammate than leak teammate intel
  if (roster.ambiguousFirstNames.has(lc)) return true;
  return false;
}
