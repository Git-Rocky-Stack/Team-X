import { type SpawnOptionsWithoutStdio, spawn } from 'node:child_process';

import type { ProviderStreamFn, StreamMessage, StreamUsage } from '@team-x/provider-router';
import type { RuntimeProfile } from '@team-x/shared-types';

import type { EmployeeRow } from '../db/repos/employees.js';
import type { TicketCheckoutsRepo } from '../db/repos/ticket-checkouts.js';
import type {
  RuntimeAuditContext,
  RuntimeAuditNormalizer,
} from './runtime-audit-normalizer-service.js';
import { type RuntimeSecretReader, resolveRuntimeEnvironment } from './runtime-secret-refs.js';
import type { RuntimeSessionService } from './runtime-session-service.js';
import {
  type RuntimeWorkspacePaths,
  ensureRuntimeWorkspacePaths,
} from './runtime-workspace-service.js';

type FetchLike = typeof fetch;

interface SpawnedProcess {
  stdin: NodeJS.WritableStream | null;
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  once(event: 'error', listener: (error: Error) => void): this;
  once(
    event: 'close',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
  kill(signal?: NodeJS.Signals | number): boolean;
}

type SpawnLike = (
  command: string,
  args?: readonly string[],
  options?: SpawnOptionsWithoutStdio,
) => SpawnedProcess;

export interface ExternalRuntimeResolvedProvider {
  providerName: string;
  providerKind: string;
  model: string;
  stream: ProviderStreamFn;
}

export interface ExternalRuntimeAdapters {
  createResolvedProvider(input: {
    employee: EmployeeRow;
    profile: RuntimeProfile;
  }): ExternalRuntimeResolvedProvider | null;
}

export interface ExternalRuntimeAdaptersDeps {
  fetchFn?: FetchLike;
  spawnFn?: SpawnLike;
  secretsStore?: RuntimeSecretReader;
  userDataDir?: string;
  ensureWorkspaceFn?: typeof ensureRuntimeWorkspacePaths;
  runtimeSessionService?: RuntimeSessionService;
  ticketCheckoutsRepo?: TicketCheckoutsRepo;
  runtimeAuditNormalizer?: RuntimeAuditNormalizer;
  budgetAdmissionGate?: RuntimeBudgetAdmissionGate;
  checkoutLeaseMs?: number;
  now?: () => number;
}

interface RuntimeInvocationPayload {
  version: 'team-x-runtime-v1';
  runtimeProfileId: string;
  runtimeKind: RuntimeProfile['kind'];
  runtimeName: string;
  employee: {
    id: string;
    companyId: string;
    name: string;
    title: string;
  };
  system: string;
  messages: StreamMessage[];
  prompt: string;
  maxSteps: number;
  toolNames: string[];
  workspace: RuntimeWorkspacePaths | null;
}

interface RuntimeLifecycleDeps {
  runtimeSessionService?: RuntimeSessionService;
  ticketCheckoutsRepo?: TicketCheckoutsRepo;
  runtimeAuditNormalizer?: RuntimeAuditNormalizer;
  budgetAdmissionGate?: RuntimeBudgetAdmissionGate;
  checkoutLeaseMs: number;
  now: () => number;
}

interface ActiveRuntimeLifecycle {
  heartbeat(input: { message: string; usage?: StreamUsage }): Promise<void>;
  recordOutput(input: { text: string; usage: StreamUsage }): void;
  complete(input: { usage: StreamUsage }): Promise<void>;
  fail(input: { error: unknown }): void;
}

interface RuntimeBudgetAdmissionGate {
  assertExecutionAllowed(input: {
    companyId: string;
    employeeId?: string | null;
    executionKind: 'agentic';
  }): Promise<{
    allowed: boolean;
    reason: string | null;
    policy: { id: string; scopeKind: string; scopeRefId: string } | null;
    approvalItem: { id: string; status: string } | null;
  }>;
}

const DEFAULT_CHECKOUT_LEASE_MS = 5 * 60 * 1000;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return String(error);
}

function isAbortLike(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === 'AbortError';
  if (error instanceof Error)
    return error.name === 'AbortError' || /aborted|canceled/i.test(error.message);
  return false;
}

function usageDeltaJson(usage: StreamUsage | undefined): string {
  return JSON.stringify(
    usage
      ? {
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
        }
      : {},
  );
}

function usageDelta(usage: StreamUsage | undefined) {
  return usage
    ? {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      }
    : null;
}

