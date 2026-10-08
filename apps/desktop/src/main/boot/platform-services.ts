/**
 * Boot phase 5c — platform services: operator identity, artifacts, thread
 * memory, first-boot settings/MCP seeds, skills, the event bus, the vault,
 * the MCP host, and the provider-routing mode + secrets store.
 */

import { join } from 'node:path';

import { app } from 'electron';

import type { TeamXDb } from '../db/client.js';
import { userDataDir } from '../db/paths.js';
import { seedDefaultMcpServers } from '../db/repos/mcp-servers.js';
import { createEventBus } from '../orchestrator/event-bus.js';
import { createArtifactService } from '../services/artifact-service.js';
import { createCloudLinkService } from '../services/cloud-link-service.js';
import { createMcpHost } from '../services/mcp-host.js';
import {
  createFileAllowlist,
  defaultAllowlistPath as mcpDefaultAllowlistPath,
} from '../services/mcp-security.js';
import { createOperatorAccessService } from '../services/operator-access-service.js';
import { isTestMode } from '../services/provider-factory.js';
import { createRunCheckpointService } from '../services/run-checkpoint-service.js';
import { SecretsStore } from '../services/secrets.js';
import { createSkillsService } from '../services/skills-service.js';
import { createThreadDigestService } from '../services/thread-digest-service.js';
import { createVaultService } from '../services/vault.js';

import type { Repositories } from './repositories.js';
import { runtime } from './runtime-state.js';

export interface PlatformServicesDeps
  extends Pick<
    Repositories,
    | 'companiesRepo'
    | 'settingsRepo'
    | 'operatorsRepo'
    | 'artifactsRepo'
    | 'threadDigestsRepo'
    | 'messagesRepo'
    | 'runCheckpointsRepo'
    | 'runsRepo'
    | 'extensionsRegistry'
    | 'extensionsRepo'
    | 'skillAssignmentsRepo'
    | 'authorityRepo'
    | 'eventsRepo'
    | 'vaultRepo'
    | 'mcpServersRepo'
    | 'toolCallsRepo'
  > {
  db: TeamXDb;
}

export type PlatformServices = Awaited<ReturnType<typeof bootPlatformServices>>;

export async function bootPlatformServices(deps: PlatformServicesDeps) {
  const {
    db,
    companiesRepo,
    settingsRepo,
    operatorsRepo,
    artifactsRepo,
    threadDigestsRepo,
    messagesRepo,
    runCheckpointsRepo,
    runsRepo,
    extensionsRegistry,
    extensionsRepo,
    skillAssignmentsRepo,
    authorityRepo,
    eventsRepo,
    vaultRepo,
    mcpServersRepo,
    toolCallsRepo,
  } = deps;

  const cloudLinkService = createCloudLinkService({
    companiesRepo,
    settingsRepo,
  });
  const operatorAccessService = createOperatorAccessService({
    companiesRepo,
    cloudLinkService,
    operatorsRepo,
  });
  const artifactService = createArtifactService({
    artifactsRepo,
  });
  const threadDigestService = createThreadDigestService({
    threadDigestsRepo,
    messagesRepo,
  });
  const runCheckpointService = createRunCheckpointService({
    runCheckpointsRepo,
  });
  const recoveredInterruptedRuns = runsRepo.recoverInterruptedWorkRuns();
  if (recoveredInterruptedRuns > 0) {
    console.warn(`[runs] recovered ${recoveredInterruptedRuns} interrupted work run(s)`);
  }

  // Seed default settings on first boot (runtime_strategy, privacy tier, caps).
  const settingsSeeded = settingsRepo.seedDefaults();
  if (settingsSeeded > 0) {
    console.log(`[settings] seeded ${settingsSeeded} default setting(s)`);
  }
  const deviceId = cloudLinkService.ensureDeviceIdentity();
  if (deviceId.length > 0) {
    console.log('[cloud-link] local device identity ready');
  }

  // Seed well-known MCP servers on first boot (disabled by default).
  const mcpSeeded = seedDefaultMcpServers(db);
  if (mcpSeeded > 0) {
    console.log(`[mcp] seeded ${mcpSeeded} default MCP server(s)`);
  }
  const mcpBridgeBackfill = extensionsRegistry.backfillMcpServers();
  if (mcpBridgeBackfill > 0) {
    console.log(`[extensions] synced ${mcpBridgeBackfill} MCP bridge row(s)`);
  }
  const skillsService = createSkillsService({
    extensionsRepo,
    skillAssignmentsRepo,
    authorityRepo,
    settingsRepo,
    skillsRoot: join(app.getPath('userData'), 'extensions', 'skills'),
  });
  operatorAccessService.ensureLocalOwner();
  operatorAccessService.ensureLocalOwnerForCompanies(
    companiesRepo.list().map((company) => company.id),
  );

  const bus = createEventBus({ repo: eventsRepo });
  const vaultService = createVaultService({
    vaultRepo,
    artifactService,
    companiesBasePath: join(app.getPath('userData'), 'companies'),
    getCompanySlug: (companyId: string) => {
      const company = companiesRepo.list().find((c) => c.id === companyId);
      return company?.slug ?? null;
    },
    // M30 T0 — wire the event bus so vault mutations fan out to the
    // renderer subscriber. Closes the vault-backup E2E staleness
    // regression (see docs/plans/2026-04-13-vault-backup-regression-findings.md).
    bus,
  });

  // ---- MCP Host initialization --------------------------------------------
  // C5 (audit 2026-05-07) — wire the security gates:
  //   - `userDataDir`         pins child-process cwd per server.
  //   - `executableAllowlist` is a hash-pinned operator-managed list
  //     at `<userDataDir>/mcp-allowlist.json`. The file is auto-created
  //     EMPTY on first run, which is the explicit fail-closed state:
  //     no MCP servers spawn until an operator adds an entry.
  const mcpAllowlistPath = mcpDefaultAllowlistPath(userDataDir());
  const mcpHost = createMcpHost({
    mcpServersRepo,
    toolCallsRepo,
    bus,
    userDataDir: userDataDir(),
    executableAllowlist: createFileAllowlist(mcpAllowlistPath),
  });
  runtime.mcpHostInstance = mcpHost;
  // Initialize MCP connections (best-effort, failures logged per-server)
  await mcpHost.initialize().catch((err) => {
    console.error('[main] MCP host initialization failed:', err);
  });
  console.log('[main] MCP host initialized');

  // Provider routing — two modes:
  //
  //   - Normal: providers service + secrets store + adapter factory.
  //     The factory's `resolveForEmployee` IS the orchestrator's
  //     `resolveProvider` slot — same shape, no adapter needed.
  //
  //   - Test mode (NODE_ENV=test): a canned instant-reply stream
  //     that needs no LLM server, no keytar, and no network. Used by
  //     the Playwright E2E smoke test (T49) which boots a real Electron
  //     instance but must not depend on external infrastructure.
  //
  // Both secretsStore and providersService are constructed eagerly so
  // the IPC handler layer (which exposes providers.* channels) can
  // always reach them — the constructors are cheap (no keytar or DB
  // call until a method is actually invoked).
  const testMode = isTestMode();
  const secretsStore = new SecretsStore();

  return {
    cloudLinkService,
    operatorAccessService,
    artifactService,
    threadDigestService,
    runCheckpointService,
    skillsService,
    bus,
    vaultService,
    mcpHost,
    testMode,
    secretsStore,
  };
}
