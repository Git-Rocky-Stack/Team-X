# Team-X M-D Step (a) Ground-Zero QA Audit — 2026-04-19

**Auditor**: Claude (Rocky's Elite Partner)
**Scope**: Phase 5.6 M-D step (a) deliverables (atomic `5d0c5bc` + ledger `a73830a`). Narrow scope: the workspace-switcher surface + its `use-companies` hook + the `dropdown-menu` primitive + the top-bar mount + the `event-sync-hooks.test.ts` cross-hook-contract split.
**Method**: 6-dimension audit (invariant #11 bus wiring / F10 states / WCAG 2.1 AA / cross-cutting concerns / edge cases / contract drift risks) + cross-reference against pre-existing ground-zero audit findings (`docs/qa/2026-04-18-ground-zero-audit.md`) for lineage continuity.
**Supersedes**: Nothing. This audit is a step-scoped addendum to the 2026-04-18 pre-M-D ground-zero audit; it closes the next step's drift window rather than replacing prior findings.

---

## 1. Executive Summary

M-D step (a) is **production-quality for the scope it covers** — the switcher renders, subscribes, dispatches, and exposes stable E2E anchors across every F10 state. The audit surfaces **1 P1** (stale `activeCompanyId` after `company.deleted` leaves the whole app pointing at a dead row), **2 P2** polish gaps, **3 P3** contract / a11y concerns, and **3 P4** informational notes. None are regressions from prior shipped work.

**Overall verdict**: **PASS with P1 remediation required before step (b)**. The P1 is a real end-to-end-observable defect (delete the active company → every downstream query breaks with a dead id) that becomes user-reachable as soon as step (c) ships `CompanySettings.delete`. Fixing it now — in a small hardening atomic mirroring the M-C step-d-hardening precedent — is cheaper than discovering it during step (c) verification.

| Severity | Count | Summary |
|----------|-------|---------|
| **P0 Blocker** | 0 | None. |
| **P1 Critical** | 1 | Stale `activeCompanyId` after delete/archive leaves the app pointing at a non-existent row. Auto-select in `App.tsx:55` only triggers when `companyId === null`. |
| **P2 High** | 2 | Error state lacks retry affordance; empty state is a dead-end until step (b) ships the live CTA. |
| **P3 Medium** | 3 | aria-label on trigger doesn't reflect error state; cross-hook citation iterator now over-constrains future global-scope hooks; touch targets below WCAG 2.1 AAA (desktop-first, acceptable but noted). |
| **P4 Low** | 3 | `aria-current="true"` vs `"page"` semantic ambiguity; `DropdownMenuShortcut` exported but unused; bundle-size delta from Radix dropdown-menu not measured. |

**Key architectural wins shipped in step (a)** (documented here so a future auditor can cross-check without re-deriving):
- ✅ `useCompanyEventSync` correctly distinguishes global-scope from per-company hooks (no `companyId` guard; `[qc]` dep array). Cross-hook contract iterator split accordingly.
- ✅ All 4 `company.*` events subscribed + correct `['companies']` invalidation.
- ✅ Mount point in persistent top-bar — zero risk of subscription drop mid-session from view unmounts.
- ✅ Source-string audit test pattern preserved (31 tests in `environment: 'node'` — no jsdom overhead, no false positives).
- ✅ Stable `data-workspace-switcher-*` selector surface ready for step (g) E2E.

---

## 2. Audit Coverage Matrix

| Dimension | Scope | P0 | P1 | P2 | P3 | P4 | Verdict |
|---|---|----|----|----|----|----|----|
| **Invariant #11 bus wiring** | `useCompanyEventSync` + cross-hook contract | 0 | 0 | 0 | 1 | 0 | PASS |
| **F10 state completeness** | 5 states × WorkspaceSwitcher | 0 | 0 | 2 | 0 | 0 | ATTENTION |
| **WCAG 2.1 AA compliance** | Trigger + menu + items | 0 | 0 | 0 | 1 | 1 | PASS |
| **Cross-cutting concerns** | Memoization, Strict Mode, primitive correctness | 0 | 0 | 0 | 0 | 1 | PASS |
| **Edge cases** | Boot, empty, error, stale-id, duplicate-click | 0 | 1 | 0 | 0 | 0 | ATTENTION |
| **Contract drift risks** | Cross-hook iterator, primitive dead exports, bundle delta | 0 | 0 | 0 | 1 | 1 | PASS |

---

## 3. Critical Findings

### 3.1 P1 — Stale `activeCompanyId` after delete/archive leaves the app pointing at a non-existent row

**Evidence:**

`apps/desktop/src/renderer/src/App.tsx:55–62` — boot-time auto-select effect:
```tsx
useEffect(() => {
  if (companyId !== null) return;
  window.teamx.companies.list().then((companies) => {
    if (companies.length > 0 && companies[0]) {
      setCompanyId(companies[0].id);
    }
  });
}, [companyId, setCompanyId]);
```

The guard `if (companyId !== null) return;` fires only when no company is selected. After M-C step e shipped `companies.delete`, the following flow is now user-reachable (and becomes front-of-house in M-D step (c) when `CompanySettings.delete` UI ships):

1. User selects company A via `WorkspaceSwitcher`. `store.companyId = "A"`.
2. User opens `CompanySettings` (step c) → clicks Delete → confirms type-to-confirm.
3. `companies.delete` IPC succeeds. `company.deleted` bus event fires with `companyId: "A"`.
4. `useCompanyEventSync` invalidates `['companies']`. `useCompanies` refetches. `companies` no longer contains `"A"`.
5. `WorkspaceSwitcher` correctly falls through: `activeCompany = companies.find(c => c.id === "A") = undefined`, `triggerLabel = "Select workspace"`, no rows in the menu match `activeCompanyId`. **Switcher is honest.**
6. **But** `store.companyId` is still `"A"`. Every downstream view (`useEmployees("A")`, `useTickets("A")`, `useCopilotInsights("A")`, `useOrgChart("A")` when step (e) lands, etc.) sends a dead id across IPC.

Observable consequences today:
- `employees.list` main-side handler returns `[]` for an unknown companyId (no throw).
- `tickets.list` similarly returns `[]`.
- `useDashboardEvents` filter drops every incoming event because `event.companyId !== "A"` for every new company.
- The user sees empty dashboards with no explanation + no way to recover except clicking a workspace in the switcher.

Observable consequences post-step-(e) (OrgChartView):
- `orgchart.get("A")` returns `{ employees: [], edges: [], rootIds: [] }` — empty state renders, indistinguishable from a freshly-created company.
- Drag-to-rearrange would fire `employees.setManager` with employees that don't exist in the target company — main-side guards reject it cleanly, but renderer optimistic updates would rollback confusingly.

**Why this is P1 not P2**:
- Reachable via a legitimate user action (delete own workspace).
- Silent failure mode — no error, no toast, no recovery path.
- Blast radius = every view in the app at once.
- Fix is small + contained.

**Remediation shape**:

Widen `App.tsx:55`'s guard from `if (companyId !== null) return;` to `if (companyId !== null && companies.some(c => c.id === companyId)) return;`. Requires reading `companies` from `useCompanies()` inside `App.tsx` (adds one hook + one dep array entry). Pseudo-code:

```tsx
const { data: companies = [] } = useCompanies();

useEffect(() => {
  // Auto-select: no active company OR active company no longer exists.
  const activeStillExists = companyId !== null && companies.some(c => c.id === companyId);
  if (activeStillExists) return;
  if (companies.length > 0 && companies[0]) {
    setCompanyId(companies[0].id);
  } else {
    // Zero companies remaining — caller is the first-launch flow OR
    // the user deleted the last one. Step (b)/(c) ships the recovery
    // CTA; today the switcher renders "No workspaces yet".
    setCompanyId(''); // or keep as-is; let switcher show empty state
  }
}, [companyId, setCompanyId, companies]);
```

**Scope decision**: Fix inline in a small hardening atomic before step (b). Mirrors the M-C step-d-hardening precedent where BUG-001 through BUG-008 were found by post-ship QA and closed in a single follow-on atomic rather than deferred. The principle from Rocky's iron rule: *zero-deferring when the fix is small enough to land in the same sprint*.

**Alternative considered**: Defer to step (c) when `CompanySettings.delete` UI lands. **Rejected** because:
- The bug is already reachable via `companies.delete` IPC today (E2E specs, palette commands, agentic flows).
- Step (c) is at least 2–3 atomics away, during which the bug sits live.
- Zero-cost fix now vs discovery cost later.

### 3.2 P2 — Error state in switcher has no retry affordance

**Evidence:** `workspace-switcher.tsx:113` — error row:
```tsx
<DropdownMenuItem disabled className="text-destructive" data-workspace-switcher-state="error">
  Failed to load — retry in a moment
</DropdownMenuItem>
```

The user is told to "retry in a moment" but can't explicitly retry — they must wait for React Query's default retry-on-window-focus, or close and re-open the app.

**Remediation shape**: Replace the disabled row with an actionable `DropdownMenuItem` that invokes `useCompanies().refetch()`:
```tsx
<DropdownMenuItem
  onSelect={(e) => { e.preventDefault(); refetch(); }}
  className="text-destructive"
  data-workspace-switcher-state="error"
>
  <RefreshCw className="mr-2 h-3.5 w-3.5" />
  Retry loading workspaces
</DropdownMenuItem>
```

**Scope decision**: Bundle into the step-(a) hardening atomic alongside P1.1 + P3.1 fixes. Fix size: ~5 LOC + 1 new RefreshCw import + 1 test line for the `data-*` anchor assertion.

### 3.3 P2 — Empty state is a dead-end until step (b) ships the live Create CTA

**Evidence:** `workspace-switcher.tsx:116` — empty row paired with line-141's disabled "Create company… Soon" placeholder. When `companies.length === 0` AND `isLoading` is false AND `isError` is false (today: not reachable because seed creates Strategia-X on first boot; reachable after user deletes their last workspace), the menu shows two disabled rows and no way to recover.

**Remediation**: By design for step (a) per the plan. Step (b) ships the live "Create company…" CTA, which converts the empty state from a dead-end to a recovery path. Audit doc flags this so the step (b) implementation knows the empty state is the unblock path.

**Scope decision**: No inline fix in step (a). Document as the step (b) entry criterion.

---

## 4. Medium + Low Findings

### 4.1 P3 — aria-label on trigger doesn't reflect error state

**Evidence:** `workspace-switcher.tsx:68`:
```tsx
aria-label={`Workspace switcher${activeCompany ? ` — active: ${activeCompany.name}` : ''}`}
```

When `isError` is true, the visible trigger label reads "Workspace unavailable" (destructive color), but the screen-reader-announced label is still "Workspace switcher" (or "Workspace switcher — active: <stale name>" if `activeCompany` was hydrated before the refetch failed).

**Remediation**: Thread error state into the aria-label:
```tsx
aria-label={
  isError
    ? 'Workspace switcher — workspaces failed to load'
    : `Workspace switcher${activeCompany ? ` — active: ${activeCompany.name}` : ''}`
}
```

**Scope decision**: Bundle into the hardening atomic.

### 4.2 P3 — Cross-hook ground-zero-audit citation iterator may over-constrain future global-scope hooks

**Evidence:** `event-sync-hooks.test.ts:560-577` — the `each sync hook references the ground-zero audit document` iteration now includes `use-companies`.

**Issue:** The `2026-04-18-ground-zero-audit.md` citation is architecturally tied to the FOLLOWUP-P1 closure chain. A future global-scope hook (`use-providers`, `use-settings-sync`, etc.) would be forced to carry a citation that is architecturally irrelevant to its scope.

**Remediation options:**
- **Option A (conservative)**: Keep the current iterator; future global-scope hooks cite the audit doc as a lineage pointer even if not directly relevant. Minor cost, maximum regression guard.
- **Option B (precise)**: Relax the iterator to check for "any Invariant #11 or Phase 5.6 audit doc citation" rather than the specific 2026-04-18 string. Broader match set, preserves the spirit of the guard.

**Scope decision**: **Option A** (conservative). Accepting a minor over-constraint today is cheaper than building a complex regex that could accidentally miss a real drift. Re-evaluate if a second global-scope hook ships and the citation feels truly off.

### 4.3 P3 — Touch targets at 32px are below WCAG 2.1 AAA for touch-primary UX

**Evidence:** Trigger `h-8` = 32px; `DropdownMenuItem` `py-1.5` + `text-sm` line-height ≈ 32px.

**WCAG 2.1 AA minimum: 24×24 CSS px (Level AA)**, **AAA: 44×44 CSS px (Level AAA)**. Team-X is desktop-first; 32px targets are acceptable at AA level. Flag for completeness — not a blocker.

**Scope decision**: No change. Document standard — if a future mobile/tablet scope emerges, revisit component sizing globally (not just the switcher).

### 4.4 P4 — `aria-current="true"` vs `aria-current="page"` semantic ambiguity

**Evidence:** `workspace-switcher.tsx:130` — `aria-current={isActive ? 'true' : undefined}`.

ARIA spec permits both. `"page"` or `"location"` are marginally more semantically precise for the active-workspace concept, but `"true"` is valid and the screen-reader announcement is functionally identical.

**Scope decision**: No change. Minor semantic preference, no observable user impact.

### 4.5 P4 — `DropdownMenuShortcut` primitive exported but unused

**Evidence:** `dropdown-menu.tsx:166` + exports list.

**Rationale for keeping**: The shadcn convention ships the full primitive set together; omitting one to meet "used today" minimalism forces a future add-when-needed cycle that can introduce API-surface drift. The component is trivial (~6 LOC) and incurs zero runtime cost when not rendered.

**Scope decision**: No change. Documented as intentional completeness.

### 4.6 P4 — Bundle-size delta from `@radix-ui/react-dropdown-menu` not measured

**Evidence:** Dependency adds an unmeasured ~15–25 kB gzipped to the renderer bundle.

**Rationale**: Team-X is an Electron app distributed as platform-specific installers; bundle size has less gating effect than web delivery. The dependency is also pre-paid by the M-D scope (step (c) + step (f) consume DropdownMenuCheckboxItem + Sub for the CompanySettings + OrgChart action menus).

**Scope decision**: No change. Document for future measurement if renderer bundle budget becomes a KPI.

---

## 5. Test Contract Observations

The step (a) test additions (31 new tests) maintain the repo's architectural patterns cleanly:

- **Source-string audit convention preserved** — `environment: 'node'`, no jsdom. Every new assertion reads the source file and regexes + `.toContain()` + `.toMatch()`. Matches `top-bar.test.tsx`, `audit-event-chip.test.tsx`, `event-sync-hooks.test.ts` FOLLOWUP-P1-extended pattern.
- **Data-* selector anchors** — every F10 state + every action + the trigger + the content panel carries a stable `data-workspace-switcher-*` attribute, mirroring the M34 `data-copilot-toolbar-toggle` + M31 `data-step-kind` precedents.
- **Cross-hook contract split** — the iterator now has two lists (per-company hooks with `[companyId, qc]` dep guard; all hooks with the ground-zero citation). Architectural note lands inline.

**No test contract regressions introduced.**

---

## 6. Disposition Rollup

| Finding | Severity | Owner | Disposition | Target |
|---|---|---|---|---|
| 3.1 stale-active-companyId after delete/archive | P1 | M-D step (a) hardening | **Fix inline** | Next atomic (this session) |
| 3.2 error-state retry affordance | P2 | M-D step (a) hardening | **Fix inline** (bundle w/ P1) | Next atomic (this session) |
| 3.3 empty-state dead-end | P2 | M-D step (b) | Step (b) implementation closes via live Create CTA | Step (b) atomic |
| 4.1 trigger aria-label in error state | P3 | M-D step (a) hardening | **Fix inline** (bundle w/ P1) | Next atomic (this session) |
| 4.2 cross-hook citation iterator over-constraint | P3 | Pending future global-scope hook | Defer — re-evaluate at 2nd global-scope hook | Open |
| 4.3 touch targets below AAA | P3 | Global design system | Defer — desktop-first scope | Open |
| 4.4 aria-current="true" vs "page" | P4 | Accept | No change | — |
| 4.5 DropdownMenuShortcut unused | P4 | Accept | No change | — |
| 4.6 bundle-size delta unmeasured | P4 | Defer | Track if renderer bundle budget becomes KPI | Open |

**Inline hardening atomic scope**: 3 findings (P1.1 + P2.1 + P3.1). Estimated delta: ~30 LOC across 2 files + 5 new test assertions. Matches the atomic-size discipline M-C step d hardening landed.

---

## 7. Next Steps

1. **Hardening atomic** (feat(phase-5.6-m-d): step (a) hardening — stale-active-company guard + error retry + aria-label error state) — fixes 3 findings above.
2. **Paired `chore(loki)` ledger** — updates `current-task.json` stepsShipped with the hardening entry (mirrors M-C step d hardening cadence).
3. **Proceed to option 2 (per Rocky's direction)** — write the E2E pre-flight spec `apps/desktop/e2e/workspace-switcher.spec.ts` against the post-hardening switcher surface.

---

## 8. Lineage

- **Predecessor audit**: `docs/qa/2026-04-18-ground-zero-audit.md` (Phase 5.6 M-C exit audit)
- **Predecessor autonomous run report**: `docs/qa/2026-04-18-autonomous-run-report.md` (BUG-009/010/011 closure path)
- **Shipped commit under audit**: `5d0c5bc` (feat: M-D step a foundation) + `a73830a` (chore(loki) ledger)
- **Follow-on hardening atomic**: pending (this session)
