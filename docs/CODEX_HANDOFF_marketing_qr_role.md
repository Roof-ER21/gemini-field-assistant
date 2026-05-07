# Codex Handoff — Marketing Role with QR-Codes-Only Admin Access

**Author:** Ahmed (via Claude)
**Date:** 2026-05-07
**Status:** Ready for implementation
**Scope:** Add a new `marketing` role that has full QR-codes admin access, nothing else.

---

## 1. Goal in one sentence

Give the marketing person a login that can do everything the admin can do *inside the QR Profiles section* (add/edit/delete profiles, upload headshots + videos, generate/download QR codes for printing, view QR analytics) — but **cannot see or call any other admin functionality** (sales settings, users, tiers, goals, Agnes config, leads, etc.).

## 2. Why this design (don't change unless flagged)

- **Reuse existing role column** (`users.role VARCHAR(50)`) — already supports new values without a migration to alter the column. We're adding the value `marketing`.
- **Reuse existing PIN auth flow** — marketing user gets a PIN the same way admins do. Same `admin_sessions` table, same `admin_pin_hash` column on `users`. The session token is just allowed for marketing-role users on QR endpoints only.
- **Single permissions helper** — every backend route that today reads `isAdminUser(email)` gets refactored to use a centralized helper. QR-related endpoints switch to `canManageQR(email)` (admin OR marketing). Everything else stays admin-only.
- **No new schema columns, no new tables.** We do not need a `permissions` table for one role expansion. If a third role ever shows up we revisit.

---

## 3. Current state — read this before touching anything

### Auth model
- `database/schema.sql:19` — `users.role VARCHAR(50) DEFAULT 'sales_rep'` with comment `-- sales_rep, manager, admin`
- `users.admin_pin_hash` (added at runtime in `server/index.ts` startup) — bcrypt hash of admin's 4-6 digit PIN
- `admin_sessions` table — `(user_id, token, expires_at)`, token issued after correct PIN, 24h expiry
- Login domain gate: `@theroofdocs.com` only (`server/index.ts:2655` `ALLOWED_EMAIL_DOMAINS`)
- Hardcoded promotion: `server/index.ts:4904` promotes `reese.samala@theroofdocs.com` to `admin` on every boot

### Frontend admin gating points (all check `currentUser?.role === 'admin'`)
- `App.tsx:54` — `AdminDivisionToggle` (top-bar admin toggle)
- `App.tsx` lazy import line 26 — `AdminPanel` chunk
- `components/AdminPanel.tsx:405` — `const isAdmin = currentUser?.role === 'admin';` — the master gate. If `!isAdmin`, the panel returns null at line 1440.
- `components/AdminPanel.tsx:1420` — shows `AdminPinModal` when admin hasn't auth'd yet
- `components/AdminPanel.tsx:4980` — renders `AdminQRProfilesPanel`
- `components/Sidebar.tsx:119` — `const isAdmin = currentUser?.role === 'admin';` — controls which sidebar entries show
- `components/Sidebar.tsx:185` — `{ id: 'admin', label: 'Admin Panel', ... }` — the only admin nav entry today

### Backend endpoints that QR functionality depends on

**`server/routes/profileRoutes.ts`** (admin-only, marketing should keep access):

| Line | Method | Path | Purpose |
|------|--------|------|---------|
| 1156 | GET    | `/api/profile/` | List all QR profiles |
| 1213 | POST   | `/api/profile/` | Create profile |
| 1287 | PUT    | `/api/profile/:id` | Edit profile |
| 1347 | DELETE | `/api/profile/:id` | Delete profile |
| 1388 | POST   | `/api/profile/:id/reset-claim` | Reset claim status |
| 1433 | POST   | `/api/profile/bulk-generate` | Bulk generate from CSV |
| 1503 | GET    | `/api/profile/feature-status` | Feature flag status |
| 1560 | POST   | `/api/profile/toggle-feature` | Enable/disable feature |
| 1600 | POST   | `/api/profile/:id/image` | Upload headshot |
| 1678 | POST   | `/api/profile/:id/videos` | Upload video |
| 1736 | DELETE | `/api/profile/:profileId/videos/:videoId` | Delete video |
| 1791 | GET    | `/api/profile/:id/reviews` | View profile reviews |

