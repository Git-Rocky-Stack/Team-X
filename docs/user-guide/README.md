# Team-X User Guide

Welcome to the Team-X user guide. These docs cover everything you need to run your AI organization: from hiring your first CEO to scheduling future work and asking the Copilot why the frontend team is behind schedule.

New here? Start with **[Getting Started](./getting-started.md)**, then browse by section or jump to whatever you need. The guide is written to be self-contained, so it does not depend on older Markdown files in other directories staying present.

## Keyboard-first primer

Two shortcuts unlock most of the intelligence surface:

- **`Cmd+K` / `Ctrl+K`**: open the natural-language command palette.
- **`Cmd+Shift+K` / `Ctrl+Shift+K`**: toggle the Copilot sidebar.

---

## Getting Started

- [Getting Started](./getting-started.md): Install Team-X (Windows / macOS / Linux, or from source) and have your first conversation with an AI employee.
- [Quick Start](./getting-started/quick-start.md): The 15-minute path: install, create a workspace, hire your first employee, and complete your first ticket.
- [Demo Walkthrough](./demo-walkthrough.md): A 10-15 minute guided tour, from an empty Strategia-X company to the Copilot surfacing its first proactive insight.

## Core Workflows

- [Hiring Employees](./hiring-employees.md): Hire, fire, promote, and manage your org chart from the 57-role F10 catalog (55 hireable roles + 2 system roles) across 6 hierarchy levels.
- [Managing Projects](./managing-projects.md): The Goals → Projects → Tickets hierarchy and the kanban board that tracks accountable work.
- [Scheduling and Calendar](./scheduling-and-calendar.md): The Schedule calendar layer: ticket due dates, project/goal targets, reminders, and future agent wakeups.
- [Using the Vault](./using-the-vault.md): Local file storage with SHA256 integrity, FTS5 search, ticket attachments, and agent-created deliverables.
- [Backup and Restore](./backup-and-restore.md): Create portable `.teamx-backup` archives of your database and vault, and restore from them.
- [Configuring Providers](./configuring-providers.md): Add any of the 10 supported LLM providers, set privacy tiers, and choose a runtime strategy.
- [Command Palette](./command-palette.md): The `Ctrl/Cmd+K` natural-language command surface: 15 intents, local-first classification, a destructive-action gate, and audited history.

## Intelligence & Autonomy

- [Agentic Loop](./agentic-loop.md): How conversational, multi-hop questions at `Cmd+K` plan, call read-only org tools, and return grounded answers (the shared foundation beneath Planner, Copilot, and Self-Improvement).
- [Task Planner](./task-planner.md): The write-side agentic surface: decompose projects, delegate with deterministic workload scoring, and review deliverables behind an amber confirmation gate.
- [Copilot Service](./copilot-service.md): The background proactive analyst that ticks on a cadence and surfaces operational, cost, org, workflow, and anomaly insights.
- [Copilot UI](./copilot-ui.md): Consume Copilot insights via the `Cmd+Shift+K` sidebar and dashboard widget, with feedback, category/severity filters, and CSV/JSON export.
- [Autonomy Control Plane](./autonomy-control-plane.md): The governance control plane: Doctor, Benchmarks, Improve, Runtimes, Routines, budgets, approvals, and artifacts.

## Deep-Dive Chapters

- [Comprehensive User Guide](./comprehensive-user-guide.md): The single-document master guide, from first launch to a fully operational AI workforce.
- [05 · Mission Control Dashboard](./enhanced/05-mission-control.md): The real-time "what's happening now / what needs my attention" operations view.
- [06 · Command Palette](./enhanced/06-command-palette.md): When to type vs. click, with side-by-side time-saved comparisons.
- [07 · Tickets & Work Management](./enhanced/07-tickets-and-work.md): The unit of accountable work, plus tickets-vs-chat guidance.
- [12 · Copilot: Proactive Intelligence](./enhanced/12-copilot.md): What to use the Copilot for and how it differs from Mission Control.
- [13 · Autonomy Control Plane](./enhanced/13-autonomy-control-plane.md): The explicit, governed, supervisable autonomy philosophy and its subviews.

## Scenarios

- [01 · Product Development Lifecycle](./scenarios/01-product-development-lifecycle.md): Concept to launch with 7 AI employees across Product, Engineering, and Design.
- [02 · Cost Optimization Playbook](./scenarios/02-cost-optimization-playbook.md): Identify and cut spend when a 15-employee workspace overshoots its budget.
- [03 · Failure Recovery Workflows](./scenarios/03-failure-recovery-workflows.md): Diagnose and recover from cascading runtime, provider, and routine failures.
- [04 · Cross-Functional Collaboration](./scenarios/04-cross-functional-collaboration.md): Coordinate design, frontend, and backend on a dependency-heavy feature.
- [05 · Autonomous Routine Governance](./scenarios/05-autonomous-routine-governance.md): Safely add and govern recurring automation without cost overruns.
- [06 · Multi-Workspace Operations](./scenarios/06-multi-workspace-operations.md): Run isolated company workspaces while sharing standard operating procedures.
- [07 · Shift Handoff Playbook](./scenarios/07-shift-handoff-playbook.md): Transfer operational responsibility without losing state or context.

## Templates

- [Templates Overview](./templates/README.md): Index of reusable workflow templates and how to apply them.
- [Handoff Document](./templates/handoff-document.md): Fill-in template for handing operations to a backup operator.
- [Meeting Agenda](./templates/meeting-agenda.md): Structured agenda template for standups, retrospectives, and team meetings.
- [Ticket Templates](./templates/ticket-templates.md): Pre-defined ticket formats for features, bugs, and reviews.
- [Routine Templates](./templates/routine-templates.md): Pre-configured routine templates with schedules and work templates.

## Reference

- [FAQ](./faq.md): Common questions on getting started, costs, security/privacy, employees, and more.
- [Troubleshooting](./troubleshooting.md): Fixes for installation, runtime/agent, and provider-connection issues.
- [Glossary](./glossary.md): Definitions of Team-X terminology and concepts.
- [Keyboard Shortcuts](./keyboard-shortcuts.md): The complete, authoritative shortcut surface (two global shortcuts plus the palette).
- [CLI Reference](./cli-reference.md): Reference for both command surfaces: the natural-language palette and the automation CLI.
- [Migration Guide](./migration-guide.md): Move to Team-X from other AI-workforce tools, PM systems, and freelance platforms.
- [Accessibility Guide](./accessibility-guide.md): Accessibility features, how to use them, and inclusive-content best practices.

## Video Scripts

- [Video Tutorial Scripts](./video-scripts/README.md): Scripts for the Team-X tutorial videos, starting with the 15-minute Quick Start walkthrough.

---

## Reference notes

- Keep this user guide self-contained for onboarding and operator use.
- Avoid requiring older demo, plan, audit, or repository Markdown files to understand current product behavior.
- Treat live code and shipped UI behavior as the source of truth when updating this guide.
