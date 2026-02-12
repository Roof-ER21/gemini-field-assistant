/**
 * Susan Thread Component
 *
 * Renders the message list using assistant-ui's thread primitives.
 * Uses custom SusanMessage for rendering while leveraging assistant-ui's
 * auto-scroll and thread management.
 */

import React, { useRef, useEffect } from 'react';
import { useThreadMessages, useThreadRuntime } from '@assistant-ui/react';
import { SusanMessageComponent } from './SusanMessage';
import { Loader2 } from 'lucide-react';

interface SusanThreadProps {
  /** Additional messages with metadata (sources, provider) not in assistant-ui store */
  messageMetadata?: Map<string, { sources?: any[]; provider?: string }>;
  /** Whether the AI is currently generating */
  isLoading?: boolean;
  style?: React.CSSProperties;
}

export const SusanThread: React.FC<SusanThreadProps> = ({
  messageMetadata,
  isLoading = false,
  style,
}) => {
  const messages = useThreadMessages();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        ...style,
      }}
    >
      {messages.length === 0 && !isLoading && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          gap: '12px',
          color: '#71717a',
          padding: '40px',
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 700,
            color: 'white',
          }}>
            S21
          </div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: '#e4e4e7' }}>
            Susan 21
          </div>
          <div style={{ fontSize: '13px', textAlign: 'center', maxWidth: '300px' }}>
            Your AI roofing assistant. Ask about insurance claims, storm damage, sales strategies, and more.
          </div>
        </div>
      )}

      {messages.map((msg) => {
        const textContent = msg.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map(c => c.text)
          .join('\n');

        const meta = messageMetadata?.get(msg.id);

        return (
          <SusanMessageComponent
            key={msg.id}
            role={msg.role === 'user' ? 'user' : 'assistant'}
            content={textContent}
            sources={meta?.sources}
            provider={meta?.provider}
          />
        );
      })}

      {/* Loading indicator */}
      {isLoading && (
        <div style={{
          display: 'flex',
          gap: '12px',
          padding: '8px 0',
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 700,
            color: 'white',
            flexShrink: 0,
          }}>
            S21
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            borderRadius: '4px 16px 16px 16px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#a1a1aa',
            fontSize: '13px',
          }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Susan is thinking...
          </div>
        </div>
      )}
    </div>
  );
};

export default SusanThread;
