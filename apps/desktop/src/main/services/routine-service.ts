import type {
  Routine,
  RoutineRun,
  RoutineRunReason,
  RoutineSchedule,
  RoutineTicketWorkConfig,
  TicketPriority,
} from '@team-x/shared-types';

import type { CompanyRow } from '../db/repos/companies.js';
import type { EmployeeRow } from '../db/repos/employees.js';
import type { RoutineRow, RoutineRunRow, RoutinesRepo } from '../db/repos/routines.js';

type IntervalHandle = ReturnType<typeof setInterval>;

export interface CreateRoutineInput {
  companyId: string;
  name: string;
  enabled?: boolean;
  schedule: RoutineSchedule;
  workConfig: RoutineTicketWorkConfig;
}

export interface UpdateRoutineInput {
  routineId: string;
  name?: string;
  enabled?: boolean;
  schedule?: RoutineSchedule;
  workConfig?: RoutineTicketWorkConfig;
}

export interface RunRoutineNowInput {
  routineId: string;
}

export interface ListRoutineRunsInput {
  companyId: string;
  routineId?: string;
  limit?: number;
}

export interface RoutineServiceCreateTicketInput {
  companyId: string;
  title: string;
  description: string;
  priority: TicketPriority;
  assigneeId: string | null;
  labelsJson: string;
}

export interface RoutineServiceDeps {
  routinesRepo: RoutinesRepo;
  companiesRepo: {
    getById(id: string): CompanyRow | null;
  };
  employeesRepo: {
    getById(id: string): EmployeeRow | null;
  };
  createTicket(input: RoutineServiceCreateTicketInput): Promise<{ ticketId: string }>;
  budgetGovernance?: {
    assertExecutionAllowed(input: {
      companyId: string;
      employeeId?: string | null;
      routineId?: string | null;
      executionKind: 'routine';
    }): Promise<{ allowed: boolean; reason: string | null }>;
  };
  artifactService?: {
    recordRoutineTicketArtifact(input: {
      companyId: string;
      routineId: string;
      runId: string;
      ticketId: string;
      title: string;
      summary?: string | null;
      assigneeId?: string | null;
      createdAt: number;
    }): unknown;
  };
  bus?: {
    emit<T>(input: {
      type: import('@team-x/shared-types').EventType;
      companyId: string;
      actorId: string;
      actorKind: import('@team-x/shared-types').ActorKind;
      payload: T;
    }): unknown;
  };
  agentWakeupQueue?: {
    queueRoutineCompletionWakeup(input: {
      routineId: string;
      companyId: string;
      agentId: string;
      goalId?: string;
      ticketId?: string;
    }): Promise<void>;
  };
  now?(): number;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
  pollIntervalMs?: number;
  logger?: {
    warn(msg: string, err?: unknown): void;
    error(msg: string, err?: unknown): void;
  };
}

export interface RoutineService {
  start(companyId: string): void;
  stop(companyId: string): void;
  stopAll(): void;
  restart(companyId: string): void;
  list(companyId: string): Routine[];
  listRuns(input: ListRoutineRunsInput): RoutineRun[];
  create(input: CreateRoutineInput): string;
  update(input: UpdateRoutineInput): void;
  delete(routineId: string): void;
  runNow(input: RunRoutineNowInput): Promise<RoutineRun>;
  tick(companyId: string): Promise<RoutineRun[]>;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function ensureNonEmptyString(value: string, label: string): string {
  const next = value.trim();
  if (next.length === 0) {
    throw new Error(`[routines] ${label} is required`);
  }
  return next;
}

function parseObjectJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through.
  }
  return {};
}

function isTicketPriority(value: unknown): value is TicketPriority {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical';
}

