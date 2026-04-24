import { useMemo, useState } from 'react';

import type {
  Employee,
  Routine,
  RoutineSchedule,
  RoutineTicketWorkConfig,
  TicketPriority,
} from '@team-x/shared-types';
import { Activity, CalendarDays, Clock3, Play, RefreshCw, Trash2 } from 'lucide-react';

import { useEmployees } from '@/hooks/use-employees.js';
import {
  useCreateRoutine,
  useDeleteRoutine,
  useRoutineRuns,
  useRoutines,
  useRunRoutineNow,
  useUpdateRoutine,
} from '@/hooks/use-routines.js';

import {
  MissionIconButton,
  MissionInsetSurface,
  MissionMetricTile,
  MissionPill,
  MissionStateBlock,
} from '../mission/mission-shell.js';

const FIELD_CLASSNAME =
  'h-11 w-full rounded-[16px] border border-white/10 bg-black/20 px-3 text-sm text-foreground outline-none transition focus:border-brand/30';
const LABEL_CLASSNAME =
  'text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground';
const TEXTAREA_CLASSNAME =
  'min-h-[120px] w-full rounded-[18px] border border-white/10 bg-black/20 px-3 py-3 text-sm text-foreground outline-none transition focus:border-brand/30';

type RoutineTriggerValue = Routine['triggerKind'];

interface RoutineDraft {
  name: string;
  enabled: boolean;
  triggerKind: RoutineTriggerValue;
  intervalMinutes: string;
  timeOfDay: string;
  dayOfWeek: string;
  ticketTitle: string;
  ticketDescription: string;
  assigneeId: string;
  priority: TicketPriority;
  labels: string;
}

function emptyDraft(): RoutineDraft {
  return {
    name: '',
    enabled: true,
    triggerKind: 'interval',
    intervalMinutes: '60',
    timeOfDay: '09:00',
    dayOfWeek: '1',
    ticketTitle: '',
    ticketDescription: '',
    assigneeId: '',
    priority: 'medium',
    labels: 'routine',
  };
}

function draftFromRoutine(routine: Routine): RoutineDraft {
  return {
    name: routine.name,
    enabled: routine.enabled,
    triggerKind: routine.triggerKind,
    intervalMinutes:
      routine.schedule.triggerKind === 'interval' ? String(routine.schedule.intervalMinutes) : '60',
    timeOfDay: routine.schedule.triggerKind === 'interval' ? '09:00' : routine.schedule.timeOfDay,
    dayOfWeek: routine.schedule.triggerKind === 'weekly' ? String(routine.schedule.dayOfWeek) : '1',
    ticketTitle: routine.workConfig.title,
    ticketDescription: routine.workConfig.description,
    assigneeId: routine.workConfig.assigneeId ?? '',
    priority: routine.workConfig.priority,
    labels: routine.workConfig.labels.join(', '),
  };
}

function buildSchedule(draft: RoutineDraft): RoutineSchedule {
  if (draft.triggerKind === 'interval') {
    return {
      triggerKind: 'interval',
      intervalMinutes: Number.parseInt(draft.intervalMinutes, 10),
    };
  }
  if (draft.triggerKind === 'daily') {
    return {
      triggerKind: 'daily',
      timeOfDay: draft.timeOfDay,
    };
  }
  return {
    triggerKind: 'weekly',
    dayOfWeek: Number.parseInt(draft.dayOfWeek, 10),
    timeOfDay: draft.timeOfDay,
  };
}

function buildWorkConfig(draft: RoutineDraft): RoutineTicketWorkConfig {
  return {
    title: draft.ticketTitle,
    description: draft.ticketDescription,
    assigneeId: draft.assigneeId.trim().length > 0 ? draft.assigneeId : null,
    priority: draft.priority,
    labels: draft.labels
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  };
}

function formatSchedule(schedule: RoutineSchedule): string {
  if (schedule.triggerKind === 'interval') {
    return `Every ${schedule.intervalMinutes} min`;
  }
  if (schedule.triggerKind === 'daily') {
    return `Daily at ${schedule.timeOfDay}`;
  }
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][schedule.dayOfWeek] ?? 'Day';
  return `${weekday} at ${schedule.timeOfDay}`;
}

function formatTimestamp(value: number | null): string {
  return value ? new Date(value).toLocaleString() : 'Not scheduled';
}

