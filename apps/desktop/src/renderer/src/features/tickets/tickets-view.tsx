import type { Employee, Ticket } from '@team-x/shared-types';
import { AlertTriangle, KanbanSquare, Plus, Radar, Rows3 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { CreateTicketDialog } from './create-ticket-dialog.js';
import { KanbanBoard } from './kanban-board.js';
import { TicketDetailPanel } from './ticket-detail.js';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import {
  MissionControlRow,
  MissionHero,
  MissionMetricTile,
  MissionPageShell,
  MissionPill,
  MissionRailCard,
  MissionSectionCard,
  MissionStateBlock,
} from '@/features/mission/mission-shell.js';
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
    <MissionPageShell data-tickets-view="">
      <MissionHero
        eyebrow="Mission queue"
        title="Ticket Operations"
        description="Drive backlog, active delivery, and blocker recovery from one operational board without breaking the existing ticket workflow."
        icon={KanbanSquare}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {activeTicketId ? (
              <Button
                type="button"
                variant="outline"
                className="border-white/10 bg-black/10 text-foreground hover:bg-black/20"
                onClick={() => setActiveTicketId(null)}
              >
                Clear detail rail
              </Button>
            ) : null}
            <Button
              type="button"
              className="bg-brand text-white hover:bg-brand/90"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Create Ticket
            </Button>
          </div>
        }
        meta={
          <MissionControlRow density="compact" className="gap-2 px-3 py-2">
            <MissionPill uppercase>{tickets.length} total tickets</MissionPill>
            <MissionPill mono>{summary.critical} critical</MissionPill>
            <MissionPill mono>{summary.unassigned} unassigned</MissionPill>
            <MissionPill mono>{employees.length} collaborators available</MissionPill>
          </MissionControlRow>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MissionMetricTile
            label="Backlog"
            value={`${summary.open}`}
            hint="Fresh work waiting for assignment or kickoff."
            icon={Rows3}
          />
          <MissionMetricTile
            label="Active Delivery"
            value={`${summary.inProgress}`}
            hint="Tickets currently moving through execution."
            icon={Radar}
          />
          <MissionMetricTile
            label="Blocked"
            value={`${summary.blocked}`}
            hint="Items that need intervention to move again."
            icon={AlertTriangle}
          />
          <MissionMetricTile
            label="Resolved"
            value={`${summary.done}`}
            hint="Closed work already delivered back to the queue."
            icon={KanbanSquare}
          />
        </div>
      </MissionHero>

      {companyId === null ? (
        <MissionSectionCard
          title="Ticket board"
          description="A workspace is required before the queue can load."
        >
          <MissionStateBlock
            title="No workspace selected"
            description="Choose or create a workspace to open the ticket board and detail rail."
            icon={KanbanSquare}
            data-tickets-view-state="no-company"
          />
        </MissionSectionCard>
      ) : isLoading ? (
        <MissionSectionCard
          title="Ticket board"
          description="Loading ticket flow and recent detail state."
        >
          <MissionStateBlock
            title="Loading ticket operations"
            description="Ticket lanes and detail history are syncing for the active workspace."
            icon={Radar}
            data-tickets-view-state="loading"
          />
        </MissionSectionCard>
      ) : isError ? (
        <MissionSectionCard
          title="Ticket board"
          description="The queue shell is ready, but the ticket query failed."
          actions={
            <Button
              type="button"
              variant="outline"
              className="border-white/10 bg-black/10 text-foreground hover:bg-black/20"
              onClick={() => refetch()}
            >
              Retry
            </Button>
          }
        >
          <MissionStateBlock
            title="Tickets could not load"
            description="Retry the workspace queue query to restore the board and detail rail."
            icon={AlertTriangle}
            tone="danger"
            data-tickets-view-state="error"
          />
        </MissionSectionCard>
      ) : tickets.length === 0 ? (
        <MissionSectionCard
          title="Ticket board"
          description="No operational tickets are open for this workspace yet."
          actions={
            <Button
              type="button"
              className="bg-brand text-white hover:bg-brand/90"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" />
              File the first ticket
            </Button>
          }
        >
          <MissionStateBlock
            title="Queue is clear"
            description="Create a ticket to seed the board, assign work, and open the detail rail."
            icon={KanbanSquare}
            data-tickets-view-state="empty"
          />
        </MissionSectionCard>
      ) : (
        <div
          className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.95fr)]"
          data-tickets-board-shell=""
        >
          <MissionSectionCard
            title="Operational board"
            description="Drag tickets across status lanes and keep the detail rail nearby for context."
            badge={
              <Badge
                variant="outline"
                className="border-white/10 bg-black/20 font-mono text-[10px] text-muted-foreground"
              >
                {tickets.length} tickets
              </Badge>
            }
            actions={
              <Button
                type="button"
                variant="outline"
                className="border-white/10 bg-black/10 text-foreground hover:bg-black/20"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-4 w-4" />
                New ticket
              </Button>
            }
            className={`${boardVisibleClassName} min-h-[34rem] flex-col overflow-hidden`}
            contentClassName="p-0"
          >
            <KanbanBoard
              tickets={tickets}
              employees={employees}
              onCreateClick={() => setCreateOpen(true)}
            />
          </MissionSectionCard>

          <MissionRailCard
            title={activeTicket ? activeTicket.title : 'Detail rail'}
            description={
              activeTicket
                ? 'Comment, attach context, and close work without leaving the board.'
                : 'Select any ticket to open the operational detail rail.'
            }
            className={`${detailVisibleClassName} min-h-[34rem] flex-col overflow-hidden`}
            contentClassName="p-0"
          >
            {activeTicketId ? (
              <TicketDetailPanel ticketId={activeTicketId} employees={employees} />
            ) : (
              <MissionStateBlock
                className="m-4 min-h-[28rem]"
                title="Detail rail standing by"
                description="Choose a ticket from the board to inspect attachments, comments, and ownership without leaving the queue."
                icon={Radar}
                data-tickets-view-state="detail-idle"
              />
            )}
          </MissionRailCard>
        </div>
      )}

      <CreateTicketDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        companyId={companyId}
        employees={employees}
      />
    </MissionPageShell>
  );
}
