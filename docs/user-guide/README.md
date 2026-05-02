# Team-X User Guide

Welcome to the Team-X user guide. These docs cover everything you need to run your AI organization — from hiring your first CEO to asking the Copilot why the frontend team is behind schedule.

New here? Start with **[Getting Started](getting-started.md)**, then browse by phase or jump to whatever you need.

## Keyboard-first primer

Two shortcuts unlock most of the intelligence surface:

- **`Cmd+K` / `Ctrl+K`** — open the natural-language command palette. See [Command Palette](command-palette.md) + [Keyboard Shortcuts](keyboard-shortcuts.md).
- **`Cmd+Shift+K` / `Ctrl+Shift+K`** — toggle the Copilot sidebar. See [Copilot UI](copilot-ui.md).

## Table of Contents

### Phase 1 — Core
1. [Getting Started](getting-started.md) — Installation, first boot, your first conversation

### Phase 2 — The Org
2. [Hiring Employees](hiring-employees.md) — The 57-role F10 catalog (55 user roles + 2 system roles), hiring from the pack, org chart management
3. [Managing Projects](managing-projects.md) — Goals, projects, tickets, and the kanban board

### Phase 3 — The Live Cockpit
4. [Configuring Providers](configuring-providers.md) — Adding LLM providers, privacy tiers, runtime strategies

### Phase 4 — Ship-Ready
5. [Using the Vault](using-the-vault.md) — File storage, search, integrity verification, ticket attachments
6. [Backup and Restore](backup-and-restore.md) — Creating backups, restoring, backup history

### Phase 5 — Intelligence Layer
7. [Command Palette](command-palette.md) — Natural-language commands (`Cmd+K`), 14 structured intents plus a `complex_request` fallback, destructive-action gate
8. [Agentic Loop](agentic-loop.md) — Ask free-form questions, grounded answers from the system-agent, six read-only tools, step / token / wall-clock budget caps
9. [Task Planner](task-planner.md) — Decompose projects into tickets, delegate with deterministic workload scoring, review deliverables, amber write-side confirmation gate
10. [Copilot Service](copilot-service.md) — Periodic analyzer that surfaces operational / cost / org / workflow / anomaly insights, ask-the-copilot
11. [Copilot UI](copilot-ui.md) — Sidebar panel + dashboard widget + `Cmd+Shift+K` shortcut for consuming copilot insights

### Phase 6 — Capabilities, Evidence, and Autonomy
12. [Task Planner](task-planner.md) — Capability-backed role fit for planner assignments with the M32 keyword fallback preserved
13. [Copilot Service](copilot-service.md) — Feedback category weights, repeated-dismissal suggestion audit trail, and Copilot run-kind tagging
14. [Copilot UI](copilot-ui.md) — Feedback suggestions, category/severity filters, and local CSV/JSON insight export
15. [Autonomy Control Plane](autonomy-control-plane.md) — Doctor, benchmarks, agent self-improvement, runtimes, routines, budgets, approvals, artifacts, memory, and operator access
16. [Phase 6 Walkthrough](../demo/phase-6-walkthrough.md) — Release-candidate demo path for capability role fit, feedback, telemetry filters, and export

### Reference
17. [Keyboard Shortcuts](keyboard-shortcuts.md) — Navigation, palette, sidebar, productivity shortcuts

## See also

- [Top-level README](../../README.md) — overview, installation, architecture, tech stack, testing
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — development setup, PR guidelines, role-pack contribution
- [CHANGELOG.md](../../CHANGELOG.md) — release notes
- [Phase 5 retrospective](../plans/2026-04-19-team-x-phase-5-retrospective.md) — what shipped, what went well, what cost us time, what's deferred
- [Phase 5 demo walkthrough](../demo/phase-5-walkthrough.md) — scripted ~15-minute tour of every shipped capability
- [Phase 6 retrospective](../plans/2026-04-26-team-x-phase-6-retrospective.md) — comparable six-section retrospective for the capabilities and evidence pass
- [Phase 6 demo walkthrough](../demo/phase-6-walkthrough.md) — scripted add-on tour for capability role fit, feedback, telemetry filters, and local export
- [Autonomy Doctor runtime contract](../runtime/autonomy-doctor.md) — deterministic operator health checks for autonomy readiness
- [Autonomy benchmark harness](../runtime/autonomy-benchmark-harness.md) — repeatable Paperclip-grade runtime scenario evidence
