# Team-X User Guide

**Your AI-Powered Workforce, Running Locally**

---

## Welcome to Team-X

Team-X is a revolutionary approach to work: an AI-powered workforce that lives entirely on your machine. Hire synthetic employees with hand-crafted F10 role specifications, assign them work through tickets and projects, and watch them execute tasks using your chosen LLM providers—all with complete privacy, auditability, and control.

This guide will take you from first launch to a fully operational AI workforce.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Understanding Team-X](#2-understanding-team-x)
3. [Workspaces & Companies](#3-workspaces--companies)
4. [Hiring & Managing Employees](#4-hiring--managing-employees)
5. [Mission Control Dashboard](#5-mission-control-dashboard)
6. [Command Palette](#6-command-palette)
7. [Tickets & Work Management](#7-tickets--work-management)
8. [Projects, Goals & Schedule](#8-projects--goals--schedule)
9. [Chat & Conversations](#9-chat--conversations)
10. [Meetings & Collaboration](#10-meetings--collaboration)
11. [Files & Deliverables](#11-files--deliverables)
12. [Copilot: Proactive Intelligence](#12-copilot-proactive-intelligence)
13. [Autonomy Control Plane](#13-autonomy-control-plane)
14. [Extensions: Skills & MCPs](#14-extensions--skills--mcps)
15. [Settings & Configuration](#15-settings--configuration)
16. [Telemetry & Costs](#16-telemetry--costs)
17. [Audit Trail](#17-audit-trail)
18. [Troubleshooting](#18-troubleshooting)
19. [Best Practices](#19-best-practices)
20. [Keyboard Shortcuts](#20-keyboard-shortcuts)

---

## 1. Getting Started

### First Launch

When Team-X starts for the first time, it automatically:

1. Creates your local database (SQLite)
2. Sets up all required tables
3. Seeds a starter workspace ("Strategia-X") with a CEO and Senior Fullstack Engineer
4. Configures provider templates (Ollama and Anthropic, both disabled by default)

You'll immediately see the Dashboard with two employee cards ready.

### The 5-Minute Quickstart

**Step 1: Configure a Provider (2 min)**

1. Click **Settings** in the top navigation
2. Click **Providers** section
3. Toggle **Ollama** to enable (if you have Ollama installed locally)
   - Team-X auto-detects Ollama at `http://127.0.0.1:11434`
   - Or add **Anthropic**, **OpenAI**, **Google**, **Groq**, or other cloud providers
4. Click **Test Connection** to verify
5. Your API key is stored in your OS keychain, never in plain text

**Step 2: Start Your First Conversation (1 min)**

1. In the Dashboard, click on any employee card (CEO or Senior Fullstack Engineer)
2. The **Chat Drawer** slides open from the right
3. Type your first message in the composer:
   - Try: *"What is our mission?"* or *"What can you help me build?"*
4. Press **Ctrl+Enter** (Windows/Linux) or **Cmd+Enter** (Mac) to send
5. Watch the response stream in real-time, token-by-token

**Step 3: Create Your First Ticket (2 min)**

1. Press **Ctrl+K** (or **Cmd+K** on Mac) to open the Command Palette
2. Type: *"File a ticket to document the user authentication system"*
3. Press **Enter**
4. The palette shows the classified intent and details
5. Click **Confirm** (or press **Enter** again)
6. Your employee will pick up the ticket and begin work

That's it! You now have:
- ✅ A live AI workforce
- ✅ Working tickets
- ✅ Full audit trail
- ✅ Complete privacy control

---

## 2. Understanding Team-X

### The Core Concept

Team-X treats AI agents like **employees**, not chatbots. Each employee:

- Has a **role specification** written by human practitioners
- **Thinks and acts** according to their role's expertise
- **Owns work** through tickets, projects, and goals
- **Collaborates** with other employees through meetings and chat threads
- **Respects boundaries** through privacy tiers and authority controls

### What Makes Team-X Different

| Traditional AI Tools | Team-X |
|---------------------|---------|
| Chat with an AI | Hire an entire workforce |
| One-off prompts | Durable tickets and projects |
| No organization | Full org chart with hierarchy |
| What happens in the chat | Everything is audited |
| Cloud-only | Local-first, your data never leaves |
| Generic assistants | Role-specialized experts |

### The Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Top Navigation Bar                         │
├─────────────────────────────────────────────────────────────┤
│  Dashboard │ Autonomy │ Org │ Projects │ Tickets │      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────┐  ┌──────────┐  ┌───────────────────┐        │
│  │Employee │  │Threads   │  │  Mission Control  │        │
│  │  Rail   │  │Drawer   │  │  Dashboard       │        │
│  └─────────┘  └──────────┘  │                   │        │
│  ┌─────────┐                   │  Copilot Widget    │        │
│  │Hire +   │                   │                   │        │
│  │Workspace│                   └───────────────────┘        │
│  └─────────┘                                                │
└─────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Local-First**: Your data lives on your machine. No phone-home, no telemetry, no cloud sync unless you explicitly enable it.
2. **Everything is Audited**: Every action, every token, every cost is recorded in the audit log.
3. **Explicit Authority**: Nothing happens without your approval. Destructive actions require confirmation.
4. **Declarative Work**: You declare what needs doing (tickets, goals); employees figure out how.
5. **Role Fidelity**: Each employee has genuine expertise encoded by practitioners, not generic AI behavior.

---

## 3. Workspaces & Companies

### What is a Workspace?

A **workspace** (called a "company" in the UI) is an isolated operational environment. Each workspace has:

- Its own employee roster
- Separate tickets and projects
- Independent goals and meetings
- Unique settings and configurations
- Isolated audit trail

### Managing Workspaces

**Creating a New Workspace:**

1. Click the workspace switcher in the top bar (shows current workspace name)
2. Click **Create Company**
3. Enter:
   - **Name**: Display name
   - **Slug**: URL-safe identifier (e.g., `my-project`)
   - **Icon**: Optional emoji or visual marker
   - **Mission**: Your workspace's purpose
4. Click **Create**

Team-X automatically bootstraps two system agents in each workspace:
- **system-agent**: Handles complex reasoning questions
- **system-copilot**: Provides proactive insights

**Switching Between Workspaces:**

Use the workspace dropdown in the top navigation. Each workspace maintains complete isolation.

**Archiving and Deleting:**

- **Archive**: Pauses a workspace while preserving its data
- **Delete**: Permanently removes the workspace and all associated data

### Workspace Settings

Access company settings via:
1. Click the workspace dropdown
2. Click **Settings** next to the workspace name

Configure:
- Mission statement and description
- Visual branding (icon, theme)
- Operator access and sharing posture

---

## 4. Hiring & Managing Employees

### The Role Catalog

Team-X ships with **57 curated role specifications** across 6 hierarchy levels:

| Level | Count | Examples |
|-------|-------|----------|
| **Officer** | 5 | CEO, CTO, CFO, COO, CMO |
| **Senior Management** | 7 | VP Engineering, VP Product, VP Sales |
| **Management** | 8 | Engineering Manager, Product Manager, Design Manager |
| **Supervisor** | 5 | Team Supervisor, QA Supervisor |
| **Lead** | 5 | Tech Lead, Design Lead, Data Lead |
| **Individual Contributor** | 25 | Senior Fullstack Engineer, Frontend Developer, Data Scientist, UX Researcher |

Each role is hand-written by practitioners, not LLM-generated.

### Hiring an Employee

**Via the Hire Dialog:**

1. Click the **+ Hire** button in the left sidebar
2. Browse or search the role catalog
3. Use **level chips** to filter by hierarchy level
4. Click on a role to select it
5. Choose who they report to in the **Reports to** dropdown
6. Click **Hire**

**Via Command Palette:**

1. Press **Ctrl+K** / **Cmd+K**
2. Type: *"Hire a Senior Backend Engineer"*
3. Follow the prompts

### What Happens When You Hire

- A new employee record is created
- They appear in the org chart under their manager
- Their role specification is rendered with company context
- They're immediately available for work assignment
- An audit event logs the hire

### The Org Chart

Navigate to **Org** tab to see the full hierarchy:

- Employees are displayed in an indented tree
- Color-coded levels show hierarchy at a glance
- Drag employees to reorganize reporting structure
- The org chart prevents cycles (you can't make someone report to their subordinate)

### Employee Actions

**Promoting an Employee:**

1. Right-click the employee or open their detail panel
2. Select **Promote**
3. Choose the new role from the catalog
4. Their role specification, level, and system prompt update

**Changing Manager:**

1. Select the employee
2. Use **Set Manager** to pick a new reporting line
3. Org chart updates immediately

**Firing an Employee:**

1. Select the employee
2. Click **Fire**
3. The employee is soft-deleted (archived) for audit purposes
4. Active tickets can be reassigned

### Employee Profiles

Each employee has:
- **Name and Title**: Their identity in the org
- **Role Specification**: The system prompt that guides their behavior
- **Status**: idle, thinking, blocked, or error
- **Live Activity**: What they're working on right now
- **Telemetry**: Tokens used, cost incurred, latency

---

## 5. Mission Control Dashboard

**Mission Control** is the operational heart of Team-X. It answers: "What's happening right now?"

### Accessing Mission Control

Click **Dashboard** in the top navigation → **Mission Control** is the default view.

### Dashboard Components

**Hero Metrics Row**

Six live metrics at a glance:

| Metric | What It Shows |
|--------|--------------|
| **Live Runs** | Agentic loops currently progressing |
| **External Runtimes** | Runtime sessions and heartbeat state |
| **Workforce Active** | Employees currently processing work |
| **Queue Pressure** | Total backlog count across all employees |
| **Blocked Work** | Tickets in blocked status |
| **Today Cost** | Token usage and cost for current window |

**Primary Panels**

Two main panels show different operational views:

1. **Agent Runs Panel**
   - Recent agentic loops with live step updates
   - Each run shows: label, status, step count, tokens, cost, duration
   - Click any run to open the full thread transcript
   - Shows completed, failed, and running runs

2. **Employee Queues Panel**
   - Durable backlog counts layered with live employee activity
   - Each employee row shows:
     - Name and title
     - Live status badge (Live, Blocked, Error, Idle)
     - Visual queue breakdown (open/in-progress/blocked/done)
     - Quick access to chat and tickets

**Secondary Panels**

- **Copilot Insights**: Proactive findings without overwhelming the work view
- **Recent Commands**: Last 5 commands with intent labels
- **Telemetry Snapshot**: Execution pulse, cost, and volume

### Dashboard Actions

Toggle panel visibility:
- **Agent Runs** button
- **Employee Queues** button
- **Reset Layout** button

Quick access buttons:
- **Open tickets**: Jump to Tickets tab
- **Command log**: Full command history
- **Telemetry**: Detailed cost analytics
- **Autonomy**: Open control plane

### Reading the Dashboard

**Queue Pressure Bar**

Each employee shows a horizontal bar with four colors:
- **Gray** (left): Open tickets
- **Brand** (blue): In-progress tickets
- **Amber**: Blocked tickets
- **Green**: Done tickets

**Live Status Indicators**

- **Brand pulse**: Employee is actively thinking/working
- **Amber**: Employee is blocked
- **Red**: Employee encountered an error
- **Gray**: Employee is idle

### Dashboard Subviews

Mission Control has 5 subviews:

1. **Mission Control** (default): Live operations
2. **Timeline**: Chronological event feed
3. **Stream**: Raw LLM output from all agents
4. **Floor**: Grid layout of employee activity
5. **Commands**: Recent command-palette operations

---

## 6. Command Palette

The **Command Palette** (`Ctrl+K` / `Cmd+K`) is your fastest path to action in Team-X.

### How It Works

1. Press **Ctrl+K** (Windows/Linux) or **Cmd+K** (Mac)
2. Type what you want in plain English
3. Team-X classifies your intent
4. Confirm and execute

### Supported Intents

| Intent | Example Commands |
|--------|-----------------|
| **hire_employee** | "Hire a senior backend engineer", "We need a CTO" |
| **fire_employee** | "Fire James", "Let go of Sarah Chen" |
| **promote_employee** | "Promote Mike to VP Engineering", "Move Sarah to tech lead" |
| **assign_ticket** | "Assign the auth bug to Sarah", "Give ticket #42 to James" |
| **create_ticket** | "File a ticket for the login crash", "New ticket: optimize dashboard query" |
| **close_ticket** | "Close ticket #17", "Mark the auth bug as done" |
| **reopen_ticket** | "Reopen ticket #17", "The login bug is back - reopen it" |
| **create_project** | "Start a project called Onboarding Redesign", "New project for Q2 launch" |
| **create_goal** | "Add a goal: ship MVP by end of quarter", "Set a goal for 99.9% uptime" |
| **call_meeting** | "All-hands with the engineering team", "Call a meeting with Sarah and Mike" |
| **end_meeting** | "End the meeting", "Wrap up the all-hands" |
| **check_status** | "What is everyone working on?", "Show me the team's status" |
| **show_view** | "Take me to projects", "Open the audit log" |
| **search_vault** | "Find the API spec", "Search vault for onboarding docs" |
| **complex_request** | "Why is the frontend team behind?", "Plan the next sprint based on open tickets" |

### Confirmation Gates

**Destructive actions** require explicit confirmation:
- Firing employees
- Closing tickets
- Ending meetings
- Promoting employees

You'll see an amber/red summary with **Confirm** and **Cancel** buttons.

### Ambiguous Matches

If your input could match multiple entities:

- The palette asks you to pick from the top candidates
- Use arrow keys to navigate, Enter to select
- Supports fuzzy matching for names and references

### Command History

- Press **ArrowUp** in empty input to cycle through your last 20 commands
- History is persisted across sessions
- Each command shows when it was executed

### Slash Commands

For direct navigation without NLU classification:

```
/show dashboard     Switch to Dashboard
/show tickets       Switch to Tickets
/show projects      Switch to Projects
/show meetings      Switch to Meetings
/show telemetry     Switch to Telemetry
/show files         Switch to Files
/show audit         Switch to Audit
/show settings      Switch to Settings
```

### When to Use the Palette

| Task | Use Palette Because |
|------|-------------------|
| Quick hire | Faster than opening dialog and browsing |
| Reassign work | One-line command vs. opening ticket detail |
| Check status | Instant overview without navigating tabs |
| Navigation | Jump directly without clicking through tabs |
| Create work | Declarative: "create a ticket for X" |

---

## 7. Tickets & Work Management

### The Ticket Model

Tickets are the **unit of work** in Team-X. They represent durable, trackable work items.

### Ticket Structure

Each ticket has:

- **Title**: Brief description
- **Description**: Detailed requirements
- **Priority**: Low, Medium, High, Critical
- **Status**: Open, In Progress, Blocked, Done
- **Assignee**: Primary owner
- **Participants**: Employees who can see and work on the ticket thread
- **Project**: Optional project association
- **Due Date**: Optional deadline
- **Attachments**: Files from the vault

### Creating Tickets

**Via Command Palette:**
```
Press Ctrl+K → "File a ticket to implement user authentication"
```

**Via Tickets Tab:**
1. Click **Tickets** in the top navigation
2. Click **Create Ticket** button
3. Fill in the ticket details
4. Click **Create**

### The Kanban Board

Tickets display in four columns:

| Column | Meaning | Color |
|--------|---------|-------|
| **Open** | Not yet started | Gray |
| **In Progress** | Someone is actively working | Brand (blue) |
| **Blocked** | Waiting on something | Amber |
| **Done** | Completed | Green |

### Ticket Detail Panel

Click any ticket card to open the detail panel with:

**Header Section**
- Ticket title, status, priority badge
- Assignee and project links
- Due date display
- Close/Reopen/Delete actions

**Thread Section**
- Full conversation history
- Employee responses streamed in real-time
- Tool calls shown as blue chips
- Human comments trigger employee wakeups

**Activity Section**
- Thread participants
- Ticket attachments
- Related tickets
- Timeline of changes

### Working with Tickets

**Assigning Work**

When you create a ticket with an assignee:
- That employee "owns" the ticket
- They pick it up automatically (no extra prompting needed)
- Other employees can be added as participants

**Ticket Threads**

Ticket threads differ from 1:1 chat:

- **Multiple participants**: All participants see the full thread
- **Wake-up behavior**: When someone comments, Team-X wakes every participant and historical author
- **Structured output**: Employees can use tools and produce deliverables within the ticket context

**Updating Tickets**

- Change status by clicking status badges or dragging between columns
- Reassign by updating the Assignee field
- Add participants via the participant selector
- Attach files from the vault

**Closing Tickets**

1. Click **Close Ticket** in the detail panel header
2. The card animates from its current column to **Done**
3. Audit log records the closure

### Ticket Best Practices

- **Be specific in descriptions**: "Add user authentication with JWT tokens" > "Implement auth"
- **Set due dates**: Appears automatically in the Schedule calendar
- **Link to projects**: Connect tickets to larger goals
- **Add participants**: Bring in relevant expertise
- **Use priority wisely**: Reserve Critical for blocking issues

---

## 8. Projects, Goals & Schedule

### Projects

**Projects** organize related work into cohesive initiatives.

**Creating a Project:**

1. Navigate to **Projects** tab
2. Click **Create Project** button
3. Enter:
   - **Project name**
   - **Description**
   - **Lead employee**
   - **Target date**
4. Click **Create**

**Project Card Shows:**
- Name and lead
- Progress bar (based on completed tickets)
- Ticket count
- Target date

**Project Detail:**
- Description and lead
- Linked tickets
- Associated goals
- Timeline view

### Goals

**Goals** define outcomes with measurable targets.

**Creating a Goal:**

1. Navigate to **Projects** tab
2. Click **Goals** subtab
3. Click **Create Goal** button
4. Enter:
   - **Goal name**
   - **Description**
   - **Target value** (numeric goal)
   - **Target date**
   - **Linked project**
5. Click **Create**

**Goal Tracking:**
- Progress updates as linked tickets complete
- Visual progress bar toward target
- Overdue warnings

### Schedule Calendar

The **Schedule** subtab in Projects provides a unified calendar view:

**What Appears:**
- **Ticket due dates** (automatic from tickets)
- **Project target dates** (from projects)
- **Goal target dates** (from goals)
- **Manual schedule items** (tasks, reminders, milestones)

**Creating Manual Schedule Items:**

1. Click **Add** in the Schedule toolbar
2. Enter:
   - **Title**
   - **Start date/time**
   - **End date/time** (optional)
   - **Priority**
   - **Assigned employee** (optional - triggers wake-up)
   - **Link to ticket/project/goal** (optional)
   - **Notes**
3. Click **Create**

**Schedule Features:**
- **Today/Overdue/Next 14 Days/Agent wakes** quick filters
- Drag to reschedule
- Click to edit or delete
- Assigned employee wakes automatically at scheduled time

### Using Projects, Goals, and Schedule Together

**Recommended Workflow:**

1. **Plan**: Create a project with target date
2. **Decompose**: Add goals with measurable targets
3. **Execute**: Create tickets linked to project/goals
4. **Track**: Monitor progress in project cards and goal progress bars
5. **Coordinate**: Use Schedule to see all deadlines in one place

---

## 9. Chat & Conversations

### Chat Interface

**Opening Chat:**

- Click any employee in the left sidebar
- Chat drawer opens on the right side
- Type in composer and press **Ctrl+Enter** to send

**Chat Thread Features:**

- **Streaming responses**: See tokens arrive in real-time
- **Tool calls**: Blue chips show when agents use tools
- **Message history**: Full conversation persists
- **Thread types**:
  - **Direct threads**: 1:1 conversations with employees
  - **Ticket threads**: Multi-participant work discussions
  - **Copilot threads**: Read-only transcripts from agentic runs

### Thread Drawer

Access all conversations via the **Threads** button in the left sidebar.

Shows:
- All active conversations
- Thread participants
- Last message preview
- Timestamps

**Thread Types:**

| Thread Type | Icon | Description |
|------------|------|-------------|
| Direct | Employee avatar | 1:1 conversation |
| Ticket | Ticket icon | Multi-participant ticket thread |
| System-Copilot | Sparkles | Read-only agentic run transcript |
| System-Agent | Bot | Read-only Q&A transcript |

### Chat vs. Ticket Threads

| Aspect | Chat Thread | Ticket Thread |
|--------|-----------|---------------|
| **Purpose** | Direct conversation, questions | Work execution, collaboration |
| **Participants** | You + one employee | You + assignee + participants |
| **Context** | Conversation history | Ticket description + linked files |
| **Waking** | Only you wake the employee | Any participant wakes all others |
| **Deliverables** | Informal responses | Formal outputs and artifacts |

### When to Use Chat vs. Tickets

**Use Chat for:**
- Quick questions
- Clarifications
- Status checks
- Informal collaboration

**Use Tickets for:**
- Durable work items
- Multi-employee collaboration
- Deliverables that need tracking
- Work that connects to larger goals

### Spelling and Editing

Team-X includes Chromium spelling in editable text areas:

- **Right-click** misspelled words for suggestions
- **Add to Dictionary** for custom terms
- Standard edit actions (Cut, Copy, Paste, Undo/Redo)

---

## 10. Meetings & Collaboration

### Meetings in Team-X

**Meetings** bring the team together with structured agendas and documented outcomes.

### Calling a Meeting

**Via Command Palette:**
```
Ctrl+K → "Call an all-hands with the engineering team"
```

**Via Meetings Tab:**
1. Click **Meetings** in top navigation
2. Click **Call Meeting**
3. Enter:
   - **Title**
   - **Agenda** (what you want to accomplish)
   - **Attendees** (select multiple employees)
4. Click **Start Meeting**

### What Happens During a Meeting

1. **Orchestrator Pauses**: No new agent work dispatches while meeting is live
2. **Status Indicator**: Top bar shows amber dot (meeting active)
3. **Turn-Taking**: Employees speak one at a time, automatically scheduled
4. **Your Interjections**: Type in the meeting composer to participate
5. **Minutes Generation**: When you end the meeting, minutes auto-generate

### Meeting Structure

**During the Meeting:**
- Live thread shows all contributions
- Employees take turns based on agenda and expertise
- You can interject at any time

**After the Meeting:**
- **Minutes Panel** appears with structured output:
  - Attendees
  - Key Points (summary of discussion)
  - Action Items (can become tickets with one click)
- **Audit Log** records the meeting

### Action Items

Action items from meetings can become tickets:

1. In the minutes panel, find an action item
2. Click **Create Ticket**
3. A new ticket is pre-filled with:
   - Title from action item
   - Description context
   - Relevant participants
4. Review and create

### Meeting Modes

- **All-hands**: Entire company participates
- **Team meetings**: Specific departments or groups
- **1:1s**: Direct conversations with structured records

### Best Practices

- **Have clear agendas**: "Review open tickets, align on priorities"
- **Limit attendees**: Invite only who's needed
- **Interject sparingly**: Let employees contribute first
- **End explicitly**: Click End Meeting to generate minutes
- **Follow up**: Convert action items to tickets for accountability

---

## 11. Files & Deliverables

### The File Vault

**Files** is the company vault for all documents and deliverables.

Access via **Files** tab in top navigation.

**What's Stored:**

- **Operator uploads**: Documents you upload
- **Ticket attachments**: Files attached to tickets
- **Agent-created files**: Deliverables generated by employees
- **Meeting materials**: Agendas, minutes, related documents

### Supported File Types

**Text Documents:**
- `.txt`, `.md` (Markdown)
- `.csv`, `.json`
- `.html`

**Office Documents:**
- `.docx` (Word)
- `.xlsx` (Excel)
- `.pptx` (PowerPoint)

**Legacy Requests:**
- `.doc`, `.xls`, `.ppt` requests produce modern `.docx`, `.xlsx`, `.pptx`

### File Features

- **Search**: Full-text search across all files
- **Integrity Checks**: SHA256 verification
- **Ticket Attachments**: Link files to specific tickets
- **Agent-Created Tagging**: Identifies AI-generated content
- **Artifact Provenance**: Links to Autonomy > Artifacts

### Agent-Generated Deliverables

Employees can create files during work:

**Ask in chat or on a ticket:**
- "Create a Markdown brief documenting the API"
- "Generate an Excel report of our Q2 spending"
- "Export the user guide as a PDF"

**Created files:**
- Written to employee workspace
- Copied to Files vault (when available)
- Tagged as `agent-created`
- Recorded in Artifacts with provenance

### Uploading Files

**To Attach to a Ticket:**
1. Open ticket detail panel
2. Click **Attach Files** button
3. Select file from your computer
4. File appears in ticket thread and Files vault

**General Uploads:**
1. Navigate to **Files** tab
2. Click **Upload Files**
3. Select files
4. Files added to vault with metadata

### File Vault Features

- **Browse**: Navigate folders and organize files
- **Search**: Find by name or content
- **Integrity**: Verify file hashes
- **Preview**: View files in-app
- **Delete**: Remove files (with confirmation)

---

## 12. Copilot: Proactive Intelligence

### What is Copilot?

**Copilot** is your proactive analyst. Instead of waiting for you to ask questions, it runs in the background and surfaces insights about:

- Blocked tickets and workflow issues
- Cost spikes and budget concerns
- Org gaps and overloaded employees
- Process drift and recurring problems
- Anomalies that need attention

### Opening Copilot

Three ways to open:

1. **Keyboard shortcut**: **Cmd+Shift+K** (Mac) or **Ctrl+Shift+K** (Windows/Linux)
2. **Toolbar button**: Sparkles icon in top-right corner
3. **Dashboard widget**: "View all (N)" link in Copilot widget

### Insight Cards

Each insight shows:

- **Severity stripe**: Red (critical), Amber (warning), Blue (info)
- **Category icon**: Operational (zap), Cost (dollar), Org (users), Workflow (branch), Anomaly (triangle)
- **Severity badge**: Critical, Warning, Info
- **Category badge**: Which domain the insight addresses
- **Title**: One-line summary
- **Detail**: 2-3 sentences of context
- **Action button** (optional): Suggested action
- **Dismiss (X)**: Remove the insight

### Insight Categories

| Category | What It Surfaces | Example |
|----------|------------------|---------|
| **Operational** | Blocked tickets, missed deadlines, unresolved threads | "3 tickets blocked > 48h" |
| **Cost** | Spend anomalies, runaway loops, cheaper-tier opportunities | "Spend doubled this hour vs. prior 6h" |
| **Org** | Reporting gaps, overloaded employees, unbalanced spans | "14 open tickets, 3× team average" |
| **Workflow** | Process drift, stale meetings, recurring issues | "4 of 5 daily standups ended without minutes" |
| **Anomaly** | Pattern breaks worth investigation | "Three budget-exhausted events in 12 minutes" |

### Severity Levels

| Severity | Meaning | Panel Treatment |
|----------|---------|----------------|
| **Critical** | Active failure or imminent risk | Top of panel, red accent, persistent |
| **Warning** | Slipping process or anomaly worth attention | Default surface, amber accent |
| **Info** | Background observation, low signal | Collapsible "More" section, muted |

### Copilot Settings

Access via **Settings → Runtime → Copilot**:

| Setting | Default | Range | Purpose |
|---------|---------|-------|---------|
| **Enabled** | `true` | true/false | Master switch for all Copilot activity |
| **Interval Minutes** | `5` | 1–60 | How often the analyzer runs (default: every 5 minutes) |
| **Categories** | All 5 | Subset of categories | Which categories the analyzer can surface |

### Choosing Your Cadence

| Hardware | Provider | Recommended Interval |
|---------|----------|-------------------|
| Local Ollama (7-8B) | Any | 5 minutes (default) |
| Cloud providers (Anthropic, OpenAI) | Any | 2-3 minutes |
| Tight budget | Any | 30-60 minutes |
| Large org with many runs | Any | Bump agentic limits first |

### Asking Copilot Questions

The **Ask Copilot** input at the bottom of the sidebar:

Type questions like:
- *"What's blocking the frontend team?"*
- *"Show me cost trends for this week"*
- *"Which employees are overloaded?"*

Copilot grounds answers in:
- Its own prior analysis
- Current company state (tickets, runs, org)
- Audit trail

Copilot runs through the same agentic loop as `Ctrl+K` questions, but with read-only access plus a special tool to query its own insight history.

### Dismissing Insights

Click the **X** on any insight card to dismiss it.

**Feedback Loop:**
- Dismissing 3+ insights in the same category may trigger a weight suggestion
- The Copilot suggests lowering that category's weight
- You can apply or ignore the suggestion

### Exporting Insights

Export active insights for analysis:

1. Open Copilot sidebar
2. Optionally filter by Category, Severity, or Company
3. Click **CSV** or **JSON**
4. File saves locally with timestamp and filter info

### Copilot Best Practices

- **Don't ignore it**: Check Copilot periodically even when things seem fine
- **Use categories**: Filter to focus on what matters right now
- **Act on insights**: Dismissing doesn't fix problems
- **Ask follow-ups**: Use the question input to dig deeper

---

## 13. Autonomy Control Plane

### What is Autonomy?

**Autonomy** is the operator control plane for supervised, governed, and auditable autonomous execution.

Access via **Autonomy** tab in top navigation.

### Autonomy Subviews

| Subview | Purpose | Use When... |
|---------|---------|-----------|
| **Doctor** | Health checks | Before unattended runtime work |
| **Benchmarks** | Scenario testing | Verifying autonomy behavior |
| **Improve** | Self-improvement loop | After failures or stalled sessions |
| **Runtimes** | Execution profiles | Binding employees to profiles |
| **Routines** | Recurring loops | Scheduling repeated operations |
| **Budgets** | Spend governance | Managing cost ceilings |
| **Approvals** | Decision queue | Reviewing authority/budget requests |
| **Artifacts** | Runtime outputs | Reviewing autonomous execution results |
| **Memory** | Long-run context | Inspecting thread digests and checkpoints |
| **Access** | Operator posture | Managing workspace sharing |

### Autonomy Doctor

Run **Doctor** before launching long or unattended work.

**What It Checks:**
- Database integrity
- Recovery readiness (backup exists, not stale)
- Runtime posture (active profiles bound correctly)
- Secrets (provider keys available)
- Provider health (connections working)
- MCP health (extensions accessible)
- Budget blockers (no hard stops active)

**Running Doctor:**
1. Navigate to **Autonomy → Doctor**
2. Click **Run Doctor**
3. Review the generated report
4. Address any critical issues before autonomous work

### Autonomy Benchmarks

Replay deterministic scenarios to verify autonomy mechanics:

1. Navigate to **Autonomy → Benchmarks**
2. Select scenarios to run
3. Click **Run Benchmarks**
4. Review results:
   - Pass rates
   - Duplicate-work prevention
   - Recovery timing
   - Spend
   - Artifact evidence

### Agent Improvement Loop

**Improve** turns operational patterns into correction tickets:

**What It Detects:**
- Repeated `work.failed` events
- `runtime.execution.failed` events
- `runtime.session.stale` events
- Tickets in `blocked` status
- Tickets stale `in-progress` for 48+ hours

**Running Improvement:**
1. Navigate to **Autonomy → Improve**
2. Click **Run Improvement Loop**
3. Team-X inspects recent signals
4. Opens deduped correction tickets for each pattern
5. Assign and work the tickets like normal work

**Deduping:**
- If a pattern already has an open ticket, no duplicate is created
- Tickets labeled `agent-improvement` and `self-improvement`
- Filter for these to track improvement work

### Runtime Profiles

Bind employees to explicit execution profiles:

1. Navigate to **Autonomy → Runtimes**
2. Create runtime profile:
   - Name
   - Kind (Internal, Local, External)
   - Configuration
3. Bind employees to profiles
4. Validate profiles before binding

**Profile Kinds:**
- **Internal**: Team-X's built-in agent runtime
- **Local**: Local MCP servers and tools
- **External**: Hosted services and APIs

### Routines

**Routines** are recurring operating loops that materialize as visible work.

**Creating a Routine:**

1. Navigate to **Autonomy → Routines**
2. Click **Create Routine**
3. Configure:
   - **Name**
   - **Schedule** (when it runs)
   - **Work Template** (what tickets it creates)
4. Enable the routine

**Routine Features:**
- **Schedule**: Cron-style or interval-based
- **Work Template**: Ticket template with placeholders
- **Enabled/Disabled**: Toggle routine activity

### Budgets

**Budgets** enforce spend governance with warnings, hard stops, and approvals.

**Budget Policies:**
- **Company-wide**: Total workspace spend limit
- **Per-employee**: Individual employee limits
- **Per-runtime**: External runtime budgets
- **Per-routine**: Recurring operation budgets

**Budget Features:**
- **Warning threshold**: Alert before hitting limit
- **Hard stop**: Block work when limit exceeded
- **Approval gates**: Require operator approval to continue
- **Ledger**: Complete spend history

### Approvals

**Approvals** unify all decision queues:

- **Authority approvals**: Extension access requests
- **Budget approvals**: Spend limit overrides
- **Planner approvals**: Write-side work confirmation
- **Routine approvals**: Recurring operation changes

**Approval Process:**
1. Navigate to **Autonomy → Approvals**
2. Review pending items with rationale
3. **Approve** or **Deny** with optional note
4. Decision recorded in audit log

### Artifacts

**Artifacts** capture runtime outputs and evidence:

- External runtime outputs
- Agent-generated files
- Routine execution results
- Approval decisions and rationales

### Memory

**Memory** manages long-run conversation context:

**What It Shows:**
- **Digests**: Condensed conversation summaries
- **Checkpoints**: Resumable state for interrupted work
- **Packed Context**: Bounded context envelope for long runs

**Using Memory:**
- Select a thread with recent work
- Inspect current digest and checkpoints
- Review dropped context posture
- Adjust memory settings for future threads

### Operator Access

**Access** manages workspace supervision:

**Access Levels:**
- **Owner**: Bootstrap local control
- **Invited**: Non-owner local operators
- **Cloud**: Hosted identity placeholders

**Access Features:**
- Invite operators via email
- Set membership roles (operator, reviewer, admin)
- Grant privileges (budget approvals, authority approvals, etc.)
- Link workspace to cloud for hosted identity

---

## 14. Extensions: Skills & MCPs

### What Are Extensions?

**Extensions** expand Team-X capabilities:

- **Skills**: Pre-built agent behaviors and workflows
- **MCP Servers**: Model Context Protocol servers providing tools and resources

Access via **Settings → Extensions & Authority**.

### Skills

**Skills** are packaged agent behaviors you can install.

**Installing a Skill:**

1. Navigate to **Settings → Extensions**
2. Click **Skills Marketplace** button
3. Browse or search available skills
4. Click **Install** on a skill
5. Review requested authority
6. Grant or deny access

**Or Install from Local Folder:**
1. Click **Install from Local**
2. Select skill package folder
3. Install

**Skills Provide:**
- Custom behaviors for specific roles
- Domain expertise and workflows
- Tool integrations
- Specialized outputs

### MCP Servers

**MCP Servers** (Model Context Protocol) provide tools and resources to agents.

**Built-in MCP Templates:**
- Filesystem access
- Database connections
- API integrations
- Development tools

**Adding an MCP Server:**

1. Navigate to **Settings → Extensions**
2. Click **Import MCP Server**
3. Choose from templates or add custom:
   - **Name**
   - **Base URL**
   - Configuration
4. Review requested authority:
   - Filesystem paths
   - Network endpoints
   - Tool capabilities
5. **Import** the server

**Authority Review:**
After importing, review what the MCP can access:
- Filesystem paths
- Network endpoints
- Tool capabilities
- Data access

### Authority Grants

**Authority** controls what extensions can do:

**Granting Authority:**
1. Navigate to **Settings → Extensions → Authority**
2. Review pending requests
3. Each request shows:
   - Extension name and type
   - Requested access (filesystem paths, tools, etc.)
   - Risk level (Low/Medium/High)
4. **Grant** or **Deny** each request

**Authority Types:**
- **Filesystem access**: Read/write paths
- **Network access**: Allowed endpoints
- **Tool usage**: Which tools the extension can invoke
- **Data access**: What data it can read/write

### Extension Best Practices

- **Review before trusting**: Green connection ≠ safe
- **Principle of least privilege**: Grant minimum needed access
- **Monitor usage**: Check audit log for extension activity
- **Revoke when unused**: Remove authority from unused extensions

---

## 15. Settings & Configuration

### Settings Overview

Access **Settings** via top navigation.

### Updater

**Auto-updates:**
- Checks for updates on startup
- Shows release notes
- One-click update installation

**Manual Update:**
- Click **Check for Updates** button
- Download and install latest version

### Runtime

**Runtime Strategy:**

| Strategy | Behavior |
|----------|----------|
| **Auto** | Profiles hardware and picks best strategy automatically |
| **Hybrid** | Local models for simple tasks, cloud for complex |
| **Always-On** | Always uses highest-quality available provider |
| **Lean** | Minimizes resource usage, prefers local models |

**Hardware Profile:**
- Shows detected CPU, RAM, GPU
- Informs strategy selection

**Effective Slot Count:**
- Maximum concurrent agent runs
- Adjusts based on strategy and hardware

### Privacy

**Privacy Tiers:**

| Tier | Data Location | Example Providers |
|------|--------------|-------------------|
| **Local only** | Your machine only | Ollama |
| **Open-Source Cloud** | Third-party servers, open models | Groq, Together, Fireworks |
| **Proprietary Cloud** | Third-party servers, proprietary models | Anthropic, OpenAI, Google |

**Set Privacy Maximum:**
1. Choose your max tier
2. Provider router enforces filter at call time
3. Roles fall back to approved providers

### RAG Configuration

**RAG** (Retrieval-Augmented Generation) improves agent responses with your vault data.

**Settings:**
- **Chunk size**: How large to split documents
- **Overlap**: Overlap between chunks
- **Similarity threshold**: Matching sensitivity

**Use RAG When:**
- You have many documents in Files
- Agents need to reference your documentation
- You want ground-truthed responses

### Concurrency

**Concurrency Caps** limit simultaneous provider calls:

| Provider | Default Cap |
|----------|------------|
| Ollama | 1 |
| Anthropic | 4 |
| OpenAI | 6 |
| Google | 4 |
| Groq | 10 |
| OpenRouter | 8 |
| Together | 6 |
| Fireworks | 6 |

**Adjust Based On:**
- Hardware capabilities (for local)
- Plan tier rate limits (for cloud)
- Budget constraints

### Permissions

**Permissions** control team member access in shared workspaces.

**Set Permissions:**
1. Navigate to **Settings → Permissions**
2. Configure:
   - Who can hire/fire employees
   - Who can create/delete companies
   - Who can manage providers
   - Who can approve budgets
   - Who can manage operators

### Agentic Loop Settings

**Budget Controls:**

| Setting | Default | Range | Purpose |
|---------|---------|-------|---------|
| **Max Steps** | 8 | 1–32 | Limit loop iterations |
| **Max Tokens** | 8000 | 500–50000 | Cumulative token budget |
| **Timeout** | 120s | 10–600s | Wall-clock deadline |

**Choosing Budgets:**
- **Local Ollama 7-8B**: Bump Max Steps to 12-16
- **Local Ollama 14B+**: Defaults work fine
- **Cloud providers**: Defaults fine
- **Investigative questions**: Bump Max Tokens to 20K-30K

### Planner Settings

**Task Planner** handles write-side work (project decomposition, delegation).

**Guardrails:**
- Confirmation gates for destructive or write operations
- Approval requirements for large work
- Validation before execution

### Memory Settings

**Memory** controls long-run conversation context.

**Default Pack Settings:**
- **Pack budget**: How much context to include
- **Recent-turn window**: How many recent turns to keep visible
- **Checkpoint depth**: How many checkpoints to retain

**Use When:**
- Runs feel context-heavy
- You want faster context windows
- Long conversations need checkpoints for resumption

### Portability

**Portability** handles workspace import/export:

**Features:**
- Preview import packages
- Export workspaces as packages
- Save workspace templates
- Review sharing posture

**Export Package:**
1. Navigate to **Settings → Portability**
2. Choose export mode (full/template/redacted)
3. Export creates portable package file

**Import Package:**
1. Click **Import Package**
2. Select package file or GitHub reference
3. Preview what will be imported
4. Configure:
   - New workspace name
   - Secret bindings for providers
5. Import

**What's Included/Excluded:**
- Included: Companies, employees, org structure, tickets, projects, goals, meetings, files, settings
- Excluded: Provider API keys (re-enter after import)

### Copilot Settings

See [Section 12: Copilot](#12-copilot-proactive-intelligence) for full Copilot configuration.

### Backup & Restore

**Backup:**

1. Navigate to **Settings → Backup & Restore**
2. Click **Create Backup**
3. Choose destination
4. Backup includes:
   - Database
   - Vault files
   - Manifest with metadata

**Restore:**

1. Click **Restore**
2. Select `.teamx-backup` archive
3. Confirm (destructive operation)
4. App reloads after restore

**Backup Best Practices:**
- Back up before major changes
- Back up before updates
- Store externally for disaster recovery
- Test restores periodically

---

## 16. Telemetry & Costs

### Telemetry Overview

**Telemetry** provides visibility into system usage, costs, and performance.

Access via **Telemetry** tab in top navigation.

### Telemetry Views

**Company Telemetry:**
- Total runs, tokens, cost
- Provider breakdown
- Timeline view
- Usage statistics

**Employee Telemetry:**
- Per-employee runs and costs
- Model usage patterns
- Performance metrics

**Cost Breakdown:**
- Spend by provider
- Spend by employee
- Spend over time
- Cost-per-token analysis

### Metrics Tracked

**Run Metrics:**
- Total run count
- Total tokens used
- Total cost incurred
- Average latency
- Success/failure rate

**Token Metrics:**
- Input vs output tokens
- Tokens by model
- Tokens by provider
- Cost per thousand tokens

**Latency Metrics:**
- Time to first token
- Total run duration
- Provider latency comparison

### Using Telemetry

**Monitoring Costs:**
- Check daily usage in Company Telemetry
- Review cost breakdown before scaling
- Identify expensive employees or operations

**Optimizing Performance:**
- Compare latency across providers
- Identify slow employees or operations
- Adjust runtime strategy based on data

**Budget Planning:**
- Project future spend based on trends
- Identify cost anomalies
- Track spend against budgets

### Telemetry Best Practices

- **Review regularly**: Check costs weekly
- **Set budgets**: Use Autonomy → Budgets to enforce limits
- **Optimize providers**: Switch between providers based on cost/speed needs
- **Monitor latency**: High latency affects user experience

---

## 17. Audit Trail

### Audit Overview

**Audit** is the complete, append-only evidence trail of everything that happens.

Access via **Audit** tab in top navigation.

### Event Types

**Company Events:**
- Company created, updated, archived, deleted
- Workspace linking, unlinking

**Employee Events:**
- Employee hired, fired, promoted
- Manager changed

**Ticket Events:**
- Ticket created, updated, closed, reopened
- Assignee changed
- Participants added/removed

**Project Events:**
- Project created, updated, deleted
- Goals added, updated, completed

**Meeting Events:**
- Meeting called, ended
- Minutes generated
- Action items created

**Chat Events:**
- Messages sent
- Threads created

**Command Events:**
- Commands executed
- Command parsed

**Work Events:**
- Work completed
- Work failed

**Copilot Events:**
- Analysis run
- Insights surfaced, dismissed, expired
- Weights changed

**Runtime Events:**
- Runtime sessions started, ended
- Checkouts created, released
- Heartbeat received, missed

**Authority Events:**
- Extensions installed, updated, removed
- Authority requested, granted, revoked

**Budget Events:**
- Policies created, updated, deleted
- Warnings triggered
- Hard stops hit

**Approval Events:**
- Approvals requested, approved, denied

### Audit Features

**Filtering:**
- Filter by event type
- Filter by date range
- Filter by specific entities (employee, ticket, etc.)

**Search:**
- Full-text search across all events
- Find specific actions or entities

**Export:**
- Export filtered events for analysis
- JSON and CSV formats

### Reading Audit Events

Each event shows:
- **Timestamp**: When it occurred
- **Event Type**: Category of action
- **Description**: What happened
- **Details**: Relevant IDs, entities, values
- **Payload**: Full event data

### Audit Best Practices

- **Investigate issues**: Use audit to trace root causes
- **Verify compliance**: Check authority changes and approvals
- **Track patterns**: Identify recurring problems
- **Export evidence**: Create records for reviews

---

## 18. Troubleshooting

### Common Issues

**"Employees don't respond to chat"**

Check:
1. Is a provider enabled? (Settings → Providers)
2. Is the provider connection working? (Test Connection button)
3. Is the employee a ticket participant? (Ticket thread wakes only participants)
4. Is the provider API key valid?

**"Agent on ticket doesn't wake after I comment"**

Verify:
1. Is the employee in the ticket's participant section?
2. Is the employee a historical author on that ticket thread?
3. Only participants and historical authors wake on comments

**"Extension appears installed but doesn't work"**

Review:
1. Authority requests - were they granted?
2. Trust state - is the extension trusted?
3. Configuration - is it set up correctly?

**"Workspace feels empty"**

Confirm:
1. Providers configured and enabled?
2. Employees hired?
3. Real work surfaces exist (tickets, projects, goals)?

**"Copilot never produces insights"**

Check:
1. Is Copilot enabled? (Settings → Runtime → Copilot)
2. Is the interval reasonable? (Default 5 min)
3. Are categories selected? (Empty = all categories active)
4. Check audit for `copilot.analyzed` errors

**"Run completed with 'budget_exhausted'"**

Adjust:
1. Increase `agentic_max_steps` (Settings → Runtime → Agentic Loop)
2. Increase `agentic_max_tokens`
3. Switch to faster provider

**"The classifier doesn't understand me"**

Below 0.5 confidence, the palette routes to `complex_request`:
- You'll still get an answer, just via the agentic loop
- Try rephrasing with recognized verbs: "hire", "fire", "assign", "create", "close", "call", "end", "show", "find"

### Diagnostic Tools

**Autonomy Doctor:**
Run before autonomous work to catch issues early:
1. Navigate to **Autonomy → Doctor**
2. Click **Run Doctor**
3. Review report for issues

**Audit Log:**
Trace root causes:
1. Navigate to **Audit**
2. Filter by relevant event types
3. Follow the event chain to understand what happened

**Telemetry:**
Identify resource issues:
1. Navigate to **Telemetry**
2. Check provider performance
3. Review employee-specific metrics

### Getting Help

If issues persist:
1. Check this user guide's relevant sections
2. Run Autonomy Doctor
3. Review audit trail for error events
4. Export diagnostics for support

---

## 19. Best Practices

### Workspace Organization

**Start Simple:**
1. Hire a CEO first for strategic direction
2. Add specialists as needed (engineer, designer, etc.)
3. Build depth before breadth

**Use Hierarchies:**
- Officers set strategy
- VPs own functions
- Managers own teams
- ICs execute

**Match Roles to Goals:**
- If shipping an MVP: Hire engineers, a PM, and QA
- If analyzing data: Hire data scientists and analysts
- If designing: Hire designers, copywriter, brand specialist

### Work Management

**Use Tickets for:**
- Durable work items
- Multi-employee collaboration
- Work that connects to larger goals
- Deliverables with deadlines

**Use Chat for:**
- Quick questions
- Clarifications
- Status checks
- Informal collaboration

**Create Projects for:**
- Related initiatives
- Time-bound initiatives
- Cross-functional work

**Set Goals for:**
- Measurable outcomes
- Target dates
- Quantifiable achievements

**Use Schedule for:**
- Coordination of deadlines
- Reminders and wakeups
- Time-sensitive tasks

### Cost Management

**Optimize Provider Choice:**
- Use local models for simple tasks
- Use cloud models for complex reasoning
- Match model tier to task complexity

**Set Budgets:**
- Company-wide caps for total spend
- Employee caps to limit individual usage
- Runtime and routine caps for external work

**Monitor Telemetry:**
- Check costs weekly
- Review per-employee spend
- Identify expensive operations

### Security & Authority

**Review Authority Requests:**
- Check what extensions can access
- Grant minimum needed access
- Revoke unused authority

**Use Privacy Tiers:**
- Local only: Maximum privacy, Ollama only
- Open-Source Cloud: Community models, third-party servers
- Proprietary Cloud: Best performance, data leaves your machine

**Back Up Regularly:**
- Before major changes
- Before updates
- Store externally for disaster recovery

### Team Collaboration

**Clear Communication:**
- Write clear ticket descriptions
- Provide context in chat
- Use meetings for alignment

**Use Meetings Effectively:**
- Have clear agendas
- Invite only who's needed
- Convert action items to tickets

**Leverage Participants:**
- Add relevant expertise to tickets
- Wake up historical authors when needed
- Use participant selector to include right people

### Autonomy & Governance

**Run Doctor First:**
- Before unattended work
- After major changes
- When issues arise

**Use Benchmarks:**
- Verify autonomy behavior
- Test before deploying routines
- Maintain confidence in system

**Review Approvals:**
- Check for pending authority/budget requests
- Approve or deny with rationale
- Track decision patterns

### Long-Running Work

**Monitor Memory:**
- Check digests for context drift
- Use checkpoints for resumable state
- Adjust pack settings for context needs

**Use Routines:**
- Schedule repeated operations
- Automate regular maintenance
- Materialize visible work

**Track Artifacts:**
- Review outputs from autonomous runs
- Verify deliverable quality
- Maintain evidence trail

---

## 20. Keyboard Shortcuts

### Global Shortcuts

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| **Open Command Palette** | `Ctrl+K` | `Cmd+K` |
| **Open Copilot Sidebar** | `Ctrl+Shift+K` | `Cmd+Shift+K` |
| **Close dialog/palette** | `Esc` | `Esc` |
| **Submit form** | `Enter` | `Return` |
| **Confirm destructive action** | `Enter` on Confirm button | `Return` on Confirm button |

### Navigation Shortcuts

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| **Switch to Dashboard** | `Alt+D` | `Cmd+D` |
| **Switch to Autonomy** | `Alt+A` | `Cmd+A` |
| **Switch to Org** | `Alt+O` | `Cmd+O` |
| **Switch to Projects** | `Alt+P` | `Cmd+P` |
| **Switch to Tickets** | `Alt+T` | `Cmd+T` |
| **Switch to Meetings** | `Alt+M` | `Cmd+M` |
| **Switch to Chat** | `Alt+C` | `Cmd+C` |
| **Switch to Files** | `Alt+F` | `Cmd+F` |
| **Switch to Telemetry** | `Alt+G` | `Cmd+G` |
| **Switch to Audit** | `Alt+L` | `Cmd+L` |
| **Switch to Settings** | `Alt+S` | `Cmd+,` |

### Editing Shortcuts

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| **Send message** | `Ctrl+Enter` | `Cmd+Return` |
| **New line in composer** | `Shift+Enter` | `Shift+Return` |
| **Navigate history** | `ArrowUp`/`ArrowDown` | `ArrowUp`/`ArrowDown` |
| **Select all** | `Ctrl+A` | `Cmd+A` |
| **Copy** | `Ctrl+C` | `Cmd+C` |
| **Paste** | `Ctrl+V` | `Cmd+V` |
| **Undo** | `Ctrl+Z` | `Cmd+Z` |
| **Redo** | `Ctrl+Y` / `Ctrl+Shift+Z` | `Cmd+Shift+Z` |

### Dashboard Shortcuts

| Action | Shortcut |
|--------|----------|
| **Toggle Agent Runs panel** | Click Agent Runs button |
| **Toggle Employee Queues panel** | Click Employee Queues button |
| **Reset layout to default** | Click Reset Layout button |
| **Open selected run thread** | Click on run card |
| **Open selected employee chat** | Click on employee row |
| **Navigate dashboard subviews** | Click subview tabs |

---

## Quick Reference

### First 5 Minutes

1. ✅ Enable a provider (Settings → Providers)
2. ✅ Chat with an employee (click employee card)
3. ✅ Create a ticket (Ctrl+K → "File a ticket...")
4. ✅ Check Mission Control (should show live activity)
5. ✅ Review Copilot insights (Cmd+Shift+K)

### Essential Tabs

| Tab | Primary Purpose | Key Action |
|------|-----------------|------------|
| **Dashboard** | See what's happening | Monitor operations, check queues |
| **Autonomy** | Govern execution | Doctor, budgets, approvals, runtimes |
| **Org** | Manage workforce | Hire, fire, promote, org chart |
| **Projects** | Organize work | Create projects, goals, view schedule |
| **Tickets** | Track work | Kanban board, create/assign work |
| **Meetings** | Collaborate | Call meetings, review minutes |
| **Chat** | Communicate | Direct conversations, threads |
| **Files** | Store documents | Upload, download, agent files |
| **Telemetry** | Measure performance | Costs, usage, latency |
| **Audit** | Review evidence | Full event log, filtering, export |
| **Settings** | Configure system | Providers, runtime, privacy, backup |

### Core Concepts

- **Workspaces**: Isolated environments for different teams/companies
- **Employees**: AI agents with role specifications
- **Tickets**: Durable work items with kanban tracking
- **Projects**: Organize related work into initiatives
- **Goals**: Measurable outcomes with targets
- **Meetings**: Structured collaboration with minutes and action items
- **Chat**: Direct conversations and thread management
- **Files**: Document vault with agent-generated deliverables
- **Copilot**: Proactive insights and pattern detection
- **Autonomy**: Governance for supervised execution
- **Extensions**: Skills and MCPs that expand capabilities
- **Telemetry**: Usage and cost analytics
- **Audit**: Complete evidence trail

---

## Need More Help?

- **In-App User Guide**: Click **User Guide** in left sidebar for role-based onboarding
- **Audit Trail**: Review specific events to understand what happened
- **Autonomy Doctor**: Run diagnostics to catch configuration issues
- **Command Palette**: Ask Team-X questions directly via `Ctrl+K`

---

**Version**: 1.0
**Last Updated**: 2026-05-03
**Product Phase**: Phase 6
**Release**: Team-X v1.1.0
