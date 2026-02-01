-- Migration: Admin-Configurable Bonus Tiers
-- Description: Create bonus_tiers table for admin-configurable tier system
-- Created: 2025-02-01

-- Create bonus_tiers table
CREATE TABLE IF NOT EXISTS bonus_tiers (
  id SERIAL PRIMARY KEY,
  tier_number INTEGER NOT NULL UNIQUE CHECK (tier_number >= 0 AND tier_number <= 10),
  name VARCHAR(50) NOT NULL,
  min_signups INTEGER NOT NULL CHECK (min_signups >= 0),
  max_signups INTEGER NOT NULL CHECK (max_signups >= min_signups),
  color VARCHAR(20) NOT NULL,
  bonus_display VARCHAR(20) NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index for efficient lookups
CREATE INDEX idx_bonus_tiers_active ON bonus_tiers (is_active, tier_number);
CREATE INDEX idx_bonus_tiers_signups ON bonus_tiers (min_signups, max_signups) WHERE is_active = true;

-- Insert default tier structure
INSERT INTO bonus_tiers (tier_number, name, min_signups, max_signups, color, bonus_display) VALUES
  (0, 'Rookie', 0, 5, '#71717a', ''),
  (1, 'Bronze', 6, 10, '#cd7f32', ''),
  (2, 'Silver', 11, 14, '#c0c0c0', ''),
  (3, 'Gold', 15, 19, '#ffd700', '$'),
  (4, 'Platinum', 20, 24, '#e5e4e2', '$$'),
  (5, 'Diamond', 25, 29, '#b9f2ff', '$$$'),
  (6, 'Elite', 30, 999, '#9333ea', '$$$$$')
ON CONFLICT (tier_number) DO NOTHING;

-- Add comment for documentation
COMMENT ON TABLE bonus_tiers IS 'Admin-configurable bonus tier structure for sales rep gamification';
COMMENT ON COLUMN bonus_tiers.tier_number IS 'Tier level (0 = lowest, higher = better)';
COMMENT ON COLUMN bonus_tiers.min_signups IS 'Minimum signups required for this tier (inclusive)';
COMMENT ON COLUMN bonus_tiers.max_signups IS 'Maximum signups for this tier (inclusive)';
COMMENT ON COLUMN bonus_tiers.color IS 'Hex color code for UI display';
COMMENT ON COLUMN bonus_tiers.bonus_display IS 'Visual representation of bonus level (e.g., $, $$, $$$)';
