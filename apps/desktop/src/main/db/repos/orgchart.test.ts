/**
 * Org-edges repo unit tests. Covers every factory method plus the
 * `wouldCycle` guard under direct, transitive, self-edge, and
 * pre-existing-corruption conditions. Fixture-heavy by necessity —
 * every edge carries FK references to companies + employees, so the
 * test setup seeds the graph explicitly. See companies.test.ts for
 * the archetype test-shape.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createCompaniesRepo } from './companies.js';
import { createEmployeesRepo } from './employees.js';
import { createOrgEdgesRepo } from './orgchart.js';

describe('org-edges repo', () => {
  let ctx: TestDbHandle;
  let repo: ReturnType<typeof createOrgEdgesRepo>;
  let companyId: string;
  let ceoId: string;
  let cooId: string;
  let vpEngId: string;
  let engLeadId: string;
  let engIcId: string;

  beforeEach(async () => {
    ctx = await makeTestDb();
    const companies = createCompaniesRepo(ctx.db);
    const employees = createEmployeesRepo(ctx.db);
    repo = createOrgEdgesRepo(ctx.db);

    companyId = companies.create({ name: 'Strategia-X', slug: 'strategia-x' });
    ceoId = employees.create({
      companyId,
      rolePackId: 'strategia-official',
      roleId: 'ceo',
      roleMdSha: 'sha-ceo',
      level: 'Officer',
      name: 'CEO',
      title: 'Chief Executive Officer',
    });
    cooId = employees.create({
      companyId,
      rolePackId: 'strategia-official',
      roleId: 'coo',
      roleMdSha: 'sha-coo',
      level: 'Officer',
      name: 'COO',
      title: 'Chief Operating Officer',
    });
    vpEngId = employees.create({
      companyId,
      rolePackId: 'strategia-official',
      roleId: 'vp-engineering',
      roleMdSha: 'sha-vpe',
      level: 'Senior Management',
      name: 'VP Eng',
      title: 'VP of Engineering',
    });
    engLeadId = employees.create({
      companyId,
      rolePackId: 'strategia-official',
      roleId: 'engineering-lead',
      roleMdSha: 'sha-lead',
      level: 'Lead',
      name: 'Eng Lead',
      title: 'Engineering Lead',
    });
    engIcId = employees.create({
      companyId,
      rolePackId: 'strategia-official',
      roleId: 'senior-fullstack-engineer',
      roleMdSha: 'sha-ic',
      level: 'IC',
      name: 'Eng IC',
      title: 'Senior Fullstack Engineer',
    });
  });

  afterEach(() => {
    ctx.close();
  });

  describe('setManager', () => {
    it('inserts a new edge when none exists for the report', () => {
      // M-C step d hardening (BUG-003 + BUG-004): setManager now returns
      // { edgeId, previousManagerId } from inside an atomic transaction.
      // previousManagerId is null when the report had no prior edge.
      const result = repo.setManager({ companyId, managerId: ceoId, reportId: cooId });
      expect(result.edgeId).toBeTypeOf('string');
      expect(result.edgeId.length).toBeGreaterThan(0);
      expect(result.previousManagerId).toBeNull();

      const edge = repo.getByReport(cooId);
      expect(edge).not.toBeNull();
      expect(edge?.managerId).toBe(ceoId);
      expect(edge?.reportId).toBe(cooId);
      expect(edge?.companyId).toBe(companyId);
    });

    it('updates managerId in place when an edge already exists (upsert)', () => {
      const first = repo.setManager({ companyId, managerId: ceoId, reportId: vpEngId });
      const second = repo.setManager({ companyId, managerId: cooId, reportId: vpEngId });

      // Same row id — it was updated in place, not re-inserted.
      expect(second.edgeId).toBe(first.edgeId);
      // previousManagerId reflects the prior manager (snapshotted inside
      // the transaction).
      expect(first.previousManagerId).toBeNull();
      expect(second.previousManagerId).toBe(ceoId);
      const edge = repo.getByReport(vpEngId);
      expect(edge?.managerId).toBe(cooId);
    });

    it('returns previousManagerId snapshot atomically inside the transaction (BUG-004)', () => {
      // Pin the design contract: the snapshot read happens INSIDE the
      // same transaction that writes the upsert. A handler-level
      // separate getByReport snapshot would race; this test guards
      // against a regression that re-introduces the standalone read.
      repo.setManager({ companyId, managerId: ceoId, reportId: vpEngId });
      const reassign = repo.setManager({ companyId, managerId: cooId, reportId: vpEngId });
      expect(reassign.previousManagerId).toBe(ceoId);
    });

    it('removeByReport returns previousManagerId snapshot from inside the transaction', () => {
      repo.setManager({ companyId, managerId: ceoId, reportId: cooId });
      const detachResult = repo.removeByReport(cooId);
      expect(detachResult.previousManagerId).toBe(ceoId);
      expect(repo.getByReport(cooId)).toBeNull();
    });

    it('removeByReport on a root employee (no prior edge) returns previousManagerId: null', () => {
      const result = repo.removeByReport(cooId);
      expect(result.previousManagerId).toBeNull();
    });

    it('stores createdAt as a positive integer in ms on insert', () => {
      const before = Date.now();
      repo.setManager({ companyId, managerId: ceoId, reportId: cooId });
      const after = Date.now();
      const edge = repo.getByReport(cooId);
      expect(edge?.createdAt).toBeGreaterThanOrEqual(before);
      expect(edge?.createdAt).toBeLessThanOrEqual(after);
    });

    it('throws on self-edge (managerId === reportId)', () => {
      expect(() => repo.setManager({ companyId, managerId: ceoId, reportId: ceoId })).toThrow(
        /cycle/i,
      );
    });

    it('throws when the edit would close a direct cycle', () => {
      // ceo → coo established, then try coo → ceo: direct cycle.
      repo.setManager({ companyId, managerId: ceoId, reportId: cooId });
      expect(() => repo.setManager({ companyId, managerId: cooId, reportId: ceoId })).toThrow(
        /cycle/i,
      );
    });

    it('throws when the edit would close a transitive cycle', () => {
      // Chain ceo → coo → vpEng → engLead established.
      repo.setManager({ companyId, managerId: ceoId, reportId: cooId });
      repo.setManager({ companyId, managerId: cooId, reportId: vpEngId });
      repo.setManager({ companyId, managerId: vpEngId, reportId: engLeadId });
      // Making ceo report to engLead would close ceo → coo → vpEng → engLead → ceo.
      expect(() => repo.setManager({ companyId, managerId: engLeadId, reportId: ceoId })).toThrow(
        /cycle/i,
      );
    });

    it('accepts a legal re-parent (vp-eng moves from coo to ceo)', () => {
      repo.setManager({ companyId, managerId: ceoId, reportId: cooId });
      repo.setManager({ companyId, managerId: cooId, reportId: vpEngId });
      // Reparent vpEng directly under the CEO — legal, no cycle.
      expect(() =>
        repo.setManager({ companyId, managerId: ceoId, reportId: vpEngId }),
      ).not.toThrow();
      expect(repo.getByReport(vpEngId)?.managerId).toBe(ceoId);
    });
  });

  describe('removeByReport', () => {
    it('deletes the edge for a given report', () => {
      repo.setManager({ companyId, managerId: ceoId, reportId: cooId });
      expect(repo.getByReport(cooId)).not.toBeNull();

      repo.removeByReport(cooId);
      expect(repo.getByReport(cooId)).toBeNull();
    });

    it('is a no-op when no edge exists for the report', () => {
      expect(() => repo.removeByReport(cooId)).not.toThrow();
      expect(repo.getByReport(cooId)).toBeNull();
    });

    it('leaves unrelated edges untouched', () => {
      repo.setManager({ companyId, managerId: ceoId, reportId: cooId });
      repo.setManager({ companyId, managerId: ceoId, reportId: vpEngId });
      repo.removeByReport(cooId);
      expect(repo.getByReport(cooId)).toBeNull();
      expect(repo.getByReport(vpEngId)?.managerId).toBe(ceoId);
    });
  });

  describe('removeByManager', () => {
    it('deletes every edge where the given employee is the manager', () => {
      repo.setManager({ companyId, managerId: ceoId, reportId: cooId });
      repo.setManager({ companyId, managerId: ceoId, reportId: vpEngId });
      repo.setManager({ companyId, managerId: cooId, reportId: engLeadId });

      repo.removeByManager(companyId, ceoId);
      expect(repo.getByReport(cooId)).toBeNull();
      expect(repo.getByReport(vpEngId)).toBeNull();
      // cooId → engLeadId untouched because its manager is cooId, not ceoId.
      expect(repo.getByReport(engLeadId)?.managerId).toBe(cooId);
    });

    it('is a no-op when the given manager has no reports', () => {
      repo.setManager({ companyId, managerId: ceoId, reportId: cooId });
      expect(() => repo.removeByManager(companyId, engIcId)).not.toThrow();
      expect(repo.getByReport(cooId)?.managerId).toBe(ceoId);
    });
  });

  describe('listByCompany', () => {
    it('returns an empty array when the company has no edges', () => {
      expect(repo.listByCompany(companyId)).toEqual([]);
    });

    it('returns every edge belonging to the company', () => {
      repo.setManager({ companyId, managerId: ceoId, reportId: cooId });
      repo.setManager({ companyId, managerId: ceoId, reportId: vpEngId });
      repo.setManager({ companyId, managerId: vpEngId, reportId: engLeadId });
      const edges = repo.listByCompany(companyId);
      expect(edges).toHaveLength(3);
      const reportIds = edges.map((e) => e.reportId).sort();
      expect(reportIds).toEqual([cooId, engLeadId, vpEngId].sort());
    });
  });

  describe('listReports', () => {
    it('returns every edge whose manager matches', () => {
      repo.setManager({ companyId, managerId: ceoId, reportId: cooId });
      repo.setManager({ companyId, managerId: ceoId, reportId: vpEngId });
      repo.setManager({ companyId, managerId: cooId, reportId: engLeadId });
      const ceoReports = repo.listReports(companyId, ceoId);
      expect(ceoReports).toHaveLength(2);
      expect(ceoReports.map((e) => e.reportId).sort()).toEqual([cooId, vpEngId].sort());
    });

    it('returns an empty array when the manager has no reports', () => {
      expect(repo.listReports(companyId, ceoId)).toEqual([]);
    });
  });

  describe('wouldCycle', () => {
    it('is true for self-edges', () => {
      expect(repo.wouldCycle(companyId, ceoId, ceoId)).toBe(true);
    });

    it('is false when the report is a fresh root with no chain', () => {
      expect(repo.wouldCycle(companyId, ceoId, cooId)).toBe(false);
    });

    it('is true for a direct two-step cycle', () => {
      repo.setManager({ companyId, managerId: ceoId, reportId: cooId });
      expect(repo.wouldCycle(companyId, cooId, ceoId)).toBe(true);
    });

    it('is true for a transitive multi-step cycle', () => {
      repo.setManager({ companyId, managerId: ceoId, reportId: cooId });
      repo.setManager({ companyId, managerId: cooId, reportId: vpEngId });
      repo.setManager({ companyId, managerId: vpEngId, reportId: engLeadId });
      expect(repo.wouldCycle(companyId, engLeadId, ceoId)).toBe(true);
    });

    it('is false for a legal re-parent inside an existing subtree', () => {
      repo.setManager({ companyId, managerId: ceoId, reportId: cooId });
      repo.setManager({ companyId, managerId: cooId, reportId: vpEngId });
      // Re-parenting vpEng directly under CEO is legal — walking up from
      // ceoId never reaches vpEng.
      expect(repo.wouldCycle(companyId, ceoId, vpEngId)).toBe(false);
    });
  });
});
