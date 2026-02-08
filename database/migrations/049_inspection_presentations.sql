-- ==========================================================================
-- Migration 049: Inspection Presentations
-- Add comprehensive inspection and presentation system
-- ==========================================================================
-- This migration creates:
-- 1. inspections - Store roof inspection data linked to jobs
-- 2. inspection_photos - Photos with AI analysis results
-- 3. presentations - Generated presentations from inspections
-- 4. presentation_shares - Track who presentations are shared with
-- 5. presentation_views - Analytics tracking for presentations
-- ==========================================================================

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Inspection status lifecycle
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inspection_status') THEN
        CREATE TYPE inspection_status AS ENUM (
            'scheduled',
            'in_progress',
            'completed',
            'cancelled'
        );
    END IF;
END $$;

-- Photo damage categories
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'damage_category') THEN
        CREATE TYPE damage_category AS ENUM (
            'hail_damage',
            'wind_damage',
            'wear_and_tear',
            'leak',
            'missing_shingles',
            'flashing_damage',
            'gutter_damage',
            'soffit_fascia',
            'chimney',
            'ventilation',
            'other'
        );
    END IF;
END $$;

-- Damage severity levels
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'damage_severity') THEN
        CREATE TYPE damage_severity AS ENUM (
            'minor',
            'moderate',
            'severe',
            'critical'
        );
    END IF;
END $$;

-- Presentation status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'presentation_status') THEN
        CREATE TYPE presentation_status AS ENUM (
            'draft',
            'generated',
            'sent',
            'viewed',
            'signed'
        );
    END IF;
END $$;

-- ============================================================================
-- INSPECTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign keys
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Property information
    property_address TEXT NOT NULL,
    property_city VARCHAR(100) NOT NULL,
    property_state VARCHAR(2) NOT NULL DEFAULT 'VA',
    property_zip VARCHAR(10),
    property_type VARCHAR(50), -- 'residential', 'commercial', 'multi-family'

    -- Inspection details
    inspection_date TIMESTAMPTZ NOT NULL,
    inspector_name VARCHAR(255) NOT NULL,
    inspection_status inspection_status DEFAULT 'scheduled',

    -- Weather conditions at inspection
    weather_conditions JSONB, -- {temperature, conditions, wind_speed, etc.}

    -- Roof details
    roof_type VARCHAR(100), -- 'asphalt_shingle', 'metal', 'tile', etc.
    roof_age INTEGER, -- Years
    roof_area_sqft NUMERIC(10, 2),
    roof_pitch VARCHAR(20), -- '4/12', '6/12', etc.
    roof_layers INTEGER DEFAULT 1,

    -- Damage assessment
    overall_condition VARCHAR(50), -- 'excellent', 'good', 'fair', 'poor'
    damage_summary TEXT,
    repair_urgency VARCHAR(50), -- 'immediate', 'within_30_days', 'within_6_months', 'routine'

    -- Recommendations
    recommended_action VARCHAR(50), -- 'repair', 'partial_replacement', 'full_replacement'
    estimated_cost NUMERIC(10, 2),
    estimated_cost_high NUMERIC(10, 2), -- Cost range

    -- Insurance claim support
    insurance_claimable BOOLEAN DEFAULT false,
    claim_support_notes TEXT,

    -- Additional data
    inspection_notes TEXT,
    measurements JSONB, -- Detailed measurements
    materials_needed JSONB, -- Array of materials

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- ============================================================================
-- INSPECTION PHOTOS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS inspection_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign keys
    inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Photo details
    photo_url TEXT NOT NULL,
    photo_thumbnail_url TEXT,
    photo_order INTEGER DEFAULT 0, -- Order in presentation

    -- AI Analysis
    ai_analysis TEXT, -- AI-generated description
    ai_provider VARCHAR(50), -- 'gemini', 'openai', etc.
    ai_confidence NUMERIC(3, 2), -- 0.00 to 1.00

    -- Damage identification
    damage_detected BOOLEAN DEFAULT false,
    damage_categories damage_category[], -- Array of categories
    damage_severity damage_severity,
    damage_description TEXT,

    -- Location on roof
    roof_section VARCHAR(100), -- 'front', 'back', 'left', 'right', 'ridge', 'valley', etc.
    gps_latitude NUMERIC(10, 8),
    gps_longitude NUMERIC(11, 8),

    -- Annotations
    annotations JSONB, -- Array of {x, y, width, height, label, color}

    -- Metadata
    caption TEXT, -- User-provided caption
    file_size_bytes INTEGER,
    mime_type VARCHAR(50),
    taken_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- PRESENTATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS presentations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign keys
    inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Presentation details
    title VARCHAR(255) NOT NULL,
    presentation_status presentation_status DEFAULT 'draft',

    -- Slide configuration
    slides JSONB NOT NULL DEFAULT '[]', -- Array of slide objects
    slide_count INTEGER DEFAULT 0,

    -- Theme and branding
    theme VARCHAR(50) DEFAULT 'professional', -- 'professional', 'modern', 'classic'
    company_logo_url TEXT,
    brand_color VARCHAR(7), -- Hex color #RRGGBB

    -- Customer information (denormalized for presentation)
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255),
    customer_phone VARCHAR(20),

    -- Property information (denormalized)
    property_address TEXT NOT NULL,
    property_city VARCHAR(100),
    property_state VARCHAR(2),
    property_zip VARCHAR(10),

    -- Financial details
    estimated_cost NUMERIC(10, 2),
    estimated_cost_high NUMERIC(10, 2),
    financing_options JSONB, -- Array of financing options

    -- Sharing and delivery
    share_url VARCHAR(500), -- Unique shareable URL
    share_token VARCHAR(100) UNIQUE, -- Token for URL
    password_protected BOOLEAN DEFAULT false,
    password_hash VARCHAR(255), -- Bcrypt hash
    expires_at TIMESTAMPTZ, -- Optional expiration

    -- Analytics summary (updated by triggers)
    total_views INTEGER DEFAULT 0,
    unique_viewers INTEGER DEFAULT 0,
    last_viewed_at TIMESTAMPTZ,
    average_view_duration INTEGER, -- Seconds

    -- PDF export
    pdf_url TEXT,
    pdf_generated_at TIMESTAMPTZ,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    signed_at TIMESTAMPTZ
);

