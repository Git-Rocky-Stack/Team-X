# Team-X Dashboard Mission Control Design

> **Status:** Approved 2026-04-21.
> **Scope:** Transform the Team-X dashboard into an operations-first mission-control surface with a bold hybrid visual direction, live agent telemetry, combined employee queue tracking, and workspace-scoped panel preferences.
> **Primary driver:** The current dashboard works, but it still reads like a collection of utility views. Team-X needs a stronger control-surface identity that makes active work, queue pressure, and agent activity visible at a glance.

---

## 1. Problem Statement

Team-X already has the right operational data, but the dashboard does not yet surface it with enough clarity or presence.

Current gaps:

1. **The dashboard is visually flat.** The top shell, subtab bar, and cards are serviceable, but they do not establish a strong operational hierarchy.
2. **Live work is fragmented.** Agent runs, employee activity, command history, telemetry, and ticket backlog exist in separate surfaces, which forces the user to stitch together the current operational picture mentally.
3. **Progress signaling is weak.** The product already emits step-level agent events and durable ticket state, but the dashboard does not yet turn those into a coherent progress tracker.
4. **Customization is missing at the dashboard layer.** Users need to be able to show or hide the most important live panels without losing the default operational layout.

The product consequence is predictable:

- the dashboard feels less important than the underlying data actually is
- active work is harder to scan than it should be
- users must jump between dashboard, chat, telemetry, and tickets to understand current execution state
- the app looks competent, but not yet polished or distinctive

---

## 2. Goals

- Establish the dashboard as the primary operational surface for Team-X.
- Adopt a bold hybrid visual direction that feels more cinematic and intentional while remaining enterprise-credible.
- Make live agent execution visible through an `Agent Runs` board.
- Make employee workload visible through an `Employee Queues` board that combines durable ticket backlog and live runtime activity.
- Keep both panels visible by default in a hybrid layout.
- Let users show or hide `Agent Runs` and `Employee Queues` directly from the dashboard.
- Persist those visibility choices per workspace.
- Reuse real app data rather than inventing placeholder progress metrics.

---

## 3. Non-goals

- No dashboard rewrite that changes the core information architecture of the rest of the app in the same pass.
- No fake percentage complete bars for agent runs when plan length is unknown.
- No new global settings surface for dashboard layout preferences.
- No attempt to collapse full Telemetry, Tickets, or Chat functionality into the dashboard.
- No backend invention for metrics the app does not already know how to produce.

---

## 4. Decisions

### 4.1 Dashboard becomes a mission-control surface

The dashboard should no longer feel like just another tab. It becomes the control room for current work, queue pressure, and system activity.

### 4.2 The default dashboard is a hybrid board

Two live panels define the page:

- `Agent Runs`
- `Employee Queues`

Both are visible by default.

### 4.3 Visibility controls must be explicit and local

The user can show or hide `Agent Runs` and `Employee Queues` from the dashboard header area. These controls should be visible, immediate, and reversible.

### 4.4 Dashboard progress must stay honest

Agent progress is represented through real step state and terminal outcomes, not synthetic completion percentages. Employee queue state is represented through durable ticket counts plus live runtime overlays.

### 4.5 Preferences persist per workspace

Dashboard layout preferences should be stored in `company.settings`, not in global app settings and not in transient local-only UI state.

---

## 5. Visual Direction

The approved visual direction is `bold hybrid`.

Characteristics:

- stronger depth, contrast, and atmospheric surfaces
- a more commanding top-of-page presence
- richer use of gradients, overlays, and layered panels
- operational density without collapsing into clutter
- a more distinctive identity than the current neutral utility look

Design principles:

- maintain legibility first
- let red remain the anchor accent, but support it with more nuanced surface contrast
- use visual weight to direct attention toward active work, not chrome
- keep motion meaningful and sparse

---

## 6. Layout

### 6.1 Top-level structure

The mission-control dashboard is organized into four layers:

1. `Operations Hero`
2. `Hybrid Board`
3. `Secondary Rail`
4. `Deep-link actions`

### 6.2 Operations Hero

The hero sits above the hybrid board and establishes the page identity.

It contains:

- workspace identity and context
- high-signal operational metrics
- readiness and activity indicators
- `Agent Runs` / `Employee Queues` visibility toggles
- a `Reset layout` action

### 6.3 Hybrid Board

Desktop layout:

- a wider `Agent Runs` panel on the left
- a narrower `Employee Queues` panel on the right

If one panel is hidden, the remaining panel expands to fill the row.

Mobile and narrow widths:

- `Operations Hero`
- `Agent Runs`
- `Employee Queues`
- secondary panels

### 6.4 Secondary Rail

Below the primary live row, the dashboard includes compressed supporting panels:

