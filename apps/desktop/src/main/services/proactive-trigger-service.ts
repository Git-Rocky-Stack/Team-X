/**
 * ProactiveTriggerService — goal decomposition and background work scanning.
 *
 * This service enables agents to recognize opportunities and act without
 * explicit user commands — the core value proposition of an AI company
 * that "runs itself."
 *
 * Key responsibilities:
 *   - decomposeGoal: Trigger agentic loop to decompose a goal into tickets
 *   - scanForWork: Find unassigned tickets and queue agent replies
 *   - setEnabled/isEnabled: Proactive mode toggle per company
 *   - Authority checks: Respect employee capability grants
 *   - Pause awareness: Honor orchestrator pause (meetings)
 *   - Budget gates: Check budget before enqueuing work
 *
 * Integrates with:
 *   - AgenticLoopService for goal decomposition (decompose_project tool)
 *   - Orchestrator for work queuing (enqueueChat)
 *   - AuthorityResolver for capability/path gating
 *   - EventBus for proactive.* event emission
 *
 * Phase 6 — Proactive Execution System — Slice 1
 */

import type {
  EffectiveAuthoritySnapshot,
  EventType,
  ExtensionsAutonomyMode,
} from '@team-x/shared-types';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ProactiveTriggerServiceDeps {
  orchestrator: {
    enqueueChat(args: {
      threadId: string;
      employeeId: string;
      userMessageId: string;
    }): Promise<void>;
    isCompanyPaused(companyId: string): boolean;
  };
  agenticLoopService: {
    start(args: {
      companyId: string;
      userText: string;
      employeeId?: string;
    }): Promise<{ runId: string; threadId: string }>;
  };
  authorityResolver: {
    resolveEmployee(companyId: string, employeeId: string): EffectiveAuthoritySnapshot;
  };
  employeesRepo: {
    getById(id: string): { id: string; companyId: string; level: string; isSystem: boolean } | null;
    listByCompany(companyId: string): Array<{
      id: string;
      companyId: string;
      level: string;
      isSystem: boolean;
    }>;
  };
  goalsRepo: {
    listByCompany(companyId: string): Array<{
      id: string;
      companyId: string;
      title: string;
      description: string;
      status: string;
    }>;
  };
  ticketsRepo: {
    listByCompany(companyId: string): Array<{
      id: string;
      companyId: string;
      title: string;
      description: string;
      status: string;
      assigneeId: string | null;
      reporterId: string;
      reporterKind: string;
      priority: string;
    }>;
  };
  projectsRepo: {
    listByCompany(companyId: string): Array<{
      id: string;
      companyId: string;
      goalId: string | null;
      title: string;
      description: string;
      status: string;
    }>;
  };
  bus: {
    emit<T>(input: {
      type: EventType;
      companyId: string;
      actorId: string;
      actorKind: string;
      payload: T;
    }): unknown;
  };
  settingsRepo: {
    getProactive(): { enabled: boolean; autonomyMode: ExtensionsAutonomyMode };
  };
  /**
   * Governed dispatch path for proactive work.
   *
   * `scanForWork` previously synthesized `proactive-thread-*` /
   * `proactive-msg-*` ids for rows that were never inserted and called
   * `orchestrator.enqueueChat` directly, which skipped budget admission
   * entirely. The dispatcher owns thread creation, trigger-message
   * creation, budget governance and the `proactive.*` lifecycle events, so
   * it is a required dependency — there is no ungoverned fallback.
   */
  dispatcher: ProactiveDispatcherLike;
  logger?: {
    warn(msg: string, err?: unknown): void;
    error(msg: string, err?: unknown): void;
  };
  now?: () => number;
}

/**
 * Structural subset of `ProactiveDispatcher` (orchestrator/proactive-dispatch)
 * that this service needs. Declared structurally so the service stays
 * unit-testable without importing the orchestrator barrel.
 */
export interface ProactiveDispatcherLike {
  enqueueProactive(args: {
    companyId: string;
    employeeId: string;
    trigger: 'goal_decompose' | 'work_scan' | 'background_monitor';
    triggerId: string;
    sourceGoalId?: string;
    sourceTicketId?: string;
  }): Promise<
    | { success: true; threadId: string; userMessageId: string }
    | { success: false; error: string; reason?: string }
  >;
}

/**
 * Observable proactive runtime state for one company.
 *
 * Every field is something the service can actually prove, so the metric
 * tiles that render it (ProactiveControls, Settings → Extensions) cannot
 * drift from reality:
 *   - `activeWork`  — dispatches handed to the orchestrator whose turn has
 *     not settled yet. `enqueueChat` resolves on turn COMPLETION, so this
 *     is an exact in-flight count.
 *   - `queuedWork`  — eligible tickets the running scan has accepted but
 *     not yet dispatched.
 *   - `lastScanAt`  — epoch ms at which the most recent scan finished, or
 *     null when this company has never been scanned.
 */
