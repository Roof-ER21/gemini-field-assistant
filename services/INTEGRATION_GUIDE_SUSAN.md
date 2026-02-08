# Susan AI Presenter - Integration Guide

## Quick Integration for Inspection Presentation Feature

This guide shows you exactly how to integrate Susan into your existing presentation feature.

## Step 1: Import the Service

```typescript
// In your presentation component or page
import {
  initPresentation,
  narrateSlide,
  askSusan,
  addressConcern,
  getSessionById,
  finishPresentation,
  exportTranscript,
  PresentationSession,
} from '@/services/susanPresenterService';
import { prepareSlides } from '@/services/susanPresenterService.examples';
```

## Step 2: Add State Management

```tsx
// In your React component
const [susanSession, setSusanSession] = useState<PresentationSession | null>(null);
const [currentSlide, setCurrentSlide] = useState(0);
const [currentNarration, setCurrentNarration] = useState('');
const [userInput, setUserInput] = useState('');
const [susanResponse, setSusanResponse] = useState('');
const [loading, setLoading] = useState(false);
```

## Step 3: Initialize Susan When Presentation Starts

```tsx
// When user starts presentation
const handleStartPresentation = async () => {
  try {
    setLoading(true);

    // You already have damage assessments from image analysis
    // Convert them to presentation slides
    const slides = prepareSlides(damageAssessments, propertyAddress);

    // Initialize Susan
    const session = await initPresentation(
      presentationId,
      slides,
      propertyAddress,
      homeownerName
    );

    setSusanSession(session);

    // Generate initial narration for first slide
    const firstNarration = await narrateSlide(session.id, 0);
    setCurrentNarration(firstNarration.narrationText);

    setLoading(false);
  } catch (error) {
    console.error('Failed to initialize Susan:', error);
    setLoading(false);
  }
};
```

## Step 4: Auto-Narrate When Slide Changes

```tsx
// Effect that runs when slide changes
useEffect(() => {
  if (!susanSession) return;

  const loadNarration = async () => {
    setLoading(true);
    setSusanResponse(''); // Clear previous Q&A

    try {
      const narration = await narrateSlide(susanSession.id, currentSlide);
      setCurrentNarration(narration.narrationText);

      // Optional: Use text-to-speech to read narration
      // speakText(narration.narrationText);
    } catch (error) {
      console.error('Failed to generate narration:', error);
    }

    setLoading(false);
  };

  loadNarration();
}, [currentSlide, susanSession]);
```

## Step 5: Handle Homeowner Questions

```tsx
const handleAskSusan = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!susanSession || !userInput.trim()) return;

  setLoading(true);

  try {
    const response = await askSusan(
      susanSession.id,
      userInput,
      currentSlide
    );

    setSusanResponse(response.answer);
    setUserInput('');

    // Optional: Speak the response
    // speakText(response.answer);
  } catch (error) {
    console.error('Susan failed to respond:', error);
    setSusanResponse('Sorry, I had trouble understanding that. Could you rephrase?');
  }

  setLoading(false);
};
```

## Step 6: Detect and Handle Objections

```tsx
// Use a simple keyword detector or let Susan classify
const handleUserMessage = async (message: string) => {
  setLoading(true);

  try {
    // Check if message contains objection keywords
    const objectionKeywords = [
      'expensive', 'cost', 'afford',
      'wait', 'think about',
      'just patch', 'just repair',
      'insurance won\'t', 'insurance will deny'
    ];

    const isObjection = objectionKeywords.some(keyword =>
      message.toLowerCase().includes(keyword)
    );

    let response;

    if (isObjection) {
      // Handle as objection
      const objResponse = await addressConcern(
        susanSession!.id,
        message,
        currentSlide
      );
      response = objResponse.response;
    } else {
      // Handle as question
      const qResponse = await askSusan(
        susanSession!.id,
        message,
        currentSlide
      );
      response = qResponse.answer;
    }

    setSusanResponse(response);
    setUserInput('');
  } catch (error) {
    console.error('Error handling message:', error);
  }

  setLoading(false);
};
```

## Step 7: UI Layout