function startRuntimeLifecycle(args: {
  deps: RuntimeLifecycleDeps;
  employee: EmployeeRow;
  profile: RuntimeProfile;
  transport: 'command' | 'http';
  endpointUrl?: string | null;
  workspace: RuntimeWorkspacePaths | null;
  runId?: string | null;
  threadId?: string | null;
  currentTicketId?: string | null;
}): ActiveRuntimeLifecycle | null {
  const service = args.deps.runtimeSessionService;
  const checkoutsRepo = args.deps.ticketCheckoutsRepo;
  const runtimeAudit = args.deps.runtimeAuditNormalizer;
  if (!service && !checkoutsRepo && !runtimeAudit) return null;

  const startedAt = args.deps.now();
  const currentRunId = args.runId ?? null;
  const currentThreadId = args.threadId ?? null;
  const currentTicketId = args.currentTicketId ?? null;
  let leaseExpiresAt =
    currentTicketId && checkoutsRepo ? startedAt + args.deps.checkoutLeaseMs : null;
  let terminal = false;
  let checkoutId: string | null = null;
  let checkoutReleased = false;
  const session = service?.start({
    companyId: args.employee.companyId,
    employeeId: args.employee.id,
    runtimeProfileId: args.profile.id,
    adapterKind: args.profile.kind,
    currentRunId,
    currentTicketId,
    endpointUrl: args.endpointUrl ?? null,
    workspacePath: args.workspace?.workspace ?? null,
    leaseExpiresAt,
    capabilities: {
      transport: args.transport,
      payloadVersion: 'team-x-runtime-v1',
      managedWorkspace: Boolean(args.workspace),
      heartbeatContract: 'team-x-runtime-heartbeat-v1',
    },
    now: startedAt,
  });

  const auditContext = (): RuntimeAuditContext => ({
    companyId: args.employee.companyId,
    employeeId: args.employee.id,
    runtimeProfileId: args.profile.id,
    adapterKind: args.profile.kind,
    transport: args.transport,
    sessionId: session?.id ?? null,
    runId: currentRunId,
    threadId: currentThreadId,
    ticketId: currentTicketId,
    checkoutId,
    workspacePath: args.workspace?.workspace ?? null,
    endpointUrl: args.endpointUrl ?? null,
    leaseExpiresAt,
  });

  runtimeAudit?.emit({
    ...auditContext(),
    type: 'runtime.session.started',
    status: 'starting',
    message: 'Runtime session started.',
  });

  const blockRuntime = (message: string, now: number): never => {
    terminal = true;
    if (service && session) {
      service.heartbeat({
        sessionId: session.id,
        status: 'blocked',
        currentRunId,
        currentTicketId,
        leaseExpiresAt: null,
        message,
        now,
      });
    }
    if (checkoutId && checkoutsRepo && !checkoutReleased) {
      checkoutsRepo.release({
        checkoutId,
        status: 'blocked',
        releaseReason: message,
        now,
      });
      checkoutReleased = true;
    }
    if (service && session) {
      service.end(session.id, {
        status: 'blocked',
        failureReason: message,
        now,
      });
    }
    runtimeAudit?.emit({
      ...auditContext(),
      type: 'runtime.execution.failed',
      status: 'blocked',
      message,
    });
    throw new Error(message);
  };

  const assertHeartbeatBudgetAllowed = async () => {
    if (!args.deps.budgetAdmissionGate) return;
    const admission = await args.deps.budgetAdmissionGate.assertExecutionAllowed({
      companyId: args.employee.companyId,
      employeeId: args.employee.id,
      executionKind: 'agentic',
    });
    if (admission.allowed) return;
    const message =
      admission.reason ??
      `Runtime heartbeat blocked by budget policy${admission.policy ? ` "${admission.policy.id}"` : ''}.`;
    blockRuntime(`[runtime-budget] ${message}`, args.deps.now());
  };

  const heartbeat = async (input: { message: string; usage?: StreamUsage }) => {
    if (terminal) return;
    await assertHeartbeatBudgetAllowed();
    const timestamp = args.deps.now();
    if (currentTicketId && checkoutsRepo && checkoutId && !checkoutReleased) {
      leaseExpiresAt = timestamp + args.deps.checkoutLeaseMs;
      checkoutsRepo.heartbeat(checkoutId, {
        now: timestamp,
        expiresAt: leaseExpiresAt,
      });
    }
    if (service && session) {
      service.heartbeat({
        sessionId: session.id,
        status: 'working',
        currentRunId,
        currentTicketId,
        leaseExpiresAt,
        costDeltaJson: usageDeltaJson(input.usage),
        message: input.message,
        now: timestamp,
      });
    }
    runtimeAudit?.emit({
      ...auditContext(),
      type: 'runtime.heartbeat',
      status: 'working',
      message: input.message,
      usage: usageDelta(input.usage),
    });
  };

  if (currentTicketId && checkoutsRepo) {
    const claimNow = args.deps.now();
    leaseExpiresAt = claimNow + args.deps.checkoutLeaseMs;
    const claim = checkoutsRepo.claim({
      companyId: args.employee.companyId,
      ticketId: currentTicketId,
      employeeId: args.employee.id,
      runtimeSessionId: session?.id ?? null,
      runId: currentRunId,
      expiresAt: leaseExpiresAt,
      now: claimNow,
    });
    if (claim.outcome === 'conflict') {
      const message = `[runtime-checkout] ticket "${currentTicketId}" is already checked out by employee "${claim.conflictingCheckout.employeeId}"`;
      if (service && session) {
        service.heartbeat({
          sessionId: session.id,
          status: 'blocked',
          currentRunId,
          currentTicketId,
          leaseExpiresAt: null,
          message,
          now: claimNow,
        });
        service.end(session.id, {
          status: 'blocked',
          failureReason: message,
          now: claimNow,
        });
      }
      runtimeAudit?.emit({
        ...auditContext(),
        type: 'runtime.checkout.conflict',
        status: 'blocked',
        message,
        conflictingCheckoutId: claim.conflictingCheckout.id,
        conflictingEmployeeId: claim.conflictingCheckout.employeeId,
      });
      throw new Error(message);
    }
    checkoutId = claim.checkout.id;
    runtimeAudit?.emit({
      ...auditContext(),
      type: 'runtime.checkout.claimed',
      status: 'working',
      message: `Runtime checkout ${claim.outcome}.`,
    });
  }

  runtimeAudit?.emit({
    ...auditContext(),
    type: 'runtime.execution.started',
    status: 'working',
    message: 'Runtime execution started.',
  });

  return {
    heartbeat,
    recordOutput(input) {
      runtimeAudit?.emit({
        ...auditContext(),
        type: 'runtime.execution.output',
        status: 'working',
        message: 'Runtime produced assistant output.',
        usage: usageDelta(input.usage),
      });
      runtimeAudit?.recordArtifact({
        ...auditContext(),
        outputText: input.text,
        usage: usageDelta(input.usage),
        createdAt: args.deps.now(),
      });
    },
    async complete(input) {
      if (terminal) return;
      await heartbeat({ message: 'Runtime execution completed.', usage: input.usage });
      const timestamp = args.deps.now();
      if (checkoutId && checkoutsRepo && !checkoutReleased) {
        checkoutsRepo.release({
          checkoutId,
          status: 'completed',
          releaseReason: 'runtime execution completed',
          now: timestamp,
        });
        checkoutReleased = true;
      }
      if (service && session) {
        service.end(session.id, {
          status: 'ended',
          now: timestamp,
        });
      }
    },
    fail(input) {
      if (terminal) return;
      const message = errorMessage(input.error);
      const timestamp = args.deps.now();
      if (service && session) {
        service.heartbeat({
          sessionId: session.id,
          status: isAbortLike(input.error) ? 'ended' : 'failed',
          currentRunId,
          currentTicketId,
          leaseExpiresAt: null,
          message,
          now: timestamp,
        });
      }
      runtimeAudit?.emit({
        ...auditContext(),
        type: 'runtime.execution.failed',
        status: isAbortLike(input.error) ? 'ended' : 'failed',
        message,
      });
      if (checkoutId && checkoutsRepo && !checkoutReleased) {
        checkoutsRepo.release({
          checkoutId,
          status: 'released',
          releaseReason: message,
          now: timestamp,
        });
        checkoutReleased = true;
      }
      if (service && session) {
        service.end(session.id, {
          status: isAbortLike(input.error) ? 'ended' : 'failed',
          failureReason: isAbortLike(input.error) ? null : message,
          now: timestamp,
        });
      }
    },
  };
}

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Aborted', 'AbortError');
  }
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function buildPrompt(system: string, messages: StreamMessage[]): string {
  const history = messages
    .map((message) => `${message.role.toUpperCase()}\n${message.content}`)
    .join('\n\n');
  return `SYSTEM\n${system}\n\nMESSAGES\n${history}`.trim();
}

