# Phase 5.6 M-D — UI Backfill (Plan)

**Date:** 2026-04-19
**Owner:** Rocky Elsalaymeh
**Predecessor:** Phase 5.6 M-C (shipped 2026-04-18, atomic `fd3617b` step e + `a4dc24e` step f + `582d0f0` FOLLOWUP-P1-extended)
**Successor:** Phase 5.6 M-F (Documentation Truth-Up), blocked on this milestone
**DoR:** M-C Loki exit-KPI closed (paired chore(loki) ledger).
**Parent plan:** `docs/plans/2026-04-17-team-x-phase-5.6-remediation.md` §6 M-D.
**Audit source:** `docs/audits/2026-04-17-conformance-audit.md` §20.2 (Cluster A rows 2.2/2.3/2.4), §20.3 (Cluster B rows 2.21/2.22), §20.4 (Cluster C rows 1.25/1.26).

---

## 1. Scope

M-D lands the renderer surface for the multi-company + org-chart + chat entry-point restorations. M-C already shipped the full backend (7 IPC channels, 1 migration, 14 bus events), so M-D is purely renderer work: UI components, React hooks, App-shell wiring, E2E coverage. Zero IPC contract changes. Zero new migrations. Zero new bus events.

**Restore rows covered (7 total):**

| Cluster | Audit rows | Surface |
|---|---|---|
| A — Multi-company | 2.2 / 2.3 / 2.4 | `WorkspaceSwitcher` + `CreateCompanyDialog` + `CompanySettings` panel |
| B — Org chart | 2.21 / 2.22 | indented-list tree UI + drag-to-rearrange |
| C — Chat entry | 1.25 / 1.26 | flip `Chat` tab `disabled: true → false` + wire drawer entry |

**Out of scope (defers):**
- Documentation rewrites (M-F owns §20.6).
- Verification-gate numerics (M-E owns §20.5).
- Any new backend IPC — if a component discovers a missing main-side emit or channel, file FOLLOWUP-P2 and defer rather than growing M-D.
- M36+ capability taxonomy work (paused per `.loki/queue/pending.json m36PausedState`).

## 2. Architectural invariants to honor

- **Invariant #11 (bus-event cache invalidation):** every new `useXxxEventSync` hook subscribes to `ipc.events.onDashboard`, filters by `event.companyId === companyId`, and invalidates only the query keys the emitted event mutates. The main-side emits for this milestone already shipped in M-C (steps d + e + f + FOLLOWUP-P1-extended) — M-D consumes them without adding new emits.
- **Invariant #1 (pure-view renderer):** no LLM, no MCP, no direct DB. All data crosses the typed IPC bridge.
- **Zero-corner-cutting:** every new interactive component MUST implement all 5 F10 states (loading / error / empty / disabled / hover) + WCAG 2.1 AA (4.5:1 contrast, keyboard nav, visible focus, 44px touch targets, screen-reader labels).
- **Re-use over duplication:** mirror existing shadcn primitive patterns (`dialog.tsx`, `sheet.tsx`), existing hook patterns (`useTicketEventSync`, `useEmployeeEventSync`), existing feature conventions (`features/hire/hire-dialog.tsx`). Do NOT invent new conventions when shipping a restore.

## 3. Step decomposition

M-D ships across **7 atomic steps**. Each is its own atomic commit + paired `chore(loki)` ledger per the M-C cadence. The step-by-step verifiedBy targets land on each paired ledger entry per the M-E S4 contract.

### Step (a) — Foundation: dropdown-menu primitive + `use-companies` hook + `WorkspaceSwitcher`

> **2026-04-19 revision — step (a+b) collapse.** The 2026-04-19 ground-zero audit (`docs/qa/2026-04-19-m-d-step-a-ground-zero-audit.md`) surfaced 1 P1 (stale `activeCompanyId` after delete) + 2 P2 polish gaps (error-state retry, empty-state dead-end). Per Rocky's iron-rule directive against deferred placeholders, the disabled "Soon" Create CTA is REJECTED. Step (b) `CreateCompanyDialog` collapsed forward into the same hardening atomic. Net effect: step (a) ships steps (a) AND (b) together; the original step (b) entry below is preserved as historical context but is now an empty entry.

**Goal:** Make the app render a one-of-many companies switcher in the top bar. The hardest architectural decision — where the switcher mounts (top-bar vs side-nav vs user-menu) — lands here, and everything downstream depends on it.

