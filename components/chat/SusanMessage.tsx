/**
 * Susan Message Component
 *
 * Custom message renderer for assistant-ui that wraps the existing
 * S21ResponseFormatter for bot messages and provides polished user bubbles.
 */

import React, { useState } from 'react';
import { Copy, Check, ThumbsUp, ThumbsDown, RotateCcw } from 'lucide-react';
import S21ResponseFormatter from '../S21ResponseFormatter';

interface SusanMessageProps {
  role: 'user' | 'assistant';
  content: string;
  sources?: any[];
  provider?: string;
  onRegenerate?: () => void;
}

export const SusanMessageComponent: React.FC<SusanMessageProps> = ({
  role,
  content,
  sources,
  provider,
  onRegenerate,
}) => {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  if (role === 'user') {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '4px 0',
      }}>
        <div style={{
          maxWidth: '80%',
          padding: '12px 16px',
          borderRadius: '16px 16px 4px 16px',
          background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
          color: 'white',
          fontSize: '14px',
          lineHeight: '1.5',
          wordBreak: 'break-word',
        }}>
          {content}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      padding: '8px 0',
    }}>
      {/* Avatar */}
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

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Response content */}
        <div style={{
          padding: '12px 16px',
          borderRadius: '4px 16px 16px 16px',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}>
          <S21ResponseFormatter
            content={content}
            sources={sources}
          />
        </div>

        {/* Action bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          marginTop: '6px',
          opacity: 0.6,
        }}
          className="susan-msg-actions"
        >
          <button
            onClick={handleCopy}
            style={{
              background: 'none',
              border: 'none',
              color: copied ? '#22c55e' : '#a1a1aa',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '4px',
            }}
            title="Copy"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>

          <button
            onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
            style={{
              background: 'none',
              border: 'none',
              color: feedback === 'up' ? '#22c55e' : '#a1a1aa',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '4px',
            }}
            title="Good response"
          >
            <ThumbsUp size={14} />
          </button>

          <button
            onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
            style={{
              background: 'none',
              border: 'none',
              color: feedback === 'down' ? '#ef4444' : '#a1a1aa',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '4px',
            }}
            title="Bad response"
          >
            <ThumbsDown size={14} />
          </button>

          {onRegenerate && (
            <button
              onClick={onRegenerate}
              style={{
                background: 'none',
                border: 'none',
                color: '#a1a1aa',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '4px',
              }}
              title="Regenerate"
            >
              <RotateCcw size={14} />
            </button>
          )}

          {provider && (
            <span style={{
              fontSize: '11px',
              color: '#71717a',
              marginLeft: '8px',
            }}>
              via {provider}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default SusanMessageComponent;
