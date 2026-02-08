/**
 * Susan AI Presenter Service - Usage Examples
 * Demonstrates how to integrate Susan into the Inspection Presentation feature
 */

import {
  initPresentation,
  narrateSlide,
  askSusan,
  addressConcern,
  getSessionById,
  finishPresentation,
  exportTranscript,
  PresentationSlide,
  PresentationSession,
} from './susanPresenterService';
import { DamageAssessment } from './imageAnalysisService';

// ============================================================================
// EXAMPLE 1: INITIALIZE PRESENTATION SESSION
// ============================================================================

export async function exampleInitializePresentation() {
  // Assume you have damage assessments from image analysis
  const damageAssessments: DamageAssessment[] = [
    // ... your assessments from imageAnalysisService.analyzeRoofImage()
  ];

  // Create presentation slides from assessments
  const slides: PresentationSlide[] = [
    // Cover slide
    {
      id: 'slide_0',
      type: 'cover',
      title: 'Roof Inspection Report',
      content: '123 Main St, Baltimore, MD',
      order: 0,
    },
    // Damage slides
    ...damageAssessments.map((assessment, idx) => ({
      id: `slide_${idx + 1}`,
      type: 'damage' as const,
      title: assessment.analysis.affectedArea,
      imageUrl: assessment.imageUrl,
      imageName: assessment.imageName,
      damageAssessment: assessment,
      order: idx + 1,
    })),
    // Summary slide
    {
      id: `slide_${damageAssessments.length + 1}`,
      type: 'summary' as const,
      title: 'Summary & Next Steps',
      content: 'Review of all findings and insurance claim strategy',
      order: damageAssessments.length + 1,
    },
  ];

  // Initialize session with Susan
  const session = await initPresentation(
    'presentation_123',
    slides,
    '123 Main St, Baltimore, MD 21201',
    'John Smith'
  );

  console.log('Susan is ready for presentation:', session.id);
  console.log('Susan\'s initial context:', session.susanContext);

  return session;
}

// ============================================================================
// EXAMPLE 2: GENERATE AUTO-NARRATION FOR SLIDES
// ============================================================================

export async function exampleAutoNarration(sessionId: string) {
  const session = getSessionById(sessionId);
  if (!session) throw new Error('Session not found');

  // Generate narration for each slide
  for (let i = 0; i < session.slides.length; i++) {
    const narration = await narrateSlide(sessionId, i);

    console.log(`\n=== Slide ${i + 1}: ${session.slides[i].title} ===`);
    console.log('\nNarration:');
    console.log(narration.narrationText);
    console.log('\nKey Points:');
    narration.keyPoints.forEach(point => console.log(`- ${point}`));
    console.log('\nTransition:');
    console.log(narration.transitionPhrase);
    console.log('\nAnticipated Questions:');
    narration.anticipatedQuestions.forEach(q => console.log(`- ${q}`));

    // Optionally: Use text-to-speech to read narration
    // await speakText(narration.narrationText);
  }
}

// ============================================================================
// EXAMPLE 3: HANDLE HOMEOWNER QUESTIONS
// ============================================================================

export async function exampleAnswerQuestions(sessionId: string) {
  const session = getSessionById(sessionId);
  if (!session) throw new Error('Session not found');

  // Example questions homeowners might ask
  const questions = [
    'How much is this going to cost?',
    'Will my insurance cover all of this?',
    'How long will the repairs take?',
    'Can you explain what hail damage looks like?',
    'Do I really need to replace the whole roof?',
  ];

  for (const question of questions) {
    console.log(`\n=== Homeowner asks: "${question}" ===`);

    const response = await askSusan(sessionId, question, session.currentSlideIndex);

    console.log('\nSusan\'s Answer:');
    console.log(response.answer);
    console.log('\nConfidence:', response.confidence + '%');

    if (response.relatedSlides.length > 0) {
      console.log('\nRelated Slides:');
      response.relatedSlides.forEach(idx => {
        console.log(`- Slide ${idx + 1}: ${session.slides[idx].title}`);
      });
    }

    console.log('\nFollow-up Suggestion:');
    console.log(response.followUpSuggestion);
  }
}

