-- ============================================================================
-- Migration 012: Team Roof - Team-wide posting/feed feature
-- ============================================================================
-- "The Roof" allows team members to post public messages, share Susan AI
-- responses, @mention colleagues, like and comment on posts.
-- ============================================================================

-- ============================================================================
-- TEAM POSTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS team_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    post_type VARCHAR(50) DEFAULT 'text' CHECK (
        post_type IN ('text', 'shared_chat', 'shared_email', 'announcement')
    ),
    shared_content JSONB,  -- For shared Susan AI responses/emails
    like_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast feed retrieval (newest first)
CREATE INDEX idx_team_posts_created ON team_posts(created_at DESC);
CREATE INDEX idx_team_posts_author ON team_posts(author_id);
CREATE INDEX idx_team_posts_pinned ON team_posts(is_pinned) WHERE is_pinned = TRUE;

-- ============================================================================
-- POST LIKES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS post_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES team_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

CREATE INDEX idx_post_likes_post ON post_likes(post_id);
CREATE INDEX idx_post_likes_user ON post_likes(user_id);

-- ============================================================================
-- POST COMMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS post_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES team_posts(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    parent_comment_id UUID REFERENCES post_comments(id) ON DELETE CASCADE,
    like_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_post_comments_post ON post_comments(post_id);
CREATE INDEX idx_post_comments_author ON post_comments(author_id);
CREATE INDEX idx_post_comments_parent ON post_comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;

-- ============================================================================
-- COMMENT LIKES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS comment_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(comment_id, user_id)
);

CREATE INDEX idx_comment_likes_comment ON comment_likes(comment_id);

-- ============================================================================
-- POST MENTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS post_mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES team_posts(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES post_comments(id) ON DELETE CASCADE,
    mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (post_id IS NOT NULL OR comment_id IS NOT NULL)
);

CREATE INDEX idx_post_mentions_user ON post_mentions(mentioned_user_id, is_read);
CREATE INDEX idx_post_mentions_post ON post_mentions(post_id) WHERE post_id IS NOT NULL;
CREATE INDEX idx_post_mentions_comment ON post_mentions(comment_id) WHERE comment_id IS NOT NULL;

-- ============================================================================
-- TRIGGERS FOR AUTO-UPDATING COUNTS
-- ============================================================================

-- Post like count trigger
CREATE OR REPLACE FUNCTION update_post_like_count() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE team_posts SET like_count = like_count + 1, updated_at = NOW() WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE team_posts SET like_count = GREATEST(0, like_count - 1), updated_at = NOW() WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS post_like_count_trigger ON post_likes;
CREATE TRIGGER post_like_count_trigger
AFTER INSERT OR DELETE ON post_likes
FOR EACH ROW EXECUTE FUNCTION update_post_like_count();

-- Post comment count trigger
CREATE OR REPLACE FUNCTION update_post_comment_count() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE team_posts SET comment_count = comment_count + 1, updated_at = NOW() WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE team_posts SET comment_count = GREATEST(0, comment_count - 1), updated_at = NOW() WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS post_comment_count_trigger ON post_comments;
CREATE TRIGGER post_comment_count_trigger
AFTER INSERT OR DELETE ON post_comments
FOR EACH ROW EXECUTE FUNCTION update_post_comment_count();

-- Comment like count trigger
CREATE OR REPLACE FUNCTION update_comment_like_count() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE post_comments SET like_count = like_count + 1, updated_at = NOW() WHERE id = NEW.comment_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE post_comments SET like_count = GREATEST(0, like_count - 1), updated_at = NOW() WHERE id = OLD.comment_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comment_like_count_trigger ON comment_likes;
CREATE TRIGGER comment_like_count_trigger
AFTER INSERT OR DELETE ON comment_likes
FOR EACH ROW EXECUTE FUNCTION update_comment_like_count();

-- Updated_at trigger for posts
CREATE OR REPLACE FUNCTION update_team_post_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS team_post_updated_at ON team_posts;
CREATE TRIGGER team_post_updated_at
BEFORE UPDATE ON team_posts
FOR EACH ROW EXECUTE FUNCTION update_team_post_updated_at();

-- Updated_at trigger for comments
DROP TRIGGER IF EXISTS post_comment_updated_at ON post_comments;
CREATE TRIGGER post_comment_updated_at
BEFORE UPDATE ON post_comments
FOR EACH ROW EXECUTE FUNCTION update_team_post_updated_at();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get posts feed with author info
CREATE OR REPLACE FUNCTION get_roof_feed(
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0,
    p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    author_id UUID,
    author_name VARCHAR,
    author_email VARCHAR,
    content TEXT,
    post_type VARCHAR,
    shared_content JSONB,
    like_count INTEGER,
    comment_count INTEGER,
    is_pinned BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    user_liked BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        tp.id,
        tp.author_id,
        u.name AS author_name,
        u.email AS author_email,
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
            WHERE pl.post_id = tp.id AND pl.user_id = p_user_id
        ) AS user_liked
    FROM team_posts tp
    JOIN users u ON tp.author_id = u.id
    ORDER BY tp.is_pinned DESC, tp.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Get comments for a post with author info
CREATE OR REPLACE FUNCTION get_post_comments(
    p_post_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    post_id UUID,
    author_id UUID,
    author_name VARCHAR,
    author_email VARCHAR,
    content TEXT,
    parent_comment_id UUID,
    like_count INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    user_liked BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pc.id,
        pc.post_id,
        pc.author_id,
        u.name AS author_name,
        u.email AS author_email,
        pc.content,
        pc.parent_comment_id,
        pc.like_count,
        pc.created_at,
        pc.updated_at,
        EXISTS(
            SELECT 1 FROM comment_likes cl
            WHERE cl.comment_id = pc.id AND cl.user_id = p_user_id
        ) AS user_liked
    FROM post_comments pc
    JOIN users u ON pc.author_id = u.id
    WHERE pc.post_id = p_post_id
    ORDER BY pc.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Get unread roof mentions for a user
CREATE OR REPLACE FUNCTION get_unread_roof_mentions(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    post_id UUID,
    comment_id UUID,
    mentioned_user_id UUID,
    is_read BOOLEAN,
    created_at TIMESTAMPTZ,
    post_content TEXT,
    comment_content TEXT,
    mentioner_name VARCHAR,
    mentioner_email VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pm.id,
        pm.post_id,
        pm.comment_id,
        pm.mentioned_user_id,
        pm.is_read,
        pm.created_at,
        tp.content AS post_content,
        pc.content AS comment_content,
        COALESCE(
            (SELECT u.name FROM users u WHERE u.id = tp.author_id),
            (SELECT u.name FROM users u WHERE u.id = pc.author_id)
        ) AS mentioner_name,
        COALESCE(
            (SELECT u.email FROM users u WHERE u.id = tp.author_id),
            (SELECT u.email FROM users u WHERE u.id = pc.author_id)
        ) AS mentioner_email
    FROM post_mentions pm
    LEFT JOIN team_posts tp ON pm.post_id = tp.id
    LEFT JOIN post_comments pc ON pm.comment_id = pc.id
    WHERE pm.mentioned_user_id = p_user_id AND pm.is_read = FALSE
    ORDER BY pm.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 012: Team Roof tables created successfully';
END $$;
