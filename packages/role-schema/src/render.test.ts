import { describe, expect, it } from 'vitest';
import { renderRoleBody } from './render.js';

describe('renderRoleBody', () => {
  it('substitutes simple variables', () => {
    const out = renderRoleBody('Hello {{company.name}}', {
      company: { name: 'Strategia-X', mission: '', values: [] },
      employee: { name: 'Iris', title: 'CEO' },
      team: { manager: '', reports: [] },
      today: '2026-04-07',
      cwd: '/x',
    });
    expect(out).toBe('Hello Strategia-X');
  });

  it('substitutes multiple variables', () => {
    const out = renderRoleBody('{{employee.name}} is {{employee.title}} of {{company.name}}', {
      company: { name: 'Strategia-X', mission: '', values: [] },
      employee: { name: 'Iris', title: 'CEO' },
      team: { manager: '', reports: [] },
      today: '2026-04-07',
      cwd: '/x',
    });
    expect(out).toBe('Iris is CEO of Strategia-X');
  });

  it('leaves unknown variables untouched but flags them', () => {
    const { output, unresolved } = renderRoleBody(
      'Hello {{company.name}} and {{mystery.thing}}',
      {
        company: { name: 'Strategia-X', mission: '', values: [] },
        employee: { name: '', title: '' },
        team: { manager: '', reports: [] },
        today: '',
        cwd: '',
      },
      { returnUnresolved: true },
    );
    expect(output).toBe('Hello Strategia-X and {{mystery.thing}}');
    expect(unresolved).toEqual(['mystery.thing']);
  });

  it('joins arrays with comma-space when substituted', () => {
    const out = renderRoleBody('Reports: {{team.reports}}', {
      company: { name: '', mission: '', values: [] },
      employee: { name: '', title: '' },
      team: { manager: '', reports: ['Mateo', 'Iris', 'Sloane'] },
      today: '',
      cwd: '',
    });
    expect(out).toBe('Reports: Mateo, Iris, Sloane');
  });
});
