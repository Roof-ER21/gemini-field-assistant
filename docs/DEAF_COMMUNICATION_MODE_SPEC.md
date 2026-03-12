# Deaf Communication Mode — SA21 Feature Spec

## Overview

A real-time communication tool that enables Roof-ER sales reps to have full conversations with deaf or hard-of-hearing homeowners during field visits. Combines on-device ASL sign recognition, live speech-to-text captioning, quick-tap responses, and optional Gemini AI fallback into a seamless doorstep experience.

**Origin**: A rep used SA21's translator at a homeowner's door, assuming a language barrier — the homeowner was actually deaf. This feature ensures the next rep isn't stuck.

---

## User Flow

### Rep's Experience

```
1. Rep arrives at door, realizes homeowner is deaf
2. Opens SA21 → taps "Deaf Mode" (or sidebar icon)
3. Phone screen splits:
   ┌─────────────────────────────────────┐
   │  REP SIDE (facing rep)              │
   │  ┌───────────────────────────────┐  │
   │  │ What they signed:             │  │
   │  │ "HELP" "ROOF" "WATER"         │  │
   │  │ [confidence: ●●●○]            │  │
   │  │                               │  │
   │  │ ▸ nod detected                │  │
   │  └───────────────────────────────┘  │
   │  [ 🎤 Speak ] [ ⟲ Flip Screen ]    │
   │  [ Transcript ] [ End Session ]     │
   └─────────────────────────────────────┘

4. Rep speaks → text appears on screen
5. Taps "Flip Screen" → phone shows homeowner side
```

### Homeowner's Experience (flipped screen)

```
   ┌─────────────────────────────────────┐
   │  HOMEOWNER SIDE (large text)        │
   │                                     │
   │  "Hi, I'm with Roof-ER. We're      │
   │   checking homes in the area        │
   │   after the recent storm.           │
   │   Did you notice any damage?"       │
   │                                     │
   │  ┌─────┐ ┌─────┐ ┌──────┐ ┌─────┐  │
   │  │ Yes │ │ No  │ │Maybe │ │Show │  │
   │  │     │ │     │ │      │ │ me  │  │
   │  └─────┘ └─────┘ └──────┘ └─────┘  │
   │                                     │
   │  ┌─────────────────────────────┐    │
   │  │ More: Insurance | Estimate  │    │
   │  │ Roof leak | Hail damage     │    │
   │  │ Not interested | Come back  │    │
   │  └─────────────────────────────┘    │
   │                                     │
   │  [ ⌨️ Type ] [ ✋ Sign ] [ ✏️ Draw ] │
   └─────────────────────────────────────┘
```

### The Flow

```
Rep speaks ──→ Gemini ASR ──→ Big text on homeowner screen
                                         │
Homeowner responds via:                  │
  ├─ Quick tap buttons ─────────────────→ Rep sees response + TTS speaks it
  ├─ Type on keyboard ──────────────────→ Rep sees text + TTS speaks it
  ├─ Sign language (camera) ────────────→ On-device recognition → Rep sees translation
  ├─ Finger-draw on screen ─────────────→ Rep sees handwritten text
  └─ Fingerspell (camera) ─────────────→ Letter-by-letter assembly → Rep sees word
```

---

## Architecture

### Three-Layer Recognition System

```
Layer 1: ON-DEVICE (instant, free, offline)
├── MediaPipe Holistic → 543 landmarks per frame
├── TFLite Sign Classifier (Kaggle 1st place) → 250 signs, ~82% accuracy
├── TFLite Fingerspelling Model → 26 letters, ~90% accuracy
├── Head nod/shake detector → yes/no from pose landmarks
└── Confidence threshold: 0.75

Layer 2: GEMINI FALLBACK (cloud, ~500ms, when Layer 1 confidence < 0.75)
├── Send video frame + landmarks to Gemini 2.5 Flash
├── System prompt: "What ASL sign is this person making?"
├── Returns sign name + confidence
└── Only triggered when on-device model is uncertain

Layer 3: TEXT FALLBACK (always available)
├── Quick-tap response buttons
├── Keyboard typing
├── Handwriting/drawing pad
└── This is the reliable backbone — always works
```