-- ============================================================================
-- PRESENTATION SHARES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS presentation_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign keys
    presentation_id UUID NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Recipient details
    recipient_name VARCHAR(255),
    recipient_email VARCHAR(255) NOT NULL,
    recipient_phone VARCHAR(20),

    -- Share method
    share_method VARCHAR(50) NOT NULL, -- 'email', 'sms', 'link', 'qr_code'
    share_message TEXT, -- Custom message included with share

    -- Email tracking
    email_sent BOOLEAN DEFAULT false,
    email_sent_at TIMESTAMPTZ,
    email_opened BOOLEAN DEFAULT false,
    email_opened_at TIMESTAMPTZ,

    -- SMS tracking
    sms_sent BOOLEAN DEFAULT false,
    sms_sent_at TIMESTAMPTZ,
    sms_message_sid VARCHAR(100),

    -- Access tracking
    first_viewed_at TIMESTAMPTZ,
    last_viewed_at TIMESTAMPTZ,
    view_count INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- PRESENTATION VIEWS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS presentation_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign keys
    presentation_id UUID NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
    presentation_share_id UUID REFERENCES presentation_shares(id) ON DELETE SET NULL,

    -- Viewer information
    viewer_ip VARCHAR(45), -- IPv4 or IPv6
    viewer_user_agent TEXT,
    viewer_device VARCHAR(50), -- 'desktop', 'mobile', 'tablet'
    viewer_browser VARCHAR(50),
    viewer_os VARCHAR(50),

    -- Geographic data
    viewer_city VARCHAR(100),
    viewer_state VARCHAR(2),
    viewer_country VARCHAR(2),

    -- Session details
    session_id VARCHAR(100), -- Track individual sessions
    view_duration INTEGER, -- Seconds spent viewing
    slides_viewed JSONB, -- Array of slide numbers viewed
    total_slides_viewed INTEGER DEFAULT 0,
    completed_presentation BOOLEAN DEFAULT false, -- Viewed all slides

    -- Interaction tracking
    downloaded_pdf BOOLEAN DEFAULT false,
    clicked_contact BOOLEAN DEFAULT false,
    clicked_financing BOOLEAN DEFAULT false,
    form_submitted BOOLEAN DEFAULT false,

    -- Referrer
    referrer_url TEXT,
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),

    -- Timestamps
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Inspections indexes
CREATE INDEX IF NOT EXISTS idx_inspections_job_id
    ON inspections(job_id);
