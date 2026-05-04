/**
 * Ingest script — populates susan_persons from users + knowledge_documents.
 *
 * Idempotent: safe to re-run. Uses ON CONFLICT DO UPDATE so re-runs refresh
 * alt_names and person_type without creating duplicates.
 *
 * Usage (against current DATABASE_URL):
 *   npx tsx server/scripts/ingestSusanPersons.ts
 *   npx tsx server/scripts/ingestSusanPersons.ts --dry   # report only, no writes
 *   npx tsx server/scripts/ingestSusanPersons.ts --review-similar   # print near-dup candidates
 */
import pg from 'pg';

const DRY = process.argv.includes('--dry');
const REVIEW_SIMILAR = process.argv.includes('--review-similar');

const TEST_NAME_PATTERNS = [
  /^test/i,
  /^demo/i,
  /test user/i,
  /test \d+/i,
  /^claude/i,
  /^app store/i,
  /reviewer$/i,
  /^complete test/i,
  /^final test/i,
  /^live test/i,
  /^careeers?$/i,
];

const TEAMMATE_HANDLE_BLOCKLIST = new Set([
  'admin', 'jay', 'kooly', 'los', '24', 'gabriel',  // ambiguous handles
]);

// Strings that indicate a "service org / company" rather than an individual.
// e.g. "Allcat claims service", "Hancock inspection company", "Barker Claim Services"
const COMPANY_TOKENS = /\b(claims?\s+service|claim\s+services|inspection\s+company|inspections?\b|service\s+co|services\b|company\b|corp\b|llc\b|group\b)/i;

// Carrier name normalization
const CARRIER_NORMALIZE: Record<string, string> = {
  usaa: 'USAA',
  allstate: 'Allstate',
  'state farm': 'State Farm',
  statefarm: 'State Farm',
  travelers: 'Travelers',
  traveler: 'Travelers',
  'liberty mutual': 'Liberty Mutual',
  liberty: 'Liberty Mutual',
  erie: 'Erie',
  nationwide: 'Nationwide',
  progressive: 'Progressive',
  farmers: 'Farmers',
  geico: 'GEICO',
  encompass: 'Encompass',
  chubb: 'Chubb',
  amica: 'Amica',
  hartford: 'Hartford',
  cincinnati: 'Cincinnati',
  hanover: 'Hanover',
  kemper: 'Kemper',
  metlife: 'MetLife',
  safeco: 'Safeco',
  homesite: 'Homesite',
  seeknow: 'SeekNow',
  rebuild: 'ReBuild',
  patriot: 'Patriot Claims',
  'patriot claims': 'Patriot Claims',
  hancock: 'Hancock',
  'hancock claims': 'Hancock',
  'global risk': 'Global Risk Solutions',
  'global risk solutions': 'Global Risk Solutions',
  alacrity: 'Alacrity',
  trident: 'Trident',
  allcat: 'Allcat',
  'american family': 'American Family',
};

function normalizeCarrier(raw: string | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim().replace(/\s+/g, ' ');
  // Strip trailing junk like " -" or " ("
  const cleaned = lower.replace(/\s*[-(].*$/, '').trim();
  if (CARRIER_NORMALIZE[cleaned]) return CARRIER_NORMALIZE[cleaned];
  // Handle multi-carrier like "USAA/Progressive/Liberty"
  if (cleaned.includes('/')) {
    const parts = cleaned.split('/').map((p) => p.trim());
    const normalized = parts
      .map((p) => CARRIER_NORMALIZE[p] || (p ? p[0].toUpperCase() + p.slice(1) : null))
      .filter(Boolean);
    return normalized.join(' / ');
  }
  // Title-case fallback
  return cleaned.split(' ').map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' ');
}

interface ParsedAdjusterRow {
  kbId: number;
  raw: string;            // original full name from KB
  cleanedName: string;    // "Christopher Barnett"
  carrier: string | null; // "Allstate"
  isCompany: boolean;     // true if row looks like a service org, not a person
}

