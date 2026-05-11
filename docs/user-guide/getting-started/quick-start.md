# Quick Start Guide

**Get up and running with Team-X in 15 minutes**

---

## Welcome to Team-X

Team-X is your AI-powered workforce desktop application. Hire AI employees with curated roles, assign work through tickets, and watch as agents collaborate autonomously while you maintain oversight through Mission Control.

**What you'll accomplish in this guide:**
1. Install and launch Team-X
2. Create your first workspace
3. Hire your first employee
4. Create and complete your first ticket
5. Navigate Mission Control Dashboard

**Time required:** 15 minutes

---

## Step 1: Install Team-X (2 minutes)

### Download

1. Visit [github.com/Git-Rocky-Stack/Team-X/releases](https://github.com/Git-Rocky-Stack/Team-X/releases)
2. Select your operating system:
   - **Windows 10/11:** Download `Team-X-Setup-windows-x64.exe`
   - **macOS 11+ (Intel):** Download `Team-X-Setup-macos-x64.dmg`
   - **macOS 11+ (Apple Silicon):** Download `Team-X-Setup-macos-arm64.dmg`
   - **Linux:** Download `Team-X-Setup-linux-x64.AppImage`

### Install

**Windows:**
```
Double-click Team-X-Setup-windows-x64.exe
→ Click "Install" → Wait for installation → Click "Finish"
```

**macOS:**
```
Double-click Team-X-Setup-macos-*.dmg
→ Drag Team-X to Applications folder
→ Open Launchpad → Click Team-X
```

**Linux:**
```
chmod +x Team-X-Setup-linux-x64.AppImage
./Team-X-Setup-linux-x64.AppImage
```

### First Launch

1. Team-X opens to the **Welcome Screen**
2. Click **"Create Account"** or **"Sign In"**
3. Complete account setup (email, password, workspace name)

---

## Step 2: Create Your First Workspace (2 minutes)

Your workspace is your company — where employees work, tickets are tracked, and budgets are managed.

### Workspace Configuration

When you first sign in, you'll see the **Workspace Setup Wizard**:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Create Your Workspace                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Workspace Name:                                                    │
│  [My Company_________________________________________]             │
│                                                                     │
│  Purpose:                                                           │
│  ○ Product Development                                              │
│  ○ Agency/Client Work                                               │
│  ○ Personal Projects                                                │
│  ○ Other                                                           │
│                                                                     │
│  Monthly Budget:                                                    │
│  [$100______________] (recommended for new users)                   │
│                                                                     │
│  Employee Quota:                                                    │
│  [5 employees] (basic tier)                                         │
│                                                                     │
│                      [Cancel]           [Create Workspace] →        │
└─────────────────────────────────────────────────────────────────────┘
```

**Recommended Settings for First-Time Users:**
- **Workspace Name:** Your company or project name
- **Purpose:** Select what matches your use case
- **Monthly Budget:** $100 (prevents overspending while learning)
- **Employee Quota:** 5 employees (sufficient for most projects)

### Click "Create Workspace"

Team-X initializes your workspace and opens to **Mission Control Dashboard**.

---

## Step 3: Hire Your First Employee (3 minutes)

Employees are AI agents with curated roles. Each employee has specialized skills, personality traits, and work styles.

### Open the Employees Panel

**From Mission Control Dashboard:**
```
Click "Employees" in left sidebar
→ Or press Ctrl+E (Windows) / Cmd+E (Mac)
```

### Hire Your First Employee

1. Click the **"Hire Employee"** button (top-right)

2. **Select a Role** from the role browser:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Hire Employee — Role Selection                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Categories:                                                        │
│  [Engineering] [Design] [Product] [Marketing] [Data] [Operations]   │
│                                                                     │
│  Featured Roles for New Users:                                      │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Full Stack Engineer                                         │   │
│  │                                                             │   │
│  │ Expert in: React, TypeScript, Node.js, Python               │   │
│  │ Personality: Detail-oriented, collaborative, proactive      │   │
│  │ Work Style: Balanced speed vs. quality, prefers async       │   │
│  │                                                             │   │
│  │                      [Select Role] →                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Browse All 57 Roles]            [Cancel]                         │
└─────────────────────────────────────────────────────────────────────┘
```

**Recommended First Hire:** Full Stack Engineer (most versatile for general tasks)

3. **Name Your Employee:**

```
Employee Name: [Alex_____________________]
(Default name based on role — customize if you want)
```

4. **Confirm Hire:**

Click **"Hire Employee"** → Alex joins your workspace!

### Verify Your Employee

From the Employees panel, you should see:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Employees — My Company                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Active Employees: 1                                                │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Alex — Full Stack Engineer                                   │   │
│  │                                                             │   │
│  │  Status: 🟢 Idle (available for work)                        │   │
│  │  Tickets Completed: 0                                        │   │
│  │  Avg. Completion Time: --                                     │   │
│  │  Current Assignments: None                                    │   │
│  │                                                             │   │
│  │  [View Profile] [Assign Ticket] [Chat]                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [+ Hire Employee]                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Step 4: Create Your First Ticket (3 minutes)

Tickets are how you assign work to employees. A ticket has a title, description, assignee, and priority.

### Open the Tickets Panel

**From Mission Control Dashboard:**
```
Click "Tickets" in left sidebar
→ Or press Ctrl+T (Windows) / cmd+T (Mac)
```

### Create a New Ticket

1. Click the **"New Ticket"** button (top-right)

2. **Fill in Ticket Details:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  New Ticket                                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Title:                                                              │
│  [Create a simple React component_________________________]         │
│                                                                     │
│  Description:                                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Create a React button component with the following:          │   │
│  │                                                             │   │
│  │ 1. Props: text (string), onClick (function)                 │   │
│  │ 2. Styled with Tailwind CSS                                 │   │
│  │ 3. Include hover and active states                          │   │
│  │ 4. Write unit tests using React Testing Library             │   │
│  │ 5. Add JSDoc comments                                       │   │
│  │                                                             │   │
│  │ Put the component in src/components/Button.tsx             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Assignee:                                                          │
│  [Alex ▼] (Full Stack Engineer)                                     │
│                                                                     │
│  Priority:                                                          │
│  ○ Low  ● Normal  ○ High  ○ Critical                               │
│                                                                     │
│  Participants (optional):                                           │
│  [+ Add Participant]                                                │
│                                                                     │
│  Dependencies (optional):                                           │
│  [+ Add Dependency]                                                 │
│                                                                     │
│                      [Cancel]           [Create Ticket] →           │
└─────────────────────────────────────────────────────────────────────┘
```

3. **Click "Create Ticket"**

Your ticket appears in the Tickets panel:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Tickets — My Company                                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Filters: [All] [Open] [In Progress] [Done]                          │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  #1: Create a simple React component                         │   │
│  │                                                             │   │
│  │  Status: 📥 Open                                            │   │
│  │  Assignee: Alex (Full Stack Engineer)                       │   │
│  │  Priority: Normal                                           │   │
│  │  Created: Just now                                          │   │
│  │                                                             │   │
│  │  [View Ticket] [Start Agent] [Edit] [Delete]                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [+ New Ticket]                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Step 5: Run Your First Agent (3 minutes)

Now watch as Alex works on your ticket autonomously.

### Start the Agent

1. From the ticket, click **"Start Agent"**

2. Team-X switches to the **Agent Runs Panel** and Alex begins working:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Agent Run — #1: Create a simple React component                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Employee: Alex (Full Stack Engineer)                                │
│  Provider: Anthropic (Claude Opus 4.7)                               │
│  Runtime: local-default                                              │
│  Budget: $5.00 (estimated)                                          │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Agent Stream                                                │   │
│  │                                                             │   │
│  │  ⏳ Alex is thinking...                                      │   │
│  │                                                             │   │
│  │  I'll create a React button component with Tailwind          │   │
│  │  styling, hover/active states, unit tests, and JSDoc         │   │
│  │  comments. Let me start by creating the component file.     │   │
│  │                                                             │   │
│  │  [Tool: Read] src/components/                              │   │
│  │  → Directory exists.                                      │   │
│  │                                                             │   │
│  │  [Tool: Write] src/components/Button.tsx                  │   │
│  │  → Created Button.tsx (47 lines)                          │   │
│  │                                                             │   │
│  │  [Tool: Write] src/components/Button.test.tsx             │   │
│  │  → Created Button.test.tsx (32 lines)                     │   │
│  │                                                             │   │
│  │  Component created with Tailwind styling, hover state       │   │
│  │  (hover:bg-blue-600), active state (active:scale-95),      │   │
│  │  and unit tests covering props, click handler, and         │   │
│  │  rendering. Let me verify the tests pass.                  │   │
│  │                                                             │   │
│  │  [Tool: Bash] npm test -- Button.test.tsx                  │   │
│  │  → PASS: All 3 tests passing                              │   │
│  │                                                             │   │
│  │  ✅ Component complete! Tests passing. Ready for review.   │   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Status: 🟢 Completing...                                           │
│  Duration: 2m 34s                                                   │
│  Spend: $0.87                                                       │
│                                                                     │
│  [View Artifacts] [Cancel]                                           │
└─────────────────────────────────────────────────────────────────────┘
```

### Review the Work

When Alex completes the ticket, the status changes to **"Done"**:

1. Click **"View Artifacts"** to see what Alex created:
   - `src/components/Button.tsx` — The React component
   - `src/components/Button.test.tsx` — Unit tests

2. **Review the code** in the artifact viewer

3. **Mark ticket as Done:**
   ```
   Click "Approve" in the ticket → Ticket marked complete ✅
   ```

---

## Step 6: Explore Mission Control Dashboard (2 minutes)

Now that you've completed your first ticket, explore the dashboard.

### Dashboard Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Mission Control — My Company                                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌──────────────────────┐ │
│  │   Active Runs: 1     │  │   Idle Employees: 0  │  │   Tickets: 1 Done   │ │
│  │   Spend Today: $0.87 │  │   Budget: $99.13     │  │   This Month: $0.87 │ │
│  └───────────────────────┘  └───────────────────────┘  └───────────────────────┘ │
│                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐ │
│  │  Active Runs                                                                │ │
│  ├─────────────────────────────────────────────────────────────────────────────┤ │
│  │  No active runs                                                             │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐ │
│  │  Recent Tickets                                                              │ │
│  ├─────────────────────────────────────────────────────────────────────────────┤ │
│  │  ✅ #1: Create a simple React component — Done — Alex — 2m 34s              │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐ │
│  │  Copilot Insights                                                            │ │
│  ├─────────────────────────────────────────────────────────────────────────────┤ │
│  │  ℹ️  INFO • WORKFLOW                                                         │ │
│  │  First ticket completed successfully! Consider hiring more employees         │ │
│  │  to parallelize work. Your workspace is healthy.                             │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Key Panels

- **Active Runs:** See which employees are working right now
- **Recent Tickets:** Track ticket progress and completion
- **Copilot Insights:** Proactive recommendations for optimization

### Navigation

Use the left sidebar to navigate:

| Panel | Keyboard Shortcut | Purpose |
|-------|-------------------|---------|
| Mission Control | `Ctrl+D` / `Cmd+D` | Dashboard overview |
| Tickets | `Ctrl+T` / `Cmd+T` | Ticket management |
| Employees | `Ctrl+E` / `Cmd+E` | Employee roster |
| Autonomy | `Ctrl+A` / `Cmd+A` | Runtimes, routines, budgets |
| Files | `Ctrl+F` / `Cmd+F` | Deliverables and artifacts |
| Chat | `Ctrl+C` / `Cmd+C` | Team communication |
| Settings | `Ctrl+,` / `Cmd+,` | Configuration |

---

## Next Steps

You've completed your first ticket! Here's what to do next:

### 1. Hire More Employees

Build a well-rounded team:

**For Product Development:**
- Full Stack Engineer
- UI/UX Designer
- Product Manager
- QA Engineer

**For Agency Work:**
- Frontend Developer
- Backend Developer
- Project Manager
- Content Writer

### 2. Create Complex Tickets

Try multi-step tasks:
- Feature development with multiple components
- Bug fixes with root cause analysis
- Documentation updates
- Code reviews

### 3. Use the Command Palette

Press `Ctrl+K` / `Cmd+K` and type natural language commands:

```
"Create a ticket for fixing the login bug"
"Hire a backend engineer named Sarah"
"Show me all open tickets assigned to Alex"
"What's our spend this month?"
```

### 4. Set Up Routines

Automate recurring work:
- Daily code reviews
- Weekly status reports
- Security scans
- Cost monitoring

### 5. Explore Advanced Features

- **Autonomy Control Plane:** Configure budgets, approvals, and governance
- **Provider Routing:** Switch between Anthropic, OpenAI, and Ollama
- **Multi-Workspace Operations:** Manage multiple client projects
- **MCP Servers:** Extend capabilities with custom tools

---

## Getting Help

### Documentation

- **Comprehensive User Guide:** [Full documentation](./comprehensive-user-guide.md)
- **Real-World Scenarios:** [Learn by example](./scenarios/)
- **Troubleshooting:** [Common issues](./troubleshooting.md)
- **FAQ:** [Frequently asked questions](./faq.md)

### Support

- **GitHub Issues:** [github.com/Git-Rocky-Stack/Team-X/issues](https://github.com/Git-Rocky-Stack/Team-X/issues) — Bug reports
- **GitHub Discussions:** [github.com/Git-Rocky-Stack/Team-X/discussions](https://github.com/Git-Rocky-Stack/Team-X/discussions) — Q&A and ideas

Team-X is open-source and community-supported — there is no hosted support email or chat server.

### Keyboard Shortcuts

Press `?` anywhere in Team-X to see all available keyboard shortcuts.

---

**Congratulations!** You've completed the Quick Start Guide. You're ready to build your AI-powered workforce.

Happy building! 🚀
