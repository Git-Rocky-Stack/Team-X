/**
 * Phase 5 (M33 — Copilot Service) end-to-end spec.
 *
 * Exercises the complete copilot-analyzer + copilot-ask round-trip
 * against a real Electron instance booted with `NODE_ENV=test`. No
 * network, no LLM, no live DB fixtures beyond the fresh-boot seed —
 * every loop surface is canned through the Phase 5 test seams:
 *
 *   - Copilot analyzer provider (M33 T8 seam) — `createTestCopilotComplete()`
 *     three-tier lookup. T9 baked its fixture into
 *     `CANNED_COPILOT_TABLE` at source, keyed on the substring
 *     `strategia-x` (the seeded Phase-1 company name that
 *     `buildAnalysisPrompt` always renders via `Company: <name>`).
 *     The fixture body is a JSON array of `InsightDraft` shapes that
 *     `parseDrafts` accepts, so the manual tick persists at least
 *     one insight row.
 *
 *   - Agentic provider (M31 T3 seam) — `createTestAgenticCompleteFn()`.
 *     The `copilot.ask` path forwards `userText` verbatim to
 *     `loop.run()`, which hands it to the canned provider as the
 *     first user message. We embed `__ECHO_AGENT__:<script-json>` in
 *     the prompt so the canned provider's tier-1 sentinel returns a
 *     deterministic `plan → tool_call(query_copilot_insights) → answer`
 *     script.
 *
 *   - Agentic tools (M33 T6 seam) — `createTestToolsForEmployee()`.
 *     `CopilotService.ask` looks up the company's `system-copilot`
 *     pseudo-employee and threads the id into `StartArgs.employeeId`,
 *     which selects the copilot composer branch: read-side tools +
 *     `query_copilot_insights`, no write-side tools. The canned tool
 *     body returns an empty `{rows: [], truncated: false}` envelope
 *     by default — enough for the loop to plan, tool-call, and
 *     answer in two scripted steps.
 *
 *   - Classifier (M30 T8 seam) — not used. `copilot.ask` is an
 *     explicit IPC that bypasses the palette intent router.
 *
 * Flow under test:
 *
 *   1. Boot Electron in test mode with a throwaway `--user-data-dir`.
 *   2. Resolve the seeded `companyId` via `window.teamx.companies.list()`.
 *   3. Seed bus-visible events: create + close a ticket. These flow
 *      through `CopilotEventWindow` and give the analyzer's event
 *      summary a non-trivial body (not strictly required — the
 *      fixture fires on the always-present `strategia-x` substring —
 *      but proves the handler chain end-to-end through the IPC
 *      surface).
 *   4. Force a manual analyzer tick via `copilot.configure({ companyId })`
 *      — the T5 test-only manual-tick IPC. Assert `insightsGenerated ≥ 1`.
 *   5. `copilot.insights({ companyId })` — assert ≥ 1 row, capture `id`.
 *   6. `copilot.dismiss({ id })` — assert `dismissedAt > 0`.
 *   7. Verify the dismissed row leaves the default `listActive` view
 *      AND that the `copilot.dismissed` bus event landed on the
 *      append-only events table (invariant #11 regression guard).
 *   8. `copilot.ask({ companyId, text })` with the `__ECHO_AGENT__:`
 *      sentinel embedded — returns `{ runId, threadId }`.
 *   9. Poll `command.getRunSnapshot(runId)` until the terminal
 *      `answer` step (or fail on `error`). Assert at least one
 *      `tool_call` step named `query_copilot_insights`.
 *  10. `chat.list(threadId)` — assert ≥ 2 messages persist on the
 *      system-copilot thread.
 *  11. `chat.listThreads(companyId)` — assert the copilot thread
 *      carries `isSystemAgent: true`, the flag `thread-list.tsx`
 *      keys on to render it under "Copilot Conversations".
 *  12. Regression guards: neither the M30 destructive confirmation
 *      card ("Confirm destructive action") nor the M32 T5 write-side
 *      card ("Confirm write-side agentic run") ever appears —
 *      copilot is an advisory surface and must route around both
 *      gates.
 *
 * Isolation model matches task-planner.spec.ts: each test gets its
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

// Only one Electron instance per host at a time — matches the rest of
// the Phase 5 E2E suite so the shared `out/main/index.js` isn't racing
// with another booted app.
test.describe.configure({ mode: 'serial' });

/**
 * Canned agentic-loop script for the `copilot.ask` round-trip.
 * Two scripted assistant messages produced in order:
 *
 *   [0] — plan step with a tool_call JSON for `query_copilot_insights`
 *   [1] — final_answer with a deterministic summary line
 *
 * Embedded in the `copilot.ask` prompt via the M31 T3
 * `__ECHO_AGENT__:` sentinel so the canned provider's tier-1 lookup
 * fires without touching any module-load-time table.
 */
