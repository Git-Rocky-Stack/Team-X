import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  loadPaperclipExportFolder,
  previewPaperclipImportBridge,
} from './paperclip-import-bridge.js';

const FIXED_NOW = new Date('2026-04-28T12:00:00.000Z');

let tempDir: string | null = null;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe('paperclip import bridge', () => {
  it('maps Paperclip agents, adapters, tasks, issues, and skills into a Team-X package preview', () => {
    const preview = previewPaperclipImportBridge(
      {
        company: {
          id: 'pc-company-1',
          name: 'Paperclip Ops',
          slug: 'paperclip-ops',
        },
        agents: [
          {
            id: 'ceo',
            name: 'Avery',
            title: 'Operator Lead',
            role: 'operations-lead',
            provider: 'anthropic',
            model: 'claude-sonnet',
            skills: ['research'],
          },
          {
            id: 'engineer',
            name: 'Jordan',
            role: 'software-engineer',
            managerId: 'ceo',
          },
        ],
        adapters: [
          {
            id: 'codex-main',
            name: 'Codex Repo Worker',
            type: 'codex',
            providerId: 'openai',
            agentIds: ['engineer'],
            config: {
              cwd: 'C:/repo',
              env: {
                OPENAI_API_KEY: 'sk-redacted',
              },
            },
          },
          {
            id: 'zapier',
            name: 'Zapier Bot',
            type: 'zapier',
          },
        ],
        tasks: [
          {
            id: 'ship-docs',
            title: 'Ship documentation',
            assigneeId: 'engineer',
            priority: 'high',
            labels: ['docs'],
          },
        ],
        issues: [
          {
            id: 'blocked-secret',
            title: 'Missing production secret',
            status: 'blocked',
            severity: 'critical',
          },
        ],
        skills: [
          {
            id: 'research',
            name: 'Research Skill',
            agentIds: ['ceo'],
            sourceRef: 'paperclip://skills/research',
          },
        ],
      },
      { now: () => FIXED_NOW },
    );

    expect(preview.counts).toEqual({
      agents: 2,
      runtimeProfiles: 1,
      tickets: 2,
      skills: 1,
      unsupportedAdapters: 1,
      missingSecrets: 1,
    });
    expect(preview.packageData.manifest.sections).toEqual(
      expect.arrayContaining(['company', 'employees', 'org', 'autonomy', 'extensions', 'tickets']),
    );
    expect(preview.packageData.employees?.map((employee) => employee.name)).toEqual([
      'Avery',
      'Jordan',
    ]);
    expect(preview.packageData.orgEdges).toEqual([
      {
        managerId: 'pc-agent-ceo',
        reportId: 'pc-agent-engineer',
      },
    ]);
    expect(preview.packageData.autonomy?.runtimeProfiles?.[0]).toEqual(
      expect.objectContaining({
        kind: 'codex',
        boundEmployeeIds: ['pc-agent-engineer'],
        lastHealthStatus: 'unknown',
      }),
    );
    expect(
      preview.packageData.autonomy?.runtimeProfiles?.[0]?.config?.env as Record<string, unknown>,
    ).toEqual({
      OPENAI_API_KEY: {
        type: 'secret_ref',
        providerId: 'openai',
        key: 'apiKey',
        version: 'runtime-secret-ref-v1',
      },
    });
    expect(preview.missingSecretRefs).toEqual([
      expect.objectContaining({
        providerId: 'openai',
        key: 'apiKey',
        bindable: true,
      }),
    ]);
    expect(preview.unsupportedAdapters).toEqual([
      expect.objectContaining({
        id: 'zapier',
        type: 'zapier',
      }),
    ]);
    expect(preview.packageData.tickets?.map((ticket) => ticket.priority)).toEqual([
      'high',
      'critical',
    ]);
    expect(preview.packageData.extensions?.skillAssignments).toEqual([
      expect.objectContaining({
        extensionId: 'pc-skill-research',
        employeeId: 'pc-agent-ceo',
      }),
    ]);
    expect(preview.importPreview.plan?.canImport).toBe(true);
  });

  it('loads Paperclip export folders split across conventional JSON files', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'teamx-paperclip-'));
    await mkdir(tempDir, { recursive: true });
    await writeFile(
      join(tempDir, 'company.json'),
      JSON.stringify({ id: 'pc-folder', name: 'Folder Export' }),
      'utf8',
    );
    await writeFile(
      join(tempDir, 'agents.json'),
      JSON.stringify([{ id: 'agent-1', name: 'Folder Agent' }]),
      'utf8',
    );
    await writeFile(
      join(tempDir, 'adapters.json'),
      JSON.stringify([{ id: 'http-1', name: 'Webhook', type: 'http' }]),
      'utf8',
    );

    const bundle = await loadPaperclipExportFolder(tempDir);
    const preview = previewPaperclipImportBridge(bundle, { now: () => FIXED_NOW });

    expect(preview.packageData.company.name).toBe('Folder Export');
    expect(preview.packageData.employees?.[0]?.name).toBe('Folder Agent');
    expect(preview.packageData.autonomy?.runtimeProfiles?.[0]?.kind).toBe('http');
    expect(preview.importPreview.source?.packagePath).toBe(tempDir);
  });
});
