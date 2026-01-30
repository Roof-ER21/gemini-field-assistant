-- Migration 024: Fix Neighborhood Intel - Add missing columns
-- This migration fixes issues from 023 where columns weren't added due to dependency issues

-- ============================================
-- 1. Ensure customer_properties table exists first
-- ============================================

CREATE TABLE IF NOT EXISTS customer_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  customer_name VARCHAR(255) NOT NULL,
  address VARCHAR(500) NOT NULL,
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  phone VARCHAR(50),
  email VARCHAR(255),
  notes TEXT,
  monitor_hail BOOLEAN DEFAULT TRUE,
  monitor_wind BOOLEAN DEFAULT TRUE,
  monitor_tornado BOOLEAN DEFAULT TRUE,
  alert_radius_miles DECIMAL(5,2) DEFAULT 5.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. Add missing columns to customer_properties
-- ============================================

ALTER TABLE customer_properties
ADD COLUMN IF NOT EXISTS original_rep_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS canvassing_id UUID,
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal';

-- ============================================
-- 3. Ensure canvassing_status table exists
-- ============================================

CREATE TABLE IF NOT EXISTS canvassing_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  address VARCHAR(500) NOT NULL,
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  status VARCHAR(50) DEFAULT 'not_contacted',
  contacted_by UUID REFERENCES users(id),
  contact_date TIMESTAMP,
  notes TEXT,
  follow_up_date DATE,
  attempt_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 4. Add homeowner fields to canvassing_status
-- ============================================

ALTER TABLE canvassing_status
ADD COLUMN IF NOT EXISTS homeowner_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS homeowner_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS homeowner_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS property_notes TEXT,
ADD COLUMN IF NOT EXISTS best_contact_time VARCHAR(100),
ADD COLUMN IF NOT EXISTS property_type VARCHAR(50) DEFAULT 'residential',
ADD COLUMN IF NOT EXISTS roof_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS roof_age_years INTEGER,
ADD COLUMN IF NOT EXISTS auto_monitor BOOLEAN DEFAULT TRUE;

-- ============================================
-- 5. Add linked_property_id AFTER customer_properties exists
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'canvassing_status' AND column_name = 'linked_property_id'
  ) THEN
    ALTER TABLE canvassing_status ADD COLUMN linked_property_id UUID;
    ALTER TABLE canvassing_status ADD CONSTRAINT fk_linked_property
      FOREIGN KEY (linked_property_id) REFERENCES customer_properties(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================
-- 6. Add canvassing_id FK to customer_properties
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_canvassing_id' AND table_name = 'customer_properties'
  ) THEN
    ALTER TABLE customer_properties ADD CONSTRAINT fk_canvassing_id
      FOREIGN KEY (canvassing_id) REFERENCES canvassing_status(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  -- Ignore if constraint already exists
  NULL;
END $$;

-- ============================================
-- 7. Create indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_canvassing_homeowner_name
ON canvassing_status(homeowner_name) WHERE homeowner_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_canvassing_homeowner_phone
ON canvassing_status(homeowner_phone) WHERE homeowner_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_properties_rep
ON customer_properties(original_rep_id);

CREATE INDEX IF NOT EXISTS idx_customer_properties_source
ON customer_properties(source);

-- ============================================
-- 8. Recreate the neighborhood_intel view
-- ============================================

DROP VIEW IF EXISTS neighborhood_intel;

CREATE OR REPLACE VIEW neighborhood_intel AS
SELECT
  cs.id,
  cs.address,
  cs.latitude,
  cs.longitude,
  cs.city,
  cs.state,
  cs.zip_code,
  cs.status,
  cs.homeowner_name,
  cs.homeowner_phone,
  cs.homeowner_email,
  cs.property_notes,
  cs.best_contact_time,
  cs.property_type,
  cs.roof_type,
  cs.roof_age_years,
  cs.contact_date,
  cs.contacted_by,
  u.name as rep_name,
  u.email as rep_email,
  cs.linked_property_id,
  cp.notify_on_hail as monitor_hail,
  cp.notify_on_wind as monitor_wind,
  cp.notify_on_tornado as monitor_tornado,
  CASE
    WHEN cs.status IN ('interested', 'lead', 'appointment_set') THEN 'hot'
    WHEN cs.status = 'return_visit' THEN 'warm'
    WHEN cs.status IN ('contacted', 'no_answer') THEN 'cold'
    ELSE 'unknown'
  END as lead_temperature,
  cs.created_at,
  cs.updated_at
FROM canvassing_status cs
LEFT JOIN users u ON cs.contacted_by = u.id
LEFT JOIN customer_properties cp ON cs.linked_property_id = cp.id
WHERE cs.homeowner_name IS NOT NULL
   OR cs.homeowner_phone IS NOT NULL;

GRANT SELECT ON neighborhood_intel TO PUBLIC;

-- ============================================
-- 9. Ensure impact_alerts table has required columns
-- ============================================

CREATE TABLE IF NOT EXISTS impact_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES customer_properties(id),
  storm_event_id VARCHAR(100),
  alert_type VARCHAR(50),
  severity VARCHAR(20),
  message TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMP,
  acknowledged_by UUID REFERENCES users(id)
);

ALTER TABLE impact_alerts
ADD COLUMN IF NOT EXISTS original_rep_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS escalated_to_team BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS rep_notified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS team_notified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS response_time_minutes INTEGER;

-- ============================================
-- 10. Insurance companies table
-- ============================================

CREATE TABLE IF NOT EXISTS insurance_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  state VARCHAR(50),
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  website VARCHAR(255),
  notes TEXT,
  category VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_insurance_companies_name ON insurance_companies(name);
CREATE INDEX IF NOT EXISTS idx_insurance_companies_state ON insurance_companies(state);

COMMENT ON TABLE insurance_companies IS 'Insurance company directory for claims processing';

-- Migration complete
SELECT 'Migration 024 complete - Neighborhood Intel fixed' as status;