export interface ProactiveRuntimeState {
  activeWork: number;
  queuedWork: number;
  lastScanAt: number | null;
}

export interface ProactiveTriggerService {
  // Goal-driven: decompose a goal into tickets
  decomposeGoal(args: { companyId: string; goalId: string }): Promise<void>;

  // Background: find and queue work opportunities
  scanForWork(args: { companyId: string }): Promise<{ queuedCount: number }>;

  // Enable/disable proactive mode
  setEnabled(args: { companyId: string; enabled: boolean }): void;

  // Query current state
  isEnabled(companyId: string): boolean;

  /** Observable runtime counters for one company. Never synthesized. */
  getState(companyId: string): ProactiveRuntimeState;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function createProactiveTriggerService(
  deps: ProactiveTriggerServiceDeps,
): ProactiveTriggerService {
  const now = deps.now ?? Date.now;
  const logger = deps.logger ?? {
    warn: (msg: string, err?: unknown) => console.warn(msg, err),
    error: (msg: string, err?: unknown) => console.error(msg, err),
  };

  // Track explicitly disabled companies (in-memory; persisted via settingsRepo)
  // When global settings.enabled is true, all companies are enabled UNLESS
  // they're in this disabled set.
  const disabledCompanies = new Set<string>();

  // Per-company runtime counters backing `getState`. Process-local by
  // design: they describe work in flight *right now* in this main process,
  // which is exactly what the dashboard tiles claim to show.
  const runtimeState = new Map<string, ProactiveRuntimeState>();

  function stateFor(companyId: string): ProactiveRuntimeState {
    let current = runtimeState.get(companyId);
    if (!current) {
      current = { activeWork: 0, queuedWork: 0, lastScanAt: null };
      runtimeState.set(companyId, current);
    }
    return current;
  }

  function getState(companyId: string): ProactiveRuntimeState {
    const current = stateFor(companyId);
    return { ...current };
  }

  /**
   * Resolve the system agent employee for a company.
   * The system agent is identified by isSystem: true.
   */
  function resolveSystemAgent(companyId: string): string | null {
    const employees = deps.employeesRepo.listByCompany(companyId);
    const systemAgent = employees.find((e) => e.isSystem);
    return systemAgent?.id ?? null;
  }

  /**
   * Check if proactive is enabled for a company.
   * Returns true if global setting is enabled AND company is not explicitly disabled.
   */
  function isEnabled(companyId: string): boolean {
    const settings = deps.settingsRepo.getProactive();
    if (!settings.enabled) return false;
    return !disabledCompanies.has(companyId);
  }

  /**
   * Enable or disable proactive mode for a company.
   * Emits proactive.enabled_changed event.
   */
  function setEnabled(args: { companyId: string; enabled: boolean }): void {
    const { companyId, enabled } = args;
    if (enabled) {
      disabledCompanies.delete(companyId);
    } else {
      disabledCompanies.add(companyId);
    }

    try {
      deps.bus.emit({
        type: 'proactive.enabled_changed',
        companyId,
        actorId: 'system',
        actorKind: 'orchestrator',
        payload: {
          enabled,
          actorId: 'system',
          changedAt: now(),
        },
      });
    } catch (err) {
      logger.warn('[proactive] failed to emit enabled_changed event', err);
    }
  }

  /**
   * Decompose a goal into tickets using the agentic loop.
   * Uses the decompose_project tool from agentic-tools-write.
   */
  async function decomposeGoal(args: {
    companyId: string;
    goalId: string;
  }): Promise<void> {
    const { companyId, goalId } = args;

    // Resolve the system agent for this company
    const systemAgentId = resolveSystemAgent(companyId);
    if (!systemAgentId) {
      logger.warn(`[proactive] no system agent found for company "${companyId}"`);
      return;
    }

    // Check if proactive is enabled globally
    const settings = deps.settingsRepo.getProactive();
    if (!settings.enabled) {
      return;
    }

    // Check company-specific enabled state
    if (!isEnabled(companyId)) {
      return;
    }

    // Respect autonomy mode: conservative blocks goal decomposition
    if (settings.autonomyMode === 'conservative') {
      try {
        deps.bus.emit({
          type: 'proactive.blocked',
          companyId,
          actorId: systemAgentId,
          actorKind: 'employee',
          payload: {
            triggerId: goalId,
            reason: 'autonomy_mode',
            explanation:
              'Conservative autonomy mode requires explicit approval for goal decomposition',
            autonomyMode: settings.autonomyMode,
            blockedAt: now(),
          },
        });
      } catch (err) {
        logger.warn('[proactive] failed to emit blocked event', err);
      }
      return;
    }

    // Fetch the goal
    const goals = deps.goalsRepo.listByCompany(companyId);
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) {
      try {
        deps.bus.emit({
          type: 'proactive.error',
          companyId,
          actorId: systemAgentId,
          actorKind: 'employee',
          payload: {
            operation: 'decomposeGoal',
            message: `Goal "${goalId}" not found`,
            recoverable: false,
            errorAt: now(),
          },
        });
      } catch (err) {
        logger.warn('[proactive] failed to emit error event', err);
      }
      logger.warn(`[proactive] goal "${goalId}" not found for company "${companyId}"`);
      return;
    }

    // Check if company is paused (in meeting)
    if (deps.orchestrator.isCompanyPaused(companyId)) {
      try {
        deps.bus.emit({
          type: 'proactive.blocked',
          companyId,
          actorId: systemAgentId,
          actorKind: 'employee',
          payload: {
            triggerId: goalId,
            reason: 'pause',
            explanation: 'Company is currently paused (meeting in progress)',
            autonomyMode: settings.autonomyMode,
            blockedAt: now(),
          },
        });
      } catch (err) {
        logger.warn('[proactive] failed to emit blocked event', err);
      }
      return;
    }

    // Build the decompose prompt
    const decomposePrompt = `Decompose the following goal into actionable tickets and projects using the decompose_project tool.

Goal ID: ${goal.id}
Title: ${goal.title}
Description: ${goal.description || 'No description provided'}

Please analyze this goal and propose a structured breakdown with:
1. Key milestones/phases
2. Specific tickets with clear deliverables
3. Suggested assignees based on role fit
4. Dependencies between tasks
5. Priority levels

Use the decompose_project tool to generate the proposal.`;

    // Start the agentic loop for decomposition
    let runId: string | null = null;
    let threadId: string | null = null;

    try {
      const result = await deps.agenticLoopService.start({
        companyId,
        userText: decomposePrompt,
        employeeId: systemAgentId,
      });
      runId = result.runId;
      threadId = result.threadId;

      // Emit goal_decomposed event
      try {
        deps.bus.emit({
          type: 'proactive.goal_decomposed',
          companyId,
          actorId: systemAgentId,
          actorKind: 'employee',
          payload: {
            goalId,
            runId,
            threadId,
            proposalCount: 0, // Will be updated by agentic loop completion
            decomposedAt: now(),
          },
        });
      } catch (err) {
        logger.warn('[proactive] failed to emit goal_decomposed event', err);
      }
    } catch (err) {
      logger.error('[proactive] agentic loop start failed', err);

      try {
        deps.bus.emit({
          type: 'proactive.error',
          companyId,
          actorId: systemAgentId,
          actorKind: 'employee',
          payload: {
            operation: 'decomposeGoal',
            message: err instanceof Error ? err.message : String(err),
            recoverable: true,
            errorAt: now(),
          },
        });
      } catch (emitErr) {
        logger.warn('[proactive] failed to emit error event', emitErr);
      }
    }
  }

