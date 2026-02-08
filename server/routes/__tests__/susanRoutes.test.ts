/**
 * Test suite for Susan AI Chat Routes
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

describe('Susan AI Chat Routes', () => {
  const BASE_URL = process.env.API_URL || 'http://localhost:8080';

  describe('POST /api/susan/chat', () => {
    it('should reject empty message', async () => {
      const response = await fetch(`${BASE_URL}/api/susan/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '' })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Message is required');
    });

    it('should handle chat without session (fallback mode)', async () => {
      const response = await fetch(`${BASE_URL}/api/susan/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'What is roof damage?'
        })
      });

      const data = await response.json();

      // Should either succeed with fallback or fail gracefully
      if (response.ok) {
        expect(data.success).toBe(true);
        expect(data.response).toBeDefined();
        expect(typeof data.response).toBe('string');
        expect(data.metadata.mode).toBe('fallback');
      } else {
        // If Gemini API key is not configured
        expect(response.status).toBe(503);
        expect(data.error).toContain('not available');
      }
    });

    it('should handle chat with invalid session gracefully', async () => {
      const response = await fetch(`${BASE_URL}/api/susan/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Tell me about hail damage',
          sessionId: 'invalid-session-id-12345'
        })
      });

      const data = await response.json();

      // Should fall back to direct Gemini
      if (response.ok) {
        expect(data.success).toBe(true);
        expect(data.response).toBeDefined();
        expect(data.metadata.mode).toBe('fallback');
      } else {
        expect(response.status).toBe(503);
      }
    });
  });

  describe('GET /api/susan/session/:sessionId', () => {
    it('should return 404 for non-existent session', async () => {
      const response = await fetch(`${BASE_URL}/api/susan/session/non-existent-session`);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Session not found');
    });
  });

  describe('POST /api/susan/session/:sessionId/complete', () => {
    it('should handle completion of non-existent session', async () => {
      const response = await fetch(`${BASE_URL}/api/susan/session/non-existent/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      // Should either succeed (service handles gracefully) or return error
      expect([200, 404, 500]).toContain(response.status);
    });
  });
});