function parseAdjusterName(rawName: string, kbId: number): ParsedAdjusterRow | null {
  const stripped = rawName.replace(/^Adjuster Intel:\s*/i, '').trim();
  // Try (Carrier) at end
  const m = stripped.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  let namePart: string;
  let carrierRaw: string | undefined;
  if (m) {
    namePart = m[1].trim();
    carrierRaw = m[2].trim();
  } else {
    namePart = stripped;
  }
  // Strip noise prefixes from name
  namePart = namePart
    .replace(/^(adjuster|desk\s+adjuster|inspector|engineer)\s+/i, '')
    .replace(/\s+(from\s+(st|usaa|state\s*farm|travelers))\s*$/i, '')
    .replace(/\s+as\s*$/i, '')
    .replace(/\s+(o|p|c)\.\s*$/i, '')
    .trim();
  // Title-case if first letter is lowercase
  if (namePart && /^[a-z]/.test(namePart)) {
    namePart = namePart
      .split(/\s+/)
      .map((tok) => (tok[0] ? tok[0].toUpperCase() + tok.slice(1) : tok))
      .join(' ');
  }
  if (!namePart) return null;

  const isCompany = COMPANY_TOKENS.test(namePart);
  const carrier = normalizeCarrier(carrierRaw);

  return {
    kbId,
    raw: rawName,
    cleanedName: namePart,
    carrier,
    isCompany,
  };
}

function isLikelyTestUser(name: string): boolean {
  if (!name) return true;
  for (const re of TEST_NAME_PATTERNS) if (re.test(name)) return true;
  // Single short token, not capitalized: handles like "jay", "miguel", "admin"
  // Note: legitimate single-name reps exist (Andre, Gabriel, Jonah, Kooly).
  // Block only the obvious test/handle cases.
  if (TEAMMATE_HANDLE_BLOCKLIST.has(name.toLowerCase().trim())) return true;
  return false;
}

function buildTeammateAltNames(name: string): string[] {
  const alts = new Set<string>();
  const tokens = name.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    alts.add(tokens[0]);                              // first name
    alts.add(tokens[tokens.length - 1]);              // last name
    // Initial + last (e.g., "K Fitzpatrick")
    alts.add(`${tokens[0][0]} ${tokens[tokens.length - 1]}`);
  }
  alts.delete(name);
  return Array.from(alts).filter((s) => s && s.length >= 2);
}

