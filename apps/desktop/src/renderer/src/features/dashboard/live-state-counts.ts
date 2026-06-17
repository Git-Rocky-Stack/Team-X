/**
 * Roster-scoped live-state counts for the Mission Control dashboard.
 *
 * The store's `employeeLive` map is global, keyed only by employee id, and is
 * NOT cleared when the operator switches workspaces (`setCompanyId`). Counting
 * directly off `Object.values(employeeLive)` therefore lets a live run in
 * workspace A pollute workspace B's Stream/Floor telemetry — inflating the
 * "thinking" count, driving the idle count negative, and pushing the
 * concurrency VU meter past its 0–1 domain.
 *
 * These helpers derive every count from the *active roster* (the `employees`
 * prop) so cross-workspace live state can never leak into the displayed
 * figures.
 */

import type { Employee } from '@team-x/shared-types';

import type { EmployeeLiveState } from '@/store/app-store.js';

/** Number of the given employees whose live state is currently `thinking`. */
export function countThinking(
  employees: Employee[],
  employeeLive: Record<string, EmployeeLiveState>,
): number {
  return employees.filter((employee) => employeeLive[employee.id]?.status === 'thinking').length;
}

/**
 * Number of idle employees in the roster — the complement of
 * {@link countThinking}. Because both sides are scoped to `employees`, the
 * result is always in `[0, employees.length]` and can never go negative.
 */
export function countIdle(
  employees: Employee[],
  employeeLive: Record<string, EmployeeLiveState>,
): number {
  return employees.length - countThinking(employees, employeeLive);
}
