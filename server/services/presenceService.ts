/**
 * Presence Service - Real-time online/offline tracking with Socket.IO
 * Provides WebSocket-based presence for the Susan 21 team messaging feature
 */

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import pg from 'pg';

const { Pool } = pg;

// Types
export interface UserPresence {
  userId: string;
  name: string;
  email: string;
  username: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: Date;
  deviceType: string;
}

interface PresenceUpdate {
  userId: string;
  status: 'online' | 'away' | 'offline';
  timestamp: Date;
}

interface SocketData {
  userId: string;
  email: string;
  deviceType: string;
}

export class PresenceService {
  private io: Server;
  private pool: pg.Pool;
  private heartbeatInterval = 15000; // 15 seconds
  private offlineThreshold = 45000; // 45 seconds without heartbeat = offline
  private heartbeatTimers = new Map<string, NodeJS.Timeout>();
  private sessionStartTimes = new Map<string, Date>();
  private userSockets = new Map<string, Set<string>>(); // userId -> Set of socketIds

  constructor(httpServer: HttpServer, pool: pg.Pool, allowedOrigins: string[]) {
    this.pool = pool;

    // Initialize Socket.IO with CORS support
    this.io = new Server(httpServer, {
      cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
      },
      path: '/socket.io',
      pingInterval: 10000,
      pingTimeout: 5000,
      transports: ['websocket', 'polling']
    });

    this.setupSocketHandlers();
    this.startCleanupJob();

