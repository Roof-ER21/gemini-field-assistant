-- 054: Manager Directives
-- Allows managers/admins to set instructions that Susan follows for all reps.

CREATE TABLE IF NOT EXISTS manager_directives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID NOT NULL REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('normal','high','critical')),
    is_active BOOLEAN DEFAULT true,
    target_audience VARCHAR(50) DEFAULT 'all',
    effective_from TIMESTAMPTZ DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_directives_active ON manager_directives (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_directives_created_by ON manager_directives (created_by);
