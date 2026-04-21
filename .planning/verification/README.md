# Verification Pipeline Planning

Multi-source verification of storm events for Gemini Field Assistant. Makes reports more defensible than any single-source competitor (HailTrace, IHM).

## Phase Status

| Phase | Name | Status | Owner |
|---|---|---|---|
| 0 | Schema + decisions | 🟡 DRAFT (awaiting sign-off) | Claude |
| 1 | CoCoRaHS ingest | ⏸️ Blocked on Phase 0 | — |
| 2 | Unified table migration | ⏸️ Blocked on Phase 1 | — |
| 3 | PDF verification badge | ⏸️ Blocked on Phase 2 | — |
| 4 | Rep self-reports | ⏸️ Blocked on Phase 2 | — |
| 5 | End-to-end audit | ⏸️ Blocked on Phase 3+4 | — |
| 6 | HailTrace/IHM bonus (optional) | ⏸️ Awaiting HailTrace recon | — |

## Documents

- [00_DECISIONS.md](./00_DECISIONS.md) — architectural decisions + go/no-go gate
- [01_SCHEMA_DRAFT.sql](./01_SCHEMA_DRAFT.sql) — migration 070 draft (NOT yet applied)
- [02_UPSERT_LOGIC.md](./02_UPSERT_LOGIC.md) — write pattern all sources use

## Next Step

User reviews Phase 0 docs → either approves or requests changes → Phase 1 kicks off.

HailTrace recon (parallel track) will inform Phase 6 scope — if their authenticated API gives us bulk export capability, Phase 6 upgrades from "optional bonus" to "first-class source."
