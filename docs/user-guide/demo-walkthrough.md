# Demo Walkthrough — A Guided Tour of Team-X v1.1.0

Team-X is an AI-agent company that runs on your laptop. This guide
walks you through a 10–15 minute self-guided tour that starts with
an empty Strategia-X company and ends with the copilot surfacing a
proactive insight about the workload you just created.

Every scenario below is something you can do in your own install —
no scripting, no recordings, no mock data. The arc is the same one
the Team-X demo video follows, promoted here as a user-facing
onboarding path.

> **New to Team-X?** Skim the Getting Started guide first for install
> and first-boot. This tour picks up from the
> default Strategia-X company that seeds on first boot.

---

## Who this is for

Founders, product leads, and engineering managers who just
installed Team-X and want a fast, concrete read on what the app
actually does. No prior context is assumed. Every concept is shown
on screen before it is named.

---

## The five scenarios

| # | Scenario | What you learn | Duration |
|---|---|---|---:|
| 1 | Hire a CEO, chat with it, watch it think | The app is real — streaming replies, token-by-token rendering, local models | 3 min |
| 2 | File a ticket → agent closes it with an MCP tool | Agents *do* things, not just chat — MCP tool calls, ticket lifecycle | 3 min |
| 3 | One-click all-hands → minutes → action items | The meeting primitive + orchestrator pause semantics | 2 min |
| 4 | Ask `Cmd+K` why the frontend team is behind | Intelligence Layer read-side — grounded answers over your org state | 3 min |
| 5 | Decompose the Q1 roadmap → copilot surfaces the new workload | Intelligence Layer write-side — task planner + proactive copilot | 4 min |
| — | Buffer | — | ~1 min |
| **Total** | | | **~15 min** |

Each row links to a dedicated scenario page with step-by-step
clicks, key moments to pay attention to, and the exact data
attributes the UI exposes so you can verify state as you go.

---

## How the arc is built

The tour deliberately front-loads the familiar (hiring, tickets,
meetings) and back-loads the headline Phase 5 capabilities
(grounded answers, write-side planning, proactive insights).

1. **Phase 1 — Skeleton.** A hire dialog, a streaming reply,
   token-by-token rendering. The app is not a mockup.
2. **Phase 2 — The Org.** Employees, tickets, MCP tool calls. The
   agents can execute work, not just converse.
3. **Phase 3 — The Live Cockpit.** Meetings pause the orchestrator;
   minutes and action items close the loop.
4. **Phase 5 headline #1 — Read-side.** `Cmd+K` asks a question that
   requires reasoning across the org. The step log shows the loop
   planning, calling tools, and grounding the answer in real data.
5. **Phase 5 headline #2 — Write-side + proactive.** You ask the
   loop to decompose a roadmap into tickets. The amber write-side
   gate fires. On confirm, tickets land on the kanban. Seconds
   later the copilot sidebar surfaces an insight about the
   workload you just created.

---

## What you'll have by the end

- A live company with a CEO, a senior engineer, and a real backlog.
- The command palette at `Cmd+K` parsing natural language into
  structured intents and running multi-step reasoning loops.
- The copilot sidebar at `Cmd+Shift+K` with a proactive insight
  that wasn't there 60 seconds ago.
- Every mutation journaled in the Audit tab with a chip, a
  timestamp, and a payload summary.

Nothing leaves your laptop. No cloud sync, no telemetry, no
phone-home. Everything persists in the local SQLite database +
filesystem vault under `%APPDATA%/Team-X/` (Windows) or
`~/Library/Application Support/Team-X/` (macOS) or
`~/.config/Team-X/` (Linux).

---

## Versioning

This walkthrough targets **Team-X v1.1.0** — the Phase 5 release.
Every feature referenced here ships in v1.1.0 and is covered by
Playwright E2E tests. Future releases may change UI paths; this
page updates in lockstep.

Each scenario doc is independently versioned via the Phase and
milestone it exercises. If a target disappears in a future build,
check the scenario doc's data-attribute list — those are the
stable contracts — or open an issue.

---

## Where to next

- **Want the Phase 6 add-on tour?** Run the capability evidence sequence: planner role-fit evidence, Copilot feedback suggestions, telemetry kind filters, and local insight export.
- **Want to learn the command palette?** Review the keyboard shortcuts and command-palette sections in the user guide.
- **Want to try the copilot without reading the tour?** Open the Copilot sidebar and review the Copilot Service behavior described in the guide.
- **Want to run the task planner yourself?** Use `Cmd+K` / `Ctrl+K` and ask Team-X to decompose a project into tickets.
- **Building your own F10 role pack?** Use the role-spec schema and signing workflow documented with the role-pack tooling.

The Phase 6 add-on tour keeps Copilot advisory: role-fit evidence,
feedback weights, telemetry filters, and export make the system easier
to inspect and calibrate without adding autonomous write-side action.
Planning background lives in the product design and autonomous runtime mechanics notes, but this walkthrough does not depend on those older Markdown files.
