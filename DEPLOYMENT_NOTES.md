# S21 ROOFER Deployment Notes

## Latest Deployment - November 4, 2025 (Evening)

### Critical Fixes Deployed:
1. **Database Mode Enabled** - Chat messages now save to PostgreSQL (not just browser localStorage)
2. **Login Emails Working** - Admin receives email on first-time user login
3. **Citation Styling Fixed** - Citations show as red hoverable badges
4. **Admin Panel Export** - Stat cards now export data (CSV/JSON)
5. **Login Page Redesigned** - Compact, clean layout with branded background

### Verification Checklist:
- [ ] Login emails arriving at admin inbox
- [ ] Conversations visible in admin panel
- [ ] Citations showing in red color
- [ ] Database mode active (check console logs)
- [ ] New login page design visible

### If Issues Persist:
1. **Hard Refresh Browser**: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. **Clear Browser Cache**: Clear site data for sa21.up.railway.app
3. **Check Console**: Look for "Database mode enabled" message
4. **Verify API Health**: Visit https://sa21.up.railway.app/api/health
5. **Check Providers**: Visit https://sa21.up.railway.app/api/providers/status (booleans only)

### Known Build Hash:
Production should serve: `index-z2ycfw80.js` (or newer)
If serving older hash, Railway didn't rebuild.

### Environment Variables Required:
- `DATABASE_URL` - PostgreSQL connection
- `RESEND_API_KEY` - Email delivery
- `EMAIL_ADMIN_ADDRESS` - Receives notifications
- `EMAIL_FROM_ADDRESS` - Sender email
- `VITE_GROQ_API_KEY` - Groq (preferred provider)
- `VITE_TOGETHER_API_KEY` - Together AI (fallback)
- `VITE_GEMINI_API_KEY` - Google Gemini (fallback)
- `VITE_HF_API_KEY` - Hugging Face (optional)

Notes:
- Frontend reads provider keys via `import.meta.env` (Vite). Use the `VITE_*` names above.
- Keys must be present at build time so they get injected into the bundle.
- Never expose non-VITE secrets to the client; only set VITE_* keys intended for the browser.

---
Last Updated: November 4, 2025 21:55 EST
