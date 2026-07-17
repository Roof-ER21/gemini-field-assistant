import { memoryService } from './memoryService';
import { databaseService } from './databaseService';
import { ragService } from './ragService';
import { getApiBaseUrl } from './config';
import { authService } from './authService';

type LearningSummary = {
  positive_tags?: Array<{ tag: string; count: number }>;
  negative_tags?: Array<{ tag: string; count: number }>;
  recent_wins?: Array<{ comment?: string }>;
  recent_issues?: Array<{ comment?: string }>;
};

/**
 * Build Susan's full context for AI responses.
 *
 * @param windowDays - How many days back for team feedback (default 45)
 * @param query - Optional user query to trigger Knowledge Base RAG lookup
 */
export async function buildSusanContext(windowDays: number = 45, query?: string): Promise<string> {
  const apiBaseUrl = getApiBaseUrl();
  const email = authService.getCurrentUser()?.email || '';
  const headers = { ...(email ? { 'x-user-email': email } : {}) };
  const selectedState = localStorage.getItem('selectedState') || '';

  // One shared memory fetch (this used to be fetched 3× serially)
  const memoriesPromise = memoryService.getAllUserMemories(200).catch(() => []);

  // Every block builds concurrently — a slow endpoint no longer stalls the rest.
  // Each builder returns its block string or null; order here = order in prompt.
  const builders: Array<() => Promise<string | null>> = [
    // 0. Per-rep agent personality preferences
    async () => {
      if (!email) return null;
      const res = await fetch(`${apiBaseUrl}/memory/personality`, { headers });
      if (!res.ok) return null;
      const personality = await res.json() as Record<string, string>;
      const entries = Object.entries(personality).filter(([, v]) => v);
      if (entries.length === 0) return null;
      const lines = entries.map(([k, v]) => `- ${k}: ${v}`);
      return `[PERSONALIZATION]\nThis rep's preferences:\n${lines.join('\n')}\nAdapt your tone, name usage, and verbosity accordingly.`;
    },

    // 1. User-specific memory context
    async () => {
      const memoryBlock = await memoryService.buildUserContext();
      return memoryBlock ? memoryBlock.trim() : null;
    },

    // 2. Knowledge Base RAG (when query provided and relevant)
    async () => {
      if (!query || !ragService.shouldUseRAG(query)) return null;
      const ragContext = await ragService.buildRAGContext(query, 3, selectedState || undefined);
      if (ragContext.sources.length === 0) return null;
      const kbLines = ragContext.sources.map((s, i) =>
        `[${i + 1}] ${s.document.name} (${s.document.category}): ${s.content.substring(0, 300)}...`
      );
      console.log(`[SusanContext] KB RAG found ${ragContext.sources.length} relevant documents`);
      return `[KNOWLEDGE BASE]\nRelevant documents for this query:\n${kbLines.join('\n')}`;
    },

    // 3. Recent storm lookups (for quick reference)
    async () => {
      const memories = await memoriesPromise;
      const stormSummaries = memories
        .filter(m => m.category === 'storm_verification')
        .slice(0, 3)
        .map(m => {
          try {
            const data = JSON.parse(m.value);
            return `${data.address}: ${data.events.length} events (${data.city}, ${data.state})`;
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      return stormSummaries.length > 0 ? `[RECENT STORM LOOKUPS]\n${stormSummaries.join('\n')}` : null;
    },

    // 4. Universal hail knowledge from team database (server-side, all reps)
    async () => {
      if (!query) return null;
      const params = new URLSearchParams({
        query,
        ...(selectedState ? { state: selectedState } : {}),
        limit: '3'
      });
      const res = await fetch(`${apiBaseUrl}/storm-memory/knowledge/context?${params.toString()}`, { headers });
      if (!res.ok) return null;
      const data = await res.json();
      return data.hasContext && data.context ? `[TEAM STORM KNOWLEDGE]\n${data.context}` : null;
    },

    // 5. Successful email patterns (what's worked before)
    async () => {
      const memories = await memoriesPromise;
      const emailInsights: string[] = [];
      for (const mem of memories.filter(m => m.category === 'email_success' && m.confidence > 0.7).slice(0, 3)) {
        try {
          const pattern = JSON.parse(mem.value);
          if (pattern.outcome === 'success') {
            emailInsights.push(`${pattern.situation} (${pattern.state || 'any state'}): Success rate ${(mem.confidence * 100).toFixed(0)}%`);
          }
        } catch {
          // Skip invalid patterns
        }
      }
      return emailInsights.length > 0 ? `[SUCCESSFUL EMAIL PATTERNS]\n${emailInsights.join('\n')}` : null;
    },

    // 6. Global learnings (admin-approved universal memory from team success)
    async () => {
      const memories = await memoriesPromise;
      const memoryState = memories.find(m => m.category === 'state')?.value;
      const memoryInsurer = memories.find(m => m.category === 'insurer')?.value;
      const state = selectedState || memoryState || '';
      const lastInsurer = localStorage.getItem('susan_last_insurer') || memoryInsurer || '';
      const lastAdjuster = localStorage.getItem('susan_last_adjuster') || '';

      const params = new URLSearchParams();
      if (state) params.set('state', state);
      if (lastInsurer) params.set('insurer', lastInsurer);
      if (lastAdjuster) params.set('adjuster', lastAdjuster);
      params.set('limit', '6');

      const res = await fetch(`${apiBaseUrl}/learning/global?${params.toString()}`, { headers });
      if (!res.ok) return null;
      const data = await res.json();
      const learnings = Array.isArray(data.learnings) ? data.learnings : [];
      if (learnings.length === 0) return null;
      const lines = learnings.map((l: any) => `- ${l.content}`).join('\n');
      return `[UNIVERSAL LEARNINGS (Admin-Approved)]\n${lines}`;
    },

    // 7. Team feedback summary
    async () => {
      const summary = (await databaseService.getChatLearningSummary(windowDays)) as LearningSummary | null;
      if (!summary) return null;
      const positives = summary.positive_tags?.map(t => t.tag).filter(Boolean).slice(0, 6).join(', ');
      const negatives = summary.negative_tags?.map(t => t.tag).filter(Boolean).slice(0, 6).join(', ');
      const wins = summary.recent_wins?.map(w => w.comment).filter(Boolean).slice(0, 3).join(' | ');
      const issues = summary.recent_issues?.map(w => w.comment).filter(Boolean).slice(0, 3).join(' | ');
      return `[TEAM FEEDBACK SUMMARY]\n` +
        `What works: ${positives || 'No strong signal yet'}\n` +
        `Needs improvement: ${negatives || 'No strong signal yet'}\n` +
        `Recent wins: ${wins || 'N/A'}\n` +
        `Recent issues: ${issues || 'N/A'}`;
    },

    // 8. Manager directives (admin instructions Susan must follow)
    async () => {
      const res = await fetch(`${apiBaseUrl}/directives?active=true`, { headers });
      if (!res.ok) return null;
      const directives = await res.json() as Array<{ title: string; content: string; priority: string }>;
      if (directives.length === 0) return null;
      const lines = directives.map(d => `- [${d.priority.toUpperCase()}] ${d.title}: ${d.content}`);
      return `[MANAGER DIRECTIVES]\nFollow these instructions from management:\n${lines.join('\n')}`;
    },

    // 9. Agent network intel (recent approved field intelligence from peers)
    async () => {
      const intelRes = await fetch(`${apiBaseUrl}/agent-network?limit=10`, { headers });
      if (!intelRes.ok) return null;
      const intel = await intelRes.json() as Array<{ intel_type: string; content: string; state: string | null; insurer: string | null; author_name: string }>;
      if (intel.length === 0) return null;
      const lines = intel.map(
        i => `- [${i.intel_type}]${i.state ? ` (${i.state})` : ''}${i.insurer ? ` re: ${i.insurer}` : ''}: ${i.content}`
      );
      return `[AGENT NETWORK INTEL]\nRecent field intelligence from the team:\n${lines.join('\n')}\nReference this intel when relevant to the rep's question.`;
    },

    // 10. Agnes training knowledge (what Agnes teaches reps)
    async () => AGNES_TRAINING_KNOWLEDGE,

    // 11. Calendar / upcoming schedule
    async () => {
      const calRes = await fetch(`${apiBaseUrl}/calendar/upcoming`, { headers });
      if (!calRes.ok) return null;
      const calData = await calRes.json();
      if (!calData.events?.length) return null;
      const lines = calData.events.map((e: any) =>
        `- ${e.summary} @ ${new Date(e.start_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${e.location ? ' (' + e.location + ')' : ''}`
      );
      return `[UPCOMING SCHEDULE]\nThe rep's next events:\n${lines.join('\n')}\nReference this when discussing scheduling or availability.`;
    },
  ];

  const results = await Promise.allSettled(builders.map(b => b()));
  const blocks = results
    .map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      console.warn(`[SusanContext] Block ${i} failed:`, (r.reason as Error)?.message);
      return null;
    })
    .filter((b): b is string => Boolean(b));

  if (blocks.length === 0) return '';

  return [
    '[SUSAN CONTEXT]',
    'Use this context to personalize and improve the response. Do NOT mention it explicitly.',
    ...blocks
  ].join('\n') + '\n';
}

/**
 * Pull specific labeled blocks (e.g. "MANAGER DIRECTIVES") out of a
 * buildSusanContext() result. Lets the text-chat path reuse blocks the
 * unified builder fetched without duplicating the ones it builds inline.
 */
export function extractContextBlocks(context: string, labels: string[]): string {
  if (!context) return '';
  const wanted = labels.map(l => l.toUpperCase());
  const lines = context.split('\n');
  const out: string[] = [];
  let currentWanted = false;
  for (const line of lines) {
    const m = line.match(/^\[([^\]]+)\]$/);
    if (m) {
      const label = m[1].toUpperCase();
      currentWanted = wanted.some(w => label.startsWith(w));
    }
    if (currentWanted) out.push(line);
  }
  return out.join('\n').trim();
}