Each route currently calls `await isAdminUser(userEmail)` (helper defined at `profileRoutes.ts:142`) and 403s if false.

**`server/routes/qrAnalyticsRoutes.ts`** (admin-only, marketing should keep access):

| Line | Method | Path | Purpose |
|------|--------|------|---------|
| 31   | GET    | `/api/qr-analytics/summary` | Overall scan/share/lead totals |
| 77   | GET    | `/api/qr-analytics/daily` | Daily breakdown |
| 123  | GET    | `/api/qr-analytics/top-profiles` | Top profiles by scans |
| 176  | GET    | `/api/qr-analytics/recent` | Recent scan events |
| 227  | GET    | `/api/qr-analytics/by-device` | Device breakdown |
| 271  | GET    | `/api/qr-analytics/profile/:slug` | Per-profile analytics |

Each calls `await isAdminUser(userEmail)` (helper at `qrAnalyticsRoutes.ts:12`) — same pattern as profileRoutes.

**`server/index.ts` — Admin PIN auth endpoints** (these gate by `users.role === 'admin'` directly):

- `POST /api/admin/auth/check` (line 3084)
- `POST /api/admin/auth/set-pin` (line ~3140)
- `POST /api/admin/auth/login` (after set-pin)
- `POST /api/admin/auth/logout`

These need to also accept `marketing` role so the marketing user can set a PIN and get a session token.

---

## 4. Implementation plan — execute in this order

### Phase A — Backend permission helper (foundation)

**A1. Create `server/lib/permissions.ts`**

```ts
import type { Pool } from 'pg';

export type AppRole = 'sales_rep' | 'manager' | 'admin' | 'marketing';

const QR_ROLES: AppRole[] = ['admin', 'marketing'];

async function getRole(pool: Pool, email?: string): Promise<AppRole | null> {
  if (!email) return null;
  try {
    const r = await pool.query(
      'SELECT role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );
    return (r.rows[0]?.role as AppRole) ?? null;
  } catch (e) {
    console.error('[permissions] getRole failed:', e);
    return null;
  }
}

export async function isAdmin(pool: Pool, email?: string): Promise<boolean> {
  return (await getRole(pool, email)) === 'admin';
}

export async function canManageQR(pool: Pool, email?: string): Promise<boolean> {
  const role = await getRole(pool, email);
  return role !== null && QR_ROLES.includes(role);
}

export async function canAccessAdminPin(pool: Pool, email?: string): Promise<boolean> {
  // Admins and marketing both get PIN-protected sessions.
  // Marketing PIN sessions are only useful for QR endpoints; the role check on
  // each endpoint is what actually scopes access. PIN is just second factor.
  const role = await getRole(pool, email);
  return role === 'admin' || role === 'marketing';
}
```

**A2. Refactor `server/routes/profileRoutes.ts`**

- DELETE the local `isAdminUser` helper at line 142.
- ADD at top: `import { canManageQR } from '../lib/permissions.js';`
- For every route currently calling `await isAdminUser(userEmail)` AND that's QR-management (the table above — rows starting at 1156, 1213, 1287, 1347, 1388, 1433, 1503, 1560, 1600, 1678, 1736, 1791): replace with `await canManageQR(pool, userEmail)`.
- Keep the local `isAdmin` check on `/slug/:slug` (line 450) as `await isAdmin(pool, userEmail)` since that's a public-facing endpoint where admin sees disabled profiles in preview — marketing doesn't need that bypass.
- Variable rename for clarity: `const isAdmin = ...` inside `/:id/image`, `/:id/videos`, `/:profileId/videos/:videoId` becomes `const canManage = ...` — keep the variable so existing logic works.

**A3. Refactor `server/routes/qrAnalyticsRoutes.ts`**

