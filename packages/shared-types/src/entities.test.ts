import { describe, expect, it } from 'vitest';

import {
  COMPANY_PACKAGE_MODES,
  COMPANY_PACKAGE_SECTIONS,
  LEVEL_RANK,
  getLevelRank,
  normalizeLevel,
  validateCompanyPackage,
  validateCompanyPackageManifest,
} from './entities.js';

/**
 * Unit tests for the level-rank helpers shipped in Phase 5.6 M-C step
 * d hardening (BUG-001) — `LEVEL_RANK`, `normalizeLevel`,
 * `getLevelRank`. These are pure functions with no DB / IPC / electron
 * surface so they are exhaustively pin-tested at the shared-types
 * layer; the IPC-handler-level tests assert the rule applies, the
 * helper tests assert the rule is encoded correctly.
 */

describe('LEVEL_RANK', () => {
  it('encodes the locked Phase 2 M9 hierarchy: officer most senior, ic most junior', () => {
    expect(LEVEL_RANK.officer).toBe(0);
    expect(LEVEL_RANK['senior-management']).toBe(1);
    expect(LEVEL_RANK.management).toBe(2);
    expect(LEVEL_RANK.supervisor).toBe(3);
    expect(LEVEL_RANK.lead).toBe(4);
    expect(LEVEL_RANK.ic).toBe(5);
  });

  it('strict ordering: every adjacent pair differs by exactly 1', () => {
    expect(LEVEL_RANK['senior-management'] - LEVEL_RANK.officer).toBe(1);
    expect(LEVEL_RANK.management - LEVEL_RANK['senior-management']).toBe(1);
    expect(LEVEL_RANK.supervisor - LEVEL_RANK.management).toBe(1);
    expect(LEVEL_RANK.lead - LEVEL_RANK.supervisor).toBe(1);
    expect(LEVEL_RANK.ic - LEVEL_RANK.lead).toBe(1);
  });

  it('officer is most senior (lowest rank) — pins design intent', () => {
    const ranks = Object.values(LEVEL_RANK);
    expect(Math.min(...ranks)).toBe(LEVEL_RANK.officer);
  });

  it('ic is most junior (highest rank) — pins design intent', () => {
    const ranks = Object.values(LEVEL_RANK);
    expect(Math.max(...ranks)).toBe(LEVEL_RANK.ic);
  });

  it('contains exactly 6 levels (no system pseudo-level — system rows skip the org tree)', () => {
    expect(Object.keys(LEVEL_RANK)).toHaveLength(6);
    expect(LEVEL_RANK).not.toHaveProperty('system');
  });
});

describe('normalizeLevel', () => {
  it('lowercases input', () => {
    expect(normalizeLevel('OFFICER')).toBe('officer');
    expect(normalizeLevel('Officer')).toBe('officer');
    expect(normalizeLevel('OFfIcEr')).toBe('officer');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeLevel('  ic  ')).toBe('ic');
    expect(normalizeLevel('\tlead\n')).toBe('lead');
  });

  it('collapses internal whitespace runs into single hyphens', () => {
    expect(normalizeLevel('Senior Management')).toBe('senior-management');
    expect(normalizeLevel('Senior  Management')).toBe('senior-management');
    expect(normalizeLevel('Senior   Management')).toBe('senior-management');
  });

  it('handles already-normalized inputs idempotently', () => {
    expect(normalizeLevel('officer')).toBe('officer');
    expect(normalizeLevel('senior-management')).toBe('senior-management');
    expect(normalizeLevel('ic')).toBe('ic');
  });

  it('handles tabs and mixed whitespace', () => {
    expect(normalizeLevel('senior\tmanagement')).toBe('senior-management');
    expect(normalizeLevel('senior \t management')).toBe('senior-management');
  });
});

