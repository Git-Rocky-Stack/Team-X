/**
 * Role-pack level spelling vs. the employee-side level tables.
 *
 * The role-pack format spells Senior Management `senior_management`
 * (`RoleLevel`), and every hire path copies `spec.frontmatter.level` onto
 * the employee row verbatim. Every level table on the employee side
 * (`EmployeeLevel`, `LEVEL_RANK`, `HIRE_LEVELS`, the planner approval
 * ladder, the write-side rosters) spells it `senior-management`. These
 * tests hire the real Senior Management roles through the real hire IPC
 * handler into a real (sql.js) database, then walk each level gate with the
 * row that came back, so they see the string the product actually stores.
 *
 * Nothing here hand-builds a level: the roles come from
 * `role-packs/strategia-official/roles`, and the rows come from
 * `employees.create`. The only fake is the provider completion, which is
 * the network boundary.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ToolContext } from '@team-x/intelligence';
import type { RoleSpec } from '@team-x/shared-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAuditRepo } from '../db/repos/audit.js';
import { createCompaniesRepo } from '../db/repos/companies.js';
import { type EmployeeRow, createEmployeesRepo } from '../db/repos/employees.js';
import { createMeetingsRepo } from '../db/repos/meetings.js';
import { createOrgEdgesRepo } from '../db/repos/orgchart.js';
import { createPendingDelegationsRepo } from '../db/repos/pending-delegations.js';
import { createProjectsRepo } from '../db/repos/projects.js';
import { createTicketsRepo } from '../db/repos/tickets.js';
import { createVaultRepo } from '../db/repos/vault.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';
import { createIpcHandlers } from '../ipc/handlers.js';

import {
  type AgenticToolsWriteDeps,
  buildDecomposeProjectTool,
  buildWriteSideTools,
  computeRoleFit,
  defaultPlanner,
} from './agentic-tools-write.js';
import { buildQueryEmployeesTool } from './agentic-tools.js';
import { buildChatActionTools } from './chat-action-tools.js';
import { createRoleLoader } from './role-loader.js';
import { createTestToolsForEmployee, createTestWriteSideTools } from './test-agentic-tools.js';

const thisDir = dirname(fileURLToPath(import.meta.url));
// apps/desktop/src/main/services -> repo root is up 5 directories.
const REAL_ROLES_ROOT = resolve(thisDir, '../../../../..', 'role-packs/strategia-official/roles');

/** The spelling the role-pack format uses for the level under test. */
const ROLE_PACK_SPELLING = 'senior_management';

// biome-ignore lint/suspicious/noExplicitAny: test stand-in for deps these handlers never touch
const unused: any = null;

function makeCtx(): ToolContext {
  return { signal: new AbortController().signal, runId: 'level-spelling-run' };
}

