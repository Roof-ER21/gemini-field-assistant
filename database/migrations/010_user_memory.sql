-- Migration 010: User Memory System
-- Enables Susan 21 to remember facts, preferences, and patterns across sessions
-- Based on 2026 hierarchical memory architecture best practices

-- ============================================================================
-- USER MEMORY TABLE
-- ============================================================================
-- Stores extracted memories from conversations, categorized by type
CREATE TABLE IF NOT EXISTS user_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Memory classification
    memory_type VARCHAR(50) NOT NULL,  -- 'fact', 'preference', 'pattern', 'outcome', 'context'
    category VARCHAR(100),              -- 'insurer', 'state', 'damage_type', 'style', 'job', 'communication'

    -- Memory content
    key VARCHAR(255) NOT NULL,          -- Short identifier (e.g., "primary_state", "preferred_insurer")
    value TEXT NOT NULL,                -- The actual memory content

    -- Metadata
    confidence DECIMAL(3,2) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
    source_type VARCHAR(50),            -- 'conversation', 'explicit', 'inferred', 'feedback'
    source_session_id VARCHAR(255),     -- Links to chat_history.session_id
    source_message_id VARCHAR(100),     -- Links to specific message that created this memory

    -- Usage tracking
    times_referenced INTEGER DEFAULT 0,
    times_helpful INTEGER DEFAULT 0,    -- User confirmed memory was useful
    times_incorrect INTEGER DEFAULT 0,  -- User corrected this memory

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed TIMESTAMPTZ DEFAULT NOW(),
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,             -- Optional expiration for temporary memories

    -- Prevent duplicate memories
    UNIQUE(user_id, memory_type, category, key)
);