CREATE INDEX IF NOT EXISTS idx_inspections_user_id
    ON inspections(user_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status
    ON inspections(inspection_status);
CREATE INDEX IF NOT EXISTS idx_inspections_date
    ON inspections(inspection_date DESC);
CREATE INDEX IF NOT EXISTS idx_inspections_created_at
    ON inspections(created_at DESC);

-- Inspection photos indexes
CREATE INDEX IF NOT EXISTS idx_inspection_photos_inspection_id
    ON inspection_photos(inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_photos_user_id
    ON inspection_photos(user_id);
CREATE INDEX IF NOT EXISTS idx_inspection_photos_order
    ON inspection_photos(inspection_id, photo_order);
CREATE INDEX IF NOT EXISTS idx_inspection_photos_damage
    ON inspection_photos(damage_detected, damage_severity)
    WHERE damage_detected = true;

-- GIN index for damage categories array
CREATE INDEX IF NOT EXISTS idx_inspection_photos_damage_categories
    ON inspection_photos USING GIN(damage_categories);

-- Presentations indexes
CREATE INDEX IF NOT EXISTS idx_presentations_inspection_id
    ON presentations(inspection_id);
CREATE INDEX IF NOT EXISTS idx_presentations_job_id
    ON presentations(job_id);
CREATE INDEX IF NOT EXISTS idx_presentations_user_id
    ON presentations(user_id);
CREATE INDEX IF NOT EXISTS idx_presentations_status
    ON presentations(presentation_status);
CREATE INDEX IF NOT EXISTS idx_presentations_share_token
    ON presentations(share_token)
    WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_presentations_created_at
    ON presentations(created_at DESC);

-- Presentation shares indexes
CREATE INDEX IF NOT EXISTS idx_presentation_shares_presentation_id
    ON presentation_shares(presentation_id);
CREATE INDEX IF NOT EXISTS idx_presentation_shares_user_id
    ON presentation_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_presentation_shares_recipient_email
    ON presentation_shares(recipient_email);
CREATE INDEX IF NOT EXISTS idx_presentation_shares_email_opened
    ON presentation_shares(email_opened, email_opened_at DESC)
    WHERE email_opened = true;
CREATE INDEX IF NOT EXISTS idx_presentation_shares_created_at
    ON presentation_shares(created_at DESC);

-- Presentation views indexes
CREATE INDEX IF NOT EXISTS idx_presentation_views_presentation_id
    ON presentation_views(presentation_id);
CREATE INDEX IF NOT EXISTS idx_presentation_views_share_id
    ON presentation_views(presentation_share_id);
CREATE INDEX IF NOT EXISTS idx_presentation_views_session_id
    ON presentation_views(session_id);
CREATE INDEX IF NOT EXISTS idx_presentation_views_completed
    ON presentation_views(completed_presentation, created_at DESC)
    WHERE completed_presentation = true;
CREATE INDEX IF NOT EXISTS idx_presentation_views_created_at
    ON presentation_views(created_at DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp for inspections
CREATE OR REPLACE FUNCTION update_inspection_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();

    -- Set completed_at when status changes to completed
    IF NEW.inspection_status = 'completed' AND OLD.inspection_status != 'completed' THEN
        NEW.completed_at = NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_inspections_updated_at
    BEFORE UPDATE ON inspections
    FOR EACH ROW
    EXECUTE FUNCTION update_inspection_timestamp();

-- Update timestamp for inspection_photos
CREATE OR REPLACE FUNCTION update_inspection_photo_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_inspection_photos_updated_at
    BEFORE UPDATE ON inspection_photos
    FOR EACH ROW
    EXECUTE FUNCTION update_inspection_photo_timestamp();

-- Update timestamp and analytics for presentations
CREATE OR REPLACE FUNCTION update_presentation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();

    -- Set sent_at when status changes to sent
    IF NEW.presentation_status = 'sent' AND OLD.presentation_status != 'sent' THEN
        NEW.sent_at = NOW();
    END IF;

    -- Set signed_at when status changes to signed
    IF NEW.presentation_status = 'signed' AND OLD.presentation_status != 'signed' THEN
        NEW.signed_at = NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_presentations_updated_at
    BEFORE UPDATE ON presentations
    FOR EACH ROW
    EXECUTE FUNCTION update_presentation_timestamp();

-- Update timestamp for presentation_shares
CREATE OR REPLACE FUNCTION update_presentation_share_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_presentation_shares_updated_at
    BEFORE UPDATE ON presentation_shares
    FOR EACH ROW
    EXECUTE FUNCTION update_presentation_share_timestamp();

-- Update presentation analytics when views are added
CREATE OR REPLACE FUNCTION update_presentation_analytics()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE presentations
    SET
        total_views = total_views + 1,
        last_viewed_at = NEW.created_at,
        updated_at = NOW()
    WHERE id = NEW.presentation_id;

    -- Update share analytics if associated with a share
    IF NEW.presentation_share_id IS NOT NULL THEN
        UPDATE presentation_shares
        SET
            view_count = view_count + 1,
            first_viewed_at = COALESCE(first_viewed_at, NEW.created_at),
            last_viewed_at = NEW.created_at,
            updated_at = NOW()
        WHERE id = NEW.presentation_share_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_presentation_views_analytics
    AFTER INSERT ON presentation_views
    FOR EACH ROW
    EXECUTE FUNCTION update_presentation_analytics();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Generate unique share token for presentation
CREATE OR REPLACE FUNCTION generate_share_token()
RETURNS VARCHAR(100) AS $$
DECLARE
    token VARCHAR(100);
    token_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate random token (16 bytes = 32 hex chars)
        token := encode(gen_random_bytes(16), 'hex');

        -- Check if token already exists
        SELECT EXISTS(SELECT 1 FROM presentations WHERE share_token = token) INTO token_exists;

        EXIT WHEN NOT token_exists;
    END LOOP;

    RETURN token;
END;
$$ LANGUAGE plpgsql;

-- Create presentation from inspection
CREATE OR REPLACE FUNCTION create_presentation_from_inspection(
    p_inspection_id UUID,
    p_title VARCHAR DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_presentation_id UUID;
    v_inspection RECORD;
    v_job RECORD;
    v_slide_count INTEGER;
BEGIN
    -- Get inspection details
    SELECT i.*, j.customer, j.property
    INTO v_inspection
    FROM inspections i
    JOIN jobs j ON i.job_id = j.id
    WHERE i.id = p_inspection_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inspection not found: %', p_inspection_id;
    END IF;

    -- Count photos for slide count estimation
    SELECT COUNT(*) INTO v_slide_count FROM inspection_photos WHERE inspection_id = p_inspection_id;

    -- Create presentation
    INSERT INTO presentations (
        inspection_id,
        job_id,
        user_id,
        title,
        customer_name,
        customer_email,
        customer_phone,
        property_address,
        property_city,
        property_state,
        property_zip,
        estimated_cost,
        estimated_cost_high,
        slide_count,
        share_token
    ) VALUES (
        p_inspection_id,
        v_inspection.job_id,
        v_inspection.user_id,
        COALESCE(p_title, 'Roof Inspection Report - ' || v_inspection.property_address),
        v_inspection.customer->>'name',
        v_inspection.customer->>'email',
        v_inspection.customer->>'phone',
        v_inspection.property_address,
        v_inspection.property_city,
        v_inspection.property_state,
        v_inspection.property_zip,
        v_inspection.estimated_cost,
        v_inspection.estimated_cost_high,
        v_slide_count + 5, -- Photos + intro + summary + recommendations + contact + closing
        generate_share_token()
    )
    RETURNING id INTO v_presentation_id;

    RETURN v_presentation_id;
END;
$$ LANGUAGE plpgsql;

-- Get presentation analytics summary
CREATE OR REPLACE FUNCTION get_presentation_analytics(
    p_presentation_id UUID
)
RETURNS TABLE (
    total_views INTEGER,
    unique_sessions INTEGER,
    completed_views INTEGER,
    avg_duration NUMERIC,
    pdf_downloads INTEGER,
    contact_clicks INTEGER,
    last_viewed TIMESTAMPTZ,
    device_breakdown JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER as total_views,
        COUNT(DISTINCT session_id)::INTEGER as unique_sessions,
        COUNT(*) FILTER (WHERE completed_presentation = true)::INTEGER as completed_views,
        ROUND(AVG(view_duration), 0) as avg_duration,
        COUNT(*) FILTER (WHERE downloaded_pdf = true)::INTEGER as pdf_downloads,
        COUNT(*) FILTER (WHERE clicked_contact = true)::INTEGER as contact_clicks,
        MAX(created_at) as last_viewed,
        jsonb_build_object(
            'desktop', COUNT(*) FILTER (WHERE viewer_device = 'desktop'),
            'mobile', COUNT(*) FILTER (WHERE viewer_device = 'mobile'),
            'tablet', COUNT(*) FILTER (WHERE viewer_device = 'tablet')
        ) as device_breakdown
    FROM presentation_views
    WHERE presentation_id = p_presentation_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Inspection summary with photo count
CREATE OR REPLACE VIEW inspection_summary AS
SELECT
    i.id,
    i.job_id,
    i.user_id,
    i.property_address,
    i.property_city,
    i.property_state,
    i.inspection_date,
    i.inspector_name,
    i.inspection_status,
    i.overall_condition,
    i.recommended_action,
    i.estimated_cost,
    i.insurance_claimable,
    COUNT(DISTINCT ip.id) as photo_count,
    COUNT(DISTINCT ip.id) FILTER (WHERE ip.damage_detected = true) as damage_photo_count,
    COUNT(DISTINCT p.id) as presentation_count,
    i.created_at,
    i.updated_at,
    i.completed_at
FROM inspections i
LEFT JOIN inspection_photos ip ON i.id = ip.inspection_id
LEFT JOIN presentations p ON i.id = p.inspection_id
GROUP BY i.id;

-- Presentation analytics view
CREATE OR REPLACE VIEW presentation_analytics AS
SELECT
    p.id,
    p.title,
    p.presentation_status,
    p.customer_name,
    p.property_address,
    p.estimated_cost,
    p.total_views,
    p.unique_viewers,
    p.last_viewed_at,
    COUNT(DISTINCT ps.id) as share_count,
    COUNT(DISTINCT pv.id) as detailed_view_count,
    COUNT(DISTINCT pv.session_id) as unique_session_count,
    COUNT(DISTINCT pv.id) FILTER (WHERE pv.completed_presentation = true) as completed_view_count,
    ROUND(AVG(pv.view_duration), 0) as avg_view_duration_seconds,
    p.created_at,
    p.sent_at,
    p.signed_at
FROM presentations p
LEFT JOIN presentation_shares ps ON p.id = ps.presentation_id
LEFT JOIN presentation_views pv ON p.id = pv.presentation_id
GROUP BY p.id;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE inspections IS 'Roof inspections linked to jobs with detailed property and damage assessment';
COMMENT ON TABLE inspection_photos IS 'Photos from inspections with AI analysis and damage detection';
COMMENT ON TABLE presentations IS 'Generated presentations from inspections for customer delivery';
COMMENT ON TABLE presentation_shares IS 'Track how presentations are shared with recipients';
COMMENT ON TABLE presentation_views IS 'Detailed analytics for presentation views and interactions';

COMMENT ON COLUMN inspections.weather_conditions IS 'JSONB: {temperature, conditions, wind_speed, precipitation}';
COMMENT ON COLUMN inspections.measurements IS 'JSONB: Detailed roof measurements and dimensions';
COMMENT ON COLUMN inspections.materials_needed IS 'JSONB: Array of {material, quantity, unit, notes}';

COMMENT ON COLUMN inspection_photos.damage_categories IS 'Array of damage types detected in photo';
COMMENT ON COLUMN inspection_photos.annotations IS 'JSONB: Array of {x, y, width, height, label, color} for marking damage';

COMMENT ON COLUMN presentations.slides IS 'JSONB: Array of slide objects with content and layout';
COMMENT ON COLUMN presentations.financing_options IS 'JSONB: Array of available financing options';
COMMENT ON COLUMN presentations.share_token IS 'Unique token for shareable URL';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 049: Inspection Presentations System created successfully!';
    RAISE NOTICE '📋 Created tables: inspections, inspection_photos, presentations, presentation_shares, presentation_views';
    RAISE NOTICE '🎨 Created enum types: inspection_status, damage_category, damage_severity, presentation_status';
    RAISE NOTICE '🔍 Created helper functions: generate_share_token, create_presentation_from_inspection, get_presentation_analytics';
    RAISE NOTICE '📊 Created views: inspection_summary, presentation_analytics';
    RAISE NOTICE '⚡ Created triggers for timestamps and analytics updates';
END $$;
