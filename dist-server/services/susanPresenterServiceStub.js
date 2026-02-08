/**
 * Stub implementation of susanPresenterService for server-side compilation
 * The actual implementation is in services/susanPresenterService.ts (frontend)
 * This stub allows the server to compile and fall back to direct Gemini
 */
/**
 * Stub service - always returns null/undefined to trigger Gemini fallback
 */
export const susanPresenterService = {
    getSession: (_sessionId) => {
        // Return null to trigger Gemini fallback in susanRoutes.ts
        return null;
    },
    answerQuestion: async (_sessionId, _question, _slideIndex) => {
        throw new Error('Session not available - use Gemini fallback');
    },
    completeSession: (_sessionId) => {
        // No-op in stub
    }
};
export default susanPresenterService;
