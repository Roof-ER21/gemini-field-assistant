/**
 * Messaging Service - Client-side messaging and presence functionality
 * Connects to WebSocket for real-time updates and provides REST API wrappers
 */

import { io, Socket } from 'socket.io-client';
import { authService } from './authService';

// Types
export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  username: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: Date;
  deviceType?: string;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_read_at: string;
  is_muted: boolean;
  participants: Array<{
    user_id: string;
    username: string;
    name: string;
    email: string;
  }>;
  last_message: {
    id: string;
    sender_id: string;
    sender_name: string;
    message_type: string;
    content: MessageContent;
    created_at: string;
  } | null;
  unread_count: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_type: 'text' | 'shared_chat' | 'shared_email' | 'system';
  content: MessageContent;
  is_edited: boolean;
  edited_at: string | null;
  parent_message_id: string | null;
  created_at: string;
  updated_at: string;
  sender: {
    id: string;
    username: string;
    name: string;
    email: string;
  };
  mentions?: Array<{
    id: string;
    mentioned_user_id: string;
    is_read: boolean;
  }>;
}

export interface MessageContent {
  type: 'text' | 'shared_chat' | 'shared_email' | 'system';
  text?: string;
  mentioned_users?: string[];
  shared_data?: {
    original_query?: string;
    ai_response?: string;
    context?: string;
    session_id?: string;
    email_subject?: string;
    email_body?: string;
    email_metadata?: {
      tone?: string;
      recipient?: string;
    };
  };
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'mention' | 'direct_message' | 'shared_content' | 'system';
  message_id: string | null;
  conversation_id: string | null;
  title: string;
  body: string;
  data: any;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

// Event types
type PresenceUpdateCallback = (update: { userId: string; status: string; timestamp: Date }) => void;
type MessageCallback = (message: Message) => void;
type TypingCallback = (data: { userId: string; conversationId: string; isTyping: boolean }) => void;
type NotificationCallback = (notification: Notification) => void;

class MessagingService {
  private socket: Socket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  // Event listeners
  private presenceListeners: Set<PresenceUpdateCallback> = new Set();
  private messageListeners: Set<MessageCallback> = new Set();
  private typingListeners: Set<TypingCallback> = new Set();
  private notificationListeners: Set<NotificationCallback> = new Set();

  // Heartbeat
  private heartbeatInterval: NodeJS.Timeout | null = null;

