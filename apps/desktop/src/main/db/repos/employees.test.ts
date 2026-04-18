import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';
import { createCompaniesRepo } from './companies.js';
import { createEmployeesRepo } from './employees.js';

describe('employees repo', () => {
  let ctx: TestDbHandle;
  let employees: ReturnType<typeof createEmployeesRepo>;
  let companyId: string;
  let otherCompanyId: string;

  beforeEach(async () => {
    ctx = await makeTestDb();
    const companies = createCompaniesRepo(ctx.db);
    employees = createEmployeesRepo(ctx.db);
    companyId = companies.create({ name: 'Strategia-X', slug: 'strategia-x' });
    otherCompanyId = companies.create({ name: 'Other Corp', slug: 'other-corp' });
  });

  afterEach(() => {
    ctx.close();
  });

  describe('create', () => {
    it('returns a non-empty id', () => {
      const id = employees.create({
        companyId,
        rolePackId: 'strategia-official',
        roleId: 'ceo',
        roleMdSha: 'sha-abc123',
        level: 'Officer',
        name: 'Athena',
        title: 'Chief Executive Officer',
      });
      expect(id).toBeTypeOf('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('persists all required fields', () => {
      const id = employees.create({
        companyId,
        rolePackId: 'strategia-official',
        roleId: 'senior-fullstack-engineer',
        roleMdSha: 'sha-def456',
        level: 'IC',
        name: 'Kai',
        title: 'Senior Fullstack Engineer',
      });
      const got = employees.getById(id);
      expect(got).not.toBeNull();
      expect(got?.companyId).toBe(companyId);
      expect(got?.rolePackId).toBe('strategia-official');
      expect(got?.roleId).toBe('senior-fullstack-engineer');
      expect(got?.roleMdSha).toBe('sha-def456');
      expect(got?.level).toBe('IC');
      expect(got?.name).toBe('Kai');
      expect(got?.title).toBe('Senior Fullstack Engineer');
    });

    it('defaults status to "idle"', () => {
      const id = employees.create({
        companyId,
        rolePackId: 'p',
        roleId: 'r',
        roleMdSha: 's',
        level: 'IC',
        name: 'n',
        title: 't',
      });
      expect(employees.getById(id)?.status).toBe('idle');
    });

    it('defaults tools_allowed_json and tools_denied_json to empty arrays', () => {
      const id = employees.create({
        companyId,
        rolePackId: 'p',
        roleId: 'r',
        roleMdSha: 's',
        level: 'IC',
        name: 'n',
        title: 't',
      });
      const got = employees.getById(id);
      expect(JSON.parse(got?.toolsAllowedJson ?? '[]')).toEqual([]);
      expect(JSON.parse(got?.toolsDeniedJson ?? '[]')).toEqual([]);
    });

    it('accepts optional model and provider overrides', () => {
      const id = employees.create({
        companyId,
        rolePackId: 'p',
        roleId: 'r',
        roleMdSha: 's',
        level: 'IC',
        name: 'n',
        title: 't',
        modelPref: 'claude-opus-4-6',
        providerPref: 'anthropic',
      });
      const got = employees.getById(id);
      expect(got?.modelPref).toBe('claude-opus-4-6');
      expect(got?.providerPref).toBe('anthropic');
    });

    it('serializes tools_allowed and tools_denied arrays to JSON', () => {
      const id = employees.create({
        companyId,
        rolePackId: 'p',
        roleId: 'r',
        roleMdSha: 's',
        level: 'IC',
        name: 'n',
        title: 't',
        toolsAllowed: ['read', 'write'],
        toolsDenied: ['exec'],
      });
      const got = employees.getById(id);
      expect(JSON.parse(got?.toolsAllowedJson ?? '[]')).toEqual(['read', 'write']);
      expect(JSON.parse(got?.toolsDeniedJson ?? '[]')).toEqual(['exec']);
    });

    it('stores createdAt as a positive integer in ms', () => {
      const before = Date.now();
      const id = employees.create({
        companyId,
        rolePackId: 'p',
        roleId: 'r',
        roleMdSha: 's',
        level: 'IC',
        name: 'n',
        title: 't',
      });
      const after = Date.now();
      const got = employees.getById(id);
      expect(got?.createdAt).toBeGreaterThanOrEqual(before);
      expect(got?.createdAt).toBeLessThanOrEqual(after);
    });

    it('enforces the foreign key to companies (throws on unknown companyId)', () => {
      expect(() =>
        employees.create({
          companyId: 'does-not-exist',
          rolePackId: 'p',
          roleId: 'r',
          roleMdSha: 's',
          level: 'IC',
          name: 'n',
          title: 't',
        }),
      ).toThrow();
    });
  });

  describe('listByCompany', () => {
    it('returns an empty array when a company has no employees', () => {
      expect(employees.listByCompany(companyId)).toEqual([]);
    });

    it('returns only employees belonging to the given company', () => {
      const create = (cId: string, name: string) =>
        employees.create({
          companyId: cId,
          rolePackId: 'p',
          roleId: 'r',
          roleMdSha: 's',
          level: 'IC',
          name,
          title: 't',
        });
      create(companyId, 'alpha');
      create(companyId, 'beta');
      create(otherCompanyId, 'gamma');

      const got = employees.listByCompany(companyId);
      expect(got).toHaveLength(2);
      expect(got.map((e) => e.name).sort()).toEqual(['alpha', 'beta']);

      const other = employees.listByCompany(otherCompanyId);
      expect(other).toHaveLength(1);
      expect(other[0]?.name).toBe('gamma');
    });
  });

  describe('getById', () => {
    it('returns null for an unknown id', () => {
      expect(employees.getById('definitely-not-real')).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('updates the status field of an existing employee', () => {
      const id = employees.create({
        companyId,
        rolePackId: 'p',
        roleId: 'r',
        roleMdSha: 's',
        level: 'IC',
        name: 'n',
        title: 't',
      });
      expect(employees.getById(id)?.status).toBe('idle');
      employees.updateStatus(id, 'thinking');
      expect(employees.getById(id)?.status).toBe('thinking');
      employees.updateStatus(id, 'streaming');
      expect(employees.getById(id)?.status).toBe('streaming');
    });

    it('is a no-op when the id does not exist (does not throw)', () => {
      expect(() => employees.updateStatus('unknown-id', 'thinking')).not.toThrow();
    });
  });

  describe('listVisibleByCompany (M31 T0 — is_system filter)', () => {
    const create = (cId: string, name: string, isSystem = false) =>
      employees.create({
        companyId: cId,
        rolePackId: 'strategia-official',
        roleId: isSystem ? 'system-agent' : 'r',
        roleMdSha: 's',
        level: isSystem ? 'system' : 'IC',
        name,
        title: isSystem ? 'Team-X Copilot' : 't',
        isSystem,
      });

    it('excludes system employees from the visible list', () => {
      create(companyId, 'alpha');
      create(companyId, 'beta');
      create(companyId, 'copilot', true);

      const all = employees.listByCompany(companyId);
      const visible = employees.listVisibleByCompany(companyId);
      expect(all).toHaveLength(3);
      expect(visible).toHaveLength(2);
      expect(visible.map((e) => e.name).sort()).toEqual(['alpha', 'beta']);
      expect(visible.every((e) => !e.isSystem)).toBe(true);
    });

    it('returns visible employees scoped to the given company only', () => {
      create(companyId, 'alpha');
      create(companyId, 'copilot-1', true);
      create(otherCompanyId, 'gamma');
      create(otherCompanyId, 'copilot-2', true);

      expect(employees.listVisibleByCompany(companyId).map((e) => e.name)).toEqual(['alpha']);
      expect(employees.listVisibleByCompany(otherCompanyId).map((e) => e.name)).toEqual(['gamma']);
    });
  });

  describe('findSystemByRoleId (M31 T0 — bootstrap idempotency helper)', () => {
    it('returns null when no system-agent has been seeded', () => {
      expect(employees.findSystemByRoleId(companyId, 'system-agent')).toBeNull();
    });

    it('returns the matching system row for a company + roleId pair', () => {
      const id = employees.create({
        companyId,
        rolePackId: 'strategia-official',
        roleId: 'system-agent',
        roleMdSha: 's',
        level: 'system',
        name: 'Team-X Copilot',
        title: 'Team-X Copilot',
        isSystem: true,
      });
      const got = employees.findSystemByRoleId(companyId, 'system-agent');
      expect(got?.id).toBe(id);
      expect(got?.isSystem).toBe(true);
    });

    it('ignores non-system rows with the same roleId', () => {
      // Imposter: roleId matches but is_system is 0. Must NOT be returned.
      employees.create({
        companyId,
        rolePackId: 'strategia-official',
        roleId: 'system-agent',
        roleMdSha: 's',
        level: 'IC',
        name: 'imposter',
        title: 'imposter',
        isSystem: false,
      });
      expect(employees.findSystemByRoleId(companyId, 'system-agent')).toBeNull();
    });

    it('scopes the lookup to the given company', () => {
      employees.create({
        companyId,
        rolePackId: 'strategia-official',
        roleId: 'system-agent',
        roleMdSha: 's',
        level: 'system',
        name: 'Team-X Copilot',
        title: 'Team-X Copilot',
        isSystem: true,
      });
      // Other company has no system-agent yet.
      expect(employees.findSystemByRoleId(otherCompanyId, 'system-agent')).toBeNull();
    });
  });

  describe('promote (Phase 5.6 M-C step d — restores Cluster B per audit row 2.19)', () => {
    const seed = (overrides: { name?: string; level?: string; roleId?: string } = {}) =>
      employees.create({
        companyId,
        rolePackId: 'strategia-official',
        roleId: overrides.roleId ?? 'senior-fullstack-engineer',
        roleMdSha: 'sha-old',
        level: overrides.level ?? 'IC',
        name: overrides.name ?? 'Iris',
        title: 'Senior Fullstack Engineer',
        toolsAllowed: ['browse'],
        toolsDenied: ['shell'],
      });

    it('atomically swaps roleId, level, title, roleMdSha, and tools_*_json', () => {
      const id = seed();
      employees.promote({
        employeeId: id,
        roleId: 'engineering-manager',
        level: 'management',
        title: 'Engineering Manager',
        roleMdSha: 'sha-new',
        toolsAllowed: ['browse', 'context7'],
        toolsDenied: ['shell', 'exec'],
      });
      const got = employees.getById(id);
      expect(got?.roleId).toBe('engineering-manager');
      expect(got?.level).toBe('management');
      expect(got?.title).toBe('Engineering Manager');
      expect(got?.roleMdSha).toBe('sha-new');
      expect(JSON.parse(got?.toolsAllowedJson ?? '[]')).toEqual(['browse', 'context7']);
      expect(JSON.parse(got?.toolsDeniedJson ?? '[]')).toEqual(['shell', 'exec']);
    });

    it('preserves the employee name (promotes are role swaps, not renames)', () => {
      const id = seed({ name: 'Mateo Reyes' });
      employees.promote({
        employeeId: id,
        roleId: 'lead-engineer',
        level: 'lead',
        title: 'Lead Engineer',
        roleMdSha: 'sha-x',
        toolsAllowed: [],
        toolsDenied: [],
      });
      expect(employees.getById(id)?.name).toBe('Mateo Reyes');
    });

    it('preserves the companyId (promotes never cross companies)', () => {
      const id = seed();
      employees.promote({
        employeeId: id,
        roleId: 'lead-engineer',
        level: 'lead',
        title: 'Lead Engineer',
        roleMdSha: 'sha-x',
        toolsAllowed: [],
        toolsDenied: [],
      });
      expect(employees.getById(id)?.companyId).toBe(companyId);
    });

    it('preserves status and modelPref / providerPref (orthogonal to role)', () => {
      const id = employees.create({
        companyId,
        rolePackId: 'strategia-official',
        roleId: 'senior-fullstack-engineer',
        roleMdSha: 'sha-old',
        level: 'IC',
        name: 'Iris',
        title: 'Senior Fullstack Engineer',
        modelPref: 'claude-haiku-4-5',
        providerPref: 'anthropic',
      });
      employees.updateStatus(id, 'thinking');
      employees.promote({
        employeeId: id,
        roleId: 'engineering-manager',
        level: 'management',
        title: 'Engineering Manager',
        roleMdSha: 'sha-new',
        toolsAllowed: [],
        toolsDenied: [],
      });
      const got = employees.getById(id);
      expect(got?.status).toBe('thinking');
      expect(got?.modelPref).toBe('claude-haiku-4-5');
      expect(got?.providerPref).toBe('anthropic');
    });

    it('preserves createdAt (promote is an update, not a re-insert)', () => {
      const id = seed();
      const before = employees.getById(id)?.createdAt;
      employees.promote({
        employeeId: id,
        roleId: 'lead-engineer',
        level: 'lead',
        title: 'Lead Engineer',
        roleMdSha: 'sha-x',
        toolsAllowed: [],
        toolsDenied: [],
      });
      expect(employees.getById(id)?.createdAt).toBe(before);
    });

    it('serializes empty tools arrays as "[]" (matches create defaults)', () => {
      const id = seed();
      employees.promote({
        employeeId: id,
        roleId: 'lead-engineer',
        level: 'lead',
        title: 'Lead Engineer',
        roleMdSha: 'sha-x',
        toolsAllowed: [],
        toolsDenied: [],
      });
      const got = employees.getById(id);
      expect(got?.toolsAllowedJson).toBe('[]');
      expect(got?.toolsDeniedJson).toBe('[]');
    });

    it('supports lateral moves (same level, different role)', () => {
      const id = seed({ level: 'IC' });
      employees.promote({
        employeeId: id,
        roleId: 'senior-data-engineer',
        level: 'IC',
        title: 'Senior Data Engineer',
        roleMdSha: 'sha-data',
        toolsAllowed: [],
        toolsDenied: [],
      });
      expect(employees.getById(id)?.title).toBe('Senior Data Engineer');
      expect(employees.getById(id)?.level).toBe('IC');
    });

    it('supports down-moves (re-roling a manager back into IC work)', () => {
      const id = seed({ level: 'management' });
      employees.promote({
        employeeId: id,
        roleId: 'principal-engineer',
        level: 'IC',
        title: 'Principal Engineer',
        roleMdSha: 'sha-pe',
        toolsAllowed: [],
        toolsDenied: [],
      });
      expect(employees.getById(id)?.level).toBe('IC');
    });

    it('does NOT touch other employees in the same company', () => {
      const a = seed({ name: 'Alice' });
      const b = seed({ name: 'Bob' });
      const bSnapshot = employees.getById(b);
      employees.promote({
        employeeId: a,
        roleId: 'lead-engineer',
        level: 'lead',
        title: 'Lead Engineer',
        roleMdSha: 'sha-x',
        toolsAllowed: [],
        toolsDenied: [],
      });
      expect(employees.getById(b)).toEqual(bSnapshot);
    });

    it('is a no-op when the id does not exist (does not throw)', () => {
      expect(() =>
        employees.promote({
          employeeId: 'definitely-not-real',
          roleId: 'r',
          level: 'IC',
          title: 't',
          roleMdSha: 's',
          toolsAllowed: [],
          toolsDenied: [],
        }),
      ).not.toThrow();
    });

    it('round-trips a tools_allowed array containing duplicates verbatim', () => {
      const id = seed();
      employees.promote({
        employeeId: id,
        roleId: 'r',
        level: 'IC',
        title: 't',
        roleMdSha: 's',
        toolsAllowed: ['browse', 'browse', 'context7'],
        toolsDenied: [],
      });
      // Repo does NOT dedup — caller responsibility (matches create()).
      expect(JSON.parse(employees.getById(id)?.toolsAllowedJson ?? '[]')).toEqual([
        'browse',
        'browse',
        'context7',
      ]);
    });
  });
});
