import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { connectTranscriptionStream, generateEmail } from '../services/geminiService';
import { Session, LiveServerMessage } from '@google/genai';
import { Message } from '../types';
import Spinner from './Spinner';
import { encode } from '../utils/audio';
import { ragService } from '../services/ragService';
import { multiAI, AIProvider } from '../services/multiProviderAI';
import { Send, Mic, Paperclip, Menu, FileText, X, Mail, Users, Image as ImageIcon, Copy, Edit3, AlertTriangle, CheckCircle, ShieldAlert, ShieldCheck, XCircle, Sparkles, ThumbsUp, ThumbsDown } from 'lucide-react';
import { personalityHelpers, SYSTEM_PROMPT } from '../config/s21Personality';
import S21ResponseFormatter from './S21ResponseFormatter';
import { enforceCitations, validateCitations } from '../services/citationEnforcer';
import { databaseService } from '../services/databaseService';
import ChatHistorySidebar from './ChatHistorySidebar';
import { emailNotificationService } from '../services/emailNotificationService';
import { authService } from '../services/authService';
import { activityService } from '../services/activityService';
import { useToast } from './Toast';
import ShareModal from './ShareModal';
import { analyzeRoofImage } from '../services/imageAnalysisService';
import {
  checkEmailCompliance,
  getCompliancePromptInstructions,
  ComplianceResult
} from '../services/emailComplianceService';
import { memoryService, ExtractedMemory } from '../services/memoryService';
import { jobContextService } from '../services/jobContextService';
import { emailPatternService, EmailType } from '../services/emailPatternService';

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
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; content: string; type: string; preview?: string; file?: File }>>([]);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [messageToShare, setMessageToShare] = useState<Message | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [learningSummary, setLearningSummary] = useState<any | null>(null);
  const [showLearningPanel, setShowLearningPanel] = useState(true);
  const [feedbackModal, setFeedbackModal] = useState<{
    messageId: string;
    rating: 1 | -1;
    responseExcerpt: string;
  } | null>(null);
  const [feedbackTags, setFeedbackTags] = useState<string[]>([]);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, boolean>>({});

  // Email generation state
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailRecipientType, setEmailRecipientType] = useState<'adjuster' | 'homeowner' | 'insurance' | 'custom'>('adjuster');
  const [emailTone, setEmailTone] = useState<'professional' | 'formal' | 'friendly'>('professional');
  const [emailKeyPoints, setEmailKeyPoints] = useState('');
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const [generatedEmailData, setGeneratedEmailData] = useState<{
    messageId: string;
    email: string;
    compliance: ComplianceResult | null;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Refs for voice transcription
  const sessionPromiseRef = useRef<Promise<Session> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // State options
  const stateOptions = [
    { code: 'VA', name: 'Virginia', color: '#DC2626' },
    { code: 'MD', name: 'Maryland', color: '#B91C1C' },
    { code: 'PA', name: 'Pennsylvania', color: '#DC2626' }
  ];

  const positiveFeedbackTags = [
    'Clear',
    'Actionable',
    'Accurate',
    'Helpful tone',
    'Great citations',
    'Saved time'
  ];

  const negativeFeedbackTags = [
    'Too generic',
    'Incorrect',
    'Missing details',
    'Too long',
    'Not insurance-specific',
    'Confusing'
  ];

  // Effect to initialize and load messages from localStorage
  useEffect(() => {
    multiAI.getAvailableProviders().then(providers => {
      setAvailableProviders(providers);
      console.log('Available AI providers:', providers.length);
    });

    databaseService.getChatLearningSummary().then((summary) => {
      if (summary) {
        setLearningSummary(summary);
      }
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
      const jobContext = localStorage.getItem('job_chat_context');
      if (jobContext) {
        setUserInput((prev) => prev || `I'm working on this job and need your help:\n\n${jobContext}\n\nWhat should I do next?`);
        localStorage.removeItem('job_chat_context');
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

  // Email generation detection and handling
  const detectEmailRequest = (text: string): boolean => {
    const emailPatterns = [
      /^\/email/i,
      /^\/write\s+email/i,
      /^\/draft\s+email/i,
      /generate\s+(?:an?\s+)?email/i,
      /write\s+(?:an?\s+)?email/i,
      /draft\s+(?:an?\s+)?email/i,
      /create\s+(?:an?\s+)?email/i,
      /compose\s+(?:an?\s+)?email/i,
    ];
    return emailPatterns.some(pattern => pattern.test(text.trim()));
  };

  const handleEmailGeneration = async () => {
    if (!emailKeyPoints.trim()) {
      toast.warning('Please provide key points for the email');
      return;
    }

    setIsGeneratingEmail(true);
    try {
      // Build context from conversation
      const conversationContext = messages.slice(-6).map(m =>
        `${m.sender === 'user' ? 'User' : 'S21'}: ${m.text}`
      ).join('\n');

      const recipientLabels = {
        adjuster: 'Insurance Adjuster',
        homeowner: 'Homeowner',
        insurance: 'Insurance Company',
        custom: 'Recipient'
      };

      const stateInfo = selectedState ? ` (State: ${selectedState})` : '';

      const emailPrompt = `${getCompliancePromptInstructions()}

You are generating an email for a roofing contractor to send to: ${recipientLabels[emailRecipientType]}${stateInfo}

Tone: ${emailTone.charAt(0).toUpperCase() + emailTone.slice(1)}

Key Points to Include:
${emailKeyPoints}

Recent Conversation Context:
${conversationContext}

Generate a professional, compliant email that:
1. Uses contractor-focused language (not insurance interpretation)
2. Follows compliance guidelines strictly
3. Is specific and actionable
4. Matches the ${emailTone} tone appropriate for ${recipientLabels[emailRecipientType]}
5. Incorporates ${selectedState ? selectedState + '-specific' : 'general tri-state'} building codes and requirements where relevant

Generate ONLY the email body text, no subject line or metadata.`;

      const emailBody = await generateEmail(
        recipientLabels[emailRecipientType],
        `Email to ${recipientLabels[emailRecipientType]}`,
        emailPrompt
      );

      // Check compliance
      const compliance = checkEmailCompliance(emailBody);

      // Create a bot message with the email
      const emailMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: `EMAIL_GENERATED:${emailRecipientType}:${emailTone}\n\n${emailBody}`,
        sender: 'bot',
      };

      setMessages(prev => [...prev, emailMessage]);
      setGeneratedEmailData({
        messageId: emailMessage.id,
        email: emailBody,
        compliance
      });

      // Persist email message
      databaseService.saveChatMessage({
        message_id: emailMessage.id,
        sender: 'bot',
        content: emailMessage.text,
        state: selectedState || undefined,
        session_id: currentSessionId,
      });

      // Track email pattern for learning
      try {
        const emailTypeMap: Record<string, EmailType> = {
          'adjuster': 'supplement',
          'homeowner': 'follow_up',
          'insurance': 'dispute',
          'custom': 'general'
        };
        await emailPatternService.trackEmailGeneration({
          emailType: emailTypeMap[emailRecipientType] || 'general',
          state: selectedState || undefined,
          body: emailBody,
          tone: emailTone as 'professional' | 'firm' | 'urgent' | 'collaborative' | 'friendly',
          sourceEmailId: emailMessage.id,
        });
        console.log('[Memory] Tracked email pattern for learning');
      } catch (patternError) {
        console.warn('[Memory] Error tracking email pattern:', patternError);
      }

      setShowEmailDialog(false);
      setEmailKeyPoints('');

      if (!compliance.canSend) {
        toast.warning('Email generated with compliance warnings', 'Please review before sending');
      } else {
        toast.success('Email generated successfully');
      }
    } catch (error) {
      console.error('Failed to generate email:', error);
      toast.error('Failed to generate email', 'Please try again');
    } finally {
      setIsGeneratingEmail(false);
    }
  };

  const handleCopyEmail = async (emailText: string) => {
    try {
      await navigator.clipboard.writeText(emailText);
      toast.success('Email copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy email');
    }
  };

  const handleOpenInEmailPanel = (emailText: string) => {
    if (onStartEmail) {
      onStartEmail('custom', emailText);
      toast.success('Email opened in Email Panel');
    }
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackModal) return;

    await databaseService.submitChatFeedback({
      message_id: feedbackModal.messageId,
      session_id: currentSessionId,
      rating: feedbackModal.rating,
      tags: feedbackTags,
      comment: feedbackComment.trim() || undefined,
      response_excerpt: feedbackModal.responseExcerpt
    });

    setFeedbackGiven(prev => ({ ...prev, [feedbackModal.messageId]: true }));
    setFeedbackModal(null);
    setFeedbackTags([]);
    setFeedbackComment('');

    const updatedSummary = await databaseService.getChatLearningSummary();
    if (updatedSummary) {
      setLearningSummary(updatedSummary);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userInput.trim() || isLoading) return;

    // Check if this is an email generation request
    if (detectEmailRequest(userInput)) {
      setShowEmailDialog(true);
      // Extract any key points from the message
      const keyPointsMatch = userInput.match(/(?:about|for|regarding)\s+(.+)$/i);
      if (keyPointsMatch) {
        setEmailKeyPoints(keyPointsMatch[1]);
      }
      return;
    }

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

      // MEMORY ENHANCEMENT: Build user context from persistent memories
      try {
        const userMemoryContext = await memoryService.buildUserContext();
        if (userMemoryContext) {
          systemPrompt += userMemoryContext;
          console.log('[Memory] Added user memory context to prompt');
        }

        // Check for job mentions and add job context
        const jobContext = await jobContextService.buildContextFromQuery(originalQuery);
        if (jobContext) {
          systemPrompt += jobContext;
          console.log('[Memory] Added job context to prompt');
        }

        // If query relates to email, add pattern insights
        const emailKeywords = /\b(email|write|send|draft|compose|letter)\b/i;
        if (emailKeywords.test(originalQuery)) {
          // Detect email type and get insights
          const emailInsights = await emailPatternService.buildEmailInsights({
            state: selectedState || undefined,
          });
          if (emailInsights) {
            systemPrompt += emailInsights;
            console.log('[Memory] Added email pattern insights to prompt');
          }
        }
      } catch (memoryError) {
        console.warn('[Memory] Error loading memory context:', memoryError);
        // Continue without memory - don't block the main flow
      }

      let userPrompt = originalQuery;
      let sources: any[] = [];
      let learningContext = '';

      if (learningSummary) {
        const positives = learningSummary.positive_tags?.map((t: any) => t.tag).join(', ');
        const negatives = learningSummary.negative_tags?.map((t: any) => t.tag).join(', ');
        const wins = learningSummary.recent_wins?.map((w: any) => w.comment).filter(Boolean).slice(0, 3).join(' | ');
        const issues = learningSummary.recent_issues?.map((w: any) => w.comment).filter(Boolean).slice(0, 3).join(' | ');

        learningContext = `\n\nTEAM FEEDBACK SUMMARY (use to improve future answers):\n` +
          `- What works: ${positives || 'No strong signal yet'}\n` +
          `- Needs improvement: ${negatives || 'No strong signal yet'}\n` +
          `- Recent wins: ${wins || 'N/A'}\n` +
          `- Recent issues: ${issues || 'N/A'}\n`;
      }

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

      if (learningContext) {
        systemPrompt += learningContext;
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

      // MEMORY EXTRACTION: Extract and save memories from this exchange
      try {
        const recentExchange = [
          { sender: 'user' as const, text: originalQuery },
          { sender: 'bot' as const, text: responseText }
        ];
        const extractedMemories = memoryService.extractMemoriesFromConversation(
          recentExchange,
          currentSessionId
        );

        if (extractedMemories.length > 0) {
          await memoryService.saveMemories(extractedMemories, currentSessionId);
          console.log(`[Memory] Extracted and saved ${extractedMemories.length} memories`);
        }

        // Auto-link conversation to job if job was detected
        const detectedJob = await jobContextService.getDetectedJob(originalQuery);
        if (detectedJob) {
          await jobContextService.linkConversationToJob(
            currentSessionId,
            detectedJob.id,
            `Discussion about: ${originalQuery.substring(0, 100)}${originalQuery.length > 100 ? '...' : ''}`,
            [], // key decisions will be extracted later
            recentContext.damageDetails || []
          );
          console.log(`[Memory] Linked conversation to job ${detectedJob.jobNumber}`);
        }
      } catch (memoryError) {
        console.warn('[Memory] Error saving memories:', memoryError);
        // Don't block - memory is enhancement, not critical
      }
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

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const imageFiles = files.filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    const docFiles = files.filter(f => !imageFiles.includes(f));

    if (imageFiles.length > 0) {
      await handleImageFiles(imageFiles);
    }

    if (docFiles.length > 0) {
      for (const file of docFiles) {
        handleFileUpload({ target: { files: [file] } } as any);
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    await handleImageFiles(Array.from(files));

    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  const handleImageFiles = async (files: File[]) => {
    setIsAnalyzingImage(true);

    for (const file of files) {
      if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
        toast.warning('Invalid file type', `${file.name} is not an image file.`);
        continue;
      }

      try {
        let processedFile = file;
        if (/\.(heic|heif)$/i.test(file.name)) {
          try {
            const heic2any = (await import('heic2any')).default as any;
            const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
            processedFile = new File([blob as BlobPart], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
          } catch (err) {
            toast.error('HEIC conversion failed', 'Please convert to JPG/PNG first.');
            continue;
          }
        }

        const preview = await fileToDataURL(processedFile);
        toast.info('Analyzing image', 'Susan is analyzing the roof damage...');
        const assessment = await analyzeRoofImage(processedFile);

        const analysisText = `**Image Analysis: ${file.name}**\n\n${assessment.analysis.damageDetected ? '🔴 **DAMAGE DETECTED**' : '✅ **NO DAMAGE DETECTED**'}\n\n**Severity:** ${assessment.analysis.severity.toUpperCase()}\n**Urgency:** ${assessment.analysis.urgency.toUpperCase()}\n**Claim Viability:** ${assessment.analysis.claimViability.toUpperCase()}\n\n**Affected Area:** ${assessment.analysis.affectedArea}\n**Estimated Size:** ${assessment.analysis.estimatedSize}\n\n${assessment.analysis.damageType.length > 0 ? `**Damage Types:** ${assessment.analysis.damageType.join(', ')}\n\n` : ''}**For Adjuster:**\n${assessment.analysis.policyLanguage}\n\n**Key Insurance Arguments:**\n${assessment.analysis.insuranceArguments.map((arg, i) => `${i + 1}. ${arg}`).join('\n')}\n\n**Recommendations:**\n${assessment.analysis.recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')}${assessment.followUpQuestions.length > 0 ? `\n\n**Follow-up Questions:**\n${assessment.followUpQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : ''}`.trim();

        setUploadedFiles(prev => [...prev, { name: file.name, content: analysisText, type: 'image', preview, file: processedFile }]);
        setUserInput((prev) => prev ? `${prev}\n\n[Image: ${file.name}]` : `[Image: ${file.name}]\n\n${analysisText}`);
        toast.success('Image analyzed', `Susan has analyzed ${file.name}`);
      } catch (error) {
        toast.error('Image analysis failed', (error as Error).message);
      }
    }

    setIsAnalyzingImage(false);
  };

  const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  return (
    <div
      className="roof-er-content-area"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag-drop overlay */}
      {isDragging && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(220, 38, 38, 0.1)',
          border: '3px dashed var(--roof-red)',
          borderRadius: '12px',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none'
        }}>
          <div style={{
            background: 'var(--bg-elevated)',
            padding: '24px 48px',
            borderRadius: '12px',
            border: '2px solid var(--roof-red)',
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text-primary)'
          }}>
            <ImageIcon className="w-8 h-8 inline mr-3" style={{ color: 'var(--roof-red)' }} />
            Drop files here to upload
          </div>
        </div>
      )}

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
            {/* Susan Learning Panel */}
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(24,24,24,0.85), rgba(12,12,12,0.75))',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '14px',
                padding: '12px 14px',
                marginBottom: '14px',
                backdropFilter: 'blur(10px) saturate(120%)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                  Susan Learning
                </div>
                <button
                  onClick={() => setShowLearningPanel(prev => !prev)}
                  style={{
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: showLearningPanel ? 'rgba(220,38,38,0.18)' : 'rgba(255,255,255,0.04)',
                    color: 'var(--text-primary)',
                    borderRadius: '999px',
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    cursor: 'pointer'
                  }}
                >
                  {showLearningPanel ? 'Hide' : 'Show'}
                </button>
              </div>

              {showLearningPanel && (
                <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
                  {!learningSummary && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      No feedback yet. Use “Helpful” or “Needs work” on Susan replies to teach her.
                    </div>
                  )}

                  {learningSummary && (
                    <>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: '#86efac', fontWeight: 600 }}>Working</span>
                        {(learningSummary.positive_tags || []).slice(0, 4).map((tag: any) => (
                          <span
                            key={`pos-${tag.tag}`}
                            style={{
                              fontSize: '0.7rem',
                              color: '#bbf7d0',
                              border: '1px solid rgba(34,197,94,0.35)',
                              background: 'rgba(34,197,94,0.12)',
                              padding: '2px 8px',
                              borderRadius: '999px'
                            }}
                          >
                            {tag.tag} · {tag.count}
                          </span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: '#fecaca', fontWeight: 600 }}>Needs work</span>
                        {(learningSummary.negative_tags || []).slice(0, 4).map((tag: any) => (
                          <span
                            key={`neg-${tag.tag}`}
                            style={{
                              fontSize: '0.7rem',
                              color: '#fecaca',
                              border: '1px solid rgba(248,113,113,0.35)',
                              background: 'rgba(248,113,113,0.12)',
                              padding: '2px 8px',
                              borderRadius: '999px'
                            }}
                          >
                            {tag.tag} · {tag.count}
                          </span>
                        ))}
                      </div>
                      {(learningSummary.recent_wins?.length || learningSummary.recent_issues?.length) && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          <span style={{ color: '#e5e7eb' }}>Recent wins:</span>{' '}
                          {(learningSummary.recent_wins || []).map((w: any) => w.comment).filter(Boolean).slice(0, 2).join(' • ') || 'N/A'}
                          <span style={{ color: '#e5e7eb' }}>  |  Recent issues:</span>{' '}
                          {(learningSummary.recent_issues || []).map((w: any) => w.comment).filter(Boolean).slice(0, 2).join(' • ') || 'N/A'}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {messages.map((msg) => (
              <div key={msg.id} className={`roof-er-message ${msg.sender === 'user' ? 'user' : 'ai'}`}>
                <div className="roof-er-message-avatar">
                  {msg.sender === 'user' ? 'YOU' : 'S21'}
                </div>
                <div className="roof-er-message-content">
                  <div className="roof-er-message-text">
                    {msg.sender === 'bot' && msg.text.startsWith('EMAIL_GENERATED:') ? (
                      // Special rendering for generated emails
                      (() => {
                        const [header, ...bodyParts] = msg.text.split('\n\n');
                        const [, recipientType, tone] = header.split(':');
                        const emailBody = bodyParts.join('\n\n');
                        const emailData = generatedEmailData?.messageId === msg.id ? generatedEmailData : null;
                        const compliance = emailData?.compliance;

                        return (
                          <div style={{
                            background: 'var(--bg-elevated)',
                            border: '2px solid var(--roof-red)',
                            borderRadius: '12px',
                            padding: '20px',
                            marginTop: '8px'
                          }}>
                            {/* Email Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                              <Mail className="w-5 h-5" style={{ color: 'var(--roof-red)' }} />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>
                                  Generated Email
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                  To: {recipientType.charAt(0).toUpperCase() + recipientType.slice(1)} • Tone: {tone.charAt(0).toUpperCase() + tone.slice(1)}
                                </div>
                              </div>
                              {compliance && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {compliance.canSend ? (
                                    <ShieldCheck className="w-5 h-5" style={{ color: '#10b981' }} />
                                  ) : (
                                    <ShieldAlert className="w-5 h-5" style={{ color: '#f59e0b' }} />
                                  )}
                                  <span style={{ fontSize: '13px', fontWeight: 500, color: compliance.canSend ? '#10b981' : '#f59e0b' }}>
                                    {compliance.score}/100
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Compliance Warnings */}
                            {compliance && (compliance.violations.length > 0 || compliance.warnings.length > 0) && (
                              <div style={{ marginBottom: '16px', padding: '12px', background: compliance.violations.length > 0 ? '#fef2f2' : '#fffbeb', borderRadius: '8px', border: `1px solid ${compliance.violations.length > 0 ? '#fecaca' : '#fde68a'}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                  {compliance.violations.length > 0 ? (
                                    <XCircle className="w-4 h-4" style={{ color: '#dc2626' }} />
                                  ) : (
                                    <AlertTriangle className="w-4 h-4" style={{ color: '#d97706' }} />
                                  )}
                                  <span style={{ fontSize: '13px', fontWeight: 600, color: compliance.violations.length > 0 ? '#dc2626' : '#d97706' }}>
                                    {compliance.violations.length > 0 ? 'Critical Violations Found' : 'Compliance Warnings'}
                                  </span>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                  {compliance.summary}
                                </div>
                                {compliance.violations.length > 0 && (
                                  <div style={{ marginTop: '8px', fontSize: '12px' }}>
                                    {compliance.violations.slice(0, 2).map((v, i) => (
                                      <div key={i} style={{ marginTop: i > 0 ? '4px' : 0 }}>
                                        • Found: "<span style={{ fontWeight: 600 }}>{v.found}</span>" - {v.why}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Email Body */}
                            <div style={{
                              background: 'white',
                              padding: '16px',
                              borderRadius: '8px',
                              border: '1px solid var(--border-color)',
                              fontSize: '14px',
                              lineHeight: '1.6',
                              color: 'var(--text-primary)',
                              whiteSpace: 'pre-wrap',
                              fontFamily: 'system-ui, -apple-system, sans-serif'
                            }}>
                              {emailBody}
                            </div>

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
                              <button
                                onClick={() => handleCopyEmail(emailBody)}
                                style={{
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
                              >
                                <Copy className="w-4 h-4" />
                                Copy Email
                              </button>
                              {onStartEmail && (
                                <button
                                  onClick={() => handleOpenInEmailPanel(emailBody)}
                                  style={{
                                    padding: '10px 16px',
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    color: 'var(--text-primary)',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'all 0.2s'
                                  }}
                                >
                                  <Edit3 className="w-4 h-4" />
                                  Edit in Email Panel
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setMessageToShare(msg);
                                  setShareModalOpen(true);
                                }}
                                style={{
                                  padding: '10px 16px',
                                  background: 'var(--bg-elevated)',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: '8px',
                                  color: 'var(--text-primary)',
                                  fontSize: '14px',
                                  fontWeight: 500,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  transition: 'all 0.2s'
                                }}
                              >
                                <Users className="w-4 h-4" />
                                Share with Team
                              </button>
                            </div>
                          </div>
                        );
                      })()
                    ) : msg.sender === 'bot' ? (
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
                  {msg.sender === 'bot' && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                      {responseHasEmailContent(msg.text) && onStartEmail && (
                        <button
                          onClick={() => {
                            const emailContent = extractEmailContent(msg.text);
                            onStartEmail('custom', emailContent);
                          }}
                          className="roof-er-draft-email-btn"
                          style={{
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
                      <button
                        onClick={() => {
                          setMessageToShare(msg);
                          setShareModalOpen(true);
                        }}
                        style={{
                          padding: '10px 16px',
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--bg-secondary)';
                          e.currentTarget.style.borderColor = 'var(--roof-red)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'var(--bg-elevated)';
                          e.currentTarget.style.borderColor = 'var(--border-color)';
                        }}
                      >
                        <Users className="w-4 h-4" />
                        Share with Team
                      </button>
                      {!feedbackGiven[msg.id] && (
                        <>
                          <button
                            onClick={() => {
                              setFeedbackModal({ messageId: msg.id, rating: 1, responseExcerpt: msg.text.slice(0, 400) });
                              setFeedbackTags([]);
                              setFeedbackComment('');
                            }}
                            style={{
                              padding: '8px 12px',
                              background: 'rgba(34,197,94,0.12)',
                              border: '1px solid rgba(34,197,94,0.45)',
                              borderRadius: '999px',
                              color: '#bbf7d0',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                            Helpful
                          </button>
                          <button
                            onClick={() => {
                              setFeedbackModal({ messageId: msg.id, rating: -1, responseExcerpt: msg.text.slice(0, 400) });
                              setFeedbackTags([]);
                              setFeedbackComment('');
                            }}
                            style={{
                              padding: '8px 12px',
                              background: 'rgba(248,113,113,0.12)',
                              border: '1px solid rgba(248,113,113,0.45)',
                              borderRadius: '999px',
                              color: '#fecaca',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                            Needs work
                          </button>
                        </>
                      )}
                    </div>
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

      {feedbackModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
          onClick={() => setFeedbackModal(null)}
        >
          <div
            style={{
              width: '92%',
              maxWidth: '420px',
              background: 'var(--bg-elevated)',
              borderRadius: '16px',
              padding: '1.25rem',
              border: '1px solid var(--border-color)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
              {feedbackModal.rating === 1 ? 'What worked?' : 'What needs improvement?'}
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {(feedbackModal.rating === 1 ? positiveFeedbackTags : negativeFeedbackTags).map(tag => {
                const selected = feedbackTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => {
                      setFeedbackTags(prev => selected ? prev.filter(t => t !== tag) : [...prev, tag]);
                    }}
                    style={{
                      padding: '0.35rem 0.6rem',
                      borderRadius: '999px',
                      border: selected ? '1px solid var(--roof-red)' : '1px solid var(--border-color)',
                      background: selected ? 'rgba(220,38,38,0.18)' : 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            <textarea
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              placeholder="Optional notes..."
              rows={3}
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                marginBottom: '0.75rem',
                resize: 'none'
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setFeedbackModal(null)}
                style={{
                  flex: 1,
                  padding: '0.6rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'var(--text-secondary)'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitFeedback}
                style={{
                  flex: 1,
                  padding: '0.6rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  color: 'white'
                }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

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

        {/* Image Upload Input (Hidden) */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          onChange={handleImageUpload}
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
                  padding: file.preview ? '6px' : '6px 12px',
                  background: 'var(--roof-red)',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  position: 'relative'
                }}
              >
                {file.preview ? (
                  <img
                    src={file.preview}
                    alt={file.name}
                    style={{
                      width: '48px',
                      height: '48px',
                      objectFit: 'cover',
                      borderRadius: '4px'
                    }}
                  />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>
                    {file.name}
                  </span>
                  {file.type === 'image' && (
                    <span style={{ fontSize: '10px', opacity: 0.8 }}>
                      {isAnalyzingImage ? 'Analyzing...' : 'Analyzed'}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => removeUploadedFile(file.name)}
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: 'none',
                    color: 'white',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '4px'
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
              title="Upload Images (Auto-analyzes roof damage)"
              onClick={() => imageInputRef.current?.click()}
              disabled={isAnalyzingImage}
            >
              <ImageIcon className="w-5 h-5" />
            </button>
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
              className="roof-er-action-btn"
              title="Generate Email"
              onClick={() => setShowEmailDialog(true)}
              style={{
                background: showEmailDialog ? 'var(--roof-red)' : undefined,
                color: showEmailDialog ? 'white' : undefined
              }}
            >
              <Mail className="w-5 h-5" />
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

      {/* Email Generation Dialog */}
      {showEmailDialog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={() => setShowEmailDialog(false)}
        >
          <div
            style={{
              background: 'var(--bg-primary)',
              borderRadius: '16px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dialog Header */}
            <div style={{
              padding: '24px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Mail className="w-6 h-6" style={{ color: 'var(--roof-red)' }} />
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    Generate Email
                  </h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                    Susan will create a compliant, professional email
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowEmailDialog(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dialog Body */}
            <div style={{ padding: '24px' }}>
              {/* Recipient Type */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Recipient Type
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {[
                    { value: 'adjuster', label: 'Insurance Adjuster', icon: '👨‍💼' },
                    { value: 'homeowner', label: 'Homeowner', icon: '🏠' },
                    { value: 'insurance', label: 'Insurance Company', icon: '🏢' },
                    { value: 'custom', label: 'Other', icon: '📧' }
                  ].map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setEmailRecipientType(type.value as any)}
                      style={{
                        padding: '12px',
                        background: emailRecipientType === type.value ? 'var(--roof-red)' : 'var(--bg-elevated)',
                        border: `2px solid ${emailRecipientType === type.value ? 'var(--roof-red)' : 'var(--border-color)'}`,
                        borderRadius: '8px',
                        color: emailRecipientType === type.value ? 'white' : 'var(--text-primary)',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <span>{type.icon}</span>
                      <span>{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tone */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Tone
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { value: 'professional', label: 'Professional', icon: '💼' },
                    { value: 'formal', label: 'Formal', icon: '📋' },
                    { value: 'friendly', label: 'Friendly', icon: '😊' }
                  ].map((tone) => (
                    <button
                      key={tone.value}
                      onClick={() => setEmailTone(tone.value as any)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: emailTone === tone.value ? 'var(--roof-red)' : 'var(--bg-elevated)',
                        border: `2px solid ${emailTone === tone.value ? 'var(--roof-red)' : 'var(--border-color)'}`,
                        borderRadius: '8px',
                        color: emailTone === tone.value ? 'white' : 'var(--text-primary)',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <span>{tone.icon}</span>
                      <span>{tone.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Key Points */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Key Points to Include
                </label>
                <textarea
                  value={emailKeyPoints}
                  onChange={(e) => setEmailKeyPoints(e.target.value)}
                  placeholder="E.g., partial approval for hail damage, need full replacement, Maryland matching requirements..."
                  style={{
                    width: '100%',
                    minHeight: '120px',
                    padding: '12px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    color: 'var(--text-primary)',
                    resize: 'vertical'
                  }}
                />
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  Tip: Include claim details, damage type, and desired outcome
                </div>
              </div>

              {/* State Context Info */}
              {selectedState && (
                <div style={{
                  padding: '12px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  marginBottom: '20px'
                }}>
                  Email will use <span style={{ fontWeight: 600, color: 'var(--roof-red)' }}>{selectedState}</span> building codes and regulations
                </div>
              )}
            </div>

            {/* Dialog Footer */}
            <div style={{
              padding: '20px 24px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => {
                  setShowEmailDialog(false);
                  setEmailKeyPoints('');
                }}
                style={{
                  padding: '10px 20px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleEmailGeneration}
                disabled={isGeneratingEmail || !emailKeyPoints.trim()}
                style={{
                  padding: '10px 24px',
                  background: isGeneratingEmail || !emailKeyPoints.trim() ? 'var(--bg-secondary)' : 'linear-gradient(135deg, var(--roof-red) 0%, #b91c1c 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: isGeneratingEmail || !emailKeyPoints.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)'
                }}
              >
                {isGeneratingEmail ? (
                  <>
                    <Spinner />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Email
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => {
          setShareModalOpen(false);
          setMessageToShare(null);
        }}
        contentType="chat"
        originalQuery={
          messageToShare
            ? messages
                .slice(0, messages.indexOf(messageToShare))
                .reverse()
                .find(m => m.sender === 'user')?.text || ''
            : ''
        }
        aiResponse={messageToShare?.text || ''}
        sessionId={currentSessionId}
      />
    </div>
  );
};

export default ChatPanel;
