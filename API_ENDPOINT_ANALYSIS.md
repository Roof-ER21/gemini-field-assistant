# API Endpoint Analysis Report: server/index.ts

## Summary
Total Endpoints Found: 60+
Critical Security Issues: 9 CRITICAL
Implementation Issues: 8 WARNINGS

---

## 1. ENDPOINTS OVERVIEW

### Health & Status Endpoints
- ✅ GET /api/health - Properly implemented with error handling
- ✅ GET /api/providers/status - No sensitive data exposed
- ✅ GET /api/version - Basic implementation

### User CRUD Endpoints
- ✅ GET /api/users/me - Creates user if not exists
- ✅ GET /api/users/:email - Retrieves user by email
- ✅ POST /api/users - Creates new user with first_login tracking
- ✅ PATCH /api/users/me - Updates user (hardcoded to demo@roofer.com)

### Chat History Endpoints
- ✅ POST /api/chat/messages - Saves messages with proper error handling
- ✅ GET /api/chat/messages - Retrieves chat history with session filtering

### Document Tracking Endpoints
- ✅ POST /api/documents/track-view - Upsert pattern for view tracking
- ✅ GET /api/documents/recent - Lists recent documents
- ✅ POST /api/documents/favorites - Adds to favorites
- ✅ DELETE /api/documents/favorites/:documentPath - Removes from favorites
- ✅ GET /api/documents/favorites - Lists user favorites

### Email & Notification Endpoints
- ✅ POST /api/emails/log - Logs email generation
- ✅ POST /api/notifications/email - Sends email notifications
- ✅ GET /api/notifications/config - Returns email config status

### Analytics Endpoints
- ✅ GET /api/analytics/summary - User activity summary with fallback
- ✅ GET /api/analytics/popular-documents - Top documents with fallback
- ✅ GET /api/admin/analytics/overview - Admin analytics
- ✅ GET /api/admin/analytics/user-activity - User activity analysis
- ✅ GET /api/admin/analytics/feature-usage - Feature usage stats
- ✅ GET /api/admin/analytics/knowledge-base - Knowledge base metrics
- ✅ GET /api/admin/analytics/per-user - Per-user analytics breakdown

### Announcements Endpoints
- ⚠️ GET /api/announcements/active - Public endpoint (GOOD)
- ❌ POST /api/admin/announcements - MISSING ADMIN CHECK

### Activity Logging Endpoints
- ✅ POST /api/activity/log - Activity logging with user validation
- ✅ GET /api/activity/summary/:userId - Activity summary by date
- ✅ POST /api/activity/live-susan - Live Susan session tracking
- ✅ POST /api/activity/transcription - Transcription logging
- ✅ POST /api/activity/document-upload - Document upload tracking

### Admin Management Endpoints
- ✅ GET /api/admin/emails - PROTECTED (has isAdmin check)
- ✅ GET /api/admin/all-messages - PROTECTED (has isAdmin check)
- ⚠️ POST /api/admin/trigger-daily-summary - MISSING ADMIN CHECK
- ⚠️ GET /api/admin/cron-status - MISSING ADMIN CHECK
- ⚠️ POST /api/admin/trigger-cron-manual - MISSING ADMIN CHECK
- ⚠️ POST /api/admin/run-migration - MISSING ADMIN CHECK
- ⚠️ POST /api/admin/run-migration-004 - MISSING ADMIN CHECK
- ⚠️ POST /api/admin/fix-session-id - MISSING ADMIN CHECK
- ❌ GET /api/admin/users - MISSING ADMIN CHECK (exposes all users + activity)
- ❌ GET /api/admin/users-basic - MISSING ADMIN CHECK (exposes user list)
- ❌ GET /api/admin/conversations - MISSING ADMIN CHECK (exposes chat data)
- ❌ GET /api/admin/conversations/:sessionId - MISSING ADMIN CHECK
- ❌ PATCH /api/admin/users/:userId/role - MISSING ADMIN CHECK (allows role elevation!)

