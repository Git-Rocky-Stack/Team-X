# Scenario 05 — Decompose and Surface

**Phase 5 headline #2 — write-side + copilot.** The viewer asks
the loop to decompose a Q1 roadmap into tickets. The amber
write-side gate fires. On Confirm, tickets land on the kanban.
Seconds later the copilot sidebar surfaces a proactive insight
about the new workload. This is the closer — the moment the
viewer sees Team-X as an autonomous operator with guardrails.

| Field | Value |
|---|---|
| **Duration** | 4 minutes |
| **Exercises** | Phase 5 — M32 (task planner), M33 (copilot service), M34 (copilot UI) |
| **Starts on** | Dashboard → Cards |
| **Ends on** | Dashboard → Cards (copilot sidebar visible) |

---

## Hook (narrator, 1 line)

> *"Hand the loop a roadmap. Watch it turn into tickets —
> with a safety gate you can veto."*

---

## Setup preconditions

- Scenarios 01–04 completed.
- An empty or low-volume **Projects** tab (so the new
  tickets stand out).
- **Copilot enabled.** `Settings → Runtime → Copilot` —
  `enabled: true`, interval 5 minutes (default).
- Keyboard targets: `Cmd+K` (palette) and
  `Cmd+Shift+K` (copilot sidebar).

---

## Scripted sequence

1. **Open the palette.**
   - Press `Cmd+K`.
2. **Type a write-shaped request.**
   - Text: *"decompose the Q1 roadmap into tickets"*.
   - Narrator: *"The keyword `decompose` tells the system
     this is a write-side request."*
3. **Watch the amber gate fire.**
   - Under the input, an **amber** confirmation card appears.
     It names the intent (`complex_request`, write-side) and
     summarises what the loop intends to do.
   - Narrator: *"Amber means 'this mutates state.' Red means
     'destructive.' You have to confirm before anything
     writes."*
4. **Confirm.**
   - Click **Confirm**.
   - The palette transitions into the **step log** view.
     Step cards now include write-side variants:
     - `data-step-kind="plan"` — the decomposition plan.
     - `data-step-kind="tool_call"` — `decompose_project`.
     - `data-step-kind="ticket_created"` (emerald chip, Ticket
       icon) — one per new ticket, 6–10 cards.
     - `data-step-kind="tool_call"` — `delegate_subtask`.
     - `data-step-kind="delegation_made"` (sky chip,
       GitBranch icon) — one per assignment.
     - `data-step-kind="answer"` — *"Decomposed the Q1
       roadmap into 8 tickets, delegated to 3 engineers."*
5. **Cut to the Tickets kanban.**
   - Top-bar tab: **Tickets**.
   - The **Open** column now holds 8 new cards that weren't
     there before. Each card's avatar shows the assignee
     chosen by the scoring function.
6. **Wait ~10 seconds, then open the copilot sidebar.**
   - Press `Cmd+Shift+K`.
   - Sidebar slides in from the right. Inside:
     `data-copilot-sidebar-root`.
7. **Read the new insight.**
   - `data-copilot-insight-id="<uuid>"`. Category badge:
     *workflow*. Severity: *warning*. Title:
     *"New workload created — 8 tickets delegated across 3
     engineers, review queue not yet defined."*
   - Narrator: *"That insight wasn't there 30 seconds ago.
     The copilot ran its periodic analyzer, saw the 8 new
     tickets in the event window, and generated that card."*
8. **Dismiss the insight.**
   - Click the **X** on the insight card.
   - The card leaves the DOM optimistically.
   - Behind the scenes: `copilot.dismiss` IPC fires, an
     append-only `copilot.dismissed` event lands on the
     events table (that's invariant #11 — every state
     mutation emits a bus event).
9. **Cut to the Audit tab.**
   - Top-bar tab: **Audit**.
   - Filter chip: `copilot.dismissed`.
   - The row you just generated is at the top with the
     dismissed-at timestamp and the insight's title.
   - Narrator: *"Every mutation is auditable. Dismiss is
     not a no-op."*
10. **Return to Dashboard → Cards.** Sidebar stays open
    as the closing frame.

---

## Key moments to highlight on camera

- **The amber gate.** This is the ethical-AI moment of
  the demo. The viewer sees that write-side actions are
  opt-in, not silent. Pause 2–3 seconds on the amber card.
- **The step log filling with `ticket_created` cards.**
  One per new ticket. Let the cards cascade. The viewer
  sees 8 tickets materialize.
- **The copilot sidebar sliding in.** The narrator can
  be silent here; the transition does the work.
- **The audit tab row at the end.** Rocky's invariant #11
  on full display. The copilot may feel magical; the
  append-only event log says it isn't.

---

## What the viewer just saw

- **Write-side planning with real guardrails.** The amber
  gate is the guardrail. Rocky approves every mutation.
- **Deterministic delegation.** Each subtask's assignee
  was chosen by a locked scoring formula (0.4 role-fit +
  0.3 inverse-load + 0.2 availability + 0.1 past-perf).
- **Proactive copilot.** The analyzer is on a 5-minute
  default cadence. Manual ticks exist for testing but
  the demo runs on the real timer — the viewer sees the
  insight arrive on its own.
- **Full audit trail.** Every insight, every dismissal,
  every ticket — one append-only log.

---

## Dependencies

- Phase 5 M32 — task planner (write-side tools +
  employee-aware registry + amber gate).
- Phase 5 M33 — copilot service (analyzer + insights +
  dedup + `system-copilot`).
- Phase 5 M34 — copilot UI (sidebar + widget + Cmd+Shift+K).

## Data attributes referenced

| Attribute | Location |
|---|---|
| `data-step-kind="ticket_created"` | Step log card |
| `data-step-kind="delegation_made"` | Step log card |
| `data-copilot-sidebar-root` | Sidebar root element |
| `data-copilot-insight-id="<uuid>"` | Every insight card |
| `data-copilot-toolbar-toggle` | Sparkles toolbar button |

---

## Close (forward pointer)

Narrator, closing 2 lines:
> *"That was Phase 5 — the Intelligence Layer. Phase 6 will
> take the copilot from reactive to autonomous: from 'here
> is an insight' to 'here is the fix, should I apply it?'
> Thanks for watching."*