// ============================================================================
// EXAMPLE 4: HANDLE OBJECTIONS
// ============================================================================

export async function exampleHandleObjections(sessionId: string) {
  const session = getSessionById(sessionId);
  if (!session) throw new Error('Session not found');

  // Common homeowner objections
  const objections = [
    'This seems really expensive. I don\'t know if I can afford it.',
    'I\'m not sure if I really need a full replacement. Can\'t you just patch it?',
    'My insurance company is going to fight me on this, aren\'t they?',
    'I need to think about this. This is a big decision.',
  ];

  for (const objection of objections) {
    console.log(`\n=== Homeowner concern: "${objection}" ===`);

    const response = await addressConcern(sessionId, objection, session.currentSlideIndex);

    console.log('\nSusan\'s Response:');
    console.log(response.response);
    console.log('\nSupporting Evidence:');
    response.supportingEvidence.forEach(evidence => console.log(`- ${evidence}`));
    console.log('\nAlternative Framing:');
    console.log(response.alternativeFraming);
    console.log('\nNext Steps:');
    response.nextSteps.forEach(step => console.log(`- ${step}`));
  }
}

// ============================================================================
// EXAMPLE 5: REACT COMPONENT INTEGRATION
// ============================================================================

export const SusanPresenterExample = () => {
  /*
  import React, { useState, useEffect } from 'react';
  import {
    initPresentation,
    narrateSlide,
    askSusan,
    PresentationSession
  } from './services/susanPresenterService';

  const InspectionPresentation: React.FC = () => {
    const [session, setSession] = useState<PresentationSession | null>(null);
    const [currentSlide, setCurrentSlide] = useState(0);
    const [narration, setNarration] = useState<string>('');
    const [userQuestion, setUserQuestion] = useState('');
    const [susanResponse, setSusanResponse] = useState<string>('');
    const [loading, setLoading] = useState(false);

    // Initialize presentation
    useEffect(() => {
      const initSession = async () => {
        const slides = prepareSlides(); // Your slide preparation logic
        const newSession = await initPresentation(
          'pres_123',
          slides,
          '123 Main St, Baltimore, MD',
          'John Smith'
        );
        setSession(newSession);
      };
      initSession();
    }, []);

    // Auto-generate narration when slide changes
    useEffect(() => {
      if (!session) return;

      const loadNarration = async () => {
        setLoading(true);
        const slideNarration = await narrateSlide(session.id, currentSlide);
        setNarration(slideNarration.narrationText);
        setLoading(false);
      };

      loadNarration();
    }, [currentSlide, session]);

    // Handle homeowner questions
    const handleQuestionSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!session || !userQuestion.trim()) return;

      setLoading(true);
      const response = await askSusan(session.id, userQuestion, currentSlide);
      setSusanResponse(response.answer);
      setUserQuestion('');
      setLoading(false);
    };

    // Navigation
    const nextSlide = () => {
      if (session && currentSlide < session.slides.length - 1) {
        setCurrentSlide(currentSlide + 1);
        setSusanResponse('');
      }
    };

    const prevSlide = () => {
      if (currentSlide > 0) {
        setCurrentSlide(currentSlide - 1);
        setSusanResponse('');
      }
    };

    if (!session) return <div>Loading presentation...</div>;

    const slide = session.slides[currentSlide];

    return (
      <div className="presentation-container">
        {/* Slide Display *\/}
        <div className="slide-content">
          <h2>{slide.title}</h2>
          {slide.imageUrl && (
            <img src={slide.imageUrl} alt={slide.title} />
          )}
          {slide.damageAssessment && (
            <div className="damage-details">
              <p><strong>Damage Type:</strong> {slide.damageAssessment.analysis.damageType.join(', ')}</p>
              <p><strong>Severity:</strong> {slide.damageAssessment.analysis.severity}</p>
              <p><strong>Location:</strong> {slide.damageAssessment.analysis.affectedArea}</p>
            </div>
          )}
        </div>

        {/* Susan's Narration *\/}
        <div className="susan-narration">
          <h3>Susan's Explanation:</h3>
          {loading ? (
            <p>Susan is thinking...</p>
          ) : (
            <p>{narration}</p>
          )}
        </div>

        {/* Q&A Interface *\/}
        <div className="question-interface">
          <h3>Ask Susan a Question</h3>
          <form onSubmit={handleQuestionSubmit}>
            <input
              type="text"
              value={userQuestion}
              onChange={(e) => setUserQuestion(e.target.value)}
              placeholder="e.g., Will insurance cover this?"
              disabled={loading}
            />
            <button type="submit" disabled={loading}>
              Ask Susan
            </button>
          </form>
          {susanResponse && (
            <div className="susan-response">
              <strong>Susan:</strong>
              <p>{susanResponse}</p>
            </div>
          )}
        </div>

        {/* Navigation *\/}
        <div className="navigation">
          <button onClick={prevSlide} disabled={currentSlide === 0}>
            Previous
          </button>
          <span>Slide {currentSlide + 1} of {session.slides.length}</span>
          <button onClick={nextSlide} disabled={currentSlide === session.slides.length - 1}>
            Next
          </button>
        </div>
      </div>
    );
  };

  export default InspectionPresentation;
  */
};

