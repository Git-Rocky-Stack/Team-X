# Team-X Phase 4 — Ship-readiness

**Status:** In Progress
**Date:** 2026-04-13
**Author:** Rocky Elsalaymeh (vision) + Claude (plan)
**Predecessor:** Phase 3 — The Live Cockpit (M14-M20, complete)

---

## Overview

Phase 4 takes Team-X from a fully-featured internal tool to a shippable, installable, documented open-source product. The deliverables:

1. **File vault** with filesystem-backed blob storage, SHA256 integrity, FTS5 search, and ticket attachment
2. **Backup/restore** with one-click export, import, and scheduled backups
3. **Audit log UI** surfacing the append-only events table with filters and export
4. **Cross-platform installers** via electron-builder (Windows NSIS, macOS DMG, Linux AppImage)
5. **Documentation** (README, LICENSE, CONTRIBUTING, user guide)
6. **Public release** on GitHub with signed role-pack verification

**Demo:** *"Public GitHub release, full documentation, installable on Win/Mac/Linux."*

**Starting point:** 530 unit tests + 3 E2E specs, 6 DB migrations, 983-line IPC type file, 47 test files, 20 milestones complete.

---

## Milestones

### M21 — File Vault

**Goal:** Filesystem-backed blob storage with SHA256 integrity, FTS5 full-text search on extracted content, and a vault browser UI.

**Database:**
- Migration `0006_file_vault.sql`:
  - `file_vault` table: `id`, `company_id`, `filename`, `original_name`, `mime_type`, `size_bytes`, `sha256`, `vault_path`, `extracted_text`, `tags_json`, `uploaded_by`, `created_at`, `updated_at`
  - FTS5 virtual table `file_vault_fts` on `(original_name, extracted_text, tags_json)` with content sync

**Service layer (`services/vault.ts`):**
- `VaultService` class:
  - `store(companyId, filePath, metadata)` — copy to `<userData>/companies/<slug>/vault/<sha256-prefix>/<filename>`, compute SHA256, extract text (markdown/txt/code), insert row + FTS
  - `retrieve(fileId)` — return file path + metadata, verify SHA256 on read
  - `verify(fileId)` — check SHA256 integrity, return pass/fail
  - `remove(fileId)` — delete from filesystem + DB
  - `search(companyId, query)` — FTS5 `MATCH` query
  - `list(companyId, opts)` — paginated listing with mime filter

**IPC channels (6):**
- `vault.upload` — receive file via dialog or path, store via VaultService
- `vault.download` — return file path for renderer to open
- `vault.list` — paginated file listing
- `vault.search` — FTS5 search
- `vault.delete` — remove file
- `vault.verify` — integrity check

**Renderer:**
- `VaultView` component under Files tab (enable the disabled placeholder)
- File browser grid/list with thumbnails for images, icons for other types
- Upload button (opens native file dialog via Electron `dialog.showOpenDialog`)
- Search bar with FTS5 results
- File detail panel (metadata, SHA256, preview for text/images)
- Context menu: download, attach to ticket, verify integrity, delete

**Tests:** VaultService CRUD + integrity verification, FTS5 search, IPC handlers

---

### M22 — Ticket Attachments + Agent File Sharing

**Goal:** Bridge the vault to the ticket system and agent runtime so files are first-class in workflows.

**Database:**
- Migration `0007_ticket_attachments.sql`:
  - `ticket_attachments` table: `id`, `ticket_id`, `file_id`, `attached_by`, `attached_at`
  - Index on `ticket_id` for fast lookups

**Service extensions:**
- `TicketService.attachFile(ticketId, fileId, attachedBy)` / `detachFile` / `listAttachments`
- `AgentFileSharing`: built-in tool `read_vault_file` that agents can call to access file content

**IPC channels (3):**
- `tickets.attachFile` — link vault file to ticket
- `tickets.detachFile` — unlink
- `tickets.listAttachments` — get attachments for a ticket

**Renderer:**
- Attachments section in `TicketDetailPanel` — file chips with preview-on-click
- Drag-and-drop zone in ticket detail for quick attach (auto-uploads to vault first)
- "Attach File" button in ticket create dialog
- File reference rendering in chat messages (when agents reference vault files)

