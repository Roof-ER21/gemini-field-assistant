# Susan AI Presenter Service

## Overview

The Susan AI Presenter Service provides intelligent, conversational assistance during inspection presentations. Susan is a friendly, professional insurance claims specialist with 15+ years of experience who helps homeowners understand their roof inspection findings and navigate the insurance claims process.

## Key Features

1. **Contextual Slide Narration** - Auto-generates natural, conversational explanations for each slide
2. **Real-Time Q&A** - Answers homeowner questions with full presentation context
3. **Objection Handling** - Addresses concerns with empathy and evidence
4. **Conversation Memory** - Maintains full conversation history throughout the presentation
5. **Session Management** - Supports multiple concurrent presentations
6. **Transcript Export** - Generates detailed conversation transcripts

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Susan AI Presenter Service                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Session    │  │  Narration   │  │  Question    │     │
│  │  Management  │  │  Generator   │  │   Handler    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Objection   │  │ Conversation │  │  Transcript  │     │
│  │   Handler    │  │   History    │  │   Exporter   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                    Google Gemini 2.0                         │
└─────────────────────────────────────────────────────────────┘
```

## Installation

No installation required. The service is ready to use in the Gemini Field Assistant project.

**Dependencies:**
- `@google/genai` - Gemini AI SDK
- `imageAnalysisService.ts` - For damage assessment types
- `env.ts` - For API key configuration

**Configuration:**
Ensure `GEMINI_API_KEY` is set in your environment variables.

## Quick Start

### 1. Initialize a Presentation Session

```typescript
import { initPresentation, PresentationSlide } from './services/susanPresenterService';
import { analyzeRoofImage } from './services/imageAnalysisService';

// Analyze images first
const assessments = await Promise.all(
  imageFiles.map(file => analyzeRoofImage(file))
);

// Create slides from assessments
const slides: PresentationSlide[] = [
  {
    id: 'slide_0',
    type: 'cover',
    title: 'Roof Inspection Report',
    content: '123 Main St, Baltimore, MD',
    order: 0,
  },
  ...assessments.map((assessment, idx) => ({
    id: `slide_${idx + 1}`,
    type: 'damage' as const,
    title: assessment.analysis.affectedArea,
    imageUrl: assessment.imageUrl,
    imageName: assessment.imageName,
    damageAssessment: assessment,
    order: idx + 1,
  })),
];

// Initialize Susan
const session = await initPresentation(
  'presentation_123',
  slides,
  '123 Main St, Baltimore, MD 21201',
  'John Smith'
);
```

### 2. Generate Slide Narration

```typescript
import { narrateSlide } from './services/susanPresenterService';

const narration = await narrateSlide(session.id, 0);

console.log(narration.narrationText);
// "Good afternoon, John! Let's start by looking at your roof inspection...

console.log(narration.keyPoints);
// ["Hail damage detected on north slope", "Shingles are brittle", ...]

console.log(narration.transitionPhrase);
// "Now, let me show you the specific areas where we found damage..."
```

### 3. Answer Homeowner Questions

```typescript
import { askSusan } from './services/susanPresenterService';

const response = await askSusan(
  session.id,
  'Will my insurance cover this?',
  currentSlideIndex
);

console.log(response.answer);
// "That's a great question, John. Based on what we're seeing here...

console.log(response.relatedSlides);
// [1, 3, 5] - Slides where insurance info is relevant

console.log(response.followUpSuggestion);
// "Would you like me to explain how to phrase this for your adjuster?"
```

### 4. Handle Objections

```typescript
import { addressConcern } from './services/susanPresenterService';

const response = await addressConcern(
  session.id,
  'This seems really expensive. I don\'t know if I can afford it.',
  currentSlideIndex
);

console.log(response.response);
// "I completely understand that concern, John. The good news is...

console.log(response.supportingEvidence);
// ["Insurance typically covers storm damage", "Financing options available", ...]

console.log(response.nextSteps);
// ["File insurance claim", "Get repair estimate", ...]
```

### 5. Export Transcript

```typescript
import { exportTranscript, finishPresentation } from './services/susanPresenterService';

// Complete the presentation
finishPresentation(session.id);

// Export full transcript
const transcript = exportTranscript(session.id);

