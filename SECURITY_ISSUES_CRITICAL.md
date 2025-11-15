# CRITICAL SECURITY ISSUES - Quick Reference

## 9 CRITICAL/HIGH SEVERITY VULNERABILITIES FOUND

### 1. PRIVILEGE ESCALATION - Role Update Without Auth ⚠️ CRITICAL
**File:** `/home/user/gemini-field-assistant/server/index.ts`
**Lines:** 1456-1482
**Endpoint:** `PATCH /api/admin/users/:userId/role`
**Impact:** Anyone can elevate ANY user to admin role
**Status:** NO AUTHORIZATION CHECK

```
Current Code: No isAdmin() call
Expected: Add auth check before line 1459
```

---

### 2. USER DATA DISCLOSURE - All Users Exposed ⚠️ CRITICAL
**File:** `/home/user/gemini-field-assistant/server/index.ts`
**Lines:** 1318-1372
**Endpoints:** 
- `GET /api/admin/users` (line 1318)
- `GET /api/admin/users-basic` (line 1360)
**Impact:** Complete user directory exposed (emails, roles, activity counts)
**Status:** NO AUTHORIZATION CHECK

---

### 3. CHAT PRIVACY BREACH - All Conversations Exposed ⚠️ CRITICAL
**File:** `/home/user/gemini-field-assistant/server/index.ts`
**Lines:** 1375-1452
**Endpoints:**
- `GET /api/admin/conversations` (line 1375)
- `GET /api/admin/conversations/:sessionId` (line 1423)
**Impact:** Any user's private conversations can be accessed
**Status:** NO AUTHORIZATION CHECK

---

### 4. DATABASE CORRUPTION RISK - Migrations Without Auth ⚠️ CRITICAL
**File:** `/home/user/gemini-field-assistant/server/index.ts`
**Lines:** 1022-1279
**Endpoints:**
- `POST /api/admin/run-migration` (line 1022)
- `POST /api/admin/run-migration-004` (line 1242)
**Impact:** Anyone can ALTER/CREATE/DROP database tables
**Status:** NO AUTHORIZATION CHECK

---

### 5. UNAUTHORIZED ANNOUNCEMENTS ⚠️ HIGH
**File:** `/home/user/gemini-field-assistant/server/index.ts`
**Lines:** 827-863
**Endpoint:** `POST /api/admin/announcements`
**Impact:** Anyone can create system-wide announcements (spam risk)
**Status:** NO AUTHORIZATION CHECK
**Note:** Has comment on line 830 about need for admin check

---

### 6. UNAUTHORIZED CRON JOB EXECUTION ⚠️ HIGH
**File:** `/home/user/gemini-field-assistant/server/index.ts`
**Lines:** 941-1019
**Endpoints:**
- `POST /api/admin/trigger-daily-summary` (line 941)
- `GET /api/admin/cron-status` (line 978)
- `POST /api/admin/trigger-cron-manual` (line 1003)
**Impact:** Anyone can trigger system emails/jobs (DoS/spam)
**Status:** NO AUTHORIZATION CHECK

---

### 7. SCHEMA MODIFICATION WITHOUT AUTH ⚠️ HIGH
**File:** `/home/user/gemini-field-assistant/server/index.ts`
**Lines:** 1283-1315
**Endpoint:** `POST /api/admin/fix-session-id`
**Impact:** Anyone can ALTER TABLE structures
**Status:** NO AUTHORIZATION CHECK

---

### 8. OVERLY PERMISSIVE CORS ⚠️ MEDIUM
**File:** `/home/user/gemini-field-assistant/server/index.ts`
**Line:** 45
**Problem:** `app.use(cors())` - Allows requests from ANY origin
**Current:** Allows all origins
**Required:** Restrict to specific domains

---

### 9. HEADER-BASED AUTHENTICATION (Spoofing Risk) ⚠️ MEDIUM
**File:** `/home/user/gemini-field-assistant/server/index.ts`
**Lines:** 66-69
**Problem:** 
```typescript
function getRequestEmail(req: express.Request): string {
  const headerEmail = normalizeEmail(req.header('x-user-email'));
  return headerEmail || 'demo@roofer.com';
}
```
**Risk:** 
- Any client can set x-user-email header to any value
- Falls back to 'demo@roofer.com' if missing
- No validation of email ownership

