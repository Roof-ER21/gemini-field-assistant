import React, { useState, useRef, useEffect } from 'react';
import { Shield, AlertTriangle, CheckCircle, X, Send, Loader2 } from 'lucide-react';
import { multiAI, AIMessage } from '../services/multiProviderAI';

interface AgnesPanelProps {
  onClose: () => void;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'agnes';
  timestamp: Date;
  category?: 'price' | 'timing' | 'denial' | 'partial' | 'cancel' | 'general';
}

const AgnesPanel: React.FC<AgnesPanelProps> = ({ onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickObjections = [
    { text: "Too expensive", category: 'price' as const },
    { text: "Need to think about it", category: 'timing' as const },
    { text: "Got a denial from insurance", category: 'denial' as const },
    { text: "Insurance only paid partial", category: 'partial' as const },
    { text: "Want to cancel early", category: 'cancel' as const },
    { text: "Already got other quotes", category: 'price' as const }
  ];

  useEffect(() => {
    // Agnes introduction
    const welcomeMessage: Message = {
      id: 'welcome',
      text: `Hi! I'm Agnes, your objection handling specialist. 💪

I'm here to help you handle any customer objections with confidence. Whether they're saying it's too expensive, they got a denial, or they want to cancel - I've got your back!

Click a common objection below or tell me what the customer is saying.`,
      sender: 'agnes',
      timestamp: new Date()
    };
    setMessages([welcomeMessage]);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getAgnesResponse = async (objection: string, category?: string): Promise<string> => {
    const agnesPrompt = `You are Agnes, an expert objection handling coach for roofing sales reps. A customer just said: "${objection}"

Your job is to provide:
1. A brief empathetic acknowledgment (1 sentence)
2. The EXACT script the rep should use (word-for-word in quotes)
3. Why this approach works (1-2 sentences)
4. A follow-up tip if the customer still resists

Be direct, confident, and specific. Use proven sales psychology. Keep the total response under 200 words.

${category === 'price' ? 'Focus on value over cost. Emphasize quality, warranties, and long-term savings.' : ''}
${category === 'denial' ? 'Help them understand denials are often initial responses and can be appealed or supplemented.' : ''}
${category === 'partial' ? 'Show how partial payments are normal and how to work with the customer to bridge the gap.' : ''}
${category === 'cancel' ? 'Address their concerns while protecting the relationship and the sale.' : ''}
${category === 'timing' ? 'Create urgency without pressure. Focus on benefits of acting now.' : ''}

Format your response clearly with:
📝 **What to Say:**
"[exact script here]"

💡 **Why It Works:**
[explanation]

🎯 **If They Still Resist:**
[backup approach]`;

    try {
      const messages: AIMessage[] = [
        { role: 'user', content: agnesPrompt }
      ];
      const response = await multiAI.generate(messages);
      return response.content;
    } catch (error) {
      return `I apologize, I'm having trouble connecting right now. Here's a quick tip for "${objection}":

📝 **What to Say:**
"I completely understand your concern. Many of our best customers felt the same way initially. Can I share what changed their mind?"

💡 **Why It Works:**
This validates their feelings while creating curiosity about what others discovered.

🎯 **If They Still Resist:**
Ask permission to address their specific concern directly: "What's the main thing holding you back?" Then listen and address that ONE issue.`;
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
        background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
        padding: '1rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '2px solid rgba(124, 58, 237, 0.3)'
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
              Your objection handling specialist
            </p>
          </div>
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

      {/* Quick Objections */}
      <div style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        background: 'rgba(124, 58, 237, 0.05)'
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
                background: 'rgba(124, 58, 237, 0.1)',
                border: '1px solid rgba(124, 58, 237, 0.3)',
                borderRadius: '20px',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                color: '#fff',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: isLoading ? 0.5 : 1
              }}
              onMouseEnter={(e) => !isLoading && (e.currentTarget.style.background = 'rgba(124, 58, 237, 0.2)')}
              onMouseLeave={(e) => !isLoading && (e.currentTarget.style.background = 'rgba(124, 58, 237, 0.1)')}
            >
              {objection.text}
            </button>
          ))}
        </div>
      </div>

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
                ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                : 'rgba(124, 58, 237, 0.1)',
              border: message.sender === 'agnes' ? '1px solid rgba(124, 58, 237, 0.3)' : 'none',
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
                  borderBottom: '1px solid rgba(124, 58, 237, 0.3)'
                }}>
                  <Shield style={{ width: '1rem', height: '1rem', color: '#7c3aed' }} />
                  <span style={{
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    color: '#7c3aed'
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
                ? 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)'
                : 'rgba(124, 58, 237, 0.3)',
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