  // Connect to WebSocket server
  connect(): void {
    if (this.socket?.connected) {
      console.log('[Messaging] Already connected');
      return;
    }

    const user = authService.getCurrentUser();
    if (!user) {
      console.log('[Messaging] No user logged in, skipping WebSocket connection');
      return;
    }

    const serverUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

    this.socket = io(serverUrl, {
      auth: { email: user.email },
      query: { deviceType: this.getDeviceType() },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000
    });

    this.setupSocketListeners();
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[Messaging] WebSocket connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.startHeartbeat();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Messaging] WebSocket disconnected:', reason);
      this.isConnected = false;
      this.stopHeartbeat();
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Messaging] Connection error:', error.message);
      this.reconnectAttempts++;
    });

    // Presence events
    this.socket.on('presence:list', (users: TeamMember[]) => {
      console.log('[Messaging] Received presence list:', users.length, 'users');
    });

    this.socket.on('presence:update', (update: { userId: string; status: string; timestamp: Date }) => {
      this.presenceListeners.forEach(listener => listener(update));
    });

    // Message events
    this.socket.on('message:new', (message: Message) => {
      this.messageListeners.forEach(listener => listener(message));
    });

    this.socket.on('message:notification', (data: { conversationId: string; messageId: string }) => {
      // Trigger unread count refresh
      this.messageListeners.forEach(listener => listener(data as any));
    });

    // Typing events
    this.socket.on('typing:update', (data: { userId: string; conversationId: string; isTyping: boolean }) => {
      this.typingListeners.forEach(listener => listener(data));
    });

    // Notification events
    this.socket.on('notification:new', (notification: Notification) => {
      this.notificationListeners.forEach(listener => listener(notification));
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('presence:heartbeat');
      }
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private getDeviceType(): string {
    // Check if running in Capacitor
    if ((window as any).Capacitor?.isNativePlatform()) {
      return (window as any).Capacitor.getPlatform();
    }
    return 'web';
  }

  // Disconnect from WebSocket
  disconnect(): void {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
  }

  // Set user status
  setStatus(status: 'online' | 'away'): void {
    if (this.socket?.connected) {
      this.socket.emit('presence:status', status);
    }
  }

  // Join a conversation room
  joinConversation(conversationId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('conversation:join', conversationId);
    }
  }

  // Leave a conversation room
  leaveConversation(conversationId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('conversation:leave', conversationId);
    }
  }

  // Emit typing start
  startTyping(conversationId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('typing:start', conversationId);
    }
  }

  // Emit typing stop
  stopTyping(conversationId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('typing:stop', conversationId);
    }
  }

  // Event listener registration
  onPresenceUpdate(callback: PresenceUpdateCallback): () => void {
    this.presenceListeners.add(callback);
    return () => this.presenceListeners.delete(callback);
  }

  onNewMessage(callback: MessageCallback): () => void {
    this.messageListeners.add(callback);
    return () => this.messageListeners.delete(callback);
  }

  onTyping(callback: TypingCallback): () => void {
    this.typingListeners.add(callback);
    return () => this.typingListeners.delete(callback);
  }

  onNotification(callback: NotificationCallback): () => void {
    this.notificationListeners.add(callback);
    return () => this.notificationListeners.delete(callback);
  }

  // ============================================================================
  // REST API METHODS
  // ============================================================================

  private getHeaders(): HeadersInit {
    const user = authService.getCurrentUser();
    return {
      'Content-Type': 'application/json',
      'x-user-email': user?.email || ''
    };
  }

  private getApiUrl(): string {
    return import.meta.env.VITE_API_URL || '';
  }

  // Get team members with presence
  async getTeam(): Promise<TeamMember[]> {
    try {
      const response = await fetch(`${this.getApiUrl()}/api/team`, {
        headers: this.getHeaders()
      });

      if (!response.ok) throw new Error('Failed to fetch team');

      const data = await response.json();
      return data.users || [];
    } catch (error) {
      console.error('[Messaging] Error fetching team:', error);
      return [];
    }
  }

  // Get all conversations
  async getConversations(): Promise<{ conversations: Conversation[]; total_unread: number }> {
    try {
      const response = await fetch(`${this.getApiUrl()}/api/messages/conversations`, {
        headers: this.getHeaders()
      });

      if (!response.ok) throw new Error('Failed to fetch conversations');

      const data = await response.json();
      return {
        conversations: data.conversations || [],
        total_unread: data.total_unread || 0
      };
    } catch (error) {
      console.error('[Messaging] Error fetching conversations:', error);
      return { conversations: [], total_unread: 0 };
    }
  }

  // Create or get existing direct conversation
  async getOrCreateDirectConversation(participantId: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.getApiUrl()}/api/messages/conversations`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          type: 'direct',
          participant_ids: [participantId]
        })
      });

      if (!response.ok) throw new Error('Failed to create conversation');

      const data = await response.json();
      return data.conversation?.id || null;
    } catch (error) {
      console.error('[Messaging] Error creating conversation:', error);
      return null;
    }
  }

  // Get messages for a conversation
  async getMessages(
    conversationId: string,
    options?: { limit?: number; beforeMessageId?: string }
  ): Promise<{ messages: Message[]; has_more: boolean }> {
    try {
      const params = new URLSearchParams();
      if (options?.limit) params.append('limit', String(options.limit));
      if (options?.beforeMessageId) params.append('before_message_id', options.beforeMessageId);

      const response = await fetch(
        `${this.getApiUrl()}/api/messages/conversations/${conversationId}/messages?${params}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) throw new Error('Failed to fetch messages');

      const data = await response.json();
      return {
        messages: data.messages || [],
        has_more: data.has_more || false
      };
    } catch (error) {
      console.error('[Messaging] Error fetching messages:', error);
      return { messages: [], has_more: false };
    }
  }

  // Send a message
  async sendMessage(
    conversationId: string,
    content: MessageContent,
    parentMessageId?: string
  ): Promise<Message | null> {
    try {
      const response = await fetch(
        `${this.getApiUrl()}/api/messages/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            message_type: content.type,
            content,
            parent_message_id: parentMessageId
          })
        }
      );

      if (!response.ok) throw new Error('Failed to send message');

      const data = await response.json();
      return data.message || null;
    } catch (error) {
      console.error('[Messaging] Error sending message:', error);
      return null;
    }
  }

  // Share Susan AI chat response
  async shareChatResponse(
    conversationId: string,
    originalQuery: string,
    aiResponse: string,
    context?: string,
    sessionId?: string,
    additionalText?: string
  ): Promise<Message | null> {
    const content: MessageContent = {
      type: 'shared_chat',
      text: additionalText,
      shared_data: {
        original_query: originalQuery,
        ai_response: aiResponse,
        context,
        session_id: sessionId
      }
    };

    return this.sendMessage(conversationId, content);
  }

  // Share generated email
  async shareEmail(
    conversationId: string,
    emailSubject: string,
    emailBody: string,
    metadata?: { tone?: string; recipient?: string },
    additionalText?: string
  ): Promise<Message | null> {
    const content: MessageContent = {
      type: 'shared_email',
      text: additionalText,
      shared_data: {
        email_subject: emailSubject,
        email_body: emailBody,
        email_metadata: metadata
      }
    };

    return this.sendMessage(conversationId, content);
  }

  // Mark messages as read
  async markAsRead(conversationId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.getApiUrl()}/api/messages/mark-read`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ conversation_id: conversationId })
      });

      return response.ok;
    } catch (error) {
      console.error('[Messaging] Error marking as read:', error);
      return false;
    }
  }

  // Get unread count
  async getUnreadCount(): Promise<{ total_unread: number; unread_mentions: number }> {
    try {
      const response = await fetch(`${this.getApiUrl()}/api/messages/unread-count`, {
        headers: this.getHeaders()
      });

      if (!response.ok) throw new Error('Failed to fetch unread count');

      const data = await response.json();
      return {
        total_unread: data.total_unread || 0,
        unread_mentions: data.unread_mentions || 0
      };
    } catch (error) {
      console.error('[Messaging] Error fetching unread count:', error);
      return { total_unread: 0, unread_mentions: 0 };
    }
  }

  // Get notifications
  async getNotifications(options?: { limit?: number; unreadOnly?: boolean }): Promise<Notification[]> {
    try {
      const params = new URLSearchParams();
      if (options?.limit) params.append('limit', String(options.limit));
      if (options?.unreadOnly) params.append('unread_only', 'true');

      const response = await fetch(
        `${this.getApiUrl()}/api/messages/notifications?${params}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) throw new Error('Failed to fetch notifications');

      const data = await response.json();
      return data.notifications || [];
    } catch (error) {
      console.error('[Messaging] Error fetching notifications:', error);
      return [];
    }
  }

  // Get unread notification count only
  async getUnreadNotificationCount(): Promise<number> {
    try {
      const response = await fetch(
        `${this.getApiUrl()}/api/messages/notifications?unread_only=true&limit=1`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) throw new Error('Failed to fetch notification count');

      const data = await response.json();
      return data.unread_count || 0;
    } catch (error) {
      console.error('[Messaging] Error fetching notification count:', error);
      return 0;
    }
  }

  // Mark all notifications as read
  async markAllNotificationsRead(): Promise<boolean> {
    try {
      const response = await fetch(`${this.getApiUrl()}/api/messages/notifications/mark-all-read`, {
        method: 'POST',
        headers: this.getHeaders()
      });

      return response.ok;
    } catch (error) {
      console.error('[Messaging] Error marking notifications as read:', error);
      return false;
    }
  }

  // Check if connected
  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

// Singleton instance
export const messagingService = new MessagingService();
