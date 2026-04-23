> **Status:** Approved 2026-04-22 from the competitive gap-analysis and user-approved expansion direction.
> **Scope:** Add a first-class `Autonomy Control Plane` for `Agent Runtimes`, `Routines`, `Budgets`, `Approvals`, `Artifacts`, and `Operators & Access`, while keeping Team-X local-first by default and designing real multi-user/cloud seams into the first bundle.
> **Primary driver:** Team-X already has strong desktop UX, telemetry, extensions, authority, and onboarding, but its strongest orchestration capabilities are still fragmented across settings, tools, and background services. The product needs a coherent operator-facing control plane that closes the most visible gap against Paperclip's BYO-agent, heartbeat, budget, and governance story.

---

## 1. Problem Statement

Team-X is already deep, but some of its most important orchestration primitives are not yet productized as a single operating model:

1. provider and runtime choice exists, but there is no first-class `bring your own agent runtime` layer for employees
2. scheduled background behavior exists, but there is no native `Routines` surface for recurring company operations
3. cost telemetry and loop caps exist, but there is no unified budget governance model for companies, employees, providers, and routines
4. approvals exist in multiple subsystems, but there is no central operator inbox for decisions and escalations
5. artifacts and outcomes exist implicitly across tickets, files, and review flows, but they are not first-class work products
6. human supervision is still effectively single-user in practice, despite multi-user seams already appearing in the thread model and actor plumbing

The result is that Team-X can already do serious work, but it does not yet present its autonomy story as clearly as the market leaders it is being compared against.

---

## 2. Goals

- Add a new operator-facing `Autonomy` surface to the product.
- Make `Agent Runtimes` a first-class concept distinct from raw providers.
- Add first-class `Routines` for recurring company work.
- Add `Budgets` with hard caps, alerts, escalation thresholds, and stop policies.
- Add a unified `Approvals Inbox`.
- Add first-class `Artifacts` and explicit outcome tracking.
- Replace the current single-human placeholder assumption with a real `Operators & Access` foundation.
- Preserve Team-X's current `desktop-first`, `privacy-first`, `local-first` identity.
- Design the architecture so shared operators and hosted deployments can land without a rewrite.

---

## 3. Non-goals

- No forced hosted account or login requirement for the base product.
- No remote sync engine or cloud deployment implementation in the first bundle.
- No attempt to replace the existing provider, extensions, MCP, or authority systems; this bundle should compose with them.
- No drag-and-drop workflow builder.
- No rebranding of the existing dashboard, telemetry, or user-guide surfaces; those should integrate with the new control plane rather than get replaced.
- No attempt to fully solve conflict-free offline/online sync in this wave.

---

## 4. Product Decisions

### 4.1 The bundle is one control plane, not six hidden subsystems

These features should not be introduced as scattered settings cards or isolated dialogs. Team-X should gain a new first-class app destination:

- `Autonomy`

Recommended subviews:

- `Runtimes`
- `Routines`
- `Budgets`
- `Approvals`
- `Artifacts`
- `Access`

The goal is for operators to understand how autonomous work is configured, governed, and supervised from one place.

### 4.2 Local-first remains the default product mode

Team-X should continue to work as a complete local desktop app with no external account dependency.

Default posture:

- embedded/local data
- local owner
- optional external providers and runtimes
- optional remote deployment later

This preserves the product's current identity and keeps it differentiated from cloud-only orchestration products.

### 4.3 Multi-user and cloud must be designed in now

Even though local-first remains the default, the first bundle should stop baking in a single-human assumption.

This means:

- proper operator identities instead of a single hardcoded local human id
- actor-aware approvals and audit records
- access roles for human supervisors
- transport seams that can later support local IPC or remote API without changing the domain model

The current placeholder in [handlers.ts](../../apps/desktop/src/main/ipc/handlers.ts) is the exact seam to replace.

### 4.4 Operators and employees are different things

Team-X already models `employees` as autonomous workers. This bundle should explicitly model `operators` as human supervisors.

Operators should have:

- identity
- role
- permissions
- workspace/company membership
- approval authority
- audit attribution

Employees should continue to represent AI workers, whether they are powered by internal loops or external runtimes.

### 4.5 Agent runtimes are pluggable profiles

Providers alone are not enough. Team-X needs a higher-level runtime model that can power an employee through:

- internal Team-X LLM orchestration
- Codex-style external workers
- Claude Code / Cursor-style adapters
- Bash workers
- HTTP workers
- sandbox/cloud workers later

Each employee should bind to a `runtime profile`, not directly to a raw provider.

### 4.6 Routines create visible work, not hidden automation

Recurring operations should not happen as invisible background magic.

A routine must resolve into visible system objects such as:

- generated tickets
- review requests
- reports
- artifact rows
- escalation items

This keeps autonomy inspectable and consistent with Team-X's existing audit and work-object model.

### 4.7 Budgets are business controls, not just technical loop caps

Team-X already exposes technical execution limits. The new bundle should add product-level budget controls:

