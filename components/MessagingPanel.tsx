/**
 * MessagingPanel - Main messaging interface
 * Combines TeamPanel and ConversationView for team collaboration
 */

import React, { useState, useEffect } from 'react';
import TeamPanel from './TeamPanel';
import ConversationView from './ConversationView';
import { messagingService, TeamMember, Conversation } from '../services/messagingService';

interface MessagingPanelProps {
  onClose?: () => void;
}

const MessagingPanel: React.FC<MessagingPanelProps> = ({ onClose }) => {
  const [activeConversation, setActiveConversation] = useState<{
    conversation: Conversation;
    participant?: TeamMember | null;
  } | null>(null);

  // Connect to WebSocket on mount
  useEffect(() => {
    messagingService.connect();

    // Handle visibility changes for presence
    const handleVisibilityChange = () => {
      if (document.hidden) {
        messagingService.setStatus('away');
      } else {
        messagingService.setStatus('online');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleOpenConversation = (conversation: Conversation, participant?: TeamMember | null) => {
    setActiveConversation({ conversation, participant });
  };

  const handleBackToTeam = () => {
    setActiveConversation(null);
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)'
      }}
    >
      {activeConversation ? (
        <ConversationView
          conversation={activeConversation.conversation}
          participant={activeConversation.participant}
          onBack={handleBackToTeam}
        />
      ) : (
        <TeamPanel
          onClose={handleClose}
          onOpenConversation={handleOpenConversation}
        />
      )}
    </div>
  );
};

export default MessagingPanel;
