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
