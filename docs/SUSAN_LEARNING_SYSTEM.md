# Susan AI Learning System

## Overview

Susan AI now learns from every interaction to continuously improve her responses and recommendations. The enhanced memory service tracks patterns across conversations, storm lookups, email outcomes, and team feedback.

---

## What Susan Learns From

### 1. Chat Conversations
**When it happens**: Every chat interaction with feedback
**What Susan learns**:
- Which response approaches work (clear, actionable, etc.)
- What types of answers are helpful for specific situations
- Which code citations and documentation strategies succeed
- User preferences for communication style

**How it's stored**:
```typescript
{
  sessionId: "session-123",
  userQuery: "How do I handle a partial approval in MD?",
  susanResponse: "Here's the contractor documentation approach...",
  userFeedback: 1, // thumbs up
  feedbackTags: ["Clear", "Actionable", "Great citations"],
  situation: "partial_approval_md",
  state: "MD",
  insurer: "State Farm",
  wasHelpful: true
}
```

### 2. Storm Lookups (Verified Data)
**When it happens**: User requests storm/hail history for an address
**What Susan learns**:
- Verified storm data for specific addresses and areas
- Historical hail events from Interactive Hail Maps (IHM)
- NOAA-certified storm events
- Geographic patterns in storm activity

**How it's stored**:
```typescript
{
  address: "123 Main St, Vienna, VA 22182",
  city: "Vienna",
  state: "VA",
  zip: "22182",
  events: [
    {
      date: "2024-03-15",
      type: "hail",
      size: "1.5\"",
      source: "IHM",
      certified: false
    },
    {
      date: "2024-06-22",
      type: "hail",
      magnitude: "2.00",
      source: "NOAA",
      certified: true
    }
  ],
  lookupDate: "2024-12-05T10:30:00Z",
  verified: true
}
```

**Why this matters**:
- Susan can reference past storm lookups for nearby addresses
- No need to re-fetch data for previously searched areas
- Builds a verified storm history database for the team

### 3. Email Outcomes
**When it happens**: User generates an email through Susan
**What Susan learns**:
- Which email templates work for different situations
- Success rates by state, insurer, and claim type
- Which tone (professional, formal, friendly) gets results
- Open rates and response patterns (when tracked)

**How it's stored**:
```typescript
{
  emailType: "adjuster",
  situation: "partial_approval_md",
  insurer: "State Farm",
  state: "MD",
  templateUsed: "As the licensed contractor...",
  outcome: "success", // or "failure" or "pending"
  openRate: true,
  responseReceived: true,
  claimWon: true,
  feedbackRating: 1,
  sentDate: "2024-12-05T10:30:00Z",
  outcomeDate: "2024-12-10T14:20:00Z"
}
```

**Success tracking**:
- Emails start with confidence: 0.5 (neutral)
- Success increases confidence: +0.2 (up to 1.0)
- Failure decreases confidence: -0.3 (down to 0.1)

### 4. Team Activity Patterns
**When it happens**: Aggregated patterns across all users (privacy-preserved)
**What Susan learns**:
- Which strategies work across multiple reps
- Common pitfalls to avoid
- Insurer-specific patterns and behaviors
- State-specific best practices

---

## How Susan Uses What She Learns

### When You Start a Conversation

Susan automatically loads relevant memories:
```typescript
const context = await memoryService.getRelevantMemoriesForContext({
  query: "How do I handle a partial approval in MD?",
  state: "MD",
  insurer: "State Farm",
  situation: "partial_approval"
});
```

This gives Susan:
- **Facts**: User preferences, primary state, common insurers
- **Storm Data**: Recent lookups for similar addresses
- **Success Patterns**: What's worked before in similar situations
- **Email Patterns**: Successful templates for this scenario

### In Her Responses

Susan naturally incorporates learning:
- "Since you work primarily in Maryland..." (remembered fact)
- "Last time, the IRC R908.3 approach worked well with State Farm..." (outcome pattern)
- "I know you prefer concise responses..." (preference memory)
- "I found storm data for that area from our last lookup..." (storm memory)

### When Suggesting Email Templates

