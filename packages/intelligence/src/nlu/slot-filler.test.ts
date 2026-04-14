import { describe, expect, it } from 'vitest';

import type { ResolvedEntity } from './entity-resolver.js';
import type { IntentName, IntentResult } from './intent-classifier.js';
import {
  REQUIRED_SLOTS,
  type ResolvedEntities,
  SLOT_KEY_ALIASES,
  createSlotFiller,
  defaultStringify,
  extractEntityId,
} from './slot-filler.js';

/**
 * Unit tests for the M30 T3 slot filler.
 *
 * Every test assembles an `IntentResult` (as if from T1) and a
 * `ResolvedEntities` map (as if from T2) by hand. The slot filler is a
 * pure function — no mocks, no async, no timers.
 */

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeIntent<T extends IntentName>(
  intent: T,
  overrides: Partial<Omit<IntentResult, 'intent'>> = {},
): IntentResult {
  return {
    intent,
    entities: overrides.entities ?? {},
    confidence: overrides.confidence ?? 0.95,
    missingSlots: overrides.missingSlots ?? [],
    rawText: overrides.rawText ?? '',
  };
}

function unique<T>(value: T): ResolvedEntity<T> {
  return { kind: 'unique', value };
}

function ambiguous<T>(...candidates: T[]): ResolvedEntity<T> {
  return { kind: 'ambiguous', candidates };
}

function notFound<T>(): ResolvedEntity<T> {
  return { kind: 'not_found' };
}

interface EmployeeFixture {
  id: string;
  name: string;
  title?: string;
}

function emp(id: string, name: string, title?: string): EmployeeFixture {
  return title !== undefined ? { id, name, title } : { id, name };
}

interface TicketFixture {
  id: string;
  title: string;
}

function ticket(id: string, title: string): TicketFixture {
  return { id, title };
}

interface RoleFixture {
  sha256: string;
  frontmatter: { id: string; name: string };
}

function role(id: string, name: string): RoleFixture {
  return { sha256: `sha-${id}`, frontmatter: { id, name } };
}

// ---------------------------------------------------------------------------
// Tests — the 12 canonical cases from the task spec, plus bonus coverage.
// ---------------------------------------------------------------------------

