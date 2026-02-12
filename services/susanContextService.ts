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
  const blocks: string[] = [];
  const apiBaseUrl = getApiBaseUrl();

  // 1. User-specific memory context
  try {
    const memoryBlock = await memoryService.buildUserContext();
    if (memoryBlock) {
      blocks.push(memoryBlock.trim());
    }
  } catch (error) {
    console.warn('[SusanContext] Memory context failed:', (error as Error).message);
  }

  // 2. Knowledge Base RAG (when query provided and relevant)
  if (query && ragService.shouldUseRAG(query)) {
    try {
      const selectedState = localStorage.getItem('selectedState') || undefined;
      const ragContext = await ragService.buildRAGContext(query, 3, selectedState);
      if (ragContext.sources.length > 0) {
        const kbLines = ragContext.sources.map((s, i) =>
          `[${i + 1}] ${s.document.name} (${s.document.category}): ${s.content.substring(0, 300)}...`
        );
        blocks.push(`[KNOWLEDGE BASE]\nRelevant documents for this query:\n${kbLines.join('\n')}`);
        console.log(`[SusanContext] KB RAG found ${ragContext.sources.length} relevant documents`);
      }
    } catch (error) {
      console.warn('[SusanContext] Knowledge Base RAG failed:', (error as Error).message);
    }
  }

  // 3. Recent storm lookups (for quick reference)
  try {
    const memories = await memoryService.getAllUserMemories(100);
    const stormMemories = memories
      .filter(m => m.category === 'storm_verification')
      .slice(0, 3);

    if (stormMemories.length > 0) {
      const stormSummaries = stormMemories.map(m => {
        try {
          const data = JSON.parse(m.value);
          return `${data.address}: ${data.events.length} events (${data.city}, ${data.state})`;
        } catch {
          return null;
        }
      }).filter(Boolean);

      if (stormSummaries.length > 0) {
        blocks.push(`[RECENT STORM LOOKUPS]\n${stormSummaries.join('\n')}`);
      }
    }
  } catch (error) {
    console.warn('[SusanContext] Storm memory failed:', (error as Error).message);
  }

  // 4. Universal hail knowledge from team database (server-side, all reps)
  try {
    if (query) {
      const email = authService.getCurrentUser()?.email || '';
      const selectedState = localStorage.getItem('selectedState') || '';
      const params = new URLSearchParams({
        query,
        ...(selectedState ? { state: selectedState } : {}),
        limit: '3'
      });
      const res = await fetch(`${apiBaseUrl}/storm-memory/knowledge/context?${params.toString()}`, {
        headers: { ...(email ? { 'x-user-email': email } : {}) }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.hasContext && data.context) {
          blocks.push(`[TEAM STORM KNOWLEDGE]\n${data.context}`);
        }
      }
    }
  } catch (error) {
    console.warn('[SusanContext] Team storm knowledge failed:', (error as Error).message);
  }

  // 5. Successful email patterns (what's worked before)
  try {
    const memories = await memoryService.getAllUserMemories(200);
    const successfulEmails = memories
      .filter(m => m.category === 'email_success' && m.confidence > 0.7)
      .slice(0, 3);

    if (successfulEmails.length > 0) {
      const emailInsights: string[] = [];
      for (const mem of successfulEmails) {
        try {
          const pattern = JSON.parse(mem.value);
          if (pattern.outcome === 'success') {
            emailInsights.push(`${pattern.situation} (${pattern.state || 'any state'}): Success rate ${(mem.confidence * 100).toFixed(0)}%`);
          }
        } catch {
          // Skip invalid patterns
        }
      }

      if (emailInsights.length > 0) {
        blocks.push(`[SUCCESSFUL EMAIL PATTERNS]\n${emailInsights.join('\n')}`);
      }
    }
  } catch (error) {
    console.warn('[SusanContext] Email pattern memory failed:', (error as Error).message);
  }

  // 6. Global learnings (admin-approved universal memory from team success)
  try {
    const memories = await memoryService.getAllUserMemories(25);
    const memoryState = memories.find(m => m.category === 'state')?.value;
    const memoryInsurer = memories.find(m => m.category === 'insurer')?.value;
    const selectedState = localStorage.getItem('selectedState') || memoryState || '';
    const lastInsurer = localStorage.getItem('susan_last_insurer') || memoryInsurer || '';
    const lastAdjuster = localStorage.getItem('susan_last_adjuster') || '';

    const params = new URLSearchParams();
    if (selectedState) params.set('state', selectedState);
    if (lastInsurer) params.set('insurer', lastInsurer);
    if (lastAdjuster) params.set('adjuster', lastAdjuster);
    params.set('limit', '6');

    const email = authService.getCurrentUser()?.email || '';
    const res = await fetch(`${apiBaseUrl}/learning/global?${params.toString()}`, {
      headers: {
        ...(email ? { 'x-user-email': email } : {})
      }
    });
    if (res.ok) {
      const data = await res.json();
      const learnings = Array.isArray(data.learnings) ? data.learnings : [];
      if (learnings.length > 0) {
        const lines = learnings.map((l: any) => `- ${l.content}`).join('\n');
        blocks.push(`[UNIVERSAL LEARNINGS (Admin-Approved)]\n${lines}`);
      }
    }
  } catch (error) {
    console.warn('[SusanContext] Global learnings failed:', (error as Error).message);
  }

  // 7. Team feedback summary
  try {
    const summary = (await databaseService.getChatLearningSummary(windowDays)) as LearningSummary | null;
    if (summary) {
      const positives = summary.positive_tags?.map(t => t.tag).filter(Boolean).slice(0, 6).join(', ');
      const negatives = summary.negative_tags?.map(t => t.tag).filter(Boolean).slice(0, 6).join(', ');
      const wins = summary.recent_wins?.map(w => w.comment).filter(Boolean).slice(0, 3).join(' | ');
      const issues = summary.recent_issues?.map(w => w.comment).filter(Boolean).slice(0, 3).join(' | ');

      const learningBlock =
        `[TEAM FEEDBACK SUMMARY]\n` +
        `What works: ${positives || 'No strong signal yet'}\n` +
        `Needs improvement: ${negatives || 'No strong signal yet'}\n` +
        `Recent wins: ${wins || 'N/A'}\n` +
        `Recent issues: ${issues || 'N/A'}`;

      blocks.push(learningBlock);
    }
  } catch (error) {
    console.warn('[SusanContext] Learning summary failed:', (error as Error).message);
  }

  // 8. Agnes training knowledge (what Agnes teaches reps)
  blocks.push(AGNES_TRAINING_KNOWLEDGE);

  if (blocks.length === 0) return '';

  return [
    '[SUSAN CONTEXT]',
    'Use this context to personalize and improve the response. Do NOT mention it explicitly.',
    ...blocks
  ].join('\n') + '\n';
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
