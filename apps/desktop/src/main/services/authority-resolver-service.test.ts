import { describe, expect, it } from 'vitest';

import { createAuthorityResolverService } from './authority-resolver-service.js';

function makeEmployee(
  overrides: Partial<{
    id: string;
    companyId: string;
    toolsAllowedJson: string;
    toolsDeniedJson: string;
  }> = {},
) {
  return {
    id: 'employee-1',
    companyId: 'company-1',
    toolsAllowedJson: '[]',
    toolsDeniedJson: '[]',
    ...overrides,
  };
}

function makeGrant(
  overrides: Partial<{
    id: string;
    scopeKind: 'company' | 'employee' | 'extension';
    scopeId: string;
    resourceKind: 'capability' | 'path';
    resourceId: string;
    permission: 'allow' | 'deny' | 'prompt';
    metadataJson: string | null;
    createdAt: number;
    updatedAt: number;
  }> = {},
) {
  return {
    id: 'grant-1',
    scopeKind: 'company' as const,
    scopeId: 'company-1',
    resourceKind: 'capability' as const,
    resourceId: 'browse',
    permission: 'allow' as const,
    metadataJson: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('createAuthorityResolverService', () => {
  it('resolves role defaults into effective tool allow/deny arrays', () => {
    const service = createAuthorityResolverService({
      employeesRepo: {
        getById: () =>
          makeEmployee({
            toolsAllowedJson: '["browse","context7"]',
            toolsDeniedJson: '["shell"]',
          }),
      },
      authorityRepo: {
        listForEmployee: () => [],
      },
    });

    const result = service.resolveEmployee('company-1', 'employee-1');

    expect(result.toolsAllowed).toEqual(['browse', 'context7']);
    expect(result.toolsDenied).toEqual(['shell']);
    expect(result.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceId: 'browse',
          permission: 'allow',
          sourceKind: 'role-default',
        }),
        expect.objectContaining({
          resourceId: 'shell',
          permission: 'deny',
          sourceKind: 'role-default',
        }),
      ]),
    );
  });

  it('applies company and employee overrides above role and extension grants', () => {
    const service = createAuthorityResolverService({
      employeesRepo: {
        getById: () =>
          makeEmployee({
            toolsAllowedJson: '["browse"]',
            toolsDeniedJson: '["shell"]',
          }),
      },
      authorityRepo: {
        listForEmployee: () => [
          makeGrant({
            id: 'extension-allow',
            scopeKind: 'extension',
            scopeId: 'ext-1',
            resourceId: 'shell',
            permission: 'allow',
          }),
          makeGrant({
            id: 'company-deny',
            scopeKind: 'company',
            scopeId: 'company-1',
            resourceId: 'browse',
            permission: 'deny',
          }),
          makeGrant({
            id: 'employee-allow',
            scopeKind: 'employee',
            scopeId: 'employee-1',
            resourceId: 'shell',
            permission: 'allow',
          }),
        ],
      },
    });

    const result = service.resolveEmployee('company-1', 'employee-1');

    expect(result.toolsAllowed).toEqual(['shell']);
    expect(result.toolsDenied).toEqual(['browse']);
    expect(result.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceId: 'browse',
          permission: 'deny',
          sourceKind: 'company',
        }),
        expect.objectContaining({
          resourceId: 'shell',
          permission: 'allow',
          sourceKind: 'employee',
        }),
      ]),
    );
  });

  it('includes path grants and preserves prompt state in the effective entries', () => {
    const service = createAuthorityResolverService({
      employeesRepo: {
        getById: () => makeEmployee(),
      },
      authorityRepo: {
        listForEmployee: () => [
          makeGrant({
            id: 'grant-path',
            scopeKind: 'company',
            scopeId: 'company-1',
            resourceKind: 'path',
            resourceId: 'C:/Projects/Alpha',
            permission: 'allow',
          }),
          makeGrant({
            id: 'grant-cap',
            scopeKind: 'employee',
            scopeId: 'employee-1',
            resourceKind: 'capability',
            resourceId: 'filesystem.write',
            permission: 'prompt',
          }),
        ],
      },
    });

    const result = service.resolveEmployee('company-1', 'employee-1');

    expect(result.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceKind: 'path',
          resourceId: 'C:/Projects/Alpha',
          permission: 'allow',
        }),
        expect.objectContaining({
          resourceKind: 'capability',
          resourceId: 'filesystem.write',
          permission: 'prompt',
        }),
      ]),
    );
  });

  it('matches Windows paths case-insensitively and prefers the most specific matching grant', () => {
    const service = createAuthorityResolverService({
      employeesRepo: {
        getById: () => makeEmployee(),
      },
      authorityRepo: {
        listForEmployee: () => [
          makeGrant({
            id: 'company-allow',
            scopeKind: 'company',
            scopeId: 'company-1',
            resourceKind: 'path',
            resourceId: 'C:/Projects/Alpha',
            permission: 'allow',
          }),
          makeGrant({
            id: 'employee-deny',
            scopeKind: 'employee',
            scopeId: 'employee-1',
            resourceKind: 'path',
            resourceId: 'C:\\Projects\\Alpha\\Secret',
            permission: 'deny',
          }),
        ],
      },
    });

    const denied = service.evaluatePath(
      'company-1',
      'employee-1',
      'c:\\projects\\ALPHA\\secret\\runbook.md',
    );
    const allowed = service.evaluatePath(
      'company-1',
      'employee-1',
      'C:/Projects/Alpha/Public/brief.md',
    );

    expect(denied.normalizedPath).toBe('c:/projects/alpha/secret/runbook.md');
    expect(denied.permission).toBe('deny');
    expect(denied.matchedEntry).toEqual(
      expect.objectContaining({
        resourceId: 'C:\\Projects\\Alpha\\Secret',
        permission: 'deny',
        sourceKind: 'employee',
      }),
    );
    expect(allowed.permission).toBe('allow');
    expect(allowed.matchedEntry).toEqual(
      expect.objectContaining({
        resourceId: 'C:/Projects/Alpha',
        permission: 'allow',
      }),
    );
  });

  it('returns inherit when no path grant matches the requested location', () => {
    const service = createAuthorityResolverService({
      employeesRepo: {
        getById: () => makeEmployee(),
      },
      authorityRepo: {
        listForEmployee: () => [
          makeGrant({
            resourceKind: 'path',
            resourceId: 'C:/Projects/Alpha',
            permission: 'allow',
          }),
        ],
      },
    });

    const result = service.evaluatePath('company-1', 'employee-1', 'D:/Elsewhere/notes.md');

    expect(result.permission).toBe('inherit');
    expect(result.matchedEntry).toBeNull();
  });

  it('enforces hard platform denies last', () => {
    const service = createAuthorityResolverService({
      employeesRepo: {
        getById: () => makeEmployee(),
      },
      authorityRepo: {
        listForEmployee: () => [
          makeGrant({
            scopeKind: 'employee',
            scopeId: 'employee-1',
            resourceId: 'shell',
            permission: 'allow',
          }),
        ],
      },
      hardDeniedCapabilities: ['shell'],
    });

    const result = service.resolveEmployee('company-1', 'employee-1');

    expect(result.toolsAllowed).toEqual([]);
    expect(result.toolsDenied).toEqual(['shell']);
    expect(result.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceId: 'shell',
          permission: 'deny',
          sourceKind: 'hard-deny',
          sourceId: 'platform',
        }),
      ]),
    );
  });

  it('rejects missing or cross-company employees', () => {
    const missing = createAuthorityResolverService({
      employeesRepo: { getById: () => null },
      authorityRepo: { listForEmployee: () => [] },
    });

    expect(() => missing.resolveEmployee('company-1', 'missing')).toThrow(/employee not found/);

    const crossCompany = createAuthorityResolverService({
      employeesRepo: {
        getById: () => makeEmployee({ companyId: 'company-2' }),
      },
      authorityRepo: { listForEmployee: () => [] },
    });

    expect(() => crossCompany.resolveEmployee('company-1', 'employee-1')).toThrow(
      /does not belong to company/,
    );
  });
});
