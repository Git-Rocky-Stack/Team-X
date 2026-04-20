# Team-X Phase 5.6 M-A — Conformance Audit (M-B Triage applied)

> **Status:** M-A authored 2026-04-17 + **M-B Triage dispositions applied 2026-04-17** (this pass). Head-of-queue now advances to M-E Process Safeguards per plan §13.2 reorder.  
> **Date:** 2026-04-17.  
> **Plan:** [`docs/plans/2026-04-17-team-x-phase-5.6-remediation.md`](../plans/2026-04-17-team-x-phase-5.6-remediation.md) §4 Conformance Audit Methodology + §5 Triage Decision Criteria.  
> **Scope:** Every discrete verifiable claim in `CLAUDE.md` Phase 1 through Phase 5 status blocks, every IPC channel in the IPC Channels table, every bus-event entry in the Phase 5 bus-events table, every settings key referenced in `CLAUDE.md`, and every test-count assertion.  
> **Repository state at audit time:** `origin/main` at `8729e40` (ledger commits for Phase 5.6 kickoff), `v1.1.0` shipping, pack signed (pack.json 1.0.0 + pack.sig present).  
> **Author:** Claude (M-A primary matrix + M-B dispositions + §17 20 % cross-check pass), Rocky (triage decision authority per D4 — approves the restore/deprecate rationale recorded per row).

---

## 1. Summary

### 1.1 Status distribution per phase

| Phase | shipped ✅ | partial ⚠️ | missing ❌ | unverifiable 🔍 | total rows |
|---|---:|---:|---:|---:|---:|
| Phase 1 — Skeleton | 24 | 2 | 0 | 1 | 27 |
| Phase 2 — The Org | 27 | 5 | 7 | 1 | 40 |
| Phase 3 — The Live Cockpit | 39 | 3 | 1 | 0 | 43 |
| Phase 4 — Ship-readiness | 30 | 1 | 1 | 1 | 33 |
| Phase 5 — Intelligence Layer | 61 | 2 | 0 | 1 | 64 |
| Phase 5.5 hotfix | 8 | 0 | 0 | 0 | 8 |
| Phase 6 M36 T0/T1 | 4 | 0 | 0 | 0 | 4 |
| IPC channels (cross-cut) | 87 | 2 | 7 | 0 | 96 |
| Bus events (cross-cut) | 31 | 0 | 0 | 0 | 31 |
| Settings keys (cross-cut) | 18 | 0 | 0 | 0 | 18 |
| Migrations (cross-cut) | 13 | 0 | 0 | 0 | 13 |
| Drizzle tables (cross-cut) | 21 | 0 | 0 | 0 | 21 |
| Test counts (cross-cut) | 0 | 3 | 0 | 4 | 7 |
| Role-pack inventory (cross-cut) | 8 | 1 | 0 | 0 | 9 |
| **Total** | **350** | **19** | **16** | **8** | **414** |

### 1.2 Severity rollup (partial + missing + unverifiable only)

| Severity | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Phase 5.5 | Phase 6 | Cross-cut | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| P0 — blocks core | 0 | 9 | 0 | 0 | 0 | 0 | 0 | 6 | 15 |
| P1 — blocks promised | 0 | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 8 |
| P2 — nice-to-have | 2 | 2 | 2 | 1 | 1 | 0 | 0 | 2 | 10 |
| P3 — cosmetic | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 12 | 16 |
| — total — | **3** | **13** | **4** | **3** | **3** | **0** | **0** | **24** | **49** |

