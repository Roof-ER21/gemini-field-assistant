
import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createPcmBlob, decodeAudioData, base64ToUint8Array, blobToBase64 } from '../utils/audioUtils';
import { buildSystemInstruction } from '../utils/improvedPrompts';
import Waveform from './Waveform';
import AgnesAvatar from './AgnesAvatar';
import MicLevelMeter from './MicLevelMeter';
import AgnesStateIndicator, { AgnesState } from './AgnesStateIndicator';
import StreakCounter from './StreakCounter';
import Confetti from './Confetti';
import SparklesComponent from './Sparkles';
import { SessionConfig, PitchMode, DifficultyLevel } from '../types';
import {
  saveSession,
  updateSession,
  generateSessionId,
  updateStreak,
  checkAchievements,
  getAchievementById,
  SessionData,
  TranscriptMessage as StoredTranscriptMessage
} from '../utils/sessionStorage';
import {
  saveVideoRecording,
  getSupportedMimeType,
  generateThumbnail
} from '../utils/videoStorage';
import { playSuccess, playPerfect, playLevelUp, toggleSounds, areSoundsEnabled } from '../utils/soundEffects';
import { useAuth } from '../contexts/AuthContext';
import { checkTTSHealth, generateSpeech, DEFAULT_FEEDBACK_VOICE, speakWithChatterbox } from '../utils/chatterboxTTS';
import { createVAD, startVAD, stopVAD, pauseVAD, createFallbackVAD } from '../utils/vadUtils';
import { Mic, MicOff, Video, VideoOff, X, ChevronDown, ChevronUp, Trophy, Skull, Shield, Zap, MessageSquare, Keyboard, Circle, Sparkles, AlertTriangle, Volume2, VolumeX, Wand2, Hand, Users, Headphones } from 'lucide-react';
import XPBar from './XPBar';
import LevelUpModal from './LevelUpModal';
import ScoreReviewModal from './ScoreReviewModal';
import { calculateSessionXP, awardXP, getUserProgress } from '../utils/gamification';
import { getStreak } from '../utils/sessionStorage';
import { env } from '../../src/config/env';

interface PitchTrainerProps {
  config: SessionConfig;
  onEndSession: () => void;
  onMiniModuleComplete?: (moduleId: string) => void;
}

interface TranscriptMessage {
  role: 'user' | 'agnes';
  text: string;
  timestamp: Date;
  score?: number;
}

