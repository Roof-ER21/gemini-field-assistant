/**
 * LiveKit Routes - Team video rooms, 1:1 calling, chat, recording
 *
 * Endpoints:
 *   POST /api/livekit/token              - Generate room access token
 *   POST /api/livekit/sessions           - Create a live session (broadcast or call)
 *   GET  /api/livekit/sessions           - List active sessions
 *   GET  /api/livekit/sessions/history   - Past sessions with participants & recordings
 *   POST /api/livekit/sessions/:id/join  - Join a session
 *   POST /api/livekit/sessions/:id/leave - Leave a session
 *   POST /api/livekit/sessions/:id/end   - End a session (host only)
 *   POST /api/livekit/sessions/force-end - Force-end stuck sessions
 *
 *   -- Chat --
 *   POST /api/livekit/sessions/:id/messages      - Send a chat message
 *   GET  /api/livekit/sessions/:id/messages       - Get chat messages
 *
 *   -- 1:1 Calling --
 *   POST /api/livekit/call                - Initiate a 1:1 call
 *   GET  /api/livekit/call/pending        - Get pending incoming calls
 *   POST /api/livekit/call/:id/accept     - Accept a call
 *   POST /api/livekit/call/:id/decline    - Decline a call
 *   POST /api/livekit/call/:id/cancel     - Cancel outgoing call
 *
 *   -- Recording --
 *   POST /api/livekit/sessions/:id/record/start - Start recording
 *   POST /api/livekit/sessions/:id/record/stop  - Stop recording
 *   GET  /api/livekit/sessions/:id/recordings    - List recordings for session
 *
 *   GET  /api/livekit/status              - Check if LiveKit is configured
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { AccessToken, EgressClient, EncodedFileOutput, EncodedFileType } from 'livekit-server-sdk';
import { PushNotificationService } from '../services/pushNotificationService.js';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_HTTP_URL = LIVEKIT_URL
  ? LIVEKIT_URL.replace('wss://', 'https://').replace('ws://', 'http://')
  : '';

export function createLiveKitRoutes(pool: Pool) {
  const router = Router();

  const isConfigured = () => LIVEKIT_API_KEY && LIVEKIT_API_SECRET && LIVEKIT_URL;

  // Helper to get push service (set on app in index.ts)
  const getPushService = (req: Request): PushNotificationService | null => {
    try {
      return req.app.get('pushNotificationService') || null;
    } catch { return null; }
  };

  // Helper to notify team when someone goes live
  const notifyTeamGoLive = async (req: Request, hostUserId: string, sessionTitle: string) => {
    const push = getPushService(req);
    if (!push) return;

    try {
      // Get host name
      const hostResult = await pool.query(`SELECT name, email FROM users WHERE id = $1`, [hostUserId]);
      const hostName = hostResult.rows[0]?.name || hostResult.rows[0]?.email || 'Someone';

      // Get all other active users
      const usersResult = await pool.query(
        `SELECT id FROM users WHERE id != $1 AND is_active = true`,
        [hostUserId]
      );

      // Send push to each user (fire-and-forget)
      for (const user of usersResult.rows) {
        push.sendToUser(user.id, {
          title: `${hostName} is live!`,
          body: sessionTitle,
          data: { type: 'live_session', action: 'go_live' },
        }, 'team_mention').catch(() => {});
      }
    } catch (err) {
      console.warn('[LiveKit] Push notification error (non-fatal):', err);
    }
  };

  // Helper to notify user of incoming call
  const notifyIncomingCall = async (req: Request, calleeId: string, callerName: string, inviteId: string) => {
    const push = getPushService(req);
    if (!push) return;

    try {
      await push.sendToUser(calleeId, {
        title: `Incoming call`,
        body: `${callerName} is calling you`,
        data: { type: 'incoming_call', invite_id: inviteId, caller_name: callerName },
      }, 'team_message');
    } catch (err) {
      console.warn('[LiveKit] Call push error (non-fatal):', err);
    }
  };

  // =====================================================
  // TOKEN
  // =====================================================

  router.post('/api/livekit/token', async (req: Request, res: Response) => {
    try {
      if (!isConfigured()) {
        return res.status(503).json({ error: 'LiveKit not configured.' });
      }

      const { roomName, identity, name } = req.body;
      if (!roomName || !identity) {
        return res.status(400).json({ error: 'roomName and identity are required' });
      }

      const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity,
        name: name || identity,
        ttl: '4h',
      });

      token.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });

      const jwt = await token.toJwt();
      res.json({ token: jwt, url: LIVEKIT_URL });
    } catch (error) {
      console.error('[LiveKit] Token error:', error);
      res.status(500).json({ error: 'Failed to generate token' });
    }
  });

  // =====================================================
  // CREATE SESSION (broadcast or call)
  // =====================================================

  router.post('/api/livekit/sessions', async (req: Request, res: Response) => {
    try {
      const { userId, title, sessionType, jobId } = req.body;
      if (!userId) return res.status(400).json({ error: 'userId is required' });

      const type = sessionType || 'broadcast';

      // Check for existing active session (broadcasts only — calls can co-exist)
      if (type === 'broadcast') {
        const existing = await pool.query(
          `SELECT id FROM live_sessions WHERE host_user_id = $1 AND status = 'active' AND session_type = 'broadcast'`,
          [userId]
        );
        if (existing.rows.length > 0) {
          return res.status(409).json({ error: 'You already have an active session', sessionId: existing.rows[0].id });
        }
      }

      const roomName = `${type === 'call' ? 'call' : 'live'}-${userId.slice(0, 8)}-${Date.now()}`;
      const sessionTitle = title || (type === 'call' ? 'Video Call' : 'Live Session');

      const result = await pool.query(
        `INSERT INTO live_sessions (room_name, title, host_user_id, status, participant_count, session_type, job_id)
         VALUES ($1, $2, $3, 'active', 1, $4, $5)
         RETURNING *`,
        [roomName, sessionTitle, userId, type, jobId || null]
      );

      await pool.query(
        `INSERT INTO live_session_participants (session_id, user_id, role)
         VALUES ($1, $2, 'host')`,
        [result.rows[0].id, userId]
      );

      const hostInfo = await pool.query(`SELECT id, name, email FROM users WHERE id = $1`, [userId]);

      const session = {
        ...result.rows[0],
        host: hostInfo.rows[0] || null,
        participants: [{ userId, role: 'host', joinedAt: new Date() }],
      };

      // Push notifications for broadcasts (not 1:1 calls)
      if (type === 'broadcast') {
        notifyTeamGoLive(req, userId, sessionTitle);
      }

      res.json(session);
    } catch (error) {
      console.error('[LiveKit] Create session error:', error);
      res.status(500).json({ error: 'Failed to create session' });
    }
  });

  // =====================================================
  // LIST ACTIVE SESSIONS
  // =====================================================

  router.get('/api/livekit/sessions', async (_req: Request, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT ls.*, u.name AS host_name, u.email AS host_email
        FROM live_sessions ls
        JOIN users u ON ls.host_user_id = u.id
        WHERE ls.status = 'active' AND ls.session_type = 'broadcast'
        ORDER BY ls.started_at DESC
      `);

      const sessions = await Promise.all(result.rows.map(async (session) => {
        const participants = await pool.query(`
          SELECT lsp.*, u.name, u.email
          FROM live_session_participants lsp
          JOIN users u ON lsp.user_id = u.id
          WHERE lsp.session_id = $1 AND lsp.left_at IS NULL
        `, [session.id]);

        return {
          ...session,
          host: { id: session.host_user_id, name: session.host_name, email: session.host_email },
          participants: participants.rows.map(p => ({
            userId: p.user_id, name: p.name, role: p.role, joinedAt: p.joined_at,
          })),
          participantCount: participants.rows.length,
        };
      }));

      res.json({ sessions, configured: isConfigured() });
    } catch (error) {
      console.error('[LiveKit] List sessions error:', error);
      res.status(500).json({ error: 'Failed to list sessions' });
    }
  });

  // =====================================================
  // SESSION HISTORY
  // =====================================================

  router.get('/api/livekit/sessions/history', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await pool.query(`
        SELECT
          ls.*,
          u.name AS host_name,
          u.email AS host_email,
          (SELECT COUNT(*) FROM live_session_participants lsp WHERE lsp.session_id = ls.id) AS total_participants,
          (SELECT json_agg(json_build_object(
            'id', r.id, 'status', r.status, 'file_url', r.file_url,
            'duration_seconds', r.duration_seconds, 'started_at', r.started_at
          )) FROM live_session_recordings r WHERE r.session_id = ls.id) AS recordings
        FROM live_sessions ls
        JOIN users u ON ls.host_user_id = u.id
        WHERE ls.status = 'ended'
        ORDER BY ls.ended_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      // Get total count for pagination
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM live_sessions WHERE status = 'ended'`
      );

      // Get participants for each session
      const sessions = await Promise.all(result.rows.map(async (session) => {
        const participants = await pool.query(`
          SELECT lsp.user_id, u.name, u.email, lsp.role, lsp.joined_at, lsp.left_at
          FROM live_session_participants lsp
          JOIN users u ON lsp.user_id = u.id
          WHERE lsp.session_id = $1
          ORDER BY lsp.joined_at
        `, [session.id]);

        return {
          ...session,
          host: { id: session.host_user_id, name: session.host_name, email: session.host_email },
          participants: participants.rows.map(p => ({
            userId: p.user_id, name: p.name, email: p.email,
            role: p.role, joinedAt: p.joined_at, leftAt: p.left_at,
          })),
          recordings: session.recordings || [],
        };
      }));

      res.json({
        sessions,
        total: parseInt(countResult.rows[0].count),
        limit,
        offset,
      });
    } catch (error) {
      console.error('[LiveKit] Session history error:', error);
      res.status(500).json({ error: 'Failed to get session history' });
    }
  });

  // =====================================================
  // JOIN / LEAVE / END
  // =====================================================

  router.post('/api/livekit/sessions/:id/join', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: 'userId is required' });

      const session = await pool.query(
        `SELECT * FROM live_sessions WHERE id = $1 AND status = 'active'`, [id]
      );
      if (session.rows.length === 0) {
        return res.status(404).json({ error: 'Session not found or already ended' });
      }

      await pool.query(`
        INSERT INTO live_session_participants (session_id, user_id, role, joined_at, left_at)
        VALUES ($1, $2, 'viewer', NOW(), NULL)
        ON CONFLICT (session_id, user_id)
        DO UPDATE SET left_at = NULL, joined_at = NOW()
      `, [id, userId]);

      const countResult = await pool.query(
        `SELECT COUNT(*) FROM live_session_participants WHERE session_id = $1 AND left_at IS NULL`, [id]
      );
      const count = parseInt(countResult.rows[0].count);
      await pool.query(
        `UPDATE live_sessions SET participant_count = $1, max_participants = GREATEST(max_participants, $1) WHERE id = $2`,
        [count, id]
      );

      res.json({ roomName: session.rows[0].room_name, participantCount: count });
    } catch (error) {
      console.error('[LiveKit] Join error:', error);
      res.status(500).json({ error: 'Failed to join session' });
    }
  });

  router.post('/api/livekit/sessions/:id/leave', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: 'userId is required' });

      await pool.query(
        `UPDATE live_session_participants SET left_at = NOW() WHERE session_id = $1 AND user_id = $2`,
        [id, userId]
      );

      const countResult = await pool.query(
        `SELECT COUNT(*) FROM live_session_participants WHERE session_id = $1 AND left_at IS NULL`, [id]
      );
      await pool.query(
        `UPDATE live_sessions SET participant_count = $1 WHERE id = $2`,
        [parseInt(countResult.rows[0].count), id]
      );

      res.json({ success: true });
    } catch (error) {
      console.error('[LiveKit] Leave error:', error);
      res.status(500).json({ error: 'Failed to leave session' });
    }
  });

  router.post('/api/livekit/sessions/:id/end', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: 'userId is required' });

      const session = await pool.query(
        `SELECT * FROM live_sessions WHERE id = $1 AND status = 'active'`, [id]
      );
      if (session.rows.length === 0) {
        return res.status(404).json({ error: 'Session not found' });
      }
      if (session.rows[0].host_user_id !== userId) {
        return res.status(403).json({ error: 'Only the host can end a session' });
      }

      const startedAt = new Date(session.rows[0].started_at);
      const durationSeconds = Math.round((Date.now() - startedAt.getTime()) / 1000);

      await pool.query(
        `UPDATE live_sessions SET status = 'ended', ended_at = NOW(), duration_seconds = $1 WHERE id = $2`,
        [durationSeconds, id]
      );
      await pool.query(
        `UPDATE live_session_participants SET left_at = NOW() WHERE session_id = $1 AND left_at IS NULL`, [id]
      );

      res.json({ success: true, durationSeconds });
    } catch (error) {
      console.error('[LiveKit] End error:', error);
      res.status(500).json({ error: 'Failed to end session' });
    }
  });

  router.post('/api/livekit/sessions/force-end', async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: 'userId is required' });

      const result = await pool.query(
        `UPDATE live_sessions SET status = 'ended', ended_at = NOW()
         WHERE host_user_id = $1 AND status = 'active' RETURNING id`,
        [userId]
      );

      for (const row of result.rows) {
        await pool.query(
          `UPDATE live_session_participants SET left_at = NOW() WHERE session_id = $1 AND left_at IS NULL`,
          [row.id]
        );
      }

      res.json({ success: true, ended: result.rows.length });
    } catch (error) {
      console.error('[LiveKit] Force-end error:', error);
      res.status(500).json({ error: 'Failed to force-end sessions' });
    }
  });

  // =====================================================
  // IN-ROOM CHAT
  // =====================================================

  router.post('/api/livekit/sessions/:id/messages', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { userId, message } = req.body;
      if (!userId || !message?.trim()) {
        return res.status(400).json({ error: 'userId and message are required' });
      }

      // Verify session is active
      const session = await pool.query(
        `SELECT id FROM live_sessions WHERE id = $1 AND status = 'active'`, [id]
      );
      if (session.rows.length === 0) {
        return res.status(404).json({ error: 'Session not found or ended' });
      }

      const result = await pool.query(
        `INSERT INTO live_session_messages (session_id, user_id, message)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [id, userId, message.trim()]
      );

      // Get sender name
      const userResult = await pool.query(`SELECT name, email FROM users WHERE id = $1`, [userId]);
      const sender = userResult.rows[0];

      res.json({
        ...result.rows[0],
        sender_name: sender?.name || sender?.email || 'Unknown',
      });
    } catch (error) {
      console.error('[LiveKit] Chat send error:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  router.get('/api/livekit/sessions/:id/messages', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const since = req.query.since as string; // ISO timestamp for polling

      let query = `
        SELECT m.*, u.name AS sender_name, u.email AS sender_email
        FROM live_session_messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.session_id = $1
      `;
      const params: any[] = [id];

      if (since) {
        query += ` AND m.created_at > $2`;
        params.push(since);
      }

      query += ` ORDER BY m.created_at ASC LIMIT 200`;

      const result = await pool.query(query, params);
      res.json({ messages: result.rows });
    } catch (error) {
      console.error('[LiveKit] Chat fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  // =====================================================
  // 1:1 CALLING
  // =====================================================

  router.post('/api/livekit/call', async (req: Request, res: Response) => {
    try {
      const { callerId, calleeId } = req.body;
      if (!callerId || !calleeId) {
        return res.status(400).json({ error: 'callerId and calleeId are required' });
      }

      // Expire any old ringing calls from this caller to this callee (> 60s)
      await pool.query(
        `UPDATE live_call_invites SET status = 'missed'
         WHERE caller_id = $1 AND callee_id = $2 AND status = 'ringing'
         AND created_at < NOW() - INTERVAL '60 seconds'`,
        [callerId, calleeId]
      );

      // Check if there's already a ringing call
      const existing = await pool.query(
        `SELECT id FROM live_call_invites
         WHERE caller_id = $1 AND callee_id = $2 AND status = 'ringing'`,
        [callerId, calleeId]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Already calling this user', inviteId: existing.rows[0].id });
      }

      // Create a room for the call
      const roomName = `call-${callerId.slice(0, 8)}-${calleeId.slice(0, 8)}-${Date.now()}`;
      const callerInfo = await pool.query(`SELECT name, email FROM users WHERE id = $1`, [callerId]);
      const calleeInfo = await pool.query(`SELECT name, email FROM users WHERE id = $1`, [calleeId]);
      const callerName = callerInfo.rows[0]?.name || callerInfo.rows[0]?.email || 'Unknown';
      const calleeName = calleeInfo.rows[0]?.name || calleeInfo.rows[0]?.email || 'Unknown';

      const title = `Call: ${callerName} → ${calleeName}`;

      // Create session
      const sessionResult = await pool.query(
        `INSERT INTO live_sessions (room_name, title, host_user_id, status, participant_count, session_type)
         VALUES ($1, $2, $3, 'active', 1, 'call')
         RETURNING *`,
        [roomName, title, callerId]
      );

      await pool.query(
        `INSERT INTO live_session_participants (session_id, user_id, role) VALUES ($1, $2, 'host')`,
        [sessionResult.rows[0].id, callerId]
      );

      // Create invite
      const inviteResult = await pool.query(
        `INSERT INTO live_call_invites (caller_id, callee_id, session_id, status)
         VALUES ($1, $2, $3, 'ringing')
         RETURNING *`,
        [callerId, calleeId, sessionResult.rows[0].id]
      );

      // Push notification to callee
      notifyIncomingCall(req, calleeId, callerName, inviteResult.rows[0].id);

      res.json({
        invite: inviteResult.rows[0],
        session: sessionResult.rows[0],
        calleeName,
      });
    } catch (error) {
      console.error('[LiveKit] Call initiate error:', error);
      res.status(500).json({ error: 'Failed to initiate call' });
    }
  });

  router.get('/api/livekit/call/pending', async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) return res.status(400).json({ error: 'userId is required' });

      // Get ringing calls for this user (less than 60s old)
      const result = await pool.query(`
        SELECT
          ci.*,
          u.name AS caller_name,
          u.email AS caller_email,
          ls.room_name
        FROM live_call_invites ci
        JOIN users u ON ci.caller_id = u.id
        LEFT JOIN live_sessions ls ON ci.session_id = ls.id
        WHERE ci.callee_id = $1
          AND ci.status = 'ringing'
          AND ci.created_at > NOW() - INTERVAL '60 seconds'
        ORDER BY ci.created_at DESC
      `, [userId]);

      res.json({ calls: result.rows });
    } catch (error) {
      console.error('[LiveKit] Pending calls error:', error);
      res.status(500).json({ error: 'Failed to get pending calls' });
    }
  });

  router.post('/api/livekit/call/:id/accept', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: 'userId is required' });

      const invite = await pool.query(
        `SELECT * FROM live_call_invites WHERE id = $1 AND callee_id = $2 AND status = 'ringing'`,
        [id, userId]
      );
      if (invite.rows.length === 0) {
        return res.status(404).json({ error: 'Call invite not found or expired' });
      }

      // Update invite
      await pool.query(
        `UPDATE live_call_invites SET status = 'accepted', answered_at = NOW() WHERE id = $1`,
        [id]
      );

      // Add callee as participant
      const sessionId = invite.rows[0].session_id;
      await pool.query(`
        INSERT INTO live_session_participants (session_id, user_id, role)
        VALUES ($1, $2, 'viewer')
        ON CONFLICT (session_id, user_id) DO UPDATE SET left_at = NULL, joined_at = NOW()
      `, [sessionId, userId]);

      await pool.query(
        `UPDATE live_sessions SET participant_count = 2, max_participants = GREATEST(max_participants, 2) WHERE id = $1`,
        [sessionId]
      );

      // Get session info
      const session = await pool.query(`SELECT * FROM live_sessions WHERE id = $1`, [sessionId]);

      res.json({ session: session.rows[0] });
    } catch (error) {
      console.error('[LiveKit] Accept call error:', error);
      res.status(500).json({ error: 'Failed to accept call' });
    }
  });

  router.post('/api/livekit/call/:id/decline', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { userId } = req.body;

      await pool.query(
        `UPDATE live_call_invites SET status = 'declined', ended_at = NOW()
         WHERE id = $1 AND callee_id = $2 AND status = 'ringing'`,
        [id, userId]
      );

      // End the call session too
      const invite = await pool.query(`SELECT session_id FROM live_call_invites WHERE id = $1`, [id]);
      if (invite.rows[0]?.session_id) {
        await pool.query(
          `UPDATE live_sessions SET status = 'ended', ended_at = NOW() WHERE id = $1 AND status = 'active'`,
          [invite.rows[0].session_id]
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error('[LiveKit] Decline call error:', error);
      res.status(500).json({ error: 'Failed to decline call' });
    }
  });

  router.post('/api/livekit/call/:id/cancel', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { userId } = req.body;

      await pool.query(
        `UPDATE live_call_invites SET status = 'cancelled', ended_at = NOW()
         WHERE id = $1 AND caller_id = $2 AND status = 'ringing'`,
        [id, userId]
      );

      // End the call session
      const invite = await pool.query(`SELECT session_id FROM live_call_invites WHERE id = $1`, [id]);
      if (invite.rows[0]?.session_id) {
        await pool.query(
          `UPDATE live_sessions SET status = 'ended', ended_at = NOW() WHERE id = $1 AND status = 'active'`,
          [invite.rows[0].session_id]
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error('[LiveKit] Cancel call error:', error);
      res.status(500).json({ error: 'Failed to cancel call' });
    }
  });

  // =====================================================
  // RECORDING (LiveKit Egress)
  // =====================================================

  router.post('/api/livekit/sessions/:id/record/start', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: 'userId is required' });

      if (!isConfigured()) {
        return res.status(503).json({ error: 'LiveKit not configured' });
      }

      // Get session
      const session = await pool.query(
        `SELECT * FROM live_sessions WHERE id = $1 AND status = 'active'`, [id]
      );
      if (session.rows.length === 0) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Check not already recording
      const activeRecording = await pool.query(
        `SELECT id FROM live_session_recordings WHERE session_id = $1 AND status = 'recording'`, [id]
      );
      if (activeRecording.rows.length > 0) {
        return res.status(409).json({ error: 'Already recording this session' });
      }

      try {
        const egressClient = new EgressClient(LIVEKIT_HTTP_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

        const output = new EncodedFileOutput({
          fileType: EncodedFileType.MP4,
          filepath: `recordings/${session.rows[0].room_name}-{time}.mp4`,
        });

        const egress = await egressClient.startRoomCompositeEgress(
          session.rows[0].room_name,
          { file: output },
        );

        const egressId = egress.egressId;

        const recording = await pool.query(
          `INSERT INTO live_session_recordings (session_id, egress_id, status, started_by)
           VALUES ($1, $2, 'recording', $3)
           RETURNING *`,
          [id, egressId, userId]
        );

        res.json({ recording: recording.rows[0] });
      } catch (egressError: any) {
        console.error('[LiveKit] Egress start error:', egressError);
        // Store failed recording attempt
        await pool.query(
          `INSERT INTO live_session_recordings (session_id, status, started_by, error_message)
           VALUES ($1, 'failed', $2, $3)`,
          [id, userId, egressError.message || 'Egress API error']
        );
        res.status(500).json({
          error: 'Failed to start recording',
          detail: egressError.message || 'Egress API error',
        });
      }
    } catch (error) {
      console.error('[LiveKit] Record start error:', error);
      res.status(500).json({ error: 'Failed to start recording' });
    }
  });

  router.post('/api/livekit/sessions/:id/record/stop', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const recording = await pool.query(
        `SELECT * FROM live_session_recordings WHERE session_id = $1 AND status = 'recording' LIMIT 1`,
        [id]
      );
      if (recording.rows.length === 0) {
        return res.status(404).json({ error: 'No active recording found' });
      }

      const rec = recording.rows[0];

      if (rec.egress_id && isConfigured()) {
        try {
          const egressClient = new EgressClient(LIVEKIT_HTTP_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
          await egressClient.stopEgress(rec.egress_id);
        } catch (egressError) {
          console.warn('[LiveKit] Egress stop warning:', egressError);
        }
      }

      await pool.query(
        `UPDATE live_session_recordings SET status = 'processing', completed_at = NOW() WHERE id = $1`,
        [rec.id]
      );

      res.json({ success: true, recordingId: rec.id });
    } catch (error) {
      console.error('[LiveKit] Record stop error:', error);
      res.status(500).json({ error: 'Failed to stop recording' });
    }
  });

  router.get('/api/livekit/sessions/:id/recordings', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        `SELECT r.*, u.name AS started_by_name
         FROM live_session_recordings r
         LEFT JOIN users u ON r.started_by = u.id
         WHERE r.session_id = $1
         ORDER BY r.started_at DESC`,
        [id]
      );
      res.json({ recordings: result.rows });
    } catch (error) {
      console.error('[LiveKit] Recordings list error:', error);
      res.status(500).json({ error: 'Failed to list recordings' });
    }
  });

  // =====================================================
  // STATUS
  // =====================================================

  router.get('/api/livekit/status', (_req: Request, res: Response) => {
    res.json({
      configured: isConfigured(),
      url: LIVEKIT_URL ? LIVEKIT_URL.replace(/^wss?:\/\//, '').split('.')[0] + '...' : null,
    });
  });

  return router;
}
