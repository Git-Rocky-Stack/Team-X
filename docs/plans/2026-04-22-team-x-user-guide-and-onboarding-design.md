> **Status:** Approved 2026-04-22 from the live Team-X shell review and user-approved onboarding direction.
> **Scope:** Add a feature-rich in-app User Guide with workspace-scoped interactive onboarding, role-based documentation, and a persistent entry near the bottom of the left rail.
> **Primary driver:** Team-X now spans operations, chat, telemetry, extensions, MCPs, and authority. The product needs a comprehensive in-app guide that helps new teams get oriented without pushing them out to external docs.

---

## 1. Problem Statement

Team-X has grown into a real operational workspace, but onboarding is still implicit:

1. critical setup flows live across Settings, Dashboard, Chat, Extensions, and Org
2. there is no single place to understand how the product works by role
3. first-time users are not guided through the minimum viable setup for a workspace
4. documentation exists in repo planning docs, not in the product where users need it

The result is a strong shell with weak discoverability. Users can see the product, but they cannot learn it systematically from inside the product.

---

## 2. Goals

- Add a first-class `User Guide` destination inside the app.
- Place a persistent `User Guide` entry toward the bottom of the left rail.
- Support role-based documentation for:
  - workspace owner
  - operator
  - builder
- Auto-open a welcome onboarding surface for workspaces that have not dismissed onboarding yet.
- Make the guide interactive:
  - checklist tasks
  - progress state
  - jump actions into live app views
- Persist progress per workspace, not per local device only.
- Keep onboarding advisory rather than hard-gated.
- Drive guide content from structured in-app content definitions, not raw markdown rendering.

---

## 3. Non-goals

- No external docs website in this phase.
- No modal-only or sheet-only guide container.
- No hard launch blockers that prevent normal product exploration.
- No CMS or remote-managed guide content in the first release.
- No attempt to solve per-user identity or account-level progress tracking in this pass.

---

## 4. Product Decisions

### 4.1 The guide is a first-class app surface

The guide should render as a dedicated full app view in the main canvas, not a modal, sheet, or Settings subsection.

Why:

- the guide needs room for rich content, search, roles, and checklist interactions
- it should feel like part of the product, not a secondary support panel
- it can reuse the mission shell and visual language already established across Team-X

### 4.2 One guide, multiple role tracks

There should be one `User Guide` surface with role-aware sections for:

- `Workspace Owner`
- `Operator`
- `Builder`

This avoids scattering docs into multiple destinations while still keeping the content targeted.

### 4.3 First-run opens the guide, but the guide always stays accessible

New or not-yet-dismissed workspaces should land in the guide welcome view once the workspace resolves. After dismissal, the guide remains permanently available from the left rail.

This makes onboarding visible without trapping the user in a repeated interruption loop.

### 4.4 Onboarding is interactive

The guide should not be a passive wall of text. It should include:

- recommended setup checklists
- auto-detected completion where possible
- manual confirmation for soft-learning items
- jump actions into the live product

### 4.5 Progress is per workspace

Guide state belongs in workspace/company settings, not only in local renderer state.

Why:

- onboarding milestones like providers, employees, extensions, and authority are shared workspace concerns
- switching workspaces should switch guide progress naturally
- teams should see the same setup state for the same workspace

### 4.6 Core setup is recommended, not required

The guide can label some tasks as `Core setup`, but it should not block the rest of the app.

This preserves exploration while still communicating what matters most.

### 4.7 Content is structured in code

The first implementation should use typed in-app content objects rather than trying to render markdown files with behavioral overlays.

This is the only clean way to support:

- role filtering
- task ids
- progress metrics
- search
- deep links
- auto-detected completion rules

---

## 5. Recommended User Experience

## 5.1 Left-rail entry

Add a `User Guide` utility entry near the bottom of [sidenav.tsx](../../apps/desktop/src/renderer/src/app/sidenav.tsx), above the live status footer.

The entry should:

- match the mission-language chrome
- be visually quieter than the primary top navigation
- show active state when the guide is open
- optionally show a small progress pill like `3 core steps left`

## 5.2 Guide landing experience

The landing view should be a welcome-oriented hero that adapts to the active workspace:

- workspace name
- progress summary
- recommended next actions
- selected role track

Primary actions:

- continue onboarding
- jump to the next setup task
- dismiss welcome for this workspace

## 5.3 Guide layout

Recommended layout:

- left index rail inside the main guide canvas
- center reading pane for documentation
- right utility rail for checklist state, related actions, and quick links

Sections should include:

- `Getting Started`
- `Mission Control`
- `Tickets and Projects`
- `Chat and Copilot`
- `Extensions and Authority`
- `Telemetry and Audit`
- `Troubleshooting`