```tsx
return (
  <div className="presentation-container">
    {/* Slide Display Area */}
    <div className="slide-area">
      <div className="slide-header">
        <h2>{slides[currentSlide].title}</h2>
        <span>Slide {currentSlide + 1} of {slides.length}</span>
      </div>

      <div className="slide-content">
        {/* Display image if it's a damage slide */}
        {slides[currentSlide].imageUrl && (
          <img
            src={slides[currentSlide].imageUrl}
            alt={slides[currentSlide].title}
            className="slide-image"
          />
        )}

        {/* Display damage details if available */}
        {slides[currentSlide].damageAssessment && (
          <div className="damage-details">
            <div className="detail-row">
              <strong>Type:</strong>
              <span>{slides[currentSlide].damageAssessment.analysis.damageType.join(', ')}</span>
            </div>
            <div className="detail-row">
              <strong>Severity:</strong>
              <span className={`severity-${slides[currentSlide].damageAssessment.analysis.severity}`}>
                {slides[currentSlide].damageAssessment.analysis.severity.toUpperCase()}
              </span>
            </div>
            <div className="detail-row">
              <strong>Location:</strong>
              <span>{slides[currentSlide].damageAssessment.analysis.affectedArea}</span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="slide-navigation">
        <button
          onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
          disabled={currentSlide === 0 || loading}
        >
          Previous
        </button>
        <button
          onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))}
          disabled={currentSlide === slides.length - 1 || loading}
        >
          Next
        </button>
      </div>
    </div>

    {/* Susan AI Panel */}
    <div className="susan-panel">
      <div className="susan-header">
        <div className="susan-avatar">
          <img src="/susan-avatar.png" alt="Susan" />
        </div>
        <div>
          <h3>Susan, Insurance Claims Specialist</h3>
          <p>15+ years experience • Here to help</p>
        </div>
      </div>

      {/* Susan's Narration */}
      <div className="susan-narration">
        <h4>Susan's Explanation:</h4>
        {loading ? (
          <div className="loading-indicator">
            <span className="spinner"></span>
            Susan is thinking...
          </div>
        ) : (
          <p>{currentNarration}</p>
        )}
      </div>

      {/* Q&A Response (if any) */}
      {susanResponse && (
        <div className="susan-qa-response">
          <h4>Susan responds:</h4>
          <p>{susanResponse}</p>
        </div>
      )}

      {/* Question Input */}
      <div className="susan-input">
        <form onSubmit={handleAskSusan}>
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Ask Susan a question..."
            disabled={loading}
          />
          <button type="submit" disabled={loading || !userInput.trim()}>
            Ask
          </button>
        </form>
        <p className="susan-hint">
          Example: "Will insurance cover this?" or "How much will this cost?"
        </p>
      </div>

      {/* Quick Action Buttons */}
      <div className="susan-quick-actions">
        <button
          onClick={() => handleUserMessage('Will my insurance cover this?')}
          disabled={loading}
        >
          Insurance Coverage
        </button>
        <button
          onClick={() => handleUserMessage('Can you explain what I\'m seeing here?')}
          disabled={loading}
        >
          Explain Damage
        </button>
        <button
          onClick={() => handleUserMessage('What are the next steps?')}
          disabled={loading}
        >
          Next Steps
        </button>
      </div>
    </div>

    {/* Footer Actions */}
    <div className="presentation-footer">
      <button onClick={handleExportTranscript}>
        Export Transcript
      </button>
      <button onClick={handleFinishPresentation} className="primary">
        Complete Presentation
      </button>
    </div>
  </div>
);
```

## Step 8: Finish Presentation & Export

```tsx
const handleFinishPresentation = () => {
  if (!susanSession) return;

  finishPresentation(susanSession.id);

  // Navigate to next step (e.g., contract signing)
  router.push('/contract');
};

const handleExportTranscript = () => {
  if (!susanSession) return;

  const transcript = exportTranscript(susanSession.id);

  // Download as file
  const blob = new Blob([transcript], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `presentation_transcript_${homeownerName}_${Date.now()}.md`;
  link.click();
  URL.revokeObjectURL(url);

  // Or send to backend
  // await fetch('/api/presentations/transcript', {
  //   method: 'POST',
  //   body: JSON.stringify({ transcript, sessionId: susanSession.id }),
  // });
};
```

