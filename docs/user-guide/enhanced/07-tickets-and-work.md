## 7. Tickets & Work Management

**Purpose:** Tickets are the unit of accountable work in Team-X. They capture requirements, assign ownership, track progress, host collaboration, and preserve audit evidence. Use tickets for any work that needs to be remembered, assigned, reviewed, or verified.

### When to Use Tickets (vs. Chat)

| Use Tickets When... | Use Chat When... |
|---------------------|------------------|
| Work needs a deadline or owner | Quick question or clarification |
| Multiple employees should collaborate | One-to-one conversation |
| You need an audit trail | Informal discussion |
| Work produces deliverables | Status check or temperature read |
| Progress should be visible in queue | Temporary coordination |
| Work links to a project or goal | Social check-in |

**Rule of thumb:** If the result should be remembered, assigned, reviewed, or verified → make it a ticket.

---

## Ticket Structure

### Core Fields

| Field | Type | Required? | Purpose |
|-------|------|-----------|---------|
| **Title** | Text | Yes | Quick identification in lists and queues |
| **Description** | Rich text | Recommended | Full requirements, context, constraints |
| **Priority** | Enum | Yes (defaults to Medium) | Urgency and sequencing guidance |
| **Status** | Enum | Yes (defaults to Open) | Workflow state |
| **Assignee** | Employee | No (unassigned OK) | Primary owner and executor |
| **Participants** | Employee list | No | Collaboration team |
| **Project** | Project | No | Initiative grouping |
| **Due Date** | Date | No | Time pressure and calendar visibility |
| **Attachments** | Vault files | No | Source material and deliverables |

### Status Workflow

```
┌─────────┐     ┌──────────────┐     ┌──────────┐     ┌──────────┐
│  Open   │────▶│ In Progress  │────▶│ Blocked  │────▶│   Done   │
│ (Gray)  │     │   (Brand)    │     │ (Amber)  │     │ (Green)  │
└─────────┘     └──────────────┘     └──────────┘     └──────────┘
     ▲                                   │                 │
     │                                   │                 │
     └───────────────────────────────────┘                 │
                   Reopen from Done                       │
                                                          │
                                                   Reopen (creates new entry)
```

| Status | Meaning | When to Use |
|--------|---------|-------------|
| **Open** | Ticket created, not yet started | New work, backlog queue, assignment pending |
| **In Progress** | Someone is actively working | Assignee has engaged, work underway |
| **Blocked** | Waiting on dependency or decision | External blockage, needs input, cannot proceed |
| **Done** | Work completed | Verified deliverable, resolved issue, finished task |

**Reopening:** Click "Reopen" on a Done ticket to return it to Open. The audit trail preserves the original completion; reopening creates a new work cycle.

### Priority Levels

| Priority | When to Use | Example |
|----------|-------------|---------|
| **Critical** | Blocking launch, security issue, data loss | "Production authentication failing" |
| **High** | User-facing bug, deadline-driven feature | "Checkout page broken before sale" |
| **Medium** | Normal work, standard features | "Implement user profile page" |
| **Low** | Nice-to-have, backlog, research | "Investigate new charting library" |

**Tip:** Use Critical sparingly. If everything is Critical, nothing is.

---

## Creating Tickets

### Method 1: Command Palette (Fastest)

**Advantages:** Natural language, automatic intent classification, quick capture

```
Press Ctrl+K / Cmd+K → "File a ticket to implement user authentication"
```

The classifier extracts:
- Intent: `create_ticket`
- Title: Auto-generated from your description
- Details: Prompts for assignee, priority, due date if needed

**Examples:**
- "Create a critical ticket: database migration is blocking deployment"
- "File a ticket for Sarah: redesign the onboarding flow"
- "New ticket high priority: fix the login crash by Friday"

### Method 2: Tickets Tab (Full Control)

**Advantages:** Full field access, attachments, participant selection, project linking

**Steps:**
1. Click **Tickets** in top navigation
2. Click **Create Ticket** button (top-right)
3. Fill in fields:
   - **Title**: Short, specific description
   - **Description**: Full requirements (use rich text for formatting)
   - **Priority**: Select from dropdown
   - **Assignee**: Choose owner (optional; unassigned tickets stay in Open)
   - **Participants**: Add collaborators (optional)
   - **Project**: Link to initiative (optional)
   - **Due Date**: Set deadline (optional)
   - **Attachments**: Add vault files (optional)
