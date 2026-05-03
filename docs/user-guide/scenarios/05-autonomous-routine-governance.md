# Scenario: Autonomous Routine Governance

**Status:** Draft | **Last Updated:** 2026-05-03 | **Version:** 1.0

---

## Executive Summary

This scenario demonstrates safely managing recurring automation routines in Team-X. Routines provide powerful automation but require careful governance to prevent cost overruns, unexpected behavior, and operational issues.

**Scenario Context:** A workspace has 5 active routines running at various frequencies. The operator wants to add a new high-frequency routine while ensuring safe governance.

**Governance Outcome:** New routine deployed with budget cap, approval gates, artifact tracking, and monitoring. Zero incidents in first 30 days.

**Learning Objectives:**
- Creating routines with appropriate schedules
- Setting budget caps and approval workflows
- Monitoring routine execution and artifacts
- Troubleshooting routine issues
- Governing routine changes and deprecation

---

## Table of Contents

1. [The Routine Ecosystem](#the-routine-ecosystem)
2. [Creating a New Routine](#creating-a-new-routine)
3. [Routine Governance](#routine-governance)
4. [Monitoring and Troubleshooting](#monitoring-and-troubleshooting)
5. [Routine Lifecycle Management](#routine-lifecycle-management)
6. [Key Takeaways](#key-takeaways)
7. [Related Documentation](#related-documentation)

---

## The Routine Ecosystem

### Current Routines

**Workspace State (5 active routines):**

| Routine | Schedule | Monthly Cost | Owner | Status |
|---------|----------|-------------|-------|--------|
| Daily code review | MWF 9am | $22 | Elena | Active ✅ |
| Nightly data sync | Daily 2am | $38 | James | Active ✅ |
| Weekly summary | Mon 9am | $12 | Alex | Active ✅ |
| Hourly health check | Hourly | $28 | James | Active ✅ |
| Cost anomaly scan | Every 6h | $15 | Auto | Active ✅ |

**Total Monthly Spend:** $115 (38% of $300 budget)

---

### New Routine Request

**Operator Goal:** Add "Security vulnerability scan" routine

**Requirements:**
- **Frequency:** Daily at 3am (off-peak)
- **Function:** Scan dependencies for known vulnerabilities, create tickets if found
- **Scope:** All repos in workspace (15 repos)
- **Cost Target:** <$20/month

---

## Creating a New Routine

### Step 1: Define Routine Template

**Navigate to:** Autonomy → Routines → Create Routine

**Configuration:**

```
Name: Security Vulnerability Scanner

Schedule:
- Cron: 0 3 * * * (daily at 3am)
- Timezone: America/Los_Angeles

Work Template:
Title: Scan {repos_count} repos for security vulnerabilities (auto-generated)

Description:
Run dependency security scan on all monitored repositories.

For each vulnerability found:
- If CRITICAL or HIGH: Create ticket, assign to repo owner
- If MEDIUM or LOW: Create weekly summary ticket

Tools:
- npm audit (for Node.js repos)
- cargo audit (for Rust repos)
- pip-audit (for Python repos)
- Custom scanner for other repos

Assignee: Auto-detect from repo metadata
Priority: Auto-set based on severity (CRITICAL → Critical)

Budget Cap: $20/month
Approval Required: Yes (if budget exceeded)
```

---

### Step 2: Configure Governance

**Budget Configuration:**

```
Routine Budget: security-vulnerability-scan

Monthly Limit: $20.00
Warning Threshold: 80% ($16.00)
Hard Stop: Enabled
Approval Required: Enabled (for overrides)

Projected Cost per Execution: ~$0.65
Executions per Month: ~30 (daily)
Projected Monthly Total: ~$19.50
```

**Approval Workflow:**

```
Approval Gate: Write-side agentic action

When routine creates tickets, confirmation required:
- Shows number of vulnerabilities found
- Shows estimated cost to create tickets
- Operator approves/denies ticket creation

Rationale: Prevents ticket spam if scanner malfunctions.
```

---

### Step 3: Validate and Enable

**Operator Action:** Run benchmark before enabling.

**Navigate to:** Autonomy → Benchmarks → Run Benchmarks

**Select:** "Routine Execution" scenario

**Benchmark Results:**

```
✅ Routine Execution          PASS (2.1s)

• 5 repos scanned (sample of 15)
• Vulnerabilities found: 3 (1 HIGH, 2 MEDIUM)
• Tickets created: 2 (for HIGH severity)
• Artifacts: 2 tickets + 1 summary report
• Budget consumed: $0.65 (within execution cap)

VALIDATION: Routine executed as expected. Safe to enable.
```

**Operator Action:** Enable routine

```
Navigate to: Autonomy → Routines → security-vulnerability-scan

[Enable Routine]

Routine enabled. Next execution: Today at 3am.
```

---

## Routine Governance

### Budget Monitoring

**Copilot Cost Insight (Day 15):**

```
ℹ️  INFO  •  COST

Routine "security-vulnerability-scan" spend tracking:

Projected monthly spend: $18.50 (within $20 budget)
Execution count: 23 (23 of ~30 expected)
Cost per execution: $0.80 (slightly above $0.65 estimate)

Reason for variance: Larger repos in scan increased token usage.

Status: ✅ Within budget
Recommendation: Monitor for remaining 15 days. If trending high, 
consider reducing scope or increasing budget.
```

---

### Artifact Tracking

**Navigate to:** Autonomy → Artifacts

**Routine Artifacts:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ security-vulnerability-scan Artifacts                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ [2026-05-15] vulnerability-report-weekly.pdf                           │
│    Type: Report    Size: 147 KB                                     │
│    Created: Routine execution                                       │
│    Ticket context: None (summary report)                            │
│                                                                     │
│ [2026-05-18] ticket-78-vulnerability-fix.md                             │
│    Type: Evidence    Size: 2 KB                                     │
│    Created: Routine execution                                       │
│    Ticket context: #78 (Fix npm audit warnings)                      │
│    Generated by: Security scanner                                   │
│                                                                     │
│ [2026-05-18] ticket-79-cve-2023-2345.md                               │
│    Type: Evidence    Size: 3 KB                                     │
│    Created: Routine execution                                       │
│    Ticket context: #79 (Update lodash dependency)                   │
│    Generated by: Security scanner                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Monitoring and Troubleshooting

### Issue: Routine Missed Execution

**Detection:** Copilot alert

```
⚠️  WARNING  •  OPERATIONAL

Routine "security-vulnerability-scan" missed scheduled execution.

Expected: Daily at 3:00am
Last execution: 2 days ago
Possible cause: Scheduler paused or error during execution

[View Routine Logs]           [Trigger Manual Run]
```

**Troubleshooting:**

**Operator Action:** View routine logs

**Navigate to:** Autonomy → Routines → security-vulnerability-scan → View Logs

**Log Analysis:**

```
[2026-05-17 03:00:00] Routine started
[2026-05-17 03:00:05] Scanning repo: frontend-app (npm audit)
[2026-05-17 03:00:12] Error: npm audit failed (network timeout)
[2026-05-17 03:00:13] Routine aborted due to error

Root cause: Network timeout connecting to npm registry during scan.
```

**Resolution:**

**Operator Action:**

1. **Adjust routine:** Add error tolerance
   ```
   Navigate to: Autonomy → Routines → security-vulnerability-scan → Edit
   
   Add error handling:
   "If any repo scan fails, continue with other repos. Log failed 
    repos for manual retry."
   ```

2. **Trigger manual run:** Click "Trigger Manual Run" in Copilot insight

3. **Verify:** Routine completes successfully

**Preventive Measure:** Create ticket for network resilience
```
Title: Add retry logic to security scanner routine

Description:
Routine failed due to network timeout. Add retry logic:
- First attempt: Immediate
- Retry 1: 1 minute delay (for transient issues)
- Retry 2: 5 minute delay (for persistent issues)
- Max retries: 2

Assignee: Mike (Backend Engineer)
```

---

### Issue: Ticket Approval Fatigue

**Detection:** Approval queue backlog

**Approvals Panel:**

```
Approvals (8 pending)

Routine: security-vulnerability-scan
Triggered: MEDIUM severity tickets auto-generated

[Review]  [Approve All]  [Deny All]
```

**Issue:** Routine creates many low-severity tickets, overwhelming approval queue.

**Resolution:**

**Operator Action:** Adjust routine configuration

```
Navigate to: Autonomy → Routines → security-vulnerability-scan → Edit

Modify severity filtering:
- CRITICAL: Auto-create ticket ✅
- HIGH: Auto-create ticket ✅
- MEDIUM: Create weekly summary (not per-ticket) ✅
- LOW: Log only, no ticket ✅

Rationale: Reduces noise, focuses on critical issues.
```

**Result:** Approval queue backlog reduced by 70%.

---

## Routine Lifecycle Management

### Routine Deprecation

**Scenario:** Nightly data sync routine no longer needed (replaced by real-time sync)

**Operator Action:** Deprecate routine

```
Navigate to: Autonomy → Routines → nightly-data-sync

Actions:
1. Add deprecation notice to routine output
2. Reduce frequency to weekly (reduce cost while evaluating)
3. Monitor for 1 week
4. If no issues, disable routine
```

**Deprecation Process:**

```
Step 1: Add notice (routine still runs)
[2026-05-20 02:00:00] ⚠️  DEPRECATED: This routine is being evaluated 
for replacement. Please contact ops if you depend on this data.

Step 2: Reduce frequency (Day 7)
Schedule changed: Daily → Weekly
Cost impact: $38 → $5/month

Step 3: Disable (Day 14)
[2026-05-27] Routine disabled. No issues reported during 7-day 
evaluation. Real-time sync has replaced this function.

Step 4: Delete (Day 21)
Routine deleted after 30-day grace period.
```

---

## Key Takeaways

### 1. Routines Require Upfront Governance

Setting budget caps, approval gates, and artifact tracking BEFORE enabling a routine prevents surprises. The validation run (benchmark) confirmed safe behavior before production.

### 2. Copilot Monitors Routine Health

Copilot surfaced the missed execution and approval backlog before they became critical. Routine-specific insights (budget tracking, execution counts) enabled proactive optimization.

### 3. Artifacts Provide Audit Evidence

Every routine execution produces artifacts (tickets created, reports generated). This audit trail is essential for compliance and troubleshooting.

### 4. Approval Gates Prevent Spam

The ticket approval workflow prevented the routine from creating hundreds of low-value tickets. Adjusting severity filtering based on operator feedback optimized the workflow.

### 5. Lifecycle Management Includes Deprecation

Routines that outlive their usefulness should be deprecated gracefully, not deleted immediately. The phased approach (notice → reduce → disable → delete) allows users to adapt.

---

## Related Documentation

- [Autonomy → Routines](../comprehensive-user-guide.md#13-autonomy-control-plane) — Routine configuration
- [Autonomy → Budgets](../comprehensive-user-guide.md#13-autonomy-control-plane) — Budget governance
- [Autonomy → Approvals](../comprehensive-user-guide.md#13-autonomy-control-plane) — Approval workflows
- [Autonomy → Artifacts](../comprehensive-user-guide.md#13-autonomy-control-plane) — Artifact tracking

---

*Scenario: Autonomous Routine Governance — Draft v1.0*
