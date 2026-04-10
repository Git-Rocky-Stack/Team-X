import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompanyRow } from '../db/repos/companies.js';
import type { EmployeeRow } from '../db/repos/employees.js';
import { createRoleLoader } from './role-loader.js';

/**
 * Tests for the role-loader service.
 *
 * Two suites:
 *
 *   1. **Real-pack integration** — points the loader at the actual
 *      `role-packs/strategia-official/roles` directory and verifies
 *      it can resolve the seeded CEO + Senior Fullstack Engineer
 *      roles, render template variables from a fake company row, and
 *      surface a clear error for an unknown role id. This is the same
 *      pack the seed script uses, so a green test here means the
 *      Phase 1 demo wiring will produce the right system prompt for
 *      both seeded employees.
 *
 *   2. **Synthetic temp-dir** — exercises the directory walker with
 *      hand-crafted role.md files in a temporary directory. Covers
 *      lazy-scan semantics (preload + size), parse-error tolerance
 *      (a malformed file does not break the scan), nested
 *      subdirectories, and the missing-root error path. Avoids any
 *      coupling to the real role-packs tree so failures in this
 *      suite point straight at the loader's own logic.
 */

const thisFile = fileURLToPath(import.meta.url);
const thisDir = dirname(thisFile);
// apps/desktop/src/main/services -> repo root is up 5 directories.
const REPO_ROOT = resolve(thisDir, '../../../../..');
const REAL_ROLES_ROOT = resolve(REPO_ROOT, 'role-packs/strategia-official/roles');

function makeCompany(overrides: Partial<CompanyRow> = {}): CompanyRow {
  return {
    id: 'co_test',
    name: 'Strategia-X',
    slug: 'strategia-x',
    createdAt: 1_700_000_000_000,
    settingsJson: JSON.stringify({
      mission: 'Arm every builder with an AI company that runs itself.',
      values: ['Quality', 'Privacy', 'Speed', 'Ownership'],
    }),
    icon: null,
    theme: 'dark',
    ...overrides,
  } as CompanyRow;
}

function makeEmployee(overrides: Partial<EmployeeRow> = {}): EmployeeRow {
  return {
    id: 'emp_test',
    companyId: 'co_test',
    rolePackId: 'strategia-official',
    roleId: 'chief-executive-officer',
    roleMdSha: 'a'.repeat(64),
    level: 'officer',
    name: 'Iris Kovač',
    title: 'Chief Executive Officer',
    status: 'idle',
    modelPref: null,
    providerPref: null,
    toolsAllowedJson: '[]',
    toolsDeniedJson: '[]',
    avatar: null,
    createdAt: 1_700_000_000_000,
    ...overrides,
  } as EmployeeRow;
}

// ===========================================================================
// Suite 1 — real strategia-official pack
// ===========================================================================