## Step 9: Add Basic Styling

```css
/* susan-presenter.css */

.presentation-container {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 24px;
  height: 100vh;
  padding: 24px;
}

.slide-area {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.slide-image {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.damage-details {
  background: #f5f5f5;
  padding: 16px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
}

.severity-severe,
.severity-critical {
  color: #dc2626;
  font-weight: 600;
}

.susan-panel {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.susan-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e5e5e5;
}

.susan-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  background: #3b82f6;
  display: flex;
  align-items: center;
  justify-content: center;
}

.susan-narration {
  background: #eff6ff;
  padding: 16px;
  border-radius: 8px;
  border-left: 4px solid #3b82f6;
}

.susan-qa-response {
  background: #f0fdf4;
  padding: 16px;
  border-radius: 8px;
  border-left: 4px solid #10b981;
}

.susan-input form {
  display: flex;
  gap: 8px;
}

.susan-input input {
  flex: 1;
  padding: 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
}

.susan-input button {
  padding: 12px 24px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.susan-quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.susan-quick-actions button {
  padding: 8px 16px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.susan-quick-actions button:hover {
  background: #f9fafb;
}

.loading-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #6b7280;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

## Step 10: Optional - Voice Integration

```tsx
// Add voice input/output
import { speakText, listenForSpeech } from '@/utils/speech';

const handleVoiceInput = async () => {
  try {
    const spokenText = await listenForSpeech();
    setUserInput(spokenText);
    handleUserMessage(spokenText);
  } catch (error) {
    console.error('Speech recognition failed:', error);
  }
};

// Speak Susan's responses
useEffect(() => {
  if (currentNarration && voiceEnabled) {
    speakText(currentNarration, { voice: 'Aoede' }); // UK English female
  }
}, [currentNarration, voiceEnabled]);

useEffect(() => {
  if (susanResponse && voiceEnabled) {
    speakText(susanResponse, { voice: 'Aoede' });
  }
}, [susanResponse, voiceEnabled]);
```

## Complete Component Example

See `susanPresenterService.examples.ts` for a complete working React component example.

## Testing

```bash
# Run tests
npm test susanPresenterService.test.ts

# Or test manually in browser console
import { runManualTest } from '@/services/susanPresenterService.test';
await runManualTest();
```

## Performance Tips

1. **Pre-generate narrations** when presentation starts:
   ```typescript
   const narrations = await Promise.all(
     slides.map((_, idx) => narrateSlide(sessionId, idx))
   );
   ```

2. **Debounce user input** to avoid excessive API calls:
   ```typescript
   const debouncedHandleInput = debounce(handleUserMessage, 500);
   ```

3. **Cache common responses** in localStorage:
   ```typescript
   const cacheKey = `susan_response_${hashQuestion(question)}`;
   const cached = localStorage.getItem(cacheKey);
   if (cached) return JSON.parse(cached);
   ```

## Error Handling

```typescript
try {
  const response = await askSusan(sessionId, question, slideIndex);
  setSusanResponse(response.answer);
} catch (error) {
  if (error.message.includes('API key')) {
    setSusanResponse('Sorry, Susan is currently unavailable. Please continue with the presentation manually.');
  } else if (error.message.includes('rate limit')) {
    setSusanResponse('Susan is receiving a lot of requests right now. Please wait a moment and try again.');
  } else {
    setSusanResponse('Sorry, I had trouble understanding that. Could you rephrase your question?');
  }
}
```

## Next Steps

1. Integrate into your existing presentation page
2. Test with real damage assessments
3. Add voice features (optional)
4. Customize Susan's avatar and branding
5. Add analytics tracking for common questions
6. Create feedback mechanism for improving responses

## Support

For issues or questions:
- Check `README_SUSAN_PRESENTER.md` for detailed API documentation
- Review `susanPresenterService.examples.ts` for usage patterns
- Run `susanPresenterService.test.ts` to validate setup