---

## ADDITIONAL HIGH SEVERITY BUG

### 10. HARDCODED USER EMAIL IN UPDATE ⚠️ BUG
**File:** `/home/user/gemini-field-assistant/server/index.ts`
**Line:** 365
**Endpoint:** `PATCH /api/users/me`
**Problem:**
```typescript
WHERE email = $3  // $3 = 'demo@roofer.com' (hardcoded!)
```
**Impact:** User profile updates always modify demo@roofer.com, not the requesting user
**Fix Required:** Use `getRequestEmail(req)` instead

---

## AUTHORIZATION PATTERN (Use This Everywhere):

```typescript
app.patch('/api/admin/someEndpoint', async (req, res) => {
  try {
    // ADD THIS AT THE START:
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);
    
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // ... rest of endpoint code ...
  } catch (error) {
    // ... error handling ...
  }
});
```

---

## ENDPOINTS NEEDING FIXES (In Order of Criticality)

| Priority | Endpoint | Line(s) | Issue | Fix |
|----------|----------|---------|-------|-----|
| 🔴 CRITICAL | PATCH /api/admin/users/:userId/role | 1456 | No auth | Add isAdmin check |
| 🔴 CRITICAL | GET /api/admin/users | 1318 | No auth | Add isAdmin check |
| 🔴 CRITICAL | GET /api/admin/users-basic | 1360 | No auth | Add isAdmin check |
| 🔴 CRITICAL | GET /api/admin/conversations | 1375 | No auth | Add isAdmin check |
| 🔴 CRITICAL | GET /api/admin/conversations/:sessionId | 1423 | No auth | Add isAdmin check |
| 🔴 CRITICAL | POST /api/admin/run-migration | 1022 | No auth | Add isAdmin check |
| 🔴 CRITICAL | POST /api/admin/run-migration-004 | 1242 | No auth | Add isAdmin check |
| 🟠 HIGH | POST /api/admin/announcements | 827 | No auth | Add isAdmin check |
| 🟠 HIGH | POST /api/admin/trigger-daily-summary | 941 | No auth | Add isAdmin check |
| 🟠 HIGH | GET /api/admin/cron-status | 978 | No auth | Add isAdmin check |
| 🟠 HIGH | POST /api/admin/trigger-cron-manual | 1003 | No auth | Add isAdmin check |
| 🟠 HIGH | POST /api/admin/fix-session-id | 1283 | No auth | Add isAdmin check |
| 🟡 MEDIUM | PATCH /api/users/me | 365 | Hardcoded user | Fix to use getRequestEmail |
| 🟡 MEDIUM | cors() config | 45 | All origins allowed | Restrict origins |
| 🟡 MEDIUM | getRequestEmail() | 66 | Header spoofing risk | Add validation |

---

## POSITIVE FINDINGS

✅ Parameterized queries throughout (SQL injection protection good)
✅ Try-catch blocks on all endpoints (error handling)
✅ Proper HTTP status codes
✅ Some admin endpoints DO have auth checks (good pattern exists)
✅ Database constraints with CASCADE deletes
✅ Console logging for debugging

---

## ATTACK SCENARIOS

### Scenario 1: Privilege Escalation
1. Attacker calls `PATCH /api/admin/users/:userId/role` with userId=their_id, role=admin
2. Their account is elevated to admin
3. Now they can access all /api/admin/* endpoints
4. Full data breach + database corruption possible

### Scenario 2: User Directory Enumeration
1. Attacker calls `GET /api/admin/users`
2. Gets full list of all users, emails, roles
3. Can then access conversations for any user via `/api/admin/conversations`
4. Privacy violation for entire user base

### Scenario 3: Spam/DoS Attack
1. Attacker calls `POST /api/admin/trigger-daily-summary` repeatedly
2. System sends thousands of emails
3. Or calls `POST /api/admin/trigger-cron-manual` to trigger jobs
4. Service degradation

### Scenario 4: Data Corruption
1. Attacker calls `POST /api/admin/run-migration`
2. Creates malicious tables or alters existing ones
3. Or calls `POST /api/admin/fix-session-id`
4. Alters chat_history structure
5. Database corruption / data loss

