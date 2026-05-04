const PERSON_LOOKUP_PATTERNS = [
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
export function extractPersonCandidates(text, entityNames = []) {
    const out = new Set();
    for (const n of entityNames) {
        const trimmed = (n || '').trim();
        if (!trimmed)
            continue;
        const lower = trimmed.toLowerCase().replace(/\s+/g, ' ');
        if (STOPWORD_NAMES.has(lower))
            continue;
        if (lower.length < 2)
            continue;
        out.add(trimmed);
    }
    for (const re of PERSON_LOOKUP_PATTERNS) {
        const m = text.match(re);
        if (!m)
            continue;
        let name = (m[1] || '').trim();
        if (!name)
            continue;
        // Strip leading addressee tokens — "Susan Anthony?" should resolve to
        // "Anthony", not "Susan Anthony". Any leading word that's a stopword
        // (Susan, Hey, Yo, etc.) gets peeled off.
        while (true) {
            const parts = name.split(/\s+/);
            if (parts.length <= 1)
                break;
            if (!STOPWORD_NAMES.has(parts[0].toLowerCase()))
                break;
            name = parts.slice(1).join(' ');
        }
        const lower = name.toLowerCase();
        if (STOPWORD_NAMES.has(lower))
            continue;
        if (name.length < 2)
            continue;
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
async function lookupCandidate(pool, candidate, carrierHints) {
    const name = candidate.trim();
    if (!name)
        return [];
    // Match by lowered canonical_name OR alt_names entry (case-insensitive).
    // alt_names is TEXT[]; we lowercase the array client-side for the IN check.
    const result = await pool.query(`SELECT id, canonical_name, alt_names, person_type, carrier, team_user_id::text AS team_user_id, notes
     FROM susan_persons
     WHERE canonical_lower = lower($1)
        OR EXISTS (
          SELECT 1 FROM unnest(alt_names) AS alt
          WHERE lower(alt) = lower($1)
        )
     ORDER BY person_type, canonical_name`, [name]);
    let rows = result.rows;
    // Carrier hint is a strong "asking about an external person" signal.
    // When the rep explicitly names a carrier ("Nick at Hancock", "Ben at
    // State Farm"), drop teammates entirely and keep only matching adjuster(s).
    // This collapses the disambiguation when the rep already disambiguated.
    if (carrierHints.length > 0) {
        const lowerHints = carrierHints.map((c) => c.toLowerCase());
        const adjusters = rows.filter((r) => r.person_type === 'adjuster' || r.person_type === 'company');
        const matching = adjusters.filter((r) => {
            if (!r.carrier)
                return false;
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
export async function resolvePerson(pool, input) {
    const candidates = extractPersonCandidates(input.text, input.entityAdjusterNames || []);
    if (candidates.length === 0)
        return { kind: 'none' };
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
            if (p.person_type === 'teammate')
                return { kind: 'teammate_only', person: p, queriedName: candidate };
            if (p.person_type === 'company')
                return { kind: 'company_only', person: p, queriedName: candidate };
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
export async function fetchKbRowsForPerson(pool, personId, limit = 5) {
    const result = await pool.query(`SELECT id, name, category, content, state
     FROM knowledge_documents
     WHERE person_id = $1
     ORDER BY created_at DESC
     LIMIT $2`, [personId, limit]);
    return result.rows.map((r) => ({ ...r, rank: 1.0 }));
}
/**
 * Build a disambiguation reply when a name resolves to multiple persons.
 * Always asks for one specific clarifier (carrier or rep-vs-adjuster).
 */
export function buildDisambiguationReply(candidates, queriedName) {
    const teammates = candidates.filter((c) => c.person_type === 'teammate');
    const adjusters = candidates.filter((c) => c.person_type !== 'teammate');
    // Case 1: teammate(s) AND adjuster(s) share the name
    if (teammates.length >= 1 && adjusters.length >= 1) {
        const teamSummary = teammates.map((t) => t.canonical_name).join(' / ');
        const adjPart = adjusters.length === 1
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
export function buildUnknownPersonReply(name) {
    return `No intel on ${name} yet. Drop the carrier and a quick note in the chat — I'll add it for next time.`;
}
/**
 * Log a disambiguation event for later audit. Soft-fails on error.
 */
export async function logDisambiguationEvent(pool, args) {
    try {
        const summary = args.candidates.map((c) => ({
            id: c.id,
            type: c.person_type,
            carrier: c.carrier,
            canonical_name: c.canonical_name,
        }));
        await pool.query(`INSERT INTO susan_disambiguation_events
         (group_id, thread_id, asker_name, asker_user_id, queried_name, candidate_person_ids, candidate_summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
            args.groupId || null,
            args.threadId || null,
            args.askerName || null,
            args.askerUserId || null,
            args.queriedName,
            args.candidates.map((c) => c.id),
            JSON.stringify(summary),
        ]);
    }
    catch (e) {
        console.warn('[SusanPersons] disambig log err:', e);
    }
}
