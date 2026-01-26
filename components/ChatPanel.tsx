import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { connectTranscriptionStream } from '../services/geminiService';
import { Session, LiveServerMessage } from '@google/genai';
import { Message } from '../types';
import Spinner from './Spinner';
import { encode } from '../utils/audio';
import { ragService } from '../services/ragService';
import { multiAI, AIProvider } from '../services/multiProviderAI';
import { Send, Mic, Paperclip, Menu, FileText, X, Mail } from 'lucide-react';
import { personalityHelpers, SYSTEM_PROMPT } from '../config/s21Personality';
import S21ResponseFormatter from './S21ResponseFormatter';
import { enforceCitations, validateCitations } from '../services/citationEnforcer';
import { databaseService } from '../services/databaseService';
import ChatHistorySidebar from './ChatHistorySidebar';
import { emailNotificationService } from '../services/emailNotificationService';
import { authService } from '../services/authService';
import { activityService } from '../services/activityService';
import { useToast } from './Toast';

/**
 * Extract and compress key context from conversation history
 * Preserves important facts while reducing token usage
 */
interface ConversationContext {
  state: string | null;
  insurer: string | null;
  claimType: string | null;
  damageDetails: string[];
  customerUrgency: string | null;
  keyFacts: string[];
}

function extractConversationContext(messages: Message[]): ConversationContext {
  const context: ConversationContext = {
    state: null,
    insurer: null,
    claimType: null,
    damageDetails: [],
    customerUrgency: null,
    keyFacts: []
  };

  // Patterns to extract key information
  const statePatterns = /\b(virginia|maryland|pennsylvania|VA|MD|PA)\b/gi;
  const insurerPatterns = /\b(state farm|usaa|allstate|liberty mutual|travelers|erie|nationwide|geico|farmers|progressive|american family)\b/gi;
  const claimPatterns = /\b(partial approval|full denial|denial|supplement|initial inspection|re-inspection|matching dispute|depreciation)\b/gi;
  const damagePatterns = /\b(hail damage|wind damage|storm damage|age-related|brittle|cracked|missing shingles?|leak|water damage|impact marks?|granule loss)\b/gi;
  const urgencyPatterns = /\b(urgent|asap|immediately|time-?sensitive|deadline|emergency|rush|today|tomorrow)\b/gi;

  const allText = messages.map(m => m.text).join(' ');

  // Extract state
  const stateMatches = allText.match(statePatterns);
  if (stateMatches) {
    const lastState = stateMatches[stateMatches.length - 1].toUpperCase();
    context.state = lastState === 'VIRGINIA' ? 'VA' :
                    lastState === 'MARYLAND' ? 'MD' :
                    lastState === 'PENNSYLVANIA' ? 'PA' : lastState;
  }

  // Extract insurer
  const insurerMatches = allText.match(insurerPatterns);
  if (insurerMatches) {
    context.insurer = insurerMatches[insurerMatches.length - 1];
  }

  // Extract claim type
  const claimMatches = allText.match(claimPatterns);
  if (claimMatches) {
    context.claimType = claimMatches[claimMatches.length - 1];
  }

  // Extract damage details (unique)
  const damageMatches = allText.match(damagePatterns);
  if (damageMatches) {
    context.damageDetails = [...new Set(damageMatches.map(d => d.toLowerCase()))];
  }

  // Check for urgency
  const urgencyMatches = allText.match(urgencyPatterns);
  if (urgencyMatches) {
    context.customerUrgency = 'high';
  }

  // Extract key facts from user messages (specific claim details, numbers, dates)
  const numberPattern = /\$[\d,]+|\d+%|\d+\s*(?:years?|months?|sq(?:uare)?(?:\s*(?:feet|ft))?)/gi;
  const datePattern = /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,?\s+\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/gi;

  messages.filter(m => m.sender === 'user').forEach(msg => {
    const numbers = msg.text.match(numberPattern);
    const dates = msg.text.match(datePattern);
    if (numbers) context.keyFacts.push(...numbers.slice(0, 3));
    if (dates) context.keyFacts.push(...dates.slice(0, 2));
  });

  // Dedupe key facts
  context.keyFacts = [...new Set(context.keyFacts)].slice(0, 5);

  return context;
}

/**
 * Build compressed context summary for older messages
 */
