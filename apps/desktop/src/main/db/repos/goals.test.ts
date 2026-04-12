import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';
import { createCompaniesRepo } from './companies.js';
import { createGoalsRepo } from './goals.js';
import { createProjectsRepo } from './projects.js';

describe('goals repo', () => {
  let ctx: TestDbHandle;
  let goals: ReturnType<typeof createGoalsRepo>;
  let projectsRepo: ReturnType<typeof createProjectsRepo>;
  let companyId: string;

  beforeEach(async () => {
    ctx = await makeTestDb();
    const companies = createCompaniesRepo(ctx.db);
    goals = createGoalsRepo(ctx.db);
    projectsRepo = createProjectsRepo(ctx.db);
    companyId = companies.create({ name: 'Test Co', slug: 'test-co' });
  });

  afterEach(() => {
    ctx.close();
  });

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('returns a non-empty id and persists the goal', () => {
      const id = goals.create({
        companyId,
        title: 'Ship Phase 3',
        description: 'Complete the live cockpit.',
      });
      expect(id).toBeTypeOf('string');
      expect(id.length).toBeGreaterThan(0);

      const goal = goals.getById(id);
      expect(goal).not.toBeNull();
      expect(goal?.title).toBe('Ship Phase 3');
      expect(goal?.description).toBe('Complete the live cockpit.');
      expect(goal?.status).toBe('active');
      expect(goal?.progressPct).toBe(0);
      expect(goal?.companyId).toBe(companyId);
    });

    it('applies defaults when optional fields are omitted', () => {
      const id = goals.create({ companyId, title: 'Minimal Goal' });
      const goal = goals.getById(id);
      expect(goal).not.toBeNull();
      expect(goal?.description).toBe('');
      expect(goal?.status).toBe('active');
      expect(goal?.progressPct).toBe(0);
      expect(goal?.targetDate).toBeNull();
    });
  });

  describe('getById', () => {
    it('returns null for a nonexistent id', () => {
      expect(goals.getById('nonexistent')).toBeNull();
    });
  });

  describe('listByCompany', () => {
    it('returns all goals for the company', () => {
      const id1 = goals.create({ companyId, title: 'First' });
      const id2 = goals.create({ companyId, title: 'Second' });

      const list = goals.listByCompany(companyId);
      expect(list).toHaveLength(2);
      const ids = list.map((g) => g.id);
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
    });

    it('returns empty array for a company with no goals', () => {
      expect(goals.listByCompany('other-company')).toEqual([]);
    });
  });

  describe('update', () => {
    it('updates specific fields and bumps updatedAt', () => {
      const id = goals.create({ companyId, title: 'Original' });
      const before = goals.getById(id);
      expect(before).not.toBeNull();

      goals.update(id, { title: 'Updated', status: 'achieved' });

      const after = goals.getById(id);
      expect(after).not.toBeNull();
      expect(after?.title).toBe('Updated');
      expect(after?.status).toBe('achieved');
      expect(after?.description).toBe(before?.description);
      expect(after?.updatedAt).toBeGreaterThanOrEqual(before?.updatedAt ?? 0);
    });

    it('does not touch fields not in the input', () => {
      const id = goals.create({
        companyId,
        title: 'Keep Me',
        description: 'Original desc',
      });
      goals.update(id, { status: 'abandoned' });
      const goal = goals.getById(id);
      expect(goal).not.toBeNull();
      expect(goal?.title).toBe('Keep Me');
      expect(goal?.description).toBe('Original desc');
      expect(goal?.status).toBe('abandoned');
    });
  });

  describe('delete', () => {
    it('removes the goal', () => {
      const id = goals.create({ companyId, title: 'Doomed' });
      expect(goals.getById(id)).not.toBeNull();
      goals.delete(id);
      expect(goals.getById(id)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Progress recalculation
  // -------------------------------------------------------------------------

  describe('recalcProgress', () => {
    it('returns 0 when no projects are linked', () => {
      const id = goals.create({ companyId, title: 'Empty Goal' });
      goals.recalcProgress(id);
      expect(goals.getById(id)?.progressPct).toBe(0);
    });

    it('computes percentage from project statuses', () => {
      const goalId = goals.create({ companyId, title: 'Tracked Goal' });

      projectsRepo.create({ companyId, goalId, title: 'P1' });
      const p2 = projectsRepo.create({ companyId, goalId, title: 'P2' });
      projectsRepo.update(p2, { status: 'completed' });
      const p3 = projectsRepo.create({ companyId, goalId, title: 'P3' });
      projectsRepo.update(p3, { status: 'archived' });
      projectsRepo.create({ companyId, goalId, title: 'P4' });

      // 2 out of 4 = 50%
      goals.recalcProgress(goalId);
      expect(goals.getById(goalId)?.progressPct).toBe(50);
    });

    it('returns 100 when all projects are completed', () => {
      const goalId = goals.create({ companyId, title: 'Done Goal' });

      const p1 = projectsRepo.create({ companyId, goalId, title: 'P1' });
      projectsRepo.update(p1, { status: 'completed' });
      const p2 = projectsRepo.create({ companyId, goalId, title: 'P2' });
      projectsRepo.update(p2, { status: 'completed' });

      goals.recalcProgress(goalId);
      expect(goals.getById(goalId)?.progressPct).toBe(100);
    });

    it('rounds to nearest integer', () => {
      const goalId = goals.create({ companyId, title: 'Rounding Goal' });

      const p1 = projectsRepo.create({ companyId, goalId, title: 'P1' });
      projectsRepo.update(p1, { status: 'completed' });
      projectsRepo.create({ companyId, goalId, title: 'P2' });
      projectsRepo.create({ companyId, goalId, title: 'P3' });

      // 1 out of 3 = 33.33... -> rounds to 33
      goals.recalcProgress(goalId);
      expect(goals.getById(goalId)?.progressPct).toBe(33);
    });
  });
});
