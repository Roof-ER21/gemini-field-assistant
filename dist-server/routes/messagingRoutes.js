/**
 * Messaging Routes - REST API for team messaging feature
 * Handles conversations, messages, notifications, and shared AI content
 */
import express from 'express';
import { getPresenceService } from '../services/presenceService.js';
const router = express.Router();
// Helper to get message preview
function getMessagePreview(content, maxLength = 100) {
    if (content.text) {
        return content.text.length > maxLength
            ? content.text.substring(0, maxLength) + '...'
            : content.text;
    }
    if (content.attachments && content.attachments.length > 0) {
        return content.attachments.length === 1 ? 'Shared a photo' : 'Shared photos';
    }
    if (content.type === 'poll') {
        return content.poll?.question ? `Poll: ${content.poll.question}` : 'Created a poll';
    }
    if (content.type === 'event') {
        return content.event?.title ? `Event: ${content.event.title}` : 'Created an event';
    }
    if (content.type === 'shared_chat') {
        return 'Shared a Susan AI conversation';
    }
    if (content.type === 'shared_email') {
        return 'Shared a generated email';
    }
    return 'New message';
}
// Create routes with pool injection
export function createMessagingRoutes(pool) {
    // ============================================================================
    // TEAM LIST
    // ============================================================================
    /**
     * GET /api/team
     * Get list of all team members with presence status
     */
    router.get('/team', async (req, res) => {
        try {
            const presenceService = getPresenceService();
            if (presenceService) {
                const users = await presenceService.getPresenceList();
                return res.json({ success: true, users });
            }
            // Fallback without WebSocket
            const result = await pool.query(`SELECT
           u.id as "userId",
           u.name,
           u.email,
           LOWER(SPLIT_PART(u.email, '@', 1)) as username,
           COALESCE(up.status, 'offline') as status,
           COALESCE(up.last_seen, u.last_login_at) as "lastSeen"
         FROM users u
         LEFT JOIN user_presence up ON u.id = up.user_id
         ORDER BY
           CASE COALESCE(up.status, 'offline')
             WHEN 'online' THEN 1
             WHEN 'away' THEN 2
             ELSE 3
           END,
           u.name ASC`);
            res.json({ success: true, users: result.rows });
        }
        catch (error) {
            console.error('Error fetching team:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch team' });
        }
    });
    // ============================================================================
    // CONVERSATIONS
    // ============================================================================
    /**
     * GET /api/messages/conversations
     * Get all conversations for the current user
     */
    router.get('/conversations', async (req, res) => {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        try {
            const result = await pool.query(`SELECT
          c.id,
          c.type,
          c.name,
          c.created_by,
          c.created_at,
          c.updated_at,
          cp.last_read_at,
          cp.is_muted,
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'user_id', u.id,
                'username', LOWER(SPLIT_PART(u.email, '@', 1)),
                'name', u.name,
                'email', u.email
              )
            )
            FROM conversation_participants cp2
            INNER JOIN users u ON u.id = cp2.user_id
            WHERE cp2.conversation_id = c.id
          ) as participants,
          (
            SELECT jsonb_build_object(
              'id', m.id,
              'sender_id', m.sender_id,
              'sender_name', u.name,
              'message_type', m.message_type,
              'content', m.content,
              'created_at', m.created_at
            )
            FROM team_messages m
            INNER JOIN users u ON u.id = m.sender_id
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
          ) as last_message,
          (
            SELECT COUNT(*)::integer
            FROM team_messages m
            WHERE m.conversation_id = c.id
              AND m.created_at > cp.last_read_at
              AND m.sender_id != $1
          ) as unread_count
        FROM conversations c
        INNER JOIN conversation_participants cp ON cp.conversation_id = c.id
        WHERE cp.user_id = $1
        ORDER BY c.updated_at DESC`, [userId]);
            const totalUnread = result.rows.reduce((sum, conv) => sum + (conv.unread_count || 0), 0);
            res.json({
                success: true,
                conversations: result.rows,
                total_unread: totalUnread
            });
        }
        catch (error) {
            console.error('Error fetching conversations:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch conversations' });
        }
    });
    /**
     * POST /api/messages/conversations
     * Create a new conversation (direct or group)
     */
    router.post('/conversations', async (req, res) => {
        const userId = req.userId;
        const { type, name, participant_ids, initial_message } = req.body;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        if (!type || !['direct', 'group'].includes(type)) {
            return res.status(400).json({ success: false, error: 'Invalid conversation type' });
        }
        if (!participant_ids || !Array.isArray(participant_ids) || participant_ids.length === 0) {
            return res.status(400).json({ success: false, error: 'Participant IDs required' });
        }
        if (type === 'direct' && participant_ids.length !== 1) {
            return res.status(400).json({
                success: false,
                error: 'Direct conversations must have exactly one other participant'
            });
        }
        if (type === 'group' && (!name || !name.trim())) {
            return res.status(400).json({ success: false, error: 'Group name required' });
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Validate that all participant IDs exist in the users table
            const participantCheck = await client.query(`SELECT id FROM users WHERE id = ANY($1::uuid[])`, [participant_ids]);
            if (participantCheck.rows.length !== participant_ids.length) {
                await client.query('ROLLBACK');
                const foundIds = participantCheck.rows.map(r => r.id);
                const missingIds = participant_ids.filter(id => !foundIds.includes(id));
                return res.status(400).json({
                    success: false,
                    error: `Invalid participant ID(s): ${missingIds.join(', ')}`
                });
            }
            // Check if direct conversation already exists
            if (type === 'direct') {
                const existingConv = await client.query(`SELECT c.id
           FROM conversations c
           WHERE c.type = 'direct'
             AND EXISTS (
               SELECT 1 FROM conversation_participants cp1
               WHERE cp1.conversation_id = c.id AND cp1.user_id = $1
             )
             AND EXISTS (
               SELECT 1 FROM conversation_participants cp2
               WHERE cp2.conversation_id = c.id AND cp2.user_id = $2
             )
           LIMIT 1`, [userId, participant_ids[0]]);
                if (existingConv.rows.length > 0) {
                    await client.query('COMMIT');
                    return res.json({
                        success: true,
                        conversation: { id: existingConv.rows[0].id },
                        existing: true
                    });
                }
            }
            // Create conversation
            const conversationResult = await client.query(`INSERT INTO conversations (type, name, created_by)
         VALUES ($1, $2, $3)
         RETURNING *`, [type, name || null, userId]);
            const conversationId = conversationResult.rows[0].id;
            // Add all participants (including creator)
            const allParticipants = [userId, ...participant_ids];
            for (const participantId of allParticipants) {
                await client.query(`INSERT INTO conversation_participants (conversation_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT (conversation_id, user_id) DO NOTHING`, [conversationId, participantId]);
            }
            // Send initial message if provided
            if (initial_message && initial_message.content) {
                await client.query(`INSERT INTO team_messages (conversation_id, sender_id, message_type, content)
           VALUES ($1, $2, $3, $4)`, [
                    conversationId,
                    userId,
                    initial_message.message_type || 'text',
                    JSON.stringify(initial_message.content)
                ]);
            }
            await client.query('COMMIT');
            // Fetch complete conversation data
            const finalResult = await pool.query(`SELECT
          c.id,
          c.type,
          c.name,
          c.created_by,
          c.created_at,
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'user_id', u.id,
                'username', LOWER(SPLIT_PART(u.email, '@', 1)),
                'name', u.name,
                'email', u.email
              )
            )
            FROM conversation_participants cp
            INNER JOIN users u ON u.id = cp.user_id
            WHERE cp.conversation_id = c.id
          ) as participants
        FROM conversations c
        WHERE c.id = $1`, [conversationId]);
            res.status(201).json({
                success: true,
                conversation: finalResult.rows[0]
            });
        }
        catch (error) {
            await client.query('ROLLBACK');
            console.error('Error creating conversation:', error);
            res.status(500).json({ success: false, error: 'Failed to create conversation' });
        }
        finally {
            client.release();
        }
    });
    // ============================================================================
    // MESSAGES
    // ============================================================================
    /**
     * GET /api/messages/conversations/:id/messages
     * Get messages for a conversation with pagination
     */
    router.get('/conversations/:id/messages', async (req, res) => {
        const userId = req.userId;
        const conversationId = req.params.id;
        const limit = parseInt(req.query.limit) || 50;
        const beforeId = req.query.before_message_id;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        try {
            // Verify user is participant
            const participantCheck = await pool.query('SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2', [conversationId, userId]);
            if (participantCheck.rows.length === 0) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }
            let query = `
        SELECT
          m.id,
          m.conversation_id,
          m.sender_id,
          m.message_type,
          m.content,
          m.is_edited,
          m.edited_at,
          m.parent_message_id,
          m.created_at,
          m.updated_at,
          jsonb_build_object(
            'id', u.id,
            'username', LOWER(SPLIT_PART(u.email, '@', 1)),
            'name', u.name,
            'email', u.email
          ) as sender,
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', mm.id,
                'mentioned_user_id', mm.mentioned_user_id,
                'is_read', mm.is_read
              )
            )
            FROM message_mentions mm
            WHERE mm.message_id = m.id
          ) as mentions,
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'emoji', r.emoji,
                  'count', r.reaction_count,
                  'user_ids', r.user_ids
                )
              )
              FROM (
                SELECT emoji,
                  COUNT(*)::integer as reaction_count,
                  jsonb_agg(user_id) as user_ids
                FROM message_reactions
                WHERE message_id = m.id
                GROUP BY emoji
              ) r
            ),
            '[]'::jsonb
          ) as reactions,
          COALESCE(
            (
              SELECT jsonb_agg(user_id)
              FROM message_read_receipts
              WHERE message_id = m.id
            ),
            '[]'::jsonb
          ) as read_receipts,
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'option_index', v.option_index,
                  'count', v.vote_count,
                  'user_ids', v.user_ids
                )
              )
              FROM (
                SELECT option_index,
                  COUNT(*)::integer as vote_count,
                  jsonb_agg(user_id) as user_ids
                FROM message_poll_votes
                WHERE message_id = m.id
                GROUP BY option_index
              ) v
            ),
            '[]'::jsonb
          ) as poll_votes,
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'status', r.status,
                  'count', r.rsvp_count,
                  'user_ids', r.user_ids
                )
              )
              FROM (
                SELECT status,
                  COUNT(*)::integer as rsvp_count,
                  jsonb_agg(user_id) as user_ids
                FROM message_event_rsvps
                WHERE message_id = m.id
                GROUP BY status
              ) r
            ),
            '[]'::jsonb
          ) as event_rsvps,
          EXISTS (
            SELECT 1 FROM message_pins mp
            WHERE mp.message_id = m.id
          ) as is_pinned
        FROM team_messages m
        INNER JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = $1
      `;
            const params = [conversationId];
            if (beforeId) {
                params.push(beforeId);
                query += ` AND m.created_at < (SELECT created_at FROM team_messages WHERE id = $${params.length})`;
            }
            query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
            params.push(limit + 1);
            const result = await pool.query(query, params);
            const hasMore = result.rows.length > limit;
            const messages = hasMore ? result.rows.slice(0, limit) : result.rows;
            res.json({
                success: true,
                messages: messages.reverse(), // Chronological order
                has_more: hasMore,
                next_cursor: hasMore ? messages[0].id : null
            });
        }
        catch (error) {
            console.error('Error fetching messages:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch messages' });
        }
    });
    /**
     * POST /api/messages/conversations/:id/messages
     * Send a new message
     */
    router.post('/conversations/:id/messages', async (req, res) => {
        const userId = req.userId;
        const userEmail = req.userEmail;
        const conversationId = req.params.id;
        const { message_type, content, parent_message_id } = req.body;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        if (!message_type || !['text', 'shared_chat', 'shared_email', 'system', 'poll', 'event'].includes(message_type)) {
            return res.status(400).json({ success: false, error: 'Invalid message type' });
        }
        if (!content) {
            return res.status(400).json({ success: false, error: 'Message content required' });
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Verify user is participant
            const participantCheck = await client.query('SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2', [conversationId, userId]);
            if (participantCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, error: 'Access denied' });
            }
            // Insert message
            const messageResult = await client.query(`INSERT INTO team_messages (conversation_id, sender_id, message_type, content, parent_message_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`, [conversationId, userId, message_type, JSON.stringify(content), parent_message_id || null]);
            const message = messageResult.rows[0];
            // Create read receipt for sender
            await client.query(`INSERT INTO message_read_receipts (message_id, user_id, read_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = NOW()`, [message.id, userId]);
            // Process mentions
            let mentionsCreated = 0;
            if (content.mentioned_users && Array.isArray(content.mentioned_users)) {
                for (const mentionedUserId of content.mentioned_users) {
                    if (mentionedUserId === userId)
                        continue; // Don't notify self
                    await client.query(`INSERT INTO message_mentions (message_id, mentioned_user_id)
             VALUES ($1, $2)
             ON CONFLICT (message_id, mentioned_user_id) DO NOTHING`, [message.id, mentionedUserId]);
                    mentionsCreated++;
                }
            }
            // Track shared AI content
            if (message_type === 'shared_chat' || message_type === 'shared_email') {
                const contentType = message_type === 'shared_chat' ? 'susan_chat' : 'susan_email';
                const sessionId = content.shared_data?.session_id;
                await client.query(`INSERT INTO shared_ai_content (message_id, content_type, original_session_id, shared_by)
           VALUES ($1, $2, $3, $4)`, [message.id, contentType, sessionId || null, userId]);
            }
            // Create notification for direct messages
            const conversationInfo = await client.query('SELECT type FROM conversations WHERE id = $1', [conversationId]);
            if (conversationInfo.rows[0].type === 'direct') {
                const otherParticipant = await client.query(`SELECT user_id FROM conversation_participants
           WHERE conversation_id = $1 AND user_id != $2
           LIMIT 1`, [conversationId, userId]);
                if (otherParticipant.rows.length > 0) {
                    const senderInfo = await client.query('SELECT name FROM users WHERE id = $1', [userId]);
                    const notificationResult = await client.query(`INSERT INTO team_notifications (user_id, type, message_id, conversation_id, title, body, data)
             VALUES ($1, 'direct_message', $2, $3, $4, $5, $6)
             RETURNING *`, [
                        otherParticipant.rows[0].user_id,
                        message.id,
                        conversationId,
                        senderInfo.rows[0].name || 'Team Member',
                        getMessagePreview(content),
                        JSON.stringify({
                            sender_id: userId,
                            sender_name: senderInfo.rows[0].name,
                            conversation_id: conversationId
                        })
                    ]);
                    // Emit notification via WebSocket
                    const presenceService = getPresenceService();
                    if (presenceService) {
                        presenceService.emitNotification(otherParticipant.rows[0].user_id, notificationResult.rows[0]);
                    }
                }
            }
            await client.query('COMMIT');
            // Fetch complete message with sender info
            const completeMessage = await pool.query(`SELECT
          m.*,
          jsonb_build_object(
            'id', u.id,
            'username', LOWER(SPLIT_PART(u.email, '@', 1)),
            'name', u.name,
            'email', u.email
          ) as sender,
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'emoji', r.emoji,
                  'count', r.reaction_count,
                  'user_ids', r.user_ids
                )
              )
              FROM (
                SELECT emoji,
                  COUNT(*)::integer as reaction_count,
                  jsonb_agg(user_id) as user_ids
                FROM message_reactions
                WHERE message_id = m.id
                GROUP BY emoji
              ) r
            ),
            '[]'::jsonb
          ) as reactions,
          COALESCE(
            (
              SELECT jsonb_agg(user_id)
              FROM message_read_receipts
              WHERE message_id = m.id
            ),
            '[]'::jsonb
          ) as read_receipts,
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'option_index', v.option_index,
                  'count', v.vote_count,
                  'user_ids', v.user_ids
                )
              )
              FROM (
                SELECT option_index,
                  COUNT(*)::integer as vote_count,
                  jsonb_agg(user_id) as user_ids
                FROM message_poll_votes
                WHERE message_id = m.id
                GROUP BY option_index
              ) v
            ),
            '[]'::jsonb
          ) as poll_votes,
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'status', r.status,
                  'count', r.rsvp_count,
                  'user_ids', r.user_ids
                )
              )
              FROM (
                SELECT status,
                  COUNT(*)::integer as rsvp_count,
                  jsonb_agg(user_id) as user_ids
                FROM message_event_rsvps
                WHERE message_id = m.id
                GROUP BY status
              ) r
            ),
            '[]'::jsonb
          ) as event_rsvps,
          EXISTS (
            SELECT 1 FROM message_pins mp
            WHERE mp.message_id = m.id
          ) as is_pinned
        FROM team_messages m
        INNER JOIN users u ON u.id = m.sender_id
        WHERE m.id = $1`, [message.id]);
            // Emit WebSocket event for real-time delivery
            const presenceService = getPresenceService();
            if (presenceService) {
                presenceService.emitNewMessage(conversationId, completeMessage.rows[0]);
            }
            res.status(201).json({
                success: true,
                message: completeMessage.rows[0],
                mentions_created: mentionsCreated
            });
        }
        catch (error) {
            await client.query('ROLLBACK');
            console.error('Error sending message:', error);
            res.status(500).json({ success: false, error: 'Failed to send message' });
        }
        finally {
            client.release();
        }
    });
    // ============================================================================
    // READ RECEIPTS & NOTIFICATIONS
    // ============================================================================
    /**
     * POST /api/messages/reactions/:messageId
     * Toggle an emoji reaction on a message
     */
    router.post('/reactions/:messageId', async (req, res) => {
        const userId = req.userId;
        const { messageId } = req.params;
        const { emoji } = req.body;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        if (!emoji || typeof emoji !== 'string') {
            return res.status(400).json({ success: false, error: 'Emoji required' });
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const messageResult = await client.query('SELECT conversation_id FROM team_messages WHERE id = $1', [messageId]);
            if (messageResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, error: 'Message not found' });
            }
            const conversationId = messageResult.rows[0].conversation_id;
            // Verify user is participant
            const participantCheck = await client.query('SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2', [conversationId, userId]);
            if (participantCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, error: 'Access denied' });
            }
            const existingReaction = await client.query(`SELECT id FROM message_reactions
         WHERE message_id = $1 AND user_id = $2 AND emoji = $3`, [messageId, userId, emoji]);
            if (existingReaction.rows.length > 0) {
                await client.query('DELETE FROM message_reactions WHERE id = $1', [existingReaction.rows[0].id]);
            }
            else {
                await client.query(`INSERT INTO message_reactions (message_id, user_id, emoji)
           VALUES ($1, $2, $3)
           ON CONFLICT (message_id, user_id, emoji) DO NOTHING`, [messageId, userId, emoji]);
            }
            const reactionsResult = await client.query(`SELECT jsonb_agg(
            jsonb_build_object(
              'emoji', r.emoji,
              'count', r.reaction_count,
              'user_ids', r.user_ids
            )
          ) as reactions
         FROM (
           SELECT emoji,
             COUNT(*)::integer as reaction_count,
             jsonb_agg(user_id) as user_ids
           FROM message_reactions
           WHERE message_id = $1
           GROUP BY emoji
         ) r`, [messageId]);
            await client.query('COMMIT');
            const reactions = reactionsResult.rows[0]?.reactions || [];
            const presenceService = getPresenceService();
            if (presenceService) {
                presenceService.emitReactionUpdate(conversationId, messageId, reactions);
            }
            res.json({ success: true, reactions });
        }
        catch (error) {
            await client.query('ROLLBACK');
            console.error('Error toggling reaction:', error);
            res.status(500).json({ success: false, error: 'Failed to update reaction' });
        }
        finally {
            client.release();
        }
    });
    /**
     * GET /api/messages/search
     * Search messages by text within a conversation or across all conversations
     */
    router.get('/search', async (req, res) => {
        const userId = req.userId;
        const query = req.query.query || '';
        const conversationId = req.query.conversation_id;
        const limit = parseInt(req.query.limit) || 50;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        if (!query.trim()) {
            return res.status(400).json({ success: false, error: 'Search query required' });
        }
        try {
            const params = [userId, `%${query.toLowerCase()}%`];
            let sql = `
        SELECT
          m.id,
          m.conversation_id,
          m.sender_id,
          m.message_type,
          m.content,
          m.created_at,
          jsonb_build_object(
            'id', u.id,
            'username', LOWER(SPLIT_PART(u.email, '@', 1)),
            'name', u.name,
            'email', u.email
          ) as sender
        FROM team_messages m
        INNER JOIN users u ON u.id = m.sender_id
        INNER JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
        WHERE cp.user_id = $1
          AND (
            LOWER(COALESCE(m.content->>'text', m.content->'poll'->>'question', m.content->'event'->>'title', '')) LIKE $2
            OR LOWER(u.name) LIKE $2
          )
      `;
            if (conversationId) {
                params.push(conversationId);
                sql += ` AND m.conversation_id = $${params.length}`;
            }
            sql += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
            params.push(limit);
            const result = await pool.query(sql, params);
            res.json({ success: true, results: result.rows });
        }
        catch (error) {
            console.error('Error searching messages:', error);
            res.status(500).json({ success: false, error: 'Failed to search messages' });
        }
    });
    /**
     * GET /api/messages/conversations/:id/pins
     * List pinned messages for a conversation
     */
    router.get('/conversations/:id/pins', async (req, res) => {
        const userId = req.userId;
        const conversationId = req.params.id;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        try {
            const participantCheck = await pool.query('SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2', [conversationId, userId]);
            if (participantCheck.rows.length === 0) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }
            const result = await pool.query(`SELECT
           mp.id,
           mp.message_id,
           mp.created_at,
           jsonb_build_object(
             'id', m.id,
             'conversation_id', m.conversation_id,
             'sender_id', m.sender_id,
             'message_type', m.message_type,
             'content', m.content,
             'created_at', m.created_at,
             'sender', jsonb_build_object(
               'id', u.id,
               'username', LOWER(SPLIT_PART(u.email, '@', 1)),
               'name', u.name,
               'email', u.email
             )
           ) as message
         FROM message_pins mp
         INNER JOIN team_messages m ON m.id = mp.message_id
         INNER JOIN users u ON u.id = m.sender_id
         WHERE mp.conversation_id = $1
         ORDER BY mp.created_at DESC`, [conversationId]);
            res.json({ success: true, pins: result.rows });
        }
        catch (error) {
            console.error('Error fetching pins:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch pins' });
        }
    });
    /**
     * POST /api/messages/conversations/:id/pins/:messageId
     * Toggle pin on a message
     */
    router.post('/conversations/:id/pins/:messageId', async (req, res) => {
        const userId = req.userId;
        const conversationId = req.params.id;
        const messageId = req.params.messageId;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const participantCheck = await client.query('SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2', [conversationId, userId]);
            if (participantCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, error: 'Access denied' });
            }
            const existingPin = await client.query(`SELECT id FROM message_pins WHERE conversation_id = $1 AND message_id = $2`, [conversationId, messageId]);
            if (existingPin.rows.length > 0) {
                await client.query('DELETE FROM message_pins WHERE id = $1', [existingPin.rows[0].id]);
            }
            else {
                await client.query(`INSERT INTO message_pins (conversation_id, message_id, pinned_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (conversation_id, message_id) DO NOTHING`, [conversationId, messageId, userId]);
            }
            await client.query('COMMIT');
            const presenceService = getPresenceService();
            if (presenceService) {
                presenceService.emitPinUpdate(conversationId, messageId);
            }
            res.json({ success: true, pinned: existingPin.rows.length === 0 });
        }
        catch (error) {
            await client.query('ROLLBACK');
            console.error('Error toggling pin:', error);
            res.status(500).json({ success: false, error: 'Failed to update pin' });
        }
        finally {
            client.release();
        }
    });
    /**
     * POST /api/messages/polls/:messageId/vote
     * Vote on a poll message
     */
    router.post('/polls/:messageId/vote', async (req, res) => {
        const userId = req.userId;
        const { messageId } = req.params;
        const { option_index } = req.body;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        if (typeof option_index !== 'number') {
            return res.status(400).json({ success: false, error: 'Option index required' });
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const messageResult = await client.query('SELECT conversation_id FROM team_messages WHERE id = $1', [messageId]);
            if (messageResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, error: 'Message not found' });
            }
            const conversationId = messageResult.rows[0].conversation_id;
            await client.query(`INSERT INTO message_poll_votes (message_id, user_id, option_index)
         VALUES ($1, $2, $3)
         ON CONFLICT (message_id, user_id) DO UPDATE SET option_index = $3, created_at = NOW()`, [messageId, userId, option_index]);
            const votesResult = await client.query(`SELECT jsonb_agg(
            jsonb_build_object(
              'option_index', v.option_index,
              'count', v.vote_count,
              'user_ids', v.user_ids
            )
          ) as votes
         FROM (
           SELECT option_index,
             COUNT(*)::integer as vote_count,
             jsonb_agg(user_id) as user_ids
           FROM message_poll_votes
           WHERE message_id = $1
           GROUP BY option_index
         ) v`, [messageId]);
            await client.query('COMMIT');
            const votes = votesResult.rows[0]?.votes || [];
            const presenceService = getPresenceService();
            if (presenceService) {
                presenceService.emitPollVoteUpdate(conversationId, messageId, votes);
            }
            res.json({ success: true, votes });
        }
        catch (error) {
            await client.query('ROLLBACK');
            console.error('Error voting on poll:', error);
            res.status(500).json({ success: false, error: 'Failed to vote on poll' });
        }
        finally {
            client.release();
        }
    });
    /**
     * POST /api/messages/events/:messageId/rsvp
     * RSVP to an event message
     */
    router.post('/events/:messageId/rsvp', async (req, res) => {
        const userId = req.userId;
        const { messageId } = req.params;
        const { status } = req.body;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        if (!status || !['going', 'maybe', 'declined'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid RSVP status' });
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const messageResult = await client.query('SELECT conversation_id FROM team_messages WHERE id = $1', [messageId]);
            if (messageResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, error: 'Message not found' });
            }
            const conversationId = messageResult.rows[0].conversation_id;
            await client.query(`INSERT INTO message_event_rsvps (message_id, user_id, status)
         VALUES ($1, $2, $3)
         ON CONFLICT (message_id, user_id) DO UPDATE SET status = $3, created_at = NOW()`, [messageId, userId, status]);
            const rsvpResult = await client.query(`SELECT jsonb_agg(
            jsonb_build_object(
              'status', r.status,
              'count', r.rsvp_count,
              'user_ids', r.user_ids
            )
          ) as rsvps
         FROM (
           SELECT status,
             COUNT(*)::integer as rsvp_count,
             jsonb_agg(user_id) as user_ids
           FROM message_event_rsvps
           WHERE message_id = $1
           GROUP BY status
         ) r`, [messageId]);
            await client.query('COMMIT');
            const rsvps = rsvpResult.rows[0]?.rsvps || [];
            const presenceService = getPresenceService();
            if (presenceService) {
                presenceService.emitEventRsvpUpdate(conversationId, messageId, rsvps);
            }
            res.json({ success: true, rsvps });
        }
        catch (error) {
            await client.query('ROLLBACK');
            console.error('Error updating RSVP:', error);
            res.status(500).json({ success: false, error: 'Failed to update RSVP' });
        }
        finally {
            client.release();
        }
    });
    /**
     * POST /api/messages/mark-read
     * Mark messages as read
     */
    router.post('/mark-read', async (req, res) => {
        const userId = req.userId;
        const { conversation_id, message_ids } = req.body;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            if (conversation_id) {
                // Mark all messages in conversation as read
                await client.query(`UPDATE conversation_participants
           SET last_read_at = NOW()
           WHERE conversation_id = $1 AND user_id = $2`, [conversation_id, userId]);
                const messageRows = await client.query(`SELECT id FROM team_messages
           WHERE conversation_id = $1 AND sender_id != $2
           ORDER BY created_at DESC
           LIMIT 100`, [conversation_id, userId]);
                const messageIds = messageRows.rows.map(r => r.id);
                for (const messageId of messageIds) {
                    await client.query(`INSERT INTO message_read_receipts (message_id, user_id, read_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = NOW()`, [messageId, userId]);
                }
                // Mark mentions as read
                await client.query(`UPDATE message_mentions
           SET is_read = true
           WHERE mentioned_user_id = $1
             AND message_id IN (
               SELECT id FROM team_messages WHERE conversation_id = $2
             )`, [userId, conversation_id]);
                // Emit read receipt via WebSocket
                const presenceService = getPresenceService();
                if (presenceService) {
                    presenceService.emitReadReceipt(conversation_id, userId, messageIds);
                }
            }
            else if (message_ids && message_ids.length > 0) {
                // Mark specific messages as read
                for (const messageId of message_ids) {
                    await client.query(`INSERT INTO message_read_receipts (message_id, user_id, read_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = NOW()`, [messageId, userId]);
                }
                // Mark mentions as read
                await client.query(`UPDATE message_mentions
           SET is_read = true
           WHERE mentioned_user_id = $1 AND message_id = ANY($2::uuid[])`, [userId, message_ids]);
            }
            else {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    error: 'Either conversation_id or message_ids required'
                });
            }
            await client.query('COMMIT');
            res.json({ success: true });
        }
        catch (error) {
            await client.query('ROLLBACK');
            console.error('Error marking as read:', error);
            res.status(500).json({ success: false, error: 'Failed to mark as read' });
        }
        finally {
            client.release();
        }
    });
    /**
     * GET /api/messages/unread-count
     * Get total unread message count
     */
    router.get('/unread-count', async (req, res) => {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        try {
            const result = await pool.query(`SELECT
          (
            SELECT COALESCE(SUM(
              (SELECT COUNT(*)
               FROM team_messages m
               WHERE m.conversation_id = cp.conversation_id
                 AND m.created_at > cp.last_read_at
                 AND m.sender_id != $1)
            ), 0)::integer
            FROM conversation_participants cp
            WHERE cp.user_id = $1
          ) as total_unread,
          (
            SELECT COUNT(*)::integer
            FROM message_mentions
            WHERE mentioned_user_id = $1 AND is_read = false
          ) as unread_mentions`, [userId]);
            res.json({
                success: true,
                total_unread: result.rows[0].total_unread || 0,
                unread_mentions: result.rows[0].unread_mentions || 0
            });
        }
        catch (error) {
            console.error('Error fetching unread count:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch unread count' });
        }
    });
    /**
     * GET /api/messages/notifications
     * Get user notifications
     */
    router.get('/notifications', async (req, res) => {
        const userId = req.userId;
        const limit = parseInt(req.query.limit) || 50;
        const unreadOnly = req.query.unread_only === 'true';
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        try {
            let query = `
        SELECT *
        FROM team_notifications
        WHERE user_id = $1
      `;
            const params = [userId];
            if (unreadOnly) {
                query += ` AND is_read = false`;
            }
            query += ` ORDER BY created_at DESC LIMIT $2`;
            params.push(limit);
            const result = await pool.query(query, params);
            const countResult = await pool.query('SELECT COUNT(*)::integer as unread_count FROM team_notifications WHERE user_id = $1 AND is_read = false', [userId]);
            res.json({
                success: true,
                notifications: result.rows,
                unread_count: countResult.rows[0].unread_count
            });
        }
        catch (error) {
            console.error('Error fetching notifications:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
        }
    });
    /**
     * POST /api/messages/notifications/mark-all-read
     * Mark all notifications as read
     * NOTE: This must come BEFORE :id/read to avoid Express matching "mark-all-read" as an id
     */
    router.post('/notifications/mark-all-read', async (req, res) => {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        try {
            await pool.query(`UPDATE team_notifications
         SET is_read = true, read_at = NOW()
         WHERE user_id = $1 AND is_read = false`, [userId]);
            res.json({ success: true });
        }
        catch (error) {
            console.error('Error marking notifications as read:', error);
            res.status(500).json({ success: false, error: 'Failed to mark notifications as read' });
        }
    });
    /**
     * POST /api/messages/notifications/:id/read
     * Mark a single notification as read
     */
    router.post('/notifications/:id/read', async (req, res) => {
        const userId = req.userId;
        const { id } = req.params;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        try {
            await pool.query(`UPDATE team_notifications
         SET is_read = true, read_at = NOW()
         WHERE id = $1 AND user_id = $2`, [id, userId]);
            res.json({ success: true });
        }
        catch (error) {
            console.error('Error marking notification as read:', error);
            res.status(500).json({ success: false, error: 'Failed to mark notification as read' });
        }
    });
    return router;
}
export default createMessagingRoutes;
