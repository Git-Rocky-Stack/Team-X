# Managing Projects

Team-X organizes work into a three-tier hierarchy: **Goals** set the direction, **Projects** define the scope, and **Tickets** track the tasks.

## Goals

Goals are company-level objectives that give your AI organization purpose.

### Creating a Goal

1. Navigate to the **Projects** tab
2. Switch to the **Goals** subtab
3. Click **Create Goal**
4. Enter a name (e.g., "Launch MVP by Q3") and description
5. Optionally set a **Target Date** so the goal appears on the schedule calendar
6. Click **Create**

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
   - **Target Date** — optional deadline that appears on the schedule calendar
3. Click **Create**

### The Projects Kanban

Projects are displayed as cards in a kanban-style board with 4 columns:

| Column | Meaning |
|--------|---------|
| Planning | Not yet started |
| Active | Active work underway |
| Completed | Work completed |
| Archived | Removed from active execution without deleting history |

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
   - **Due Date** — optional deadline that appears on the schedule calendar
4. Click **Create**

### Due Dates and Schedule Visibility

Tickets, projects, and goals can all carry dates:

- Ticket **Due Date** becomes a read-only **Ticket due** entry in the Schedule subtab.
- Project **Target Date** becomes a read-only **Project target** milestone.
- Goal **Target Date** becomes a read-only **Goal target** milestone.

Use these source dates when the deadline belongs to the work record itself. Use manual schedule items when you need a separate reminder, follow-up, milestone, or future agent wakeup.

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

### Ticket Participants

Ticket assignment is the owner signal, but participants are the collaboration set. Use the **Participants** section in the ticket detail panel to add or remove employees from an existing ticket thread.

- Adding a participant creates the ticket thread if needed, adds the employee to the thread membership, posts a system note, and wakes that employee into the ticket context.
- Removing a participant removes that employee from the ticket thread. If the removed employee was the current assignee, Team-X clears the assignee and reopens the ticket unless it was already done.
- System employees are excluded from participant membership; ticket participants must be regular employees in the same company.
- Participant changes emit `ticket.participantAdded` and `ticket.participantRemoved` events so the UI, audit trail, and ticket caches stay current.

Use this instead of managing durable tasking only from chat. If Iris, Carolyn, or any other employee should stay accountable to a ticket, put them on the ticket.

### Ticket Detail Panel

Click on a ticket to see:
- Full description and metadata
- Discussion thread (messages from you and the agent)
- Ticket participants, including owner and collaborators
- Attached files (from the vault)
- Ticket memory digest and checkpoint access when the ticket has a thread
- Priority and status

### File Deliverables

Agents can create files as part of ticket work when execution tools are enabled. Supported outputs include text files (`.txt`, `.md`, `.csv`, `.json`, `.html`) and Office files (`.docx`, `.xlsx`, `.pptx`). If you ask for legacy `.doc`, `.xls`, or `.ppt`, Team-X creates the modern Office equivalent.

When vault storage is available, generated files are copied into **Files**, tagged `agent-created`, and surfaced in **Autonomy > Artifacts** with the creating employee as provenance. Attach the generated vault file back to the ticket when it should remain part of the ticket record.

### Adding Comments

Type in the ticket detail panel's composer to add a comment. Press **Enter** to send, or **Shift+Enter** for a new line.

When a human comments on a ticket, Team-X wakes every employee participant and historical employee author on that ticket thread. That matters for multi-agent ticket work: the wake signal is not limited to the last two people who spoke.

### Ticket Threads From Chat

Open **Threads** from the left rail to inspect direct messages, agent conversations, Copilot transcripts, and ticket threads. Ticket rows are marked with a ticket badge.

When you click a ticket thread from the thread roster, Team-X opens the ticket detail as a preview panel on the left side of the drawer while the thread queue remains visible on the right. Closing the preview returns you to the same thread list position instead of forcing you to navigate back through the menu.

## Schedule Calendar

The **Schedule** subtab under Projects gives operators one calendar for time-bound work. It combines source deadlines with manual scheduled items:

- Source deadlines: ticket due dates, project target dates, and goal target dates.
- Manual entries: tasks, deadlines, milestones, and reminders created with **Add**.
- Optional assignment: assign a manual schedule item to an employee when Team-X should queue a future agent wakeup.
- Optional links: connect a manual schedule item to a ticket, project, or goal so the calendar item keeps its business context.

The calendar includes a 7-day view, an agenda list, and summary counters for **Today**, **Overdue**, **Next 14 days**, and **Agent wakes**. Manual items can be completed or deleted directly from the calendar. Derived ticket, project, and goal entries stay read-only because their source record owns the date.

## Workflow Example

Here's a typical workflow:

1. **Set a goal**: "Ship user authentication system"
2. **Create a project**: "Auth Module" linked to the goal, led by the Tech Lead
3. **File tickets**:
   - "Design auth database schema" assigned to the Senior Database Engineer
   - "Implement JWT token service" assigned to the Senior Backend Engineer
   - "Build login/signup UI" assigned to the Senior Frontend Developer
4. **Set due dates and target dates** so deadlines show on the Schedule subtab
5. **Schedule follow-ups** for future checks, reminders, or agent wakeups
6. **Watch the agents work** via the Dashboard stream and timeline views
7. **Add participants** when more than one employee should wake on the ticket discussion
8. **Review and iterate** by commenting on tickets
9. **Track progress** via the goal's progress bar as tickets move to Done

The Scheduling and Calendar guide covers the full calendar operating model in more detail.
