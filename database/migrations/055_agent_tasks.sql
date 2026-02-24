-- 055: Agent Tasks
-- Follow-ups, reminders, and scheduled tasks created by Susan via tools.

CREATE TABLE IF NOT EXISTS agent_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    task_type VARCHAR(50) DEFAULT 'followup',
    due_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','done','dismissed')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
    job_id UUID REFERENCES jobs(id),
    job_number VARCHAR(20),
    metadata JSONB DEFAULT '{}',
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_user_status ON agent_tasks (user_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_due ON agent_tasks (due_at) WHERE status = 'pending';
