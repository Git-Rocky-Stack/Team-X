# Loki Continuity — Phase 4, M21-M24 COMPLETE

## Current State
- **M21 (File Vault) COMPLETE.** 31 tests. Committed: bdd1370.
- **M22 (Ticket Attachments) COMPLETE.** 8 tests. Committed: b4afcd2.
- **M23 (Backup/Restore) COMPLETE.** 5 tests. Committed: 3ebc131.
- **M24 (Audit Log UI) COMPLETE.** 16 tests. Pending commit.
- 590 unit tests + 3 E2E specs passing. Typecheck + lint clean.
- **Next: M25 (Cross-platform installers).**

## Phase 4 Progress
1. [x] **M21** — File vault (DB + VaultService + 7 IPC + VaultView + Files tab)
2. [x] **M22** — Ticket attachments (ticket_attachments table + 3 IPC + detail UI)
3. [x] **M23** — Backup/restore (BackupService + 3 IPC + Settings UI)
4. [x] **M24** — Audit log UI (AuditRepo + 3 IPC + AuditView + Audit tab)
5. [ ] **M25** — Cross-platform installers (electron-builder)
6. [ ] **M26** — README + LICENSE + docs + landing site
7. [ ] **M27** — Final hardening + v1.0.0 public release

## M24 Implementation Summary
- **AuditRepo** (`db/repos/audit.ts`): read-only queries on append-only events table — `list()` (filtered, paginated), `stats()` (aggregates), `exportJson()`/`exportCsv()`, `distinctEventTypes()`.
- **IPC**: 3 channels (`audit.list`, `audit.stats`, `audit.export`) — full handler→register→preload chain.
- **AuditView** (`features/audit/audit-view.tsx`): summary cards (total/today/top type), event type filter chips, actor search, date range picker, expandable event rows with payload JSON viewer, CSV/JSON export buttons, pagination.
- **Audit tab** enabled in top-bar between Telemetry and Settings.
- **16 tests**: list filtering (company, types, actor, date range, pagination), stats (total, today, top types, empty), export (JSON validity, CSV structure, quote escaping), distinct types.

## Key patterns established in M21-M24
- **FTS5 best-effort init:** `fts5-init.ts` runs after migrations; sql-js tests use LIKE fallback.
- **shared-types build:** Run `tsc --build` on shared-types before desktop typecheck when adding new exports.
- **IPC wiring chain:** shared-types types → handlers interface + impl → register channels → preload bridge → renderer hooks.
- **Service factory pattern:** deps injection, closure state, async init/shutdown.
- **Read-only repo pattern (M24):** audit repo reads events table without writing — orchestrator remains sole writer (invariant #6).

## Mistakes & Learnings
- FTS5 not in sql-js — move virtual table creation to runtime init
- Always rebuild shared-types declarations before typecheck
- Biome: `\x00-\x1f` needs biome-ignore for intentional control char strip
- Unused imports from copy-paste: always check after writing service files
- TypeScript doesn't narrow array indexing — extract element before accessing properties
- Handler file is "pure" (no Electron imports) but CAN use node built-ins (fs, path, os)