**Tests:** Attachment CRUD, agent tool integration, drag-and-drop flow

---

### M23 — Backup/Restore

**Goal:** One-click full backup (SQLite + vault files) to a portable archive, one-click restore, and scheduled auto-backups.

**Service layer (`services/backup.ts`):**
- `BackupService` class:
  - `createBackup(destination?)` — dump SQLite WAL checkpoint + copy DB + vault directories into a `.teamx-backup` zip archive with manifest.json (version, timestamp, company count, file count, total size)
  - `restoreBackup(archivePath)` — validate manifest, stop orchestrator, replace DB + vault, restart, reseed if needed
  - `listBackups()` — scan backup directory for existing archives
  - `scheduleBackup(intervalHours, destination)` — register a recurring backup via node-cron or setInterval
  - `cancelSchedule()` — stop scheduled backups
  - Integrity check: SHA256 manifest of all vault files included in backup, verified on restore

**IPC channels (5):**
- `backup.create` — trigger manual backup, return archive path
- `backup.restore` — restore from archive path (destructive, requires UI confirmation prompt)
- `backup.list` — list existing backup archives
- `backup.schedule` — configure scheduled backups (interval + destination)
- `backup.cancelSchedule` — stop scheduled backups

**Renderer:**
- Backup & Restore section in `SettingsView`
- "Create Backup" button with destination picker (native save dialog)
- Backup history list with timestamps, sizes, company counts
- "Restore" button with file picker + confirmation dialog (destructive action warning)
- Schedule configuration: interval dropdown (hourly/daily/weekly), destination path
- Progress indicator during backup/restore operations

**Tests:** Backup round-trip (create + restore + verify data integrity), scheduled backup registration, manifest validation

---

### M24 — Audit Log UI

**Goal:** Surface the existing append-only `events` table as a searchable, filterable audit log with export capability.

**Repository (`db/repos/audit.ts`):**
- `AuditRepo` class:
  - `list(companyId, filters)` — paginated query with filters: event_type[], actor_id, date_from, date_to, keyword search
  - `export(companyId, filters, format)` — generate CSV or JSON export of filtered events
  - `getStats(companyId)` — aggregate counts by event type for the summary cards

**IPC channels (3):**
- `audit.list` — paginated, filtered event list
- `audit.export` — generate export file, return path
- `audit.stats` — summary statistics

**Renderer:**
- `AuditView` component (new view, or subtab under Settings/Telemetry)
- Summary cards: total events, events today, top event types
- Filterable timeline: event type chips, actor dropdown, date range picker
- Event rows: timestamp, actor (employee name/Rocky), event type badge, detail summary
- Expandable detail panel per event: full payload JSON, related entities (ticket, employee, meeting)
- Export buttons: CSV, JSON
- Real-time updates via event bus subscription

**Tests:** AuditRepo queries with filters, export format validation, IPC handlers

---

### M25 — Cross-Platform Installers

**Goal:** Produce installable packages for Windows (NSIS), macOS (DMG), and Linux (AppImage/deb) via electron-builder, with a user-triggered auto-updater.

**Configuration:**
- `electron-builder.yml` (or `build` key in `apps/desktop/package.json`):
  - Windows: NSIS installer, custom icon, Start Menu shortcut
  - macOS: DMG with drag-to-Applications, custom background, universal binary (x64 + arm64)
  - Linux: AppImage + .deb, desktop entry, icon
  - `extraResources`: role-packs directory, default .env template
  - `files`: exclude dev-only files, test fixtures
  - `asar`: true (with `asarUnpack` for native modules: better-sqlite3, keytar)

**Auto-updater:**
- `electron-updater` integration in main process
- Check for updates on user request only (Settings > Check for Updates button) — never auto-check per design doc's zero-phone-home policy
- Update from GitHub Releases (public, no signing server needed)
- Download + install flow with progress in renderer

**Commands:**
- `pnpm dist` — build all platforms (or `pnpm dist:win`, `dist:mac`, `dist:linux`)
- `pnpm dist:publish` — build + upload to GitHub Release draft

