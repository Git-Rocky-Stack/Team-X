#!/usr/bin/env node
// Phase 5.6 M-E S2 + S3 — claim-evidence engine.
//
// Parses CLAUDE.md structured claims (IPC channel table + bus events table)
// and verifies each claim has on-disk evidence via `git grep`. Known gaps
// are cross-referenced to the M-A conformance audit via the allowlist file.
// Exits non-zero on any UNALLOWED missing evidence.
//
// Usage:
//   node scripts/check-claim-evidence.mjs              # full audit, allowlist applied
//   node scripts/check-claim-evidence.mjs --strict     # ignore allowlist (M-G ship gate)
//   node scripts/check-claim-evidence.mjs --staged     # S3 fast-path (CLAUDE.md diff only)
//   node scripts/check-claim-evidence.mjs --json       # JSON output for CI summaries
//   node scripts/check-claim-evidence.mjs --verbose    # log every claim, not just failures
//
// Exit codes:
//   0  — all claims verified (allowlist applied)
//   1  — at least one UNALLOWED missing-evidence claim
//   2  — engine error (CLAUDE.md missing, git unavailable, etc.)
//
// Owner: Phase 5.6 M-E (process safeguards). Plan: docs/plans/2026-04-17-team-x-phase-5.6-remediation.md §7.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SELF_DIR, '..');

const CLAUDE_MD_PATH = join(REPO_ROOT, 'CLAUDE.md');
const ALLOWLIST_PATH = join(REPO_ROOT, 'scripts', 'check-claim-evidence.allowlist.json');

// ---------------------------------------------------------------------------
// Pure parsers — no fs, no git. Exported for vitest.
// ---------------------------------------------------------------------------

/**
 * Parse the IPC channels table from CLAUDE.md text.
 * Returns array of { namespace, channel } where channel is the dotted form.
 * Continuation rows (empty namespace cell) inherit the last seen namespace.
 */
// Strict IPC channel literal: `namespace.verb` with snake/camel-case verbs only.
// Rejects file-path-shaped strings (e.g. `agentic-tools-write.ts`) and
// dotted-prose lines that sneak into table cells.
const IPC_CHANNEL_RE = /^[a-z][a-z0-9]*\.[a-zA-Z][a-zA-Z0-9_]*$/;

export function parseIpcChannels(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  // Locate the IPC channels section header. Tolerate phase suffix.
  // Anchored at start-of-string OR after a newline (handles minimal test
  // fixtures that put the header on line 0 without a leading blank line).
  const headerRe = /(?:^|\n)##\s+IPC channels[^\n]*\n/;
  const headerMatch = text.match(headerRe);
  if (!headerMatch) return [];
  const start = headerMatch.index + headerMatch[0].length;
  // Section ends at next h2 OR at the "Bus events added" sub-header
  // (the bus events table is a free-floating paragraph + table inside
  // the IPC chapter — without this guard the IPC parser would consume
  // bus-event rows whose "Emitted by" cell contains dotted file paths
  // and misclassify them as IPC channels).
  const tail = text.slice(start);
  const endRe = /\n##\s|\n\*\*Bus events added/;
  const endMatch = tail.match(endRe);
  const section = endMatch ? tail.slice(0, endMatch.index) : tail;

  const out = [];
  let lastNamespace = '';
  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed.split('|').map((c) => c.trim());
    // Expected shape: [empty, namespace, channel, description, ...trailing-empty]
    if (cells.length < 4) continue;
    const ns = cells[1];
    let raw = cells[2];
    if (ns === 'Namespace' || ns.startsWith('---') || ns.startsWith(':--')) continue;
    if (raw.startsWith('---') || raw.startsWith(':--')) continue;
    // Strip backticks if present.
    raw = raw.replace(/^`/, '').replace(/`$/, '').trim();
    if (!raw) continue;
    if (!IPC_CHANNEL_RE.test(raw)) continue;
    if (ns === '') {
      if (!lastNamespace) continue;
      out.push({ namespace: lastNamespace, channel: raw });
    } else {
      lastNamespace = ns;
      out.push({ namespace: ns, channel: raw });
    }
  }
  return out;
}

/**
 * Parse the "Bus events added in Phase 5" table from CLAUDE.md text.
 * Returns array of { event } where event is the dotted literal.
 * Wildcard entries (e.g. `rag.index.*`) are skipped — their concrete subevents
 * land via grep on the prefix instead.
 */
