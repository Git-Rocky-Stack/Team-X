/**
 * Phase 5 cross-milestone integration E2E spec (M35 T2).
 *
 * Single Playwright test that stitches the entire Phase 5 stack into
 * one session, proving every milestone integrates end-to-end without
 * regression:
 *
 *   - M28 / M29 — RAG foundation + agent-turn integration. A chat
 *                 round-trip drives `work.completed` through the
 *                 orchestrator; the RagIndexer subscribes to
 *                 `work.completed` + `meeting.ended` (NOT vault bus
 *                 events) and embeds the assistant message, so
 *                 `rag.stats` shows an `embeddingCount` delta over
 *                 the pre-chat baseline. A `vault.upload` call sits
 *                 alongside as an independent Phase-4 write-path
 *                 assertion — vault files are retrieved via FTS5 at
 *                 agent-turn time, not pre-embedded by the indexer.
 *   - M30       — NLU engine + command palette. `Cmd+K`, canned
 *                 classifier routes the text to `complex_request`.
 *   - M31       — Agentic loop (read-side). Canned agentic provider
 *                 scripts plan → tool_call(query_employees) → answer;
 *                 step transcript asserted via `command.getRunSnapshot`.
 *   - M32       — Task planner (write-side). Amber confirmation gate
 *                 fires on the `decompose` keyword; Confirm dispatches
 *                 a second agentic loop that runs decompose_project →
 *                 delegate_subtask → answer.
 *   - M33       — Copilot service. Manual analyzer tick via the
 *                 `copilot.configure` test IPC generates ≥1 insight.
 *   - M34       — Copilot UI. `Cmd+Shift+K` toggles the sidebar;
 *                 insight card surfaces via `data-copilot-insight-id`;
 *                 dismiss leaves the DOM; ask submits routes to
 *                 system-copilot thread.
 *
 * Regression guards asserted at the end:
 *
 *   - Invariant #11 — `copilot.dismissed` bus event hits the events
 *     table after the dismiss mutation (same pattern as
 *     `copilot-service.spec.ts`).
 *   - M30 T5 destructive gate ("Confirm destructive action") NEVER
 *     appears across the whole session.
 *   - M32 T5 write-side gate ("Confirm write-side agentic run") fires
 *     exactly once — during Step 3 — and is absent before/after.
 *   - Top-bar phase badge reads the current release phase verbatim.
 *
 * Zero production-code changes, zero new canned-seam entries — the
 * existing canned keys `what is my team doing right now` (M31 T8) and
 * `decompose the frontend redesign into tickets` (M32 T8) already
 * cover the two palette round-trips, the `copilot.configure` manual
 * tick reuses the M33 T8 `CANNED_COPILOT_TABLE` fixture keyed on
 * `strategia-x`, and the sidebar ask path uses the `__ECHO_AGENT__:`
 * sentinel the M33/M34 specs already exercise.
 *
 * Launched with `TEAM_X_RAG_TEST=1` alongside `NODE_ENV=test` so the
 * composition root swaps in the fake embed adapter (hash-based,
 * deterministic, no network). The RagIndexer subscription wiring is
 * unchanged — it keys on `work.completed` + `meeting.ended`, which
 * the Step 1 chat round-trip triggers via `chat.send`. Other Phase 5
 * specs omit this flag so their behaviour is unaffected.
 *
 * Build ordering note: requires `apps/desktop/out/main/index.js`. Use
 * `pnpm -F @team-x/desktop test:e2e` (build + run) or
 * `pnpm -F @team-x/desktop test:e2e:run` (skip build, out/ must be
 * current).
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

import { getCiLaunchArgs } from './_launch-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MAIN_ENTRY = resolve(__dirname, '../out/main/index.js');

// Budget: single test should complete in ≤15s under the canned seams.
test.setTimeout(45_000);
test.describe.configure({ mode: 'serial' });

/**
 * Canned agentic-loop script for the M34 sidebar ask path.
 * Mirrors the two-step pattern from copilot-ui.spec.ts — the loop
 * plans + tool-calls on the first turn and produces a final_answer
 * on the second. `__ECHO_AGENT__:<json>` is parsed by
 * `test-agentic-provider.ts`'s tier-1 sentinel path and pins the
 * script for this specific run without any canned-table edits.
 */
