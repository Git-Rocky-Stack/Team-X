import type { Employee, Ticket } from '@team-x/shared-types';
import { describe, expect, it } from 'vitest';

import type { EmployeeLiveState } from '../../store/app-store.js';

import {
  projectDashboardQueueRows,
  summarizeDashboardQueues,
} from './dashboard-queue-projections.js';

const employees: Employee[] = [
  {
    id: 'emp-a',
    companyId: 'co-1',
    roleId: 'role-a',
    roleMdSha: 'sha-a',
    level: 'lead',
    name: 'Alex Archer',
    title: 'Engineering Lead',
    status: 'idle',
    createdAt: 1,
  },
  {
    id: 'emp-b',
    companyId: 'co-1',
    roleId: 'role-b',
    roleMdSha: 'sha-b',
    level: 'ic',
    name: 'Blair Bloom',
    title: 'Product Engineer',
    status: 'blocked',
    createdAt: 2,
  },
];

const tickets: Ticket[] = [
  {
    id: 't-1',
    companyId: 'co-1',
    title: 'Open work',
    description: '',
    status: 'open',
    priority: 'medium',
    assigneeId: 'emp-a',
    reporterId: 'user',
    reporterKind: 'user',
    labelsJson: '[]',
    dependenciesJson: '[]',
    slaHours: null,
    dueAt: null,
    threadId: null,
    createdAt: 1,
    updatedAt: 1,
    closedAt: null,
  },
  {
    id: 't-2',
    companyId: 'co-1',
    title: 'In progress work',
    description: '',
    status: 'in-progress',
    priority: 'high',
    assigneeId: 'emp-a',
    reporterId: 'user',
    reporterKind: 'user',
    labelsJson: '[]',
    dependenciesJson: '[]',
    slaHours: null,
    dueAt: null,
    threadId: null,
    createdAt: 2,
    updatedAt: 2,
    closedAt: null,
  },
  {
    id: 't-3',
    companyId: 'co-1',
    title: 'Blocked work',
    description: '',
    status: 'blocked',
    priority: 'critical',
    assigneeId: 'emp-b',
    reporterId: 'user',
    reporterKind: 'user',
    labelsJson: '[]',
    dependenciesJson: '[]',
    slaHours: null,
    dueAt: null,
    threadId: null,
    createdAt: 3,
    updatedAt: 3,
    closedAt: null,
  },
];

const employeeLive: Record<string, EmployeeLiveState> = {
  'emp-a': {
    status: 'thinking',
    currentStream: 'Compiling a handoff response.',
    lastThreadId: 'thr-a',
    lastMessageId: 'msg-a',
  },
};

describe('dashboard-queue-projections', () => {
  it('projects queue counts plus live state for each employee', () => {
    const rows = projectDashboardQueueRows(employees, tickets, employeeLive);

    expect(rows[0]?.employeeId).toBe('emp-a');
    expect(rows[0]?.liveStatus).toBe('thinking');
    expect(rows[0]?.counts.inProgress).toBe(1);
    expect(rows[1]?.employeeId).toBe('emp-b');
    expect(rows[1]?.counts.blocked).toBe(1);
  });

  it('summarizes dashboard queue totals across every employee row', () => {
    const summary = summarizeDashboardQueues(
      projectDashboardQueueRows(employees, tickets, employeeLive),
    );

    expect(summary).toEqual({
      open: 1,
      inProgress: 1,
      blocked: 1,
      done: 0,
      employeesWithWork: 2,
      activeEmployees: 1,
      totalPressure: 3,
    });
  });
});
