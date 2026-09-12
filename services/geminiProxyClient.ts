import { GoogleGenAI } from '@google/genai';
import { getApiBaseUrl } from './config';

/** The SDK requires a key field; this public marker is never sent upstream. */
export function createGeminiProxyClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: 'server-proxy',
    httpOptions: {
      baseUrl: new URL(`${getApiBaseUrl()}/susan/gemini`, window.location.origin).href,
      apiVersion: 'v1beta',
      timeout: 120_000,
    },
  });
}