### Budget Management Endpoints
- ✅ GET /api/admin/budget/overview - PROTECTED (has isAdmin check)
- ✅ GET /api/admin/budget/users - PROTECTED (has isAdmin check)
- ✅ GET /api/admin/budget/alerts - PROTECTED (has isAdmin check)
- ✅ POST /api/admin/budget/alerts/:id/acknowledge - PROTECTED (has isAdmin check)
- ✅ GET /api/admin/budget/usage-log - PROTECTED (has isAdmin check)
- ✅ PUT /api/admin/budget/user/:userId - PROTECTED (has isAdmin check)
- ✅ PUT /api/admin/budget/company - PROTECTED (has isAdmin check)

### Concerning Chats Endpoints
- ✅ GET /api/admin/concerning-chats - PROTECTED (has isAdmin check)
- ✅ POST /api/admin/concerning-chats/scan - PROTECTED (has isAdmin check)
- ✅ PATCH /api/admin/concerning-chats/:id/review - PROTECTED (has isAdmin check)

### Other Endpoints
- ✅ POST /api/admin/run-analytics-migration - PROTECTED (has isAdmin check)
- ✅ GET /api/insurance/companies - Public endpoint (filtered queries safe)

---

## 2. CRITICAL SECURITY ISSUES

### ISSUE 1: Role Update Without Authorization (CRITICAL)
**Endpoint:** `PATCH /api/admin/users/:userId/role`
**Location:** Lines 1456-1482
**Severity:** CRITICAL - Privilege Escalation
**Problem:** 
- No admin authorization check despite being admin-only endpoint
- Comment says "admin only - in production add auth middleware" but doesn't actually check
- Anyone can call this endpoint to elevate any user to admin role
```typescript
// MISSING this check:
const email = getRequestEmail(req);
const adminCheck = await isAdmin(email);
if (!adminCheck) {
  return res.status(403).json({ error: 'Admin access required' });
}
```
**Risk:** Immediate privilege escalation vulnerability

### ISSUE 2: User Data Exposure (CRITICAL)
**Endpoint:** `GET /api/admin/users` and `GET /api/admin/users-basic`
**Location:** Lines 1318-1372
**Severity:** CRITICAL - Information Disclosure
**Problem:**
- No admin authorization check
- Exposes ALL users with their emails, roles, states, and activity counts
- Completely unauthenticated access to user directory
**Expected Check:**
```typescript
const email = getRequestEmail(req);
const adminCheck = await isAdmin(email);
if (!adminCheck) {
  return res.status(403).json({ error: 'Admin access required' });
}
```

### ISSUE 3: Chat History Exposure (CRITICAL)
**Endpoint:** `GET /api/admin/conversations` and `GET /api/admin/conversations/:sessionId`
**Location:** Lines 1375-1452
**Severity:** CRITICAL - Data Privacy Breach
**Problem:**
- No admin authorization check
- Exposes all user conversations/chat messages
- Can access any user's private conversations with just their userId
- No user ownership validation

### ISSUE 4: Database Migration Without Auth (CRITICAL)
**Endpoint:** `POST /api/admin/run-migration`, `POST /api/admin/run-migration-004`
**Location:** Lines 1022-1279
**Severity:** CRITICAL - Unauthorized Database Modification
**Problem:**
- No admin authorization checks
- Allows anyone to create/alter database tables
- Can corrupt database structure or drop data
- This is DESTRUCTIVE if misused

### ISSUE 5: Announcement Creation Without Auth (HIGH)
**Endpoint:** `POST /api/admin/announcements`
**Location:** Lines 827-863
**Severity:** HIGH - Unauthorized Content Modification
**Problem:**
- No admin authorization check in endpoint logic
- Anyone can create announcements visible to all users
- Can be used for spam or misinformation

### ISSUE 6: Cron Job Triggering Without Auth (HIGH)
**Endpoints:** 
- `GET /api/admin/cron-status` (line 978)
- `POST /api/admin/trigger-cron-manual` (line 1003)
- `POST /api/admin/trigger-daily-summary` (line 941)
**Severity:** HIGH - Unauthorized Job Execution
**Problem:**
- No admin authorization checks
- Can trigger system-wide email jobs, cron operations
- Can cause spam or denial of service

