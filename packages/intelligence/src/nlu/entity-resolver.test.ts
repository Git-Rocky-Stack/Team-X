import { describe, expect, it, vi } from 'vitest';

import type {
  Employee as EmployeeRow,
  Meeting as MeetingRow,
  RoleSpec as RoleDefinition,
  Ticket as TicketRow,
  VaultFile,
} from '@team-x/shared-types';

import {
  type EntityResolverDeps,
  type VaultFileRankedLike,
  bestTokenDistance,
  createEntityResolver,
  levenshtein,
  normalizedLevenshtein,
} from './entity-resolver.js';

/**
 * Unit tests for the M30 T2 entity resolver.
 *
 * No real SQLite, no real FTS5, no fixtures table — every test assembles
 * an in-memory `EntityResolverDeps` stub with exactly the rows the case
 * needs. This keeps the package contract (DB-agnostic) honest and the
 * tests fast and deterministic.
 */

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeEmployee(overrides: Partial<EmployeeRow> & { id: string; name: string }): EmployeeRow {
  return {
    id: overrides.id,
    companyId: overrides.companyId ?? 'company_test',
    roleId: overrides.roleId ?? 'role_ic_eng',
    roleMdSha: overrides.roleMdSha ?? 'sha1234',
    level: overrides.level ?? 'ic',
    name: overrides.name,
    title: overrides.title ?? 'Software Engineer',
    status: overrides.status ?? 'active',
    createdAt: overrides.createdAt ?? 0,
    ...overrides,
  };
}

function makeTicket(overrides: Partial<TicketRow> & { id: string; title: string }): TicketRow {
  return {
    id: overrides.id,
    companyId: overrides.companyId ?? 'company_test',
    title: overrides.title,
    description: overrides.description ?? 'desc',
    status: overrides.status ?? 'open',
    priority: overrides.priority ?? 'p2',
    assigneeId: overrides.assigneeId ?? null,
    reporterId: overrides.reporterId ?? 'rocky',
    reporterKind: overrides.reporterKind ?? 'human',
    labelsJson: overrides.labelsJson ?? '[]',
    dependenciesJson: overrides.dependenciesJson ?? '[]',
    slaHours: overrides.slaHours ?? null,
    dueAt: overrides.dueAt ?? null,
    threadId: overrides.threadId ?? null,
    createdAt: overrides.createdAt ?? 0,
    updatedAt: overrides.updatedAt ?? 0,
    closedAt: overrides.closedAt ?? null,
  };
}

function makeVaultFile(
  overrides: Partial<VaultFile> & { id: string; originalName: string },
): VaultFile {
  return {
    id: overrides.id,
    companyId: overrides.companyId ?? 'company_test',
    filename: overrides.filename ?? `${overrides.id}.bin`,
    originalName: overrides.originalName,
    mimeType: overrides.mimeType ?? 'application/octet-stream',
    sizeBytes: overrides.sizeBytes ?? 0,
    sha256: overrides.sha256 ?? 'sha-0',
    tags: overrides.tags ?? [],
    uploadedBy: overrides.uploadedBy ?? 'rocky',
    createdAt: overrides.createdAt ?? 0,
    updatedAt: overrides.updatedAt ?? 0,
  };
}

function makeRole(
  overrides: Partial<RoleDefinition['frontmatter']> & { id: string; name: string },
): RoleDefinition {
  return {
    frontmatter: {
      id: overrides.id,
      name: overrides.name,
      level: overrides.level ?? 'ic',
      reports_to: overrides.reports_to ?? [],
      manages: overrides.manages ?? [],
      preferred_model_tier: overrides.preferred_model_tier ?? 'mid',
      preferred_providers: overrides.preferred_providers ?? [],
      fallback_providers: overrides.fallback_providers ?? [],
      tools_allowed: overrides.tools_allowed ?? [],
      tools_denied: overrides.tools_denied ?? [],
      decision_authority: overrides.decision_authority ?? 'delegated',
      escalates_to: overrides.escalates_to ?? [],
      kpis: overrides.kpis ?? [],
      temperature: overrides.temperature ?? 0.5,
      license: overrides.license ?? 'MIT',
      author: overrides.author ?? 'strategia',
      version: overrides.version ?? '1.0.0',
    },
    body: '# body',
    sourcePath: '/fake',
    sha256: 'sha-role',
  };
}

