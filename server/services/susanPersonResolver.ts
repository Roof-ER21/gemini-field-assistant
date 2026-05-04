/**
 * susanPersonResolver — resolves a question's person reference to a single
 * canonical person (teammate or adjuster), or to a disambiguation prompt
 * when the same name exists across roles or carriers.
 *
 * This replaces free-text FTS for person-name questions in the Susan bot.
 * FTS conflated teammates with same-named adjusters ("Ross", "Nick", "Ben")
 * and let the LLM cross them up at synthesis. With the persons registry,
 * retrieval is keyed by person_id, eliminating that class of error.
 */
import pg from 'pg';

export interface PersonRow {
  id: number;
  canonical_name: string;
  alt_names: string[];
  person_type: 'teammate' | 'adjuster' | 'company';
  carrier: string | null;
  team_user_id: string | null;
  notes: string | null;
}

export interface KbRowForPerson {
  id: number;
  name: string;
  category: string;
  content: string;
  state: string | null;
  rank: number;   // shaped to match kbSearch return — always 1.0 since person_id retrieval is exact
}

export type ResolveOutcome =
  // No person reference detected — fall through to normal handling.
  | { kind: 'none' }
  // A name was queried but nothing matches — Susan should say so plainly.
  | { kind: 'unknown_name'; queriedName: string }
  // Exactly one teammate match — redirect ("our guy, off-limits").
  | { kind: 'teammate_only'; person: PersonRow; queriedName: string }
  // Exactly one adjuster match — pull KB rows by person_id and synthesize.
  | { kind: 'adjuster_only'; person: PersonRow; queriedName: string }
  // A company / claims-service match — single match, treat similarly to adjuster.
  | { kind: 'company_only'; person: PersonRow; queriedName: string }
  // Multiple persons share this name — ask the rep which.
  | { kind: 'ambiguous'; candidates: PersonRow[]; queriedName: string };

const PERSON_LOOKUP_PATTERNS: RegExp[] = [
  // "tell me about <Name>", "what about <Name>", "who is <Name>"
  /\b(?:tell\s+me\s+about|what(?:'s|\s+is)?\s+up\s+with|what\s+about|who\s+is|how\s+is|how's|thoughts?\s+on|opinion\s+on|got\s+(?:any\s+)?(?:intel|info)\s+on)\s+([A-Z][a-zA-Z'\.-]+(?:\s+[A-Z][a-zA-Z'\.-]+){0,2})/,
  // "<Name> playbook"
  /\b([A-Z][a-zA-Z'\.-]+(?:\s+[A-Z][a-zA-Z'\.-]+){0,2})\s+(?:playbook|strategy|approach)\b/,
  // bare name with question mark or short "Nick?"
  /^([A-Z][a-zA-Z'\.-]+(?:\s+[A-Z][a-zA-Z'\.-]+){0,2})\s*\?\s*$/,
  // "got X today" / "had X today" — appointment-style
  /\b(?:got|have|had|getting|seeing|meeting)\s+([A-Z][a-zA-Z'\.-]+(?:\s+[A-Z][a-zA-Z'\.-]+){0,1})\s+(?:today|tomorrow|tmrw|on\s+\w+)/,
];

const STOPWORD_NAMES = new Set([
  'susan', 'the', 'this', 'that', 'who', 'what', 'why', 'how',
  'i', 'we', 'us', 'you', 'they', 'it',
  'allstate', 'usaa', 'travelers', 'erie', 'progressive', 'farmers',
  'state', 'farm', 'liberty', 'mutual', 'nationwide', 'geico', 'amica',
  'hartford', 'cincinnati', 'hanover', 'kemper', 'metlife', 'safeco',
  'chubb', 'encompass', 'homesite', 'seeknow', 'rebuild', 'patriot',
  'hancock', 'global', 'risk', 'alacrity', 'trident',
  'va', 'md', 'pa', 'dc', 'wv', 'de', 'dmv', 'nws', 'nexrad', 'mrms',
  'lfg', 'gm', 'ho', 'ok', 'okay', 'yeah', 'yes', 'no', 'nah',
]);

/**
 * Extract candidate person names from a message. Combines:
 *   1. Names supplied by entity extractor (Groq) — already structured
 *   2. Pattern-matched names from the message (catches things Groq missed)
 */
