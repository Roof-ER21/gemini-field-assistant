/**
 * Sign Language Recognition Service
 *
 * Provides on-device ASL sign recognition using MediaPipe Holistic
 * landmarks + TFLite classification models from Google's Kaggle
 * competition winning solutions.
 *
 * Architecture:
 *   Camera → MediaPipe Holistic (543 landmarks @ 30fps)
 *   → Select 130 key landmarks (lips + hands + upper pose)
 *   → Buffer 30-60 frames (1-2 seconds of signing)
 *   → TFLite classifier → top-k sign predictions
 *   → Confidence threshold → display or fallback to Gemini
 *
 * Phase 2 implementation — models loaded on demand, graceful
 * degradation if MediaPipe or TFLite unavailable.
 *
 * Models:
 *   - GISLR 1st place: 250 isolated ASL signs (HuggingFace)
 *   - Fingerspelling 1st place: 26 letters continuous (GitHub)
 *
 * @see https://huggingface.co/sign/kaggle-asl-signs-1st-place
 * @see https://github.com/ChristofHenkel/kaggle-asl-fingerspelling-1st-place-solution
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignRecognitionResult {
  /** Recognized sign label (e.g., "HELP", "ROOF", "YES") */
  sign: string;
  /** Confidence score 0.0 - 1.0 */
  confidence: number;
  /** Where the recognition came from */
  source: 'on-device' | 'gemini-fallback';
  /** Timestamp of recognition */
  timestamp: number;
}

export interface FingerspellResult {
  /** Accumulated spelled word so far */
  word: string;
  /** Latest letter recognized */
  letter: string;
  /** Confidence of latest letter */
  confidence: number;
  /** Is the word complete (pause detected)? */
  isComplete: boolean;
}

export interface HeadGestureResult {
  /** Detected gesture type */
  gesture: 'nod' | 'shake' | 'tilt' | 'none';
  /** Confidence score */
  confidence: number;
  /** Direction for tilt */
  direction?: 'left' | 'right';
}

export interface LandmarkFrame {
  /** Timestamp in ms */
  timestamp: number;
  /** 543 landmarks, each with x, y, z (normalized 0-1) */
  landmarks: number[][];
}

// ---------------------------------------------------------------------------
// Sign vocabulary (MacArthur-Bates CDI — 250 signs from GISLR competition)
// ---------------------------------------------------------------------------

export const ASL_VOCABULARY = [
  'TV', 'after', 'airplane', 'all', 'alligator', 'animal', 'another',
  'any', 'apple', 'arm', 'awake', 'baby', 'bad', 'bath', 'because',
  'bed', 'bedroom', 'bee', 'before', 'beside', 'better', 'bird',
  'black', 'blow', 'blue', 'book', 'boy', 'bread', 'brother',
  'brown', 'bug', 'but', 'butter', 'buy', 'callonphone', 'can',
  'car', 'cat', 'cereal', 'chair', 'change', 'child', 'chin',
  'clean', 'close', 'closet', 'cloud', 'clown', 'coat', 'cold',
  'comb', 'come', 'computer', 'cook', 'cookie', 'cow', 'cry',
  'cut', 'cute', 'dad', 'dance', 'dark', 'day', 'deer', 'dirty',
  'dog', 'doll', 'donkey', 'door', 'down', 'drawer', 'drink',
  'drop', 'dry', 'dryer', 'duck', 'ear', 'eat', 'elephant',
  'empty', 'every', 'eye', 'face', 'fall', 'farm', 'fast',
  'feet', 'find', 'fine', 'finger', 'finish', 'first', 'fish',
  'flag', 'flower', 'food', 'for', 'frenchfries', 'frog', 'fruit',
  'full', 'funny', 'game', 'girl', 'give', 'go', 'goose', 'grandma',
  'grandpa', 'grass', 'green', 'gum', 'hair', 'happy', 'hat',
  'hate', 'have', 'haveto', 'he', 'head', 'hear', 'help', 'hen',
  'here', 'hide', 'high', 'home', 'horse', 'hot', 'hungry',
  'hurt', 'if', 'into', 'jacket', 'jump', 'kiss', 'kitty',
  'knee', 'know', 'lamp', 'later', 'like', 'lion', 'lips',
  'listen', 'look', 'loud', 'mad', 'make', 'man', 'many', 'milk',
  'mine', 'mitten', 'mom', 'moon', 'morning', 'mouse', 'mouth',
  'nap', 'napkin', 'night', 'no', 'noisy', 'nose', 'not', 'now',
  'nuts', 'old', 'on', 'open', 'orange', 'outside', 'owie',
  'own', 'pajamas', 'pen', 'pencil', 'penny', 'person', 'pet',
  'pig', 'pizza', 'please', 'police', 'pool', 'potty', 'pretty',
  'puppy', 'puzzle', 'quiet', 'rain', 'read', 'red', 'refrigerator',
  'ride', 'room', 'sad', 'same', 'say', 'scissors', 'see', 'shirt',
  'shoe', 'shower', 'sick', 'sleep', 'slow', 'smile', 'snack',
  'snow', 'socks', 'some', 'sorry', 'stay', 'sticky', 'store',
  'story', 'stuck', 'sun', 'table', 'that', 'there', 'think',
  'thirsty', 'time', 'tired', 'tongue', 'tooth', 'touch', 'toy',
  'tree', 'uncle', 'under', 'up', 'vacuum', 'wait', 'wake',
  'want', 'water', 'wet', 'what', 'where', 'white', 'who', 'why',
  'will', 'wind', 'window', 'with', 'wolf', 'woman', 'work',
  'worm', 'would', 'write', 'yellow', 'yes', 'yesterday', 'you',
  'yucky', 'zipper', 'zoo'
] as const;