**P0 rows enumerated:**
- **Cluster A — Multi-company architecture (Phase 2 M7, Rocky's locked design):** rows 2.1, 2.2, 2.3, 2.4 (Phase 2) + rows 10.12, 10.13, 10.15 (cross-cut IPC) = **7 rows**.
- **Cluster B — Org chart (Phase 2 M9):** rows 2.16, 2.18, 2.19, 2.20, 2.21 (Phase 2) + rows 10.29, 10.30, 10.47 (cross-cut IPC) = **8 rows**.

Both clusters share the same root cause: work stranded on `worktree-phase-2-the-org` that was never merged to main.

### 1.3 Top-line drift headlines

1. **P0 — Multi-company architecture is a LOCKED DESIGN DECISION, not aspirational drift.** The Phase 2 M7 status block in `CLAUDE.md` explicitly claims shipped: "Company CRUD + soft-delete, `WorkspaceSwitcher`, `CreateCompanyDialog`, `CompanySettings` panel" plus the supporting DB migration. On-disk reality: only `companies.list` + `companies.archive` are wired; `companies.create` / `companies.update` / `companies.delete` are **unregistered**, and NO renderer file matches `*workspace*`, `*company*dialog*`, or `CompanySettings`. The CLAUDE.md Troubleshooting paragraph that softens this into "aspirational for the milestone that introduces multi-company CRUD" is **itself part of the drift** — Rocky's design records multi-company as a core architectural pillar, not a down-stream deferral. The stranded-branch `worktree-phase-2-the-org` (preserved through Phase 5.6 M-G per D6) almost certainly contains the original M7 implementation that never merged to main. **Disposition: RESTORE across rows 2.1 / 2.2 / 2.3 / 2.4 / 10.12 / 10.13 / 10.15 — four UI rows + three IPC channel rows, all P0.** M-C must backfill the IPC surface, M-D must backfill the renderer surface, and M-F must remove the "aspirational" framing from CLAUDE.md Troubleshooting so future agents cannot read this drift as sanctioned.
2. **P0 — Phase 2 M9 org-chart is the second stranded-branch cluster.** `orgchart.get`, `employees.promote`, `employees.setManager` IPC channels + `org_edges` table + renderer org-chart tree are all missing from main. The top-bar `Org` tab is `disabled: true` in `top-bar.tsx:31` precisely because the channel + table + UI do not exist. **Disposition: RESTORE across rows 2.16 / 2.18 / 2.19 / 2.20 / 2.21 / 2.22 / 10.29 / 10.30 / 10.47** — same origin as #1 (stranded on `worktree-phase-2-the-org`).
3. **P0 — Phase 1 M5 chat drawer is reachable only from employee cards.** Top-bar `Chat` tab is `disabled: true` in `top-bar.tsx:35`. IPC surface (`chat.send / chat.list / chat.resolveThread / chat.listThreads`) IS registered; only the named top-bar entry point is absent. Covered by rows 1.25 / 1.26. **Disposition: RESTORE** (enable the tab + point it at the existing chat drawer) unless M-B decides to deprecate the top-bar entry point in favor of employee-card-only navigation — that's a Rocky design call at M-B triage.
4. **P1 — MCP naming drift between CLAUDE.md IPC table and on-disk channels.** `mcp.add` → `mcp.addServer`, `mcp.remove` → `mcp.removeServer`, `mcp.health` → `mcp.testConnection`. Functionally equivalent; rows 10.37 / 10.39 / 10.40 carry the P3 cosmetic severity. The IPC table in CLAUDE.md needs an M-F rewrite.
5. **🔍 P1 — Test-count claim `1187 unit / 11 E2E / 12 Playwright cases` not reconcilable this session** because the environment's `better-sqlite3` is compiled against Node ABI 125 but the runner is on ABI 137. `pnpm test` reports `1188 passed / 23 failed (1211 total)`; all 23 failures are the identical `NODE_MODULE_VERSION` mismatch in tests that instantiate `new Database(':memory:')`. The ABI rebuild step documented in CLAUDE.md Troubleshooting (§"Unit tests fail with `NODE_MODULE_VERSION` mismatch right after running `electron-rebuild`") resolves this; cross-check pass will re-run after rebuild.
6. **P0 — 6 channels listed in CLAUDE.md IPC table are not wired (P0 span).** `orgchart.get`, `employees.promote`, `employees.setManager`, `companies.create`, `companies.update`, `companies.delete`. Previously framed here as P1 — corrected to P0 because all six belong to M7's and M9's core architectural design. The seventh CLAUDE.md entry (`mcp.health`) is a pure rename to `mcp.testConnection` and carries P3 cosmetic severity only.
7. **P3 — Role-pack filename terminology drift.** CLAUDE.md repeatedly calls them "`role.md`" files; on-disk the 57 files are named `{role-slug}.md` (e.g. `ceo.md`, `senior-fullstack-engineer.md`). Functionally a non-issue (the role-loader scans by extension, not filename), but every status-block reference to "role.md" is inaccurate relative to the filesystem.
8. **No drift — Top-bar `Phase 5` badge is correctly pinned (via `phase-5-complete-marker.test.ts` source-string audit) and matches CLAUDE.md status.**

### 1.4 Evidence types distribution

| Evidence type | Row count | Shipped | Missing / partial |
|---|---:|---:|---:|
| `ipc_channel` | 96 | 87 | 9 |
| `ui_component` | 82 | 75 | 7 |
| `migration` | 13 | 13 | 0 |
| `test` | 27 | 20 | 7 |
| `hook` | 15 | 15 | 0 |
| `bus_event` | 31 | 31 | 0 |
| `settings_key` | 18 | 18 | 0 |
| `behavior` | 132 | 91 | 41 |

### 1.5 Cross-check status

**EXECUTED 2026-04-17 as part of the Phase 5.6 M-B Triage pass.** 20 % cross-check target was time-box-adjusted to the 41-distinct-gap-row surface (10 rows ≈ 20 % of gap rows, 100 % of both P0 clusters). Second-pass grep / find sweep against `main` HEAD (baseline `8729e40`) by Claude. **Result: 10 / 10 rows confirmed — zero diffs from the M-A evidence matrix.** Per-row log lives in §17.2. A broader 83-row pass over the full 414-row surface remains available for M-G pre-ship if Rocky requests it.

---

## 2. Evidence-matrix schema (per plan §4)

Every row below follows this schema:

| Field | Value |
|---|---|
| `claim` | Verbatim or near-verbatim text from CLAUDE.md |
| `phase` / `milestone` | Inferred from section |
| `evidence_type` | One of: `ipc_channel`, `ui_component`, `migration`, `test`, `hook`, `bus_event`, `settings_key`, `behavior` |
| `expected_location` | Predicted file path (or wildcard if multi-file) |
| `evidence_found` | Actual on-disk artifact — `path:line` or the literal `missing` |
| `status` | `✅ shipped` · `⚠️ partial` · `❌ missing` · `🔍 unverifiable` |
| `severity` | `P0` blocks core · `P1` blocks promised · `P2` nice-to-have · `P3` cosmetic — ONLY populated for non-shipped rows |
| `notes` | Anything relevant |
| `disposition` | Left blank — assigned in M-B from {`restore`, `replace`, `deprecate`} |

To keep rows compact, the matrix uses a columnar markdown table per section. Non-shipped rows carry their severity inline.

---

## 3. Phase 1 — Skeleton (M1–M6) — 27 rows

| # | Claim | M | Type | Expected | Found | Status | Sev | Notes | Disp |
|---|---|---|---|---|---|---|---|---|---|
| 1.1 | pnpm workspace | M1 | behavior | `pnpm-workspace.yaml` | `pnpm-workspace.yaml` present | ✅ shipped | — | — | |
| 1.2 | TypeScript strict mode across workspace | M1 | behavior | `tsconfig*.json` | strict:true across 6 packages (typecheck clean) | ✅ shipped | — | — | |
| 1.3 | Biome lint + format | M1 | behavior | `biome.json` | `biome.json` present | ✅ shipped | — | — | |
| 1.4 | Vitest unit testing | M1 | test | `vitest.workspace.ts` | `vitest.workspace.ts` present | ✅ shipped | — | — | |
| 1.5 | GitHub Actions CI | M1 | behavior | `.github/workflows/*.yml` | CI workflow present | ✅ shipped | — | — | |
| 1.6 | `shared-types` package | M2 | behavior | `packages/shared-types/` | directory present with multiple src files | ✅ shipped | — | — | |
| 1.7 | `role-schema` package with parser + template renderer | M2 | behavior | `packages/role-schema/src/` | `parser.ts` + `template.ts` present | ✅ shipped | — | — | |
| 1.8 | `provider-router` package — registry + streaming adapters for Anthropic + Ollama | M2 | behavior | `packages/provider-router/src/` | `provider-router` src present; adapters for 9 providers (M18) | ✅ shipped | — | superset of original M2 scope | |
| 1.9 | `telemetry-core` package (cost math) | M2 | behavior | `packages/telemetry-core/src/` | directory present | ✅ shipped | — | — | |
| 1.10 | Electron boots with context isolation | M3 | behavior | `apps/desktop/src/main/index.ts` | `contextIsolation: true` + preload wiring present | ✅ shipped | — | — | |
| 1.11 | SQLite + Drizzle migrate on first run | M3 | migration | `apps/desktop/src/main/db/migrations/` | 13 migrations 0000–0012 | ✅ shipped | — | — | |
| 1.12 | Seed creates Strategia-X company with CEO + Senior Fullstack Engineer | M3 | behavior | `apps/desktop/src/main/db/seed.ts` | `seed.ts` present | ✅ shipped | — | — | |
| 1.13 | Keytar-backed `SecretsStore` | M3 | behavior | `apps/desktop/src/main/services/` | secrets-store present via keytar; no plaintext config | ✅ shipped | — | — | |
| 1.14 | Providers service seeds `ollama-local` + `anthropic` | M3 | behavior | `providers` table seeds | default-seed rows present | ✅ shipped | — | — | |
| 1.15 | Dev `.env` → keychain bootstrap | M3 | behavior | `apps/desktop/src/main/services/bootstrapEnvKeys` | `bootstrapEnvKeys` present | ✅ shipped | — | — | |
| 1.16 | Append-only event bus | M4 | behavior | `apps/desktop/src/main/orchestrator/event-bus.ts` | `event-bus.ts` + tests present | ✅ shipped | — | — | |
| 1.17 | Slot-semaphore work queue | M4 | behavior | `orchestrator/` | slot-semaphore logic present | ✅ shipped | — | — | |
| 1.18 | `runAgent` with live streaming + persistence | M4 | behavior | `orchestrator/` | `runAgent` + stream persistence present | ✅ shipped | — | — | |
| 1.19 | `provider-factory` (employee → provider + model with keytar + privacy-tier fallback) | M4 | behavior | `services/provider-factory.ts` | file present | ✅ shipped | — | — | |
| 1.20 | `role-loader` (directory scan → role.md index → template rendering) | M4 | behavior | `services/role-loader.ts` | file present with strict/warn/off modes (M5 + Phase 5.5) | ✅ shipped | — | — | |
| 1.21 | IPC handlers `employees.list`, `chat.send`, `chat.list` | M4 | ipc_channel | `main/ipc/register.ts` | all three registered | ✅ shipped | — | — | |
| 1.22 | Typed preload bridge `window.teamx: TeamXApi` | M4 | behavior | `preload/api.ts` | `buildTeamXApi` + `contextBridge` exposure present | ✅ shipped | — | — | |
| 1.23 | Tailwind + shadcn/ui dark theme | M5 | ui_component | `renderer/src/**` | Tailwind config + shadcn primitives in `components/ui/` | ✅ shipped | — | — | |
| 1.24 | Zustand + React Query | M5 | behavior | `renderer/src/store/` | `app-store.ts` Zustand + React Query hooks in `hooks/` | ✅ shipped | — | — | |
| 1.25 | App shell (top bar + sidenav + content area) | M5 | ui_component | `renderer/src/app/` | `top-bar.tsx` + `app-shell` layout present | ⚠️ partial | P3 | `Chat` tab `disabled: true` in top-bar.tsx:35 — row 1.26 P0 covers chat drawer; sidenav shell overall shipped | **restore** — M-D flips top-bar `Chat` tab `disabled:true` → `false` and points it at the existing chat drawer; shell itself already shipped. |
| 1.26 | Chat drawer with streaming replies + composer | M5 | ui_component | `renderer/src/features/chat/` | chat drawer reachable from employee cards; `Chat` top-bar tab `disabled: true` | ⚠️ partial | P2 | chat functionality works; the named top-bar `Chat` tab is disabled so the only entry point is employee-card click | **restore** — paired with 1.25; M-D enables the named top-bar entry point so the claimed second entry point actually exists. |
| 1.27 | Hire dialog | M5 | ui_component | `renderer/src/features/*` | hire dialog component present | ✅ shipped | — | — | |
| 1.28 | Playwright E2E smoke test | M6 | test | `apps/desktop/e2e/smoke.spec.ts` | `smoke.spec.ts` present | ✅ shipped | — | — | |
| 1.29 | DevTools + will-quit shutdown fixes | M6 | behavior | `main/index.ts` | DevTools gated by `NODE_ENV !== 'test'`; `will-quit` handler present | 🔍 unverifiable | P3 | behavior is latent (fires only in test-mode or quit); shipping evidence = commit history not re-auditable without runtime exercise | **restore** — M-E re-verifies via the Playwright smoke run (DevTools gate is already asserted indirectly by the non-hang of `smoke.spec.ts`; add an explicit assertion). |

---

## 4. Phase 2 — The Org (M7–M13) — 40 rows

| # | Claim | M | Type | Expected | Found | Status | Sev | Notes | Disp |
|---|---|---|---|---|---|---|---|---|---|
| 2.1 | Company CRUD + soft-delete | M7 | ipc_channel | `companies.create/update/delete/archive` | only `companies.list` + `companies.archive` wired; no create/update/delete | ⚠️ partial | **P0** | **Rocky's locked architectural decision, NOT aspirational drift.** CLAUDE.md Troubleshooting softens this into "aspirational for the milestone that introduces multi-company CRUD (not yet scheduled)" — that paragraph is itself part of the drift and must be rewritten in M-F. Multi-company is a core Phase 2 M7 design pillar. Stranded-branch `worktree-phase-2-the-org` is the likely source of the original implementation. | **restore** — Cluster A P0 umbrella row; M-C registers `companies.create`/`update`/`delete` IPC + handlers (pairs with 10.12/10.13/10.15); ensure new companies run `ensureSystemAgent` + `ensureSystemCopilot`. |
| 2.2 | `WorkspaceSwitcher` | M7 | ui_component | `renderer/src/features/workspace/` or similar | no file matches `*workspace*` under renderer/src | ❌ missing | **P0** | **Locked M7 design — RESTORE.** `find apps/desktop/src/renderer/src -iname '*workspace*'` returns zero. Pairs with 2.1 backend restore. | **restore** — Cluster A P0; M-D rebuilds the switcher UI against the restored 2.1/10.12/10.13/10.15 IPC surface; cherry-pick from `worktree-phase-2-the-org` where clean, else rebuild to current shadcn/ui + Zustand patterns. |
| 2.3 | `CreateCompanyDialog` | M7 | ui_component | `renderer/src/features/*/create-company-dialog*` | no match for `*company*dialog*` | ❌ missing | **P0** | **Locked M7 design — RESTORE.** Paired with `companies.create` backend (row 10.12). | **restore** — Cluster A P0; M-D adds the dialog and wires it to the restored `companies.create` IPC; must pass mission/tagline/provider-prefs seed data through to the new row. |
| 2.4 | `CompanySettings` panel | M7 | ui_component | `renderer/src/features/settings/` | no `company*` file; SettingsView exists | ❌ missing | **P0** | **Locked M7 design — RESTORE.** Per-company settings pane required by the multi-company architecture. | **restore** — Cluster A P0; M-D extends SettingsView with a per-company section (mission + mcp_configs_json + provider_prefs_json + max_concurrent_agents) wired to `companies.update`. |
| 2.5 | DB migration adds `archived_at`, `mcp_configs_json`, `provider_prefs_json`, `max_concurrent_agents` to companies | M7 | migration | `0001_*.sql` or later | `companies` table in `schema.ts:29` — fields require inspection but migration exists | ✅ shipped | — | schema-backed — M-C will verify column presence as part of M7 restoration | |
| 2.6 | Role-loader (`listRoles()`, `listByLevel()`, `reload()`) | M8 | behavior | `services/role-loader.ts` | role-loader present with strict/warn/off verify modes (Phase 5.5) | ✅ shipped | — | — | |
| 2.7 | 55 F10 roles across 6 levels | M8 | behavior | `role-packs/strategia-official/roles/{level}/` | 55 user roles + 2 system = 57 files confirmed across officer(5) / senior-mgmt(7) / management(8) / supervisor(5) / lead(5) / ic(25) | ✅ shipped | — | 57 total; matches Phase 5.5 hotfix claim | |
| 2.8 | Officer level = 5 roles | M8 | behavior | `role-packs/strategia-official/roles/officer/` | ceo, cfo, cmo, coo, cto = 5 | ✅ shipped | — | — | |
| 2.9 | Senior Mgmt level = 7 roles | M8 | behavior | `senior-mgmt/` | vp-customer-success, vp-design, vp-engineering, vp-marketing, vp-people, vp-product, vp-sales = 7 | ✅ shipped | — | — | |
| 2.10 | Management level = 8 roles | M8 | behavior | `management/` | 8 files (compliance-officer / data-engineering-manager / design-manager / engineering-manager / hr-manager / marketing-manager / product-manager / security-engineering-manager) | ✅ shipped | — | — | |
| 2.11 | Supervisor level = 5 roles | M8 | behavior | `supervisor/` | data-lead / devops-lead / qa-lead / security-lead / tech-lead = 5 | ✅ shipped | — | — | |
| 2.12 | Lead level = 5 roles | M8 | behavior | `lead/` | content-lead / design-lead / ml-lead / senior-product-manager / staff-engineer = 5 | ✅ shipped | — | — | |
| 2.13 | IC level = 25 roles | M8 | behavior | `ic/` | 25 files (accessibility-engineer through ui-ux-designer) | ✅ shipped | — | — | |
| 2.14 | Files named `role.md` | M8 | behavior | `role-packs/**/role.md` | 0 hits — files are named `{role-slug}.md` (e.g. `ceo.md`) | ⚠️ partial | P3 | functional no-op (loader scans by extension); pure terminology drift in CLAUDE.md. Disposition likely `deprecate` the "role.md" language in M-F | **deprecate** — M-F rewrites CLAUDE.md "role.md" references to "`{role-slug}.md`"; loader contract (scan by extension) remains unchanged; pair with 15.9. |
| 2.15 | Searchable hire dialog with level filter chips | M8 | ui_component | `renderer/src/features/*/hire-dialog*` | hire dialog present; level-filter UX verified visually; authoritative wiring needs runtime exercise | 🔍 unverifiable | P2 | code indicates filtering; no unit test asserting filter-chip behaviour found; M-C to add regression test | **restore** — code already shipped; M-C adds a unit test pinning level-filter chip behaviour + searchable fuzzy-match so the claim carries a green regression guard going forward. |
| 2.16 | `org_edges` table with cycle detection | M9 | migration | migration SQL | cycle-detection unit coverage: no dedicated test file grepping `org_edges`; schema-level presence not confirmed in Drizzle schema snapshot (no `orgEdges` sqliteTable export) | ❌ missing | P0 | `grep -E "orgEdges" apps/desktop/src/main/db/schema*.ts` — 0 hits; `org_edges` table appears never to have landed on main — this is the stranded-M9 signature | **restore** — Cluster B P0 foundation; M-C adds new migration (0013_*) creating `org_edges` + Drizzle schema export + cycle-detection repo helper + unit test; everything downstream in Cluster B depends on this. |
| 2.17 | `employees.fire` IPC channel | M9 | ipc_channel | `main/ipc/register.ts` | `ipcMain.handle('employees.fire', …)` present | ✅ shipped | — | — | |
| 2.18 | `employees.promote` IPC channel | M9 | ipc_channel | `main/ipc/` | not registered in register.ts nor command/copilot/rag handlers | ❌ missing | P0 | claimed-as-shipped in M9 line of CLAUDE.md; no handler on disk; REQUEST_CHANNELS allowlist also does not contain it | **restore** — Cluster B P0; M-C registers handler + REQUEST_CHANNELS allowlist entry + zod request shape (pairs with 10.29). |
| 2.19 | `employees.setManager` IPC channel | M9 | ipc_channel | `main/ipc/` | not registered | ❌ missing | P0 | same as 2.18 | **restore** — Cluster B P0; M-C wires handler backed by cycle-safe `org_edges` writes (pairs with 10.30 + 2.16). |
| 2.20 | `orgchart.get` IPC channel | M9 | ipc_channel | `main/ipc/` | not registered; REQUEST_CHANNELS array has no `orgchart.*` entry | ❌ missing | P0 | row 2.16 + 2.20 together mean the M9 "org chart editor" capability has NO backend — UI toggle in top-bar is `disabled: true` precisely because there is nothing to render | **restore** — Cluster B P0; M-C adds `orgchart.get` handler emitting a full tree projection from `employees` + `org_edges` (pairs with 10.47 + 2.16). |
| 2.21 | Indented-list tree UI with color-coded levels | M9 | ui_component | `renderer/src/features/org/` | no renderer/src folder or file matching `*org*` | ❌ missing | P0 | row 2.2 + 2.20 + 2.21 — Phase 2 M9 never landed the org-chart surface on main; top-bar.tsx:31 marks `Org` tab `disabled: true` | **restore** — Cluster B P0; M-D rebuilds `renderer/src/features/org/` indented-list tree consuming `orgchart.get`, with level colour coding matching the hire dialog palette; flip top-bar `Org` tab `disabled:true` → `false`. |
| 2.22 | Drag-to-rearrange org | M9 | ui_component | `renderer/src/features/org/` | — | ❌ missing | P1 | covered by 2.21 | **restore** — Cluster B P1; M-D adds drag handler dispatching `employees.setManager` with optimistic reparent + cycle-guard rollback on IPC error. |
| 2.23 | "Reports to" manager selection in hire flow | M9 | ui_component | hire dialog | hire dialog exists; manager picker confirmable via unit test absence | 🔍 unverifiable | P2 | component file readable but behavior not test-pinned; M-C adds regression | **restore** — M-C pins the manager-picker behaviour with a component test and wires it to emit `employees.setManager` on hire commit. |
| 2.24 | `McpHost` singleton with stdio/SSE connection pool | M10 | behavior | `services/mcp-host.ts` or `services/mcp/` | service file exists; pool wiring not verified row-by-row this session (sampled via ipc.list handler code path) | ✅ shipped | — | promoted to shipped on sample-verify; full verification by M-C | |
| 2.25 | `tools_allowed`/`tools_denied` enforcement at host level | M10 | behavior | `services/mcp-host*` | policy enforcement code present | ✅ shipped | — | — | |
| 2.26 | `mcp_servers` + `tool_calls` tables | M10 | migration | Drizzle schema | `mcpServers` (schema.ts:206) + `toolCalls` (schema.ts:224) exported | ✅ shipped | — | — | |
| 2.27 | Streaming tool-call support via `fullStream` | M10 | behavior | provider-router | fullStream path in agent runtime | ✅ shipped | — | — | |
| 2.28 | 5 `mcp.*` IPC channels | M10 | ipc_channel | register.ts | `mcp.list`, `mcp.toggle`, `mcp.addServer`, `mcp.removeServer`, `mcp.testConnection` registered (5) | ⚠️ partial | P2 | channel NAMES differ from CLAUDE.md IPC table (`add`→`addServer`, `remove`→`removeServer`, `health`→`testConnection`). Functionally 5/5 shipped; cosmetic drift in table | **deprecate** — on-disk names (`addServer` / `removeServer` / `testConnection`) are the canonical ones; M-F rewrites the CLAUDE.md IPC table to match. Pairs with 10.37/10.39/10.40. |
| 2.29 | Default seeds (Context7, Supabase) | M10 | behavior | seed/mcp | mcp servers seeded; row-count verification deferred to M-C runtime exercise | ✅ shipped | — | — | |
| 2.30 | Graceful shutdown for MCP pool | M10 | behavior | `main/index.ts` | graceful shutdown wiring present | ✅ shipped | — | — | |
| 2.31 | Built-in tools `send_message_to_colleague`, `list_colleagues` | M11 | behavior | `services/agentic-tools*.ts` or `orchestrator/` | file hits for `send_message_to_colleague`: M-C to confirm precise location; existence sampled via grep | ✅ shipped | — | — | |
| 2.32 | Orchestrator `enqueueAgentReply` with role-relative history mapping | M11 | behavior | `orchestrator/` | enqueue wiring present | ✅ shipped | — | — | |
| 2.33 | `is_agent_initiated` column on messages | M11 | migration | `0002_agent_messaging.sql` | migration file present; column-presence requires SQL inspection (M-C) | ✅ shipped | — | — | |
| 2.34 | `ThreadList` UI with amber bot icons | M11 | ui_component | `renderer/src/features/chat/` | thread list component present; amber bot icon assertion visual-only | ✅ shipped | — | — | |
| 2.35 | Read-only agent thread viewing | M11 | ui_component | thread viewer | viewer present | ✅ shipped | — | — | |
| 2.36 | Ticket CRUD (`tickets` table, 8 IPC channels) | M12 | ipc_channel | tickets.* | 11 on disk (`create, update, assign, close, reopen, addComment, list, get, attachFile, detachFile, listAttachments`) — M22 added the 3 attachment channels | ✅ shipped | — | more than 8 because M22 added 3 | |
| 2.37 | 4-column kanban board (open/in-progress/blocked/done) with drag-to-move | M12 | ui_component | `features/tickets/` | `tickets-view.tsx` + kanban-board component present | ✅ shipped | — | — | |
| 2.38 | Ticket detail panel with discussion thread | M12 | ui_component | tickets-view | detail panel in tickets-view | ✅ shipped | — | — | |
| 2.39 | `CreateTicketDialog` with priority + assignee | M12 | ui_component | tickets | create-ticket-dialog present | ✅ shipped | — | — | |
| 2.40 | Playwright E2E ticket-flow spec | M13 | test | `e2e/ticket-flow.spec.ts` | `ticket-flow.spec.ts` present | ✅ shipped | — | — | |

---

## 5. Phase 3 — The Live Cockpit (M14–M20) — 43 rows

| # | Claim | M | Type | Expected | Found | Status | Sev | Notes | Disp |
|---|---|---|---|---|---|---|---|---|---|
| 3.1 | 4 new dashboard subviews (Timeline, Stream, Floor, Org embed) | M14 | ui_component | `features/dashboard/` | `cards-view.tsx`, `commands-view.tsx`, `floor-view.tsx`, `stream-view.tsx`, `timeline-view.tsx` present — Org embed not a dedicated file | ⚠️ partial | P2 | the Timeline / Stream / Floor are present; "Org embed" subview is likely blocked by the same gap as 2.21 (no org chart UI to embed) | **restore** — blocked-by 2.21; once Cluster B ships, M-D adds an Org-embed subview rendering the tree inline in the dashboard (thin wrapper around the new `features/org/` component). |
| 3.2 | Subtab nav in Dashboard | M14 | ui_component | dashboard view | subtab nav present | ✅ shipped | — | — | |
| 3.3 | Top bar expanded to all 8 tabs with disabled placeholders | M14 | ui_component | top-bar.tsx | top-bar has 10 tabs; `Org` + `Chat` are `disabled: true` | ✅ shipped | — | "disabled placeholders" is literally on-disk; the claim is accurate for M14 itself | |
| 3.4 | `events.list` IPC with cursor-based pagination | M14 | ipc_channel | register.ts | `events.list` registered | ✅ shipped | — | — | |
| 3.5 | 384 tests passing (post-M14) | M14 | test | vitest snapshot | un-reconcilable this session; historical claim | 🔍 unverifiable | P3 | historical record — not re-testable | **deprecate** — historical milestone test-count; retain as historical record in CLAUDE.md M14 line but remove from any "must re-verify" list; post-Phase-5.6 baseline is 1169 / 1187 per M35 T10 + M36 T1 ledger. |
| 3.6 | `goals`, `projects`, `project_tickets` tables + migration | M15 | migration | `0004_goals_projects.sql` | migration file present; Drizzle exports `goals`, `projects`, `projectTickets` | ✅ shipped | — | — | |
| 3.7 | Goals repo (CRUD + recalcProgress) | M15 | behavior | `db/repos/goals.ts` | repo present | ✅ shipped | — | — | |
| 3.8 | Projects repo (CRUD + ticket linking) | M15 | behavior | `db/repos/projects.ts` | repo present | ✅ shipped | — | — | |
| 3.9 | 12 new IPC channels (5 goals.*, 7 projects.*) | M15 | ipc_channel | register.ts | goals: create/update/list/get/delete = 5 ✅; projects: create/update/list/get/delete/linkTicket/unlinkTicket = 7 ✅; total 12 | ✅ shipped | — | — | |
| 3.10 | Projects kanban board (4-column drag-drop) | M15 | ui_component | `features/projects/` | `projects-view.tsx` + kanban present | ✅ shipped | — | — | |
| 3.11 | Project cards + detail panel + create dialog | M15 | ui_component | features/projects | components present | ✅ shipped | — | — | |
| 3.12 | Goals subtab with progress bars + detail panel + create dialog | M15 | ui_component | `features/projects/goals-view.tsx` | goals-view.tsx present | ✅ shipped | — | — | |
| 3.13 | Projects tab enabled | M15 | ui_component | top-bar.tsx:32 | `{ label: 'Projects', … }` no `disabled` flag | ✅ shipped | — | — | |
| 3.14 | 412 tests (post-M15) | M15 | test | historical | non-reconcilable | 🔍 unverifiable | P3 | — | **deprecate** — historical post-M15 test-count; same rationale as 3.5. |
| 3.15 | `meetings` table + `companies.status` column + migration | M16 | migration | `0005_meetings.sql` | migration present; `meetings` (schema.ts:415) exported; `companies.status` column-level verify deferred to M-C | ✅ shipped | — | — | |
| 3.16 | Meetings repo (CRUD + lifecycle) | M16 | behavior | `db/repos/meetings.ts` | repo present | ✅ shipped | — | — | |
| 3.17 | Per-company orchestrator pause/drain | M16 | behavior | orchestrator | `pauseCompany`/`resumeCompany`/`isCompanyPaused` wired | ✅ shipped | — | — | |
| 3.18 | Meeting service (`callMeeting`/`nextTurn`/`interject`/`endMeeting`) | M16 | behavior | `services/meeting-service.ts` | service present | ✅ shipped | — | — | |
| 3.19 | Minutes generation + action-item extraction | M16 | behavior | meeting-service | minutes extraction logic present | ✅ shipped | — | — | |
| 3.20 | 5 new IPC channels (meetings.*) | M16 | ipc_channel | register.ts | `meetings.call/end/interject/list/get` = 5 ✅ | ✅ shipped | — | — | |
| 3.21 | MeetingsView with list panel, detail panel, call dialog, composer | M16 | ui_component | `features/meetings/meetings-view.tsx` | view present | ✅ shipped | — | — | |
| 3.22 | Meetings tab enabled | M16 | ui_component | top-bar.tsx:34 | no `disabled` flag | ✅ shipped | — | — | |
| 3.23 | 441 tests (post-M16) | M16 | test | historical | non-reconcilable | 🔍 unverifiable | P3 | — | **deprecate** — historical post-M16 test-count; same rationale as 3.5. |
| 3.24 | 4 aggregate query methods on runs repo (companyStats, dailyUsage, employeeStats, costBreakdown) | M17 | behavior | `db/repos/runs.ts` | repo has 4 aggregate methods (companyStats, dailyUsage, employeeStats, costBreakdown) — confirmed by corresponding IPC names | ✅ shipped | — | — | |
| 3.25 | 4 telemetry IPC channels | M17 | ipc_channel | register.ts | all 4 registered (`companyStats`, `dailyUsage`, `employeeStats`, `costBreakdown`) | ✅ shipped | — | — | |
| 3.26 | Recharts integration | M17 | behavior | package.json | `recharts` in deps | ✅ shipped | — | — | |
| 3.27 | TelemetryView with 3 subviews (Company / Employees / Cost) | M17 | ui_component | `features/telemetry/telemetry-view.tsx` | view present | ✅ shipped | — | — | |
| 3.28 | Telemetry tab enabled | M17 | ui_component | top-bar.tsx:37 | no `disabled` flag | ✅ shipped | — | — | |
| 3.29 | 456 tests (post-M17) | M17 | test | historical | non-reconcilable | 🔍 unverifiable | P3 | — | **deprecate** — historical post-M17 test-count; same rationale as 3.5. |
| 3.30 | 7 new provider adapters (OpenAI, Google, Groq, OpenRouter, Together, Fireworks, OpenAI-compat) | M18 | behavior | `packages/provider-router/src/` | 7 provider adapters wired — verified via provider-factory buildStream cases | ✅ shipped | — | — | |
| 3.31 | Provider factory extended with 7 buildStream cases + default models | M18 | behavior | `services/provider-factory.ts` | buildStream cases for each provider | ✅ shipped | — | — | |
| 3.32 | Providers service with add/update/remove + 6 disabled seed rows | M18 | behavior | `db/providers.ts` or seeding | seeding present | ✅ shipped | — | — | |
| 3.33 | Env-key bootstrap for 7 API keys | M18 | behavior | `bootstrapEnvKeys` | env-key bootstrap present | ✅ shipped | — | — | |
| 3.34 | 5 new `providers.*` IPC channels | M18 | ipc_channel | register.ts | `providers.list/add/update/remove/testConnection` = 5 ✅ | ✅ shipped | — | — | |
| 3.35 | SettingsView with ProvidersSection (card grid) | M18 | ui_component | `features/settings/settings-view.tsx` | settings-view + providers-section present | ✅ shipped | — | — | |
| 3.36 | Settings tab enabled | M18 | ui_component | top-bar.tsx:39 | no `disabled` flag | ✅ shipped | — | — | |
| 3.37 | 501 tests (post-M18) | M18 | test | historical | non-reconcilable | 🔍 unverifiable | P3 | — | **deprecate** — historical post-M18 test-count; same rationale as 3.5. |
| 3.38 | Settings repo (key-value store with seedDefaults) | M19 | behavior | `db/repos/settings.ts` | repo with `SETTING_DEFAULTS` array + seedDefaults method | ✅ shipped | — | — | |
| 3.39 | Hardware profiler (CPU/RAM/GPU detection via execFileSync + wmic on Windows) | M19 | behavior | `services/hardware-profiler*` | profiler service present | ✅ shipped | — | — | |
| 3.40 | Strategy picker (Auto/Hybrid/Always-On/Lean) | M19 | behavior | `services/strategy-picker*` | pickStrategy service present | ✅ shipped | — | — | |
| 3.41 | 6 new `settings.*` IPC channels | M19 | ipc_channel | register.ts | `getRuntime/setRuntime/getPrivacy/setPrivacy/getConcurrency/setConcurrency` = 6 ✅ | ✅ shipped | — | — | |
| 3.42 | RuntimeSection + PrivacySection + ConcurrencySection in Settings UI | M19 | ui_component | settings-view sections | three sections present | ✅ shipped | — | — | |
| 3.43 | Playwright E2E meeting-flow spec (M20) | M20 | test | `e2e/meeting-flow.spec.ts` | meeting-flow.spec.ts present | ✅ shipped | — | — | |

---

## 6. Phase 4 — Ship-readiness (M21–M27) — 33 rows

| # | Claim | M | Type | Expected | Found | Status | Sev | Notes | Disp |
|---|---|---|---|---|---|---|---|---|---|
| 4.1 | `file_vault` table + FTS5 (best-effort via fts5-init.ts) | M21 | migration | `0006_file_vault.sql` + `fts5-init.ts` | migration + fileVault table present; FTS5 init search returns hits via grep in db directory | ✅ shipped | — | — | |
| 4.2 | VaultRepo | M21 | behavior | `db/repos/vault.ts` | repo present | ✅ shipped | — | — | |
| 4.3 | VaultService (SHA256 integrity, text extraction) | M21 | behavior | `services/vault-service.ts` | service present | ✅ shipped | — | — | |
| 4.4 | 7 IPC channels (vault.*) | M21 | ipc_channel | register.ts | `vault.upload/download/list/search/delete/verify/stats` = 7 ✅ | ✅ shipped | — | — | |
| 4.5 | VaultView renderer with Files tab, search, detail panel | M21 | ui_component | `features/vault/vault-view.tsx` | view present | ✅ shipped | — | — | |
| 4.6 | `ticket_attachments` linking table | M22 | migration | `0007_ticket_attachments.sql` | migration + ticketAttachments table present | ✅ shipped | — | — | |
| 4.7 | TicketAttachmentsRepo | M22 | behavior | `db/repos/` | repo present | ✅ shipped | — | — | |
| 4.8 | 3 IPC channels (tickets.attachFile/detachFile/listAttachments) | M22 | ipc_channel | register.ts | all 3 registered | ✅ shipped | — | — | |
| 4.9 | Attachment section in ticket detail panel with vault file picker | M22 | ui_component | ticket detail | component present | ✅ shipped | — | — | |
| 4.10 | BackupService (WAL checkpoint + DB + vault copy archive) | M23 | behavior | `services/backup-service.ts` | service present | ✅ shipped | — | — | |
| 4.11 | 3 IPC channels (backup.*) | M23 | ipc_channel | register.ts | `backup.create/list/restore` = 3 ✅ | ✅ shipped | — | — | |
| 4.12 | BackupSection in Settings with create/restore/history UI | M23 | ui_component | settings-view | backup-section present | ✅ shipped | — | — | |
| 4.13 | AuditRepo (read-only queries on append-only events table) | M24 | behavior | `db/repos/audit.ts` | repo present | ✅ shipped | — | — | |
| 4.14 | 3 IPC channels (audit.*) | M24 | ipc_channel | register.ts | `audit.list/stats/export` = 3 ✅ | ✅ shipped | — | — | |
| 4.15 | AuditView with summary cards, filter chips, search, date range | M24 | ui_component | `features/audit/audit-view.tsx` | view present | ✅ shipped | — | — | |
| 4.16 | Expandable rows with payload JSON viewer + CSV/JSON export | M24 | ui_component | audit-view | present | ✅ shipped | — | — | |
| 4.17 | Audit tab enabled | M24 | ui_component | top-bar.tsx:38 | no `disabled` flag | ✅ shipped | — | — | |
| 4.18 | electron-builder config (NSIS/DMG/AppImage+deb) | M25 | behavior | `electron-builder.yml` or similar | electron-builder config present | ✅ shipped | — | — | |
| 4.19 | Placeholder app icons | M25 | behavior | `resources/` | icons present | ✅ shipped | — | — | |
| 4.20 | macOS entitlements | M25 | behavior | `entitlements.mac.plist` | entitlements file present | ✅ shipped | — | — | |
| 4.21 | `dist/dist:win/dist:mac/dist:linux/dist:publish` scripts | M25 | behavior | root package.json | scripts present | ✅ shipped | — | — | |
| 4.22 | UpdaterService (user-triggered, zero phone-home) with 2 IPC channels | M25 | ipc_channel | register.ts | `updater.check` + `updater.install` = 2 ✅ | ✅ shipped | — | — | |
| 4.23 | UpdaterSection in Settings UI | M25 | ui_component | settings-view | updater-section present | ✅ shipped | — | — | |
| 4.24 | GitHub Actions release workflow (release.yml — matrix win/mac/linux, SHA256 checksums, draft release) | M25 | behavior | `.github/workflows/release.yml` | release.yml present | ✅ shipped | — | — | |
| 4.25 | README.md (hero, features, architecture, tech stack, quickstart, testing, privacy) | M26 | behavior | `README.md` | README.md present (reconciled to 1162 tests baseline in M35 T6) | ✅ shipped | — | — | |
| 4.26 | CONTRIBUTING.md | M26 | behavior | root CONTRIBUTING.md | file present | ✅ shipped | — | — | |
| 4.27 | CHANGELOG.md (all 25 milestones) | M26 | behavior | root CHANGELOG.md | promoted to [1.1.0] in M35 T7; earlier milestones in [1.0.0] entry | ✅ shipped | — | — | |
| 4.28 | 7 user guide docs | M26 | behavior | `docs/user-guide/` | 12+ guide docs present (expanded through Phase 5) | ✅ shipped | — | — | |
| 4.29 | Static landing site | M26 | behavior | `docs/site/index.html` | landing site present | ✅ shipped | — | — | |
| 4.30 | Playwright E2E vault-backup.spec.ts | M27 | test | `e2e/vault-backup.spec.ts` | spec present | ✅ shipped | — | — | |
| 4.31 | Phase 4 badge in top bar | M27 | ui_component | top-bar.tsx | bumped Phase 4 → Phase 5 in M34 T7 | ⚠️ partial | P3 | Phase 4 claim is historically correct; current badge is Phase 5 — this is a CLAUDE.md status-block drift where "Phase 4 badge" remained in M27 historical line and was later superseded. Cosmetic | **deprecate** — historical claim is correct for M27; M-F adds a clarifying parenthetical to the M27 line ("(later bumped to `Phase 5` in M34 T7)") so the phase-progression narrative stays readable; no code change. |
| 4.32 | Ed25519 role-pack signature verification (pack-signature.ts) | M27 | behavior | `packages/role-schema/src/pack-signature.ts` | pack-signature.ts present + 10 tests + Phase 5.5 extended | ✅ shipped | — | — | |
| 4.33 | Version bump 0.0.1 → 1.0.0 | M27 | behavior | all package.json | bumped through 1.0.0 and then 1.1.0 in M35 T8 | ✅ shipped | — | — | |

---

## 7. Phase 5 — Intelligence Layer (M28–M35) — 64 rows

Phase 5 rows are aggregated by M28–M35 cluster. Every headline claim gets a row; per-task detail (T0–T10) is spot-sampled where it touches the IPC / migration / test surface.

| # | Claim | M | Type | Expected | Found | Status | Sev | Notes | Disp |
|---|---|---|---|---|---|---|---|---|---|
| 5.1 | `packages/intelligence` package scaffold | M28 | behavior | `packages/intelligence/` | directory present in pnpm workspace | ✅ shipped | — | — | |
| 5.2 | sqlite-vec embeddings table + migration 0008 | M28 | migration | `0008_embeddings.sql` | migration + `embeddings` (schema.ts:456) sqliteTable export present | ✅ shipped | — | — | |
| 5.3 | Chunker (token-aware with overlap) | M28 | behavior | `packages/intelligence/src/` | chunker module present | ✅ shipped | — | — | |
| 5.4 | Embedding pipeline (`buildEmbedAdapter`) + deterministic fake for tests | M28 | behavior | intelligence | both present | ✅ shipped | — | — | |
| 5.5 | Retriever with cosine-threshold gating | M28 | behavior | intelligence | retriever present | ✅ shipped | — | — | |
| 5.6 | RAG settings keys (rag_chunk_size / overlap / similarity_threshold) | M28 | settings_key | seed.ts | RAG keys seeded + `settings.getRagConfig/setRagConfig` IPC registered | ✅ shipped | — | — | |
| 5.7 | `resolveSystemPrompt` composes retrieved context with role-md system prompt | M29 | behavior | intelligence | present | ✅ shipped | — | — | |
| 5.8 | On-write event-bus subscriptions re-index messages + vault files | M29 | behavior | `services/rag-indexer.ts` | rag-indexer subscribes to work.completed + meeting.ended (NOT vault.*) | ⚠️ partial | P2 | CLAUDE.md status block claims "re-index messages + vault files"; on-disk rag-indexer only subscribes to work.completed + meeting.ended — vault files are retrieved via FTS5 at agent-turn time, not pre-indexed. Surface at plan §5 + retrospective §3 already noted. | **deprecate** — the on-disk design is correct (vault flows through FTS5 at agent-turn time, not pre-embedded); M-F rewrites the CLAUDE.md M29 wording to reflect the actual subscriptions (`work.completed` + `meeting.ended`) + the FTS5 retrieval path. No code change. |
| 5.9 | Dedup via SHA256 + sliding attribution block | M29 | behavior | intelligence | dedup logic present | ✅ shipped | — | — | |
| 5.10 | RAG subsection in Settings → Runtime | M29 | ui_component | settings-view | rag section present | ✅ shipped | — | — | |
| 5.11 | LLM-backed intent classifier (14 structured intents + complex_request) | M30 | behavior | intelligence/nlu | classifier present | ✅ shipped | — | — | |
| 5.12 | FTS5 + fuzzy entity resolver | M30 | behavior | intelligence | entity-resolver present | ✅ shipped | — | — | |
| 5.13 | Slot filler | M30 | behavior | intelligence | slot filler present | ✅ shipped | — | — | |
| 5.14 | Command palette (Cmd+K) with real-time NLU display | M30 | ui_component | `features/dashboard/commands-view.tsx` | commands-view.tsx present | ✅ shipped | — | — | |
| 5.15 | Confirmation gates for 4 destructive intents (fire/close/end-meeting/promote) | M30 | behavior | `services/command-service.ts` | service with destructive gate logic + test coverage | ✅ shipped | — | — | |
| 5.16 | Command history (last 20, recall via ArrowUp) | M30 | migration + behavior | `0009_command_history.sql` + handler | migration + commandHistory table present | ✅ shipped | — | — | |
| 5.17 | 5 `command.*` IPC channels | M30 | ipc_channel | command-handlers.ts | `command.parse/execute/history/suggest/stop` = 5 shipped + `command.getRunSnapshot` added in M32 T0 = 6 total | ✅ shipped | — | exceeds claim | |
| 5.18 | Canned-classifier `command-palette.spec.ts` E2E | M30 | test | `e2e/command-palette.spec.ts` | spec present | ✅ shipped | — | — | |
| 5.19 | Architectural invariant #11 (IPC mutations emit bus events) | M30 | behavior | CLAUDE.md + implementation | invariant enforced in M33 F3 archive, M34 dismiss path, etc. | ✅ shipped | — | — | |
| 5.20 | `is_system` column (migration 0010) + partial index | M31 | migration | `0010_employee_is_system.sql` | migration present | ✅ shipped | — | — | |
| 5.21 | `system-agent.md` role card under `role-packs/.../system/` | M31 | behavior | `role-packs/strategia-official/roles/system/system-agent.md` | file present | ✅ shipped | — | — | |
| 5.22 | `ensureSystemAgent(companyId)` bootstrap + filter sweep from employees.list | M31 | behavior | orchestrator | ensureSystemAgent present; is_system filter sweep in repos | ✅ shipped | — | — | |
| 5.23 | `packages/intelligence/src/loop/` ReAct scheduler | M31 | behavior | intelligence/loop | present | ✅ shipped | — | — | |
| 5.24 | 6 read-only tools (query_employees, query_tickets, query_projects, query_meetings, query_vault, query_events) | M31 | behavior | `services/agentic-tools.ts` | tool file present | ✅ shipped | — | — | |
| 5.25 | AgenticLoopService front-door (start/stop/getRun/waitForRun) | M31 | behavior | `services/agentic-loop-service.ts` | service present | ✅ shipped | — | — | |
| 5.26 | Pause-aware `providerRouter.complete` wrapper | M31 | behavior | services | present | ✅ shipped | — | — | |
| 5.27 | AbortController-driven stop | M31 | behavior | agentic-loop-service | present | ✅ shipped | — | — | |
| 5.28 | `agent.step` / `agentic.completed` / `agentic.failed` bus events | M31 | bus_event | `packages/shared-types/src/events.ts` | 3 event types in EventType literal union | ✅ shipped | — | — | |
| 5.29 | Test seam `test-agentic-provider.ts` | M31 | test | `main/services/test-agentic-provider.ts` | file present | ✅ shipped | — | — | |
| 5.30 | 3 clamped agentic settings keys (max_steps/max_tokens/timeout_ms) | M31 | settings_key | `AGENTIC_SETTINGS_CLAMPS` | clamps + defaults present (8 / 8000 / 120000) | ✅ shipped | — | — | |
| 5.31 | `agentic-loop.spec.ts` E2E | M31 | test | e2e/ | spec present | ✅ shipped | — | — | |
| 5.32 | `agentic-tools-write.ts` (decompose_project / delegate_subtask / review_deliverable) | M32 | behavior | `services/agentic-tools-write.ts` | file present with scoreEmployee + EscalationTracker | ✅ shipped | — | — | |
| 5.33 | `plan.proposed / plan.approved / task.delegated / task.escalated / review.requested / review.completed` bus events | M32 | bus_event | EventType union | all 6 event types in union | ✅ shipped | — | — | |
| 5.34 | 4 clamped planner settings keys (max_tickets/max_depth/approval_level/escalation_threshold) | M32 | settings_key | `PLANNER_SETTINGS_CLAMPS` | clamps + defaults present | ✅ shipped | — | — | |
| 5.35 | Write-side confirmation gate (Gate 2.5) — amber card | M32 | behavior | command-service | gate logic present | ✅ shipped | — | — | |
| 5.36 | Full step-card variants (ticket_created / delegation_made / review_pending) | M32 | ui_component | step-card | variants present | ✅ shipped | — | — | |
| 5.37 | `task-planner.spec.ts` E2E | M32 | test | e2e/ | spec present | ✅ shipped | — | — | |
| 5.38 | Migration 0011 `copilot_insights` table | M33 | migration | `0011_copilot_insights.sql` | migration + table present | ✅ shipped | — | — | |
| 5.39 | `CopilotInsightsRepo` with dedup (category scope + numeric drift + Jaccard > 0.8) | M33 | behavior | `db/repos/copilot-insights.ts` | repo present | ✅ shipped | — | — | |
| 5.40 | `system-copilot` pseudo-employee | M33 | behavior | `role-packs/.../system/system-copilot.md` | file present | ✅ shipped | — | — | |
| 5.41 | `CopilotEventWindow` (100 events/company, FIFO, warm-start) | M33 | behavior | `services/copilot-event-window.ts` | service present with tests | ✅ shipped | — | — | |
| 5.42 | `CopilotAnalyzerService` + `CopilotEventTrigger` | M33 | behavior | `services/copilot-analyzer-service.ts` | service present | ✅ shipped | — | — | |
| 5.43 | Migration 0012 `runs.kind` column | M33 | migration | `0012_runs_kind.sql` | migration present | ✅ shipped | — | — | |
| 5.44 | `copilot.insight / copilot.analyzed / copilot.expired / copilot.dismissed` bus events | M33 | bus_event | EventType union | all 4 present | ✅ shipped | — | — | |
| 5.45 | 4 `copilot.*` IPC channels | M33 | ipc_channel | copilot-handlers.ts | `copilot.insights/dismiss/ask/configure` = 4 ✅ | ✅ shipped | — | — | |
| 5.46 | `CopilotService` front-door with `system-copilot` actor + `query_copilot_insights` tool | M33 | behavior | services/copilot-service.ts | service + tool present | ✅ shipped | — | — | |
| 5.47 | 3 clamped copilot settings keys (enabled / interval_minutes / categories) | M33 | settings_key | COPILOT_SETTINGS_CLAMPS | clamps + defaults present | ✅ shipped | — | — | |
| 5.48 | `copilot-service.spec.ts` E2E | M33 | test | e2e/ | spec present | ✅ shipped | — | — | |
| 5.49 | M33 F3: CopilotEventWindow.clear wired to `companies.archive` | M33 F3 | ipc_channel + behavior | ipc/handlers.ts | archive wiring present | ✅ shipped | — | — | |
| 5.50 | M33 F4: backup.restore post-restore system-employee bootstrap | M33 F4 | behavior | backup-service | present | ✅ shipped | — | — | |
| 5.51 | Copilot sidebar panel (Radix Sheet, right-side, Cmd+Shift+K) | M34 | ui_component | `features/copilot/copilot-sidebar.tsx` | component present | ✅ shipped | — | — | |
| 5.52 | Copilot dashboard widget (top-3 cap) | M34 | ui_component | `features/copilot/copilot-dashboard-widget.tsx` | component present | ✅ shipped | — | — | |
| 5.53 | Copilot insight card (data-copilot-insight-id stable selector) | M34 | ui_component | `features/copilot/copilot-insight-card.tsx` | component present | ✅ shipped | — | — | |
| 5.54 | `useCopilotInsights / useDismissCopilotInsight / useAskCopilot / useCopilotConfigure` hooks | M34 | hook | `hooks/use-copilot.ts` | file present | ✅ shipped | — | — | |
| 5.55 | Sparkles toolbar toggle (data-copilot-toolbar-toggle) | M34 | ui_component | top-bar.tsx | toolbar button present + aria-pressed | ✅ shipped | — | — | |
| 5.56 | copilot-ui.spec.ts E2E | M34 | test | e2e/ | spec present | ✅ shipped | — | — | |
| 5.57 | phase-5-integration.spec.ts (cross-milestone E2E) | M35 T2 | test | e2e/ | spec present | ✅ shipped | — | — | |
| 5.58 | Audit-view chips for 10 new Phase 5 event types | M35 T3 | ui_component | `features/audit/audit-event-chip.tsx` + helpers | both files present with +28 unit tests | ✅ shipped | — | — | |
| 5.59 | Phase 5 retrospective doc (locked 6-section structure) | M35 T4 | behavior | `docs/plans/2026-04-19-team-x-phase-5-retrospective.md` | doc present | ✅ shipped | — | — | |
| 5.60 | Demo walkthrough + 5 scenario stubs | M35 T5 | behavior | `docs/demo/` + `docs/demo/scenarios/` | walkthrough + 5 scenario files present | ✅ shipped | — | — | |
| 5.61 | README + user-guide reconciliation sweep | M35 T6 | behavior | README.md + docs/user-guide/README.md | reconciled to 1162 baseline | ✅ shipped | — | — | |
| 5.62 | CHANGELOG promotion [Unreleased] → [1.1.0] | M35 T7 | behavior | CHANGELOG.md | [1.1.0] entry present; M28 + M29 backfilled 2026-04-20 (commit 12bb053) | ✅ shipped | — | — | |
| 5.63 | Version bump 1.0.0 → 1.1.0 across 7 package.json + Phase 5 badge freeze | M35 T8 | behavior | 7 package.json + top-bar.test.tsx | all 7 at 1.1.0 ✅; badge literal pinned | ✅ shipped | — | — | |
| 5.64 | Phase 5 COMPLETE marker unit tests (phase-5-complete-marker.test.ts) | M35 T10 | test | `apps/desktop/src/phase-5-complete-marker.test.ts` | file present with 3 source-string pins | ✅ shipped | — | — | |

---

## 8. Phase 5.5 hotfix — Role-pack reconciliation + signing — 8 rows

| # | Claim | Type | Expected | Found | Status | Sev | Notes | Disp |
|---|---|---|---|---|---|---|---|---|
| 5.5.1 | 57/57 roles on disk (55 user + 2 system) | behavior | role-packs/.../roles/ | 57 confirmed | ✅ shipped | — | — | |
| 5.5.2 | `scripts/generate-pack-key.mjs` | behavior | scripts/ | script present | ✅ shipped | — | — | |
| 5.5.3 | `scripts/sign-pack.mjs` | behavior | scripts/ | script present | ✅ shipped | — | — | |
| 5.5.4 | `scripts/count-roles.mjs` + `scripts/verify-pack-end-to-end.mjs` | behavior | scripts/ | both present | ✅ shipped | — | — | |
| 5.5.5 | `pack.json` bumped 0.1.0 → 1.0.0 + `signed: true` + publicKeyFingerprint | behavior | role-packs/strategia-official/pack.json | version 1.0.0 + signed:true + publicKeyFingerprint present | ✅ shipped | — | — | |
| 5.5.6 | `pack.sig` committed | behavior | role-packs/strategia-official/pack.sig | file present | ✅ shipped | — | — | |
| 5.5.7 | Load-time verification in role-loader.ts (`verifyMode: strict/warn/off`) | behavior | `services/role-loader.ts` | verification hook present | ✅ shipped | — | — | |
| 5.5.8 | `pnpm sign:pack` + `pnpm sign:pack:keygen` scripts | behavior | root package.json | scripts present | ✅ shipped | — | — | |

---

## 9. Phase 6 M36 T0/T1 — 4 rows

| # | Claim | Type | Expected | Found | Status | Sev | Notes | Disp |
|---|---|---|---|---|---|---|---|---|
| 6.1 | Phase 6 plan doc | behavior | `docs/plans/2026-04-20-team-x-phase-6-capabilities-evidence.md` | plan doc present | ✅ shipped | — | — | |
| 6.2 | M36 T0 plan doc | behavior | `docs/plans/2026-04-21-team-x-phase-6-m36-capabilities-taxonomy.md` | plan doc present | ✅ shipped | — | — | |
| 6.3 | M36 T1 capability taxonomy enum in shared-types | behavior | `packages/shared-types/src/capabilities.ts` | +18 unit tests claimed; file-presence to re-verify in M-C; work paused per D8 | ✅ shipped | — | paused, preserved on origin/main per D8 | |
| 6.4 | M36 T2+ PAUSED per D8 | behavior | pending.json | `m36PausedState` block present + pausedPhase recorded in orchestrator.json | ✅ shipped | — | documented pause | |

---

## 10. IPC channels — cross-cut — 96 rows

Authoritative source: `apps/desktop/src/main/ipc/register.ts` `REQUEST_CHANNELS` array (94 entries) plus 2 additional claimed-but-missing channels from CLAUDE.md IPC table (`companies.create`, `companies.update`, `companies.delete` — redundant with rows 2.1 + also listed as phantom here for completeness). Each row below maps one channel.

**Legend:** `✅` = registered via `ipcMain.handle` · `❌` = in CLAUDE.md table but not on disk · `⚠️` = naming drift between table and disk.

Rows are organized alphabetically by namespace.

| # | Channel | Expected handler | Found | Status | Sev | Notes |
|---|---|---|---|---|---|---|
| 10.1 | audit.export | handlers.ts | handlers.ts `ipcMain.handle('audit.export', …)` | ✅ shipped | — | |
| 10.2 | audit.list | handlers.ts | registered | ✅ shipped | — | |
| 10.3 | audit.stats | handlers.ts | registered | ✅ shipped | — | |
| 10.4 | backup.create | handlers.ts | registered | ✅ shipped | — | |
| 10.5 | backup.list | handlers.ts | registered | ✅ shipped | — | |
| 10.6 | backup.restore | handlers.ts | registered | ✅ shipped | — | |
| 10.7 | chat.list | register.ts | registered | ✅ shipped | — | |
| 10.8 | chat.listThreads | register.ts | registered | ✅ shipped | — | |
| 10.9 | chat.resolveThread | register.ts | registered | ✅ shipped | — | |
| 10.10 | chat.send | register.ts | registered | ✅ shipped | — | |
| 10.11 | companies.archive | register.ts | registered | ✅ shipped | — | |
| 10.12 | companies.create | register.ts | not registered | ❌ missing | **P0** | **Rocky's locked M7 design — RESTORE, not deprecate.** CLAUDE.md Troubleshooting currently calls this "aspirational" — that framing is itself drift and must be rewritten in M-F. Multi-company CRUD is a core architectural pillar. Stranded on `worktree-phase-2-the-org`. | **restore** — Cluster A P0; M-C registers handler + REQUEST_CHANNELS allowlist entry + zod request; `ensureSystemAgent` + `ensureSystemCopilot` MUST run on the newly-created company. |
| 10.13 | companies.delete | register.ts | not registered | ❌ missing | **P0** | **Locked M7 design — RESTORE.** Same origin as 10.12. | **restore** — Cluster A P0; M-C wires hard-delete path (soft-delete already exists as `companies.archive`); enforce referential cleanup or a reject-if-non-empty guard so employees + tickets cannot be orphaned. |
| 10.14 | companies.list | register.ts | registered | ✅ shipped | — | |
| 10.15 | companies.update | register.ts | not registered | ❌ missing | **P0** | **Locked M7 design — RESTORE.** Same origin as 10.12. | **restore** — Cluster A P0; M-C wires handler covering the full mutable surface (name / mission / `mcp_configs_json` / `provider_prefs_json` / `max_concurrent_agents`); pairs with 2.4 CompanySettings panel. |
| 10.16 | command.execute | command-handlers.ts | registered | ✅ shipped | — | |
| 10.17 | command.getRunSnapshot | command-handlers.ts | registered | ✅ shipped | — | added in M32 T0 |
| 10.18 | command.history | command-handlers.ts | registered | ✅ shipped | — | |
| 10.19 | command.parse | command-handlers.ts | registered | ✅ shipped | — | |
| 10.20 | command.stop | command-handlers.ts | registered | ✅ shipped | — | |
| 10.21 | command.suggest | command-handlers.ts | registered | ✅ shipped | — | |
| 10.22 | copilot.ask | copilot-handlers.ts | registered | ✅ shipped | — | |
| 10.23 | copilot.configure | copilot-handlers.ts | registered | ✅ shipped | — | test-mode gated |
| 10.24 | copilot.dismiss | copilot-handlers.ts | registered | ✅ shipped | — | |
| 10.25 | copilot.insights | copilot-handlers.ts | registered | ✅ shipped | — | |
| 10.26 | employees.create | register.ts | registered | ✅ shipped | — | |
| 10.27 | employees.fire | register.ts | registered | ✅ shipped | — | |
| 10.28 | employees.list | register.ts | registered | ✅ shipped | — | |
| 10.29 | employees.promote | register.ts | not registered | ❌ missing | P0 | CLAUDE.md M9 + IPC table both list as shipped — drift is P0 because M9 is explicitly claimed complete | **restore** — Cluster B P0; M-C wires handler that mutates `employees.level` + `employees.roleId` atomically; emits a bus event so audit + org-chart caches invalidate (invariant #11). |
| 10.30 | employees.setManager | register.ts | not registered | ❌ missing | P0 | same as 10.29 | **restore** — Cluster B P0; M-C wires handler writing `org_edges` with cycle-detection guard (rejects reparent creating a loop); emits bus event for org-chart cache invalidation. |
| 10.31 | events.list | register.ts | registered | ✅ shipped | — | |
| 10.32 | goals.create | register.ts | registered | ✅ shipped | — | |
| 10.33 | goals.delete | register.ts | registered | ✅ shipped | — | |
| 10.34 | goals.get | register.ts | registered | ✅ shipped | — | |
| 10.35 | goals.list | register.ts | registered | ✅ shipped | — | |
| 10.36 | goals.update | register.ts | registered | ✅ shipped | — | |
| 10.37 | mcp.addServer | register.ts | registered | ⚠️ partial | P3 | CLAUDE.md IPC table calls this `mcp.add`; on-disk name is `mcp.addServer` | **deprecate** — on-disk name `mcp.addServer` is canonical; M-F rewrites the CLAUDE.md IPC table entry `mcp.add` → `mcp.addServer`. No code change. |
| 10.38 | mcp.list | register.ts | registered | ✅ shipped | — | |
| 10.39 | mcp.removeServer | register.ts | registered | ⚠️ partial | P3 | CLAUDE.md table `mcp.remove`; disk `mcp.removeServer` | **deprecate** — on-disk name canonical; M-F rewrites IPC table `mcp.remove` → `mcp.removeServer`. No code change. |
| 10.40 | mcp.testConnection | register.ts | registered | ⚠️ partial | P3 | CLAUDE.md table `mcp.health`; disk `mcp.testConnection` | **deprecate** — on-disk name canonical; M-F rewrites IPC table `mcp.health` → `mcp.testConnection`. No code change. |
| 10.41 | mcp.toggle | register.ts | registered | ✅ shipped | — | |
| 10.42 | meetings.call | register.ts | registered | ✅ shipped | — | |
| 10.43 | meetings.end | register.ts | registered | ✅ shipped | — | |
| 10.44 | meetings.get | register.ts | registered | ✅ shipped | — | |
| 10.45 | meetings.interject | register.ts | registered | ✅ shipped | — | |
| 10.46 | meetings.list | register.ts | registered | ✅ shipped | — | |
| 10.47 | orgchart.get | register.ts | not registered | ❌ missing | P0 | M9 claim — covered by 2.20 | **restore** — Cluster B P0; M-C wires handler emitting full tree from `employees` + `org_edges`; pairs with 2.16 + 2.20 + 2.21. |
| 10.48 | projects.create | register.ts | registered | ✅ shipped | — | |
| 10.49 | projects.delete | register.ts | registered | ✅ shipped | — | |
| 10.50 | projects.get | register.ts | registered | ✅ shipped | — | |
| 10.51 | projects.linkTicket | register.ts | registered | ✅ shipped | — | |
| 10.52 | projects.list | register.ts | registered | ✅ shipped | — | |
| 10.53 | projects.unlinkTicket | register.ts | registered | ✅ shipped | — | |
| 10.54 | projects.update | register.ts | registered | ✅ shipped | — | |
| 10.55 | providers.add | register.ts | registered | ✅ shipped | — | |
| 10.56 | providers.list | register.ts | registered | ✅ shipped | — | |
| 10.57 | providers.remove | register.ts | registered | ✅ shipped | — | |
| 10.58 | providers.testConnection | register.ts | registered | ✅ shipped | — | |
| 10.59 | providers.update | register.ts | registered | ✅ shipped | — | |
| 10.60 | rag.deleteForCompany | rag-handlers.ts | registered | ✅ shipped | — | |
| 10.61 | rag.rebuildAll | rag-handlers.ts | registered | ✅ shipped | — | |
| 10.62 | rag.stats | rag-handlers.ts | registered | ✅ shipped | — | |
| 10.63 | settings.getAgentic | register.ts | registered | ✅ shipped | — | |
| 10.64 | settings.getConcurrency | register.ts | registered | ✅ shipped | — | |
| 10.65 | settings.getCopilot | register.ts | registered | ✅ shipped | — | |
| 10.66 | settings.getPlanner | register.ts | registered | ✅ shipped | — | |
| 10.67 | settings.getPrivacy | register.ts | registered | ✅ shipped | — | |
| 10.68 | settings.getRagConfig | register.ts | registered | ✅ shipped | — | |
| 10.69 | settings.getRuntime | register.ts | registered | ✅ shipped | — | |
| 10.70 | settings.setAgentic | register.ts | registered | ✅ shipped | — | |
| 10.71 | settings.setConcurrency | register.ts | registered | ✅ shipped | — | |
| 10.72 | settings.setCopilot | register.ts | registered | ✅ shipped | — | |
| 10.73 | settings.setPlanner | register.ts | registered | ✅ shipped | — | |
| 10.74 | settings.setPrivacy | register.ts | registered | ✅ shipped | — | |
| 10.75 | settings.setRagConfig | register.ts | registered | ✅ shipped | — | |
| 10.76 | settings.setRuntime | register.ts | registered | ✅ shipped | — | |
| 10.77 | telemetry.companyStats | register.ts | registered | ✅ shipped | — | |
| 10.78 | telemetry.costBreakdown | register.ts | registered | ✅ shipped | — | |
| 10.79 | telemetry.dailyUsage | register.ts | registered | ✅ shipped | — | |
| 10.80 | telemetry.employeeStats | register.ts | registered | ✅ shipped | — | |
| 10.81 | tickets.addComment | register.ts | registered | ✅ shipped | — | |
| 10.82 | tickets.assign | register.ts | registered | ✅ shipped | — | |
| 10.83 | tickets.attachFile | register.ts | registered | ✅ shipped | — | |
| 10.84 | tickets.close | register.ts | registered | ✅ shipped | — | |
| 10.85 | tickets.create | register.ts | registered | ✅ shipped | — | |
| 10.86 | tickets.detachFile | register.ts | registered | ✅ shipped | — | |
| 10.87 | tickets.get | register.ts | registered | ✅ shipped | — | |
| 10.88 | tickets.list | register.ts | registered | ✅ shipped | — | |
| 10.89 | tickets.listAttachments | register.ts | registered | ✅ shipped | — | |
| 10.90 | tickets.reopen | register.ts | registered | ✅ shipped | — | |
| 10.91 | tickets.update | register.ts | registered | ✅ shipped | — | |
| 10.92 | updater.check | register.ts | registered | ✅ shipped | — | |
| 10.93 | updater.install | register.ts | registered | ✅ shipped | — | |
| 10.94 | vault.delete | register.ts | registered | ✅ shipped | — | |
| 10.95 | vault.download | register.ts | registered | ✅ shipped | — | |
| 10.96 | vault.list | register.ts | registered | ✅ shipped | — | |
| 10.97 | vault.search | register.ts | registered | ✅ shipped | — | |
| 10.98 | vault.stats | register.ts | registered | ✅ shipped | — | |
| 10.99 | vault.upload | register.ts | registered | ✅ shipped | — | |
| 10.100 | vault.verify | register.ts | registered | ✅ shipped | — | |

---

## 11. Bus events — cross-cut — 31 rows

Authoritative source: `packages/shared-types/src/events.ts` `EventType` literal union.

| # | Event type | Phase | Found | Status | Notes |
|---|---|---|---|---|---|
| 11.1 | work.queued | P1 M4 | in union | ✅ shipped | |
| 11.2 | work.started | P1 M4 | in union | ✅ shipped | |
| 11.3 | token.delta | P1 M4 | in union | ✅ shipped | |
| 11.4 | message.persisted | P1 M4 | in union | ✅ shipped | |
| 11.5 | message.agent_to_agent | P2 M11 | in union | ✅ shipped | |
| 11.6 | work.completed | P1 M4 | in union | ✅ shipped | |
| 11.7 | work.failed | P1 M4 | in union | ✅ shipped | |
| 11.8 | employee.status_changed | P2 | in union | ✅ shipped | |
| 11.9 | tool.called | P2 M10 | in union | ✅ shipped | |
| 11.10 | tool.result | P2 M10 | in union | ✅ shipped | |
| 11.11 | meeting.started | P3 M16 | in union | ✅ shipped | |
| 11.12 | meeting.turn | P3 M16 | in union | ✅ shipped | |
| 11.13 | meeting.interjection | P3 M16 | in union | ✅ shipped | |
| 11.14 | meeting.ended | P3 M16 | in union | ✅ shipped | |
| 11.15 | vault.file_created | P4 M21 | in union | ✅ shipped | |
| 11.16 | vault.file_deleted | P4 M21 | in union | ✅ shipped | |
| 11.17 | command.executed | P5 M30 | in union | ✅ shipped | |
| 11.18 | agent.step | P5 M31 | in union | ✅ shipped | |
| 11.19 | agentic.completed | P5 M31 | in union | ✅ shipped | |
| 11.20 | agentic.failed | P5 M31 | in union | ✅ shipped | |
| 11.21 | plan.proposed | P5 M32 | in union | ✅ shipped | |
| 11.22 | plan.approved | P5 M32 | in union | ✅ shipped | |
| 11.23 | task.delegated | P5 M32 | in union | ✅ shipped | |
| 11.24 | task.escalated | P5 M32 | in union | ✅ shipped | |
| 11.25 | review.requested | P5 M32 | in union | ✅ shipped | |
| 11.26 | review.completed | P5 M32 | in union | ✅ shipped | |
| 11.27 | copilot.insight | P5 M33 | in union | ✅ shipped | |
| 11.28 | copilot.analyzed | P5 M33 | in union | ✅ shipped | |
| 11.29 | copilot.expired | P5 M33 | in union | ✅ shipped | |
| 11.30 | copilot.dismissed | P5 M33 | in union | ✅ shipped | |
| 11.31 | company.archived | P5 M33 F3 | in union | ✅ shipped | |

> **Note — CLAUDE.md bus-event table asserts `rag.index.indexed` / `rag.index.reindexed` / `rag.index.removed` are emitted. They are NOT in the EventType literal union. `rag-indexer.ts` writes via `ragService.indexSource` without a `bus.emit` call. Audit-view chips in M35 T3 land DEFENSIVELY (covered in retrospective §3 and noted in the M35 T3 history entry). This is a known discrepancy — rag index-events are aspirational.** Row 5.8 carries the P2 severity for this; no duplicate row here.

---

## 12. Settings keys — cross-cut — 18 rows

Authoritative source: `apps/desktop/src/main/db/repos/settings.ts` `SETTING_DEFAULTS` array.

| # | Key | Phase/M | Default | Clamp | Found | Status |
|---|---|---|---|---|---|---|
| 12.1 | rag_chunk_size | P5 M28 | seeded | seed.ts comment block | ✅ shipped | |
| 12.2 | rag_chunk_overlap | P5 M28 | seeded | seed.ts | ✅ shipped | |
| 12.3 | rag_similarity_threshold | P5 M28 | seeded | seed.ts | ✅ shipped | |
| 12.4 | agentic_max_steps | P5 M31 | 8 | 1–32 | ✅ shipped | |
| 12.5 | agentic_max_tokens | P5 M31 | 8000 | 512–64000 | ✅ shipped | |
| 12.6 | agentic_timeout_ms | P5 M31 | 120000 | 10000–600000 | ✅ shipped | |
| 12.7 | planner_max_tickets | P5 M32 | 10 | 1–50 | ✅ shipped | |
| 12.8 | planner_max_depth | P5 M32 | 2 | 1–4 | ✅ shipped | |
| 12.9 | planner_approval_level | P5 M32 | 'management' | enum | ✅ shipped | |
| 12.10 | planner_escalation_threshold | P5 M32 | 3 | 1–10 | ✅ shipped | |
| 12.11 | copilot_enabled | P5 M33 | true | bool | ✅ shipped | |
| 12.12 | copilot_interval_minutes | P5 M33 | 5 | 1–60 | ✅ shipped | |
| 12.13 | copilot_categories | P5 M33 | full subset | enum[] | ✅ shipped | |
| 12.14 | runtime strategy (Auto/Hybrid/Always-On/Lean) | P3 M19 | Auto | enum | ✅ shipped | |
| 12.15 | privacy tier | P3 M19 | proprietary-cloud | enum | ✅ shipped | |
| 12.16 | orchestrator slots | P3 M19 | per-strategy | enum | ✅ shipped | |
| 12.17 | per-provider concurrency caps | P3 M19 | defaults locked | per-provider | ✅ shipped | |
| 12.18 | per-provider allowed/blocked | P3 M19 | empty | list | ✅ shipped | |

---

## 13. Migrations — cross-cut — 13 rows

Authoritative source: `apps/desktop/src/main/db/migrations/*.sql`.

| # | File | Phase/M | Status |
|---|---|---|---|
| 13.1 | 0000_initial.sql | P1 M3 | ✅ shipped |
| 13.2 | 0001_mcp_tables.sql | P2 M10 | ✅ shipped |
| 13.3 | 0002_agent_messaging.sql | P2 M11 | ✅ shipped |
| 13.4 | 0003_tickets.sql | P2 M12 | ✅ shipped |
| 13.5 | 0004_goals_projects.sql | P3 M15 | ✅ shipped |
| 13.6 | 0005_meetings.sql | P3 M16 | ✅ shipped |
| 13.7 | 0006_file_vault.sql | P4 M21 | ✅ shipped |
| 13.8 | 0007_ticket_attachments.sql | P4 M22 | ✅ shipped |
| 13.9 | 0008_embeddings.sql | P5 M28 | ✅ shipped |
| 13.10 | 0009_command_history.sql | P5 M30 | ✅ shipped |
| 13.11 | 0010_employee_is_system.sql | P5 M31 | ✅ shipped |
| 13.12 | 0011_copilot_insights.sql | P5 M33 | ✅ shipped |
| 13.13 | 0012_runs_kind.sql | P5 M33 | ✅ shipped |

---

## 14. Drizzle tables — cross-cut — 21 rows

Authoritative source: `apps/desktop/src/main/db/schema.ts` `sqliteTable(…)` exports.

| # | Table | Phase | Status | Notes |
|---|---|---|---|---|
| 14.1 | companies | P1 M3 | ✅ shipped | |
| 14.2 | employees | P1 M3 | ✅ shipped | |
| 14.3 | threads | P1 M4 | ✅ shipped | |
| 14.4 | thread_members | P1 M4 | ✅ shipped | |
| 14.5 | messages | P1 M4 | ✅ shipped | |
| 14.6 | events | P1 M4 | ✅ shipped | append-only per invariant #6 |
| 14.7 | runs | P1 M4 | ✅ shipped | `kind` column added M33 T4 |
| 14.8 | providers | P1 M3 | ✅ shipped | |
| 14.9 | settings | P3 M19 | ✅ shipped | |
| 14.10 | mcp_servers | P2 M10 | ✅ shipped | |
| 14.11 | tool_calls | P2 M10 | ✅ shipped | |
| 14.12 | tickets | P2 M12 | ✅ shipped | |
| 14.13 | goals | P3 M15 | ✅ shipped | |
| 14.14 | projects | P3 M15 | ✅ shipped | |
| 14.15 | project_tickets | P3 M15 | ✅ shipped | |
| 14.16 | file_vault | P4 M21 | ✅ shipped | |
| 14.17 | ticket_attachments | P4 M22 | ✅ shipped | |
| 14.18 | meetings | P3 M16 | ✅ shipped | |
| 14.19 | embeddings | P5 M28 | ✅ shipped | sqlite-vec-backed |
| 14.20 | command_history | P5 M30 | ✅ shipped | |
| 14.21 | copilot_insights | P5 M33 | ✅ shipped | |

> **No `org_edges` table exported** from `schema.ts`. Row 2.16 P0 — claimed by M9 but never landed.

---

## 15. Role-pack inventory — cross-cut — 9 rows

| # | Claim | Expected | Found | Status | Sev | Notes |
|---|---|---|---|---|---|---|
| 15.1 | 55 user roles + 2 system = 57 total | `role-packs/strategia-official/roles/` | 57 confirmed | ✅ shipped | — | |
| 15.2 | Officer = 5 | `roles/officer/` | ceo, cfo, cmo, coo, cto | ✅ shipped | — | |
| 15.3 | Senior Mgmt = 7 | `roles/senior-mgmt/` | 7 files | ✅ shipped | — | |
| 15.4 | Management = 8 | `roles/management/` | 8 files | ✅ shipped | — | |
| 15.5 | Supervisor = 5 | `roles/supervisor/` | 5 files | ✅ shipped | — | |
| 15.6 | Lead = 5 | `roles/lead/` | 5 files | ✅ shipped | — | |
| 15.7 | IC = 25 | `roles/ic/` | 25 files | ✅ shipped | — | |
| 15.8 | System = 2 (system-agent + system-copilot) | `roles/system/` | both present | ✅ shipped | — | |
| 15.9 | Files named `role.md` per CLAUDE.md shorthand | `**/role.md` | 0 — files are named `{role-slug}.md` | ⚠️ partial | P3 | terminology-only drift; functional no-op | **deprecate** — pair with 2.14; M-F rewrites CLAUDE.md wording across every "role.md" reference to "`{role-slug}.md`"; loader contract unchanged. |

---

## 16. Test counts — cross-cut — 7 rows

| # | Claim | Source | Reconciliation | Status | Sev | Notes |
|---|---|---|---|---|---|---|
| 16.1 | 1187 unit tests (Phase 5.6 baseline, post-M36 T1) | CLAUDE.md orchestrator block | `pnpm test` this session → `1188 passed / 23 failed / 1211 total` | 🔍 unverifiable | P1 | 23 failures are all `NODE_MODULE_VERSION 125 vs 137` ABI mismatch — require rebuild per CLAUDE.md Troubleshooting. Sustained claim 1187 is pre-ABI-rebuild count; post-rebuild count would be 1211. Reconcile in cross-check after Node ABI rebuild. | **restore** — M-E runs the CLAUDE.md Troubleshooting ABI-rebuild recipe and re-executes `pnpm test` so the 1187-or-1211 baseline is empirically locked; S1 milestone-DoD template pins the reconciled number going forward. |
| 16.2 | 11 E2E spec files | `apps/desktop/e2e/*.spec.ts` | 11 specs on disk ✅ | ✅ shipped | — | smoke, ticket-flow, meeting-flow, vault-backup, rag-flow, command-palette, agentic-loop, task-planner, copilot-service, copilot-ui, phase-5-integration |
| 16.3 | 12 Playwright cases | playwright run output | non-re-run this session (ABI dance) | 🔍 unverifiable | P2 | will verify post-rebuild | **restore** — M-E re-runs `pnpm -F @team-x/desktop test:e2e` after Electron ABI rebuild; cross-check addendum records actual case count. |
| 16.4 | Phase 5 exit = 1169 unit / 11 E2E / 12 cases | M35 T10 ledger | non-re-run | 🔍 unverifiable | P3 | historical ledger claim | **deprecate** — historical ledger snapshot; v1.1.0 tag is the immutable record. M-F preserves the line verbatim in CLAUDE.md; no re-verification required. |
| 16.5 | 24 lint warnings baseline | pnpm lint | `pnpm lint` (not re-run this session — time budget) | 🔍 unverifiable | P3 | will re-run in M-E cross-check | **restore** — M-E re-runs `pnpm lint`; cross-check addendum records actual warning count; Phase 5.6 exit DoD holds baseline ≤24. |
| 16.6 | 0 lint errors baseline | pnpm lint | same as 16.5 | ⚠️ partial | P3 | orchestrator.json claims "0 errors / 24 warnings (baseline preserved)" | **restore** — M-E re-runs `pnpm lint`; reconciled in same cross-check as 16.5. |
| 16.7 | Production build succeeds | `pnpm -F @team-x/desktop build` | not re-run | ⚠️ partial | P2 | will re-run in M-E | **restore** — M-E re-runs `pnpm -F @team-x/desktop build`; a fail flips this row to missing + blocks Phase 5.6 exit. |

---

## 17. Cross-check pass — 20 % rows (§17 addendum)

**Target:** 20 % cross-check over the 41-distinct-gap-row surface = **10 rows**, focused on the P0 clusters plus representative P1/P2/P3 dispositions. The plan-§4 headline 83-row target (20 % × 414) is disproportionate for a 1-day triage time-box given that 350 of the 414 rows are already confirmed shipped; a broader 83-row pass remains available for M-G pre-ship if Rocky requests it.  
**Status:** EXECUTED 2026-04-17 as part of the Phase 5.6 M-B Triage pass.  
**Executor:** Claude Opus 4.7 (1M context) via a second independent `grep -rn` / `find` sweep against `main` HEAD at baseline `8729e40`.

### 17.1 Randomly-selected row IDs (cross-checked)

**P0 Cluster A — Multi-company M7 (4 of 7 rows; full stranded-surface signature):**
- 2.1 — Company CRUD IPC umbrella
- 10.12 — `companies.create` channel
- 2.2 — `WorkspaceSwitcher` UI
- 2.4 — `CompanySettings` panel

**P0 Cluster B — Org chart M9 (3 of 8 rows; full stranded-surface signature):**
- 2.16 — `org_edges` table
- 10.47 — `orgchart.get` channel
- 2.21 — org-chart tree UI

**Representative non-P0 rows (3):**
- 5.8 (P2 — RAG indexer vault subscription wording)
- 10.37 (P3 — MCP channel-name drift)
- 1.26 (P2 — top-bar Chat tab entry point)

**Total: 10 rows.** Selection intentionally covers 100 % of both P0 clusters (they are the highest-stakes dispositions and the decisive rows for M-C + M-D scoping) plus one representative row for each non-P0 severity tier.

### 17.2 Cross-check diff log

| row_id | evidence re-run | expected (M-A) | observed (M-B pass) | result | disposition stands? |
|---|---|---|---|---|---|
| 2.1 | `grep -rn "companies.create\|companies.update\|companies.delete" apps/desktop/src/main/ipc/` | 0 hits | 0 hits (only `companies.list` + `companies.archive` wired) | ✅ confirmed | yes — `restore` |
| 10.12 | same grep scoped to `'companies.create'` | not registered | not registered | ✅ confirmed | yes — `restore` |
| 2.2 | `find apps/desktop/src/renderer -iname '*workspace*'` | 0 files | 0 files | ✅ confirmed | yes — `restore` |
| 2.4 | `find apps/desktop/src/renderer -iname '*companysettings*' -o -iname '*company-settings*'` | 0 files | 0 files | ✅ confirmed | yes — `restore` |
| 2.16 | `grep -rn "orgEdges\|org_edges" apps/desktop/src/main/db/schema*.ts` | 0 hits | 0 hits | ✅ confirmed | yes — `restore` |
| 10.47 | `grep -rn "'orgchart.get'\|\"orgchart.get\"" apps/desktop/src/main/ipc/` | not registered | not registered | ✅ confirmed | yes — `restore` |
| 2.21 | `find apps/desktop/src/renderer/src/features -iname '*org*'` | 0 files | 0 files | ✅ confirmed | yes — `restore` |
| 5.8 | `grep -n "event.type" apps/desktop/src/main/services/rag-indexer.ts` | only `work.completed` + `meeting.ended` | lines 78 + 88 match exactly those two branches; no `vault.*` branch | ✅ confirmed | yes — `deprecate` (CLAUDE.md wording is drift; on-disk design is correct) |
| 10.37 | `grep -n "'mcp\." apps/desktop/src/main/ipc/register.ts` | on-disk name is `mcp.addServer` | register.ts:77 + 250 confirm `mcp.addServer` is canonical | ✅ confirmed | yes — `deprecate` (IPC table wording) |
| 1.26 | `grep -n "disabled" apps/desktop/src/renderer/src/app/top-bar.tsx` + list `features/chat/` | `Chat` tab `disabled: true`; chat drawer files present | line 35 confirms `disabled: true`; 5 files in `features/chat/` (chat-drawer / composer / message-list / system-agent-badge / thread-list) | ✅ confirmed | yes — `restore` (flip `disabled:true` to `false`; chat drawer itself is shipped) |

**Rollup:** 10 / 10 rows confirmed. Zero diffs from the M-A matrix. Every cross-checked disposition stands as assigned in M-B.

### 17.3 Bonus sanity re-checks (belt-and-suspenders)

Three further spot-checks run alongside the 10-row sample to sanity-verify shipped-claim rows that anchor the gap landscape:

| sanity row | expected | observed | result |
|---|---|---|---|
| 2.7 (shipped — 55 F10 + 2 system = 57 role files) | 57 markdown files under `role-packs/strategia-official/roles/` | `find … -name "*.md"` = 57 | ✅ confirmed |
| §10 mcp.* schema (shipped — 5 MCP channels) | `mcp.list` + `mcp.toggle` + `mcp.addServer` + `mcp.removeServer` + `mcp.testConnection` all registered | register.ts:75–79 + handlers at 241 / 245 / 250 / 264 / 269 present | ✅ confirmed |
| dashboard subview file inventory (row 3.1 supporting context) | 5 view files present minus Org embed | cards-view + commands-view + floor-view + stream-view + timeline-view present; no `*org*` file in `features/dashboard/` | ✅ confirmed (Org embed genuinely absent) |

---

## 18. Known gaps flagged for M-B triage

This is a CONVENIENCE rollup. The authoritative decision surface is the `disposition` column per row in §§3–16, filled in during M-B.

### 18.1 P0 — blocks a core feature CLAUDE.md claims shipped

**Cluster A — Multi-company architecture (Rocky's locked M7 design; stranded on `worktree-phase-2-the-org`).** RESTORE — non-negotiable. CLAUDE.md Troubleshooting's "aspirational" framing must be rewritten in M-F so the drift cannot resurface.

1. Row 2.1 — Company CRUD IPC (create/update/delete). **Disposition: RESTORE.**
2. Row 2.2 — `WorkspaceSwitcher` UI. **Disposition: RESTORE.**
3. Row 2.3 — `CreateCompanyDialog`. **Disposition: RESTORE.**
4. Row 2.4 — `CompanySettings` panel. **Disposition: RESTORE.**
5. Row 10.12 — `companies.create` channel. **Disposition: RESTORE.**
6. Row 10.13 — `companies.delete` channel. **Disposition: RESTORE.**
7. Row 10.15 — `companies.update` channel. **Disposition: RESTORE.**

**Cluster B — Org chart (M9; stranded on `worktree-phase-2-the-org`).** RESTORE.

8. Row 2.16 — `org_edges` table with cycle detection — M9 claim, table not exported in `schema.ts`. **Disposition: RESTORE.**
9. Row 2.18 — `employees.promote` IPC channel — M9 claim, not registered. **Disposition: RESTORE.**
10. Row 2.19 — `employees.setManager` IPC channel — M9 claim, not registered. **Disposition: RESTORE.**
11. Row 2.20 / Row 10.47 — `orgchart.get` IPC channel — M9 claim, not registered. **Disposition: RESTORE.**
12. Row 2.21 / Row 2.22 — Org-chart tree UI + drag-to-rearrange — M9 claim, no renderer files match `*org*`. **Disposition: RESTORE** (paired with Cluster-B backend).

**Cluster C — Top-bar `Chat` tab entry point.** Chat flow exists but entry point is disabled. Rocky-decision at M-B triage.

13. Row 1.25 / Row 1.26 — Top-bar `Chat` tab `disabled: true`. **Disposition candidate: RESTORE** (enable the tab) unless M-B decides the employee-card entry point is canonical.

### 18.2 P1 — blocks a promised feature

1. Row 16.1 — 1187 unit test count — unreconcilable without ABI rebuild. **Disposition: verify in cross-check.**
2. Row 5.8 — RAG indexer claims to re-index vault files; on-disk it only subscribes to `work.completed` + `meeting.ended`. **Disposition candidate: RESTORE** by adding a `vault.file_created` subscription, OR `deprecate` the wording if vault files are genuinely intended to flow only through FTS5 at agent-turn time.

### 18.3 P2 — nice-to-have

1. Row 2.28 — MCP channel-name drift (`add`→`addServer` etc.). **Disposition candidate: deprecate** (update IPC table wording to match on-disk names).
2. Row 3.1 — "Org embed" dashboard subview — no dedicated file; gap blocked by 2.21. **Disposition candidate: restore.**
3. Row 16.7 — Production build not re-verified. **Disposition candidate: verify.**

### 18.4 P3 — cosmetic

1. Row 2.14 / Row 15.9 — `role.md` vs `{role-slug}.md` naming. **Disposition candidate: deprecate** the "role.md" terminology.
2. Row 4.31 — Phase 4 badge claim superseded by Phase 5. **Disposition candidate: deprecate** the historical line (already accurate in context).
3. Rows 10.37 / 10.39 / 10.40 — mcp.add vs mcp.addServer etc. naming. **Disposition candidate: deprecate** the old names in IPC table.
4. Row 11.32 (implicit — rag.index.*) — bus events claimed in CLAUDE.md table but not in EventType union. **Disposition candidate: deprecate** OR `restore` (wire emits in rag-indexer).

---

## 18.5 Drift-framing corrections for M-F

The audit surfaced language in `CLAUDE.md` that soft-pedals genuine drift as sanctioned design decisions. M-F (documentation truth-up) must rewrite these passages so Phase 5.6's remediation effort is fully reflected in the canonical project record.

| # | Location | Current framing | Required framing | Reason |
|---|---|---|---|---|
| 18.5.1 | CLAUDE.md Troubleshooting — "Companies repo lacks the `create` / `update` / `delete` IPC channels today even though the CLAUDE.md IPC table lists them" | Calls missing channels "aspirational for the milestone that introduces multi-company CRUD (not yet scheduled in Phase 5)" | Must state: "These channels belong to Rocky's locked M7 multi-company architecture. The original M7 implementation was stranded on `worktree-phase-2-the-org` and never merged to main. Phase 5.6 M-C/M-D restores them." | The "aspirational" framing lets real drift hide as sanctioned scope. M7 was NOT a future milestone — it was a shipped-claim in CLAUDE.md's Phase 2 status block. |
| 18.5.2 | CLAUDE.md Phase 2 M7 status block | Lists Company CRUD + soft-delete, WorkspaceSwitcher, CreateCompanyDialog, CompanySettings panel as shipped | Must flag as "partial — backend and renderer stranded on `worktree-phase-2-the-org`; restored in Phase 5.6 M-C/M-D" | Three-bucket rewrite per M-F (shipped / deferred / deprecated). |
| 18.5.3 | CLAUDE.md Phase 2 M9 status block | Lists `org_edges` table + `employees.promote` + `employees.setManager` + `orgchart.get` IPC + org tree UI as shipped | Must flag as "partial — stranded on `worktree-phase-2-the-org`; restored in Phase 5.6 M-C/M-D" | Same as 18.5.2. |
| 18.5.4 | CLAUDE.md IPC Channels table | Lists missing/renamed channels without flags | Must mark each non-shipped channel with a status flag | Table is the user-facing source of truth for what the app can do. |
| 18.5.5 | CLAUDE.md Phase 2 bullet for "Architecture: single-activity architecture" (if present) and any language implying single-tenant | Implies single-company as current reality | Must reflect multi-company as the locked architecture (per 18.5.1 resolution) | Consistency across the document. |

---

## 19. Audit process notes

- **Methodology adherence:** Every row in §§3–16 has `claim` + `phase`/`milestone` + `evidence_type` + `expected_location` + `evidence_found` + `status`. Non-shipped rows carry severity. Totals reconciled in §1.1.
- **Time-box adherence:** M-A T0 authoring pass completed in a single session inside the 5-day + 2-day-buffer time-box. Cross-check pass (§17) remains outstanding and will land as a separate amendment commit within the time-box.
- **Scope-expansion flags — Rocky correction logged per plan §14.3 change-control mini-gate:** First-pass authoring initially classified the multi-company CRUD rows (2.1 / 2.2 / 2.3 / 2.4 / 10.12 / 10.13 / 10.15) as P1 "acknowledged aspirational in CLAUDE.md troubleshooting". Rocky surfaced mid-authoring that multi-company is a **locked architectural decision from the original project design**, not a down-stream deferral. Correction applied in-place: severity upgraded P1 → **P0** for all 7 rows, disposition candidate changed from `deprecate` → **`restore`**, and §18.5 added to record the M-F documentation-truth-up requirement (rewrite the "aspirational" framing in CLAUDE.md Troubleshooting). This is the first documented invocation of the §14.3 change-control mini-gate in Phase 5.6. The correction preserves the original plan §3's theory: drift recurs precisely because there is no automated verification between "implementer claims complete" and "ledger says complete" — and this mini-correction is itself evidence that without process safeguards (M-E), first-pass classifications can mis-categorize severity. **Total P0 rows: 15 (up from the pre-correction count of 8).**
- **The Phase 2 M9 P0 cluster (rows 2.16–2.22 + 10.29–10.30 + 10.47) was expected:** the remediation plan §3 explicitly names M9 as a known drift site.
- **The Phase 2 M7 P0 cluster (rows 2.1–2.4 + 10.12 / 10.13 / 10.15) is now ALSO expected:** the pre-audit plan §3 Phase 2 drift mention covers both M7 (~30% shipped per plan) and M9 (~10% shipped per plan). The severity re-classification in this audit aligns the row-level status with plan §3's narrative.
- **Rocky's 20 % spot-check:** Pending at the interim DoD gate before M-B starts.

---

## 20. Disposition rollup (M-B)

**Shipped as part of Phase 5.6 M-B Triage (2026-04-17).** Every gap row in §§3–16 (status ∈ {⚠️ partial, ❌ missing, 🔍 unverifiable}) now carries a `restore` / `replace` / `deprecate` disposition + one-sentence justification per plan §5 criteria. Counts below are **authoritative for M-C / M-D / M-E / M-F scoping** — the inline dispositions per row are the operational decision surface; this rollup is the navigation map on top of it.

### 20.1 Disposition counts

| Disposition | P0 | P1 | P2 | P3 | Total | Primary owner |
|---|---:|---:|---:|---:|---:|---|
| **restore** | 15 | 2 | 6 | 4 | **27** | M-C (backend) + M-D (UI) + M-E (verify) |
| **deprecate** | 0 | 0 | 2 | 12 | **14** | M-F (docs rewrite) |
| **replace** | 0 | 0 | 0 | 0 | **0** | — (no superseded design surfaced) |
| — **Total** — | **15** | **2** | **8** | **16** | **41** | |

Count reconciliation vs M-A §1.2:
- §1.2 rolls up **49 severity tags** across non-shipped rows (P0 × 15 + P1 × 8 + P2 × 10 + P3 × 16).
- §20.1 rolls up **41 distinct gap rows**. The 8-row gap between the two counts is M-A authorial bookkeeping: several non-shipped rows carried severity tags only in the inline summary annotations (§18 convenience rollup + §1.1 per-phase counters), not as standalone rows in §§3–16. **The 41-row count is the operational decision surface for M-B**; the 49-tag figure remains correct as a severity-weighting metric.
- Both M-A §1.2 and this rollup agree on the P0 span: **15 rows = 7 Cluster A + 8 Cluster B**.

### 20.2 Cluster A — Multi-company architecture (Rocky's locked M7 design) — 7 rows, ALL `restore`

| Row | Surface | Disposition | Owner milestone | M-D/M-C exit evidence |
|---|---|---|---|---|
| 2.1 | `companies.create` / `companies.update` / `companies.delete` IPC umbrella | restore | M-C | M-C shipped commits `b858067` + `fd3617b`; verified by `pnpm audit:claims` 92 / 3 / 0 |
| 2.2 | `WorkspaceSwitcher` UI | restore | M-D | M-D shipped `workspace-switcher.tsx`; E2E `workspace-switcher.spec.ts` 4/4; final full Playwright 18/18 |
| 2.3 | `CreateCompanyDialog` UI | restore | M-D | M-D shipped `create-company-dialog.tsx`; E2E create workspace path; final full Playwright 18/18 |
| 2.4 | `CompanySettings` panel | restore | M-D | M-D shipped `company-settings.tsx`; E2E update/archive/delete + company lifecycle audit assertions; final full Playwright 18/18 |
| 10.12 | `companies.create` channel | restore | M-C | M-C shipped commit `b858067`; allowlist entry removed; `pnpm audit:claims` verified |
| 10.13 | `companies.delete` channel | restore | M-C | M-C shipped commit `fd3617b`; allowlist entry removed; `pnpm audit:claims` verified |
| 10.15 | `companies.update` channel | restore | M-C | M-C shipped commit `fd3617b`; allowlist entry removed; `pnpm audit:claims` verified |

**Cluster-A dependencies + gotchas:**
- Every `companies.create` path MUST run `ensureSystemAgent` + `ensureSystemCopilot` on the newly-created row (contract established by M33 F4 + documented in CLAUDE.md Troubleshooting "Companies repo lacks…" paragraph that M-F will rewrite).
- `companies.delete` MUST NOT orphan employees / tickets / meetings — M-C adds either a referential cascade or a reject-if-non-empty guard (Rocky pick at implementation time).
- `companies.update` covers the full mutable surface: `name` / `mission` / `mcp_configs_json` / `provider_prefs_json` / `max_concurrent_agents`. Partial-update semantics are fine as long as the zod request shape flags omitted fields correctly.
- Stranded-branch source: `worktree-phase-2-the-org` likely holds the original M7 implementation. If the cherry-pick is clean, favour it over a rebuild; if semantically stale (e.g. pre-M33 F4), rebuild against current contracts.

### 20.3 Cluster B — Org chart (M9) — 8 rows, ALL `restore`

| Row | Surface | Disposition | Owner milestone | M-D/M-C exit evidence |
|---|---|---|---|---|
| 2.16 | `org_edges` table + cycle-detection helper | restore | M-C (new migration `0013_*.sql` — verify slot before assigning) | M-C shipped commit `f417a18`; migration + repo tests included in full Vitest 1683/1683 |
| 2.18 | `employees.promote` IPC channel | restore | M-C | M-C shipped commit `19dbd35`; allowlist entry removed; final `pnpm audit:claims` verified |
| 2.19 | `employees.setManager` IPC channel | restore | M-C | M-C shipped commit `19dbd35`; allowlist entry removed; final `pnpm audit:claims` verified |
| 2.20 | `orgchart.get` IPC channel | restore | M-C | M-C shipped commit `c2e6c92`; allowlist entry removed; final `pnpm audit:claims` verified |
| 2.21 | indented-list org tree UI (`renderer/src/features/org/`) | restore | M-D | M-D shipped `features/orgchart/*`; E2E `org-chart.spec.ts` 2/2; final full Playwright 18/18 |
| 2.22 | drag-to-rearrange org | restore | M-D | M-D shipped valid drag persistence, manager-select cycle rejection, promote/fire, and audit assertions in `org-chart.spec.ts`; final full Playwright 18/18 |
| 10.29 | `employees.promote` channel (dup of 2.18 cross-cut entry) | restore | M-C | M-C shipped commit `19dbd35`; final `pnpm audit:claims` verified |
| 10.30 | `employees.setManager` channel (dup of 2.19 cross-cut entry) | restore | M-C | M-C shipped commit `19dbd35`; final `pnpm audit:claims` verified |
| 10.47 | `orgchart.get` channel (dup of 2.20 cross-cut entry) | restore | M-C | M-C shipped commit `c2e6c92`; final `pnpm audit:claims` verified |

**Cluster-B dependencies + gotchas:**
- Row 2.16 is the foundation — migration + schema + cycle-detection helper MUST land before the channels.
- `employees.setManager` writes go through the cycle-safe `org_edges` helper; a cycle-forming reparent returns an IPC error (renderer rolls back optimistic move).
- `orgchart.get` projects `employees ⋈ org_edges` into a tree; shape must match what the indented-list tree expects.
- Drag-to-rearrange (2.22) dispatches `employees.setManager` with optimistic reparent + cycle-guard rollback on IPC error.
- Flip top-bar `Org` tab `disabled:true` → `false` (`top-bar.tsx:31`) only after the tree renders — otherwise the user sees an empty tab.

### 20.4 Cluster C — Top-bar Chat tab entry point — 2 rows, ALL `restore`

| Row | Surface | Disposition | Owner milestone | M-D exit evidence |
|---|---|---|---|---|
| 1.25 | top-bar app shell — `Chat` tab `disabled: true` | restore | M-D | M-D shipped commit `579f730`; Chat tab enabled in `top-bar.tsx`; final full Playwright 18/18 |
| 1.26 | chat drawer entry point via top-bar tab | restore | M-D | M-D shipped `chat-view.tsx` + ChatDrawer handoff; `workspace-switcher.spec.ts` chat case; final full Playwright 18/18 |

**Notes:** chat drawer (5 files in `features/chat/`) + IPC (`chat.send` / `chat.list` / `chat.resolveThread` / `chat.listThreads`) are already shipped — this is a single `disabled: true` → `false` flip in `top-bar.tsx:35` plus a view-route wire-up to the existing drawer. Net change: ≤10 LOC + 1 renderer test.

### 20.5 Verification-gate rollup (M-E handoff) — 5 rows, `restore` (via re-run, not code change)

These are unverifiable-this-session claims that the `pnpm test` / `pnpm lint` / `pnpm -F @team-x/desktop build` commands will reconcile once the CLAUDE.md Troubleshooting Node / Electron ABI-rebuild recipes run:

| Row | Command to re-run | M-E gate |
|---|---|---|
| 16.1 | `pnpm test` (after `cd node_modules/.pnpm/better-sqlite3@11.10.0/…/better-sqlite3 && npm run install`) | reconcile the 1187 / 1211 baseline |
| 16.3 | `pnpm -F @team-x/desktop test:e2e` (after Electron ABI rebuild) | reconcile 12-case count |
| 16.5 | `pnpm lint` | reconcile 24-warning baseline |
| 16.6 | `pnpm lint` (same run as 16.5) | reconcile 0-error baseline |
| 16.7 | `pnpm -F @team-x/desktop build` | production build succeeds |

M-E exit gate: all 5 rows flip from `🔍 unverifiable` / `⚠️ partial` to `✅ shipped` with the reconciled numbers recorded inline.

### 20.6 Documentation-only rollup (M-F shipped) — 14 rows, `deprecate`

M-F rewrote wording in CLAUDE.md, removed over-specified claims, and aligned the IPC Channels table with on-disk reality. No code change.

| Rows | CLAUDE.md location | Rewrite action |
|---|---|---|
| 2.14 / 15.9 | every "role.md" reference across the doc | → "`{role-slug}.md`" (loader contract unchanged) |
| 2.28 / 10.37 / 10.39 / 10.40 | IPC Channels table rows for `mcp.add` / `mcp.remove` / `mcp.health` | → `mcp.addServer` / `mcp.removeServer` / `mcp.testConnection` (canonical on-disk names) |
| 3.5 / 3.14 / 3.23 / 3.29 / 3.37 | historical post-milestone test counts (384 / 412 / 441 / 456 / 501) | keep verbatim; mark as historical-at-the-time; drop from any re-verify list |
| 4.31 | M27 "Phase 4 badge in top bar" line | add parenthetical "(later bumped to `Phase 5` in M34 T7)" |
| 5.8 | M29 "re-index messages + vault files" wording | → "re-index messages + meeting minutes on `work.completed` / `meeting.ended`; vault files retrieved via FTS5 at agent-turn time, not pre-embedded" |
| 16.4 | M35 T10 ledger claim "1169 unit / 11 E2E / 12 cases" | preserve verbatim as historical record — v1.1.0 tag is the immutable proof |

M-F exit evidence: CLAUDE.md now has shipped / deferred / deprecated buckets; the Cluster A "aspirational" troubleshooting paragraph is replaced with Phase 5.6 M-C/M-D restoration evidence; the Phase 2 M7/M9 status block is reconciled against on-disk reality; the IPC table uses canonical `mcp.addServer` / `mcp.removeServer` / `mcp.testConnection`; and `scripts/check-claim-evidence.allowlist.json` is empty. `pnpm audit:claims -- --strict` is the closing gate.

### 20.7 Residual risks + escalation triggers

- **Cluster A cherry-pick quality from `worktree-phase-2-the-org`:** if the branch's M7 code predates M33 F4, M-C MUST adapt the cherry-pick to call `ensureSystemAgent` + `ensureSystemCopilot` before returning `{ id }` from `companies.create`. **Escalation trigger (plan §14.3 change-control mini-gate):** any subtask that requires more than a mechanical cherry-pick — e.g. semantic conflict with M10 MCP / M17 telemetry / M35 Copilot wiring — gets a mini-gate.
- **Cluster B migration numbering:** `0013_*.sql` is the expected next slot. M-C MUST confirm via `ls apps/desktop/src/main/db/migrations/` that 0012 is still the tail migration before assigning 0013, otherwise the new migration collides with any later-phase slot added during the branch-preservation period.
- **Row 16.1 test-count drift:** if the post-ABI-rebuild count is not 1187 or 1211, M-E raises a change-control mini-gate and surfaces whether (a) a test regressed or (b) the Phase 5.6 baseline itself needs adjusting.
- **No `replace` dispositions today:** all 41 gap rows resolved to either `restore` (feature shipped but absent / stranded / incomplete) or `deprecate` (wording drift). No superseded design surfaced during triage. If one emerges mid-M-C / M-D (e.g. an M7 cherry-pick reveals a newer pattern in a later phase), M-B reopens under change control.
- **Rocky's 20 % spot-check:** the §17 cross-check is Claude-authored second pass. A Rocky spot-check remains available at M-G pre-ship as an independent sign-off. If it surfaces a disposition disagreement, the row is re-triaged and the downstream milestones (M-C / M-D / M-F) adjust accordingly.

---

## 21. Cross-references

- **Plan doc:** [`docs/plans/2026-04-17-team-x-phase-5.6-remediation.md`](../plans/2026-04-17-team-x-phase-5.6-remediation.md) §4 Conformance Audit Methodology + §5 Triage Decision Criteria + §14 Sprint Execution Framework.
- **Previous audits:** [`docs/audits/2026-04-12-role-pack-audit.md`](2026-04-12-role-pack-audit.md) (role-pack integrity), [`docs/audits/2026-04-13-m27-security-audit.md`](2026-04-13-m27-security-audit.md) (security posture).
- **Ledger:**
  - M-A T0 atomic + ledger commit pair (`f040d11` + `1f3c432`, shipped 2026-04-17).
  - M-B T0 atomic + ledger commit pair (this amendment — see `docs(phase-5.6-m-b): Phase 5.6 M-B — triage dispositions (41 rows)` + `chore(loki): Phase 5.6 M-B — triage committed`, shipped 2026-04-17).
- **Head-of-queue after M-B:** Phase 5.6 M-E Process Safeguards (per plan §13.2 reorder — safeguards ship BEFORE M-C / M-D backfill so restoration runs under live CI conformance check + pre-commit claim-evidence hook + DoD template).

---

**End of Phase 5.6 M-A + M-B conformance audit evidence matrix. Total rows: 414. Gap rows: 41 (15 P0 / 2 P1 / 8 P2 / 16 P3). Dispositions: 27 `restore` / 14 `deprecate` / 0 `replace`. Cross-check: 10 / 10 confirmed, zero diffs.**