-- Indexes for efficient memory retrieval
CREATE INDEX IF NOT EXISTS idx_user_memory_user_id ON user_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_user_memory_type ON user_memory(memory_type);
CREATE INDEX IF NOT EXISTS idx_user_memory_category ON user_memory(category);
CREATE INDEX IF NOT EXISTS idx_user_memory_user_type ON user_memory(user_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_user_memory_confidence ON user_memory(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_user_memory_last_accessed ON user_memory(last_accessed DESC);
CREATE INDEX IF NOT EXISTS idx_user_memory_times_referenced ON user_memory(times_referenced DESC);

-- Full-text search on memory value
CREATE INDEX IF NOT EXISTS idx_user_memory_value_search ON user_memory
    USING gin(to_tsvector('english', value));

-- ============================================================================
-- CONVERSATION SUMMARIES TABLE
-- ============================================================================
-- Stores compressed summaries of past conversations for long-term memory
CREATE TABLE IF NOT EXISTS conversation_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL,

    -- Summary content
    summary TEXT NOT NULL,              -- LLM-generated summary of conversation
    key_facts JSONB DEFAULT '[]',       -- Array of extracted facts
    decisions_reached JSONB DEFAULT '[]', -- Decisions made during conversation
    open_questions JSONB DEFAULT '[]',  -- Questions still open
    action_items JSONB DEFAULT '[]',    -- Follow-up tasks identified

    -- Context metadata
    topics JSONB DEFAULT '[]',          -- Main topics discussed
    insurers_mentioned JSONB DEFAULT '[]',
    states_mentioned JSONB DEFAULT '[]',
    job_numbers_mentioned JSONB DEFAULT '[]',

    -- Metrics
    message_count INTEGER DEFAULT 0,
    user_sentiment VARCHAR(50),         -- 'positive', 'neutral', 'frustrated', 'confused'

    -- Timestamps
    conversation_start TIMESTAMPTZ,
    conversation_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, session_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_user_id ON conversation_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_session_id ON conversation_summaries(session_id);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_created_at ON conversation_summaries(created_at DESC);

-- Full-text search on summaries
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_search ON conversation_summaries
    USING gin(to_tsvector('english', summary));

-- ============================================================================
-- JOB CONVERSATION LINKS TABLE
-- ============================================================================
-- Links jobs to conversation summaries for context recall
CREATE TABLE IF NOT EXISTS job_conversation_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    summary_id UUID NOT NULL REFERENCES conversation_summaries(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Link metadata
    link_type VARCHAR(50) DEFAULT 'discussed', -- 'discussed', 'created_from', 'referenced'
    relevance_score DECIMAL(3,2) DEFAULT 1.0,

    -- Key decisions specific to this job from this conversation
    job_specific_decisions JSONB DEFAULT '[]',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(job_id, summary_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_job_conv_links_job_id ON job_conversation_links(job_id);
CREATE INDEX IF NOT EXISTS idx_job_conv_links_summary_id ON job_conversation_links(summary_id);
CREATE INDEX IF NOT EXISTS idx_job_conv_links_user_id ON job_conversation_links(user_id);

-- ============================================================================
-- MEMORY FEEDBACK TABLE
-- ============================================================================
-- Tracks user feedback on memory accuracy for continuous improvement
CREATE TABLE IF NOT EXISTS memory_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID NOT NULL REFERENCES user_memory(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    feedback_type VARCHAR(50) NOT NULL, -- 'helpful', 'incorrect', 'outdated', 'irrelevant'
    correction TEXT,                    -- User's correction if memory was wrong
    context TEXT,                       -- Context in which feedback was given

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_memory_feedback_memory_id ON memory_feedback(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_feedback_user_id ON memory_feedback(user_id);

-- ============================================================================
-- TRIGGER: Update last_accessed when memory is retrieved
-- ============================================================================
CREATE OR REPLACE FUNCTION update_memory_last_accessed()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_accessed = NOW();
    NEW.times_referenced = NEW.times_referenced + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: This trigger should only be used for explicit access updates
-- DROP TRIGGER IF EXISTS trigger_update_memory_accessed ON user_memory;
-- CREATE TRIGGER trigger_update_memory_accessed
--     BEFORE UPDATE OF times_referenced ON user_memory
--     FOR EACH ROW
--     EXECUTE FUNCTION update_memory_last_accessed();

-- ============================================================================
-- TRIGGER: Update last_updated timestamp on memory changes
-- ============================================================================
CREATE OR REPLACE FUNCTION update_memory_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_memory_timestamp ON user_memory;
CREATE TRIGGER trigger_update_memory_timestamp
    BEFORE UPDATE ON user_memory
    FOR EACH ROW
    EXECUTE FUNCTION update_memory_timestamp();

-- ============================================================================
-- FUNCTION: Get relevant memories for a user
-- ============================================================================
CREATE OR REPLACE FUNCTION get_relevant_memories(
    p_user_id UUID,
    p_query TEXT,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    memory_type VARCHAR(50),
    category VARCHAR(100),
    key VARCHAR(255),
    value TEXT,
    confidence DECIMAL(3,2),
    times_referenced INTEGER,
    relevance_rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        um.id,
        um.memory_type,
        um.category,
        um.key,
        um.value,
        um.confidence,
        um.times_referenced,
        ts_rank(to_tsvector('english', um.value), plainto_tsquery('english', p_query)) AS relevance_rank
    FROM user_memory um
    WHERE um.user_id = p_user_id
      AND (um.expires_at IS NULL OR um.expires_at > NOW())
      AND um.confidence > 0.3
      AND (
          to_tsvector('english', um.value) @@ plainto_tsquery('english', p_query)
          OR um.key ILIKE '%' || p_query || '%'
          OR um.category ILIKE '%' || p_query || '%'
      )
    ORDER BY
        relevance_rank DESC,
        um.confidence DESC,
        um.times_referenced DESC,
        um.last_accessed DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Get user's high-confidence memories (for building context)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_context_memories(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    memory_type VARCHAR(50),
    category VARCHAR(100),
    key VARCHAR(255),
    value TEXT,
    confidence DECIMAL(3,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        um.memory_type,
        um.category,
        um.key,
        um.value,
        um.confidence
    FROM user_memory um
    WHERE um.user_id = p_user_id
      AND (um.expires_at IS NULL OR um.expires_at > NOW())
      AND um.confidence >= 0.7
    ORDER BY
        CASE um.memory_type
            WHEN 'fact' THEN 1
            WHEN 'preference' THEN 2
            WHEN 'pattern' THEN 3
            WHEN 'outcome' THEN 4
            ELSE 5
        END,
        um.times_referenced DESC,
        um.confidence DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE user_memory IS 'Stores persistent user memories extracted from conversations - facts, preferences, patterns, and outcomes';
COMMENT ON TABLE conversation_summaries IS 'Compressed summaries of past conversations for long-term memory retrieval';
COMMENT ON TABLE job_conversation_links IS 'Links jobs to relevant conversation summaries for context recall';
COMMENT ON TABLE memory_feedback IS 'User feedback on memory accuracy for continuous improvement';

COMMENT ON COLUMN user_memory.memory_type IS 'fact: explicit info, preference: user likes/dislikes, pattern: observed behavior, outcome: results of actions, context: situational info';
COMMENT ON COLUMN user_memory.confidence IS 'Confidence score 0-1, decreases when user corrects, increases when confirmed helpful';
COMMENT ON COLUMN user_memory.source_type IS 'How this memory was created: conversation, explicit (user told us), inferred, feedback';
