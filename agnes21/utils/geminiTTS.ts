/**
 * Agnes Voice Utility - Hybrid Approach
 *
 * Uses Gemini Live for English (consistent with roleplay/feedback)
 * Falls back to Web Speech API for other languages
 */

import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { base64ToUint8Array, decodeAudioData } from './audioUtils';
import { SupportedLanguage, SupportedDialect, SUPPORTED_LANGUAGES, DIALECT_VARIANTS, getDialectConfig } from '../types';
import { env } from '../../src/config/env';

// ============================================
// Gemini Live TTS for English
// ============================================

class GeminiEnglishTTS {
  private aiClient: GoogleGenAI | null = null;
  private session: any = null;
  private audioContext: AudioContext | null = null;
  private audioQueue: AudioBufferSourceNode[] = [];
  private resolveCallback: (() => void) | null = null;
  private isInitialized: boolean = false;
  private nextStartTime: number = 0;
  private isStopped: boolean = false; // Flag to prevent audio after stop
  private speakSessionId: number = 0; // Track speak session to prevent stale callbacks

  async init(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      const apiKey = import.meta.env.VITE_GOOGLE_AI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn('Gemini API key not found');
        return false;
      }

      this.aiClient = new GoogleGenAI({ apiKey });

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: 24000 });

      this.isInitialized = true;
      console.log('🎤 Gemini English TTS initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize Gemini TTS:', error);
      return false;
    }
  }

  private async connect(): Promise<boolean> {
    if (!this.aiClient) return false;
    if (this.session) return true;

    try {
      console.log('🔌 Connecting to Gemini Live for English TTS...');

      const sessionPromise = this.aiClient.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            console.log('✅ Gemini TTS session opened');
          },
          onmessage: async (message: LiveServerMessage) => {
            const serverContent = message.serverContent;

            // Handle audio
            const base64Audio = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              await this.playAudioChunk(base64Audio);
            }

            // Check if done
            if (serverContent?.turnComplete) {
              setTimeout(() => {
                this.resolveCallback?.();
                this.resolveCallback = null;
              }, 200);
            }
          },
          onclose: () => {
            console.log('Gemini TTS session closed');
            this.session = null;
          },
          onerror: (error) => {
            console.error('Gemini TTS error:', error);
            this.session = null;
            this.resolveCallback?.();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            languageCode: 'en-US'
          },
          systemInstruction: `You are Agnes, a warm and professional assistant.
Your task is to read text aloud naturally.
Do NOT add commentary - just speak the exact text given.
Speak clearly and warmly like a professional translator.`
        }
      });

      this.session = await sessionPromise;
      return true;
    } catch (error) {
      console.error('Failed to connect Gemini session:', error);
      return false;
    }
  }

  private async playAudioChunk(base64Audio: string): Promise<void> {
    // Don't play audio if we've been stopped
    if (this.isStopped || !this.audioContext) return;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    try {
      const audioBuffer = await decodeAudioData(
        base64ToUint8Array(base64Audio),
        this.audioContext
      );

      // Double check we weren't stopped during decode
      if (this.isStopped) return;

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      const currentTime = this.audioContext.currentTime;
      if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime;
      }

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;

      this.audioQueue.push(source);
      source.onended = () => {
        const idx = this.audioQueue.indexOf(source);
        if (idx > -1) this.audioQueue.splice(idx, 1);
      };
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  }

  async speak(text: string): Promise<boolean> {
    // Reset stop flag and increment session ID when starting new speech
    this.isStopped = false;
    this.speakSessionId++;
    const currentSessionId = this.speakSessionId;

    if (!this.isInitialized) {
      const ok = await this.init();
      if (!ok) return false;
    }

    // Check if stopped during init
    if (this.isStopped || this.speakSessionId !== currentSessionId) {
      return false;
    }

    const connected = await this.connect();
    if (!connected || !this.session) {
      console.warn('Gemini session not available');
      return false;
    }

    // Check if stopped during connect
    if (this.isStopped || this.speakSessionId !== currentSessionId) {
      return false;
    }

    console.log(`🔊 Gemini speaking: "${text.substring(0, 50)}..."`);

    return new Promise((resolve) => {
      let resolved = false; // Prevent double resolution

      const timeout = setTimeout(() => {
        if (!resolved && this.speakSessionId === currentSessionId) {
          resolved = true;
          console.warn('Gemini speech timeout');
          this.resolveCallback = null;
          resolve(false);
        }
      }, 15000);

      this.resolveCallback = () => {
        if (!resolved && this.speakSessionId === currentSessionId) {
          resolved = true;
          clearTimeout(timeout);
          resolve(true);
        }
      };

      try {
        this.session.sendClientContent({
          turns: [{
            role: 'user',
            parts: [{ text: `Read this aloud: "${text}"` }]
          }],
          turnComplete: true
        });
      } catch (error) {
        if (!resolved) {
          resolved = true;
          console.error('Error sending to Gemini:', error);
          clearTimeout(timeout);
          resolve(false);
        }
      }
    });
  }

  stop(): void {
    // Set stopped flag FIRST to prevent any pending audio from playing
    this.isStopped = true;

    // Stop all queued audio
    this.audioQueue.forEach(s => { try { s.stop(); } catch {} });
    this.audioQueue = [];
    this.nextStartTime = 0;

    // Resolve any pending promise
    this.resolveCallback?.();
    this.resolveCallback = null;

    // Close the session to prevent more audio chunks
    if (this.session) {
      try {
        this.session.close();
        console.log('🔌 Closed Gemini English session');
      } catch (e) {
        // Ignore close errors
      }
      this.session = null;
    }
  }

  async cleanup(): Promise<void> {
    this.stop();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }
    this.audioContext = null;
    this.isInitialized = false;
  }
}

