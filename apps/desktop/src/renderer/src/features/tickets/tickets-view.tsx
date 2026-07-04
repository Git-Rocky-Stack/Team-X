import type { Employee, Ticket } from '@team-x/shared-types';
import { AlertTriangle, KanbanSquare, Plus, Radar, Rows3 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { CreateTicketDialog } from './create-ticket-dialog.js';
import { KanbanBoard } from './kanban-board.js';
import { TicketDetailPanel } from './ticket-detail.js';

import { Faceplate, LampTile, MetricTile, SubviewState, Tag } from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { useTicketEventSync, useTickets } from '@/hooks/use-tickets.js';
import { useAppStore } from '@/store/app-store.js';

interface TicketsViewProps {
  companyId: string | null;
  employees: Employee[];
}

function summarizeTickets(tickets: Ticket[]) {
  return {
    open: tickets.filter((ticket) => ticket.status === 'open').length,
    inProgress: tickets.filter((ticket) => ticket.status === 'in-progress').length,
    blocked: tickets.filter((ticket) => ticket.status === 'blocked').length,
    done: tickets.filter((ticket) => ticket.status === 'done').length,
    critical: tickets.filter((ticket) => ticket.priority === 'critical').length,
    unassigned: tickets.filter(
      (ticket) => ticket.assigneeId === null || ticket.assigneeId.length === 0,
    ).length,
  };
}

export function TicketsView({ companyId, employees }: TicketsViewProps) {
  const { data: tickets = [], isLoading, isError, refetch } = useTickets(companyId);
  useTicketEventSync(companyId);
  const activeTicketId = useAppStore((s) => s.activeTicketId);
  const setActiveTicketId = useAppStore((s) => s.setActiveTicketId);
  const [createOpen, setCreateOpen] = useState(false);

  const summary = useMemo(() => summarizeTickets(tickets), [tickets]);
  const activeTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === activeTicketId) ?? null,
    [tickets, activeTicketId],
  );

  const detailVisibleClassName = activeTicketId ? 'flex' : 'hidden xl:flex';
  const boardVisibleClassName = activeTicketId ? 'hidden xl:flex' : 'flex';

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6" data-tickets-view="">
      <Faceplate kicker="Ticket Operations" serial="MISSION QUEUE" bodyClassName="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-2xl text-body text-silver-mute">
            Drive backlog, active delivery, and blocker recovery from one operational board without
            breaking the existing ticket workflow.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {activeTicketId ? (
              <Button type="button" variant="outline" onClick={() => setActiveTicketId(null)}>
                Clear detail rail
              </Button>
            ) : null}
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create Ticket
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tag>{tickets.length} total tickets</Tag>
          <LampTile
            label={`${summary.critical} critical`}
            tone={summary.critical > 0 ? 'nogo' : 'off'}
            small
            interactive={false}
          />
          <Tag mono>{summary.unassigned} unassigned</Tag>
          <Tag>{employees.length} collaborators available</Tag>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="Backlog"
            value={`${summary.open}`}
            hint="Fresh work waiting for assignment or kickoff."
            icon={Rows3}
          />
          <MetricTile
            label="Active Delivery"
            value={`${summary.inProgress}`}
            hint="Tickets currently moving through execution."
            icon={Radar}
          />
          <MetricTile
            label="Blocked"
            value={`${summary.blocked}`}
            hint="Items that need intervention to move again."
            icon={AlertTriangle}
          />
          <MetricTile
            label="Resolved"
            value={`${summary.done}`}
            hint="Closed work already delivered back to the queue."
            icon={KanbanSquare}
          />
        </div>
      </Faceplate>

      {companyId === null ? (
        <Faceplate kicker="Ticket Board" bodyClassName="space-y-3">
          <div data-tickets-view-state="no-company">
            <SubviewState
              lampLabel="STBY"
              lampTone="off"
              title="No workspace selected"
              description="Choose or create a workspace to open the ticket board and detail rail."
            />
          </div>
        </Faceplate>
      ) : isLoading ? (
        <Faceplate kicker="Ticket Board" bodyClassName="space-y-3">
          <div data-tickets-view-state="loading">
            <SubviewState
              lampLabel="STBY"
              lampTone="hold"
              title="Loading ticket operations"
              description="Ticket lanes and detail history are syncing for the active workspace."
            />
          </div>
        </Faceplate>
      ) : isError ? (
        <Faceplate kicker="Ticket Board" bodyClassName="space-y-3">
          <div data-tickets-view-state="error">
            <SubviewState
              lampLabel="NO-GO"
              lampTone="nogo"
              title="Tickets could not load"
              description="Retry the workspace queue query to restore the board and detail rail."
              action={
                <Button type="button" variant="outline" onClick={() => refetch()}>
                  Retry
                </Button>
              }
            />
          </div>
        </Faceplate>
      ) : tickets.length === 0 ? (
        <Faceplate kicker="Ticket Board" bodyClassName="space-y-3">
          <div data-tickets-view-state="empty">
            <SubviewState
              lampLabel="STBY"
              lampTone="off"
              title="Queue is clear"
              description="Create a ticket to seed the board, assign work, and open the detail rail."
              action={
                <Button type="button" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  File the first ticket
                </Button>
              }
            />
          </div>
        </Faceplate>
      ) : (
        <div
          className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.95fr)]"
          data-tickets-board-shell=""
        >
          <Faceplate
            kicker="Operational Board"
            stripeSlot={
              <div className="flex items-center gap-2">
                <Tag mono>{tickets.length} tickets</Tag>
                <button
                  type="button"
                  className="cap px-2.5 py-1 text-button-sm"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="mr-1 inline h-3.5 w-3.5" />
                  New ticket
                </button>
              </div>
            }
            className={`${boardVisibleClassName} min-h-[34rem] flex-col overflow-hidden`}
            bodyClassName="p-0"
          >
            <KanbanBoard
              tickets={tickets}
              employees={employees}
              onCreateClick={() => setCreateOpen(true)}
            />
          </Faceplate>

          <Faceplate
            kicker={activeTicket ? activeTicket.title : 'Detail Rail'}
            className={`${detailVisibleClassName} min-h-[34rem] flex-col overflow-hidden`}
            bodyClassName="p-0"
          >
            {activeTicketId ? (
              <TicketDetailPanel ticketId={activeTicketId} employees={employees} />
            ) : (
              <div className="m-4" data-tickets-view-state="detail-idle">
                <SubviewState
                  lampLabel="STBY"
                  lampTone="off"
                  title="Detail rail standing by"
                  description="Choose a ticket from the board to inspect attachments, comments, and ownership without leaving the queue."
                />
              </div>
            )}
          </Faceplate>
        </div>
      )}

      <CreateTicketDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        companyId={companyId}
        employees={employees}
      />
    </div>
  );
}
