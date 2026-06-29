import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, Globe, Volume2, VolumeX, Phone, PhoneOff, Languages, MessageSquare, Sparkles } from 'lucide-react';
import { SUPPORTED_LANGUAGES, SupportedLanguage } from '../agnes21/types';
import AgnesAvatar from '../agnes21/components/AgnesAvatar';
import Waveform from '../agnes21/components/Waveform';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from '../agnes21/utils/audioUtils';
import { env } from '../src/config/env';
import { getLiveClient } from '../services/geminiService';

// Agnes Translator States
type TranslatorState =
  | 'idle'           // Ready to start
  | 'connecting'     // Connecting to Gemini
  | 'listening'      // Active conversation
  | 'speaking'       // Agnes speaking translation
  | 'error';         // Error state

interface TranscriptEntry {
  id: string;
  speaker: 'user' | 'homeowner' | 'agnes';
  originalText: string;
  translatedText?: string;
  detectedLang?: string;
  timestamp: Date;
}

const TranslatorPanel: React.FC = () => {
  // State
  const [state, setState] = useState<TranslatorState>('idle');
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [activeAudioCount, setActiveAudioCount] = useState(0);

  // Refs
  const aiClientRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioInputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const sessionActiveRef = useRef(false);
  const isConnectedRef = useRef(false);
  const isMutedRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const aiSpeaking = activeAudioCount > 0;

  // Build translator system instruction - POCKET LINGUIST (SIMPLIFIED)
  const buildTranslatorSystemInstruction = () => {
    return `You are Agnes, a smart translator helping a roofing sales rep talk to a homeowner.

## THE #1 RULE - PRIVACY
NEVER translate what the rep says TO YOU. Only translate what they want the homeowner to hear.

When rep says things like:
- "Agnes, say this..."
- "Tell them..."
- "Agnes, help me out"
- "What should I say?"

These are PRIVATE. Respond to the rep in English. Do NOT tell the homeowner.

## HOW TO IDENTIFY WHO'S TALKING
- ENGLISH speaker = The REP (talk to them in English)
- OTHER LANGUAGE = The HOMEOWNER (talk to them in their language)
- "Agnes..." commands = Private rep instructions (respond in English only)

## YOUR JOB

**Step 1: Detect Language**
When homeowner speaks, detect their language. Tell the rep: "Got it, they speak [language]."
Greet the homeowner warmly in their language.

**Step 2: Translate**
- Homeowner speaks → Translate to English for rep
- Rep speaks (not a command) → Translate to homeowner's language

**Step 3: When Rep Asks for Help**
If rep says "help me convince them" or "what should I say":
1. Propose a phrase: "I can say: '[phrase]'. Sound good?"
2. WAIT for rep to say "yes" or "go ahead"
3. THEN say it to homeowner
4. Translate their response

## COMMAND FILTERING - CRITICAL
When rep gives you instructions, extract ONLY the content to translate:

"Agnes, say this: We're offering a free inspection" → Say to homeowner: "We're offering a free inspection"
"Tell them we helped their neighbors" → Say to homeowner: "We helped your neighbors"
"Agnes, ask them if they have damage" → Say to homeowner: "Do you have any roof damage?"

NEVER say to homeowner: "The rep asked me to tell you..." or "He wants me to say..."
Just deliver the message naturally like you're the one saying it.

## IF HOMEOWNER ASKS ABOUT YOU
If they ask "what are you?" or "who's that?":
Say: "I'm Agnes, a translator helping us communicate."
Keep it simple. Don't mention sales, convincing, or strategy.

## SIMPLE OBJECTION HELP
If homeowner objects and rep asks for help, offer a response:

"Not interested" → "I can say: 'Most people feel that way until they see the damage. We're just offering free information.' Want me to try that?"

"I'm busy" → "I can say: 'I understand. This only takes a minute.' Want me to say that?"

"No money" → "I can say: 'That's exactly why - prices keep going up. Good to know the cost for budgeting.' Sound good?"

Always wait for rep approval before speaking to homeowner.

## LANGUAGE RULES
- To REP: Always English
- To HOMEOWNER: Always their language
- Never mix these up

## KEEP IT NATURAL
Don't be robotic. Sound like a friendly human translator.
Don't over-explain. Be efficient.
The rep leads. You help.`;
  };

  // Start the translator session
  const startSession = async () => {
    try {
      setState('connecting');
      setError(null);
      sessionActiveRef.current = true;

      // Live API client via ephemeral token (referrer-locked browser key can't open Live sessions)
      aiClientRef.current = await getLiveClient();

      // Get audio stream (no video needed for translator)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Setup audio contexts
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContext({ sampleRate: 16000 });
      outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });

      // Setup analyzers
      const analyser = outputAudioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const micAnalyser = inputAudioContextRef.current.createAnalyser();
      micAnalyser.fftSize = 256;
      micAnalyserRef.current = micAnalyser;

      const systemInstruction = buildTranslatorSystemInstruction();

      // Connect to Gemini Live
      const session = await aiClientRef.current.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log('Translator session opened');
            setIsConnected(true);
            isConnectedRef.current = true;
            setState('listening');
            startAudioInput();
          },
          onmessage: async (message: LiveServerMessage) => {
            await handleServerMessage(message);
          },
          onerror: (error: any) => {
            console.error('Translator error:', error?.message || error?.reason || error, error);
            setError('Connection error. Please try again.');
            setState('error');
          },
          onclose: (e: any) => {
            console.log('Translator session closed', { code: e?.code, reason: e?.reason, wasClean: e?.wasClean });
            isConnectedRef.current = false;
            setIsConnected(false);
            sessionActiveRef.current = false;
            cleanup();
            setState('idle');
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Aoede' }
            }
          }
        }
      });

      sessionRef.current = session;
    } catch (err) {
      console.error('Failed to start translator:', err);
      setError(err instanceof Error ? err.message : 'Failed to start translator');
      setState('error');
      cleanup();
    }
  };

  // Handle messages from Gemini
  const handleServerMessage = async (message: LiveServerMessage) => {
    const serverContent = message.serverContent;

    // Handle interruption
    if (serverContent?.interrupted) {
      audioSourcesRef.current.forEach(source => {
        try { source.stop(); } catch (e) { /* ignore */ }
      });
      audioSourcesRef.current.clear();
      setActiveAudioCount(0);
      nextStartTimeRef.current = 0;
      return;
    }

    // Handle input transcription (what user/homeowner said)
    const inputTranscription = serverContent?.inputTranscription;
    if (inputTranscription?.text && inputTranscription.finished) {
      const text = inputTranscription.text.trim();
      if (text) {
        // Detect if English (rep) or foreign language (homeowner)
        const isEnglish = /^[a-zA-Z\s.,!?'"]+$/.test(text);

        setTranscript(prev => [...prev, {
          id: Date.now().toString() + '-input',
          speaker: isEnglish ? 'user' : 'homeowner',
          originalText: text,
          timestamp: new Date()
        }]);
      }
    }

    // Handle output transcription (Agnes's response)
    const outputTranscription = serverContent?.outputTranscription;
    if (outputTranscription?.text && outputTranscription.finished) {
      const text = outputTranscription.text.trim();
      if (text) {
        // Check if it's a language detection announcement
        const langMatch = text.match(/I detected (\w+)/i);
        if (langMatch) {
          setDetectedLanguage(langMatch[1]);
        }

        setTranscript(prev => {
          // Avoid duplicate entries by checking if last entry is identical
          const lastEntry = prev[prev.length - 1];
          if (lastEntry?.speaker === 'agnes' && lastEntry?.originalText === text) {
            return prev;
          }

          return [...prev, {
            id: Date.now().toString() + '-output',
            speaker: 'agnes',
            originalText: text,
            timestamp: new Date()
          }];
        });
      }
    }

    // Handle audio output - matches PitchTrainer pattern
    const audioPart = serverContent?.modelTurn?.parts?.find((part: any) => part?.inlineData?.data);
    const base64Audio = audioPart?.inlineData?.data;
    if (base64Audio && sessionActiveRef.current && isSpeakerOn) {
      await playAudioChunk(base64Audio);
    }
  };

  // Play audio from Gemini - matches PitchTrainer pattern
  const playAudioChunk = async (base64Audio: string) => {
    if (!sessionActiveRef.current || !outputAudioContextRef.current) return;

    const ctx = outputAudioContextRef.current;
    if (ctx.state === 'closed') return;

    try {
      const audioBuffer = await decodeAudioData(base64ToUint8Array(base64Audio), ctx);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // Connect to analyser for visualization
      if (analyserRef.current) {
        source.connect(analyserRef.current);
        analyserRef.current.connect(ctx.destination);
      } else {
        source.connect(ctx.destination);
      }

      const currentTime = ctx.currentTime;
      const startTime = Math.max(currentTime, nextStartTimeRef.current);
      nextStartTimeRef.current = startTime + audioBuffer.duration;

      audioSourcesRef.current.add(source);
      setActiveAudioCount(prev => prev + 1);
      setState('speaking');

      source.onended = () => {
        audioSourcesRef.current.delete(source);
        setActiveAudioCount(prev => {
          const newCount = prev - 1;
          if (newCount === 0 && sessionActiveRef.current) {
            setState('listening');
          }
          return newCount;
        });
      };

      source.start(startTime);
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  };

  // Start audio input - matches PitchTrainer pattern
  const startAudioInput = () => {
    if (!streamRef.current || !inputAudioContextRef.current) return;

    const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
    audioInputSourceRef.current = source;

    if (micAnalyserRef.current) {
      source.connect(micAnalyserRef.current);
    }

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
  };

  // End session
  const endSession = useCallback(() => {
    sessionActiveRef.current = false;
    isConnectedRef.current = false;
    cleanup();
    setState('idle');
    setIsConnected(false);
    setTranscript([]);
    setDetectedLanguage(null);
  }, []);

  // Cleanup resources
  const cleanup = () => {
    // Stop audio sources
    audioSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) { /* ignore */ }
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
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch (e) { /* ignore */ }
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
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sessionActiveRef.current = false;
      cleanup();
    };
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Render idle state
  if (state === 'idle') {
    return (
      <div className="roof-er-content-area pocket-linguist">
        <div className="roof-er-content-scroll pocket-linguist__scroll">
          <div className="pocket-linguist__hero">
            <div className="pocket-linguist__title-block">
              <span className="pocket-linguist__eyebrow">Pocket Linguist</span>
              <div className="pocket-linguist__title-row">
                <span className="pocket-linguist__title-icon">
                  <Languages className="w-5 h-5" />
                </span>
                <h1 className="pocket-linguist__title">Real-Time Field Translator</h1>
              </div>
              <p className="pocket-linguist__subtitle">
                Detect the homeowner's language, translate both sides, and keep the conversation moving at the door.
              </p>
            </div>
            <div className="pocket-linguist__signal">
              <span className="pocket-linguist__signal-dot" />
              20+ languages ready
            </div>
          </div>

          <div className="pocket-linguist__idle-grid">
            {/* Agnes Avatar */}
            <div className="pocket-linguist__avatar-card">
              <div className="pocket-linguist__avatar-ring">
              <AgnesAvatar variant="linguist" />
              </div>
              <div className="pocket-linguist__avatar-caption">
                <Sparkles className="w-4 h-4" />
                Agnes listens for rep commands privately.
              </div>
            </div>

            <div className="pocket-linguist__setup-card">
              <div className="pocket-linguist__card-heading">
                <Globe className="w-4 h-4" />
                Supported languages
              </div>
              <div className="pocket-linguist__language-cloud">
                {SUPPORTED_LANGUAGES.slice(0, 12).map((lang, index) => (
                  <span
                    key={lang.code}
                    className={`pocket-linguist__language-chip pocket-linguist__language-chip--${index % 4}`}
                  >
                    <span>{lang.flag}</span>
                    {lang.name}
                  </span>
                ))}
                <span className="pocket-linguist__language-chip pocket-linguist__language-chip--more">
                  +{SUPPORTED_LANGUAGES.length - 12} more
                </span>
              </div>

              <button
                onClick={startSession}
                className="pocket-linguist__start-button"
              >
                <Phone className="w-5 h-5" />
                Start translation
              </button>

              <p className="pocket-linguist__hint">
                Say "Hey Agnes, I have a homeowner here..." to begin.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render active session
  return (
    <div className="roof-er-content-area pocket-linguist">
      <div className="roof-er-content-scroll pocket-linguist__scroll">
        {/* Header */}
        <div className="pocket-linguist__session-header">
          <div className="pocket-linguist__title-row">
            <span className="pocket-linguist__title-icon">
              <Languages className="w-5 h-5" />
            </span>
            <div>
              <h1 className="pocket-linguist__session-title">Pocket Linguist</h1>
              <p className="pocket-linguist__session-subtitle">Live translation session</p>
            </div>
            {detectedLanguage && (
              <span className="pocket-linguist__detected-badge">
                {detectedLanguage} Detected
              </span>
            )}
          </div>

          <button
            onClick={endSession}
            className="pocket-linguist__end-button"
          >
            <PhoneOff className="w-4 h-4" />
            End
          </button>
        </div>

        {/* Main Content */}
        <div className="pocket-linguist__session-grid">
          {/* Transcript */}
          <div className="pocket-linguist__conversation-card">
            <div className="pocket-linguist__card-header">
              <MessageSquare className="w-4 h-4" />
              <span>
                Conversation
              </span>
            </div>

            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {transcript.length === 0 ? (
                <div className="pocket-linguist__empty">
                  <Globe className="w-8 h-8 mx-auto mb-3" style={{ opacity: 0.5 }} />
                  <p>Start speaking to begin translation</p>
                </div>
              ) : (
                transcript.map(entry => {
                  const speakerInfo =
                    entry.speaker === 'agnes' ? { label: 'Agnes', className: 'pocket-linguist__entry--agnes' } :
                    entry.speaker === 'user' ? { label: 'Rep (You)', className: 'pocket-linguist__entry--rep' } :
                    { label: 'Homeowner', className: 'pocket-linguist__entry--homeowner' };

                  return (
                    <div
                      key={entry.id}
                      className={`pocket-linguist__entry ${speakerInfo.className}`}
                    >
                      <div className="pocket-linguist__entry-label">
                        {speakerInfo.label}
                        {entry.detectedLang && (
                          <span className="pocket-linguist__entry-lang">
                            {entry.detectedLang}
                          </span>
                        )}
                      </div>
                      <div style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.5 }}>
                        {entry.originalText}
                      </div>
                      {entry.translatedText && (
                        <div style={{
                          marginTop: '8px',
                          paddingTop: '8px',
                          borderTop: '1px solid rgba(255,255,255,0.1)',
                          color: 'var(--text-tertiary)',
                          fontSize: '13px',
                          fontStyle: 'italic'
                        }}>
                          → {entry.translatedText}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>

          {/* Agnes Panel */}
          <div className="pocket-linguist__assistant-card">
            {/* Agnes Avatar */}
            <div className="pocket-linguist__avatar-ring pocket-linguist__avatar-ring--small">
              <AgnesAvatar variant="linguist" isActive={aiSpeaking} />
            </div>

            {/* Status */}
            <div className={`pocket-linguist__status pocket-linguist__status--${state}`}>
              {state === 'connecting' && 'Connecting...'}
              {state === 'listening' && 'Listening...'}
              {state === 'speaking' && 'Translating...'}
              {state === 'error' && 'Error'}
            </div>

            {/* Waveform */}
            <div style={{ marginTop: '20px', width: '100%' }}>
              <Waveform analyser={aiSpeaking ? analyserRef.current : micAnalyserRef.current} />
            </div>

            {/* Controls */}
            <div style={{
              display: 'flex',
              gap: '12px',
              marginTop: '24px'
            }}>
              <button
                onClick={() => {
                  const newMuted = !isMuted;
                  setIsMuted(newMuted);
                  isMutedRef.current = newMuted;
                }}
                className={`pocket-linguist__control ${isMuted ? 'pocket-linguist__control--danger' : ''}`}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <button
                onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                className={`pocket-linguist__control ${!isSpeakerOn ? 'pocket-linguist__control--danger' : ''}`}
                title={isSpeakerOn ? 'Mute Speaker' : 'Unmute Speaker'}
              >
                {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                marginTop: '16px',
                padding: '12px',
                background: 'rgba(220, 38, 38, 0.1)',
                border: '1px solid rgba(220, 38, 38, 0.3)',
                borderRadius: '8px',
                color: '#dc2626',
                fontSize: '13px',
                textAlign: 'center'
              }}>
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TranslatorPanel;
