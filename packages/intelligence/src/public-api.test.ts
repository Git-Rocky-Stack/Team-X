/**
 * The intelligence package's public surface (audit 2026-10-07 P2-4).
 *
 * Every name the root export (`@team-x/intelligence`) offers, values and
 * types alike, is pinned in a snapshot, read through the TypeScript compiler
 * so a type-only export counts too. Adding, removing or renaming an export
 * fails this test until the snapshot is updated (`vitest -u`), which puts the
 * change in front of a reviewer as a deliberate API decision, not a side
 * effect. The experimental subpath is pinned the same way, and the two must
 * never overlap.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

function exportedNames(entry: string): string[] {
  const file = join(here, entry);
  const program = ts.createProgram([file], {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file);
  if (!source) throw new Error(`cannot load ${file}`);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) throw new Error(`${file} has no module symbol`);
  return checker
    .getExportsOfModule(moduleSymbol)
    .map((s) => s.getName())
    .sort();
}

describe('@team-x/intelligence public API', () => {
  const stable = exportedNames('index.ts');
  const experimental = exportedNames('experimental.ts');

  it('exports exactly the stable surface', () => {
    expect(stable).toMatchSnapshot();
  });

  it('keeps experimental subsystems behind /experimental', () => {
    expect(experimental).toMatchSnapshot();
  });

  it('never offers an experimental name from the stable root', () => {
    expect(stable.filter((name) => experimental.includes(name))).toEqual([]);
  });
});