function buildInvocationPayload(args: {
  employee: EmployeeRow;
  profile: RuntimeProfile;
  system: string;
  messages: StreamMessage[];
  maxSteps: number;
  tools?: Record<string, unknown>;
  workspace?: RuntimeWorkspacePaths | null;
}): RuntimeInvocationPayload {
  return {
    version: 'team-x-runtime-v1',
    runtimeProfileId: args.profile.id,
    runtimeKind: args.profile.kind,
    runtimeName: args.profile.name,
    employee: {
      id: args.employee.id,
      companyId: args.employee.companyId,
      name: args.employee.name,
      title: args.employee.title,
    },
    system: args.system,
    messages: args.messages,
    prompt: buildPrompt(args.system, args.messages),
    maxSteps: args.maxSteps,
    toolNames: Object.keys(args.tools ?? {}),
    workspace: args.workspace ?? null,
  };
}

function extractTextFromJson(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  for (const key of ['text', 'message', 'content', 'response']) {
    const candidate = extractTextFromJson(record[key]);
    if (candidate) return candidate;
  }
  if (Array.isArray(record.choices)) {
    for (const choice of record.choices) {
      const candidate = extractTextFromJson(choice);
      if (candidate) return candidate;
    }
  }
  if (Array.isArray(record.messages)) {
    for (const message of record.messages) {
      const candidate = extractTextFromJson(message);
      if (candidate) return candidate;
    }
  }
  return null;
}