// Singleton for Gemini English
const geminiEnglish = new GeminiEnglishTTS();

// ============================================
// Gemini TTS for ALL Languages (Premium Quality)
// ============================================

/**
 * Gemini supported language codes for Live TTS API
 * Maps our language/dialect codes to Gemini's BCP-47 language codes
 */
const GEMINI_TTS_LANGUAGES: Record<string, string> = {
  // Primary languages (21 total)
  'en': 'en-US',
  'es': 'es-MX',  // Default to Mexican Spanish
  'zh': 'cmn-CN', // Mandarin Chinese
  'vi': 'vi-VN',
  'ko': 'ko-KR',
  'pt': 'pt-BR',  // Brazilian Portuguese
  'ar': 'ar-XA',  // Arabic (general)
  'fr': 'fr-FR',
  'ru': 'ru-RU',
  'tl': 'fil-PH', // Filipino/Tagalog
  'hi': 'hi-IN',
  'ja': 'ja-JP',
  'de': 'de-DE',
  'it': 'it-IT',
  'pl': 'pl-PL',
  'uk': 'uk-UA',
  'th': 'th-TH',
  'bn': 'bn-IN',  // Bengali
  'fa': 'fa-IR',  // Persian/Farsi
  'ht': 'fr-HT',  // Haitian Creole (use French as base, closest supported)
  'pa': 'pa-IN',  // Punjabi

  // Spanish dialects (5)
  'es-mx': 'es-MX',  // Mexican
  'es-pr': 'es-US',  // Puerto Rican (US Spanish)
  'es-es': 'es-ES',  // Castilian
  'es-ar': 'es-AR',  // Argentine
  'es-co': 'es-CO',  // Colombian

  // Arabic dialects (5)
  'ar-eg': 'ar-EG',  // Egyptian
  'ar-lb': 'ar-LB',  // Lebanese
  'ar-sa': 'ar-SA',  // Saudi
  'ar-ma': 'ar-MA',  // Moroccan
  'ar-ae': 'ar-AE',  // Gulf/UAE
};

/**
 * Gemini voice names optimized for each language
 * Uses warm, professional voices suitable for business translation
 */
const GEMINI_VOICE_BY_LANGUAGE: Record<string, string> = {
  // Romance languages - warm, melodic voices
  'en': 'Kore',      // English - warm female
  'es': 'Aoede',     // Spanish - natural, warm
  'es-mx': 'Aoede',
  'es-es': 'Aoede',
  'es-ar': 'Aoede',
  'es-co': 'Aoede',
  'es-pr': 'Aoede',
  'pt': 'Aoede',     // Portuguese
  'fr': 'Aoede',     // French
  'it': 'Aoede',     // Italian

  // Germanic languages
  'de': 'Fenrir',    // German

  // Asian languages
  'zh': 'Puck',      // Chinese
  'ja': 'Puck',      // Japanese
  'ko': 'Puck',      // Korean
  'vi': 'Kore',      // Vietnamese
  'th': 'Kore',      // Thai
  'hi': 'Kore',      // Hindi
  'bn': 'Kore',      // Bengali

  // Slavic languages
  'ru': 'Charon',    // Russian
  'pl': 'Charon',    // Polish
  'uk': 'Charon',    // Ukrainian

  // Semitic languages
  'ar': 'Charon',    // Arabic
  'ar-eg': 'Charon',
  'ar-lb': 'Charon',
  'ar-sa': 'Charon',
  'ar-ma': 'Charon',
  'ar-ae': 'Charon',

  // Other languages
  'tl': 'Kore',      // Tagalog
  'fa': 'Charon',    // Persian
  'ht': 'Aoede',     // Haitian Creole (French-based, use warm voice)
  'pa': 'Kore',      // Punjabi

  // Default fallback
  'default': 'Kore',
};

/**
 * Multi-language Gemini TTS class
 * Supports all languages with premium Gemini voices
 */
class GeminiMultiLanguageTTS {
  private aiClient: GoogleGenAI | null = null;
  private sessions: Map<string, any> = new Map();
  private audioContext: AudioContext | null = null;
  private audioQueue: AudioBufferSourceNode[] = [];
  private resolveCallback: (() => void) | null = null;
  private isInitialized: boolean = false;
  private nextStartTime: number = 0;
  private isStopped: boolean = false; // Flag to prevent audio after stop
  private speakSessionId: number = 0; // Track speak session to prevent stale callbacks

