# Susan AI Presenter - Quick Reference Card

## 🚀 Quick Start (Copy & Paste)

```typescript
// 1. Import
import {
  initPresentation,
  narrateSlide,
  askSusan,
  addressConcern,
  finishPresentation,
  exportTranscript,
} from '@/services/susanPresenterService';

// 2. Initialize
const session = await initPresentation(
  'pres_123',
  slides,
  '123 Main St, Baltimore, MD',
  'John Smith'
);

// 3. Narrate slide
const narration = await narrateSlide(session.id, slideIndex);

// 4. Answer question
const response = await askSusan(session.id, question, slideIndex);

// 5. Handle objection
const objResponse = await addressConcern(session.id, objection, slideIndex);

// 6. Complete & export
finishPresentation(session.id);
const transcript = exportTranscript(session.id);
```

## 📋 Essential Functions

| Function | Purpose | Returns |
|----------|---------|---------|
| `initPresentation()` | Start new session | `PresentationSession` |
| `narrateSlide()` | Generate slide narration | `SlideNarration` |
| `askSusan()` | Answer question | `QuestionResponse` |
| `addressConcern()` | Handle objection | `ObjectionResponse` |
| `getSessionById()` | Retrieve session | `PresentationSession \| null` |
| `finishPresentation()` | Complete session | `void` |
| `exportTranscript()` | Generate transcript | `string` |

## 🎯 Key Types

```typescript
PresentationSlide {
  id: string;
  type: 'cover' | 'damage' | 'summary' | 'recommendation' | 'contact';
  title: string;
  damageAssessment?: DamageAssessment;
}

PresentationSession {
  id: string;
  homeownerName: string;
  propertyAddress: string;
  slides: PresentationSlide[];
  conversationHistory: ConversationMessage[];
  susanContext: string;
  status: 'active' | 'completed';
}

SlideNarration {
  narrationText: string;
  keyPoints: string[];
  transitionPhrase: string;
  anticipatedQuestions: string[];
}

QuestionResponse {
  answer: string;
  relatedSlides: number[];
  followUpSuggestion: string;
  confidence: number;
}
```

## 🎨 React Integration Pattern

```tsx
const [session, setSession] = useState<PresentationSession | null>(null);
const [currentSlide, setCurrentSlide] = useState(0);
const [narration, setNarration] = useState('');
const [response, setResponse] = useState('');

// Initialize on mount
useEffect(() => {
  const init = async () => {
    const s = await initPresentation(id, slides, address, name);
    setSession(s);
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
const handleQuestion = async (q: string) => {
  const r = await askSusan(session!.id, q, currentSlide);
  setResponse(r.answer);
};
```

## 🔧 Common Patterns

### Pattern 1: Pre-load Narrations
```typescript
const narrations = await Promise.all(
  slides.map((_, idx) => narrateSlide(sessionId, idx))
);
```

### Pattern 2: Error Handling
```typescript
try {
  const response = await askSusan(sessionId, question, slideIndex);
  setResponse(response.answer);
} catch (error) {
  setResponse('Sorry, I had trouble with that. Please try again.');
}
```

### Pattern 3: Auto-detect Objections
```typescript
const objectionKeywords = ['expensive', 'afford', 'wait', 'patch'];
const isObjection = objectionKeywords.some(k =>
  message.toLowerCase().includes(k)
);

const response = isObjection
  ? await addressConcern(sessionId, message, slideIndex)
  : await askSusan(sessionId, message, slideIndex);
```

### Pattern 4: Slide Preparation
```typescript
const slides: PresentationSlide[] = [
  { id: 'cover', type: 'cover', title: 'Inspection Report', order: 0 },
  ...assessments.map((a, i) => ({
    id: `damage_${i}`,
    type: 'damage',
    title: a.analysis.affectedArea,
    imageUrl: a.imageUrl,
    damageAssessment: a,
    order: i + 1,
  })),
  { id: 'summary', type: 'summary', title: 'Next Steps', order: assessments.length + 1 },
];
```

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| "API key not configured" | Check `GEMINI_API_KEY` in env |
| "Session not found" | Initialize new session or check ID |
| Slow responses | Pre-generate narrations, check network |
| Context too long | Limit conversation history |

## 📊 Expected Performance

- Session init: ~2-3s
- Narration: ~2-4s
- Questions: ~1-3s
- Objections: ~2-3s

## 🎯 Susan's Personality

**Traits:**
- Warm, empathetic, patient
- Professional but conversational
- Expert yet accessible
- Always homeowner advocate

**Communication:**
- Uses "we" language
- Acknowledges emotions first
- Tells brief stories
- Provides actionable steps

**Expertise:**
- 15+ years roofing/insurance
- State-specific knowledge (MD, VA, PA, DC)
- Adjuster language fluency
- Claims process mastery

## 📁 File Locations

All in `/Users/a21/gemini-field-assistant/services/`:

1. `susanPresenterService.ts` - Core service
2. `susanPresenterService.examples.ts` - Examples
3. `susanPresenterService.test.ts` - Tests
4. `susanPresenterService.types.ts` - Types
5. `README_SUSAN_PRESENTER.md` - Full docs
6. `INTEGRATION_GUIDE_SUSAN.md` - Integration steps
7. `SUSAN_PRESENTER_SUMMARY.md` - Complete summary

## 🧪 Quick Test

```typescript
// In browser console
import { runManualTest } from '@/services/susanPresenterService.test';
await runManualTest();
```

## ⚡ Pro Tips

1. **Pre-generate narrations** for instant slide transitions
2. **Debounce user input** to reduce API calls
3. **Cache common responses** in localStorage
4. **Use quick action buttons** for common questions
5. **Enable voice mode** for hands-free presentations
6. **Export transcripts** after every presentation

## 🎓 Learning Resources

- **Full API:** `README_SUSAN_PRESENTER.md`
- **Integration:** `INTEGRATION_GUIDE_SUSAN.md`
- **Examples:** `susanPresenterService.examples.ts`
- **Tests:** `susanPresenterService.test.ts`

## 🚦 Status Indicators

```typescript
// Check session status
const session = getSessionById(sessionId);
console.log(session?.status); // 'active' | 'paused' | 'completed'
console.log(session?.conversationHistory.length); // Message count
console.log(session?.homeownerConcerns); // Tracked concerns
```

## 📞 Support

1. Check `README_SUSAN_PRESENTER.md` for details
2. Review examples in `.examples.ts` file
3. Run tests to validate setup
4. Check browser console for errors

---

**Quick Reference Version:** 1.0
**Date:** February 8, 2026
**Status:** ✅ Production Ready
