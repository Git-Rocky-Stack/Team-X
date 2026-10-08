/**
 * Branch-governance config stays true to the repository (audit 2026-10-07
 * P1-5).
 *
 * A required status check that names a job which no longer exists blocks
 * every merge; one that was renamed silently stops being required. A
 * CODEOWNERS path that moved stops protecting anything. These pins catch
 * both before the ruleset is applied.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

/** Every check name the PR workflows can report, with `matrix.os` expanded. */
function reportedCheckNames(): Set<string> {
  const names = new Set<string>();
  for (const file of readdirSync(join(root, '.github', 'workflows'))) {
    const text = read('.github', 'workflows', file);
    if (!/^on:[\s\S]*?pull_request/m.test(text)) continue;
    const oses = [...text.matchAll(/^\s+- (ubuntu|macos|windows)-latest$/gm)].map(
      (m) => `${m[1]}-latest`,
    );
    for (const m of text.matchAll(/^ {4}name: (.+)$/gm)) {
      const name = (m[1] ?? '').trim();
      if (name.includes('${{ matrix.os }}')) {
        for (const os of oses) names.add(name.replace('${{ matrix.os }}', os));
      } else {
        names.add(name);
      }
    }
  }
  return names;
}

describe('.github/rulesets', () => {
  const main = JSON.parse(read('.github', 'rulesets', 'main.json'));
  const tags = JSON.parse(read('.github', 'rulesets', 'release-tags.json'));
  const rule = (set: { rules: Array<{ type: string; parameters?: unknown }> }, type: string) =>
    set.rules.find((r) => r.type === type);

  it('requires only checks the PR workflows actually report', () => {
    const reported = reportedCheckNames();
    const required = (
      rule(main, 'required_status_checks')?.parameters as {
        required_status_checks: Array<{ context: string }>;
      }
    ).required_status_checks.map((c) => c.context);
    expect(required.length).toBeGreaterThanOrEqual(6);
    for (const context of required) {
      expect(reported, `"${context}" is not a job name any PR workflow reports`).toContain(context);
    }
  });

  it('requires a reviewed, up-to-date pull request with resolved threads', () => {
    const pr = rule(main, 'pull_request')?.parameters as Record<string, unknown>;
    expect(pr).toMatchObject({
      required_approving_review_count: 1,
      require_code_owner_review: true,
      required_review_thread_resolution: true,
      dismiss_stale_reviews_on_push: true,
    });
    expect(
      (rule(main, 'required_status_checks')?.parameters as Record<string, unknown>)
        .strict_required_status_checks_policy,
    ).toBe(true);
    expect(rule(main, 'non_fast_forward')).toBeDefined();
    expect(rule(main, 'deletion')).toBeDefined();
  });

  it('lets the maintainer bypass only through a pull request (break-glass)', () => {
    expect(main.bypass_actors).toEqual([
      { actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' },
    ]);
  });

  it('requires signed release tags that only the maintainer can create', () => {
    expect(tags.conditions.ref_name.include).toEqual(['refs/tags/v*']);
    for (const type of ['creation', 'update', 'deletion', 'required_signatures']) {
      expect(rule(tags, type), type).toBeDefined();
    }
  });
});

describe('.github/CODEOWNERS', () => {
  it('covers everything and names only paths that exist', () => {
    const entries = read('.github', 'CODEOWNERS')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'))
      .map((l) => l.split(/\s+/)[0] ?? '');
    expect(entries[0]).toBe('*');
    for (const path of entries.slice(1)) {
      expect(existsSync(join(root, path)), `${path} does not exist`).toBe(true);
    }
  });
});