- monthly company spend
- employee spend caps
- routine spend caps
- provider or runtime category caps
- alert thresholds
- auto-pause or require-approval policies

Technical loop caps remain important, but they become one enforcement layer inside a broader governance model.

### 4.8 Approvals are unified

The current planner and authority approvals should become inputs to one `Approvals Inbox`.

Approval item types should include:

- runtime assignment review
- routine enablement or override
- budget exception
- authority request
- plan approval
- deliverable review
- artifact signoff

### 4.9 Artifacts are first-class work products

The system needs to make outcomes more visible than "ticket status changed."

Artifacts should capture:

- generated document
- file export
- code patch or repo outcome
- report
- image or design output
- deployment or publish result
- review package

Every artifact should tie back to the company, project, ticket, employee, routine, and approval context that produced it.

---

## 5. Recommended User Experience

## 5.1 New top-level Autonomy surface

Add `autonomy` to the main app routing and left navigation.

This surface should use the same mission-language shell as Dashboard, Tickets, Telemetry, and User Guide, but it should frame autonomy as an operator system, not a settings page.

Recommended above-the-fold content:

- autonomy status hero
- active budget status
- pending approvals count
- routines due / running
- recent artifacts
- runtime health summary

## 5.2 Runtimes view

This view answers:

- what runtime powers each employee
- whether it is healthy
- what capabilities and authority it requires
- whether it is local, external, or cloud-backed

It should integrate with existing Providers and Extensions rather than replace them.

## 5.3 Routines view

This view should show:

- enabled recurring routines
- cadence
- next run
- last run status
- budget policy
- approval policy
- outputs produced

Operators need to be able to create a recurring operating loop without dropping to code or hidden settings.

## 5.4 Budgets view

This becomes the operator's financial safety surface.

It should show:

- company monthly burn
- per-employee allocation
- per-routine allocation
- provider spend mix
- nearing-limit alerts
- recent stop / throttle events

Actions should include:

- adjust budget
- set hard stop
- require approval above threshold
- pause a runtime or routine

## 5.5 Approvals inbox

This is the governance nerve center.

It should support:

- filtering by company, urgency, kind, and owner
- approve / deny / request changes
- visible rationale
- links back to the originating work object
- operator attribution on every decision

## 5.6 Artifacts view

Artifacts need a dedicated retrieval and handoff surface rather than being buried in tickets, files, or ad hoc comments.

Recommended affordances:

- list/grid toggle
- artifact type chips
- generated-by metadata
- source ticket / routine / employee references
- preview or open action
- approval or publish status

## 5.7 Access view

This is the first step toward multi-user and shared/cloud operation.

It should manage:

- local owner
- invited operators
- operator roles
- workspace membership
- approval authority
- local-only vs shared-mode posture

The first release can keep invitations or remote sync dormant, but the data model and UI should stop assuming one human.

---

## 6. Data Model

New durable concepts should be introduced in shared types and persisted locally.

Recommended entities:

- `Operator`
- `OperatorMembership`
- `RuntimeProfile`
- `EmployeeRuntimeBinding`
- `Routine`
- `RoutineRun`
- `BudgetPolicy`
- `BudgetLedgerEntry`
- `ApprovalItem`
- `ApprovalDecision`
- `ArtifactRecord`

### 6.1 Operator

Represents a human supervisor.

Fields should include:

- `id`
- `displayName`
- `email` or local identifier
- `authMode`
- `createdAt`
- `updatedAt`

### 6.2 OperatorMembership

Scopes an operator to a company/workspace.

Fields should include:

- `operatorId`
- `companyId`
- `role`
- `canApproveBudget`
- `canApproveAuthority`
- `canManageRoutines`
- `canManageRuntimes`

### 6.3 RuntimeProfile

Represents a reusable worker runtime definition.

Fields should include:

- `id`
- `companyId`
- `name`
- `kind`
- `sourceKind`
- `providerRef`
- `extensionRef`
- `configJson`
- `health`
- `requiresAuthorityReview`
- `lastCheckedAt`

### 6.4 EmployeeRuntimeBinding

Assigns an employee to a runtime profile and policy layer.

Fields should include:

- `employeeId`
- `runtimeProfileId`
- `fallbackRuntimeProfileId`
- `enabled`
- `approvalPolicy`
- `budgetPolicyId`

### 6.5 Routine

Represents recurring work.

Fields should include:

- `id`
- `companyId`
- `name`
- `description`
- `triggerKind`
- `scheduleJson`
- `targetKind`
- `targetRefId`
- `budgetPolicyId`
- `approvalPolicy`
- `enabled`

### 6.6 BudgetPolicy

Represents spend and safety policy.

Fields should include:

- `id`
- `companyId`
- `scopeKind`
- `scopeRefId`
- `period`
- `hardCapUsd`
- `warningThresholdPct`
- `autoPause`
- `requireApprovalAboveUsd`

### 6.7 ApprovalItem

Unifies approval work across the system.

Fields should include:

