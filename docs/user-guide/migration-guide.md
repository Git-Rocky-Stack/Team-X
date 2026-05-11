# Migration Guide

**Switching to Team-X from other platforms**

---

## Overview

This guide helps you migrate from:
- Other AI workforce tools
- Project management systems (Jira, Asana, Trello)
- Freelance platforms (Upwork, Fiverr)
- Custom development workflows

We'll cover data migration, process adaptation, and team training.

---

## Table of Contents

1. [Pre-Migration Planning](#pre-migration-planning)
2. [Migrating from AI Workforce Tools](#migrating-from-ai-workforce-tools)
3. [Migrating from Project Management Systems](#migrating-from-project-management-systems)
4. [Migrating from Freelance Platforms](#migrating-from-freelance-platforms)
5. [Process Adaptation](#process-adaptation)
6. [Team Training](#team-training)
7. [Rollout Strategy](#rollout-strategy)
8. [Post-Migration](#post-migration)

---

## Pre-Migration Planning

### Migration Checklist

```
Pre-Migration Assessment:
□ Identify current tools and workflows
□ Document existing processes
□ List must-have vs. nice-to-have features
□ Identify stakeholders
□ Set migration timeline
□ Define success criteria

Data Assessment:
□ What data needs to migrate?
□ What can be archived?
□ What can be left behind?
□ Format requirements (CSV, JSON, etc.)

Resource Planning:
□ Who will lead migration?
□ Who needs training?
□ What's the budget for transition?
□ What's the rollback plan?
```

### Current State Audit

**Tool Inventory:**

| Current Tool | Purpose | Data to Migrate | Alternative |
|--------------|---------|-----------------|-------------|
| [Tool 1] | [Purpose] | [Tickets, users, etc.] | [Team-X feature] |
| [Tool 2] | [Purpose] | [Data types] | [Team-X feature] |
| [Tool 3] | [Purpose] | [Data types] | [Team-X feature] |

**Process Inventory:**

```
Current Workflows:
1. [How you assign work today]
2. [How you track progress]
3. [How you review completed work]
4. [How you handle issues]
5. [How you communicate status]

Gaps to Address:
- [Gap 1]
- [Gap 2]
- [Gap 3]
```

---

## Migrating from AI Workforce Tools

### From Similar Platforms

**Platforms:** Cognition, MultiOn, other AI agent platforms

**Migration Approach:**

**Step 1: Export Data**

```
Export from current platform:
- Employees (roles, configurations)
- Active tickets
- Ticket history
- Budget and spend data
- Custom configurations

Format: CSV or JSON (preferred)
```

**Step 2: Map to Team-X Concepts**

| Current Concept | Team-X Equivalent |
|-----------------|-------------------|
| Agents | Employees |
| Tasks | Tickets |
| Runs | Agent Runs |
| Budget | Budgets (monthly + per-ticket) |
| Workflows | Routines |

**Step 3: Import to Team-X**

```
Option A: Manual Import
- Recreate employees in Team-X
- Create tickets from export
- Configure budgets manually

Option B: API Import
- Use Team-X API to bulk import
- Write script to map fields
- Test with small batch first

Option C: Professional Services
- Contact Team-X support
- Assisted migration service
- Data validation and cleanup
```

**Step 4: Validate Migration**

```
Validation Checklist:
□ Employee count matches
□ Ticket history preserved
□ Budget data accurate
□ No data corruption
□ Links and references intact
□ Permissions correct
```

---

## Migrating from Project Management Systems

### From Jira

**Data to Migrate:**
- Issues → Tickets
- Projects → Projects (or workspaces)
- Users → Employees (manual mapping)
- Sprints → Routines (for recurring work)
- Attachments → Files

**Migration Steps:**

```
1. Export Jira issues to CSV
   Jira: Issues → Export → CSV

2. Transform to Team-X format
   - Summary → Title
   - Description → Description
   - Status → Status (map: Open→Open, In Progress→In Progress, Done→Done)
   - Priority → Priority
   - Assignee → Assignee (map user to employee)
   - Labels → Tags

3. Import via API
   POST /v1/tickets/bulk
   Body: [ticket objects]

4. Verify
   Check ticket count, status distribution
```

**Process Changes:**

| Jira | Team-X |
|------|--------|
| Manual issue creation | Natural language ticket creation |
| Manual assignment | Intelligent assignment to employees |
| Manual status updates | Auto-updates from agent runs |
| No built-in AI | AI employees execute work |

### From Asana

**Data to Migrate:**
- Tasks → Tickets
- Projects → Projects
- Subtasks → Dependencies
- Attachments → Files

**Migration Steps:**

```
1. Export Asana tasks
   Asana: Project → Export → CSV

2. Map fields
   - Task Name → Title
   - Notes → Description
   - Assignee → Assignee
   - Due Date → Due Date
   - Tags → Tags

3. Handle subtasks
   - Create dependencies in Team-X
   - Parent ticket blocked by child completion

4. Import
   Use API bulk import or manual entry
```

### From Trello

**Data to Migrate:**
- Cards → Tickets
- Lists → Status (To Do, Doing, Done)
- Labels → Tags
- Checklists → Acceptance criteria
- Attachments → Files

**Migration Steps:**

```
1. Export Trello board
   Trello: Board → Menu → Export → JSON

2. Transform data
   {
     "cards": [
       {
         "title": card.name,
         "description": card.desc,
         "status": map_list(card.idList),
         "labels": card.labels,
         "checklists": card.checklists
       }
     ]
   }

3. Import to Team-X
   - Create tickets from cards
   - Map lists to status
   - Convert checklists to acceptance criteria

4. Organize
   - Create projects for each board
   - Link related tickets
```

---

## Migrating from Freelance Platforms

### From Upwork

**Migration Considerations:**

| Upwork | Team-X |
|--------|--------|
| Hire individual freelancers | Hire AI employees (instant) |
| Per-project pricing | Subscription + usage-based |
| Human communication | AI agents + oversight |
| Variable quality | Consistent, curated roles |
| Manual coordination | Autonomous collaboration |

**Migration Steps:**

```
1. Inventory active projects
   List current freelancers and projects
   Identify what's in progress

2. Identify suitable Team-X employees
   For each freelancer type:
   - Developer → Full Stack Engineer
   - Designer → UI/UX Designer
   - Writer → Content Writer
   - Analyst → Data Analyst

3. Transition active work
   - Complete current milestone with freelancer
   - Hand off remaining work to Team-X employee
   - Archive freelancer relationship

4. Compare costs
   Calculate freelancer hourly rate × hours
   Compare to Team-X budget + spend
   - Team-X often 50-70% cheaper
```

### From Agencies

**Migration Considerations:**

| Agency | Team-X |
|--------|--------|
| Full-service team | AI employees + oversight |
| High monthly retainers | Lower fixed cost + usage |
| Communication overhead | Direct collaboration |
| Variable timeline | Parallel execution |
| Limited visibility | Full oversight via Mission Control |

**Migration Steps:**

```
1. Review agency contract
   - Notice period (typically 30 days)
   - Deliverables owed
   - Handoff requirements

2. Parallel run (optional)
   - Keep agency for critical path
   - Pilot Team-X for non-critical work
   - Compare quality and speed

3. Knowledge transfer
   - Document agency processes
   - Capture project context
   - Train Team-X employees

4. Full transition
   - Notify agency of transition
   - Migrate active work
   - Cancel agency contract
```

---

## Process Adaptation

### Workflow Changes

**Old: Manual Assignment**

```
Before:
1. Manager writes requirements
2. Assigns to team member
3. Team member asks questions
4. Manager clarifies
5. Team member completes work
6. Manager reviews
7. Revisions requested
8. Final delivery
```

**New: Autonomous Execution**

```
After:
1. Manager creates ticket with requirements
2. Assign to employee
3. Employee asks questions in ticket thread
4. Manager clarifies in thread
5. Employee completes work autonomously
6. Manager reviews deliverables
7. Revisions via ticket thread
8. Ticket marked done
```

### Communication Patterns

**Change: Less synchronous communication**

| Before | After |
|--------|-------|
| Standup meetings | Ticket status updates |
| Slack/Teams pings | Ticket thread discussions |
| Video calls for clarification | Detailed ticket descriptions |
| Email chains | Agent run artifacts |

**Adaptation Tips:**

1. **Write comprehensive tickets** — Include all context upfront
2. **Use participants** — Add relevant employees to ticket
3. **Set clear acceptance criteria** — Define what "done" looks like
4. **Review early** — Check agent progress before completion

### Quality Assurance

**Change: Built-in review processes**

| Before | After |
|--------|-------|
| Manual code reviews | Agent self-review + participant review |
| Separate QA phase | QA employee participant from start |
| Bug triage meetings | Copilot identifies issues proactively |
| Post-release fixes | Continuous testing during development |

---

## Team Training

### Training Plan

**Week 1: Orientation**

| Day | Topic | Duration | Attendees |
|-----|-------|----------|------------|
| Mon | Team-X overview & benefits | 1 hr | All |
| Tue | Quick Start walkthrough | 1 hr | All |
| Wed | Creating tickets | 1 hr | PMs, Tech leads |
| Thu | Hiring employees | 1 hr | Managers |
| Fri | Q&A practice session | 1 hr | All |

**Week 2: Hands-On**

| Day | Topic | Duration | Attendees |
|-----|-------|----------|------------|
| Mon | Ticket writing workshop | 2 hr | PMs, Tech leads |
| Tue | Employee role selection | 1 hr | Managers |
| Wed | Agent run monitoring | 1 hr | All |
| Thu | Budget management | 1 hr | Managers, Finance |
| Fri | Real ticket practice | 2 hr | All |

**Week 3: Advanced**

| Day | Topic | Duration | Attendees |
|-----|-------|----------|------------|
| Mon | Routines and automation | 1 hr | Tech leads |
| Tue | Multi-workspace operations | 1 hr | Managers |
| Wed | Shift handoff procedures | 1 hr | Operators |
| Thu | Troubleshooting common issues | 1 hr | All |
| Fri | Final Q&A | 1 hr | All |

### Training Materials

**Provide to team:**

- [ ] Quick Start Guide
- [ ] Ticket templates
- [ ] Keyboard shortcuts reference
- [ ] FAQ
- [ ] Video tutorials (if available)

**Create internal:**

- [ ] Workspace-specific processes
- [ ] Role-based guides (PM, Dev, Designer)
- [ ] Integration with existing tools
- [ ] Escalation procedures

---

## Rollout Strategy

### Option A: Big Bang

**Best for:** Small teams, simple workflows

```
Day 1: Migration
- Export/import data
- Configure workspace
- Train team

Day 2: Go-live
- All work in Team-X
- Old system archived

Week 1: Support
- Daily check-ins
- Address issues quickly
- Collect feedback
```

### Option B: Parallel

**Best for:** Large teams, complex workflows

```
Week 1-2: Pilot
- Small team uses Team-X
- Test critical workflows
- Identify issues

Week 3-4: Gradual rollout
- Add more teams
- Maintain old system for fallback
- Phase out old system

Week 5-6: Full transition
- Everyone on Team-X
- Old system read-only
- Archive old system after month
```

### Option C: Phased

**Best for:** Enterprise, risk-averse

```
Phase 1 (Month 1): Infrastructure
- Set up Team-X
- Train administrators
- Configure integrations

Phase 2 (Month 2): Pilot Team
- One team fully migrates
- Test all workflows
- Document lessons

Phase 3 (Month 3-4): Team-by-Team
- Each team migrates
- Knowledge sharing
- Support from pilot team

Phase 4 (Month 5-6): Optimization
- Fine-tune processes
- Advanced features
- Full optimization
```

---

## Post-Migration

### Success Metrics

Track these metrics for 90 days:

| Metric | Target | Measurement |
|--------|--------|-------------|
| Ticket creation time | < 2 minutes | Time from idea to ticket created |
| Agent start time | < 5 minutes | Time from assign to agent running |
| Completion time | Baseline established | Average ticket duration |
| Budget accuracy | ±20% | Estimated vs actual spend |
| User satisfaction | > 80% positive | Survey after 30, 60, 90 days |

### Common Issues & Solutions

**Issue: Resistance to change**

```
Symptoms: Team prefers old system, complaints about change

Solutions:
- Emphasize benefits (less overhead, faster execution)
- Provide hands-on training
- Address specific pain points
- Share early wins and success stories
```

**Issue: Poor ticket quality**

```
Symptoms: Agents don't understand requirements, frequent clarifications

Solutions:
- Train on ticket writing
- Use ticket templates
- Add detailed examples
- Peer review tickets before assignment
```

**Issue: Budget overruns**

```
Symptoms: Spending more than expected

Solutions:
- Review ticket budgets
- Adjust employee assignments
- Use cheaper models for routine work
- Set more aggressive per-ticket limits
```

### Continuous Improvement

**Monthly Retrospective:**

```
What went well this month?
- [Success 1]
- [Success 2]

What could be better?
- [Improvement 1]
- [Improvement 2]

Action items for next month:
- [Action 1] - Owner - Due date
- [Action 2] - Owner - Due date
```

---

## Support Resources

**During Migration:**

- **Issues / bugs:** [github.com/Git-Rocky-Stack/Team-X/issues](https://github.com/Git-Rocky-Stack/Team-X/issues) — apply the `migration` label
- **Questions / discussion:** [github.com/Git-Rocky-Stack/Team-X/discussions](https://github.com/Git-Rocky-Stack/Team-X/discussions)
- **Documentation:** [github.com/Git-Rocky-Stack/Team-X/tree/main/docs](https://github.com/Git-Rocky-Stack/Team-X/tree/main/docs)

Team-X is open-source and community-supported — there is no paid migration service, training program, or sales channel. Migration tooling lives in the repo; contributions and improvements are welcome via pull request.

---

## Quick Migration Checklist

```
Pre-Migration:
□ Identify data to migrate
□ Set migration timeline
□ Assign migration owner
□ Notify stakeholders
□ Prepare rollback plan

Migration Day:
□ Export data from old system
□ Import to Team-X
□ Verify data accuracy
□ Train team members
□ Configure integrations
□ Test critical workflows

Post-Migration:
□ Monitor first week closely
□ Collect feedback
□ Address issues quickly
□ Refine processes
□ Celebrate success! 🎉
```

---

**Ready to migrate?** Start with the [Quick Start Guide](./getting-started/quick-start.md) and reach out for support when needed.

---

*Last updated: 2026-05-03*
