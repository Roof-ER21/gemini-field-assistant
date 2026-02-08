/**
 * Susan AI Presenter Service - Type Definitions
 * Centralized type exports for easy importing
 */

import { DamageAssessment } from './imageAnalysisService';

// ============================================================================
// PRESENTATION TYPES
// ============================================================================

/**
 * Type of slide in the presentation
 */
export type SlideType = 'cover' | 'damage' | 'summary' | 'recommendation' | 'contact';

/**
 * Individual slide in a presentation
 */
export interface PresentationSlide {
  id: string;
  type: SlideType;
  title: string;
  content?: string;
  imageUrl?: string;
  imageName?: string;
  damageAssessment?: DamageAssessment;
  order: number;
}

/**
 * Status of a presentation session
 */
export type SessionStatus = 'active' | 'paused' | 'completed';

/**
 * Complete presentation session with Susan
 */
export interface PresentationSession {
  id: string;
  presentationId: string;
  propertyAddress: string;
  homeownerName: string;
  startTime: Date;
  currentSlideIndex: number;
  slides: PresentationSlide[];
  conversationHistory: ConversationMessage[];
  susanContext: string;
  homeownerConcerns: string[];
  status: SessionStatus;
}

// ============================================================================
// CONVERSATION TYPES
// ============================================================================

/**
 * Intent classification for messages
 */
export type MessageIntent =
  | 'question_damage'         // Questions about the damage itself
  | 'question_cost'           // Questions about cost/pricing
  | 'question_insurance'      // Questions about insurance coverage
  | 'question_timeline'       // Questions about timing/schedule
  | 'objection_cost'          // Cost-related objections
  | 'objection_need'          // Questioning necessity of work
  | 'objection_timing'        // Timing/urgency objections
  | 'objection_insurance'     // Insurance-related concerns
  | 'clarification_request'   // Asking for more explanation
  | 'acknowledgment';         // Simple acknowledgment

/**
 * Speaker in the conversation
 */
export type Speaker = 'homeowner' | 'susan' | 'rep';

/**
 * Individual message in conversation history
 */
