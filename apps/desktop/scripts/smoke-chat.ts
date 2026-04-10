#!/usr/bin/env tsx
/**
 * smoke-chat.ts — end-to-end manual verification of the orchestrator
 * pipeline against a real local Ollama server.
 *
 * Usage:
 *   pnpm -F @team-x/desktop exec tsx scripts/smoke-chat.ts
 *
 * Prerequisites:
 *   - Ollama serving on localhost:11434  (install from https://ollama.com)
 *   - A small model pulled:  ollama pull qwen2.5:3b
 *
 * What it does:
 *   1. Opens an in-memory SQL database (sql.js — avoids the Electron-ABI
 *      better-sqlite3 and keytar dependencies so the script runs in plain
 *      Node via tsx).
 *   2. Runs all Drizzle migrations against it.
 *   3. Seeds the hardcoded Phase 1 company + CEO + Senior Fullstack
 *      Engineer using the real strategia-official role-packs.
 *   4. Constructs the orchestrator with the real role-loader (parses the
 *      CEO's role.md + renders template variables from company settings)
 *      and a direct Ollama stream adapter (bypasses the provider-factory
 *      and its SecretsStore dependency).
 *   5. Subscribes to the event bus and streams token deltas to stdout in
 *      real time — same data the renderer's dashboard would see.
 *   6. Sends one user message to the CEO, awaits the full reply, prints
 *      final telemetry (tokens, latency, cost), then shuts down cleanly.
 *
 * This is NOT a CI test — it makes real network calls to a local LLM.
 * The Playwright smoke test in T49 is the CI-safe version that swaps in
 * a test-mode provider factory returning a canned response.
 *
 * To test the Anthropic adapter instead of Ollama, change the
 * PROVIDER / MODEL constants below and supply your API key inline.
 * Never commit a real key — this is dev-only.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeOllamaStream } from '@team-x/provider-router';
import type { ProviderStreamFn } from '@team-x/provider-router';
import type { TokenDeltaPayload, WorkCompletedPayload } from '@team-x/shared-types';
import { calcCostUsd } from '@team-x/telemetry-core';

import { createCompaniesRepo } from '../src/main/db/repos/companies.js';
import { createEmployeesRepo } from '../src/main/db/repos/employees.js';
import { createEventsRepo } from '../src/main/db/repos/events.js';
import { createMessagesRepo } from '../src/main/db/repos/messages.js';
import { createRunsRepo } from '../src/main/db/repos/runs.js';
import { createThreadsRepo } from '../src/main/db/repos/threads.js';
import { seedIfEmpty } from '../src/main/db/seed.js';
import { makeTestDb } from '../src/main/db/test-helpers.js';
import { createEventBus } from '../src/main/orchestrator/event-bus.js';
import { buildOrchestrator } from '../src/main/orchestrator/index.js';
import type { CostCalculator } from '../src/main/orchestrator/run-agent.js';
import { createRoleLoader } from '../src/main/services/role-loader.js';

// ---------------------------------------------------------------------------
// Configuration — change these to test a different provider / model.
// ---------------------------------------------------------------------------

const PROVIDER_NAME = 'ollama-local';
const MODEL = 'qwen2.5:3b';
const OLLAMA_BASE_URL = 'http://localhost:11434';
const ORCHESTRATOR_SLOTS = 1;

const USER_MESSAGE = 'In one sentence, what is our top priority this week?';

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const thisDir = dirname(fileURLToPath(import.meta.url));
const rolePacksRoot = resolve(thisDir, '../../../role-packs/strategia-official/roles');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const calcCost: CostCalculator = ({ model, promptTokens, completionTokens }) => {
  const result = calcCostUsd(model, promptTokens, completionTokens);
  return result.usd.toFixed(6);
};

async function checkOllamaReachable(): Promise<void> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) {
      throw new Error(`Ollama responded with HTTP ${res.status}`);
    }
  } catch (err) {
    console.error(
      `\n  Ollama is not reachable at ${OLLAMA_BASE_URL}.\n  Make sure Ollama is running:  ollama serve\n  And the model is pulled:      ollama pull ${MODEL}\n`,
    );
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`[smoke] provider=${PROVIDER_NAME} model=${MODEL}`);
  console.log(`[smoke] role-packs: ${rolePacksRoot}`);

  // 0. Verify Ollama is up before doing any setup.
  await checkOllamaReachable();
  console.log('[smoke] Ollama reachable');

  // 1. In-memory database (sql.js — no Electron ABI needed).
  const ctx = await makeTestDb();
  console.log('[smoke] database ready (in-memory sql.js)');

  // 2. Seed company + employees with the real role-packs.
  const seedResult = seedIfEmpty(ctx.db, {
    rolePacksRoot,
    company: {
      name: 'Strategia-X',
      slug: 'strategia-x',
      settings: {
        mission: 'Arm every builder with an AI company that runs itself.',
        values: ['Quality', 'Privacy', 'Speed', 'Ownership'],
      },
    },
    assignments: [
      {
        roleFile: 'officer/ceo.md',
        displayName: 'Iris Kovac',
        displayTitle: 'Chief Executive Officer',
      },
      {
        roleFile: 'ic/senior-fullstack-engineer.md',
        displayName: 'Mateo Reyes',
        displayTitle: 'Senior Fullstack Engineer',
      },
    ],
  });
  if (!seedResult) {
    throw new Error('seed returned null — database was not empty');
  }
  console.log(
    `[smoke] seeded company=${seedResult.companyId} employees=${seedResult.employeeIds.length}`,
  );

  // 3. Wire repos.
  const companiesRepo = createCompaniesRepo(ctx.db);
  const employeesRepo = createEmployeesRepo(ctx.db);
  const threadsRepo = createThreadsRepo(ctx.db);
  const messagesRepo = createMessagesRepo(ctx.db);
  const runsRepo = createRunsRepo(ctx.db);
  const eventsRepo = createEventsRepo(ctx.db);
  const bus = createEventBus({ repo: eventsRepo });

  // 4. Role loader — reads the real CEO role.md from the role-packs dir.
  const roleLoader = createRoleLoader({ rolePacksRoot });
  roleLoader.preload();
  console.log(`[smoke] role-loader indexed ${roleLoader.size()} role(s)`);

  // 5. Ollama stream — direct adapter, bypasses provider-factory + keytar.
  const ollamaStream: ProviderStreamFn = makeOllamaStream({
    model: MODEL,
    baseURL: OLLAMA_BASE_URL,
  });

  // 6. Orchestrator.
  const orchestrator = buildOrchestrator({
    bus,
    messagesRepo,
    runsRepo,
    employeesRepo,
    companiesRepo,
    threadsRepo,
    calcCost,
    resolveSystemPrompt: (args) => roleLoader.resolveSystemPrompt(args),
    resolveProvider: async () => ({
      providerName: PROVIDER_NAME,
      model: MODEL,
      stream: ollamaStream,
    }),
    slots: ORCHESTRATOR_SLOTS,
  });

  // 7. Subscribe to the event bus — stream tokens to stdout live.
  let tokenCount = 0;
  bus.subscribe((evt) => {
    if (evt.type === 'token.delta') {
      const payload = evt.payload as TokenDeltaPayload;
      process.stdout.write(payload.delta);
      tokenCount++;
    }
    if (evt.type === 'work.started') {
      console.log('\n--- assistant response ---');
    }
    if (evt.type === 'work.completed') {
      const payload = evt.payload as WorkCompletedPayload;
      console.log('\n--- end response ---');
      console.log(
        `[telemetry] prompt=${payload.promptTokens} completion=${payload.completionTokens} ` +
          `latency=${payload.latencyMs}ms cost=$${payload.costUsd} deltaChunks=${tokenCount}`,
      );
    }
    if (evt.type === 'work.failed') {
      console.error('\n[FAILED]', evt.payload);
    }
  });

  // 8. Find the seeded CEO and send a message.
  const employees = employeesRepo.listByCompany(seedResult.companyId);
  const ceo = employees.find((e) => e.level === 'officer');
  if (!ceo) throw new Error('no officer-level employee found');

  const threadId = threadsRepo.getOrCreateDmThread({
    companyId: seedResult.companyId,
    employeeId: ceo.id,
    userId: 'rocky',
  });

  const userMsgId = messagesRepo.append({
    threadId,
    authorId: 'rocky',
    authorKind: 'user',
    content: USER_MESSAGE,
  });

  console.log(`[smoke] sent: "${USER_MESSAGE}"`);
  console.log(`[smoke] thread=${threadId} employee=${ceo.id} (${ceo.name})`);

  // 9. Wait for the orchestrator to complete the turn.
  await orchestrator.enqueueChat({
    threadId,
    employeeId: ceo.id,
    userMessageId: userMsgId,
  });

  // 10. Clean shutdown.
  await orchestrator.shutdown();
  ctx.close();
  console.log('[smoke] done');
}

main().catch((err) => {
  console.error('\n[smoke] FATAL:', err);
  process.exit(1);
});
