-- Migration 061: Deaf Communication Mode
-- Enables reps to communicate with deaf/hard-of-hearing homeowners

-- Conversation sessions
CREATE TABLE IF NOT EXISTS deaf_mode_sessions (
  id SERIAL PRIMARY KEY,
  rep_user_id UUID REFERENCES users(id),
  lead_id INTEGER,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  total_signs_recognized INTEGER DEFAULT 0,
  total_quick_taps INTEGER DEFAULT 0,
  total_typed_messages INTEGER DEFAULT 0,
  total_rep_utterances INTEGER DEFAULT 0,
  avg_sign_confidence DECIMAL(4,3),
  gemini_fallback_count INTEGER DEFAULT 0,
  notes TEXT
);

-- Individual conversation turns
CREATE TABLE IF NOT EXISTS deaf_mode_transcript (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES deaf_mode_sessions(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  speaker TEXT NOT NULL CHECK (speaker IN ('rep', 'homeowner')),
  input_method TEXT NOT NULL CHECK (input_method IN (
    'speech', 'sign_language', 'fingerspell', 'quick_tap',
    'typed', 'handwriting', 'head_gesture'
  )),
  content TEXT NOT NULL,
  sign_confidence DECIMAL(4,3),
  recognition_source TEXT CHECK (recognition_source IN ('on-device', 'gemini', 'manual'))
);

-- Custom quick responses per team/user
CREATE TABLE IF NOT EXISTS deaf_mode_quick_responses (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'team', 'user')),
  owner_id UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deaf_sessions_rep ON deaf_mode_sessions(rep_user_id);
CREATE INDEX IF NOT EXISTS idx_deaf_sessions_lead ON deaf_mode_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_deaf_sessions_started ON deaf_mode_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_deaf_transcript_session ON deaf_mode_transcript(session_id);
CREATE INDEX IF NOT EXISTS idx_deaf_quick_responses_scope ON deaf_mode_quick_responses(scope, is_active);

-- Seed default quick responses
INSERT INTO deaf_mode_quick_responses (category, label, display_order, scope) VALUES
  -- Universal
  ('universal', 'Yes', 1, 'global'),
  ('universal', 'No', 2, 'global'),
  ('universal', 'Maybe', 3, 'global'),
  ('universal', 'Show me', 4, 'global'),
  ('universal', 'How much?', 5, 'global'),
  ('universal', 'When?', 6, 'global'),
  ('universal', 'I don''t understand', 7, 'global'),
  ('universal', 'Say that again', 8, 'global'),
  ('universal', 'Slower please', 9, 'global'),
  ('universal', 'Thank you', 10, 'global'),
  -- Storm damage
  ('storm_damage', 'I had storm damage', 1, 'global'),
  ('storm_damage', 'Roof is leaking', 2, 'global'),
  ('storm_damage', 'Hail damage', 3, 'global'),
  ('storm_damage', 'Missing shingles', 4, 'global'),
  ('storm_damage', 'Water inside', 5, 'global'),
  ('storm_damage', 'Wind damage', 6, 'global'),
  -- Insurance
  ('insurance', 'I have insurance', 1, 'global'),
  ('insurance', 'Already filed claim', 2, 'global'),
  ('insurance', 'Claim was denied', 3, 'global'),
  ('insurance', 'Adjuster came already', 4, 'global'),
  ('insurance', 'Waiting on adjuster', 5, 'global'),
  ('insurance', 'Need an estimate', 6, 'global'),
  -- Scheduling
  ('scheduling', 'Come back later', 1, 'global'),
  ('scheduling', 'Schedule appointment', 2, 'global'),
  ('scheduling', 'Call my spouse', 3, 'global'),
  ('scheduling', 'This weekend', 4, 'global'),
  ('scheduling', 'Next week', 5, 'global'),
  ('scheduling', 'Morning is better', 6, 'global'),
  -- Decision
  ('decision', 'Not interested', 1, 'global'),
  ('decision', 'Need to think', 2, 'global'),
  ('decision', 'Talk to spouse first', 3, 'global'),
  ('decision', 'How long does it take?', 4, 'global'),
  ('decision', 'Do you have references?', 5, 'global'),
  ('decision', 'Free inspection?', 6, 'global')
ON CONFLICT DO NOTHING;
