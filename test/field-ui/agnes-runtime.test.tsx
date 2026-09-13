import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getManagerAnalytics, getSessionStats } from '../../agnes21/utils/sessionStorage';
import { DifficultyLevel, PitchMode } from '../../agnes21/types';
import { createVAD } from '../../agnes21/utils/vadUtils';
import { EnhancedKnowledgeService } from '../../services/knowledgeEnhancedService';

const mocks = vi.hoisted(() => ({ createVAD: vi.fn() }));
vi.mock('@ricky0123/vad-web', () => ({ MicVAD: { new: mocks.createVAD } }));
vi.mock('../../services/knowledgeService', () => ({
  knowledgeService: {
    loadDocument: async () => ({ content: 'Use (matching) only with a verified source.' }),
  },
}));

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => data.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

it('counts Veteran and Just Listen sessions in rep and manager statistics', () => {
  localStorage.setItem(
    'agnes_sessions_fixture',
    JSON.stringify([
      {
        sessionId: 'fixture',
        timestamp: new Date().toISOString(),
        difficulty: DifficultyLevel.VETERAN,
        mode: PitchMode.JUST_LISTEN,
        transcript: [],
        script: 'Fixture practice',
        finalScore: 80,
        duration: 60,
      },
    ]),
  );
  expect(getSessionStats('fixture').sessionsPerDifficulty[DifficultyLevel.VETERAN]).toBe(1);
  const stats = getManagerAnalytics(undefined, undefined, 'fixture');
  expect(stats.sessionsByDifficulty[DifficultyLevel.VETERAN]).toBe(1);
  expect(stats.sessionsByMode[PitchMode.JUST_LISTEN]).toBe(1);
  expect(stats.completionRateByDifficulty[DifficultyLevel.VETERAN].total).toBe(1);
});

it('provides zero counts for every difficulty and mode without sessions', () => {
  const stats = getManagerAnalytics(undefined, undefined, 'fixture');
  for (const level of Object.values(DifficultyLevel))
    expect(stats.sessionsByDifficulty[level]).toBe(0);
  for (const mode of Object.values(PitchMode)) expect(stats.sessionsByMode[mode]).toBe(0);
});

it('converts the configured legacy voice frames into supported milliseconds', async () => {
  mocks.createVAD.mockResolvedValue({});
  await createVAD({});
  expect(mocks.createVAD).toHaveBeenCalledWith(
    expect.objectContaining({
      model: 'legacy',
      redemptionMs: 768,
      minSpeechMs: 288,
      preSpeechPadMs: 96,
    }),
  );
  expect(mocks.createVAD.mock.calls[0][0]).not.toHaveProperty('redemptionFrames');
});

it('searches literal punctuation without interpreting the query as a regular expression', async () => {
  const service = new EnhancedKnowledgeService();
  const document = { name: 'Fixture guide', path: '/fixture.md', type: 'md' as const };
  const results = await service.searchDocuments('(', {
    documents: [document],
    searchInContent: true,
  });
  expect(results).toHaveLength(1);
  expect(results[0].document).toEqual(document);
});
