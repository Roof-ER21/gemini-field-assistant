import React, { useState, useRef, useEffect } from 'react';
import { Shield, AlertTriangle, CheckCircle, X, Send, Loader2, Swords, Users, BookOpen } from 'lucide-react';
import { multiAI, AIMessage } from '../services/multiProviderAI';

interface AgnesPanelProps {
  onClose: () => void;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'agnes';
  timestamp: Date;
  category?: 'price' | 'timing' | 'denial' | 'partial' | 'cancel' | 'general' | 'quality' | 'trust' | 'competition' | 'warranty';
}

type AgnesMode = 'coach' | 'roleplay';

const AgnesPanel: React.FC<AgnesPanelProps> = ({ onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<AgnesMode>('coach');
  const [roleplayActive, setRoleplayActive] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickObjections = [
    // Pricing & Value
    { text: "Too expensive", category: 'price' as const, emoji: '💰' },
    { text: "Already got other quotes", category: 'competition' as const, emoji: '🏆' },
    { text: "Can't afford it right now", category: 'price' as const, emoji: '💸' },
    { text: "Why so much more than others?", category: 'price' as const, emoji: '❓' },

    // Timing & Decision
    { text: "Need to think about it", category: 'timing' as const, emoji: '⏰' },
    { text: "Want to wait until spring", category: 'timing' as const, emoji: '🌸' },
    { text: "Have to talk to spouse", category: 'timing' as const, emoji: '👥' },

    // Insurance
    { text: "Got a denial from insurance", category: 'denial' as const, emoji: '❌' },
    { text: "Insurance only paid partial", category: 'partial' as const, emoji: '📊' },
    { text: "Insurance won't cover it", category: 'denial' as const, emoji: '🚫' },

    // Quality & Trust
    { text: "Don't trust contractors", category: 'trust' as const, emoji: '🤔' },
    { text: "Had bad experience before", category: 'trust' as const, emoji: '😞' },
    { text: "How do I know quality?", category: 'quality' as const, emoji: '✨' },

    // Competition
    { text: "Friend is a roofer", category: 'competition' as const, emoji: '👨‍🔧' },
    { text: "Going with cheaper option", category: 'competition' as const, emoji: '⬇️' },

    // Cancellation
    { text: "Want to cancel early", category: 'cancel' as const, emoji: '🔙' },
    { text: "Changed our mind", category: 'cancel' as const, emoji: '💭' },

    // Warranty & Guarantee
    { text: "What if something goes wrong?", category: 'warranty' as const, emoji: '🛡️' },
    { text: "Warranty concerns", category: 'warranty' as const, emoji: '📋' }
  ];

  useEffect(() => {
    // Agnes introduction
    const welcomeMessage: Message = {
      id: 'welcome',
      text: mode === 'coach'
        ? `Hey! I'm Agnes - your objection-crushing battle buddy! 💪

I've helped reps close 1000+ deals by turning "NO" into "YES". I'll give you word-for-word scripts, psychology breakdowns, and backup strategies for ANY objection.

**TWO WAYS TO TRAIN:**

🎯 **COACH MODE** (Current): Get instant scripts for any objection
⚔️ **ROLEPLAY MODE**: I become the difficult customer - practice your pitch!

Pick an objection below or describe what you're facing!`
        : `Alright! ROLEPLAY MODE activated! ⚔️

I'm now the TOUGHEST customer you'll face today. I'm skeptical, price-sensitive, and I've heard every pitch before.

Your job: Handle my objections and close this sale!

**I'll push back HARD** - just like real customers do. After each round, I'll give you feedback on what worked and what didn't.

Ready? Start your pitch or respond to my objections! 💼`,
      sender: 'agnes',
      timestamp: new Date()
    };
    setMessages([welcomeMessage]);
  }, [mode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getAgnesResponse = async (objection: string, category?: string): Promise<string> => {
    if (mode === 'roleplay') {
      // Roleplay mode: Agnes becomes the difficult customer
      const roleplayPrompt = `You are Agnes in ROLEPLAY MODE - you're acting as a TOUGH, SKEPTICAL CUSTOMER being sold a roofing service.

The sales rep just said: "${objection}"

Your job is to:
1. Respond AS THE CUSTOMER with a realistic objection or pushback (2-3 sentences)
2. Be challenging but realistic - use common customer concerns
3. After your customer response, add a brief coaching tip in brackets like: [💡 AGNES COACHING: What worked/didn't work in their approach]

Customer personality:
- Price-sensitive and skeptical
- Had bad contractor experiences
- Comparing multiple quotes
- Wants to think things over
- Questions warranties and quality
- Brings up timing concerns

Respond AS THE CUSTOMER first, then add your coaching tip at the end.`;

      try {
        const messages: AIMessage[] = [
          { role: 'user', content: roleplayPrompt }
        ];
        const response = await multiAI.generate(messages);
        return response.content;
      } catch (error) {
        return `[AS CUSTOMER] I appreciate the info, but I'm still not convinced. I've heard this before from other contractors. What makes you different?

[💡 AGNES COACHING: Keep building value! Show specific differentiators and results.]`;
      }
    } else {
      // Coach mode: Provide scripts and strategies
      const agnesPrompt = `You are Agnes, Roof-ER's objection-crushing strategist. You're a no-nonsense battle buddy who gives PROVEN scripts that close deals.

Customer objection: "${objection}"

YOUR RESPONSE STYLE (like S21):
- Confident, empowering, action-first
- "HERE'S what to say..." (not "you could try...")
- Word-for-word scripts with success rates
- Psychology breakdowns
- Use "WE'VE" seen this work 1000+ times

${category === 'price' ? 'STRATEGY: Value over cost. Show ROI, warranties, financing. Reframe from expense to investment.' : ''}
${category === 'competition' ? 'STRATEGY: Differentiate on quality, not price. Show what cheap options miss.' : ''}
${category === 'denial' ? 'STRATEGY: Denials are NORMAL. 73% get overturned with proper supplements.' : ''}
${category === 'partial' ? 'STRATEGY: Partial payments are COMMON. Show financing options and work with them.' : ''}
${category === 'cancel' ? 'STRATEGY: Uncover the REAL concern. Address it directly. Protect the relationship.' : ''}
${category === 'timing' ? 'STRATEGY: Create urgency through benefits, not pressure. Show cost of waiting.' : ''}
${category === 'trust' ? 'STRATEGY: Build credibility fast. Use social proof, warranties, references.' : ''}
${category === 'quality' ? 'STRATEGY: Show certifications, manufacturer partnerships, warranties that prove quality.' : ''}
${category === 'warranty' ? 'STRATEGY: Turn concern into confidence. Explain comprehensive coverage.' : ''}

Format (MANDATORY):
📝 **HERE'S WHAT TO SAY:**
"[Complete word-for-word script]"

💡 **WHY THIS WORKS:**
[Psychology + success rate if known]

🎯 **IF THEY PUSH BACK:**
"[Backup script]"

⚡ **QUICK TIP:**
[One tactical insight]

Keep it CONCISE and ACTIONABLE. Under 250 words total.`;

      try {
        const messages: AIMessage[] = [
          { role: 'user', content: agnesPrompt }
        ];
        const response = await multiAI.generate(messages);
        return response.content;
      } catch (error) {
        return `I apologize, I'm having trouble connecting right now. Here's a quick tip for "${objection}":

📝 **HERE'S WHAT TO SAY:**
"I completely understand your concern. Many of our best customers felt the same way initially. Can I share what changed their mind?"

💡 **WHY THIS WORKS:**
This validates their feelings while creating curiosity about what others discovered.

🎯 **IF THEY PUSH BACK:**
Ask permission to address their specific concern directly: "What's the main thing holding you back?" Then listen and address that ONE issue.`;
      }
    }
  };

  const handleQuickObjection = async (objection: string, category: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      text: objection,
      sender: 'user',
      timestamp: new Date(),
      category: category as any
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    const agnesResponse = await getAgnesResponse(objection, category);

    const agnesMessage: Message = {
      id: (Date.now() + 1).toString(),
      text: agnesResponse,
      sender: 'agnes',
      timestamp: new Date(),
      category: category as any
    };

    setMessages(prev => [...prev, agnesMessage]);
    setIsLoading(false);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: input,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const agnesResponse = await getAgnesResponse(input);

    const agnesMessage: Message = {
      id: (Date.now() + 1).toString(),
      text: agnesResponse,
      sender: 'agnes',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, agnesMessage]);
    setIsLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'var(--bg-primary)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
        padding: '1rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '2px solid rgba(220, 38, 38, 0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Shield style={{ width: '1.5rem', height: '1.5rem', color: '#fff' }} />
          <div>
            <h2 style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#fff'
            }}>
              Agnes - Objection Handler
            </h2>
            <p style={{
              margin: 0,
              fontSize: '0.75rem',
              color: 'rgba(255, 255, 255, 0.8)'
            }}>
              {mode === 'coach' ? 'Get proven scripts & strategies' : 'Practice with a tough customer'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* Mode Switcher */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.15)',
            borderRadius: '8px',
            padding: '4px',
            display: 'flex',
            gap: '4px'
          }}>
            <button
              onClick={() => setMode('coach')}
              style={{
                background: mode === 'coach' ? 'rgba(255, 255, 255, 0.9)' : 'transparent',
                color: mode === 'coach' ? '#dc2626' : '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '0.4rem 0.75rem',
                fontSize: '0.75rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'all 0.2s'
              }}
            >
              <BookOpen style={{ width: '0.875rem', height: '0.875rem' }} />
              Coach
            </button>
            <button
              onClick={() => setMode('roleplay')}
              style={{
                background: mode === 'roleplay' ? 'rgba(255, 255, 255, 0.9)' : 'transparent',
                color: mode === 'roleplay' ? '#dc2626' : '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '0.4rem 0.75rem',
                fontSize: '0.75rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'all 0.2s'
              }}
            >
              <Swords style={{ width: '0.875rem', height: '0.875rem' }} />
              Roleplay
            </button>
          </div>
          <button
          onClick={onClose}
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            border: 'none',
            borderRadius: '8px',
            padding: '0.5rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
        >
          <X style={{ width: '1.25rem', height: '1.25rem', color: '#fff' }} />
        </button>
        </div>
      </div>

      {/* Quick Objections - Only show in coach mode */}
      {mode === 'coach' && (
        <div style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          background: 'rgba(220, 38, 38, 0.05)'
        }}>
          <p style={{
            margin: '0 0 0.75rem 0',
            fontSize: '0.875rem',
            color: 'rgba(255, 255, 255, 0.7)',
            fontWeight: '500'
          }}>
            Common Objections:
          </p>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem'
        }}>
          {quickObjections.map((objection, index) => (
            <button
              key={index}
              onClick={() => handleQuickObjection(objection.text, objection.category)}
              disabled={isLoading}
              style={{
                background: 'rgba(220, 38, 38, 0.1)',
                border: '1px solid rgba(220, 38, 38, 0.3)',
                borderRadius: '20px',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                color: '#fff',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: isLoading ? 0.5 : 1
              }}
              onMouseEnter={(e) => !isLoading && (e.currentTarget.style.background = 'rgba(220, 38, 38, 0.2)')}
              onMouseLeave={(e) => !isLoading && (e.currentTarget.style.background = 'rgba(220, 38, 38, 0.1)')}
            >
              {objection.emoji} {objection.text}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Messages */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '1.5rem'
      }}>
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              marginBottom: '1.5rem',
              display: 'flex',
              justifyContent: message.sender === 'user' ? 'flex-end' : 'flex-start'
            }}
          >
            <div style={{
              maxWidth: '80%',
              background: message.sender === 'user'
                ? 'linear-gradient(135deg, #171717 0%, #262626 100%)'
                : 'rgba(220, 38, 38, 0.1)',
              border: message.sender === 'agnes' ? '1px solid rgba(220, 38, 38, 0.3)' : 'none',
              borderRadius: message.sender === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
              padding: '1rem 1.25rem',
              color: '#fff'
            }}>
              {message.sender === 'agnes' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                  paddingBottom: '0.5rem',
                  borderBottom: '1px solid rgba(220, 38, 38, 0.3)'
                }}>
                  <Shield style={{ width: '1rem', height: '1rem', color: '#dc2626' }} />
                  <span style={{
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    color: '#dc2626'
                  }}>
                    Agnes
                  </span>
                </div>
              )}
              <div style={{
                fontSize: '0.9375rem',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap'
              }}>
                {message.text}
              </div>
              <div style={{
                fontSize: '0.75rem',
                color: 'rgba(255, 255, 255, 0.5)',
                marginTop: '0.5rem'
              }}>
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem',
            color: 'rgba(255, 255, 255, 0.6)'
          }}>
            <Loader2 style={{ width: '1.25rem', height: '1.25rem', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.875rem' }}>Agnes is thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '1rem 1.5rem',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        background: 'rgba(0, 0, 0, 0.2)'
      }}>
        <div style={{
          display: 'flex',
          gap: '0.75rem'
        }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Describe the objection you're facing..."
            disabled={isLoading}
            style={{
              flex: 1,
              boxSizing: 'border-box',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '0.875rem 1rem',
              color: '#fff',
              fontSize: '0.9375rem',
              outline: 'none'
            }}
          />
          <button
            onClick={handleSendMessage}
            disabled={!input.trim() || isLoading}
            style={{
              background: input.trim() && !isLoading
                ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
                : 'rgba(220, 38, 38, 0.3)',
              border: 'none',
              borderRadius: '12px',
              padding: '0.875rem 1.25rem',
              color: '#fff',
              cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.9375rem',
              fontWeight: '500',
              transition: 'all 0.2s'
            }}
          >
            <Send style={{ width: '1.125rem', height: '1.125rem' }} />
            Send
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default AgnesPanel;