export function parseBusEvents(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const headerRe = /Bus events added[^\n]*\n/;
  const headerMatch = text.match(headerRe);
  if (!headerMatch) return [];
  const start = headerMatch.index + headerMatch[0].length;
  const tail = text.slice(start);
  const endMatch = tail.match(/\n##\s/);
  const section = endMatch ? tail.slice(0, endMatch.index) : tail;

  const out = [];
  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed.split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    const cell = cells[1];
    if (cell === 'Event' || cell.startsWith('---') || cell.startsWith(':--')) continue;
    // Pull the first backticked literal as the event name.
    const m = cell.match(/`([a-z][a-zA-Z0-9._*]*)`/);
    if (!m) continue;
    const literal = m[1];
    if (literal.includes('*')) continue;
    out.push({ event: literal });
  }
  return out;
}

/**
 * Apply the allowlist to a set of verification results. Returns the same
 * array with `allowed: true|false` and `allowReason` populated for any row
 * whose claim matches an allowlist entry.
 */
export function applyAllowlist(results, allowlist) {
  const safeAllowlist = Array.isArray(allowlist) ? allowlist : [];
  const byClaim = new Map();
  for (const entry of safeAllowlist) {
    if (entry && typeof entry.claim === 'string') {
      byClaim.set(entry.claim, entry);
    }
  }
  return results.map((r) => {
    const allow = byClaim.get(r.claim);
    return {
      ...r,
      allowed: Boolean(allow),
      allowReason: allow ? (allow.reason ?? '') : '',
      auditRow: allow ? (allow.auditRow ?? '') : '',
      disposition: allow ? (allow.disposition ?? '') : '',
    };
  });
}

/**
 * Reduce verification results to a structured summary.
 */
export function summarize(results) {
  const total = results.length;
  let pass = 0;
  let allowedFail = 0;
  let unallowedFail = 0;
  for (const r of results) {
    if (r.status === 'pass') pass += 1;
    else if (r.allowed) allowedFail += 1;
    else unallowedFail += 1;
  }
  return { total, pass, allowedFail, unallowedFail };
}

/**
 * Format a Markdown summary for GitHub Actions step summary.
 */
export function formatStepSummary(results) {
  const s = summarize(results);
  const lines = [];
  lines.push('# Claim-Evidence Conformance Audit');
  lines.push('');
  lines.push(`- Total claims checked: **${s.total}**`);
  lines.push(`- Verified on disk: **${s.pass}**`);
  lines.push(`- Known gaps (allowlisted): **${s.allowedFail}**`);
  lines.push(`- Unallowed missing-evidence claims: **${s.unallowedFail}**`);
  lines.push('');
  if (s.unallowedFail > 0) {
    lines.push('## Unallowed gaps');
    lines.push('');
    lines.push('| Claim | Expected location |');
    lines.push('|---|---|');
    for (const r of results) {
      if (r.status === 'pass' || r.allowed) continue;
      lines.push(`| \`${r.claim}\` | \`${r.expectedLocation}\` |`);
    }
    lines.push('');
  }
  if (s.allowedFail > 0) {
    lines.push('## Allowlisted gaps (cross-referenced to M-A audit)');
    lines.push('');
    lines.push('| Claim | Audit row | Disposition | Reason |');
    lines.push('|---|---|---|---|');
    for (const r of results) {
      if (r.status === 'pass' || !r.allowed) continue;
      lines.push(`| \`${r.claim}\` | ${r.auditRow} | ${r.disposition} | ${r.allowReason} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Side-effect helpers — git grep, filesystem, allowlist load.
// ---------------------------------------------------------------------------

function loadClaudeMd() {
  if (!existsSync(CLAUDE_MD_PATH)) {
    throw new Error(`CLAUDE.md not found at ${CLAUDE_MD_PATH}`);
  }
  return readFileSync(CLAUDE_MD_PATH, 'utf8');
}

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return [];
  try {
    const raw = readFileSync(ALLOWLIST_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.entries)) return parsed.entries;
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch (err) {
    throw new Error(`allowlist parse error: ${err.message}`);
  }
}

function gitGrep(needle, paths = []) {
  try {
    const args = ['grep', '-l', '--fixed-strings', needle];
    if (paths.length > 0) {
      args.push('--');
      args.push(...paths);
    }
    const out = execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out.trim().split('\n').filter(Boolean);
  } catch (err) {
    // exit code 1 from git grep = no matches; treat as empty.
    if (err && err.status === 1) return [];
    if (err && err.status === 128) return []; // not in a git repo (test sandbox)
    return [];
  }
}

function verifyIpcChannel(channel) {
  // Look for the literal string 'ns.verb' anywhere in main-process or shared-types code.
  // Quoted form must include the surrounding apostrophe so we don't false-positive
  // on prose. Both single and double quotes are accepted.
  const literalSingle = `'${channel.channel}'`;
  const literalDouble = `"${channel.channel}"`;
  const matches = new Set([
    ...gitGrep(literalSingle, [
      'apps/desktop/src/main/',
      'apps/desktop/src/preload/',
      'packages/shared-types/src/',
    ]),
    ...gitGrep(literalDouble, [
      'apps/desktop/src/main/',
      'apps/desktop/src/preload/',
      'packages/shared-types/src/',
    ]),
  ]);
  return {
    kind: 'ipc',
    claim: channel.channel,
    namespace: channel.namespace,
    expectedLocation: 'apps/desktop/src/main/ipc/** OR packages/shared-types/src/ipc.ts',
    evidence: [...matches],
    status: matches.size > 0 ? 'pass' : 'fail',
  };
}

function verifyBusEvent(event) {
  const literalSingle = `'${event.event}'`;
  const literalDouble = `"${event.event}"`;
  const matches = new Set([
    ...gitGrep(literalSingle, ['packages/shared-types/src/', 'apps/desktop/src/']),
    ...gitGrep(literalDouble, ['packages/shared-types/src/', 'apps/desktop/src/']),
  ]);
  return {
    kind: 'bus_event',
    claim: event.event,
    expectedLocation: 'packages/shared-types/src/events.ts (EventType union)',
    evidence: [...matches],
    status: matches.size > 0 ? 'pass' : 'fail',
  };
}

function getStagedClaudeMdDiff() {
  try {
    const out = execFileSync('git', ['diff', '--cached', '--unified=0', '--', 'CLAUDE.md'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return out;
  } catch {
    return '';
  }
}

function filterByStagedDiff(claims, diffText) {
  if (!diffText) return [];
  const literals = new Set();
  for (const line of diffText.split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    // Match backticked dotted literals OR table cells with dotted names.
    const matches = line.match(/`?[a-z][a-z0-9_]*\.[a-zA-Z0-9._*]+`?/g) || [];
    for (const m of matches) {
      literals.add(m.replace(/`/g, ''));
    }
  }
  return claims.filter((c) => literals.has(c.claim));
}