function makeMeeting(
  overrides: Partial<MeetingRow> & { id: string; agenda: string },
): MeetingRow {
  return {
    id: overrides.id,
    companyId: overrides.companyId ?? 'company_test',
    threadId: overrides.threadId ?? 'thread_1',
    chairId: overrides.chairId ?? 'emp_1',
    agenda: overrides.agenda,
    mode: overrides.mode ?? 'round-robin',
    status: overrides.status ?? 'active',
    minutesMd: overrides.minutesMd ?? null,
    attendees: overrides.attendees ?? ['emp_1'],
    actionItems: overrides.actionItems ?? [],
    startedAt: overrides.startedAt ?? 0,
    endedAt: overrides.endedAt ?? null,
  };
}

function stubDeps(overrides: Partial<EntityResolverDeps> = {}): EntityResolverDeps {
  return {
    listEmployees: overrides.listEmployees ?? vi.fn(async () => []),
    getTicketById: overrides.getTicketById ?? vi.fn(async () => null),
    searchTickets: overrides.searchTickets ?? vi.fn(async () => []),
    searchVault: overrides.searchVault ?? vi.fn(async () => []),
    listRoles: overrides.listRoles ?? vi.fn(async () => []),
    listMeetings: overrides.listMeetings ?? vi.fn(async () => []),
    getActiveMeeting: overrides.getActiveMeeting ?? vi.fn(async () => null),
  };
}

// ---------------------------------------------------------------------------
// Levenshtein helper — table-driven
// ---------------------------------------------------------------------------

describe('levenshtein', () => {
  const cases: Array<{ a: string; b: string; expected: number; label: string }> = [
    { a: 'cat', b: 'cat', expected: 0, label: 'exact match is 0' },
    { a: 'cat', b: 'bat', expected: 1, label: 'single substitution' },
    { a: 'cat', b: 'cats', expected: 1, label: 'off-by-one insertion' },
    { a: 'hello', b: 'helo', expected: 1, label: 'off-by-one deletion' },
    { a: 'abc', b: 'acb', expected: 2, label: 'transposition is 2 edits' },
    { a: '', b: '', expected: 0, label: 'two empty strings are 0' },
    { a: '', b: 'abc', expected: 3, label: 'empty → non-empty is length' },
    { a: 'abc', b: '', expected: 3, label: 'non-empty → empty is length' },
    { a: 'kitten', b: 'sitting', expected: 3, label: 'classic kitten/sitting' },
    { a: 'résumé', b: 'resume', expected: 2, label: 'unicode accents count per code unit' },
  ];
  for (const { a, b, expected, label } of cases) {
    it(`distance(${JSON.stringify(a)}, ${JSON.stringify(b)}) = ${expected} (${label})`, () => {
      expect(levenshtein(a, b)).toBe(expected);
      // Symmetry: levenshtein is order-invariant.
      expect(levenshtein(b, a)).toBe(expected);
    });
  }

  it('normalizedLevenshtein returns 0 when both strings are empty', () => {
    expect(normalizedLevenshtein('', '')).toBe(0);
  });

  it('normalizedLevenshtein is bounded in [0, 1]', () => {
    expect(normalizedLevenshtein('abc', 'xyz')).toBeCloseTo(1, 5);
    expect(normalizedLevenshtein('abc', 'abc')).toBe(0);
    expect(normalizedLevenshtein('cat', 'bat')).toBeCloseTo(1 / 3, 5);
  });

  it('bestTokenDistance picks the best-scoring token in the haystack', () => {
    // "Sarah" against "Sarah Chen" should find the token "sarah" and
    // score 0, even though the full-string distance is much worse.
    expect(bestTokenDistance('sarah', 'sarah chen')).toBe(0);
    expect(bestTokenDistance('chen', 'sarah chen')).toBe(0);
    // With no tokens, falls back to the full-string distance.
    expect(bestTokenDistance('foo', 'bar')).toBeCloseTo(1, 5);
  });
});

// ---------------------------------------------------------------------------
// Employee resolver
// ---------------------------------------------------------------------------

