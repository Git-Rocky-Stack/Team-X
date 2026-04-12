import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';
import { createCompaniesRepo } from './companies.js';
import { createEmployeesRepo } from './employees.js';
import { createGoalsRepo } from './goals.js';
import { createProjectsRepo } from './projects.js';
import { createTicketsRepo } from './tickets.js';

describe('projects repo', () => {
  let ctx: TestDbHandle;
  let projectsRepo: ReturnType<typeof createProjectsRepo>;
  let goalsRepo: ReturnType<typeof createGoalsRepo>;
  let ticketsRepo: ReturnType<typeof createTicketsRepo>;
  let companyId: string;
  let employeeId: string;

  beforeEach(async () => {
    ctx = await makeTestDb();
    const companies = createCompaniesRepo(ctx.db);
    const employees = createEmployeesRepo(ctx.db);
    goalsRepo = createGoalsRepo(ctx.db);
    projectsRepo = createProjectsRepo(ctx.db);
    ticketsRepo = createTicketsRepo(ctx.db);

    companyId = companies.create({ name: 'Test Co', slug: 'test-co' });
    employeeId = employees.create({
      companyId,
      rolePackId: 'strategia-official',
      roleId: 'ceo',
      roleMdSha: 'abc123',
      level: 'Officer',
      name: 'Alice',
      title: 'CEO',
    });
  });

  afterEach(() => {
    ctx.close();
  });

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('returns a non-empty id and persists the project', () => {
      const id = projectsRepo.create({
        companyId,
        title: 'Dashboard Redesign',
        description: 'Redesign the cockpit dashboard.',
      });
      expect(id).toBeTypeOf('string');
      expect(id.length).toBeGreaterThan(0);

      const project = projectsRepo.getById(id);
      expect(project).not.toBeNull();
      expect(project?.title).toBe('Dashboard Redesign');
      expect(project?.description).toBe('Redesign the cockpit dashboard.');
      expect(project?.status).toBe('planning');
      expect(project?.priority).toBe('medium');
      expect(project?.goalId).toBeNull();
      expect(project?.leadId).toBeNull();
    });

    it('applies defaults when optional fields are omitted', () => {
      const id = projectsRepo.create({ companyId, title: 'Minimal' });
      const project = projectsRepo.getById(id);
      expect(project).not.toBeNull();
      expect(project?.description).toBe('');
      expect(project?.status).toBe('planning');
      expect(project?.priority).toBe('medium');
      expect(project?.goalId).toBeNull();
      expect(project?.leadId).toBeNull();
    });

    it('creates a project linked to a goal', () => {
      const goalId = goalsRepo.create({ companyId, title: 'Goal' });
      const id = projectsRepo.create({ companyId, goalId, title: 'Linked' });
      expect(projectsRepo.getById(id)?.goalId).toBe(goalId);
    });

    it('creates a project with a lead', () => {
      const id = projectsRepo.create({
        companyId,
        title: 'Led Project',
        leadId: employeeId,
      });
      expect(projectsRepo.getById(id)?.leadId).toBe(employeeId);
    });
  });

  describe('getById', () => {
    it('returns null for a nonexistent id', () => {
      expect(projectsRepo.getById('nonexistent')).toBeNull();
    });
  });

  describe('listByCompany', () => {
    it('returns all projects for the company', () => {
      const id1 = projectsRepo.create({ companyId, title: 'First' });
      const id2 = projectsRepo.create({ companyId, title: 'Second' });

      const list = projectsRepo.listByCompany(companyId);
      expect(list).toHaveLength(2);
      const ids = list.map((p) => p.id);
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
    });

    it('returns empty array when no projects exist', () => {
      expect(projectsRepo.listByCompany('no-such-company')).toEqual([]);
    });
  });

  describe('listByGoal', () => {
    it('returns only projects linked to the given goal', () => {
      const g1 = goalsRepo.create({ companyId, title: 'Goal 1' });
      const g2 = goalsRepo.create({ companyId, title: 'Goal 2' });

      projectsRepo.create({ companyId, goalId: g1, title: 'P1-G1' });
      projectsRepo.create({ companyId, goalId: g2, title: 'P2-G2' });
      projectsRepo.create({ companyId, goalId: g1, title: 'P3-G1' });

      const g1Projects = projectsRepo.listByGoal(g1);
      expect(g1Projects).toHaveLength(2);
      expect(g1Projects.every((p) => p.goalId === g1)).toBe(true);

      const g2Projects = projectsRepo.listByGoal(g2);
      expect(g2Projects).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('updates specific fields and bumps updatedAt', () => {
      const id = projectsRepo.create({ companyId, title: 'Original' });
      const before = projectsRepo.getById(id);
      expect(before).not.toBeNull();

      projectsRepo.update(id, { title: 'Updated', status: 'active' });

      const after = projectsRepo.getById(id);
      expect(after).not.toBeNull();
      expect(after?.title).toBe('Updated');
      expect(after?.status).toBe('active');
      expect(after?.description).toBe(before?.description);
      expect(after?.updatedAt).toBeGreaterThanOrEqual(before?.updatedAt ?? 0);
    });

    it('can update goalId to link/unlink from a goal', () => {
      const goalId = goalsRepo.create({ companyId, title: 'Goal' });
      const id = projectsRepo.create({ companyId, title: 'Standalone' });

      // Link to goal
      projectsRepo.update(id, { goalId });
      expect(projectsRepo.getById(id)?.goalId).toBe(goalId);

      // Unlink from goal
      projectsRepo.update(id, { goalId: null });
      expect(projectsRepo.getById(id)?.goalId).toBeNull();
    });
  });

  describe('delete', () => {
    it('removes the project and its ticket links', () => {
      const id = projectsRepo.create({ companyId, title: 'Doomed' });
      const ticketId = ticketsRepo.create({
        companyId,
        title: 'Linked Ticket',
        reporterId: 'rocky',
      });
      projectsRepo.linkTicket(id, ticketId);
      expect(projectsRepo.listTickets(id)).toHaveLength(1);

      projectsRepo.delete(id);
      expect(projectsRepo.getById(id)).toBeNull();
      // Ticket links should be cleaned up
      expect(projectsRepo.listTickets(id)).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Ticket linking
  // -------------------------------------------------------------------------

  describe('linkTicket / unlinkTicket', () => {
    it('links and lists tickets', () => {
      const projId = projectsRepo.create({ companyId, title: 'Project' });
      const t1 = ticketsRepo.create({ companyId, title: 'T1', reporterId: 'rocky' });
      const t2 = ticketsRepo.create({ companyId, title: 'T2', reporterId: 'rocky' });

      projectsRepo.linkTicket(projId, t1);
      projectsRepo.linkTicket(projId, t2);

      const linked = projectsRepo.listTickets(projId);
      expect(linked).toHaveLength(2);
      expect(linked).toContain(t1);
      expect(linked).toContain(t2);
    });

    it('ignores duplicate links', () => {
      const projId = projectsRepo.create({ companyId, title: 'Project' });
      const t1 = ticketsRepo.create({ companyId, title: 'T1', reporterId: 'rocky' });

      projectsRepo.linkTicket(projId, t1);
      projectsRepo.linkTicket(projId, t1); // duplicate — should not throw

      expect(projectsRepo.listTickets(projId)).toHaveLength(1);
    });

    it('unlinks a ticket', () => {
      const projId = projectsRepo.create({ companyId, title: 'Project' });
      const t1 = ticketsRepo.create({ companyId, title: 'T1', reporterId: 'rocky' });

      projectsRepo.linkTicket(projId, t1);
      expect(projectsRepo.listTickets(projId)).toHaveLength(1);

      projectsRepo.unlinkTicket(projId, t1);
      expect(projectsRepo.listTickets(projId)).toEqual([]);
    });
  });

  describe('countTicketsByStatus', () => {
    it('returns zero counts when no tickets are linked', () => {
      const projId = projectsRepo.create({ companyId, title: 'Empty' });
      expect(projectsRepo.countTicketsByStatus(projId)).toEqual({ total: 0, done: 0 });
    });

    it('counts done vs total tickets', () => {
      const projId = projectsRepo.create({ companyId, title: 'Project' });
      const t1 = ticketsRepo.create({ companyId, title: 'T1', reporterId: 'rocky' });
      const t2 = ticketsRepo.create({ companyId, title: 'T2', reporterId: 'rocky' });
      const t3 = ticketsRepo.create({ companyId, title: 'T3', reporterId: 'rocky' });

      ticketsRepo.close(t2);

      projectsRepo.linkTicket(projId, t1);
      projectsRepo.linkTicket(projId, t2);
      projectsRepo.linkTicket(projId, t3);

      const counts = projectsRepo.countTicketsByStatus(projId);
      expect(counts.total).toBe(3);
      expect(counts.done).toBe(1);
    });
  });
});
