import React, { useState, useEffect, useRef } from 'react';
import { env } from '../src/config/env';
import { Mic, Radio, Trash2, Volume2, VolumeX, Wifi, WifiOff, PhoneOff, MessageCircle } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isAudio?: boolean;
}

interface ConnectionStatus {
  connected: boolean;
  state: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
  error?: string;
}

const LivePanel: React.FC = () => {
  // Connection & Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false,
    state: 'idle'
  });

  // Conversation State
  const [messages, setMessages] = useState<Message[]>([]);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isAIResponding, setIsAIResponding] = useState(false);

  // Audio State
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (speechSynthesisRef.current) {
        speechSynthesis.cancel();
      }
    };
  }, []);

  /**
   * Initialize audio context and analyzer for visual feedback
   */
  const initAudioContext = async (stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      const analyzer = audioContext.createAnalyser();
      analyzer.fftSize = 256;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyzer);

      audioContextRef.current = audioContext;
      analyzerRef.current = analyzer;

      // Start monitoring audio levels
      monitorAudioLevel();
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
    }
  };

  /**
   * Monitor audio level for visual feedback
   */
  const monitorAudioLevel = () => {
    if (!analyzerRef.current) return;

    const bufferLength = analyzerRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateLevel = () => {
      if (!analyzerRef.current || !isRecording) return;

      analyzerRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      setAudioLevel(average / 255); // Normalize to 0-1

      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();
  };

  /**
   * Start live conversation
   */
  const startLiveConversation = async () => {
    try {
      setConnectionStatus({ connected: false, state: 'connecting' });

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        }
      });

      // Initialize audio visualization
      await initAudioContext(stream);

      // Setup MediaRecorder
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4'
      ];

      const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

      if (!supportedMimeType) {
        throw new Error('No supported audio format found');
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: supportedMimeType
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: supportedMimeType });
        await processAudioInput(audioBlob);
        audioChunksRef.current = [];
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();

      setIsRecording(true);
      setConnectionStatus({ connected: true, state: 'connected' });

      // Haptic feedback (iOS Safari)
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }

      // Add welcome message
      addMessage('assistant', 'Live mode activated. I\'m listening and ready to assist you during your customer conversation.');

    } catch (error) {
      console.error('Failed to start live conversation:', error);
      setConnectionStatus({
        connected: false,
        state: 'error',
        error: (error as Error).message
      });
      alert('Failed to access microphone. Please grant permission and try again.');
    }
  };

  /**
   * Stop live conversation
   */
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (speechSynthesisRef.current) {
      speechSynthesis.cancel();
    }

    setIsRecording(false);
    setAudioLevel(0);
    setConnectionStatus({ connected: false, state: 'disconnected' });
    setLiveTranscript('');
  };

  /**
   * Process audio input and get AI response
   */
  const processAudioInput = async (audioBlob: Blob) => {
    try {
      setIsAIResponding(true);
      setLiveTranscript('Processing audio...');

      // Convert to base64
      const base64Audio = await blobToBase64(audioBlob);

      // Dynamic import Gemini
      const { GoogleGenerativeAI } = await import('@google/genai');
      const apiKey = env.GEMINI_API_KEY || (process.env.GEMINI_API_KEY as string);

      if (!apiKey) {
        throw new Error('Gemini API key not configured. Set GEMINI_API_KEY in .env/.env.local or Railway variables.');
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp'
      });

      const conversationContext = messages.slice(-5).map(m =>
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
      ).join('\n');

      const prompt = `You are a real-time AI assistant helping a roofing sales representative during a customer conversation.

CONTEXT OF RECENT CONVERSATION:
${conversationContext || 'This is the start of the conversation.'}

INSTRUCTIONS:
- Transcribe the audio accurately
- Provide helpful, concise suggestions or answers
- Focus on roofing sales, objection handling, and customer service
- Keep responses brief (2-3 sentences max) for real-time use
- Be supportive and practical

Respond in JSON format:
{
  "transcription": "What the user said",
  "response": "Your helpful response"
}`;

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: audioBlob.type,
            data: base64Audio.split(',')[1],
          },
        },
      ]);

      const response = await result.response;
      const text = response.text();

      // Parse JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse AI response');
      }

      const data = JSON.parse(jsonMatch[0]);

      // Add user message
      const userMessage = addMessage('user', data.transcription, true);
      setLiveTranscript('');

      // Add AI response
      const aiMessage = addMessage('assistant', data.response);

      // Speak the response if not muted
      if (!isMuted) {
        speakText(data.response);
      }

    } catch (error) {
      console.error('Failed to process audio:', error);
      setLiveTranscript('');
      addMessage('assistant', 'Sorry, I had trouble processing that. Could you try again?');
    } finally {
      setIsAIResponding(false);
    }
  };

  /**
   * Text-to-speech for AI responses
   */
  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel(); // Cancel any ongoing speech

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.1;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      speechSynthesisRef.current = utterance;
      speechSynthesis.speak(utterance);
    }
  };

  /**
   * Add message to conversation
   */
  const addMessage = (role: 'user' | 'assistant', content: string, isAudio: boolean = false): Message => {
    const message: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: new Date(),
      isAudio
    };

    setMessages(prev => [...prev, message]);
    return message;
  };

  /**
   * Convert blob to base64
   */
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  /**
   * Clear conversation history
   */
  const clearConversation = () => {
    if (confirm('Clear the entire conversation?')) {
      setMessages([]);
      if ('vibrate' in navigator) {
        navigator.vibrate(30);
      }
    }
  };

  /**
   * Toggle mute
   */
  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (!isMuted) {
      speechSynthesis.cancel();
    }
    if ('vibrate' in navigator) {
      navigator.vibrate(30);
    }
  };

  return (
    <div className="roof-er-content-area" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header with Status */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '2px solid var(--border-color)',
        background: 'var(--bg-elevated)',
        flexShrink: 0
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Radio className="w-6 h-6" style={{ color: 'var(--roof-red)' }} />
            <div>
              <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Live Mode
              </div>
              <div style={{
                fontSize: '12px',
                color: connectionStatus.connected ? '#10b981' : 'var(--text-tertiary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '2px'
              }}>
                {connectionStatus.connected ? (
                  <>
                    <Wifi className="w-3 h-3" />
                    Connected
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3" />
                    Offline
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Control Buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {isRecording && (
              <button
                onClick={toggleMute}
                style={{
                  padding: '10px',
                  background: isMuted ? '#f59e0b' : 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title={isMuted ? 'Unmute AI voice' : 'Mute AI voice'}
              >
                {isMuted ? (
                  <VolumeX className="w-5 h-5" style={{ color: '#f59e0b' }} />
                ) : (
                  <Volume2 className="w-5 h-5" style={{ color: 'var(--text-primary)' }} />
                )}
              </button>
            )}

            {messages.length > 0 && (
              <button
                onClick={clearConversation}
                style={{
                  padding: '10px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Clear conversation"
              >
                <Trash2 className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Conversation Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px',
        background: 'var(--bg-primary)'
      }}>
        {messages.length === 0 && !isRecording ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            maxWidth: '500px',
            margin: '0 auto'
          }}>
            <Radio className="w-20 h-20 mx-auto mb-6" style={{ color: 'var(--roof-red)', opacity: 0.3 }} />
            <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Real-Time Voice Assistant
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '24px' }}>
              Start a live conversation to get instant AI assistance during customer meetings.
              Perfect for handling objections, answering technical questions, and closing deals.
            </div>
            <div style={{
              display: 'grid',
              gap: '12px',
              textAlign: 'left',
              padding: '20px',
              background: 'var(--bg-elevated)',
              borderRadius: '12px',
              border: '2px solid var(--border-color)'
            }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Features:
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '20px' }}>
                ✓ Real-time voice transcription<br/>
                ✓ Instant AI suggestions & answers<br/>
                ✓ Voice responses from AI<br/>
                ✓ Conversation history tracking<br/>
                ✓ Works on iPhone & iPad
              </div>
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            {messages.map((message) => (
              <div
                key={message.id}
                style={{
                  display: 'flex',
                  justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: '16px'
                }}
              >
                <div style={{
                  maxWidth: '75%',
                  padding: '12px 16px',
                  borderRadius: '16px',
                  background: message.role === 'user' ? 'var(--roof-red)' : 'var(--bg-elevated)',
                  color: message.role === 'user' ? 'white' : 'var(--text-primary)',
                  border: message.role === 'assistant' ? '2px solid var(--border-color)' : 'none'
                }}>
                  <div style={{
                    fontSize: '14px',
                    lineHeight: '1.5',
                    wordBreak: 'break-word'
                  }}>
                    {message.content}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    marginTop: '6px',
                    opacity: 0.7,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    {message.isAudio && <Mic className="w-3 h-3" />}
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}

            {/* Live Transcript */}
            {liveTranscript && (
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: '16px'
              }}>
                <div style={{
                  maxWidth: '75%',
                  padding: '12px 16px',
                  borderRadius: '16px',
                  background: 'var(--roof-red)',
                  color: 'white',
                  opacity: 0.7,
                  fontSize: '14px',
                  fontStyle: 'italic'
                }}>
                  {liveTranscript}
                </div>
              </div>
            )}

            {/* AI Thinking Indicator */}
            {isAIResponding && (
              <div style={{
                display: 'flex',
                justifyContent: 'flex-start',
                marginBottom: '16px'
              }}>
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '16px',
                  background: 'var(--bg-elevated)',
                  border: '2px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--roof-red)',
                    animation: 'pulse 1.5s ease-in-out infinite'
                  }} />
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    AI is thinking...
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Press to Talk Button */}
      <div style={{
        padding: '20px',
        borderTop: '2px solid var(--border-color)',
        background: 'var(--bg-elevated)',
        flexShrink: 0
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px'
        }}>
          {/* Main Action Button */}
          <button
            onClick={isRecording ? stopRecording : startLiveConversation}
            onTouchStart={(e) => {
              // Haptic feedback on iOS
              if ('vibrate' in navigator) {
                navigator.vibrate(50);
              }
            }}
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: isRecording ? '#dc2626' : 'var(--roof-red)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isRecording
                ? `0 0 0 ${8 + audioLevel * 20}px rgba(220, 38, 38, ${0.3 * (1 - audioLevel)})`
                : '0 4px 12px rgba(239, 68, 68, 0.3)',
              transition: 'all 0.3s ease',
              position: 'relative',
              animation: isRecording ? 'pulse 2s ease-in-out infinite' : 'none'
            }}
          >
            {isRecording ? (
              <PhoneOff className="w-10 h-10" style={{ color: 'white' }} />
            ) : (
              <Mic className="w-10 h-10" style={{ color: 'white' }} />
            )}

            {/* Audio level ring */}
            {isRecording && audioLevel > 0.1 && (
              <div style={{
                position: 'absolute',
                inset: '-4px',
                borderRadius: '50%',
                border: '3px solid var(--roof-red)',
                opacity: audioLevel,
                transform: `scale(${1 + audioLevel * 0.2})`,
                transition: 'all 0.1s ease'
              }} />
            )}
          </button>

          {/* Status Text */}
          <div style={{
            fontSize: '14px',
            fontWeight: 600,
            color: isRecording ? 'var(--roof-red)' : 'var(--text-secondary)',
            textAlign: 'center'
          }}>
            {isRecording ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--roof-red)',
                  animation: 'pulse 1.5s ease-in-out infinite'
                }} />
                Listening...
              </span>
            ) : (
              'Tap to Start Talking'
            )}
          </div>

          {/* Instructions */}
          {isRecording && (
            <div style={{
              fontSize: '12px',
              color: 'var(--text-tertiary)',
              textAlign: 'center',
              maxWidth: '300px'
            }}>
              Speak naturally. I'll transcribe and provide suggestions in real-time.
            </div>
          )}
        </div>
      </div>

      {/* Error Display */}
      {connectionStatus.error && (
        <div style={{
          padding: '12px 20px',
          background: '#dc262620',
          borderTop: '2px solid #dc2626',
          color: '#dc2626',
          fontSize: '13px',
          textAlign: 'center'
        }}>
          Error: {connectionStatus.error}
        </div>
      )}

      {/* Pulse Animation */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
};

export default LivePanel;