describe('getLevelRank', () => {
  it('resolves canonical hyphenated forms to their numeric rank', () => {
    expect(getLevelRank('officer')).toBe(0);
    expect(getLevelRank('senior-management')).toBe(1);
    expect(getLevelRank('management')).toBe(2);
    expect(getLevelRank('supervisor')).toBe(3);
    expect(getLevelRank('lead')).toBe(4);
    expect(getLevelRank('ic')).toBe(5);
  });

  it('resolves capitalized + spaced forms (typical role-pack frontmatter)', () => {
    expect(getLevelRank('Officer')).toBe(0);
    expect(getLevelRank('Senior Management')).toBe(1);
    expect(getLevelRank('Management')).toBe(2);
    expect(getLevelRank('IC')).toBe(5);
  });

  it('returns null for null / undefined / empty inputs', () => {
    expect(getLevelRank(null)).toBeNull();
    expect(getLevelRank(undefined)).toBeNull();
    expect(getLevelRank('')).toBeNull();
  });

  it('returns null for unrecognized levels (fail-open contract)', () => {
    // The handler-side guard treats null as "skip the check + log a
    // dev-mode warning". This protects against role-pack additions
    // that introduce new tier names not yet known to the rank table.
    expect(getLevelRank('mystery-tier')).toBeNull();
    expect(getLevelRank('chairman')).toBeNull();
    expect(getLevelRank('intern')).toBeNull();
  });

  it('does NOT recognize "system" — system pseudo-employees are filtered before the rank check', () => {
    expect(getLevelRank('system')).toBeNull();
  });

  it('rank ordering enforces the level-inversion guard semantics', () => {
    // Strictly higher rank means MORE junior. The handler rejects
    // when rank(manager) >= rank(report). Pin the comparisons.
    expect(getLevelRank('officer')).toBeLessThan(getLevelRank('ic') ?? Number.POSITIVE_INFINITY);
    expect(getLevelRank('lead')).toBeLessThan(getLevelRank('ic') ?? Number.POSITIVE_INFINITY);
    expect(getLevelRank('management')).toBeLessThan(
      getLevelRank('lead') ?? Number.POSITIVE_INFINITY,
    );
    // Same level fails the strict guard (>=).
    expect(getLevelRank('ic')).toBe(getLevelRank('IC'));
  });
});

describe('company package validation', () => {
  const manifest = {
    packageId: 'pkg-1',
    packageVersion: 1,
    mode: 'workspace-export',
    workspaceOriginId: 'workspace-origin-1',
    companyOriginId: 'company-origin-1',
    sourceAppVersion: '1.2.1',
    exportedAt: '2026-04-23T12:00:00.000Z',
    exportedByOperatorId: 'rocky',
    sharingMode: 'local',
    sections: ['company', 'employees', 'autonomy'],
    redactions: ['providers.secrets'],
    compatibility: [],
  } as const;

  it('accepts a well-formed company package manifest', () => {
    const result = validateCompanyPackageManifest(manifest);
    expect(result).toEqual({
      ok: true,
      value: manifest,
    });
  });

  it('rejects invalid package modes and section names', () => {
    expect(
      validateCompanyPackageManifest({
        ...manifest,
        mode: 'full-backup',
      }),
    ).toEqual({
      ok: false,
      error: `manifest.mode must be one of ${COMPANY_PACKAGE_MODES.join(', ')}`,
    });

    expect(
      validateCompanyPackageManifest({
        ...manifest,
        sections: [...manifest.sections, 'history-dump'],
      }),
    ).toEqual({
      ok: false,
      error: `manifest.sections must only contain ${COMPANY_PACKAGE_SECTIONS.join(', ')}`,
    });
  });

  it('accepts a minimal well-formed company package wrapper', () => {
    const pkg = {
      manifest,
      company: {
        name: 'Strategia-X',
        slug: 'strategia-x',
        icon: null,
        theme: 'dark',
        settings: {
          mission: 'Ship',
        },
      },
    };

    expect(validateCompanyPackage(pkg)).toEqual({
      ok: true,
      value: pkg,
    });
  });

  it('rejects malformed company snapshots', () => {
    expect(
      validateCompanyPackage({
        manifest,
        company: {
          name: '',
          slug: 'strategia-x',
          icon: null,
          theme: 'dark',
          settings: {},
        },
      }),
    ).toEqual({
      ok: false,
      error: 'package.company.name must be a non-empty string',
    });

    expect(
      validateCompanyPackage({
        manifest,
        company: {
          name: 'Strategia-X',
          slug: 'strategia-x',
          icon: null,
          theme: 'dark',
          settings: 'not-an-object',
        },
      }),
    ).toEqual({
      ok: false,
      error: 'package.company.settings must be an object',
    });
  });
});
