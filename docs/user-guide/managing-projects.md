# Managing Projects

Team-X organizes work into a three-tier hierarchy: **Goals** set the direction, **Projects** define the scope, and **Tickets** track the tasks.

## Goals

Goals are company-level objectives that give your AI organization purpose.

### Creating a Goal

1. Navigate to the **Projects** tab
2. Switch to the **Goals** subtab
3. Click **Create Goal**
4. Enter a name (e.g., "Launch MVP by Q3") and description
5. Click **Create**

### Tracking Progress

Each goal displays a progress bar calculated from its linked projects. As projects complete, the goal's progress advances automatically.

### Goal Detail Panel

Click on a goal to open its detail panel showing:
- Goal description and metadata
- Linked projects with their individual progress
- Overall completion percentage

## Projects

Projects are scoped initiatives linked to a goal, with a project lead and connected tickets.

### Creating a Project

1. In the **Projects** tab, click **Create Project**
2. Fill in:
   - **Name** — a descriptive project title
   - **Description** — scope and context
   - **Goal** — link to a parent goal (optional)
   - **Lead** — assign a project lead from your employees
3. Click **Create**

### The Projects Kanban

Projects are displayed as cards in a kanban-style board with 4 columns:

| Column | Meaning |
|--------|---------|
| Open | Not yet started |
| In Progress | Active work underway |
| Blocked | Waiting on a dependency |
| Done | Completed |

Drag project cards between columns to update their status.

### Linking Tickets

1. Open a project detail panel
2. Use **Link Ticket** to connect existing tickets to the project
3. Linked tickets appear in the project detail and contribute to progress tracking

## Tickets

Tickets are the atomic unit of work in Team-X. Agents pick up tickets, work on them, and report back.

### Creating a Ticket

1. Navigate to the **Tickets** tab
2. Click **Create Ticket**
3. Fill in:
   - **Title** — concise description of the task
   - **Description** — detailed requirements and context
   - **Priority** — Low, Medium, High, or Critical
   - **Assignee** — optionally assign to an employee immediately
4. Click **Create**

### The Tickets Kanban

Tickets live on a 4-column kanban board:

| Column | Status |
|--------|--------|
| Open | New, unassigned or waiting to start |
| In Progress | Agent is actively working |
| Blocked | Agent hit a dependency or needs input |
| Done | Work completed |

Drag tickets between columns to manually update status. Agents also update status automatically as they work.

### Automatic Agent Assignment

When you assign a ticket to an employee, Team-X:
1. Creates a thread for the ticket discussion
2. Sends the ticket details to the assigned agent
3. The orchestrator queues the agent for a run
4. The agent reads the ticket, thinks through its role spec, and responds with its approach or completed work

### Ticket Detail Panel

Click on a ticket to see:
- Full description and metadata
- Discussion thread (messages from you and the agent)
- Attached files (from the vault)
- Priority and status

### Adding Comments

Type in the ticket detail panel's composer to add a comment. If the ticket is assigned, the agent receives your comment and responds — creating a natural back-and-forth workflow.

## Workflow Example

Here's a typical workflow:

1. **Set a goal**: "Ship user authentication system"
2. **Create a project**: "Auth Module" linked to the goal, led by the Tech Lead
3. **File tickets**:
   - "Design auth database schema" assigned to the Senior Database Engineer
   - "Implement JWT token service" assigned to the Senior Backend Engineer
   - "Build login/signup UI" assigned to the Senior Frontend Developer
4. **Watch the agents work** via the Dashboard stream and timeline views
5. **Review and iterate** by commenting on tickets
6. **Track progress** via the goal's progress bar as tickets move to Done
