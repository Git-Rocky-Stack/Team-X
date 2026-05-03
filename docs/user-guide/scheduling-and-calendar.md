# Scheduling and Calendar

The Schedule subtab is Team-X's calendar layer for accountable work. It lives under **Projects > Schedule** because schedule items are usually tied to goals, projects, tickets, and the employees responsible for moving them forward.

Use Schedule when you need to see what is due, create a future reminder, or queue an employee wakeup for a later date. Do not rely on chat-only reminders for work that should remain accountable.

## What Appears Automatically

Schedule combines manual calendar entries with dates that already exist on work records:

| Source | Calendar entry | Owner |
|--------|----------------|-------|
| Ticket **Due Date** | Ticket due | The ticket record |
| Project **Target Date** | Project target | The project record |
| Goal **Target Date** | Goal target | The goal record |

These source-derived entries are read-only in the calendar. Change the date by editing the ticket, project, or goal that owns it.

## Creating Manual Schedule Items

Click **Add** in the Schedule subtab to create a manual calendar item.

You can set:

- **Title** and optional notes
- **Type**: task, deadline, milestone, or reminder
- **Priority**: low, medium, high, or critical
- **Start date/time**
- Optional **end date/time**
- Optional **reminder date/time**
- Optional **assignee**
- Optional link to a ticket, project, or goal

Manual schedule items appear in the week calendar and the agenda. You can complete or delete them directly from either view.

## Future Agent Wakeups

Assign a manual schedule item to an employee when that item should wake an agent at the scheduled time.

When an assignee is present, Team-X creates a durable wakeup request tied to the schedule item. The wakeup includes the company context plus any linked ticket, project, or goal so the agent wakes with the right work context.

If no assignee is selected, the schedule item remains visible on the calendar but does not queue an agent wakeup.

## Calendar Views

The Schedule subtab has two operating views:

- **7-day calendar**: daily columns for the selected week, with Today highlighted.
- **Agenda**: a sortable list of active calendar items, with overdue items surfaced first.

The summary counters help you scan pressure quickly:

- **Today**: active items due today.
- **Overdue**: active scheduled items whose start date has passed.
- **Next 14 days**: active work coming due soon.
- **Agent wakes**: manual scheduled items that have assignees.

## Recommended Workflow

1. Create the durable work record first: ticket, project, or goal.
2. Add due dates or target dates to the record when the deadline belongs to that record.
3. Use Schedule for separate follow-ups, checkpoints, reminders, and future wakeups.
4. Assign a schedule item only when a specific employee should be woken into that work.
5. Complete manual items when the follow-up is done; edit the source ticket/project/goal when the actual deadline changes.

## Troubleshooting

**"A ticket is missing from Schedule."** Confirm the ticket has a Due Date. Tickets without due dates are still valid work, but they do not create calendar entries.

**"I cannot complete a Project target or Goal target from Schedule."** Source-derived entries are read-only. Update the project or goal status/date from its own surface.

**"An employee did not wake for a schedule item."** Confirm the schedule item is manual, still scheduled, has an assignee, and the scheduled time has arrived. Source-derived ticket/project/goal entries are calendar visibility entries; manual assigned schedule items are the wakeup path.

**"The calendar looks empty."** Add target dates to goals/projects, due dates to tickets, or create manual scheduled items. Schedule does not invent dates.
