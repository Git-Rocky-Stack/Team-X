/**
 * Phase 5 (M30 — NLU Engine) end-to-end command-palette test.
 *
 * Exercises the complete command-palette round-trip against a real
 * Electron instance with `NODE_ENV=test` (canned test-mode classifier
 * + test-mode provider, no network). Validates:
 *
 *   1. Ctrl+K opens the palette (Radix Dialog with the "Command
 *      Palette" title).
 *   2. Typing "hire a senior frontend engineer" runs the canned
 *      classifier, resolves roleQuery to an existing role, the slot
 *      filler returns `ready` (hire is non-destructive), the intent
 *      chip reads "Hire Employee", and the role entity chip is
 *      visible.
 *   3. Pressing Enter fires `command.execute`, the palette closes,
 *      and the new employee appears in the sidenav Team list.
 *   4. Opening the palette again and typing `fire <name>` triggers
 *      the destructive-action confirmation gate — NOT auto-execute.
 *   5. Clicking Cancel closes the palette with the employee still
 *      present.
 *   6. Re-opening and clicking Confirm deletes the employee row
 *      and the sidenav updates.
 *   7. The Dashboard Commands subview shows both executed commands
 *      (fire newest, hire below).
 *   8. Esc closes an open palette.
 *   9. ArrowUp from an empty input cycles through the last command.
 *
 * Test mode hooks in play:
 *   - `isTestMode()` swaps `createIntentClassifier` for
 *     `createTestClassifier()` — exact-match canned table + a
 *     `/^fire\s+(.+)$/i` prefix rule + an `__ECHO_INTENT__:<json>`
 *     sentinel (documented in `apps/desktop/src/main/services/
 *     test-classifier.ts`).
 *   - The resolver still runs against live DB rows, so firing an
 *     employee resolves by the freshly-hired row.
 *
 * Isolation model matches the other specs: each test gets its own
 * `--user-data-dir=<tmp>` via `mkdtempSync` so the SQLite DB never
 * collides with the dev database or other runs.
 *
 * Build ordering note: this spec requires `apps/desktop/out/main/
 * index.js` — run `pnpm -F @team-x/desktop build` first, or use
 * `pnpm -F @team-x/desktop test:e2e` which does build + run.
 */

import { mkdtempSync, rmSync } from 'node:fs';
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

// Only one Electron instance per host at a time.
test.describe.configure({ mode: 'serial' });