describe('a hired Senior Management employee clears every level gate', () => {
  const roleLoader = createRoleLoader({ rolePacksRoot: REAL_ROLES_ROOT });
  /** Every role the shipped pack files under Senior Management. */
  const seniorManagementSpecs: RoleSpec[] = roleLoader
    .listRoles()
    .filter((spec) => spec.frontmatter.level === ROLE_PACK_SPELLING);

  let ctx: TestDbHandle;
  let employeesRepo: ReturnType<typeof createEmployeesRepo>;
  let orgEdgesRepo: ReturnType<typeof createOrgEdgesRepo>;
  let handlers: ReturnType<typeof createIpcHandlers>;
  let companyId: string;
  /** One real row per Senior Management role, hired through `employees.create`. */
  let vps: EmployeeRow[];

  async function hire(roleId: string, name: string): Promise<EmployeeRow> {
    const { employeeId } = await handlers.employeesCreate({ companyId, roleId, name });
    const row = employeesRepo.getById(employeeId);
    if (!row) throw new Error(`hire did not persist a row for ${roleId}`);
    return row;
  }

  function writeDeps(actor: EmployeeRow): AgenticToolsWriteDeps {
    return {
      companyId,
      actorId: actor.id,
      actorKind: 'agent',
      employeesRepo,
      ticketsRepo: createTicketsRepo(ctx.db),
      projectsRepo: createProjectsRepo(ctx.db),
      pendingDelegationsRepo: createPendingDelegationsRepo(ctx.db),
      bus: { emit: () => undefined },
      orchestrator: {
        queueDelegatedTicket: async () => ({ threadId: 'unused', triggerMessageId: 'unused' }),
        isCompanyPaused: () => false,
        canResolveProvider: async () => true,
      },
      // The provider completion is the network boundary: canned, deterministic.
      providerComplete: async () => ({
        text: JSON.stringify([
          { title: 'Draft the migration plan', description: 'd', complexity: 'M', dependsOn: [] },
        ]),
      }),
      workload: {
        openTicketCount: () => 0,
        inMeeting: () => false,
        avgCompletionMs: () => null,
      },
      roleLookup: roleLoader,
      getPlanner: () => defaultPlanner(),
    };
  }

  beforeEach(async () => {
    ctx = await makeTestDb();
    const companiesRepo = createCompaniesRepo(ctx.db);
    employeesRepo = createEmployeesRepo(ctx.db);
    orgEdgesRepo = createOrgEdgesRepo(ctx.db);
    companyId = companiesRepo.create({ name: 'Strategia-X', slug: 'strategia-x' });
    handlers = createIpcHandlers({
      companiesRepo,
      employeesRepo,
      orgEdgesRepo,
      roleLookup: roleLoader,
      bus: { emit: () => undefined },
      threadsRepo: unused,
      messagesRepo: unused,
      ticketsRepo: unused,
      ticketAttachmentsRepo: unused,
      goalsRepo: unused,
      projectsRepo: unused,
      scheduleItemsRepo: unused,
      meetingsRepo: unused,
      runsRepo: unused,
      eventsRepo: unused,
      orchestrator: unused,
      meetingService: unused,
      mcpHost: unused,
      mcpServersRepo: unused,
      providersService: unused,
      secretsStore: unused,
      settingsRepo: unused,
      vaultService: unused,
      backupService: unused,
      auditRepo: unused,
      updaterService: unused,
      getHardwareProfile: () => unused,
    });

    // Guard against vacuous loops: the pack must really ship this level, and
    // the hire path must really store the role-pack spelling on the row.
    expect(seniorManagementSpecs.length).toBeGreaterThan(0);
    vps = [];
    for (const spec of seniorManagementSpecs) {
      const row = await hire(spec.frontmatter.id, `Hire ${spec.frontmatter.id}`);
      expect(row.level).toBe(spec.frontmatter.level);
      vps.push(row);
    }
  });

  afterEach(() => {
    ctx.close();
  });

  it('chat hire gate: offers hire_employee to a Senior Management actor', () => {
    for (const vp of vps) {
      const tools = buildChatActionTools({
        companyId,
        actorId: vp.id,
        actorLevel: vp.level,
        employeesRepo,
        roleLookup: roleLoader,
        bus: { emit: () => undefined },
      });
      expect(
        tools.map((tool) => tool.name),
        `role=${vp.roleId} level=${vp.level}`,
      ).toContain('hire_employee');
    }
  });

  it('write-side registry: gives a Senior Management employee all three planner tools', () => {
    for (const vp of vps) {
      const tools = buildWriteSideTools(vp, writeDeps(vp));
      expect(
        tools.map((tool) => tool.name),
        `role=${vp.roleId} level=${vp.level}`,
      ).toEqual(['decompose_project', 'delegate_subtask', 'review_deliverable']);
    }
  });

  it('decomposition approval: a Senior Management actor clears a "management" approval level', async () => {
    for (const vp of vps) {
      const result = await buildDecomposeProjectTool(writeDeps(vp)).execute(
        { brief: 'Ship the platform migration this quarter.' },
        makeCtx(),
      );
      expect(result, `role=${vp.roleId} level=${vp.level}`).toEqual(
        expect.objectContaining({ planId: expect.any(String) }),
      );
    }
  });

  it('role fit: scores a Senior Management employee on the senior-management baseline', () => {
    // `type` matches no keyword bucket, so the score is the per-level baseline alone.
    const hint = { title: 'Unclassified work', type: 'no-keyword-bucket' };
    for (const vp of vps) {
      const scorer = {
        id: vp.id,
        name: vp.name,
        title: vp.title,
        level: vp.level,
        status: vp.status,
        isSystem: vp.isSystem,
      };
      const fit = computeRoleFit(scorer, hint);
      expect(fit, `role=${vp.roleId} level=${vp.level}`).toBe(
        computeRoleFit({ ...scorer, level: 'senior-management' }, hint),
      );
      // ...and that baseline is a real table entry, not the unknown-level fallback.
      expect(fit).not.toBe(computeRoleFit({ ...scorer, level: 'no-such-level' }, hint));
    }
  });

  it('query_employees: the senior-management filter returns the hired Senior Management employees', async () => {
    const tool = buildQueryEmployeesTool({
      companyId,
      employeesRepo,
      ticketsRepo: createTicketsRepo(ctx.db),
      projectsRepo: createProjectsRepo(ctx.db),
      meetingsRepo: createMeetingsRepo(ctx.db),
      vaultRepo: createVaultRepo(ctx.db),
      auditRepo: createAuditRepo(ctx.db),
    });
    const result = await tool.execute({ level: 'senior-management' }, makeCtx());
    expect(result.rows.map((row) => row.id).sort()).toEqual(vps.map((vp) => vp.id).sort());
  });

  it('employees.setManager: refuses to put a Senior Management employee over an officer', async () => {
    const ceo = await hire('chief-executive-officer', 'Iris Kovac');
    const vp = vps[0] as EmployeeRow;
    await expect(
      handlers.employeesSetManager({ employeeId: ceo.id, managerId: vp.id }),
    ).rejects.toThrow(/level inversion/);
    expect(orgEdgesRepo.getByReport(ceo.id)).toBeNull();
  });

  it('employees.setManager: refuses to put one Senior Management employee over another', async () => {
    const [first, second] = vps as [EmployeeRow, EmployeeRow];
    await expect(
      handlers.employeesSetManager({ employeeId: first.id, managerId: second.id }),
    ).rejects.toThrow(/level inversion/);
    expect(orgEdgesRepo.getByReport(first.id)).toBeNull();
  });

  it('employees.setManager: ranks a Senior Management employee instead of failing open', async () => {
    const ceo = await hire('chief-executive-officer', 'Iris Kovac');
    const manager = await hire('engineering-manager', 'Mateo Reyes');
    const vp = vps[0] as EmployeeRow;
    // The unknown-rank path warns and skips the guard. A ranked level must not take it.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* captured; asserted below */
    });
    try {
      await handlers.employeesSetManager({ employeeId: vp.id, managerId: ceo.id });
      await handlers.employeesSetManager({ employeeId: manager.id, managerId: vp.id });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
    expect(orgEdgesRepo.getByReport(vp.id)?.managerId).toBe(ceo.id);
    expect(orgEdgesRepo.getByReport(manager.id)?.managerId).toBe(vp.id);
  });

  it('test-mode composer: mirrors production and offers decompose_project', () => {
    for (const vp of vps) {
      const tools = createTestToolsForEmployee({
        companyId,
        employee: { id: vp.id, level: vp.level, isSystem: vp.isSystem },
      });
      expect(
        tools.map((tool) => tool.name),
        `role=${vp.roleId} level=${vp.level}`,
      ).toContain('decompose_project');
    }
  });

  it('test-mode write-side composer: offers decompose_project on its own too', () => {
    for (const vp of vps) {
      const tools = createTestWriteSideTools({ id: vp.id, level: vp.level, isSystem: vp.isSystem });
      expect(
        tools.map((tool) => tool.name),
        `role=${vp.roleId} level=${vp.level}`,
      ).toContain('decompose_project');
    }
  });
});