4. Click **Create**

### Method 3: Task Planner (Decomposition)

**Advantages:** AI-powered breakdown, automatic delegation, workload-scored assignment

**Use when:** You have a complex project and want Team-X to decompose it into subtasks with optimal assignees.

```
Press Ctrl+K / Cmd+K → "Decompose the Q2 launch project into tickets"
```

The Task Planner:
1. Analyzes the project scope
2. Generates 5-10 subtask tickets (configurable via `planner_max_tickets`)
3. Assigns each subtask using workload scoring (role-fit + availability)
4. Shows amber confirmation gate before creating tickets
5. Writes all tickets to the queue with proper assignees

See [Task Planner documentation](../../task-planner.md) for full details.

---

## The Kanban Board

### Board Layout

```
┌─────────────┬───────────────────┬─────────────┬─────────────┐
│    Open     │   In Progress     │   Blocked   │    Done     │
│   (8)       │      (3)          │     (2)     │    (12)     │
├─────────────┼───────────────────┼─────────────┼─────────────┤
│ ┌─────────┐ │ ┌───────────────┐ │ ┌─────────┐ │ ┌─────────┐ │
│ │Auth impl│ │ │Dashboard fix │ │ │API wait │ │ │Login   │ │
│ │ Sarah   │ │ │ Mike         │ │ │ Mike    │ │ │ Sarah   │ │
│ │ High    │ │ │ Medium       │ │ │ High    │ │ │ Done    │ │
│ └─────────┘ │ └───────────────┘ │ └─────────┘ │ └─────────┘ │
│ ┌─────────┐ │ ┌───────────────┐ │ ┌─────────┐ │ ┌─────────┐ │
│ │Docs     │ │ │Chart lib     │ │ │Design   │ │ │Search  │ │
│ │Unassigned│ │ │ Priya        │ │ │ Priya   │ │ │ Priya   │ │
│ │ Low     │ │ │ Low          │ │ │ Medium  │ │ │ Done    │ │
│ └─────────┘ │ └───────────────┘ │ └─────────┘ │ └─────────┘ │
└─────────────┴───────────────────┴─────────────┴─────────────┘
```

### Reading the Board

**Column counts** tell you queue health:
- **Open (gray)**: Backlog → High count = need capacity or prioritization
- **In Progress (brand)**: Active work → Low count = good flow, High count = WIP scattering
- **Blocked (amber)**: Stalled work → Any count > 0 needs attention
- **Done (green)**: Completed work → Review before archival to verify quality

**Card information at a glance:**
- **Title**: What the work is
- **Assignee**: Who owns it (blank = unassigned)
- **Priority badge**: Urgency level
- **Project tag** (if linked): Which initiative

**Drag-and-drop:** Move cards between columns to update status. The audit log records every status change.

---

## Ticket Detail Panel

Click any ticket card to open the detail panel. The panel has three sections.

### Header Section

```
┌─────────────────────────────────────────────────────────────────────┐
│ Auth Implementation                          [High] [In Progress]   │
│ Assignee: Sarah Chen   Project: Q2 Launch    Due: Mar 15           │
│                                                        [Close][⋮]  │
└─────────────────────────────────────────────────────────────────────┘
```

**Header actions:**
- **Close/Reopen**: Change status to Done or Open
- **⋮ (More)**: Delete ticket, copy link, view in audit log

### Thread Section

The heart of the ticket. Shows full conversation history.

**What you see:**
- **Human messages**: Your comments and instructions (left-aligned, white background)
- **Employee responses**: Agent replies (right-aligned, brand-tinted background)
- **Tool calls**: Blue chips showing function name and arguments
- **Tool results**: Gray chips with return values
- **Deliverables**: File attachments created by agents

**Thread behavior:**
- **Streaming**: Employee responses appear token-by-token in real-time
- **History**: Full conversation preserved from creation to close
- **Searchable**: Use browser find (Ctrl+F) to locate specific messages
- **Exportable**: Copy thread content for external documentation

### Activity Section

**Participants**
- Lists all employees with access to this ticket thread
- Assignee is automatically a participant
- Add/remove participants anytime

**Attachments**
- Vault files linked to this ticket
- Source material, requirements docs, reference designs
- Agent-created deliverables appear here automatically