**CI workflow (`.github/workflows/release.yml`):**
- Triggered on git tag `v*`
- Matrix: windows-latest, macos-latest, ubuntu-latest
- Build → sign (placeholder) → upload to GitHub Release
- Checksum generation (SHA256 per artifact)

**IPC channels (2):**
- `updater.check` — check for updates from GitHub Releases
- `updater.install` — download and install update

**Renderer:**
- "Check for Updates" button in Settings
- Update available notification with version + changelog
- Download progress bar + "Install & Restart" button

**Tests:** electron-builder config validation (dry run), updater IPC handlers

---

### M26 — Documentation + Landing Site

**Goal:** Complete documentation suite and a static landing site for the public GitHub release.

**Documentation files:**
- `README.md` — hero section, feature list with screenshots, quickstart, architecture overview, tech stack table, contributing link, license badge
- `LICENSE` — MIT license text
- `CONTRIBUTING.md` — development setup, PR guidelines, coding standards, role-pack contribution guide
- `docs/user-guide/` — getting started, hiring employees, managing projects, using the vault, configuring providers, backup & restore, keyboard shortcuts
- `CHANGELOG.md` — all milestones M1-M27 summarized

**Landing site (`docs/site/`):**
- Static site (simple HTML + Tailwind via CDN, or single React page)
- Hero: tagline + screenshot + download buttons (Win/Mac/Linux)
- Features grid with icons
- Architecture diagram (from design doc)
- "Get Started" quickstart
- Footer: GitHub link, MIT license, Rocky/Strategia credit
- Deployable to GitHub Pages or Cloudflare Pages

**Tests:** Link validation, README rendering check

---

### M27 — Final Hardening + Public Release

**Goal:** Security pass, final E2E coverage, role-pack signature verification, and the v1.0.0 GitHub Release.

**Hardening:**
- E2E spec: `vault-backup.spec.ts` — upload file to vault, attach to ticket, create backup, verify restore
- Security audit: CSP headers, IPC input validation sweep, dependency audit (`pnpm audit`)
- Role-pack signature verification: basic Ed25519 sign/verify for community pack `.tar.gz` archives
- Model registry: signed JSON manifest for model list updates (user-triggered only)
- Performance pass: startup time benchmark, memory usage baseline

**Release:**
- Phase badge update: "Phase 4" in top bar
- Version bump to `1.0.0` across all `package.json` files
- Git tag `v1.0.0`
- GitHub Release with:
  - Windows installer (.exe)
  - macOS DMG (.dmg)
  - Linux AppImage (.AppImage) + .deb
  - SHA256 checksums
  - Release notes (full changelog)
- CLAUDE.md finalized with Phase 4 completion status

**Tests:** All existing 530+ unit tests + 4 E2E specs (smoke, ticket-flow, meeting-flow, vault-backup) passing. Typecheck + lint clean.

---

## Task Dependency Graph

```
M21 (File Vault)
 |
 v
M22 (Ticket Attachments + Agent Sharing) ──> M27 (Final Hardening)
 |                                              ^
 v                                              |
M23 (Backup/Restore) ────────────────────────> M27
 |
M24 (Audit Log UI) ──────────────────────────> M27
 |
M25 (Installers) ────────────────────────────> M27
 |
M26 (Docs + Landing Site) ───────────────────> M27
```

M21 must land first (M22 depends on it). M23-M26 can proceed in parallel after M22. M27 is the final convergence point.

---

## Quality Gates

Each milestone must pass before advancing:
1. All unit tests pass (`pnpm test`)
2. Typecheck clean (`pnpm typecheck`)
3. Lint clean (`pnpm lint`)
4. No new `any` types introduced
5. IPC types updated in `shared-types`
6. CLAUDE.md updated with milestone completion

## Estimated Test Growth

| Milestone | New Tests (est.) | Cumulative |
|-----------|-----------------|------------|
| M21 | ~30 | ~560 |
| M22 | ~20 | ~580 |
| M23 | ~25 | ~605 |
| M24 | ~15 | ~620 |
| M25 | ~10 | ~630 |
| M26 | ~5 | ~635 |
| M27 | ~15 | ~650 |
