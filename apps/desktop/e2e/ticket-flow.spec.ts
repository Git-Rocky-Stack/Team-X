/**
 * Phase 2 end-to-end ticket-flow test.
 *
 * Exercises the complete Phase 2 demo scenario against a real Electron
 * instance with `NODE_ENV=test` (canned test-mode provider, no
 * network). Validates the full ticket lifecycle:
 *
 *   1. Boot → assert app shell (Strategia-X brand + Phase 2 badge)
 *   2. Navigate to the Tickets view via the top-bar tab
 *   3. Verify the empty kanban board renders with four columns
 *   4. Open the Create Ticket dialog
 *   5. Fill in title, description, priority, and assign to the SWE
 *   6. Submit → ticket appears in the "In Progress" kanban column
 *   7. Click the ticket card → detail panel opens with the ticket info
 *   8. Wait for the canned test-mode agent reply in the discussion thread
 *
 * The agent response flows through: tickets.create IPC handler →
 * orchestrator.enqueueChat → runAgent → test-mode stream → events →
 * ticket detail refetch (3s interval). The test waits up to 20s for
 * the reply to surface in the detail panel.
 *
 * Same isolation model as smoke.spec.ts: each test gets a fresh
 * `--user-data-dir=<tmp>` so the SQLite DB never collides with the
 * dev database or other test runs.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { join } from 'node:path';
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

/**
 * The canned reply the test-mode provider streams. Must match the
 * `TEST_MODE_REPLY` constant in `provider-factory.ts`.
 */
const TEST_MODE_REPLY = 'Our top priority this week is shipping the Phase 1 demo.';

// Serial — one Electron instance per host at a time.
test.describe.configure({ mode: 'serial' });

test.describe('Team-X Phase 2 ticket flow', () => {
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

  test('files a ticket, assigns to SWE, agent replies via test-mode provider', async () => {
    const log = (msg: string) => console.log(`[e2e:ticket] ${msg}`);
    log('test body entered');

    // --- 1. App shell renders ------------------------------------------------
    await expect(window.getByText('Strategia-X', { exact: true })).toBeVisible();
    log('Strategia-X visible');
    await expect(window.getByText('Phase 5', { exact: true })).toBeVisible();
    log('Phase 5 badge visible');

    // --- 2. Seeded employees present (needed for assignment) -----------------
    const sweCard = window.locator('button[aria-label^="Mateo Reyes, Senior Fullstack Engineer"]');
    await expect(sweCard).toBeVisible();
    log('SWE card visible');

    // --- 3. Navigate to Tickets view ----------------------------------------
    const ticketsTab = window.getByRole('button', { name: 'Tickets' });
    await ticketsTab.click();
    log('Tickets tab clicked');

    // Verify kanban columns render (the column headers are uppercase labels)
    await expect(window.getByText('Open', { exact: true })).toBeVisible();
    await expect(window.getByText('In Progress', { exact: true })).toBeVisible();
    await expect(window.getByText('Done', { exact: true })).toBeVisible();
    log('kanban columns visible');

    // --- 4. Open Create Ticket dialog ---------------------------------------
    const createBtn = window.locator('button[aria-label="Create ticket"]');
    await expect(createBtn).toBeVisible();
    await createBtn.click();
    log('Create Ticket dialog opened');

    // --- 5. Fill in ticket fields -------------------------------------------
    const ticketTitle = 'Research React 19 Server Components';
    const ticketDesc =
      'Look up the latest patterns for React Server Components and summarize key findings.';

    const titleInput = window.locator('#ticket-title');
    await expect(titleInput).toBeVisible();
    await titleInput.fill(ticketTitle);
    log('title filled');

    const descInput = window.locator('#ticket-desc');
    await descInput.fill(ticketDesc);
    log('description filled');

    // Set priority to High
    const prioritySelect = window.locator('#ticket-priority');
    await prioritySelect.selectOption('high');
    log('priority set to high');

    // Assign to SWE (Mateo Reyes)
    const assigneeSelect = window.locator('#ticket-assignee');
    // The option text is "Mateo Reyes (Senior Fullstack Engineer)".
    // selectOption with label: string matches the visible text.
    await assigneeSelect.selectOption({ label: 'Mateo Reyes (Senior Fullstack Engineer)' });
    log('assignee set to SWE');

    // --- 6. Submit the ticket -----------------------------------------------
    // Use type="submit" to disambiguate from the kanban "Create ticket"
    // button (Playwright getByRole name matching is case-insensitive).
    const submitBtn = window.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();
    log('Create Ticket submitted');

    // Dialog closes after successful creation
    await expect(titleInput).not.toBeVisible({ timeout: 5000 });
    log('dialog closed');

    // --- 7. Ticket appears in In Progress column ----------------------------
    // Since we assigned immediately, the ticket transitions to in-progress.
    // The ticket card renders the title as an h4 inside a button.
    const ticketCard = window.getByText(ticketTitle, { exact: true });
    await expect(ticketCard).toBeVisible({ timeout: 10_000 });
    log('ticket card visible in kanban');

    // --- 8. Click ticket card → detail panel opens --------------------------
    await ticketCard.click();
    log('ticket card clicked');

    // The detail panel has a border-l and renders the title as an h2.
    // Scope all subsequent assertions to the detail panel to avoid
    // strict-mode violations from duplicate text in the kanban card.
    const detailPanel = window.locator('.border-l.border-border').first();
    const detailTitle = detailPanel.locator('h2').filter({ hasText: ticketTitle });
    await expect(detailTitle).toBeVisible({ timeout: 5000 });
    log('ticket detail panel open');

    // Verify the ticket description inside the detail panel. The text
    // also appears in the initial message, so scope to the <p> tag
    // (the detail description paragraph, not the message <div>).
    await expect(detailPanel.locator('p').filter({ hasText: ticketDesc })).toBeVisible({
      timeout: 10_000,
    });
    log('ticket description visible in detail');

    // --- 9. Wait for agent reply in ticket thread ---------------------------
    // The orchestrator fires the agent after ticket creation. The
    // test-mode provider streams the canned reply. The detail panel
    // polls via useTicketDetail (refetchInterval: 3s), so the reply
    // should appear within a few seconds. Scope to detail panel to
    // avoid matching any streaming preview in the dashboard.
    await expect(detailPanel.getByText(TEST_MODE_REPLY)).toBeVisible({ timeout: 20_000 });
    log('agent canned reply visible in ticket thread');
  });
});