describe('createRoleLoader (real strategia-official pack)', () => {
  it('resolves the CEO role with a fully rendered prompt', async () => {
    const loader = createRoleLoader({
      rolePacksRoot: REAL_ROLES_ROOT,
      today: '2026-04-09',
    });

    const prompt = await loader.resolveSystemPrompt({
      employee: makeEmployee(),
      company: makeCompany(),
    });

    // Identity is rendered with the employee's display name.
    expect(prompt).toContain('Iris Kovač');
    // Company name landed in the body via {{company.name}}.
    expect(prompt).toContain('Strategia-X');
    // Mission was wired through company settings.
    expect(prompt).toContain('Arm every builder');
    // Today was honored from the deps override (deterministic).
    expect(prompt).toContain('2026-04-09');
    // No unresolved template variables remain (no leftover braces).
    expect(prompt).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it('resolves the Senior Fullstack Engineer role', async () => {
    const loader = createRoleLoader({
      rolePacksRoot: REAL_ROLES_ROOT,
      today: '2026-04-09',
    });

    const prompt = await loader.resolveSystemPrompt({
      employee: makeEmployee({
        roleId: 'senior-fullstack-engineer',
        name: 'Mateo Reyes',
        title: 'Senior Fullstack Engineer',
        level: 'ic',
      }),
      company: makeCompany(),
    });

    expect(prompt).toContain('Mateo Reyes');
    expect(prompt).toContain('Strategia-X');
    expect(prompt).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it('throws a clear error when the employee role id has no matching role.md', async () => {
    const loader = createRoleLoader({ rolePacksRoot: REAL_ROLES_ROOT });
    await expect(
      loader.resolveSystemPrompt({
        employee: makeEmployee({ roleId: 'nonexistent-role' }),
        company: makeCompany(),
      }),
    ).rejects.toThrow(/no role found.*nonexistent-role/);
  });

  it('size() reflects the number of indexed roles after preload', () => {
    const loader = createRoleLoader({ rolePacksRoot: REAL_ROLES_ROOT });
    expect(loader.size()).toBe(0); // lazy: nothing scanned yet
    loader.preload();
    expect(loader.size()).toBeGreaterThanOrEqual(2); // CEO + SWE at minimum
  });
});

// ===========================================================================
// Suite 2 — synthetic temp-dir fixtures
// ===========================================================================

describe('createRoleLoader (synthetic fixtures)', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'role-loader-test-'));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  function writeRole(relPath: string, frontmatter: Record<string, unknown>, body: string): string {
    const full = join(tmpRoot, relPath);
    const dir = dirname(full);
    mkdirSync(dir, { recursive: true });
    const yaml = `${Object.entries(frontmatter)
      .map(([k, v]) => {
        if (Array.isArray(v)) return `${k}: [${v.map((x) => JSON.stringify(x)).join(', ')}]`;
        if (typeof v === 'string') return `${k}: ${v}`;
        if (typeof v === 'number') return `${k}: ${v}`;
        return `${k}: ${String(v)}`;
      })
      .join('\n')}\n`;
    writeFileSync(full, `---\n${yaml}---\n${body}`, 'utf8');
    return full;
  }

  /** Build a minimal valid frontmatter map. Tests override the id + name fields. */
  function minimalFrontmatter(id: string, level = 'ic'): Record<string, unknown> {
    return {
      id,
      name: id,
      level,
      reports_to: [],
      manages: [],
      preferred_model_tier: 'mid',
      preferred_providers: [],
      fallback_providers: [],
      tools_allowed: [],
      tools_denied: [],
      decision_authority: 'delegated',
      escalates_to: [],
      kpis: [],
      temperature: 0.2,
      license: 'MIT',
      author: 'test',
      version: '1.0.0',
    };
  }

  it('lazy-scans on first resolve, not on construction', async () => {
    const loader = createRoleLoader({ rolePacksRoot: tmpRoot });
    expect(loader.size()).toBe(0);
    writeRole('officer/test-role.md', minimalFrontmatter('test-role', 'officer'), '# Test\nbody');
    // Before resolve, the index is still empty.
    expect(loader.size()).toBe(0);
    await loader.resolveSystemPrompt({
      employee: makeEmployee({ roleId: 'test-role' }),
      company: makeCompany(),
    });
    expect(loader.size()).toBe(1);
  });

  it('preload() forces the scan up front', () => {
    writeRole('a/role-a.md', minimalFrontmatter('role-a'), '# A');
    writeRole('b/role-b.md', minimalFrontmatter('role-b'), '# B');
    const loader = createRoleLoader({ rolePacksRoot: tmpRoot });
    loader.preload();
    expect(loader.size()).toBe(2);
  });

  it('scans nested subdirectories recursively', () => {
    writeRole('level1/level2/level3/deep.md', minimalFrontmatter('deep'), '# deep');
    const loader = createRoleLoader({ rolePacksRoot: tmpRoot });
    loader.preload();
    expect(loader.size()).toBe(1);
  });

  it('skips files that fail to parse and reports them via onParseError', () => {
    writeRole('valid.md', minimalFrontmatter('valid-role'), '# valid');
    // Write a malformed role.md — missing frontmatter entirely.
    writeFileSync(join(tmpRoot, 'broken.md'), 'just some markdown, no frontmatter\n', 'utf8');

    const errors: Array<{ filePath: string; error: Error }> = [];
    const loader = createRoleLoader({
      rolePacksRoot: tmpRoot,
      onParseError: (filePath, error) => errors.push({ filePath, error }),
    });
    loader.preload();

    expect(loader.size()).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.filePath).toContain('broken.md');
  });

  it('ignores non-.md files at every depth', () => {
    writeRole('valid.md', minimalFrontmatter('valid'), '# v');
    writeFileSync(join(tmpRoot, 'README.txt'), 'not a role', 'utf8');
    writeFileSync(join(tmpRoot, 'notes.json'), '{}', 'utf8');
    const loader = createRoleLoader({ rolePacksRoot: tmpRoot });
    loader.preload();
    expect(loader.size()).toBe(1);
  });

  it('throws a clear error when the rolePacksRoot does not exist', () => {
    const loader = createRoleLoader({
      rolePacksRoot: join(tmpRoot, 'does-not-exist'),
    });
    expect(() => loader.preload()).toThrow(/cannot read role-packs root/);
  });

  it('renders {{today}} from the deps override', async () => {
    writeRole('role.md', minimalFrontmatter('today-role'), 'Today is {{today}}.');
    const loader = createRoleLoader({ rolePacksRoot: tmpRoot, today: '2099-12-31' });
    const prompt = await loader.resolveSystemPrompt({
      employee: makeEmployee({ roleId: 'today-role' }),
      company: makeCompany(),
    });
    expect(prompt).toBe('Today is 2099-12-31.');
  });

  it('renders {{company.name}} and {{company.mission}} from the row settings JSON', async () => {
    writeRole(
      'role.md',
      minimalFrontmatter('mission-role'),
      'Welcome to {{company.name}}. Mission: {{company.mission}}.',
    );
    const loader = createRoleLoader({ rolePacksRoot: tmpRoot });
    const prompt = await loader.resolveSystemPrompt({
      employee: makeEmployee({ roleId: 'mission-role' }),
      company: makeCompany({
        name: 'Acme Inc',
        settingsJson: JSON.stringify({ mission: 'Build the best wrenches' }),
      }),
    });
    expect(prompt).toBe('Welcome to Acme Inc. Mission: Build the best wrenches.');
  });

  it('falls back to empty company.mission when settingsJson is malformed', async () => {
    writeRole('role.md', minimalFrontmatter('safe-role'), 'Mission: [{{company.mission}}]');
    const loader = createRoleLoader({ rolePacksRoot: tmpRoot });
    const prompt = await loader.resolveSystemPrompt({
      employee: makeEmployee({ roleId: 'safe-role' }),
      company: makeCompany({ settingsJson: 'NOT JSON' }),
    });
    expect(prompt).toBe('Mission: []');
  });

  it('uses console.warn for parse errors when no onParseError is provided', () => {
    writeFileSync(join(tmpRoot, 'broken.md'), 'no frontmatter\n', 'utf8');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = createRoleLoader({ rolePacksRoot: tmpRoot });
    loader.preload();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
