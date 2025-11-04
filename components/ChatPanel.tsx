import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { connectTranscriptionStream } from '../services/geminiService';
import { LiveSession, LiveServerMessage } from '@google/genai';
import { Message } from '../types';
import Spinner from './Spinner';
import { encode } from '../utils/audio';
import { ragService } from '../services/ragService';
import { multiAI, AIProvider } from '../services/multiProviderAI';
import { Send, Mic, Paperclip, Menu, FileText, X } from 'lucide-react';
import { personalityHelpers, SYSTEM_PROMPT } from '../config/s21Personality';
import S21ResponseFormatter from './S21ResponseFormatter';
import { enforceCitations, validateCitations } from '../services/citationEnforcer';
import { databaseService } from '../services/databaseService';
import ChatHistorySidebar from './ChatHistorySidebar';
import { emailNotificationService } from '../services/emailNotificationService';
import { authService } from '../services/authService';

interface ChatPanelProps {
  onStartEmail?: (template: string, context: string) => void;
  onOpenDocument?: (documentPath: string) => void;
  showHistorySidebar?: boolean;
  onToggleHistory?: (show: boolean) => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  onStartEmail,
  onOpenDocument,
  showHistorySidebar = false,
  onToggleHistory
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [currentProvider, setCurrentProvider] = useState<string>('Auto');
  const [availableProviders, setAvailableProviders] = useState<AIProvider[]>([]);
  const [showWelcome, setShowWelcome] = useState(true);
  const [selectedState, setSelectedState] = useState<'VA' | 'MD' | 'PA' | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => `session-${Date.now()}`);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; content: string; type: string }>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    // Load saved state selection
    const savedState = localStorage.getItem('selectedState');
    if (savedState && (savedState === 'VA' || savedState === 'MD' || savedState === 'PA')) {
      setSelectedState(savedState);
    }

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

  // Handle quick-open context from other panels (document, insurance company, image assessment)
  useEffect(() => {
    try {
      const quickDoc = localStorage.getItem('chat_quick_doc');
      if (quickDoc) {
        const { name, path } = JSON.parse(quickDoc);
        setUserInput((prev) => prev || `Please answer using this document as a primary source: ${name} (${path}).`);
        localStorage.removeItem('chat_quick_doc');
      }
      const quickCompany = localStorage.getItem('chat_quick_company');
      if (quickCompany) {
        const { name } = JSON.parse(quickCompany);
        setUserInput((prev) => prev || `I’m working with ${name}. Provide state-aware guidance and common claim handling practices for this insurer.`);
        localStorage.removeItem('chat_quick_company');
      }
      const quickAssessment = localStorage.getItem('chat_quick_assessment');
      if (quickAssessment) {
        const { summary } = JSON.parse(quickAssessment);
        setUserInput((prev) => prev || `Discuss this image assessment and craft next steps for the claim:\n\n${summary}`);
        localStorage.removeItem('chat_quick_assessment');
      }
    } catch (e) {
      console.warn('Failed to load quick-open context');
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('chatHistory', JSON.stringify(messages));
      // Auto-save session
      databaseService.saveChatSession(currentSessionId, messages);
    }
  }, [messages, currentSessionId]);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    let content = '';

    try {
      if (/\.(md|txt)$/i.test(file.name)) {
        content = await file.text();
      } else if (/\.pdf$/i.test(file.name)) {
        const pdfjsLib: any = await import('pdfjs-dist');
        const array = new Uint8Array(await file.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data: array }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const contentObj = await page.getTextContent();
          text += contentObj.items.map((it: any) => it.str).join(' ') + '\n\n';
        }
        content = text.trim();
      } else if (/\.(docx)$/i.test(file.name)) {
        const mammoth: any = await import('mammoth/mammoth.browser');
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        const html = result.value as string;
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        content = tmp.textContent || tmp.innerText || '';
      } else {
        alert('Unsupported file type. Please upload PDF, DOCX, MD, or TXT files.');
        return;
      }

      setUploadedFiles([{ name: file.name, content, type: file.type }]);
      setUserInput((prev) =>
        prev ? `${prev}\n\n[Attached: ${file.name}]` : `[Attached: ${file.name}]\n\nPlease analyze this document and provide guidance.`
      );
    } catch (error) {
      console.error('Error reading file:', error);
      alert('Failed to read file. Please try again.');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeUploadedFile = (fileName: string) => {
    setUploadedFiles(prev => prev.filter(f => f.name !== fileName));
    setUserInput(prev => prev.replace(`[Attached: ${fileName}]`, '').trim());
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

    // Send email notification to admin for chat interaction
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      emailNotificationService.notifyChat({
        userName: currentUser.name,
        userEmail: currentUser.email,
        message: originalQuery,
        timestamp: new Date().toISOString(),
        sessionId: currentSessionId,
        state: selectedState || undefined
      }).catch(err => {
        console.warn('Failed to send chat notification email:', err);
        // Don't block chat if email fails
      });
    }

    setIsLoading(true);

    try {
      const queryType = personalityHelpers.detectQueryType(originalQuery);
      const useRAG = ragService.shouldUseRAG(originalQuery);
      let systemPrompt = SYSTEM_PROMPT;

      // Add state context if selected, else enforce tri-state-safe guidance
      if (selectedState) {
        systemPrompt += `\n\nCURRENT STATE CONTEXT: ${selectedState}\nThe user is working in ${selectedState}. Tailor all advice, building codes, and strategies specifically for ${selectedState}.`;
      } else {
        systemPrompt += `\n\nNO STATE SELECTED: Do not assume a state. Provide guidance that is valid across Virginia (VA), Maryland (MD), and Pennsylvania (PA). Where requirements differ, explicitly call out differences per state. Do not apply MD-only matching rules unless the user confirms Maryland.`;
      }

      let userPrompt = originalQuery;
      let sources: any[] = [];

      // Include uploaded file content in the prompt
      if (uploadedFiles.length > 0) {
        const fileContext = uploadedFiles.map(f =>
          `\n\n--- UPLOADED DOCUMENT: ${f.name} ---\n${f.content}\n--- END OF ${f.name} ---`
        ).join('\n');
        userPrompt = originalQuery + fileContext;
        // Clear uploaded files after sending
        setUploadedFiles([]);
      }

      if (useRAG) {
        console.log('[RAG] Enhancing query with knowledge base...');
        const ragContext = await ragService.buildRAGContext(originalQuery, 3, selectedState || undefined);
        systemPrompt = ragContext.enhancedPrompt.split('USER QUESTION:')[0];
        // Keep the uploaded file content in userPrompt
        if (uploadedFiles.length === 0) {
          userPrompt = originalQuery;
        }
        sources = ragContext.sources;
        console.log(`[RAG] Found ${sources.length} relevant documents${selectedState ? ` (State: ${selectedState})` : ''}`);
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

      // Sources are handled by S21ResponseFormatter via interactive citations
      // No need to append text-based sources - they're redundant
      let responseText = response.content;

      // 🔴 CITATION ENFORCEMENT: Auto-add citations if AI forgot them
      if (sources.length > 0) {
        responseText = enforceCitations(responseText, sources);

        // Validate citations and log issues
        const validation = validateCitations(responseText, sources);
        if (!validation.valid) {
          console.warn('[Citation Validator] Issues found:', validation.issues);
        } else {
          console.log('[Citation Validator] ✓ All citations valid');
        }
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

  const handleLoadSession = (sessionId: string, sessionMessages: any[]) => {
    setMessages(sessionMessages);
    setCurrentSessionId(sessionId);
    setShowWelcome(false);
    localStorage.setItem('chatHistory', JSON.stringify(sessionMessages));
  };

  const handleNewChat = () => {
    const newSessionId = `session-${Date.now()}`;
    setCurrentSessionId(newSessionId);
    setMessages([]);
    setShowWelcome(true);
    localStorage.removeItem('chatHistory');

    // Show welcome message
    const welcomeMessage = personalityHelpers.getWelcomeMessage(false);
    setMessages([{
      id: 'initial',
      text: welcomeMessage.text,
      sender: 'bot'
    }]);
  };

  return (
    <div className="roof-er-content-area">
      {/* Chat History Sidebar */}
      <ChatHistorySidebar
        isOpen={showHistorySidebar}
        onClose={() => onToggleHistory?.(false)}
        onLoadSession={handleLoadSession}
        onNewChat={handleNewChat}
        currentSessionId={currentSessionId}
      />

      {/* Header with Hamburger Menu */}
      <div className="roof-er-header">
        <button
          onClick={() => onToggleHistory?.(true)}
          className="roof-er-menu-btn"
          title="Chat History"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="roof-er-header-title">
          <span className="roof-er-logo">S21</span>
          <span className="roof-er-subtitle">AI Roofing Assistant</span>
        </div>
      </div>

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
              onClick={() => {
                const newState = selectedState === state.code ? null : state.code as 'VA' | 'MD' | 'PA';
                setSelectedState(newState);
                // Persist state selection
                if (newState) {
                  localStorage.setItem('selectedState', newState);
                } else {
                  localStorage.removeItem('selectedState');
                }
              }}
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

        {/* File Upload Input (Hidden) */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.doc,.txt,.md"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />

        {/* Uploaded Files Display */}
        {uploadedFiles.length > 0 && (
          <div style={{
            padding: '12px 16px',
            background: 'var(--bg-elevated)',
            borderTop: '1px solid var(--border-default)',
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap'
          }}>
            {uploadedFiles.map((file) => (
              <div
                key={file.name}
                style={{
                  padding: '6px 12px',
                  background: 'var(--roof-red)',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <FileText className="w-4 h-4" />
                <span>{file.name}</span>
                <button
                  onClick={() => removeUploadedFile(file.name)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'white',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

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
              title="Attach Document (PDF, DOCX, TXT, MD)"
              onClick={() => fileInputRef.current?.click()}
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
