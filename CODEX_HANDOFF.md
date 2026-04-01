# Gemini Field Assistant — Handoff (Apr 1, 2026)

## Project
- **Repo**: `/Users/a21/gemini-field-assistant/`
- **Production**: https://sa21.up.railway.app
- **Deploy**: `git push origin main` (auto-deploys via Railway)
- **Stack**: React + Vite (frontend) → Express + TypeScript (server) → PostgreSQL
- **DB**: `PGPASSWORD=[REDACTED] psql -h hopper.proxy.rlwy.net -p 15533 -U postgres -d railway`
- **Latest commit**: `25ccd52` (perf: NOAA cache, PDF limiter, DB pool)
- **Admin**: 1 account — ahmed.mahmoud@theroofdocs.com

## What Was Built (40+ commits, Mar 27 - Apr 1)

### Storm Maps & PDFs
- All data from NOAA/NWS/NEXRAD (free federal — IHM/VisualCrossing/HailTrace removed, $500+/mo saved)
- PDF reports: no duplicate rows, consolidated history, dynamic rep profile from DB
- Company: "Roof ER The Roof Docs" | Default phone: (703) 239-3738
- Track Property button → saves to customer_properties for NWS monitoring
- Geocode cache (24h) prevents Nominatim rate-limiting
- NOAA query cache (1hr) — same search = instant response
- PDF concurrency limiter (max 3 simultaneous)
- Sidebar fully scrollable on mobile

### Susan AI (14 tools)
1. schedule_followup, 2. lookup_hail_data, 3. save_client_note, 4. draft_email,
5. share_team_intel, 6. get_job_details, 7. search_knowledge_base, 8. send_email,
9. create_calendar_event, 10. check_availability, 11. fetch_calendar_events,
12. send_notification, 13. generate_storm_report, 14. record_claim_outcome

- Conversation summaries auto-generated on new session
- Last 3 summaries loaded into context for session continuity
- Negative feedback → auto-creates global_learnings (pending admin approval)
- Proactive memory: auto-saves client facts (homeowner, insurer, claim#, adjuster)
- 79/79 reps have preferred_name seeded
- 141 knowledge documents loaded and searchable
- Email placeholders fixed (no more [Your Name] brackets)
- Referral language in thank-you emails
- 24-month minimum search (reps saying "last year" won't miss older storms)
- RAG skips hail/storm/address queries (no irrelevant citations)
- Always uses PDF tool for report requests (never text dumps)

### Doc Analyzer
- Trade selection: Roofing, Siding, Gutters checkboxes
- EagleView/Hover auto-detection from document content
- Siding + gutter Xactimate codes and measurement comparison

### Impacted Assets (fully wired end-to-end)
- Storm Maps → Track Property → NWS monitoring (15-min cron) → impact_alerts → dashboard
- NWS watcher creates storm_events AND checks customer_properties for alerts
- Haversine distance matching, severity calculation (critical/high/medium)

### Admin Panel (3 new tabs + directive expiration)
- Knowledge Base: CRUD for documents (Training group)
- Susan Learnings: approve/reject pending learnings (Training group)
- Rep Phones: inline edit, bulk default set (System group)
- Directives: expiration dates with quick-set buttons (Today/3d/1w/1mo)

### Scaling (Priority 1 done)
- NOAA query cache (1hr TTL, max 200 entries)
- PDF concurrency limiter (max 3 simultaneous, 30s queue)
- DB pool: max 20 connections, 30s idle, 5s connect timeout

### Other
- Field Ops + Inspection Presentations → admin-only sidebar
- Markdown rendering in chat (bold, italic, code)
- JSON sanitized in tool result cards
- Loading progress steps ("Searching NOAA...", "Susan is working...")
- State-aware RAG: wrong-state docs penalized, DMV city names detected
- NOAA distance reframed ("documented in the area" not "X miles away")
- Rep guide page at /rep-guide.html

## Current Production State
- Data sources: NOAA + NWS + NEXRAD (3 federal, all free)
- Users: 84 (82 missing personal phone — using default)
- Knowledge docs: 141
- Global learnings: 3 approved
- Tracked properties: 2
- Agent Intel: 0 (feature built, needs rep submissions)

## Known Remaining Items (all low priority)
- 82 reps need to set phone in Settings > Profile
- Agent Intel feed empty — needs rep content
- QR Profiles coming soon for non-admins
- Old pdfService V1 has stale IHM references (V2 is default)
- Railway auto-scaling needed at 200+ concurrent users
- Redis for shared cache needed with multiple Railway instances

## Build & Test
```bash
cd /Users/a21/gemini-field-assistant
npm run build          # vite + tsc
npm run dev            # local dev
git push origin main   # deploy to Railway
npx vitest run server/services/__tests__/hailReportAccuracy.test.ts  # tests
```

## Key Files
| Area | File |
|------|------|
| Storm Maps UI | `components/TerritoryHailMap.tsx` |
| Susan Chat | `components/ChatPanel.tsx` |
| Susan Tools (14) | `server/services/susanToolService.ts` |
| Susan System Prompt | `config/s21Personality.ts` |
| PDF Generator | `server/services/pdfReportServiceV2.ts` |
| NOAA Service | `server/services/noaaStormService.ts` |
| Hail Routes | `server/routes/hailRoutes.ts` |
| NWS Watcher | `server/services/nwsTerritoryWatcher.ts` |
| Conversation Intel | `server/services/conversationIntelService.ts` |
| RAG Service | `services/ragService.ts` |
| Knowledge Service | `services/knowledgeService.ts` |
| Doc Analyzer | `components/DocumentAnalysisPanel.tsx` |
| Admin Panel | `components/AdminPanel.tsx` |
| Admin Knowledge | `components/AdminKnowledgePanel.tsx` |
| Admin Learnings | `components/AdminLearningsPanel.tsx` |
| Admin Rep Phones | `components/AdminRepPhonePanel.tsx` |
| Directives | `components/DirectivesPanel.tsx` |
| Impacted Assets | `components/ImpactedAssetsPanel.tsx` |
| Rep Guide | `public/rep-guide.html` |

## Memory File
Full sprint details: `~/.claude/projects/-Users-a21/memory/gemini-field-sprint-apr2026.md`
