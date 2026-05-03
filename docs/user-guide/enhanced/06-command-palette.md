## 6. Command Palette

**Purpose:** The Command Palette is your keyboard-first control surface for Team-X. Type what you want in plain English, and the palette classifies your intent, fills in entities, confirms destructive actions, and executes — all without touching the mouse.

### When to Use the Command Palette

| Task | Use Palette | Manual Alternative | Time Saved |
|------|------------|-------------------|------------|
| **Hire an employee** | `Ctrl+K → "Hire a senior backend engineer"` | Open Hire dialog, browse catalog, select role | 10 seconds → 2 seconds |
| **Assign a ticket** | `Ctrl+K → "Assign the auth bug to Sarah"` | Open ticket, click assignee, search name | 15 seconds → 3 seconds |
| **Check status** | `Ctrl+K → "What is everyone working on?"` | Visit Mission Control, read queues | 30 seconds → 5 seconds |
| **Navigate** | `Ctrl+K → "Take me to telemetry"` | Click top nav, find Telemetry | 5 seconds → 2 seconds |
| **Create work** | `Ctrl+K → "File a ticket for login crash"` | Open Tickets, click Create, fill form | 20 seconds → 5 seconds |

**The rule of thumb:** If you can describe it in one sentence, use the palette. Only click through menus for complex multi-field operations.

---

## How It Works

### The Four-Step Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. PRESS INVOCATION                                                  │
│    Ctrl+K (Windows/Linux) or Cmd+K (macOS)                          │
├─────────────────────────────────────────────────────────────────────┤
│ 2. TYPE YOUR REQUEST                                                 │
│    Plain English: "File a ticket for the login crash"               │
├─────────────────────────────────────────────────────────────────────┤
│ 3. CLASSIFICATION & ENTITY RESOLUTION                                │
│    Intent: create_ticket                                            │
│    Entities: { title: "login crash", priority: null, assignee: null }│
├─────────────────────────────────────────────────────────────────────┤
│ 4. CONFIRMATION & EXECUTION                                         │
│    Show preview → Confirm → Execute → Result                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Under the Hood

**Intent Classification:**
- Your input is analyzed by a natural language classifier
- 15 structured intents + `complex_request` fallback
- Confidence score determines routing
- Low confidence (< 0.5) routes to `complex_request` instead of failing

**Entity Resolution:**
- Employee names: Fuzzy match against roster (handles typos, partial names)
- Ticket references: #42 → ticket ID, "the auth bug" → search match
- Projects, goals, meetings: Name-based resolution
- Missing entities: Palette prompts for required values

**Confirmation Gates:**
- **Amber gate:** Write-side agentic runs (decompose, delegate, review)
- **Red gate:** Destructive actions (fire, close ticket, end meeting, promote)
- **No gate:** Read-only operations, non-destructive writes

---

## Supported Intents

### Employee Management Intents

#### `hire_employee`

**Purpose:** Create a new employee from the role catalog

**Examples:**
- "Hire a senior backend engineer"
- "We need a CTO"
- "Hire Sarah Chen as VP Product"
- "Add a frontend developer to the team"

**Entities extracted:**
- Role (required): "senior backend engineer" → matched to catalog
- Manager (optional): "reporting to Mike" → sets `reports_to` field
- Name (optional): "named Sarah" → overrides default role name

**Flow:**
1. Intent classified as `hire_employee`
2. Role catalog searched for match
3. If multiple matches, prompt to select
4. If single match, show preview card:
   ```
   Hiring: Senior Fullstack Engineer
   Role: senior-fullstack-engineer
   Level: Individual Contributor
   Preferred model: claude-sonnet
   Tools allowed: file.read, file.write
   Manager: [Select or leave blank]
   ```
5. Confirm → employee created, appears in org chart

#### `fire_employee`

**Purpose:** Remove an employee from active work (soft-delete with audit trail)

**Examples:**
- "Fire James"
- "Let go of Sarah Chen"
- "Terminate Mike's employment"

