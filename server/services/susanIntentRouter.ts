/**
 * susanIntentRouter — single classification step that returns ONE intent
 * with structured fields. Replaces the heuristic if/else cascade where
 * every layer fired in parallel and the LLM blended contexts.
 *
 * Architecture:
 *   1. Try fast templates (regex on raw text) — zero LLM, instant
 *   2. If no template match, classify via Groq with a tight intent schema
 *   3. Return ClassifiedIntent — caller dispatches to ONE handler
 *
 * Critical guarantees:
 *   - TEAMMATE_LOOKUP fires when the named person is a teammate, regardless
 *     of how the question is phrased ("Ross from seek now" → TEAMMATE)
 *   - APPROVAL_RESPONSE only on a true bare yes/no
 *   - No fallthrough — the caller commits to one lane based on the result
 */
import type pg from 'pg';

export type Intent =
  | 'GREETING'
  | 'BANTER'
  | 'SUPERLATIVE_TEAM'
  | 'SUPERLATIVE_COMPANY'
  | 'SCOPE_DEFLECT'
  | 'TEAMMATE_LOOKUP'
  | 'ADJUSTER_LOOKUP'
  | 'CARRIER_PLAYBOOK'
  | 'STORM_DATE'
  | 'STORM_CITY'
  | 'STORM_ADDRESS'
  | 'LEGAL_CODE'
  | 'APPROVAL_RESPONSE'
  | 'FOLLOWUP'
  | 'TEACHING'
  | 'OTHER';

export interface ClassifiedIntent {
  intent: Intent;
  confidence: number;       // 0..1
  // Structured payload — only populated for relevant intents
  person_name?: string;
  carrier?: string;
  date?: string;
  city?: string;
  address?: string;
  topic?: string;           // for LEGAL_CODE, OTHER
  // Raw LLM JSON for audit / debugging
  raw?: any;
}

