-- ============================================================================
-- 085 — Susan Persons Registry
-- ============================================================================
-- Purpose: Solve teammate-vs-adjuster cross-up. Today retrieval is text-search
-- keyed against knowledge_documents, so a question naming a teammate ("Ross")
-- can pull adjuster rows that share the first name and the LLM conflates them.
--
-- This migration creates a canonical persons registry that includes BOTH
-- teammates (from users) and adjusters (from knowledge_documents). Person
-- resolution happens BEFORE retrieval. Adjuster KB rows get an explicit
-- person_id FK so retrieval is keyed by person, not free-text.
-- ============================================================================

CREATE TABLE IF NOT EXISTS susan_persons (
    id SERIAL PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    -- Lowercased canonical_name for case-insensitive equality / unique constraint
    canonical_lower TEXT GENERATED ALWAYS AS (lower(canonical_name)) STORED,
    -- Spelling variants, nicknames, last-name-only forms
    alt_names TEXT[] DEFAULT '{}',
    -- 'teammate' | 'adjuster' | 'company' (insurer service org, not a person)
    person_type TEXT NOT NULL CHECK (person_type IN ('teammate','adjuster','company')),
    -- For adjusters/companies: parent insurance carrier (e.g. 'USAA', 'Travelers')
    carrier TEXT,
    -- For teammates: link back to the auth user
    team_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    -- Free-form notes (used by leadership for review)
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Lookup paths
CREATE INDEX IF NOT EXISTS idx_susan_persons_canonical_lower ON susan_persons(canonical_lower);
CREATE INDEX IF NOT EXISTS idx_susan_persons_type ON susan_persons(person_type);
CREATE INDEX IF NOT EXISTS idx_susan_persons_carrier_lower
    ON susan_persons(lower(carrier)) WHERE carrier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_susan_persons_team_user_id
    ON susan_persons(team_user_id) WHERE team_user_id IS NOT NULL;

-- Token-based search across alt_names. canonical_name is matched exactly via
-- canonical_lower btree above; this GIN index makes alt_names exact-match
-- (the @> / && / unnest patterns the resolver uses) cheap.
CREATE INDEX IF NOT EXISTS idx_susan_persons_alt_names_gin
    ON susan_persons USING gin(alt_names);

-- One row per (lower(name), type) — prevents accidental dupes during ingest.
-- Note: same first name CAN exist as teammate AND adjuster (that's the disambiguation case).
CREATE UNIQUE INDEX IF NOT EXISTS uq_susan_persons_name_type
    ON susan_persons(canonical_lower, person_type, COALESCE(lower(carrier), ''));

-- updated_at trigger
CREATE OR REPLACE FUNCTION susan_persons_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_susan_persons_updated_at ON susan_persons;
CREATE TRIGGER trg_susan_persons_updated_at
    BEFORE UPDATE ON susan_persons
    FOR EACH ROW EXECUTE FUNCTION susan_persons_touch_updated_at();

-- ============================================================================
-- Link knowledge_documents → susan_persons
-- ============================================================================
-- Adjuster intel rows now point at exactly one person. Retrieval keys on this
-- column for person-name questions, replacing free-text FTS for that path.
-- Nullable: not every doc is about a person (some are policy / scripts / KB
-- entries unrelated to an individual).
ALTER TABLE knowledge_documents
    ADD COLUMN IF NOT EXISTS person_id INTEGER REFERENCES susan_persons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_person_id
    ON knowledge_documents(person_id) WHERE person_id IS NOT NULL;

-- ============================================================================
-- Disambiguation prompt log
-- ============================================================================
-- When Susan asks "which Ross — our rep, or the adjuster at X?", we record it
-- so we can audit how often it fires and whether reps clarify or drop the thread.
CREATE TABLE IF NOT EXISTS susan_disambiguation_events (
    id SERIAL PRIMARY KEY,
    group_id TEXT,
    thread_id TEXT,
    asker_name TEXT,
    asker_user_id TEXT,
    queried_name TEXT NOT NULL,
    candidate_person_ids INTEGER[] NOT NULL,
    candidate_summary JSONB NOT NULL,    -- [{id, type, carrier, canonical_name}, ...]
    resolved_person_id INTEGER REFERENCES susan_persons(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_susan_disambig_thread
    ON susan_disambiguation_events(thread_id);
CREATE INDEX IF NOT EXISTS idx_susan_disambig_created
    ON susan_disambiguation_events(created_at DESC);

COMMENT ON TABLE susan_persons IS
    'Canonical registry of teammates (from users) and adjusters/companies (from knowledge_documents). Replaces free-text FTS for person-name questions to prevent teammate-adjuster cross-up.';
COMMENT ON COLUMN susan_persons.alt_names IS
    'Spelling variants and nicknames (e.g. ["Stuart","Stewart"], ["Nick CC","Nicholas Cecaci"]). Used during resolution.';
COMMENT ON COLUMN knowledge_documents.person_id IS
    'When non-null, this row is intel about a specific person; retrieval for that person should key on this column rather than FTS.';