// Download as file
const blob = new Blob([transcript], { type: 'text/markdown' });
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = `transcript_${session.id}.md`;
link.click();
```

## API Reference

### Core Functions

#### `initPresentation()`
Initialize a new presentation session with Susan.

```typescript
function initPresentation(
  presentationId: string,
  slides: PresentationSlide[],
  propertyAddress: string,
  homeownerName: string
): Promise<PresentationSession>
```

**Parameters:**
- `presentationId` - Unique identifier for the presentation
- `slides` - Array of presentation slides with damage assessments
- `propertyAddress` - Full property address
- `homeownerName` - Homeowner's name for personalization

**Returns:** Promise resolving to initialized session

---

#### `narrateSlide()`
Generate conversational narration for a slide.

```typescript
function narrateSlide(
  sessionId: string,
  slideIndex: number
): Promise<SlideNarration>
```

**Parameters:**
- `sessionId` - Active session identifier
- `slideIndex` - Index of slide to narrate (0-based)

**Returns:** Promise resolving to narration with key points and transitions

---

#### `askSusan()`
Answer a homeowner's question with full context.

```typescript
function askSusan(
  sessionId: string,
  question: string,
  currentSlideIndex: number
): Promise<QuestionResponse>
```

**Parameters:**
- `sessionId` - Active session identifier
- `question` - Homeowner's question
- `currentSlideIndex` - Current slide being viewed

**Returns:** Promise resolving to answer with related slides and follow-ups

---

#### `addressConcern()`
Handle homeowner objections or concerns.

```typescript
function addressConcern(
  sessionId: string,
  objection: string,
  currentSlideIndex: number
): Promise<ObjectionResponse>
```

**Parameters:**
- `sessionId` - Active session identifier
- `objection` - Homeowner's concern or objection
- `currentSlideIndex` - Current slide being viewed

**Returns:** Promise resolving to empathetic response with evidence and next steps

---

#### `getSessionById()`
Retrieve an existing session.

```typescript
function getSessionById(sessionId: string): PresentationSession | null
```

**Parameters:**
- `sessionId` - Session identifier

**Returns:** Session object or null if not found

---

#### `finishPresentation()`
Mark a presentation session as completed.

```typescript
function finishPresentation(sessionId: string): void
```

**Parameters:**
- `sessionId` - Session to complete

---

#### `exportTranscript()`
Generate a markdown transcript of the entire conversation.

```typescript
function exportTranscript(sessionId: string): string
```

**Parameters:**
- `sessionId` - Session to export

**Returns:** Markdown-formatted transcript

---

### Type Definitions

#### `PresentationSlide`
```typescript
interface PresentationSlide {
  id: string;
  type: 'cover' | 'damage' | 'summary' | 'recommendation' | 'contact';
  title: string;
  content?: string;
  imageUrl?: string;
  imageName?: string;
  damageAssessment?: DamageAssessment;
  order: number;
}
```

#### `PresentationSession`
```typescript
interface PresentationSession {
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
  status: 'active' | 'paused' | 'completed';
}
```

#### `SlideNarration`
```typescript
interface SlideNarration {
  slideId: string;
  narrationText: string;
  keyPoints: string[];
  transitionPhrase: string;
  anticipatedQuestions: string[];
}
```

#### `QuestionResponse`
```typescript
interface QuestionResponse {
  question: string;
  answer: string;
  relatedSlides: number[];
  followUpSuggestion: string;
  confidence: number;
}
```

#### `ObjectionResponse`
```typescript
interface ObjectionResponse {
  objection: string;
  response: string;
  supportingEvidence: string[];
  alternativeFraming: string;
  nextSteps: string[];
}
```

## Integration Examples

### React Component

```tsx
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

  // Initialize presentation
  useEffect(() => {
    const init = async () => {
      const slides = prepareSlides(); // Your logic
      const newSession = await initPresentation(
        'pres_123',
        slides,
        '123 Main St',
        'John Smith'
      );
      setSession(newSession);
    };
    init();
  }, []);

  // Auto-narrate on slide change
  useEffect(() => {
    if (!session) return;
    const load = async () => {
      const n = await narrateSlide(session.id, currentSlide);
      setNarration(n.narrationText);
    };
    load();
  }, [currentSlide, session]);

  // Handle questions
  const handleQuestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !userQuestion.trim()) return;
    const response = await askSusan(session.id, userQuestion, currentSlide);
    setSusanResponse(response.answer);
    setUserQuestion('');
  };

  return (
    <div>
      <div className="slide-content">
        {/* Display current slide */}
      </div>
      <div className="susan-narration">
        <p>{narration}</p>
      </div>
      <form onSubmit={handleQuestionSubmit}>
        <input
          value={userQuestion}
          onChange={(e) => setUserQuestion(e.target.value)}
          placeholder="Ask Susan a question..."
        />
        <button type="submit">Ask</button>
      </form>
      {susanResponse && <div className="response">{susanResponse}</div>}
    </div>
  );
};
```

### Voice-Enabled Presentation

```typescript
import { narrateSlide, askSusan } from './services/susanPresenterService';
import { connectLiveConversation } from './services/geminiService';

