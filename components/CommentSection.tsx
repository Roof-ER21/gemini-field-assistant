/**
 * CommentSection - Comments modal for posts on The Roof
 * Shows comments with likes, replies, and add new comment functionality
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Heart,
  Send,
  Trash2,
  Loader2,
  MessageCircle,
  Reply
} from 'lucide-react';
import { roofService, PostComment } from '../services/roofService';
import { authService } from '../services/authService';

interface CommentSectionProps {
  postId: string;
  onClose: () => void;
  onCommentAdded?: () => void;
}

const CommentSection: React.FC<CommentSectionProps> = ({
  postId,
  onClose,
  onCommentAdded
}) => {
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentUser = authService.getCurrentUser();

  // Fetch comments
  useEffect(() => {
    const fetchComments = async () => {
      setLoading(true);
      const data = await roofService.getComments(postId);
      setComments(data);
      setLoading(false);
    };
    fetchComments();
  }, [postId]);

  // Focus input when replying
  useEffect(() => {
    if (replyingTo && inputRef.current) {
      inputRef.current.focus();
    }
  }, [replyingTo]);

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  // Handle submit comment
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const comment = await roofService.addComment(
        postId,
        newComment.trim(),
        replyingTo || undefined
      );

      if (comment) {
        setComments(prev => [...prev, comment]);
        setNewComment('');
        setReplyingTo(null);
        if (onCommentAdded) onCommentAdded();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle like/unlike comment
  const handleLikeComment = async (commentId: string, currentlyLiked: boolean) => {
    if (currentlyLiked) {
      const newCount = await roofService.unlikeComment(commentId);
      if (newCount !== null) {
        setComments(prev =>
          prev.map(c =>
            c.id === commentId
              ? { ...c, like_count: newCount, user_liked: false }
              : c
          )
        );
      }
    } else {
      const newCount = await roofService.likeComment(commentId);
      if (newCount !== null) {
        setComments(prev =>
          prev.map(c =>
            c.id === commentId
              ? { ...c, like_count: newCount, user_liked: true }
              : c
          )
        );
      }
    }
  };

  // Handle delete comment
  const handleDeleteComment = async (commentId: string) => {
    const confirmed = window.confirm('Delete this comment?');
    if (!confirmed) return;

    const success = await roofService.deleteComment(commentId);
    if (success) {
      setComments(prev => prev.filter(c => c.id !== commentId));
    }
  };

  // Render @mentions with highlighting
  const renderContent = (content: string) => {
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return (
          <span key={i} style={{ color: 'var(--roof-red)', fontWeight: 500 }}>
            {part}
          </span>
        );
      }
      return part;
    });
  };

  // Organize comments into threads
  const topLevelComments = comments.filter(c => !c.parent_comment_id);
  const getReplies = (commentId: string) =>
    comments.filter(c => c.parent_comment_id === commentId);

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
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 1050
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: 'var(--bg-primary)',
          borderRadius: '16px 16px 0 0',
          width: '100%',
          maxWidth: '600px',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--border-color)',
          borderBottom: 'none'
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageCircle style={{ width: '20px', height: '20px', color: 'var(--roof-red)' }} />
            <h3
              style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--text-primary)'
              }}
            >
              Comments
            </h3>
            <span
              style={{
                fontSize: '14px',
                color: 'var(--text-secondary)'
              }}
            >
              ({comments.length})
            </span>
          </div>
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

        {/* Comments list */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px'
          }}
        >
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <Loader2
                style={{
                  width: '28px',
                  height: '28px',
                  color: 'var(--roof-red)',
                  animation: 'spin 1s linear infinite'
                }}
              />
            </div>
          ) : comments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              <MessageCircle style={{ width: '40px', height: '40px', opacity: 0.3, marginBottom: '12px' }} />
              <p style={{ margin: 0 }}>No comments yet</p>
              <p style={{ margin: '4px 0 0', fontSize: '14px' }}>Be the first to comment!</p>
            </div>
          ) : (
            topLevelComments.map(comment => (
              <div key={comment.id} style={{ marginBottom: '16px' }}>
                {/* Main comment */}
                <CommentItem
                  comment={comment}
                  isAuthor={currentUser?.email?.toLowerCase() === comment.author_email.toLowerCase()}
                  onLike={handleLikeComment}
                  onDelete={handleDeleteComment}
                  onReply={() => setReplyingTo(comment.id)}
                  getInitials={getInitials}
                  renderContent={renderContent}
                />

                {/* Replies */}
                {getReplies(comment.id).map(reply => (
                  <div
                    key={reply.id}
                    style={{
                      marginLeft: '40px',
                      marginTop: '8px',
                      paddingLeft: '12px',
                      borderLeft: '2px solid var(--border-color)'
                    }}
                  >
                    <CommentItem
                      comment={reply}
                      isAuthor={currentUser?.email?.toLowerCase() === reply.author_email.toLowerCase()}
                      onLike={handleLikeComment}
                      onDelete={handleDeleteComment}
                      onReply={() => setReplyingTo(comment.id)}
                      getInitials={getInitials}
                      renderContent={renderContent}
                      isReply
                    />
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Reply indicator */}
        {replyingTo && (
          <div
            style={{
              padding: '8px 16px',
              background: 'var(--bg-secondary)',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <Reply style={{ width: '14px', height: '14px' }} />
              Replying to comment
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '4px',
                cursor: 'pointer',
                color: 'var(--text-secondary)'
              }}
            >
              <X style={{ width: '16px', height: '16px' }} />
            </button>
          </div>
        )}

        {/* Input area */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: '16px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            gap: '12px'
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={replyingTo ? "Write a reply..." : "Write a comment..."}
            style={{
              flex: 1,
              padding: '12px 16px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-color)',
              borderRadius: '24px',
              color: 'var(--text-primary)',
              fontSize: '14px',
              outline: 'none'
            }}
          />
          <button
            type="submit"
            disabled={!newComment.trim() || isSubmitting}
            style={{
              padding: '12px',
              background: newComment.trim() && !isSubmitting
                ? 'linear-gradient(135deg, var(--roof-red) 0%, var(--roof-red-dark) 100%)'
                : 'var(--bg-secondary)',
              border: 'none',
              borderRadius: '50%',
              cursor: newComment.trim() && !isSubmitting ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isSubmitting ? (
              <Loader2
                style={{
                  width: '18px',
                  height: '18px',
                  color: 'white',
                  animation: 'spin 1s linear infinite'
                }}
              />
            ) : (
              <Send
                style={{
                  width: '18px',
                  height: '18px',
                  color: newComment.trim() ? 'white' : 'var(--text-disabled)'
                }}
              />
            )}
          </button>
        </form>
      </div>

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

// Individual comment item component
interface CommentItemProps {
  comment: PostComment;
  isAuthor: boolean;
  onLike: (id: string, currentlyLiked: boolean) => void;
  onDelete: (id: string) => void;
  onReply: () => void;
  getInitials: (name: string) => string;
  renderContent: (content: string) => React.ReactNode;
  isReply?: boolean;
}

const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  isAuthor,
  onLike,
  onDelete,
  onReply,
  getInitials,
  renderContent,
  isReply = false
}) => {
  return (
    <div style={{ display: 'flex', gap: '10px' }}>
      {/* Avatar */}
      <div
        style={{
          width: isReply ? '28px' : '32px',
          height: isReply ? '28px' : '32px',
          borderRadius: '50%',
          background: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          fontSize: isReply ? '10px' : '12px',
          fontWeight: 600,
          flexShrink: 0
        }}
      >
        {getInitials(comment.author_name)}
      </div>

      <div style={{ flex: 1 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
            {comment.author_name}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {roofService.formatRelativeTime(comment.created_at)}
          </span>
        </div>

        {/* Content */}
        <div
          style={{
            fontSize: '14px',
            color: 'var(--text-primary)',
            lineHeight: 1.5,
            marginBottom: '8px'
          }}
        >
          {renderContent(comment.content)}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => onLike(comment.id, comment.user_liked)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '4px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              color: comment.user_liked ? 'var(--roof-red)' : 'var(--text-secondary)',
              borderRadius: '4px'
            }}
          >
            <Heart
              style={{
                width: '14px',
                height: '14px',
                fill: comment.user_liked ? 'var(--roof-red)' : 'transparent'
              }}
            />
            {comment.like_count > 0 && comment.like_count}
          </button>

          {!isReply && (
            <button
              onClick={onReply}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '4px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                borderRadius: '4px'
              }}
            >
              <Reply style={{ width: '14px', height: '14px' }} />
              Reply
            </button>
          )}

          {isAuthor && (
            <button
              onClick={() => onDelete(comment.id)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '4px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                borderRadius: '4px'
              }}
            >
              <Trash2 style={{ width: '14px', height: '14px' }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommentSection;
