-- ============================================================================
-- 086 — Marketing role for QR-codes-only admin access
-- ============================================================================
-- Purpose: Add 'marketing' as a valid role so the marketing person can manage
-- QR profiles (add/edit/delete reps, upload headshots+videos, generate +
-- download QR codes for printing, view scan analytics) without seeing the rest
-- of admin (settings, users, tiers, goals, Agnes config, leads).
--
-- Backend route gating: server/lib/permissions.ts → canManageQR(pool, email)
-- returns true for role IN ('admin','marketing'). Applied to all routes in
-- server/routes/profileRoutes.ts and server/routes/qrAnalyticsRoutes.ts.
-- The four /api/admin/auth/* PIN endpoints in server/index.ts also accept
-- marketing role so the marketing user can set + use a PIN-protected session.
--
-- Frontend gating: components/AdminPanel.tsx and components/Sidebar.tsx use
-- canManageQR for QR-related sections, isAdmin for everything else. Marketing
-- users are forced onto the QR Profiles tab via a useEffect; backend 403 is
-- the safety net.
--
-- Admin override: any admin user can do everything a marketing user can do
-- and more — admin role is a superset.
--
-- The role column is already VARCHAR(50) and accepts free-form values, so
-- there's nothing to ALTER. This migration exists for audit trail and to
-- update the column comment for future readers.
-- ============================================================================

COMMENT ON COLUMN users.role IS
  'sales_rep | manager | admin | marketing. Marketing has QR-codes-only admin access; see server/lib/permissions.ts.';

-- Index for role-based lookups already exists as idx_users_role; no-op here
-- if running a fresh schema.sql install.
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
