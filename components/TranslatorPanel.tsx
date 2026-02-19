import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, X, Globe, Volume2, VolumeX, Phone, PhoneOff, Languages, MessageSquare } from 'lucide-react';
import { SUPPORTED_LANGUAGES, SupportedLanguage } from '../agnes21/types';
import AgnesAvatar from '../agnes21/components/AgnesAvatar';
import Waveform from '../agnes21/components/Waveform';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from '../agnes21/utils/audioUtils';
import { env } from '../src/config/env';

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

      // Setup API client
      const apiKey = import.meta.env.VITE_GOOGLE_AI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API key not configured');
      }
      aiClientRef.current = new GoogleGenAI({ apiKey });

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
            console.error('Translator error:', error);
            setError('Connection error. Please try again.');
            setState('error');
          },
          onclose: () => {
            console.log('Translator session closed');
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
      <div className="roof-er-content-area">
        <div className="roof-er-content-scroll">
          <div className="roof-er-page-title">
            <Languages className="w-6 h-6 inline mr-2" style={{ color: '#dc2626' }} />
            Agnes Translator
          </div>

          <div style={{
            maxWidth: '600px',
            margin: '0 auto',
            padding: '40px 20px',
            textAlign: 'center'
          }}>
            {/* Agnes Avatar */}
            <div style={{ marginBottom: '24px' }}>
              <AgnesAvatar speaking={false} size={120} />
            </div>

            <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '12px' }}>
              Real-Time Field Translator
            </h2>

            <p style={{ color: '#a1a1aa', fontSize: '15px', marginBottom: '32px', lineHeight: 1.6 }}>
              Agnes will help you communicate with homeowners who speak different languages.
              Just start talking and she'll automatically detect the language and translate in real-time.
            </p>

            {/* Supported Languages */}
            <div style={{
              background: '#111',
              border: '1px solid #1a1a1a',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '32px'
            }}>
              <div style={{ fontSize: '13px', color: '#71717a', marginBottom: '12px' }}>
                Supports 20+ Languages
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                {SUPPORTED_LANGUAGES.slice(0, 12).map(lang => (
                  <span
                    key={lang.code}
                    style={{
                      padding: '4px 10px',
                      background: '#1a1a1a',
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: '#fff'
                    }}
                  >
                    {lang.flag} {lang.name}
                  </span>
                ))}
                <span style={{
                  padding: '4px 10px',
                  background: '#1a1a1a',
                  borderRadius: '6px',
                  fontSize: '13px',
                  color: '#71717a'
                }}>
                  +{SUPPORTED_LANGUAGES.length - 12} more
                </span>
              </div>
            </div>

            {/* Start Button */}
            <button
              onClick={startSession}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px 32px',
                background: 'linear-gradient(135deg, #dc2626, #991b1b)',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '18px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(220, 38, 38, 0.3)'
              }}
            >
              <Phone className="w-6 h-6" />
              Start Translation
            </button>

            <p style={{ color: '#52525b', fontSize: '13px', marginTop: '16px' }}>
              Say "Hey Agnes, I have a homeowner here..." to begin
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Render active session
  return (
    <div className="roof-er-content-area">
      <div className="roof-er-content-scroll" style={{ padding: '16px' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Languages className="w-5 h-5" style={{ color: '#dc2626' }} />
            <span style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>
              Agnes Translator
            </span>
            {detectedLanguage && (
              <span style={{
                padding: '4px 10px',
                background: '#166534',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#fff'
              }}>
                {detectedLanguage} Detected
              </span>
            )}
          </div>

          <button
            onClick={endSession}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <PhoneOff className="w-4 h-4" />
            End
          </button>
        </div>

        {/* Main Content */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: window.innerWidth < 768 ? '1fr' : '1fr 300px',
          gap: '16px',
          flex: 1,
          minHeight: 0
        }}>
          {/* Transcript */}
          <div style={{
            background: '#0a0a0a',
            border: '1px solid #1a1a1a',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid #1a1a1a',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <MessageSquare className="w-4 h-4" style={{ color: '#dc2626' }} />
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
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
                <div style={{ textAlign: 'center', color: '#52525b', padding: '40px' }}>
                  <Globe className="w-8 h-8 mx-auto mb-3" style={{ opacity: 0.5 }} />
                  <p>Start speaking to begin translation</p>
                </div>
              ) : (
                transcript.map(entry => {
                  const speakerInfo =
                    entry.speaker === 'agnes' ? { label: 'Agnes', color: '#dc2626', bg: '#1a1a1a' } :
                    entry.speaker === 'user' ? { label: 'Rep (You)', color: '#10b981', bg: '#111' } :
                    { label: 'Homeowner', color: '#3b82f6', bg: '#111' };

                  return (
                    <div
                      key={entry.id}
                      style={{
                        padding: '12px 16px',
                        background: speakerInfo.bg,
                        borderRadius: '10px',
                        borderLeft: `3px solid ${speakerInfo.color}`
                      }}
                    >
                      <div style={{
                        fontSize: '11px',
                        color: speakerInfo.color,
                        marginBottom: '4px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        {speakerInfo.label}
                        {entry.detectedLang && (
                          <span style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            background: 'rgba(0,0,0,0.3)',
                            borderRadius: '4px'
                          }}>
                            {entry.detectedLang}
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#fff', fontSize: '14px', lineHeight: 1.5 }}>
                        {entry.originalText}
                      </div>
                      {entry.translatedText && (
                        <div style={{
                          marginTop: '8px',
                          paddingTop: '8px',
                          borderTop: '1px solid rgba(255,255,255,0.1)',
                          color: '#a1a1aa',
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
          <div style={{
            background: '#0a0a0a',
            border: '1px solid #1a1a1a',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            {/* Agnes Avatar */}
            <AgnesAvatar speaking={aiSpeaking} size={100} />

            {/* Status */}
            <div style={{
              marginTop: '16px',
              padding: '8px 16px',
              background: state === 'listening' ? '#166534' : state === 'speaking' ? '#dc2626' : '#1a1a1a',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#fff'
            }}>
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
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  background: isMuted ? '#dc2626' : '#1a1a1a',
                  border: '1px solid #333',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <button
                onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  background: isSpeakerOn ? '#1a1a1a' : '#dc2626',
                  border: '1px solid #333',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
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
