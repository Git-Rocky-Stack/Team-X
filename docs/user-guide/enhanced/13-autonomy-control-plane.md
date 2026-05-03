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
|    • Actual: work executed without approval ❌                      │
│    • Root cause: Approval gate bypassed in routine config          │
│                                                                     │
│ ✅ Routine Execution          PASS (2.3s)                           │
│    • 3 tickets created from template                                │
│    • Assignees: Sarah (2), Mike (1)                                 │
│    • Artifacts: 3 tickets, 1 ledger entry                          │
│                                                                     │
│ ❌ Runtime Recovery           FAIL (timeout after 30s)              │
│    • Failure detected ✅                                            │
|    • Recovery attempt: timed out ❌                                 │
|    • Expected: Runtime restart within 10s                           │
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
│ │    (Already open, no duplicate created)                          │ │
│ │                                                                  │
│ │ RECOMMENDATIONS:                                                 │ │
│ │ • Review budget settings to reduce exhaustion errors             │ │
│ │ • Unblock 7 tickets to clear queue pressure                      │ │
│ │ • Restart or rebind stale runtime session                        │ │
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
│ │ [Recent Ledger]                                                 [Edit Budget]    │
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
│ │ Bash Runtime                                                     │
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
│ │ Project: Q2 Launch                                               │ │
│ │ Estimated tickets: 8                                             │ │
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
│ │ Type: Report    Size: 247 KB                                     │ │
│ │ Created: Today 09:00 by routine:daily-status                     │ │
│ │                                                                  │ │
│ │ Generated by: CEO (system-agent)                                 │ │
│ │ Ticket context: #51 (Daily Status Report)                       │ │
│ │                                                                  │ │
│ │ [Download]             [View in Files]       [View Ticket]       │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ authentication-fix.patch                                         │ │
│ │                                                                  │ │
│ │ Type: File output    Size: 12 KB                                 │ │
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
│ │ Checkpoint #3 created 1 hour ago                                 │ │
│ │ State: Resumable at Mike's last message                         │ │
│ │ Context: Fix deployed, awaiting Sarah's QA review               │ │
│ │                                                                  │ │
│ │ [Resume from Checkpoint]    [Create New Checkpoint]             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ CONTEXT BUDGET                                                      │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Pack budget: 8000 tokens     Used: 3247 tokens (40.6%)          │ │
│ │ Recent turns: 5           Checkpoint depth: 3                   │ │
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