  async init(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      const apiKey = import.meta.env.VITE_GOOGLE_AI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn('Gemini API key not found');
        return false;
      }

      this.aiClient = new GoogleGenAI({ apiKey });

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: 24000 });

      this.isInitialized = true;
      console.log('🌍 Gemini Multi-Language TTS initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize Gemini Multi-Language TTS:', error);
      return false;
    }
  }

  /**
   * Get language-specific system instruction to prevent language switching
   */
  private getSystemInstruction(langCode: string): string {
    // For English: be VERY explicit to prevent accidental language switching
    if (langCode === 'en') {
      return `You are Agnes, a professional English voice assistant.
IMPORTANT: You MUST speak ONLY in American English. Never switch to any other language.
Your task is to read the exact text given aloud in clear American English.
Do NOT add commentary, translate, or modify the text.
Speak naturally with warm, professional intonation.
Even if the text contains words from other languages, pronounce them with an American English accent.`;
    }

    // For other languages: be explicit about the target language
    const languageNames: Record<string, string> = {
      'es': 'Spanish', 'es-mx': 'Mexican Spanish', 'es-es': 'Castilian Spanish',
      'fr': 'French', 'de': 'German', 'it': 'Italian', 'pt': 'Portuguese',
      'zh': 'Mandarin Chinese', 'ja': 'Japanese', 'ko': 'Korean',
      'hi': 'Hindi', 'ar': 'Arabic', 'ru': 'Russian', 'vi': 'Vietnamese',
      'tl': 'Tagalog', 'th': 'Thai', 'bn': 'Bengali', 'pa': 'Punjabi',
      'pl': 'Polish', 'uk': 'Ukrainian', 'fa': 'Persian', 'ht': 'Haitian Creole'
    };
    const langName = languageNames[langCode] || langCode.toUpperCase();

    return `You are Agnes, a professional ${langName} voice assistant.
IMPORTANT: You MUST speak ONLY in ${langName}. Do not switch to any other language.
Your task is to read the exact text given aloud in clear ${langName}.
Do NOT add commentary, translate to other languages, or modify the text.
Speak naturally with warm, professional intonation appropriate for ${langName}.`;
  }

  /**
   * Get or create a session for a specific language
   */
  private async getSession(langCode: string): Promise<any> {
    if (!this.aiClient) return null;

    // Check for existing session
    if (this.sessions.has(langCode)) {
      return this.sessions.get(langCode);
    }

    try {
      const geminiLangCode = GEMINI_TTS_LANGUAGES[langCode] || GEMINI_TTS_LANGUAGES['en'];
      const voiceName = GEMINI_VOICE_BY_LANGUAGE[langCode] || GEMINI_VOICE_BY_LANGUAGE['default'];

      console.log(`🔌 Connecting Gemini TTS for ${langCode} (${geminiLangCode}, voice: ${voiceName})...`);

      const session = await this.aiClient.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            console.log(`✅ Gemini TTS session opened for ${langCode}`);
          },
          onmessage: async (message: LiveServerMessage) => {
            const serverContent = message.serverContent;

            // Handle audio
            const base64Audio = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              await this.playAudioChunk(base64Audio);
            }

            // Check if done
            if (serverContent?.turnComplete) {
              setTimeout(() => {
                this.resolveCallback?.();
                this.resolveCallback = null;
              }, 200);
            }
          },
          onclose: () => {
            console.log(`Gemini TTS session closed for ${langCode}`);
            this.sessions.delete(langCode);
          },
          onerror: (error) => {
            console.error(`Gemini TTS error for ${langCode}:`, error);
            this.sessions.delete(langCode);
            this.resolveCallback?.();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
            languageCode: geminiLangCode
          },
          systemInstruction: this.getSystemInstruction(langCode)
        }
      });

      this.sessions.set(langCode, session);
      return session;
    } catch (error) {
      console.error(`Failed to create Gemini session for ${langCode}:`, error);
      return null;
    }
  }

  /**
   * Force clear a specific language session (useful before critical operations)
   */
  clearSession(langCode: string): void {
    const session = this.sessions.get(langCode);
    if (session) {
      try {
        session.close();
      } catch (e) {
        // Already closed
      }
      this.sessions.delete(langCode);
      console.log(`🗑️ Cleared session for ${langCode}`);
    }
  }

  private async playAudioChunk(base64Audio: string): Promise<void> {
    // Don't play audio if we've been stopped
    if (this.isStopped || !this.audioContext) return;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    try {
      const audioBuffer = await decodeAudioData(
        base64ToUint8Array(base64Audio),
        this.audioContext
      );

      // Double check we weren't stopped during decode
      if (this.isStopped) return;

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      const currentTime = this.audioContext.currentTime;
      if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime;
      }

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;

      this.audioQueue.push(source);
      source.onended = () => {
        const idx = this.audioQueue.indexOf(source);
        if (idx > -1) this.audioQueue.splice(idx, 1);
      };
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  }

  /**
   * Check if a language is supported by Gemini TTS
   */
  isLanguageSupported(langCode: string): boolean {
    return langCode in GEMINI_TTS_LANGUAGES;
  }

  /**
   * Speak text in any supported language with retry support
   */
  async speak(text: string, langCode: string, retryCount: number = 0): Promise<boolean> {
    // Reset stop flag and increment session ID when starting new speech
    this.isStopped = false;
    this.speakSessionId++;
    const currentSessionId = this.speakSessionId;

    if (!this.isInitialized) {
      const ok = await this.init();
      if (!ok) return false;
    }

    // Check if stopped during init
    if (this.isStopped || this.speakSessionId !== currentSessionId) {
      return false;
    }

    // Check if language is supported
    if (!this.isLanguageSupported(langCode)) {
      console.log(`⚠️ Language ${langCode} not supported by Gemini TTS`);
      return false;
    }

    // Clear any stale sessions for this language before getting a new one
    if (retryCount > 0) {
      this.sessions.delete(langCode);
    }

    const session = await this.getSession(langCode);
    if (!session) {
      console.warn(`Gemini session not available for ${langCode}`);
      return false;
    }

    // Check if stopped during session creation
    if (this.isStopped || this.speakSessionId !== currentSessionId) {
      return false;
    }

    console.log(`🔊 Gemini speaking in ${langCode}: "${text.substring(0, 50)}..."${retryCount > 0 ? ` (retry ${retryCount})` : ''}`);

    // Dynamic timeout based on text length: ~5 seconds per 100 characters, minimum 20s, max 60s
    const baseTimeout = langCode === 'en' ? 20000 : 30000;
    const textLengthBonus = Math.floor(text.length / 100) * 5000; // 5s per 100 chars
    const timeoutMs = Math.min(60000, baseTimeout + textLengthBonus);

    const success = await new Promise<boolean>((resolve) => {
      let resolved = false; // Prevent double resolution

      const timeout = setTimeout(() => {
        if (!resolved && this.speakSessionId === currentSessionId) {
          resolved = true;
          console.warn(`Gemini speech timeout for ${langCode}`);
          this.resolveCallback = null;
          resolve(false);
        }
      }, timeoutMs);

      this.resolveCallback = () => {
        if (!resolved && this.speakSessionId === currentSessionId) {
          resolved = true;
          clearTimeout(timeout);
          resolve(true);
        }
      };

      try {
        session.sendClientContent({
          turns: [{
            role: 'user',
            parts: [{ text: `Read this aloud: "${text}"` }]
          }],
          turnComplete: true
        });
      } catch (error) {
        if (!resolved) {
          resolved = true;
          console.error(`Error sending to Gemini for ${langCode}:`, error);
          clearTimeout(timeout);
          resolve(false);
        }
      }
    });

    // Retry once for non-English languages if failed (but not if stopped)
    if (!success && retryCount < 1 && langCode !== 'en' && !this.isStopped && this.speakSessionId === currentSessionId) {
      console.log(`🔄 Retrying Gemini TTS for ${langCode}...`);
      return this.speak(text, langCode, retryCount + 1);
    }

    return success;
  }

  stop(): void {
    // Set stopped flag FIRST to prevent any pending audio from playing
    this.isStopped = true;

    // Stop all queued audio
    this.audioQueue.forEach(s => { try { s.stop(); } catch {} });
    this.audioQueue = [];
    this.nextStartTime = 0;

    // Resolve any pending promise
    this.resolveCallback?.();
    this.resolveCallback = null;

    // Close all active sessions to prevent more audio chunks
    this.sessions.forEach((session, langCode) => {
      try {
        session.close();
        console.log(`🔌 Closed Gemini session for ${langCode}`);
      } catch (e) {
        // Ignore close errors
      }
    });
    this.sessions.clear();
  }

  // Reset stopped flag (called before speaking)
  resetStopFlag(): void {
    this.isStopped = false;
  }

  async cleanup(): Promise<void> {
    this.stop();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }
    this.audioContext = null;
    this.isInitialized = false;
  }
}

