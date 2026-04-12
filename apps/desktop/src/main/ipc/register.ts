/**
 * IPC register — the electron-glue layer for the pure handlers in
 * `./handlers.ts`. Two responsibilities:
 *
 *   1. Mount each handler on `ipcMain.handle` against the channel name
 *      from the shared-types `IpcContract`. The Electron `invoke` /
 *      `handle` pair is the only IPC pattern Team-X uses for
 *      request/response — fire-and-forget signaling goes through the
 *      dashboard event channel below.
 *
 *   2. Subscribe a forwarder to the orchestrator's event bus that
 *      fans every `DashboardEvent` out to every live `BrowserWindow`
 *      via `webContents.send('events.dashboard', evt)`. This is the
 *      one-way push channel the renderer subscribes to via the
 *      preload bridge (T34) so the cockpit can update in real time.
 *
 * Why this file is intentionally tiny:
 *
 *   Everything interesting (request validation, repo coordination,
 *   row → public-shape mapping, fail-closed checks, fire-and-forget
 *   orchestrator wiring) lives in `handlers.ts` where it can be
 *   exhaustively unit-tested without electron. This file is just the
 *   wiring — three `ipcMain.handle` calls and one bus subscription —
 *   so it has zero unit tests by design. Integration coverage lands
 *   in the Playwright smoke test (T49) which boots a real Electron
 *   instance.
 *
 * Lifecycle:
 *
 *   `registerIpcHandlers` returns an `unregister` function that the
 *   main process invokes from `app.will-quit`. The unregister:
 *
 *     - removes every `ipcMain.handle` mapping (so a stray late
 *       invoke from a teardown sequence doesn't hit a ghost handler),
 *     - and detaches the bus subscriber (so the bus does not keep a
 *       dead reference to a `webContents` that has already been
 *       garbage collected).
 *
 *   The forwarder also defends against destroyed windows: a
 *   `webContents.send` on a destroyed `BrowserWindow` throws, and
 *   that throw must NOT cascade into the bus and break delivery to
 *   the rest of the windows. We pre-filter via `isDestroyed()` and
 *   wrap the `send` in try/catch as a belt-and-suspenders measure.
 */

import { BrowserWindow, ipcMain } from 'electron';

import type { MeetingMode } from '@team-x/shared-types';

import type { EventBus } from '../orchestrator/event-bus.js';
import type { IpcHandlers } from './handlers.js';

/**
 * Channel names — kept as a const tuple so the matching unregister
 * call can iterate them without re-typing the strings (and so a
 * future change to the contract has exactly one source of truth).
 *
 * Mirrors the channel keys in `@team-x/shared-types` `IpcContract`;
 * the typed preload bridge in T34 hands the renderer a wrapper that
 * uses these exact strings.
 */
const REQUEST_CHANNELS = [
  'companies.list',
  'employees.list',
  'employees.create',
  'chat.send',
  'chat.list',
  'chat.resolveThread',
  'chat.listThreads',
  // Events / timeline (Phase 3 — M14)
  'events.list',
  // MCP management (Phase 2 — M10)
  'mcp.list',
  'mcp.toggle',
  'mcp.addServer',
  'mcp.removeServer',
  'mcp.testConnection',
  // Goals management (Phase 3 — M15)
  'goals.create',
  'goals.update',
  'goals.list',
  'goals.get',
  'goals.delete',
  // Projects management (Phase 3 — M15)
  'projects.create',
  'projects.update',
  'projects.list',
  'projects.get',
  'projects.delete',
  'projects.linkTicket',
  'projects.unlinkTicket',
  // Meeting management (Phase 3 — M16)
  'meetings.call',
  'meetings.end',
  'meetings.interject',
  'meetings.list',
  'meetings.get',
  // Telemetry (Phase 3 — M17)
  'telemetry.companyStats',
  'telemetry.dailyUsage',
  'telemetry.employeeStats',
  'telemetry.costBreakdown',
  // Ticket management (Phase 2 — M12)
  'tickets.create',
  'tickets.update',
  'tickets.assign',
  'tickets.close',
  'tickets.reopen',
  'tickets.addComment',
  'tickets.list',
  'tickets.get',
] as const;

/** Channel name for the one-way bus → renderer fan-out. */
const EVENT_CHANNEL = 'events.dashboard';

/**
 * Wire `handlers` into Electron's IPC and start forwarding events
 * from `bus` to every live BrowserWindow. Returns a teardown
 * function — call it from `app.will-quit` to clean up handler
 * mappings and detach the bus subscription.
 */
