/**
 * Susan AI Chat Routes - REST API for Susan AI chat functionality
 * Handles chat requests using the susanPresenterService
 */

import express, { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { susanPresenterService } from '../services/susanPresenterServiceStub.js';

const router = express.Router();

// Get environment key helper
const getEnvKey = (key: string) => process.env[key] || process.env[`VITE_${key}`];

// Initialize Gemini client for fallback
const geminiKey = getEnvKey('GOOGLE_AI_API_KEY') || getEnvKey('GEMINI_API_KEY');
const geminiClient = geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : null;

// Types
interface ChatRequest extends Request {
  body: {
    message: string;
    sessionId?: string;
    slideIndex?: number;
  };
}

/**
 * POST /api/susan/chat
 * Chat with Susan AI - uses susanPresenterService if session exists, falls back to direct Gemini
 */
router.post('/chat', async (req: ChatRequest, res: Response) => {
  try {
    const { message, sessionId, slideIndex } = req.body;

    // Validate required fields
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message is required and must be a non-empty string'
      });
    }

    // If sessionId is provided, try to use susanPresenterService
    if (sessionId) {
      try {
        const session = susanPresenterService.getSession(sessionId);

        if (session) {
          // Use the presenter service's question answering
          const currentSlide = typeof slideIndex === 'number' ? slideIndex : session.currentSlideIndex;
          const questionResponse = await susanPresenterService.answerQuestion(
            sessionId,
            message,
            currentSlide
          );

          return res.json({
            success: true,
            response: questionResponse.answer,
            metadata: {
              relatedSlides: questionResponse.relatedSlides,
              followUpSuggestion: questionResponse.followUpSuggestion,
              confidence: questionResponse.confidence,
              sessionId,
              slideIndex: currentSlide
            }
          });
        }
      } catch (sessionError) {
        console.warn('Susan session error, falling back to direct Gemini:', sessionError);
        // Fall through to Gemini fallback
      }
    }

    // Fallback: Direct Gemini chat without session context
    if (!geminiClient) {
      return res.status(503).json({
        success: false,
        error: 'Susan AI is not available. Gemini API key is not configured.'
      });
    }

    try {
      const response = await geminiClient.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: `You are Susan, a friendly and professional insurance claims specialist with over 15 years of experience in roofing damage assessment.

User question: ${message}

Provide a helpful, conversational response as Susan would.`,
      });

      const responseText = response.text ?? 'I apologize, but I was unable to generate a response. Please try again.';

      return res.json({
        success: true,
        response: responseText,
        metadata: {
          mode: 'fallback',
          sessionId: sessionId || null,
          slideIndex: slideIndex ?? null
        }
      });
    } catch (geminiError) {
      console.error('Gemini API error:', geminiError);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate response from Susan AI. Please try again.'
      });
    }

  } catch (error) {
    console.error('Susan chat error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/susan/session/:sessionId
 * Get session information (optional - for debugging/status)
 */
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = susanPresenterService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Return session metadata (without full conversation history for performance)
    return res.json({
      success: true,
      session: {
        id: session.id,
        presentationId: session.presentationId,
        propertyAddress: session.propertyAddress,
        homeownerName: session.homeownerName,
        startTime: session.startTime,
        currentSlideIndex: session.currentSlideIndex,
        totalSlides: session.slides.length,
        status: session.status,
        messageCount: session.conversationHistory.length,
        homeownerConcerns: session.homeownerConcerns
      }
    });
  } catch (error) {
    console.error('Session retrieval error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/susan/session/:sessionId/complete
 * Mark a session as complete
 */
router.post('/session/:sessionId/complete', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    susanPresenterService.completeSession(sessionId);

    return res.json({
      success: true,
      message: 'Session completed successfully'
    });
  } catch (error) {
    console.error('Session completion error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

export default router;