// Singleton for multi-language Gemini TTS
const geminiMultiLang = new GeminiMultiLanguageTTS();

// ============================================
// Web Speech API for Other Languages
// ============================================

let voicesLoaded = false;
let cachedVoices: SpeechSynthesisVoice[] = [];

const getVoices = (): Promise<SpeechSynthesisVoice[]> => {
  return new Promise((resolve) => {
    if (voicesLoaded && cachedVoices.length > 0) {
      resolve(cachedVoices);
      return;
    }

    const loadVoices = () => {
      cachedVoices = speechSynthesis.getVoices();
      if (cachedVoices.length > 0) {
        voicesLoaded = true;
        resolve(cachedVoices);
      }
    };

    loadVoices();
    if (!voicesLoaded) {
      speechSynthesis.onvoiceschanged = loadVoices;
      setTimeout(() => {
        loadVoices();
        resolve(cachedVoices);
      }, 1000);
    }
  });
};

const VOICE_PREFERENCES: Record<string, string[]> = {
  en: ['samantha', 'siri', 'allison', 'ava', 'karen', 'enhanced'],
  es: ['paulina', 'mónica', 'monica', 'siri', 'enhanced'],
  zh: ['tingting', 'ting-ting', 'meijia', 'siri', 'enhanced'],
  vi: ['linh', 'siri', 'enhanced'],
  ko: ['yuna', 'sora', 'siri', 'enhanced'],
  pt: ['luciana', 'fernanda', 'siri', 'enhanced'],
  ar: ['laila', 'mariam', 'maged', 'siri', 'enhanced'],
  fr: ['amélie', 'amelie', 'audrey', 'siri', 'enhanced'],
  ru: ['milena', 'katya', 'yuri', 'siri', 'enhanced'],
  tl: ['siri', 'google filipino', 'microsoft', 'enhanced', 'google', 'natural'],
  hi: ['lekha', 'siri', 'enhanced'],
  ja: ['kyoko', 'otoya', 'siri', 'enhanced'],
  de: ['anna', 'petra', 'helena', 'siri', 'enhanced'],
  it: ['alice', 'federica', 'elsa', 'siri', 'enhanced'],
  pl: ['zosia', 'ewa', 'siri', 'enhanced'],
  uk: ['siri', 'lesya', 'enhanced'],
  fa: ['siri', 'google farsi', 'google persian', 'microsoft', 'enhanced', 'natural'],
  th: ['kanya', 'narisa', 'siri', 'google thai', 'microsoft', 'enhanced', 'natural'],
  bn: ['siri', 'google bengali', 'google bangla', 'microsoft', 'enhanced', 'natural'],
  ht: ['amélie', 'amelie', 'audrey', 'thomas', 'google french', 'microsoft french', 'french', 'enhanced', 'natural'],
  pa: ['siri', 'google punjabi', 'google gurmukhi', 'microsoft', 'enhanced', 'natural'],
};

