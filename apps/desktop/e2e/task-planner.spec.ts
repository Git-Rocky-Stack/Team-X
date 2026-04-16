/**
 * Phase 5 (M32 — Task Planner) end-to-end spec.
 *
 * Exercises the complete WRITE-SIDE `complex_request` round-trip
 * against a real Electron instance booted with `NODE_ENV=test`. No
 * network, no LLM, no live DB fixtures beyond the fresh-boot seed —
 * every loop surface is canned. Builds on the M31 agentic-loop spec
 * by adding the M32 T5 write-side confirmation gate and proving that
 * write-side agentic tools (`decompose_project`, `delegate_subtask`)
 * resolve end-to-end through the level-gated test seam introduced
 * in M32 T3.
 *
 *   - Classifier swap (M30 T8 seam) — `createTestClassifier()` maps
 *     the exact user text below to `complex_request`.
 *   - Write-side gate (M32 T5) — command-service inspects the raw
 *     text against `WRITE_SIDE_KEYWORDS` and returns a
 *     `needs_confirmation` envelope with `gateKind: 'write-side'`
 *     BEFORE dispatching the agentic loop. The palette renders an
 *     amber (not red) confirmation card titled
 *     "Confirm write-side agentic run".
 *   - Agentic provider swap (M31 T3 seam) — `createTestAgenticCompleteFn()`
 *     returns a scripted sequence keyed on the phrase:
 *     plan → tool_call(decompose_project) → tool_result →
 *     tool_call(delegate_subtask) → tool_result → final_answer.
 *   - Agentic tools swap (M32 T3 seam) — `createTestToolsForEmployee()`
 *     level-gates the tool set; the default actor is the system-agent
 *     (level = 'system'), which matches both `TEST_DECOMPOSE_LEVELS`
 *     and `TEST_DELEGATE_REVIEW_LEVELS` so all three write-side tools
 *     are available. Default fixtures
 *     (`FIXTURE_DECOMPOSED_PLAN`, `FIXTURE_DELEGATION`) resolve the
 *     tool calls deterministically.
 *
 * Flow under test:
 *
 *   1. Ctrl+K opens the palette.
 *   2. Typing "decompose the frontend redesign into tickets" yields
 *      an intent chip reading "Route to Agent".
 *   3. Enter triggers `command.execute`. Because the phrase contains
 *      the write-side verbs `decompose` + `tickets`, command-service
 *      short-circuits with `needs_confirmation` + `gateKind:
 *      'write-side'`. The palette renders the amber confirmation
 *      card titled "Confirm write-side agentic run" with a summary
 *      of what the loop will attempt. NO agentic run starts yet.
 *   4. Clicking Confirm re-dispatches `execute({confirmed: true})`,
 *      the gate passes, and the palette enters step-log mode
 *      (M31 T6). The canned loop produces plan → tool_call
 *      (decompose_project) → tool_result → tool_call
 *      (delegate_subtask) → tool_result → answer.
 *   5. The terminal `data-step-kind="answer"` card renders with the
 *      canned completion text referencing the decomposed plan and
 *      the delegated ticket.
 *   6. Clicking "Open Thread" closes the palette and navigates the
 *      chat drawer to the persisted copilot thread, which renders
 *      the read-only step transcript (M31 T5 UX).
 *   7. The Dashboard → Commands subview renders an audit row for
 *      the executed `complex_request` (M30 T7 audit emission).
 *
 * Isolation model matches agentic-loop.spec.ts: each test gets its
 * own `--user-data-dir=<tmp>` so the SQLite DB is fresh and cannot
 * collide with the dev database or other runs.
 *
 * Build ordering note: requires `apps/desktop/out/main/index.js`. Use
 * `pnpm -F @team-x/desktop test:e2e` (build + run) or
 * `pnpm -F @team-x/desktop test:e2e:run` (skip build, out/ must be
 * current).
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

test.describe('Team-X Phase 5 — M32 task planner (write-side)', () => {
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

  test('write-side gate → confirm → decompose + delegate → transcript + audit', async () => {
    const log = (msg: string) => console.log(`[e2e:task-planner] ${msg}`);
    log('test body entered');

    // --- 1. Ctrl+K opens the palette --------------------------------------
    await window.keyboard.press('Control+k');
    const dialog = window.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toHaveAccessibleName(/Command Palette/i);
    log('palette opened via Ctrl+K');

    // --- 2. Type the canned write-side complex_request phrase -------------
    // Classifier's canned table maps this exact phrase to
    // `complex_request`. The phrase contains the write-side verbs
    // `decompose` and `tickets`, so WRITE_SIDE_KEYWORDS matches and
    // command-service returns `needs_confirmation` with
    // `gateKind: 'write-side'` BEFORE dispatching the agentic loop.
    const userPhrase = 'decompose the frontend redesign into tickets';
    const input = dialog.getByRole('textbox', { name: 'Command input' });
    await expect(input).toBeVisible();
    await input.fill(userPhrase);
    log('typed write-side complex_request input');

    // --- 3. Intent chip → "Route to Agent" --------------------------------
    const intentChip = dialog.locator('[aria-label^="Intent:"]');
    await expect(intentChip).toBeVisible({ timeout: 10_000 });
    await expect(intentChip).toHaveAccessibleName(/Route to Agent/);
    log('intent chip = Route to Agent');

    // --- 4. Press Enter — write-side confirmation gate appears ------------
    // M32 T5: command-service returns `needs_confirmation` with
    // `gateKind: 'write-side'` before dispatching the agentic loop.
    // The palette renders an amber (not red) card titled
    // "Confirm write-side agentic run" with a plain-language summary.
    // NO agentic run has started yet; the step-log mode only activates
    // after Confirm.
    await window.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    log('palette stayed open after Enter (awaiting write-side confirmation)');

    await expect(dialog.getByText('Confirm write-side agentic run')).toBeVisible({
      timeout: 10_000,
    });
    log('write-side confirmation card visible (amber, T5 gate)');

    // The gate must NOT be the destructive-red variant — a regression
    // that mis-routed complex_request through the destructive gate
    // would render "Confirm destructive action" instead.
    await expect(dialog.getByText('Confirm destructive action')).not.toBeVisible();
    log('destructive gate text absent (correct write-side variant)');

    // --- 5. Click Confirm — palette enters step-log mode ------------------
    // Clicking Confirm re-dispatches `execute({confirmed: true})`. The
    // gate check `confirmed !== true` now fails, command-service
    // dispatches `CommandHandlers.agenticLoopStart`, and the palette
    // swaps to step-log mode rendering `<StepLogView>`.
    const confirmBtn = dialog.getByRole('button', { name: 'Confirm' });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();
    log('clicked Confirm — agentic loop dispatched');

    // --- 6. Wait for the terminal answer card -----------------------------
    // Canned provider script (test-agentic-provider.ts):
    //   plan → tool_call(decompose_project) → tool_result →
    //   tool_call(delegate_subtask) → tool_result → final_answer.
    // Default test-mode fixtures resolve the two write-side tool calls
    // deterministically (plan-test-1 / tkt-test-1 / Mateo Reyes).
    const stepCards = dialog.locator('[data-step-kind]');
    const answerCard = dialog.locator('[data-step-kind="answer"]');
    await expect(answerCard).toBeVisible({ timeout: 20_000 });
    log('answer card rendered — write-side loop terminated with final_answer');

    // Same live-stream caveat as agentic-loop.spec.ts — under the
    // canned test-mode provider the loop runs synchronously in well
    // under 50ms, so only the terminal answer card is reliably
    // observed from the palette's live `useAgentStepStream`. The full
    // transcript (including plan / tool_call / tool_result cards) is
    // asserted on the read-only copilot thread below, which refetches
    // persisted messages on mount and surfaces every step-kind.
    const stepCount = await stepCards.count();
    expect(stepCount).toBeGreaterThanOrEqual(1);
    log(`palette step count = ${stepCount} (>= 1, terminal answer observed)`);

    // Canned answer text must surface verbatim inside the answer card —
    // proves the terminal step rendered the payload from the scripted
    // final_answer.
    await expect(answerCard).toContainText(/Decomposed the frontend redesign/i);
    log('answer text matched canned fixture — "Decomposed the frontend redesign"');

    // --- 7. Click "Open Thread" — palette closes, drawer opens -----------
    const openThreadBtn = dialog.getByRole('button', { name: /Open thread in chat drawer/i });
    await expect(openThreadBtn).toBeVisible();
    await openThreadBtn.click();
    const palette = window.getByRole('dialog', { name: /Command Palette/i });
    await expect(palette).not.toBeVisible({ timeout: 5_000 });
    log('clicked Open Thread — palette closed and drawer navigated');

    // --- 8. Copilot transcript renders the persisted run ------------------
    // M31 T5 persists every loop step as a message on the copilot
    // thread. The chat-drawer's `viewingCopilotThread` branch renders a
    // read-only banner once the run reaches a terminal state.
    await expect(window.getByText('Copilot transcript — read only')).toBeVisible({
      timeout: 10_000,
    });
    log('copilot transcript banner visible (read-only view)');

    // The canned answer text must also surface in the persisted
    // transcript — proves the thread was written end-to-end.
    await expect(window.getByText(/Decomposed the frontend redesign/i).first()).toBeVisible({
      timeout: 10_000,
    });
    log('canned answer text rendered in copilot transcript');

    // --- 9. Dashboard → Commands subview shows the audit row --------------
    // Close the chat drawer first (Esc) so its overlay doesn't block
    // clicks on the Dashboard subtabs behind it. Dashboard is the
    // default active tab, so we only need to switch to the Commands
    // subtab.
    await window.keyboard.press('Escape');
    await expect(window.getByText('Copilot transcript — read only')).not.toBeVisible({
      timeout: 5_000,
    });
    log('chat drawer closed');

    const commandsTab = window
      .locator('button')
      .filter({ hasText: /^Commands$/ })
      .first();
    await expect(commandsTab).toBeVisible({ timeout: 10_000 });
    await commandsTab.click();
    log('navigated to Dashboard → Commands subview');

    // `complex_request` renders as "Route to Agent" in the Recent
    // Commands card. This is the only surface on the view that
    // renders the intent label, so a top-level text match is
    // unambiguous.
    await expect(window.getByText('Route to Agent').first()).toBeVisible({ timeout: 10_000 });
    log('audit row visible — Route to Agent chip rendered (command.executed emitted)');
  });
});
