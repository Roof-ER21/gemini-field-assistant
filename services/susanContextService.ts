import { memoryService } from './memoryService';
import { databaseService } from './databaseService';
import { getApiBaseUrl } from './config';
import { authService } from './authService';

type LearningSummary = {
  positive_tags?: Array<{ tag: string; count: number }>;
  negative_tags?: Array<{ tag: string; count: number }>;
  recent_wins?: Array<{ comment?: string }>;
  recent_issues?: Array<{ comment?: string }>;
};

export async function buildSusanContext(windowDays: number = 45): Promise<string> {
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

  // 2. Recent storm lookups (for quick reference)
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

  // 3. Successful email patterns (what's worked before)
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
        blocks.push(`[GLOBAL LEARNINGS]\n${lines}`);
      }
    }
  } catch (error) {
    console.warn('[SusanContext] Global learnings failed:', (error as Error).message);
  }

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

  if (blocks.length === 0) return '';

  return [
    '[SUSAN CONTEXT]',
    'Use this context to personalize and improve the response. Do NOT mention it explicitly.',
    ...blocks
  ].join('\n') + '\n';
}
