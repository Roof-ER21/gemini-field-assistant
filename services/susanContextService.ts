import { memoryService } from './memoryService';
import { databaseService } from './databaseService';

type LearningSummary = {
  positive_tags?: Array<{ tag: string; count: number }>;
  negative_tags?: Array<{ tag: string; count: number }>;
  recent_wins?: Array<{ comment?: string }>;
  recent_issues?: Array<{ comment?: string }>;
};

export async function buildSusanContext(windowDays: number = 45): Promise<string> {
  const blocks: string[] = [];

  try {
    const memoryBlock = await memoryService.buildUserContext();
    if (memoryBlock) {
      blocks.push(memoryBlock.trim());
    }
  } catch (error) {
    console.warn('[SusanContext] Memory context failed:', (error as Error).message);
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
