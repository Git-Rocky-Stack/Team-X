# Scenario: Failure Recovery Workflows

**Status:** Draft | **Last Updated:** 2026-05-03 | **Version:** 1.0

---

## Executive Summary

This scenario demonstrates diagnosing and resolving runtime failures in Team-X. Despite robust governance, failures occur: providers disconnect, external runtimes crash, routines stall, and data pipelines clog. This playbook shows how to identify root causes, execute recovery procedures, and implement preventive measures.

**Scenario Context:** A workspace running 12 employees experiences cascading failures during a heavy workload period. Multiple agentic loops stall, routines stop creating work, and Copilot surfaces critical operational insights.

**Recovery Outcome:** Full service restored in 47 minutes, with preventive measures implemented to reduce recurrence risk by 80%.

**Learning Objectives:**
- Using Copilot and Doctor to detect and classify failures
- Executing recovery procedures for different failure types
- Analyzing root causes to prevent recurrence
- Implementing the Agent Self-Improvement Loop
- Documenting failures for team knowledge

---

## Table of Contents

1. [Incident Detection](#incident-detection)
2. [Incident Classification](#incident-classification)
3. [Recovery Execution](#recovery-execution)
4. [Root Cause Analysis](#root-cause-analysis)
5. [Preventive Measures](#preventive-measures)
6. [Post-Incident Review](#post-incident-review)
7. [Key Takeaways](#key-takeaways)
8. [Related Documentation](#related-documentation)

---

## Incident Detection

### The Trigger: Copilot Critical Alert

**Copilot surfaces multiple critical insights simultaneously:**

```
🔴 CRITICAL  •  OPERATIONAL

3 runtime execution failed events in last 10 minutes.

External runtimes disconnected:
- bash-runtime-mike (connection refused)
- bash-runtime-priya (timeout)

Affected employees: Mike, Priya

[View Runtime Status]               [Dismiss]

---

🔴 CRITICAL  •  OPERATIONAL

7 agentic loops in "running" state > 30 minutes.

Possible hang or slow provider response.

Loops affected:
- Ticket #47 (Code review)
- Ticket #52 (Data analysis)
- Ticket #55 (Architecture planning)

[View Stuck Loops]                   [Dismiss]

---

🔴 CRITICAL  •  OPERATIONAL

Routine "daily-code-review" failed execution.

Error: budget_exhausted
Routine paused pending resolution.

[View Routine Status]                 [Dismiss]
```

**Operator recognizes:** Cascading failure incident. Multiple systems affected simultaneously.

---

### First Response: Run Doctor

**Operator Action:** Immediately run Autonomy Doctor for system-wide health check.

**Navigate to:** Autonomy → Doctor → Run Doctor

**Doctor Report:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ Doctor Report — Incident Detection                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ✅ Database integrity           PASS                                │
│ ✅ Recovery readiness          PASS (backup: 1 hour ago)            │
│ ⚠️  Runtime posture             WARNING                             │
│    2 external runtimes unreachable:                               │
│    • bash-runtime-mike (connection refused)                        │
│    • bash-runtime-priya (timeout)                                 │
│                                                                     │
│ ✅ Secrets                     PASS                                │
│ ✅ Provider health             PARTIAL                              │
│    Anthropic: Connected ✅                                         │
│    OpenAI: Degraded (slow response) ⚠️                          │
│    Ollama: Connected ✅                                            │
│                                                                     │
│ ❌ MCP health                   FAIL                                │
│    1 of 3 MCP servers timeout:                                     │
│    • database-query (connection pool exhausted)                    │
│                                                                     │
│ ⚠️  Budget blockers             WARNING                             │
│    Routine "daily-code-review" exhausted budget                    │
│                                                                     │
│─────────────────────────────────────────────────────────────────────│
│                                                                     │
│ OVERALL: CRITICAL (1 fail, 2 warnings)                              │
│                                                                     │
│ IMMEDIATE ACTIONS REQUIRED:                                         │
│ 1. Fix MCP server (database-query connection pool)                 │
│ 2. Restart external runtimes (Mike, Priya)                         │
│ 3. Resolve routine budget exhaustion                                │
│ 4. Monitor for stuck loops (may auto-recover with provider fix)    │
│                                                                     │
│ [Copy Report]               [Re-run Doctor]   [Go to Runtimes]     │
└─────────────────────────────────────────────────────────────────────┘
```

**Operator triage:** 
1. Address stuck loops (may auto-recover)
2. Fix MCP server
3. Restart runtimes
4. Resolve routine budget

---

## Incident Classification

### Failure Types Identified

Based on Doctor report and Copilot insights:

| Failure | Severity | Impact | Owner |
|---------|----------|--------|-------|
| **Stuck agentic loops** | Critical | 7 loops hanging, tickets blocked | Provider health |
| **External runtime disconnection** | Critical | Mike, Priya cannot work | Runtime restart |
| **MCP connection pool exhaustion** | High | Database queries failing | James (DevOps) |
| **Routine budget exhaustion** | Medium | Routine paused | Budget approval |
| **OpenAI degraded** | Medium | Slow responses, timeouts | Provider monitoring |

---

### Dependency Map

**Operator creates mental model of dependencies:**

```
Stuck Loops (7) ← caused by → OpenAI degraded (slow response)
                ↓
            Runtimes Down ← caused by → External process crashes
                ↓
         MCP Failure ← caused by → Connection pool exhaustion
                ↓
     Routine Budget ← caused by → Routine retries during failure
```

**Recovery Order (dependencies considered):**
1. Fix MCP failure (unblocks queries)
2. Restart external runtimes (restores Mike, Priya)
3. Wait for stuck loops to clear (provider-dependent)
4. Resolve routine budget (post-incident)

---

## Recovery Execution

### Step 1: Fix MCP Connection Pool

**Owner:** James (DevOps)

**Diagnosis (via Copilot):**
```
ℹ️  INFO  •  WORKFLOW

MCP server "database-query" connection pool exhausted.

Root cause: Max connections set to 5, but routine runs created 
8 concurrent queries during retry storms.

Recommendation: Increase pool size or reduce routine concurrency.
```

**Recovery Action:**

**James (DevOps):**
```
Fixing MCP connection pool issue.

Immediate action: Increase connection pool from 5 to 20.
Long-term: Add connection pooling logic with proper cleanup.

[Tool call: edit_file "database-query/config.json"]
Updated: max_connections: 20

Restarting MCP server...
[Tool call: restart_mcp "database-query"]
MCP server restarted successfully.

Verifying connection...
[Tool call: test_connection "database-query"]
Connection pool: 20/20 available ✅
Health check: PASS ✅

Issue resolved. Database queries unblocked.
```

**Result:** MCP failure resolved. Database queries flowing again.

---

### Step 2: Restart External Runtimes

**Owner:** James (DevOps) with Mike, Priya affected

**Recovery Action:**

**James (DevOps):**
```
Restarting external runtimes for Mike and Priya.

Affected runtimes:
- bash-runtime-mike: Process crashed (OOM)
- bash-runtime-priya: Timeout (hung process)

Actions:
1. Kill existing runtime processes
2. Clear workspace temp files
3. Restart runtimes with memory limits
4. Verify heartbeat

Executing...
```

**[Tool call: restart_runtime "bash-runtime-mike"]**

**James:**
```
Runtime bash-runtime-mike restarted.

Changes applied:
- Memory limit: 2GB → 4GB (prevent OOM)
- Heartbeat interval: 30s → 15s (faster detection)
- Restart policy: added (auto-restart on crash)

Status: HEARTBEAT_DETECTED ✅

Mike — your runtime is back online. You should receive work again.
```

**[Tool call: restart_runtime "bash-runtime-priya"]**

**James:**
```
Runtime bash-runtime-priya restarted.

Root cause: Hung process (likely waiting on database which was failing).

Changes applied:
- Memory limit: 1GB → 2GB
- Timeout: 5min → 2min (fail faster)
- Added health check endpoint

Status: HEARTBEAT_DETECTED ✅

Priya — your runtime is back online.
```

**Result:** Both external runtimes restored. Mike and Priya can receive work again.

---

### Step 3: Monitor Stuck Loops

**Operator Action:** Check agentic loop status.

**Navigate to:** Mission Control → Agent Runs Panel

**Observation:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ Agent Runs — Active Runs                                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Active Runs: 3 (down from 7)                                      │
│                                                                     │
│ ✅ Ticket #47 - Elena (Tech Lead)                                  │
│    Status: Completing...                                            │
│    Duration: 34 min (was stuck)                                     │
│    Provider: OpenAI (degraded, but responding)                      │
│                                                                     │
│ ✅ Ticket #52 - Alex (Product Manager)                              │
│    Status: Completing...                                            │
│    Duration: 41 min (was stuck)                                     │
│    Provider: Anthropic (healthy)                                    │
│                                                                     │
│ ⚠️  Ticket #55 - Elena (Tech Lead)                                  │
│    Status: Still running, 52 min                                   │
│    Provider: OpenAI (still degraded)                                │
│                                                                     │
│ Recent Completions:                                                 │
│ ✅ Ticket #50 - Completed successfully                              │
│ ✅ Ticket #53 - Completed successfully                              │
│                                                                     │
│ [Ticket #55 Details]             [Cancel Ticket #55]                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Operator Decision:** 
- 2 loops auto-recovered (OpenAI responding again)
- 1 loop still stuck (Ticket #55) — cancel and retry

**Action:** Cancel stuck loop, allow Elena to retry manually.

```
Ctrl+K → "Cancel agentic loop for ticket #55"
```

**Result:** All stuck loops cleared. System recovered.

---

### Step 4: Resolve Routine Budget Exhaustion

**Owner:** Operator (budget approval)

**Navigate to:** Autonomy → Approvals

**Approval Request:**
```
💰 BUDGET OVERRIDE

Routine: daily-code-review
Scope: Routine budget
Limit: $10.00/month
Spent: $12.47 (124% of limit)
Override request: +$5.00 to complete month

Rationale: Routine executed extra runs during failure 
(retry storms), exhausting budget.

Requested: Just now

[View Routine Logs]            [Deny]           [Approve]
```

**Operator Analysis:**

The routine exceeded budget due to retry storms during the MCP failure. This is a legitimate incident response, not routine overuse.

**Decision:** Approve override

**Operator Action:** Click "Approve"

**Result:** Routine budget increased by $5. Routine unpaused.

**Post-Incident Action:** Adjust routine budget to $15/month to account for retry scenarios.

---

## Root Cause Analysis

### Post-Incident Review Meeting

**Operator schedules:** 
```
Ctrl+K → "Call a meeting: Incident post-mortem for cascading failures"
```

**Participants:** All team members plus operator

**Meeting Minutes (generated):**
```
Incident Post-Mortem — 2026-05-03 15:47

INCIDENT SUMMARY:
- Duration: 47 minutes (14:32 - 15:19)
- Impact: 7 stuck loops, 2 runtimes down, 1 routine paused
- Root causes: 3 contributing factors

ROOT CAUSES:

1. **Primary: MCP Connection Pool Exhaustion**
   - Cause: Max connections (5) insufficient for routine retry storms
   - Contributing factor: Routine retry logic too aggressive
   - Prevention: Increase pool size, add backoff logic

2. **Secondary: External Runtime OOM**
   - Cause: bash-runtime-mike ran out of memory (2GB limit)
   - Contributing factor: Large code review exceeded memory
   - Prevention: Increase memory limit, add memory monitoring

3. **Tertiary: OpenAI Degradation**
   - Cause: Provider slow response (external, no control)
   - Impact: Stuck loops waiting for API responses
   - Mitigation: Provider diversification (Anthropic as backup)

ACTION ITEMS:

1. James (DevOps):
   ✅ Increase MCP connection pool to 20 (DONE)
   ⏳ Add connection backoff logic to routines
   ⏳ Add runtime memory monitoring

2. Elena (Tech Lead):
   ⏳ Implement timeout logic for agentic loops
   ⏳ Add provider failover for critical work

3. Operator:
   ✅ Approve routine budget increase (DONE)
   ⏳ Run Improvement Loop to create preventive tickets
   ⏳ Document incident in knowledge base

LESSONS LEARNED:
- Single points of failure (MCP, runtimes) cause cascading issues
- Monitoring (Copilot, Doctor) enabled fast detection
- Budget gates prevent runaway spend during incidents
- Recovery order matters: fix dependencies first

FOLLOW-UP:
- Daily check-ins for 1 week (monitor for recurrence)
- Review preventive tickets in next standup
```

---

## Preventive Measures

### Agent Self-Improvement Loop

**Operator Action:** Run Improvement Loop to convert failures into preventive tickets.

**Navigate to:** Autonomy → Improve → Run Improvement Loop

**Results:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ Agent Self-Improvement Loop Results                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ INSPECTION RESULTS:                                                 │
│ • 3 runtime execution.failed events detected                         │
│ • 1 runtime session.stale event found                                │
│ • 1 MCP server failure (database-query)                              │
│ • 7 agentic loops with duration > 30 min (auto-recovered)          │
│                                                                     │
│ ACTIONS TAKEN:                                                       │
│ • 3 improvement tickets created (new signals)                       │
│ • 1 existing ticket found (deduped)                                 │
│                                                                     │
│ NEW TICKETS CREATED:                                                 │
│ 1. #61: Add connection backoff logic to routines                    │
│    (Label: agent-improvement, self-improvement, reliability)       │
│                                                                     │
│ 2. #62: Implement memory monitoring for external runtimes           │
│    (Label: agent-improvement, self-improvement, reliability)       │
│                                                                     │
│ 3. #63: Add provider failover for critical agentic loops             │
│    (Label: agent-improvement, self-improvement, reliability)       │
│                                                                     │
│ RECOMMENDATIONS:                                                    │
│ • Address new tickets to prevent recurrence                          │
│ • Review routine retry logic (reduce storm risk)                     │
│ • Monitor MCP connection pool usage (Copilot alert at 80%)         │
│                                                                     │
│ [View Tickets]             [Run Again]          [Export Report]  │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Preventive Tickets

**Ticket #61: Add Connection Backoff Logic to Routines**

**Assignee:** Mike (Backend Engineer)

**Description:**
```
During the incident, routines created retry storms when the MCP 
server failed, exhausting the connection pool.

Preventive measure: Implement exponential backoff for routine 
retries:
- First retry: 1 second delay
- Second retry: 2 second delay
- Third retry: 4 second delay
- Max retries: 3

Also add jitter (random ±20%) to prevent thundering herd.

Deliverable:
- Backoff implementation
- Unit tests for retry logic
- Documentation for routine developers
```

---

**Ticket #62: Implement Memory Monitoring for External Runtimes**

**Assignee:** James (DevOps)

**Description:**
```
The bash-runtime-mike OOM was preventable with memory monitoring.

Preventive measure: Add memory usage tracking to external runtimes:
- Log memory usage every 30 seconds
- Alert at 80% memory limit
- Alert at 90% memory limit (critical)
- Auto-restart at 95% memory limit

Deliverable:
- Memory monitoring script
- CloudWatch alarms (if applicable)
- Runtime health dashboard
```

---

**Ticket #63: Add Provider Failover for Critical Agentic Loops**

**Assignee:** Elena (Tech Lead)

**Description:**
```
OpenAI degradation caused stuck loops waiting for API responses.

Preventive measure: Implement provider failover for critical work:
- Primary provider: OpenAI
- Backup provider: Anthropic
- Failover trigger: Timeout > 2 min OR error rate > 10%
- Auto-switch back: When primary healthy

Deliverable:
- Provider abstraction layer
- Failover logic
- Logging for provider switches
- Testing procedures
```

---

## Post-Incident Review

### Week 1 Monitoring

**Copilot status (1 week later):**

```
ℹ️  INFO  •  OPERATIONAL

No critical incidents in past 7 days.

Preventive tickets status:
- #61 (Connection backoff): Completed ✅
- #62 (Memory monitoring): In progress 🔄
- #63 (Provider failover): Completed ✅

System health:
- Stuck loops: 0 (baseline: 0-2 per week)
- Runtime failures: 0 (baseline: 1-2 per week)
- Routine failures: 0 (baseline: 1 per week)
- MCP failures: 0 (baseline: 1 per week)

Recommendation: Continue monitoring. Incidents reduced by 80% 
vs. pre-preventive measures.
```

---

## Key Takeaways

### 1. Doctor is Your First Responder

Running Doctor immediately upon detecting critical Copilot insights provides a system-wide health check in seconds. The report prioritizes actions and identifies dependencies.

### 2. Recovery Order Depends on Dependencies

The dependency map (stuck loops ← runtimes ← MCP) dictated recovery order. Fixing the MCP server first unblocked runtimes, which unblocked employees.

### 3. Improvement Loop Converts Failures into Tickets

The Agent Self-Improvement Loop automatically created 3 preventive tickets based on failure patterns. This prevents manual gap analysis and ensures nothing is forgotten.

### 4. Budget Gates Protect Against Runaway Spend

Even during incidents, the budget hard stop prevented the routine from continuing to burn money. The approval workflow provided a controlled override.

### 5. Document Everything for Team Knowledge

Post-mortem meetings, ticket threads, and Copilot insights create a rich audit trail. Future operators can search incidents and learn from past recoveries.

---

## Related Documentation

- [Copilot: Proactive Intelligence](../comprehensive-user-guide.md#12-copilot-proactive-intelligence) — Critical insights
- [Autonomy → Doctor](../comprehensive-user-guide.md#13-autonomy-control-plane) — Health checks
- [Autonomy → Improve](../comprehensive-user-guide.md#13-autonomy-control-plane) — Self-improvement loop
- [Autonomy → Runtimes](../comprehensive-user-guide.md#13-autonomy-control-plane) — Runtime profiles
- [Autonomy → Approvals](../comprehensive-user-guide.md#13-autonomy-control-plane) — Budget overrides

---

*Scenario: Failure Recovery Workflows — Draft v1.0*

**Next Scenarios:**
- [Cross-Functional Collaboration](./04-cross-functional-collaboration.md)
- [Autonomous Routine Governance](./05-autonomous-routine-governance.md)
- [Multi-Workspace Operations](./06-multi-workspace-operations.md)
- [Shift Handoff Playbook](./07-shift-handoff-playbook.md)