export type ASLSign = typeof ASL_VOCABULARY[number];

// ---------------------------------------------------------------------------
// Head gesture detection from pose landmarks
// ---------------------------------------------------------------------------

/**
 * Detects head nods and shakes from a buffer of nose landmark positions.
 * Uses the nose tip (landmark index 0 in pose) Y-coordinate for nods
 * and X-coordinate for shakes.
 *
 * @param frames - Recent landmark frames (last ~30 frames / 1 second)
 * @returns Detected gesture or 'none'
 */
export function detectHeadGesture(frames: LandmarkFrame[]): HeadGestureResult {
  if (frames.length < 15) {
    return { gesture: 'none', confidence: 0 };
  }

  // Use last 30 frames (~1 second at 30fps)
  const recent = frames.slice(-30);

  // Extract nose tip position (MediaPipe pose landmark 0)
  const noseY = recent.map(f => f.landmarks[0]?.[1] ?? 0);
  const noseX = recent.map(f => f.landmarks[0]?.[0] ?? 0);

  // Detect oscillations in Y (nod) and X (shake)
  const yOscillations = countOscillations(noseY, 0.015);
  const xOscillations = countOscillations(noseX, 0.02);

  if (yOscillations >= 2) {
    return {
      gesture: 'nod',
      confidence: Math.min(0.95, 0.5 + yOscillations * 0.15),
    };
  }

  if (xOscillations >= 2) {
    return {
      gesture: 'shake',
      confidence: Math.min(0.95, 0.5 + xOscillations * 0.15),
    };
  }

  return { gesture: 'none', confidence: 0 };
}

/**
 * Count direction changes (oscillations) in a signal, ignoring
 * changes smaller than the threshold.
 */
function countOscillations(values: number[], threshold: number): number {
  let oscillations = 0;
  let direction: 'up' | 'down' | null = null;
  let lastPeak = values[0];

  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - lastPeak;

    if (diff > threshold && direction !== 'up') {
      if (direction === 'down') oscillations++;
      direction = 'up';
      lastPeak = values[i];
    } else if (diff < -threshold && direction !== 'down') {
      if (direction === 'up') oscillations++;
      direction = 'down';
      lastPeak = values[i];
    }

    // Track the extreme in current direction
    if (direction === 'up' && values[i] > lastPeak) lastPeak = values[i];
    if (direction === 'down' && values[i] < lastPeak) lastPeak = values[i];
  }

  return oscillations;
}

// ---------------------------------------------------------------------------
// Model loading status (for UI feedback)
// ---------------------------------------------------------------------------

export interface ModelStatus {
  mediapipe: 'not-loaded' | 'loading' | 'ready' | 'error';
  signClassifier: 'not-loaded' | 'loading' | 'ready' | 'error';
  fingerspelling: 'not-loaded' | 'loading' | 'ready' | 'error';
}

/**
 * Check if the browser supports the required APIs for sign language
 * recognition (camera, MediaPipe, TFLite/WASM).
 */
export function checkBrowserSupport(): {
  camera: boolean;
  mediaDevices: boolean;
  webgl: boolean;
  wasm: boolean;
} {
  return {
    camera: typeof navigator !== 'undefined' && 'mediaDevices' in navigator,
    mediaDevices: typeof navigator !== 'undefined' && 'getUserMedia' in (navigator.mediaDevices || {}),
    webgl: (() => {
      try {
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
      } catch {
        return false;
      }
    })(),
    wasm: typeof WebAssembly !== 'undefined',
  };
}

// ---------------------------------------------------------------------------
// Gemini fallback for low-confidence signs
// ---------------------------------------------------------------------------

/**
 * Send a video frame to Gemini Flash for sign language identification
 * when the on-device model returns low confidence.
 *
 * @param frameBase64 - JPEG frame as base64 string
 * @param apiKey - Gemini API key
 * @returns Recognized sign or null
 */
export async function geminiSignFallback(
  frameBase64: string,
  apiKey: string,
): Promise<SignRecognitionResult | null> {
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [
          {
            text: `You are an ASL (American Sign Language) recognition system. Look at this image of a person signing and identify the ASL sign being performed.

Respond with ONLY a JSON object in this format:
{"sign": "WORD", "confidence": 0.85}

If you cannot identify a clear ASL sign, respond with:
{"sign": null, "confidence": 0}

Do not add any other text.`,
          },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: frameBase64,
            },
          },
        ],
      }],
    });

    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return null;

    const parsed = JSON.parse(text);
    if (parsed.sign && parsed.confidence > 0.5) {
      return {
        sign: parsed.sign,
        confidence: parsed.confidence,
        source: 'gemini-fallback',
        timestamp: Date.now(),
      };
    }

    return null;
  } catch (err) {
    console.error('[SignLanguageService] Gemini fallback error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Utility: capture frame from video element as base64 JPEG
// ---------------------------------------------------------------------------

export function captureFrameAsBase64(
  video: HTMLVideoElement,
  quality: number = 0.7,
): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return dataUrl.split(',')[1] || null;
  } catch {
    return null;
  }
}