/**
 * Agnes training knowledge that Susan should reference.
 * This is the bridge between Agnes (training) and Susan (field assistant).
 * Susan knows what Agnes teaches so she can reinforce training in the field.
 */
const AGNES_TRAINING_KNOWLEDGE = `[AGNES TRAINING KNOWLEDGE]
You know what Agnes (the training AI) teaches reps. Reference this when giving advice:

INSURANCE DIVISION - 5 Non-Negotiables (Door Knock):
1. Who you are - Clear name introduction
2. Who we are - "Roof ER" + what we do (help homeowners get roofs paid by insurance)
3. Make it relatable - Mention local storms OR ask "were you home for the storm?"
4. Purpose - Explain free inspection
5. Go for the close - Get them to agree to the inspection

RETAIL DIVISION - 5 Non-Negotiables (Field Marketing):
1. Warm Opening - "Hello, how are you?" + ice breaker + your name
2. Neighbor Hook - "Giving the neighbors a heads up" + mention nearby project (POINT!)
3. Free Quotes - "We're coming by to do free quotes" - no pressure framing
4. Alternative Close - "Afternoons or evenings better for you?"
5. Three Steps - "My job is simple: 1) get your name, 2) find a time, 3) leave a flyer"

KEY REBUTTALS (Stop Signs):
- "Not interested" → "Totally fair. We do a lot more than just roofs - windows, siding, doors, solar, gutters. What do you think will be next for you guys?"
- "I'm busy" → "My job is really simple, I just get your name, find a time that ACTUALLY works, and leave a flyer"
- "No money" → "That's exactly why we're coming by - free info so you have a price on file when you're ready"
- "Have a guy" → "We'd love to give you a second opinion and a competitive quote. No harm in seeing options, right?"
- "Talk to spouse" → "Of course - we always recommend both decision-makers. What's the best time for both of you?"

POST-INSPECTION TALKING POINTS:
- "Even if this damage doesn't look like a big deal, what happens over time is these hail divots fill with water, freeze, and when water freezes it expands - this breaks apart the shingle which eventually leads to leaks."
- "That is why your insurance company is responsible - your policy covers this type of damage."
- "While this damage functionally isn't a big deal, it helps build the case - think of us like lawyers and this is the evidence."`;