function isValidTimeOfDay(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function normalizeSchedule(input: RoutineSchedule): RoutineSchedule {
  if (input.triggerKind === 'interval') {
    if (
      !Number.isFinite(input.intervalMinutes) ||
      input.intervalMinutes < 1 ||
      input.intervalMinutes > 10080
    ) {
      throw new Error('[routines] interval schedules require intervalMinutes between 1 and 10080');
    }
    return {
      triggerKind: 'interval',
      intervalMinutes: Math.round(input.intervalMinutes),
    };
  }

  if (!isValidTimeOfDay(input.timeOfDay)) {
    throw new Error('[routines] scheduled routines require timeOfDay in HH:MM format');
  }

  if (input.triggerKind === 'daily') {
    return {
      triggerKind: 'daily',
      timeOfDay: input.timeOfDay,
    };
  }

  if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 0 || input.dayOfWeek > 6) {
    throw new Error('[routines] weekly routines require dayOfWeek between 0 and 6');
  }

  return {
    triggerKind: 'weekly',
    dayOfWeek: input.dayOfWeek,
    timeOfDay: input.timeOfDay,
  };
}

function normalizeWorkConfig(input: RoutineTicketWorkConfig): RoutineTicketWorkConfig {
  const title = ensureNonEmptyString(input.title, 'routine ticket title');
  const description = typeof input.description === 'string' ? input.description : '';
  const assigneeId =
    typeof input.assigneeId === 'string' && input.assigneeId.trim().length > 0
      ? input.assigneeId.trim()
      : null;
  const priority = isTicketPriority(input.priority) ? input.priority : 'medium';
  const labels = Array.isArray(input.labels)
    ? input.labels
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : [];

  return {
    title,
    description,
    assigneeId,
    priority,
    labels: Array.from(new Set(labels)),
  };
}

