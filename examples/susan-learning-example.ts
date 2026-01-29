/**
 * Susan AI Learning System - Usage Examples
 *
 * This file demonstrates how Susan learns from interactions and uses
 * that knowledge to provide better responses.
 */

import { memoryService } from '../services/memoryService';

// ============================================================================
// EXAMPLE 1: Susan Learns from Conversation Feedback
// ============================================================================

async function example1_ConversationLearning() {
  console.log('=== EXAMPLE 1: Conversation Learning ===\n');

  // User asks a question
  const userQuery = "How do I handle a partial approval in Maryland for State Farm?";

  // Susan responds
  const susanResponse = `Partial approval in MD? Here's the contractor documentation strategy [1.1][2.3]:

**Step 1: Contractor Code Requirements [1.1]**
MD building codes require contractors to ensure uniform appearance across roof planes. As the licensed contractor, you cannot perform work that violates these requirements.

**Step 2: Technical Documentation Package [3.2]**
- Photos showing full extent of damage
- Manufacturer discontinuation letter
- IRC R908.3 code section reference

**Step 3: Contractor-Compliant Language [2.1]**
"As the licensed contractor, building codes require that I ensure uniform appearance. I am unable to perform a partial repair that would create code violations. Mr./Ms. [Homeowner] has asked me to share this technical documentation with you."`;

  // User gives thumbs up with positive tags
  await memoryService.learnFromOutcome('msg-123', {
    sessionId: 'session-456',
    userQuery,
    susanResponse,
    userFeedback: 1, // thumbs up
    feedbackTags: ['Clear', 'Actionable', 'Great citations'],
    situation: 'partial_approval_md',
    state: 'MD',
    insurer: 'State Farm',
    wasHelpful: true,
    timestamp: new Date().toISOString(),
  });

  console.log('✅ Susan learned from positive feedback:');
  console.log('   - IRC R908.3 approach works for MD partial approvals');
  console.log('   - Step-by-step format is clear and actionable');
  console.log('   - Strong citations are appreciated');
  console.log('   - State Farm responds well to code citations\n');

  // Next time Susan sees a similar question
  const patterns = await memoryService.getSuccessPatterns('partial_approval_md');
  console.log('📚 Susan recalls success patterns:');
  patterns.forEach((pattern, i) => {
    console.log(`   ${i + 1}. ${pattern.substring(0, 100)}...`);
  });
  console.log('');
}

// ============================================================================
// EXAMPLE 2: Susan Learns from Storm Lookups
// ============================================================================

async function example2_StormDataLearning() {
  console.log('=== EXAMPLE 2: Storm Data Learning ===\n');

  // User requests storm history
  const address = "123 Main St, Vienna, VA 22182";

  // Susan looks up and saves verified data
  await memoryService.saveStormMemory({
    address,
    city: "Vienna",
    state: "VA",
    zip: "22182",
    events: [
      {
        date: "2024-03-15",
        type: "hail",
        size: "1.5\"",
        source: "IHM",
        certified: false,
      },
      {
        date: "2024-06-22",
        type: "hail",
        magnitude: "2.00",
        source: "NOAA",
        certified: true,
      }
    ],
    lookupDate: new Date().toISOString(),
    verified: true,
  });

  console.log('✅ Susan saved storm data for:', address);
  console.log('   - 2 hail events verified');
  console.log('   - 1 from IHM, 1 from NOAA');
  console.log('');

  // Later, user asks about nearby address
  const nearbyAddress = "125 Main St, Vienna, VA 22182";
  console.log('User asks about nearby address:', nearbyAddress);

  const stormData = await memoryService.getStormMemory("123 Main St, Vienna, VA");
  if (stormData) {
    console.log('📍 Susan recalls storm data from nearby:');
    console.log(`   - ${stormData.events.length} events at ${stormData.address}`);
    console.log('   - Can reference this in response without re-fetching');
  }
  console.log('');
}

// ============================================================================
// EXAMPLE 3: Susan Learns from Email Outcomes
// ============================================================================

async function example3_EmailPatternLearning() {
  console.log('=== EXAMPLE 3: Email Pattern Learning ===\n');

  // User generates an email
  console.log('User generates email for partial approval in MD...');

  const patternId = await memoryService.saveEmailPattern({
    emailType: 'adjuster',
    situation: 'partial_approval_md',
    insurer: 'State Farm',
    state: 'MD',
    templateUsed: 'As the licensed contractor, building codes require...',
    outcome: 'pending',
    sentDate: new Date().toISOString(),
  });

  console.log('✅ Susan tracked email pattern:', patternId.substring(0, 8));
  console.log('   - Initial confidence: 50% (neutral)\n');

  // A week later, user reports success
  console.log('One week later: User reports claim approved! 🎉\n');

  await memoryService.updateEmailOutcome(patternId, {
    success: true,
    responseReceived: true,
    claimWon: true,
    feedbackRating: 1,
  });

  console.log('✅ Susan updated email outcome:');
  console.log('   - Confidence increased: 70% → Success confirmed');
  console.log('   - Pattern reinforced for future use');
  console.log('');

  // Next time user asks for similar email
  console.log('Next time similar situation:');
  const successfulPatterns = await memoryService.getSuccessfulEmailPatterns(
    'partial_approval',
    'MD',
    'State Farm'
  );

  if (successfulPatterns.length > 0) {
    console.log('📧 Susan suggests proven template:');
    console.log(`   - ${successfulPatterns[0].templateUsed.substring(0, 80)}...`);
    console.log(`   - Success rate: ${(successfulPatterns[0].outcome === 'success' ? 'High' : 'Unknown')}`);
  }
  console.log('');
}