function extractUsageFromJson(value: unknown): StreamUsage | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const usage = record.usage;
  if (!usage || typeof usage !== 'object') return null;
  const usageRecord = usage as Record<string, unknown>;
  const promptTokens = usageRecord.promptTokens;
  const completionTokens = usageRecord.completionTokens;
  if (typeof promptTokens !== 'number' || typeof completionTokens !== 'number') return null;
  return {
    promptTokens,
    completionTokens,
  };
}

function parseRuntimeResponse(
  raw: string,
  promptText: string,
): { text: string; usage: StreamUsage } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error('[external-runtime] runtime returned no assistant text');
  }

  try {
    const parsed = JSON.parse(trimmed);
    const text = extractTextFromJson(parsed);
    if (!text) {
      throw new Error('[external-runtime] runtime response JSON did not contain assistant text');
    }
    return {
      text,
      usage: extractUsageFromJson(parsed) ?? {
        promptTokens: estimateTokens(promptText),
        completionTokens: estimateTokens(text),
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('[external-runtime]')) {
      throw error;
    }
    return {
      text: trimmed,
      usage: {
        promptTokens: estimateTokens(promptText),
        completionTokens: estimateTokens(trimmed),
      },
    };
  }
}

async function runCommandInvocation(args: {
  command: string;
  workingDirectory: string | null;
  env: Record<string, string>;
  payload: RuntimeInvocationPayload;
  signal?: AbortSignal;
  spawnFn: SpawnLike;
}): Promise<string> {
  if (args.signal?.aborted) {
    throw createAbortError();
  }

  const child = args.spawnFn(args.command, [], {
    cwd: args.workingDirectory ?? undefined,
    env: { ...process.env, ...args.env },
    shell: true,
    windowsHide: true,
  });

  return new Promise<string>((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const cleanup = () => {
      args.signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      child.kill();
      cleanup();
      reject(createAbortError());
    };

    args.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.once('error', (error) => {
      cleanup();
      reject(error);
    });
    child.once('close', (code) => {
      cleanup();
      if (args.signal?.aborted) {
        reject(createAbortError());
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim().length > 0
              ? stderr.trim()
              : `[external-runtime] command exited with code ${code ?? 'unknown'}`,
          ),
        );
        return;
      }
      resolve(stdout);
    });

    child.stdin?.write(JSON.stringify(args.payload));
    child.stdin?.end();
  });
}