// Dialect-specific voice preferences (US-focused dialects)
const DIALECT_VOICE_PREFERENCES: Record<string, string[]> = {
  // Spanish variants
  'es-mx': ['paulina', 'juan', 'mónica', 'siri', 'enhanced'],     // Mexican Spanish
  'es-pr': ['paulina', 'mónica', 'siri', 'enhanced'],              // Puerto Rican Spanish
  'es-es': ['jorge', 'mónica', 'lucia', 'siri', 'enhanced'],       // Castilian Spanish
  'es-ar': ['diego', 'mónica', 'siri', 'enhanced'],                // Argentine Spanish
  'es-co': ['mónica', 'paulina', 'siri', 'enhanced'],              // Colombian Spanish

  // Arabic variants
  'ar-eg': ['laila', 'maged', 'tarik', 'siri', 'enhanced'],        // Egyptian Arabic
  'ar-lb': ['laila', 'mariam', 'siri', 'enhanced'],                // Lebanese Arabic
  'ar-sa': ['maged', 'mishaal', 'siri', 'enhanced'],               // Saudi Arabic
  'ar-ma': ['laila', 'mariam', 'siri', 'enhanced'],                // Moroccan Arabic
  'ar-ae': ['maged', 'mishaal', 'siri', 'enhanced'],               // Gulf Arabic
};

const SPEECH_RATES: Record<string, number> = {
  en: 0.95, es: 0.92, zh: 0.85, vi: 0.85, ko: 0.90,
  pt: 0.92, ar: 0.85, fr: 0.92, ru: 0.90, tl: 0.92,
  hi: 0.88, ja: 0.88, de: 0.92, it: 0.92, pl: 0.90,
  uk: 0.90, fa: 0.85, th: 0.85, bn: 0.88, ht: 0.90, pa: 0.88,
};

// Dialect-specific speech rates for natural pacing
const DIALECT_SPEECH_RATES: Record<string, number> = {
  // Spanish variants
  'es-mx': 0.92,  // Mexican Spanish - natural conversational pace
  'es-pr': 0.90,  // Puerto Rican Spanish - Caribbean rhythm
  'es-es': 0.88,  // Castilian Spanish - slightly faster
  'es-ar': 0.90,  // Argentine Spanish - moderate pace
  'es-co': 0.92,  // Colombian Spanish - clear pronunciation

  // Arabic variants
  'ar-eg': 0.85,  // Egyptian Arabic - clear enunciation
  'ar-lb': 0.88,  // Lebanese Arabic - slightly faster
  'ar-sa': 0.82,  // Saudi Arabic - formal, measured pace
  'ar-ma': 0.85,  // Moroccan Arabic - moderate pace
  'ar-ae': 0.85,  // Gulf Arabic - moderate pace
};

/**
 * Get voice preferences for a language or dialect
 */
const getVoicePreferences = (langOrDialect: SupportedLanguage | SupportedDialect): string[] => {
  // Check if it's a dialect first
  if (langOrDialect.includes('-')) {
    const dialectPrefs = DIALECT_VOICE_PREFERENCES[langOrDialect];
    if (dialectPrefs) return dialectPrefs;

    // Fallback to parent language
    const parentLang = langOrDialect.split('-')[0] as SupportedLanguage;
    return VOICE_PREFERENCES[parentLang] || VOICE_PREFERENCES.en;
  }

  return VOICE_PREFERENCES[langOrDialect] || VOICE_PREFERENCES.en;
};