describe('resolveEmployee', () => {
  it('returns unique on a token match against a single employee', async () => {
    const sarah = makeEmployee({ id: 'emp_1', name: 'Sarah Chen' });
    const james = makeEmployee({ id: 'emp_2', name: 'James Patel' });
    const resolver = createEntityResolver(stubDeps({ listEmployees: async () => [sarah, james] }));

    const result = await resolver.resolveEmployee('Sarah', 'company_test');
    expect(result.kind).toBe('unique');
    if (result.kind === 'unique') {
      expect(result.value.id).toBe('emp_1');
    }
  });

  it('returns ambiguous when two Sarahs both match a token', async () => {
    const sarahChen = makeEmployee({ id: 'emp_1', name: 'Sarah Chen' });
    const sarahPatel = makeEmployee({ id: 'emp_2', name: 'Sarah Patel' });
    const james = makeEmployee({ id: 'emp_3', name: 'James Kim' });
    const resolver = createEntityResolver(
      stubDeps({ listEmployees: async () => [sarahChen, sarahPatel, james] }),
    );

    const result = await resolver.resolveEmployee('sarah', 'company_test');
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      const ids = result.candidates.map((c) => c.id).sort();
      expect(ids).toEqual(['emp_1', 'emp_2']);
    }
  });

  it('returns not_found when no employee matches even fuzzily', async () => {
    const sarah = makeEmployee({ id: 'emp_1', name: 'Sarah Chen' });
    const resolver = createEntityResolver(stubDeps({ listEmployees: async () => [sarah] }));

    const result = await resolver.resolveEmployee('Zephyrion', 'company_test');
    expect(result.kind).toBe('not_found');
  });

  it('falls through to fuzzy match when no exact token hit exists', async () => {
    // "Sarha" is a typo for "Sarah" — one substitution inside the token.
    const sarah = makeEmployee({ id: 'emp_1', name: 'Sarah Chen' });
    const james = makeEmployee({ id: 'emp_2', name: 'James Patel' });
    const resolver = createEntityResolver(stubDeps({ listEmployees: async () => [sarah, james] }));

    const result = await resolver.resolveEmployee('Sarha', 'company_test');
    expect(result.kind).toBe('unique');
    if (result.kind === 'unique') {
      expect(result.value.id).toBe('emp_1');
    }
  });

  it('returns not_found when the employee list is empty', async () => {
    const resolver = createEntityResolver(stubDeps({ listEmployees: async () => [] }));
    const result = await resolver.resolveEmployee('Sarah', 'company_test');
    expect(result.kind).toBe('not_found');
  });

  it('treats whitespace-only input as not_found', async () => {
    const resolver = createEntityResolver(
      stubDeps({ listEmployees: async () => [makeEmployee({ id: 'emp_1', name: 'Sarah' })] }),
    );
    const result = await resolver.resolveEmployee('   ', 'company_test');
    expect(result.kind).toBe('not_found');
  });
});

// ---------------------------------------------------------------------------
// Ticket resolver
// ---------------------------------------------------------------------------

describe('resolveTicket', () => {
  it('resolves "#42" via the direct id path and skips FTS5', async () => {
    const ticket = makeTicket({ id: '42', title: 'Login 500s' });
    const getTicketById = vi.fn(async (id: string) => (id === '42' ? ticket : null));
    const searchTickets = vi.fn(async () => [] as TicketRow[]);

    const resolver = createEntityResolver(stubDeps({ getTicketById, searchTickets }));
    const result = await resolver.resolveTicket('#42', 'company_test');

    expect(result.kind).toBe('unique');
    expect(getTicketById).toHaveBeenCalledWith('42', 'company_test');
    expect(searchTickets).not.toHaveBeenCalled();
  });

  it('also accepts the bare numeric form "42"', async () => {
    const ticket = makeTicket({ id: '42', title: 'Login 500s' });
    const resolver = createEntityResolver(
      stubDeps({ getTicketById: async (id: string) => (id === '42' ? ticket : null) }),
    );
    const result = await resolver.resolveTicket('42', 'company_test');
    expect(result.kind).toBe('unique');
  });

  it('routes a text query through searchTickets (FTS5 stub)', async () => {
    const t = makeTicket({ id: '7', title: 'auth service returns 500 on login' });
    const searchTickets = vi.fn(async () => [t]);
    const resolver = createEntityResolver(stubDeps({ searchTickets }));

    const result = await resolver.resolveTicket('auth bug', 'company_test');
    expect(searchTickets).toHaveBeenCalledWith('auth bug', 'company_test');
    expect(result.kind).toBe('unique');
  });

  it('returns ambiguous when searchTickets yields multiple results', async () => {
    const t1 = makeTicket({ id: '1', title: 'auth bug on login' });
    const t2 = makeTicket({ id: '2', title: 'auth token refresh fails' });
    const resolver = createEntityResolver(stubDeps({ searchTickets: async () => [t1, t2] }));

    const result = await resolver.resolveTicket('auth', 'company_test');
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.candidates.map((c) => c.id)).toEqual(['1', '2']);
    }
  });

  it('returns not_found when id lookup misses', async () => {
    const resolver = createEntityResolver(stubDeps({ getTicketById: async () => null }));
    const result = await resolver.resolveTicket('#9999', 'company_test');
    expect(result.kind).toBe('not_found');
  });

  it('returns not_found when FTS5 search yields nothing', async () => {
    const resolver = createEntityResolver(stubDeps({ searchTickets: async () => [] }));
    const result = await resolver.resolveTicket('no-such-thing', 'company_test');
    expect(result.kind).toBe('not_found');
  });
});