// Strip leading addressee/stopword tokens from a candidate name.
// "Susan Anthony" → "Anthony", "Hey Nick" → "Nick", "the Allstate" → "" (filtered).
function peelLeadingStopwords(name: string): string {
  let n = name.trim();
  while (true) {
    const parts = n.split(/\s+/);
    if (parts.length <= 1) break;
    if (!STOPWORD_NAMES.has(parts[0].toLowerCase())) break;
    n = parts.slice(1).join(' ');
  }
  return n;
}

export function extractPersonCandidates(text: string, entityNames: string[] = []): string[] {
  const out = new Set<string>();
  // Entity-name path (Groq output). Groq sometimes prefixes the addressee
  // ("Susan Anthony" when the rep wrote "Susan Anthony?"). Peel it.
  for (const n of entityNames) {
    let name = peelLeadingStopwords((n || '').trim());
    if (!name) continue;
    const lower = name.toLowerCase().replace(/\s+/g, ' ');
    if (STOPWORD_NAMES.has(lower)) continue;
    if (lower.length < 2) continue;
    out.add(name);
  }
  // Pattern path (regex over the message text)
  for (const re of PERSON_LOOKUP_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const name = peelLeadingStopwords((m[1] || '').trim());
    if (!name) continue;
    const lower = name.toLowerCase();
    if (STOPWORD_NAMES.has(lower)) continue;
    if (name.length < 2) continue;
    out.add(name);
  }
  return Array.from(out);
}

/**
 * Look up persons matching a single candidate name. Matches on:
 *   - canonical_name equality (case-insensitive)
 *   - alt_names array containment (case-insensitive)
 * Carrier hint, when supplied and unambiguous, narrows adjuster matches.
 */
async function lookupCandidate(
  pool: pg.Pool,
  candidate: string,
  carrierHints: string[]
): Promise<PersonRow[]> {
  const name = candidate.trim();
  if (!name) return [];
  // Match by lowered canonical_name OR alt_names entry (case-insensitive).
  // alt_names is TEXT[]; we lowercase the array client-side for the IN check.
  const result = await pool.query<PersonRow>(
    `SELECT id, canonical_name, alt_names, person_type, carrier, team_user_id::text AS team_user_id, notes
     FROM susan_persons
     WHERE canonical_lower = lower($1)
        OR EXISTS (
          SELECT 1 FROM unnest(alt_names) AS alt
          WHERE lower(alt) = lower($1)
        )
     ORDER BY person_type, canonical_name`,
    [name]
  );
  let rows = result.rows;
  // Carrier hint is a strong "asking about an external person" signal.
  // When the rep explicitly names a carrier ("Nick at Hancock", "Ben at
  // State Farm"), drop teammates entirely and keep only matching adjuster(s).
  // This collapses the disambiguation when the rep already disambiguated.
  if (carrierHints.length > 0) {
    const lowerHints = carrierHints.map((c) => c.toLowerCase());
    const adjusters = rows.filter((r) => r.person_type === 'adjuster' || r.person_type === 'company');
    const matching = adjusters.filter((r) => {
      if (!r.carrier) return false;
      const carrierLower = r.carrier.toLowerCase();
      return lowerHints.some((h) => carrierLower.includes(h) || h.includes(carrierLower));
    });
    if (matching.length >= 1) {
      // Carrier hint resolved adjuster ambiguity — teammates are no longer
      // candidates. The rep clearly meant the adjuster.
      rows = matching;
    }
  }
  return rows;
}

export interface ResolveInput {
  text: string;
  entityAdjusterNames?: string[];   // from groqExtract().adjusters
  carrierHints?: string[];           // from groqExtract().carriers
}

export async function resolvePerson(
  pool: pg.Pool,
  input: ResolveInput
): Promise<ResolveOutcome> {
  const candidates = extractPersonCandidates(input.text, input.entityAdjusterNames || []);
  if (candidates.length === 0) return { kind: 'none' };

  // Resolve each candidate; if any resolves cleanly we use the first hit.
  // Multi-name questions are rare in this chat — handle them later if needed.
  for (const candidate of candidates) {
    const rows = await lookupCandidate(pool, candidate, input.carrierHints || []);
    if (rows.length === 0) {
      // Try the *next* candidate before declaring unknown — Groq sometimes
      // emits a stopword-y candidate that gets stripped, while a pattern match
      // gives the real name.
      continue;
    }
    if (rows.length === 1) {
      const p = rows[0];
      if (p.person_type === 'teammate') return { kind: 'teammate_only', person: p, queriedName: candidate };
      if (p.person_type === 'company') return { kind: 'company_only', person: p, queriedName: candidate };
      return { kind: 'adjuster_only', person: p, queriedName: candidate };
    }
    return { kind: 'ambiguous', candidates: rows, queriedName: candidate };
  }
  // No candidate resolved — but we DID see candidate names. Tell the caller.
  return { kind: 'unknown_name', queriedName: candidates[0] };
}

