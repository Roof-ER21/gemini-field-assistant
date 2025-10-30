import React, { useState, useEffect, useRef, useCallback } from 'react';
import { connectTranscriptionStream } from '../services/geminiService';
import { LiveSession, LiveServerMessage } from '@google/genai';
import { Message } from '../types';
import Spinner from './Spinner';
import TypingIndicator from './TypingIndicator';
import { MicIcon } from './icons/MicIcon';
import { encode } from '../utils/audio';
import { ragService } from '../services/ragService';
import { multiAI, AIProvider } from '../services/multiProviderAI';
import { MessageSquare, Mic } from 'lucide-react';
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
          // Has chat history - returning user
          setMessages(parsedMessages);
        } else {
          // Empty history - first time user
          const welcomeMessage = personalityHelpers.getWelcomeMessage(false);
          setMessages([{
            id: 'initial',
            text: welcomeMessage.text,
            sender: 'bot'
          }]);
        }
      } else {
        // No history at all - first time user
        const welcomeMessage = personalityHelpers.getWelcomeMessage(false);
        setMessages([{
          id: 'initial',
          text: welcomeMessage.text,
          sender: 'bot'
        }]);
      }
    } catch (error) {
      console.error("Failed to load chat history:", error);
      const welcomeMessage = personalityHelpers.getWelcomeMessage(false);
      setMessages([{
        id: 'initial',
        text: welcomeMessage.text,
        sender: 'bot'
      }]);
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
        systemPrompt = ragContext.enhancedPrompt.split('User Question:')[0];
        userPrompt = originalQuery;
        sources = ragContext.sources;
        console.log(`[RAG] Found ${sources.length} relevant documents`);
      }

      // Build conversation history
      const conversationMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...messages
          .filter(m => m.sender !== 'bot' || !m.text.includes('Hey there!') || !m.text.includes('Welcome back'))
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


  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg shadow-red-600/30">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">S21 Chat</h2>
              <p className="text-xs text-zinc-400">Multi-provider AI conversation</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs text-zinc-500">Provider:</span>
            <Badge variant="success" className="shadow-sm">
              {currentProvider}
            </Badge>
            {availableProviders.length > 0 && (
              <span className="text-xs text-zinc-600">
                ({availableProviders.length} available)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto mb-4 pr-2 scrollbar-thin scrollbar-track-zinc-900 scrollbar-thumb-zinc-700">
        <div className="flex flex-col space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-end ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-lg lg:max-w-2xl px-5 py-3 rounded-2xl shadow-lg transition-all duration-200 hover:scale-[1.01] ${
                  msg.sender === 'user'
                    ? 'bg-gradient-to-br from-red-600 to-red-700 text-white shadow-red-600/20'
                    : 'bg-zinc-800/80 backdrop-blur-sm text-zinc-100 border border-zinc-700/50'
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed text-sm">{msg.text}</p>
              </div>
            </div>
          ))}
          {isLoading && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Voice Error */}
      {voiceError && (
        <div className="mb-3">
          <div className="bg-red-950/50 border border-red-900/50 rounded-lg p-2 text-red-400 text-xs text-center">
            {voiceError}
          </div>
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
        <div className="flex-1 relative">
          <Input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder={isVoiceRecording ? "Listening..." : "Type your message..."}
            className="h-12 pr-12 bg-zinc-800/50 border-zinc-700 focus:border-red-600 shadow-sm"
            disabled={isLoading || isVoiceRecording}
          />
        </div>
        <Button
          type="button"
          onClick={handleToggleVoiceRecording}
          variant={isVoiceRecording ? "default" : "secondary"}
          size="icon"
          className={`h-12 w-12 ${isVoiceRecording ? 'animate-pulse shadow-lg shadow-red-600/30' : ''}`}
          disabled={isLoading}
        >
          <Mic className="h-5 w-5" />
        </Button>
        <Button
          type="submit"
          disabled={!userInput.trim() || isLoading || isVoiceRecording}
          className="h-12 px-6 shadow-lg shadow-red-600/30"
        >
          {isLoading ? <Spinner /> : 'Send'}
        </Button>
      </form>
    </div>
  );
};

export default ChatPanel;
