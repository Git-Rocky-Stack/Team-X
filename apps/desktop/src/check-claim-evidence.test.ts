// Phase 5.6 M-E S2 + S3 — positive-control unit tests for the claim-evidence engine.
//
// Tests target the PURE parsing + summarization functions exported from
// scripts/check-claim-evidence.mjs. The side-effect runner (gitGrep, file IO,
// CLI exit) is exercised end-to-end by the conformance.yml CI gate itself —
// the safeguard's first proof is its own M-E atomic commit running clean.
//
// Located under apps/desktop/src/ (not scripts/) because vitest's workspace
// includes packages/* + apps/* but not scripts/. Same convention used by
// e2e-regression-guards.test.ts (M35 T9). Imports the .mjs engine as ESM.

import { describe, expect, it } from 'vitest';

// @ts-expect-error — .mjs script with implicit module resolution; vitest resolves at runtime.
import {
  applyAllowlist,
  assertClaimsParsed,
  filterByStagedDiff,
  formatStepSummary,
  parseBusEvents,
  parseEndpointChannels,
  parseIpcChannels,
  summarize,
} from '../../../scripts/check-claim-evidence.mjs';

describe('parseEndpointChannels', () => {
  it('returns [] for empty input or a doc without a Request Channels section', () => {
    expect(parseEndpointChannels('')).toEqual([]);
    // @ts-expect-error — guard non-string input.
    expect(parseEndpointChannels(undefined)).toEqual([]);
    expect(parseEndpointChannels('# API\n\n## Overview\n\nProse.')).toEqual([]);
  });

  it('parses channel-first rows and derives the namespace from the literal', () => {
    const md = [
      '## Request Channels',
      '',
      '### Companies',
      '',
      '| Channel | Request | Response |',
      '|---------|---------|----------|',
      '| `companies.list` | — | `Company[]` |',
      '| `companies.create` | `CompaniesCreateRequest` | `{ companyId: string }` |',
      '',
      '## Event Channel',
    ].join('\n');
    expect(parseEndpointChannels(md)).toEqual([
      { namespace: 'companies', channel: 'companies.list' },
      { namespace: 'companies', channel: 'companies.create' },
    ]);
  });

  it('accepts multi-segment channels such as localGguf.pool.load', () => {
    const md = [
      '## Request Channels',
      '| Channel | Request | Response |',
      '|---|---|---|',
      '| `localGguf.pool.load` | `{ modelId: string }` | — |',
    ].join('\n');
    expect(parseEndpointChannels(md)).toEqual([
      { namespace: 'localGguf', channel: 'localGguf.pool.load' },
    ]);
  });

  it('expands a family row into one claim per backticked verb', () => {
    const md = [
      '## Request Channels',
      '| Family | Channels | Purpose |',
      '|--------|----------|---------|',
      '| `localGguf.endpoint.*` | `list`, `add`, `remove` | LAN endpoints |',
    ].join('\n');
    expect(parseEndpointChannels(md).map((c) => c.channel)).toEqual([
      'localGguf.endpoint.list',
      'localGguf.endpoint.add',
      'localGguf.endpoint.remove',
    ]);
  });

  it('ignores rows outside the Request Channels section and non-channel cells', () => {
    const md = [
      '## Request Channels',
      '| Channel | Request | Response |',
      '|---|---|---|',
      '| `tickets.list` | — | `Ticket[]` |',
      '| not-a-channel | — | — |',
      '| `apps/desktop/src/main/index.ts` | — | — |',
      '## Event Channel',
      '| `events.dashboard` | — | — |',
    ].join('\n');
    expect(parseEndpointChannels(md)).toEqual([{ namespace: 'tickets', channel: 'tickets.list' }]);
  });
});

describe('filterByStagedDiff', () => {
  const claims = [
    { claim: 'companies.list' },
    { claim: 'localGguf.pool.load' },
    { claim: 'localGguf.hf.search' },
    { claim: 'localGguf.hf.modelCard' },
  ];

  it('returns [] for an empty diff', () => {
    expect(filterByStagedDiff(claims, '')).toEqual([]);
  });

  it('keeps only claims on added lines, including camelCase namespaces', () => {
    const diff = [
      '+++ b/API_ENDPOINTS.md',
      '+| `localGguf.pool.load` | `{ modelId: string }` | — |',
      '-| `companies.list` | — | `Company[]` |',
    ].join('\n');
    expect(filterByStagedDiff(claims, diff)).toEqual([{ claim: 'localGguf.pool.load' }]);
  });

  it('stages every verb under a touched family row', () => {
    const diff = '+| `localGguf.hf.*` | `search`, `modelCard` | Hugging Face |';
    expect(filterByStagedDiff(claims, diff).map((c) => c.claim)).toEqual([
      'localGguf.hf.search',
      'localGguf.hf.modelCard',
    ]);
  });
});

