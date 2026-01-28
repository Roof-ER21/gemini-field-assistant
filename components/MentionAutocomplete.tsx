/**
 * MentionAutocomplete - Autocomplete dropdown for @mentions
 * Shows team members when @ is typed in a text input
 */

import React, { useState, useEffect, useRef } from 'react';
import { User } from 'lucide-react';
import { messagingService, TeamMember } from '../services/messagingService';

interface MentionAutocompleteProps {
  query: string;  // The text after @ to filter by
  position: { top: number; left: number };
  onSelect: (username: string) => void;
  onClose: () => void;
}

const MentionAutocomplete: React.FC<MentionAutocompleteProps> = ({
  query,
  position,
  onSelect,
  onClose
}) => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<TeamMember[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch team members on mount
  useEffect(() => {
    const fetchTeam = async () => {
      const members = await messagingService.getTeam();
      setTeamMembers(members);
    };
    fetchTeam();
  }, []);

  // Filter members based on query
  useEffect(() => {
    const queryLower = query.toLowerCase();
    const filtered = teamMembers.filter(member => {
      const username = member.email.split('@')[0].toLowerCase();
      const nameLower = member.name.toLowerCase();
      return username.includes(queryLower) || nameLower.includes(queryLower);
    }).slice(0, 5); // Limit to 5 results

    setFilteredMembers(filtered);
    setSelectedIndex(0);
  }, [query, teamMembers]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredMembers.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % filteredMembers.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + filteredMembers.length) % filteredMembers.length);
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          const selected = filteredMembers[selectedIndex];
          if (selected) {
            onSelect(selected.email.split('@')[0]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [filteredMembers, selectedIndex, onSelect, onClose]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (filteredMembers.length === 0) {
    return null;
  }

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return '#4ade80';
      case 'away': return '#fbbf24';
      default: return '#6b7280';
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        zIndex: 1100,
        minWidth: '200px',
        maxWidth: '280px',
        overflow: 'hidden'
      }}
    >
      {filteredMembers.map((member, index) => {
        const username = member.email.split('@')[0];
        return (
          <button
            key={member.userId}
            onClick={() => onSelect(username)}
            onMouseEnter={() => setSelectedIndex(index)}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: index === selectedIndex ? 'var(--bg-secondary)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              textAlign: 'left'
            }}
          >
            {/* Avatar with status */}
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'var(--bg-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <User style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
              </div>
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: getStatusColor(member.status),
                  border: '2px solid var(--bg-elevated)'
                }}
              />
            </div>

            {/* Name and username */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {member.name}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)'
                }}
              >
                @{username}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default MentionAutocomplete;
