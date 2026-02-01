/**
 * NotificationsPanel - Dropdown panel showing list of notifications
 * Shows mentions, direct messages, and shared content
 */

import React, { useState, useEffect } from 'react';
import {
  Bell,
  X,
  MessageSquare,
  AtSign,
  Share2,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Settings
} from 'lucide-react';
import { Notification } from '../services/messagingService';

interface NotificationsPanelProps {
  notifications: Notification[];
  loading: boolean;
  unreadCount: number;
  onClose: () => void;
  onMarkAllRead: () => void;
  onRefresh: () => void;
  onNotificationClick?: (notification: Notification) => void;
}

const NotificationsPanel: React.FC<NotificationsPanelProps> = ({
  notifications,
  loading,
  unreadCount,
  onClose,
  onMarkAllRead,
  onRefresh,
  onNotificationClick
}) => {
  // Detect mobile viewport for responsive positioning
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 480);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setViewportWidth(width);
      setIsMobile(width < 480);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Calculate panel width based on viewport
  // On mobile: use full width minus safe margins (16px total)
  // On desktop: max 360px
  const panelWidth = isMobile ? Math.min(360, viewportWidth - 16) : 360;
  // Format time ago
  const formatTimeAgo = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Get notification icon
  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'mention':
        return <AtSign style={{ width: '16px', height: '16px', color: 'var(--roof-red)' }} />;
      case 'direct_message':
        return <MessageSquare style={{ width: '16px', height: '16px', color: '#3b82f6' }} />;
      case 'shared_content':
        return <Share2 style={{ width: '16px', height: '16px', color: '#8b5cf6' }} />;
      case 'system':
        return <AlertCircle style={{ width: '16px', height: '16px', color: '#f59e0b' }} />;
      default:
        return <Bell style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />;
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: isMobile ? '60px' : '60px',
        left: isMobile ? '8px' : '8px',
        right: isMobile ? '8px' : 'auto',
        width: isMobile ? 'auto' : `${panelWidth}px`,
        maxWidth: isMobile ? 'calc(100vw - 16px)' : '360px',
        maxHeight: 'calc(100vh - 80px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxSizing: 'border-box'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '1rem',
          borderBottom: '1px solid var(--border-color)',
          background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.1) 0%, rgba(185, 28, 28, 0.05) 100%)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Bell style={{ width: '20px', height: '20px', color: 'var(--roof-red)' }} />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: 'var(--text-primary)' }}>
              Notifications
            </h3>
            {unreadCount > 0 && (
              <span
                style={{
                  background: 'var(--roof-red)',
                  color: 'white',
                  fontSize: '0.7rem',
                  fontWeight: '600',
                  padding: '2px 6px',
                  borderRadius: '10px'
                }}
              >
                {unreadCount}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button
              onClick={onRefresh}
              disabled={loading}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '0.25rem',
                cursor: loading ? 'default' : 'pointer',
                borderRadius: '6px',
                color: 'var(--text-secondary)',
                opacity: loading ? 0.5 : 1
              }}
              title="Refresh"
            >
              <RefreshCw
                style={{
                  width: '16px',
                  height: '16px',
                  animation: loading ? 'spin 1s linear infinite' : 'none'
                }}
              />
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '0.25rem',
                cursor: 'pointer',
                borderRadius: '6px',
                color: 'var(--text-secondary)'
              }}
              title="Close"
            >
              <X style={{ width: '16px', height: '16px' }} />
            </button>
          </div>
        </div>

        {/* Mark all read button */}
        {unreadCount > 0 && (
          <button
            onClick={onMarkAllRead}
            style={{
              width: '100%',
              padding: '0.5rem',
              background: 'var(--bg-secondary)',
              border: 'none',
              borderRadius: '8px',
              color: 'var(--roof-red)',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            <CheckCircle style={{ width: '14px', height: '14px' }} />
            Mark all as read
          </button>
        )}
      </div>

      {/* Notifications List */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '0.5rem'
        }}
      >
        {loading && notifications.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <Bell style={{ width: '48px', height: '48px', margin: '0 auto 1rem', opacity: 0.3, color: 'var(--text-secondary)' }} />
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No notifications</p>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0.5rem 0 0' }}>
              You're all caught up!
            </p>
          </div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              onClick={() => {
                console.log('[NotificationsPanel] Notification clicked:', notification.id);
                onNotificationClick?.(notification);
              }}
              style={{
                padding: '0.75rem',
                borderRadius: '8px',
                marginBottom: '0.5rem',
                background: notification.is_read ? 'transparent' : 'rgba(220, 38, 38, 0.05)',
                border: `1px solid ${notification.is_read ? 'transparent' : 'rgba(220, 38, 38, 0.15)'}`,
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
              onMouseLeave={(e) => e.currentTarget.style.background = notification.is_read ? 'transparent' : 'rgba(220, 38, 38, 0.05)'}
            >
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {/* Icon */}
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'var(--bg-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  {getNotificationIcon(notification.type)}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: notification.is_read ? '400' : '600',
                      color: 'var(--text-primary)',
                      fontSize: '0.875rem',
                      marginBottom: '0.25rem'
                    }}
                  >
                    {notification.title}
                  </div>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      marginBottom: '0.25rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {notification.body}
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <span>{formatTimeAgo(notification.created_at)}</span>
                    {!notification.is_read && (
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: 'var(--roof-red)'
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '0.75rem',
          borderTop: '1px solid var(--border-color)',
          textAlign: 'center'
        }}
      >
        <button
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            margin: '0 auto',
            padding: '0.25rem'
          }}
        >
          <Settings style={{ width: '14px', height: '14px' }} />
          Notification Settings
        </button>
      </div>

      {/* Spin Animation */}
      <style>
        {`
          @keyframes spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
    </div>
  );
};

export default NotificationsPanel;
