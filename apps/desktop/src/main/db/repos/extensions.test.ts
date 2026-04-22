import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';
import { companies, employees } from '../schema.js';
import {
  createAuthorityRepo,
  createExtensionsRepo,
  createSkillAssignmentsRepo,
} from './extensions.js';

let ctx: TestDbHandle;
let extensionsRepo: ReturnType<typeof createExtensionsRepo>;
let skillAssignmentsRepo: ReturnType<typeof createSkillAssignmentsRepo>;
let authorityRepo: ReturnType<typeof createAuthorityRepo>;

const COMPANY_ID = 'company-alpha';
const OTHER_COMPANY_ID = 'company-beta';
const EMPLOYEE_ID = 'employee-alpha';
const OTHER_EMPLOYEE_ID = 'employee-beta';

beforeEach(async () => {
  ctx = await makeTestDb();
  extensionsRepo = createExtensionsRepo(ctx.db);
  skillAssignmentsRepo = createSkillAssignmentsRepo(ctx.db);
  authorityRepo = createAuthorityRepo(ctx.db);

  ctx.db.insert(companies).values([
    {
      id: COMPANY_ID,
      name: 'Alpha',
      slug: 'alpha',
      createdAt: 1,
      settingsJson: '{}',
      icon: null,
      theme: 'dark',
      status: 'running',
    },
    {
      id: OTHER_COMPANY_ID,
      name: 'Beta',
      slug: 'beta',
      createdAt: 2,
      settingsJson: '{}',
      icon: null,
      theme: 'dark',
      status: 'running',
    },
  ]).run();

  ctx.db.insert(employees).values([
    {
      id: EMPLOYEE_ID,
      companyId: COMPANY_ID,
      rolePackId: 'strategia-official',
      roleId: 'ceo',
      roleMdSha: 'sha-alpha',
      level: 'officer',
      name: 'Alpha CEO',
      title: 'CEO',
      createdAt: 1,
    },
    {
      id: OTHER_EMPLOYEE_ID,
      companyId: OTHER_COMPANY_ID,
      rolePackId: 'strategia-official',
      roleId: 'ceo',
      roleMdSha: 'sha-beta',
      level: 'officer',
      name: 'Beta CEO',
      title: 'CEO',
      createdAt: 2,
    },
  ]).run();
});

afterEach(() => ctx.close());