// ---------------------------------------------------------------------------
// Vault resolver
// ---------------------------------------------------------------------------

describe('resolveVaultFile', () => {
  it('returns unique when a single FTS5 hit comes back', async () => {
    const file = makeVaultFile({ id: 'f1', originalName: 'api-spec.md' });
    const resolver = createEntityResolver(
      stubDeps({ searchVault: async () => [{ file, rank: -5 }] }),
    );
    const result = await resolver.resolveVaultFile('api spec', 'company_test');
    expect(result.kind).toBe('unique');
    if (result.kind === 'unique') {
      expect(result.value.id).toBe('f1');
    }
  });

  it('returns unique when the top hit has a clear rank margin (BM25 negative scale)', async () => {
    const files: VaultFileRankedLike[] = [
      { file: makeVaultFile({ id: 'f1', originalName: 'api-spec.md' }), rank: -10 },
      { file: makeVaultFile({ id: 'f2', originalName: 'api-overview.md' }), rank: -3 },
    ];
    const resolver = createEntityResolver(stubDeps({ searchVault: async () => files }));
    const result = await resolver.resolveVaultFile('api', 'company_test');
    expect(result.kind).toBe('unique');
    if (result.kind === 'unique') {
      expect(result.value.id).toBe('f1');
    }
  });

  it('returns ambiguous when top results have close ranks', async () => {
    const files: VaultFileRankedLike[] = [
      { file: makeVaultFile({ id: 'f1', originalName: 'api-spec.md' }), rank: -5 },
      { file: makeVaultFile({ id: 'f2', originalName: 'api-overview.md' }), rank: -4.5 },
      { file: makeVaultFile({ id: 'f3', originalName: 'api-README.md' }), rank: -4 },
    ];
    const resolver = createEntityResolver(stubDeps({ searchVault: async () => files }));
    const result = await resolver.resolveVaultFile('api', 'company_test');
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.candidates.map((c) => c.id)).toEqual(['f1', 'f2', 'f3']);
    }
  });

  it('returns not_found when searchVault returns nothing', async () => {
    const resolver = createEntityResolver(stubDeps({ searchVault: async () => [] }));
    const result = await resolver.resolveVaultFile('no such file', 'company_test');
    expect(result.kind).toBe('not_found');
  });

  it('caps ambiguous candidates at 5', async () => {
    const files: VaultFileRankedLike[] = Array.from({ length: 8 }, (_, i) => ({
      file: makeVaultFile({ id: `f${i}`, originalName: `doc${i}.md` }),
      // All ranks within 10% of each other → no clear margin.
      rank: -5 - i * 0.1,
    }));
    const resolver = createEntityResolver(stubDeps({ searchVault: async () => files }));
    const result = await resolver.resolveVaultFile('doc', 'company_test');
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.candidates.length).toBe(5);
    }
  });
});

// ---------------------------------------------------------------------------
// Role resolver
// ---------------------------------------------------------------------------

