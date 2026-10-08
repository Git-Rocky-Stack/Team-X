/**
 * Filesystem roots the boot sequence resolves at startup.
 *
 * The dev-branch paths are relative to `__dirname`, which is the compiled
 * main bundle (`apps/desktop/out/main`): electron-vite bundles the whole main
 * process, these helpers included, into that one `index.js`.
 */

import { join } from 'node:path';

import { app } from 'electron';

/**
 * Resolve the absolute path to the drizzle migrations directory.
 *
 * - In dev, electron-vite runs the compiled main bundle at out/main/index.js
 *   and the migrations source lives at src/main/db/migrations — two levels
 *   up then down.
 * - In packaged production builds, migrations will ship via electron-builder
 *   `extraResources` at `process.resourcesPath/migrations` (wiring lands in
 *   Task 49). The isPackaged branch is in place so dev and prod code paths
 *   are symmetric from day one.
 */
export function resolveMigrationsFolder(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'migrations')
    : join(__dirname, '../../src/main/db/migrations');
}

/**
 * Resolve the absolute path to the role-packs roles directory.
 * Mirrors the path logic in `db/seed.ts` — both files need to point
 * at the same place, so we duplicate the helper rather than creating
 * a new shared module for one constant. T49's electron-builder
 * wiring will replace the dev branch with `process.resourcesPath`.
 */
export function resolveRolePacksRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'role-packs/strategia-official/roles')
    : join(__dirname, '../../../../role-packs/strategia-official/roles');
}

/**
 * Pinned llama-server build tag. MUST stay in sync with the `fetchedFromTag`
 * field of scripts/llama-binaries-manifest.json (the fetch pipeline's source
 * of truth). Surfaced via localGguf.runtime.binariesVersion + Settings.
 */
export const LLAMA_BINARIES_VERSION = 'b9371';

/**
 * Root containing `llama-server/<platform-arch>/<backend>/server[.exe]`.
 *
 * In packaged builds, electron-builder's `extraResources` copies
 * `resources/llama-server` → `llama-server` directly under
 * `process.resourcesPath` (see electron-builder.yml), so that is the root.
 * In dev, the compiled main bundle runs at `apps/desktop/out/main`, so the
 * source tree's `apps/desktop/resources` is four levels up then back down —
 * mirroring the `resolveRolePacksRoot` dev-path idiom. The binary resolver
 * appends `/llama-server/...` to this root.
 */
export function resolveLlamaResourcesRoot(): string {
  return app.isPackaged
    ? process.resourcesPath
    : join(__dirname, '../../../../apps/desktop/resources');
}