### ISSUE 7: Session ID Migration Without Auth (HIGH)
**Endpoint:** `POST /api/admin/fix-session-id`
**Location:** Lines 1283-1315
**Severity:** HIGH - Unauthorized Schema Modification
**Problem:**
- No admin authorization check
- Allows ALTER TABLE commands without authentication
- Can corrupt chat_history data

### ISSUE 8: CORS Configuration Too Permissive (MEDIUM)
**Location:** Line 45
**Severity:** MEDIUM - Overly Broad Access
**Problem:**
```typescript
app.use(cors()); // Allows ALL origins!
```
**Better:** Restrict to trusted origins
```typescript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://example.com'],
  credentials: true
}));
```

### ISSUE 9: Authentication Based on Header Only (MEDIUM)
**Location:** Line 67-69
**Severity:** MEDIUM - Weak Authentication
**Problem:**
- Uses `x-user-email` header for user identification
- No validation that user actually owns this email
- Falls back to 'demo@roofer.com' if header missing
- Susceptible to header spoofing
```typescript
function getRequestEmail(req: express.Request): string {
  const headerEmail = normalizeEmail(req.header('x-user-email'));
  return headerEmail || 'demo@roofer.com';
}
```

---

## 3. IMPLEMENTATION QUALITY ISSUES

### ISSUE A: Hardcoded Email in PATCH Endpoint (BUG)
**Endpoint:** `PATCH /api/users/me`
**Location:** Line 365
**Problem:**
```typescript
WHERE email = $3  // Parameter is: 'demo@roofer.com'
```
- Always updates 'demo@roofer.com' instead of requesting user
- Should use `getRequestEmail(req)` instead
- Current implementation doesn't respect actual user

### ISSUE B: Input Validation Missing (MEDIUM)
**Endpoints:** Multiple admin endpoints
**Problem:**
- No validation of userId format (UUID validation)
- No validation of limit parameters (could be negative)
- Missing validation of email format in some places

### ISSUE C: Error Response Inconsistency (LOW)
**Problem:**
- Some endpoints return `{ error: 'message' }`
- Others return `{ success: false, error: 'message' }`
- Inconsistent response structure makes client code fragile

### ISSUE D: Fallback Query Patterns (MEDIUM)
**Location:** Lines 640-673, 683-704
**Problem:**
- Multiple try/catch with nested fallback queries
- Silently catches errors and continues
- Makes debugging harder
- Could mask real errors

### ISSUE E: SQL Injection Risk - Dynamic WHERE Clause (MEDIUM)
**Endpoint:** `GET /api/admin/emails`
**Location:** Lines 1504-1512
**Problem:**
```typescript
let searchFilter = '';
if (search && typeof search === 'string' && search.trim() !== '') {
  searchFilter = `WHERE (LOWER(eg.subject) LIKE $1 OR LOWER(eg.recipient_email) LIKE $1)`;
  params.push(`%${search.toLowerCase()}%`);
}
// Then used in string interpolation:
const countQuery = `SELECT COUNT(*)::int as total FROM email_generation_log eg ${searchFilter}`;
```
- While the LIKE values are parameterized, the searchFilter clause itself is string interpolated
- If WHERE clause logic changes, needs careful handling

### ISSUE F: Session ID Not Validated (LOW)
**Location:** Chat endpoints
**Problem:**
- Session IDs are passed as arbitrary strings
- No format validation
- Could be used to construct malicious queries

### ISSUE G: Pool Query Errors Don't Specify Statement (LOW)
**Problem:**
- Error messages expose raw SQL errors to clients
- Could leak schema information
- All endpoints return full error messages

### ISSUE H: No Rate Limiting (MEDIUM)
**Problem:**
- No rate limiting middleware
- Critical endpoints like migrations/user data could be hammered
- Email sending not rate-limited

---

## 4. MISSING ENDPOINT ANALYSIS

### Missing Endpoints That Should Exist:
1. ❌ Update Announcement - No PATCH/PUT endpoint
2. ❌ Delete Announcement - No DELETE endpoint
3. ❌ Delete Chat Message - No DELETE endpoint
4. ❌ Update Chat Message - No PUT/PATCH endpoint
5. ❌ Delete Email Log - No DELETE endpoint
6. ❌ Delete User - No DELETE endpoint
7. ❌ Search Users - No search/filter endpoint

