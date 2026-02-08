/**
 * Susan AI Presenter Service - Test Suite
 * Demonstrates functionality and validates behavior
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
// MOCK DATA
// ============================================================================

const mockDamageAssessment: DamageAssessment = {
  id: 'assess_123',
  timestamp: new Date(),
  imageUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
  imageName: 'roof_damage_north_slope.jpg',
  analysis: {
    damageDetected: true,
    damageType: ['hail', 'wind'],
    severity: 'severe',
    affectedArea: 'North-facing slope, ridge area',
    estimatedSize: '400 sq ft (approximately 30% of total roof area)',
    recommendations: [
      'Document shingle manufacturer and model',
      'Photograph from multiple angles',
      'Check for matching shingles availability',
      'File insurance claim immediately',
    ],
    urgency: 'high',
    insuranceArguments: [
      'Multiple shingles showing granule loss and bruising consistent with hail impact',
      'Damage exceeds 30% of total roof area - triggers replacement under most policies',
      'Shingles are discontinued (2018 GAF Timberline HD) - IRC R908.3 requires matching',
      'Wind uplift damage visible on ridge shingles - covered peril under storm clause',
    ],
    claimViability: 'strong',
    policyLanguage: 'The covered perils of hail and windstorm have caused severe impact damage to 30% of the roof area, requiring full replacement due to discontinued materials and matching requirements per IRC R908.3',
  },
  followUpQuestions: [
    'What year was the roof installed?',
    'Do you have the original shingle wrapper or warranty paperwork?',
    'When did the storm occur? Do you have the exact date?',
    'Have you filed any previous claims on this roof?',
  ],
  rawResponse: 'Detailed analysis showing severe hail damage requiring full replacement...',
  confidence: 92,
  conversationHistory: [],
};

const mockSlides: PresentationSlide[] = [
  {
    id: 'slide_0',
    type: 'cover',
    title: 'Roof Inspection Report',
    content: '123 Main St, Baltimore, MD 21201',
    order: 0,
  },
  {
    id: 'slide_1',
    type: 'damage',
    title: 'North Slope - Hail Damage',
    imageUrl: mockDamageAssessment.imageUrl,
    imageName: mockDamageAssessment.imageName,
    damageAssessment: mockDamageAssessment,
    order: 1,
  },
  {
    id: 'slide_2',
    type: 'summary',
    title: 'Summary & Next Steps',
    content: 'Total damage areas: 1, Severity: Severe, Claim viability: Strong',
    order: 2,
  },
];

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Susan AI Presenter Service', () => {
  let sessionId: string;

  // --------------------------------------------------------------------------
  // TEST 1: Session Initialization
  // --------------------------------------------------------------------------

  test('should initialize presentation session', async () => {
    console.log('\n=== TEST 1: Initialize Session ===\n');

    const session = await initPresentation(
      'presentation_test_123',
      mockSlides,
      '123 Main St, Baltimore, MD 21201',
      'John Smith'
    );

    expect(session).toBeDefined();
    expect(session.homeownerName).toBe('John Smith');
    expect(session.propertyAddress).toBe('123 Main St, Baltimore, MD 21201');
    expect(session.slides).toHaveLength(3);
    expect(session.status).toBe('active');
    expect(session.susanContext).toBeTruthy();

    console.log('✓ Session initialized successfully');
    console.log(`  Session ID: ${session.id}`);
    console.log(`  Homeowner: ${session.homeownerName}`);
    console.log(`  Slides: ${session.slides.length}`);
    console.log(`  Susan's Context: ${session.susanContext.substring(0, 100)}...`);

    sessionId = session.id;
  }, 30000); // 30 second timeout

  // --------------------------------------------------------------------------
  // TEST 2: Slide Narration
  // --------------------------------------------------------------------------

  test('should generate slide narration', async () => {
    console.log('\n=== TEST 2: Generate Narration ===\n');

    const session = getSessionById(sessionId);
    expect(session).toBeDefined();

    const narration = await narrateSlide(sessionId, 1);

    expect(narration).toBeDefined();
    expect(narration.narrationText).toBeTruthy();
    expect(narration.keyPoints).toBeInstanceOf(Array);
    expect(narration.keyPoints.length).toBeGreaterThan(0);
    expect(narration.transitionPhrase).toBeTruthy();
    expect(narration.anticipatedQuestions).toBeInstanceOf(Array);

    console.log('✓ Narration generated successfully');
    console.log(`\nSlide: ${mockSlides[1].title}`);
    console.log(`\nSusan's Narration:`);
    console.log(narration.narrationText);
    console.log(`\nKey Points:`);
    narration.keyPoints.forEach((point, idx) => {
      console.log(`  ${idx + 1}. ${point}`);
    });
    console.log(`\nTransition:`);
    console.log(`  "${narration.transitionPhrase}"`);
    console.log(`\nAnticipated Questions:`);
    narration.anticipatedQuestions.forEach((q, idx) => {
      console.log(`  ${idx + 1}. ${q}`);
    });
  }, 30000);

  // --------------------------------------------------------------------------
  // TEST 3: Question Answering
  // --------------------------------------------------------------------------

  test('should answer homeowner questions', async () => {
    console.log('\n=== TEST 3: Answer Questions ===\n');

    const questions = [
      'Will my insurance cover this?',
      'How much is this going to cost?',
      'Do I really need to replace the whole roof?',
    ];

    for (const question of questions) {
      console.log(`\n--- Question: "${question}" ---\n`);

      const response = await askSusan(sessionId, question, 1);

      expect(response).toBeDefined();
      expect(response.answer).toBeTruthy();
      expect(response.confidence).toBeGreaterThan(0);
      expect(response.relatedSlides).toBeInstanceOf(Array);

      console.log('Susan\'s Answer:');
      console.log(response.answer);
      console.log(`\nConfidence: ${response.confidence}%`);

      if (response.relatedSlides.length > 0) {
        console.log(`\nRelated Slides: ${response.relatedSlides.join(', ')}`);
      }

      console.log(`\nFollow-up Suggestion:`);
      console.log(response.followUpSuggestion);
    }

    // Check conversation history
    const session = getSessionById(sessionId);
    expect(session?.conversationHistory.length).toBeGreaterThan(0);

    console.log('\n✓ All questions answered successfully');
    console.log(`\nConversation History: ${session?.conversationHistory.length} messages`);
  }, 60000);

  // --------------------------------------------------------------------------
  // TEST 4: Objection Handling
  // --------------------------------------------------------------------------

  test('should handle homeowner objections', async () => {
    console.log('\n=== TEST 4: Handle Objections ===\n');

    const objections = [
      'This seems really expensive. I don\'t know if I can afford it.',
      'Can\'t you just patch the damaged area instead of replacing everything?',
    ];

    for (const objection of objections) {
      console.log(`\n--- Objection: "${objection}" ---\n`);

      const response = await addressConcern(sessionId, objection, 1);

      expect(response).toBeDefined();
      expect(response.response).toBeTruthy();
      expect(response.supportingEvidence).toBeInstanceOf(Array);
      expect(response.nextSteps).toBeInstanceOf(Array);

      console.log('Susan\'s Response:');
      console.log(response.response);
      console.log(`\nSupporting Evidence:`);
      response.supportingEvidence.forEach((ev, idx) => {
        console.log(`  ${idx + 1}. ${ev}`);
      });
      console.log(`\nAlternative Framing:`);
      console.log(response.alternativeFraming);
      console.log(`\nNext Steps:`);
      response.nextSteps.forEach((step, idx) => {
        console.log(`  ${idx + 1}. ${step}`);
      });
    }

    // Check concerns tracking
    const session = getSessionById(sessionId);
    expect(session?.homeownerConcerns.length).toBeGreaterThan(0);

    console.log('\n✓ All objections handled successfully');
    console.log(`\nTracked Concerns: ${session?.homeownerConcerns.length}`);
  }, 60000);

  // --------------------------------------------------------------------------
  // TEST 5: Session Retrieval
  // --------------------------------------------------------------------------

  test('should retrieve existing session', () => {
    console.log('\n=== TEST 5: Session Retrieval ===\n');

    const session = getSessionById(sessionId);

    expect(session).toBeDefined();
    expect(session?.id).toBe(sessionId);
    expect(session?.conversationHistory.length).toBeGreaterThan(0);

    console.log('✓ Session retrieved successfully');
    console.log(`  Session ID: ${session?.id}`);
    console.log(`  Status: ${session?.status}`);
    console.log(`  Messages: ${session?.conversationHistory.length}`);
    console.log(`  Concerns: ${session?.homeownerConcerns.length}`);
  });

  // --------------------------------------------------------------------------
  // TEST 6: Session Completion
  // --------------------------------------------------------------------------

  test('should complete presentation session', () => {
    console.log('\n=== TEST 6: Complete Session ===\n');

    finishPresentation(sessionId);

    const session = getSessionById(sessionId);
    expect(session?.status).toBe('completed');

    console.log('✓ Session completed successfully');
    console.log(`  Final Status: ${session?.status}`);
  });

  // --------------------------------------------------------------------------
  // TEST 7: Transcript Export
  // --------------------------------------------------------------------------

  test('should export session transcript', () => {
    console.log('\n=== TEST 7: Export Transcript ===\n');

    const transcript = exportTranscript(sessionId);

    expect(transcript).toBeTruthy();
    expect(transcript).toContain('Inspection Presentation Transcript');
    expect(transcript).toContain('John Smith');
    expect(transcript).toContain('123 Main St, Baltimore, MD 21201');

    console.log('✓ Transcript exported successfully');
    console.log(`  Length: ${transcript.length} characters`);
    console.log(`\n--- TRANSCRIPT PREVIEW ---`);
    console.log(transcript.substring(0, 500) + '...\n');
  });

  // --------------------------------------------------------------------------
  // TEST 8: Multiple Sessions
  // --------------------------------------------------------------------------

  test('should handle multiple concurrent sessions', async () => {
    console.log('\n=== TEST 8: Multiple Sessions ===\n');

    const session1 = await initPresentation(
      'pres_multi_1',
      mockSlides,
      '456 Oak Ave, Washington, DC',
      'Jane Doe'
    );

    const session2 = await initPresentation(
      'pres_multi_2',
      mockSlides,
      '789 Pine St, Richmond, VA',
      'Bob Johnson'
    );

    expect(session1).toBeDefined();
    expect(session2).toBeDefined();
    expect(session1.id).not.toBe(session2.id);

    console.log('✓ Multiple sessions created successfully');
    console.log(`  Session 1: ${session1.homeownerName} at ${session1.propertyAddress}`);
    console.log(`  Session 2: ${session2.homeownerName} at ${session2.propertyAddress}`);

    // Clean up
    finishPresentation(session1.id);
    finishPresentation(session2.id);
  }, 30000);

  // --------------------------------------------------------------------------
  // TEST 9: Error Handling
  // --------------------------------------------------------------------------

  test('should handle invalid session gracefully', () => {
    console.log('\n=== TEST 9: Error Handling ===\n');

    const invalidSession = getSessionById('invalid_session_id');
    expect(invalidSession).toBeNull();

    console.log('✓ Invalid session handled gracefully');
    console.log('  Returns null for non-existent session');
  });

  // --------------------------------------------------------------------------
  // TEST 10: Conversation Context
  // --------------------------------------------------------------------------

  test('should maintain conversation context', async () => {
    console.log('\n=== TEST 10: Conversation Context ===\n');

    const session = await initPresentation(
      'pres_context_test',
      mockSlides,
      '321 Elm St, Baltimore, MD',
      'Sarah Wilson'
    );

    // First question
    await askSusan(session.id, 'What is hail damage?', 1);

    // Follow-up that requires context
    const response = await askSusan(
      session.id,
      'How does that relate to what you just showed me?',
      1
    );

    expect(response).toBeDefined();
    expect(response.answer).toBeTruthy();

    const updatedSession = getSessionById(session.id);
    expect(updatedSession?.conversationHistory.length).toBe(4); // 2 questions + 2 answers

    console.log('✓ Context maintained across questions');
    console.log(`  Messages in history: ${updatedSession?.conversationHistory.length}`);
    console.log('\nSusan\'s contextual response:');
    console.log(response.answer);

    finishPresentation(session.id);
  }, 60000);
});

// ============================================================================
// MANUAL TEST RUNNER (For browser console)
// ============================================================================

export async function runManualTest() {
  console.log('🎯 Starting Susan AI Presenter Manual Test\n');

  try {
    // Test 1: Initialize
    console.log('Step 1: Initializing presentation...');
    const session = await initPresentation(
      'manual_test_' + Date.now(),
      mockSlides,
      '123 Main St, Baltimore, MD 21201',
      'Test User'
    );
    console.log('✓ Session initialized:', session.id);

    // Test 2: Narrate
    console.log('\nStep 2: Generating narration...');
    const narration = await narrateSlide(session.id, 1);
    console.log('✓ Narration generated');
    console.log(narration.narrationText);

    // Test 3: Question
    console.log('\nStep 3: Asking question...');
    const qResponse = await askSusan(
      session.id,
      'Will insurance cover this?',
      1
    );
    console.log('✓ Question answered');
    console.log(qResponse.answer);

    // Test 4: Objection
    console.log('\nStep 4: Handling objection...');
    const oResponse = await addressConcern(
      session.id,
      'This seems expensive',
      1
    );
    console.log('✓ Objection handled');
    console.log(oResponse.response);

    // Test 5: Export
    console.log('\nStep 5: Exporting transcript...');
    finishPresentation(session.id);
    const transcript = exportTranscript(session.id);
    console.log('✓ Transcript exported');
    console.log(`Length: ${transcript.length} characters`);

    console.log('\n✅ All manual tests passed!');
    return { success: true, sessionId: session.id };
  } catch (error) {
    console.error('❌ Manual test failed:', error);
    return { success: false, error };
  }
}

// ============================================================================
// PERFORMANCE TEST
// ============================================================================

export async function performanceTest() {
  console.log('⚡ Starting Performance Test\n');

  const startTime = Date.now();
  const timings: Record<string, number> = {};

  try {
    // Test init speed
    let start = Date.now();
    const session = await initPresentation(
      'perf_test_' + Date.now(),
      mockSlides,
      '123 Main St',
      'Test User'
    );
    timings.init = Date.now() - start;

    // Test narration speed
    start = Date.now();
    await narrateSlide(session.id, 1);
    timings.narration = Date.now() - start;

    // Test question speed
    start = Date.now();
    await askSusan(session.id, 'Test question?', 1);
    timings.question = Date.now() - start;

    // Test objection speed
    start = Date.now();
    await addressConcern(session.id, 'Test objection', 1);
    timings.objection = Date.now() - start;

    // Test export speed
    start = Date.now();
    finishPresentation(session.id);
    exportTranscript(session.id);
    timings.export = Date.now() - start;

    const totalTime = Date.now() - startTime;

    console.log('Performance Results:');
    console.log(`  Init:      ${timings.init}ms`);
    console.log(`  Narration: ${timings.narration}ms`);
    console.log(`  Question:  ${timings.question}ms`);
    console.log(`  Objection: ${timings.objection}ms`);
    console.log(`  Export:    ${timings.export}ms`);
    console.log(`  Total:     ${totalTime}ms`);

    return { success: true, timings, totalTime };
  } catch (error) {
    console.error('Performance test failed:', error);
    return { success: false, error };
  }
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  (window as any).susanTest = {
    runManualTest,
    performanceTest,
  };
}