test.describe('Team-X Phase 5 — M30 command palette', () => {
  let app: ElectronApplication;
  let window: Page;
  let userDataDir: string;

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'teamx-e2e-'));
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
    // Wait for the app shell brand to render so we know the React
    // tree mounted before issuing keyboard events.
    await expect(window.getByText('Strategia-X', { exact: true })).toBeVisible();
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
      const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 5000));
      await Promise.race([closePromise, timeoutPromise]);
      if (!closedCleanly) {
        try {
          const proc = app.process();
          if (proc && proc.exitCode === null && !proc.killed) {
            proc.kill('SIGKILL');
          }
        } catch {
          /* process already disposed */
        }
      }
    }
    rmSync(userDataDir, { recursive: true, force: true });
  });

  test('parse → confirm → execute → history round-trip', async () => {
    const log = (msg: string) => console.log(`[e2e:palette] ${msg}`);
    log('test body entered');

    // --- 1. Ctrl+K opens the palette ---------------------------------------
    await window.keyboard.press('Control+k');
    const dialog = window.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    // The DialogTitle is sr-only — assert via accessible name.
    await expect(dialog).toHaveAccessibleName(/Command Palette/i);
    log('palette opened via Ctrl+K');

    // --- 2. Type a canned hire command ------------------------------------
    const input = dialog.getByRole('textbox', { name: 'Command input' });
    await expect(input).toBeVisible();
    await input.fill('hire a senior frontend engineer');
    log('typed hire input');

    // --- 3. Wait for the ready state (chips + Enter-to-run hint) -----------
    // The palette debounces parse ~200ms. Give it up to 8s to account for
    // cold React Query + the canned classifier + resolver + slot-filler.
    const intentChip = dialog.locator('[aria-label^="Intent:"]');
    await expect(intentChip).toBeVisible({ timeout: 10_000 });
    await expect(intentChip).toHaveAccessibleName(/Hire Employee/);
    log('intent chip = Hire Employee');

    // Role entity chip — label is "Entity <key>: <value>". The canned
    // table maps "hire a senior frontend engineer" → roleQuery: "Growth
    // Marketer" (the plan's exemplar role isn't in the bundled pack,
    // so the canned table redirects to an existing one).
    const entityChip = dialog.locator('[aria-label^="Entity"]');
    await expect(entityChip.first()).toBeVisible();
    const entityText = await entityChip.first().getAttribute('aria-label');
    expect(entityText).toMatch(/Entity /);
    log(`entity chip: ${entityText}`);

    // Ready-state hint: "Press Enter to run".
    await expect(dialog.getByText(/Press .+ to run/)).toBeVisible();
    log('ready state hint visible');

    // --- 4. Enter fires execute, palette closes ---------------------------
    await window.keyboard.press('Enter');
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    log('palette closed after Enter');

    // --- 5. Hired employee appears in the sidenav --------------------------
    // The sidenav re-renders when `useEmployees` refetches, which is
    // triggered by the execute mutation's invalidation. Seeded Mateo
    // Reyes is still there; the new hire is an additional row.
    const teamHeader = window.getByRole('button', { name: /Hire/i }).first();
    await expect(teamHeader).toBeVisible();

    // Capture the new hire's name. The canned hire names are
    // `New Hire <6char>`, so match by a substring — the sidenav
    // button's accessible name starts with the initials ("NH New
    // Hire <id> ...") so an anchored regex would fail.
    const newHireRow = window.locator('aside button', {
      hasText: /New Hire /,
    });
    await expect(newHireRow).toBeVisible({ timeout: 15_000 });
    const hireRowText = await newHireRow.textContent();
    expect(hireRowText).toMatch(/New Hire /);
    // Extract the short random suffix so we can disambiguate from
    // any future New Hire rows that happen to share the prefix.
    const hireName = (hireRowText?.match(/New Hire \S+/)?.[0] ?? '').trim();
    expect(hireName.length).toBeGreaterThan('New Hire '.length);
    log(`new hire detected: "${hireName}"`);

    // --- 6. Fire: open palette, type "fire <name>" -------------------------
    await window.keyboard.press('Control+k');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    const input2 = dialog.getByRole('textbox', { name: 'Command input' });
    await input2.fill(`fire ${hireName}`);
    log('typed fire command');

    // --- 7. Destructive confirmation gate appears --------------------------
    await expect(dialog.getByText('Confirm destructive action')).toBeVisible({
      timeout: 10_000,
    });
    const confirmBtn = dialog.getByRole('button', { name: 'Confirm' });
    const cancelBtn = dialog.getByRole('button', { name: 'Cancel' });
    await expect(confirmBtn).toBeVisible();
    await expect(cancelBtn).toBeVisible();
    log('destructive gate visible (Confirm + Cancel both present)');

    // --- 8. Cancel → palette stays open, then Esc to close -----------------
    // Cancel resets the palette to an empty-input state inside the
    // same dialog rather than closing it (that's T6's documented UX
    // so the user can quickly re-type). We then press Esc to close
    // the dialog entirely.
    await cancelBtn.click();
    await expect(dialog.getByText('Confirm destructive action')).not.toBeVisible();
    await window.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    log('Cancel cleared the gate, Esc closed the palette');

    // --- 9. Employee still present -----------------------------------------
    // The sidenav should still show the new hire since we cancelled.
    await expect(newHireRow).toBeVisible();
    log('employee survived Cancel');

    // --- 10. Re-open, re-type fire, click Confirm --------------------------
    await window.keyboard.press('Control+k');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    const input3 = dialog.getByRole('textbox', { name: 'Command input' });
    await input3.fill(`fire ${hireName}`);
    const confirmBtn2 = dialog.getByRole('button', { name: 'Confirm' });
    await expect(confirmBtn2).toBeVisible({ timeout: 10_000 });
    await confirmBtn2.click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    log('palette closed after Confirm');

    // --- 11. Employee row disappears ---------------------------------------
    await expect(newHireRow).not.toBeVisible({ timeout: 15_000 });
    log('new hire row removed from sidenav');

    // --- 12. Dashboard Commands subview shows both commands ----------------
    // Dashboard tab is active by default; switch to the Commands
    // subtab and assert two rows are present.
    const commandsSubtab = window.getByRole('button', { name: /^Commands$/ });
    await commandsSubtab.click();
    const commandsView = window.locator('[data-testid="commands-view"]');
    await expect(commandsView).toBeVisible();
    const commandsList = window.locator('[data-testid="commands-list"]');
    await expect(commandsList).toBeVisible({ timeout: 5_000 });
    // Two rows — newest (fire_employee) first, hire_employee below.
    const commandRows = commandsList.locator('button');
    await expect(commandRows).toHaveCount(2, { timeout: 10_000 });
    log('commands-list has 2 rows');

    // The newest row should reference the fire command.
    const firstRow = commandRows.first();
    await expect(firstRow).toContainText(/fire /i);
    // The second row should reference the hire command.
    const secondRow = commandRows.nth(1);
    await expect(secondRow).toContainText(/hire /i);
    log('fire row is newest, hire below — assertions passed');
  });

  test('Esc closes palette; ArrowUp cycles history from empty input', async () => {
    const log = (msg: string) => console.log(`[e2e:palette-2] ${msg}`);

    // --- 1. Open + Esc closes ----------------------------------------------
    await window.keyboard.press('Control+k');
    const dialog = window.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await window.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    log('Esc closes palette');

    // --- 2. Execute one hire so there's history to cycle -------------------
    await window.keyboard.press('Control+k');
    await expect(dialog).toBeVisible();
    const input = dialog.getByRole('textbox', { name: 'Command input' });
    const hireText = 'hire a growth marketer';
    await input.fill(hireText);
    // Wait for ready state so Enter dispatches rather than being absorbed.
    await expect(dialog.locator('[aria-label^="Intent:"]')).toBeVisible({ timeout: 10_000 });
    await window.keyboard.press('Enter');
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    log('first hire command executed');

    // --- 3. Re-open, press ArrowUp on empty input --------------------------
    await window.keyboard.press('Control+k');
    await expect(dialog).toBeVisible();
    const input2 = dialog.getByRole('textbox', { name: 'Command input' });
    await expect(input2).toHaveValue('');
    await input2.focus();
    await window.keyboard.press('ArrowUp');
    // The history picker fills the input with the most recent command text.
    // Give the history query up to a few seconds to resolve from the
    // background fetch kicked off on palette open.
    await expect(input2).toHaveValue(hireText, { timeout: 10_000 });
    log('ArrowUp loaded prior command into input');
  });
});
