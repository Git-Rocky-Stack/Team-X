# Phase 5 Walkthrough — Demo Script

**Team-X v1.1.0 — the Intelligence Layer.** This is the script the
Phase 5 demo video would follow. It connects five scenarios into one
coherent 10–15 minute arc that starts with an empty Strategia-X
company and ends with the copilot surfacing a proactive insight
about the workload the viewer just created.

> **Hook (2 lines, on camera):**
> *"Team-X is an AI-agent company that runs on your laptop.
> Here's what that looks like."*

---

## Audience

Founders, product leads, and engineering managers evaluating
Team-X as an AI-agent operating system. No prior Team-X context
is assumed. Every concept is shown on screen before it is named.

---

## Runtime

| Segment | Scenario | Duration |
|---|---|---:|
| 1 | [Hire a CEO, chat with it, watch it think](./scenarios/01-hire-a-ceo.md) | 3 min |
| 2 | [File a ticket → agent closes it with an MCP tool](./scenarios/02-ticket-lifecycle.md) | 3 min |
| 3 | [One-click all-hands → minutes → action items](./scenarios/03-one-click-all-hands.md) | 2 min |
| 4 | [Ask `Cmd+K` why the frontend team is behind](./scenarios/04-ask-copilot-grounded-answer.md) | 3 min |
| 5 | [Decompose the Q1 roadmap → copilot surfaces the new workload](./scenarios/05-decompose-and-surface.md) | 4 min |
| — | Buffer for narration + transitions | ~1 min |
| **Total** | | **~15 min** |

---

## Arc

Each scenario is a callback to one of the five shipped phases.
The arc deliberately front-loads the familiar (hiring, tickets,
meetings) and back-loads the headline Phase 5 capabilities
(grounded answers, write-side planning, proactive insights).

1. **Phase 1 callback** — shows the app is real: a hire dialog,
   a streaming reply, token-by-token rendering. Establishes
   trust that this is not a mockup.
2. **Phase 2 callback** — introduces the org: employees, tickets,
   MCP tool calls. Establishes that the agents can *do* things,
   not just chat.
3. **Phase 3 callback** — introduces the meeting primitive and
   the orchestrator's pause semantics. Establishes that the
   company has a coherent clock.
4. **Phase 5 headline #1 — Intelligence Layer read-side.** The
   viewer asks a question that requires reasoning across the
   org state. The step log shows the loop planning, calling
   tools, and grounding the final answer in real data.
5. **Phase 5 headline #2 — Intelligence Layer write-side.** The
   viewer asks the loop to decompose a roadmap into tickets.
   The amber write-side gate fires. On confirm, tickets land
   on the kanban. Seconds later the copilot sidebar surfaces
   an insight about the workload the viewer just created.

---

## What the viewer sees by minute 15

- A live company with a CEO, a senior engineer, and a growing
  backlog of real tickets.
- The command palette at `Cmd+K` parsing natural language into
  structured intents and running multi-step reasoning loops.
- The copilot sidebar at `Cmd+Shift+K` with a proactive insight
  that wasn't there 60 seconds ago.
- Every mutation journaled in the Audit tab with a chip, a
  timestamp, and a payload summary.

---

## Close (forward pointer)

> *"That was Phase 5 — the Intelligence Layer. Phase 6 will take
> the copilot from reactive to autonomous: from 'here is an
> insight' to 'here is the fix, should I apply it?' Thanks for
> watching."*

Phase 6 candidates from the [retrospective](../plans/2026-04-19-team-x-phase-5-retrospective.md)
§6 are:

1. Post-release telemetry digest (evidence-based default tuning).
2. Cross-company copilot rollups.
3. Proactive copilot → autonomous action.
4. Agent-to-agent negotiation.
5. Capabilities frontmatter on role.md.
6. Real customer demo (this script is the foundation).
7. Insight export.

---

## Recording setup

- **Resolution:** 1920×1080, 60 fps. Team-X renders sharp at
  that size; chips, badges, and the step log are all readable.
- **DevTools:** closed. The appeal is that the UI is the story.
- **Audio:** single mic, narrator-only. Agent replies stream
  silently; narrator describes them in real time.
- **Tabs open at the start:** Dashboard → Cards. Every scenario
  returns to Dashboard → Cards between cuts so the viewer has
  a stable "home base."

---

## Script hygiene

- Every scenario doc scopes the exact UI targets it touches.
- Every scenario lists key moments to highlight on camera so
  the narrator can slow down for the right beat.
- Every scenario ends on Dashboard → Cards so the next
  scenario starts from the same frame.
- Data attributes are listed in each scenario doc as the
  single source of truth for which DOM element the narrator
  is about to click. If you're re-recording against a future
  build and a target disappeared, the attribute name is the
  stable contract — file an issue, don't paper over it.

---

## Versioning

This walkthrough is cut against **Team-X v1.1.0** (the Phase 5
release). Each scenario doc is independently versioned via the
Phase and milestone it exercises — if a future milestone
materially changes the UI path, the scenario doc is updated
in lockstep with that milestone's plan doc.