function createBashStream(args: {
  command: string;
  workingDirectory: string | null;
  employee: EmployeeRow;
  profile: RuntimeProfile;
  spawnFn: SpawnLike;
  secretsStore: RuntimeSecretReader | undefined;
  userDataDir: string | undefined;
  ensureWorkspaceFn: typeof ensureRuntimeWorkspacePaths;
  lifecycle: RuntimeLifecycleDeps;
}): ProviderStreamFn {
  return async function* (input) {
    const workspace =
      args.userDataDir !== undefined
        ? await args.ensureWorkspaceFn({
            userDataDir: args.userDataDir,
            companySlug: args.employee.companyId,
            employeeId: args.employee.id,
            runtimeKind: args.profile.kind,
            runtimeProfileSlug: args.profile.slug,
          })
        : null;
    const payload = buildInvocationPayload({
      employee: args.employee,
      profile: args.profile,
      system: input.system,
      messages: input.messages,
      maxSteps: input.maxSteps ?? 1,
      tools: input.tools,
      workspace,
    });
    const runtimeEnv = await resolveRuntimeEnvironment({
      config: args.profile.config,
      secrets: args.secretsStore,
    });
    if (workspace) {
      runtimeEnv.TEAM_X_RUNTIME_ROOT = workspace.root;
      runtimeEnv.TEAM_X_RUNTIME_HOME = workspace.home;
      runtimeEnv.TEAM_X_RUNTIME_WORKSPACE = workspace.workspace;
      runtimeEnv.TEAM_X_RUNTIME_LOGS = workspace.logs;
      runtimeEnv.TEAM_X_RUNTIME_TMP = workspace.tmp;
    }
    const lifecycle = startRuntimeLifecycle({
      deps: args.lifecycle,
      employee: args.employee,
      profile: args.profile,
      transport: 'command',
      workspace,
      runId: input.runId,
      threadId: input.threadId,
      currentTicketId: input.currentTicketId,
    });
    try {
      await lifecycle?.heartbeat({ message: 'Runtime execution started.' });
      await lifecycle?.heartbeat({ message: 'Launching command runtime.' });
      const stdout = await runCommandInvocation({
        command: args.command,
        workingDirectory: args.workingDirectory ?? workspace?.workspace ?? null,
        env: runtimeEnv,
        payload,
        signal: input.signal,
        spawnFn: args.spawnFn,
      });
      const result = parseRuntimeResponse(stdout, payload.prompt);
      await lifecycle?.heartbeat({ message: 'Runtime response parsed.', usage: result.usage });
      lifecycle?.recordOutput({ text: result.text, usage: result.usage });
      yield { delta: result.text };
      yield { done: true, usage: result.usage };
      await lifecycle?.complete({ usage: result.usage });
    } catch (error) {
      lifecycle?.fail({ error });
      throw error;
    }
  };
}

function createCommandResolvedProvider(args: {
  command: string;
  workingDirectory: string | null;
  employee: EmployeeRow;
  profile: RuntimeProfile;
  spawnFn: SpawnLike;
  secretsStore: RuntimeSecretReader | undefined;
  userDataDir: string | undefined;
  ensureWorkspaceFn: typeof ensureRuntimeWorkspacePaths;
  lifecycle: RuntimeLifecycleDeps;
}): ExternalRuntimeResolvedProvider {
  return {
    providerName: `runtime:${args.profile.kind}`,
    providerKind: args.profile.kind,
    model: args.profile.slug,
    stream: createBashStream({
      command: args.command,
      workingDirectory: args.workingDirectory,
      employee: args.employee,
      profile: args.profile,
      spawnFn: args.spawnFn,
      secretsStore: args.secretsStore,
      userDataDir: args.userDataDir,
      ensureWorkspaceFn: args.ensureWorkspaceFn,
      lifecycle: args.lifecycle,
    }),
  };
}

function createHttpStream(args: {
  baseUrl: string;
  employee: EmployeeRow;
  profile: RuntimeProfile;
  fetchFn: FetchLike;
  userDataDir: string | undefined;
  ensureWorkspaceFn: typeof ensureRuntimeWorkspacePaths;
  lifecycle: RuntimeLifecycleDeps;
}): ProviderStreamFn {
  return async function* (input) {
    const workspace =
      args.userDataDir !== undefined
        ? await args.ensureWorkspaceFn({
            userDataDir: args.userDataDir,
            companySlug: args.employee.companyId,
            employeeId: args.employee.id,
            runtimeKind: args.profile.kind,
            runtimeProfileSlug: args.profile.slug,
          })
        : null;
    const payload = buildInvocationPayload({
      employee: args.employee,
      profile: args.profile,
      system: input.system,
      messages: input.messages,
      maxSteps: input.maxSteps ?? 1,
      tools: input.tools,
      workspace,
    });
    const lifecycle = startRuntimeLifecycle({
      deps: args.lifecycle,
      employee: args.employee,
      profile: args.profile,
      transport: 'http',
      endpointUrl: args.baseUrl,
      workspace,
      runId: input.runId,
      threadId: input.threadId,
      currentTicketId: input.currentTicketId,
    });
    try {
      await lifecycle?.heartbeat({ message: 'Runtime execution started.' });
      await lifecycle?.heartbeat({ message: 'Posting HTTP runtime request.' });
      const response = await args.fetchFn(args.baseUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-team-x-runtime': payload.version,
        },
        body: JSON.stringify(payload),
        signal: input.signal,
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          body.trim().length > 0
            ? body.trim()
            : `[external-runtime] HTTP adapter returned ${response.status}`,
        );
      }
      const body = await response.text();
      const result = parseRuntimeResponse(body, payload.prompt);
      await lifecycle?.heartbeat({ message: 'Runtime response parsed.', usage: result.usage });
      lifecycle?.recordOutput({ text: result.text, usage: result.usage });
      yield { delta: result.text };
      yield { done: true, usage: result.usage };
      await lifecycle?.complete({ usage: result.usage });
    } catch (error) {
      lifecycle?.fail({ error });
      throw error;
    }
  };
}