function RoutineScheduleFields({
  draft,
  onChange,
}: {
  draft: RoutineDraft;
  onChange: (patch: Partial<RoutineDraft>) => void;
}) {
  return (
    <>
      <label className="space-y-2">
        <div className={LABEL_CLASSNAME}>Trigger</div>
        <select
          className={FIELD_CLASSNAME}
          value={draft.triggerKind}
          onChange={(event) => onChange({ triggerKind: event.target.value as RoutineTriggerValue })}
        >
          <option value="interval">Interval</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </label>
      {draft.triggerKind === 'interval' ? (
        <label className="space-y-2">
          <div className={LABEL_CLASSNAME}>Interval Minutes</div>
          <input
            className={FIELD_CLASSNAME}
            type="number"
            min={1}
            value={draft.intervalMinutes}
            onChange={(event) => onChange({ intervalMinutes: event.target.value })}
          />
        </label>
      ) : (
        <>
          {draft.triggerKind === 'weekly' ? (
            <label className="space-y-2">
              <div className={LABEL_CLASSNAME}>Day Of Week</div>
              <select
                className={FIELD_CLASSNAME}
                value={draft.dayOfWeek}
                onChange={(event) => onChange({ dayOfWeek: event.target.value })}
              >
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
              </select>
            </label>
          ) : null}
          <label className="space-y-2">
            <div className={LABEL_CLASSNAME}>Time Of Day</div>
            <input
              className={FIELD_CLASSNAME}
              type="time"
              value={draft.timeOfDay}
              onChange={(event) => onChange({ timeOfDay: event.target.value })}
            />
          </label>
        </>
      )}
    </>
  );
}

function RoutineWorkFields({
  draft,
  employees,
  onChange,
}: {
  draft: RoutineDraft;
  employees: Employee[];
  onChange: (patch: Partial<RoutineDraft>) => void;
}) {
  return (
    <>
      <label className="space-y-2 md:col-span-2">
        <div className={LABEL_CLASSNAME}>Ticket Title</div>
        <input
          className={FIELD_CLASSNAME}
          value={draft.ticketTitle}
          onChange={(event) => onChange({ ticketTitle: event.target.value })}
          placeholder="Morning operations sweep"
        />
      </label>
      <label className="space-y-2">
        <div className={LABEL_CLASSNAME}>Assignee</div>
        <select
          className={FIELD_CLASSNAME}
          value={draft.assigneeId}
          onChange={(event) => onChange({ assigneeId: event.target.value })}
        >
          <option value="">Unassigned ticket</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-2">
        <div className={LABEL_CLASSNAME}>Priority</div>
        <select
          className={FIELD_CLASSNAME}
          value={draft.priority}
          onChange={(event) => onChange({ priority: event.target.value as TicketPriority })}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </label>
      <label className="space-y-2 md:col-span-2">
        <div className={LABEL_CLASSNAME}>Labels</div>
        <input
          className={FIELD_CLASSNAME}
          value={draft.labels}
          onChange={(event) => onChange({ labels: event.target.value })}
          placeholder="routine, ops, daily"
        />
      </label>
      <label className="space-y-2 md:col-span-2">
        <div className={LABEL_CLASSNAME}>Ticket Description</div>
        <textarea
          className={TEXTAREA_CLASSNAME}
          value={draft.ticketDescription}
          onChange={(event) => onChange({ ticketDescription: event.target.value })}
          placeholder="Review the queue, inspect blockers, and route follow-up work."
        />
      </label>
    </>
  );
}

