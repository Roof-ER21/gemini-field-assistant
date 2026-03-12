-- Migration 060: Lead Generation System
-- Extends profile_leads with scoring, source tracking, and UTM parameters.
-- Adds referral_codes table for referral program management.
-- Adds storm_zones table for storm-event landing page targeting.

-- ============================================================
-- 1. Extend profile_leads
-- ============================================================

-- Where the lead originated
ALTER TABLE profile_leads
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'profile';

-- 0-100 composite score
ALTER TABLE profile_leads
  ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0;

-- Per-factor score breakdown (e.g. {"has_phone": 20, "storm_zone": 30})
ALTER TABLE profile_leads
  ADD COLUMN IF NOT EXISTS score_factors JSONB DEFAULT '{}';

-- Zip code extracted from address or entered directly
ALTER TABLE profile_leads
  ADD COLUMN IF NOT EXISTS zip_code TEXT;

-- Referral code used when this lead was submitted
ALTER TABLE profile_leads
  ADD COLUMN IF NOT EXISTS referral_code TEXT;

-- UTM tracking parameters
ALTER TABLE profile_leads
  ADD COLUMN IF NOT EXISTS utm_source TEXT;

ALTER TABLE profile_leads
  ADD COLUMN IF NOT EXISTS utm_medium TEXT;

ALTER TABLE profile_leads
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

-- ============================================================
-- 2. Indexes on profile_leads (new columns)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_profile_leads_source
  ON profile_leads (source);

CREATE INDEX IF NOT EXISTS idx_profile_leads_zip_code
  ON profile_leads (zip_code);

CREATE INDEX IF NOT EXISTS idx_profile_leads_lead_score
  ON profile_leads (lead_score DESC);

CREATE INDEX IF NOT EXISTS idx_profile_leads_referral_code
  ON profile_leads (referral_code)
  WHERE referral_code IS NOT NULL;

-- ============================================================
-- 3. referral_codes
-- ============================================================

CREATE TABLE IF NOT EXISTS referral_codes (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT          UNIQUE NOT NULL,           -- e.g. 'SMITH2024'
  profile_id       UUID          REFERENCES employee_profiles (id) ON DELETE SET NULL,
  customer_name    TEXT,                                    -- the referrer (past customer)
  customer_email   TEXT,
  customer_phone   TEXT,
  reward_type      TEXT          DEFAULT 'credit',          -- 'credit', 'cash', 'gift_card'
  reward_amount    NUMERIC(10,2) DEFAULT 50.00,
  total_referrals  INTEGER       DEFAULT 0,
  total_converted  INTEGER       DEFAULT 0,
  is_active        BOOLEAN       DEFAULT true,
  created_at       TIMESTAMPTZ   DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code
  ON referral_codes (code);

CREATE INDEX IF NOT EXISTS idx_referral_codes_profile_id
  ON referral_codes (profile_id);

-- ============================================================
-- 4. storm_zones
-- ============================================================

CREATE TABLE IF NOT EXISTS storm_zones (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  zip_code         TEXT        NOT NULL,
  city             TEXT,
  state            TEXT        DEFAULT 'MD',
  event_type       TEXT        NOT NULL,   -- 'hail', 'wind', 'tornado', 'hurricane'
  event_date       DATE        NOT NULL,
  severity         TEXT,                   -- 'minor', 'moderate', 'severe'
  hail_size        TEXT,                   -- e.g. '1.5 inch'
  wind_speed       TEXT,                   -- e.g. '65 mph'
  source           TEXT,                   -- 'nws', 'manual', 'spotter'
  notes            TEXT,
  is_active        BOOLEAN     DEFAULT true,
  leads_generated  INTEGER     DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_storm_zones_zip_active
  ON storm_zones (zip_code, is_active);

CREATE INDEX IF NOT EXISTS idx_storm_zones_event_date
  ON storm_zones (event_date DESC);