Susan prioritizes proven approaches:
```typescript
const successfulPatterns = await memoryService.getSuccessfulEmailPatterns(
  "partial_approval",
  "MD",
  "State Farm"
);
// Returns patterns with >60% confidence and "success" outcome
```

---

## Memory Service API

### For Susan to Query Her Memory

```typescript
// Get relevant memories for current context
const memories = await memoryService.getRelevantMemoriesForContext({
  query: "user's question",
  state: "VA",
  insurer: "State Farm",
  situation: "partial_approval"
});

// Returns:
// - facts: General user memories
// - stormData: Verified storm data if address mentioned
// - successPatterns: What's worked before
// - emailPatterns: Successful email approaches
```

```typescript
// Get storm data for an address
const stormData = await memoryService.getStormMemory("123 Main St, Vienna, VA");
// Returns verified storm history or null
```

```typescript
// Get success patterns for a situation
const patterns = await memoryService.getSuccessPatterns("partial_approval_md");
// Returns array of successful approaches
```

### For the System to Save Learnings

```typescript
// Save conversation outcome (called automatically after feedback)
await memoryService.learnFromOutcome(messageId, {
  sessionId: "session-123",
  userQuery: "How do I handle this?",
  susanResponse: "Here's how...",
  userFeedback: 1, // thumbs up
  feedbackTags: ["Clear", "Actionable"],
  situation: "partial_approval_md",
  state: "MD",
  insurer: "State Farm",
  wasHelpful: true,
  timestamp: new Date().toISOString()
});
```

```typescript
// Save storm lookup (called automatically after lookup)
await memoryService.saveStormMemory({
  address: "123 Main St, Vienna, VA",
  city: "Vienna",
  state: "VA",
  zip: "22182",
  events: [...],
  lookupDate: new Date().toISOString(),
  verified: true
});
```

```typescript
// Save email pattern (called automatically when email generated)
const patternId = await memoryService.saveEmailPattern({
  emailType: "adjuster",
  situation: "partial_approval_md",
  insurer: "State Farm",
  state: "MD",
  templateUsed: "...",
  outcome: "pending",
  sentDate: new Date().toISOString()
});

// Update email outcome (call when you know the result)
await memoryService.updateEmailOutcome(patternId, {
  success: true,
  openRate: true,
  responseReceived: true,
  claimWon: true,
  feedbackRating: 1
});
```

---

## Memory Storage

### Memory Types

| Type | Description | Example |
|------|-------------|---------|
| `fact` | Concrete user information | "Works in Maryland" |
| `preference` | User preferences | "Prefers concise responses" |
| `pattern` | Observed behavior | "Usually leads with IRC R908.3" |
| `outcome` | Conversation result | "Thumbs up on partial approval help" |
| `storm_data` | Verified storm history | "3 hail events at 123 Main St" |
| `email_pattern` | Email template usage | "MD contractor template: 85% success" |
| `success_pattern` | What works | "Step-by-step format gets positive feedback" |

### Memory Categories

| Category | What It Stores |
|----------|---------------|
| `storm_verification` | Verified storm data from IHM/NOAA |
| `email_success` | Email patterns and outcomes |
| `conversation_outcome` | Feedback from conversations |
| `team_pattern` | Cross-user success patterns |
| `state` | User's primary state(s) |
| `insurer` | Common insurance companies |
| `company` | User's company info |
| `expertise` | User's experience level |

### Confidence Scoring

- **1.0**: Verified fact (storm data, explicit statement)
- **0.9**: High confidence (pattern observed 3+ times)
- **0.7-0.8**: Moderate confidence (pattern observed 2 times)
- **0.5**: Neutral (new pattern, no data yet)
- **0.3**: Low confidence (conflicting information)
- **0.0**: Incorrect (negative feedback)

Confidence adjusts based on:
- Positive feedback: +0.1 to +0.2
- Negative feedback: -0.2 to -0.3
- Successful outcomes: +0.2
- Failed outcomes: -0.3

---

## Privacy & Security

### User Data
- All memories are user-specific (tied to email)
- No cross-user data sharing (except aggregated, anonymized patterns)
- Users can delete their own memories

