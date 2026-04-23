import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { companies, employees } from '../db/schema.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';
import {
  createAuthorityRepo,
  createExtensionsRepo,
  createSkillAssignmentsRepo,
} from '../db/repos/extensions.js';
import { createSkillsService } from './skills-service.js';

const COMPANY_ID = 'company-1';
const EMPLOYEE_ID = 'employee-1';

let ctx: TestDbHandle;
let tempRoot: string;
let skillsRoot: string;

beforeEach(async () => {
  ctx = await makeTestDb();
  tempRoot = await mkdtemp(join(tmpdir(), 'teamx-skills-'));
  skillsRoot = join(tempRoot, 'installed-skills');

  ctx.db.insert(companies).values({
    id: COMPANY_ID,
    name: 'Alpha',
    slug: 'alpha',
    createdAt: 1,
    settingsJson: '{}',
    icon: null,
    theme: 'dark',
    status: 'running',
  }).run();

  ctx.db.insert(employees).values({
    id: EMPLOYEE_ID,
    companyId: COMPANY_ID,
    rolePackId: 'strategia-official',
    roleId: 'ceo',
    roleMdSha: 'sha-alpha',
    level: 'officer',
    name: 'Alpha CEO',
    title: 'CEO',
    createdAt: 1,
  }).run();
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
  ctx.close();
});

async function writeLocalSkill(
  folderPath: string,
  manifest: Record<string, unknown>,
  files: Record<string, string>,
): Promise<void> {
  await mkdir(folderPath, { recursive: true });
  await writeFile(join(folderPath, 'teamx-skill.json'), JSON.stringify(manifest, null, 2), 'utf8');
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = join(folderPath, relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, contents, 'utf8');
  }
}

function createService(args?: {
  autonomyMode?: 'balanced' | 'conservative' | 'autonomous';
  fetchFn?: typeof fetch;
}) {
  const extensionsRepo = createExtensionsRepo(ctx.db);
  const skillAssignmentsRepo = createSkillAssignmentsRepo(ctx.db);
  const authorityRepo = createAuthorityRepo(ctx.db);
  const service = createSkillsService({
    extensionsRepo,
    skillAssignmentsRepo,
    authorityRepo,
    settingsRepo: {
      getExtensions: () => ({ autonomyMode: args?.autonomyMode ?? 'balanced' }),
    },
    skillsRoot,
    fetchFn: args?.fetchFn,
    log: {
      warn: vi.fn(),
    },
  });
  return { service, extensionsRepo, skillAssignmentsRepo, authorityRepo };
}

