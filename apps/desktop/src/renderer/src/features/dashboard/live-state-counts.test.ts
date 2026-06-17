import type { Employee } from '@team-x/shared-types';
import { describe, expect, it } from 'vitest';

import { countIdle, countThinking } from './live-state-counts.js';

import type { EmployeeLiveState } from '@/store/app-store.js';

// The helper only reads `employee.id`, so a minimal cast keeps the fixtures
// readable without standing up the full Employee shape.
const emp = (id: string): Employee => ({ id }) as unknown as Employee;

const thinking: EmployeeLiveState = {
  status: 'thinking',
  currentStream: '',
  lastThreadId: null,
  lastMessageId: null,
};
const idle: EmployeeLiveState = { ...thinking, status: 'idle' };

describe('live-state counts (scoped to the active roster)', () => {
  it('counts only roster employees that are thinking', () => {
    const employees = [emp('a'), emp('b'), emp('c')];
    const live: Record<string, EmployeeLiveState> = { a: thinking, b: idle };

    expect(countThinking(employees, live)).toBe(1);
    expect(countIdle(employees, live)).toBe(2);
  });

  it('ignores live state for employees outside the roster (cross-workspace leak)', () => {
    // `stale-1`/`stale-2` belong to another workspace but linger in the global
    // employeeLive map (it is not cleared on workspace switch). They must never
    // inflate the active dashboard's counts.
    const employees = [emp('a'), emp('b')];
    const live: Record<string, EmployeeLiveState> = {
      a: idle,
      b: idle,
      'stale-1': thinking,
      'stale-2': thinking,
    };

    expect(countThinking(employees, live)).toBe(0);
    expect(countIdle(employees, live)).toBe(2);
  });

  it('never returns a negative idle count when stale thinking entries exceed the roster', () => {
    const employees = [emp('a')];
    const live: Record<string, EmployeeLiveState> = {
      'stale-1': thinking,
      'stale-2': thinking,
      'stale-3': thinking,
    };

    expect(countThinking(employees, live)).toBe(0);
    expect(countIdle(employees, live)).toBe(1);
    expect(countIdle(employees, live)).toBeGreaterThanOrEqual(0);
  });

  it('keeps the VU ratio (thinking / total) within the 0–1 domain', () => {
    const employees = [emp('a'), emp('b')];
    const live: Record<string, EmployeeLiveState> = {
      a: thinking,
      b: thinking,
      'stale-1': thinking,
    };

    const ratio = countThinking(employees, live) / employees.length;
    expect(ratio).toBeLessThanOrEqual(1);
    expect(ratio).toBeGreaterThanOrEqual(0);
  });
});