// ============================================================================
// EXAMPLE 6: VOICE INTEGRATION (with TTS)
// ============================================================================

export async function exampleVoicePresentation(sessionId: string) {
  const session = getSessionById(sessionId);
  if (!session) throw new Error('Session not found');

  // Simulate voice-enabled presentation
  for (let i = 0; i < session.slides.length; i++) {
    console.log(`\n--- Presenting Slide ${i + 1} ---`);

    // Generate narration
    const narration = await narrateSlide(sessionId, i);

    // In a real app, use text-to-speech here:
    // await speakText(narration.narrationText, { voice: 'Aoede' });
    console.log('Susan says:', narration.narrationText);

    // Wait for user input (voice or text)
    console.log('\n[Listening for homeowner questions...]');

    // Example: homeowner asks a question
    const question = 'Can you explain that again?';
    const response = await askSusan(sessionId, question, i);

    // Speak the response
    // await speakText(response.answer, { voice: 'Aoede' });
    console.log('Susan responds:', response.answer);

    // Transition to next slide
    console.log('\nSusan:', narration.transitionPhrase);
    // await speakText(narration.transitionPhrase, { voice: 'Aoede' });
  }
}

// ============================================================================
// EXAMPLE 7: EXPORT SESSION TRANSCRIPT
// ============================================================================

