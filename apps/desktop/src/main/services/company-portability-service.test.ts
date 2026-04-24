import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CompanyPackage, CompanySettings } from '@team-x/shared-types';
import { validateCompanyPackage } from '@team-x/shared-types';

import type { TestDbHandle } from '../db/test-helpers.js';
import { makeTestDb } from '../db/test-helpers.js';
import {
  companies,
  employees,
  goals,
  orgEdges,
  projects,
  tickets,
} from '../db/schema.js';
import { createCompaniesRepo } from '../db/repos/companies.js';
import { createEmployeesRepo } from '../db/repos/employees.js';
import { createGoalsRepo } from '../db/repos/goals.js';
import { createOrgEdgesRepo } from '../db/repos/orgchart.js';
import { createProjectsRepo } from '../db/repos/projects.js';
import { createTicketsRepo } from '../db/repos/tickets.js';
import {
  PORTABILITY_REDACTED_VALUE,
  createCompanyPortabilityService,
} from './company-portability-service.js';

const COMPANY_ID = 'company-1';
const CEO_ID = 'employee-ceo';
const ENG_ID = 'employee-eng';

let ctx: TestDbHandle;
let exportRootDir: string;

beforeEach(async () => {
  ctx = await makeTestDb();
  exportRootDir = await mkdtemp(join(tmpdir(), 'teamx-portability-'));

  const settings: CompanySettings = {
    mission: 'Ship autonomous companies.',
    sharing: {
      mode: 'invited',
      readiness: 'warning',
      missingRequirements: ['operator-invites'],
      lastExportedAt: '2026-01-01T00:00:00.000Z',
      lastExportMode: 'workspace-export',
    },
  };

  ctx.db.insert(companies).values({
    id: COMPANY_ID,
    name: 'Alpha Ops',
    slug: 'alpha-ops',
    createdAt: 1,
    settingsJson: JSON.stringify(settings),
    icon: 'A',
    theme: 'dark',
    status: 'running',
    workspaceOriginId: 'workspace-origin-1',
    companyOriginId: 'company-origin-1',
  }).run();

  ctx.db.insert(employees).values([
    {
      id: CEO_ID,
      companyId: COMPANY_ID,
      rolePackId: 'strategia-official',
      roleId: 'ceo',
      roleMdSha: 'sha-ceo',
      level: 'officer',
      name: 'Iris Kovac',
      title: 'Chief Executive Officer',
      status: 'busy',
      createdAt: 2,
    },
    {
      id: ENG_ID,
      companyId: COMPANY_ID,
      rolePackId: 'strategia-official',
      roleId: 'engineer',
      roleMdSha: 'sha-eng',
      level: 'senior',
      name: 'Mateo Reyes',
      title: 'Senior Engineer',
      status: 'idle',
      createdAt: 3,
    },
  ]).run();

  ctx.db.insert(orgEdges).values({
    id: 'edge-1',
    companyId: COMPANY_ID,
    managerId: CEO_ID,
    reportId: ENG_ID,
    createdAt: 4,
  }).run();

  ctx.db.insert(goals).values({
    id: 'goal-1',
    companyId: COMPANY_ID,
    title: 'Scale Support',
    description: 'Reduce response time.',
    status: 'active',
    progressPct: 40,
    targetDate: null,
    createdAt: 5,
    updatedAt: 5,
  }).run();

  ctx.db.insert(projects).values({
    id: 'project-1',
    companyId: COMPANY_ID,
    goalId: 'goal-1',
    title: 'Inbox Automation',
    description: 'Route inbound requests.',
    status: 'active',
    leadId: ENG_ID,
    priority: 'high',
    createdAt: 6,
    updatedAt: 6,
  }).run();

  ctx.db.insert(tickets).values({
    id: 'ticket-1',
    companyId: COMPANY_ID,
    title: 'Triage automation',
    description: 'Set up daily triage.',
    status: 'open',
    priority: 'high',
    assigneeId: ENG_ID,
    reporterId: 'rocky',
    reporterKind: 'user',
    labelsJson: JSON.stringify(['automation']),
    dependenciesJson: '[]',
    slaHours: null,
    dueAt: null,
    threadId: null,
    createdAt: 7,
    updatedAt: 7,
    closedAt: null,
  }).run();
});

