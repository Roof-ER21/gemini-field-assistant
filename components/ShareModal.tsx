/**
 * ShareModal - Modal for sharing Susan AI content with teammates
 * Used by ChatPanel and EmailPanel to share responses/drafts
 * Supports Direct Message or Post to The Roof
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Send,
  Bot,
  Mail,
  Users,
  Check,
  Loader,
  Home,
  MessageSquare
} from 'lucide-react';
import { messagingService, TeamMember } from '../services/messagingService';
import { authService } from '../services/authService';
import { roofService, SharedContent } from '../services/roofService';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  contentType: 'chat' | 'email';
  // For chat content
  originalQuery?: string;
  aiResponse?: string;
  sessionId?: string;
  // For email content
  emailSubject?: string;
  emailBody?: string;
  emailMetadata?: {
    tone?: string;
    recipient?: string;
  };
}

const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  contentType,
  originalQuery,
  aiResponse,
  sessionId,
  emailSubject,
  emailBody,
  emailMetadata
}) => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [note, setNote] = useState('');
  const [success, setSuccess] = useState(false);
  const [shareType, setShareType] = useState<'dm' | 'roof'>('dm');
  const [roofPostContent, setRoofPostContent] = useState('');

  const currentUser = authService.getCurrentUser();

  // Fetch team members
  useEffect(() => {
    if (isOpen) {
      const fetchTeam = async () => {
        setLoading(true);
        try {
          const team = await messagingService.getTeam();
          // Filter out current user
          const filteredTeam = team.filter(m => m.email !== currentUser?.email);
          setTeamMembers(filteredTeam);
        } catch (error) {
          console.error('Error fetching team:', error);
        } finally {
          setLoading(false);
        }
      };

      fetchTeam();

      // Reset state when modal opens
      setSelectedMember(null);
      setNote('');
      setSuccess(false);
      setShareType('dm');
      setRoofPostContent('');
    }
  }, [isOpen, currentUser?.email]);

  // Filter members by search
  const filteredMembers = teamMembers.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort: online first
  const sortedMembers = [...filteredMembers].sort((a, b) => {
    const statusOrder = { online: 0, away: 1, offline: 2 };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  // Handle share
  const handleShare = async () => {
    if (!selectedMember) return;

    setSending(true);
    try {
      // Get or create conversation
      const conversationId = await messagingService.getOrCreateDirectConversation(
        selectedMember.userId
      );

      if (!conversationId) {
        throw new Error('Could not create conversation');
      }

      // Send the message
      let message;
      if (contentType === 'chat' && aiResponse) {
        message = await messagingService.shareChatResponse(
          conversationId,
          originalQuery || '',
          aiResponse,
          undefined,
          sessionId,
          note || undefined
        );
      } else if (contentType === 'email' && emailBody) {
        message = await messagingService.shareEmail(
          conversationId,
          emailSubject || '(No Subject)',
          emailBody,
          emailMetadata,
          note || undefined
        );
      }

      if (message) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    } catch (error) {
      console.error('Error sharing:', error);
      alert('Failed to share. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // Handle post to The Roof
  const handlePostToRoof = async () => {
    if (!roofPostContent.trim()) return;

    setSending(true);
    try {
      // Build shared content
      const sharedContent: SharedContent = contentType === 'chat'
        ? {
            type: 'susan_chat',
            original_query: originalQuery,
            ai_response: aiResponse,
            session_id: sessionId
          }
        : {
            type: 'susan_email',
            email_subject: emailSubject,
            email_body: emailBody,
            email_metadata: emailMetadata
          };

      const postType = contentType === 'chat' ? 'shared_chat' : 'shared_email';
      const newPost = await roofService.createPost(
        roofPostContent.trim(),
        postType,
        sharedContent
      );

      if (newPost) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    } catch (error) {
      console.error('Error posting to Roof:', error);
      alert('Failed to post. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  // Status indicator
  const StatusIndicator: React.FC<{ status: TeamMember['status'] }> = ({ status }) => {
    const colors = {
      online: '#22c55e',
      away: '#f59e0b',
      offline: '#6b7280'
    };

    return (
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: colors[status]
        }}
      />
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-primary)',
          borderRadius: '16px',
          width: '90%',
          maxWidth: '400px',
          maxHeight: '80vh',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.1) 0%, rgba(185, 28, 28, 0.05) 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {contentType === 'chat' ? (
              <Bot style={{ width: '20px', height: '20px', color: 'var(--roof-red)' }} />
            ) : (
              <Mail style={{ width: '20px', height: '20px', color: 'var(--roof-red)' }} />
            )}
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)' }}>
              Share with Teammate
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '0.5rem',
              cursor: 'pointer',
              borderRadius: '8px',
              color: 'var(--text-secondary)'
            }}
          >
            <X style={{ width: '18px', height: '18px' }} />
          </button>
        </div>

        {success ? (
          /* Success State */
          <div
            style={{
              padding: '3rem 2rem',
              textAlign: 'center'
            }}
          >
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: shareType === 'roof'
                  ? 'linear-gradient(135deg, var(--roof-red) 0%, var(--roof-red-dark) 100%)'
                  : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem'
              }}
            >
              {shareType === 'roof' ? (
                <Home style={{ width: '32px', height: '32px', color: 'white' }} />
              ) : (
                <Check style={{ width: '32px', height: '32px', color: 'white' }} />
              )}
            </div>
            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--text-primary)' }}>
              {shareType === 'roof' ? 'Posted!' : 'Shared!'}
            </h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              {shareType === 'roof' ? 'Posted to The Roof' : `Sent to ${selectedMember?.name}`}
            </p>
          </div>
        ) : (
          <>
            {/* Content Preview */}
            <div
              style={{
                padding: '0.75rem 1rem',
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border-color)'
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                {contentType === 'chat' ? 'Susan AI Response' : 'Email Draft'}
              </div>
              <div
                style={{
                  fontSize: '0.875rem',
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%'
                }}
              >
                {contentType === 'chat'
                  ? (aiResponse?.substring(0, 100) + '...')
                  : (emailSubject || '(No Subject)')}
              </div>
            </div>

            {/* Share Type Toggle */}
            <div
              style={{
                padding: '0.75rem 1rem',
                display: 'flex',
                gap: '0.5rem',
                borderBottom: '1px solid var(--border-color)'
              }}
            >
              <button
                onClick={() => setShareType('dm')}
                style={{
                  flex: 1,
                  padding: '0.625rem 0.75rem',
                  borderRadius: '8px',
                  border: shareType === 'dm'
                    ? '2px solid var(--roof-red)'
                    : '1px solid var(--border-color)',
                  background: shareType === 'dm'
                    ? 'rgba(220, 38, 38, 0.1)'
                    : 'transparent',
                  color: shareType === 'dm'
                    ? 'var(--roof-red)'
                    : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  fontWeight: shareType === 'dm' ? '600' : '500',
                  fontSize: '0.875rem'
                }}
              >
                <MessageSquare style={{ width: '16px', height: '16px' }} />
                Direct Message
              </button>
              <button
                onClick={() => setShareType('roof')}
                style={{
                  flex: 1,
                  padding: '0.625rem 0.75rem',
                  borderRadius: '8px',
                  border: shareType === 'roof'
                    ? '2px solid var(--roof-red)'
                    : '1px solid var(--border-color)',
                  background: shareType === 'roof'
                    ? 'rgba(220, 38, 38, 0.1)'
                    : 'transparent',
                  color: shareType === 'roof'
                    ? 'var(--roof-red)'
                    : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  fontWeight: shareType === 'roof' ? '600' : '500',
                  fontSize: '0.875rem'
                }}
              >
                <Home style={{ width: '16px', height: '16px' }} />
                Post to The Roof
              </button>
            </div>

            {shareType === 'dm' ? (
              <>
                {/* Search */}
            <div style={{ padding: '0.75rem 1rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  padding: '0.5rem 0.75rem'
                }}
              >
                <Search style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Search team members..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>
            </div>

            {/* Team Members */}
            <div
              style={{
                maxHeight: '200px',
                overflow: 'auto',
                padding: '0 0.5rem'
              }}
            >
              {loading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Loading...
                </div>
              ) : sortedMembers.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <Users style={{ width: '32px', height: '32px', margin: '0 auto 0.5rem', opacity: 0.5 }} />
                  <p>No team members found</p>
                </div>
              ) : (
                sortedMembers.map(member => (
                  <div
                    key={member.userId}
                    onClick={() => setSelectedMember(member)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      marginBottom: '0.25rem',
                      background: selectedMember?.userId === member.userId
                        ? 'rgba(220, 38, 38, 0.1)'
                        : 'transparent',
                      border: selectedMember?.userId === member.userId
                        ? '2px solid var(--roof-red)'
                        : '2px solid transparent'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedMember?.userId !== member.userId) {
                        e.currentTarget.style.background = 'var(--bg-secondary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedMember?.userId !== member.userId) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    {/* Avatar */}
                    <div style={{ position: 'relative' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: member.status === 'online'
                            ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                            : 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: '600',
                          fontSize: '0.875rem'
                        }}
                      >
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ position: 'absolute', bottom: '-1px', right: '-1px' }}>
                        <StatusIndicator status={member.status} />
                      </div>
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '500', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                        {member.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {member.status === 'online' ? 'Online' : 'Offline'}
                      </div>
                    </div>

                    {/* Selected indicator */}
                    {selectedMember?.userId === member.userId && (
                      <Check style={{ width: '18px', height: '18px', color: 'var(--roof-red)' }} />
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Note Input */}
            {selectedMember && (
              <div style={{ padding: '0.75rem 1rem' }}>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note (optional)..."
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    resize: 'none',
                    outline: 'none'
                  }}
                />
              </div>
            )}
              </>
            ) : (
              /* Post to Roof Section */
              <div style={{ padding: '1rem' }}>
                <div
                  style={{
                    background: 'var(--bg-secondary)',
                    borderRadius: '12px',
                    padding: '1rem',
                    marginBottom: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <Home style={{ width: '18px', height: '18px', color: 'var(--roof-red)' }} />
                    <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                      Post to The Roof
                    </span>
                  </div>
                  <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Share this with your entire team. Everyone will see your post.
                  </p>
                  <textarea
                    value={roofPostContent}
                    onChange={(e) => setRoofPostContent(e.target.value)}
                    placeholder="Add a comment about what you're sharing..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.875rem',
                      resize: 'none',
                      outline: 'none'
                    }}
                    maxLength={2000}
                  />
                  <div
                    style={{
                      textAlign: 'right',
                      fontSize: '0.75rem',
                      color: roofPostContent.length > 1800 ? 'var(--roof-red)' : 'var(--text-secondary)',
                      marginTop: '0.25rem'
                    }}
                  >
                    {roofPostContent.length}/2000
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            <div
              style={{
                padding: '0.75rem 1rem',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                gap: '0.5rem'
              }}
            >
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                Cancel
              </button>
              {shareType === 'dm' ? (
                <button
                  onClick={handleShare}
                  disabled={!selectedMember || sending}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: selectedMember
                      ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
                      : 'var(--bg-tertiary)',
                    color: selectedMember ? 'white' : 'var(--text-secondary)',
                    cursor: selectedMember ? 'pointer' : 'not-allowed',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {sending ? (
                    <>
                      <Loader style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send style={{ width: '16px', height: '16px' }} />
                      Share
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handlePostToRoof}
                  disabled={!roofPostContent.trim() || sending}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: roofPostContent.trim()
                      ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
                      : 'var(--bg-tertiary)',
                    color: roofPostContent.trim() ? 'white' : 'var(--text-secondary)',
                    cursor: roofPostContent.trim() ? 'pointer' : 'not-allowed',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {sending ? (
                    <>
                      <Loader style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                      Posting...
                    </>
                  ) : (
                    <>
                      <Home style={{ width: '16px', height: '16px' }} />
                      Post to Roof
                    </>
                  )}
                </button>
              )}
            </div>
          </>
        )}
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

export default ShareModal;
