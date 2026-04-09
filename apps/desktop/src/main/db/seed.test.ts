import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCompaniesRepo } from './repos/companies.js';
import { createEmployeesRepo } from './repos/employees.js';
import { type SeedOptions, seedIfEmpty } from './seed.js';
import { type TestDbHandle, makeTestDb } from './test-helpers.js';

// Resolve the real role-packs directory from this test file's location.
//
// seed.test.ts → db → main → src → desktop → apps → Team-X (5 parents)
// then: role-packs/strategia-official/roles
const testDir = dirname(fileURLToPath(import.meta.url));
const rolePacksRoot = resolve(testDir, '../../../../..', 'role-packs/strategia-official/roles');

const defaultOptions: SeedOptions = {
  rolePacksRoot,
  company: {
    name: 'Strategia-X',
    slug: 'strategia-x',
    settings: {
      mission: 'Arm every builder with an AI company that runs itself.',
      values: ['Quality', 'Privacy', 'Speed', 'Ownership'],
    },
  },
  assignments: [
    {
      roleFile: 'officer/ceo.md',
      displayName: 'Iris Kovač',
      displayTitle: 'Chief Executive Officer',
    },
    {
      roleFile: 'ic/senior-fullstack-engineer.md',
      displayName: 'Mateo Reyes',
      displayTitle: 'Senior Fullstack Engineer',
    },
  ],
};

describe('seedIfEmpty', () => {
  let ctx: TestDbHandle;

  beforeEach(async () => {
    ctx = await makeTestDb();
  });

  afterEach(() => {
    ctx.close();
  });

  describe('first run on an empty database', () => {
    it('returns a non-null result with one company id and two employee ids', () => {
      const result = seedIfEmpty(ctx.db, defaultOptions);
      expect(result).not.toBeNull();
      expect(result?.companyId).toBeTypeOf('string');
      expect(result?.employeeIds).toHaveLength(2);
    });

    it('creates exactly one company with the expected name + slug', () => {
      seedIfEmpty(ctx.db, defaultOptions);
      const companies = createCompaniesRepo(ctx.db);
      const all = companies.list();
      expect(all).toHaveLength(1);
      expect(all[0]?.name).toBe('Strategia-X');
      expect(all[0]?.slug).toBe('strategia-x');
    });

    it('persists the provided company settings as JSON', () => {
      seedIfEmpty(ctx.db, defaultOptions);
      const companies = createCompaniesRepo(ctx.db);
      const [company] = companies.list();
      expect(company).toBeDefined();
      const parsed = JSON.parse(company?.settingsJson ?? '{}') as Record<string, unknown>;
      expect(parsed.mission).toBe('Arm every builder with an AI company that runs itself.');
      expect(parsed.values).toEqual(['Quality', 'Privacy', 'Speed', 'Ownership']);
    });

    it('creates two employees linked to the company', () => {
      const result = seedIfEmpty(ctx.db, defaultOptions);
      const employees = createEmployeesRepo(ctx.db);
      const list = employees.listByCompany(result?.companyId ?? '');
      expect(list).toHaveLength(2);
    });

    it('pulls employee role ids + level from the parsed role.md frontmatter', () => {
      const result = seedIfEmpty(ctx.db, defaultOptions);
      const employees = createEmployeesRepo(ctx.db);
      const list = employees.listByCompany(result?.companyId ?? '');
      const byRoleId = new Map(list.map((e) => [e.roleId, e]));

      const ceo = byRoleId.get('chief-executive-officer');
      const swe = byRoleId.get('senior-fullstack-engineer');

      expect(ceo).toBeDefined();
      expect(ceo?.level).toBe('officer');
      expect(ceo?.name).toBe('Iris Kovač');
      expect(ceo?.title).toBe('Chief Executive Officer');
      expect(ceo?.rolePackId).toBe('strategia-official');

      expect(swe).toBeDefined();
      expect(swe?.level).toBe('ic');
      expect(swe?.name).toBe('Mateo Reyes');
      expect(swe?.title).toBe('Senior Fullstack Engineer');
    });

    it('records the SHA256 of each role.md in role_md_sha', () => {
      const result = seedIfEmpty(ctx.db, defaultOptions);
      const employees = createEmployeesRepo(ctx.db);
      const list = employees.listByCompany(result?.companyId ?? '');
      for (const e of list) {
        expect(e.roleMdSha).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it('serializes tools_allowed and tools_denied from role.md frontmatter', () => {
      const result = seedIfEmpty(ctx.db, defaultOptions);
      const employees = createEmployeesRepo(ctx.db);
      const list = employees.listByCompany(result?.companyId ?? '');
      const ceo = list.find((e) => e.roleId === 'chief-executive-officer');
      expect(ceo).toBeDefined();
      const allowed = JSON.parse(ceo?.toolsAllowedJson ?? '[]') as string[];
      const denied = JSON.parse(ceo?.toolsDeniedJson ?? '[]') as string[];
      expect(allowed).toContain('browse');
      expect(allowed).toContain('email');
      expect(denied).toContain('shell');
      expect(denied).toContain('filesystem_write');
    });
  });

  describe('idempotency', () => {
    it('returns null when a company already exists and does not duplicate rows', () => {
      const first = seedIfEmpty(ctx.db, defaultOptions);
      expect(first).not.toBeNull();

      const second = seedIfEmpty(ctx.db, defaultOptions);
      expect(second).toBeNull();

      const companies = createCompaniesRepo(ctx.db);
      expect(companies.list()).toHaveLength(1);

      const employees = createEmployeesRepo(ctx.db);
      expect(employees.listByCompany(first?.companyId ?? '')).toHaveLength(2);
    });
  });

  describe('error handling', () => {
    it('throws a useful error if a role.md file cannot be found', () => {
      const bad: SeedOptions = {
        ...defaultOptions,
        assignments: [
          {
            roleFile: 'does/not/exist.md',
            displayName: 'Ghost',
            displayTitle: 'Ghost',
          },
        ],
      };
      expect(() => seedIfEmpty(ctx.db, bad)).toThrow();
    });
  });
});