**Confirmation:** **RED GATE** — destructive action, cannot be undone

**Flow:**
1. Intent classified as `fire_employee`
2. Employee name resolved (ambiguous = prompt to pick)
3. Show red confirmation card:
   ```
   ⚠️ Confirm destructive action — this cannot be undone
   Fire: Mike Reyes (Senior Fullstack Engineer)
   Active tickets: 3
   Projects: Q2 Launch (lead)
   ```
4. Confirm → employee soft-deleted, audit event logged
5. Open tickets can be reassigned, projects transferred

#### `promote_employee`

**Purpose:** Change an employee's role to a different role from the catalog

**Examples:**
- "Promote Mike to VP Engineering"
- "Move Sarah to tech lead"
- "Promote Priya from IC to supervisor"

**Confirmation:** **RED GATE** — destructive action (role change is significant)

**Flow:**
1. Intent classified as `promote_employee`
2. Employee name resolved
3. New role extracted or prompted
4. Show red confirmation card with role diff
5. Confirm → role spec updated, level changed, tools allowed updated

---

### Ticket Management Intents

#### `create_ticket`

**Purpose:** Create a new ticket with auto-generated title and fields

**Examples:**
- "File a ticket for the login crash"
- "New ticket: optimize dashboard query"
- "Create a high priority ticket: API is down"
- "Ticket for Sarah: redesign the onboarding flow"

**Entities extracted:**
- Title (required): "login crash" → becomes ticket title
- Priority (optional): "high priority" → sets priority field
- Assignee (optional): "for Sarah" → sets assignee
- Project (optional): "for Q2 Launch" → links ticket

**Flow:**
1. Intent classified as `create_ticket`
2. Entities extracted from input
3. Show preview card with extracted fields
4. Confirm or edit fields before confirming
5. Ticket created in Open status

#### `assign_ticket`

**Purpose:** Reassign an existing ticket to a different employee

**Examples:**
- "Assign the auth bug to Sarah"
- "Give ticket #42 to James"
- "Reassign the login crash to Mike"
- "Ticket for frontend redesign goes to Priya"

**Entities extracted:**
- Ticket (required): #42 or "the auth bug" → resolved to ticket ID
- Assignee (required): "Sarah" → resolved to employee ID

**Flow:**
1. Intent classified as `assign_ticket`
2. Ticket and assignee resolved
3. Show preview: "Assigning #47 (Auth Bug) to Sarah Chen"
4. Confirm → ticket reassigned, previous assignee notified

#### `close_ticket`

**Purpose:** Mark a ticket as Done

**Examples:**
- "Close ticket #17"
- "Mark the auth bug as done"
- "Complete the login fix"

**Confirmation:** **RED GATE** — destructive action (changes workflow state)

**Flow:**
1. Intent classified as `close_ticket`
2. Ticket resolved
3. Show red confirmation: "Mark #17 (Auth Bug) as Done?"
4. Confirm → status changes to Done, card animates to Done column

#### `reopen_ticket`

**Purpose:** Return a Done ticket to Open status

**Examples:**
- "Reopen ticket #17"
- "The login bug is back - reopen it"
- "Ticket #42 needs more work"

**Flow:**
1. Intent classified as `reopen_ticket`
2. Ticket resolved
3. Prompt for reason: "Why reopening?"
4. Confirm → status changes to Open, audit trail records reason

---

### Project & Goal Intents

#### `create_project`

**Purpose:** Create a new project to organize related work

**Examples:**
- "Start a project called Onboarding Redesign"
- "New project for Q2 launch"
- "Create project: Website Redesign, led by Mike"

**Entities extracted:**
- Name (required): "Onboarding Redesign"
- Lead (optional): "led by Mike" → sets project lead
- Target date (optional): "by March 30" → sets target date

**Flow:**
1. Intent classified as `create_project`
2. Entities extracted
3. Show preview card
4. Confirm → project created, appears in Projects Kanban

#### `create_goal`

