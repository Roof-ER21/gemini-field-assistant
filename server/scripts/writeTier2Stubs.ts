/**
 * Tier 2 stubs — adjusters/IAs the team has asked about but Susan has no
 * intel on yet. Stub rows let her say "we know about [Name] but no team
 * intel yet — drop a note" instead of "no intel" cold-shoulder.
 */
import pg from 'pg';

const STUBS = [
  { name: 'Adjuster Intel: Christopher Faulski (Allstate)', carrier: 'Allstate', mentions: 7, last: '2026-03-03' },
  { name: 'Adjuster Intel: Adam Vahle', carrier: null, mentions: 5, last: '2025-07-06' },
  { name: 'Adjuster Intel: Kevin (Erie)', carrier: 'Erie', mentions: 2, last: '2025-10-22' },
  { name: 'Adjuster Intel: Damian (USAA)', carrier: 'USAA', mentions: 2, last: '2025-02-24' },
  { name: "Adjuster Intel: Liam O'Reilly", carrier: null, mentions: 2, last: '2025-02-26' },
  { name: 'Adjuster Intel: Juliet Hernandez', carrier: null, mentions: 2, last: '2024-04-23' },
  { name: 'Adjuster Intel: Al Watson', carrier: null, mentions: 2, last: '2025-11-07' },
  { name: 'Adjuster Intel: Dave Spurlock', carrier: null, mentions: 2, last: '2025-08-06' },
  { name: 'Adjuster Intel: Joel Urbina (USAA)', carrier: 'USAA', mentions: 2, last: '2025-07-24' },
  { name: 'Adjuster Intel: Priscilla Portillo', carrier: null, mentions: 2, last: null },
  // From Tier 2 / GroupMe-only asks
  { name: 'Adjuster Intel: Bryan Bergner (Travelers)', carrier: 'Travelers', mentions: 2, last: '2026-04-24', askers: 'Kevin Fitzpatrick (×2)' },
  { name: 'Adjuster Intel: Andrew Patchan (Liberty Mutual)', carrier: 'Liberty Mutual', mentions: 1, last: '2026-04-23', askers: 'Kevin Fitzpatrick' },
  { name: 'Adjuster Intel: Lynnie Mehus (Erie)', carrier: 'Erie', mentions: 2, last: '2026-04-23', askers: 'Kevin Fitzpatrick, George Iskrenov' },
  { name: 'Adjuster Intel: Shawn McCreight (State Farm)', carrier: 'State Farm', mentions: 1, last: '2026-04-23', askers: 'Kevin Fitzpatrick' },
  { name: 'Adjuster Intel: Tom Dula (State Farm)', carrier: 'State Farm', mentions: 1, last: '2026-05-02', askers: 'Chris Aycock' },
  { name: 'Adjuster Intel: Brian (Hancock)', carrier: 'Hancock', mentions: 1, last: null, askers: 'Richie' },
  { name: 'Adjuster Intel: Franklin (Hancock)', carrier: 'Hancock', mentions: 1, last: null, askers: 'Ian Thrash' },
  { name: 'Adjuster Intel: Andrew (SeekNow)', carrier: 'SeekNow', mentions: 1, last: null, askers: 'Kevin Fitzpatrick' },
  { name: 'Adjuster Intel: Terrence (Hancock)', carrier: 'Hancock', mentions: 1, last: '2026-04-30', askers: 'Richie ("the best of them all")' },
];

// Inspection companies (third-party services, not carriers) — for content phrasing
const IA_SERVICES = new Set(['Hancock', 'SeekNow', 'Rebuild', 'Patriot', 'Allcat', 'Alacrity', 'Trident', 'Global Risk', 'Afics']);

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) { console.error('No DATABASE_URL set.'); process.exit(1); }
  const pool = new pg.Pool({ connectionString: url });
  let inserted = 0, already = 0;
  for (const s of STUBS as any[]) {
    const exists = await pool.query<{ id: number }>(`SELECT id FROM knowledge_documents WHERE name = $1 LIMIT 1`, [s.name]);
    if (exists.rowCount && exists.rowCount > 0) {
      console.log(`  - already exists: "${s.name}"`);
      already++;
      continue;
    }
    const isIA = s.carrier && IA_SERVICES.has(s.carrier);
    const personLabel = isIA ? `${s.carrier} inspector` : (s.carrier ? `${s.carrier} adjuster` : 'inspector/adjuster');
    const phrasing = isIA
      ? `Refer to them as "${s.name.replace('Adjuster Intel: ', '').replace(/ \(.*\)$/, '')} at ${s.carrier}" — NOT "${s.carrier} adjuster".`
      : '';
    const intelLine = s.askers
      ? `${s.mentions}× asked in chat (${s.askers}, last ${s.last || 'n/a'}) — no team intel yet.`
      : `${s.mentions}× mentioned in chat (last ${s.last || 'n/a'}) — no team intel yet.`;
    const content = `${s.name.replace('Adjuster Intel: ', '')} is a known ${personLabel}${s.carrier ? '' : ' (carrier unknown)'} but the team hasn't shared intel about them yet. ${phrasing}

INTEL STATUS: ${intelLine}

WHAT TO TELL THE REP: "Heard the name but no team experience yet. Drop a quick note after your meeting — what they were like, key tactics, approval/denial — and I'll learn for next time. ${s.askers ? `(${s.askers.split(',')[0].trim()} also asked recently.)` : ''}"

NEXT STEP: When a rep posts an experience, leadership can promote this stub to a real intel row. Until then, Susan should acknowledge the name and request team input rather than fabricate.`;
    const ins = await pool.query<{ id: number }>(
      `INSERT INTO knowledge_documents (name, category, content) VALUES ($1, 'adjuster-intel', $2) RETURNING id`,
      [s.name, content]
    );
    console.log(`  + inserted "${s.name}" (id=${ins.rows[0].id})`);
    inserted++;
  }
  console.log(`\n— stubs inserted=${inserted}, already=${already}`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
