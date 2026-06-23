-- Migration 085: QR profile setup attribution
--
-- Adds "who did it" tracking to the QR-profile feature so the Scan Analytics
-- dashboard can answer "who filled out what for who":
--   * employee_profiles.created_by_email  — admin/marketing who created the page
--   * employee_profiles.updated_by_email  — admin/marketing who last edited it
--   * profile_videos.added_by_email       — who added each welcome/testimonial video
--   * profile_reviews.added_by_email      — who curated each review
--
-- These are plain email strings (the x-user-email of the acting admin/marketing
-- user), not FKs, to match how the rest of the QR routes identify the actor.
-- Idempotent — also applied on boot via runStartupMigrations() in server/index.ts.

ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS created_by_email TEXT;
ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS updated_by_email TEXT;
ALTER TABLE profile_videos   ADD COLUMN IF NOT EXISTS added_by_email   TEXT;
ALTER TABLE profile_reviews  ADD COLUMN IF NOT EXISTS added_by_email   TEXT;

COMMENT ON COLUMN employee_profiles.created_by_email IS 'Email of the admin/marketing user who created this rep profile';
COMMENT ON COLUMN employee_profiles.updated_by_email IS 'Email of the admin/marketing user who last edited this rep profile';
COMMENT ON COLUMN profile_videos.added_by_email IS 'Email of the admin/marketing user (or owning rep) who added this video';
COMMENT ON COLUMN profile_reviews.added_by_email IS 'Email of the admin/marketing user who curated this review';
