# Team-X IPC Test Cases — Phase 5.6 M-C + M-D Prep

**Version**: 1.0 (2026-04-18)
**Scope**: 5 restored backend IPCs (Cluster A + Cluster B) + M-D renderer consumption + cross-cluster integration
**Format**: AAA pattern (Arrange → Act → Assert). Priority: P0 blocker → P4 low.
**Ground-truth**: This document is the authoritative source for test steps. `docs/qa/templates/TEST-EXECUTION-TRACKING.csv` tracks execution status only.

---

## Category Index

| Prefix | Domain | Count |
|--------|--------|-------|
| TC-IPC-COMP | Companies IPCs (create / update / delete / archive) | 22 |
| TC-IPC-EMP | Employees IPCs (promote / setManager / fire) | 18 |
| TC-IPC-ORG | Org-chart IPC (get) | 8 |
| TC-IPC-BUS | Bus event emission (invariant #11) | 12 |
| TC-DB-MIG | Migration 0013 + schema integrity | 6 |
| TC-DB-CAS | Cascade semantics (companies.delete sweep) | 10 |
| TC-UI-MD | M-D renderer surface (companies / orgchart / employees) | 16 |
| TC-INT-CLA | Cluster A end-to-end integration | 6 |
| TC-INT-CLB | Cluster B end-to-end integration | 6 |
| **TOTAL** | | **104** |

---

## TC-IPC-COMP — Companies IPCs

### TC-IPC-COMP-001 — companies.create happy path (P0)

**Preconditions**:
- App booted in test mode against a clean tmp userDataDir.
- At least one existing company `strategia-x` from seed.

**Test steps**:
1. Invoke `window.teamx.companies.create({ name: 'Acme Corp', slug: 'acme-corp' })`.
2. Wait for the promise to resolve.

**Expected results**:
- Returns `{ companyId: <uuid>, systemAgentEmployeeId: <uuid>, systemCopilotEmployeeId: <uuid> }`.
- `companies` table has the new row (slug=`acme-corp`, status=`active`).
- `employees` table has exactly 2 new `is_system=1` rows for that company (role_id=`system-agent` + `system-copilot`).
- `events` table has 1 `company.created` row with payload carrying the new ids.
- `events` table has 0 `employee.hired` rows for the system pair (they are filtered out of visible flow).

### TC-IPC-COMP-002 — companies.create rejects empty name (P0)

**Preconditions**: Clean state.
**Test steps**: Invoke with `{ name: '', slug: 'test' }`.
**Expected**: Promise rejects with message matching `/name.*non-empty/i`. No DB write. No bus emit.

### TC-IPC-COMP-003 — companies.create rejects name > 120 chars (P1)

**Steps**: Invoke with `name = 'A'.repeat(121)`.
**Expected**: Rejects with `/name.*120/i`. No DB write.

### TC-IPC-COMP-004 — companies.create rejects slug regex violations (P0)

Iterate over `['', 'Has Spaces', 'UPPER', '-leading-hyphen', 'trailing-hyphen-', 'a'.repeat(64), '!@#$%']`:
- Each invocation rejects with `/slug/i`.
- No DB write on any iteration.

### TC-IPC-COMP-005 — companies.create rejects duplicate slug (P0)

**Preconditions**: Seed company `strategia-x` exists.
**Steps**: Invoke with `{ name: 'Clone', slug: 'strategia-x' }`.
**Expected**: Rejects with message matching `/slug.*in use/i` (friendly rewrap, NOT raw `UNIQUE constraint failed`).

### TC-IPC-COMP-006 — companies.create refuses when ensureSystemForCompany dep unwired (P1)

**Arrange**: Composition root constructs handler without `ensureSystemForCompany`.
**Act**: Invoke create.
**Expected**: Throws before any SQL write (fails loud — refuses half-bootstrap).

### TC-IPC-COMP-007 — companies.create tolerates bus emit failure (P2)

**Arrange**: Stub `bus.emit` to throw.
**Act**: Invoke create with valid inputs.
**Expected**: Company + system employees written; error logged; response still returns the ids.

### TC-IPC-COMP-008 — companies.update happy path — single field (P0)

**Steps**: Invoke `companies.update({ companyId, name: 'New Name' })`.
**Expected**:
- Single SQL UPDATE with only `name` column.
- `company.updated` bus event with `patchedKeys: ['name']`.
- Other columns unchanged.

### TC-IPC-COMP-009 — companies.update multi-field + trim (P0)

**Steps**: Invoke with `{ name: '  Padded  ', slug: 'new-slug', settings: {...}, icon: null, theme: 'dark' }`.
**Expected**:
- `name` trimmed to `'Padded'`.
- `icon: null` propagates (clear icon).
- `patchedKeys` contains all 5 keys.

### TC-IPC-COMP-010 — companies.update empty patch emits bus event (P2)

**Steps**: Invoke with `{ companyId }` only (no patch fields).
**Expected**: Repo short-circuits (no SQL); handler still emits `company.updated` with `patchedKeys: []`. (Rationale: optimistic M-D update paths.)

### TC-IPC-COMP-011 — companies.update on archived company throws (P0)

**Preconditions**: Company archived via `companies.archive`.
**Steps**: Invoke update.
**Expected**: Rejects with message containing channel name `'companies.update'` + `'archived'` + `'reactivate'`. No SQL write.

### TC-IPC-COMP-012 — companies.update on unknown companyId throws (P1)

**Steps**: Invoke with non-existent companyId.
**Expected**: Rejects with `/not found/i`. Does not silently no-op.

### TC-IPC-COMP-013 — companies.update rewraps UNIQUE slug violation (P1)

**Steps**: Attempt update setting slug to an existing company's slug.
**Expected**: Rejects with `/slug.*in use/i` (friendly).

### TC-IPC-COMP-014 — companies.update passes through non-UNIQUE errors verbatim (P2)

**Arrange**: Inject a mock repo that throws `'disk full'`.
**Expected**: Error surfaces as `'disk full'` unchanged (not rewrapped).

### TC-IPC-COMP-015 — companies.delete happy path — full cascade (P0)

**Preconditions**: Seed a company with rows in 15 tables (employees, threads, messages, tickets, projects, goals, meetings, vault, embeddings, command_history, audit events, thread_members, runs, project_tickets, ticket_attachments, mcp_servers scoped, org_edges).
**Steps**: Invoke `companies.delete({ companyId })`.
**Expected**:
- All 15 tables' company-scoped rows deleted.
- Global mcp_server (companyId=NULL) survives.
- Sibling company's rows untouched.
- `company.deleted` bus event with captured `{slug, name, deletedAt}`.
- Copilot analyzer quiesced BEFORE repo.delete (verifiable via mock call order).

### TC-IPC-COMP-016 — companies.delete quiesce order (P0)

**Arrange**: Spy on `analyzer.stop`, `eventWindow.clear`, `repo.delete`.
**Expected call order**: `analyzer.stop` → `eventWindow.clear` → `repo.delete` → `bus.emit('company.deleted', ...)`.

### TC-IPC-COMP-017 — companies.delete on archived company succeeds (P1)

**Preconditions**: Company archived.
**Expected**: Delete succeeds (archive + delete are distinct semantics per M-C step e decision).

### TC-IPC-COMP-018 — companies.delete on unknown id throws (P1)

**Expected**: Rejects with `/not found/i`. No bus emit.

### TC-IPC-COMP-019 — companies.delete transactional atomicity (P0)

**Arrange**: Inject a mid-sweep throw (e.g., make `deleteFromEvents` throw).
**Expected**: All prior DELETEs rolled back; company row intact; no `company.deleted` bus event fired.

### TC-IPC-COMP-020 — companies.delete error propagation skips bus emit (P0)

**Arrange**: `repo.delete` throws.
**Expected**: Error propagates; no `company.deleted` bus event.

### TC-IPC-COMP-021 — companies.delete tolerates missing analyzer dep (P2)

**Arrange**: Handler constructed without analyzer.
**Expected**: Delete proceeds; missing dep logged; no throw.

### TC-IPC-COMP-022 — companies.delete emits exactly one company.deleted (P1)

Regression guard: Verify single bus emission per successful delete (not multiple).

---

## TC-IPC-EMP — Employees IPCs

### TC-IPC-EMP-001 — employees.promote happy path (P0)

**Preconditions**: Employee at level `ic` with `roleId='fullstack-engineer'`.
**Steps**: Invoke `employees.promote({ employeeId, newRoleId: 'engineering-manager' })`.
**Expected**:
- Row's roleId/level/title/roleMdSha/tools_allowed_json/tools_denied_json swapped atomically.
- `name` field UNCHANGED (promote ≠ rename).
- `employee.promoted` bus event with pre + post snapshot.

### TC-IPC-EMP-002 — employees.promote refuses system employees (P0)

Iterate over `[systemAgentId, systemCopilotId]`. Each promote call rejects with `/system.*cannot be promoted/i`.

### TC-IPC-EMP-003 — employees.promote refuses system-target roles (P1)

**Steps**: Promote regular employee to `system-agent` roleId.
**Expected**: Rejects with `/cannot.*system.*role/i`.

### TC-IPC-EMP-004 — employees.promote on archived company throws (P0)

Applies BUG-002 archived-company guard. Must include channel name in error.

### TC-IPC-EMP-005 — employees.promote on unknown roleId throws (P1)

**Expected**: Rejects with `/role.*not found/i`.

### TC-IPC-EMP-006 — employees.promote on unknown employee no-ops (P2)

**Expected**: Repo returns 0-affected-rows without throw. Handler throws `/employee.*not found/i` before repo is called.

### TC-IPC-EMP-007 — employees.promote preserves createdAt / status / modelPref / providerPref (P1)

Assert round-trip invariance for non-role columns.

### TC-IPC-EMP-008 — employees.setManager upsert happy path (P0)

**Steps**: Invoke `employees.setManager({ employeeId, managerId })`.
**Expected**:
- `org_edges` row upserted (managerId, reportId=employeeId, companyId).
- `employee.managerSet` bus event with `previousManagerId: null` (first-time set).

### TC-IPC-EMP-009 — employees.setManager detach path (P0)

**Preconditions**: Employee has existing manager.
**Steps**: Invoke with `managerId: null`.
**Expected**:
- `org_edges` row removed.
- `employee.managerSet` event with `previousManagerId: <old>` and `managerId: null`.

### TC-IPC-EMP-010 — employees.setManager rejects empty-string managerId (P1)

**Steps**: Invoke with `managerId: ''`.
**Expected**: Rejects with `/non-empty string or null/i`. (Prevents silent no-op from typos.)

### TC-IPC-EMP-011 — employees.setManager self-edge rejected (P0)

**Steps**: Invoke with `managerId === employeeId`.
**Expected**: Rejects with `/self.*manager/i`.

### TC-IPC-EMP-012 — employees.setManager direct cycle rejected (P0)

**Preconditions**: A → B reports-to relationship.
**Steps**: Set B's manager to A's report (which is B itself via transitive) — concrete: setManager(employeeId=A, managerId=B).
**Expected**: Rejects with `/reporting cycle/i`. `org_edges` unchanged.

### TC-IPC-EMP-013 — employees.setManager transitive cycle rejected (P0)

**Preconditions**: A → B → C reports-to chain.
**Steps**: `setManager(A, C)`.
**Expected**: Rejects with `/reporting cycle/i`.

### TC-IPC-EMP-014 — employees.setManager cross-company rejected (P0)

**Preconditions**: Employee in company X, proposed manager in company Y.
**Expected**: Rejects with `/cross-company/i`.

### TC-IPC-EMP-015 — employees.setManager level-inversion rejected (P0)

**Applies BUG-001 level-inversion guard.**
Iterate over inversion pairs (ic→officer, lead→officer, supervisor→management). Each rejects with `/level/i`.

### TC-IPC-EMP-016 — employees.setManager peer-level rejected (P1)

**Strict rank rule**: manager rank MUST be < report rank. Same-level pairs rejected.

### TC-IPC-EMP-017 — employees.setManager unknown level fails open (P2)

**Arrange**: Seed role with level literal `'custom'` (not in LEVEL_RANK).
**Expected**: `getLevelRank` returns null → inversion check skipped → dev-mode warning logged → setManager proceeds.

### TC-IPC-EMP-018 — employees.setManager atomic transaction (P0)

**Regression guard for BUG-003/BUG-004.**
**Arrange**: Mock wouldCycle to return false on first call, true on second (race simulation).
**Expected**: Repo-side transaction rejects atomically. Handler surfaces `/reporting cycle/i`.

---

## TC-IPC-ORG — Orgchart Get

### TC-IPC-ORG-001 — orgchart.get happy path (P0)

**Preconditions**: Seed company with 5-employee tree (CEO → VP → 3 ICs).
**Expected**: Response `{ employees: [5], edges: [4], rootIds: ['ceoId'] }`. Flat arrays.

### TC-IPC-ORG-002 — orgchart.get filters system employees (P0)

**Preconditions**: Company has system-agent + system-copilot rows.
**Expected**: `employees` array does NOT include system rows. `edges` does NOT reference them.

### TC-IPC-ORG-003 — orgchart.get filters cross-company edges (P1)

**Arrange**: Direct-DB-write an org_edges row referencing an out-of-company employee.
**Expected**: Defensive handler filter drops the row from response.

### TC-IPC-ORG-004 — orgchart.get empty company (P2)

**Preconditions**: Company with zero employees.
**Expected**: `{ employees: [], edges: [], rootIds: [] }`. Empty-state detection works.

### TC-IPC-ORG-005 — orgchart.get computes rootIds (P0)

**Preconditions**: Tree with 2 disconnected subtrees.
**Expected**: `rootIds` contains both root employeeIds.

### TC-IPC-ORG-006 — orgchart.get archived company succeeds (P2)

**Expected**: Read-only IPC — no archived-company guard applied.

### TC-IPC-ORG-007 — orgchart.get unknown companyId (P2)

**Expected**: Returns empty response, does not throw. (Read-path — unknown id is empty world, not error.)

### TC-IPC-ORG-008 — orgchart.get performance (P3)

**Preconditions**: Company with 500 employees in 10-level tree.
**Expected**: Response in < 50ms (listByCompany + listByCompany on org_edges + defensive filter).

---

## TC-IPC-BUS — Invariant #11 Coverage

### TC-IPC-BUS-001 — Every mutation IPC emits its bus event (P0)

Parametrized over (ipcChannel, expectedEventType) pairs:
- `companies.create` → `company.created`
- `companies.update` → `company.updated`
- `companies.delete` → `company.deleted`
- `companies.archive` → `company.archived`
- `employees.promote` → `employee.promoted`
- `employees.setManager` → `employee.managerSet`
- `employees.fire` → `employee.fired`
- `employees.create` → `employee.hired`
- `tickets.create` → `ticket.created`
- `tickets.update` → `ticket.updated`
- `tickets.close` → `ticket.closed`
- `meetings.call` → `meeting.started`

For each: invoke channel, capture bus, assert exactly one matching event.

### TC-IPC-BUS-002 — actorId consistently HUMAN_USER_ID on IPC-originated mutations (P1)

Applies BUG-005 sweep. All mutation bus events fired from IPC have `payload.actorId === 'rocky'` (the HUMAN_USER_ID literal). Agent-originated events have `actorId = employeeId`.

### TC-IPC-BUS-003 — Bus emit failure does not roll back DB write (P1)

**Arrange**: Stub bus.emit to throw.
**Expected**: DB row persists; error logged; IPC response returns successfully.

### TC-IPC-BUS-004–012 — Per-event-type payload schema validation (P0 × 9)

Each of 9 core events (`company.*`, `employee.*`, `plan.proposed`, `task.delegated`, `task.escalated`, `review.requested`, `review.completed`, `copilot.insight`) — validate that the emitted payload matches its TypeScript interface exactly (no missing keys, no extra keys in strict mode).

---

## TC-DB-MIG — Migration 0013 + Schema

### TC-DB-MIG-001 — Migration 0013 applies clean on fresh DB (P0)

**Expected**: `org_edges` table created. `idx_org_edges_company_manager` composite index present.

### TC-DB-MIG-002 — Migration 0013 UNIQUE on report_id (P0)

Insert edge (reportId=X, managerId=A). Insert edge (reportId=X, managerId=B). Second insert fails with `UNIQUE constraint failed`.

### TC-DB-MIG-003 — Migration 0013 CASCADE on company_id (P0)

Delete company row. All org_edges rows for that company auto-deleted.

### TC-DB-MIG-004 — Migration 0013 CASCADE on manager_id (P0)

Delete employee row. All org_edges rows where that employee is manager auto-deleted.

### TC-DB-MIG-005 — Journal index 13 present (P1)

`meta/_journal.json` contains entry for migration 0013.

### TC-DB-MIG-006 — FK enforcement on fresh DB (P1)

Insert org_edges row with bogus companyId. Expect FK constraint violation.

---

## TC-DB-CAS — Cascade Sweep (companies.delete)

### TC-DB-CAS-001 — 15-table sweep completeness (P0)

Seed company with rows in ALL 15 covered tables. After delete, every row for that company is gone. Sibling rows untouched.

### TC-DB-CAS-002 — Indirect leaves sweep (P0)

Specifically verify: `thread_members`, `messages`, `runs`, `project_tickets`, `ticket_attachments` all deleted.

### TC-DB-CAS-003 — Cross-referencing rows before direct children (P0)

Verify FK-safe order: `meetings.threadId` + `tickets.threadId` + `projects.goalId` references all resolved before the referenced tables are deleted.

### TC-DB-CAS-004 — Global mcp_server survives (P1)

`mcp_servers` row with `companyId=NULL` (global scope) survives delete of any specific company.

### TC-DB-CAS-005 — Scoped mcp_server deleted (P1)

`mcp_servers` row with `companyId=<target>` deleted.

### TC-DB-CAS-006 — Migration 0013 CASCADE cleans org_edges (P0)

Without explicit `DELETE FROM org_edges`, the CASCADE FK removes them. Verify.

### TC-DB-CAS-007 — copilot_insights CASCADE cleans via schema (P1)

Same pattern. Verify.

### TC-DB-CAS-008 — Events rows cleaned for hygiene (P1)

Events for deleted company removed (no FK but explicit DELETE for audit hygiene).

### TC-DB-CAS-009 — Employees CASCADE cleans their org_edges (P1)

When employees are deleted (Phase 5 of sweep), their manager/report org_edges rows CASCADE-clean.

### TC-DB-CAS-010 — Transactional rollback on mid-sweep failure (P0)

Inject throw between phases. All prior DELETEs rolled back. Company still present.

---

## TC-UI-MD — M-D Renderer Surface (Deferred — test cases ready for M-D)

### TC-UI-MD-001 — WorkspaceSwitcher opens and lists companies (P0 — M-D blocker)

### TC-UI-MD-002 — Switching workspace changes companyId in Zustand store + refetches all views (P0)

### TC-UI-MD-003 — CreateCompanyDialog validates name + slug regex before submit (P0)

### TC-UI-MD-004 — CreateCompanyDialog on success: company selected, Copilot Conversations show system-copilot thread (P0)

### TC-UI-MD-005 — CreateCompanyDialog on duplicate slug shows friendly error toast (P1)

### TC-UI-MD-006 — CompanySettings panel renders current values, dirty-state tracking, save triggers update IPC (P0)

### TC-UI-MD-007 — CompanySettings delete button requires destructive confirmation gate (red card) (P0)

### TC-UI-MD-008 — OrgChartView renders tree with all employees + edges (P0)

### TC-UI-MD-009 — OrgChartView filters system employees (P0)

### TC-UI-MD-010 — Drag employee onto new manager triggers setManager IPC with optimistic update (P0)

### TC-UI-MD-011 — Drag to form cycle shows friendly error toast and reverts optimistic update (P0)

### TC-UI-MD-012 — Drag to level-inversion shows friendly error toast and reverts (P0)

### TC-UI-MD-013 — Promote employee menu shows level-valid targets only (P1)

### TC-UI-MD-014 — Promote triggers IPC + updates tree + updates badge counts (P0)

### TC-UI-MD-015 — useCompanyEventSync / useOrgchartEventSync / useEmployeeEventSync invalidate caches on bus event (P0 — Invariant #11)

### TC-UI-MD-016 — All M-D dialogs use Radix Dialog primitives with focus trap + Esc (P1 A11y)

---

## TC-INT-CLA — Cluster A Integration (end-to-end)

### TC-INT-CLA-001 — Fresh install: create company → switch → hire CEO → chat (P0)

### TC-INT-CLA-002 — Create 3 companies → each has its own system pair → cross-company scope isolation (P0)

### TC-INT-CLA-003 — Archive company: orchestrator paused, analyzer stopped, copilot conversations hidden (P0)

### TC-INT-CLA-004 — Delete company: cascade sweep verified, sibling companies unaffected (P0)

### TC-INT-CLA-005 — Update company name/slug/theme reflected in WorkspaceSwitcher label live (P1)

### TC-INT-CLA-006 — Backup created → company deleted → backup restored → company + system pair reinstated via F4 sweep (P0)

---

## TC-INT-CLB — Cluster B Integration (end-to-end)

### TC-INT-CLB-001 — Seed company → promote CEO → org tree reflects new role (P0)

### TC-INT-CLB-002 — Hire VP + 3 managers + 9 ICs → org tree renders 3-level tree correctly (P0)

### TC-INT-CLB-003 — Drag IC under new manager → org tree + bus event + React Query invalidation in <200ms (P0)

### TC-INT-CLB-004 — Attempt to drag CEO under IC → cycle + level-inversion both caught (P0)

### TC-INT-CLB-005 — Fire manager with reports → reports become roots → org tree renders correctly (P0)

### TC-INT-CLB-006 — Delete company with tree → all org_edges cleaned via CASCADE (P0)

---

## Coverage Summary

- **P0 count**: 58 (55.8%)
- **P1 count**: 29 (27.9%)
- **P2 count**: 14 (13.5%)
- **P3 count**: 3 (2.9%)

**M-D prerequisite**: TC-UI-MD-001 through TC-UI-MD-016 must be green before M-D ships.

**Invariant #11 priority**: TC-IPC-BUS-001 and TC-UI-MD-015 are the canonical guards for the P1 finding in `2026-04-18-ground-zero-audit.md` §3.1.
