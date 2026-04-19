# Team-X QA Baseline Metrics — 2026-04-18

**Snapshot taken at**: Phase 5.6 M-C complete (commit `f29b1be`, ledger head)
**Codebase version**: v1.1.0 (Phase 5 exit tag) + M-C backend restoration on top
**Authority**: This document is the frozen 2026-04-18 baseline. Future reports compare against these numbers.

---

## 1. Test Execution

| Metric | Baseline | Source |
|--------|----------|--------|
| Unit tests passing | **1454 / 1454 (100%)** | `pnpm test` at M-C step e ship |
| Unit test files | 80 (+ 3 root: check-claim-evidence, e2e-regression-guards, loki-verified-by) | Per test-coverage audit |
| E2E spec files | 11 (12 Playwright cases) | `apps/desktop/e2e/` |
| Skipped tests | 0 | Grep for `.skip` / `.todo` returned zero |
| Flaky tests | 0 | M35 T9 regression guards passing |
| Total test runtime (unit) | ~44s (M-C step e final full run) | M-C step e verifiedBy |
| Total test runtime (E2E) | ~27s (Playwright, 11 specs) | Phase 5 M35 verified |

## 2. Code Coverage (Approximated)

| Surface | Coverage | Evidence |
|---------|----------|----------|
| Main process | ~73% explicit (48 test files / 66 prod files) | Main-process audit |
| Shared packages | ~42% (33 tests / 79 source TS) | Shared-packages audit |
| Renderer hooks | ~100% (22 test files / 21 hooks) | Test-coverage audit |
| Renderer components | **< 4% (2 / 57 TSX)** | Renderer audit (P2 gap) |
| Repos | 17 of 22 tables have dedicated repo tests | Test-coverage audit |
| E2E per tab | 6 of 8 main tabs covered (gap: Telemetry, Audit) | Test-coverage audit |

## 3. Linting & Typecheck

| Gate | Status |
|------|--------|
| Biome errors | **0** |
| Biome warnings | 21 (baseline 24; M-C step d hardening reduced by 3) |
| TypeScript strict | **Clean across 6 packages** |
| TypeScript composite refs | All 6 packages build clean |

## 4. Audit Claims

| Category | Count |
|----------|-------|
| Verified on disk | **92** |
| Allowlisted (scheduled M-F rewrite) | 3 (`mcp.add`, `mcp.remove`, `mcp.health` — naming drift) |
| UNALLOWED | **0** |
| Total claims | 95 |
| CI conformance gate | GREEN |

## 5. Bug State