/**
 * Get speech rate for a language or dialect
 */
const getSpeechRate = (langOrDialect: SupportedLanguage | SupportedDialect): number => {
  // Check if it's a dialect first
  if (langOrDialect.includes('-')) {
    const dialectRate = DIALECT_SPEECH_RATES[langOrDialect];
    if (dialectRate) return dialectRate;

    // Fallback to parent language
    const parentLang = langOrDialect.split('-')[0] as SupportedLanguage;
    return SPEECH_RATES[parentLang] || 0.9;
  }

  return SPEECH_RATES[langOrDialect] || 0.9;
};

const scoreVoice = (voice: SpeechSynthesisVoice, langOrDialect: string): number => {
  const nameLower = voice.name.toLowerCase();
  let score = 0;

  if (nameLower.includes('siri')) score += 500;
  if (nameLower.includes('enhanced') || nameLower.includes('premium')) score += 300;

  // Use dialect-aware voice preferences
  const prefs = getVoicePreferences(langOrDialect as SupportedLanguage);
  for (let i = 0; i < prefs.length; i++) {
    if (nameLower.includes(prefs[i])) score += 200 - i * 10;
  }

  if (voice.localService) score += 50;
  if (nameLower.includes('google')) score -= 100;

  return score;
};

const findBestVoice = async (langOrDialect: SupportedLanguage | SupportedDialect): Promise<SpeechSynthesisVoice | null> => {
  const voices = await getVoices();

  // Determine voice code - check dialect first, then language
  let voiceCode: string;
  let langPrefix: string;

  if (langOrDialect.includes('-')) {
    // It's a dialect - use dialect-specific voice code
    const dialectConfig = getDialectConfig(langOrDialect as SupportedDialect);
    voiceCode = dialectConfig?.voiceCode || 'en-US';
    langPrefix = langOrDialect.split('-')[0];
  } else {
    // It's a base language
    const langConfig = SUPPORTED_LANGUAGES.find(l => l.code === langOrDialect);
    voiceCode = langConfig?.voiceCode || 'en-US';
    langPrefix = voiceCode.split('-')[0];
  }

  const matching = voices.filter(v => {
    const vLang = v.lang.toLowerCase();
    // Match by dialect code first, then by language prefix
    return vLang === voiceCode.toLowerCase() ||
           vLang.startsWith(langPrefix.toLowerCase()) ||
           vLang.startsWith(langOrDialect.toLowerCase());
  });

  if (matching.length === 0) return voices[0] || null;

  const scored = matching.map(v => ({ voice: v, score: scoreVoice(v, langOrDialect) }))
    .sort((a, b) => b.score - a.score);

  return scored[0].voice;
};

const speakWithWebSpeech = async (
  text: string,
  lang: SupportedLanguage,
  onEnd?: () => void,
  onError?: (error: string) => void
): Promise<void> => {
  speechSynthesis.cancel();

  return new Promise(async (resolve) => {
    try {
      const voice = await findBestVoice(lang);
      const utterance = new SpeechSynthesisUtterance(text);

      if (voice) {
        utterance.voice = voice;
        console.log(`🎤 Using voice: ${voice.name}`);
      }

      const langConfig = SUPPORTED_LANGUAGES.find(l => l.code === lang);
      utterance.lang = langConfig?.voiceCode || 'en-US';
      utterance.rate = getSpeechRate(lang);
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      const timeout = setTimeout(() => {
        speechSynthesis.cancel();
        onEnd?.();
        resolve();
      }, 30000);

      utterance.onend = () => {
        clearTimeout(timeout);
        console.log('✅ Web Speech finished');
        onEnd?.();
        resolve();
      };

      utterance.onerror = (event) => {
        clearTimeout(timeout);
        if (event.error !== 'interrupted') {
          console.error('Speech error:', event.error);
          onError?.(event.error);
        }
        resolve();
      };

      speechSynthesis.speak(utterance);
    } catch (error) {
      console.error('Web Speech error:', error);
      onError?.(error instanceof Error ? error.message : 'Unknown error');
      resolve();
    }
  });
};

// ============================================
// Main Export - Hybrid Approach
// ============================================

/**
 * Agnes speaks - uses Gemini TTS (Kore voice) ONLY
 * NO Web Speech fallback - for voice consistency across the app
 *
 * @param text - Text to speak
 * @param lang - Language code (default: 'en')
 * @param options.onEnd - Callback when speech completes
 * @param options.onError - Callback on error
 * @param options.forceNewSession - Force create fresh session (prevents language mixing)
 */
