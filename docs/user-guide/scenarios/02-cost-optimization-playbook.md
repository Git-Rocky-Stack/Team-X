# Scenario: Cost Optimization Playbook

**Status:** Draft | **Last Updated:** 2026-05-03 | **Version:** 1.0

---

## Executive Summary

This scenario demonstrates how to identify and reduce Team-X spend while maintaining productivity. Cost management is critical for sustainable AI workforce operations — small optimizations compound into significant savings over time.

**Scenario Context:** A workspace has grown to 15 employees running 24/7 operations with routines and agentic workflows. Monthly spend has crept to $450, exceeding the $300 budget by 50%.

**Optimization Goal:** Reduce monthly spend to $300 or less while maintaining >90% of current productivity.

**Achieved Result:** Monthly spend reduced from $450 to $280 (38% reduction) while maintaining 94% of baseline productivity.

**Learning Objectives:**
- Using Copilot to identify cost anomalies and optimization opportunities
- Tuning provider selection and model choices for different workloads
- Optimizing routine schedules and scopes
- Managing budgets and approval workflows
- Monitoring spend trends post-optimization

---

## Table of Contents

1. [Problem Detection](#problem-detection)
2. [Cost Analysis](#cost-analysis)
3. [Optimization Strategy](#optimization-strategy)
4. [Execution](#execution)
5. [Validation](#validation)
6. [Ongoing Cost Management](#ongoing-cost-management)
7. [Key Takeaways](#key-takeaways)
8. [Related Documentation](#related-documentation)

---

## Problem Detection

### The Trigger: Copilot Alert

**Copilot surfaces cost insight:**

```
🔴 CRITICAL  •  COST

Monthly budget exhaustion projected in 8 days.

Current spend rate: $15/day ($450/month).
Budget limit: $300/month.
At current rate, budget exhausted on May 11.

Top cost contributors:
- Anthropic Claude (Sonnet): 68% of spend
- OpenAI GPT-4o: 22% of spend
- Ollama (local): 10% of spend

Recommendation: Review workload distribution, consider 
shifting appropriate work to local models.

[View Cost Breakdown]              [Dismiss]
```

**Operator Action:** Open Copilot (`Ctrl+Shift+K`) and review cost trends.

---

### Initial Cost Analysis

**Operator Action:** Use Command Palette to analyze spend.

```
Ctrl+K → "Which provider cost the most this month and why?"
```

**Agentic Loop Response:**

```
[Plan]
I'll query telemetry data to aggregate spend by provider and 
identify the top cost driver.

[Tool call]
query_telemetry({ 
  group_by: "provider", 
  date_range: "last_30_days",
  aggregate: ["token_count", "cost"]
})

[Tool result]
Provider breakdown:
- Anthropic: $306 (68%, 820K tokens)
- OpenAI: $99 (22%, 265K tokens)
- Ollama: $45 (10%, 120K tokens)
Total: $450

[Answer]
Anthropic is the top cost contributor at $306 (68% of total spend).

Why it costs the most:
1. Volume: 820K tokens (highest volume)
2. Model: Claude Sonnet at $3/1M tokens (premium tier)
3. Workload mix: 60% of agentic runs use Sonnet (vs. cheaper models)

Breakdown by workload type:
- Complex analysis (Sonnet): $245
- Code generation (Sonnet): $42
- Simple queries (Haiku): $19
- Local work (Ollama): $45

[Insight]
40% of Sonnet usage is for tasks that could use cheaper models:
- Code review: Could use Haiku or local
- Summarization: Could use Haiku
- Status checks: Could use cached results

Recommendation: Audit workloads and shift appropriate tasks to 
cheaper models.
```

---

### Mission Control Cost View

**Operator navigates to:** Telemetry tab → Cost view

**Observations:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ Cost Analysis — Last 30 Days                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Provider Breakdown:                                                 │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ ████████████████████ Anthropic: $306 (68%)                    │ │
│ │ ██████████ OpenAI: $99 (22%)                                    │ │
│ │ ███ Ollama: $45 (10%)                                            │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Employee Spend Top 5:                                               │
│ 1. Elena (Tech Lead):         $87 (19%)                             │
│ 2. Priya (Frontend Engineer):  $73 (16%)                            │
│ 3. Mike (Backend Engineer):    $64 (14%)                            │
│ 4. Alex (Product Manager):     $58 (13%)                            │
│ 5. Sarah (QA Engineer):        $51 (11%)                            │
│                                                                     │
│ Trend: ↑ 23% vs. previous month                                     │
│                                                                     │
│ [View by Employee]  [View by Workload]  [Export Data]              │
└─────────────────────────────────────────────────────────────────────┘
```

**Problem Identified:**
- 23% month-over-month increase
- Premium model (Sonnet) overused for simple tasks
- Elena (Tech Lead) is top spender — likely doing complex reviews that could be optimized

---

## Cost Analysis

### Deep Dive: Elena's Spend

**Operator Action:** Filter telemetry by employee.

```
Ctrl+K → "What is Elena spending money on and could we reduce it?"
```

**Agentic Loop Response:**

```
[Plan]
I'll query Elena's telemetry to analyze her cost drivers and 
identify optimization opportunities.

[Tool call]
query_telemetry({
  employee: "elena",
  date_range: "last_30_days",
  group_by: ["workload_type", "ticket_context"]
})

[Tool result]
Elena's spend breakdown ($87 total):
- Code review (agentic loops): $52
- Ticket triage (complex requests): $21
- Architecture planning (complex): $14

[Answer]
Elena's top cost driver is code review at $52 (60% of her spend).

Analysis of code review workload:
- 15 code reviews performed
- Average: 427K tokens per review ($1.28 each)
- Model: Always Claude Sonnet

Optimization opportunities:
1. **Model downgrading**: Code reviews could use Haiku for 
   initial scan, Sonnet only for complex issues
   - Projected savings: 60% (Haiku at $0.25/1M vs Sonnet at $3/1M)

2. **Targeted review**: Not all code changes need full review
   - Simple changes: Haiku or skip review
   - Complex changes: Sonnet full review
   - Projected savings: 30%

3. **Caching**: Similar code patterns reviewed repeatedly
   - Implement review cache for common patterns
   - Projected savings: 15%

Recommendation: Implement model selection logic for code review 
workflow. Use Haiku for initial scan, escalate to Sonnet only if 
complexity detected.
```

---

### Deep Dive: Routine Costs

**Operator Action:** Analyze routine spend.

```
Ctrl+K → "Which routines cost the most and should we optimize them?"
```

**Agentic Loop Response:**

```
[Plan]
I'll query telemetry for routine executions and identify high-cost 
routines.

[Tool call]
query_telemetry({
  workload_type: "routine",
  date_range: "last_30_days",
  group_by: "routine_name"
})

[Tool result]
Routine breakdown ($113 total):
- Daily code review: $52 (runs daily, 30 executions)
- Nightly data sync: $38 (runs nightly, 30 executions)
- Weekly summary: $23 (runs weekly, 4 executions)

[Answer]
Top cost routine: Daily code review at $52/month.

Analysis:
- Frequency: Daily at 9am (30 executions/month)
- Cost per execution: $1.73
- Model: Always Sonnet
- Function: Reviews all code changes from past 24h

Optimization opportunities:
1. **Reduce frequency**: Daily review is excessive for low-velocity teams
   - Current: 1-3 code changes/day
   - Recommendation: MWF (Mon/Wed/Fri) or threshold-based (5+ changes)
   - Projected savings: 66%

2. **Model selection**: Routine uses Sonnet for all reviews
   - Simple changes (80%): Could use Haiku
   - Complex changes (20%): Keep Sonnet
   - Projected savings: 60% on simple changes

3. **Scope reduction**: Routine reviews ALL repos
   - Current: 15 repos scanned
   - Recommendation: Exclude inactive repos (8 repos with 0 changes)
   - Projected savings: 53%

Recommendation: Modify routine to (a) run MWF only, (b) use 
Haiku for simple changes, (c) exclude inactive repos.
```

---

## Optimization Strategy

### Prioritization Matrix

**Operator creates optimization tickets based on analysis:**

| Optimization | Effort | Impact | Priority | Savings |
|-------------|--------|--------|----------|---------|
| Model selection logic (Elena) | Medium | High | P0 | ~$30/month |
| Routine frequency (daily→MWF) | Low | High | P0 | ~$35/month |
| Routine scope (exclude inactive) | Low | Medium | P1 | ~$20/month |
| Shift simple queries to Haiku | Medium | Medium | P1 | ~$25/month |
| Routine model optimization | Low | Medium | P2 | ~$15/month |
| Cache common patterns | High | Low | P3 | ~$10/month |

**Projected Total Savings:** ~$125/month (from $450 to $325)

---

### Optimization Plan

**Ticket #1: Implement Model Selection Logic**

```
Title: Add intelligent model selection to code review workflow

Description:
Elena's code reviews currently use Claude Sonnet for all reviews. 
Implement logic to:
1. Use Haiku for initial scan (detect complexity)
2. Escalate to Sonnet only if:
   - File count > 10
   - Change complexity > threshold
   - Security-sensitive code detected

Implementation:
- Add complexity detection heuristic
- Update runtime profile to support model selection
- Add logging to track model usage

Assignee: Mike (Backend Engineer)
Estimated savings: $30/month
Priority: P0
```

**Ticket #2: Optimize Routine Schedule**

```
Title: Change daily code review to MWF schedule

Description:
Daily code review runs 30 times/month but typically finds 1-3 changes.
Change to Mon/Wed/Fri schedule:
- Runs 13 times/month (57% reduction)
- Accumulates changes between runs
- No impact on review coverage

Implementation:
- Update routine cron schedule
- Add change count to routine output
- Monitor for backlog

Assignee: James (DevOps)
Estimated savings: $35/month
Priority: P0
```

**Ticket #3: Exclude Inactive Repos from Routines**

```
Title: Exclude inactive repos from code review routine

Description:
Code review routine scans 15 repos but only 7 have activity.
Add logic to exclude repos with 0 changes in past 7 days.

Implementation:
- Add activity check before review
- Maintain exclusion list (manual or auto)
- Log skipped repos

Assignee: Mike (Backend Engineer)
Estimated savings: $20/month
Priority: P1
```

---

## Execution

### Implementing Model Selection Logic

**Ticket #1 Thread:**

**Mike (Backend Engineer):**
```
Implementing model selection logic for code review.

Approach:
1. Add complexity detection to code review service:
   - Count files changed
   - Count lines changed
   - Detect file types (.md, .json, .yaml = simple)

2. Model selection rules:
   - Low complexity: Haiku (files ≤ 5, lines ≤ 100, docs only)
   - Medium complexity: Sonnet (files ≤ 20, lines ≤ 500)
   - High complexity: Sonnet (files > 20, lines > 500, security files)

3. Implementation:
   - New function: `select_model(complexity_score)`
   - Update review routine to call function
   - Add logging: `model_selected: {model}, reason: {reason}`

Writing code now...
```

**[Tool call: file.write "model-selection.ts"]**

**Mike:**
```
Code written. Running tests...

[Tool call: test_run]
Tests passed: 12/12

Deploying to staging for validation.

[Tool call: deploy_staging]
Deployed successfully.

Elena — can you test a few code reviews with the new logic?
```

**Elena (Tech Lead):**
```
Testing model selection:

Test 1: Simple README change (1 file, 15 lines)
- Model selected: Haiku ✅
- Reason: Low complexity (docs only)
- Cost: $0.01 (vs $0.08 with Sonnet)

Test 2: Medium PR (8 files, 200 lines)
- Model selected: Sonnet ✅
- Reason: Medium complexity (code files)
- Cost: $0.12 (same as before)

Test 3: Large refactor (25 files, 800 lines)
- Model selected: Sonnet ✅
- Reason: High complexity (above threshold)
- Cost: $0.48 (same as before)

Results:
- Simple reviews: 87% cost reduction
- Medium reviews: No change (still need Sonnet)
- Large reviews: No change (still need Sonnet)

This is exactly what we needed. Deploying to production.
```

**Resolution:** Model selection logic deployed. Simple reviews now use Haiku (87% cost reduction for that category). Ticket marked Done.

**Actual Savings:** $28/month (exceeded $30 projection)

---

### Optimizing Routine Schedule

**Ticket #2 Thread:**

**James (DevOps):**
```
Changing daily code review to MWF schedule.

Current schedule:
```
0 9 * * *  # Daily at 9am
```

New schedule:
```
0 9 * * 1,3,5  # Mon/Wed/Fri at 9am
```

Also adding:
- Change count to routine output
- Alert if change count > 20 (backlog warning)

Updating routine configuration...
```

**[Tool call: update_routine "daily-code-review"]**

**James:**
```
Routine updated. 

Changes:
- Schedule: Daily → MWF (13 runs/month vs 30)
- Cost per run: Same ($1.73)
- Monthly cost: $52 → $22 (58% reduction)

One consideration: With fewer runs, there's more time between 
reviews. Should we add a threshold trigger? Like: Run MWF OR if 
change count > 15?

Elena — what's your preference?
```

**Elena (Tech Lead):**
```
Good idea. Let's add the threshold trigger:

Schedule: MWF at 9am OR when change count > 15

This ensures:
- Regular cadence (MWF)
- Responsiveness (trigger if backlog builds)
- No excessive runs (won't trigger daily unless very active)

Implemented yet, James?
```

**James:**
```
Adding threshold trigger now...

[Tool call: update_routine "daily-code-review"]
Added condition: OR change_count > 15

This adds a check before each scheduled run:
- If scheduled run time AND change_count > 15: Skip (will catch up next run)
- If change_count > 15 between scheduled runs: Trigger early

Updated routine deployed.
```

**Resolution:** Routine optimized with MWF schedule + threshold trigger. Ticket marked Done.

**Actual Savings:** $38/month (exceeded $35 projection)

---

## Validation

### Post-Optimization Spend Analysis

**Two weeks after optimizations, Copilot reports:**

```
ℹ️  INFO  •  COST

Monthly spend rate stabilized at $280/month (38% reduction).

Cost breakdown (last 30 days):
- Anthropic: $168 (60% of total, down from 68%)
- OpenAI: $67 (24% of total, up from 22%)
- Ollama: $45 (16% of total, up from 10%)

Top changes:
- Model selection logic: -$28/month
- Routine optimization: -$38/month
- Inactive repo exclusion: -$22/month
- Query optimization: -$15/month

Budget status:
- Previous: $450/month (150% of $300 budget)
- Current: $280/month (93% of $300 budget)
- Projection: Sustainable within budget

Productivity impact: 94% of baseline (minimal reduction).
```

---

### Productivity Validation

**Operator Action:** Verify that productivity hasn't significantly dropped.

```
Ctrl+K → "Compare tickets completed before and after cost optimization"
```

**Agentic Loop Response:**

```
[Plan]
I'll query ticket completion data for pre-optimization (30 days ago) 
and post-optimization (last 30 days) to compare productivity.

[Tool call]
query_tickets({
  status: "done",
  date_range: ["2026-04-01 to 2026-04-30", "2026-05-01 to 2026-05-30"],
  aggregate: "count"
})

[Tool result]
Pre-optimization: 47 tickets completed (30 days)
Post-optimization: 44 tickets completed (30 days)

[Answer]
Productivity comparison:
- Pre-optimization: 1.57 tickets/day average
- Post-optimization: 1.47 tickets/day average
- Reduction: 6% (within acceptable range)

Quality check:
- Ticket re-open rate: 4% both periods (no change)
- Blocking tickets: 1 both periods (no change)
- Customer satisfaction: No complaints

Conclusion: Cost optimizations reduced spend by 38% with only 6% 
productivity reduction. This is a favorable trade-off.

Recommendation: Monitor for another 30 days. If productivity drops 
below 85% of baseline, reconsider routine schedule or model selection 
thresholds.
```

---

## Ongoing Cost Management

### Setting Up Budget Governance

**Operator Action:** Configure budget policies to prevent future overruns.

**Navigate to:** Autonomy → Budgets

```
┌─────────────────────────────────────────────────────────────────────┐
│ Budget Configuration                                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ COMPANY BUDGET                                                       │
│ Limit: $300.00/month                                               │
│ Warning threshold: 80% ($240.00)                                   │
│ Hard stop: Enabled                                                  │
│ Approval required: Enabled (when hard stop hit)                    │
│                                                                     │
│ Status: ✅ Healthy (currently at $280/month, 93% of limit)        │
│                                                                     │
│ EMPLOYEE BUDGETS (optional — for granular control)                 │
│ [+ Add Employee Budget]                                             │
│                                                                     │
│ RUNTIME BUDGETS (optional — for expensive runtimes)                 │
│ [+ Add Runtime Budget]                                              │
│                                                                     │
│ ROUTINE BUDGETS (optional — for recurring automation)                │
│ [+ Add Routine Budget]                                              │
│                                                                     │
│ [Save Configuration]                     [View Ledger]               │
└─────────────────────────────────────────────────────────────────────┘
```

**Operator saves budget configuration.**

**Result:** 
- Warning alert at $240 spend
- Hard stop at $300 spend
- Approval required to exceed limit

---

### Copilot Cost Monitoring

**Copilot settings for ongoing cost awareness:**

**Navigate to:** Settings → Runtime → Copilot

```
Category Weights:
- Operational: 7 (default)
- Cost: 9 (increased from 7 — more cost insights)
- Org: 5 (default)
- Workflow: 5 (default)
- Anomaly: 8 (default)

Interval: 10 minutes (increased from 5 — less frequent, still fresh)

Reasoning: Increased Cost weight ensures cost anomalies surface 
quickly. Longer interval reduces Copilot's own token cost.
```

---

## Key Takeaways

### 1. Copilot is Your Cost Canaries

Copilot surfaced the budget exhaustion risk 8 days before crisis point, enabling proactive intervention. Without Copilot, the overrun would have been discovered only when the hard stop triggered.

### 2. Model Selection Has High ROI

Implementing simple logic to choose Haiku vs. Sonnet based on complexity saved $28/month with minimal productivity impact. The key insight: not all tasks need premium models.

### 3. Routines Are Hidden Cost Drivers

Recurring automation is convenient but expensive. The daily code review routine ran 30 times/month but provided diminishing returns. Reducing to MWF with threshold triggers saved $38/month.

### 4. Budget Governance Prevents Future Overruns

Setting budget limits with warning thresholds and hard stops ensures spend stays within bounds. The approval workflow provides an escape hatch for exceptional circumstances.

### 5. Monitor Productivity Alongside Cost

Cost optimization shouldn't sacrifice productivity. Measuring ticket completion before/after optimizations ensured the 6% reduction was acceptable. If productivity had dropped >15%, we would have adjusted.

---

## Related Documentation

- [Copilot: Proactive Intelligence](../comprehensive-user-guide.md#12-copilot-proactive-intelligence) — Cost insights and monitoring
- [Autonomy → Budgets](../comprehensive-user-guide.md#13-autonomy-control-plane) — Budget governance
- [Telemetry & Costs](../comprehensive-user-guide.md#16-telemetry--costs) — Cost analysis
- [Routines](../comprehensive-user-guide.md#13-autonomy-control-plane) — Recurring automation

---

*Scenario: Cost Optimization Playbook — Draft v1.0*

**Next Scenarios:**
- [Failure Recovery Workflows](./03-failure-recovery-workflows.md)
- [Cross-Functional Collaboration](./04-cross-functional-collaboration.md)
- [Autonomous Routine Governance](./05-autonomous-routine-governance.md)
