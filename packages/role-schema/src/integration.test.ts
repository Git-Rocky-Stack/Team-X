import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRoleMarkdown } from './parse.js';
import { renderRoleBody } from './render.js';

const REPO_ROOT = resolve(__dirname, '../../..');

describe('role-pack integration', () => {
  it('parses the CEO role file from strategia-official', () => {
    const path = resolve(REPO_ROOT, 'role-packs/strategia-official/roles/officer/ceo.md');
    const source = readFileSync(path, 'utf8');
    const spec = parseRoleMarkdown(source, path);
    expect(spec.frontmatter.id).toBe('chief-executive-officer');
    expect(spec.frontmatter.name).toBe('Chief Executive Officer');
    expect(spec.frontmatter.level).toBe('officer');
    expect(spec.frontmatter.decision_authority).toBe('final');
    expect(spec.frontmatter.preferred_model_tier).toBe('high');
    // CEO frontmatter declares the tool set described in the role body
    // ("Use **browse** for market research…", "You do not have shell or
    // filesystem write access"). Mirrors the desktop seed.test contract.
    expect(spec.frontmatter.tools_allowed).toEqual(
      expect.arrayContaining(['browse', 'email', 'calendar', 'context7', 'episodic-memory']),
    );
    expect(spec.frontmatter.tools_denied).toEqual(
      expect.arrayContaining(['shell', 'filesystem_write']),
    );
    expect(spec.frontmatter.capabilities).toContain('executive_leadership');
    expect(spec.frontmatter.capabilities).toContain('business_strategy');
    expect(spec.frontmatter.kpis.length).toBeGreaterThan(0);
    expect(spec.frontmatter.cadences).toBeDefined();
    expect(spec.body).toContain('# Identity');
    expect(spec.body).toContain('# Mission');
    expect(spec.body).toContain('# Operating Principles');
    expect(spec.body).toContain('# Decision Framework');
    expect(spec.body).toContain('{{company.name}}');
    expect(spec.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('parses the Senior Fullstack Engineer role file from strategia-official', () => {
    const path = resolve(
      REPO_ROOT,
      'role-packs/strategia-official/roles/ic/senior-fullstack-engineer.md',
    );
    const source = readFileSync(path, 'utf8');
    const spec = parseRoleMarkdown(source, path);
    expect(spec.frontmatter.id).toBe('senior-fullstack-engineer');
    expect(spec.frontmatter.level).toBe('ic');
    expect(spec.frontmatter.decision_authority).toBe('delegated');
    expect(spec.frontmatter.preferred_model_tier).toBe('mid');
    expect(spec.frontmatter.reports_to).toContain('engineering-manager');
    expect(spec.frontmatter.tools_allowed).toEqual([]);
    expect(spec.frontmatter.tools_denied).toEqual([]);
    expect(spec.frontmatter.capabilities).toContain('backend_engineering');
    expect(spec.frontmatter.capabilities).toContain('frontend_engineering');
    expect(spec.body).toContain('# Identity');
    expect(spec.body).toContain('TDD');
    expect(spec.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('renders the CEO body with company + employee context substituted', () => {
    const path = resolve(REPO_ROOT, 'role-packs/strategia-official/roles/officer/ceo.md');
    const source = readFileSync(path, 'utf8');
    const spec = parseRoleMarkdown(source, path);
    const { output, unresolved } = renderRoleBody(
      spec.body,
      {
        company: {
          name: 'Strategia-X',
          mission: 'Arm every builder with an AI company that runs itself.',
          values: ['Quality', 'Privacy', 'Speed'],
        },
        employee: { name: 'Iris Kovač', title: 'Chief Executive Officer' },
        team: { manager: 'Board', reports: ['Mateo Reyes', 'Sloane Park'] },
        today: '2026-04-08',
        cwd: '/repo',
      },
      { returnUnresolved: true },
    );
    expect(output).toContain('Iris Kovač');
    expect(output).toContain('Strategia-X');
    expect(output).toContain('Arm every builder with an AI company that runs itself.');
    expect(output).toContain('Mateo Reyes, Sloane Park');
    expect(output).not.toContain('{{company.name}}');
    expect(output).not.toContain('{{employee.name}}');
    expect(output).not.toContain('{{company.mission}}');
    expect(unresolved).toEqual([]);
  });
});
