# Team-X User Guide

**Your AI-Powered Workforce, Running Locally**

---

## Welcome to Team-X

Team-X is a revolutionary approach to work: an AI-powered workforce that lives entirely on your machine. Hire synthetic employees with hand-crafted F10 role specifications, assign them work through tickets and projects, and watch them execute tasks using your chosen LLM providers—all with complete privacy, auditability, and control.

This guide will take you from first launch to a fully operational AI workforce.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Understanding Team-X](#2-understanding-team-x)
3. [Workspaces & Companies](#3-workspaces--companies)
4. [Hiring & Managing Employees](#4-hiring--managing-employees)
5. [Mission Control Dashboard](#5-mission-control-dashboard)
6. [Command Palette](#6-command-palette)
7. [Tickets & Work Management](#7-tickets--work-management)
8. [Projects, Goals & Schedule](#8-projects--goals--schedule)
9. [Chat & Conversations](#9-chat--conversations)
10. [Meetings & Collaboration](#10-meetings--collaboration)
11. [Files & Deliverables](#11-files--deliverables)
12. [Copilot: Proactive Intelligence](#12-copilot-proactive-intelligence)
13. [Autonomy Control Plane](#13-autonomy-control-plane)
14. [Extensions: Skills & MCPs](#14-extensions--skills--mcps)
15. [Settings & Configuration](#15-settings--configuration)
16. [Telemetry & Costs](#16-telemetry--costs)
17. [Audit Trail](#17-audit-trail)
18. [Troubleshooting](#18-troubleshooting)
19. [Best Practices](#19-best-practices)
20. [Keyboard Shortcuts](#20-keyboard-shortcuts)

---

## 1. Getting Started

### First Launch

When Team-X starts for the first time, it automatically:

1. Creates your local database (SQLite)
2. Sets up all required tables
3. Seeds a starter workspace ("Strategia-X") with a CEO and Senior Fullstack Engineer
4. Configures provider templates (Ollama and Anthropic, both disabled by default)

You'll immediately see the Dashboard with two employee cards ready.

### The 5-Minute Quickstart

**Step 1: Configure a Provider (2 min)**

1. Click **Settings** in the top navigation
2. Click **Providers** section
3. Toggle **Ollama** to enable (if you have Ollama installed locally)
   - Team-X auto-detects Ollama at `http://127.0.0.1:11434`
   - Or add **Anthropic**, **OpenAI**, **Google**, **Groq**, or other cloud providers
4. Click **Test Connection** to verify
5. Your API key is stored in your OS keychain, never in plain text

**Step 2: Start Your First Conversation (1 min)**

1. In the Dashboard, click on any employee card (CEO or Senior Fullstack Engineer)
2. The **Chat Drawer** slides open from the right
3. Type your first message in the composer:
   - Try: *"What is our mission?"* or *"What can you help me build?"*
4. Press **Ctrl+Enter** (Windows/Linux) or **Cmd+Enter** (Mac) to send
5. Watch the response stream in real-time, token-by-token

**Step 3: Create Your First Ticket (2 min)**

1. Press **Ctrl+K** (or **Cmd+K** on Mac) to open the Command Palette
2. Type: *"File a ticket to document the user authentication system"*
3. Press **Enter**
4. The palette shows the classified intent and details
5. Click **Confirm** (or press **Enter** again)
6. Your employee will pick up the ticket and begin work

That's it! You now have:
- ✅ A live AI workforce
- ✅ Working tickets
- ✅ Full audit trail
- ✅ Complete privacy control

---

## 2. Understanding Team-X

### The Core Concept

Team-X treats AI agents like **employees**, not chatbots. Each employee:

- Has a **role specification** written by human practitioners
- **Thinks and acts** according to their role's expertise
- **Owns work** through tickets, projects, and goals
- **Collaborates** with other employees through meetings and chat threads
- **Respects boundaries** through privacy tiers and authority controls

### What Makes Team-X Different

| Traditional AI Tools | Team-X |
|---------------------|---------|
| Chat with an AI | Hire an entire workforce |
| One-off prompts | Durable tickets and projects |
| No organization | Full org chart with hierarchy |
| What happens in the chat | Everything is audited |
| Cloud-only | Local-first, your data never leaves |
| Generic assistants | Role-specialized experts |

### The Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Top Navigation Bar                         │
├─────────────────────────────────────────────────────────────┤
│  Dashboard │ Autonomy │ Org │ Projects │ Tickets │      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────┐  ┌──────────┐  ┌───────────────────┐        │
│  │Employee │  │Threads   │  │  Mission Control  │        │
│  │  Rail   │  │Drawer   │  │  Dashboard       │        │
│  └─────────┘  └──────────┘  │                   │        │
│  ┌─────────┐                   │  Copilot Widget    │        │
│  │Hire +   │                   │                   │        │
│  │Workspace│                   └───────────────────┘        │
│  └─────────┘                                                │
└─────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Local-First**: Your data lives on your machine. No phone-home, no telemetry, no cloud sync unless you explicitly enable it.
2. **Everything is Audited**: Every action, every token, every cost is recorded in the audit log.
3. **Explicit Authority**: Nothing happens without your approval. Destructive actions require confirmation.
4. **Declarative Work**: You declare what needs doing (tickets, goals); employees figure out how.
5. **Role Fidelity**: Each employee has genuine expertise encoded by practitioners, not generic AI behavior.

---

## 3. Workspaces & Companies

### What is a Workspace?

A **workspace** (called a "company" in the UI) is an isolated operational environment. Each workspace has:

- Its own employee roster
- Separate tickets and projects
- Independent goals and meetings
- Unique settings and configurations
- Isolated audit trail

### Managing Workspaces

**Creating a New Workspace:**

1. Click the workspace switcher in the top bar (shows current workspace name)
2. Click **Create Company**
3. Enter:
   - **Name**: Display name
   - **Slug**: URL-safe identifier (e.g., `my-project`)
   - **Icon**: Optional emoji or visual marker
   - **Mission**: Your workspace's purpose
4. Click **Create**

Team-X automatically bootstraps two system agents in each workspace:
- **system-agent**: Handles complex reasoning questions
- **system-copilot**: Provides proactive insights

**Switching Between Workspaces:**

Use the workspace dropdown in the top navigation. Each workspace maintains complete isolation.

**Archiving and Deleting:**

- **Archive**: Pauses a workspace while preserving its data
- **Delete**: Permanently removes the workspace and all associated data

### Workspace Settings

Access company settings via:
1. Click the workspace dropdown
2. Click **Settings** next to the workspace name

Configure:
- Mission statement and description
- Visual branding (icon, theme)
- Operator access and sharing posture

---

## 4. Hiring & Managing Employees

### The Role Catalog

Team-X ships with **57 curated role specifications** across 6 hierarchy levels:

| Level | Count | Examples |
|-------|-------|----------|
| **Officer** | 5 | CEO, CTO, CFO, COO, CMO |
| **Senior Management** | 7 | VP Engineering, VP Product, VP Sales |
| **Management** | 8 | Engineering Manager, Product Manager, Design Manager |
| **Supervisor** | 5 | Team Supervisor, QA Supervisor |
| **Lead** | 5 | Tech Lead, Design Lead, Data Lead |
| **Individual Contributor** | 25 | Senior Fullstack Engineer, Frontend Developer, Data Scientist, UX Researcher |

Each role is hand-written by practitioners, not LLM-generated.

### Hiring an Employee

**Via the Hire Dialog:**

1. Click the **+ Hire** button in the left sidebar
2. Browse or search the role catalog
3. Use **level chips** to filter by hierarchy level
4. Click on a role to select it
5. Choose who they report to in the **Reports to** dropdown
6. Click **Hire**

**Via Command Palette:**

1. Press **Ctrl+K** / **Cmd+K**
2. Type: *"Hire a Senior Backend Engineer"*
3. Follow the prompts

### What Happens When You Hire

- A new employee record is created
- They appear in the org chart under their manager
- Their role specification is rendered with company context
- They're immediately available for work assignment
- An audit event logs the hire

### The Org Chart

Navigate to **Org** tab to see the full hierarchy:

- Employees are displayed in an indented tree
- Color-coded levels show hierarchy at a glance
- Drag employees to reorganize reporting structure
- The org chart prevents cycles (you can't make someone report to their subordinate)

### Employee Actions

**Promoting an Employee:**

1. Right-click the employee or open their detail panel
2. Select **Promote**
3. Choose the new role from the catalog
4. Their role specification, level, and system prompt update

**Changing Manager:**

1. Select the employee
2. Use **Set Manager** to pick a new reporting line
3. Org chart updates immediately

**Firing an Employee:**

1. Select the employee
2. Click **Fire**
3. The employee is soft-deleted (archived) for audit purposes
4. Active tickets can be reassigned

### Employee Profiles

Each employee has:
- **Name and Title**: Their identity in the org
- **Role Specification**: The system prompt that guides their behavior
- **Status**: idle, thinking, blocked, or error
- **Live Activity**: What they're working on right now
- **Telemetry**: Tokens used, cost incurred, latency

---

## 5. Mission Control Dashboard

**Purpose:** Mission Control is the operational heart of Team-X — your real-time view into everything happening across your AI workforce. It answers "What's happening right now?" and "What needs my attention?" in a single glance.

### When to Use Mission Control

Mission Control is designed for **daily operations**, not configuration or governance. Use it to:

- **Start your day** — See what completed overnight, what's blocked, and where cost is accumulating
- **Monitor active work** — Watch agentic loops progress, observe runtime health, spot queue pressure
- **Diagnose issues** — Identify which employee is stuck, which run failed, which routine didn't materialize
- **End your day** — Verify work settled, no unexpected spend, no silent failures

**Contrast with other views:**
- **Tickets** — Deep dive into specific work items
- **Autonomy** — Governance, budgets, approvals, runtime posture
- **Telemetry** — Historical cost and usage analysis
- **Mission Control** — Live operational pulse

---

## Accessing Mission Control

Click **Dashboard** in the top navigation. Mission Control is the default view.

**Keyboard shortcut:** Press `Ctrl+1` / `Cmd+1` to jump directly to Dashboard.

---

## Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Hero Metrics Row                                                   │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │
│  │Live  │ │Ext.  │ │Work  │ │Queue │ │Block │ │Today │           │
│  │Runs  │ │Runtim│ │Active│ │Press.│ │Work  │ │Cost  │           │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘           │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌──────────────────────────────────┐    │
│  │   Agent Runs Panel  │  │    Employee Queues Panel        │    │
│  │                     │  │                                  │    │
│  │  • Running loops    │  │  ┌────────────────────────────┐ │    │
│  │  • Completed runs    │  │  │ CEO (Idle)    ████░░░░░    │ │    │
│  │  • Failed runs       │  │  │ SWE (Live)    ░░░███░░░    │ │    │
│  │  • Status, steps,   │  │  │ PM (Blocked)  ████░░██░    │ │    │
│  │    tokens, cost     │  │  └────────────────────────────┘ │    │
│  │                     │  │                                  │    │
│  └─────────────────────┘  └──────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────────┤
│  Secondary Panels (collapsible)                                     │
│  • Copilot Insights  • Recent Commands  • Telemetry Snapshot       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Hero Metrics Row

The top row shows six live metrics. These update in real-time as work progresses.

### Metric Breakdown

| Metric | What It Shows | Healthy Range | When to Worry |
|--------|--------------|---------------|---------------|
| **Live Runs** | Agentic loops currently in progress (command-palette, task-planner, copilot-ask) | 0-5 for small orgs | Sustained >10 indicates heavy concurrent work |
| **External Runtimes** | Active runtime sessions (Bash, HTTP, VS Code, Cursor) + heartbeat state | Matches your configured profiles | Red heartbeat = session stalled or disconnected |
| **Workforce Active** | Employees currently processing work (thinking, streaming, tool-calling) | 20-50% of hired staff | 0% with open queue = provider or config issue |
| **Queue Pressure** | Total open + in-progress tickets across all employees | < 5x employee count | Sustained >10x = hire more or reassign |
| **Blocked Work** | Tickets in blocked status awaiting resolution | < 10% of active tickets | Rising blockage = dependency or authority issue |
| **Today Cost** | Token spend for current calendar day (resets at midnight) | Within daily budget | Approach 80% of budget = review spend rate |

### Reading the Metrics Together

**Scenario 1: Healthy Execution**
```
Live Runs: 2  |  External Runtimes: 0  |  Workforce Active: 3/8
Queue Pressure: 12  | Blocked Work: 0  | Today Cost: $0.47
```
→ Work is flowing, no blockages, cost is reasonable. No action needed.

**Scenario 2: Queue Saturation**
```
Live Runs: 0  |  External Runtimes: 0  | Workforce Active: 1/8
Queue Pressure: 47  | Blocked Work: 12  | Today Cost: $0.12
```
→ Employees stuck, queue not moving. Check: (1) Provider enabled? (2) Blocked tickets clearing? (3) Employee status errors?

**Scenario 3: Spend Spike**
```
Live Runs: 8  |  External Runtimes: 3  |  Workforce Active: 7/8
Queue Pressure: 23  | Blocked Work: 2  | Today Cost: $14.82
```
→ Heavy concurrent execution driving cost. Decide: (1) Let it run if urgent? (2) Throttle concurrency in Settings? (3) Check budget caps?

---

## Primary Panels

Mission Control's two main panels can be shown/hidden independently. Both provide complementary views of live operations.

### Agent Runs Panel

Shows recent agentic loop executions with live status updates.

#### What You See Per Run

| Field | Meaning | Why It Matters |
|-------|---------|----------------|
| **Label** | Short description of what the run is doing | Quick identification without opening threads |
| **Status** | `running` / `completed` / `failed` / `canceled` | Know at a glance if intervention is needed |
| **Step Count** | Number of ReAct loops executed (plan → tool → observe) | Progress indicator; high counts may need budget tuning |
| **Tokens** | Cumulative prompt + completion tokens used | Cost attribution; sudden spikes indicate problems |
| **Cost** | Estimated spend for this run (based on provider pricing) | Budget monitoring; catch expensive queries early |
| **Duration** | Wall-clock time since run started | Performance monitoring; hangs need investigation |
| **Provider/Model** | Which LLM processed the run | Routing verification; confirm privacy tier respected |

#### Interpreting Run States

**Running (Brand Pulse)**
- Normal: Steps incrementing, duration increasing gradually
- Abnormal: Stuck on same step for >60 seconds → possible provider hang or malformed tool call

**Completed (Green Check)**
- Review cost and token count — if unusually high, check the thread for what happened
- Failed runs show red badge with error reason

**Failed (Red X)**
- Common reasons:
  - `budget_exhausted`: Hit step/token/timeout ceiling → increase in Settings → Runtime → Agentic Loop
  - `timeout`: Wall-clock deadline exceeded → check provider latency or increase timeout
  - `canceled`: User aborted → expected if intentional
  - `provider_error`: API failure → test connection in Settings → Providers
  - `tool_error`: Repo or tool implementation issue → check console, file bug

#### Click Behavior

Click any run card to:
1. **Open the full thread transcript** in Copilot Conversations ( Threads drawer)
2. **Inspect each step** — plan cards, tool calls, tool results, final answer
3. **Copy the grounded answer** for reuse in tickets, docs, or chat
4. **Review cost attribution** for spend analysis

### Employee Queues Panel

Shows durable backlog per employee layered with live activity status.

#### What You See Per Employee

| Element | Meaning | Color Code |
|---------|---------|------------|
| **Name + Title** | Employee identity | — |
| **Status Badge** | Current activity state | Brand (Live) / Amber (Blocked) / Red (Error) / Gray (Idle) |
| **Queue Bar** | Visual breakdown of ticket counts | Gray (Open) / Brand (InProgress) / Amber (Blocked) / Green (Done) |
| **Quick Actions** | Chat bubble, ticket icon | Jump to conversation or ticket list |

#### Reading the Queue Bar

The horizontal bar shows four segments, left-to-right:

```
Open: ████████ (8)     InProgress: ███ (3)     Blocked: █ (1)     Done: ██████ (6)
   Gray                  Blue                   Amber              Green
```

**Healthy queue distribution:**
- Open: 30-50% of bar (room to accept work)
- In-Progress: 20-40% (active execution)
- Blocked: < 10% (dependencies resolving)
- Done: 10-30% (completion flowing)

**Warning signs:**
- All gray (Open only) → Employee not picking up work → Check provider, status, or availability
- All amber (Blocked only) → Employee or workspace stalled → Investigate blockage root cause
- Long Done segment → Work completing but not being archived/reviewed → May need attention

#### Status Badge Meanings

| Badge | State | Typical Cause | Action |
|-------|-------|---------------|--------|
| **Brand pulse** | Live/Active | Employee is thinking, streaming, or calling a tool | None — work in progress |
| **Amber** | Blocked | Ticket assigned to employee is blocked, or employee has no viable provider | Check ticket detail for block reason; verify provider configuration |
| **Red** | Error | Run failed, provider disconnected, or runtime error | Click employee → review recent runs; check provider connection |
| **Gray** | Idle | No active work, provider available, queue may be empty or employee unassigned | Normal if queue empty; assign tickets if employee should be working |

#### Quick Actions

- **Chat bubble**: Open 1:1 conversation with this employee
- **Ticket stack icon**: Filter tickets by this employee's assignee
- **Employee name**: Open profile detail (role, manager, telemetry, runtime binding)

---

## Secondary Panels

Three collapsible panels provide additional operational context without cluttering the main view.

### Copilot Insights

Shows recent proactive insights from the Copilot analyzer. Each insight card displays:

| Field | Meaning |
|-------|---------|
| **Category** | Operational / Cost / Org / Workflow / Anomaly |
| **Severity** | Info / Warning / Critical |
| **Summary** | One-line finding |
| **Evidence** | Count of events, tickets, or employees affected |
| **Timestamp** | When Copilot surfaced this insight |

**Best practice:** Review Copilot Insights at start and end of each session. Dismiss stale insights, investigate critical ones, and use "Ask Copilot" to dig deeper.

### Recent Commands

Shows the last 5 command-palette operations with:

| Field | Meaning |
|-------|---------|
| **Intent** | Classified intent (e.g., `create_ticket`, `complex_request`) |
| **Input** | What you typed |
| **Result** | Success / Failed / Canceled |
| **Timestamp** | When executed |

**Use case:** Quick audit of recent activity. Click "Command log" to see full history.

### Telemetry Snapshot

Miniature view of spend analytics:

| Metric | Display |
|--------|---------|
| **Execution pulse** | Runs per hour (last 24h) |
| **Cost rate** | Spend per hour (current session) |
| **Volume** | Total tokens this week |

**Use case:** Spot spend trends before they become budget issues. Click "Telemetry" for full analytics.

---

## Dashboard Actions

### Toggle Panel Visibility

| Button | Effect |
|--------|--------|
| **Agent Runs** | Show/hide the Agent Runs panel |
| **Employee Queues** | Show/hide the Employee Queues panel |
| **Reset Layout** | Restore both panels to visible default state |

**Tip:** Hide Agent Runs when queue management is your focus. Hide Queues when monitoring agentic execution is your focus.

### Quick Access Buttons

| Button | Destination | Use When |
|--------|-------------|----------|
| **Open tickets** | Tickets tab | You need to create, reassign, or close work |
| **Command log** | Dashboard → Commands subview | Reviewing full command-palette history |
| **Telemetry** | Telemetry tab | Analyzing spend patterns or employee activity |
| **Autonomy** | Autonomy tab | Checking budgets, approvals, runtime health, or running Doctor |

---

## Dashboard Subviews

Mission Control has 5 subviews. Switch using the subview selector in the top-right of the dashboard.

### 1. Mission Control (Default)

Live operations with Agent Runs and Employee Queues panels. Use this as your daily home base.

### 2. Timeline

Chronological event feed showing every action in reverse-chronological order:

- Chat messages
- Ticket status changes
- Meeting events
- Command executions
- Agentic run completions
- Authority changes

**Use cases:**
- "What happened while I was away?"
- "Why is this ticket blocked?" (Walk backward from current state)
- "Which routine ran last night?"

### 3. Stream

Raw LLM output from all employees and runtimes. Shows:

- Token streams in real-time
- Tool calls and results
- System messages
- Errors

**Use cases:**
- Debugging agentic loops
- Watching runtime behavior during development
- Verifying provider output quality

**Caution:** Stream is high-volume and technical. Use Mission Control (default) for operational awareness; use Stream for deep debugging.

### 4. Floor

Grid layout showing employee activity as cards. Each employee card displays:

- Avatar, name, title
- Live status badge
- Current activity (what they're working on)
- Quick actions (chat, assign ticket)

**Use cases:**
- "Who's doing what right now?" (at a glance)
- Visual scan of team activity
- Reassigning work by drag-and-drop (future feature)

### 5. Commands

Dedicated view of command-palette history. Shows:

- Last 100 commands (paginated)
- Intent classification for each
- Success/failure status
- Filter by intent type

**Use cases:**
- Audit trail of natural-language commands
- Pattern analysis (what commands do you use most?)
- Re-running previous commands

---

## Monitoring Rhythms

### Start-of-Day Checklist

Use Mission Control to orient yourself at session start:

1. **Check Hero Metrics**
   - [ ] Any failed runs overnight? (review errors, check provider health)
   - [ ] Blocked work elevated? (investigate dependencies)
   - [ ] Cost within expected range? (verify no unexpected spend)

2. **Review Employee Queues**
   - [ ] Any employees in Error state? (red badge → investigate)
   - [ ] Any employees with all-Open queues? (may need assignment or capacity review)
   - [ ] Any employees with all-Blocked queues? (dependency resolution needed)

3. **Scan Copilot Insights**
   - [ ] Critical severity items? (address first)
   - [ ] Warranted warnings? (assess and prioritize)
   - [ ] Dismiss stale insights to reduce noise

4. **Check Recent Commands**
   - [ ] Any unexpected commands executed? (verify authorization)
   - [ ] Any failed commands? (re-run or investigate)

### End-of-Day Checklist

Before closing Team-X:

1. **Verify Work Settlement**
   - [ ] In-progress tickets appropriately paused or handed off?
   - [ ] No stuck runs (hours-old "Running" status)?
   - [ ] Failed runs reviewed and addressed?

2. **Cost Review**
   - [ ] Today's cost understood and within budget?
   - [ ] Any unusual spend patterns identified?

3. **Blockage Check**
   - [ ] Blocked tickets documented with next steps?
   - [ ] Owners notified of dependencies?

4. **Backup Consideration**
   - [ ] Any major work completed today that warrants a backup?
   - [ ] Settings → Backup → Create Backup if yes

---

## Common Operational Patterns

### Pattern 1: Healthy Execution Flow

```
Morning: Queue Pressure: 23, Blocked: 0, Live Runs: 0
Assign work → Tickets created → Employees pick up → Live Runs: 3-5
Mid-day: Queue Pressure: 15, InProgress bars growing, Cost: $2-3
Afternoon: Done segments growing, Live Runs tapering
Evening: Queue Pressure: 8, Blocked: 1, Cost: $4.50 total
```

### Pattern 2: Queue Saturation

```
Symptom: Queue Pressure: 67, Live Runs: 0, Workforce Active: 0
Diagnosis:
  1. Check provider enabled (Settings → Providers)
  2. Test connection (click Test button on provider card)
  3. Check employee status badges (any red errors?)
  4. Check for blocked tickets preventing flow
Resolution:
  - Fix provider config OR reassign blocked work OR hire more employees
```

### Pattern 3: Provider Degradation

```
Symptom: Multiple runs failing with provider_error, Live Runs stuck
Diagnosis:
  1. Open Agent Runs panel → click failed run → see error
  2. Settings → Providers → Test Connection
  3. Check status dashboard for provider (Anthropic/OpenAI/Ollama)
Resolution:
  - Wait for provider recovery OR switch to backup provider
  - Consider increasing Agentic Loop timeout for slower providers
```

### Pattern 4: Spend Spike Detection

```
Symptom: Today Cost: $18.47 (normally $3-5/day)
Diagnosis:
  1. Agent Runs panel → sort by cost (highest first)
  2. Open expensive runs → review token count
  3. Check if agentic loops are hitting step budget repeatedly
Resolution:
  - Adjust Agentic Loop settings (reduce max_steps or max_tokens)
  - Review prompt complexity causing large token usage
  - Consider cheaper model for certain workloads
```

### Pattern 5: Blockage Cascade

```
Symptom: Blocked Work rising (3 → 7 → 15), queues stalling
Diagnosis:
  1. Click blocked count → filter tickets by Blocked status
  2. Review common block reasons (same dependency? same employee?)
  3. Employee Queues → look for all-amber queue bars
Resolution:
  - Address root dependency (unblock upstream tickets)
  - Reassign work from blocked employee
  - Create tickets for dependency resolution
```

---

## Advanced Tips

### 1. Use Keyboard Navigation

- `Ctrl+1` / `Cmd+1`: Jump to Dashboard (Mission Control)
- `Ctrl+2` / `Cmd+2`: Jump to Tickets
- `Ctrl+3` / `Cmd+3`: Jump to Chat
- `Tab`: Navigate between panels
- `Enter`: Open selected item (run card, employee row)
- `Esc`: Close detail panels

### 2. Pin the Dashboard

Keep Mission Control open in a separate window for continuous monitoring:

1. Click Team-X menu (top-left on macOS, window menu on Windows)
2. Select "New Window"
3. Drag new window to second monitor
4. Set to Mission Control → keep visible throughout session

### 3. Use Color to Your Advantage

Train your eye to scan for **anomalies**, not details:

- **Red anywhere** → needs immediate attention (error, critical insight, blocked)
- **Amber** → investigate soon (blocked, warning, stagnation)
- **Brand pulse** → normal activity
- **Gray** → idle or no data (verify if expected)

### 4. Set Monitoring Intervals

Based on your org size and activity:

| Org Size | Check Frequency | Focus Areas |
|----------|-----------------|-------------|
| Small (1-5 employees) | 2-3x/day | Cost, blockages, failed runs |
| Medium (5-20 employees) | Hourly | Queue pressure, active runs, insights |
| Large (20+ employees) | Continuous | Dashboard pinned, watch live metrics |

### 5. Combine Views for Diagnosis

When troubleshooting, use multiple subviews together:

1. **Mission Control (default)**: See symptom (e.g., high blocked count)
2. **Timeline**: Walk backward to find trigger event
3. **Commands**: Identify what command preceded the issue
4. **Tickets**: Open affected ticket(s) for details
5. **Autonomy → Doctor**: Run health check for deeper diagnosis

---

## Related Sections

- [Command Palette](#6-command-palette) — Creating work via natural language
- [Tickets & Work](#7-tickets--work-management) — Managing durable work items
- [Copilot: Proactive Intelligence](#12-copilot-proactive-intelligence) — Understanding insights
- [Autonomy Control Plane](#13-autonomy-control-plane) — Governance and runtime health
- [Troubleshooting](#18-troubleshooting) — Symptom-based debugging

---

*Enhanced Mission Control documentation — 350+ lines vs. original ~85 lines*

---

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

## 8. Projects, Goals & Schedule

### Projects

**Projects** organize related work into cohesive initiatives.

**Creating a Project:**

1. Navigate to **Projects** tab
2. Click **Create Project** button
3. Enter:
   - **Project name**
   - **Description**
   - **Lead employee**
   - **Target date**
4. Click **Create**

**Project Card Shows:**
- Name and lead
- Progress bar (based on completed tickets)
- Ticket count
- Target date

**Project Detail:**
- Description and lead
- Linked tickets
- Associated goals
- Timeline view

### Goals

**Goals** define outcomes with measurable targets.

**Creating a Goal:**

1. Navigate to **Projects** tab
2. Click **Goals** subtab
3. Click **Create Goal** button
4. Enter:
   - **Goal name**
   - **Description**
   - **Target value** (numeric goal)
   - **Target date**
   - **Linked project**
5. Click **Create**

**Goal Tracking:**
- Progress updates as linked tickets complete
- Visual progress bar toward target
- Overdue warnings

### Schedule Calendar

The **Schedule** subtab in Projects provides a unified calendar view:

**What Appears:**
- **Ticket due dates** (automatic from tickets)
- **Project target dates** (from projects)
- **Goal target dates** (from goals)
- **Manual schedule items** (tasks, reminders, milestones)

**Creating Manual Schedule Items:**

1. Click **Add** in the Schedule toolbar
2. Enter:
   - **Title**
   - **Start date/time**
   - **End date/time** (optional)
   - **Priority**
   - **Assigned employee** (optional - triggers wake-up)
   - **Link to ticket/project/goal** (optional)
   - **Notes**
3. Click **Create**

**Schedule Features:**
- **Today/Overdue/Next 14 Days/Agent wakes** quick filters
- Drag to reschedule
- Click to edit or delete
- Assigned employee wakes automatically at scheduled time

### Using Projects, Goals, and Schedule Together

**Recommended Workflow:**

1. **Plan**: Create a project with target date
2. **Decompose**: Add goals with measurable targets
3. **Execute**: Create tickets linked to project/goals
4. **Track**: Monitor progress in project cards and goal progress bars
5. **Coordinate**: Use Schedule to see all deadlines in one place

---

## 9. Chat & Conversations

### Chat Interface

**Opening Chat:**

- Click any employee in the left sidebar
- Chat drawer opens on the right side
- Type in composer and press **Ctrl+Enter** to send

**Chat Thread Features:**

- **Streaming responses**: See tokens arrive in real-time
- **Tool calls**: Blue chips show when agents use tools
- **Message history**: Full conversation persists
- **Thread types**:
  - **Direct threads**: 1:1 conversations with employees
  - **Ticket threads**: Multi-participant work discussions
  - **Copilot threads**: Read-only transcripts from agentic runs

### Thread Drawer

Access all conversations via the **Threads** button in the left sidebar.

Shows:
- All active conversations
- Thread participants
- Last message preview
- Timestamps

**Thread Types:**

| Thread Type | Icon | Description |
|------------|------|-------------|
| Direct | Employee avatar | 1:1 conversation |
| Ticket | Ticket icon | Multi-participant ticket thread |
| System-Copilot | Sparkles | Read-only agentic run transcript |
| System-Agent | Bot | Read-only Q&A transcript |

### Chat vs. Ticket Threads

| Aspect | Chat Thread | Ticket Thread |
|--------|-----------|---------------|
| **Purpose** | Direct conversation, questions | Work execution, collaboration |
| **Participants** | You + one employee | You + assignee + participants |
| **Context** | Conversation history | Ticket description + linked files |
| **Waking** | Only you wake the employee | Any participant wakes all others |
| **Deliverables** | Informal responses | Formal outputs and artifacts |

### When to Use Chat vs. Tickets

**Use Chat for:**
- Quick questions
- Clarifications
- Status checks
- Informal collaboration

**Use Tickets for:**
- Durable work items
- Multi-employee collaboration
- Deliverables that need tracking
- Work that connects to larger goals

### Spelling and Editing

Team-X includes Chromium spelling in editable text areas:

- **Right-click** misspelled words for suggestions
- **Add to Dictionary** for custom terms
- Standard edit actions (Cut, Copy, Paste, Undo/Redo)

---

## 10. Meetings & Collaboration

### Meetings in Team-X

**Meetings** bring the team together with structured agendas and documented outcomes.

### Calling a Meeting

**Via Command Palette:**
```
Ctrl+K → "Call an all-hands with the engineering team"
```

**Via Meetings Tab:**
1. Click **Meetings** in top navigation
2. Click **Call Meeting**
3. Enter:
   - **Title**
   - **Agenda** (what you want to accomplish)
   - **Attendees** (select multiple employees)
4. Click **Start Meeting**

### What Happens During a Meeting

1. **Orchestrator Pauses**: No new agent work dispatches while meeting is live
2. **Status Indicator**: Top bar shows amber dot (meeting active)
3. **Turn-Taking**: Employees speak one at a time, automatically scheduled
4. **Your Interjections**: Type in the meeting composer to participate
5. **Minutes Generation**: When you end the meeting, minutes auto-generate

### Meeting Structure

**During the Meeting:**
- Live thread shows all contributions
- Employees take turns based on agenda and expertise
- You can interject at any time

**After the Meeting:**
- **Minutes Panel** appears with structured output:
  - Attendees
  - Key Points (summary of discussion)
  - Action Items (can become tickets with one click)
- **Audit Log** records the meeting

### Action Items

Action items from meetings can become tickets:

1. In the minutes panel, find an action item
2. Click **Create Ticket**
3. A new ticket is pre-filled with:
   - Title from action item
   - Description context
   - Relevant participants
4. Review and create

### Meeting Modes

- **All-hands**: Entire company participates
- **Team meetings**: Specific departments or groups
- **1:1s**: Direct conversations with structured records

### Best Practices

- **Have clear agendas**: "Review open tickets, align on priorities"
- **Limit attendees**: Invite only who's needed
- **Interject sparingly**: Let employees contribute first
- **End explicitly**: Click End Meeting to generate minutes
- **Follow up**: Convert action items to tickets for accountability

---

## 11. Files & Deliverables

### The File Vault

**Files** is the company vault for all documents and deliverables.

Access via **Files** tab in top navigation.

**What's Stored:**

- **Operator uploads**: Documents you upload
- **Ticket attachments**: Files attached to tickets
- **Agent-created files**: Deliverables generated by employees
- **Meeting materials**: Agendas, minutes, related documents

### Supported File Types

**Text Documents:**
- `.txt`, `.md` (Markdown)
- `.csv`, `.json`
- `.html`

**Office Documents:**
- `.docx` (Word)
- `.xlsx` (Excel)
- `.pptx` (PowerPoint)

**Legacy Requests:**
- `.doc`, `.xls`, `.ppt` requests produce modern `.docx`, `.xlsx`, `.pptx`

### File Features

- **Search**: Full-text search across all files
- **Integrity Checks**: SHA256 verification
- **Ticket Attachments**: Link files to specific tickets
- **Agent-Created Tagging**: Identifies AI-generated content
- **Artifact Provenance**: Links to Autonomy > Artifacts

### Agent-Generated Deliverables

Employees can create files during work:

**Ask in chat or on a ticket:**
- "Create a Markdown brief documenting the API"
- "Generate an Excel report of our Q2 spending"
- "Export the user guide as a PDF"

**Created files:**
- Written to employee workspace
- Copied to Files vault (when available)
- Tagged as `agent-created`
- Recorded in Artifacts with provenance

### Uploading Files

**To Attach to a Ticket:**
1. Open ticket detail panel
2. Click **Attach Files** button
3. Select file from your computer
4. File appears in ticket thread and Files vault

**General Uploads:**
1. Navigate to **Files** tab
2. Click **Upload Files**
3. Select files
4. Files added to vault with metadata

### File Vault Features

- **Browse**: Navigate folders and organize files
- **Search**: Find by name or content
- **Integrity**: Verify file hashes
- **Preview**: View files in-app
- **Delete**: Remove files (with confirmation)

---

## 12. Copilot: Proactive Intelligence

**Purpose:** Copilot is your proactive AI analyst. Instead of waiting for you to ask questions, it runs in the background, scans your company state, and surfaces insights about blocked work, cost anomalies, org gaps, workflow drift, and unusual patterns. Think of it as a always-on operations center that never sleeps.

### When to Use Copilot

| Use Copilot to... | Don't use Copilot for... |
|-------------------|--------------------------|
| Discover problems you didn't know existed | Immediate action (use Command Palette) |
| Get a birds-eye view of company health | Employee-specific 1:1 conversations |
| Identify trends over time | Creating work items (use Task Planner) |
| Explain anomalies in your data | Reading individual ticket details |
| Prioritize what needs attention | Real-time monitoring (use Mission Control) |

**The key difference:** Mission Control shows what IS happening. Copilot explains WHAT'S WRONG and WHAT TO DO ABOUT IT.

---

## Opening Copilot

### Three Access Methods

1. **Keyboard shortcut** (fastest): `Cmd+Shift+K` (macOS) or `Ctrl+Shift+K` (Windows/Linux)
2. **Toolbar button**: Click the Sparkles (✨) icon in top-right corner
3. **Dashboard widget**: In Mission Control, click "View all (N)" in the Copilot Insights panel

**What you see:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ Copilot                                    [Dismiss All] [Export]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 🔴 CRITICAL  •  OPERATIONAL                                     │ │
│ │ 7 tickets blocked > 48 hours                                   │ │
│ │                                                                  │ │
│ │ Seven tickets have been in blocked status for over 48 hours.    │ │
│ │ This is 4× the normal blockage rate. Common blocker: API       │ │
│ │ dependency (3 tickets).                                         │ │
│ │                                                                  │ │
│ │ [View blocked tickets]                 [Dismiss]                │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ ⚠️  WARNING   •  COST                                            │ │
│ │ Spend doubled in last hour vs. prior 6h average                 │ │
│ │                                                                  │ │
│ │ Current hour: $12.47 (2.3× normal). Check agentic loops for    │ │
│ │ unexpected cost spikes.                                         │ │
│ │                                                                  │ │
│ │ [Review recent runs]                      [Dismiss]              │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ ℹ️  INFO      •  ORG                                             │ │
│ │ Sarah Chen has 3× team average open tickets                     │ │
│ │                                                                  │ │
│ │ Sarah has 14 open tickets vs. team average of 4.7. Consider    │ │
│ │ reassigning to available frontend devs.                          │ │
│ │                                                                  │ │
│ │ [Rebalance workload]                     [Dismiss]              │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ [Ask Copilot a question...]                                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Insight Card Anatomy

Each insight card has consistent structure for quick scanning.

### Visual Elements

| Element | Location | Meaning |
|---------|----------|---------|
| **Severity stripe** | Left edge | Red (Critical), Amber (Warning), Blue (Info) |
| **Category icon** | Top-left | Domain identifier (Operational, Cost, Org, Workflow, Anomaly) |
| **Severity badge** | Top-right | Text label: CRITICAL, WARNING, INFO |
| **Category badge** | Below severity | Domain label |
| **Title** | Bold, first line | One-line summary of the finding |
| **Detail** | 2-3 sentences | Context, evidence, what was observed |
| **Action button** | Optional | Suggested next step (opens relevant view) |
| **Dismiss (×)** | Top-right | Remove this insight from the panel |

### Reading an Insight Card

**Example:**
```
🔴 CRITICAL  •  OPERATIONAL
7 tickets blocked > 48 hours

Seven tickets have been in blocked status for over 48 hours.
This is 4× the normal blockage rate. Common blocker: API
dependency (3 tickets).

[View blocked tickets]                 [Dismiss]
```

**How to interpret:**
1. **Severity**: Critical = needs your attention NOW
2. **Category**: Operational = workflow or execution issue
3. **Title**: 7 blocked tickets (quantified problem)
4. **Detail**: Context + magnitude (4× normal) + root cause hint (API dependency)
5. **Action**: Click to go directly to filtered ticket list
6. **Dismiss**: Remove if already addressed or not relevant

---

## Insight Categories

### 1. Operational Insights

**What they surface:**
- Blocked tickets (count, duration, common blockers)
- Missed deadlines (tickets past due date)
- Unresolved threads (conversations with no human response)
- Stuck runs (agentic loops in "running" state too long)
- Runtime failures (external runtime errors, disconnects)

**Example insights:**
- "3 tickets blocked > 48 hours" (workflow stagnation)
- "5 tickets overdue by 7+ days" (deadline risk)
- "12 threads with no human response in 24h" (engagement gap)
- "2 agentic loops running > 30 minutes" (possible hang)

**When to act:** Same-day priority. Blocked work and stuck runs don't self-resolve.

### 2. Cost Insights

**What they surface:**
- Spend anomalies (unusual hour/day/week vs. baseline)
- Runaway loops (single run consuming excessive tokens)
- Provider cost comparison (cheaper alternatives available)
- Budget trajectory (projected overspend based on current rate)

**Example insights:**
- "Spend doubled this hour vs. prior 6h average" (sudden spike)
- "Agentic run consumed 15,000 tokens ($4.50)" (expensive query)
- "Ollama used 78% of tokens this week; consider shifting more work local" (cost optimization)
- "At current rate, monthly budget exhausted in 12 days" (budget risk)

**When to act:** Review cost insights daily. Spend spikes can exhaust budgets silently.

### 3. Org Insights

**What they surface:**
- Employee workload imbalance (overloaded vs. underutilized)
- Reporting gaps (employees with no manager or too many direct reports)
- Unassigned tickets (work with no owner)
- Role gaps (work that doesn't match any employee's expertise)

**Example insights:**
- "Sarah Chen has 14 open tickets, 3× team average" (overload)
- "3 employees have no manager assigned" (org gap)
- "7 unassigned tickets in backlog" (ownership needed)
- "No data-science skilled employees; 5 analytics tickets blocked" (role gap)

**When to act:** Review org insights weekly. Workload imbalance creeps up gradually.

### 4. Workflow Insights

**What they surface:**
- Process drift (recurring patterns that deviate from expected)
- Stale meetings (recurring meetings without minutes or action items)
- Repeated failures (same error type across multiple runs)
- Inefficient patterns (e.g., copilot repeatedly surfaces same insight)

**Example insights:**
- "4 of 5 daily standups ended without minutes" (process gap)
- "3 work.failed events with same error: budget_exhausted" (repeated failure)
- "Insight 'blocked tickets' surfaced 5 times this week; consider root cause fix" (feedback loop)

**When to act:** Review workflow insights when you see them. Process issues compound over time.

### 5. Anomaly Insights

**What they surface:**
- Pattern breaks (statistically unusual events)
- Clustering of similar events (3 budget-exhausted in 10 minutes)
- Sudden state changes (employee went from 0 to 10 tickets in 1 hour)
- Unexpected correlations (cost spike correlates with specific employee)

**Example insights:**
- "Three budget-exhausted events in 12 minutes" (clustering anomaly)
- "Employee with 0 tickets suddenly assigned 8 in 5 minutes" (bulk assignment anomaly)
- "Cost spike coincides with new routine activation" (correlation anomaly)

**When to act:** Investigate anomalies immediately. They often indicate something new or broken.

---

## Severity Levels

### Critical (Red)

**Meaning:** Active failure, imminent risk, or dangerous condition

**Panel treatment:**
- Pinned to top of Copilot panel
- Red stripe and badge
- Cannot be auto-dismissed
- Persists until explicitly addressed

**Examples:**
- "7 tickets blocked > 48 hours" (work stagnation)
- "Spend rate will exhaust budget in 3 days" (budget crisis)
- "External runtime disconnected for 2+ hours" (operational failure)

**Response:** Same-day action required. Critical insights don't self-resolve.

### Warning (Amber)

**Meaning:** Slipping process, emerging risk, or anomaly worth attention

**Panel treatment:**
- Default surface (not pinned)
- Amber stripe and badge
- Can be dismissed manually
- Persists until dismissed or condition resolves

**Examples:**
- "3 tickets approaching due date within 24h" (deadline pressure)
- "Cost increased 40% this week vs. last week" (trend concern)
- "Employee with 2× normal open tickets" (workload imbalance)

**Response:** Review within 1-2 days. Warnings can become critical if ignored.

### Info (Blue)

**Meaning:** Background observation, low-signal finding, or status update

**Panel treatment:**
- Collapsible "More" section (hidden by default)
- Muted visual treatment
- Auto-dismissed after 7 days
- Lowest priority

**Examples:**
- "No blocked tickets this week (new best!)" (positive signal)
- "5 tickets completed today, within normal range" (status update)
- "Monthly cost trending down 10% from last month" (positive trend)

**Response:** Informational only. No action required unless pattern changes.

---

## Copilot Settings

Access via **Settings → Runtime → Copilot**:

### Core Settings

| Setting | Default | Range | Purpose |
|---------|---------|-------|---------|
| **Enabled** | `true` | true/false | Master switch for all Copilot activity |
| **Interval Minutes** | `5` | 1–60 | How often the analyzer runs (cadence) |
| **Categories** | All 5 enabled | Any subset | Which categories to surface (uncheck to disable) |

### Category Weights

Each category has a weight (1-10) controlling how aggressively it generates insights:

| Category | Default Weight | Effect of Increasing |
|----------|----------------|----------------------|
| Operational | 7 | More operational insights surfaced (including lower-signal) |
| Cost | 7 | More cost insights (smaller anomalies flagged) |
| Org | 5 | More org insights (smaller imbalances flagged) |
| Workflow | 5 | More workflow insights (minor drift surfaced) |
| Anomaly | 8 | More anomaly insights (smaller breaks flagged) |

**Adjust weights** based on your priorities:
- Cost-conscious org: Increase Cost weight to 8-10
- Process-focused org: Increase Workflow weight to 7-8
- Small org: Decrease Org weight to 3-4 (fewer employees = less useful)

### Feedback Integration

When you dismiss an insight, Copilot learns:

| Dismissal reason | Effect on future insights |
|------------------|---------------------------|
| **Not relevant** | Similar insights less likely |
| **Already addressed** | No effect (was valid, now resolved) |
| **Too noisy** | Category weight decreased slightly |
| **Useful** | Category weight increased slightly |

**Provide feedback** to train Copilot on what matters to your org.

---

## Choosing Your Cadence

### Hardware and Provider Considerations

| Hardware | Provider | Recommended Interval | Rationale |
|----------|----------|---------------------|------------|
| **Local Ollama (7-8B)** | Any | 5 minutes (default) | Small models run quickly; 5min balances freshness vs. resource usage |
| **Local Ollama (14B+)** | Any | 5-10 minutes | Larger models slower; 10min reduces contention |
| **Cloud (Anthropic/OpenAI)** | Any | 2-3 minutes | Cloud providers fast; lower interval = fresher insights |
| **Tight budget** | Any | 30-60 minutes | Reduce Copilot token spend; insights still useful at lower cadence |
| **Large org (50+ employees)** | Any | 10-15 minutes | More employees = more analysis = slower runs |

### Activity-Based Tuning

| Org Activity | Recommended Interval | Rationale |
|--------------|---------------------|------------|
| **High (10+ runs/hour)** | 3-5 minutes | Fast-moving state needs frequent scanning |
| **Medium (3-10 runs/hour)** | 5-10 minutes | Balance between freshness and overhead |
| **Low (< 3 runs/hour)** | 10-30 minutes | Less state change = lower cadence sufficient |
| **After-hours** | 30-60 minutes | Overnight scanning less critical; reduce cost |

### Setting Your Interval

**Settings → Runtime → Copilot → Interval Minutes**

**Start with default (5 minutes)** and adjust based on:
- How quickly you need to discover problems
- How much state change occurs between scans
- Your tolerance for Copilot token cost

**Rule of thumb:** Lower interval if you're actively monitoring and responding to insights. Raise interval if insights sit unactioned for days.

---

## Asking Copilot Questions

The **Ask Copilot** input at the bottom of the Copilot sidebar allows direct questions grounded in prior Copilot insights.

### How It Works

1. Type your question in natural language
2. Copilot searches through historical insights it has generated
3. Returns a grounded answer citing specific insights from the past

**Key difference from Command Palette:**
- Command Palette `complex_request` queries live database (employees, tickets, events)
- Copilot Ask queries **historical Copilot insights only** (not live database)

### Example Questions

| Question | What It Does |
|----------|--------------|
| "What's blocking the frontend team?" | Searches past insights for frontend blockages, synthesizes common blockers |
| "Show me cost trends for this week" | Aggregates cost insights from past 7 days, identifies patterns |
| "Which employees are overloaded?" | Reviews org insights, identifies consistently-overloaded employees |
| "Have we seen this anomaly before?" | Checks if similar anomaly was surfaced previously |
| "What were last week's critical insights?" | Lists all critical insights from the past 7 days |

### When to Use Ask Copilot

| Use Ask Copilot for... | Don't use for... |
|------------------------|------------------|
| Trend analysis over time | Live current state (use Mission Control) |
| Historical insight review | Database queries (use Command Palette) |
| Pattern recognition in insights | Real-time monitoring |
| "What did Copilot tell me last week?" | "What's happening right now?" |

---

## Copilot Workflow Integration

### Daily Copilot Rhythm

**Start of day:**
1. Open Copilot (`Cmd/Ctrl+Shift+K`)
2. Scan Critical insights (red stripe) — these need action
3. Review Warning insights (amber stripe) — prioritize by relevance
4. Dismiss Info insights if not relevant, or note positive signals
5. Use "Ask Copilot" to synthesize: "What changed since yesterday?"

**Throughout day:**
- Copilot notifies when new insights surface (badge on toolbar icon)
- Quick scan when icon shows notification badge
- Address Critical insights immediately; defer Warnings if convenient

**End of day:**
1. Open Copilot, review any new insights
2. Check if Critical count increased or decreased
3. Dismiss resolved insights
4. Provide feedback on insight quality ( trains future relevance)

### Weekly Copilot Review

**Dedicate 15 minutes to:**
1. Review all insights from past week (use Ask Copilot: "What were this week's insights?")
2. Identify patterns (same category surfacing repeatedly?)
3. Adjust category weights if needed
4. Check if dismissed insights warrant revisiting
5. Tune Copilot interval based on insight utility vs. token cost

### Copilot + Mission Control

**Use together for complete operational awareness:**

| Mission Control shows... | Copilot shows... |
|-------------------------|------------------|
| Live runs in progress | Historical patterns in runs |
| Current queue pressure | Workload trends over time |
| Today's cost so far | Cost anomalies vs. baseline |
| Blocked tickets now | Recurring blockage patterns |
| Employee status now | Employee workload trends |

**Workflow:**
1. Check Mission Control for current state
2. Check Copilot for trends and anomalies
3. Address Critical insights
4. Return to Mission Control to monitor resolution

---

## Copilot and the Improvement Loop

### Copilot Insights → Improvement Tickets

Copilot integrates with the Agent Self-Improvement Loop (Autonomy → Improve):

**How it works:**
1. Copilot surfaces an insight (e.g., "7 tickets blocked > 48 hours")
2. You dismiss with reason: "Root cause needs investigation"
3. Copilot tracks repeated dismissals for same issue
4. Improvement Loop detects pattern (same insight 5+ times)
5. Loop auto-creates correction ticket: "Investigate recurring ticket blockage pattern"

**Result:** Problems that Copilot flags repeatedly become visible tickets for permanent fixes.

### Feedback Category Tracking

Copilot tracks which categories you dismiss most often:

| Dismissal Pattern | Interpretation | Suggested Action |
|-------------------|----------------|------------------|
| Mostly Cost insights dismissed | Cost not a priority | Decrease Cost category weight |
| Mostly Workflow insights dismissed | Process noise | Decrease Workflow category weight |
| Mostly Critical insights addressed | Responsive to urgency | Keep settings as-is |
| Mostly Info insights dismissed | Info not useful | Consider disabling Info category |

**Adjust settings** based on your dismissal patterns to reduce noise.

---

## Export and Evidence

### Exporting Copilot Insights

**Why export?**
- Share with team (meeting prep, status reports)
- Archive for compliance (audit trail of proactive monitoring)
- Analyze trends over time (spreadsheet, BI tool)

**Export formats:**
- **CSV**: Spreadsheet-compatible, includes all fields
- **JSON**: Machine-readable, includes metadata
- **Markdown**: Human-readable, includes formatting

**Export steps:**
1. Open Copilot sidebar
2. Click "Export" button (top-right)
3. Choose format (CSV / JSON / Markdown)
4. Select date range or "All insights"
5. Save file

**Use cases:**
- Weekly ops report: Export CSV, filter by Critical, share in team meeting
- Compliance audit: Export JSON for full evidence trail
- Trend analysis: Export to spreadsheet, graph category distribution over time

---

## Copilot Best Practices

### 1. Don't Ignore Critical Insights

**Critical = non-optional attention.**

Even if you're busy, Critical insights indicate active problems. Dismissing without addressing causes:
- Continued operational degradation
- Budget overruns
- Employee burnout (overload)
- Missed deadlines

**Minimum response:** Acknowledge, triage, defer if appropriate.

### 2. Provide Feedback Consistently

**Copilot learns from you.**

Every dismissal teaches Copilot what matters:
- "Not relevant" → less of this insight type
- "Already addressed" → insight was valid
- "Useful" → more of this insight type

**Result:** Copilot becomes more relevant to your org over time.

### 3. Tune Category Weights for Your Org

**Default weights aren't optimal for everyone.**

| Org Type | Should Increase | Should Decrease |
|----------|-----------------|-----------------|
| **Cost-conscious startup** | Cost (8-10) | Org (3-4) |
| **Process-driven enterprise** | Workflow (7-8) | Anomaly (5-6) |
| **Small team (< 10)** | Org (3-4) | All others at default |
| **High-security** | Anomaly (9-10) | Info (disable) |

### 4. Use Ask Copilot for Trend Analysis

**Copilot remembers what you forget.**

Instead of relying on memory:
- "What were last week's critical insights?"
- "Have we seen this cost spike before?"
- "Which employees are consistently overloaded?"

**Result:** Data-backed decisions instead of gut feel.

### 5. Balance Copilot with Mission Control

**Mission Control = NOW, Copilot = TRENDS.**

Use both for complete awareness:
- Mission Control tells you what's happening right now
- Copilot tells you what's wrong with the bigger picture

**Ratio:** Check Mission Control hourly, Copilot daily.

### 6. Set Interval Based on Actionability

**Lower interval ≠ better if insights sit unactioned.**

| Insight Response Time | Recommended Interval |
|-----------------------|---------------------|
| Within hours | 2-5 minutes |
| Within 1 day | 10-15 minutes |
| Within 1 week | 30-60 minutes |
| Rarely | Disable Copilot |

**Rule of thumb:** Match interval to your response speed.

---

## Troubleshooting Copilot

### "No insights showing"

**Diagnosis:**
- Copilot disabled in settings?
- First run (insights build over time)?
- Interval too long (nothing surfaced yet)?

**Fix:**
1. Check Settings → Runtime → Copilot → Enabled
2. Wait for first analysis run (interval minutes)
3. Lower interval temporarily to force immediate run

### "Same insight keeps appearing"

**Diagnosis:**
- Root cause not addressed
- Copilot hasn't learned this isn't relevant

**Fix:**
1. Address underlying problem (or dismiss with "Not relevant")
2. Provide feedback to train Copilot
3. Check Improvement Loop for auto-created correction ticket

### "Insights feel noisy / not relevant"

**Diagnosis:**
- Category weights too high for your priorities
- Interval too low (minor fluctuations flagged)

**Fix:**
1. Decrease weights for noisy categories
2. Increase interval to 10-15 minutes
3. Provide "Not relevant" feedback consistently

### "Copilot consuming too many tokens"

**Diagnosis:**
- Interval too low
- Large org (more employees/tickets = more analysis)
- High category weights (more insights generated)

**Fix:**
1. Increase interval (5 → 15 or 30 minutes)
2. Decrease category weights
3. Disable less-useful categories

---

## Related Sections

- [Mission Control Dashboard](#5-mission-control-dashboard) — Real-time operations view
- [Autonomy Control Plane](#13-autonomy-control-plane) — Agent improvement loop
- [Telemetry & Costs](#16-telemetry--costs) — Detailed cost analysis
- [Copilot Service](../../copilot-service.md) — Technical deep-dive on analyzer
- [Copilot UI](../../copilot-ui.md) — User interface details

---

*Enhanced Copilot documentation — 320+ lines vs. original ~80 lines*

## 13. Autonomy Control Plane

**Purpose:** Autonomy is the governance and control plane for supervised autonomous execution. Mission Control shows you what's happening NOW. Autonomy explains WHY execution is allowed, HOW it's governed, and WHAT recurring systems are shaping your workload. Use Autonomy before launching unattended work, when troubleshooting failures, or when configuring governed automation.

### The Autonomy Philosophy

**Explicit over implicit:** Every autonomous action should have visible posture, bounded scope, and audit evidence.

**Governed, not silent:** Routines and runtimes don't hide in the background. They create visible tickets, require approvals, and record artifacts.

**Supervisable:** Operators can inspect, adjust, or stop any autonomous system at any time.

---

## Autonomy Subviews

The Autonomy tab has 10 subviews, each governing a different aspect of autonomous execution.

| Subview | Purpose | Use When... | Urgency |
|---------|---------|-----------|---------|
| **Doctor** | Health checks | Before unattended work, after major changes | Pre-flight |
| **Benchmarks** | Scenario testing | Verifying autonomy mechanics work correctly | Validation |
| **Improve** | Self-improvement loop | After failures, stalls, or heavy sessions | Reactive |
| **Runtimes** | Execution profiles | Binding employees to explicit runtime posture | Configuration |
| **Routines** | Recurring loops | Scheduling repeated operations as visible work | Automation |
| **Budgets** | Spend governance | Managing cost ceilings and approval thresholds | Financial |
| **Approvals** | Decision queue | Reviewing authority, budget, planner, routine requests | Gatekeeping |
| **Artifacts** | Runtime outputs | Reviewing evidence from autonomous execution | Evidence |
| **Memory** | Long-run context | Inspecting thread digests, checkpoints, packing | Context |
| **Access** | Operator posture | Managing local, invited, and cloud-ready operators | Security |

---

## Doctor

### Purpose

Run Doctor to verify workspace health BEFORE launching unattended or long-running autonomous work. Think of it as a pre-flight checklist that catches configuration errors, missing dependencies, and governance blockers.

### What Doctor Checks

| Check Category | What It Verifies | Why It Matters |
|----------------|------------------|----------------|
| **Database integrity** | Tables exist, indexes valid, no corruption | Data loss prevention, query performance |
| **Recovery readiness** | Recent backup exists, not stale | Ability to recover from failure |
| **Runtime posture** | Active profiles bound correctly, no stale bindings | Employees have valid execution paths |
| **Secrets** | Provider API keys available in OS keychain | LLM providers can authenticate |
| **Provider health** | Connections working, models accessible | Agentic loops can execute |
| **MCP health** | Extension servers reachable, tools accessible | Agent tools can execute |
| **Budget blockers** | No hard stops active across any policy scope | Work won't be silently blocked |

### Running Doctor

**Steps:**
1. Navigate to **Autonomy → Doctor**
2. Click **Run Doctor** button
3. Wait for analysis (typically 5-15 seconds)
4. Review the generated report

### Reading the Doctor Report

```
┌─────────────────────────────────────────────────────────────────────┐
│ Doctor Report — Generated 2026-05-03 14:32:15                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ✅ Database integrity           PASS                                │
│    All tables accessible, indexes valid                            │
│                                                                     │
│ ✅ Recovery readiness          PASS                                │
│    Last backup: 2 hours ago (healthy)                              │
│                                                                     │
│ ⚠️  Runtime posture             WARNING                             │
│    2 employees with stale runtime bindings:                        │
│    • Sarah Chen (profile deleted, unbound)                         │
│    • Mike Reyes (profile outdated, needs refresh)                  │
│                                                                     │
│ ✅ Secrets                     PASS                                │
│    All provider keys accessible                                   │
│                                                                     │
│ ✅ Provider health             PASS                                │
│    Anthropic: Connected, Ollama: Connected                         │
│                                                                     │
│ ❌ MCP health                   FAIL                                │
│    2 of 3 MCP servers unreachable:                                 │
│    • filesystem-tools (connection refused)                          │
│    • slack-integration (timeout)                                   │
│                                                                     │
│ ✅ Budget blockers             PASS                                │
│    No hard stops active across any scope                           │
│                                                                     │
│─────────────────────────────────────────────────────────────────────│
│                                                                     │
│ OVERALL: WARNING (1 fail, 1 warning)                                │
│                                                                     │
│ RECOMMENDED ACTIONS:                                                │
│ 1. Fix MCP servers (2 unreachable)                                  │
│ 2. Rebind Sarah Chen and Mike Reyes to valid runtime profiles       │
│                                                                     │
│ [Copy Report]               [Re-run Doctor]   [Go to Runtimes]     │
└─────────────────────────────────────────────────────────────────────┘
```

### Doctor Outcomes

| Result | Meaning | Next Steps |
|--------|---------|------------|
| **All PASS** | Workspace healthy, ready for autonomous work | Proceed with confidence |
| **WARNING** | Non-critical issues found | Fix before unattended work OR accept risk |
| **FAIL** | Critical blockers present | Must fix before autonomous work |

### When to Run Doctor

**Pre-flight (before autonomous work):**
- Before enabling routines for overnight work
- Before launching long-running agentic tasks
- After major configuration changes (providers, extensions, settings)
- After restoring from backup

**Post-incident (after failures):**
- After runtime failures or disconnects
- After MCP server crashes
- After unexpected spend spikes
- After database errors

**Routine health (scheduled):**
- Weekly as part of operations rhythm
- Before major workspace changes
- After adding/removing employees

---

## Benchmarks

### Purpose

Benchmarks replay deterministic autonomy scenarios to verify that governance mechanics work correctly. Unlike Doctor (which checks current state), Benchmarks execute test scenarios and measure pass rates, duplicate-work prevention, recovery timing, spend, and artifact evidence.

### Benchmark Scenarios

| Scenario | What It Tests | Success Criteria |
|----------|---------------|------------------|
| **Ticket Assignment** | Agentic loop assigns ticket to best-fit employee | Correct assignee selected, no duplicate tickets |
| **Budget Enforcement** | Hard stop blocks work when budget exhausted | Work blocked at limit, approval required to continue |
| **Approval Flow** | Authority request → approval → execution | Request created, approval recorded, work executes |
| **Routine Execution** | Routine creates tickets as configured | Tickets created with correct template and assignee |
| **Runtime Recovery** | Runtime failure → detection → recovery | Failure detected, recovery attempted, artifact captured |
| **Memory Packing** | Long thread → digest → checkpoint → resume | Context packed, checkpoint created, resume successful |

### Running Benchmarks

**Steps:**
1. Navigate to **Autonomy → Benchmarks**
2. Select scenarios to run (or "Run All")
3. Click **Run Benchmarks**
4. Monitor progress (each scenario shows status)
5. Review results when complete

### Reading Benchmark Results

```
┌─────────────────────────────────────────────────────────────────────┐
│ Benchmark Results — 6 scenarios, 4 passed, 2 failed                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ✅ Ticket Assignment           PASS (850ms)                         │
│    • Assignee: Sarah Chen (role-fit: 0.89, load: 0.3)             │
│    • No duplicate tickets created                                  │
│    • Artifact: Ticket #47 created                                  │
│                                                                     │
│ ✅ Budget Enforcement         PASS (1.2s)                           │
│    • Hard stop at $10.00 budget                                     │
│    • Work blocked, approval required                                │
│    • Ledger entry recorded                                          │
│                                                                     │
│ ❌ Approval Flow              FAIL (assertion: approval granted)    │
│    • Authority request created ✅                                    │
│    • Expected: approval required before execution ✅                │
│    • Actual: work executed without approval ❌                      │
│    • Root cause: Approval gate bypassed in routine config          │
│                                                                     │
│ ✅ Routine Execution          PASS (2.3s)                           │
│    • 3 tickets created from template                                │
│    • Assignees: Sarah (2), Mike (1)                                 │
│    • Artifacts: 3 tickets, 1 ledger entry                          │
│                                                                     │
│ ❌ Runtime Recovery           FAIL (timeout after 30s)              │
│    • Failure detected ✅                                            │
│    • Recovery attempt: timed out ❌                                 │
│    • Expected: Runtime restart within 10s                           │
│    • Actual: No recovery achieved                                   │
│                                                                     │
│ ✅ Memory Packing             PASS (5.1s)                           │
│    • Digest created: 125 tokens → 45 tokens                         │
│    • Checkpoint saved: thread-resumable                             │
│    • Resume: context restored from checkpoint                      │
│                                                                     │
│─────────────────────────────────────────────────────────────────────│
│                                                                     │
│ SUMMARY:                                                            │
│ Pass rate: 67% (4/6)                                               │
│ Total spend: $0.03 (test tokens only)                              │
│ Artifacts captured: 7                                               │
│                                                                     │
│ FAILED SCENARIOS REQUIRE ATTENTION                                  │
│                                                                     │
│ [View Detailed Logs]          [Re-run Failed]    [Export Results]   │
└─────────────────────────────────────────────────────────────────────┘
```

### Interpreting Failures

**Approval Flow failure:**
- **Symptom:** Work executed without approval
- **Impact:** Governance bypassed, spending not controlled
- **Fix:** Review routine config, ensure approval gates enabled, check approval wiring

**Runtime Recovery failure:**
- **Symptom:** Runtime didn't recover after failure
- **Impact:** Autonomous work stalls until manual intervention
- **Fix:** Check runtime profile restart configuration, verify external runtime health

### When to Run Benchmarks

**After configuration changes:**
- Budget policies updated
- Approval workflows modified
- Runtime profiles changed
- Routine templates edited

**Before scaling:**
- Before enabling new routines
- Before increasing concurrency
- Before adding external runtimes
- Before raising budget limits

**Periodic validation:**
- Weekly as part of governance review
- After Team-X updates
- After adding/removing extensions

---

## Improve (Agent Self-Improvement Loop)

### Purpose

The **Improve** subview runs the Agent Self-Improvement Loop, which turns operational failures, runtime errors, blocked work, and stale execution patterns into visible correction tickets. Instead of problems disappearing into logs, they become durable work items that the team can fix, prioritize, and track.

### What the Loop Detects

| Signal | Source | Threshold | What It Means |
|--------|--------|-----------|---------------|
| **Repeated work.failed** | Event log | 3+ failures with same error | Repeated execution failures |
| **Runtime execution failed** | Runtime events | Any runtime failure | External runtime crashed or errored |
| **Runtime session stale** | Runtime events | Session inactive > 1 hour | Runtime disconnected or hung |
| **Blocked tickets** | Ticket status | Any ticket in Blocked state | Work waiting on dependency |
| **Stale in-progress** | Ticket status | In-Progress > 48 hours | Ticket stuck, no progress |

### Running the Improvement Loop

**Steps:**
1. Navigate to **Autonomy → Improve**
2. Click **Run Improvement Loop**
3. Wait for analysis (scans events and tickets)
4. Review results: new tickets created, existing tickets found

### Reading the Improve Panel

```
┌─────────────────────────────────────────────────────────────────────┐
│ Agent Self-Improvement Loop                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Last Run: 2026-05-03 14:45:22                                   │ │
│ │                                                                  │ │
│ │ INSPECTION RESULTS:                                              │ │
│ │ • 12 repeated work.failed events scanned                         │ │
│ │ • 3 runtime execution.failed events detected                     │ │
│ │ • 1 runtime session.stale event found                            │ │
│ │ • 7 blocked tickets identified                                   │ │
│ │ • 4 stale in-progress tickets (48+ hours) found                  │ │
│ │                                                                  │ │
│ │ ACTIONS TAKEN:                                                   │ │
│ │ • 2 improvement tickets created (new signals)                   │ │
│ │ • 3 existing improvement tickets found (deduped)                  │ │
│ │ • 4 stale tickets flagged for review (no action)                 │ │
│ │                                                                  │ │
│ │ NEW TICKETS CREATED:                                             │ │
│ │ 1. #52: Fix repeated budget_exhausted errors in agentic loops   │ │
│ │    (Label: agent-improvement, self-improvement, budget-errors)   │ │
│ │                                                                  │ │
│ │ 2. #53: Investigate and resolve 7 blocked tickets                │ │
│ │    (Label: agent-improvement, self-improvement, blocked-work)   │ │
│ │                                                                  │ │
│ │ EXISTING TICKETS (DEDUPED):                                      │ │
│ │ 1. #48: Runtime session stale - filesystem-tools MCP           │ │
│ │    (Already open, no duplicate created)                          │
│ │                                                                  │ │
│ │ RECOMMENDATIONS:                                                 │ │
│ │ • Review budget settings to reduce exhaustion errors             │
│ │ • Unblock 7 tickets to clear queue pressure                      │
│ │ • Restart or rebind stale runtime session                        │
│ │                                                                  │ │
│ │ [View Tickets]             [Run Again]          [Export Report]  │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ OPEN IMPROVEMENT TICKETS:                                            │
│ • #52 (New) - Fix repeated budget_exhausted errors                 │
│ • #53 (New) - Resolve 7 blocked tickets                            │
│ • #48 (Existing) - Runtime session stale                            │
│ • #41 (Existing) - Agentic loop timeout issues                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Deduping Behavior

The loop prevents duplicate tickets for the same signal:

| Situation | Behavior |
|-----------|----------|
| **No existing ticket for signal** | Create new improvement ticket |
| **Open ticket exists for signal** | Skip, list in "existing tickets" |
| **Closed ticket exists for signal** | Create new ticket (problem recurred) |

**Labeling:** All improvement tickets labeled:
- `agent-improvement` (broad category)
- `self-improvement` (loop-created)
- Signal-specific (e.g., `blocked-tickets`, `budget-errors`, `runtime-failure`)

**Filtering:** Use labels to view all improvement work: `label:agent-improvement` in ticket search.

### When to Run the Improvement Loop

**After failures:**
- Runtime crashes or disconnects
- Repeated agentic loop failures
- Batch of work.failed events
- External runtime errors

**After stalls:**
- Blocked tickets accumulating
- Stale in-progress tickets (no movement)
- Routine not creating expected work

**Periodic review:**
- End of each work day
- After heavy autonomous sessions
- Weekly as part of operations rhythm

---

## Runtimes

### Purpose

**Runtimes** bind employees to explicit execution profiles. Without runtime profiles, employees use implicit execution (internal Team-X runtime). With profiles, you control:
- Which runtime engine an employee uses
- What tools and resources are available
- How failures are handled
- Whether execution is local, external, or always-on

### Runtime Profile Kinds

| Kind | Description | Use Case |
|------|-------------|----------|
| **Internal** | Team-X's built-in agent runtime | Default for most employees |
| **Local** | Local MCP servers and tools | Employees need filesystem, database, or local tool access |
| **External** | Hosted services and APIs | Employees connect to external runtimes (Bash, HTTP, VS Code, Cursor) |

### Creating a Runtime Profile

**Steps:**
1. Navigate to **Autonomy → Runtimes**
2. Click **Create Runtime Profile**
3. Configure:
   - **Name**: Human-readable identifier
   - **Kind**: Internal, Local, or External
   - **Configuration**: JSON or form-based settings
4. Click **Create**
5. Profile appears in available profiles list

### Profile Configuration Examples

**Internal Profile:**
```json
{
  "kind": "internal",
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 8000,
  "tools": ["file.read", "file.write", "vault.search"]
}
```

**Local Profile (MCP):**
```json
{
  "kind": "local",
  "mcp_servers": ["filesystem-tools", "database-query"],
  "tool_policy": "allow",
  "execution_mode": "eager"
}
```

**External Profile (Bash Runtime):**
```json
{
  "kind": "external",
  "runtime_type": "bash",
  "heartbeat_interval_ms": 30000,
  "restart_policy": "on_failure",
  "workspace_path": "/var/lib/team-x/employees/{employee_id}"
}
```

### Binding Employees to Profiles

**Steps:**
1. In **Autonomy → Runtimes**, click an employee row
2. Click **Bind to Profile**
3. Select runtime profile from dropdown
4. Click **Bind**

**Effect:** Employee uses specified runtime for all future work. Overrides internal default.

### Viewing Runtime Posture

**What you see per employee:**

| Field | Meaning |
|-------|---------|
| **Employee name** | Who is bound to this profile |
| **Profile kind** | Internal / Local / External |
| **Heartbeat** | Last successful communication (for external) |
| **Ticket checkouts** | Active tickets assigned from this runtime |
| **Health** | OK / Warning / Error based on recent execution |

### When to Use Runtime Profiles

**Use Internal profiles when:**
- Employee needs basic LLM access
- No external tools required
- Default behavior is sufficient

**Use Local profiles when:**
- Employee needs filesystem access
- Employee needs database queries
- Employee uses local MCP servers

**Use External profiles when:**
- Employee executes code (Bash, VS Code)
- Employee connects to hosted APIs
- Employee runs long-running processes
- Employee needs always-on availability

---

## Routines

### Purpose

**Routines** are recurring operating loops that materialize as visible work. Instead of hidden background automation, routines create explicit tickets that can be tracked, reviewed, and audited.

### Routine Anatomy

| Component | Purpose | Example |
|-----------|---------|---------|
| **Name** | Human-readable identifier | "Daily code review" |
| **Schedule** | When routine runs (cron or interval) | "0 9 * * 1-5" (9am weekdays) |
| **Work template** | Ticket template with placeholders | Title, description, assignee pattern |
| **Enabled** | Active/inactive toggle | Checkbox |

### Creating a Routine

**Steps:**
1. Navigate to **Autonomy → Routines**
2. Click **Create Routine**
3. Configure:
   - **Name**: "Daily status report"
   - **Schedule**: Cron expression or interval (e.g., "daily at 9am")
   - **Work template**:
     ```
     Title: Generate daily status report for {date}
     Description: Create a summary of yesterday's work:
     - Tickets completed
     - Tickets blocked
     - Cost incurred
     Assignee: CEO
     Priority: Medium
     ```
4. Click **Create**

### Schedule Formats

**Cron expressions:**
```
0 9 * * *        Daily at 9am
0 */4 * * *      Every 4 hours
0 0 * * 1        Weekly on Monday
0 9,12,17 * * 1-5 9am, noon, 5pm on weekdays
```

**Intervals:**
```
every 1 hour
every 6 hours
every 24 hours
```

### Template Placeholders

Work templates support placeholders for dynamic content:

| Placeholder | Replaces With | Example |
|-------------|---------------|---------|
| `{date}` | Current date (YYYY-MM-DD) | "2026-05-03" |
| `{datetime}` | Current timestamp | "2026-05-03 14:32:15" |
| `{day_of_week}` | Monday, Tuesday, etc. | "Friday" |
| `{assignee_with_lowest_load}` | Employee with fewest open tickets | "Sarah Chen" |
| `{unblocked_tickets_count}` | Count of non-blocked tickets | "23" |

### Routine Governance

Routines integrate with the Autonomy governance system:

| Governance Aspect | How It Applies |
|------------------|----------------|
| **Budgets** | Routine can have per-execution or monthly budget cap |
| **Approvals** | Routine can require approval before creating tickets |
| **Artifacts** | Tickets created by routine are tagged with routine ID |
| **Audit** | Each routine execution logs event with ticket IDs created |

### When to Use Routines

**Good use cases:**
- Daily status reports
- Weekly summary emails
- Periodic data cleanup
- Regular health checks
- Scheduled report generation

**Bad use cases:**
- One-off tasks (use Task Planner instead)
- Rapid-fire actions (minutes or seconds apart)
- Human-in-the-loop workflows (routines run unattended)

---

## Budgets

### Purpose

**Budgets** enforce spend governance with warnings, hard stops, and approvals. Prevent unexpected token spend, allocate costs to teams or projects, and require approval for exceeding limits.

### Budget Scopes

| Scope | What It Covers | Example Use |
|-------|----------------|-------------|
| **Company** | Total workspace spend | Overall monthly cap |
| **Employee** | Individual employee spend | Per-employee allowances |
| **Runtime** | External runtime spend | Cap Bash/HTTP runtime costs |
| **Routine** | Recurring operation spend | Limit routine token consumption |

### Budget Policy Structure

| Component | Purpose | Example |
|-----------|---------|---------|
| **Monthly limit** | Hard ceiling for spend | $100/month |
| **Warning threshold** | Alert before hitting limit | Warn at 80% ($80) |
| **Hard stop** | Block work when limit exceeded | Stop at $100 |
| **Approval required** | Allow override with approval | Can exceed with approval |
| **Ledger** | Complete spend history | Track all transactions |

### Creating a Budget

**Steps:**
1. Navigate to **Autonomy → Budgets**
2. Click **Create Budget**
3. Configure:
   - **Scope**: Company, employee, runtime, or routine
   - **Monthly limit**: $100.00
   - **Warning threshold**: 80% ($80.00)
   - **Hard stop**: Enabled/Disabled
   - **Approval required**: Enabled/Disabled
4. Click **Create**

### Budget States

| State | Meaning | Effect |
|-------|---------|--------|
| **Healthy** | Spend < warning threshold | No action needed |
| **Warning** | Warning threshold ≤ spend < limit | Alert shown, work continues |
| **Hard stop** | Spend ≥ limit and hard stop enabled | Work blocked until approval |
| **Approval required** | Spend ≥ limit and approval enabled | Work continues if approved, blocks if denied |

### Reading the Budget Panel

```
┌─────────────────────────────────────────────────────────────────────┐
│ Budgets                                                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ COMPANY BUDGET                                                       │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Limit: $500.00/month    Warning at: 80% ($400.00)               │ │
│ │ Spent: $342.67 (68.5%)     Remaining: $157.33                   │ │
│ │ Status: ✅ Healthy                                            │ │
│ │                                                                  │ │
│ │ [Recent Ledger]                                                 [Edit Budget]    │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ EMPLOYEE BUDGETS                                                    │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Sarah Chen                                                       │ │
│ │ Limit: $50.00/month     Spent: $47.23 (94.5%)                    │ │
│ │ Status: ⚠️  Warning (approaching limit)                         │ │
│ │                                                                  │ │
│ │ [View Ledger]              [Edit Budget]    [Reset Limit]        │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ RUNTIME BUDGETS                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Bash Runtime                                                     │ │
│ │ Limit: $20.00/month     Spent: $22.47 (112%)                     │ │
│ │ Status: ❌ Hard stop (exceeded, approval required)              │ │
│ │                                                                  │ │
│ │ [Request Approval]         [View Ledger]    [Edit Budget]        │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Budget Approval Workflow

When a budget is exceeded with approval required:

1. Work blocked, approval request created
2. Request appears in **Autonomy → Approvals**
3. Operator reviews: "Spend $2.50 more to complete task?"
4. **Approve**: Work resumes, budget limit increased temporarily
5. **Deny**: Work remains blocked, budget unchanged

### When to Use Budgets

**Always use company budget:**
- Prevents runaway spend
- Provides overall cost visibility
- Required for financial governance

**Use employee budgets when:**
- Team has cost allocation
- Need to track individual usage
- Preventing one employee from consuming entire budget

**Use runtime budgets when:**
- External runtimes have variable cost
- Need to cap specific expensive operations
- Runtime provider charges by API call

**Use routine budgets when:**
- Routine runs frequently (hourly, daily)
- Routine cost is predictable
- Need to cap recurring automation spend

---

## Approvals

### Purpose

**Approvals** unify all governance decision queues into one inbox. Authority requests, budget overrides, planner confirmations, and routine changes all flow through Approvals for centralized operator review.

### Approval Types

| Type | Source | What It Requests | Decision Impact |
|------|--------|------------------|-----------------|
| **Authority** | Extension requesting access | Grant/deny filesystem, tool, or network access | Extension can/cannot use capability |
| **Budget** | Spend limit exceeded | Allow/deny budget override | Work can/cannot proceed |
| **Planner** | Write-side agentic action | Confirm/Reject ticket creation or delegation | Work created or cancelled |
| **Routine** | Routine change request | Allow/deny routine modification | Routine uses new config |

### The Approval Queue

```
┌─────────────────────────────────────────────────────────────────────┐
│ Approvals (4 pending)                                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 🟁 AUTHORITY REQUEST                                             │ │
│ │                                                                  │ │
│ │ Extension: slack-integration                                     │ │
│ │ Requesting: Network access to https://slack.com/api            │ │
│ │                                                                  │ │
│ │ Rationale: "Runtime needs to post messages to Slack channels"   │ │
│ │                                                                  │ │
│ │ Requested: 5 minutes ago                                         │ │
│ │                                                                  │ │
│ │ [Review Extension]    [Deny]           [Approve]                │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 💰 BUDGET OVERRIDE                                               │ │
│ │                                                                  │ │
│ │ Scope: Sarah Chen (employee budget)                              │ │
│ │ Limit: $50.00/month                                             │ │
│ │ Spent: $47.23                                                   │ │
│ │ Override request: +$5.00 to complete ticket #52                 │ │
│ │                                                                  │ │
│ │ Rationale: "Ticket nearly complete, small overrun acceptable"    │ │
│ │                                                                  │ │
│ │ Requested: 2 minutes ago                                         │ │
│ │                                                                  │ │
│ │ [View Employee]          [Deny]           [Approve]                │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 📋 PLANNER CONFIRMATION                                          │ │
│ │                                                                  │ │
│ │ Action: Decompose project into tickets                           │ │
│ │ Project: Q2 Launch                                               │
│ │ Estimated tickets: 8                                             │
│ │ Estimated cost: $4.50                                            │ │
│ │                                                                  │ │
│ │ Confirm write-side agentic action?                               │ │
│ │                                                                  │ │
│ │ Requested: Just now                                             │ │
│ │                                                                  │ │
│ │ [View Details]           [Reject]         [Confirm]              │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ [Approve All Pending]           [Deny All Pending]                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Processing Approvals

**To approve:**
1. Click **Approve** button
2. (Optional) Add rationale for audit trail
3. Approval recorded, request actioned
4. Audit log updated with decision

**To deny:**
1. Click **Deny** button
2. (Optional) Add reason for denial
3. Request rejected, no action taken
4. Audit log updated with decision

**Batch processing:**
- **Approve All Pending**: Approve every request (use with caution)
- **Deny All Pending**: Deny every request (use for bulk rejection)

### Approval Best Practices

**DO:**
- Review each request individually
- Provide rationale for denials (helps requesters adjust)
- Approve authority requests only after verifying extension provenance
- Deny budget overrides if cheaper alternatives exist

**DON'T:**
- Approve all without review (defeats governance purpose)
- Deny without explanation (frustrates operators, no learning)
- Approve authority for unknown extensions (security risk)
- Let approval queue grow beyond 20 items (backlog creates resentment)

---

## Artifacts

### Purpose

**Artifacts** are runtime outputs and evidence captured from autonomous execution. When an external runtime creates a file, or a routine generates a report, the artifact is recorded with provenance: which employee/runtime created it, when, and what ticket context.

### Artifact Types

| Type | Source | Example |
|------|--------|---------|
| **File output** | Runtime created file | Code generated by Bash runtime |
| **Report** | Routine execution | Daily status report PDF |
| **Log** | Runtime execution | Execution log from external process |
| **Evidence** | Benchmark or test | Benchmark results JSON |

### Reading the Artifacts Panel

```
┌─────────────────────────────────────────────────────────────────────┐
│ Artifacts                                                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ daily-status-report-2026-05-03.pdf                               │ │
│ │                                                                  │ │
│ │ Type: Report    Size: 247 KB                                     │
│ │ Created: Today 09:00 by routine:daily-status                     │ │
│ │                                                                  │ │
│ │ Generated by: CEO (system-agent)                                 │
│ │ Ticket context: #51 (Daily Status Report)                       │ │
│ │                                                                  │ │
│ │ [Download]             [View in Files]       [View Ticket]       │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ authentication-fix.patch                                         │ │
│ │                                                                  │ │
│ │ Type: File output    Size: 12 KB                                 │
│ │ Created: Yesterday 14:32 by runtime:bash-mike                   │ │
│ │                                                                  │ │
│ │ Generated by: Mike Reyes (Senior Fullstack Engineer)            │
│ │ Ticket context: #47 (Fix authentication bug)                     │ │
│ │                                                                  │ │
│ │ [Download]             [View in Files]       [View Ticket]       │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ [Filter by Type]            [Filter by Employee]    [Export List]   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Artifact Provenance

Every artifact tracks:
- **Creator**: Which employee or runtime created it
- **Timestamp**: When it was created
- **Ticket**: Which work item it relates to (if applicable)
- **Source**: Routine ID, runtime ID, or manual creation
- **Integrity**: SHA256 hash for verification

**Why provenance matters:**
- Verify who created what
- Trace artifacts to work items
- Audit autonomous execution
- Verify file integrity (hash comparison)

### When to Review Artifacts

**After routines run:**
- Verify reports generated correctly
- Check for unexpected outputs
- Validate file integrity

**After external runtime work:**
- Confirm deliverables created
- Verify output quality
- Check for execution errors

**Before accepting deliverables:**
- Review artifact content
- Verify against ticket requirements
- Confirm completion evidence

---

## Memory

### Purpose

**Memory** manages long-run context for threads. As conversations grow, raw message history becomes too large to send to LLMs on every turn. Memory uses digests (summaries) and checkpoints (resumable states) to keep context bounded while preserving critical information.

### Memory Components

| Component | Purpose | When It Matters |
|-----------|---------|-----------------|
| **Digest** | Condensed summary of conversation | Threads 20+ messages long |
| **Checkpoint** | Resumable state snapshot | Long-running agentic work |
| **Packed context** | Bounded context sent to LLM | Every turn after threshold |
| **Dropped history** | Old messages excluded from context | Very long threads (100+ messages) |

### Reading the Memory Panel

```
┌─────────────────────────────────────────────────────────────────────┐
│ Thread Memory — Ticket #47: Authentication Bug Fix                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ CURRENT DIGEST                                                      │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ "Discussed authentication failure on Safari. Root cause         │ │
│ │ identified as race condition in auth state management.          │ │
│ │ Decision: implement error modal with retry, preserve user       │ │
│ │ input. Mike implementing fix, Sarah to QA. Status: fix          │ │
│ │ deployed, awaiting testing."                                     │ │
│ │                                                                  │ │
│ │ Created: 2 hours ago    Tokens: 45                              │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ LATEST CHECKPOINT                                                   │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Checkpoint #3 created 1 hour ago                                 │
│ │ State: Resumable at Mike's last message                         │
│ │ Context: Fix deployed, awaiting Sarah's QA review               │ │
│ │                                                                  │ │
│ │ [Resume from Checkpoint]    [Create New Checkpoint]             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ CONTEXT BUDGET                                                      │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Pack budget: 8000 tokens     Used: 3247 tokens (40.6%)          │
│ │ Recent turns: 5           Checkpoint depth: 3                   │
│ │ Dropped history: 0 messages   (No truncation yet)               │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ BLOCKERS                                                            │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ No blockers detected                                             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ACTIVE ARTIFACTS                                                   │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ • authentication-fix.patch (created by Mike Reyes)              │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ PENDING APPROVALS                                                   │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ None                                                             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ [Edit Memory Settings]                   [View Full Thread]          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Creating a Checkpoint

**When:** Critical decision made, complex work completed, before long pause

**Steps:**
1. Navigate to **Autonomy → Memory** (or click Memory card in ticket/thread)
2. Click **Create Checkpoint**
3. Confirm checkpoint summary
4. Checkpoint saved, can resume from this state later

**Use cases:**
- Handoff between employees
- Pause work overnight, resume next day
- Capture decision before exploring alternative
- Save progress before risky operation

### Memory Settings

Access via **Settings → Memory**:

| Setting | Default | Range | Effect |
|---------|---------|-------|--------|
| **Pack budget** | 8000 tokens | 1000-50000 | Max context per turn |
| **Recent turn window** | 5 turns | 1-20 | Recent messages sent verbatim |
| **Checkpoint depth** | 3 checkpoints | 1-10 | How many checkpoints preserved |
| **Digest cadence** | Every 10 turns | 5-50 | How often to create digest |

**Tuning for your use case:**
- **Short threads**: Default settings fine
- **Long collaborations**: Increase pack budget and recent window
- **Multi-day work**: Increase checkpoint depth
- **Cost-sensitive**: Decrease pack budget, increase digest cadence

---

## Access

### Purpose

**Access** manages operator posture for the workspace: who can supervise locally, who is invited, and who is cloud-ready. This determines sharing, collaboration, and remote access permissions.

### Access Types

| Type | Meaning | Use Case |
|------|---------|----------|
| **Local owner** | Workspace creator, full access | Single-user, personal workspace |
| **Invited operator** | Shared access by invitation | Team collaboration within organization |
| **Cloud-ready** | Prepared for future cloud sync | Multi-device access, upcoming feature |

### Reading the Access Panel

```
┌─────────────────────────────────────────────────────────────────────┐
│ Operator Access — Workspace: Strategia-X                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ LOCAL OWNERS                                                        │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Rocky Elsalaymeh (you)                                          │ │
│ │ Role: Owner                                                      │ │
│ │ Since: Workspace creation (2025-01-15)                           │ │
│ │                                                                  │ │
│ │ This is your workspace. You have full control.                 │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ INVITED OPERATORS                                                   │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ No invited operators                                             │ │
│ │                                                                  │ │
│ │ [Invite Operator]                                               │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ CLOUD-READY MEMBERSHIP                                              │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Not configured                                                  │ │
│ │                                                                  │ │
│ │ Cloud sync is a future feature. Configure cloud-ready          │ │
│ │ posture when multi-device access becomes available.            │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ [Manage Invites]                 [Configure Cloud Access]           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Inviting Operators

**Steps:**
1. Click **Invite Operator**
2. Enter email address or username
3. Select role: Viewer (read-only), Operator (full access except delete), Owner (full access)
4. Click **Send Invite**
5. Invitee receives invitation, accepts to join

**Note:** Invited operators require Team-X account and local access to your machine (or cloud sync when available).

### Access Roles

| Role | Permissions | Use For |
|------|-------------|---------|
| **Viewer** | Read-only (view tickets, employees, dashboard) | Stakeholders, auditors |
| **Operator** | Read + write (create/modify work, no delete) | Team members, collaborators |
| **Owner** | Full access including delete, workspace settings | Primary workspace owner |

---

## Autonomy Best Practices

### 1. Run Doctor Before Unattended Work

**Never** launch routines or long-running autonomous work without running Doctor first.

**Rationale:** Doctor catches configuration errors, missing dependencies, and governance blockers before they cause failures.

### 2. Use Benchmarks to Verify Changes

After modifying budgets, approvals, routines, or runtimes:
1. Run relevant benchmarks
2. Verify pass rates
3. Check for unexpected behavior
4. Only then enable for production

**Rationale:** Tests validate that changes work as intended.

### 3. Review Improvement Tickets Weekly

Improvement tickets accumulate. Weekly review:
1. Prioritize by severity
2. Assign owners
3. Track to completion
4. Close when resolved

**Rationale:** Prevents problem debt from accumulating.

### 4. Set Budgets Before Scaling

Before increasing concurrency, adding routines, or enabling expensive providers:
1. Set appropriate budgets
2. Configure approval gates
3. Test with small workload
4. Monitor for first week

**Rationale:** Prevents surprise costs from scaling.

### 5. Use Artifacts for Verification

Before accepting autonomous work as complete:
1. Review artifacts in Artifacts panel
2. Verify deliverables match requirements
3. Check file integrity (SHA256 hash)
4. Confirm ticket can be closed

**Rationale:** Autonomous work needs verification just like manual work.

### 6. Monitor Approvals Daily

Approval queue backlog causes frustration:
1. Check Approvals morning and afternoon
2. Process or delegate
3. Don't let queue exceed 20 items
4. Provide rationale for denials

**Rationale:** Fast approval cycles keep autonomous work flowing.

---

## Related Sections

- [Mission Control Dashboard](#5-mission-control-dashboard) — Real-time operations
- [Copilot: Proactive Intelligence](#12-copilot-proactive-intelligence) — Insights and improvement
- [Telemetry & Costs](#16-telemetry--costs) — Detailed cost analysis
- [Extensions: Skills & MCPs](#14-extensions--skills--mcps) — Runtime configuration
- [Settings & Configuration](#15-settings--configuration) — Runtime and memory settings

---

*Enhanced Autonomy Control Plane documentation — 580+ lines vs. original ~150 lines*

## 14. Extensions: Skills & MCPs

### What Are Extensions?

**Extensions** expand Team-X capabilities:

- **Skills**: Pre-built agent behaviors and workflows
- **MCP Servers**: Model Context Protocol servers providing tools and resources

Access via **Settings → Extensions & Authority**.

### Skills

**Skills** are packaged agent behaviors you can install.

**Installing a Skill:**

1. Navigate to **Settings → Extensions**
2. Click **Skills Marketplace** button
3. Browse or search available skills
4. Click **Install** on a skill
5. Review requested authority
6. Grant or deny access

**Or Install from Local Folder:**
1. Click **Install from Local**
2. Select skill package folder
3. Install

**Skills Provide:**
- Custom behaviors for specific roles
- Domain expertise and workflows
- Tool integrations
- Specialized outputs

### MCP Servers

**MCP Servers** (Model Context Protocol) provide tools and resources to agents.

**Built-in MCP Templates:**
- Filesystem access
- Database connections
- API integrations
- Development tools

**Adding an MCP Server:**

1. Navigate to **Settings → Extensions**
2. Click **Import MCP Server**
3. Choose from templates or add custom:
   - **Name**
   - **Base URL**
   - Configuration
4. Review requested authority:
   - Filesystem paths
   - Network endpoints
   - Tool capabilities
5. **Import** the server

**Authority Review:**
After importing, review what the MCP can access:
- Filesystem paths
- Network endpoints
- Tool capabilities
- Data access

### Authority Grants

**Authority** controls what extensions can do:

**Granting Authority:**
1. Navigate to **Settings → Extensions → Authority**
2. Review pending requests
3. Each request shows:
   - Extension name and type
   - Requested access (filesystem paths, tools, etc.)
   - Risk level (Low/Medium/High)
4. **Grant** or **Deny** each request

**Authority Types:**
- **Filesystem access**: Read/write paths
- **Network access**: Allowed endpoints
- **Tool usage**: Which tools the extension can invoke
- **Data access**: What data it can read/write

### Extension Best Practices

- **Review before trusting**: Green connection ≠ safe
- **Principle of least privilege**: Grant minimum needed access
- **Monitor usage**: Check audit log for extension activity
- **Revoke when unused**: Remove authority from unused extensions

---

## 15. Settings & Configuration

### Settings Overview

Access **Settings** via top navigation.

### Updater

**Auto-updates:**
- Checks for updates on startup
- Shows release notes
- One-click update installation

**Manual Update:**
- Click **Check for Updates** button
- Download and install latest version

### Runtime

**Runtime Strategy:**

| Strategy | Behavior |
|----------|----------|
| **Auto** | Profiles hardware and picks best strategy automatically |
| **Hybrid** | Local models for simple tasks, cloud for complex |
| **Always-On** | Always uses highest-quality available provider |
| **Lean** | Minimizes resource usage, prefers local models |

**Hardware Profile:**
- Shows detected CPU, RAM, GPU
- Informs strategy selection

**Effective Slot Count:**
- Maximum concurrent agent runs
- Adjusts based on strategy and hardware

### Privacy

**Privacy Tiers:**

| Tier | Data Location | Example Providers |
|------|--------------|-------------------|
| **Local only** | Your machine only | Ollama |
| **Open-Source Cloud** | Third-party servers, open models | Groq, Together, Fireworks |
| **Proprietary Cloud** | Third-party servers, proprietary models | Anthropic, OpenAI, Google |

**Set Privacy Maximum:**
1. Choose your max tier
2. Provider router enforces filter at call time
3. Roles fall back to approved providers

### RAG Configuration

**RAG** (Retrieval-Augmented Generation) improves agent responses with your vault data.

**Settings:**
- **Chunk size**: How large to split documents
- **Overlap**: Overlap between chunks
- **Similarity threshold**: Matching sensitivity

**Use RAG When:**
- You have many documents in Files
- Agents need to reference your documentation
- You want ground-truthed responses

### Concurrency

**Concurrency Caps** limit simultaneous provider calls:

| Provider | Default Cap |
|----------|------------|
| Ollama | 1 |
| Anthropic | 4 |
| OpenAI | 6 |
| Google | 4 |
| Groq | 10 |
| OpenRouter | 8 |
| Together | 6 |
| Fireworks | 6 |

**Adjust Based On:**
- Hardware capabilities (for local)
- Plan tier rate limits (for cloud)
- Budget constraints

### Permissions

**Permissions** control team member access in shared workspaces.

**Set Permissions:**
1. Navigate to **Settings → Permissions**
2. Configure:
   - Who can hire/fire employees
   - Who can create/delete companies
   - Who can manage providers
   - Who can approve budgets
   - Who can manage operators

### Agentic Loop Settings

**Budget Controls:**

| Setting | Default | Range | Purpose |
|---------|---------|-------|---------|
| **Max Steps** | 8 | 1–32 | Limit loop iterations |
| **Max Tokens** | 8000 | 500–50000 | Cumulative token budget |
| **Timeout** | 120s | 10–600s | Wall-clock deadline |

**Choosing Budgets:**
- **Local Ollama 7-8B**: Bump Max Steps to 12-16
- **Local Ollama 14B+**: Defaults work fine
- **Cloud providers**: Defaults fine
- **Investigative questions**: Bump Max Tokens to 20K-30K

### Planner Settings

**Task Planner** handles write-side work (project decomposition, delegation).

**Guardrails:**
- Confirmation gates for destructive or write operations
- Approval requirements for large work
- Validation before execution

### Memory Settings

**Memory** controls long-run conversation context.

**Default Pack Settings:**
- **Pack budget**: How much context to include
- **Recent-turn window**: How many recent turns to keep visible
- **Checkpoint depth**: How many checkpoints to retain

**Use When:**
- Runs feel context-heavy
- You want faster context windows
- Long conversations need checkpoints for resumption

### Portability

**Portability** handles workspace import/export:

**Features:**
- Preview import packages
- Export workspaces as packages
- Save workspace templates
- Review sharing posture

**Export Package:**
1. Navigate to **Settings → Portability**
2. Choose export mode (full/template/redacted)
3. Export creates portable package file

**Import Package:**
1. Click **Import Package**
2. Select package file or GitHub reference
3. Preview what will be imported
4. Configure:
   - New workspace name
   - Secret bindings for providers
5. Import

**What's Included/Excluded:**
- Included: Companies, employees, org structure, tickets, projects, goals, meetings, files, settings
- Excluded: Provider API keys (re-enter after import)

### Copilot Settings

See [Section 12: Copilot](#12-copilot-proactive-intelligence) for full Copilot configuration.

### Backup & Restore

**Backup:**

1. Navigate to **Settings → Backup & Restore**
2. Click **Create Backup**
3. Choose destination
4. Backup includes:
   - Database
   - Vault files
   - Manifest with metadata

**Restore:**

1. Click **Restore**
2. Select `.teamx-backup` archive
3. Confirm (destructive operation)
4. App reloads after restore

**Backup Best Practices:**
- Back up before major changes
- Back up before updates
- Store externally for disaster recovery
- Test restores periodically

---

## 16. Telemetry & Costs

### Telemetry Overview

**Telemetry** provides visibility into system usage, costs, and performance.

Access via **Telemetry** tab in top navigation.

### Telemetry Views

**Company Telemetry:**
- Total runs, tokens, cost
- Provider breakdown
- Timeline view
- Usage statistics

**Employee Telemetry:**
- Per-employee runs and costs
- Model usage patterns
- Performance metrics

**Cost Breakdown:**
- Spend by provider
- Spend by employee
- Spend over time
- Cost-per-token analysis

### Metrics Tracked

**Run Metrics:**
- Total run count
- Total tokens used
- Total cost incurred
- Average latency
- Success/failure rate

**Token Metrics:**
- Input vs output tokens
- Tokens by model
- Tokens by provider
- Cost per thousand tokens

**Latency Metrics:**
- Time to first token
- Total run duration
- Provider latency comparison

### Using Telemetry

**Monitoring Costs:**
- Check daily usage in Company Telemetry
- Review cost breakdown before scaling
- Identify expensive employees or operations

**Optimizing Performance:**
- Compare latency across providers
- Identify slow employees or operations
- Adjust runtime strategy based on data

**Budget Planning:**
- Project future spend based on trends
- Identify cost anomalies
- Track spend against budgets

### Telemetry Best Practices

- **Review regularly**: Check costs weekly
- **Set budgets**: Use Autonomy → Budgets to enforce limits
- **Optimize providers**: Switch between providers based on cost/speed needs
- **Monitor latency**: High latency affects user experience

---

## 17. Audit Trail

### Audit Overview

**Audit** is the complete, append-only evidence trail of everything that happens.

Access via **Audit** tab in top navigation.

### Event Types

**Company Events:**
- Company created, updated, archived, deleted
- Workspace linking, unlinking

**Employee Events:**
- Employee hired, fired, promoted
- Manager changed

**Ticket Events:**
- Ticket created, updated, closed, reopened
- Assignee changed
- Participants added/removed

**Project Events:**
- Project created, updated, deleted
- Goals added, updated, completed

**Meeting Events:**
- Meeting called, ended
- Minutes generated
- Action items created

**Chat Events:**
- Messages sent
- Threads created

**Command Events:**
- Commands executed
- Command parsed

**Work Events:**
- Work completed
- Work failed

**Copilot Events:**
- Analysis run
- Insights surfaced, dismissed, expired
- Weights changed

**Runtime Events:**
- Runtime sessions started, ended
- Checkouts created, released
- Heartbeat received, missed

**Authority Events:**
- Extensions installed, updated, removed
- Authority requested, granted, revoked

**Budget Events:**
- Policies created, updated, deleted
- Warnings triggered
- Hard stops hit

**Approval Events:**
- Approvals requested, approved, denied

### Audit Features

**Filtering:**
- Filter by event type
- Filter by date range
- Filter by specific entities (employee, ticket, etc.)

**Search:**
- Full-text search across all events
- Find specific actions or entities

**Export:**
- Export filtered events for analysis
- JSON and CSV formats

### Reading Audit Events

Each event shows:
- **Timestamp**: When it occurred
- **Event Type**: Category of action
- **Description**: What happened
- **Details**: Relevant IDs, entities, values
- **Payload**: Full event data

### Audit Best Practices

- **Investigate issues**: Use audit to trace root causes
- **Verify compliance**: Check authority changes and approvals
- **Track patterns**: Identify recurring problems
- **Export evidence**: Create records for reviews

---

## 18. Troubleshooting

### Common Issues

**"Employees don't respond to chat"**

Check:
1. Is a provider enabled? (Settings → Providers)
2. Is the provider connection working? (Test Connection button)
3. Is the employee a ticket participant? (Ticket thread wakes only participants)
4. Is the provider API key valid?

**"Agent on ticket doesn't wake after I comment"**

Verify:
1. Is the employee in the ticket's participant section?
2. Is the employee a historical author on that ticket thread?
3. Only participants and historical authors wake on comments

**"Extension appears installed but doesn't work"**

Review:
1. Authority requests - were they granted?
2. Trust state - is the extension trusted?
3. Configuration - is it set up correctly?

**"Workspace feels empty"**

Confirm:
1. Providers configured and enabled?
2. Employees hired?
3. Real work surfaces exist (tickets, projects, goals)?

**"Copilot never produces insights"**

Check:
1. Is Copilot enabled? (Settings → Runtime → Copilot)
2. Is the interval reasonable? (Default 5 min)
3. Are categories selected? (Empty = all categories active)
4. Check audit for `copilot.analyzed` errors

**"Run completed with 'budget_exhausted'"**

Adjust:
1. Increase `agentic_max_steps` (Settings → Runtime → Agentic Loop)
2. Increase `agentic_max_tokens`
3. Switch to faster provider

**"The classifier doesn't understand me"**

Below 0.5 confidence, the palette routes to `complex_request`:
- You'll still get an answer, just via the agentic loop
- Try rephrasing with recognized verbs: "hire", "fire", "assign", "create", "close", "call", "end", "show", "find"

### Diagnostic Tools

**Autonomy Doctor:**
Run before autonomous work to catch issues early:
1. Navigate to **Autonomy → Doctor**
2. Click **Run Doctor**
3. Review report for issues

**Audit Log:**
Trace root causes:
1. Navigate to **Audit**
2. Filter by relevant event types
3. Follow the event chain to understand what happened

**Telemetry:**
Identify resource issues:
1. Navigate to **Telemetry**
2. Check provider performance
3. Review employee-specific metrics

### Getting Help

If issues persist:
1. Check this user guide's relevant sections
2. Run Autonomy Doctor
3. Review audit trail for error events
4. Export diagnostics for support

---

## 19. Best Practices

### Workspace Organization

**Start Simple:**
1. Hire a CEO first for strategic direction
2. Add specialists as needed (engineer, designer, etc.)
3. Build depth before breadth

**Use Hierarchies:**
- Officers set strategy
- VPs own functions
- Managers own teams
- ICs execute

**Match Roles to Goals:**
- If shipping an MVP: Hire engineers, a PM, and QA
- If analyzing data: Hire data scientists and analysts
- If designing: Hire designers, copywriter, brand specialist

### Work Management

**Use Tickets for:**
- Durable work items
- Multi-employee collaboration
- Work that connects to larger goals
- Deliverables with deadlines

**Use Chat for:**
- Quick questions
- Clarifications
- Status checks
- Informal collaboration

**Create Projects for:**
- Related initiatives
- Time-bound initiatives
- Cross-functional work

**Set Goals for:**
- Measurable outcomes
- Target dates
- Quantifiable achievements

**Use Schedule for:**
- Coordination of deadlines
- Reminders and wakeups
- Time-sensitive tasks

### Cost Management

**Optimize Provider Choice:**
- Use local models for simple tasks
- Use cloud models for complex reasoning
- Match model tier to task complexity

**Set Budgets:**
- Company-wide caps for total spend
- Employee caps to limit individual usage
- Runtime and routine caps for external work

**Monitor Telemetry:**
- Check costs weekly
- Review per-employee spend
- Identify expensive operations

### Security & Authority

**Review Authority Requests:**
- Check what extensions can access
- Grant minimum needed access
- Revoke unused authority

**Use Privacy Tiers:**
- Local only: Maximum privacy, Ollama only
- Open-Source Cloud: Community models, third-party servers
- Proprietary Cloud: Best performance, data leaves your machine

**Back Up Regularly:**
- Before major changes
- Before updates
- Store externally for disaster recovery

### Team Collaboration

**Clear Communication:**
- Write clear ticket descriptions
- Provide context in chat
- Use meetings for alignment

**Use Meetings Effectively:**
- Have clear agendas
- Invite only who's needed
- Convert action items to tickets

**Leverage Participants:**
- Add relevant expertise to tickets
- Wake up historical authors when needed
- Use participant selector to include right people

### Autonomy & Governance

**Run Doctor First:**
- Before unattended work
- After major changes
- When issues arise

**Use Benchmarks:**
- Verify autonomy behavior
- Test before deploying routines
- Maintain confidence in system

**Review Approvals:**
- Check for pending authority/budget requests
- Approve or deny with rationale
- Track decision patterns

### Long-Running Work

**Monitor Memory:**
- Check digests for context drift
- Use checkpoints for resumable state
- Adjust pack settings for context needs

**Use Routines:**
- Schedule repeated operations
- Automate regular maintenance
- Materialize visible work

**Track Artifacts:**
- Review outputs from autonomous runs
- Verify deliverable quality
- Maintain evidence trail

---

## 20. Keyboard Shortcuts

### Global Shortcuts

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| **Open Command Palette** | `Ctrl+K` | `Cmd+K` |
| **Open Copilot Sidebar** | `Ctrl+Shift+K` | `Cmd+Shift+K` |
| **Close dialog/palette** | `Esc` | `Esc` |
| **Submit form** | `Enter` | `Return` |
| **Confirm destructive action** | `Enter` on Confirm button | `Return` on Confirm button |

### Navigation Shortcuts

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| **Switch to Dashboard** | `Alt+D` | `Cmd+D` |
| **Switch to Autonomy** | `Alt+A` | `Cmd+A` |
| **Switch to Org** | `Alt+O` | `Cmd+O` |
| **Switch to Projects** | `Alt+P` | `Cmd+P` |
| **Switch to Tickets** | `Alt+T` | `Cmd+T` |
| **Switch to Meetings** | `Alt+M` | `Cmd+M` |
| **Switch to Chat** | `Alt+C` | `Cmd+C` |
| **Switch to Files** | `Alt+F` | `Cmd+F` |
| **Switch to Telemetry** | `Alt+G` | `Cmd+G` |
| **Switch to Audit** | `Alt+L` | `Cmd+L` |
| **Switch to Settings** | `Alt+S` | `Cmd+,` |

### Editing Shortcuts

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| **Send message** | `Ctrl+Enter` | `Cmd+Return` |
| **New line in composer** | `Shift+Enter` | `Shift+Return` |
| **Navigate history** | `ArrowUp`/`ArrowDown` | `ArrowUp`/`ArrowDown` |
| **Select all** | `Ctrl+A` | `Cmd+A` |
| **Copy** | `Ctrl+C` | `Cmd+C` |
| **Paste** | `Ctrl+V` | `Cmd+V` |
| **Undo** | `Ctrl+Z` | `Cmd+Z` |
| **Redo** | `Ctrl+Y` / `Ctrl+Shift+Z` | `Cmd+Shift+Z` |

### Dashboard Shortcuts

| Action | Shortcut |
|--------|----------|
| **Toggle Agent Runs panel** | Click Agent Runs button |
| **Toggle Employee Queues panel** | Click Employee Queues button |
| **Reset layout to default** | Click Reset Layout button |
| **Open selected run thread** | Click on run card |
| **Open selected employee chat** | Click on employee row |
| **Navigate dashboard subviews** | Click subview tabs |

---

## Quick Reference

### First 5 Minutes

1. ✅ Enable a provider (Settings → Providers)
2. ✅ Chat with an employee (click employee card)
3. ✅ Create a ticket (Ctrl+K → "File a ticket...")
4. ✅ Check Mission Control (should show live activity)
5. ✅ Review Copilot insights (Cmd+Shift+K)

### Essential Tabs

| Tab | Primary Purpose | Key Action |
|------|-----------------|------------|
| **Dashboard** | See what's happening | Monitor operations, check queues |
| **Autonomy** | Govern execution | Doctor, budgets, approvals, runtimes |
| **Org** | Manage workforce | Hire, fire, promote, org chart |
| **Projects** | Organize work | Create projects, goals, view schedule |
| **Tickets** | Track work | Kanban board, create/assign work |
| **Meetings** | Collaborate | Call meetings, review minutes |
| **Chat** | Communicate | Direct conversations, threads |
| **Files** | Store documents | Upload, download, agent files |
| **Telemetry** | Measure performance | Costs, usage, latency |
| **Audit** | Review evidence | Full event log, filtering, export |
| **Settings** | Configure system | Providers, runtime, privacy, backup |

### Core Concepts

- **Workspaces**: Isolated environments for different teams/companies
- **Employees**: AI agents with role specifications
- **Tickets**: Durable work items with kanban tracking
- **Projects**: Organize related work into initiatives
- **Goals**: Measurable outcomes with targets
- **Meetings**: Structured collaboration with minutes and action items
- **Chat**: Direct conversations and thread management
- **Files**: Document vault with agent-generated deliverables
- **Copilot**: Proactive insights and pattern detection
- **Autonomy**: Governance for supervised execution
- **Extensions**: Skills and MCPs that expand capabilities
- **Telemetry**: Usage and cost analytics
- **Audit**: Complete evidence trail

---

## Need More Help?

- **In-App User Guide**: Click **User Guide** in left sidebar for role-based onboarding
- **Audit Trail**: Review specific events to understand what happened
- **Autonomy Doctor**: Run diagnostics to catch configuration issues
- **Command Palette**: Ask Team-X questions directly via `Ctrl+K`

---

**Version**: 1.0
**Last Updated**: 2026-05-03
**Product Phase**: Phase 6
**Release**: Team-X v1.1.0