describe('skills-service', () => {
  it('installs a local skill, snapshots files, and creates pending authority requests when needed', async () => {
    const sourceDir = join(tempRoot, 'local-skill');
    await writeLocalSkill(
      sourceDir,
      {
        name: 'Ops Briefing',
        version: '1.0.0',
        description: 'Summarizes daily ops context.',
        promptFile: 'prompt.md',
        instructionFiles: ['instructions/checklist.md'],
        toolRecommendations: ['vault.search', 'tickets.list'],
        requestedCapabilities: ['shell'],
        requestedPaths: ['C:/Projects/Alpha'],
      },
      {
        'prompt.md': 'Always summarize blockers before proposing actions.',
        'instructions/checklist.md': 'Call out risks, owners, and next checkpoints.',
      },
    );

    const { service, extensionsRepo, skillAssignmentsRepo, authorityRepo } = createService();
    const result = await service.installLocal({ companyId: COMPANY_ID, folderPath: sourceDir });

    const extension = extensionsRepo.getById(result.extensionId);
    expect(extension?.kind).toBe('skill');
    expect(extension?.sourceKind).toBe('local');
    expect(extension?.enabled).toBe(true);
    expect(extension?.trustState).toBe('pending-review');

    const manifest = JSON.parse(extension?.manifestJson ?? '{}') as Record<string, unknown>;
    const snapshotDir = String(manifest.snapshotDir ?? '');
    expect(snapshotDir).toBe(join(skillsRoot, result.extensionId));
    await expect(readFile(join(snapshotDir, 'prompt.md'), 'utf8')).resolves.toContain('summarize blockers');
    await expect(
      readFile(join(snapshotDir, 'instructions', 'checklist.md'), 'utf8'),
    ).resolves.toContain('next checkpoints');

    expect(skillAssignmentsRepo.listByCompany(COMPANY_ID)).toEqual([
      expect.objectContaining({
        extensionId: result.extensionId,
        companyId: COMPANY_ID,
        employeeId: null,
        enabled: true,
        source: 'workspace-default',
      }),
    ]);

    expect(authorityRepo.listPendingByCompany(COMPANY_ID)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resourceKind: 'capability', resourceId: 'shell' }),
        expect.objectContaining({ resourceKind: 'path', resourceId: 'C:/Projects/Alpha' }),
      ]),
    );

    await expect(
      service.materializePromptBundle({ companyId: COMPANY_ID, employeeId: EMPLOYEE_ID }),
    ).resolves.toContain('Recommended tools: vault.search, tickets.list');
  });

  it('installs a GitHub-backed skill and snapshots the fetched files', async () => {
    const fileBodies = new Map<string, string>([
      [
        'ops-briefing/teamx-skill.json',
        JSON.stringify({
          name: 'GitHub Ops Briefing',
          promptFile: 'prompt.md',
          instructionFiles: ['notes.md'],
          requestedCapabilities: [],
          requestedPaths: [],
        }),
      ],
      ['ops-briefing/prompt.md', 'Use GitHub-backed instructions.'],
      ['ops-briefing/notes.md', 'Mention repo provenance explicitly.'],
    ]);

    const fetchFn: typeof fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === 'https://api.github.com/repos/acme/team-x-skills') {
        return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/acme/team-x-skills/commits/main') {
        return new Response(JSON.stringify({ sha: 'commit-sha-123' }), { status: 200 });
      }
      const match = url.match(
        /^https:\/\/api\.github\.com\/repos\/acme\/team-x-skills\/contents\/(.+)\?ref=main$/,
      );
      if (match) {
        const path = decodeURIComponent(match[1] ?? '');
        const body = fileBodies.get(path);
        if (!body) {
          return new Response(JSON.stringify({ message: 'not found' }), { status: 404 });
        }
        return new Response(
          JSON.stringify({
            type: 'file',
            encoding: 'base64',
            content: Buffer.from(body, 'utf8').toString('base64'),
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ message: 'unexpected request' }), { status: 500 });
    }) as typeof fetch;

    const { service, extensionsRepo } = createService({ fetchFn });
    const result = await service.installGithub({
      companyId: COMPANY_ID,
      sourceUrl: 'https://github.com/acme/team-x-skills/tree/main/ops-briefing',
    });

    const extension = extensionsRepo.getById(result.extensionId);
    expect(extension?.sourceKind).toBe('github');
    expect(extension?.trustState).toBe('trusted');
    const manifest = JSON.parse(extension?.manifestJson ?? '{}') as Record<string, unknown>;
    expect(manifest.owner).toBe('acme');
    expect(manifest.repo).toBe('team-x-skills');
    expect(manifest.commitSha).toBe('commit-sha-123');
    await expect(
      readFile(join(String(manifest.snapshotDir), 'notes.md'), 'utf8'),
    ).resolves.toContain('repo provenance');
  });

  it('fails a bad install without leaving partial extension rows behind', async () => {
    const sourceDir = join(tempRoot, 'broken-skill');
    await writeLocalSkill(
      sourceDir,
      {
        name: 'Broken Skill',
      },
      {},
    );

    const { service, extensionsRepo } = createService();

    await expect(
      service.installLocal({ companyId: COMPANY_ID, folderPath: sourceDir }),
    ).rejects.toThrow(/manifest\.promptFile/i);
    expect(extensionsRepo.listByCompany(COMPANY_ID)).toEqual([]);
  });

  it('surfaces a clear error when the local skill folder does not exist', async () => {
    const { service, extensionsRepo } = createService();

    await expect(
      service.installLocal({ companyId: COMPANY_ID, folderPath: join(tempRoot, 'missing-skill') }),
    ).rejects.toThrow(/\[skills\] local skill folder not found/i);

    expect(extensionsRepo.listByCompany(COMPANY_ID)).toEqual([]);
  });

  it('applies employee overrides over workspace defaults during prompt materialization', async () => {
    const skillDir = join(tempRoot, 'manual-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'alpha.md'), 'Alpha skill prompt.', 'utf8');
    await writeFile(join(skillDir, 'beta.md'), 'Beta skill prompt.', 'utf8');

    const { service, extensionsRepo, skillAssignmentsRepo } = createService();
    const alphaId = extensionsRepo.create({
      companyId: COMPANY_ID,
      kind: 'skill',
      name: 'Alpha Skill',
      slug: 'alpha-skill',
      sourceKind: 'local',
      sourceRef: skillDir,
      manifestJson: JSON.stringify({
        snapshotDir: skillDir,
        promptFile: 'alpha.md',
        instructionFiles: [],
        toolRecommendations: [],
      }),
      enabled: true,
      trustState: 'trusted',
    });
    const betaId = extensionsRepo.create({
      companyId: COMPANY_ID,
      kind: 'skill',
      name: 'Beta Skill',
      slug: 'beta-skill',
      sourceKind: 'local',
      sourceRef: skillDir,
      manifestJson: JSON.stringify({
        snapshotDir: skillDir,
        promptFile: 'beta.md',
        instructionFiles: [],
        toolRecommendations: [],
      }),
      enabled: true,
      trustState: 'trusted',
    });

    skillAssignmentsRepo.upsert({
      extensionId: alphaId,
      companyId: COMPANY_ID,
      employeeId: null,
      enabled: true,
      source: 'workspace-default',
    });
    skillAssignmentsRepo.upsert({
      extensionId: alphaId,
      companyId: COMPANY_ID,
      employeeId: EMPLOYEE_ID,
      enabled: false,
      source: 'employee-override',
    });
    skillAssignmentsRepo.upsert({
      extensionId: betaId,
      companyId: COMPANY_ID,
      employeeId: null,
      enabled: false,
      source: 'workspace-default',
    });
    skillAssignmentsRepo.upsert({
      extensionId: betaId,
      companyId: COMPANY_ID,
      employeeId: EMPLOYEE_ID,
      enabled: true,
      source: 'employee-override',
    });

    const bundle = await service.materializePromptBundle({
      companyId: COMPANY_ID,
      employeeId: EMPLOYEE_ID,
    });

    expect(bundle).not.toContain('Alpha skill prompt.');
    expect(bundle).toContain('Beta skill prompt.');
    expect(bundle).toContain('Installed Skill: Beta Skill');
  });
});