export function exampleExportTranscript(sessionId: string) {
  const transcript = exportTranscript(sessionId);

  console.log(transcript);

  // In a real app, download as file
  const blob = new Blob([transcript], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `presentation_transcript_${sessionId}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

// ============================================================================
// EXAMPLE 8: REAL-TIME CONVERSATION FLOW
// ============================================================================

export async function exampleRealTimeConversation(sessionId: string) {
  const session = getSessionById(sessionId);
  if (!session) throw new Error('Session not found');

  let currentSlide = 0;

  // Simulate a real conversation during presentation
  const conversationFlow = [
    { type: 'narrate', slideIndex: 0 },
    { type: 'question', text: 'What exactly is hail damage?', slideIndex: 0 },
    { type: 'narrate', slideIndex: 1 },
    { type: 'objection', text: 'This looks minor. Do I really need to replace it?', slideIndex: 1 },
    { type: 'narrate', slideIndex: 2 },
    { type: 'question', text: 'Will insurance cover all of this?', slideIndex: 2 },
  ];

  for (const action of conversationFlow) {
    console.log(`\n${'='.repeat(60)}`);

    if (action.type === 'narrate') {
      const narration = await narrateSlide(sessionId, action.slideIndex);
      console.log(`\n[Slide ${action.slideIndex + 1}] Susan presents:`);
      console.log(narration.narrationText);
      currentSlide = action.slideIndex;
    } else if (action.type === 'question') {
      console.log(`\nHomeowner: "${action.text}"`);
      const response = await askSusan(sessionId, action.text, action.slideIndex);
      console.log(`\nSusan: ${response.answer}`);
      currentSlide = action.slideIndex;
    } else if (action.type === 'objection') {
      console.log(`\nHomeowner (concerned): "${action.text}"`);
      const response = await addressConcern(sessionId, action.text, action.slideIndex);
      console.log(`\nSusan (empathetic): ${response.response}`);
      console.log('\nSusan adds:');
      response.nextSteps.forEach(step => console.log(`- ${step}`));
      currentSlide = action.slideIndex;
    }

    // Pause between interactions
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('\nPresentation complete!');

  // Finish session
  finishPresentation(sessionId);

  // Export transcript
  const transcript = exportTranscript(sessionId);
  console.log('\n--- TRANSCRIPT GENERATED ---');
  console.log(`Length: ${transcript.length} characters`);
}

// ============================================================================
// EXAMPLE 9: MULTI-SESSION MANAGEMENT
// ============================================================================

export async function exampleMultipleSessionManagement() {
  // Create multiple sessions
  const session1 = await initPresentation(
    'pres_1',
    [], // slides
    '123 Main St, Baltimore, MD',
    'John Smith'
  );

  const session2 = await initPresentation(
    'pres_2',
    [], // slides
    '456 Oak Ave, Washington, DC',
    'Jane Doe'
  );

  console.log('Active Sessions:');
  console.log('- Session 1:', session1.id, '-', session1.homeownerName);
  console.log('- Session 2:', session2.id, '-', session2.homeownerName);

  // Switch between sessions
  const currentSession1 = getSessionById(session1.id);
  const currentSession2 = getSessionById(session2.id);

  console.log('\nSession 1 Status:', currentSession1?.status);
  console.log('Session 2 Status:', currentSession2?.status);

  // Complete sessions when done
  finishPresentation(session1.id);
  console.log('\nSession 1 completed');

  const updatedSession1 = getSessionById(session1.id);
  console.log('Updated Status:', updatedSession1?.status);
}

// ============================================================================
// HELPER: PREPARE SLIDES FROM ASSESSMENTS
// ============================================================================

export function prepareSlides(
  assessments: DamageAssessment[],
  propertyAddress: string
): PresentationSlide[] {
  const slides: PresentationSlide[] = [
    // Cover slide
    {
      id: 'slide_cover',
      type: 'cover',
      title: 'Roof Inspection Report',
      content: propertyAddress,
      order: 0,
    },
    // Damage slides
    ...assessments.map((assessment, idx) => ({
      id: `slide_damage_${idx}`,
      type: 'damage' as const,
      title: assessment.analysis.affectedArea || `Damage Area ${idx + 1}`,
      imageUrl: assessment.imageUrl,
      imageName: assessment.imageName,
      damageAssessment: assessment,
      order: idx + 1,
    })),
    // Summary slide
    {
      id: 'slide_summary',
      type: 'summary' as const,
      title: 'Summary & Next Steps',
      content: `
Total Damage Areas: ${assessments.length}
Severe Issues: ${assessments.filter(a => a.analysis.severity === 'severe' || a.analysis.severity === 'critical').length}

Next Steps:
1. File insurance claim
2. Schedule adjuster visit
3. Obtain repair estimates
4. Review insurance coverage
      `,
      order: assessments.length + 1,
    },
    // Contact slide
    {
      id: 'slide_contact',
      type: 'contact' as const,
      title: 'Questions?',
      content: `
Thank you for your time today!

Roof-ER Contact Information:
Phone: (555) 123-4567
Email: info@roofer.com

We're here to help you through the entire insurance claim process.
      `,
      order: assessments.length + 2,
    },
  ];

  return slides;
}
