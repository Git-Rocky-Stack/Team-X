import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import type { RuntimeProfile } from '@team-x/shared-types';

import type { EmployeeRow } from '../db/repos/employees.js';
import { createExternalRuntimeAdapters } from './external-runtime-adapters.js';

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn(() => {
    this.emit('close', null, 'SIGTERM');
    return true;
  });
}

function makeEmployee(): EmployeeRow {
  return {
    id: 'employee-1',
    companyId: 'company-1',
    rolePackId: 'strategia-official',
    roleId: 'ceo',
    roleMdSha: 'sha',
    level: 'officer',
    name: 'Iris',
    title: 'CEO',
    status: 'idle',
    modelPref: null,
    providerPref: null,
    toolsAllowedJson: '[]',
    toolsDeniedJson: '[]',
    avatar: null,
    isSystem: false,
    createdAt: 1,
  };
}

function makeProfile(
  kind: RuntimeProfile['kind'],
  config: Record<string, unknown>,
): RuntimeProfile {
  return {
    id: `profile-${kind}`,
    companyId: 'company-1',
    name: `Profile ${kind}`,
    slug: `profile-${kind}`,
    kind,
    enabled: true,
    config,
    lastHealthStatus: 'healthy',
    lastHealthMessage: null,
    lastValidatedAt: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('external runtime adapters', () => {
  it('wraps bash launchers as provider streams and forwards the invocation payload over stdin', async () => {
    const child = new MockChildProcess();
    let stdinPayload = '';
    child.stdin.on('data', (chunk) => {
      stdinPayload += String(chunk);
    });
    const spawnFn = vi.fn(() => {
      queueMicrotask(() => {
        child.stdout.write(
          JSON.stringify({
            text: 'launcher completed',
            usage: { promptTokens: 12, completionTokens: 4 },
          }),
        );
        child.stdout.end();
        child.emit('close', 0, null);
      });
      return child;
    });
    const adapters = createExternalRuntimeAdapters({ spawnFn });
    const resolved = adapters.createResolvedProvider({
      employee: makeEmployee(),
      profile: makeProfile('bash', {
        command: 'C:\\Tools\\runtime.cmd',
        workingDirectory: 'C:\\Workspace',
      }),
    });

    expect(resolved).not.toBeNull();
    if (!resolved) throw new Error('expected bash runtime adapter');

    const chunks = [];
    for await (const chunk of resolved.stream({
      system: 'System directive',
      messages: [{ role: 'user', content: 'Ship the release.' }],
      maxSteps: 3,
      tools: { read_file: {} },
    })) {
      chunks.push(chunk);
    }

    expect(spawnFn).toHaveBeenCalledWith(
      'C:\\Tools\\runtime.cmd',
      [],
      expect.objectContaining({
        cwd: 'C:\\Workspace',
        shell: true,
        windowsHide: true,
      }),
    );
    expect(chunks).toEqual([
      { delta: 'launcher completed' },
      { done: true, usage: { promptTokens: 12, completionTokens: 4 } },
    ]);

    const payload = JSON.parse(stdinPayload);
    expect(payload.version).toBe('team-x-runtime-v1');
    expect(payload.runtimeKind).toBe('bash');
    expect(payload.employee.name).toBe('Iris');
    expect(payload.toolNames).toEqual(['read_file']);
    expect(payload.prompt).toContain('SYSTEM');
    expect(payload.prompt).toContain('Ship the release.');
  });

  it('wraps http runtimes as provider streams and posts the structured invocation payload', async () => {
    const fetchFn: typeof fetch = vi.fn(async (_input, init) => {
      const body = typeof init?.body === 'string' ? init.body : '';
      const payload = JSON.parse(body);
      expect(payload.runtimeKind).toBe('http');
      expect(payload.system).toBe('You are a runtime');
      return new Response(
        JSON.stringify({
          text: 'remote adapter reply',
          usage: { promptTokens: 9, completionTokens: 5 },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });
    const adapters = createExternalRuntimeAdapters({ fetchFn });
    const resolved = adapters.createResolvedProvider({
      employee: makeEmployee(),
      profile: makeProfile('http', {
        baseUrl: 'http://127.0.0.1:8787/runtime',
      }),
    });

    expect(resolved).not.toBeNull();
    if (!resolved) throw new Error('expected http runtime adapter');

    const chunks = [];
    for await (const chunk of resolved.stream({
      system: 'You are a runtime',
      messages: [{ role: 'user', content: 'Summarize the launch.' }],
    })) {
      chunks.push(chunk);
    }

    expect(fetchFn).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/runtime',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-team-x-runtime': 'team-x-runtime-v1',
        }),
      }),
    );
    expect(chunks).toEqual([
      { delta: 'remote adapter reply' },
      { done: true, usage: { promptTokens: 9, completionTokens: 5 } },
    ]);
  });

  it('treats codex-style launcher profiles as execution-backed command adapters when configured', async () => {
    const child = new MockChildProcess();
    const spawnFn = vi.fn(() => {
      queueMicrotask(() => {
        child.stdout.write('codex adapter reply');
        child.stdout.end();
        child.emit('close', 0, null);
      });
      return child;
    });
    const adapters = createExternalRuntimeAdapters({ spawnFn });
    const resolved = adapters.createResolvedProvider({
      employee: makeEmployee(),
      profile: makeProfile('codex', {
        command: 'codex',
      }),
    });

    expect(resolved).not.toBeNull();
    expect(resolved?.providerName).toBe('runtime:codex');
    expect(resolved?.providerKind).toBe('codex');
    if (!resolved) throw new Error('expected codex runtime adapter');

    const chunks = [];
    for await (const chunk of resolved.stream({
      system: 'You are Codex',
      messages: [{ role: 'user', content: 'Review the diff.' }],
    })) {
      chunks.push(chunk);
    }

    expect(spawnFn).toHaveBeenCalledWith(
      'codex',
      [],
      expect.objectContaining({
        shell: true,
        windowsHide: true,
      }),
    );
    expect(chunks).toEqual([
      { delta: 'codex adapter reply' },
      {
        done: true,
        usage: {
          promptTokens: expect.any(Number),
          completionTokens: expect.any(Number),
        },
      },
    ]);
  });

  it('injects managed workspace paths and secret-ref env into command runtimes', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'teamx-external-runtime-'));
    const child = new MockChildProcess();
    let stdinPayload = '';
    let spawnOptions: { cwd?: string; env?: NodeJS.ProcessEnv } | undefined;
    child.stdin.on('data', (chunk) => {
      stdinPayload += String(chunk);
    });
    const spawnFn = vi.fn((_command, _args, options) => {
      spawnOptions = options as { cwd?: string; env?: NodeJS.ProcessEnv };
      queueMicrotask(() => {
        child.stdout.write('workspace ready');
        child.stdout.end();
        child.emit('close', 0, null);
      });
      return child;
    });
    const secretsStore = {
      getApiKey: vi.fn(async (providerId: string) =>
        providerId === 'anthropic' ? 'sk-ant-safe' : null,
      ),
    };

    try {
      const adapters = createExternalRuntimeAdapters({
        spawnFn,
        secretsStore,
        userDataDir: tempDir,
      });
      const resolved = adapters.createResolvedProvider({
        employee: makeEmployee(),
        profile: makeProfile('codex', {
          command: 'codex',
          env: {
            ANTHROPIC_API_KEY: {
              type: 'secret_ref',
              providerId: 'anthropic',
              key: 'apiKey',
              version: 'latest',
            },
            TEAM_X_MODE: 'autonomous',
          },
        }),
      });

      if (!resolved) throw new Error('expected codex runtime adapter');
      const chunks = [];
      for await (const chunk of resolved.stream({
        system: 'You are Codex',
        messages: [{ role: 'user', content: 'Work in the isolated runtime workspace.' }],
      })) {
        chunks.push(chunk);
      }

      const expectedRoot = join(
        tempDir,
        'companies',
        'company-1',
        'runtimes',
        'employee-1',
        'profile-codex',
      );
      expect(spawnOptions?.cwd).toBe(join(expectedRoot, 'workspace'));
      expect(spawnOptions?.env?.ANTHROPIC_API_KEY).toBe('sk-ant-safe');
      expect(spawnOptions?.env?.TEAM_X_MODE).toBe('autonomous');
      expect(spawnOptions?.env?.TEAM_X_RUNTIME_HOME).toBe(join(expectedRoot, 'home'));
      expect(secretsStore.getApiKey).toHaveBeenCalledWith('anthropic');

      const payload = JSON.parse(stdinPayload);
      expect(payload.workspace).toEqual(
        expect.objectContaining({
          root: expectedRoot,
          home: join(expectedRoot, 'home'),
          workspace: join(expectedRoot, 'workspace'),
        }),
      );
      expect(JSON.stringify(payload)).not.toContain('sk-ant-safe');
      expect(chunks).toEqual([
        { delta: 'workspace ready' },
        {
          done: true,
          usage: {
            promptTokens: expect.any(Number),
            completionTokens: expect.any(Number),
          },
        },
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('records runtime session heartbeats and releases ticket checkouts for command runtimes', async () => {
    const child = new MockChildProcess();
    const spawnFn = vi.fn(() => {
      queueMicrotask(() => {
        child.stdout.write(
          JSON.stringify({
            text: 'checkout work completed',
            usage: { promptTokens: 7, completionTokens: 3 },
          }),
        );
        child.stdout.end();
        child.emit('close', 0, null);
      });
      return child;
    });
    const runtimeSessionService = {
      start: vi.fn((input) => ({ id: 'session-1', ...input })),
      heartbeat: vi.fn(),
      end: vi.fn(),
    };
    const ticketCheckoutsRepo = {
      claim: vi.fn(() => ({
        outcome: 'claimed',
        checkout: { id: 'checkout-1' },
      })),
      heartbeat: vi.fn(),
      release: vi.fn(),
    };
    let now = 1_000;
    const adapters = createExternalRuntimeAdapters({
      spawnFn,
      runtimeSessionService: runtimeSessionService as never,
      ticketCheckoutsRepo: ticketCheckoutsRepo as never,
      checkoutLeaseMs: 60_000,
      now: () => {
        now += 10;
        return now;
      },
    });
    const resolved = adapters.createResolvedProvider({
      employee: makeEmployee(),
      profile: makeProfile('bash', {
        command: 'C:\\Tools\\runtime.cmd',
        workingDirectory: 'C:\\Workspace',
      }),
    });

    if (!resolved) throw new Error('expected bash runtime adapter');
    const chunks = [];
    for await (const chunk of resolved.stream({
      system: 'Work the ticket',
      messages: [{ role: 'user', content: 'Finish ticket.' }],
      runId: 'run-1',
      currentTicketId: 'ticket-1',
    })) {
      chunks.push(chunk);
    }

    expect(runtimeSessionService.start).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        employeeId: 'employee-1',
        runtimeProfileId: 'profile-bash',
        adapterKind: 'bash',
        currentRunId: 'run-1',
        currentTicketId: 'ticket-1',
        workspacePath: null,
        leaseExpiresAt: expect.any(Number),
      }),
    );
    expect(ticketCheckoutsRepo.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        ticketId: 'ticket-1',
        employeeId: 'employee-1',
        runtimeSessionId: 'session-1',
        runId: 'run-1',
        expiresAt: expect.any(Number),
      }),
    );
    expect(runtimeSessionService.heartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        status: 'working',
        currentRunId: 'run-1',
        currentTicketId: 'ticket-1',
        message: 'Runtime response parsed.',
        costDeltaJson: JSON.stringify({ promptTokens: 7, completionTokens: 3 }),
      }),
    );
    expect(ticketCheckoutsRepo.release).toHaveBeenCalledWith(
      expect.objectContaining({
        checkoutId: 'checkout-1',
        status: 'completed',
        releaseReason: 'runtime execution completed',
      }),
    );
    expect(runtimeSessionService.end).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ status: 'ended' }),
    );
    expect(chunks).toEqual([
      { delta: 'checkout work completed' },
      { done: true, usage: { promptTokens: 7, completionTokens: 3 } },
    ]);
  });

  it('blocks runtime execution before launch when another active checkout owns the ticket', async () => {
    const spawnFn = vi.fn(() => new MockChildProcess());
    const runtimeSessionService = {
      start: vi.fn((input) => ({ id: 'session-1', ...input })),
      heartbeat: vi.fn(),
      end: vi.fn(),
    };
    const ticketCheckoutsRepo = {
      claim: vi.fn(() => ({
        outcome: 'conflict',
        conflictingCheckout: {
          id: 'checkout-conflict',
          employeeId: 'employee-2',
        },
      })),
      heartbeat: vi.fn(),
      release: vi.fn(),
    };
    const adapters = createExternalRuntimeAdapters({
      spawnFn,
      runtimeSessionService: runtimeSessionService as never,
      ticketCheckoutsRepo: ticketCheckoutsRepo as never,
    });
    const resolved = adapters.createResolvedProvider({
      employee: makeEmployee(),
      profile: makeProfile('bash', {
        command: 'C:\\Tools\\runtime.cmd',
      }),
    });

    if (!resolved) throw new Error('expected bash runtime adapter');
    const drainRuntime = async () => {
      for await (const chunk of resolved.stream({
        system: 'Work the ticket',
        messages: [{ role: 'user', content: 'Finish ticket.' }],
        runId: 'run-1',
        currentTicketId: 'ticket-1',
      })) {
        expect(chunk).toBeDefined();
      }
    };
    await expect(drainRuntime()).rejects.toThrow(/already checked out/);

    expect(spawnFn).not.toHaveBeenCalled();
    expect(runtimeSessionService.heartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        status: 'blocked',
        currentRunId: 'run-1',
        currentTicketId: 'ticket-1',
      }),
    );
    expect(runtimeSessionService.end).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ status: 'blocked' }),
    );
    expect(ticketCheckoutsRepo.release).not.toHaveBeenCalled();
  });

  it('stops runtime execution at heartbeat when the budget gate hard-blocks work', async () => {
    const spawnFn = vi.fn(() => new MockChildProcess());
    const runtimeSessionService = {
      start: vi.fn((input) => ({ id: 'session-1', ...input })),
      heartbeat: vi.fn(),
      end: vi.fn(),
    };
    const ticketCheckoutsRepo = {
      claim: vi.fn(() => ({
        outcome: 'claimed',
        checkout: { id: 'checkout-1' },
      })),
      heartbeat: vi.fn(),
      release: vi.fn(),
    };
    const budgetAdmissionGate = {
      assertExecutionAllowed: vi.fn(async () => ({
        allowed: false,
        policy: {
          id: 'budget-1',
          scopeKind: 'runtime-profile',
          scopeRefId: 'profile-bash',
        },
        reason: 'Budget cap reached for runtime-profile scope profile-bash.',
        approvalItem: null,
      })),
    };
    const adapters = createExternalRuntimeAdapters({
      spawnFn,
      runtimeSessionService: runtimeSessionService as never,
      ticketCheckoutsRepo: ticketCheckoutsRepo as never,
      budgetAdmissionGate,
    });
    const resolved = adapters.createResolvedProvider({
      employee: makeEmployee(),
      profile: makeProfile('bash', {
        command: 'C:\\Tools\\runtime.cmd',
      }),
    });

    if (!resolved) throw new Error('expected bash runtime adapter');
    const drainRuntime = async () => {
      for await (const chunk of resolved.stream({
        system: 'Work the ticket',
        messages: [{ role: 'user', content: 'Finish ticket.' }],
        runId: 'run-1',
        currentTicketId: 'ticket-1',
      })) {
        expect(chunk).toBeDefined();
      }
    };
    await expect(drainRuntime()).rejects.toThrow(/runtime-budget.*Budget cap reached/);

    expect(budgetAdmissionGate.assertExecutionAllowed).toHaveBeenCalledWith({
      companyId: 'company-1',
      employeeId: 'employee-1',
      executionKind: 'agentic',
    });
    expect(spawnFn).not.toHaveBeenCalled();
    expect(ticketCheckoutsRepo.release).toHaveBeenCalledWith(
      expect.objectContaining({
        checkoutId: 'checkout-1',
        status: 'blocked',
        releaseReason:
          '[runtime-budget] Budget cap reached for runtime-profile scope profile-bash.',
      }),
    );
    expect(runtimeSessionService.end).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        status: 'blocked',
        failureReason:
          '[runtime-budget] Budget cap reached for runtime-profile scope profile-bash.',
      }),
    );
  });

  it('treats cursor-style endpoint profiles as execution-backed HTTP adapters when configured', async () => {
    const fetchFn: typeof fetch = vi.fn(async (_input, init) => {
      const body = typeof init?.body === 'string' ? init.body : '';
      const payload = JSON.parse(body);
      expect(payload.runtimeKind).toBe('cursor');
      return new Response(
        JSON.stringify({
          text: 'cursor endpoint reply',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });
    const adapters = createExternalRuntimeAdapters({ fetchFn });
    const resolved = adapters.createResolvedProvider({
      employee: makeEmployee(),
      profile: makeProfile('cursor', {
        endpointUrl: 'http://127.0.0.1:8787/cursor',
      }),
    });

    expect(resolved).not.toBeNull();
    expect(resolved?.providerName).toBe('runtime:cursor');
    expect(resolved?.providerKind).toBe('cursor');
    if (!resolved) throw new Error('expected cursor runtime adapter');

    const chunks = [];
    for await (const chunk of resolved.stream({
      system: 'You are Cursor',
      messages: [{ role: 'user', content: 'Plan the refactor.' }],
    })) {
      chunks.push(chunk);
    }

    expect(fetchFn).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/cursor',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(chunks).toEqual([
      { delta: 'cursor endpoint reply' },
      {
        done: true,
        usage: {
          promptTokens: expect.any(Number),
          completionTokens: expect.any(Number),
        },
      },
    ]);
  });
});
