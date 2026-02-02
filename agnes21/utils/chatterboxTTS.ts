/**
 * Chatterbox TTS Client for Agnes 21
 * Provides voice cloning TTS capabilities via the Chatterbox backend service.
 */

// API Configuration
const TTS_API_BASE = import.meta.env.VITE_TTS_API_URL || 'http://localhost:8000';

// Available voices
export type VoiceId = 'reeses_piecies' | 'agnes_21' | '21' | 'rufus';

export interface VoiceInfo {
  id: VoiceId;
  name: string;
  description: string;
  duration: string;
  available: boolean;
}

export interface TTSOptions {
  voice?: VoiceId;
  exaggeration?: number; // 0.0 to 1.0 - controls expressiveness
}

// Default voice for feedback (as requested by user)
export const DEFAULT_FEEDBACK_VOICE: VoiceId = 'reeses_piecies';
export const DEFAULT_HOMEOWNER_VOICE: VoiceId = 'agnes_21';
export const DEFAULT_SALESPERSON_VOICE: VoiceId = '21';

/**
 * Check if the TTS service is available
 */
export async function checkTTSHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${TTS_API_BASE}/api/tts/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data.status === 'healthy';
  } catch {
    return false;
  }
}

/**
 * Get list of available voices
 */
export async function getAvailableVoices(): Promise<VoiceInfo[]> {
  try {
    const response = await fetch(`${TTS_API_BASE}/api/tts/voices`);
    if (!response.ok) throw new Error('Failed to fetch voices');
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch voices:', error);
    return [];
  }
}

/**
 * Generate speech audio using Chatterbox TTS
 * @param text - The text to convert to speech
 * @param options - Voice and expressiveness options
 * @returns ArrayBuffer of WAV audio data
 */
export async function generateSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<ArrayBuffer> {
  const { voice = DEFAULT_FEEDBACK_VOICE, exaggeration = 0.4 } = options;

  const response = await fetch(`${TTS_API_BASE}/api/tts/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice, exaggeration }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TTS generation failed: ${error}`);
  }

  return await response.arrayBuffer();
}

/**
 * Generate and play speech audio
 * @param text - The text to speak
 * @param options - Voice and expressiveness options
 * @returns Promise that resolves when audio finishes playing
 */
export async function speakWithChatterbox(
  text: string,
  options: TTSOptions = {}
): Promise<void> {
  const audioData = await generateSpeech(text, options);

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuffer = await audioContext.decodeAudioData(audioData);

  return new Promise((resolve, reject) => {
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.onended = () => resolve();
    source.onerror = (e) => reject(e);
    source.start();
  });
}

/**
 * Play pre-generated audio from URL
 * @param url - URL to the audio file
 * @returns Promise that resolves when audio finishes playing
 */
export async function playAudioFromUrl(url: string): Promise<void> {
  const response = await fetch(url);
  const audioData = await response.arrayBuffer();

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuffer = await audioContext.decodeAudioData(audioData);

  return new Promise((resolve, reject) => {
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.onended = () => resolve();
    source.onerror = (e) => reject(e);
    source.start();
  });
}

/**
 * Create an AudioBuffer from Chatterbox TTS
 * Useful for integrating with existing audio systems
 */
export async function createAudioBuffer(
  text: string,
  options: TTSOptions = {}
): Promise<AudioBuffer> {
  const audioData = await generateSpeech(text, options);
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  return audioContext.decodeAudioData(audioData);
}

/**
 * ChatterboxTTS class for stateful usage
 * Maintains audio context and provides queued playback
 */
export class ChatterboxTTS {
  private audioContext: AudioContext | null = null;
  private isPlaying = false;
  private queue: Array<{ text: string; options: TTSOptions; resolve: () => void; reject: (e: Error) => void }> = [];

  constructor() {
    this.initAudioContext();
  }

  private initAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioContext;
  }

  /**
   * Speak text with voice cloning
   */
  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ text, options, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isPlaying || this.queue.length === 0) return;

    this.isPlaying = true;
    const item = this.queue.shift()!;

    try {
      const audioData = await generateSpeech(item.text, item.options);
      const audioContext = this.initAudioContext();
      const audioBuffer = await audioContext.decodeAudioData(audioData);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      source.onended = () => {
        this.isPlaying = false;
        item.resolve();
        this.processQueue();
      };

      source.start();
    } catch (error) {
      this.isPlaying = false;
      item.reject(error as Error);
      this.processQueue();
    }
  }

  /**
   * Stop all playback and clear queue
   */
  stop() {
    this.queue = [];
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.isPlaying = false;
  }

  /**
   * Check if currently playing
   */
  get playing(): boolean {
    return this.isPlaying;
  }
}

// Singleton instance for easy access
export const chatterboxTTS = new ChatterboxTTS();

/**
 * Fallback chain: Chatterbox -> Gemini -> Web Speech
 */
export async function speakWithFallback(
  text: string,
  options: TTSOptions = {}
): Promise<void> {
  // Try Chatterbox first
  if (await checkTTSHealth()) {
    try {
      await speakWithChatterbox(text, options);
      return;
    } catch (error) {
      console.warn('Chatterbox TTS failed, trying fallback:', error);
    }
  }

  // Fallback to Web Speech API
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(e);
    speechSynthesis.speak(utterance);
  });
}
