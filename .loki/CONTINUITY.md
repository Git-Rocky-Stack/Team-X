# Loki Continuity — Phase 4, M21-M25 COMPLETE

## Current State
- **M21 (File Vault) COMPLETE.** 31 tests. Committed: bdd1370.
- **M22 (Ticket Attachments) COMPLETE.** 8 tests. Committed: b4afcd2.
- **M23 (Backup/Restore) COMPLETE.** 5 tests. Committed: 3ebc131.
- **M24 (Audit Log UI) COMPLETE.** 16 tests. Committed: 78a6695.
- **M25 (Cross-Platform Installers) COMPLETE.** 12 tests. Pending commit.
- 602 unit tests + 3 E2E specs passing. Typecheck + lint clean.
- **Next: M26 (README + LICENSE + docs + landing site).**

## Phase 4 Progress
1. [x] **M21** — File vault (DB + VaultService + 7 IPC + VaultView + Files tab)
2. [x] **M22** — Ticket attachments (ticket_attachments table + 3 IPC + detail UI)
3. [x] **M23** — Backup/restore (BackupService + 3 IPC + Settings UI)
4. [x] **M24** — Audit log UI (AuditRepo + 3 IPC + AuditView + Audit tab)
5. [x] **M25** — Cross-platform installers (electron-builder + updater + CI)
6. [ ] **M26** — README + LICENSE + docs + landing site
7. [ ] **M27** — Final hardening + v1.0.0 public release

## M25 Implementation Summary
- **electron-builder.yml**: NSIS (Windows x64+arm64), DMG (macOS x64+arm64), AppImage+deb (Linux x64). Native modules (better-sqlite3, keytar) in asarUnpack. Role packs as extraResources. Publish to GitHub Releases draft.
- **Build icons**: `scripts/generate-icons.mjs` generates 256+512px PNG placeholders with Team-X "T" logo. macOS entitlements plist for keychain access.
- **Dist scripts**: `pnpm dist`, `dist:win`, `dist:mac`, `dist:linux`, `dist:publish` in desktop + root package.json.
- **UpdaterService** (`services/updater.ts`): User-triggered only (zero phone-home, invariant #7). Noop in dev/test. Production: lazy-import electron-updater, check GitHub Releases, download + quitAndInstall.
- **IPC**: 2 channels (`updater.check`, `updater.install`) — full handler->register->preload->hooks chain.
- **UpdaterSection** in Settings: Check for Updates button, version info, release notes, download progress, Install & Restart.
- **Release CI** (`.github/workflows/release.yml`): Triggered on v* tags, matrix (win/mac/linux), SHA256 checksums, draft GitHub Release.
- **12 tests**: 7 updater service (dev/test noop, interface shape) + 5 handler (delegate, error, available, not-available, install).

## Key patterns established in M21-M25
- **FTS5 best-effort init:** `fts5-init.ts` runs after migrations; sql-js tests use LIKE fallback.
- **shared-types build:** Run `tsc --build` on shared-types before desktop typecheck when adding new exports.
- **IPC wiring chain:** shared-types types -> handlers interface + impl -> register channels -> preload bridge -> renderer hooks.
- **Service factory pattern:** deps injection, closure state, async init/shutdown.
- **Read-only repo pattern (M24):** audit repo reads events table without writing.
- **Noop service pattern (M25):** dev/test returns safe defaults, production lazy-imports heavy deps.

## Mistakes & Learnings
- FTS5 not in sql-js — move virtual table creation to runtime init
- Always rebuild shared-types declarations before typecheck
- Biome: `\x00-\x1f` needs biome-ignore for intentional control char strip
- Unused imports from copy-paste: always check after writing service files
- TypeScript doesn't narrow array indexing — extract element before accessing properties
- Handler file is "pure" (no Electron imports) but CAN use node built-ins (fs, path, os)
- electron-updater must be lazy-imported in production path to avoid loading in dev/test
- Biome enforces useSingleVarDeclarator — use separate let/const per variable
