# Getting Started

This guide walks you through installing Team-X and having your first conversation with an AI employee.

## Installation

### Download

Download the installer for your platform from the Team-X releases page:

- **Windows**: Run the `.exe` installer (NSIS). Follow the prompts.
- **macOS**: Open the `.dmg` and drag Team-X to Applications.
- **Linux**: Run the `.AppImage` directly, or install the `.deb` package.

### From Source

If you prefer to build from source:

```bash
git clone https://github.com/strategia-x/team-x.git
cd team-x
pnpm install
pnpm dev
```

Requires Node.js 20+ and pnpm 9+.

## First Boot

When Team-X launches for the first time, it:

1. **Creates the local database** — a SQLite file in your app data directory
2. **Runs migrations** — sets up all tables (employees, tickets, meetings, vault, etc.)
3. **Seeds a starter company** — "Strategia-X" with a CEO and a Senior Fullstack Engineer
4. **Seeds provider templates** — Ollama (local) and Anthropic, both disabled by default

You'll see the Dashboard with two employee cards. The app is ready.

## Setting Up a Local LLM

Team-X is designed to work fully offline with local models. The recommended setup:

1. Install Ollama for your platform
2. Start the Ollama service:
   ```bash
   ollama serve
   ```
3. Pull a model:
   ```bash
   ollama pull llama3.1:8b
   ```
4. In Team-X, go to **Settings > Providers** and toggle Ollama **on**

Team-X auto-detects Ollama at `http://127.0.0.1:11434`.

## Your First Conversation

1. Click on any employee card in the Dashboard (e.g., the CEO)
2. The **Chat Drawer** opens on the right
3. Type a message in the composer and press **Ctrl/Cmd+Enter**, or click the send button
4. Watch the agent think and respond in real-time — you'll see the token stream as it generates

The agent's response is informed by its role specification. The CEO thinks strategically; the engineer thinks technically.

## The Interface

### Top Bar

The top bar contains navigation tabs:

| Tab | Description |
|-----|-------------|
| Dashboard | Mission Control, timeline, stream, floor, commands, live queues, runtime signals, and telemetry snapshots |
| Autonomy | Doctor checks, benchmarks, agent self-improvement, runtimes, routines, budgets, approvals, artifacts, memory, and operator access |
| Org | Org chart visualization and employee structure |
| Projects | Project cards, goals, linked tickets, target dates, schedule calendar, and progress tracking |
| Tickets | Kanban board, ticket detail, due dates, participants, attachments, comments, and ticket-thread discussion |
| Meetings | Meeting history and the "Call Meeting" action |
| Chat | Direct conversations, the thread roster, ticket-thread previews, agent conversations, and Copilot transcripts |
| Files | File vault with search, integrity checks, ticket attachments, and agent-created deliverables |
| Telemetry | Usage stats, cost analysis, provider breakdown |
| Audit | Append-only event log with filters and export |
| Settings | Providers, runtime strategy, privacy, backup, updates, extensions, memory, and portability |

### Sidenav

The left sidenav shows:
- **Company switcher** — switch between multiple AI organizations
- **Employee list** — quick access to chat with any employee
- **Threads** — open the communication roster without leaving your current work context
- **Autonomy** — jump to the operator control plane
- **User Guide** — role-based onboarding and deep links into live setup surfaces
- **Status indicators** — agent activity at a glance

### Dashboard Subviews

The Dashboard has 5 views accessible via subtabs:
- **Mission Control** — operations-first view of runs, queues, commands, autonomy posture, and telemetry
- **Timeline** — chronological event feed
- **Stream** — raw LLM output from all agents
- **Floor** — grid layout of employee activity
- **Commands** — recent command-palette operations

## Your First Generated File

Once providers are configured and an employee has execution tools enabled, you can ask that employee to create a concrete file deliverable from chat or a ticket. Team-X supports:

- Text deliverables: `.txt`, `.md`, `.csv`, `.json`, `.html`
- Office deliverables: `.docx`, `.xlsx`, `.pptx`
- Legacy Office wording: `.doc`, `.xls`, and `.ppt` requests are produced as modern `.docx`, `.xlsx`, and `.pptx` files

Generated files are written inside the employee workspace. When vault storage is available, Team-X also copies the file into **Files**, tags it as `agent-created`, records SHA256 metadata, and adds artifact provenance under **Autonomy > Artifacts**.

## Next Steps

- Hire more employees from the 57-role catalog.
- Create your first project with goals and tickets.
- Review the schedule calendar for deadlines and future agent wakeups.
- Review Files and generated deliverables.
- Add cloud providers for more powerful models.
- Review the Autonomy control plane before unattended runtime work.
- Set up backups to protect your data.