### Data Flow Diagram

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│   CAMERA     │────→│  MediaPipe SDK   │────→│ TFLite Model │
│  (front)     │     │  543 landmarks   │     │  250 signs   │
└──────────────┘     │  @30fps on-device│     │  <10MB       │
                     └──────────────────┘     └──────┬───────┘
                                                      │
                                              confidence > 0.75?
                                              ├── YES → Display sign
                                              └── NO  → Send to Gemini
                                                        │
┌──────────────┐     ┌──────────────────┐              │
│  MICROPHONE  │────→│  Gemini Live ASR │     ┌────────▼───────┐
│  (rep audio) │     │  (existing infra)│     │  Gemini Flash  │
└──────────────┘     └───────┬──────────┘     │  Vision API    │
                             │                └────────┬───────┘
                             ▼                         │
                     ┌──────────────────┐              │
                     │  DISPLAY ENGINE  │◄─────────────┘
                     │                  │
                     │  Rep side:       │
                     │  - Sign translation
                     │  - Nod/shake indicators
                     │  - Transcript     │
                     │                  │
                     │  Homeowner side: │
                     │  - Big text      │
                     │  - Quick buttons │
                     │  - Type/draw pad │
                     └──────────────────┘
```

---

## Component Structure

### New Files

```
components/
  deaf-mode/
    DeafCommunicationPanel.tsx      # Main container, mode switching
    RepView.tsx                     # Rep-facing UI (sign translations, controls)
    HomeownerView.tsx               # Homeowner-facing UI (big text, quick taps)
    SignRecognizer.tsx               # Camera + MediaPipe + TFLite pipeline
    QuickResponseBoard.tsx          # Tap-to-respond button grid
    HandwritingPad.tsx              # Canvas-based finger drawing
    ConversationTranscript.tsx      # Full conversation log
    HeadGestureDetector.tsx         # Nod/shake from pose landmarks
    ConfidenceIndicator.tsx         # Visual confidence dots
    FlipScreenButton.tsx            # Orientation flip control

services/
  signLanguageService.ts            # MediaPipe + TFLite orchestration
  deafModeTranscriptService.ts      # Conversation logging + export

database/migrations/
  061_deaf_communication_mode.sql   # Schema additions
