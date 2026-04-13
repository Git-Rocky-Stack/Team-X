# Loki Continuity — Phase 4, M21-M26 COMPLETE

## Current State
- **M21 (File Vault) COMPLETE.** 31 tests. Committed: bdd1370.
- **M22 (Ticket Attachments) COMPLETE.** 8 tests. Committed: b4afcd2.
- **M23 (Backup/Restore) COMPLETE.** 5 tests. Committed: 3ebc131.
- **M24 (Audit Log UI) COMPLETE.** 16 tests. Committed: 78a6695.
- **M25 (Cross-Platform Installers) COMPLETE.** 12 tests. Committed: 68ab0a6.
- **M26 (Documentation + Landing Site) COMPLETE.** Pending commit.
- 602 unit tests + 3 E2E specs passing. Typecheck + lint clean.
- **Next: M27 (Final Hardening + v1.0.0 Public Release).**

## Phase 4 Progress
1. [x] **M21** — File vault (DB + VaultService + 7 IPC + VaultView + Files tab)
2. [x] **M22** — Ticket attachments (ticket_attachments table + 3 IPC + detail UI)
3. [x] **M23** — Backup/restore (BackupService + 3 IPC + Settings UI)
4. [x] **M24** — Audit log UI (AuditRepo + 3 IPC + AuditView + Audit tab)
5. [x] **M25** — Cross-platform installers (electron-builder + updater + CI)
6. [x] **M26** — README + LICENSE + CONTRIBUTING + CHANGELOG + user guide (7 docs) + landing site
7. [ ] **M27** — Final hardening + v1.0.0 public release

## M26 Implementation Summary
- **README.md**: Hero section, feature grid (The Org, Live Cockpit, AI Runtime, Ship-Ready), architecture overview with directory tree, tech stack table, dev commands, testing section, privacy section, badges.
- **CONTRIBUTING.md**: Dev setup (prerequisites, env vars), project structure walkthrough, development workflow (branching, commits, commands), coding standards (TypeScript strict, architecture rules, file org, naming), PR guidelines with template, testing guide (Vitest + Playwright + test-mode provider), role-pack contribution guide (file structure, frontmatter schema, hierarchy levels, writing guide), IPC channel conventions, troubleshooting.
- **CHANGELOG.md**: Full Keep a Changelog format covering all 25 milestones (M1-M25) across 4 phases with dates, added features, and key stats per milestone.
- **docs/user-guide/README.md**: Table of contents index linking 7 guides.
- **docs/user-guide/getting-started.md**: Installation (download + source), first boot, local LLM setup, first conversation, interface overview (tabs, sidenav, dashboard subviews).
- **docs/user-guide/hiring-employees.md**: Role catalog (55 roles, 6 levels with counts), hiring flow, org chart (reading, rearranging), managing (promote, set manager, fire), best practices.
- **docs/user-guide/managing-projects.md**: Goals (create, track, detail), projects (create, kanban, linking tickets), tickets (create, kanban, auto-assign, detail, comments), workflow example.
- **docs/user-guide/using-the-vault.md**: Upload, browse, search (FTS5), detail panel, integrity verification, ticket attachments, storage location per platform.
- **docs/user-guide/configuring-providers.md**: 10 providers table, adding/testing/toggling/removing, privacy tiers (3 levels), runtime strategy (4 modes), concurrency caps with defaults.
- **docs/user-guide/backup-and-restore.md**: Creating backups (what's included), restoring (destructive warning), backup history, storage locations, best practices.
- **docs/user-guide/keyboard-shortcuts.md**: Global nav, dashboard, chat, tickets, meetings, general, accessibility.
- **docs/site/index.html**: Static landing page with Tailwind CDN — dark theme, gradient hero, 9-feature grid, architecture diagram, tech stack badges, 3-step quickstart, CTA, footer. Responsive, accessible, Inter + JetBrains Mono typography.

## Key patterns established in M21-M26
- **FTS5 best-effort init:** `fts5-init.ts` runs after migrations; sql-js tests use LIKE fallback.
- **shared-types build:** Run `tsc --build` on shared-types before desktop typecheck when adding new exports.
- **IPC wiring chain:** shared-types types -> handlers interface + impl -> register channels -> preload bridge -> renderer hooks.
- **Service factory pattern:** deps injection, closure state, async init/shutdown.
- **Read-only repo pattern (M24):** audit repo reads events table without writing.
- **Noop service pattern (M25):** dev/test returns safe defaults, production lazy-imports heavy deps.
- **Documentation structure (M26):** README as flagship, CONTRIBUTING for devs, CHANGELOG for history, user-guide/ for end users, site/ for marketing.

## Mistakes & Learnings
- FTS5 not in sql-js — move virtual table creation to runtime init
- Always rebuild shared-types declarations before typecheck
- Biome: `\x00-\x1f` needs biome-ignore for intentional control char strip
- Unused imports from copy-paste: always check after writing service files
- TypeScript doesn't narrow array indexing — extract element before accessing properties
- Handler file is "pure" (no Electron imports) but CAN use node built-ins (fs, path, os)
- electron-updater must be lazy-imported in production path to avoid loading in dev/test
- Biome enforces useSingleVarDeclarator — use separate let/const per variable
