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
Queue Pressure: 12  |  Blocked Work: 0  |  Today Cost: $0.47
```
→ Work is flowing, no blockages, cost is reasonable. No action needed.

**Scenario 2: Queue Saturation**
```
Live Runs: 0  |  External Runtimes: 0  |  Workforce Active: 1/8
Queue Pressure: 47  |  Blocked Work: 12  |  Today Cost: $0.12
```
→ Employees stuck, queue not moving. Check: (1) Provider enabled? (2) Blocked tickets clearing? (3) Employee status errors?

**Scenario 3: Spend Spike**
```
Live Runs: 8  |  External Runtimes: 3  |  Workforce Active: 7/8
Queue Pressure: 23  |  Blocked Work: 2  |  Today Cost: $14.82
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
| **Queue Bar** | Visual breakdown of ticket counts | Gray (Open) / Brand (In-Progress) / Amber (Blocked) / Green (Done) |
| **Quick Actions** | Chat bubble, ticket icon | Jump to conversation or ticket list |

#### Reading the Queue Bar

The horizontal bar shows four segments, left-to-right:

```
Open: ████████ (8)     In-Progress: ███ (3)     Blocked: █ (1)     Done: ██████ (6)
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
Mid-day: Queue Pressure: 15, In-Progress bars growing, Cost: $2-3
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
