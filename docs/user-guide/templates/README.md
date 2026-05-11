# Templates Directory

**Reusable templates for common Team-X workflows.**

---

## Available Templates

| Template | Purpose | Use When |
|----------|---------|----------|
| [handoff-document.md](./handoff-document.md) | Operator handoff documentation | Transferring operational responsibility to backup operator |
| [meeting-agenda.md](./meeting-agenda.md) | Structured meeting agenda | Running team meetings, standups, retrospectives |
| [ticket-templates.md](./ticket-templates.md) | Pre-defined ticket formats | Creating common ticket types (features, bugs, reviews) |
| [routine-templates.md](./routine-templates.md) | Pre-configured routine templates | Setting up automated recurring tasks |

---

## Using Templates

### Quick Start

1. **Select the appropriate template** for your needs
2. **Copy the template** to your workspace
3. **Fill in placeholders** (marked with `[brackets]`)
4. **Customize for context** (adjust to fit your specific situation)
5. **Save and use** (share with team, create tickets, etc.)

### Template Placeholders

Templates use `[bracketed text]` to indicate placeholders. Replace these with your specific information:

- **[Operator Name]** → Your name or the primary operator's name
- **[Backup Operator Name]** → Name of the backup operator
- **[Date]** → Current date (YYYY-MM-DD format)
- **[Workspace Name]** → Name of your workspace
- **[$XXX]** → Budget amount
- **[#]** → Ticket numbers, counts, etc.

---

## Handoff Document Template

**File:** [handoff-document.md](./handoff-document.md)

**Purpose:** Comprehensive handoff documentation for operator transitions

**Use cases:**
- Vacation coverage
- Shift changes
- Role transitions
- Emergency backup

**Sections included:**
- Workspace overview
- Active issues
- Budget status
- Contacts and escalation
- Known issues and workarounds
- Decision log
- Quick reference commands
- Return plan

**Time to complete:** 30-60 minutes

---

## Meeting Agenda Template

**File:** [meeting-agenda.md](./meeting-agenda.md)

**Purpose:** Structured agenda for various meeting types

**Use cases:**
- Daily standups (15 min)
- Weekly team syncs (30-60 min)
- Retrospectives (60-90 min)
- Planning sessions (60-90 min)
- Incident post-mortems (60 min)
- 1:1 check-ins (30 min)

**Sections included:**
- Meeting objectives
- Agenda with timeboxes
- Attendees and roles
- Pre-meeting preparation
- During-meeting notes
- Post-meeting follow-up

**Meeting types covered:** Each type has specific guidance on objectives and format.

---

## Ticket Templates

**File:** [ticket-templates.md](./ticket-templates.md)

**Purpose:** Pre-defined ticket formats for common work types

**Templates included:**

| Template | Use For | Estimated Cost |
|----------|---------|----------------|
| Feature Development | New features and functionality | $5-50 |
| Bug Fix | Defects and issues | $2-20 |
| Code Review | Pull request reviews | $1-10 |
| Documentation | Docs and guides | $3-15 |
| Testing | Test coverage and QA | $3-20 |
| Research | Investigations and analysis | $5-25 |
| Security Review | Security audits | $5-30 |
| Performance Optimization | Performance improvements | $5-40 |
| Deployment | Releases and deployments | $2-15 |
| Refactoring | Code cleanup and debt reduction | $5-30 |

**Each template includes:**
- Title format
- Description structure
- Recommended assignee
- Participants to include
- Priority guidance
- Estimated cost
- Common dependencies

---

## Routine Templates

**File:** [routine-templates.md](./routine-templates.md)

**Purpose:** Pre-configured routine templates for automation

**Templates included:**

| Routine | Purpose | Schedule | Est. Cost |
|---------|---------|----------|-----------|
| Daily Code Review | Review code changes | MWF 9am | $20-40/mo |
| Nightly Data Sync | Data synchronization | Daily 2am | $30-50/mo |
| Weekly Summary | Activity reports | Mon 9am | $10-15/mo |
| Security Scan | Vulnerability scanning | Daily 3am | $15-25/mo |
| Cost Anomaly Detection | Spend monitoring | Every 6h | $10-20/mo |
| Database Backup | Data backup | Daily 4am | $5-15/mo |
| Performance Monitoring | Performance checks | Every 4h | $15-30/mo |
| Dependency Updates | Package updates | Mon 6am | $5-10/mo |
| Documentation Sync | Docs updates | Fri 10am | $8-15/mo |
| Health Check | System health | Daily 8am | $10-20/mo |

**Each template includes:**
- Purpose and schedule
- Work template structure
- Tools required
- Budget estimates
- Configuration notes

---

## Customization Guidelines

### General Tips

1. **Be specific:** Replace all placeholders with concrete details
2. **Adjust scope:** Add or remove sections based on needs
3. **Set realistic budgets:** Use estimates as starting points, adjust based on experience
4. **Include context:** Link to related docs, tickets, or resources
5. **Keep updated:** Revise templates as your processes evolve

### Tailoring to Your Workspace

**Different workspaces may need:**
- Different meeting cadences
- Modified ticket workflows
- Custom routine schedules
- Workspace-specific handoff items

**Create workspace-specific templates:**
1. Copy standard template
2. Add workspace-specific sections
3. Save to workspace vault
4. Share with team

---

## Best Practices

### Handoff Documents

- **Prepare 1-2 days before** handoff date
- **Run Doctor** and include results
- **Review Copilot insights** for context
- **Include contact info** for escalation
- **Schedule follow-up** during absence

### Meeting Agendas

- **Send agenda 24h in advance** for meetings > 30 min
- **Timebox each agenda item** strictly
- **Assign note-taker** before meeting starts
- **Distribute notes** within 24h after meeting
- **Track action items** to completion

### Ticket Templates

- **Be specific about acceptance criteria**
- **Include context** (why this work matters)
- **Link related tickets** (dependencies)
- **Set appropriate budgets** based on complexity
- **Add participants** for cross-functional work

### Routine Templates

- **Start with conservative schedules** (daily vs hourly)
- **Set budget caps** before enabling
- **Review first few runs** carefully
- **Use approval gates** for write actions
- **Monitor costs** and adjust as needed

---

## Template Maintenance

### Quarterly Review

Review templates quarterly to ensure they:

- **Reflect current processes** (update if workflows changed)
- **Include accurate cost estimates** (adjust based on actual data)
- **Cover all common scenarios** (add new templates as needed)
- **Remove outdated content** (depreciate unused templates)

### Feedback Loop

When using templates:

1. **Note what works** and what doesn't
2. **Suggest improvements** based on experience
3. **Share customizations** that benefit others
4. **Report issues** with template structure or content

**Provide feedback:** open an issue at [github.com/Git-Rocky-Stack/Team-X/issues](https://github.com/Git-Rocky-Stack/Team-X/issues) with the `templates` label.

---

## Need More Help?

**Documentation:**
- [Quick Start Guide](../getting-started/quick-start.md) — Get started in 15 minutes
- [Comprehensive User Guide](../comprehensive-user-guide.md) — Full documentation
- [Scenarios](../scenarios/) — Real-world examples

**Support:**
- [FAQ](../faq.md) — Frequently asked questions
- [Troubleshooting](../troubleshooting.md) — Common issues and solutions
- [Glossary](../glossary.md) — Terminology reference

**Community:**
- [GitHub Discussions](https://github.com/Git-Rocky-Stack/Team-X/discussions) — Community Q&A and feature requests
- [GitHub Issues](https://github.com/Git-Rocky-Stack/Team-X/issues) — Bug reports and tracked work

---

*Last updated: 2026-05-03*
