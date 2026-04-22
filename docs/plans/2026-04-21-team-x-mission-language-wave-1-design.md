# Team-X Mission Language Wave 1 Design

> **Status:** Approved 2026-04-21.
> **Scope:** Carry the `Mission Control` visual language through the next set of high-frequency Team-X surfaces without rewriting the app's information architecture.
> **Wave 1 surfaces:** top bar and workspace switcher, tickets, telemetry, chat, copilot, and company settings.
> **Primary driver:** the dashboard now has a distinctive, polished operational identity, but the rest of the app still reads as an older flat utility shell.

---

## 1. Problem Statement

The new Mission Control dashboard establishes a stronger Team-X visual direction, but the surrounding surfaces have not caught up yet.

Current gaps:

1. **The app shell is inconsistent.** The top bar, workspace switcher, and most view headers still use the older flat tab-strip treatment.
2. **High-frequency views feel visually disconnected.** Tickets, Telemetry, Chat, Copilot, and Company Settings still behave like separate utility modules rather than parts of one operational system.
3. **The dashboard language is not reusable yet.** Mission Control currently proves the direction, but the underlying surface grammar is not yet expressed as a shared app-level pattern.
4. **A page-by-page restyle would drift quickly.** Without a small shared shell layer, each view would end up approximating the dashboard instead of matching it.

The product consequence is straightforward:

- the dashboard feels premium while the rest of the app feels transitional
- the app loses continuity when users navigate out of Mission Control
- Wave 2 carry-forward work would become slower and less consistent

---

## 2. Goals

- Extend the `bold hybrid` Mission Control language across the next highest-traffic Team-X surfaces.
- Keep the carry-forward visibly coherent without collapsing every page into the same layout.
- Introduce a small shared shell/surface layer that other pages can reuse.
- Preserve existing workflows, navigation, and data contracts.
- Make Tickets, Telemetry, Chat/Copilot, and workspace controls feel native to the same operational product.

---

## 3. Non-goals

- No broad information-architecture rewrite.
- No backend, IPC, or query-contract redesign.
- No wholesale design-system rebuild before page work begins.
- No fake metrics, decorative chrome, or dashboard-only motifs copied where they do not belong.
- No Wave 2 pass in the same implementation cycle.

---

## 4. Core Decisions

### 4.1 Use shell-first systemization

The correct carry-forward path is not a page-by-page imitation of the dashboard. It is a small shared shell layer that codifies the dashboard's visual grammar and lets each page adopt it appropriately.

This keeps the app coherent without forcing every page into the exact Mission Control structure.

### 4.2 Keep each page's function intact

The restyle should wrap existing page behavior, not replace it.

- Tickets stays a board-plus-detail workflow.
- Telemetry stays a multi-subview analytics surface.
- Chat and Copilot stay communication surfaces.
- Company Settings stays a settings sheet.

### 4.3 Wave 1 focuses on the highest-frequency operational surfaces

Wave 1 includes:

- top bar and workspace switcher
- tickets
- telemetry
- chat
- copilot
- company settings

Wave 2 will reuse the same primitives later for lower-frequency views such as Projects, Meetings, Audit, Settings, and Org Chart.

### 4.4 Mission language should live in shared primitives

The carry-forward should be built from a narrow reusable layer rather than ad-hoc per-page class strings.

Recommended shared primitives:

- `MissionPageShell`
- `MissionHero`
- `MissionSectionCard`
- `MissionControlRow`
- `MissionStateBlock`
- `MissionMetricTile`
- `MissionRailCard`

### 4.5 The chrome changes more than the data surfaces

The strongest carry-forward win comes from page framing, section hierarchy, controls, and state treatment.

Charts, tables, boards, and transcripts should remain readable and functional rather than being over-styled.

---

## 5. Visual Direction

The approved direction remains `bold hybrid`.

Characteristics:

- darker atmospheric page framing
- stronger surface depth and panel separation
- elevated rounded cards with more deliberate contrast
- tighter action/control rows
- richer use of badges, metric chips, and sectional hierarchy
- restrained motion and ornament

Design principles:

- readability before spectacle
- red remains the anchor accent
- active work outranks chrome
- different page types should feel related, not identical

---

## 6. Wave 1 Surface Specs

### 6.1 Top Bar And Workspace Switcher

Purpose:

- turn the flat top bar into a command-deck shell that matches Mission Control

Behavior:

- keep the current tab set and navigation model
- strengthen active-state emphasis and grouping
- make the workspace switcher and copilot toggle read like first-class controls

Outcome:

- the app feels like it has one shell, not one premium page and several older pages

### 6.2 Tickets

Purpose:

- make the ticket board feel like a primary operational surface, not a utility board dropped into the app

Behavior:

- add an operations header above the board
- surface high-signal queue counts and quick actions
- wrap the kanban board and detail panel in stronger mission-style surfaces

Outcome:

- tickets feels like a direct continuation of Mission Control's queue language

### 6.3 Telemetry

Purpose:

- make telemetry feel like a polished analytics command surface

Behavior:

- add a page hero with scope context and top-level summary metrics
- convert subtabs and kind filters into mission-style segmented controls
- preserve the current subviews and analytics structure

Outcome:

- telemetry keeps its analytic depth while gaining the same product identity as the dashboard

### 6.4 Chat And Copilot

Purpose:

- unify communication surfaces into one consistent operational language

Behavior:

- keep transcripts readable and fast
- restyle headers, banners, pinned states, and read-only status strips
- align `ChatView`, `ChatDrawer`, and `CopilotSidebar` so they feel like different modes of the same system

Outcome:

- conversation surfaces feel integrated instead of partially adjacent utilities

### 6.5 Company Settings

Purpose:

- upgrade the workspace settings sheet from a generic form drawer into a premium workspace-control surface

Behavior:

- preserve the existing sheet interaction model
- group sections more clearly
- give save state and destructive actions stronger hierarchy and containment

Outcome:

- workspace settings feels like part of the operational shell instead of an admin afterthought

---

## 7. Shared Primitive Boundaries

The shared mission layer should remain intentionally narrow.

Include:

- page framing
- page hero layout
- section card treatment
- control-row treatment
- state blocks
- metric tiles

Do not include:

- rewrites of low-level primitives like `Button`, `Input`, or `Sheet`
- new feature logic
- per-page data projection logic
- global theme-token upheaval

Recommended location:

- a small renderer shared layer under a neutral feature namespace such as `features/mission/` or `features/shell/`

---

## 8. Rollout

Wave 1 should ship in four slices:

1. `Shell foundation`
2. `Tickets`
3. `Telemetry`
4. `Chat/Copilot + Company Settings`

This sequencing keeps the app coherent early while containing risk.

---

## 9. Verification

Verification standards:

- focused renderer tests for new shared shell primitives
- touched-view tests where the repo already uses source-level guards or unit coverage
- live app launch after each substantial slice
- explicit review of loading, empty, and error states
- navigation checks across Dashboard, Tickets, Telemetry, Chat, Copilot, and workspace settings

---

## 10. Success Criteria

- Mission Control no longer feels visually isolated from the rest of the app.
- Wave 1 surfaces feel deliberately unified while still matching their functional roles.
- Shared mission primitives are clear enough to support Wave 2 without another redesign pass.
- The carry-forward improves product quality without destabilizing existing workflows.
