#!/usr/bin/env node
// Source file-size budget (audit 2026-10-07 P1-7).
//
// Large modules amplify change: every feature touches them, reviews cannot
// hold them in view, and merges collide. Production source must stay at or
// under MAX_LINES. A file that legitimately needs more (declarative schema,
// type unions, static content), or that is waiting on its decomposition, is
// listed in scripts/file-size-exceptions.json with a reason and a cap.
//
// The cap is a ratchet. A file may not grow past it, and a cap more than
// RATCHET_SLACK lines above the file must be lowered, so the room a
// decomposition frees cannot quietly fill up again. An exception for a file
// that is gone, or back under the budget, must be deleted.
//
// Usage: node scripts/check-file-size.mjs
// Exit:  0 within budget; 1 problems listed

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MAX_LINES = 800;
export const RATCHET_SLACK = 25;
const EXCEPTIONS_FILE = join(ROOT, 'scripts', 'file-size-exceptions.json');

/** Hand-written production TypeScript: no tests, fixtures, declarations or migrations. */
export function isProductionSource(path) {
  if (!/^(apps\/[^/]+|packages\/[^/]+)\/src\/.+\.tsx?$/.test(path)) return false;
  if (/\.(test|spec)\.tsx?$/.test(path) || path.endsWith('.d.ts')) return false;
  if (/\/(migrations|test-utils|__fixtures__)\//.test(path)) return false;
  if (/\/test-(setup|console-guard)\.tsx?$/.test(path)) return false;
  return true;
}

function walk(root, dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['dist', 'out', 'coverage'].includes(entry.name)) walk(root, abs, out);
    } else {
      const rel = relative(root, abs).split(sep).join('/');
      if (isProductionSource(rel)) out.push(rel);
    }
  }
  return out;
}

function lineCount(text) {
  if (text.length === 0) return 0;
  const newlines = text.split('\n').length - 1;
  return text.endsWith('\n') ? newlines : newlines + 1;
}

/** Pure over the tree at `root`. Returns the measured files and the problems. */
export function checkFileSizes(
  root,
  { maxLines = MAX_LINES, ratchetSlack = RATCHET_SLACK, exceptions = {} } = {},
) {
  const files = ['apps', 'packages']
    .filter((d) => existsSync(join(root, d)))
    .flatMap((d) => walk(root, join(root, d), []))
    .map((path) => ({ path, lines: lineCount(readFileSync(join(root, path), 'utf8')) }));
  const byPath = new Map(files.map((f) => [f.path, f.lines]));
  const problems = [];

  for (const [path, lines] of byPath) {
    if (lines <= maxLines) continue;
    const exception = exceptions[path];
    if (!exception) {
      problems.push(
        `${path}: ${lines} lines exceeds the ${maxLines}-line budget; split it by responsibility or add a justified exception`,
      );
    } else if (lines > exception.maxLines) {
      problems.push(
        `${path}: ${lines} lines exceeds its ${exception.maxLines}-line exception cap; the cap may not be raised to absorb new code`,
      );
    }
  }

  for (const [path, exception] of Object.entries(exceptions)) {
    const lines = byPath.get(path);
    if (typeof exception.reason !== 'string' || exception.reason.trim() === '') {
      problems.push(`${path}: exception has no reason`);
    } else if (lines === undefined) {
      problems.push(`${path}: exception names a file that no longer exists; delete it`);
    } else if (lines <= maxLines) {
      problems.push(`${path}: ${lines} lines is within the budget; delete its exception`);
    } else if (exception.maxLines - lines > ratchetSlack) {
      problems.push(`${path}: shrank to ${lines} lines; lower its cap to ${lines}`);
    }
  }
  return { files, problems };
}

function main() {
  const exceptions = JSON.parse(readFileSync(EXCEPTIONS_FILE, 'utf8')).files;
  const { files, problems } = checkFileSizes(ROOT, { exceptions });
  if (problems.length > 0) {
    console.error(`file size: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  const over = files.filter((f) => f.lines > MAX_LINES).length;
  console.log(
    `file size: ${files.length} production files checked; ${over} on a capped exception, the rest within ${MAX_LINES} lines`,
  );
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) main();