function RoutineCard({
  routine,
  employees,
  onSave,
  onDelete,
  onRunNow,
  saving,
  deleting,
  running,
}: {
  routine: Routine;
  employees: Employee[];
  onSave: (routine: Routine, draft: RoutineDraft) => void;
  onDelete: (routineId: string) => void;
  onRunNow: (routineId: string) => void;
  saving: boolean;
  deleting: boolean;
  running: boolean;
}) {
  const [draft, setDraft] = useState<RoutineDraft>(() => draftFromRoutine(routine));

  return (
    <MissionInsetSurface className="space-y-4 p-4" data-routine-card={routine.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="text-sm font-semibold text-foreground">{routine.name}</div>
          <div className="flex flex-wrap gap-2">
            <MissionPill tone="accent">{routine.triggerKind}</MissionPill>
            <MissionPill>{routine.enabled ? 'enabled' : 'paused'}</MissionPill>
            <MissionPill>{routine.lastRunStatus}</MissionPill>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MissionIconButton
            title="Run Now"
            disabled={running}
            onClick={() => onRunNow(routine.id)}
          >
            <Play className="h-4 w-4" />
          </MissionIconButton>
          <MissionIconButton
            tone="danger"
            title="Delete routine"
            disabled={deleting}
            onClick={() => onDelete(routine.id)}
          >
            <Trash2 className="h-4 w-4" />
          </MissionIconButton>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <MissionMetricTile
          label="Schedule"
          value={formatSchedule(routine.schedule)}
          hint="Cadence definition"
          icon={Clock3}
        />
        <MissionMetricTile
          label="Next Run"
          value={formatTimestamp(routine.nextRunAt)}
          hint="Local workstation time"
          icon={CalendarDays}
        />
        <MissionMetricTile
          label="Last Run"
          value={formatTimestamp(routine.lastRunAt)}
          hint={routine.lastRunMessage ?? 'No run recorded yet'}
          icon={Activity}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2">
          <div className={LABEL_CLASSNAME}>Routine Name</div>
          <input
            className={FIELD_CLASSNAME}
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
        <label className="space-y-2">
          <div className={LABEL_CLASSNAME}>Status</div>
          <select
            className={FIELD_CLASSNAME}
            value={draft.enabled ? 'enabled' : 'paused'}
            onChange={(event) =>
              setDraft((current) => ({ ...current, enabled: event.target.value === 'enabled' }))
            }
          >
            <option value="enabled">Enabled</option>
            <option value="paused">Paused</option>
          </select>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <RoutineScheduleFields
          draft={draft}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <RoutineWorkFields
          draft={draft}
          employees={employees}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-muted-foreground">
          {routine.lastRunMessage?.trim() || 'Recurring Routines create visible work.'}
        </p>
        <button
          type="button"
          className="rounded-full border border-brand/35 bg-brand/15 px-4 py-2 text-xs font-semibold tracking-[0.18em] text-brand transition hover:border-brand/60 hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={saving}
          onClick={() => onSave(routine, draft)}
        >
          Save Routine
        </button>
      </div>
    </MissionInsetSurface>
  );
}

export function RoutinesPanel({ companyId }: { companyId: string }) {
  const routinesQuery = useRoutines(companyId);
  const runsQuery = useRoutineRuns(companyId, null, 12);
  const employeesQuery = useEmployees(companyId);
  const createRoutine = useCreateRoutine(companyId);
  const updateRoutine = useUpdateRoutine(companyId);
  const deleteRoutine = useDeleteRoutine(companyId);
  const runRoutineNow = useRunRoutineNow(companyId);
  const [draft, setDraft] = useState<RoutineDraft>(() => emptyDraft());

  const routines = routinesQuery.data ?? [];
  const employees = employeesQuery.data ?? [];
  const runs = runsQuery.data ?? [];
  const dueCount = useMemo(
    () =>
      routines.filter(
        (routine) =>
          routine.enabled && routine.nextRunAt !== null && routine.nextRunAt <= Date.now(),
      ).length,
    [routines],
  );

  if (routinesQuery.isLoading || employeesQuery.isLoading || runsQuery.isLoading) {
    return (
      <MissionStateBlock
        title="Loading recurring routines"
        description="Team-X is resolving cadence definitions, recent materializations, and employee assignment options."
        icon={Clock3}
      />
    );
  }

  if (routinesQuery.isError || employeesQuery.isError || runsQuery.isError) {
    return (
      <MissionStateBlock
        title="Recurring routines could not load"
        description="The control plane is live, but either routine definitions, employees, or recent run history failed to resolve."
        icon={Clock3}
        tone="danger"
      />
    );
  }

  return (
    <div className="space-y-4" data-routines-panel="">
      <div className="grid gap-3 md:grid-cols-4">
        <MissionMetricTile
          label="Defined"
          value={String(routines.length)}
          hint="Workspace routine definitions"
          icon={Clock3}
        />
        <MissionMetricTile
          label="Enabled"
          value={String(routines.filter((routine) => routine.enabled).length)}
          hint="Scheduled and eligible to tick"
          icon={Activity}
        />
        <MissionMetricTile
          label="Due Now"
          value={String(dueCount)}
          hint="Cadences that should materialize work on the next tick"
          icon={RefreshCw}
        />
        <MissionMetricTile
          label="Recent Runs"
          value={String(runs.length)}
          hint="Latest visible routine materializations"
          icon={Play}
        />
      </div>

      <MissionInsetSurface className="space-y-4 p-4">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-foreground">Create Routine</div>
          <p className="text-xs leading-5 text-muted-foreground">
            Routines create explicit ticket work through the existing assignment and orchestrator
            path.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2">
            <div className={LABEL_CLASSNAME}>Routine Name</div>
            <input
              className={FIELD_CLASSNAME}
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Daily queue review"
            />
          </label>
          <label className="space-y-2">
            <div className={LABEL_CLASSNAME}>Status</div>
            <select
              className={FIELD_CLASSNAME}
              value={draft.enabled ? 'enabled' : 'paused'}
              onChange={(event) =>
                setDraft((current) => ({ ...current, enabled: event.target.value === 'enabled' }))
              }
            >
              <option value="enabled">Enabled</option>
              <option value="paused">Paused</option>
            </select>
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <RoutineScheduleFields
            draft={draft}
            onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <RoutineWorkFields
            draft={draft}
            employees={employees}
            onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          />
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            className="rounded-full border border-brand/35 bg-brand/15 px-4 py-2 text-xs font-semibold tracking-[0.18em] text-brand transition hover:border-brand/60 hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={createRoutine.isPending}
            onClick={() =>
              createRoutine.mutate(
                {
                  companyId,
                  name: draft.name,
                  enabled: draft.enabled,
                  schedule: buildSchedule(draft),
                  workConfig: buildWorkConfig(draft),
                },
                {
                  onSuccess: () => {
                    setDraft(emptyDraft());
                  },
                },
              )
            }
          >
            {createRoutine.isPending ? 'Creating...' : 'Create Routine'}
          </button>
        </div>
      </MissionInsetSurface>

      {routines.length === 0 ? (
        <MissionStateBlock
          title="No routines defined yet"
          description="The first pass wires cadence, visible ticket materialization, and recent run history. Create a routine to start testing it."
          icon={Clock3}
        />
      ) : (
        <div className="space-y-4">
          {routines.map((routine) => (
            <RoutineCard
              key={routine.id}
              routine={routine}
              employees={employees}
              saving={updateRoutine.isPending}
              deleting={deleteRoutine.isPending}
              running={runRoutineNow.isPending}
              onSave={(target, nextDraft) =>
                updateRoutine.mutate({
                  routineId: target.id,
                  name: nextDraft.name,
                  enabled: nextDraft.enabled,
                  schedule: buildSchedule(nextDraft),
                  workConfig: buildWorkConfig(nextDraft),
                })
              }
              onDelete={(routineId) => deleteRoutine.mutate(routineId)}
              onRunNow={(routineId) => runRoutineNow.mutate({ routineId })}
            />
          ))}
        </div>
      )}

      <MissionInsetSurface className="space-y-4 p-4">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-foreground">Recent Routine Runs</div>
          <p className="text-xs leading-5 text-muted-foreground">
            Manual and scheduled routine attempts are persisted here even when materialization
            fails.
          </p>
        </div>
        {runs.length === 0 ? (
          <MissionStateBlock
            title="No routine runs recorded yet"
            description="Use Run Now on a routine card or wait for the scheduler to reach the next due cadence."
            icon={Play}
          />
        ) : (
          <div className="space-y-3">
            {runs.map((run) => (
              <MissionInsetSurface key={run.id} className="p-3" data-routine-run={run.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{run.routineId}</span>
                      <MissionPill
                        tone={
                          run.status === 'success'
                            ? 'accent'
                            : run.status === 'error'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {run.status}
                      </MissionPill>
                      <MissionPill>{run.reason}</MissionPill>
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Started {new Date(run.startedAt).toLocaleString()}
                      {run.ticketId ? ` • ticket ${run.ticketId}` : ''}
                    </p>
                  </div>
                  <div className="max-w-xl text-xs leading-5 text-muted-foreground">
                    {run.errorMessage?.trim() ||
                      run.message?.trim() ||
                      'Routine run recorded with no additional message.'}
                  </div>
                </div>
              </MissionInsetSurface>
            ))}
          </div>
        )}
      </MissionInsetSurface>
    </div>
  );
}