    console.log('✅ Presence WebSocket service initialized');
  }

  private setupSocketHandlers() {
    // Authentication middleware
    this.io.use(async (socket: Socket, next) => {
      try {
        // Get user email from auth (simplified - relies on header during initial connection)
        const email = socket.handshake.auth.email || socket.handshake.query.email;

        if (!email || typeof email !== 'string') {
          return next(new Error('Authentication required'));
        }

        // Get user from database
        const result = await this.pool.query(
          'SELECT id, email, name, username FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
          [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
          return next(new Error('User not found'));
        }

        const user = result.rows[0];
        (socket as Socket & { data: SocketData }).data = {
          userId: user.id,
          email: user.email,
          deviceType: (socket.handshake.query.deviceType as string) || 'web'
        };

        next();
      } catch (error) {
        console.error('Socket auth error:', error);
        next(new Error('Authentication failed'));
      }
    });

    this.io.on('connection', async (socket: Socket & { data: SocketData }) => {
      const { userId, email, deviceType } = socket.data;

      console.log(`[Presence] User ${email} connected from ${deviceType}`);

      // Track socket for this user (supports multiple connections)
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(socket.id);

      // Mark user as online
      await this.setUserOnline(userId, socket.id, deviceType);

      // Start heartbeat monitoring
      this.startHeartbeatMonitoring(userId, socket.id);

      // Broadcast presence update to all connected clients
      this.broadcastPresenceUpdate(userId, 'online');

      // Send current presence list to the newly connected user
      const presenceList = await this.getPresenceList();
      socket.emit('presence:list', presenceList);

      // Handle heartbeat from client
      socket.on('presence:heartbeat', async () => {
        this.resetHeartbeatTimer(userId, socket.id);
        await this.updateLastSeen(userId);
      });

      // Handle manual status changes
      socket.on('presence:status', async (status: 'online' | 'away') => {
        await this.updateUserStatus(userId, status);
        this.broadcastPresenceUpdate(userId, status);
      });

      // Handle disconnection
      socket.on('disconnect', async (reason) => {
        console.log(`[Presence] User ${email} disconnected: ${reason}`);

        // Remove this socket from user's socket set
        const userSocketSet = this.userSockets.get(userId);
        if (userSocketSet) {
          userSocketSet.delete(socket.id);

          // Only mark offline if user has no other connections
          if (userSocketSet.size === 0) {
            this.userSockets.delete(userId);
            await this.handleDisconnect(userId, socket.id);
          }
        }
      });

      // Handle foreground/background events (mobile)
      socket.on('app:background', async () => {
        await this.updateUserStatus(userId, 'away');
        this.broadcastPresenceUpdate(userId, 'away');
      });

      socket.on('app:foreground', async () => {
        await this.updateUserStatus(userId, 'online');
        this.broadcastPresenceUpdate(userId, 'online');
      });

      // Handle typing indicators
      socket.on('typing:start', (conversationId: string) => {
        socket.to(`conversation:${conversationId}`).emit('typing:update', {
          userId,
          conversationId,
          isTyping: true
        });
      });

      socket.on('typing:stop', (conversationId: string) => {
        socket.to(`conversation:${conversationId}`).emit('typing:update', {
          userId,
          conversationId,
          isTyping: false
        });
      });

      // Handle joining conversation rooms
      socket.on('conversation:join', (conversationId: string) => {
        socket.join(`conversation:${conversationId}`);
      });

      socket.on('conversation:leave', (conversationId: string) => {
        socket.leave(`conversation:${conversationId}`);
      });
    });
  }

  private async setUserOnline(userId: string, socketId: string, deviceType: string) {
    const sessionStart = new Date();
    this.sessionStartTimes.set(userId, sessionStart);

    try {
      await this.pool.query(
        `INSERT INTO user_presence (user_id, status, last_seen, socket_id, device_type)
         VALUES ($1, 'online', NOW(), $2, $3)
         ON CONFLICT (user_id)
         DO UPDATE SET
           status = 'online',
           last_seen = NOW(),
           socket_id = $2,
           device_type = $3`,
        [userId, socketId, deviceType]
      );
    } catch (error) {
      console.error('[Presence] Error setting user online:', error);
    }
  }

  private async updateUserStatus(userId: string, status: 'online' | 'away' | 'offline') {
    try {
      await this.pool.query(
        `UPDATE user_presence
         SET status = $1, last_seen = NOW()
         WHERE user_id = $2`,
        [status, userId]
      );
    } catch (error) {
      console.error('[Presence] Error updating status:', error);
    }
  }

  private async updateLastSeen(userId: string) {
    try {
      await this.pool.query(
        `UPDATE user_presence SET last_seen = NOW() WHERE user_id = $1`,
        [userId]
      );
    } catch (error) {
      console.error('[Presence] Error updating last seen:', error);
    }
  }

  private startHeartbeatMonitoring(userId: string, socketId: string) {
    this.clearHeartbeatTimer(userId);

    const timer = setTimeout(async () => {
      console.log(`[Presence] Heartbeat timeout for user ${userId}`);
      // Check if user still has active sockets
      const userSocketSet = this.userSockets.get(userId);
      if (!userSocketSet || userSocketSet.size === 0) {
        await this.handleDisconnect(userId, socketId);
      }
    }, this.offlineThreshold);

    this.heartbeatTimers.set(userId, timer);
  }

  private resetHeartbeatTimer(userId: string, socketId: string) {
    this.clearHeartbeatTimer(userId);
    this.startHeartbeatMonitoring(userId, socketId);
  }

  private clearHeartbeatTimer(userId: string) {
    const existingTimer = this.heartbeatTimers.get(userId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.heartbeatTimers.delete(userId);
    }
  }

  private async handleDisconnect(userId: string, socketId: string) {
    this.clearHeartbeatTimer(userId);

    // Calculate session duration
    const sessionStart = this.sessionStartTimes.get(userId);
    let sessionDuration = 0;
    if (sessionStart) {
      sessionDuration = Math.floor((Date.now() - sessionStart.getTime()) / 1000);
      this.sessionStartTimes.delete(userId);
    }

    try {
      // Mark user as offline
      await this.pool.query(
        `UPDATE user_presence
         SET status = 'offline', last_seen = NOW(), socket_id = NULL
         WHERE user_id = $1`,
        [userId]
      );

      // Log presence history (optional analytics)
      await this.pool.query(
        `INSERT INTO presence_history (user_id, event_type, session_duration_seconds, device_type)
         SELECT user_id, 'offline', $2, device_type
         FROM user_presence WHERE user_id = $1`,
        [userId, sessionDuration]
      );
    } catch (error) {
      console.error('[Presence] Error handling disconnect:', error);
    }

    this.broadcastPresenceUpdate(userId, 'offline');
  }

  async getPresenceList(): Promise<UserPresence[]> {
    try {
      const result = await this.pool.query(
        `SELECT
           up.user_id as "userId",
           up.status,
           up.last_seen as "lastSeen",
           up.device_type as "deviceType",
           u.name,
           u.email,
           COALESCE(u.username, LOWER(SPLIT_PART(u.email, '@', 1))) as username
         FROM user_presence up
         JOIN users u ON up.user_id = u.id
         ORDER BY
           CASE up.status
             WHEN 'online' THEN 1
             WHEN 'away' THEN 2
             ELSE 3
           END,
           up.last_seen DESC`
      );

      return result.rows;
    } catch (error) {
      console.error('[Presence] Error getting presence list:', error);
      return [];
    }
  }

  private broadcastPresenceUpdate(userId: string, status: string) {
    this.io.emit('presence:update', {
      userId,
      status,
      timestamp: new Date()
    } as PresenceUpdate);
  }

  // Emit a new message event to all participants in a conversation
  emitNewMessage(conversationId: string, message: any) {
    this.io.to(`conversation:${conversationId}`).emit('message:new', message);
    // Also emit to users who aren't in the conversation room (for notification badges)
    this.io.emit('message:notification', {
      conversationId,
      messageId: message.id,
      senderId: message.sender_id
    });
  }

  // Emit read receipt updates
  emitReadReceipt(conversationId: string, userId: string, messageIds: string[]) {
    this.io.to(`conversation:${conversationId}`).emit('message:read', {
      conversationId,
      userId,
      messageIds,
      readAt: new Date()
    });
  }

  // Periodic cleanup job to mark stale connections as offline
  private startCleanupJob() {
    setInterval(async () => {
      try {
        const staleThreshold = new Date(Date.now() - this.offlineThreshold);

        const result = await this.pool.query(
          `UPDATE user_presence
           SET status = 'offline', socket_id = NULL
           WHERE status != 'offline'
           AND last_seen < $1
           RETURNING user_id`,
          [staleThreshold]
        );

        // Broadcast offline status for stale users
        result.rows.forEach(row => {
          this.broadcastPresenceUpdate(row.user_id, 'offline');
        });

        if (result.rows.length > 0) {
          console.log(`[Presence] Marked ${result.rows.length} stale users as offline`);
        }
      } catch (error) {
        console.error('[Presence] Cleanup job error:', error);
      }
    }, 60000); // Run every minute
  }

  // Get the Socket.IO server instance for external use
  getIO(): Server {
    return this.io;
  }
}

// Singleton instance
let presenceService: PresenceService | null = null;

export function initializePresenceService(
  httpServer: HttpServer,
  pool: pg.Pool,
  allowedOrigins: string[]
): PresenceService {
  if (!presenceService) {
    presenceService = new PresenceService(httpServer, pool, allowedOrigins);
  }
  return presenceService;
}

export function getPresenceService(): PresenceService | null {
  return presenceService;
}
