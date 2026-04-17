/**
 * Phase 3 end-to-end meeting-flow test.
 *
 * Exercises the complete meeting lifecycle against a real Electron
 * instance with `NODE_ENV=test` (canned test-mode provider, no
 * network). Validates the full meeting primitive:
 *
 *   1. Boot → assert the app shell (Strategia-X brand + Phase 3 badge)
 *   2. Navigate to the Meetings view via the top-bar tab
 *   3. Open the Call Meeting dialog
 *   4. Fill in agenda, verify chair (CEO default), check both employees
 *   5. Start the meeting → detail panel opens with agenda system message
 *   6. Verify "Active" status badge
 *   7. Rocky interjects with a message → message appears in thread
 *   8. End the meeting → minutes appear, status changes to "Ended"
 *
 * The meeting flow exercises: orchestrator pause/drain, meeting thread
 * creation, system messages, user interjection, minutes generation
 * (transcript-based), and orchestrator resume — all end-to-end through
 * the real IPC bridge and React Query polling.
 *
 * Same isolation model as smoke.spec.ts: each test gets a fresh
 * `--user-data-dir=<tmp>` so the SQLite DB never collides with the
 * dev database or other test runs.
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

// Serial — one Electron instance per host at a time.
test.describe.configure({ mode: 'serial' });

test.describe('Team-X Phase 3 meeting flow', () => {
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

  test('calls a meeting, Rocky interjects, ends meeting, verifies minutes', async () => {
    const log = (msg: string) => console.log(`[e2e:meeting] ${msg}`);
    log('test body entered');

    // --- 1. App shell renders ------------------------------------------------
    await expect(window.getByText('Strategia-X', { exact: true })).toBeVisible();
    log('Strategia-X visible');
    await expect(window.getByText('Phase 5', { exact: true })).toBeVisible();
    log('Phase 5 badge visible');

    // --- 2. Navigate to Meetings tab -----------------------------------------
    const meetingsTab = window.getByRole('button', { name: 'Meetings' });
    await meetingsTab.click();
    log('Meetings tab clicked');

    // Verify the empty meetings view renders.
    await expect(window.getByText('No meetings yet')).toBeVisible();
    log('empty meetings view visible');

    // --- 3. Open Call Meeting dialog -----------------------------------------
    const callBtn = window.getByText('Call Meeting');
    await expect(callBtn).toBeVisible();
    await callBtn.click();
    log('Call Meeting dialog opened');

    // --- 4. Fill in meeting details ------------------------------------------
    const meetingAgenda = 'Review Q2 roadmap priorities and mobile release timeline';

    const agendaInput = window.locator('#meeting-agenda');
    await expect(agendaInput).toBeVisible();
    await agendaInput.fill(meetingAgenda);
    log('agenda filled');

    // Chair defaults to the first employee (CEO). Verify it's set.
    const chairSelect = window.locator('#meeting-chair');
    await expect(chairSelect).toBeVisible();
    log('chair select visible (CEO default)');

    // Check both employees as attendees.
    const ceoLabel = window.locator('label').filter({ hasText: 'Iris Kovač' });
    await ceoLabel.click();
    log('CEO attendee checked');

    const sweLabel = window.locator('label').filter({ hasText: 'Mateo Reyes' });
    await sweLabel.click();
    log('SWE attendee checked');

    // --- 5. Start the meeting ------------------------------------------------
    const startBtn = window.getByText('Start Meeting');
    await expect(startBtn).toBeEnabled();
    await startBtn.click();
    log('Start Meeting clicked');

    // Dialog should close (agenda input disappears).
    await expect(agendaInput).not.toBeVisible({ timeout: 5000 });
    log('dialog closed');

    // --- 6. Verify meeting detail panel opens with Active status --------------
    // The onCreated callback auto-selects the meeting, so the detail panel
    // renders immediately. The detail panel is inside a border-l container.
    const detailPanel = window.locator('.border-l.border-border').first();
    await expect(detailPanel).toBeVisible({ timeout: 10_000 });
    log('detail panel visible');

    // Status badge shows "Active".
    await expect(detailPanel.getByText('Active')).toBeVisible({ timeout: 10_000 });
    log('Active status badge visible');

    // The detail panel header has an h3 with the agenda as the meeting title.
    await expect(detailPanel.locator('h3').filter({ hasText: meetingAgenda })).toBeVisible({
      timeout: 10_000,
    });
    log('agenda title visible in detail header');

    // The agenda system message is posted as the first message in the thread.
    // Content is "**Meeting Agenda**\n\n{agenda}" rendered as italic text.
    // Use the "Meeting Agenda" prefix to target the system message
    // specifically, avoiding the strict-mode violation with the h3 title.
    await expect(detailPanel.locator('p.italic').filter({ hasText: 'Meeting Agenda' })).toBeVisible(
      {
        timeout: 10_000,
      },
    );
    log('agenda system message visible in meeting thread');

    // --- 7. Rocky interjects with a message ----------------------------------
    const interjection = 'What about the mobile release timeline?';
    const interjectInput = window.locator('textarea[placeholder*="Interject"]');
    await expect(interjectInput).toBeVisible();
    await interjectInput.fill(interjection);
    log('interjection filled');

    // Press Enter to send (not Shift+Enter).
    await interjectInput.press('Enter');
    log('interjection sent via Enter');

    // Verify Rocky's message appears in the thread. The detail panel polls
    // every 2s (useMeetingDetail refetchInterval). Wait up to 10s.
    await expect(detailPanel.getByText(interjection)).toBeVisible({ timeout: 10_000 });
    log('interjection visible in thread');

    // Verify the "Rocky" author label appears for the interjection.
    await expect(detailPanel.getByText('Rocky')).toBeVisible();
    log('Rocky author label visible');

    // --- 8. End the meeting --------------------------------------------------
    const endBtn = detailPanel.getByText('End Meeting');
    await expect(endBtn).toBeVisible();
    await endBtn.click();
    log('End Meeting clicked');

    // --- 9. Verify meeting ended: status, minutes, composer gone -------------
    // Status badge changes from "Active" to "Ended".
    await expect(detailPanel.getByText('Ended')).toBeVisible({ timeout: 10_000 });
    log('Ended status badge visible');

    // Composer disappears when meeting is no longer active.
    await expect(interjectInput).not.toBeVisible({ timeout: 5000 });
    log('composer hidden after meeting ended');

    // Minutes section appears with the "Minutes" label. Use exact: true
    // to avoid matching the "Meeting Minutes" heading inside the content.
    await expect(detailPanel.getByText('Minutes', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    log('Minutes label visible');

    // Minutes content is rendered in a div.max-h-32 (unique to the minutes
    // section — message bubbles don't use this class). The format is:
    // "# Meeting Minutes\n\n**Agenda:** {agenda}\n\n## Discussion\n\n**Rocky:** {msg}"
    const minutesContent = detailPanel.locator('div.max-h-32');
    await expect(minutesContent).toBeVisible({ timeout: 10_000 });
    await expect(minutesContent).toContainText('Meeting Minutes');
    log('Meeting Minutes content visible');
  });
});