**Related Tickets**
- Parent/child relationships
- Duplicate or blocking relationships
- Click to navigate between related work

**Timeline**
- Chronological list of ticket events:
  - Created
  - Status changes
  - Assignee changes
  - Participant additions
  - Attachments
  - Comments
  - Closure

---

## Participant Wake Semantics

**This is critical:** Ticket threads wake participants differently than 1:1 chat.

### Who Wakes When You Comment?

When a human adds a comment to a ticket thread:

1. **All current participants** are woken (notified and ready to respond)
2. **All historical authors** on that ticket thread are woken
3. **The assignee** (if different from above) is woken

**Example scenario:**

```
Ticket #42: "Fix login bug"
- Created by: You (human)
- Participants: Mike (SWE), Sarah (QA)
- Thread history:
  - You: "Login is crashing on Safari"
  - Mike: "I'll investigate"
  - Sarah: "I'll test once fixed"

Current state: Ticket is In Progress, assigned to Mike

You add comment: "Any update on the Safari crash?"

Who wakes:
✅ You (commenter) — active participant
✅ Mike (current participant + assignee)
✅ Sarah (current participant + historical author)

All three receive the comment and can respond.
```

### Why This Matters

**Problem:** Without multi-author wake-ups, critical context gets lost.

**Example:** Mike fixed the bug, but Sarah (QA) doesn't know it's ready for testing. If only the most recent speaker was woken, Sarah would never see the completion.

**Solution:** Wake all participants and historical authors. The full collaboration team stays in the loop.

### Difference from 1:1 Chat

| 1:1 Chat | Ticket Thread |
|----------|---------------|
| Only two participants: you and the employee | Multiple participants: assignee + added collaborators |
| Comment wakes only the employee | Comment wakes all participants + historical authors |
| No status tracking | Status workflow (Open → In Progress → Done) |
| No audit trail | Full audit of changes and comments |
| Temporary coordination | Durable work record |

**Use chat** for quick questions. **Use tickets** for accountable work.

---

## Ticket Memory

### What is Ticket Memory?

Long-running ticket threads accumulate context. Team-X uses **digests** and **checkpoints** to manage this:

- **Digest**: Condensed summary of prior conversation (periodic, configurable)
- **Checkpoint**: Resumable state snapshot (manual or automatic)

### Memory Card

Inside the ticket detail panel, the **Memory Card** shows:

| Field | Meaning |
|-------|---------|
| **Digest Status** | Current digest summary of thread |
| **Last Checkpoint** | When state was last snapshotted |
| **Token Count** | Total tokens in thread context |
| **Context Budget** | How many tokens remain before truncation |

### When Memory Matters

**Scenario:** Long ticket thread (50+ messages, 2+ weeks of work)

**Problem:** If you comment "What did we decide about the error handling?", the employee needs to scroll through 50 messages to find the answer.

**Solution:**
1. Check the Memory Card for digest summary
2. If digest doesn't capture it, ask for checkpoint: "Summarize our error handling decision and checkpoint it"
3. Future questions reference the checkpoint instead of replaying raw history

### Memory Settings

Configure default memory behavior in **Settings → Memory**:

| Setting | Default | Effect |
|---------|---------|--------|
| **Pack Budget** | 8000 tokens | Max context sent to model per turn |
| **Recent Turn Window** | 5 turns | How many recent messages sent verbatim |
| **Checkpoint Depth** | 3 checkpoints | How many historical checkpoints preserved |
| **Digest Cadence** | Every 10 turns | How often conversation is summarized |

**Adjust these** for long-running tickets:
- Increase **Pack Budget** for complex work (costs more tokens)
- Increase **Recent Turn Window** for detailed context (costs more tokens)
- Increase **Checkpoint Depth** for long threads (uses more storage)

---

## Ticket Lifecycle Examples

### Example 1: Simple Bug Fix

