# Getting Started

This guide walks you through installing Team-X and having your first conversation with an AI employee.

## Installation

### Download

Download the installer for your platform from the [Releases page](https://github.com/strategia-x/team-x/releases):

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

1. Install [Ollama](https://ollama.com) for your platform
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
3. Type a message in the composer and press Enter
4. Watch the agent think and respond in real-time — you'll see the token stream as it generates

The agent's response is informed by its role specification. The CEO thinks strategically; the engineer thinks technically.

## The Interface

### Top Bar

The top bar contains navigation tabs:

| Tab | Description |
|-----|-------------|
| Dashboard | Employee cards, timeline, stream, floor, and org views |
| Chat | Thread list with all conversations |
| Tickets | Kanban board for task management |
| Projects | Project cards and goal tracking |
| Meetings | Meeting history and the "Call Meeting" action |
| Telemetry | Usage stats, cost analysis, provider breakdown |
| Files | File vault with search and integrity checks |
| Audit | Append-only event log with filters and export |
| Settings | Providers, runtime strategy, privacy, backup, updates |

### Sidenav

The left sidenav shows:
- **Company switcher** — switch between multiple AI organizations
- **Employee list** — quick access to chat with any employee
- **Status indicators** — agent activity at a glance

### Dashboard Subviews

The Dashboard has 5 views accessible via subtabs:
- **Cards** — employee cards with live token stream previews
- **Timeline** — chronological event feed
- **Stream** — raw LLM output from all agents
- **Floor** — grid layout of employee activity
- **Org** — embedded org chart visualization

## Next Steps

- [Hire more employees](hiring-employees.md) from the 55-role catalog
- [Create your first project](managing-projects.md) with goals and tickets
- [Add cloud providers](configuring-providers.md) for more powerful models
- [Set up backups](backup-and-restore.md) to protect your data
