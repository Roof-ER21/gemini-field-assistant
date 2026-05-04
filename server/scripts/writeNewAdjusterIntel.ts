/**
 * One-shot writer: adds team-sourced adjuster intel to knowledge_documents.
 *
 * Sources: GroupMe Sales Team chat last 2 weeks + master_adjuster_audit.xlsx
 * (New Proposals + Master Enriched gaps).
 *
 * After running, re-run ingestSusanPersons.ts to populate susan_persons rows
 * and link knowledge_documents.person_id.
 *
 * Idempotent — uses (name, category) uniqueness check before insert.
 */
import pg from 'pg';

interface AdjusterEntry {
  name: string;            // matches Susan's existing naming: "Adjuster Intel: <Name> (<Carrier>)"
  carrier?: string;        // for the parens
  category: 'team-canon' | 'adjuster-intel' | 'carrier-intel';
  state?: string;
  content: string;         // KB doc body
}

// ─── HIGH-confidence adjuster intel (team-sourced from GroupMe + audit) ────────
const ENTRIES: AdjusterEntry[] = [
  // ── From last-2-weeks GroupMe (Sales Team) ──
  {
    name: 'Adjuster Intel: Lawrence (Hancock)',
    carrier: 'Hancock',
    category: 'team-canon',
    content: `Lawrence is well-regarded by the team — multiple positive experiences. Note: there are TWO Lawrences at Hancock per Nick Bourdin ("white Lawrence and black Lawrence"). When clarifying with the rep, ask for last name or visual ID.

VERDICT: Approves consistently when the file is clean.

TEAM EXPERIENCE:
- Chris Aycock: "I'm 3 for 3 with Lawrence. He'll get you approved 💪🏼"
- Richie: "Lawrence is a homi" / "Lawrence is a homi and Terrence is the best of them all"
- Ross Renzi: "Lawrence the G marking everything under the sun" — generous on damage marking
- Carlos Davila: "Money Lawrence bout to bless me" — sealing approvals
- Ben Salgado caveat: "Lawrence no showed twice. He said he'll do a great inspection and help push it through" — punctuality issue but cooperative when present

TACTICS: Build rapport early. Lawrence is collaborative — let him do his own marking; he'll typically approve clean files without pushback. If he's late, give him room and stay polite — he tends to make up for it on the report.

Source: Sales Team GroupMe, late April 2026 (Chris Aycock, Richie, Ross Renzi, Carlos Davila, Ben Salgado)`,
  },
  {
    name: 'Adjuster Intel: Tyler (SeekNow)',
    carrier: 'SeekNow',
    category: 'team-canon',
    content: `Tyler is a positive presence at SeekNow per team feedback.

VERDICT: Cooperative, gets approvals through.

TEAM EXPERIENCE:
- Christian Bratton (4/23/26): "Tyler from SeekNow is the homie! Got Jacob Nixon on this one also he was at the inspection, should be getting approved 💪🏼"

TACTICS: Standard SeekNow protocol — clean photos, mark the roof, walk damage. Tyler is friendly and not adversarial. Build rapport.

Source: Sales Team GroupMe (Christian Bratton), 4/23/26`,
  },
  {
    name: 'Adjuster Intel: Timothy Ketts (SeekNow)',
    carrier: 'SeekNow',
    category: 'team-canon',
    content: `Timothy Ketts at SeekNow is approachable. Currently transitioning to IA (independent adjuster) work.

VERDICT: Cool, talkative — not adversarial.

TEAM EXPERIENCE:
- Christian Bratton (4/29/26): "Letting the AM happen with Timothy Ketts from SeekNow and he was actually cool. We stayed and talked for like 20 mins about how he's about to switch to being an iA 💪🏼"

TACTICS: Build conversational rapport — he's open to it. Mention his upcoming IA transition if it comes up; he's invested in his trajectory.

Source: Sales Team GroupMe (Christian Bratton), 4/29/26`,
  },
  {
    name: 'Adjuster Intel: Michael Morgan (Allstate)',
    carrier: 'Allstate',
    category: 'team-canon',
    content: `Michael Morgan is an Allstate adjuster (AS / AdjustSource), travels from Dallas. Strong buyer.

VERDICT: Buyer ✅ — uses your photo report and gets up on the roof.

TEAM EXPERIENCE:
- Daniel Alonso (4/26/26): "Just finished this 8am adjuster meeting. Michael Morgan from AS is up from Dallas and he's a buyer. Said he's gonna use my photo report to get roof bought and jumped up on the roof with me even though..."

TACTICS: Bring a clean photo report — he'll use it as the basis for the approval. Be ready to walk the roof with him; he's hands-on and engaged.

Source: Sales Team GroupMe (Daniel Alonso), 4/26/26`,
  },
  {
    name: 'Adjuster Intel: Duana Gillard (Allstate)',
    carrier: 'Allstate',
    category: 'team-canon',
    content: `Duana Gillard at Allstate gives verbal approvals on-site.

VERDICT: Approver — verbal commitment with desk-adjuster final.

TEAM EXPERIENCE:
- Steve McKim (4/28/26): "Verbal from Allstate Duana gillard has to send up for approval but gave verbal. 4 side aluminum and full roof."

TACTICS: She'll commit verbally if the damage is clear; her approval still needs desk-adjuster sign-off, so don't be surprised if it takes a beat to land in writing. Document her verbal commitment after the meeting.

Source: Sales Team GroupMe (Steve McKim), 4/28/26`,
  },
  {
    name: 'Adjuster Intel: Derrilyn (Cincinnati)',
    carrier: 'Cincinnati Insurance',
    category: 'team-canon',
    content: `Derrilyn at Cincinnati Insurance approves clean files.

VERDICT: Approver.

TEAM EXPERIENCE:
- Ben Salgado (5/1/26): "Should be coming back approved by Derrilyn from Cincinnati Insurance"

TACTICS: Cincinnati Insurance overall is a less-frequent carrier in the DMV — get the photos tight and lead with the documentation. Derrilyn appears straightforward when the file is solid.

Source: Sales Team GroupMe (Ben Salgado), 5/1/26`,
  },
  {
    name: 'Adjuster Intel: Jesse Calvillo (Erie)',
    carrier: 'Erie',
    category: 'team-canon',
    content: `Jesse Calvillo at Erie is tough — disputes hail damage on multiple elevations and references HAAG to justify denials.

VERDICT: Tough — pattern of denying multi-elevation hail.

TEAM EXPERIENCE:
- Christian Bratton (4/27/26): "Jesse Calvillo with Erie is goofy as hell. 'Hail isn't going to damage 4 elevations' / 'Yeah I marked 3 and a detached gazebo. According to HAAG it's normal for 3 elevations to have damages.'"

TACTICS:
- Pre-mark all elevations with rock-solid evidence — chalk, photos, dimensions
- Be ready to push back on his HAAG citation. The HAAG damage assessment guide does NOT preclude multi-elevation damage — that's a misframing
- Detached structures (gazebo, garage, shed) help you — document them as collateral evidence of storm severity
- If denied, request reinspection with a different IA

Source: Sales Team GroupMe (Christian Bratton), 4/27/26`,
  },
  {
    name: 'Adjuster Intel: Shameena (Erie)',
    carrier: 'Erie',
    category: 'team-canon',
    content: `Shameena at Erie is tough — known to pull approvals.

VERDICT: 💀 Tough — order reinspection if you get her.

TEAM EXPERIENCE:
- Kevin Fitzpatrick (4/24/26): "Shameena from Erie is the devil. Had to order a re inspection"

TACTICS: Document everything ironclad before her inspection. If she pulls or partials clean damage, request reinspection immediately — don't wait. Get the homeowner on board with the reinspection process upfront so you're not chasing them after.

Source: Sales Team GroupMe (Kevin Fitzpatrick), 4/24/26`,
  },

  // ── From master_adjuster_audit.xlsx New Proposals (with intel) ──
  {
    name: 'Adjuster Intel: Jose Gonzalez (USAA)',
    carrier: 'USAA',
    category: 'team-canon',
    content: `Jose Gonzalez at USAA is well-regarded — easy to work with, approachable.

VERDICT: ✅ Approver — solid bet for USAA files.

TEAM EXPERIENCE:
- Multiple reps confirm: "a bro", "a homie"
- Chris Aycock recommends: name-drop Luis Esteves and Carlos Davila for credibility, suggest golf conversations
- Christian Bratton has mutual connections with him

TACTICS: Lead with rapport — drop the team-credibility names, talk golf if it fits. Once you're in his good graces, the approval flows naturally on clean USAA files.

Source: master_adjuster_audit.xlsx New Proposals (synthesized from GroupMe consensus)`,
  },

  // ── From Master Enriched (KB rows that didn't ingest cleanly — fix here) ──
  {
    name: 'Adjuster Intel: Vicki Henry (Homesite Afics)',
    carrier: 'Homesite Afics',
    category: 'adjuster-intel',
    content: `Vicki Henry is a Homesite (Afics) adjuster — easy to work with.

VERDICT: ✅ Buys most of the time when the roof is well-marked and damage is real.

TACTICS:
- Will use a ladder assist
- Get her the Hover ESX file before the meeting — makes her estimate writing much easier
- Mark the roof clearly before she arrives
- Damage needs to make sense narratively (storm date + collateral) — she's fair when the story is coherent

Source: master_adjuster_audit.xlsx Master Enriched`,
  },
  {
    name: 'Adjuster Intel: Brandon Black Chevy (SeekNow)',
    carrier: 'SeekNow',
    category: 'adjuster-intel',
    content: `Brandon (a.k.a. "Black Chevy" — drives a black Chevy truck) is a SeekNow adjuster. Distinguishing traits help reps identify him on-site.

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
    name: 'Adjuster Intel: Chris O. (Rebuild)',
    carrier: 'Rebuild',
    category: 'adjuster-intel',
    content: `Chris O. at Rebuild is cooperative — looks for damage when collateral is clear.

VERDICT: Fair — agreeable on hail when collateral damage supports the story.

TACTICS:
- Bring strong collateral evidence (gutters, screens, detached structures, soft metals) — gives him the structural argument he needs to find roof hail
- He'll do his own test squares and chalk hail in all of them when convinced
- Was looking out — give him a respectful walkthrough and the data he needs

Source: master_adjuster_audit.xlsx Master Enriched`,
  },
  {
    name: 'Adjuster Intel: Malik Marouane (SeekNow)',
    carrier: 'SeekNow',
    category: 'adjuster-intel',
    content: `Malik Marouane at SeekNow is approachable — rapport-driven.

VERDICT: ✅ Easy to work with when conversation flows.

TEAM EXPERIENCE: Worked with on a USAA claim. Adjuster team was already on-site shooting the shit when Malik arrived — that warmed him up. Easy conversation about fishing and his kids set the tone for the whole meeting.

TACTICS:
- Build rapport early with personal conversation (fishing, family — he opens up)
- Don't lead too hard with confrontational damage assertions; let the meeting breathe
- Once he's comfortable, the report tends to be fair

Source: master_adjuster_audit.xlsx Master Enriched (also referenced in Susan's existing "Malik" row)`,
  },
  {
    name: 'Adjuster Intel: Patrick Reed (SeekNow)',
    carrier: 'SeekNow',
    category: 'adjuster-intel',
    content: `Patrick Reed at SeekNow is straightforward — process-oriented.

VERDICT: Easy to work with when his protocol is followed.

TACTICS:
- Patrick makes his own test squares — DO NOT mark inside them without permission
- DO NOT mark anywhere on the roof without him present
- Once he's set up, you can mark inside his squares (he'll allow that)
- Multiple positive experiences from team

Source: master_adjuster_audit.xlsx Master Enriched (also referenced in Susan's existing "Patrick" row)`,
  },
  {
    name: 'Adjuster Intel: Haylee Maklary (Erie)',
    carrier: 'Erie',
    category: 'adjuster-intel',
    state: 'VA',
    content: `Haylee Maklary at Erie is highly preferred — talkative, generous on hail when the file looks good.

VERDICT: ⭐ Want to work with her if you have a choice.

CONTACT: 310-710-9062

TACTICS:
- Be flexible on calendar — let her pick the time so SHE shows up, not someone else
- Be talkative back — she runs hot on conversation
- "Will mark up hail for you as long as it looks pretty" — make sure damage is photogenic and well-presented before her visit
- Clean roof presentation = generous markup

Source: master_adjuster_audit.xlsx Master Enriched`,
  },

  // ── Carrier-intel (non-adjuster) ──
  {
    name: 'Carrier Intel: Farmers / Foremost — storm date policy',
    carrier: 'Farmers',
    category: 'carrier-intel',
    content: `FARMERS / FOREMOST policies honor storm dates as far back as the homeowner has been an existing policy holder.

KEY TAKEAWAY: The 1/2/3-year limitation that other carriers enforce DOES NOT apply to Farmers/Foremost. If the customer has been with Farmers for 5 years, you can claim a 5-year-old storm.

VERIFICATION: Confirmed by a Farmers manager directly per Richie (5/1/26): "FYI Team, if you get a Farmers/Foremost claim their policies are written to honor a storm date as far back as they were existing policy holders. So the one two three year limitation doesn't matter."

PLAY:
- Always check policy inception date for Farmers/Foremost claims
- Pull historical storm dates back to inception, not just last 2-3 years
- This unlocks files that would be timed-out under other carriers

Source: Sales Team GroupMe (Richie, citing Farmers manager), 5/1/26`,
  },
];

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    console.error('No DATABASE_URL set.');
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: url });
  let inserted = 0;
  let already = 0;
  for (const e of ENTRIES) {
    const exists = await pool.query<{ id: number }>(
      `SELECT id FROM knowledge_documents WHERE name = $1 LIMIT 1`,
      [e.name]
    );
    if (exists.rowCount && exists.rowCount > 0) {
      console.log(`  - already exists: "${e.name}" (id=${exists.rows[0].id})`);
      already++;
      continue;
    }
    const ins = await pool.query<{ id: number }>(
      `INSERT INTO knowledge_documents (name, category, state, content)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [e.name, e.category, e.state || null, e.content]
    );
    console.log(`  + inserted "${e.name}" (id=${ins.rows[0].id})`);
    inserted++;
  }
  console.log(`\n— inserted=${inserted}, already=${already}`);
  await pool.end();
}
main().catch((err) => { console.error(err); process.exit(1); });
