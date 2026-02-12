/**
 * NotificationBell - Bell icon with badge showing unread notification count
 * Displays in the header and opens NotificationsPanel on click
 */

import React, { useState, useEffect, useRef } from 'react';
import { Bell, X } from 'lucide-react';
import { messagingService, Notification } from '../services/messagingService';
import NotificationsPanel from './NotificationsPanel';

interface NotificationBellProps {
  onViewAll?: () => void;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ onViewAll }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch notifications and unread count
  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const [notifs, unread] = await Promise.all([
        messagingService.getNotifications({ limit: 20 }),
        messagingService.getUnreadNotificationCount()
      ]);

      setNotifications(notifs);
      setUnreadCount(unread);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Poll every 60 seconds as backup
    const interval = setInterval(fetchNotifications, 60000);

    // Listen for real-time updates
    messagingService.connect();

    // Listen for new messages (which may trigger notifications)
    const unsubMessage = messagingService.onNewMessage(() => {
      fetchNotifications();
    });

    // Listen for new notifications directly
    const unsubNotification = messagingService.onNotification((notification) => {
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
    });

    return () => {
      clearInterval(interval);
      unsubMessage();
      unsubNotification();
    };
  }, []);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        bellRef.current &&
        panelRef.current &&
        !bellRef.current.contains(event.target as Node) &&
        !panelRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleBellClick = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      fetchNotifications();
    }
  };

  const handleMarkAllRead = async () => {
    const success = await messagingService.markAllNotificationsRead();
    if (success) {
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    console.log('[Notifications] Clicked notification:', notification.id, notification.type);

    // Mark as read if not already
    if (!notification.is_read) {
      console.log('[Notifications] Marking as read...');
      const success = await messagingService.markNotificationRead(notification.id);
      console.log('[Notifications] Mark as read result:', success);
      if (success) {
        setNotifications(prev =>
          prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    }

    // Close the panel
    setIsOpen(false);

    // Navigate based on notification type
    // For now, we'll dispatch a custom event that the app can listen for
    const event = new CustomEvent('notification-click', {
      detail: {
        type: notification.type,
        conversationId: notification.conversation_id,
        messageId: notification.message_id,
        notification
      }
    });
    window.dispatchEvent(event);
  };

  return (
    <div style={{ position: 'relative' }} ref={bellRef}>
      {/* Bell Icon Button */}
      <button
        onClick={handleBellClick}
        style={{
          position: 'relative',
          background: 'transparent',
          border: 'none',
          padding: '0.5rem',
          cursor: 'pointer',
          borderRadius: '8px',
          transition: 'background 0.2s',
          color: 'var(--text-primary)'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        title="Notifications"
      >
        <Bell
          style={{
            width: '20px',
            height: '20px',
            color: unreadCount > 0 ? 'var(--roof-red)' : 'var(--text-secondary)'
          }}
        />

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              background: 'var(--roof-red)',
              color: 'white',
              fontSize: '0.65rem',
              fontWeight: '700',
              minWidth: '16px',
              height: '16px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              boxShadow: '0 0 8px rgba(220, 38, 38, 0.6)',
              animation: 'pulse 2s ease-in-out infinite'
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Panel */}
      {isOpen && (
        <div ref={panelRef}>
          <NotificationsPanel
            notifications={notifications}
            loading={loading}
            unreadCount={unreadCount}
            onClose={() => setIsOpen(false)}
            onMarkAllRead={handleMarkAllRead}
            onRefresh={fetchNotifications}
            onNotificationClick={handleNotificationClick}
            onViewAll={onViewAll ? () => { setIsOpen(false); onViewAll(); } : undefined}
          />
        </div>
      )}

      {/* Pulse Animation */}
      <style>
        {`
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
              transform: scale(1);
            }
            50% {
              opacity: 0.8;
              transform: scale(1.05);
            }
          }
        `}
      </style>
    </div>
  );
};

export default NotificationBell;
