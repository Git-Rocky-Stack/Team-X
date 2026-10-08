#!/usr/bin/env node
// Packaged-renderer CSP gate (audit 2026-10-07 P0-3).
//
// Reads the BUILT renderer page (apps/desktop/out/renderer/index.html, which is
// what electron-builder packs into app.asar) and fails unless it carries one
// strict Content-Security-Policy: no eval, no inline or remote script, no
// network origins, and no inline <script> element in the page itself.
//
// Usage: node scripts/check-packaged-csp.mjs [path/to/index.html]
// Exit:  0 strict; 1 violations; 2 file missing

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PAGE = join(REPO_ROOT, 'apps', 'desktop', 'out', 'renderer', 'index.html');

const REQUIRED = [
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
];

/** Pure check over page text. Returns a list of violations (empty = strict). */
export function checkPackagedCsp(html) {
  const problems = [];
  const metas = [
    ...html.matchAll(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/gi),
  ];
  if (metas.length !== 1) {
    problems.push(`expected exactly one CSP <meta>, found ${metas.length}`);
    return problems;
  }
  const csp = metas[0][1];
  const directives = new Map(
    csp
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...values] = d.split(/\s+/);
        return [name, values];
      }),
  );

  if (csp.includes('unsafe-eval')) problems.push("policy allows 'unsafe-eval'");
  const script = directives.get('script-src') ?? directives.get('default-src') ?? [];
  if (script.some((v) => v !== "'self'")) {
    problems.push(`script-src must be 'self' only, got: ${script.join(' ')}`);
  }
  if (/localhost|127\.0\.0\.1|\bws:|\bhttp:/.test(csp)) {
    problems.push('policy allows a localhost or plain-HTTP/WebSocket origin');
  }
  for (const d of REQUIRED) if (!csp.includes(d)) problems.push(`missing ${d}`);

  for (const tag of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = tag[1];
    if (!/\bsrc\s*=/.test(attrs) || tag[2].trim() !== '') {
      problems.push('page contains an inline <script> element');
    }
  }
  return problems;
}

function main() {
  const page = resolve(process.argv[2] ?? DEFAULT_PAGE);
  if (!existsSync(page)) {
    console.error(`packaged CSP: ${page} not found — run \`pnpm -F @team-x/desktop build\` first`);
    process.exit(2);
  }
  const problems = checkPackagedCsp(readFileSync(page, 'utf8'));
  if (problems.length > 0) {
    for (const p of problems) console.error(`packaged CSP: ${p}`);
    process.exit(1);
  }
  console.log(`packaged CSP: strict (${page})`);
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) main();