---

## 5. DATABASE QUERY ANALYSIS

### Positive Patterns:
- ✅ Parameterized queries used throughout (prevents SQL injection)
- ✅ ON CONFLICT patterns for upserts
- ✅ Proper timezone handling in timestamps
- ✅ Foreign key constraints with CASCADE

### Issues Found:
- ⚠️ Some queries rely on `LIMIT 1` instead of explicit UNIQUE constraints
- ⚠️ No explicit transaction handling for multi-step operations
- ⚠️ Some queries could benefit from indexes (high-volume operations)

---

## 6. ERROR HANDLING SUMMARY

### Properly Handled:
- ✅ 404 errors for missing resources
- ✅ 400 errors for invalid input
- ✅ 401/403 errors for auth failures (where implemented)
- ✅ 500 errors for server errors
- ✅ Try-catch blocks on all endpoints
- ✅ Console logging for debugging

### Issues:
- ⚠️ Inconsistent error response format
- ⚠️ Some errors expose database schema
- ⚠️ Silent failures in fallback queries

---

## 7. RECOMMENDATIONS (Priority Order)

### IMMEDIATE (Do First - Security Critical):
1. Add admin authorization checks to ALL `/api/admin/*` endpoints
   - Use pattern: `const adminCheck = await isAdmin(getRequestEmail(req)); if (!adminCheck) return res.status(403)...`
2. Fix `/api/admin/users/:userId/role` endpoint - add authorization
3. Add UUID validation for userId parameters
4. Implement proper authentication middleware instead of header-based
5. Fix hardcoded 'demo@roofer.com' in PATCH /api/users/me

### HIGH PRIORITY:
6. Restrict CORS to specific origins
7. Add rate limiting middleware for critical endpoints
8. Add input validation/sanitization layer
9. Standardize error response format
10. Add request logging with security audit trail

### MEDIUM PRIORITY:
11. Implement transaction handling for multi-step operations
12. Add endpoint documentation with required auth levels
13. Add missing CRUD endpoints (update/delete for entities)
14. Remove sensitive error details from client responses
15. Add pagination validation (prevent negative limits)

### LOW PRIORITY:
16. Optimize frequently-used queries with indexes
17. Refactor fallback patterns for better error handling
18. Add API versioning
19. Add OpenAPI/Swagger documentation

---

## 8. SUMMARY TABLE

| Category | Status | Count | Notes |
|----------|--------|-------|-------|
| Total Endpoints | OK | 60+ | Well-distributed across features |
| With Auth Check | WARNING | ~40% | Many admin endpoints lack checks |
| Error Handling | OK | 95%+ | Comprehensive try-catch blocks |
| Parameterized Queries | OK | 100% | Good SQL injection protection |
| Security Issues | CRITICAL | 9 | Authorization bypass risks |
| Missing Features | MEDIUM | 7 | No DELETE operations for main entities |

---

## Critical Code Locations Requiring Fixes

1. **Line 827-863:** POST /api/admin/announcements - Add isAdmin check
2. **Line 941-971:** POST /api/admin/trigger-daily-summary - Add isAdmin check
3. **Line 978-1000:** GET /api/admin/cron-status - Add isAdmin check
4. **Line 1003-1019:** POST /api/admin/trigger-cron-manual - Add isAdmin check
5. **Line 1022-1239:** POST /api/admin/run-migration - Add isAdmin check
6. **Line 1242-1279:** POST /api/admin/run-migration-004 - Add isAdmin check
7. **Line 1283-1315:** POST /api/admin/fix-session-id - Add isAdmin check
8. **Line 1318-1372:** GET /api/admin/users* - Add isAdmin check
9. **Line 1375-1452:** GET /api/admin/conversations* - Add isAdmin check
10. **Line 1456-1482:** PATCH /api/admin/users/:userId/role - Add isAdmin check + Fix hardcoded user
11. **Line 365:** PATCH /api/users/me - Fix hardcoded 'demo@roofer.com'
12. **Line 45:** CORS configuration - Add origin restrictions

