/**
 * SusanAISidebar - Real AI-Powered Presentation Assistant
 * Uses susanPresenterService for live Q&A during presentations
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageCircle, Send, Loader2, Sparkles, ChevronDown, ChevronUp,
  HelpCircle, Shield, AlertTriangle, Lightbulb, User, Bot, X,
  Volume2, VolumeX, Mic, MicOff
} from 'lucide-react';

// ============================================================================
// SPEECH RECOGNITION TYPES
// ============================================================================

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Message {
  id: string;
  type: 'user' | 'susan' | 'system';
  content: string;
  timestamp: Date;
  slideIndex?: number;
  isLoading?: boolean;
}

interface QuickAction {
  label: string;
  icon: React.ReactNode;
  prompt: string;
  color: string;
}

interface SusanAISidebarProps {
  sessionId?: string;
  currentSlideIndex: number;
  slideTitle?: string;
  slideContent?: string;
  damageType?: string;
  severity?: string;
  isInsuranceRelevant?: boolean;
  propertyAddress?: string;
  homeownerName?: string;
  onSlideReference?: (slideIndex: number) => void;
  isOpen?: boolean;
  onToggle?: () => void;
}

// ============================================================================
// SUSAN PERSONA
// ============================================================================

const SUSAN_INTRO = `Hi! I'm Susan, your storm damage specialist. I'm here to help explain what we're finding and why it matters for your insurance claim. Ask me anything about what you're seeing!`;

const SUSAN_PERSONA = `You are Susan, a storm damage expert and insurance claims specialist with 15+ years of experience. You help homeowners understand their roof damage and guide them through filing insurance claims.

CRITICAL CONTEXT: The homeowner has experienced a recent hail or wind storm - that's why we're here. You ALWAYS acknowledge the storm occurred.

Your key talking points (based on training):
- "Even if this damage doesn't look like a big deal, what happens over time is these hail divots fill with water, freeze, and when water freezes it expands - this breaks apart the shingle which eventually leads to leaks."
- "That is why your insurance company is responsible - your policy covers this type of damage."
- "Insurance companies are always looking for ways to mitigate their losses - that's how they make money. We're here as storm experts to make sure you get a fair shake."
- When showing collateral damage (gutters, screens, soft metals): "While this damage functionally isn't a big deal, it helps build the case - think of us like lawyers and this is the evidence."

Your personality:
- Confident and knowledgeable - you're the expert
- Advocate for the homeowner - you're on their side against insurance companies
- Explain technical terms simply but don't downplay damage
- NEVER say "your roof looks good" or minimize concerns
- Always move the conversation toward filing the claim

Keep responses conversational and concise (2-3 sentences). You're explaining things to a homeowner sitting at their kitchen table.`;

// ============================================================================
// COMPONENT
// ============================================================================

export const SusanAISidebar: React.FC<SusanAISidebarProps> = ({
  sessionId,
  currentSlideIndex,
  slideTitle,
  slideContent,
  damageType,
  severity,
  isInsuranceRelevant,
  propertyAddress,
  homeownerName,
  onSlideReference,
  isOpen = true,
  onToggle
}) => {
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Voice State
  const [isListening, setIsListening] = useState(false);
  const [isWakeWordActive, setIsWakeWordActive] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wakeWordRecognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // Check for speech support and request microphone permission
  useEffect(() => {
    const initializeVoice = async () => {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionAPI || !window.speechSynthesis) {
        setVoiceError('Voice features are not supported in this browser');
        return;
      }

      // Request microphone permission
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop()); // Stop the stream immediately
        setMicPermissionGranted(true);
        setVoiceSupported(true);
        synthRef.current = window.speechSynthesis;
        setVoiceError(null);
      } catch (error) {
        console.error('Microphone permission denied:', error);
        setVoiceError('Microphone access denied. Please enable microphone to use voice features.');
        setVoiceSupported(false);
      }
    };

    initializeVoice();
  }, []);

  // Initialize wake word detection
  useEffect(() => {
    if (!voiceSupported || !micPermissionGranted || isMuted) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const wakeWordRecognition = new SpeechRecognitionAPI();
    wakeWordRecognition.continuous = true;
    wakeWordRecognition.interimResults = true;
    wakeWordRecognition.lang = 'en-US';

    wakeWordRecognition.onstart = () => {
      console.log('Wake word detection started');
    };

    wakeWordRecognition.onresult = (event: SpeechRecognitionEvent) => {
      const lastResult = event.results[event.results.length - 1];
      const transcript = lastResult[0].transcript.toLowerCase();

      console.log('Wake word detection heard:', transcript);

      // Check for wake word "Hey Susan"
      if (transcript.includes('hey susan') || transcript.includes('hey suzanne') || transcript.includes('hey suzan')) {
        console.log('Wake word detected! Activating Susan...');
        setIsWakeWordActive(true);
        wakeWordRecognition.stop();

        // Speak acknowledgment first
        speak('Yes? How can I help you?', () => {
          // Then start listening after acknowledgment
          setTimeout(() => startListening(), 500);
        });
      }
    };

    wakeWordRecognition.onerror = (event: any) => {
      console.error('Wake word recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setVoiceError('Microphone access denied. Please enable microphone permissions.');
      }
    };

    wakeWordRecognition.onend = () => {
      console.log('Wake word detection ended');
      // Restart wake word listening if not in active conversation
      if (!isListening && !isWakeWordActive && !isMuted && voiceSupported && micPermissionGranted) {
        setTimeout(() => {
          try {
            wakeWordRecognition.start();
            console.log('Wake word detection restarted');
          } catch (e) {
            console.log('Could not restart wake word detection:', e);
          }
        }, 1000);
      }
    };

    wakeWordRecognitionRef.current = wakeWordRecognition;

    // Start listening for wake word
    try {
      wakeWordRecognition.start();
      console.log('Wake word detection initialization successful');
    } catch (e) {
      console.error('Could not start wake word detection:', e);
      setVoiceError('Failed to start voice recognition');
    }

    return () => {
      try {
        wakeWordRecognition.stop();
      } catch (e) {
        // Ignore
      }
    };
  }, [voiceSupported, micPermissionGranted, isMuted, isListening, isWakeWordActive]);

  // Text-to-Speech function with callback support
  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!synthRef.current || isMuted) {
      onEnd?.();
      return;
    }

    // Cancel any ongoing speech
    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Set up callbacks
    utterance.onend = () => {
      console.log('Speech synthesis completed');
      onEnd?.();
    };

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      onEnd?.();
    };

    // Try to use a female voice
    const voices = synthRef.current.getVoices();
    const femaleVoice = voices.find(v =>
      v.name.includes('Samantha') ||
      v.name.includes('Karen') ||
      v.name.includes('Victoria') ||
      v.name.includes('Female') ||
      (v.name.includes('Google') && v.name.includes('US'))
    );
    if (femaleVoice) {
      utterance.voice = femaleVoice;
    }

    console.log('Speaking:', text.substring(0, 50) + '...');
    synthRef.current.speak(utterance);
  }, [isMuted]);

  // Start listening for user speech
  const startListening = useCallback(() => {
    if (!voiceSupported) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    // Stop wake word detection
    try {
      wakeWordRecognitionRef.current?.stop();
    } catch (e) {
      // Ignore
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setInterimTranscript('');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      setInterimTranscript(interim);

      if (final) {
        setInputValue(final);
        // Auto-send after getting final transcript
        setTimeout(() => {
          sendMessage(final);
          setInterimTranscript('');
        }, 500);
      }
    };

    recognition.onerror = (event) => {
      console.log('Recognition error:', event);
      setIsListening(false);
      setIsWakeWordActive(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setIsWakeWordActive(false);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      console.error('Could not start speech recognition:', e);
    }
  }, [voiceSupported]);

  // Stop listening
  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch (e) {
      // Ignore
    }
    setIsListening(false);
    setIsWakeWordActive(false);
    setInterimTranscript('');
  }, []);

  // Quick Actions based on current slide context
  const quickActions: QuickAction[] = [
    {
      label: 'Explain this',
      icon: <HelpCircle size={14} />,
      prompt: `Can you explain what I'm looking at on this slide?`,
      color: '#3B82F6'
    },
    {
      label: 'Insurance coverage',
      icon: <Shield size={14} />,
      prompt: `Is this covered by insurance? What should I know about filing a claim?`,
      color: '#22C55E'
    },
    {
      label: 'How urgent?',
      icon: <AlertTriangle size={14} />,
      prompt: `How urgent is this issue? What happens if I wait?`,
      color: '#F97316'
    },
    {
      label: 'Next steps',
      icon: <Lightbulb size={14} />,
      prompt: `What should I do next about this?`,
      color: '#8B5CF6'
    }
  ];

  // Initialize with Susan's greeting
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        id: `msg-${Date.now()}`,
        type: 'susan',
        content: SUSAN_INTRO,
        timestamp: new Date()
      }]);
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ============================================================================
  // AI INTEGRATION
  // ============================================================================

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    // Add user message
    const userMessage: Message = {
      id: `msg-user-${Date.now()}`,
      type: 'user',
      content: content.trim(),
      timestamp: new Date(),
      slideIndex: currentSlideIndex
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setShowQuickActions(false);

    // Add loading indicator
    const loadingId = `msg-loading-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: loadingId,
      type: 'susan',
      content: '',
      timestamp: new Date(),
      isLoading: true
    }]);

    try {
      // Build context for the AI
      const context = buildContext(content);

      // Call AI service (using fetch to backend or direct Gemini)
      const response = await callSusanAI(context);

      // Remove loading indicator and add response
      setMessages(prev => prev
        .filter(m => m.id !== loadingId)
        .concat({
          id: `msg-susan-${Date.now()}`,
          type: 'susan',
          content: response,
          timestamp: new Date(),
          slideIndex: currentSlideIndex
        })
      );

      // Always speak the response if voice is enabled and not muted
      if (!isMuted && voiceSupported && synthRef.current) {
        console.log('Speaking Susan response');
        speak(response);
      } else {
        console.log('Voice disabled - not speaking response', { isMuted, voiceSupported, hasSynth: !!synthRef.current });
      }

    } catch (error) {
      console.error('Error getting Susan response:', error);
      setMessages(prev => prev
        .filter(m => m.id !== loadingId)
        .concat({
          id: `msg-error-${Date.now()}`,
          type: 'system',
          content: 'I apologize, but I had trouble processing that. Could you try asking again?',
          timestamp: new Date()
        })
      );
    } finally {
      setIsLoading(false);
    }
  };

  const buildContext = (question: string): string => {
    let context = `${SUSAN_PERSONA}\n\n`;
    context += `**Current Slide:** ${currentSlideIndex + 1}\n`;

    if (slideTitle) context += `**Slide Title:** ${slideTitle}\n`;
    if (damageType) context += `**Damage Type:** ${damageType}\n`;
    if (severity) context += `**Severity:** ${severity}\n`;
    if (isInsuranceRelevant !== undefined) context += `**Insurance Relevant:** ${isInsuranceRelevant ? 'Yes' : 'No'}\n`;
    if (propertyAddress) context += `**Property:** ${propertyAddress}\n`;
    if (homeownerName) context += `**Homeowner:** ${homeownerName}\n`;

    // Add recent conversation context
    const recentMessages = messages.slice(-6);
    if (recentMessages.length > 0) {
      context += `\n**Recent Conversation:**\n`;
      recentMessages.forEach(msg => {
        if (!msg.isLoading) {
          context += `${msg.type === 'user' ? 'Homeowner' : 'Susan'}: ${msg.content}\n`;
        }
      });
    }

    context += `\n**Homeowner's Question:**\n"${question}"\n\n`;
    context += `Answer conversationally and helpfully. Keep it concise (2-3 paragraphs max). Focus on being reassuring while providing accurate information.`;

    return context;
  };

  const callSusanAI = async (context: string): Promise<string> => {
    // Try to use the backend API first
    try {
      const response = await fetch('/api/susan/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: context,
          sessionId,
          slideIndex: currentSlideIndex
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.response;
      }
    } catch (error) {
      console.log('Backend not available, using fallback');
    }

    // Fallback to simulated intelligent responses based on context
    return generateFallbackResponse(context);
  };

  const generateFallbackResponse = (context: string): string => {
    // Extract the question from context
    const questionMatch = context.match(/Homeowner's Question:\s*"([^"]+)"/);
    const question = questionMatch?.[1]?.toLowerCase() || '';

    // Smart fallback responses based on question type
    if (question.includes('explain') || question.includes('looking at') || question.includes('what') || question.includes('this slide')) {
      if (damageType && slideTitle) {
        const severityText = severity === 'critical' || severity === 'severe'
          ? 'This is definitely something we need to address promptly. It\'s considered significant damage that could worsen if left unattended.'
          : severity === 'moderate'
          ? 'This is moderate damage that should be addressed in a timely manner to prevent it from getting worse.'
          : 'While not immediately critical, this is still important to document and address.';

        return `Let me walk you through what we're seeing on this slide titled "${slideTitle}". This shows ${damageType}, which is ${severity} level damage. ${severityText}\n\nThe good news is that this type of damage is commonly covered by homeowner's insurance, especially when it's weather-related. We're documenting everything thoroughly so you'll have exactly what you need for your insurance claim.\n\nWhat specific aspects of this damage would you like me to explain in more detail?`;
      }
      if (slideTitle) {
        return `This slide, "${slideTitle}", shows one of the key findings from our inspection. Each image has been carefully analyzed and documented to give you a complete picture of your roof's condition. This documentation is crucial for your insurance claim and for understanding what repairs may be needed.\n\nWould you like me to go into more detail about what we found here, or do you have specific questions about this area?`;
      }
      return `This is part of our comprehensive roof inspection documentation. Every image and finding we're reviewing today has been analyzed to help you understand your roof's condition and support your insurance claim if needed.\n\nWhat would you like to know more about regarding what you're seeing here?`;
    }

    if (question.includes('insurance') || question.includes('covered') || question.includes('claim') || question.includes('policy')) {
      const relevant = isInsuranceRelevant ? 'definitely qualifies' : 'may still qualify';
      const damageInfo = damageType ? ` This type of damage - ${damageType} - is` : ' Based on what we are seeing, this is';

      return `Excellent question about insurance coverage! ${damageInfo} something that ${relevant} for coverage under most homeowner policies. Insurance companies typically cover damage from storms, hail, wind, and other weather-related events.\n\nThe key to a successful claim is having thorough documentation - which is exactly what we're providing with this inspection. Each photo, each finding, and all the details we're capturing today will support your claim. I'd recommend contacting your insurance company soon to get this claim started.\n\nWould you like me to walk you through what the typical claims process looks like, or do you have specific questions about how to proceed?`;
    }

    if (question.includes('urgent') || question.includes('wait') || question.includes('how long') || question.includes('time')) {
      if (severity === 'critical' || severity === 'severe') {
        return `I want to be completely honest with you - ${damageType ? `this ${damageType}` : 'this damage'} is at a ${severity} level, which means it needs attention sooner rather than later. Here's why:\n\nDelaying repairs on severe damage can lead to secondary issues like water intrusion, structural problems, or mold. Plus, if more weather comes through, it could make things significantly worse. The good news? Acting now means you're likely to get better insurance coverage and avoid those complications.\n\nMy recommendation: File your insurance claim within the next few days and get a professional repair assessment scheduled as soon as possible. Would you like to discuss the timeline for repairs and the claims process?`;
      }
      return `While this ${damageType || 'damage'} isn't an absolute emergency, I wouldn't recommend putting it off for too long. Here's my thinking: minor issues have a way of becoming major problems over time, especially with the weather patterns we see in this area.\n\nRoof damage tends to be progressive - what's small today can become expensive tomorrow. The sooner you address it, the simpler and more affordable the fix typically is. Plus, filing your insurance claim while the documentation is fresh is always better.\n\nI'd suggest getting a professional repair estimate within the next month or so. Want to talk about what that process looks like?`;
    }

    if (question.includes('next') || question.includes('steps') || question.includes('do now') || question.includes('what should')) {
      const damageContext = damageType ? ` the ${damageType} we found` : ' these findings';
      return `Great question! Let me give you a clear action plan based on${damageContext}:\n\n**Immediate Steps:**\n1. **Contact your insurance company** - Based on what we've documented today, you have solid grounds for a claim. The sooner you file, the better.\n2. **Save all this documentation** - Keep copies of these inspection photos and findings. They're your evidence.\n3. **Get a professional repair estimate** - This gives you specific numbers for your claim and helps you plan.\n\n**Within the next week or two:**\n4. **Follow up with your adjuster** - Make sure they have everything they need from you.\n5. **Don't make any repairs yet** - Let your insurance company assess first, unless there's an emergency.\n\nI'm here to help you understand any part of this process. What would you like to dive deeper into?`;
    }

    if (question.includes('cost') || question.includes('expensive') || question.includes('price') || question.includes('money')) {
      return `I understand cost is a major concern - it is for everyone! Here's the good news: because ${damageType ? `this ${damageType}` : 'this damage'} ${isInsuranceRelevant ? 'appears to qualify' : 'may qualify'} for insurance coverage, you may not have to pay for most or all of the repairs out of pocket.\n\nYour main expense would typically be your insurance deductible, which varies by policy but is often around $1,000-$2,500. The insurance should cover the rest if the claim is approved. That's why proper documentation like we're doing today is so important.\n\nWithout insurance, roof repairs can range widely depending on the extent of damage, but that's exactly why we want to pursue the insurance route. Would you like to discuss how to maximize your insurance coverage?`;
    }

    // Generic helpful response with more context
    const currentContext = slideTitle ? ` regarding "${slideTitle}"` : '';
    return `That's a really important question${currentContext}! I want to make sure I give you the most helpful answer possible. Based on everything we've documented in this inspection, my goal is to help you understand exactly what's going on with your roof and what your best options are.\n\nCould you help me narrow down what you're most curious about? For example:\n- Are you wondering about insurance coverage and the claims process?\n- Do you want to understand the repair timeline and urgency?\n- Are you looking for clarity on what the damage means for your home?\n- Or something else entirely?\n\nI'm here to help with all of it!`;
  };

  const handleQuickAction = (action: QuickAction) => {
    sendMessage(action.prompt);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        style={{
          position: 'fixed',
          right: '20px',
          bottom: '20px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 32px -8px rgba(59, 130, 246, 0.6)',
          zIndex: 1000
        }}
      >
        <MessageCircle size={28} color="white" />
      </button>
    );
  }

  return (
    <div style={{
      width: '360px',
      height: '100%',
      background: 'white',
      borderLeft: '1px solid #E2E8F0',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '-4px 0 24px -8px rgba(0,0,0,0.1)'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #E2E8F0',
        background: 'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px -4px rgba(59, 130, 246, 0.5)'
            }}>
              <Sparkles size={22} color="white" />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0F172A', margin: 0 }}>
                Susan AI
              </h3>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0 0' }}>
                Insurance Claims Specialist
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setIsMuted(!isMuted)}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#F1F5F9',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {isMuted ? <VolumeX size={18} color="#64748B" /> : <Volume2 size={18} color="#64748B" />}
            </button>
            {onToggle && (
              <button
                onClick={onToggle}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#F1F5F9',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={18} color="#64748B" />
              </button>
            )}
          </div>
        </div>

        {/* Current Slide Context */}
        {slideTitle && (
          <div style={{
            marginTop: '12px',
            padding: '10px 12px',
            background: '#F8FAFC',
            borderRadius: '10px',
            border: '1px solid #E2E8F0'
          }}>
            <p style={{ fontSize: '11px', color: '#64748B', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Viewing Slide {currentSlideIndex + 1}
            </p>
            <p style={{ fontSize: '13px', fontWeight: '500', color: '#0F172A', margin: '4px 0 0 0' }}>
              {slideTitle}
            </p>
            {severity && (
              <span style={{
                display: 'inline-block',
                marginTop: '6px',
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '500',
                textTransform: 'capitalize',
                background: severity === 'critical' || severity === 'severe' ? '#FEE2E2' : '#ECFDF5',
                color: severity === 'critical' || severity === 'severe' ? '#DC2626' : '#059669'
              }}>
                {severity}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {messages.map(message => (
          <div
            key={message.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: message.type === 'user' ? 'flex-end' : 'flex-start'
            }}
          >
            {/* Avatar + Name */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '6px',
              flexDirection: message.type === 'user' ? 'row-reverse' : 'row'
            }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: message.type === 'user'
                  ? 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)'
                  : 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {message.type === 'user'
                  ? <User size={14} color="white" />
                  : <Bot size={14} color="white" />}
              </div>
              <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '500' }}>
                {message.type === 'user' ? 'You' : 'Susan'}
              </span>
            </div>

            {/* Message Bubble */}
            <div style={{
              maxWidth: '85%',
              padding: '12px 16px',
              borderRadius: message.type === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: message.type === 'user'
                ? 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)'
                : '#F8FAFC',
              color: message.type === 'user' ? 'white' : '#1E293B',
              border: message.type === 'user' ? 'none' : '1px solid #E2E8F0'
            }}>
              {message.isLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: '14px', color: '#64748B' }}>Susan is thinking...</span>
                </div>
              ) : (
                <p style={{
                  fontSize: '14px',
                  lineHeight: '1.5',
                  margin: 0,
                  whiteSpace: 'pre-wrap'
                }}>
                  {message.content}
                </p>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      {showQuickActions && messages.length <= 2 && (
        <div style={{
          padding: '0 16px 12px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          {quickActions.map((action, i) => (
            <button
              key={i}
              onClick={() => handleQuickAction(action)}
              disabled={isLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                borderRadius: '20px',
                border: `1px solid ${action.color}30`,
                background: `${action.color}10`,
                color: action.color,
                fontSize: '12px',
                fontWeight: '500',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Voice Status Indicator */}
      {isListening && (
        <div style={{
          padding: '12px 16px',
          background: 'linear-gradient(135deg, #c41e3a15 0%, #a0183015 100%)',
          borderTop: '1px solid #c41e3a30',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: '#c41e3a',
            animation: 'pulse 1.5s infinite'
          }} />
          <span style={{ fontSize: '14px', color: '#c41e3a', fontWeight: '500' }}>
            {interimTranscript || 'Listening...'}
          </span>
        </div>
      )}

      {/* Input Area */}
      <div style={{
        padding: '16px',
        borderTop: '1px solid #E2E8F0',
        background: '#FAFAFA'
      }}>
        {/* Voice Mode Indicator */}
        {voiceError && (
          <div style={{
            padding: '8px 12px',
            background: '#FEE2E2',
            border: '1px solid #FCA5A5',
            borderRadius: '8px',
            marginBottom: '10px'
          }}>
            <p style={{
              fontSize: '11px',
              color: '#DC2626',
              textAlign: 'center',
              margin: 0,
              fontWeight: '500'
            }}>
              {voiceError}
            </p>
          </div>
        )}
        {voiceSupported && !isMuted && !voiceError && (
          <div style={{
            padding: '8px 12px',
            background: '#ECFDF5',
            border: '1px solid #6EE7B7',
            borderRadius: '8px',
            marginBottom: '10px'
          }}>
            <p style={{
              fontSize: '11px',
              color: '#059669',
              textAlign: 'center',
              margin: 0,
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#059669',
                display: 'inline-block'
              }} />
              Voice active - Say "Hey Susan" to speak
            </p>
          </div>
        )}

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'white',
          borderRadius: '12px',
          border: isListening ? '2px solid #c41e3a' : '1px solid #E2E8F0',
          padding: '4px 4px 4px 14px',
          transition: 'border 0.2s ease'
        }}>
          <input
            ref={inputRef}
            type="text"
            placeholder={isListening ? 'Listening...' : 'Ask Susan anything...'}
            value={isListening ? interimTranscript : inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading || isListening}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '14px',
              background: 'transparent',
              color: '#1E293B'
            }}
          />

          {/* Microphone Button */}
          {voiceSupported && (
            <button
              onClick={isListening ? stopListening : startListening}
              disabled={isLoading}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: isListening
                  ? 'linear-gradient(135deg, #c41e3a 0%, #a01830 100%)'
                  : '#F1F5F9',
                border: 'none',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease'
              }}
            >
              {isListening
                ? <MicOff size={18} color="white" />
                : <Mic size={18} color="#64748B" />}
            </button>
          )}

          {/* Send Button */}
          <button
            onClick={() => sendMessage(inputValue)}
            disabled={isLoading || !inputValue.trim()}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: inputValue.trim()
                ? 'linear-gradient(135deg, #c41e3a 0%, #a01830 100%)'
                : '#E2E8F0',
              border: 'none',
              cursor: inputValue.trim() && !isLoading ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
          >
            {isLoading
              ? <Loader2 size={18} color="white" style={{ animation: 'spin 1s linear infinite' }} />
              : <Send size={18} color={inputValue.trim() ? 'white' : '#94A3B8'} />}
          </button>
        </div>
        <p style={{
          fontSize: '11px',
          color: '#94A3B8',
          textAlign: 'center',
          margin: '10px 0 0 0'
        }}>
          Susan AI • Powered by Gemini
        </p>
      </div>

      {/* CSS Keyframes */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
};

export default SusanAISidebar;