describe('createSlotFiller', () => {
  const filler = createSlotFiller();

  it('1. check_status (no required slots) → ready immediately', () => {
    const intent = makeIntent('check_status', { entities: { target: 'Sarah' } });
    const resolved: ResolvedEntities = {};
    const result = filler.fill(intent, resolved);
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.intent).toBe('check_status');
    }
  });

  it('2. hire_employee with ambiguous role → needs_clarification with options', () => {
    const intent = makeIntent('hire_employee', {
      entities: { roleQuery: 'engineer' },
    });
    const resolved: ResolvedEntities = {
      roleQuery: ambiguous(
        role('role_swe_senior', 'Senior Software Engineer'),
        role('role_swe_staff', 'Staff Software Engineer'),
      ),
    };
    const result = filler.fill(intent, resolved);
    expect(result.kind).toBe('needs_clarification');
    if (result.kind === 'needs_clarification') {
      expect(result.missing).toBe('roleId');
      expect(result.options).toEqual(['Senior Software Engineer', 'Staff Software Engineer']);
      expect(result.prompt).toMatch(/engineer/);
    }
  });

  it('3. hire_employee with unique role → ready with entities.roleId set', () => {
    const intent = makeIntent('hire_employee', {
      entities: { roleQuery: 'senior frontend engineer' },
    });
    const resolved: ResolvedEntities = {
      roleQuery: unique(role('role_frontend_senior', 'Senior Frontend Engineer')),
    };
    const result = filler.fill(intent, resolved);
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.entities.roleId).toBe('role_frontend_senior');
    }
  });

  it('4. fire_employee with unique employee → needs_confirmation with name in summary', () => {
    const intent = makeIntent('fire_employee', {
      entities: { employeeQuery: 'Sarah' },
    });
    const resolved: ResolvedEntities = {
      employeeQuery: unique(emp('emp_abc123', 'Sarah Chen', 'Senior Frontend Engineer')),
    };
    const result = filler.fill(intent, resolved);
    expect(result.kind).toBe('needs_confirmation');
    if (result.kind === 'needs_confirmation') {
      expect(result.intent).toBe('fire_employee');
      expect(result.entities.employeeId).toBe('emp_abc123');
      expect(result.summary).toBe('Fire Sarah Chen (Senior Frontend Engineer)?');
    }
  });

  it('5. fire_employee with ambiguous employee → needs_clarification (not confirmation)', () => {
    const intent = makeIntent('fire_employee', {
      entities: { employeeQuery: 'Sarah' },
    });
    const resolved: ResolvedEntities = {
      employeeQuery: ambiguous(emp('emp_1', 'Sarah Chen'), emp('emp_2', 'Sarah Okonkwo')),
    };
    const result = filler.fill(intent, resolved);
    expect(result.kind).toBe('needs_clarification');
    if (result.kind === 'needs_clarification') {
      expect(result.missing).toBe('employeeId');
      expect(result.options).toEqual(['Sarah Chen', 'Sarah Okonkwo']);
    }
  });

  it('6. close_ticket with unique ticket → needs_confirmation', () => {
    const intent = makeIntent('close_ticket', {
      entities: { ticketQuery: '#42' },
    });
    const resolved: ResolvedEntities = {
      ticketQuery: unique(ticket('42', 'Fix login page blank')),
    };
    const result = filler.fill(intent, resolved);
    expect(result.kind).toBe('needs_confirmation');
    if (result.kind === 'needs_confirmation') {
      expect(result.entities.ticketId).toBe('42');
      expect(result.summary).toBe("Close ticket #42 'Fix login page blank'?");
    }
  });

  it('7. assign_ticket with unique ticket + unique employee → ready (non-destructive)', () => {
    const intent = makeIntent('assign_ticket', {
      entities: { ticketQuery: '#17', employeeQuery: 'Sarah' },
    });
    const resolved: ResolvedEntities = {
      ticketQuery: unique(ticket('17', 'Auth bug')),
      employeeQuery: unique(emp('emp_sarah', 'Sarah Chen')),
    };
    const result = filler.fill(intent, resolved);
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.entities.ticketId).toBe('17');
      expect(result.entities.employeeId).toBe('emp_sarah');
    }
  });

  it('8. assign_ticket with unique ticket + ambiguous employee → needs_clarification about employee only', () => {
    const intent = makeIntent('assign_ticket', {
      entities: { ticketQuery: '#17', employeeQuery: 'Sarah' },
    });
    const resolved: ResolvedEntities = {
      ticketQuery: unique(ticket('17', 'Auth bug')),
      employeeQuery: ambiguous(emp('emp_1', 'Sarah Chen'), emp('emp_2', 'Sarah Okonkwo')),
    };
    const result = filler.fill(intent, resolved);
    expect(result.kind).toBe('needs_clarification');
    if (result.kind === 'needs_clarification') {
      // Ticket is resolved; the clarification is specifically about the employee.
      expect(result.missing).toBe('employeeId');
      expect(result.options).toEqual(['Sarah Chen', 'Sarah Okonkwo']);
    }
  });

  it('9. promote_employee missing newLevel → needs_clarification with missing=newLevel', () => {
    const intent = makeIntent('promote_employee', {
      entities: { employeeQuery: 'Sarah' },
    });
    const resolved: ResolvedEntities = {
      employeeQuery: unique(emp('emp_sarah', 'Sarah Chen')),
      // newRoleQuery deliberately absent — the classifier never heard a
      // target level from the user.
    };
    const result = filler.fill(intent, resolved);
    expect(result.kind).toBe('needs_clarification');
    if (result.kind === 'needs_clarification') {
      expect(result.missing).toBe('newLevel');
      expect(result.prompt).toMatch(/level/i);
    }
  });

  it('10. end_meeting with unique meeting → needs_confirmation', () => {
    const intent = makeIntent('end_meeting', {
      entities: { meetingQuery: 'All Hands Q2' },
    });
    const meeting = { id: 'mtg_42', title: 'All Hands Q2' };
    const resolved: ResolvedEntities = {
      meetingQuery: unique(meeting),
    };
    const result = filler.fill(intent, resolved);
    expect(result.kind).toBe('needs_confirmation');
    if (result.kind === 'needs_confirmation') {
      expect(result.intent).toBe('end_meeting');
      expect(result.entities.meetingId).toBe('mtg_42');
      expect(result.summary).toBe("End meeting 'All Hands Q2'?");
    }
  });

  it('11. create_ticket with title present → ready (no resolver needed for free text)', () => {
    const intent = makeIntent('create_ticket', {
      entities: { title: 'login page blank', priority: 'p0' },
    });
    const resolved: ResolvedEntities = {};
    const result = filler.fill(intent, resolved);
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.entities.title).toBe('login page blank');
    }
  });

  it('12. complex_request → ready regardless of entities', () => {
    const intent = makeIntent('complex_request', {
      entities: { anyKey: 'any value' },
      confidence: 0.42, // even low confidence is fine for complex
    });
    const resolved: ResolvedEntities = {};
    const result = filler.fill(intent, resolved);
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.intent).toBe('complex_request');
      expect(result.entities.anyKey).toBe('any value');
    }
  });
});