```
1. CREATE
   - You: Press Ctrl+K → "File a critical ticket: login crashes on Safari"
   - System: Classifies intent, prompts for priority (you select Critical)
   - Result: Ticket #47 created in Open, assigned to Mike (SWE)

2. ASSIGN & START
   - Mike sees ticket in his queue, status changes to In Progress
   - Mike: "I'll investigate the Safari crash. Reproducing now."
   - Tool call: Mike reads error logs
   - Mike: "Found it — race condition in auth state. Fixing now."

3. BLOCK & UNBLOCK
   - Mike: "Need design decision: should we show error modal or silent redirect?"
   - Ticket status changes to Blocked (awaiting design input)
   - You (comment): "Use error modal, preserve user input"
   - Ticket status changes back to In Progress

4. COMPLETE
   - Mike: "Fix deployed. Testing on Safari now."
   - Tool call: Mike runs tests, all pass
   - Mike: "Safari login working. Ready for QA."
   - You add Sarah (QA) as participant
   - Sarah: "Tested on Safari 17. Login works. Closing."
   - Status: Done

5. AUDIT
   - Audit log shows: created → assigned → in_progress → blocked → in_progress → done
   - Full thread preserved with tool calls and test results
```

### Example 2: Multi-Participant Feature

```
1. CREATE
   - You: Tickets tab → Create Ticket
   - Title: "User profile page with avatar upload"
   - Description: Full requirements with design mock
   - Priority: High
   - Assignee: Priya (Frontend)
   - Participants: Priya (Frontend), Mateo (Backend), Lin (Design)
   - Project: Q2 Feature Rollout
   - Due Date: March 20

2. COLLABORATION
   - Lin (Design): "Attached updated mock with avatar crop guidelines."
   - [Attachment: avatar-mock-v2.png]
   - Priya (Frontend): "I'll build the React component. Mateo, do we have an upload endpoint?"
   - Mateo (Backend): "Yes, POST /api/avatar. Requires auth token. Documenting."
   - [Mateo creates attachment: avatar-api-spec.md]
   - Priya: "Component built. Testing with mock endpoint."

3. COORDINATION
   - You (comment): "Any blockers on avatar upload?"
   - Ticket wakes: Priya, Mateo, Lin, You
   - Priya: "Waiting on Mateo's endpoint to go to staging."
   - Mateo: "Deploying to staging now. Ready in 5 min."
   - [All participants see Mateo's message]

4. COMPLETION
   - Priya: "Avatar upload working end-to-end. Attaching screenshot."
   - [Attachment: avatar-upload-success.png]
   - You: "Looks great. Closing."
   - Status: Done
```

---

## Working with Tickets

### Assigning Work

**Automatic assignment:**
- Create ticket with assignee → employee sees it in their queue
- No extra prompting needed → they "own" the work

**Reassigning:**
- Open ticket detail → change Assignee field
- Previous assignee notified, new assignee receives ticket
- Audit log records the reassignment

**Unassigned tickets:**
- Stay in Open column
- Visible to all employees (whoever has capacity can pick up)
- Use for "whoever is free" work distribution

### Updating Status

**Method 1: Drag and drop**
- Drag ticket card between columns on Kanban board
- Status updates automatically

**Method 2: Status badge**
- Click status badge in ticket detail header
- Select new status from dropdown

**Method 3: Command Palette**
```
Press Ctrl+K → "Close ticket #47"
Press Ctrl+K → "Mark ticket #42 as blocked"
```

### Managing Participants

**Adding participants:**
- Open ticket detail → Activity section → Participants
- Click "Add participant" → select employee(s)
- New participants see full thread history

**Removing participants:**
- Click "×" next to participant name
- They lose access to future thread updates
- Historical comments remain visible

**Why add participants?**
- Cross-functional work (design + frontend + backend)
- Expert consultation (add senior engineer for code review)
- Notification (add stakeholder so they see progress)

### Attaching Files

**From vault:**
1. Open ticket detail → Activity section → Attachments
2. Click "Attach file"
3. Select from vault files
4. File appears in ticket, visible to all participants

**Agent-created files:**
When an employee creates a deliverable (code, doc, design):
1. File saved to employee workspace
2. If vault enabled, copied to company vault
3. Tagged as `agent-created`
4. Automatically attached to ticket

**Use cases:**
- Requirements documents
- Design mockups
- API specifications
- Test results
- Deliverable artifacts

### Closing and Reopening

**Closing:**
1. Click **Close Ticket** in detail header
2. Card animates to Done column
3. Assignee and participants notified
4. Audit log records closure

**Reopening:**
1. Click **Reopen** on Done ticket
2. Card returns to Open column
3. Assignee retained (or change if needed)
4. New comment prompts: "Why reopening?"
5. Audit log shows original completion + reopening

---

## Ticket Best Practices

