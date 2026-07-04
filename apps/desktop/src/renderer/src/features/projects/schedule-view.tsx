import type {
  Employee,
  Goal,
  Project,
  ScheduleItem,
  ScheduleItemKind,
  Ticket,
  TicketPriority,
} from '@team-x/shared-types';
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FolderKanban,
  Plus,
  Target,
  Ticket as TicketIcon,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';

import {
  LampTile,
  MetricTile,
  RecessedWell,
  SubviewState,
  Tag,
} from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import {
  useCompleteScheduleItem,
  useCreateScheduleItem,
  useDeleteScheduleItem,
  useScheduleItems,
} from '@/hooks/use-schedule.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const KINDS: { value: ScheduleItemKind; label: string }[] = [
  { value: 'task', label: 'Task' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'milestone', label: 'Milestone' },
  { value: 'reminder', label: 'Reminder' },
];

const PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

type LinkKind = 'none' | 'ticket' | 'project' | 'goal';

interface ScheduleViewProps {
  companyId: string | null;
  employees: Employee[];
  tickets: Ticket[];
  projects: Project[];
  goals: Goal[];
}

function startOfDay(value: number): number {
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function startOfWeek(value: number): number {
  const d = new Date(startOfDay(value));
  return d.getTime() - d.getDay() * MS_PER_DAY;
}

function addDays(value: number, days: number): number {
  return value + days * MS_PER_DAY;
}

function dateInputValue(value: number): string {
  const d = new Date(value);
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function dateTimeToTimestamp(date: string, time: string): number | null {
  if (!date) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour = 9, minute = 0] = time ? time.split(':').map(Number) : [];
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

function formatDay(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(value);
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(value);
}

function formatDateTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
}

function sourceLabel(item: ScheduleItem): string {
  switch (item.sourceKind) {
    case 'ticket_due':
      return 'Ticket due';
    case 'project_target':
      return 'Project target';
    case 'goal_target':
      return 'Goal target';
    case 'manual':
      return KINDS.find((kind) => kind.value === item.kind)?.label ?? 'Scheduled';
  }
}

function sourceIcon(item: ScheduleItem) {
  if (item.ticketId) return TicketIcon;
  if (item.projectId) return FolderKanban;
  if (item.goalId) return Target;
  return CalendarClock;
}

function priorityBorderClass(priority: TicketPriority): string {
  switch (priority) {
    case 'critical':
      return 'border-l-[var(--led-nogo)]';
    case 'high':
      return 'border-l-[var(--led-hold)]';
    case 'medium':
      return 'border-l-[var(--led-scope)]';
    case 'low':
      return 'border-l-[var(--led-go)]';
  }
}

function statusClass(item: ScheduleItem): string {
  if (item.status === 'completed') return 'text-led-go';
  if (item.status === 'cancelled') return 'text-silver-mute line-through';
  if (item.startsAt < Date.now()) return 'text-led-nogo';
  // Card rides a RecessedWell (display surface, dark both shifts) — the
  // title must use the display-locked ink, not shift-flipping foreground.
  return 'text-[var(--display-fg)]';
}

function linkedLabel(
  item: ScheduleItem,
  ticketsById: Map<string, Ticket>,
  projectsById: Map<string, Project>,
  goalsById: Map<string, Goal>,
): string | null {
  if (item.ticketId) return ticketsById.get(item.ticketId)?.title ?? 'Linked ticket';
  if (item.projectId) return projectsById.get(item.projectId)?.title ?? 'Linked project';
  if (item.goalId) return goalsById.get(item.goalId)?.title ?? 'Linked goal';
  return null;
}

function isSameDay(left: number, right: number): boolean {
  return startOfDay(left) === startOfDay(right);
}

function isActiveScheduled(item: ScheduleItem): boolean {
  return item.status === 'scheduled';
}

function isManualItem(item: ScheduleItem): boolean {
  return item.sourceKind === 'manual';
}

interface ScheduleCardProps {
  item: ScheduleItem;
  employeesById: Map<string, Employee>;
  ticketsById: Map<string, Ticket>;
  projectsById: Map<string, Project>;
  goalsById: Map<string, Goal>;
  compact?: boolean;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  disabled: boolean;
}

function ScheduleCard({
  item,
  employeesById,
  ticketsById,
  projectsById,
  goalsById,
  compact = false,
  onComplete,
  onDelete,
  disabled,
}: ScheduleCardProps) {
  const Icon = sourceIcon(item);
  const assignee = item.assigneeId ? employeesById.get(item.assigneeId) : null;
  const linked = linkedLabel(item, ticketsById, projectsById, goalsById);
  return (
    <RecessedWell className={`min-w-0 border-l-4 p-3 ${priorityBorderClass(item.priority)}`}>
      {/* Compact (week-grid) cells are ~90px of content width: stacking the
          action caps under the title keeps the title from being squeezed to
          one character per line by the shrink-0 cap cluster. */}
      <div className={`flex min-w-0 gap-2 ${compact ? 'flex-col' : 'items-start justify-between'}`}>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 shrink-0 text-silver-mute" />
            <Tag>{sourceLabel(item)}</Tag>
            {item.status !== 'scheduled' && (
              <LampTile
                label={item.status}
                tone={item.status === 'completed' ? 'go' : 'off'}
                small
                interactive={false}
              />
            )}
          </div>
          <p className={`mt-1 min-w-0 break-words text-caption font-semibold ${statusClass(item)}`}>
            {item.title}
          </p>
        </div>
        {isManualItem(item) && (
          <div className={`flex shrink-0 items-center gap-1 ${compact ? 'self-end' : ''}`}>
            {item.status === 'scheduled' && (
              <button
                type="button"
                onClick={() => onComplete(item.id)}
                disabled={disabled}
                className="cap flex h-7 w-7 items-center justify-center disabled:opacity-50"
                aria-label="Complete scheduled item"
                title="Complete"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              disabled={disabled}
              className="cap flex h-7 w-7 items-center justify-center disabled:opacity-50"
              aria-label="Delete scheduled item"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5 text-led-nogo" />
            </button>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-silver-mute">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {compact ? formatTime(item.startsAt) : formatDateTime(item.startsAt)}
        </span>
        {assignee && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <UserRound className="h-3 w-3 shrink-0" />
            <span className="truncate">{assignee.name}</span>
          </span>
        )}
      </div>
      {!compact && linked && (
        <p className="mt-2 truncate text-caption text-silver-mute">{linked}</p>
      )}
      {!compact && item.description && (
        <p className="mt-2 line-clamp-2 break-words text-caption text-silver-mute">
          {item.description}
        </p>
      )}
    </RecessedWell>
  );
}

export function ScheduleView({
  companyId,
  employees,
  tickets,
  projects,
  goals,
}: ScheduleViewProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(Date.now()));
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<ScheduleItemKind>('task');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [linkKind, setLinkKind] = useState<LinkKind>('none');
  const [linkId, setLinkId] = useState('');
  const [startDate, setStartDate] = useState(() => dateInputValue(Date.now()));
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderTime, setReminderTime] = useState('');

  const { data = [], isLoading, isError, refetch } = useScheduleItems(companyId);
  const createSchedule = useCreateScheduleItem();
  const completeSchedule = useCompleteScheduleItem();
  const deleteSchedule = useDeleteScheduleItem();

  const scheduleItems = useMemo(
    () => [...data].sort((a, b) => a.startsAt - b.startsAt || a.title.localeCompare(b.title)),
    [data],
  );
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_value, index) => addDays(weekStart, index)),
    [weekStart],
  );
  const employeesById = useMemo(() => new Map(employees.map((emp) => [emp.id, emp])), [employees]);
  const ticketsById = useMemo(
    () => new Map(tickets.map((ticket) => [ticket.id, ticket])),
    [tickets],
  );
  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const goalsById = useMemo(() => new Map(goals.map((goal) => [goal.id, goal])), [goals]);

  const todayStart = startOfDay(Date.now());
  const activeItems = scheduleItems.filter(isActiveScheduled);
  const todayCount = activeItems.filter((item) => isSameDay(item.startsAt, Date.now())).length;
  const overdueCount = activeItems.filter((item) => item.startsAt < todayStart).length;
  const upcomingCount = activeItems.filter(
    (item) => item.startsAt >= todayStart && item.startsAt < addDays(todayStart, 14),
  ).length;
  const assignedManualCount = activeItems.filter(
    (item) => isManualItem(item) && item.assigneeId !== null,
  ).length;
  const agendaItems = scheduleItems
    .filter((item) => item.status !== 'cancelled')
    .sort((a, b) => {
      const overdueA = a.status === 'scheduled' && a.startsAt < todayStart ? 0 : 1;
      const overdueB = b.status === 'scheduled' && b.startsAt < todayStart ? 0 : 1;
      return overdueA - overdueB || a.startsAt - b.startsAt || a.title.localeCompare(b.title);
    });

  const linkOptions =
    linkKind === 'ticket'
      ? tickets.map((ticket) => ({ id: ticket.id, label: ticket.title }))
      : linkKind === 'project'
        ? projects.map((project) => ({ id: project.id, label: project.title }))
        : linkKind === 'goal'
          ? goals.map((goal) => ({ id: goal.id, label: goal.title }))
          : [];

  function resetForm() {
    setTitle('');
    setDescription('');
    setKind('task');
    setPriority('medium');
    setAssigneeId('');
    setLinkKind('none');
    setLinkId('');
    setStartDate(dateInputValue(Date.now()));
    setStartTime('09:00');
    setEndDate('');
    setEndTime('');
    setReminderDate('');
    setReminderTime('');
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !title.trim()) return;
    const startsAt = dateTimeToTimestamp(startDate, startTime);
    const endsAt = endDate ? dateTimeToTimestamp(endDate, endTime || startTime) : null;
    const reminderAt = reminderDate
      ? dateTimeToTimestamp(reminderDate, reminderTime || startTime)
      : null;
    if (startsAt === null) return;
    createSchedule.mutate(
      {
        companyId,
        title: title.trim(),
        description: description.trim() || undefined,
        kind,
        priority,
        startsAt,
        endsAt: endsAt ?? undefined,
        reminderAt: reminderAt ?? undefined,
        assigneeId: assigneeId || undefined,
        ticketId: linkKind === 'ticket' ? linkId || undefined : undefined,
        projectId: linkKind === 'project' ? linkId || undefined : undefined,
        goalId: linkKind === 'goal' ? linkId || undefined : undefined,
      },
      {
        onSuccess: () => {
          resetForm();
          setFormOpen(false);
        },
      },
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <SubviewState lampLabel="STBY" lampTone="hold" title="Loading schedule…" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <SubviewState
          lampLabel="NO-GO"
          lampTone="nogo"
          title="Failed to load schedule"
          action={
            <Button type="button" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border/70 bg-background px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-h2 text-foreground">Team Schedule</h2>
            <p className="mt-0.5 text-caption text-silver-mute">
              {formatDay(weekStart)} - {formatDay(addDays(weekStart, 6))}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setWeekStart((current) => addDays(current, -7))}
                className="cap flex h-9 w-9 items-center justify-center"
                aria-label="Previous week"
                title="Previous week"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setWeekStart(startOfWeek(Date.now()))}
                className="cap px-3 py-2 text-button-sm"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setWeekStart((current) => addDays(current, 7))}
                className="cap flex h-9 w-9 items-center justify-center"
                aria-label="Next week"
                title="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <Button type="button" size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="Today" value={String(todayCount)} icon={CalendarDays} />
          <MetricTile label="Overdue" value={String(overdueCount)} icon={Clock} />
          <MetricTile label="Next 14 days" value={String(upcomingCount)} icon={CalendarClock} />
          <MetricTile label="Agent wakes" value={String(assignedManualCount)} icon={UserRound} />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-h-[520px] overflow-x-auto">
          <div className="grid min-w-[920px] grid-cols-7 gap-2">
            {weekDays.map((day) => {
              const dayItems = scheduleItems.filter((item) => isSameDay(item.startsAt, day));
              const isToday = isSameDay(day, Date.now());
              return (
                <section
                  key={day}
                  className={`flex min-h-[520px] flex-col rounded-card border bg-background ${
                    isToday ? 'border-[var(--armed-edge)]' : 'border-[var(--hairline)]'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-[var(--hairline)] px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-caption font-semibold text-foreground">
                        {formatDay(day)}
                      </p>
                      {isToday && (
                        <p className="mt-0.5 text-eyebrow-sm text-[var(--armed)]">Today</p>
                      )}
                    </div>
                    <Tag mono>{dayItems.length}</Tag>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
                    {dayItems.length === 0 ? (
                      <div className="flex min-h-24 flex-1 items-center justify-center rounded-card border border-dashed border-[var(--hairline)] px-3 text-center text-caption text-silver-mute">
                        Clear
                      </div>
                    ) : (
                      dayItems.map((item) => (
                        <ScheduleCard
                          key={item.id}
                          item={item}
                          employeesById={employeesById}
                          ticketsById={ticketsById}
                          projectsById={projectsById}
                          goalsById={goalsById}
                          compact
                          onComplete={(id) => completeSchedule.mutate(id)}
                          onDelete={(id) => deleteSchedule.mutate(id)}
                          disabled={completeSchedule.isPending || deleteSchedule.isPending}
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        <aside className="min-h-0 rounded-card border border-border/70 bg-background">
          {formOpen && (
            <form onSubmit={handleSubmit} className="border-b border-border/70 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h4 className="text-h4 text-foreground">Schedule Work</h4>
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setFormOpen(false);
                  }}
                  className="cap flex h-8 w-8 items-center justify-center"
                  aria-label="Close scheduler form"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-3">
                <div>
                  <label htmlFor="schedule-title" className="text-label text-silver-mute">
                    Title *
                  </label>
                  <Input
                    id="schedule-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Follow up on launch readiness"
                    className="mt-1 text-body"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <div>
                    <label htmlFor="schedule-kind" className="text-label text-silver-mute">
                      Type
                    </label>
                    <select
                      id="schedule-kind"
                      value={kind}
                      onChange={(e) => setKind(e.target.value as ScheduleItemKind)}
                      className="well-input mt-1 w-full px-3 py-2 text-body"
                    >
                      {KINDS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="schedule-priority" className="text-label text-silver-mute">
                      Priority
                    </label>
                    <select
                      id="schedule-priority"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as TicketPriority)}
                      className="well-input mt-1 w-full px-3 py-2 text-body"
                    >
                      {PRIORITIES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <div>
                    <label htmlFor="schedule-start-date" className="text-label text-silver-mute">
                      Start date *
                    </label>
                    <Input
                      id="schedule-start-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-1 text-body"
                    />
                  </div>
                  <div>
                    <label htmlFor="schedule-start-time" className="text-label text-silver-mute">
                      Start time
                    </label>
                    <Input
                      id="schedule-start-time"
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="mt-1 text-body"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <div>
                    <label htmlFor="schedule-end-date" className="text-label text-silver-mute">
                      End date
                    </label>
                    <Input
                      id="schedule-end-date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1 text-body"
                    />
                  </div>
                  <div>
                    <label htmlFor="schedule-end-time" className="text-label text-silver-mute">
                      End time
                    </label>
                    <Input
                      id="schedule-end-time"
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="mt-1 text-body"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <div>
                    <label htmlFor="schedule-reminder-date" className="text-label text-silver-mute">
                      Reminder date
                    </label>
                    <Input
                      id="schedule-reminder-date"
                      type="date"
                      value={reminderDate}
                      onChange={(e) => setReminderDate(e.target.value)}
                      className="mt-1 text-body"
                    />
                  </div>
                  <div>
                    <label htmlFor="schedule-reminder-time" className="text-label text-silver-mute">
                      Reminder time
                    </label>
                    <Input
                      id="schedule-reminder-time"
                      type="time"
                      value={reminderTime}
                      onChange={(e) => setReminderTime(e.target.value)}
                      className="mt-1 text-body"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="schedule-assignee" className="text-label text-silver-mute">
                    Assign wakeup
                  </label>
                  <select
                    id="schedule-assignee"
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    className="well-input mt-1 w-full px-3 py-2 text-body"
                  >
                    <option value="">No assignee</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name} ({employee.title})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <div>
                    <label htmlFor="schedule-link-kind" className="text-label text-silver-mute">
                      Link to
                    </label>
                    <select
                      id="schedule-link-kind"
                      value={linkKind}
                      onChange={(e) => {
                        setLinkKind(e.target.value as LinkKind);
                        setLinkId('');
                      }}
                      className="well-input mt-1 w-full px-3 py-2 text-body"
                    >
                      <option value="none">Nothing</option>
                      <option value="ticket">Ticket</option>
                      <option value="project">Project</option>
                      <option value="goal">Goal</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="schedule-link-id" className="text-label text-silver-mute">
                      Item
                    </label>
                    <select
                      id="schedule-link-id"
                      value={linkId}
                      onChange={(e) => setLinkId(e.target.value)}
                      disabled={linkKind === 'none' || linkOptions.length === 0}
                      className="well-input mt-1 w-full px-3 py-2 text-body disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">Select item</option>
                      {linkOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="schedule-description" className="text-label text-silver-mute">
                    Notes
                  </label>
                  <Textarea
                    id="schedule-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Context, acceptance criteria, or handoff notes..."
                    className="mt-1 min-h-[88px] text-body"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      resetForm();
                      setFormOpen(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!title.trim() || createSchedule.isPending}
                  >
                    {createSchedule.isPending ? 'Scheduling...' : 'Schedule'}
                  </Button>
                </div>
              </div>
            </form>
          )}

          <div className="flex min-h-0 flex-col">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
              <h4 className="text-h4 text-foreground">Agenda</h4>
              <span className="text-caption text-silver-mute">{agendaItems.length}</span>
            </div>
            <div className="flex max-h-[720px] min-h-0 flex-col gap-2 overflow-y-auto p-3">
              {agendaItems.length === 0 ? (
                <div className="flex min-h-32 items-center justify-center rounded-card border border-dashed border-[var(--hairline)] px-4 text-center text-caption text-silver-mute">
                  Nothing scheduled
                </div>
              ) : (
                agendaItems.map((item) => (
                  <ScheduleCard
                    key={item.id}
                    item={item}
                    employeesById={employeesById}
                    ticketsById={ticketsById}
                    projectsById={projectsById}
                    goalsById={goalsById}
                    onComplete={(id) => completeSchedule.mutate(id)}
                    onDelete={(id) => deleteSchedule.mutate(id)}
                    disabled={completeSchedule.isPending || deleteSchedule.isPending}
                  />
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