describe('assertClaimsParsed', () => {
  // The gate went silent once already: CLAUDE.md lost its IPC table and the
  // engine kept reporting "0 verified … out of 0" with exit 0, so a CI check
  // listed as a merge gate verified nothing. Zero parsed claims is an engine
  // error, never a pass.
  it('throws when the claim set is empty', () => {
    expect(() => assertClaimsParsed(0)).toThrow(/zero claims/);
  });

  it('accepts a non-empty claim set', () => {
    expect(() => assertClaimsParsed(1)).not.toThrow();
  });
});

describe('parseIpcChannels', () => {
  it('returns [] for empty input', () => {
    expect(parseIpcChannels('')).toEqual([]);
    // @ts-expect-error — guard non-string input.
    expect(parseIpcChannels(undefined)).toEqual([]);
  });

  it('returns [] when no IPC channels section is present', () => {
    const text = '# Random doc\n\nSome content.';
    expect(parseIpcChannels(text)).toEqual([]);
  });

  it('parses a single namespace + channel row', () => {
    const md = [
      '# Doc',
      '',
      '## IPC channels (Phase 2)',
      '',
      '| Namespace | Channel | Description |',
      '|-----------|---------|-------------|',
      '| companies | `companies.list` | List companies |',
      '',
      '## Next section',
    ].join('\n');
    expect(parseIpcChannels(md)).toEqual([{ namespace: 'companies', channel: 'companies.list' }]);
  });

  it('inherits last namespace for continuation rows', () => {
    const md = [
      '# Doc',
      '',
      '## IPC channels',
      '',
      '| Namespace | Channel | Description |',
      '|-----------|---------|-------------|',
      '| chat | `chat.send` | Send |',
      '|  | `chat.list` | List |',
      '|  | `chat.resolveThread` | Get thread |',
      '',
    ].join('\n');
    const out = parseIpcChannels(md);
    expect(out).toHaveLength(3);
    expect(out.every((r) => r.namespace === 'chat')).toBe(true);
    expect(out.map((r) => r.channel)).toEqual(['chat.send', 'chat.list', 'chat.resolveThread']);
  });

  it('skips header + separator rows', () => {
    const md = [
      '## IPC channels',
      '| Namespace | Channel | Description |',
      '|---|---|---|',
      '| events | `events.list` | List |',
    ].join('\n');
    const out = parseIpcChannels(md);
    expect(out).toEqual([{ namespace: 'events', channel: 'events.list' }]);
  });

  it('skips rows without a dotted channel name', () => {
    const md = [
      '## IPC channels',
      '| Namespace | Channel | Description |',
      '|---|---|---|',
      '| companies | not-dotted | Bad row |',
      '| companies | `companies.list` | Good row |',
    ].join('\n');
    const out = parseIpcChannels(md);
    expect(out).toEqual([{ namespace: 'companies', channel: 'companies.list' }]);
  });

  it('strips backticks from channel cell', () => {
    const md = [
      '## IPC channels',
      '| Namespace | Channel | Description |',
      '|---|---|---|',
      '| copilot | `copilot.ask` | Ask |',
    ].join('\n');
    expect(parseIpcChannels(md)[0].channel).toBe('copilot.ask');
  });

  it('only parses the first IPC channels section before next h2', () => {
    const md = [
      '## IPC channels',
      '| Namespace | Channel | Description |',
      '|---|---|---|',
      '| a | `a.b` | x |',
      '## Bus events',
      '| ns | `c.d` | next-section row should be ignored by IPC parser |',
    ].join('\n');
    const out = parseIpcChannels(md);
    expect(out).toEqual([{ namespace: 'a', channel: 'a.b' }]);
  });
});