export interface ConversationMessage {
  timestamp: Date;
  speaker: Speaker;
  message: string;
  slideIndex: number;
  intent?: MessageIntent;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Susan's narration for a slide
 */
export interface SlideNarration {
  slideId: string;
  narrationText: string;
  keyPoints: string[];
  transitionPhrase: string;
  anticipatedQuestions: string[];
}

/**
 * Response to a homeowner question
 */
export interface QuestionResponse {
  question: string;
  answer: string;
  relatedSlides: number[];
  followUpSuggestion: string;
  confidence: number;
}

/**
 * Response to a homeowner objection/concern
 */
export interface ObjectionResponse {
  objection: string;
  response: string;
  supportingEvidence: string[];
  alternativeFraming: string;
  nextSteps: string[];
}

// ============================================================================
// SERVICE CONFIGURATION
// ============================================================================

/**
 * Configuration options for Susan service
 */
export interface SusanServiceConfig {
  apiKey?: string;
  model?: string;
  maxConversationHistory?: number;
  enableVoice?: boolean;
  voiceConfig?: VoiceConfig;
}

/**
 * Voice configuration for TTS
 */
export interface VoiceConfig {
  voiceName?: string;
  language?: string;
  speed?: number;
  pitch?: number;
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

/**
 * Analytics data for a presentation session
 */
export interface SessionAnalytics {
  sessionId: string;
  duration: number; // milliseconds
  slidesViewed: number;
  questionsAsked: number;
  objectionsHandled: number;
  concernsTracked: string[];
  mostViewedSlide: number;
  averageTimePerSlide: number;
  engagementScore: number; // 0-100
}

/**
 * Common question patterns for analytics
 */
export interface QuestionPattern {
  question: string;
  frequency: number;
  averageConfidence: number;
  commonFollowUps: string[];
}

/**
 * Common objection patterns for analytics
 */
export interface ObjectionPattern {
  objection: string;
  frequency: number;
  successfulResponses: string[];
  averageResolutionTime: number;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Susan service error types
 */
export type SusanErrorType =
  | 'API_KEY_MISSING'
  | 'API_KEY_INVALID'
  | 'RATE_LIMIT_EXCEEDED'
  | 'SESSION_NOT_FOUND'
  | 'SLIDE_NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Susan service error
 */
export interface SusanError {
  type: SusanErrorType;
  message: string;
  details?: any;
  timestamp: Date;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Partial session update
 */
export type SessionUpdate = Partial<Omit<PresentationSession, 'id' | 'presentationId' | 'startTime'>>;

/**
 * Session summary
 */
export interface SessionSummary {
  sessionId: string;
  homeownerName: string;
  propertyAddress: string;
  duration: string;
  totalSlides: number;
  questionsAnswered: number;
  concernsAddressed: number;
  status: SessionStatus;
}

/**
 * Transcript export options
 */
export interface TranscriptExportOptions {
  format?: 'markdown' | 'pdf' | 'json';
  includeImages?: boolean;
  includeTimestamps?: boolean;
  includeSusanContext?: boolean;
}

// ============================================================================
// PROPS TYPES FOR COMPONENTS
// ============================================================================

/**
 * Props for SusanPresenter component
 */
export interface SusanPresenterProps {
  presentationId: string;
  slides: PresentationSlide[];
  propertyAddress: string;
  homeownerName: string;
  onComplete?: (sessionId: string) => void;
  onError?: (error: SusanError) => void;
  voiceEnabled?: boolean;
  autoNarrate?: boolean;
}

/**
 * Props for SlideDisplay component
 */
export interface SlideDisplayProps {
  slide: PresentationSlide;
  slideIndex: number;
  totalSlides: number;
  onNext?: () => void;
  onPrevious?: () => void;
}

/**
 * Props for SusanPanel component
 */
export interface SusanPanelProps {
  sessionId: string;
  currentSlideIndex: number;
  onQuestionAsked?: (question: string) => void;
  onObjectionHandled?: (objection: string) => void;
  voiceEnabled?: boolean;
}

/**
 * Props for ConversationHistory component
 */
export interface ConversationHistoryProps {
  messages: ConversationMessage[];
  slides: PresentationSlide[];
  onMessageClick?: (message: ConversationMessage) => void;
}

// ============================================================================
// STATE TYPES FOR REACT
// ============================================================================

/**
 * Presentation state for React components
 */
export interface PresentationState {
  session: PresentationSession | null;
  currentSlide: number;
  loading: boolean;
  error: SusanError | null;
  narration: SlideNarration | null;
  userInput: string;
  susanResponse: string;
  voiceEnabled: boolean;
}

/**
 * Actions for presentation state reducer
 */
export type PresentationAction =
  | { type: 'INIT_SESSION'; payload: PresentationSession }
  | { type: 'SET_SLIDE'; payload: number }
  | { type: 'SET_NARRATION'; payload: SlideNarration }
  | { type: 'SET_RESPONSE'; payload: string }
  | { type: 'SET_USER_INPUT'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: SusanError }
  | { type: 'TOGGLE_VOICE' }
  | { type: 'CLEAR_RESPONSE' }
  | { type: 'COMPLETE_SESSION' };

// ============================================================================
// HOOKS TYPES
// ============================================================================

/**
 * Return type for useSusanPresenter hook
 */
export interface UseSusanPresenterReturn {
  session: PresentationSession | null;
  currentSlide: number;
  narration: SlideNarration | null;
  susanResponse: string;
  loading: boolean;
  error: SusanError | null;
  nextSlide: () => void;
  previousSlide: () => void;
  askQuestion: (question: string) => Promise<void>;
  handleObjection: (objection: string) => Promise<void>;
  completePresentation: () => void;
  exportTranscript: () => string;
}

/**
 * Options for useSusanPresenter hook
 */
export interface UseSusanPresenterOptions {
  autoNarrate?: boolean;
  voiceEnabled?: boolean;
  preloadNarrations?: boolean;
  onComplete?: (sessionId: string) => void;
  onError?: (error: SusanError) => void;
}

// ============================================================================
// EXPORT ALL TYPES
// ============================================================================

export type {
  DamageAssessment,
};

// Re-export for convenience
export * from './imageAnalysisService';
