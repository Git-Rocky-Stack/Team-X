# Scenario 04 — Ask `Cmd+K`: grounded multi-paragraph answer

**Phase 5 headline #1 — read-side.** The viewer asks a question
that requires reasoning across the org state. The step log shows
the agentic loop planning, calling read-only tools, and grounding
the final answer in real data. This is the moment the viewer
understands what *Intelligence Layer* means.

| Field | Value |
|---|---|
| **Duration** | 3 minutes |
| **Exercises** | Phase 5 — M28 + M29 (RAG), M30 (NLU), M31 (agentic loop) |
| **Starts on** | Dashboard → Cards |
| **Ends on** | Dashboard → Cards |

---

## Hook (narrator, 1 line)

> *"Ask the company itself what's going on. Get a grounded
> answer with real citations — in 15 seconds."*

---

## Setup preconditions

- Scenarios 01, 02, 03 completed. At least 2 employees, 1–3
  tickets (some open, some done), 1 past meeting with minutes.
- **RAG enabled.** Check **Settings → Runtime → RAG** —
  `chunk size`, `overlap`, and `similarity threshold` should
  be at defaults (M35 T1 held them there on evidence).
- Command palette keyboard target: `Cmd+K` (macOS) or
  `Ctrl+K` (Windows / Linux).

---

## Scripted sequence

1. **Open the command palette.**
   - Press `Cmd+K`.
   - Palette overlay appears, centered.
2. **Type a question that requires reasoning.**
   - Text: *"why is the frontend team behind?"*
   - Narrator: *"That's a vague question. Classically it
     would need a human to answer."*
3. **Watch the classifier fire.**
   - Under the input, a live NLU chip appears:
     `intent=complex_request, confidence=0.94`.
   - Narrator: *"The classifier ran first. It knows this
     is a reasoning question, not a command."*
4. **Submit and watch the step log.**
   - Press Enter.
   - The palette transitions into the **step log** view.
     Cards render top-down:
     - `data-step-kind="plan"` — the loop's plan (what it
       intends to look up).
     - `data-step-kind="tool_call"` — `query_employees`
       (returns rows truncated-safe at 50).
     - `data-step-kind="tool_result"` — JSON envelope
       `{ rows, truncated }`.
     - `data-step-kind="tool_call"` — `query_tickets`.
     - `data-step-kind="tool_result"` — more data.
     - `data-step-kind="answer"` — the grounded reply.
5. **Pause on the answer card.**
   - Narrator reads the answer aloud. The answer names
     specific employees and tickets by ID. That's the
     "grounded" part — no hallucinated names.
6. **Show the system-agent thread.**
   - Close the palette (Esc).
   - Open the chat sidenav. Under **Copilot Conversations**,
     the `system-agent` thread is present with the full
     transcript persisted.
   - Narrator: *"Every answer is also a thread. You can
     follow up asynchronously."*
7. **Return to Dashboard → Cards.**

---

## Key moments to highlight on camera

- **The classifier chip under the input.** The palette shows
  the intent + confidence live. That's the M30 surface.
- **The step log cards cycling.** This is the single best
  visual in the whole demo — plan, tool_call, tool_result,
  answer. Let it breathe for 5–8 seconds. The narrator can
  land the "pure ReAct scheduler, zod-validated tools"
  theme without calling those terms on screen.
- **The grounded answer.** Zoom on 2–3 specific ticket IDs
  or employee names in the answer text. The point: no
  hallucinations — every citation is real.
- **Budget exhaustion never happens on the demo path.** If
  the loop exhausts `agentic_max_steps` or
  `agentic_max_tokens`, the scenario fails. M35 T1 held
  the defaults at 8 / 8000 / 120s on evidence — this
  scenario is well inside those envelopes.

---

## What the viewer just saw

- **Natural language → structured intent → multi-step
  reasoning.** The classifier, palette, and agentic loop
  are one pipeline.
- **Real tool calls with row-capped, truncated-safe
  envelopes.** Every tool call is visible. Every tool
  result is visible. Nothing is hidden.
- **Grounded answers with real citations.** The answer
  names specific tickets and employees because it read
  them, not guessed them.
- **A persisted thread.** The answer lives on as a
  `system-agent` Copilot Conversation for follow-up.

---

## Dependencies

- Phase 5 M28 — `packages/intelligence` + sqlite-vec + RAG.
- Phase 5 M29 — RAG into agent turns.
- Phase 5 M30 — NLU engine + command palette.
- Phase 5 M31 — agentic loop (read-side) + `system-agent`.

## Data attributes referenced

| Attribute | Location |
|---|---|
| `data-step-kind="plan"` | Step log card |
| `data-step-kind="tool_call"` | Step log card |
| `data-step-kind="tool_result"` | Step log card |
| `data-step-kind="answer"` | Step log card |

---

## Transition to Scenario 05

Narrator, 1 line:
> *"Reading is easy. Watch what happens when we ask the loop
> to write."*

Cuts cleanly to `docs/demo/scenarios/05-decompose-and-surface.md`.