// ---------------------------------------------------------------------------
// Bonus coverage
// ---------------------------------------------------------------------------

describe('createSlotFiller — bonus coverage', () => {
  const filler = createSlotFiller();

  it('show_view with unique view value → ready', () => {
    const intent = makeIntent('show_view', { entities: { view: 'tickets' } });
    const result = filler.fill(intent, {});
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.entities.view).toBe('tickets');
    }
  });

  it('search_vault with query → ready', () => {
    const intent = makeIntent('search_vault', { entities: { query: 'API spec' } });
    const result = filler.fill(intent, {});
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.entities.query).toBe('API spec');
    }
  });

  it('resolver returning not_found produces a tailored prompt that quotes the offending text', () => {
    const intent = makeIntent('fire_employee', {
      entities: { employeeQuery: 'Sarha' }, // typo
    });
    const resolved: ResolvedEntities = {
      employeeQuery: notFound(),
    };
    const result = filler.fill(intent, resolved);
    expect(result.kind).toBe('needs_clarification');
    if (result.kind === 'needs_clarification') {
      expect(result.missing).toBe('employeeId');
      expect(result.prompt).toMatch(/Sarha/);
      expect(result.prompt).toMatch(/couldn't find/i);
      expect(result.options).toBeUndefined();
    }
  });

  it('missing required slot with no classifier mention at all → generic missing prompt', () => {
    const intent = makeIntent('hire_employee', { entities: {} });
    const resolved: ResolvedEntities = {};
    const result = filler.fill(intent, resolved);
    expect(result.kind).toBe('needs_clarification');
    if (result.kind === 'needs_clarification') {
      expect(result.missing).toBe('roleId');
      expect(result.prompt).toBe('Which role should I hire?');
      expect(result.options).toBeUndefined();
    }
  });

  it('create_ticket with empty-string title is treated as missing', () => {
    const intent = makeIntent('create_ticket', { entities: { title: '   ' } });
    const result = filler.fill(intent, {});
    expect(result.kind).toBe('needs_clarification');
    if (result.kind === 'needs_clarification') {
      expect(result.missing).toBe('title');
    }
  });

  it('promote_employee fully resolved → needs_confirmation with level in summary', () => {
    const intent = makeIntent('promote_employee', {
      entities: { employeeQuery: 'Sarah', newRoleQuery: 'staff' },
    });
    const resolved: ResolvedEntities = {
      employeeQuery: unique(emp('emp_sarah', 'Sarah Chen', 'Senior Engineer')),
      newRoleQuery: unique(role('role_staff', 'Staff Engineer')),
    };
    const result = filler.fill(intent, resolved);
    expect(result.kind).toBe('needs_confirmation');
    if (result.kind === 'needs_confirmation') {
      expect(result.entities.employeeId).toBe('emp_sarah');
      expect(result.entities.newLevel).toBe('role_staff');
      expect(result.summary).toBe('Promote Sarah Chen to level role_staff?');
    }
  });

  it('call_meeting with agenda text → ready (non-destructive create-style intent)', () => {
    const intent = makeIntent('call_meeting', {
      entities: { agenda: 'rebrand kickoff', attendeesQuery: 'design team' },
    });
    const result = filler.fill(intent, {});
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.entities.agenda).toBe('rebrand kickoff');
    }
  });

  it('end_meeting without meeting resolution → needs_clarification', () => {
    const intent = makeIntent('end_meeting', { entities: {} });
    const result = filler.fill(intent, {});
    expect(result.kind).toBe('needs_clarification');
    if (result.kind === 'needs_clarification') {
      expect(result.missing).toBe('meetingId');
    }
  });

  it('close_ticket ambiguous surfaces ticket titles as options', () => {
    const intent = makeIntent('close_ticket', { entities: { ticketQuery: 'login' } });
    const resolved: ResolvedEntities = {
      ticketQuery: ambiguous(ticket('7', 'Login page blank'), ticket('11', 'Login CSRF token bug')),
    };
    const result = filler.fill(intent, resolved);
    expect(result.kind).toBe('needs_clarification');
    if (result.kind === 'needs_clarification') {
      expect(result.options).toEqual(['Login page blank', 'Login CSRF token bug']);
    }
  });

  it('caps ambiguous options at 5', () => {
    const intent = makeIntent('fire_employee', { entities: { employeeQuery: 'Alex' } });
    const candidates = Array.from({ length: 8 }, (_, i) => emp(`emp_${i}`, `Alex ${i}`));
    const resolved: ResolvedEntities = {
      employeeQuery: ambiguous(...candidates),
    };
    const result = filler.fill(intent, resolved);
    expect(result.kind).toBe('needs_clarification');
    if (result.kind === 'needs_clarification') {
      expect(result.options).toHaveLength(5);
      expect(result.options).toEqual(['Alex 0', 'Alex 1', 'Alex 2', 'Alex 3', 'Alex 4']);
    }
  });

  it('custom stringifyCandidate override is used for options labeling', () => {
    const customFiller = createSlotFiller({
      stringifyCandidate: (v) => `[${(v as EmployeeFixture).id}] ${(v as EmployeeFixture).name}`,
    });
    const intent = makeIntent('fire_employee', { entities: { employeeQuery: 'Sarah' } });
    const resolved: ResolvedEntities = {
      employeeQuery: ambiguous(emp('e1', 'Sarah Chen'), emp('e2', 'Sarah Okonkwo')),
    };
    const result = customFiller.fill(intent, resolved);
    expect(result.kind).toBe('needs_clarification');
    if (result.kind === 'needs_clarification') {
      expect(result.options).toEqual(['[e1] Sarah Chen', '[e2] Sarah Okonkwo']);
    }
  });
});