- DELETE the local `isAdminUser` helper at line 12.
- ADD `import { canManageQR, isAdmin } from '../lib/permissions.js';`
- Every route's `if (!await isAdminUser(userEmail))` → `if (!await canManageQR(pool, userEmail))`.
- The `/profile/:slug` endpoint at line 271 has a `const isAdmin = await isAdminUser(userEmail);` — change to `const canManage = await canManageQR(pool, userEmail);` and adjust the comparison logic accordingly (currently allows admin OR profile owner; should allow QR-managers OR profile owner).

**A4. Update `server/index.ts` admin PIN endpoints**

- In `/api/admin/auth/check` (line 3084), `/api/admin/auth/set-pin`, `/api/admin/auth/login`, `/api/admin/auth/logout`:
  - Replace inline `if (...userResult.rows[0].role !== 'admin')` → `if (!['admin','marketing'].includes(userResult.rows[0].role))`
  - Or import `canAccessAdminPin` from the new permissions lib and use that.
- The intent: marketing users go through the same PIN flow. Their session token works the same way. The route-level `canManageQR` check is what restricts them to QR endpoints.

**A5. Marketing-user promotion**

Add right after the Reese promotion line (`server/index.ts:4904`):

```ts
// Promote designated marketing users (env-driven, comma-separated emails)
const marketingEmails = (process.env.MARKETING_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
for (const email of marketingEmails) {
  await pool.query(
    `UPDATE users SET role = 'marketing' WHERE LOWER(email) = $1 AND role NOT IN ('admin','marketing')`,
    [email]
  );
}
```

This lets Ahmed set `MARKETING_EMAILS=ashley@theroofdocs.com` (or whichever address) on Railway and the role flips automatically on next deploy. **Ask Ahmed for the exact email before committing the env var change** — leave the code in place but don't set the env var yourself.

### Phase B — Frontend role plumbing

**B1. Type updates**

- Find the `AuthUser` / `currentUser` type definition (likely `services/authService.ts` or `agnes21/contexts/AuthContext.tsx` — `grep -rn "role:.*admin\|role:.*sales_rep" --include='*.ts' --include='*.tsx'`).
- Extend the `role` type union from `'sales_rep' | 'manager' | 'admin'` to `'sales_rep' | 'manager' | 'admin' | 'marketing'`.

**B2. `components/AdminPanel.tsx`**

- Line 405: alongside `const isAdmin = currentUser?.role === 'admin';` add:
  ```ts
  const isMarketing = currentUser?.role === 'marketing';
  const canManageQR = isAdmin || isMarketing;
  ```
- Line 1420 (PIN modal trigger): change condition from `if (isAdmin && !adminAuthChecked && !showPinModal)` → `if (canManageQR && !adminAuthChecked && !showPinModal)`. Marketing also needs to PIN-auth.
- Line 1440 (master null gate): change `if (!isAdmin)` → `if (!canManageQR)`.
- Throughout the component, every `useEffect` and conditional that's currently `if (isAdmin)` should be inspected:
  - If the side-effect fetches QR-related data (profiles, qr-analytics) → change to `canManageQR`.
  - If it fetches anything else (settings, goals, tiers, users, mappings, agnes config) → keep `isAdmin`.