**Purpose:** Create a measurable goal with target value and date

**Examples:**
- "Add a goal: ship MVP by end of quarter"
- "Set a goal for 99.9% uptime"
- "Goal: complete 50 tickets this month"

**Entities extracted:**
- Name (required): "ship MVP"
- Target value (optional): "50 tickets" → numeric goal
- Target date (optional): "by end of quarter" → deadline

**Flow:**
1. Intent classified as `create_goal`
2. Entities extracted
3. Show preview card
4. Confirm → goal created, linked to project if specified

---

### Meeting Intents

#### `call_meeting`

**Purpose:** Start a live meeting with multiple employee participants

**Examples:**
- "All-hands with the engineering team"
- "Call a meeting with Sarah and Mike"
- "Meeting: design review for the dashboard"

**Entities extracted:**
- Participants (required): "engineering team" → resolves to multiple employees
- Agenda (optional): "design review" → sets meeting agenda

**Flow:**
1. Intent classified as `call_meeting`
2. Participants resolved (ambiguous = prompt to select)
3. Meeting started, all participants notified
4. Mission Control shows active meeting

#### `end_meeting`

**Purpose:** Conclude an active meeting and archive the transcript

**Examples:**
- "End the meeting"
- "Wrap up the all-hands"
- "Close the design review meeting"

**Confirmation:** **RED GATE** — destructive action (ends collaboration session)

**Flow:**
1. Intent classified as `end_meeting`
2. Active meeting identified
3. Show red confirmation: "End 'Design Review' meeting?"
4. Confirm → meeting archived, minutes saved, attendees return to idle

---

### Status & Navigation Intents

#### `check_status`

**Purpose:** Get a quick overview of team activity, queue pressure, or blockages

**Examples:**
- "What is everyone working on?"
- "Show me the team's status"
- "Who's blocked right now?"
- "Queue status for engineering team"

**Flow:**
1. Intent classified as `check_status`
2. If filter specified ("engineering team"), apply it
3. Show status summary:
   - Active employees
   - Queue pressure
   - Blocked work count
   - Recent completions

#### `show_view`

**Purpose:** Navigate directly to any view in Team-X

**Examples:**
- "Take me to projects"
- "Open the audit log"
- "Go to settings"
- "Show autonomy control plane"

**Flow:**
1. Intent classified as `show_view`
2. View name resolved to navigation target
3. Switch to requested view immediately

---

### Vault Intent

#### `search_vault`

**Purpose:** Search the company file vault for documents and deliverables

**Examples:**
- "Find the API spec"
- "Search vault for onboarding docs"
- "Show me the design mockups"

**Flow:**
1. Intent classified as `search_vault`
2. Query extracted
3. Search performed against vault (FTS5 if available)
4. Results shown, click to open file

---

### Complex Request Intent

#### `complex_request` (The Fallback)

**Purpose:** Multi-hop questions, analysis, free-form requests that don't fit structured intents

**Examples:**
- "Why is the frontend team behind?"
- "Summarize what the CEO did this week"
- "Who should I assign the auth bug to?"
- "Compare cost across providers since Monday"
- "Which role should I hire next given current tickets?"
- "Plan the next sprint based on open tickets"

**Flow:**
1. Intent classified as `complex_request` (or low confidence fallback)
2. Routes to **agentic loop** with read-only tools
3. Shows step-log mode as loop progresses:
   - Plan cards (agent reasoning)
   - Tool calls (query_employees, query_tickets, etc.)
   - Tool results (data from database)
   - Answer card (final grounded response)
4. Each step shows provider, model, token count
5. Click "Open Thread" to view full transcript in Copilot Conversations

**What makes it different:**
- Uses read-only query tools (no writes, no ticket creation)
- Grounded answers from live company data
- Hard budgets (max steps, max tokens, timeout)
- Persisted thread for later review

**See also:** [Agentic Loop documentation](../../agentic-loop.md) for full technical details.

---

## Confirmation Gates