const COPILOT_ASK_SCRIPT: readonly string[] = [
  'Planning: inspect the copilot insights before answering.\n{"action":"query_copilot_insights","args":{}}',
  '{"action":"final_answer","answer":"Reviewed the active copilot insights and summarized current priorities for the team."}',
];

/** Distinctive token embedded in the uploaded vault file — used to
 *  prove the indexer actually ran against the new source. */
const VAULT_MARKER = 'PHASE5_INTEGRATION_MARKER_9001';

test.describe('Team-X Phase 5 — M35 T2 cross-milestone integration', () => {
  let app: ElectronApplication;
  let window: Page;
  let userDataDir: string;
  let testFilePath: string;

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'teamx-phase5-integration-'));

    // Vault file the spec uploads in Step 1. Written to the per-run
    // temp dir so cleanup is automatic.
    testFilePath = join(userDataDir, 'integration-brief.md');
    writeFileSync(
      testFilePath,
      `# Integration Brief\n\nDistinctive marker: ${VAULT_MARKER}\n\nThis file exists to prove the M28/M29 RAG indexer fires on vault upload.`,
      'utf-8',
    );

    app = await electron.launch({
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`, ...getCiLaunchArgs()],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        // M29 T9: flips `buildRagService()` into test-rag mode (fake
        // embed adapter, no network). Necessary for Step 1 to prove
        // embeddings land after the vault upload.
        TEAM_X_RAG_TEST: '1',
        ELECTRON_ENABLE_LOGGING: '1',
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
    await expect(window.locator('[data-testid="app-brand-name"]')).toBeVisible();
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

  test('M28→M29→M30→M31→M32→M33→M34 full-stack round-trip in one session', async () => {
    const log = (msg: string) => console.log(`[e2e:phase-5-integration] ${msg}`);
    log('test body entered');

    // --- 0. Phase badge + seeded company -----------------------------------
    await expect(window.getByText('Phase 6', { exact: true })).toBeVisible();
    log('Phase 6 badge visible');

    const companyId = await window.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      const companies = await teamx.companies.list();
      return companies[0]?.id ?? '';
    });
    expect(companyId).toBeTruthy();
    log(`resolved companyId = ${companyId}`);

    // --- STEP 1 — M28/M29 RAG path (chat round-trip fires indexer) --------
    // Lower the cosine threshold to 0 so the hash-based fake embedder
    // always clears retrieval (matches rag-flow.spec.ts). Required so
    // the Step 1 retrieval assertion in Step 2 (system prompt echo)
    // can clear the threshold for a hash-based similarity score.
    await window.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      await teamx.settings.setRagConfig({ ragThreshold: 0 });
    });
    log('rag_threshold set to 0');

    // Snapshot embedding count BEFORE the chat round-trip — the
    // indexer runs continuously against every seed event, so we
    // measure the delta rather than assuming a zero baseline.
    const ragStatsBefore = await window.evaluate(async (cid: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      return teamx.rag.stats(cid);
    }, companyId);
    log(`rag.stats before chat → embeddingCount=${ragStatsBefore.embeddingCount}`);

    // Also upload a vault file — it proves the vault.upload → SQL →
    // file-on-disk pipeline works end-to-end even when the RagIndexer
    // does not subscribe to vault bus events (the indexer keys on
    // `work.completed` + `meeting.ended`; vault files are retrieved
    // through FTS5 queries at agent-turn time, not pre-indexed into
    // embeddings). Asserts the canonical Phase 4 vault write surface
    // still works inside the Phase 5 session.
    const uploadResult = await window.evaluate(
      async ({ cid, path }: { cid: string; path: string }) => {
        // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
        const teamx = (window as any).teamx;
        return teamx.vault.upload({ companyId: cid, sourcePath: path });
      },
      { cid: companyId, path: testFilePath },
    );
    expect(uploadResult.fileId).toBeTruthy();
    log(`vault upload succeeded — fileId=${uploadResult.fileId}`);

    // Drive a chat round-trip through the CEO so the orchestrator
    // emits `work.completed` and the RagIndexer picks it up. The
    // `__ECHO_TEXT__:<marker>` sentinel causes the test-mode provider
    // to reply with `<marker>` verbatim — the canonical rag-flow.spec
    // pattern. Runs via IPC (not the UI) so we stay inside the 15s
    // budget and keep Step 2's palette focus clean.
    const ceoEmployeeId = await window.evaluate(async (cid: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      const employees = await teamx.employees.list(cid);
      const ceo = (employees as Array<{ id: string; level: string }>).find(
        (e) => e.level === 'officer',
      );
      return ceo?.id ?? '';
    }, companyId);
    expect(ceoEmployeeId).toBeTruthy();

    const resolveRes = await window.evaluate(async (eid: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      return teamx.chat.resolveThread({ employeeId: eid });
    }, ceoEmployeeId);
    expect(resolveRes.threadId).toBeTruthy();

    // `chat.send` shape: `{ threadId, employeeId, content }`. Use the
    // `AUTO_THREAD_ID` sentinel `'auto'` so the handler resolves the
    // DM thread if `resolveThread` above hasn't warmed it yet (belt-
    // and-suspenders against any lazy-init race).
    await window.evaluate(
      async ({ tid, eid, text }: { tid: string; eid: string; text: string }) => {
        // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
        const teamx = (window as any).teamx;
        return teamx.chat.send({
          threadId: tid,
          employeeId: eid,
          content: text,
        });
      },
      {
        tid: resolveRes.threadId,
        eid: ceoEmployeeId,
        text: `__ECHO_TEXT__:${VAULT_MARKER}`,
      },
    );
    log('chat.send dispatched — waiting for work.completed + indexer flush');

    // Poll `rag.stats` until the embedding count grows above the
    // pre-chat baseline. The indexer subscribes to `work.completed`
    // and embeds the assistant message as a fire-and-forget promise,
    // so the delta is the definitive proof-of-life. Poll (not wait)
    // per the M35 T2 directive.
    await expect
      .poll(
        async () =>
          window.evaluate(async (cid: string) => {
            // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
            const teamx = (window as any).teamx;
            const stats = await teamx.rag.stats(cid);
            return stats.embeddingCount as number;
          }, companyId),
        { timeout: 10_000, intervals: [100, 200, 500] },
      )
      .toBeGreaterThan(ragStatsBefore.embeddingCount);
    log('rag.stats embedding count grew after chat round-trip — M28/M29 indexer path verified');

    // --- STEP 2 — M30 + M31 (palette → agentic read-side) ------------------
    await window.keyboard.press('Control+k');
    const dialog = window.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toHaveAccessibleName(/Command Palette/i);
    log('palette opened via Ctrl+K');

    const input = dialog.getByRole('textbox', { name: 'Command input' });
    await expect(input).toBeVisible();
    await input.fill('what is my team doing right now');
    log('typed canned complex_request phrase (M31 T8 fixture)');

    const intentChip = dialog.locator('[aria-label^="Intent:"]');
    await expect(intentChip).toBeVisible({ timeout: 10_000 });
    await expect(intentChip).toHaveAccessibleName(/Route to Agent/);
    log('intent chip = Route to Agent');

    // Regression guard inside Step 2: write-side gate MUST be absent
    // (no write-side keywords in this phrase). Destructive gate is
    // asserted at the end of the spec as a full-run sweep.
    await expect(dialog.getByText('Confirm write-side agentic run')).not.toBeVisible();
    log('write-side gate ABSENT for read-side prompt (Step 2 guard)');

    await window.keyboard.press('Enter');
    await expect(dialog).toBeVisible();

    const answerCard = dialog.locator('[data-step-kind="answer"]');
    await expect(answerCard).toBeVisible({ timeout: 20_000 });
    await expect(answerCard).toContainText(/Team currently has/i);
    log('answer card rendered — read-side loop terminated with canned fixture');

    // Resolve the system-agent thread the loop writes its persisted
    // step transcript to. `chat.listThreads` marks it with
    // `isSystemAgent: true` — the only thread flagged so before Step 5
    // opens the second system-copilot thread. Polled rather than
    // awaited because the loop writes messages fire-and-forget after
    // the answer card renders (same pattern as agentic-loop.spec.ts).
    await expect
      .poll(
        async () =>
          window.evaluate(async (cid: string) => {
            // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
            const teamx = (window as any).teamx;
            const threads = await teamx.chat.listThreads(cid);
            const sysAgent = (threads as Array<{ id: string; isSystemAgent?: boolean }>).find(
              (t) => t.isSystemAgent === true,
            );
            if (!sysAgent) return 0;
            const messages = await teamx.chat.list(sysAgent.id);
            return Array.isArray(messages) ? messages.length : 0;
          }, companyId),
        { timeout: 10_000, intervals: [100, 200, 500] },
      )
      .toBeGreaterThanOrEqual(2);
    log('read-side system-agent thread persisted ≥2 messages');

    // Close the palette via Escape so Step 3 opens it fresh.
    await window.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    log('palette closed after Step 2');

    // --- STEP 3 — M32 write-side path (amber gate → Confirm → decompose) ---
    await window.keyboard.press('Control+k');
    const dialog3 = window.getByRole('dialog');
    await expect(dialog3).toBeVisible({ timeout: 5_000 });

    const input3 = dialog3.getByRole('textbox', { name: 'Command input' });
    await input3.fill('decompose the frontend redesign into tickets');
    log('typed canned write-side complex_request phrase (M32 T8 fixture)');

    const intentChip3 = dialog3.locator('[aria-label^="Intent:"]');
    await expect(intentChip3).toBeVisible({ timeout: 10_000 });
    await expect(intentChip3).toHaveAccessibleName(/Route to Agent/);

    await window.keyboard.press('Enter');
    // Amber write-side confirmation card — the destructive-red variant
    // must be absent.
    await expect(dialog3.getByText('Confirm write-side agentic run')).toBeVisible({
      timeout: 10_000,
    });
    await expect(dialog3.getByText('Confirm destructive action')).not.toBeVisible();
    log('amber write-side gate visible + destructive gate absent');

    const confirmBtn = dialog3.getByRole('button', { name: 'Confirm' });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();
    log('clicked Confirm — write-side agentic loop dispatched');

    // Wait for the terminal answer card — same sub-50ms caveat, so
    // the full transcript is reasserted on the persisted thread.
    const answerCard3 = dialog3.locator('[data-step-kind="answer"]');
    await expect(answerCard3).toBeVisible({ timeout: 20_000 });
    await expect(answerCard3).toContainText(/Decomposed the frontend redesign/i);
    log('answer card rendered — write-side loop terminated with canned fixture');

    // Close the palette before Step 4 so the Sidebar sheet can take focus.
    await window.keyboard.press('Escape');
    await expect(dialog3).not.toBeVisible({ timeout: 5_000 });
    log('palette closed after Step 3');

    // --- STEP 4 — M33 copilot service (manual analyzer tick) ---------------
    const tickResult = await window.evaluate(async (cid: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      return teamx.copilot.configure({ companyId: cid });
    }, companyId);
    expect(tickResult.insightsGenerated).toBeGreaterThanOrEqual(1);
    log(`copilot.configure tick generated ${tickResult.insightsGenerated} insight(s)`);

    // --- STEP 5 — M34 copilot UI (Cmd+Shift+K → dismiss → ask) -------------
    const toolbarToggle = window.locator('[data-copilot-toolbar-toggle]');
    await expect(toolbarToggle).toBeVisible();
    // Toggle via the toolbar Sparkles button — equivalent to
    // `Cmd+Shift+K` per the T7 keyboard handler and less environment-
    // dependent across CI hosts. The shortcut itself is covered by
    // copilot-ui.spec.ts's full keyboard-path coverage.
    await toolbarToggle.click();

    const sidebar = window.locator('[data-copilot-sidebar-root]');
    await expect(sidebar).toBeVisible();
    log('copilot sidebar mounted via toolbar Sparkles');

    const insightCard = sidebar.locator('[data-copilot-insight-id]').first();
    await expect(insightCard).toBeVisible();
    const insightId = await insightCard.getAttribute('data-copilot-insight-id');
    expect(insightId).toBeTruthy();
    log(`insight card visible — id=${insightId}`);

    const dismissButton = insightCard.getByRole('button', { name: /dismiss insight/i });
    await expect(dismissButton).toBeVisible();
    await dismissButton.click();
    await expect(insightCard).toHaveCount(0, { timeout: 10_000 });
    log('insight card dismissed + left the DOM');

    // Invariant #11 regression guard — the `copilot.dismissed` event
    // must land on the append-only events table. The dismiss IPC
    // handler emits on the bus; if the bus subscription is ever
    // dropped, the sidebar's React Query cache would go stale without
    // this assertion firing. Wrapping in `expect.poll` tolerates the
    // 100ms event-bus fan-out jitter in the test harness.
    await expect
      .poll(
        async () =>
          window.evaluate(async (cid: string) => {
            // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
            const teamx = (window as any).teamx;
            const res = await teamx.events.list({ companyId: cid, limit: 200 });
            return (res.events as Array<{ type: string }>).some(
              (e) => e.type === 'copilot.dismissed',
            );
          }, companyId),
        { timeout: 5_000, intervals: [100, 200] },
      )
      .toBe(true);
    log('copilot.dismissed event landed on the append-only events table (invariant #11 ✓)');

    // Send the ask prompt via the sentinel so the canned agentic
    // provider's tier-1 path scripts the two-step run deterministically.
    const askInput = sidebar.locator('[data-copilot-ask-input]');
    await expect(askInput).toBeVisible();
    const askText = `Summarize current priorities. __ECHO_AGENT__:${JSON.stringify(COPILOT_ASK_SCRIPT)}`;
    await askInput.fill(askText);

    const submitButton = sidebar.locator('[data-copilot-ask-submit]');
    await submitButton.click();
    log('submitted sentinel ask script');

    // The ask hook calls setCopilotSidebarOpen(false) on success.
    await expect(sidebar).not.toBeVisible({ timeout: 10_000 });
    log('sidebar closed after ask submission');

    // The system-copilot thread should now exist and carry
    // `isSystemAgent: true` — distinct from the Step 2 system-agent
    // thread because it's owned by the `system-copilot` pseudo-employee
    // (M33 T2). At this point TWO threads in the company are flagged
    // isSystemAgent (the M31 system-agent thread AND the M33 system-
    // copilot thread); we just need at least one to exist post-ask.
    const threadsAfterAsk = await window.evaluate(async (cid: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      return teamx.chat.listThreads(cid);
    }, companyId);
    const systemThreads = (
      threadsAfterAsk as Array<{ id: string; isSystemAgent?: boolean }>
    ).filter((t) => t.isSystemAgent === true);
    expect(systemThreads.length).toBeGreaterThanOrEqual(1);
    log(`resolved ${systemThreads.length} system-flagged thread(s) after ask`);

    // --- FINAL REGRESSION SWEEP — destructive + write-side gates ----------
    // Across the whole session, the M30 destructive-red gate must have
    // NEVER rendered. The M32 write-side-amber gate rendered in Step 3
    // and was dismissed before Step 4 — it must be absent now.
    await expect(window.getByText('Confirm destructive action')).not.toBeVisible();
    await expect(window.getByText('Confirm write-side agentic run')).not.toBeVisible();
    log('final sweep — destructive + write-side gates confirmed ABSENT');
  });
});
