/**
 * PostComposer - Create new post UI for The Roof
 * Supports text posts, @mentions, and sharing Susan AI content
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Send,
  AtSign,
  Loader2
} from 'lucide-react';
import { roofService, RoofPost, SharedContent } from '../services/roofService';
import MentionAutocomplete from './MentionAutocomplete';

interface PostComposerProps {
  onClose: () => void;
  onPostCreated: (post: RoofPost) => void;
  sharedContent?: SharedContent;  // Pre-filled when sharing from Susan
  initialText?: string;
}

const PostComposer: React.FC<PostComposerProps> = ({
  onClose,
  onPostCreated,
  sharedContent,
  initialText = ''
}) => {
  const [content, setContent] = useState(initialText);
  const [isPosting, setIsPosting] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const MAX_LENGTH = 2000;

  // Auto-focus textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  // Handle text change with @mention detection
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart;
    setContent(value);
    setCursorPosition(cursor);

    // Check for @mention trigger
    const textBeforeCursor = value.substring(0, cursor);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex >= 0) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      // Only show mentions if @ is followed by alphanumeric chars (no space)
      if (/^[\w]*$/.test(textAfterAt) && textAfterAt.length <= 20) {
        setMentionQuery(textAfterAt);

        // Calculate position for dropdown
        if (textareaRef.current) {
          const rect = textareaRef.current.getBoundingClientRect();
          // Position below the textarea input area
          setMentionPosition({
            top: rect.bottom + 4,
            left: rect.left
          });
        }
        setShowMentions(true);
        return;
      }
    }

    setShowMentions(false);
  };

  // Handle mention selection
  const handleMentionSelect = (username: string) => {
    const textBeforeCursor = content.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    const textAfterCursor = content.substring(cursorPosition);

    const newContent =
      content.substring(0, lastAtIndex) +
      '@' + username + ' ' +
      textAfterCursor;

    setContent(newContent);
    setShowMentions(false);

    // Focus back on textarea
    if (textareaRef.current) {
      textareaRef.current.focus();
      const newCursorPos = lastAtIndex + username.length + 2;
      textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
    }
  };

  // Handle post submission
  const handleSubmit = async () => {
    if (!content.trim() || isPosting) return;

    setIsPosting(true);
    try {
      const postType = sharedContent
        ? (sharedContent.type === 'susan_email' ? 'shared_email' : 'shared_chat')
        : 'text';

      const newPost = await roofService.createPost(
        content.trim(),
        postType,
        sharedContent
      );

      if (newPost) {
        onPostCreated(newPost);
      }
    } catch (error) {
      console.error('Error creating post:', error);
    } finally {
      setIsPosting(false);
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + Enter to post
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1050,
        padding: '20px'
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: 'var(--bg-primary)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '500px',
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--border-color)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text-primary)'
            }}
          >
            {sharedContent ? 'Share to The Roof' : 'Create Post'}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '8px',
              cursor: 'pointer',
              borderRadius: '6px',
              color: 'var(--text-secondary)'
            }}
          >
            <X style={{ width: '20px', height: '20px' }} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {/* Shared content preview */}
          {sharedContent && (
            <div
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '12px',
                fontSize: '14px',
                color: 'var(--text-secondary)'
              }}
            >
              <div style={{ fontWeight: 500, marginBottom: '4px', color: 'var(--text-primary)' }}>
                {sharedContent.type === 'susan_email' ? 'Email Draft' : 'Susan AI Response'}
              </div>
              <div style={{ maxHeight: '100px', overflow: 'hidden' }}>
                {sharedContent.ai_response?.substring(0, 200) ||
                 sharedContent.email_body?.substring(0, 200) ||
                 'Shared content'}
                ...
              </div>
            </div>
          )}

          {/* Text input */}
          <div style={{ position: 'relative' }}>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder={sharedContent
                ? "Add a comment about what you're sharing..."
                : "What's happening? Use @ to mention teammates"
              }
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '12px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '15px',
                lineHeight: 1.5,
                resize: 'none',
                outline: 'none'
              }}
              maxLength={MAX_LENGTH}
            />

            {/* Mention hint */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginTop: '8px',
                fontSize: '12px',
                color: 'var(--text-secondary)'
              }}
            >
              <AtSign style={{ width: '12px', height: '12px' }} />
              Type @ to mention a teammate
            </div>
          </div>

          {/* Character count */}
          <div
            style={{
              textAlign: 'right',
              marginTop: '8px',
              fontSize: '12px',
              color: content.length > MAX_LENGTH * 0.9
                ? 'var(--roof-red)'
                : 'var(--text-secondary)'
            }}
          >
            {content.length}/{MAX_LENGTH}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px'
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!content.trim() || isPosting}
            style={{
              padding: '10px 20px',
              background: content.trim() && !isPosting
                ? 'linear-gradient(135deg, var(--roof-red) 0%, var(--roof-red-dark) 100%)'
                : 'var(--bg-secondary)',
              border: 'none',
              borderRadius: '8px',
              color: content.trim() && !isPosting ? 'white' : 'var(--text-disabled)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: content.trim() && !isPosting ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {isPosting ? (
              <>
                <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                Posting...
              </>
            ) : (
              <>
                <Send style={{ width: '16px', height: '16px' }} />
                Post
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mention autocomplete */}
      {showMentions && (
        <MentionAutocomplete
          query={mentionQuery}
          position={mentionPosition}
          onSelect={handleMentionSelect}
          onClose={() => setShowMentions(false)}
        />
      )}
    </div>
  );
};

export default PostComposer;
