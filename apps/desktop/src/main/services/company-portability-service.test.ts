import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';


import type { CompanyPackage, CompanySettings } from '@team-x/shared-types';
import { validateCompanyPackage } from '@team-x/shared-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBudgetsRepo } from '../db/repos/budgets.js';
import { createCompaniesRepo } from '../db/repos/companies.js';
import { createEmployeesRepo } from '../db/repos/employees.js';
import {
  createAuthorityRepo,
  createExtensionsRepo,
  createSkillAssignmentsRepo,
} from '../db/repos/extensions.js';
import { createGoalsRepo } from '../db/repos/goals.js';
import { createOrgEdgesRepo } from '../db/repos/orgchart.js';
import { createProjectsRepo } from '../db/repos/projects.js';
import { createRoutinesRepo } from '../db/repos/routines.js';
import { createRuntimeProfilesRepo } from '../db/repos/runtime-profiles.js';
import { createTicketsRepo } from '../db/repos/tickets.js';
import {
  authorityGrants,
  companies,
  employees,
  extensions,
  goals,
  orgEdges,
  projectTickets,
  projects,
  skillAssignments,
  tickets,
} from '../db/schema.js';
import type { TestDbHandle } from '../db/test-helpers.js';
import { makeTestDb } from '../db/test-helpers.js';

import {
  type CompanyPortabilityServiceDeps,
  PORTABILITY_REDACTED_VALUE,
  createCompanyPortabilityService,
} from './company-portability-service.js';

const COMPANY_ID = 'company-1';
const CEO_ID = 'employee-ceo';
const ENG_ID = 'employee-eng';
const EXTENSION_ID = 'extension-1';

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

  ctx.db
    .insert(companies)
    .values({
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
    })
    .run();

  ctx.db
    .insert(employees)
    .values([
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
    ])
    .run();

  ctx.db
    .insert(orgEdges)
    .values({
      id: 'edge-1',
      companyId: COMPANY_ID,
      managerId: CEO_ID,
      reportId: ENG_ID,
      createdAt: 4,
    })
    .run();

  ctx.db
    .insert(goals)
    .values({
      id: 'goal-1',
      companyId: COMPANY_ID,
      title: 'Scale Support',
      description: 'Reduce response time.',
      status: 'active',
      progressPct: 40,
      targetDate: null,
      createdAt: 5,
      updatedAt: 5,
    })
    .run();

  ctx.db
    .insert(projects)
    .values({
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
    })
    .run();

  ctx.db
    .insert(tickets)
    .values({
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
    })
    .run();

  ctx.db
    .insert(projectTickets)
    .values({
      projectId: 'project-1',
      ticketId: 'ticket-1',
    })
    .run();

  ctx.db
    .insert(extensions)
    .values({
      id: EXTENSION_ID,
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
      runtimeRefId: 'runtime-1',
      installedAt: 16,
      updatedAt: 17,
    })
    .run();

  ctx.db
    .insert(skillAssignments)
    .values([
      {
        id: 'assignment-1',
        extensionId: EXTENSION_ID,
        companyId: COMPANY_ID,
        employeeId: null,
        enabled: true,
        source: 'workspace-default',
        createdAt: 18,
        updatedAt: 18,
      },
      {
        id: 'assignment-2',
        extensionId: EXTENSION_ID,
        companyId: COMPANY_ID,
        employeeId: ENG_ID,
        enabled: true,
        source: 'employee-override',
        createdAt: 19,
        updatedAt: 19,
      },
    ])
    .run();

  ctx.db
    .insert(authorityGrants)
    .values([
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
        createdAt: 20,
        updatedAt: 20,
      },
      {
        id: 'grant-2',
        scopeKind: 'extension',
        scopeId: EXTENSION_ID,
        resourceKind: 'capability',
        resourceId: 'shell',
        permission: 'allow',
        metadataJson: null,
        createdAt: 21,
        updatedAt: 21,
      },
    ])
    .run();
});