afterEach(async () => {
  await rm(exportRootDir, { recursive: true, force: true });
  ctx.close();
});

function createService() {
  const companiesRepo = createCompaniesRepo(ctx.db);
  const service = createCompanyPortabilityService({
    companiesRepo,
    employeesRepo: createEmployeesRepo(ctx.db),
    orgEdgesRepo: createOrgEdgesRepo(ctx.db),
    goalsRepo: createGoalsRepo(ctx.db),
    projectsRepo: createProjectsRepo(ctx.db),
    ticketsRepo: createTicketsRepo(ctx.db),
    runtimeProfilesService: {
      list: () => [
        {
          id: 'runtime-1',
          companyId: COMPANY_ID,
          name: 'Codex Launcher',
          slug: 'codex-launcher',
          kind: 'codex',
          enabled: true,
          config: {
            command: 'C:/Tools/Codex/codex.exe',
            workingDirectory: 'C:/Projects/Alpha',
            headers: {
              Authorization: 'Bearer top-secret',
            },
          },
          lastHealthStatus: 'healthy',
          lastHealthMessage: 'Ready',
          lastValidatedAt: 100,
          createdAt: 10,
          updatedAt: 11,
          executionMode: 'native',
          boundEmployeeIds: [ENG_ID],
          boundEmployeeCount: 1,
        },
      ],
    },
    routineService: {
      list: () => [
        {
          id: 'routine-1',
          companyId: COMPANY_ID,
          name: 'Daily Triage',
          slug: 'daily-triage',
          enabled: true,
          triggerKind: 'daily',
          schedule: { triggerKind: 'daily', timeOfDay: '09:00' },
          workKind: 'ticket',
          workConfig: {
            title: 'Daily queue review',
            description: 'Inspect overnight queue health.',
            assigneeId: ENG_ID,
            priority: 'medium',
            labels: ['ops'],
          },
          lastRunStatus: 'success',
          lastRunMessage: 'Created one ticket',
          lastRunAt: 200,
          nextRunAt: 300,
          createdAt: 12,
          updatedAt: 13,
        },
      ],
    },
    budgetGovernanceService: {
      listPolicies: () => [
        {
          id: 'budget-1',
          companyId: COMPANY_ID,
          scopeKind: 'company',
          scopeRefId: COMPANY_ID,
          period: 'monthly',
          hardCapUsd: '150.00',
          warningThresholdPct: 75,
          autoPause: true,
          requireApprovalAboveUsd: '100.00',
          enabled: true,
          createdAt: 14,
          updatedAt: 15,
        },
      ],
    },
    extensionsRegistry: {
      listByCompany: () => [
        {
          id: 'extension-1',
          companyId: COMPANY_ID,
          kind: 'skill',
          name: 'Ops Briefing',
          slug: 'ops-briefing',
          sourceKind: 'local',
          sourceRef: 'C:/LocalSkills/ops-briefing',
          version: '1.0.0',
          updateChannel: null,
          manifestJson: JSON.stringify({
            snapshotDir: 'C:/Users/User/AppData/Roaming/@team-x/skills/extension-1',
            promptFile: 'prompt.md',
            apiKey: 'super-secret',
          }),
          requestedCapabilitiesJson: JSON.stringify(['shell']),
          requestedPathsJson: JSON.stringify(['C:/Projects/Alpha']),
          enabled: true,
          trustState: 'trusted',
          runtimeRefId: null,
          installedAt: 16,
          updatedAt: 17,
        },
      ],
    },
    skillsService: {
      listAssignments: () => [
        {
          id: 'assignment-1',
          extensionId: 'extension-1',
          companyId: COMPANY_ID,
          employeeId: null,
          enabled: true,
          source: 'workspace-default',
          createdAt: 18,
          updatedAt: 18,
        },
      ],
    },
    authorityRepo: {
      listByCompany: () => [
        {
          id: 'grant-1',
          scopeKind: 'company',
          scopeId: COMPANY_ID,
          resourceKind: 'path',
          resourceId: 'C:/Projects/Alpha',
          permission: 'allow',
          metadataJson: JSON.stringify({
            headers: {
              Authorization: 'Bearer grant-secret',
            },
          }),
          createdAt: 19,
          updatedAt: 19,
        },
      ],
    },
    operatorAccessService: {
      ensureLocalOwnerForCompany: () => ({ operatorId: 'rocky', membershipId: 'membership-1' }),
    },
    exportRootDir,
    appVersion: '1.2.1',
    now: () => new Date('2026-04-23T18:30:00.000Z'),
  });

  return { service, companiesRepo };
}

