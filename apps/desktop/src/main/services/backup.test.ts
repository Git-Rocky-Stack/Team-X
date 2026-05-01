/**
 * Unit tests for the pure-logic methods of `createBackupService`.
 *
 * The file-I/O paths (`create`, `restore`, `list`) are covered by the
 * `vault-backup.spec.ts` Playwright E2E against a real Electron
 * instance. This file targets `ensurePostRestoreSystemEmployees` —
 * a synchronous callback-driven sweep that has no filesystem side
 * effects and deserves a fast vitest covering the branching paths
 * (all-created, none-created, mixed, per-company throw, empty set).
 *
 * Phase 5 — M33 follow-up F4.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBackupService } from './backup.js';

describe('BackupService.ensurePostRestoreSystemEmployees', () => {
  let service: ReturnType<typeof createBackupService>;

  beforeEach(() => {
    service = createBackupService({
      dbPath: '/tmp/does-not-matter.sqlite',
      companiesBasePath: '/tmp/does-not-matter/companies',
      backupsDir: '/tmp/does-not-matter/backups',
      appVersion: '0.0.0-test',
      checkpointWal: () => {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns zero counts when no companies exist', () => {
    const result = service.ensurePostRestoreSystemEmployees({
      listCompanyIds: () => [],
      ensureSystemForCompany: () => ({ agentCreated: false, copilotCreated: false }),
    });
    expect(result.companiesScanned).toBe(0);
    expect(result.agentsCreated).toBe(0);
    expect(result.copilotsCreated).toBe(0);
    expect(result.perCompany).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('tallies zero when every ensure reports no new row (current-schema backup)', () => {
    const ensure = vi.fn(() => ({ agentCreated: false, copilotCreated: false }));
    const result = service.ensurePostRestoreSystemEmployees({
      listCompanyIds: () => ['c-1', 'c-2', 'c-3'],
      ensureSystemForCompany: ensure,
    });
    expect(ensure).toHaveBeenCalledTimes(3);
    expect(result.companiesScanned).toBe(3);
    expect(result.agentsCreated).toBe(0);
    expect(result.copilotsCreated).toBe(0);
    expect(result.perCompany).toEqual([
      { companyId: 'c-1', agentCreated: false, copilotCreated: false },
      { companyId: 'c-2', agentCreated: false, copilotCreated: false },
      { companyId: 'c-3', agentCreated: false, copilotCreated: false },
    ]);
  });

  it('tallies counts for a pre-M31 backup (every agent + copilot must be created)', () => {
    const ensure = vi.fn(() => ({ agentCreated: true, copilotCreated: true }));
    const result = service.ensurePostRestoreSystemEmployees({
      listCompanyIds: () => ['c-1', 'c-2'],
      ensureSystemForCompany: ensure,
    });
    expect(result.companiesScanned).toBe(2);
    expect(result.agentsCreated).toBe(2);
    expect(result.copilotsCreated).toBe(2);
  });

  it('tallies counts for a pre-M33 (but post-M31) backup (agents exist; copilots must be created)', () => {
    const result = service.ensurePostRestoreSystemEmployees({
      listCompanyIds: () => ['c-1', 'c-2', 'c-3'],
      // Agent rows already exist from M31; copilot rows are missing.
      ensureSystemForCompany: () => ({ agentCreated: false, copilotCreated: true }),
    });
    expect(result.agentsCreated).toBe(0);
    expect(result.copilotsCreated).toBe(3);
  });

  it('handles a mixed cohort (some companies missing one role, others both)', () => {
    const outcomes: Record<string, { agentCreated: boolean; copilotCreated: boolean }> = {
      'c-1': { agentCreated: true, copilotCreated: true }, // pre-M31
      'c-2': { agentCreated: false, copilotCreated: true }, // pre-M33
      'c-3': { agentCreated: false, copilotCreated: false }, // current
    };
    const result = service.ensurePostRestoreSystemEmployees({
      listCompanyIds: () => ['c-1', 'c-2', 'c-3'],
      ensureSystemForCompany: (cid) =>
        outcomes[cid] ?? { agentCreated: false, copilotCreated: false },
    });
    expect(result.companiesScanned).toBe(3);
    expect(result.agentsCreated).toBe(1);
    expect(result.copilotsCreated).toBe(2);
    expect(result.skipped).toEqual([]);
  });

  it('records per-company throws in skipped[] without aborting the sweep', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = service.ensurePostRestoreSystemEmployees({
      listCompanyIds: () => ['c-1', 'c-broken', 'c-3'],
      ensureSystemForCompany: (cid) => {
        if (cid === 'c-broken') {
          throw new Error('role-loader returned no spec for id "system-agent"');
        }
        return { agentCreated: true, copilotCreated: true };
      },
    });
    // Two successes + one skipped.
    expect(result.companiesScanned).toBe(3);
    expect(result.agentsCreated).toBe(2);
    expect(result.copilotsCreated).toBe(2);
    expect(result.skipped).toEqual([
      {
        companyId: 'c-broken',
        reason: 'role-loader returned no spec for id "system-agent"',
      },
    ]);
    expect(result.perCompany).toHaveLength(2);
    expect(result.perCompany.map((r) => r.companyId)).toEqual(['c-1', 'c-3']);
    // Warning logged for operator visibility.
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('coerces non-Error throws into a string reason (reason is never empty)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = service.ensurePostRestoreSystemEmployees({
      listCompanyIds: () => ['c-odd'],
      ensureSystemForCompany: () => {
        throw 'raw string throw';
      },
    });
    expect(result.skipped).toEqual([{ companyId: 'c-odd', reason: 'raw string throw' }]);
  });

  it('is idempotent — re-running on the same set yields zero-count second pass', () => {
    let agentExists = false;
    let copilotExists = false;
    const ensureOnce = () => {
      const agentCreated = !agentExists;
      const copilotCreated = !copilotExists;
      agentExists = true;
      copilotExists = true;
      return { agentCreated, copilotCreated };
    };

    const first = service.ensurePostRestoreSystemEmployees({
      listCompanyIds: () => ['c-1'],
      ensureSystemForCompany: ensureOnce,
    });
    expect(first.agentsCreated).toBe(1);
    expect(first.copilotsCreated).toBe(1);

    const second = service.ensurePostRestoreSystemEmployees({
      listCompanyIds: () => ['c-1'],
      ensureSystemForCompany: ensureOnce,
    });
    expect(second.agentsCreated).toBe(0);
    expect(second.copilotsCreated).toBe(0);
    expect(second.perCompany).toEqual([
      { companyId: 'c-1', agentCreated: false, copilotCreated: false },
    ]);
  });
});
