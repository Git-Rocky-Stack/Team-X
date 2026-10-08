// A packaged build keeps role packs and migrations under the resources
// directory (electron-builder.yml `extraResources`). The first-run seed once
// walked up from the bundle instead and looked one level too high, so a fresh
// install failed with ENOENT before it opened a window.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: true } }));

import { resolveMigrationsFolder, resolveRolePacksRoot } from './paths.js';

const RESOURCES = join('opt', 'Team-X', 'resources');
const desktopDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('boot/paths in a packaged build', () => {
  const original = Object.getOwnPropertyDescriptor(process, 'resourcesPath');

  beforeEach(() => {
    Object.defineProperty(process, 'resourcesPath', { value: RESOURCES, configurable: true });
  });

  afterEach(() => {
    if (original) Object.defineProperty(process, 'resourcesPath', original);
    else Reflect.deleteProperty(process, 'resourcesPath');
  });

  it('finds role packs under the resources directory', () => {
    expect(resolveRolePacksRoot()).toBe(
      join(RESOURCES, 'role-packs', 'strategia-official', 'roles'),
    );
  });

  it('finds migrations under the resources directory', () => {
    expect(resolveMigrationsFolder()).toBe(join(RESOURCES, 'migrations'));
  });

  it('matches where electron-builder copies them', () => {
    const builder = readFileSync(join(desktopDir, 'electron-builder.yml'), 'utf8');
    expect(builder).toMatch(/from: \.\.\/\.\.\/role-packs\n\s+to: role-packs\n/);
    expect(builder).toMatch(/from: src\/main\/db\/migrations\n\s+to: migrations\n/);
  });
});
