#!/usr/bin/env node
// Dependency-audit gate (audit 2026-10-07 P0-2 / P2-5).
//
// Runs `pnpm audit --json` over the WHOLE workspace graph, dev and build
// tooling included: Electron, electron-builder and the test runner ship or
// build the desktop binary, so excluding them would misstate release risk.
// Fails on any critical or high advisory unless it is listed in
// scripts/dependency-audit-exceptions.json with a reason and an expiry date.
// An expired exception fails, and so does a stale one (its advisory no longer
// appears): the list is evidence, and it must not rot.
//
// Usage:
//   node scripts/check-dependency-audit.mjs                 # run pnpm audit and gate
//   node scripts/check-dependency-audit.mjs --input a.json  # gate a saved audit report
//
// Exit codes:
//   0  no unexcepted critical/high advisories
//   1  blocking, expired, or stale entries
//   2  engine error (audit unavailable, malformed report, invalid exception)

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SELF_DIR, '..');
const EXCEPTIONS_PATH = join(SELF_DIR, 'dependency-audit-exceptions.json');

const BLOCKING_SEVERITIES = new Set(['critical', 'high']);

/**
 * Pure evaluator. `report` is `pnpm audit --json` output; `exceptions` is the
 * parsed exceptions list; `today` is an ISO date (YYYY-MM-DD).
 */
export function evaluateAudit(report, exceptions, today) {
  if (!report || typeof report.advisories !== 'object' || report.advisories === null) {
    throw new Error('audit report has no advisories object; refusing to pass an empty gate');
  }
  for (const e of exceptions) {
    if (!e.id) throw new Error('exception without an advisory id');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.expires ?? '')) {
      throw new Error(`exception ${e.id} needs an ISO expires date`);
    }
    if (!e.reason?.trim()) throw new Error(`exception ${e.id} needs a reason`);
  }

  const byId = new Map(exceptions.map((e) => [e.id, e]));
  const seen = new Set();
  const blocking = [];
  const excepted = [];
  const expired = [];

  const advisories = Object.values(report.advisories)
    .filter((a) => BLOCKING_SEVERITIES.has(a.severity))
    .sort((a, b) => a.github_advisory_id.localeCompare(b.github_advisory_id));

  for (const a of advisories) {
    const entry = {
      id: a.github_advisory_id,
      module: a.module_name,
      severity: a.severity,
      title: a.title,
      url: a.url,
      versions: [...new Set(a.findings.map((f) => f.version))],
      path: a.findings[0]?.paths[0] ?? '',
    };
    seen.add(entry.id);
    const exception = byId.get(entry.id);
    if (!exception) blocking.push(entry);
    else if (exception.expires < today) expired.push({ ...entry, expires: exception.expires });
    else excepted.push({ ...entry, expires: exception.expires, reason: exception.reason });
  }

  const stale = exceptions.filter((e) => !seen.has(e.id));
  return {
    ok: blocking.length === 0 && expired.length === 0 && stale.length === 0,
    blocking,
    excepted,
    expired,
    stale,
  };
}

function runAudit() {
  // pnpm audit exits non-zero whenever it finds anything; the JSON is still
  // complete on stdout, so read it from the error as well.
  try {
    return execFileSync('pnpm', ['audit', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === 'win32',
    });
  } catch (err) {
    if (typeof err.stdout === 'string' && err.stdout.trim().startsWith('{')) return err.stdout;
    throw err;
  }
}

function main() {
  const args = process.argv.slice(2);
  const inputAt = args.indexOf('--input');
  const raw = inputAt >= 0 ? readFileSync(args[inputAt + 1], 'utf8') : runAudit();
  const exceptions = JSON.parse(readFileSync(EXCEPTIONS_PATH, 'utf8')).exceptions;
  const today = new Date().toISOString().slice(0, 10);
  const result = evaluateAudit(JSON.parse(raw), exceptions, today);

  const lines = [];
  for (const b of result.blocking) {
    lines.push(`BLOCKING ${b.severity} ${b.module}@${b.versions.join(',')} ${b.id} — ${b.title}`);
    lines.push(`         via ${b.path}  ${b.url}`);
  }
  for (const e of result.expired) {
    lines.push(`EXPIRED  exception for ${e.module} ${e.id} lapsed on ${e.expires}`);
  }
  for (const s of result.stale) {
    lines.push(
      `STALE    exception ${s.id} (${s.module}) no longer matches any advisory; remove it`,
    );
  }
  for (const e of result.excepted) {
    lines.push(`excepted ${e.severity} ${e.module} ${e.id} until ${e.expires} — ${e.reason}`);
  }
  lines.push(
    result.ok
      ? 'dependency audit: no unexcepted critical/high advisories'
      : 'dependency audit: FAILED',
  );
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Dependency audit\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`,
    );
  }
  process.exit(result.ok ? 0 : 1);
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(`dependency audit: engine error — ${err.message}`);
    process.exit(2);
  }
}