## 5.4 Role filtering

Every section can be tagged for one or more roles:

- owner-only
- operator-only
- builder-only
- shared

The selected role changes both:

- the order and prominence of sections
- the checklist recommendations

It should not hide all shared material, only prioritize the right material for the chosen persona.

---

## 6. Content Model

Create a structured content module under:

- `apps/desktop/src/renderer/src/features/user-guide/guide-content.ts`

Recommended types:

- `GuideRole`
- `GuideSection`
- `GuideTask`
- `GuideJumpAction`
- `GuideCallout`

### 6.1 Section shape

Each section should have:

- `id`
- `title`
- `summary`
- `roles`
- `category`
- `blocks`
- `taskIds`
- `relatedViews`

### 6.2 Block shape

Supported block kinds should be simple and composable:

- paragraph
- bullet list
- callout
- metric explainer
- troubleshooting note
- jump action group

### 6.3 Task shape

Each interactive task should include:

- `id`
- `title`
- `description`
- `roles`
- `priority`
- `kind` (`auto`, `manual`, `jump`)
- `core`
- `action`
- `completionRule`

This gives the UI stable task ids and deterministic progress behavior.

---

## 7. Progress And Persistence

Persist guide state inside `company.settings`.

Recommended addition:

- `company.settings.userGuide`

Suggested structure:

- `welcomeDismissedAt`
- `lastViewedSectionId`
- `selectedRole`
- `completedTaskIds`
- `manualTaskIds`

The guide should compute total completion from:

1. persisted manual/checklist state
2. auto-detected live workspace state

That means the stored object can stay small while the UI still feels live.

### 7.1 Auto-detected tasks

Initial auto-complete candidates:

- at least one provider configured and enabled
- at least one employee exists
- at least one extension installed
- at least one authority grant or request reviewed
- telemetry or operational activity exists

### 7.2 Manual tasks

Examples:

- review the operating model
- understand authority boundaries
- confirm onboarding checklist completion

---

## 8. Deep Links And Actions

Guide tasks should navigate into the live app instead of only marking boxes complete.

Recommended initial actions:

- open `Settings`
- focus `Extensions & Authority`
- open `Mission Control`
- open `Chat`
- open `Telemetry`
- open `Audit`
- open the `Hire` dialog

This requires a small guide action layer in renderer state so the guide can request navigation and selected utility dialogs cleanly.

---

## 9. Implementation Architecture

## 9.1 Renderer

Add a new feature area:

- `features/user-guide/`

Recommended files:

- `guide-content.ts`
- `guide-types.ts`
- `guide-progress.ts`
- `use-user-guide.ts`
- `user-guide-view.tsx`

The view should reuse mission-shell primitives rather than inventing a new visual system.

## 9.2 Store

Add a new top-level view to the app store:

- `user-guide`

Add a minimal guide action seam for:

- opening the guide
- opening the hire dialog from a guide task
- focusing the Settings surface on a named section

## 9.3 Persistence

Use the existing `ipc.companies.update` path plus `['companies']` cache invalidation/optimistic updates for guide settings, mirroring the dashboard layout pattern.

This avoids introducing any new persistence channel for workspace-scoped onboarding state.

---

## 10. Error Handling

- No active workspace:
  - show a neutral guide state explaining that onboarding starts after selecting or creating a workspace
- Failed settings persistence:
  - show inline save error and keep local UI stable
- Missing deep-link target:
  - fall back to switching only the main view
- Empty operational state:
  - show onboarding-oriented copy rather than generic empty docs

The guide should never feel broken just because the workspace is early-stage.

---

## 11. Testing Strategy

### 11.1 Source and composition guards

- new `user-guide` route is added to the app store and root app switch
- left rail includes the persistent guide entry in the lower utility cluster
- guide content exports stable section ids and task ids

### 11.2 Behavior tests

- first-run workspace opens the guide when `welcomeDismissedAt` is absent
- dismissing welcome persists through `ipc.companies.update`
- switching workspaces changes guide progress
- jump actions target valid views and utility actions
- auto-complete rules reflect live provider/employee/extension state

### 11.3 Verification gates

At minimum:

- focused Vitest on guide store/helpers/rendering
- `pnpm -F @team-x/desktop typecheck`
- `pnpm -F @team-x/desktop build`
- `git diff --check`

---

## 12. Recommended First Cut

The best first implementation slice is:

1. add the new `user-guide` view and left-rail entry
2. ship the structured guide shell with role selection and section navigation
3. persist workspace guide state through `company.settings.userGuide`
4. add first-run welcome + dismissal
5. add a small initial checklist with real jump actions and a few auto-detected tasks

This gives Team-X a real onboarding product surface immediately, while leaving room to deepen content and completion logic in later slices.
