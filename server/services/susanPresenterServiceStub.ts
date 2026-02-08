/**
 * Stub implementation of susanPresenterService for server-side compilation
 * The actual implementation is in services/susanPresenterService.ts (frontend)
 * This stub allows the server to compile and fall back to direct Gemini
 */

// Minimal session interface for type compatibility
interface Session {
  id: string;
  presentationId: string;
  propertyAddress: string;
  homeownerName: string;
  startTime: Date;
  currentSlideIndex: number;
  slides: any[];
  status: string;
  conversationHistory: any[];
  homeownerConcerns: string[];
}

/**
 * Stub service - always returns null/undefined to trigger Gemini fallback
 */
export const susanPresenterService = {
  getSession: (_sessionId: string): Session | null => {
    // Return null to trigger Gemini fallback in susanRoutes.ts
    return null;
  },

  answerQuestion: async (
    _sessionId: string,
    _question: string,
    _slideIndex?: number
  ): Promise<{ answer: string; relatedSlides: number[]; followUpSuggestion: string; confidence: number }> => {
    throw new Error('Session not available - use Gemini fallback');
  },

  completeSession: (_sessionId: string): void => {
    // No-op in stub
  }
};

export default susanPresenterService;
