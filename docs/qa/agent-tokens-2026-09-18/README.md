# Connected agents — local eyeball, 2026-09-18

A LOCAL sa21 only: a throwaway Postgres (initdb in a temp dir, port 55721),
schema from `scripts/init-database.js` + `run-migrations.js`, the built server
(`node dist-server/index.js`) with nothing but `DATABASE_URL`, `PORT`,
`RUN_SCHEDULERS=false` and `SA21_PUBLIC_URL=http://localhost:55731` in its
environment (no API keys, no dotenv). Two local reps (`alice.qa@`, `bob.qa@`)
got session rows minted the way `mintSession` writes them; the browser held
Alice's. Never prod.

## What happened

| Step | Result |
|---|---|
| Boot | `agent_tokens` and `agent_token_audit` created by `ensureAgentTokenTables` on the first boot |
| Profile (avatar) → **Connected agents** | Tab present beside Profile / QR Code / Notifications (01, 05) |
| Create "Genie 21", 90 days | Full `s21a_…` token shown once in the bordered box, with Copy and Done (02, 06). Copy → "Copied" |
| List | Name, `…` + last 4 characters, last used, expiry. After Done or a reload the token is not on the page (03, 07) |
| Token against local `/mcp` | `tools/list` → exactly `ask, carrier_directory, carrier_learnings, adjuster_learnings, rep_directory`; `tools/call rep_directory` → 200; `last_used_at` set; one audit row `rep_directory {q} ok` |
| Same token on `/api/agent-tokens` | 401 (an agent token is never a session) |
| Bob's session | Lists `[]`; `DELETE` of Alice's token id → 404; Alice's token still works |
| Revoke (confirm dialog) | Row leaves the list (01, 08); `revoked_at` set; the token on `/mcp` → 401 |
| Widths | 1280×900 and 390×844: no horizontal scroll (`scrollWidth` 390 at phone), the token wraps inside its box, every tab label fits |

## Found and fixed while looking

1. **The tab was unreachable.** It was first added to `UserProfile.tsx`, but the
   avatar opens `ProfilePage`, which renders `UserProfile` *inline* with its own
   tab bar hidden (`{!inline && …}`). Moved to `ProfilePage.tsx`; the
   `UserProfile` change was reverted. Tests could not have caught this: the
   component rendered fine, just never on a screen a rep can reach.
2. **A fourth tab clipped "Notifications" at phone width.** The tab bar was one
   `flex: 1` row (~50px per label at 390px). It is now a grid —
   `repeat(auto-fit, minmax(140px, 1fr))` — one row on desktop, 2×2 on a phone,
   every label whole.

Console errors during the run were all features this bare environment has no
keys or tables for (LiveKit calls, messaging, memory); none came from
`/api/agent-tokens` or `/mcp`.

The tokens visible in 02 and 06 belong to that throwaway database and were
revoked before it was deleted.

## Screenshots

- `01-desktop-empty.png`, `02-desktop-created-shown-once.png`, `03-desktop-list-hint-only.png`
- `05-phone-empty.png`, `06-phone-created-shown-once.png`, `07-phone-list-hint-only.png`, `08-phone-revoked.png`
