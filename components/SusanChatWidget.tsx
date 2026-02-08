/**
 * SusanChatWidget - Floating AI assistant for presentations
 * Context-aware chat that can explain current slide damage
 */

import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Minimize2, Maximize2, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import type { PhotoAnalysis } from './InspectionUploader';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface PresentationSlide {
  id: string;
  type: 'title' | 'photo' | 'summary' | 'recommendations';
  photo?: string;
  analysis?: PhotoAnalysis;
  title?: string;
  content?: string;
  order: number;
}

interface SusanChatWidgetProps {
  currentSlide?: PresentationSlide;
  slideNumber?: number;
  totalSlides?: number;
}

export const SusanChatWidget: React.FC<SusanChatWidgetProps> = ({
  currentSlide,
  slideNumber,
  totalSlides
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hi! I'm Susan, your AI roofing assistant. I can help explain the damage shown in this inspection or answer any questions about the findings.",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Generate context-aware greeting when slide changes
  useEffect(() => {
    if (!currentSlide || messages.length > 1) return;

    if (currentSlide.type === 'photo' && currentSlide.analysis) {
      const contextMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `I'm looking at slide ${slideNumber}: "${currentSlide.title}". This shows ${currentSlide.analysis.severity} ${currentSlide.analysis.damageType.toLowerCase()} at ${currentSlide.analysis.location}. Ask me anything about this damage!`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, contextMessage]);
    }
  }, [currentSlide?.id]);

  // Handle send message
  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Generate context-aware response
    const response = await generateResponse(input, currentSlide);

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: response,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, assistantMessage]);
    setIsTyping(false);
  };

  // Generate AI response based on context
  const generateResponse = async (
    question: string,
    slide?: PresentationSlide
  ): Promise<string> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    const lowerQuestion = question.toLowerCase();

    // Context-aware responses
    if (slide?.type === 'photo' && slide.analysis) {
      const analysis = slide.analysis;

      if (lowerQuestion.includes('cost') || lowerQuestion.includes('price') || lowerQuestion.includes('repair')) {
        return `The estimated repair cost for this ${analysis.damageType.toLowerCase()} is ${analysis.estimatedRepairCost || 'being calculated'}. This is a ${analysis.severity} issue with ${analysis.urgency} urgency. ${analysis.insuranceRelevant ? 'This damage is typically covered by insurance claims.' : ''}`;
      }

      if (lowerQuestion.includes('insurance') || lowerQuestion.includes('claim')) {
        if (analysis.insuranceRelevant) {
          return `Yes, this ${analysis.damageType.toLowerCase()} is insurance-relevant. Document this with photos and our detailed analysis. Key points for your claim: ${analysis.severity} severity at ${analysis.location}, with recommended repairs: ${analysis.recommendations[0] || 'professional assessment required'}.`;
        } else {
          return `This damage may not be covered by standard insurance policies. It's classified as ${analysis.severity} wear and tear. However, I recommend consulting with your insurance adjuster to confirm coverage.`;
        }
      }

      if (lowerQuestion.includes('urgent') || lowerQuestion.includes('priority') || lowerQuestion.includes('fix')) {
        const urgencyMap = {
          critical: 'Immediate action required! This is a critical issue that poses safety risks and could lead to further damage if not addressed within 24-48 hours.',
          high: 'High priority - should be addressed within 1-2 weeks to prevent escalation and additional damage.',
          medium: 'Moderate priority - plan repairs within 1-2 months. While not immediately dangerous, delaying could increase repair costs.',
          low: 'Low priority - can be scheduled for routine maintenance. Monitor the condition but no immediate action needed.'
        };
        return urgencyMap[analysis.urgency] || 'Professional assessment recommended to determine timeline.';
      }

      if (lowerQuestion.includes('cause') || lowerQuestion.includes('why') || lowerQuestion.includes('how')) {
        const causes: Record<string, string> = {
          'hail damage': 'Hail damage occurs when ice pellets impact the roof at high velocity, causing dents, cracks, or complete penetration of roofing materials. This compromises the waterproof barrier.',
          'wind damage': 'High winds can lift shingles, tear off materials, or drive debris into the roof. This creates entry points for water and weakens structural integrity.',
          'shingle damage': 'Shingle damage can result from age, weathering, improper installation, or environmental factors like UV exposure and thermal cycling.',
          'flashing': 'Flashing issues typically arise from improper installation, deterioration of sealants, or thermal expansion/contraction that breaks seals around roof penetrations.',
          'wear': 'Normal wear and tear from UV exposure, temperature cycles, moisture, and age causes gradual degradation of roofing materials.'
        };

        for (const [key, value] of Object.entries(causes)) {
          if (analysis.damageType.toLowerCase().includes(key)) {
            return value;
          }
        }

        return `The ${analysis.damageType.toLowerCase()} shown here is located at ${analysis.location}. ${analysis.description} Our recommendation: ${analysis.recommendations[0] || 'professional inspection'}.`;
      }

      if (lowerQuestion.includes('recommend') || lowerQuestion.includes('what should') || lowerQuestion.includes('next step')) {
        return `For this ${analysis.damageType.toLowerCase()}, I recommend:\n\n${analysis.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\nGiven the ${analysis.severity} severity and ${analysis.urgency} urgency, ${analysis.urgency === 'critical' || analysis.urgency === 'high' ? 'immediate professional attention is advised' : 'you should plan repairs accordingly'}.`;
      }

      // Default context response
      return `This slide shows ${analysis.severity} ${analysis.damageType.toLowerCase()} at ${analysis.location}. ${analysis.description} ${analysis.insuranceRelevant ? 'This is insurance-relevant.' : ''} Ask me about costs, insurance coverage, urgency, or repair recommendations!`;
    }

    // General responses
    if (lowerQuestion.includes('hello') || lowerQuestion.includes('hi')) {
      return "Hello! I'm Susan, your AI roofing expert. I'm here to help explain the inspection findings and answer any questions about the damage documented in this presentation.";
    }

    if (lowerQuestion.includes('help')) {
      return "I can help with:\n• Explaining damage types and severity\n• Insurance claim guidance\n• Repair cost estimates\n• Urgency and priority recommendations\n• Causes of specific damage\n• Next steps and action items\n\nJust ask me about anything you see in the presentation!";
    }

    if (lowerQuestion.includes('summary') || lowerQuestion.includes('overview')) {
      return `We're currently on slide ${slideNumber} of ${totalSlides}. This inspection has documented multiple findings across the roof. Each slide shows detailed analysis including damage type, severity, location, and recommended actions. Would you like me to explain any specific finding?`;
    }

    // Default response
    return "I'm not sure I understand that question. Try asking me about the damage shown in this slide, insurance coverage, repair costs, or what actions to take next. You can also ask me to explain any roofing terms you're unfamiliar with!";
  };

  // Quick action buttons
  const quickActions = currentSlide?.type === 'photo' ? [
    "What's the repair cost?",
    "Is this covered by insurance?",
    "How urgent is this?",
    "What caused this damage?"
  ] : [
    "Summarize findings",
    "Help with terminology",
    "Next steps"
  ];

  const handleQuickAction = (action: string) => {
    setInput(action);
    handleSend();
  };

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-r from-[#e94560] to-[#ff6b88] rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform z-50 animate-pulse-glow"
        >
          <Bot className="w-8 h-8 text-white" />
        </button>
      )}

      {/* Chat Widget */}
      {isOpen && (
        <div
          className={`fixed z-50 transition-all duration-300 ${
            isExpanded
              ? 'inset-4 md:inset-8'
              : 'bottom-6 right-6 w-96 h-[500px]'
          }`}
        >
          <div className="h-full flex flex-col bg-gradient-to-br from-zinc-900 to-black border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-[#e94560] to-[#ff6b88] border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Susan AI</h3>
                  <p className="text-xs text-white/80">Roofing Expert Assistant</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  {isExpanded ? (
                    <Minimize2 className="w-4 h-4 text-white" />
                  ) : (
                    <Maximize2 className="w-4 h-4 text-white" />
                  )}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-grow overflow-y-auto p-4 space-y-4 bg-black/40">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-r from-[#e94560] to-[#ff6b88] text-white'
                        : 'bg-white/10 text-white border border-white/10'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-xs mt-1 ${
                      msg.role === 'user' ? 'text-white/70' : 'text-white/50'
                    }`}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white/10 rounded-2xl px-4 py-3 border border-white/10">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Actions */}
            {!isTyping && (
              <div className="px-4 py-2 border-t border-white/10 bg-black/40">
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {quickActions.map((action, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleQuickAction(action)}
                      className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-full text-xs text-white whitespace-nowrap border border-white/20 transition-colors"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-white/10 bg-black/60">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Ask Susan about this inspection..."
                  className="flex-grow px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-[#e94560]"
                  disabled={isTyping}
                />
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || isTyping}
                  className="px-4 py-3"
                >
                  {isTyping ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(233, 69, 96, 0.5);
          }
          50% {
            box-shadow: 0 0 30px rgba(233, 69, 96, 0.8);
          }
        }
        .animate-pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
      `}</style>
    </>
  );
};

export default SusanChatWidget;