function buildContextSummary(context: ConversationContext): string {
  const parts: string[] = [];

  if (context.state) {
    parts.push(`State: ${context.state}`);
  }
  if (context.insurer) {
    parts.push(`Insurance Company: ${context.insurer}`);
  }
  if (context.claimType) {
    parts.push(`Claim Status: ${context.claimType}`);
  }
  if (context.damageDetails.length > 0) {
    parts.push(`Damage Types: ${context.damageDetails.join(', ')}`);
  }
  if (context.customerUrgency) {
    parts.push(`Urgency: ${context.customerUrgency}`);
  }
  if (context.keyFacts.length > 0) {
    parts.push(`Key Details: ${context.keyFacts.join(', ')}`);
  }

  if (parts.length === 0) {
    return '';
  }

  return `[CONVERSATION CONTEXT FROM EARLIER MESSAGES]\n${parts.join('\n')}\n[END CONTEXT]`;
}

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
  const toast = useToast();
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
  const sessionPromiseRef = useRef<Promise<Session> | null>(null);
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
        toast.warning('Unsupported file type', 'Please upload PDF, DOCX, MD, or TXT files.');
        return;
      }

      setUploadedFiles([{ name: file.name, content, type: file.type }]);
      setUserInput((prev) =>
        prev ? `${prev}\n\n[Attached: ${file.name}]` : `[Attached: ${file.name}]\n\nPlease analyze this document and provide guidance.`
      );
    } catch (error) {
      console.error('Error reading file:', error);
      toast.error('Failed to read file', 'Please try again.');
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

    // DISABLED: Chat email notifications removed as per Phase 1 of notification overhaul
    // Activity logging will be handled separately below
    // emailNotificationService.notifyChat(...) - COMMENTED OUT
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      // Log chat activity to backend
      activityService.logChatMessage(originalQuery.length).catch(err => {
        console.warn('Failed to log chat activity:', err);
        // Don't block chat if activity logging fails
      });

      // Persist user message to backend when available
      databaseService.saveChatMessage({
        message_id: userMessage.id,
        sender: 'user',
        content: originalQuery,
        state: selectedState || undefined,
        session_id: currentSessionId,
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

      // Build conversation context with compression for older messages
      const filteredMessages = messages
        .filter(m => m.sender !== 'bot' || !m.text.includes('Hey there!') && !m.text.includes('Welcome back'));

      const recentMessages = filteredMessages.slice(-8); // Keep last 8 messages fully
      const olderMessages = filteredMessages.slice(0, -8); // Compress older messages

      // Extract context from older messages if any
      let contextPrefix = '';
      if (olderMessages.length > 0) {
        const extractedContext = extractConversationContext(olderMessages);
        contextPrefix = buildContextSummary(extractedContext);
        if (contextPrefix) {
          console.log('[Context Compression] Preserved context from', olderMessages.length, 'older messages');
        }
      }

      // Also extract from recent messages to ensure we have latest context
      const recentContext = extractConversationContext(recentMessages);

      // Override selectedState if conversation explicitly mentions a different state
      const conversationState = recentContext.state || (olderMessages.length > 0 ? extractConversationContext(olderMessages).state : null);
      if (conversationState && !selectedState) {
        console.log('[Context] Auto-detected state from conversation:', conversationState);
      }

      const conversationMessages = [
        { role: 'system' as const, content: systemPrompt },
        // Add compressed context from older messages if available
        ...(contextPrefix ? [{ role: 'system' as const, content: contextPrefix }] : []),
        ...recentMessages.map(m => ({
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

      // Persist bot message to backend when available
      databaseService.saveChatMessage({
        message_id: botMessage.id,
        sender: 'bot',
        content: responseText,
        state: selectedState || undefined,
        provider: response.provider,
        sources: sources.length > 0 ? sources : undefined,
        session_id: currentSessionId,
      });
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

  // Helper function to detect if response contains email-worthy content
  const responseHasEmailContent = (text: string): boolean => {
    const emailIndicators = [
      /here'?s\s+the\s+language/i,
      /send\s+this\s+to\s+the\s+adjuster/i,
      /copy[-\s]?(?:and[-\s]?)?paste/i,
      /draft\s+(?:an?\s+)?email/i,
      /email\s+template/i,
      /communicate\s+with\s+the\s+insurance/i,
      /dear\s+\w+/i, // Starts with "Dear [Name]"
      /subject:/i,
      /contractor[-\s]?compliant/i,
      /professional\s+language/i,
      /formal\s+(?:letter|correspondence)/i
    ];

    return emailIndicators.some(pattern => pattern.test(text));
  };

  // Helper function to extract email content from response
  const extractEmailContent = (text: string): string => {
    // Try to find quoted text or code blocks
    const quotedMatch = text.match(/"([^"]{50,})"/);
    if (quotedMatch) {
      return quotedMatch[1];
    }

    // Look for content after common phrases
    const languageMatch = text.match(/here'?s\s+the\s+language.*?:\s*(.+?)(?:\n\n|$)/is);
    if (languageMatch) {
      return languageMatch[1].trim();
    }

    // Look for template sections (lines starting with "Dear", "Subject:", etc.)
    const templateLines: string[] = [];
    const lines = text.split('\n');
    let inTemplate = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Start capturing if we hit a template marker
      if (/^(dear|subject:|to:|from:)/i.test(trimmed)) {
        inTemplate = true;
      }

      if (inTemplate) {
        templateLines.push(line);

        // Stop if we hit an empty line after capturing some content
        if (trimmed === '' && templateLines.length > 3) {
          break;
        }
      }
    }

    if (templateLines.length > 0) {
      return templateLines.join('\n').trim();
    }

    // Fallback: return first substantial paragraph
    const paragraphs = text.split('\n\n').filter(p => p.trim().length > 50);
    return paragraphs[0] || text.slice(0, 500);
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
                  {msg.sender === 'bot' && responseHasEmailContent(msg.text) && onStartEmail && (
                    <button
                      onClick={() => {
                        const emailContent = extractEmailContent(msg.text);
                        onStartEmail('custom', emailContent);
                      }}
                      className="roof-er-draft-email-btn"
                      style={{
                        marginTop: '12px',
                        padding: '10px 16px',
                        background: 'linear-gradient(135deg, var(--roof-red) 0%, #b91c1c 100%)',
                        border: 'none',
                        borderRadius: '8px',
                        color: 'white',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(220, 38, 38, 0.3)';
                      }}
                    >
                      <Mail className="w-4 h-4" />
                      Draft as Email
                    </button>
                  )}
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
