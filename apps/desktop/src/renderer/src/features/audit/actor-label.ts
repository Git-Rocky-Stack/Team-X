/**
 * Display labels for event and message actors, shared by the audit log,
 * the Commands card and the meeting thread.
 *
 * The human operator is "You": Team-X runs single-operator on the desktop
 * and has no user-editable display name (the bootstrapped local owner
 * operator row carries a fixed "Local Owner" placeholder), so a neutral
 * second-person label reads correctly for whoever is at the console.
 * Employees are named from the employees list the caller already holds.
 */

import type { Employee } from '@team-x/shared-types';

/** Label for the human operator (actor kind `user`). */
export const OPERATOR_LABEL = 'You';

/**
 * Resolve a display label for an actor. `fallback` is used for an employee
 * that is not in `employees` (fired, or the list is still loading); it
 * defaults to the raw actor id so audit rows stay traceable.
 */
export function actorLabel(
  actor: { id: string; kind: string },
  employees: ReadonlyArray<Pick<Employee, 'id' | 'name'>>,
  fallback: string = actor.id,
): string {
  if (actor.kind === 'user') return OPERATOR_LABEL;
  if (actor.kind === 'system' || actor.kind === 'orchestrator') return actor.kind;
  return employees.find((e) => e.id === actor.id)?.name ?? fallback;
}
