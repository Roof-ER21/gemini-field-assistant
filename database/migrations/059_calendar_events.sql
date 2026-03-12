-- Migration 059: Calendar events for local scheduling
-- Local events for reps without Google Calendar connected.
-- When Google IS connected, events are fetched via API and this table stores supplemental local events.

CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    summary VARCHAR(500) NOT NULL,
    description TEXT,
    location VARCHAR(500),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    all_day BOOLEAN DEFAULT FALSE,
    time_zone VARCHAR(50) DEFAULT 'America/New_York',
    event_type VARCHAR(50) DEFAULT 'general'
        CHECK (event_type IN ('general', 'inspection', 'followup', 'meeting', 'appointment', 'canvassing', 'install', 'adjuster')),
    attendees JSONB DEFAULT '[]',
    color VARCHAR(20) DEFAULT '#3b82f6',
    google_event_id VARCHAR(255),
    google_calendar_link VARCHAR(500),
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'cancelled', 'completed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_time ON calendar_events (user_id, start_time) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_calendar_events_range ON calendar_events (start_time, end_time) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_calendar_events_google ON calendar_events (google_event_id) WHERE google_event_id IS NOT NULL;
