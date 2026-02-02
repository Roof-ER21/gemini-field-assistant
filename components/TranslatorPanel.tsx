import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, X, Globe, Volume2, VolumeX, Phone, PhoneOff, Languages, MessageSquare } from 'lucide-react';
import { SUPPORTED_LANGUAGES, SupportedLanguage } from '../agnes21/types';
import AgnesAvatar from '../agnes21/components/AgnesAvatar';
import Waveform from '../agnes21/components/Waveform';
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
  const sessionActiveRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const aiSpeaking = activeAudioCount > 0;

  // Build translator system instruction
  const buildTranslatorSystemInstruction = () => {
    return `You are Agnes 21, a friendly and professional real-time translator helping a roofing sales rep communicate with a homeowner who speaks a different language.

## YOUR ROLE
You are a live interpreter in a three-way conversation:
1. The SALES REP speaks English
2. The HOMEOWNER speaks their native language (you will auto-detect it)
3. YOU translate between them seamlessly

## CONVERSATION FLOW

### Initial Activation
When the rep says something like "Hey Agnes, I have a homeowner here I need help communicating with" or similar:
1. Respond warmly to the rep: "Hey! I'm ready to help you communicate. Just have the homeowner start speaking and I'll detect their language automatically."
2. Wait for the homeowner to speak

### Language Detection
When you hear speech that isn't English:
1. Detect the language automatically
2. Announce to the rep: "I detected [Language]. I'll translate everything for you both."
3. Introduce yourself to the homeowner IN THEIR LANGUAGE: "[Greeting in their language], I'm Agnes, a translator helping today. I'll translate everything so you can communicate easily."

### During Conversation
- When you hear ENGLISH: Translate to the detected foreign language and speak it aloud
- When you hear the FOREIGN LANGUAGE: Translate to English and speak it aloud
- Keep translations natural and conversational, not robotic
- Maintain the speaker's tone and intent
- For roofing terms, use culturally appropriate explanations when needed

## TRANSLATION STYLE
- Be accurate but natural-sounding
- Keep the same emotional tone as the original speaker
- For technical roofing terms (shingles, flashing, underlayment, etc.), translate accurately or explain if no direct translation exists
- Don't add your own commentary during translations - just translate

## SPECIAL COMMANDS
- "Agnes, what language is that?" - Tell the rep what language was detected
- "Agnes, say that again" - Repeat the last translation
- "Agnes, how do I say [phrase]?" - Help the rep say something specific
- "Agnes, end translation" - End the session gracefully in both languages

## PERSONALITY
- Warm and professional
- Patient with both parties
- Culturally sensitive
- Quick and efficient with translations

## SUPPORTED LANGUAGES
You can translate between English and: Spanish, Chinese (Mandarin), Vietnamese, Korean, Portuguese, Arabic, French, Russian, Tagalog, Hindi, Japanese, German, Italian, Polish, Ukrainian, Persian, Thai, Bengali, Haitian Creole, Punjabi, and more.

Remember: You're here to help close deals by breaking down language barriers. Be helpful, be fast, and make communication seamless!`;
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
            setIsConnected(false);
            if (sessionActiveRef.current) {
              setState('idle');
            }
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
        setTranscript(prev => [...prev, {
          id: Date.now().toString(),
          speaker: 'user',
          originalText: text,
          timestamp: new Date()
        }]);
      }
    }

    // Handle output transcription (Agnes's response)
    const outputTranscription = serverContent?.outputTranscription;
    if (outputTranscription?.text) {
      const text = outputTranscription.text.trim();
      if (text) {
        // Check if it's a language detection announcement
        const langMatch = text.match(/I detected (\w+)/i);
        if (langMatch) {
          setDetectedLanguage(langMatch[1]);
        }

        setTranscript(prev => [...prev, {
          id: Date.now().toString(),
          speaker: 'agnes',
          originalText: text,
          timestamp: new Date()
        }]);
      }
    }

    // Handle audio output
    const parts = serverContent?.modelTurn?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
        if (isSpeakerOn) {
          await playAudioChunk(part.inlineData.data);
        }
      }
    }
  };

  // Play audio from Gemini
  const playAudioChunk = async (base64Audio: string) => {
    if (!outputAudioContextRef.current || !analyserRef.current) return;

    try {
      const audioData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
      const audioBuffer = await outputAudioContextRef.current.decodeAudioData(audioData.buffer.slice(0));

      const source = outputAudioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyserRef.current);
      analyserRef.current.connect(outputAudioContextRef.current.destination);

      const currentTime = outputAudioContextRef.current.currentTime;
      const startTime = Math.max(currentTime, nextStartTimeRef.current);
      nextStartTimeRef.current = startTime + audioBuffer.duration;

      audioSourcesRef.current.add(source);
      setActiveAudioCount(prev => prev + 1);
      setState('speaking');

      source.onended = () => {
        audioSourcesRef.current.delete(source);
        setActiveAudioCount(prev => {
          const newCount = prev - 1;
          if (newCount === 0) {
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

  // Start audio input
  const startAudioInput = () => {
    if (!streamRef.current || !inputAudioContextRef.current || !sessionRef.current) return;

    const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);

    if (micAnalyserRef.current) {
      source.connect(micAnalyserRef.current);
    }

    const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (!sessionRef.current || isMuted) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        pcm16[i] = Math.max(-32768, Math.min(32767, Math.floor(inputData[i] * 32768)));
      }

      const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
      sessionRef.current.sendRealtimeInput({
        audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
      });
    };

    source.connect(processor);
    processor.connect(inputAudioContextRef.current.destination);
  };

  // End session
  const endSession = useCallback(() => {
    sessionActiveRef.current = false;
    cleanup();
    setState('idle');
    setIsConnected(false);
    setTranscript([]);
    setDetectedLanguage(null);
  }, []);

  // Cleanup resources
  const cleanup = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch (e) { /* ignore */ }
      sessionRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    audioSourcesRef.current.clear();
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
          gridTemplateColumns: '1fr 300px',
          gap: '16px',
          height: 'calc(100vh - 200px)'
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
                transcript.map(entry => (
                  <div
                    key={entry.id}
                    style={{
                      padding: '12px 16px',
                      background: entry.speaker === 'agnes' ? '#1a1a1a' : '#111',
                      borderRadius: '10px',
                      borderLeft: `3px solid ${
                        entry.speaker === 'agnes' ? '#dc2626' : '#3b82f6'
                      }`
                    }}
                  >
                    <div style={{
                      fontSize: '11px',
                      color: entry.speaker === 'agnes' ? '#dc2626' : '#3b82f6',
                      marginBottom: '4px',
                      fontWeight: 600,
                      textTransform: 'uppercase'
                    }}>
                      {entry.speaker === 'agnes' ? 'Agnes (Translator)' : 'Speaker'}
                    </div>
                    <div style={{ color: '#fff', fontSize: '14px', lineHeight: 1.5 }}>
                      {entry.originalText}
                    </div>
                  </div>
                ))
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
                onClick={() => setIsMuted(!isMuted)}
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
