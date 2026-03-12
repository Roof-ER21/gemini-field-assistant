/**
 * DeafCommunicationPanel - Deaf Communication Mode for SA21 Field Assistant
 *
 * A two-view interface that flips between:
 *   REP VIEW   — mic input (Gemini Live ASR) + sees homeowner responses
 *   HOMEOWNER VIEW — large rep speech text + quick tap responses (TTS output)
 *
 * Follows the TranslatorPanel.tsx pattern for all Gemini Live integration.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import {
  Mic,
  MicOff,
  RotateCcw,
  PhoneOff,
  MessageSquare,
  Keyboard,
  X,
  Clock,
  Accessibility,
  ChevronRight,
  Send,
  AlertCircle,
  Hand,
  PenTool,
} from 'lucide-react';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from '../agnes21/utils/audioUtils';
import { env } from '../src/config/env';
import SignRecognizer from './SignRecognizer';
import HandwritingPad from './HandwritingPad';
import type { SignRecognitionResult, HeadGestureResult } from '../services/signLanguageService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DeafModeState = 'idle' | 'connecting' | 'active' | 'error';
type ViewMode = 'rep' | 'homeowner';
type QuickResponseCategory = 'universal' | 'storm_damage' | 'insurance' | 'scheduling' | 'decision';

interface TranscriptEntry {
  id: string;
  speaker: 'rep' | 'homeowner';
  content: string;
  inputMethod: 'speech' | 'quick_tap' | 'typed' | 'sign_language' | 'head_gesture' | 'handwriting';
  timestamp: Date;
}

interface QuickResponse {
  label: string;
  emoji?: string;
}

// ---------------------------------------------------------------------------
// Quick responses data
// ---------------------------------------------------------------------------

const QUICK_RESPONSES: Record<QuickResponseCategory, QuickResponse[]> = {
  universal: [
    { label: 'Yes', emoji: '' },
    { label: 'No', emoji: '' },
    { label: 'Maybe', emoji: '' },
    { label: 'Show me', emoji: '' },
    { label: 'How much?', emoji: '' },
    { label: 'When?', emoji: '' },
    { label: "I don't understand", emoji: '' },
    { label: 'Say that again', emoji: '' },
    { label: 'Slower please', emoji: '' },
    { label: 'Thank you', emoji: '' },
  ],
  storm_damage: [
    { label: 'I had storm damage' },
    { label: 'Roof is leaking' },
    { label: 'Hail damage' },
    { label: 'Missing shingles' },
    { label: 'Water inside' },
    { label: 'Wind damage' },
  ],
  insurance: [
    { label: 'I have insurance' },
    { label: 'Already filed claim' },
    { label: 'Claim was denied' },
    { label: 'Adjuster came already' },
    { label: 'Waiting on adjuster' },
    { label: 'Need an estimate' },
  ],
  scheduling: [
    { label: 'Come back later' },
    { label: 'Schedule appointment' },
    { label: 'Call my spouse' },
    { label: 'This weekend' },
    { label: 'Next week' },
    { label: 'Morning is better' },
  ],
  decision: [
    { label: 'Not interested' },
    { label: 'Need to think' },
    { label: 'Talk to spouse first' },
    { label: 'How long does it take?' },
    { label: 'Do you have references?' },
    { label: 'Free inspection?' },
  ],
};

const CATEGORY_LABELS: Record<QuickResponseCategory, string> = {
  universal: 'Universal',
  storm_damage: 'Storm',
  insurance: 'Insurance',
  scheduling: 'Schedule',
  decision: 'Decision',
};

const CATEGORIES = Object.keys(QUICK_RESPONSES) as QuickResponseCategory[];

// ---------------------------------------------------------------------------
// Gemini Live system instruction
// ---------------------------------------------------------------------------

const DEAF_MODE_SYSTEM_INSTRUCTION = `You are a real-time speech transcriber for a deaf communication tool. Your ONLY job is to convert the spoken audio into clear, readable text.

Rules:
1. Transcribe exactly what is said. Do not add commentary.
2. Use proper punctuation and capitalization for readability.
3. If speech is unclear, transcribe what you can and indicate unclear parts with [unclear].
4. Do not translate — keep the original language.
5. Do not add greetings, sign-offs, or filler.
6. Output ONLY the transcribed text.`;

// ---------------------------------------------------------------------------
// Utility: format elapsed seconds → mm:ss
// ---------------------------------------------------------------------------

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DeafCommunicationPanel: React.FC = () => {
  // -- Core state --
  const [deafState, setDeafState] = useState<DeafModeState>('idle');
  const [viewMode, setViewMode] = useState<ViewMode>('rep');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  // -- Rep view state --
  const [isMuted, setIsMuted] = useState(false);
  const [latestRepText, setLatestRepText] = useState<string>('');
  const [latestHomeownerResponse, setLatestHomeownerResponse] = useState<string | null>(null);
  const [sessionSeconds, setSessionSeconds] = useState(0);

  // -- Homeowner view state --
  const [activeCategory, setActiveCategory] = useState<QuickResponseCategory>('universal');
  const [showTypeInput, setShowTypeInput] = useState(false);
  const [typedInput, setTypedInput] = useState('');
  const [pulsedResponseId, setPulsedResponseId] = useState<string | null>(null);
  const [hasSeenDisclosure, setHasSeenDisclosure] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(false);

  // -- Phase 2: Sign language + handwriting state --
  const [signCameraActive, setSignCameraActive] = useState(false);
  const [showHandwritingPad, setShowHandwritingPad] = useState(false);

  // -- Gemini Live refs (mirrors TranslatorPanel) --
  const aiClientRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioInputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const sessionActiveRef = useRef(false);
  const isConnectedRef = useRef(false);
  const isMutedRef = useRef(false);

  // -- UI refs --
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const homeownerViewRef = useRef<HTMLDivElement>(null);
  const typedInputRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<any>(null);

  // ---------------------------------------------------------------------------
  // Wake lock helpers
  // ---------------------------------------------------------------------------

  const acquireWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch {
        // Wake lock not critical — silently ignore
      }
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      try { wakeLockRef.current.release(); } catch { /* ignore */ }
      wakeLockRef.current = null;
    }
  }, []);

  // Re-acquire after visibility change (iOS requirement)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && sessionActiveRef.current) {
        acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [acquireWakeLock]);

  // ---------------------------------------------------------------------------
  // Session timer
  // ---------------------------------------------------------------------------

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setSessionSeconds(s => s + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  const cleanup = useCallback(() => {
    audioSourcesRef.current.forEach(src => {
      try { src.stop(); } catch { /* ignore */ }
    });
    audioSourcesRef.current.clear();

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioInputSourceRef.current) {
      audioInputSourceRef.current.disconnect();
      audioInputSourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch { /* ignore */ }
      sessionRef.current = null;
    }
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      inputAudioContextRef.current.close().catch(() => {});
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      outputAudioContextRef.current.close().catch(() => {});
      outputAudioContextRef.current = null;
    }
    nextStartTimeRef.current = 0;

    stopTimer();
    releaseWakeLock();
  }, [stopTimer, releaseWakeLock]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sessionActiveRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  // ---------------------------------------------------------------------------
  // Audio input (16 kHz PCM — same as TranslatorPanel)
  // ---------------------------------------------------------------------------

  const startAudioInput = useCallback(() => {
    if (!streamRef.current || !inputAudioContextRef.current) return;

    const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
    audioInputSourceRef.current = source;

    const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (isMutedRef.current || !sessionRef.current || !isConnectedRef.current) return;
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmBlob = createPcmBlob(inputData);
      if (sessionRef.current) {
        sessionRef.current.sendRealtimeInput({ media: pcmBlob });
      }
    };

    source.connect(processor);
    processor.connect(inputAudioContextRef.current.destination);
  }, []);

  // ---------------------------------------------------------------------------
  // Handle Gemini Live messages
  // ---------------------------------------------------------------------------

  const handleServerMessage = useCallback(async (message: LiveServerMessage) => {
    const serverContent = message.serverContent;

    // Handle interruption
    if (serverContent?.interrupted) {
      audioSourcesRef.current.forEach(src => {
        try { src.stop(); } catch { /* ignore */ }
      });
      audioSourcesRef.current.clear();
      nextStartTimeRef.current = 0;
      return;
    }

    // Output transcription is what Gemini "says" — but in pure ASR mode it
    // echoes the transcribed text. We primarily rely on inputTranscription.
    const inputTranscription = serverContent?.inputTranscription;
    if (inputTranscription?.text && inputTranscription.finished) {
      const text = inputTranscription.text.trim();
      if (!text) return;

      setLatestRepText(text);
      const entry: TranscriptEntry = {
        id: `${Date.now()}-rep`,
        speaker: 'rep',
        content: text,
        inputMethod: 'speech',
        timestamp: new Date(),
      };
      setTranscript(prev => [...prev, entry]);
      logTranscriptEntry(entry);
    }

    // Handle any audio output (not expected in transcribe-only mode but handled gracefully)
    const audioPart = serverContent?.modelTurn?.parts?.find((p: any) => p?.inlineData?.data);
    const base64Audio = audioPart?.inlineData?.data;
    if (base64Audio && sessionActiveRef.current) {
      await playAudioChunk(base64Audio);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Play audio (mirrors TranslatorPanel)
  // ---------------------------------------------------------------------------

  const playAudioChunk = async (base64Audio: string) => {
    if (!sessionActiveRef.current || !outputAudioContextRef.current) return;
    const ctx = outputAudioContextRef.current;
    if (ctx.state === 'closed') return;

    try {
      const audioBuffer = await decodeAudioData(base64ToUint8Array(base64Audio), ctx);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const currentTime = ctx.currentTime;
      const startTime = Math.max(currentTime, nextStartTimeRef.current);
      nextStartTimeRef.current = startTime + audioBuffer.duration;

      audioSourcesRef.current.add(source);
      source.onended = () => { audioSourcesRef.current.delete(source); };
      source.start(startTime);
    } catch (err) {
      console.error('[DeafMode] Audio playback error:', err);
    }
  };

  // ---------------------------------------------------------------------------
  // Start session
  // ---------------------------------------------------------------------------

  const startSession = useCallback(async () => {
    try {
      setDeafState('connecting');
      setError(null);
      sessionActiveRef.current = true;

      const apiKey =
        import.meta.env.VITE_GOOGLE_AI_API_KEY ||
        import.meta.env.VITE_GEMINI_API_KEY ||
        env.GEMINI_API_KEY;

      if (!apiKey) throw new Error('Gemini API key not configured');

      aiClientRef.current = new GoogleGenAI({ apiKey });

      // Microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Audio contexts
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContextCtor({ sampleRate: 16000 });
      outputAudioContextRef.current = new AudioContextCtor({ sampleRate: 24000 });

      // Connect to Gemini Live
      const liveSession = await aiClientRef.current.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log('[DeafMode] Gemini Live session opened');
            isConnectedRef.current = true;
            setDeafState('active');
            startAudioInput();
            startTimer();
            acquireWakeLock();
          },
          onmessage: async (msg: LiveServerMessage) => {
            await handleServerMessage(msg);
          },
          onerror: (err: any) => {
            console.error('[DeafMode] Gemini Live error:', err);
            setError('Connection error. Please try again.');
            setDeafState('error');
          },
          onclose: () => {
            console.log('[DeafMode] Gemini Live session closed');
            isConnectedRef.current = false;
            sessionActiveRef.current = false;
            if (deafState !== 'idle') setDeafState('idle');
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: { parts: [{ text: DEAF_MODE_SYSTEM_INSTRUCTION }] },
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Aoede' },
            },
          },
        },
      });

      sessionRef.current = liveSession;
    } catch (err) {
      console.error('[DeafMode] Failed to start session:', err);
      setError(err instanceof Error ? err.message : 'Failed to start session');
      setDeafState('error');
      cleanup();
    }
  }, [startAudioInput, startTimer, acquireWakeLock, handleServerMessage, cleanup, deafState]);

  // ---------------------------------------------------------------------------
  // End session
  // ---------------------------------------------------------------------------

  const endSession = useCallback(() => {
    sessionActiveRef.current = false;
    isConnectedRef.current = false;
    cleanup();
    setDeafState('idle');
    setViewMode('rep');
    setTranscript([]);
    setLatestRepText('');
    setLatestHomeownerResponse(null);
    setSessionSeconds(0);
    setShowTypeInput(false);
    setTypedInput('');
    setSignCameraActive(false);
    setShowHandwritingPad(false);
  }, [cleanup]);

  // ---------------------------------------------------------------------------
  // Flip to homeowner view
  // ---------------------------------------------------------------------------

  const flipToHomeowner = useCallback(() => {
    if (!hasSeenDisclosure) {
      setShowDisclosure(true);
      return;
    }
    setViewMode('homeowner');
    // Focus the homeowner view for accessibility
    setTimeout(() => homeownerViewRef.current?.focus(), 100);
  }, [hasSeenDisclosure]);

  const flipToRep = useCallback(() => {
    setViewMode('rep');
    setShowTypeInput(false);
    setTypedInput('');
    setSignCameraActive(false);
    setShowHandwritingPad(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Homeowner quick response
  // ---------------------------------------------------------------------------

  const speakText = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }, []);

  const handleHomeownerResponse = useCallback(
    (responseText: string, method: TranscriptEntry['inputMethod'], responseId: string) => {
      // Visual pulse feedback
      setPulsedResponseId(responseId);
      setTimeout(() => setPulsedResponseId(null), 400);

      const entry: TranscriptEntry = {
        id: `${Date.now()}-homeowner`,
        speaker: 'homeowner',
        content: responseText,
        inputMethod: method,
        timestamp: new Date(),
      };

      setLatestHomeownerResponse(responseText);
      setTranscript(prev => [...prev, entry]);
      logTranscriptEntry(entry);

      // Speak the response so the rep can hear
      speakText(responseText);
    },
    [speakText]
  );

  // -- Phase 2 handlers --
  const handleSignDetected = useCallback((result: SignRecognitionResult) => {
    handleHomeownerResponse(result.sign, 'sign_language', `sign-${Date.now()}`);
  }, [handleHomeownerResponse]);

  const handleHeadGesture = useCallback((gesture: HeadGestureResult) => {
    if (gesture.gesture === 'nod') {
      handleHomeownerResponse('Yes', 'head_gesture', `gesture-${Date.now()}`);
    } else if (gesture.gesture === 'shake') {
      handleHomeownerResponse('No', 'head_gesture', `gesture-${Date.now()}`);
    }
  }, [handleHomeownerResponse]);

  const handleHandwritingSubmit = useCallback((text: string) => {
    handleHomeownerResponse(text, 'handwriting', `handwriting-${Date.now()}`);
    setShowHandwritingPad(false);
  }, [handleHomeownerResponse]);

  const submitTypedInput = useCallback(() => {
    const text = typedInput.trim();
    if (!text) return;
    handleHomeownerResponse(text, 'typed', `typed-${Date.now()}`);
    setTypedInput('');
    setShowTypeInput(false);
  }, [typedInput, handleHomeownerResponse]);

  // ---------------------------------------------------------------------------
  // Transcript API logging (silent failure)
  // ---------------------------------------------------------------------------

  const logTranscriptEntry = async (entry: TranscriptEntry) => {
    try {
      await fetch('/api/deaf-mode/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speaker: entry.speaker,
          content: entry.content,
          inputMethod: entry.inputMethod,
          timestamp: entry.timestamp.toISOString(),
        }),
      });
    } catch {
      // Endpoint may not exist yet — silently ignore
    }
  };

  // ---------------------------------------------------------------------------
  // Auto-scroll rep transcript
  // ---------------------------------------------------------------------------

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // ---------------------------------------------------------------------------
  // Sync isMuted ref
  // ---------------------------------------------------------------------------

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const repMessages = transcript.filter(e => e.speaker === 'rep');
  const homeownerMessages = transcript.filter(e => e.speaker === 'homeowner');
  const latestRepMessage = repMessages[repMessages.length - 1]?.content ?? '';
  const previousRepMessages = repMessages.slice(0, -1);

  // ---------------------------------------------------------------------------
  // RENDER: Idle
  // ---------------------------------------------------------------------------

  if (deafState === 'idle' || deafState === 'error') {
    return (
      <div className="roof-er-content-area">
        <div className="roof-er-content-scroll">
          <div className="roof-er-page-title">
            <Accessibility
              className="w-6 h-6 inline mr-2"
              style={{ color: 'var(--roof-red)' }}
              aria-hidden="true"
            />
            Deaf Communication Mode
          </div>

          <div
            style={{
              maxWidth: '560px',
              margin: '0 auto',
              padding: '32px 20px',
              textAlign: 'center',
            }}
          >
            {/* Icon */}
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'rgba(182,8,7,0.12)',
                border: '2px solid var(--roof-red)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
              }}
              aria-hidden="true"
            >
              <Accessibility style={{ color: 'var(--roof-red)', width: '36px', height: '36px' }} />
            </div>

            <h2
              style={{
                fontSize: '22px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: '12px',
              }}
            >
              Deaf Communication Mode
            </h2>

            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '15px',
                lineHeight: 1.6,
                marginBottom: '28px',
              }}
            >
              Speak to the homeowner and your words appear as large text on the screen.
              The homeowner taps quick responses — and you hear them spoken aloud.
            </p>

            {/* How it works */}
            <div
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '28px',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: '12px',
                }}
              >
                How It Works
              </div>
              {[
                'Tap Start — microphone activates',
                'Speak to the homeowner normally',
                'Flip phone so they can see the screen',
                'They tap a response — you hear it spoken',
                'Flip back and continue',
              ].map((step, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    marginBottom: i < 4 ? '10px' : 0,
                  }}
                >
                  <span
                    style={{
                      minWidth: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: 'var(--roof-red)',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <span style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.5 }}>
                    {step}
                  </span>
                </div>
              ))}
            </div>

            {/* Error message */}
            {deafState === 'error' && error && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 16px',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '10px',
                  marginBottom: '20px',
                  color: '#ef4444',
                  fontSize: '14px',
                  textAlign: 'left',
                }}
              >
                <AlertCircle style={{ width: '18px', height: '18px', flexShrink: 0 }} />
                {error}
              </div>
            )}

            {/* Start button */}
            <button
              onClick={startSession}
              aria-label="Start deaf communication session"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px 36px',
                background: 'linear-gradient(135deg, var(--roof-red), var(--roof-red-dark))',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '18px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(182,8,7,0.35)',
                transition: 'transform 0.1s',
              }}
            >
              <Mic style={{ width: '22px', height: '22px' }} />
              Start Session
            </button>

            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '14px' }}>
              Microphone permission required
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: Connecting
  // ---------------------------------------------------------------------------

  if (deafState === 'connecting') {
    return (
      <div className="roof-er-content-area">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: '20px',
            padding: '40px',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              border: '3px solid var(--roof-red)',
              borderTopColor: 'transparent',
              animation: 'spin 0.8s linear infinite',
            }}
            role="status"
            aria-label="Connecting to Gemini Live"
          />
          <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>
            Connecting...
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: Active — Disclosure modal
  // ---------------------------------------------------------------------------

  if (showDisclosure) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Disclosure for homeowner"
        style={{
          position: 'fixed',
          inset: 0,
          background: '#000',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px',
          zIndex: 9999,
        }}
      >
        <div
          style={{
            maxWidth: '420px',
            width: '100%',
            background: '#1a1a1a',
            borderRadius: '20px',
            padding: '32px 28px',
            border: '1px solid #333',
          }}
        >
          <div
            style={{
              fontSize: '32px',
              textAlign: 'center',
              marginBottom: '20px',
            }}
            aria-hidden="true"
          >
            <Accessibility style={{ width: '48px', height: '48px', color: 'var(--roof-red)', margin: '0 auto' }} />
          </div>
          <h2
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: '#fff',
              textAlign: 'center',
              marginBottom: '16px',
              lineHeight: 1.3,
            }}
          >
            Hi there!
          </h2>
          <p
            style={{
              fontSize: '18px',
              color: '#e0e0e0',
              textAlign: 'center',
              lineHeight: 1.6,
              marginBottom: '32px',
            }}
          >
            This app shows what I say as text and lets you tap responses to reply.
          </p>
          <button
            onClick={() => {
              setHasSeenDisclosure(true);
              setShowDisclosure(false);
              setViewMode('homeowner');
              setTimeout(() => homeownerViewRef.current?.focus(), 100);
            }}
            aria-label="OK, I understand"
            style={{
              width: '100%',
              padding: '18px',
              background: 'var(--roof-red)',
              color: '#fff',
              border: 'none',
              borderRadius: '14px',
              fontSize: '20px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            OK, Let's Go
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: Active — HOMEOWNER VIEW
  // ---------------------------------------------------------------------------

  if (viewMode === 'homeowner') {
    return (
      <div
        ref={homeownerViewRef}
        tabIndex={-1}
        aria-label="Homeowner communication view"
        style={{
          position: 'fixed',
          inset: 0,
          background: '#0a0a0a',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 1000,
        }}
      >
        {/* ---- Rep's spoken text ---- */}
        <div
          style={{
            flex: '1 1 auto',
            overflowY: 'auto',
            padding: '24px 20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
          aria-live="polite"
          aria-label="What the sales rep said"
        >
          {/* Previous rep messages (smaller) */}
          {previousRepMessages.slice(-4).map(entry => (
            <p
              key={entry.id}
              style={{
                fontSize: '18px',
                color: 'rgba(255,255,255,0.45)',
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {entry.content}
            </p>
          ))}

          {/* Latest rep message (largest) */}
          {latestRepMessage ? (
            <p
              style={{
                fontSize: '34px',
                fontWeight: 700,
                color: '#ffffff',
                lineHeight: 1.35,
                margin: 0,
                wordBreak: 'break-word',
              }}
            >
              {latestRepMessage}
            </p>
          ) : (
            <p
              style={{
                fontSize: '28px',
                color: 'rgba(255,255,255,0.3)',
                lineHeight: 1.5,
                margin: '40px 0 0',
                textAlign: 'center',
              }}
            >
              Waiting for rep to speak...
            </p>
          )}
        </div>

        {/* ---- Sign Language Camera (Phase 2) ---- */}
        <div style={{ padding: '8px 16px 0' }}>
          <SignRecognizer
            onSignDetected={handleSignDetected}
            onHeadGesture={handleHeadGesture}
            isActive={signCameraActive}
            onToggle={setSignCameraActive}
          />
        </div>

        {/* ---- Divider ---- */}
        <div
          style={{
            height: '1px',
            background: 'rgba(255,255,255,0.1)',
            margin: '0 16px',
          }}
          aria-hidden="true"
        />

        {/* ---- Category tabs ---- */}
        <div
          role="tablist"
          aria-label="Response categories"
          style={{
            display: 'flex',
            gap: '8px',
            padding: '12px 16px 8px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              role="tab"
              aria-selected={activeCategory === cat}
              aria-label={`${CATEGORY_LABELS[cat]} responses`}
              onClick={() => setActiveCategory(cat)}
              style={{
                flexShrink: 0,
                padding: '8px 16px',
                borderRadius: '20px',
                border: 'none',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.15s',
                background:
                  activeCategory === cat ? 'var(--roof-red)' : 'rgba(255,255,255,0.1)',
                color: '#fff',
                minHeight: '36px',
              }}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* ---- Quick response grid ---- */}
        {!showTypeInput && (
          <div
            role="tabpanel"
            aria-label={`${CATEGORY_LABELS[activeCategory]} quick responses`}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '10px',
              padding: '8px 16px',
              overflowY: 'auto',
              maxHeight: '280px',
            }}
          >
            {QUICK_RESPONSES[activeCategory].map(response => {
              const responseId = `${activeCategory}-${response.label}`;
              const isPulsed = pulsedResponseId === responseId;
              return (
                <button
                  key={responseId}
                  onClick={() => handleHomeownerResponse(response.label, 'quick_tap', responseId)}
                  aria-label={response.label}
                  style={{
                    minHeight: '56px',
                    padding: '12px 14px',
                    background: isPulsed ? '#fff' : 'var(--roof-red)',
                    color: isPulsed ? 'var(--roof-red)' : '#fff',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '16px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    lineHeight: 1.3,
                    textAlign: 'center',
                    transition: 'background 0.12s, color 0.12s, transform 0.1s',
                    transform: isPulsed ? 'scale(0.96)' : 'scale(1)',
                    wordBreak: 'break-word',
                  }}
                >
                  {response.emoji ? `${response.emoji} ${response.label}` : response.label}
                </button>
              );
            })}
          </div>
        )}

        {/* ---- Type input ---- */}
        {showTypeInput && (
          <div
            style={{
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <textarea
              ref={typedInputRef}
              value={typedInput}
              onChange={e => setTypedInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitTypedInput();
                }
              }}
              placeholder="Type your response..."
              aria-label="Type your response to the sales rep"
              rows={3}
              style={{
                width: '100%',
                padding: '14px',
                background: '#1a1a1a',
                border: '2px solid #444',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '18px',
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { setShowTypeInput(false); setTypedInput(''); }}
                aria-label="Cancel typing"
                style={{
                  flex: 1,
                  padding: '14px',
                  background: '#2a2a2a',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  minHeight: '48px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={submitTypedInput}
                disabled={!typedInput.trim()}
                aria-label="Send typed response"
                style={{
                  flex: 2,
                  padding: '14px',
                  background: typedInput.trim() ? 'var(--roof-red)' : '#333',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '16px',
                  fontWeight: 700,
                  cursor: typedInput.trim() ? 'pointer' : 'default',
                  minHeight: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <Send style={{ width: '18px', height: '18px' }} />
                Send
              </button>
            </div>
          </div>
        )}

        {/* ---- Bottom bar ---- */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px 20px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {/* Flip back (small, bottom-left) */}
          <button
            onClick={flipToRep}
            aria-label="Flip back to rep view"
            style={{
              padding: '10px 14px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '10px',
              color: 'rgba(255,255,255,0.7)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              minHeight: '44px',
            }}
          >
            <RotateCcw style={{ width: '14px', height: '14px' }} />
            Flip Back
          </button>

          {/* Draw (handwriting) toggle */}
          <button
            onClick={() => setShowHandwritingPad(true)}
            aria-label="Draw a message"
            style={{
              padding: '10px 14px',
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '10px',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              minHeight: '48px',
            }}
          >
            <PenTool style={{ width: '16px', height: '16px' }} />
            Draw
          </button>

          {/* Keyboard toggle */}
          <button
            onClick={() => {
              setShowTypeInput(prev => !prev);
              if (!showTypeInput) setTimeout(() => typedInputRef.current?.focus(), 100);
            }}
            aria-label={showTypeInput ? 'Hide keyboard input' : 'Type a custom response'}
            aria-pressed={showTypeInput}
            style={{
              padding: '10px 14px',
              background: showTypeInput ? 'var(--roof-red)' : 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '10px',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              minHeight: '48px',
            }}
          >
            <Keyboard style={{ width: '16px', height: '16px' }} />
            Type
          </button>
        </div>

        {/* ---- Handwriting Pad overlay ---- */}
        {showHandwritingPad && (
          <HandwritingPad
            onSubmit={handleHandwritingSubmit}
            onClose={() => setShowHandwritingPad(false)}
            apiKey={import.meta.env.VITE_GOOGLE_AI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY}
          />
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: Active — REP VIEW (default)
  // ---------------------------------------------------------------------------

  const statusLabel =
    isMuted ? 'Muted' :
    deafState === 'active' ? 'Listening...' :
    'Active';

  const statusColor =
    isMuted ? '#f59e0b' :
    deafState === 'active' ? '#4ade80' :
    'var(--text-muted)';

  return (
    <div className="roof-er-content-area">
      <div className="roof-er-content-scroll" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* ---- Header ---- */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Accessibility style={{ width: '20px', height: '20px', color: 'var(--roof-red)' }} aria-hidden="true" />
            <span
              style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}
            >
              Deaf Mode
            </span>
            {/* Session timer */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 10px',
                background: 'var(--bg-elevated)',
                borderRadius: '20px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                fontVariantNumeric: 'tabular-nums',
              }}
              aria-label={`Session duration: ${formatElapsed(sessionSeconds)}`}
            >
              <Clock style={{ width: '12px', height: '12px' }} aria-hidden="true" />
              {formatElapsed(sessionSeconds)}
            </span>
          </div>

          <button
            onClick={endSession}
            aria-label="End deaf communication session"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '8px',
              color: '#ef4444',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <PhoneOff style={{ width: '14px', height: '14px' }} />
            End
          </button>
        </div>

        {/* ---- Status bar ---- */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
          }}
          role="status"
          aria-live="polite"
          aria-label={`Status: ${statusLabel}`}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: statusColor,
              flexShrink: 0,
              boxShadow: `0 0 6px ${statusColor}`,
            }}
            aria-hidden="true"
          />
          <span style={{ fontSize: '14px', color: statusColor, fontWeight: 600 }}>
            {statusLabel}
          </span>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {transcript.length} message{transcript.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ---- Homeowner's latest response ---- */}
        {latestHomeownerResponse && (
          <div
            style={{
              padding: '14px 16px',
              background: 'rgba(74,222,128,0.08)',
              border: '1px solid rgba(74,222,128,0.25)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
            }}
            aria-live="assertive"
            aria-label={`Homeowner responded: ${latestHomeownerResponse}`}
          >
            <MessageSquare
              style={{ width: '16px', height: '16px', color: '#4ade80', flexShrink: 0, marginTop: '2px' }}
              aria-hidden="true"
            />
            <div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#4ade80',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: '4px',
                }}
              >
                Homeowner responded
              </div>
              <div style={{ fontSize: '16px', color: 'var(--text-primary)', fontWeight: 600 }}>
                {latestHomeownerResponse}
              </div>
            </div>
          </div>
        )}

        {/* ---- Mic controls ---- */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px',
            padding: '12px 0',
          }}
        >
          {/* Mic button */}
          <button
            onClick={() => setIsMuted(prev => !prev)}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-pressed={isMuted}
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: isMuted
                ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                : 'linear-gradient(135deg, var(--roof-red), var(--roof-red-dark))',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isMuted
                ? '0 4px 20px rgba(245,158,11,0.35)'
                : '0 4px 20px rgba(182,8,7,0.35)',
            }}
          >
            {isMuted
              ? <MicOff style={{ width: '28px', height: '28px' }} />
              : <Mic style={{ width: '28px', height: '28px' }} />}
          </button>

          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {isMuted ? 'Tap to unmute' : 'Tap to mute'}
          </span>
        </div>

        {/* ---- Flip to Homeowner ---- */}
        <button
          onClick={flipToHomeowner}
          aria-label="Flip phone to homeowner view"
          style={{
            width: '100%',
            padding: '16px',
            background: 'linear-gradient(135deg, var(--roof-red), var(--roof-red-dark))',
            border: 'none',
            borderRadius: '14px',
            color: '#fff',
            fontSize: '17px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            boxShadow: '0 4px 20px rgba(182,8,7,0.3)',
          }}
        >
          <RotateCcw style={{ width: '20px', height: '20px' }} />
          Flip to Homeowner
          <ChevronRight style={{ width: '18px', height: '18px', opacity: 0.7 }} />
        </button>

        {/* ---- Conversation transcript ---- */}
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flex: '1 1 auto',
            minHeight: '180px',
          }}
        >
          {/* Transcript header */}
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexShrink: 0,
            }}
          >
            <MessageSquare
              style={{ width: '14px', height: '14px', color: 'var(--roof-red)' }}
              aria-hidden="true"
            />
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Conversation ({transcript.length})
            </span>
          </div>

          {/* Transcript entries */}
          <div
            aria-label="Conversation transcript"
            aria-live="polite"
            style={{
              overflowY: 'auto',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              maxHeight: '320px',
            }}
          >
            {transcript.length === 0 ? (
              <p
                style={{
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '13px',
                  padding: '24px',
                  margin: 0,
                }}
              >
                Conversation will appear here
              </p>
            ) : (
              transcript.map(entry => {
                const isRep = entry.speaker === 'rep';
                const speakerColor = isRep ? '#3b82f6' : '#4ade80';
                const speakerLabel = isRep ? 'Rep' : 'Homeowner';
                const methodLabel =
                  entry.inputMethod === 'speech' ? 'voice' :
                  entry.inputMethod === 'quick_tap' ? 'tap' : 'typed';

                return (
                  <div
                    key={entry.id}
                    style={{
                      padding: '10px 12px',
                      background: 'var(--bg-card)',
                      borderRadius: '10px',
                      borderLeft: `3px solid ${speakerColor}`,
                    }}
                  >
                    {/* Speaker row */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '5px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: speakerColor,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {speakerLabel}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          background: 'var(--bg-elevated)',
                          borderRadius: '4px',
                          color: 'var(--text-muted)',
                        }}
                        aria-label={`Input method: ${methodLabel}`}
                      >
                        {methodLabel}
                      </span>
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: '10px',
                          color: 'var(--text-muted)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                        aria-label={`Time: ${entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      >
                        {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {/* Content */}
                    <p
                      style={{
                        margin: 0,
                        fontSize: '14px',
                        color: 'var(--text-primary)',
                        lineHeight: 1.5,
                      }}
                    >
                      {entry.content}
                    </p>
                  </div>
                );
              })
            )}
            <div ref={transcriptEndRef} aria-hidden="true" />
          </div>
        </div>

        {/* ---- Session stats ---- */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '10px',
          }}
          aria-label="Session statistics"
        >
          {[
            { label: 'Duration', value: formatElapsed(sessionSeconds) },
            { label: 'Rep msgs', value: repMessages.length.toString() },
            { label: 'HO msgs', value: homeownerMessages.length.toString() },
          ].map(stat => (
            <div
              key={stat.label}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '12px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '20px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
                aria-label={`${stat.label}: ${stat.value}`}
              >
                {stat.value}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* ---- Error (active session) ---- */}
        {error && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 14px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '10px',
              color: '#ef4444',
              fontSize: '13px',
            }}
          >
            <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
            {error}
          </div>
        )}

      </div>
    </div>
  );
};

export default DeafCommunicationPanel;