const PitchTrainer: React.FC<PitchTrainerProps> = ({ config, onEndSession, onMiniModuleComplete }) => {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const isConnectedRef = useRef(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  // We track active audio chunks to keep the visualizer synced with actual playback
  const [activeAudioCount, setActiveAudioCount] = useState(0);
  const aiSpeaking = activeAudioCount > 0;

  const [error, setError] = useState<string | null>(null);
  const [isScriptExpanded, setIsScriptExpanded] = useState(false);

  // NEW: Transcript and scoring
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);
  const [currentScore, setCurrentScore] = useState<number | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // NEW: Session persistence
  const [sessionId] = useState<string>(generateSessionId());
  const [sessionStartTime] = useState<Date>(new Date());

  // NEW: Agnes state tracking
  const [agnesState, setAgnesState] = useState<AgnesState>(AgnesState.IDLE);

  // NEW: Keyboard shortcuts hint
  const [showKeyboardHints, setShowKeyboardHints] = useState(false);

  // NEW: Streak tracking
  const [streakKey, setStreakKey] = useState(0); // Used to trigger StreakCounter reload

  // NEW: Video recording
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // NEW: End Session modals
  const [showEndSessionModal, setShowEndSessionModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [videoSaved, setVideoSaved] = useState(false);
  const [newAchievements, setNewAchievements] = useState<string[]>([]);

  // NEW: Celebration states
  const [showConfetti, setShowConfetti] = useState(false);
  const [showSparkles, setShowSparkles] = useState(false);
  const [soundsOn, setSoundsOn] = useState(areSoundsEnabled());

  // NEW: Custom Voice Mode (Chatterbox TTS with Reeses Piecies)
  const [useCustomVoice, setUseCustomVoice] = useState(false);
  const [ttsAvailable, setTtsAvailable] = useState<boolean | null>(null);

  // NEW: Score Me functionality
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [isRequestingScore, setIsRequestingScore] = useState(false);
  const isRequestingScoreRef = useRef(false); // Ref to track in async callbacks
  const isPlayingScoreAudioRef = useRef(false); // Ref to track when score audio is playing (prevents session end)
  const scoreCleanupTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Delayed cleanup for multi-chunk scores

  // NEW: Score Review Modal - dedicated UI for uninterrupted score delivery
  const [showScoreReviewModal, setShowScoreReviewModal] = useState(false);
  const [scoreReviewText, setScoreReviewText] = useState('');
  const [scoreReviewNumeric, setScoreReviewNumeric] = useState<number | null>(null);
  const showScoreReviewModalRef = useRef(false); // Ref for VAD check

  // NEW: Score accumulation - wait for complete response before showing modal
  const scoreAccumulatorRef = useRef('');
  const [showScoreLoadingModal, setShowScoreLoadingModal] = useState(false);
  const lastInputTranscriptRef = useRef('');
  const lastOutputTranscriptRef = useRef('');
  const lastModelTextRef = useRef('');
  const lastScoreCommandAtRef = useRef(0);
  const [sessionNonce, setSessionNonce] = useState(0);

  // NEW: Silence timeout tracking (10 seconds for roleplay/feedback to allow thinking pauses)
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const SILENCE_TIMEOUT_MS = 10000; // 10 seconds of silence = end of speech (for longer roleplay responses)
  const [isSpeakingCustom, setIsSpeakingCustom] = useState(false);

  // NEW: Push-to-Talk (PTT) mode
  type VoiceMode = 'continuous' | 'push-to-talk';
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('continuous');
  const [isPTTActive, setIsPTTActive] = useState(false);
  const isPTTActiveRef = useRef(false); // Ref for async callbacks
  const voiceModeRef = useRef<VoiceMode>('continuous'); // Ref for async callbacks
  const isMutedRef = useRef(false); // Ref for async callbacks (fixes closure bug)

  // NEW: Reconnection logic
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const MAX_RECONNECT_ATTEMPTS = 3;
  const RECONNECT_DELAY_MS = 2000;

  // NEW: Level-up modal state
  const [showLevelUpModal, setShowLevelUpModal] = useState(false);
  const [levelUpData, setLevelUpData] = useState<{
    previous: number;
    new: number;
    unlocks: string[];
  }>({ previous: 1, new: 1, unlocks: [] });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Audio Context Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null); // NEW: For user mic visualization

  const streamRef = useRef<MediaStream | null>(null);
  const audioInputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Video Interval Ref
  const frameIntervalRef = useRef<number | null>(null);
  
  // Session Ref (to avoid stale closures)
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const aiClientRef = useRef<GoogleGenAI | null>(null);

  // CRITICAL: Session active flag to prevent audio playback after cleanup starts
  const sessionActiveRef = useRef<boolean>(true);

  // Ref for custom voice mode (to avoid stale closures in callbacks)
  const useCustomVoiceRef = useRef<boolean>(false);

  const getDifficultyColor = () => {
    switch (config.difficulty) {
      case DifficultyLevel.BEGINNER: return 'text-cyan-500';
      case DifficultyLevel.ROOKIE: return 'text-green-500';
      case DifficultyLevel.PRO: return 'text-yellow-500';
      case DifficultyLevel.VETERAN: return 'text-orange-500';
      case DifficultyLevel.ELITE: return 'text-red-600';
      default: return 'text-white';
    }
  };

  // Push-to-Talk handlers
  const handlePTTStart = () => {
    if (voiceMode !== 'push-to-talk') return;
    setIsPTTActive(true);
    setIsMuted(false);
    // Clear any pending silence timeout
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    console.log('🎤 PTT: Started recording');
  };

  const handlePTTEnd = () => {
    if (voiceMode !== 'push-to-talk') return;
    setIsPTTActive(false);
    setIsMuted(true);
    // Signal end of user speech so Agnes can respond
    setIsSpeaking(false);
    console.log('🎤 PTT: Stopped recording');
  };

  // NEW: Keyboard shortcuts (with PTT support)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Spacebar for PTT (hold to talk)
      if (e.key === ' ' && voiceMode === 'push-to-talk' && !e.repeat) {
        e.preventDefault();
        handlePTTStart();
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'm':
          setIsMuted(prev => !prev);
          break;
        case 'v':
          setIsVideoEnabled(prev => !prev);
          break;
        case 's':
          setIsScriptExpanded(prev => !prev);
          break;
        case 't':
          setIsTranscriptExpanded(prev => !prev);
          break;
        case 'c':
          if (ttsAvailable) {
            setUseCustomVoice(prev => !prev);
          }
          break;
        case 'p':
          // Toggle PTT mode
          setVoiceMode(prev => {
            const newMode = prev === 'continuous' ? 'push-to-talk' : 'continuous';
            if (newMode === 'push-to-talk') {
              setIsMuted(true); // Start muted in PTT mode
            } else {
              setIsMuted(false); // Unmute when switching to continuous
            }
            return newMode;
          });
          break;
        case 'escape':
          if (confirm('Are you sure you want to end this session?')) {
            handleEndSession();
          }
          break;
        case '?':
          setShowKeyboardHints(prev => !prev);
          break;
        default:
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Release spacebar ends PTT
      if (e.key === ' ' && voiceMode === 'push-to-talk') {
        e.preventDefault();
        handlePTTEnd();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [voiceMode, ttsAvailable]);

  // NEW: Update Agnes state based on activity
  useEffect(() => {
    if (aiSpeaking || isSpeakingCustom) {
      setAgnesState(AgnesState.RESPONDING);
    } else if (isSpeaking) {
      setAgnesState(AgnesState.LISTENING);
    } else if (isConnected) {
      setAgnesState(AgnesState.IDLE);
    }
  }, [aiSpeaking, isSpeaking, isConnected, isSpeakingCustom]);

  // NEW: Check Chatterbox TTS availability (only in development)
  useEffect(() => {
    const checkTTS = async () => {
      // Skip TTS check in production - Chatterbox requires local backend
      const isDev = import.meta.env.DEV;
      const hasTTSUrl = import.meta.env.VITE_TTS_API_URL;

      if (!isDev && !hasTTSUrl) {
        // Silently disable in production without logging
        setTtsAvailable(false);
        return;
      }

      try {
        if (isDev) console.log('Checking Chatterbox TTS availability...');
        const available = await checkTTSHealth();
        setTtsAvailable(available);
        if (isDev) {
          if (available) {
            console.log('✅ Chatterbox TTS is available - custom voice enabled');
          } else {
            console.log('⚠️ Chatterbox TTS backend not responding (dev only)');
          }
        }
      } catch {
        setTtsAvailable(false);
      }
    };
    checkTTS();
  }, []);

  // Sync custom voice ref with state
  useEffect(() => {
    useCustomVoiceRef.current = useCustomVoice;
  }, [useCustomVoice]);

  // Sync PTT refs with state (for async callbacks)
  useEffect(() => {
    isPTTActiveRef.current = isPTTActive;
    voiceModeRef.current = voiceMode;
    isMutedRef.current = isMuted; // Sync muted state for audio processor callback
  }, [isPTTActive, voiceMode, isMuted]);

  // Sync connection ref with state
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  const waitForConnection = (timeoutMs: number) => {
    return new Promise<boolean>((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        if (isConnectedRef.current) {
          clearInterval(interval);
          resolve(true);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          clearInterval(interval);
          resolve(false);
        }
      }, 200);
    });
  };

  // Reconnection function
  const attemptReconnect = async () => {
    if (isReconnecting) return;

    setIsReconnecting(true);
    let attempts = 0;

    while (attempts < MAX_RECONNECT_ATTEMPTS) {
      attempts++;
      setConnectionAttempts(attempts);
      setError(`🔄 Reconnecting... (${attempts}/${MAX_RECONNECT_ATTEMPTS})`);

      try {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS));

        // Trigger a full re-init of the live session
        setSessionNonce(prev => prev + 1);

        const connected = await waitForConnection(8000);
        if (connected) {
          setError(null);
          setIsReconnecting(false);
          setConnectionAttempts(0);
          console.log('✅ Reconnection successful');
          return;
        }
      } catch (e) {
        console.error(`Reconnection attempt ${attempts} failed:`, e);
      }
    }

    // All attempts failed
    setIsReconnecting(false);
    setConnectionAttempts(0);
    setError('🌐 Connection failed after multiple attempts. Please refresh the page.');
  };

  useEffect(() => {
    const initSession = async () => {
      try {
        sessionActiveRef.current = true;
        isConnectedRef.current = false;
        setIsConnected(false);

        // 1. Setup Client
        const apiKey = import.meta.env.VITE_GOOGLE_AI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY;
        if (!apiKey) {
          throw new Error('Gemini API key not configured. Set VITE_GEMINI_API_KEY (or VITE_GOOGLE_AI_API_KEY) in Railway.');
        }
        aiClientRef.current = new GoogleGenAI({ apiKey });
        
        // 2. Setup Audio/Video Media Stream
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: true, 
          video: { width: 640, height: 480 } 
        });
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Use a more robust error handler for video play
          const playPromise = videoRef.current.play();
          if (playPromise !== undefined) {
            playPromise.catch(err => {
              // Silently ignore AbortError and DOMException with code 20 (interrupted)
              if (err.name === 'AbortError' ||
                  (err instanceof DOMException && err.code === 20)) {
                // Expected error when load is interrupted, ignore silently
                return;
              }
              // Log other errors
              console.error('Video play error:', err);
            });
          }
        }

        // 3. Setup Audio Contexts
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        inputAudioContextRef.current = new AudioContext({ sampleRate: 16000 });
        outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });

        // Setup Analyser for AI Voice
        const analyser = outputAudioContextRef.current.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        analyserRef.current = analyser;

        // Setup Analyser for User Mic (for waveform)
        const micAnalyser = inputAudioContextRef.current.createAnalyser();
        micAnalyser.fftSize = 256;
        micAnalyser.smoothingTimeConstant = 0.8;
        micAnalyserRef.current = micAnalyser;

        // 4. Build improved system instruction with division-awareness and per-script behavior
        const userDivision = (config.division as 'insurance' | 'retail') || (user?.division as 'insurance' | 'retail') || 'insurance';
        const systemInstruction = buildSystemInstruction(
          config.mode,
          config.difficulty,
          config.script || "No specific script provided",
          userDivision,
          config.scriptId  // Pass scriptId for per-script roleplay behavior
        );

        // 5. Connect to Gemini Live
        // Use stable model (gemini-2.0-flash-live-001) - preview models are unstable
        const sessionPromise = aiClientRef.current.live.connect({
          model: 'gemini-2.0-flash-live-001',
          callbacks: {
            onopen: () => {
              console.log('Gemini Live Session Opened');
              setIsConnected(true);
              isConnectedRef.current = true;
              if (isReconnecting) {
                setIsReconnecting(false);
                setConnectionAttempts(0);
                setError(null);
              }
              startAudioInput();
              startVideoInput();
              startRecording(); // Start video recording
            },
            onmessage: async (message: LiveServerMessage) => {
              const serverContent = message.serverContent;

              // Handle Interruption
              if (serverContent?.interrupted) {
                audioSourcesRef.current.forEach(source => {
                  try { source.stop(); } catch (e) { /* ignore */ }
                });
                audioSourcesRef.current.clear();
                setActiveAudioCount(0);
                nextStartTimeRef.current = 0;
                return;
              }

              // Voice command detection via input transcription
              const inputTranscription = serverContent?.inputTranscription;
              if (inputTranscription?.text && inputTranscription.finished) {
                const normalizedInput = inputTranscription.text.trim();
                if (normalizedInput && normalizedInput !== lastInputTranscriptRef.current) {
                  lastInputTranscriptRef.current = normalizedInput;
                  const scoreCommandRegex = /\b(agnes\s+)?score\s+me\b|\bgive\s+me\s+my\s+score\b|\bscore\s+my\s+session\b/i;
                  const now = Date.now();
                  if (
                    scoreCommandRegex.test(normalizedInput) &&
                    !isRequestingScoreRef.current &&
                    !showScoreReviewModalRef.current &&
                    now - lastScoreCommandAtRef.current > 2000
                  ) {
                    lastScoreCommandAtRef.current = now;
                    console.log('🎯 Voice command detected: score me');
                    handleScoreMe();
                  }
                }
              }

              // Handle Text Output (for transcript and custom voice)
              const outputTranscription = serverContent?.outputTranscription;
              const outputText = outputTranscription?.text || '';
              const parts = serverContent?.modelTurn?.parts || [];
              const modelText = parts
                .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
                .filter(Boolean)
                .join('');

              const getDelta = (current: string, previous: string) => {
                if (!current) return '';
                if (!previous) return current;
                if (current.startsWith(previous)) return current.slice(previous.length);
                return current;
              };

              const modelDelta = getDelta(modelText, lastModelTextRef.current);
              if (modelText) {
                lastModelTextRef.current = modelText;
              }

              const outputDelta = getDelta(outputText, lastOutputTranscriptRef.current);
              if (outputText) {
                lastOutputTranscriptRef.current = outputText;
              }

              const hasModelText = Boolean(modelText.trim());
              const detectionText = hasModelText ? modelText : outputText;
              const detectionDelta = hasModelText ? modelDelta : outputDelta;
              const isTurnComplete = Boolean(serverContent?.turnComplete || outputTranscription?.finished);
              const transcriptText = hasModelText ? modelText : outputText;

              if (detectionText) {
                // CRITICAL: Capture score request state BEFORE any changes
                // This ensures we know if this message is part of a score response
                const wasRequestingScore = isRequestingScoreRef.current;

                // Parse score ONLY if we explicitly requested it (prevents interim scores)
                // Check multiple formats the AI might return
                const scorePatterns = [
                  /AGNES SCORE:?\s*(\d+)/i,                    // "AGNES SCORE: 85" or "AGNES SCORE 85"
                  /(?:final\s+)?score:?\s*(\d+)\s*(?:\/\s*100)?/i,  // "Score: 85" or "Final Score: 85/100"
                  /(\d+)\s*(?:\/\s*100|\s*out\s+of\s+100|\s*points)/i,  // "85/100" or "85 out of 100" or "85 points"
                  /you(?:'ve)?\s+(?:scored|earned|got)\s+(\d+)/i  // "You scored 85" or "You've earned 85"
                ];

                let scoreMatch: RegExpMatchArray | null = null;
                for (const pattern of scorePatterns) {
                  scoreMatch = detectionText.match(pattern);
                  if (scoreMatch) break;
                }
                const parsedScore = scoreMatch ? parseInt(scoreMatch[1]) : null;
                // Validate score is in reasonable range (0-100)
                const score = (parsedScore !== null && parsedScore >= 0 && parsedScore <= 100) ? parsedScore : null;

                // Skip transcript updates during score accumulation - we'll add the complete response later
                // Only update currentScore and transcript for non-score messages
                if (!wasRequestingScore && isTurnComplete && transcriptText.trim()) {
                  if (score !== null) {
                    setCurrentScore(score);
                    console.log('Score detected in regular message:', score);
                  }

                  // Add to transcript for non-score messages only
                  setTranscript(prev => [...prev, {
                    role: 'agnes',
                    text: transcriptText,
                    timestamp: new Date(),
                    score: score !== null ? score : undefined
                  }]);
                }

                // STRICT SCORE DETECTION: Only match when Agnes is EXPLICITLY ending the session
                // Avoid false positives from mid-conversation feedback like "your score on that point"
                const scoringTriggers = [
                  /simulation\s*complete/i,                                    // Explicit session end signal
                  /AGNES\s*SCORE:?\s*\d+/i,                                   // Explicit Agnes score format
                  /your\s*(?:final\s+)?(?:overall\s+)?score\s*(?:is|:)\s*\d+/i, // "Your final score is 85"
                  /session\s*(?:is\s*)?(?:now\s*)?(?:complete|over|ended)/i,   // Session end phrases
                  /(?:here\s*is|presenting)\s*your\s*(?:final\s*)?(?:score|evaluation)/i // Score presentation
                ];
                // REMOVED overly broad patterns that caused false positives:
                // - /(?:final\s+)?score:?\s*\d+\s*(?:\/\s*100)/i - Too broad, matches "score: 85" anywhere
                // - /preparing\s*(?:your|the)\s*(?:final\s*)?/ - Triggers too early
                // - /let\s*me\s*(?:provide|give)/ - Could match normal conversation
                const containsScoreContent = scoringTriggers.some(p => p.test(detectionText));

                // Route to score modal if: 1) We explicitly requested score, OR 2) Response contains score content
                if (wasRequestingScore || containsScoreContent) {
                  // If user said "score me" verbally (not via button), set up scoring mode now
                  if (!wasRequestingScore && containsScoreContent) {
                    console.log('Voice command detected: Agnes acknowledging score request');
                    isRequestingScoreRef.current = true;
                    setIsRequestingScore(true);
                    setAgnesState(AgnesState.SCORING);
                    scoreAccumulatorRef.current = '';
                    lastOutputTranscriptRef.current = '';
                    lastModelTextRef.current = '';

                    // Stop ongoing audio for clean score delivery
                    audioSourcesRef.current.forEach(source => {
                      try { source.stop(); } catch (e) { /* ignore */ }
                    });
                    audioSourcesRef.current.clear();

                    // AUTO-MUTE: Suspend mic AND update UI state so Agnes can't be interrupted
                    if (inputAudioContextRef.current?.state === 'running') {
                      inputAudioContextRef.current.suspend().catch(() => {});
                    }
                    setIsMuted(true);
                    console.log('🔇 Microphone auto-muted for uninterrupted scoring');
                  }

                  // Show loading indicator if not already showing
                  if (!showScoreLoadingModal && !showScoreReviewModal) {
                    setShowScoreLoadingModal(true);
                  }

                  // Refresh the timeout while score chunks arrive
                  scheduleScoreTimeout();

                  // Accumulate text chunks for complete response
                  scoreAccumulatorRef.current += detectionDelta;
                  const accumulated = scoreAccumulatorRef.current;

                  // Check if we have a complete score
                  // Must have: score pattern, sufficient length, AND completion indicators
                  const hasScore = scorePatterns.some(p => p.test(accumulated));
                  const hasEnoughContent = accumulated.length > 600;

                  // Look for completion phrases that indicate the feedback is done
                  const completionPhrases = [
                    /good\s*luck/i,
                    /next\s*session/i,
                    /keep\s*(up\s*the|practicing|working|improving)/i,
                    /great\s*(job|work|effort|session)/i,
                    /well\s*done/i,
                    /congratulations/i,
                    /proud\s*of/i,
                    /final\s*(?:score|evaluation|feedback)/i,
                    /session\s*(?:complete|over|ended)/i,
                    /until\s*next\s*time/i,
                    /best\s*of\s*luck/i
                  ];
                  const hasCompletionPhrase = completionPhrases.some(p => p.test(accumulated));

                  // Complete when: has score AND (has enough content OR has completion phrase)
                  const isComplete = hasScore && (
                    hasEnoughContent ||
                    (accumulated.length > 400 && hasCompletionPhrase) ||
                    (isTurnComplete && accumulated.length > 120)
                  );

                  if (isComplete) {
                    // Hide loading modal
                    setShowScoreLoadingModal(false);

                    // Parse final score from accumulated text
                    let finalScore = null;
                    for (const pattern of scorePatterns) {
                      const match = accumulated.match(pattern);
                      if (match) {
                        finalScore = parseInt(match[1]);
                        break;
                      }
                    }

                    // Clear the score timeout since we got a valid response
                    if (scoreTimeoutRef.current) {
                      clearTimeout(scoreTimeoutRef.current);
                      scoreTimeoutRef.current = null;
                    }

                    // Show Score Review Modal with complete feedback
                    setCurrentScore(finalScore);
                    setScoreReviewText(accumulated);
                    setScoreReviewNumeric(finalScore);
                    setShowScoreReviewModal(true);
                    showScoreReviewModalRef.current = true;

                    // Clear accumulator and flags
                    scoreAccumulatorRef.current = '';
                    isRequestingScoreRef.current = false;
                    setIsRequestingScore(false);
                    setShowScoreLoadingModal(false);

                    console.log('Complete score response routed to Score Review Modal');
                  }

                  // Don't process further during score accumulation
                  return;
                }
                // For regular messages (not score requests), use custom voice if enabled
                else if (useCustomVoiceRef.current && sessionActiveRef.current && transcriptText.trim() && isTurnComplete) {
                  speakWithCustomVoice(transcriptText);
                }
              }

              // Handle Audio Output (only if session is still active, custom voice is disabled, AND NOT scoring)
              // During scoring, we want silence - the ScoreReviewModal handles TTS separately
              const audioPart = serverContent?.modelTurn?.parts?.find((part: any) => part?.inlineData?.data);
              const base64Audio = audioPart?.inlineData?.data;
              if (base64Audio && sessionActiveRef.current && !useCustomVoiceRef.current && !isRequestingScoreRef.current && !showScoreReviewModalRef.current) {
                await playAudioChunk(base64Audio);
              }
            },
            onclose: () => {
              console.log('Gemini Live Session Closed');
              setIsConnected(false);
              isConnectedRef.current = false;
              sessionPromiseRef.current = null;

              // Attempt reconnection if session was active and not intentionally closed
              if (sessionActiveRef.current && !isReconnecting) {
                console.log('Unexpected disconnect, attempting reconnection...');
                attemptReconnect();
              }
            },
            onerror: (err: any) => {
              const errorDetails = err?.message || String(err);
              console.error('Gemini Live Error:', errorDetails);

              // Specific error messages based on error type
              if (errorDetails.includes('quota') || errorDetails.includes('rate limit')) {
                setError('⚠️ API limit reached. Please wait a moment and try again.');
              } else if (errorDetails.includes('network') || errorDetails.includes('WebSocket') || errorDetails.includes('connection')) {
                // Network errors - try to reconnect
                if (!isReconnecting && connectionAttempts < MAX_RECONNECT_ATTEMPTS) {
                  attemptReconnect();
                } else {
                  setError('🌐 Connection lost. Please refresh the page.');
                }
              } else if (errorDetails.includes('auth') || errorDetails.includes('key')) {
                setError('🔑 Authentication error. Please check your API key.');
              } else {
                setError(`❌ Connection error: ${errorDetails.slice(0, 100)}`);
              }
            }
          },
          config: {
            responseModalities: [Modality.AUDIO, Modality.TEXT],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
              languageCode: 'en-US'
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: systemInstruction,
          }
        });
        
        sessionPromiseRef.current = sessionPromise;

      } catch (err: any) {
        // Only log in development
        if (import.meta.env.DEV) {
          console.error("Initialization Error", err);
        }

        // Improved error handling with specific messages
        if (err.name === 'NotAllowedError') {
          setError("🎤 Microphone/Camera access denied. Click the lock icon in your browser and enable permissions.");
        } else if (err.name === 'NotFoundError') {
          // Don't show error for missing camera - it's optional for audio-only mode
          setError("🎤 No microphone detected. Please connect a microphone to start training.");
        } else if (err.name === 'NotReadableError') {
          setError("🎥 Camera/mic is being used by another app. Close other apps and try again.");
        } else if (err.message && err.message.includes('API')) {
          setError("🌐 AI connection failed. Check your internet connection or API key.");
        } else {
          setError(`❌ Initialization failed: ${err.message || 'Unknown error'}`);
        }
      }
    };

    initSession();

    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, sessionNonce]);

  const cleanup = () => {
    // CRITICAL: Disable session FIRST to prevent new audio from playing
    sessionActiveRef.current = false;
    isConnectedRef.current = false;
    sessionPromiseRef.current = null;

    // Clear score cleanup timeout if pending
    if (scoreCleanupTimeoutRef.current) {
      clearTimeout(scoreCleanupTimeoutRef.current);
      scoreCleanupTimeoutRef.current = null;
    }

    // Stop all audio sources SECOND (before closing contexts)
    audioSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        console.warn('Error stopping audio source:', e);
      }
    });
    audioSourcesRef.current.clear();
    setActiveAudioCount(0);

    // Now safe to close audio contexts THIRD
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      inputAudioContextRef.current.close();
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      outputAudioContextRef.current.close();
    }

    // Stop media tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    // Clear frame interval
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
    }

    // Stop recording if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // NEW: Video Recording Functions
  const startRecording = () => {
    try {
      if (!streamRef.current) {
        console.error('No stream available for recording');
        return;
      }

      const mimeType = getSupportedMimeType();
      console.log(`Starting recording with MIME type: ${mimeType}`);

      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType,
        videoBitsPerSecond: 2500000 // 2.5 Mbps
      });

      recordedChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        console.log('Recording started');
        setIsRecording(true);
      };

      mediaRecorder.onstop = () => {
        console.log('Recording stopped');
        setIsRecording(false);
      };

      mediaRecorder.onerror = (event: Event) => {
        console.error('MediaRecorder error:', event);
        setIsRecording(false);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000); // Collect data every second
    } catch (error) {
      console.error('Failed to start recording:', error);
      setIsRecording(false);
    }
  };

  const stopRecording = async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        resolve(null);
        return;
      }

      // Request final data chunk before stopping
      if (mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.requestData();
        } catch (e) {
          console.warn('Failed to request final data chunk:', e);
        }
      }

      mediaRecorderRef.current.onstop = async () => {
        // Small delay to ensure all chunks are received
        await new Promise(resolve => setTimeout(resolve, 100));

        if (recordedChunksRef.current.length > 0) {
          const mimeType = getSupportedMimeType();
          const videoBlob = new Blob(recordedChunksRef.current, { type: mimeType });
          console.log(`Recording complete: ${videoBlob.size} bytes (${recordedChunksRef.current.length} chunks)`);
          resolve(videoBlob);
        } else {
          resolve(null);
        }
        setIsRecording(false);
      };

      mediaRecorderRef.current.stop();
    });
  };

  // NEW: Handle session end - opens confirmation modal
  const handleEndSession = () => {
    setShowEndSessionModal(true);
  };

  // Timeout ref for score request failsafe
  const scoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SCORE_REQUEST_TIMEOUT_MS = 90000;

  const scheduleScoreTimeout = (timeoutMs: number = SCORE_REQUEST_TIMEOUT_MS) => {
    if (scoreTimeoutRef.current) {
      clearTimeout(scoreTimeoutRef.current);
      scoreTimeoutRef.current = null;
    }

    scoreTimeoutRef.current = setTimeout(() => {
      if (isRequestingScoreRef.current && !showScoreReviewModalRef.current) {
        console.warn(`Score request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
        setIsRequestingScore(false);
        isRequestingScoreRef.current = false;
        setShowScoreLoadingModal(false);
        scoreAccumulatorRef.current = '';
        setError('⏱️ Score request timed out. The session may have disconnected. Please try ending the session.');
        setAgnesState(AgnesState.LISTENING);
        setIsMuted(false);

        // Resume microphone
        if (inputAudioContextRef.current?.state === 'suspended') {
          inputAudioContextRef.current.resume().catch(() => {});
        }
      }
    }, timeoutMs);
  };

  // NEW: Handle Score Me button - requests score from Agnes
  const handleScoreMe = async () => {
    if (!sessionPromiseRef.current || isRequestingScoreRef.current || showScoreReviewModalRef.current) return;

    // Clear any existing timeout
    if (scoreTimeoutRef.current) {
      clearTimeout(scoreTimeoutRef.current);
      scoreTimeoutRef.current = null;
    }
    scoreAccumulatorRef.current = '';
    lastOutputTranscriptRef.current = '';
    lastModelTextRef.current = '';

    // Set both state and ref for score request tracking
    setIsRequestingScore(true);
    isRequestingScoreRef.current = true;

    // Show loading modal immediately
    setShowScoreLoadingModal(true);

    // Update Agnes state to SCORING (dedicated scoring state)
    setAgnesState(AgnesState.SCORING);
    setIsMuted(true);

    // STOP ALL ONGOING AUDIO - Agnes should stop talking immediately
    audioSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) { /* ignore */ }
    });
    audioSourcesRef.current.clear();
    setActiveAudioCount(0);
    nextStartTimeRef.current = 0;
    setIsSpeakingCustom(false);
    console.log('Stopped all ongoing audio for scoring');

    // Suspend microphone input during scoring to prevent voice interference
    if (inputAudioContextRef.current?.state === 'running') {
      try {
        await inputAudioContextRef.current.suspend();
        console.log('Microphone suspended for scoring');
      } catch (e) {
        console.warn('Failed to suspend mic:', e);
      }
    }

    // Set timeout failsafe - extend while score response streams
    scheduleScoreTimeout();

    try {
      // Send a text message to Gemini asking for scoring
      const session = await sessionPromiseRef.current;

      // Add user message to transcript
      const scoreRequestMsg: TranscriptMessage = {
        role: 'user',
        text: '🎯 Score Me',
        timestamp: new Date()
      };
      setTranscript(prev => [...prev, scoreRequestMsg]);

      // Send the scoring request to Gemini - FINAL session score
      session.sendClientContent({
        turns: [{
          role: 'user',
          parts: [{
            text: `Agnes, this training session is now ENDING. Please provide my FINAL performance evaluation.

REQUIRED FORMAT:
1. Start with "AGNES SCORE: [number]" where number is 0-100
2. Provide detailed feedback on what I did well
3. Provide specific areas for improvement
4. End with encouragement for my next session

This is my FINAL score. Be thorough and complete in your evaluation.`
          }]
        }],
        turnComplete: true
      });

      console.log('Score request sent to Gemini');

    } catch (error) {
      console.error('Error requesting score:', error);
      // Reset on error
      if (scoreTimeoutRef.current) {
        clearTimeout(scoreTimeoutRef.current);
        scoreTimeoutRef.current = null;
      }
      setIsRequestingScore(false);
      isRequestingScoreRef.current = false;
      setShowScoreLoadingModal(false);
      setError('❌ Failed to request score. Please try ending the session.');
    }
    // Note: Flag is cleared when score is received in the message handler
  };

  // NEW: Handle end session with auto-score option
  const handleEndWithScore = async () => {
    setShowScoreModal(false);
    setIsRequestingScore(true);
    isRequestingScoreRef.current = true;

    try {
      if (sessionPromiseRef.current) {
        const session = await sessionPromiseRef.current;

        // Request final score before ending
        session.sendClientContent({
          turns: [{
            role: 'user',
            parts: [{ text: 'The session is ending. Please provide your final AGNES SCORE out of 100 and a summary of my performance.' }]
          }],
          turnComplete: true
        });

        // Wait for response before ending
        await new Promise(resolve => setTimeout(resolve, 8000));
      }
    } catch (error) {
      console.error('Error getting final score:', error);
    }

    // Clear the score request flag
    isRequestingScoreRef.current = false;
    setIsRequestingScore(false);

    // Now end the session
    confirmEndSession();
  };

  // NEW: Handle end without score
  const handleEndWithoutScore = () => {
    setShowScoreModal(false);
    confirmEndSession();
  };

  // NEW: Score Review Modal handler - closes modal and ALWAYS ends session
  const handleScoreReviewClose = () => {
    // Close the modal and clear state
    setShowScoreReviewModal(false);
    showScoreReviewModalRef.current = false;
    setScoreReviewText('');
    scoreAccumulatorRef.current = '';
    setShowScoreLoadingModal(false);

    // UNMUTE: Reset mic state when closing score modal
    setIsMuted(false);
    console.log('🔊 Microphone unmuted after score review');

    // ALWAYS end session when closing score modal
    // Score Me = session complete, regardless of which button is clicked
    confirmEndSession();
    console.log('Score review closed, ending session');
  };

  // NEW: Confirm and save session
  const confirmEndSession = async () => {
    setShowEndSessionModal(false);

    // Wait for score audio to complete if playing (up to 15 seconds)
    if (isPlayingScoreAudioRef.current) {
      console.log('Waiting for score audio to finish before ending session...');
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (!isPlayingScoreAudioRef.current) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        // Timeout after 15 seconds to prevent infinite wait
        setTimeout(() => {
          clearInterval(checkInterval);
          console.log('Score audio timeout - proceeding with session end');
          resolve();
        }, 15000);
      });
    }

    // CRITICAL: Disable session to prevent audio race conditions
    sessionActiveRef.current = false;

    // Stop all audio sources immediately
    audioSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Ignore errors during shutdown
      }
    });
    audioSourcesRef.current.clear();
    setActiveAudioCount(0);

    // Stop and save video recording
    const videoBlob = await stopRecording();

    // Calculate session duration
    const duration = Math.floor((new Date().getTime() - sessionStartTime.getTime()) / 1000);

    // Save session to localStorage
    const sessionData: SessionData = {
      sessionId,
      timestamp: sessionStartTime,
      difficulty: config.difficulty,
      mode: config.mode,
      script: config.script || 'No script',
      transcript: transcript.map(msg => ({
        role: msg.role,
        text: msg.text,
        timestamp: msg.timestamp,
        score: msg.score
      })),
      finalScore: currentScore || undefined,
      duration
    };

    const saved = saveSession(sessionData, user?.id);
    if (saved) {
      console.log(`Session ${sessionId} saved successfully`);
    } else {
      console.error('Failed to save session');
    }

    // Save video recording to IndexedDB
    let videoSavedSuccess = false;
    if (videoBlob) {
      console.log('Saving video recording...');
      const thumbnail = await generateThumbnail(videoBlob);
      const videoRecording = {
        sessionId,
        recordedAt: sessionStartTime,
        duration,
        size: videoBlob.size,
        mimeType: videoBlob.type,
        videoBlob,
        thumbnail,
        metadata: {
          difficulty: config.difficulty,
          mode: config.mode,
          finalScore: currentScore || undefined
        }
      };

      videoSavedSuccess = await saveVideoRecording(videoRecording, user?.id);
      if (videoSavedSuccess) {
        console.log('✅ Video recording saved successfully');
      } else {
        console.error('❌ Failed to save video recording');
      }
    }
    setVideoSaved(videoSavedSuccess);

    // Update streak
    const streakResult = updateStreak(user?.id);
    if (streakResult.newMilestone) {
      console.log(`🎉 New milestone reached: ${streakResult.newMilestone} days!`);
    }
    if (streakResult.streakBroken) {
      console.log('💔 Streak was broken, but starting fresh!');
    }

    // Calculate and award XP
    const streakData = getStreak(user?.id);
    const xpEarned = calculateSessionXP(sessionData, streakData);
    const xpResult = awardXP(xpEarned, user?.id);

    console.log('🎯 XP System:', {
      xpEarned,
      totalXP: xpResult.totalXP,
      previousLevel: xpResult.previousLevel,
      newLevel: xpResult.newLevel,
      leveledUp: xpResult.leveledUp
    });

    // Check for new achievements
    const newAchievementsUnlocked = checkAchievements(user?.id);
    const achievementNames: string[] = [];
    if (newAchievementsUnlocked.length > 0) {
      newAchievementsUnlocked.forEach(achievementId => {
        const achievement = getAchievementById(achievementId);
        if (achievement) {
          console.log(`🏆 Achievement Unlocked: ${achievement.name} - ${achievement.description}`);
          achievementNames.push(achievement.name);
        }
      });
    }
    setNewAchievements(achievementNames);

    // Trigger StreakCounter reload
    setStreakKey(prev => prev + 1);

    // Handle level-up
    if (xpResult.leveledUp) {
      setLevelUpData({
        previous: xpResult.previousLevel,
        new: xpResult.newLevel,
        unlocks: xpResult.newUnlocks
      });
      setShowLevelUpModal(true);
      playLevelUp();
    }

    // Trigger celebrations based on score
    if (currentScore !== null && currentScore !== undefined) {
      if (currentScore >= 100) {
        setShowConfetti(true);
        playPerfect();
      } else if (currentScore >= 85) {
        setShowSparkles(true);
        playSuccess();
      }
    }

    // Show success modal
    setShowSuccessModal(true);
  };

  // NEW: Discard session without saving
  const discardSession = async () => {
    setShowEndSessionModal(false);

    // CRITICAL: Disable session to prevent audio race conditions
    sessionActiveRef.current = false;

    // Stop all audio sources immediately
    audioSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Ignore errors during shutdown
      }
    });
    audioSourcesRef.current.clear();
    setActiveAudioCount(0);

    // Stop recording but don't save
    await stopRecording();

    // Clean up and return home
    onEndSession();
  };

  // NEW: Return to home after success modal
  const returnToHome = () => {
    setShowSuccessModal(false);
    // Mark mini-module as completed if applicable
    if (config.isMiniModule && config.miniModuleId && onMiniModuleComplete) {
      onMiniModuleComplete(config.miniModuleId);
    }
    onEndSession();
  };

  const startAudioInput = () => {
    if (!inputAudioContextRef.current || !streamRef.current) return;

    const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
    audioInputSourceRef.current = source;

    const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
    scriptProcessorRef.current = processor;

    processor.onaudioprocess = (e) => {
      // In PTT mode, only send audio when button is held
      if (voiceModeRef.current === 'push-to-talk' && !isPTTActiveRef.current) return;
      // In continuous mode, respect mute state (use ref to avoid closure bug)
      if (voiceModeRef.current === 'continuous' && isMutedRef.current) return;
      if (!sessionPromiseRef.current || !isConnectedRef.current || !sessionActiveRef.current) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcmBlob = createPcmBlob(inputData);

      if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => {
          session.sendRealtimeInput({ media: pcmBlob });
        });
      }
    };

    // Connect mic analyser for voice activity detection
    if (micAnalyserRef.current) {
      source.connect(micAnalyserRef.current);
    }

    source.connect(processor);
    processor.connect(inputAudioContextRef.current.destination);

    // Start voice activity detection
    startVoiceActivityDetection();
  };

  // Voice activity detection for waveform - improved with silence timeout
  const startVoiceActivityDetection = () => {
    // Higher threshold (45 instead of 15) to avoid picking up background noise
    const VOICE_THRESHOLD = 45;
    let lastSpeakingState = false;

    const checkVoiceActivity = () => {
      // CRITICAL: Keep VAD running but idle during scoring or mute to prevent false triggers
      if (!micAnalyserRef.current) {
        requestAnimationFrame(checkVoiceActivity);
        return;
      }
      if (isRequestingScoreRef.current || showScoreReviewModalRef.current || isMutedRef.current || inputAudioContextRef.current?.state !== 'running') {
        if (lastSpeakingState) {
          lastSpeakingState = false;
          setIsSpeaking(false);
        }
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
        requestAnimationFrame(checkVoiceActivity);
        return;
      }

      const dataArray = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
      micAnalyserRef.current.getByteFrequencyData(dataArray);

      // Calculate average volume
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

      const nowSpeaking = average > VOICE_THRESHOLD;

      // If just started speaking, clear any silence timeout
      if (nowSpeaking && !lastSpeakingState) {
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
        setIsSpeaking(true);
      }
      // If just stopped speaking, start silence timeout
      else if (!nowSpeaking && lastSpeakingState) {
        if (!silenceTimeoutRef.current) {
          silenceTimeoutRef.current = setTimeout(() => {
            setIsSpeaking(false);
            silenceTimeoutRef.current = null;
          }, SILENCE_TIMEOUT_MS);
        }
      }
      // Still speaking, keep state true
      else if (nowSpeaking) {
        setIsSpeaking(true);
      }

      lastSpeakingState = nowSpeaking;
      requestAnimationFrame(checkVoiceActivity);
    };

    checkVoiceActivity();
  };

  const startVideoInput = () => {
    const FPS = 1; 
    frameIntervalRef.current = window.setInterval(() => {
      if (!videoRef.current || !canvasRef.current || !isVideoEnabled) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx) return;

      canvas.width = video.videoWidth / 4;
      canvas.height = video.videoHeight / 4;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob(async (blob) => {
        if (blob && sessionPromiseRef.current) {
          const base64Data = await blobToBase64(blob);
          sessionPromiseRef.current.then(session => {
            session.sendRealtimeInput({
              media: {
                mimeType: 'image/jpeg',
                data: base64Data
              }
            });
          });
        }
      }, 'image/jpeg', 0.5);

    }, 1000 / FPS);
  };

  const playAudioChunk = async (base64Audio: string) => {
    // CRITICAL: Check session active flag FIRST (before any audio operations)
    if (!sessionActiveRef.current) {
      console.log('Session inactive, skipping audio playback');
      return;
    }

    if (!outputAudioContextRef.current) return;

    const ctx = outputAudioContextRef.current;

    // Don't create audio sources if context is closed
    if (ctx.state === 'closed') {
      console.warn('Audio context is closed, skipping audio playback');
      return;
    }

    try {
      const audioBuffer = await decodeAudioData(base64ToUint8Array(base64Audio), ctx);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // Route audio through analyser
      if (analyserRef.current) {
          source.connect(analyserRef.current);
          analyserRef.current.connect(ctx.destination);
      } else {
          source.connect(ctx.destination);
      }

      const currentTime = ctx.currentTime;
      if (nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime;
      }

      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;

      setActiveAudioCount(prev => prev + 1);

      source.onended = () => {
        setActiveAudioCount(prev => Math.max(0, prev - 1));
        audioSourcesRef.current.delete(source);
      };
      audioSourcesRef.current.add(source);
    } catch (error) {
      console.error('Error playing audio chunk:', error);
    }
  };

  // NEW: Speak text with Chatterbox TTS (Reeses Piecies voice)
  // Returns a Promise that resolves when audio finishes playing
  const speakWithCustomVoice = async (text: string): Promise<void> => {
    if (!sessionActiveRef.current) return;
    if (!ttsAvailable) {
      console.warn('Chatterbox TTS not available, falling back to no audio');
      return;
    }

    setIsSpeakingCustom(true);

    return new Promise<void>(async (resolve) => {
      try {
        // Clean up the text (remove score markers in all formats, etc.)
        const cleanText = text
          .replace(/AGNES SCORE:?\s*\d+/gi, '')
          .replace(/(?:final\s+)?score:?\s*\d+\s*(?:\/\s*100)?/gi, '')
          .replace(/\d+\s*(?:\/\s*100|\s*out\s+of\s+100|\s*points)/gi, '')
          .replace(/you(?:'ve)?\s+(?:scored|earned|got)\s+\d+/gi, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        if (!cleanText) {
          setIsSpeakingCustom(false);
          resolve();
          return;
        }

        // Generate audio with Chatterbox TTS using Reeses Piecies voice
        const audioBuffer = await generateSpeech(cleanText, {
          voice: DEFAULT_FEEDBACK_VOICE, // 'reeses_piecies'
          exaggeration: 0.4
        });

        // Play the audio
        if (outputAudioContextRef.current && sessionActiveRef.current) {
          const ctx = outputAudioContextRef.current;
          if (ctx.state === 'closed') {
            setIsSpeakingCustom(false);
            resolve();
            return;
          }

          // Resume context if suspended
          if (ctx.state === 'suspended') {
            await ctx.resume();
          }

          const audioData = await ctx.decodeAudioData(audioBuffer.slice(0));
          const source = ctx.createBufferSource();
          source.buffer = audioData;

          // Route through analyser for visualization
          if (analyserRef.current) {
            source.connect(analyserRef.current);
            analyserRef.current.connect(ctx.destination);
          } else {
            source.connect(ctx.destination);
          }

          source.start();
          audioSourcesRef.current.add(source);

          source.onended = () => {
            setIsSpeakingCustom(false);
            audioSourcesRef.current.delete(source);
            resolve(); // Resolve promise when audio finishes
          };
        } else {
          setIsSpeakingCustom(false);
          resolve();
        }
      } catch (error) {
        console.error('Error speaking with custom voice:', error);
        setIsSpeakingCustom(false);
        resolve(); // Resolve even on error to prevent hanging
      }
    });
  };

  return (
    <div className="roof-er-content-area">
      <div className="agnes-live-shell">
        {/* Header */}
        <div className="agnes-live-header">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-red-600 animate-pulse' : 'bg-neutral-600'}`}></div>
            <span className="font-mono font-bold text-white tracking-widest text-lg">AGNES 21 <span className="text-red-600">//</span> LIVE</span>
            {isRecording && (
              <div className="flex items-center space-x-2 px-3 py-1 bg-red-600/20 border border-red-600/50 rounded-full animate-pulse">
                <Circle className="w-3 h-3 text-red-500 fill-red-500" />
                <span className="text-xs font-mono font-bold text-red-500 uppercase tracking-wider">REC</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center space-x-2 px-3 py-1 rounded bg-neutral-900/80 border border-neutral-800 backdrop-blur">
              {config.mode === PitchMode.COACH && <Mic className="w-4 h-4 text-blue-500" />}
              {config.mode === PitchMode.ROLEPLAY && <Users className="w-4 h-4 text-purple-500" />}
              {config.mode === PitchMode.JUST_LISTEN && <Headphones className="w-4 h-4 text-cyan-400" />}
              <span className={`font-mono text-xs font-bold ${
                config.mode === PitchMode.COACH ? 'text-blue-500' :
                config.mode === PitchMode.ROLEPLAY ? 'text-purple-500' : 'text-cyan-400'
              }`}>
                {config.mode === PitchMode.JUST_LISTEN ? 'JUST LISTEN' : config.mode}
              </span>
            </div>

            <div className="hidden md:flex items-center space-x-2 px-3 py-1 rounded bg-neutral-900/80 border border-neutral-800 backdrop-blur">
              {config.difficulty === DifficultyLevel.BEGINNER && <Sparkles className="w-4 h-4 text-cyan-500" />}
              {config.difficulty === DifficultyLevel.ROOKIE && <Shield className="w-4 h-4 text-green-500" />}
              {config.difficulty === DifficultyLevel.PRO && <Zap className="w-4 h-4 text-yellow-500" />}
              {config.difficulty === DifficultyLevel.ELITE && <Skull className="w-4 h-4 text-red-600" />}
              {config.difficulty === DifficultyLevel.NIGHTMARE && <AlertTriangle className="w-4 h-4 text-orange-600" />}
              <span className={`font-mono text-xs font-bold ${getDifficultyColor()}`}>
                LVL: {config.difficulty}
              </span>
            </div>

            <div className="hidden md:block">
              <StreakCounter key={streakKey} showCalendar={true} />
            </div>

            <div className="hidden md:block">
              <XPBar userId={user?.id} compact={true} />
            </div>

            <button
              onClick={() => {
                const newState = toggleSounds();
                setSoundsOn(newState);
              }}
              className="p-2.5 sm:p-2 min-w-[44px] min-h-[44px] rounded-full bg-neutral-900/50 border border-neutral-800 hover:bg-neutral-800 hover:border-neutral-700 transition-all duration-300 flex items-center justify-center"
              title={soundsOn ? 'Mute celebration sounds' : 'Enable celebration sounds'}
              aria-label={soundsOn ? 'Mute celebration sounds' : 'Enable celebration sounds'}
            >
              {soundsOn ? (
                <Volume2 className="w-5 h-5 text-yellow-500" />
              ) : (
                <VolumeX className="w-5 h-5 text-neutral-500" />
              )}
            </button>

            <button
              onClick={() => {
                if (ttsAvailable) {
                  setUseCustomVoice(!useCustomVoice);
                }
              }}
              className={`p-2.5 sm:p-2 min-w-[44px] min-h-[44px] rounded-full transition-all duration-300 relative flex items-center justify-center ${
                ttsAvailable === null
                  ? 'bg-neutral-900/50 border border-neutral-800 text-neutral-600 cursor-wait'
                  : !ttsAvailable
                  ? 'bg-neutral-900/50 border border-neutral-800 text-neutral-600 cursor-not-allowed opacity-50'
                  : useCustomVoice
                  ? 'bg-purple-600/30 border border-purple-500 text-purple-400 hover:bg-purple-600/50'
                  : 'bg-neutral-900/50 border border-neutral-800 text-neutral-500 hover:bg-neutral-800 hover:border-neutral-700 hover:text-white'
              }`}
              title={
                ttsAvailable === null
                  ? 'Checking custom voice availability...'
                  : !ttsAvailable
                  ? 'Custom voice unavailable (TTS backend not running)'
                  : useCustomVoice
                  ? 'Using Reeses Piecies custom voice (click for standard Gemini voice)'
                  : 'Switch to Reeses Piecies custom voice'
              }
              aria-label={
                ttsAvailable === null
                  ? 'Checking custom voice availability'
                  : !ttsAvailable
                  ? 'Custom voice unavailable - TTS backend not running'
                  : useCustomVoice
                  ? 'Switch to standard Gemini voice'
                  : 'Switch to Reeses Piecies custom voice'
              }
              disabled={!ttsAvailable}
            >
              <Wand2 className="w-5 h-5" />
              {ttsAvailable === false && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-black"></div>
              )}
              {useCustomVoice && ttsAvailable && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full border border-black animate-pulse"></div>
              )}
            </button>

            <button
              onClick={handleEndSession}
              className="group flex items-center space-x-2 px-4 py-2 bg-red-600/20 hover:bg-red-600 border border-red-500 hover:border-red-400 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-black"
              aria-label={`End training session${isRecording ? ' and save recording' : ''}. Press Enter or click to confirm.`}
            >
              {isRecording && (
                <Circle className="w-3 h-3 text-red-500 fill-red-500 animate-pulse group-hover:animate-none group-hover:text-white group-hover:fill-white" />
              )}
              <span className="text-sm font-mono font-bold text-red-500 group-hover:text-white uppercase tracking-wider">
                End Session
              </span>
              <X className="w-4 h-4 text-red-500 group-hover:text-white" />
            </button>

            <button
              onClick={() => setShowKeyboardHints(!showKeyboardHints)}
              className="p-2.5 sm:p-2 min-w-[44px] min-h-[44px] rounded-full bg-neutral-900/50 border border-neutral-800 hover:bg-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-white transition-all duration-300 flex items-center justify-center"
              title="Show keyboard shortcuts (or press ?)"
            >
              <Keyboard className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Grid */}
        <div className="agnes-live-grid">
          {/* Script Panel */}
          <div className="agnes-panel">
            <button
              onClick={() => setIsScriptExpanded(!isScriptExpanded)}
              className="agnes-panel-header"
            >
              <div className="flex items-center space-x-2">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                <span className="text-xs font-bold tracking-widest uppercase">Script Assist</span>
              </div>
              {isScriptExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
            {isScriptExpanded && (
              <div className="agnes-panel-body agnes-script-body">
                {config.script || <span className="text-neutral-500 italic">No script selected for this session.</span>}
              </div>
            )}
          </div>

          {/* Center Stage */}
          <div className="agnes-live-center">
            <div className="agnes-live-center-grid">
              <div className="flex flex-col items-center space-y-6">
                <div className="agnes-video-frame">
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    className={`w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-500 ${!isVideoEnabled ? 'opacity-0' : 'opacity-100'}`}
                  />
                  {!isVideoEnabled && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 space-y-2">
                      <VideoOff className="w-12 h-12" />
                      <span className="text-xs tracking-widest uppercase">Camera Off</span>
                    </div>
                  )}
                  <div className="absolute bottom-4 left-4 px-3 py-1 bg-black/60 backdrop-blur-md rounded text-xs font-medium text-white/80 border border-white/10 flex items-center space-x-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                    <span>YOUR FEED</span>
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                </div>
                <Waveform isActive={isSpeaking} color="bg-white" label="YOUR VOICE" />
              </div>

              <div className="flex flex-col items-center justify-center space-y-6">
                <AgnesAvatar
                  isActive={aiSpeaking}
                  isListening={!aiSpeaking && isConnected}
                  analyser={analyserRef.current}
                />
                <AgnesStateIndicator state={agnesState} />
              </div>
            </div>

            <div className="agnes-live-meter">
              <MicLevelMeter analyser={micAnalyserRef.current} isActive={!isMuted && isConnected} />
            </div>
          </div>

          {/* Transcript Panel */}
          <div className="agnes-panel">
            <button
              onClick={() => setIsTranscriptExpanded(!isTranscriptExpanded)}
              className="agnes-panel-header"
            >
              <div className="flex items-center space-x-2">
                <MessageSquare className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-bold tracking-widest uppercase">Transcript</span>
                {transcript.length > 0 && (
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">{transcript.length}</span>
                )}
              </div>
              {isTranscriptExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
            {isTranscriptExpanded && (
              <div className="agnes-panel-body">
                {transcript.length === 0 ? (
                  <div className="text-neutral-500 italic text-sm text-center mt-4">
                    Conversation will appear here...
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transcript.map((msg, idx) => (
                      <div key={idx} className={`p-3 rounded-lg ${msg.role === 'agnes' ? 'bg-red-900/20 border border-red-800/30' : 'bg-neutral-800/50 border border-neutral-700'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-bold tracking-wider ${msg.role === 'agnes' ? 'text-red-400' : 'text-white'}`}>
                            {msg.role === 'agnes' ? 'AGNES 21' : 'YOU'}
                          </span>
                          <span className="text-xs text-neutral-500">
                            {msg.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-sm text-neutral-300 whitespace-pre-wrap">
                          {msg.text}
                        </div>
                        {msg.score !== undefined && (
                          <div className={`mt-2 px-2 py-1 rounded text-xs font-bold inline-block ${
                            msg.score >= 80 ? 'bg-green-500/20 text-green-400' :
                            msg.score >= 60 ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            SCORE: {msg.score}/100
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Controls */}
        <div className="agnes-live-controls">
          {/* Voice Mode Toggle */}
          <div className="flex items-center bg-neutral-900/80 rounded-lg p-1 border border-neutral-700">
            <button
              onClick={() => { setVoiceMode('continuous'); setIsMuted(false); }}
              className={`px-3 py-2.5 sm:py-1.5 rounded text-xs font-medium transition-all flex items-center space-x-1 min-h-[44px] sm:min-h-0 ${
                voiceMode === 'continuous'
                  ? 'bg-emerald-600 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Continuous listening mode"
            >
              <Mic className="w-3 h-3" />
              <span>Auto</span>
            </button>
            <button
              onClick={() => { setVoiceMode('push-to-talk'); setIsMuted(true); }}
              className={`px-3 py-2.5 sm:py-1.5 rounded text-xs font-medium transition-all flex items-center space-x-1 min-h-[44px] sm:min-h-0 ${
                voiceMode === 'push-to-talk'
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Push-to-Talk mode (hold SPACE or button)"
            >
              <Hand className="w-3 h-3" />
              <span>PTT</span>
            </button>
          </div>

          {/* Mic Button (Continuous mode) or PTT Button (PTT mode) */}
          {voiceMode === 'continuous' ? (
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`p-5 rounded-full transition-all duration-300 ${isMuted ? 'bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.4)]' : 'bg-neutral-900 text-neutral-400 border border-neutral-800 hover:bg-neutral-800 hover:border-neutral-700 hover:text-white'}`}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>
          ) : (
            <button
              onMouseDown={handlePTTStart}
              onMouseUp={handlePTTEnd}
              onMouseLeave={handlePTTEnd}
              onTouchStart={handlePTTStart}
              onTouchEnd={handlePTTEnd}
              onTouchCancel={handlePTTEnd}
              className={`p-5 rounded-full transition-all duration-150 flex flex-col items-center ${
                isPTTActive
                  ? 'bg-emerald-500 text-white scale-110 shadow-[0_0_30px_rgba(16,185,129,0.5)]'
                  : 'bg-neutral-800 text-neutral-400 border-2 border-dashed border-neutral-600 hover:border-emerald-500'
              }`}
              title="Hold to talk"
            >
              <Mic className={`w-6 h-6 ${isPTTActive ? 'animate-pulse' : ''}`} />
            </button>
          )}

          <button
            onClick={() => setIsVideoEnabled(!isVideoEnabled)}
            className={`p-5 rounded-full transition-all duration-300 ${!isVideoEnabled ? 'bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.4)]' : 'bg-neutral-900 text-neutral-400 border border-neutral-800 hover:bg-neutral-800 hover:border-neutral-700 hover:text-white'}`}
          >
            {isVideoEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
          </button>

          {/* Score Me Button */}
          <div className="ml-8 border-l border-neutral-800 pl-8 flex items-center space-x-4">
             <button
               onClick={handleScoreMe}
               disabled={isRequestingScore || !isConnected}
               className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-300 ${
                 isRequestingScore
                   ? 'bg-yellow-600/50 text-yellow-300 cursor-wait'
                   : 'bg-yellow-600 hover:bg-yellow-500 text-white shadow-[0_0_20px_rgba(234,179,8,0.3)] hover:shadow-[0_0_30px_rgba(234,179,8,0.5)]'
               } disabled:opacity-50 disabled:cursor-not-allowed`}
               title="Get your score from Agnes"
             >
               <Trophy className="w-5 h-5" />
               <span className="text-xs font-bold tracking-widest uppercase">
                 {isRequestingScore ? 'Scoring...' : 'Score Me'}
               </span>
             </button>

             {/* Current Score Display */}
             {currentScore !== null && (
               <div className={`px-3 py-2 rounded-lg text-sm font-bold ${
                 currentScore >= 80 ? 'bg-green-600/20 text-green-400 border border-green-600/50' :
                 currentScore >= 60 ? 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/50' :
                 'bg-red-600/20 text-red-400 border border-red-600/50'
               }`}>
                 Score: {currentScore}/100
               </div>
             )}

             {/* ARIA Live Region for Score Updates */}
             <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
               {currentScore !== null && `Agnes scored your performance: ${currentScore} out of 100`}
             </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-red-600/90 backdrop-blur text-white px-6 py-3 rounded-lg shadow-xl font-medium border border-red-500 flex items-center space-x-2 animate-bounce z-50">
          <X className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* PTT Status Indicator */}
      {voiceMode === 'push-to-talk' && (
        <div className={`fixed bottom-28 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm font-medium transition-all z-30 ${
          isPTTActive
            ? 'bg-emerald-500/90 text-white shadow-lg shadow-emerald-500/30'
            : 'bg-neutral-800/90 text-neutral-400 border border-neutral-700'
        }`}>
          {isPTTActive ? (
            <span className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span>Recording...</span>
            </span>
          ) : (
            <span>Hold SPACE or button to talk</span>
          )}
        </div>
      )}

      {/* Scoring Overlay - Removed: Now using showScoreLoadingModal instead */}

      {/* Keyboard Shortcuts Panel */}
      {showKeyboardHints && (
        <div className="absolute top-20 sm:top-24 right-2 sm:right-4 md:right-8 bg-neutral-900/95 backdrop-blur-xl border border-neutral-800 rounded-xl p-4 sm:p-6 shadow-2xl z-50 max-w-[calc(100vw-1rem)] sm:max-w-xs md:max-w-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-bold tracking-wider text-sm flex items-center space-x-2">
              <Keyboard className="w-4 h-4 text-blue-400" />
              <span>KEYBOARD SHORTCUTS</span>
            </h3>
            <button
              onClick={() => setShowKeyboardHints(false)}
              className="text-neutral-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between py-2 border-b border-neutral-800">
              <span className="text-neutral-400">Toggle Mute</span>
              <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white font-mono text-xs">M</kbd>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-neutral-800">
              <span className="text-neutral-400">Toggle Video</span>
              <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white font-mono text-xs">V</kbd>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-neutral-800">
              <span className="text-neutral-400">Toggle Script</span>
              <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white font-mono text-xs">S</kbd>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-neutral-800">
              <span className="text-neutral-400">Toggle Transcript</span>
              <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white font-mono text-xs">T</kbd>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-neutral-800">
              <span className="text-neutral-400">
                Toggle Custom Voice
                {!ttsAvailable && <span className="text-red-400 text-xs ml-1">(disabled)</span>}
              </span>
              <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white font-mono text-xs">C</kbd>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-neutral-800">
              <span className="text-neutral-400">Toggle PTT Mode</span>
              <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white font-mono text-xs">P</kbd>
            </div>
            {voiceMode === 'push-to-talk' && (
              <div className="flex items-center justify-between py-2 border-b border-neutral-800 bg-blue-600/10 -mx-2 px-2 rounded">
                <span className="text-blue-400">Hold to Talk (PTT)</span>
                <kbd className="px-2 py-1 bg-blue-800 border border-blue-600 rounded text-white font-mono text-xs">SPACE</kbd>
              </div>
            )}
            <div className="flex items-center justify-between py-2 border-b border-neutral-800">
              <span className="text-neutral-400">End Session</span>
              <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white font-mono text-xs">ESC</kbd>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-neutral-400">Show/Hide Shortcuts</span>
              <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white font-mono text-xs">?</kbd>
            </div>
          </div>
        </div>
      )}

      {/* End Session Confirmation Modal */}
      {showEndSessionModal && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="end-session-title"
          aria-describedby="end-session-description"
        >
          <div
            className="bg-neutral-900 rounded-xl border border-neutral-800 max-w-[calc(100vw-2rem)] sm:max-w-lg w-full p-4 sm:p-6 space-y-4 sm:space-y-6"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowEndSessionModal(false);
              }
            }}
          >
            {/* Header */}
            <div className="text-center">
              <h2 id="end-session-title" className="text-2xl font-bold text-white mb-2">End Training Session?</h2>
              <p id="end-session-description" className="text-neutral-400 text-sm">
                Your session will be saved with {transcript.length} messages
              </p>
            </div>

            {/* Session Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-neutral-800/50 rounded-lg p-4 border border-neutral-700">
                <div className="text-neutral-400 text-xs mb-1">Duration</div>
                <div className="text-white font-bold">
                  {Math.floor((Date.now() - sessionStartTime.getTime()) / 60000)}m
                </div>
              </div>
              <div className="bg-neutral-800/50 rounded-lg p-4 border border-neutral-700">
                <div className="text-neutral-400 text-xs mb-1">Current Score</div>
                <div className={`font-bold ${
                  currentScore && currentScore >= 80 ? 'text-green-400' :
                  currentScore && currentScore >= 60 ? 'text-yellow-400' :
                  'text-red-400'
                }`}>
                  {currentScore || 'N/A'}
                </div>
              </div>
            </div>

            {/* Recording Status */}
            {isRecording && (
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Video className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-semibold text-purple-400">Video Recording Active</span>
                </div>
                <p className="text-xs text-neutral-400">
                  Your session recording will be saved and available for playback in Session History
                </p>
              </div>
            )}

            {/* Auto-Score Option */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Trophy className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-semibold text-yellow-400">Get Final Score?</span>
              </div>
              <p className="text-xs text-neutral-400">
                Have Agnes provide a final performance score and feedback before ending the session.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleEndWithScore}
                disabled={isRequestingScore}
                className={`w-full px-4 py-3 rounded-lg transition-colors font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-900 ${
                  isRequestingScore
                    ? 'bg-yellow-600/50 text-yellow-200 cursor-wait'
                    : 'bg-yellow-600 hover:bg-yellow-500 text-white focus:ring-yellow-500'
                }`}
                aria-label="Get final score from Agnes then end session"
                autoFocus
              >
                <div className="flex items-center justify-center space-x-2">
                  <Trophy className="w-5 h-5" />
                  <span>{isRequestingScore ? 'Getting Score...' : 'Score & End Session'}</span>
                </div>
              </button>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowEndSessionModal(false)}
                  className="flex-1 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
                  aria-label="Cancel and return to training session"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmEndSession}
                  className="flex-1 px-4 py-3 bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
                  aria-label="End session without scoring"
                >
                  End Without Scoring
                </button>
              </div>
            </div>

            {/* Optional: Discard Button */}
            <button
              onClick={discardSession}
              className="w-full text-xs text-neutral-500 hover:text-red-400 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-neutral-900 rounded"
              aria-label="Discard session without saving"
            >
              Discard session without saving
            </button>
          </div>
        </div>
      )}

      {/* Post-Session Success Modal */}
      {showSuccessModal && (
        <div
          className="fixed inset-0 bg-black/95 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="success-title"
          aria-describedby="success-description"
        >
          <div
            className="bg-neutral-900 rounded-xl border border-green-500/30 max-w-[calc(100vw-2rem)] sm:max-w-md w-full p-4 sm:p-8 space-y-4 sm:space-y-6 text-center"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                returnToHome();
              }
            }}
          >
            {/* Success Icon */}
            <div className="w-20 h-20 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
              <Trophy className="w-10 h-10 text-green-400" />
            </div>

            {/* Title */}
            <div>
              <h2 id="success-title" className="text-2xl font-bold text-white mb-2">Session Saved!</h2>
              <p id="success-description" className="text-lg text-green-400 font-bold">
                {currentScore !== undefined ? `Final Score: ${currentScore}/100` : 'Training session completed successfully'}
              </p>
            </div>

            {/* Stats */}
            <div className="space-y-3 text-left">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-400">Session Duration:</span>
                <span className="text-white font-semibold">
                  {Math.floor((Date.now() - sessionStartTime.getTime()) / 60000)}m
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-400">Messages:</span>
                <span className="text-white font-semibold">{transcript.length}</span>
              </div>
              {videoSaved && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-400">Video Recording:</span>
                  <span className="text-green-400 font-semibold flex items-center gap-1">
                    <Video className="w-3 h-3" /> Saved
                  </span>
                </div>
              )}
            </div>

            {/* Achievements/Streak Updates */}
            {newAchievements.length > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <p className="text-yellow-400 font-semibold mb-2">🏆 New Achievements!</p>
                {newAchievements.map((achievement, idx) => (
                  <p key={idx} className="text-sm text-neutral-300">{achievement}</p>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={returnToHome}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-semibold focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
                aria-label="Close and return to home screen"
                autoFocus
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Level Up Modal */}
      <LevelUpModal
        show={showLevelUpModal}
        previousLevel={levelUpData.previous}
        newLevel={levelUpData.new}
        unlocksAtThisLevel={levelUpData.unlocks}
        onClose={() => setShowLevelUpModal(false)}
        userId={user?.id}
      />

      {/* Score Loading Modal - Shows while accumulating score response */}
      {showScoreLoadingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-sm">
          <div className="bg-neutral-900 rounded-2xl border-2 border-yellow-500/50 p-8 max-w-md w-full text-center">
            {/* Animated Agnes Icon */}
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 rounded-full bg-yellow-500/20 animate-ping" />
              <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-yellow-600 to-red-600 flex items-center justify-center">
                <span className="text-2xl font-black text-white">A</span>
              </div>
            </div>

            <h3 className="text-xl font-bold text-white mb-2">Agnes is analyzing your performance...</h3>
            <p className="text-neutral-400 mb-6">Preparing your detailed evaluation</p>

            {/* Progress Bar */}
            <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-400 rounded-full animate-progress-fill"
                style={{
                  animation: 'progressFill 8s ease-out forwards',
                }}
              />
            </div>
            <p className="text-xs text-neutral-500 mt-2">This may take a few seconds...</p>

            {/* CSS for progress animation */}
            <style>{`
              @keyframes progressFill {
                0% { width: 5%; }
                20% { width: 25%; }
                40% { width: 45%; }
                60% { width: 65%; }
                80% { width: 85%; }
                100% { width: 95%; }
              }
            `}</style>
          </div>
        </div>
      )}

      {/* Score Review Modal - Dedicated UI for uninterrupted score delivery */}
      <ScoreReviewModal
        show={showScoreReviewModal}
        scoreText={scoreReviewText}
        numericScore={scoreReviewNumeric}
        onClose={handleScoreReviewClose}
      />

      {/* Celebration Animations */}
      <Confetti
        show={showConfetti}
        onComplete={() => setShowConfetti(false)}
      />
      <SparklesComponent
        show={showSparkles}
        intensity={currentScore && currentScore >= 95 ? 'high' : 'medium'}
      />
    </div>
  );
};

export default PitchTrainer;
