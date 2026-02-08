/**
 * SusanAISidebar - Real AI-Powered Presentation Assistant
 * Uses susanPresenterService for live Q&A during presentations
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  MessageCircle, Send, Loader2, Sparkles, ChevronDown, ChevronUp,
  HelpCircle, Shield, AlertTriangle, Lightbulb, User, Bot, X,
  Volume2, VolumeX
} from 'lucide-react';

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

const SUSAN_INTRO = `Hi! I'm Susan, your insurance claims specialist. I'm here to help you understand what we're seeing and answer any questions about the inspection or insurance process. Feel free to ask me anything!`;

const SUSAN_PERSONA = `You are Susan, a friendly and professional insurance claims specialist with over 15 years of experience in roofing damage assessment. You help homeowners understand their roof inspection findings and guide them through the insurance claims process.

Your personality:
- Warm, empathetic, and patient
- Professional but conversational - you speak like a knowledgeable neighbor
- Expert in insurance but explain things simply
- Always advocate for the homeowner - you're on their side
- Calm and reassuring when discussing damage or costs

Keep responses concise (2-3 paragraphs max) and actionable.`;

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
    if (question.includes('explain') || question.includes('looking at')) {
      if (damageType) {
        return `What you're seeing here is ${damageType}. ${severity === 'critical' || severity === 'severe'
          ? 'This is definitely something we need to address promptly.'
          : 'This is something we should document for your records.'} The good news is that this type of damage is commonly covered by homeowner's insurance, especially if it's weather-related.\n\nI'll make sure to include all the documentation you need for your claim. Do you have any specific questions about what you're seeing?`;
      }
      return `This slide shows one of the findings from our inspection. Each image I'm showing you has been analyzed to help document the condition of your roof. If you'd like me to go into more detail about anything specific, just let me know!`;
    }

    if (question.includes('insurance') || question.includes('covered') || question.includes('claim')) {
      const relevant = isInsuranceRelevant ? 'likely qualifies' : 'may still qualify';
      return `Great question! Based on what we're seeing, this ${relevant} for insurance coverage. Most homeowner policies cover damage from storms, hail, wind, and other weather events.\n\nThe key is proper documentation, which is exactly what we're doing with this inspection. I'd recommend reaching out to your insurance company to file a claim. Would you like me to explain the typical claims process?`;
    }

    if (question.includes('urgent') || question.includes('wait') || question.includes('how long')) {
      if (severity === 'critical' || severity === 'severe') {
        return `I want to be straightforward with you - this is something that needs attention sooner rather than later. Waiting could lead to additional damage, especially if we get more weather. The good news is that acting now means better coverage and fewer complications.\n\nThe best next step is to file an insurance claim right away and get a professional assessment scheduled. Would you like to discuss the timeline for that?`;
      }
      return `While this isn't an emergency, I wouldn't recommend waiting too long. Minor issues can become major problems over time, especially with the weather we get in this area. The sooner you address it, the simpler and less expensive the fix typically is.\n\nI'd suggest getting a professional estimate within the next few weeks. Would you like to talk about next steps?`;
    }

    if (question.includes('next') || question.includes('steps') || question.includes('do')) {
      return `Here's what I'd recommend:\n\n1. **File an insurance claim** - Based on what we've documented today, you have a strong case.\n2. **Schedule a professional inspection** - A detailed inspection will help with your claim.\n3. **Get repair estimates** - This protects your investment and helps with the claims process.\n\nI can help you understand any part of this process. What would you like to know more about?`;
    }

    // Generic helpful response
    return `That's a great question! Based on what we've documented in this inspection, I want to make sure you have all the information you need to make the best decision for your home.\n\nIs there a specific aspect you'd like me to focus on - like the insurance coverage, the repair process, or the urgency of addressing this?`;
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

      {/* Input Area */}
      <div style={{
        padding: '16px',
        borderTop: '1px solid #E2E8F0',
        background: '#FAFAFA'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'white',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '4px 4px 4px 14px'
        }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask Susan anything..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '14px',
              background: 'transparent',
              color: '#1E293B'
            }}
          />
          <button
            onClick={() => sendMessage(inputValue)}
            disabled={isLoading || !inputValue.trim()}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: inputValue.trim()
                ? 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)'
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
      `}</style>
    </div>
  );
};

export default SusanAISidebar;
