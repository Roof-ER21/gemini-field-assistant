/**
 * MessagingPanel - Main messaging interface
 * Combines TeamPanel and ConversationView for team collaboration
 */

import React, { useState, useEffect } from 'react';
import TeamPanel from './TeamPanel';
import ConversationView from './ConversationView';
import { messagingService, TeamMember } from '../services/messagingService';

interface MessagingPanelProps {
  onClose?: () => void;
}

const MessagingPanel: React.FC<MessagingPanelProps> = ({ onClose }) => {
  const [activeConversation, setActiveConversation] = useState<{
    id: string;
    participant: TeamMember;
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

  const handleOpenConversation = (conversationId: string, participant: TeamMember) => {
    setActiveConversation({ id: conversationId, participant });
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
          conversationId={activeConversation.id}
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