**Files:**
- NEW `apps/desktop/src/renderer/src/components/ui/dropdown-menu.tsx` — mirrors `dialog.tsx` shadcn convention, wraps `@radix-ui/react-dropdown-menu` primitives (Root, Trigger, Content, Item, Separator, Label, CheckboxItem); animated open/close via `data-[state]` Tailwind classes.
- NEW `apps/desktop/src/renderer/src/hooks/use-companies.ts` — exports `useCompanies()` (React Query on `companies.list`) + `useCompanyEventSync(companyId)` (subscribes to `company.created / company.updated / company.archived / company.deleted`; invalidates `['companies']`).
- NEW `apps/desktop/src/renderer/src/features/workspace/workspace-switcher.tsx` — dropdown trigger showing the active company name + icon + chevron; menu lists all non-archived companies with active checkmark; CTA at the bottom ("Create company…" → opens `CreateCompanyDialog` in step b; wires to store setter in this step as a disabled row labelled "Available in step (b)" to keep the switcher usable between step a and b).
- MODIFIED `apps/desktop/src/renderer/src/app/top-bar.tsx` — mount `<WorkspaceSwitcher />` between the Strategia brand block and the nav tabs, separated by a `<Separator orientation="vertical" />`.
- NEW `apps/desktop/src/renderer/src/features/workspace/workspace-switcher.test.tsx` — vitest + RTL renders the switcher with `useAppStore` seeded, asserts 5 F10 states + WCAG-compliant ARIA (`role=menu`, `aria-activedescendant`, keyboard nav), companyId switch dispatch.
- MODIFIED `apps/desktop/src/renderer/src/hooks/event-sync-hooks.test.ts` — add `useCompanyEventSync` describe block with source-string audit assertions matching the existing per-hook pattern.
- MODIFIED `packages/shared-types/package.json` OR `apps/desktop/package.json` — add `@radix-ui/react-dropdown-menu` dep at the `apps/desktop` package level (mirrors how `@radix-ui/react-dialog` is declared today).

