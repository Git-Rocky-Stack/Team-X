import type { RuntimeSession, TicketCheckout } from '@team-x/shared-types';
import { Activity, Clock3, HardDrive, RefreshCw, ShieldAlert, TicketCheck } from 'lucide-react';

import { useRuntimeOperations } from '@/hooks/use-runtime-operations.js';

import {
  MissionControlRow,
  MissionIconButton,
  MissionInsetSurface,
  MissionMetricTile,
  MissionPill,
  MissionStateBlock,
} from '../mission/mission-shell.js';

function formatTimestamp(value: number | null): string {
  return value === null ? 'never' : new Date(value).toLocaleTimeString();
}

function statusTone(
  status: RuntimeSession['status'] | TicketCheckout['status'],
): 'default' | 'accent' | 'warning' | 'danger' {
  if (status === 'working' || status === 'active') return 'accent';
  if (status === 'blocked' || status === 'stale') return 'warning';
  if (status === 'failed' || status === 'offline') return 'danger';
  return 'default';
}

function RuntimeSessionCard({ session }: { session: RuntimeSession }) {
  const heartbeatContract =
    typeof session.capabilities.heartbeatContract === 'string'
      ? session.capabilities.heartbeatContract
      : 'runtime-heartbeat/v1';

  return (
    <MissionInsetSurface className="space-y-3 p-4" data-runtime-session={session.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {session.employeeId}
            </span>
            <MissionPill tone={statusTone(session.status)}>{session.status}</MissionPill>
            <MissionPill>{session.adapterKind}</MissionPill>
          </div>
          <p className="break-all text-xs leading-5 text-muted-foreground">
            {session.workspacePath ?? session.endpointUrl ?? 'No external workspace path exposed'}
          </p>
        </div>
        <MissionPill mono>{heartbeatContract}</MissionPill>
      </div>

      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          <span className="font-semibold text-foreground">Last heartbeat:</span>{' '}
          {formatTimestamp(session.lastHeartbeatAt)}
        </div>
        <div>
          <span className="font-semibold text-foreground">Lease:</span>{' '}
          {formatTimestamp(session.leaseExpiresAt)}
        </div>
        <div className="break-all">
          <span className="font-semibold text-foreground">Run:</span>{' '}
          {session.currentRunId ?? 'none'}
        </div>
        <div className="break-all">
          <span className="font-semibold text-foreground">Ticket:</span>{' '}
          {session.currentTicketId ?? 'none'}
        </div>
      </div>

      {session.failureReason ? (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200">
          {session.failureReason}
        </div>
      ) : null}
    </MissionInsetSurface>
  );
}

function TicketCheckoutRow({ checkout }: { checkout: TicketCheckout }) {
  return (
    <MissionInsetSurface className="p-4" data-runtime-checkout={checkout.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-all text-sm font-semibold text-foreground">
              {checkout.ticketId}
            </span>
            <MissionPill tone={statusTone(checkout.status)}>{checkout.status}</MissionPill>
          </div>
          <p className="break-all text-xs leading-5 text-muted-foreground">
            Claimed by {checkout.employeeId}
            {checkout.runtimeSessionId ? ` through ${checkout.runtimeSessionId}` : ''}
          </p>
        </div>
        <MissionPill mono>expires {formatTimestamp(checkout.expiresAt)}</MissionPill>
      </div>
    </MissionInsetSurface>
  );
}

export function RuntimeOperationsPanel({ companyId }: { companyId: string }) {
  const operationsQuery = useRuntimeOperations(companyId);
  const snapshot = operationsQuery.data;
  const sessions = snapshot?.sessions ?? [];
  const activeCheckouts = snapshot?.activeCheckouts ?? [];
  const workingSessions = sessions.filter((session) => session.status === 'working').length;
  const blockedSessions = sessions.filter((session) => session.status === 'blocked').length;

  if (operationsQuery.isLoading) {
    return (
      <MissionStateBlock
        title="Loading runtime operations"
        description="Team-X is resolving live runtime sessions, heartbeat leases, and active ticket checkouts."
        icon={Activity}
      />
    );
  }

  if (operationsQuery.isError) {
    return (
      <MissionStateBlock
        title="Runtime operations could not load"
        description="The runtime lifecycle service is wired, but this workspace operations snapshot failed. Inspect the main-process logs before launching more external work."
        icon={ShieldAlert}
        tone="danger"
      />
    );
  }

  return (
    <div className="space-y-4" data-runtime-operations-panel="">
      <MissionControlRow className="justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-foreground">Runtime Operations</div>
          <p className="text-xs leading-5 text-muted-foreground">
            Heartbeats, checkout leases, and budget hard-stops are now visible from the same
            workspace control plane.
          </p>
        </div>
        <MissionIconButton
          title="Refresh runtime operations"
          onClick={() => {
            void operationsQuery.refetch();
          }}
          disabled={operationsQuery.isFetching}
        >
          <RefreshCw className="h-4 w-4" />
        </MissionIconButton>
      </MissionControlRow>

      <div className="grid gap-3 md:grid-cols-4">
        <MissionMetricTile
          label="Live Sessions"
          value={String(sessions.length)}
          hint="Starting, idle, working, or blocked"
          icon={Activity}
        />
        <MissionMetricTile
          label="Working"
          value={String(workingSessions)}
          hint="Currently executing external work"
          icon={HardDrive}
        />
        <MissionMetricTile
          label="Blocked"
          value={String(blockedSessions)}
          hint="Budget or checkout gates stopped execution"
          icon={ShieldAlert}
        />
        <MissionMetricTile
          label="Checkouts"
          value={String(activeCheckouts.length)}
          hint="Active ticket ownership leases"
          icon={TicketCheck}
        />
      </div>

      {sessions.length === 0 && activeCheckouts.length === 0 ? (
        <MissionStateBlock
          title="No external runtimes are active"
          description="Launch an execution-backed runtime profile from a ticket or routine and its heartbeat, workspace, and checkout lease will appear here."
          icon={Clock3}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Live Runtime Sessions
            </div>
            {sessions.map((session) => (
              <RuntimeSessionCard key={session.id} session={session} />
            ))}
          </div>
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Active Ticket Checkouts
            </div>
            {activeCheckouts.length === 0 ? (
              <MissionInsetSurface className="p-4 text-sm leading-6 text-muted-foreground">
                No ticket checkout lease is currently active.
              </MissionInsetSurface>
            ) : (
              activeCheckouts.map((checkout) => (
                <TicketCheckoutRow key={checkout.id} checkout={checkout} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
