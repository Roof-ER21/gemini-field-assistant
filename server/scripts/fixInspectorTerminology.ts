/**
 * One-shot: re-write KB content for the 8 newly-added inspection-company /
 * carrier rows so Susan refers to them with the right terminology.
 *
 * SeekNow / Rebuild / Hancock-Claims / Patriot / Allcat / Alacrity / Trident
 * / Global Risk / Afics personnel are INSPECTORS, not adjusters.
 */
import pg from 'pg';

const updates: Array<{ id: number; content: string }> = [
  {
    id: 577,  // Timothy Ketts (SeekNow)
    content: `Timothy Ketts at SeekNow is approachable. Currently transitioning from SeekNow inspector → IA (independent adjuster). SeekNow is a third-party inspection company; Timothy is a SeekNow inspector for now.

VERDICT: Cool, talkative — not adversarial.

TEAM EXPERIENCE:
- Christian Bratton (4/29/26): "Letting the AM happen with Timothy Ketts from SeekNow and he was actually cool. We stayed and talked for like 20 mins about how he's about to switch to being an iA"

TACTICS: Build conversational rapport — he's open to it. Mention his upcoming IA transition if it comes up. Refer to him as "Timothy at SeekNow" / "SeekNow's Timothy".

Source: Sales Team GroupMe (Christian Bratton), 4/29/26`,
  },
  {
    id: 584,  // Brandon Black Chevy (SeekNow)
    content: `Brandon (a.k.a. "Black Chevy" — drives a black Chevy truck) is a SeekNow inspector. SeekNow is a third-party inspection company / ladder assist, not a carrier — refer to Brandon as "Brandon at SeekNow" / "SeekNow's Brandon", not "SeekNow adjuster".

PHYSICAL ID:
- Black Chevy truck (his nickname comes from this)
- Brown hair to his shoulders
- Brown mustache
- Wears hat backwards

VERDICT: Cool guy — takes his time, fair on his marks.

TACTICS: He'll do his own chalking even if you've already marked everything — let him; he's collaborative not adversarial. Bring detailed photos but expect him to verify independently. Patient approach wins with him.

Source: master_adjuster_audit.xlsx Master Enriched`,
  },
  {
    id: 585,  // Malik Marouane (SeekNow)
    content: `Malik Marouane is a SeekNow inspector. SeekNow is a third-party inspection company / ladder assist — refer to him as "Malik at SeekNow" / "SeekNow's Malik", NOT "SeekNow adjuster Malik".

VERDICT: Easy to work with when conversation flows.

TEAM EXPERIENCE: Worked with on a USAA claim. Adjuster team was already on-site shooting the shit when Malik arrived — that warmed him up. Easy conversation about fishing and his kids set the tone for the whole meeting.

TACTICS:
- Build rapport early with personal conversation (fishing, family — he opens up)
- Don't lead too hard with confrontational damage assertions; let the meeting breathe
- Once he's comfortable, the report tends to be fair

Source: master_adjuster_audit.xlsx Master Enriched`,
  },
  {
    id: 586,  // Patrick Reed (SeekNow)
    content: `Patrick Reed is a SeekNow inspector — straightforward, process-oriented. SeekNow is a third-party inspection company / ladder assist — refer to him as "Patrick at SeekNow" / "SeekNow's Patrick", NOT "SeekNow adjuster".

VERDICT: Easy to work with when his protocol is followed.

TACTICS:
- Patrick makes his own test squares — DO NOT mark inside them without permission
- DO NOT mark anywhere on the roof without him present
- Once he's set up, you can mark inside his squares (he'll allow that)
- Multiple positive experiences from team

Source: master_adjuster_audit.xlsx Master Enriched`,
  },
  {
    id: 583,  // Vicki Henry (Homesite/Afics) — Homesite IS a carrier, Afics is the ladder-assist
    content: `Vicki Henry is a Homesite CARRIER adjuster (Homesite is a real insurer). She dispatches a ladder assist via Afics for the actual roof inspection — but Vicki is the carrier-side decision-maker on the claim. Refer to her as "Vicki at Homesite" — she IS the adjuster.

VERDICT: Buys most of the time when the roof is well-marked and damage is real.

TACTICS:
- Will dispatch an Afics ladder assist — make sure your roof is photo-ready
- Get her the Hover ESX file before the meeting — makes her estimate writing much easier
- Mark the roof clearly before the ladder assist arrives
- Damage needs to make sense narratively (storm date + collateral) — she's fair when the story is coherent

Source: master_adjuster_audit.xlsx Master Enriched`,
  },
  {
    id: 319,  // Chris O. (Rebuild) — Rebuild is an inspection company
    content: `Chris O. is a Rebuild inspector. Rebuild is a third-party inspection company / ladder assist — refer to him as "Chris O. at Rebuild" / "Rebuild's Chris O.", NOT "Rebuild adjuster".

VERDICT: Fair — agreeable on hail when collateral damage supports the story.

TACTICS:
- Bring strong collateral evidence (gutters, screens, detached structures, soft metals) — gives him the structural argument he needs to find roof hail
- He'll do his own test squares and chalk hail in all of them when convinced
- Give him a respectful walkthrough and the data he needs

Source: master_adjuster_audit.xlsx Master Enriched`,
  },
  {
    id: 575,  // Lawrence (Hancock) — Hancock here = Hancock Claims/Inspection
    content: `Lawrence is well-regarded by the team. Note: Hancock here = Hancock Claims / Hancock Inspection — a third-party inspection company / ladder assist, NOT a carrier. Refer to him as "Lawrence at Hancock" / "Hancock's Lawrence", NOT "Hancock adjuster".

Per Nick Bourdin, there are TWO Lawrences at Hancock: "white Lawrence and black Lawrence". When clarifying with the rep, ask for last name or visual ID.

VERDICT: Approves consistently when the file is clean.

TEAM EXPERIENCE:
- Chris Aycock: "I'm 3 for 3 with Lawrence. He'll get you approved"
- Richie: "Lawrence is a homi" / "Lawrence is a homi and Terrence is the best of them all"
- Ross Renzi: "Lawrence the G marking everything under the sun" — generous on damage marking
- Carlos Davila: "Money Lawrence bout to bless me" — sealing approvals
- Ben Salgado caveat: "Lawrence no showed twice. He said he'll do a great inspection and help push it through" — punctuality issue but cooperative when present

TACTICS: Build rapport early. Lawrence is collaborative — let him do his own marking; he'll typically approve clean files without pushback. If he's late, give him room and stay polite — he tends to make up for it on the report.

Source: Sales Team GroupMe, late April 2026 (Chris Aycock, Richie, Ross Renzi, Carlos Davila, Ben Salgado)`,
  },
];

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) { console.error('No DATABASE_URL set.'); process.exit(1); }
  const pool = new pg.Pool({ connectionString: url });
  for (const u of updates) {
    const r = await pool.query(`UPDATE knowledge_documents SET content = $1 WHERE id = $2`, [u.content, u.id]);
    console.log(`  updated id=${u.id} (${r.rowCount} row)`);
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