describe('extensions repos', () => {
  it('lists global and company-scoped extensions for a workspace', () => {
    const globalId = extensionsRepo.create({
      companyId: null,
      kind: 'skill',
      name: 'Global Skill',
      slug: 'global-skill',
      sourceKind: 'template',
      sourceRef: 'builtin://global-skill',
    });
    const companyId = extensionsRepo.create({
      companyId: COMPANY_ID,
      kind: 'mcp',
      name: 'Alpha MCP',
      slug: 'alpha-mcp',
      sourceKind: 'local',
      sourceRef: 'C:/skills/alpha-mcp',
      runtimeRefId: 'mcp-runtime-1',
    });

    const rows = extensionsRepo.listByCompany(COMPANY_ID);

    expect(rows.map((row) => row.id)).toEqual(expect.arrayContaining([globalId, companyId]));
    expect(extensionsRepo.listSkillsByCompany(COMPANY_ID).map((row) => row.id)).toEqual([globalId]);
  });

  it('round-trips workspace and employee skill assignments', () => {
    const extensionId = extensionsRepo.create({
      companyId: COMPANY_ID,
      kind: 'skill',
      name: 'Ops Skill',
      slug: 'ops-skill',
      sourceKind: 'github',
      sourceRef: 'github.com/team-x/ops-skill',
    });

    const workspaceAssignmentId = skillAssignmentsRepo.create({
      extensionId,
      companyId: COMPANY_ID,
      source: 'workspace-default',
    });
    const employeeAssignmentId = skillAssignmentsRepo.create({
      extensionId,
      companyId: COMPANY_ID,
      employeeId: EMPLOYEE_ID,
      enabled: false,
      source: 'employee-override',
    });

    const companyAssignments = skillAssignmentsRepo.listByCompany(COMPANY_ID);
    const employeeAssignments = skillAssignmentsRepo.listByEmployee(COMPANY_ID, EMPLOYEE_ID);

    expect(companyAssignments.map((row) => row.id)).toEqual(
      expect.arrayContaining([workspaceAssignmentId, employeeAssignmentId]),
    );
    expect(employeeAssignments.map((row) => row.id)).toEqual([employeeAssignmentId]);
  });

  it('filters authority grants to the requested company scope', () => {
    const companyExtensionId = extensionsRepo.create({
      companyId: COMPANY_ID,
      kind: 'skill',
      name: 'Alpha Skill',
      slug: 'alpha-skill',
      sourceKind: 'local',
      sourceRef: 'C:/skills/alpha',
    });
    const otherExtensionId = extensionsRepo.create({
      companyId: OTHER_COMPANY_ID,
      kind: 'skill',
      name: 'Beta Skill',
      slug: 'beta-skill',
      sourceKind: 'local',
      sourceRef: 'C:/skills/beta',
    });

    const companyGrantId = authorityRepo.createGrant({
      scopeKind: 'company',
      scopeId: COMPANY_ID,
      resourceKind: 'capability',
      resourceId: 'mcp.manage',
      permission: 'allow',
    });
    const employeeGrantId = authorityRepo.createGrant({
      scopeKind: 'employee',
      scopeId: EMPLOYEE_ID,
      resourceKind: 'path',
      resourceId: 'C:/Projects/Alpha',
      permission: 'allow',
    });
    const extensionGrantId = authorityRepo.createGrant({
      scopeKind: 'extension',
      scopeId: companyExtensionId,
      resourceKind: 'capability',
      resourceId: 'filesystem.write',
      permission: 'prompt',
    });
    authorityRepo.createGrant({
      scopeKind: 'employee',
      scopeId: OTHER_EMPLOYEE_ID,
      resourceKind: 'path',
      resourceId: 'C:/Projects/Beta',
      permission: 'allow',
    });
    authorityRepo.createGrant({
      scopeKind: 'extension',
      scopeId: otherExtensionId,
      resourceKind: 'capability',
      resourceId: 'network',
      permission: 'allow',
    });

    const companyRows = authorityRepo.listByCompany(COMPANY_ID);
    const employeeRows = authorityRepo.listForEmployee(COMPANY_ID, EMPLOYEE_ID);

    expect(companyRows.map((row) => row.id)).toEqual(
      expect.arrayContaining([companyGrantId, employeeGrantId, extensionGrantId]),
    );
    expect(employeeRows.map((row) => row.id)).toEqual(
      expect.arrayContaining([companyGrantId, employeeGrantId, extensionGrantId]),
    );
    expect(companyRows.some((row) => row.scopeId === OTHER_EMPLOYEE_ID)).toBe(false);
  });

  it('lists pending authority requests relevant to a company', () => {
    const extensionId = extensionsRepo.create({
      companyId: COMPANY_ID,
      kind: 'skill',
      name: 'Pending Skill',
      slug: 'pending-skill',
      sourceKind: 'local',
      sourceRef: 'C:/skills/pending',
    });
    const otherExtensionId = extensionsRepo.create({
      companyId: OTHER_COMPANY_ID,
      kind: 'skill',
      name: 'Other Pending Skill',
      slug: 'other-pending-skill',
      sourceKind: 'local',
      sourceRef: 'C:/skills/other-pending',
    });

    const pendingId = authorityRepo.createRequest({
      extensionId,
      resourceKind: 'path',
      resourceId: 'C:/Projects/Alpha',
      requestedPermission: 'allow',
    });
    authorityRepo.createRequest({
      extensionId: otherExtensionId,
      resourceKind: 'path',
      resourceId: 'C:/Projects/Beta',
      requestedPermission: 'allow',
    });
    authorityRepo.createRequest({
      extensionId,
      resourceKind: 'capability',
      resourceId: 'shell',
      requestedPermission: 'prompt',
      status: 'approved',
    });

    const rows = authorityRepo.listPendingByCompany(COMPANY_ID);

    expect(rows.map((row) => row.id)).toEqual([pendingId]);
  });
});
