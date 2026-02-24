-- 056_agent_network.sql
-- Agent Network Feed: peer-to-peer market intelligence sharing

CREATE TABLE IF NOT EXISTS agent_network_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_user_id UUID NOT NULL REFERENCES users(id),
    intel_type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    state VARCHAR(2),
    insurer VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    promoted_to_global_learning_id UUID REFERENCES global_learnings(id),
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_network_status ON agent_network_messages(status);
CREATE INDEX IF NOT EXISTS idx_agent_network_author ON agent_network_messages(author_user_id);
CREATE INDEX IF NOT EXISTS idx_agent_network_type ON agent_network_messages(intel_type);
CREATE INDEX IF NOT EXISTS idx_agent_network_created ON agent_network_messages(created_at DESC);

-- Track individual user votes to prevent double-voting
CREATE TABLE IF NOT EXISTS agent_network_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES agent_network_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    vote_type VARCHAR(10) NOT NULL CHECK (vote_type IN ('up','down')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(message_id, user_id)
);
