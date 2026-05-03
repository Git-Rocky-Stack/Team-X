# Glossary of Terms

**Team-X terminology and concepts**

---

## A

### Agent
An AI entity that autonomously works on tickets. Agents are powered by LLM providers (Anthropic, OpenAI, Ollama) and use tools to read files, write code, run commands, and collaborate with other agents.

**See also:** [Agent Run](#agent-run), [Employee](#employee), [Provider](#provider)

### Agent Run
A single execution of an agent working on a ticket. Agent runs produce a stream of messages, tool calls, and artifacts. Runs have status (running, completed, failed, cancelled), duration, and cost.

**Example:** "Alex completed the agent run in 2 minutes 34 seconds for $0.87."

**See also:** [Agent](#agent), [Ticket](#ticket), [Artifact](#artifact)

### Approval
A governance mechanism requiring operator confirmation before certain actions execute. Approvals prevent runaway spend, unintended file writes, or breaking changes.

**Types:**
- **Budget approval:** Override spending limits
- **Write approval:** Confirm file write operations
- **Routine approval:** Approve routine-generated tickets

**See also:** [Autonomy Control Plane](#autonomy-control-plane), [Budget](#budget)

### Artifact
Output produced by an agent run. Artifacts include code files, documentation, reports, test results, and other deliverables. Artifacts are linked to tickets for traceability.

**Example:** "The agent run produced three artifacts: Button.tsx, Button.test.tsx, and test-results.txt."

**See also:** [Agent Run](#agent-run), [Ticket](#ticket), [Files & Deliverables](#files--deliverables)

### Assignee
The employee primarily responsible for completing a ticket. Each ticket has one assignee but may have multiple participants.

**See also:** [Participant](#participant), [Ticket](#ticket)

### Autonomy Control Plane
Team-X's governance and runtime health system. Includes runtimes, routines, budgets, approvals, MCP servers, and the Doctor diagnostic tool.

**Components:**
- **Runtimes:** Execution environments for agents
- **Routines:** Automated recurring tasks
- **Budgets:** Spend limits and tracking
- **Approvals:** Governance workflows
- **MCP Servers:** Model Context Protocol extensions
- **Doctor:** Health diagnostics

**See also:** [Runtime](#runtime), [Routine](#routine), [Budget](#budget)

---

## B

### Backup Operator
A secondary operator authorized to manage a workspace during the primary operator's absence. Used for shift handoffs and vacation coverage.

**See also:** [Operator](#operator), [Shift Handoff](#shift-handoff)

### Budget
A spend limit controlling costs. Team-X has multiple budget layers:

- **Monthly budget:** Maximum spend per workspace per month
- **Per-ticket budget:** Maximum spend on a single ticket
- **Routine budget:** Maximum spend per routine per month

Budgets enforce hard stops (no further work) or warnings (notify but allow work).

**See also:** [Autonomy Control Plane](#autonomy-control-plane), [Approval](#approval)

---

## C

### Command Palette
NLU-driven command interface (Ctrl+K / Cmd+K) for natural language interaction with Team-X. Use to create tickets, hire employees, check status, and perform actions.

**Examples:**
- "Create a ticket for fixing the login bug"
- "Show me all open tickets assigned to Alex"
- "What's our spend this month?"

**See also:** [Natural Language Understanding](#natural-language-understanding), [Ticket](#ticket)

### Company
See [Workspace](#workspace).

### Copilot
Team-X's proactive intelligence analyzer. Copilot monitors system state, surfaces insights, and recommends optimizations. Insights are categorized as Critical, Warning, and Info.

**Insight types:**
- **Operational:** System health, failures, performance
- **Cost:** Spend anomalies, budget alerts
- **Workflow:** Process improvements, blocked work
- **Security:** Vulnerabilities, access issues

**See also:** [Insight](#insight)

---

## D

### Dependency
A relationship between tickets where one ticket cannot start until another completes. Dependencies prevent premature work and ensure correct execution order.

**Types:**
- **Blocking:** Ticket A must complete before Ticket B starts
- **Blocked by:** Ticket B is waiting for Ticket A to complete

**See also:** [Ticket](#ticket), [Task Planner](#task-planner)

### Doctor
Diagnostic tool in the Autonomy Control Plane. Doctor performs comprehensive health checks, identifies issues, and recommends fixes.

**Checks:**
- Database integrity
- Recovery readiness
- Runtime posture
- Secrets status
- Provider health
- MCP health
- Budget blockers

**See also:** [Autonomy Control Plane](#autonomy-control-plane), [Runtime](#runtime)

---

## E

### Employee
An AI agent with a curated role, specialized skills, personality traits, and work style. Employees are hired to work on tickets.

**Examples:**
- Full Stack Engineer (React, TypeScript, Node.js)
- UI/UX Designer (Figma, design systems)
- Product Manager (roadmaps, user stories)
- QA Engineer (testing, automation)

**See also:** [Agent](#agent), [Role](#role), [Ticket](#ticket)

---

## F

### Files & Deliverables
Workspace storage for artifacts, shared resources, and deliverables. Organized into vaults with access control.

**Contents:**
- Artifacts from agent runs
- Shared templates and libraries
- Client deliverables
- Documentation

**See also:** [Artifact](#artifact), [Vault](#vault)

---

## I

### Insight
A proactive recommendation surfaced by Copilot. Insights identify opportunities, risks, and optimizations.

**Categories:**
- **Critical (🔴):** Immediate action required
- **Warning (⚠️):** Attention needed soon
- **Info (ℹ️):** Informational, no action required

**See also:** [Copilot](#copilot)

---

## M

### MCP (Model Context Protocol)
Open standard for extending LLM capabilities with external tools and data sources. Team-X supports MCP servers for database queries, web browsing, file system access, and custom integrations.

**Examples:**
- **database-query:** SQL queries on local databases
- **filesystem:** Extended file operations
- **web-search:** Search the web from agents

**See also:** [MCP Server](#mcp-server), [Autonomy Control Plane](#autonomy-control-plane)

### MCP Server
An implementation of the Model Context Protocol that extends agent capabilities. MCP servers provide tools, resources, and prompts to agents.

**Management:**
- Add/remove servers in Autonomy → MCP
- Configure connection settings
- Monitor server health

**See also:** [MCP](#mcp-model-context-protocol), [Tool](#tool)

### Mission Control Dashboard
The main dashboard showing real-time operations overview. Displays active runs, idle employees, recent tickets, spend metrics, and Copilot insights.

**Panels:**
- Active Runs
- Recent Tickets
- Copilot Insights
- Budget Status
- Employee Status

**See also:** [Copilot](#copilot), [Agent Run](#agent-run)

### Multi-Workspace
Operations spanning multiple company workspaces. Used for agencies managing multiple clients or portfolios with separate products.

**Features:**
- Shared policies across workspaces
- Employee access to multiple workspaces
- Cross-workspace reporting (operator-only)
- Data isolation between workspaces

**See also:** [Workspace](#workspace), [Shared Policy](#shared-policy)

---

## N

### Natural Language Understanding (NLU)
Team-X's ability to understand and process natural language commands via the Command Palette. NLP interprets intent, extracts parameters, and executes appropriate actions.

**See also:** [Command Palette](#command-palette)

---

## O

### Operator
A human user managing a Team-X workspace. Operators hire employees, create tickets, approve work, and govern the workspace.

**Responsibilities:**
- Hire and manage employees
- Create and prioritize tickets
- Approve budgets and write operations
- Monitor Copilot insights
- Configure governance policies

**See also:** [Employee](#employee), [Workspace](#workspace)

---

## P

### Participant
An employee added to a ticket for collaboration, not as the primary assignee. Participants receive notifications and can contribute to ticket threads.

**Participant wake semantics:** Adding an employee as a participant "wakes" them and notifies them of ticket activity.

**See also:** [Assignee](#assignee), [Ticket](#ticket), [Employee](#employee)

### Provider
An AI model provider that powers agents. Team-X supports Anthropic (Claude), OpenAI (GPT), and Ollama (local models).

**Comparison:**
| Provider | Models | Strength | Cost |
|----------|--------|----------|------|
| Anthropic | Claude Opus, Sonnet, Haiku | Complex reasoning | $$ |
| OpenAI | GPT-4o, GPT-4o-mini | Balanced | $ |
| Ollama | LLaMA, Mistral (local) | Privacy, free | Free |

**See also:** [Agent](#agent), [Runtime](#runtime)

---

## R

### Role
A curated persona defining an employee's skills, personality, and work style. Team-X offers 57 pre-configured roles across engineering, design, product, marketing, data, and operations.

**Role components:**
- **Skills:** Technical capabilities (e.g., React, Python, SQL)
- **Personality:** Communication style and approach
- **Work style:** Speed vs. quality preference, async vs. sync

**Examples:**
- Full Stack Engineer
- UI/UX Designer
- Product Manager
- Data Analyst
- DevOps Engineer

**See also:** [Employee](#employee)

### Routine
Automated recurring tasks executed on a schedule. Routines perform periodic work like code reviews, data syncs, security scans, and reports.

**Configuration:**
- **Schedule:** Cron expression (e.g., "0 9 * * MON" for Monday 9am)
- **Work template:** Ticket template for routine-generated work
- **Budget cap:** Maximum spend per routine per month
- **Approval gates:** Require approval for routine actions

**See also:** [Autonomy Control Plane](#autonomy-control-plane), [Budget](#budget)

### Runtime
The execution environment for an agent. Runtimes provide tools, file access, and command execution capabilities.

**Types:**
- **local-default:** Standard runtime with file, bash, and search tools
- **bash-runtime:** Custom runtime for shell command execution
- **node-runtime:** Runtime for Node.js execution
- **python-runtime:** Runtime for Python execution

**Configuration:**
- Memory limits
- Timeout policies
- Tool permissions
- Provider assignment

**See also:** [Agent](#agent), [Autonomy Control Plane](#autonomy-control-plane)

---

## S

### Shared Policy
A governance template applied across multiple workspaces. Shared policies ensure consistent procedures, security practices, and documentation standards.

**Components:**
- Budget policies
- Security policies
- Employee policies
- Documentation policies

**See also:** [Multi-Workspace](#multi-workspace), [Workspace](#workspace)

### Shift Handoff
Knowledge transfer process between operators. Handoffs ensure operational continuity during vacations, schedule changes, or role transitions.

**Components:**
- Pre-handoff validation (Doctor check)
- Handoff documentation (workspace state, active issues, routines)
- Live handoff session (walkthrough and Q&A)
- Post-handoff reintegration (debrief and lessons learned)

**See also:** [Backup Operator](#backup-operator), [Doctor](#doctor)

---

## T

### Task Planner
AI-powered tool that decomposes large projects into tickets. The Task Planner analyzes requirements, identifies dependencies, and creates a ticket hierarchy.

**Input:** Project description, requirements, constraints
**Output:** Structured ticket list with dependencies and assignees

**Example:** "Build a React dashboard" → 12 tickets with dependencies

**See also:** [Ticket](#ticket), [Dependency](#dependency)

### Ticket
A work unit assigned to an employee. Tickets contain requirements, context, assignee, participants, dependencies, and status.

**Lifecycle:**
1. **Open:** Created but not started
2. **In Progress:** Agent actively working
3. **Done:** Completed and approved
4. **Cancelled:** Discontinued (work preserved)

**Components:**
- Title and description
- Assignee (primary owner)
- Participants (collaborators)
- Priority (Low, Normal, High, Critical)
- Dependencies (blocking relationships)
- Status (current state)

**See also:** [Agent Run](#agent-run), [Assignee](#assignee), [Participant](#participant), [Dependency](#dependency)

### Tool
A capability available to agents during agent runs. Tools enable agents to read files, write files, run commands, search the web, and interact with MCP servers.

**Built-in tools:**
- **Read:** Read file contents
- **Write:** Create or modify files
- **Bash:** Execute shell commands
- **Search:** Search codebase
- **Grep:** Search file contents

**MCP tools:** Extended tools provided by MCP servers (database queries, web search, etc.)

**See also:** [Agent](#agent), [MCP Server](#mcp-server), [Runtime](#runtime)

---

## V

### Vault
Organized storage for files, deliverables, and shared resources. Vaults have access control (read-only, read-write) and can be shared across workspaces.

**Types:**
- **Workspace vault:** Private to workspace
- **Shared vault:** Accessible across multiple workspaces
- **Personal vault:** Private to operator

**See also:** [Files & Deliverables](#files--deliverables), [Multi-Workspace](#multi-workspace)

---

## W

### Workspace
A company container containing employees, tickets, budgets, routines, and deliverables. Workspaces isolate data and resources for different projects or clients.

**Workspace contains:**
- Employees
- Tickets
- Projects
- Budgets
- Runtimes
- Routines
- Files and deliverables
- Audit trail

**Use cases:**
- **Single workspace:** Personal projects or single company
- **Multiple workspaces:** Agency managing multiple clients

**See also:** [Multi-Workspace](#multi-workspace), [Company](#company)

---

## Common Acronyms

| Acronym | Full Term | Definition |
|---------|-----------|------------|
| **AI** | Artificial Intelligence | Computer systems performing tasks requiring human intelligence |
| **API** | Application Programming Interface | Set of protocols for building software |
| **CLI** | Command Line Interface | Text-based interface for interacting with software |
| **CSV** | Comma-Separated Values | File format for tabular data |
| **FTE** | Full-Time Equivalent | Workload equivalent to one full-time employee |
|**JSON** | JavaScript Object Notation | Lightweight data interchange format |
| **LLM** | Large Language Model | AI model trained on vast text corpora |
| **MCP** | Model Context Protocol | Open standard for extending LLM capabilities |
| **NLU** | Natural Language Understanding | AI capability to interpret human language |
| **NPM** | Node Package Manager | Package manager for JavaScript |
| **PDF** | Portable Document Format | File format for documents |
| **RACI** | Responsible, Accountable, Consulted, Informed | Matrix for defining roles in projects |
| **ROI** | Return on Investment | Measure of profitability of an investment |
| **SaaS** | Software as a Service | Software delivery model via cloud |
| **SQL** | Structured Query Language | Language for managing databases |
| **SSH** | Secure Shell | Protocol for secure network communication |
| **UI** | User Interface | Visual interface for interacting with software |
| **UX** | User Experience | Overall experience of using a product |
| **VM** | Virtual Machine | Emulated computer system |

---

## Keyboard Shortcuts Reference

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` / `Cmd+K` | Open Command Palette |
| `Ctrl+D` / `Cmd+D` | Go to Mission Control Dashboard |
| `Ctrl+T` / `Cmd+T` | Go to Tickets Panel |
| `Ctrl+E` / `Cmd+E` | Go to Employees Panel |
| `Ctrl+A` / `Cmd+A` | Go to Autonomy Control Plane |
| `Ctrl+F` / `Cmd+F` | Go to Files Panel |
| `Ctrl+C` / `Cmd+C` | Go to Chat Panel |
| `Ctrl+,` / `Cmd+,` | Open Settings |
| `Ctrl+?` / `Cmd+?` | Show keyboard shortcuts |
| `Esc` | Close current panel/modal |
| `Ctrl+N` / `Cmd+N` | Create new ticket |

---

**Still confused?** Check the [Comprehensive User Guide](./comprehensive-user-guide.md) for detailed explanations, or the [Quick Start Guide](./getting-started/quick-start.md) for hands-on introduction.

---

*Last updated: 2026-05-03*