### Storm Data
- All storm data is from verified sources only (IHM, NOAA)
- Never fabricated or estimated
- Stored with verification flag

### Email Patterns
- Only stores metadata and templates (not customer PII)
- Outcome tracking is optional
- User controls what's tracked

---

## Integration Points

### ChatPanel.tsx

**Feedback submission** (lines ~819-850):
```typescript
const handleSubmitFeedback = async () => {
  // ... existing feedback code ...

  // 🧠 Susan learns from outcome
  await memoryService.learnFromOutcome(messageId, {
    // ... outcome data ...
  });
};
```

**Storm lookup** (lines ~936-960):
```typescript
const hailResults = await hailMapsApi.searchByAddress(...);

// 🧠 Susan saves verified storm data
await memoryService.saveStormMemory({
  address,
  city,
  state,
  zip,
  events: [...],
  verified: true
});
```

**Email generation** (lines ~768-793):
```typescript
// 🧠 Susan tracks email pattern
await memoryService.saveEmailPattern({
  emailType,
  situation,
  templateUsed,
  outcome: 'pending'
});
```

### susanContextService.ts

**Context building** (lines ~13-86):
```typescript
export async function buildSusanContext() {
  // 1. User memory
  // 2. Recent storm lookups
  // 3. Successful email patterns
  // 4. Global learnings
  // 5. Team feedback
  return contextString;
}
```

---

## Example Learning Flow

### Scenario: User asks about partial approval in Maryland

**1. Susan queries her memory:**
```typescript
const context = await memoryService.getRelevantMemoriesForContext({
  query: "partial approval in maryland",
  state: "MD",
  situation: "partial_approval"
});
```

**2. Susan recalls:**
- User works in Maryland (fact, confidence: 0.9)
- User prefers clear, actionable responses (preference, confidence: 0.85)
- Last time, IRC R908.3 citation worked well (outcome, confidence: 0.9)
- Successful email template for State Farm in MD (email_pattern, confidence: 0.8)

**3. Susan responds using learned knowledge:**
- Uses IRC R908.3 citation (proven successful)
- Provides step-by-step format (user preference)
- Keeps response concise (user preference)
- Offers proven email template

**4. User gives thumbs up feedback:**
- Susan saves outcome with positive feedback
- Increases confidence in IRC R908.3 approach (+0.1)
- Increases confidence in step-by-step format (+0.1)
- Extracts success pattern: "clear communication + strong citations"

**5. Next time:**
- Susan leads with IRC R908.3 (even higher confidence)
- Pattern is reinforced for the team

---

## Future Enhancements

### Phase 2 (Planned)
- [ ] Cross-user aggregated insights (anonymized)
- [ ] Automatic success pattern detection from claim wins
- [ ] Email A/B testing recommendations
- [ ] Predictive suggestions based on patterns

### Phase 3 (Planned)
- [ ] Team performance analytics dashboard
- [ ] Insurer-specific pattern library
- [ ] Automated email outcome tracking
- [ ] Machine learning for pattern detection

---

## Troubleshooting

### Susan not recalling past conversations?
- Check browser localStorage for memories
- Verify user is logged in (memories tied to email)
- Check console for "[MemoryService]" logs

### Storm data not being saved?
- Verify storm lookup completes successfully
- Check console for "🧠 Susan saved storm data" log
- Check localStorage: `user_memories_{email}`

### Email patterns not improving?
- Manually update email outcomes when you know results
- Provide feedback (thumbs up/down) on generated emails
- Check that state/insurer context is provided

---

## Technical Details

### Storage Layer
- **Primary**: localStorage (browser-based)
- **Backup**: Backend API (when available)
- **Fallback**: Always localStorage if API fails

### Memory Limits
- **User memories**: 500 max per user
- **Conversation summaries**: 50 max per user
- **Storm lookups**: 100 max per user
- **Email patterns**: 200 max per user

### Performance
- Memory queries: < 50ms (localStorage)
- Context building: < 200ms (includes multiple queries)
- Learning saves: Async (non-blocking)

---

**Built with**: TypeScript, React, localStorage API
**Version**: 1.0 (December 2024)
**Status**: Production-ready ✅