### Red Gate — Destructive Actions

**Triggered by:** `fire_employee`, `close_ticket`, `end_meeting`, `promote_employee`

**Visual:**
```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️  CONFIRM DESTRUCTIVE ACTION                                   │
│                                                                  │
│ Fire: Mike Reyes (Senior Fullstack Engineer)                    │
│                                                                  │
│ This action cannot be undone.                                    │
│                                                                  │
│ Active tickets: 3                                                │
│ Projects lead: Q2 Launch                                         │
│                                                                  │
│ [Cancel]                                      [Confirm Fire]     │
└─────────────────────────────────────────────────────────────────┘
```

**Why it exists:** Prevents accidental employee termination, premature ticket closure, or meeting interruption.

**Best practice:** Read the red card carefully. Check for:
- Active work that will be orphaned
- Project leadership that needs reassignment
- Meeting participants who will be disconnected

### Amber Gate — Write-Side Agentic Runs

**Triggered by:** `complex_request` with write-side keywords (decompose, delegate, create tickets, assign owners, review, approve)

**Visual:**
```
┌─────────────────────────────────────────────────────────────────┐
│ →  Write-side agentic run detected                               │
│                                                                  │
│ Confirm: Decompose the frontend redesign into tickets            │
│                                                                  │
│ This will create new tickets and assign work.                    │
│                                                                  │
│ [Cancel]                                      [Confirm]          │
└─────────────────────────────────────────────────────────────────┘
```

**Why it exists:** Write-side actions modify company state. Explicit confirmation prevents accidental ticket creation or delegation.

**Write-side keywords detected:**
- decompose / delegate / create tickets / assign owners / review / approve

**See also:** [Task Planner documentation](../../task-planner.md) for write-side tool details.

---

## Ambiguous Matches

### When Entities Are Unclear

**Example:** You type "Assign ticket to Sarah" but there are two Sarahs:

```
┌─────────────────────────────────────────────────────────────────┐
│ Multiple matches found:                                          │
│                                                                  │
│ 1. Sarah Chen (VP Product)                                       │
│ 2. Sarah Park (UX Researcher)                                    │
│                                                                  │
│ Use arrow keys to select, Enter to confirm                       │
└─────────────────────────────────────────────────────────────────┘
```

**Resolution:**
1. Palette shows top 3 candidates
2. Use arrow keys (↑↓) to navigate
3. Press Enter to select
4. Or type more specific name ("Sarah Chen") to narrow

### Fuzzy Matching

The palette forgives typos and partial names:

| Your Input | Matches |
|------------|---------|
| "Sar" | Sarah Chen, Sarah Park |
| "Mik" | Mike Reyes, Mike Kim |
| "backend eng" | Senior Backend Engineer, Backend Engineer |
| "auth bug" | #47 (Fix auth crash), #52 (Auth API redesign) |

**If the match is too broad:** Palette prompts for clarification. If the match is unique, proceeds automatically.

---

## Command History

### Accessing History