// ---------------------------------------------------------------------------
// CLI runner.
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const STAGED = args.includes('--staged') || args.includes('--staged-only');
  const STRICT = args.includes('--strict');
  const JSON_OUT = args.includes('--json');
  const VERBOSE = args.includes('--verbose');

  const text = loadClaudeMd();
  const allowlist = STRICT ? [] : loadAllowlist();

  const ipc = parseIpcChannels(text);
  const bus = parseBusEvents(text);

  const ipcResults = ipc.map(verifyIpcChannel);
  const busResults = bus.map(verifyBusEvent);
  let results = [...ipcResults, ...busResults];

  if (STAGED) {
    const diff = getStagedClaudeMdDiff();
    const staged = filterByStagedDiff(results, diff);
    if (staged.length === 0) {
      // Nothing in the staged CLAUDE.md diff matched a structured claim — quiet pass.
      if (JSON_OUT)
        console.log(
          JSON.stringify(
            { summary: { total: 0, pass: 0, allowedFail: 0, unallowedFail: 0 }, results: [] },
            null,
            2,
          ),
        );
      else
        console.log('check-claim-evidence: no structured claims in staged CLAUDE.md diff — pass.');
      process.exit(0);
    }
    results = staged;
  }

  results = applyAllowlist(results, allowlist);
  const s = summarize(results);

  if (JSON_OUT) {
    console.log(JSON.stringify({ summary: s, results }, null, 2));
  } else {
    console.log(
      `check-claim-evidence: ${s.pass} verified, ${s.allowedFail} allowlisted, ${s.unallowedFail} UNALLOWED out of ${s.total}`,
    );
    if (VERBOSE || s.unallowedFail > 0) {
      for (const r of results) {
        if (r.status === 'pass') {
          if (VERBOSE) console.log(`  ✓ ${r.claim}`);
          continue;
        }
        if (r.allowed) {
          if (VERBOSE) console.log(`  ⚠ ${r.claim} (allowlisted: ${r.auditRow} ${r.disposition})`);
        } else {
          console.log(`  ✗ ${r.claim} — no evidence under ${r.expectedLocation}`);
        }
      }
    }
  }

  // GitHub Actions step summary integration — no-op outside CI.
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      const { appendFileSync } = await import('node:fs');
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${formatStepSummary(results)}\n`);
    } catch {
      // Best effort — do not fail the script if the summary write fails.
    }
  }

  process.exit(s.unallowedFail > 0 ? 1 : 0);
}

// Only run when invoked directly (not when imported by the test file).
const isDirectInvocation =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) {
  main().catch((err) => {
    console.error(`check-claim-evidence: engine error — ${err.message}`);
    process.exit(2);
  });
}
