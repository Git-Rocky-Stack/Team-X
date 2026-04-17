/**
 * Diagnostic — count parsed roles in the strategia-official pack.
 * Used to verify role-pack integrity after edits / cherry-picks.
 *
 * Run: node scripts/count-roles.mjs
 *
 * Walks role-packs/strategia-official/roles, parses every .md via
 * @team-x/role-schema, and reports total count + per-level breakdown
 * + duplicate-id detection + parse failures.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const SCHEMA_URL = pathToFileURL(join(REPO, 'packages/role-schema/dist/index.js')).href;
const { parseRoleMarkdown } = await import(SCHEMA_URL);

const ROOT = join(REPO, 'role-packs/strategia-official/roles');
const index = new Map();
const errors = [];
const allFiles = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (!full.endsWith('.md')) continue;
    allFiles.push(full);
    try {
      const spec = parseRoleMarkdown(readFileSync(full, 'utf8'), full);
      if (index.has(spec.frontmatter.id)) {
        errors.push(
          `DUPLICATE id "${spec.frontmatter.id}" in ${full} (already from ${index.get(spec.frontmatter.id).source})`,
        );
      }
      index.set(spec.frontmatter.id, { source: full, level: spec.frontmatter.level });
    } catch (err) {
      errors.push(`PARSE FAIL: ${full}\n  ${err.message}`);
    }
  }
}

walk(ROOT);

const byLevel = {};
for (const { level } of index.values()) byLevel[level] = (byLevel[level] || 0) + 1;

console.log('Total .md files on disk:    ', allFiles.length);
console.log('Successfully parsed roles:  ', index.size);
console.log('By level:                   ', JSON.stringify(byLevel));
console.log('Parse / duplicate errors:   ', errors.length);
if (errors.length) {
  console.log('---');
  for (const e of errors) console.log(e);
  process.exit(1);
}
