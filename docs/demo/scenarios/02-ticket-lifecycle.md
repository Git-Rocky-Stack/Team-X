# Scenario 02 — Ticket Lifecycle with an MCP Tool Call

**Phase 2 callback.** Shows the full ticket path — file, assign,
agent picks it up, uses an MCP tool, closes the ticket — and
establishes that Team-X agents can *do* work, not just chat.

| Field | Value |
|---|---|
| **Duration** | 3 minutes |
| **Exercises** | Phase 2 — M9 (org chart), M10 (MCP host), M12 (tickets + kanban) |
| **Starts on** | Dashboard → Cards |
| **Ends on** | Dashboard → Cards |

---

## Hook (narrator, 1 line)

> *"File a ticket. Watch an agent pick it up and actually
> finish the work — with an external tool, in the same window."*

---

## Setup preconditions

- Scenario 01 completed (CEO exists).
- One more hire: **Senior Fullstack Engineer** (the Phase 1
  seed already ships this role — if it's present you can skip
  the hire).
- An MCP server is registered and enabled. The default
  `Context7` seed is sufficient. Verify under **Settings →
  MCP Servers** that the row shows `enabled: true`.
- Tickets tab has at least one empty kanban column visible.

---

## Scripted sequence

1. **Navigate to Tickets.**
   - Top-bar tab: **Tickets**.
   - Narrator: *"Four columns — open, in progress, blocked, done."*
2. **Open the create-ticket dialog.**
   - Target: `data-testid="create-ticket"`.
   - Dialog renders with fields for title, description, priority,
     assignee, project.
3. **Fill the ticket.**
   - Title: *"Document the provider-router fallback chain."*
   - Description: *"Needs a one-paragraph overview and a table
     of the default fallback order per provider tier."*
   - Priority: **Medium**.
   - Assignee: pick the Senior Fullstack Engineer.
   - Click **Create**.
4. **Watch the ticket land.**
   - Kanban column **Open** gets a new card. The card carries
     `data-ticket-id="<uuid>"`.
   - Narrator: *"Notice the agent's avatar on the card. The
     orchestrator has already enqueued the work."*
5. **Open the ticket detail panel.**
   - Click the new card. Right-side panel slides in.
   - Thread shows the initial system message and the agent's
     streaming first response.
6. **Narrate the MCP tool call.**
   - In the thread, watch for a tool-call chip (blue badge,
     wrench icon). That's the agent hitting the MCP server.
   - Narrator: *"That blue chip is the agent reaching out to
     Context7 through the MCP protocol. The host pool is a
     singleton in Main — one connection, many agents."*
7. **Agent finishes and closes.**
   - Agent posts the drafted paragraph + fallback table.
   - Click **Close Ticket** in the detail panel.
   - Card animates from **Open** → **Done**.
8. **Return to Dashboard → Cards.**
   - Top-bar tab: **Dashboard**. Subtab: **Cards** (default).

---

## Key moments to highlight on camera

- **The agent picks up the work with no extra prompt.** The
  assignment is the prompt. Narrator can land the "declarative"
  theme again.
- **The MCP tool-call chip.** Pause camera on the chip for
  1–2 seconds. This is the visible proof that the agent
  reached outside the app through a sanctioned protocol.
- **The kanban drag as the ticket closes.** Audit tab updates
  in near-real-time — optional B-roll: flick to Audit, show
  the `ticket.created` and `ticket.closed` chips landing.

---

## What the viewer just saw

- **Tickets are the unit of work.** You file them; agents pick
  them up; they close themselves.
- **MCP is the door to the outside world.** Documentation,
  databases, filesystems — anything that speaks the MCP
  protocol plugs in through **Settings → MCP Servers**.
- **The orchestrator is the only scheduler.** The ticket was
  enqueued the moment it was created, not polled for later.

---

## Dependencies

- Phase 2 M9 — org chart + employees.fire/promote/setManager.
- Phase 2 M10 — MCP host + tool-call streaming.
- Phase 2 M12 — tickets + kanban + detail panel.

## Data attributes referenced

| Attribute | Location |
|---|---|
| `data-testid="create-ticket"` | Tickets tab + Create button |
| `data-ticket-id="<uuid>"` | Every kanban card |
| `data-testid="ticket-detail-close"` | Detail panel Close Ticket button |

---

## Transition to Scenario 03

Narrator, 1 line:
> *"With work flowing, it's time to pull the team into a room."*

Cuts cleanly to `docs/demo/scenarios/03-one-click-all-hands.md`.
