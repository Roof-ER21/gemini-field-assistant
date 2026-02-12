/**
 * NotificationsPage - Full-page view for all notifications
 * Replaces the dropdown-only NotificationsPanel with a proper page
 * that users can navigate to from the sidebar or bell icon.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  AtSign,
  MessageSquare,
  Share2,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Trash2,
  Filter,
  Settings,
  ChevronDown,
  Search,
  Clock
} from 'lucide-react';
import { messagingService, Notification } from '../services/messagingService';
import NotificationSettings from './NotificationSettings';

type FilterType = 'all' | 'unread' | 'mention' | 'direct_message' | 'shared_content' | 'system';

interface NotificationsPageProps {
  userEmail?: string;
}

const NotificationsPage: React.FC<NotificationsPageProps> = ({ userEmail }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const [notifs, unread] = await Promise.all([
        messagingService.getNotifications({ limit: 100 }),
        messagingService.getUnreadNotificationCount()
      ]);
      setNotifications(notifs);
      setUnreadCount(unread);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();

    // Real-time listener
    messagingService.connect();
    const unsub = messagingService.onNotification((notification) => {
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
    });

    return () => { unsub(); };
  }, [fetchNotifications]);

  const handleMarkAllRead = async () => {
    const success = await messagingService.markAllNotificationsRead();
    if (success) {
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    }
  };

  const handleMarkRead = async (id: string) => {
    const success = await messagingService.markNotificationRead(id);
    if (success) {
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  };

  const handleMarkSelectedRead = async () => {
    for (const id of selectedIds) {
      await messagingService.markNotificationRead(id);
    }
    setNotifications(prev =>
      prev.map(n => selectedIds.has(n.id) ? { ...n, is_read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - selectedIds.size));
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatTimeAgo = (timestamp: string): string => {
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
    return date.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }) + ' ET';
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'mention':
        return <AtSign style={{ width: '18px', height: '18px', color: '#dc2626' }} />;
      case 'direct_message':
        return <MessageSquare style={{ width: '18px', height: '18px', color: '#3b82f6' }} />;
      case 'shared_content':
        return <Share2 style={{ width: '18px', height: '18px', color: '#8b5cf6' }} />;
      case 'system':
        return <AlertCircle style={{ width: '18px', height: '18px', color: '#f59e0b' }} />;
      default:
        return <Bell style={{ width: '18px', height: '18px', color: '#6b7280' }} />;
    }
  };

  const getTypeLabel = (type: Notification['type']): string => {
    switch (type) {
      case 'mention': return 'Mention';
      case 'direct_message': return 'Direct Message';
      case 'shared_content': return 'Shared Content';
      case 'system': return 'System';
      default: return 'Notification';
    }
  };

  const getTypeColor = (type: Notification['type']): string => {
    switch (type) {
      case 'mention': return '#dc2626';
      case 'direct_message': return '#3b82f6';
      case 'shared_content': return '#8b5cf6';
      case 'system': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  // Filter and search notifications
  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread' && n.is_read) return false;
    if (filter !== 'all' && filter !== 'unread' && n.type !== filter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Group notifications by date
  const groupByDate = (notifs: Notification[]) => {
    const groups: { label: string; items: Notification[] }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const todayItems: Notification[] = [];
    const yesterdayItems: Notification[] = [];
    const weekItems: Notification[] = [];
    const olderItems: Notification[] = [];

    notifs.forEach(n => {
      const d = new Date(n.created_at);
      if (d >= today) todayItems.push(n);
      else if (d >= yesterday) yesterdayItems.push(n);
      else if (d >= weekAgo) weekItems.push(n);
      else olderItems.push(n);
    });

    if (todayItems.length) groups.push({ label: 'Today', items: todayItems });
    if (yesterdayItems.length) groups.push({ label: 'Yesterday', items: yesterdayItems });
    if (weekItems.length) groups.push({ label: 'This Week', items: weekItems });
    if (olderItems.length) groups.push({ label: 'Older', items: olderItems });

    return groups;
  };

  const groups = groupByDate(filteredNotifications);

  const filterButtons: { id: FilterType; label: string; count?: number }[] = [
    { id: 'all', label: 'All', count: notifications.length },
    { id: 'unread', label: 'Unread', count: unreadCount },
    { id: 'mention', label: 'Mentions' },
    { id: 'direct_message', label: 'Messages' },
    { id: 'shared_content', label: 'Shared' },
    { id: 'system', label: 'System' }
  ];

  if (showSettings) {
    return (
      <div className="roof-er-content-area" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-default)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <button
            onClick={() => setShowSettings(false)}
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: '8px',
              padding: '8px 16px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600
            }}
          >
            Back to Notifications
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          <NotificationSettings userEmail={userEmail || ''} onClose={() => setShowSettings(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className="roof-er-content-area" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px 16px',
        borderBottom: '1px solid var(--border-default)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.15), rgba(220, 38, 38, 0.05))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Bell style={{ width: '20px', height: '20px', color: 'var(--roof-red)' }} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Notifications
              </h1>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--roof-red)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
            <button
              onClick={fetchNotifications}
              disabled={loading}
              style={{
                padding: '8px',
                borderRadius: '8px',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.5 : 1
              }}
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              style={{
                padding: '8px',
                borderRadius: '8px',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
              title="Notification Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '12px'
        }}>
          <div style={{
            flex: 1,
            position: 'relative'
          }}>
            <Search style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '16px',
              height: '16px',
              color: 'var(--text-secondary)'
            }} />
            <input
              type="text"
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                borderRadius: '8px',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                fontSize: '13px'
              }}
            />
          </div>
          {selectMode && selectedIds.size > 0 && (
            <button
              onClick={handleMarkSelectedRead}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--roof-red)',
                color: 'white',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                whiteSpace: 'nowrap'
              }}
            >
              Mark {selectedIds.size} read
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div style={{
          display: 'flex',
          gap: '4px',
          overflowX: 'auto',
          paddingBottom: '4px'
        }}>
          {filterButtons.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: '6px 12px',
                borderRadius: '20px',
                border: filter === f.id ? '1px solid var(--roof-red)' : '1px solid var(--border-default)',
                background: filter === f.id ? 'rgba(220, 38, 38, 0.1)' : 'var(--bg-elevated)',
                color: filter === f.id ? 'var(--roof-red)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s'
              }}
            >
              {f.label}
              {f.count !== undefined && f.count > 0 && (
                <span style={{
                  background: filter === f.id ? 'var(--roof-red)' : 'var(--bg-secondary)',
                  color: filter === f.id ? 'white' : 'var(--text-secondary)',
                  fontSize: '10px',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  fontWeight: 700
                }}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Notification List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
        {loading && notifications.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <RefreshCw
              style={{
                width: '32px',
                height: '32px',
                margin: '0 auto 12px',
                color: 'var(--text-secondary)',
                animation: 'spin 1s linear infinite'
              }}
            />
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Loading notifications...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Bell style={{
              width: '48px',
              height: '48px',
              margin: '0 auto 16px',
              color: 'var(--text-secondary)',
              opacity: 0.3
            }} />
            <p style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 600, margin: '0 0 8px' }}>
              {filter === 'unread' ? 'No unread notifications' : 'No notifications'}
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
              {filter === 'all'
                ? "You're all caught up! Notifications will appear here."
                : `No ${filter === 'unread' ? 'unread' : filter.replace('_', ' ')} notifications.`
              }
            </p>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.label} style={{ marginBottom: '24px' }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Clock className="w-3 h-3" />
                {group.label}
                <span style={{
                  background: 'var(--bg-elevated)',
                  padding: '1px 6px',
                  borderRadius: '8px',
                  fontSize: '10px'
                }}>
                  {group.items.length}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {group.items.map(notification => (
                  <div
                    key={notification.id}
                    onClick={() => {
                      if (selectMode) {
                        toggleSelect(notification.id);
                      } else if (!notification.is_read) {
                        handleMarkRead(notification.id);
                      }
                    }}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '10px',
                      background: notification.is_read
                        ? 'var(--bg-secondary)'
                        : 'linear-gradient(135deg, rgba(220, 38, 38, 0.06), rgba(220, 38, 38, 0.02))',
                      border: `1px solid ${
                        selectedIds.has(notification.id)
                          ? 'var(--roof-red)'
                          : notification.is_read
                            ? 'var(--border-default)'
                            : 'rgba(220, 38, 38, 0.15)'
                      }`,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      display: 'flex',
                      gap: '14px',
                      alignItems: 'flex-start'
                    }}
                  >
                    {/* Selection checkbox in select mode */}
                    {selectMode && (
                      <div style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '4px',
                        border: `2px solid ${selectedIds.has(notification.id) ? 'var(--roof-red)' : 'var(--border-default)'}`,
                        background: selectedIds.has(notification.id) ? 'var(--roof-red)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: '2px'
                      }}>
                        {selectedIds.has(notification.id) && (
                          <CheckCircle style={{ width: '12px', height: '12px', color: 'white' }} />
                        )}
                      </div>
                    )}

                    {/* Icon */}
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: `${getTypeColor(notification.type)}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {getNotificationIcon(notification.type)}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{
                          fontWeight: notification.is_read ? 500 : 700,
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {notification.title}
                        </span>
                        <span style={{
                          fontSize: '11px',
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                          flexShrink: 0
                        }}>
                          {formatTimeAgo(notification.created_at)}
                        </span>
                      </div>

                      <p style={{
                        margin: '0 0 6px',
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {notification.body}
                      </p>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '10px',
                          background: `${getTypeColor(notification.type)}15`,
                          color: getTypeColor(notification.type)
                        }}>
                          {getTypeLabel(notification.type)}
                        </span>
                        {!notification.is_read && (
                          <span style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            background: 'var(--roof-red)',
                            boxShadow: '0 0 6px rgba(220, 38, 38, 0.4)'
                          }} />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Spin animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default NotificationsPage;
