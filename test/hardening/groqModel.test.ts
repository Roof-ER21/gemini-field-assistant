import { afterEach, expect, it, vi } from 'vitest';
import { groqRequestOptions } from '../../server/services/groqModel';
import { classifyIntent } from '../../server/services/susanIntentRouter';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('defaults to an available model with bounded reasoning', () => {
  vi.stubEnv('GROQ_MODEL', '');
  expect(groqRequestOptions()).toEqual({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low' });
});
it('preserves a configured non-OSS model without unsupported reasoning options', () => {
  vi.stubEnv('GROQ_MODEL', ' allam-2-7b ');
  expect(groqRequestOptions()).toEqual({ model: 'allam-2-7b' });
});
it('the actual intent router sends the shared options and retains JSON parsing', async () => {
  vi.stubEnv('GROQ_API_KEY', 'fake-test-credential');
  vi.stubEnv('GROQ_MODEL', '');
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"intent":"OTHER","confidence":0.9}' } }] }) }));
  vi.stubGlobal('fetch', fetchMock);
  const result = await classifyIntent('A synthetic check', null);
  const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
  expect(body).toMatchObject({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', response_format: { type: 'json_object' } });
  expect(result?.intent).toBe('OTHER');
});
