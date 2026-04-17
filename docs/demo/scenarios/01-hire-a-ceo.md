# Scenario 01 — Hire a CEO

**Phase 1 callback.** Establishes that Team-X is a real desktop
app with real agents. Shows the hire flow, the streaming reply,
and the thread that persists once the chat is over.

| Field | Value |
|---|---|
| **Duration** | 3 minutes |
| **Exercises** | Phase 1 — M3, M4, M5 |
| **Starts on** | Dashboard → Cards |
| **Ends on** | Dashboard → Cards |

---

## Hook (narrator, 1 line)

> *"Every company needs a leader. In Team-X, you hire one —
> from a role library, not from LinkedIn."*

---

## Setup preconditions

- Team-X v1.1.0 launched. The Strategia-X seed company is
  present but the hire dialog has not been opened yet.
- At least one provider is configured in **Settings →
  Providers**. For a fast demo on a laptop, the default
  `ollama-local` + `llama3.1:8b` is enough. For a snappier
  recording, add an Anthropic or OpenAI key.
- Dashboard subview: **Cards**.

---

## Scripted sequence

1. **Open the hire dialog.**
   - Target: `data-testid="hire-dialog-trigger"` (the **+ Hire**
     button in the top-left of the employees panel).
   - Narrator: *"I'll hire a CEO."*
2. **Pick the role.**
   - Filter chip: `Officer`.
   - Search box: type `ceo`.
   - Select the row with `data-role-id="ceo"`.
3. **Confirm the hire.**
   - Leave the generated name as-is (Rocky-voice default).
   - Click **Hire**.
   - A toast fires; the new employee animates into the org tree.
4. **Open the CEO's chat.**
   - Click the new CEO row in the employees list.
   - Chat drawer opens on the right.
5. **Send the first message.**
   - Composer text: *"What's our mission?"*
   - Cmd/Ctrl+Enter to send.
6. **Watch the reply stream.**
   - Narrator: *"That's real token-by-token streaming. No
     pre-rendered text, no fake typing indicator."*
   - Let the reply finish (~15–30s depending on provider).
7. **Close the drawer.**
   - Press **Esc** — returns to Dashboard → Cards.

---

## Key moments to highlight on camera

- **The role library filter chips.** There are 55 F10 roles
  across 6 levels. The filter chips are the visible surface of
  that library.
- **Token-delta streaming.** Zoom the chat panel at step 6.
  The point is that tokens land one at a time, fed by the
  provider's `fullStream` — not the final text pasted in at
  once.
- **The Dashboard → Stream subview updating in real time.**
  If camera room allows, flick to Stream during the reply —
  the live token stream rendering there is the same one.
- **Cost and latency on the employee card.** Return to
  Dashboard → Cards. The CEO card now shows tokens, cost,
  and latency from the one round-trip you just ran. This is
  the entry point to the Telemetry tab.

---

## What the viewer just saw

- **Hiring is declarative.** Pick a role; the app handles
  the rest. No prompt engineering, no model picking.
- **Agents are real.** The reply streams. The thread persists.
  The employee has a cost meter.
- **The org is real.** Future scenarios will add employees,
  projects, and tickets on top of this CEO.

---

## Dependencies

- Phase 1 M3 — main process + DB + seed.
- Phase 1 M4 — agent runtime + provider router + orchestrator.
- Phase 1 M5 — renderer shell + hire dialog + chat drawer.

## Data attributes referenced

| Attribute | Location |
|---|---|
| `data-testid="hire-dialog-trigger"` | Employees panel + Hire button |
| `data-role-id="ceo"` | Hire dialog role row |
| `data-testid="chat-composer"` | Chat drawer composer |

---

## Transition to Scenario 02

Narrator, 1 line:
> *"Now that we have a CEO, let's give the org some work to do."*

Cuts cleanly to `docs/demo/scenarios/02-ticket-lifecycle.md`
which opens on the same Dashboard → Cards view.