- `Copilot Insights`
- `Recent Commands`
- `Telemetry Snapshot`

These panels remain important, but they do not outrank live execution state.

---

## 7. Panel Specifications

### 7.1 Operations Hero

Purpose:

- give the user an immediate operational read
- provide the dashboard controls without making them feel hidden

Content:

- active agent runs
- employees currently active
- blocked work count
- queue pressure
- today token usage
- today cost
- compact status cluster for operational readiness

Behavior:

- metric chips should be actionable where practical
- clicking a metric should filter or route to the relevant deeper surface when a clear destination exists

### 7.2 Agent Runs

Purpose:

- make current and recent agentic work visible without forcing the user into the Copilot thread first

Each run card should show:

- request label or derived title
- current phase or latest step
- step count
- elapsed time
- token totals
- cost total
- terminal result when finished
- failure reason when failed

Progress grammar:

- `planning`
- `tool call`
- `tool result`
- `delegation`
- `review`
- `answer`
- `failed`

Interaction:

- clicking a run opens the related Copilot conversation or transcript detail

### 7.3 Employee Queues

Purpose:

- show who is carrying work, what kind of work it is, and where pressure is forming

This panel uses a combined model:

- durable ticket backlog by status
- live runtime overlays from current employee activity and queue state

Each employee card or row should show:

- employee identity
- live status
- ticket counts by `open`, `in-progress`, `blocked`, `done`
- queue pressure summary
- current live activity when present

Visual grammar:

- segmented workload summary for durable status counts
- live state layered on top, not mixed indistinguishably into backlog counts

Interaction:

- backlog-related actions route to Tickets
- live activity can route to the relevant chat or employee context

### 7.4 Secondary Panels

`Copilot Insights`

- remains visible, but compressed
- preserves awareness of important findings without overtaking active work

`Recent Commands`

- supports auditability and command-center feel
- remains available as a compact operational log

`Telemetry Snapshot`

- surfaces only concise summary stats on the dashboard
- full analytic depth remains on the Telemetry page

---

## 8. Data Sources

The dashboard redesign should be built on existing Team-X surfaces where possible.

Primary sources:

- `agent.step`, `agentic.completed`, and `agentic.failed` dashboard events
- persisted run snapshots from `command.getRunSnapshot`
- renderer `employeeLive` state driven by dashboard events
- ticket backlog via ticket list data and assignee status
- direct-chat queue state already tracked in the renderer store
- telemetry aggregates already exposed to the Telemetry page
- Copilot insight summaries
- recent command history

This is important: the dashboard should not simulate activity it does not know. If a metric or tracker cannot be grounded in current product state, it should not ship in the first pass.

---

## 9. Interactions

- `Agent Runs` and `Employee Queues` toggles are visible in the dashboard hero.
- Both toggles default to `on`.
- Hiding one panel immediately reflows the layout.
- `Reset layout` restores the default hybrid board.
- Hero metrics should deep-link into the most relevant underlying surfaces when there is a clear semantic mapping.
- Run cards should open the related Copilot transcript.
- Employee queue cards should support quick navigation into Tickets, Chat, or employee context depending on the clicked affordance.

---

## 10. Persistence

Dashboard layout preferences should be stored per workspace inside `company.settings`.

Recommended shape:

```ts
{
  dashboardLayout?: {
    version: 1;
    showAgentRuns: boolean;
    showEmployeeQueues: boolean;
  };
}
```

Why this shape:

- keeps the preference scoped to the workspace
- stays additive to the existing company settings model
- gives the layout object a version so future dashboard preferences can evolve safely

Default behavior:

- no saved layout means both panels are visible

---

## 11. Empty And Error States

The dashboard should remain informative even when work is quiet.

Examples:

- no active runs -> monitoring-ready state, not a dead panel
- no queued work -> ready-for-assignment state
- no insights -> healthy quiet state

Error handling should be panel-local:

- one panel can fail without blanking the whole dashboard
- retry actions should live inside the affected panel

---

## 12. Testing Strategy

The redesign should ship with targeted coverage for:

- panel visibility defaults
- workspace-scoped visibility persistence
- layout expansion when one primary panel is hidden
- agent run cards reacting to live step and terminal events
- employee queue aggregation from tickets and live state
- dashboard empty states
- dashboard panel-local error states

---

## 13. Success Criteria

- The dashboard immediately communicates active work, queue pressure, and operational state.
- `Agent Runs` and `Employee Queues` are both visible and useful by default.
- Users can show or hide those panels directly from the dashboard and have that layout persist per workspace.
- Agent progress feels honest and grounded in real events.
- Employee workload reflects both ticket backlog and live runtime activity.
- The page feels visually stronger and more polished without becoming noisy or misleading.