export const agnesVoiceSpeak = async (
  text: string,
  lang: SupportedLanguage | SupportedDialect = 'en',
  options?: {
    onEnd?: () => void;
    onError?: (error: string) => void;
    forceNewSession?: boolean;
  }
): Promise<void> => {
  const { onEnd, onError, forceNewSession } = options || {};

  if (!text || text.trim().length === 0) {
    onEnd?.();
    return;
  }

  console.log(`🔊 Agnes speaking in ${lang}: "${text.substring(0, 50)}..."`);

  // For English score reading, force fresh session to prevent language mixing
  if (forceNewSession || lang === 'en') {
    geminiMultiLang.clearSession(lang);
    console.log(`🔄 Forced fresh session for ${lang} to ensure correct language`);
  }

  // Try Gemini TTS (Kore voice) - NO FALLBACK to Web Speech
  if (geminiMultiLang.isLanguageSupported(lang)) {
    try {
      const success = await geminiMultiLang.speak(text, lang);
      if (success) {
        console.log(`✅ Gemini TTS (Kore) success for ${lang}`);
        onEnd?.();
        return; // SUCCESS - exit here
      }
    } catch (error) {
      console.warn('Gemini TTS error:', error);
      geminiMultiLang.stop();
    }
  }

  // REMOVED: Web Speech fallback (causes dual voice and inconsistent quality)
  // If Gemini fails, show error message instead of robotic voice
  console.error(`❌ Gemini TTS not available for ${lang} - voice playback skipped`);
  onError?.('Voice not available');
  onEnd?.(); // Still call onEnd to resolve promise
};

/**
 * Force clear all TTS sessions - useful when switching contexts
 */
export const clearAllTTSSessions = (): void => {
  geminiMultiLang.cleanup();
  console.log('🗑️ Cleared all TTS sessions');
};

/**
 * Stop Agnes from speaking
 */
export const agnesVoiceStop = (): void => {
  geminiEnglish.stop();
  geminiMultiLang.stop();
  speechSynthesis.cancel();
};

/**
 * Check if speaking
 */
export const isAgnesSpeaking = (): boolean => {
  return speechSynthesis.speaking;
};

/**
 * Initialize
 */
export const initGeminiTTS = async (): Promise<void> => {
  await Promise.all([
    geminiEnglish.init(),
    geminiMultiLang.init(),
    getVoices()
  ]);
  console.log('🎤 Agnes voice system initialized (multi-language Gemini TTS + Web Speech fallback)');
};

/**
 * Cleanup
 */
export const cleanupGeminiTTS = async (): Promise<void> => {
  agnesVoiceStop();
  await Promise.all([
    geminiEnglish.cleanup(),
    geminiMultiLang.cleanup()
  ]);
};

// ============================================
// Demo Roleplay Voice Support
// ============================================

/**
 * Available Gemini voice names for roleplay demos
 * - Charon: Deep, authoritative male voice (good for salesperson)
 * - Puck: Neutral, professional voice
 * - Kore: Warm female voice (good for homeowner)
 * - Aoede: Natural, warm female voice
 * - Fenrir: German-style voice
 */
export type GeminiVoice = 'Charon' | 'Puck' | 'Kore' | 'Aoede' | 'Fenrir';

// Demo roleplay voice state (with proper session tracking)
let demoAudioContext: AudioContext | null = null;
let demoAudioQueue: AudioBufferSourceNode[] = [];
let demoNextStartTime: number = 0;
let demoResolveCallback: (() => void) | null = null;
let demoAiClient: GoogleGenAI | null = null;

// Session tracking to prevent race conditions
let activeSession: any = null;
let activeSessionId: string | null = null;
let demoWasStopped = false; // Track if stopped manually (to prevent callbacks)

/**
 * Speak text with a specific voice for demo roleplay
 * Properly cancels previous session before creating new one
 */