function buildAdjusterAltNames(parsed: ParsedAdjusterRow): string[] {
  const alts = new Set<string>();
  const tokens = parsed.cleanedName.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    alts.add(tokens[0]);
    alts.add(tokens[tokens.length - 1]);
  }
  // Original raw form (handles spelling variants if multi-row)
  if (parsed.raw && parsed.raw !== parsed.cleanedName) {
    const stripped = parsed.raw.replace(/^Adjuster Intel:\s*/i, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (stripped && stripped !== parsed.cleanedName) alts.add(stripped);
  }
  alts.delete(parsed.cleanedName);
  return Array.from(alts).filter((s) => s && s.length >= 2);
}

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    console.error('No DATABASE_URL set.');
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: url });

  const stats = {
    teammates_seen: 0,
    teammates_inserted: 0,
    teammates_skipped_test: 0,
    adjusters_seen: 0,
    adjusters_inserted: 0,
    adjusters_company: 0,
    adjusters_unparseable: 0,
    kb_rows_linked: 0,
  };

  const teammateNames = new Set<string>();
  const adjusterByKey = new Map<string, { name: string; carrier: string | null; kbIds: number[]; alts: Set<string>; isCompany: boolean }>();

  // ─── Teammates from users ──────────────────────────────────────────────────
  const usersResult = await pool.query<{ id: string; name: string; role: string }>(
    `SELECT id, name, role FROM users WHERE name IS NOT NULL ORDER BY name`
  );
  for (const u of usersResult.rows) {
    stats.teammates_seen++;
    const name = (u.name || '').trim();
    if (isLikelyTestUser(name)) {
      stats.teammates_skipped_test++;
      continue;
    }
    teammateNames.add(name.toLowerCase());
    if (DRY) {
      stats.teammates_inserted++;
      continue;
    }
    const altNames = buildTeammateAltNames(name);
    await pool.query(
      `INSERT INTO susan_persons (canonical_name, alt_names, person_type, team_user_id)
       VALUES ($1, $2, 'teammate', $3)
       ON CONFLICT (canonical_lower, person_type, COALESCE(lower(carrier), ''))
         DO UPDATE SET alt_names = EXCLUDED.alt_names, team_user_id = EXCLUDED.team_user_id, updated_at = now()`,
      [name, altNames, u.id]
    );
    stats.teammates_inserted++;
  }

  // ─── Adjusters from knowledge_documents ────────────────────────────────────
  const kbResult = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM knowledge_documents WHERE category='adjuster-intel' ORDER BY id`
  );
  for (const r of kbResult.rows) {
    stats.adjusters_seen++;
    const parsed = parseAdjusterName(r.name, r.id);
    if (!parsed) {
      stats.adjusters_unparseable++;
      continue;
    }
    if (parsed.isCompany) stats.adjusters_company++;
    // Group by (lower(name), carrier) so multi-row spellings of the same
    // person+carrier collapse into one person row with multiple kb refs.
    const key = `${parsed.cleanedName.toLowerCase()}::${(parsed.carrier || '').toLowerCase()}`;
    const existing = adjusterByKey.get(key);
    if (existing) {
      existing.kbIds.push(parsed.kbId);
      for (const a of buildAdjusterAltNames(parsed)) existing.alts.add(a);
    } else {
      adjusterByKey.set(key, {
        name: parsed.cleanedName,
        carrier: parsed.carrier,
        kbIds: [parsed.kbId],
        alts: new Set(buildAdjusterAltNames(parsed)),
        isCompany: parsed.isCompany,
      });
    }
  }

  for (const entry of adjusterByKey.values()) {
    if (!DRY) {
      const altArr = Array.from(entry.alts);
      const ins = await pool.query<{ id: number }>(
        `INSERT INTO susan_persons (canonical_name, alt_names, person_type, carrier)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (canonical_lower, person_type, COALESCE(lower(carrier), ''))
           DO UPDATE SET alt_names = EXCLUDED.alt_names, updated_at = now()
         RETURNING id`,
        [entry.name, altArr, entry.isCompany ? 'company' : 'adjuster', entry.carrier]
      );
      const personId = ins.rows[0]?.id;
      if (personId) {
        // Link all kb rows for this person
        await pool.query(
          `UPDATE knowledge_documents SET person_id = $1 WHERE id = ANY($2::int[])`,
          [personId, entry.kbIds]
        );
        stats.kb_rows_linked += entry.kbIds.length;
      }
    }
    stats.adjusters_inserted++;
  }

  // ─── Cross-check: teammate / adjuster name collisions ──────────────────────
  // Build teammate first-name index first so we can compare any adjuster
  // (bare-first-name OR full-name) against the same surface.
  const teammateFirstNames = new Map<string, string[]>();  // first → [full names]
  for (const fullLower of teammateNames) {
    const first = fullLower.split(/\s+/)[0];
    if (!teammateFirstNames.has(first)) teammateFirstNames.set(first, []);
    teammateFirstNames.get(first)!.push(fullLower);
  }
  const collisions: string[] = [];
  for (const entry of adjusterByKey.values()) {
    if (entry.isCompany) continue;
    const tokens = entry.name.toLowerCase().split(/\s+/);
    const first = tokens[0];
    const teammateMatches = teammateFirstNames.get(first);
    if (!teammateMatches || teammateMatches.length === 0) continue;
    const tag = tokens.length === 1 ? 'COLLISION' : 'overlap';
    const carrierStr = entry.carrier ? ` (${entry.carrier})` : '';
    const teammateList = teammateMatches.join(', ');
    collisions.push(`${tag}: adjuster "${entry.name}"${carrierStr} shares first name with teammate(s) [${teammateList}]`);
  }

  // ─── Review near-dup adjusters (Levenshtein-based) ─────────────────────────
  if (REVIEW_SIMILAR) {
    const list = Array.from(adjusterByKey.values()).filter((e) => !e.isCompany);
    const lev = (a: string, b: string): number => {
      const n = a.length, m = b.length;
      if (n === 0) return m; if (m === 0) return n;
      const dp = Array.from({ length: m + 1 }, (_, j) => j);
      for (let i = 1; i <= n; i++) {
        let prev = dp[0]; dp[0] = i;
        for (let j = 1; j <= m; j++) {
          const tmp = dp[j];
          dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j - 1], dp[j]);
          prev = tmp;
        }
      }
      return dp[m];
    };
    const candidates: string[] = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if ((a.carrier || null) !== (b.carrier || null)) continue;
        const al = a.name.toLowerCase(), bl = b.name.toLowerCase();
        if (al === bl) continue;
        const d = lev(al, bl);
        const ml = Math.max(al.length, bl.length);
        if (d <= 2 && ml >= 4 && d / ml < 0.25) {
          candidates.push(`SIMILAR: "${a.name}" ↔ "${b.name}" (carrier=${a.carrier || '—'}, dist=${d})`);
        }
      }
    }
    console.log('\n── Near-dup adjuster candidates (manual merge needed) ──');
    if (candidates.length === 0) console.log('  (none)');
    else for (const c of candidates) console.log('  ' + c);
  }

  console.log('\n── Ingest stats ──');
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k}: ${v}`);
  console.log('\n── Teammate/adjuster name collisions ──');
  if (collisions.length === 0) console.log('  (none)');
  else for (const c of collisions) console.log('  ' + c);

  if (DRY) console.log('\n(dry run — no writes)');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
