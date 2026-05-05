/**
 * Phase 4 end-to-end vault-backup test.
 *
 * Exercises the vault + backup lifecycle against a real Electron
 * instance with `NODE_ENV=test` (canned test-mode provider, no
 * network). Validates:
 *
 *   1. Boot → assert the app shell (Strategia-X brand + Phase 4 badge)
 *   2. Navigate to Files tab → verify empty vault state
 *   3. Upload a file via IPC (bypass native dialog in test mode)
 *   4. Verify the file appears in the vault file list
 *   5. Navigate to Settings → Backup section
 *   6. Trigger backup.create via IPC → verify backup entry appears
 *   7. Navigate back to Files → verify vault stats show 1 file
 *
 * The vault upload is driven via `window.teamx.vault.upload` IPC
 * directly (native file dialog is not available in Playwright-driven
 * Electron). The backup is driven via `window.teamx.backup.create`.
 *
 * Same isolation model as other E2E specs: each test gets a fresh
 * `--user-data-dir=<tmp>` so the SQLite DB never collides with the
 * dev database or other test runs.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type ElectronApplication,
  type Page,
  _electron as electron,
  expect,
  test,
} from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MAIN_ENTRY = resolve(__dirname, '../out/main/index.js');

// Serial — one Electron instance per host at a time.
test.describe.configure({ mode: 'serial' });

test.describe('Team-X Phase 4 vault-backup flow', () => {
  let app: ElectronApplication;
  let window: Page;
  let userDataDir: string;
  let testFilePath: string;

  function log(msg: string) {
    console.log(`[vault-backup] ${msg}`);
  }

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'teamx-e2e-'));

    // Create a test file to upload into the vault.
    testFilePath = join(userDataDir, 'test-document.md');
    writeFileSync(testFilePath, '# Test Document\n\nThis is a test file for vault E2E.', 'utf-8');

    app = await electron.launch({
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });

    app.process().stdout?.on('data', (buf: Buffer) => {
      process.stdout.write(`[main] ${buf.toString()}`);
    });
    app.process().stderr?.on('data', (buf: Buffer) => {
      process.stderr.write(`[main!] ${buf.toString()}`);
    });

    window = await app.firstWindow();

    window.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Electron Security Warning')) return;
      if (text.includes('aria-describedby={undefined}')) return;
      console.log(`[renderer ${msg.type()}] ${text}`);
    });
    window.on('pageerror', (err) => {
      console.error('[renderer pageerror]', err.message);
    });

    await window.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    if (app) {
      let closedCleanly = false;
      const closePromise = app
        .close()
        .then(() => {
          closedCleanly = true;
        })
        .catch(() => {
          /* app may already be closed */
        });
      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          if (!closedCleanly) {
            try {
              app.process().kill('SIGKILL');
            } catch {
              /* already gone */
            }
          }
          resolve();
        }, 5000);
      });
      await Promise.race([closePromise, timeoutPromise]);
    }
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  });

  test('vault upload → verify → backup create → verify backup entry', async () => {
    // --- 1. App shell renders ------------------------------------------------
    await expect(window.locator('[data-testid="app-brand-name"]')).toBeVisible();
    log('Strategia-X visible');
    await expect(window.getByText('Phase 6', { exact: true })).toBeVisible();
    log('Phase 6 badge visible');
    // M35 T9 stable-selector anchor — top-bar Copilot Sparkles button
    // (data-copilot-toolbar-toggle) proves the Phase 5 UI mounted.
    // Required by apps/desktop/src/e2e-regression-guards.test.ts.
    await expect(window.locator('[data-copilot-toolbar-toggle]')).toBeVisible();

    // --- 2. Navigate to Files tab --------------------------------------------
    const filesTab = window.getByRole('button', { name: 'Files', exact: true });
    await filesTab.click();
    log('Files tab clicked');

    // Verify the vault view renders with the "File Vault" heading.
    await expect(window.getByText('File Vault')).toBeVisible();
    log('File Vault heading visible');

    // Vault should be empty initially — "0 files" in stats.
    await expect(window.getByText('0 files')).toBeVisible();
    log('empty vault confirmed');

    // --- 3. Upload a file via IPC (bypass native dialog) ---------------------
    // Get the company ID from the seeded Strategia-X company. We use
    // evaluate to call the IPC directly since Playwright can't drive
    // native Electron dialogs.
    const companyId = await window.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const w = window as any;
      const companies = await w.teamx.companies.list();
      return companies[0]?.id;
    });
    expect(companyId).toBeTruthy();
    log(`company ID: ${companyId}`);

    // Upload the test file via IPC directly.
    const uploadResult = await window.evaluate(
      async ({ cid, path }: { cid: string; path: string }) => {
        // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
        const w = window as any;
        return w.teamx.vault.upload({ companyId: cid, sourcePath: path });
      },
      { cid: companyId, path: testFilePath },
    );
    expect(uploadResult?.fileId).toBeTruthy();
    log(`file uploaded: ${uploadResult.fileId}`);

    // --- 4. Verify file appears in the vault list ----------------------------
    // Wait for the React Query refetch to pick up the new file.
    // The vault view polls or invalidates on mutation.
    await expect(window.getByText('test-document.md')).toBeVisible({ timeout: 10_000 });
    log('uploaded file visible in vault list');

    // Stats should now show "1 file".
    await expect(window.getByText('1 file')).toBeVisible({ timeout: 5000 });
    log('vault stats updated to 1 file');

    // --- 5. Verify file integrity via IPC ------------------------------------
    // Preload bridge signature is positional: `vault.verify(fileId: string)`.
    // (See `apps/desktop/src/preload/api.ts` — the preload wraps the
    // string into `{ fileId }` before invoking the IPC handler.) Response
    // shape is `{ ok: boolean, expected: string, actual: string }`.
    const verifyResult = await window.evaluate(
      async ({ fid }: { fid: string }) => {
        // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
        const w = window as any;
        return w.teamx.vault.verify(fid);
      },
      { fid: uploadResult.fileId },
    );
    expect(verifyResult?.ok).toBe(true);
    log('SHA256 integrity verified');

    // --- 6. Navigate to Settings → Backup section ----------------------------
    const settingsTab = window.getByRole('button', { name: 'Settings', exact: true });
    await settingsTab.click();
    log('Settings tab clicked');

    await expect(window.getByText('Backup & Restore')).toBeVisible();
    log('Backup & Restore section visible');

    // --- 7. Create backup via IPC -------------------------------------------
    // Response shape: `{ backupPath, manifest }` — see
    // `BackupCreateResponse` in `packages/shared-types/src/ipc.ts`.
    const backupResult = await window.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const w = window as any;
      return w.teamx.backup.create({});
    });
    expect(backupResult?.backupPath).toBeTruthy();
    log(`backup created: ${backupResult.backupPath}`);

    // Verify backup list shows at least one entry.
    const backupList = await window.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const w = window as any;
      return w.teamx.backup.list();
    });
    expect(backupList.length).toBeGreaterThanOrEqual(1);
    log(`backup list has ${backupList.length} entry/entries`);

    // --- 8. Navigate back to Files → verify vault still intact ---------------
    await filesTab.click();
    log('Files tab clicked again');

    await expect(window.getByText('test-document.md')).toBeVisible({ timeout: 10_000 });
    log('vault file still present after backup');

    await expect(window.getByText('1 file')).toBeVisible({ timeout: 5000 });
    log('vault stats still show 1 file');

    log('vault-backup E2E complete');
  });
});
