/**
 * Actor display labels — the human operator and employees.
 *
 * Regression context (audit P2): the operator was hard-coded as "Rocky" in
 * the audit log, the Commands card and the meeting thread, and the meeting
 * thread labelled employees by the first 8 characters of their id. Team-X
 * has no user-editable operator display name (the local owner operator row
 * is a fixed "Local Owner" placeholder), so the operator is the neutral
 * "You", and employees are named from the employees list the renderer
 * already holds.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { OPERATOR_LABEL, actorLabel } from './actor-label.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');

const EMPLOYEES = [
  { id: 'emp-alice-0001', name: 'Alice' },
  { id: 'emp-bob-0002', name: 'Bob' },
];

describe('actorLabel', () => {
  it('labels the human operator "You"', () => {
    expect(OPERATOR_LABEL).toBe('You');
    expect(actorLabel({ id: 'rocky', kind: 'user' }, EMPLOYEES)).toBe('You');
  });

  it('names employees from the employees list', () => {
    expect(actorLabel({ id: 'emp-bob-0002', kind: 'employee' }, EMPLOYEES)).toBe('Bob');
  });

  it('keeps system / orchestrator actors as their kind', () => {
    expect(actorLabel({ id: 'system', kind: 'system' }, EMPLOYEES)).toBe('system');
    expect(actorLabel({ id: 'x', kind: 'orchestrator' }, EMPLOYEES)).toBe('orchestrator');
  });

  it('uses the caller fallback for an employee that is not in the list', () => {
    expect(actorLabel({ id: 'emp-gone', kind: 'employee' }, EMPLOYEES)).toBe('emp-gone');
    expect(actorLabel({ id: 'emp-gone', kind: 'employee' }, EMPLOYEES, 'Employee')).toBe(
      'Employee',
    );
  });
});

describe('operator / employee labels in consumers', () => {
  const consumers = {
    'audit-view.tsx': read('audit-view.tsx'),
    'commands-view.tsx': read('../dashboard/commands-view.tsx'),
    'meeting-detail.tsx': read('../meetings/meeting-detail.tsx'),
  };

  it.each(Object.entries(consumers))('%s does not hard-code an operator name', (_file, src) => {
    expect(src).not.toMatch(/['"]Rocky['"]/);
  });

  it('meeting-detail names employees from the employees list, not id prefixes', () => {
    const src = consumers['meeting-detail.tsx'];
    expect(src).not.toContain('authorId.slice(');
    expect(src).toContain('useEmployees(');
    expect(src).toContain('actorLabel(');
  });

  it('audit-view and commands-view share the operator label', () => {
    expect(consumers['audit-view.tsx']).toContain('actorLabel(');
    expect(consumers['commands-view.tsx']).toContain('commandActorLabel(');
    expect(read('../dashboard/commands-view-helpers.ts')).toContain('OPERATOR_LABEL');
  });
});