async function voicePresentation(sessionId: string) {
  // Connect to Gemini Live for voice
  const liveSession = await connectLiveConversation({
    onopen: () => console.log('Voice connected'),
    onclose: () => console.log('Voice disconnected'),
    onerror: (e) => console.error('Voice error:', e),
    onmessage: async (msg) => {
      if (msg.type === 'transcription') {
        // Homeowner spoke - get their question
        const question = msg.text;
        const response = await askSusan(sessionId, question, currentSlide);

        // Speak Susan's response
        await liveSession.send({ text: response.answer });
      }
    },
  });

  // Present each slide with voice narration
  for (let i = 0; i < slides.length; i++) {
    const narration = await narrateSlide(sessionId, i);
    await liveSession.send({ text: narration.narrationText });

    // Wait for questions before moving on
    await waitForUserInput();
  }
}
```

## Susan's Persona

Susan is designed with a specific personality and expertise:

**Personality Traits:**
- Warm, empathetic, patient
- Professional but conversational
- Knowledgeable neighbor, not salesperson
- Always advocates for the homeowner
- Calm and reassuring

**Expertise:**
- 15+ years in roofing damage assessment
- Expert in insurance policy language
- Skilled at explaining technical concepts simply
- Experienced in handling objections
- Knowledge of state-specific regulations (MD, VA, PA, DC)

**Communication Style:**
- Uses "we" language (collaborative)
- Acknowledges emotions before facts
- Tells brief clarifying stories
- Asks clarifying questions
- Provides actionable next steps

## Best Practices

### 1. Session Management
```typescript
// Always check if session exists before operations
const session = getSessionById(sessionId);
if (!session) {
  throw new Error('Session not found');
}
```

### 2. Error Handling
```typescript
try {
  const response = await askSusan(sessionId, question, slideIndex);
  // Use response
} catch (error) {
  console.error('Susan failed to respond:', error);
  // Fallback: show error message to user
}
```

### 3. Conversation Context
```typescript
// Susan automatically maintains context, but you can enhance it:
const session = getSessionById(sessionId);
console.log('Recent concerns:', session.homeownerConcerns);
console.log('Conversation history:', session.conversationHistory);
```

### 4. Slide Preparation
```typescript
// Always include damage assessments for damage slides
const slides: PresentationSlide[] = assessments.map((assessment, idx) => ({
  id: `slide_${idx}`,
  type: 'damage',
  title: assessment.analysis.affectedArea,
  damageAssessment: assessment, // Critical for Susan's context
  order: idx,
}));
```

### 5. Performance Optimization
```typescript
// Pre-generate narrations for faster presentation
const narrations = await Promise.all(
  slides.map((_, idx) => narrateSlide(sessionId, idx))
);
```

## Limitations & Considerations

1. **API Key Required** - Requires valid Gemini API key
2. **Rate Limits** - Subject to Gemini API rate limits
3. **Latency** - AI responses take 1-3 seconds
4. **Context Window** - Very long presentations may exceed context limits
5. **Language** - Optimized for English; other languages untested
6. **Internet Required** - Requires active internet connection

## Troubleshooting

### "Gemini API key not configured"
**Solution:** Ensure `GEMINI_API_KEY` is set in environment variables.

### "Session not found"
**Solution:** Session may have expired or been deleted. Initialize a new session.

### Slow responses
**Solution:** Check internet connection. Consider pre-generating narrations.

### Context too long errors
**Solution:** Limit conversation history or split into multiple shorter sessions.

## Future Enhancements

- [ ] Offline mode with cached responses
- [ ] Multi-language support
- [ ] Custom Susan personality configurations
- [ ] Voice-first mode with continuous conversation
- [ ] Integration with CRM for homeowner history
- [ ] Analytics on common questions and objections
- [ ] Auto-summarization of long presentations
- [ ] Mobile app support with push notifications

## Support

For issues or questions:
1. Check `susanPresenterService.examples.ts` for usage examples
2. Review conversation history in session object
3. Check browser console for error messages
4. Verify Gemini API key is valid

## License

Part of the Gemini Field Assistant project.
© 2025 Roof-ER. All rights reserved.
