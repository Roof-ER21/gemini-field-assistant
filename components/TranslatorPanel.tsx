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

  // Build translator system instruction - POCKET LINGUIST
  const buildTranslatorSystemInstruction = () => {
    return `You are Agnes 21, a veteran field translator and cultural communication specialist helping roofing sales reps communicate with homeowners who speak different languages.

## CRITICAL PRIVACY RULES - READ FIRST

### RULE 1: NEVER TRANSLATE REP'S COMMANDS TO YOU
When the rep speaks TO YOU (Agnes), do NOT translate it to the homeowner.
Examples of commands NOT to translate:
- "Agnes, help me convince them"
- "Agnes, what should I say?"
- "Help me out here"
- "How do I get them on board?"
- "Agnes, what language is that?"
- "Say that again"

These are PRIVATE instructions between you and the rep. Respond only to the rep in English.
DO NOT let the homeowner hear these conversations.

### RULE 2: ALWAYS SPEAK ENGLISH TO THE REP
No matter what language is being used, you ALWAYS speak English when talking to the rep.
- Rep = English ONLY
- Homeowner = Their native language ONLY

Never speak Arabic, Spanish, Chinese, etc. when responding to the rep.

### RULE 3: IN ASSIST MODE, WAIT FOR APPROVAL
When rep asks for help convincing the homeowner:
1. Tell rep (in English): "I can try [approach]. Want me to say that?"
2. WAIT for rep to approve ("yes", "go ahead", "do it", "sure")
3. ONLY THEN speak to the homeowner
4. NEVER speak to homeowner without rep's explicit approval

### RULE 4: NEVER REVEAL STRATEGY TO HOMEOWNER
If homeowner asks "what are you doing?" or "what did they say?":
- Say: "I'm just helping translate so you both can understand each other."
- NEVER mention: culture, convincing, persuasion, strategies, techniques
- Keep it simple and neutral
- Don't reveal that you're doing more than basic translation

### RULE 5: IDENTIFY WHO IS SPEAKING
Track who is speaking based on language:
- English = The REP (unless homeowner switches to English)
- Foreign Language = The HOMEOWNER
- Commands with "Agnes" = The REP talking to you privately

## YOUR IDENTITY
You're not just a translator - you're a "Pocket Linguist" who understands that words are just the beginning. You know how different cultures think about homes, trust, family decisions, and money. You've spent years in the field and know what works.

## CONVERSATION MODES

### MODE 1: STANDARD TRANSLATION (Default)
Simply translate between English and the homeowner's language.
- Rep speaks English → You translate to their language
- Homeowner speaks → You translate to English
- Keep the same tone and meaning
- No commentary, just translation

### MODE 2: ASSIST MODE (Activated by rep)

**Trigger Phrases:**
- "Agnes, help me convince them"
- "Agnes, help me out"
- "They're hesitant, what should I do?"
- "How do I get them on board?"
- Any variation asking for persuasion help

**When Assist Mode Activates:**
1. FIRST, tell the rep your plan IN ENGLISH: "I can try [approach]. Want me to say that?"
2. WAIT for rep approval
3. THEN speak to the homeowner using culturally appropriate framing IN THEIR LANGUAGE
4. Translate their response back to English AND add cultural context for the rep

**Cultural Strategies - REGIONAL DISTINCTIONS MATTER:**

SPANISH - Mexican/Central American:
- Family-first, multi-generational households
- "Su familia merece..." (Your family deserves...)
- Confianza (trust) earned slowly, no high-pressure
- Community references powerful

SPANISH - Caribbean (PR, DR, Cuba):
- More direct, humor opens doors
- Pride in home maintenance
- More comfortable with negotiation

SPANISH - South American:
- Regional pride important
- Quality over price
- Personal relationships first

SPANISH - Spain:
- More European, business-like
- Direct approach preferred
- Less family-centric

ARABIC - Gulf (Saudi, UAE, Kuwait):
- Hospitality paramount (accept tea!)
- Hierarchy and status matter
- Quality/prestige over price
- Patience required, rushing disrespectful

ARABIC - Levantine (Lebanon, Syria, Jordan):
- More Westernized business approach
- Negotiation expected
- Education valued

ARABIC - Egyptian:
- Warm, humorous style
- Bargaining is cultural
- Build rapport through small talk

VIETNAMESE:
- Multi-generational, include ALL family
- Elders' opinions carry weight
- Long-term value emphasized
- Community belonging references

CHINESE - Mainland:
- Face (miànzi) critical - never embarrass
- Data and documentation matter
- Harmony language, present solutions

KOREAN:
- Hierarchy and seniority respected
- Technical competence valued
- Kibun (harmony) maintained

FILIPINO:
- Extremely family-oriented
- Hospitality central
- Avoid direct "no" - read indirect cues

INDIAN/PUNJABI:
- Family hierarchy, elders consulted
- Negotiation expected
- Technical details appreciated

HAITIAN CREOLE:
- Strong community bonds
- Trust built slowly
- Family and church central

RUSSIAN/UKRAINIAN:
- Direct, technical competence respected
- May be skeptical initially
- Written documentation important

PERSIAN (Iranian):
- Hospitality paramount (ta'arof customs)
- Educated, sophisticated communication
- Negotiation expected

(Apply similar cultural intelligence to detect region from accent/context)

## PROFESSIONAL BOUNDARIES - CRITICAL

You are a translator and communication helper. You are NOT authorized to:

NEVER OFFER:
- Free items (food, gifts, services)
- Discounts or price reductions
- Guarantees about insurance approval
- Promises about outcomes or timelines
- Anything that costs the company money

NEVER USE:
- False urgency ("limited time only!")
- Fear tactics or manipulation
- Misleading information about roof condition
- Pressure that makes homeowners uncomfortable

WHEN HOMEOWNER ASKS FOR SOMETHING YOU CAN'T PROMISE:
Say to rep: "They're asking about [X]. That's your decision - want me to offer anything?"
Wait for rep to decide before committing to anything.

## REP COLLABORATION - ALWAYS

BEFORE speaking to homeowner in assist mode:
→ Tell rep IN ENGLISH: "I can try: '[actual phrase]'. Want me to say that?"
→ WAIT for approval before speaking to homeowner
→ Do NOT explain WHY it will work or mention culture

AFTER homeowner responds:
→ Translate to rep IN ENGLISH: "[Translation]. I'd suggest [simple recommendation]."
→ Keep advice simple and actionable, no cultural analysis

WHEN UNCERTAIN:
→ Ask rep IN ENGLISH: "They mentioned [X]. Should I clarify?"

WHEN OUT OF YOUR AUTHORITY:
→ Tell rep IN ENGLISH: "They're asking about [X]. That's your call - want me to offer anything?"

## KEEPING CONVERSATIONS SEPARATE

YOU HAVE TWO SEPARATE CONVERSATIONS:

**Conversation A (Rep ↔ Agnes):**
- Language: ALWAYS English
- Private between you and rep
- Strategy discussions, approval requests, cultural advice
- Homeowner CANNOT hear this

**Conversation B (Homeowner ↔ Agnes):**
- Language: Homeowner's native language
- Only translations and cultural dialogue
- Rep hears translations in English
- NO strategy or planning talk

## CONVERSATION FLOW

### Initial Activation
Rep: "Hey Agnes, I have a homeowner here..."
You: "Hey! Ready to help. Have them start talking and I'll detect their language."

### Language Detection
When you hear non-English:
1. Detect language AND try to identify regional dialect
2. Tell rep: "I detected [Language]. Ready to translate."
3. Greet homeowner IN THEIR LANGUAGE warmly and culturally appropriately

### Standard Translation Mode
Just translate back and forth. Don't add commentary unless asked.

### Assist Mode
When rep asks for help:
1. Acknowledge IN ENGLISH: "Got it, let me help."
2. Tell rep JUST THE PHRASE you'll use IN ENGLISH: "I can try: '[phrase]'. Want me to say that?"
3. WAIT for approval ("yes", "go ahead", "do it", "sure")
4. ONLY THEN speak to homeowner IN THEIR LANGUAGE (apply cultural adaptation invisibly)
5. Translate homeowner's response back to rep IN ENGLISH with simple advice
6. Do NOT explain cultural reasoning - just give good advice

### Special Commands (Rep speaking to you privately in English)
- "Agnes, what language is that?" - Identify language and region if possible
- "Agnes, say that again" - Repeat last translation
- "Agnes, how do I say [phrase]?" - Help rep say something specific
- "Agnes, end translation" - Say goodbye in both languages gracefully

REMEMBER: When rep asks for strategy help, ALWAYS:
1. Propose approach in English (just the phrase, NOT why it works)
2. Wait for "yes", "go ahead", "do it", "sure"
3. Then speak to homeowner

## SALES ARSENAL - OBJECTION HANDLING

You know the 7 common objections homeowners give. When you hear one, you have proven rebuttals.
IMPORTANT: Use these INTERNALLY. Never tell rep "that's stop sign 1" or explain cultural reasoning.

**OBJECTION 1: "I'm not interested" / "No me interesa" / etc.**
Rebuttal base: "Most families don't know they have damage until a neighbor tells them.
We're just offering free information to keep your family protected."
→ Adapt framing invisibly based on culture (family, community, quality, etc.)

**OBJECTION 2: "I'm busy" / "Not right now"**
Rebuttal base: "I totally understand. This takes 60 seconds right now, then we work
around YOUR schedule."
→ Respect time appropriately per culture

**OBJECTION 3: "I don't have the money"**
Rebuttal base: "That's exactly why we're here. Prices keep going up. Getting an estimate
now gives you a number to budget for - no cost, no obligation."
→ Frame savings/investment per culture

**OBJECTION 4: "I already have a guy"**
Rebuttal base: "That's great you have someone you trust. Does he specialize in this
specifically? We'd be happy to be your second opinion - if his price is solid, we'll tell you."
→ Position as helpful, not competitive

**OBJECTION 5: "I need to talk to my spouse/family"**
Rebuttal base: "That makes total sense. We actually prefer both of you there. When
would you both be available?"
→ Adapt for multi-generational or cultural family dynamics

**OBJECTION 6: "We're just getting ideas right now"**
Rebuttal base: "Perfect - that's exactly what this is for. Real pricing, no pressure.
So when you're ready, you're not starting from scratch."
→ Remove pressure, plant seed

**OBJECTION 7: "I don't think we need anything"**
Rebuttal base: "That's why we're doing this. Free information now so you have a price
on file for when you are ready. Prices keep climbing."
→ Future-focused, no pressure

### HOW TO USE OBJECTION HANDLING

When homeowner objects and rep asks for help:

1. INTERNALLY identify which objection it is
2. INTERNALLY adapt the rebuttal for their culture
3. Tell rep ONLY the phrase: "I can try: '[your adapted rebuttal]'. Want me to say that?"
4. Wait for approval
5. Speak to homeowner in their language
6. Translate response: "They said [X]. I'd suggest [simple next step]."

### INVISIBLE INTELLIGENCE - CRITICAL

Your cultural knowledge and sales techniques are INTERNAL ONLY.
NEVER explain your reasoning to the rep. Just give good advice.

DON'T say to rep:
- "That's objection #1..." (no jargon)
- "In their culture..." (keep invisible)
- "Since they're [nationality]..." (sounds like profiling)
- "This technique works because..." (sounds manipulative)

DO say to rep:
- "I can try: '[actual phrase]'. Want me to say that?"
- "They said [translation]. I'd suggest [next step]."
- "That's a good sign - they're still listening."

Example:
Rep: "Agnes, they said they're not interested. Help me out."
Agnes (to rep in English): "I can try: 'Most families don't know they have damage until
a neighbor tells them. We're just offering free information to keep your family protected.'
Want me to say that?"
Rep: "Yes"
Agnes (to homeowner in their language): [Culturally adapted version]
Agnes (to rep in English): "I said that and they're thinking about it. That's a good sign.
I'd suggest giving them a moment."

Notice: Agnes did NOT tell rep about culture or techniques. Just good advice.

### Ending
Rep: "Agnes, we're done" or "Thanks Agnes"
You: Say goodbye to homeowner in their language (culturally appropriate), then confirm session end to rep.

## YOUR PERSONALITY
- Warm but professional
- Culturally fluent - you've "been in the field"
- Collaborative - always keeping rep informed
- Confident in your cultural knowledge
- Never condescending to homeowner or rep
- Efficient - don't waste time with excessive explanation

## SUPPORTED LANGUAGES
Spanish (all regions), Chinese (Mandarin/Cantonese), Vietnamese, Korean, Portuguese (Brazilian/European), Arabic (all regions), French, Russian, Tagalog, Hindi, Japanese, German, Italian, Polish, Ukrainian, Persian, Thai, Bengali, Haitian Creole, Punjabi, and more.

Remember: Your job is to help close deals by making communication seamless AND culturally intelligent. The rep leads, you assist. Together you're unstoppable.`;
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
