-- Migration 083: profile_leads structured metadata + share tracking
--
-- Adds explicit columns for fields we were previously stuffing into the
-- generic `message` text blob:
--   - how_did_hear: dropdown answer from JotForm "How Did You Hear About Us?"
--   - referral_name: text answer to "Provide Name of Referral"
-- Surfacing these as columns lets the admin dashboard filter by acquisition
-- channel and the team see which reps drive referrals without parsing free text.
--
-- Also adds profile_shares for tracking when QR/profile URLs are shared.
-- Mirrors qr_scans shape so the analytics page can union both streams
-- against the same time dimension.

ALTER TABLE profile_leads
  ADD COLUMN IF NOT EXISTS how_did_hear TEXT,
  ADD COLUMN IF NOT EXISTS referral_name TEXT;

CREATE INDEX IF NOT EXISTS profile_leads_how_did_hear_idx
  ON profile_leads (how_did_hear)
  WHERE how_did_hear IS NOT NULL;

COMMENT ON COLUMN profile_leads.how_did_hear IS
  'JotForm "How Did You Hear About Us?" — dropdown answer (e.g. Doorhanger, Spoke to a Rep, Referral, Online).';
COMMENT ON COLUMN profile_leads.referral_name IS
  'JotForm "Provide Name of Referral" — free text. Populated only when how_did_hear suggests a referral.';

-- Share-event tracking. Currently no client-side hook fires this, but the
-- table is in place so analytics can union it once we wire the share button
-- on profile pages (Web Share API / native share sheet / copy-link click).
CREATE TABLE IF NOT EXISTS profile_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES employee_profiles(id) ON DELETE SET NULL,
  profile_slug TEXT NOT NULL,
  share_type TEXT NOT NULL,  -- 'native', 'copy_link', 'sms', 'email', 'social'
  user_agent TEXT,
  ip_hash TEXT,
  shared_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profile_shares_slug_idx ON profile_shares (profile_slug);
CREATE INDEX IF NOT EXISTS profile_shares_shared_at_idx ON profile_shares (shared_at DESC);
CREATE INDEX IF NOT EXISTS profile_shares_profile_id_idx ON profile_shares (profile_id);

COMMENT ON TABLE profile_shares IS
  'Each row = one share action of a rep''s profile/QR. Mirrors qr_scans for unified analytics.';
