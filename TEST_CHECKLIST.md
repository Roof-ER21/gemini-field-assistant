# Gemini Field Assistant - Testing Checklist

**Generated**: January 30, 2026
**Status**: All API endpoints verified working

---

## API Endpoints (Verified via curl)

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /api/health` | ✅ PASS | Returns healthy, database connected |
| `GET /api/canvassing/stats` | ✅ PASS | Returns user stats |
| `GET /api/canvassing/stats/user` | ✅ PASS | Returns user-specific stats |
| `GET /api/canvassing/sessions` | ✅ PASS | Returns session history |
| `GET /api/canvassing/follow-ups` | ✅ PASS | Returns follow-up list |
| `GET /api/canvassing/team-stats` | ✅ PASS | Fixed SQL interval bug |
| `GET /api/canvassing/heatmap` | ✅ PASS | Returns heatmap data |
| `GET /api/canvassing/intel/stats` | ✅ PASS | Returns intel statistics |
| `GET /api/assets/stats` | ✅ PASS | Returns impacted asset stats |
| `GET /api/impacted-assets/stats` | ✅ PASS | Same as above (alias) |
| `GET /api/assets/properties` | ✅ PASS | Returns property list |
| `GET /api/assets/alerts` | ✅ PASS | Returns alerts list |
| `GET /api/push/preferences` | ✅ PASS | Returns notification prefs |
| `GET /api/hail/status` | ✅ PASS | IHM configured |
| `GET /api/hail/search` | ✅ PASS | Returns hail events |

---

## UI Manual Testing Checklist

### 1. Canvassing Panel
Open: https://sa21.up.railway.app/ → Login → Canvassing icon in sidebar

- [ ] Panel loads without errors
- [ ] Stats cards display correctly
- [ ] "Add Entry" button works
- [ ] Modal appears centered with dark backdrop
- [ ] Modal scrolls if content exceeds viewport
- [ ] Form fields are accessible and editable
- [ ] Submit button works
- [ ] Close button (X) works
- [ ] Clicking backdrop closes modal
- [ ] Sessions tab shows history
- [ ] Follow-ups tab shows list
- [ ] Activity tab shows recent activity
- [ ] Intel tab shows neighborhood data

### 2. Impacted Assets Panel
Open: → Login → Impacted Assets icon in sidebar

- [ ] Panel loads without errors
- [ ] Stats cards display (properties, alerts, conversion)
- [ ] "Add Property" button works
- [ ] Add Property modal appears with dark backdrop
- [ ] Address autocomplete works
- [ ] Form validation works
- [ ] Submit creates property
- [ ] Properties list updates
- [ ] Alert cards show pending alerts
- [ ] Alert actions work (Contact, Convert, Dismiss)

### 3. Document/Jobs Panel
Open: → Login → Document/Jobs icon in sidebar

- [ ] Panel loads without errors
- [ ] Kanban columns display
- [ ] "New Job" button works
- [ ] Create Job modal appears full-screen with backdrop
- [ ] Customer search works
- [ ] Job type selection works
- [ ] Form submission creates job
- [ ] Job cards appear in correct columns
- [ ] Drag and drop works (if implemented)
- [ ] Job detail modal opens on click
- [ ] Edit functionality works

### 4. Chat Panel (Susan)
Open: → Login → Chat in main view

- [ ] Chat loads without errors
- [ ] Can type message
- [ ] Send button works
- [ ] Susan responds
- [ ] Hail lookup works ("check hail at Frederick, MD")
- [ ] History loads correctly
- [ ] Streaming responses work

### 5. General UI
- [ ] Sidebar navigation works
- [ ] All icons load correctly
- [ ] Dark mode displays properly
- [ ] No console errors (open DevTools → Console)
- [ ] No network errors (DevTools → Network)

---

## Quick curl Tests (Run these)

```bash
# Health
curl -s https://sa21.up.railway.app/api/health

# Canvassing (use your email)
curl -s https://sa21.up.railway.app/api/canvassing/stats \
  -H "x-user-email: YOUR_EMAIL@theroofdocs.com"

# Hail lookup
curl -s "https://sa21.up.railway.app/api/hail/search?street=123%20Main&city=Frederick&state=MD&zip=21701"
```

---

## Fixes Applied in This Session

1. **dist-server sync issue**: Pre-push hook now auto-rebuilds
2. **Team Stats SQL**: Fixed `CURRENT_DATE - $1` interval arithmetic
3. **Route paths**: Verified all routes registered correctly

---

## Deployment Process (Going Forward)

```bash
# Option 1: Use the deploy script (recommended)
./scripts/deploy.sh

# Option 2: Manual push (pre-push hook will handle rebuild)
git add .
git commit -m "your message"
git push origin main

# Pre-push hook automatically:
# 1. Runs npm run server:build
# 2. Commits any dist-server changes
# 3. Pushes to Railway
```

---

## Known Limitations

1. **Rate limiting**: API has rate limits (expected behavior)
2. **Local vs Production DB**: Local uses localhost, Railway uses railway internal DB
3. **Build size warnings**: Some chunks > 500KB (optimization opportunity, not blocking)

---

*This checklist is saved at `/Users/a21/gemini-field-assistant/TEST_CHECKLIST.md`*