describe('resolveRole', () => {
  it('matches a role by exact (case-insensitive) name', async () => {
    const cto = makeRole({ id: 'cto', name: 'Chief Technology Officer', level: 'officer' });
    const swe = makeRole({ id: 'ic_swe', name: 'Senior Software Engineer', level: 'ic' });
    const resolver = createEntityResolver(stubDeps({ listRoles: async () => [cto, swe] }));

    const result = await resolver.resolveRole('chief technology officer');
    expect(result.kind).toBe('unique');
    if (result.kind === 'unique') {
      expect(result.value.frontmatter.id).toBe('cto');
    }
  });

  it('matches a role fuzzily across name tokens', async () => {
    const swe = makeRole({ id: 'ic_swe_senior', name: 'Senior Backend Engineer', level: 'ic' });
    const fe = makeRole({ id: 'ic_fe', name: 'Frontend Engineer', level: 'ic' });
    const resolver = createEntityResolver(stubDeps({ listRoles: async () => [swe, fe] }));

    const result = await resolver.resolveRole('backend');
    expect(result.kind).toBe('unique');
    if (result.kind === 'unique') {
      expect(result.value.frontmatter.id).toBe('ic_swe_senior');
    }
  });

  it('returns ambiguous when two roles share an exact level match', async () => {
    const fe = makeRole({ id: 'ic_fe', name: 'Frontend Engineer', level: 'ic' });
    const be = makeRole({ id: 'ic_be', name: 'Backend Engineer', level: 'ic' });
    const resolver = createEntityResolver(stubDeps({ listRoles: async () => [fe, be] }));

    const result = await resolver.resolveRole('ic');
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.candidates.length).toBe(2);
    }
  });

  it('returns not_found when no role matches', async () => {
    const fe = makeRole({ id: 'ic_fe', name: 'Frontend Engineer', level: 'ic' });
    const resolver = createEntityResolver(stubDeps({ listRoles: async () => [fe] }));

    const result = await resolver.resolveRole('xylophonist');
    expect(result.kind).toBe('not_found');
  });

  it('returns not_found when the role list is empty', async () => {
    const resolver = createEntityResolver(stubDeps({ listRoles: async () => [] }));
    const result = await resolver.resolveRole('cto');
    expect(result.kind).toBe('not_found');
  });
});

// ---------------------------------------------------------------------------
// Meeting resolver
// ---------------------------------------------------------------------------

describe('resolveMeeting', () => {
  it('matches a meeting by exact agenda', async () => {
    const q2 = makeMeeting({ id: 'mtg-q2', agenda: 'All Hands Q2' });
    const resolver = createEntityResolver(stubDeps({ listMeetings: async () => [q2] }));

    const result = await resolver.resolveMeeting('all hands q2', 'company_test');
    expect(result.kind).toBe('unique');
    if (result.kind === 'unique') {
      expect(result.value.id).toBe('mtg-q2');
    }
  });

  it('returns ambiguous when two meetings share a matching agenda token', async () => {
    const q2 = makeMeeting({ id: 'mtg-q2', agenda: 'All Hands Q2' });
    const q3 = makeMeeting({ id: 'mtg-q3', agenda: 'All Hands Q3' });
    const resolver = createEntityResolver(stubDeps({ listMeetings: async () => [q2, q3] }));

    const result = await resolver.resolveMeeting('all hands', 'company_test');
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.candidates.map((meeting) => meeting.id)).toEqual(['mtg-q2', 'mtg-q3']);
    }
  });

  it('accepts active-meeting aliases via resolveMeeting', async () => {
    const active = makeMeeting({ id: 'mtg-active', agenda: 'Executive Review' });
    const resolver = createEntityResolver(
      stubDeps({
        listMeetings: async () => [active],
        getActiveMeeting: async () => active,
      }),
    );

    const result = await resolver.resolveMeeting('current meeting', 'company_test');
    expect(result.kind).toBe('unique');
    if (result.kind === 'unique') {
      expect(result.value.id).toBe('mtg-active');
    }
  });
});

describe('resolveActiveMeeting', () => {
  it('returns unique when an active meeting exists', async () => {
    const active = makeMeeting({ id: 'mtg-active', agenda: 'Executive Review' });
    const resolver = createEntityResolver(
      stubDeps({
        getActiveMeeting: async () => active,
      }),
    );

    const result = await resolver.resolveActiveMeeting('company_test');
    expect(result.kind).toBe('unique');
    if (result.kind === 'unique') {
      expect(result.value.id).toBe('mtg-active');
    }
  });

  it('returns not_found when there is no active meeting', async () => {
    const resolver = createEntityResolver(stubDeps({ getActiveMeeting: async () => null }));
    const result = await resolver.resolveActiveMeeting('company_test');
    expect(result.kind).toBe('not_found');
  });
});