afterEach(async () => {
  await rm(exportRootDir, { recursive: true, force: true });
  ctx.close();
});

function createService(overrides: Partial<CompanyPortabilityServiceDeps> = {}) {
  const companiesRepo = createCompaniesRepo(ctx.db);
  const employeesRepo = createEmployeesRepo(ctx.db);
  const orgEdgesRepo = createOrgEdgesRepo(ctx.db);
  const goalsRepo = createGoalsRepo(ctx.db);
  const projectsRepo = createProjectsRepo(ctx.db);
  const ticketsRepo = createTicketsRepo(ctx.db);
  const runtimeProfilesRepo = createRuntimeProfilesRepo(ctx.db);
  const routinesRepo = createRoutinesRepo(ctx.db);
  const budgetsRepo = createBudgetsRepo(ctx.db);
  const extensionsRepo = createExtensionsRepo(ctx.db);
  const skillAssignmentsRepo = createSkillAssignmentsRepo(ctx.db);
  const authorityRepo = createAuthorityRepo(ctx.db);
  const routineStart = vi.fn();
  const ensureSystemForCompany = vi.fn(() => ({
    agentEmployeeId: 'system-agent',
    copilotEmployeeId: 'system-copilot',
    agentCreated: true,
    copilotCreated: true,
  }));
  const service = createCompanyPortabilityService({
    companiesRepo,
    employeesRepo,
    orgEdgesRepo,
    goalsRepo,
    projectsRepo,
    ticketsRepo,
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
            env: {
              ANTHROPIC_API_KEY: {
                type: 'secret_ref',
                providerId: 'anthropic',
                key: 'apiKey',
                version: 'latest',
              },
              TEAM_X_MODE: 'autonomous',
            },
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
    runtimeProfilesRepo,
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
      start: routineStart,
    },
    routinesRepo,
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
        {
          id: 'budget-2',
          companyId: COMPANY_ID,
          scopeKind: 'employee',
          scopeRefId: ENG_ID,
          period: 'monthly',
          hardCapUsd: '60.00',
          warningThresholdPct: 70,
          autoPause: false,
          requireApprovalAboveUsd: null,
          enabled: true,
          createdAt: 16,
          updatedAt: 16,
        },
        {
          id: 'budget-3',
          companyId: COMPANY_ID,
          scopeKind: 'runtime-profile',
          scopeRefId: 'runtime-1',
          period: 'monthly',
          hardCapUsd: '80.00',
          warningThresholdPct: 80,
          autoPause: true,
          requireApprovalAboveUsd: null,
          enabled: true,
          createdAt: 17,
          updatedAt: 17,
        },
        {
          id: 'budget-4',
          companyId: COMPANY_ID,
          scopeKind: 'routine',
          scopeRefId: 'routine-1',
          period: 'monthly',
          hardCapUsd: '45.00',
          warningThresholdPct: 50,
          autoPause: false,
          requireApprovalAboveUsd: null,
          enabled: true,
          createdAt: 18,
          updatedAt: 18,
        },
      ],
    },
    budgetsRepo,
    extensionsRegistry: extensionsRepo,
    extensionsRepo,
    skillsService: {
      listAssignments: (companyId: string) =>
        skillAssignmentsRepo.listByCompany(companyId).map((assignment) => ({
          ...assignment,
        })),
    },
    skillAssignmentsRepo,
    authorityRepo,
    operatorAccessService: {
      ensureLocalOwnerForCompany: () => ({ operatorId: 'rocky', membershipId: 'membership-1' }),
    },
    ensureSystemForCompany,
    exportRootDir,
    appVersion: '2.0.0',
    now: () => new Date('2026-04-23T18:30:00.000Z'),
    ...overrides,
  });

  return {
    service,
    companiesRepo,
    employeesRepo,
    projectsRepo,
    ticketsRepo,
    runtimeProfilesRepo,
    routinesRepo,
    budgetsRepo,
    extensionsRepo,
    skillAssignmentsRepo,
    authorityRepo,
    routineStart,
    ensureSystemForCompany,
  };
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
    expect(parsed.projectTicketLinks).toEqual([
      {
        projectId: 'project-1',
        ticketId: 'ticket-1',
      },
    ]);
    expect(parsed.company.settings.sharing?.lastExportedAt).toBeUndefined();
    expect(parsed.company.settings.sharing?.lastExportMode).toBeUndefined();
    expect(parsed.autonomy?.runtimeProfiles?.[0]?.config).toMatchObject({
      command: 'C:/Tools/Codex/codex.exe',
      workingDirectory: 'C:/Projects/Alpha',
      env: {
        ANTHROPIC_API_KEY: {
          type: 'secret_ref',
          providerId: 'anthropic',
          key: 'apiKey',
          version: 'latest',
        },
        TEAM_X_MODE: 'autonomous',
      },
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
        'runtime-secret-refs-require-rebinding',
        'skill-manifests-do-not-embed-local-prompt-snapshots',
      ]),
    );
    expect(parsed.employees?.[0]?.rolePackId).toBe('strategia-official');

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
    expect(parsed.projectTicketLinks).toBeUndefined();
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
    expect(result.manifest.compatibility).toEqual(
      expect.arrayContaining([
        'native-runtime-paths-may-require-manual-reconfiguration',
        'runtime-secret-refs-require-rebinding',
        'template-runtime-profiles-require-host-validation',
      ]),
    );
    expect(result.packagePath).toMatch(/[\\/]templates[\\/]/);
  });

  it('lists locally saved templates from the template library', async () => {
    const { service } = createService();

    const exported = await service.exportCompany({
      companyId: COMPANY_ID,
      mode: 'template',
    });

    const templates = await service.listTemplates();

    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({
      packagePath: exported.packagePath,
      company: {
        name: 'Alpha Ops',
        slug: 'alpha-ops',
      },
      employeeCount: 2,
      runtimeProfileCount: 1,
      routineCount: 1,
      extensionCount: 1,
    });
  });

  it('installs an external template package into the local template library', async () => {
    const { service } = createService();

    const exported = await service.exportCompany({
      companyId: COMPANY_ID,
      mode: 'template',
    });

    const externalPackagePath = join(exportRootDir, 'external-alpha-template.teamx-package.json');
    await writeFile(externalPackagePath, await readFile(exported.packagePath, 'utf8'), 'utf8');

    const installed = await service.installTemplate({
      packagePath: externalPackagePath,
    });

    expect(installed.packagePath).toMatch(/[\\/]templates[\\/]/);
    expect(installed.packagePath).not.toBe(externalPackagePath);
    const templates = await service.listTemplates();
    expect(templates.map((template) => template.packagePath)).toEqual(
      expect.arrayContaining([exported.packagePath, installed.packagePath]),
    );
  });

  it('previews an import with local slug, secret, and compatibility warnings', async () => {
    const { service } = createService();

    const exported = await service.exportCompany({
      companyId: COMPANY_ID,
      mode: 'workspace-export',
    });

    const preview = await service.previewImport({
      packagePath: exported.packagePath,
    });

    expect(preview.manifest.packageId).toBe(exported.manifest.packageId);
    expect(preview.suggestedCompanyName).toBe('Alpha Ops');
    expect(preview.suggestedSlug).toBe('alpha-ops-imported');
    expect(preview.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/already in use locally/i),
        expect.stringMatching(/redacted fields/i),
        expect.stringMatching(/invited sharing posture/i),
        expect.stringMatching(/local skills may require manual reinstall/i),
      ]),
    );
    expect(preview.missingSecrets).toEqual(
      expect.arrayContaining([
        'authorityGrants.grant-1.metadata.headers',
        'extensions.extension-1.manifest.apiKey',
        'runtimeProfiles.runtime-1.config.env.ANTHROPIC_API_KEY',
        'runtimeProfiles.runtime-1.config.headers',
      ]),
    );
    expect(preview.runtimeProfileCount).toBe(1);
    expect(preview.runtimeProfileKinds).toEqual(['codex']);
    expect(preview.runtimeTemplateNotes).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/1 runtime profile included/i),
        expect.stringMatching(/native path/i),
        expect.stringMatching(/secret/i),
      ]),
    );
    expect(preview.missingSecretRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'runtimeProfiles.runtime-1.config.env.ANTHROPIC_API_KEY',
          providerId: 'anthropic',
          key: 'apiKey',
          bindable: true,
        }),
        expect.objectContaining({
          path: 'extensions.extension-1.manifest.apiKey',
          bindable: false,
        }),
      ]),
    );
    expect(preview.source).toMatchObject({
      kind: 'local-path',
      packagePath: exported.packagePath,
    });
    expect(preview.plan).toMatchObject({
      canImport: true,
      canInstallTemplate: false,
      totals: expect.objectContaining({
        create: expect.any(Number),
        rename: expect.any(Number),
        replace: expect.any(Number),
        skip: expect.any(Number),
      }),
    });
    expect(preview.plan?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'company',
          action: 'rename',
        }),
        expect.objectContaining({
          id: 'secret-bindings',
          action: 'replace',
        }),
      ]),
    );
  });

  it('previews and installs a template package from a GitHub shorthand ref', async () => {
    const { service } = createService();
    const exported = await service.exportCompany({
      companyId: COMPANY_ID,
      mode: 'template',
    });
    const packageJson = await readFile(exported.packagePath, 'utf8');
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => packageJson,
    }));
    const { service: remoteService } = createService({ fetch });

    const preview = await remoteService.previewImport({
      packageRef: 'rocky/team-x-templates/templates/alpha.teamx-package.json#release',
    });
    const installed = await remoteService.installTemplate({
      packageRef: 'rocky/team-x-templates@release:templates/alpha.teamx-package.json',
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/rocky/team-x-templates/release/templates/alpha.teamx-package.json',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: expect.stringContaining('application/json'),
        }),
      }),
    );
    expect(preview.source).toMatchObject({
      kind: 'github',
      owner: 'rocky',
      repo: 'team-x-templates',
      ref: 'release',
      path: 'templates/alpha.teamx-package.json',
    });
    expect(preview.plan?.canInstallTemplate).toBe(true);
    expect(installed.packagePath).toMatch(/[\\/]templates[\\/]/);
    expect(await readFile(installed.packagePath, 'utf8')).toContain('"mode": "template"');
  });

  it('imports a workspace package into a fresh company with remapped ids and preserved origins', async () => {
    const {
      service,
      companiesRepo,
      employeesRepo,
      projectsRepo,
      runtimeProfilesRepo,
      routinesRepo,
      budgetsRepo,
      extensionsRepo,
      skillAssignmentsRepo,
      authorityRepo,
      routineStart,
      ensureSystemForCompany,
    } = createService();

    const exported = await service.exportCompany({
      companyId: COMPANY_ID,
      mode: 'workspace-export',
    });

    const imported = await service.importAsNewCompany({
      packagePath: exported.packagePath,
    });

    expect(imported.companyId).not.toBe(COMPANY_ID);
    const importedCompany = companiesRepo.getById(imported.companyId);
    expect(importedCompany).toMatchObject({
      name: 'Alpha Ops',
      slug: 'alpha-ops-imported',
      workspaceOriginId: 'workspace-origin-1',
      companyOriginId: 'company-origin-1',
    });

    const importedEmployees = employeesRepo.listVisibleByCompany(imported.companyId);
    expect(importedEmployees).toHaveLength(2);
    expect(importedEmployees.map((employee) => employee.id)).not.toEqual(
      expect.arrayContaining([CEO_ID, ENG_ID]),
    );
    const importedEngineer = importedEmployees.find((employee) => employee.roleId === 'engineer');
    const importedCeo = importedEmployees.find((employee) => employee.roleId === 'ceo');
    expect(importedEngineer?.rolePackId).toBe('strategia-official');
    expect(importedEngineer?.status).toBe('idle');
    expect(importedCeo?.status).toBe('busy');

    const importedProjects = projectsRepo.listByCompany(imported.companyId);
    expect(importedProjects).toHaveLength(1);
    expect(importedProjects[0]?.goalId).not.toBe('goal-1');
    expect(importedProjects[0]?.leadId).toBe(importedEngineer?.id ?? null);
    expect(projectsRepo.listTickets(importedProjects[0].id)).toHaveLength(1);

    const runtimeProfiles = runtimeProfilesRepo.listByCompany(imported.companyId);
    expect(runtimeProfiles).toHaveLength(1);
    expect(runtimeProfiles[0]?.id).not.toBe('runtime-1');
    const runtimeBindings = runtimeProfilesRepo.listBindingsByCompany(imported.companyId);
    expect(runtimeBindings).toHaveLength(1);
    expect(runtimeBindings[0]).toMatchObject({
      employeeId: importedEngineer?.id,
      runtimeProfileId: runtimeProfiles[0]?.id,
    });

    const importedRoutines = routinesRepo.listByCompany(imported.companyId);
    expect(importedRoutines).toHaveLength(1);
    expect(importedRoutines[0]?.id).not.toBe('routine-1');
    expect(JSON.parse(importedRoutines[0]?.workConfigJson ?? '{}')).toMatchObject({
      assigneeId: importedEngineer?.id,
    });

    const policies = budgetsRepo.listPoliciesByCompany(imported.companyId);
    expect(policies).toHaveLength(4);
    expect(policies.map((policy) => policy.scopeRefId)).toEqual(
      expect.arrayContaining([
        imported.companyId,
        importedEngineer?.id ?? '',
        runtimeProfiles[0]?.id ?? '',
        importedRoutines[0]?.id ?? '',
      ]),
    );
    expect(policies.map((policy) => policy.scopeRefId)).not.toEqual(
      expect.arrayContaining([COMPANY_ID, ENG_ID, 'runtime-1', 'routine-1']),
    );

    const importedExtensions = extensionsRepo.listByCompany(imported.companyId);
    expect(importedExtensions).toHaveLength(1);
    expect(importedExtensions[0]).toMatchObject({
      companyId: imported.companyId,
      runtimeRefId: runtimeProfiles[0]?.id ?? null,
    });

    const importedAssignments = skillAssignmentsRepo.listByCompany(imported.companyId);
    expect(importedAssignments).toHaveLength(2);
    expect(importedAssignments.map((assignment) => assignment.employeeId)).toEqual(
      expect.arrayContaining([null, importedEngineer?.id ?? null]),
    );

    const importedGrants = authorityRepo.listByCompany(imported.companyId);
    expect(importedGrants).toHaveLength(2);
    expect(importedGrants.map((grant) => grant.scopeId)).toEqual(
      expect.arrayContaining([imported.companyId, importedExtensions[0]?.id ?? '']),
    );

    expect(ensureSystemForCompany).toHaveBeenCalledWith(imported.companyId);
    expect(routineStart).toHaveBeenCalledWith(imported.companyId);
  });

  it('rejects import when the package version is newer than this build supports', async () => {
    const { service } = createService();

    const exported = await service.exportCompany({
      companyId: COMPANY_ID,
      mode: 'workspace-export',
    });

    const raw = await readFile(exported.packagePath, 'utf8');
    const parsed = JSON.parse(raw) as CompanyPackage;
    parsed.manifest.packageVersion = 99;
    await rm(exported.packagePath, { force: true });
    await writeFile(exported.packagePath, JSON.stringify(parsed, null, 2), 'utf8');

    await expect(
      service.importAsNewCompany({
        packagePath: exported.packagePath,
      }),
    ).rejects.toThrow(/newer than this Team-X build supports/i);
  });
});
