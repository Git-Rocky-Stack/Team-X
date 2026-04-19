import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPABILITY_CATEGORY_MAP, CAPABILITY_LIST, type Capability } from '@team-x/shared-types';
import { describe, expect, it } from 'vitest';
import { parseRoleMarkdown } from './parse.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const officialRolesRoot = join(repoRoot, 'role-packs', 'strategia-official', 'roles');

function listMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listMarkdownFiles(full));
      continue;
    }
    if (stat.isFile() && entry.endsWith('.md')) {
      files.push(full);
    }
  }
  return files.sort();
}

describe('strategia-official capabilities backfill', () => {
  it('backfills all 57 official roles with valid capabilities', () => {
    const files = listMarkdownFiles(officialRolesRoot);
    const validCapabilities = new Set<Capability>(CAPABILITY_LIST);

    expect(files).toHaveLength(57);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const spec = parseRoleMarkdown(source, file, { requireCapabilities: true });

      expect(spec.frontmatter.capabilities, `${file} missing capabilities`).toBeDefined();
      expect(spec.frontmatter.capabilities, `${file} has no capabilities`).not.toHaveLength(0);

      for (const capability of spec.frontmatter.capabilities ?? []) {
        expect(
          validCapabilities.has(capability),
          `${file} has invalid capability ${capability}`,
        ).toBe(true);
      }
    }
  });

  it('represents every capability category somewhere in the official pack', () => {
    const files = listMarkdownFiles(officialRolesRoot);
    const assignedCapabilities = new Set<Capability>();

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const spec = parseRoleMarkdown(source, file, { requireCapabilities: true });
      for (const capability of spec.frontmatter.capabilities ?? []) {
        assignedCapabilities.add(capability);
      }
    }

    for (const [category, capabilities] of Object.entries(CAPABILITY_CATEGORY_MAP)) {
      expect(
        capabilities.some((capability) => assignedCapabilities.has(capability)),
        `category ${category} is not represented in strategia-official`,
      ).toBe(true);
    }
  });
});
