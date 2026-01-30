-- Migration 023: Neighborhood Intel Enhancement
-- Adds homeowner contact data to canvassing and links to storm monitoring

-- ============================================
-- 1. Add homeowner fields to canvassing_status
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
ADD COLUMN IF NOT EXISTS auto_monitor BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS linked_property_id UUID REFERENCES customer_properties(id) ON DELETE SET NULL;

-- Index for searching by homeowner
CREATE INDEX IF NOT EXISTS idx_canvassing_homeowner_name 
ON canvassing_status(homeowner_name) WHERE homeowner_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_canvassing_homeowner_phone 
ON canvassing_status(homeowner_phone) WHERE homeowner_phone IS NOT NULL;

-- ============================================
-- 2. Add rep ownership to customer_properties
-- ============================================

ALTER TABLE customer_properties
ADD COLUMN IF NOT EXISTS original_rep_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS canvassing_id UUID REFERENCES canvassing_status(id),
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal';

-- Source can be: 'manual', 'canvassing', 'import', 'referral'
-- Priority: 'hot', 'high', 'normal', 'low'

CREATE INDEX IF NOT EXISTS idx_customer_properties_rep 
ON customer_properties(original_rep_id);

CREATE INDEX IF NOT EXISTS idx_customer_properties_source 
ON customer_properties(source);

-- ============================================
-- 3. Add escalation tracking to impact_alerts
-- ============================================

ALTER TABLE impact_alerts
ADD COLUMN IF NOT EXISTS original_rep_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS escalated_to_team BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS rep_notified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS team_notified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS response_time_minutes INTEGER;

-- ============================================
-- 4. Neighborhood Intel View
-- ============================================

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
  cp.monitor_hail,
  cp.monitor_wind,
  cp.monitor_tornado,
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

-- ============================================
-- 5. Function: Auto-create monitored property from canvassing
-- ============================================

CREATE OR REPLACE FUNCTION auto_monitor_from_canvassing()
RETURNS TRIGGER AS $$
DECLARE
  new_property_id UUID;
BEGIN
  -- Only auto-create if:
  -- 1. Status is interested, lead, or appointment_set
  -- 2. auto_monitor is true
  -- 3. No linked property yet
  -- 4. Has location data
  IF NEW.status IN ('interested', 'lead', 'appointment_set', 'sold', 'customer')
     AND NEW.auto_monitor = TRUE
     AND NEW.linked_property_id IS NULL
     AND NEW.latitude IS NOT NULL
     AND NEW.longitude IS NOT NULL
  THEN
    -- Create the monitored property
    INSERT INTO customer_properties (
      user_id,
      customer_name,
      address,
      city,
      state,
      zip_code,
      latitude,
      longitude,
      phone,
      email,
      notes,
      original_rep_id,
      canvassing_id,
      source,
      priority,
      monitor_hail,
      monitor_wind,
      monitor_tornado,
      alert_radius_miles
    ) VALUES (
      NEW.contacted_by,
      COALESCE(NEW.homeowner_name, 'Unknown'),
      NEW.address,
      NEW.city,
      NEW.state,
      NEW.zip_code,
      NEW.latitude,
      NEW.longitude,
      NEW.homeowner_phone,
      NEW.homeowner_email,
      NEW.property_notes,
      NEW.contacted_by,
      NEW.id,
      'canvassing',
      CASE 
        WHEN NEW.status = 'appointment_set' THEN 'hot'
        WHEN NEW.status = 'lead' THEN 'high'
        ELSE 'normal'
      END,
      TRUE,
      TRUE,
      TRUE,
      5.0
    )
    RETURNING id INTO new_property_id;
    
    -- Link the property back to canvassing
    NEW.linked_property_id := new_property_id;
    
    RAISE NOTICE 'Auto-created monitored property % for canvassing %', new_property_id, NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop first if exists)
DROP TRIGGER IF EXISTS trigger_auto_monitor_canvassing ON canvassing_status;

CREATE TRIGGER trigger_auto_monitor_canvassing
BEFORE INSERT OR UPDATE OF status ON canvassing_status
FOR EACH ROW
EXECUTE FUNCTION auto_monitor_from_canvassing();

-- ============================================
-- 6. Function: Get neighborhood intel for area
-- ============================================