export function registerIpcHandlers(handlers: IpcHandlers, bus: EventBus): () => void {
  ipcMain.handle('companies.list', async () => {
    return handlers.companiesList();
  });

  ipcMain.handle('employees.list', async (_event, request: { companyId: string }) => {
    return handlers.employeesList(request);
  });

  ipcMain.handle(
    'employees.create',
    async (_event, request: { companyId: string; roleId: string; name: string }) => {
      return handlers.employeesCreate(request);
    },
  );

  ipcMain.handle(
    'chat.send',
    async (_event, request: { threadId: string; employeeId: string; content: string }) => {
      return handlers.chatSend(request);
    },
  );

  ipcMain.handle('chat.list', async (_event, request: { threadId: string }) => {
    return handlers.chatList(request);
  });

  ipcMain.handle('chat.resolveThread', async (_event, request: { employeeId: string }) => {
    return handlers.chatResolveThread(request);
  });

  ipcMain.handle('chat.listThreads', async (_event, request: { companyId: string }) => {
    return handlers.chatListThreads(request);
  });

  // Events / timeline handler (Phase 3 — M14)
  ipcMain.handle(
    'events.list',
    async (_event, request: { companyId: string; cursor?: number; limit?: number }) => {
      return handlers.eventsList(request);
    },
  );

  // MCP management handlers (Phase 2 — M10)
  ipcMain.handle('mcp.list', async (_event, request: { companyId: string }) => {
    return handlers.mcpList(request);
  });

  ipcMain.handle('mcp.toggle', async (_event, request: { serverId: string; enabled: boolean }) => {
    return handlers.mcpToggle(request);
  });

  ipcMain.handle(
    'mcp.addServer',
    async (
      _event,
      request: {
        companyId: string | null;
        name: string;
        transport: 'stdio' | 'sse';
        configJson: string;
      },
    ) => {
      return handlers.mcpAddServer(request);
    },
  );

  ipcMain.handle('mcp.removeServer', async (_event, request: { serverId: string }) => {
    return handlers.mcpRemoveServer(request);
  });

  ipcMain.handle(
    'mcp.testConnection',
    async (_event, request: { transport: 'stdio' | 'sse'; configJson: string }) => {
      return handlers.mcpTestConnection(request);
    },
  );

  // Goals management handlers (Phase 3 — M15)
  ipcMain.handle(
    'goals.create',
    async (
      _event,
      request: {
        companyId: string;
        title: string;
        description?: string;
        targetDate?: number | null;
      },
    ) => {
      return handlers.goalsCreate(request);
    },
  );

  ipcMain.handle(
    'goals.update',
    async (
      _event,
      request: {
        goalId: string;
        title?: string;
        description?: string;
        status?: string;
        progressPct?: number;
        targetDate?: number | null;
      },
    ) => {
      return handlers.goalsUpdate(request);
    },
  );

  ipcMain.handle('goals.list', async (_event, request: { companyId: string }) => {
    return handlers.goalsList(request);
  });

  ipcMain.handle('goals.get', async (_event, request: { goalId: string }) => {
    return handlers.goalsGet(request);
  });

  ipcMain.handle('goals.delete', async (_event, request: { goalId: string }) => {
    return handlers.goalsDelete(request);
  });

  // Projects management handlers (Phase 3 — M15)
  ipcMain.handle(
    'projects.create',
    async (
      _event,
      request: {
        companyId: string;
        goalId?: string | null;
        title: string;
        description?: string;
        leadId?: string | null;
        priority?: string;
      },
    ) => {
      return handlers.projectsCreate(request);
    },
  );

  ipcMain.handle(
    'projects.update',
    async (
      _event,
      request: {
        projectId: string;
        title?: string;
        description?: string;
        status?: string;
        goalId?: string | null;
        leadId?: string | null;
        priority?: string;
      },
    ) => {
      return handlers.projectsUpdate(request);
    },
  );

  ipcMain.handle('projects.list', async (_event, request: { companyId: string }) => {
    return handlers.projectsList(request);
  });

  ipcMain.handle('projects.get', async (_event, request: { projectId: string }) => {
    return handlers.projectsGet(request);
  });

  ipcMain.handle('projects.delete', async (_event, request: { projectId: string }) => {
    return handlers.projectsDelete(request);
  });

  ipcMain.handle(
    'projects.linkTicket',
    async (_event, request: { projectId: string; ticketId: string }) => {
      return handlers.projectsLinkTicket(request);
    },
  );

  ipcMain.handle(
    'projects.unlinkTicket',
    async (_event, request: { projectId: string; ticketId: string }) => {
      return handlers.projectsUnlinkTicket(request);
    },
  );

  // Meeting management handlers (Phase 3 — M16)
  ipcMain.handle(
    'meetings.call',
    async (
      _event,
      request: {
        companyId: string;
        chairId: string;
        attendeeIds: string[];
        agenda: string;
        mode?: string;
      },
    ) => {
      return handlers.meetingsCall({
        ...request,
        mode: request.mode as MeetingMode | undefined,
      });
    },
  );

  ipcMain.handle('meetings.end', async (_event, request: { meetingId: string }) => {
    return handlers.meetingsEnd(request);
  });

  ipcMain.handle(
    'meetings.interject',
    async (_event, request: { meetingId: string; content: string }) => {
      return handlers.meetingsInterject(request);
    },
  );

  ipcMain.handle('meetings.list', async (_event, request: { companyId: string }) => {
    return handlers.meetingsList(request);
  });

  ipcMain.handle('meetings.get', async (_event, request: { meetingId: string }) => {
    return handlers.meetingsGet(request);
  });

  // Telemetry handlers (Phase 3 — M17)
  ipcMain.handle('telemetry.companyStats', async (_event, request: { companyId: string }) => {
    return handlers.telemetryCompanyStats(request);
  });

  ipcMain.handle(
    'telemetry.dailyUsage',
    async (_event, request: { companyId: string; fromMs: number; toMs: number }) => {
      return handlers.telemetryDailyUsage(request);
    },
  );

  ipcMain.handle('telemetry.employeeStats', async (_event, request: { companyId: string }) => {
    return handlers.telemetryEmployeeStats(request);
  });

  ipcMain.handle(
    'telemetry.costBreakdown',
    async (_event, request: { companyId: string; fromMs?: number; toMs?: number }) => {
      return handlers.telemetryCostBreakdown(request);
    },
  );

  // Ticket management handlers (Phase 2 — M12)
  ipcMain.handle(
    'tickets.create',
    async (
      _event,
      request: {
        companyId: string;
        title: string;
        description?: string;
        priority?: string;
        assigneeId?: string;
        labelsJson?: string;
        slaHours?: number;
        dueAt?: number;
      },
    ) => {
      return handlers.ticketsCreate(request);
    },
  );

  ipcMain.handle(
    'tickets.update',
    async (
      _event,
      request: {
        ticketId: string;
        title?: string;
        description?: string;
        priority?: string;
        status?: string;
        labelsJson?: string;
        slaHours?: number | null;
        dueAt?: number | null;
      },
    ) => {
      return handlers.ticketsUpdate(request);
    },
  );

  ipcMain.handle(
    'tickets.assign',
    async (_event, request: { ticketId: string; assigneeId: string }) => {
      return handlers.ticketsAssign(request);
    },
  );

  ipcMain.handle('tickets.close', async (_event, request: { ticketId: string }) => {
    return handlers.ticketsClose(request);
  });

  ipcMain.handle('tickets.reopen', async (_event, request: { ticketId: string }) => {
    return handlers.ticketsReopen(request);
  });

  ipcMain.handle(
    'tickets.addComment',
    async (_event, request: { ticketId: string; content: string }) => {
      return handlers.ticketsAddComment(request);
    },
  );

  ipcMain.handle('tickets.list', async (_event, request: { companyId: string }) => {
    return handlers.ticketsList(request);
  });

  ipcMain.handle('tickets.get', async (_event, request: { ticketId: string }) => {
    return handlers.ticketsGet(request);
  });

  // Bus → renderer forwarder. The bus is synchronous fan-out, so the
  // listener runs on the same tick as the orchestrator's `emit` call —
  // tokens reach the renderer with no extra event-loop hop.
  const unsubscribe = bus.subscribe((event) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      try {
        win.webContents.send(EVENT_CHANNEL, event);
      } catch (err) {
        // A `webContents.send` failure on one window must not break
        // delivery to the others, and must not propagate back into
        // the bus (where the orchestrator would see a thrown listener).
        // Log so the failure is not silent and move on.
        console.error(
          `[ipc/register] failed to forward event ${event.id} (${event.type}) to window ${win.id}:`,
          err,
        );
      }
    }
  });

  return function unregister(): void {
    for (const channel of REQUEST_CHANNELS) {
      ipcMain.removeHandler(channel);
    }
    unsubscribe();
  };
}