- Tab visibility: find the tab nav array (search for `activeTab === 'emails'`, `activeTab === 'mappings'`, etc. — there's a list around line 480-525). When `isMarketing && !isAdmin`, force `activeTab` to the QR Profiles tab and hide all other tab buttons.
- Default landing tab for marketing: when `isMarketing && !isAdmin`, set initial `activeTab` to whatever id the QR Profiles tab uses (search for `<AdminQRProfilesPanel` at line 4980 to find its tab id).

**Acceptance test:** Login as marketing user → AdminPanel renders → only the QR Profiles tab is visible → all other tabs hidden → `adminFetch('/api/admin/users')` (if accidentally called) returns 403.

**B3. `components/Sidebar.tsx`**

- Line 119: alongside `const isAdmin = currentUser?.role === 'admin';` add:
  ```ts
  const isMarketing = currentUser?.role === 'marketing';
  const canManageQR = isAdmin || isMarketing;
  ```
- Find the category-builder block (line 199 `navCategories`). It currently uses `isAdmin` to decide whether to include the `'admin'` nav item.
- For marketing users, expose ONLY the `'admin'` nav entry (which routes to AdminPanel where they'll see only QR tab) — possibly relabeled as `"QR Codes"` for clarity. Suggested approach:
  - Add a synthetic nav entry just for marketing: `{ id: 'admin', label: 'QR Codes', desc: 'Profiles, videos, analytics', icon: QrCode }` shown when `isMarketing && !isAdmin`.
  - Hide everything else admin-flavored.
- Marketing user should also see the standard rep-visible categories (Home, Profile, Knowledge Base, etc.) — that's fine, they're @theroofdocs.com employees too.

**B4. `App.tsx`**

- Line 54 (`AdminDivisionToggle`): leave `user.role !== 'admin'` as-is. Marketing should NOT see the division toggle (insurance/retail switch is sensitive).
- Line 26 (`AdminPanel` lazy import): no change needed — marketing users hit the same component.
- Top-bar role badge (if any) — show `Marketing` label when role === 'marketing'.

### Phase C — Migration + tests

**C1. Migration `database/migrations/086_marketing_role.sql`**

Pure documentation migration — the `role` column already accepts any string, but we want to capture the change. Pattern matches existing migrations:

```sql
-- ============================================================================
-- 086 — Marketing role for QR-codes-only admin access
-- ============================================================================
-- Purpose: Add 'marketing' as a valid role so the marketing person can manage
-- QR profiles (add/edit/delete reps, upload headshots+videos, download QR
-- codes, view scan analytics) without seeing the rest of admin (settings,
-- users, tiers, goals, Agnes config, leads).
--
-- Backend route gating: server/lib/permissions.ts → canManageQR(email)
-- returns true for role IN ('admin','marketing'). Applied to all routes in
-- server/routes/profileRoutes.ts and server/routes/qrAnalyticsRoutes.ts.
--
-- Frontend gating: components/AdminPanel.tsx and components/Sidebar.tsx use
-- canManageQR for QR-related sections, isAdmin for everything else.
-- ============================================================================

-- The role column is already VARCHAR(50) and accepts free-form values, so
-- there's nothing to ALTER. This migration exists for audit trail.

-- Refresh the comment on the column for future readers.
COMMENT ON COLUMN users.role IS
  'sales_rep | manager | admin | marketing. Marketing has QR-codes-only admin access.';

-- Index for role-based lookups (idempotent; only adds if missing).
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
```

Add `database/migrations/086_rollback.sql`:

```sql
-- Rollback for 086. Demotes any marketing users back to sales_rep and drops
-- the role index (the column itself is unchanged).
UPDATE users SET role = 'sales_rep' WHERE role = 'marketing';
DROP INDEX IF EXISTS idx_users_role;
```

**C2. Backend tests**

Create `server/__tests__/permissions.test.ts`:

```ts
import { canManageQR, isAdmin } from '../lib/permissions';
// Mock pool with .query → returns { rows: [{ role: '...' }] } per test
// Cases:
//  - admin email   → isAdmin true, canManageQR true
//  - marketing     → isAdmin false, canManageQR true
//  - sales_rep     → both false
//  - manager       → both false
//  - unknown email → both false
//  - undefined     → both false
//  - DB throws     → both false (logs error)
```

Plus add an integration test (or curl-able smoke script) that hits one QR endpoint and one non-QR admin endpoint as a marketing user and asserts 200 vs 403:

```bash
# As marketing user (assume token issued via PIN flow):
curl -H 'x-user-email: marketing@theroofdocs.com' -H 'x-admin-token: ...' \
     http://localhost:3001/api/profile/   # expect 200
curl -H 'x-user-email: marketing@theroofdocs.com' -H 'x-admin-token: ...' \
     http://localhost:3001/api/admin/users  # expect 403
```

**C3. Frontend smoke check (manual)**

1. Promote a test user to marketing:
   ```sql
   UPDATE users SET role='marketing' WHERE email='ashley.test@theroofdocs.com';
   ```
2. Login as that user.
3. Verify sidebar shows only rep-visible items + QR Codes entry.
4. Click QR Codes → AdminPanel opens, only QR Profiles tab visible.
5. Set up PIN via the modal.
6. Add a test profile, upload a headshot, upload a video, generate a QR code, download it.
7. Open browser devtools → Network tab → confirm calls to `/api/admin/users`, `/api/admin/settings`, `/api/admin/goals/tiers` are NOT made (no leakage).

---

## 5. Files Codex will touch (master list)

**New:**
- `server/lib/permissions.ts`
- `database/migrations/086_marketing_role.sql`
- `database/migrations/086_rollback.sql`
- `server/__tests__/permissions.test.ts`

**Modified:**
- `server/routes/profileRoutes.ts` (refactor `isAdminUser` → `canManageQR`)
- `server/routes/qrAnalyticsRoutes.ts` (refactor `isAdminUser` → `canManageQR`)
- `server/index.ts` (PIN endpoints + marketing promotion block)
- `components/AdminPanel.tsx` (add `isMarketing`/`canManageQR`, scope tabs)
- `components/Sidebar.tsx` (add `canManageQR`, scope nav entries)
- `App.tsx` (extend role union type if defined here)
- `services/authService.ts` or wherever `AuthUser.role` lives (extend type union)
- `database/schema.sql` (update the comment on `role` column to mention marketing)

**Untouched (do not regress):**
- All non-QR `/api/admin/*` endpoints
- AgnesPanel admin gating
- TerritoryHailMap admin toggle
- AdminDivisionToggle
- Reese's hardcoded admin promotion

---

## 6. Done criteria — Codex returns to Claude when ALL of these are true

1. `npm run build` (or the project's build command) passes with zero TS errors.
2. New unit tests pass: `npm test -- permissions`.
3. Manual smoke (Phase C3 steps 1-7) completed and a screenshot of the marketing sidebar attached to the PR description.
4. `MARKETING_EMAILS` env-var pattern documented in the PR description (Ahmed will set it on Railway).
5. No diffs to non-QR admin functionality — verify via `git diff main -- server/index.ts | grep -E '^[-+]'` and confirm only the auth-check role array and the marketing promotion block changed.
6. Commit messages follow project style; rebase to a single coherent commit if possible, otherwise 2 (backend, frontend).
7. Branch name: `feat/marketing-qr-role`.

---

## 7. Edge cases / non-goals

- **Per-profile ownership:** A marketing user can edit ANY profile, not just their own. That's intended — they're the central manager.
- **Audit log:** Out of scope. Existing logging on profile mutations is fine.
- **Granular permissions table:** Out of scope. We have one new role, not a permissions matrix. Don't build a `permissions` table.
- **Multiple marketing users:** Supported. The `MARKETING_EMAILS` env is a comma-separated list.
- **Demoting a marketing user back:** Manual SQL update or a future admin-panel toggle. Out of scope here.
- **Marketing user accidentally lands on a non-QR admin page (e.g. via direct URL):** Backend 403 is the safety net. Frontend should also redirect them to the QR tab on render.
- **PIN sharing:** Each marketing user has their own `admin_pin_hash` and own `admin_sessions` row, just like admins. No PIN reuse.

---

## 8. Open questions for Ahmed (Codex should leave these in PR description)

1. What's the marketing person's `@theroofdocs.com` email address? (Needed for `MARKETING_EMAILS` env value.)
2. Should the sidebar entry for marketing read **"QR Codes"** or **"Marketing Hub"**? Defaulted to "QR Codes" — easy to change in one line of Sidebar.tsx.
3. Should marketing users be able to view the `feature-status` and toggle the QR feature on/off, or should that stay admin-only? Defaulted to YES (marketing can toggle) — they're the owner of this feature.

---

## 9. Reference: how Reese was promoted (use this exact pattern for marketing)

`server/index.ts` around line 4904, inside the boot IIFE that creates `admin_sessions`:

```ts
await pool.query(`UPDATE users SET role = 'admin' WHERE LOWER(email) = 'reese.samala@theroofdocs.com' AND role != 'admin'`);
```

Place the marketing promotion loop directly below this, scoped by `MARKETING_EMAILS`.

---

**End of handoff.** Ping Claude when done; Claude reviews the diff and commits.
