// Dependency-audit gate (audit 2026-10-07 P0-2 / P2-5): positive-control tests
// for the pure evaluator in scripts/check-dependency-audit.mjs.
//
// Located under apps/desktop/src/ for the same reason as
// check-claim-evidence.test.ts: Vitest's projects cover packages/* and apps/*,
// not scripts/.

import { describe, expect, it } from 'vitest';

// @ts-expect-error — .mjs script with implicit module resolution; vitest resolves at runtime.
import { evaluateAudit } from '../../../scripts/check-dependency-audit.mjs';

type Advisory = {
  github_advisory_id: string;
  module_name: string;
  severity: string;
  title: string;
  url: string;
  findings: Array<{ version: string; paths: string[] }>;
};

function audit(...advisories: Advisory[]) {
  return { advisories: Object.fromEntries(advisories.map((a, i) => [String(i), a])) };
}

function advisory(id: string, severity: string, module = 'pkg'): Advisory {
  return {
    github_advisory_id: id,
    module_name: module,
    severity,
    title: `${module} is vulnerable`,
    url: `https://github.com/advisories/${id}`,
    findings: [{ version: '1.0.0', paths: [`apps/desktop > ${module}`] }],
  };
}

const TODAY = '2026-10-08';

describe('evaluateAudit', () => {
  it('passes a clean audit', () => {
    const r = evaluateAudit(audit(), [], TODAY);
    expect(r.ok).toBe(true);
    expect(r.blocking).toEqual([]);
  });

  it('ignores moderate and low advisories', () => {
    const r = evaluateAudit(
      audit(advisory('GHSA-mod', 'moderate'), advisory('GHSA-low', 'low')),
      [],
      TODAY,
    );
    expect(r.ok).toBe(true);
  });

  it('blocks an unexcepted critical or high advisory', () => {
    const r = evaluateAudit(
      audit(advisory('GHSA-crit', 'critical'), advisory('GHSA-high', 'high')),
      [],
      TODAY,
    );
    expect(r.ok).toBe(false);
    expect(r.blocking.map((b: { id: string }) => b.id)).toEqual(['GHSA-crit', 'GHSA-high']);
  });

  it('accepts a high advisory covered by an unexpired, justified exception', () => {
    const r = evaluateAudit(
      audit(advisory('GHSA-braces', 'high', 'braces')),
      [
        {
          id: 'GHSA-braces',
          module: 'braces',
          expires: '2026-12-31',
          reason: 'build-time only; inputs are repo-authored',
        },
      ],
      TODAY,
    );
    expect(r.ok).toBe(true);
    expect(r.excepted.map((e: { id: string }) => e.id)).toEqual(['GHSA-braces']);
  });

  it('blocks once the exception expires', () => {
    const r = evaluateAudit(
      audit(advisory('GHSA-braces', 'high', 'braces')),
      [{ id: 'GHSA-braces', module: 'braces', expires: '2026-10-01', reason: 'x' }],
      TODAY,
    );
    expect(r.ok).toBe(false);
    expect(r.expired.map((e: { id: string }) => e.id)).toEqual(['GHSA-braces']);
  });

  it('fails on a stale exception so the list cannot rot', () => {
    const r = evaluateAudit(
      audit(),
      [{ id: 'GHSA-gone', module: 'gone', expires: '2026-12-31', reason: 'x' }],
      TODAY,
    );
    expect(r.ok).toBe(false);
    expect(r.stale.map((e: { id: string }) => e.id)).toEqual(['GHSA-gone']);
  });

  it('rejects an exception with no reason or no expiry', () => {
    expect(() =>
      evaluateAudit(audit(), [{ id: 'GHSA-x', module: 'x', expires: '', reason: 'x' }], TODAY),
    ).toThrow(/expires/);
    expect(() =>
      evaluateAudit(
        audit(),
        [{ id: 'GHSA-x', module: 'x', expires: '2026-12-31', reason: '' }],
        TODAY,
      ),
    ).toThrow(/reason/);
  });

  it('treats a malformed audit document as an engine error, not a pass', () => {
    expect(() => evaluateAudit({}, [], TODAY)).toThrow(/advisories/);
  });
});
