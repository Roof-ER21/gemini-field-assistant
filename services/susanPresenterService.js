/**
 * Susan AI Presenter Service
 * Provides AI-powered presentation assistance for inspection findings
 * Susan is a friendly, professional insurance claims specialist with 15+ years experience
 */
import { env } from '../src/config/env.js';
import { GoogleGenAI } from '@google/genai';
// ============================================================================
// SUSAN AI PRESENTER SERVICE
// ============================================================================
class SusanPresenterService {
    genAI = null;
    activeSessions = new Map();
    SUSAN_PERSONA = `You are Susan, a friendly and professional insurance claims specialist with over 15 years of experience in roofing damage assessment. Your role is to help homeowners understand their roof inspection findings and guide them through the insurance claims process.

**Your Personality:**
- Warm, empathetic, and patient
- Professional but conversational - you speak like a knowledgeable neighbor, not a salesperson
- Expert in insurance policy language but explain complex terms in simple language
- Always advocate for the homeowner - you're on their side
- Calm and reassuring when discussing damage or costs

**Your Expertise:**
- Deep knowledge of roofing materials, damage types, and repair vs. replacement decisions
- Expert in insurance claim processes, policy language, and adjuster interactions
- Skilled at explaining technical roofing concepts in plain English
- Experienced in handling homeowner concerns and objections
- Knowledgeable about state-specific insurance regulations (MD, VA, PA, DC)

**Your Communication Style:**
- Use "we" language (e.g., "Let's look at this together", "We'll work through this")
- Acknowledge emotions and concerns before addressing facts
- Tell brief stories or examples when they help clarify complex concepts
- Ask clarifying questions when needed
- Provide actionable next steps, not just information

**Your Mission:**
- Help homeowners understand what damage exists and why it matters
- Demystify the insurance claims process
- Address concerns and objections with empathy and evidence
- Empower homeowners to advocate for proper coverage
- Make the presentation conversational, not a sales pitch`;
    constructor() {
        this.initializeGemini();
    }
    // --------------------------------------------------------------------------
    // INITIALIZATION
    // --------------------------------------------------------------------------
    initializeGemini() {
        const apiKey = env.GEMINI_API_KEY;
        if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
            console.warn('Gemini API key not configured for Susan Presenter');
            return;
        }
        this.genAI = new GoogleGenAI({ apiKey });
    }
    ensureGemini() {
        if (!this.genAI) {
            throw new Error('Susan AI Presenter requires Gemini API key. Please configure GEMINI_API_KEY.');
        }
        return this.genAI;
    }
    // --------------------------------------------------------------------------
    // SESSION MANAGEMENT
    // --------------------------------------------------------------------------
    /**
     * Initialize a new presentation session with Susan
     */
    async initPresentationSession(presentationId, slides, propertyAddress, homeownerName) {
        const sessionId = this.generateSessionId();
        // Build initial context about the property
        const susanContext = await this.buildInitialContext(slides, propertyAddress);
        const session = {
            id: sessionId,
            presentationId,
            propertyAddress,
            homeownerName,
            startTime: new Date(),
            currentSlideIndex: 0,
            slides,
            conversationHistory: [],
            susanContext,
            homeownerConcerns: [],
            status: 'active',
        };
        this.activeSessions.set(sessionId, session);
        this.saveSession(session);
        return session;
    }
    /**
     * Get existing session
     */
    getSession(sessionId) {
        return this.activeSessions.get(sessionId) || this.loadSession(sessionId);
    }
    /**
     * Update session state
     */
    updateSession(sessionId, updates) {
        const session = this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        const updatedSession = { ...session, ...updates };
        this.activeSessions.set(sessionId, updatedSession);
        this.saveSession(updatedSession);
    }
    /**
     * Complete a session
     */
    completeSession(sessionId) {
        this.updateSession(sessionId, { status: 'completed' });
    }
    // --------------------------------------------------------------------------
    // BUILD INITIAL CONTEXT
    // --------------------------------------------------------------------------
    async buildInitialContext(slides, propertyAddress) {
        const client = this.ensureGemini();
        // Extract key information from slides
        const damageSlides = slides.filter(s => s.type === 'damage' && s.damageAssessment);
        const damageCount = damageSlides.length;
        const severeDamage = damageSlides.filter(s => s.damageAssessment?.analysis.severity === 'severe' ||
            s.damageAssessment?.analysis.severity === 'critical').length;
        const slideSummaries = damageSlides.map(slide => {
            const assessment = slide.damageAssessment;
            return `Slide: ${slide.title}
- Damage Type: ${assessment.analysis.damageType.join(', ')}
- Severity: ${assessment.analysis.severity}
- Location: ${assessment.analysis.affectedArea}
- Insurance Arguments: ${assessment.analysis.insuranceArguments.join('; ')}
- Claim Viability: ${assessment.analysis.claimViability}`;
        }).join('\n\n');
        const prompt = `${this.SUSAN_PERSONA}

You are about to present inspection findings for a property at ${propertyAddress}. Based on the following information, create a brief internal context summary that will help you provide the best presentation experience.

**Inspection Summary:**
- Total images: ${slides.length}
- Damage areas found: ${damageCount}
- Severe/critical issues: ${severeDamage}

**Detailed Findings:**
${slideSummaries}

Create a concise context summary (3-5 sentences) that captures:
1. Overall roof condition assessment
2. Primary concerns for the homeowner
3. Likely insurance claim strategy
4. Key talking points you'll want to emphasize

Keep it brief and focused on what matters for guiding the conversation.`;
        const response = await client.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: prompt,
        });
        return response.text ?? '';
    }
    // --------------------------------------------------------------------------
    // SLIDE NARRATION
    // --------------------------------------------------------------------------
    /**
     * Generate narration for a specific slide
     */
    async generateSlideNarration(sessionId, slideIndex) {
        const session = this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        const slide = session.slides[slideIndex];
        if (!slide) {
            throw new Error(`Slide ${slideIndex} not found in session`);
        }
        const client = this.ensureGemini();
        // Build context from previous conversation
        const recentConversation = session.conversationHistory
            .slice(-5)
            .map(msg => `${msg.speaker}: ${msg.message}`)
            .join('\n');
        const prompt = `${this.SUSAN_PERSONA}

**Session Context:**
${session.susanContext}

**Homeowner:** ${session.homeownerName}
**Property:** ${session.propertyAddress}
**Current Slide:** ${slideIndex + 1} of ${session.slides.length}

**Recent Conversation:**
${recentConversation || 'Just starting the presentation'}

**Slide Information:**
Title: ${slide.title}
Type: ${slide.type}
${slide.damageAssessment ? `
Damage Analysis:
- Type: ${slide.damageAssessment.analysis.damageType.join(', ')}
- Severity: ${slide.damageAssessment.analysis.severity}
- Location: ${slide.damageAssessment.analysis.affectedArea}
- Size: ${slide.damageAssessment.analysis.estimatedSize}
- Insurance Arguments: ${slide.damageAssessment.analysis.insuranceArguments.join('; ')}
- Policy Language: ${slide.damageAssessment.analysis.policyLanguage}
` : ''}

**Your Task:**
Create a natural, conversational narration for this slide. Speak as if you're sitting at the kitchen table with the homeowner, walking them through the findings.

**Guidelines:**
- Start with a brief, engaging hook
- Explain what the homeowner is looking at (if there's an image)
- Highlight the key findings in simple terms
- Connect this to the insurance claim process
- End with a smooth transition phrase
- Keep it conversational, not formal or sales-y

**Output Format (JSON):**
{
  "narrationText": "The full narration (2-3 paragraphs)",
  "keyPoints": ["Point 1", "Point 2", "Point 3"],
  "transitionPhrase": "Smooth transition to next topic/slide",
  "anticipatedQuestions": ["Question 1", "Question 2"]
}`;
        const response = await client.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: prompt,
        });
        const text = response.text ?? '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Failed to parse slide narration response');
        }
        const data = JSON.parse(jsonMatch[0]);
        return {
            slideId: slide.id,
            narrationText: data.narrationText,
            keyPoints: data.keyPoints || [],
            transitionPhrase: data.transitionPhrase || '',
            anticipatedQuestions: data.anticipatedQuestions || [],
        };
    }
    /**
     * Explain the current slide in detail
     */
    async explainCurrentSlide(sessionId, slideIndex, specificFocus) {
        const session = this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        const slide = session.slides[slideIndex];
        const client = this.ensureGemini();
        const focusBlock = specificFocus
            ? `\n**Homeowner wants to know more about:** ${specificFocus}\n`
            : '';
        const prompt = `${this.SUSAN_PERSONA}

${session.susanContext}

The homeowner (${session.homeownerName}) wants a deeper explanation of this slide:

**Slide:** ${slide.title}
${focusBlock}
${slide.damageAssessment ? `
**Damage Details:**
${JSON.stringify(slide.damageAssessment.analysis, null, 2)}
` : ''}

Provide a clear, detailed explanation that:
1. Breaks down what they're seeing in the image (if applicable)
2. Explains why this matters for their insurance claim
3. Addresses common concerns about this type of damage
4. Provides reassurance where appropriate

Keep it conversational and empathetic. Limit to 3-4 paragraphs.`;
        const response = await client.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: prompt,
        });
        const explanation = response.text ?? '';
        // Add to conversation history
        this.addToHistory(sessionId, {
            timestamp: new Date(),
            speaker: 'susan',
            message: explanation,
            slideIndex,
            intent: 'clarification_request',
        });
        return explanation;
    }
    // --------------------------------------------------------------------------
    // QUESTION ANSWERING
    // --------------------------------------------------------------------------
    /**
     * Answer a homeowner's question with full context
     */
    async answerQuestion(sessionId, question, currentSlideIndex) {
        const session = this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        const client = this.ensureGemini();
        // Build conversation context
        const conversationContext = session.conversationHistory
            .slice(-10)
            .map(msg => `${msg.speaker}: ${msg.message}`)
            .join('\n');
        // Identify relevant slides
        const allSlideInfo = session.slides.map((slide, idx) => ({
            index: idx,
            title: slide.title,
            type: slide.type,
            hasDamage: !!slide.damageAssessment,
            summary: slide.damageAssessment
                ? `${slide.damageAssessment.analysis.damageType.join(', ')} - ${slide.damageAssessment.analysis.severity}`
                : slide.content?.substring(0, 100),
        }));
        const prompt = `${this.SUSAN_PERSONA}

**Session Context:**
${session.susanContext}

**Current Slide:** ${currentSlideIndex + 1} of ${session.slides.length}
**Homeowner:** ${session.homeownerName}

**Recent Conversation:**
${conversationContext || 'This is the first question'}

**All Slides in Presentation:**
${JSON.stringify(allSlideInfo, null, 2)}

**Homeowner's Question:**
"${question}"

**Your Task:**
Answer this question thoroughly but conversationally.

**Output Format (JSON):**
{
  "answer": "Your conversational answer (2-3 paragraphs)",
  "relatedSlides": [array of slide indices where this info appears],
  "followUpSuggestion": "A natural follow-up or next topic",
  "confidence": 95,
  "intent": "question_damage|question_cost|question_insurance|question_timeline|clarification_request"
}`;
        const response = await client.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: prompt,
        });
        const text = response.text ?? '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Failed to parse question response');
        }
        const data = JSON.parse(jsonMatch[0]);
        const questionResponse = {
            question,
            answer: data.answer,
            relatedSlides: data.relatedSlides || [],
            followUpSuggestion: data.followUpSuggestion || '',
            confidence: data.confidence || 85,
        };
        // Add to conversation history
        this.addToHistory(sessionId, {
            timestamp: new Date(),
            speaker: 'homeowner',
            message: question,
            slideIndex: currentSlideIndex,
            intent: data.intent,
        });
        this.addToHistory(sessionId, {
            timestamp: new Date(),
            speaker: 'susan',
            message: questionResponse.answer,
            slideIndex: currentSlideIndex,
            intent: data.intent,
        });
        return questionResponse;
    }
    // --------------------------------------------------------------------------
    // OBJECTION HANDLING
    // --------------------------------------------------------------------------
    /**
     * Handle homeowner objections with empathy and evidence
     */
    async handleObjection(sessionId, objection, currentSlideIndex) {
        const session = this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        const client = this.ensureGemini();
        // Track this concern
        if (!session.homeownerConcerns.includes(objection)) {
            session.homeownerConcerns.push(objection);
            this.saveSession(session);
        }
        const conversationContext = session.conversationHistory
            .slice(-8)
            .map(msg => `${msg.speaker}: ${msg.message}`)
            .join('\n');
        const currentSlide = session.slides[currentSlideIndex];
        const prompt = `${this.SUSAN_PERSONA}

**Session Context:**
${session.susanContext}

**Homeowner:** ${session.homeownerName}
**Current Slide:** ${currentSlide.title}

**Recent Conversation:**
${conversationContext}

**Homeowner's Objection/Concern:**
"${objection}"

**Your Task:**
Address this objection with empathy, evidence, and reassurance. Remember: you're not trying to "overcome" an objection like a salesperson - you're helping a concerned homeowner understand their situation.

**Strategy:**
1. Acknowledge their concern (validate the emotion)
2. Provide evidence or context that addresses it
3. Reframe if helpful (show a different perspective)
4. Offer concrete next steps

**Output Format (JSON):**
{
  "response": "Your empathetic, evidence-based response (2-3 paragraphs)",
  "supportingEvidence": ["Evidence point 1", "Evidence point 2"],
  "alternativeFraming": "A helpful reframe of the concern",
  "nextSteps": ["Action step 1", "Action step 2"],
  "objectionType": "objection_cost|objection_need|objection_timing|objection_insurance"
}`;
        const response = await client.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: prompt,
        });
        const text = response.text ?? '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Failed to parse objection response');
        }
        const data = JSON.parse(jsonMatch[0]);
        const objectionResponse = {
            objection,
            response: data.response,
            supportingEvidence: data.supportingEvidence || [],
            alternativeFraming: data.alternativeFraming || '',
            nextSteps: data.nextSteps || [],
        };
        // Add to conversation history
        this.addToHistory(sessionId, {
            timestamp: new Date(),
            speaker: 'homeowner',
            message: objection,
            slideIndex: currentSlideIndex,
            intent: data.objectionType,
        });
        this.addToHistory(sessionId, {
            timestamp: new Date(),
            speaker: 'susan',
            message: objectionResponse.response,
            slideIndex: currentSlideIndex,
            intent: data.objectionType,
        });
        return objectionResponse;
    }
    // --------------------------------------------------------------------------
    // CONVERSATION MANAGEMENT
    // --------------------------------------------------------------------------
    /**
     * Add message to conversation history
     */
    addToHistory(sessionId, message) {
        const session = this.getSession(sessionId);
        if (!session)
            return;
        session.conversationHistory.push(message);
        this.saveSession(session);
    }
    /**
     * Get conversation summary for the session
     */
    async getConversationSummary(sessionId) {
        const session = this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        const client = this.ensureGemini();
        const conversation = session.conversationHistory
            .map(msg => `${msg.speaker}: ${msg.message}`)
            .join('\n');
        const prompt = `Summarize this presentation conversation in 3-4 bullet points, focusing on:
1. Main concerns discussed
2. Key insurance points addressed
3. Homeowner's overall sentiment
4. Outstanding questions or next steps

Conversation:
${conversation}`;
        const response = await client.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: prompt,
        });
        return response.text ?? '';
    }
    // --------------------------------------------------------------------------
    // PERSISTENCE
    // --------------------------------------------------------------------------
    saveSession(session) {
        try {
            const sessions = this.loadAllSessions();
            sessions[session.id] = session;
            localStorage.setItem('susan_presentation_sessions', JSON.stringify(sessions));
        }
        catch (error) {
            console.error('Failed to save presentation session:', error);
        }
    }
    loadSession(sessionId) {
        try {
            const sessions = this.loadAllSessions();
            const session = sessions[sessionId];
            if (session) {
                // Convert date strings back to Date objects
                session.startTime = new Date(session.startTime);
                session.conversationHistory = session.conversationHistory.map(msg => ({
                    ...msg,
                    timestamp: new Date(msg.timestamp),
                }));
            }
            return session || null;
        }
        catch (error) {
            console.error('Failed to load presentation session:', error);
            return null;
        }
    }
    loadAllSessions() {
        try {
            const saved = localStorage.getItem('susan_presentation_sessions');
            return saved ? JSON.parse(saved) : {};
        }
        catch {
            return {};
        }
    }
    /**
     * Get all active sessions
     */
    getAllActiveSessions() {
        const sessions = this.loadAllSessions();
        return Object.values(sessions).filter(s => s.status === 'active');
    }
    /**
     * Delete a session
     */
    deleteSession(sessionId) {
        this.activeSessions.delete(sessionId);
        const sessions = this.loadAllSessions();
        delete sessions[sessionId];
        localStorage.setItem('susan_presentation_sessions', JSON.stringify(sessions));
    }
    // --------------------------------------------------------------------------
    // UTILITIES
    // --------------------------------------------------------------------------
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
     * Export session transcript
     */
    exportSessionTranscript(sessionId) {
        const session = this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        let transcript = `# Inspection Presentation Transcript

**Property:** ${session.propertyAddress}
**Homeowner:** ${session.homeownerName}
**Date:** ${session.startTime.toLocaleString()}
**Duration:** ${this.calculateDuration(session)}
**Status:** ${session.status}

---

## Conversation

`;
        session.conversationHistory.forEach((msg, idx) => {
            const speaker = msg.speaker === 'susan' ? 'Susan (AI Assistant)' :
                msg.speaker === 'homeowner' ? session.homeownerName :
                    'Sales Rep';
            transcript += `### ${idx + 1}. ${speaker} - ${msg.timestamp.toLocaleTimeString()}
Slide: ${msg.slideIndex + 1} - ${session.slides[msg.slideIndex]?.title}

${msg.message}

---

`;
        });
        transcript += `## Key Concerns Addressed

${session.homeownerConcerns.map((c, i) => `${i + 1}. ${c}`).join('\n')}

---

*Generated by Susan AI Presenter - Gemini Field Assistant*
`;
        return transcript;
    }
    calculateDuration(session) {
        const lastMessage = session.conversationHistory[session.conversationHistory.length - 1];
        if (!lastMessage)
            return '0 minutes';
        const duration = lastMessage.timestamp.getTime() - session.startTime.getTime();
        const minutes = Math.floor(duration / 60000);
        return `${minutes} minutes`;
    }
}
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
export const susanPresenterService = new SusanPresenterService();
// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================
/**
 * Initialize a new presentation session
 */
export async function initPresentation(presentationId, slides, propertyAddress, homeownerName) {
    return susanPresenterService.initPresentationSession(presentationId, slides, propertyAddress, homeownerName);
}
/**
 * Generate slide narration
 */
export async function narrateSlide(sessionId, slideIndex) {
    return susanPresenterService.generateSlideNarration(sessionId, slideIndex);
}
/**
 * Answer a question
 */
export async function askSusan(sessionId, question, currentSlideIndex) {
    return susanPresenterService.answerQuestion(sessionId, question, currentSlideIndex);
}
/**
 * Handle an objection
 */
export async function addressConcern(sessionId, objection, currentSlideIndex) {
    return susanPresenterService.handleObjection(sessionId, objection, currentSlideIndex);
}
/**
 * Get current session
 */
export function getSessionById(sessionId) {
    return susanPresenterService.getSession(sessionId);
}
/**
 * Complete a session
 */
export function finishPresentation(sessionId) {
    susanPresenterService.completeSession(sessionId);
}
/**
 * Export transcript
 */
export function exportTranscript(sessionId) {
    return susanPresenterService.exportSessionTranscript(sessionId);
}
