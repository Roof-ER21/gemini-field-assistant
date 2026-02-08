/**
 * Roof Routes - REST API for "The Roof" team feed feature
 * Handles posts, likes, comments, and @mentions for team-wide communication
 */
import express from 'express';
const router = express.Router();
// Helper to extract @mentions from content
function extractMentions(content) {
    const mentionRegex = /@(\w+)/g;
    const matches = content.match(mentionRegex);
    return matches ? matches.map(m => m.substring(1).toLowerCase()) : [];
}
// Create routes with pool injection
export function createRoofRoutes(pool) {
    // ============================================================================
    // POSTS
    // ============================================================================
    /**
     * GET /api/roof/posts
     * Get the team feed (paginated, newest first)
     */
    router.get('/posts', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            const limit = Math.min(parseInt(req.query.limit) || 20, 50);
            const offset = parseInt(req.query.offset) || 0;
            // Get user ID from email
            const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [userEmail]);
            const userId = userResult.rows[0]?.id;
            // Get posts with author info
            const result = await pool.query(`SELECT
           tp.id,
           tp.author_id,
           u.name as author_name,
           u.email as author_email,
           tp.content,
           tp.post_type,
           tp.shared_content,
           tp.like_count,
           tp.comment_count,
           tp.is_pinned,
           tp.created_at,
           tp.updated_at,
           EXISTS(
             SELECT 1 FROM post_likes pl
             WHERE pl.post_id = tp.id AND pl.user_id = $3
           ) as user_liked
         FROM team_posts tp
         JOIN users u ON tp.author_id = u.id
         ORDER BY tp.is_pinned DESC, tp.created_at DESC
         LIMIT $1 OFFSET $2`, [limit, offset, userId]);
            // Get total count for pagination
            const countResult = await pool.query('SELECT COUNT(*) FROM team_posts');
            const totalCount = parseInt(countResult.rows[0].count);
            res.json({
                success: true,
                posts: result.rows,
                pagination: {
                    limit,
                    offset,
                    total: totalCount,
                    hasMore: offset + limit < totalCount
                }
            });
        }
        catch (error) {
            console.error('Error fetching roof posts:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch posts' });
        }
    });
    /**
     * POST /api/roof/posts
     * Create a new post
     */
    router.post('/posts', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            const { content, post_type, shared_content } = req.body;
            console.log('[Roof] POST /posts - email header:', userEmail);
            if (!content || content.trim().length === 0) {
                return res.status(400).json({ success: false, error: 'Content is required' });
            }
            if (!userEmail) {
                console.log('[Roof] POST /posts - No email header provided');
                return res.status(401).json({ success: false, error: 'Authentication required - no email header' });
            }
            // Get user ID from email
            const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [userEmail]);
            if (userResult.rows.length === 0) {
                console.log('[Roof] POST /posts - User not found for email:', userEmail);
                return res.status(401).json({ success: false, error: `User not found: ${userEmail}` });
            }
            const userId = userResult.rows[0].id;
            // Create the post
            const postResult = await pool.query(`INSERT INTO team_posts (author_id, content, post_type, shared_content)
         VALUES ($1, $2, $3, $4)
         RETURNING *`, [userId, content.trim(), post_type || 'text', shared_content ? JSON.stringify(shared_content) : null]);
            const post = postResult.rows[0];
            // Extract and create mentions
            const mentionedUsernames = extractMentions(content);
            if (mentionedUsernames.length > 0) {
                // Find users by username (email prefix)
                const mentionedUsers = await pool.query(`SELECT id FROM users WHERE LOWER(SPLIT_PART(email, '@', 1)) = ANY($1)`, [mentionedUsernames]);
                // Create mention records
                for (const user of mentionedUsers.rows) {
                    await pool.query(`INSERT INTO post_mentions (post_id, mentioned_user_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`, [post.id, user.id]);
                }
            }
            // Get post with author info
            const fullPostResult = await pool.query(`SELECT
           tp.id,
           tp.author_id,
           u.name as author_name,
           u.email as author_email,
           tp.content,
           tp.post_type,
           tp.shared_content,
           tp.like_count,
           tp.comment_count,
           tp.is_pinned,
           tp.created_at,
           tp.updated_at,
           false as user_liked
         FROM team_posts tp
         JOIN users u ON tp.author_id = u.id
         WHERE tp.id = $1`, [post.id]);
            res.status(201).json({
                success: true,
                post: fullPostResult.rows[0]
            });
        }
        catch (error) {
            console.error('Error creating post:', error);
            res.status(500).json({ success: false, error: 'Failed to create post' });
        }
    });
    /**
     * GET /api/roof/posts/:id
     * Get a single post with its comments
     */
    router.get('/posts/:id', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            const { id } = req.params;
            // Get user ID from email
            const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [userEmail]);
            const userId = userResult.rows[0]?.id;
            // Get post with author info
            const postResult = await pool.query(`SELECT
           tp.id,
           tp.author_id,
           u.name as author_name,
           u.email as author_email,
           tp.content,
           tp.post_type,
           tp.shared_content,
           tp.like_count,
           tp.comment_count,
           tp.is_pinned,
           tp.created_at,
           tp.updated_at,
           EXISTS(
             SELECT 1 FROM post_likes pl
             WHERE pl.post_id = tp.id AND pl.user_id = $2
           ) as user_liked
         FROM team_posts tp
         JOIN users u ON tp.author_id = u.id
         WHERE tp.id = $1`, [id, userId]);
            if (postResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Post not found' });
            }
            res.json({
                success: true,
                post: postResult.rows[0]
            });
        }
        catch (error) {
            console.error('Error fetching post:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch post' });
        }
    });
    /**
     * DELETE /api/roof/posts/:id
     * Delete a post (only author can delete)
     */
    router.delete('/posts/:id', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            const { id } = req.params;
            // Get user ID from email
            const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [userEmail]);
            if (userResult.rows.length === 0) {
                return res.status(401).json({ success: false, error: 'User not found' });
            }
            const userId = userResult.rows[0].id;
            // Delete only if author matches
            const deleteResult = await pool.query('DELETE FROM team_posts WHERE id = $1 AND author_id = $2 RETURNING id', [id, userId]);
            if (deleteResult.rows.length === 0) {
                return res.status(403).json({ success: false, error: 'Not authorized to delete this post' });
            }
            res.json({ success: true, message: 'Post deleted' });
        }
        catch (error) {
            console.error('Error deleting post:', error);
            res.status(500).json({ success: false, error: 'Failed to delete post' });
        }
    });
    /**
     * POST /api/roof/posts/:id/pin
     * Toggle pinned status (author only)
     */
    router.post('/posts/:id/pin', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            const { id } = req.params;
            if (!userEmail) {
                return res.status(401).json({ success: false, error: 'User email is required' });
            }
            const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [userEmail]);
            const userId = userResult.rows[0]?.id;
            if (!userId) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }
            const postResult = await pool.query('SELECT author_id FROM team_posts WHERE id = $1', [id]);
            if (postResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Post not found' });
            }
            if (postResult.rows[0].author_id !== userId) {
                return res.status(403).json({ success: false, error: 'Only the author can pin this post' });
            }
            const updated = await pool.query('UPDATE team_posts SET is_pinned = NOT is_pinned, updated_at = NOW() WHERE id = $1 RETURNING is_pinned', [id]);
            res.json({ success: true, is_pinned: updated.rows[0]?.is_pinned });
        }
        catch (error) {
            console.error('Error toggling post pin:', error);
            res.status(500).json({ success: false, error: 'Failed to toggle pin' });
        }
    });
    // ============================================================================
    // LIKES
    // ============================================================================
    /**
     * POST /api/roof/posts/:id/like
     * Like a post
     */
    router.post('/posts/:id/like', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            const { id } = req.params;
            // Get user ID from email
            const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [userEmail]);
            if (userResult.rows.length === 0) {
                return res.status(401).json({ success: false, error: 'User not found' });
            }
            const userId = userResult.rows[0].id;
            // Insert like (ignore if already exists due to unique constraint)
            await pool.query(`INSERT INTO post_likes (post_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (post_id, user_id) DO NOTHING`, [id, userId]);
            // Get updated like count
            const countResult = await pool.query('SELECT like_count FROM team_posts WHERE id = $1', [id]);
            res.json({
                success: true,
                like_count: countResult.rows[0]?.like_count || 0
            });
        }
        catch (error) {
            console.error('Error liking post:', error);
            res.status(500).json({ success: false, error: 'Failed to like post' });
        }
    });
    /**
     * DELETE /api/roof/posts/:id/like
     * Unlike a post
     */
    router.delete('/posts/:id/like', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            const { id } = req.params;
            // Get user ID from email
            const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [userEmail]);
            if (userResult.rows.length === 0) {
                return res.status(401).json({ success: false, error: 'User not found' });
            }
            const userId = userResult.rows[0].id;
            // Delete like
            await pool.query('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [id, userId]);
            // Get updated like count
            const countResult = await pool.query('SELECT like_count FROM team_posts WHERE id = $1', [id]);
            res.json({
                success: true,
                like_count: countResult.rows[0]?.like_count || 0
            });
        }
        catch (error) {
            console.error('Error unliking post:', error);
            res.status(500).json({ success: false, error: 'Failed to unlike post' });
        }
    });
    // ============================================================================
    // COMMENTS
    // ============================================================================
    /**
     * GET /api/roof/posts/:id/comments
     * Get comments for a post
     */
    router.get('/posts/:id/comments', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            const { id } = req.params;
            // Get user ID from email
            const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [userEmail]);
            const userId = userResult.rows[0]?.id;
            // Get comments with author info
            const result = await pool.query(`SELECT
           pc.id,
           pc.post_id,
           pc.author_id,
           u.name as author_name,
           u.email as author_email,
           pc.content,
           pc.parent_comment_id,
           pc.like_count,
           pc.created_at,
           pc.updated_at,
           EXISTS(
             SELECT 1 FROM comment_likes cl
             WHERE cl.comment_id = pc.id AND cl.user_id = $2
           ) as user_liked
         FROM post_comments pc
         JOIN users u ON pc.author_id = u.id
         WHERE pc.post_id = $1
         ORDER BY pc.created_at ASC`, [id, userId]);
            res.json({
                success: true,
                comments: result.rows
            });
        }
        catch (error) {
            console.error('Error fetching comments:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch comments' });
        }
    });
    /**
     * POST /api/roof/posts/:id/comments
     * Add a comment to a post
     */
    router.post('/posts/:id/comments', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            const { id } = req.params;
            const { content, parent_comment_id } = req.body;
            if (!content || content.trim().length === 0) {
                return res.status(400).json({ success: false, error: 'Content is required' });
            }
            // Get user ID from email
            const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [userEmail]);
            if (userResult.rows.length === 0) {
                return res.status(401).json({ success: false, error: 'User not found' });
            }
            const userId = userResult.rows[0].id;
            // Create comment
            const commentResult = await pool.query(`INSERT INTO post_comments (post_id, author_id, content, parent_comment_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`, [id, userId, content.trim(), parent_comment_id || null]);
            const comment = commentResult.rows[0];
            // Extract and create mentions
            const mentionedUsernames = extractMentions(content);
            if (mentionedUsernames.length > 0) {
                const mentionedUsers = await pool.query(`SELECT id FROM users WHERE LOWER(SPLIT_PART(email, '@', 1)) = ANY($1)`, [mentionedUsernames]);
                for (const user of mentionedUsers.rows) {
                    await pool.query(`INSERT INTO post_mentions (comment_id, mentioned_user_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`, [comment.id, user.id]);
                }
            }
            // Get comment with author info
            const fullCommentResult = await pool.query(`SELECT
           pc.id,
           pc.post_id,
           pc.author_id,
           u.name as author_name,
           u.email as author_email,
           pc.content,
           pc.parent_comment_id,
           pc.like_count,
           pc.created_at,
           pc.updated_at,
           false as user_liked
         FROM post_comments pc
         JOIN users u ON pc.author_id = u.id
         WHERE pc.id = $1`, [comment.id]);
            res.status(201).json({
                success: true,
                comment: fullCommentResult.rows[0]
            });
        }
        catch (error) {
            console.error('Error creating comment:', error);
            res.status(500).json({ success: false, error: 'Failed to create comment' });
        }
    });
    /**
     * DELETE /api/roof/comments/:id
     * Delete a comment (only author can delete)
     */
    router.delete('/comments/:id', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            const { id } = req.params;
            // Get user ID from email
            const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [userEmail]);
            if (userResult.rows.length === 0) {
                return res.status(401).json({ success: false, error: 'User not found' });
            }
            const userId = userResult.rows[0].id;
            // Delete only if author matches
            const deleteResult = await pool.query('DELETE FROM post_comments WHERE id = $1 AND author_id = $2 RETURNING id', [id, userId]);
            if (deleteResult.rows.length === 0) {
                return res.status(403).json({ success: false, error: 'Not authorized to delete this comment' });
            }
            res.json({ success: true, message: 'Comment deleted' });
        }
        catch (error) {
            console.error('Error deleting comment:', error);
            res.status(500).json({ success: false, error: 'Failed to delete comment' });
        }
    });
    /**
     * POST /api/roof/comments/:id/like
     * Like a comment
     */
    router.post('/comments/:id/like', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            const { id } = req.params;
            // Get user ID from email
            const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [userEmail]);
            if (userResult.rows.length === 0) {
                return res.status(401).json({ success: false, error: 'User not found' });
            }
            const userId = userResult.rows[0].id;
            // Insert like
            await pool.query(`INSERT INTO comment_likes (comment_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (comment_id, user_id) DO NOTHING`, [id, userId]);
            // Get updated like count
            const countResult = await pool.query('SELECT like_count FROM post_comments WHERE id = $1', [id]);
            res.json({
                success: true,
                like_count: countResult.rows[0]?.like_count || 0
            });
        }
        catch (error) {
            console.error('Error liking comment:', error);
            res.status(500).json({ success: false, error: 'Failed to like comment' });
        }
    });
    /**
     * DELETE /api/roof/comments/:id/like
     * Unlike a comment
     */
    router.delete('/comments/:id/like', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            const { id } = req.params;
            // Get user ID from email
            const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [userEmail]);
            if (userResult.rows.length === 0) {
                return res.status(401).json({ success: false, error: 'User not found' });
            }
            const userId = userResult.rows[0].id;
            // Delete like
            await pool.query('DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2', [id, userId]);
            // Get updated like count
            const countResult = await pool.query('SELECT like_count FROM post_comments WHERE id = $1', [id]);
            res.json({
                success: true,
                like_count: countResult.rows[0]?.like_count || 0
            });
        }
        catch (error) {
            console.error('Error unliking comment:', error);
            res.status(500).json({ success: false, error: 'Failed to unlike comment' });
        }
    });
    // ============================================================================
    // MENTIONS
    // ============================================================================
    /**
     * GET /api/roof/mentions
     * Get unread mentions for current user
     */
    router.get('/mentions', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            // Get user ID from email
            const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [userEmail]);
            if (userResult.rows.length === 0) {
                return res.status(401).json({ success: false, error: 'User not found' });
            }
            const userId = userResult.rows[0].id;
            // Get unread mentions with context
            const result = await pool.query(`SELECT
           pm.id,
           pm.post_id,
           pm.comment_id,
           pm.is_read,
           pm.created_at,
           tp.content as post_content,
           pc.content as comment_content,
           COALESCE(
             (SELECT u.name FROM users u WHERE u.id = tp.author_id),
             (SELECT u.name FROM users u WHERE u.id = pc.author_id)
           ) as mentioner_name,
           COALESCE(
             (SELECT u.email FROM users u WHERE u.id = tp.author_id),
             (SELECT u.email FROM users u WHERE u.id = pc.author_id)
           ) as mentioner_email
         FROM post_mentions pm
         LEFT JOIN team_posts tp ON pm.post_id = tp.id
         LEFT JOIN post_comments pc ON pm.comment_id = pc.id
         WHERE pm.mentioned_user_id = $1 AND pm.is_read = FALSE
         ORDER BY pm.created_at DESC`, [userId]);
            res.json({
                success: true,
                mentions: result.rows,
                unread_count: result.rows.length
            });
        }
        catch (error) {
            console.error('Error fetching mentions:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch mentions' });
        }
    });
    /**
     * POST /api/roof/mentions/mark-read
     * Mark mentions as read
     */
    router.post('/mentions/mark-read', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            const { mention_ids } = req.body;
            // Get user ID from email
            const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [userEmail]);
            if (userResult.rows.length === 0) {
                return res.status(401).json({ success: false, error: 'User not found' });
            }
            const userId = userResult.rows[0].id;
            if (mention_ids && mention_ids.length > 0) {
                // Mark specific mentions as read
                await pool.query(`UPDATE post_mentions
           SET is_read = TRUE
           WHERE id = ANY($1) AND mentioned_user_id = $2`, [mention_ids, userId]);
            }
            else {
                // Mark all mentions as read
                await pool.query(`UPDATE post_mentions
           SET is_read = TRUE
           WHERE mentioned_user_id = $1 AND is_read = FALSE`, [userId]);
            }
            res.json({ success: true, message: 'Mentions marked as read' });
        }
        catch (error) {
            console.error('Error marking mentions as read:', error);
            res.status(500).json({ success: false, error: 'Failed to mark mentions as read' });
        }
    });
    return router;
}
export default router;
