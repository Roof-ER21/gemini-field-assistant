/**
 * PostCard - Individual post display for The Roof feed
 * Shows author, content, shared Susan AI responses, likes, and comments
 */

import React, { useState } from 'react';
import {
  Heart,
  MessageCircle,
  Trash2,
  Bot,
  Mail,
  MoreHorizontal
} from 'lucide-react';
import { RoofPost, roofService } from '../services/roofService';
import { authService } from '../services/authService';
import { formatDisplayName } from '../utils/formatDisplayName';

interface PostCardProps {
  post: RoofPost;
  onLikeChange?: (postId: string, newCount: number, userLiked: boolean) => void;
  onDelete?: (postId: string) => void;
  onOpenComments?: (postId: string) => void;
}

const PostCard: React.FC<PostCardProps> = ({
  post,
  onLikeChange,
  onDelete,
  onOpenComments
}) => {
  const [isLiking, setIsLiking] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const currentUser = authService.getCurrentUser();
  const isAuthor = currentUser?.email?.toLowerCase() === post.author_email.toLowerCase();
  const authorName = formatDisplayName(post.author_name, post.author_email);

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  // Handle like/unlike
  const handleLike = async () => {
    if (isLiking) return;
    setIsLiking(true);

    try {
      if (post.user_liked) {
        const newCount = await roofService.unlikePost(post.id);
        if (newCount !== null && onLikeChange) {
          onLikeChange(post.id, newCount, false);
        }
      } else {
        const newCount = await roofService.likePost(post.id);
        if (newCount !== null && onLikeChange) {
          onLikeChange(post.id, newCount, true);
        }
      }
    } finally {
      setIsLiking(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!isAuthor) return;
    const confirmed = window.confirm('Are you sure you want to delete this post?');
    if (confirmed && onDelete) {
      const success = await roofService.deletePost(post.id);
      if (success) {
        onDelete(post.id);
      }
    }
    setShowMenu(false);
  };

  // Render @mentions with highlighting
  const renderContent = (content: string) => {
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return (
          <span
            key={i}
            style={{
              color: 'var(--roof-red)',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '12px'
      }}
    >
      {/* Header: Author and timestamp */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Avatar */}
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--roof-red) 0%, var(--roof-red-dark) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '14px',
              fontWeight: 700
            }}
          >
            {getInitials(authorName)}
          </div>

          {/* Name and time */}
          <div>
            <div
              style={{
                fontWeight: 600,
                color: 'var(--text-primary)',
                fontSize: '14px'
              }}
            >
              {authorName}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--text-secondary)'
              }}
            >
              {roofService.formatRelativeTime(post.created_at)}
            </div>
          </div>
        </div>

        {/* Menu button (for author only) */}
        {isAuthor && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '8px',
                cursor: 'pointer',
                borderRadius: '6px',
                color: 'var(--text-secondary)'
              }}
            >
              <MoreHorizontal style={{ width: '18px', height: '18px' }} />
            </button>

            {showMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  zIndex: 10,
                  minWidth: '120px',
                  overflow: 'hidden'
                }}
              >
                <button
                  onClick={handleDelete}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'transparent',
                    border: 'none',
                    color: '#ef4444',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px'
                  }}
                >
                  <Trash2 style={{ width: '16px', height: '16px' }} />
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div
        style={{
          color: 'var(--text-primary)',
          fontSize: '15px',
          lineHeight: 1.6,
          marginBottom: '12px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}
      >
        {renderContent(post.content)}
      </div>

      {/* Shared content preview */}
      {post.shared_content && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '12px'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px',
              color: 'var(--text-secondary)',
              fontSize: '13px'
            }}
          >
            {post.post_type === 'shared_email' ? (
              <>
                <Mail style={{ width: '14px', height: '14px' }} />
                Shared Email Draft
              </>
            ) : (
              <>
                <Bot style={{ width: '14px', height: '14px' }} />
                Shared from Susan AI
              </>
            )}
          </div>

          {post.shared_content.ai_response && (
            <div
              style={{
                color: 'var(--text-primary)',
                fontSize: '14px',
                lineHeight: 1.5,
                maxHeight: '150px',
                overflow: 'hidden',
                position: 'relative'
              }}
            >
              {post.shared_content.ai_response.substring(0, 300)}
              {post.shared_content.ai_response.length > 300 && '...'}
            </div>
          )}

          {post.shared_content.email_subject && (
            <div
              style={{
                color: 'var(--text-primary)',
                fontSize: '14px'
              }}
            >
              <strong>Subject:</strong> {post.shared_content.email_subject}
            </div>
          )}
        </div>
      )}

      {/* Pinned badge */}
      {post.is_pinned && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            background: 'rgba(220, 38, 38, 0.1)',
            borderRadius: '4px',
            fontSize: '12px',
            color: 'var(--roof-red)',
            marginBottom: '12px'
          }}
        >
          Pinned
        </div>
      )}

      {/* Actions: Like and Comment */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          paddingTop: '12px',
          borderTop: '1px solid var(--border-color)'
        }}
      >
        {/* Like button */}
        <button
          onClick={handleLike}
          disabled={isLiking}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'transparent',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '6px',
            cursor: isLiking ? 'default' : 'pointer',
            color: post.user_liked ? 'var(--roof-red)' : 'var(--text-secondary)',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'all 0.2s'
          }}
        >
          <Heart
            style={{
              width: '18px',
              height: '18px',
              fill: post.user_liked ? 'var(--roof-red)' : 'transparent',
              stroke: post.user_liked ? 'var(--roof-red)' : 'currentColor'
            }}
          />
          {post.like_count > 0 && post.like_count}
        </button>

        {/* Comment button */}
        <button
          onClick={() => onOpenComments && onOpenComments(post.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'transparent',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '6px',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'all 0.2s'
          }}
        >
          <MessageCircle style={{ width: '18px', height: '18px' }} />
          {post.comment_count > 0 && post.comment_count}
        </button>
      </div>
    </div>
  );
};

export default PostCard;
