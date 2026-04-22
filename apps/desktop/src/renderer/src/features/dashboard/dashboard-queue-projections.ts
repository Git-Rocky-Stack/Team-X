import type { Employee, Ticket } from '@team-x/shared-types';

import type { EmployeeLiveState } from '../../store/app-store.js';

export interface DashboardQueueCounts {
  open: number;
  inProgress: number;
  blocked: number;
  done: number;
}

export interface DashboardQueueRow {
  employeeId: string;
  name: string;
  title: string;
  level: string;
  liveStatus: 'idle' | 'thinking' | 'blocked' | 'error';
  liveActivity: string | null;
  queuePressure: number;
  counts: DashboardQueueCounts;
}

export interface DashboardQueueSummary extends DashboardQueueCounts {
  employeesWithWork: number;
  activeEmployees: number;
  totalPressure: number;
}

function emptyCounts(): DashboardQueueCounts {
  return { open: 0, inProgress: 0, blocked: 0, done: 0 };
}

function resolveLiveStatus(
  employee: Employee,
  live: EmployeeLiveState | undefined,
): DashboardQueueRow['liveStatus'] {
  if (employee.status === 'blocked' || employee.status === 'error') {
    return employee.status;
  }
  return live?.status ?? employee.status;
}

function queuePressure(counts: DashboardQueueCounts): number {
  return counts.open + counts.inProgress + counts.blocked;
}

function queueSortScore(row: DashboardQueueRow): number {
  return row.counts.blocked * 4 + row.counts.inProgress * 3 + row.counts.open * 2 + row.counts.done;
}

export function projectDashboardQueueRows(
  employees: readonly Employee[],
  tickets: readonly Ticket[],
  employeeLive: Readonly<Record<string, EmployeeLiveState>>,
): DashboardQueueRow[] {
  const countsByEmployee = new Map<string, DashboardQueueCounts>();

  for (const ticket of tickets) {
    if (!ticket.assigneeId) continue;
    const current = countsByEmployee.get(ticket.assigneeId) ?? emptyCounts();
    switch (ticket.status) {
      case 'open':
        current.open += 1;
        break;
      case 'in-progress':
        current.inProgress += 1;
        break;
      case 'blocked':
        current.blocked += 1;
        break;
      case 'done':
        current.done += 1;
        break;
    }
    countsByEmployee.set(ticket.assigneeId, current);
  }

  return [...employees]
    .map((employee) => {
      const counts = countsByEmployee.get(employee.id) ?? emptyCounts();
      const live = employeeLive[employee.id];
      return {
        employeeId: employee.id,
        name: employee.name,
        title: employee.title,
        level: employee.level,
        liveStatus: resolveLiveStatus(employee, live),
        liveActivity: live?.currentStream?.trim() ? live.currentStream.slice(-140) : null,
        queuePressure: queuePressure(counts),
        counts,
      };
    })
    .sort((a, b) => {
      const scoreDiff = queueSortScore(b) - queueSortScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      if (a.liveStatus !== b.liveStatus) {
        if (a.liveStatus === 'thinking') return -1;
        if (b.liveStatus === 'thinking') return 1;
        if (a.liveStatus === 'blocked' || a.liveStatus === 'error') return -1;
        if (b.liveStatus === 'blocked' || b.liveStatus === 'error') return 1;
      }
      return a.name.localeCompare(b.name);
    });
}

export function summarizeDashboardQueues(rows: readonly DashboardQueueRow[]): DashboardQueueSummary {
  return rows.reduce<DashboardQueueSummary>(
    (summary, row) => {
      summary.open += row.counts.open;
      summary.inProgress += row.counts.inProgress;
      summary.blocked += row.counts.blocked;
      summary.done += row.counts.done;
      summary.totalPressure += row.queuePressure;
      if (row.queuePressure > 0) summary.employeesWithWork += 1;
      if (row.liveStatus === 'thinking') summary.activeEmployees += 1;
      return summary;
    },
    {
      ...emptyCounts(),
      employeesWithWork: 0,
      activeEmployees: 0,
      totalPressure: 0,
    },
  );
}
