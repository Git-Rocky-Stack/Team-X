# Frequently Asked Questions

**Common questions about Team-X**

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Costs & Provider Spend](#costs--provider-spend)
3. [Security & Privacy](#security--privacy)
4. [Employees & Roles](#employees--roles)
5. [Tickets & Work](#tickets--work)
6. [Providers & Models](#providers--models)
7. [Workspaces & Collaboration](#workspaces--collaboration)
8. [Technical Issues](#technical-issues)
9. [Best Practices](#best-practices)
10. [Uninstalling & Data Export](#uninstalling--data-export)

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

**Yes.** Team-X itself is free and open-source under the MIT license; there is no paid tier, no employee quota, no workspace quota, no routine quota, no MCP-server quota, and no priority support gate. Every feature is available to every user from day one.

The cost you'll see comes from the **LLM providers your agents call** (Anthropic, OpenAI, Google, Groq, etc.); those bills go to you, from the provider, at the provider's standard rates. Team-X tracks each call's token use and computed cost in the Telemetry tab so you can see exactly what each ticket and each employee is costing your provider account. Run agents on local **Ollama** models if you'd rather pay nothing at all.

### How do I install Team-X?

1. Download the installer from [github.com/Git-Rocky-Stack/Team-X/releases](https://github.com/Git-Rocky-Stack/Team-X/releases)
2. Run the installer for your operating system
3. Launch Team-X (no account or signup, Team-X is local-first)
4. Complete the Workspace Setup Wizard

See the [Quick Start Guide](./getting-started/quick-start.md) for detailed instructions.

### Can I use Team-X without coding experience?

Yes! Team-X is designed for both technical and non-technical users. You can:

- **Non-technical users:** Hire employees for writing, research, design, planning, and analysis
- **Technical users:** Leverage engineers, developers, and data specialists for code and infrastructure work

Employees explain their work in plain language, making it accessible to everyone.

---

## Costs & Provider Spend

### Where does the cost come from?

Team-X is free. The cost you'll see is the bill from the **LLM provider your agents call**: Anthropic, OpenAI, Google, Groq, OpenRouter, Together, Fireworks, or any OpenAI-compatible endpoint you've configured. You pay the provider directly, at the provider's standard rates. Team-X just routes the request and tracks the tokens.

If you run agents on local **Ollama** models, there is no provider bill at all; everything stays on-device.

### What does a typical run actually cost?

Cost is a function of (provider × model × tokens used), nothing else. The Telemetry tab in the app shows per-ticket, per-employee, and per-provider cost in real time, computed from the live `@team-x/telemetry-core` pricing table.

Rough order-of-magnitude (check your provider's pricing page for current rates):

| Provider | Model class | Order of magnitude per ticket |
|---|---|---|
| Anthropic | High-tier (Opus class) | $$ |
| Anthropic | Balanced (Sonnet class) | $ |
| OpenAI | High-tier (GPT-4-class) | $$ |
| OpenAI | Mini/efficient | ¢ |
| Ollama | Anything local | $0.00 |

Token counts dominate cost more than the choice of model: a 200-message thread on a cheap model can outspend a one-shot call on an expensive model. Watch the Telemetry tab.

### How do I control spend?

Team-X has **budget governance** built in (and as of v3.1.0, per-employee monthly token caps via H7 in the audit campaign):

1. **Monthly workspace budget cap**: Settings → Runtime → Budget. Work pauses when exceeded.
2. **Per-employee token caps**: Set a monthly token ceiling on any employee (officer/management/IC alike).
3. **Approval gates on write-side runs**: Task Planner decompositions, role promotions, and ticket creates pass through an amber confirmation gate in the Command Palette.
4. **Provider/model selection**: Filter agents by privacy tier (Local / Open-Source Cloud / Proprietary Cloud) to keep cost classes consistent.
5. **Routine scheduling**: Slow down automated work that doesn't need to run every 5 minutes.

**Cost-optimization tips:**

- Use a mid-tier model (Sonnet-class, GPT-4o-mini-class) for routine tasks; reserve the high tier for complex tickets.
- Run a local Ollama model for anything that doesn't need a frontier model: RAG indexing, classification, summarization all work well locally.
- Pause unused employees; they cost nothing when idle, but a runaway routine on a forgotten employee can quietly burn budget.
- Set aggressive caps on experimental routines and review the Copilot's cost-insight category weekly.

### Can I get a refund from Team-X?

Team-X charges nothing; there is nothing to refund on the Team-X side. Refund questions about your LLM provider bill go to your provider (Anthropic, OpenAI, etc.) under their terms.

---

## Security & Privacy

### Is my data secure?

Team-X is local-first. There is no Team-X server and no Team-X staff with access to your data, because nothing about your work leaves your machine unless you choose to call a cloud provider. The real posture:

- **Local-first by default:** workspace data, tickets, messages, and files all live on your own machine, in a local SQLite database and a filesystem vault.
- **Zero phone-home:** no analytics, no telemetry, no crash reporting, and no automatic update checks. Nothing about your usage is sent anywhere.
- **Secrets in the OS keychain:** provider API keys are stored in your operating system's keychain via keytar, never in plaintext config files.
- **Privacy-tier filtering:** the provider router lets you restrict which provider tiers (Local, Open-Source Cloud, Proprietary Cloud) your agents may use, so sensitive work can be pinned to local models.
- **Append-only audit log:** every action is recorded in a local, filterable audit log you can review and export.

What leaves your machine is exactly what you send to whichever LLM provider you configure, governed by that provider's own data policy. Run local Ollama models to keep everything on-device.

### Where is my data stored?

- **On your device:** workspace data, tickets, configurations, and deliverables are stored locally, metadata in a SQLite database and files as blobs in a filesystem vault.
- **Backups are local archives:** the built-in backup writes a signed archive (SQLite database plus vault files plus a manifest) to a location you pick. Team-X hosts no remote backup and syncs nothing to any server, because there is no Team-X server to sync to.
- **LLM providers:** only the conversation context needed for a given turn is sent to whichever provider you have configured. Team-X itself stores nothing off your machine.

### Can I use Team-X offline?

**Partial offline support:**

- **Full offline:** Work with local Ollama models only
- **Partial offline:** View tickets, employees, and past work without internet
- **Required online:** Anthropic and OpenAI connections require internet

### Does Team-X access my code?

Team-X employees only touch files through the authority matrix you control:

- **Authority matrix:** each capability and path is granted allow, deny, or prompt; nothing is assumed.
- **Approval workflow:** write-side operations pass through a confirmation gate before they run.
- **Process isolation:** the renderer runs with context isolation on and Node access off, and MCP tool servers run in separate child processes, not in the main app.
- **Audit log:** every file operation is recorded in the append-only audit log and is reviewable and exportable.

### Does Team-X hold any compliance certifications?

No. Team-X claims no compliance certifications of any kind. It is an open-source, MIT-licensed, local-first desktop application, not a hosted service, so there is no Team-X back-end to certify and no Team-X operator holding your data.

The honest security boundary is your own machine plus the third-party LLM providers you choose to call:

- your data lives locally in SQLite plus a filesystem vault;
- provider API keys live in the OS keychain via keytar;
- the app is zero phone-home (no analytics, telemetry, crash reporting, or auto-update checks);
- privacy-tier filtering lets you keep sensitive work on local models;
- a local append-only audit log records every action.

If you need formal compliance guarantees, they come from the LLM provider you route to, under that provider's terms, not from Team-X.

---

## Employees & Roles

### What are employees?

Employees are AI agents with **curated roles**: specialized personas with skills, personality traits, and work styles. Examples:

- **Full Stack Engineer:** React, TypeScript, Node.js, Python
- **UI/UX Designer:** Figma, design systems, user research
- **Product Manager:** Roadmaps, user stories, prioritization
- **Data Analyst:** Python, SQL, data visualization
- **QA Engineer:** Testing strategies, test automation

### How many employees can I hire?

**As many as you want.** Team-X is free and MIT-licensed; there are no tiers, no quotas, and no per-seat gate. Hire one employee or a hundred, across as many workspaces as you like.

**Idle employees cost nothing**; the only bill you ever see is the provider's, and only when an employee actually works a ticket.

### Can I customize employee roles?

Yes, at two levels:

- **Per employee:** adjust the name, preferred provider, runtime profile, and personality on any hire.
- **Custom role packs:** roles are plain Markdown files with YAML frontmatter, so you can author or import your own role packs alongside the curated Strategia pack. Custom roles are available to every user; there is no paid tier and no gate on them.

The curated role pack is a starting point, not a ceiling.

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
- **Priority:** Low, Medium, High, Critical
- **Dependencies:** Other tickets that must complete first
- **Status:** Open, In Progress, Blocked, Done

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

Nine, spanning all three privacy tiers. The tier shown is each provider's default; you can change it per provider in Settings.

| Provider | Default privacy tier | Notes |
|----------|----------------------|-------|
| **Ollama** | Local | On-device models; no bill, nothing leaves your machine |
| **Anthropic** | Proprietary Cloud | Frontier reasoning and code |
| **OpenAI** | Proprietary Cloud | Balanced speed and quality |
| **Google Gemini** | Proprietary Cloud | Gemini model family |
| **Groq** | Open-Source Cloud | Very low latency on open models |
| **OpenRouter** | Proprietary Cloud | Broad multi-model gateway |
| **Together AI** | Open-Source Cloud | Open-model hosting |
| **Fireworks AI** | Open-Source Cloud | Open-model hosting |
| **Any OpenAI-compatible endpoint** | You choose | Point Team-X at your own or a self-hosted server |

You pick the specific model per employee inside each provider; Team-X does not pin you to a fixed model list, so newer models work as providers ship them.

### How do I choose a provider?

**Provider selection guide:**

| Task | Reach for | Why |
|------|-----------|-----|
| Complex architecture, code review | A frontier proprietary-cloud model (Anthropic, OpenAI, or Google top tier) | Strongest reasoning |
| Standard development tasks | A balanced mid-tier cloud model | Good quality-to-cost ratio |
| Simple, high-volume tasks | A fast, efficient cloud model, or a local Ollama model | Low latency and low cost |
| Sensitive data | Ollama local | Nothing leaves your device |
| Cost-sensitive projects | Ollama local | No provider bill at all |

The privacy tier matters as much as the model: pin sensitive work to Local, and let routine or public work reach Open-Source or Proprietary Cloud as your budget allows.

### Can I switch providers mid-ticket?

Yes, but not recommended. **Provider switching:**

- **Interrupts agent:** Agent must restart with new provider
- **Context loss:** Some conversation context may be lost
- **Best practice:** Choose provider before starting ticket

### What if a provider is down?

Team-X does not silently fail over between providers mid-run. If the provider a run is using errors out or times out, the run surfaces the error instead of quietly switching accounts, so you always know which provider actually did the work and got billed.

To stay resilient, keep more than one provider configured:

1. When Team-X dispatches autonomous work, its provider router picks among your **enabled** providers by policy order and privacy tier.
2. If the chosen provider is down, the run reports the error rather than continuing on a different one.
3. Retry the run, or switch that employee to another configured provider, and it proceeds normally.

Configure and enable your providers in **Settings > AI Providers**; a local Ollama provider makes a good always-available backstop.

---

## Workspaces & Collaboration

### What is a workspace?

A workspace is a **company container**, where employees work, tickets are tracked, and budgets are managed.

**Workspace contains:**
- Employees
- Tickets
- Projects
- Budgets
- Runtimes
- Routines
- Files and deliverables

### Can I have multiple workspaces?

**Yes, unlimited.** Team-X is free and open-source; there are no per-workspace tiers or quotas. Create as many workspaces as you need.

**Use cases for multiple workspaces:**
- **Agency:** One workspace per client
- **Portfolio:** One workspace per product
- **Environments:** Dev, staging, production workspaces

Switch between workspaces from the **Workspace Switcher** in the top bar; create a new one from the same switcher (**Workspace switcher → Create workspace…**).

### Can employees work across workspaces?

Each employee is scoped to a single workspace by design: the org chart, ticket queue, and budget controls live at the workspace level. If you need parallel work across multiple workspaces, hire equivalent employees in each one (role packs make this fast).

Cost reporting (token spend per employee, per ticket, per workspace) is per-workspace; there is no shared salary or cross-workspace billing because Team-X charges nothing; your actual bill is the provider's, against the API key you've configured.

### Can I share a workspace with another operator?

Yes. Workspace portability + shared-operator support shipped in v3.0.0. The UI lives under **Settings → Portability** (not "Collaborators"). Each workspace runs in one of three **sharing postures**:

| Posture | What it does | Status |
|---|---|---|
| **Local** | Zero-login local-first; one workstation owns the workspace. Default. | Shipped |
| **Invited** | Local-first multi-operator: invite other humans by email with a token-based invite, redeem on their own machine, memberships persist locally on both sides. | Shipped |
| **Cloud** | Hosted/shared supervision seam: workspace metadata is prepared so a hosted Team-X back-end could sync identities and state later. | **Prepared, not yet operational**: the workspace-side wiring exists, the hosted backend does not |

Invites are **email-addressed and token-based**: you enter the operator's email and Team-X generates a one-time `inviteToken`. The invitee redeems the token on their own Team-X install to mint a local operator + membership row. Nothing leaves your machine unless you choose Cloud posture and a hosted backend exists to talk to.

### What roles can a shared operator have?

Every membership has one of four **operator-membership roles**:

| Role | Default capability flags |
|---|---|
| **owner** | All four flags on: `canApproveBudget`, `canApproveAuthority`, `canManageRoutines`, `canManageRuntimes` |
| **admin** | All four flags on (same defaults as owner) |
| **operator** | All four flags off by default: grant explicitly per capability |
| **reviewer** | All four flags off by default: read/comment-oriented; grant explicitly per capability |

The defaults are produced by `membershipCapabilitiesForRole()` in `operator-access-service.ts`; the per-capability flags are granular grants the workspace owner can flip individually in the Portability UI. None of this gates AI-employee work itself; the AI employees in a workspace work for whoever holds the workspace, and the role flags just control which **human** operators can approve budgets, approve authority changes (hire/fire/promote), manage routines, and manage runtimes.

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

### My Linux AppImage won't start. What do I do?

This is almost always **FUSE 2**. An AppImage is a self-mounting image, and its
runtime needs the FUSE 2 library (`libfuse.so.2`) on your machine; Team-X's own
libraries are bundled, but FUSE is not. Modern Ubuntu (22.04+) stopped installing
it by default, and Ubuntu 24.04 renamed the package to `libfuse2t64`, so a stock
desktop double-clicks the AppImage and nothing happens.

**Two ways to fix it:**

1. **Run without installing anything** (extracts and runs in place):
   ```
   ./Team-X-<version>-x64.AppImage --appimage-extract-and-run
   ```
2. **Install FUSE 2 once:**
   - Ubuntu 24.04: `sudo apt install libfuse2t64`
   - Ubuntu 22.04 / Debian: `sudo apt install libfuse2`
   - Fedora: `sudo dnf install fuse-libs`

**Prefer not to deal with FUSE at all?** Use the **`.deb`** instead; it installs
like any system package and pulls its own dependencies:
```
sudo apt install ./Team-X-<version>-x64.deb
```

To see the exact error, run the AppImage from a terminal; the message will name
the missing piece (e.g. `dlopen(): error loading libfuse.so.2`). If you instead
see a *sandbox* error mentioning user namespaces (common on Ubuntu 24.04), that's
a different issue; please open a ticket with the full terminal output and your
`lsb_release -a`.

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
- Keep a second provider configured (a local Ollama backstop works well) so you can switch a stuck employee over

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

## Uninstalling & Data Export

Team-X is local-first: there is no account, no login, no email, and no remote service to cancel. Everything lives on your machine: workspace data (SQLite), file vault (filesystem blobs), and provider API keys (OS keychain via keytar).

### How do I back up my workspace?

Use the built-in backup tool:

1. Open **Settings → Data → Create Backup**
2. Team-X writes a signed archive (SQLite DB + vault files + manifest) to disk
3. Save the archive anywhere: external drive, a synced folder of your choice, or an encrypted bundle

To restore on a new machine: install Team-X, then **Settings → Data → Restore from Backup** and point at the archive. Manifest validation catches tampering or corruption.

Backups can also be deleted from the same panel (v3.0.0 added a per-row delete button with a path-traversal-safe guard).

### Can I export my data without using a backup?

Yes, backups are the primary path because they round-trip cleanly, but you can also:

- **Files → Export All Artifacts** for everything employees have produced (original file formats preserved)
- Manually copy the workspace database from your OS-specific Team-X data directory
- Use the file vault directly: vault files are stored as plain SHA256-verified blobs on disk

### How do I uninstall Team-X?

1. **Create a backup first** (Settings → Data → Create Backup) if you want to preserve anything.
2. Uninstall via your OS:
   - **Windows:** Settings → Apps → Team-X → Uninstall
   - **macOS:** Drag Team-X from Applications to Trash
   - **Linux:** Use your distro's package manager, or remove the AppImage / .deb you installed
3. Optionally remove local data:
   - **Windows:** `%APPDATA%\Team-X` and `%LOCALAPPDATA%\Team-X`
   - **macOS:** `~/Library/Application Support/Team-X`
   - **Linux:** `~/.config/Team-X` and `~/.local/share/Team-X`
4. Provider API keys persist in your OS keychain (keytar). To remove them: Windows Credential Manager → search "Team-X"; macOS Keychain Access → search "Team-X"; Linux Secret Service / `secret-tool`.

There is no remote data to delete; Team-X never had any.

### Can I run multiple Team-X workspaces side-by-side?

Yes. The **Workspace Switcher** in the top bar lets you run multiple companies side-by-side with isolated employees, tickets, budgets, and data. Use **Workspace switcher → Create workspace…** to add another, or the same switcher to flip between existing ones. Nothing to merge or migrate: each workspace is a separate company row in the same local database.

---

## Still Have Questions?

### Support Resources

- **Documentation:** [Comprehensive User Guide](./comprehensive-user-guide.md)
- **Scenarios:** [Real-world examples](./scenarios/)
- **Troubleshooting:** [Common issues](./troubleshooting.md)
- **Discussions:** [github.com/Git-Rocky-Stack/Team-X/discussions](https://github.com/Git-Rocky-Stack/Team-X/discussions): Q&A, ideas, show-and-tell
- **Issues:** [github.com/Git-Rocky-Stack/Team-X/issues](https://github.com/Git-Rocky-Stack/Team-X/issues): Bug reports

### Feature Requests

Have an idea for improving Team-X? We'd love to hear it:

- **GitHub Discussions:** [github.com/Git-Rocky-Stack/Team-X/discussions](https://github.com/Git-Rocky-Stack/Team-X/discussions): open a discussion in the "Ideas" category

---

*Last updated: 2026-07-12*