function createHttpResolvedProvider(args: {
  baseUrl: string;
  employee: EmployeeRow;
  profile: RuntimeProfile;
  fetchFn: FetchLike;
  userDataDir: string | undefined;
  ensureWorkspaceFn: typeof ensureRuntimeWorkspacePaths;
  lifecycle: RuntimeLifecycleDeps;
}): ExternalRuntimeResolvedProvider {
  return {
    providerName: `runtime:${args.profile.kind}`,
    providerKind: args.profile.kind,
    model: args.profile.slug,
    stream: createHttpStream({
      baseUrl: args.baseUrl,
      employee: args.employee,
      profile: args.profile,
      fetchFn: args.fetchFn,
      userDataDir: args.userDataDir,
      ensureWorkspaceFn: args.ensureWorkspaceFn,
      lifecycle: args.lifecycle,
    }),
  };
}

function getOptionalString(
  config: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = config?.[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createExternalRuntimeAdapters(
  deps: ExternalRuntimeAdaptersDeps = {},
): ExternalRuntimeAdapters {
  const fetchFn = deps.fetchFn ?? fetch;
  const spawnFn = deps.spawnFn ?? spawn;
  const ensureWorkspaceFn = deps.ensureWorkspaceFn ?? ensureRuntimeWorkspacePaths;
  const lifecycle: RuntimeLifecycleDeps = {
    runtimeSessionService: deps.runtimeSessionService,
    ticketCheckoutsRepo: deps.ticketCheckoutsRepo,
    runtimeAuditNormalizer: deps.runtimeAuditNormalizer,
    budgetAdmissionGate: deps.budgetAdmissionGate,
    checkoutLeaseMs: deps.checkoutLeaseMs ?? DEFAULT_CHECKOUT_LEASE_MS,
    now: deps.now ?? Date.now,
  };

  return {
    createResolvedProvider(input) {
      if (!input.profile.enabled) return null;
      const command = getOptionalString(input.profile.config, 'command');
      const workingDirectory = getOptionalString(input.profile.config, 'workingDirectory');
      const baseUrl = getOptionalString(input.profile.config, 'baseUrl');
      const endpointUrl = getOptionalString(input.profile.config, 'endpointUrl');

      switch (input.profile.kind) {
        case 'bash':
          if (!command) return null;
          return createCommandResolvedProvider({
            command,
            workingDirectory,
            employee: input.employee,
            profile: input.profile,
            spawnFn,
            secretsStore: deps.secretsStore,
            userDataDir: deps.userDataDir,
            ensureWorkspaceFn,
            lifecycle,
          });
        case 'http':
          if (!baseUrl) return null;
          return createHttpResolvedProvider({
            baseUrl,
            employee: input.employee,
            profile: input.profile,
            fetchFn,
            userDataDir: deps.userDataDir,
            ensureWorkspaceFn,
            lifecycle,
          });
        case 'codex':
        case 'claude-code':
        case 'cursor':
          if (command) {
            return createCommandResolvedProvider({
              command,
              workingDirectory,
              employee: input.employee,
              profile: input.profile,
              spawnFn,
              secretsStore: deps.secretsStore,
              userDataDir: deps.userDataDir,
              ensureWorkspaceFn,
              lifecycle,
            });
          }
          if (endpointUrl) {
            return createHttpResolvedProvider({
              baseUrl: endpointUrl,
              employee: input.employee,
              profile: input.profile,
              fetchFn,
              userDataDir: deps.userDataDir,
              ensureWorkspaceFn,
              lifecycle,
            });
          }
          return null;
        default:
          return null;
      }
    },
  };
}
