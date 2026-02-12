/**
 * Susan Composer Component
 *
 * Custom message input with file upload, state selector, and send functionality.
 * Connects to assistant-ui's composer API for message submission.
 */

import React, { useState, useRef, useCallback } from 'react';
import { useComposerRuntime } from '@assistant-ui/react';
import { Send, Paperclip, MapPin, Loader2 } from 'lucide-react';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
];

interface SusanComposerProps {
  isLoading?: boolean;
  selectedState?: string | null;
  onStateChange?: (state: string | null) => void;
  onFileUpload?: (files: File[]) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

export const SusanComposer: React.FC<SusanComposerProps> = ({
  isLoading = false,
  selectedState,
  onStateChange,
  onFileUpload,
  placeholder = 'Ask Susan anything...',
  style,
}) => {
  const [text, setText] = useState('');
  const [showStateMenu, setShowStateMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRuntime = useComposerRuntime();

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || isLoading) return;

    composerRuntime.setText(text);
    composerRuntime.send();
    setText('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, isLoading, composerRuntime]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-resize
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, []);

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0 && onFileUpload) {
      onFileUpload(files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div style={{
      padding: '12px 16px',
      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
      background: 'rgba(0, 0, 0, 0.3)',
      ...style,
    }}>
      {/* State selector chip */}
      {selectedState && (
        <div style={{
          display: 'flex',
          gap: '6px',
          marginBottom: '8px',
        }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            borderRadius: '12px',
            background: 'rgba(220, 38, 38, 0.15)',
            border: '1px solid rgba(220, 38, 38, 0.3)',
            color: '#fca5a5',
            fontSize: '12px',
            fontWeight: 500,
          }}>
            <MapPin size={10} />
            {selectedState}
            <button
              onClick={() => onStateChange?.(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#fca5a5',
                cursor: 'pointer',
                padding: '0 2px',
                fontSize: '14px',
                lineHeight: 1,
              }}
            >
              x
            </button>
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: '8px',
      }}>
        {/* File upload */}
        <button
          type="button"
          onClick={handleFileClick}
          style={{
            background: 'none',
            border: 'none',
            color: '#71717a',
            cursor: 'pointer',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            borderRadius: '8px',
          }}
          title="Attach file"
        >
          <Paperclip size={18} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {/* State selector */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setShowStateMenu(!showStateMenu)}
            style={{
              background: selectedState ? 'rgba(220, 38, 38, 0.15)' : 'none',
              border: selectedState ? '1px solid rgba(220, 38, 38, 0.3)' : 'none',
              color: selectedState ? '#fca5a5' : '#71717a',
              cursor: 'pointer',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 500,
            }}
            title="Select state for insurance context"
          >
            <MapPin size={18} />
          </button>

          {showStateMenu && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: '4px',
              background: '#1a1a1a',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px',
              padding: '8px',
              maxHeight: '200px',
              overflow: 'auto',
              width: '200px',
              zIndex: 100,
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '2px',
            }}>
              {US_STATES.map(st => (
                <button
                  key={st}
                  onClick={() => {
                    onStateChange?.(st === selectedState ? null : st);
                    setShowStateMenu(false);
                  }}
                  style={{
                    padding: '4px',
                    background: st === selectedState ? 'rgba(220, 38, 38, 0.2)' : 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    color: st === selectedState ? '#fca5a5' : '#a1a1aa',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: st === selectedState ? 600 : 400,
                  }}
                >
                  {st}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={isLoading}
          style={{
            flex: 1,
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '10px 14px',
            color: 'white',
            fontSize: '14px',
            resize: 'none',
            outline: 'none',
            maxHeight: '120px',
            lineHeight: '1.4',
          }}
        />

        {/* Send button */}
        <button
          type="submit"
          disabled={!text.trim() || isLoading}
          style={{
            background: text.trim() && !isLoading
              ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
              : 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            borderRadius: '10px',
            padding: '10px',
            cursor: text.trim() && !isLoading ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
          }}
          title="Send message"
        >
          {isLoading ? (
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <Send size={18} />
          )}
        </button>
      </form>
    </div>
  );
};

export default SusanComposer;
