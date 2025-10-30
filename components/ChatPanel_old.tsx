import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { connectTranscriptionStream } from '../services/geminiService';
import { LiveSession, LiveServerMessage } from '@google/genai';
import { Message } from '../types';
import Spinner from './Spinner';
import TypingIndicator from './TypingIndicator';
import MessageBubble from './MessageBubble';
import WelcomeScreen from './WelcomeScreen';
import { MicIcon } from './icons/MicIcon';
import { encode } from '../utils/audio';
import { ragService } from '../services/ragService';
import { multiAI, AIProvider } from '../services/multiProviderAI';
import { MessageSquare, Mic, Sparkles, Zap, Send, Activity } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { personalityHelpers, SYSTEM_PROMPT, CONTEXTUAL_RESPONSES } from '../config/s21Personality';

const ChatPanel: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [currentProvider, setCurrentProvider] = useState<string>('Auto');
  const [availableProviders, setAvailableProviders] = useState<AIProvider[]>([]);
  const [showWelcome, setShowWelcome] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Refs for voice transcription
  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Effect to initialize and load messages from localStorage
  useEffect(() => {
    // Check available providers
    multiAI.getAvailableProviders().then(providers => {
      setAvailableProviders(providers);
      console.log('Available AI providers:', providers.length);
    });

    try {
      const savedMessages = localStorage.getItem('chatHistory');

      if (savedMessages) {
        const parsedMessages: Message[] = JSON.parse(savedMessages);
        if (parsedMessages.length > 0) {
          // Has chat history - returning user, hide welcome
          setMessages(parsedMessages);
          setShowWelcome(false);
        } else {
          // Empty history - show welcome
          const welcomeMessage = personalityHelpers.getWelcomeMessage(false);
          setMessages([{
            id: 'initial',
            text: welcomeMessage.text,
            sender: 'bot'
          }]);
          setShowWelcome(true);
        }
      } else {
        // No history at all - show welcome
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

  // Effect to save messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('chatHistory', JSON.stringify(messages));
    }
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || isLoading) return;

    // Hide welcome screen on first message
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
    setIsLoading(true);

    try {
      // Detect query type for contextual response
      const queryType = personalityHelpers.detectQueryType(originalQuery);

      // Check if query should use RAG
      const useRAG = ragService.shouldUseRAG(originalQuery);
      let systemPrompt = SYSTEM_PROMPT;
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

      // Build conversation history
      const conversationMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...messages
          .filter(m => m.sender !== 'bot' || !m.text.includes('Hey there!') && !m.text.includes('Welcome back') && !m.text.includes('Good morning') && !m.text.includes('Good afternoon'))
          .slice(-10) // Keep last 10 messages for context
          .map(m => ({
            role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
            content: m.text,
          })),
        { role: 'user' as const, content: userPrompt },
      ];

      // Send to multi-provider AI
      const response = await multiAI.generate(conversationMessages);

      // Update current provider info
      setCurrentProvider(response.provider);

      // Add source citations if RAG was used
      let responseText = response.content;
      if (useRAG && sources.length > 0) {
        responseText += ragService.formatSourcesCitation(sources);
      }

      // Add provider badge to response
      responseText += `\n\n_🤖 Powered by ${response.provider}_`;

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: responseText,
        sender: 'bot',
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

  // --- Voice Input Logic ---

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
    if(sessionPromiseRef.current) {
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

  const handleWelcomeGetStarted = () => {
    setShowWelcome(false);
  };

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      <motion.div
        animate={{
          background: [
            'radial-gradient(circle at 20% 30%, rgba(220, 38, 38, 0.08) 0%, transparent 50%)',
            'radial-gradient(circle at 80% 70%, rgba(220, 38, 38, 0.08) 0%, transparent 50%)',
            'radial-gradient(circle at 20% 30%, rgba(220, 38, 38, 0.08) 0%, transparent 50%)',
          ],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-0 pointer-events-none"
      />

      {/* Main Content */}
      <div className="relative z-10 flex flex-col h-full p-6">
        {/* Header */}
        <div className="mb-6 relative">
          <div className="flex items-center justify-between">
            <div>
              <div className="s21-header-title">S21 CORE</div>
              <div className="s21-header-subtitle">Field Assistant</div>
            </div>
            <div className="absolute right-0 top-0">
              <div className="s21-provider-pill">
                <Zap className="h-3.5 w-3.5 text-[#f59e0b]" />
                <span>Provider:</span>
                <Badge variant="success" className="text-xs">{currentProvider || 'Auto'}</Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Messages Area or Welcome Screen */}
        <div className="flex-1 overflow-hidden mb-4">
          <AnimatePresence mode="wait">
            {showWelcome ? (
              <motion.div
                key="welcome"
                initial={{ opacity: 1, scale: 1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="h-full bg-transparent"
              >
                <WelcomeScreen onGetStarted={handleWelcomeGetStarted} />
              </motion.div>
            ) : (
              <motion.div
                key="messages"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="h-full overflow-y-auto pr-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-700 hover:scrollbar-thumb-zinc-600"
              >
                <div className="flex flex-col space-y-4 pb-4">
                  <AnimatePresence initial={false}>
                    {messages.map((msg, index) => (
                      <MessageBubble
                        key={msg.id}
                        id={msg.id}
                        text={msg.text}
                        sender={msg.sender}
                        index={index}
                      />
                    ))}
                  </AnimatePresence>
                  {isLoading && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      <TypingIndicator />
                    </motion.div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Voice Error */}
        <AnimatePresence>
          {voiceError && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-3"
            >
              <div className="bg-[#1a1a2e] border border-red-500/30 rounded-lg p-3 text-red-300 text-sm text-center">
                {voiceError}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Form */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          onSubmit={handleSendMessage}
          className="relative"
        >
          <div className="flex items-center gap-2 p-3 rounded-2xl bg-white border border-zinc-200 shadow-lg">
            <div className="flex-1 relative">
              <Input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder={isVoiceRecording ? "Listening..." : "Type your message..."}
                className="h-12 bg-white border-zinc-300 focus:border-red-600 focus:ring-2 focus:ring-red-600/20 text-zinc-900 placeholder:text-zinc-500"
                disabled={isLoading || isVoiceRecording}
              />
              {userInput && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <Sparkles className="h-4 w-4 text-red-500" />
                </motion.div>
              )}
            </div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                type="button"
                onClick={handleToggleVoiceRecording}
                variant={isVoiceRecording ? "default" : "secondary"}
                size="icon"
                className={`h-12 w-12 rounded-xl ${
                  isVoiceRecording
                    ? 'bg-gradient-to-br from-red-600 to-red-700 shadow-lg shadow-red-600/30 animate-pulse text-white'
                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900'
                }`}
                disabled={isLoading}
              >
                <Mic className="h-5 w-5" strokeWidth={2.5} />
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                type="submit"
                disabled={!userInput.trim() || isLoading || isVoiceRecording}
                className="h-12 px-6 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-lg shadow-red-600/30 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Spinner />
                ) : (
                  <>
                    <Send className="h-5 w-5 mr-2" strokeWidth={2.5} />
                    Send
                  </>
                )}
              </Button>
            </motion.div>
          </div>
        </motion.form>
      </div>
    </div>
  );
};

export default ChatPanel;