const AGENTIC_LOOP_SCRIPT: readonly string[] = [
  'Planning: inspect the copilot insights surface before reporting on what the team should prioritize.\n{"action":"query_copilot_insights","args":{}}',
  '{"action":"final_answer","answer":"Reviewed active copilot insights for the company and drafted a priority summary from the recent event window."}',
];

test.describe('Team-X Phase 5 — M33 copilot service', () => {
  let app: ElectronApplication;
  let window: Page;
  let userDataDir: string;

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'teamx-copilot-e2e-'));
    app = await electron.launch({
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
      env: {
        ...process.env,
        NODE_ENV: 'test',
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
    // Wait for the app shell brand to render so we know the React tree
    // mounted before issuing IPC calls through the preload bridge.
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

  test('configure tick → insight surfaces → dismiss → ask routes through system-copilot', async () => {
    const log = (msg: string) => console.log(`[e2e:copilot] ${msg}`);
    log('test body entered');

    // --- 1. Resolve the seeded company id ---------------------------------
    // The contextBridge exposes the typed `TeamXApi` as `window.teamx`
    // in the renderer; tsc does not see the augmentation in the e2e
    // tsconfig, so we narrow through `any` at the evaluation boundary
    // (same pattern rag-flow.spec.ts + vault-backup.spec.ts use).
    const companyId = await window.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      const companies = await teamx.companies.list();
      return companies[0]?.id ?? '';
    });
    expect(companyId).toBeTruthy();
    log(`resolved companyId = ${companyId}`);

    // --- 2. Seed bus-visible events ---------------------------------------
    // Create + close a ticket. The ticket.create handler emits on the
    // bus (invariant #11) and flows into CopilotEventWindow; close
    // mutates status and also emits. The analyzer fixture keys on
    // the always-present `strategia-x` substring so this seeding is
    // not strictly required for the tick to produce an insight — it
    // exists to exercise the T3 event-window warm-start hydration
    // and to give the Audit / events surface non-empty rows.
    const ticketId = await window.evaluate(async (cid: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      const res = await teamx.tickets.create({
        companyId: cid,
        title: 'E2E copilot ticket seed',
        description: 'Seed ticket for the copilot analyzer event window.',
        priority: 'medium',
      });
      return res.ticketId;
    }, companyId);
    log(`seeded ticket ${ticketId}`);

    await window.evaluate(async (id: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      await teamx.tickets.close(id);
    }, ticketId);
    log(`closed ticket ${ticketId}`);

    // --- 3. Force a manual analyzer tick via copilot.configure ------------
    // `copilot.configure` is the T5 test-only IPC — it throws in
    // production mode. Here in NODE_ENV=test it calls
    // `CopilotAnalyzerService.tick(companyId, { reason: 'manual' })`
    // synchronously. The tick routes through the canned provider
    // (substring `strategia-x` → CANNED_COPILOT_TABLE fixture),
    // parses + persists the draft via `CopilotInsightsRepo.insert`,
    // and returns the aggregate counts.
    const tickResult = await window.evaluate(async (cid: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      return teamx.copilot.configure({ companyId: cid });
    }, companyId);
    log(
      `tick finished — proposed=${tickResult.insightsProposed} generated=${tickResult.insightsGenerated} merged=${tickResult.insightsMerged} expired=${tickResult.insightsExpired}`,
    );
    expect(tickResult.insightsProposed).toBeGreaterThanOrEqual(1);
    expect(tickResult.insightsGenerated).toBeGreaterThanOrEqual(1);

    // --- 4. Assert the insight lands on the read API ----------------------
    const listed = await window.evaluate(async (cid: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      return teamx.copilot.insights({ companyId: cid, limit: 50 });
    }, companyId);
    expect(listed.insights.length).toBeGreaterThanOrEqual(1);
    const insight = listed.insights[0];
    expect(insight.category).toBe('operational');
    expect(insight.severity).toBe('warning');
    expect(insight.title).toContain('E2E canned copilot insight');
    expect(insight.dismissedAt).toBeNull();
    log(`copilot.insights returned ${listed.insights.length} row(s) — first id = ${insight.id}`);

    // --- 5. Dismiss + verify dismissedAt propagation ----------------------
    const dismissResult = await window.evaluate(async (id: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      return teamx.copilot.dismiss({ id });
    }, insight.id);
    expect(dismissResult.id).toBe(insight.id);
    expect(dismissResult.dismissedAt).toBeGreaterThan(0);
    log(`copilot.dismiss returned dismissedAt = ${dismissResult.dismissedAt}`);

    // Default listActive query excludes dismissed rows — the
    // dismissed insight should no longer appear.
    const afterDismiss = await window.evaluate(async (cid: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      return teamx.copilot.insights({ companyId: cid, limit: 50 });
    }, companyId);
    const stillActive = afterDismiss.insights.find((i: { id: string }) => i.id === insight.id);
    expect(stillActive).toBeUndefined();
    log('dismissed insight no longer appears in default listActive query');

    // --- 6. Verify the `copilot.dismissed` event hit the events table -----
    // Invariant #11: IPC mutations must emit bus events. The dismiss
    // handler emits `copilot.dismissed`; the events repo appends it
    // to the append-only table, where events.list surfaces it. The
    // events.list request shape has no type filter; we scan the
    // returned rows client-side.
    const eventsList = await window.evaluate(async (cid: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      return teamx.events.list({ companyId: cid, limit: 200 });
    }, companyId);
    const dismissedEvent = eventsList.events.find(
      (e: { type: string; companyId: string }) => e.type === 'copilot.dismissed',
    );
    expect(dismissedEvent).toBeDefined();
    expect(dismissedEvent?.companyId).toBe(companyId);
    log('copilot.dismissed event persisted on the append-only events table');

    // --- 7. Fire copilot.ask with the sentinel script ---------------------
    // The sentinel is parsed out of the first user message in
    // `test-agentic-provider.ts`, which overrides the canned-table
    // tier and drives the loop through the scripted sequence below.
    // `CopilotService.ask` threads `system-copilot` through as the
    // explicit `employeeId`, selecting the copilot tool composer
    // branch (read-side + query_copilot_insights, no write-side).
    const askText = `Give me a one-paragraph summary of what to prioritize. __ECHO_AGENT__:${JSON.stringify(AGENTIC_LOOP_SCRIPT)}`;
    const askResult = await window.evaluate(
      async (arg: { cid: string; text: string }) => {
        // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
        const teamx = (window as any).teamx;
        return teamx.copilot.ask({ companyId: arg.cid, text: arg.text });
      },
      { cid: companyId, text: askText },
    );
    expect(askResult.runId).toBeTruthy();
    expect(askResult.threadId).toBeTruthy();
    log(`copilot.ask returned runId=${askResult.runId} threadId=${askResult.threadId}`);

    // --- 8. Poll for the terminal step -----------------------------------
    // `command.getRunSnapshot` returns the latest persisted run state
    // including every step emitted so far. We wait for `answer` or
    // fail fast on `error`. The canned loop runs synchronously in
    // well under 200ms under the test seams, so a 20s timeout is
    // generous.
    const snapshotHandle = await window.waitForFunction(
      async (runId: string) => {
        // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
        const teamx = (window as any).teamx;
        const snap = await teamx.command.getRunSnapshot(runId);
        if (!snap) return null;
        const last = snap.steps[snap.steps.length - 1];
        if (!last) return null;
        if (last.kind === 'answer' || last.kind === 'error') return snap;
        return null;
      },
      askResult.runId,
      { timeout: 20_000 },
    );
    const snapshotValue = (await snapshotHandle.jsonValue()) as {
      runId: string;
      threadId: string;
      steps: Array<{
        kind: string;
        stepIndex: number;
        // Runtime field is `data` (see `AgentStepPayload` in
        // `packages/shared-types/src/events.ts` line 241). The
        // docstring above the type refers to it as "payload", which
        // cost real debugging time — the runtime name is `data`.
        data: unknown;
      }>;
    };
    log(`run snapshot terminal — step count = ${snapshotValue.steps.length}`);

    const terminal = snapshotValue.steps[snapshotValue.steps.length - 1];
    expect(terminal?.kind).toBe('answer');

    // The loop must have issued a `query_copilot_insights` tool call —
    // proves the M33 T6 copilot tool branch wired through correctly.
    // `AgentStepPayload.data` carries step-kind-specific fields; for
    // `tool_call` it is `{ toolCallId, toolName, args }` — see
    // `packages/shared-types/src/events.ts` line 233.
    const toolCalls = snapshotValue.steps.filter((s) => s.kind === 'tool_call');
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);
    const copilotToolCall = toolCalls.find((s) => {
      const d = s.data as { toolName?: string } | null;
      return d?.toolName === 'query_copilot_insights';
    });
    expect(copilotToolCall).toBeDefined();
    log('query_copilot_insights tool call observed in the run transcript');

    // --- 9. Chat messages persisted on the system-copilot thread ---------
    const messages = await window.evaluate(async (tid: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      return teamx.chat.list(tid);
    }, askResult.threadId);
    expect(messages.length).toBeGreaterThanOrEqual(2);
    log(`chat.list returned ${messages.length} messages on thread ${askResult.threadId}`);

    // --- 10. Thread surfaces with isSystemAgent flag --------------------
    // The system-copilot thread renders under "Copilot Conversations"
    // per thread-list.tsx, distinguished from any M31 system-agent
    // thread by the `isSystemAgent` classifier exposed on the Thread
    // wire type. We poll the IPC surface directly rather than
    // driving the chat drawer open — the flag is what the renderer
    // classifies on, so asserting on it catches any regression in
    // the back-end's thread membership wiring. A sibling spec
    // (agentic-loop.spec.ts) already covers the drawer-render path
    // for system-agent, so this spec focuses on the system-copilot
    // wire contract.
    const threads = await window.evaluate(async (cid: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      return teamx.chat.listThreads(cid);
    }, companyId);
    const copilotThread = threads.find(
      (t: { id: string; isSystemAgent?: boolean }) => t.id === askResult.threadId,
    );
    expect(copilotThread).toBeDefined();
    expect(copilotThread?.isSystemAgent).toBe(true);
    log('copilot thread flagged isSystemAgent=true — will render under Copilot Conversations');

    // --- 11. Regression guards — neither confirmation gate ever fired ----
    // Copilot is an advisory surface and never routes through
    // command.execute's destructive or write-side gates. The M30
    // destructive card would read "Confirm destructive action" and
    // the M32 T5 write-side card would read "Confirm write-side
    // agentic run". Both must stay absent throughout this spec.
    await expect(window.getByText('Confirm destructive action')).not.toBeVisible();
    await expect(window.getByText('Confirm write-side agentic run')).not.toBeVisible();
    log('destructive + write-side confirmation gates confirmed ABSENT');
  });
});