```

### Reused Existing Components

| Existing | Reuse For |
|----------|-----------|
| `LivePanel.tsx` | Gemini Live ASR pipeline (rep speech → text) |
| `TranslatorPanel.tsx` | Flip-screen pattern, dual-view layout |
| `agnes21/utils/geminiTTS.ts` | TTS for homeowner's typed responses |
| `agnes21/utils/vadUtils.ts` | Voice activity detection |
| `agnes21/utils/audioUtils.ts` | Audio processing utilities |
| `services/geminiService.ts` | Gemini API calls for sign fallback |
| `services/transcriptionService.ts` | Audio recording infrastructure |
| `contexts/SettingsContext.tsx` | Feature flag: `feature_deaf_mode` |

---

## Quick Response Board

### Default Responses (Universal)

```
Row 1: [ Yes ] [ No ] [ Maybe ] [ Show me ]
Row 2: [ How much? ] [ When? ] [ Who? ] [ Why? ]
Row 3: [ I don't understand ] [ Say again ] [ Slower please ] [ Thank you ]
```

### Roofing-Specific Responses (context-aware)

```
Category: Storm Damage
[ I had storm damage ] [ Roof is leaking ] [ Hail damage ]
[ Missing shingles ] [ Water inside ] [ Wind damage ]

Category: Insurance
[ I have insurance ] [ Already filed claim ] [ Claim was denied ]
[ Adjuster came already ] [ Waiting on adjuster ] [ Need estimate ]

Category: Scheduling
[ Come back later ] [ Schedule appointment ] [ Call my spouse ]
[ This weekend ] [ Next week ] [ Morning is better ]

Category: Decision
[ Not interested ] [ Need to think ] [ Talk to spouse first ]
[ How long does it take? ] [ Do you have references? ] [ Free inspection? ]
```

### Custom Quick Responses
- Admin can configure team-wide quick responses in Admin Panel
- Reps can add personal quick responses
- Stored in `user_preferences.deaf_mode_quick_responses` (JSONB)

---

## Sign Language Recognition — Technical Detail

### Model Selection

**Primary: Google ISLR 1st Place Solution**
- Source: https://huggingface.co/sign/kaggle-asl-signs-1st-place
- Format: TFLite
- Vocabulary: 250 ASL signs (MacArthur-Bates CDI)
- Input: MediaPipe landmark sequences
- Inference: ~1-2ms per frame on modern phones
- License: MIT

**Secondary: Fingerspelling Model**
- Source: https://github.com/ChristofHenkel/kaggle-asl-fingerspelling-1st-place-solution
- Format: TFLite (Squeezeformer + Transformer)
- Input: 130 selected landmarks (lips, hands, pose)
- Accuracy: ~89% character-level
- Enables spelling any word not in the 250-sign vocabulary

### MediaPipe Integration

```typescript
// signLanguageService.ts — conceptual architecture

interface SignRecognitionResult {
  sign: string;              // "HELP", "ROOF", "WATER"
  confidence: number;        // 0.0 - 1.0
  source: 'on-device' | 'gemini-fallback';
  landmarks?: number[][];    // raw landmark data
  timestamp: number;
}

// Pipeline:
// 1. MediaPipe Holistic extracts 543 landmarks per frame
// 2. Select 130 key landmarks (face lips + hands + upper pose)
// 3. Buffer 30-60 frames of landmarks (1-2 seconds of signing)
// 4. Feed buffer to TFLite classifier
// 5. If confidence > 0.75 → return result
// 6. If confidence < 0.75 → send frame to Gemini for second opinion
// 7. Temporal smoothing: require 3 consecutive agreeing predictions
```

### On-Device vs Cloud Decision

```
Sign detected with confidence > 0.75
  → Show immediately (on-device, <50ms)

Sign detected with confidence 0.50 - 0.75
  → Show with "?" indicator
  → Background: send to Gemini for confirmation
  → Update display if Gemini disagrees

Sign detected with confidence < 0.50
  → Don't show (avoid wrong translations)
  → Send to Gemini
  → Show Gemini result if confidence > 0.60
  → Otherwise: prompt "Could you sign that again?" or "Try typing"

No sign detected for 3+ seconds
  → Highlight quick-tap buttons
  → Subtle prompt: "Tap a response or type below"
```

---

## Head Gesture Detection

Using MediaPipe Pose landmarks (nose, eyes, ears), track:

```
Head Nod (yes):
  - Track nose Y-coordinate over 1-second window
  - Detect 2+ vertical oscillations with amplitude > threshold
  - Display: subtle ✓ on rep's screen

Head Shake (no):
  - Track nose X-coordinate over 1-second window
  - Detect 2+ horizontal oscillations with amplitude > threshold
  - Display: subtle ✗ on rep's screen

Forward Lean (interest):
  - Track shoulder-to-camera distance decreasing
  - Display: subtle "→" engagement indicator

Pointing:
  - Track index finger extension + direction
  - Display: "Pointing [up/left/right/behind]"
```

These are **passive indicators only** — shown as small subtle icons on the rep's view, not spoken or highlighted prominently. Natural signals any human would notice, just surfaced digitally when the rep is looking at their phone screen instead of the homeowner.

---

## Database Schema

```sql
-- Migration 061: Deaf Communication Mode

-- Conversation sessions
CREATE TABLE IF NOT EXISTS deaf_mode_sessions (
  id SERIAL PRIMARY KEY,
  rep_user_id INTEGER REFERENCES users(id),
  lead_id INTEGER REFERENCES profile_leads(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  total_signs_recognized INTEGER DEFAULT 0,
  total_quick_taps INTEGER DEFAULT 0,
  total_typed_messages INTEGER DEFAULT 0,
  total_rep_utterances INTEGER DEFAULT 0,
  avg_sign_confidence DECIMAL(4,3),
  gemini_fallback_count INTEGER DEFAULT 0,
  notes TEXT
);

-- Individual conversation turns
CREATE TABLE IF NOT EXISTS deaf_mode_transcript (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES deaf_mode_sessions(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  speaker TEXT NOT NULL CHECK (speaker IN ('rep', 'homeowner')),
  input_method TEXT NOT NULL CHECK (input_method IN (
    'speech', 'sign_language', 'fingerspell', 'quick_tap',
    'typed', 'handwriting', 'head_gesture'
  )),
  content TEXT NOT NULL,
  sign_confidence DECIMAL(4,3),
  recognition_source TEXT CHECK (recognition_source IN ('on-device', 'gemini', 'manual')),
  raw_landmarks JSONB  -- optional, for model improvement
);

-- Custom quick responses per team/user
CREATE TABLE IF NOT EXISTS deaf_mode_quick_responses (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'team', 'user')),
  owner_id INTEGER REFERENCES users(id),
  is_active BOOLEAN DEFAULT true
);

-- Indexes
CREATE INDEX idx_deaf_sessions_rep ON deaf_mode_sessions(rep_user_id);
CREATE INDEX idx_deaf_sessions_lead ON deaf_mode_sessions(lead_id);
CREATE INDEX idx_deaf_transcript_session ON deaf_mode_transcript(session_id);
CREATE INDEX idx_deaf_quick_responses_scope ON deaf_mode_quick_responses(scope, is_active);
```

---

## Implementation Phases

### Phase 1: Text-Based Communication (1-2 weeks)
**Goal**: Rep can have a basic conversation with a deaf homeowner using speech-to-text + quick taps. No sign recognition yet.

- [ ] `DeafCommunicationPanel.tsx` — main container
- [ ] `RepView.tsx` — rep sees conversation, has mic button
- [ ] `HomeownerView.tsx` — homeowner sees big text + quick taps
- [ ] `QuickResponseBoard.tsx` — tap-to-respond grid
- [ ] `FlipScreenButton.tsx` — toggle between views
- [ ] `ConversationTranscript.tsx` — full log
- [ ] Wire up existing Gemini Live ASR for rep's speech
- [ ] Wire up existing TTS for homeowner's tapped responses
- [ ] Add `feature_deaf_mode` flag
- [ ] Add sidebar navigation entry
- [ ] Migration 061 — schema
- [ ] API endpoints for session logging

**This phase alone is usable and valuable.** A rep can use it tomorrow.

### Phase 2: Sign Language Recognition (2-3 weeks)
**Goal**: On-device recognition of 250 ASL signs + fingerspelling.

- [ ] Integrate MediaPipe Holistic SDK (web or Capacitor native plugin)
- [ ] Download + bundle GISLR 1st place TFLite model
- [ ] Download + bundle fingerspelling TFLite model
- [ ] `SignRecognizer.tsx` — camera feed + landmark extraction + classification
- [ ] `ConfidenceIndicator.tsx` — visual feedback on recognition quality
- [ ] Implement confidence threshold + Gemini fallback
- [ ] Temporal smoothing (3-frame agreement)
- [ ] "Sign" mode toggle on homeowner view
- [ ] Test with actual ASL signers

### Phase 3: Body Language + Polish (1-2 weeks)
**Goal**: Head gesture detection, handwriting pad, conversation export.

- [ ] `HeadGestureDetector.tsx` — nod/shake from pose landmarks
- [ ] `HandwritingPad.tsx` — canvas finger-drawing with text recognition
- [ ] Conversation export (PDF, text) for lead records
- [ ] Auto-attach transcript to lead in SA21
- [ ] Admin panel: manage quick responses
- [ ] Analytics: usage stats, common signs, accuracy metrics

### Phase 4: Advanced Features (ongoing)
- [ ] Expand sign vocabulary (train on ASL Citizen dataset, 2,731 signs)
- [ ] Multi-language sign support (LSM for Spanish-speaking deaf homeowners)
- [ ] Offline mode (cache models + use on-device ASR)
- [ ] Wearable support (Apple Watch haptic alerts)
- [ ] Video relay: connect to a live ASL interpreter via WebRTC

---

## UI Design Guidelines

### Homeowner-Facing Screen
- **Font size**: 28-36px minimum (readable at arm's length)
- **Contrast**: WCAG AAA (7:1 ratio minimum)
- **Colors**: High contrast dark bg (#0a0a0a) with white text, Roof-ER red (#b60807) for accents
- **Buttons**: Large touch targets (minimum 48x48px, prefer 64x64px)
- **Animation**: Subtle fade-in for new text (no jarring transitions)
- **Auto-scroll**: New text auto-scrolls, with manual scroll override

### Rep-Facing Screen
- **Compact**: Information-dense, similar to existing SA21 panels
- **Sign translation**: Prominent but not overwhelming
- **Confidence**: Color-coded dots (green/yellow/red)
- **Gestures**: Small icons in corner, not distracting
- **Controls**: Bottom bar with mic, flip, transcript, end

### Shared
- **Dark theme**: Matches SA21's existing dark mode
- **No auto-rotate**: Lock orientation when in deaf mode
- **Keep-awake**: Prevent screen sleep during active session
- **Haptic**: Vibrate on homeowner tap (confirms their input registered)

---

## Privacy & Ethics

### What We Do
- All sign recognition runs on-device first (landmarks only, not video)
- Video frames only sent to Gemini when on-device confidence is low
- Conversation transcripts stored with consent (disclosure at session start)
- Head gesture detection is for universal signals only (nod/shake/point)
- No emotion labeling — we surface observable actions, not feelings

### What We Don't Do
- No emotion/sentiment scoring of the homeowner
- No recording or storing video of the homeowner
- No facial recognition or identification
- No analysis beyond what a human would observe in conversation
- No sharing of accessibility data with third parties

### Disclosure
At session start, a brief notice appears on the homeowner's screen:
> "This app helps us communicate clearly. It shows what I say as text, and can understand basic sign language. Our conversation may be saved as a text record. Tap OK to continue."

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|-------------|
| Feature activation rate | 2+ uses/month across team | `deaf_mode_sessions` count |
| Conversation completion | >80% sessions have 5+ turns | Transcript turn count |
| Sign recognition accuracy | >80% confirmed correct | Rep feedback button |
| Quick-tap usage | >60% of homeowner responses | Input method breakdown |
| Lead conversion from deaf mode | Track separately | `lead_id` on session |
| Rep satisfaction | 4+/5 rating | Post-session prompt |
| Session duration | 3-10 minutes average | `ended_at - started_at` |

---

## Cost Estimate

| Component | Cost | Notes |
|-----------|------|-------|
| MediaPipe SDK | Free | Open source, on-device |
| TFLite models | Free | MIT licensed, Kaggle solutions |
| Gemini fallback | ~$0.01-0.03/session | Only when on-device confidence low |
| Gemini ASR (rep speech) | ~$0.02-0.05/session | Same as existing Live panel |
| Development | Internal | 5-7 weeks across phases |
| Storage | Negligible | Text transcripts only |

**Per-session cost: ~$0.03-0.08** (mostly Gemini ASR for rep's speech)

---

## Competitive Advantage

No field service platform has this:
- **ServiceTitan**: No deaf communication features
- **Jobber**: No deaf communication features
- **Housecall Pro**: No deaf communication features
- **Salesforce Field Service**: No deaf communication features
- **Ava** ($10-15/mo): General captioning, not field-service integrated
- **Google Live Transcribe**: Free but no sign language, no quick taps, no field context

SA21 with Deaf Communication Mode would be **the only field service tool in the market** that enables reps to communicate with deaf homeowners. This is both a feature differentiator and a story that sells the platform.
