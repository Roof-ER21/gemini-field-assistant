import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { connectTranscriptionStream } from '../services/geminiService';
import { LiveSession, LiveServerMessage } from '@google/genai';
import { Message } from '../types';
import Spinner from './Spinner';
import { encode } from '../utils/audio';
import { ragService } from '../services/ragService';
import { multiAI, AIProvider } from '../services/multiProviderAI';
import { Send, Mic, Paperclip } from 'lucide-react';
import { personalityHelpers, SYSTEM_PROMPT } from '../config/s21Personality';
import S21ResponseFormatter from './S21ResponseFormatter';

interface ChatPanelProps {
  onStartEmail?: (template: string, context: string) => void;
  onOpenDocument?: (documentPath: string) => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ onStartEmail, onOpenDocument }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [currentProvider, setCurrentProvider] = useState<string>('Auto');
  const [availableProviders, setAvailableProviders] = useState<AIProvider[]>([]);
  const [showWelcome, setShowWelcome] = useState(true);
  const [selectedState, setSelectedState] = useState<'VA' | 'MD' | 'PA' | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Refs for voice transcription
  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // State options
  const stateOptions = [
    { code: 'VA', name: 'Virginia', color: '#1e40af' },
    { code: 'MD', name: 'Maryland', color: '#dc2626' },
    { code: 'PA', name: 'Pennsylvania', color: '#059669' }
  ];

  // Effect to initialize and load messages from localStorage
  useEffect(() => {
    multiAI.getAvailableProviders().then(providers => {
      setAvailableProviders(providers);
      console.log('Available AI providers:', providers.length);
    });

    try {
      const savedMessages = localStorage.getItem('chatHistory');
      if (savedMessages) {
        const parsedMessages: Message[] = JSON.parse(savedMessages);
        if (parsedMessages.length > 0) {
          setMessages(parsedMessages);
          setShowWelcome(false);
        } else {
          const welcomeMessage = personalityHelpers.getWelcomeMessage(false);
          setMessages([{
            id: 'initial',
            text: welcomeMessage.text,
            sender: 'bot'
          }]);
          setShowWelcome(true);
        }
      } else {
        const welcomeMessage = personalityHelpers.getWelcomeMessage(false);
        setMessages([{
          id: 'initial',
          text: welcomeMessage.text,
          sender: 'bot'
        }]);
        setShowWelcome(true);
      }
    } catch (error) {
      console.error("Failed to load chat history:", error);
      const welcomeMessage = personalityHelpers.getWelcomeMessage(false);
      setMessages([{
        id: 'initial',
        text: welcomeMessage.text,
        sender: 'bot'
      }]);
      setShowWelcome(true);
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('chatHistory', JSON.stringify(messages));
    }
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setUserInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userInput.trim() || isLoading) return;

    if (showWelcome) {
      setShowWelcome(false);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      text: userInput,
      sender: 'user',
    };
    setMessages(prev => [...prev, userMessage]);
    const originalQuery = userInput;
    setUserInput('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    setIsLoading(true);

    try {
      const queryType = personalityHelpers.detectQueryType(originalQuery);
      const useRAG = ragService.shouldUseRAG(originalQuery);
      let systemPrompt = SYSTEM_PROMPT;

      // Add state context if selected
      if (selectedState) {
        systemPrompt += `\n\nCURRENT STATE CONTEXT: ${selectedState}\nThe user is working in ${selectedState}. Tailor all advice, building codes, and strategies specifically for ${selectedState}.`;
      }

      let userPrompt = originalQuery;
      let sources: any[] = [];

      if (useRAG) {
        console.log('[RAG] Enhancing query with knowledge base...');
        const ragContext = await ragService.buildRAGContext(originalQuery, 3);
        systemPrompt = ragContext.enhancedPrompt.split('USER QUESTION:')[0];
        userPrompt = originalQuery;
        sources = ragContext.sources;
        console.log(`[RAG] Found ${sources.length} relevant documents`);
      }

      const conversationMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...messages
          .filter(m => m.sender !== 'bot' || !m.text.includes('Hey there!') && !m.text.includes('Welcome back'))
          .slice(-10)
          .map(m => ({
            role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
            content: m.text,
          })),
        { role: 'user' as const, content: userPrompt },
      ];

      const response = await multiAI.generate(conversationMessages);
      setCurrentProvider(response.provider);

      let responseText = response.content;
      if (useRAG && sources.length > 0) {
        responseText += ragService.formatSourcesCitation(sources);
      }

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: responseText,
        sender: 'bot',
        sources: sources.length > 0 ? sources : undefined,
      };
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: `Sorry, I encountered an error: ${(error as Error).message}\n\nPlease check your API keys in .env.local or install Ollama for local AI.`,
        sender: 'bot',
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Voice Input Logic
  const stopVoiceInputResources = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (mediaStreamSourceRef.current) {
      mediaStreamSourceRef.current.disconnect();
      mediaStreamSourceRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => session.close()).catch(console.error);
      sessionPromiseRef.current = null;
    }
  }, []);

  const stopVoiceInput = useCallback(() => {
    setIsVoiceRecording(false);
    stopVoiceInputResources();
  }, [stopVoiceInputResources]);

  const startVoiceInput = async () => {
    setVoiceError('');
    if (isVoiceRecording) return;

    setIsVoiceRecording(true);
    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });

      sessionPromiseRef.current = connectTranscriptionStream({
        onopen: () => console.log("Voice input connection opened."),
        onclose: () => console.log("Voice input connection closed."),
        onerror: (e) => {
          console.error("Voice input error:", e);
          setVoiceError("Connection error.");
          stopVoiceInput();
        },
        onmessage: (message: LiveServerMessage) => {
          if (message.serverContent?.inputTranscription) {
            setUserInput(prev => prev + message.serverContent.inputTranscription.text);
          }
        },
      });

      mediaStreamSourceRef.current = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
      scriptProcessorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);

      scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
        const l = inputData.length;
        const int16 = new Int16Array(l);
        for (let i = 0; i < l; i++) {
          int16[i] = inputData[i] * 32768;
        }
        const base64 = encode(new Uint8Array(int16.buffer));

        sessionPromiseRef.current?.then(session => {
          session.sendRealtimeInput({ media: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
        }).catch(e => {
          console.error("Error sending audio data:", e);
        });
      };

      mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
      scriptProcessorRef.current.connect(audioContextRef.current.destination);

    } catch (err) {
      console.error("Error starting voice input:", err);
      setVoiceError("Mic access denied.");
      setIsVoiceRecording(false);
      stopVoiceInputResources();
    }
  };

  const handleToggleVoiceRecording = () => {
    if (isVoiceRecording) {
      stopVoiceInput();
    } else {
      startVoiceInput();
    }
  };

  useEffect(() => {
    return () => {
      stopVoiceInputResources();
    };
  }, [stopVoiceInputResources]);

  const handleQuickCommand = (command: string) => {
    setUserInput(command);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="roof-er-content-area">
      {/* Messages Area */}
      <div className="roof-er-content-scroll">
        {showWelcome ? (
          <div className="roof-er-welcome-screen">
            <div className="roof-er-welcome-icon">🏠</div>
            <div className="roof-er-welcome-title">Hey there! I'm S21, your AI-powered roofing expert.</div>
            <div className="roof-er-welcome-subtitle">
              I've got instant access to 123+ industry documents and I'm running on 4 different AI systems working together to give you the best answers. Whether it's GAF product specs, sales scripts, or handling tough customer questions - I've got your back.
            </div>
            <div className="roof-er-welcome-stats">
              <div className="roof-er-stat-item">
                <span className="roof-er-stat-number">123+</span>
                <span className="roof-er-stat-label">Documents</span>
              </div>
              <div className="roof-er-stat-item">
                <span className="roof-er-stat-number">4</span>
                <span className="roof-er-stat-label">AI Systems</span>
              </div>
              <div className="roof-er-stat-item">
                <span className="roof-er-stat-number">24/7</span>
                <span className="roof-er-stat-label">Available</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="roof-er-message-container">
            {messages.map((msg) => (
              <div key={msg.id} className={`roof-er-message ${msg.sender === 'user' ? 'user' : 'ai'}`}>
                <div className="roof-er-message-avatar">
                  {msg.sender === 'user' ? 'YOU' : 'S21'}
                </div>
                <div className="roof-er-message-content">
                  <div className="roof-er-message-text">
                    {msg.sender === 'bot' ? (
                      <S21ResponseFormatter
                        content={msg.text}
                        onStartEmail={onStartEmail}
                        onOpenDocument={onOpenDocument}
                        sources={msg.sources}
                      />
                    ) : (
                      msg.text
                    )}
                  </div>
                  <div className="roof-er-message-time">
                    {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="roof-er-message ai">
                <div className="roof-er-message-avatar">S21</div>
                <div className="roof-er-message-content">
                  <div className="roof-er-typing-indicator">
                    <div className="roof-er-typing-dot"></div>
                    <div className="roof-er-typing-dot"></div>
                    <div className="roof-er-typing-dot"></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="roof-er-input-area">
        {/* State Selector */}
        <div className="roof-er-quick-commands" style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '12px 16px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500, marginRight: '8px' }}>
            Current State:
          </span>
          {stateOptions.map((state) => (
            <button
              key={state.code}
              onClick={() => setSelectedState(selectedState === state.code ? null : state.code as 'VA' | 'MD' | 'PA')}
              style={{
                padding: '6px 14px',
                background: selectedState === state.code ? state.color : 'var(--bg-elevated)',
                border: `2px solid ${selectedState === state.code ? state.color : 'var(--border-default)'}`,
                borderRadius: '6px',
                color: selectedState === state.code ? 'white' : 'var(--text-primary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              title={`${state.name} ${selectedState === state.code ? '(Active)' : ''}`}
            >
              {state.code}
            </button>
          ))}
          {selectedState && (
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginLeft: '8px' }}>
              S21 will tailor answers for {stateOptions.find(s => s.code === selectedState)?.name}
            </span>
          )}
        </div>

        {/* Input Wrapper */}
        <form onSubmit={handleSendMessage} className="roof-er-input-wrapper">
          <textarea
            ref={textareaRef}
            className="roof-er-input-field"
            placeholder="Ask me anything about roofing, sales, products, or field work..."
            value={userInput}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyPress}
            rows={1}
            disabled={isLoading || isVoiceRecording}
          />
          <div className="roof-er-input-actions">
            <button
              type="button"
              className="roof-er-action-btn"
              title="Attach Photo"
              onClick={() => alert('Photo attachment feature - connects to camera/gallery')}
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <button
              type="button"
              className={`roof-er-action-btn ${isVoiceRecording ? 'roof-er-bg-red roof-er-text-primary' : ''}`}
              title="Voice Input"
              onClick={handleToggleVoiceRecording}
              disabled={isLoading}
            >
              <Mic className="w-5 h-5" />
            </button>
            <button
              type="submit"
              className="roof-er-action-btn roof-er-send-btn"
              title="Send Message"
              disabled={!userInput.trim() || isLoading || isVoiceRecording}
            >
              {isLoading ? <Spinner /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatPanel;
