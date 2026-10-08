#!/usr/bin/env node
// Bundle budget gate (audit 2026-10-07 P2-2).
//
// Reads the electron-vite build output (apps/desktop/out) and fails when any
// budgeted file, or budgeted group of files, outgrows its raw or gzip cap.
// A budget that matches no file fails too: a renamed entry must not slip out
// from under its cap.
//
// The caps sit roughly 10% above the sizes measured when they were set, so
// ordinary feature work fits and a regression of the 2026-10-07 kind (3.5 MB
// unminified single-entry renderer, 984 KB font) cannot land unnoticed.
// Raise a cap only together with the reason in the same commit, and lower it
// when a change makes room.
//
// Usage: node scripts/check-bundle-budget.mjs [path/to/out]
// Exit:  0 within budget; 1 over budget; 2 build output missing

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = join(REPO_ROOT, 'apps', 'desktop', 'out');

const KB = 1024;

/**
 * `each` caps every matching file; `total` caps the matching files together.
 * Globs are relative to the build output; `*` stays within one path segment,
 * `**` crosses segments. `exclude` drops files another budget already caps.
 */
export const BUDGETS = [
  // What the window parses before first paint.
  {
    name: 'renderer entry',
    glob: 'renderer/assets/index-*.js',
    mode: 'each',
    maxBytes: 680 * KB,
    maxGzipBytes: 200 * KB,
  },
  // Each lazily loaded view (telemetry's charting library is the largest).
  {
    name: 'renderer chunk',
    glob: 'renderer/assets/*.js',
    exclude: 'renderer/assets/index-*.js',
    mode: 'each',
    maxBytes: 460 * KB,
    maxGzipBytes: 135 * KB,
  },
  {
    name: 'renderer styles',
    glob: 'renderer/assets/*.css',
    mode: 'each',
    maxBytes: 100 * KB,
    maxGzipBytes: 19 * KB,
  },
  // Fonts are already compressed (woff2), so only the raw size is capped.
  { name: 'renderer font', glob: 'renderer/assets/*.woff2', mode: 'each', maxBytes: 100 * KB },
  { name: 'renderer total', glob: 'renderer/**', mode: 'total', maxBytes: 2300 * KB },
  // Unminified on purpose (readable crash stacks); see electron.vite.config.ts.
  {
    name: 'main process',
    glob: 'main/index.js',
    mode: 'each',
    maxBytes: 2750 * KB,
    maxGzipBytes: 575 * KB,
  },
  { name: 'preload', glob: 'preload/index.cjs', mode: 'each', maxBytes: 36 * KB },
];

/** Minimal glob: `*` within a segment, `**` across segments, everything else literal. */
export function matchGlob(glob, path) {
  const pattern = glob
    .split('**')
    .map((part) =>
      part
        .split('*')
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]*'),
    )
    .join('.*');
  return new RegExp(`^${pattern}$`).test(path);
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const abs = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(abs) : entry.isFile() ? [abs] : [];
  });
}

/** Pure over the files under `outDir`. Returns measurement rows and problems. */
export function checkBudgets(outDir, budgets = BUDGETS) {
  const files = listFiles(outDir).map((abs) => ({
    abs,
    rel: relative(outDir, abs).split(sep).join('/'),
  }));
  const rows = [];
  const problems = [];

  const measure = (abs) => {
    const data = readFileSync(abs);
    return { bytes: data.length, gzip: gzipSync(data, { level: 9 }).length };
  };
  const over = (label, what, value, cap) =>
    problems.push(`${label}: ${what} ${value} bytes exceeds the ${cap}-byte budget`);

  for (const budget of budgets) {
    const matched = files.filter(
      (f) => matchGlob(budget.glob, f.rel) && !(budget.exclude && matchGlob(budget.exclude, f.rel)),
    );
    if (matched.length === 0) {
      problems.push(`${budget.name}: "${budget.glob}" matches no file in the build output`);
      continue;
    }
    const measured = matched.map((f) => ({ ...f, ...measure(f.abs) }));
    const groups =
      budget.mode === 'total'
        ? [
            {
              label: `${budget.name} (${matched.length} files)`,
              bytes: measured.reduce((n, f) => n + f.bytes, 0),
              gzip: measured.reduce((n, f) => n + f.gzip, 0),
            },
          ]
        : measured.map((f) => ({ label: `${budget.name} ${f.rel}`, bytes: f.bytes, gzip: f.gzip }));

    for (const g of groups) {
      rows.push({ name: budget.name, label: g.label, bytes: g.bytes, gzip: g.gzip, budget });
      if (g.bytes > budget.maxBytes) over(g.label, 'raw', g.bytes, budget.maxBytes);
      if (budget.maxGzipBytes !== undefined && g.gzip > budget.maxGzipBytes) {
        over(g.label, 'gzip', g.gzip, budget.maxGzipBytes);
      }
    }
  }
  return { rows, problems };
}

const kb = (n) => `${(n / KB).toFixed(1)} KB`;

function main() {
  const outDir = resolve(process.argv[2] ?? DEFAULT_OUT);
  if (!existsSync(outDir)) {
    console.error(`bundle budget: no build output at ${outDir}; run the build first`);
    process.exit(2);
  }
  const { rows, problems } = checkBudgets(outDir);
  for (const r of rows) {
    const gzipCap = r.budget.maxGzipBytes === undefined ? '' : ` / ${kb(r.budget.maxGzipBytes)}`;
    console.log(
      `${r.label.padEnd(64)} ${kb(r.bytes).padStart(10)} raw  ${kb(r.gzip).padStart(9)} gzip   cap ${kb(r.budget.maxBytes)}${gzipCap}`,
    );
  }
  if (problems.length > 0) {
    console.error(`\nbundle budget: ${problems.length} over budget`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log('\nbundle budget: all output within budget');
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) main();
