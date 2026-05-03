# Operational Handoff Document Template

**Use this template when handing off operational responsibility to a backup operator.**

---

# Operational Handoff — [Operator Name] to [Backup Operator Name]
**Dates:** [Start Date] - [End Date] ([Duration])
**Prepared by:** [Operator Name]
**Prepared for:** [Backup Operator Name]

---

## 1. Workspace Overview

### Active Workspaces

| Workspace | Purpose | Monthly Budget | Key Contacts | Current Status |
|-----------|---------|--------------|--------------|---------------|
| [Workspace 1] | [Purpose] | [$XXX] | [Contact] | [Healthy/Issues] |
| [Workspace 2] | [Purpose] | [$XXX] | [Contact] | [Healthy/Issues] |
| [Workspace 3] | [Purpose] | [$XXX] | [Contact] | [Healthy/Issues] |

### Employee Count

| Workspace | Total | Active | Idle | Notes |
|-----------|-------|--------|------|-------|
| [Workspace 1] | [#] | [#] | [#] | [Notes] |
| [Workspace 2] | [#] | [#] | [#] | [Notes] |
| [Workspace 3] | [#] | [#] | [#] | [Notes] |

### Routines Summary

| Routine | Schedule | Last Execution | Status | Notes |
|---------|----------|----------------|--------|-------|
| [Routine 1] | [Schedule] | [Date/Time] | [Status] | [Notes] |
| [Routine 2] | [Schedule] | [Date/Time] | [Status] | [Notes] |
| [Routine 3] | [Schedule] | [Date/Time] | [Status] | [Notes] |

---

## 2. Active Issues

### Critical (Requires Immediate Attention)

**Ticket #[Number]: [Ticket Title]**
- **Workspace:** [Workspace Name]
- **Assigned to:** [Employee Name]
- **Priority:** Critical
- **Description:** [Issue description]
- **Status:** [In Progress / Open]
- **Next Action:** [What needs to be done]
- **Fallback:** [Escalation contact if needed]

### Important (Monitor Daily)

**Ticket #[Number]: [Ticket Title]**
- **Workspace:** [Workspace Name]
- **Assigned to:** [Employee Name]
- **Priority:** High
- **Description:** [Issue description]
- **Status:** [In Progress / Open]
- **Action:** [Required action]

### Optional (Can Defer)

**Ticket #[Number]: [Ticket Title]**
- **Workspace:** [Workspace Name]
- **Assigned to:** [Employee Name]
- **Priority:** Low
- **Description:** [Issue description]
- **Status:** [Open]
- **Action:** [Can defer until return]

---

## 3. Budget Status

### Current Spend (Month-to-Date)

| Workspace | Budget | Spent | Remaining | Projection |
|-----------|--------|-------|----------|-----------|
| [Workspace 1] | [$XXX] | [$XXX] | [$XXX] | [On track / At risk] |
| [Workspace 2] | [$XXX] | [$XXX] | [$XXX] | [On track / At risk] |
| [Workspace 3] | [$XXX] | [$XXX] | [$XXX] | [On track / At risk] |
| **TOTAL** | **[$XXX]** | **[$XXX]** | **[$XXX]** | **[Overall status]** |

### Budget Approvals

**Approval Authority:** [Backup Operator Name] has approval authority for:
- Budget overrides up to [$XXX]
- Routine changes (non-breaking)
- Employee hiring/firing (consult operator first)

**Requires Operator Approval:**
- Budget overrides over [$XXX]
- Routine breaking changes
- Employee termination

---

## 4. Copilot Insights Review

### Recent Insights (Last 7 Days)

```
Critical Insights: [#]
Warning Insights: [#]
Info Insights: [#]

Critical Details:
- [List any critical insights]

Warning Details:
- [List any warning insights]

Info Details:
- [List any info insights]
```

**Action:** [Required actions based on insights]

---

## 5. Contacts and Escalation

### Primary Contact ([Operator Name])

- **Availability:** [Response time expectations]
- **Response Time:** [< X hours for urgent matters]
- **Emergency Contact:** [Phone number for true emergencies]

### Secondary Contacts (By Workspace)

**[Workspace 1]:**
- [Contact Name]: [Role / Responsibility]
- [Contact Name]: [Role / Responsibility]

**[Workspace 2]:**
- [Contact Name]: [Role / Responsibility]
- [Contact Name]: [Role / Responsibility]

### External Support

**Provider Issues:**
- Anthropic Support: [Contact information]
- OpenAI Support: [Contact information]
- Ollama Support: [Self-hosted, no external support]

---

## 6. Known Issues and Workarounds

### Issue: [Issue Title]

**Status:** [Known / Monitoring / Deferred]
**Impact:** [High / Medium / Low]
**Workaround:** [Workaround description]
**Ticket:** #[Number] (if applicable)

---

## 7. Decision Log

### Decisions Requiring [Backup Operator Name] Judgment

**Scenario:** [Describe decision scenario]

**Decision Framework:**
1. [Condition 1] → [Action]
2. [Condition 2] → [Action]
3. [Condition 3] → [Consult operator]

**Rationale:** [Why this framework exists]

---

## 8. Quick Reference Commands

### Common Tasks

```
# Check system health
Ctrl+K → "Run Doctor"

# View all active issues
Ctrl+K → "Show me all critical and warning insights"

# Check budget status
Ctrl+K → "What's our current spend vs budget across all workspaces?"

# Monitor stuck loops
Ctrl+K → "Show agentic loops running > 30 minutes"

# View routine status
Ctrl+K → "Are all routines running normally?"
```

### Emergency Procedures

**If multiple systems failing:**
1. Run Doctor immediately
2. Check Copilot for critical insights
3. Review recent ticket threads for patterns
4. Escalate to operator if unresolved

**If budget exhausted:**
1. Check which workspace exceeded budget
2. Review routine spend for anomalies
3. Approve budget override (if < limit) or consult operator
4. Consider pausing non-critical routines

**If employee complaint:**
1. Review ticket thread for context
2. Check employee status (Mission Control)
3. Escalate to workspace lead or operator

---

## 9. Return Plan

### Reintegration Checklist

**When [Operator Name] Returns:**

- [ ] Review handoff document with [Backup Operator Name]
- [ ] Review Copilot insights from absence period
- [ ] Review Audit log for key events
- [ ] Reassign any delegated tickets
- [ ] Address deferred issues or defer further
- [ ] Debrief with [Backup Operator Name] on learnings
- [ ] Update handoff document with any new procedures

### Timeline

- [Start Date], [Time]: Handoff session
- [Start Date] - [End Date]: [Backup Operator Name] operational
- [End Date], [Time]: [Operator Name] returns, [Backup Operator Name] hands back
- [End Date], [Time]: Reintegration complete

---

## Signature

**Prepared by:** [Operator Name] (Operator)
**Reviewed by:** [Backup Operator Name] (Backup Operator)
**Date:** [Date]

**[Backup Operator Name] Acknowledgement:**
I have reviewed this handoff document, understand my responsibilities, and confirm I can perform operational duties during [Operator Name]'s absence.

**Signature:** _________________ ([Backup Operator Name])
**Date:** [Date]