function rowToRoutine(row: RoutineRow): Routine {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    slug: row.slug,
    enabled: row.enabled,
    triggerKind: row.triggerKind as Routine['triggerKind'],
    schedule: normalizeSchedule(parseObjectJson(row.scheduleJson) as unknown as RoutineSchedule),
    workKind: row.workKind as Routine['workKind'],
    workConfig: normalizeWorkConfig(
      parseObjectJson(row.workConfigJson) as unknown as RoutineTicketWorkConfig,
    ),
    lastRunStatus: row.lastRunStatus as Routine['lastRunStatus'],
    lastRunMessage: row.lastRunMessage,
    lastRunAt: row.lastRunAt,
    nextRunAt: row.nextRunAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToRoutineRun(row: RoutineRunRow): RoutineRun {
  return {
    id: row.id,
    companyId: row.companyId,
    routineId: row.routineId,
    status: row.status as RoutineRun['status'],
    reason: row.reason as RoutineRun['reason'],
    workKind: row.workKind as RoutineRun['workKind'],
    scheduledFor: row.scheduledFor,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    ticketId: row.ticketId,
    message: row.message,
    errorMessage: row.errorMessage,
  };
}

function nextSlug(companyId: string, name: string, routines: Routine[], exceptId?: string): string {
  const base = slugify(name) || slugify(companyId) || 'routine';
  const taken = new Set(
    routines.filter((routine) => routine.id !== exceptId).map((routine) => routine.slug),
  );
  if (!taken.has(base)) return base;
  let index = 2;
  while (taken.has(`${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}

function parseTimeOfDay(timeOfDay: string): { hour: number; minute: number } {
  const [hourRaw = '0', minuteRaw = '0'] = timeOfDay.split(':');
  return {
    hour: Number.parseInt(hourRaw, 10),
    minute: Number.parseInt(minuteRaw, 10),
  };
}

function computeNextRunAt(schedule: RoutineSchedule, referenceMs: number): number {
  if (schedule.triggerKind === 'interval') {
    return referenceMs + schedule.intervalMinutes * 60_000;
  }

  const base = new Date(referenceMs);
  const { hour, minute } = parseTimeOfDay(schedule.timeOfDay);

  if (schedule.triggerKind === 'daily') {
    const next = new Date(referenceMs);
    next.setHours(hour, minute, 0, 0);
    if (next.getTime() <= referenceMs) {
      next.setDate(next.getDate() + 1);
    }
    return next.getTime();
  }

  const next = new Date(referenceMs);
  next.setHours(hour, minute, 0, 0);
  const dayDelta = (schedule.dayOfWeek - base.getDay() + 7) % 7;
  next.setDate(base.getDate() + dayDelta);
  if (next.getTime() <= referenceMs) {
    next.setDate(next.getDate() + 7);
  }
  return next.getTime();
}

function buildRoutineDescription(routine: Routine): string {
  const header = `Triggered by routine "${routine.name}"`;
  return routine.workConfig.description.trim().length > 0
    ? `${header}\n\n${routine.workConfig.description.trim()}`
    : header;
}

export function createRoutineService(deps: RoutineServiceDeps): RoutineService {
  const {
    routinesRepo,
    companiesRepo,
    employeesRepo,
    createTicket,
    budgetGovernance,
    artifactService,
    bus,
    now = () => Date.now(),
    setInterval: setIntervalImpl = setInterval,
    clearInterval: clearIntervalImpl = clearInterval,
    pollIntervalMs = 60_000,
    logger = console,
  } = deps;

  const timers = new Map<string, IntervalHandle>();
  const inFlightRoutineIds = new Set<string>();

  function isCompanyRunnable(companyId: string): boolean {
    const company = companiesRepo.getById(companyId);
    return company !== null && company.status !== 'archived';
  }

  function emit(
    type: import('@team-x/shared-types').EventType,
    companyId: string,
    routineId: string,
    payload: unknown,
  ) {
    if (!bus) return;
    try {
      bus.emit({
        type,
        companyId,
        actorId: routineId,
        actorKind: 'system',
        payload,
      });
    } catch (err) {
      logger.warn(`[routines] ${type} bus emit failed`, err);
    }
  }

  function assertEmployee(companyId: string, employeeId: string | null): void {
    if (!employeeId) return;
    const employee = employeesRepo.getById(employeeId);
    if (!employee || employee.companyId !== companyId) {
      throw new Error(`[routines] employee ${employeeId} is not available in company ${companyId}`);
    }
  }

  function resolveRoutine(routineId: string): Routine {
    const row = routinesRepo.getById(routineId);
    if (!row) {
      throw new Error(`[routines] routine not found: ${routineId}`);
    }
    return rowToRoutine(row);
  }

  function resolveRoutineRun(runId: string): RoutineRun {
    const row = routinesRepo.getRunById(runId);
    if (!row) {
      throw new Error(`[routines] routine run not found: ${runId}`);
    }
    return rowToRoutineRun(row);
  }

  async function materializeRoutine(
    routine: Routine,
    reason: RoutineRunReason,
    throwOnError: boolean,
  ): Promise<RoutineRun> {
    if (inFlightRoutineIds.has(routine.id)) {
      const existingMessage = `Routine "${routine.name}" is already running`;
      if (throwOnError) {
        throw new Error(existingMessage);
      }
      return {
        id: `skip-${routine.id}`,
        companyId: routine.companyId,
        routineId: routine.id,
        status: 'error',
        reason,
        workKind: 'ticket',
        scheduledFor: routine.nextRunAt,
        startedAt: now(),
        finishedAt: now(),
        ticketId: null,
        message: null,
        errorMessage: existingMessage,
      };
    }

    inFlightRoutineIds.add(routine.id);
    const startedAt = now();
    const scheduledFor = reason === 'scheduled' ? routine.nextRunAt : null;
    const nextRunAt = routine.enabled ? computeNextRunAt(routine.schedule, startedAt) : null;

    routinesRepo.update(routine.id, {
      lastRunStatus: 'running',
      lastRunMessage:
        reason === 'manual' ? 'Manual run in progress.' : 'Scheduled run in progress.',
      lastRunAt: startedAt,
      nextRunAt,
    });

    const runId = routinesRepo.createRun({
      companyId: routine.companyId,
      routineId: routine.id,
      status: 'running',
      reason,
      scheduledFor,
      startedAt,
      workKind: routine.workKind,
    });

    emit('routine.runStarted', routine.companyId, routine.id, {
      routineId: routine.id,
      companyId: routine.companyId,
      runId,
      reason,
      scheduledFor,
      startedAt,
    });

    try {
      if (budgetGovernance) {
        const admission = await budgetGovernance.assertExecutionAllowed({
          companyId: routine.companyId,
          employeeId: routine.workConfig.assigneeId,
          routineId: routine.id,
          executionKind: 'routine',
        });
        if (!admission.allowed) {
          throw new Error(
            admission.reason ?? `Routine "${routine.name}" is blocked by budget policy.`,
          );
        }
      }

      const labels = Array.from(
        new Set(['routine', `routine:${routine.slug}`, ...routine.workConfig.labels]),
      );
      const ticketResult = await createTicket({
        companyId: routine.companyId,
        title: routine.workConfig.title,
        description: buildRoutineDescription(routine),
        priority: routine.workConfig.priority,
        assigneeId: routine.workConfig.assigneeId,
        labelsJson: JSON.stringify(labels),
      });

      // ✅ THE MISSING BRIDGE: Transform Team-X from reactive to proactive
      // When routines create tickets with assignees, automatically wake up those agents
      // This single line enables autonomous agent execution toward company goals
      if (routine.workConfig.assigneeId && agentWakeupQueue) {
        try {
          await agentWakeupQueue.queueRoutineCompletionWakeup({
            routineId: routine.id,
            companyId: routine.companyId,
            agentId: routine.workConfig.assigneeId,
            ticketId: ticketResult.ticketId,
          });

          console.log(`[routines] ✅ Agent wakeup queued for ${routine.workConfig.assigneeId} - routine completed, ticket created: ${ticketResult.ticketId}`);
        } catch (wakeupError) {
          // Log but don't fail the routine run if wakeup fails
          logger?.error(`[routines] ⚠️ Failed to queue agent wakeup for ${routine.workConfig.assigneeId}:`, wakeupError);
        }
      }

      const finishedAt = now();
      const message = `Created ticket ${ticketResult.ticketId}`;
      routinesRepo.updateRun(runId, {
        status: 'success',
        finishedAt,
        ticketId: ticketResult.ticketId,
        message,
      });
      routinesRepo.update(routine.id, {
        lastRunStatus: 'success',
        lastRunMessage: message,
        lastRunAt: finishedAt,
        nextRunAt,
      });
      if (artifactService) {
        try {
          artifactService.recordRoutineTicketArtifact({
            companyId: routine.companyId,
            routineId: routine.id,
            runId,
            ticketId: ticketResult.ticketId,
            title: routine.workConfig.title,
            summary: message,
            assigneeId: routine.workConfig.assigneeId,
            createdAt: finishedAt,
          });
        } catch (err) {
          logger.warn(`[routines] artifact record failed for run ${runId}`, err);
        }
      }
      emit('routine.runCompleted', routine.companyId, routine.id, {
        routineId: routine.id,
        companyId: routine.companyId,
        runId,
        reason,
        ticketId: ticketResult.ticketId,
        finishedAt,
        nextRunAt,
      });
      return resolveRoutineRun(runId);
    } catch (err) {
      const finishedAt = now();
      const errorMessage = err instanceof Error ? err.message : String(err);
      routinesRepo.updateRun(runId, {
        status: 'error',
        finishedAt,
        errorMessage,
      });
      routinesRepo.update(routine.id, {
        lastRunStatus: 'error',
        lastRunMessage: errorMessage,
        lastRunAt: finishedAt,
        nextRunAt,
      });
      emit('routine.runFailed', routine.companyId, routine.id, {
        routineId: routine.id,
        companyId: routine.companyId,
        runId,
        reason,
        errorMessage,
        finishedAt,
        nextRunAt,
      });
      if (throwOnError) {
        throw err instanceof Error ? err : new Error(errorMessage);
      }
      return resolveRoutineRun(runId);
    } finally {
      inFlightRoutineIds.delete(routine.id);
    }
  }

  const service: RoutineService = {
    start(companyId) {
      if (timers.has(companyId) || !isCompanyRunnable(companyId)) {
        return;
      }
      const handle = setIntervalImpl(() => {
        void service.tick(companyId).catch((err) => {
          logger.error(`[routines] scheduled tick failed for company ${companyId}`, err);
        });
      }, pollIntervalMs);
      timers.set(companyId, handle);
      void service.tick(companyId).catch((err) => {
        logger.error(`[routines] bootstrap tick failed for company ${companyId}`, err);
      });
    },

    stop(companyId) {
      const handle = timers.get(companyId);
      if (!handle) return;
      clearIntervalImpl(handle);
      timers.delete(companyId);
    },

    stopAll() {
      for (const companyId of timers.keys()) {
        service.stop(companyId);
      }
    },

    restart(companyId) {
      service.stop(companyId);
      service.start(companyId);
    },

    list(companyId) {
      return routinesRepo.listByCompany(companyId).map(rowToRoutine);
    },

    listRuns(input) {
      const limit = input.limit ?? 20;
      const rows = input.routineId
        ? routinesRepo.listRunsByRoutine(input.companyId, input.routineId, limit)
        : routinesRepo.listRunsByCompany(input.companyId, limit);
      return rows.map(rowToRoutineRun);
    },

    create(input) {
      const company = companiesRepo.getById(input.companyId);
      if (!company) {
        throw new Error(`[routines] company not found: ${input.companyId}`);
      }
      const name = ensureNonEmptyString(input.name, 'routine name');
      const schedule = normalizeSchedule(input.schedule);
      const workConfig = normalizeWorkConfig(input.workConfig);
      assertEmployee(input.companyId, workConfig.assigneeId);
      const existing = routinesRepo.listByCompany(input.companyId).map(rowToRoutine);
      const slug = nextSlug(input.companyId, name, existing);
      const createdAt = now();
      const enabled = input.enabled ?? true;
      const nextRunAt = enabled ? computeNextRunAt(schedule, createdAt) : null;
      const routineId = routinesRepo.create({
        companyId: input.companyId,
        name,
        slug,
        enabled,
        triggerKind: schedule.triggerKind,
        scheduleJson: JSON.stringify(schedule),
        workKind: 'ticket',
        workConfigJson: JSON.stringify(workConfig),
        nextRunAt,
      });
      emit('routine.created', input.companyId, routineId, {
        routineId,
        companyId: input.companyId,
        name,
        triggerKind: schedule.triggerKind,
        nextRunAt,
        createdAt,
      });
      return routineId;
    },

    update(input) {
      const current = resolveRoutine(input.routineId);
      const name =
        input.name !== undefined ? ensureNonEmptyString(input.name, 'routine name') : current.name;
      const schedule =
        input.schedule !== undefined ? normalizeSchedule(input.schedule) : current.schedule;
      const workConfig =
        input.workConfig !== undefined ? normalizeWorkConfig(input.workConfig) : current.workConfig;
      const enabled = input.enabled ?? current.enabled;
      assertEmployee(current.companyId, workConfig.assigneeId);
      const routines = routinesRepo.listByCompany(current.companyId).map(rowToRoutine);
      const slug =
        input.name !== undefined
          ? nextSlug(current.companyId, name, routines, current.id)
          : current.slug;
      const nextRunAt = enabled ? computeNextRunAt(schedule, now()) : null;
      const patchedKeys: Array<'name' | 'enabled' | 'schedule' | 'workConfig'> = [];
      if (input.name !== undefined) patchedKeys.push('name');
      if (input.enabled !== undefined) patchedKeys.push('enabled');
      if (input.schedule !== undefined) patchedKeys.push('schedule');
      if (input.workConfig !== undefined) patchedKeys.push('workConfig');
      routinesRepo.update(current.id, {
        name,
        slug,
        enabled,
        triggerKind: schedule.triggerKind,
        scheduleJson: JSON.stringify(schedule),
        workConfigJson: JSON.stringify(workConfig),
        nextRunAt,
      });
      emit('routine.updated', current.companyId, current.id, {
        routineId: current.id,
        companyId: current.companyId,
        patchedKeys,
        nextRunAt,
        updatedAt: now(),
      });
    },

    delete(routineId) {
      const current = resolveRoutine(routineId);
      routinesRepo.delete(routineId);
      emit('routine.deleted', current.companyId, current.id, {
        routineId: current.id,
        companyId: current.companyId,
        name: current.name,
        deletedAt: now(),
      });
    },

    async runNow(input) {
      const routine = resolveRoutine(input.routineId);
      return materializeRoutine(routine, 'manual', true);
    },

    async tick(companyId) {
      if (!isCompanyRunnable(companyId)) {
        return [];
      }
      const dueRows = routinesRepo.listDueByCompany(companyId, now());
      const runs: RoutineRun[] = [];
      for (const row of dueRows) {
        const routine = rowToRoutine(row);
        const run = await materializeRoutine(routine, 'scheduled', false);
        runs.push(run);
      }
      return runs;
    },
  };

  return service;
}
