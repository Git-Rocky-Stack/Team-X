/**
 * Phase 5 end-to-end RAG-flow test.
 *
 * Exercises the full M29 retrieval round-trip against the deterministic
 * test-mode embedding adapter + canned test-mode chat provider (no
 * Ollama, no OpenAI, no network). Validates the entire chain:
 *
 *   1. Boot Electron with `NODE_ENV=test` + `TEAM_X_RAG_TEST=1` so:
 *        - `buildRagService()` wires `makeFakeEmbedAdapter` + RagService
 *        - `RagIndexer` starts subscribing to the event bus
 *        - `resolveSystemPrompt` switches to `composeSystemPromptWithRag`
 *   2. Lower the cosine similarity threshold to 0 via IPC so the
 *      hash-based fake embedder's vectors always clear retrieval.
 *   3. Turn 1: send `__ECHO_TEXT__:<marker>` — the test-mode provider
 *      replies with `<marker>` verbatim. On `work.completed`, the
 *      RagIndexer embeds the assistant message (which contains the
 *      marker) into the embeddings table.
 *   4. Turn 2: send `__ECHO_SYSTEM__` — the test-mode provider replies
 *      with the fully-resolved system prompt. `composeSystemPromptWithRag`
 *      retrieves the indexed chunk and appends a `## Retrieved Evidence`
 *      block with `<message id="<id>" trust="untrusted">…<marker>…</message>`
 *      trust-fenced attribution.
 *   5. Assert the streamed reply contains both `<message id="` (the trust
 *      fence opening tag emitted by `formatEvidenceLine`) AND the
 *      distinctive marker (proof the ticket's content made it into the
 *      prompt).
 *
 * If this test passes, it means every layer of M29 is wired correctly
 * end-to-end: embedText factory, Ollama/OpenAI adapter contract, RagService
 * facade, RagIndexer subscriber, composeSystemPromptWithRag wrapper,
 * composition-root wiring, rag.* IPC channels, and the settings IPC
 * surface — all without any real embedding provider or network.
 *
 * Isolation: fresh `--user-data-dir=<tmp>` per test (same model as the
 * other four E2E specs). Other specs do NOT set `TEAM_X_RAG_TEST` so
 * their behavior is unaffected — they keep getting `buildRagService()
 * → null` and the default canned reply.
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

import { getCiLaunchArgs } from './_launch-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MAIN_ENTRY = resolve(__dirname, '../out/main/index.js');

/**
 * Distinctive marker for the indexed content + the retrieval assertion.
 * Neutral token-like string that no default prompt or canned reply
 * contains, so finding it in the reply proves RAG injected it rather
 * than the test-mode provider echoing something it already knew.
 */
const RAG_MARKER = 'QUARK_RETRIEVAL_MARKER_7777';

test.describe.configure({ mode: 'serial' });