export const speakWithDemoVoice = async (
  text: string,
  voice: GeminiVoice,
  options?: {
    onEnd?: () => void;
    onError?: (error: string) => void;
  }
): Promise<boolean> => {
  const { onEnd, onError } = options || {};

  if (!text || text.trim().length === 0) {
    onEnd?.();
    return true;
  }

  // Generate unique session ID for this call
  const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

  // Clear the stopped flag - we're starting fresh
  demoWasStopped = false;

  try {
    // CRITICAL: Cancel any active session first to prevent overlapping audio
    if (activeSession) {
      console.log('🛑 Canceling previous demo session');
      try { activeSession.close(); } catch {}
      activeSession = null;
    }
    activeSessionId = sessionId;

    // Clear all pending audio and reset timing
    demoAudioQueue.forEach(s => { try { s.stop(); } catch {} });
    demoAudioQueue = [];
    demoResolveCallback = null;

    // Initialize client if needed
    if (!demoAiClient) {
      const apiKey = import.meta.env.VITE_GOOGLE_AI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn('Gemini API key not found for demo voice');
        onError?.('API key not found');
        return false;
      }
      demoAiClient = new GoogleGenAI({ apiKey });
    }

    // Initialize audio context if needed
    if (!demoAudioContext) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      demoAudioContext = new AudioContextClass({ sampleRate: 24000 });
    }

    if (demoAudioContext.state === 'suspended') {
      await demoAudioContext.resume();
    }

    // Reset timing to current time (prevents audio scheduling in the past or far future)
    demoNextStartTime = demoAudioContext.currentTime;

    console.log(`🎭 Demo voice (${voice}): "${text.substring(0, 50)}..." [session: ${sessionId.slice(-6)}]`);

    // Create fresh session with specified voice
    const session = await demoAiClient.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      callbacks: {
        onopen: () => {
          console.log(`✅ Demo voice session opened (${voice}) [${sessionId.slice(-6)}]`);
        },
        onmessage: async (message: LiveServerMessage) => {
          // CRITICAL: Ignore messages from stale sessions
          if (sessionId !== activeSessionId) {
            console.log(`🚫 Ignoring message from stale session [${sessionId.slice(-6)}]`);
            return;
          }

          const serverContent = message.serverContent;

          // Handle audio
          const base64Audio = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (base64Audio && demoAudioContext) {
            try {
              const audioBuffer = await decodeAudioData(
                base64ToUint8Array(base64Audio),
                demoAudioContext
              );

              const source = demoAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(demoAudioContext.destination);

              const currentTime = demoAudioContext.currentTime;
              if (demoNextStartTime < currentTime) {
                demoNextStartTime = currentTime;
              }

              source.start(demoNextStartTime);
              demoNextStartTime += audioBuffer.duration;

              demoAudioQueue.push(source);
              source.onended = () => {
                const idx = demoAudioQueue.indexOf(source);
                if (idx > -1) demoAudioQueue.splice(idx, 1);
              };
            } catch (error) {
              console.error('Error playing demo audio:', error);
            }
          }

          // Check if done
          if (serverContent?.turnComplete) {
            setTimeout(() => {
              // Only resolve if this is still the active session
              if (sessionId === activeSessionId && demoResolveCallback) {
                demoResolveCallback();
                demoResolveCallback = null;
              }
            }, 200);
          }
        },
        onclose: () => {
          console.log(`Demo voice session closed (${voice}) [${sessionId.slice(-6)}]`);
          if (sessionId === activeSessionId) {
            activeSession = null;
          }
        },
        onerror: (error) => {
          console.error(`Demo voice error (${voice}) [${sessionId.slice(-6)}]:`, error);
          // Only handle errors for active session
          if (sessionId === activeSessionId && demoResolveCallback) {
            demoResolveCallback();
          }
        }
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          languageCode: 'en-US'
        },
        systemInstruction: `You are a voice actor reading a script.
Read the exact text provided naturally and expressively.
Do NOT add any commentary, just speak the text.
Use natural pacing and emotion appropriate for the dialogue.`
      }
    });

    // Track this session
    activeSession = session;

    // Send text and wait for completion
    const success = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn(`Demo voice timeout (${voice}) [${sessionId.slice(-6)}]`);
        // Only handle timeout if still active session
        if (sessionId === activeSessionId) {
          demoResolveCallback = null;
          try { session.close(); } catch {}
          if (activeSession === session) {
            activeSession = null;
          }
        }
        resolve(false);
      }, 20000);

      demoResolveCallback = () => {
        clearTimeout(timeout);
        try { session.close(); } catch {}
        if (activeSession === session) {
          activeSession = null;
        }
        resolve(true);
      };

      try {
        session.sendClientContent({
          turns: [{
            role: 'user',
            parts: [{ text: `Read this line aloud: "${text}"` }]
          }],
          turnComplete: true
        });
      } catch (error) {
        console.error(`Error sending demo text (${voice}) [${sessionId.slice(-6)}]:`, error);
        clearTimeout(timeout);
        try { session.close(); } catch {}
        if (activeSession === session) {
          activeSession = null;
        }
        resolve(false);
      }
    });

    // Check if we were manually stopped - if so, don't trigger callbacks
    if (demoWasStopped) {
      console.log(`⏹️ Demo voice was stopped (${voice}) [${sessionId.slice(-6)}]`);
      return false; // Return false but don't trigger onEnd/onError
    }

    if (success) {
      console.log(`✅ Demo voice success (${voice}) [${sessionId.slice(-6)}]`);
      onEnd?.();
      return true;
    } else {
      console.log(`⚠️ Demo voice failed (${voice}) [${sessionId.slice(-6)}]`);
      onError?.('Demo voice failed');
      return false;
    }
  } catch (error) {
    console.error(`Demo voice error (${voice}) [${sessionId.slice(-6)}]:`, error);
    onError?.(error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
};

/**
 * Stop demo voice playback - fully cleans up all state
 */
export const stopDemoVoice = (): void => {
  console.log('🛑 Stopping demo voice playback');

  // Set stopped flag FIRST - this prevents callbacks from firing
  demoWasStopped = true;

  // Close active session
  if (activeSession) {
    try { activeSession.close(); } catch {}
    activeSession = null;
  }

  // Invalidate session ID to ignore any pending callbacks
  activeSessionId = null;

  // Stop all playing audio
  demoAudioQueue.forEach(s => { try { s.stop(); } catch {} });
  demoAudioQueue = [];

  // Reset timing
  demoNextStartTime = 0;

  // CRITICAL: Resolve any pending promise to unblock awaiting code
  // This allows the old playCurrentLine call to complete instead of hanging
  if (demoResolveCallback) {
    demoResolveCallback();
    demoResolveCallback = null;
  }
};

// Legacy exports
export const speakWithGemini = agnesVoiceSpeak;
export const stopGeminiSpeaking = agnesVoiceStop;
export const isGeminiAvailable = (): boolean => true;