CREATE OR REPLACE FUNCTION get_neighborhood_intel(
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_radius_miles DOUBLE PRECISION DEFAULT 1.0,
  p_team_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  address VARCHAR,
  distance_miles DOUBLE PRECISION,
  homeowner_name VARCHAR,
  homeowner_phone VARCHAR,
  status VARCHAR,
  lead_temperature TEXT,
  rep_name VARCHAR,
  contact_date TIMESTAMP,
  property_notes TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cs.id,
    cs.address,
    (3959 * acos(
      cos(radians(p_latitude)) * cos(radians(cs.latitude)) *
      cos(radians(cs.longitude) - radians(p_longitude)) +
      sin(radians(p_latitude)) * sin(radians(cs.latitude))
    )) as distance_miles,
    cs.homeowner_name,
    cs.homeowner_phone,
    cs.status,
    CASE 
      WHEN cs.status IN ('interested', 'lead', 'appointment_set') THEN 'hot'
      WHEN cs.status = 'return_visit' THEN 'warm'
      WHEN cs.status IN ('contacted', 'no_answer') THEN 'cold'
      ELSE 'unknown'
    END as lead_temperature,
    u.name as rep_name,
    cs.contact_date,
    cs.property_notes
  FROM canvassing_status cs
  LEFT JOIN users u ON cs.contacted_by = u.id
  WHERE cs.latitude IS NOT NULL
    AND cs.longitude IS NOT NULL
    AND (3959 * acos(
      cos(radians(p_latitude)) * cos(radians(cs.latitude)) *
      cos(radians(cs.longitude) - radians(p_longitude)) +
      sin(radians(p_latitude)) * sin(radians(cs.latitude))
    )) <= p_radius_miles
  ORDER BY distance_miles ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. Function: Notify rep when their lead is impacted
-- ============================================

CREATE OR REPLACE FUNCTION notify_rep_on_impact()
RETURNS TRIGGER AS $$
BEGIN
  -- Set the original rep from the customer property
  IF NEW.original_rep_id IS NULL THEN
    SELECT original_rep_id INTO NEW.original_rep_id
    FROM customer_properties
    WHERE id = NEW.property_id;
  END IF;
  
  -- Mark notification time
  NEW.rep_notified_at := NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notify_rep_impact ON impact_alerts;

CREATE TRIGGER trigger_notify_rep_impact
BEFORE INSERT ON impact_alerts
FOR EACH ROW
EXECUTE FUNCTION notify_rep_on_impact();

-- ============================================
-- 8. Team intel stats function
-- ============================================

CREATE OR REPLACE FUNCTION get_team_intel_stats(p_team_id UUID DEFAULT NULL)
RETURNS TABLE (
  total_addresses BIGINT,
  addresses_with_contact BIGINT,
  hot_leads BIGINT,
  warm_leads BIGINT,
  monitored_properties BIGINT,
  storm_alerts_sent BIGINT,
  conversions_from_alerts BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT cs.id) as total_addresses,
    COUNT(DISTINCT cs.id) FILTER (WHERE cs.homeowner_phone IS NOT NULL OR cs.homeowner_email IS NOT NULL) as addresses_with_contact,
    COUNT(DISTINCT cs.id) FILTER (WHERE cs.status IN ('interested', 'lead', 'appointment_set')) as hot_leads,
    COUNT(DISTINCT cs.id) FILTER (WHERE cs.status = 'return_visit') as warm_leads,
    COUNT(DISTINCT cp.id) as monitored_properties,
    COUNT(DISTINCT ia.id) as storm_alerts_sent,
    COUNT(DISTINCT ia.id) FILTER (WHERE ia.status = 'converted') as conversions_from_alerts
  FROM canvassing_status cs
  LEFT JOIN customer_properties cp ON cs.linked_property_id = cp.id
  LEFT JOIN impact_alerts ia ON cp.id = ia.property_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 9. Grant permissions
-- ============================================

GRANT SELECT ON neighborhood_intel TO PUBLIC;

COMMENT ON VIEW neighborhood_intel IS 'Team-wide view of all captured homeowner intel from canvassing';
COMMENT ON FUNCTION get_neighborhood_intel IS 'Get all intel for addresses within radius of a point';
COMMENT ON FUNCTION get_team_intel_stats IS 'Get team-wide statistics on intel collection';
