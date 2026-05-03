# Frequently Asked Questions

**Common questions about Team-X**

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Billing & Costs](#billing--costs)
3. [Security & Privacy](#security--privacy)
4. [Employees & Roles](#employees--roles)
5. [Tickets & Work](#tickets--work)
6. [Providers & Models](#providers--models)
7. [Workspaces & Collaboration](#workspaces--collaboration)
8. [Technical Issues](#technical-issues)
9. [Best Practices](#best-practices)
10. [Account & Settings](#account--settings)

---

## Getting Started

### What is Team-X?

Team-X is a desktop application that provides an AI-powered workforce. You hire AI employees with curated roles (engineers, designers, product managers, etc.), assign work through tickets, and watch as agents collaborate autonomously while you maintain oversight through Mission Control Dashboard.

### What do I need to run Team-X?

**System Requirements:**

- **Windows:** Windows 10/11 (64-bit)
- **macOS:** macOS 11+ (Big Sur or later)
- **Linux:** Ubuntu 20.04+, Debian 11+, or comparable distributions
- **RAM:** 8GB minimum, 16GB recommended
- **Disk Space:** 500MB for application, additional space for workspace data
- **Internet:** Required for AI provider connections

### Is Team-X free?

Team-X follows a **freemium model**:

| Feature | Free Tier | Paid Tier |
|---------|-----------|-----------|
| Monthly Compute Budget | $10 included | Pay-as-you-go |
| Employee Quota | 3 employees | Up to 50 employees |
| Workspaces | 1 workspace | Unlimited workspaces |
| Routines | 3 routines | Unlimited routines |
| MCP Servers | 1 server | Unlimited servers |
| Support | Community | Priority email |

### How do I install Team-X?

1. Download the installer from [teamflow-x.com/download](https://teamflow-x.com/download)
2. Run the installer for your operating system
3. Create an account or sign in
4. Complete the Workspace Setup Wizard

See the [Quick Start Guide](./getting-started/quick-start.md) for detailed instructions.

### Can I use Team-X without coding experience?

Yes! Team-X is designed for both technical and non-technical users. You can:

- **Non-technical users:** Hire employees for writing, research, design, planning, and analysis
- **Technical users:** Leverage engineers, developers, and data specialists for code and infrastructure work

Employees explain their work in plain language, making it accessible to everyone.

---

## Billing & Costs

### How does billing work?

Team-X uses a **credit-based system**:

1. **Purchase credits** ($10, $50, $100, $500 packages)
2. **Credits are consumed** as AI employees work (based on provider API costs)
3. **Pause anytime** — no subscription, pay only for what you use

**Provider Cost Breakdown (approximate):**

| Provider | Model | Cost per 1M tokens | Typical Ticket |
|----------|-------|-------------------|----------------|
| Anthropic | Claude Opus 4.7 | $15.00 | $0.50 - $3.00 |
| Anthropic | Claude Sonnet 4.6 | $3.00 | $0.10 - $0.75 |
| OpenAI | GPT-4o | $5.00 | $0.25 - $1.50 |
| OpenAI | GPT-4o-mini | $0.15 | $0.01 - $0.10 |
| Ollama | Local (free) | $0.00 | $0.00 |

### What if I run out of credits?

- **Work pauses automatically** when budget exhausted
- **No unexpected charges** — you control spend
- **Purchase more credits** to resume work
- **Set budget alerts** at 50%, 75%, 90% consumption

### How do I control costs?

**Built-in cost controls:**

1. **Monthly Budget Cap:** Set maximum spend per workspace
2. **Per-Ticket Budget:** Set limits on individual tickets
3. **Approval Workflows:** Require approval for budget overrides
4. **Provider Selection:** Choose less expensive models for routine tasks
5. **Routine Scheduling:** Reduce frequency of automated tasks

**Cost optimization tips:**

- Use GPT-4o-mini or Claude Sonnet for routine tasks
- Use local Ollama models for simple work
- Set aggressive budget caps on experimental work
- Review Copilot cost insights weekly
- Pause unused employees (they don't cost when idle)

### Can I get a refund?

Unused credits are **refundable within 30 days** of purchase. Contact support@teamflow-x.com with:

- Account email
- Purchase receipt
- Reason for refund
- Credits to refund

Used credits (consumed by AI work) are **non-refundable**.

### Do credits expire?

Unused credits expire after **12 months** of inactivity. This resets each time you purchase or use credits.

---

## Security & Privacy

### Is my data secure?

Yes. Team-X implements enterprise-grade security:

- **Encryption:** All data encrypted at rest (AES-256) and in transit (TLS 1.3)
- **Zero-knowledge architecture:** Your data is not accessible to Team-X staff
- **No training on your data:** AI providers do not use your conversations for training (with Anthropic and OpenAI enterprise endpoints)
- **Audit trail:** Every action logged in Audit Trail for compliance

### Where is my data stored?

- **Local storage:** Workspace data, tickets, and configurations stored locally on your device
- **Cloud sync:** Optional cloud backup (encrypted) for disaster recovery
- **AI providers:** Only conversation context sent to providers (nothing stored locally on their servers)

### Can I use Team-X offline?

**Partial offline support:**

- **Full offline:** Work with local Ollama models only
- **Partial offline:** View tickets, employees, and past work without internet
- **Required online:** Anthropic and OpenAI connections require internet

### Does Team-X access my code?

**No.** Team-X employees only access files you explicitly authorize:

- **Explicit file access:** You approve each file read/write operation
- **Approval workflow:** Write-side operations require confirmation
- **Sandboxed execution:** Employees work in isolated environments
- **Audit log:** All file operations logged and reviewable

### Is Team-X SOC 2 compliant?

SOC 2 Type II compliance is **in progress** (expected Q2 2026). Current security posture:

- **Encryption:** AES-256 at rest, TLS 1.3 in transit
- **Access controls:** Role-based access control (RBAC)
- **Audit logging:** Comprehensive event logging
- **Penetration testing:** Quarterly third-party testing
- **Vulnerability scanning:** Continuous automated scanning

---

## Employees & Roles

### What are employees?

Employees are AI agents with **curated roles** — specialized personas with skills, personality traits, and work styles. Examples:

- **Full Stack Engineer:** React, TypeScript, Node.js, Python
- **UI/UX Designer:** Figma, design systems, user research
- **Product Manager:** Roadmaps, user stories, prioritization
- **Data Analyst:** Python, SQL, data visualization
- **QA Engineer:** Testing strategies, test automation

### How many employees can I hire?

| Tier | Employee Quota |
|------|----------------|
| Free | 3 employees |
| Basic | 10 employees |
| Pro | 25 employees |
| Enterprise | 50+ employees |

**Idle employees cost nothing** — you only pay when they work on tickets.

### Can I customize employee roles?

**Partial customization:**

- **What you can customize:** Name, preferred provider, runtime, personality tweaks
- **What you cannot customize:** Core role skills (these are curated for quality)

For fully custom employees, consider creating **custom roles** (Enterprise feature).

### Can employees collaborate?

Yes! Employees can:

- **Participate in tickets together:** Multiple employees on one ticket
- **Hand off work:** Employee A completes their part, Employee B continues
- **Review each other's work:** Code reviews, design feedback
- **Chat in ticket threads:** Discuss, ask questions, coordinate

**Participant wake semantics:** Adding an employee as a participant wakes them and notifies them of ticket activity.

### What if an employee makes a mistake?

**Built-in safeguards:**

1. **Approval workflows:** Write-side operations require your confirmation
2. **Audit trail:** Review all actions in Audit Trail
3. **Version control:** Employees work with git, so mistakes are revertible
4. **Corrective feedback:** Tell employees what went wrong, they learn

**If something breaks:**
1. Review the agent run log for what happened
2. Use git to revert changes if needed
3. Provide feedback in the ticket thread
4. Employee will incorporate feedback in future work

### Can I fire an employee?

Yes. Navigate to **Employees → [Employee Name] → Fire Employee**.

**What happens when you fire an employee:**
- Employee removed from workspace roster
- No longer assigned to new tickets
- Past work remains in tickets and audit trail
- Can rehire same role (with new name) anytime

**Fired employees do not affect:** Completed tickets, artifacts, or deliverables.

---

## Tickets & Work

### What is a ticket?

A ticket is a **work unit** assigned to one or more employees. Each ticket has:

- **Title:** Brief description of the work
- **Description:** Detailed requirements and context
- **Assignee:** Primary employee responsible
- **Participants:** Additional employees collaborating
- **Priority:** Low, Normal, High, Critical
- **Dependencies:** Other tickets that must complete first
- **Status:** Open, In Progress, Done, Cancelled

### How do I create a ticket?

**Three ways to create tickets:**

1. **Manual:** Tickets → New Ticket → Fill form
2. **Command Palette:** `Ctrl+K` / `Cmd+K` → "Create a ticket for..."
3. **Task Planner:** "Decompose this project into tickets" → Auto-generates ticket structure

### What is the Task Planner?

The Task Planner is an AI-powered tool that **decomposes large projects into tickets**.

**Example:**
```
You: "Build a React dashboard with user authentication"

Task Planner creates:
├── #1: Design dashboard mockups (Designer)
├── #2: Set up React project (Full Stack Engineer)
├── #3: Implement authentication (Backend Engineer)
├── #4: Build dashboard components (Frontend Developer)
├── #5: Write tests (QA Engineer)
└── #6: Deploy to production (DevOps Engineer)
```

### How do ticket dependencies work?

**Dependencies control ticket order:** A ticket cannot start until its dependencies complete.

**Example:**
```
#3: Implement authentication
  └── blocks ──> #4: Build dashboard components
                  └── blocks ──> #5: Write tests
```

In this example:
- #4 cannot start until #3 is Done
- #5 cannot start until #4 is Done

**Visualizing dependencies:**
- **Mission Control → Tickets:** Shows dependency graph
- **Ticket detail view:** Lists "Blocked by" and "Blocking" tickets

### Can I cancel a running agent?

Yes. From the Agent Runs Panel:

1. Find the active run
2. Click **"Cancel"**
3. Choose cancellation scope:
   - **Stop after current tool:** Let current action finish
   - **Stop immediately:** Terminate immediately (may leave incomplete state)

**Partial work is preserved:** Artifacts created before cancellation remain.

---

## Providers & Models

### What providers does Team-X support?

**Supported providers:**

| Provider | Models | Use Case |
|----------|--------|----------|
| **Anthropic** | Claude Opus 4.7, Sonnet 4.6, Haiku 4.5 | Complex reasoning, code |
| **OpenAI** | GPT-4o, GPT-4o-mini | Balanced speed/quality, fast tasks |
| **Ollama** | LLaMA 3.1, Mistral, others | Local, free, privacy-sensitive |

### How do I choose a provider?

**Provider selection guide:**

| Task | Recommended Provider | Why |
|------|---------------------|-----|
| Complex architecture, code reviews | Anthropic Claude Opus | Best reasoning |
| Standard development tasks | Anthropic Claude Sonnet | Good balance |
| Simple tasks, high volume | OpenAI GPT-4o-mini | Fast, inexpensive |
| Sensitive data | Ollama local | No data leaves device |
| Cost-sensitive projects | Ollama local | Free |

### Can I switch providers mid-ticket?

Yes, but not recommended. **Provider switching:**

- **Interrupts agent:** Agent must restart with new provider
- **Context loss:** Some conversation context may be lost
- **Best practice:** Choose provider before starting ticket

### What if a provider is down?

Team-X implements **automatic failover** (if configured):

1. **Primary provider fails** (timeout, error)
2. **Backup provider takes over**
3. **Agent continues** with minimal interruption

**Configure failover:** Settings → Providers → Failover Configuration

---

## Workspaces & Collaboration

### What is a workspace?

A workspace is a **company container** — where employees work, tickets are tracked, and budgets are managed.

**Workspace contains:**
- Employees
- Tickets
- Projects
- Budgets
- Runtimes
- Routines
- Files and deliverables

### Can I have multiple workspaces?

| Tier | Workspaces |
|------|------------|
| Free | 1 workspace |
| Basic | 3 workspaces |
| Pro | 10 workspaces |
| Enterprise | Unlimited workspaces |

**Use cases for multiple workspaces:**
- **Agency:** One workspace per client
- **Portfolio:** One workspace per product
- **Environments:** Dev, staging, production workspaces

### Can employees work across workspaces?

Yes. Employees can be granted access to multiple workspaces:

**Multi-workspace employee:**
- **Assign to workspaces:** Add employee to multiple workspaces
- **Allocation tracking:** Track time spent per workspace
- **Cost allocation:** Salary charged to workspaces based on allocation

### How do I invite team members to my workspace?

Team-X supports **two collaboration models:**

1. **Operator-to-Operator:** Multiple human operators managing one workspace
   - Invite via email
   - Role-based permissions (Owner, Admin, Viewer)

2. **Shared Workspace:** Team members view and interact with tickets
   - Read-only or read-write access
   - Cannot hire/fire employees or modify budgets

**Invite team members:** Settings → Collaborators → Invite

---

## Technical Issues

### Team-X won't launch. What do I do?

**Troubleshooting steps:**

1. **Check system requirements:** Windows 10+, macOS 11+, or supported Linux
2. **Restart the application:** Close and reopen Team-X
3. **Clear cache:** Settings → Advanced → Clear Application Cache
4. **Check for updates:** Help → Check for Updates
5. **Reinstall:** Download latest installer from website

**Still not working?** Contact support with logs:
- Windows: `%APPDATA%/Team-X/logs`
- macOS: `~/Library/Application Support/Team-X/logs`
- Linux: `~/.config/Team-X/logs`

### Agent run stuck. What do I do?

**Stuck run symptoms:**
- Agent shows "Running" for > 30 minutes
- No new messages in stream
- Provider timeout or error

**Resolution:**

1. **Wait:** Some tasks legitimately take time (large code generation, data analysis)
2. **Check provider status:** Anthropic/OpenAI status pages
3. **Cancel run:** Agent Runs Panel → [Cancel] → Choose scope
4. **Review logs:** Agent run log shows where it got stuck
5. **Retry with different provider:** Sometimes provider-specific issues

**Prevent future stuck runs:**
- Set **timeout policies** in Autonomy → Runtimes
- Enable **automatic cancellation** after X minutes
- Use **provider failover** for critical tickets

### Files not saving. What do I do?

**File save issues:**

1. **Check disk space:** Ensure sufficient space on drive
2. **Check file permissions:** Ensure Team-X has write access
3. **Check approval workflow:** Write operations may be pending approval
4. **Review Audit Trail:** Check if file operation failed

**Still not saving?**
- Copy file content from agent run artifact
- Manually save to target location
- Report bug to support with agent run ID

### Connection errors to providers.

**Troubleshooting provider connections:**

1. **Check internet connection:** Ensure you're online
2. **Check API keys:** Settings → Providers → Verify API keys
3. **Check provider status:** Anthropic/OpenAI status pages
4. **Retry connection:** Settings → Providers → Test Connection
5. **Switch providers:** Temporarily use backup provider

**Common error messages:**
- "401 Unauthorized": Invalid API key
- "429 Rate Limited": Too many requests, wait and retry
- "503 Service Unavailable": Provider is down, try backup
- "Connection timeout": Network issue, check connection

---

## Best Practices

### How do I get the most value from Team-X?

**Pro tips from power users:**

1. **Start small:** Hire 3-5 employees, learn their strengths
2. **Use Task Planner:** Let AI decompose complex projects
3. **Set budgets aggressively:** Prevent overspending on experiments
4. **Review Copilot insights weekly:** Catch cost anomalies early
5. **Document decisions:** Use tickets for decision log
6. **Leverage routines:** Automate recurring work
7. **Hire for roles, not tasks:** Specialists beat generalists
8. **Use participants:** Collaborate across functions
9. **Provide feedback:** Employees learn from corrections
10. **Archive old tickets:** Keep workspace clean, search fast

### What are common mistakes to avoid?

**Mistake #1: Hiring too many employees at once**
- **Problem:** Hard to onboard, track performance
- **Solution:** Start with 3-5, hire as needed

**Mistake #2: Not setting budgets**
- **Problem:** Unexpected charges
- **Solution:** Always set per-ticket and monthly budgets

**Mistake #3: Micromanaging agents**
- **Problem:** Defeats purpose of autonomous workforce
- **Solution:** Set clear requirements, let agents work, review results

**Mistake #4: Ignoring Copilot insights**
- **Problem:** Missed optimization opportunities
- **Solution:** Review insights weekly, act on recommendations

**Mistake #5: Not using participants**
- **Problem:** Missed cross-functional collaboration
- **Solution:** Add relevant employees as participants, not just assignees

### How do I scale from 1 to 50 employees?

**Scaling roadmap:**

| Employees | Focus Areas |
|-----------|-------------|
| 1-5 | Learn individual strengths, set budgets |
| 5-10 | Delegate by role, use Task Planner |
| 10-20 | Create specialist teams, use routines |
| 20-50 | Multi-workspace ops, advanced governance |

**Key scaling practices:**
- **Hire for roles:** Specialists for each function
- **Use participants:** Cross-functional collaboration
- **Set policies:** Standardize workflows across teams
- **Monitor costs:** Copilot insights for cost anomalies
- **Delegate operations:** Backup operators for shift coverage

---

## Account & Settings

### How do I cancel my account?

**Cancel anytime:**

1. Navigate to **Settings → Account → Cancel Account**
2. Confirm cancellation
3. Download your data (provided as ZIP)
4. Account closes within 24 hours

**What happens when you cancel:**
- No further charges
- Access to workspace for 30 days (data export period)
- After 30 days: Data deleted permanently

### Can I export my data?

Yes. **Data export options:**

1. **Workspace export:** Settings → Data → Export Workspace
   - Includes: Tickets, employees, projects, audit trail
   - Format: JSON + attachments

2. **Artifact export:** Files → Export All Artifacts
   - Includes: All deliverables and files created by employees
   - Format: Original file formats

3. **Account closure export:** Provided automatically on cancellation

### How do I change my email?

1. Navigate to **Settings → Account → Email**
2. Enter new email address
3. Verify new email (confirmation sent)
4. Email updated

**Note:** Email is your login ID. Changing email affects login credentials.

### Can I merge accounts?

No. Account merging is **not supported** due to security and data integrity concerns.

**Alternative:** Export data from one account, import to another (manual process).

---

## Still Have Questions?

### Support Resources

- **Documentation:** [Comprehensive User Guide](./comprehensive-user-guide.md)
- **Scenarios:** [Real-world examples](./scenarios/)
- **Troubleshooting:** [Common issues](./troubleshooting.md)
- **Community:** [Discord server](https://discord.gg/teamflow-x)
- **Email Support:** support@teamflow-x.com
- **Twitter:** [@teamflowx](https://twitter.com/teamflowx)

### Feature Requests

Have an idea for improving Team-X? We'd love to hear it:

- **GitHub Discussions:** [github.com/teamflow-x/discussions](https://github.com/teamflow-x/discussions)
- **Feature Request Form:** [teamflow-x.com/feedback](https://teamflow-x.com/feedback)
- **Email:** feedback@teamflow-x.com

---

*Last updated: 2026-05-03*