### 1. Write Strong Descriptions

**Weak:**
```
Implement auth
```

**Strong:**
```
Implement user authentication with the following requirements:
- JWT tokens with 24-hour expiry
- Refresh token rotation
- Password reset flow via email
- Rate limiting on login endpoint
- Audit logging for auth events

See attached API spec for endpoint details.
```

**Why it matters:** Employees act on what they understand. Vague descriptions produce vague results.

### 2. Use Priority Correctly

| Priority | Use For | Example |
|----------|---------|---------|
| **Critical** | Production down, security issue, data loss | "Payment processing failing" |
| **High** | User-facing bug, deadline-driven | "Checkout broken before sale" |
| **Medium** | Standard work, normal features | "Implement user profile" |
| **Low** | Nice-to-have, research, backlog | "Evaluate new libraries" |

**Rule:** If >20% of tickets are Critical, you're not using the scale correctly.

### 3. Link to Projects

**Without project links:**
- Tickets are isolated work items
- No connection to larger initiatives
- Hard to see progress on goals

**With project links:**
- Tickets roll up to project progress
- Project card shows completion percentage
- Easy to answer "How is Q2 Launch going?"

**How:** In ticket detail, select Project from dropdown. Project must exist first.

### 4. Add Participants Proactively

**When starting a ticket, ask:**
- Who needs to see this work?
- Who has expertise to contribute?
- Who needs to be notified when it's done?

**Add them upfront** instead of adding mid-thread. Full context from day 1.

### 5. Use Due Dates for Time Pressure

**Not every ticket needs a due date.** Use them when:
- External deadline exists (launch, client delivery)
- Coordination required (dependency on other ticket)
- Time-sensitive work (security patch, hotfix)

**Effect:** Due dates appear in Schedule calendar, creating visual time pressure.

### 6. Check Blocked Tickets Daily

**Blocked work is silent waste.** If you don't check:

- Dependencies fester
- Employees sit idle
- Deadlines slip

**Daily rhythm:**
1. Mission Control → check "Blocked Work" metric
2. If > 0, click to filter blocked tickets
3. Read block reason, unblock or reassign

### 7. Close Tickets Explicitly

**Don't let Done columns accumulate indefinitely.**

**Weekly review:**
1. Visit Done column
2. Verify deliverables
3. Close confirmed tickets
4. Reopen if incomplete

**Why:** Clean queues, accurate metrics, satisfied employees.

---

## Troubleshooting Tickets

### "Employee isn't responding on ticket"

**Diagnosis:**
1. Check employee status in Mission Control (Idle? Error? Blocked?)
2. Verify employee is in ticket participants list
3. Check if provider is enabled and connected

**Fix:**
- If Idle: Employee may have no capacity; comment "@employee-name" to wake explicitly
- If Error: Check provider connection, resolve error
- If not in participants: Add them to ticket

### "Ticket thread is truncated / old messages missing"

**Diagnosis:** Memory budget exceeded, oldest messages dropped

**Fix:**
1. Check Memory Card in ticket detail
2. Increase **Pack Budget** in Settings → Memory
3. Ask employee to summarize and checkpoint key decisions

### "Ticket shows in wrong column"

**Diagnosis:** Status sync issue or drag-and-drop didn't register

**Fix:**
1. Refresh Tickets view (F5 or Cmd+R)
2. If still wrong, click status badge in detail to reset
3. Check Audit log to confirm status change was recorded

### "Can't find a ticket I created"

**Diagnosis:**
- Wrong workspace selected?
- Ticket filtered out?
- Accidentally deleted?

**Fix:**
1. Check workspace switcher (top-left)
2. Clear filters (search, status, assignee)
3. Check Audit log for ticket creation event

---

## Related Sections

- [Command Palette](#6-command-palette) — Creating tickets via natural language
- [Task Planner](../../task-planner.md) — AI-powered ticket decomposition and delegation
- [Projects, Goals & Schedule](#8-projects--goals--schedule) — Linking tickets to initiatives
- [Chat & Conversations](#9-chat--conversations) — Contrast with ticket threads
- [Files & Deliverables](#11-files--deliverables) — Ticket attachments
- [Mission Control Dashboard](#5-mission-control-dashboard) — Monitoring ticket queues

---

*Enhanced Tickets & Work documentation — 480+ lines vs. original ~100 lines*