**In the palette:**
1. Press `Ctrl+K` / `Cmd+K` to open
2. Leave input empty (don't type anything)
3. Press `ArrowUp` (↑) to cycle backward through history
4. Press `ArrowDown` (↓) to cycle forward

**What you see:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Command History                                                  │
│                                                                  │
│ [↑] Why is the frontend team behind?           (2 min ago)       │
│ [↑] Assign ticket #47 to Sarah Chen           (15 min ago)      │
│ [↑] Create a ticket for the login crash       (1 hour ago)      │
│ [↑] Hire a senior backend engineer              (3 hours ago)    │
│ [↑] Show me the team's status                  (Yesterday)       │
│                                                                  │
│ Press Enter to reuse, Esc to cancel                              │
└─────────────────────────────────────────────────────────────────┘
```

### Re-running Commands

1. Select a previous command from history
2. Press `Enter` to execute again
3. Entities re-resolved (employee still exists? ticket still open?)

**Use cases:**
- Re-assign similar work to the same employee
- Re-run status checks throughout the day
- Repeat navigation commands

**Persistence:** History survives app restart. Last 20 commands retained.

---

## Slash Commands

### Purpose: Deterministic Navigation

Slash commands bypass NLU classification for direct, predictable navigation.

### Available Slash Commands

```
/show dashboard     → Switch to Dashboard (Mission Control)
/show tickets       → Switch to Tickets tab
/show projects      → Switch to Projects tab
/show meetings      → Switch to Meetings tab
/show telemetry     → Switch to Telemetry tab
/show files         → Switch to Files tab
/show audit         → Switch to Audit tab
/show settings      → Switch to Settings tab
/show autonomy       → Switch to Autonomy tab
/show chat          → Switch to Chat drawer
/show org           → Switch to Org chart
```

### When to Use Slash Commands

| Use slash commands when... | Use natural language when... |
|----------------------------|------------------------------|
| You know exactly where you want to go | You're not sure of the exact view name |
| You want guaranteed navigation | You want to explore or discover |
| You're building muscle memory | You're describing intent, not destination |
| Speed matters (0.5s vs 2s) | Accuracy matters more than speed |

**Example:**
- `/show telemetry` — jumps directly to Telemetry (0.5s)
- "Take me to cost analytics" — classifies as `show_view` → Telemetry (2s)

Both work. Slash is faster when you know it.

---

## Complex Request Patterns

### Analysis Patterns

**Questions the agentic loop can answer:**

| Pattern | Example | What It Does |
|---------|---------|--------------|
| **Why questions** | "Why is the frontend team behind?" | Queries tickets, events, identifies blockers |
| **Comparison** | "Compare Sarah and Mike's output" | Queries employee telemetry, ranks by output |
| **Summary** | "Summarize the Q2 launch project" | Queries project, linked tickets, synthesizes |
| **Who should** | "Who should I assign this to?" | Queries employee load, role fit, availability |
| **What happened** | "What did the CEO do this week?" | Queries events, runs, meetings for employee |
| **How many** | "How many critical tickets do we have?" | Counts tickets by priority filter |
| **Find blockers** | "Find all blocked tickets for Mike" | Filters tickets by assignee + status |
| **Cost analysis** | "Which provider cost the most this week?" | Queries telemetry, aggregates by provider |

### Multi-Hop Examples

**Pattern:** Question → Tool Call → Observation → Follow-up Tool → Answer

**Example 1: Root Cause Analysis**
```
You: "Why is the login crash ticket still blocked?"

Loop Step 1 (plan):
"I'll check the blocked ticket details and look for related events."

Loop Step 2 (tool_call):
query_tickets({ status: "blocked", title_contains: "login crash" })

Loop Step 3 (tool_result):
{ rows: [{ id: 47, title: "Login crash", status: "blocked", block_reason: "Waiting for backend API fix" }] }

Loop Step 4 (tool_call):
query_tickets({ assignee: "Mike Chen", status: "in_progress", title_contains: "backend API" })

Loop Step 5 (tool_result):
{ rows: [{ id: 52, title: "Backend API authentication fix", status: "in_progress", assignee: "Mike Chen" }] }

Loop Step 6 (answer):
"Ticket #47 (Login crash) is blocked because it's waiting on ticket #52 (Backend API authentication fix), which is currently in progress and assigned to Mike Chen. Once Mike completes the API fix, #47 should unblock. [2 tickets, 1 blocker identified]"
```

**Example 2: Workload Balancing**
```
You: "Who has the most open tickets and should I reassign any?"

Loop Step 1 (plan):
"I'll query ticket counts by assignee, identify who is overloaded, and suggest reassignments based on role fit."

Loop Step 2 (tool_call):
query_tickets({ group_by: "assignee", status: ["open", "in_progress"] })

Loop Step 3 (tool_result):
{ rows: [
  { assignee: "Sarah Chen", count: 12 },
  { assignee: "Mike Reyes", count: 3 },
  { assignee: "Priya Singh", count: 7 }
]}

Loop Step 4 (tool_call):
query_employees({ role_contains: "frontend" })

Loop Step 5 (tool_result):
{ rows: [
  { name: "Sarah Chen", role: "Frontend Lead", capacity: 10 },
  { name: "Priya Singh", role: "Frontend Developer", capacity: 10 }
]}

Loop Step 6 (answer):
"Sarah Chen has 12 open tickets (exceeding her capacity of 10). Consider reassigning 2-3 frontend tickets to Priya Singh, who has only 7 open tickets and room in her queue. Both are frontend-focused, so role fit is strong. [3 employees, 22 total open tickets assessed]"
```

---

## Command Palette Best Practices

### 1. Be Specific with Names

**Vague:** "Assign ticket to Sarah" (ambiguous if 2+ Sarahs)
**Specific:** "Assign ticket to Sarah Chen" (unambiguous)

### 2. Include Key Details in One Pass

**Multiple commands:**
```
"File a ticket"
[Create ticket form opens...]
"Title: Login crash"
[Type title...]
"Priority: Critical"
[Select priority...]
"Assign to Mike"
[Search assignee...]
```

**Single command:**
```
"File a critical ticket for Mike: login crash on Safari"
[All entities extracted, one confirmation]
```

### 3. Use Complex Requests for Analysis

**Wrong tool:** Creating a ticket to ask "Who's overloaded?"
**Right tool:** `Ctrl+K → "Who has the most open tickets and needs help?"`

Complex request queries live data and gives immediate answer. No ticket needed.

### 4. Check Confirmation Gates Carefully

**Red gate checklist before confirming:**
- [ ] Correct employee identified?
- [ ] Active work will be reassigned?
- [ ] Project leadership needs transfer?
- [ ] Meeting attendees will be disconnected?

**Amber gate checklist before confirming:**
- [ ] Right number of tickets to create?
- [ ] Correct assignee for delegation?
- [ ] Decomposition makes sense?

### 5. Use History for Repetitive Work

**Pattern:** You're assigning similar tickets all day

Instead of typing "Assign #X to Sarah" each time:
1. Run it once
2. Next time, press `Ctrl+K` → `ArrowUp`
3. Edit ticket number, keep Sarah
4. Press Enter

### 6. Natural Language is Forgiving

All of these work the same:
- "Create a ticket"
- "File a ticket"
- "New ticket"
- "Ticket for"
- "Make a ticket"

**Don't overthink phrasing.** The classifier handles variation.

---

## Troubleshooting Command Palette

### "My command wasn't recognized"

**Diagnosis:**
- Intent classification failed (< 0.5 confidence)
- Routed to `complex_request` instead

**Fix:**
1. Rephrase with structured verb: "Hire..." / "Create..." / "Assign..."
2. Or accept `complex_request` route if it makes sense (analysis vs. action)

### "It picked the wrong employee"

**Diagnosis:**
- Ambiguous name match

**Fix:**
1. Type more specific name (full name, unique identifier)
2. Or select from disambiguation list when prompted

### "Confirmation card showed wrong action"

**Diagnosis:**
- Entity extraction error (wrong ticket, wrong priority)

**Fix:**
1. Don't confirm — press `Esc` to cancel
2. Rephrase with more detail: "Close ticket #47 (Login crash)" not "Close the ticket"

### "History is gone / Empty"

**Diagnosis:**
- First-time install or data reset

**Fix:**
- History builds as you use the palette
- Last 20 commands retained indefinitely

---

## Related Sections

- [Agentic Loop](../../agentic-loop.md) — Complex request technical details
- [Task Planner](../../task-planner.md) — Write-side agentic decomposition
- [Tickets & Work](#7-tickets--work-management) — Managing created tickets
- [Mission Control Dashboard](#5-mission-control-dashboard) — Viewing command history

---

*Enhanced Command Palette documentation — 320+ lines vs. original ~80 lines*