// ---------------------------------------------------------------------------
// Canonical table surface
// ---------------------------------------------------------------------------

describe('REQUIRED_SLOTS + SLOT_KEY_ALIASES', () => {
  it('covers every IntentName', () => {
    const intents: IntentName[] = [
      'hire_employee',
      'fire_employee',
      'assign_ticket',
      'create_ticket',
      'close_ticket',
      'promote_employee',
      'create_project',
      'create_goal',
      'call_meeting',
      'end_meeting',
      'check_status',
      'show_view',
      'search_vault',
      'complex_request',
      'reopen_ticket',
    ];
    for (const i of intents) {
      expect(REQUIRED_SLOTS).toHaveProperty(i);
    }
  });

  it('every required structured slot has an alias', () => {
    // Every canonical key that appears in any required-slots array must
    // exist in SLOT_KEY_ALIASES so the lookup never silently falls back
    // to using the canonical name as the classifier key.
    const allKeys = new Set<string>();
    for (const slots of Object.values(REQUIRED_SLOTS)) {
      for (const k of slots) allKeys.add(k);
    }
    for (const k of allKeys) {
      expect(SLOT_KEY_ALIASES).toHaveProperty(k);
    }
  });
});

// ---------------------------------------------------------------------------
// Helper function direct tests
// ---------------------------------------------------------------------------

describe('defaultStringify', () => {
  it('prefers frontmatter.name for RoleSpec-shaped values', () => {
    expect(defaultStringify({ frontmatter: { id: 'r1', name: 'Chief of Staff' } })).toBe(
      'Chief of Staff',
    );
  });

  it('prefers name over title over id', () => {
    expect(defaultStringify({ id: 'x', title: 't', name: 'N' })).toBe('N');
    expect(defaultStringify({ id: 'x', title: 't' })).toBe('t');
    expect(defaultStringify({ id: 'x' })).toBe('x');
  });

  it('uses originalName for VaultFile-shaped values', () => {
    expect(defaultStringify({ id: 'v1', originalName: 'spec.pdf' })).toBe('spec.pdf');
  });

  it('falls through to String() for odd shapes', () => {
    expect(defaultStringify(42)).toBe('42');
    expect(defaultStringify(null)).toBe('');
    expect(defaultStringify(undefined)).toBe('');
  });
});

describe('extractEntityId', () => {
  it('pulls RoleSpec id from frontmatter', () => {
    expect(
      extractEntityId('roleId', { sha256: 's', frontmatter: { id: 'role_cto', name: 'CTO' } }),
    ).toBe('role_cto');
  });

  it('pulls Employee / Ticket id from top-level id', () => {
    expect(extractEntityId('employeeId', { id: 'emp_1', name: 'Sarah' })).toBe('emp_1');
    expect(extractEntityId('ticketId', { id: 't1', title: 'bug' })).toBe('t1');
  });

  it('returns empty string for null/undefined', () => {
    expect(extractEntityId('employeeId', null)).toBe('');
    expect(extractEntityId('employeeId', undefined)).toBe('');
  });

  it('passes strings through unchanged', () => {
    expect(extractEntityId('title', 'Hello')).toBe('Hello');
  });
});