  /**
   * Scan for work opportunities and queue agent replies.
   * Finds unassigned tickets and creates proactive work items.
   */
  async function scanForWork(args: {
    companyId: string;
  }): Promise<{ queuedCount: number }> {
    const { companyId } = args;

    // Resolve the system agent for this company
    const systemAgentId = resolveSystemAgent(companyId);
    if (!systemAgentId) {
      logger.warn(`[proactive] no system agent found for company "${companyId}"`);
      return { queuedCount: 0 };
    }

    // Check if proactive is enabled
    const settings = deps.settingsRepo.getProactive();
    if (!settings.enabled) {
      return { queuedCount: 0 };
    }

    if (!isEnabled(companyId)) {
      return { queuedCount: 0 };
    }

    // Check if company is paused
    if (deps.orchestrator.isCompanyPaused(companyId)) {
      return { queuedCount: 0 };
    }

    // Get all tickets for the company
    const tickets = deps.ticketsRepo.listByCompany(companyId);

    // Filter for unassigned, open tickets
    const unassignedTickets = tickets.filter((t) => t.assigneeId === null && t.status === 'open');

    // The scan has cleared every gate, so it is genuinely running: publish
    // the backlog it is about to work through. A scan refused upstream
    // (disabled / paused) deliberately does not touch these counters —
    // nothing was scanned.
    const state = stateFor(companyId);
    state.queuedWork = unassignedTickets.length;

    let queuedCount = 0;
    let assignmentCursor = 0;

    try {
      for (const ticket of unassignedTickets) {
        // Check authority if ticket was filed by an employee
        if (ticket.reporterKind === 'employee' && ticket.reporterId) {
          const authority = deps.authorityResolver.resolveEmployee(companyId, ticket.reporterId);

          // Check if proactive_work capability is allowed
          const proactiveCapability = authority.entries.find(
            (entry: { resourceKind: string; resourceId: string; permission: string }) =>
              entry.resourceKind === 'capability' &&
              (entry.resourceId === 'proactive_work' || entry.resourceId === '*'),
          );

          if (proactiveCapability?.permission === 'deny') {
            try {
              deps.bus.emit({
                type: 'proactive.blocked',
                companyId,
                actorId: ticket.reporterId,
                actorKind: 'employee',
                payload: {
                  triggerId: ticket.id,
                  reason: 'authority',
                  explanation: `Employee "${ticket.reporterId}" lacks authority for proactive work`,
                  autonomyMode: settings.autonomyMode,
                  blockedAt: now(),
                },
              });
            } catch (err) {
              logger.warn('[proactive] failed to emit blocked event', err);
            }
            continue;
          }
        }

        // Find an available employee to assign the ticket to
        const employees = deps.employeesRepo
          .listByCompany(companyId)
          .filter((e) => !e.isSystem && e.level !== 'officer');

        if (employees.length === 0) {
          continue;
        }

        // Round-robin across eligible employees so a single owner does not
        // absorb every unassigned ticket in one scan. The
        // `employees.length === 0` guard above proves the index is in range;
        // the explicit guard narrows the type without a non-null assertion.
        const assignedEmployee = employees[assignmentCursor % employees.length];
        if (!assignedEmployee) {
          continue;
        }
        assignmentCursor += 1;

        // Hand off to the governed dispatcher: it creates the thread and the
        // trigger message, enforces budget admission, re-checks pause state
        // and emits the lifecycle events. Move the item from the scan backlog
        // into the in-flight count for the duration of the turn —
        // `enqueueChat` (and therefore `enqueueProactive`) settles on turn
        // completion, so this window is the real execution window.
        state.queuedWork = Math.max(0, state.queuedWork - 1);
        state.activeWork += 1;

        try {
          const dispatched = await deps.dispatcher.enqueueProactive({
            companyId,
            employeeId: assignedEmployee.id,
            trigger: 'work_scan',
            triggerId: ticket.id,
            sourceTicketId: ticket.id,
          });

          if (!dispatched.success) {
            // The dispatcher already emitted the precise reason
            // (budget_blocked / blocked / error); nothing was queued.
            logger.warn(
              `[proactive] dispatch refused for ticket "${ticket.id}": ${dispatched.error}${
                dispatched.reason ? ` — ${dispatched.reason}` : ''
              }`,
            );
            continue;
          }

          queuedCount += 1;

          // Emit work_queued event
          try {
            deps.bus.emit({
              type: 'proactive.work_queued',
              companyId,
              actorId: systemAgentId,
              actorKind: 'employee',
              payload: {
                triggerId: ticket.id,
                triggerKind: 'work_scan',
                threadId: dispatched.threadId,
                employeeId: assignedEmployee.id,
                goalId: null,
                ticketId: ticket.id,
                queuedAt: now(),
              },
            });
          } catch (err) {
            logger.warn('[proactive] failed to emit work_queued event', err);
          }
        } catch (err) {
          logger.error(`[proactive] failed to enqueue work for ticket "${ticket.id}"`, err);

          try {
            deps.bus.emit({
              type: 'proactive.error',
              companyId,
              actorId: systemAgentId,
              actorKind: 'employee',
              payload: {
                operation: 'scanForWork',
                message: `Failed to enqueue work for ticket "${ticket.id}": ${err instanceof Error ? err.message : String(err)}`,
                recoverable: true,
                errorAt: now(),
              },
            });
          } catch (emitErr) {
            logger.warn('[proactive] failed to emit error event', emitErr);
          }
        } finally {
          // The turn has settled (completed, refused or thrown) — it is no
          // longer in flight. A leaked counter would strand the dashboard at
          // a non-zero "Active Work" forever.
          state.activeWork = Math.max(0, state.activeWork - 1);
        }
      }
    } finally {
      // The scan is over however it ended: no backlog remains, and the
      // completion timestamp is what "Last Scan" reports.
      state.queuedWork = 0;
      state.lastScanAt = now();
    }

    return { queuedCount };
  }

  return {
    decomposeGoal,
    scanForWork,
    setEnabled,
    isEnabled,
    getState,
  };
}