/**
 * Fetch the KB rows tagged to a single person_id. This is THE retrieval call
 * for adjuster-intel synthesis — never falls back to text search, because text
 * search is what caused the cross-up in the first place.
 */
export async function fetchKbRowsForPerson(
  pool: pg.Pool,
  personId: number,
  limit: number = 5
): Promise<KbRowForPerson[]> {
  const result = await pool.query<{ id: number; name: string; category: string; content: string; state: string | null }>(
    `SELECT id, name, category, content, state
     FROM knowledge_documents
     WHERE person_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [personId, limit]
  );
  return result.rows.map((r) => ({ ...r, rank: 1.0 }));
}

/**
 * Build a disambiguation reply when a name resolves to multiple persons.
 * Always asks for one specific clarifier (carrier or rep-vs-adjuster).
 */
export function buildDisambiguationReply(
  candidates: PersonRow[],
  queriedName: string
): string {
  const teammates = candidates.filter((c) => c.person_type === 'teammate');
  const adjusters = candidates.filter((c) => c.person_type !== 'teammate');

  // Case 1: teammate(s) AND adjuster(s) share the name
  if (teammates.length >= 1 && adjusters.length >= 1) {
    const teamSummary = teammates.map((t) => t.canonical_name).join(' / ');
    const adjPart =
      adjusters.length === 1
        ? `${adjusters[0].canonical_name}${adjusters[0].carrier ? ` at ${adjusters[0].carrier}` : ''}`
        : adjusters.map((a) => `${a.canonical_name}${a.carrier ? ` (${a.carrier})` : ''}`).join(' or ');
    return `Two ${queriedName}s in play — our rep ${teamSummary}, or ${adjPart}? Quick clarifier and I'll pull the right intel 🤝`;
  }

  // Case 2: multiple adjusters, same first name, different carriers
  if (adjusters.length >= 2 && teammates.length === 0) {
    const summary = adjusters
      .slice(0, 4)
      .map((a) => `${a.canonical_name}${a.carrier ? ` (${a.carrier})` : ''}`)
      .join(', ');
    return `Got a few ${queriedName}s in the book — ${summary}. Which one or what carrier?`;
  }

  // Case 3: multiple teammates (rare — e.g., two reps with same first name)
  if (teammates.length >= 2 && adjusters.length === 0) {
    return `Couple of ${queriedName}s on the team (${teammates.map((t) => t.canonical_name).join(', ')}) — and either way, I don't grade teammates. Drop an adjuster or carrier name and I'll cook 🔥`;
  }

  // Fallback (shouldn't normally happen)
  return `Multiple matches for ${queriedName}. Carrier or last name to narrow it?`;
}

/**
 * "I don't have intel on this person" — use exactly when a name was clearly
 * asked about but didn't match anything. Prevents Susan from inventing.
 */
export function buildUnknownPersonReply(name: string): string {
  return `No intel on ${name} yet. Drop the carrier and a quick note in the chat — I'll add it for next time.`;
}

/**
 * Log a disambiguation event for later audit. Soft-fails on error.
 */
export async function logDisambiguationEvent(
  pool: pg.Pool,
  args: {
    groupId?: string | null;
    threadId?: string | null;
    askerName?: string | null;
    askerUserId?: string | null;
    queriedName: string;
    candidates: PersonRow[];
  }
): Promise<void> {
  try {
    const summary = args.candidates.map((c) => ({
      id: c.id,
      type: c.person_type,
      carrier: c.carrier,
      canonical_name: c.canonical_name,
    }));
    await pool.query(
      `INSERT INTO susan_disambiguation_events
         (group_id, thread_id, asker_name, asker_user_id, queried_name, candidate_person_ids, candidate_summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        args.groupId || null,
        args.threadId || null,
        args.askerName || null,
        args.askerUserId || null,
        args.queriedName,
        args.candidates.map((c) => c.id),
        JSON.stringify(summary),
      ]
    );
  } catch (e) {
    console.warn('[SusanPersons] disambig log err:', e);
  }
}