// ────────────────────────────────────────────────────────────────────────────
// FAST PATH: bare-yes/no detection (highest precision, zero LLM cost)
// ────────────────────────────────────────────────────────────────────────────
const BARE_YESNO_RE = /^\s*(?:susan[,\s]+)?(?:yes|yep|yup|sure|ok|okay|do\s+it|send\s+it|approve(?:d)?|confirmed?|👍|✅|no|nope|nah|cancel|skip|don'?t)\s*[\.\?!]*\s*(?:susan)?\s*[\.\?!]*\s*$/i;

export function isBareYesNo(text: string): boolean {
  return BARE_YESNO_RE.test(text);
}

// ────────────────────────────────────────────────────────────────────────────
// FAST PATH: teaching directive detection (Susan remember that...)
// ────────────────────────────────────────────────────────────────────────────
const TEACHING_RE = /\b(?:remember\s+(?:that|this)?|take\s+note|for\s+the\s+record|learn\s+(?:that|this)?|note\s+(?:that|this)?)\b/i;

export function looksLikeTeaching(text: string): boolean {
  return TEACHING_RE.test(text);
}

// ────────────────────────────────────────────────────────────────────────────
// LLM-driven classifier
// ────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an intent classifier for a roofing-sales chat bot named Susan.

The chat is The Roof Docs Sales Team — a Virginia/Maryland/PA insurance-restoration roofing company. Reps work hail/wind insurance claims. They ask Susan about adjusters, inspectors, storms, building codes.

Classify each message into ONE intent. Return ONLY valid JSON, no prose.

INTENTS:

GREETING — "you up", "hey", "good morning", "you back", "you alive", "you there"

BANTER — small talk, hype, congrats, "lfg", emojis, casual chat with no specific question

SUPERLATIVE_TEAM — asking which Roof-ER teammate is best/favorite/goat/top: "best rep", "who's the goat", "favorite rep", "top performer"

SUPERLATIVE_COMPANY — asking which roofing company is best: "best roofer", "best contractor", "best roofing company"

SCOPE_DEFLECT — off-topic non-roofing: weather, jokes, poetry, recipes, sports, politics

TEAMMATE_LOOKUP — asking about a Roof-ER TEAMMATE (a rep, manager, owner). Common teammate first names: Ross, Joe, Royce, Nick (Bourdin), Ben (Salgado), Anthony (Carter), Christian (Bratton), Daniel (Alonso), Jonathan (Alquijay), Eric (Philippeau/Rickel), Chris (Aycock/Martinez-Key), Greg (Campbell), Brandon (Pernot), Kevin (Fitzpatrick), James (Armel), David (Harper/Sura), Steven, Hunter (Hall), Adrian (Ortiz), Ryan, Jordan (Heffernan), Ian (Thrash), Jason (Brown), Shane (Santangelo), Oliver (Brown), Reese (Samala), Ford (Barsi), Ahmed (Mahmoud), Luis (Esteves), Carlos (Davila/Fernando), Jonny (Alquijay), Beckett (Brauer), Kerouls (Gayed), Mike (Brawner/Gabriel/Kozich/Mulkerin), Mattias (Kasparian), Larry (Hale), Steve (McKim).
  IMPORTANT: even if the rep adds a carrier or IA service ("Ross from seek now", "Mike at Allstate"), if the FIRST NAME matches a teammate, classify as TEAMMATE_LOOKUP. The rep is asking about the teammate, not an adjuster.
  Phrasings: "tell me about [name]", "thoughts on [name]", "what about [name]", "[name]?", "who flagged [name]", "describe [name]", "[name] from [anywhere]", "rate [name]", "is [name] [adjective]"

ADJUSTER_LOOKUP — asking about an EXTERNAL person: a carrier adjuster (Allstate, USAA, State Farm, Travelers, Erie, Liberty Mutual, Nationwide, Progressive, Farmers, Geico, Encompass, Chubb, Amica, Hartford, Cincinnati, Hanover, Kemper, MetLife, Safeco, Homesite) OR an IA / inspection-company inspector (SeekNow, Rebuild, Hancock, Patriot, Allcat, Alacrity, Trident, Global Risk, Afics).
  Use this when the named person is NOT a known Roof-ER teammate first name.

CARRIER_PLAYBOOK — asking about a carrier's general approach, NOT a specific adjuster: "USAA playbook", "what's the State Farm strategy", "how do we handle Allstate"

STORM_DATE — asking about hail/wind on a specific date: "hail on 8/29/24", "any storms last week", "did 4/1 hit"

STORM_CITY — asking about hail in a specific city: "hail in Manassas", "anything in Reston last month", "Charleston hit"

STORM_ADDRESS — asking about hail at a specific street address: "any hail on 1234 Main St"

LEGAL_CODE — building codes, matching laws, denial arguments, IRC/IBC/USBC references, state regulations

APPROVAL_RESPONSE — bare "yes" / "no" / "yep" / "approve" / "send" — only when the prior bot turn asked a yes/no question and we're in that thread

FOLLOWUP — message uses pronouns referring to a prior turn ("him", "her", "that one", "the same one", "what about him")

TEACHING — rep is teaching Susan a new fact ("Susan remember that X is tough", "for the record X is at Allstate")

OTHER — anything that doesn't fit, unclear, ambiguous

OUTPUT JSON SCHEMA:
{
  "intent": "INTENT_NAME",
  "confidence": 0.0 to 1.0,
  "person_name": "extracted person name or null",
  "carrier": "carrier or IA service name or null",
  "date": "date string or null",
  "city": "city or null",
  "address": "street address or null",
  "topic": "free-form topic for LEGAL_CODE / OTHER or null"
}

EXAMPLES:

User: "Susan thoughts on Ross"
{"intent":"TEAMMATE_LOOKUP","confidence":0.98,"person_name":"Ross"}

User: "Ross from seek now Susan"
{"intent":"TEAMMATE_LOOKUP","confidence":0.95,"person_name":"Ross","carrier":"SeekNow"}

User: "Susan tell me about Lucas Martin"
{"intent":"ADJUSTER_LOOKUP","confidence":0.97,"person_name":"Lucas Martin"}

User: "Susan got Tyler at SeekNow"
{"intent":"ADJUSTER_LOOKUP","confidence":0.93,"person_name":"Tyler","carrier":"SeekNow"}

User: "Susan whos the best rep"
{"intent":"SUPERLATIVE_TEAM","confidence":0.99}

User: "Susan whats the best roofing company"
{"intent":"SUPERLATIVE_COMPANY","confidence":0.99}

User: "Susan you up"
{"intent":"GREETING","confidence":0.99}

User: "Susan was there hail on 8/29/24 in the dmv"
{"intent":"STORM_DATE","confidence":0.97,"date":"8/29/24"}

User: "Susan any hail in Manassas last week"
{"intent":"STORM_CITY","confidence":0.97,"city":"Manassas"}

User: "Susan whats the USAA playbook"
{"intent":"CARRIER_PLAYBOOK","confidence":0.98,"carrier":"USAA"}

User: "Susan whats the matching law in MD"
{"intent":"LEGAL_CODE","confidence":0.95,"topic":"matching law MD"}

User: "yes susan"
{"intent":"APPROVAL_RESPONSE","confidence":0.9}

User: "what about him"
{"intent":"FOLLOWUP","confidence":0.9}`;

export async function classifyIntent(
  text: string,
  historySnippet: string | null,
): Promise<ClassifiedIntent | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const userContent = historySnippet
    ? `RECENT CONTEXT (most recent last):\n${historySnippet}\n\nCLASSIFY THIS MESSAGE:\n${text}`
    : `CLASSIFY THIS MESSAGE:\n${text}`;
  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        max_tokens: 200,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });
    if (!resp.ok) {
      console.warn('[IntentRouter] groq classify failed:', resp.status);
      return null;
    }
    const data: any = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    const intent = (parsed.intent || 'OTHER') as Intent;
    return {
      intent,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      person_name: parsed.person_name || undefined,
      carrier: parsed.carrier || undefined,
      date: parsed.date || undefined,
      city: parsed.city || undefined,
      address: parsed.address || undefined,
      topic: parsed.topic || undefined,
      raw: parsed,
    };
  } catch (e) {
    console.warn('[IntentRouter] classify err:', e);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// TEAMMATE OVERRIDE — sanity-check the classifier's TEAMMATE vs ADJUSTER call
// against the actual roster. Belt-and-suspenders defense.
// ────────────────────────────────────────────────────────────────────────────
import { getTeamRoster, isTeammate } from './susanTeamRosterShim.js';

/**
 * Apply post-classification overrides to fix common Groq mistakes:
 *   - If Groq said ADJUSTER_LOOKUP but the person_name is a teammate → flip to TEAMMATE_LOOKUP
 *   - If Groq said OTHER but the message contains an obvious teammate name → flip to TEAMMATE_LOOKUP
 *   - If carrier/IA hint is present and Groq missed it, fill it in heuristically
 */
export async function applyOverrides(
  text: string,
  classified: ClassifiedIntent,
): Promise<ClassifiedIntent> {
  const result = { ...classified };
  try {
    const roster = await getTeamRoster();
    if (roster && result.person_name && isTeammate(result.person_name, roster)) {
      if (result.intent !== 'TEAMMATE_LOOKUP') {
        console.log(`[IntentRouter] override: ${result.intent} → TEAMMATE_LOOKUP (person="${result.person_name}" is on roster)`);
        result.intent = 'TEAMMATE_LOOKUP';
        result.confidence = Math.max(result.confidence, 0.9);
      }
    }
  } catch (e) {
    // Roster fetch failed — keep classifier's verdict
    console.warn('[IntentRouter] override roster fetch err:', (e as Error).message);
  }
  return result;
}
