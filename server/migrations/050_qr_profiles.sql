-- Migration 050: QR Profile Landing Pages
-- Description: Add tables for employee QR profiles, scan tracking, and lead capture
-- Author: Claude Code
-- Date: 2026-02-06

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- FEATURE FLAGS TABLE
-- ============================================================================
-- System-wide feature toggles controlled by admins
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(100) UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT FALSE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(key);

-- Insert QR profiles feature flag (disabled by default)
INSERT INTO feature_flags (key, enabled, description) VALUES
('qr_profiles_enabled', FALSE, 'Enable QR profile landing pages for all users')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- EMPLOYEE PROFILES TABLE
-- ============================================================================
-- Public-facing employee profiles accessible via QR codes
CREATE TABLE IF NOT EXISTS employee_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  role_type VARCHAR(50) DEFAULT 'sales_rep',
  email VARCHAR(255),
  phone_number VARCHAR(50),
  bio TEXT,
  image_url TEXT,
  slug VARCHAR(255) UNIQUE NOT NULL,
  start_year INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  is_claimed BOOLEAN DEFAULT FALSE,
  referral_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employee_profiles_slug ON employee_profiles(slug);
CREATE INDEX IF NOT EXISTS idx_employee_profiles_user_id ON employee_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_profiles_active ON employee_profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_employee_profiles_claimed ON employee_profiles(is_claimed);

-- ============================================================================
-- QR SCANS TABLE
-- ============================================================================
-- Track QR code scans for analytics
CREATE TABLE IF NOT EXISTS qr_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES employee_profiles(id) ON DELETE CASCADE,
  profile_slug VARCHAR(255) NOT NULL,
  scanned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT,
  referrer TEXT,
  ip_hash VARCHAR(64),
  device_type VARCHAR(50),
  source VARCHAR(50) DEFAULT 'qr'
);

CREATE INDEX IF NOT EXISTS idx_qr_scans_profile_id ON qr_scans(profile_id);
CREATE INDEX IF NOT EXISTS idx_qr_scans_profile_slug ON qr_scans(profile_slug);
CREATE INDEX IF NOT EXISTS idx_qr_scans_scanned_at ON qr_scans(scanned_at DESC);

-- ============================================================================
-- PROFILE LEADS TABLE
-- ============================================================================
-- Leads captured from profile contact forms
CREATE TABLE IF NOT EXISTS profile_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES employee_profiles(id) ON DELETE SET NULL,
  homeowner_name VARCHAR(255) NOT NULL,
  homeowner_email VARCHAR(255),
  homeowner_phone VARCHAR(50),
  address TEXT,
  service_type VARCHAR(100),
  message TEXT,
  status VARCHAR(50) DEFAULT 'new',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_profile_leads_profile_id ON profile_leads(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_leads_status ON profile_leads(status);
CREATE INDEX IF NOT EXISTS idx_profile_leads_created_at ON profile_leads(created_at DESC);

-- ============================================================================
-- PROFILE VIDEOS TABLE
-- ============================================================================
-- Welcome videos and testimonials for profiles
CREATE TABLE IF NOT EXISTS profile_videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES employee_profiles(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  is_welcome_video BOOLEAN DEFAULT FALSE,
  duration INTEGER,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_profile_videos_profile_id ON profile_videos(profile_id);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- Feature flags updated_at trigger
CREATE OR REPLACE FUNCTION update_feature_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_feature_flags_updated_at();

-- Employee profiles updated_at trigger
CREATE OR REPLACE FUNCTION update_employee_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_employee_profiles_updated_at
  BEFORE UPDATE ON employee_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_employee_profiles_updated_at();

-- Profile leads updated_at trigger
CREATE OR REPLACE FUNCTION update_profile_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_profile_leads_updated_at
  BEFORE UPDATE ON profile_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_profile_leads_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE feature_flags IS 'System-wide feature toggles for admin control';
COMMENT ON TABLE employee_profiles IS 'Public-facing employee profiles accessible via QR codes';
COMMENT ON TABLE qr_scans IS 'Analytics tracking for QR code scans';
COMMENT ON TABLE profile_leads IS 'Leads captured from profile contact forms';
COMMENT ON TABLE profile_videos IS 'Welcome videos and testimonials for profiles';

COMMENT ON COLUMN employee_profiles.slug IS 'URL-safe identifier for profile (e.g., john-doe)';
COMMENT ON COLUMN employee_profiles.is_claimed IS 'True when a user has claimed this profile';
COMMENT ON COLUMN qr_scans.ip_hash IS 'Privacy-safe hashed IP for unique visitor tracking';
COMMENT ON COLUMN qr_scans.source IS 'How visitor arrived: qr, direct, referral';
COMMENT ON COLUMN profile_leads.status IS 'Lead status: new, contacted, converted, closed';
