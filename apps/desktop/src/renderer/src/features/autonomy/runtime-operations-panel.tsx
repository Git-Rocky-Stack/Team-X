import type { RuntimeSession, TicketCheckout } from '@team-x/shared-types';
import { Activity, HardDrive, RefreshCw, ShieldAlert, TicketCheck } from 'lucide-react';

import {
  LampTile,
  type LampTone,
  MetricTile,
  RecessedWell,
  SubviewState,
  Tag,
  VuMeter,
} from '@/components/console/index.js';
import { useRuntimeOperations } from '@/hooks/use-runtime-operations.js';

function formatTimestamp(value: number | null): string {
  return value === null ? 'never' : new Date(value).toLocaleTimeString();
}

function sessionLampTone(status: RuntimeSession['status'] | TicketCheckout['status']): LampTone {
  if (status === 'working' || status === 'active') return 'go';
  if (status === 'blocked' || status === 'stale') return 'hold';
  if (status === 'failed' || status === 'offline') return 'nogo';
  return 'off';
}

function RuntimeSessionCard({ session }: { session: RuntimeSession }) {
  const heartbeatContract =
    typeof session.capabilities.heartbeatContract === 'string'
      ? session.capabilities.heartbeatContract
      : 'runtime-heartbeat/v1';

  return (
    <RecessedWell className="space-y-3 p-4" data-runtime-session={session.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-body-strong text-foreground">{session.employeeId}</span>
            <LampTile
              label={session.status}
              tone={sessionLampTone(session.status)}
              small
              interactive={false}
            />
            <Tag>{session.adapterKind}</Tag>
          </div>
          <p className="break-all text-caption text-muted-foreground">
            {session.workspacePath ?? session.endpointUrl ?? 'No external workspace path exposed'}
          </p>
        </div>
        <Tag mono>{heartbeatContract}</Tag>
      </div>

      <div className="grid gap-2 text-caption text-muted-foreground sm:grid-cols-2">
        <div>
          <span className="text-body-strong text-foreground">Last heartbeat:</span>{' '}
          {formatTimestamp(session.lastHeartbeatAt)}
        </div>
        <div>
          <span className="text-body-strong text-foreground">Lease:</span>{' '}
          {formatTimestamp(session.leaseExpiresAt)}
        </div>
        <div className="break-all">
          <span className="text-body-strong text-foreground">Run:</span>{' '}
          {session.currentRunId ?? 'none'}
        </div>
        <div className="break-all">
          <span className="text-body-strong text-foreground">Ticket:</span>{' '}
          {session.currentTicketId ?? 'none'}
        </div>
      </div>

      {session.failureReason ? (
        <RecessedWell className="px-3 py-2 text-caption text-led-hold">
          {session.failureReason}
        </RecessedWell>
      ) : null}
    </RecessedWell>
  );
}

function TicketCheckoutRow({ checkout }: { checkout: TicketCheckout }) {
  return (
    <RecessedWell className="p-4" data-runtime-checkout={checkout.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-all text-body-strong text-foreground">{checkout.ticketId}</span>
            <LampTile
              label={checkout.status}
              tone={sessionLampTone(checkout.status)}
              small
              interactive={false}
            />
          </div>
          <p className="break-all text-caption text-muted-foreground">
            Claimed by {checkout.employeeId}
            {checkout.runtimeSessionId ? ` through ${checkout.runtimeSessionId}` : ''}
          </p>
        </div>
        <Tag mono>expires {formatTimestamp(checkout.expiresAt)}</Tag>
      </div>
    </RecessedWell>
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
      <SubviewState
        lampLabel="STBY"
        lampTone="off"
        title="Loading runtime operations"
        description="Team-X is resolving live runtime sessions, heartbeat leases, and active ticket checkouts."
      />
    );
  }

  if (operationsQuery.isError) {
    return (
      <SubviewState
        lampLabel="NO-GO"
        lampTone="nogo"
        title="Runtime operations could not load"
        description="The runtime lifecycle service is wired, but this workspace operations snapshot failed. Inspect the main-process logs before launching more external work."
      />
    );
  }

  return (
    <div className="space-y-4" data-runtime-operations-panel="">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-h2 text-foreground">Runtime Operations</h2>
          <p className="text-caption text-muted-foreground">
            Heartbeats, checkout leases, and budget hard-stops are now visible from the same
            workspace control plane.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <VuMeter
            className="w-40"
            label="Runtime utilization"
            value={sessions.length > 0 ? workingSessions / sessions.length : 0}
          />
          <button
            type="button"
            title="Refresh runtime operations"
            onClick={() => {
              void operationsQuery.refetch();
            }}
            disabled={operationsQuery.isFetching}
            className="cap flex h-10 w-10 items-center justify-center disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <MetricTile
          label="Live Sessions"
          value={String(sessions.length)}
          hint="Starting, idle, working, or blocked"
          icon={Activity}
        />
        <MetricTile
          label="Working"
          value={String(workingSessions)}
          hint="Currently executing external work"
          icon={HardDrive}
        />
        <MetricTile
          label="Blocked"
          value={String(blockedSessions)}
          hint="Budget or checkout gates stopped execution"
          icon={ShieldAlert}
          tone={blockedSessions > 0 ? 'amber' : undefined}
        />
        <MetricTile
          label="Checkouts"
          value={String(activeCheckouts.length)}
          hint="Active ticket ownership leases"
          icon={TicketCheck}
        />
      </div>

      {sessions.length === 0 && activeCheckouts.length === 0 ? (
        <SubviewState
          lampLabel="STBY"
          lampTone="off"
          title="No external runtimes are active"
          description="Launch an execution-backed runtime profile from a ticket or routine and its heartbeat, workspace, and checkout lease will appear here."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
          <div className="space-y-3">
            <div className="text-eyebrow text-muted-foreground">Live Runtime Sessions</div>
            {sessions.map((session) => (
              <RuntimeSessionCard key={session.id} session={session} />
            ))}
          </div>
          <div className="space-y-3">
            <div className="text-eyebrow text-muted-foreground">Active Ticket Checkouts</div>
            {activeCheckouts.length === 0 ? (
              <RecessedWell className="p-4 text-body text-muted-foreground">
                No ticket checkout lease is currently active.
              </RecessedWell>
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