describe('parseBusEvents', () => {
  it('returns [] for empty input', () => {
    expect(parseBusEvents('')).toEqual([]);
  });

  it('parses bus events table after the trigger header', () => {
    const md = [
      'Some intro paragraph.',
      '',
      'Bus events added in Phase 5 (not IPC):',
      '',
      '| Event | Emitted by | Milestone | Payload |',
      '|---|---|---|---|',
      '| `agent.step` | AgenticLoopService | M31 | {...} |',
      '| `agentic.completed` | AgenticLoopService | M31 | {...} |',
      '',
    ].join('\n');
    expect(parseBusEvents(md)).toEqual([{ event: 'agent.step' }, { event: 'agentic.completed' }]);
  });

  it('skips wildcard event names', () => {
    const md = [
      'Bus events added in Phase 5:',
      '',
      '| Event | Emitted by | Milestone | Payload |',
      '|---|---|---|---|',
      '| `rag.index.*` | rag-indexer | M28 | {...} |',
      '| `agent.step` | loop | M31 | {...} |',
    ].join('\n');
    expect(parseBusEvents(md)).toEqual([{ event: 'agent.step' }]);
  });
});

describe('applyAllowlist', () => {
  const baseResults = [
    { kind: 'ipc', claim: 'companies.create', expectedLocation: 'x', evidence: [], status: 'fail' },
    {
      kind: 'ipc',
      claim: 'employees.list',
      expectedLocation: 'x',
      evidence: ['handlers.ts'],
      status: 'pass',
    },
    { kind: 'ipc', claim: 'orgchart.get', expectedLocation: 'x', evidence: [], status: 'fail' },
  ];

  it('marks unmatched results as not allowed', () => {
    const out = applyAllowlist(baseResults, []);
    expect(out.every((r) => r.allowed === false)).toBe(true);
  });

  it('flags allowlisted claims with their reason + audit row', () => {
    const allowlist = [
      { claim: 'companies.create', auditRow: '10.12', disposition: 'restore', reason: 'Cluster A' },
    ];
    const out = applyAllowlist(baseResults, allowlist);
    const c = out.find((r) => r.claim === 'companies.create');
    expect(c?.allowed).toBe(true);
    expect(c?.auditRow).toBe('10.12');
    expect(c?.disposition).toBe('restore');
    expect(c?.allowReason).toBe('Cluster A');
    expect(out.find((r) => r.claim === 'orgchart.get')?.allowed).toBe(false);
  });

  it('tolerates a non-array allowlist (defensive)', () => {
    // @ts-expect-error — defensive narrowing case.
    const out = applyAllowlist(baseResults, null);
    expect(out.every((r) => r.allowed === false)).toBe(true);
  });
});

describe('summarize', () => {
  it('counts pass / allowed-fail / unallowed-fail correctly', () => {
    const results = [
      { status: 'pass', allowed: false },
      { status: 'pass', allowed: false },
      { status: 'fail', allowed: true },
      { status: 'fail', allowed: false },
      { status: 'fail', allowed: false },
    ];
    expect(summarize(results)).toEqual({ total: 5, pass: 2, allowedFail: 1, unallowedFail: 2 });
  });

  it('returns zeros for an empty input', () => {
    expect(summarize([])).toEqual({ total: 0, pass: 0, allowedFail: 0, unallowedFail: 0 });
  });
});

describe('formatStepSummary', () => {
  it('renders the headline counts', () => {
    const out = formatStepSummary([
      { status: 'pass', allowed: false, claim: 'a.b', expectedLocation: 'x' },
    ]);
    expect(out).toContain('# Claim-Evidence Conformance Audit');
    expect(out).toContain('Total claims checked: **1**');
    expect(out).toContain('Verified on disk: **1**');
  });

  it('lists unallowed gaps in their own table', () => {
    const out = formatStepSummary([
      {
        status: 'fail',
        allowed: false,
        claim: 'companies.create',
        expectedLocation: 'apps/desktop/src/main/ipc',
      },
    ]);
    expect(out).toContain('## Unallowed gaps');
    expect(out).toContain('`companies.create`');
  });

  it('lists allowlisted gaps with their audit row + disposition', () => {
    const out = formatStepSummary([
      {
        status: 'fail',
        allowed: true,
        claim: 'orgchart.get',
        expectedLocation: 'x',
        auditRow: '2.21',
        disposition: 'restore',
        allowReason: 'Cluster B',
      },
    ]);
    expect(out).toContain('## Allowlisted gaps');
    expect(out).toContain('`orgchart.get`');
    expect(out).toContain('2.21');
    expect(out).toContain('restore');
    expect(out).toContain('Cluster B');
  });
});
