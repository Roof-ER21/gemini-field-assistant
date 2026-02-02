import React, { useEffect, useState, useRef } from 'react';
import { Trophy, VolumeX, Volume2 } from 'lucide-react';
import { agnesVoiceSpeak, agnesVoiceStop } from '../utils/geminiTTS';
import '../agnes.css';

interface ScoreReviewModalProps {
  show: boolean;
  scoreText: string;
  numericScore: number | null;
  onClose: () => void;  // Single action - always ends session
}

const ScoreReviewModal: React.FC<ScoreReviewModalProps> = ({
  show,
  scoreText,
  numericScore,
  onClose
}) => {
  // Typewriter state
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);

  // TTS state
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [ttsStatus, setTtsStatus] = useState<'idle' | 'speaking' | 'complete' | 'unavailable'>('idle');
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const localAudioContextRef = useRef<AudioContext | null>(null);
  // REMOVED: speechSynthRef - no longer using Web Speech API

  // Get score color based on value
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-600/30 text-green-400 border-green-500/50';
    if (score >= 60) return 'bg-yellow-600/30 text-yellow-400 border-yellow-500/50';
    return 'bg-red-600/30 text-red-400 border-red-500/50';
  };

  // Clean text for TTS - remove score patterns and excess whitespace
  const cleanTextForTTS = (text: string): string => {
    return text
      .replace(/AGNES SCORE:?\s*\d+/gi, '')
      .replace(/(?:final\s+)?score:?\s*\d+\s*(?:\/\s*100)?/gi, '')
      .replace(/\*\*/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  // Typewriter effect
  useEffect(() => {
    if (!show || !scoreText) {
      setDisplayedText('');
      setIsTyping(false);
      return;
    }

    let index = 0;
    setDisplayedText('');
    setIsTyping(true);

    const interval = setInterval(() => {
      if (index < scoreText.length) {
        setDisplayedText(prev => prev + scoreText.charAt(index));
        index++;
      } else {
        clearInterval(interval);
        setIsTyping(false);
      }
    }, 15); // 15ms per character for smooth typewriter

    return () => clearInterval(interval);
  }, [show, scoreText]);

  // TTS playback when modal shows - Gemini TTS (Kore voice) ONLY - no Web Speech fallback
  useEffect(() => {
    if (!show || !scoreText) return;

    const playScoreAudio = async () => {
      const cleanText = cleanTextForTTS(scoreText);
      if (!cleanText) {
        setTtsStatus('unavailable');
        return;
      }

      setIsSpeaking(true);
      setTtsStatus('speaking');
      setTtsError(null);

      // Use Agnes Voice (Gemini Kore) - force fresh English session to prevent language mixing
      await agnesVoiceSpeak(cleanText, 'en', {
        forceNewSession: true, // CRITICAL: Prevents wrong language from cached sessions
        onEnd: () => {
          setIsSpeaking(false);
          setTtsStatus('complete');
          console.log('Score read with Agnes voice (Gemini Kore - English)');
        },
        onError: (error) => {
          console.error('Agnes voice error:', error);
          setIsSpeaking(false);
          setTtsStatus('unavailable');
          setTtsError('Voice not available - read text above');
        }
      });
    };

    // Small delay to let modal animation complete
    const timer = setTimeout(playScoreAudio, 300);
    return () => clearTimeout(timer);
  }, [show, scoreText]);

  // Cleanup on unmount or hide
  useEffect(() => {
    if (!show) {
      handleStopSpeaking();
      // Close local audio context if we created one
      if (localAudioContextRef.current) {
        localAudioContextRef.current.close().catch(() => {});
        localAudioContextRef.current = null;
      }
      // Reset status
      setTtsStatus('idle');
    }
  }, [show]);

  const handleStopSpeaking = () => {
    // Stop Agnes Voice (Gemini TTS)
    agnesVoiceStop();

    // Stop AudioBufferSourceNode (legacy)
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {
        // Already stopped
      }
      audioSourceRef.current = null;
    }
    // REMOVED: Web Speech API stop - no longer using Web Speech
    setIsSpeaking(false);
    if (ttsStatus === 'speaking') {
      setTtsStatus('complete');
    }
  };

  const handleClose = () => {
    handleStopSpeaking();
    onClose();
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn"
      style={{ backgroundColor: '#000000', top: 0, left: 0, right: 0, bottom: 0, position: 'fixed' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="score-review-title"
    >
      {/* Modal Container */}
      <div className="relative bg-neutral-900 rounded-2xl border-2 border-yellow-500/50 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-scaleIn">

        {/* Glow Effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 via-transparent to-red-500/5 pointer-events-none" />

        {/* Header with Score Badge */}
        <div className="relative p-6 border-b border-yellow-500/20 bg-gradient-to-r from-yellow-900/20 to-neutral-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Trophy className="w-8 h-8 text-yellow-400" />
                <div className="absolute inset-0 animate-ping opacity-30">
                  <Trophy className="w-8 h-8 text-yellow-400" />
                </div>
              </div>
              <h2 id="score-review-title" className="text-2xl font-bold text-white">
                Your Score
              </h2>
            </div>
            {numericScore !== null && (
              <div className={`px-5 py-2 rounded-xl text-3xl font-black border-2 ${getScoreColor(numericScore)}`}>
                {numericScore}/100
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Feedback Area with Typewriter */}
        <div className="p-6 max-h-[50vh] overflow-y-auto">
          <div className="text-neutral-200 text-base leading-relaxed whitespace-pre-wrap font-medium">
            {displayedText}
            {isTyping && (
              <span className="inline-block w-2 h-5 bg-yellow-400 ml-1 animate-pulse" />
            )}
          </div>
          {!displayedText && !isTyping && (
            <div className="text-neutral-500 italic">Generating feedback...</div>
          )}
        </div>

        {/* Agnes Speaking Indicator */}
        <div className={`px-6 py-3 border-t border-yellow-500/20 transition-all duration-300 ${
          isSpeaking ? 'bg-yellow-500/10' : 'bg-neutral-800/50'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isSpeaking ? (
                <>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                    <div className="w-2 h-3 bg-yellow-400 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-4 bg-yellow-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                    <div className="w-2 h-3 bg-yellow-400 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                  </div>
                  <span className="text-yellow-400 text-sm font-medium ml-2">Agnes is speaking...</span>
                </>
              ) : ttsError ? (
                <>
                  <VolumeX className="w-4 h-4 text-red-400" />
                  <span className="text-red-400 text-sm">{ttsError}</span>
                </>
              ) : ttsStatus === 'complete' ? (
                <>
                  <Volume2 className="w-4 h-4 text-green-500" />
                  <span className="text-green-500 text-sm">Audio complete</span>
                </>
              ) : ttsStatus === 'unavailable' ? (
                <>
                  <VolumeX className="w-4 h-4 text-neutral-500" />
                  <span className="text-neutral-500 text-sm">Voice unavailable - read above</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 text-neutral-500" />
                  <span className="text-neutral-500 text-sm">Preparing audio...</span>
                </>
              )}
            </div>

            {isSpeaking && (
              <button
                onClick={handleStopSpeaking}
                className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 rounded-lg transition-colors"
              >
                <VolumeX className="w-4 h-4 text-neutral-400" />
                <span className="text-sm text-neutral-300">Stop Speaking</span>
              </button>
            )}
          </div>
        </div>

        {/* Action Button - Session Complete */}
        <div className="p-6 border-t border-neutral-800" style={{ backgroundColor: 'rgba(23, 23, 23, 0.5)' }}>
          <button
            onClick={handleClose}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all"
            style={{
              background: 'linear-gradient(to right, #ca8a04, #eab308)',
              color: '#ffffff',
              boxShadow: '0 10px 15px -3px rgba(234, 179, 8, 0.2)'
            }}
          >
            <Trophy className="w-5 h-5" />
            Session Complete
          </button>
          <p className="text-center text-sm mt-3" style={{ color: '#737373' }}>
            Your score has been saved. Great training session!
          </p>
        </div>
      </div>
    </div>
  );
};

export default ScoreReviewModal;