**Design decisions to lock in step (a):**
- **Switcher mounts in top-bar.** Side-nav is reserved for view navigation and the user-menu pattern is not yet established. Top-bar gives the switcher status-bar gravity (like GitHub's repo picker) without adding a new app-shell section.
- **`useCompanies` returns non-archived rows by default.** `companies.list` today returns archived + active; the hook filters client-side. Archived companies surface only in the CompanySettings panel for restore, so keeping the switcher list tight is correct.
- **Switcher renders even when there is only one company.** Still shows the name + chevron and the "Create company…" entry. The switcher must never collapse to a static label — the affordance is what makes multi-company discoverable.
- **No companyId query param in URL.** This is Electron + React (Zustand store), not a web app. `setCompanyId` in the store is the single source of truth; persistence-on-restart is deferred (not part of M-D scope).

**Acceptance:**
- vitest green including the new workspace-switcher + use-companies tests.
- Manual: launch app, see switcher in top-bar; click expands dropdown; switch between seeded Strategia-X + a fixture second company (manually seeded via main-process test-mode seed OR SQL).
- 5 F10 states all present (loading skeleton while `useCompanies` pending, error toast on IPC failure, empty-state hint when zero rows [edge case — seed flow guarantees ≥1], disabled open when pending, hover background change per design system).
- WCAG AA: tab-focus visible, Enter opens menu, arrow keys navigate, Enter selects, Esc closes.

### Step (b) — `CreateCompanyDialog`

> **2026-04-19 — COLLAPSED into step (a+b) hardening atomic.** Shipped as part of the post-audit remediation per Rocky's iron-rule directive. See `docs/qa/2026-04-19-m-d-step-a-ground-zero-audit.md` and the step (a) revision note above. The original scope below is preserved for historical context.
>
> **2026-04-19 — pre-flight E2E shipped.** `apps/desktop/e2e/workspace-switcher.spec.ts` landed in commit `1d04e77`, validating boot → switcher open → create workspace → active workspace flip → seeded workspace still reachable. The run surfaced and closed two M-D integration gaps: created-company cache hydration before `setCompanyId`, and Radix dropdown close behavior after opening the create dialog. Evidence: `docs/qa/2026-04-19-m-d-workspace-switcher-preflight.md`.

**Goal:** Ship the create flow end-to-end.

**Files:**
- NEW `apps/desktop/src/renderer/src/features/workspace/create-company-dialog.tsx` — dialog form (name, slug, settings stub, icon, theme), client-side validation mirroring the M-C step b handler contract (`/^[a-z0-9][a-z0-9-]{0,62}$/` slug regex; name trim ≤120 chars), auto-suggest slug from name; submit wires to `ipc.companies.create`; success → `setCompanyId(result.companyId)` + close + toast; error → inline field errors + keep dialog open.
- MODIFIED `features/workspace/workspace-switcher.tsx` — swap the placeholder "Available in step (b)" entry for a real "Create company…" CTA that opens the new dialog.
- NEW `features/workspace/create-company-dialog.test.tsx` — RTL tests: happy path, slug-regex validation, duplicate-slug rewrap surface, icon/theme nullable handling.

**Design decisions:**
- **Slug auto-suggest.** As user types name, compute `name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 63)` and populate the slug field IF the user has not manually edited it. A single dirty flag on the slug input disables auto-suggest on first manual edit (standard create-flow UX).
- **Settings stub.** The settings object (mcp_configs_json, provider_prefs_json, max_concurrent_agents) is deferred to `CompanySettings` in step (c) for edit UX; create passes a minimal default settings object matching the seed flow.
- **Success behavior.** Switch to the new company immediately, open a toast with "Created {name}" + "Switch back to {previous}" undo-style link. No auto-open of CompanySettings — create and configure are different mental actions.

**Acceptance:** dialog opens via switcher, creates a company end-to-end, new company appears in the switcher, active companyId flips to the new one. Covered by `apps/desktop/e2e/workspace-switcher.spec.ts` as of commit `1d04e77`.

### Step (c) — `CompanySettings` panel + `HireDialog` manager-select

> **2026-04-19 — SHIPPED in commit `7fac251`.** Step (c) landed the live `CompanySettings` sheet, widened the public `Company` projection with `status/icon/theme`, filters archived companies out of `useCompanies()` by default, and extended `HireDialog` with a same-company "Reports to (optional)" picker that writes `employees.setManager` after hire. `apps/desktop/e2e/workspace-switcher.spec.ts` now covers create/switch, settings edit/archive/delete, and hire-with-manager edge creation.

**Goal:** Ship the edit/archive/delete flow + close the last Phase-2 hire-dialog gap.

**Files:**
- NEW `apps/desktop/src/renderer/src/features/workspace/company-settings.tsx` — sheet-based panel (mirrors `CopilotSidebar` + `sheet.tsx` primitive), sections: "General" (name/slug/icon/theme), "Danger zone" (archive / delete with type-to-confirm). Wires to `ipc.companies.update / archive / delete`.
- MODIFIED `features/workspace/workspace-switcher.tsx` — add "Company settings…" CTA at the bottom of the dropdown that opens the sheet.
- MODIFIED `features/hire/hire-dialog.tsx` — add "Reports to (optional)" select driven by `useEmployees` filtered to the same company; on submit, after `employees.create` resolves, call `employees.setManager` if a manager was chosen. Mirror M-C step d's input contract.
- NEW `features/workspace/company-settings.test.tsx` — source-string audit for panel wiring + archive guard + delete type-to-confirm + Company wire-shape widening + HireDialog manager-select contract.

**Design decisions:**
- **Delete confirmation.** Type-to-confirm with the exact company name. No checkbox-and-confirm because deletion is irreversible (per M-C step e contract) — the friction should be proportional to the blast radius.
- **Archive, not delete, by default.** The panel's primary CTA is Archive; Delete is the secondary, collapsed-by-default "Advanced" section.
- **HireDialog manager-select uses `useEmployees` not a fresh query.** The hook already runs for the sidenav employee list, so reusing it keeps the cache warm; the dialog just filters the rows to exclude the employee being hired (not applicable in the create path) and system pseudo-employees (already filtered by `listVisibleByCompany`).

**Acceptance:** panel opens, edits persist (verified by switcher reflecting the new name), archive moves the company out of the switcher, delete removes the company end-to-end, hire flow with manager select produces a wired reporting edge (verified by `orgchart.get` returning the edge in `apps/desktop/e2e/workspace-switcher.spec.ts`).

### Step (d) — Chat tab enable (Cluster C)

> **2026-04-19 — SHIPPED in commit `579f730`.** Step (d) enabled the Chat top-bar tab, added `ChatView` as a thread-list landing surface over the existing `useThreadList` + `ThreadList` components, and hands selected rows to the already-mounted `ChatDrawer` through the app store. `apps/desktop/e2e/workspace-switcher.spec.ts` now includes a Chat tab case that resolves a seeded employee thread, opens the tab, selects the thread, and confirms the drawer opens.

**Goal:** The smallest restore row in M-D. Flip the Chat tab from disabled to enabled and wire the view to the existing chat drawer.

**Files:**
- MODIFIED `apps/desktop/src/renderer/src/app/top-bar.tsx` — remove `disabled: true` from the Chat tab entry (line 35).
- MODIFIED `apps/desktop/src/renderer/src/App.tsx` — replace `<ComingSoon label="Chat" />` in the `case 'chat'` branch with a proper Chat landing view that renders the existing `<ThreadList />` + prompts the user to pick a thread or start a new DM (the `<ChatDrawer />` itself is already mounted app-shell-wide for compatibility with per-employee openings).
- NEW `apps/desktop/src/renderer/src/features/chat/chat-view.tsx` — landing view; lists threads via existing `useThreadList`; click a thread → opens `ChatDrawer` on that thread.
- MODIFIED `apps/desktop/src/renderer/src/app/top-bar.test.tsx` — update the disabled-tabs assertion to drop Chat.

**Design decisions:**
- **ChatDrawer stays mounted app-shell-wide.** The Chat tab view is a discovery surface — an explicit list of threads — that complements the existing employee-click-to-chat flow. Replacing either with the other would regress UX.
- **No new IPC.** Every chat IPC (`chat.send / list / resolveThread / listThreads`) is already shipped + already used by ChatDrawer.

**Acceptance:** Chat tab clickable, renders thread list; clicking a thread opens the drawer on that thread.

### Step (e) — Org-chart view (Cluster B, read-side)

**Goal:** Ship the tree render. No interactions yet — those land in step (f).

**Files:**
- NEW `apps/desktop/src/renderer/src/hooks/use-org-chart.ts` — `useOrgChart(companyId)` query on `ipc.orgchart.get`; `useOrgChartEventSync(companyId)` subscribing to `employee.hired / fired / promoted / managerSet` (already fired by main-side M-C steps) and invalidating `['orgchart', companyId]`. NOTE: `useEmployeeEventSync` already invalidates `['orgchart', companyId]` too — this hook adds the company-scoped subscription surface for the new OrgChartView to mount without duplicating the employees-hook mount.
- NEW `apps/desktop/src/renderer/src/features/orgchart/org-chart-view.tsx` — container: loads data, empty / loading / error states, passes rows to tree.
- NEW `apps/desktop/src/renderer/src/features/orgchart/org-chart-tree.tsx` — recursive indented list built from `rootIds[] + edges[] + employees[]`.
- NEW `apps/desktop/src/renderer/src/features/orgchart/org-chart-node.tsx` — single row: avatar, name, level badge, chevron (expand/collapse), hover action bar (Chat / Promote / Fire / Reassign manager).
- MODIFIED `apps/desktop/src/renderer/src/app/top-bar.tsx` — remove `disabled: true` from Org tab entry (line 31).
- MODIFIED `apps/desktop/src/renderer/src/App.tsx` — replace `<ComingSoon label="Org Chart" />` with `<OrgChartView companyId={companyId} />`.
- NEW `org-chart-tree.test.tsx` — RTL: builds correct tree from known fixture; renders levels with correct color coding (officer red, senior-mgmt purple, mgmt blue, supervisor teal, lead emerald, ic slate — matching the design system palette).

**Design decisions:**
- **Tree is pure and derived client-side.** Don't pre-shape on the server — `orgchart.get` returns flat parallel arrays (M-C step c contract); `OrgChartTree` builds the tree in O(n) at render time. Memoize with `useMemo` keyed on `(employees, edges)`.
- **Levels use color + badge + indentation, not color alone.** Per WCAG 1.4.1, color is never the sole meaning carrier. Indentation communicates hierarchy, badge communicates level, color is decorative reinforcement.
- **Action bar shown on hover, not always visible.** Avoid visual clutter at scale (a 55-employee org is not unreasonable). All actions must also be keyboard-reachable via the node's focus ring (Enter opens a popover with the same actions).

**Acceptance:** Org tab renders the tree for the seeded Strategia-X CEO + SWE. Levels correctly color-coded. Empty state renders "No employees yet — hire your first role." Keyboard navigation works (tab moves between nodes, Enter opens actions).

### Step (f) — Org-chart interactions (Cluster B, write-side)

**Goal:** Hook up drag-to-rearrange + promote + fire. This is where invariant #11 + optimistic updates get tested end-to-end.

**Files:**
- NEW hooks: `use-fire-employee.ts`, `use-promote-employee.ts`, `use-set-manager.ts`, `use-roles.ts`. Each wraps the relevant IPC mutation with React Query `useMutation` + optimistic-update cache mutation; each relies on the already-wired `useEmployeeEventSync` bus subscription for reconciliation.
- NEW `features/orgchart/org-chart-drag.tsx` (OR integrated into `org-chart-node.tsx`) — HTML5 drag-and-drop (or `@dnd-kit` if it's already a dep; grep first); drop fires `setManager` with optimistic reparent; rollback on cycle-guard IPC error.
- NEW `features/orgchart/promote-dialog.tsx` — small dialog with level + role picker driven by `useRoles`.
- NEW `features/orgchart/fire-dialog.tsx` — confirm-to-fire dialog, type-to-confirm the employee name.
- MODIFIED `features/orgchart/org-chart-node.tsx` — wire hover action bar to open promote / fire / reassign.
- Tests for each hook + the drag-to-rearrange flow.

**Design decisions:**
- **Optimistic update + rollback.** Drag fires `setManager`; cache is mutated immediately; on IPC error (e.g., cycle rejection), the cache is rolled back + a toast shows the error. Invariant #11 bus event provides reconciliation even when rollback races with another window.
- **Cycle-guard happens main-side.** The M-C step d handler pre-flight `wouldCycle` check returns a friendlier error message. The renderer just surfaces it verbatim in the toast.
- **`use-roles` is read-only.** No changes to the role-pack loader; the hook just exposes `roleLoader.listByLevel()` via a new thin IPC read (or reuses the existing seeded-in-memory surface if already exposed). Investigate first — if no IPC is exposed, file a FOLLOWUP-P2 for an `roles.list` read channel.

**Acceptance:** drag one employee under another, the edge persists across app restart (invariant: `orgchart.get` returns the new edge); cycle-forming drag rejected with toast; promote changes the row's level + title end-to-end; fire removes the row end-to-end; all four flows dispatch the right M-C bus events (verified by Audit tab picking them up).

### Step (g) — E2E spec + full verification gate

**Goal:** Close the milestone with a real end-to-end spec and run the full verification gate.

**Files:**
- EXISTING `apps/desktop/e2e/workspace-switcher.spec.ts` — pre-flight already covers boot, switcher render, create company end-to-end, active switch, and switch-back. Step (c) has already extended this spec to edit/archive/delete and hire manager-edge assertions; Step (d) adds the Chat tab/thread-selection case; Step (g) adds audit-event assertions for `company.created / updated / archived / deleted`.
- NEW `apps/desktop/e2e/org-chart.spec.ts` — boot, navigate to Org tab, assert tree renders, hire an employee, promote them, drag-rearrange, fire; asserts `employee.*` bus events land in Audit.
- MODIFIED E2E specs that assert Chat tab disabled (if any — grep first) → flip to asserting it's enabled.

**Acceptance (M-D exit KPI):**
- vitest: baseline 1572 + new unit tests (estimate +30–60 across hooks + components).
- E2E: 12 specs / 16 cases after the step (d) Chat tab expansion; target 13 specs / 17+ cases at M-D exit after the org-chart spec lands.
- typecheck clean across 6 packages.
- lint 0 errors / ≤21 warnings (baseline preserved).
- `pnpm audit:claims`: 92 / 3 / 0 preserved — no allowlist movement expected (M-D adds no IPC channels).
- invariant #11: every new hook subscribes to its relevant bus events (covered by `event-sync-hooks.test.ts` source-string audits).

## 4. Sequencing + dependencies

```
(a) Foundation [dropdown + use-companies + WorkspaceSwitcher]
 ├─> (b) CreateCompanyDialog       [depends on (a)]
 │    └─> (c) CompanySettings + hire manager-select  [depends on (b)]
 ├─> (d) Chat tab enable           [independent — can ship parallel to (b)/(c)]
 ├─> (e) OrgChartView read-side    [independent]
 │    └─> (f) OrgChart interactions [depends on (e)]
 └─> (g) E2E + verification gate   [depends on (a)-(f)]
```

Steps (d) and (e) are independent of (a)–(c) and can interleave if sequencing reality demands it. **Default order: a → b → c → d → e → f → g.**

## 5. Estimate + buffer

- Step (a): 1.0 day
- Step (b): 0.5 day
- Step (c): 1.0 day (sheet + 3 destructive flows + hire-dialog extension is not small)
- Step (d): 0.25 day (Cluster C is the smallest row set)
- Step (e): 1.0 day
- Step (f): 1.5 days (drag-and-drop UX + optimistic rollback is the riskiest step)
- Step (g): 0.75 day

**Total: 6 working days.** Remediation plan allocated 5–7d + 3d buffer → we ship within the window with buffer intact.

## 6. Definition of Ready (DoR)

- ✅ M-C Loki exit-KPI closed (paired ledger landed 2026-04-18).
- ✅ Audit §20.2 / §20.3 / §20.4 enumerate scope (7 rows).
- ✅ All 7 M-C IPC channels + 14 bus events verified on-disk (`audit:claims 92 / 3 / 0`).
- ✅ `useEmployeeEventSync` pre-wired for `['orgchart', companyId]` invalidation (FOLLOWUP-P1-extended).
- ✅ This plan doc committed.

## 7. Definition of Done (DoD)

- ✅ Each of the 7 sub-steps lands as its own atomic commit + paired `chore(loki)` ledger populating `verifiedBy` per S4 contract.
- ✅ Every new component implements all 5 F10 states (loading / error / empty / disabled / hover).
- ✅ Every new component is keyboard-navigable + WCAG 2.1 AA compliant.
- ✅ Every new hook is invalidated by appropriate bus events per invariant #11.
- ✅ Org tab renders the org-chart tree.
- ✅ Workspace switcher creates / switches / archives / deletes a second company end-to-end (proven by E2E).
- ✅ Chat tab enabled and lists threads.
- ✅ vitest + E2E + typecheck + lint + audit:claims all green.
- ✅ CLAUDE.md Phase 5.6 M-D status block flips `queued → shipped` with concrete verifiedBy evidence paths (handled by the step (g) ledger — not a separate M-F task for these rows).
- ✅ Audit §20.2 / §20.3 / §20.4 evidence_found column updated for each restored row (7 total).

## 8. Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Drag-and-drop UX bugs under slow IPC | Medium | Optimistic update + bus-event reconciliation; degrade gracefully to click-to-reassign if drag fails |
| Company switch mid-query leaves stale data in other views | Medium | `setActiveView` already resets `activeTicketId / activeProjectId / …` in the store; extend the reset to cover every company-scoped selection |
| Sheet conflicts with CopilotSidebar (both `role=dialog` on right side) | Low | Z-index + focus trap testing; mount CompanySettings in a centered dialog if sheets collide |
| `@radix-ui/react-dropdown-menu` dep install requires native rebuild | Low | Pure JS dep (no native bindings); standard `pnpm install` sufficient |
| OrgChartTree performance at 55+ employees | Low | Memoize tree build; virtualize if profiler shows frame drops (defer — Strategia-X runs at 2 employees in dev) |

## 9. Out-of-scope but surfaced

- Multi-company persistence across app restart (switcher state persists via Zustand-persist middleware — not wired today, defer to a follow-up).
- Company-level avatar / icon upload UX (the `icon` field accepts a URL; file-upload UX is a future polish).
- Bulk org-chart operations (multi-select promote / fire) — not in audit scope, out of M-D.

## 10. References

- `docs/plans/2026-04-17-team-x-phase-5.6-remediation.md` §6 M-D (parent)
- `docs/audits/2026-04-17-conformance-audit.md` §20.2 / §20.3 / §20.4 (scope)
- `docs/plans/2026-04-18-team-x-phase-5.6-m-c-step-f-invariant-11-main-side.md` (invariant #11 pattern reference)
- `docs/plans/2026-04-18-team-x-phase-5.6-m-c-followup-p1-extended.md` (useEmployeeEventSync pre-wiring reference)
- `apps/desktop/src/renderer/src/components/ui/dialog.tsx` (shadcn-primitive pattern reference for `dropdown-menu.tsx`)
- `apps/desktop/src/renderer/src/hooks/use-employees.ts` (event-sync pattern reference for `useCompanyEventSync` + `useOrgChartEventSync`)
- `apps/desktop/src/renderer/src/features/hire/hire-dialog.tsx` (dialog pattern reference for `CreateCompanyDialog` + `PromoteDialog` + `FireDialog`)
