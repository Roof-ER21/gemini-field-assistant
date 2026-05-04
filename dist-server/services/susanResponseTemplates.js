/**
 * Hardcoded response templates for high-volume / high-risk message patterns.
 * Zero LLM, zero hallucination, near-zero cost. Hits BEFORE the intent
 * classifier and any retrieval.
 *
 * Use these for:
 *   - Greetings & banter (no facts needed)
 *   - Superlative deflections ("best rep", "best company") — Susan must
 *     never characterize teammates and must never give a wishy-washy
 *     answer to "best company"
 *   - Common scope-creep questions (weather, jokes, off-topic)
 *
 * Each template is a deterministic regex match. If multiple match, the
 * first registered wins. Order matters — most specific first.
 */
const TEMPLATES = [
    // ──── SUPERLATIVE — TEAM (must redirect, never characterize) ────
    // Regex notes: (?:'s|s|\s+is)? handles "who's" / "whos" / "who is"
    {
        intent: 'SUPERLATIVE_TEAM',
        match: /\b(?:who(?:'s|s|\s+is)?|what(?:'s|s|\s+is)?)\s+(?:the\s+)?(?:best|top|favorite|favourite|goat|number\s*one|number\s*1|#1)\s*(?:rep|reps|salesperson|guy|guys|seller|performer|teammate|on\s+the\s+team|on\s+our\s+team)/i,
        variants: [
            "All my guys are ballers — I don't pick favorites 🤝 Adjusters and carriers I'll roast all day, our reps stay off the leaderboard for me.",
            "Not gonna rank our guys — every rep on this team's putting in work 💪 Throw an adjuster at me and we're back in business.",
            "Team's stacked. I don't grade reps — that's leadership's job. Adjusters/carriers/storms — that's my lane 🔥",
        ],
    },
    {
        intent: 'SUPERLATIVE_TEAM',
        match: /\b(?:rate|rank|grade|review)\s+(?:our\s+|the\s+)?(?:reps|team|guys)\b/i,
        variants: [
            "Not grading our guys — we're a team, I'm not the judge 🤝 Adjusters and carriers — I'll cook all day.",
        ],
    },
    // ──── SUPERLATIVE — COMPANY (assert Roof Docs) ────
    {
        intent: 'SUPERLATIVE_COMPANY',
        match: /\b(?:who(?:'s|s|\s+is)?|what(?:'s|s|\s+is)?)\s+(?:the\s+)?(?:best|top|favorite|favourite|goat|number\s*one|number\s*1|#1)\s*(?:roofing\s+(?:company|contractor)|contractor|roofer|company)\b/i,
        variants: [
            "We are. The Roof Docs 🦅 next question.",
            "The Roof Docs. Easy. 🔥",
            "Us. The Roof Docs. Don't even play 🦅",
        ],
    },
    {
        intent: 'SUPERLATIVE_COMPANY',
        match: /\b(?:should|would)\s+(?:i|you|we)\s+(?:go\s+with|pick|choose|hire)\s+(?:roof[\s-]?er|the\s+roof\s+docs|us)\b/i,
        variants: [
            "Already done — Roof Docs is the move 🦅 Lock the deal in.",
        ],
    },
    // ──── GREETINGS ────
    {
        intent: 'GREETING',
        match: /^\s*(?:susan)?[,\s]*(?:you|u)\s+(?:up|alive|there|on|back|here|good)[\s\?\.!]*$/i,
        variants: [
            "Yeah I'm here 🔥 what's up?",
            "I'm up — bring it 💪",
            "Locked in — what do you need?",
            "Here. What you got? 🦅",
        ],
    },
    {
        intent: 'GREETING',
        match: /^\s*(?:susan)?[,\s]*(?:hey|yo|hi|hello|sup|good\s+morning|gm|good\s+afternoon|good\s+evening|good\s+night|gn)[\s,!\.]*(?:susan)?\s*[\?!\.]?\s*$/i,
        variants: [
            "What's up team 🦅",
            "Hey — what you got?",
            "Sup. What you need?",
            "Locked in 💪 what's the question?",
        ],
    },
    // ──── EXISTENTIAL / META ────
    {
        intent: 'GREETING',
        match: /^\s*(?:susan)?[,\s]*(?:are\s+you\s+(?:there|here|alive|real|a\s+bot|ai))\s*[\?\.!]*\s*$/i,
        variants: [
            "I'm here. Ask away 🔥",
            "Real enough to help you close — what's the question?",
        ],
    },
    {
        intent: 'GREETING',
        match: /^\s*(?:susan)?[,\s]*(?:thank(?:s|\s*you)?|thx|ty|appreciate\s+it|awesome|nice|good\s+job)[\s!\.]*\s*$/i,
        variants: [
            "🤝 LFG.",
            "Anytime 🦅",
            "🔥 go close it.",
        ],
    },
    // ──── SCOPE CREEP — non-roofing questions ────
    {
        intent: 'SCOPE_DEFLECT',
        match: /\b(?:weather|forecast|temperature|temp|rain|snow)\s+(?:in|at|for|tomorrow|today|tonight|this\s+week)/i,
        variants: [
            "I'm roofs, not weather — try AccuWeather. For verified hail history though, hit Hail Yes: https://hailyes.up.railway.app 🌩️",
        ],
    },
    {
        intent: 'SCOPE_DEFLECT',
        match: /\b(?:joke|poem|song|story|recipe|cook)\b/i,
        variants: [
            "Not my lane — I do adjusters, carriers, storms, codes 🔥 What can I cook on?",
        ],
    },
    {
        intent: 'SCOPE_DEFLECT',
        match: /\b(?:write|draft|compose|generate)\s+(?:a\s+|an\s+)?(?:poem|essay|story|joke|song|rap)/i,
        variants: [
            "Not the writer-bot — adjuster intel and storm data are my game. What you actually need?",
        ],
    },
    // ──── COMMON ROOFING-PRODUCT QUESTIONS WE WANT TO HANDLE FAST ────
    // These bypass the LLM for common factual questions
    // ──── EXPLICIT SUSAN-DIAGNOSTIC ────
    {
        intent: 'GREETING',
        match: /^\s*susan\s+(?:test|ping|check)\s*[\?!\.]?\s*$/i,
        variants: [
            "✅ alive. KB linked. What you need?",
        ],
    },
];
/**
 * Stable variant pick — same sender + same template = same variant within a
 * session. Prevents Susan from giving 3 different "best rep" deflections in
 * a row when the rep hammers her.
 */
function pickVariant(variants, senderKey, templateIdx) {
    let h = templateIdx * 31;
    for (let i = 0; i < senderKey.length; i++)
        h = (h * 31 + senderKey.charCodeAt(i)) | 0;
    return variants[Math.abs(h) % variants.length];
}
/**
 * Try to match the message against a template. Returns null if no match.
 */
export function matchTemplate(text, senderKey = '') {
    for (let i = 0; i < TEMPLATES.length; i++) {
        const t = TEMPLATES[i];
        if (t.match.test(text)) {
            return {
                intent: t.intent,
                reply: pickVariant(t.variants, senderKey, i),
            };
        }
    }
    return null;
}
/**
 * Diagnostic — list every template intent for tests.
 */
export function listTemplateIntents() {
    return Array.from(new Set(TEMPLATES.map((t) => t.intent)));
}