// ============================================================================
// EXAMPLE 4: Susan Uses Context to Personalize Response
// ============================================================================

async function example4_ContextualResponse() {
  console.log('=== EXAMPLE 4: Contextual Response ===\n');

  // User has these facts in memory
  await memoryService.saveMemories([
    {
      memory_type: 'fact',
      category: 'state',
      key: 'primary_state',
      value: 'MD',
      confidence: 0.9,
      source_type: 'conversation',
    },
    {
      memory_type: 'preference',
      category: 'style',
      key: 'response_style',
      value: 'concise',
      confidence: 0.85,
      source_type: 'conversation',
    },
    {
      memory_type: 'fact',
      category: 'insurer',
      key: 'common_insurer',
      value: 'State Farm',
      confidence: 0.8,
      source_type: 'conversation',
    },
  ]);

  console.log('✅ Susan has learned about this user:');
  console.log('   - Works primarily in Maryland');
  console.log('   - Prefers concise responses');
  console.log('   - Frequently works with State Farm\n');

  // User asks a general question
  const query = "How should I handle this claim?";
  console.log('User asks:', query, '\n');

  // Susan queries her memory for context
  const context = await memoryService.getRelevantMemoriesForContext({
    query,
    state: 'MD',
    insurer: 'State Farm',
  });

  console.log('🧠 Susan recalls relevant context:');
  console.log(`   - ${context.facts.length} user facts`);
  console.log(`   - ${context.successPatterns.length} success patterns`);
  console.log(`   - ${context.emailPatterns.length} proven email templates\n`);

  console.log('💬 Susan responds with personalization:');
  console.log('   "Since you work primarily in Maryland and this is');
  console.log('   State Farm, here\'s the quick version (I know you');
  console.log('   prefer concise responses):"');
  console.log('   ');
  console.log('   [Uses MD-specific code citations]');
  console.log('   [References State Farm patterns]');
  console.log('   [Keeps response brief]\n');
}

// ============================================================================
// EXAMPLE 5: Team Learning (Aggregated Patterns)
// ============================================================================

async function example5_TeamLearning() {
  console.log('=== EXAMPLE 5: Team Learning ===\n');

  // Multiple users have success with IRC R908.3 in Maryland
  console.log('Pattern emerges across team:');
  console.log('   - User A: IRC R908.3 approach → Success (State Farm)');
  console.log('   - User B: IRC R908.3 approach → Success (USAA)');
  console.log('   - User C: IRC R908.3 approach → Success (Allstate)\n');

  // Susan identifies this as a team-wide success pattern
  console.log('🌟 Susan identifies team success pattern:');
  console.log('   "IRC R908.3 citation works consistently for MD');
  console.log('   partial approvals across multiple insurers"\n');

  // Susan can now suggest this to all users
  console.log('💡 Susan suggests to new user:');
  console.log('   "Based on team success, the IRC R908.3 approach');
  console.log('   has worked well for Maryland partial approvals.');
  console.log('   Here\'s the proven strategy..."\n');
}

// ============================================================================
// RUN ALL EXAMPLES
// ============================================================================

async function runAllExamples() {
  try {
    await example1_ConversationLearning();
    await example2_StormDataLearning();
    await example3_EmailPatternLearning();
    await example4_ContextualResponse();
    await example5_TeamLearning();

    console.log('='.repeat(60));
    console.log('🎓 Susan has learned from all these interactions!');
    console.log('');
    console.log('What Susan now knows:');
    console.log('✓ What response formats work best');
    console.log('✓ Which code citations are effective');
    console.log('✓ Verified storm data for quick reference');
    console.log('✓ Successful email templates by situation');
    console.log('✓ User preferences and working patterns');
    console.log('✓ Insurer-specific strategies');
    console.log('');
    console.log('Result: Faster, smarter, more personalized assistance!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Export for use
export {
  example1_ConversationLearning,
  example2_StormDataLearning,
  example3_EmailPatternLearning,
  example4_ContextualResponse,
  example5_TeamLearning,
  runAllExamples,
};

// Run if executed directly
if (require.main === module) {
  runAllExamples();
}
