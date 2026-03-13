/**
 * LiveKit Routes - Team video room management
 *
 * Endpoints:
 *   POST /api/livekit/token     - Generate room access token
 *   POST /api/livekit/sessions  - Create a new live session
 *   GET  /api/livekit/sessions  - List active sessions
 *   POST /api/livekit/sessions/:id/join  - Join a session
 *   POST /api/livekit/sessions/:id/leave - Leave a session
 *   POST /api/livekit/sessions/:id/end   - End a session (host only)
 */
import { Router } from 'express';
import { AccessToken } from 'livekit-server-sdk';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
export function createLiveKitRoutes(pool) {
    const router = Router();
    // Check if LiveKit is configured
    const isConfigured = () => LIVEKIT_API_KEY && LIVEKIT_API_SECRET && LIVEKIT_URL;
    /**
     * POST /api/livekit/token
     * Generate a LiveKit access token for a user to join a room
     */
    router.post('/api/livekit/token', async (req, res) => {
        try {
            if (!isConfigured()) {
                return res.status(503).json({ error: 'LiveKit not configured. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL.' });
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
        }
        catch (error) {
            console.error('[LiveKit] Token generation error:', error);
            res.status(500).json({ error: 'Failed to generate token' });
        }
    });
    /**
     * POST /api/livekit/sessions
     * Create a new live session (go live)
     */
    router.post('/api/livekit/sessions', async (req, res) => {
        try {
            const { userId, title } = req.body;
            if (!userId) {
                return res.status(400).json({ error: 'userId is required' });
            }
            // Check if user already has an active session
            const existing = await pool.query(`SELECT id FROM live_sessions WHERE host_user_id = $1 AND status = 'active'`, [userId]);
            if (existing.rows.length > 0) {
                return res.status(409).json({ error: 'You already have an active session', sessionId: existing.rows[0].id });
            }
            const roomName = `live-${userId.slice(0, 8)}-${Date.now()}`;
            const sessionTitle = title || 'Live Session';
            const result = await pool.query(`INSERT INTO live_sessions (room_name, title, host_user_id, status, participant_count)
         VALUES ($1, $2, $3, 'active', 1)
         RETURNING *`, [roomName, sessionTitle, userId]);
            // Add host as participant
            await pool.query(`INSERT INTO live_session_participants (session_id, user_id, role)
         VALUES ($1, $2, 'host')`, [result.rows[0].id, userId]);
            // Get host info for the response
            const hostInfo = await pool.query(`SELECT id, name, email FROM users WHERE id = $1`, [userId]);
            const session = {
                ...result.rows[0],
                host: hostInfo.rows[0] || null,
                participants: [{ userId, role: 'host', joinedAt: new Date() }],
            };
            res.json(session);
        }
        catch (error) {
            console.error('[LiveKit] Create session error:', error);
            res.status(500).json({ error: 'Failed to create session' });
        }
    });
    /**
     * GET /api/livekit/sessions
     * List all active live sessions
     */
    router.get('/api/livekit/sessions', async (_req, res) => {
        try {
            const result = await pool.query(`
        SELECT
          ls.*,
          u.name AS host_name,
          u.email AS host_email
        FROM live_sessions ls
        JOIN users u ON ls.host_user_id = u.id
        WHERE ls.status = 'active'
        ORDER BY ls.started_at DESC
      `);
            // Get participant counts
            const sessions = await Promise.all(result.rows.map(async (session) => {
                const participants = await pool.query(`
          SELECT lsp.*, u.name, u.email
          FROM live_session_participants lsp
          JOIN users u ON lsp.user_id = u.id
          WHERE lsp.session_id = $1 AND lsp.left_at IS NULL
        `, [session.id]);
                return {
                    ...session,
                    host: {
                        id: session.host_user_id,
                        name: session.host_name,
                        email: session.host_email,
                    },
                    participants: participants.rows.map(p => ({
                        userId: p.user_id,
                        name: p.name,
                        role: p.role,
                        joinedAt: p.joined_at,
                    })),
                    participantCount: participants.rows.length,
                };
            }));
            res.json({ sessions, configured: isConfigured() });
        }
        catch (error) {
            console.error('[LiveKit] List sessions error:', error);
            res.status(500).json({ error: 'Failed to list sessions' });
        }
    });
    /**
     * POST /api/livekit/sessions/:id/join
     * Join an existing session
     */
    router.post('/api/livekit/sessions/:id/join', async (req, res) => {
        try {
            const { id } = req.params;
            const { userId } = req.body;
            if (!userId)
                return res.status(400).json({ error: 'userId is required' });
            // Verify session is active
            const session = await pool.query(`SELECT * FROM live_sessions WHERE id = $1 AND status = 'active'`, [id]);
            if (session.rows.length === 0) {
                return res.status(404).json({ error: 'Session not found or already ended' });
            }
            // Upsert participant (re-join if they left)
            await pool.query(`
        INSERT INTO live_session_participants (session_id, user_id, role, joined_at, left_at)
        VALUES ($1, $2, 'viewer', NOW(), NULL)
        ON CONFLICT (session_id, user_id)
        DO UPDATE SET left_at = NULL, joined_at = NOW()
      `, [id, userId]);
            // Update participant count
            const countResult = await pool.query(`SELECT COUNT(*) FROM live_session_participants WHERE session_id = $1 AND left_at IS NULL`, [id]);
            const count = parseInt(countResult.rows[0].count);
            await pool.query(`UPDATE live_sessions SET participant_count = $1, max_participants = GREATEST(max_participants, $1) WHERE id = $2`, [count, id]);
            res.json({ roomName: session.rows[0].room_name, participantCount: count });
        }
        catch (error) {
            console.error('[LiveKit] Join session error:', error);
            res.status(500).json({ error: 'Failed to join session' });
        }
    });
    /**
     * POST /api/livekit/sessions/:id/leave
     * Leave a session
     */
    router.post('/api/livekit/sessions/:id/leave', async (req, res) => {
        try {
            const { id } = req.params;
            const { userId } = req.body;
            if (!userId)
                return res.status(400).json({ error: 'userId is required' });
            await pool.query(`UPDATE live_session_participants SET left_at = NOW() WHERE session_id = $1 AND user_id = $2`, [id, userId]);
            // Update participant count
            const countResult = await pool.query(`SELECT COUNT(*) FROM live_session_participants WHERE session_id = $1 AND left_at IS NULL`, [id]);
            await pool.query(`UPDATE live_sessions SET participant_count = $1 WHERE id = $2`, [parseInt(countResult.rows[0].count), id]);
            res.json({ success: true });
        }
        catch (error) {
            console.error('[LiveKit] Leave session error:', error);
            res.status(500).json({ error: 'Failed to leave session' });
        }
    });
    /**
     * POST /api/livekit/sessions/:id/end
     * End a session (host only)
     */
    router.post('/api/livekit/sessions/:id/end', async (req, res) => {
        try {
            const { id } = req.params;
            const { userId } = req.body;
            if (!userId)
                return res.status(400).json({ error: 'userId is required' });
            // Verify host
            const session = await pool.query(`SELECT * FROM live_sessions WHERE id = $1 AND status = 'active'`, [id]);
            if (session.rows.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }
            if (session.rows[0].host_user_id !== userId) {
                return res.status(403).json({ error: 'Only the host can end a session' });
            }
            const startedAt = new Date(session.rows[0].started_at);
            const durationSeconds = Math.round((Date.now() - startedAt.getTime()) / 1000);
            // End session
            await pool.query(`UPDATE live_sessions SET status = 'ended', ended_at = NOW(), duration_seconds = $1 WHERE id = $2`, [durationSeconds, id]);
            // Mark all participants as left
            await pool.query(`UPDATE live_session_participants SET left_at = NOW() WHERE session_id = $1 AND left_at IS NULL`, [id]);
            res.json({ success: true, durationSeconds });
        }
        catch (error) {
            console.error('[LiveKit] End session error:', error);
            res.status(500).json({ error: 'Failed to end session' });
        }
    });
    /**
     * POST /api/livekit/sessions/force-end
     * Force-end all active sessions for a user (cleanup for stuck sessions)
     */
    router.post('/api/livekit/sessions/force-end', async (req, res) => {
        try {
            const { userId } = req.body;
            if (!userId)
                return res.status(400).json({ error: 'userId is required' });
            const result = await pool.query(`UPDATE live_sessions SET status = 'ended', ended_at = NOW()
         WHERE host_user_id = $1 AND status = 'active'
         RETURNING id`, [userId]);
            // Also mark participant records
            for (const row of result.rows) {
                await pool.query(`UPDATE live_session_participants SET left_at = NOW() WHERE session_id = $1 AND left_at IS NULL`, [row.id]);
            }
            res.json({ success: true, ended: result.rows.length });
        }
        catch (error) {
            console.error('[LiveKit] Force-end error:', error);
            res.status(500).json({ error: 'Failed to force-end sessions' });
        }
    });
    /**
     * GET /api/livekit/status
     * Check if LiveKit is configured
     */
    router.get('/api/livekit/status', (_req, res) => {
        res.json({
            configured: isConfigured(),
            url: LIVEKIT_URL ? LIVEKIT_URL.replace(/^wss?:\/\//, '').split('.')[0] + '...' : null,
        });
    });
    return router;
}