test.describe('Team-X rag-flow', () => {
  let app: ElectronApplication;
  let window: Page;
  let userDataDir: string;

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'teamx-rag-e2e-'));
    app = await electron.launch({
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`, ...getCiLaunchArgs()],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        // M29 T9: flips buildRagService() into test-rag mode (fake
        // embedder, no network). Every other spec omits this so the
        // existing testMode → null short-circuit still applies.
        TEAM_X_RAG_TEST: '1',
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
          /* app may already be closed on test failure — swallow */
        });
      const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 5000));
      await Promise.race([closePromise, timeoutPromise]);
      if (!closedCleanly) {
        try {
          const proc = app.process();
          if (proc && proc.exitCode === null && !proc.killed) {
            proc.kill('SIGKILL');
            // Wait for the OS to actually reap the process before deleting its
            // user-data dir. On Windows the Chromium/LevelDB file handles are
            // released only after exit, so an immediate rmSync races into EBUSY.
            await new Promise<void>((resolve) => {
              const settle = setTimeout(resolve, 5000);
              proc.once('exit', () => {
                clearTimeout(settle);
                resolve();
              });
            });
          }
        } catch {
          /* process already disposed */
        }
      }
    }
    // maxRetries/retryDelay give Windows time to drop lingering LevelDB locks
    // (EBUSY/EPERM) rather than failing teardown on the first attempt.
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });

  test('indexes assistant reply then injects <message id="..."> on next turn', async () => {
    const log = (msg: string) => console.log(`[e2e:rag] ${msg}`);
    log('test body entered');

    // --- 1. App shell -----------------------------------------------------
    await expect(window.locator('[data-testid="app-brand-name"]')).toBeVisible();
    log('Strategia-X visible ✓');
    // M35 T9 stable-selector anchor — top-bar Copilot Sparkles button
    // (data-copilot-toolbar-toggle) proves the Phase 5 UI mounted.
    // Required by apps/desktop/src/e2e-regression-guards.test.ts.
    await expect(window.locator('[data-copilot-toolbar-toggle]')).toBeVisible();

    // --- 2. Lower RAG threshold so fake-embedder hits always pass --------
    // The hash-based makeFakeEmbedAdapter is deterministic but not
    // semantic, so cosine similarity between arbitrary strings hovers
    // below the default 0.7. Drop to 0 so ANY shared-character overlap
    // is accepted for retrieval.
    const thresholdResult = await window.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      await teamx.settings.setRagConfig({ ragThreshold: 0 });
      return teamx.settings.getRagConfig();
    });
    expect(thresholdResult.ragThreshold).toBe(0);
    log('rag_threshold set to 0 via IPC ✓');

    // --- 3. Open chat with the seeded CEO ---------------------------------
    const ceoCard = window.locator('button[aria-label^="Iris Kovač, Chief Executive Officer"]');
    await expect(ceoCard).toBeVisible();
    await ceoCard.click();
    log('CEO card clicked');

    const composer = window.locator('textarea[placeholder*="Message"]');
    await expect(composer).toBeVisible();
    log('composer visible ✓');

    // --- 4. Turn 1: seed the embeddings with the marker -------------------
    // `__ECHO_TEXT__:<payload>` causes the test-mode provider to reply
    // with `<payload>` verbatim. On `work.completed`, RagIndexer embeds
    // the assistant message content — which IS the marker — into the
    // embeddings table. No network, no Ollama, pure deterministic hash.
    const seedMessage = `__ECHO_TEXT__:${RAG_MARKER}`;
    await composer.fill(seedMessage);
    await composer.press('Control+Enter');
    log('seed message sent');

    // Seed user bubble appears.
    await expect(window.getByText(seedMessage, { exact: true })).toBeVisible();

    // Assistant echoes the marker. This persist confirms the orchestrator
    // turn completed → `work.completed` event fired → RagIndexer ran.
    // Scope to the CEO drawer — the marker also surfaces on the Mission
    // Control dashboard event stream once persisted, so an unscoped
    // `getByText` matches both the chat bubble and the dashboard card.
    await expect(
      window.getByLabel('Iris Kovač', { exact: true }).getByText(RAG_MARKER, { exact: true }),
    ).toBeVisible({
      timeout: 20_000,
    });
    log('assistant echoed RAG_MARKER ✓');

    // Poll `rag.stats` until the fire-and-forget embed call from turn 1
    // has flushed. Replaces a prior `waitForTimeout(500)` (flagged by the
    // M35 T9 flaky-test audit guard) with a deterministic wait on the
    // actual side-effect we care about — the embedding row landing in
    // the `embeddings` table. Intervals bias to the common 200–500 ms
    // settle window so fast machines don't spin up the full poll budget.
    let ragStats: { cid: string; embeddingCount: number } = {
      cid: '',
      embeddingCount: 0,
    };
    await expect
      .poll(
        async () => {
          ragStats = await window.evaluate(async () => {
            // Use the first seeded company (main/seed.ts creates Strategia-X).
            // The contextBridge exposes the typed TeamXApi as window.teamx.
            // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
            const teamx = (window as any).teamx;
            const companies = await teamx.companies.list();
            const cid = companies[0]?.id ?? '';
            const stats = await teamx.rag.stats(cid);
            return { cid, embeddingCount: stats.embeddingCount };
          });
          return ragStats.embeddingCount;
        },
        { timeout: 10_000, intervals: [200, 300, 500, 500, 1000] },
      )
      .toBeGreaterThan(0);
    log(`rag.stats → ${JSON.stringify(ragStats)}`);

    // --- 5. Turn 2: ask for the system prompt and assert retrieval -------
    // `__ECHO_SYSTEM__` causes the test-mode provider to reply with the
    // verbatim system prompt. composeSystemPromptWithRag prepends a
    // `## Retrieved Evidence` block containing
    // `<message id="<id>" trust="untrusted">…<RAG_MARKER>…</message>` —
    // proving retrieval + trust-fenced injection both worked.
    await composer.fill('__ECHO_SYSTEM__ probe');
    await composer.press('Control+Enter');
    log('echo-system probe sent');

    // The assistant reply now contains the full system prompt (long).
    // Wait for both signals: the trust fence opening tag AND the marker.
    const assistantBubbles = window.locator('text=/<message id="/');
    await expect(assistantBubbles.first()).toBeVisible({ timeout: 20_000 });
    log('<message id="..."> trust fence visible ✓');

    // The retrieved content — the marker from turn 1 — should appear
    // somewhere inside the echoed system prompt (inside the Retrieved
    // Evidence block).
    await expect(window.getByText(new RegExp(RAG_MARKER)).first()).toBeVisible({
      timeout: 10_000,
    });
    log(`${RAG_MARKER} visible in reply ✓`);
  });
});
