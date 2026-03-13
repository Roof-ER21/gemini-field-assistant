-- Migration 064: Lead Machine Features
-- Storm Multi-Channel Blast, Digital Door Knocking, GBP Auto-Posting,
-- Craigslist Auto-Posting, HOA Outreach tracking tables.

-- ============================================================
-- 1. Storm Blast Campaigns
-- ============================================================

CREATE TABLE IF NOT EXISTS storm_blast_campaigns (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  storm_zone_id    UUID        REFERENCES storm_zones(id) ON DELETE SET NULL,
  zip_code         TEXT        NOT NULL,
  city             TEXT,
  state            TEXT        DEFAULT 'MD',
  event_type       TEXT        NOT NULL,
  severity         TEXT,
  status           TEXT        DEFAULT 'pending'
                               CHECK (status IN ('pending','active','completed','cancelled')),
  -- Channels activated
  sms_sent         INTEGER     DEFAULT 0,
  emails_sent      INTEGER     DEFAULT 0,
  landing_page_url TEXT,
  -- Results
  leads_generated  INTEGER     DEFAULT 0,
  total_contacts   INTEGER     DEFAULT 0,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_storm_blast_status
  ON storm_blast_campaigns (status);

CREATE INDEX IF NOT EXISTS idx_storm_blast_zip
  ON storm_blast_campaigns (zip_code);

-- Contact list for a storm blast (homeowners in affected ZIPs)
CREATE TABLE IF NOT EXISTS storm_blast_contacts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID        NOT NULL REFERENCES storm_blast_campaigns(id) ON DELETE CASCADE,
  name             TEXT,
  phone            TEXT,
  email            TEXT,
  address          TEXT,
  zip_code         TEXT,
  source           TEXT        DEFAULT 'manual',  -- 'manual', 'import', 'past_customer', 'door_knock'
  sms_sent         BOOLEAN     DEFAULT false,
  email_sent       BOOLEAN     DEFAULT false,
  responded        BOOLEAN     DEFAULT false,
  lead_id          UUID,       -- links to profile_leads if they convert
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_storm_blast_contacts_campaign
  ON storm_blast_contacts (campaign_id);

-- ============================================================
-- 2. Digital Door Knocking
-- ============================================================

CREATE TABLE IF NOT EXISTS door_knock_campaigns (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID,       -- completed job that triggered this
  origin_address   TEXT        NOT NULL,
  origin_zip       TEXT,
  origin_city      TEXT,
  origin_state     TEXT        DEFAULT 'MD',
  origin_lat       DOUBLE PRECISION,
  origin_lng       DOUBLE PRECISION,
  radius_miles     NUMERIC(4,1) DEFAULT 0.5,
  status           TEXT        DEFAULT 'pending'
                               CHECK (status IN ('pending','active','completed','cancelled')),
  total_addresses  INTEGER     DEFAULT 0,
  contacted        INTEGER     DEFAULT 0,
  leads_generated  INTEGER     DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_door_knock_status
  ON door_knock_campaigns (status);

CREATE INDEX IF NOT EXISTS idx_door_knock_job
  ON door_knock_campaigns (job_id);

CREATE TABLE IF NOT EXISTS door_knock_addresses (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID        NOT NULL REFERENCES door_knock_campaigns(id) ON DELETE CASCADE,
  address          TEXT        NOT NULL,
  zip_code         TEXT,
  homeowner_name   TEXT,
  phone            TEXT,
  email            TEXT,
  contact_method   TEXT        DEFAULT 'postcard',  -- 'sms', 'email', 'postcard', 'door_hanger'
  contacted        BOOLEAN     DEFAULT false,
  responded        BOOLEAN     DEFAULT false,
  lead_id          UUID,
  notes            TEXT,
  contacted_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_door_knock_addresses_campaign
  ON door_knock_addresses (campaign_id);

-- ============================================================
-- 3. GBP (Google Business Profile) Posts
-- ============================================================

CREATE TABLE IF NOT EXISTS gbp_posts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_type        TEXT        NOT NULL
                               CHECK (post_type IN ('update','offer','event','photo')),
  title            TEXT,
  content          TEXT        NOT NULL,
  image_url        TEXT,
  call_to_action   TEXT        DEFAULT 'LEARN_MORE',
  cta_url          TEXT,
  -- Scheduling
  status           TEXT        DEFAULT 'draft'
                               CHECK (status IN ('draft','scheduled','posted','failed')),
  scheduled_for    TIMESTAMPTZ,
  posted_at        TIMESTAMPTZ,
  -- GBP API response
  gbp_post_id      TEXT,
  error_message    TEXT,
  -- Auto-generation metadata
  auto_generated   BOOLEAN     DEFAULT false,
  generation_source TEXT,      -- 'storm_alert', 'testimonial', 'job_complete', 'weekly'
  source_id        TEXT,       -- ID of the job/storm/testimonial that generated it
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gbp_posts_status
  ON gbp_posts (status);

CREATE INDEX IF NOT EXISTS idx_gbp_posts_scheduled
  ON gbp_posts (scheduled_for)
  WHERE status = 'scheduled';

-- ============================================================
-- 4. Craigslist Posts
-- ============================================================

CREATE TABLE IF NOT EXISTS craigslist_posts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  market           TEXT        NOT NULL,  -- 'washingtondc', 'baltimore', 'norfolk'
  category         TEXT        DEFAULT 'services',
  title            TEXT        NOT NULL,
  body             TEXT        NOT NULL,
  zip_code         TEXT,
  -- Status
  status           TEXT        DEFAULT 'draft'
                               CHECK (status IN ('draft','scheduled','posted','expired','flagged','failed')),
  scheduled_for    TIMESTAMPTZ,
  posted_at        TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  post_url         TEXT,
  error_message    TEXT,
  -- Template info
  template_name    TEXT,       -- 'storm_damage', 'free_inspection', 'seasonal', 'insurance_help'
  auto_generated   BOOLEAN     DEFAULT false,
  impressions      INTEGER     DEFAULT 0,
  replies          INTEGER     DEFAULT 0,
  leads_generated  INTEGER     DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_craigslist_posts_status
  ON craigslist_posts (status);

CREATE INDEX IF NOT EXISTS idx_craigslist_posts_market
  ON craigslist_posts (market);

-- ============================================================
-- 5. HOA Outreach
-- ============================================================

CREATE TABLE IF NOT EXISTS hoa_contacts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name     TEXT        NOT NULL,
  contact_name     TEXT,
  email            TEXT,
  phone            TEXT,
  website          TEXT,
  -- Location
  city             TEXT,
  state            TEXT        DEFAULT 'MD',
  zip_codes        TEXT[],     -- communities they manage
  estimated_units  INTEGER,    -- # of properties/units managed
  -- Outreach tracking
  status           TEXT        DEFAULT 'new'
                               CHECK (status IN ('new','contacted','responded','meeting_set','proposal_sent','won','lost','do_not_contact')),
  last_contacted   TIMESTAMPTZ,
  contact_count    INTEGER     DEFAULT 0,
  -- Email sequence
  email_sequence_step INTEGER  DEFAULT 0,  -- 0=not started, 1=intro, 2=followup, 3=value_add
  next_email_at    TIMESTAMPTZ,
  -- Notes
  notes            TEXT,
  source           TEXT        DEFAULT 'manual',  -- 'manual', 'scrape', 'referral', 'google'
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hoa_contacts_status
  ON hoa_contacts (status);

CREATE INDEX IF NOT EXISTS idx_hoa_contacts_state
  ON hoa_contacts (state);

CREATE INDEX IF NOT EXISTS idx_hoa_contacts_next_email
  ON hoa_contacts (next_email_at)
  WHERE status NOT IN ('won','lost','do_not_contact');

-- HOA outreach email log
CREATE TABLE IF NOT EXISTS hoa_email_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  hoa_contact_id   UUID        NOT NULL REFERENCES hoa_contacts(id) ON DELETE CASCADE,
  email_type       TEXT        NOT NULL,  -- 'intro', 'followup', 'value_add', 'custom'
  subject          TEXT,
  body_preview     TEXT,
  sent_at          TIMESTAMPTZ DEFAULT NOW(),
  opened           BOOLEAN     DEFAULT false,
  clicked          BOOLEAN     DEFAULT false,
  replied          BOOLEAN     DEFAULT false,
  bounced          BOOLEAN     DEFAULT false,
  error_message    TEXT
);

CREATE INDEX IF NOT EXISTS idx_hoa_email_log_contact
  ON hoa_email_log (hoa_contact_id);