describe('company-portability-service', () => {
  it('exports a workspace package, redacts sensitive fields, and stamps local export metadata', async () => {
    const { service, companiesRepo } = createService();

    const result = await service.exportCompany({
      companyId: COMPANY_ID,
      mode: 'workspace-export',
    });

    const raw = await readFile(result.packagePath, 'utf8');
    const parsed = JSON.parse(raw) as CompanyPackage;
    const validation = validateCompanyPackage(parsed);

    expect(validation.ok).toBe(true);
    expect(result.manifest.mode).toBe('workspace-export');
    expect(result.manifest.sections).toEqual(
      expect.arrayContaining([
        'company',
        'employees',
        'org',
        'autonomy',
        'extensions',
        'goals',
        'projects',
        'tickets',
      ]),
    );
    expect(parsed.company.settings.sharing?.lastExportedAt).toBeUndefined();
    expect(parsed.company.settings.sharing?.lastExportMode).toBeUndefined();
    expect(parsed.autonomy?.runtimeProfiles?.[0]?.config).toMatchObject({
      command: 'C:/Tools/Codex/codex.exe',
      workingDirectory: 'C:/Projects/Alpha',
      headers: PORTABILITY_REDACTED_VALUE,
    });
    expect(parsed.extensions?.extensions?.[0]?.manifest).toMatchObject({
      promptFile: 'prompt.md',
      apiKey: PORTABILITY_REDACTED_VALUE,
    });
    expect(parsed.extensions?.extensions?.[0]?.manifest).not.toHaveProperty('snapshotDir');
    expect(parsed.extensions?.authorityGrants?.[0]?.metadata).toEqual({
      headers: PORTABILITY_REDACTED_VALUE,
    });
    expect(result.manifest.redactions).toEqual(
      expect.arrayContaining([
        'company.settings.sharing.lastExportedAt',
        'company.settings.sharing.lastExportMode',
        'runtimeProfiles.runtime-1.config.headers',
        'extensions.extension-1.manifest.apiKey',
        'extensions.extension-1.manifest.snapshotDir',
        'authorityGrants.grant-1.metadata.headers',
      ]),
    );
    expect(result.manifest.compatibility).toEqual(
      expect.arrayContaining([
        'local-skills-may-require-manual-reinstall',
        'native-runtime-paths-may-require-manual-reconfiguration',
        'skill-manifests-do-not-embed-local-prompt-snapshots',
      ]),
    );

    const updatedCompany = companiesRepo.getById(COMPANY_ID);
    const updatedSettings = JSON.parse(updatedCompany?.settingsJson ?? '{}') as CompanySettings;
    expect(updatedSettings.sharing?.lastExportedAt).toBe('2026-04-23T18:30:00.000Z');
    expect(updatedSettings.sharing?.lastExportMode).toBe('workspace-export');
  });

  it('exports template mode without live ticket/project state and normalizes volatile autonomy status', async () => {
    const { service } = createService();

    const result = await service.exportCompany({
      companyId: COMPANY_ID,
      mode: 'template',
    });

    const raw = await readFile(result.packagePath, 'utf8');
    const parsed = JSON.parse(raw) as CompanyPackage;

    expect(parsed.goals).toBeUndefined();
    expect(parsed.projects).toBeUndefined();
    expect(parsed.tickets).toBeUndefined();
    expect(parsed.manifest.sections).not.toEqual(
      expect.arrayContaining(['goals', 'projects', 'tickets']),
    );
    expect(parsed.employees?.[0]?.status).toBe('idle');
    expect(parsed.autonomy?.runtimeProfiles?.[0]).toMatchObject({
      lastHealthStatus: 'unknown',
      lastHealthMessage: null,
      lastValidatedAt: null,
    });
    expect(parsed.autonomy?.routines?.[0]).toMatchObject({
      lastRunStatus: 'never',
      lastRunMessage: null,
      lastRunAt: null,
      nextRunAt: null,
    });
    expect(result.manifest.mode).toBe('template');
  });
});