- `id`
- `companyId`
- `kind`
- `status`
- `priority`
- `requestedByOperatorId`
- `requestedByEmployeeId`
- `subjectRefKind`
- `subjectRefId`
- `summary`
- `payloadJson`
- `createdAt`
- `resolvedAt`

### 6.8 ArtifactRecord

Stores outcome-oriented work products.

Fields should include:

- `id`
- `companyId`
- `kind`
- `title`
- `sourceKind`
- `sourceRefId`
- `fileId`
- `uri`
- `previewJson`
- `status`
- `createdByEmployeeId`
- `createdByRoutineId`
- `approvedByOperatorId`

---

## 7. Recommended Architecture

## 7.1 Renderer

Add a new feature area:

- `apps/desktop/src/renderer/src/features/autonomy/`

Recommended modules:

- `autonomy-view.tsx`
- `runtimes-panel.tsx`
- `routines-panel.tsx`
- `budgets-panel.tsx`
- `approvals-panel.tsx`
- `artifacts-panel.tsx`
- `access-panel.tsx`

The view should consume existing mission shell primitives and align visually with Dashboard and Telemetry.

## 7.2 Shared contracts

Extend:

- [packages/shared-types/src/entities.ts](../../packages/shared-types/src/entities.ts)
- [packages/shared-types/src/ipc.ts](../../packages/shared-types/src/ipc.ts)
- [packages/shared-types/src/events.ts](../../packages/shared-types/src/events.ts)

The event layer should become actor-aware and approval-aware across the new surfaces.

## 7.3 Main-process services

Recommended services:

- `operator-access-service.ts`
- `runtime-profile-service.ts`
- `routine-service.ts`
- `budget-governance-service.ts`
- `approval-inbox-service.ts`
- `artifact-service.ts`

These should sit beside the existing IPC, extensions, authority, orchestrator, telemetry, and copilot services rather than being folded into them.

## 7.4 Scheduler integration

Routines should not invent a parallel scheduling universe.

Recommended rule:

- the orchestrator remains the core execution scheduler
- routines are higher-level definitions that enqueue explicit work into the existing company/work pipeline

This mirrors the current "orchestrator is the only scheduler" posture and avoids split-brain execution logic.

## 7.5 Budget enforcement layers

Budget enforcement should happen in four places:

1. routine admission
2. runtime dispatch
3. provider / loop execution guardrails
4. approval escalation for over-limit actions

This keeps business policy and technical safety aligned instead of duplicating them.

## 7.6 Multi-user and cloud seam

The first bundle should introduce a clear boundary between transport and domain logic:

- local desktop mode uses IPC
- future shared mode can use the same contracts over HTTP/WebSocket

This means avoiding renderer logic that assumes local-only identity resolution or one-human-only actor defaults.

---

## 8. Integration With Existing Team-X Surfaces

The new control plane should integrate with, not replace:

- [settings-view.tsx](../../apps/desktop/src/renderer/src/features/settings/settings-view.tsx) for low-level configuration
- [extensions-section.tsx](../../apps/desktop/src/renderer/src/features/settings/extensions-section.tsx) for skills, MCPs, and authority
- [telemetry-view.tsx](../../apps/desktop/src/renderer/src/features/telemetry/telemetry-view.tsx) for cost and performance analytics
- [user-guide-view.tsx](../../apps/desktop/src/renderer/src/features/user-guide/user-guide-view.tsx) for onboarding and operator education
- the existing audit and dashboard surfaces for visibility and evidence

Recommended division of responsibility:

- `Settings` = configuration details
- `Autonomy` = operations, policy, governance, and outcomes
- `Dashboard` = live mission pulse
- `Telemetry` = analytics and spend analysis
- `Audit` = evidence trail

---

## 9. Risks And Mitigations

### 9.1 Risk: the bundle becomes too broad and stalls

Mitigation:

- deliver the bundle in slices with a strong foundation first
- prioritize runtime identity, routines, budgets, and approvals before deeper artifact polish

### 9.2 Risk: cloud readiness dilutes the local-first product

Mitigation:

- treat shared/cloud as a seam in the architecture, not a required runtime mode
- keep the desktop product fully usable without login

### 9.3 Risk: duplicate or conflicting scheduler logic

Mitigation:

- keep the orchestrator as the single execution scheduler
- model routines as declarative recurrence plus explicit work creation

### 9.4 Risk: governance turns into friction

Mitigation:

- keep approval policies tunable
- let operators choose thresholds and auto-approve safe categories
- design Approvals as a productivity surface, not a punishment surface

---

## 10. Recommended Sequencing

Recommended implementation order:

1. `Operators & Access foundation`
2. `Runtime profiles and employee bindings`
3. `Routine definitions and scheduler integration`
4. `Budget policies and enforcement`
5. `Approvals Inbox`
6. `Artifacts and explicit outcomes`
7. `Shared/cloud transport seams and hardening`

This order builds the control model first, then the recurrence engine, then the governance and outcome layers on top.