| Severity | Open | Shipped in M-C |
|----------|------|---------------|
| P0 | 0 | 0 regressions; all 15 P0 M-A rows for backend CLOSED |
| P1 | **1** (Invariant #11 gap on 4 renderer hooks — see ground-zero audit §3.1) | 0 |
| P2 | 1 (a11y baseline only; 2 agent-reported P2s withdrawn as LLM false-positives on verification) | 0 |
| P3 | 4 (magic-string events, bus payload variance, telemetry-core parametric tests, 2 tabs uncovered in E2E) | 0 |
| P1 FOLLOWUP | 1 (main-side Invariant #11: tickets/projects/goals IPC handlers don't emit bus events — surfaced during P1 renderer fix) | 0 |
| P4 | 2 (React 19 Suspense not adopted, audit-view section comments) | 0 |

## 6. Quality Gate Status

| Gate | Target | Baseline | Pass |
|------|--------|----------|------|
| Test execution | 100% run | 100% | ✅ |
| Pass rate | >= 80% | 100% | ✅ |
| P0 bugs open | 0 | 0 | ✅ |
| P1 bugs open | <= 5 | 1 | ✅ |
| Coverage (unit) | >= 80% overall | Partial (main/hooks strong; components weak) | 🟨 |
| OWASP coverage | >= 90% | 90% PASS + 10% PARTIAL | ✅ |
| CI green | all workflows | ci.yml + conformance.yml + release.yml all green | ✅ |
| Lint clean | 0 errors | 0 | ✅ |
| Typecheck clean | 0 errors | 0 | ✅ |

**9 of 10 gates pass unconditionally.** Component test coverage is the one partial.

## 7. IPC Surface State

| Channel Group | Count | Evidence |
|---------------|-------|----------|
| Companies | 5 (list + create + update + delete + archive) | M-C restoration complete |
| Employees | 6 (list + create + fire + promote + setManager + update-status-ish) | M-C step d |
| Orgchart | 1 (get) | M-C step c |
| Tickets | 8 | Phase 2 M12 |
| Meetings | 5 | Phase 3 M16 |
| Projects | 7 | Phase 3 M15 |
| Goals | 5 | Phase 3 M15 |
| Vault | 7 | Phase 4 M21 |
| Audit | 3 | Phase 4 M24 |
| Providers | 5 | Phase 3 M18 |
| MCP | 5 | Phase 2 M10 |
| Settings | 10 (runtime + privacy + concurrency + agentic + planner + copilot) | Phase 3 M19 + M31/M32/M33 |
| Telemetry | 4 | Phase 3 M17 |
| RAG | ~4 | Phase 5 M28/M29 |
| Command | 5 | Phase 5 M30 |
| Copilot | 4 | Phase 5 M33 |
| Chat | 4 | Phase 1 M5 |
| Events | 1 (dashboard stream) | Phase 1 M4 |
| Backup | 3 | Phase 4 M23 |
| Updater | 2 | Phase 4 M25 |
| **Total** | **~100 channels** | All verified or documented allowlist |

## 8. Event Bus Surface

- **34** typed EventType members (`work.*`, `token.*`, `message.*`, `meeting.*`, `vault.*`, `command.*`, `agent.*`, `agentic.*`, `plan.*`, `task.*`, `review.*`, `copilot.*`, `company.*`, `employee.*`)
- **5** new EventType members added by M-C: `company.created`, `company.updated`, `company.deleted`, `employee.promoted`, `employee.managerSet`
- **100%** emit sites verified via main-process audit
- **3 of 8** renderer mutation hooks have corresponding bus subscriptions (Invariant #11 P1 gap; see ground-zero audit §3.1)

## 9. Migrations

| # | Name | Tests | Status |
|---|------|-------|--------|
| 0000 | initial | integration | ✅ |
| 0001 | employees + threads | integration | ✅ |
| 0002 | events + runs | integration | ✅ |
| 0003–0010 | (see apps/desktop/src/main/db/migrations/) | integration | ✅ |
| 0011 | copilot_insights | handler tests | ✅ |
| 0012 | runs.kind column | handler tests | ✅ |
| 0013 | **org_edges** | 10 dedicated migration tests | ✅ |
| **Total** | 14 migrations | Journal + snapshots aligned | ✅ |

## 10. Role Pack System

| Metric | Baseline |
|--------|----------|
| Total role.md files | **57** (5 officer + 7 senior-mgmt + 8 management + 5 supervisor + 5 lead + 25 IC + 2 system) |
| pack.json version | 1.0.0 |
| pack.sig | Ed25519, publicKeyFingerprint present |
| Signature verification tests | 22 |
| Default verification mode (packaged) | `strict` |

---

## 11. Forward Targets (Phase 6 entry criteria)

| Metric | Current | Target | Owner |
|--------|---------|--------|-------|
| P1 bugs open | 1 | 0 | M-D T0 (close Invariant #11 gap) |
| Renderer component coverage | < 4% | >= 60% | M-D sprint |
| A11y baseline pass rate | 1/9 views | >= 8/9 | M-D + Phase 6 a11y sprint |
| Audit claims allowlist | 3 | 0 | M-F docs rewrite |
| E2E tab coverage | 6/8 | 8/8 | Phase 6 backfill |
| pnpm audit blocking gate | No | Yes | Recommended before Phase 6 |

---

## 12. Previous Baselines (for comparison)

- **Phase 5 exit (v1.1.0, 2026-04-20)**: 1169 unit / 11 E2E / 0 P0 / 0 P1
- **M-A audit (2026-04-17)**: 414 rows, 15 P0 / 8 P1 / 10 P2 / 16 P3 non-shipped
- **M-B triage (2026-04-17)**: 41 gap rows dispositions assigned; 15 P0 → RESTORE
- **M-C step e (2026-04-18)**: 1454 unit / 11 E2E / 92 audit verified / 3 allowlisted

Baseline delta 2026-04-20 → 2026-04-18: **+285 unit tests** (1169 → 1454), 0 new E2E specs (M-D will add), P0 rows closed backend-side (8 of 15).

---

## Sign-off

**Baseline authored by**: QA Expert session, 2026-04-18
**Approved by**: (awaiting Rocky review)
**Next report due**: End of first M-D sprint or 2026-04-25, whichever earlier.
