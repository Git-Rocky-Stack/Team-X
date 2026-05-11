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

function priorityClass(priority: TicketPriority): string {
  switch (priority) {
    case 'critical':
      return 'border-l-red-500 bg-red-500/10';
    case 'high':
      return 'border-l-amber-500 bg-amber-500/10';
    case 'medium':
      return 'border-l-sky-500 bg-sky-500/10';
    case 'low':
      return 'border-l-emerald-500 bg-emerald-500/10';
  }
}

function statusClass(item: ScheduleItem): string {
  if (item.status === 'completed') return 'text-emerald-500';
  if (item.status === 'cancelled') return 'text-muted-foreground line-through';
  if (item.startsAt < Date.now()) return 'text-red-500';
  return 'text-foreground';
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

interface SummaryTileProps {
  label: string;
  value: number;
  icon: typeof CalendarDays;
}

function SummaryTile({ label, value, icon: Icon }: SummaryTileProps) {
  return (
    <div className="flex min-h-20 items-center justify-between rounded-md border border-border/60 bg-background px-4 py-3">
      <div className="min-w-0">
        <p className="text-eyebrow text-muted-foreground">{label}</p>
        <p className="mt-1 text-numeric text-foreground">{value}</p>
      </div>
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
    </div>
  );
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
    <div
      className={`min-w-0 rounded-md border border-border/60 border-l-4 p-3 shadow-sm ${priorityClass(
        item.priority,
      )}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="rounded-sm bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {sourceLabel(item)}
            </span>
            {item.status !== 'scheduled' && (
              <span className="rounded-sm bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {item.status}
              </span>
            )}
          </div>
          <p className={`mt-1 min-w-0 break-words text-caption font-semibold ${statusClass(item)}`}>
            {item.title}
          </p>
        </div>
        {isManualItem(item) && (
          <div className="flex shrink-0 items-center gap-1">
            {item.status === 'scheduled' && (
              <button
                type="button"
                onClick={() => onComplete(item.id)}
                disabled={disabled}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-emerald-500 disabled:opacity-50"
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
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-red-500 disabled:opacity-50"
              aria-label="Delete scheduled item"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
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
        <p className="mt-2 truncate text-caption text-muted-foreground">{linked}</p>
      )}
      {!compact && item.description && (
        <p className="mt-2 line-clamp-2 break-words text-caption text-muted-foreground">
          {item.description}
        </p>
      )}
    </div>
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
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p className="text-caption text-muted-foreground">Loading schedule...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-body-strong text-muted-foreground">Failed to load schedule</p>
          <Button type="button" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border/70 bg-background px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-h2 text-foreground">Team Schedule</h2>
            <p className="mt-0.5 text-caption text-muted-foreground">
              {formatDay(weekStart)} - {formatDay(addDays(weekStart, 6))}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-md border border-border/70 bg-surface-50">
              <button
                type="button"
                onClick={() => setWeekStart((current) => addDays(current, -7))}
                className="rounded-l-md p-2 text-muted-foreground transition-colors hover:bg-surface-100 hover:text-foreground"
                aria-label="Previous week"
                title="Previous week"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setWeekStart(startOfWeek(Date.now()))}
                className="border-x border-border/70 px-3 py-2 text-button-sm text-foreground transition-colors hover:bg-surface-100"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setWeekStart((current) => addDays(current, 7))}
                className="rounded-r-md p-2 text-muted-foreground transition-colors hover:bg-surface-100 hover:text-foreground"
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
          <SummaryTile label="Today" value={todayCount} icon={CalendarDays} />
          <SummaryTile label="Overdue" value={overdueCount} icon={Clock} />
          <SummaryTile label="Next 14 days" value={upcomingCount} icon={CalendarClock} />
          <SummaryTile label="Agent wakes" value={assignedManualCount} icon={UserRound} />
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
                  className={`flex min-h-[520px] flex-col rounded-md border bg-background ${
                    isToday ? 'border-brand/60' : 'border-border/60'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-caption font-semibold text-foreground">
                        {formatDay(day)}
                      </p>
                      {isToday && <p className="mt-0.5 text-eyebrow-sm text-brand">Today</p>}
                    </div>
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-eyebrow-sm text-muted-foreground">
                      {dayItems.length}
                    </span>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
                    {dayItems.length === 0 ? (
                      <div className="flex min-h-24 flex-1 items-center justify-center rounded-md border border-dashed border-border/50 px-3 text-center text-caption text-muted-foreground/70">
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

        <aside className="min-h-0 rounded-md border border-border/70 bg-background">
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
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-100 hover:text-foreground"
                  aria-label="Close scheduler form"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-3">
                <div>
                  <label htmlFor="schedule-title" className="text-label text-muted-foreground">
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
                    <label htmlFor="schedule-kind" className="text-label text-muted-foreground">
                      Type
                    </label>
                    <select
                      id="schedule-kind"
                      value={kind}
                      onChange={(e) => setKind(e.target.value as ScheduleItemKind)}
                      className="mission-select mt-1 w-full px-3 py-2 text-body"
                    >
                      {KINDS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="schedule-priority" className="text-label text-muted-foreground">
                      Priority
                    </label>
                    <select
                      id="schedule-priority"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as TicketPriority)}
                      className="mission-select mt-1 w-full px-3 py-2 text-body"
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
                    <label
                      htmlFor="schedule-start-date"
                      className="text-label text-muted-foreground"
                    >
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
                    <label
                      htmlFor="schedule-start-time"
                      className="text-label text-muted-foreground"
                    >
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
                    <label htmlFor="schedule-end-date" className="text-label text-muted-foreground">
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
                    <label htmlFor="schedule-end-time" className="text-label text-muted-foreground">
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
                    <label
                      htmlFor="schedule-reminder-date"
                      className="text-label text-muted-foreground"
                    >
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
                    <label
                      htmlFor="schedule-reminder-time"
                      className="text-label text-muted-foreground"
                    >
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
                  <label htmlFor="schedule-assignee" className="text-label text-muted-foreground">
                    Assign wakeup
                  </label>
                  <select
                    id="schedule-assignee"
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    className="mission-select mt-1 w-full px-3 py-2 text-body"
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
                    <label
                      htmlFor="schedule-link-kind"
                      className="text-label text-muted-foreground"
                    >
                      Link to
                    </label>
                    <select
                      id="schedule-link-kind"
                      value={linkKind}
                      onChange={(e) => {
                        setLinkKind(e.target.value as LinkKind);
                        setLinkId('');
                      }}
                      className="mission-select mt-1 w-full px-3 py-2 text-body"
                    >
                      <option value="none">Nothing</option>
                      <option value="ticket">Ticket</option>
                      <option value="project">Project</option>
                      <option value="goal">Goal</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="schedule-link-id" className="text-label text-muted-foreground">
                      Item
                    </label>
                    <select
                      id="schedule-link-id"
                      value={linkId}
                      onChange={(e) => setLinkId(e.target.value)}
                      disabled={linkKind === 'none' || linkOptions.length === 0}
                      className="mission-select mt-1 w-full px-3 py-2 text-body disabled:cursor-not-allowed disabled:opacity-50"
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
                  <label
                    htmlFor="schedule-description"
                    className="text-label text-muted-foreground"
                  >
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
              <span className="text-caption text-muted-foreground">{agendaItems.length}</span>
            </div>
            <div className="flex max-h-[720px] min-h-0 flex-col gap-2 overflow-y-auto p-3">
              {agendaItems.length === 0 ? (
                <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-border/60 px-4 text-center text-caption text-muted-foreground">
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
