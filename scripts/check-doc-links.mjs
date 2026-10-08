#!/usr/bin/env node
// Documentation link gate (audit 2026-10-07 P2-6).
//
// Every relative link in the maintained documentation must point at a file
// that exists, and a `#fragment` into a Markdown file must name a heading
// there (GitHub's anchor rules). External URLs are not fetched: the gate runs
// offline and deterministically. Historical records (plans, handoffs, dev
// history, audits) describe the tree as it was and are not checked.
//
// Usage: node scripts/check-doc-links.mjs
// Exit:  0 all links resolve; 1 broken links listed

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Maintained docs: what users and contributors read today. */
export const CHECKED = [
  'README.md',
  'ARCHITECTURE.md',
  'API_ENDPOINTS.md',
  'DATABASE_SCHEMA.md',
  'DESIGN.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'docs/user-guide',
  'docs/developer-guide',
  'docs/runtime',
  'docs/templates',
  '.github/release-notes',
];

/** GitHub's heading anchor: lowercase, punctuation dropped, spaces to hyphens. */
export function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

/** Anchors a Markdown document defines, with GitHub's -1/-2 suffixes for repeats. */
export function anchorsOf(markdown) {
  const seen = new Map();
  const anchors = new Set();
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (m?.[1]) {
      const base = slugify(m[1]);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      anchors.add(n === 0 ? base : `${base}-${n}`);
    }
    for (const a of line.matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) anchors.add(a[1]);
  }
  return anchors;
}

/** Relative link targets in a Markdown document (code fences and inline code ignored). */
export function linksOf(markdown) {
  const links = [];
  let inFence = false;
  markdown.split('\n').forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) return;
    const text = line.replace(/`[^`]*`/g, '');
    // `[x](path "title")`, or `[x](<path with spaces>)`.
    for (const m of text.matchAll(/\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)/g)) {
      const target = m[1] ?? m[2];
      if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue; // http:, mailto:, etc.
      links.push({ target, line: i + 1 });
    }
  });
  return links;
}

function markdownFiles(path) {
  const abs = join(ROOT, path);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return abs.endsWith('.md') ? [abs] : [];
  return readdirSync(abs, { withFileTypes: true }).flatMap((e) =>
    markdownFiles(relative(ROOT, join(abs, e.name))),
  );
}

export function checkFile(file) {
  const problems = [];
  const text = readFileSync(file, 'utf8');
  for (const { target, line } of linksOf(text)) {
    const [rawPath, fragment] = target.split('#');
    const path = decodeURIComponent(rawPath ?? '');
    const dest = path === '' ? file : resolve(dirname(file), path);
    const where = `${relative(ROOT, file)}:${line}`;
    if (!existsSync(dest)) {
      problems.push(`${where}  ${target}  (no such file)`);
      continue;
    }
    if (fragment && dest.endsWith('.md') && statSync(dest).isFile()) {
      if (!anchorsOf(readFileSync(dest, 'utf8')).has(fragment.toLowerCase())) {
        problems.push(`${where}  ${target}  (no heading #${fragment})`);
      }
    }
  }
  return problems;
}

function main() {
  const files = [...new Set(CHECKED.flatMap(markdownFiles))];
  const problems = files.flatMap(checkFile);
  if (problems.length > 0) {
    console.error(`doc links: ${problems.length} broken link(s)`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`doc links: ${files.length} files checked, all relative links resolve`);
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) main();
